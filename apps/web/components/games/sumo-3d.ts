// Chair Sumo in 3D (three.js): office swivel chairs on a round wool rug in an oak-floored room,
// seen from above at an angle. The rules stay in sumo.ts; this only draws what view() reads, so
// every way of playing looks the same.
//
// The chairs are the office's own swivel chair (the one at the desks in the 3D office), upholstered
// in each player's colour; until that model has loaded (or if it can't), a simpler built one stands
// in. Each chair turns to face where it's heading, it leans into a push
// and further into a dash (with dust behind), chairs that bump throw sparks, and a chair that rolls
// off the rug tips over the edge. The rug really shrinks, fringe and all, and the countdown pops up
// over it. With reduced motion there's no leaning, dust, sparks or shaking; chairs still tip.

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { SEATS, clamp, seeded, type GameStageFactory } from "./arcade-kit";
import { SUMO_LAYOUT as U, type SumoView } from "./sumo";
import { approach, createStageKit, loadOfficeChair, officeChairCopy, paintedTexture, shadowed } from "./stage-kit";

// Metres per screen pixel: a chair is 0.6 m across and the rug starts 6.6 m wide.
const K = 0.05;
const toX = (x: number) => (x - U.cx) * K;
const toZ = (y: number) => (y - U.cy) * K;
const RUG_R = U.rug * K;
const SEAT_Y = 0.46;

function mat(color: THREE.ColorRepresentation, roughness = 0.6, extra: THREE.MeshStandardMaterialParameters = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness, ...extra });
}

// The rug's top: fringe, a cream border, the terracotta field with a darker ring, a medallion in
// the middle and a ring of diamonds, all with a woollen speckle.
function paintRug(ctx: CanvasRenderingContext2D) {
  const size = ctx.canvas.width;
  const c = size / 2;
  const ring = (radius: number, color: string) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(c, c, radius * c, 0, Math.PI * 2);
    ctx.fill();
  };
  ring(1, U.rugColors.fringe);
  ring(0.97, U.rugColors.border);
  ring(0.88, U.rugColors.ring);
  ring(0.85, U.rugColors.field);
  ctx.fillStyle = U.rugColors.pattern;
  for (let i = 0; i < 16; i++) {
    const angle = (i / 16) * Math.PI * 2;
    ctx.save();
    ctx.translate(c + Math.cos(angle) * c * 0.68, c + Math.sin(angle) * c * 0.68);
    ctx.rotate(angle + Math.PI / 4);
    ctx.fillRect(-c * 0.035, -c * 0.035, c * 0.07, c * 0.07);
    ctx.restore();
  }
  ring(0.24, U.rugColors.border);
  ring(0.2, U.rugColors.ring);
  ring(0.15, U.rugColors.pattern);
  ring(0.06, U.rugColors.border);
  const rand = seeded(57);
  for (let i = 0; i < 26000; i++) {
    const angle = rand() * Math.PI * 2;
    const reach = Math.sqrt(rand()) * c * 0.995;
    ctx.fillStyle = rand() > 0.5 ? "rgba(255,240,220,0.06)" : "rgba(40,10,5,0.09)";
    ctx.fillRect(c + Math.cos(angle) * reach, c + Math.sin(angle) * reach, 2, 2);
  }
}

// Oak floorboards: long planks of slightly different shades, staggered, with grain.
function paintFloor(ctx: CanvasRenderingContext2D) {
  const size = ctx.canvas.width;
  const rows = 12;
  const rowH = size / rows;
  const rand = seeded(19);
  for (let row = 0; row < rows; row++) {
    let x = -rand() * size * 0.5;
    while (x < size) {
      const w = size * (0.35 + rand() * 0.4);
      ctx.fillStyle = U.floor.planks[Math.floor(rand() * U.floor.planks.length)]!;
      ctx.fillRect(x, row * rowH, w, rowH);
      ctx.fillStyle = U.floor.grain;
      for (let g = 0; g < 9; g++) ctx.fillRect(x + rand() * w, row * rowH + rand() * rowH, 12 + rand() * 40, 1.2);
      ctx.fillStyle = U.floor.seam;
      ctx.fillRect(x, row * rowH, 2, rowH);
      x += w;
    }
    ctx.fillStyle = U.floor.seam;
    ctx.fillRect(0, row * rowH, size, 2);
  }
}

