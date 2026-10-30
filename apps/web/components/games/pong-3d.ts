// Ping-pong in 3D (three.js): the Game Room's table under a hall light. Singles is seen from behind
// the near player (seat 0), the way you'd see the table if you were holding the bat; round the
// table looks down from above. The rules and the ball's flight stay in pong.ts; this only draws what view()
// reads, so solo, local and online games (where guests restore the host's snapshots) all look the
// same. Singles arrives in metres (pong-geometry.ts); round the table in screen pixels, scaled here.
//
// Bats reach for a ball that's about to pass them, follow through on a hit and lean as they move;
// a hit throws a few sparks, a bounce leaves a ring and a fading mark, and a ball that goes out of
// play drops to the floor and bounces away. With reduced motion the camera holds still and the
// follow-through, sparks, rings, blur and dropped balls are off; the game itself plays the same.

import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { SCREEN_H as H, SCREEN_W as W, SEATS, clamp, seeded, type GameStage, type GameStageFactory, type GameView } from "./arcade-kit";
import { PONG_LAYOUT as L, PONG_TABLE as T, pongFieldPoint, type PongView } from "./pong";

type Singles = Extract<PongView, { kind: "pong" }>;
type Round = Extract<PongView, { kind: "pong-table" }>;

// Round the table is played in screen pixels: metres per pixel, so its 132-pixel square is 1.68 m.
const K = 0.0127;
const TABLE_Y = T.height;
const TOP_THICK = 0.025;
const BALL_R = T.ballRadius;
const BAT_R = 0.085;
const BLADE = 0.0065;
// Round the table the ball skims along in low hops.
const HOP_H = 0.045;
const HOP_LEN = 0.42;
const ROUND_BAT_LIFT = 0.07;
// A bat reaches this far (metres) towards a ball that's about to pass it, so its blade covers the
// whole width the game lets it hit across (PONG_TABLE.reach).
const REACH = Math.max(0.06, T.reach - BAT_R);
// The game gives spin as an amount (about -1 for heavy backspin to 1.2 for a loop); this turns it
// into radians a second. Faster than MAX_SPIN_DRAWN would strobe at 60 frames a second.
const SPIN_TURNS = 20;
const MAX_SPIN_DRAWN = 24;
const GRAVITY = 9.8;

const COLORS = {
  top: "#1c4a86",
  line: "#f2f2ee",
  centre: "#c9d4e2",
  score: "#2f64aa",
  apron: "#143b6c",
  frame: "#2b2d31",
  floor: "#74392f",
  barrier: "#15264a",
  wood: "#d8ac72",
  handle: "#b5814b",
  ball: "#f2862b",
  spare: "#f6f5f1",
  rail: "#e7e4dc",
  post: "#2b2d31",
  backdrop: "#1b1e24",
} as const;

const toX = (x: number) => (x - W / 2) * K;
const toZ = (y: number) => (y - H / 2) * K;
const smooth = (t: number) => t * t * (3 - 2 * t);
// Eases `from` towards `to` at a rate that doesn't depend on the frame rate.
const approach = (from: number, to: number, rate: number, dt: number) => from + (to - from) * (1 - Math.exp(-rate * dt));

function paintedTexture(width: number, height: number, paint: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  paint(ctx);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return { texture, ctx };
}

// Frees everything under `root`: geometry, materials and their textures.
function disposeTree(root: THREE.Object3D) {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    mesh.geometry?.dispose();
    const materials = mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : [];
    for (const material of materials) {
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) value.dispose();
      material.dispose();
    }
  });
}

function shadowed<T extends THREE.Object3D>(object: T, cast = true, receive = true): T {
  object.traverse((child) => {
    child.castShadow = cast;
    child.receiveShadow = receive;
  });
  return object;
}

// The matte blue top with its white lines, painted to scale. Singles shows the score on each half,
// as the flat game does, and the rally once it gets going.
function paintTop(ctx: CanvasRenderingContext2D, metresWide: number, round: boolean, score?: readonly number[], rally = 0) {
  const { width: w, height: h } = ctx.canvas;
  ctx.fillStyle = COLORS.top;
  ctx.fillRect(0, 0, w, h);
  const rand = seeded(11);
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = rand() > 0.5 ? "rgba(255,255,255,0.035)" : "rgba(0,0,0,0.05)";
    ctx.fillRect(rand() * w, rand() * h, 2, 2);
  }
  const edge = (0.02 / metresWide) * w;
  ctx.strokeStyle = COLORS.line;
  ctx.lineWidth = edge;
  ctx.strokeRect(edge / 2, edge / 2, w - edge, h - edge);
  ctx.fillStyle = COLORS.centre;
  const centre = Math.max(2, (0.003 / metresWide) * w);
  ctx.fillRect(edge, h / 2 - centre / 2, w - edge * 2, centre);
  if (round) ctx.fillRect(w / 2 - centre / 2, edge, centre, h - edge * 2);
  if (!score) return;
  // Singles is seen from behind the near end (x < 0), so the writing stands along the table and reads
  // from there: each player's score on their own half by the net, stretched along the table so it
  // still reads when the top is foreshortened.
  const perMetre = w / metresWide;
  const write = (text: string, metresFromNet: number, size: number, weight: number) => {
    ctx.save();
    ctx.translate(w / 2 + metresFromNet * perMetre, h / 2);
    ctx.rotate(Math.PI / 2);
    ctx.scale(1, 2.2);
    ctx.font = `${weight} ${Math.round(size * perMetre)}px ui-sans-serif, system-ui, sans-serif`;
    ctx.fillText(text, 0, 0);
    ctx.restore();
  };
  ctx.fillStyle = COLORS.score;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  write(String(score[0] ?? 0), -0.42, 0.21, 800);
  write(String(score[1] ?? 0), 0.42, 0.21, 800);
  if (rally >= 4) write(`Rally ${rally}`, 1.0, 0.06, 600);
}

