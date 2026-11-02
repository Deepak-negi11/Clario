"use client";

import { useState, type RefObject } from "react";
import {
  Apple, Bean, Cable, CakeSlice, Candy, Coffee, Cookie, GlassWater, Glasses, HandHeart, Headphones, IdCard, KeyRound, Leaf,
  NotebookPen, Popcorn, Umbrella, type LucideIcon,
} from "lucide-react";
import {
  SHELF_NOTE_MAX, SHELF_THINGS, SHELF_THING_IDS, freshShelf, shelfTakeProblem, type ShelfItem, type ShelfThing,
} from "@repo/shared";
import type { SceneBridge } from "../phaser/scene-bridge";
import { NoticeLine, WorkplaceDialog, field, focus, label, muted, primary, whenOf } from "./panel-kit";
import type { Workplace, WorkplacePerson } from "./use-workplace";

// The kitchen shelf: snacks people share and things someone found, waiting for whoever they're for.

export const THING_ICONS: Record<ShelfThing, LucideIcon> = {
  cookies: Cookie, fruit: Apple, chocolate: Candy, chips: Popcorn, cake: CakeSlice, coffee: Bean, tea: Leaf,
  umbrella: Umbrella, keys: KeyRound, bottle: GlassWater, charger: Cable, headphones: Headphones, mug: Coffee,
  notebook: NotebookPen, badge: IdCard, glasses: Glasses,
};

const GROUPS = [
  { id: "snack", title: "Snacks to share", tint: "bg-[#fdf1e4] text-[#8a5a22]" },
  { id: "found", title: "Lost and found", tint: "bg-[#eaf0f7] text-[#2f4f7a]" },
] as const;

