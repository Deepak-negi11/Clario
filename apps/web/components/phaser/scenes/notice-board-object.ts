import Phaser from "phaser";
import type { SceneBridge } from "../scene-bridge";
import { PixelSprite } from "./lounge-art";

// The notice board on every map: the map's own (Clario HQ's, or one put up in the map builder),
// or else a cork board on legs near where people arrive (lib/maps/notice-board-spot.ts picks the
// tile). Click it from anywhere, or press E next to it, to open the board (components/notice-board).
// A red pin shows how many posts by other people you haven't read yet.

const TILE = 32;
const TEXTURE = "notice-board";
const TAG_COLOR = "#8a5a2b";

type Tile = { x: number; y: number };

export type NoticeBoardObject = {
    tile: Tile;
    near: () => boolean;
    // Opens the board when the player is next to it; false otherwise (the E key goes elsewhere).
    use: () => boolean;
    destroy: () => void;
};

// 18 x 27 art pixels (36 x 54 on the map): a wooden frame of cork on two legs, with notes pinned
// up, and a one-pixel margin for the outline.
function boardArt() {
    const s = new PixelSprite(18, 27);
    const at = (color: number, x: number, y: number, w = 1, h = 1) => s.rect(color, x + 1, y + 1, w, h);
    const wood = 0x8a5a2b, woodDark = 0x6b431f, cork = 0xc39a6b, fleck = 0xa77d4f;
    at(woodDark, 3, 17, 2, 8);
    at(woodDark, 11, 17, 2, 8);
    at(wood, 2, 24, 4, 1);
    at(wood, 10, 24, 4, 1);
    at(wood, 0, 0, 16, 18);
    at(cork, 1, 1, 14, 16);
    for (const [x, y] of [[2, 2], [6, 5], [12, 4], [3, 9], [9, 12], [13, 14], [5, 15], [11, 9], [7, 1]] as const) at(fleck, x, y);
    // Notes: a white page with lines, a yellow sticky, a blue page, a small card, and their pins.
    at(0xf7f3ea, 2, 3, 5, 6);
    at(0xb8b0a0, 3, 5, 3, 1);
    at(0xb8b0a0, 3, 7, 2, 1);
    at(0xf6d860, 9, 2, 4, 4);
    at(0xdfe9ff, 8, 8, 6, 6);
    at(0x9fb4d8, 9, 10, 4, 1);
    at(0x9fb4d8, 9, 12, 3, 1);
    at(0xffffff, 2, 11, 4, 4);
    at(0xd94a3a, 4, 3);
    at(0x3a6ee8, 10, 2);
    at(0x2c8c84, 10, 8);
    at(0xd94a3a, 3, 11);
    at(woodDark, 1, 17, 14, 1);
    s.outline(0x2a2d35);
    return s;
}

// The map's own board art (an "hq-notice-board" item, clario-hq-builder.ts): 32 x 34 art pixels
// at 2x, bottom-centred on its tiles, with the unread pin's place in it.
const MAP_ART = { w: 64, h: 68, pin: { x: 57, y: 7 } };

