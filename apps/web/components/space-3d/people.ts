import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import { FACE_POINTS, FACE_SIZE, affineFrom, type AvatarLook } from "@repo/shared";

// People for the 3D view: Quaternius's base characters (CC0) wearing clothes made here, with a
// hairstyle each and the idle, jog and sitting clips from his animation library (CC0).
// Assets and licence: public/assets/3d/quaternius.

const DIR = "/assets/3d/quaternius/";
const SCALE = 0.85; // the furniture is a little under life size, so people are too
// The 2D map moves a tile every 200 ms, far quicker than a walk, so moving people jog, sped up.
const JOG_SPEED = 1.5;
// The sitting clip puts the hips 0.245 m behind the feet; moving seated people forward by that
// (at this scale) puts the hips over the middle of the seat instead of in the backrest.
const SIT_FORWARD = 0.21;

type BodyKind = "male" | "female";
const BODIES: Record<BodyKind, { file: string; mesh: string; skins: [string, string]; hair: string[]; beard?: string }> = {
  male: { file: "Superhero_Male", mesh: "SuperHero_Male", skins: ["T_Male_Light.jpg", "T_Male_Dark.jpg"], hair: ["Hair_SimpleParted", "Hair_Buzzed"], beard: "Hair_Beard" },
  female: { file: "Superhero_Female", mesh: "Superhero_Female", skins: ["T_Female_Light.jpg", "T_Female_Dark.jpg"], hair: ["Hair_Long", "Hair_Buns"] },
};

// A player's avatar look (the same one as the 2D map) picked as a body and hairstyle. Each
// hairstyle model fits one body, so long hair and buns mean the female body and a beard the male.
function bodyFor(look: AvatarLook): BodyKind {
  if (look.beard) return "male";
  return look.base === "amelia" || look.hairShape === "bun" ? "female" : "male";
}
function hairFor(look: AvatarLook, kind: BodyKind): string | null {
  if (look.hairShape === "bald") return null;
  if (kind === "female") return look.hairShape === "bun" ? "Hair_Buns" : "Hair_Long";
  return look.base === "bob" && look.hairShape !== "curly" ? "Hair_Buzzed" : "Hair_SimpleParted";
}
// Curls are the parted hair made fuller.
const CURLY_SCALE = 1.15;
const CLIPS = {
  idle: "Idle_Loop", move: "Jog_Fwd_Loop", sit: "Sitting_Idle_Loop", talk: "Sitting_Talking_Loop",
  // Riding a bike takes its arms and back from the driving clip; holding a drink, the torch arm.
  drive: "Driving_Loop", torch: "Idle_Torch_Loop",
  // Played once: pressing the vending machine's button, and taking the can from its tray.
  press: "Interact", pickup: "PickUp_Table",
} as const;
export type Gesture = "press" | "pickup";
// Gestures are played this much faster than recorded (the button press is slow).
const GESTURE_SPEED: Record<Gesture, number> = { press: 1.6, pickup: 1.1 };
// Riding: the arms from the driving clip, the hips and back standing (the driving clip twists the
// back toward its steering wheel), and each leg swinging between standing straight and sitting
// bent as the pedals go round. Reaching (in update) then puts the hands and feet on the bike.
const RIDE_ARMS = /^(upperarm|lowerarm|hand|thumb|index|middle|ring|pinky)/;
const RIDE_BACK = /^(pelvis|spine|neck|Head|clavicle)/;
const LEGS = [/^(thigh|calf|foot|ball|ball_leaf)_l\./, /^(thigh|calf|foot|ball|ball_leaf)_r\./] as const;
// How far toward the sitting pose a leg bends with its pedal at the bottom and at the top, so
// the feet stay up on the pedals.
const PEDAL_LOW = 0.4;
const PEDAL_HIGH = 0.95;
// A rider leans forward over the handlebars (radians), sitting up this much of it when stopped,
// looks up the road again with this much of it, and their hips rock this much as each leg pushes down.
const RIDE_LEAN = 0.6;
const SIT_UP = 0.5;
const LOOK_AHEAD = 0.8;
const HIP_ROCK = 0.05;
// The ball of the foot is this high over what it stands on, and the wrist this far behind and above
// the middle of the grip (metres, before SCALE), the knuckles curled this far down over it (radians).
const BALL_HEIGHT = 0.035;
const WRIST_BEHIND = 0.07;
const WRIST_ABOVE = 0.02;
const KNUCKLES_DOWN = 0.6;
// A drink is held in the left hand, as the torch clip holds its torch.
const LEFT_ARM = /^(clavicle_l|upperarm_l|lowerarm_l|hand_l|(thumb|index|middle|ring|pinky)_0\d(_leaf)?_l)\./;

const HAIR_COLORS = ["#2b1d16", "#4a3022", "#14100e", "#7a5232", "#b58a4c", "#3a3a40"];
const PANTS = ["#2f3a56", "#3b3f4a", "#46536b", "#2d4a6b", "#5b4a3a", "#c9b79a"];

// Clothes are copies of the body's own skin over the bones they cover, smoothed so muscles
// don't show through and pushed out a little. They share the body's skeleton, so they bend
// with it. Each piece ends where its bones stop mattering (a skin weight of one half), so
// the shirt meets the trousers at the waist and the sleeves end at the elbow or the wrist.
const OUTFIT = {
  shirt: { bones: ["spine_01", "spine_02", "spine_03", "clavicle_l", "clavicle_r", "upperarm_l", "upperarm_r"], push: 0.012 },
  sleeves: { bones: ["lowerarm_l", "lowerarm_r"], push: 0.01 },
  trousers: { bones: ["pelvis", "thigh_l", "thigh_r", "calf_l", "calf_r"], push: 0.014 },
  shoes: { bones: ["foot_l", "foot_r", "ball_l", "ball_r", "ball_leaf_l", "ball_leaf_r"], push: 0.016 },
} as const;
const SMOOTHING = 20;
// The free characters have superhero builds, and the library's idle stands wide on them; these
// bring legs and arms in a little (radians, toward the body's middle) while standing or sitting.
const TUCK = { thigh_l: -0.07, thigh_r: 0.07, upperarm_l: -0.12, upperarm_r: 0.12 } as const;
const FORWARD = new THREE.Vector3(0, 0, 1);
type Garment = keyof typeof OUTFIT;

