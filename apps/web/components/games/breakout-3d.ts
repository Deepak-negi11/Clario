// Breakout in 3D (three.js): the office cork board hanging on the wall, lit from above and to the
// left so every note, pin and paper ball throws a shadow on the cork. The rules stay in
// breakout.ts; this only draws what view() reads, so every way of playing looks the same.
//
// Sticky notes curl at the bottom, stacked notes show the sheet behind, index cards are pinned with
// one pin per hit left. A knocked-off note flutters to the floor, the top sheet of a stack peels
// away, and a new board's notes pop on one after another. Rulers dip when the ball bounces off
// them; the desk supplies that drop are small models of themselves. With reduced motion nothing
// flutters, pops or shakes.

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { PAL, SCREEN_H as H, SCREEN_W as W, clamp, seeded, type GameStageFactory } from "./arcade-kit";
import { BREAKOUT_LAYOUT as B, type BreakoutView, type DropKind } from "./breakout";
import { approach, createStageKit, paintedTexture, shadowed } from "./stage-kit";

// Metres per screen pixel: the 240 x 160 board is 1.2 m by 0.8 m.
const K = 0.005;
const toX = (x: number) => (x - W / 2) * K;
const toY = (y: number) => (H / 2 - y) * K;
const FRAME_DEPTH = 0.03;
const NOTE_Z = 0.0012;
const RULER_Z = 0.012;
const BALL_Z = 0.016;
const BALL_R = 0.0115;
const PAPER = PAL.paper;

// A crumpled paper ball: an icosphere pushed in and out at random, drawn with flat facets.
function crumpledBall(radius: number, seed: number) {
  const geometry = new THREE.IcosahedronGeometry(radius, 1);
  const rand = seeded(seed);
  const position = geometry.attributes.position!;
  const point = new THREE.Vector3();
  const moved = new Map<string, number>();
  for (let i = 0; i < position.count; i++) {
    point.fromBufferAttribute(position, i);
    // Faces share corners: move each corner once so the ball stays closed.
    const key = `${point.x.toFixed(4)},${point.y.toFixed(4)},${point.z.toFixed(4)}`;
    const scale = moved.get(key) ?? 0.78 + rand() * 0.34;
    moved.set(key, scale);
    point.multiplyScalar(scale);
    position.setXYZ(i, point.x, point.y, point.z);
  }
  geometry.computeVertexNormals();
  return geometry;
}

// A paperclip: a wire bent into two nested loops, lying in the XY plane.
function paperclip(length: number) {
  const w = length * 0.32;
  const points = [
    [0.3, -0.38], [0.3, 0.42], [-0.3, 0.42], [-0.3, -0.46], [0.16, -0.46], [0.16, 0.3], [-0.16, 0.3], [-0.16, -0.2],
  ].map(([x, y]) => new THREE.Vector3((x! * w) / 0.3, y! * length, 0));
  const path = new THREE.CatmullRomCurve3(points, false, "catmullrom", 0.2);
  return new THREE.TubeGeometry(path, 64, length * 0.025, 6, false);
}

// A sticky note's face: its colour and two scribbled lines of writing.
function notePaint(fill: string, ink: string, first: number, second: number) {
  return paintedTexture(96, 54, (ctx) => {
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, 96, 54);
    ctx.strokeStyle = ink;
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    for (const [row, length] of [[17, first], [29, second]] as const) {
      ctx.beginPath();
      ctx.moveTo(14, row);
      for (let x = 14; x < 14 + length * 6; x += 5) ctx.lineTo(x + 5, row + (x % 10 === 4 ? -2 : 2));
      ctx.stroke();
    }
  }).texture;
}

