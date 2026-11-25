import type { Metadata } from "next";
import { Atkinson_Hyperlegible_Next, Bagel_Fat_One } from "next/font/google";
import "./globals.css";

// Bagel Fat One is the wordmark face only (the app name and Chef's name).
const bagel = Bagel_Fat_One({
  variable: "--font-bagel",
  subsets: ["latin"],
  weight: "400",
});

// Everything else, headings included: built for legibility, which matters on a phone in a store aisle.
const atkinson = Atkinson_Hyperlegible_Next({
  variable: "--font-atkinson",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Common Thyme",
  description: "Chef plans your week of dinners so the groceries carry across nights.",
  // Name under the icon when added to an iPhone home screen (otherwise iOS uses the page title).
  // Set directly rather than via appleWebApp, which would also make the home-screen app
  // open full-screen without Safari's bar.
  other: { "apple-mobile-web-app-title": "Common Thyme" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${bagel.variable} ${atkinson.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-cream text-ink">{children}</body>
    </html>
  );
}
