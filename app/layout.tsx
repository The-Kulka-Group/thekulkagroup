import type { Metadata } from "next";
import { Open_Sans } from "next/font/google";
import "@/daylight.css";

// Open Sans is the client's own brand family: 400 reads, 600 acts, 700 heads
// sections, 800 is the Kulka voice on the wordmark and sheet titles.
const openSans = Open_Sans({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
  display: "swap",
  variable: "--font-open-sans",
});

export const metadata: Metadata = {
  title: "Kulka AI",
  description: "Business development for The Kulka Group.",
  // robots.txt asks crawlers not to fetch the site. This is the backstop for
  // any crawler that fetches anyway but honours the tag.
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={openSans.variable}>
      <body>{children}</body>
    </html>
  );
}
