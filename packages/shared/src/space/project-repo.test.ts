import { describe, expect, test } from "bun:test";
import { parseProjectRepo, parseSiteUrl } from "./project-repo";

describe("parseProjectRepo", () => {
  test("takes owner/repo from a link or a bare name, and nothing else", () => {
    expect(parseProjectRepo("https://github.com/vercel/next.js/tree/canary/packages")).toEqual({ owner: "vercel", repo: "next.js" });
    expect(parseProjectRepo(" vercel/next.js ")).toEqual({ owner: "vercel", repo: "next.js" });
    expect(parseProjectRepo("https://gitlab.com/acme/app")).toBeNull();
    expect(parseProjectRepo("")).toBeNull();
  });
});

describe("parseSiteUrl", () => {
  test("accepts public https sites, with or without the scheme", () => {
    expect(parseSiteUrl("https://nextjs.org")).toBe("https://nextjs.org/");
    expect(parseSiteUrl("nextjs.org/docs?x=1#top")).toBe("https://nextjs.org/docs");
    expect(parseSiteUrl("  https://Example.COM/a b ")).toBeNull(); // a space inside
    expect(parseSiteUrl("https://example.com:443/")).toBe("https://example.com/");
  });

  test("refuses other schemes, ports, credentials, bare names and IP addresses", () => {
    for (const bad of [
      "http://example.com",
      "ftp://example.com",
      "javascript:alert(1)",
      "file:///etc/passwd",
      "https://example.com:8443",
      "https://user:pass@example.com",
      "https://localhost",
      "https://intranet",
      "https://127.0.0.1",
      "https://[::1]/",
      "https://10.0.0.5",
      "https://169.254.169.254/latest/meta-data",
      "https://exa\nmple.com",
      `https://${"a".repeat(300)}.com`,
      "",
    ])
      expect(parseSiteUrl(bad)).toBeNull();
  });
});
