import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Workspace preview",
  robots: {
    index: false,
    follow: false,
    noarchive: true,
  },
};

export default function PhaserLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
