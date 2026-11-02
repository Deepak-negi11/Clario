"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { Crosshair, LoaderCircle, Map as MapIcon, UserRoundPen, X } from "lucide-react";
import {
  BREW_MS, coworkerMission, customSeats, getCoworker, getMapTemplate, RIDE_STEP_MS, WALK_STEP_MS, type AvatarLook, type CoworkerId, type CustomMap, type PlayerProp,
} from "@repo/shared";
import { companions, type TalkerId } from "../../lib/companions/store";
import { lookKey, originalLook } from "../../lib/avatar/recolor";
import { readSavedLook } from "../../lib/avatar/saved-look";
import { AvatarPicker } from "../game-ui/avatar-picker";
import { HQ_CLAUDE_SEATS, HQ_COLS, HQ_COWORKERS, HQ_ITEMS, HQ_MENTOR, HQ_PATH, HQ_ROWS, type Dir, type HqItem } from "../../lib/maps/clario-hq";
import { hqPlaySpots, playSpotsFor, spotFront, spotInReach, type PlayAction } from "../../lib/maps/play-spots";
import { makeClaude3d } from "./claude-3d";
import { buildCustomOffice } from "./custom-scene";
import { buildOffice, clearOffice, disposeScene, loadModels, seatMap, textSprite, type DeskSpot, type ModelSet, type SwivelChair } from "./office-scene";
import { loadPeople, makePerson, type Doing, type Keyboard, type PeopleKit, type Person } from "./people";
import { applyProp, disposeObject, dropCan, emptyProps, makeCan, makeCup, stepFalling, type Falling, type PropState } from "./props-3d";
import { createTalkerMover, makeTalker, type Talker } from "./talkers";
import { coworkerPlaces } from "../../lib/companions/coworker-places";
import { makeWorld } from "./world";
import type { SceneBridge, SceneMapInfo } from "../phaser/scene-bridge";
import { attachTvScreen } from "../tv/tv-screen-3d";
import { attachProjectors, type ProjectorFeed } from "./projector-3d";
import { attachNoticeBoard3d, isNoticeBoard } from "./notice-board-3d";
import { attachBadgeReaders3d, isBadgeReader } from "./badge-reader-3d";
import { badgeReadersFor } from "../../lib/maps/badge-reader-spot";
import { microApproach, microSpotsFor } from "../../lib/maps/micro-spots";

type Position = { x: number; y: number };

const AVATAR_COLORS = ["#3a6ee8", "#d4675a", "#2c8c84", "#d29c33", "#7a5fd0", "#4caf6d"];
const FACING: Record<Dir, number> = { down: 0, right: Math.PI / 2, up: Math.PI, left: -Math.PI / 2 };

// Background coworkers, in the 3D view only: people from the character kit sitting at desks,
// meeting tables, sofas and in the Hack Space so the office feels lived in. They aren't players,
// so they have no name tags, and each gives up its seat while a real person is on that tile.
// Tiles are seats in lib/maps/clario-hq.ts; one that is no longer a seat is skipped.
const COWORKERS: { id: string; x: number; y: number; talking?: boolean }[] = [
  // Open Desks' lounge sofa (Claude has the cubicle chairs)
  { id: "cw-aarav", x: 10, y: 14, talking: true }, { id: "cw-lena", x: 12, y: 14 },
  // A meeting in Meeting Room 1, and a one-to-one in Meeting Room 2
  { id: "cw-sneha", x: 6, y: 6, talking: true }, { id: "cw-marco", x: 8, y: 6 },
  { id: "cw-yuki", x: 7, y: 9, talking: true }, { id: "cw-dev", x: 9, y: 9 },
  { id: "cw-amara", x: 32, y: 6, talking: true }, { id: "cw-felix", x: 33, y: 9 },
  // Lounge, Kitchen and Library
  { id: "cw-ines", x: 32, y: 18, talking: true }, { id: "cw-tariq", x: 40, y: 16 },
  { id: "cw-mei", x: 40, y: 7 }, { id: "cw-noah", x: 9, y: 30 },
  // Hack Space and Focus Room 1
  { id: "cw-zara", x: 47, y: 28 }, { id: "cw-kabir", x: 55, y: 28 }, { id: "cw-elif", x: 15, y: 5 },
];

// The people you can talk to on Clario HQ (Maya the mentor and the AI coworkers), standing where
// the 2D map has them, with their name over their head. Clicking one walks you over, or opens
// their panel once you are next to them; E works too, through the 2D map running underneath.
// Asked in their panel, they walk or play with you (talkers.ts).
const TALKERS: { id: TalkerId; x: number; y: number; look: AvatarLook; name: string; color: string }[] = [
  { id: "maya", ...HQ_MENTOR, look: originalLook("amelia"), name: "Maya", color: "#b8325e" },
  ...HQ_COWORKERS.flatMap(({ id, x, y, look }) => {
    const coworker = getCoworker(id);
    return coworker ? [{ id, x, y, look, name: coworkerMission(coworker).coworker.name.split(" ")[0]!, color: coworker.color }] : [];
  }),
];

// The arcade machines, game tables and TVs on Clario HQ. Clicking one uses it, as on the 2D map.
const PLAY_SPOTS = hqPlaySpots();

function colorFor(id: string) {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]!;
}

const SKIN = ["#f1c7a3", "#e2ad84", "#c68b62", "#8d5a3b", "#f6d6be"];
const HAIR = ["#3b2a22", "#1f1a17", "#6b4a2f", "#b9853e", "#2b2b30"];
const PANTS = ["#2f3a56", "#3b3f4a", "#46536b", "#2d4a6b", "#5b4a3a"];

function pick<T>(id: string, list: T[], salt: number) {
  let hash = salt;
  for (const char of id) hash = (hash * 33 + char.charCodeAt(0)) | 0;
  return list[Math.abs(hash) % list.length]!;
}

// Joint heights in the character's own units (it is scaled to RIG_SCALE in the world).
const RIG_SCALE = 0.9;
const HIP_Y = 0.74;
const SEATED_HIP_Y = 0.5;
const WALK_SPEED = 1100 / WALK_STEP_MS; // tiles a second, a touch quicker than the 2D map's steps so it keeps up
const STRIDE = 4; // walk-cycle radians per tile walked, so feet don't slide
const RIDE_FACTOR = WALK_STEP_MS / RIDE_STEP_MS; // a bike crosses a tile in RIDE_STEP_MS instead of WALK_STEP_MS
// Where a bought can lies in a map's (first) vending machine tray: office-scene.ts builds the
// machine 0.12 back from its tile's middle, its front 0.36 ahead of that, with the tray low on the
// front a little left of centre. The can lies just proud of the front so it shows in the slot.
// Where your coffee stands in front of a kitchen machine (office-scene.ts): on the counter, in front
// of the machine on a one-tile counter, or by the machine on the two-tile coffee station.
function coffeeCupSpot(spot: { x: number; y: number; w: number }) {
  return spot.w === 1
    ? new THREE.Vector3(spot.x + 0.5, 0.94, spot.y + 0.5 + 0.12)
    : new THREE.Vector3(spot.x + 1 - 0.2, 0.79, spot.y + 0.5 + 0.12);
}

// The cup on the counter, a ring above it that fills as it brews, and six puffs of steam that rise
// and fade in turn. `update` takes how far the brew is (0 to 1) and the time in seconds.
function makeBrewParts() {
  const group = new THREE.Group();
  let cup: THREE.Group | null = null;
  const ringCanvas = document.createElement("canvas");
  ringCanvas.width = ringCanvas.height = 64;
  const ringTexture = new THREE.CanvasTexture(ringCanvas);
  ringTexture.colorSpace = THREE.SRGBColorSpace;
  const ring = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTexture, depthTest: false, transparent: true }));
  ring.scale.setScalar(0.22);
  ring.position.y = 0.42;
  ring.renderOrder = 20;
  group.add(ring);
  let drawn = -1;
  const drawRing = (progress: number) => {
    const ctx = ringCanvas.getContext("2d")!;
    ctx.clearRect(0, 0, 64, 64);
    ctx.fillStyle = "rgba(18,21,28,0.6)";
    ctx.beginPath(); ctx.arc(32, 32, 30, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#ffc46b";
    ctx.lineWidth = 8;
    ctx.lineCap = "round";
    ctx.beginPath(); ctx.arc(32, 32, 20, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress); ctx.stroke();
    ringTexture.needsUpdate = true;
  };
  const puffCanvas = document.createElement("canvas");
  puffCanvas.width = puffCanvas.height = 32;
  const puffCtx = puffCanvas.getContext("2d")!;
  const glow = puffCtx.createRadialGradient(16, 16, 0, 16, 16, 16);
  glow.addColorStop(0, "rgba(255,255,255,0.9)");
  glow.addColorStop(1, "rgba(255,255,255,0)");
  puffCtx.fillStyle = glow;
  puffCtx.fillRect(0, 0, 32, 32);
  const puffTexture = new THREE.CanvasTexture(puffCanvas);
  const puffs = Array.from({ length: 6 }, () => {
    const puff = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTexture, transparent: true, depthWrite: false }));
    group.add(puff);
    return puff;
  });
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  return {
    group,
    setCup(next: THREE.Group | null) {
      if (cup) { group.remove(cup); disposeObject(cup); }
      cup = next;
      if (cup) group.add(cup);
    },
    update(progress: number, time: number, active: boolean) {
      group.visible = active;
      if (!active) return;
      const brewing = progress < 1;
      ring.visible = brewing;
      const step = Math.round(progress * 40) / 40;
      if (brewing && step !== drawn) { drawRing(step); drawn = step; }
      // Steam: busy while brewing, a lazy curl once it's ready.
      const speed = brewing ? 0.9 : 0.35;
      puffs.forEach((puff, i) => {
        const phase = (time * speed + i / puffs.length) % 1;
        puff.visible = !reduced.matches;
        puff.position.set(Math.sin(phase * 6 + i) * 0.02, 0.06 + phase * 0.3, 0);
        puff.scale.setScalar(0.04 + phase * 0.09);
        (puff.material as THREE.SpriteMaterial).opacity = (1 - phase) * (brewing ? 0.55 : 0.3);
      });
    },
  };
}

