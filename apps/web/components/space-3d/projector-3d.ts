import * as THREE from "three";

// The meeting-room projector: a pull-down screen on the wall and a projector on the meeting table.
// While someone in that room shares their screen, it plays on the screen with a beam from the
// projector (hooks/use-projector.ts picks whose). A shared screen is a MediaStream from this page,
// so unlike the YouTube TV (components/tv/tv-screen-3d.ts) it goes straight into a video texture.
//
// office-scene.ts builds one with makeProjector for a "projector" wall decor (lib/maps/clario-hq.ts);
// office-3d.tsx calls attachProjectors and updates it every frame with what's being shown.

// What a room's projector shows: a stream, for the room with these bounds (in tiles).
export type ProjectorFeed = { stream: MediaStream; room: { x: number; y: number; width: number; height: number } };

type Parts = {
  group: THREE.Group;
  // A tile just inside the room, to tell which room this projector is in.
  tile: { x: number; y: number };
  picture: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  beam: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  led: THREE.MeshStandardMaterial;
  lens: THREE.Vector3;
  screen: { width: number; height: number; center: THREE.Vector3 };
  // The picture shape the picture and beam were last sized for.
  fitted: number;
};

const SCREEN_MAX_WIDTH = 2.7;
const SCREEN_HEIGHT = 1.2;
const TABLE_TOP = 0.75;
// The projector sits on the meeting table, this far out from the wall.
const THROW = 4.45;
const LED_IDLE = new THREE.Color("#e0a33a");
const LED_ON = new THREE.Color("#4cd97b");

const matte = (color: string) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05 });

// `cx` and `width` along the wall, `faceZ` its face, `wallHeight` its height; the room is on the +z side.
export function makeProjector(cx: number, width: number, faceZ: number, wallHeight: number) {
  const group = new THREE.Group();
  const screenWidth = Math.min(width * 0.9, SCREEN_MAX_WIDTH);
  const top = wallHeight - 0.14;
  const center = new THREE.Vector3(cx, top - 0.06 - SCREEN_HEIGHT / 2, faceZ + 0.05);

  // The roller case along the top, the screen hanging from it, and the weighted bar with its pull tab.
  const caseMaterial = matte("#3a3f4b");
  const rollerCase = new THREE.Mesh(new THREE.BoxGeometry(screenWidth + 0.22, 0.12, 0.14), caseMaterial);
  rollerCase.position.set(cx, top, faceZ + 0.08);
  const endCaps = [-1, 1].map((side) => {
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.16), matte("#2b2f38"));
    cap.position.set(cx + side * (screenWidth / 2 + 0.12), top, faceZ + 0.08);
    return cap;
  });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(screenWidth, SCREEN_HEIGHT), matte("#f1efe9"));
  screen.position.copy(center);
  // A black border round the picture area, as projector screens have.
  const border = new THREE.Mesh(new THREE.PlaneGeometry(screenWidth, SCREEN_HEIGHT), new THREE.MeshBasicMaterial({ color: "#1d1f24" }));
  border.position.copy(center).setZ(center.z - 0.004);
  border.scale.set(1.02, 1.03, 1);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(screenWidth + 0.04, 0.04, 0.05), caseMaterial);
  bar.position.set(cx, center.y - SCREEN_HEIGHT / 2 - 0.01, faceZ + 0.06);
  const tab = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.02), caseMaterial);
  tab.position.set(cx, center.y - SCREEN_HEIGHT / 2 - 0.09, faceZ + 0.06);

  // What's projected: sized to the stream's shape within the screen once it's playing.
  const picture = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false }));
  picture.position.copy(center).setZ(center.z + 0.004);
  picture.visible = false;

  // The projector, its lens towards the wall, with a status light on top.
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.13, 0.34), matte("#d8dbe1"));
  const z = faceZ + THROW;
  body.position.set(cx, TABLE_TOP + 0.08, z);
  const feet = [-0.15, 0.15].map((x) => {
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.02, 12), matte("#30343d"));
    foot.position.set(cx + x, TABLE_TOP + 0.01, z);
    return foot;
  });
  const lensHousing = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.075, 0.05, 24), matte("#30343d"));
  lensHousing.rotation.x = Math.PI / 2;
  lensHousing.position.set(cx - 0.08, TABLE_TOP + 0.08, z - 0.19);
  const glass = new THREE.Mesh(new THREE.CircleGeometry(0.05, 24), new THREE.MeshStandardMaterial({ color: "#1b2a3a", roughness: 0.1, metalness: 0.6 }));
  glass.rotation.y = Math.PI;
  glass.position.set(cx - 0.08, TABLE_TOP + 0.08, z - 0.216);
  const led = new THREE.MeshStandardMaterial({ color: LED_IDLE, emissive: LED_IDLE, emissiveIntensity: 0.8 });
  const ledDot = new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 8), led);
  ledDot.position.set(cx + 0.14, TABLE_TOP + 0.147, z - 0.1);
  const vent = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.004, 0.12), matte("#b9bdc6"));
  vent.position.set(cx + 0.08, TABLE_TOP + 0.147, z + 0.04);

  // The light from the lens to the picture's corners, faint, only while something is showing.
  const beam = new THREE.Mesh(
    new THREE.BufferGeometry(),
    new THREE.MeshBasicMaterial({
      color: "#fff6dc",
      transparent: true,
      opacity: 0.07,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    }),
  );
  beam.visible = false;
  beam.renderOrder = 2;

  group.add(rollerCase, ...endCaps, border, screen, bar, tab, picture, body, ...feet, lensHousing, glass, ledDot, vent, beam);
  const parts: Parts = {
    group,
    tile: { x: Math.floor(cx), y: Math.round(faceZ + 0.05) },
    picture,
    beam,
    led,
    lens: new THREE.Vector3(cx - 0.08, TABLE_TOP + 0.08, z - 0.22),
    screen: { width: screenWidth, height: SCREEN_HEIGHT, center },
    fitted: 0,
  };
  group.userData.projector = parts;
  return group;
}

