import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { getChatRoomAtPosition, getMapTemplate } from "@repo/shared";
import {
  HQ_COLS, HQ_FLOORS, HQ_ITEMS, HQ_PATH, HQ_ROWS, HQ_RUGS, HQ_TALL_WALLS, HQ_THIN_WALLS, HQ_TREES, HQ_WALL_DECOR,
  ITEM_SPECS, hqWallCells,
  type Dir, type Fabric, type FloorKind, type HqItem, type RugStyle, type WallStyle,
} from "../../lib/maps/clario-hq";

// Builds Clario HQ in three.js from the same layout as the 2D map.
// One tile = one unit. x runs east, z runs south (the 2D map's y), y is up.

const MODEL_DIR = "/assets/3d/kenney/";
const MODELS = [
  "desk", "chairDesk", "computerScreen", "computerKeyboard", "laptop", "table", "chair", "chairCushion",
  "loungeSofaLong", "loungeChair", "tableCoffee", "pottedPlant", "plantSmall1", "plantSmall2",
  "bookcaseOpen", "kitchenCabinet", "kitchenSink", "kitchenFridgeLarge", "kitchenCoffeeMachine",
  "kitchenMicrowave", "kitchenCabinetUpper", "stoolBar", "lampRoundFloor", "televisionModern",
  "cabinetTelevision", "sideTable", "trashcan",
] as const;
type ModelName = (typeof MODELS)[number];

// Realistic seating (CC0): Poly Haven's sofa, armchair and leather chair, and Quaternius's office
// chair. Each is optional: if one fails to load, that seat falls back to its Kenney model.
// Licences: public/assets/3d/polyhaven/License.txt and public/assets/3d/quaternius/License.txt.
const SEATING = {
  sofa: "/assets/3d/polyhaven/sofa_02/sofa_02_1k.gltf",
  armchair: "/assets/3d/polyhaven/modern_arm_chair_01/modern_arm_chair_01_1k.gltf",
  meetingChair: "/assets/3d/polyhaven/dining_chair_02/dining_chair_02_1k.gltf",
  officeChair: "/assets/3d/quaternius/OfficeChair.glb",
} as const;
type SeatingName = keyof typeof SEATING;

export type ModelSet = Record<ModelName, THREE.Group> & { seating: Partial<Record<SeatingName, THREE.Group>> };

export const WALL_HEIGHT = 1.7;
const BACK_WALL_HEIGHT = 2.1;
const WALL_THICKNESS = 0.3;

const FABRIC_COLORS: Record<Fabric, { mid: string; dark: string }> = {
  navy: { mid: "#3a4f8a", dark: "#27355f" },
  coral: { mid: "#d4675a", dark: "#a8473c" },
  teal: { mid: "#2c8c84", dark: "#1d6862" },
  mustard: { mid: "#d29c33", dark: "#a8761c" },
  sage: { mid: "#76946d", dark: "#56724f" },
  grey: { mid: "#6c7282", dark: "#4d5260" },
};

const WALL_COLORS: Record<WallStyle, { face: string; wainscot: string }> = {
  exterior: { face: "#eee9df", wainscot: "#d8cab0" },
  corridor: { face: "#e4e8ef", wainscot: "#c9d0db" },
  library: { face: "#dfe7d6", wainscot: "#9b7a55" },
  game: { face: "#2b4b91", wainscot: "#1f3a75" },
};
const CAP_COLOR = "#4a4f5e";

export async function loadModels(onProgress?: (loaded: number, total: number) => void): Promise<ModelSet> {
  const loader = new GLTFLoader();
  const total = MODELS.length + Object.keys(SEATING).length;
  let loaded = 0;
  const load = async (url: string) => {
    const gltf = await loader.loadAsync(url);
    gltf.scene.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) tuneMaterial(material);
    });
    loaded++;
    onProgress?.(loaded, total);
    return gltf.scene;
  };
  const [kenney, seating] = await Promise.all([
    Promise.all(MODELS.map(async (name) => [name, await load(`${MODEL_DIR}${name}.glb`)] as const)),
    Promise.all((Object.entries(SEATING) as [SeatingName, string][]).map(async ([name, url]) => {
      try {
        return [name, await load(url)] as const;
      } catch (error) {
        console.warn(`3D seating model ${name} did not load; using the simple one`, error);
        return [name, undefined] as const;
      }
    })),
  ]);
  return { ...Object.fromEntries(kenney), seating: Object.fromEntries(seating) } as ModelSet;
}

// Scales a model to fit inside w x h x d without distorting it, sitting on the floor and centred.
// `stretch` lets it widen a little past its own proportions (a longer sofa still looks right).
function fitSeat(source: THREE.Object3D, w: number, h: number, d: number, stretch = 1) {
  const model = source.clone(true);
  const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
  const scale = Math.min(h / (size.y || 1), d / (size.z || 1), w / (size.x || 1));
  model.scale.set(Math.min(w / (size.x || 1), scale * stretch), scale, scale);
  const bounds = new THREE.Box3().setFromObject(model);
  const center = bounds.getCenter(new THREE.Vector3());
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= bounds.min.y;
  const holder = new THREE.Group();
  holder.add(model);
  return holder;
}

