import { chromium, type Browser } from "playwright-core";
import type { Snapshot, WatchedPage } from "../domain/types.ts";
import { visibleLines } from "./visible-lines.ts";

// The network adapter: a real Chrome opens each watched page and keeps its visible text.
// Prices on some pages load with JavaScript, so a plain fetch is not enough. Uses the Chrome
// installed on the machine (playwright-core downloads no browser of its own).

/** How long a page may take to load before it counts as not captured. */
const LOAD_TIMEOUT_MS = 60_000;
/** How long to wait, at most, for scripts to finish fetching prices after the load event. */
const SETTLE_TIMEOUT_MS = 10_000;

export interface Captured {
  snapshots: Snapshot[];
  /** One line per page that could not be captured; the run reports them in run.errors. */
  errors: string[];
}

/**
 * One snapshot per page that answered. A page that is blocked, errors or times out gets an
 * error line instead, never a snapshot of the block page. Never throws.
 */
export async function capturePages(pages: WatchedPage[], options: { headless: boolean }): Promise<Captured> {
  let browser: Browser;
  try {
    browser = await chromium.launch({ channel: "chrome", headless: options.headless });
  } catch {
    return { snapshots: [], errors: ["could not start Google Chrome, so no page was captured: install Chrome to run a live capture"] };
  }

  const captured: Captured = { snapshots: [], errors: [] };
  try {
    const context = await browser.newContext();
    for (const watched of pages) {
      const name = `${watched.competitor} ${watched.page === "pricing" ? "pricing page" : "homepage"}`;
      const tab = await context.newPage();
      try {
        const response = await tab.goto(watched.url, { waitUntil: "load", timeout: LOAD_TIMEOUT_MS });
        const status = response?.status() ?? 0;
        if (status < 200 || status >= 400) {
          captured.errors.push(`${name}: the site answered ${status || "nothing"}, so it was not captured`);
          continue;
        }
        await tab.waitForLoadState("networkidle", { timeout: SETTLE_TIMEOUT_MS }).catch(() => undefined);
        const lines = await tab.evaluate(visibleLines);
        captured.snapshots.push({ ...watched, captured_at: new Date().toISOString(), lines });
      } catch {
        captured.errors.push(`${name}: could not be opened, so it was not captured`);
      } finally {
        await tab.close();
      }
    }
  } finally {
    await browser.close();
  }
  return captured;
}
