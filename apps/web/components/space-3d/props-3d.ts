import * as THREE from "three";
import { DRINK_NAMES, type Drink, type PlayerProp } from "@repo/shared";
import { BICYCLE_SADDLE, BIKE_COLORS, makeBicycle } from "./office-scene";
import type { Gear, Person } from "./people";

// Bikes and drinks in the 3D view. The 2D map decides who has what (props-on-map.ts); this shows
// it: a rider on a bike sized to them, its wheels rolling and cranks turning as they go, and a
// labelled can in a drinker's hand that they raise to their mouth for each sip.

// Riders sit this much higher than they stand, so their feet clear the floor at the pedals' bottom.
const RIDE_LIFT = 0.1;
// The saddle sits this far below the hips (the hip joint is above the seat of the trousers).
const SADDLE_BELOW_HIPS = 0.06;
const WHEEL_RADIUS = 0.21; // the bicycle's own wheel radius, before it is scaled
const GEAR_RATIO = 0.45; // crank turns per wheel turn
const SIP_SECONDS = 1.7;
// A drink is carried with the arm part way to the torch clip's raised arm: bent, at the waist.
const CARRY = 0.6;

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

export function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    mesh.geometry?.dispose();
    for (const material of mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : []) {
      (material as THREE.MeshStandardMaterial).map?.dispose();
      material.dispose();
    }
  });
}

// What one person is shown with: their bike or can, and how far into riding, holding and sipping.
export type PropState = {
  key: string;
  bike: THREE.Group | null;
  can: THREE.Group | null;
  ride: number;
  hold: number;
  sips: number;
  sipStart: number;
};

export const emptyProps = (): PropState => ({ key: "", bike: null, can: null, ride: 0, hold: 0, sips: 0, sipStart: -Infinity });

// How far a sip has got (0 to 1 and back): up quickly, a moment at the mouth, then down.
function sipCurve(t: number) {
  if (t <= 0 || t >= 1) return 0;
  const ease = (x: number) => x * x * (3 - 2 * x);
  if (t < 0.3) return ease(t / 0.3);
  if (t < 0.7) return 1;
  return ease((1 - t) / 0.3);
}

// Brings a person's bike or can in line with their prop and returns the pose for it. `body` turns
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
  const key = !prop ? "" : prop.kind === "bike" ? `bike:${prop.bike}` : `can:${prop.drink}`;
  if (key !== state.key) {
    if (state.bike) {
      body.remove(state.bike);
      disposeObject(state.bike);
      state.bike = null;
    }
    if (state.can) {
      person?.hold(null);
      onDrop(state.can);
      state.can = null;
    }
    if (prop?.kind === "bike") {
      state.bike = makeBicycle(BIKE_COLORS[prop.bike]);
      body.add(state.bike);
    } else if (prop?.kind === "can" && person) {
      state.can = makeCan(prop.drink);
      person.hold(state.can);
      // A fresh can was just taken from the machine's tray: reach down for it.
      if (prop.sips === 0) person.gesture("pickup");
    }
    state.key = key;
    state.sips = prop?.kind === "can" ? prop.sips : 0;
  }
  if (prop?.kind === "can" && prop.sips > state.sips) state.sipStart = time;
  if (prop?.kind === "can") state.sips = prop.sips;

  const blend = (value: number, goal: number, rate: number) => value + (goal - value) * (1 - Math.exp(-dt * rate));
  state.ride = blend(state.ride, prop?.kind === "bike" ? 1 : 0, 10);
  state.hold = blend(state.hold, prop?.kind === "can" ? 1 : 0, 8);

  let pedal = 0;
  if (state.bike) {
    // Sized so the saddle is just under the hips, and set back so it is under them.
    const scale = ((person?.hipHeight ?? 0.8) + RIDE_LIFT - SADDLE_BELOW_HIPS) / BICYCLE_SADDLE;
    state.bike.scale.setScalar(scale);
    state.bike.position.z = 0.135 * scale;
    const turns = rolled / (WHEEL_RADIUS * scale);
    for (const wheel of state.bike.userData.wheels as THREE.Group[]) wheel.rotation.x = turns;
    pedal = turns * GEAR_RATIO;
    (state.bike.userData.crank as THREE.Group).rotation.x = pedal;
  }
  if (person) person.root.position.y = RIDE_LIFT * state.ride;
  return { ride: state.ride, pedal, hold: state.hold * CARRY, drink: sipCurve((time - state.sipStart) / SIP_SECONDS) };
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
