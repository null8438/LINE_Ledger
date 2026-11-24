import type { Metadata, Viewport } from "next";
import { AuthProvider } from "@/lib/client";
import "./globals.css";

export const metadata: Metadata = {
  title: "旅の会計",
  description: "LINEグループで使える旅行の割り勘・精算アプリ",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#06c755",
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <AuthProvider liffId={process.env.LIFF_ID ?? process.env.NEXT_PUBLIC_LIFF_ID ?? ""}>{children}</AuthProvider>
      </body>
    </html>
  );
}
