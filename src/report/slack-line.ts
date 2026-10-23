import { AUDIENCE } from "../config/audience.ts";
import { findCompetitor } from "../config/competitors.ts";
import type { Item, Result } from "../domain/types.ts";
import { RESPOND_NOW } from "../judging/advice.ts";
import { BASELINE_ACTION } from "../judging/baseline.ts";

// The one line the audience's meeting sees in Slack, in the audience's own style ("deck for
// 11:00, one pricing change flagged"). Built from counts, actions and registered competitor
// names only: no outside text, no confidence score, no price, so nothing quoted can reach the channel.

/** How a confidence label starts when the source or the promotion check is not settled (source-trust.ts, pricing-item.ts). */
const UNCONFIRMED = "unconfirmed";

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
  if (problems > 0) parts.push(problemsPart(problems, parts.length > 0));
  const summary = parts.length > 0 ? parts.join("; ") : "nothing moved since the last check";
  return `pricing watch for ${AUDIENCE.meetingTime}: ${summary}. details: ${detailsUrl}`;
}

function changesPart(changes: Item[]): string {
  const who = names(changes);
  const unconfirmed = changes.filter((item) => item.confidence_label.startsWith(UNCONFIRMED)).length;
  const respondNow = changes.filter((item) => item.action.startsWith(RESPOND_NOW)).length;
  return [
    `${changes.length === 1 ? "one pricing change" : `${changes.length} pricing changes`} flagged${who ? ` (${who})` : ""}`,
    ...(unconfirmed > 0 ? [changes.length === 1 ? "still unconfirmed" : `${unconfirmed} still unconfirmed`] : []),
    responsePart(respondNow, changes.length),
  ].join(", ");
}

function responsePart(respondNow: number, changes: number): string {
  if (respondNow === 0) return "no response needed yet";
  if (changes === 1) return "it needs a response now";
  return `${respondNow === 1 ? "one needs" : `${respondNow} need`} a response now`;
}

/** A run with errors never reads as an all-clear: a page may not have been read, or an item held back. */
function problemsPart(problems: number, saidSomething: boolean): string {
  const count = problems === 1 ? "one problem" : `${problems} problems`;
  return saidSomething
    ? `${count} in the run, so it may not be everything`
    : `nothing to report, but the run hit ${count}, so this is not the all-clear`;
}

/** The registered competitors among the items, in order of first mention: "Lovable, Replit and Bolt". */
function names(items: Item[]): string {
  const known = [...new Set(items.map((item) => findCompetitor(item.competitor)?.name).filter((name) => name !== undefined))];
  return known.length <= 1 ? (known[0] ?? "") : `${known.slice(0, -1).join(", ")} and ${known.at(-1)}`;
}
