import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Your spaces",
  description: "Manage your private Clario spaces.",
  robots: {
    index: false,
    follow: false,
    noarchive: true,
  },
};

export default function SpacesLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
