// Snake in 3D (three.js): the office floor between low partition walls, seen from above at an
// angle, under a soft daylight. The rules stay in snake.ts; this only draws what view() reads, so
// every way of playing looks the same.
//
// Each snake glides from cell to cell instead of jumping: a body part slides from where the part in
// front of it was to where it is now, over the time the game takes for one step, so nothing is drawn
// ahead of the game and a turn shows the moment it happens. Bodies sway a little as they go, heads
// look where they're going and flick their tongues; a snake on espresso trails steam. Mugs steam,
// new treats pop up and the last moments of one blink. With reduced motion there's no sway, steam,
// popping or shaking; the snakes still glide.

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { seeded, type GameStageFactory } from "./arcade-kit";
import { SNAKE_LAYOUT as S, type Cell, type ItemKind, type SnakeView } from "./snake";
import { approach, createStageKit, loadOfficeChair, officeChairCopy, paintedTexture, shadowed } from "./stage-kit";

// One cell is one unit here; the floor is 24 by 16.
const toX = (x: number) => x - S.cols / 2 + 0.5;
const toZ = (y: number) => y - S.rows / 2 + 0.5;
const RADIUS = 0.4;
const WALL_H = 0.85;
const WALL_T = 0.35;
const MAX_PARTS = S.cols * S.rows * 3;
// Treats are drawn a bit larger than life so they read from up here.
const ITEM_SCALE = 1.35;

const ITEM_COLORS: Record<ItemKind, string> = { mug: S.mug.crema, donut: "#f2a0c0", espresso: "#ffe08a", bean: "#8a5a3b" };

function mat(color: THREE.ColorRepresentation, roughness = 0.6, extra: THREE.MeshStandardMaterialParameters = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness, ...extra });
}

// A coffee mug, steam rising off it.
function makeMug() {
  const group = new THREE.Group();
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.21, 0.4, 28, 1, true), mat(S.mug.cup, 0.3, { side: THREE.DoubleSide }));
  cup.position.y = 0.2;
  const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.21, 24).rotateX(-Math.PI / 2), mat(S.mug.shade, 0.4));
  bottom.position.y = 0.005;
  const coffee = new THREE.Mesh(new THREE.CircleGeometry(0.225, 28).rotateX(-Math.PI / 2), mat(S.mug.coffee, 0.15));
  coffee.position.y = 0.34;
  const crema = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.025, 6, 24).rotateX(Math.PI / 2), mat(S.mug.crema, 0.4));
  crema.position.y = 0.345;
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.035, 8, 16, Math.PI * 1.2), mat(S.mug.cup, 0.3));
  handle.rotation.z = -Math.PI * 0.6;
  handle.position.set(0.27, 0.2, 0);
  group.add(cup, bottom, coffee, crema, handle);
  const steam = [0, 1, 2].map((index) => {
    const puff = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0, depthWrite: false }));
    puff.userData.offset = index / 3;
    group.add(puff);
    return puff;
  });
  group.userData.steam = steam;
  return group;
}

// A ring donut with pink icing and sprinkles.
function makeDonut(seed: number) {
  const group = new THREE.Group();
  const dough = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.11, 14, 28).rotateX(Math.PI / 2), mat("#c98a4b", 0.7));
  dough.position.y = 0.11;
  const icing = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.104, 14, 28).rotateX(Math.PI / 2), mat("#f2a0c0", 0.35));
  icing.scale.y = 0.6;
  icing.position.y = 0.16;
  group.add(dough, icing);
  const rand = seeded(seed);
  const sprinkle = new THREE.CapsuleGeometry(0.012, 0.04, 2, 4);
  for (let i = 0; i < 14; i++) {
    const angle = rand() * Math.PI * 2;
    const reach = 0.15 + rand() * 0.15;
    const bit = new THREE.Mesh(sprinkle, mat(["#ffffff", "#3fc5d6", "#f2c14e", "#4caf6d"][i % 4]!, 0.5));
    bit.position.set(Math.cos(angle) * reach, 0.215, Math.sin(angle) * reach);
    bit.rotation.set(Math.PI / 2, 0, rand() * Math.PI);
    group.add(bit);
  }
  return group;
}

