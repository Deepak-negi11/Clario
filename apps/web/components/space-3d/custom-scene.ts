import * as THREE from "three";
import { floorAt, isWallAt, ITEM_SPECS, type CustomFloor, type CustomMap } from "@repo/shared";
import {
  buildItem, CAP_COLOR, floorTexture, GRASS_COLOR, roomLabel, standard, WALL_COLORS, WALL_HEIGHT, type ModelSet,
} from "./office-scene";

// Builds a map someone made in the map builder (custom-map.ts in @repo/shared) in the same units
// and style as Clario HQ (office-scene.ts): one tile is one unit, x runs east, z runs south (the
// map's y), y is up. Walls here are whole tiles, so each one is a block filling its tile.

export function buildCustomOffice(root: THREE.Object3D, models: ModelSet, map: CustomMap) {
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(map.cols + 60, map.rows + 60), standard(GRASS_COLOR));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(map.cols / 2, 0, map.rows / 2);
  ground.receiveShadow = true;
  root.add(ground);

  buildFloors(root, map);
  buildWalls(root, map);
  for (const item of map.items) {
    const object = buildItem(item, models, "custom");
    if (!object) continue;
    const spec = ITEM_SPECS[item.kind];
    object.position.x += item.x + spec.w / 2;
    object.position.z += item.y + spec.h / 2;
    root.add(object);
  }
  const roomLabels = map.rooms.map((room) => {
    const label = roomLabel(room);
    root.add(label);
    return label;
  });
  return { roomLabels };
}

// One mesh for each kind of floor, made of a square per tile. Its texture coordinates come from
// where each tile is, so planks and tiles run on from one tile to the next, one texture to every
// two tiles as on Clario HQ's floors. (Instancing one tile would restart the texture on every tile.)
function buildFloors(root: THREE.Object3D, map: CustomMap) {
  const tiles = new Map<CustomFloor, [number, number][]>();
  for (let y = 0; y < map.rows; y++) {
    for (let x = 0; x < map.cols; x++) {
      const kind = floorAt(map, x, y);
      if (!kind || isWallAt(map, x, y)) continue;
      const list = tiles.get(kind) ?? [];
      list.push([x, y]);
      tiles.set(kind, list);
    }
  }
  for (const [kind, cells] of tiles) {
    const texture = kind === "path" ? pavingTexture() : floorTexture(kind);
    const mesh = new THREE.Mesh(tileSurface(cells), standard("#ffffff", { map: texture }));
    mesh.position.y = 0.01;
    mesh.receiveShadow = true;
    root.add(mesh);
  }
}

function tileSurface(cells: readonly (readonly [number, number])[]) {
  const positions = new Float32Array(cells.length * 12);
  const normals = new Float32Array(cells.length * 12);
  const uvs = new Float32Array(cells.length * 8);
  const indices = new Uint32Array(cells.length * 6);
  cells.forEach(([x, z], i) => {
    // North-west, north-east, south-west and south-east corners.
    const corners = [[x, z], [x + 1, z], [x, z + 1], [x + 1, z + 1]] as const;
    corners.forEach(([cx, cz], c) => {
      positions.set([cx, 0, cz], i * 12 + c * 3);
      normals.set([0, 1, 0], i * 12 + c * 3);
      // The texture's v runs north, as on a plane laid flat.
      uvs.set([cx / 2, -cz / 2], i * 8 + c * 2);
    });
    // Two triangles, wound to face up.
    const a = i * 4;
    indices.set([a, a + 2, a + 1, a + 1, a + 2, a + 3], i * 6);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

// Light stone paving for paths: square slabs half a tile across, in a few shades, with joints.
function pavingTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  let seed = 11;
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let x = 0; x < 4; x++) {
    for (let y = 0; y < 4; y++) {
      ctx.fillStyle = ["#dcd6ca", "#d3ccbf", "#e2ddd2", "#d7d0c3"][Math.floor(rand() * 4)]!;
      ctx.fillRect(x * 16, y * 16, 16, 16);
    }
  }
  for (let i = 0; i < 120; i++) {
    ctx.fillStyle = rand() < 0.5 ? "rgba(150, 140, 120, 0.25)" : "rgba(255, 255, 255, 0.3)";
    ctx.fillRect(rand() * 64, rand() * 64, 1, 1);
  }
  ctx.fillStyle = "#bcb4a5";
  for (let i = 0; i < 64; i += 16) {
    ctx.fillRect(i, 0, 1, 64);
    ctx.fillRect(0, i, 64, 1);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  texture.magFilter = THREE.NearestFilter;
  return texture;
}

// A block on every wall tile, WALL_HEIGHT tall with the dark cap Clario HQ's walls have, and a
// skirting band round its foot. Two instanced meshes draw them all.
function buildWalls(root: THREE.Object3D, map: CustomMap) {
  const cells: [number, number][] = [];
  for (let y = 0; y < map.rows; y++) for (let x = 0; x < map.cols; x++) if (isWallAt(map, x, y)) cells.push([x, y]);
  if (!cells.length) return;
  const colors = WALL_COLORS.exterior;
  const face = standard(colors.face);
  // Box faces: +x, -x, top, bottom, +z, -z. The top is the cap.
  const blocks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, WALL_HEIGHT, 1), [face, face, standard(CAP_COLOR), face, face, face], cells.length);
  const skirting = new THREE.InstancedMesh(new THREE.BoxGeometry(1.02, 0.42, 1.02), standard(colors.wainscot), cells.length);
  const matrix = new THREE.Matrix4();
  cells.forEach(([x, z], i) => {
    blocks.setMatrixAt(i, matrix.makeTranslation(x + 0.5, WALL_HEIGHT / 2, z + 0.5));
    skirting.setMatrixAt(i, matrix.makeTranslation(x + 0.5, 0.21, z + 0.5));
  });
  for (const mesh of [blocks, skirting]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    root.add(mesh);
  }
}