function vendingTray(items: readonly HqItem[]) {
  const machine = items.find((item) => item.kind === "vending-machine");
  return machine ? { x: machine.x + 0.5 - 0.11, y: 0.25, z: machine.y + 0.5 - 0.12 + 0.36 + 0.035 } : null;
}

type Limb = { upper: THREE.Group; lower: THREE.Group };
type Rig = { hips: THREE.Group; torso: THREE.Group; head: THREE.Group; arms: [Limb, Limb]; legs: [Limb, Limb] };

type Avatar = {
  group: THREE.Group;
  body: THREE.Group;
  // A character model when they loaded, otherwise the simple person built from shapes.
  person: Person | null;
  rig: Rig | null;
  label: THREE.Sprite;
  name: string;
  // The avatar look it was built from ("" for none), so a changed look rebuilds it.
  look: string;
  // The tile the 2D map has them on, and the tiles still to walk through to get there, in order.
  target: THREE.Vector3;
  route: THREE.Vector3[];
  heading: number;
  seated: boolean;
  // Which way their seat faces, once they reach it.
  seatHeading: number | null;
  // Walk cycle angle, and how far into the walk and sit poses the body is (0 to 1).
  phase: number;
  walk: number;
  sit: number;
  lastMoved: number;
  // How fast the 2D map hands them new tiles while they keep moving (tiles a second, measured),
  // and when it last did (the 3D clock's time).
  pace: number;
  lastTileAt: number;
  // How fast they have been going lately (tiles a second), so their steps match it.
  speed: number;
  // So people in a room don't breathe and glance around in step.
  offset: number;
  // Their bike or drink (props-3d.ts).
  props: PropState;
  // The 2D map's cues on people (showCues): a ring while they're in your call, Claude hovering
  // over them while their agent works, and the emoji reactions they send, rising and fading.
  callRing: THREE.Mesh;
  helper: THREE.Group | null;
  reactions: { sprite: THREE.Sprite; age: number }[];
};

function makeAvatar(id: string, name: string, isSelf: boolean, people: PeopleKit | null, look: AvatarLook | null): Avatar {
  const group = new THREE.Group();
  // Clicking them opens their card, as clicking them on the 2D map does.
  group.userData.player = id;
  const body = new THREE.Group();
  group.add(body);
  const person = people ? makePerson(people, id, colorFor(id), { look }) : null;
  if (person) body.add(person.root);
  const rig = person ? null : buildRig(id, body, look);

  // Shown round their feet while you can hear and see them (they're near enough to be in your call).
  const callRing = new THREE.Mesh(
    new THREE.RingGeometry(0.43, 0.455, 48),
    new THREE.MeshBasicMaterial({ color: "#76d8b3", transparent: true, opacity: 0.5, depthWrite: false }),
  );
  callRing.rotation.x = -Math.PI / 2;
  callRing.position.y = 0.045;
  callRing.visible = false;
  group.add(callRing);

  const label = textSprite(name, isSelf
    ? { color: "#12151c", background: "rgba(255,255,255,0.95)" }
    : { color: "#ffffff", background: "rgba(18,21,28,0.85)" });
  label.scale.multiplyScalar(0.36);
  label.position.y = 1.95;
  label.renderOrder = 20;
  group.add(label);

  return {
    group, body, person, rig, label, name, look: look ? lookKey(look) : "",
    target: new THREE.Vector3(), route: [], heading: 0, seated: false, seatHeading: null,
    phase: 0, walk: 0, sit: 0, lastMoved: -1, pace: WALK_SPEED, lastTileAt: -Infinity, speed: 0, offset: pick(id, [0, 1.3, 2.6, 3.9, 5.2], 13), props: emptyProps(),
    callRing, helper: null, reactions: [],
  };
}

// The fallback person, used if the character models fail to load: every limb is a group whose
// origin is its joint, so turning the group bends the limb there. They face +z.
function buildRig(id: string, body: THREE.Group, look: AvatarLook | null = null): Rig {
  const rig = new THREE.Group();
  rig.scale.setScalar(RIG_SCALE);
  body.add(rig);

  const material = (color: string, roughness = 0.75) => new THREE.MeshStandardMaterial({ color, roughness });
  const shirt = material(look?.top ?? colorFor(id), 0.7);
  const pants = material(pick(id, PANTS, 7), 0.8);
  const skin = material(look?.skin ?? pick(id, SKIN, 3), 0.8);
  const hair = material(look?.hair ?? pick(id, HAIR, 11), 0.9);
  const shoes = material("#2a2e38", 0.6);
  const part = (parent: THREE.Object3D, geometry: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const joint = (parent: THREE.Object3D, x: number, y: number, z = 0) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);
    parent.add(pivot);
    return pivot;
  };

  const hips = joint(rig, 0, HIP_Y);
  part(hips, new RoundedBoxGeometry(0.36, 0.18, 0.24, 2, 0.06), pants, 0, 0.02, 0);

  const legs = ([-1, 1] as const).map((side) => {
    const upper = joint(hips, side * 0.1, -0.02);
    part(upper, new THREE.CapsuleGeometry(0.082, 0.18, 4, 10), pants, 0, -0.17, 0);
    const lower = joint(upper, 0, -0.34);
    part(lower, new THREE.CapsuleGeometry(0.066, 0.2, 4, 10), pants, 0, -0.16, 0);
    part(lower, new RoundedBoxGeometry(0.12, 0.07, 0.22, 2, 0.03), shoes, 0, -0.34, 0.04);
    return { upper, lower };
  }) as [Limb, Limb];

  const torso = joint(hips, 0, 0.08);
  part(torso, new RoundedBoxGeometry(0.42, 0.46, 0.25, 3, 0.09), shirt, 0, 0.22, 0);
  part(torso, new THREE.CylinderGeometry(0.06, 0.07, 0.1, 10), skin, 0, 0.48, 0);

  const arms = ([-1, 1] as const).map((side) => {
    const upper = joint(torso, side * 0.27, 0.4);
    upper.rotation.z = side * 0.08;
    part(upper, new THREE.CapsuleGeometry(0.062, 0.15, 4, 10), shirt, 0, -0.13, 0);
    const lower = joint(upper, 0, -0.27);
    part(lower, new THREE.CapsuleGeometry(0.052, 0.14, 4, 10), skin, 0, -0.1, 0);
    part(lower, new THREE.SphereGeometry(0.058, 10, 8), skin, 0, -0.22, 0.01);
    return { upper, lower };
  }) as [Limb, Limb];

  const head = joint(torso, 0, 0.54);
  part(head, new THREE.SphereGeometry(0.2, 20, 16), skin, 0, 0.17, 0);
  for (const side of [-1, 1]) part(head, new THREE.SphereGeometry(0.045, 8, 6), skin, side * 0.195, 0.15, -0.01);
  const cap = part(head, new THREE.SphereGeometry(0.212, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2.05), hair, 0, 0.19, -0.015);
  cap.rotation.x = -0.32;
  if (pick(id, [false, true], 5)) part(head, new RoundedBoxGeometry(0.38, 0.3, 0.12, 2, 0.05), hair, 0, 0.08, -0.13);
  // Eyes on the front (+z) so you can tell which way someone faces.
  const eye = new THREE.MeshBasicMaterial({ color: "#1b1d2a" });
  for (const side of [-1, 1]) part(head, new THREE.SphereGeometry(0.026, 8, 6), eye, side * 0.072, 0.17, 0.185).castShadow = false;

  return { hips, torso, head, arms, legs };
}

// Takes an avatar out of the scene and frees its meshes and name tag. A character model's
// geometry is shared with everyone else's, so only its own materials go. Sprites share one
// geometry in three.js, so theirs is left alone too.
function removeAvatar(scene: THREE.Scene, avatar: Avatar) {
  scene.remove(avatar.group);
  // A can in their hand hangs off the person's root, which leaves the group below.
  if (avatar.props.can) {
    avatar.person?.hold(null);
    disposeObject(avatar.props.can);
    avatar.props.can = null;
  }
  if (avatar.props.book) {
    avatar.person?.read(null);
    avatar.props.book.object.removeFromParent();
    disposeObject(avatar.props.book.object);
    avatar.props.book = null;
  }
  if (avatar.person) {
    avatar.person.dispose();
    avatar.body.remove(avatar.person.root);
  }
  avatar.group.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!(child instanceof THREE.Sprite)) mesh.geometry?.dispose();
    const materials = mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : [];
    for (const material of materials) {
      (material as THREE.SpriteMaterial).map?.dispose();
      material.dispose();
    }
  });
}

