import * as THREE from "three";
import { DRINK_NAMES, PAGE_TURN_MS, SIP_DURATION_MS, type Coffee, type Drink, type PlayerProp } from "@repo/shared";
import { BICYCLE_SADDLE, BIKE_COLORS, makeBicycle } from "./office-scene";
import type { Gear, Person } from "./people";
import { makeReadingBook, type ReadingBook } from "./reading-book";
import { sipLift } from "../../lib/maps/micro-motion";

// Bikes and drinks in the 3D view. The 2D map decides who has what (props-on-map.ts); this shows
// it: a rider on a bike sized to them, pedalling it along (wheels rolling, cranks turning, feet on
// the pedals and hands on the bars), leaning and steering into turns and putting a foot down when
// they stop, and a labelled can in a drinker's hand that they raise to their mouth for each sip.

// Riders sit this much higher than they stand, so their feet clear the floor at the pedals' bottom.
const RIDE_LIFT = 0.1;
// The saddle sits this far below the hips (the hip joint is above the seat of the trousers).
const SADDLE_BELOW_HIPS = 0.06;
const WHEEL_RADIUS = 0.21; // the bicycle's own wheel radius, before it is scaled
const GEAR_RATIO = 0.3; // crank turns per wheel turn: about 95 a minute at a bike's 10 tiles a second
// Each foot tips this far toes down (radians) with its pedal at the top, and this much more at the
// bottom, as a rider's ankle does going round.
const ANKLE_TOP = 0.08;
const ANKLE_SWING = 0.22;
// Into a turn the bike leans this share of the lean that would balance it (at most MAX_LEAN,
// radians), and the bars turn with how fast it is turning (radians per radian a second).
const LEAN_SHARE = 0.5;
const MAX_LEAN = 0.35;
const STEER_PER_TURN = 0.06;
const MAX_STEER = 0.5;
// A bike that hasn't moved for STOP_AFTER seconds has stopped. The rider slides forward off the
// saddle and a little lower, puts their left foot down beside the bike (FOOT_DOWN: metres out and
// ahead, toes down) and lets it lean that way, and brings the cranks round so the right pedal is
// forward and up, ready to push off.
const STOP_AFTER = 0.3;
const STOP_DROP = 0.05;
const STOP_SLIDE = 0.06;
const STOP_LEAN = 0.14;
const STOP_CRANK = 1.2;
const FOOT_DOWN = { out: 0.27, ahead: 0.06, pitch: 0.35 };

// The moving parts of a bike from makeBicycle (office-scene.ts).
type BikeParts = {
  wheels: THREE.Object3D[];
  crank: THREE.Object3D;
  pedals: THREE.Object3D[];
  steer: THREE.Object3D;
  steerAxis: THREE.Vector3;
  grips: THREE.Object3D[];
};
const SIP_SECONDS = SIP_DURATION_MS / 1000;
// A drink is carried with the arm part way to the torch clip's raised arm: bent, at the waist.
const CARRY = 0.6;
let motionPreference: MediaQueryList | undefined;

const CAN_COLORS: Record<Drink, string> = { orange: "#f28a2e", cola: "#c0392b", lime: "#7cc243", berry: "#8e44ad" };

// The label printed round a can: its colour, a white band with the drink's name, and stripes.
function canLabel(drink: Drink) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = CAN_COLORS[drink];
  ctx.fillRect(0, 0, 256, 128);
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.fillRect(0, 44, 256, 40);
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  for (let x = 0; x < 256; x += 32) ctx.fillRect(x, 0, 6, 128);
  ctx.fillStyle = CAN_COLORS[drink];
  ctx.font = "800 26px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(DRINK_NAMES[drink].toUpperCase(), 128, 65);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// A drinks can (0.13 high), its middle at its origin: the label round the side and an aluminium
