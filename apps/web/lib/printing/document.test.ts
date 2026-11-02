import { expect, test } from "bun:test";
import { PRINT_FILE_LIMIT, printableFileError } from "./document";
test("print documents accept bounded local text and safe image formats only", () => {
  for (const type of ["text/plain", "image/png", "image/jpeg", "image/webp"])
    expect(printableFileError({ type, size: PRINT_FILE_LIMIT })).toBeNull();
  expect(printableFileError({ type: "text/html", size: 1 })).toBeTruthy();
  expect(printableFileError({ type: "image/svg+xml", size: 1 })).toBeTruthy();
  expect(
    printableFileError({ type: "image/png", size: PRINT_FILE_LIMIT + 1 }),
  ).toBeTruthy();
});
