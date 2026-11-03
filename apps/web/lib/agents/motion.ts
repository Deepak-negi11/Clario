let preference: MediaQueryList | undefined;
export function reducedAgentMotion() {
  if (typeof window === "undefined") return true;
  preference ??= window.matchMedia("(prefers-reduced-motion: reduce)");
  return preference.matches;
}
