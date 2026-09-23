import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Saarthi — Personal Life OS",
  description:
    "Wealth, Growth and Reflection in one calm place. Track accounts, FDs, bills and spending; build habits and reflect daily.",
  keywords: ["personal finance", "life OS", "habits", "journal", "FD tracker", "India"],
  applicationName: "Saarthi",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icon.svg" }],
  },
  appleWebApp: {
    capable: true,
    title: "Saarthi",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f9f9" },
    { media: "(prefers-color-scheme: dark)", color: "#171b1e" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased bg-background text-foreground">{children}</body>
    </html>
  );
}
