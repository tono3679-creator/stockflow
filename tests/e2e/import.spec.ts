import { expect, expectToast, startDemo, test } from "./fixtures";

const csv = (s: string) => ({ name: "movements.csv", mimeType: "text/csv", buffer: Buffer.from(`﻿${s}`, "utf8") });

test("CSV取込：確認でエラー行を示し、正しいファイルは1回だけ取り込める", async ({ page }) => {
  await startDemo(page, "admin");
  const today = await page.evaluate(() => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(new Date()).replace(/-/g, "/"));
  await page.goto("/import");
  await page.getByRole("radio", { name: "入出庫履歴" }).click();

  // 在庫を超える出庫・存在しないコードはエラー
  await page.locator('input[type="file"]').setInputFiles(csv(`日付,商品コード,区分,数量\n${today},PP-0002,出庫,100\n${today},NOPE,入庫,1\n`));
  await page.getByRole("button", { name: "内容を確認" }).click();
  await expect(page.getByText("在庫が不足しています（残り8本）")).toBeVisible();
  await expect(page.getByText("商品コード「NOPE」が見つかりません")).toBeVisible();
  await expect(page.getByRole("button", { name: "取り込めません" })).toBeDisabled();

  // 正しいファイル
  const ok = csv(`日付,商品コード,区分,数量,備考\n${today},PP-0002,入庫,12,CSV\n`);
  await page.locator('input[type="file"]').setInputFiles(ok);
  await page.getByRole("button", { name: "内容を確認" }).click();
  await page.getByRole("button", { name: "1件を取り込む" }).click();
  await expectToast(page, "入出庫履歴を取り込みました（登録 1件）");

  // 同じファイルは2回目を取り込めない
  await page.getByRole("button", { name: "続けて取り込む" }).click();
  await page.locator('input[type="file"]').setInputFiles(ok);
  await page.getByRole("button", { name: "内容を確認" }).click();
  await expect(page.getByText(/同じ内容のファイルは取り込み済みです/)).toBeVisible();

  await page.goto("/inventory?q=PP-0002");
  await expect(page.getByRole("row").filter({ hasText: "塩ビ管 VP20（4m）" })).toContainText("20本");
});
