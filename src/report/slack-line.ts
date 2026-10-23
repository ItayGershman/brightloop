import { AUDIENCE } from "../config/audience.ts";
import { findCompetitor } from "../config/competitors.ts";
import type { Item, Result } from "../domain/types.ts";

// The one line leadership sees in Slack, in the audience's own style ("deck for 11:00, one
// pricing change flagged"). Built from counts, actions and registered competitor names only:
// no outside text, no confidence score, no price, so nothing quoted can reach the channel.

const BASELINE_ACTION = "no action, baseline recorded";

export function slackLine(result: Result, detailsUrl: string): string {
  const baselines = result.items.filter((item) => item.action === BASELINE_ACTION);
  const changes = result.items.filter((item) => item.action !== BASELINE_ACTION);
  const problems = result.run.errors.length;

  const parts: string[] = [];
  if (changes.length > 0) parts.push(changesPart(changes));
  if (baselines.length > 0) {
    const firstLook = `first look recorded for ${names(baselines) || "the watched pages"}`;
    parts.push(changes.length > 0 ? firstLook : `${firstLook}, nothing to compare yet`);
  }
  if (problems > 0) {
    parts.push(
      parts.length > 0
        ? `${count(problems, "problem")} in the run, so it may not be everything`
        : `no change found in what was read, but ${problems === 1 ? "one problem" : `${problems} problems`} stopped part of the run, so this is not the all-clear`,
    );
  }
  const summary = parts.length > 0 ? parts.join("; ") : "nothing moved since last week";
  return `pricing watch for ${AUDIENCE.meeting}: ${summary}. details: ${detailsUrl}`;
}

function changesPart(changes: Item[]): string {
  const who = names(changes);
  const flagged = `${changes.length === 1 ? "one pricing change" : `${changes.length} pricing changes`} flagged${who ? ` (${who})` : ""}`;
  const unconfirmed = changes.filter((item) => item.confidence_label.startsWith("unconfirmed")).length;
  const respondNow = changes.filter((item) => item.action.startsWith("respond now")).length;
  return [
    flagged,
    ...(unconfirmed > 0 ? [changes.length === 1 ? "still unconfirmed" : `${unconfirmed} still unconfirmed`] : []),
    respondNow === 0
      ? "no response needed yet"
      : changes.length === 1
        ? "it needs a response now"
        : `${respondNow === 1 ? "one needs" : `${respondNow} need`} a response now`,
  ].join(", ");
}

/** The registered competitors among the items, in order of first mention: "Lovable, Replit and Bolt". */
function names(items: Item[]): string {
  const known = [...new Set(items.map((item) => findCompetitor(item.competitor)?.name).filter((name) => name !== undefined))];
  return known.length <= 1 ? (known[0] ?? "") : `${known.slice(0, -1).join(", ")} and ${known.at(-1)}`;
}

function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}
