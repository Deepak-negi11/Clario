export type Dimensions = {
  width: number;
  height: number;
};



export function parseDimensions(value: string): Dimensions | null {
  const parts = value.split("x");
  if (parts.length !== 2) return null;

  const [width, height] = parts.map(Number);
  if (width === undefined || height === undefined) return null;
  if (!Number.isInteger(width) || !Number.isInteger(height)) return null;
  if (width <= 0 || height <= 0) return null;

  return { width, height };
}

export function formatDimensions(dimensions: Dimensions) {
  return `${dimensions.width}x${dimensions.height}`;
}
