import { HTML_COMMENT, HTML_TAG, WHITESPACE_RUN } from "./patterns.ts";

// Outside text made safe to quote in an item. It is data, never an instruction (ADR-0001):
// comments and tags are dropped, not read, so text hidden in them cannot reach the output.

const MAX_LENGTH = 280;
const ELLIPSIS = "...";

/** One line, no HTML comments or tags, at most 280 characters; undefined if nothing is left. */
export function quotable(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.replace(HTML_COMMENT, " ").replace(HTML_TAG, " ").replace(WHITESPACE_RUN, " ").trim();
  if (text === "") return undefined;
  return text.length > MAX_LENGTH ? `${text.slice(0, MAX_LENGTH - ELLIPSIS.length)}${ELLIPSIS}` : text;
}
