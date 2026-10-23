// The audience's surfaces: the Slack line. The only import point for src/report/.
export { slackLine } from "./slack-line.ts";
export { deliverSlackLine, SlackPostError, webhookPoster, type SlackPoster } from "./slack-post.ts";
