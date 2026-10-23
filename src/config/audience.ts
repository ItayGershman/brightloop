// Who this watch is built for. Every audience-specific value lives here and nowhere else:
// the rest of the code speaks of "the audience" and reads these values.

const MEETING = "11:00";

export const AUDIENCE = {
  /** The marketer the brief's `built_for` field names. */
  builtFor: "maya",
  /** Who the audience repeats a pricing claim to. */
  reportsTo: "leadership",
  /** The deadline a call to action points at. */
  deadline: `the ${MEETING} leadership meeting`,
  /** When that meeting starts, as the weekly Slack line names it. */
  meetingTime: MEETING,
  /** The audience's tracking sheet, view-only by link: where the Slack line links until the live page exists. */
  sheetUrl: "https://docs.google.com/spreadsheets/d/1HXgiG-YdpvyPeCEomQ_hPWTGilRTM9jP4e01DB9M5Os/edit",
  /** The channel the Slack line is posted to, as the live page names it. */
  slackChannel: "#leadership",
  /** That channel in Slack (its "Copy link" address), linked from the live page. Not a credential: it opens only for workspace members. */
  slackChannelUrl: "https://brightlooptalk.slack.com/archives/C0CBM4845K4",
  /** The time zone the audience's weeks are counted in, for a live run (a cases file names its own). */
  timezone: "Asia/Jerusalem",
  /** What the watch covers, as said in a skip reason. */
  scope: "it tracks competitor pricing and packaging",
} as const;
