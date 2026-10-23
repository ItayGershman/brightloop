import type { RunInput, Signal } from "../domain/types.ts";
import { CODE_MARKERS } from "../text/markers.ts";
import { CREDENTIAL_KEY, PRINTABLE_WITHOUT_SPACES } from "../text/patterns.ts";
import { isTimeZone, readTimestamp } from "../text/zoned-time.ts";

/**
 * Reads a cases.json text into the run input. Never throws; anything it
 * cannot use becomes an error, so a bad file still yields a result.json. Errors point at
 * a signal by its position, never by its raw id: an id is outside text too.
 */
export function parseCasesFile(text: string): RunInput {
  if (text.trim() === "") return inputWithError("input is empty");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return inputWithError("input is not valid JSON");
  }
  if (!isObject(parsed)) return inputWithError("input must be a JSON object");

  const errors: string[] = [];
  const secrets = secretValues(parsed.config);
  const timezone = readTimeZone(parsed.timezone, errors);
  const signals: Signal[] = [];
  const seen = new Set<string>();
  if (!Array.isArray(parsed.signals)) {
    errors.push("input has no signals list");
  } else {
    parsed.signals.forEach((raw, index) => {
      const position = `signal ${index + 1}`;
      if (!isObject(raw) || typeof raw.id !== "string" || raw.id.trim() === "") {
        errors.push(`${position} has no id and was not read`);
      } else if (!usableId(raw.id, secrets)) {
        errors.push(`${position} has an id that cannot be written to the output and was not read`);
      } else if (seen.has(raw.id)) {
        errors.push(`${position} repeats the id of an earlier signal; only the first was judged`);
      } else {
        seen.add(raw.id);
        const utc = readTimestamp(raw.ts, timezone);
        if (raw.ts !== undefined && !utc) {
          errors.push(`${position} has a time (ts) that cannot be read; it was judged without one`);
        }
        signals.push({ ...raw, id: raw.id, type: typeof raw.type === "string" ? raw.type : "", utc });
      }
    });
  }

  const brand = isObject(parsed.brand) ? parsed.brand : {};
  const bannedWords = Array.isArray(brand.banned_words)
    ? brand.banned_words.filter((word): word is string => typeof word === "string" && word.trim() !== "")
    : [];
  if (brand.banned_words !== undefined && !Array.isArray(brand.banned_words)) {
    errors.push("input brand.banned_words is not a list; no brand words were checked");
  }

  return { signals, bannedWords, secrets, timezone, errors };
}

/** The input's time zone; UTC when it names none (missing or null), and when it names one Intl does not know. */
function readTimeZone(value: unknown, errors: string[]): string {
  if (value === undefined || value === null) return "UTC";
  if (typeof value === "string" && isTimeZone(value)) return value;
  errors.push("input timezone is not a known time zone; weeks are counted in UTC");
  return "UTC";
}

/** An id lands in the output as is, so it must be short, printable, without spaces, and carry nothing forbidden. */
function usableId(id: string, secrets: string[]): boolean {
  return (
    id.length <= 100 &&
    id === id.trim() &&
    PRINTABLE_WITHOUT_SPACES.test(id) &&
    !CODE_MARKERS.some((marker) => id.includes(marker)) &&
    !secrets.some((secret) => id.includes(secret))
  );
}

/** Config values whose key names a credential (key, token, secret, password). */
function secretValues(config: unknown): string[] {
  if (!isObject(config)) return [];
  return Object.entries(config)
    .filter(([key, value]) => CREDENTIAL_KEY.test(key) && typeof value === "string" && value.length >= 4)
    .map(([, value]) => value as string);
}

/** A run input with no signals and one problem, for input that could not be read at all. */
export function inputWithError(error: string): RunInput {
  return { signals: [], bannedWords: [], secrets: [], timezone: "UTC", errors: [error] };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