// Kenney's materials are all fully rough and non-metallic. Giving metal a sheen, wood a soft
// gloss and fabric a matte finish lets the environment light read them as real surfaces.
function tuneMaterial(material: THREE.Material) {
  const surface = material as THREE.MeshStandardMaterial;
  if (!surface.isMeshStandardMaterial) return;
  const name = surface.name.toLowerCase();
  if (name.startsWith("metal")) {
    surface.metalness = 0.55;
    surface.roughness = 0.35;
  } else if (name === "carpet") {
    surface.metalness = 0;
    surface.roughness = 0.95;
  } else if (name === "wood") {
    surface.metalness = 0;
    surface.roughness = 0.6;
  } else if (name === "lamp" || name.includes("glass")) {
    surface.roughness = 0.2;
  }
}

const standard = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...extra });

function box(w: number, h: number, d: number, material: THREE.Material | THREE.Material[], x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// Scales a model so its bounding box is exactly w x h x d, sitting on the floor and centred.
function fit(source: THREE.Object3D, w: number, h: number, d: number) {
  const model = source.clone(true);
  const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
  model.scale.set(w / (size.x || 1), h / (size.y || 1), d / (size.z || 1));
  const bounds = new THREE.Box3().setFromObject(model);
  const center = bounds.getCenter(new THREE.Vector3());
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= bounds.min.y;
  const holder = new THREE.Group();
  holder.add(model);
  return holder;
}

// Kenney's upholstery materials are called "carpet"; repaint them to match the 2D map.
function recolor(object: THREE.Object3D, fabric: Fabric | undefined) {
  if (!fabric) return object;
  const colors = FABRIC_COLORS[fabric];
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    const swap = (material: THREE.Material) => {
      if (!material.name.toLowerCase().includes("carpet")) return material;
      const copy = (material as THREE.MeshStandardMaterial).clone();
      copy.color.set(material.name.toLowerCase().includes("dark") ? colors.dark : colors.mid);
      return copy;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
  });
  return object;
}

const ANGLE: Record<Dir, number> = { down: 0, right: Math.PI / 2, up: Math.PI, left: -Math.PI / 2 };

// ---------------------------------------------------------------------------

export function buildOffice(scene: THREE.Scene, models: ModelSet) {
  const walls = hqWallCells();
  const centerX = HQ_COLS / 2;
  const centerZ = HQ_ROWS / 2;

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(HQ_COLS + 60, HQ_ROWS + 60), standard("#8cc56f"));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(centerX, 0, centerZ);
  ground.receiveShadow = true;
  scene.add(ground);

  const path = new THREE.Mesh(new THREE.PlaneGeometry(HQ_PATH.w, HQ_PATH.h + 30), standard("#cfc9bd"));
  path.rotation.x = -Math.PI / 2;
  path.position.set(HQ_PATH.x + HQ_PATH.w / 2, 0.004, HQ_PATH.y + (HQ_PATH.h + 30) / 2 - 0.5);
  path.receiveShadow = true;
  scene.add(path);

  buildFloors(scene, walls);
  buildRugs(scene);
  buildWalls(scene, models);
  for (const item of HQ_ITEMS) {
    const object = buildItem(item, models);
    if (!object) continue;
    const spec = ITEM_SPECS[item.kind];
    object.position.x += item.x + spec.w / 2;
    object.position.z += item.y + spec.h / 2;
    scene.add(object);
  }
  buildTrees(scene);
  buildRoomLabels(scene);
}

// Small repeating textures so floors read as wood, carpet or tile, not flat colour. Wood is
// drawn at a higher resolution with grain, since it covers most of the floor up close.
const DETAILED_FLOORS = new Set<FloorKind>(["wood", "herringbone"]);

