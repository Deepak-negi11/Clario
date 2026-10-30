import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { getChatRoomAtPosition, getMapTemplate, type Bike } from "@repo/shared";
import {
  HQ_CLAUDE_SEATS, HQ_COLS, HQ_FLOORS, HQ_ITEMS, HQ_PATH, HQ_ROWS, HQ_RUGS, HQ_TALL_WALLS, HQ_THIN_WALLS, HQ_TREES, HQ_WALL_DECOR,
  ITEM_SPECS, RUG_LOOKS, hqWallCells,
  type Dir, type Fabric, type FloorKind, type HqItem, type RugStyle, type ThinWallStyle, type WallStyle,
} from "../../lib/maps/clario-hq";
import { drawFloorPattern } from "../../lib/maps/floor-patterns";
import { makeBeanbag } from "./beanbag";
import { drawArcadeCarpet, makeArcadeCabinet, makeFoosballTable, makeNeonSign, makePingPongTable } from "./game-room-3d";
import { makeCoffeeTable, makeSideTable } from "./tables";
import { makeClaude3d } from "./claude-3d";
import { makeLaptop, type Laptop } from "./laptop";
import { makePlant } from "./plants";
import { grove } from "./trees";

// Builds Clario HQ in three.js from the same layout as the 2D map.
// One tile = one unit. x runs east, z runs south (the 2D map's y), y is up.

const MODEL_DIR = "/assets/3d/kenney/";
const MODELS = [
  "desk", "chairDesk", "computerScreen", "laptop", "table", "chair", "chairCushion",
  "loungeChair",
  "bookcaseOpen", "kitchenCabinet", "kitchenSink", "kitchenFridgeLarge", "kitchenCoffeeMachine",
  "kitchenMicrowave", "kitchenCabinetUpper", "stoolBar", "lampRoundFloor", "televisionModern",
  "cabinetTelevision", "sideTable", "trashcan",
] as const;
type ModelName = (typeof MODELS)[number];

// Realistic seating (CC0): Poly Haven's armchair and leather chair, and Quaternius's office chair.
// Each is optional: if one fails to load, that seat falls back to its Kenney model. Sofas are built
// in code (makeSofa). Licences: public/assets/3d/polyhaven/License.txt and public/assets/3d/quaternius/License.txt.
const SEATING = {
  armchair: "/assets/3d/polyhaven/modern_arm_chair_01/modern_arm_chair_01_1k.gltf",
  meetingChair: "/assets/3d/polyhaven/dining_chair_02/dining_chair_02_1k.gltf",
  officeChair: "/assets/3d/quaternius/OfficeChair.glb",
} as const;
type SeatingName = keyof typeof SEATING;

export type ModelSet = Record<ModelName, THREE.Group> & { seating: Partial<Record<SeatingName, THREE.Group>> };

// Inside walls stop below head height and cubicle partitions at desk-panel height, so they mark
// the rooms without hiding the people in them; only the building's back wall stands tall.
export const WALL_HEIGHT = 1.3;
const BACK_WALL_HEIGHT = 2.1;
const PARTITION_HEIGHT = 0.95;
const WALL_THICKNESS = 0.3;

function tallWallHeight(style: WallStyle | undefined) {
  return style === "exterior" ? BACK_WALL_HEIGHT : style === "cubicle" ? PARTITION_HEIGHT : WALL_HEIGHT;
}

const THIN_WALL_COLORS: Record<ThinWallStyle, string> = { cubicle: "#7d7eb6", partition: "#5f6f6a" };

const FABRIC_COLORS: Record<Fabric, { mid: string; dark: string }> = {
  navy: { mid: "#3a4f8a", dark: "#27355f" },
  coral: { mid: "#d4675a", dark: "#a8473c" },
  teal: { mid: "#2c8c84", dark: "#1d6862" },
  mustard: { mid: "#d29c33", dark: "#a8761c" },
  sage: { mid: "#76946d", dark: "#56724f" },
  grey: { mid: "#6c7282", dark: "#4d5260" },
  blue: { mid: "#5f92e2", dark: "#4672c6" },
  purple: { mid: "#a07ae2", dark: "#7f5ac4" },
  pink: { mid: "#e877aa", dark: "#c9568e" },
  white: { mid: "#dcdfe6", dark: "#c0c5cf" },
  leather: { mid: "#ad6f46", dark: "#915838" },
};

export const WALL_COLORS: Record<WallStyle, { face: string; wainscot: string }> = {
  exterior: { face: "#eee9df", wainscot: "#d8cab0" },
  corridor: { face: "#e4e8ef", wainscot: "#c9d0db" },
  library: { face: "#dfe7d6", wainscot: "#9b7a55" },
  game: { face: "#2b4b91", wainscot: "#1f3a75" },
  cubicle: { face: "#7d7eb6", wainscot: "#6d6ea6" },
};
export const CAP_COLOR = "#4a4f5e";
export const GRASS_COLOR = "#8cc56f";

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
// `stretch` lets it widen a little past its own proportions (a longer sofa still looks right), and
// `depth` makes a deep seat shallower so a seated person's back is nearer its backrest.
function fitSeat(source: THREE.Object3D, w: number, h: number, d: number, stretch = 1, depth = 1) {
  const model = source.clone(true);
  const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
  const scale = Math.min(h / (size.y || 1), d / (size.z || 1), w / (size.x || 1));
  model.scale.set(Math.min(w / (size.x || 1), scale * stretch), scale, scale * depth);
  const bounds = new THREE.Box3().setFromObject(model);
  const center = bounds.getCenter(new THREE.Vector3());
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= bounds.min.y;
  const holder = new THREE.Group();
  holder.add(model);
  return holder;
}

// Seated people keep one pose on every seat (people.ts): their back about 0.15 behind the middle of
// the tile, knees 0.28 in front of it, shins straight down. A seat whose back leans in over the hips, or
// whose front reaches past the knees and would hide the shins, stands this much further back.
function setBack(seat: THREE.Object3D, distance: number) {
  seat.children[0]!.position.z -= distance;
  return seat;
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

export const standard = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...extra });

export function box(w: number, h: number, d: number, material: THREE.Material | THREE.Material[], x = 0, y = 0, z = 0) {
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

// Poly Haven's sofa and armchair are dark leather, painted into one texture with the sofa's wooden
// frame. On a custom map their owner picks a fabric, so this repaints the leather in that colour
// (keeping its light and shade) and leaves the warm, saturated wood alone. Only the materials whose
// name includes `part` change; each repainted material is made once per fabric and shared.
const upholstered = new Map<string, THREE.Material>();
function upholster(object: THREE.Object3D, fabric: Fabric | undefined, part = "") {
  if (!fabric) return object;
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    const swap = (material: THREE.Material) => {
      const surface = material as THREE.MeshStandardMaterial;
      if (!surface.map?.image || !surface.name.includes(part)) return material;
      const key = `${surface.uuid}:${fabric}`;
      let copy = upholstered.get(key);
      if (!copy) {
        const next = surface.clone();
        next.map = repaintLeather(surface.map, FABRIC_COLORS[fabric].mid);
        upholstered.set(key, (copy = next));
      }
      return copy;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
  });
  return object;
}

function repaintLeather(source: THREE.Texture, color: string) {
  const image = source.image as CanvasImageSource & { width: number; height: number };
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d")!;
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = pixels.data;
  const isWood = (i: number) => {
    const max = Math.max(data[i]!, data[i + 1]!, data[i + 2]!);
    const min = Math.min(data[i]!, data[i + 1]!, data[i + 2]!);
    return max > 30 && (max - min) / max > 0.45 && data[i]! === max;
  };
  const light = (i: number) => (0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!) / 255;
  // The leather's average lightness becomes the fabric colour itself; lighter folds go lighter.
  let sum = 0;
  let count = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (isWood(i) || light(i) < 0.02) continue;
    sum += light(i);
    count++;
  }
  const average = count ? sum / count : 1;
  const fabric = new THREE.Color(color);
  const [r, g, b] = [fabric.r, fabric.g, fabric.b].map((c) => Math.pow(c, 1 / 2.2) * 255) as [number, number, number];
  for (let i = 0; i < data.length; i += 4) {
    if (isWood(i)) continue;
    const shade = Math.min(1.6, light(i) / average);
    data[i] = Math.min(255, r * shade);
    data[i + 1] = Math.min(255, g * shade);
    data[i + 2] = Math.min(255, b * shade);
  }
  context.putImageData(pixels, 0, 0);
  // A cloned texture shares its source image, so the copy gets a source of its own.
  const texture = source.clone();
  texture.source = new THREE.TextureSource(canvas);
  texture.needsUpdate = true;
  return texture;
}

const ANGLE: Record<Dir, number> = { down: 0, right: Math.PI / 2, up: Math.PI, left: -Math.PI / 2 };

// ---------------------------------------------------------------------------

// `scene` is the scene, or a group in it that holds just the office.
export function buildOffice(scene: THREE.Object3D, models: ModelSet) {
  const walls = hqWallCells();
  const centerX = HQ_COLS / 2;
  const centerZ = HQ_ROWS / 2;

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(HQ_COLS + 60, HQ_ROWS + 60), standard(GRASS_COLOR));
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
  // Claude at work in each Open Desks cubicle chair, as on the 2D map.
  HQ_CLAUDE_SEATS.forEach(({ x, y }, index) => {
    const claude = makeClaude3d(index * 1.37);
    claude.position.set(x + 0.5, 0, y + 0.5);
    scene.add(claude);
  });
  buildTrees(scene);
  return { roomLabels: buildRoomLabels(scene) };
}

// Small repeating textures so floors read as wood, carpet or tile, not flat colour. Wood is
// drawn at a higher resolution with grain, since it covers most of the floor up close.
const DETAILED_FLOORS = new Set<FloorKind>(["wood", "herringbone", "arcade"]);

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

export function floorTexture(kind: FloorKind) {
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
      drawArcadeCarpet(ctx, canvas.width, rand);
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
    case "zigzag":
      fill("#a9b0b6", 0, 0, 64, 64);
      for (let band = 0; band < 64; band += 8) {
        for (let x = 0; x < 64; x++) fill("#99a0a7", x, (band + Math.abs((x % 8) - 4)) % 64, 1, 2);
      }
      break;
    case "porcelain":
      for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++) {
        fill((x + y) % 2 ? "#dfe4ee" : "#e5e9f2", x * 16, y * 16, 16, 16);
        fill("#bcc4d1", x * 16, y * 16 + 15, 16, 1); fill("#bcc4d1", x * 16 + 15, y * 16, 1, 16);
      }
      break;
    case "office":
      for (let x = 0; x < 2; x++) for (let y = 0; y < 2; y++) fill((x + y) % 2 ? "#c0c7d2" : "#c7cdd8", x * 32, y * 32, 32, 32);
      fill("#b2b9c6", 0, 31, 64, 1); fill("#b2b9c6", 31, 0, 1, 64); fill("#b2b9c6", 0, 63, 64, 1); fill("#b2b9c6", 63, 0, 1, 64);
      break;
    case "maple":
    case "crosstile":
    case "damask":
    case "brick":
    case "lavender":
      // Drawn by the same code as the 2D map, so both views match.
      drawFloorPattern(kind, (color, x, y, w, h, alpha = 1) => {
        ctx.globalAlpha = alpha;
        fill(`#${color.toString(16).padStart(6, "0")}`, x, y, w, h);
        ctx.globalAlpha = 1;
      });
      break;
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  if (!DETAILED_FLOORS.has(kind)) texture.magFilter = THREE.NearestFilter;
  return texture;
}

function buildFloors(scene: THREE.Object3D, walls: Set<string>) {
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
  // A dark play mat under the ping-pong table, not a bright rug.
  game: { border: "#262c4d", fill: "#2f3760" },
  stage: { border: "#664628", fill: "#b98451" },
  grey: { border: "#7c8486", fill: "#a3abae" },
};