export function SwapShelfPanel({
  bridgeRef,
  workplace,
  people,
  openedAt,
  onClose,
}: {
  bridgeRef: RefObject<SceneBridge>;
  workplace: Workplace;
  people: WorkplacePerson[];
  openedAt: number;
  onClose: () => void;
}) {
  const { shelf, send, selfId, notice, clearNotice } = workplace;
  const items = shelf ? freshShelf(shelf, Date.now()) : null;
  const [thing, setThing] = useState<ShelfThing>("cookies");
  const [note, setNote] = useState("");
  const [forId, setForId] = useState("");
  const forPerson = people.find((person) => person.id === forId) ?? null;
  const found = SHELF_THINGS[thing].group === "found";

  return (
    <WorkplaceDialog
      bridgeRef={bridgeRef}
      name="swap-shelf"
      title="Kitchen shelf"
      subtitle="Snacks to share, and things people have lost"
      icon={HandHeart}
      tint="#fdf1e4"
      ink="#8a5a22"
      width="w-[min(56rem,calc(100vw-1rem))]"
      onClose={onClose}
    >
      <div className="grid gap-5 p-4 md:grid-cols-[1.35fr_1fr]">
        <section aria-label="On the shelf" className="flex flex-col gap-4">
          {items === null ? (
            <div className="grid grid-cols-2 gap-2" role="status" aria-label="Looking at the shelf">
              {[0, 1, 2, 3].map((tile) => <div key={tile} className="h-24 animate-pulse rounded-2xl bg-[#f1f2f4] motion-reduce:animate-none" />)}
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-2xl bg-[#f4f5f7] px-4 py-10 text-center">
              <HandHeart size={22} className="mx-auto text-[#8a909b]" aria-hidden="true" />
              <p className="mt-2 text-sm font-semibold">The shelf is empty</p>
              <p className={`mx-auto mt-1 max-w-[34ch] text-[13px] ${muted}`}>Leave a snack to share, or something you found so its owner can pick it up.</p>
            </div>
          ) : (
            GROUPS.map((group) => {
              const here = items.filter((item) => SHELF_THINGS[item.thing].group === group.id).reverse();
              if (!here.length) return null;
              return (
                <div key={group.id}>
                  <h3 className="text-xs font-semibold text-[#12151c]">{group.title}</h3>
                  <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                    {here.map((item) => (
                      <ShelfTile key={item.id} item={item} selfId={selfId} tint={group.tint} onTake={() => send?.({ action: "take", id: item.id })} />
                    ))}
                  </ul>
                </div>
              );
            })
          )}
        </section>

        <form
          className="flex flex-col gap-3 rounded-2xl bg-[#f7f8f9] p-3"
          onSubmit={(event) => {
            event.preventDefault();
            const sent = send?.({ action: "leave", item: { thing, note: note.trim(), for: forPerson ? { id: forPerson.id, name: forPerson.name } : null } });
            if (sent) {
              setNote("");
              setForId("");
            }
          }}
        >
          <h3 className="text-sm font-semibold">Leave something</h3>
          {GROUPS.map((group) => (
            <fieldset key={group.id}>
              <legend className={label}>{group.id === "snack" ? "A snack" : "Something you found"}</legend>
              <div className="mt-1.5 grid grid-cols-4 gap-1.5 sm:grid-cols-5">
                {SHELF_THING_IDS.filter((id) => SHELF_THINGS[id].group === group.id).map((id) => {
                  const Icon = THING_ICONS[id];
                  return (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={thing === id}
                      title={SHELF_THINGS[id].label}
                      onClick={() => setThing(id)}
                      className={`flex cursor-pointer flex-col items-center gap-1 rounded-xl border bg-white px-1 py-2 text-[10.5px] leading-tight transition motion-reduce:transition-none ${thing === id ? "border-[#3a6ee8] text-[#12151c] shadow-[0_0_0_1px_#3a6ee8]" : "border-[#e2e4e8] text-[#4b5260] hover:border-[#c9ced6]"} ${focus}`}
                    >
                      <Icon size={18} aria-hidden="true" />
                      <span className="max-w-full truncate">{SHELF_THINGS[id].label}</span>
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ))}
          <label className={label}>
            For
            <select value={forId} onChange={(event) => setForId(event.target.value)} name="shelf-for" className={`${field} h-10`}>
              <option value="">Anyone</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
          </label>
          <label className={label}>
            Note <span className={`font-normal ${muted}`}>(optional)</span>
            <input value={note} onChange={(event) => setNote(event.target.value)} maxLength={SHELF_NOTE_MAX} autoComplete="off" name="shelf-note" placeholder={found ? "Found by the window in the Lounge…" : "From my trip, help yourself…"} className={`${field} h-10`} />
          </label>
          <button type="submit" className={primary}>
            Leave {SHELF_THINGS[thing].label.toLowerCase()}
            {forPerson ? ` for ${forPerson.name}` : ""}
          </button>
          <NoticeLine notice={notice} since={openedAt} onDone={clearNotice} />
        </form>
      </div>
    </WorkplaceDialog>
  );
}

function ShelfTile({ item, selfId, tint, onTake }: { item: ShelfItem; selfId: string | null; tint: string; onTake: () => void }) {
  const Icon = THING_ICONS[item.thing];
  const thing = SHELF_THINGS[item.thing];
  const mine = item.by.id === selfId;
  const forMe = item.for?.id === selfId;
  const blocked = selfId ? shelfTakeProblem(item, selfId) : "Sign in to take things.";
  const who = thing.group === "found" ? (mine ? "Found by you" : `Found by ${item.by.name}`) : mine ? "From you" : `From ${item.by.name}`;
  return (
    <li className={`flex flex-col gap-2 rounded-2xl border p-3 ${forMe ? "border-[#3a6ee8] bg-[#f3f6fe]" : "border-[#e6e8ec]"}`}>
      <div className="flex items-start gap-2.5">
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${tint}`}>
          <Icon size={17} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold">{thing.label}</p>
          <p className={`truncate text-[11.5px] ${muted}`}>
            {who}, {whenOf(item.at)}
          </p>
        </div>
      </div>
      {item.note && <p className="line-clamp-2 text-[12.5px] leading-5 text-[#2b2f38]">{item.note}</p>}
      <div className="mt-auto flex items-center justify-between gap-2">
        <span className={`truncate text-[11.5px] font-semibold ${forMe ? "text-[#2f5ed0]" : muted}`}>
          {item.for ? (forMe ? "For you" : `For ${item.for.name}`) : "For anyone"}
        </span>
        <button
          type="button"
          onClick={onTake}
          disabled={!!blocked}
          title={blocked ?? undefined}
          className={`inline-flex h-8 shrink-0 cursor-pointer items-center rounded-lg px-3 text-xs font-semibold transition disabled:cursor-default disabled:opacity-45 motion-reduce:transition-none ${forMe ? "bg-[#3a6ee8] text-white hover:bg-[#2f5ed0]" : "bg-[#f1f2f4] text-[#12151c] hover:bg-[#e6e8ec]"} ${focus}`}
        >
          {mine ? "Take back" : thing.group === "found" ? "It's mine" : "Take"}
        </button>
      </div>
    </li>
  );
}
