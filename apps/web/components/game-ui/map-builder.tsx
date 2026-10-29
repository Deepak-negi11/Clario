"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type RefObject } from "react";
import { Armchair, BrickWall, Eraser, LoaderCircle, MapPin, PaintBucket, RotateCw, Save, SquareDashed, Trash2, Undo2, X } from "lucide-react";
import {
  CUSTOM_FLOORS, ITEM_KINDS, addRoom, eraseAt, itemSpec, paintFloor, placeItem, placementProblem, removeRoom, renameRoom,
  setSpawn, setWall,
  type CustomFloor, type CustomMap, type Dir, type EditResult, type Fabric, type ItemCategory, type ItemKind,
} from "@repo/shared";
import type { SceneBridge } from "../phaser/scene-bridge";
import { FLOOR_COLORS } from "../../lib/maps/floor-colors";

// The map builder: the space's owner paints walls and floors, draws named rooms, places
// furniture and buildings, and moves the spawn point. Edits show on the map straight away
// (through `onPreview`) and reach everyone else when saved.

type Tool = "furniture" | "walls" | "floors" | "rooms" | "spawn" | "erase";
const TOOLS: { id: Tool; label: string; hint: string; Icon: typeof Armchair }[] = [
  { id: "furniture", label: "Furniture", hint: "Click the map to place. R turns it.", Icon: Armchair },
  { id: "walls", label: "Walls", hint: "Click or drag to build walls. Use the eraser to make doors.", Icon: BrickWall },
  { id: "floors", label: "Floors", hint: "Click or drag to paint the floor.", Icon: PaintBucket },
  { id: "rooms", label: "Rooms", hint: "Drag a rectangle on the map, then name it. People in a room share its chat.", Icon: SquareDashed },
  { id: "spawn", label: "Spawn", hint: "Click where people arrive when they join.", Icon: MapPin },
  { id: "erase", label: "Eraser", hint: "Click or drag to remove furniture, then walls.", Icon: Eraser },
];
const CATEGORIES: ItemCategory[] = ["Office", "Meetings", "Lounge", "Kitchen", "Fun", "Tech", "Decor", "Outdoor", "Buildings"];
const FABRIC_SWATCHES: Record<Fabric, string> = {
  navy: "#3a4f8a", coral: "#d4675a", teal: "#2c8c84", mustard: "#d29c33", sage: "#76946d", grey: "#6c7282",
  blue: "#5f92e2", purple: "#a07ae2", pink: "#e877aa", white: "#dcdfe6", leather: "#ad6f46",
};
const FLOOR_LABELS: Record<CustomFloor, string> = {
  wood: "Wood", carpet: "Blue carpet", tile: "Kitchen tile", herringbone: "Parquet", terrazzo: "Terrazzo", sage: "Sage carpet",
  arcade: "Game carpet", sand: "Sand carpet", office: "Grey carpet", raised: "Server floor", concrete: "Concrete", teal: "Teal carpet",
  zigzag: "Zigzag carpet", porcelain: "Porcelain tile", brick: "Brick", lavender: "Lavender carpet",
  maple: "Light parquet", crosstile: "Cross tile", damask: "Patterned carpet",
  path: "Paving",
};
const DIR_LABEL: Record<Dir, string> = { down: "Front", up: "Back", left: "Left", right: "Right" };
const MAX_HISTORY = 50;
const hex = (color: number) => `#${color.toString(16).padStart(6, "0")}`;

const fieldLabel = "font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[#5c6371]";
const iconButton =
  "grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-lg text-[#5c6371] transition hover:bg-[#f4f5f7] hover:text-[#12151c] disabled:cursor-default disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#12151c]";
const chip = (on: boolean) =>
  `cursor-pointer rounded-lg px-2.5 py-1 text-[12px] font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#12151c] ${
    on ? "bg-[#12151c] text-white" : "bg-[#f4f5f7] text-[#4b5260] hover:bg-[#eceef1]"
  }`;