function buildRugs(scene: THREE.Object3D) {
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

function buildWalls(scene: THREE.Object3D, models: ModelSet) {
  const capMaterial = standard(CAP_COLOR);
  const tallRows = new Map<string, number>();
  for (const wall of HQ_TALL_WALLS) {
    const height = tallWallHeight(wall.style);
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

  const plain = standard("#5a6070");
  const wallCells = hqWallCells();
  for (const wall of HQ_THIN_WALLS) {
    const vertical = wall.x1 === wall.x2;
    const thin = wall.style ? standard(THIN_WALL_COLORS[wall.style]) : plain;
    if (vertical) {
      // One panel per run between gaps: a gap is an opening you can walk through on the 2D map,
      // so it stays open here too.
      const height = wall.style ? PARTITION_HEIGHT : WALL_HEIGHT;
      const runs: [number, number][] = [];
      let start = wall.y1;
      for (let y = wall.y1; y <= wall.y2 + 1; y++) {
        const gap = y > wall.y2 || wall.gaps?.some(([a, b]) => y >= a && y <= b);
        if (!gap) continue;
        if (y > start) runs.push([start, y - 1]);
        start = y + 1;
      }
      for (const [y1, y2] of runs) {
        let z1 = y1;
        let z2 = y2 + 1;
        const above = tallRows.get(`${wall.x1},${y1 - 1}`);
        if (above !== undefined) z1 = tallWallZ(above);
        const below = tallRows.get(`${wall.x1},${y2 + 1}`);
        if (below !== undefined) z2 = tallWallZ(below);
        if (y2 === 32) z2 = 32.6;
        scene.add(box(0.2, height, z2 - z1, [thin, thin, capMaterial, thin, thin, thin], wall.x1 + 0.5, height / 2, (z1 + z2) / 2));
      }
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
        // An end reaches half a tile further only to meet the wall beside it: past an open tile
        // (a cubicle's way in) it would close the opening.
        const left = a === wall.x1 && wallCells.has(`${a - 1},${wall.y1}`) ? a - 0.5 : a;
        const right = b - 1 === wall.x2 && wallCells.has(`${b},${wall.y1}`) ? b + 0.5 : b;
        // A cubicle partition along the front stands as tall as the dividers.
        const height = wall.style ? PARTITION_HEIGHT : 0.45;
        scene.add(box(right - left, height, 0.2, [thin, thin, capMaterial, thin, thin, thin], (left + right) / 2, height / 2, wall.y1 + 0.5));
      }
    }
  }

  for (const decor of HQ_WALL_DECOR) {
    const cx = decor.x + decor.w / 2;
    // The wall it hangs on: several runs share a row, each with its own style.
    const wall = HQ_TALL_WALLS.find((w) => w.y === decor.wallY && cx >= w.x1 && cx <= w.x2 + 1);
    const faceZ = tallWallZ(decor.wallY) + WALL_THICKNESS / 2;
    const height = tallWallHeight(wall?.style);
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
        // PLAY glows pink over the Game Room, HACK cyan over the Hack Space.
        const hack = decor.variant === 1;
        const sign = makeNeonSign(hack ? "HACK" : "PLAY", hack ? "#4fd8ff" : "#ff4fd8", Math.min(decor.w * 0.92, 1.5));
        sign.position.set(cx, mid + 0.1, faceZ);
        scene.add(sign);
        break;
      }
    }
  }
}

// A desk you can sit at (in `userData.desk` of its object): its laptop, which opens while someone
// is in the seat in front of it (office-3d.tsx).
export type DeskSpot = { laptop: Laptop; seat: { x: number; y: number } };
// An office chair (in `userData.chair`): the part that turns, and the angle that faces its desk.
export type SwivelChair = { holder: THREE.Object3D; tile: { x: number; y: number }; angle: number };

// The 3D object for one item, centred on its footprint (ITEM_SPECS) at the origin. `place` says
// which map it is on: Clario HQ, or a map someone built ("custom").
export function buildItem(item: HqItem, models: ModelSet, place: "hq" | "custom" = "hq"): THREE.Object3D | null {
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
      // A laptop on the side the chair is (the 2D map's screen side), shut until someone sits there.
      const left = item.kind === "desk-l";
      const laptop = makeLaptop();
      add(laptop.object, left ? -0.45 : 0.45, 0.62, -0.02);
      group.userData.desk = { laptop, seat: { x: item.x + (left ? 0 : 1), y: item.y + 1 } } satisfies DeskSpot;
      break;
    }
    // Seats are sized so their cushion is where a seated person's hips are (people.ts), about 0.42
    // above the floor: on a taller seat people sink into it, on a lower one they float over it.
    case "task-chair": {
      const office = models.seating.officeChair;
      const holder = add(office ? fitSeat(office, 0.68, 1.0, 0.68) : fit(models.chairDesk, 0.62, 1.09, 0.62));
      holder.rotation.y = ANGLE[dir];
      group.userData.chair = { holder, tile: { x: item.x, y: item.y }, angle: ANGLE[dir] } satisfies SwivelChair;
      break;
    }
    case "exec-chair":
      add(makeExecChair(FABRIC_COLORS[item.fabric ?? "leather"])).rotation.y = ANGLE[dir];
      break;
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
      // since 28 detailed chairs would cost more than they add. On a custom map a chair is leather
      // unless its owner picked a fabric for it.
      const leather = models.seating.meetingChair;
      const inMeetingRoom = place === "custom"
        ? !item.fabric
        : getChatRoomAtPosition("clario-hq", item)?.id.startsWith("hq-meeting");
      add(leather && inMeetingRoom
        ? setBack(fitSeat(leather, 0.6, 0.915, 0.62), 0.07)
        : recolor(fit(models.chairCushion, 0.58, 0.8, 0.58), item.fabric)).rotation.y = ANGLE[dir];
      break;
    }
    case "theatre-seat":
      add(makeTheatreSeat()).rotation.y = ANGLE[dir];
      break;
    case "sofa":
      // A modern three-seater in the fabric the 2D map shows (green, tan leather, navy...).
      add(makeSofa(2.9, 3, item.fabric)).rotation.y = ANGLE[dir];
      break;
    case "loveseat":
      add(makeSofa(1.95, 2, item.fabric)).rotation.y = ANGLE[dir];
      break;
    case "armchair": {
      const armchair = models.seating.armchair;
      add(armchair
        ? setBack(upholster(fitSeat(armchair, 0.92, 0.81, 0.95, 1, 0.8), item.fabric, "pillow"), 0.07)
        : setBack(recolor(fit(models.loungeChair, 0.9, 0.84, 0.65), item.fabric), 0.11)).rotation.y = ANGLE[dir];
      break;
    }
    case "beanbag": {
      // A slouched lounger (beanbag.ts) whose seat dips to sitting height. Set back a little like
      // the seats above, so the sitter leans into its raised back and their legs hang over the front.
      add(makeBeanbag(FABRIC_COLORS[item.fabric ?? "coral"].mid), -Math.sin(ANGLE[dir]) * 0.08, 0, -Math.cos(ANGLE[dir]) * 0.08)
        .rotation.y = ANGLE[dir];
      break;
    }
    // Varnished oak, with what the 2D map shows on them (tables.ts).
    case "coffee-table":
      add(makeCoffeeTable());
      break;
    case "side-table":
      add(makeSideTable((item.variant ?? 0) % 3));
      break;
    case "tv-console":
      add(fit(models.cabinetTelevision, 2.6, 0.48, 0.6));
      // Tagged so the Lounge TV's video plays on its screen (components/tv/tv-screen-3d.ts).
      add(fit(models.televisionModern, 2.1, 1.0, 0.2), 0, 0.48, -0.1).userData.tvScreen = true;
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
      add(makePlant("snake", 1.35, 0.75, variantAt(item)));
      break;
    case "plant-small":
      add(makePlant("leafy", 0.6, 0.5, variantAt(item)));
      break;
    case "plant-tree":
      add(makePlant("fig", 2.1, 0.85, variantAt(item)));
      break;
    case "plant-fern":
      add(makePlant("leafy", 0.75, 0.6, variantAt(item)));
      break;
    case "plant-tall":
      add(makePlant("snake", 1.6, 0.6, variantAt(item)));
      break;
    case "rug":
    case "rug-round":
      add(makeRug(item.kind === "rug-round" ? null : item.variant ?? 0));
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
    case "round-table":
    case "coffee-bar": {
      const radius = item.kind === "coffee-bar" ? 0.75 : 0.42;
      const wood = standard("#c8936a");
      add(new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.05, 32), wood), 0, 0.72, 0).castShadow = true;
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.7, 12), standard("#5a3b26")), 0, 0.35, 0);
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.28, 0.03, 24), standard("#5a3b26")), 0, 0.015, 0);
      if (item.kind === "coffee-bar") add(fit(models.kitchenCoffeeMachine, 0.36, 0.48, 0.36), -0.2, 0.745, -0.1);
      break;
    }
    case "desk-white": {
      add(box(1.9, 0.05, 0.8, standard("#f4f6f9")), 0, 0.72, -0.05);
      add(box(0.45, 0.7, 0.7, standard("#dfe3ea")), 0.65, 0.35, -0.05);
      add(box(0.05, 0.7, 0.7, standard("#8a919e")), -0.9, 0.35, -0.05);
      // The laptop faces +z (down the map). Variant 0 faces a chair below the desk, variant 1 a
      // chair above it; it stays shut until someone sits there.
      const laptop = makeLaptop();
      add(laptop.object, -0.35, 0.745, -0.05).rotation.y = item.variant === 1 ? Math.PI : 0;
      group.userData.desk = { laptop, seat: { x: item.x, y: item.y + (item.variant === 1 ? -1 : 1) } } satisfies DeskSpot;
      break;
    }
    case "filing-cabinet":
      add(box(0.7, 1.1, 0.6, standard(item.variant === 1 ? "#b3bac6" : "#4a80d2")), 0, 0.55, -0.1);
      break;
    case "meeting-table-md":
      add(fit(models.table, 2.7, 0.62, 1.7));
      break;
    case "whiteboard": {
      const frame = standard("#9aa2af");
      add(box(1.7, 1.0, 0.04, standard("#fbfcfd")), 0, 1.3, -0.2);
      for (const x of [-0.87, 0.87]) add(box(0.05, 1.8, 0.05, frame), x, 0.9, -0.2);
      add(box(1.6, 0.04, 0.08, frame), 0, 0.78, -0.18);
      break;
    }
    case "flip-chart":
      add(box(0.7, 0.9, 0.04, standard("#fdfdfb")), 0, 1.25, 0);
      for (const x of [-0.3, 0.3]) add(box(0.04, 1.7, 0.04, standard("#646b78")), x, 0.85, 0.02);
      break;
    case "cube-shelf":
      add(fit(models.bookcaseOpen, 1.9, 1.3, 0.5), 0, 0, -0.2);
      break;
    case "cafe-chair":
      add(fit(models.chair, 0.55, 0.85, 0.55)).rotation.y = ANGLE[dir];
      break;
    case "reception-desk": {
      add(box(3.8, 0.95, 1.1, standard("#f7f5f0")), 0, 0.475, 0.2);
      add(box(3.9, 0.08, 1.2, standard("#e3bc87")), 0, 0.99, 0.2);
      add(box(0.5, 0.5, 0.03, standard("#3a6ee8")), 0, 0.5, 0.77);
      add(fit(models.computerScreen, 0.62, 0.42, 0.16), 0, 1.03, -0.15).rotation.y = Math.PI;
      add(makePlant("leafy", 0.45, 0.4, variantAt(item)), 1.5, 1.03, 0);
      break;
    }
    case "pingpong":
      // Blue in the Game Room, green (variant 1) in Open Desks' lounge, as on the 2D map.
      add(makePingPongTable(item.variant === 1));
      break;
    case "arcade":
      // Blue, teal or red, as on the 2D map (the variant, or else they take turns along the row).
      add(makeArcadeCabinet(item.variant ?? Math.round(item.x) % 3), 0, 0, -0.04);
      break;
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
    case "foosball":
      add(makeFoosballTable());
      break;
    // Built from simple shapes (the make* functions further down). Tall ones stand back against the wall.
    case "wardrobe":
      add(makeWardrobe(), 0, 0, -0.2);
      break;
    case "globe":
      add(makeGlobe());
      break;
    case "coat-rack":
      add(makeCoatRack(variantAt(item)));
      break;
    case "aquarium":
      add(makeAquarium(), 0, 0, -0.1);
      break;
    case "vending-machine":
      add(makeVendingMachine(), 0, 0, -0.12);
      break;
    case "traffic-cone":
      add(makeTrafficCone());
      break;
    // Outdoor pieces and buildings, for maps people build. Colours vary with where they stand,
    // so a street of houses doesn't look stamped out.
    case "tree":
      add(makeTree(variantAt(item)));
      break;
    case "bush":
      add(makeBush(variantAt(item)));
      break;
    case "bush-small":
      add(makeBush(variantAt(item))).scale.setScalar(0.7);
      break;
    case "flower":
      add(makeFlowers(item.variant ?? 0));
      break;
    case "rock":
      add(makeRock(item.variant ?? 0));
      break;
    case "pond":
      add(makePond());
      break;
    case "bench":
      add(makeBench()).rotation.y = ANGLE[dir];
      break;
    case "lamp-post":
      add(makeLampPost());
      break;
    case "fountain":
      add(makeFountain());
      break;
    case "bike-rack":
      add(makeBikeRack());
      break;
    case "house":
      add(makeHouse(variantAt(item)));
      break;
    case "shop":
      add(makeShop(variantAt(item)));
      break;
    case "cafe":
      add(makeCafe(models));
      break;
    case "office-block":
      add(makeOfficeBlock(variantAt(item)));
      break;
  }
  return group.children.length ? group : null;
}

