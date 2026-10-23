import { AUDIENCE } from "../config/audience.ts";

// The scheduled run starts at 08:30 Monday in the audience's time zone, when the deck work
// starts. GitHub schedules are in UTC and Israel changes clocks, so the workflow fires at both
// 05:30 and 06:30 UTC on Mondays and this gate lets through only the one that is 08:xx locally.
// Its only import is plain data, so the workflow runs it with Node's own TypeScript support
// before anything is installed.

/** The local hour the scheduled run belongs to, in the audience's time zone. */
export const SCHEDULED_HOUR = 8;

/** What started a workflow run: the event name and, for a schedule, the cron line that fired. */
export interface Trigger {
  event: string;
  cron?: string;
}

/** The hour of the day (0 to 23) on the zone's wall clock at a moment. */
export function localHour(moment: Date, zone: string): number {
  const hour = new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", hour: "numeric" })
    .formatToParts(moment)
    .find((part) => part.type === "hour")?.value;
  return Number(hour);
}

/**
 * Whether a workflow run should go ahead. A manual run always does. A scheduled one does only
 * when the moment its cron line was due is 08:xx in the zone, so exactly one of the two Monday
 * entries runs even when GitHub starts it late. Without a readable cron line, the start time
 * stands in for the due moment.
 */
export function shouldRun(trigger: Trigger, startedAt: Date, zone: string = AUDIENCE.timezone): boolean {
  if (trigger.event !== "schedule") return true;
  return localHour(dueMoment(trigger.cron, startedAt) ?? startedAt, zone) === SCHEDULED_HOUR;
}

/** The cron line's UTC hour and minute on the UTC day the run started. */
function dueMoment(cron: string | undefined, startedAt: Date): Date | undefined {
  const match = /^(\d{1,2}) (\d{1,2}) /.exec(cron ?? "");
  if (!match) return undefined;
  const [minute, hour] = [Number(match[1]), Number(match[2])];
  return new Date(Date.UTC(startedAt.getUTCFullYear(), startedAt.getUTCMonth(), startedAt.getUTCDate(), hour, minute));
}
