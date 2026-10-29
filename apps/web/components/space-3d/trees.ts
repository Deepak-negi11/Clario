import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";

// Trees for the grounds round the office, built in code so they cost no download. A tree is a
// trunk that tapers and splits into branches, under a canopy of overlapping leafy clumps with
// sprigs of leaves over them. A seed picks the species and shapes the tree, so a spot always
// grows the same tree but no two match.

export type TreeSpot = { x: number; z: number; seed: number };
type Species = "broadleaf" | "conifer" | "birch";
type Rand = () => number;
type Palette = readonly [shade: string, leaf: string, sunlit: string];
type Tree = { bark: THREE.BufferGeometry[]; leaves: THREE.BufferGeometry; sprigs: THREE.BufferGeometry };
// Where a sprig goes: a point on the leaves, and the way out of them there.
type Anchor = { at: THREE.Vector3; out: THREE.Vector3 };

// A few greens per species, from leaves in shade to leaves in the sun.
const LEAF_PALETTES: Record<Species, readonly Palette[]> = {
  broadleaf: [["#1f3a1c", "#3d6a2b", "#86ad4c"], ["#25401f", "#4a7433", "#97b858"], ["#283f1f", "#4f6f2e", "#93ab4f"]],
  conifer: [["#22443a", "#376b52", "#7aab78"], ["#26472f", "#40704a", "#88b36e"]],
  birch: [["#3a5720", "#6a9336", "#b4d066"], ["#3f5e29", "#789f42", "#c4d97c"]],
};
const BARK_COLORS: Record<Species, string> = { broadleaf: "#5a4636", conifer: "#5d3c2a", birch: "#e8e4da" };
const BIRCH_MARK = "#36322d";

// How far leaves reach from the trunk. Trees stand on the middle of a 2 x 2 spot, and the ones at
// Clario HQ's sides are 1.4 from its walls, so a wider tree is scaled down to fit.
const REACH = 1.25;

// mulberry32: a small seeded random number generator.
function seeded(seed: number): Rand {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const between = (rand: Rand, low: number, high: number) => low + rand() * (high - low);
const taper = (count: number, from: number, to: number) => Array.from({ length: count }, (_, i) => from + ((to - from) * i) / (count - 1));
const vec = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

// Trees standing at `spots`, as three meshes for the lot (bark, leaf clumps and sprigs): every tree
// differs, but a whole grove costs three draw calls, or six with the sun's shadows.
export function grove(spots: readonly TreeSpot[]) {
  const bark: THREE.BufferGeometry[] = [];
  const leaves: THREE.BufferGeometry[] = [];
  const sprigs: THREE.BufferGeometry[] = [];
  for (const { x, z, seed } of spots) {
    const tree = growTree(seed);
    for (const geometry of parts(tree)) geometry.translate(x, 0, z);
    bark.push(...tree.bark);
    leaves.push(tree.leaves);
    sprigs.push(tree.sprigs);
  }
  const group = new THREE.Group();
  group.add(
    merge(bark, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 })),
    merge(leaves, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 })),
    // Sprigs are cut out by the texture's alpha, and so are their shadows.
    merge(sprigs, new THREE.MeshStandardMaterial({ vertexColors: true, map: foliageTexture(), alphaTest: 0.5, roughness: 0.8 })),
  );
  return group;
}

const parts = (tree: Tree) => [...tree.bark, tree.leaves, tree.sprigs];

