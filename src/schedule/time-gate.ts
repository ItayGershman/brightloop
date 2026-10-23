import { AUDIENCE } from "../config/audience.ts";

// The scheduled run starts at 08:30 Monday, Jerusalem time, when Maya starts on the deck.
// GitHub schedules are in UTC and Israel changes clocks, so the workflow fires at both 05:30
// and 06:30 UTC on Mondays and this gate lets through only the one that is 08:xx locally.
// Its only import is plain data, so the workflow runs it with Node's own TypeScript support
// before anything is installed.

/** The local hour the scheduled run belongs to, in the audience's time zone. */
export const SCHEDULED_HOUR = 8;

/** The hour of the day (0 to 23) on the zone's wall clock at a moment. */
export function localHour(moment: Date, zone: string): number {
  const hour = new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", hour: "numeric" })
    .formatToParts(moment)
    .find((part) => part.type === "hour")?.value;
  return Number(hour);
}

/**
 * Whether a workflow run should go ahead. A manual run always does; a scheduled one only
 * when it is 08:xx in the audience's time zone, so exactly one of the two Monday entries runs.
 */
export function shouldRun(event: string, now: Date, zone: string = AUDIENCE.timezone): boolean {
  if (event !== "schedule") return true;
  return localHour(now, zone) === SCHEDULED_HOUR;
}
