import * as THREE from "three";

// A laptop whose lid opens, for desks you can sit at: a base with keys, and a lid hinged at the
// back whose screen, face down on the keys while shut, lights up as it opens, showing code that
// scrolls a line at a time as someone works. Built from boxes,
// since the Kenney laptop is one solid piece. It faces +z (you sit on that side), about the size
// of the Kenney one on a desk.

const WIDTH = 0.42;
const DEPTH = 0.3;
const BASE = 0.018;
const LID = 0.012;
const OPEN_ANGLE = 1.85; // radians from shut, a little past upright
// The screen shows this many of the page's lines at once, and a new one comes up every
// LINE_SECONDS or so.
const PAGE_LINES = 40;
const SHOWN_LINES = 14;
const LINE_SECONDS = 1.1;

// One page of code in an editor's dark theme, drawn once and shared by every laptop (each scrolls
// its own copy of the texture, which shares the image).
let codePage: THREE.CanvasTexture | null = null;
function codeTexture() {
  if (!codePage) {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 512;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#14171f";
    ctx.fillRect(0, 0, 256, 512);
    const colors = ["#7aa2f7", "#9ece6a", "#e0af68", "#bb9af7", "#c0caf5", "#7dcfff", "#f7768e"];
    let seed = 5;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const height = 512 / PAGE_LINES;
    let indent = 0;
    for (let line = 0; line < PAGE_LINES; line++) {
      if (rand() < 0.12) continue; // a blank line
      indent = Math.max(0, Math.min(4, indent + (rand() < 0.3 ? 1 : rand() < 0.35 ? -1 : 0)));
      let x = 14 + indent * 12;
      ctx.fillStyle = "#3b4261";
      ctx.fillRect(4, line * height + 4, 6, height - 8);
      const words = 1 + Math.floor(rand() * 5);
      for (let w = 0; w < words && x < 240; w++) {
        const width = 10 + rand() * 38;
        ctx.fillStyle = colors[Math.floor(rand() * colors.length)]!;
        ctx.fillRect(x, line * height + 4, Math.min(width, 246 - x), height - 8);
        x += width + 6;
      }
    }
    codePage = new THREE.CanvasTexture(canvas);
    codePage.colorSpace = THREE.SRGBColorSpace;
    codePage.wrapT = THREE.RepeatWrapping;
  }
  const texture = codePage.clone();
  texture.repeat.set(1, SHOWN_LINES / PAGE_LINES);
  return texture;
}

export type Laptop = {
  object: THREE.Group;
  // 0 is shut, 1 open; in between eases the lid and fades the screen in.
  setOpen: (amount: number) => void;
};

export function makeLaptop(): Laptop {
  const object = new THREE.Group();
  const shell = new THREE.MeshStandardMaterial({ color: "#c3c8d2", roughness: 0.35, metalness: 0.55 });
  const keys = new THREE.MeshStandardMaterial({ color: "#2b2f38", roughness: 0.8 });
  const code = codeTexture();
  const screen = new THREE.MeshStandardMaterial({ color: "#0d1017", emissive: "#ffffff", emissiveMap: code, emissiveIntensity: 0, roughness: 0.2 });
  const part = (parent: THREE.Object3D, w: number, h: number, d: number, material: THREE.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };

  part(object, WIDTH, BASE, DEPTH, shell, 0, BASE / 2, 0);
  part(object, WIDTH * 0.86, 0.003, DEPTH * 0.42, keys, 0, BASE + 0.0015, -DEPTH * 0.12);

  // The lid turns about the back edge of the base; shut, it lies on the keys facing down.
  const hinge = new THREE.Group();
  hinge.position.set(0, BASE + 0.002, -DEPTH / 2);
  object.add(hinge);
  part(hinge, WIDTH, LID, DEPTH, shell, 0, LID / 2, DEPTH / 2);
  const display = part(hinge, WIDTH * 0.9, 0.001, DEPTH * 0.86, screen, 0, -0.0006, DEPTH / 2);
  display.castShadow = false;
  // Scrolls while it is drawn: a line comes up, eased, every LINE_SECONDS, out of step with others.
  const start = Math.random() * 100;
  display.onBeforeRender = () => {
    if (screen.emissiveIntensity <= 0) return;
    const lines = (performance.now() / 1000 + start) / LINE_SECONDS;
    const whole = Math.floor(lines);
    const into = Math.min(1, (lines - whole) * 4);
    code.offset.y = -(whole + into * into * (3 - 2 * into)) / PAGE_LINES;
  };

  return {
    object,
    setOpen: (amount) => {
      const eased = amount * amount * (3 - 2 * amount);
      hinge.rotation.x = -OPEN_ANGLE * eased;
      // The screen wakes once the lid is most of the way up.
      screen.emissiveIntensity = 0.9 * Math.max(0, (eased - 0.45) / 0.55);
    },
  };
}