type HeadPiece = { mesh: THREE.Mesh; offset: THREE.Matrix4 };
// An arm or a leg for reaching: shoulder or hip, elbow or knee, wrist or ankle.
type Limb = { upper: THREE.Object3D; lower: THREE.Object3D; end: THREE.Object3D };
type BodyKit = {
  template: THREE.Object3D;
  clothes: Record<Garment, THREE.BufferGeometry>;
  // Each hairstyle (and the beard) sits on the Head bone at this offset (found in the rest pose).
  hair: (HeadPiece & { name: string })[];
  beard: HeadPiece | null;
  // Glasses sit on the Head bone here, in front of the eyes, sized to their width.
  eyes: { offset: THREE.Matrix4; width: number } | null;
  skins: THREE.Texture[];
  // Each skin texture's average colour (linear), so a tint can turn it into a chosen skin tone.
  skinAverages: THREE.Color[];
  clips: Record<keyof typeof CLIPS, THREE.AnimationClip>;
  // Playing a game standing up: the talking clip's busy arms and hands, and the idle's legs and back.
  playing: { arms: THREE.AnimationClip; body: THREE.AnimationClip };
  // On a bike (RIDE_ARMS, RIDE_BACK, LEGS) and holding a drink (an additive left arm).
  riding: { upper: THREE.AnimationClip; hips: THREE.AnimationClip; bent: THREE.AnimationClip[]; straight: THREE.AnimationClip[] };
  holding: THREE.AnimationClip;
  // The hips' height when standing, before SCALE.
  hipHeight: number;
};

// The bones the playing pose takes from the talking clip.
const PLAY_ARMS = /^(clavicle|upperarm|lowerarm|hand|thumb|index|middle|ring|pinky|neck|Head)/;

// The average colour of a texture's image, read from a small copy of it.
function averageColor(texture: THREE.Texture): THREE.Color {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 16;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const color = new THREE.Color(1, 1, 1);
  if (!ctx || !texture.image) return color;
  ctx.drawImage(texture.image as CanvasImageSource, 0, 0, 16, 16);
  const data = ctx.getImageData(0, 0, 16, 16).data;
  let r = 0, g = 0, b = 0;
  for (let i = 0; i < data.length; i += 4) {
    r += data[i]!;
    g += data[i + 1]!;
    b += data[i + 2]!;
  }
  const n = data.length / 4;
  return color.setRGB(r / n / 255, g / n / 255, b / n / 255, THREE.SRGBColorSpace);
}
export type PeopleKit = Record<BodyKind, BodyKit>;

// Riding a bike and holding a drink, each 0 to 1 so they blend in and out. `pedal` is the cranks'
// angle (radians); `drink` raises the drink to the mouth. A rider's hands hold `grips` and the balls
// of their feet press on `feet` (world space, left then right): the pedals, or the floor for a
// foot put down. `upright` (0 to 1) sits a stopped rider up from leaning over the handlebars.
export type Gear = {
  ride?: number;
  pedal?: number;
  hold?: number;
  drink?: number;
  grips?: readonly [THREE.Vector3, THREE.Vector3];
  upright?: number;
  feet?: readonly [Foothold, Foothold];
};
// Where the ball of a foot rests, with the foot tipped `pitch` toes down (radians).
export type Foothold = { at: THREE.Vector3; pitch: number };

export type Person = {
  root: THREE.Object3D;
  // walk, sit and play run from 0 to 1 and blend the clips; play shows while standing.
  update: (dt: number, walk: number, sit: number, play?: number, gear?: Gear) => void;
  // Puts something in their left hand (a drinks can, its middle at its origin), or empties it.
  hold: (object: THREE.Object3D | null) => void;
  // Plays a gesture once, over whatever else they are doing.
  gesture: (kind: Gesture) => void;
  // How high their hips are standing up, for sitting them on a bike.
  hipHeight: number;
  dispose: () => void;
};

function pick<T>(id: string, list: readonly T[], salt: number) {
  let hash = salt;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return list[Math.abs(hash) % list.length]!;
}

