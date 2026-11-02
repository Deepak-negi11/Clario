import * as THREE from "three";
import { LIBRARY_BOOKS, type BookId } from "@repo/shared";
import { smooth } from "../../lib/maps/micro-motion";

export type ReadingBook = { object: THREE.Group; update: (open: number, page: number, flip: number, reduced: boolean) => void };

// A real open volume: cloth covers, cream page blocks, a spine, a ribbon and a hinged paper leaf.
export function makeReadingBook(id: BookId): ReadingBook {
  const info = LIBRARY_BOOKS[id], object = new THREE.Group();
  const cover = new THREE.MeshStandardMaterial({ color: info.color, roughness: 0.86 });
  const paper = new THREE.MeshStandardMaterial({ color: "#e7deca", roughness: 1 });
  const canvas = document.createElement("canvas"); canvas.width = 256; canvas.height = 384;
  const ctx = canvas.getContext("2d")!;
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const ink = new THREE.MeshStandardMaterial({ map: texture, roughness: 1, side: THREE.DoubleSide });
  const part = (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z = 0) => {
    const mesh = new THREE.Mesh(geo, mat); mesh.position.set(x, y, z); mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh); return mesh;
  };
  const halves = [-1, 1].map((side) => {
    const half = new THREE.Group(); object.add(half);
    part(half, new THREE.BoxGeometry(0.187, 0.009, 0.25), cover, side * 0.096, -0.016);
    part(half, new THREE.BoxGeometry(0.175, 0.019, 0.237), paper, side * 0.093, -0.004);
    const page = part(half, new THREE.PlaneGeometry(0.175, 0.237).rotateX(-Math.PI / 2), ink, side * 0.093, 0.006);
    page.castShadow = false;
    return half;
  });
  part(object, new THREE.CylinderGeometry(0.012, 0.012, 0.25, 10).rotateX(Math.PI / 2), cover, 0, -0.014);
  part(halves[1]!, new THREE.BoxGeometry(0.012, 0.002, 0.16), new THREE.MeshStandardMaterial({ color: "#bb684b", roughness: 0.8 }), 0.13, 0.009, 0.085);
  const leaf = part(object, new THREE.PlaneGeometry(0.175, 0.237).rotateX(-Math.PI / 2).translate(0.0875, 0, 0), ink, 0, 0.013);
  leaf.castShadow = false;
  let painted = -1;
  return { object, update(open, page, flip, reduced) {
    if (page !== painted) {
      painted = page;
      const content = info.pages[page] ?? info.pages[0]!;
      ctx.fillStyle = "#fbf4e3"; ctx.fillRect(0, 0, 256, 384);
      ctx.fillStyle = "#ada18b"; ctx.fillRect(18, 30, 35, 2);
      ctx.fillStyle = info.color; ctx.font = "bold 18px Georgia,serif";
      let y = 66, line = "";
      const wrap = (text: string, width: number, leading: number) => {
        line = "";
        for (const word of text.split(" ")) {
          if (line && ctx.measureText(`${line} ${word}`).width > width) { ctx.fillText(line, 20, y); y += leading; line = word; }
          else line += `${line ? " " : ""}${word}`;
        }
        ctx.fillText(line, 20, y); y += leading;
      };
      wrap(content.title, 216, 23);
      y += 12; ctx.font = "14px Georgia,serif"; ctx.fillStyle = "#696252"; wrap(content.text, 216, 21);
      ctx.textAlign = "center"; ctx.fillText(String(page + 1), 128, 365); ctx.textAlign = "left";
      texture.needsUpdate = true;
    }
    const amount = smooth(open);
    halves[0]!.rotation.z = -(1 - amount) * Math.PI / 2;
    halves[1]!.rotation.z = (1 - amount) * Math.PI / 2;
    leaf.visible = !reduced && flip > 0 && flip < 1 && open > 0.7;
    leaf.rotation.z = smooth(flip) * Math.PI;
  } };
}