// An espresso on its saucer.
function makeEspresso() {
  const group = new THREE.Group();
  const saucer = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.22, 0.04, 28), mat("#e7e3da", 0.35));
  saucer.position.y = 0.02;
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.11, 0.18, 24), mat("#f2f0eb", 0.3));
  cup.position.y = 0.13;
  const coffee = new THREE.Mesh(new THREE.CircleGeometry(0.125, 20).rotateX(-Math.PI / 2), mat("#3b2214", 0.15));
  coffee.position.y = 0.221;
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.018, 6, 12, Math.PI * 1.2), mat("#f2f0eb", 0.3));
  handle.rotation.z = -Math.PI * 0.6;
  handle.position.set(0.16, 0.14, 0);
  group.add(saucer, cup, coffee, handle);
  return group;
}

// A roasted coffee bean, with its crease.
function makeBean() {
  const group = new THREE.Group();
  const bean = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 10), mat("#5a3420", 0.45));
  bean.scale.set(1, 0.65, 1.4);
  bean.position.y = 0.085;
  const crease = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.3), mat("#2e190e", 0.6));
  crease.position.y = 0.17;
  group.add(bean, crease);
  group.rotation.y = 0.6;
  return group;
}

// The furniture on the floor: a potted plant (2 x 2 cells), a small office chair, a cardboard box.
function makePlant(seed: number) {
  const group = new THREE.Group();
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.56, 0.85, 28), mat("#c8714b", 0.75));
  pot.position.y = 0.425;
  const lip = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.06, 8, 28).rotateX(Math.PI / 2), mat("#9a5034", 0.7));
  lip.position.y = 0.85;
  const soil = new THREE.Mesh(new THREE.CircleGeometry(0.68, 24).rotateX(-Math.PI / 2), mat("#3b2a1f", 0.95));
  soil.position.y = 0.8;
  group.add(pot, lip, soil);
  const rand = seeded(seed);
  const leaf = new THREE.SphereGeometry(1, 12, 8);
  const greens = ["#2c6e47", "#42a061", "#7fcb8f", "#357f52"];
  for (let i = 0; i < 11; i++) {
    const angle = (i / 11) * Math.PI * 2 + rand() * 0.4;
    const lean = 0.5 + rand() * 0.5;
    const blade = new THREE.Mesh(leaf, mat(greens[i % greens.length]!, 0.55));
    blade.scale.set(0.16, 0.7 + rand() * 0.25, 0.08);
    const holder = new THREE.Group();
    holder.position.y = 0.85;
    holder.rotation.set(0, -angle, lean);
    blade.position.y = 0.55;
    holder.add(blade);
    group.add(holder);
  }
  return group;
}

function makeChair(turn: number) {
  const group = new THREE.Group();
  const metal = mat("#1d1f23", 0.35, { metalness: 0.6 });
  const fabric = mat("#3a3d44", 0.8);
  for (let leg = 0; leg < 5; leg++) {
    const angle = (leg / 5) * Math.PI * 2;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.05, 0.07), metal);
    arm.position.set(Math.cos(angle) * 0.18, 0.08, Math.sin(angle) * 0.18);
    arm.rotation.y = -angle;
    const wheel = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), metal);
    wheel.position.set(Math.cos(angle) * 0.36, 0.05, Math.sin(angle) * 0.36);
    group.add(arm, wheel);
  }
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.36, 10), metal);
  post.position.y = 0.26;
  const seat = new THREE.Mesh(new RoundedBoxGeometry(0.72, 0.13, 0.7, 3, 0.05), fabric);
  seat.position.y = 0.48;
  const back = new THREE.Mesh(new RoundedBoxGeometry(0.66, 0.62, 0.11, 3, 0.05), mat("#4d515a", 0.8));
  back.position.set(0, 0.86, -0.32);
  back.rotation.x = -0.12;
  group.add(post, seat, back);
  group.rotation.y = turn;
  group.scale.setScalar(1.25);
  return group;
}

function makeBox() {
  const group = new THREE.Group();
  const box = new THREE.Mesh(new RoundedBoxGeometry(1.86, 0.85, 0.9, 2, 0.03), mat("#c8a06b", 0.9));
  box.position.y = 0.425;
  const tape = new THREE.Mesh(new THREE.BoxGeometry(1.88, 0.012, 0.22), mat("#e3cfa6", 0.5));
  tape.position.y = 0.855;
  const seam = new THREE.Mesh(new THREE.BoxGeometry(1.84, 0.014, 0.02), mat("#a07d4c", 0.9));
  seam.position.y = 0.857;
  group.add(box, tape, seam);
  return group;
}

