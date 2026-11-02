import Phaser from "phaser";
import { BIKES, BOOK_IDS, BOOK_PAGE_COUNT, BREW_MS, COFFEE_NAMES, LIBRARY_BOOKS, PAGE_TURN_MS, SIP_DURATION_MS, DRINK_NAMES, DRINKS, SIPS_PER_CAN, type Bike, type BookId, type Coffee, type Dir, type Drink, type PlayerProp } from "@repo/shared";
export { RIDE_STEP_MS } from "@repo/shared";
import { ITEM_SPECS, type HqItem } from "../../../lib/maps/clario-hq";
import type { SceneBridge } from "../scene-bridge";
import { BIKE_SIDE_HUB, RACK_SIZE, RACK_SLOTS } from "./reference-art";
import { vendingPickupOffset, vendingPickupScale } from "./office-props-art";
import { microInReach, microSpotsFor, nearestMicroSpot, type MicroSpot } from "../../../lib/maps/micro-spots";
import { damp, sipLift } from "../../../lib/maps/micro-motion";
import { readingTextures } from "./reading-art";
import { cupKey, makeCoffeeTextures } from "./coffee-art";

// Books, bikes and drinks on every map. Stand next to a shelf and press E to read a book,
// E again to turn a page, or Q to return it. Stand next to the bike rack and press E to ride one
// (faster than walking; E again gets off and the bike goes back to its rack). Stand in front of
// the vending machine and press E: a can drops into the tray; E again takes it. With a can in
// hand, E takes a sip and Q throws it away. At a kitchen coffee machine, E opens its menu: the
// coffee you pick brews for a few seconds (a ring, steam, the cup filling) and waits under the
// spout until you take it with E; then it is carried and sipped like a can. Everyone sees who
// rides which bike and who is drinking: props are shared through the space's socket
// (bridge.props / bridge.setProp).

const TILE = 32;
const ART = 2; // world pixels per art pixel
const SIP_MS = SIP_DURATION_MS;
const HINT_MS = 6000;

type Rect = { x: number; y: number; w: number; h: number };
export type Holder = { id: string; sprite: Phaser.GameObjects.Sprite; facing: Dir };

export type PropsOnMap = {
    // Draws everyone's bike, book or can; `self` is the player's tile, `people` everyone on the map.
    update: (self: { x: number; y: number }, people: Holder[]) => void;
    // The scene's E key: useHeld first (before talking to anyone), use last (after games and TVs).
    useHeld: () => boolean;
    use: (at?: MicroSpot) => boolean;
    // The scene's Q key: put down the held prop.
    drop: () => boolean;
    riding: (userId: string | null | undefined) => boolean;
    // True while useHeld would take E, so other tags stay hidden.
    busy: () => boolean;
    // The map's items changed: find shelves, the rack and the machine again.
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

// A quiet hiss and gurgle while the machine brews (filtered noise), and a soft two-note chime
// when the coffee is ready. Made on the spot, like the clunk.
function brewSound(seconds: number) {
    try {
        audio ??= new AudioContext();
        const now = audio.currentTime;
        const noise = audio.createBuffer(1, audio.sampleRate, audio.sampleRate);
        const data = noise.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        const source = audio.createBufferSource();
        source.buffer = noise;
        source.loop = true;
        const band = audio.createBiquadFilter();
        band.type = "bandpass";
        band.frequency.setValueAtTime(900, now);
        band.frequency.linearRampToValueAtTime(1600, now + seconds);
        const gain = audio.createGain();
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.05, now + 0.4);
        gain.gain.setValueAtTime(0.05, now + seconds - 0.4);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + seconds);
        source.connect(band).connect(gain).connect(audio.destination);
        source.start(now);
        source.stop(now + seconds);
    } catch {
        // No audio: it brews in silence.
    }
}

