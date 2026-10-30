// What the Game Room's 3D stages share (breakout-3d.ts, snake-3d.ts, sumo-3d.ts): the WebGL
// renderer and its canvas, a scene with soft reflections, the camera (and a still copy of it for
// picking), sparks, a short shake, and freeing it all again. Each game builds its room into
// `scene`, frames it, and says how to draw a frame; `stage()` turns that into a GameStage.
// With reduced motion the camera holds still and there are no sparks or shakes.

import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clamp, type GameStage, type GameView } from "./arcade-kit";

export const smooth = (t: number) => t * t * (3 - 2 * t);
// Eases `from` towards `to` at a rate that doesn't depend on the frame rate.
export const approach = (from: number, to: number, rate: number, dt: number) => from + (to - from) * (1 - Math.exp(-rate * dt));

export function paintedTexture(width: number, height: number, paint: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  paint(ctx);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return { texture, ctx };
}

// Frees everything under `root`: geometry, materials and their textures. Shared ones are freed
// once each.
export function disposeTree(root: THREE.Object3D) {
  const done = new Set<unknown>();
  const free = (thing: { dispose(): void }) => {
    if (done.has(thing)) return;
    done.add(thing);
    thing.dispose();
  };
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) free(mesh.geometry);
    const materials = mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : [];
    for (const material of materials) {
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) free(value);
      free(material);
    }
  });
}

export function shadowed<T extends THREE.Object3D>(object: T, cast = true, receive = true): T {
  object.traverse((child) => {
    child.castShadow = cast;
    child.receiveShadow = receive;
  });
  return object;
}

// The office's own swivel chair (Quaternius, CC0, as used in the 3D office): loaded once and
// shared. It faces +Z, stands on the floor at the origin, and its upholstery is the material called
// "Chair". Null if it can't load; the games then use their own simpler chair.
const OFFICE_CHAIR = "/assets/3d/quaternius/OfficeChair.glb";
let officeChair: Promise<THREE.Group | null> | null = null;
export function loadOfficeChair() {
  officeChair ??= new GLTFLoader()
    .loadAsync(OFFICE_CHAIR)
    .then((gltf) => {
      gltf.scene.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;
        for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
          const surface = material as THREE.MeshStandardMaterial;
          if (surface.name === "Grey") Object.assign(surface, { metalness: 0.55, roughness: 0.35 });
          if (surface.name === "Chair") surface.roughness = 0.75;
        }
      });
      return gltf.scene;
    })
    .catch((error: unknown) => {
      console.warn("The office chair model didn't load; using the simple one", error);
      officeChair = null;
      return null;
    });
  return officeChair;
}

// A copy of the office chair `width` wide, centred on the origin with its casters on the floor.
// `fabric` repaints the upholstery (the copy gets its own material); the frame stays shared.
export function officeChairCopy(template: THREE.Object3D, width: number, fabric?: THREE.ColorRepresentation) {
  const model = template.clone(true);
  const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
  model.scale.setScalar(width / (size.x || 1));
  const bounds = new THREE.Box3().setFromObject(model);
  const centre = bounds.getCenter(new THREE.Vector3());
  model.position.set(-centre.x, -bounds.min.y, -centre.z);
  if (fabric !== undefined) {
    model.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      const swap = (material: THREE.Material) => {
        if (material.name !== "Chair") return material;
        const painted = (material as THREE.MeshStandardMaterial).clone();
        painted.color.set(fabric);
        return painted;
      };
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
    });
  }
  const holder = new THREE.Group();
  holder.add(model);
  return holder;
}

// Where the camera stands and looks, its field of view, and where fog starts and ends (metres
// from the camera).
export type Framing = { position: THREE.Vector3; target: THREE.Vector3; fov: number; fog: readonly [number, number] };

type KitOptions = {
  reducedMotion: boolean;
  onLost?: () => void;
  backdrop: string;
  // How much the room's reflections light things up.
  reflections?: number;
  // Sparks' size and how hard they fall, in this stage's units.
  sparkSize: number;
  gravity: number;
};

