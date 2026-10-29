import Phaser from "phaser";
import { hqPlaySpots, spotFront, spotInReach, type PlaySpot } from "../../../lib/maps/play-spots";
import type { SceneBridge } from "../scene-bridge";

// The arcade machines, game tables and TVs on the 2D map (lib/maps/play-spots.ts). Walk up and
// press E (the scene's E key, in arena-scene.ts), or click one: from next to it that opens the game
// or the TV, from further away it walks you over. A tag over the one in reach says what it does.

const TILE = 32;

// `use`: what the scene's E key calls (arena-scene.ts); true if a spot was in reach and opened.
export type PlaySpots = { update: (playerTileX: number, playerTileY: number) => void; use: () => boolean };

type PlaySpotsOptions = {
    font: string;
    bridge?: SceneBridge;
    // True while E would do something else first (someone to talk to, a bike to get off): the
    // tag then stays hidden.
    busy: () => boolean;
};

export function addPlaySpots(scene: Phaser.Scene, { font, bridge, busy }: PlaySpotsOptions): PlaySpots {
    const spots = hqPlaySpots();
    let player = { x: -1, y: -1 };
    let inReach: PlaySpot | null = null;

    const use = (spot: PlaySpot) => {
        if (spot.action.kind === "tv") bridge?.openTv?.();
        else bridge?.openGame?.(spot.action.game);
    };
    // Furniture is drawn taller than the tiles it stands on, so its click area reaches a tile up.
    const lift = (spot: PlaySpot) => (spot.frontOnly ? 0 : 1);

    for (const spot of spots) {
        const zone = scene.add.zone(spot.x * TILE, (spot.y - lift(spot)) * TILE, spot.w * TILE, (spot.h + lift(spot)) * TILE)
            .setOrigin(0, 0)
            .setInteractive({ cursor: "pointer" });
        zone.on("pointerdown", (_pointer: Phaser.Input.Pointer, _lx: number, _ly: number, event: Phaser.Types.Input.EventData) => {
            event.stopPropagation();
            if (spotInReach([spot], player.x, player.y)) use(spot);
            else bridge?.walkTo?.(spotFront(spot).x, spotFront(spot).y);
        });
    }

    const tag = scene.add.text(0, 0, "", {
        fontFamily: font,
        fontSize: "12px",
        fontStyle: "600",
        color: "#ffffff",
        backgroundColor: "#3686ff",
        padding: { x: 7, y: 4 },
    }).setOrigin(0.5, 1).setDepth(10000).setResolution(3).setVisible(false);

    return {
        use() {
            if (!inReach) return false;
            use(inReach);
            return true;
        },
        update(playerTileX, playerTileY) {
            player = { x: playerTileX, y: playerTileY };
            inReach = spotInReach(spots, playerTileX, playerTileY);
            tag.setVisible(!!inReach && !busy());
            if (!inReach) return;
            const label = `Press E to ${inReach.label}`;
            if (tag.text !== label) tag.setText(label);
            tag.setPosition((inReach.x + inReach.w / 2) * TILE, (inReach.y - lift(inReach)) * TILE - 4);
        },
    };
}