// Walks the tiles the 2D map took, in order, at a steady pace, so it goes through doors and round
// corners and never cuts through a wall to wherever the 2D map has got to. Turns it to face where
// it is going, and blends its idle, walking and sitting poses, and riding or drinking (`prop`).
function stepAvatar(
  avatar: Avatar,
  dt: number,
  time: number,
  prop: PlayerProp | null,
  onDrop: (can: THREE.Group) => void,
  // Who they look at and the laptop they type at, if any (people.ts).
  doing: Pick<Doing, "look" | "typing"> = {},
) {
  const phaseBefore = avatar.phase;
  // Far behind (a hidden tab, a long freeze): skip to a tile on the way rather than run a marathon.
  if (avatar.route.length > 16) avatar.group.position.copy(avatar.route.splice(0, avatar.route.length - 16).at(-1)!);
  // Keep pace with the 2D map: go at the rate it hands out tiles, a little faster when behind and a
  // little slower as the last tile nears. Going at a set speed reached each tile before the next
  // came (the 2D map's steps run a frame or so over their tween) and stood there, a stutter on
  // every tile. A bike goes faster than a walk.
  const riding = prop?.kind === "bike";
  const nominal = WALK_SPEED * (riding ? RIDE_FACTOR : 1);
  let behind = 0;
  let from = avatar.group.position;
  for (const to of avatar.route) {
    behind += from.distanceTo(to);
    from = to;
  }
  const pace = THREE.MathUtils.clamp(avatar.pace, 0.4 * nominal, 1.1 * nominal);
  let budget = pace * THREE.MathUtils.clamp(0.7 + 0.3 * behind, 0.7, 2.5) * dt;
  while (avatar.route.length && budget > 0) {
    const next = avatar.route[0]!;
    const toNext = next.clone().sub(avatar.group.position);
    const distance = toNext.length();
    // A jump (joining, a teleport, a long pause in updates) isn't walked.
    if (distance > 4) {
      avatar.group.position.copy(next);
      avatar.route.shift();
      continue;
    }
    const step = Math.min(distance, budget);
    if (distance > 0.0005) {
      avatar.heading = Math.atan2(toNext.x, toNext.z);
      avatar.group.position.addScaledVector(toNext, step / distance);
      avatar.phase += step * STRIDE;
      avatar.lastMoved = time;
    }
    budget -= step;
    if (step >= distance) avatar.route.shift();
  }
  if (!avatar.route.length && avatar.seatHeading !== null) avatar.heading = avatar.seatHeading;
  const blend = (value: number, goal: number, rate: number) => value + (goal - value) * (1 - Math.exp(-dt * rate));
  if (dt > 0) avatar.speed = blend(avatar.speed, (avatar.phase - phaseBefore) / STRIDE / dt, 6);
  // A short grace period keeps the stride going between tiles instead of stopping at each one.
  const walking = time - avatar.lastMoved < 0.12;
  avatar.walk = blend(avatar.walk, walking ? 1 : 0, 10);
  // Riding over a chair doesn't sit you down on it.
  avatar.sit = blend(avatar.sit, avatar.seated && !walking && !riding ? 1 : 0, 8);

  const turn = Math.atan2(Math.sin(avatar.heading - avatar.body.rotation.y), Math.cos(avatar.heading - avatar.body.rotation.y));
  avatar.body.rotation.y += turn * (1 - Math.exp(-dt * 12));

  const gear = applyProp(avatar.props, prop, avatar.body, avatar.person, dt, time, avatar.phase / STRIDE, onDrop);
  if (avatar.person) avatar.person.update(dt, avatar.walk, avatar.sit, 0, gear, { ...doing, speed: avatar.speed });
  else if (avatar.rig) {
    poseRig(avatar.rig, avatar, time);
    const reading = avatar.props.reading;
    for (const arm of avatar.rig.arms) {
      arm.upper.rotation.x -= 0.65 * reading;
      arm.lower.rotation.x -= 0.45 * reading;
    }
    avatar.rig.head.rotation.x += 0.25 * reading;
  }
}

// Emoji reactions rise this far over a few seconds as they fade, as on the 2D map (a little slower,
// as the 3D camera is usually further off).
const REACTION_SECONDS = 2.4;
const REACTION_RISE = 0.9;
// Claude, hovering over someone whose agent is working, is this size and this high.
const HELPER_SCALE = 0.42;
const HELPER_Y = 2.12;

// Frees what an object made for itself. Sprites share one geometry, so theirs stays.
function freeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!(child instanceof THREE.Sprite)) mesh.geometry?.dispose();
    for (const material of mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : []) {
      (material as THREE.SpriteMaterial).map?.dispose();
      material.dispose();
    }
  });
}

// The 2D map's cues on a person, in 3D: a green ring while they're in your call, their name faded
// while they're out of earshot (the 2D map fades them), and Claude hovering over them, typing,
// while their agent works. `facing` turns Claude to the camera.
function showCues(avatar: Avatar, cue: { inCall: boolean; heard: boolean; busy: boolean }, dt: number, time: number, facing: number) {
  avatar.callRing.visible = cue.inCall;
  avatar.label.position.y = 1.95 - 0.38 * avatar.sit;
  avatar.label.material.opacity = cue.heard ? 1 : 0.5;
  if (cue.busy && !avatar.helper) {
    avatar.helper = makeClaude3d(avatar.offset);
    avatar.helper.scale.setScalar(HELPER_SCALE);
    avatar.group.add(avatar.helper);
  } else if (!cue.busy && avatar.helper) {
    avatar.group.remove(avatar.helper);
    freeObject(avatar.helper);
    avatar.helper = null;
  }
  if (avatar.helper) {
    avatar.helper.position.y = HELPER_Y + Math.abs(Math.sin(time * 7.7 + avatar.offset)) * 0.04;
    avatar.helper.rotation.y = facing;
  }
  // Reactions rise from just over their name, or over Claude, easing out as they fade.
  for (let i = avatar.reactions.length - 1; i >= 0; i--) {
    const reaction = avatar.reactions[i]!;
    reaction.age += dt;
    const t = Math.min(1, reaction.age / REACTION_SECONDS);
    reaction.sprite.position.y = (avatar.helper ? 2.55 : 2.2) + REACTION_RISE * (1 - (1 - t) ** 3);
    reaction.sprite.material.opacity = 1 - t * t;
    if (t >= 1) {
      avatar.group.remove(reaction.sprite);
      freeObject(reaction.sprite);
      avatar.reactions.splice(i, 1);
    }
  }
}

function addReaction(avatar: Avatar, emoji: string) {
  const sprite = textSprite(emoji, { color: "#12151c", background: null, size: 72 });
  sprite.scale.multiplyScalar(0.85);
  sprite.renderOrder = 21;
  avatar.group.add(sprite);
  avatar.reactions.push({ sprite, age: 0 });
}

// Poses the fallback person: a walk cycle driven by the distance covered, a breathing idle,
// and a sitting pose.
function poseRig(rig: Rig, { walk, sit, phase, offset }: Avatar, time: number) {
  const stand = 1 - Math.max(walk, sit);
  const swing = Math.sin(phase);
  const [legL, legR] = rig.legs;
  const [armL, armR] = rig.arms;

  // Turning a limb's group by +x swings it backwards. Knees bend while the leg swings forward.
  legL.upper.rotation.x = swing * 0.6 * walk - sit * Math.PI / 2;
  legR.upper.rotation.x = -swing * 0.6 * walk - sit * Math.PI / 2;
  legL.lower.rotation.x = (0.1 + Math.max(0, -Math.cos(phase)) * 0.95) * walk + sit * Math.PI / 2;
  legR.lower.rotation.x = (0.1 + Math.max(0, Math.cos(phase)) * 0.95) * walk + sit * Math.PI / 2;
  // Each arm swings with the opposite leg; seated, the hands rest on the lap.
  armL.upper.rotation.x = -swing * 0.55 * walk - sit * 0.35;
  armR.upper.rotation.x = swing * 0.55 * walk - sit * 0.35;
  armL.lower.rotation.x = -(0.15 + 0.4 * walk + 0.75 * sit);
  armR.lower.rotation.x = -(0.15 + 0.4 * walk + 0.75 * sit);

  rig.hips.position.y = HIP_Y + Math.cos(phase * 2) * 0.035 * walk - (HIP_Y - SEATED_HIP_Y) * sit;
  rig.hips.position.z = -0.12 * sit;
  rig.hips.rotation.z = Math.sin(time * 1.1 + offset) * 0.015 * stand;
  rig.torso.rotation.x = 0.08 * walk;
  rig.torso.rotation.y = swing * 0.12 * walk;
  rig.torso.scale.y = 1 + Math.sin(time * 2.2 + offset) * 0.014 * (1 - walk);
  rig.head.rotation.x = -0.06 * walk;
  rig.head.rotation.y = Math.sin(time * 0.55 + offset) * 0.22 * (1 - walk);
}

