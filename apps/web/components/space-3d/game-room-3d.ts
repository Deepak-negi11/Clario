import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// The Game Room's furniture in 3D, built from shapes: arcade cabinets with a lit marquee and
// screen, a full-size ping-pong table on a folding frame, and a foosball table with players on
// its rods. Each is centred on its footprint with its front (the side you play from) towards +z.

const mat = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0, ...extra });

function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0) {
  const made = new THREE.Mesh(geometry, material);
  made.position.set(x, y, z);
  made.castShadow = true;
  made.receiveShadow = true;
  return made;
}

type Part = readonly [w: number, h: number, d: number, x: number, y: number, z: number];

// Many boxes (and other shapes) in one material, merged into one mesh: one draw call each.
function merged(geometries: THREE.BufferGeometry[], material: THREE.Material) {
  const out = mesh(mergeGeometries(geometries), material);
  for (const geometry of geometries) geometry.dispose();
  return out;
}
const boxGeometries = (parts: readonly Part[]) => parts.map(([w, h, d, x, y, z]) => new THREE.BoxGeometry(w, h, d).translate(x, y, z));

// A cylinder standing up (or turned with `along`), at x, y, z.
function cylinder(radius: number, length: number, x: number, y: number, z: number, along: "y" | "x" | "z" = "y", segments = 16) {
  const geometry = new THREE.CylinderGeometry(radius, radius, length, segments);
  if (along === "x") geometry.rotateZ(Math.PI / 2);
  if (along === "z") geometry.rotateX(Math.PI / 2);
  return geometry.translate(x, y, z);
}

// A lit picture drawn on a canvas: screens, marquees and signs glow on their own.
function canvasMaterial(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void, glow = true) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext("2d")!);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return glow
    ? new THREE.MeshBasicMaterial({ map: texture, toneMapped: false })
    : new THREE.MeshStandardMaterial({ map: texture, roughness: 0.55 });
}

// ---- Arcade cabinet ----

const CABINET_COLORS = [
  { body: "#2f6fe0", accent: "#7fd2ff", deep: "#183e8a" },
  { body: "#1f8f84", accent: "#b6f36a", deep: "#0f5650" },
  { body: "#c43d3b", accent: "#ffd166", deep: "#7c1f22" },
];

// The cabinet's side, as [z, y] points (front is +z): a kick panel, the control panel jutting
// out, the screen leaning back, and the marquee hood on top.
const PROFILE: [number, number][] = [
  [-0.38, 0], [0.3, 0], [0.3, 0.8], [0.42, 0.87], [0.42, 0.92], [0.22, 1.03],
  [0.1, 1.55], [0.26, 1.6], [0.26, 1.86], [-0.38, 1.86],
];

function profileGeometry(width: number) {
  const shape = new THREE.Shape(PROFILE.map(([z, y]) => new THREE.Vector2(z, y)));
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false });
  // Extruded along z; turn it so the profile stands in the y-z plane and the width runs along x.
  geometry.rotateY(-Math.PI / 2);
  geometry.translate(width / 2, 0, 0);
  return geometry;
}

// Side art: the body colour fading darker to the floor, with three bold stripes.
function sideArt(colors: (typeof CABINET_COLORS)[number]) {
  const material = canvasMaterial(128, 256, (ctx) => {
    const fade = ctx.createLinearGradient(0, 0, 0, 256);
    fade.addColorStop(0, colors.body);
    fade.addColorStop(1, colors.deep);
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, 128, 256);
    ctx.save();
    ctx.translate(64, 150);
    ctx.rotate(-0.5);
    [colors.accent, "#ffffff", colors.accent].forEach((color, i) => {
      ctx.fillStyle = color;
      ctx.globalAlpha = i === 1 ? 0.85 : 0.95;
      ctx.fillRect(-120, -34 + i * 24, 240, 12);
    });
    ctx.restore();
  }, false);
  // The extrusion's flat faces take the profile's coordinates as UVs (metres), so stretch the
  // picture over the profile's size.
  material.map!.repeat.set(1 / 0.8, 1 / 1.86);
  material.map!.offset.set(0.38 / 0.8, 0);
  return material;
}

