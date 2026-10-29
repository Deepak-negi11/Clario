import type { YouTubeVideo } from "@repo/shared";

// Videos the Lounge TV offers before anyone pastes a link. Each id was checked against YouTube's
// oEmbed endpoint on 2026-10-29 (title and channel below are what it returned, shortened).
export const TV_SUGGESTIONS: (YouTubeVideo & { title: string; by: string })[] = [
  { id: "arj7oStGLkU", title: "Inside the mind of a master procrastinator", by: "Tim Urban, TED" },
  { id: "iG9CE55wbtY", title: "Do schools kill creativity?", by: "Sir Ken Robinson, TED" },
  { id: "UF8uR6Z6KLc", title: "2005 Stanford commencement address", by: "Steve Jobs, Stanford" },
  { id: "aqz-KE-bpKQ", title: "Big Buck Bunny", by: "Blender Foundation" },
];