// A player's chair. With the office's model: that chair, its upholstery in the player's colour.
// Without it: a built one, a five-star base on casters and a gas post (the base, which turns as it
// rolls) and the seat with its back and armrests in the player's colour (the swivel).
function makeChair(seat: number, model: THREE.Group | null) {
  const colors = SEATS[seat]!;
  if (model) {
    const tipper = new THREE.Group();
    const chair = new THREE.Group();
    const base = new THREE.Group();
    const swivel = new THREE.Group();
    swivel.add(officeChairCopy(model, 0.66, colors.color));
    chair.add(base, swivel);
    tipper.add(chair);
    shadowed(tipper, true, true);
    return { tipper, chair, base, swivel };
  }
  const metal = mat("#1d1f23", 0.35, { metalness: 0.6 });
  const cushion = mat(colors.color, 0.7);
  const backing = mat(colors.dark, 0.7);
  const tipper = new THREE.Group();
  const chair = new THREE.Group();
  tipper.add(chair);
  const base = new THREE.Group();
  for (let leg = 0; leg < 5; leg++) {
    const angle = (leg / 5) * Math.PI * 2;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.035, 0.05), metal);
    arm.position.set(Math.cos(angle) * 0.135, 0.075, Math.sin(angle) * 0.135);
    arm.rotation.y = -angle;
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.025, 12).rotateX(Math.PI / 2), metal);
    wheel.position.set(Math.cos(angle) * 0.27, 0.035, Math.sin(angle) * 0.27);
    wheel.rotation.y = -angle;
    base.add(arm, wheel);
  }
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.3, 12), metal);
  post.position.y = 0.23;
  base.add(post);
  const swivel = new THREE.Group();
  const seatPad = new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.09, 0.48, 3, 0.04), cushion);
  seatPad.position.y = SEAT_Y - 0.04;
  const back = new THREE.Mesh(new RoundedBoxGeometry(0.46, 0.5, 0.08, 3, 0.04), cushion);
  back.position.set(0, SEAT_Y + 0.34, -0.25);
  back.rotation.x = -0.14;
  const backShell = new THREE.Mesh(new RoundedBoxGeometry(0.44, 0.46, 0.03, 2, 0.015), backing);
  backShell.position.set(0, SEAT_Y + 0.34, -0.3);
  backShell.rotation.x = -0.14;
  const spine = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.3, 0.03), metal);
  spine.position.set(0, SEAT_Y + 0.08, -0.27);
  swivel.add(seatPad, back, backShell, spine);
  for (const side of [-1, 1]) {
    const rest = new THREE.Mesh(new RoundedBoxGeometry(0.05, 0.03, 0.26, 2, 0.012), metal);
    rest.position.set(side * 0.26, SEAT_Y + 0.17, -0.02);
    const stem = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.17, 0.03), metal);
    stem.position.set(side * 0.26, SEAT_Y + 0.08, -0.08);
    swivel.add(rest, stem);
  }
  chair.add(base, swivel);
  // Drawn at the size the game bumps them at (0.3 m round).
  chair.scale.setScalar(1.15);
  shadowed(tipper, true, true);
  return { tipper, chair, base, swivel };
}

