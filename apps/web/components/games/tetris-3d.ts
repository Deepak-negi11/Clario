// The Tetris cabinet in 3D (three.js): a full-size upright arcade machine in a dim arcade, with the
// game on its tube. Built the way the real ones are: two plywood sides with printed art and chrome
// T-molding, a backlit marquee, a glossy bezel round a slightly curved monitor behind glass, a
// sloped control panel under plexi with a ball-top joystick and four buttons, and a steel coin door
// with lit coin slots. Two more cabinets stand either side, a pool of light falls from above, and
// bloom makes the tube and marquee glow. The joystick tilts and the buttons sink as you play.
// Everything is drawn from geometry and canvas textures: there are no image files to load.
//
// The game itself is painted by tetris-screen.ts onto a canvas; this uses that canvas as the
// monitor, with the blocks standing in front of it in 3D (tetris-blocks-3d.ts). In versus the
// machine to the right slides up alongside and shows the other player's screen. On opening the camera glides in from across the room to the machine, and moves up to
// the screen while a game is on; with reduced motion it cuts instead, and doesn't jolt or follow
// the pointer.

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { seeded } from "./arcade-kit";
import { approach, disposeTree, paintedTexture, shadowed } from "./stage-kit";
import { createWellBlocks } from "./tetris-blocks-3d";
import { PIECE_COLORS } from "./tetris-screen";
import { PIECES, shapeCells, type PieceKind, type Tetris, type TetrisEvent } from "./tetris-rules";

// Metres. The cabinet faces +Z and stands on the floor at y = 0.
const W = 0.68;
const T = 0.019;
const IW = W - 2 * T;
// The side's outline (depth z, height y), front to the right.
const SIDE: [number, number][] = [
  [-0.4, 0], [0.3, 0], [0.3, 0.8], [0.47, 0.86], [0.47, 0.95], [0.2, 1.03], [0.17, 1.06],
  [0.03, 1.58], [0.2, 1.63], [0.24, 1.86], [-0.4, 1.86],
];
const SIDE_MIN_Z = -0.4;
const SIDE_DEPTH = 0.87;
const SIDE_HEIGHT = 1.86;
// The control panel's top runs from its front edge up to the foot of the monitor.
const PANEL_FRONT: [number, number] = [0.47, 0.95];
const PANEL_BACK: [number, number] = [0.2, 1.03];
const PANEL_LEN = Math.hypot(PANEL_FRONT[0] - PANEL_BACK[0], PANEL_FRONT[1] - PANEL_BACK[1]);
// The monitor leans back between these two points.
const MONITOR_BOTTOM: [number, number] = [0.17, 1.06];
const MONITOR_TOP: [number, number] = [0.03, 1.58];
const MONITOR_LEN = Math.hypot(MONITOR_BOTTOM[0] - MONITOR_TOP[0], MONITOR_TOP[1] - MONITOR_BOTTOM[1]);
// The tube's visible face (4:3) and where it sits on the bezel.
const TUBE_W = 0.46;
const TUBE_H = 0.345;
const TUBE_Y = 0.03;
const TUBE_DEPTH = 0.035;
const MARQUEE_BOTTOM: [number, number] = [0.2, 1.63];
const MARQUEE_TOP: [number, number] = [0.24, 1.86];

// On the control panel (x across, z towards the player, from the panel's middle).
const STICK_AT = { x: -0.17, z: 0.012 };
export type CabinetButton = "cw" | "ccw" | "hold" | "drop" | "start";
const BUTTONS: { id: CabinetButton; x: number; z: number; color: string; label: string; size: number }[] = [
  { id: "ccw", x: 0.055, z: -0.03, color: "#2ea84e", label: "TURN ↺", size: 0.016 },
  { id: "cw", x: 0.115, z: -0.042, color: "#2f6fe0", label: "TURN ↻", size: 0.016 },
  { id: "hold", x: 0.175, z: -0.042, color: "#f0c419", label: "HOLD", size: 0.016 },
  { id: "drop", x: 0.09, z: 0.05, color: "#e2332e", label: "DROP", size: 0.019 },
  { id: "start", x: -0.02, z: -0.085, color: "#f4f4f0", label: "START", size: 0.011 },
];

// What one player's hands are doing, for the joystick and buttons.
export type CabinetControls = { stick: { x: number; down: boolean }; pressed: Record<CabinetButton, boolean> };
// One frame: `playing` brings the camera up close (otherwise it stands back to show the machine);
// `versus` puts the second player at the machine to the right; `narrow` (phones) keeps the camera
// on your own screen even then. players[0] is at the middle machine, players[1] at the right one.
export type CabinetFrame = { playing: boolean; versus: boolean; narrow: boolean; players: { game: Tetris; controls: CabinetControls }[] };

export type TetrisCabinet = {
  canvas: HTMLCanvasElement;
  render(dt: number, time: number, frame: CabinetFrame): void;
  // Where the pointer is over the canvas, -1 to 1 each way (or null when it leaves), for a little parallax.
  look(x: number | null, y: number | null): void;
  // Light, sparks and a nudge for what just happened in a player's game.
  effect(player: number, event: TetrisEvent, game: Tetris): void;
  resize(width: number, height: number): void;
  dispose(): void;
};

const mat = (color: THREE.ColorRepresentation, roughness = 0.6, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, ...extra });

// Turns a side-view outline (depth, height) into a solid `width` wide, centred on x = 0.
function profileSolid(points: [number, number][], width: number, bevel = 0) {
  const shape = new THREE.Shape(points.map(([z, y]) => new THREE.Vector2(z, y)));
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: width - bevel * 2,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 4,
  });
  // Shape x is depth (world z), shape y is height, and the extrusion runs across (world x).
  geometry.rotateY(-Math.PI / 2);
  geometry.translate(width / 2 - bevel, 0, 0);
  return geometry;
}

