"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { Crosshair, Map as MapIcon, X } from "lucide-react";
import { HQ_COLS, HQ_ROWS, type Dir } from "../../lib/maps/clario-hq";
import { buildOffice, disposeScene, loadModels, seatMap, textSprite } from "./office-scene";
import { loadPeople, makePerson, type PeopleKit, type Person } from "./people";

type Position = { x: number; y: number };

const AVATAR_COLORS = ["#3a6ee8", "#d4675a", "#2c8c84", "#d29c33", "#7a5fd0", "#4caf6d"];
const FACING: Record<Dir, number> = { down: 0, right: Math.PI / 2, up: Math.PI, left: -Math.PI / 2 };

// Background coworkers, in the 3D view only: people from the character kit sitting at desks,
// meeting tables, sofas and in the Hack Space so the office feels lived in. They aren't players,
// so they have no name tags, and each gives up its seat while a real person is on that tile.
// Tiles are seats in lib/maps/clario-hq.ts; one that is no longer a seat is skipped.
const COWORKERS: { id: string; x: number; y: number; talking?: boolean }[] = [
  // Open Desks
  { id: "cw-aarav", x: 6, y: 17 }, { id: "cw-lena", x: 9, y: 17 }, { id: "cw-omar", x: 16, y: 17 },
  { id: "cw-priya", x: 6, y: 21 }, { id: "cw-jonas", x: 13, y: 21 },
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
const WALK_SPEED = 5.5; // tiles a second; the 2D map moves one tile every 200 ms
const STRIDE = 4; // walk-cycle radians per tile walked, so feet don't slide

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
  target: THREE.Vector3;
  heading: number;
  seated: boolean;
  // Walk cycle angle, and how far into the walk and sit poses the body is (0 to 1).
  phase: number;
  walk: number;
  sit: number;
  lastMoved: number;
  // So people in a room don't breathe and glance around in step.
  offset: number;
};

function makeAvatar(id: string, name: string, isSelf: boolean, people: PeopleKit | null): Avatar {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const person = people ? makePerson(people, id, colorFor(id)) : null;
  if (person) body.add(person.root);
  const rig = person ? null : buildRig(id, body);

  if (isSelf) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.38, 0.48, 40),
      new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.9 }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    group.add(ring);
  }

  const label = textSprite(name, isSelf
    ? { color: "#12151c", background: "rgba(255,255,255,0.95)" }
    : { color: "#ffffff", background: "rgba(18,21,28,0.85)" });
  label.scale.multiplyScalar(0.36);
  label.position.y = 1.95;
  label.renderOrder = 20;
  group.add(label);

  return {
    group, body, person, rig, label, name,
    target: new THREE.Vector3(), heading: 0, seated: false,
    phase: 0, walk: 0, sit: 0, lastMoved: -1, offset: pick(id, [0, 1.3, 2.6, 3.9, 5.2], 13),
  };
}

