import _ from "lodash";

// The shape every requirement table shares: a named rule per field, so adding a requirement
// is adding a row.

/** One requirement on one field: if `test` fails on the field's value, `problem` is reported. */
export interface FieldRule {
  field: string;
  test: (value: unknown) => boolean;
  /** Names the problem, never the value: outside text must not reach the output this way. */
  problem: string;
}

/** The problems of every rule the record breaks, in table order. */
export function brokenRules(record: Record<string, unknown>, rules: FieldRule[]): string[] {
  return rules.filter((rule) => !rule.test(record[rule.field])).map((rule) => rule.problem);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return _.isPlainObject(value);
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}
