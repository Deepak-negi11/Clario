export const PRINT_TEXT_LIMIT = 40_000;
export const PRINT_FILE_LIMIT = 8 * 1024 * 1024;
export const PRINT_FILE_TYPES = [
  "text/plain",
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;
export function printableFileError(file: { size: number; type: string }) {
  if (!PRINT_FILE_TYPES.some((type) => type === file.type))
    return "Choose a text file, PNG, JPEG or WebP image.";
  if (file.size > PRINT_FILE_LIMIT) return "Choose a file smaller than 8 MB.";
  return null;
}
