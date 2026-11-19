import { expect, expectToast, startDemo, test } from "./fixtures";

/** デモの基本の流れ：不足を見つける → 発注提案 → 発注書 → PDF → 発注 → 入荷 → 在庫に反映 */
test("在庫不足から発注・入荷までの一連の流れ", async ({ page }) => {
  await startDemo(page, "staff");

  // 1. ダッシュボードで不足に気づく
  await expect(page.getByRole("heading", { name: "要対応" })).toBeVisible();
  await page.goto("/inventory?q=PP-0002");
  const row = page.getByRole("row").filter({ hasText: "塩ビ管 VP20（4m）" });
  await expect(row).toContainText("在庫不足");
  await expect(row).toContainText("8本");

  // 2. 発注提案（推奨数 22）
  await page.goto("/orders/suggest");
  const sug = page.locator("tr, li").filter({ hasText: "塩ビ管 VP20（4m）" }).first();
  await expect(sug.getByRole("textbox").or(sug.getByRole("spinbutton")).first()).toHaveValue("22");

  // 3. 発注書（下書き）を作る。仕入先ごとに分かれる
  await page.getByRole("button", { name: "発注書を作成" }).click();
  await expectToast(page, /発注書/);
  await page.waitForURL(/\/orders/);
  if (!/\/orders\/[0-9a-f-]{36}/.test(page.url())) {
    await page.locator('a[href^="/orders/"]').filter({ hasText: "PO-" }).first().click();
    await page.waitForURL(/\/orders\/[0-9a-f-]{36}/);
  }

  // 4. PDF
  const pdf = await page.request.get(page.url().replace("/orders/", "/api/orders/") + "/pdf");
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");

  // 5. 発注 → 入荷
  await page.getByRole("button", { name: "発注済にする" }).click();
  await expect(page.getByRole("button", { name: "入荷を登録" })).toBeVisible();
  await page.getByRole("button", { name: "入荷を登録" }).click();
  await expect(page.getByText("入荷完了").first()).toBeVisible();
});

test("商品の詳細から入庫すると、在庫が増えて状態が正常に戻る", async ({ page }) => {
  await startDemo(page, "admin");
  await page.goto("/inventory?q=PP-0002");
  await page.getByRole("link", { name: "塩ビ管 VP20（4m）" }).first().click();
  await page.waitForURL(/\/inventory\/[0-9a-f-]{36}/);
  await page.getByRole("button", { name: /塩ビ管 VP20（4m） を入庫|^入庫$/ }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("数量").fill("22");
  await dialog.getByRole("button", { name: "入庫を登録" }).click();
  await expectToast(page, /入庫しました（塩ビ管 VP20（4m） \+22本・在庫 30本）/);
  await page.goto("/inventory?q=PP-0002");
  await expect(page.getByRole("row").filter({ hasText: "塩ビ管 VP20（4m）" })).toContainText("正常");
});