export const createBreakoutStage: GameStageFactory = (options) => {
  const kit = createStageKit({ ...options, backdrop: "#cfc8bb", reflections: 0.35, sparkSize: 0.012, gravity: 2.2 });
  const { scene, motion } = kit;
  const fieldW = W * K;
  const fieldH = H * K;

  // The room: a warm white wall, a light from the window side.
  scene.add(new THREE.HemisphereLight("#fff8ee", "#a89a86", 0.62));
  const sun = new THREE.DirectionalLight("#fff1dc", 2.1);
  sun.position.set(-0.9, 1.25, 1.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -0.85;
  sun.shadow.camera.right = 0.85;
  sun.shadow.camera.top = 0.65;
  sun.shadow.camera.bottom = -0.65;
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 4;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.004;
  sun.shadow.radius = 2.5;
  scene.add(sun, sun.target);

  const wallPaint = paintedTexture(256, 256, (ctx) => {
    ctx.fillStyle = "#e7e2d7";
    ctx.fillRect(0, 0, 256, 256);
    const rand = seeded(5);
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = rand() > 0.5 ? "rgba(255,255,255,0.18)" : "rgba(90,70,40,0.05)";
      ctx.fillRect(rand() * 256, rand() * 256, 2, 2);
    }
  });
  wallPaint.texture.wrapS = wallPaint.texture.wrapT = THREE.RepeatWrapping;
  wallPaint.texture.repeat.set(8, 6);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(8, 6), new THREE.MeshStandardMaterial({ map: wallPaint.texture, roughness: 0.92 }));
  wall.position.z = -0.012;
  wall.receiveShadow = true;
  scene.add(wall);

  // The cork, with its flecks pressed in, and the wooden frame round it (a deeper ledge at the
  // bottom, where the spare paper balls sit).
  const corkPaint = paintedTexture(768, 512, (ctx) => {
    ctx.fillStyle = B.board.cork;
    ctx.fillRect(0, 0, 768, 512);
    const rand = seeded(23);
    for (let i = 0; i < 9000; i++) {
      ctx.fillStyle = B.board.corkFlecks[Math.floor(rand() * 3)]!;
      const size = 1 + rand() * 3;
      ctx.fillRect(rand() * 768, rand() * 512, size, size);
    }
  });
  corkPaint.texture.anisotropy = kit.anisotropy;
  const cork = new THREE.Mesh(
    new THREE.BoxGeometry(fieldW, fieldH + B.frame * K, 0.01),
    new THREE.MeshStandardMaterial({ map: corkPaint.texture, bumpMap: corkPaint.texture, bumpScale: 1.2, roughness: 0.95 }),
  );
  cork.position.set(0, toY(H / 2) - (B.frame * K) / 2, -0.005);
  cork.receiveShadow = true;
  scene.add(cork);
  const frameWood = new THREE.MeshStandardMaterial({ color: B.board.frame, roughness: 0.55 });
  const side = B.frame * K;
  for (const [x, y, w, h, d] of [
    [toX(B.frame / 2), toY(H / 2) - side / 2, side, fieldH + side * 3, FRAME_DEPTH],
    [toX(W - B.frame / 2), toY(H / 2) - side / 2, side, fieldH + side * 3, FRAME_DEPTH],
    [0, toY(B.frame / 2), fieldW, side, FRAME_DEPTH],
    [0, toY(H) - side * 0.75, fieldW, side * 1.5, FRAME_DEPTH * 1.7],
  ] as const) {
    const piece = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, 0.004), frameWood);
    piece.position.set(x, y, d / 2 - 0.006);
    scene.add(shadowed(piece));
  }
  const ledgeTop = toY(H) - side * 0.75 + (side * 1.5) / 2;

  // Paper balls: the ones in play, and the spares on the ledge.
  const paper = new THREE.MeshStandardMaterial({ color: PAPER, roughness: 0.85, flatShading: true });
  const ballShapes = [crumpledBall(BALL_R, 3), crumpledBall(BALL_R, 7), crumpledBall(BALL_R, 11)];
  const balls = Array.from({ length: 6 }, (_, index) => {
    const mesh = shadowed(new THREE.Mesh(ballShapes[index % 3]!, paper), true, false);
    mesh.visible = false;
    scene.add(mesh);
    return { mesh, x: 0, y: 0, seen: false };
  });
  const spares = Array.from({ length: 5 }, (_, index) => {
    const mesh = shadowed(new THREE.Mesh(ballShapes[(index + 1) % 3]!, paper), true, false);
    mesh.position.set(toX(B.frame + 6 + index * 7), ledgeTop + BALL_R * 0.85, FRAME_DEPTH * 0.8);
    mesh.rotation.set(index, index * 2, 0);
    scene.add(mesh);
    return mesh;
  });

  // Notes: a face that lies flat on the cork and a strip along the bottom that curls away from it.
  const noteW = B.noteW * K;
  const noteH = B.noteH * K;
  const flatGeometry = new THREE.PlaneGeometry(noteW, noteH * 0.78).translate(0, noteH * 0.11, 0);
  const curlGeometry = new THREE.PlaneGeometry(noteW, noteH * 0.22).translate(0, -noteH * 0.11, 0);
  const cardGeometry = new THREE.BoxGeometry(noteW + 2 * K, noteH, 0.0008);
  const backGeometry = new THREE.PlaneGeometry(noteW, noteH);
  const pinHead = new THREE.SphereGeometry(0.0038, 12, 8);
  const pinNeedle = new THREE.CylinderGeometry(0.0008, 0.0008, 0.008, 6).rotateX(Math.PI / 2);
  const pinRed = new THREE.MeshStandardMaterial({ color: PAL.red, roughness: 0.3 });
  const steel = new THREE.MeshStandardMaterial({ color: "#c9ced6", roughness: 0.25, metalness: 0.9 });
  type Look = { faces: THREE.MeshStandardMaterial[]; curl: THREE.MeshStandardMaterial; back: THREE.MeshStandardMaterial };
  const looks = new Map<string, Look>();
  const rand = seeded(31);
  for (const [kind, style] of Object.entries(B.noteStyles)) {
    const faces = [0, 1, 2].map(() => new THREE.MeshStandardMaterial({ map: notePaint(style.fill, B.board.ink, 4 + Math.floor(rand() * 9), 2 + Math.floor(rand() * 8)), roughness: 0.8, side: THREE.DoubleSide }));
    const curl = new THREE.MeshStandardMaterial({ color: style.curl, roughness: 0.8, side: THREE.DoubleSide });
    looks.set(kind, { faces, curl, back: new THREE.MeshStandardMaterial({ color: style.curl, roughness: 0.85, side: THREE.DoubleSide }) });
  }
  const cardFace = paintedTexture(100, 50, (ctx) => {
    ctx.fillStyle = B.card.fill;
    ctx.fillRect(0, 0, 100, 50);
    ctx.fillStyle = B.card.line;
    for (let y = 18; y < 48; y += 7) ctx.fillRect(0, y, 100, 1.4);
    ctx.fillStyle = B.card.top;
    ctx.fillRect(0, 10, 100, 2);
  });
  const cardMaterial = new THREE.MeshStandardMaterial({ map: cardFace.texture, roughness: 0.75 });

  type NoteMesh = { group: THREE.Group; front: THREE.Group; back: THREE.Mesh | null; pins: THREE.Group[]; hits: number; appear: number };
  const board = new THREE.Group();
  scene.add(board);
  let noteMeshes: NoteMesh[] = [];
  let shownNotes: BreakoutView["notes"] | null = null;

  function buildNotes(notes: BreakoutView["notes"], popIn: boolean) {
    for (const old of noteMeshes) board.remove(old.group);
    const tilt = seeded(97);
    noteMeshes = notes.map((note, index) => {
      const group = new THREE.Group();
      const card = note.kind === "C";
      group.position.set(toX(note.x + B.noteW / 2), toY(note.y + B.noteH / 2), NOTE_Z);
      group.rotation.z = (tilt() * 2 - 1) * (card ? 0.025 : 0.05);
      const front = new THREE.Group();
      group.add(front);
      let back: THREE.Mesh | null = null;
      const pins: THREE.Group[] = [];
      if (card) {
        front.add(new THREE.Mesh(cardGeometry, cardMaterial));
        for (let pin = 0; pin < 3; pin++) {
          const holder = new THREE.Group();
          const head = new THREE.Mesh(pinHead, pinRed);
          head.position.z = 0.006;
          const needle = new THREE.Mesh(pinNeedle, steel);
          needle.position.z = 0.002;
          holder.add(head, needle);
          holder.position.set((3 + pin * 5 + 1 - B.noteW / 2) * K, (B.noteH / 2 - 1.5) * K, 0);
          group.add(holder);
          pins.push(holder);
        }
      } else {
        const look = looks.get(note.kind.toLowerCase())!;
        front.add(new THREE.Mesh(flatGeometry, look.faces[index % 3]!));
        const curl = new THREE.Mesh(curlGeometry, look.curl);
        // The strip hinges on its top edge and lifts off the cork.
        const hinge = new THREE.Group();
        hinge.position.y = -noteH * 0.28;
        hinge.add(curl);
        hinge.rotation.x = -0.38;
        front.add(hinge);
        if (note.kind !== note.kind.toLowerCase()) {
          back = new THREE.Mesh(backGeometry, look.back);
          back.position.set(2 * K, 2 * K, -0.0006);
          back.rotation.z = 0.03;
          group.add(back);
        }
      }
      shadowed(group, true, true);
      board.add(group);
      const appear = popIn && motion ? -index * 0.012 : 1;
      group.scale.setScalar(appear >= 1 ? 1 : 0.001);
      return { group, front, back, pins, hits: note.hits, appear };
    });
  }

  // Notes and top sheets that come off: they flutter down and fade out of the room.
  const flakes = Array.from({ length: 10 }, () => {
    const mesh = new THREE.Mesh<THREE.PlaneGeometry, THREE.Material>(backGeometry, cardMaterial);
    mesh.visible = false;
    mesh.castShadow = true;
    scene.add(mesh);
    return { mesh, velocity: new THREE.Vector3(), spin: new THREE.Vector3(), life: 0 };
  });
  let nextFlake = 0;
  function flutter(from: THREE.Object3D, material: THREE.Material) {
    if (!motion) return;
    const flake = flakes[nextFlake]!;
    nextFlake = (nextFlake + 1) % flakes.length;
    from.getWorldPosition(flake.mesh.position);
    flake.mesh.position.z += 0.004;
    flake.mesh.rotation.copy(from.rotation);
    flake.mesh.material = material;
    flake.velocity.set((Math.random() * 2 - 1) * 0.15, 0.12 + Math.random() * 0.1, 0.25 + Math.random() * 0.15);
    flake.spin.set((Math.random() * 2 - 1) * 6, (Math.random() * 2 - 1) * 5, (Math.random() * 2 - 1) * 4);
    flake.life = 1.3;
    flake.mesh.visible = true;
    flake.mesh.scale.setScalar(1);
  }
  function stepFlakes(dt: number) {
    for (const flake of flakes) {
      if (flake.life <= 0) continue;
      flake.life -= dt;
      flake.velocity.y -= 1.6 * dt;
      // Paper drifts: the air holds it back.
      flake.velocity.multiplyScalar(Math.exp(-1.2 * dt));
      flake.mesh.position.addScaledVector(flake.velocity, dt);
      flake.mesh.rotation.x += flake.spin.x * dt;
      flake.mesh.rotation.y += flake.spin.y * dt;
      flake.mesh.rotation.z += flake.spin.z * dt;
      flake.mesh.scale.setScalar(clamp(flake.life / 0.35, 0.001, 1));
      flake.mesh.visible = flake.life > 0;
    }
  }

  // Rulers: plastic in each seat's colour (see-through), steel, or wood when playing alone. The
  // face shows tick marks; it stretches when a stapler makes it longer.
  function rulerPaint(face: string, tick: string) {
    return paintedTexture(512, 32, (ctx) => {
      ctx.fillStyle = face;
      ctx.fillRect(0, 0, 512, 32);
      ctx.fillStyle = tick;
      for (let i = 0; i <= 64; i++) ctx.fillRect(4 + i * 7.8, 0, 1.4, i % 10 === 0 ? 14 : i % 5 === 0 ? 10 : 6);
    }).texture;
  }
  const rulerGeometry = new RoundedBoxGeometry(1, B.rulerH * K, 0.004, 2, 0.0012);
  const clipGeometry = paperclip(0.03).rotateZ(Math.PI / 2);
  type RulerMesh = { group: THREE.Group; body: THREE.Mesh; clip: THREE.Mesh; dip: number };
  let rulers: RulerMesh[] = [];
  let rulerLook = "";
  function buildRulers(count: number, solo: boolean) {
    for (const old of rulers) {
      scene.remove(old.group);
      const material = old.body.material as THREE.MeshStandardMaterial;
      material.map?.dispose();
      material.dispose();
    }
    rulers = Array.from({ length: count }, (_, seat) => {
      const look = solo ? B.woodRuler : B.rulers[seat] ?? B.rulers[0];
      const metal = !look.clear && look !== B.woodRuler;
      const material = new THREE.MeshStandardMaterial({
        map: rulerPaint(look.face, look.tick),
        transparent: look.clear,
        opacity: look.clear ? 0.82 : 1,
        roughness: metal ? 0.3 : look.clear ? 0.2 : 0.6,
        metalness: metal ? 0.85 : 0,
      });
      const group = new THREE.Group();
      const body = shadowed(new THREE.Mesh(rulerGeometry, material), true, false);
      const clip = shadowed(new THREE.Mesh(clipGeometry, steel), true, false);
      clip.position.set(0, (B.rulerH / 2) * K, 0.003);
      clip.visible = false;
      group.add(body, clip);
      scene.add(group);
      return { group, body, clip, dip: 0 };
    });
    rulerLook = `${count}-${solo}`;
  }

  // The desk supplies that drop: a stapler (longer ruler), paper balls (more balls), a coffee
  // (slower ball), a paperclip (catch) and a spare ball.
  function makeSupply(kind: DropKind) {
    const group = new THREE.Group();
    const dark = new THREE.MeshStandardMaterial({ color: "#2b2d31", roughness: 0.45 });
    if (kind === "wide") {
      const base = new THREE.Mesh(new RoundedBoxGeometry(0.046, 0.012, 0.016, 2, 0.003), dark);
      const arm = new THREE.Mesh(new RoundedBoxGeometry(0.044, 0.008, 0.012, 2, 0.003), new THREE.MeshStandardMaterial({ color: "#9aa3b2", roughness: 0.3, metalness: 0.7 }));
      arm.position.set(-0.002, 0.009, 0);
      arm.rotation.z = 0.08;
      group.add(base, arm);
    } else if (kind === "multi") {
      for (const [x, y] of [[-0.009, -0.004], [0.009, -0.004], [0, 0.008]] as const) {
        const ball = new THREE.Mesh(ballShapes[0]!, paper);
        ball.scale.setScalar(0.75);
        ball.position.set(x, y, 0);
        group.add(ball);
      }
    } else if (kind === "slow") {
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.01, 0.022, 20), new THREE.MeshStandardMaterial({ color: "#f2f0eb", roughness: 0.35 }));
      const coffee = new THREE.Mesh(new THREE.CircleGeometry(0.011, 20).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: "#4a2c1d", roughness: 0.2 }));
      coffee.position.y = 0.0105;
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.006, 0.0018, 6, 12), new THREE.MeshStandardMaterial({ color: "#f2f0eb", roughness: 0.35 }));
      handle.position.x = 0.014;
      group.add(cup, coffee, handle);
      group.rotation.x = 0.5;
    } else if (kind === "catch") {
      group.add(new THREE.Mesh(paperclip(0.034), steel));
    } else {
      const ball = new THREE.Mesh(ballShapes[1]!, new THREE.MeshStandardMaterial({ color: PAPER, roughness: 0.6, flatShading: true, emissive: "#fff3c4", emissiveIntensity: 0.35 }));
      ball.scale.setScalar(1.15);
      group.add(ball);
    }
    return shadowed(group, true, false);
  }
  const KINDS: DropKind[] = ["wide", "multi", "slow", "catch", "life"];
  const supplies = Array.from({ length: 4 }, () => {
    const models = new Map(KINDS.map((kind) => [kind, makeSupply(kind)] as const));
    const slot = new THREE.Group();
    for (const model of models.values()) {
      model.visible = false;
      slot.add(model);
    }
    scene.add(slot);
    return { slot, models };
  });

  const at = new THREE.Vector3();
  let before: { lives: number; level: number; drops: { x: number; y: number }[] } | null = null;

  kit.frame(
    { position: new THREE.Vector3(0.14, -0.2, 1.66), target: new THREE.Vector3(0, -0.012, 0), fov: 32, fog: [4, 14] },
    {
      plane: new THREE.Plane(new THREE.Vector3(0, 0, 1), -RULER_Z),
      toField: (point) => ({ x: point.x / K + W / 2, y: H / 2 - point.y / K }),
    },
  );

  // The board's middle is bare cork, so the opening card sits there, clear of the ruler.
  return kit.stage((view, dt, time) => {
    if (view.kind !== "breakout") return;
    const v: BreakoutView = view;
    const ended = v.phase === "over" || v.phase === "won";

    // Notes: rebuilt for each board; then each shows its hits and, as they go, comes off.
    if (v.notes !== shownNotes) {
      buildNotes(v.notes, shownNotes !== null && before !== null && v.level !== before.level);
      shownNotes = v.notes;
    }
    v.notes.forEach((note, index) => {
      const mesh = noteMeshes[index];
      if (!mesh) return;
      if (mesh.appear < 1) {
        mesh.appear = Math.min(1, mesh.appear + dt * 3.2);
        const t = clamp(mesh.appear, 0, 1);
        mesh.group.scale.setScalar(Math.max(0.001, 1 + 2.4 * (t - 1) ** 3 + 1.4 * (t - 1) ** 2));
      }
      if (note.hits !== mesh.hits) {
        const style = B.noteStyles[note.kind.toLowerCase()];
        at.set(toX(note.x + B.noteW / 2), toY(note.y + B.noteH / 2), NOTE_Z + 0.004);
        kit.burst(at, style?.fill ?? B.card.fill, note.hits > 0 ? 4 : 9, note.hits > 0 ? 0.25 : 0.4, 0.5, "z");
        if (note.hits <= 0) flutter(mesh.front, note.kind === "C" ? cardMaterial : ((mesh.front.children[0] as THREE.Mesh).material as THREE.Material));
        else if (mesh.back && note.hits === 1) flutter(mesh.back, mesh.back.material as THREE.Material);
        else if (mesh.pins[note.hits]) {
          // A pin pops out of an index card.
          mesh.pins[note.hits]!.getWorldPosition(at);
          kit.burst(at, PAL.red, 5, 0.3, 0.6, "z");
        }
        mesh.hits = note.hits;
      }
      mesh.group.visible = note.hits > 0;
      if (mesh.back) mesh.back.visible = note.hits > 1;
      mesh.pins.forEach((pin, pinIndex) => (pin.visible = pinIndex < note.hits));
    });
    stepFlakes(dt);

    // Rulers.
    if (rulers.length !== v.rulers.length || rulerLook !== `${v.rulers.length}-${v.solo}`) buildRulers(v.rulers.length, v.solo);
    v.rulers.forEach((state, seat) => {
      const ruler = rulers[seat]!;
      ruler.dip = approach(ruler.dip, 0, 14, dt);
      ruler.group.position.set(toX(state.x + state.width / 2), toY(B.rulerY + B.rulerH / 2) - ruler.dip, RULER_Z);
      ruler.body.scale.x = state.width * K;
      ruler.clip.visible = state.catching;
      ruler.clip.position.x = (state.width / 2 - 6) * K;
    });

    // Balls: each tumbles with its own movement; one waiting on a ruler bobs a little. A ball
    // that turns back up just above a ruler bounced off it, so that ruler dips.
    balls.forEach((ball, index) => {
      const state = v.balls[index];
      ball.mesh.visible = !!state && !ended;
      if (!state) {
        ball.seen = false;
        return;
      }
      const x = state.x + B.ball / 2;
      const y = state.y + B.ball / 2;
      const dx = ball.seen ? x - ball.x : 0;
      const dy = ball.seen ? y - ball.y : 0;
      if (ball.seen && state.held === null && dy < -0.05 && ball.mesh.userData.falling === true && y > B.rulerY - 8) {
        const seat = v.rulers.findIndex((ruler) => x >= ruler.x - 2 && x <= ruler.x + ruler.width + 2);
        if (seat >= 0 && rulers[seat]) {
          rulers[seat]!.dip = 2.2 * K;
          at.set(toX(x), toY(y + 1.5), BALL_Z);
          kit.burst(at, "#fffdf6", 4, 0.22, 0.3, "z");
        }
      }
      ball.mesh.userData.falling = dy > 0.05;
      ball.x = x;
      ball.y = y;
      ball.seen = true;
      const bob = state.held !== null && motion ? Math.abs(Math.sin(time * 5)) * 0.004 : 0;
      ball.mesh.position.set(toX(x), toY(y) + bob, BALL_Z);
      ball.mesh.rotation.x += dy * 0.35;
      ball.mesh.rotation.y += dx * 0.35;
    });
    spares.forEach((spare, index) => (spare.visible = index < v.lives - 1));

    // Falling desk supplies turn slowly as they come down; one that vanishes by the rulers was caught.
    supplies.forEach((supply, index) => {
      const drop = v.drops[index];
      supply.slot.visible = !!drop;
      if (!drop) return;
      for (const [kind, model] of supply.models) model.visible = kind === drop.kind;
      supply.slot.position.set(toX(drop.x + 4), toY(drop.y + 3), 0.022);
      supply.slot.rotation.y = motion ? Math.sin(time * 2.4 + index) * 0.6 : 0;
    });
    if (before) {
      for (const drop of before.drops) {
        const still = v.drops.some((next) => Math.abs(next.x - drop.x) < 1 && next.y >= drop.y - 1);
        if (!still && drop.y > B.rulerY - 14 && drop.y < H) {
          at.set(toX(drop.x + 4), toY(B.rulerY), RULER_Z + 0.006);
          kit.burst(at, "#ffe08a", 10, 0.35, 0.8, "z");
        }
      }
      if (v.lives < before.lives) kit.kick(0.006);
    }
    before = { lives: v.lives, level: v.level, drops: v.drops.map((drop) => ({ x: drop.x, y: drop.y })) };

    // The camera leans a touch towards the lowest ball in play.
    const lowest = v.balls.reduce((best, ball) => Math.max(best, ball.y), 0);
    const leader = v.balls.find((ball) => ball.y === lowest);
    kit.follow.x = approach(kit.follow.x, motion && leader && !ended ? toX(leader.x) * 0.06 : 0, 2, dt);
  }, { card: "middle" });
};