// An attract screen: falling blocks, the title and a blinking-style "INSERT COIN".
function attractScreen(accent: string) {
  return canvasMaterial(256, 200, (ctx) => {
    ctx.fillStyle = "#070b1c";
    ctx.fillRect(0, 0, 256, 200);
    const colors = ["#ff4fd8", "#4fd8ff", "#ffd84f", "#6bff8a", "#ff8a4f"];
    const cell = 12;
    // A stack of blocks along the bottom and two pieces falling.
    for (let x = 0; x < 256; x += cell) {
      const height = 1 + ((x * 7) % 5);
      for (let k = 0; k < height; k++) {
        ctx.fillStyle = colors[(x / cell + k) % colors.length]!;
        ctx.fillRect(x + 1, 200 - (k + 1) * cell + 1, cell - 2, cell - 2);
      }
    }
    for (const [px, py, color] of [[60, 70, "#4fd8ff"], [170, 96, "#ffd84f"]] as const) {
      ctx.fillStyle = color;
      for (const [dx, dy] of [[0, 0], [1, 0], [2, 0], [1, 1]]) ctx.fillRect(px + dx! * cell, py + dy! * cell, cell - 2, cell - 2);
    }
    ctx.textAlign = "center";
    ctx.shadowColor = accent;
    ctx.shadowBlur = 14;
    ctx.fillStyle = "#ffffff";
    ctx.font = "800 44px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText("TETRIS", 128, 52);
    ctx.shadowBlur = 6;
    ctx.fillStyle = accent;
    ctx.font = "700 18px ui-monospace, monospace";
    ctx.fillText("INSERT COIN", 128, 128);
    // Faint scanlines, like a CRT.
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    for (let y = 0; y < 200; y += 3) ctx.fillRect(0, y, 256, 1);
  });
}

function marquee(colors: (typeof CABINET_COLORS)[number]) {
  return canvasMaterial(256, 80, (ctx) => {
    const sky = ctx.createLinearGradient(0, 0, 256, 80);
    sky.addColorStop(0, colors.deep);
    sky.addColorStop(0.5, colors.body);
    sky.addColorStop(1, colors.deep);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 256, 80);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = colors.accent;
    ctx.shadowBlur = 16;
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 46px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText("TETRIS", 128, 42);
  });
}

