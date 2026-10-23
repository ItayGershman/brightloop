/// <reference lib="dom" />

/**
 * Runs inside the captured page, never in Node: the browser serializes this function, so it
 * may use nothing from outside its own body. It blanks every text node a person cannot see,
 * then reads the page's rendered text line by line. Hidden text never reaches a snapshot:
 * not text under display:none, visibility:hidden or content-visibility; not text whose
 * opacity, filter:opacity() and colour alpha together come to less than a tenth; not text
 * below readable size (font-size:0) or inside a box clipped below it (the 1px "screen reader
 * only" box); not text under any clip or clip-path; not text left of, above or right of the
 * viewport; and not text in a fixed box placed outside the viewport, where scrolling never
 * brings it. Text below the fold stays: scrolling shows it. Text whose colour matches its
 * background is not detected.
 */
export function visibleLines(): string[] {
  /** A text box smaller than this in either direction cannot be read. */
  const MIN_READABLE_PX = 2;
  /** Below this share of full opacity, text cannot be read. */
  const MIN_READABLE_ALPHA = 0.1;
  /** The amount inside a computed `filter: opacity(...)`, as a fraction or a percentage. */
  const FILTER_OPACITY = /opacity\(\s*([\d.]+)(%?)\s*\)/;
  /** A line break in rendered text. */
  const LINE_BREAK = /\r?\n/;

  // Any CSS colour format (rgb, hsl, oklch, named...) is turned into its alpha by painting
  // one pixel with it and reading the pixel back.
  const canvas = document.createElement("canvas").getContext("2d", { willReadFrequently: true });

  // No named inner functions here: the TypeScript runner wraps those in a helper that
  // exists in Node but not in the page, and the call would fail there.
  const viewportWidth = document.documentElement.clientWidth;
  const viewportHeight = window.innerHeight;
  const hidden: Text[] = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node as Text;
    const parent = text.parentElement;
    if (text.data.trim() === "") continue;
    if (!parent || !parent.checkVisibility({ opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true })) {
      hidden.push(text);
      continue;
    }

    let alpha = 1;
    if (canvas) {
      canvas.clearRect(0, 0, 1, 1);
      canvas.fillStyle = getComputedStyle(parent).color;
      canvas.fillRect(0, 0, 1, 1);
      alpha = canvas.getImageData(0, 0, 1, 1).data[3] / 255;
    }
    let clipped = false;
    let fixed = false;
    for (let box: Element | null = parent; box && box !== document.documentElement && !clipped; box = box.parentElement) {
      const style = getComputedStyle(box);
      const size = box.getBoundingClientRect();
      const filterOpacity = FILTER_OPACITY.exec(style.filter);
      alpha *= Number(style.opacity);
      if (filterOpacity) alpha *= Number(filterOpacity[1]) / (filterOpacity[2] === "%" ? 100 : 1);
      fixed ||= style.position === "fixed";
      clipped =
        style.clip !== "auto" ||
        style.clipPath !== "none" ||
        (style.overflow !== "visible" && (size.width < MIN_READABLE_PX || size.height < MIN_READABLE_PX));
    }

    const range = document.createRange();
    range.selectNodeContents(text);
    const readable = [...range.getClientRects()].some(
      (box) =>
        box.width >= MIN_READABLE_PX &&
        box.height >= MIN_READABLE_PX &&
        box.right > 0 &&
        box.bottom + window.scrollY > 0 &&
        box.left < viewportWidth &&
        (!fixed || (box.bottom > 0 && box.top < viewportHeight)),
    );
    if (clipped || alpha < MIN_READABLE_ALPHA || !readable) hidden.push(text);
  }
  for (const text of hidden) text.data = "";

  return document.body.innerText
    .split(LINE_BREAK)
    .map((line) => line.trim())
    .filter((line) => line !== "");
}