// The fallback person, used if the character models fail to load: every limb is a group whose
// origin is its joint, so turning the group bends the limb there. They face +z.
function buildRig(id: string, body: THREE.Group): Rig {
  const rig = new THREE.Group();
  rig.scale.setScalar(RIG_SCALE);
  body.add(rig);

  const material = (color: string, roughness = 0.75) => new THREE.MeshStandardMaterial({ color, roughness });
  const shirt = material(colorFor(id), 0.7);
  const pants = material(pick(id, PANTS, 7), 0.8);
  const skin = material(pick(id, SKIN, 3), 0.8);
  const hair = material(pick(id, HAIR, 11), 0.9);
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

// Walks toward the avatar's tile at a steady pace, turns it to face where it is going, and
// blends its idle, walking and sitting poses.
function stepAvatar(avatar: Avatar, dt: number, time: number) {
  const toTarget = avatar.target.clone().sub(avatar.group.position);
  const distance = toTarget.length();
  if (distance > 4) {
    avatar.group.position.copy(avatar.target);
  } else if (distance > 0.0005) {
    // Catch up a little faster when the 2D map has run ahead.
    const step = Math.min(distance, WALK_SPEED * (distance > 1.5 ? 1.6 : 1) * dt);
    avatar.group.position.addScaledVector(toTarget, step / distance);
    avatar.phase += step * STRIDE;
    avatar.lastMoved = time;
  }
  const blend = (value: number, goal: number, rate: number) => value + (goal - value) * (1 - Math.exp(-dt * rate));
  // A short grace period keeps the stride going between tiles instead of stopping at each one.
  const walking = time - avatar.lastMoved < 0.12;
  avatar.walk = blend(avatar.walk, walking ? 1 : 0, 10);
  avatar.sit = blend(avatar.sit, avatar.seated && !walking ? 1 : 0, 8);

  const turn = Math.atan2(Math.sin(avatar.heading - avatar.body.rotation.y), Math.cos(avatar.heading - avatar.body.rotation.y));
  avatar.body.rotation.y += turn * (1 - Math.exp(-dt * 12));

  if (avatar.person) avatar.person.update(dt, avatar.walk, avatar.sit);
  else if (avatar.rig) poseRig(avatar.rig, avatar, time);
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
}: {
  selfId: string | null;
  selfRef: RefObject<Position>;
  othersRef: RefObject<Record<string, Position>>;
  namesRef: RefObject<Record<string, string>>;
  onClose: () => void;
  // Walks you to a tile along the 2D map's path, as clicking the 2D map does.
  onWalkTo?: (x: number, y: number) => void;
  // The room an errand wants you to reach, marked with a floating pin.
  errandTarget?: { x: number; y: number; width: number; height: number } | null;
}) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const errandTargetRef = useRef(errandTarget);
  errandTargetRef.current = errandTarget;
  // Kept in a ref so a new callback each render doesn't rebuild the scene.
  const walkToRef = useRef(onWalkTo);
  walkToRef.current = onWalkTo;
  const [status, setStatus] = useState<{ state: "loading"; progress: number } | { state: "ready" } | { state: "error"; message: string }>(
    { state: "loading", progress: 0 },
  );
  const [follow, setFollow] = useState(true);
  const followRef = useRef(follow);
  followRef.current = follow;
  const overviewRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let disposed = false;
    let frame = 0;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.92;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.setAttribute("aria-label", "3D view of the office");
    renderer.domElement.setAttribute("role", "img");
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#cfe4f2");
    scene.fog = new THREE.Fog("#cfe4f2", 70, 150);

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
      new THREE.RingGeometry(0.2, 0.3, 32),
      new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.9, depthWrite: false }),
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
      const x = Math.floor(hit.point.x);
      const y = Math.floor(hit.point.z);
      if (x < 0 || y < 0 || x >= HQ_COLS || y >= HQ_ROWS) return;
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
      const arrow = ARROWS[event.key];
      const target = event.target as HTMLElement | null;
      if (!arrow || target?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "")) return;
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

    overviewRef.current = () => {
      setFollow(false);
      controls.target.copy(center);
      camera.position.set(center.x, 34, center.z + 38);
    };

    // Soft studio light from every side (for reflections and bounce light), plus the sun for shadows.
    const pmrem = new THREE.PMREMGenerator(renderer);
    const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    scene.environment = environment;
    scene.environmentIntensity = 0.28;
    scene.add(new THREE.HemisphereLight("#ffffff", "#8a7a62", 0.55));
    const sun = new THREE.DirectionalLight("#fff1dc", 2.7);
    sun.position.set(center.x - 14, 34, center.z + 16);
    sun.target.position.copy(center);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -HQ_COLS / 2 - 4, right: HQ_COLS / 2 + 4, top: 30, bottom: -30, near: 1, far: 100 });
    // Softer shadow edges, like light through office windows.
    sun.shadow.radius = 3;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    scene.add(sun, sun.target);

    const resize = new ResizeObserver(() => {
      const { clientWidth, clientHeight } = mount;
      if (!clientWidth || !clientHeight) return;
      renderer.setSize(clientWidth, clientHeight);
      camera.aspect = clientWidth / clientHeight;
      camera.updateProjectionMatrix();
    });
    resize.observe(mount);

    const avatars = new Map<string, Avatar>();
    const seats = seatMap();
    const clock = new THREE.Clock();
    let people: PeopleKit | null = null;
    const coworkers: { person: Person; group: THREE.Group; tile: string }[] = [];

    const syncAvatar = (id: string, position: Position, isSelf: boolean) => {
      const name = isSelf ? "You" : (namesRef.current?.[id] ?? id.slice(0, 5));
      let avatar = avatars.get(id);
      if (avatar && avatar.name !== name) {
        removeAvatar(scene, avatar);
        avatar = undefined;
      }
      if (!avatar) {
        avatar = makeAvatar(id, name, isSelf, people);
        avatar.group.position.set(position.x + 0.5, 0, position.y + 0.5);
        avatar.target.copy(avatar.group.position);
        avatars.set(id, avatar);
        scene.add(avatar.group);
      }
      const seat = seats.get(`${position.x},${position.y}`);
      const next = new THREE.Vector3(position.x + 0.5, 0, position.y + 0.5);
      const delta = next.clone().sub(avatar.target);
      if (Math.abs(delta.x) + Math.abs(delta.z) > 0.01) avatar.heading = Math.atan2(delta.x, delta.z);
      if (seat) avatar.heading = FACING[seat];
      avatar.target.copy(next);
      avatar.seated = !!seat;
    };

    const animate = () => {
      frame = requestAnimationFrame(animate);
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
      // A coworker steps aside (hides) while a real person is on their seat.
      const taken = new Set([self, ...Object.values(othersRef.current ?? {})].filter(Boolean).map((p) => `${p!.x},${p!.y}`));
      for (const coworker of coworkers) {
        coworker.group.visible = !taken.has(coworker.tile);
        if (coworker.group.visible) coworker.person.update(dt, 0, 1);
      }
      for (const [id, avatar] of avatars) {
        if (!seen.has(id)) {
          removeAvatar(scene, avatar);
          avatars.delete(id);
          continue;
        }
        stepAvatar(avatar, dt, clock.elapsedTime);
      }

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
        const height = 2.4 + Math.sin(clock.elapsedTime * 3) * 0.15;
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
        (marker.material as THREE.MeshBasicMaterial).opacity = 0.9 * Math.max(0, 1 - Math.max(0, markerAge - 3));
        if (here || markerAge > 4) marker.visible = false;
      }
      controls.update();
      renderer.render(scene, camera);
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
      .then(([models, loadedPeople]) => {
        if (disposed) return;
        people = loadedPeople;
        buildOffice(scene, models);
        if (loadedPeople) {
          for (const { id, x, y, talking } of COWORKERS) {
            const seat = seats.get(`${x},${y}`);
            if (!seat) continue;
            const person = makePerson(loadedPeople, id, colorFor(id), { talking });
            const group = new THREE.Group();
            group.add(person.root);
            group.position.set(x + 0.5, 0, y + 0.5);
            group.rotation.y = FACING[seat];
            scene.add(group);
            coworkers.push({ person, group, tile: `${x},${y}` });
          }
        }
        setStatus({ state: "ready" });
        // Start close to your avatar, looking into the office.
        const self = selfRef.current;
        if (self) {
          controls.target.set(self.x + 0.5, 0, self.y + 0.5);
          camera.position.set(self.x + 0.5, 13, self.y + 15);
        }
        animate();
      })
      .catch((error: unknown) => {
        if (!disposed) setStatus({ state: "error", message: error instanceof Error ? error.message : "Could not load the 3D models" });
      });

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      resize.disconnect();
      window.removeEventListener("keydown", onArrow, true);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointercancel", onPointerCancel);
      controls.dispose();
      disposeScene(scene);
      environment.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      overviewRef.current = null;
    };
  }, [selfId, selfRef, othersRef, namesRef]);

  return (
    <section aria-label="3D view" className="absolute inset-0 z-[55] bg-[#cfe4f2]">
      <div ref={mountRef} className="absolute inset-0 cursor-grab active:cursor-grabbing" />

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-4">
        <div className="pointer-events-auto flex items-center gap-2 rounded-xl bg-[#1b1d2a]/90 px-3 py-2 text-sm font-semibold text-white shadow-lg ring-1 ring-white/10 backdrop-blur-md">
          Clario HQ <span className="font-medium text-white/55">· 3D view</span>
        </div>
        <div className="pointer-events-auto flex items-center gap-1 rounded-xl bg-[#1b1d2a]/90 p-1 shadow-lg ring-1 ring-white/10 backdrop-blur-md">
          <ToolbarButton label="Follow me" pressed={follow} onClick={() => setFollow((value) => !value)}>
            <Crosshair size={16} aria-hidden="true" />
            <span className="hidden sm:inline">Follow me</span>
          </ToolbarButton>
          <ToolbarButton label="Whole office" onClick={() => overviewRef.current?.()}>
            <MapIcon size={16} aria-hidden="true" />
            <span className="hidden sm:inline">Whole office</span>
          </ToolbarButton>
          <ToolbarButton label="Back to the 2D map" onClick={onClose}>
            <X size={16} aria-hidden="true" />
            <span className="hidden sm:inline">Close</span>
          </ToolbarButton>
        </div>
      </div>

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
                <button type="button" onClick={onClose} className="mt-3 cursor-pointer rounded-xl bg-[#12151c] px-4 py-2 text-sm font-semibold text-white">
                  Back to the map
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
