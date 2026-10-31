import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import type { Fabric } from "@repo/shared";

// True 3D counterparts of the generated seating sheets in tools/furniture-art/source.
// All face +z, with cushion tops around 0.43m to fit the existing seated avatar pose.
const COLORS: Record<Fabric, string> = {
  navy: "#465c92", coral: "#cc7163", teal: "#3f968b", mustard: "#c9a24e", sage: "#8ca37c",
  grey: "#7c8290", blue: "#6c97cd", purple: "#967daf", pink: "#ce86a0", white: "#e3e1dc", leather: "#ad7651",
};
type SeatKind = "sofa" | "loveseat" | "armchair" | "meet-chair" | "cafe-chair" | "task-chair" | "exec-chair" | "theatre-seat";
type Point = readonly [number, number, number];
const prototypes = new Map<string, THREE.Group>();
const materials = new Map<string, THREE.MeshStandardMaterial>();
let weave: THREE.CanvasTexture | undefined;
let grain: THREE.CanvasTexture | undefined;

function fabric(color: string, leather = false) {
  const key = `fabric:${color}:${leather}`;
  if (materials.has(key)) return materials.get(key)!;
  if (!weave) {
    const canvas = document.createElement("canvas"); canvas.width = canvas.height = 64;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#888888"; ctx.fillRect(0, 0, 64, 64);
    for (let y = 0; y < 64; y += 4) for (let x = 0; x < 64; x += 4) {
      ctx.fillStyle = ((x + y) / 4) % 2 ? "#929292" : "#777777";
      ctx.fillRect(x, y, 3, 2);
    }
    weave = new THREE.CanvasTexture(canvas);
    weave.wrapS = weave.wrapT = THREE.RepeatWrapping;
    weave.repeat.setScalar(9); weave.anisotropy = 4;
  }
  const material = new THREE.MeshPhysicalMaterial({ color, roughness: leather ? 0.56 : 0.9,
    bumpMap: weave, bumpScale: leather ? 0.0007 : 0.002, sheen: leather ? 0.12 : 0.55,
    sheenRoughness: 0.8, sheenColor: new THREE.Color(color).lerp(new THREE.Color("#ffffff"), 0.25),
    clearcoat: leather ? 0.08 : 0, clearcoatRoughness: 0.65 });
  materials.set(key, material); return material;
}

function finish(color: string, metalness = 0, roughness = 0.5) {
  const key = `${color}:${metalness}:${roughness}`;
  if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({ color, metalness, roughness }));
  return materials.get(key)!;
}

function wood(dark = false) {
  const key = dark ? "walnut" : "oak";
  if (materials.has(key)) return materials.get(key)!;
  if (!grain) {
    const canvas = document.createElement("canvas"); canvas.width = 128; canvas.height = 64;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#e2c9a7"; ctx.fillRect(0, 0, 128, 64);
    for (let y = 0; y < 64; y += 2) {
      ctx.strokeStyle = `rgba(103,65,32,${0.06 + (y % 7) * 0.009})`; ctx.lineWidth = 0.6; ctx.beginPath();
      for (let x = 0; x <= 128; x += 4) { const yy = y + Math.sin(x / 27 + y) * 1.2; if (!x) ctx.moveTo(x, yy); else ctx.lineTo(x, yy); }
      ctx.stroke();
    }
    grain = new THREE.CanvasTexture(canvas); grain.colorSpace = THREE.SRGBColorSpace;
    grain.wrapS = grain.wrapT = THREE.RepeatWrapping; grain.anisotropy = 4;
  }
  const material = new THREE.MeshPhysicalMaterial({ color: dark ? "#79533a" : "#d6b17d", map: grain,
    roughness: 0.48, clearcoat: 0.16, clearcoatRoughness: 0.65 });
  materials.set(key, material); return material;
}

