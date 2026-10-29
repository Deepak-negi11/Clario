import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Game Room",
  description: "Ping-pong, Breakout and Snake from the office Game Room, and the Lounge TV.",
  robots: {
    index: false,
    follow: false,
    noarchive: true,
  },
};

export default function ArcadeLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