export function createStageKit({ reducedMotion, onLost, backdrop, reflections = 0.3, sparkSize, gravity }: KitOptions) {
  const motion = !reducedMotion;
  const canvas = document.createElement("canvas");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.96;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const onContextLost = (event: Event) => {
    event.preventDefault();
    onLost?.();
  };
  canvas.addEventListener("webglcontextlost", onContextLost);
  const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(backdrop);
  const fog = new THREE.Fog(backdrop, 10, 30);
  scene.fog = fog;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = environment;
  scene.environmentIntensity = reflections;

  const camera = new THREE.PerspectiveCamera(35, 1.5, 0.05, 80);
  // Picking uses the camera at rest, so a finger keeps pointing at the same spot while the camera
  // drifts. It's never rendered, so its place in the world is updated by hand.
  const pickCamera = new THREE.PerspectiveCamera(35, 1.5, 0.05, 80);
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const picked = new THREE.Vector3();
  const look = new THREE.Vector3();
  let framing: Framing | null = null;
  let pick: { plane: THREE.Plane; toField: (point: THREE.Vector3) => { x: number; y: number } } | null = null;
  // Where the camera drifts to (added to its framing), and a short jolt.
  const follow = new THREE.Vector3();
  let jolt = 0;
  let joltStrength = 0;

  function frame(next: Framing, picking: NonNullable<typeof pick>) {
    framing = next;
    pick = picking;
    [fog.near, fog.far] = next.fog;
    for (const each of [camera, pickCamera]) {
      each.fov = next.fov;
      each.position.copy(next.position);
      each.lookAt(next.target);
      each.updateProjectionMatrix();
      each.updateMatrixWorld();
    }
  }

  // A jolt of the camera, `strength` in this stage's units.
  function kick(strength: number) {
    if (!motion) return;
    jolt = 0.28;
    joltStrength = strength;
  }

  // Sparks: points that fly, fall and fade.
  const SPARKS = 96;
  const sparkPositions = new Float32Array(SPARKS * 3).fill(-1000);
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
  const sparks = new THREE.Points(sparkGeometry, new THREE.PointsMaterial({ size: sparkSize, map: dot.texture, vertexColors: true, transparent: true, depthWrite: false }));
  sparks.frustumCulled = false;
  scene.add(sparks);
  const sparkColor = new THREE.Color();

  // `up` tips the burst upwards (1) or keeps it level (0); `normal` is the way "up" points for a
  // wall (the cork board faces +Z).
  function burst(at: THREE.Vector3, color: THREE.ColorRepresentation, count: number, speed: number, up = 0.6, normal: "y" | "z" = "y") {
    if (!motion) return;
    sparkColor.set(color);
    for (let i = 0; i < count; i++) {
      const index = nextSpark;
      nextSpark = (nextSpark + 1) % SPARKS;
      const angle = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.6);
      const rise = (1 - up + Math.random() * up) * v;
      const a = Math.cos(angle) * v;
      const b = Math.sin(angle) * v;
      sparkPositions.set([at.x, at.y, at.z], index * 3);
      sparkVelocity.set(normal === "y" ? [a, rise, b] : [a, b, rise * 0.6], index * 3);
      sparkColors.set([sparkColor.r, sparkColor.g, sparkColor.b, 1], index * 4);
      sparkMax[index] = sparkLife[index] = 0.25 + Math.random() * 0.3;
    }
  }
  function stepSparks(dt: number) {
    let alive = false;
    for (let i = 0; i < SPARKS; i++) {
      if (sparkLife[i]! <= 0) continue;
      alive = true;
      sparkLife[i] = sparkLife[i]! - dt;
      sparkVelocity[i * 3 + 1] = sparkVelocity[i * 3 + 1]! - gravity * dt;
      for (let axis = 0; axis < 3; axis++) sparkPositions[i * 3 + axis] = sparkPositions[i * 3 + axis]! + sparkVelocity[i * 3 + axis]! * dt;
      sparkColors[i * 4 + 3] = Math.max(0, sparkLife[i]! / sparkMax[i]!);
    }
    if (!alive) return;
    sparkGeometry.attributes.position!.needsUpdate = true;
    sparkGeometry.attributes.color!.needsUpdate = true;
  }

  // The finished stage: `draw` places this frame's pieces, then the kit moves the camera and renders.
  function stage(
    draw: (view: GameView, dt: number, time: number) => void,
    extra: { card?: GameStage["card"]; ready?: Promise<void>; cleanUp?: () => void } = {},
  ): GameStage {
    return {
      canvas,
      card: extra.card,
      ready: extra.ready,
      render(view, dt, time) {
        draw(view, dt, time);
        stepSparks(dt);
        if (!framing) return;
        jolt = Math.max(0, jolt - dt);
        const shake = motion ? (jolt / 0.28) * joltStrength : 0;
        const random = () => (Math.random() * 2 - 1) * shake;
        camera.position.copy(framing.position).add(follow);
        camera.position.x += random();
        camera.position.y += random();
        look.copy(framing.target).add(follow);
        camera.lookAt(look);
        renderer.render(scene, camera);
      },
      pick(clientX, clientY) {
        const rect = canvas.getBoundingClientRect();
        if (!pick || !rect.width || !rect.height) return null;
        pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
        raycaster.setFromCamera(pointer, pickCamera);
        if (!raycaster.ray.intersectPlane(pick.plane, picked)) return null;
        const field = pick.toField(picked);
        return { x: clamp(field.x, -1000, 1000), y: clamp(field.y, -1000, 1000) };
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
        extra.cleanUp?.();
        canvas.removeEventListener("webglcontextlost", onContextLost);
        disposeTree(scene);
        environment.dispose();
        pmrem.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
        canvas.remove();
      },
    };
  }

  return { motion, canvas, renderer, scene, anisotropy, camera, follow, frame, kick, burst, stage };
}

export type StageKit = ReturnType<typeof createStageKit>;
