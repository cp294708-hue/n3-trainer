import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  creator: "N3 Trainer",
  authors: [{ name: "N3 Trainer" }],
  category: "education",
  title: "30일 JLPT N3 크램 트레이너",
  description: "한국어 화자를 위한 모바일 우선 JLPT N3 합격 집중 학습 앱",
  applicationName: "N3 Cram Trainer",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, title: "N3 Trainer", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#fb923c",
  colorScheme: "light",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
