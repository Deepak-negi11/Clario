import Phaser from "phaser";
import { HQ_CLAUDE_SEATS } from "../../../lib/maps/clario-hq";

// Claude at work in the Open Desks cubicles: one in every cubicle chair (HQ_CLAUDE_SEATS in
// lib/maps/clario-hq.ts), painted in code like the rest of Clario HQ. Each one types, blinks and
// spins the little spark Claude Code shows while it works. Walk up to see what it is doing.
// Their chair tile is blocked, so nobody sits on them.

const TILE = 32;
const P = 2; // one art pixel = 2x2 world pixels, same as the map and the avatars

const ORANGE = { hi: 0xeb9b7d, base: 0xd97757, shade: 0xb4573a, leg: 0x9c4a31, glow: 0xf6c3ae };
const EYE = 0x1f1a17;
const TAG_COLOR = "#b5502f"; // Claude orange, dark enough for white text

// Which arm is down on the keys.
type Arms = "rest" | "left" | "right";

type Px = (color: number, x: number, y: number, w?: number, h?: number) => void;

function make(scene: Phaser.Scene, key: string, w: number, h: number, paint: (px: Px) => void) {
    if (scene.textures.exists(key)) return;
    const g = scene.add.graphics();
    const px: Px = (color, x, y, pw = 1, ph = 1) => {
        g.fillStyle(color, 1);
        g.fillRect(x * P, y * P, pw * P, ph * P);
    };
    paint(px);
    g.generateTexture(key, w * P, h * P);
    g.destroy();
}

// Claude facing you, 20x12 art pixels (about as wide as the chair): a square body with tall slit
// eyes, a nub of an arm on each side and four short legs, the same shape as the Claude Code mascot.
function makeTextures(scene: Phaser.Scene) {
    for (const arms of ["rest", "left", "right"] as Arms[]) {
        for (const shut of [false, true]) {
            make(scene, `claude-${arms}-${shut ? "shut" : "open"}`, 20, 12, (px) => {
                px(ORANGE.base, 2, 0, 16, 10);
                px(ORANGE.hi, 2, 0, 16, 1); px(ORANGE.hi, 2, 1, 1, 8);
                px(ORANGE.shade, 17, 1, 1, 9); px(ORANGE.shade, 2, 9, 16, 1);
                if (shut) { px(EYE, 5, 4, 2, 1); px(EYE, 13, 4, 2, 1); }
                else { px(EYE, 5, 3, 2, 3); px(EYE, 13, 3, 2, 3); }
                // An arm on the keys sits a pixel lower than one at rest.
                const left = arms === "left" ? 6 : 5;
                const right = arms === "right" ? 6 : 5;
                px(ORANGE.base, 0, left, 2, 2); px(ORANGE.shade, 0, left + 1, 2, 1);
                px(ORANGE.base, 18, right, 2, 2); px(ORANGE.shade, 18, right + 1, 2, 1);
                for (const x of [4, 7, 12, 15]) px(ORANGE.leg, x, 10, 1, 2);
            });
        }
    }

    // The spark Claude Code spins while it works, small to large (7x7 art pixels).
    const SPARKS: string[][] = [
        ["...", ".#.", "..."],
        [".#.", "###", ".#."],
        ["#.#.#", ".###.", "#####", ".###.", "#.#.#"],
        ["...#...", ".#.#.#.", "..###..", "#######", "..###..", ".#.#.#.", "...#..."],
    ];
    SPARKS.forEach((rows, frame) => {
        make(scene, `claude-spark-${frame}`, 7, 7, (px) => {
            const offset = (7 - rows.length) / 2;
            rows.forEach((row, y) => {
                [...row].forEach((cell, x) => {
                    if (cell !== "#") return;
                    const centre = x === (row.length - 1) / 2 && y === (rows.length - 1) / 2;
                    px(centre ? ORANGE.glow : ORANGE.base, x + offset, y + offset);
                });
            });
        });
    });
}

// What each one is busy with, shown in its tag when you come close.
const TASKS = [
    "refactoring the auth flow",
    "writing unit tests",
    "reviewing a pull request",
    "fixing a flaky build",
    "updating the docs",
    "tracking down a bug",
];

// Small to large and back, like the spinner in the terminal.
const SPARK_ORDER = [0, 1, 2, 3, 3, 2, 1];

export type ClaudeNpcs = { update: (playerTileX: number, playerTileY: number) => void };

type ClaudeNpcOptions = {
    font: string;
    block: (x: number, y: number) => void;
};

export function addClaudeNpcs(scene: Phaser.Scene, { font, block }: ClaudeNpcOptions): ClaudeNpcs {
    makeTextures(scene);

    const claudes = HQ_CLAUDE_SEATS.map(({ x: tileX, y: tileY }, index) => {
        block(tileX, tileY);
        const x = (tileX + 0.5) * TILE;
        // Sitting up in the chair: eyes over the top of the desk's monitor and a hand either side of
        // it on the keys; the desk in the row below hides the rest.
        const body = scene.add.image(x, tileY * TILE + 18, "claude-rest-open").setOrigin(0.5, 1).setDepth((tileY + 1) * TILE);
        const sparkY = tileY * TILE - 16;
        const spark = scene.add.image(x, sparkY, "claude-spark-0").setDepth((tileY + 1) * TILE + 1);
        const tag = scene.add.text(x, tileY * TILE - 26, `Claude · ${TASKS[index % TASKS.length]}`, {
            fontFamily: font,
            fontSize: "12px",
            fontStyle: "600",
            color: "#ffffff",
            backgroundColor: TAG_COLOR,
            padding: { x: 7, y: 4 },
        }).setOrigin(0.5, 1).setDepth(10000).setResolution(3).setVisible(false);
        // Each one runs on its own clock so they don't type in step.
        return { tileX, tileY, body, spark, sparkY, tag, phase: index * 1370 };
    });

    return {
        update(playerTileX, playerTileY) {
            const now = scene.time.now;
            for (const claude of claudes) {
                const t = now + claude.phase;
                // Bursts of typing with short pauses to think.
                const typing = t % 3600 < 2400;
                const arms: Arms = !typing ? "rest" : Math.floor(t / 140) % 2 ? "left" : "right";
                const shut = t % 3700 < 130;
                const key = `claude-${arms}-${shut ? "shut" : "open"}`;
                if (claude.body.texture.key !== key) claude.body.setTexture(key);

                const frame = SPARK_ORDER[Math.floor(t / 120) % SPARK_ORDER.length]!;
                const sparkKey = `claude-spark-${frame}`;
                if (claude.spark.texture.key !== sparkKey) claude.spark.setTexture(sparkKey);
                claude.spark.y = claude.sparkY + Math.round(Math.sin(t / 400));

                const near = Math.max(Math.abs(playerTileX - claude.tileX), Math.abs(playerTileY - claude.tileY)) <= 2;
                if (claude.tag.visible !== near) claude.tag.setVisible(near);
            }
        },
    };
}
