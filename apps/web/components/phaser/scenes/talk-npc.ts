import Phaser from "phaser";
import type { MentorState } from "@repo/shared";
import type { SceneBridge } from "../scene-bridge";

// A character who stands still on one tile and talks: Maya the mentor (mentor-npc.ts) and the
// AI coworkers (coworker-npcs.ts). Walk next to them and press E (or click them) to open their
// panel; while it is open their tag shows whether they are listening, thinking or speaking.

const TILE = 32;

// Frames in the character sheets: right 0-5, up 6-11, left 12-17, down 18-23.
const FACING_FRAME = { right: 0, up: 6, left: 12, down: 18 } as const;

// `near`: the player is next to them. The scene's E key calls `talk` on the one that is near
// (arena-scene.ts decides between people, games and props).
export type TalkNpc = { update: (playerTileX: number, playerTileY: number) => void; near: () => boolean; talk: () => void };

export type TalkNpcOptions = {
    tileX: number;
    tileY: number;
    font: string;
    bridge?: SceneBridge;
    block: (x: number, y: number) => void;
    texture: string;
    name: string;
    role: string;
    tagColor: string;
    talk: () => void;
    // What their panel is doing, or undefined while it is closed.
    state: () => MentorState | undefined;
};

export function isTypingIn(target: EventTarget | null) {
    return target instanceof HTMLElement
        && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
}

export function addTalkNpc(scene: Phaser.Scene, options: TalkNpcOptions): TalkNpc {
    const { tileX, tileY, font, bridge, block, texture, name, role, tagColor, talk, state: stateOf } = options;
    block(tileX, tileY);

    const x = tileX * TILE + TILE / 2;
    const y = tileY * TILE + TILE / 2;
    const feet = y + TILE; // the sprite is 64 px tall once scaled, centred on the tile

    scene.add.ellipse(x, feet - 6, 26, 10, 0x000000, 0.25).setDepth(feet - 2);
    const sprite = scene.add.sprite(x, y, texture, FACING_FRAME.down).setScale(2).setDepth(feet);

    // Sits higher than player name tags so the two don't overlap when the player stands beside them.
    const tag = scene.add.text(x, y - 50, "", {
        fontFamily: font,
        fontSize: "12px",
        fontStyle: "600",
        color: "#ffffff",
        backgroundColor: tagColor,
        padding: { x: 7, y: 4 },
    }).setOrigin(0.5, 1).setDepth(10000).setResolution(3);

    let near = false;

    sprite.setInteractive({ cursor: "pointer" });
    sprite.on("pointerdown", (_pointer: Phaser.Input.Pointer, _lx: number, _ly: number, event: Phaser.Types.Input.EventData) => {
        event.stopPropagation();
        if (near) talk();
        else bridge?.walkTo?.(tileX, tileY + 1);
    });

    return {
        near: () => near,
        talk,
        update(playerTileX, playerTileY) {
            const dx = playerTileX - tileX;
            const dy = playerTileY - tileY;
            near = Math.max(Math.abs(dx), Math.abs(dy)) <= 1;

            const state = stateOf();
            const label =
                state === "idle" ? `${name} is ready`
                : state === "listening" ? `${name} is listening`
                : state === "thinking" ? `${name} is thinking…`
                : state === "speaking" ? `${name} is speaking`
                : near ? `Press E to talk to ${name}`
                : `${name} · ${role}`;
            if (tag.text !== label) tag.setText(label);

            // Turn to face the player when they come close.
            const facing = !near ? "down"
                : Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left")
                : dy < 0 ? "up" : "down";
            sprite.setFrame(FACING_FRAME[facing]);

            // A small bob while they talk, so the map shows it too.
            sprite.y = state === "speaking" ? y + Math.round(Math.sin(scene.time.now / 80)) : y;
        },
    };
}