export function makeArcadeCabinet(variant: number) {
  const colors = CABINET_COLORS[variant % CABINET_COLORS.length]!;
  const group = new THREE.Group();
  const black = mat("#15171f", { roughness: 0.45 });
  const chrome = mat("#c9ced8", { metalness: 0.8, roughness: 0.25 });

  // The black core between two painted side panels, edged in chrome T-moulding.
  group.add(mesh(profileGeometry(0.66), black));
  const art = sideArt(colors);
  for (const side of [-1, 1]) group.add(mesh(profileGeometry(0.04), art, side * 0.35));
  const trim: Part[] = [];
  for (const side of [-1, 1]) trim.push([0.012, 1.86, 0.012, side * 0.372, 0.93, -0.38]);
  group.add(merged(boxGeometries(trim), chrome));

  // Coin door on the kick panel: a steel plate with two lit coin slots.
  group.add(mesh(new THREE.BoxGeometry(0.3, 0.3, 0.02), mat("#8a919e", { metalness: 0.7, roughness: 0.35 }), 0, 0.48, 0.31));
  const slot = new THREE.MeshBasicMaterial({ color: "#ff9a3c", toneMapped: false });
  for (const x of [-0.06, 0.06]) group.add(mesh(new THREE.BoxGeometry(0.05, 0.07, 0.01), slot, x, 0.53, 0.322));

  // Control panel: lies on the slope from the front lip back to the screen.
  const panel = new THREE.Group();
  const [lz, ly] = [0.42, 0.92];
  const [bz, by] = [0.22, 1.03];
  panel.position.set(0, (ly + by) / 2 + 0.005, (lz + bz) / 2);
  panel.rotation.x = -Math.atan2(by - ly, lz - bz);
  panel.add(mesh(new THREE.BoxGeometry(0.66, 0.01, Math.hypot(lz - bz, by - ly)), mat(colors.deep, { roughness: 0.4 })));
  panel.add(mesh(cylinder(0.035, 0.012, -0.18, 0.01, 0), black));
  panel.add(mesh(cylinder(0.008, 0.09, -0.18, 0.055, 0), chrome));
  panel.add(mesh(new THREE.SphereGeometry(0.03, 16, 12).translate(-0.18, 0.11, 0), mat("#e8332f", { roughness: 0.25 })));
  ["#e8332f", "#ffd23f", "#3fa7ff", "#5ee36a"].forEach((color, i) => {
    panel.add(mesh(cylinder(0.022, 0.02, -0.02 + (i % 2) * 0.07 + Math.floor(i / 2) * 0.12, 0.012, -0.02 + (i % 2) * 0.03), mat(color, { roughness: 0.3 })));
  });
  group.add(panel);

  // Screen, leaning back between the panel and the hood, in a black bezel.
  const [sz, sy] = [0.22, 1.03];
  const [tz, ty] = [0.1, 1.55];
  const screen = new THREE.Group();
  screen.position.set(0, (sy + ty) / 2, (sz + tz) / 2 + 0.006);
  screen.rotation.x = -Math.atan2(sz - tz, ty - sy);
  screen.add(mesh(new THREE.PlaneGeometry(0.54, 0.44), attractScreen(colors.accent)));
  group.add(screen);

  // The lit marquee under the hood.
  const sign = mesh(new THREE.PlaneGeometry(0.64, 0.22), marquee(colors), 0, 1.73, 0.262);
  sign.castShadow = false;
  group.add(sign);

  // Levelling feet.
  const feet = [-0.3, 0.3].flatMap((x) => [-0.3, 0.22].map((z) => cylinder(0.025, 0.03, x, 0.015, z)));
  group.add(merged(feet, black));
  return group;
}

// ---- Ping-pong table ----