// top and base with a ring pull.
export function makeCan(drink: Drink) {
  const group = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: "#d5dae2", metalness: 0.85, roughness: 0.25 });
  const side = new THREE.Mesh(
    new THREE.CylinderGeometry(0.034, 0.034, 0.11, 24, 1, true),
    new THREE.MeshStandardMaterial({ map: canLabel(drink), metalness: 0.45, roughness: 0.35 }),
  );
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.034, 0.012, 24), metal);
  top.position.y = 0.061;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.028, 0.012, 24), metal);
  base.position.y = -0.061;
  const tab = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.003, 0.01), metal);
  tab.position.set(0, 0.068, 0.008);
  group.add(side, top, base, tab);
  group.traverse((child) => { child.castShadow = true; });
  return group;
}

// A coffee from the kitchen machine (about 0.1 high), its middle at its origin, in the cup it
// comes in: an espresso cup on a saucer, a cappuccino cup of foam, a tall latte glass, a clay
// kulhad of chai, or a red mug of hot chocolate under cream.
export function makeCup(coffee: Coffee) {
  const group = new THREE.Group();
  const china = new THREE.MeshStandardMaterial({ color: "#f6f4ef", roughness: 0.35 });
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, y: number) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = y;
    group.add(mesh);
    return mesh;
  };
  const top = (radius: number, color: string, y: number) => add(new THREE.CircleGeometry(radius, 24).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color, roughness: 0.6 }), y);
  const handle = (radius: number, y: number, material: THREE.Material) => {
    const ring = add(new THREE.TorusGeometry(radius * 0.45, radius * 0.12, 8, 16, Math.PI), material, y);
    ring.rotation.z = -Math.PI / 2;
    ring.position.x = radius;
  };
  if (coffee === "espresso") {
    add(new THREE.CylinderGeometry(0.03, 0.022, 0.04, 24), china, -0.01);
    add(new THREE.CylinderGeometry(0.055, 0.05, 0.006, 24), china, -0.033);
    top(0.028, "#b8783d", 0.0105);
    handle(0.03, -0.01, china);
  } else if (coffee === "cappuccino") {
    add(new THREE.CylinderGeometry(0.045, 0.03, 0.055, 24), china, 0);
    add(new THREE.CylinderGeometry(0.07, 0.065, 0.006, 24), china, -0.03);
    top(0.042, "#fbf7ee", 0.028);
    top(0.008, "#5a2e1a", 0.0285);
    handle(0.045, 0, china);
  } else if (coffee === "latte") {
    const glass = new THREE.MeshStandardMaterial({ color: "#dfeaf0", roughness: 0.05, transparent: true, opacity: 0.35 });
    // The layers seen through the glass: coffee, milk and foam.
    add(new THREE.CylinderGeometry(0.029, 0.026, 0.04, 24), new THREE.MeshStandardMaterial({ color: "#6b3d1f", roughness: 0.5 }), -0.03);
    add(new THREE.CylinderGeometry(0.03, 0.029, 0.045, 24), new THREE.MeshStandardMaterial({ color: "#e9d6b8", roughness: 0.6 }), 0.0125);
    add(new THREE.CylinderGeometry(0.031, 0.03, 0.02, 24), new THREE.MeshStandardMaterial({ color: "#fbf7ee", roughness: 0.7 }), 0.045);
    add(new THREE.CylinderGeometry(0.033, 0.028, 0.11, 24, 1, true), glass, 0.005);
  } else if (coffee === "chai") {
    const clay = new THREE.MeshStandardMaterial({ color: "#b5552f", roughness: 0.95 });
    add(new THREE.CylinderGeometry(0.036, 0.026, 0.065, 20), clay, 0);
    top(0.033, "#c89660", 0.033);
  } else {
    const mug = new THREE.MeshStandardMaterial({ color: "#c8423f", roughness: 0.4 });
    add(new THREE.CylinderGeometry(0.035, 0.033, 0.075, 24), mug, 0);
    add(new THREE.SphereGeometry(0.033, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: "#fbf7ee", roughness: 0.8 }), 0.037);
    handle(0.035, 0, mug);
  }
  group.traverse((child) => { child.castShadow = true; });
  return group;
}