function garment(body: THREE.SkinnedMesh, names: readonly string[], push: number) {
  const bones = new Set(names.map((name) => body.skeleton.bones.findIndex((bone) => bone.name === name)));
  const source = body.geometry;
  const skinIndex = source.getAttribute("skinIndex");
  const skinWeight = source.getAttribute("skinWeight");
  // How much of each vertex these bones move; the material cuts the cloth off below 0.5.
  const coverage = new Float32Array(source.getAttribute("position").count);
  for (let v = 0; v < coverage.length; v++) {
    for (let k = 0; k < 4; k++) if (bones.has(skinIndex.getComponent(v, k))) coverage[v]! += skinWeight.getComponent(v, k);
  }
  const index = source.getIndex()!;
  const kept: number[] = [];
  for (let i = 0; i < index.count; i += 3) {
    const corners = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
    if (corners.some((vertex) => coverage[vertex]! >= 0.5)) kept.push(...corners);
  }
  const geometry = source.clone();
  geometry.setIndex(kept);
  const colors = new Float32Array(coverage.length * 4).fill(1);
  coverage.forEach((value, v) => { colors[v * 4 + 3] = value; });
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 4));

  // Copies of one point (at texture seams) are welded so they move together.
  const position = geometry.getAttribute("position");
  const pointOf = new Int32Array(position.count);
  const points: THREE.Vector3[] = [];
  const keys = new Map<string, number>();
  for (let v = 0; v < position.count; v++) {
    const key = `${position.getX(v).toFixed(4)},${position.getY(v).toFixed(4)},${position.getZ(v).toFixed(4)}`;
    let point = keys.get(key);
    if (point === undefined) {
      point = points.push(new THREE.Vector3(position.getX(v), position.getY(v), position.getZ(v))) - 1;
      keys.set(key, point);
    }
    pointOf[v] = point;
  }
  const neighbours = points.map(() => new Set<number>());
  for (let i = 0; i < kept.length; i += 3) {
    const [a, b, c] = [pointOf[kept[i]!]!, pointOf[kept[i + 1]!]!, pointOf[kept[i + 2]!]!];
    neighbours[a]!.add(b).add(c);
    neighbours[b]!.add(a).add(c);
    neighbours[c]!.add(a).add(b);
  }
  // Taubin smoothing: a step in, then a slightly larger step out, so the cloth doesn't shrink.
  const average = new THREE.Vector3();
  const relax = (factor: number) => {
    const moved = points.map((point, i) => {
      if (!neighbours[i]!.size) return point;
      average.set(0, 0, 0);
      for (const n of neighbours[i]!) average.add(points[n]!);
      average.divideScalar(neighbours[i]!.size);
      return point.clone().lerp(average, factor);
    });
    points.splice(0, points.length, ...moved);
  };
  for (let round = 0; round < SMOOTHING; round++) { relax(0.5); relax(-0.53); }
  for (let v = 0; v < position.count; v++) position.setXYZ(v, points[pointOf[v]!]!.x, points[pointOf[v]!]!.y, points[pointOf[v]!]!.z);

  // Smooth normals across welded copies, then push the cloth out along them.
  geometry.computeVertexNormals();
  const normal = geometry.getAttribute("normal");
  const summed = points.map(() => new THREE.Vector3());
  for (let v = 0; v < normal.count; v++) summed[pointOf[v]!]!.add(new THREE.Vector3(normal.getX(v), normal.getY(v), normal.getZ(v)));
  for (let v = 0; v < normal.count; v++) {
    const n = summed[pointOf[v]!]!.clone().normalize();
    normal.setXYZ(v, n.x, n.y, n.z);
    position.setXYZ(v, position.getX(v) + n.x * push, position.getY(v) + n.y * push, position.getZ(v) + n.z * push);
  }
  return geometry;
}

// The clips were cut from the library's mannequin. Bone turns carry over as they are; the
// pelvis position is rescaled to this body's hip height so feet stay on the floor.
function fitClip(json: THREE.AnimationClipJSON, pelvis: THREE.Vector3, rest: number[]) {
  const clip = THREE.AnimationClip.parse(json);
  const scale = pelvis.z / rest[2]!;
  for (const track of clip.tracks) {
    if (track.name !== "pelvis.position") continue;
    for (let i = 0; i < track.values.length; i += 3) {
      track.values[i] = pelvis.x + (track.values[i]! - rest[0]!) * scale;
      track.values[i + 1] = pelvis.y + (track.values[i + 1]! - rest[1]!) * scale;
      track.values[i + 2] = pelvis.z + (track.values[i + 2]! - rest[2]!) * scale;
    }
  }
  return clip;
}