// A group sitting on the line from `a` to `b` in side view, with local +y along the line and +z out of the face.
function onSlope(a: [number, number], b: [number, number]) {
  const group = new THREE.Group();
  group.position.set(0, (a[1] + b[1]) / 2, (a[0] + b[0]) / 2);
  group.rotation.x = -Math.atan2(a[0] - b[0], b[1] - a[1]);
  return group;
}

// A tetromino drawn flat, for the art.
function paintPiece(ctx: CanvasRenderingContext2D, kind: PieceKind, x: number, y: number, size: number, rotation: 0 | 1 | 2 | 3 = 0, alpha = 1) {
  const color = PIECE_COLORS[kind];
  ctx.globalAlpha = alpha;
  for (const [cx, cy] of shapeCells(kind, rotation)) {
    const px = x + cx * size;
    const py = y + cy * size;
    const edge = size * 0.14;
    ctx.fillStyle = color.dark;
    ctx.fillRect(px, py, size, size);
    ctx.fillStyle = color.light;
    ctx.fillRect(px, py, size - edge, edge);
    ctx.fillRect(px, py, edge, size - edge);
    ctx.fillStyle = color.face;
    ctx.fillRect(px + edge, py + edge, size - edge * 2, size - edge * 2);
  }
  ctx.globalAlpha = 1;
}

function pixelFont() {
  const family = getComputedStyle(document.body).getPropertyValue("--font-pixel").trim();
  return family ? `${family}, ui-monospace, monospace` : "ui-monospace, monospace";
}