// ---------------------------------------------------------------------------
// Outdoor pieces and buildings. Each is centred on its footprint and stays inside it. Buildings
// face +z (down the map): door, shop front and sign are on that side, so they face the camera.

// A number that changes unpredictably from tile to tile, for picking colours.
function variantAt({ x, y }: { x: number; y: number }) {
  let hash = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
  return (hash ^ (hash >>> 16)) >>> 0;
}

type BoxPart = readonly [w: number, h: number, d: number, x: number, y: number, z: number];

// Many boxes in one material, merged into one mesh, so a building costs a few draw calls.
function boxes(parts: readonly BoxPart[], material: THREE.Material) {
  const geometries = parts.map(([w, h, d, x, y, z]) => new THREE.BoxGeometry(w, h, d).translate(x, y, z));
  const mesh = new THREE.Mesh(mergeGeometries(geometries), material);
  for (const geometry of geometries) geometry.dispose();
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// Adds `object` to `parent` and returns the object (Object3D.add returns the parent).
function place<T extends THREE.Object3D>(parent: THREE.Object3D, object: T): T {
  parent.add(object);
  return object;
}

function solid(geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// A prism lying along x, `length` long and centred on x = 0. `outline` is its cross-section as
// [z, y] points.
function prism(outline: readonly (readonly [number, number])[], length: number, material: THREE.Material) {
  const shape = new THREE.Shape(outline.map(([z, y]) => new THREE.Vector2(-z, y)));
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: length, bevelEnabled: false });
  // Extruded along z; turning it a quarter puts it along x and the outline's z back where it was.
  geometry.translate(0, 0, -length / 2).rotateY(Math.PI / 2);
  return solid(geometry, material);
}

// A pitched roof with its ridge along x, sitting on walls `wallDepth` deep and `wallWidth` wide:
// a sloped slab `span` from eave to eave rising `rise`, over a wall gable at each end.
function gableRoof(width: number, span: number, rise: number, wallWidth: number, wallDepth: number, roof: THREE.Material, wall: THREE.Material) {
  const half = span / 2;
  const slope = rise / half;
  const thickness = 0.16;
  const inner = (rise - thickness) / slope;
  const group = new THREE.Group();
  group.add(prism([[-half, 0], [0, rise], [half, 0], [inner, 0], [0, rise - thickness], [-inner, 0]], width, roof));
  const gable = wallDepth / 2;
  const eave = rise - thickness - slope * gable;
  group.add(prism([[-gable, 0], [gable, 0], [gable, eave], [0, rise - thickness], [-gable, eave]], wallWidth, wall));
  return group;
}

// A flat roof: a deck with a low parapet round the edge, on a w x d building `height` tall.
function flatRoof(w: number, d: number, height: number, rim: string, deck: string) {
  const group = new THREE.Group();
  group.add(box(w, 0.08, d, standard(deck), 0, height + 0.04, 0));
  const t = 0.14;
  const h = 0.3;
  const y = height + h / 2;
  group.add(boxes([
    [w + 0.08, h, t, 0, y, d / 2 - t / 2 + 0.04], [w + 0.08, h, t, 0, y, -d / 2 + t / 2 - 0.04],
    [t, h, d, w / 2 - t / 2 + 0.04, y, 0], [t, h, d, -w / 2 + t / 2 - 0.04, y, 0],
  ], standard(rim)));
  return group;
}

// Windows set into a building's walls, (x, y, z) being the middle of each on the wall's face. A
// window on a front or back wall faces "z", one on a side wall faces "x". Each has a frame and
// glass, and with `bars` a cross of glazing bars.
type WindowSpot = readonly [x: number, y: number, z: number, w: number, h: number, faces: "x" | "z"];
function windows(spots: readonly WindowSpot[], frame: THREE.Material, glass: THREE.Material, bars = true) {
  const frames: BoxPart[] = [];
  const panes: BoxPart[] = [];
  for (const [x, y, z, w, h, faces] of spots) {
    const part = (across: number, height: number, depth: number): BoxPart =>
      faces === "z" ? [across, height, depth, x, y, z] : [depth, height, across, x, y, z];
    frames.push(part(w + 0.14, h + 0.14, 0.06));
    panes.push(part(w, h, 0.08));
    if (bars) frames.push(part(0.05, h, 0.1), part(w, 0.05, 0.1));
  }
  const group = new THREE.Group();
  group.add(boxes(frames, frame), boxes(panes, glass));
  return group;
}

const windowGlass = () => standard("#9fd3ef", { emissive: "#6fb5e0", emissiveIntensity: 0.25, roughness: 0.15 });

// A striped awning over a shop front: `width` across, reaching `depth` out from the wall face at
// `z` and dropping `drop` from `y` at the wall, with a short valance along its front edge.
function awning(width: number, depth: number, y: number, drop: number, z: number, colors: readonly [string, string], stripes = 8) {
  const length = Math.hypot(depth, drop);
  const stripe = width / stripes;
  const parts: [BoxPart[], BoxPart[]] = [[], []];
  for (let i = 0; i < stripes; i++) {
    const x = -width / 2 + stripe * (i + 0.5);
    parts[i % 2]!.push([stripe, 0.04, length, x, 0, 0], [stripe, 0.16, 0.03, x, -0.08, length / 2]);
  }
  const group = new THREE.Group();
  group.add(boxes(parts[0], standard(colors[0], { roughness: 0.9 })), boxes(parts[1], standard(colors[1], { roughness: 0.9 })));
  group.rotation.x = Math.atan2(drop, depth);
  group.position.set(0, y - drop / 2, z + depth / 2);
  return group;
}

// A board with a word painted on it, facing +z.
function signBoard(text: string, width: number, board: string, ink: string) {
  const group = new THREE.Group();
  group.add(box(width, 0.44, 0.08, standard(board)));
  const label = textPlane(text, { color: ink, background: null, weight: 800, size: 64 });
  label.scale.multiplyScalar(0.32);
  label.position.z = 0.045;
  group.add(label);
  return group;
}

function makeTree(variant: number) {
  // The same trees as Clario HQ's (buildTrees, trees.ts), standing on the middle of its two tiles.
  return grove([{ x: 0, z: 0, seed: variant }]);
}

function makeBush(variant: number) {
  const group = new THREE.Group();
  const leaf = standard(["#5aa65a", "#4f9a55", "#6db35f"][variant % 3]!);
  for (const [r, x, y, z] of [[0.34, -0.08, 0.3, 0.02], [0.27, 0.2, 0.26, -0.12], [0.24, 0.06, 0.22, 0.22]] as const) {
    place(group, solid(new THREE.IcosahedronGeometry(r, 0), leaf, x, y, z)).rotation.y = variant + r * 10;
  }
  return group;
}

// A rug (4 x 3) lying on the floor in one of RUG_LOOKS, as high as Clario HQ's (buildRugs) so it
// shows over the floor; `look` null is the round one.
function makeRug(look: number | null) {
  const group = new THREE.Group();
  const { border, fill } = RUG_COLORS[look === null ? "round" : RUG_LOOKS[look % RUG_LOOKS.length]!];
  const flat = (geometry: THREE.BufferGeometry, color: string, y: number) => {
    const mesh = place(group, new THREE.Mesh(geometry, standard(color, { roughness: 0.95 })));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = y;
    mesh.receiveShadow = true;
    return mesh;
  };
  if (look === null) {
    flat(new THREE.CircleGeometry(1.5, 40), border, 0.03).scale.set(1.25, 1, 1);
    flat(new THREE.CircleGeometry(1.36, 40), fill, 0.032).scale.set(1.25, 1, 1);
  } else {
    flat(new THREE.PlaneGeometry(3.9, 2.9), border, 0.03);
    flat(new THREE.PlaneGeometry(3.6, 2.6), fill, 0.032);
  }
  return group;
}

// A clump of flowers on short stems, red, yellow or blue like the 2D map's.
function makeFlowers(look: number) {
  const group = new THREE.Group();
  const stem = standard("#4f9a55");
  const petal = standard(["#e2524a", "#f2c14e", "#5f92e2"][look % 3]!);
  for (const [x, z, h] of [[-0.12, -0.05, 0.22], [0.1, 0.08, 0.18], [0.02, -0.14, 0.26], [0.16, -0.1, 0.2], [-0.1, 0.12, 0.17]] as const) {
    group.add(solid(new THREE.CylinderGeometry(0.012, 0.012, h, 5), stem, x, h / 2, z));
    group.add(solid(new THREE.IcosahedronGeometry(0.05, 0), petal, x, h, z));
  }
  return group;
}

// A grey boulder, small or medium.
function makeRock(look: number) {
  const size = look === 1 ? 0.42 : 0.28;
  const rock = solid(new THREE.DodecahedronGeometry(size, 0), standard("#9a9d9f", { flatShading: true, roughness: 0.9 }), 0, size * 0.55, 0);
  rock.scale.set(1.2, 0.7, 1);
  rock.rotation.y = look + 0.6;
  return rock;
}

// A pond (5 x 4): still water in a ring of stones.
function makePond() {
  const group = new THREE.Group();
  const water = place(group, solid(new THREE.CircleGeometry(1.75, 32), standard("#5b8fb5", { roughness: 0.1, metalness: 0.1 }), 0, 0.02, 0));
  water.rotation.x = -Math.PI / 2;
  water.scale.set(1.3, 1, 1);
  const stone = standard("#b9b4a8", { flatShading: true });
  for (let i = 0; i < 18; i++) {
    const angle = (i / 18) * Math.PI * 2;
    group.add(solid(new THREE.DodecahedronGeometry(0.16 + (i % 3) * 0.03, 0), stone, Math.cos(angle) * 2.3, 0.08, Math.sin(angle) * 1.78));
  }
  return group;
}

