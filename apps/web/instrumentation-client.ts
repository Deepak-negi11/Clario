import posthog from "posthog-js";

// PostHog product analytics. Runs once in the browser before the app starts.
// The key is the PostHog project's public key (phc_...), so it is fine in the browser.
// Events go through /ingest on our own site (see next.config.js) so ad blockers don't drop them.
const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;

if (key) {
  posthog.init(key, {
    api_host: "/ingest",
    ui_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.posthog.com",
    defaults: "2026-01-30",
    // Only people who sign in get a profile; visitors stay anonymous.
    person_profiles: "identified_only",
  });
}
