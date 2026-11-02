import type { YouTubeSearchResult } from "@repo/shared";
import type { SuggestionsPage } from "../../lib/tv/tech-suggestions";

// The screen a TV shows when it's turned on with nothing playing: tech videos to pick from, a topic
// at a time (app/api/tv-suggestions), and a tile for more. The same screen is drawn on the 3D TV
// (components/tv/tv-screen-3d.ts, where clicks are matched to the tiles by position) and in the big
// TV view (tv-overlay.tsx, where the tiles are ordinary buttons). Nothing plays until someone picks.

export type { SuggestionsPage };
export type HomeAction = { kind: "play"; video: YouTubeSearchResult } | { kind: "more" };
// A tile's place on the screen, in the screen's own pixels, and what picking it does.
export type HomeHit = { left: number; top: number; width: number; height: number; action: HomeAction };

// Pages already asked for, for this page load: turning a TV off and on again doesn't ask again.
const pages = new Map<number, Promise<SuggestionsPage>>();

export function loadSuggestions(page: number): Promise<SuggestionsPage> {
  let pending = pages.get(page);
  if (!pending) {
    pending = fetch(`/api/tv-suggestions?page=${page}`, { cache: "no-store" }).then((response) => {
      if (!response.ok) throw new Error(`suggestions: ${response.status}`);
      return response.json() as Promise<SuggestionsPage>;
    });
    pending.catch(() => pages.delete(page));
    pages.set(page, pending);
  }
  return pending;
}

// YouTube's dark theme: near-black, dark grey tiles, grey for the secondary text.
const COLORS = { screen: "#0f0f0f", tile: "#1f1f1f", more: "#272727", text: "#f1f1f1", muted: "#aaaaaa", line: "rgba(255,255,255,0.1)" };
const GAP = 22;
const PAD = 34;
const HEADER = 74;

