import Phaser from "phaser";
import { BIKES, DRINK_NAMES, DRINKS, SIPS_PER_CAN, type Bike, type Dir, type Drink, type PlayerProp } from "@repo/shared";
export { RIDE_STEP_MS } from "@repo/shared";
import { ITEM_SPECS, type HqItem } from "../../../lib/maps/clario-hq";
import type { SceneBridge } from "../scene-bridge";
import { BIKE_SIDE_HUB, RACK_SIZE, RACK_SLOTS } from "./reference-art";
import { vendingPickupOffset, vendingPickupScale } from "./office-props-art";

// Bikes and drinks on the 2D map (Clario HQ, or a map someone built with a bike rack or a
// vending machine). Stand next to the bike rack and press E to ride one
// (faster than walking; E again gets off and the bike goes back to its rack). Stand in front of
// the vending machine and press E: a can drops into the tray; E again takes it. With a can in
// hand, E takes a sip and Q throws it away. Everyone sees who rides which bike and who is
// drinking: props are shared through the space's socket (bridge.props / bridge.setProp).

const TILE = 32;
const ART = 2; // world pixels per art pixel
const SIP_MS = 1300;
const HINT_MS = 6000;

type Rect = { x: number; y: number; w: number; h: number };
export type Holder = { id: string; sprite: Phaser.GameObjects.Sprite; facing: Dir };

export type PropsOnMap = {
    // Draws everyone's bike or can; `self` is the player's tile, `people` everyone on the map.
    update: (self: { x: number; y: number }, people: Holder[]) => void;
    // The scene's E key: getOff first (before talking to anyone), use last (after games and TVs).
    getOff: () => boolean;
    use: () => boolean;
    // The scene's Q key: throw your can away.
    drop: () => boolean;
    riding: (userId: string | null | undefined) => boolean;
    // True while getOff would take E, so other tags stay hidden.
    busy: () => boolean;
    // The map's items changed (the map builder): find the rack and the machine again.
    setItems: (items: readonly HqItem[]) => void;
};

// `items`: the map's furniture. The bikes stand in the rack whose variant is 1 (drawn empty, see
// rideableRack), and drinks come from the first vending machine.
type Options = { items: readonly HqItem[]; font: string; bridge?: SceneBridge; selfId: () => string | null };

// The items with one rack drawn empty for the bikes to stand in: the one marked so (variant 1), or
// else the first. A map someone built has no marked rack, so its first one is used.
export function rideableRack(items: readonly HqItem[]): HqItem[] {
    if (items.some((item) => item.kind === "bike-rack" && item.variant === 1)) return [...items];
    const first = items.findIndex((item) => item.kind === "bike-rack");
    return items.map((item, i) => (i === first ? { ...item, variant: 1 } : item));
}

// Next to a rectangle of tiles (diagonals count).
function inReach(rect: Rect, x: number, y: number) {
    const dx = Math.max(rect.x - x, 0, x - (rect.x + rect.w - 1));
    const dy = Math.max(rect.y - y, 0, y - (rect.y + rect.h - 1));
    return Math.max(dx, dy) === 1;
}

// On the row just below it, square in front (a machine is used face on, not from the side).
const inFront = (rect: Rect, x: number, y: number) => y === rect.y + rect.h && x >= rect.x && x < rect.x + rect.w;

// A soft clunk for a can landing in the tray, made on the spot (no sound files).
let audio: AudioContext | null = null;
function clunk() {
    try {
        audio ??= new AudioContext();
        const now = audio.currentTime;
        const thud = audio.createOscillator();
        const gain = audio.createGain();
        thud.type = "triangle";
        thud.frequency.setValueAtTime(180, now);
        thud.frequency.exponentialRampToValueAtTime(60, now + 0.18);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        thud.connect(gain).connect(audio.destination);
        thud.start(now);
        thud.stop(now + 0.26);
    } catch {
        // No audio (blocked or unsupported): the can still drops.
    }
}