// A full-size table (2.74 x 1.525, 0.76 high) on two folding frames with castors, a net on post
// clamps, and two bats and a ball left on top. Blue, or green (variant 1).
export function makePingPongTable(green: boolean) {
  const group = new THREE.Group();
  const top = 0.76;
  const surface = mat(green ? "#2f7d4f" : "#1d4f91", { roughness: 0.45 });
  const white = mat("#f4f6f8", { roughness: 0.4 });
  const frame = mat("#2b2f38", { metalness: 0.6, roughness: 0.4 });
  const [W, D] = [2.74, 1.525];

  group.add(mesh(new THREE.BoxGeometry(W, 0.03, D), surface, 0, top - 0.015, 0));
  // An apron under the edge, so the top reads as a thick board.
  group.add(merged(boxGeometries([[W - 0.06, 0.05, 0.03, 0, top - 0.055, D / 2 - 0.04], [W - 0.06, 0.05, 0.03, 0, top - 0.055, -D / 2 + 0.04], [0.03, 0.05, D - 0.06, W / 2 - 0.04, top - 0.055, 0], [0.03, 0.05, D - 0.06, -W / 2 + 0.04, top - 0.055, 0]]), frame));
  // White edge lines and the centre line.
  const lines: Part[] = [
    [W, 0.002, 0.02, 0, top + 0.001, D / 2 - 0.01], [W, 0.002, 0.02, 0, top + 0.001, -D / 2 + 0.01],
    [0.02, 0.002, D, W / 2 - 0.01, top + 0.001, 0], [0.02, 0.002, D, -W / 2 + 0.01, top + 0.001, 0],
    [W, 0.002, 0.006, 0, top + 0.001, 0],
  ];
  group.add(merged(boxGeometries(lines), white));

  // The net: posts clamped to the sides, a see-through mesh and a white tape along the top.
  const netWidth = D + 0.3;
  const net = canvasMaterial(64, 16, (ctx) => {
    ctx.clearRect(0, 0, 64, 16);
    ctx.strokeStyle = "rgba(20,24,32,0.9)";
    for (let i = 0; i <= 64; i += 4) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 16); ctx.stroke(); }
    for (let i = 0; i <= 16; i += 4) { ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(64, i); ctx.stroke(); }
  }, false);
  net.transparent = true;
  net.alphaTest = 0.3;
  net.side = THREE.DoubleSide;
  net.map!.wrapS = net.map!.wrapT = THREE.RepeatWrapping;
  net.map!.repeat.set(netWidth * 12, 1.8);
  const netMesh = mesh(new THREE.PlaneGeometry(netWidth, 0.15), net, 0, top + 0.075, 0);
  netMesh.rotation.y = Math.PI / 2;
  group.add(netMesh);
  group.add(mesh(new THREE.BoxGeometry(0.012, 0.015, netWidth), white, 0, top + 0.152, 0));
  const posts = [-1, 1].flatMap((side) => [
    cylinder(0.012, 0.16, 0, top + 0.08, side * (netWidth / 2)),
    new THREE.BoxGeometry(0.05, 0.05, 0.07).translate(0, top - 0.02, side * (D / 2 + 0.02)),
  ]);
  group.add(merged(posts, frame));

  // Two folding frames, each a rectangle of tubes with a diagonal brace up to the middle, on castors.
  const tubes: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    const x = side * 0.95;
    for (const z of [-0.6, 0.6]) {
      tubes.push(cylinder(0.02, top - 0.12, x, (top - 0.12) / 2 + 0.07, z));
      // The brace from low on the leg up under the middle of the table.
      const brace = new THREE.CylinderGeometry(0.014, 0.014, 0.95, 10);
      brace.rotateZ(side * 0.95);
      tubes.push(brace.translate(side * 0.6, 0.38, z));
    }
    tubes.push(cylinder(0.018, 1.2, x, 0.16, 0, "z"), cylinder(0.018, 1.2, x, top - 0.09, 0, "z"));
  }
  tubes.push(cylinder(0.02, 1.3, 0, top - 0.09, 0, "x"));
  group.add(merged(tubes, frame));
  const castors = [-0.95, 0.95].flatMap((x) => [-0.6, 0.6].map((z) => cylinder(0.035, 0.03, x, 0.035, z, "z")));
  group.add(merged(castors, mat("#111318", { roughness: 0.8 })));

  // Two bats and a ball left on the table.
  [[-0.85, 0.25, 0.4], [0.75, -0.3, -2.4]].forEach(([x, z, turn]) => {
    const bat = new THREE.Group();
    bat.add(mesh(cylinder(0.075, 0.006, 0, 0.003, 0, "y", 24), mat("#d4252c", { roughness: 0.7 })));
    bat.add(mesh(cylinder(0.075, 0.006, 0, 0.009, 0, "y", 24), mat("#1a1a1e", { roughness: 0.7 })));
    bat.add(mesh(new THREE.BoxGeometry(0.1, 0.022, 0.03).translate(0.11, 0.011, 0), mat("#c79a62", { roughness: 0.5 })));
    bat.position.set(x!, top, z!);
    bat.rotation.y = turn!;
    group.add(bat);
  });
  group.add(mesh(new THREE.SphereGeometry(0.02, 16, 12), mat("#ff8a1e", { roughness: 0.3 }), -0.4, top + 0.02, -0.35));
  return group;
}

// ---- Foosball table ----