// The side art: deep colour fading down, tumbling pieces, onion domes against a starry sky, and a
// stripe along the front edge. No words, since one side is the other mirrored.
function sideArt(top: string, bottom: string, seed: number) {
  const width = 900;
  const height = Math.round(width * (SIDE_HEIGHT / SIDE_DEPTH));
  const { texture } = paintedTexture(width, height, (ctx) => {
    const fade = ctx.createLinearGradient(0, 0, 0, height);
    fade.addColorStop(0, top);
    fade.addColorStop(0.7, bottom);
    fade.addColorStop(1, "#07060f");
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, width, height);
    const random = seeded(seed);
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    for (let i = 0; i < 160; i++) ctx.fillRect(random() * width, random() * height * 0.55, 2 + random() * 2, 2 + random() * 2);
    // Domes along the bottom.
    ctx.fillStyle = "rgba(10, 6, 30, 0.85)";
    const ground = height * 0.86;
    ctx.fillRect(0, ground, width, height - ground);
    for (let i = 0; i < 5; i++) {
      const cx = 90 + i * 180 + (random() - 0.5) * 40;
      const r = 50 + random() * 40;
      const towerTop = ground - 160 - random() * 220;
      ctx.fillRect(cx - r * 0.7, towerTop, r * 1.4, ground - towerTop);
      ctx.beginPath();
      ctx.moveTo(cx - r, towerTop);
      ctx.bezierCurveTo(cx - r * 1.3, towerTop - r * 1.1, cx - r * 0.1, towerTop - r * 1.2, cx, towerTop - r * 2.2);
      ctx.bezierCurveTo(cx + r * 0.1, towerTop - r * 1.2, cx + r * 1.3, towerTop - r * 1.1, cx + r, towerTop);
      ctx.fill();
    }
    // Pieces tumbling down the side.
    for (let i = 0; i < 22; i++) {
      const kind = PIECES[Math.floor(random() * PIECES.length)]!;
      const size = 34 + random() * 30;
      paintPiece(ctx, kind, random() * (width - size * 3), height * 0.04 + random() * height * 0.72, size, Math.floor(random() * 4) as 0 | 1 | 2 | 3, 0.92);
    }
    // A chrome-and-colour stripe following the front edge.
    ctx.lineWidth = 26;
    ctx.strokeStyle = "rgba(255, 224, 102, 0.9)";
    ctx.beginPath();
    const toCanvas = ([z, y]: [number, number]) => [((z - SIDE_MIN_Z) / SIDE_DEPTH) * width, (1 - y / SIDE_HEIGHT) * height] as const;
    SIDE.slice(1, 10).forEach((point, index) => {
      const [x, y] = toCanvas([point[0] - 0.06, point[1]]);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.lineWidth = 8;
    ctx.strokeStyle = "rgba(255, 90, 90, 0.95)";
    ctx.stroke();
  });
  // The side's caps take their texture coordinates straight from the outline (metres).
  texture.repeat.set(1 / SIDE_DEPTH, 1 / SIDE_HEIGHT);
  texture.offset.set(-SIDE_MIN_Z / SIDE_DEPTH, 0);
  return texture;
}

function marqueeArt(font: string, title: string) {
  return paintedTexture(1024, 256, (ctx) => {
    const glow = ctx.createLinearGradient(0, 0, 0, 256);
    glow.addColorStop(0, "#1a0b4d");
    glow.addColorStop(0.5, "#2c1a7a");
    glow.addColorStop(1, "#13083a");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 1024, 256);
    // Rays from behind the title.
    ctx.globalAlpha = 0.16;
    for (let i = 0; i < 24; i++) {
      ctx.fillStyle = i % 2 ? "#ffffff" : "#ffd23f";
      ctx.beginPath();
      ctx.moveTo(512, 128);
      ctx.arc(512, 128, 700, (i / 24) * Math.PI * 2, ((i + 0.5) / 24) * Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // Pieces at each end.
    paintPiece(ctx, "T", 40, 70, 34);
    paintPiece(ctx, "L", 60, 150, 26, 1);
    paintPiece(ctx, "S", 870, 66, 34);
    paintPiece(ctx, "I", 880, 180, 26);
    // The title, each letter a piece colour with a dark outline and a bevel.
    const colors = ["#ec3b3b", "#f08a24", "#f5d020", "#3ccf4e", "#21c8e8", "#a845e0"];
    ctx.font = `700 150px ${font}`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    const letters = [...title];
    const widths = letters.map((letter) => ctx.measureText(letter).width + 8);
    let x = 512 - widths.reduce((sum, value) => sum + value, 0) / 2;
    letters.forEach((letter, index) => {
      ctx.lineJoin = "round";
      ctx.lineWidth = 18;
      ctx.strokeStyle = "#0a0420";
      ctx.strokeText(letter, x, 134);
      ctx.fillStyle = colors[index % colors.length]!;
      ctx.fillText(letter, x, 134);
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.fillText(letter, x - 3, 128);
      ctx.fillStyle = colors[index % colors.length]!;
      ctx.fillText(letter, x, 134);
      x += widths[index]!;
    });
    ctx.font = `600 22px ${font}`;
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffe9a8";
    ctx.fillText("CLARIO ARCADE  •  1 OR 2 PLAYERS", 512, 226);
  });
}

// The bezel round the tube: gloss black, how-to-play printed along the bottom.
function bezelArt(font: string) {
  const width = 1024;
  const height = Math.round(width * (MONITOR_LEN / IW));
  const result = paintedTexture(width, height, (ctx) => {
    ctx.fillStyle = "#07070c";
    ctx.fillRect(0, 0, width, height);
    const sheen = ctx.createLinearGradient(0, 0, width, height);
    sheen.addColorStop(0, "rgba(60, 70, 140, 0.25)");
    sheen.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, width, height);
    // A thin coloured line framing the tube.
    const tubeLeft = ((IW - TUBE_W) / 2 / IW) * width;
    const tubeTop = ((MONITOR_LEN / 2 - TUBE_Y - TUBE_H / 2) / MONITOR_LEN) * height;
    const tubeW = (TUBE_W / IW) * width;
    const tubeH = (TUBE_H / MONITOR_LEN) * height;
    ctx.strokeStyle = "#3b5cff";
    ctx.lineWidth = 5;
    ctx.strokeRect(tubeLeft - 14, tubeTop - 14, tubeW + 28, tubeH + 28);
    ctx.strokeStyle = "#ec3b3b";
    ctx.lineWidth = 2;
    ctx.strokeRect(tubeLeft - 22, tubeTop - 22, tubeW + 44, tubeH + 44);
    ctx.font = `600 26px ${font}`;
    ctx.textBaseline = "middle";
    const below = tubeTop + tubeH + (height - tubeTop - tubeH) / 2 + 4;
    ctx.fillStyle = "#9fb4ff";
    ctx.textAlign = "left";
    ctx.fillText("◀ ▶ MOVE   ▼ SOFT DROP", tubeLeft, below);
    ctx.textAlign = "right";
    ctx.fillText("TURN • DROP • HOLD", tubeLeft + tubeW, below);
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffe066";
    ctx.fillText("★ LINE UP 4 FOR A TETRIS ★", width / 2, tubeTop / 2);
  });
  // The bezel is a flat shape whose texture coordinates are in metres from its middle.
  result.texture.repeat.set(1 / IW, 1 / MONITOR_LEN);
  result.texture.offset.set(0.5, 0.5);
  return result.texture;
}

// The control panel's printed overlay, lined up with the stick and buttons.
const PANEL_DEPTH = PANEL_LEN;
function panelArt(font: string) {
  const width = 1024;
  const height = Math.round(width * (PANEL_DEPTH / IW));
  const toCanvas = (x: number, z: number) => [(x / IW + 0.5) * width, (z / PANEL_DEPTH + 0.5) * height] as const;
  return paintedTexture(width, height, (ctx) => {
    const base = ctx.createLinearGradient(0, 0, 0, height);
    base.addColorStop(0, "#1d1460");
    base.addColorStop(1, "#0d0a33");
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, width, height);
    const random = seeded(11);
    for (let i = 0; i < 18; i++) {
      paintPiece(ctx, PIECES[i % PIECES.length]!, random() * width, random() * height, 14 + random() * 10, Math.floor(random() * 4) as 0 | 1 | 2 | 3, 0.18);
    }
    // A ring of arrows round the stick.
    const [sx, sy] = toCanvas(STICK_AT.x, STICK_AT.z);
    ctx.strokeStyle = "rgba(255, 224, 102, 0.85)";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(sx, sy, 92, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#ffe066";
    ctx.font = `700 34px ${font}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("◀", sx - 126, sy);
    ctx.fillText("▶", sx + 126, sy);
    ctx.fillText("▼", sx, sy + 122);
    ctx.font = `600 22px ${font}`;
    for (const button of BUTTONS) {
      const [bx, by] = toCanvas(button.x, button.z);
      const r = (button.size / IW) * width;
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.beginPath();
      ctx.arc(bx, by, r * 1.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = button.color;
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      ctx.fillText(button.label, bx, by + r * 1.45 + 20);
    }
  });
}

function coinArt(font: string) {
  return paintedTexture(64, 128, (ctx) => {
    ctx.fillStyle = "#ff3b2f";
    ctx.fillRect(0, 0, 64, 128);
    ctx.fillStyle = "#1a0000";
    ctx.fillRect(28, 12, 8, 54);
    ctx.font = `700 20px ${font}`;
    ctx.textAlign = "center";
    ctx.fillStyle = "#fff4d6";
    ctx.fillText("25¢", 32, 100);
  });
}

// Arcade carpet: black with neon shapes.
function carpetArt() {
  const { texture } = paintedTexture(512, 512, (ctx) => {
    ctx.fillStyle = "#0b0814";
    ctx.fillRect(0, 0, 512, 512);
    const random = seeded(5);
    const colors = ["#ff3fa4", "#2de2e6", "#f9f871", "#8a5cff", "#ff8b3d"];
    for (let i = 0; i < 70; i++) {
      ctx.strokeStyle = colors[i % colors.length]!;
      ctx.fillStyle = colors[(i + 2) % colors.length]!;
      ctx.lineWidth = 5;
      const x = random() * 512;
      const y = random() * 512;
      const s = 10 + random() * 22;
      const kind = i % 4;
      ctx.beginPath();
      if (kind === 0) ctx.arc(x, y, s / 2, 0, Math.PI * 2);
      else if (kind === 1) {
        ctx.moveTo(x, y - s / 2);
        ctx.lineTo(x + s / 2, y + s / 2);
        ctx.lineTo(x - s / 2, y + s / 2);
        ctx.closePath();
      } else if (kind === 2) {
        ctx.moveTo(x - s, y);
        ctx.bezierCurveTo(x - s / 2, y - s, x, y + s, x + s, y);
      } else {
        ctx.fillRect(x, y, s / 3, s / 3);
        continue;
      }
      ctx.stroke();
    }
  });
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(5, 5);
  return texture;
}

function wallArt(font: string) {
  return paintedTexture(1024, 512, (ctx) => {
    const fade = ctx.createLinearGradient(0, 0, 0, 512);
    fade.addColorStop(0, "#0c0a1c");
    fade.addColorStop(1, "#1a1030");
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, 1024, 512);
    // Neon tubes: a soft halo, then the bright core.
    ctx.font = `700 92px ${font}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const [blur, color, width] of [[36, "rgba(255, 63, 164, 0.8)", 10], [0, "#ffd6ef", 4]] as const) {
      ctx.shadowBlur = blur;
      ctx.shadowColor = color;
      ctx.lineWidth = width;
      ctx.strokeStyle = color;
      ctx.strokeText("GAME ROOM", 512, 150);
    }
    ctx.shadowBlur = 0;
  });
}

