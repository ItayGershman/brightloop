// The live page's pictures, drawn inline: its policy lets it load no image, so every mark and
// icon is an SVG written into the page. The competitor marks are simple stand-ins in each
// brand's colours, so Maya finds a competitor at a glance; real logo SVGs can replace them here.

/** One `<symbol>` per competitor, by slug ("lovable"), defined once at the top of the page. */
const COMPETITOR_MARKS: Record<string, string> = {
  lovable: `<linearGradient id="mark-lovable-fill" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff8a3d"/><stop offset=".55" stop-color="#f43f7a"/><stop offset="1" stop-color="#8b5cf6"/></linearGradient>
<symbol id="mark-lovable" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="url(#mark-lovable-fill)"/><path d="M16 24.5s-7.5-4.6-7.5-10a4.2 4.2 0 0 1 7.5-2.6 4.2 4.2 0 0 1 7.5 2.6c0 5.4-7.5 10-7.5 10Z" fill="#fff"/></symbol>`,
  replit: `<symbol id="mark-replit" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#f26207"/><path d="M10 7.5h6.5a1.5 1.5 0 0 1 1.5 1.5v5H11.5A1.5 1.5 0 0 1 10 12.5ZM18 14h4.5a1.5 1.5 0 0 1 1.5 1.5v1A1.5 1.5 0 0 1 22.5 18H18ZM10 19.5a1.5 1.5 0 0 1 1.5-1.5H18v5a1.5 1.5 0 0 1-1.5 1.5H10Z" fill="#fff"/></symbol>`,
  bolt: `<symbol id="mark-bolt" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#111827"/><path d="M17.8 6.5 9.5 18h5.6l-1.6 7.5 8.4-11.6h-5.7Z" fill="#fff"/></symbol>`,
};

/** The hidden block of symbols every `mark()` on the page points at. */
export const MARK_SYMBOLS = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${Object.values(COMPETITOR_MARKS).join("")}</defs></svg>`;

/** A competitor's mark by slug, or nothing for a competitor without one. */
export function mark(slug: string, size: number): string {
  if (!(slug in COMPETITOR_MARKS)) return "";
  return `<svg class="mark" width="${size}" height="${size}" aria-hidden="true"><use href="#mark-${slug}"/></svg>`;
}

const ICON = (paths: string, className = "icon") => `<svg class="${className}" viewBox="0 0 16 16" aria-hidden="true">${paths}</svg>`;
const STROKE = `fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"`;

export const ICONS = {
  /** Opens another site. */
  out: ICON(`<path d="M6 3.5h6.5V10M12.5 3.5 4 12" ${STROKE}/>`),
  /** Jumps further down this page. */
  down: ICON(`<path d="M8 3v10M4 9l4 4 4-4" ${STROKE}/>`),
  check: ICON(`<path d="m3.5 8.5 3 3 6-7" ${STROKE} stroke-width="1.8"/>`),
  dot: ICON(`<circle cx="8" cy="8" r="4" fill="currentColor"/>`),
  warn: ICON(`<path d="M8 2.5 14.5 13.5h-13Z" ${STROKE} stroke-width="1.5"/><path d="M8 6.5v3.2M8 11.6v.1" ${STROKE}/>`),
  arrow: ICON(`<path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" ${STROKE}/>`),
  slack: `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="#e01e5a" d="M5 15a2 2 0 1 1-2-2h2v2Zm1 0a2 2 0 0 1 4 0v5a2 2 0 0 1-4 0v-5Z"/><path fill="#36c5f0" d="M9 5a2 2 0 1 1 2-2v2H9Zm0 1a2 2 0 0 1 0 4H4a2 2 0 0 1 0-4h5Z"/><path fill="#2eb67d" d="M19 9a2 2 0 1 1 2 2h-2V9Zm-1 0a2 2 0 0 1-4 0V4a2 2 0 0 1 4 0v5Z"/><path fill="#ecb22e" d="M15 19a2 2 0 1 1-2 2v-2h2Zm0-1a2 2 0 0 1 0-4h5a2 2 0 0 1 0 4h-5Z"/></svg>`,
};
