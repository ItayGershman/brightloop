import escapeRegExp from "lodash/escapeRegExp.js";
import { isRecord } from "./rules.ts";

/** True if any string anywhere in the value contains a banned word as a whole word, any case. */
export function containsBannedWord(value: unknown, bannedWords: string[]): boolean {
  if (bannedWords.length === 0) return false;
  const patterns = bannedWords.map(wholeWordPattern);
  return strings(value).some((text) => patterns.some((pattern) => pattern.test(text)));
}

/** Matches the word literally, between word boundaries, ignoring case. */
function wholeWordPattern(word: string): RegExp {
  return new RegExp(`\\b${escapeRegExp(word)}\\b`, "i");
}

function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (isRecord(value)) return Object.values(value).flatMap(strings);
  return [];
}