// A soft round glow, for light falling on the floor.
function glowTexture() {
  return paintedTexture(128, 128, (ctx) => {
    const glow = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    glow.addColorStop(0, "rgba(255,255,255,0.9)");
    glow.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 128, 128);
  }).texture;
}

type CabinetParts = {
  group: THREE.Group;
  stick: THREE.Group;
  buttons: Map<CabinetButton, THREE.Mesh>;
  screenMaterial: THREE.MeshStandardMaterial;
  marqueeMaterial: THREE.MeshStandardMaterial;
  tube: THREE.Object3D;
  tubeCentre: THREE.Vector3;
  tubeNormal: THREE.Vector3;
};

type CabinetLook = { side: THREE.Texture; marquee: THREE.Texture; screen: THREE.Texture; bezel: THREE.Texture; panel: THREE.Texture; coin: THREE.Texture };

function buildCabinet(look: CabinetLook, shared: { laminate: THREE.Material; molding: THREE.Material; steel: THREE.Material; chrome: THREE.Material; black: THREE.Material }) {
  const group = new THREE.Group();
  const sideMaterial = new THREE.MeshPhysicalMaterial({ map: look.side, roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.3 });

  // Two sides: one outline extruded, the other its mirror image (so the art faces out on both).
  const sideGeometry = profileSolid(SIDE, T);
  for (const flip of [1, -1]) {
    const side = new THREE.Mesh(sideGeometry, [sideMaterial, shared.molding]);
    side.position.x = flip * (W / 2 - T / 2);
    side.scale.x = flip;
    group.add(side);
  }

  // Top and back.
  const top = new THREE.Mesh(new THREE.BoxGeometry(IW, T, 0.64), shared.laminate);
  top.position.set(0, SIDE_HEIGHT - T / 2, SIDE_MIN_Z + 0.32);
  const back = new THREE.Mesh(new THREE.BoxGeometry(IW, SIDE_HEIGHT - 0.02, T), shared.laminate);
  back.position.set(0, SIDE_HEIGHT / 2, SIDE_MIN_Z + T / 2);
  group.add(top, back);

  // The lower front: black laminate over a steel kick plate, with the coin door.
  const front = new THREE.Mesh(new THREE.BoxGeometry(IW, 0.72, T), shared.laminate);
  front.position.set(0, 0.08 + 0.36, 0.3 - T / 2);
  const kick = new THREE.Mesh(new THREE.BoxGeometry(IW, 0.08, T), shared.steel);
  kick.position.set(0, 0.04, 0.3 - T / 2 + 0.002);
  group.add(front, kick);
  const door = new THREE.Mesh(new RoundedBoxGeometry(0.27, 0.34, 0.016, 2, 0.006), shared.steel);
  door.position.set(0, 0.5, 0.3 + 0.006);
  group.add(door);
  const coinMaterial = new THREE.MeshStandardMaterial({ map: look.coin, emissiveMap: look.coin, emissive: "#ffffff", emissiveIntensity: 1.6, roughness: 0.4 });
  for (const x of [-0.06, 0.06]) {
    const bezel = new THREE.Mesh(new RoundedBoxGeometry(0.06, 0.1, 0.012, 2, 0.004), shared.chrome);
    bezel.position.set(x, 0.56, 0.3 + 0.017);
    const slot = new THREE.Mesh(new THREE.PlaneGeometry(0.042, 0.084), coinMaterial);
    slot.position.set(x, 0.56, 0.3 + 0.0235);
    const flap = new THREE.Mesh(new RoundedBoxGeometry(0.05, 0.05, 0.014, 2, 0.004), shared.black);
    flap.position.set(x, 0.43, 0.3 + 0.017);
    group.add(bezel, slot, flap);
  }
  const lock = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.01, 20).rotateX(Math.PI / 2), shared.chrome);
  lock.position.set(0.1, 0.62, 0.3 + 0.019);
  group.add(lock);

  // The control panel box (in side view, the jutting part under its top).
  const panelBox = new THREE.Mesh(profileSolid([[0.29, 0.8], [0.47, 0.86], PANEL_FRONT, PANEL_BACK, [0.2, 0.8]], IW + 0.02, 0.004), shared.laminate);
  // A strip of T-molding along its front edge.
  const lip = new THREE.Mesh(new THREE.BoxGeometry(IW + 0.024, 0.008, 0.008), shared.molding);
  lip.position.set(0, PANEL_FRONT[1], PANEL_FRONT[0] + 0.002);
  group.add(panelBox, lip);
  const panel = onSlope(PANEL_FRONT, PANEL_BACK);
  // onSlope's +y runs up the slope; turn it so the panel's top faces +y and +z points at the player.
  panel.rotation.x += Math.PI / 2;
  group.add(panel);
  const overlay = new THREE.Mesh(
    new THREE.PlaneGeometry(IW + 0.02, PANEL_LEN).rotateX(-Math.PI / 2),
    new THREE.MeshPhysicalMaterial({ map: look.panel, roughness: 0.4, clearcoat: 0.7, clearcoatRoughness: 0.28 }),
  );
  overlay.position.y = 0.001;
  panel.add(overlay);

  // Joystick: dust washer, chrome shaft, red ball.
  const stick = new THREE.Group();
  stick.position.set(STICK_AT.x, 0.002, STICK_AT.z);
  const washer = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.003, 32), shared.black);
  panel.add(washer);
  washer.position.copy(stick.position);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.07, 16), shared.chrome);
  shaft.position.y = 0.035;
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.019, 32, 24), new THREE.MeshPhysicalMaterial({ color: "#d61f1f", roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.05 }));
  ball.position.y = 0.075;
  stick.add(shaft, ball);
  panel.add(stick);

  // Buttons: a housing ring and a plunger that sinks when pressed.
  const buttons = new Map<CabinetButton, THREE.Mesh>();
  for (const spec of BUTTONS) {
    const housing = new THREE.Mesh(new THREE.CylinderGeometry(spec.size * 1.25, spec.size * 1.3, 0.008, 32), shared.black);
    housing.position.set(spec.x, 0.004, spec.z);
    const plunger = new THREE.Mesh(
      new THREE.CylinderGeometry(spec.size, spec.size, 0.012, 32),
      new THREE.MeshPhysicalMaterial({ color: spec.color, roughness: 0.25, clearcoat: 0.8, clearcoatRoughness: 0.15 }),
    );
    plunger.position.set(spec.x, 0.011, spec.z);
    plunger.userData.rest = 0.011;
    panel.add(housing, plunger);
    buttons.set(spec.id, plunger);
  }

  // A strip closing the gap between the control panel and the monitor.
  const gap = onSlope(PANEL_BACK, MONITOR_BOTTOM);
  gap.add(new THREE.Mesh(new THREE.PlaneGeometry(IW, Math.hypot(PANEL_BACK[0] - MONITOR_BOTTOM[0], MONITOR_BOTTOM[1] - PANEL_BACK[1]) + 0.01), shared.laminate));
  group.add(gap);

  // The monitor: bezel with a hole, the tube behind it, glass over the hole.
  const monitor = onSlope(MONITOR_BOTTOM, MONITOR_TOP);
  group.add(monitor);
  const hole = new THREE.Path();
  const hw = TUBE_W / 2 + 0.006;
  const hh = TUBE_H / 2 + 0.006;
  const r = 0.025;
  hole.moveTo(-hw + r, TUBE_Y - hh);
  hole.lineTo(hw - r, TUBE_Y - hh);
  hole.quadraticCurveTo(hw, TUBE_Y - hh, hw, TUBE_Y - hh + r);
  hole.lineTo(hw, TUBE_Y + hh - r);
  hole.quadraticCurveTo(hw, TUBE_Y + hh, hw - r, TUBE_Y + hh);
  hole.lineTo(-hw + r, TUBE_Y + hh);
  hole.quadraticCurveTo(-hw, TUBE_Y + hh, -hw, TUBE_Y + hh - r);
  hole.lineTo(-hw, TUBE_Y - hh + r);
  hole.quadraticCurveTo(-hw, TUBE_Y - hh, -hw + r, TUBE_Y - hh);
  const bezelShape = new THREE.Shape([
    new THREE.Vector2(-IW / 2, -MONITOR_LEN / 2), new THREE.Vector2(IW / 2, -MONITOR_LEN / 2),
    new THREE.Vector2(IW / 2, MONITOR_LEN / 2), new THREE.Vector2(-IW / 2, MONITOR_LEN / 2),
  ]);
  bezelShape.holes.push(hole);
  const bezel = new THREE.Mesh(
    new THREE.ShapeGeometry(bezelShape, 8),
    new THREE.MeshPhysicalMaterial({ map: look.bezel, roughness: 0.45, clearcoat: 0.3, clearcoatRoughness: 0.4, envMapIntensity: 0.4 }),
  );
  monitor.add(bezel);
  // The tunnel from the bezel back to the tube.
  const tunnel = new THREE.Mesh(new THREE.BoxGeometry(hw * 2, hh * 2, TUBE_DEPTH, 1, 1, 1), new THREE.MeshStandardMaterial({ color: "#050507", roughness: 0.9, side: THREE.BackSide }));
  tunnel.position.set(0, TUBE_Y, -TUBE_DEPTH / 2);
  monitor.add(tunnel);
  // The tube bulges towards you a little, like real glass.
  const tubeGeometry = new THREE.PlaneGeometry(TUBE_W, TUBE_H, 24, 18);
  const position = tubeGeometry.attributes.position!;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i) / (TUBE_W / 2);
    const y = position.getY(i) / (TUBE_H / 2);
    position.setZ(i, 0.012 * (1 - x * x * 0.8) * (1 - y * y * 0.8));
  }
  tubeGeometry.computeVertexNormals();
  const screenMaterial = new THREE.MeshStandardMaterial({ color: "#000000", emissive: "#ffffff", emissiveMap: look.screen, emissiveIntensity: 1.25, roughness: 0.5, metalness: 0 });
  const tube = new THREE.Mesh(tubeGeometry, screenMaterial);
  tube.position.set(0, TUBE_Y, -TUBE_DEPTH + 0.004);
  monitor.add(tube);
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(hw * 2, hh * 2),
    new THREE.MeshPhysicalMaterial({ color: "#0a0d14", roughness: 0.22, transparent: true, opacity: 0.06, depthWrite: false }),
  );
  glass.position.set(0, TUBE_Y, -0.003);
  monitor.add(glass);

  // Underneath the marquee: a grille, then the backlit marquee in an aluminium frame.
  const under = onSlope(MONITOR_TOP, MARQUEE_BOTTOM);
  const grille = new THREE.Mesh(new THREE.PlaneGeometry(IW, Math.hypot(MARQUEE_BOTTOM[0] - MONITOR_TOP[0], MARQUEE_BOTTOM[1] - MONITOR_TOP[1])), shared.black);
  under.add(grille);
  group.add(under);
  const marquee = onSlope(MARQUEE_BOTTOM, MARQUEE_TOP);
  const marqueeLen = Math.hypot(MARQUEE_TOP[0] - MARQUEE_BOTTOM[0], MARQUEE_TOP[1] - MARQUEE_BOTTOM[1]);
  const marqueeMaterial = new THREE.MeshStandardMaterial({ map: look.marquee, emissiveMap: look.marquee, emissive: "#ffffff", emissiveIntensity: 1.1, roughness: 0.3 });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(IW, marqueeLen - 0.02), marqueeMaterial);
  sign.position.z = -0.004;
  marquee.add(sign);
  for (const y of [-marqueeLen / 2 + 0.006, marqueeLen / 2 - 0.006]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(IW, 0.012, 0.01), shared.chrome);
    rail.position.set(0, y, 0);
    marquee.add(rail);
  }
  const lightbox = new THREE.Mesh(new THREE.BoxGeometry(IW, marqueeLen, 0.12), shared.laminate);
  lightbox.position.z = -0.066;
  marquee.add(lightbox);
  group.add(marquee);

  shadowed(group);
  // The tube's middle and facing, in the cabinet's space, for the camera.
  group.updateMatrixWorld(true);
  const tubeCentre = tube.getWorldPosition(new THREE.Vector3());
  const tubeNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(tube.getWorldQuaternion(new THREE.Quaternion()));
  return { group, stick, buttons, screenMaterial, marqueeMaterial, tube, tubeCentre, tubeNormal } satisfies CabinetParts;
}

