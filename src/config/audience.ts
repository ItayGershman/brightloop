// Who this watch is built for. Every audience-specific value lives here and nowhere else:
// the rest of the code speaks of "the audience" and reads these values.

export const AUDIENCE = {
  /** The marketer the brief's `built_for` field names. */
  builtFor: "maya",
  /** Who the audience repeats a pricing claim to. */
  reportsTo: "leadership",
  /** The deadline a call to action points at. */
  deadline: "the 11:00 leadership meeting",
  /** The time zone the audience's weeks are counted in, for a live run (a cases file names its own). */
  timezone: "Asia/Jerusalem",
  /** What the watch covers, as said in a skip reason. */
  scope: "it tracks competitor pricing and packaging",
} as const;
