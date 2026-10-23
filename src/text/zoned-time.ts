import { TIMESTAMP, UTC_NAME, UTC_OFFSET } from "./patterns.ts";

// Times in a named time zone, with the zone rules from Intl (the IANA database), never a
// fixed offset: Asia/Jerusalem is UTC+3 until 02:00 on 25 October 2026 and UTC+2 after.

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** Whether Intl knows the zone, e.g. "Asia/Jerusalem". */
export function isTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/**
 * A signal's ts as a UTC moment, or undefined when it cannot be read. A ts with no zone is
 * read as local time in the given zone; a local time that happens twice (the hour repeated
 * when clocks go back) is the first of the two, and one that never happens (the hour skipped
 * when clocks go forward) is read with the offset from before the change.
 */
export function readTimestamp(ts: unknown, zone: string): Date | undefined {
  if (typeof ts !== "string") return undefined;
  const match = TIMESTAMP.exec(ts.trim());
  if (!match) return undefined;
  const [year, month, day, hour, minute, second = "0", fraction = "0", stated] = match.slice(1);
  const fields = [year, month, day, hour, minute, second].map(Number);
  const ms = Number(fraction.padEnd(3, "0").slice(0, 3));
  const asUtc = Date.UTC(fields[0], fields[1] - 1, fields[2], fields[3], fields[4], fields[5], ms);
  if (!sameFields(new Date(asUtc), fields)) return undefined;

  if (stated === undefined) return new Date(localToUtc(asUtc, zone));
  const offset = statedOffset(stated);
  return offset === undefined ? undefined : new Date(asUtc - offset);
}

/** The ISO 8601 week ("2026-W43") that a moment falls in, by the calendar of the given zone. */
export function isoWeek(moment: Date, zone: string): string {
  const local = new Date(moment.getTime() + offsetAt(moment.getTime(), zone));
  // The ISO week belongs to the year of its Thursday.
  const weekday = (local.getUTCDay() + 6) % 7;
  const thursday = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - weekday + 3);
  const year = new Date(thursday).getUTCFullYear();
  const week = Math.floor((thursday - Date.UTC(year, 0, 1)) / (7 * DAY)) + 1;
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/** How far the zone's clock is ahead of UTC at a moment, in milliseconds. */
function offsetAt(time: number, zone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(new Date(time));
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
  const wall = Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"), part("second"));
  return wall - Math.floor(time / 1000) * 1000;
}

/** The UTC moment of a wall-clock time in a zone, given as if that wall clock were UTC. */
function localToUtc(wall: number, zone: string): number {
  const before = offsetAt(wall - DAY, zone);
  const after = offsetAt(wall + DAY, zone);
  const fits = [...new Set([before, after])]
    .map((offset) => wall - offset)
    .filter((time) => offsetAt(time, zone) === wall - time)
    .sort((a, b) => a - b);
  return fits[0] ?? wall - before;
}

function statedOffset(zone: string): number | undefined {
  if (UTC_NAME.test(zone)) return 0;
  const match = UTC_OFFSET.exec(zone);
  if (!match) return undefined;
  const [sign, hours, minutes = "0"] = match.slice(1);
  if (Number(hours) > 14 || Number(minutes) > 59) return undefined;
  return (sign === "-" ? -1 : 1) * (Number(hours) * HOUR + Number(minutes) * 60 * 1000);
}

/** Whether a date built from the fields kept them, so "2026-02-30" is rejected. */
function sameFields(date: Date, [year, month, day, hour, minute, second]: number[]): boolean {
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day &&
    date.getUTCHours() === hour &&
    date.getUTCMinutes() === minute &&
    date.getUTCSeconds() === second
  );
}