export function Office3D({
  selfId,
  selfRef,
  othersRef,
  namesRef,
  onClose,
  onWalkTo,
  errandTarget = null,
  customMap = null,
  mapName,
  looksRef,
  onUpdateLook,
  onTalk,
  onPlay,
  bridgeRef,
  nearbyRef,
  reactionsRef,
  activitiesRef,
  projectorRef,
  onPlayerClick,
}: {
  selfId: string | null;
  selfRef: RefObject<Position>;
  othersRef: RefObject<Record<string, Position>>;
  namesRef: RefObject<Record<string, string>>;
  // Back to the 2D map. Without it (Clario HQ 3D, which has no 2D map) there's no Close button.
  onClose?: () => void;
  // Everyone's avatar look, the same as on the 2D map, so people look alike in both.
  looksRef?: RefObject<Record<string, AvatarLook>>;
  // Saves your look (on your account and for everyone in the space). Without it you can't edit it here.
  onUpdateLook?: (look: AvatarLook) => Promise<void> | void;
  // Walks you to a tile along the 2D map's path, as clicking the 2D map does.
  onWalkTo?: (x: number, y: number) => void;
  // Opens the talk panel for Maya or an AI coworker.
  onTalk?: (id: TalkerId) => void;
  // Opens an arcade game or the TV (lib/maps/play-spots.ts).
  onPlay?: (action: PlayAction) => void;
  // The 2D map's bridge: who rides which bike and holds which drink, and the can in the vending
  // machine's tray (phaser/scenes/props-on-map.ts).
  bridgeRef?: RefObject<SceneBridge>;
  // The room an errand wants you to reach, marked with a floating pin.
  errandTarget?: { x: number; y: number; width: number; height: number } | null;
  // A map someone built for this space. Without one the view shows Clario HQ. When it changes
  // (its owner is editing it) the office is rebuilt in place.
  customMap?: CustomMap | null;
  mapName?: string;
  // The same as the 2D map's: who is near enough to be in your call, the emoji reactions people
  // send, and whose agent is working (Claude hovers over them).
  nearbyRef?: RefObject<Set<string>>;
  reactionsRef?: RefObject<{ id: string; userId: string; emoji: string; at: number }[]>;
  activitiesRef?: RefObject<Record<string, { state: "cooking" | "done" }>>;
  // What the meeting-room projector shows, for the room you're in (hooks/use-projector.ts).
  projectorRef?: RefObject<ProjectorFeed | null>;
  // Clicking someone opens their card, as on the 2D map.
  onPlayerClick?: (userId: string) => void;
}) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const customMapRef = useRef(customMap);
  customMapRef.current = customMap;
  const layoutRef = useRef<((map: CustomMap | null) => void) | null>(null);
  const errandTargetRef = useRef(errandTarget);
  errandTargetRef.current = errandTarget;
  // Kept in a ref so a new callback each render doesn't rebuild the scene.
  const walkToRef = useRef(onWalkTo);
  walkToRef.current = onWalkTo;
  const talkRef = useRef(onTalk);
  talkRef.current = onTalk;
  const playRef = useRef(onPlay);
  playRef.current = onPlay;
  const playerClickRef = useRef(onPlayerClick);
  playerClickRef.current = onPlayerClick;
  const [status, setStatus] = useState<{ state: "loading"; progress: number } | { state: "ready" } | { state: "error"; message: string }>(
    { state: "loading", progress: 0 },
  );
  const [follow, setFollow] = useState(true);
  const followRef = useRef(follow);
  followRef.current = follow;
  const overviewRef = useRef<(() => void) | null>(null);
  const roomViewRef = useRef<((bounds: { x: number; y: number; width: number; height: number }) => void) | null>(null);
  const [roomView, setRoomView] = useState("");
  const rooms = customMap?.rooms ?? getMapTemplate("clario-hq").chatRooms;
  // Your look while you edit it here: your 3D avatar shows it before it is saved.
  const [draftLook, setDraftLook] = useState<AvatarLook | null>(null);
  const draftRef = useRef(draftLook);
  draftRef.current = draftLook;
  const [savingLook, setSavingLook] = useState(false);
  const [lookError, setLookError] = useState<string | null>(null);

  const openLook = () => {
    setLookError(null);
    setDraftLook((selfId ? looksRef?.current?.[selfId] : undefined) ?? readSavedLook() ?? originalLook("adam"));
  };
  const saveDraftLook = async () => {
    if (!draftLook || !onUpdateLook) return;
    setSavingLook(true);
    setLookError(null);
    try {
      await onUpdateLook(draftLook);
      setDraftLook(null);
    } catch {
      setLookError("Couldn't save your look. Try again.");
    } finally {
      setSavingLook(false);
    }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Escape closes the look panel first, then the 3D view.
      if (draftRef.current) setDraftLook(null);
      else onClose?.();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let disposed = false;
    let contextLost = false;
    let frame = 0;

    // alpha: the Lounge TV's video shows through a see-through patch on its screen (tv-screen-3d.ts);
    // everywhere else the scene's background colour keeps the canvas solid.
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    } catch {
      setStatus({ state: "error", message: "WebGL could not start. Enable hardware acceleration in your browser, or return to the 2D map." });
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.92;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.setAttribute("aria-label", "3D view of the office");
    renderer.domElement.setAttribute("role", "img");
    const onContextLost = (event: Event) => {
      event.preventDefault();
      contextLost = true;
      cancelAnimationFrame(frame);
      if (!disposed) setStatus({ state: "error", message: "Your browser paused the 3D graphics. Reopen the 3D view to continue." });
    };
    renderer.domElement.addEventListener("webglcontextlost", onContextLost);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#cfe4f2");
    scene.fog = new THREE.Fog("#cfe4f2", 70, 150);

    // The map's size in tiles, and how much further back the overview stands for a map bigger than
    // Clario HQ. A custom map sets these when it is built (applyLayout).
    let cols = HQ_COLS;
    let rows = HQ_ROWS;
    let reach = 1;
    // What can be played or watched, and where a bought can lands: Clario HQ's until a custom map
    // is built (applyLayout).
    let spots = PLAY_SPOTS;
    let micros = microSpotsFor(HQ_ITEMS);
    let vending = vendingTray(HQ_ITEMS);
    const center = new THREE.Vector3(HQ_COLS / 2, 0, HQ_ROWS / 2);
    const camera = new THREE.PerspectiveCamera(42, mount.clientWidth / Math.max(1, mount.clientHeight), 0.1, 400);
    camera.position.set(center.x, 34, center.z + 38);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(center);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = 1.32;
    controls.minDistance = 5;
    controls.maxDistance = 80;
    controls.screenSpacePanning = false;
    // Turning and zooming keep the camera on you (it orbits around you); only moving the camera
    // away with a right-drag stops it following. Walking somewhere turns following back on.
    const marker = new THREE.Mesh(
      new THREE.RingGeometry(0.24, 0.265, 40),
      new THREE.MeshBasicMaterial({ color: "#a6edcd", transparent: true, opacity: 0.5, depthWrite: false }),
    );
    marker.rotation.x = -Math.PI / 2;
    marker.position.y = 0.04;
    marker.visible = false;
    scene.add(marker);
    let markerTile: Position | null = null;

    // Errand pin: a blue marker floating over the room to run to, with a faint beam to the floor
    // so it shows over walls.
    const errandPin = new THREE.Group();
    const pinMaterial = new THREE.MeshStandardMaterial({ color: "#3686ff", emissive: "#3686ff", emissiveIntensity: 0.45, roughness: 0.4 });
    const pinHead = new THREE.Mesh(new THREE.SphereGeometry(0.32, 20, 14), pinMaterial);
    pinHead.position.y = 0.55;
    const pinTip = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.6, 20), pinMaterial);
    pinTip.rotation.x = Math.PI;
    pinTip.position.y = 0.2;
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 1, 8),
      new THREE.MeshBasicMaterial({ color: "#3686ff", transparent: true, opacity: 0.35, depthWrite: false }),
    );
    errandPin.add(pinHead, pinTip, beam);
    errandPin.visible = false;
    scene.add(errandPin);
    let markerAge = 0;
    const walkTo = (x: number, y: number) => {
      if (!walkToRef.current) return;
      walkToRef.current(x, y);
      setFollow(true);
    };

    // A click (not a drag) on the floor or on furniture walks you to that tile.
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let press: { x: number; y: number } | null = null;
    // Fingers on the screen; a second one means a pinch or turn, never a tap to walk.
    const touching = new Set<number>();
    const onPointerDown = (event: PointerEvent) => {
      touching.add(event.pointerId);
      const panning = event.button === 2 || (event.button === 0 && (event.ctrlKey || event.metaKey || event.shiftKey));
      if (panning && followRef.current) setFollow(false);
      press = event.button === 0 && !panning && touching.size === 1 ? { x: event.clientX, y: event.clientY } : null;
    };
    const onPointerCancel = (event: PointerEvent) => {
      touching.delete(event.pointerId);
      press = null;
    };
    const onPointerUp = (event: PointerEvent) => {
      touching.delete(event.pointerId);
      if (!press || event.button !== 0) return;
      const dragged = Math.hypot(event.clientX - press.x, event.clientY - press.y) > 6;
      press = null;
      if (dragged) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(scene.children, true).find(({ object }) => !(object instanceof THREE.Sprite) && object !== marker);
      if (!hit) return;
      // The notice board opens from anywhere (notice-board-3d.ts).
      if (isNoticeBoard(hit.object)) {
        bridgeRef?.current?.openNoticeBoard?.();
        return;
      }
      // A badge reader badges you in, or out when you are in (badge-reader-3d.ts).
      if (isBadgeReader(hit.object)) {
        const bridge = bridgeRef?.current;
        if (bridge?.badgeLight?.in) bridge.badgeOut?.();
        else bridge?.badgeIn?.("key");
        return;
      }
      let node: THREE.Object3D | null = hit.object;
      while (node && !node.userData.talker) node = node.parent;
      const talker = node?.userData.talker as (typeof talkers)[number] | undefined;
      if (talker) {
        const self = selfRef.current;
        if (self && Math.max(Math.abs(self.x - talker.x), Math.abs(self.y - talker.y)) <= 1) talkRef.current?.(talker.id);
        else walkTo(talker.x, talker.y + 1);
        return;
      }
      // A person: their card.
      node = hit.object;
      while (node && !node.userData.player) node = node.parent;
      if (node && playerClickRef.current) {
        playerClickRef.current(node.userData.player as string);
        return;
      }
      // A game or a TV: use it from next to it, or walk over to it. The margin catches clicks on an
      // arcade machine's front or a screen on the face of its wall.
      const { x: px, z: pz } = hit.point;
      const spot = spots.find((s) => px >= s.x && px <= s.x + s.w && pz >= s.y - 0.1 && pz <= s.y + s.h + 0.1);
      if (spot) {
        const self = selfRef.current;
        if (self && spotInReach([spot], self.x, self.y)) playRef.current?.(spot.action);
        else walkTo(spotFront(spot).x, spotFront(spot).y);
        return;
      }
      const micro = micros.find((s) => px >= s.x && px <= s.x + s.w && pz >= s.y - 0.1 && pz <= s.y + s.h + 0.1);
      if (micro) {
        const bridge = bridgeRef?.current;
        if (bridge?.usePropAt?.(micro.x, micro.y)) return;
        const at = microApproach(micro, selfRef.current, blockedTiles() ?? new Set(), cols, rows);
        if (at) walkTo(at.x, at.y);
        return;
      }
      // A desk walks you to its seat, where you sit facing the laptop (unless someone like Claude
      // always sits there).
      node = hit.object;
      while (node && !node.userData.desk) node = node.parent;
      const desk = node?.userData.desk as DeskSpot | undefined;
      const seat = desk && !blockedTiles()?.has(`${desk.seat.x},${desk.seat.y}`) ? desk.seat : null;
      const x = seat?.x ?? Math.floor(hit.point.x);
      const y = seat?.y ?? Math.floor(hit.point.z);
      if (x < 0 || y < 0 || x >= cols || y >= rows) return;
      markerTile = { x, y };
      markerAge = 0;
      marker.position.set(x + 0.5, 0.04, y + 0.5);
      marker.visible = true;
      walkTo(x, y);
    };
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("pointercancel", onPointerCancel);

    // Arrow keys walk relative to the camera: up is away from you on screen, right is to the
    // screen's right, whichever way the camera has been turned. They stop the 2D map's own
    // arrow handling, which only knows map directions.
    const ARROWS: Record<string, [number, number]> = { ArrowUp: [0, 1], ArrowDown: [0, -1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    const ahead = new THREE.Vector3();
    const side = new THREE.Vector3();
    const onArrow = (event: KeyboardEvent) => {
      if (bridgeRef?.current.mapOverlays?.size) return;
      const arrow = ARROWS[event.key];
      const target = event.target as HTMLElement | null;
      // Typing, and a panel's focused drag handle (its arrows move the panel), keep their arrow keys.
      if (!arrow || target?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "") || target?.closest("[data-drag-handle], [data-look-panel]")) return;
      event.preventDefault();
      event.stopPropagation();
      const self = selfRef.current;
      if (!self) return;
      ahead.set(controls.target.x - camera.position.x, 0, controls.target.z - camera.position.z).normalize();
      side.set(-ahead.z, 0, ahead.x);
      const way = side.multiplyScalar(arrow[0]).addScaledVector(ahead, arrow[1]);
      const [dx, dy] = Math.abs(way.x) >= Math.abs(way.z) ? [Math.sign(way.x), 0] : [0, Math.sign(way.z)];
      marker.visible = false;
      walkTo(self.x + dx, self.y + dy);
    };
    // Capture phase on window, so this runs before the 2D map's listener and can stop it.
    window.addEventListener("keydown", onArrow, true);

    const overview = () => {
      controls.target.copy(center);
      camera.position.set(center.x, 34 * reach, center.z + 38 * reach);
    };
    overviewRef.current = () => {
      setFollow(false);
      setRoomView("");
      overview();
    };
    roomViewRef.current = (bounds) => {
      setFollow(false);
      const x = bounds.x + bounds.width / 2, z = bounds.y + bounds.height / 2;
      // Account for the actual viewport: a wide room needs more distance on a phone.
      const distance = Math.max(9, (bounds.height + 1.5) * 0.9, (bounds.width + 1.5) / camera.aspect * 1.05);
      controls.target.set(x, 0, z);
      camera.position.set(x, distance, z + distance * 0.85);
      controls.update();
    };

    // Soft studio light from every side (for reflections and bounce light), plus the sun for shadows.
    const pmrem = new THREE.PMREMGenerator(renderer);
    const studio = new RoomEnvironment();
    const environment = pmrem.fromScene(studio, 0.04).texture;
    studio.dispose();
    pmrem.dispose();
    scene.environment = environment;
    scene.environmentIntensity = 0.28;
    // The office's own light; world.ts warms it into lamplight after dark.
    const inside = new THREE.HemisphereLight("#ffffff", "#8a7a62", 0.55);
    scene.add(inside);
    const sun = new THREE.DirectionalLight("#fff1dc", 2.7);
    sun.position.set(center.x - 14, 34, center.z + 16);
    sun.target.position.copy(center);
    sun.castShadow = true;
    const shadowSize = mount.clientWidth < 800 ? 2048 : Math.min(4096, renderer.capabilities.maxTextureSize);
    sun.shadow.mapSize.set(shadowSize, shadowSize);
    Object.assign(sun.shadow.camera, { left: -HQ_COLS / 2 - 4, right: HQ_COLS / 2 + 4, top: 30, bottom: -30, near: 1, far: 100 });
    // Softer shadow edges, like light through office windows.
    sun.shadow.radius = 3;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.015;
    scene.add(sun, sun.target);
    // The sky, the sun's place for the time of day, the wind in the grass and trees, and birds.
    const world = makeWorld({ scene, sun, inside });

    // The Lounge TV plays what's on (the TV's remote, components/tv) on its screen.
    const tvScreen = attachTvScreen({ scene, camera, mount, canvas: renderer.domElement, bridgeRef });
    const projectors = attachProjectors(scene);
    const noticeBoard = attachNoticeBoard3d(scene, bridgeRef);
    // Clario HQ's badge reader by its main door, or a built map's own (else the 2D map's extra one).
    const hqReaders = badgeReadersFor(HQ_ITEMS);
    const badgeReaders = attachBadgeReaders3d(scene, bridgeRef, () => (customMapRef.current ? badgeReadersFor(customMapRef.current.items) : hqReaders));

    const resize = new ResizeObserver(() => {
      const { clientWidth, clientHeight } = mount;
      if (!clientWidth || !clientHeight) return;
      renderer.setSize(clientWidth, clientHeight);
      tvScreen.resize(clientWidth, clientHeight);
      camera.aspect = clientWidth / clientHeight;
      camera.updateProjectionMatrix();
    });
    resize.observe(mount);

    const avatars = new Map<string, Avatar>();
    let seats = seatMap();
    const clock = new THREE.Timer();
    clock.connect(document);
    let people: PeopleKit | null = null;
    const coworkers: { person: Person; group: THREE.Group; tile: string }[] = [];
    const talkers: Talker[] = [];
    const moveTalkers = createTalkerMover({ spots: PLAY_SPOTS, walkTo, play: (action) => playRef.current?.(action) });
    // The 2D map's walls and blocked tiles, so Maya and the coworkers walk where you can.
    let walkable: { map: SceneMapInfo; blocked: Set<string> } | null = null;
    const blockedTiles = () => {
      const map = bridgeRef?.current?.map;
      if (!map) return null;
      if (walkable?.map !== map) walkable = { map, blocked: new Set([...map.walls, ...map.blocked]) };
      return walkable.blocked;
    };
    let roomLabels: THREE.Sprite[] = [];
    // Whether a built map is showing (its AI coworkers come from coworkerPlaces, not Clario HQ's).
    let builtMap = false;
    const addTalker = ({ id, x, y, look, name, color }: (typeof TALKERS)[number]) => {
      if (!people) return;
      const person = makePerson(people, id, look.top, { look });
      const group = new THREE.Group();
      group.add(person.root);
      const label = textSprite(name, { color: "#ffffff", background: color });
      label.scale.multiplyScalar(0.36);
      label.position.y = 1.95;
      label.renderOrder = 20;
      group.add(label);
      const talker = makeTalker(id, { x, y }, person, group, label);
      group.userData.talker = talker;
      scene.add(group);
      talkers.push(talker);
    };
    // The AI coworkers stand where the 2D map has them (lib/companions/coworker-places.ts): on a
    // built map they appear once it has placed them, and one sent to another room walks there.
    const syncCoworkers = () => {
      const places = coworkerPlaces.get();
      for (const [id, tile] of Object.entries(places) as [CoworkerId, { x: number; y: number }][]) {
        const talker = talkers.find((each) => each.id === id);
        if (!talker) {
          const known = TALKERS.find((each) => each.id === id);
          if (builtMap && known) addTalker({ ...known, ...tile });
          continue;
        }
        if (talker.home.x === tile.x && talker.home.y === tile.y) continue;
        talker.home = { ...tile };
        talker.plannedFor = null;
      }
    };
    // Clario HQ's two rideable bikes in their rack, cans falling after being thrown away, and the
    // can waiting in the vending machine's tray.
    const rackBikes = new Map<string, THREE.Object3D>();
    // Desks whose laptop opens while someone sits at them, and office chairs that turn in as they
    // do. Both take their resting pose at once when the office is (re)built.
    let desks: (DeskSpot & { open: number })[] = [];
    let chairs: SwivelChair[] = [];
    let furnitureSettled = false;
    const falling: Falling[] = [];
    // The reactions already shown (their ids), so each one rises once.
    const shownReactions = new Set<string>();
    let trayCan: THREE.Group | null = null;
    let shownTray = "";
    // Your coffee at a kitchen machine (bridge.coffeeBrew): the cup on the counter in front of it,
    // a ring above that fills while it brews, and steam rising (slower once it's ready).
    const brew = makeBrewParts();
    scene.add(brew.group);
    let shownBrew = "";

    // The office itself (floors, walls, furniture, room names) has its own group, so a custom map
    // can be swapped for its edited version without starting the 3D view again.
    const office = new THREE.Group();
    scene.add(office);
    let models: ModelSet | null = null;
    let built: string | null | undefined;
    const applyLayout = (map: CustomMap | null) => {
      const key = map ? JSON.stringify(map) : null;
      if (!models || key === built) return;
      built = key;
      clearOffice(office, models);
      roomLabels = (map ? buildCustomOffice(office, models, map) : buildOffice(office, models)).roomLabels;
      rackBikes.clear();
      // On a custom map only the first rack's bikes can be ridden (as on its 2D map), and the
      // first bikes found are that rack's: items are built in order.
      office.traverse((child) => {
        if (child.userData.bike && (!map || !rackBikes.has(child.userData.bike as string))) rackBikes.set(child.userData.bike as string, child);
      });
      spots = map ? playSpotsFor(map.items) : PLAY_SPOTS;
      micros = microSpotsFor(map ? map.items : HQ_ITEMS);
      vending = vendingTray(map ? map.items : HQ_ITEMS);
      desks = [];
      chairs = [];
      office.traverse((child) => {
        if (child.userData.desk) desks.push({ ...(child.userData.desk as DeskSpot), open: 0 });
        if (child.userData.chair) chairs.push(child.userData.chair as SwivelChair);
      });
      furnitureSettled = false;
      seats = map ? customSeats(map) : seatMap();
      cols = map?.cols ?? HQ_COLS;
      rows = map?.rows ?? HQ_ROWS;
      reach = Math.max(1, cols / HQ_COLS, rows / HQ_ROWS);
      center.set(cols / 2, 0, rows / 2);
      // The lawn and the light round the map. Grass grows off a built map's edges, and round
      // Clario HQ's building except on its front path.
      const outside = (x: number, z: number) => x < -0.3 || z < -0.3 || x > cols + 0.3 || z > rows + 0.3;
      const onPath = (x: number, z: number) => x > HQ_PATH.x - 0.2 && x < HQ_PATH.x + HQ_PATH.w + 0.2 && z > HQ_PATH.y - 0.6;
      const inBuilding = (x: number, z: number) => x > 1.6 && x < HQ_COLS - 2.6 && z > 1.6 && z < HQ_PATH.y + 0.4;
      world.furnish(office, cols, rows, map ? outside : (x, z) => !inBuilding(x, z) && !onPath(x, z));
      // Background coworkers sit at Clario HQ's desks and Maya stands in its Focus Room, so only
      // Clario HQ has them; the AI coworkers are on every map, where the 2D map put them.
      for (const { person, group } of [...coworkers.splice(0), ...talkers.splice(0)]) {
        scene.remove(group);
        person.dispose();
      }
      // They start again at their spots, so nobody is still walking with you.
      companions.setOpen(false);
      builtMap = !!map;
      if (!people) return;
      companions.setOpen(true);
      if (map) {
        syncCoworkers();
        return;
      }
      for (const talker of TALKERS) addTalker(talker);
      for (const { id, x, y, talking } of COWORKERS) {
        const seat = seats.get(`${x},${y}`);
        if (!seat) continue;
        const person = makePerson(people, id, colorFor(id), { talking });
        const group = new THREE.Group();
        group.add(person.root);
        group.position.set(x + 0.5, 0, y + 0.5);
        group.rotation.y = FACING[seat];
        scene.add(group);
        coworkers.push({ person, group, tile: `${x},${y}` });
      }
    };
    layoutRef.current = applyLayout;

    // Where a sprite lands on screen: its middle and half its size, in device coordinates (-1 to 1).
    const probe = new THREE.Vector3();
    const onScreen = (sprite: THREE.Sprite) => {
      const view = sprite.getWorldPosition(probe).applyMatrix4(camera.matrixWorldInverse);
      const ahead = view.z < 0;
      const unit = 1 / (Math.max(0.01, -view.z) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
      view.applyMatrix4(camera.projectionMatrix);
      return { x: view.x, y: view.y, w: (sprite.scale.x * unit) / 2 / camera.aspect, h: (sprite.scale.y * unit) / 2, ahead };
    };

    const syncAvatar = (id: string, position: Position, isSelf: boolean) => {
      const name = isSelf ? "You" : (namesRef.current?.[id] ?? id.slice(0, 5));
      const look = (isSelf ? draftRef.current : null) ?? looksRef?.current?.[id] ?? null;
      let avatar = avatars.get(id);
      if (avatar && (avatar.name !== name || avatar.look !== (look ? lookKey(look) : ""))) {
        // Rebuilt in place, so a new look doesn't make them jump or turn.
        const old = avatar;
        removeAvatar(scene, old);
        avatar = makeAvatar(id, name, isSelf, people, look);
        avatar.group.position.copy(old.group.position);
        avatar.target.copy(old.target);
        Object.assign(avatar, {
          route: old.route, heading: old.heading, seated: old.seated, seatHeading: old.seatHeading,
          walk: old.walk, sit: old.sit, phase: old.phase, pace: old.pace, lastTileAt: old.lastTileAt,
        });
        avatars.set(id, avatar);
        scene.add(avatar.group);
      }
      if (!avatar) {
        avatar = makeAvatar(id, name, isSelf, people, look);
        avatar.group.position.set(position.x + 0.5, 0, position.y + 0.5);
        avatar.target.copy(avatar.group.position);
        avatars.set(id, avatar);
        scene.add(avatar.group);
      }
      const seat = seats.get(`${position.x},${position.y}`);
      const next = new THREE.Vector3(position.x + 0.5, 0, position.y + 0.5);
      // Each new tile joins the route; stepAvatar walks them in order and faces the way it goes.
      // Tiles that follow on from each other (not the first after a pause, nor two in one frame)
      // set the pace it goes at.
      if (next.distanceToSquared(avatar.target) > 0.0001) {
        const gap = clock.getElapsed() - avatar.lastTileAt;
        if (gap > 0.04 && gap < 0.6 && next.distanceTo(avatar.target) < 1.5) avatar.pace += (1 / gap - avatar.pace) * 0.35;
        avatar.lastTileAt = clock.getElapsed();
        avatar.route.push(next);
        avatar.target.copy(next);
      }
      avatar.seated = !!seat;
      avatar.seatHeading = seat ? FACING[seat] : null;
    };

    const animate = () => {
      frame = requestAnimationFrame(animate);
      clock.update();
      const dt = Math.min(clock.getDelta(), 0.1);
      const seen = new Set<string>();
      const self = selfRef.current;
      if (selfId && self) {
        syncAvatar(selfId, self, true);
        seen.add(selfId);
      }
      for (const [id, position] of Object.entries(othersRef.current ?? {})) {
        syncAvatar(id, position, false);
        seen.add(id);
      }
      // Who glances at whom: the nearest person going past within a few tiles, or anyone close by.
      const heads = [...avatars.values()].map((avatar) => ({ avatar, at: avatar.group.position.clone().setY(avatar.sit > 0.5 ? 1 : 1.4), moving: avatar.walk > 0.4 }));
      const lookFor = (from: THREE.Vector3, me?: Avatar) => {
        let best: THREE.Vector3 | null = null;
        let nearest = Infinity;
        for (const { avatar, at, moving } of heads) {
          const distance = Math.hypot(at.x - from.x, at.z - from.z);
          if (avatar !== me && distance < (moving ? 4.5 : 2.2) && distance < nearest) {
            best = at;
            nearest = distance;
          }
        }
        return best;
      };
      // The keys of the open laptop at a desk seat, for whoever sits there to type on.
      const keyboardAt = (x: number, y: number): Keyboard | null => {
        const desk = desks.find(({ seat }) => seat.x === x && seat.y === y);
        if (!desk || desk.open < 0.6) return null;
        const laptop = desk.laptop.object;
        return { at: laptop.localToWorld(new THREE.Vector3(0, 0.022, -0.036)), toward: new THREE.Vector3(0, 0, 1).transformDirection(laptop.matrixWorld) };
      };
      // A coworker steps aside (hides) while a real person is on their seat.
      const taken = new Set([self, ...Object.values(othersRef.current ?? {})].filter(Boolean).map((p) => `${p!.x},${p!.y}`));
      for (const coworker of coworkers) {
        coworker.group.visible = !taken.has(coworker.tile);
        if (!coworker.group.visible) continue;
        const [x, y] = coworker.tile.split(",").map(Number) as [number, number];
        coworker.person.update(dt, 0, 1, 0, {}, { look: lookFor(coworker.group.position), typing: keyboardAt(x, y) });
      }
      // Maya and the AI coworkers face the room and turn to you when you come up to them, or walk
      // and play with you when asked.
      syncCoworkers();
      moveTalkers(talkers, {
        dt, time: clock.getElapsed(), self, others: Object.values(othersRef.current ?? {}), blocked: blockedTiles(), cols, rows, seats,
      });
      // Bikes and drinks: everyone's from the 2D map. A bike someone rides isn't in its rack.
      const bridge = bridgeRef?.current;
      const props = bridge?.props ?? {};
      for (const [id, avatar] of avatars) {
        if (!seen.has(id)) {
          removeAvatar(scene, avatar);
          avatars.delete(id);
          continue;
        }
        const { x, z } = avatar.group.position;
        stepAvatar(avatar, dt, clock.getElapsed(), props[id] ?? null, (can) => dropCan(scene, can, falling), {
          look: lookFor(avatar.group.position, avatar),
          typing: avatar.seated && avatar.walk < 0.2 ? keyboardAt(Math.floor(x), Math.floor(z)) : null,
        });
        // Like the 2D map: others are faded out of earshot, and Claude shows over yours always and
        // over theirs while they're near.
        const isSelf = id === selfId;
        const nearby = nearbyRef?.current;
        const heard = isSelf || (nearby?.has(id) ?? true);
        showCues(avatar, {
          inCall: !isSelf && !!nearby?.has(id),
          heard,
          busy: heard && activitiesRef?.current?.[id]?.state === "cooking",
        }, dt, clock.getElapsed(), Math.atan2(camera.position.x - x, camera.position.z - z));
      }
      const reactions = reactionsRef?.current ?? [];
      for (const { id, userId, emoji } of reactions) {
        if (shownReactions.has(id)) continue;
        shownReactions.add(id);
        const avatar = avatars.get(userId);
        if (avatar) addReaction(avatar, emoji);
      }
      if (shownReactions.size > reactions.length) {
        const live = new Set(reactions.map(({ id }) => id));
        for (const id of shownReactions) if (!live.has(id)) shownReactions.delete(id);
      }
      // Desks: the laptop opens while someone sits (or stands) at it, a player who has stopped
      // there, a background coworker or Claude, and its office chair turns in square to the desk;
      // an empty chair sits turned a little aside.
      const settled = new Set(coworkers.filter(({ group }) => group.visible).map(({ tile }) => tile));
      for (const avatar of avatars.values()) {
        if (avatar.walk < 0.3 && !avatar.route.length) settled.add(`${Math.floor(avatar.group.position.x)},${Math.floor(avatar.group.position.z)}`);
      }
      if (!customMapRef.current) for (const { x, y } of HQ_CLAUDE_SEATS) settled.add(`${x},${y}`);
      const ease = furnitureSettled ? 1 - Math.exp(-dt * 4) : 1;
      furnitureSettled = true;
      for (const desk of desks) {
        desk.open += ((settled.has(`${desk.seat.x},${desk.seat.y}`) ? 1 : 0) - desk.open) * ease;
        desk.laptop.setOpen(desk.open);
      }
      for (const { holder, tile, angle } of chairs) {
        const goal = angle + (settled.has(`${tile.x},${tile.y}`) ? 0 : (tile.x + tile.y) % 2 ? 0.45 : -0.45);
        holder.rotation.y += (goal - holder.rotation.y) * ease;
      }
      for (const [bike, parked] of rackBikes) parked.visible = !Object.values(props).some((prop) => prop.kind === "bike" && prop.bike === bike);
      stepFalling(scene, falling, dt);
      // The can you bought, dropping into the vending machine's tray and lying there till you take it.
      const tray = bridge?.vendingTray ?? null;
      const trayKey = tray ? `${tray.drink}:${tray.at}` : "";
      if (trayKey !== shownTray) {
        if (trayCan) {
          scene.remove(trayCan);
          disposeObject(trayCan);
          trayCan = null;
        }
        if (tray && vending) {
          trayCan = makeCan(tray.drink);
          trayCan.rotation.z = Math.PI / 2;
          scene.add(trayCan);
          // You just bought it: turn to the machine and press its button (not when the 3D view
          // opens with a can already waiting).
          const me = selfId ? avatars.get(selfId) : undefined;
          if (me?.person && performance.now() - tray.at < 1000) {
            me.heading = Math.atan2(vending.x - me.group.position.x, vending.z - me.group.position.z);
            me.person.gesture("press");
          }
        }
        shownTray = trayKey;
      }
      if (trayCan && tray && vending) {
        const fall = Math.min(1, (performance.now() - tray.at) / 260);
        trayCan.position.set(vending.x, vending.y + 0.32 * (1 - fall * fall), vending.z);
      }
      const coffee = bridge?.coffeeBrew ?? null;
      const brewKey = coffee ? `${coffee.coffee}:${coffee.at}` : "";
      if (brewKey !== shownBrew) {
        brew.setCup(coffee ? makeCup(coffee.coffee) : null);
        if (coffee) {
          brew.group.position.copy(coffeeCupSpot(coffee.spot));
          // You just ordered: turn to the machine and press its button.
          const me = selfId ? avatars.get(selfId) : undefined;
          if (me?.person && performance.now() - coffee.at < 1000) {
            me.heading = Math.atan2(brew.group.position.x - me.group.position.x, brew.group.position.z - me.group.position.z);
            me.person.gesture("press");
          }
        }
        shownBrew = brewKey;
      }
      brew.update(coffee ? Math.min(1, (performance.now() - coffee.at) / BREW_MS) : 0, clock.getElapsed(), !!coffee);

      const mine = selfId ? avatars.get(selfId) : undefined;
      if (followRef.current && mine) {
        const goal = mine.group.position.clone();
        const shift = goal.sub(controls.target).multiplyScalar(1 - Math.exp(-dt * 4));
        controls.target.add(shift);
        camera.position.add(shift);
      }
      const room = errandTargetRef.current;
      errandPin.visible = !!room;
      if (room) {
        const height = 2.4 + Math.sin(clock.getElapsed() * 3) * 0.15;
        errandPin.position.set(room.x + room.width / 2, height, room.y + room.height / 2);
        errandPin.rotation.y += dt * 1.5;
        // The beam runs from the floor up to the tip.
        beam.scale.y = height;
        beam.position.y = -height / 2;
      }
      // The click marker pulses until you get there, or fades after a few seconds if the
      // tile can't be reached and the path stopped short of it.
      if (marker.visible && markerTile) {
        markerAge += dt;
        const here = self && self.x === markerTile.x && self.y === markerTile.y && mine && mine.walk < 0.2;
        marker.scale.setScalar(1 + Math.sin(markerAge * 8) * 0.12);
        (marker.material as THREE.MeshBasicMaterial).opacity = 0.5 * Math.max(0, 1 - Math.max(0, markerAge - 3));
        if (here || markerAge > 4) marker.visible = false;
      }
      controls.update();
      camera.updateMatrixWorld();
      // A room's name fades while someone's name tag is in front of it, so the two don't print over each other.
      const tags = [...avatars.values(), ...talkers].map(({ label }) => onScreen(label)).filter(({ ahead }) => ahead);
      for (const label of roomLabels) {
        const place = onScreen(label);
        const covered = place.ahead && tags.some((tag) => Math.abs(tag.x - place.x) < tag.w + place.w && Math.abs(tag.y - place.y) < tag.h + place.h);
        const bounds = label.userData.room as { x: number; y: number; width: number; height: number } | undefined;
        const inside = self && bounds && self.x >= bounds.x && self.x < bounds.x + bounds.width && self.y >= bounds.y && self.y < bounds.y + bounds.height;
        label.material.opacity += ((covered ? 0 : inside ? 0.12 : 0.8) - label.material.opacity) * (1 - Math.exp(-dt * 10));
      }
      world.update(dt, camera);
      projectors.update(projectorRef?.current ?? null);
      noticeBoard.update(clock.getElapsed());
      badgeReaders.update();
      renderer.render(scene, camera);
      tvScreen.render(selfRef.current);
    };

    Promise.all([
      loadModels((loaded, total) => {
        if (!disposed) setStatus({ state: "loading", progress: loaded / total });
      }),
      // Without the character models people fall back to the simple shape-built figure.
      loadPeople().catch((error: unknown) => {
        console.warn("3D people did not load; using simple figures", error);
        return null;
      }),
    ])
      .then(([loadedModels, loadedPeople]) => {
        if (disposed || contextLost) return;
        models = loadedModels;
        people = loadedPeople;
        applyLayout(customMapRef.current ?? null);
        setStatus({ state: "ready" });
        // Start close to your avatar, looking into the office, or over the whole map without one.
        const self = selfRef.current;
        if (self) {
          controls.target.set(self.x + 0.5, 0, self.y + 0.5);
          camera.position.set(self.x + 0.5, 13, self.y + 15);
        } else {
          overview();
        }
        animate();
      })
      .catch((error: unknown) => {
        if (!disposed) setStatus({ state: "error", message: error instanceof Error ? error.message : "Could not load the 3D models" });
      });

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      companions.setOpen(false);
      resize.disconnect();
      window.removeEventListener("keydown", onArrow, true);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointercancel", onPointerCancel);
      renderer.domElement.removeEventListener("webglcontextlost", onContextLost);
      controls.dispose();
      clock.dispose();
      tvScreen.dispose();
      projectors.dispose();
      noticeBoard.dispose();
      badgeReaders.dispose();
      world.dispose();
      disposeScene(scene);
      environment.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
      overviewRef.current = null;
      roomViewRef.current = null;
      layoutRef.current = null;
    };
  }, [selfId, selfRef, othersRef, namesRef, looksRef, bridgeRef, nearbyRef, reactionsRef, activitiesRef, projectorRef]);

  // Rebuilds the office when the custom map changes; it skips a map equal to the one shown.
  useEffect(() => {
    layoutRef.current?.(customMap ?? null);
  }, [customMap]);

  return (
    // Over the 2D map but under the space's own controls (the call bar, video tiles, room name and
    // player card, z-30 to z-50), so calls work the same in 3D.
    <section aria-label="3D view" className="absolute inset-0 z-[25] bg-[#cfe4f2]">
      {/* Its own stacking layer: the TV's video layer and the canvas stack inside it (tv-screen-3d.ts),
          so the canvas never covers the toolbar and labels drawn after it. */}
      <div ref={mountRef} className="absolute inset-0 isolate cursor-grab active:cursor-grabbing" />

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-4">
        {/* Clear of the space's left rail, and only on wide screens: the room's name shows top centre. */}
        <div className="pointer-events-auto ml-16 hidden items-center gap-2 rounded-xl bg-[#1b1d2a]/90 px-3 py-2 text-sm font-semibold text-white shadow-lg ring-1 ring-white/10 backdrop-blur-md lg:flex">
          {mapName ?? (customMap ? "Custom office" : "Clario HQ")} <span className="font-medium text-white/55">· 3D view</span>
        </div>
        <div className="pointer-events-auto ml-auto flex items-center gap-1 rounded-xl bg-[#1b1d2a]/90 p-1 shadow-lg ring-1 ring-white/10 backdrop-blur-md">
          {rooms.length > 0 && (
            <select
              aria-label="Explore a room"
              value={follow ? "" : roomView}
              disabled={status.state !== "ready"}
              onChange={(event) => {
                const id = event.target.value;
                setRoomView(id);
                const room = rooms.find((candidate) => candidate.id === id);
                if (room) roomViewRef.current?.(room.bounds);
                else overviewRef.current?.();
              }}
              className="h-9 w-32 cursor-pointer rounded-lg border-0 bg-[#292c3d] px-2 text-xs text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white disabled:opacity-50 sm:w-40"
            >
              <option value="">Explore rooms</option>
              {rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}
            </select>
          )}
          {onUpdateLook && selfId && (
            <ToolbarButton label="Your look" pressed={!!draftLook} onClick={() => (draftLook ? setDraftLook(null) : openLook())}>
              <UserRoundPen size={16} aria-hidden="true" />
              <span className="hidden sm:inline">Your look</span>
            </ToolbarButton>
          )}
          <ToolbarButton label="Follow me" pressed={follow} onClick={() => setFollow((value) => !value)}>
            <Crosshair size={16} aria-hidden="true" />
            <span className="hidden sm:inline">Follow me</span>
          </ToolbarButton>
          <ToolbarButton label="Whole office" onClick={() => overviewRef.current?.()}>
            <MapIcon size={16} aria-hidden="true" />
            <span className="hidden sm:inline">Whole office</span>
          </ToolbarButton>
          {onClose && (
            <ToolbarButton label="Back to the 2D map" onClick={onClose}>
              <X size={16} aria-hidden="true" />
              <span className="hidden sm:inline">Close</span>
            </ToolbarButton>
          )}
        </div>
      </div>

      {draftLook && createPortal(
        <aside
          data-look-panel
          aria-label="Your look"
          // In the page's top layer, above the space's menu and chat button; on phones a sheet
          // along the bottom.
          className="fixed right-4 top-[4.5rem] z-[90] flex max-h-[calc(100dvh-6rem)] w-[min(22rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl bg-white text-[#12151c] shadow-[0_18px_44px_-18px_rgba(18,21,28,0.55)] ring-1 ring-black/5 max-sm:inset-x-2 max-sm:bottom-2 max-sm:top-auto max-sm:max-h-[calc(100dvh-5rem)] max-sm:w-auto"
        >
          <div className="flex items-center justify-between border-b border-[#eceef1] px-4 py-3">
            <div>
              <p className="text-sm font-semibold">Your look</p>
              <p className="text-[11px] leading-4 text-[#8a909b]">Shows on you here as you change it. Saving updates the map too.</p>
            </div>
            <button
              type="button"
              onClick={() => setDraftLook(null)}
              aria-label="Close without saving"
              className="grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-lg text-[#8a909b] transition hover:bg-[#f4f5f7] hover:text-[#12151c] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#12151c]"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
          <div className="overflow-y-auto px-3 pt-3">
            <AvatarPicker look={draftLook} onChange={setDraftLook} view="3d" />
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-[#eceef1] px-4 py-3">
            {lookError && <p role="alert" className="mr-auto text-xs text-[#b42318]">{lookError}</p>}
            <button
              type="button"
              onClick={() => setDraftLook(null)}
              className="h-9 cursor-pointer rounded-lg px-3 text-sm font-semibold text-[#5c6371] transition hover:bg-[#f4f5f7] hover:text-[#12151c] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#12151c]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void saveDraftLook()}
              disabled={savingLook}
              className="flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-[#12151c] px-4 text-sm font-semibold text-white transition hover:bg-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#12151c] active:scale-[0.98] disabled:cursor-wait disabled:opacity-70"
            >
              {savingLook && <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />}
              {savingLook ? "Saving…" : "Save look"}
            </button>
          </div>
        </aside>,
        document.body,
      )}

      <p className="pointer-events-none absolute bottom-20 left-4 hidden rounded-lg bg-[#1b1d2a]/80 px-3 py-2 text-xs text-white/80 backdrop-blur-md md:block">
        Click to walk · Arrow keys walk the way you face the screen · Drag to turn · Scroll to zoom · Right-drag to look around
      </p>

      {status.state !== "ready" && (
        <div className="absolute inset-0 grid place-items-center bg-[#cfe4f2]">
          <div className="w-64 rounded-2xl bg-white/90 p-5 text-center text-[#12151c] shadow-xl" role="status">
            {status.state === "loading" ? (
              <>
                <p className="text-sm font-semibold">Building the 3D office…</p>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#e6e7ea]">
                  <div className="h-full rounded-full bg-[#3a6ee8] transition-[width]" style={{ width: `${Math.round(status.progress * 100)}%` }} />
                </div>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold">The 3D view didn&apos;t load</p>
                <p className="mt-1 text-xs text-[#8a909b]">{status.message}</p>
                <button type="button" onClick={onClose ?? (() => window.location.reload())} className="mt-3 cursor-pointer rounded-xl bg-[#12151c] px-4 py-2 text-sm font-semibold text-white">
                  {onClose ? "Back to the map" : "Try again"}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function ToolbarButton({ label, pressed, onClick, children }: { label: string; pressed?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      className={`flex h-9 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-white ${
        pressed ? "bg-white/[0.16] text-white" : "text-[#c4c8d4] hover:bg-white/10 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}
