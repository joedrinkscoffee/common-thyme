import type { Metadata } from "next";
import { Bricolage_Grotesque, Inter } from "next/font/google";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  weight: ["500", "700", "800"],
});

const inter = Inter({
  variable: "--font-inter",
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
    <html lang="en" className={`${bricolage.variable} ${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-cream text-ink">{children}</body>
    </html>
  );
}
