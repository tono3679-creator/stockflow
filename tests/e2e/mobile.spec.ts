import { expect, expectToast, startDemo, test } from "./fixtures";

test("@mobile スマホで入出庫を登録できる（下のメニューから）", async ({ page }) => {
  await startDemo(page, "staff");
  const nav = page.getByRole("navigation", { name: "メインメニュー" }).last();
  await nav.getByRole("link", { name: "入出庫" }).click();
  await page.getByRole("link", { name: /入出庫を登録|登録/ }).first().click().catch(() => page.goto("/movements/new"));
  await page.waitForURL(/\/movements\/new/);
  await page.getByRole("radio", { name: "出庫" }).click();
  await page.getByPlaceholder("商品名・コードで検索").fill("VP20");
  await page.getByRole("option").first().click();
  await expect(page.getByText("現在庫")).toBeVisible();
  await page.getByLabel("数量").fill("2");
  await page.getByRole("button", { name: "出庫を登録" }).click();
  await expectToast(page, /出庫しました/);
  // 横にはみ出さない
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("@mobile 在庫一覧・ダッシュボード・発注が横にはみ出さない", async ({ page }) => {
  await startDemo(page, "admin");
  for (const path of ["/dashboard", "/inventory", "/orders", "/orders/suggest", "/reports", "/import", "/settings"]) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});