// Rounded, crowned cushions with smooth shared normals and world-space fabric coordinates.
function cushion(w: number, h: number, d: number, radius: number, crown = 0.008, face: "top" | "front" = "top") {
  radius = Math.min(radius, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001);
  const edge = 2, middle = 3, rows = edge * 2 + middle;
  const raw = new THREE.BoxGeometry(1, 1, 1, rows, rows, rows);
  raw.deleteAttribute("normal"); raw.deleteAttribute("uv");
  const geometry = mergeVertices(raw); raw.dispose();
  const spread = (c: number, half: number) => {
    const row = (c + 0.5) * rows;
    if (row <= edge) return -half + radius * row / edge;
    if (row >= rows - edge) return half - radius * (rows - row) / edge;
    return -half + radius + (half - radius) * 2 * (row - edge) / middle;
  };
  const halves = new THREE.Vector3(w / 2, h / 2, d / 2), core = halves.clone().subScalar(radius);
  const point = new THREE.Vector3(), inner = new THREE.Vector3(), out = new THREE.Vector3(), low = core.clone().negate();
  const positions = geometry.getAttribute("position");
  for (let i = 0; i < positions.count; i++) {
    point.set(spread(positions.getX(i), halves.x), spread(positions.getY(i), halves.y), spread(positions.getZ(i), halves.z));
    inner.copy(point).clamp(low, core); out.subVectors(point, inner);
    if (out.lengthSq()) point.copy(inner).add(out.setLength(radius));
    const [x, y, z] = [point.x / halves.x, point.y / halves.y, point.z / halves.z];
    if (face === "top" && y > 0) point.y += crown * y * (1 - x * x) * (1 - z * z);
    if (face === "front" && z > 0) point.z += crown * z * (1 - x * x) * (1 - y * y);
    positions.setXYZ(i, point.x, point.y, point.z);
  }
  geometry.computeVertexNormals();
  const normals = geometry.getAttribute("normal"), uvs = new Float32Array(positions.count * 2);
  for (let i = 0; i < positions.count; i++) {
    const [nx, ny, nz] = [Math.abs(normals.getX(i)), Math.abs(normals.getY(i)), Math.abs(normals.getZ(i))];
    const [x, y, z] = [positions.getX(i), positions.getY(i), positions.getZ(i)];
    uvs.set(ny >= nx && ny >= nz ? [x, z] : nx >= nz ? [z, y] : [x, y], i * 2);
  }
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2)); return geometry;
}

function bar(a: Point, b: Point, radius: number, taper = radius) {
  const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), delta = end.sub(start);
  const geometry = new THREE.CylinderGeometry(radius, taper, delta.length(), 10);
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.clone().normalize()));
  return geometry.translate(...start.addScaledVector(delta, 0.5).toArray() as [number, number, number]);
}

function roundedProfile(w: number, h: number, r: number) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s;
}

// A thin shell can have broad rounded corners independently of its thickness.
function backPad(w: number, h: number, d: number, radius: number, hole = false) {
  const shape = roundedProfile(w, h, radius);
  if (hole) shape.holes.push(new THREE.Path(roundedProfile(w - 0.055, h - 0.055, Math.max(0.02, radius - 0.025)).getPoints(8)));
  const bevel = Math.min(0.014, d / 4);
  const raw = new THREE.ExtrudeGeometry(shape, { depth: d - bevel * 2, steps: 1, curveSegments: 6, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2 });
  raw.translate(0, 0, -d / 2 + bevel); raw.deleteAttribute("normal"); raw.deleteAttribute("uv");
  const geometry = mergeVertices(raw); raw.dispose(); geometry.computeVertexNormals();
  const position = geometry.getAttribute("position"), uvs = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i++) uvs.set([position.getX(i), position.getY(i)], i * 2);
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2)); return geometry;
}

function meshBack() {
  const key = "task-mesh";
  if (materials.has(key)) return materials.get(key)!;
  const canvas = document.createElement("canvas"); canvas.width = canvas.height = 32;
  const ctx = canvas.getContext("2d")!; ctx.fillStyle = "#000000"; ctx.fillRect(0, 0, 32, 32); ctx.fillStyle = "#ffffff";
  for (let i = 0; i < 32; i += 4) { ctx.fillRect(i, 0, 1, 32); ctx.fillRect(0, i, 32, 1); }
  const texture = new THREE.CanvasTexture(canvas); texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.setScalar(2);
  const material = new THREE.MeshStandardMaterial({ color: "#56616a", alphaMap: texture, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.95 });
  materials.set(key, material); return material;
}

class Parts {
  private batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  add(material: THREE.Material, geometry: THREE.BufferGeometry, x = 0, y = 0, z = 0) {
    const list = this.batches.get(material) ?? []; list.push(geometry.translate(x, y, z)); this.batches.set(material, list);
  }
  build() {
    const group = new THREE.Group();
    for (const [material, geometries] of this.batches) {
      // Tubes and cushions have different indexed vertex layouts, but identical attributes.
      const geometry = mergeGeometries(geometries);
      if (!geometry) throw new Error("Could not build seating geometry");
      const mesh = new THREE.Mesh(geometry, material); mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh); for (const source of geometries) source.dispose();
    }
    return group;
  }
}

