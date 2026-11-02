export const smooth = (value: number) => { const t = Math.min(1, Math.max(0, value)); return t * t * (3 - 2 * t); };
// Raise, pause at the mouth, lower. Both maps use the same timing and easing.
export function sipLift(progress: number) {
  if (progress <= 0 || progress >= 1) return 0;
  if (progress < 0.3) return smooth(progress / 0.3);
  if (progress < 0.7) return 1;
  return smooth((1 - progress) / 0.3);
}
export const damp = (value: number, target: number, rate: number, dt: number) => value + (target - value) * (1 - Math.exp(-Math.max(0, dt) * rate));
