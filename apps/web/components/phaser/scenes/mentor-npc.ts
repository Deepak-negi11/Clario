import Phaser from "phaser";
import type { SceneBridge } from "../scene-bridge";

// Maya, the mentor NPC for the Practice Session (PS7_BUILD_BRIEF.md section 16).
// She stands still on one tile. Walk next to her and press E (or click her) to open the
// panel; while the panel is open her tag shows whether she is listening, thinking or speaking.

const TILE = 32;
const TEXTURE = "maya";

// Frames in the character sheets: right 0-5, up 6-11, left 12-17, down 18-23.
const FACING_FRAME = { right: 0, up: 6, left: 12, down: 18 } as const;

export function preloadMentorNpc(scene: Phaser.Scene) {
    scene.load.spritesheet(TEXTURE, "/assets/amelia-run.png", { frameWidth: 16, frameHeight: 32 });
}

export type MentorNpc = { update: (playerTileX: number, playerTileY: number) => void };

type MentorNpcOptions = {
    tileX: number;
    tileY: number;
    font: string;
    bridge?: SceneBridge;
    block: (x: number, y: number) => void;
};

function isTypingIn(target: EventTarget | null) {
    return target instanceof HTMLElement
        && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
}

export function addMentorNpc(scene: Phaser.Scene, { tileX, tileY, font, bridge, block }: MentorNpcOptions): MentorNpc {
    block(tileX, tileY);

    const x = tileX * TILE + TILE / 2;
    const y = tileY * TILE + TILE / 2;
    const feet = y + TILE; // the sprite is 64 px tall once scaled, centred on the tile

    scene.add.ellipse(x, feet - 6, 26, 10, 0x000000, 0.25).setDepth(feet - 2);
    const sprite = scene.add.sprite(x, y, TEXTURE, FACING_FRAME.down).setScale(2).setDepth(feet);

    // Sits higher than player name tags so the two don't overlap when the player stands beside her.
    const tag = scene.add.text(x, y - 50, "", {
        fontFamily: font,
        fontSize: "12px",
        fontStyle: "600",
        color: "#ffffff",
        backgroundColor: "#b8325e",
        padding: { x: 7, y: 4 },
    }).setOrigin(0.5, 1).setDepth(10000).setResolution(3);

    let near = false;

    sprite.setInteractive({ cursor: "pointer" });
    sprite.on("pointerdown", (_pointer: Phaser.Input.Pointer, _lx: number, _ly: number, event: Phaser.Types.Input.EventData) => {
        event.stopPropagation();
        if (near) bridge?.openMentor?.();
        else bridge?.walkTo?.(tileX, tileY + 1);
    });

    scene.input.keyboard?.on("keydown-E", (event: KeyboardEvent) => {
        if (!near || isTypingIn(event.target)) return;
        event.preventDefault(); // otherwise the "e" lands in the panel's text box once it has focus
        bridge?.openMentor?.();
    });

    if (bridge) {
        bridge.setKeyboardEnabled = (enabled) => {
            if (scene.input.keyboard) scene.input.keyboard.enabled = enabled;
        };
        scene.events.once(Phaser.Scenes.Events.DESTROY, () => {
            bridge.setKeyboardEnabled = undefined;
            bridge.mentorState = undefined;
        });
    }

    return {
        update(playerTileX, playerTileY) {
            const dx = playerTileX - tileX;
            const dy = playerTileY - tileY;
            near = Math.max(Math.abs(dx), Math.abs(dy)) <= 1;

            // No state means the panel is closed.
            const state = bridge?.mentorState;
            const label =
                state === "idle" ? "Maya is ready"
                : state === "listening" ? "Maya is listening"
                : state === "thinking" ? "Maya is thinking…"
                : state === "speaking" ? "Maya is speaking"
                : near ? "Press E to talk to Maya"
                : "Maya · mentor";
            if (tag.text !== label) tag.setText(label);

            // Turn to face the player when they come close.
            const facing = !near ? "down"
                : Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left")
                : dy < 0 ? "up" : "down";
            sprite.setFrame(FACING_FRAME[facing]);

            // A small bob while she talks, so the map shows it too.
            sprite.y = state === "speaking" ? y + Math.round(Math.sin(scene.time.now / 80)) : y;
        },
    };
}