export async function loadPeople(): Promise<PeopleKit> {
  const loader = new GLTFLoader();
  const textures = new THREE.TextureLoader();
  const loadTexture = async (file: string) => {
    const texture = await textures.loadAsync(DIR + file);
    texture.flipY = false;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  };
  const animations = fetch(DIR + "animations.json").then((response) => {
    if (!response.ok) throw new Error(`animations.json: ${response.status}`);
    return response.json() as Promise<{ pelvisRest: number[]; clips: THREE.AnimationClipJSON[] }>;
  });

  const build = async (kind: BodyKind): Promise<BodyKit> => {
    const spec = BODIES[kind];
    const [gltf, hairs, beardGltf, darkSkin, library] = await Promise.all([
      loader.loadAsync(`${DIR}${spec.file}.gltf`),
      Promise.all(spec.hair.map((file) => loader.loadAsync(`${DIR}${file}.gltf`))),
      // A missing beard only means no beards, so it doesn't fail the people.
      spec.beard ? loader.loadAsync(`${DIR}${spec.beard}.gltf`).catch(() => null) : Promise.resolve(null),
      loadTexture(spec.skins[1]),
      animations,
    ]);
    const template = gltf.scene;
    template.updateMatrixWorld(true);
    const body = template.getObjectByName(spec.mesh) as THREE.SkinnedMesh;
    const head = template.getObjectByName("Head")!;
    const pelvis = template.getObjectByName("pelvis")!.position.clone();
    const lightSkin = (body.material as THREE.MeshStandardMaterial).map!;

    const onHead = (scene: THREE.Object3D): HeadPiece => {
      scene.updateMatrixWorld(true);
      let mesh: THREE.Mesh | undefined;
      scene.traverse((child) => { if (!mesh && (child as THREE.Mesh).isMesh) mesh = child as THREE.Mesh; });
      const offset = head.matrixWorld.clone().invert().multiply(mesh!.matrixWorld);
      return { mesh: mesh!, offset };
    };
    const hair = hairs.map((hairGltf, index) => ({ ...onHead(hairGltf.scene), name: spec.hair[index]! }));
    const beard = beardGltf ? onHead(beardGltf.scene) : null;

    // Glasses go just in front of the eyes, which face +z in the rest pose.
    const eyeMesh = template.getObjectByName("Eyes");
    let eyes: BodyKit["eyes"] = null;
    if (eyeMesh) {
      const box = new THREE.Box3().setFromObject(eyeMesh);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      center.z = box.max.z + size.x * 0.06;
      const offset = head.matrixWorld.clone().invert().multiply(new THREE.Matrix4().makeTranslation(center.x, center.y, center.z));
      eyes = { offset, width: size.x };
    }

    const clips = Object.fromEntries(Object.entries(CLIPS).map(([key, name]) => {
      const json = library.clips.find((clip) => clip.name === name);
      if (!json) throw new Error(`missing clip ${name}`);
      return [key, fitClip(json, pelvis, library.pelvisRest)];
    })) as BodyKit["clips"];

    const clothes = Object.fromEntries(
      (Object.keys(OUTFIT) as Garment[]).map((part) => [part, garment(body, OUTFIT[part].bones, OUTFIT[part].push)]),
    ) as BodyKit["clothes"];

    const part = (clip: THREE.AnimationClip, arms: boolean) =>
      new THREE.AnimationClip(`${clip.name}_${arms ? "arms" : "body"}`, clip.duration, clip.tracks.filter((track) => PLAY_ARMS.test(track.name) === arms));
    const playing = { arms: part(clips.talk, true), body: part(clips.idle, false) };

    const only = (clip: THREE.AnimationClip, bones: RegExp, name: string) =>
      new THREE.AnimationClip(name, clip.duration, clip.tracks.filter((track) => bones.test(track.name)));
    const riding = {
      upper: only(clips.drive, RIDE_ARMS, "ride_arms"),
      hips: only(clips.idle, RIDE_BACK, "ride_back"),
      bent: LEGS.map((leg, i) => only(clips.sit, leg, `pedal_bent_${i}`)),
      straight: LEGS.map((leg, i) => only(clips.idle, leg, `pedal_straight_${i}`)),
    };
    // Added on top of whatever else the body does, so a drink stays in hand while walking or sitting.
    const holding = THREE.AnimationUtils.makeClipAdditive(only(clips.torch, LEFT_ARM, "hold_drink"), 0, only(clips.idle, LEFT_ARM, "hold_rest"));

    const skins = [lightSkin, darkSkin];
    return {
      template, clothes, hair, beard, eyes, skins, skinAverages: skins.map(averageColor), clips, playing, riding, holding,
      hipHeight: template.getObjectByName("pelvis")!.getWorldPosition(new THREE.Vector3()).y,
    };
  };

  const [male, female] = await Promise.all([build("male"), build("female")]);
  return { male, female };
}

// Glasses built from shapes, sized to the eyes: two round rims, a bridge, and arms back to the ears.
function makeGlasses(eyes: NonNullable<BodyKit["eyes"]>, owned: { dispose: () => void }[]) {
  const glasses = new THREE.Group();
  const frame = new THREE.MeshStandardMaterial({ color: "#1d1f26", roughness: 0.35, metalness: 0.3 });
  owned.push(frame);
  const w = eyes.width;
  const rim = w * 0.2;
  const add = (geometry: THREE.BufferGeometry, x: number, y: number, z: number) => {
    owned.push(geometry);
    const part = new THREE.Mesh(geometry, frame);
    part.position.set(x, y, z);
    part.castShadow = false;
    glasses.add(part);
    return part;
  };
  for (const side of [-1, 1]) {
    add(new THREE.TorusGeometry(rim, rim * 0.14, 8, 28), side * w * 0.27, 0, 0);
    add(new THREE.BoxGeometry(rim * 0.12, rim * 0.12, w * 0.9), side * (w * 0.27 + rim), 0, -w * 0.45);
  }
  add(new THREE.BoxGeometry(w * 0.54 - rim * 2, rim * 0.14, rim * 0.14), 0, rim * 0.25, 0);
  eyes.offset.decompose(glasses.position, glasses.quaternion, glasses.scale);
  return glasses;
}

// Where each body's skin texture (1024 square) has the eyes and the middle of the mouth: a
// photo face is lined up on these.
type FaceSpots = Record<keyof typeof FACE_POINTS, { x: number; y: number }>;
const FACE_SPOTS: Record<BodyKind, FaceSpots> = {
  male: { leftEye: { x: 140, y: 182 }, rightEye: { x: 241, y: 182 }, mouth: { x: 190, y: 272 } },
  female: { leftEye: { x: 132, y: 182 }, rightEye: { x: 243, y: 182 }, mouth: { x: 187, y: 270 } },
};

