import * as THREE from "three";

// A bean bag lounger for the 3D office, built in code so it reads like the real thing rather
// than a squashed ball: a wide, settled base, a sunken seat, a back that rises behind it, soft
// folds where the fabric bunches, piped seams, and a woven fabric with a little sheen. One unit
// is one tile; it faces +z (like a seat turned "down") and its seat dips to about 0.4, the height
// seated people sit at (people.ts), with a lower front lip so their shins hang over it.

const RADIUS = 0.47; // footprint
const MID = 0.3; // height of the bag's middle before it is shaped

const smooth = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

// Where a point of the unit sphere ends up on the bag, and how deep in a fold or the seat it is
// (for the shading baked into its colour).
function shape(ux: number, uy: number, uz: number) {
  const around = Math.atan2(uz, ux);
  const ring = Math.sqrt(Math.max(0, 1 - uy * uy));
  // The beans settle: the lower half spreads out and flattens onto the floor.
  const low = Math.max(0, -uy);
  const spread = 1 + 0.12 * Math.pow(ring, 3) * (1 - uy) * 0.5;
  let y = uy < 0 ? MID - MID * Math.pow(low, 0.42) : MID + MID * uy;
  // The seat: a hollow just in front of the middle; the back rises behind it, the front lip sags.
  const seat = Math.exp(-((ux / 0.3) ** 2 + ((uz - 0.02) / 0.34) ** 2)) * smooth(0, 0.6, uy);
  y -= 0.2 * seat;
  y += 0.2 * Math.max(0, -uz) * smooth(0.1, 0.9, uy);
  y -= 0.24 * Math.max(0, uz) * smooth(0, 0.8, uy);
  // Folds where the fabric bunches: round the base and up the sides of the seat.
  const fold =
    Math.sin(around * 9 + 2.2 * Math.sin(uy * 5)) * 0.6 + Math.sin(around * 15 + 1.3) * 0.4;
  const foldWeight = smooth(0.6, -0.2, uy) * 0.7 + seat * 0.5;
  const out = 1 + 0.022 * fold * foldWeight;
  const x = ux * RADIUS * spread * out;
  const z = uz * RADIUS * spread * out * (1 + 0.04 * Math.max(0, uz));
  y = Math.max(0.005, y + 0.01 * fold * foldWeight);
  return { point: new THREE.Vector3(x, y, z), seat, fold: Math.min(0, fold) * foldWeight };
}

// Fine basket weave, as a bump map.
function weave() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#808080";
  ctx.fillRect(0, 0, 64, 64);
  for (let x = 0; x < 64; x += 4) {
    for (let y = 0; y < 64; y += 4) {
      const across = ((x + y) / 4) % 2 === 0;
      const g = ctx.createLinearGradient(x, y, across ? x : x + 4, across ? y + 4 : y);
      g.addColorStop(0, "#5a5a5a");
      g.addColorStop(0.5, "#c8c8c8");
      g.addColorStop(1, "#5a5a5a");
      ctx.fillStyle = g;
      ctx.fillRect(x, y, 4, 4);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(10, 6);
  return texture;
}

export function makeBeanbag(color: string) {
  const group = new THREE.Group();
  const base = new THREE.Color(color);

  const geometry = new THREE.SphereGeometry(1, 72, 48);
  const position = geometry.attributes.position!;
  const colors = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    const { point, seat, fold } = shape(position.getX(i), position.getY(i), position.getZ(i));
    position.setXYZ(i, point.x, point.y, point.z);
    // Baked shade: darker in the seat's hollow, the folds and where the bag meets the floor.
    const shade = 1 - 0.18 * seat + 0.35 * fold - 0.3 * smooth(0.09, 0, point.y);
    colors.set([shade, shade, shade], i * 3);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();

  const fabric = new THREE.MeshPhysicalMaterial({
    color: base,
    vertexColors: true,
    roughness: 0.88,
    sheen: 0.7,
    sheenRoughness: 0.55,
    sheenColor: base.clone().lerp(new THREE.Color("#ffffff"), 0.45),
    bumpMap: weave(),
    bumpScale: 0.35,
  });
  const bag = new THREE.Mesh(geometry, fabric);
  bag.castShadow = true;
  bag.receiveShadow = true;
  group.add(bag);

  // Piped seams: one over the top from front to back, one round the base panel.
  const piping = new THREE.MeshStandardMaterial({ color: base.clone().multiplyScalar(0.72), roughness: 0.75 });
  const seam = (points: THREE.Vector3[], closed: boolean) => {
    const curve = new THREE.CatmullRomCurve3(points, closed);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, points.length * 2, 0.009, 6, closed), piping);
    tube.castShadow = true;
    group.add(tube);
  };
  const lift = (p: THREE.Vector3) => p.add(new THREE.Vector3(p.x, p.y - MID, p.z).normalize().multiplyScalar(0.006));
  const over: THREE.Vector3[] = [];
  for (let i = 0; i <= 40; i++) {
    const t = -Math.PI / 2 + 0.35 + (i / 40) * (Math.PI - 0.7);
    over.push(lift(shape(0, Math.sin(Math.PI / 2 - Math.abs(t)) * 1, Math.sin(t)).point));
  }
  seam(over, false);
  const round: THREE.Vector3[] = [];
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const uy = -0.55;
    const r = Math.sqrt(1 - uy * uy);
    round.push(lift(shape(Math.cos(a) * r, uy, Math.sin(a) * r).point));
  }
  seam(round, true);

  return group;
}
