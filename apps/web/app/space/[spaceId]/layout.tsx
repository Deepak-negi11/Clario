import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Workspace",
  description: "A private Clario workspace.",
  robots: {
    index: false,
    follow: false,
    noarchive: true,
  },
};

export default function SpaceLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
