import { expect, expectToast, startDemo, test } from "./fixtures";

test("在庫を超える出庫はできず、残りの数を知らせる", async ({ page }) => {
  await startDemo(page, "staff");
  await page.goto("/inventory?q=PP-0002");
  await page.getByRole("button", { name: "塩ビ管 VP20（4m） を出庫" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("数量").fill("9");
  await dialog.getByRole("button", { name: "出庫を登録" }).click();
  await expect(dialog.getByText("在庫が不足しています（残り8本）")).toBeVisible();
  // 数字以外・0 は受け付けない
  await dialog.getByLabel("数量").fill("0");
  await dialog.getByRole("button", { name: "出庫を登録" }).click();
  await expect(dialog.getByText("数量は0より大きい数を入力してください")).toBeVisible();
  // 正しい数なら登録でき、在庫が減る
  await dialog.getByLabel("数量").fill("3");
  await dialog.getByRole("button", { name: "出庫を登録" }).click();
  await expectToast(page, /出庫しました（塩ビ管 VP20（4m） −3本・在庫 5本）|出庫しました（塩ビ管 VP20（4m） -3本・在庫 5本）/);
});

test("二度押ししても1回だけ登録される", async ({ page }) => {
  await startDemo(page, "staff");
  await page.goto("/movements/new");
  await page.getByPlaceholder("商品名・コードで検索").fill("PP-0001");
  await page.getByRole("option").first().click();
  await page.getByLabel("数量").fill("1");
  const submit = page.getByRole("button", { name: "入庫を登録" });
  await submit.dblclick();
  await expectToast(page, /入庫しました/);
  await page.goto("/movements?q=PP-0001");
  await expect(page.getByRole("row").filter({ hasText: "+1本" })).toHaveCount(1);
});
