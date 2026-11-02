"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { DoorOpen, HandHeart, Inbox, PenLine, X, type LucideIcon } from "lucide-react";
import { getMapTemplate, isClarioHq, roomStatus, type CustomMap, type CustomMapItem, type MapTemplateId } from "@repo/shared";
import { HQ_ITEMS, HQ_WALL_DECOR } from "../../lib/maps/clario-hq";
import { CAMPUS_ITEMS, CLASSIC_OFFICE_ITEMS } from "../../lib/maps/classic-campus";
import { itemSpots, roomSpots, spotAt, wallBoardSpots, type WorkplaceSpot } from "../../lib/workplace/spots";
import type { SceneBridge } from "../phaser/scene-bridge";
import { LockerPanel } from "./locker-panel";
import { timeOf } from "./panel-kit";
import { RoomBookingPanel } from "./room-booking-panel";
import { SwapShelfPanel } from "./swap-shelf-panel";
import { useNow, useWorkplace, type WorkplaceLink } from "./use-workplace";
import { WhiteboardPanel } from "./whiteboard-panel";

// The shared office things on the map. Walk up to a meeting room's door, a whiteboard, the lockers
// or the kitchen shelf, and a chip offers it (press E, or click). It works out where you are from
// your tile, so it's the same in the 2D view and the 3D one, on every map.

type Open =
  | { kind: "room"; room: { id: string; name: string } }
  | { kind: "whiteboard"; board: { id: string; label: string } }
  | { kind: "lockers" }
  | { kind: "shelf" };

const chipButton =
  "inline-flex min-h-10 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#3a6ee8] px-3 text-xs font-semibold text-white transition hover:bg-[#2f5ed0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white active:scale-[0.98] motion-reduce:transition-none";

function mapItems(mapTemplate: MapTemplateId | null, customMap: CustomMap | null): readonly CustomMapItem[] {
  if (mapTemplate === "custom-office") return customMap?.items ?? [];
  if (isClarioHq(mapTemplate)) return HQ_ITEMS;
  return mapTemplate === "coworking-campus" ? CAMPUS_ITEMS : CLASSIC_OFFICE_ITEMS;
}

function isTyping(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
}