export function MapBuilder({
  map,
  bridgeRef,
  saving,
  saveError,
  onPreview,
  onSave,
  onClose,
}: {
  map: CustomMap;
  bridgeRef: RefObject<SceneBridge>;
  saving: boolean;
  saveError: string | null;
  onPreview: (draft: CustomMap) => void;
  onSave: (draft: CustomMap) => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const [draft, setDraft] = useState(map);
  const [history, setHistory] = useState<CustomMap[]>([]);
  const [tool, setTool] = useState<Tool>("furniture");
  const [category, setCategory] = useState<ItemCategory>("Office");
  const [kind, setKind] = useState<ItemKind>("desk-l");
  const [dir, setDir] = useState<Dir>("down");
  const [fabric, setFabric] = useState<Fabric>("navy");
  const [floor, setFloor] = useState<CustomFloor | null>("wood");
  const [message, setMessage] = useState<string | null>(null);
  const [pendingRoom, setPendingRoom] = useState<{ from: { x: number; y: number }; to: { x: number; y: number } } | null>(null);
  const [roomName, setRoomName] = useState("");
  const [previews, setPreviews] = useState<Record<string, string | null>>({});
  const dirty = draft !== map;

  // The scene calls back through the bridge, so it reads everything through this ref.
  const state = useRef({ draft, tool, kind, dir, fabric, floor, dragFrom: null as { x: number; y: number } | null, lastTile: "" });
  state.current = { ...state.current, draft, tool, kind, dir, fabric, floor };

  useEffect(() => onPreview(draft), [draft, onPreview]);
  useEffect(() => setDraft(map), [map]);

  // One undo step per click or drag, not per tile painted.
  const commit = useCallback((result: EditResult, newStep: boolean) => {
    if ("error" in result) {
      setMessage(result.error);
      return;
    }
    setMessage(null);
    const before = state.current.draft;
    if (result.map === before) return;
    if (newStep) setHistory((past) => [...past, before].slice(-MAX_HISTORY));
    state.current.draft = result.map;
    setDraft(result.map);
  }, []);

  const undo = useCallback(() => {
    setHistory((past) => {
      const previous = past[past.length - 1];
      if (previous) {
        state.current.draft = previous;
        setDraft(previous);
      }
      return past.slice(0, -1);
    });
  }, []);

  const showGhost = useCallback((x: number, y: number) => {
    const { draft: current, tool: active, kind: piece, dir: facing, fabric: cloth, dragFrom } = state.current;
    const bridge = bridgeRef.current;
    if (active === "furniture") {
      const spec = itemSpec(piece);
      bridge.setBuilderGhost?.({ x, y, w: spec.w, h: spec.h, ok: !placementProblem(current, { kind: piece, x, y }), item: { kind: piece, dir: facing, fabric: cloth } });
    } else if (active === "rooms" && dragFrom) {
      bridge.setBuilderGhost?.({ x: Math.min(dragFrom.x, x), y: Math.min(dragFrom.y, y), w: Math.abs(x - dragFrom.x) + 1, h: Math.abs(y - dragFrom.y) + 1, ok: true });
    } else {
      bridge.setBuilderGhost?.({ x, y, w: 1, h: 1, ok: true });
    }
  }, [bridgeRef]);

  // Clicks and drags on the map, from the scene.
  const onPointer = useCallback((x: number, y: number, phase: "down" | "drag" | "hover" | "up") => {
    const s = state.current;
    const tile = `${x},${y}`;
    if (phase === "hover") { showGhost(x, y); return; }
    if (phase === "down") s.dragFrom = { x, y };
    if (phase === "up") {
      if (s.tool === "rooms" && s.dragFrom) {
        setPendingRoom({ from: s.dragFrom, to: { x, y } });
        setRoomName("");
      }
      s.dragFrom = null;
      s.lastTile = "";
      showGhost(x, y);
      return;
    }
    showGhost(x, y);
    if (phase === "drag" && tile === s.lastTile) return;
    const newStep = phase === "down";
    s.lastTile = tile;
    switch (s.tool) {
      case "furniture": if (newStep) commit(placeItem(s.draft, s.kind, x, y, s.dir, s.fabric), true); break;
      case "walls": commit(setWall(s.draft, x, y, true), newStep); break;
      case "floors": commit(paintFloor(s.draft, x, y, s.floor), newStep); break;
      case "erase": {
        const result = eraseAt(s.draft, x, y);
        if (!("error" in result) || newStep) commit(result, newStep);
        break;
      }
      case "spawn": if (newStep) commit(setSpawn(s.draft, x, y), true); break;
      case "rooms": break;
    }
  }, [commit, showGhost]);

  // Take over clicks on the map while the builder is open.
  useEffect(() => {
    const bridge = bridgeRef.current;
    bridge.builder = { active: true, onPointer };
    return () => {
      bridge.builder = undefined;
      bridge.setBuilderGhost?.(null);
    };
  }, [bridgeRef, onPointer]);

  // R turns the piece; Ctrl/Cmd+Z undoes. Ignored while typing (e.g. a room name).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "")) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        undo();
      } else if (event.key.toLowerCase() === "r" && state.current.tool === "furniture") {
        const faces = itemSpec(state.current.kind).faces;
        if (faces?.length) setDir((current) => faces[(faces.indexOf(current) + 1) % faces.length] ?? "down");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [undo]);

  const kindsInCategory = useMemo(() => ITEM_KINDS.filter((item) => itemSpec(item).category === category), [category]);

  // Palette pictures come from the scene's own sprites, so they match the map exactly.
  useEffect(() => {
    const preview = bridgeRef.current.previewItem;
    if (!preview) return;
    const missing = kindsInCategory.filter((item) => !(item in previews));
    if (!missing.length) return;
    setPreviews((current) => ({ ...current, ...Object.fromEntries(missing.map((item) => [item, preview({ kind: item, fabric: "navy" })])) }));
  }, [bridgeRef, kindsInCategory, previews]);

  const spec = itemSpec(kind);
  const hint = TOOLS.find((entry) => entry.id === tool)!.hint;

  const confirmRoom = () => {
    if (!pendingRoom) return;
    const result = addRoom(state.current.draft, roomName, pendingRoom.from, pendingRoom.to);
    commit(result, true);
    if (!("error" in result)) setPendingRoom(null);
  };

  return (
    <section
      aria-labelledby={titleId}
      onKeyDown={(event) => {
        // Keep typing out of the Phaser scene, which listens for arrow keys on window.
        if ((event.target as HTMLElement).tagName === "INPUT") event.stopPropagation();
      }}
      className="pointer-events-auto absolute left-[76px] top-3 z-[66] flex max-h-[calc(100dvh-1.5rem)] w-[min(22rem,calc(100vw-6rem))] flex-col overflow-hidden rounded-2xl border border-black/5 bg-white/95 text-[#12151c] shadow-[0_18px_44px_-18px_rgba(18,21,28,0.45)] backdrop-blur-md"
    >
      <header className="flex items-center gap-1 border-b border-[#eceef1] px-3 py-2.5">
        <h2 id={titleId} className="flex-1 pl-1 text-sm font-semibold">
          Map builder
          {dirty && <span className="ml-2 align-middle text-[11px] font-medium text-[#8a5300]">Unsaved</span>}
        </h2>
        <button type="button" onClick={undo} disabled={!history.length} aria-label="Undo" title="Undo (Ctrl+Z)" className={iconButton}>
          <Undo2 size={16} aria-hidden="true" />
        </button>
        <button type="button" onClick={onClose} aria-label="Close the map builder" title="Close" className={iconButton}>
          <X size={16} aria-hidden="true" />
        </button>
      </header>

      <div role="toolbar" aria-label="Tools" className="grid grid-cols-6 gap-1 border-b border-[#eceef1] p-2">
        {TOOLS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => { setTool(id); setPendingRoom(null); setMessage(null); }}
            aria-pressed={tool === id}
            title={label}
            className={`flex cursor-pointer flex-col items-center gap-0.5 rounded-lg py-1.5 text-[10px] font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#12151c] ${
              tool === id ? "bg-[#12151c] text-white" : "text-[#4b5260] hover:bg-[#f4f5f7]"
            }`}
          >
            <Icon size={17} aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
        <p className="text-[12px] leading-[18px] text-[#5c6371]">{hint}</p>

        {tool === "furniture" && (
          <>
            <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Category">
              {CATEGORIES.map((name) => (
                <button key={name} type="button" onClick={() => setCategory(name)} aria-pressed={category === name} className={chip(category === name)}>
                  {name}
                </button>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-1.5" role="group" aria-label="Pieces">
              {kindsInCategory.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => { setKind(item); setDir("down"); }}
                  aria-pressed={kind === item}
                  className={`flex cursor-pointer flex-col items-center gap-1 rounded-xl border p-1.5 text-center text-[11px] leading-[14px] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#12151c] ${
                    kind === item ? "border-[#12151c] bg-[#f4f5f7]" : "border-[#eceef1] hover:border-[#c9ccd3]"
                  }`}
                >
                  <span className="grid h-12 w-full place-items-center">
                    {previews[item] ? (
                      // eslint-disable-next-line @next/next/no-img-element -- a data URL from the game canvas, not a file
                      <img src={previews[item]!} alt="" className="max-h-12 max-w-full object-contain [image-rendering:pixelated]" />
                    ) : (
                      <span className="h-8 w-8 rounded-md bg-[#eef0f3]" />
                    )}
                  </span>
                  {itemSpec(item).label}
                </button>
              ))}
            </div>
            {(spec.faces?.length || spec.fabric) && (
              <div className="mt-3 space-y-2.5 rounded-xl bg-[#f7f8fa] p-2.5">
                {!!spec.faces?.length && (
                  <div className="flex items-center gap-2">
                    <span className={fieldLabel}>Facing</span>
                    <div className="flex flex-wrap gap-1">
                      {spec.faces.map((way) => (
                        <button key={way} type="button" onClick={() => setDir(way)} aria-pressed={dir === way} className={chip(dir === way)}>
                          {DIR_LABEL[way]}
                        </button>
                      ))}
                    </div>
                    <RotateCw size={14} className="ml-auto text-[#8a909b]" aria-label="R turns it" />
                  </div>
                )}
                {spec.fabric && (
                  <div className="flex items-center gap-2">
                    <span className={fieldLabel}>Fabric</span>
                    <div className="flex flex-wrap gap-1.5">
                      {(Object.keys(FABRIC_SWATCHES) as Fabric[]).map((name) => (
                        <button
                          key={name}
                          type="button"
                          onClick={() => setFabric(name)}
                          aria-pressed={fabric === name}
                          aria-label={name}
                          title={name}
                          className={`h-6 w-6 cursor-pointer rounded-full shadow-[inset_0_0_0_1px_rgba(18,21,28,0.18)] ring-offset-2 transition hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#12151c] ${fabric === name ? "ring-2 ring-[#12151c]" : ""}`}
                          style={{ backgroundColor: FABRIC_SWATCHES[name] }}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {tool === "floors" && (
          <div className="mt-3 grid grid-cols-2 gap-1.5" role="group" aria-label="Floors">
            {[...CUSTOM_FLOORS, null].map((name) => (
              <button
                key={name ?? "grass"}
                type="button"
                onClick={() => setFloor(name)}
                aria-pressed={floor === name}
                className={`flex cursor-pointer items-center gap-2 rounded-xl border px-2 py-1.5 text-left text-[12px] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#12151c] ${
                  floor === name ? "border-[#12151c] bg-[#f4f5f7]" : "border-[#eceef1] hover:border-[#c9ccd3]"
                }`}
              >
                <span
                  className="h-5 w-5 shrink-0 rounded-md ring-1 ring-black/10"
                  style={{ backgroundColor: name === null ? "#7cc06a" : name === "path" ? "#cfc9bd" : hex(FLOOR_COLORS[name]) }}
                />
                {name === null ? "Grass (outside)" : FLOOR_LABELS[name]}
              </button>
            ))}
          </div>
        )}

        {tool === "rooms" && (
          <div className="mt-3 space-y-2">
            {pendingRoom && (
              <form
                onSubmit={(event) => { event.preventDefault(); confirmRoom(); }}
                className="flex items-center gap-1.5 rounded-xl bg-[#f7f8fa] p-2"
              >
                <input
                  autoFocus
                  value={roomName}
                  onChange={(event) => setRoomName(event.target.value)}
                  maxLength={30}
                  placeholder="Room name, e.g. Meeting Room"
                  aria-label="New room name"
                  className="min-w-0 flex-1 rounded-lg border border-[#e6e7ea] bg-white px-2.5 py-1.5 text-[13px] outline-none focus:border-[#12151c]/50 focus:ring-2 focus:ring-[#12151c]/10"
                />
                <button type="submit" className="cursor-pointer rounded-lg bg-[#12151c] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-black">Add</button>
                <button type="button" onClick={() => setPendingRoom(null)} aria-label="Cancel the new room" className={iconButton}>
                  <X size={14} aria-hidden="true" />
                </button>
              </form>
            )}
            {draft.rooms.length === 0 && !pendingRoom && <p className="text-[12px] text-[#8a909b]">No rooms yet.</p>}
            <ul className="space-y-1.5">
              {draft.rooms.map((room) => (
                <li key={room.id} className="flex items-center gap-1.5">
                  <input
                    defaultValue={room.name}
                    maxLength={30}
                    aria-label={`Rename ${room.name}`}
                    onBlur={(event) => { if (event.target.value.trim() !== room.name) commit(renameRoom(state.current.draft, room.id, event.target.value), true); }}
                    className="min-w-0 flex-1 rounded-lg border border-[#e6e7ea] bg-[#f7f8fa] px-2.5 py-1.5 text-[13px] outline-none focus:border-[#12151c]/50 focus:bg-white"
                  />
                  <span className="shrink-0 font-mono text-[10px] text-[#8a909b]">{room.bounds.width}×{room.bounds.height}</span>
                  <button type="button" onClick={() => commit(removeRoom(state.current.draft, room.id), true)} aria-label={`Delete ${room.name}`} className={iconButton}>
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <footer className="border-t border-[#eceef1] px-3 py-2.5">
        {(message || saveError) && (
          <p role="alert" className="mb-2 rounded-lg bg-[#fff1f0] px-2.5 py-1.5 text-[12px] leading-[17px] text-[#b42318]">{saveError ?? message}</p>
        )}
        <div className="flex items-center gap-2">
          <span className="flex-1 text-[11px] text-[#8a909b]">{draft.items.length} {draft.items.length === 1 ? "piece" : "pieces"} · {draft.rooms.length} {draft.rooms.length === 1 ? "room" : "rooms"}</span>
          {dirty && (
            <button type="button" onClick={() => { setHistory([]); setDraft(map); }} disabled={saving} className="cursor-pointer rounded-lg px-2.5 py-1.5 text-[12px] font-semibold text-[#5c6371] hover:bg-[#f4f5f7] hover:text-[#12151c]">
              Discard
            </button>
          )}
          <button
            type="button"
            onClick={() => onSave(draft)}
            disabled={!dirty || saving}
            className="flex cursor-pointer items-center gap-1.5 rounded-xl bg-[#12151c] px-3.5 py-1.5 text-[13px] font-semibold text-white transition hover:bg-black disabled:cursor-default disabled:bg-[#e6e7ea] disabled:text-[#6b7180] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#12151c]"
          >
            {saving ? <LoaderCircle size={14} className="animate-spin" aria-hidden="true" /> : <Save size={14} aria-hidden="true" />}
            {saving ? "Saving…" : "Save for everyone"}
          </button>
        </div>
      </footer>
    </section>
  );
}
