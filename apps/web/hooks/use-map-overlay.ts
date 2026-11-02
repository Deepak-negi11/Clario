"use client";
import { useEffect, type RefObject } from "react";
import type { SceneBridge } from "../components/phaser/scene-bridge";

// More than one overlay may be open. Closing one must not re-enable movement beneath another.
export function useMapOverlay(
  bridgeRef: RefObject<SceneBridge> | undefined,
  name: string,
  active = true,
) {
  useEffect(() => {
    if (!active || !bridgeRef) return;
    const bridge = bridgeRef.current;
    bridge.mapOverlays ??= new Set();
    bridge.mapOverlays.add(name);
    bridge.setKeyboardEnabled?.(false);
    return () => {
      bridge.mapOverlays?.delete(name);
      if (!bridge.mapOverlays?.size) bridge.setKeyboardEnabled?.(true);
    };
  }, [bridgeRef, name, active]);
}