export function WorkplaceOnMap({
  bridgeRef,
  link,
  self,
  mapTemplate,
  customMap,
}: {
  bridgeRef: RefObject<SceneBridge>;
  link: WorkplaceLink;
  self: { x: number; y: number } | null;
  mapTemplate: MapTemplateId | null;
  customMap: CustomMap | null;
}) {
  const workplace = useWorkplace(link);
  const [open, setOpen] = useState<Open | null>(null);
  const [openedAt, setOpenedAt] = useState(0);
  const reduced = useReducedMotion();
  const now = useNow();

  // The map's walls come from the scene once it has drawn the map; until then every tile round a
  // room counts as its door.
  const [walls, setWalls] = useState<ReadonlySet<string> | null>(null);
  useEffect(() => {
    const read = () => {
      const list = bridgeRef.current.map?.walls;
      if (list) setWalls((current) => (current && current.size === list.length ? current : new Set(list)));
    };
    read();
    const timer = window.setInterval(read, 2000);
    return () => window.clearInterval(timer);
  }, [bridgeRef]);

  const spots = useMemo(() => {
    if (!mapTemplate) return null;
    const rooms = mapTemplate === "custom-office" ? (customMap?.rooms ?? []) : getMapTemplate(mapTemplate).chatRooms;
    // Clario HQ also has whiteboards painted on its walls.
    const onWalls = isClarioHq(mapTemplate) ? wallBoardSpots(HQ_WALL_DECOR.filter((decor) => decor.kind === "whiteboard"), rooms) : [];
    return { items: [...itemSpots(mapItems(mapTemplate, customMap), rooms), ...onWalls], rooms: roomSpots(rooms, walls) };
  }, [mapTemplate, customMap, walls]);

  // What the map is offering right now. The map's own chip (books, bikes, the printer...) and the
  // map builder come first; while any panel is open, nothing is offered.
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    const check = () => {
      const bridge = bridgeRef.current;
      setBlocked(!!(bridge.propInteraction || bridge.builder?.active || bridge.mapOverlays?.size));
    };
    check();
    const timer = window.setInterval(check, 150);
    return () => window.clearInterval(timer);
  }, [bridgeRef]);
  const spot = spots && self && !open && !blocked ? spotAt(self.x, self.y, spots) : null;

  const show = useCallback((next: Open) => {
    setOpenedAt(Date.now());
    setOpen(next);
  }, []);
  const openSpot = useCallback(
    (at: WorkplaceSpot) => {
      if (at.kind === "room") show({ kind: "room", room: at.room });
      else if (at.kind === "whiteboard") show({ kind: "whiteboard", board: { id: at.board, label: at.label } });
      else show({ kind: at.kind });
    },
    [show],
  );

  // E uses what the chip offers, as it does for everything else on the map.
  const spotRef = useRef(spot);
  spotRef.current = spot;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "e" || event.repeat || event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target)) return;
      const at = spotRef.current;
      if (!at) return;
      event.preventDefault();
      openSpot(at);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openSpot]);

  const close = useCallback(() => setOpen(null), []);
  const waiting = workplace.locker?.length ?? 0;
  const onShelf = workplace.shelf?.length ?? 0;

  const chip = ((): { icon: LucideIcon; title: string; detail: string; action: string } | null => {
    if (!spot) return null;
    if (spot.kind === "room") {
      const status = roomStatus(workplace.bookings, spot.room.id, now);
      const detail = status.current
        ? `In use by ${status.current.userId === link.selfId ? "you" : status.current.name} until ${timeOf(status.current.end)}`
        : status.next
          ? `Free until ${timeOf(status.next.start)}`
          : "Free now";
      return { icon: DoorOpen, title: spot.room.name, detail, action: status.current ? "See times" : "Book" };
    }
    if (spot.kind === "whiteboard") return { icon: PenLine, title: "Whiteboard", detail: `${spot.label}, saved for everyone`, action: "Draw" };
    if (spot.kind === "lockers") {
      return { icon: Inbox, title: "Mail and parcel lockers", detail: waiting ? `${waiting} ${waiting === 1 ? "thing" : "things"} waiting for you` : "Send a document or a parcel", action: "Open" };
    }
    return { icon: HandHeart, title: "Kitchen shelf", detail: onShelf ? `${onShelf} ${onShelf === 1 ? "thing" : "things"} on the shelf` : "Leave a snack or something you found", action: "Look" };
  })();

  return (
    <>
      {/* On a phone the chip sits above the chat button and clear of the zoom buttons on the right. */}
      <div className="pointer-events-none absolute bottom-[10.5rem] left-4 z-[38] w-[calc(100vw-6.5rem)] sm:bottom-24 sm:left-1/2 sm:w-[min(23rem,calc(100vw-2rem))] sm:-translate-x-1/2">
        <AnimatePresence initial={false}>
          {chip && spot && (
            <motion.aside
              key={spot.kind === "room" ? spot.room.id : spot.kind === "whiteboard" ? spot.board : spot.kind}
              aria-label="Nearby"
              initial={{ opacity: 0, y: reduced ? 0 : 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: reduced ? 0 : 3 }}
              transition={{ duration: reduced ? 0.06 : 0.16 }}
              className="pointer-events-auto flex items-center gap-2.5 rounded-2xl bg-[#1b1d2a]/20 p-2.5 text-white shadow-[0_8px_24px_-14px_rgba(0,0,0,0.5)] ring-1 ring-white/30 backdrop-blur-[3px] [text-shadow:0_1px_2px_rgba(0,0,0,0.6)]"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-black/20">
                <chip.icon size={17} aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-[12px] font-semibold">{chip.title}</h2>
                <p role="status" className="mt-0.5 truncate text-[10px] leading-4 text-white/90">
                  {chip.detail}
                </p>
              </div>
              <button type="button" onClick={() => openSpot(spot)} className={chipButton}>
                {chip.action}
                <kbd className="rounded border border-current/20 px-1 py-px text-[9px] opacity-70">E</kbd>
              </button>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>

      {/* New things for you: a delivery to your locker, or something left for you on the shelf. */}
      <div className="pointer-events-none absolute bottom-[16rem] left-4 z-[39] flex w-[calc(100vw-6.5rem)] flex-col gap-2 sm:bottom-24 sm:w-[min(20rem,calc(100vw-2rem))]" aria-live="polite">
        <AnimatePresence initial={false}>
          {workplace.arrivals.map((arrival) => (
            <Arrival
              key={arrival.id}
              text={arrival.text}
              reduced={!!reduced}
              onOpen={() => {
                workplace.dismissArrival(arrival.id);
                show({ kind: arrival.kind === "locker" ? "lockers" : "shelf" });
              }}
              onDismiss={() => workplace.dismissArrival(arrival.id)}
            />
          ))}
        </AnimatePresence>
      </div>

      {open?.kind === "room" && <RoomBookingPanel bridgeRef={bridgeRef} room={open.room} workplace={workplace} openedAt={openedAt} onClose={close} />}
      {open?.kind === "whiteboard" && <WhiteboardPanel bridgeRef={bridgeRef} board={open.board} workplace={workplace} onClose={close} />}
      {open?.kind === "lockers" && <LockerPanel bridgeRef={bridgeRef} workplace={workplace} people={link.people} openedAt={openedAt} onClose={close} />}
      {open?.kind === "shelf" && <SwapShelfPanel bridgeRef={bridgeRef} workplace={workplace} people={link.people} openedAt={openedAt} onClose={close} />}
    </>
  );
}

function Arrival({ text, reduced, onOpen, onDismiss }: { text: string; reduced: boolean; onOpen: () => void; onDismiss: () => void }) {
  // Gone by itself after a while; it's still waiting where it was left.
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  useEffect(() => {
    const timer = window.setTimeout(() => dismissRef.current(), 12_000);
    return () => window.clearTimeout(timer);
  }, []);
  return (
    <motion.div
      initial={{ opacity: 0, x: reduced ? 0 : -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduced ? 0.05 : 0.18 }}
      className="pointer-events-auto flex items-center gap-2 rounded-2xl bg-white p-2 pl-3 text-[#12151c] shadow-[0_12px_30px_-14px_rgba(18,21,28,0.55)] ring-1 ring-black/5"
      role="status"
    >
      <p className="min-w-0 flex-1 text-[12.5px] leading-5">{text}</p>
      <button type="button" onClick={onOpen} className="shrink-0 cursor-pointer rounded-lg px-2 py-1 text-xs font-semibold text-[#2f5ed0] hover:bg-[#f1f4fd] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3a6ee8]">
        Open
      </button>
      <button type="button" onClick={onDismiss} aria-label="Dismiss" className="grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-lg text-[#5c6371] hover:bg-black/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3a6ee8]">
        <X size={14} aria-hidden="true" />
      </button>
    </motion.div>
  );
}
