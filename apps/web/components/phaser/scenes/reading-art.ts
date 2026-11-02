import type Phaser from "phaser";
import { LIBRARY_BOOKS, type BookId } from "@repo/shared";

export function readingTextures(scene: Phaser.Scene, book: BookId) {
  const open = `micro-book-${book}`, leaf = "micro-book-leaf";
  if (!scene.textures.exists(open)) {
    const texture = scene.textures.createCanvas(open, 48, 34)!;
    const ctx = texture.context;
    ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.fillRect(2, 7, 44, 27);
    ctx.fillStyle = LIBRARY_BOOKS[book].color; ctx.fillRect(0, 3, 48, 28);
    ctx.fillStyle = "#ddd5be"; ctx.fillRect(3, 2, 20, 27); ctx.fillRect(25, 2, 20, 27);
    ctx.fillStyle = "#fff8e5"; ctx.fillRect(3, 0, 19, 26); ctx.fillRect(26, 0, 19, 26);
    ctx.fillStyle = "#b6a780"; ctx.fillRect(22, 2, 4, 27);
    ctx.fillStyle = "#b1a58b";
    for (let y = 6; y < 24; y += 4) { ctx.fillRect(6, y, 12 - y % 3, 1); ctx.fillRect(29, y, 12 - y % 5, 1); }
    ctx.fillStyle = "#c5775d"; ctx.fillRect(37, 0, 3, 13);
    texture.refresh();
  }
  if (!scene.textures.exists(leaf)) {
    const texture = scene.textures.createCanvas(leaf, 20, 26)!;
    texture.context.fillStyle = "#fff9e9"; texture.context.fillRect(0, 0, 20, 26);
    texture.context.fillStyle = "#b8ae95";
    for (let y = 6; y < 24; y += 4) texture.context.fillRect(3, y, 12 - y % 3, 1);
    texture.refresh();
  }
  // The book shut, seen from the side it is carried: its cover, a darker spine and the page edges.
  const closed = `micro-book-closed-${book}`;
  if (!scene.textures.exists(closed)) {
    const texture = scene.textures.createCanvas(closed, 18, 24)!;
    const ctx = texture.context;
    ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.fillRect(2, 2, 16, 22);
    ctx.fillStyle = "#fff8e5"; ctx.fillRect(3, 1, 13, 21);
    ctx.fillStyle = LIBRARY_BOOKS[book].color; ctx.fillRect(0, 0, 15, 22);
    ctx.fillStyle = "rgba(0,0,0,0.28)"; ctx.fillRect(0, 0, 3, 22);
    ctx.fillStyle = "rgba(255,255,255,0.55)"; ctx.fillRect(5, 6, 8, 2); ctx.fillRect(5, 10, 6, 1);
    texture.refresh();
  }
  return { open, leaf, closed };
}