// Draws the home screen into `container`, sized width × height (the screen's own pixels), and
// returns where each tile is. `onPick` makes the tiles real buttons (the big view); without it they're
// plain boxes, picked by position (the 3D TV, which the page's clicks can't reach directly).
export function drawTvHome(
  container: HTMLElement,
  { width, height, state, onPick }: { width: number; height: number; state: SuggestionsPage | "loading" | "error"; onPick?: (action: HomeAction) => void },
): HomeHit[] {
  container.replaceChildren();
  Object.assign(container.style, {
    position: "absolute",
    inset: "0",
    overflow: "hidden",
    background: COLORS.screen,
    color: COLORS.text,
    fontFamily: "var(--font-sans, system-ui, sans-serif)",
  });
  // The layout follows the screen's shape: a heading and two rows with titles under the thumbnails
  // on a tall screen (the big view), two rows with titles over them on a TV, and one row on a long,
  // low panel (as many as fit while the thumbnails stay about 16:9).
  const tall = height >= 520;
  const header = tall ? HEADER : 0;
  const rows = height >= 360 ? 2 : 1;
  const columns = rows === 2 ? 3 : Math.max(3, Math.min(6, Math.floor((width - PAD * 2 + GAP) / ((height - PAD * 2) * (16 / 9) + GAP))));
  const tileWidth = (width - PAD * 2 - GAP * (columns - 1)) / columns;
  const tileHeight = (height - PAD * 2 - header - GAP * (rows - 1)) / rows;
  const overlayFont = Math.round(Math.max(15, Math.min(24, tileHeight * 0.11)));

  const add = <K extends keyof HTMLElementTagNameMap>(tag: K, parent: HTMLElement, style: Partial<CSSStyleDeclaration>, text?: string) => {
    const element = document.createElement(tag);
    Object.assign(element.style, style);
    if (text !== undefined) element.textContent = text;
    parent.append(element);
    return element;
  };

  if (tall) {
    const top = add("div", container, { position: "absolute", left: `${PAD}px`, right: `${PAD}px`, top: `${PAD - 6}px`, display: "flex", alignItems: "baseline", gap: "18px" });
    add("span", top, { fontSize: "38px", fontWeight: "700", letterSpacing: "-0.01em" }, "Suggested for you");
    if (typeof state === "object") add("span", top, { fontSize: "26px", color: COLORS.muted }, state.topic);
  }

  const hits: HomeHit[] = [];
  const slots = rows * columns;
  for (let slot = 0; slot < slots; slot++) {
    const row = Math.floor(slot / columns);
    const column = slot % columns;
    const box = { left: PAD + column * (tileWidth + GAP), top: PAD + header + row * (tileHeight + GAP), width: tileWidth, height: tileHeight };
    const last = slot === slots - 1;
    const video = typeof state === "object" ? state.results[slot] : undefined;
    const action: HomeAction | null = last ? { kind: "more" } : video ? { kind: "play", video } : null;

    const tile = add(onPick && action ? "button" : "div", container, {
      position: "absolute",
      left: `${box.left}px`,
      top: `${box.top}px`,
      width: `${box.width}px`,
      height: `${box.height}px`,
      borderRadius: "18px",
      overflow: "hidden",
      background: last ? COLORS.more : COLORS.tile,
      border: `2px solid ${COLORS.line}`,
      padding: "0",
      textAlign: "left",
      color: "inherit",
      font: "inherit",
      cursor: action ? "pointer" : "default",
    });
    if (onPick && action) {
      tile.setAttribute("type", "button");
      tile.addEventListener("click", () => onPick(action));
    }
    if (action) hits.push({ ...box, action });

    if (last) {
      // The "more" tile: the next topic.
      tile.setAttribute("aria-label", "More tech videos");
      const inner = add("div", tile, { position: "absolute", inset: "0", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: "10px" });
      add("span", inner, { fontSize: tall ? "64px" : `${overlayFont * 2.2}px`, lineHeight: "1" }, "›");
      add("span", inner, { fontSize: tall ? "30px" : `${overlayFont * 1.2}px`, fontWeight: "700" }, "More");
      if (!tall && typeof state === "object") add("span", inner, { fontSize: `${overlayFont}px`, color: COLORS.muted, textAlign: "center", padding: "0 8px" }, state.topic);
      continue;
    }
    if (state === "loading" || state === "error" || !video) {
      if (state === "error" && slot === 0) {
        add("div", tile, { position: "absolute", inset: "0", display: "grid", placeItems: "center", padding: "16px", fontSize: "24px", color: COLORS.muted, textAlign: "center" }, "Couldn't load suggestions. Pick More to try again.");
      } else {
        add("div", tile, { position: "absolute", inset: "0", background: `linear-gradient(90deg, ${COLORS.tile}, ${COLORS.more}, ${COLORS.tile})` });
      }
      continue;
    }
    tile.setAttribute("aria-label", `${video.title}, ${video.channel}`);
    tile.title = video.title;
    // Thumbnail on top, title and channel under it; on a TV, the title over the thumbnail.
    const imageHeight = tall ? box.height * 0.56 : box.height;
    const image = add("img", tile, { position: "absolute", left: "0", top: "0", width: "100%", height: `${imageHeight}px`, objectFit: "cover", background: COLORS.screen }) as HTMLImageElement;
    image.src = video.thumbnail;
    image.alt = "";
    image.decoding = "async";
    image.referrerPolicy = "no-referrer";
    if (tall) {
      const text = add("div", tile, { position: "absolute", left: "16px", right: "16px", top: `${imageHeight + 10}px`, bottom: "12px", overflow: "hidden" });
      add("div", text, { fontSize: "23px", fontWeight: "650", lineHeight: "1.2", display: "-webkit-box", webkitLineClamp: "2", webkitBoxOrient: "vertical", overflow: "hidden" } as Partial<CSSStyleDeclaration>, video.title);
      add("div", text, { fontSize: "18px", color: COLORS.muted, marginTop: "6px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }, video.channel);
    } else {
      add("div", tile, { position: "absolute", left: "0", right: "0", bottom: "0", padding: `${overlayFont * 1.4}px 12px 8px`, background: "linear-gradient(transparent, rgba(0,0,0,0.88))", fontSize: `${overlayFont}px`, fontWeight: "650", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }, video.title);
    }
  }
  return hits;
}

// The tile at (x, y) in the screen's own pixels, if any.
export function hitAt(hits: HomeHit[], x: number, y: number) {
  return hits.find((hit) => x >= hit.left && x <= hit.left + hit.width && y >= hit.top && y <= hit.top + hit.height) ?? null;
}