// A park bench for two (2 x 1), facing +z. The seat is at hip height for a seated person (people.ts)
// and the backrest just behind where their back is.
function makeBench() {
  const group = new THREE.Group();
  const iron = standard("#2f3440", { roughness: 0.5, metalness: 0.5 });
  const wood = standard("#b07a48", { roughness: 0.7 });
  const frame: BoxPart[] = [];
  for (const x of [-0.82, 0.82]) {
    frame.push([0.07, 0.4, 0.07, x, 0.2, 0.14], [0.07, 0.4, 0.07, x, 0.2, -0.2], [0.07, 0.06, 0.42, x, 0.6, -0.03], [0.07, 0.2, 0.07, x, 0.5, 0.14]);
  }
  group.add(boxes(frame, iron));
  // The back's posts lean back a little, like the slats on them.
  const back = new THREE.Group();
  back.add(boxes([[0.07, 0.55, 0.06, -0.82, 0.27, 0], [0.07, 0.55, 0.06, 0.82, 0.27, 0]], iron));
  back.add(boxes([[1.84, 0.1, 0.04, 0, 0.3, 0.04], [1.84, 0.1, 0.04, 0, 0.47, 0.04]], wood));
  back.position.set(0, 0.4, -0.25);
  back.rotation.x = -0.16;
  group.add(back);
  group.add(boxes([[1.84, 0.05, 0.12, 0, 0.42, -0.17], [1.84, 0.05, 0.12, 0, 0.42, -0.03], [1.84, 0.05, 0.12, 0, 0.42, 0.11]], wood));
  return group;
}

function makeLampPost() {
  const group = new THREE.Group();
  const iron = standard("#2f3440", { roughness: 0.5, metalness: 0.5 });
  group.add(solid(new THREE.CylinderGeometry(0.13, 0.17, 0.24, 12), iron, 0, 0.12, 0));
  group.add(solid(new THREE.CylinderGeometry(0.045, 0.06, 2.3, 10), iron, 0, 1.39, 0));
  group.add(box(0.3, 0.06, 0.3, iron, 0, 2.56, 0));
  group.add(box(0.24, 0.34, 0.24, standard("#fff4d6", { emissive: "#ffd27a", emissiveIntensity: 1.3 }), 0, 2.76, 0));
  place(group, solid(new THREE.ConeGeometry(0.25, 0.2, 4), iron, 0, 3.03, 0)).rotation.y = Math.PI / 4;
  group.add(solid(new THREE.SphereGeometry(0.045, 8, 6), iron, 0, 3.15, 0));
  return group;
}

// A round stone fountain (3 x 3): a basin, a column with a bowl, and water spilling over it.
function makeFountain() {
  const group = new THREE.Group();
  const stone = standard("#d9d3c7", { flatShading: true });
  const water = standard("#69b7e3", { emissive: "#2f7fb0", emissiveIntensity: 0.18, roughness: 0.08, metalness: 0.1 });
  const spray = (opacity: number) => standard("#d8f1ff", { transparent: true, opacity, roughness: 0.1, depthWrite: false, side: THREE.DoubleSide });
  const lathe = (points: [number, number][], segments = 20) => new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), segments);
  group.add(solid(lathe([[0, 0], [1.45, 0], [1.48, 0.12], [1.45, 0.45], [1.3, 0.45], [1.25, 0.2], [0, 0.2]]), stone));
  const pool = place(group, solid(new THREE.CircleGeometry(1.27, 24), water, 0, 0.36, 0));
  pool.rotation.x = -Math.PI / 2;
  group.add(solid(new THREE.CylinderGeometry(0.14, 0.2, 0.9, 10), stone, 0, 0.65, 0));
  group.add(solid(lathe([[0, 0], [0.55, 0.05], [0.6, 0.2], [0.52, 0.22], [0, 0.12]], 16), stone, 0, 1.05, 0));
  const top = place(group, solid(new THREE.CircleGeometry(0.5, 16), water, 0, 1.25, 0));
  top.rotation.x = -Math.PI / 2;
  group.add(solid(new THREE.CylinderGeometry(0.035, 0.06, 0.4, 8), spray(0.75), 0, 1.45, 0));
  group.add(solid(new THREE.IcosahedronGeometry(0.15, 0), spray(0.6), 0, 1.68, 0));
  const curtain = place(group, solid(new THREE.CylinderGeometry(0.6, 0.66, 0.88, 20, 1, true), spray(0.35), 0, 0.81, 0));
  curtain.castShadow = false;
  return group;
}

// A house (5 x 4): plastered walls on a plinth, a tiled gable roof with a chimney, a front door
// under a little porch roof, and windows with flower boxes.
function makeHouse(variant: number) {
  const group = new THREE.Group();
  const walls = standard(["#f2e6d3", "#e8d4c0", "#dde6ee", "#e9e3c6"][variant % 4]!);
  const roof = standard(["#b5523b", "#5d6678", "#8a5a3a"][(variant >>> 3) % 3]!, { roughness: 0.75 });
  const trim = standard("#f7f5f0");
  const width = 4.4;
  const depth = 3.0;
  const height = 2.1;
  const middle = -0.25;
  const front = middle + depth / 2;
  group.add(box(width + 0.12, 0.2, depth + 0.12, standard("#b9ad9a"), 0, 0.1, middle));
  group.add(box(width, height, depth, walls, 0, height / 2, middle));
  place(group, gableRoof(width + 0.4, depth + 0.44, 1.15, width, depth, roof, walls)).position.set(0, height, middle);
  // Chimney, through the back slope.
  group.add(box(0.36, 1.0, 0.36, standard("#9c5a45"), 1.3, 2.9, middle - 0.6));
  group.add(box(0.46, 0.08, 0.46, standard(CAP_COLOR), 1.3, 3.44, middle - 0.6));
  // Front door with a porch roof and a step.
  group.add(box(0.92, 1.5, 0.06, trim, 0, 0.95, front));
  group.add(box(0.76, 1.38, 0.08, standard(["#3a6ee8", "#2c8c84", "#a8473c", "#6b4a2f"][(variant >>> 6) % 4]!), 0, 0.89, front));
  group.add(box(0.06, 0.06, 0.04, standard("#e3bc87", { metalness: 0.6, roughness: 0.3 }), 0.27, 0.9, front + 0.06));
  group.add(box(1.2, 0.08, 0.42, roof, 0, 1.8, front + 0.2));
  group.add(box(1.1, 0.12, 0.4, standard("#cfc9bd"), 0, 0.06, front + 0.2));
  group.add(windows([
    [-1.35, 1.2, front, 0.85, 0.75, "z"], [1.35, 1.2, front, 0.85, 0.75, "z"],
    [-1.1, 1.2, middle - depth / 2, 0.85, 0.75, "z"], [1.1, 1.2, middle - depth / 2, 0.85, 0.75, "z"],
    [-width / 2, 1.2, middle, 0.95, 0.75, "x"], [width / 2, 1.2, middle, 0.95, 0.75, "x"],
  ], trim, windowGlass()));
  // Flower boxes under the front windows, and a shrub either side of the house.
  const flowers = standard(["#e85d9b", "#f2c14e", "#d9534f"][(variant >>> 9) % 3]!);
  const leaf = standard("#5aa65a");
  for (const x of [-1.35, 1.35]) {
    group.add(box(0.9, 0.14, 0.18, standard("#8a5a3a"), x, 0.72, front + 0.1));
    for (const dx of [-0.28, 0, 0.28]) group.add(solid(new THREE.IcosahedronGeometry(0.1, 0), dx === 0 ? leaf : flowers, x + dx, 0.85, front + 0.1));
  }
  for (const x of [-2.05, 2.05]) group.add(solid(new THREE.IcosahedronGeometry(0.26, 0), leaf, x, 0.24, 1.62));
  return group;
}

// A corner shop (5 x 4): flat roof, a glass shop front with a glass door, a striped awning, a
// sign, and a fruit crate and a plant out front.
function makeShop(variant: number) {
  const group = new THREE.Group();
  const accent = ["#d9534f", "#3a6ee8", "#2c8c84", "#d29c33"][variant % 4]!;
  const dark = standard("#2f3440", { roughness: 0.5, metalness: 0.3 });
  const width = 4.5;
  const depth = 2.9;
  const height = 2.7;
  const middle = -0.5;
  const front = middle + depth / 2;
  group.add(box(width, height, depth, standard(["#efe9df", "#e3d5c3", "#dfe4ea"][(variant >>> 3) % 3]!), 0, height / 2, middle));
  place(group, flatRoof(width, depth, height, "#5b6070", "#b9bcc4")).position.z = middle;
  group.add(box(0.9, 0.45, 0.7, standard("#9aa3b2", { roughness: 0.5, metalness: 0.3 }), -1.1, height + 0.3, middle - 0.4));
  // Shop front: a dark frame with two big windows and a glass door between them.
  group.add(box(4.1, 1.85, 0.06, dark, 0, 0.975, front));
  group.add(windows([[-1.2, 1.05, front, 1.5, 1.45, "z"], [1.2, 1.05, front, 1.5, 1.45, "z"]], dark, windowGlass(), false));
  group.add(windows([[0, 0.86, front, 0.74, 1.56, "z"]], dark, windowGlass(), false));
  group.add(box(0.04, 0.4, 0.04, standard("#c9ced8", { metalness: 0.7, roughness: 0.3 }), 0.28, 0.9, front + 0.08));
  group.add(awning(4.4, 0.8, 2.12, 0.32, front, [accent, "#f7f5f0"]));
  place(group, signBoard("SHOP", 3.0, "#1f2a44", "#ffffff")).position.set(0, 2.42, front + 0.04);
  // A crate of fruit by the door, and a potted plant on the other side.
  group.add(box(0.75, 0.32, 0.38, standard("#b07a48", { roughness: 0.7 }), 1.55, 0.16, 1.4));
  const fruit = ["#e85d4f", "#f2a93b", "#7cbf4f"].map((color) => standard(color, { roughness: 0.5 }));
  for (let i = 0; i < 6; i++) {
    group.add(solid(new THREE.SphereGeometry(0.08, 10, 8), fruit[i % 3]!, 1.3 + (i % 3) * 0.25, 0.38, 1.3 + Math.floor(i / 3) * 0.2));
  }
  place(group, makePlant("snake", 0.8, 0.45, variant)).position.set(-1.6, 0, 1.4);
  return group;
}