export function disposeObject(object: THREE.Object3D) {
  const done = new Set<unknown>();
  const free = (item?: { dispose(): void } | null) => { if (item && !done.has(item)) { done.add(item); item.dispose(); } };
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    free(mesh.geometry);
    for (const material of mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : []) {
      free((material as THREE.MeshStandardMaterial).map);
      free(material);
    }
  });
}

// What one person is shown with: their bike or can, and how far into riding, holding and sipping.
export type PropState = {
  key: string;
  bike: THREE.Group | null;
  can: THREE.Group | null;
  book: (ReadingBook & { id: string }) | null;
  reading: number;
  page: number;
  pageStart: number;
  ride: number;
  hold: number;
  sips: number;
  sipStart: number;
  // False until the first frame shows them: someone who arrives holding a can didn't just pick it up.
  started: boolean;
  // Riding: the cranks' angle, the distance and heading last frame (null before the first), when
  // the bike last moved, its speed (tiles a second), and how far it is stopped (0 to 1), leaning
  // into a turn and steering (radians).
  pedal: number;
  rolled: number | null;
  yaw: number | null;
  lastMoved: number;
  speed: number;
  stop: number;
  lean: number;
  steer: number;
};

export const emptyProps = (): PropState => ({
  key: "", bike: null, can: null, book: null, reading: 0, page: 0, pageStart: -Infinity,
  ride: 0, hold: 0, sips: 0, sipStart: -Infinity, started: false,
  pedal: 0, rolled: null, yaw: null, lastMoved: -Infinity, speed: 0, stop: 0, lean: 0, steer: 0,
});

// How far a sip has got (0 to 1 and back): up quickly, a moment at the mouth, then down.
function fadeBike(object: THREE.Object3D, opacity: number) {
  if (Math.abs((object.userData.propOpacity as number ?? -1) - opacity) < 0.01) return;
  object.userData.propOpacity = opacity;
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = opacity > 0.5;
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (!material.transparent) { material.transparent = true; material.needsUpdate = true; }
      material.opacity = opacity; material.depthWrite = opacity > 0.95;
    }
  });
}

