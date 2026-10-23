import type { Item, RunInput } from "../domain/types.ts";
import { isoWeek } from "../text/zoned-time.ts";

/**
 * For one run input: the ISO week each item was seen in, in the input's time zone, from the
 * first of its signals with a readable time; null when none has one.
 */
export function itemWeeks(input: RunInput): (item: Item) => string | null {
  const moments = new Map(input.signals.map((signal) => [signal.id, signal.utc]));
  return (item) => {
    const moment = item.source_ids.map((id) => moments.get(id)).find((utc) => utc !== undefined);
    return moment ? isoWeek(moment, input.timezone) : null;
  };
}