export function addPropsOnMap(scene: Phaser.Scene, { items, font, bridge, selfId }: Options): PropsOnMap {
    let rack: Rect | null = null;
    let machine: Rect | null = null;
    // The rack's bikes, drawn on their own over the empty rack so a ridden bike can leave it.
    const rackBikes = new Map<Bike, Phaser.GameObjects.Image>();
    // The vending machine's tray, aligned with the artwork's pickup opening.
    let tray: { x: number; y: number; depth: number } | null = null;
    let trayDrink: Drink | null = null;
    let trayCan: Phaser.GameObjects.Image | null = null;

    const setItems = (list: readonly HqItem[]) => {
        const rackItem = list.find((item) => item.kind === "bike-rack" && item.variant === 1);
        const machineItem = list.find((item) => item.kind === "vending-machine");
        rack = rackItem ? { x: rackItem.x, y: rackItem.y, ...ITEM_SPECS["bike-rack"] } : null;
        const moved = !machineItem || machine?.x !== machineItem.x || machine?.y !== machineItem.y;
        machine = machineItem ? { x: machineItem.x, y: machineItem.y, ...ITEM_SPECS["vending-machine"] } : null;

        for (const image of rackBikes.values()) image.destroy();
        rackBikes.clear();
        if (rack) {
            const left = (rack.x + rack.w / 2) * TILE - (RACK_SIZE.w * ART) / 2;
            const top = (rack.y + rack.h) * TILE - RACK_SIZE.h * ART;
            const depth = (rack.y + rack.h) * TILE;
            BIKES.forEach((bike, i) => {
                const slot = RACK_SLOTS[bike];
                const image = scene.add.image(left + (slot.x - BIKE_SIDE_HUB.x) * ART, top + (slot.y - BIKE_SIDE_HUB.y) * ART, `hq-ride-${bike}-side`)
                    .setOrigin(0, 0).setDepth(depth + 1 + i);
                rackBikes.set(bike, image);
            });
        }

        tray = machine ? { x: (machine.x + 0.5) * TILE - 2, y: (machine.y + 1) * TILE - vendingPickupOffset(scene), depth: (machine.y + 1) * TILE + 1 } : null;
        // A can waiting in a machine that moved or went is gone with it.
        if (moved && trayDrink) {
            trayDrink = null;
            if (bridge) bridge.vendingTray = null;
            trayCan?.destroy();
            trayCan = null;
        }
    };
    setItems(items);
    let nextDrink = Math.floor(Math.random() * DRINKS.length);

    const makeTag = (color: string) => scene.add.text(0, 0, "", {
        fontFamily: font, fontSize: "12px", fontStyle: "600", color: "#ffffff", backgroundColor: color, padding: { x: 7, y: 4 },
    }).setOrigin(0.5, 1).setDepth(10000).setResolution(3).setVisible(false);
    const spotTag = makeTag("#3686ff");
    const selfHint = makeTag("#12151c");
    let hintUntil = 0;
    let note: { text: string; until: number } | null = null;

    // What each person showed last frame, to start a sip or a throw when it changes.
    const shown = new Map<string, { prop: PlayerProp | null; bike?: Phaser.GameObjects.Image; can?: Phaser.GameObjects.Image; sipFrom: number }>();
    let self = { x: -1, y: -1 };

    const mine = () => {
        const me = selfId();
        return me ? bridge?.props?.[me] ?? null : null;
    };
    const ridden = (bike: Bike) => Object.values(bridge?.props ?? {}).some((prop) => prop.kind === "bike" && prop.bike === bike);
    // False when it couldn't be sent (reconnecting).
    const setProp = (prop: PlayerProp | null) => {
        const sent = !!bridge?.setProp?.(prop);
        if (sent) hintUntil = scene.time.now + HINT_MS;
        return sent;
    };

    const buy = () => {
        const at = tray;
        if (!at) return;
        trayDrink = DRINKS[nextDrink++ % DRINKS.length]!;
        if (bridge) bridge.vendingTray = { drink: trayDrink, at: performance.now() };
        trayCan?.destroy();
        trayCan = scene.add.image(at.x, at.y - 30, `hq-can-${trayDrink}`).setScale(vendingPickupScale(scene)).setDepth(at.depth).setAlpha(0);
        scene.tweens.add({ targets: trayCan, y: at.y, alpha: 1, duration: 260, ease: "Quad.easeIn", onComplete: clunk });
    };

    const throwCan = (from: Phaser.GameObjects.Image) => {
        const fall = scene.add.image(from.x, from.y, from.texture.key).setScale(from.scaleX).setDepth(from.depth).setAngle(from.angle);
        scene.tweens.add({ targets: fall, y: from.y + 22, angle: from.angle + 120, alpha: 0, duration: 520, ease: "Quad.easeIn", onComplete: () => fall.destroy() });
    };

    const api: PropsOnMap = {
        setItems,
        riding: (userId) => !!userId && bridge?.props?.[userId]?.kind === "bike",
        busy: () => mine()?.kind === "bike",

        getOff() {
            if (mine()?.kind !== "bike") return false;
            setProp(null);
            return true;
        },

        use() {
            const prop = mine();
            if (prop?.kind === "bike") return false;
            if (machine && inFront(machine, self.x, self.y)) {
                if (trayDrink) {
                    if (prop) {
                        note = { text: "Finish your drink first", until: scene.time.now + 2500 };
                        return true;
                    }
                    // Reconnecting: the can stays in the tray until it can really be taken.
                    if (!setProp({ kind: "can", drink: trayDrink, sips: 0 })) return true;
                    trayDrink = null;
                    if (bridge) bridge.vendingTray = null;
                    trayCan?.destroy();
                    trayCan = null;
                    return true;
                }
                if (!prop) {
                    buy();
                    return true;
                }
            }
            if (rack && !prop && inReach(rack, self.x, self.y)) {
                const bike = BIKES.find((each) => !ridden(each));
                if (bike) setProp({ kind: "bike", bike });
                else note = { text: "Both bikes are out", until: scene.time.now + 2500 };
                return true;
            }
            if (prop?.kind === "can") {
                setProp(prop.sips < SIPS_PER_CAN ? { ...prop, sips: prop.sips + 1 } : null);
                return true;
            }
            return false;
        },

        drop() {
            if (mine()?.kind !== "can") return false;
            setProp(null);
            return true;
        },

        update(selfTile, people) {
            self = selfTile;
            const now = scene.time.now;
            const prop = mine();

            for (const [bike, image] of rackBikes) image.setVisible(!ridden(bike));

            // The tag over whatever E would use here.
            let spot: { text: string; x: number; y: number } | null = null;
            if (prop?.kind !== "bike") {
                if (machine && inFront(machine, self.x, self.y) && (trayDrink || !prop)) {
                    spot = {
                        text: trayDrink ? `Press E to take your ${DRINK_NAMES[trayDrink]}` : "Press E to buy a drink",
                        x: (machine.x + 0.5) * TILE, y: (machine.y - 1.7) * TILE,
                    };
                } else if (rack && !prop && inReach(rack, self.x, self.y)) {
                    spot = { text: "Press E to ride a bike", x: (rack.x + rack.w / 2) * TILE, y: (rack.y - 0.2) * TILE };
                }
            }
            if (note && note.until > now && (machine || rack)) {
                const where = machine && inFront(machine, self.x, self.y) ? machine : rack!;
                spot = { text: note.text, x: (where.x + where.w / 2) * TILE, y: (where.y - (where === machine ? 1.7 : 0.2)) * TILE };
            }
            spotTag.setVisible(!!spot);
            if (spot) {
                if (spotTag.text !== spot.text) spotTag.setText(spot.text);
                spotTag.setPosition(spot.x, spot.y);
            }

            const seen = new Set<string>();
            for (const { id, sprite, facing } of people) {
                seen.add(id);
                const current = bridge?.props?.[id] ?? null;
                let state = shown.get(id);
                if (!state) {
                    state = { prop: null, sipFrom: -Infinity };
                    shown.set(id, state);
                }
                const before = state.prop;
                if (current?.kind === "can" && before?.kind === "can" && current.sips > before.sips) state.sipFrom = now;
                if (!current && before?.kind === "can" && state.can) throwCan(state.can);
                state.prop = current;

                // On a bike: the bike under them, seen from the way they face, and them sat a
                // little higher on its saddle.
                const bike = current?.kind === "bike" ? current.bike : null;
                sprite.setOrigin(0.5, bike ? 0.62 : 0.5);
                if (bike) {
                    const view = facing === "up" ? "back" : facing === "down" ? "front" : "side";
                    const key = `hq-ride-${bike}-${view}`;
                    state.bike ??= scene.add.image(0, 0, key);
                    if (state.bike.texture.key !== key) state.bike.setTexture(key);
                    const feet = sprite.y + sprite.displayHeight / 2;
                    state.bike.setOrigin(0.5, 1).setFlipX(facing === "left")
                        .setPosition(sprite.x, feet + (view === "side" ? 2 : 6))
                        .setDepth(sprite.depth + 1).setAlpha(sprite.alpha).setVisible(true);
                } else state.bike?.setVisible(false);

                // A can in the hand on the side they face; raised to the mouth during a sip.
                if (current?.kind === "can") {
                    const key = `hq-can-${current.drink}`;
                    state.can ??= scene.add.image(0, 0, key).setScale(0.6);
                    if (state.can.texture.key !== key) state.can.setTexture(key);
                    const side = facing === "left" ? -1 : 1;
                    const t = Math.min(1, (now - state.sipFrom) / SIP_MS);
                    const lift = t < 1 ? Math.sin(Math.PI * Math.min(1, t * 1.6)) : 0;
                    // Seen from behind, the hand and the can show just beside the body.
                    const hand = { x: facing === "down" ? 11 : facing === "up" ? 15 : 7 * side, y: 8 };
                    const mouth = { x: facing === "down" ? 5 : facing === "up" ? 12 : 7 * side, y: facing === "up" ? -8 : -3 };
                    state.can.setPosition(sprite.x + hand.x + (mouth.x - hand.x) * lift, sprite.y + hand.y + (mouth.y - hand.y) * lift)
                        .setAngle(-55 * lift * side).setFlipX(facing === "left")
                        .setDepth(sprite.depth + 2).setAlpha(sprite.alpha).setVisible(true);
                } else state.can?.setVisible(false);
            }
            for (const [id, state] of shown) {
                if (seen.has(id)) continue;
                state.bike?.destroy();
                state.can?.destroy();
                shown.delete(id);
            }

            // A reminder of the keys for a few seconds after you get a bike or a drink.
            const me = selfId();
            const mySprite = people.find((person) => person.id === me)?.sprite;
            const hint = !prop ? null
                : prop.kind === "bike" ? "E: get off"
                : prop.sips < SIPS_PER_CAN ? "E: sip · Q: throw away" : "Empty. E or Q: throw it away";
            selfHint.setVisible(!!hint && !!mySprite && now < hintUntil);
            if (hint && mySprite) {
                if (selfHint.text !== hint) selfHint.setText(hint);
                selfHint.setPosition(mySprite.x, mySprite.y - 60);
            }
        },
    };
    return api;
}