// Brings a person's book, bike or can in line with their prop and returns the pose for it. `body` turns
// with them; `rolled` is how far they have moved (tiles), which turns the wheels and the pedals.
// A can that is put down is handed to `onDrop` (in world space) to fall to the floor.
export function applyProp(
  state: PropState,
  prop: PlayerProp | null,
  body: THREE.Group,
  person: Person | null,
  dt: number,
  time: number,
  rolled: number,
  onDrop: (can: THREE.Group) => void,
): Gear {
  const key = !prop ? "" : prop.kind === "bike" ? `bike:${prop.bike}` : prop.kind === "can" ? `can:${prop.drink}` : prop.kind === "cup" ? `cup:${prop.coffee}` : `book:${prop.book}`;
  // A can or a coffee: both are held, sipped and thrown away the same way.
  const drink = prop?.kind === "can" || prop?.kind === "cup" ? prop : null;
  if (key !== state.key) {
    if (state.bike && prop?.kind === "bike") {
      body.remove(state.bike);
      disposeObject(state.bike);
      state.bike = null;
    }
    if (state.can) {
      // Dropped from where it is in the hand (onDrop reads its place in the world first).
      onDrop(state.can);
      person?.hold(null);
      state.can = null;
    }
    if (state.book && prop?.kind === "book" && state.book.id !== prop.book) {
      person?.read(null); state.book.object.removeFromParent(); disposeObject(state.book.object); state.book = null;
    }
    if (prop?.kind === "bike") {
      state.bike = makeBicycle(BIKE_COLORS[prop.bike]);
      body.add(state.bike);
    } else if (drink) {
      state.can = drink.kind === "can" ? makeCan(drink.drink) : makeCup(drink.coffee);
      if (person) person.hold(state.can);
      else body.add(state.can);
      // A fresh can or cup was just taken from the machine: reach down for it.
      if (drink.sips === 0 && state.started) person?.gesture("pickup");
      state.sipStart = -Infinity;
    } else if (prop?.kind === "book") {
      state.book ??= { ...makeReadingBook(prop.book), id: prop.book };
      if (person) person.read(state.book.object);
      else body.add(state.book.object);
      state.page = prop.page; state.pageStart = -Infinity;
    }
    state.key = key;
    state.sips = drink ? drink.sips : 0;
  }
  if (drink && drink.sips > state.sips && state.started) state.sipStart = time;
  state.started = true;
  if (drink) state.sips = drink.sips;
  if (prop?.kind === "book") {
    if (state.page !== prop.page) state.pageStart = time;
    state.page = prop.page;
  }

  const blend = (value: number, goal: number, rate: number) => value + (goal - value) * (1 - Math.exp(-dt * rate));
  state.ride = blend(state.ride, prop?.kind === "bike" ? 1 : 0, 10);
  state.hold = blend(state.hold, drink ? 1 : 0, 8);
  state.reading = blend(state.reading, prop?.kind === "book" ? 1 : 0, 8);
  const flip = Math.min(1, Math.max(0, (time - state.pageStart) / (PAGE_TURN_MS / 1000)));
  if (state.book) {
    motionPreference ??= window.matchMedia("(prefers-reduced-motion: reduce)");
    const reduced = motionPreference.matches;
    state.book.update(state.reading, state.page, flip, reduced);
    if (!person) { state.book.object.position.set(0, 0.96, 0.28); state.book.object.rotation.x = -0.48; }
    if (prop?.kind !== "book" && state.reading < 0.015) {
      person?.read(null); state.book.object.removeFromParent(); disposeObject(state.book.object); state.book = null;
    }
  }
  if (state.bike && prop?.kind !== "bike" && state.ride < 0.015) {
    state.bike.removeFromParent(); disposeObject(state.bike); state.bike = null;
  }

  const gear: Gear = { ride: state.ride, hold: state.hold * CARRY, drink: state.hold * sipLift((time - state.sipStart) / SIP_SECONDS), reading: state.reading, pageTurn: flip };
  if (state.can && !person) {
    state.can.position.set(0.16, 0.87 + 0.38 * (gear.drink ?? 0), 0.19);
    state.can.rotation.x = -1.9 * (gear.drink ?? 0);
  }
  // How far they went and how fast they turned (radians a second, + to the left) since last frame.
  const moved = state.rolled === null ? 0 : Math.max(0, rolled - state.rolled);
  state.rolled = rolled;
  const yaw = body.rotation.y;
  const turning = state.yaw === null || dt <= 0 ? 0 : Math.atan2(Math.sin(yaw - state.yaw), Math.cos(yaw - state.yaw)) / dt;
  state.yaw = yaw;
  if (moved > 0) state.lastMoved = time;
  state.speed = blend(state.speed, dt > 0 ? moved / dt : 0, 6);
  body.rotation.z = 0;
  let lift = RIDE_LIFT;
  let slide = 0;
  if (state.bike) {
    fadeBike(state.bike, Math.min(1, state.ride * 1.15));
    const { wheels, crank, pedals, steer, steerAxis, grips } = state.bike.userData as BikeParts;
    // Sized so the saddle is just under the hips, and set back so it is under them.
    const scale = ((person?.hipHeight ?? 0.8) + RIDE_LIFT - SADDLE_BELOW_HIPS) / BICYCLE_SADDLE;
    state.bike.scale.setScalar(scale);
    state.bike.position.z = 0.135 * scale;
    const turns = moved / (WHEEL_RADIUS * scale);
    for (const wheel of wheels) wheel.rotation.x += turns;

    // Pedalling turns the cranks with the wheels; stopped, they come round to push off from.
    const stopped = time - state.lastMoved > STOP_AFTER;
    state.stop = blend(state.stop, stopped ? 1 : 0, stopped ? 4 : 10);
    if (stopped) state.pedal = blend(state.pedal, STOP_CRANK + Math.round((state.pedal - STOP_CRANK) / (Math.PI * 2)) * Math.PI * 2, 3);
    else state.pedal += turns * GEAR_RATIO;
    crank.rotation.x = state.pedal;
    // Each pedal stays level under its foot, tipped as far as the ankle above it.
    const pitches = pedals.map((pedal) => {
      const { y, z } = pedal.position;
      const height = (y * Math.cos(state.pedal) - z * Math.sin(state.pedal)) / Math.hypot(y, z);
      const pitch = ANKLE_TOP + (ANKLE_SWING * (1 - height)) / 2;
      pedal.rotation.x = pitch - state.pedal;
      return pitch;
    });

    // Leaning into a turn and steering through it, and leaning toward the foot put down when stopped.
    // Turning the body the negative way about its forward axis leans it to its left (+x).
    const balance = Math.atan((state.speed * turning) / 9.8) * LEAN_SHARE;
    state.lean = blend(state.lean, THREE.MathUtils.clamp(balance, -MAX_LEAN, MAX_LEAN), 10);
    state.steer = blend(state.steer, THREE.MathUtils.clamp(turning * STEER_PER_TURN, -MAX_STEER, MAX_STEER), 8);
    steer.quaternion.setFromAxisAngle(steerAxis, state.steer);
    body.rotation.z = -(state.lean + STOP_LEAN * state.stop) * state.ride;
    lift = RIDE_LIFT - (RIDE_LIFT + STOP_DROP) * state.stop;
    slide = STOP_SLIDE * state.stop;

    // Where the hands and feet go, now the bike is in place for this frame.
    body.updateWorldMatrix(true, true);
    const [leftGrip, rightGrip] = grips.map((grip) => grip.getWorldPosition(new THREE.Vector3()));
    const [leftPedal, rightPedal] = pedals.map((pedal) => pedal.localToWorld(new THREE.Vector3(0, 0.006, 0)));
    const facing = body.getWorldQuaternion(new THREE.Quaternion());
    const floor = body.getWorldPosition(new THREE.Vector3())
      .addScaledVector(new THREE.Vector3(1, 0, 0).applyQuaternion(facing).setY(0).normalize(), FOOT_DOWN.out)
      .addScaledVector(new THREE.Vector3(0, 0, 1).applyQuaternion(facing).setY(0).normalize(), FOOT_DOWN.ahead);
    gear.pedal = state.pedal;
    gear.upright = state.stop;
    gear.grips = [leftGrip!, rightGrip!];
    gear.feet = [
      { at: leftPedal!.lerp(floor, state.stop), pitch: pitches[0]! + (FOOT_DOWN.pitch - pitches[0]!) * state.stop },
      { at: rightPedal!, pitch: pitches[1]! },
    ];
  }
  if (person) {
    person.root.position.y = lift * state.ride;
    person.root.position.z = slide * state.ride;
  }
  return gear;
}