function woodGrain(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, along: "x" | "y", rand: () => number) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  const length = along === "x" ? w : h;
  const across = along === "x" ? h : w;
  for (let line = 0; line < across; line += 2 + rand() * 3) {
    ctx.strokeStyle = rand() < 0.5 ? "rgba(120, 72, 30, 0.16)" : "rgba(255, 235, 200, 0.12)";
    ctx.lineWidth = 0.6 + rand() * 0.8;
    ctx.beginPath();
    const wave = rand() * 6;
    for (let t = 0; t <= length; t += 8) {
      const offset = line + Math.sin(t / (18 + wave) + wave) * 1.2;
      if (along === "x") ctx.lineTo(x + t, y + offset); else ctx.lineTo(x + offset, y + t);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function floorTexture(kind: FloorKind) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = DETAILED_FLOORS.has(kind) ? 256 : 64;
  const ctx = canvas.getContext("2d")!;
  const fill = (color: string, x: number, y: number, w: number, h: number) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  };
  let seed = 7;
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  switch (kind) {
    case "wood":
      // Four rows of planks with staggered joints, grain and a dark seam between rows.
      for (let i = 0; i < 4; i++) {
        const y = i * 64;
        const joint = (i * 97) % 256;
        for (const [x0, x1] of [[0, joint], [joint, 256]] as const) {
          fill(["#d6a46b", "#cf9c62", "#dbad76", "#d3a067", "#cc985e"][Math.floor(rand() * 5)]!, x0, y, x1 - x0, 64);
          woodGrain(ctx, x0, y, x1 - x0, 64, "x", rand);
        }
        fill("rgba(110, 70, 32, 0.55)", joint, y, 2, 64);
        fill("rgba(110, 70, 32, 0.6)", 0, y + 62, 256, 2);
        fill("rgba(255, 240, 215, 0.25)", 0, y, 256, 1);
      }
      break;
    case "carpet":
      fill("#8e9bb5", 0, 0, 64, 64);
      for (let i = 0; i < 300; i++) fill(rand() < 0.5 ? "#8693ad" : "#97a4bd", rand() * 64, rand() * 64, 1, 1);
      break;
    case "tile":
      for (let x = 0; x < 2; x++) for (let y = 0; y < 2; y++) fill((x + y) % 2 ? "#e5e1d8" : "#f3f1ec", x * 32, y * 32, 32, 32);
      fill("#d3cdc1", 0, 0, 64, 1); fill("#d3cdc1", 0, 0, 1, 64); fill("#d3cdc1", 0, 32, 64, 1); fill("#d3cdc1", 32, 0, 1, 64);
      break;
    case "herringbone":
      // Parquet blocks of four planks, alternating direction, each with its own grain.
      for (let bx = 0; bx < 2; bx++) for (let by = 0; by < 2; by++) for (let s = 0; s < 4; s++) {
        const color = ["#b98451", "#ab7647", "#c48e5a", "#b07c4c"][(bx + by + s) % 4]!;
        const vertical = (bx + by) % 2 === 1;
        const [x, y, w, h] = vertical ? [bx * 128 + s * 32, by * 128, 32, 128] : [bx * 128, by * 128 + s * 32, 128, 32];
        fill(color, x, y, w, h);
        woodGrain(ctx, x, y, w, h, vertical ? "y" : "x", rand);
        if (vertical) fill("rgba(90, 55, 25, 0.5)", x + 30, y, 2, h); else fill("rgba(90, 55, 25, 0.5)", x, y + 30, w, 2);
      }
      break;
    case "terrazzo":
      fill("#e2dfd8", 0, 0, 64, 64);
      for (let i = 0; i < 90; i++) fill(["#c9c4bb", "#b7b0a5", "#d8a48f", "#9fb4c7"][i % 4]!, rand() * 64, rand() * 64, 2, 2);
      break;
    case "sage":
      fill("#a7bb9c", 0, 0, 64, 64);
      for (let i = 0; i < 64; i += 8) for (let j = 0; j < 64; j += 8) fill("#9bb090", i + 3, j + 3, 2, 2);
      break;
    case "arcade":
      for (let x = 0; x < 2; x++) for (let y = 0; y < 2; y++) fill((x + y) % 2 ? "#22478f" : "#1f418a", x * 32, y * 32, 32, 32);
      fill("#18346f", 0, 31, 64, 1); fill("#18346f", 31, 0, 1, 64); fill("#18346f", 0, 63, 64, 1); fill("#18346f", 63, 0, 1, 64);
      break;
    case "sand":
      fill("#e2d2b4", 0, 0, 64, 64);
      for (let i = 0; i < 260; i++) fill(rand() < 0.5 ? "#dac9a9" : "#e9dbc0", rand() * 64, rand() * 64, 1, 1);
      break;
    case "raised":
      for (let x = 0; x < 2; x++) for (let y = 0; y < 2; y++) {
        fill("#9aa3ae", x * 32, y * 32, 32, 32);
        if ((x + y) % 2 === 0) for (let hx = 4; hx < 30; hx += 4) for (let hy = 4; hy < 30; hy += 4) fill("#7d8692", x * 32 + hx, y * 32 + hy, 1, 1);
      }
      fill("#6f7884", 0, 31, 64, 1); fill("#6f7884", 31, 0, 1, 64); fill("#6f7884", 0, 63, 64, 1); fill("#6f7884", 63, 0, 1, 64);
      break;
    case "concrete":
      fill("#b9b7b2", 0, 0, 64, 64);
      for (let i = 0; i < 40; i++) fill(rand() < 0.5 ? "#b1afaa" : "#c2c0bb", rand() * 60, rand() * 60, 4, 2);
      fill("#a29f99", 0, 63, 64, 1); fill("#a29f99", 63, 0, 1, 64);
      break;
    case "teal":
      for (let x = 0; x < 2; x++) for (let y = 0; y < 2; y++) fill((x + y) % 2 ? "#62aba3" : "#5ca39b", x * 32, y * 32, 32, 32);
      fill("#4b8b83", 0, 31, 64, 1); fill("#4b8b83", 31, 0, 1, 64); fill("#4b8b83", 0, 63, 64, 1); fill("#4b8b83", 63, 0, 1, 64);
      break;
    case "office":
      for (let x = 0; x < 2; x++) for (let y = 0; y < 2; y++) fill((x + y) % 2 ? "#c0c7d2" : "#c7cdd8", x * 32, y * 32, 32, 32);
      fill("#b2b9c6", 0, 31, 64, 1); fill("#b2b9c6", 31, 0, 1, 64); fill("#b2b9c6", 0, 63, 64, 1); fill("#b2b9c6", 63, 0, 1, 64);
      break;
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  if (!DETAILED_FLOORS.has(kind)) texture.magFilter = THREE.NearestFilter;
  return texture;
}

function buildFloors(scene: THREE.Scene, walls: Set<string>) {
  const textures = new Map<FloorKind, THREE.CanvasTexture>();
  const isWall = (x: number, y: number) => walls.has(`${x},${y}`);
  HQ_FLOORS.forEach((floor, index) => {
    let { x, y, w, h } = floor;
    if (index === 0) {
      x += 0.5; w -= 1; h -= 0.5;
    } else {
      // Run under half of a neighbouring wall so no seam shows.
      const rows = Array.from({ length: floor.h }, (_, i) => floor.y + i);
      const cols = Array.from({ length: floor.w }, (_, i) => floor.x + i);
      if (rows.some((row) => isWall(floor.x - 1, row))) { x -= 0.5; w += 0.5; }
      if (rows.some((row) => isWall(floor.x + floor.w, row))) w += 0.5;
      if (cols.some((col) => isWall(col, floor.y - 1))) { y -= 0.5; h += 0.5; }
      if (cols.some((col) => isWall(col, floor.y + floor.h))) h += 0.5;
    }
    let texture = textures.get(floor.kind);
    if (!texture) {
      texture = floorTexture(floor.kind);
      textures.set(floor.kind, texture);
    }
    const map = texture.clone();
    map.repeat.set(w / 2, h / 2);
    map.needsUpdate = true;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), standard("#ffffff", { map }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x + w / 2, 0.01 + index * 0.002, y + h / 2);
    mesh.receiveShadow = true;
    scene.add(mesh);
  });
}

