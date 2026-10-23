// Where the audience's surfaces point. The Slack line links to the details: Maya's sheet
// (view-only by link) until the live page exists, when DETAILS_URL points at it instead.

/** The tracking sheet the run's rows go to; view-only by link. */
export const SHEET_URL = "https://docs.google.com/spreadsheets/d/1HXgiG-YdpvyPeCEomQ_hPWTGilRTM9jP4e01DB9M5Os/edit";

/** The link the Slack line points at: DETAILS_URL when it is an https link, else the sheet. */
export function detailsUrl(env: Record<string, string | undefined>): string {
  const wanted = env.DETAILS_URL?.trim();
  if (!wanted) return SHEET_URL;
  try {
    return new URL(wanted).protocol === "https:" ? wanted : SHEET_URL;
  } catch {
    return SHEET_URL;
  }
}