function lounge(kind: "sofa" | "loveseat" | "armchair", color: string, leather: boolean) {
  const seats = kind === "sofa" ? 3 : kind === "loveseat" ? 2 : 1;
  const width = kind === "sofa" ? 2.9 : kind === "loveseat" ? 1.95 : 0.9;
  const arm = 0.135, inner = width - arm * 2, step = inner / seats;
  const p = new Parts(), cloth = fabric(color, leather), timber = wood(true);
  p.add(cloth, cushion(width - 0.04, 0.16, 0.72, 0.045, 0), 0, 0.21, -0.1);
  p.add(cloth, cushion(inner + 0.03, 0.49, 0.17, 0.06), 0, 0.48, -0.38);
  for (const side of [-1, 1]) {
    p.add(cloth, cushion(arm, 0.4, 0.75, 0.064, 0.007), side * (width - arm) / 2, 0.4, -0.08);
    for (const z of [-0.36, 0.18]) p.add(timber, bar([side * (width / 2 - 0.095), 0.14, z], [side * (width / 2 - 0.08), 0.015, z + 0.012], 0.023, 0.017));
  }
  for (let i = 0; i < seats; i++) {
    const x = -inner / 2 + (i + 0.5) * step;
    p.add(cloth, cushion(step - 0.018, 0.145, 0.57, 0.065, 0.013), x, 0.355, -0.015);
    p.add(cloth, cushion(step - 0.025, 0.4, 0.17, 0.078, 0.021, "front").rotateX(-0.14), x, 0.61, -0.27);
  }
  return p.build();
}

function fourLegChair(cafe: boolean, color: string) {
  const p = new Parts(), cloth = fabric(color), frame = cafe ? wood() : finish("#353b40", 0.5, 0.42);
  for (const x of [-1, 1]) for (const z of [-1, 1]) {
    p.add(frame, bar([x * 0.19, 0.39, z * 0.16 - 0.08], [x * 0.245, 0.018, z * 0.235 - 0.07], cafe ? 0.022 : 0.013, cafe ? 0.017 : 0.012));
  }
  if (cafe) {
    p.add(frame, cushion(0.54, 0.055, 0.49, 0.02, 0), 0, 0.365, -0.04);
    for (const side of [-1, 1]) p.add(frame, bar([side * 0.23, 0.36, -0.23], [side * 0.22, 0.84, -0.32], 0.02));
    p.add(frame, backPad(0.55, 0.25, 0.075, 0.075).rotateX(-0.12), 0, 0.76, -0.3);
    p.add(cloth, backPad(0.46, 0.19, 0.04, 0.065).rotateX(-0.12), 0, 0.76, -0.25);
  } else {
    p.add(cloth, backPad(0.53, 0.48, 0.13, 0.125).rotateX(-0.15), 0, 0.66, -0.25);
  }
  p.add(cloth, cushion(0.51, 0.095, 0.48, 0.045, 0.012), 0, 0.39, -0.035);
  return p.build();
}

function swivel(executive: boolean, color: string) {
  const p = new Parts(), black = finish("#292e34", 0.05, 0.67), steel = finish("#8f989f", 0.75, 0.33);
  const cloth = fabric(executive ? color : "#41484e", executive);
  p.add(steel, bar([0, 0.1, -0.045], [0, 0.345, -0.045], 0.023));
  for (let i = 0; i < 5; i++) {
    const a = Math.PI / 5 + i * Math.PI * 2 / 5, x = Math.sin(a) * 0.29, z = Math.cos(a) * 0.29 - 0.045;
    p.add(steel, bar([0, 0.11, -0.045], [x, 0.075, z], 0.017));
    p.add(black, new THREE.CylinderGeometry(0.032, 0.032, 0.055, 10).rotateZ(Math.PI / 2).rotateY(a), x, 0.036, z);
  }
  p.add(black, cushion(0.53, 0.065, 0.47, 0.025, 0), 0, 0.35, -0.035);
  p.add(cloth, cushion(0.52, 0.11, 0.48, 0.05, 0.01), 0, 0.39, -0.015);
  p.add(black, bar([0, 0.34, -0.24], [0, 0.75, -0.29], 0.026));
  if (executive) {
    p.add(black, backPad(0.52, 0.62, 0.09, 0.11).rotateX(-0.1), 0, 0.77, -0.29);
    p.add(cloth, backPad(0.46, 0.55, 0.075, 0.095).rotateX(-0.1), 0, 0.77, -0.23);
  } else {
    p.add(black, backPad(0.52, 0.53, 0.06, 0.115, true).rotateX(-0.1), 0, 0.74, -0.29);
    p.add(meshBack(), new THREE.PlaneGeometry(0.455, 0.455, 1, 1).rotateX(-0.1), 0, 0.74, -0.259);
    p.add(black, cushion(0.29, 0.06, 0.06, 0.025, 0), 0, 0.63, -0.22);
  }
  for (const side of [-1, 1]) {
    p.add(black, bar([side * 0.25, 0.36, -0.1], [side * 0.29, 0.59, -0.08], 0.017));
    p.add(black, cushion(0.075, 0.045, 0.3, 0.02, 0), side * 0.29, 0.61, -0.045);
  }
  return p.build();
}

