import { expect, startDemo, switchPersona, test } from "./fixtures";

test("閲覧者は入出庫・発注・マスタ・設定の操作ができない", async ({ page }) => {
  await startDemo(page, "viewer");
  await page.goto("/inventory");
  await expect(page.getByRole("button", { name: /を出庫$/ })).toHaveCount(0);
  for (const path of ["/settings", "/import", "/products/new", "/movements/new", "/orders/new"]) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/dashboard\?denied=1$/);
  }
  // CSV の出力（閲覧）はできる
  expect((await page.request.get("/api/export/inventory")).status()).toBe(200);
});

test("担当者は入出庫・発注はできるが、設定・CSV取込は開けない。管理者は開ける", async ({ page }) => {
  await startDemo(page, "staff");
  for (const path of ["/settings", "/import", "/products/new"]) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/denied=1/);
  }
  await page.goto("/movements/new");
  await expect(page.getByRole("heading", { name: "入出庫登録" })).toBeVisible();
  await switchPersona(page, "admin");
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "設定", level: 1 })).toBeVisible();
});

test("CSV は BOM 付き UTF-8 で日本語のファイル名", async ({ page }) => {
  await startDemo(page, "viewer");
  for (const kind of ["products", "inventory", "movements", "orders"]) {
    const res = await page.request.get(`/api/export/${kind}`);
    expect(res.status(), kind).toBe(200);
    expect(res.headers()["content-disposition"]).toContain("filename*=UTF-8''");
    expect([...(await res.body()).subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  }
});

test("ログインしていなければログイン画面へ。API は 401", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
  expect((await page.request.get("/api/export/products")).status()).toBe(401);
});

test("紹介ページから「デモを試す」で始められる", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("年間")).toBeVisible();
  await expect(page.getByText(/実際の導入実績や効果を保証するものではありません/)).toBeVisible();
  await page.getByRole("button", { name: "デモを試す" }).first().click();
  await page.waitForURL(/\/dashboard$/);
});
