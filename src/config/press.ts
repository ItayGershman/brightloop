// Known press: outlets whose reporting of a competitor's price is worth watching before the
// competitor's own page shows it. Adding an outlet is one entry; a source counts as one of
// them only if it parses as a URL on that host or a subdomain of it.

export const KNOWN_PRESS: string[] = [
  "techcrunch.com",
  "theverge.com",
  "venturebeat.com",
  "wired.com",
  "theinformation.com",
  "bloomberg.com",
  "reuters.com",
  "cnbc.com",
];