// A walnut cabinet with raised sides and a goal in each end, a pitch with its markings, eight
// chrome rods through the sides with black handles (each team's on its own side), red and blue
// players on the rods, bead score counters, and a ball. 1.8 x 0.85.
export function makeFoosballTable() {
  const group = new THREE.Group();
  const walnut = mat("#5b3a22", { roughness: 0.45 });
  const black = mat("#15171f", { roughness: 0.5 });
  const chrome = mat("#d3d8e0", { metalness: 0.85, roughness: 0.2 });
  const [L, Wd] = [1.66, 0.7];
  const field = 0.8;
  const wallTop = 0.98;

  // The pitch: grass stripes, white lines, centre circle and goal boxes.
  const pitch = canvasMaterial(256, 108, (ctx) => {
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i % 2 ? "#2f8a45" : "#35994d";
      ctx.fillRect(i * 32, 0, 32, 108);
    }
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 2;
    ctx.strokeRect(3, 3, 250, 102);
    ctx.beginPath(); ctx.moveTo(128, 3); ctx.lineTo(128, 105); ctx.stroke();
    ctx.beginPath(); ctx.arc(128, 54, 16, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeRect(3, 34, 18, 40);
    ctx.strokeRect(235, 34, 18, 40);
  }, false);
  const pitchMesh = mesh(new THREE.PlaneGeometry(L, Wd), pitch, 0, field + 0.001, 0);
  pitchMesh.rotation.x = -Math.PI / 2;
  group.add(pitchMesh);

  // Cabinet: the box under the pitch, two long sides, and the ends with a goal mouth in each.
  const goal = 0.24;
  const cabinet: Part[] = [
    [L + 0.12, 0.14, Wd + 0.12, 0, field - 0.07, 0],
    [L + 0.12, wallTop - field + 0.02, 0.06, 0, (wallTop + field) / 2 - 0.01, Wd / 2 + 0.03],
    [L + 0.12, wallTop - field + 0.02, 0.06, 0, (wallTop + field) / 2 - 0.01, -Wd / 2 - 0.03],
  ];
  for (const side of [-1, 1]) {
    const x = side * (L / 2 + 0.03);
    const post = (Wd - goal) / 2;
    cabinet.push([0.06, wallTop - field, post, x, (wallTop + field) / 2, goal / 2 + post / 2]);
    cabinet.push([0.06, wallTop - field, post, x, (wallTop + field) / 2, -goal / 2 - post / 2]);
    cabinet.push([0.06, wallTop - field - 0.09, goal, x, wallTop - (wallTop - field - 0.09) / 2, 0]);
  }
  group.add(merged(boxGeometries(cabinet), walnut));
  // Dark goal mouths and black corner caps.
  const dark: Part[] = [[0.02, 0.09, goal, -L / 2 - 0.07, field + 0.045, 0], [0.02, 0.09, goal, L / 2 + 0.07, field + 0.045, 0]];
  for (const x of [-1, 1]) for (const z of [-1, 1]) dark.push([0.09, 0.03, 0.09, x * (L / 2 + 0.04), wallTop + 0.01, z * (Wd / 2 + 0.04)]);
  group.add(merged(boxGeometries(dark), black));

  // Legs with feet, and a stretcher between each pair.
  const legs: Part[] = [];
  for (const x of [-1, 1]) {
    for (const z of [-1, 1]) legs.push([0.1, field - 0.14, 0.1, x * (L / 2 - 0.02), (field - 0.14) / 2, z * (Wd / 2 - 0.02)]);
    legs.push([0.05, 0.05, Wd - 0.1, x * (L / 2 - 0.02), 0.18, 0]);
  }
  group.add(merged(boxGeometries(legs), walnut));

  // Rods: goalie, defence, attack, midfield, midfield, attack, defence, goalie; each team's
  // handles on its own side (red at the front, blue at the back).
  const counts = [1, 2, 3, 5, 5, 3, 2, 1];
  const red = [true, true, false, true, false, true, false, false];
  const rodY = 0.9;
  const rods: THREE.BufferGeometry[] = [];
  const handles: THREE.BufferGeometry[] = [];
  const players: Record<"red" | "blue", THREE.BufferGeometry[]> = { red: [], blue: [] };
  counts.forEach((count, i) => {
    const x = -0.7 + i * 0.2;
    rods.push(cylinder(0.011, Wd + 0.5, x, rodY, 0, "z", 10));
    const handleZ = (red[i] ? 1 : -1) * (Wd / 2 + 0.3);
    handles.push(cylinder(0.024, 0.13, x, rodY, handleZ, "z", 12));
    const spacing = Wd / (count + 1);
    for (let k = 1; k <= count; k++) {
      const z = -Wd / 2 + k * spacing;
      const team = players[red[i] ? "red" : "blue"];
      team.push(new THREE.BoxGeometry(0.03, 0.085, 0.045).translate(x, rodY - 0.035, z));
      team.push(new THREE.BoxGeometry(0.026, 0.03, 0.02).translate(x, field + 0.02, z));
      team.push(new THREE.SphereGeometry(0.02, 10, 8).translate(x, rodY + 0.03, z));
    }
  });
  group.add(merged(rods, chrome), merged(handles, black));
  group.add(merged(players.red, mat("#d23a3a", { roughness: 0.35 })), merged(players.blue, mat("#2f62d8", { roughness: 0.35 })));

  // A bead score counter on a wire above each goal, a few beads slid across.
  const beads: THREE.BufferGeometry[] = [];
  const wires: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    const x = side * (L / 2 + 0.03);
    wires.push(cylinder(0.003, 0.4, x, wallTop + 0.05, 0, "z", 6));
    // Goals scored slide to the front end of the wire; the rest wait at the back.
    const scored = side > 0 ? 3 : 5;
    for (let k = 0; k < 10; k++) {
      const z = k < scored ? 0.18 - k * 0.03 : -0.18 + (9 - k) * 0.03;
      beads.push(new THREE.SphereGeometry(0.014, 10, 8).translate(x, wallTop + 0.05, z));
    }
  }
  group.add(merged(wires, chrome), merged(beads, mat("#f1e7c9", { roughness: 0.4 })));
  group.add(mesh(new THREE.SphereGeometry(0.017, 14, 10), mat("#ffffff", { roughness: 0.3 }), 0.12, field + 0.017, 0.08));
  return group;
}