// A copy of the skin texture, tinted to the skin colour, with the photo face (AvatarLook.face)
// blended onto its face, fading out at the edge into the skin. The face paints in once its
// picture has decoded.
function paintFace(base: THREE.Texture, tint: THREE.Color, face: string, spots: FaceSpots, owned: { dispose: () => void }[]) {
  const image = base.image as HTMLImageElement;
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(image, 0, 0);
  // The tint (up to 2x) baked in, so the photo keeps its own colours.
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = pixels.data;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.min(255, data[i]! * tint.r);
    data[i + 1] = Math.min(255, data[i + 1]! * tint.g);
    data[i + 2] = Math.min(255, data[i + 2]! * tint.b);
  }
  ctx.putImageData(pixels, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.flipY = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  owned.push(texture);

  const photo = new Image();
  photo.onload = () => {
    // The face in an oval, soft at the edge.
    const oval = document.createElement("canvas");
    oval.width = oval.height = FACE_SIZE;
    const octx = oval.getContext("2d")!;
    octx.drawImage(photo, 0, 0, FACE_SIZE, FACE_SIZE);
    octx.globalCompositeOperation = "destination-in";
    octx.translate(FACE_SIZE / 2, FACE_SIZE * 0.58);
    octx.scale(1, 1.25);
    const fade = octx.createRadialGradient(0, 0, 0, 0, 0, FACE_SIZE * 0.4);
    fade.addColorStop(0.7, "rgba(0,0,0,1)");
    fade.addColorStop(1, "rgba(0,0,0,0)");
    octx.fillStyle = fade;
    octx.fillRect(-FACE_SIZE, -FACE_SIZE, FACE_SIZE * 2, FACE_SIZE * 2);

    const scale = canvas.width / 1024;
    const at = (point: { x: number; y: number }) => ({ x: point.x * scale, y: point.y * scale });
    const transform = affineFrom(
      [FACE_POINTS.leftEye, FACE_POINTS.rightEye, FACE_POINTS.mouth],
      [at(spots.leftEye), at(spots.rightEye), at(spots.mouth)],
    );
    if (!transform) return;
    ctx.setTransform(...transform);
    ctx.drawImage(oval, 0, 0);
    texture.needsUpdate = true;
  };
  photo.src = face;
  return texture;
}

