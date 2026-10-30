import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// Potted plants for inside the office, built in code like the trees outside (trees.ts). A plant is
// a round pot with a rolled rim and soil, and curved leaves of varied length, lean and green. Each
// is two meshes (pot and leaves), coloured per vertex. A seed shapes it, so a spot always grows the
// same plant but no two match.

// snake: upright sword leaves with yellow edges. leafy: arching oval leaves on stalks, like a peace
// lily. fig: a slim trunk under a crown of broad leaves, like a fiddle-leaf fig.
export type PlantStyle = "snake" | "leafy" | "fig";
type Rand = () => number;

const POT_COLORS = ["#b5603d", "#ece8e0", "#3b3d43", "#a3b29b", "#d9c7a8"] as const;
const SOIL = new THREE.Color("#3a2a1e");
const TRUNK = new THREE.Color("#6b5240");
// Greens for each style, from the base of a leaf to its tip, and the snake plant's leaf edge.
const GREENS: Record<PlantStyle, readonly [base: string, tip: string]> = {
  snake: ["#1f4a2c", "#3f7a45"],
  leafy: ["#23502a", "#4f8a3a"],
  fig: ["#2a5523", "#5b9440"],
};
const SNAKE_EDGE = new THREE.Color("#c4c45e");

// mulberry32: a small seeded random number generator.
function seeded(seed: number): Rand {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let potMaterial: THREE.MeshStandardMaterial | null = null;
let leafMaterial: THREE.MeshStandardMaterial | null = null;

// A plant `height` tall that fits in `width`, standing on y = 0 and centred.
export function makePlant(style: PlantStyle, height: number, width: number, seed: number) {
  const rand = seeded(seed);
  const radius = Math.min(width * 0.3, style === "fig" ? 0.25 : 0.2);
  const potHeight = Math.min(height * 0.27, radius * 1.8);
  const soil = potHeight * 0.92;
  const pot = [makePot(rand, radius, potHeight)];
  const leaves: THREE.BufferGeometry[] = [];
  const reach = width / 2;
  const greens = GREENS[style].map((color) => new THREE.Color(color)) as [THREE.Color, THREE.Color];

  if (style === "snake") {
    const count = 15 + Math.floor(rand() * 6);
    for (let i = 0; i < count; i++) {
      const angle = rand() * Math.PI * 2;
      const lean = 0.05 + rand() * 0.3;
      const from = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle)).multiplyScalar(rand() * radius * 0.55).setY(soil);
      const heading = new THREE.Vector3(Math.cos(angle) * Math.sin(lean), Math.cos(lean), Math.sin(angle) * Math.sin(lean));
      const length = (height - soil) * (0.5 + rand() * 0.48);
      leaves.push(blade(rand, from, heading, length, length * (0.12 + rand() * 0.05), {
        droop: 0.04, twist: (rand() - 0.5) * 1.6, fold: 0.25, edge: SNAKE_EDGE, greens,
        profile: (t) => Math.pow(1 - t, 0.75) * (0.5 + 0.5 * Math.min(1, t * 4)),
      }));
    }
  } else if (style === "leafy") {
    const count = 20 + Math.floor(rand() * 8);
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + rand() * 0.6;
      // Inner leaves stand up; outer ones lean out and arch over the rim.
      const lean = 0.2 + Math.pow(rand(), 0.7) * 0.9;
      const from = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle)).multiplyScalar(rand() * radius * 0.4).setY(soil);
      const heading = new THREE.Vector3(Math.cos(angle) * Math.sin(lean), Math.cos(lean), Math.sin(angle) * Math.sin(lean));
      const length = Math.min(height - soil, reach * 1.25) * (0.6 + rand() * 0.45);
      leaves.push(blade(rand, from, heading, length, length * (0.32 + rand() * 0.1), {
        droop: 0.25 + lean * 0.35, twist: (rand() - 0.5) * 0.6, fold: 0.18, greens,
        // A thin stalk, then an oval leaf with a pointed tip.
        profile: (t) => (t < 0.38 ? 0.07 : Math.pow(Math.sin((Math.PI * (t - 0.38)) / 0.62), 0.7)),
      }));
    }
  } else {
    // A slim trunk leaning a little, and a crown of broad leaves round its upper half.
    const lean = new THREE.Vector3((rand() - 0.5) * 0.12, 1, (rand() - 0.5) * 0.12).normalize();
    const top = height * 0.86;
    const trunkGeometry = new THREE.CylinderGeometry(0.018, 0.032, top - soil, 7, 1).translate(0, (top - soil) / 2, 0);
    trunkGeometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), lean)).translate(0, soil, 0);
    pot.push(paint(trunkGeometry, () => TRUNK).toNonIndexed());
    const count = 75 + Math.floor(rand() * 20);
    for (let i = 0; i < count; i++) {
      const rise = 0.5 + Math.pow(rand(), 0.7) * 0.46;
      const angle = rand() * Math.PI * 2;
      const out = Math.sqrt(rand()) * reach * 0.62 * Math.sin(Math.PI * Math.min(1, (rise - 0.4) / 0.6));
      const stem = lean.clone().multiplyScalar((height * rise - soil) / lean.y).setY(height * rise - 0.06);
      const from = stem.add(new THREE.Vector3(Math.cos(angle) * out, 0, Math.sin(angle) * out));
      const tilt = 0.6 + rand() * 0.7;
      const heading = new THREE.Vector3(Math.cos(angle) * Math.sin(tilt), Math.cos(tilt), Math.sin(angle) * Math.sin(tilt));
      const length = 0.19 + rand() * 0.12;
      leaves.push(blade(rand, from, heading, length, length * (0.55 + rand() * 0.15), {
        droop: 0.3, twist: (rand() - 0.5) * 0.8, fold: 0.12, greens,
        profile: (t) => (t < 0.15 ? 0.08 : Math.pow(Math.sin((Math.PI * (t - 0.15)) / 0.85), 0.55) * (0.75 + 0.25 * t)),
      }));
    }
  }

  potMaterial ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 });
  leafMaterial ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, side: THREE.DoubleSide });
  const group = new THREE.Group();
  group.add(mesh(pot, potMaterial), mesh(leaves, leafMaterial));
  return group;
}