// ---- The room ----

// A glowing neon word on a dark backing board, with a soft halo on the wall behind it.
export function makeNeonSign(text: string, color: string, width: number) {
  const group = new THREE.Group();
  const height = width * 0.42;
  group.add(mesh(new THREE.BoxGeometry(width, height, 0.03), mat("#10121c", { roughness: 0.4 }), 0, 0, 0.015));
  const halo = new THREE.Mesh(
    new THREE.PlaneGeometry(width * 1.6, height * 2.2),
    canvasMaterial(128, 64, (ctx) => {
      const glow = ctx.createRadialGradient(64, 32, 4, 64, 32, 64);
      glow.addColorStop(0, `${color}66`);
      glow.addColorStop(1, `${color}00`);
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, 128, 64);
    }),
  );
  const haloMaterial = halo.material as THREE.MeshBasicMaterial;
  haloMaterial.transparent = true;
  haloMaterial.depthWrite = false;
  haloMaterial.blending = THREE.AdditiveBlending;
  halo.position.z = 0.002;
  group.add(halo);
  const word = new THREE.Mesh(
    new THREE.PlaneGeometry(width * 0.92, height * 0.8),
    canvasMaterial(512, 180, (ctx) => {
      ctx.clearRect(0, 0, 512, 180);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "900 120px ui-sans-serif, system-ui, sans-serif";
      // Tube glow: a wide blur in the colour, then a white-hot core.
      ctx.shadowColor = color;
      ctx.shadowBlur = 30;
      ctx.lineWidth = 10;
      ctx.strokeStyle = color;
      ctx.strokeText(text, 256, 94);
      ctx.shadowBlur = 8;
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#ffffff";
      ctx.strokeText(text, 256, 94);
    }),
  );
  (word.material as THREE.MeshBasicMaterial).transparent = true;
  word.position.z = 0.034;
  group.add(word);
  return group;
}

// The Game Room's own floor: dark arcade carpet with neon confetti, in carpet tiles.
export function drawArcadeCarpet(ctx: CanvasRenderingContext2D, size: number, rand: () => number) {
  ctx.fillStyle = "#171d3f";
  ctx.fillRect(0, 0, size, size);
  const confetti = ["#ff4fd8", "#4fd8ff", "#ffd84f", "#9b6bff", "#5ee36a"];
  for (let i = 0; i < 70; i++) {
    ctx.fillStyle = confetti[i % confetti.length]!;
    const x = rand() * size;
    const y = rand() * size;
    const kind = i % 3;
    if (kind === 0) ctx.fillRect(x, y, 6, 2);
    else if (kind === 1) { ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fill(); }
    else { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 5, y + 2); ctx.lineTo(x + 1, y + 5); ctx.fill(); }
  }
  // Carpet-tile seams.
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(0, size - 1, size, 1);
  ctx.fillRect(size - 1, 0, 1, size);
}