// `talking` makes a seated person chat with their hands instead of sitting still. With a `look`
// (a player's avatar look) the body, hair, skin, shirt, glasses and beard follow it; without one
// they're picked from the id, so a coworker always looks the same.
export function makePerson(
  kit: PeopleKit,
  id: string,
  shirtColor: string,
  { talking = false, look = null }: { talking?: boolean; look?: AvatarLook | null } = {},
): Person {
  const kind = look ? bodyFor(look) : pick(id, ["male", "female"] as const, 17);
  const spec = BODIES[kind];
  const body = kit[kind];
  const root = new THREE.Group();
  const model = cloneSkinned(body.template);
  model.scale.setScalar(SCALE);
  root.add(model);

  // Everything made for this person alone, so it can be freed when they leave.
  const owned: { dispose: () => void }[] = [];
  // The cloth's vertex alpha is how much its bones move it; below a half it is cut away.
  const cloth = (color: string, roughness = 0.85) => {
    const made = new THREE.MeshStandardMaterial({ color, roughness, vertexColors: true, alphaTest: 0.5 });
    owned.push(made);
    return made;
  };
  const hairTint = new THREE.Color(look?.hair ?? pick(id, HAIR_COLORS, 23));

  const mesh = model.getObjectByName(spec.mesh) as THREE.SkinnedMesh;
  const skin = (mesh.material as THREE.MeshStandardMaterial).clone();
  if (look) {
    // The texture nearer the skin tone in brightness, tinted the rest of the way to it.
    const target = new THREE.Color(look.skin);
    const brightness = (color: THREE.Color) => Math.max(0.005, 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b);
    const gap = (average: THREE.Color) => Math.abs(Math.log(brightness(target) / brightness(average)));
    const index = gap(body.skinAverages[1]!) < gap(body.skinAverages[0]!) ? 1 : 0;
    const average = body.skinAverages[index]!;
    skin.map = body.skins[index]!;
    skin.color.setRGB(
      Math.min(2, target.r / Math.max(0.01, average.r)),
      Math.min(2, target.g / Math.max(0.01, average.g)),
      Math.min(2, target.b / Math.max(0.01, average.b)),
    );
  } else {
    skin.map = pick(id, body.skins, 29);
  }
  owned.push(skin);
  mesh.material = skin;
  if (look?.face && skin.map) {
    skin.map = paintFace(skin.map, skin.color, look.face, FACE_SPOTS[kind], owned);
    skin.color.setRGB(1, 1, 1);
  }
  const brows = model.getObjectByName("Eyebrows") as THREE.SkinnedMesh | undefined;
  // A photo face brings its own eyebrows.
  if (brows && look?.face) brows.visible = false;
  else if (brows) {
    const browMaterial = (brows.material as THREE.MeshStandardMaterial).clone();
    browMaterial.color.copy(hairTint);
    owned.push(browMaterial);
    brows.material = browMaterial;
  }

  const longSleeves = pick(id, [false, true], 31);
  const outfit: [Garment, THREE.Material][] = [
    ["shirt", cloth(look?.top ?? shirtColor, 0.8)],
    ["trousers", cloth(pick(id, PANTS, 37))],
    ["shoes", cloth("#24262d", 0.5)],
  ];
  if (longSleeves) outfit.push(["sleeves", outfit[0]![1]]);
  for (const [part, cloth] of outfit) {
    const piece = new THREE.SkinnedMesh(body.clothes[part], cloth);
    piece.bind(mesh.skeleton, mesh.bindMatrix);
    mesh.parent!.add(piece);
  }

  const head = model.getObjectByName("Head")!;
  // Hair and a beard: a model on the head, in the hair colour.
  const wear = (piece: HeadPiece) => {
    const worn = piece.mesh.clone();
    const material = (piece.mesh.material as THREE.MeshStandardMaterial).clone();
    material.color.copy(hairTint);
    owned.push(material);
    worn.material = material;
    piece.offset.decompose(worn.position, worn.quaternion, worn.scale);
    head.add(worn);
    return worn;
  };
  const hairName = look ? hairFor(look, kind) : undefined;
  const style = hairName === undefined ? pick(id, body.hair, 41) : body.hair.find((hair) => hair.name === hairName);
  if (style) {
    const hairMesh = wear(style);
    if (look?.hairShape === "curly") {
      // Scale about the hair's own middle, so it grows outwards instead of drifting.
      const geometry = style.mesh.geometry;
      if (!geometry.boundingBox) geometry.computeBoundingBox();
      const middle = geometry.boundingBox!.getCenter(new THREE.Vector3());
      hairMesh.position.add(middle.multiply(hairMesh.scale).applyQuaternion(hairMesh.quaternion).multiplyScalar(1 - CURLY_SCALE));
      hairMesh.scale.multiplyScalar(CURLY_SCALE);
    }
  }
  if (look?.beard && body.beard) wear(body.beard);
  if (look?.glasses && body.eyes) head.add(makeGlasses(body.eyes, owned));

  model.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) return;
    child.castShadow = true;
    // Bounds come from the T-pose, which no longer matches once the clips move the limbs.
    child.frustumCulled = false;
  });

  const mixer = new THREE.AnimationMixer(model);
  const actions = {
    idle: mixer.clipAction(body.clips.idle),
    move: mixer.clipAction(body.clips.move),
    sit: mixer.clipAction(talking ? body.clips.talk : body.clips.sit),
    playArms: mixer.clipAction(body.playing.arms),
    playBody: mixer.clipAction(body.playing.body),
  };
  actions.move.timeScale = JOG_SPEED;
  const ride = {
    upper: mixer.clipAction(body.riding.upper),
    hips: mixer.clipAction(body.riding.hips),
    bent: body.riding.bent.map((clip) => mixer.clipAction(clip)),
    straight: body.riding.straight.map((clip) => mixer.clipAction(clip)),
  };
  const holdAction = mixer.clipAction(body.holding);
  for (const action of [...Object.values(actions), ride.upper, ride.hips, ...ride.bent, ...ride.straight, holdAction]) {
    action.play();
    action.setEffectiveWeight(0);
  }
  // The legs hold their pose; the cranks' angle moves them, not the clips' time.
  for (const action of [...ride.bent, ...ride.straight]) action.timeScale = 0;
  const gestures: Record<Gesture, THREE.AnimationAction> = { press: mixer.clipAction(body.clips.press), pickup: mixer.clipAction(body.clips.pickup) };
  for (const [kind, action] of Object.entries(gestures) as [Gesture, THREE.AnimationAction][]) {
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.timeScale = GESTURE_SPEED[kind];
    action.setEffectiveWeight(0);
  }
  let playingGesture: { action: THREE.AnimationAction; age: number; length: number; weight: number } | null = null;
  // A gesture cut short by another, fading out under it instead of snapping away.
  let fadingGesture: { action: THREE.AnimationAction; weight: number } | null = null;

  // The left arm, for raising a drink to the mouth, and the head that tips back to drink.
  const bone = (name: string) => model.getObjectByName(name)!;
  const arm = { upper: bone("upperarm_l"), lower: bone("lowerarm_l"), end: bone("hand_l"), finger: bone("middle_01_l") };
  // A rider's arms and legs, left then right, and the balls of their feet.
  const arms = (["l", "r"] as const).map((side) => ({
    upper: bone(`upperarm_${side}`), lower: bone(`lowerarm_${side}`), end: bone(`hand_${side}`),
    knuckle: bone(`middle_01_${side}`), thumb: bone(`thumb_02_${side}`),
  }));
  const legs = (["l", "r"] as const).map((side) => ({ upper: bone(`thigh_${side}`), lower: bone(`calf_${side}`), end: bone(`foot_${side}`) }));
  const balls = [bone("ball_l"), bone("ball_r")];
  const pelvis = bone("pelvis");
  const upperBack = bone("spine_03");
  const headBone = bone("Head");
  const spine = bone("spine_01");
  let held: THREE.Object3D | null = null;
  const v = { shoulder: new THREE.Vector3(), elbow: new THREE.Vector3(), wrist: new THREE.Vector3(), target: new THREE.Vector3(), a: new THREE.Vector3(), b: new THREE.Vector3() };
  const turn = new THREE.Quaternion();
  const world = new THREE.Quaternion();
  const parentWorld = new THREE.Quaternion();
  const forward = new THREE.Vector3();
  const up = new THREE.Vector3();
  const left = new THREE.Vector3();
  // A rider's reach: where a wrist or ankle goes, which way the elbow or knee bends, the toes, and the
  // way the knuckles and the thumb point on the bars.
  const aim = new THREE.Vector3();
  const bend = new THREE.Vector3();
  const toes = new THREE.Vector3();
  const knuckles = new THREE.Vector3();
  const inward = new THREE.Vector3();
  const handNow = new THREE.Matrix4();
  const handGoal = new THREE.Matrix4();

  // Bones turned after the mixer this frame (the lean, the sip) and how they were before. The mixer
  // only rewrites a bone whose animated value changes, so they are put back before it runs, or the
  // turns would pile up frame after frame on a still pose.
  const turned = new Map<THREE.Object3D, THREE.Quaternion>();
  // Turns a bone by `rotation` (in world space), by `weight` of the way.
  const turnBy = (target: THREE.Object3D, rotation: THREE.Quaternion, weight: number) => {
    if (!turned.has(target)) turned.set(target, target.quaternion.clone());
    target.getWorldQuaternion(world);
    target.parent!.getWorldQuaternion(parentWorld);
    const goal = rotation.clone().multiply(world).premultiply(parentWorld.invert());
    target.quaternion.slerp(goal, weight);
    target.updateMatrixWorld(true);
  };
  // Swings the upper bone of a limb and then the lower one so its end (a wrist or an ankle) reaches
  // `target`, the middle joint (elbow or knee) bending toward `pole` (two-bone reach, world space).
  const reach = (limb: Limb, target: THREE.Vector3, pole: THREE.Vector3, weight: number) => {
    limb.upper.getWorldPosition(v.shoulder);
    limb.lower.getWorldPosition(v.elbow);
    limb.end.getWorldPosition(v.wrist);
    const upperLength = v.shoulder.distanceTo(v.elbow);
    const lowerLength = v.elbow.distanceTo(v.wrist);
    const toTarget = v.a.subVectors(target, v.shoulder);
    const distance = Math.min(Math.max(toTarget.length(), 0.01), upperLength + lowerLength - 0.001);
    toTarget.normalize();
    const cosine = (upperLength ** 2 + distance ** 2 - lowerLength ** 2) / (2 * upperLength * distance);
    const side = v.b.copy(pole).addScaledVector(toTarget, -pole.dot(toTarget)).normalize();
    const elbowGoal = v.target.copy(v.shoulder).addScaledVector(toTarget, upperLength * cosine)
      .addScaledVector(side, upperLength * Math.sqrt(Math.max(0, 1 - cosine * cosine)));
    turnBy(limb.upper, turn.setFromUnitVectors(v.elbow.sub(v.shoulder).normalize(), elbowGoal.clone().sub(v.shoulder).normalize()), weight);
    limb.lower.getWorldPosition(v.elbow);
    limb.end.getWorldPosition(v.wrist);
    turnBy(limb.lower, turn.setFromUnitVectors(v.wrist.sub(v.elbow).normalize(), target.clone().sub(v.elbow).normalize()), weight);
  };
  // The turn that takes a hand to `fingers` and `thumbWay` (world space) as a matrix whose columns
  // are the way the knuckles point, a third axis, and the side the thumb is on.
  const handAxes = (fingers: THREE.Vector3, thumbWay: THREE.Vector3, into: THREE.Matrix4) => {
    const across = v.b.crossVectors(fingers, thumbWay).normalize();
    return into.makeBasis(fingers, v.a.crossVectors(across, fingers), across);
  };
  // Turns a hand about its wrist so its knuckles point along `fingers` and its thumb (as near as it
  // can) toward `thumbWay`: palm down on a handlebar, thumb on the inside.
  const holdBar = (hand: (typeof arms)[number], fingers: THREE.Vector3, thumbWay: THREE.Vector3, weight: number) => {
    hand.end.getWorldPosition(v.wrist);
    const knuckle = hand.knuckle.getWorldPosition(v.elbow).sub(v.wrist).normalize();
    const thumb = hand.thumb.getWorldPosition(v.shoulder).sub(v.wrist).normalize();
    handAxes(knuckle, thumb, handNow);
    handAxes(fingers, thumbWay, handGoal);
    turnBy(hand.end, turn.setFromRotationMatrix(handGoal.multiply(handNow.transpose())), weight);
  };
  // Start people at different points in their idle so a room doesn't sway in step.
  actions.idle.time = actions.playBody.time = pick(id, [0, 0.4, 0.8, 1.2, 1.6, 2], 43);
  actions.sit.time = actions.playArms.time = pick(id, [0, 0.3, 0.6, 0.9, 1.2, 1.5], 47);

  // `turn` is the tuck each bone was given last frame.
  const tucked = Object.entries(TUCK).map(([name, angle]) => ({ bone: model.getObjectByName(name)!, angle, turn: new THREE.Quaternion() }));
  const modelRotation = new THREE.Quaternion();
  const parentRotation = new THREE.Quaternion();
  const axis = new THREE.Vector3();

  return {
    root,
    hipHeight: body.hipHeight * SCALE,
    hold: (object) => {
      if (held) root.remove(held);
      held = object;
      if (held) root.add(held);
    },
    gesture: (kind) => {
      const action = gestures[kind];
      fadingGesture?.action.stop();
      fadingGesture = null;
      if (playingGesture && playingGesture.action !== action) fadingGesture = { action: playingGesture.action, weight: playingGesture.weight };
      action.reset().play();
      playingGesture = { action, age: 0, length: action.getClip().duration / GESTURE_SPEED[kind], weight: 0 };
    },
    update: (dt, walk, sit, play = 0, gear = {}) => {
      // Undo last frame's lean and sip first (they went on after the tuck).
      for (const [target, before] of turned) target.quaternion.copy(before);
      turned.clear();
      // The mixer only writes a bone when its animated value changes, and the sitting clips hold
      // the thighs still, so last frame's tuck would stay and another would go on top each frame,
      // swinging the legs round and round. Take it off before the mixer runs.
      for (const { bone, turn } of tucked) {
        bone.quaternion.premultiply(turn.invert());
        turn.identity();
      }
      // A gesture fades in quickly and out over its last quarter of a second.
      let gestureWeight = 0;
      let fadingWeight = 0;
      if (fadingGesture) {
        fadingGesture.weight -= dt / 0.2;
        if (fadingGesture.weight <= 0) {
          fadingGesture.action.stop();
          fadingGesture = null;
        } else fadingWeight = fadingGesture.weight;
      }
      if (playingGesture) {
        playingGesture.age += dt;
        const { age, length, action } = playingGesture;
        gestureWeight = Math.max(0, Math.min(1 - fadingWeight, age / 0.15, (length - age) / 0.25));
        playingGesture.weight = gestureWeight;
        action.setEffectiveWeight(gestureWeight);
        if (age >= length) {
          action.stop();
          playingGesture = null;
        }
      }
      fadingGesture?.action.setEffectiveWeight(fadingWeight);
      gestureWeight += fadingWeight;
      const riding = (gear.ride ?? 0) * (1 - gestureWeight);
      const keep = (1 - (gear.ride ?? 0)) * (1 - gestureWeight);
      const seated = sit * (1 - walk);
      const standing = Math.max(0, 1 - walk - seated);
      const playing = play * standing;
      actions.move.setEffectiveWeight(walk * keep);
      actions.sit.setEffectiveWeight(seated * keep);
      actions.idle.setEffectiveWeight((standing - playing) * keep);
      actions.playArms.setEffectiveWeight(playing * keep);
      actions.playBody.setEffectiveWeight(playing * keep);
      // On a bike each leg bends as its pedal comes up, the two half a turn apart.
      const rise = 0.5 + 0.5 * Math.sin(gear.pedal ?? 0);
      ride.upper.setEffectiveWeight(riding);
      ride.hips.setEffectiveWeight(riding);
      [rise, 1 - rise].forEach((lift, i) => {
        const bend = PEDAL_LOW + (PEDAL_HIGH - PEDAL_LOW) * lift;
        ride.bent[i]!.setEffectiveWeight(riding * bend);
        ride.straight[i]!.setEffectiveWeight(riding * (1 - bend));
      });
      holdAction.setEffectiveWeight(gear.hold ?? 0);
      mixer.update(dt);
      model.position.z = SIT_FORWARD * seated * keep;
      model.updateMatrixWorld(true);
      model.getWorldQuaternion(modelRotation);
      // Turn each tucked bone about the body's front-to-back axis, measured in its parent's space.
      const tuck = (1 - walk) * keep;
      if (tuck > 0.01) {
        for (const { bone, angle, turn } of tucked) {
          bone.parent!.getWorldQuaternion(parentRotation);
          axis.copy(FORWARD).applyQuaternion(modelRotation).applyQuaternion(parentRotation.invert());
          bone.quaternion.premultiply(turn.setFromAxisAngle(axis, angle * tuck));
        }
        model.updateMatrixWorld(true);
      }

      // A sip: the head tips back and the hand brings the drink just under the mouth.
      const drink = gear.drink ?? 0;
      forward.set(0, 0, 1).applyQuaternion(modelRotation);
      up.set(0, 1, 0).applyQuaternion(modelRotation);
      left.set(1, 0, 0).applyQuaternion(modelRotation);
      // On a bike the hips rock with the pedalling and the back leans forward over the handlebars,
      // the head looking up the road. The hands hold the grips, and the ball of each foot presses
      // its pedal (or the floor), the ankle following the pedal round.
      if (riding > 0.01) {
        turnBy(pelvis, turn.setFromAxisAngle(forward, HIP_ROCK * Math.sin(gear.pedal ?? 0) * riding), 1);
        const lean = RIDE_LEAN * (1 - SIT_UP * (gear.upright ?? 0)) * riding;
        turnBy(spine, turn.setFromAxisAngle(left, lean), 1);
        // Square and level the shoulders to the handlebars: the standing clip turns them a little,
        // and the rocking hips would tip them. The hips rock under a steady back.
        arms[0]!.upper.getWorldPosition(v.a);
        arms[1]!.upper.getWorldPosition(v.b);
        turnBy(upperBack, turn.setFromUnitVectors(v.a.sub(v.b).normalize(), left), riding);
        turnBy(headBone, turn.setFromAxisAngle(left, -lean * LOOK_AHEAD), 1);
        gear.grips?.forEach((grip, i) => {
          const outward = i === 0 ? 1 : -1;
          aim.copy(grip).addScaledVector(forward, -WRIST_BEHIND * SCALE).addScaledVector(up, WRIST_ABOVE * SCALE);
          bend.copy(up).negate().addScaledVector(left, 0.7 * outward).addScaledVector(forward, -0.3);
          reach(arms[i]!, aim, bend, riding);
          knuckles.copy(forward).multiplyScalar(Math.cos(KNUCKLES_DOWN)).addScaledVector(up, -Math.sin(KNUCKLES_DOWN));
          holdBar(arms[i]!, knuckles, inward.copy(left).multiplyScalar(-outward), riding);
        });
        gear.feet?.forEach(({ at, pitch }, i) => {
          const leg = legs[i]!;
          toes.copy(forward).multiplyScalar(Math.cos(pitch)).addScaledVector(up, -Math.sin(pitch));
          const length = leg.end.getWorldPosition(v.wrist).distanceTo(balls[i]!.getWorldPosition(v.elbow));
          aim.copy(at).addScaledVector(up, BALL_HEIGHT * SCALE).addScaledVector(toes, -length);
          bend.copy(forward).addScaledVector(up, 0.3).addScaledVector(left, 0.15 * (i === 0 ? 1 : -1));
          reach(leg, aim, bend, riding);
          // Then the foot turned along `toes`, so its ball comes down where it should.
          leg.end.getWorldPosition(v.wrist);
          balls[i]!.getWorldPosition(v.elbow);
          turnBy(leg.end, turn.setFromUnitVectors(v.elbow.sub(v.wrist).normalize(), toes), riding);
        });
      }
      if (drink > 0.01) {
        turnBy(headBone, turn.setFromAxisAngle(left, -0.3 * drink), 1);
        const mouth = headBone.getWorldPosition(v.target).addScaledVector(forward, 0.11 * SCALE).addScaledVector(up, 0.02 * SCALE);
        const wrist = mouth.clone().addScaledVector(forward, 0.05 * SCALE).addScaledVector(up, -0.09 * SCALE).addScaledVector(left, 0.03 * SCALE);
        reach(arm, wrist, up.clone().negate().addScaledVector(left, 0.8), drink);
      }
      // The drink in the palm, upright, tipping toward the mouth as it is raised.
      if (held) {
        arm.end.getWorldPosition(v.wrist);
        arm.finger.getWorldPosition(v.a);
        const palm = v.wrist.lerp(v.a, 0.55);
        root.updateMatrixWorld(true);
        held.position.copy(root.worldToLocal(palm));
        held.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -1.9 * drink);
      }
    },
    dispose: () => {
      mixer.stopAllAction();
      mixer.uncacheRoot(model);
      for (const item of owned) item.dispose();
    },
  };
}