// A cafe (5 x 4): a low gable roof, big windows with glazing bars, a striped awning and a sign,
// and a terrace with two bistro tables and chairs in front.
function makeCafe(models: ModelSet) {
  const group = new THREE.Group();
  const walls = standard("#f1e4cf");
  const green = standard("#2f5d50");
  const width = 4.5;
  const depth = 2.4;
  const height = 2.45;
  const middle = -0.75;
  const front = middle + depth / 2;
  group.add(box(width + 0.08, 0.15, depth + 0.08, standard("#8a6a52"), 0, 0.075, middle));
  group.add(box(width, height, depth, walls, 0, height / 2, middle));
  place(group, gableRoof(width + 0.3, depth + 0.08, 0.75, width, depth, standard("#3f5f55", { roughness: 0.75 }), walls)).position.set(0, height, middle);
  group.add(windows([[-1.4, 1.05, front, 1.25, 1.0, "z"], [1.4, 1.05, front, 1.25, 1.0, "z"]], green, windowGlass()));
  group.add(windows([[-width / 2, 1.1, middle, 1.2, 0.8, "x"], [width / 2, 1.1, middle, 1.2, 0.8, "x"]], green, windowGlass()));
  // Wooden door with a glass panel.
  group.add(box(0.9, 1.6, 0.06, green, 0, 0.88, front));
  group.add(box(0.76, 1.5, 0.08, standard("#5a3a26", { roughness: 0.7 }), 0, 0.83, front));
  group.add(box(0.5, 0.6, 0.1, windowGlass(), 0, 1.15, front));
  group.add(awning(4.4, 0.6, 1.98, 0.25, front, ["#2f6f5a", "#f4ecd8"], 10));
  place(group, signBoard("CAFE", 2.2, "#5a3a26", "#f4ecd8")).position.set(0, 2.2, front + 0.04);
  // Terrace: two bistro tables with a coffee cup each, and a chair either side of each table.
  const marble = standard("#f4f2ee", { roughness: 0.4 });
  const iron = standard("#2f3440", { roughness: 0.5, metalness: 0.5 });
  for (const x of [-1.45, 1.45]) {
    group.add(solid(new THREE.CylinderGeometry(0.3, 0.3, 0.04, 20), marble, x, 0.72, 1.5));
    group.add(solid(new THREE.CylinderGeometry(0.03, 0.03, 0.68, 8), iron, x, 0.36, 1.5));
    group.add(solid(new THREE.CylinderGeometry(0.17, 0.2, 0.03, 16), iron, x, 0.015, 1.5));
    group.add(solid(new THREE.CylinderGeometry(0.04, 0.035, 0.07, 10), standard("#ffffff"), x + 0.08, 0.775, 1.45));
    for (const side of [-1, 1]) {
      // A chair faces its table: the one on the left faces +x, the one on the right -x.
      const chair = place(group, fit(models.chair, 0.42, 0.78, 0.42));
      chair.position.set(x + side * 0.52, 0, 1.5);
      chair.rotation.y = side < 0 ? ANGLE.right : ANGLE.left;
    }
  }
  return group;
}

// An office block (6 x 5): three floors of glass in a concrete grid over a glazed lobby, an
// entrance canopy, and plant on a flat roof.
function makeOfficeBlock(variant: number) {
  const group = new THREE.Group();
  const accent = ["#3a6ee8", "#2c8c84", "#d4675a"][variant % 3]!;
  const dark = standard("#2f3440", { roughness: 0.5, metalness: 0.3 });
  const glass = standard("#7fb2d6", { roughness: 0.08, metalness: 0.4, emissive: "#2f5f86", emissiveIntensity: 0.18 });
  const width = 5.7;
  const depth = 4.4;
  const height = 5.4;
  const middle = -0.2;
  const front = middle + depth / 2;
  const back = middle - depth / 2;
  group.add(box(width, height, depth, standard("#d5d8de"), 0, height / 2, middle));
  group.add(box(width + 0.04, 1.5, depth + 0.04, standard("#9aa0ab"), 0, 0.75, middle));
  group.add(box(width + 0.08, 0.14, depth + 0.08, standard(accent), 0, 1.55, middle));
  // The glass grid: a pane per bay on every floor, the concrete showing between them.
  const panes: BoxPart[] = [];
  for (const y of [2.2, 3.45, 4.7]) {
    for (let i = 0; i < 6; i++) {
      const x = -width / 2 + 0.475 + i * 0.95;
      panes.push([0.78, 0.95, 0.06, x, y, front], [0.78, 0.95, 0.06, x, y, back]);
    }
    for (let j = 0; j < 5; j++) {
      const z = middle + (j - 2) * 0.86;
      panes.push([0.06, 0.95, 0.7, width / 2, y, z], [0.06, 0.95, 0.7, -width / 2, y, z]);
    }
  }
  group.add(boxes(panes, glass));
  // Lobby: glass either side of glass doors, under a canopy with the building's name on it.
  group.add(windows([[-1.75, 0.72, front, 1.5, 1.05, "z"], [1.75, 0.72, front, 1.5, 1.05, "z"]], dark, glass, false));
  group.add(windows([[0, 0.66, front, 1.3, 1.2, "z"]], dark, glass));
  group.add(windows([[width / 2, 0.72, middle, 1.6, 0.9, "x"], [-width / 2, 0.72, middle, 1.6, 0.9, "x"]], dark, glass, false));
  group.add(box(2.2, 0.2, 0.45, dark, 0, 1.42, front + 0.225));
  const name = textPlane("OFFICES", { color: "#ffffff", background: null, weight: 800, size: 64 });
  name.scale.multiplyScalar(0.15);
  name.position.set(0, 1.42, front + 0.455);
  group.add(name);
  group.add(box(1.8, 0.08, 0.4, standard("#cfc9bd"), 0, 0.04, front + 0.2));
  place(group, flatRoof(width, depth, height, "#5b6070", "#aeb3bc")).position.z = middle;
  const plant = standard("#9aa3b2", { roughness: 0.5, metalness: 0.3 });
  group.add(box(1.3, 0.55, 1.0, plant, -1.3, height + 0.36, middle - 0.6));
  group.add(box(0.8, 0.4, 0.8, plant, 1.4, height + 0.28, middle - 1.0));
  group.add(solid(new THREE.CylinderGeometry(0.03, 0.03, 1.0, 6), dark, 1.9, height + 0.58, middle + 1.2));
  return group;
}

// ---------------------------------------------------------------------------
// Furniture built from simple shapes. Each faces +z and is centred on its footprint (buildItem
// moves wall pieces back). Seats, like the bench, have their cushion at a seated person's hip
// height and the front of their backrest just behind the person's back (people.ts).

type Point = readonly [x: number, y: number, z: number];

// Geometries in one material, merged into one mesh (like `boxes`).
function merged(geometries: THREE.BufferGeometry[], material: THREE.Material) {
  const mesh = solid(mergeGeometries(geometries), material);
  for (const geometry of geometries) geometry.dispose();
  return mesh;
}

// A round bar `radius` thick from a to b, as a geometry to merge.
function tube(a: Point, b: Point, radius: number, sides = 8) {
  const start = new THREE.Vector3(...a);
  const along = new THREE.Vector3(...b).sub(start);
  const geometry = new THREE.CylinderGeometry(radius, radius, along.length(), sides);
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), along.clone().normalize()));
  const middle = start.addScaledVector(along, 0.5);
  return geometry.translate(middle.x, middle.y, middle.z);
}

// A modern sofa `width` wide with `seats` loose seat and back cushions between padded track arms,
// on a low base and tapered walnut legs. Seat top 0.43 (0.445 at a cushion's crown), arms 0.6, back
// cushions lean back to 0.8. It spans z -0.44 to 0.22 like the seats above.
function makeSofa(width: number, seats: number, fabric: Fabric | undefined) {
  const group = new THREE.Group();
  const arm = 0.17;
  const inner = width - arm * 2;
  const cushionWidth = inner / seats - 0.012;
  const pieces: THREE.BufferGeometry[] = [];
  // The base the cushions rest on, the back frame behind the back cushions, and the two arms.
  pieces.push(softBox(inner + 0.02, 0.17, 0.62, 0.03, 0).translate(0, 0.205, -0.12));
  pieces.push(softBox(inner + 0.02, 0.56, 0.15, 0.05, 0.01).translate(0, 0.4, -0.365));
  for (const side of [-1, 1]) pieces.push(softBox(arm, 0.48, 0.66, 0.06, 0.012).translate(side * (width - arm) / 2, 0.36, -0.11));
  for (let i = 0; i < seats; i++) {
    const x = -inner / 2 + (i + 0.5) * (inner / seats);
    pieces.push(softBox(cushionWidth, 0.14, 0.52, 0.055, 0.016).translate(x, 0.36, -0.04));
    // Back cushions stand on the seat cushions and lean back, their front bulging toward the sitter.
    const back = softBox(cushionWidth, 0.4, 0.17, 0.07, 0.025, "front").translate(0, 0.2, 0);
    pieces.push(back.rotateX(-0.2).translate(x, 0.41, -0.235));
  }
  const body = mergeGeometries(pieces);
  for (const piece of pieces) piece.dispose();
  setFabricUvs(body);
  group.add(solid(body, sofaFabric(fabric)));
  // Tapered legs under the corners, and a middle pair under a long sofa.
  const legs: THREE.BufferGeometry[] = [];
  const legX = width / 2 - 0.07;
  for (const x of width > 2.4 ? [-legX, 0, legX] : [-legX, legX]) {
    for (const z of [0.15, -0.38]) legs.push(new THREE.CylinderGeometry(0.024, 0.016, 0.12, 12).translate(x, 0.06, z));
  }
  group.add(merged(legs, standard("#5b3b26", { roughness: 0.5 })));
  return group;
}

// A box with edges rounded to `radius` whose top (or front) bulges by `crown` in the middle, like a
// filled cushion. Three rows of vertices go round each edge and four cross a crowned face (one a flat
// one); vertices are shared so it shades smoothly.
function softBox(w: number, h: number, d: number, radius: number, crown: number, face: "top" | "front" = "top") {
  const edge = 3;
  const middle = crown ? 4 : 1;
  const rows = edge * 2 + middle;
  const raw = new THREE.BoxGeometry(1, 1, 1, rows, rows, rows);
  raw.deleteAttribute("normal");
  raw.deleteAttribute("uv");
  const geometry = mergeVertices(raw);
  raw.dispose();
  // Spreads a unit-box coordinate so the first and last `edge` rows lie in the rounded band.
  const spread = (c: number, half: number) => {
    const row = (c + 0.5) * rows;
    if (row <= edge) return -half + (radius * row) / edge;
    if (row >= rows - edge) return half - (radius * (rows - row)) / edge;
    return -half + radius + ((half - radius) * 2 * (row - edge)) / middle;
  };
  const halves = new THREE.Vector3(w / 2, h / 2, d / 2);
  const core = halves.clone().subScalar(radius);
  const point = new THREE.Vector3();
  const inner = new THREE.Vector3();
  const out = new THREE.Vector3();
  const low = core.clone().negate();
  const position = geometry.getAttribute("position");
  for (let i = 0; i < position.count; i++) {
    point.set(spread(position.getX(i), halves.x), spread(position.getY(i), halves.y), spread(position.getZ(i), halves.z));
    // Corners and edges move onto a sphere or cylinder `radius` round the box's shrunk core.
    inner.copy(point).clamp(low, core);
    out.subVectors(point, inner);
    if (out.lengthSq() > 0) point.copy(inner).add(out.setLength(radius));
    const [x, y, z] = [point.x / halves.x, point.y / halves.y, point.z / halves.z];
    if (face === "top" && y > 0) point.y += crown * y * (1 - x * x) * (1 - z * z);
    if (face === "front" && z > 0) point.z += crown * z * (1 - x * x) * (1 - y * y);
    position.setXYZ(i, point.x, point.y, point.z);
  }
  geometry.computeVertexNormals();
  return geometry;
}

// Texture coordinates in metres, projected along each vertex's main axis, so the weave is the same
// size on every cushion whatever its shape.
function setFabricUvs(geometry: THREE.BufferGeometry) {
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const uvs = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i++) {
    const [nx, ny, nz] = [Math.abs(normal.getX(i)), Math.abs(normal.getY(i)), Math.abs(normal.getZ(i))];
    const [x, y, z] = [position.getX(i), position.getY(i), position.getZ(i)];
    const [u, v] = ny >= nx && ny >= nz ? [x, z] : nx >= nz ? [z, y] : [x, y];
    uvs[i * 2] = u;
    uvs[i * 2 + 1] = v;
  }
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
}

