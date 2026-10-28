import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Workplace Quest missions",
  description: "Practise workplace messages with fictional coworkers and get feedback on clarity, completeness, tone and next action.",
  robots: {
    index: false,
    follow: false,
    noarchive: true,
  },
};

export default function MissionsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