// Cans that were thrown away, falling to the floor and fading.
export type Falling = { object: THREE.Object3D; velocity: THREE.Vector3; spin: number; age: number };

export function dropCan(scene: THREE.Scene, can: THREE.Group, falling: Falling[]) {
  can.updateMatrixWorld(true);
  const position = can.getWorldPosition(new THREE.Vector3());
  const rotation = can.getWorldQuaternion(new THREE.Quaternion());
  can.removeFromParent();
  can.position.copy(position);
  can.quaternion.copy(rotation);
  scene.add(can);
  falling.push({ object: can, velocity: new THREE.Vector3(0, 0.8, 0), spin: 6, age: 0 });
}

export function stepFalling(scene: THREE.Scene, falling: Falling[], dt: number) {
  for (let i = falling.length - 1; i >= 0; i--) {
    const item = falling[i]!;
    item.age += dt;
    item.velocity.y -= 9.8 * dt;
    item.object.position.addScaledVector(item.velocity, dt);
    item.object.rotation.z += item.spin * dt;
    if (item.object.position.y < 0.035) {
      item.object.position.y = 0.035;
      item.velocity.set(0, 0, 0);
      item.spin *= 0.9;
    }
    if (item.age > 1.4) {
      scene.remove(item.object);
      disposeObject(item.object);
      falling.splice(i, 1);
    }
  }
}