export const createSumoStage: GameStageFactory = (options) => {
  const kit = createStageKit({ ...options, backdrop: "#2b241f", reflections: 0.32, sparkSize: 0.08, gravity: 6 });
  const { scene, motion } = kit;

  scene.add(new THREE.HemisphereLight("#fff4e6", "#5b4535", 0.8));
  const sun = new THREE.DirectionalLight("#fff0dc", 2.3);
  sun.position.set(-4, 10, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -7.5;
  sun.shadow.camera.right = 7.5;
  sun.shadow.camera.top = 6;
  sun.shadow.camera.bottom = -6;
  sun.shadow.camera.near = 2;
  sun.shadow.camera.far = 25;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.02;
  sun.shadow.radius = 3;
  scene.add(sun, sun.target);

  // The room: oak boards, plain walls at the back and sides with a skirting board.
  const boards = paintedTexture(1024, 1024, paintFloor);
  boards.texture.wrapS = boards.texture.wrapT = THREE.RepeatWrapping;
  boards.texture.repeat.set(5, 5);
  boards.texture.anisotropy = kit.anisotropy;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(22, 22), mat("#ffffff", 0.62, { map: boards.texture }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const wallPaint = mat("#e4ddd1", 0.9);
  const skirting = mat("#f3efe7", 0.5);
  for (const [x, z, turn, length] of [
    [0, -5.2, 0, 16],
    [-7.2, 0, Math.PI / 2, 12],
    [7.2, 0, -Math.PI / 2, 12],
  ] as const) {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(length, 3), wallPaint);
    wall.position.set(x, 1.5, z);
    wall.rotation.y = turn;
    wall.receiveShadow = true;
    const board = new THREE.Mesh(new THREE.BoxGeometry(length, 0.12, 0.03), skirting);
    board.position.set(x, 0.06, z);
    board.rotation.y = turn;
    board.translateZ(0.015);
    scene.add(wall, board);
  }

  // The rug: a thick round of wool with a tasselled edge, scaled as it shrinks.
  const rugTop = paintedTexture(1024, 1024, paintRug);
  rugTop.texture.anisotropy = kit.anisotropy;
  const rug = new THREE.Group();
  const rugBody = new THREE.Mesh(new THREE.CylinderGeometry(RUG_R, RUG_R, 0.025, 96), [
    mat(U.rugColors.border, 0.95),
    mat("#ffffff", 0.95, { map: rugTop.texture, bumpMap: rugTop.texture, bumpScale: 0.4 }),
    mat(U.rugColors.border, 0.95),
  ]);
  rugBody.position.y = 0.0125;
  rug.add(rugBody);
  const TASSELS = 150;
  const tassels = new THREE.InstancedMesh(new THREE.BoxGeometry(0.018, 0.008, 0.09), mat(U.rugColors.fringe, 0.9), TASSELS);
  const matrix = new THREE.Matrix4();
  const place = new THREE.Vector3();
  const turn = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < TASSELS; i++) {
    const angle = (i / TASSELS) * Math.PI * 2;
    place.set(Math.cos(angle) * (RUG_R + 0.035), 0.004, Math.sin(angle) * (RUG_R + 0.035));
    turn.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, -angle + Math.PI / 2);
    tassels.setMatrixAt(i, matrix.compose(place, turn, one));
  }
  rug.add(tassels);
  shadowed(rug, false, true);
  scene.add(rug);

  // The countdown, standing over the rug.
  const countdownPaint = paintedTexture(256, 256, () => {});
  const countdown = new THREE.Sprite(new THREE.SpriteMaterial({ map: countdownPaint.texture, transparent: true, depthTest: false }));
  countdown.position.set(0, 1.7, 0);
  countdown.scale.setScalar(1.6);
  countdown.visible = false;
  scene.add(countdown);
  let shownCount = 0;
  let countPop = 1;
  function paintCount(n: number) {
    const ctx = countdownPaint.ctx;
    ctx.clearRect(0, 0, 256, 256);
    ctx.font = "800 190px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 14;
    ctx.strokeStyle = "rgba(43,36,31,0.55)";
    ctx.strokeText(String(n), 128, 138);
    ctx.fillStyle = "#fffdf6";
    ctx.fillText(String(n), 128, 138);
    countdownPaint.texture.needsUpdate = true;
  }

  // The office chair model, once it's here.
  let chairModel: THREE.Group | null = null;
  let builtWith: THREE.Group | null | undefined;
  const ready = loadOfficeChair().then((model) => {
    chairModel = model;
  });

  type ChairMesh = ReturnType<typeof makeChair> & { x: number; z: number; vx: number; vz: number; lean: THREE.Vector2; yaw: number; roll: number; seen: boolean; out: boolean; puff: number };
  let chairs: ChairMesh[] = [];
  const bumped = new Map<string, number>();
  const at = new THREE.Vector3();
  const axis = new THREE.Vector3();

  kit.frame(
    { position: new THREE.Vector3(0, 8.4, 7.1), target: new THREE.Vector3(0, 0, 0.35), fov: 40, fog: [12, 30] },
    {
      plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), -SEAT_Y),
      toField: (point) => ({ x: point.x / K + U.cx, y: point.z / K + U.cy }),
    },
  );

  return kit.stage((view, dt, time) => {
    if (view.kind !== "sumo") return;
    const v: SumoView = view;
    const ended = v.phase === "over" || v.phase === "won";
    rug.scale.set(v.rug / U.rug, 1, v.rug / U.rug);

    // The countdown: each number pops in.
    const count = v.countdown > 0 ? Math.ceil(v.countdown / U.countdownStep) : 0;
    if (count !== shownCount) {
      shownCount = count;
      if (count > 0) paintCount(count);
      countPop = motion ? 0 : 1;
    }
    countPop = Math.min(1, countPop + dt * 4);
    countdown.visible = count > 0;
    countdown.scale.setScalar(1.6 * (1 + (1 - countPop) * 0.6));
    (countdown.material as THREE.SpriteMaterial).opacity = 0.35 + countPop * 0.65;

    if (chairs.length !== v.chairs.length || builtWith !== chairModel) {
      for (const old of chairs) scene.remove(old.tipper);
      builtWith = chairModel;
      chairs = v.chairs.map((_, seat) => {
        const parts = makeChair(seat, chairModel);
        scene.add(parts.tipper);
        return { ...parts, x: 0, z: 0, vx: 0, vz: 0, lean: new THREE.Vector2(), yaw: 0, roll: 0, seen: false, out: false, puff: 0 };
      });
    }

    v.chairs.forEach((state, seat) => {
      const chair = chairs[seat]!;
      const x = toX(state.x);
      const z = toZ(state.y);
      // Guests get positions only, so speed is worked out from how far the chair went.
      const vx = chair.seen && dt > 0 ? (x - chair.x) / dt : 0;
      const vz = chair.seen && dt > 0 ? (z - chair.z) / dt : 0;
      const ax = dt > 0 ? (vx - chair.vx) / dt : 0;
      const az = dt > 0 ? (vz - chair.vz) / dt : 0;
      const jumped = Math.hypot(x - chair.x, z - chair.z) > 1.5;
      chair.x = x;
      chair.z = z;
      chair.vx = jumped ? 0 : vx;
      chair.vz = jumped ? 0 : vz;
      chair.seen = true;

      // The seat faces where the chair is heading; the base turns slowly as the casters roll.
      const face = Math.PI / 2 - state.facing;
      let turnBy = face - chair.yaw;
      turnBy = Math.atan2(Math.sin(turnBy), Math.cos(turnBy));
      chair.yaw += turnBy * (1 - Math.exp(-14 * dt));
      chair.swivel.rotation.y = chair.yaw;
      chair.roll += Math.hypot(vx, vz) * dt * 0.6;
      chair.base.rotation.y = chair.roll;

      // Leaning into the push (harder in a dash), easing back when it coasts.
      const push = jumped ? 0 : 0.012;
      const leanTo = motion && !state.out ? new THREE.Vector2(clamp(ax * push, -0.16, 0.16), clamp(az * push, -0.16, 0.16)) : new THREE.Vector2();
      if (state.dashing && motion) leanTo.add(new THREE.Vector2(Math.cos(state.facing) * 0.12, Math.sin(state.facing) * 0.12));
      chair.lean.x = approach(chair.lean.x, leanTo.x, 10, dt);
      chair.lean.y = approach(chair.lean.y, leanTo.y, 10, dt);
      chair.chair.rotation.set(chair.lean.y, 0, -chair.lean.x);

      // Off the rug: tip over away from the middle.
      chair.tipper.position.set(x, 0, z);
      if (state.out) {
        const out = Math.hypot(x, z) || 1;
        axis.set(z / out, 0, -x / out);
        const tip = Math.min(1, state.falling);
        chair.tipper.quaternion.setFromAxisAngle(axis, tip * 1.35);
        // It goes over the edge of its base, not through the floor.
        chair.tipper.position.set(x + (x / out) * tip * 0.22, 0.04 * tip, z + (z / out) * tip * 0.22);
      } else chair.tipper.quaternion.identity();
      if (state.out && !chair.out) {
        kit.burst(at.set(x, 0.2, z), "#d8d2c4", 10, 1.8, 0.7);
        kit.kick(0.04);
      }
      chair.out = state.out;

      // A dash kicks up dust behind the chair.
      chair.puff -= dt;
      if (state.dashing && !state.out && chair.puff <= 0) {
        chair.puff = 0.05;
        kit.burst(at.set(x - Math.cos(state.facing) * 0.3, 0.06, z - Math.sin(state.facing) * 0.3), "#cdbfa8", 3, 1, 0.5);
      }
    });

    // Chairs that meet while closing on each other throw sparks (once a moment per pair).
    for (let a = 0; a < chairs.length; a++) {
      for (let b = a + 1; b < chairs.length; b++) {
        const first = chairs[a]!;
        const second = chairs[b]!;
        if (first.out || second.out) continue;
        const dx = second.x - first.x;
        const dz = second.z - first.z;
        const distance = Math.hypot(dx, dz);
        if (distance > U.chair * 2 * K + 0.06) continue;
        const closing = ((first.vx - second.vx) * dx + (first.vz - second.vz) * dz) / (distance || 1);
        const key = `${a}-${b}`;
        if (closing < 0.6 || time - (bumped.get(key) ?? -1) < 0.25) continue;
        bumped.set(key, time);
        kit.burst(at.set(first.x + dx / 2, SEAT_Y, first.z + dz / 2), "#fff3d6", Math.min(14, 4 + Math.round(closing * 2)), 1.2 + closing * 0.4, 0.6);
        if (closing > 3) kit.kick(0.05);
      }
    }

    // The camera leans a little towards where the action is.
    const live = v.chairs.filter((chair) => !chair.out);
    const mx = live.length ? live.reduce((sum, chair) => sum + toX(chair.x), 0) / live.length : 0;
    const mz = live.length ? live.reduce((sum, chair) => sum + toZ(chair.y), 0) / live.length : 0;
    kit.follow.x = approach(kit.follow.x, motion && !ended ? mx * 0.12 : 0, 1.5, dt);
    kit.follow.z = approach(kit.follow.z, motion && !ended ? mz * 0.08 : 0, 1.5, dt);
  }, { ready });
};