// A bat whose local +X faces the table: a wooden blade with the seat's rubber on both faces (a
// darker shade on the back, which is the side the camera sees of the near player's bat), and the
// handle pointing down and away. `blade` is what swings; the group is what moves along the table.
function makeBat(seat: number, parts: { disc: THREE.BufferGeometry; rubber: THREE.BufferGeometry; handle: THREE.BufferGeometry; neck: THREE.BufferGeometry }) {
  const colors = SEATS[seat]!;
  const wood = new THREE.MeshStandardMaterial({ color: COLORS.wood, roughness: 0.62 });
  const handleWood = new THREE.MeshStandardMaterial({ color: COLORS.handle, roughness: 0.55 });
  const front = new THREE.MeshStandardMaterial({ color: colors.color, roughness: 0.48 });
  const back = new THREE.MeshStandardMaterial({ color: colors.dark, roughness: 0.5 });
  const group = new THREE.Group();
  const blade = new THREE.Group();
  blade.add(new THREE.Mesh(parts.disc, wood));
  const frontFace = new THREE.Mesh(parts.rubber, front);
  frontFace.position.x = BLADE / 2 + 0.001;
  const backFace = new THREE.Mesh(parts.rubber, back);
  backFace.position.x = -BLADE / 2 - 0.001;
  const handle = new THREE.Mesh(parts.handle, handleWood);
  handle.position.y = -BAT_R - 0.046;
  const neck = new THREE.Mesh(parts.neck, wood);
  neck.position.y = -BAT_R + 0.004;
  blade.add(frontFace, backFace, handle, neck);
  // Held with the face a little closed, the handle leaning out.
  blade.rotation.z = -0.2;
  group.add(shadowed(blade, true, false));
  return { group, blade };
}

type Bat = ReturnType<typeof makeBat> & {
  reach: number;
  lift: number;
  swing: number;
  lean: number;
  last: number | null;
};

// Singles is seen from behind the near player's end, at about head height and a step back, looking
// down the table: your bat is in front of you and the other player faces you from the far end. Round
// the table looks down from closer. Fog starts a few metres past the table, so the far floor fades
// into the hall.
const FRAMINGS = {
  pong: { position: new THREE.Vector3(-4.1, 2.05, 0), target: new THREE.Vector3(0.7, 0.66, 0), fov: 34, fog: [9, 18] },
  "pong-table": { position: new THREE.Vector3(0, 3.05, 2.55), target: new THREE.Vector3(0, 0.62, 0.12), fov: 34, fog: [6, 14] },
} as const;

