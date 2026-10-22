import type { Signal, Source } from "./types.ts";

/**
 * The file source: reads a cases.json text into a Source. Never throws; anything it
 * cannot use becomes an error, so a bad file still yields a result.json.
 */
export function fileSource(text: string): Source {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { signals: [], bannedWords: [], errors: ["input is not valid JSON"] };
  }
  if (!isObject(parsed)) {
    return { signals: [], bannedWords: [], errors: ["input must be a JSON object"] };
  }

  const errors: string[] = [];
  const signals: Signal[] = [];
  if (!Array.isArray(parsed.signals)) {
    errors.push("input has no signals list");
  } else {
    parsed.signals.forEach((raw, index) => {
      if (!isObject(raw) || typeof raw.id !== "string" || raw.id === "") {
        errors.push(`signal at position ${index} has no id and was not read`);
        return;
      }
      signals.push({ ...raw, id: raw.id, type: typeof raw.type === "string" ? raw.type : "" });
    });
  }

  const brand = isObject(parsed.brand) ? parsed.brand : {};
  const bannedWords = Array.isArray(brand.banned_words)
    ? brand.banned_words.filter((word): word is string => typeof word === "string" && word !== "")
    : [];

  return { signals, bannedWords, errors };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
