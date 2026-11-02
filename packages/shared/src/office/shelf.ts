import * as z from "zod";

// The kitchen shelf where people leave things for each other: snacks to share, and things someone
// found and is holding for whoever lost them. Leave something (for everyone, or for one person,
// with a note), and whoever it's for takes it. Things left for one person can only be taken by them
// or by whoever left them. The shelf holds 24 things; each person can have 6 on it; anything still
// there after 3 days is cleared away.

export const SHELF_THINGS = {
  cookies: { label: "Cookies", group: "snack" },
  fruit: { label: "Fruit bowl", group: "snack" },
  chocolate: { label: "Chocolate", group: "snack" },
  chips: { label: "Crisps", group: "snack" },
  cake: { label: "Cake", group: "snack" },
  coffee: { label: "Coffee beans", group: "snack" },
  tea: { label: "Tea", group: "snack" },
  umbrella: { label: "Umbrella", group: "found" },
  keys: { label: "Keys", group: "found" },
  bottle: { label: "Water bottle", group: "found" },
  charger: { label: "Charger", group: "found" },
  headphones: { label: "Headphones", group: "found" },
  mug: { label: "Mug", group: "found" },
  notebook: { label: "Notebook", group: "found" },
  badge: { label: "Badge", group: "found" },
  glasses: { label: "Glasses", group: "found" },
} as const satisfies Record<string, { label: string; group: "snack" | "found" }>;
export type ShelfThing = keyof typeof SHELF_THINGS;
export const SHELF_THING_IDS = Object.keys(SHELF_THINGS) as ShelfThing[];

export const SHELF_MAX = 24;
export const SHELF_PER_PERSON = 6;
export const SHELF_NOTE_MAX = 120;
export const SHELF_KEEP_MS = 3 * 24 * 60 * 60_000;

const Id = z.string().min(1).max(64);

export const ShelfDraftSchema = z.object({
  thing: z.enum(SHELF_THING_IDS as [ShelfThing, ...ShelfThing[]]),
  note: z.string().trim().max(SHELF_NOTE_MAX).default(""),
  // Left for one person (their id and name), or for anyone.
  for: z.object({ id: Id, name: z.string().max(40) }).nullable().default(null),
});
export type ShelfDraft = z.input<typeof ShelfDraftSchema>;

export const ShelfItemSchema = z.object({
  id: Id,
  thing: ShelfDraftSchema.shape.thing,
  note: z.string().max(SHELF_NOTE_MAX),
  for: z.object({ id: Id, name: z.string().max(40) }).nullable(),
  by: z.object({ id: Id, name: z.string().max(40) }),
  at: z.number().int().nonnegative(),
});
export type ShelfItem = z.infer<typeof ShelfItemSchema>;

export function shelfLeaveProblem(items: readonly ShelfItem[], userId: string, now: number): string | null {
  const here = freshShelf(items, now);
  if (here.length >= SHELF_MAX) return "The shelf is full. Take something off first.";
  if (here.filter((item) => item.by.id === userId).length >= SHELF_PER_PERSON) return `You already have ${SHELF_PER_PERSON} things on the shelf.`;
  return null;
}

export function shelfTakeProblem(item: ShelfItem, userId: string): string | null {
  if (item.for && item.for.id !== userId && item.by.id !== userId) return `That's left for ${item.for.name}.`;
  return null;
}

// What's still on the shelf: things left in the last 3 days.
export const freshShelf = (items: readonly ShelfItem[], now: number) => items.filter((item) => now - item.at < SHELF_KEEP_MS);
