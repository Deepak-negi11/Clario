import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";

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
const BODIES: Record<BodyKind, { file: string; mesh: string; skins: [string, string]; hair: string[] }> = {
  male: { file: "Superhero_Male", mesh: "SuperHero_Male", skins: ["T_Male_Light.jpg", "T_Male_Dark.jpg"], hair: ["Hair_SimpleParted", "Hair_Buzzed"] },
  female: { file: "Superhero_Female", mesh: "Superhero_Female", skins: ["T_Female_Light.jpg", "T_Female_Dark.jpg"], hair: ["Hair_Long", "Hair_Buns"] },
};
const CLIPS = { idle: "Idle_Loop", move: "Jog_Fwd_Loop", sit: "Sitting_Idle_Loop", talk: "Sitting_Talking_Loop" } as const;

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

type BodyKit = {
  template: THREE.Object3D;
  clothes: Record<Garment, THREE.BufferGeometry>;
  // Each hairstyle sits on the Head bone at this offset (found in the rest pose).
  hair: { mesh: THREE.Mesh; offset: THREE.Matrix4 }[];
  skins: THREE.Texture[];
  clips: Record<keyof typeof CLIPS, THREE.AnimationClip>;
};
export type PeopleKit = Record<BodyKind, BodyKit>;

export type Person = {
  root: THREE.Object3D;
  // walk and sit run from 0 to 1 and blend the clips.
  update: (dt: number, walk: number, sit: number) => void;
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
    const [gltf, hairs, darkSkin, library] = await Promise.all([
      loader.loadAsync(`${DIR}${spec.file}.gltf`),
      Promise.all(spec.hair.map((file) => loader.loadAsync(`${DIR}${file}.gltf`))),
      loadTexture(spec.skins[1]),
      animations,
    ]);
    const template = gltf.scene;
    template.updateMatrixWorld(true);
    const body = template.getObjectByName(spec.mesh) as THREE.SkinnedMesh;
    const head = template.getObjectByName("Head")!;
    const pelvis = template.getObjectByName("pelvis")!.position.clone();
    const lightSkin = (body.material as THREE.MeshStandardMaterial).map!;

    const hair = hairs.map((hairGltf) => {
      hairGltf.scene.updateMatrixWorld(true);
      let mesh: THREE.Mesh | undefined;
      hairGltf.scene.traverse((child) => { if (!mesh && (child as THREE.Mesh).isMesh) mesh = child as THREE.Mesh; });
      const offset = head.matrixWorld.clone().invert().multiply(mesh!.matrixWorld);
      return { mesh: mesh!, offset };
    });

    const clips = Object.fromEntries(Object.entries(CLIPS).map(([key, name]) => {
      const json = library.clips.find((clip) => clip.name === name);
      if (!json) throw new Error(`missing clip ${name}`);
      return [key, fitClip(json, pelvis, library.pelvisRest)];
    })) as BodyKit["clips"];

    const clothes = Object.fromEntries(
      (Object.keys(OUTFIT) as Garment[]).map((part) => [part, garment(body, OUTFIT[part].bones, OUTFIT[part].push)]),
    ) as BodyKit["clothes"];

    return { template, clothes, hair, skins: [lightSkin, darkSkin], clips };
  };

  const [male, female] = await Promise.all([build("male"), build("female")]);
  return { male, female };
}

// `talking` makes a seated person chat with their hands instead of sitting still.
export function makePerson(kit: PeopleKit, id: string, shirtColor: string, { talking = false } = {}): Person {
  const kind = pick(id, ["male", "female"] as const, 17);
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
  const hairTint = new THREE.Color(pick(id, HAIR_COLORS, 23));

  const mesh = model.getObjectByName(spec.mesh) as THREE.SkinnedMesh;
  const skin = (mesh.material as THREE.MeshStandardMaterial).clone();
  skin.map = pick(id, body.skins, 29);
  owned.push(skin);
  mesh.material = skin;
  const brows = model.getObjectByName("Eyebrows") as THREE.SkinnedMesh | undefined;
  if (brows) {
    const browMaterial = (brows.material as THREE.MeshStandardMaterial).clone();
    browMaterial.color.copy(hairTint);
    owned.push(browMaterial);
    brows.material = browMaterial;
  }

  const longSleeves = pick(id, [false, true], 31);
  const outfit: [Garment, THREE.Material][] = [
    ["shirt", cloth(shirtColor, 0.8)],
    ["trousers", cloth(pick(id, PANTS, 37))],
    ["shoes", cloth("#24262d", 0.5)],
  ];
  if (longSleeves) outfit.push(["sleeves", outfit[0]![1]]);
  for (const [part, cloth] of outfit) {
    const piece = new THREE.SkinnedMesh(body.clothes[part], cloth);
    piece.bind(mesh.skeleton, mesh.bindMatrix);
    mesh.parent!.add(piece);
  }

  const style = pick(id, body.hair, 41);
  const head = model.getObjectByName("Head")!;
  const hairMesh = style.mesh.clone();
  const hairMaterial = (style.mesh.material as THREE.MeshStandardMaterial).clone();
  hairMaterial.color.copy(hairTint);
  owned.push(hairMaterial);
  hairMesh.material = hairMaterial;
  style.offset.decompose(hairMesh.position, hairMesh.quaternion, hairMesh.scale);
  head.add(hairMesh);

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
  };
  actions.move.timeScale = JOG_SPEED;
  for (const action of Object.values(actions)) {
    action.play();
    action.setEffectiveWeight(0);
  }
  // Start people at different points in their idle so a room doesn't sway in step.
  actions.idle.time = pick(id, [0, 0.4, 0.8, 1.2, 1.6, 2], 43);
  actions.sit.time = pick(id, [0, 0.3, 0.6, 0.9, 1.2, 1.5], 47);

  const tucked = Object.entries(TUCK).map(([name, angle]) => ({ bone: model.getObjectByName(name)!, angle }));
  const modelRotation = new THREE.Quaternion();
  const parentRotation = new THREE.Quaternion();
  const axis = new THREE.Vector3();
  const turn = new THREE.Quaternion();

  return {
    root,
    update: (dt, walk, sit) => {
      const seated = sit * (1 - walk);
      actions.move.setEffectiveWeight(walk);
      actions.sit.setEffectiveWeight(seated);
      actions.idle.setEffectiveWeight(Math.max(0, 1 - walk - seated));
      mixer.update(dt);
      model.position.z = SIT_FORWARD * seated;
      // Turn each tucked bone about the body's front-to-back axis, measured in its parent's space.
      if (walk > 0.99) return;
      model.updateMatrixWorld(true);
      model.getWorldQuaternion(modelRotation);
      for (const { bone, angle } of tucked) {
        bone.parent!.getWorldQuaternion(parentRotation);
        axis.copy(FORWARD).applyQuaternion(modelRotation).applyQuaternion(parentRotation.invert());
        bone.quaternion.premultiply(turn.setFromAxisAngle(axis, angle * (1 - walk)));
      }
    },
    dispose: () => {
      mixer.stopAllAction();
      mixer.uncacheRoot(model);
      for (const item of owned) item.dispose();
    },
  };
}
