"use client";

import { useEffect, useState, type RefObject } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Bike,
  BookOpen,
  ChevronDown,
  ChevronLeft,
  Coffee,
  Printer,
  RotateCcw,
  Server,
} from "lucide-react";
import { BOOK_IDS, COFFEE_NAMES, COFFEES, LIBRARY_BOOKS, type Coffee as CoffeeKind } from "@repo/shared";
import type { PropInteraction, SceneBridge } from "../phaser/scene-bridge";

const button =
  "inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-xl px-3 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-default disabled:opacity-45 motion-reduce:transition-none";
const quiet = `${button} bg-black/20 hover:bg-black/30`;

// What each coffee is, under its name in the machine's menu.
const COFFEE_NOTES: Record<CoffeeKind, string> = {
  espresso: "A short, strong shot",
  cappuccino: "Espresso under thick foam",
  latte: "Milky, in a tall glass",
  chai: "Spiced tea in a clay kulhad",
  "hot-chocolate": "Cocoa under whipped cream",
};

export function MapInteractions({
  bridgeRef,
}: {
  bridgeRef: RefObject<SceneBridge>;
}) {
  const [interaction, setInteraction] = useState<PropInteraction | null>(null);
  const [bookMenu, setBookMenu] = useState(false);
  const reduced = useReducedMotion();
  useEffect(() => {
    let previous = "";
    const refresh = () => {
      const bridge = bridgeRef.current;
      const value =
        bridge.builder?.active || bridge.mapOverlays?.size
          ? null
          : (bridge.propInteraction ?? null);
      const key = JSON.stringify(value);
      if (key !== previous) {
        previous = key;
        setInteraction(value);
        if (value?.kind !== "shelf") setBookMenu(false);
      }
    };
    refresh();
    const timer = window.setInterval(refresh, 100);
    return () => window.clearInterval(timer);
  }, [bridgeRef]);
  const book = interaction?.book ? LIBRARY_BOOKS[interaction.book] : null;
  const page = book?.pages[interaction?.page ?? 0];
  const carrying =
    interaction && ["book", "can", "cup", "bike"].includes(interaction.kind);
  const coffeeMenu = interaction?.kind === "coffee" && !!interaction.menu;
  // With the coffee menu open, 1 to 5 order (unless you are typing somewhere).
  useEffect(() => {
    if (!coffeeMenu) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || target?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "")) return;
      const coffee = COFFEES[Number(event.key) - 1];
      if (!coffee) return;
      event.preventDefault();
      bridgeRef.current.orderCoffee?.(coffee);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [coffeeMenu, bridgeRef]);
  const Icon =
    interaction?.kind === "book" || interaction?.kind === "shelf"
      ? BookOpen
      : interaction?.kind === "bike" || interaction?.kind === "rack"
        ? Bike
        : interaction?.kind === "printer"
          ? Printer
          : interaction?.kind === "server"
            ? Server
            : Coffee;
  return (
    <div
      className={`pointer-events-none absolute bottom-24 left-1/2 z-[38] -translate-x-1/2 ${book ? "w-[min(24rem,calc(100vw-2rem))]" : "w-[min(23rem,calc(100vw-2rem))]"}`}
    >
      <AnimatePresence initial={false} mode="wait">
        {interaction && (
          <motion.aside
            key={interaction.kind}
            aria-label="Map interactions"
            initial={{ opacity: 0, y: reduced ? 0 : 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduced ? 0 : 3 }}
            transition={{ duration: reduced ? 0.06 : 0.16 }}
            className="pointer-events-auto overflow-hidden rounded-2xl bg-[#1b1d2a]/20 text-white shadow-[0_8px_24px_-14px_rgba(0,0,0,0.5)] ring-1 ring-white/30 backdrop-blur-[3px] [text-shadow:0_1px_2px_rgba(0,0,0,0.6)]"
          >
            <div className="flex items-center gap-2.5 p-2.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-black/20 text-white">
                <Icon size={17} aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-[12px] font-semibold">
                  {interaction.title}
                </h2>
                <p
                  role="status"
                  className="mt-0.5 truncate text-[10px] leading-4 text-white/90"
                >
                  {book || carrying
                    ? interaction.detail
                    : interaction.kind === "shelf"
                      ? "A quiet moment with a book"
                      : interaction.kind === "rack"
                        ? "Explore on two wheels"
                        : interaction.kind === "printer"
                          ? "Notes · documents · office printer"
                          : interaction.detail}
                </p>
              </div>
              {!book && (
                <button
                  type="button"
                  disabled={!interaction.ready}
                  onClick={() => bridgeRef.current.useProp?.()}
                  className={`${button} shrink-0 bg-[#3a6ee8] text-white hover:bg-[#2f5ed0]`}
                >
                  {interaction.kind === "rack"
                    ? "Ride"
                    : interaction.kind === "bike"
                      ? "Get off"
                      : interaction.kind === "shelf"
                        ? "Read"
                        : interaction.kind === "can" || interaction.kind === "cup"
                          ? interaction.action.startsWith("Put")
                            ? "Put away"
                            : interaction.ready
                              ? "Sip"
                              : "Sipping…"
                          : interaction.action}
                  <kbd className="rounded border border-current/20 px-1 py-px text-[9px] opacity-70">
                    E
                  </kbd>
                </button>
              )}
              {interaction.kind === "shelf" && (
                <button
                  type="button"
                  aria-label="Choose a book"
                  aria-expanded={bookMenu}
                  onClick={() => setBookMenu((v) => !v)}
                  className={`${quiet} px-2`}
                >
                  <ChevronDown size={14} />
                </button>
              )}
              {carrying && !book && interaction.kind !== "bike" && (
                <button
                  type="button"
                  aria-label="Put drink away"
                  className={`${quiet} px-2`}
                  onClick={() => bridgeRef.current.returnProp?.()}
                >
                  <RotateCcw size={14} />
                </button>
              )}
            </div>
            {interaction.brew !== undefined && (
              <div
                className="mx-2.5 mb-2.5 h-1.5 overflow-hidden rounded-full bg-black/25"
                role="progressbar"
                aria-label="Brewing"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(interaction.brew * 100)}
              >
                <div className="h-full rounded-full bg-[#ffc46b]" style={{ width: `${interaction.brew * 100}%` }} />
              </div>
            )}
            <AnimatePresence initial={false}>
              {coffeeMenu && (
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: "auto" }}
                  exit={{ height: 0 }}
                  transition={{ duration: reduced ? 0 : 0.18 }}
                  className="overflow-hidden"
                >
                  <div className="grid gap-1 border-t border-white/30 p-2" aria-label="Coffees">
                    {COFFEES.map((id, index) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => bridgeRef.current.orderCoffee?.(id)}
                        className={`${quiet} justify-start text-left`}
                      >
                        <kbd className="rounded border border-current/20 px-1 py-px text-[9px] opacity-70">
                          {index + 1}
                        </kbd>
                        <span className="min-w-0 flex-1">
                          <span className="block">{COFFEE_NAMES[id]}</span>
                          <span className="block text-[10px] font-medium text-white/75">{COFFEE_NOTES[id]}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
              {interaction.kind === "shelf" && bookMenu && (
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: "auto" }}
                  exit={{ height: 0 }}
                  transition={{ duration: reduced ? 0 : 0.18 }}
                  className="overflow-hidden"
                >
                  <div
                    className="grid gap-1 border-t border-white/30 p-2"
                    aria-label="Books to read"
                  >
                    {BOOK_IDS.map((id) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => bridgeRef.current.readBook?.(id)}
                        className={`${quiet} justify-start text-left`}
                      >
                        <span
                          className="h-6 w-4 shrink-0 rounded-r-sm border-l-2 border-white/20"
                          style={{ background: LIBRARY_BOOKS[id].color }}
                          aria-hidden="true"
                        />
                        {LIBRARY_BOOKS[id].title}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            {book && page && (
              <>
                <div className="mx-2.5 overflow-hidden rounded-xl bg-[#f6f0e3] px-4 py-3 text-[#343a3a] [text-shadow:none]">
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.article
                      key={`${interaction.book}:${interaction.page}`}
                      aria-label={`Reading page ${(interaction.page ?? 0) + 1}`}
                      initial={{ opacity: 0, x: reduced ? 0 : 6 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: reduced ? 0 : -6 }}
                      transition={{ duration: reduced ? 0.04 : 0.12 }}
                    >
                      <h3 className="font-serif text-lg font-semibold">
                        {page.title}
                      </h3>
                      <p className="mt-1 text-[13px] leading-relaxed">
                        {page.text}
                      </p>
                    </motion.article>
                  </AnimatePresence>
                </div>
                <footer className="flex items-center gap-2 p-2.5">
                  <button
                    type="button"
                    aria-label="Previous page"
                    disabled={!interaction.ready || interaction.page === 0}
                    className={quiet}
                    onClick={() =>
                      bridgeRef.current.turnBook?.((interaction.page ?? 0) - 1)
                    }
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    type="button"
                    disabled={!interaction.ready}
                    onClick={() => bridgeRef.current.useProp?.()}
                    className={`${button} flex-1 bg-[#3a6ee8] text-white hover:bg-[#2f5ed0]`}
                  >
                    {interaction.action}
                    <kbd className="rounded border border-current/20 px-1 py-px text-[9px]">
                      E
                    </kbd>
                  </button>
                  <button
                    type="button"
                    aria-label="Return book"
                    className={quiet}
                    onClick={() => bridgeRef.current.returnProp?.()}
                  >
                    <RotateCcw size={13} />
                    Return
                  </button>
                </footer>
              </>
            )}
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}