const RUG_COLORS: Record<RugStyle, { border: string; fill: string }> = {
  meeting: { border: "#46557a", fill: "#6d7ea6" },
  focus: { border: "#b8964f", fill: "#e3c88f" },
  lounge: { border: "#c06a47", fill: "#ece0ca" },
  round: { border: "#5f8c80", fill: "#8fb3a8" },
  library: { border: "#7c3b33", fill: "#9c4f43" },
  game: { border: "#1f5fd6", fill: "#3686ff" },
  stage: { border: "#664628", fill: "#b98451" },
};

function buildRugs(scene: THREE.Scene) {
  for (const rug of HQ_RUGS) {
    const colors = RUG_COLORS[rug.style];
    const cx = rug.x + rug.w / 2;
    const cz = rug.y + rug.h / 2;
    const layer = (w: number, h: number, color: string, y: number) => {
      const geometry = rug.style === "round" ? new THREE.CircleGeometry(0.5, 48) : new THREE.PlaneGeometry(1, 1);
      const mesh = new THREE.Mesh(geometry, standard(color));
      mesh.rotation.x = -Math.PI / 2;
      mesh.scale.set(w, h, 1);
      mesh.position.set(cx, y, cz);
      mesh.receiveShadow = true;
      scene.add(mesh);
    };
    layer(rug.w, rug.h, colors.border, 0.03);
    layer(rug.w - 0.35, rug.h - 0.35, colors.fill, 0.032);
  }
}

function tallWallZ(y: number) {
  // The face sits at the south edge of its two rows, so furniture below it touches the wall.
  return y + 2 - WALL_THICKNESS / 2 - 0.05;
}

