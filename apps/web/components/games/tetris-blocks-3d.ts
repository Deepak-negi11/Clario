// The Tetris blocks in 3D, standing in the cabinet's monitor just in front of the tube: glossy
// bevelled cubes (one instanced mesh for the lot), lit by the room and glowing in their own colour,
// a see-through ghost where the piece will land, and cleared rows that flash white and shrink away.
// Sparks fly off cleared rows. The tube (tetris-screen.ts) still draws everything else, and leaves
// the well empty for these. With reduced motion rows flash without shrinking and there are no sparks.

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { CLEAR_TIME, COLS, HIDDEN, ROWS, pieceCells, type Tetris } from "./tetris-rules";
import { PIECE_COLORS, SCREEN_PX, WELL_LAYOUT } from "./tetris-screen";

const MAX_BLOCKS = COLS * (ROWS - HIDDEN) + 4;

// The tube's size and bulge (tetris-3d.ts), so blocks sit just off its curved face.
export type TubeShape = { width: number; height: number; bulge: number };

export function createWellBlocks(tube: THREE.Object3D, shape: TubeShape, reducedMotion: boolean) {
  const metre = shape.width / SCREEN_PX.width;
  const cell = WELL_LAYOUT.cell * metre;
  const depth = cell * 0.85;
  // Screen pixels to the tube's own space (x right, y up, z out of the glass).
  const at = (px: number, py: number) => {
    const x = (px - SCREEN_PX.width / 2) * metre;
    const y = (SCREEN_PX.height / 2 - py) * metre;
    const nx = x / (shape.width / 2);
    const ny = y / (shape.height / 2);
    return new THREE.Vector3(x, y, shape.bulge * (1 - nx * nx * 0.8) * (1 - ny * ny * 0.8) + depth / 2 + 0.0006);
  };
  const cellAt = (x: number, y: number) => at(WELL_LAYOUT.x + (x + 0.5) * WELL_LAYOUT.cell, WELL_LAYOUT.y + (y - HIDDEN + 0.5) * WELL_LAYOUT.cell);

  const geometry = new RoundedBoxGeometry(cell * 0.94, cell * 0.94, depth, 2, cell * 0.16);
  const material = new THREE.MeshPhysicalMaterial({ roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.12 });
  // Each block also glows a little in its own colour, as if lit from inside by the tube.
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <emissivemap_fragment>",
      "#include <emissivemap_fragment>\n#if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )\n  totalEmissiveRadiance += vColor.rgb * 0.16;\n#endif",
    );
  };
  material.customProgramCacheKey = () => "tetris-block-glow";
  const blocks = new THREE.InstancedMesh(geometry, material, MAX_BLOCKS);
  blocks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  blocks.count = 0;
  blocks.frustumCulled = false;
  const ghost = new THREE.InstancedMesh(
    geometry,
    new THREE.MeshStandardMaterial({ color: "#ffffff", transparent: true, opacity: 0.16, roughness: 0.4, depthWrite: false }),
    4,
  );
  ghost.count = 0;
  ghost.frustumCulled = false;
  tube.add(blocks, ghost);

  // Sparks: points that fly out of the glass, fall and fade.
  const SPARKS = 160;
  const positions = new Float32Array(SPARKS * 3).fill(-1000);
  const colors = new Float32Array(SPARKS * 4);
  const velocity = new Float32Array(SPARKS * 3);
  const life = new Float32Array(SPARKS);
  const max = new Float32Array(SPARKS).fill(1);
  let nextSpark = 0;
  const sparkGeometry = new THREE.BufferGeometry();
  sparkGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  sparkGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 4).setUsage(THREE.DynamicDrawUsage));
  const dot = document.createElement("canvas");
  dot.width = dot.height = 32;
  const dotCtx = dot.getContext("2d")!;
  const glow = dotCtx.createRadialGradient(16, 16, 0, 16, 16, 16);
  glow.addColorStop(0, "rgba(255,255,255,1)");
  glow.addColorStop(0.45, "rgba(255,255,255,0.8)");
  glow.addColorStop(1, "rgba(255,255,255,0)");
  dotCtx.fillStyle = glow;
  dotCtx.fillRect(0, 0, 32, 32);
  const sparks = new THREE.Points(
    sparkGeometry,
    new THREE.PointsMaterial({ size: cell * 0.55, map: new THREE.CanvasTexture(dot), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  sparks.frustumCulled = false;
  tube.add(sparks);

  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const color = new THREE.Color();
  const white = new THREE.Color("#ffffff");

  function place(mesh: THREE.InstancedMesh, index: number, x: number, y: number, size = 1) {
    scale.setScalar(size);
    matrix.compose(cellAt(x, y), quaternion, scale);
    mesh.setMatrixAt(index, matrix);
  }

  return {
    // A burst along each cleared row.
    burst(rows: number[], game: Tetris) {
      if (reducedMotion) return;
      for (const y of rows) {
        for (let x = 0; x < COLS; x++) {
          const kind = game.state.board[y]?.[x];
          color.set(kind ? PIECE_COLORS[kind].light : "#ffffff");
          for (let n = 0; n < 2; n++) {
            const i = nextSpark;
            nextSpark = (nextSpark + 1) % SPARKS;
            const from = cellAt(x, y);
            positions.set([from.x, from.y, from.z], i * 3);
            const angle = Math.random() * Math.PI * 2;
            const speed = cell * (4 + Math.random() * 6);
            velocity.set([Math.cos(angle) * speed, Math.sin(angle) * speed + cell * 3, cell * (2 + Math.random() * 4)], i * 3);
            colors.set([color.r, color.g, color.b, 1], i * 4);
            max[i] = life[i] = 0.35 + Math.random() * 0.35;
          }
        }
      }
    },

    update(game: Tetris, dt: number) {
      const { state } = game;
      // The board shows only while a game is on: the tube's cards need the well clear.
      const shown = state.phase === "playing";
      let count = 0;
      if (shown) {
        const clearing = state.clearing;
        const progress = clearing ? Math.min(1, clearing.time / CLEAR_TIME) : 0;
        for (let y = HIDDEN; y < ROWS; y++) {
          const row = state.board[y]!;
          const isClearing = clearing?.rows.includes(y) ?? false;
          for (let x = 0; x < COLS; x++) {
            const kind = row[x];
            if (!kind) continue;
            const size = isClearing && !reducedMotion ? Math.max(0.01, 1 - progress * progress) : 1;
            place(blocks, count, x, y, size);
            color.set(PIECE_COLORS[kind].face);
            if (isClearing) color.lerp(white, reducedMotion ? 0.7 : 0.4 + progress * 0.6);
            blocks.setColorAt(count, color);
            count++;
          }
        }
        if (state.piece) {
          for (const [x, y] of pieceCells(state.piece)) {
            if (y < HIDDEN) continue;
            place(blocks, count, x, y);
            blocks.setColorAt(count, color.set(PIECE_COLORS[state.piece.kind].face));
            count++;
          }
        }
      }
      blocks.count = count;
      blocks.instanceMatrix.needsUpdate = true;
      if (blocks.instanceColor) blocks.instanceColor.needsUpdate = true;

      const landing = shown ? game.ghost() : null;
      let ghosts = 0;
      if (landing && state.piece && landing.y !== state.piece.y) {
        (ghost.material as THREE.MeshStandardMaterial).color.set(PIECE_COLORS[landing.kind].face);
        for (const [x, y] of pieceCells(landing)) if (y >= HIDDEN) place(ghost, ghosts++, x, y, 0.96);
      }
      ghost.count = ghosts;
      ghost.instanceMatrix.needsUpdate = true;

      let alive = false;
      for (let i = 0; i < SPARKS; i++) {
        if (life[i]! <= 0) continue;
        alive = true;
        life[i] = life[i]! - dt;
        velocity[i * 3 + 1] = velocity[i * 3 + 1]! - cell * 22 * dt;
        for (let axis = 0; axis < 3; axis++) positions[i * 3 + axis] = positions[i * 3 + axis]! + velocity[i * 3 + axis]! * dt;
        colors[i * 4 + 3] = Math.max(0, life[i]! / max[i]!);
      }
      if (alive) {
        sparkGeometry.attributes.position!.needsUpdate = true;
        sparkGeometry.attributes.color!.needsUpdate = true;
      }
    },
  };
}

export type WellBlocks = ReturnType<typeof createWellBlocks>;
