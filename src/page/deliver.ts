import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Result } from "../domain/types.ts";
import type { RunLogEntry } from "../schedule/run-log.ts";
import { PublishError, type PagePublisher } from "./publish.ts";
import { renderPage } from "./render-page.ts";

// Writing the live page: always to a local file beside the run's outputs, then, only with a
// publisher (both keys set), to the Base44 app. A page that fails the content check (a
// forbidden marker, something that looks like a Brightloop price) is written but never
// published. A failed publish is a run error, never a crash, and the published page stays
// as the last run left it.

export type PageStatus =
  | "published"
  | "not published: no BASE44_API_KEY or BASE44_APP_ID"
  | "not published: the page failed the content check"
  | "not published: the upload failed";

export interface DeliveredPage {
  /** The result, with any publishing problem added to run.errors. */
  result: Result;
  status: PageStatus;
  /** The published URL, when the page was published. */
  url?: string;
}

export async function deliverPage(
  result: Result,
  options: {
    pagePath: string;
    timeZone: string;
    history?: RunLogEntry[];
    publisher?: PagePublisher;
    /** Problems with the page's HTML that must stop it from being published. Required: nothing is published unchecked. */
    check: (html: string) => string[];
  },
): Promise<DeliveredPage> {
  const html = renderPage({ result, history: options.history, timeZone: options.timeZone });
  mkdirSync(dirname(options.pagePath), { recursive: true });
  writeFileSync(options.pagePath, html);
  if (!options.publisher) return { result, status: "not published: no BASE44_API_KEY or BASE44_APP_ID" };

  const problems = options.check(html);
  if (problems.length > 0) {
    return withError(result, "not published: the page failed the content check", `it failed the content check (${problems.join("; ")})`);
  }
  try {
    const { url } = await options.publisher.publish(html);
    return { result, status: "published", url };
  } catch (error) {
    return withError(result, "not published: the upload failed", error instanceof PublishError ? error.message : "no answer from Base44");
  }
}

function withError(result: Result, status: PageStatus, reason: string): DeliveredPage {
  return { result: { ...result, run: { ...result.run, errors: [...result.run.errors, `live page not updated: ${reason}`] } }, status };
}