function buildWalls(scene: THREE.Scene, models: ModelSet) {
  const capMaterial = standard(CAP_COLOR);
  const tallRows = new Map<string, number>();
  for (const wall of HQ_TALL_WALLS) {
    const height = wall.style === "exterior" ? BACK_WALL_HEIGHT : WALL_HEIGHT;
    const colors = WALL_COLORS[wall.style];
    const face = standard(colors.face);
    const wainscot = standard(colors.wainscot);
    const z = tallWallZ(wall.y);
    for (let x = wall.x1; x <= wall.x2; x++) {
      tallRows.set(`${x},${wall.y}`, wall.y);
      tallRows.set(`${x},${wall.y + 1}`, wall.y);
    }
    let start: number | null = null;
    for (let x = wall.x1; x <= wall.x2 + 1; x++) {
      const open = x > wall.x2 || wall.doors.some(([a, b]) => x >= a && x <= b);
      if (!open && start === null) start = x;
      if (open && start !== null) {
        const left = start === wall.x1 ? start + 0.5 : start;
        const right = x - 1 === wall.x2 ? x - 0.5 : x;
        const width = right - left;
        // Box faces: +x, -x, top, bottom, +z, -z. The top is the dark cap.
        scene.add(box(width, height, WALL_THICKNESS, [face, face, capMaterial, face, face, face], left + width / 2, height / 2, z));
        scene.add(box(width, 0.42, WALL_THICKNESS + 0.04, wainscot, left + width / 2, 0.21, z));
        start = null;
      }
    }
  }

  const thin = standard("#5a6070");
  for (const wall of HQ_THIN_WALLS) {
    const vertical = wall.x1 === wall.x2;
    if (vertical) {
      let z1 = wall.y1;
      let z2 = wall.y2 + 1;
      const above = tallRows.get(`${wall.x1},${wall.y1 - 1}`);
      if (above !== undefined) z1 = tallWallZ(above);
      const below = tallRows.get(`${wall.x1},${wall.y2 + 1}`);
      if (below !== undefined) z2 = tallWallZ(below);
      if (wall.y2 === 32) z2 = 32.6;
      scene.add(box(0.2, WALL_HEIGHT, z2 - z1, [thin, thin, capMaterial, thin, thin, thin], wall.x1 + 0.5, WALL_HEIGHT / 2, (z1 + z2) / 2));
    } else {
      // The front of the building stays low so you can see inside.
      let x = wall.x1;
      const segments: [number, number][] = [];
      let start = x;
      for (; x <= wall.x2 + 1; x++) {
        const gap = x > wall.x2 || wall.gaps?.some(([a, b]) => x >= a && x <= b);
        if (gap) {
          if (x > start) segments.push([start, x]);
          start = x + 1;
        }
      }
      for (const [a, b] of segments) {
        const left = a === wall.x1 ? a - 0.5 : a;
        const right = b - 1 === wall.x2 ? b + 0.5 : b;
        scene.add(box(right - left, 0.45, 0.2, [thin, thin, capMaterial, thin, thin, thin], (left + right) / 2, 0.225, wall.y1 + 0.5));
      }
    }
  }

  for (const decor of HQ_WALL_DECOR) {
    const wall = HQ_TALL_WALLS.find((w) => w.y === decor.wallY);
    const faceZ = tallWallZ(decor.wallY) + WALL_THICKNESS / 2;
    const cx = decor.x + decor.w / 2;
    const height = wall?.style === "exterior" ? BACK_WALL_HEIGHT : WALL_HEIGHT;
    const mid = height * 0.62;
    switch (decor.kind) {
      case "window": {
        scene.add(box(decor.w * 0.92, 0.78, WALL_THICKNESS + 0.06, standard("#f5f3ee"), cx, mid, faceZ - WALL_THICKNESS / 2));
        scene.add(box(decor.w * 0.8, 0.66, WALL_THICKNESS + 0.08, standard("#9fd3ef", { emissive: "#6fb5e0", emissiveIntensity: 0.25, roughness: 0.15 }), cx, mid, faceZ - WALL_THICKNESS / 2));
        break;
      }
      case "tv": {
        scene.add(box(decor.w * 0.95, 0.7, 0.06, standard("#2a2e38"), cx, mid, faceZ + 0.03));
        scene.add(box(decor.w * 0.88, 0.6, 0.02, standard("#3c55a0", { emissive: "#3c55a0", emissiveIntensity: 0.6 }), cx, mid, faceZ + 0.07));
        break;
      }
      case "whiteboard":
        scene.add(box(decor.w * 0.95, 0.75, 0.05, standard("#fbfbf8"), cx, mid, faceZ + 0.03));
        break;
      case "art": {
        const colors = ["#e85d9b", "#3a6ee8", "#4caf6d", "#d9534f", "#8a78f0", "#e58f6a"];
        scene.add(box(decor.w * 0.85, 0.55, 0.05, standard("#2a2e38"), cx, mid, faceZ + 0.03));
        scene.add(box(decor.w * 0.7, 0.42, 0.02, standard(colors[(decor.variant ?? 0) % colors.length]!), cx, mid, faceZ + 0.06));
        break;
      }
      case "clock": {
        const clock = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.05, 32), standard("#fbfaf6"));
        clock.rotation.x = Math.PI / 2;
        clock.position.set(cx, mid + 0.2, faceZ + 0.03);
        scene.add(clock);
        break;
      }
      case "cabinets":
        for (let i = 0; i < decor.w; i++) {
          const cabinet = fit(models.kitchenCabinetUpper, 0.98, 0.6, 0.45);
          cabinet.position.set(decor.x + i + 0.5, 1.25, faceZ + 0.22);
          scene.add(cabinet);
        }
        break;
      case "logo": {
        scene.add(box(decor.w * 0.95, 0.55, 0.06, standard("#e3bc87"), cx, mid, faceZ + 0.03));
        const label = textPlane("Clario", { color: "#2a2e38", background: null, weight: 800, size: 64 });
        label.scale.multiplyScalar(0.45);
        label.position.set(cx + 0.2, mid, faceZ + 0.07);
        scene.add(label);
        scene.add(box(0.28, 0.32, 0.03, standard("#3a6ee8"), decor.x + 0.55, mid, faceZ + 0.07));
        break;
      }
      case "shelf":
        scene.add(box(decor.w * 0.9, 0.06, 0.25, standard("#ad7b46"), cx, mid - 0.15, faceZ + 0.12));
        break;
      case "neon": {
        scene.add(box(decor.w * 0.92, 0.5, 0.04, standard("#161a2e"), cx, mid + 0.1, faceZ + 0.03));
        const label = textPlane(decor.variant === 1 ? "HACK" : "PLAY", { color: "#dcebff", background: null, weight: 800, size: 64 });
        (label.material as THREE.MeshBasicMaterial).color.set("#8cbcff");
        label.scale.multiplyScalar(0.36);
        label.position.set(cx, mid + 0.1, faceZ + 0.06);
        scene.add(label);
        break;
      }
    }
  }
}