// Upholstery: a woven fabric (soft sheen, faint weave and blotchy dye) in the fabric picked, or a
// smoother leather. Without a fabric it is dark brown leather. Each is made once and shared.
const sofaFabrics = new Map<string, THREE.Material>();
let fabricTextures: { dye: THREE.Texture; weave: THREE.Texture } | null = null;
function sofaFabric(fabric: Fabric | undefined) {
  const key = fabric ?? "none";
  let material = sofaFabrics.get(key);
  if (material) return material;
  fabricTextures ??= makeFabricTextures();
  const color = fabric ? FABRIC_COLORS[fabric].mid : "#4a3227";
  const leather = !fabric || fabric === "leather";
  const dye = fabricTextures.dye.clone();
  const weave = fabricTextures.weave.clone();
  dye.repeat.setScalar(leather ? 0.8 : 1.4);
  weave.repeat.setScalar(leather ? 6 : 14);
  material = new THREE.MeshPhysicalMaterial({
    color,
    map: dye,
    bumpMap: weave,
    bumpScale: leather ? 0.6 : 1.2,
    roughness: leather ? 0.5 : 0.9,
    sheen: leather ? 0 : 0.7,
    sheenRoughness: 0.7,
    sheenColor: new THREE.Color(color).lerp(new THREE.Color("#ffffff"), 0.35),
  });
  sofaFabrics.set(key, material);
  return material;
}

function makeFabricTextures() {
  let seed = 11;
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const canvas = (size: number, draw: (ctx: CanvasRenderingContext2D) => void, colorSpace: THREE.ColorSpace) => {
    const element = document.createElement("canvas");
    element.width = element.height = size;
    draw(element.getContext("2d")!);
    const texture = new THREE.CanvasTexture(element);
    texture.colorSpace = colorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 8;
    return texture;
  };
  // Dye: near-white with soft lighter and darker patches, multiplied by the fabric colour.
  const dye = canvas(128, (ctx) => {
    ctx.fillStyle = "#f2f2f2";
    ctx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 60; i++) {
      const [x, y, r] = [rand() * 128, rand() * 128, 10 + rand() * 26];
      const light = rand() < 0.5;
      // Drawn at each wrapped position so the texture tiles without seams.
      for (const dx of [-128, 0, 128]) for (const dy of [-128, 0, 128]) {
        const glow = ctx.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
        glow.addColorStop(0, light ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.035)");
        glow.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = glow;
        ctx.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
      }
    }
  }, THREE.SRGBColorSpace);
  // Weave: rows of short raised threads, offset row to row like a basket weave, for the bump map.
  const weave = canvas(64, (ctx) => {
    ctx.fillStyle = "#808080";
    ctx.fillRect(0, 0, 64, 64);
    for (let y = 0; y < 64; y += 4) {
      for (let x = (y / 4) % 2 ? 0 : 4; x < 64; x += 8) {
        const shade = 150 + Math.floor(rand() * 60);
        ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
        ctx.fillRect(x, y, 4, 2);
        ctx.fillRect(x + 4, y + 2, 2, 2);
      }
    }
  }, THREE.NoColorSpace);
  return { dye, weave };
}

// A high-back executive chair: a button-tufted back, a thick seat and padded arms in leather (or the
// fabric picked), on a chrome five-star base with castors and a gas lift. Seat top 0.47, back 1.05.
function makeExecChair(colors: { mid: string; dark: string }) {
  const group = new THREE.Group();
  const leather = standard(colors.mid, { roughness: 0.45 });
  const seam = standard(colors.dark, { roughness: 0.55 });
  const metal: THREE.BufferGeometry[] = [
    new THREE.CylinderGeometry(0.055, 0.06, 0.06, 16).translate(0, 0.1, 0),
    new THREE.CylinderGeometry(0.022, 0.022, 0.14, 12).translate(0, 0.3, 0),
  ];
  const plastic: THREE.BufferGeometry[] = [
    new THREE.CylinderGeometry(0.035, 0.035, 0.14, 12).translate(0, 0.19, 0),
    new THREE.BoxGeometry(0.24, 0.04, 0.24).translate(0, 0.35, -0.02),
  ];
  // Five legs, two of them forward either side of a seated person's feet, each on a castor.
  for (let i = 0; i < 5; i++) {
    const angle = Math.PI / 5 + (i / 5) * Math.PI * 2;
    const [x, z] = [Math.sin(angle), Math.cos(angle)];
    metal.push(tube([x * 0.04, 0.1, z * 0.04], [x * 0.27, 0.075, z * 0.27], 0.02));
    plastic.push(new THREE.SphereGeometry(0.034, 10, 8).translate(x * 0.27, 0.034, z * 0.27));
  }
  // Chrome supports under each arm.
  for (const side of [-1, 1]) {
    metal.push(tube([side * 0.285, 0.39, 0.07], [side * 0.3, 0.625, 0.08], 0.013), tube([side * 0.285, 0.39, -0.17], [side * 0.3, 0.625, -0.18], 0.013));
  }
  group.add(merged(metal, standard("#d5d9e0", { metalness: 0.9, roughness: 0.2 })), merged(plastic, standard("#25282f", { roughness: 0.6 })));
  // The seat: a dark shell under a thick cushion with a rolled front edge, short of the knees.
  group.add(box(0.54, 0.04, 0.46, seam, 0, 0.39, -0.02));
  group.add(boxes([[0.5, 0.06, 0.42, 0, 0.44, -0.03], [0.075, 0.045, 0.36, -0.3, 0.645, -0.05], [0.075, 0.045, 0.36, 0.3, 0.645, -0.05]], leather));
  place(group, solid(new THREE.CylinderGeometry(0.035, 0.035, 0.5, 16), leather, 0, 0.435, 0.18)).rotation.z = Math.PI / 2;
  // The back: four padded bands on a dark shell, buttoned in a diamond pattern, leaning back a little.
  const back = new THREE.Group();
  back.add(box(0.54, 0.58, 0.07, seam, 0, 0.29, -0.035));
  const bands: BoxPart[] = [];
  const buttons: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) {
    const y = 0.0825 + i * 0.135;
    bands.push([0.48, 0.125, 0.06, 0, y, 0.03]);
    for (const x of i % 2 ? [-0.12, 0.12] : [-0.2, 0, 0.2]) buttons.push(new THREE.SphereGeometry(0.013, 8, 6).translate(x, y, 0.058));
  }
  back.add(boxes(bands, leather), merged(buttons, seam));
  back.position.set(0, 0.47, -0.25);
  back.rotation.x = -0.12;
  group.add(back);
  return group;
}

// A theatre seat, like the 2D map's: a red padded cushion and tall backrest on a dark shell,
// between steel end standards with oak armrests (a cup holder in the right one). Seat top 0.47;
// the back leans back to about 1.0.
function makeTheatreSeat() {
  const group = new THREE.Group();
  const red = standard("#b23a40", { roughness: 0.85 });
  const redLight = standard("#c94a50", { roughness: 0.85 });
  const shell = standard("#5a1c22", { roughness: 0.6 });
  const oak = standard("#c08a4f", { roughness: 0.55 });
  const metal = standard("#7b818c", { metalness: 0.5, roughness: 0.45 });
  const frame: BoxPart[] = [[0.6, 0.04, 0.36, 0, 0.38, -0.02], [0.68, 0.04, 0.04, 0, 0.3, -0.12]];
  const arms: BoxPart[] = [];
  for (const x of [-0.36, 0.36]) {
    frame.push([0.05, 0.58, 0.32, x, 0.3, -0.07], [0.08, 0.02, 0.42, x, 0.01, -0.05]);
    arms.push([0.08, 0.035, 0.44, x, 0.62, -0.04]);
  }
  group.add(boxes(frame, metal), boxes(arms, oak));
  // The cup holder: a dark ring set into the right armrest.
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.04, 16), standard("#2a2d35", { roughness: 0.5 }));
  cup.position.set(0.36, 0.63, 0.1);
  group.add(cup);
  // The cushion: a shell under a thick red pad, tipping up a little at the front.
  const seat = new THREE.Group();
  seat.add(box(0.62, 0.04, 0.44, shell, 0, 0.4, 0));
  seat.add(box(0.6, 0.07, 0.42, red, 0, 0.455, 0.005));
  seat.add(box(0.58, 0.015, 0.4, redLight, 0, 0.495, 0.005));
  group.add(seat);
  seat.rotation.x = -0.05;
  // The backrest: a curved-looking pad (a fuller middle panel) on a dark shell, leaning back.
  const back = new THREE.Group();
  back.add(box(0.64, 0.52, 0.05, shell, 0, 0.26, -0.035));
  back.add(box(0.6, 0.5, 0.06, red, 0, 0.26, 0.015));
  back.add(box(0.36, 0.44, 0.02, redLight, 0, 0.27, 0.05));
  back.add(box(0.62, 0.05, 0.1, red, 0, 0.52, 0));
  back.position.set(0, 0.5, -0.22);
  back.rotation.x = -0.16;
  group.add(back);
  return group;
}

// A tall two-door wardrobe in dark wood (0.9 x 1.9 x 0.55): panelled doors with brass handles, a
// plinth and a stepped cornice.
function makeWardrobe() {
  const group = new THREE.Group();
  const wood = standard("#5b3c27", { roughness: 0.6 });
  const front = 0.275;
  group.add(box(0.9, 1.74, 0.55, wood, 0, 0.95, 0));
  group.add(boxes([[0.86, 0.08, 0.5, 0, 0.04, -0.01], [0.94, 0.04, 0.58, 0, 1.84, 0.005], [0.98, 0.04, 0.61, 0, 1.88, 0.015]], standard("#432a1b", { roughness: 0.6 })));
  const doors: BoxPart[] = [];
  const panels: BoxPart[] = [];
  const handles: BoxPart[] = [];
  for (const side of [-1, 1]) {
    const x = side * 0.222;
    doors.push([0.43, 1.66, 0.02, x, 0.95, front + 0.01]);
    panels.push([0.32, 0.62, 0.014, x, 0.55, front + 0.027], [0.32, 0.7, 0.014, x, 1.33, front + 0.027]);
    handles.push([0.02, 0.2, 0.025, side * 0.04, 1.0, front + 0.032]);
  }
  group.add(boxes(doors, standard("#684531", { roughness: 0.55 })), boxes(panels, wood));
  group.add(boxes(handles, standard("#c9a14a", { metalness: 0.7, roughness: 0.3 })));
  return group;
}

// A desk globe on a small wooden cabinet (0.9 high): blue seas with green and sandy land, on a
// tilted axis inside a brass meridian ring.
function makeGlobe() {
  const group = new THREE.Group();
  const brass = standard("#c9a14a", { metalness: 0.75, roughness: 0.3 });
  group.add(box(0.5, 0.44, 0.46, standard("#8a5a3a", { roughness: 0.6 }), 0, 0.26, 0));
  group.add(boxes([[0.46, 0.04, 0.42, 0, 0.02, 0], [0.54, 0.03, 0.5, 0, 0.495, 0], [0.44, 0.12, 0.015, 0, 0.39, 0.235], [0.44, 0.24, 0.015, 0, 0.18, 0.235]], standard("#6b4329", { roughness: 0.6 })));
  group.add(merged([new THREE.SphereGeometry(0.018, 8, 6).translate(0, 0.39, 0.25), new THREE.SphereGeometry(0.018, 8, 6).translate(0.17, 0.18, 0.25)], brass));
  const top = 0.51;
  const ring = 0.155;
  group.add(solid(new THREE.CylinderGeometry(0.075, 0.095, 0.025, 20), brass, 0, top + 0.0125, 0));
  group.add(solid(new THREE.CylinderGeometry(0.012, 0.016, 0.06, 8), brass, 0, top + 0.05, 0));
  // The ring stands on the stem, turned a little so it isn't seen edge-on or face-on.
  const stand = new THREE.Group();
  stand.position.y = top + 0.07 + ring;
  stand.rotation.y = -0.5;
  stand.add(solid(new THREE.TorusGeometry(ring, 0.008, 8, 48), brass));
  const globe = new THREE.Group();
  globe.rotation.z = 0.41; // the Earth's tilt
  globe.add(solid(new THREE.SphereGeometry(0.14, 32, 20), standard("#3d7cc9", { roughness: 0.35 })));
  // Land: patches of a slightly bigger sphere, as [phi start, phi length, theta start, theta length].
  const land = (patches: readonly (readonly [number, number, number, number])[], color: string) =>
    merged(patches.map(([phi, phiLength, theta, thetaLength]) => new THREE.SphereGeometry(0.1415, 12, 8, phi, phiLength, theta, thetaLength)), standard(color, { roughness: 0.6 }));
  globe.add(land([[0.2, 1.0, 0.45, 0.6], [1.9, 0.9, 0.55, 0.8], [2.3, 0.5, 1.5, 0.7], [4.4, 1.1, 0.5, 0.9]], "#5a9e4f"));
  globe.add(land([[0.5, 0.6, 1.05, 0.45], [3.4, 0.8, 0.7, 0.5], [5.4, 0.5, 1.4, 0.5]], "#d8c08a"));
  globe.add(solid(tube([0, -0.165, 0], [0, 0.165, 0], 0.005), brass));
  stand.add(globe);
  group.add(stand);
  return group;
}