// The other machines' screens: a frozen game and "insert coin".
function attractScreen(font: string, seed: number) {
  return paintedTexture(256, 192, (ctx) => {
    ctx.fillStyle = "#04061a";
    ctx.fillRect(0, 0, 256, 192);
    const random = seeded(seed);
    for (let i = 0; i < 9; i++) paintPiece(ctx, PIECES[Math.floor(random() * 7)]!, 70 + random() * 90, 60 + random() * 110, 9, Math.floor(random() * 4) as 0 | 1 | 2 | 3);
    ctx.font = `700 22px ${font}`;
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffe066";
    ctx.fillText("INSERT COIN", 128, 34);
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    for (let y = 0; y < 192; y += 3) ctx.fillRect(0, y, 256, 1);
  }).texture;
}

// `screens`: your tube, and the one the other player's game is painted on in versus.
export function createTetrisCabinet({ screens, reducedMotion, onLost }: { screens: [HTMLCanvasElement, HTMLCanvasElement]; reducedMotion: boolean; onLost?: () => void }): TetrisCabinet {
  const motion = !reducedMotion;
  const canvas = document.createElement("canvas");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const onContextLost = (event: Event) => {
    event.preventDefault();
    onLost?.();
  };
  canvas.addEventListener("webglcontextlost", onContextLost);
  const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const scene = new THREE.Scene();
  const backdrop = "#07050d";
  scene.background = new THREE.Color(backdrop);
  scene.fog = new THREE.Fog(backdrop, 3.5, 9);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = environment;
  scene.environmentIntensity = 0.18;

  const font = pixelFont();
  const [screenTexture, rivalTexture] = screens.map((screen) => {
    const texture = new THREE.CanvasTexture(screen);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    texture.anisotropy = anisotropy;
    return texture;
  }) as [THREE.CanvasTexture, THREE.CanvasTexture];

  const shared = {
    laminate: mat("#101014", 0.55),
    molding: mat("#8e97ad", 0.38, { metalness: 0.85 }),
    steel: mat("#7c8494", 0.38, { metalness: 0.85 }),
    chrome: mat("#e4e8f0", 0.12, { metalness: 1 }),
    black: mat("#0b0b0e", 0.5),
  };
  const textures = (side: [string, string, number], title: string, screenTex: THREE.Texture): CabinetLook => {
    const look = {
      side: sideArt(...side),
      marquee: marqueeArt(font, title).texture,
      screen: screenTex,
      bezel: bezelArt(font),
      panel: panelArt(font).texture,
      coin: coinArt(font).texture,
    };
    for (const texture of Object.values(look)) texture.anisotropy = anisotropy;
    return look;
  };
  const main = buildCabinet(textures(["#2a2fd6", "#4a1a8f", 3], "TETRIS", screenTexture), shared);
  scene.add(main.group);
  const wellBlocks = createWellBlocks(main.tube, { width: TUBE_W, height: TUBE_H, bulge: 0.012 }, reducedMotion);
  // Neighbours, turned in a little.
  const neighbours = [
    { x: -0.98, turn: 0.22, side: ["#b0162d", "#4a0b2a", 9] as [string, string, number], title: "BLOCKS", seed: 4 },
    { x: 0.98, turn: -0.22, side: ["#0f8f6a", "#0b3b4a", 17] as [string, string, number], title: "STACKS", seed: 8 },
  ];
  const rival = neighbours.map((spec): CabinetParts => {
    const parts = buildCabinet(textures(spec.side, spec.title, attractScreen(font, spec.seed)), shared);
    parts.group.position.set(spec.x, 0, -0.08);
    parts.group.rotation.y = spec.turn;
    parts.screenMaterial.emissiveIntensity = 0.7;
    parts.marqueeMaterial.emissiveIntensity = 0.9;
    scene.add(parts.group);
    return parts;
  })[1]!;
  // In versus the right machine stands square beside yours and shows the other player's game.
  const rivalAttract = rival.screenMaterial.emissiveMap;
  const rivalSpot = { apart: { x: 0.98, turn: -0.22 }, versus: { x: 0.74, turn: 0 } };
  let versusOn = false;
  function setVersus(on: boolean) {
    versusOn = on;
    const spot = on ? rivalSpot.versus : rivalSpot.apart;
    rival.group.position.x = spot.x;
    rival.group.rotation.y = spot.turn;
    rival.group.updateMatrixWorld(true);
    rival.screenMaterial.emissiveMap = on ? rivalTexture : rivalAttract;
    rival.screenMaterial.emissiveIntensity = on ? 1.2 : 0.7;
    rival.screenMaterial.needsUpdate = true;
    frame();
  }

  // The room: carpet, a back wall with a neon sign, darkness beyond.
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 12).rotateX(-Math.PI / 2), mat("#ffffff", 0.92, { map: carpetArt() }));
  floor.receiveShadow = true;
  const wallTexture = wallArt(font).texture;
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(6, 3), new THREE.MeshStandardMaterial({ map: wallTexture, emissiveMap: wallTexture, emissive: "#ffffff", emissiveIntensity: 0.55, roughness: 0.9 }));
  wall.position.set(0, 1.5, -0.75);
  wall.receiveShadow = true;
  scene.add(floor, wall);
  // A soft pool of light on the carpet under the main machine's screen.
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: glowTexture(), color: "#3a4cff", transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.position.set(0, 0.003, 0.75);
  scene.add(glow);

  // Light: a dim fill, a warm spot from the ceiling, the tube's cool glow, coloured rims from behind.
  scene.add(new THREE.HemisphereLight("#5a64b8", "#120a1c", 0.35));
  // Steeply overhead, so its reflection in the glass is out of sight from in front.
  const spot = new THREE.SpotLight("#ffe2c2", 7, 6, 0.55, 0.7, 1.6);
  spot.position.set(0.2, 3.2, 0.95);
  spot.target.position.set(0, 0.85, 0.3);
  spot.castShadow = true;
  spot.shadow.mapSize.set(1024, 1024);
  spot.shadow.bias = -0.0004;
  spot.shadow.normalBias = 0.02;
  scene.add(spot, spot.target);
  const screenLight = new THREE.PointLight("#7f9bff", 0.5, 1.6, 1.6);
  // Below the tube, so it lights the control panel without a glare spot on the glass.
  screenLight.position.copy(main.tubeCentre).addScaledVector(main.tubeNormal, 0.35);
  screenLight.position.y -= 0.35;
  // Tucked under the marquee's overhang, out of sight.
  const marqueeLight = new THREE.PointLight("#c9b8ff", 0.3, 1.2, 1.8);
  marqueeLight.position.set(0, 1.6, 0.2);
  const rimLeft = new THREE.PointLight("#ff3fa4", 3, 4, 1.5);
  rimLeft.position.set(-1.5, 1.8, -0.5);
  const rimRight = new THREE.PointLight("#2de2e6", 3, 4, 1.5);
  rimRight.position.set(1.5, 1.8, -0.5);
  scene.add(screenLight, marqueeLight, rimLeft, rimRight);

  const camera = new THREE.PerspectiveCamera(32, 1.6, 0.05, 30);
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(512, 320), 0.4, 0.4, 0.9);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  // Framing: across the room at first, then the machine, and up close on the tube during a game.
  let aspect = 1.6;
  const pointer = new THREE.Vector2();
  const pointerTarget = new THREE.Vector2();
  let jolt = 0;
  let flash = 0;
  let marqueeFlash = 0;
  let narrow = false;
  const wide = { position: new THREE.Vector3(1.1, 1.6, 3.6), target: new THREE.Vector3(0, 1.0, 0) };
  const machine = { position: new THREE.Vector3(), target: new THREE.Vector3() };
  const close = { position: new THREE.Vector3(), target: new THREE.Vector3() };
  const both = { position: new THREE.Vector3(), target: new THREE.Vector3() };
  const eye = wide.position.clone();
  const look = wide.target.clone();
  let started = false;
  const towardsMachine = new THREE.Vector3(0.28, 0.1, 1).normalize();

  const fit = (needW: number, needH: number) => {
    const halfFov = THREE.MathUtils.degToRad(camera.fov / 2);
    return Math.max(needH / 2 / Math.tan(halfFov), needW / 2 / (Math.tan(halfFov) * aspect));
  };
  function frame() {
    // Narrow or squarish (phones): the tube alone, as big as it goes.
    const portrait = aspect < 1.3;
    // The machine from the control panel up to the marquee, a little from the side.
    machine.target.set(0, portrait ? 1.3 : 1.36, 0.16);
    machine.position.copy(machine.target).addScaledVector(towardsMachine, fit(portrait ? 0.8 : 1.0, 1.1));
    // The tube filling the view, seen a touch from above.
    close.target.copy(main.tubeCentre);
    close.position.copy(main.tubeCentre).addScaledVector(main.tubeNormal, fit(TUBE_W + 0.05, TUBE_H + 0.05));
    close.position.y += 0.02;
    // Versus: both tubes side by side.
    const rivalCentre = rival.group.localToWorld(rival.tubeCentre.clone());
    both.target.lerpVectors(main.tubeCentre, rivalCentre, 0.5);
    const width = main.tubeCentre.distanceTo(rivalCentre) + TUBE_W + 0.08;
    both.position.copy(both.target).addScaledVector(main.tubeNormal, fit(width, TUBE_H + 0.12));
    both.position.y += 0.03;
  }
  frame();

  // Joysticks and buttons ease towards what's held.
  const sticks = [{ x: 0, z: 0 }, { x: 0, z: 0 }];

  return {
    canvas,
    render(dt, time, { playing, versus, narrow: isNarrow, players }) {
      if (versus !== versusOn) setVersus(versus);
      narrow = isNarrow;
      const goal = versus && playing && !narrow ? both : playing ? close : machine;
      if (!motion || !started) {
        // With reduced motion the camera cuts; otherwise it starts across the room.
        if (!motion) {
          eye.copy(goal.position);
          look.copy(goal.target);
        }
        started = true;
      } else {
        const rate = 2.4;
        eye.set(approach(eye.x, goal.position.x, rate, dt), approach(eye.y, goal.position.y, rate, dt), approach(eye.z, goal.position.z, rate, dt));
        look.set(approach(look.x, goal.target.x, rate, dt), approach(look.y, goal.target.y, rate, dt), approach(look.z, goal.target.z, rate, dt));
      }
      pointer.x = approach(pointer.x, motion ? pointerTarget.x : 0, 3, dt);
      pointer.y = approach(pointer.y, motion ? pointerTarget.y : 0, 3, dt);
      camera.position.copy(eye);
      camera.position.x += pointer.x * 0.05;
      camera.position.y += pointer.y * 0.03;
      jolt = Math.max(0, jolt - dt);
      if (motion && jolt > 0) camera.position.y -= Math.sin((jolt / 0.18) * Math.PI) * 0.006;
      camera.lookAt(look);

      // Joysticks tilt and buttons sink at both machines.
      [main, rival].forEach((parts, index) => {
        const controls = players[index]?.controls;
        const stick = sticks[index]!;
        stick.x = approach(stick.x, controls?.stick.x ?? 0, 22, dt);
        stick.z = approach(stick.z, controls?.stick.down ? 1 : 0, 22, dt);
        parts.stick.rotation.z = -stick.x * 0.32;
        parts.stick.rotation.x = stick.z * 0.32;
        for (const [id, plunger] of parts.buttons) {
          const rest = plunger.userData.rest as number;
          plunger.position.y = approach(plunger.position.y, controls?.pressed[id] ? rest - 0.0045 : rest, 40, dt);
        }
      });
      if (players[0]) wellBlocks.update(players[0].game, dt);

      // The tube flickers faintly and flares on a clear; the marquee pulses after a Tetris.
      flash = Math.max(0, flash - dt * 2.5);
      marqueeFlash = Math.max(0, marqueeFlash - dt * 1.5);
      const flicker = motion ? Math.sin(time * 120) * 0.012 + Math.sin(time * 7.3) * 0.01 : 0;
      main.screenMaterial.emissiveIntensity = 1.25 + flicker + flash * 0.5;
      screenLight.intensity = 0.5 + flash * 1.6;
      main.marqueeMaterial.emissiveIntensity = 1.1 + (motion ? marqueeFlash * Math.abs(Math.sin(time * 14)) : marqueeFlash * 0.6);
      screenTexture.needsUpdate = true;
      if (versusOn) rivalTexture.needsUpdate = true;
      composer.render(dt);
    },
    look(x, y) {
      if (x === null || y === null) pointerTarget.set(0, 0);
      else pointerTarget.set(THREE.MathUtils.clamp(x, -1, 1), THREE.MathUtils.clamp(y, -1, 1));
    },
    effect(player, event, game) {
      // The other machine's player only gets the camera's attention when it's on screen.
      if (player !== 0) return;
      if (event.type === "hardDrop" && event.rows > 0) jolt = 0.18;
      else if (event.type === "clear" && event.lines > 0) {
        wellBlocks.burst(event.rows, game);
        const big = event.lines === 4 || event.tSpin;
        flash = big ? 1 : 0.6;
        if (big) marqueeFlash = 1.4;
      } else if (event.type === "level") marqueeFlash = 1;
      else if (event.type === "garbage") jolt = 0.24;
      else if (event.type === "over") flash = 0.3;
    },
    resize(width, height) {
      if (width <= 0 || height <= 0) return;
      aspect = width / height;
      renderer.setSize(width, height, false);
      composer.setSize(width, height);
      camera.aspect = aspect;
      camera.fov = aspect < 1.3 ? 38 : 32;
      camera.updateProjectionMatrix();
      frame();
    },
    dispose() {
      canvas.removeEventListener("webglcontextlost", onContextLost);
      disposeTree(scene);
      screenTexture.dispose();
      rivalTexture.dispose();
      rivalAttract?.dispose();
      environment.dispose();
      pmrem.dispose();
      bloom.dispose();
      composer.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
