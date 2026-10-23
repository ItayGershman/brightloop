import { appendFileSync } from "node:fs";
import { AUDIENCE } from "../src/config/audience.ts";
import { SCHEDULED_HOUR, shouldRun } from "../src/schedule/time-gate.ts";

// The first job of the scheduled-run workflow: writes run=true or run=false to the job's
// outputs. Runs with plain Node (24 or later strips the types), before npm ci.
// Reads GITHUB_EVENT_NAME (set by GitHub) and SCHEDULE (the cron line that fired, if any).
// Usage: node scripts/schedule-gate.ts [<ISO time, for tests>]

const now = process.argv[2] ? new Date(process.argv[2]) : new Date();
const trigger = { event: process.env.GITHUB_EVENT_NAME ?? "", cron: process.env.SCHEDULE || undefined };
const go = shouldRun(trigger, now);
const due = `${String(SCHEDULED_HOUR).padStart(2, "0")}:xx in ${AUDIENCE.timezone}`;
console.log(`${trigger.event} ${trigger.cron ?? ""} at ${now.toISOString()}: ${go ? "running" : `not due at ${due}, skipping`}`);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `run=${go}\n`);