function buildItem(item: HqItem, models: ModelSet): THREE.Object3D | null {
  const dir = item.dir ?? "down";
  const group = new THREE.Group();
  const add = (object: THREE.Object3D, x = 0, y = 0, z = 0) => {
    object.position.set(x, y, z);
    group.add(object);
    return object;
  };

  switch (item.kind) {
    case "desk-l":
    case "desk-r": {
      add(fit(models.desk, 1.9, 0.62, 0.9));
      const side = item.kind === "desk-l" ? -0.45 : 0.45;
      add(fit(models.computerScreen, 0.62, 0.42, 0.16), side, 0.62, -0.22);
      add(fit(models.computerKeyboard, 0.46, 0.03, 0.14), side, 0.62, 0.12);
      break;
    }
    case "task-chair": {
      const office = models.seating.officeChair;
      add(office ? fitSeat(office, 0.68, 1.0, 0.68) : fit(models.chairDesk, 0.62, 0.9, 0.62)).rotation.y = ANGLE[dir];
      break;
    }
    case "meeting-table":
    case "meeting-table-sm": {
      const width = item.kind === "meeting-table" ? 5.7 : 3.7;
      add(fit(models.table, width, 0.62, 1.7));
      const seats = item.kind === "meeting-table" ? 6 : 4;
      for (let i = 0; i < seats; i++) {
        const laptop = add(fit(models.laptop, 0.42, 0.22, 0.32), -width / 2 + 0.5 + i * (width - 1) / (seats - 1), 0.62, 0.45);
        laptop.rotation.y = Math.PI;
      }
      break;
    }
    case "meet-chair": {
      // Leather chairs at the meeting tables; the Demo Stage keeps the lighter cushioned chairs,
      // since 28 detailed chairs would cost more than they add.
      const leather = models.seating.meetingChair;
      const inMeetingRoom = getChatRoomAtPosition("clario-hq", item)?.id.startsWith("hq-meeting");
      add(leather && inMeetingRoom
        ? fitSeat(leather, 0.6, 0.98, 0.62)
        : recolor(fit(models.chairCushion, 0.58, 0.9, 0.58), item.fabric)).rotation.y = ANGLE[dir];
      break;
    }
    case "sofa": {
      const sofa = models.seating.sofa;
      add(sofa ? fitSeat(sofa, 2.9, 0.85, 1.0, 1.3) : recolor(fit(models.loungeSofaLong, 2.9, 0.78, 0.95), item.fabric)).rotation.y = ANGLE[dir];
      break;
    }
    case "armchair": {
      const armchair = models.seating.armchair;
      add(armchair ? fitSeat(armchair, 0.92, 0.95, 0.95) : recolor(fit(models.loungeChair, 0.9, 0.78, 0.9), item.fabric)).rotation.y = ANGLE[dir];
      break;
    }
    case "beanbag": {
      const bag = add(new THREE.Mesh(new THREE.SphereGeometry(0.42, 24, 16), standard(FABRIC_COLORS[item.fabric ?? "coral"].mid)), 0, 0.22);
      bag.scale.set(1, 0.6, 1);
      bag.castShadow = true;
      break;
    }
    case "coffee-table":
      add(fit(models.tableCoffee, 2.4, 0.36, 0.8));
      break;
    case "side-table":
      add(fit(models.sideTable, 0.62, 0.5, 0.62));
      break;
    case "tv-console":
      add(fit(models.cabinetTelevision, 2.6, 0.48, 0.6));
      add(fit(models.televisionModern, 2.1, 1.0, 0.2), 0, 0.48, -0.1);
      break;
    case "bookshelf":
      add(fit(models.bookcaseOpen, 1.9, 2.0, 0.6), 0, 0, -0.18);
      for (let i = 0; i < 3; i++) {
        const colors = ["#d9534f", "#3a6ee8", "#f2c14e", "#4caf6d", "#7a5fd0"];
        for (let b = 0; b < 7; b++) {
          add(box(0.12, 0.34, 0.32, standard(colors[(b + i) % colors.length]!), -0.72 + b * 0.22, 0.2 + i * 0.62, -0.18));
        }
      }
      break;
    case "plant-big":
      add(fit(models.pottedPlant, 0.75, 1.35, 0.75));
      break;
    case "plant-small":
      add(fit(models.plantSmall1, 0.5, 0.6, 0.5));
      break;
    case "plant-tree":
      add(fit(models.pottedPlant, 0.85, 2.1, 0.85));
      break;
    case "floor-lamp":
      add(fit(models.lampRoundFloor, 0.5, 1.75, 0.5));
      break;
    case "fridge":
      add(fit(models.kitchenFridgeLarge, 0.95, 1.95, 0.8), 0, 0, -0.08);
      break;
    case "counter":
    case "counter-sink":
    case "counter-micro":
    case "counter-coffee": {
      add(fit(item.kind === "counter-sink" ? models.kitchenSink : models.kitchenCabinet, 1.0, 0.9, 0.82), 0, 0, -0.08);
      if (item.kind === "counter-micro") add(fit(models.kitchenMicrowave, 0.66, 0.38, 0.45), 0, 0.9, -0.12);
      if (item.kind === "counter-coffee") add(fit(models.kitchenCoffeeMachine, 0.36, 0.48, 0.36), 0, 0.9, -0.12);
      break;
    }
    case "water-cooler":
      add(box(0.48, 0.95, 0.48, standard("#f3f1ec")), 0, 0.475, 0);
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.5, 24), standard("#9fd6f2", { transparent: true, opacity: 0.85, roughness: 0.1 })), 0, 1.2, 0);
      break;
    case "cafe-table":
      add(fit(models.table, 1.8, 0.62, 0.9));
      break;
    case "cafe-chair":
      add(fit(models.chair, 0.55, 0.85, 0.55)).rotation.y = ANGLE[dir];
      break;
    case "reception-desk": {
      add(box(3.8, 0.95, 1.1, standard("#f7f5f0")), 0, 0.475, 0.2);
      add(box(3.9, 0.08, 1.2, standard("#e3bc87")), 0, 0.99, 0.2);
      add(box(0.5, 0.5, 0.03, standard("#3a6ee8")), 0, 0.5, 0.77);
      add(fit(models.computerScreen, 0.62, 0.42, 0.16), 0, 1.03, -0.15).rotation.y = Math.PI;
      add(fit(models.plantSmall2, 0.4, 0.45, 0.4), 1.5, 1.03, 0);
      break;
    }
    case "pingpong": {
      const blue = standard("#1e3a6e", { roughness: 0.6 });
      add(box(2.7, 0.06, 1.5, blue), 0, 0.66, 0);
      add(box(2.7, 0.005, 0.03, standard("#ffffff")), 0, 0.695, 0);
      add(box(0.03, 0.16, 1.55, standard("#2a2e38")), 0, 0.77, 0);
      for (const [lx, lz] of [[-1.15, -0.6], [1.15, -0.6], [-1.15, 0.6], [1.15, 0.6]] as const) add(box(0.06, 0.63, 0.06, standard("#2a2e38")), lx, 0.315, lz);
      break;
    }
    case "arcade": {
      const colors = ["#3686ff", "#2b8f8a", "#c0473f"];
      const body = standard(colors[Math.round(item.x) % 3]!);
      add(box(0.78, 1.7, 0.7, body), 0, 0.85, -0.05);
      add(box(0.6, 0.45, 0.04, standard("#1d2340", { emissive: "#3fc5d6", emissiveIntensity: 0.5 })), 0, 1.2, 0.31);
      add(box(0.7, 0.18, 0.04, standard("#f2c14e", { emissive: "#f2c14e", emissiveIntensity: 0.4 })), 0, 1.6, 0.31);
      break;
    }
    case "server-rack": {
      add(box(0.86, 1.95, 0.8, standard("#2a2e38", { roughness: 0.5, metalness: 0.4 })), 0, 0.975, 0);
      // One row of status lights per server, facing the aisle.
      const lights = ["#4ade80", "#4fa3ff", "#4ade80", "#f2c14e", "#4ade80", "#4fa3ff", "#4ade80", "#4ade80"];
      lights.forEach((color, i) => {
        add(box(0.74, 0.16, 0.02, standard("#353a46", { roughness: 0.6, metalness: 0.3 })), 0, 0.25 + i * 0.21, 0.41);
        add(box(0.05, 0.04, 0.02, standard(color, { emissive: color, emissiveIntensity: 1.2 })), -0.3, 0.25 + i * 0.21, 0.43);
      });
      break;
    }
    case "printer-3d": {
      add(fit(models.sideTable, 0.8, 0.5, 0.7));
      const frame = standard("#2a2e38", { roughness: 0.5, metalness: 0.5 });
      for (const [px, pz] of [[-0.3, -0.25], [0.3, -0.25], [-0.3, 0.25], [0.3, 0.25]] as const) add(box(0.04, 0.6, 0.04, frame), px, 0.8, pz);
      add(box(0.66, 0.06, 0.56, frame), 0, 1.1, 0);
      add(box(0.5, 0.03, 0.42, standard("#9aa3b2", { metalness: 0.6, roughness: 0.3 })), 0, 0.55, 0);
      add(box(0.16, 0.16, 0.16, standard("#e85d4f")), 0, 0.65, 0);
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 20), standard("#e85d4f")), 0, 1.18, 0);
      break;
    }
    case "robot-arm": {
      const yellow = standard("#f2b630", { roughness: 0.45 });
      add(box(0.7, 0.4, 0.7, standard("#9aa3b2", { roughness: 0.6 })), 0, 0.2, 0);
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.2, 24), yellow), 0, 0.5, 0);
      const lower = add(box(0.16, 0.7, 0.16, yellow), 0, 0.85, 0.08);
      lower.rotation.x = 0.35;
      const upper = add(box(0.13, 0.55, 0.13, yellow), 0, 1.25, 0.38);
      upper.rotation.x = 1.2;
      add(box(0.2, 0.08, 0.08, standard("#2a2e38")), 0, 1.15, 0.65);
      break;
    }
    case "workbench": {
      add(fit(models.desk, 1.9, 0.75, 0.85));
      add(box(0.42, 0.3, 0.3, standard("#3a3f4a")), -0.55, 0.9, -0.12);
      add(box(0.3, 0.18, 0.02, standard("#0f2a1c", { emissive: "#4ade80", emissiveIntensity: 0.6 })), -0.55, 0.92, 0.04);
      add(box(0.36, 0.02, 0.18, standard("#f3f1ec")), 0.1, 0.76, 0.1);
      add(box(0.16, 0.12, 0.16, standard("#c0473f")), 0.6, 0.81, -0.1);
      break;
    }
    case "podium":
      add(box(0.6, 1.05, 0.45, standard("#b98451", { roughness: 0.7 })), 0, 0.525, 0);
      add(box(0.66, 0.05, 0.5, standard("#86603a")), 0, 1.07, 0);
      add(fit(models.laptop, 0.36, 0.2, 0.28), 0, 1.1, 0).rotation.y = Math.PI;
      break;
    case "vr-station": {
      const mat = new THREE.Mesh(new THREE.CircleGeometry(0.48, 32), standard("#3686ff"));
      mat.rotation.x = -Math.PI / 2;
      add(mat, 0, 0.02, 0);
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 1.2, 12), standard("#9aa3b2", { metalness: 0.6, roughness: 0.3 })), 0, 0.6, -0.3);
      add(box(0.3, 0.16, 0.18, standard("#2a2e38", { roughness: 0.4 })), 0, 1.25, -0.25);
      add(box(0.22, 0.06, 0.02, standard("#4fa3ff", { emissive: "#4fa3ff", emissiveIntensity: 0.8 })), 0, 1.25, -0.15);
      break;
    }
    case "foosball": {
      add(box(1.8, 0.28, 0.85, standard("#ad7b46")), 0, 0.7, 0);
      add(box(1.65, 0.02, 0.72, standard("#4caf6d")), 0, 0.85, 0);
      for (let i = 0; i < 4; i++) {
        const rod = add(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.2, 8), standard("#9aa3b2")), -0.6 + i * 0.4, 0.88, 0);
        rod.rotation.x = Math.PI / 2;
      }
      for (const [lx, lz] of [[-0.8, -0.35], [0.8, -0.35], [-0.8, 0.35], [0.8, 0.35]] as const) add(box(0.08, 0.58, 0.08, standard("#664628")), lx, 0.29, lz);
      break;
    }
  }
  return group.children.length ? group : null;
}

