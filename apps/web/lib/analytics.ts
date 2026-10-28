import posthog from "posthog-js";

type AnalyticsEvent =
  | "signup_started"
  | "signup_completed"
  | "signin_completed"
  | "space_created"
  | "space_entered"
  | "message_sent"
  | "proximity_connected";

export function captureEvent(event: AnalyticsEvent) {
  if (!posthog.__loaded || navigator.doNotTrack === "1") return;
  posthog.capture(event);
}
