"use client";

import Image from "next/image";
import { agentArtPath, agentKind } from "../../lib/agents/identity";

// Shared vector artwork stays sharp on cards and respects reduced motion inside each SVG.
// Keep this component name for existing callers; all three live agent identities are supported.
export function PixelPet({
  running = false,
  size = 64,
  agent,
}: {
  running?: boolean;
  size?: number;
  agent?: string | null;
}) {
  return (
    <Image
      src={agentArtPath(agentKind(agent), running)}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      style={{ width: size, height: size }}
      loading="eager"
      unoptimized
      className="shrink-0 object-contain"
      draggable={false}
    />
  );
}
