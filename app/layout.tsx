import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NMRView · Imaging & Spectroscopy",
  description:
    "A browser workstation for MRI volumes and NMR spectroscopy. Local data processing, layered views, and research tools.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
