import type { FloorKind } from "@repo/shared";

// The main colour of each floor, for the minimap and the map builder's floor swatches.
// Kept apart from the Phaser drawing code so React components can use it too.
export const FLOOR_COLORS: Record<FloorKind, number> = {
  wood: 0xd8a86f, carpet: 0x8e9bb5, tile: 0xece9e2, herringbone: 0xb27d4f,
  terrazzo: 0xe2dfd8, sage: 0xa7bb9c, arcade: 0x1f418a, sand: 0xe2d2b4, office: 0xc4cad5,
  raised: 0x9aa3ae, concrete: 0xb9b7b2, teal: 0x5fa8a0, zigzag: 0xa9b0b6, porcelain: 0xe3e8f0,
  brick: 0xf1e3cc, lavender: 0x8f8fd6, maple: 0xe6cfa6, crosstile: 0xefe3c8, damask: 0xd9dce6,
};
