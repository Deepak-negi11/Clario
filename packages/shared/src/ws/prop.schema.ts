import * as z from "zod";
import { BOOK_IDS, BOOK_PAGE_COUNT } from "../maps/library";

// What a player has with them that everyone should see: one of Clario HQ's bikes they are riding,
// a drink from the vending machine or a coffee from the kitchen in their hand, or a book. It is sent when it changes (getting on or off,
// picking up the can, each sip, throwing it away); the server keeps each player's current prop so
// people who join later see it too, and lets only one person ride each bike.

export const BIKES = ["orange", "teal"] as const;
export type Bike = (typeof BIKES)[number];

export const DRINKS = ["orange", "cola", "lime", "berry"] as const;
export type Drink = (typeof DRINKS)[number];

// Made-up names, so no real brand appears on the cans.
export const DRINK_NAMES: Record<Drink, string> = {
  orange: "Orange Fizz",
  cola: "Clario Cola",
  lime: "Lime Spark",
  berry: "Berry Burst",
};

// A can holds this many sips; after the last one it is empty.
export const SIPS_PER_CAN = 3;

// What the kitchen's coffee machines brew. You order at the machine, it brews for BREW_MS, and
// you carry the cup and drink it like a can (the same number of sips).
export const COFFEES = ["espresso", "cappuccino", "latte", "chai", "hot-chocolate"] as const;
export type Coffee = (typeof COFFEES)[number];

export const COFFEE_NAMES: Record<Coffee, string> = {
  espresso: "Espresso",
  cappuccino: "Cappuccino",
  latte: "Latte",
  chai: "Masala chai",
  "hot-chocolate": "Hot chocolate",
};

export const BREW_MS = 4000;

// How long a step (one tile) takes walking and on a bike, in ms, on the 2D map and in 3D.
export const WALK_STEP_MS = 160;
export const RIDE_STEP_MS = 110;

export const PlayerPropSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("bike"), bike: z.enum(BIKES) }),
  z.object({ kind: z.literal("can"), drink: z.enum(DRINKS), sips: z.number().int().min(0).max(SIPS_PER_CAN) }),
  z.object({ kind: z.literal("cup"), coffee: z.enum(COFFEES), sips: z.number().int().min(0).max(SIPS_PER_CAN) }),
  z.object({ kind: z.literal("book"), book: z.enum(BOOK_IDS), page: z.number().int().min(0).max(BOOK_PAGE_COUNT - 1) }),
]);
export type PlayerProp = z.infer<typeof PlayerPropSchema>;

// Your prop changed (null: you put it down).
export const PropMessage = z.object({
  type: z.literal("prop"),
  payload: z.object({ prop: PlayerPropSchema.nullable() }),
});

// Someone's prop changed. Sent back to you, with your current prop, when you asked for a bike
// someone else is already riding.
export const PropBroadcast = z.object({
  type: z.literal("prop"),
  payload: z.object({ userId: z.string(), prop: PlayerPropSchema.nullable() }),
});

export type PropMessage = z.infer<typeof PropMessage>;
export type PropBroadcast = z.infer<typeof PropBroadcast>;
