/**
 * 画面のスクリーンショットを撮る（紹介ページの画像と README 用）。
 * 先に `npm run dev`（または build → start）でアプリを起動してから実行する。
 *   npm run screenshots              → public/screens/ と docs/screenshots/ に保存
 *   BASE_URL=https://… npm run screenshots
 */
import { mkdirSync } from "node:fs";
import { chromium, type Browser, type Page } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

async function login(browser: Browser, mobile: boolean): Promise<Page> {
  const ctx = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    deviceScaleFactor: mobile ? 2 : 1,
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await page.getByRole("button", { name: /管理者で試す/ }).click();
  await page.waitForURL("**/dashboard", { timeout: 60_000 });
  return page;
}

async function shot(page: Page, path: string, file: string, fullPage = false) {
  await page.goto(`${BASE}${path}`);
  await page.waitForLoadState("networkidle");
  // Next.js の開発用インジケーターを隠す
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  await page.screenshot({ path: file, fullPage });
  console.log("saved", file);
}

async function main() {
  mkdirSync("public/screens", { recursive: true });
  mkdirSync("docs/screenshots", { recursive: true });
  const browser = await chromium.launch();
  try {
    const pc = await login(browser, false);
    await shot(pc, "/dashboard", "public/screens/dashboard.png");
    await shot(pc, "/dashboard", "docs/screenshots/dashboard.png");
    await shot(pc, "/inventory", "docs/screenshots/inventory.png");
    await shot(pc, "/orders/suggest", "docs/screenshots/order-suggest.png");
    await shot(pc, "/reports", "docs/screenshots/reports.png", true);
    await shot(pc, "/import", "docs/screenshots/import.png");
    const sp = await login(browser, true);
    await shot(sp, "/movements/new", "public/screens/mobile-movement.png");
    await shot(sp, "/movements/new", "docs/screenshots/mobile-movement.png");
    await shot(sp, "/inventory", "docs/screenshots/mobile-inventory.png");
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
