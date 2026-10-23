/// <reference lib="dom" />

/**
 * Runs inside the captured page, never in Node: the browser serializes this function, so it
 * may use nothing from outside its own body. It blanks every text node a person cannot see,
 * then reads the page's rendered text line by line. Hidden text never reaches a snapshot:
 * not text under display:none, visibility:hidden or opacity:0, not text squeezed below
 * readable size (font-size:0), not text inside a box clipped below readable size (the 1px
 * "screen reader only" box), not text pushed off the page, and not text painted in a
 * transparent colour.
 */
export function visibleLines(): string[] {
  /** A text box smaller than this in either direction cannot be read. */
  const MIN_READABLE_PX = 2;
  /** A computed colour with zero alpha: "transparent" or "rgba(r, g, b, 0)". */
  const TRANSPARENT_COLOR = /^transparent$|^rgba\(.*,\s*0\)$/;
  /** A line break in rendered text. */
  const LINE_BREAK = /\r?\n/;

  // No named inner functions here: the TypeScript runner wraps those in a helper that
  // exists in Node but not in the page, and the call would fail there.
  const pageWidth = document.documentElement.scrollWidth;
  const hidden: Text[] = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node as Text;
    const parent = text.parentElement;
    if (text.data.trim() === "") continue;
    if (
      !parent ||
      !parent.checkVisibility({ opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true }) ||
      TRANSPARENT_COLOR.test(getComputedStyle(parent).color)
    ) {
      hidden.push(text);
      continue;
    }
    const range = document.createRange();
    range.selectNodeContents(text);
    const readable = [...range.getClientRects()].some(
      (box) =>
        box.width >= MIN_READABLE_PX &&
        box.height >= MIN_READABLE_PX &&
        box.right + window.scrollX > 0 &&
        box.bottom + window.scrollY > 0 &&
        box.left + window.scrollX < pageWidth,
    );
    let clipped = false;
    for (let box: Element | null = parent; box && box !== document.body && !clipped; box = box.parentElement) {
      const style = getComputedStyle(box);
      const size = box.getBoundingClientRect();
      const clips = style.overflow !== "visible" || style.clip !== "auto" || style.clipPath !== "none";
      clipped = clips && (size.width < MIN_READABLE_PX || size.height < MIN_READABLE_PX);
    }
    if (!readable || clipped) hidden.push(text);
  }
  for (const text of hidden) text.data = "";

  return document.body.innerText
    .split(LINE_BREAK)
    .map((line) => line.trim())
    .filter((line) => line !== "");
}
