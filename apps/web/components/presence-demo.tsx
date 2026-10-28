"use client";

import Image from "next/image";
import { useState, type CSSProperties } from "react";

const places = [
  { id: "focus", label: "Focus", detail: "A quiet desk", x: "14cqw", y: "26cqw" },
  { id: "table", label: "Meet", detail: "The shared table", x: "42cqw", y: "35cqw" },
  { id: "lounge", label: "Pause", detail: "A softer corner", x: "73cqw", y: "29cqw" },
] as const;

type PlaceId = (typeof places)[number]["id"];

export function PresenceDemo() {
  const [activeId, setActiveId] = useState<PlaceId>("focus");
  const activePlace = places.find((place) => place.id === activeId) ?? places[0];

  return (
    <section className="presence-demo" aria-label="Interactive workspace preview">
      <div className="presence-demo__topline">
        <span>Move through the day</span>
        <span className="presence-demo__status"><i aria-hidden="true" />You&apos;re here</span>
      </div>

      <div className="presence-demo__scene" aria-live="polite">
        <div className="presence-demo__focus" aria-hidden="true">
          <Image src="/assets/furniture/piece_6.png" alt="" width={100} height={112} />
        </div>
        <div className="presence-demo__table" aria-hidden="true">
          <Image src="/assets/furniture/sub/table-big.png" alt="" width={76} height={74} />
          <Image src="/assets/furniture/sub/chair-wood.png" alt="" width={26} height={42} />
          <Image src="/assets/furniture/sub/chair-wood2.png" alt="" width={26} height={42} />
        </div>
        <div className="presence-demo__lounge" aria-hidden="true">
          <Image src="/assets/furniture/piece_8.png" alt="" width={136} height={72} />
          <Image src="/assets/furniture/sub/pot-2.png" alt="" width={34} height={48} />
        </div>
        <div
          className="presence-demo__avatar"
          style={{ "--avatar-x": activePlace.x, "--avatar-y": activePlace.y } as CSSProperties}
          aria-hidden="true"
        >
          <span>{activePlace.label}</span>
        </div>
      </div>

      <div className="presence-demo__controls" role="group" aria-label="Choose a workspace area">
        {places.map((place) => (
          <button
            key={place.id}
            type="button"
            aria-pressed={activeId === place.id}
            onClick={() => setActiveId(place.id)}
          >
            <span>{place.label}</span>
            <small>{place.detail}</small>
          </button>
        ))}
      </div>
    </section>
  );
}