export const createPongStage: GameStageFactory = ({ reducedMotion, onLost }) => {
  const motion = !reducedMotion;
  const canvas = document.createElement("canvas");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const onContextLost = (event: Event) => {
    event.preventDefault();
    onLost?.();
  };
  canvas.addEventListener("webglcontextlost", onContextLost);
  const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.backdrop);
  const fog = new THREE.Fog(COLORS.backdrop, 10, 20);
  scene.fog = fog;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = environment;
  scene.environmentIntensity = 0.32;

  // A hall light over the table, and a soft fill so the shadows aren't black.
  scene.add(new THREE.HemisphereLight("#d6deec", "#4a2c25", 0.85));
  const lamp = new THREE.SpotLight("#fff3e2", 95, 0, 0.62, 0.7, 2);
  lamp.position.set(0.35, 4.6, 0.75);
  lamp.target.position.set(0, TABLE_Y, 0);
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(1024, 1024);
  lamp.shadow.bias = -0.0004;
  lamp.shadow.normalBias = 0.015;
  lamp.shadow.radius = 3;
  lamp.shadow.camera.near = 2;
  lamp.shadow.camera.far = 7;
  scene.add(lamp, lamp.target);

  // The court: a sports floor and low navy barriers along the back and the ends.
  const floorPaint = paintedTexture(256, 256, (ctx) => {
    ctx.fillStyle = COLORS.floor;
    ctx.fillRect(0, 0, 256, 256);
    const rand = seeded(23);
    for (let i = 0; i < 1400; i++) {
      ctx.fillStyle = rand() > 0.5 ? "rgba(255,230,210,0.05)" : "rgba(30,10,5,0.08)";
      ctx.fillRect(rand() * 256, rand() * 256, 2, 2);
    }
  });
  floorPaint.texture.wrapS = floorPaint.texture.wrapT = THREE.RepeatWrapping;
  floorPaint.texture.repeat.set(22, 22);
  floorPaint.texture.anisotropy = anisotropy;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ map: floorPaint.texture, roughness: 0.82 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const barrierGeometry = new THREE.BoxGeometry(1.36, 0.6, 0.05);
  const stripeGeometry = new THREE.BoxGeometry(1.36, 0.035, 0.052);
  const barrierMaterial = new THREE.MeshStandardMaterial({ color: COLORS.barrier, roughness: 0.6 });
  const stripeMaterial = new THREE.MeshStandardMaterial({ color: "#e9edf3", roughness: 0.5 });
  const addBarrier = (x: number, z: number, turn: number) => {
    const panel = new THREE.Group();
    const board = new THREE.Mesh(barrierGeometry, barrierMaterial);
    board.position.y = 0.3;
    const stripe = new THREE.Mesh(stripeGeometry, stripeMaterial);
    stripe.position.y = 0.47;
    panel.add(board, stripe);
    panel.position.set(x, 0, z);
    panel.rotation.y = turn;
    scene.add(shadowed(panel, false, true));
  };
  // A ring of them: along both sides, and right across both ends (the far end is the backdrop when
  // singles is seen from behind the near player).
  for (let i = 0; i < 6; i++) {
    addBarrier(-3.5 + i * 1.4, -2.5, 0);
    addBarrier(-3.5 + i * 1.4, 2.5, 0);
  }
  for (let i = 0; i < 3; i++) {
    addBarrier(-4.2, -1.4 + i * 1.4, Math.PI / 2);
    addBarrier(4.2, -1.4 + i * 1.4, Math.PI / 2);
  }

  // The ball, with a printed mark so its spin shows.
  const ballPaint = paintedTexture(128, 64, (ctx) => {
    ctx.fillStyle = COLORS.ball;
    ctx.fillRect(0, 0, 128, 64);
    ctx.fillStyle = "#b8561a";
    ctx.font = "700 18px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("★★★", 32, 32);
  });
  const ballGeometry = new THREE.SphereGeometry(BALL_R, 28, 18);
  const ballMaterial = new THREE.MeshStandardMaterial({ map: ballPaint.texture, roughness: 0.38 });
  const ball = shadowed(new THREE.Mesh(ballGeometry, ballMaterial), true, false);
  scene.add(ball);
  // At speed the ball leaves a short blur behind it: a stretched, see-through copy along its path.
  const streak = new THREE.Mesh(ballGeometry, new THREE.MeshBasicMaterial({ color: "#ffb36b", transparent: true, opacity: 0.28, depthWrite: false }));
  streak.visible = false;
  scene.add(streak);

  // A ball that just went out of play keeps falling, bounces on the floor and rolls to a stop.
  const loose = { mesh: shadowed(new THREE.Mesh(ballGeometry, ballMaterial), true, false), velocity: new THREE.Vector3(), life: 0 };
  loose.mesh.visible = false;
  scene.add(loose.mesh);

  // Sparks off a hit and dust off a bounce: points that fly, fall and fade.
  const SPARKS = 72;
  const sparkPositions = new Float32Array(SPARKS * 3).fill(-10);
  const sparkColors = new Float32Array(SPARKS * 4);
  const sparkVelocity = new Float32Array(SPARKS * 3);
  const sparkLife = new Float32Array(SPARKS);
  const sparkMax = new Float32Array(SPARKS).fill(1);
  let nextSpark = 0;
  const sparkGeometry = new THREE.BufferGeometry();
  sparkGeometry.setAttribute("position", new THREE.BufferAttribute(sparkPositions, 3).setUsage(THREE.DynamicDrawUsage));
  sparkGeometry.setAttribute("color", new THREE.BufferAttribute(sparkColors, 4).setUsage(THREE.DynamicDrawUsage));
  const dot = paintedTexture(32, 32, (ctx) => {
    const glow = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    glow.addColorStop(0, "rgba(255,255,255,1)");
    glow.addColorStop(0.5, "rgba(255,255,255,0.8)");
    glow.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 32, 32);
  });
  const sparks = new THREE.Points(sparkGeometry, new THREE.PointsMaterial({ size: 0.028, map: dot.texture, vertexColors: true, transparent: true, depthWrite: false }));
  sparks.frustumCulled = false;
  scene.add(sparks);
  const sparkColor = new THREE.Color();
  function burst(x: number, y: number, z: number, color: THREE.ColorRepresentation, count: number, speed: number) {
    if (!motion) return;
    sparkColor.set(color);
    for (let i = 0; i < count; i++) {
      const at = nextSpark;
      nextSpark = (nextSpark + 1) % SPARKS;
      const angle = Math.random() * Math.PI * 2;
      const up = 0.3 + Math.random() * 0.7;
      const v = speed * (0.4 + Math.random() * 0.6);
      sparkPositions.set([x, y, z], at * 3);
      sparkVelocity.set([Math.cos(angle) * v, up * v, Math.sin(angle) * v], at * 3);
      sparkColors.set([sparkColor.r, sparkColor.g, sparkColor.b, 1], at * 4);
      sparkMax[at] = sparkLife[at] = 0.25 + Math.random() * 0.3;
    }
  }
  function stepSparks(dt: number) {
    let alive = false;
    for (let i = 0; i < SPARKS; i++) {
      if (sparkLife[i]! <= 0) continue;
      alive = true;
      sparkLife[i] = sparkLife[i]! - dt;
      sparkVelocity[i * 3 + 1] = sparkVelocity[i * 3 + 1]! - 5 * dt;
      for (let axis = 0; axis < 3; axis++) sparkPositions[i * 3 + axis] = sparkPositions[i * 3 + axis]! + sparkVelocity[i * 3 + axis]! * dt;
      sparkColors[i * 4 + 3] = Math.max(0, sparkLife[i]! / sparkMax[i]!);
    }
    if (!alive) return;
    sparkGeometry.attributes.position!.needsUpdate = true;
    sparkGeometry.attributes.color!.needsUpdate = true;
  }

  // Rings that spread where the ball lands.
  const ripples = Array.from({ length: 3 }, () => {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.017, 0.024, 32), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.visible = false;
    scene.add(ring);
    return { ring, life: 0 };
  });
  let nextRipple = 0;
  function ripple(x: number, z: number) {
    if (!motion) return;
    const item = ripples[nextRipple]!;
    nextRipple = (nextRipple + 1) % ripples.length;
    item.ring.position.set(x, TABLE_Y + 0.0015, z);
    item.life = 1;
    item.ring.visible = true;
  }
  function stepRipples(dt: number) {
    for (const item of ripples) {
      if (item.life <= 0) continue;
      item.life = Math.max(0, item.life - dt / 0.4);
      item.ring.scale.setScalar(1 + (1 - item.life) * 3.2);
      (item.ring.material as THREE.MeshBasicMaterial).opacity = 0.55 * item.life;
      item.ring.visible = item.life > 0;
    }
  }

  // Bats share their shapes; each has its own colours.
  const batParts = {
    disc: new THREE.CylinderGeometry(BAT_R, BAT_R, BLADE, 48).rotateZ(Math.PI / 2),
    rubber: new THREE.CylinderGeometry(BAT_R - 0.0015, BAT_R - 0.0015, 0.002, 48).rotateZ(Math.PI / 2),
    handle: new RoundedBoxGeometry(0.024, 0.1, 0.032, 2, 0.008),
    neck: new THREE.BoxGeometry(0.014, 0.03, 0.05),
  };

  const camera = new THREE.PerspectiveCamera(30, 1.5, 0.1, 40);
  // Picking uses the camera at rest, so a finger keeps pointing at the same spot on the table while
  // the camera drifts after the ball.
  const pickCamera = new THREE.PerspectiveCamera(30, 1.5, 0.1, 40);
  const raycaster = new THREE.Raycaster();
  const pickPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const pointer = new THREE.Vector2();
  const picked = new THREE.Vector3();
  const look = new THREE.Vector3();
  const follow = { x: 0, z: 0 };
  let shake = 0;

  // ---------------------------------------------------------------------------------------------
  // The table for the current game: singles (with a net) or round the table (square, railed).
  // `toField` turns a point on the table (metres) into the play field's screen pixels, for picking.

  type Layout = {
    kind: PongView["kind"];
    group: THREE.Group;
    update: (view: PongView, dt: number, time: number) => void;
    toField: (x: number, z: number) => { x: number; y: number };
  };
  let layout: Layout | null = null;

  function layoutFor(kind: PongView["kind"]) {
    if (layout?.kind === kind) return layout;
    if (layout) {
      scene.remove(layout.group);
      disposeTree(layout.group);
    }
    const framing = FRAMINGS[kind];
    [fog.near, fog.far] = framing.fog;
    for (const each of [camera, pickCamera]) {
      each.fov = framing.fov;
      each.position.copy(framing.position);
      each.lookAt(framing.target);
      each.updateProjectionMatrix();
      // The pick camera is never rendered, so nothing else would update its place in the world.
      each.updateMatrixWorld();
    }
    const group = new THREE.Group();
    scene.add(group);
    layout = { kind, group, ...(kind === "pong" ? buildSingles(group) : buildRound(group)) };
    return layout;
  }

  // A table `wide` along X and `deep` along Z (metres), centred on (centreX, centreZ).
  function buildTable(group: THREE.Group, wide: number, deep: number, centreX: number, centreZ: number, round: boolean) {
    const top = paintedTexture(1024, Math.round((1024 * deep) / wide), (ctx) => paintTop(ctx, wide, round));
    top.texture.anisotropy = anisotropy;
    const side = new THREE.MeshStandardMaterial({ color: COLORS.apron, roughness: 0.55 });
    const surface = new THREE.MeshStandardMaterial({ map: top.texture, roughness: 0.6 });
    const board = new THREE.Mesh(new THREE.BoxGeometry(wide, TOP_THICK, deep), [side, side, surface, side, side, side]);
    board.position.set(centreX, TABLE_Y - TOP_THICK / 2, centreZ);
    group.add(shadowed(board));
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(wide - 0.08, 0.05, deep - 0.08), new THREE.MeshStandardMaterial({ color: "#0e2c52", roughness: 0.6 }));
    skirt.position.set(centreX, TABLE_Y - TOP_THICK - 0.025, centreZ);
    group.add(shadowed(skirt));
    // Steel undercarriage: a leg near each corner, braced end to end.
    const steel = new THREE.MeshStandardMaterial({ color: COLORS.frame, roughness: 0.38, metalness: 0.65 });
    const legHeight = TABLE_Y - TOP_THICK - 0.05;
    const leg = new THREE.BoxGeometry(0.045, legHeight, 0.045);
    const insetX = Math.min(0.3, wide * 0.18);
    const insetZ = 0.14;
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const mesh = new THREE.Mesh(leg, steel);
        mesh.position.set(centreX + sx * (wide / 2 - insetX), legHeight / 2, centreZ + sz * (deep / 2 - insetZ));
        group.add(shadowed(mesh));
      }
    for (const sx of [-1, 1]) {
      const brace = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, deep - insetZ * 2), steel);
      brace.position.set(centreX + sx * (wide / 2 - insetX), 0.16, centreZ);
      group.add(shadowed(brace));
    }
    const spine = new THREE.Mesh(new THREE.BoxGeometry(wide - insetX * 2, 0.035, 0.035), steel);
    spine.position.set(centreX, 0.16, centreZ);
    group.add(shadowed(spine));
    return top;
  }

  function newBat(seat: number, group: THREE.Group): Bat {
    const bat = { ...makeBat(seat, batParts), reach: 0, lift: 0, swing: 0, lean: 0, last: null };
    group.add(bat.group);
    return bat;
  }

  // Moves a bat to `along` (its centre along its end or side, in metres) and poses it: reaching for
  // a ball that's about to pass, leaning with its speed, following through by `stroke` (1 right
  // after a hit, back to 0). `face` is where its rubber meets the ball, `inward` which way the
  // table is, `vertical` whether it slides along Z (the ends) or along X (the far and near sides).
  function poseBat(
    bat: Bat,
    options: { along: number; face: number; inward: number; vertical: boolean; baseY: number; ball: THREE.Vector3; coming: boolean; stroke: number },
    dt: number,
    time: number,
  ) {
    const { along, face, inward, vertical, baseY, ball: at, coming } = options;
    const ballAlong = vertical ? at.z : at.x;
    const ballAcross = vertical ? at.x : at.z;
    const near = coming ? smooth(clamp(1 - Math.abs(ballAcross - face) / 0.5, 0, 1)) : 0;
    bat.reach = approach(bat.reach, clamp(ballAlong - along, -REACH, REACH) * near, 20, dt);
    bat.lift = approach(bat.lift, clamp(at.y - baseY, -0.09, 0.09) * near, 20, dt);
    const velocity = bat.last === null || dt <= 0 ? 0 : (along - bat.last) / dt;
    bat.last = along;
    bat.lean = approach(bat.lean, motion ? clamp(velocity * 0.22, -0.4, 0.4) : 0, 12, dt);
    const stroke = motion ? Math.sin(Math.PI * clamp(options.stroke, 0, 1)) : 0;
    const bob = motion ? Math.sin(time * 2.1 + face * 3) * 0.004 : 0;
    const position = along + bat.reach;
    // The blade's centre sits just behind its rubber.
    const centre = face - inward * (BLADE / 2 + 0.002);
    bat.group.position.set(vertical ? centre : position, baseY + bat.lift + bob, vertical ? position : centre);
    bat.blade.position.x = stroke * 0.05;
    bat.blade.rotation.set(0, bat.lean * inward * (vertical ? 1 : -1), -0.2 - stroke * 0.6);
  }

  function hitSparks(at: THREE.Vector3, seat: number) {
    burst(at.x, at.y, at.z, SEATS[seat]!.light, 7, 1.1);
    burst(at.x, at.y, at.z, "#fff3d6", 4, 0.8);
  }

  // A point is over: the ball that was in play flies on from where it was.
  function drop(from: THREE.Vector3, velocity: THREE.Vector3) {
    if (!motion) return;
    loose.mesh.position.copy(from);
    loose.velocity.copy(velocity);
    loose.life = 1.8;
    loose.mesh.visible = true;
  }
  function stepLoose(dt: number) {
    if (loose.life <= 0) return;
    loose.life -= dt;
    const { mesh, velocity } = loose;
    velocity.y -= GRAVITY * dt;
    mesh.position.addScaledVector(velocity, dt);
    if (mesh.position.y < BALL_R) {
      mesh.position.y = BALL_R;
      velocity.y = Math.abs(velocity.y) * 0.72;
      velocity.x *= 0.85;
      velocity.z *= 0.85;
    }
    mesh.rotation.x += velocity.z * dt * 12;
    mesh.rotation.z -= velocity.x * dt * 12;
    mesh.scale.setScalar(clamp(loose.life / 0.3, 0, 1));
    mesh.visible = loose.life > 0;
  }

  // The ball's last spot and speed, for dropping it when a point ends.
  const ballAt = new THREE.Vector3();
  const ballVelocity = new THREE.Vector3();
  const spinAxis = new THREE.Vector3();
  const spinTurn = new THREE.Quaternion();
  const streakDirection = new THREE.Vector3();
  const FORWARD = new THREE.Vector3(0, 0, 1);
  function placeBall(at: THREE.Vector3, velocity: THREE.Vector3, spin: { top: number; side: number }, dt: number, visible: boolean) {
    ballAt.copy(at);
    ballVelocity.copy(velocity);
    ball.position.copy(at);
    ball.visible = visible;
    // Topspin turns the ball over in the direction it's travelling; side spin turns it on the spot.
    const speed = Math.hypot(velocity.x, velocity.z);
    if (speed > 0.01 && dt > 0) {
      spinAxis.set(velocity.z, 0, -velocity.x).normalize();
      ball.quaternion.premultiply(spinTurn.setFromAxisAngle(spinAxis, -clamp(spin.top, -MAX_SPIN_DRAWN, MAX_SPIN_DRAWN) * dt));
    }
    if (spin.side && dt > 0) ball.quaternion.premultiply(spinTurn.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, clamp(spin.side, -MAX_SPIN_DRAWN, MAX_SPIN_DRAWN) * dt));
    // The blur covers about the last 40 ms of the ball's path, so it grows with speed.
    const fullSpeed = velocity.length();
    streak.visible = motion && visible && fullSpeed > 2.5;
    if (streak.visible) {
      const length = Math.min(0.32, fullSpeed * 0.04);
      streakDirection.copy(velocity).divideScalar(fullSpeed);
      streak.position.copy(at).addScaledVector(streakDirection, -length / 2);
      streak.quaternion.setFromUnitVectors(FORWARD, streakDirection);
      streak.scale.set(0.8, 0.8, length / (BALL_R * 2));
    }
  }

  // Marks where the ball has landed lately, fading as they age (the newest also gets a ring).
  const MARK_LIFE = 2.2;
  const markGeometry = new THREE.CircleGeometry(BALL_R * 1.1, 20).rotateX(-Math.PI / 2);
  const marks = Array.from({ length: 6 }, () => {
    const mark = new THREE.Mesh(markGeometry, new THREE.MeshBasicMaterial({ color: "#0b1f3d", transparent: true, opacity: 0, depthWrite: false }));
    mark.scale.set(1.5, 1, 1);
    mark.visible = false;
    scene.add(mark);
    return mark;
  });

  function buildSingles(group: THREE.Group): Pick<Layout, "update" | "toField"> {
    const top = buildTable(group, T.length, T.width, 0, 0, false);

    // The net: a fine mesh, white tape along the top, a post clamped on at each side.
    const netWide = T.width + T.netOverhang * 2;
    const net = paintedTexture(512, 48, (ctx) => {
      ctx.clearRect(0, 0, 512, 48);
      ctx.strokeStyle = "rgba(12, 26, 52, 0.85)";
      ctx.lineWidth = 1.4;
      for (let x = 0; x <= 512; x += 5) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, 48);
        ctx.stroke();
      }
      for (let y = 0; y <= 48; y += 5) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(512, y);
        ctx.stroke();
      }
      ctx.fillStyle = "rgba(12, 26, 52, 0.95)";
      ctx.fillRect(0, 44, 512, 4);
    });
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(netWide, T.net),
      new THREE.MeshStandardMaterial({ map: net.texture, transparent: true, depthWrite: false, side: THREE.DoubleSide, roughness: 0.9 }),
    );
    mesh.rotation.y = Math.PI / 2;
    mesh.position.set(0, TABLE_Y + T.net / 2, 0);
    group.add(mesh);
    const tape = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.016, netWide), new THREE.MeshStandardMaterial({ color: "#f4f4f0", roughness: 0.6 }));
    tape.position.set(0, TABLE_Y + T.net - 0.008, 0);
    group.add(shadowed(tape));
    const steel = new THREE.MeshStandardMaterial({ color: COLORS.post, roughness: 0.4, metalness: 0.5 });
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.022, T.net + 0.012, 0.022), steel);
      post.position.set(0, TABLE_Y + (T.net + 0.012) / 2, side * (netWide / 2));
      const fixing = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.16), steel);
      fixing.position.set(0, TABLE_Y - 0.03, side * (T.width / 2 + 0.06));
      group.add(shadowed(post), shadowed(fixing));
    }

    const bats = [newBat(0, group), newBat(1, group)];
    bats[1]!.group.rotation.y = Math.PI;
    // Where each bat's rubber meets the ball: just behind the ball when it's struck at ±batX.
    const faces = [-T.batX - BALL_R, T.batX + BALL_R];
    pickPlane.constant = -(TABLE_Y + 0.15);

    let painted = "";
    let before: { score: number; swings: number[]; marks: number; newest: string; visible: boolean } | null = null;
    const at = new THREE.Vector3();
    const velocity = new THREE.Vector3();

    const update = (view: PongView, dt: number, time: number) => {
      if (view.kind !== "pong") return;
      const v: Singles = view;
      const total = v.score[0] + v.score[1];
      const rally = v.serving ? 0 : v.rally;
      const key = `${v.score[0]}-${v.score[1]}-${rally >= 4 ? rally : 0}`;
      if (key !== painted) {
        painted = key;
        paintTop(top.ctx, T.length, false, v.score, rally);
        top.texture.needsUpdate = true;
      }

      const ended = v.phase === "over" || v.phase === "won";
      const visible = v.ball.visible && !ended;
      // The game's axes: x along, y across (towards us), z up. three.js: x along, y up, z towards us.
      at.set(v.ball.x, v.ball.z, v.ball.y);
      velocity.set(v.ball.vx, v.ball.vz, v.ball.vy);
      const newest = v.marks.at(-1);
      const newestKey = newest ? `${newest.x.toFixed(3)},${newest.y.toFixed(3)}` : "";

      if (before) {
        // A point. The game keeps the ball flying (and bouncing on the floor) for a moment after;
        // only if it vanished or jumped straight back to the server is a copy dropped instead.
        if (total !== before.score) {
          shake = 0.28;
          if ((!visible || at.distanceTo(ballAt) > 0.3) && before.visible) drop(ballAt, ballVelocity);
        }
        // A hit sets the swing to 1; a lunge at a ball that got away only to 0.6, so it gets no sparks.
        v.bats.forEach((bat, seat) => {
          if (bat.swing >= 0.95 && (before!.swings[seat] ?? 0) < 0.95) hitSparks(at, seat);
        });
        if (newest && newestKey !== before.newest) {
          ripple(newest.x, newest.y);
          burst(newest.x, TABLE_Y + 0.005, newest.y, "#e8eef8", 4, 0.45);
        }
      }
      before = { score: total, swings: v.bats.map((bat) => bat.swing), marks: v.marks.length, newest: newestKey, visible };

      placeBall(at, velocity, { top: v.ball.topspin * SPIN_TURNS, side: v.ball.sidespin * SPIN_TURNS }, dt, visible);
      v.bats.forEach((state, seat) => {
        const bat = bats[seat];
        if (!bat) return;
        const coming = !ended && !v.serving && (seat === 0 ? v.ball.vx < 0 : v.ball.vx > 0);
        poseBat(bat, { along: state.y, face: faces[seat]!, inward: seat === 0 ? 1 : -1, vertical: true, baseY: state.z, ball: ballAt, coming, stroke: state.swing }, dt, time);
      });
      marks.forEach((mark, index) => {
        const entry = v.marks[v.marks.length - 1 - index];
        const fade = entry ? clamp(1 - entry.age / MARK_LIFE, 0, 1) : 0;
        mark.visible = fade > 0;
        if (!entry || !mark.visible) return;
        mark.position.set(entry.x, TABLE_Y + 0.001, entry.y);
        (mark.material as THREE.MeshBasicMaterial).opacity = 0.35 * fade;
      });
      // The camera drifts a little after the ball from side to side, never along the table.
      follow.x = 0;
      follow.z = approach(follow.z, motion && visible ? at.z * 0.15 : 0, 2.5, dt);
    };
    return { update, toField: (x, z) => pongFieldPoint(x, z) };
  }

  function buildRound(group: THREE.Group): Pick<Layout, "update" | "toField"> {
    const r = L.round;
    const size = r.size * K;
    const cx = toX(r.x + r.size / 2);
    const cz = toZ(r.y + r.size / 2);
    buildTable(group, size, size, cx, cz, true);

    // Posts on the corners, and a rail along each side nobody's playing (set per frame).
    const steel = new THREE.MeshStandardMaterial({ color: COLORS.post, roughness: 0.4, metalness: 0.5 });
    const cornerSize = r.corner * K;
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const post = new THREE.Mesh(new RoundedBoxGeometry(cornerSize, 0.032, cornerSize, 2, 0.008), steel);
        post.position.set(cx + sx * (size / 2 - cornerSize / 2 + 2 * K), TABLE_Y + 0.016, cz + sz * (size / 2 - cornerSize / 2 + 2 * K));
        group.add(shadowed(post));
      }
    const railLength = size - cornerSize * 2 + 4 * K;
    const railMaterial = new THREE.MeshStandardMaterial({ color: COLORS.rail, roughness: 0.5 });
    const rails = r.sides.map((side) => {
      const rail = shadowed(new THREE.Mesh(new THREE.BoxGeometry(side.vertical ? 0.022 : railLength, 0.035, side.vertical ? railLength : 0.022), railMaterial));
      const edge = side.vertical ? toX(side.line) : toZ(side.line);
      const inside = edge - side.out * 0.012;
      rail.position.set(side.vertical ? inside : cx, TABLE_Y + 0.0175, side.vertical ? cz : inside);
      rail.visible = false;
      group.add(rail);
      return rail;
    });

    // Each player's spare balls, in a little tray by the corner where their side starts.
    const trayMaterial = new THREE.MeshStandardMaterial({ color: "#2f3238", roughness: 0.5 });
    const spareMaterial = new THREE.MeshStandardMaterial({ color: COLORS.spare, roughness: 0.4 });
    const spares = r.sides.map((side) => {
      const tray = new THREE.Group();
      tray.add(new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.012, 0.05), trayMaterial));
      const balls = Array.from({ length: r.lives }, (_, index) => {
        const spare = new THREE.Mesh(ballGeometry, spareMaterial);
        spare.position.set(-0.045 + index * 0.045, 0.006 + BALL_R, 0);
        tray.add(spare);
        return spare;
      });
      const outward = side.out * 0.11;
      const along = 0.085;
      if (side.vertical) {
        tray.rotation.y = Math.PI / 2;
        tray.position.set(toX(side.line) + outward, TABLE_Y - 0.03, toZ(r.y) + along);
      } else tray.position.set(toX(r.x) + along, TABLE_Y - 0.03, toZ(side.line) + outward);
      group.add(shadowed(tray, true, true));
      tray.visible = false;
      return { tray, balls };
    });

    const bats = r.sides.map((_, seat) => newBat(seat, group));
    const turns = [0, Math.PI, -Math.PI / 2, Math.PI / 2];
    bats.forEach((bat, seat) => (bat.group.rotation.y = turns[seat]!));
    const baseY = TABLE_Y + BALL_R + ROUND_BAT_LIFT;
    const faces = r.sides.map((side) => {
      const at = side.line - side.out * (L.batThick / 2 + L.ball / 2);
      return (side.vertical ? toX(at) : toZ(at)) + side.out * BALL_R;
    });
    pickPlane.constant = -baseY;

    let hop = 0;
    let before: { lives: number[]; vx: number; vy: number } | null = null;
    const at = new THREE.Vector3();
    const velocity = new THREE.Vector3();

    const update = (view: PongView, dt: number, time: number) => {
      if (view.kind !== "pong-table") return;
      const v: Round = view;
      const ended = v.phase === "over" || v.phase === "won";
      const vx = v.ball.vx * K;
      const vz = v.ball.vy * K;
      const moving = vx !== 0 || vz !== 0;
      let lift = 0;
      if (moving) {
        hop += (Math.hypot(vx, vz) * dt) / HOP_LEN;
        lift = HOP_H * Math.abs(Math.sin(Math.PI * hop));
      } else if (v.phase === "playing" && v.launchIn > 0) lift = 0.14 * Math.sin(Math.PI * clamp(1 - v.launchIn, 0, 1));
      at.set(toX(v.ball.x + L.ball / 2), TABLE_Y + BALL_R + lift, toZ(v.ball.y + L.ball / 2));
      velocity.set(vx, dt > 0 ? clamp((at.y - ballAt.y) / dt, -4, 4) : 0, vz);

      if (before) {
        if (v.lives.some((value, seat) => value !== before!.lives[seat])) {
          drop(ballAt, ballVelocity);
          shake = 0.28;
        } else if (moving) {
          // The ball turned round: off a bat if that side just hit it, otherwise off a rail or post.
          const flippedX = before.vx !== 0 && Math.sign(before.vx) !== Math.sign(v.ball.vx);
          const flippedZ = before.vy !== 0 && Math.sign(before.vy) !== Math.sign(v.ball.vy);
          const side = flippedX ? (v.ball.vx > 0 ? 0 : 1) : flippedZ ? (v.ball.vy > 0 ? 2 : 3) : -1;
          if (side >= 0) {
            hop = 0;
            if (side === v.lastHitter && bats[side]) {
              bats[side]!.swing = 1;
              hitSparks(ballAt, side);
            } else burst(ballAt.x, ballAt.y, ballAt.z, "#f1efe8", 4, 0.5);
          }
        }
      }
      before = { lives: [...v.lives], vx: v.ball.vx, vy: v.ball.vy };

      placeBall(at, velocity, { top: Math.hypot(vx, vz) / BALL_R / 2, side: 0 }, dt, !ended);
      r.sides.forEach((side, seat) => {
        const active = seat < v.lives.length && (v.lives[seat] ?? 0) > 0;
        rails[seat]!.visible = !active;
        const bat = bats[seat]!;
        bat.group.visible = active;
        const spare = spares[seat]!;
        spare.tray.visible = seat < v.lives.length;
        spare.balls.forEach((each, index) => (each.visible = index < (v.lives[seat] ?? 0)));
        if (!active) return;
        bat.swing = Math.max(0, bat.swing - dt / 0.3);
        const along = (side.vertical ? toZ(r.y) : toX(r.x)) + ((v.bats[seat] ?? 0) + L.batLong / 2) * K;
        const coming = !ended && (side.vertical ? Math.sign(v.ball.vx) === side.out : Math.sign(v.ball.vy) === side.out);
        poseBat(bat, { along, face: faces[seat]!, inward: -side.out, vertical: side.vertical, baseY, ball: ballAt, coming, stroke: bat.swing }, dt, time);
      });
      follow.x = approach(follow.x, motion && !ended ? at.x * 0.08 : 0, 2.5, dt);
      follow.z = approach(follow.z, motion && !ended ? (at.z - cz) * 0.06 : 0, 2.5, dt);
    };
    return { update, toField: (x, z) => ({ x: x / K + W / 2, y: z / K + H / 2 }) };
  }

  // ---------------------------------------------------------------------------------------------

  const stage: GameStage = {
    canvas,
    render(view: GameView, dt: number, time: number) {
      if (view.kind !== "pong" && view.kind !== "pong-table") return;
      const current = layoutFor(view.kind);
      current.update(view, dt, time);
      stepSparks(dt);
      stepRipples(dt);
      stepLoose(dt);

      const framing = FRAMINGS[current.kind];
      shake = Math.max(0, shake - dt);
      const jolt = motion ? (shake / 0.28) * 0.012 : 0;
      camera.position.set(framing.position.x + follow.x * 1.4 + (Math.random() * 2 - 1) * jolt, framing.position.y + (Math.random() * 2 - 1) * jolt, framing.position.z + follow.z);
      look.set(framing.target.x + follow.x, framing.target.y, framing.target.z + follow.z);
      camera.lookAt(look);
      renderer.render(scene, camera);
    },
    pick(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      if (!layout || !rect.width || !rect.height) return null;
      pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, pickCamera);
      if (!raycaster.ray.intersectPlane(pickPlane, picked)) return null;
      const field = layout.toField(picked.x, picked.z);
      return { x: clamp(field.x, -W, W * 2), y: clamp(field.y, -H, H * 2) };
    },
    resize(width, height) {
      if (width <= 0 || height <= 0) return;
      renderer.setSize(width, height, false);
      for (const each of [camera, pickCamera]) {
        each.aspect = width / height;
        each.updateProjectionMatrix();
      }
    },
    dispose() {
      canvas.removeEventListener("webglcontextlost", onContextLost);
      if (layout) disposeTree(layout.group);
      disposeTree(scene);
      for (const part of Object.values(batParts)) part.dispose();
      environment.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
  return stage;
};
