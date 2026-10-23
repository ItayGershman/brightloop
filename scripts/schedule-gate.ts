import { appendFileSync } from "node:fs";
import { shouldRun } from "../src/schedule/time-gate.ts";

// The first job of the scheduled-run workflow: writes run=true or run=false to the job's
// outputs. Runs with plain Node (24 or later strips the types), before npm ci.
// Usage: node scripts/schedule-gate.ts <event name> [<ISO time>]

const [event = "", at] = process.argv.slice(2);
const now = at ? new Date(at) : new Date();
const go = shouldRun(event, now);
console.log(`${event} at ${now.toISOString()}: ${go ? "running" : "not 08:xx in Asia/Jerusalem, skipping"}`);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `run=${go}\n`);
