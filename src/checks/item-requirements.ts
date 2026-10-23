import { brokenRules, isNonEmptyString, type FieldRule } from "./rules.ts";

/** An http(s) URL with no whitespace in it. */
const HTTP_LINK = /^https?:\/\/\S+$/;

/** What every item needs before the audience sees it. */
const ITEM_RULES: FieldRule[] = [
  { field: "id", test: isNonEmptyString, problem: "no id" },
  { field: "source_ids", test: isListOfIds, problem: "no source ids" },
  { field: "confidence", test: isBetweenZeroAndOne, problem: "confidence is not between 0 and 1" },
  { field: "action", test: isNonEmptyString, problem: "no action" },
  { field: "why", test: isNonEmptyString, problem: "no why" },
  { field: "link", test: isHttpLink, problem: "no link to the competitor's page" },
  { field: "cta", test: isNonEmptyString, problem: "no call to action" },
];

export function itemRequirements(item: Record<string, unknown>): string[] {
  return brokenRules(item, ITEM_RULES);
}

function isListOfIds(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0 && value.every(isNonEmptyString);
}

function isBetweenZeroAndOne(value: unknown): boolean {
  return typeof value === "number" && value >= 0 && value <= 1;
}

function isHttpLink(value: unknown): boolean {
  return isNonEmptyString(value) && HTTP_LINK.test(value);
}