function merge(geometries: THREE.BufferGeometry[], material: THREE.Material) {
  const mesh = new THREE.Mesh(mergeGeometries(geometries), material);
  for (const geometry of geometries) geometry.dispose();
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function growTree(seed: number): Tree {
  const rand = seeded(seed);
  const pick = rand();
  const species: Species = pick < 0.45 ? "broadleaf" : pick < 0.72 ? "birch" : "conifer";
  const tree = species === "broadleaf" ? broadleaf(rand) : species === "birch" ? birch(rand) : conifer(rand);
  const palette = LEAF_PALETTES[species][Math.floor(rand() * LEAF_PALETTES[species].length)]!;
  // Each tree's greens drift a little from its species' own.
  const shift = [between(rand, -0.015, 0.015), between(rand, -0.06, 0.04), between(rand, -0.03, 0.02)] as const;
  const colors = palette.map((hex) => new THREE.Color(hex).offsetHSL(...shift)) as [THREE.Color, THREE.Color, THREE.Color];
  tree.leaves.computeBoundingBox();
  const crown = tree.leaves.boundingBox!.clone();
  shadeLeaves(rand, tree.leaves, crown, colors, species === "conifer" ? 0.3 : 0.6);
  // Sprigs face straight out of the crown, so they shade with it whichever way they're turned.
  shadeLeaves(rand, tree.sprigs, crown, colors, 1);
  // Turned at random, and scaled down if its leaves reach too far (sprigs, being sparse and
  // see-through, may poke a little past).
  const position = tree.leaves.getAttribute("position");
  let reach = 0;
  for (let i = 0; i < position.count; i++) reach = Math.max(reach, Math.hypot(position.getX(i), position.getZ(i)));
  const scale = Math.min(1, REACH / reach);
  const turn = rand() * Math.PI * 2;
  for (const geometry of parts(tree)) geometry.scale(scale, scale, scale).rotateY(turn);
  return tree;
}

// A round, spreading tree like an oak or a maple: the trunk forks under the crown into three or four
// boughs, each with a side shoot, and leaves bunch at their ends and round the top.
function broadleaf(rand: Rand): Tree {
  const height = between(rand, 2.9, 3.4);
  const crown = vec(between(rand, 0.85, 1.0), between(rand, 0.78, 0.92), 0);
  crown.z = crown.x * between(rand, 0.85, 1.05);
  const girth = between(rand, 0.11, 0.14);
  const paint = barkPaint(rand, "broadleaf");
  const fork = height - crown.y * 2 + between(rand, -0.15, 0.05);
  const trunk = [vec(0, -0.05, 0), ...grow(rand, vec(0, 0.14, 0), vec(between(rand, -0.08, 0.08), 1, between(rand, -0.08, 0.08)), fork - 0.14, 4, 0.12)];
  const bark = [limb(trunk, [girth * 1.7, girth * 1.1, girth, girth * 0.94, girth * 0.88, girth * 0.82], 8, paint)];
  const top = trunk.at(-1)!;
  const center = vec(top.x, height - crown.y, top.z);
  const clumps: THREE.BufferGeometry[] = [];
  const boughs = 3 + Math.floor(rand() * 2);
  const turn = rand() * Math.PI * 2;
  for (let i = 0; i < boughs; i++) {
    const angle = turn + (i / boughs) * Math.PI * 2 + (rand() - 0.5) * 0.8;
    const tilt = between(rand, 0.55, 0.9);
    const heading = vec(Math.sin(angle) * Math.sin(tilt), Math.cos(tilt), Math.cos(angle) * Math.sin(tilt));
    const length = between(rand, 0.6, 0.78) * crown.x;
    const points = grow(rand, top, heading, length, 3, 0.25, 0.08);
    bark.push(limb(points, taper(4, girth * 0.72, girth * 0.24), 6, paint));
    clumps.push(clump(rand, points.at(-1)!.clone().add(vec(0, 0.1, 0)), between(rand, 0.44, 0.56)));
    const shoot = grow(rand, points[2]!, heading.clone().add(vec(between(rand, -0.6, 0.6), 0.6, between(rand, -0.6, 0.6))), length * 0.5, 2, 0.3);
    bark.push(limb(shoot, taper(3, girth * 0.32, girth * 0.12), 5, paint));
    clumps.push(clump(rand, shoot.at(-1)!, between(rand, 0.36, 0.48)));
  }
  // Fill out the crown with clumps round its upper half, and one on top.
  const fill = 5 + Math.floor(rand() * 3);
  for (let i = 0; i < fill; i++) {
    const angle = rand() * Math.PI * 2;
    const rise = between(rand, -0.1, 0.8);
    const out = Math.sqrt(1 - rise * rise) * between(rand, 0.45, 0.7);
    clumps.push(clump(rand, center.clone().add(vec(Math.sin(angle) * out * crown.x, rise * crown.y * 0.7, Math.cos(angle) * out * crown.z)), between(rand, 0.4, 0.52)));
  }
  clumps.push(clump(rand, center.clone().add(vec(0, crown.y * 0.45, 0)), between(rand, 0.5, 0.62)));
  return { bark, leaves: mergeGeometries(clumps), sprigs: makeSprigs(rand, onClumps(rand, clumps, 6), 0.42, "leaves") };
}

// A conifer like a spruce or a fir: a straight trunk under tiers of drooping boughs, narrowing to a
// point. The trunk shows below the lowest tier.
function conifer(rand: Rand): Tree {
  const height = between(rand, 3.5, 4.2);
  // The lowest boughs clear a person's waist, as on a spruce in a park.
  const base = between(rand, 0.85, 1.05);
  const spread = between(rand, 0.9, 1.1);
  const girth = between(rand, 0.1, 0.12);
  const paint = barkPaint(rand, "conifer");
  const trunk = [vec(0, -0.05, 0), vec(0, 0.12, 0), vec(0, height * 0.3, 0), vec(0, height * 0.55, 0), vec(0, height * 0.8, 0)];
  const bark = [limb(trunk, [girth * 1.6, girth * 1.05, girth * 0.85, girth * 0.6, girth * 0.3], 7, paint)];
  const tiers = 5 + Math.floor(rand() * 2);
  const step = (height - base) / (tiers + 1);
  const boughs: THREE.BufferGeometry[] = [];
  const ridges: Anchor[] = [];
  for (let i = 0; i < tiers; i++) {
    const bottom = base + i * step;
    const top = i === tiers - 1 ? height : bottom + step * 2.3;
    const radius = spread * Math.pow(1 - i / tiers, 0.85) * between(rand, 0.9, 1.05) + 0.1;
    boughs.push(tier(rand, bottom, radius, top - bottom, 14, ridges));
  }
  return { bark, leaves: mergeGeometries(boughs), sprigs: makeSprigs(rand, ridges, 0.5, "needles") };
}

// A birch: one or two slim, white, dark-flecked stems with thin branches angling up, and a light,
// open crown of small clumps along their upper half.
function birch(rand: Rand): Tree {
  const height = between(rand, 3.2, 3.7);
  const paint = barkPaint(rand, "birch");
  const bark: THREE.BufferGeometry[] = [];
  const clumps: THREE.BufferGeometry[] = [];
  const stems = rand() < 0.45 ? 2 : 1;
  const turn = rand() * Math.PI * 2;
  for (let k = 0; k < stems; k++) {
    const angle = turn + k * Math.PI;
    const lean = stems === 2 ? between(rand, 0.1, 0.18) : between(rand, 0, 0.07);
    const foot = vec(Math.sin(angle) * 0.06 * (stems - 1), 0.12, Math.cos(angle) * 0.06 * (stems - 1));
    const length = height * (k === 0 ? 0.9 : between(rand, 0.72, 0.82));
    const stem = [foot.clone().setY(-0.05), ...grow(rand, foot, vec(Math.sin(angle) * lean, 1, Math.cos(angle) * lean), length, 6, 0.08)];
    bark.push(limb(stem, [0.15, 0.1, 0.088, 0.077, 0.066, 0.055, 0.044, 0.032], 7, paint));
    const twigs = 4 + Math.floor(rand() * 3);
    for (let t = 0; t < twigs; t++) {
      const from = stem[4 + Math.floor(rand() * 3)]!;
      const side = rand() * Math.PI * 2;
      const tilt = between(rand, 0.6, 1.0);
      const twig = grow(rand, from, vec(Math.sin(side) * Math.sin(tilt), Math.cos(tilt), Math.cos(side) * Math.sin(tilt)), between(rand, 0.3, 0.5), 2, 0.3, -0.04);
      bark.push(limb(twig, [0.03, 0.02, 0.011], 4, paint));
      clumps.push(clump(rand, twig.at(-1)!, between(rand, 0.28, 0.38)));
    }
    for (const at of [5, 6, 7]) {
      const offset = vec(between(rand, -0.18, 0.18), between(rand, -0.05, 0.15), between(rand, -0.18, 0.18));
      clumps.push(clump(rand, stem[at]!.clone().add(offset), between(rand, 0.3, 0.4)));
    }
  }
  return { bark, leaves: mergeGeometries(clumps), sprigs: makeSprigs(rand, onClumps(rand, clumps, 5), 0.34, "leaves") };
}

// Points along a bough from `start`, bending a little at random (`wobble`) and toward the light (`rise`).
function grow(rand: Rand, start: THREE.Vector3, heading: THREE.Vector3, length: number, segments: number, wobble: number, rise = 0) {
  const points = [start.clone()];
  const direction = heading.clone().normalize();
  for (let i = 0; i < segments; i++) {
    direction.x += (rand() - 0.5) * wobble;
    direction.z += (rand() - 0.5) * wobble;
    direction.y += rise;
    direction.normalize();
    points.push(points[i]!.clone().addScaledVector(direction, length / segments));
  }
  return points;
}

// Bark colour at a height: flecked, and darker at the foot where soil and damp reach. A birch's is
// white with dark marks, and dark and rough near the ground.
function barkPaint(rand: Rand, species: Species) {
  const base = new THREE.Color(BARK_COLORS[species]);
  const mark = new THREE.Color(BIRCH_MARK);
  return (y: number) => {
    const marked = species === "birch" && (y < 0.25 || rand() < 0.2);
    return (marked ? mark.clone() : base.clone()).multiplyScalar((0.82 + rand() * 0.22) * (0.65 + 0.35 * Math.min(1, Math.max(0, y) / 0.5)));
  };
}

// A bough through `points`, `radii` thick at each, as rings of `sides` vertices. The ends stay open:
// the foot is in the ground and the tip inside the leaves.
function limb(points: THREE.Vector3[], radii: readonly number[], sides: number, paint: (y: number) => THREE.Color) {
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const along = new THREE.Vector3();
  const across = new THREE.Vector3();
  const side = new THREE.Vector3();
  const vertex = new THREE.Vector3();
  points.forEach((point, ring) => {
    along.subVectors(points[Math.min(ring + 1, points.length - 1)]!, points[Math.max(ring - 1, 0)]!).normalize();
    if (ring === 0) across.set(Math.abs(along.x) < 0.9 ? 1 : 0, 0, Math.abs(along.x) < 0.9 ? 0 : 1);
    // Square to the bough, and carried from ring to ring so the rings don't twist.
    across.addScaledVector(along, -across.dot(along)).normalize();
    side.crossVectors(along, across);
    for (let s = 0; s < sides; s++) {
      const angle = (s / sides) * Math.PI * 2;
      vertex.copy(point).addScaledVector(across, Math.cos(angle) * radii[ring]!).addScaledVector(side, Math.sin(angle) * radii[ring]!);
      positions.push(vertex.x, vertex.y, vertex.z);
      const color = paint(vertex.y);
      colors.push(color.r, color.g, color.b);
      if (ring === 0) continue;
      const below = (ring - 1) * sides;
      const next = (s + 1) % sides;
      indices.push(below + s, below + next, ring * sides + next, below + s, ring * sides + next, ring * sides + s);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

// The ball every clump starts from: an icosphere of radius 1 with its seams welded, made once
// (welding is the slow part of building a tree).
let unitBall: { positions: ArrayLike<number>; index: number[] } | null = null;

// A clump of leaves round `center`: a lumpy ball, flatter underneath.
function clump(rand: Rand, center: THREE.Vector3, radius: number) {
  if (!unitBall) {
    const sphere = new THREE.IcosahedronGeometry(1, 1);
    sphere.deleteAttribute("normal");
    sphere.deleteAttribute("uv");
    const welded = mergeVertices(sphere);
    unitBall = { positions: welded.getAttribute("position").array, index: Array.from(welded.index!.array) };
    sphere.dispose();
  }
  const { positions, index } = unitBall;
  const lumpy = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    const size = radius * between(rand, 0.8, 1.16);
    const y = positions[i + 1]!;
    lumpy[i] = center.x + positions[i]! * size;
    lumpy[i + 1] = center.y + y * size * (y < 0 ? 0.6 : 0.85);
    lumpy[i + 2] = center.z + positions[i + 2]! * size;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(lumpy, 3));
  geometry.setIndex(index);
  return geometry;
}

// Points to hang sprigs on: `count` at random on each clump, facing out from its middle.
function onClumps(rand: Rand, clumps: readonly THREE.BufferGeometry[], count: number) {
  const anchors: Anchor[] = [];
  const middle = new THREE.Vector3();
  const point = new THREE.Vector3();
  for (const piece of clumps) {
    const position = piece.getAttribute("position");
    middle.set(0, 0, 0);
    for (let i = 0; i < position.count; i++) middle.add(point.fromBufferAttribute(position, i));
    middle.divideScalar(position.count);
    for (let c = 0; c < count; c++) {
      const at = new THREE.Vector3().fromBufferAttribute(position, Math.floor(rand() * position.count));
      anchors.push({ at, out: at.clone().sub(middle).normalize() });
    }
  }
  return anchors;
}

// Sprigs at `anchors`: small squares `size` across, turned every which way, each showing a spray of
// leaves or of needles (the two halves of foliageTexture). They break up the smooth outline of
// the clumps and tiers the way real foliage does.
function makeSprigs(rand: Rand, anchors: readonly Anchor[], size: number, kind: "leaves" | "needles") {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const across = new THREE.Vector3();
  const down = new THREE.Vector3();
  const offset = kind === "leaves" ? 0 : 0.5;
  for (const { at, out } of anchors) {
    const point = at.clone().addScaledVector(out, size * 0.12);
    across.set(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize();
    down.set(rand() - 0.5, rand() - 0.5, rand() - 0.5);
    down.addScaledVector(across, -down.dot(across)).normalize();
    const first = positions.length / 3;
    for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]] as const) {
      const corner = point.clone().addScaledVector(across, (u - 0.5) * size).addScaledVector(down, (v - 0.5) * size);
      positions.push(corner.x, corner.y, corner.z);
      uvs.push(offset + u * 0.5, v);
    }
    // Both faces, sharing the one normal out of the crown, so the back of a sprig is lit like its front.
    indices.push(first, first + 1, first + 2, first, first + 2, first + 3, first, first + 2, first + 1, first, first + 3, first + 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}

// A spray of leaves (left half) and of needles (right half) on clear squares, in greys for each
// tree's greens to tint.
function foliageTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  const rand = seeded(11);
  const grey = () => {
    const level = Math.round(between(rand, 170, 255));
    return `rgb(${level}, ${level}, ${level})`;
  };
  const line = (x1: number, y1: number, x2: number, y2: number) => {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  };
  for (let i = 0; i < 22; i++) {
    const angle = rand() * Math.PI * 2;
    const reach = Math.sqrt(rand()) * 34;
    const length = between(rand, 22, 34);
    const width = length * between(rand, 0.38, 0.5);
    ctx.save();
    ctx.translate(64 + Math.cos(angle) * reach, 64 + Math.sin(angle) * reach);
    ctx.rotate(rand() * Math.PI * 2);
    ctx.fillStyle = grey();
    ctx.beginPath();
    ctx.moveTo(-length / 2, 0);
    ctx.quadraticCurveTo(0, -width, length / 2, 0);
    ctx.quadraticCurveTo(0, width, -length / 2, 0);
    ctx.fill();
    // The midrib.
    ctx.strokeStyle = "rgba(0, 0, 0, 0.18)";
    ctx.lineWidth = 1.2;
    line(-length / 2, 0, length / 2, 0);
    ctx.restore();
  }
  // Twigs with short needles along both sides, shorter toward the ends.
  for (let i = 0; i < 6; i++) {
    const length = between(rand, 50, 66);
    ctx.save();
    ctx.translate(192 + between(rand, -12, 12), 64 + between(rand, -12, 12));
    ctx.rotate(rand() * Math.PI * 2);
    ctx.strokeStyle = grey();
    ctx.lineWidth = 2;
    line(-length / 2, 0, length / 2, 0);
    ctx.lineWidth = 1.6;
    for (let t = -length / 2; t < length / 2; t += 2.5) {
      const needle = between(rand, 6, 10) * (1 - Math.abs(t) / length);
      line(t, 0, t + needle * 0.6, -needle);
      line(t, 0, t + needle * 0.6, needle);
    }
    ctx.restore();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// One tier of a conifer's boughs: a cone that droops at its rim into ragged tips, and is hollowed
// underneath back to the trunk. The tips' ridges run up its side, like boughs under the needles,
// and each ridge gets a place for a sprig of needles in `ridges`.
function tier(rand: Rand, bottom: number, radius: number, height: number, sides: number, ridges: Anchor[]) {
  const profile = [
    [height, 0], [height * 0.45, radius * 0.55], [0, radius], [height * 0.12, radius * 0.4], [height * 0.22, 0],
  ] as const;
  const turn = rand() * Math.PI * 2;
  const positions: number[] = [];
  const indices: number[] = [];
  profile.forEach(([y, r], ring) => {
    for (let s = 0; s < sides; s++) {
      const ridge = s % 2 === 0;
      const tip = ring === 2 && ridge;
      // On the middle ring and the rim, ridges stand out from the hollows between them.
      const [low, high] = ring === 1 ? (ridge ? [1.0, 1.12] : [0.82, 0.9]) : ring === 2 ? (ridge ? [1.0, 1.12] : [0.72, 0.82]) : [0.92, 1.08];
      const out = r * between(rand, low, high);
      const angle = turn + (s / sides) * Math.PI * 2;
      const at = vec(Math.sin(angle) * out, bottom + y - (tip ? between(rand, 0.04, 0.12) : 0), Math.cos(angle) * out);
      positions.push(at.x, at.y, at.z);
      if ((ring === 1 || ring === 2) && ridge) ridges.push({ at, out: vec(Math.sin(angle), 0.35, Math.cos(angle)).normalize() });
      if (ring === 0) continue;
      const above = (ring - 1) * sides;
      const next = (s + 1) % sides;
      indices.push(ring * sides + s, ring * sides + next, above + next, ring * sides + s, above + next, above + s);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  return geometry;
}

// Colours the leaves in `crown`: dark inside and underneath, sunlit on top and at the edges, with a
// speckle of lighter and darker leaves. Bending each normal toward the outside of the whole crown
// (`soften`) shades the clumps as one soft mass instead of a pile of balls.
function shadeLeaves(rand: Rand, geometry: THREE.BufferGeometry, crown: THREE.Box3, [shade, leaf, sunlit]: readonly [THREE.Color, THREE.Color, THREE.Color], soften: number) {
  geometry.computeVertexNormals();
  const center = crown.getCenter(new THREE.Vector3());
  const size = crown.getSize(new THREE.Vector3()).multiplyScalar(0.5);
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const colors = new Float32Array(position.count * 3);
  const local = new THREE.Vector3();
  const outward = new THREE.Vector3();
  const bent = new THREE.Vector3();
  const color = new THREE.Color();
  for (let i = 0; i < position.count; i++) {
    // Where the vertex is in the crown, with the crown stretched to a ball of radius 1.
    local.fromBufferAttribute(position, i).sub(center).divide(size);
    outward.copy(local).divide(size).normalize();
    bent.fromBufferAttribute(normal, i).lerp(outward, soften).normalize();
    normal.setXYZ(i, bent.x, bent.y, bent.z);
    const tone = THREE.MathUtils.clamp(0.1 + 0.25 * (local.y + 1) + 0.5 * (local.length() - 0.5) + (rand() - 0.5) * 0.3, 0, 1);
    if (tone < 0.5) color.lerpColors(shade, leaf, tone * 2);
    else color.lerpColors(leaf, sunlit, tone * 2 - 1);
    color.toArray(colors, i * 3);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
}
