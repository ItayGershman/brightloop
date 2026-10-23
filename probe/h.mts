import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
import { visibleLines } from "../src/capture/visible-lines.ts";
const b = await chromium.launch({ channel: "chrome", headless: true });
const p = await b.newPage();
await p.setContent(readFileSync(process.argv[2], "utf8"));
console.log((await p.evaluate(visibleLines)).join("\n"));
await b.close();