const ITEM_MAKERS: Record<ItemKind, (seed: number) => THREE.Group> = { mug: makeMug, donut: makeDonut, espresso: makeEspresso, bean: makeBean };

export const createSnakeStage: GameStageFactory = (options) => {
  const kit = createStageKit({ ...options, backdrop: "#2a2d33", reflections: 0.28, sparkSize: 0.16, gravity: 7 });
  const { scene, motion } = kit;
  const wide = S.cols;
  const deep = S.rows;

  scene.add(new THREE.HemisphereLight("#f4f1ea", "#3e424a", 0.85));
  const sun = new THREE.DirectionalLight("#fff6e8", 2.3);
  sun.position.set(-7, 18, 9);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -15;
  sun.shadow.camera.right = 15;
  sun.shadow.camera.top = 11;
  sun.shadow.camera.bottom = -11;
  sun.shadow.camera.near = 5;
  sun.shadow.camera.far = 45;
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.04;
  sun.shadow.radius = 3;
  scene.add(sun, sun.target);

  // Carpet tiles: two shades laid in a check, flecked, with a faint seam between them.
  const carpet = paintedTexture(512, 512, (ctx) => {
    for (let ty = 0; ty < 2; ty++)
      for (let tx = 0; tx < 2; tx++) {
        ctx.fillStyle = ["#5c6169", "#61666e"][(tx + ty) % 2]!;
        ctx.fillRect(tx * 256, ty * 256, 256, 256);
      }
    const rand = seeded(41);
    for (let i = 0; i < 16000; i++) {
      ctx.fillStyle = ["#555a62", "#686d75", "#62666e", "#4f535a"][Math.floor(rand() * 4)]!;
      ctx.fillRect(rand() * 512, rand() * 512, 1.5, 1.5);
    }
    ctx.fillStyle = "rgba(20,22,26,0.35)";
    for (const at of [0, 256]) {
      ctx.fillRect(at, 0, 2, 512);
      ctx.fillRect(0, at, 512, 2);
    }
  });
  carpet.texture.wrapS = carpet.texture.wrapT = THREE.RepeatWrapping;
  carpet.texture.repeat.set(wide / 8, deep / 8);
  carpet.texture.anisotropy = kit.anisotropy;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(wide, deep), mat("#ffffff", 0.98, { map: carpet.texture, bumpMap: carpet.texture, bumpScale: 0.6 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const outside = new THREE.Mesh(new THREE.PlaneGeometry(90, 70), mat("#3a3d44", 0.9));
  outside.rotation.x = -Math.PI / 2;
  outside.position.y = -0.01;
  outside.receiveShadow = true;
  scene.add(outside);

  // Partition walls all round: fabric panels with a pale cap.
  const fabric = mat("#7d8592", 0.95);
  const cap = mat("#d3d6dc", 0.5);
  for (const [x, z, w, d] of [
    [0, -deep / 2 - WALL_T / 2, wide + WALL_T * 2, WALL_T],
    [0, deep / 2 + WALL_T / 2, wide + WALL_T * 2, WALL_T],
    [-wide / 2 - WALL_T / 2, 0, WALL_T, deep],
    [wide / 2 + WALL_T / 2, 0, WALL_T, deep],
  ] as const) {
    const wall = new THREE.Mesh(new RoundedBoxGeometry(w, WALL_H, d, 2, 0.04), fabric);
    wall.position.set(x, WALL_H / 2, z);
    const top = new THREE.Mesh(new RoundedBoxGeometry(w + 0.04, 0.06, d + 0.04, 2, 0.02), cap);
    top.position.set(x, WALL_H + 0.03, z);
    scene.add(shadowed(wall), shadowed(top));
  }

  // The furniture, where the game has it.
  // The furniture, where the game has it. Chairs are the office's own swivel chair once its model
  // is here (a simpler built one until then, or if it can't load).
  const chairSpots: { holder: THREE.Group; turn: number }[] = [];
  S.obstacles.forEach((obstacle, index) => {
    const piece = obstacle.kind === "plant" ? makePlant(index * 13 + 5) : obstacle.kind === "chair" ? new THREE.Group() : makeBox();
    if (obstacle.kind === "chair") {
      piece.add(makeChair(index * 1.7));
      chairSpots.push({ holder: piece, turn: index * 1.7 });
    }
    piece.position.set(toX(obstacle.x) + (obstacle.w - 1) / 2, 0, toZ(obstacle.y) + (obstacle.h - 1) / 2);
    scene.add(shadowed(piece));
  });
  const ready = loadOfficeChair().then((model) => {
    if (!model) return;
    for (const spot of chairSpots) {
      spot.holder.clear();
      const chair = officeChairCopy(model, 0.95);
      chair.rotation.y = spot.turn;
      spot.holder.add(shadowed(chair));
    }
  });

  // Snakes: a run of overlapping spheres (three to a cell), tapering to the tail,
  // and a head with eyes and a tongue.
  const partGeometry = new THREE.SphereGeometry(RADIUS, 18, 12);
  const eyeWhite = mat("#f6f5f1", 0.3);
  const pupil = mat("#101114", 0.2);
  const tongueMaterial = mat("#c0392b", 0.5);
  type SnakeMesh = {
    body: THREE.InstancedMesh;
    material: THREE.MeshStandardMaterial;
    head: THREE.Group;
    headMaterial: THREE.MeshStandardMaterial;
    tongue: THREE.Group;
    cells: Cell[];
    tail: Cell | null;
    steppedAt: number;
    stepEvery: number;
    yaw: number;
    dead: boolean;
    puff: number;
  };
  let snakeMeshes: SnakeMesh[] = [];
  let skinsFor = "";
  function buildSnakes(count: number, solo: boolean) {
    for (const old of snakeMeshes) {
      scene.remove(old.body, old.head);
      old.body.dispose();
      old.material.dispose();
      old.headMaterial.dispose();
    }
    snakeMeshes = Array.from({ length: count }, (_, index) => {
      const skin = S.skins[solo ? 3 : index]!;
      const material = mat("#ffffff", 0.42, { transparent: true });
      const body = new THREE.InstancedMesh(partGeometry, material, MAX_PARTS);
      body.count = 0;
      body.castShadow = true;
      body.receiveShadow = true;
      body.frustumCulled = false;
      const headMaterial = mat(skin.head, 0.4, { transparent: true });
      const head = new THREE.Group();
      const skull = new THREE.Mesh(partGeometry, headMaterial);
      skull.scale.set(1.12, 0.85, 1.3);
      head.add(skull);
      for (const side of [-1, 1]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), eyeWhite);
        eye.position.set(side * 0.22, 0.17, 0.24);
        const dot = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), pupil);
        dot.position.set(side * 0.24, 0.2, 0.33);
        head.add(eye, dot);
      }
      const tongue = new THREE.Group();
      for (const side of [-1, 1]) {
        const fork = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.015, 0.16), tongueMaterial);
        fork.position.set(side * 0.03, 0, 0.08);
        fork.rotation.y = side * 0.35;
        tongue.add(fork);
      }
      tongue.position.set(0, -0.02, 0.48);
      head.add(tongue);
      shadowed(head, true, false);
      scene.add(body, head);
      return { body, material, head, headMaterial, tongue, cells: [], tail: null, steppedAt: 0, stepEvery: 1 / 7, yaw: 0, dead: false, puff: 0 };
    });
    skinsFor = `${count}-${solo}`;
  }

  // Treats on the floor, by kind and cell; each pops up when it appears.
  type ItemMesh = { group: THREE.Group; kind: ItemKind; x: number; z: number; grow: number };
  const itemMeshes = new Map<string, ItemMesh>();
  let itemSeed = 1;

  const color = new THREE.Color();
  const grey = new THREE.Color("#8d9097");
  const matrix = new THREE.Matrix4();
  const place = new THREE.Vector3();
  const size = new THREE.Vector3();
  const turnNone = new THREE.Quaternion();
  const at = new THREE.Vector3();
  const points: { x: number; z: number }[] = [];
  let before: SnakeView | null = null;

  kit.frame(
    { position: new THREE.Vector3(0, 26, 14), target: new THREE.Vector3(0, 0, 0.8), fov: 38, fog: [32, 70] },
    {
      plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), -RADIUS),
      toField: (point) => ({ x: (point.x + wide / 2) * S.cell, y: (point.z + deep / 2) * S.cell }),
    },
  );

  return kit.stage(
    (view, dt, time) => {
      if (view.kind !== "snake") return;
      const v: SnakeView = view;
      const settled = v.phase === "ready" || v.phase === "over" || v.phase === "won";
      if (snakeMeshes.length !== v.snakes.length || skinsFor !== `${v.snakes.length}-${v.solo}`) buildSnakes(v.snakes.length, v.solo);

      v.snakes.forEach((snake, index) => {
        const mesh = snakeMeshes[index]!;
        const skin = S.skins[v.solo ? 3 : index]!;
        const body = snake.body;
        const head = body[0];
        if (!head) return;
        // A step: remember where the tail was (it stays put while the snake grows) and how long
        // steps take, for games whose clock this copy doesn't see.
        const last = mesh.cells[0];
        if (!last || last.x !== head.x || last.y !== head.y) {
          const grew = body.length > mesh.cells.length;
          mesh.tail = grew || !mesh.cells.length ? (body[body.length - 1] ?? null) : (mesh.cells[mesh.cells.length - 1] ?? null);
          if (last) mesh.stepEvery = (mesh.stepEvery + Math.min(0.5, Math.max(0.05, time - mesh.steppedAt))) / 2;
          mesh.steppedAt = time;
          mesh.cells = body.map((cell) => ({ ...cell }));
        }
        const clock = v.clock[index];
        const progress = settled || snake.dead ? 1 : clock ?? Math.min(1, (time - mesh.steppedAt) / mesh.stepEvery);

        // Where each part is drawn: on its way from the cell of the part behind it to its own.
        points.length = 0;
        body.forEach((cell, part) => {
          const from = body[part + 1] ?? mesh.tail ?? cell;
          points.push({ x: toX(from.x + (cell.x - from.x) * progress), z: toZ(from.y + (cell.y - from.y) * progress) });
        });
        const parts = points.length;
        let n = 0;
        const sway = motion && !snake.dead && !settled ? 0.07 : 0;
        for (let part = 0; part < parts; part++) {
          for (const half of part < parts - 1 ? [0, 1 / 3, 2 / 3] : [0]) {
            const a = points[part]!;
            const b = points[Math.min(parts - 1, part + 1)]!;
            const x = a.x + (b.x - a.x) * half;
            const z = a.z + (b.z - a.z) * half;
            const along = part + half;
            // Sideways to the way this bit of body runs, for the sway.
            const dx = b.x - a.x || 0.0001;
            const dz = b.z - a.z;
            const length = Math.hypot(dx, dz) || 1;
            const wave = along < 1 ? 0 : Math.sin(time * 7 - along * 0.9) * sway;
            const taper = Math.max(0.5, Math.min(1, (parts - along) / 3.2));
            const squash = snake.dead ? 0.55 : 1;
            place.set(x + (-dz / length) * wave, RADIUS * taper * squash, z + (dx / length) * wave);
            size.set(taper, taper * squash, taper);
            matrix.compose(place, turnNone, size);
            mesh.body.setMatrixAt(n, matrix);
            // King snakes are banded; the others have blotches down the back.
            const step = Math.round(along * 3);
            const marked = skin.bands ? step % 9 >= 6 : step % 7 === 3 || step % 7 === 4;
            color.set(marked ? skin.pattern : skin.body);
            if (snake.dead) color.lerp(grey, 0.55);
            mesh.body.setColorAt(n, color);
            n++;
          }
        }
        mesh.body.count = n;
        mesh.body.instanceMatrix.needsUpdate = true;
        if (mesh.body.instanceColor) mesh.body.instanceColor.needsUpdate = true;
        mesh.material.opacity = snake.dead ? 0.55 : 1;
        mesh.headMaterial.opacity = snake.dead ? 0.55 : 1;
        mesh.headMaterial.color.set(skin.head);
        if (snake.dead) mesh.headMaterial.color.lerp(grey, 0.55);

        // The head looks along the last bit of body, turning smoothly.
        const front = points[0]!;
        const neck = points[1];
        const face = neck ? Math.atan2(front.x - neck.x, front.z - neck.z) : { up: Math.PI, down: 0, left: -Math.PI / 2, right: Math.PI / 2 }[snake.heading];
        if (neck && Math.hypot(front.x - neck.x, front.z - neck.z) > 0.05) {
          let turn = face - mesh.yaw;
          turn = Math.atan2(Math.sin(turn), Math.cos(turn));
          mesh.yaw += turn * (1 - Math.exp(-18 * dt));
        } else if (!neck) mesh.yaw = face;
        mesh.head.position.set(front.x, RADIUS * (snake.dead ? 0.6 : 1.05), front.z);
        mesh.head.rotation.set(0, mesh.yaw, 0);
        const flick = motion && !snake.dead && Math.sin(time * 3 + index * 2) > 0.6;
        mesh.tongue.visible = flick || (!motion && !snake.dead);
        mesh.tongue.scale.z = flick ? 0.6 + Math.abs(Math.sin(time * 26)) * 0.6 : 1;

        // Espresso: steam off a snake in a hurry.
        if (snake.boost && !snake.dead && motion) {
          mesh.puff -= dt;
          if (mesh.puff <= 0) {
            mesh.puff = 0.08;
            const tail = points[Math.min(parts - 1, 2)]!;
            kit.burst(at.set(tail.x, RADIUS * 1.6, tail.z), "#f1ece4", 2, 1.2, 1);
          }
        }
        // A crash: a jolt, and dust where the head hit.
        if (snake.dead && !mesh.dead) {
          kit.kick(0.14);
          kit.burst(at.set(front.x, RADIUS, front.z), "#c9ccd2", 12, 3.2, 0.8);
        }
        mesh.dead = snake.dead;
      });

      // Treats: added as they appear (popping up), removed as they're eaten (with a splash in their
      // colour where a head took them). One about to vanish blinks.
      const present = new Set<string>();
      for (const item of v.items) {
        const key = `${item.kind}@${item.cell.x},${item.cell.y}`;
        present.add(key);
        let mesh = itemMeshes.get(key);
        if (!mesh) {
          const group = shadowed(ITEM_MAKERS[item.kind](itemSeed++));
          group.position.set(toX(item.cell.x), 0, toZ(item.cell.y));
          group.rotation.y = item.kind === "mug" ? 0.4 : group.rotation.y;
          scene.add(group);
          mesh = { group, kind: item.kind, x: toX(item.cell.x), z: toZ(item.cell.y), grow: before && motion ? 0 : 1 };
          itemMeshes.set(key, mesh);
        }
        mesh.grow = Math.min(1, mesh.grow + dt * 4);
        const t = mesh.grow;
        const pop = t >= 1 ? 1 : 1 + 2.4 * (t - 1) ** 3 + 1.4 * (t - 1) ** 2;
        mesh.group.scale.setScalar(Math.max(0.001, pop) * ITEM_SCALE);
        mesh.group.visible = !item.ending || !motion || Math.sin(time * 18) > -0.2;
        if (item.kind === "donut" && motion) mesh.group.rotation.y += dt * 0.6;
        for (const puff of (mesh.group.userData.steam as THREE.Mesh[] | undefined) ?? []) {
          const rise = motion ? (time * 0.45 + (puff.userData.offset as number)) % 1 : 0.35;
          puff.position.set(Math.sin(rise * 9 + (puff.userData.offset as number) * 6) * 0.06, 0.42 + rise * 0.6, 0);
          puff.scale.setScalar(0.6 + rise * 1.1);
          (puff.material as THREE.MeshBasicMaterial).opacity = (motion ? 0.45 : 0.25) * Math.sin(Math.PI * rise);
        }
      }
      for (const [key, mesh] of itemMeshes) {
        if (present.has(key)) continue;
        const eaten = v.snakes.some((snake) => {
          const head = snake.body[0];
          return head && toX(head.x) === mesh.x && toZ(head.y) === mesh.z;
        });
        if (eaten) kit.burst(at.set(mesh.x, 0.35, mesh.z), ITEM_COLORS[mesh.kind], 9, 2.4, 0.9);
        scene.remove(mesh.group);
        mesh.group.traverse((child) => {
          const part = child as THREE.Mesh;
          part.geometry?.dispose();
          (part.material as THREE.Material | undefined)?.dispose();
        });
        itemMeshes.delete(key);
      }

      // Alone, the camera drifts a little after your head.
      const mine = v.solo ? snakeMeshes[0]?.head.position : null;
      kit.follow.x = approach(kit.follow.x, motion && mine && !settled ? mine.x * 0.08 : 0, 1.5, dt);
      kit.follow.z = approach(kit.follow.z, motion && mine && !settled ? mine.z * 0.08 : 0, 1.5, dt);
      before = v;
    },
    { card: "middle", ready },
  );
};
