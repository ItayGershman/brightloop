import { AUDIENCE } from "../config/audience.ts";
import type { Signal, Snapshot } from "../domain/types.ts";
import { readTimestamp } from "../text/zoned-time.ts";

/** What every signal made from a snapshot says about where and when it was seen. */
export function snapshotFields(snapshot: Snapshot): Omit<Signal, "id" | "type"> {
  return {
    competitor: snapshot.competitor,
    page: snapshot.page,
    source: snapshot.url,
    ts: snapshot.captured_at,
    utc: readTimestamp(snapshot.captured_at, AUDIENCE.timezone),
  };
}