function theatre() {
  const p = new Parts(), cloth = fabric("#b95851"), shell = finish("#303439", 0.02, 0.65), steel = finish("#50565b", 0.6, 0.4);
  for (const side of [-1, 1]) {
    p.add(steel, cushion(0.1, 0.045, 0.5, 0.02, 0), side * 0.3, 0.025, -0.04);
    p.add(steel, bar([side * 0.3, 0.04, -0.09], [side * 0.3, 0.58, -0.09], 0.025));
    p.add(shell, cushion(0.09, 0.055, 0.42, 0.025, 0), side * 0.33, 0.61, -0.04);
  }
  p.add(shell, cushion(0.59, 0.08, 0.48, 0.035, 0), 0, 0.345, -0.025);
  p.add(cloth, cushion(0.56, 0.14, 0.49, 0.065, 0.013), 0, 0.39, -0.005);
  p.add(shell, backPad(0.63, 0.56, 0.11, 0.11).rotateX(-0.12), 0, 0.74, -0.29);
  p.add(cloth, backPad(0.575, 0.505, 0.14, 0.1).rotateX(-0.12), 0, 0.745, -0.225);
  p.add(shell, new THREE.TorusGeometry(0.023, 0.006, 5, 14).rotateX(-Math.PI / 2), 0.33, 0.642, 0.08);
  return p.build();
}

export function makeSeating(kind: SeatKind, fabricName?: Fabric) {
  const key = `${kind}:${fabricName ?? "grey"}`;
  let source = prototypes.get(key);
  if (!source) {
    const color = COLORS[fabricName ?? "grey"];
    source = kind === "sofa" || kind === "loveseat" || kind === "armchair" ? lounge(kind, color, fabricName === "leather")
      : kind === "cafe-chair" || kind === "meet-chair" ? fourLegChair(kind === "cafe-chair", kind === "cafe-chair" ? "#d8d1c3" : color)
      : kind === "theatre-seat" ? theatre() : swivel(kind === "exec-chair", color);
    source.name = `modern-${kind}`; source.userData.seating = kind;
    prototypes.set(key, source);
  }
  return source.clone(true);
}

// Retain cached GPU assets while a custom office is rebuilt; all copies share these resources.
export function seatingResources() {
  const resources = new Set<unknown>();
  for (const source of prototypes.values()) source.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) resources.add(mesh.geometry);
    if (mesh.material) resources.add(mesh.material);
  });
  for (const material of materials.values()) for (const value of Object.values(material)) if (value instanceof THREE.Texture) resources.add(value);
  return resources;
}

// Rows of auditorium/conference chairs share one GPU draw per geometry/material.
// Task chairs stay independent because office-3d.tsx swivels their holders while typing.
export function batchStaticSeating(root: THREE.Object3D) {
  root.updateWorldMatrix(true, true);
  const batches = new Map<string, THREE.Mesh[]>();
  root.traverse((node) => {
    if (!node.userData.seating || node.userData.seating === "task-chair") return;
    node.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh || Array.isArray(mesh.material)) return;
      const key = `${mesh.geometry.uuid}:${mesh.material.uuid}`;
      const batch = batches.get(key) ?? []; batch.push(mesh); batches.set(key, batch);
    });
  });
  const inverse = root.matrixWorld.clone().invert();
  for (const meshes of batches.values()) {
    if (meshes.length < 3) continue;
    const first = meshes[0]!;
    const instances = new THREE.InstancedMesh(first.geometry, first.material, meshes.length);
    meshes.forEach((mesh, i) => { instances.setMatrixAt(i, new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld)); mesh.removeFromParent(); });
    instances.castShadow = instances.receiveShadow = true;
    instances.instanceMatrix.needsUpdate = true; instances.computeBoundingSphere(); root.add(instances);
  }
}
