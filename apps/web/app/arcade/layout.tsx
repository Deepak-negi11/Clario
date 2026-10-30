import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Game Room",
  description: "Ping-pong, Breakout, Snake and Chair Sumo from the office Game Room.",
  robots: {
    index: false,
    follow: false,
    noarchive: true,
  },
};

export default function ArcadeLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
