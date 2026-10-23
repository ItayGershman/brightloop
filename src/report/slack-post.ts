import { detailsUrl } from "../config/delivery.ts";
import type { Result, SlackDelivery } from "../domain/types.ts";
import { slackLine } from "./slack-line.ts";

// Sending the Slack line. The webhook URL is a secret: it comes only from the environment
// and never appears in a message, an error or the result.

export interface SlackPoster {
  /** Posts the text; throws a SlackPostError (whose message is safe to show) when it fails. */
  post(text: string): Promise<void>;
}

/** A failure whose message names what went wrong and never the webhook. */
export class SlackPostError extends Error {}

const TIMEOUT_MS = 10_000;

/** Posts to a Slack incoming webhook. `fetchImpl` is the test seam. */
export function webhookPoster(webhook: string, fetchImpl: typeof fetch = fetch): SlackPoster {
  return {
    async post(text) {
      let answer: Response;
      try {
        answer = await fetchImpl(webhook, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text: escapeForSlack(text) }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch {
        throw new SlackPostError("no answer from Slack");
      }
      if (!answer.ok) throw new SlackPostError(`Slack answered ${answer.status}`);
    },
  };
}

/**
 * Renders the line, posts it when SLACK_WEBHOOK_URL is set, and returns a copy of the result
 * with the line and what happened to it in `slack`. Without the key no poster is made, so no
 * network call can happen. A failed post is a run error, never a crash.
 */
export async function deliverSlackLine(
  result: Result,
  options: { env: Record<string, string | undefined>; makePoster?: (webhook: string) => SlackPoster },
): Promise<Result> {
  const line = slackLine(result, detailsUrl(options.env));
  const webhook = options.env.SLACK_WEBHOOK_URL?.trim();
  if (!webhook) return withSlack(result, { line, status: "not posted: no SLACK_WEBHOOK_URL" });
  try {
    await (options.makePoster ?? webhookPoster)(webhook).post(line);
    return withSlack(result, { line, status: "posted" });
  } catch (error) {
    const reason = error instanceof SlackPostError ? error.message : "no answer from Slack";
    return withSlack(result, { line, status: "not posted: the post failed" }, `Slack post failed: ${reason}`);
  }
}

function withSlack(result: Result, slack: SlackDelivery, error?: string): Result {
  return { ...result, run: { ...result.run, errors: error ? [...result.run.errors, error] : result.run.errors }, slack };
}

/** Slack reads &, < and > as control characters in message text. */
function escapeForSlack(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
