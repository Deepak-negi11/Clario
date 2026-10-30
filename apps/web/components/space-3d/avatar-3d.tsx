"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { AvatarBase, AvatarLook } from "@repo/shared";
import { loadPeople, makePerson, type PeopleKit, type Person } from "./people";

// Your avatar as the 3D view shows it, for the avatar picker on 3D maps: the person turning
// slowly in their idle, and a head-and-shoulders picture of each style for the style buttons.

// The people models load once per page, for every picker that opens.
let kitPromise: Promise<PeopleKit> | null = null;
const kit = () => (kitPromise ??= loadPeople().catch((error: unknown) => {
  kitPromise = null;
  throw error;
}));

function makeRenderer(canvas?: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  return renderer;
}

function makeStage() {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight("#ffffff", "#8a7a62", 1.1));
  const key = new THREE.DirectionalLight("#fff1dc", 2.4);
  key.position.set(1.5, 3, 3);
  const rim = new THREE.DirectionalLight("#cfe4f2", 1.2);
  rim.position.set(-2, 2, -2);
  scene.add(key, rim);
  return scene;
}

function personFor(people: PeopleKit, look: AvatarLook) {
  const person = makePerson(people, "you", look.top, { look });
  person.update(0, 0, 0);
  return person;
}

// The whole person, turning slowly (still, for people who ask for less motion).
export function Avatar3D({ look, onThumbs, onError }: {
  look: AvatarLook;
  // Pictures of you in each style, for the style buttons, as data URLs.
  onThumbs?: (thumbs: Partial<Record<AvatarBase, string>>) => void;
  onError?: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lookRef = useRef(look);
  const show = useRef<((look: AvatarLook) => void) | null>(null);
  const thumbsRef = useRef(onThumbs);
  thumbsRef.current = onThumbs;
  const errorRef = useRef(onError);
  errorRef.current = onError;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    let frame = 0;
    const renderer = makeRenderer(canvas);
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    const scene = makeStage();
    const camera = new THREE.PerspectiveCamera(28, canvas.clientWidth / canvas.clientHeight, 0.1, 20);
    camera.position.set(0, 0.95, 3.9);
    camera.lookAt(0, 0.72, 0);

    // The style pictures: a second, small renderer off the page, so the main one never flickers.
    const thumbRenderer = makeRenderer();
    thumbRenderer.setPixelRatio(2);
    thumbRenderer.setSize(56, 56);
    const thumbCamera = new THREE.PerspectiveCamera(26, 1, 0.1, 20);
    thumbCamera.position.set(0, 1.3, 1.5);
    thumbCamera.lookAt(0, 1.16, 0);

    let person: Person | null = null;
    let people: PeopleKit | null = null;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const snapshots = (current: AvatarLook) => {
      if (!people || !thumbsRef.current) return;
      const bases: AvatarBase[] = ["adam", "amelia", "bob"];
      if (person) scene.remove(person.root);
      const out: Partial<Record<AvatarBase, string>> = {};
      for (const base of bases) {
        const sample = personFor(people, { ...current, base });
        sample.root.rotation.y = 0.35;
        scene.add(sample.root);
        thumbRenderer.render(scene, thumbCamera);
        out[base] = thumbRenderer.domElement.toDataURL("image/png");
        scene.remove(sample.root);
        sample.dispose();
      }
      if (person) scene.add(person.root);
      thumbsRef.current(out);
    };
    // Dragging a colour picker changes the look many times a second; the pictures wait for a pause.
    let snapshotTimer = 0;
    const snapshotSoon = (current: AvatarLook) => {
      window.clearTimeout(snapshotTimer);
      snapshotTimer = window.setTimeout(() => !disposed && snapshots(current), 150);
    };

    show.current = (next) => {
      if (!people) return;
      const turn = person?.root.rotation.y ?? 0.35;
      if (person) {
        scene.remove(person.root);
        person.dispose();
      }
      person = personFor(people, next);
      person.root.rotation.y = turn;
      scene.add(person.root);
      snapshotSoon(next);
    };

    kit()
      .then((loaded) => {
        if (disposed) return;
        people = loaded;
        show.current?.(lookRef.current);
      })
      .catch(() => {
        if (!disposed) errorRef.current?.();
      });

    const clock = new THREE.Clock();
    const tick = () => {
      frame = requestAnimationFrame(tick);
      const dt = Math.min(clock.getDelta(), 0.1);
      if (person) {
        person.update(still ? 0 : dt, 0, 0);
        if (!still) person.root.rotation.y = 0.35 + Math.sin(clock.elapsedTime * 0.6) * 0.6;
      }
      renderer.render(scene, camera);
    };
    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      window.clearTimeout(snapshotTimer);
      show.current = null;
      person?.dispose();
      renderer.dispose();
      thumbRenderer.dispose();
    };
  }, []);

  // A new look: rebuild the person (and the style pictures) in it.
  useEffect(() => {
    lookRef.current = look;
    show.current?.(look);
  }, [look]);

  return <canvas ref={canvasRef} role="img" aria-label="Your avatar in 3D" className="h-full w-full" />;
}
