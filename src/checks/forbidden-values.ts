import { OUTPUT_MARKER } from "../text/markers.ts";

/** A value that must never be written, looked for in the JSON text of whatever is checked. */
interface ForbiddenValue {
  problem: string;
  foundIn: (json: string, secrets: string[]) => boolean;
}

const FORBIDDEN_VALUES: ForbiddenValue[] = [
  { problem: "contains a forbidden marker", foundIn: (json) => json.includes(OUTPUT_MARKER) },
  {
    problem: "contains a secret-like config value",
    foundIn: (json, secrets) => secrets.some((secret) => json.includes(asJsonText(secret))),
  },
];

/** The marker and secret-like values are forbidden anywhere, ids and errors included. */
export function forbiddenValues(value: unknown, secrets: string[]): string[] {
  const json = JSON.stringify(value) ?? "";
  return FORBIDDEN_VALUES.filter((forbidden) => forbidden.foundIn(json, secrets)).map((forbidden) => forbidden.problem);
}

/** How a string looks inside JSON text: escaped, without its quotes. */
function asJsonText(text: string): string {
  return JSON.stringify(text).slice(1, -1);
}