function buildTrees(scene: THREE.Scene) {
  const trunk = standard("#8a5a3a");
  const leaves = [standard("#4f9a55"), standard("#6db35f"), standard("#3f8f7a")];
  // The same trees as the 2D map, each standing on the middle of its two tiles.
  const spots = HQ_TREES.map(({ x, y }) => [x + 1, y + 1] as const);
  spots.forEach(([x, z], i) => {
    scene.add(box(0.25, 1.1, 0.25, trunk, x, 0.55, z));
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(0.95, 0), leaves[i % 3]!);
    crown.position.set(x, 1.85, z);
    crown.castShadow = true;
    scene.add(crown);
  });
}

// A canvas texture on a plane, for signs and name tags.
export function textPlane(
  text: string,
  { color, background, weight = 600, size = 44 }: { color: string; background: string | null; weight?: number; size?: number },
) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  const font = `${weight} ${size}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.font = font;
  const padX = background ? size * 0.55 : 4;
  canvas.width = Math.ceil(ctx.measureText(text).width + padX * 2);
  canvas.height = Math.ceil(size * 1.6);
  ctx.font = font;
  if (background) {
    ctx.fillStyle = background;
    const r = canvas.height / 2.4;
    ctx.beginPath();
    ctx.roundRect(0, 0, canvas.width, canvas.height, r);
    ctx.fill();
  }
  ctx.fillStyle = color;
  ctx.textBaseline = "middle";
  ctx.fillText(text, padX, canvas.height / 2 + size * 0.04);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const aspect = canvas.width / canvas.height;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(aspect, 1),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true }),
  );
  return mesh;
}

export function textSprite(text: string, options: { color: string; background: string | null; weight?: number; size?: number }) {
  const plane = textPlane(text, options);
  const material = plane.material as THREE.MeshBasicMaterial;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: material.map, transparent: true, depthWrite: false }));
  const geometry = plane.geometry as THREE.PlaneGeometry;
  sprite.scale.set(geometry.parameters.width, 1, 1);
  return sprite;
}

function buildRoomLabels(scene: THREE.Scene) {
  for (const room of getMapTemplate("clario-hq").chatRooms) {
    const label = textSprite(room.name, { color: "#ffffff", background: "rgba(18,21,28,0.72)", weight: 600, size: 40 });
    label.scale.multiplyScalar(0.55);
    label.position.set(room.bounds.x + room.bounds.width / 2, 2.7, room.bounds.y + room.bounds.height / 2);
    label.renderOrder = 10;
    scene.add(label);
  }
}

// Seats from the layout, so avatars sitting in 2D sit in 3D too.
export function seatMap() {
  const seats = new Map<string, Dir>();
  for (const item of HQ_ITEMS) {
    const spec = ITEM_SPECS[item.kind];
    if (!spec.seat) continue;
    for (let dx = 0; dx < spec.w; dx++) seats.set(`${item.x + dx},${item.y}`, item.dir ?? "down");
  }
  return seats;
}

export function disposeScene(scene: THREE.Scene) {
  scene.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const materials = mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : [];
    for (const material of materials) {
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) value.dispose();
      material.dispose();
    }
  });
}
