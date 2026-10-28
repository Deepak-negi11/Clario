"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import posthog from "posthog-js";

const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST;

function analyticsAllowed() {
  return typeof navigator === "undefined" || navigator.doNotTrack !== "1";
}

export function PostHogProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();

  useEffect(() => {
    if (!posthogKey || !posthogHost || !analyticsAllowed() || posthog.__loaded) return;

    posthog.init(posthogKey, {
      api_host: posthogHost,
      capture_pageview: false,
      capture_pageleave: true,
      autocapture: false,
      disable_session_recording: true,
      person_profiles: "identified_only",
      persistence: "localStorage+cookie",
      respect_dnt: true,
    });
  }, []);

  useEffect(() => {
    if (!posthog.__loaded || !analyticsAllowed()) return;

    const url = `${window.location.origin}${pathname}`;
    posthog.capture("$pageview", { $current_url: url });
  }, [pathname]);

  return children;
}
