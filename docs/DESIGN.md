# StockFlow 設計メモ

## 方針

- **在庫は記録から計算する**：正本は `stock_movements`（入庫は正・出庫は負の数量）。`stock_balances.on_hand` はその合計を持つ集計で、DB 関数だけが記録と同じトランザクションで更新する。記録は書き換え・削除しない（取消は `reversal`、棚卸は `adjust` を追加）。
- **業務ルールは DB の中で守る**：在庫・発注・入荷・取込の書き込みは `security definer` の関数だけ。関数の最初に `app_private.require_role()` で役割と所属を確かめる。画面とサーバーの検証は「先に知らせる」ためのもので、最終判断は DB。
- **二重登録を防ぐ**：入出庫・調整・発注・入荷・初期在庫に冪等性キー（会社ごとに一意）。同じキーの2回目は1回目の結果を返す。CSV の初期在庫・入出庫は、整形後の内容の SHA-256 を `import_jobs` に一意で記録し、同じ内容の再取込を断る。
- **計算を1か所に**：状態と推奨数は `public.product_stock` ビュー（`app_private.suggest_qty`）で計算し、画面・CSV・レポートはそこから読む。同じ式を `src/lib/domain/reorder.ts` に持ち、DB テストで500通りの入力について一致を確かめている。

## データ

| 表 | 内容 |
| --- | --- |
| organizations / organization_settings | 会社（テナント）と設定（発注書の会社情報・滞留日数・既定リードタイム）。デモは `is_demo`＋`demo_expires_at` |
| profiles / organization_members | 利用者と所属（role：admin / staff / viewer、is_active） |
| categories / suppliers / products | マスタ。商品コードは会社ごとに一意。目標在庫 ≥ 発注点、発注単位 > 0 を制約で保証 |
| stock_balances | 商品ごとの在庫数・最終出庫日（商品の登録時にトリガーが 0 で作る） |
| stock_movements | 入出庫の記録。kind：opening / in / out / receipt / adjust / reversal。`balance_after` に処理後の在庫 |
| inventory_adjustments | 棚卸の調整（帳簿の数・実在庫・理由） |
| purchase_orders / purchase_order_items | 発注書と明細。番号 `PO-YYYYMM-0001`（`app_private.counters` で採番、会社ごとに一意）。明細の金額は生成列、合計はトリガー |
| stock_receipts / stock_receipt_items | 入荷（分納ごとに1件） |
| import_jobs | CSV 取込の記録 |
| audit_logs | 操作の記録（管理者だけ閲覧） |

すべての表に `organization_id` があり、子の表は `(organization_id, id)` の複合外部キーで同じ会社の行しか参照できない。

### 発注書のステータス

```
draft（下書き）→ ordered（発注済）→ partial（一部入荷）→ received（入荷完了）
   └────────────┴→ cancelled（キャンセル。入荷が始まったら不可）
```

入荷遅延 ＝ 発注済・一部入荷で、納品予定日が今日より前。発注残 ＝ 発注済・一部入荷の（発注数 − 入荷数）。

## 権限

| 層 | 内容 |
| --- | --- |
| 画面 | 役割に応じてメニュー・ボタンを出し分け、`requireRole` で画面ごとに確認 |
| Server Actions | zod で入力を検証してから DB 関数を呼ぶ。役割も確認 |
| DB | RLS（自分の会社の行だけ・マスタの書き込みは管理者だけ）、列単位の GRANT、DB 関数の `require_role` |

アプリは postgres.js で接続し、トランザクションごとに `set role authenticated` と `request.jwt.claims`（sub と org_id）を設定する（`src/lib/db/rls.ts`）。ポリシーは Supabase と同じ `auth.uid()` を使う。

## ログイン

`app_auth.users`（scrypt）と `app_auth.sessions`（トークンのハッシュだけ保存、HttpOnly・SameSite=Lax の Cookie）。ログイン失敗とデモ作成には回数制限。`proxy.ts` が未ログインの画面アクセスをログイン画面へ送り、CSP を付ける。

## デモ

`src/lib/demo/generator.ts` が seed 付き乱数で半年分の業務を再現する（週1回の発注、分納、月末の棚卸調整、取消1件）。`master-data.ts` の SCENARIOS で、欠品・在庫不足（PP-0002：在庫8・目標30 → 推奨22）・一部入荷・入荷遅延・下書きなどを必ず作る。訪問者ごとに新しい ID で会社を作り、24時間後に `app_private.demo_cleanup()`（毎日の Cron）で消す。

## 画面

- 色：背景 #FAFAF9、面 #FFFFFF、文字 #18181B、補助 #71717A、線 #E4E4E7、アクセント（青）。赤・黄・緑は状態だけに使う。
- フォント：Noto Sans JP、数字は等幅（`tabular-nums`）。
- グラフ：1つのグラフに軸は1つ。単位の違う数量は合計せず、金額（仕入単価 × 数量。参考値）か件数で集計する。
- スマホ：下部のメニュー、入出庫は大きなボタンと数字キーボード（`inputMode="decimal"`）。
