import type { MetadataRoute } from "next";
import { SITE_NAME } from "../lib/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE_NAME} — Virtual office for remote teams`,
    short_name: SITE_NAME,
    description: "Walk around a 2D or 3D office, talk to teammates nearby, chat, play games and ask AI coworkers for help.",
    start_url: "/",
    display: "standalone",
    background_color: "#fbfbfa",
    theme_color: "#fbfbfa",
    // Android and Chrome need PNG icons to offer "Install app"; the SVG stays for sharp desktop tabs.
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/clario-mark.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
