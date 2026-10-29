import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

// Claude in the 3D view, for the Open Desks cubicle chairs (HQ_CLAUDE_SEATS in
// lib/maps/clario-hq.ts), matching the 2D map's (phaser/scenes/claude-npcs.ts): the Claude Code
// mascot's blocky shape (a square orange body, slit eyes, nub arms and four short legs) sitting
// on the chair and typing, with the spark Claude Code spins while it works above its head.
// One unit is one tile; it faces +z, like a chair turned "down".

const ORANGE = "#d97757";
const W = 0.54; // body width, height and depth
const H = 0.36;
const D = 0.34;
const SEAT = 0.44; // top of the office chair's cushion

function sparkTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.translate(32, 32);
  ctx.fillStyle = ORANGE;
  for (let i = 0; i < 8; i++) {
    ctx.rotate(Math.PI / 4);
    ctx.beginPath();
    ctx.moveTo(-5, 0);
    ctx.lineTo(0, i % 2 ? -20 : -29);
    ctx.lineTo(5, 0);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = "#f6c3ae";
  ctx.beginPath();
  ctx.arc(0, 0, 5, 0, Math.PI * 2);
  ctx.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// `phase` (seconds) keeps several of them from typing in step.
export function makeClaude3d(phase = 0) {
  const group = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: ORANGE, roughness: 0.62 });
  const dark = new THREE.MeshStandardMaterial({ color: "#1f1a17", roughness: 0.4 });
  const part = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    group.add(mesh);
    return mesh;
  };

  const bodyY = SEAT + H / 2;
  const body = part(new RoundedBoxGeometry(W, H, D, 2, 0.025), skin, 0, bodyY, 0);
  const eye = new THREE.BoxGeometry(0.035, 0.09, 0.01);
  for (const x of [-0.145, 0.145]) part(eye, dark, x, bodyY + H * 0.12, D / 2 + 0.005).castShadow = false;
  const arm = new THREE.BoxGeometry(0.09, 0.08, 0.14);
  const armY = bodyY - H * 0.08;
  const left = part(arm, skin, -W / 2 - 0.04, armY, 0.06);
  const right = part(arm, skin, W / 2 + 0.04, armY, 0.06);
  // Seated, the legs hang over the front of the cushion.
  const leg = new THREE.BoxGeometry(0.05, 0.12, 0.05);
  for (const x of [-0.19, -0.1, 0.1, 0.19]) part(leg, skin, x, SEAT - 0.04, D / 2 - 0.03);

  const spark = new THREE.Sprite(new THREE.SpriteMaterial({ map: sparkTexture(), transparent: true, depthWrite: false }));
  // High enough to clear the office chair's backrest.
  const sparkY = SEAT + H + 0.5;
  spark.scale.setScalar(0.26);
  spark.position.y = sparkY;
  group.add(spark);

  // Typing in bursts with pauses to think, and the spark spinning and pulsing.
  body.onBeforeRender = () => {
    const t = performance.now() / 1000 + phase;
    const typing = t % 3.6 < 2.4;
    const beat = Math.floor(t / 0.14) % 2 === 0;
    left.position.y = armY - (typing && beat ? 0.03 : 0);
    right.position.y = armY - (typing && !beat ? 0.03 : 0);
    spark.material.rotation = t * 1.6;
    spark.scale.setScalar(0.23 + 0.05 * Math.abs(Math.sin(t * 2.2)));
    spark.position.y = sparkY + 0.02 * Math.sin(t * 2.5);
  };
  return group;
}
