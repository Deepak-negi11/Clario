import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Practice with Maya",
  description: "Ask Maya, an AI mentor, about workplace messages by typing or talking.",
  robots: {
    index: false,
    follow: false,
    noarchive: true,
  },
};

export default function PracticeLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
