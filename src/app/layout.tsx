import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import "@fontsource/noto-sans-jp/400.css";
import "@fontsource/noto-sans-jp/500.css";
import "@fontsource/noto-sans-jp/700.css";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "StockFlow｜在庫・発注管理", template: "%s | StockFlow" },
  description: "在庫確認から発注までを、少ない操作で。中小企業向けの在庫・発注管理システム。",
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // ページは毎回サーバーで描画する（ログイン状態で内容が変わり、CSP の nonce をスクリプトに付けるため）
  await connection();
  return (
    <html lang="ja">
      <body>
        <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
        <Toaster />
      </body>
    </html>
  );
}