function mesh(geometries: THREE.BufferGeometry[], material: THREE.Material) {
  const merged = new THREE.Mesh(mergeGeometries(geometries), material);
  for (const geometry of geometries) geometry.dispose();
  merged.castShadow = true;
  merged.receiveShadow = true;
  return merged;
}

// Gives every vertex of `geometry` the colour `colorAt` picks for its position.
function paint(geometry: THREE.BufferGeometry, colorAt: (y: number) => THREE.Color) {
  const position = geometry.getAttribute("position");
  const colors = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) colorAt(position.getY(i)).toArray(colors, i * 3);
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.deleteAttribute("uv");
  return geometry;
}

// A round pot that tapers to its foot, with a rolled rim and soil a little below it. The pot is a
// little darker at the bottom, where less light reaches.
function makePot(rand: Rand, radius: number, height: number) {
  const r = radius;
  const outline = [
    [0, 0], [r * 0.7, 0], [r * 0.74, height * 0.03], [r * 0.9, height * 0.8], [r * 0.95, height * 0.82],
    [r * 1.0, height * 0.86], [r * 1.0, height * 0.97], [r * 0.96, height], [r * 0.9, height * 0.99], [r * 0.88, height * 0.92],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const color = new THREE.Color(POT_COLORS[Math.floor(rand() * POT_COLORS.length)]!);
  const shade = new THREE.Color();
  const pot = paint(new THREE.LatheGeometry(outline, 28), (y) => shade.copy(color).multiplyScalar(0.72 + 0.28 * Math.min(1, y / height)));
  const soilColor = new THREE.Color();
  const soil = paint(new THREE.CircleGeometry(r * 0.89, 20).rotateX(-Math.PI / 2).translate(0, height * 0.92, 0),
    () => soilColor.copy(SOIL).multiplyScalar(0.8 + rand() * 0.4));
  return mergeGeometries([pot.toNonIndexed(), soil.toNonIndexed()]);
}

type BladeLook = {
  // How far the tip falls (as a share of the length), how much the leaf turns about its midrib
  // from base to tip, and how deep it is folded along the midrib (as a share of its half width).
  droop: number;
  twist: number;
  fold: number;
  // Its width along its length, 0 to 1, from base (t = 0) to tip (t = 1).
  profile: (t: number) => number;
  greens: readonly [THREE.Color, THREE.Color];
  // A colour for its edges, like a snake plant's yellow margin.
  edge?: THREE.Color;
};

// One leaf, `length` long and `width` across at its widest: a strip of five vertices across and
// eight along a curve that starts at `from` going `heading` and bends down toward its tip.
function blade(rand: Rand, from: THREE.Vector3, heading: THREE.Vector3, length: number, width: number, look: BladeLook) {
  const ALONG = 8;
  const ACROSS = [-1, -0.7, 0, 0.7, 1];
  const up = new THREE.Vector3(0, 1, 0);
  const side = new THREE.Vector3().crossVectors(heading, up);
  if (side.lengthSq() < 1e-6) side.set(Math.cos(rand() * 6.3), 0, Math.sin(rand() * 6.3));
  side.normalize();
  // Each leaf is a slightly different green, lighter or darker and a touch yellower or bluer.
  const jitter = (rand() - 0.5) * 0.06;
  const light = 0.85 + rand() * 0.3;
  const [base, tip] = look.greens.map((green) => green.clone().offsetHSL(jitter, 0, 0).multiplyScalar(light)) as [THREE.Color, THREE.Color];
  const positions: number[] = [];
  const colors: number[] = [];
  const point = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const across = new THREE.Vector3();
  const face = new THREE.Vector3();
  const color = new THREE.Color();
  for (let i = 0; i <= ALONG; i++) {
    const t = i / ALONG;
    point.copy(from).addScaledVector(heading, length * t);
    point.y -= look.droop * length * t * t;
    tangent.copy(heading).multiplyScalar(length).add(new THREE.Vector3(0, -2 * look.droop * length * t, 0)).normalize();
    across.copy(side).applyAxisAngle(tangent, look.twist * t);
    face.crossVectors(across, tangent).normalize();
    const half = (width / 2) * look.profile(t);
    for (const u of ACROSS) {
      positions.push(
        point.x + across.x * half * u + face.x * look.fold * half * Math.abs(u),
        point.y + across.y * half * u + face.y * look.fold * half * Math.abs(u),
        point.z + across.z * half * u + face.z * look.fold * half * Math.abs(u),
      );
      color.lerpColors(base, tip, Math.pow(t, 0.8));
      // Faint bands across a snake plant's leaf, and its yellow edge.
      if (look.edge) {
        color.multiplyScalar(0.92 + 0.1 * Math.sin(t * 38 + u));
        if (Math.abs(u) === 1) color.lerp(look.edge, 0.75);
      }
      colors.push(color.r, color.g, color.b);
    }
  }
  const index: number[] = [];
  const row = ACROSS.length;
  for (let i = 0; i < ALONG; i++) {
    for (let j = 0; j < row - 1; j++) {
      const a = i * row + j;
      index.push(a, a + row, a + 1, a + 1, a + row, a + row + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry.toNonIndexed();
}