// A wooden coat stand (1.8 high) on three splayed legs with four hooks at the top, a coat on the
// front right hook and a striped scarf over the front left one.
function makeCoatRack(variant: number) {
  const group = new THREE.Group();
  const hook = (angle: number) => [Math.sin(angle), Math.cos(angle)] as const;
  const stand: THREE.BufferGeometry[] = [
    new THREE.CylinderGeometry(0.024, 0.03, 1.72, 12).translate(0, 0.9, 0),
    new THREE.SphereGeometry(0.04, 12, 8).translate(0, 1.78, 0),
    new THREE.CylinderGeometry(0.04, 0.04, 0.05, 12).translate(0, 0.42, 0),
  ];
  for (let i = 0; i < 3; i++) {
    const [x, z] = hook(Math.PI / 3 + (i * Math.PI * 2) / 3);
    stand.push(tube([x * 0.02, 0.42, z * 0.02], [x * 0.27, 0.02, z * 0.27], 0.017), new THREE.SphereGeometry(0.025, 8, 6).translate(x * 0.27, 0.02, z * 0.27));
  }
  for (let i = 0; i < 4; i++) {
    const [x, z] = hook(Math.PI / 4 + (i * Math.PI) / 2);
    stand.push(tube([x * 0.02, 1.6, z * 0.02], [x * 0.15, 1.69, z * 0.15], 0.012), new THREE.SphereGeometry(0.018, 8, 6).translate(x * 0.15, 1.69, z * 0.15));
  }
  group.add(merged(stand, standard("#7a4e30", { roughness: 0.6 })));
  // The coat: a body widening to the hem, round shoulders and sleeves, flattened against the stand.
  const [cloth, collar] = ([["#b98a56", "#8f6638"], ["#3a4f8a", "#27355f"], ["#a8473c", "#7e3129"], ["#6c7282", "#4d5260"]] as const)[variant % 4]!;
  const coat = new THREE.Group();
  coat.add(merged([
    new THREE.CylinderGeometry(0.1, 0.17, 0.85, 14).translate(0, 1.195, 0),
    new THREE.SphereGeometry(0.1, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.45, 1).translate(0, 1.62, 0),
    tube([-0.11, 1.6, 0], [-0.13, 1.08, 0.02], 0.04),
    tube([0.11, 1.6, 0], [0.13, 1.08, 0.02], 0.04),
  ], standard(cloth, { roughness: 0.9 })));
  coat.add(solid(new THREE.CylinderGeometry(0.05, 0.065, 0.06, 12), standard(collar, { roughness: 0.9 }), 0, 1.66, 0));
  const [cx, cz] = hook(Math.PI / 4);
  coat.position.set(cx * 0.15, 0, cz * 0.15);
  coat.rotation.y = Math.PI / 4;
  coat.scale.z = 0.5;
  group.add(coat);
  // The scarf hangs either side of its hook, one end longer, with a cream stripe near each end.
  const [sx, sz] = hook(-Math.PI / 4);
  const scarf = new THREE.Group();
  scarf.add(boxes([[0.012, 0.55, 0.08, -0.022, -0.26, 0], [0.012, 0.44, 0.08, 0.022, -0.205, 0], [0.056, 0.016, 0.08, 0, 0.022, 0]], standard("#c0473f", { roughness: 0.9 })));
  scarf.add(boxes([[0.014, 0.03, 0.082, -0.022, -0.48, 0], [0.014, 0.03, 0.082, 0.022, -0.37, 0]], standard("#f1ead8", { roughness: 0.9 })));
  scarf.position.set(sx * 0.13, 1.69, sz * 0.13);
  scarf.rotation.y = -Math.PI / 4;
  group.add(scarf);
  return group;
}

// A fish tank (1.8 x 0.55, water to 1.2) on a dark wooden stand with two doors: gravel, plants,
// rocks and four fish behind the glass, under a lid with a light strip.
function makeAquarium() {
  const group = new THREE.Group();
  const black = standard("#1d2027", { roughness: 0.4, metalness: 0.3 });
  group.add(box(1.8, 0.64, 0.55, standard("#3e2b1f", { roughness: 0.6 }), 0, 0.36, 0));
  group.add(boxes([[1.76, 0.04, 0.5, 0, 0.02, 0], [1.84, 0.04, 0.58, 0, 0.7, 0]], standard("#2c1f16", { roughness: 0.6 })));
  group.add(boxes([[0.86, 0.54, 0.015, -0.45, 0.36, 0.283], [0.86, 0.54, 0.015, 0.45, 0.36, 0.283]], standard("#4a3526", { roughness: 0.55 })));
  group.add(merged([-0.06, 0.06].map((x) => new THREE.SphereGeometry(0.018, 8, 6).translate(x, 0.4, 0.295)), standard("#c9a14a", { metalness: 0.7, roughness: 0.3 })));
  // The tank: a black base, corner posts and lid, with a light strip along the front of the lid.
  const frame: BoxPart[] = [[1.8, 0.03, 0.55, 0, 0.735, 0], [1.82, 0.07, 0.57, 0, 1.245, 0]];
  for (const x of [-0.885, 0.885]) for (const z of [-0.26, 0.26]) frame.push([0.03, 0.46, 0.03, x, 0.98, z]);
  group.add(boxes(frame, black));
  group.add(box(1.7, 0.018, 0.012, standard("#eef8ff", { emissive: "#cfeaff", emissiveIntensity: 1.4 }), 0, 1.245, 0.29));
  group.add(box(1.72, 0.05, 0.48, standard("#d8c393", { roughness: 1 }), 0, 0.775, 0));
  group.add(merged([new THREE.DodecahedronGeometry(0.08, 0).translate(0.5, 0.82, -0.12), new THREE.DodecahedronGeometry(0.055, 0).translate(-0.28, 0.81, -0.15)], standard("#7d8592", { flatShading: true })));
  // Plants: clumps of thin leaves leaning out from the gravel, in two greens.
  const leaves: [THREE.BufferGeometry[], THREE.BufferGeometry[]] = [[], []];
  for (const [px, pz] of [[-0.72, -0.12], [-0.52, -0.18], [0.18, -0.16], [0.74, -0.08]] as const) {
    for (let j = 0; j < 5; j++) {
      const height = [0.26, 0.34, 0.22, 0.3, 0.2][j]!;
      leaves[j % 2]!.push(new THREE.ConeGeometry(0.018, height, 4).translate(0, height / 2, 0)
        .rotateX(Math.cos(j * 1.26) * 0.22).rotateZ(Math.sin(j * 1.26) * 0.22).translate(px, 0.8, pz));
    }
  }
  group.add(merged(leaves[0], standard("#3f9a4f")), merged(leaves[1], standard("#6db35f")));
  // Fish, each drifting to and fro at its own pace and turning at each end. Like the Claude
  // coworker's typing (claude-3d.ts), this runs only while the fish is drawn.
  const fish = [[-0.4, 1.0, 0.02, "#f28a2e"], [0.2, 1.08, -0.1, "#f2c14e"], [0.5, 0.94, 0.06, "#e8603c"], [-0.05, 0.9, -0.04, "#f6d24a"]] as const;
  fish.forEach(([x, y, z, color], i) => {
    const material = standard(color, { roughness: 0.4, emissive: color, emissiveIntensity: 0.2 });
    const swimmer = new THREE.Group();
    const body = place(swimmer, solid(new THREE.SphereGeometry(0.035, 12, 8), material));
    body.scale.set(1.7, 1, 0.6);
    swimmer.add(solid(new THREE.ConeGeometry(0.03, 0.05, 4).rotateZ(-Math.PI / 2).scale(1, 1, 0.3), material, -0.07, 0, 0));
    swimmer.position.set(x, y, z);
    group.add(swimmer);
    body.onBeforeRender = () => {
      const t = performance.now() / 1000 * 0.45 + i * 1.7;
      swimmer.position.x = x + Math.sin(t) * 0.12;
      swimmer.position.y = y + Math.sin(t * 3.5) * 0.015;
      swimmer.rotation.y = Math.cos(t) >= 0 ? 0 : Math.PI;
    };
  });
  // The water: see-through, so the fish and plants show through it, and casting no shadow.
  const water = place(group, box(1.74, 0.45, 0.5, standard("#5fb3e6", { transparent: true, opacity: 0.35, roughness: 0.1, depthWrite: false }), 0, 0.975, 0));
  water.castShadow = false;
  return group;
}

// A snack machine (0.86 x 1.85 x 0.72): a blue cabinet with a lit glass front showing rows of
// cans and bags, a white keypad panel on the right and a pickup slot at the bottom.
function makeVendingMachine() {
  const group = new THREE.Group();
  const blue = standard("#2f62c4", { roughness: 0.45, metalness: 0.2 });
  const dark = standard("#22262e", { roughness: 0.5 });
  const front = 0.36;
  group.add(box(0.8, 0.05, 0.66, dark, 0, 0.025, -0.02));
  group.add(box(0.86, 1.8, 0.62, blue, 0, 0.95, -0.05));
  // The front frame round the window (x -0.39 to 0.17, y 0.55 to 1.62).
  group.add(boxes([[0.26, 1.8, 0.1, 0.3, 0.95, 0.31], [0.04, 1.8, 0.1, -0.41, 0.95, 0.31], [0.56, 0.5, 0.1, -0.11, 0.3, 0.31], [0.56, 0.23, 0.1, -0.11, 1.735, 0.31]], blue));
  group.add(box(0.56, 1.07, 0.01, standard("#eef3fb", { emissive: "#dbe7ff", emissiveIntensity: 0.35 }), -0.11, 1.085, 0.265));
  // Five shelves: cans on every other one, bags of crisps and sweets on the rest.
  const colors = ["#e85d4f", "#f2c14e", "#4caf6d", "#3a6ee8", "#e877aa", "#f28a2e"];
  const snacks = new Map<string, THREE.BufferGeometry[]>();
  const shelves: BoxPart[] = [];
  for (let row = 0; row < 5; row++) {
    const y = 0.55 + row * 0.214;
    shelves.push([0.56, 0.012, 0.09, -0.11, y + 0.006, 0.31]);
    for (let col = 0; col < 4; col++) {
      const x = -0.32 + col * 0.14;
      const color = colors[(row * 2 + col) % colors.length]!;
      const snack = row % 2
        ? new THREE.BoxGeometry(0.1, 0.14, 0.035).translate(x, y + 0.082, 0.31)
        : new THREE.CylinderGeometry(0.03, 0.03, 0.11, 12).translate(x, y + 0.067, 0.31);
      snacks.set(color, [...(snacks.get(color) ?? []), snack]);
    }
  }
  group.add(boxes(shelves, standard("#9aa3b2", { metalness: 0.4, roughness: 0.4 })));
  for (const [color, geometries] of snacks) group.add(merged(geometries, standard(color, { roughness: 0.4 })));
  const glass = place(group, box(0.56, 1.07, 0.012, standard("#d6ecf7", { transparent: true, opacity: 0.2, roughness: 0.05, metalness: 0.2, depthWrite: false }), -0.11, 1.085, front - 0.005));
  glass.castShadow = false;
  // A lit sign across the top, the keypad panel with its screen and buttons, and the pickup slot.
  group.add(box(0.8, 0.14, 0.012, standard("#ffffff", { emissive: "#ffffff", emissiveIntensity: 0.35 }), 0, 1.75, front + 0.006));
  const label = place(group, textPlane("SNACKS", { color: "#2f62c4", background: null, weight: 800, size: 64 }));
  label.scale.multiplyScalar(0.1);
  label.position.set(0, 1.75, front + 0.014);
  group.add(box(0.2, 0.62, 0.012, standard("#f2f4f7", { roughness: 0.5 }), 0.3, 1.18, front + 0.006));
  group.add(box(0.15, 0.07, 0.008, standard("#0f2a1c", { emissive: "#4ade80", emissiveIntensity: 0.7 }), 0.3, 1.41, front + 0.014));
  const keys: BoxPart[] = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) keys.push([0.035, 0.028, 0.01, 0.25 + c * 0.05, 1.32 - r * 0.045, front + 0.015]);
  group.add(boxes(keys, standard("#8a919e", { roughness: 0.4 })));
  group.add(boxes([[0.018, 0.06, 0.01, 0.25, 1.0, front + 0.015], [0.08, 0.05, 0.012, 0.33, 0.98, front + 0.016], [0.46, 0.16, 0.012, -0.11, 0.24, front + 0.006]], dark));
  group.add(box(0.44, 0.1, 0.01, standard("#3a4150", { roughness: 0.5 }), -0.11, 0.255, front + 0.017));
  return group;
}