// Sizes the picture to the video's shape within the screen, and the beam to the picture.
function fitPicture(parts: Parts, aspect: number) {
  const { width, height, center } = parts.screen;
  const pictureWidth = Math.min(width, height * aspect);
  const pictureHeight = pictureWidth / aspect;
  parts.fitted = aspect;
  parts.picture.scale.set(pictureWidth, pictureHeight, 1);

  const { x, y } = center;
  const z = parts.picture.position.z;
  const corners = [
    [x - pictureWidth / 2, y - pictureHeight / 2],
    [x + pictureWidth / 2, y - pictureHeight / 2],
    [x + pictureWidth / 2, y + pictureHeight / 2],
    [x - pictureWidth / 2, y + pictureHeight / 2],
  ];
  const apex = parts.lens;
  const positions: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = corners[i]!;
    const [bx, by] = corners[(i + 1) % 4]!;
    positions.push(apex.x, apex.y, apex.z, ax!, ay!, z, bx!, by!, z);
  }
  parts.beam.geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  parts.beam.geometry.computeBoundingSphere();
}

export type Projectors3d = {
  update: (feed: ProjectorFeed | null) => void;
  dispose: () => void;
};

const inside = (tile: { x: number; y: number }, room: ProjectorFeed["room"]) =>
  tile.x >= room.x && tile.x < room.x + room.width && tile.y >= room.y && tile.y < room.y + room.height;

export function attachProjectors(scene: THREE.Object3D): Projectors3d {
  let found: Parts[] = [];
  let searchedAt = -Infinity;
  // The office can be rebuilt (a custom map's edits): look again once a found projector is gone,
  // and now and then while there's none.
  const projectors = () => {
    const now = performance.now();
    const stale = found.length > 0 ? found.some((parts) => !parts.group.parent) : now - searchedAt > 1000;
    if (stale) {
      searchedAt = now;
      found = [];
      scene.traverse((object) => {
        const parts = object.userData.projector as Parts | undefined;
        if (parts) found.push(parts);
      });
    }
    return found;
  };

  // One video for the room you're in. It stays in the page (tiny and see-through), because some
  // browsers stop decoding a video that isn't.
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.autoplay = true;
  Object.assign(video.style, { position: "fixed", left: "0", top: "0", width: "2px", height: "2px", opacity: "0", pointerEvents: "none" });
  video.setAttribute("aria-hidden", "true");
  document.body.append(video);
  const texture = new THREE.VideoTexture(video);
  texture.colorSpace = THREE.SRGBColorSpace;
  let stream: MediaStream | null = null;
  let aspect = 0;

  const show = (parts: Parts, on: boolean) => {
    const live = on && aspect > 0;
    if (live && parts.picture.material.map !== texture) {
      parts.picture.material.map = texture;
      parts.picture.material.needsUpdate = true;
    }
    if (live && parts.fitted !== aspect) fitPicture(parts, aspect);
    parts.picture.visible = live;
    parts.beam.visible = live;
    parts.led.color.copy(live ? LED_ON : LED_IDLE);
    parts.led.emissive.copy(live ? LED_ON : LED_IDLE);
  };

  return {
    update(feed) {
      const next = feed?.stream ?? null;
      if (next !== stream) {
        stream = next;
        aspect = 0;
        video.srcObject = next;
        if (next) void video.play().catch(() => {});
      }
      // A shared screen can change shape (another window, a resized one).
      if (stream && video.videoWidth > 0) aspect = video.videoWidth / video.videoHeight;
      for (const parts of projectors()) show(parts, !!feed && inside(parts.tile, feed.room));
    },
    dispose() {
      video.pause();
      video.srcObject = null;
      video.remove();
      texture.dispose();
      for (const parts of found) show(parts, false);
    },
  };
}
