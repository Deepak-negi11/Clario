import type { Metadata } from "next";
import { DM_Serif_Display, IBM_Plex_Mono, Manrope, DM_Sans, Pixelify_Sans, Geist, Geist_Mono } from "next/font/google";
import { PostHogProvider } from "../components/analytics/posthog-provider";
import { SITE_NAME, SITE_URL } from "../lib/site";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans-google",
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-plex-mono",
  display: "swap",
  weight: ["400", "500", "600"],
});

const dmSerif = DM_Serif_Display({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  weight: "400",
});

const pixelify = Pixelify_Sans({
  subsets: ["latin"],
  variable: "--font-pixel",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

const siteUrl = new URL(SITE_URL);
const siteTitle = `${SITE_NAME} — Work together like you’re in the same room`;
const siteDescription = "A shared 2D spatial workspace where remote teams move together, talk by proximity, chat, and return to the same persistent room.";

export const metadata: Metadata = {
  metadataBase: siteUrl,
  applicationName: SITE_NAME,
  title: {
    default: siteTitle,
    template: `%s · ${SITE_NAME}`,
  },
  description: siteDescription,
  keywords: ["spatial workspace", "remote teams", "virtual office", "2D workspace", "proximity chat", "team collaboration"],
  authors: [{ name: SITE_NAME, url: siteUrl }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  category: "productivity",
  alternates: {
    canonical: "/",
  },
  icons: {
    icon: [{ url: "/clario-mark.svg", type: "image/svg+xml" }],
    shortcut: "/clario-mark.svg",
    apple: "/clario-mark.svg",
  },
  manifest: "/manifest.webmanifest",
  openGraph: {
    title: siteTitle,
    description: siteDescription,
    url: "/",
    siteName: SITE_NAME,
    locale: "en_US",
    type: "website",
    images: [{ url: "/opengraph-image.png", width: 1200, height: 630, alt: `${SITE_NAME} spatial workspace for remote teams` }],
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteDescription,
    images: ["/opengraph-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${manrope.variable} ${ibmPlexMono.variable} ${dmSerif.variable} ${dmSans.variable} ${pixelify.variable} ${geist.variable} ${geistMono.variable}`}>
        <PostHogProvider>{children}</PostHogProvider>
      </body>
    </html>
  );
}