// `board`: the tiles it covers. `drawn`: the map already draws it (a "notice-board" item), so
// only the click, the tag, E and the unread pin are added; otherwise a board on legs stands here.
export function addNoticeBoard(scene: Phaser.Scene, { board, drawn, font, bridge, block, unblock, player }: {
    board: { x: number; y: number; w: number; h: number };
    drawn: boolean;
    font: string;
    bridge?: SceneBridge;
    block: (x: number, y: number) => void;
    unblock: (x: number, y: number) => void;
    player: () => Tile;
}): NoticeBoardObject {
    if (!drawn) {
        if (!scene.textures.exists(TEXTURE)) boardArt().bake(scene, TEXTURE);
        block(board.x, board.y);
    }
    // The 3D view stands its board here too, centred on these tiles (notice-board-3d.ts).
    const spot = { x: board.x + (board.w - 1) / 2, y: board.y };
    if (bridge) bridge.noticeBoardSpot = spot;

    const x = (board.x + board.w / 2) * TILE;
    const bottom = (board.y + board.h) * TILE;
    const parts: Phaser.GameObjects.GameObject[] = [];
    // What you click: our own art, or an invisible patch over the map's.
    let target: Phaser.GameObjects.Image | Phaser.GameObjects.Zone;
    let top: number;
    let pinAt: { x: number; y: number; r: number };
    if (drawn) {
        target = scene.add.zone(x, bottom - MAP_ART.h / 2, MAP_ART.w, MAP_ART.h).setDepth(bottom);
        top = bottom - MAP_ART.h;
        pinAt = { x: x - MAP_ART.w / 2 + MAP_ART.pin.x, y: top + MAP_ART.pin.y, r: 7 };
    } else {
        parts.push(scene.add.ellipse(x, bottom - 3, 30, 8, 0x000000, 0.2).setDepth(bottom - 2));
        target = scene.add.image(x, bottom, TEXTURE).setOrigin(0.5, 1).setDepth(bottom);
        top = bottom - target.displayHeight;
        pinAt = { x: x + 13, y: top + 3, r: 8 };
    }
    // New posts by others: a red pin in the top corner with the count.
    const pin = scene.add.circle(pinAt.x, pinAt.y, pinAt.r, 0xd94a3a).setStrokeStyle(2, 0xffffff).setDepth(bottom + 1).setVisible(false);
    const count = scene.add.text(pinAt.x, pinAt.y, "", { fontFamily: font, fontSize: "10px", fontStyle: "700", color: "#ffffff" })
        .setOrigin(0.5).setDepth(bottom + 2).setResolution(3).setVisible(false);
    const tag = scene.add.text(x, top - 6, "", {
        fontFamily: font,
        fontSize: "12px",
        fontStyle: "600",
        color: "#ffffff",
        backgroundColor: TAG_COLOR,
        padding: { x: 7, y: 4 },
    }).setOrigin(0.5, 1).setDepth(10000).setResolution(3).setVisible(false);
    parts.push(target, pin, count, tag);

    let near = false;
    let hovered = false;
    const open = () => bridge?.openNoticeBoard?.();

    target.setInteractive({ cursor: "pointer" });
    target.on("pointerover", () => { hovered = true; });
    target.on("pointerout", () => { hovered = false; });
    // A click opens it from anywhere on the map; the click doesn't also walk you there.
    target.on("pointerdown", (_pointer: Phaser.Input.Pointer, _lx: number, _ly: number, event: Phaser.Types.Input.EventData) => {
        event.stopPropagation();
        open();
    });

    const update = () => {
        const at = player();
        const dx = Math.max(board.x - at.x, 0, at.x - (board.x + board.w - 1));
        const dy = Math.max(board.y - at.y, 0, at.y - (board.y + board.h - 1));
        near = Math.max(dx, dy) <= 1;
        const unread = bridge?.noticeUnread ?? 0;
        const label = near ? "Press E to read the board" : unread > 0 ? `Notice board · ${unread} new` : "Notice board · click to open";
        if (tag.text !== label) tag.setText(label);
        tag.setVisible(near || hovered);
        const text = unread > 9 ? "9+" : String(unread);
        if (count.text !== text) count.setText(text);
        pin.setVisible(unread > 0);
        count.setVisible(unread > 0);
    };
    scene.events.on(Phaser.Scenes.Events.UPDATE, update);

    const destroy = () => {
        scene.events.off(Phaser.Scenes.Events.UPDATE, update);
        if (!drawn) unblock(board.x, board.y);
        for (const part of parts) part.destroy();
        if (bridge?.noticeBoardSpot === spot) bridge.noticeBoardSpot = null;
    };
    scene.events.once(Phaser.Scenes.Events.DESTROY, destroy);

    return {
        tile: { x: board.x, y: board.y },
        near: () => near,
        use: () => {
            if (!near) return false;
            open();
            return true;
        },
        destroy() {
            scene.events.off(Phaser.Scenes.Events.DESTROY, destroy);
            destroy();
        },
    };
}
