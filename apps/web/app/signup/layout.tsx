import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Create an account",
  description: "Create your Clario account and start a shared spatial workspace.",
  robots: {
    index: false,
    follow: true,
  },
};

export default function SignUpLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
