import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

// The lounges' coffee and side tables, built in code to match the 2D map (office-art.ts) and to
// read like real furniture: varnished oak with its grain, rounded edges, tapered legs, and the
// things people leave on them. One unit is one tile; both stand on y = 0, centred on the origin.

// Oak planks with grain, knots and a little colour from plank to plank, as a texture.
function oak(seed: number) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const planks = 4;
  for (let p = 0; p < planks; p++) {
    const y0 = (p * 256) / planks;
    const tone = 205 + rand() * 22;
    ctx.fillStyle = `rgb(${tone + 22}, ${tone - 14}, ${tone - 70})`;
    ctx.fillRect(0, y0, 512, 256 / planks);
    // Grain: long wavy lines, some darker, some lighter.
    for (let line = 0; line < 26; line++) {
      const base = y0 + rand() * (256 / planks);
      const wave = 2 + rand() * 4;
      const period = 60 + rand() * 120;
      ctx.strokeStyle = rand() < 0.65 ? `rgba(120, 72, 30, ${0.12 + rand() * 0.18})` : `rgba(255, 236, 200, ${0.12 + rand() * 0.12})`;
      ctx.lineWidth = 0.6 + rand() * 1.4;
      ctx.beginPath();
      for (let x = 0; x <= 512; x += 8) {
        const y = base + Math.sin(x / period + line) * wave;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // An occasional knot.
    if (rand() < 0.6) {
      const kx = 40 + rand() * 430;
      const ky = y0 + 10 + rand() * (256 / planks - 20);
      for (let r = 9; r > 1; r -= 2) {
        ctx.strokeStyle = `rgba(110, 64, 28, ${0.1 + (9 - r) * 0.05})`;
        ctx.beginPath();
        ctx.ellipse(kx, ky, r * 2.2, r * 0.8, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.fillStyle = "rgba(90, 55, 25, 0.35)";
    ctx.fillRect(0, y0, 512, 1.5);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

const varnished = (map: THREE.Texture) =>
  new THREE.MeshPhysicalMaterial({ map, roughness: 0.5, clearcoat: 0.35, clearcoatRoughness: 0.45 });
const darkOak = () => new THREE.MeshStandardMaterial({ color: "#7a5530", roughness: 0.6 });

function mesh(geometry: THREE.BufferGeometry, material: THREE.Material | THREE.Material[], x = 0, y = 0, z = 0) {
  const part = new THREE.Mesh(geometry, material);
  part.position.set(x, y, z);
  part.castShadow = true;
  part.receiveShadow = true;
  return part;
}

// A closed hardback: cover on the outside, cream pages on the three open edges.
function book(cover: string, w: number, h: number, d: number) {
  const coverMaterial = new THREE.MeshStandardMaterial({ color: cover, roughness: 0.7 });
  const pages = new THREE.MeshStandardMaterial({ color: "#f3eee2", roughness: 0.9 });
  // Box faces: +x, -x, +y, -y, +z, -z. The spine is -x.
  return mesh(new THREE.BoxGeometry(w, h, d), [pages, coverMaterial, coverMaterial, coverMaterial, pages, pages]);
}

function mug(color: string) {
  const group = new THREE.Group();
  const ceramic = new THREE.MeshStandardMaterial({ color, roughness: 0.35 });
  group.add(mesh(new THREE.CylinderGeometry(0.04, 0.036, 0.09, 20), ceramic, 0, 0.045, 0));
  const coffee = mesh(new THREE.CircleGeometry(0.035, 20), new THREE.MeshStandardMaterial({ color: "#3b2416", roughness: 0.2 }), 0, 0.082, 0);
  coffee.rotation.x = -Math.PI / 2;
  group.add(coffee);
  const handle = mesh(new THREE.TorusGeometry(0.024, 0.007, 8, 16, Math.PI), ceramic, 0.04, 0.045, 0);
  handle.rotation.z = -Math.PI / 2;
  group.add(handle);
  return group;
}

// A small leafy plant in a terracotta pot.
function pottedPlant() {
  const group = new THREE.Group();
  const clay = new THREE.MeshStandardMaterial({ color: "#b26a3f", roughness: 0.85 });
  group.add(mesh(new THREE.CylinderGeometry(0.07, 0.055, 0.1, 20), clay, 0, 0.05, 0));
  group.add(mesh(new THREE.CylinderGeometry(0.076, 0.076, 0.022, 20), clay, 0, 0.1, 0));
  group.add(mesh(new THREE.CylinderGeometry(0.064, 0.064, 0.01, 20), new THREE.MeshStandardMaterial({ color: "#3b2a20" }), 0, 0.108, 0));
  const leaf = new THREE.MeshStandardMaterial({ color: "#4a9a5f", roughness: 0.6, side: THREE.DoubleSide });
  const shape = new THREE.SphereGeometry(1, 10, 6);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const tilt = 0.5 + (i % 3) * 0.25;
    const blade = mesh(shape, leaf, Math.cos(a) * 0.04, 0.16 + (i % 2) * 0.03, Math.sin(a) * 0.04);
    blade.scale.set(0.022, 0.075, 0.009);
    blade.rotation.set(Math.sin(a) * tilt, a, -Math.cos(a) * tilt);
    group.add(blade);
  }
  return group;
}

// An oval oak coffee table on four splayed, tapered legs, with a book, a mug and a plant on it
// (as on the 2D map). Sized for its three tiles.
export function makeCoffeeTable() {
  const group = new THREE.Group();
  const length = 2.3;
  const depth = 0.74;
  const height = 0.42;
  const thickness = 0.045;

  const oval = new THREE.Shape();
  oval.absellipse(0, 0, length / 2, depth / 2, 0, Math.PI * 2, false, 0);
  const top = new THREE.ExtrudeGeometry(oval, { depth: thickness - 0.016, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.012, bevelSegments: 3, curveSegments: 64 });
  top.rotateX(-Math.PI / 2);
  const grain = oak(41);
  // The cap's UVs are the shape's own coordinates, in tiles: one copy of the grain covers the top.
  grain.repeat.set(1 / length, 1 / depth);
  grain.offset.set(0.5, 0.5);
  group.add(mesh(top, varnished(grain), 0, height - thickness + 0.008, 0));

  const legMaterial = darkOak();
  for (const [x, z] of [[-0.78, -0.2], [0.78, -0.2], [-0.78, 0.2], [0.78, 0.2]] as const) {
    const leg = mesh(new THREE.CylinderGeometry(0.026, 0.016, height - thickness + 0.02, 14), legMaterial, x, (height - thickness) / 2, z);
    // Feet splayed out a little from the middle, mid-century style.
    leg.rotation.z = Math.sign(x) * 0.12;
    leg.rotation.x = Math.sign(z) * -0.12;
    group.add(leg);
  }

  const onTop = height + 0.002;
  const novel = book("#5f86d0", 0.26, 0.032, 0.19);
  novel.position.set(-0.62, onTop + 0.016, 0.02);
  novel.rotation.y = 0.18;
  group.add(novel);
  const magazine = book("#e8d8b0", 0.24, 0.012, 0.17);
  magazine.position.set(-0.6, onTop + 0.038, 0.03);
  magazine.rotation.y = -0.12;
  group.add(magazine);
  const cup = mug("#f8f8f4");
  cup.position.set(-0.22, onTop, 0.08);
  cup.rotation.y = 0.6;
  group.add(cup);
  const plant = pottedPlant();
  plant.position.set(0.5, onTop, -0.06);
  group.add(plant);
  return group;
}

// A small oak side table with a drawer, carrying a table lamp (variant 0), a blue desk lamp (1)
// or a stack of books (2), as on the 2D map.
export function makeSideTable(variant: number) {
  const group = new THREE.Group();
  const size = 0.56;
  const height = 0.55;
  const grain = oak(73 + variant);
  grain.repeat.set(0.5, 1);
  const wood = varnished(grain);
  group.add(mesh(new RoundedBoxGeometry(size, 0.04, size, 3, 0.012), wood, 0, height - 0.02, 0));
  // The apron and its drawer, with a brass knob.
  group.add(mesh(new THREE.BoxGeometry(size - 0.06, 0.11, size - 0.06), wood, 0, height - 0.095, 0));
  group.add(mesh(new THREE.BoxGeometry(size - 0.14, 0.075, 0.012), darkOak(), 0, height - 0.095, size / 2 - 0.025));
  group.add(mesh(new THREE.SphereGeometry(0.012, 10, 8), new THREE.MeshStandardMaterial({ color: "#c9a24a", metalness: 0.8, roughness: 0.3 }), 0, height - 0.095, size / 2 - 0.012));
  const legMaterial = darkOak();
  for (const x of [-1, 1]) for (const z of [-1, 1]) {
    // Square, tapered legs (a four-sided cylinder, turned so its faces line up with the top).
    const leg = mesh(new THREE.CylinderGeometry(0.022, 0.016, height - 0.15, 4), legMaterial, x * (size / 2 - 0.05), (height - 0.15) / 2, z * (size / 2 - 0.05));
    leg.rotation.y = Math.PI / 4;
    group.add(leg);
  }

  const onTop = height;
  if (variant === 0) {
    // Table lamp: a slim stem on a round base, under a warm, softly lit drum shade.
    const metal = new THREE.MeshStandardMaterial({ color: "#8a8f99", metalness: 0.6, roughness: 0.35 });
    group.add(mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.02, 24), metal, 0, onTop + 0.01, 0));
    group.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.32, 10), metal, 0, onTop + 0.17, 0));
    const shade = new THREE.MeshStandardMaterial({ color: "#f6e7c8", emissive: "#ffd9a0", emissiveIntensity: 0.35, roughness: 0.9, side: THREE.DoubleSide });
    group.add(mesh(new THREE.CylinderGeometry(0.1, 0.15, 0.18, 32, 1, true), shade, 0, onTop + 0.36, 0));
  } else if (variant === 1) {
    // Desk lamp: a weighted base, two arm segments and a cone head, in blue.
    const blue = new THREE.MeshStandardMaterial({ color: "#3a6ee8", roughness: 0.4, metalness: 0.2 });
    const base = new THREE.Group();
    base.position.set(-0.1, onTop, 0.04);
    base.add(mesh(new THREE.CylinderGeometry(0.075, 0.08, 0.025, 24), blue, 0, 0.012, 0));
    const lower = mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.26, 8), blue, 0.05, 0.13, 0);
    lower.rotation.z = -0.4;
    base.add(lower);
    const upper = mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.22, 8), blue, 0.16, 0.27, 0);
    upper.rotation.z = 1.1;
    base.add(upper);
    const head = mesh(new THREE.ConeGeometry(0.065, 0.11, 24, 1, true), blue, 0.26, 0.21, 0);
    head.rotation.z = 0.5;
    base.add(head);
    base.add(mesh(new THREE.SphereGeometry(0.025, 12, 8), new THREE.MeshStandardMaterial({ color: "#fff1c4", emissive: "#ffe9a8", emissiveIntensity: 0.8 }), 0.25, 0.18, 0));
    group.add(base);
  } else {
    // Two hardbacks, green under blue, a little askew.
    const lower = book("#4caf6d", 0.3, 0.045, 0.22);
    lower.position.set(0, onTop + 0.023, 0);
    lower.rotation.y = 0.12;
    group.add(lower);
    const upper = book("#3a6ee8", 0.26, 0.04, 0.2);
    upper.position.set(0.01, onTop + 0.066, 0.01);
    upper.rotation.y = -0.15;
    group.add(upper);
  }
  return group;
}
