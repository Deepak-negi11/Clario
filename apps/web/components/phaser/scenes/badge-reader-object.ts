import Phaser from "phaser";
import type { HqItem } from "../../../lib/maps/clario-hq";
import { badgeReadersFor, tilesFrom } from "../../../lib/maps/badge-reader-spot";
import type { Tile } from "../../../lib/maps/path-finder";
import type { SceneBridge } from "../scene-bridge";

// The front-door badge reader on the 2D map (its logic, beep and toast are in
// components/badge-reader, reached through the bridge). Walking past a reader badges you in, once
// until you walk 2+ tiles away; walking out of the building badges you out, and back in badges
// you in. E
// next to it badges you in, or out when you are in. Its LED follows bridge.badgeLight:
// bright green just after a badge-in, dim green while you are in, amber otherwise. Readers are the
// map's "badge-reader" items; a map with none gets one by the spawn (`extra`), drawn here.

const TILE = 32;
const ART = 2; // world pixels per art pixel
// The reader art (clario-hq-builder.ts, hq-badge-reader): its size and where its LED is, in art pixels.
const ART_SIZE = { w: 16, h: 30 };
const LED = { x: 8, y: 4 };
const FLASH_MS = 1200;

export type BadgeReaders = {
    update: (self: Tile) => void;
    // The scene's E key: badges in when you are next to a reader.
    use: () => boolean;
    near: () => boolean;
    // A new map (a built map was edited): find the readers again, with `extra` for one to stand
    // by the spawn on a map that has none (null for none).
    setItems: (items: readonly HqItem[], extra: Tile | null) => void;
    destroy: () => void;
};

type Reader = Tile & { led: Phaser.GameObjects.Arc; art?: Phaser.GameObjects.Image };

export function addBadgeReaders(scene: Phaser.Scene, { font, bridge, block, unblock, isOutside }: {
    font: string;
    bridge?: SceneBridge;
    block: (x: number, y: number) => void;
    unblock: (x: number, y: number) => void;
    // Whether a tile is outside the building (the lawn, the path): stepping out there badges you
    // out. Maps that can't tell leave it out.
    isOutside?: (x: number, y: number) => boolean;
}): BadgeReaders {
    let readers: Reader[] = [];
    let self: Tile = { x: -1, y: -1 };
    // Armed until a walk-past badges you in; armed again once you are 2+ tiles from every reader.
    let armed = true;
    // Whether you were outside the building last frame, to badge out as you step out.
    let wasOutside: boolean | null = null;
    const tag = scene.add.text(0, 0, "", {
        fontFamily: font, fontSize: "12px", fontStyle: "600", color: "#ffffff", backgroundColor: "#2f8f5b", padding: { x: 7, y: 4 },
    }).setOrigin(0.5, 1).setDepth(10000).setResolution(3).setVisible(false);

    const artTop = (tile: Tile) => ({ x: (tile.x + 0.5) * TILE - (ART_SIZE.w * ART) / 2, y: (tile.y + 1) * TILE - ART_SIZE.h * ART });
    const nearest = () => readers.find((reader) => tilesFrom(reader, self.x, self.y) === 1) ?? null;

    const clear = () => {
        for (const reader of readers) {
            reader.led.destroy();
            if (reader.art) {
                reader.art.destroy();
                unblock(reader.x, reader.y);
            }
        }
        readers = [];
    };

    const setItems = (items: readonly HqItem[], extra: Tile | null) => {
        clear();
        const tiles = badgeReadersFor(items);
        const extraReader = !tiles.length && extra ? extra : null;
        readers = [...tiles, ...(extraReader ? [extraReader] : [])].map((tile) => {
            const top = artTop(tile);
            const depth = (tile.y + 1) * TILE + 1;
            const reader: Reader = { ...tile, led: scene.add.circle(top.x + LED.x * ART, top.y + LED.y * ART, 2.5, 0xf2a33a).setDepth(depth) };
            if (tile === extraReader) {
                reader.art = scene.add.image((tile.x + 0.5) * TILE, (tile.y + 1) * TILE, "hq-badge-reader").setOrigin(0.5, 1).setDepth(depth - 1);
                block(tile.x, tile.y);
            }
            return reader;
        });
        if (bridge) bridge.badgeReaderTile = extraReader;
    };

    return {
        setItems,
        destroy() {
            clear();
            tag.destroy();
            if (bridge) bridge.badgeReaderTile = null;
        },
        near: () => !!nearest(),
        use() {
            if (!nearest()) return false;
            if (bridge?.badgeLight?.in) bridge.badgeOut?.();
            else bridge?.badgeIn?.("key");
            return true;
        },
        update(selfTile) {
            self = selfTile;
            if (!readers.length) return;
            const now = Date.now();
            const light = bridge?.badgeLight;

            // Stepping out of the building while you are in badges you out, and stepping back in
            // badges you in (whichever part of the doorway you come through).
            const outside = self.x >= 0 && !!isOutside?.(self.x, self.y);
            if (outside && wasOutside === false && light?.in) bridge?.badgeOut?.();
            if (!outside && wasOutside === true && !light?.in) {
                armed = false;
                bridge?.badgeIn?.("walk");
            }
            if (self.x >= 0) wasOutside = outside;
            const flashing = !!light && now - light.flashAt < FLASH_MS;

            // Walking past a reader badges you in once; walk 2+ tiles off to arm it again.
            const closest = Math.min(...readers.map((reader) => tilesFrom(reader, self.x, self.y)));
            if (armed && closest <= 1 && self.x >= 0) {
                armed = false;
                bridge?.badgeIn?.("walk");
            } else if (!armed && closest >= 2) armed = true;

            const color = flashing ? 0x6dff96 : light?.in ? 0x2fbf5a : 0xf2a33a;
            const pulse = flashing ? 1 + 0.35 * Math.sin(now / 60) : 1;
            for (const reader of readers) reader.led.setFillStyle(color, 1).setScale(pulse).setAlpha(flashing || light?.in ? 1 : 0.8);

            const at = nearest();
            tag.setVisible(!!at);
            if (at) {
                const text = light?.in ? "Press E to badge out" : "Press E to badge in";
                if (tag.text !== text) tag.setText(text);
                tag.setPosition((at.x + 0.5) * TILE, artTop(at).y - 4);
            }
        },
    };
}