// A traffic cone (0.6 high): orange, with a white reflective band, on a square black base.
function makeTrafficCone() {
  const group = new THREE.Group();
  const [bottom, top, height] = [0.17, 0.035, 0.56];
  const radiusAt = (h: number) => bottom + (top - bottom) * (h / height);
  group.add(box(0.4, 0.04, 0.4, standard("#1f2228", { roughness: 0.8 }), 0, 0.02, 0));
  group.add(solid(new THREE.CylinderGeometry(top, bottom, height, 24), standard("#f26b1d", { roughness: 0.5 }), 0, 0.04 + height / 2, 0));
  const band = standard("#f4f5f7", { roughness: 0.25, emissive: "#ffffff", emissiveIntensity: 0.12 });
  group.add(solid(new THREE.CylinderGeometry(radiusAt(0.36) + 0.004, radiusAt(0.24) + 0.004, 0.12, 24, 1, true), band, 0, 0.04 + 0.3, 0));
  return group;
}

// A low steel rack (2 x 1) with three wheel slots, holding an orange and a teal bicycle by their
// front wheels.
function makeBikeRack() {
  const group = new THREE.Group();
  const steel = standard("#a9b0ba", { metalness: 0.6, roughness: 0.35 });
  const hoops: THREE.BufferGeometry[] = [];
  for (const x of [-0.62, 0, 0.62]) for (const side of [-1, 1]) {
    hoops.push(new THREE.TorusGeometry(0.18, 0.014, 6, 16, Math.PI).rotateY(Math.PI / 2).translate(x + side * 0.045, 0.03, 0.25));
  }
  group.add(merged(hoops, steel));
  group.add(boxes([[1.84, 0.03, 0.04, 0, 0.015, 0.07], [1.84, 0.03, 0.04, 0, 0.015, 0.43], [0.04, 0.03, 0.4, -0.9, 0.015, 0.25], [0.04, 0.03, 0.4, 0.9, 0.015, 0.25]], steel));
  // On Clario HQ these can be ridden: the 3D view hides the one someone is riding (userData.bike).
  for (const [bike, x] of [["orange", -0.62], ["teal", 0]] as const) {
    const parked = place(group, makeBicycle(BIKE_COLORS[bike]));
    parked.position.x = x;
    parked.userData.bike = bike;
  }
  return group;
}

export const BIKE_COLORS: Record<Bike, string> = { orange: "#f28a2e", teal: "#2c8c84" };
// The bike's saddle height, so a rider's bike can be scaled to their hips.
export const BICYCLE_SADDLE = 0.59;

// A small bicycle (0.96 long) with its front wheel toward +z: spoked wheels, a diamond frame, a
// saddle, handlebars, cranks and pedals. What a ridden bike moves are groups of their own
// (userData): the wheels turning about their axles (rear, front), the cranks, a pedal on each
// crank (+x side first) turning on it to stay level, and the steering (the fork, front wheel and
// handlebars) turning about `steerAxis`, the head tube. `grips` mark where the hands hold the bars.
export function makeBicycle(color: string) {
  const group = new THREE.Group();
  const radius = 0.21;
  const hub = 0.232; // wheel centres, so the tyres touch the floor
  const crank: Point = [0, 0.2, -0.03];
  const seat: Point = [0, 0.5, -0.12];
  const head: Point = [0, 0.5, 0.15];
  const headLow: Point = [0, 0.42, 0.18];
  const paint = standard(color, { roughness: 0.35, metalness: 0.3 });
  const chromeMaterial = standard("#c9ced8", { metalness: 0.7, roughness: 0.3 });
  const rubberMaterial = standard("#24272e", { roughness: 0.9 });
  const makeWheel = () => {
    const spokes: THREE.BufferGeometry[] = [
      new THREE.TorusGeometry(radius - 0.025, 0.007, 6, 32).rotateY(Math.PI / 2),
      new THREE.CylinderGeometry(0.025, 0.025, 0.07, 10).rotateZ(Math.PI / 2),
    ];
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      spokes.push(tube([0, 0, 0], [0, Math.sin(angle) * (radius - 0.03), Math.cos(angle) * (radius - 0.03)], 0.003, 4));
    }
    const wheel = new THREE.Group();
    wheel.add(merged([new THREE.TorusGeometry(radius, 0.022, 8, 32).rotateY(Math.PI / 2)], rubberMaterial), merged(spokes, chromeMaterial));
    return wheel;
  };
  const rear = makeWheel();
  rear.position.set(0, hub, -0.25);
  group.add(rear);

  // The steering, built about the foot of the head tube (points are given in the bike's space).
  const steer = new THREE.Group();
  steer.position.set(...headLow);
  const fromHead = ([x, y, z]: Point): Point => [x - headLow[0], y - headLow[1], z - headLow[2]];
  const front = makeWheel();
  front.position.set(...fromHead([0, hub, 0.25]));
  const grips = [0.17, -0.17].map((x) => {
    const grip = new THREE.Object3D();
    grip.position.set(...fromHead([x, 0.6, 0.13]));
    return grip;
  });
  steer.add(
    front,
    merged([-0.03, 0.03].map((x) => tube(fromHead([x, 0.42, 0.18]), fromHead([x, hub, 0.25]), 0.013)), paint),
    merged([tube(fromHead(head), fromHead([0, 0.6, 0.13]), 0.014), tube(fromHead([-0.19, 0.6, 0.13]), fromHead([0.19, 0.6, 0.13]), 0.011)], chromeMaterial),
    merged([tube(fromHead([-0.2, 0.6, 0.13]), fromHead([-0.14, 0.6, 0.13]), 0.016), tube(fromHead([0.14, 0.6, 0.13]), fromHead([0.2, 0.6, 0.13]), 0.016)], rubberMaterial),
    ...grips,
  );
  group.add(steer);

  const cranks = new THREE.Group();
  cranks.position.set(...crank);
  cranks.add(merged([
    new THREE.CylinderGeometry(0.06, 0.06, 0.008, 20).rotateZ(Math.PI / 2).translate(0.04, 0, 0),
    tube([0.05, 0, 0], [0.05, -0.07, 0.03], 0.008), tube([-0.05, 0, 0], [-0.05, 0.07, -0.03], 0.008),
  ], chromeMaterial));
  const pedals = ([[0.08, -0.07, 0.03], [-0.08, 0.07, -0.03]] as const).map(([x, y, z]) => {
    const pedal = solid(new THREE.BoxGeometry(0.06, 0.012, 0.035), rubberMaterial);
    pedal.position.set(x, y, z);
    cranks.add(pedal);
    return pedal;
  });
  group.add(cranks);

  const frame = [tube(seat, head, 0.018), tube(crank, headLow, 0.02), tube(crank, seat, 0.018), tube(headLow, head, 0.022)];
  for (const x of [-0.03, 0.03]) frame.push(tube(crank, [x, hub, -0.25], 0.012), tube(seat, [x, hub, -0.25], 0.012));
  group.add(
    merged(frame, paint),
    merged([tube(seat, [0, 0.56, -0.135], 0.012)], chromeMaterial),
    merged([new THREE.BoxGeometry(0.07, 0.03, 0.16).translate(0, 0.575, -0.135)], rubberMaterial),
  );
  Object.assign(group.userData, {
    wheels: [rear, front], crank: cranks, pedals, steer, grips,
    steerAxis: new THREE.Vector3(...head).sub(new THREE.Vector3(...headLow)).normalize(),
  });
  return group;
}

function buildTrees(scene: THREE.Object3D) {
  // The same trees as the 2D map, each standing on the middle of its two tiles. The spot picks
  // the tree (trees.ts), so it grows the same one every time.
  scene.add(grove(HQ_TREES.map(({ x, y }) => ({ x: x + 1, z: y + 1, seed: variantAt({ x, y }) }))));
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

function buildRoomLabels(scene: THREE.Object3D) {
  return getMapTemplate("clario-hq").chatRooms.map((room) => {
    const label = roomLabel(room);
    scene.add(label);
    return label;
  });
}

// A room's name floating over its middle.
export function roomLabel(room: { name: string; bounds: { x: number; y: number; width: number; height: number } }) {
  const label = textSprite(room.name, { color: "#ffffff", background: "rgba(18,21,28,0.72)", weight: 600, size: 40 });
  label.scale.multiplyScalar(0.55);
  label.position.set(room.bounds.x + room.bounds.width / 2, 2.7, room.bounds.y + room.bounds.height / 2);
  label.renderOrder = 10;
  return label;
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

// Empties a group that buildOffice or buildCustomOffice filled, and frees what was made for it.
// Furniture copies of the loaded models share the models' geometry, materials and textures (and a
// recoloured material still shares its textures), so those stay for the next build.
export function clearOffice(root: THREE.Object3D, models: ModelSet) {
  const materialsOf = (mesh: THREE.Mesh) => (mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : []);
  const texturesOf = (material: THREE.Material) => Object.values(material).filter((value): value is THREE.Texture => value instanceof THREE.Texture);
  const shared = new Set<unknown>();
  const sources = [...MODELS.map((name) => models[name]), ...Object.values(models.seating)];
  for (const source of sources) {
    source?.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.geometry) shared.add(mesh.geometry);
      for (const material of materialsOf(mesh)) {
        shared.add(material);
        for (const texture of texturesOf(material)) shared.add(texture);
      }
    });
  }
  root.traverse((child) => {
    if (child === root) return;
    const mesh = child as THREE.Mesh;
    // Every sprite uses the same geometry in three.js, so theirs stays.
    if (mesh.geometry && !(child instanceof THREE.Sprite) && !shared.has(mesh.geometry)) mesh.geometry.dispose();
    if (child instanceof THREE.InstancedMesh) child.dispose();
    for (const material of materialsOf(mesh)) {
      if (shared.has(material)) continue;
      for (const texture of texturesOf(material)) if (!shared.has(texture)) texture.dispose();
      material.dispose();
    }
  });
  root.clear();
}