function readyChime() {
    try {
        audio ??= new AudioContext();
        const now = audio.currentTime;
        [880, 1320].forEach((frequency, i) => {
            const note = audio!.createOscillator();
            const gain = audio!.createGain();
            note.type = "sine";
            note.frequency.setValueAtTime(frequency, now + i * 0.14);
            gain.gain.setValueAtTime(0.0001, now + i * 0.14);
            gain.gain.exponentialRampToValueAtTime(0.12, now + i * 0.14 + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.14 + 0.5);
            note.connect(gain).connect(audio!.destination);
            note.start(now + i * 0.14);
            note.stop(now + i * 0.14 + 0.55);
        });
    } catch {
        // No audio.
    }
}

export function addPropsOnMap(scene: Phaser.Scene, { items, font, bridge, selfId }: Options): PropsOnMap {
    let spots: MicroSpot[] = [];
    let readyAt = 0;
    let nextBook = 0;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let rack: Rect | null = null;
    let machine: Rect | null = null;
    // The rack's bikes, drawn on their own over the empty rack so a ridden bike can leave it.
    const rackBikes = new Map<Bike, Phaser.GameObjects.Image>();
    // The vending machine's tray, aligned with the artwork's pickup opening.
    let tray: { x: number; y: number; depth: number } | null = null;
    let trayDrink: Drink | null = null;
    let trayCan: Phaser.GameObjects.Image | null = null;
    // Your coffee: brewing at a machine since `startedAt` (scene time), then `done` and waiting
    // under its spout until you take it. One at a time; walking away leaves it brewing.
    let coffee: { coffee: Coffee; spot: MicroSpot; startedAt: number; done: boolean } | null = null;
    let coffeeMenu = false;
    let coffeeArt: { ring: Phaser.GameObjects.Graphics; empty: Phaser.GameObjects.Image; full: Phaser.GameObjects.Image; stream: Phaser.GameObjects.Rectangle; lastSteam: number } | null = null;
    makeCoffeeTextures(scene);
    const clearCoffeeArt = () => {
        if (!coffeeArt) return;
        coffeeArt.ring.destroy(); coffeeArt.empty.destroy(); coffeeArt.full.destroy(); coffeeArt.stream.destroy();
        coffeeArt = null;
    };
    const forgetCoffee = () => {
        coffee = null;
        if (bridge) bridge.coffeeBrew = null;
        clearCoffeeArt();
    };

    const setItems = (list: readonly HqItem[]) => {
        spots = microSpotsFor(list);
        // A coffee at a machine that moved or went is gone with it.
        if (coffee && !spots.some((spot) => spot.kind === "coffee" && spot.x === coffee!.spot.x && spot.y === coffee!.spot.y)) forgetCoffee();
        const rackItem = list.find((item) => item.kind === "bike-rack" && item.variant === 1) ?? list.find((item) => item.kind === "bike-rack");
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
    const shown = new Map<string, { prop: PlayerProp | null; bike?: Phaser.GameObjects.Image; can?: Phaser.GameObjects.Image;
        book?: Phaser.GameObjects.Image; leaf?: Phaser.GameObjects.Image; closedBook?: Phaser.GameObjects.Image; pageFrom: number; sipFrom: number; ride: number; reading: number;
        // Where their sprite was last frame, and how much they are walking (0 to 1), so a book is carried shut while walking.
        lastX?: number; lastY?: number; walking: number }>();
    let self = { x: -1, y: -1 };

    const mine = () => {
        const me = selfId();
        return me ? bridge?.props?.[me] ?? null : null;
    };
    const ridden = (bike: Bike) => Object.values(bridge?.props ?? {}).some((prop) => prop.kind === "bike" && prop.bike === bike);
    // False when it couldn't be sent (reconnecting).
    const setProp = (prop: PlayerProp | null) => {
        if (bridge?.builder?.active) return false;
        const sent = !!bridge?.setProp?.(prop);
        if (sent) hintUntil = scene.time.now + HINT_MS;
        else note = { text: "Reconnecting… try again shortly", until: scene.time.now + 2000 };
        return sent;
    };
    const readBook = (book: BookId) => {
        const prop = mine();
        if ((prop && prop.kind !== "book") || scene.time.now < readyAt || !spots.some((spot) => spot.kind === "shelf" && microInReach(spot, self.x, self.y))) return false;
        if (!setProp({ kind: "book", book, page: 0 })) return false;
        readyAt = scene.time.now + PAGE_TURN_MS;
        return true;
    };
    const turnBook = (page: number) => {
        const prop = mine();
        if (prop?.kind !== "book" || scene.time.now < readyAt || !Number.isInteger(page) || page < 0 || page >= BOOK_PAGE_COUNT || page === prop.page) return false;
        if (!setProp({ ...prop, page })) return false;
        readyAt = scene.time.now + PAGE_TURN_MS;
        return true;
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

    // Where the cup stands under a machine's spout, on the counter top (drawn over the machine).
    const spoutOf = (spot: MicroSpot) => ({ x: (spot.x + spot.w / 2) * TILE, y: (spot.y + 0.62) * TILE, depth: (spot.y + 1) * TILE + 1 });
    const sameSpot = (a: MicroSpot, b: MicroSpot) => a.x === b.x && a.y === b.y;
    const secondsLeft = () => (coffee ? Math.max(1, Math.ceil((BREW_MS - (scene.time.now - coffee.startedAt)) / 1000)) : 0);

    // Starts a coffee at the machine you stand at. False while you hold something, already have
    // a coffee on the go, or aren't at a machine.
    const orderCoffee = (kind: Coffee) => {
        const spot = nearestMicroSpot(spots, self.x, self.y);
        if (spot?.kind !== "coffee" || mine() || bridge?.builder?.active) return false;
        if (coffee) {
            note = { text: coffee.done ? `Your ${COFFEE_NAMES[coffee.coffee]} is waiting at the machine` : "One coffee at a time", until: scene.time.now + 2500 };
            return false;
        }
        coffee = { coffee: kind, spot, startedAt: scene.time.now, done: false };
        coffeeMenu = false;
        if (bridge) bridge.coffeeBrew = { coffee: kind, spot: { x: spot.x, y: spot.y, w: spot.w, h: spot.h }, at: performance.now() };
        const at = spoutOf(spot);
        clearCoffeeArt();
        coffeeArt = {
            ring: scene.add.graphics().setDepth(10000),
            empty: scene.add.image(at.x, at.y, cupKey(kind, false)).setOrigin(0.5, 1).setScale(0.6).setDepth(at.depth),
            full: scene.add.image(at.x, at.y, cupKey(kind)).setOrigin(0.5, 1).setScale(0.6).setDepth(at.depth + 1).setAlpha(0),
            stream: scene.add.rectangle(at.x, at.y - 22, 2, 14, kind === "chai" ? 0xc89660 : kind === "hot-chocolate" ? 0x5a2e1a : 0x6b3d1f).setOrigin(0.5, 0).setDepth(at.depth + 2),
            lastSteam: 0,
        };
        brewSound(BREW_MS / 1000);
        return true;
    };
    const takeCoffee = () => {
        if (!coffee?.done) return;
        // Reconnecting: the cup stays under the spout until it can really be taken.
        if (setProp({ kind: "cup", coffee: coffee.coffee, sips: 0 })) forgetCoffee();
    };
    const steam = (x: number, y: number) => {
        const puff = scene.add.ellipse(x + (Math.random() - 0.5) * 6, y, 5, 5, 0xffffff, 0.55).setDepth(10000);
        scene.tweens.add({ targets: puff, y: y - 20, scale: 1.8, alpha: 0, duration: 950, ease: "Sine.easeOut", onComplete: () => puff.destroy() });
    };

    const throwCan = (from: Phaser.GameObjects.Image) => {
        const fall = scene.add.image(from.x, from.y, from.texture.key).setScale(from.scaleX).setDepth(from.depth).setAngle(from.angle);
        scene.tweens.add({ targets: fall, y: from.y + 22, angle: from.angle + 120, alpha: 0, duration: 520, ease: "Quad.easeIn", onComplete: () => fall.destroy() });
    };

    // The panel at a coffee machine: order (with the menu open after E), brewing, or take it.
    const coffeeInteraction = (spot: MicroSpot) => {
        const here = coffee && sameSpot(coffee.spot, spot) ? coffee : null;
        const name = coffee ? COFFEE_NAMES[coffee.coffee] : "";
        return {
            kind: "coffee" as const,
            title: "Coffee machine",
            detail: here?.done ? `Your ${name} is ready` : here ? `Brewing your ${name}…` : coffee ? `Your ${name} is ${coffee.done ? "waiting" : "brewing"} at the other machine` : "Espresso, cappuccino, latte, chai or hot chocolate",
            action: here?.done ? "Take coffee" : here ? "Brewing…" : "Order",
            ready: !here || here.done,
            menu: coffeeMenu && !coffee,
            ...(here && !here.done ? { brew: Math.min(1, (scene.time.now - here.startedAt) / BREW_MS) } : {}),
        };
    };

    const api: PropsOnMap = {
        setItems,
        riding: (userId) => !!userId && bridge?.props?.[userId]?.kind === "bike",
        busy: () => !!mine(),

        useHeld() {
            const prop = mine();
            if (!prop) return false;
            if (scene.time.now < readyAt) return true;
            if (prop.kind === "bike") setProp(null);
            else if (prop.kind === "book") {
                if (prop.page < BOOK_PAGE_COUNT - 1) turnBook(prop.page + 1);
                else setProp(null);
            } else if (setProp(prop.sips < SIPS_PER_CAN ? { ...prop, sips: prop.sips + 1 } : null)) readyAt = scene.time.now + SIP_MS;
            return true;
        },

        use(at) {
            if (mine()) return api.useHeld();
            const prop = mine();
            const available = at ?? nearestMicroSpot(spots, self.x, self.y);
            if (prop?.kind === "bike") return false;
            if (available?.kind === "vending" && machine && inFront(machine, self.x, self.y)) {
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
            if (available?.kind === "coffee") {
                if (coffee && sameSpot(coffee.spot, available)) {
                    if (coffee.done) takeCoffee();
                    else note = { text: `Brewing… ${secondsLeft()}s`, until: scene.time.now + 1500 };
                } else if (coffee) {
                    note = { text: coffee.done ? `Your ${COFFEE_NAMES[coffee.coffee]} is waiting at the other machine` : "One coffee at a time", until: scene.time.now + 2500 };
                } else coffeeMenu = !coffeeMenu;
                return true;
            }
            if (available?.kind === "rack" && rack && !prop && inReach(rack, self.x, self.y)) {
                const bike = BIKES.find((each) => !ridden(each));
                if (bike) setProp({ kind: "bike", bike });
                else note = { text: "Both bikes are out", until: scene.time.now + 2500 };
                return true;
            }
            if (available?.kind === "printer") { bridge?.openPrinter?.(); return true; }
            if (available?.kind === "server") { bridge?.openServerRack?.(); return true; }
            if (available?.kind === "shelf") {
                readBook(BOOK_IDS[nextBook++ % BOOK_IDS.length]!);
                return true;
            }
            return false;
        },

        drop() {
            if (!mine()) return false;
            setProp(null);
            return true;
        },

        update(selfTile, people) {
            self = selfTile;
            const now = scene.time.now;
            const prop = mine();
            const available = nearestMicroSpot(spots, self.x, self.y);
            const ready = now >= readyAt;
            if (available?.kind !== "coffee") coffeeMenu = false;
            // The coffee brewing, or ready and waiting: ring, stream, steam and the cup filling.
            if (coffee && coffeeArt) {
                const at = spoutOf(coffee.spot);
                const progress = Math.min(1, (now - coffee.startedAt) / BREW_MS);
                if (!coffee.done && progress >= 1) {
                    coffee.done = true;
                    readyChime();
                    note = { text: `Your ${COFFEE_NAMES[coffee.coffee]} is ready`, until: now + 2500 };
                }
                coffeeArt.full.setAlpha(progress);
                coffeeArt.empty.setVisible(!coffee.done);
                coffeeArt.stream.setVisible(!coffee.done && !motion.matches);
                coffeeArt.ring.clear();
                if (!coffee.done) {
                    const cx = at.x, cy = (coffee.spot.y - 1.15) * TILE;
                    coffeeArt.ring.fillStyle(0x12151c, 0.6).fillCircle(cx, cy, 10);
                    coffeeArt.ring.lineStyle(3, 0xffc46b, 1).beginPath()
                        .arc(cx, cy, 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress, false).strokePath();
                }
                if (!motion.matches && now - coffeeArt.lastSteam > (coffee.done ? 650 : 220)) {
                    coffeeArt.lastSteam = now;
                    steam(at.x, at.y - 14);
                }
            }
            if (bridge) {
                bridge.propInteraction = bridge.builder?.active ? null : prop?.kind === "can"
                    ? { kind: "can", title: DRINK_NAMES[prop.drink], detail: `${Math.max(0, SIPS_PER_CAN - prop.sips)} ${SIPS_PER_CAN - prop.sips === 1 ? "sip" : "sips"} left`, action: !ready ? "Taking a sip…" : prop.sips < SIPS_PER_CAN ? "Take a sip" : "Put empty can away", ready }
                    : prop?.kind === "cup"
                    ? { kind: "cup", title: COFFEE_NAMES[prop.coffee], detail: `${Math.max(0, SIPS_PER_CAN - prop.sips)} ${SIPS_PER_CAN - prop.sips === 1 ? "sip" : "sips"} left`, action: !ready ? "Taking a sip…" : prop.sips < SIPS_PER_CAN ? "Take a sip" : "Put cup away", ready }
                    : prop?.kind === "book" ? { kind: "book", title: LIBRARY_BOOKS[prop.book].title, detail: `Page ${prop.page + 1} of ${BOOK_PAGE_COUNT}`, action: !ready ? "Turning the page…" : prop.page < BOOK_PAGE_COUNT - 1 ? "Next page" : "Return book", ready, book: prop.book, page: prop.page }
                    : prop?.kind === "bike" ? { kind: "bike", title: "A little ride", detail: "Click the map or use the arrow keys to cycle", action: "Get off bike", ready: true }
                    : available?.kind === "printer" ? { kind: "printer", title: "Office printer", detail: "Print notes or a document with your connected printer", action: "Print", ready: true }
                    : available?.kind === "server" ? { kind: "server", title: "Server rack", detail: "Switch · servers · storage · UPS", action: "Look inside", ready: true }
                    : available?.kind === "coffee" ? coffeeInteraction(available)
                    : available ? { kind: available.kind, title: available.kind === "shelf" ? "The reading corner" : available.kind === "vending" ? "Take a refreshment break" : "Borrow a bicycle", detail: available.kind === "shelf" ? "Pick a short read. Take it to your favourite chair." : available.kind === "vending" ? trayDrink ? "Your drink is waiting in the tray" : "A chilled drink, one sip at a time" : "Ride around the office and return it when you’re done", action: available.kind === "shelf" ? "Read a book" : available.kind === "vending" ? trayDrink ? "Take drink" : "Get a drink" : "Ride a bike", ready: true }
                    : null;
                if (bridge.propInteraction && note && note.until > now) bridge.propInteraction.detail = note.text;
            }

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
                } else if (available?.kind === "coffee" && !prop) {
                    const here = coffee && sameSpot(coffee.spot, available) ? coffee : null;
                    spot = {
                        text: here?.done ? `Press E to take your ${COFFEE_NAMES[here.coffee]}` : here ? `Brewing… ${secondsLeft()}s` : "Press E to order a coffee",
                        x: (available.x + available.w / 2) * TILE, y: (available.y - 1.65) * TILE,
                    };
                } else if (available?.kind === "shelf" && !prop) {
                    spot = { text: "Press E to read a book", x: (available.x + available.w / 2) * TILE, y: (available.y - 0.2) * TILE };
                }
            }
            if (note && note.until > now && (machine || rack || available)) {
                // Over the vending machine you stand at, else whatever you are next to, else the rack.
                const where = machine && inFront(machine, self.x, self.y) ? machine : available ?? rack ?? machine!;
                const above = where === machine ? 1.7 : available?.kind === "coffee" && where === available ? 1.65 : 0.2;
                spot = { text: note.text, x: (where.x + where.w / 2) * TILE, y: (where.y - above) * TILE };
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
                    state = { prop: null, sipFrom: -Infinity, pageFrom: -Infinity, ride: 0, reading: 0, walking: 0 };
                    shown.set(id, state);
                }
                const before = state.prop;
                if ((current?.kind === "can" || current?.kind === "cup") && before?.kind === current.kind && current.sips > before.sips) state.sipFrom = now;
                if (current?.kind === "book" && before?.kind === "book" && current.page !== before.page) state.pageFrom = now;
                if (!current && (before?.kind === "can" || before?.kind === "cup") && state.can) throwCan(state.can);
                state.prop = current;

                // On a bike: the bike under them, seen from the way they face, and them sat a
                // little higher on its saddle.
                const bike = current?.kind === "bike" ? current.bike : null;
                const dt = Math.min(scene.game.loop.delta / 1000, 0.1);
                state.ride = damp(state.ride, bike ? 1 : 0, 10, dt);
                sprite.setOrigin(0.5, 0.5 + 0.12 * state.ride);
                if (bike) {
                    const view = facing === "up" ? "back" : facing === "down" ? "front" : "side";
                    const key = `hq-ride-${bike}-${view}`;
                    state.bike ??= scene.add.image(0, 0, key);
                    if (state.bike.texture.key !== key) state.bike.setTexture(key);
                    const feet = sprite.y + sprite.displayHeight / 2;
                    state.bike.setOrigin(0.5, 1).setFlipX(facing === "left")
                        .setPosition(sprite.x, feet + (view === "side" ? 2 : 6))
                        .setDepth(sprite.depth + 1).setAlpha(sprite.alpha * state.ride).setVisible(true);
                } else if (state.bike) state.bike.setAlpha(sprite.alpha * state.ride).setVisible(state.ride > 0.015);

                // A can or a coffee in the hand on the side they face; raised to the mouth during a sip.
                if (current?.kind === "can" || current?.kind === "cup") {
                    const key = current.kind === "can" ? `hq-can-${current.drink}` : cupKey(current.coffee);
                    state.can ??= scene.add.image(0, 0, key).setScale(0.6);
                    if (state.can.texture.key !== key) state.can.setTexture(key);
                    const side = facing === "left" ? -1 : 1;
                    const t = Math.min(1, (now - state.sipFrom) / SIP_MS);
                    const lift = sipLift(t);
                    // Offsets from the sprite's centre, in world px (the 16x32 frame is drawn at 2x, so
                    // frame row r is at (r - 16) * 2): hands are around rows 24-26, the mouth row 21.
                    // Seen from behind, the hand and the can show just beside the body and head.
                    const hand = { x: facing === "down" ? 11 : facing === "up" ? 13 : 8 * side, y: facing === "down" ? 16 : facing === "up" ? 17 : 18 };
                    const mouth = { x: facing === "down" ? 3 : facing === "up" ? 12 : 11 * side, y: facing === "up" ? 6 : 10 };
                    state.can.setPosition(sprite.x + hand.x + (mouth.x - hand.x) * lift, sprite.y + hand.y + (mouth.y - hand.y) * lift)
                        .setAngle(-55 * lift * side).setFlipX(facing === "left")
                        .setDepth(sprite.depth + 2).setAlpha(sprite.alpha).setVisible(true);
                } else state.can?.setVisible(false);
                state.reading = damp(state.reading, current?.kind === "book" ? 1 : 0, 10, dt);
                const moved = state.lastX !== undefined && Math.hypot(sprite.x - state.lastX, sprite.y - (state.lastY ?? sprite.y)) > 0.2;
                state.lastX = sprite.x; state.lastY = sprite.y;
                state.walking = damp(state.walking, moved ? 1 : 0, moved ? 14 : 6, dt);
                if (current?.kind === "book") {
                    const textures = readingTextures(scene, current.book);
                    state.book ??= scene.add.image(0, 0, textures.open);
                    state.leaf ??= scene.add.image(0, 0, textures.leaf).setOrigin(0, 0.5);
                    state.closedBook ??= scene.add.image(0, 0, textures.closed);
                    state.book.setTexture(textures.open);
                    state.closedBook.setTexture(textures.closed);
                    const side = facing === "left" ? -1 : 1;
                    const open = state.reading * (1 - state.walking);
                    // Standing, the book lies open in both hands at the waist, below the face; from
                    // behind it shows just past the body. Walking, it is shut in one hand, like a can.
                    const x = sprite.x + (facing === "down" || facing === "up" ? 0 : 8 * side), y = sprite.y + (facing === "up" ? 10 : facing === "down" ? 20 : 24);
                    const depth = sprite.depth + (facing === "up" ? -1 : 2);
                    const breath = motion.matches ? 0 : Math.sin(now / 900 + id.length) * 0.4;
                    const scale = facing === "down" || facing === "up" ? 0.4 : 0.34;
                    state.book.setPosition(x, y + breath).setScale(scale * (0.85 + 0.15 * open)).setAlpha(sprite.alpha * open).setDepth(depth).setVisible(open > 0.015);
                    const flip = Math.min(1, (now - state.pageFrom) / PAGE_TURN_MS);
                    state.leaf.setPosition(x, y + breath - 1).setScale(Math.cos(Math.PI * flip) * scale, scale).setDepth(depth + 1)
                        .setAlpha(sprite.alpha * open * (motion.matches ? 0 : Math.sin(Math.PI * flip) * 0.85)).setVisible(flip < 1 && open > 0.5);
                    const hand = { x: facing === "down" ? 11 : facing === "up" ? 13 : 3 * side, y: 22 };
                    const swing = motion.matches ? 0 : Math.sin(now / 110) * 1.2 * state.walking;
                    state.closedBook.setPosition(sprite.x + hand.x, sprite.y + hand.y + swing).setScale(0.55).setAngle(-8 * side)
                        .setDepth(sprite.depth + (facing === "up" ? -1 : 2)).setAlpha(sprite.alpha * state.reading * state.walking).setVisible(state.reading * state.walking > 0.015);
                } else {
                    const open = state.reading * (1 - state.walking);
                    state.book?.setAlpha(sprite.alpha * open).setVisible(open > 0.015);
                    state.closedBook?.setAlpha(sprite.alpha * state.reading * state.walking).setVisible(state.reading * state.walking > 0.015);
                    state.leaf?.setVisible(false);
                }
            }
            for (const [id, state] of shown) {
                if (seen.has(id)) continue;
                state.bike?.destroy();
                state.can?.destroy();
                state.book?.destroy(); state.leaf?.destroy(); state.closedBook?.destroy();
                shown.delete(id);
            }

            // A reminder of the keys after picking up a prop.
            const me = selfId();
            const mySprite = people.find((person) => person.id === me)?.sprite;
            const hint = !prop ? null
                : prop.kind === "bike" ? "E: get off"
                : prop.kind === "book" ? "E: next page · Q: return book"
                : prop.sips < SIPS_PER_CAN ? "E: sip · Q: throw away" : "Empty. E or Q: throw it away";
            selfHint.setVisible(!!hint && !!mySprite && now < hintUntil);
            if (hint && mySprite) {
                if (selfHint.text !== hint) selfHint.setText(hint);
                selfHint.setPosition(mySprite.x, mySprite.y - 60);
            }
        },
    };
    if (bridge) {
        bridge.useProp = () => api.use();
        bridge.returnProp = () => api.drop();
        bridge.readBook = readBook;
        bridge.turnBook = turnBook;
        bridge.orderCoffee = orderCoffee;
        bridge.usePropAt = (x, y) => {
            const spot = spots.find((each) => each.x === x && each.y === y);
            return !!spot && !mine() && microInReach(spot, self.x, self.y) && api.use(spot);
        };
        scene.events.once(Phaser.Scenes.Events.DESTROY, () => {
            bridge.propInteraction = null; bridge.useProp = undefined; bridge.returnProp = undefined;
            bridge.readBook = undefined; bridge.turnBook = undefined; bridge.usePropAt = undefined;
            bridge.orderCoffee = undefined; bridge.coffeeBrew = null;
        });
    }
    return api;
}
