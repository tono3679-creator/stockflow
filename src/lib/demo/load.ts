/**
 * 生成したデモデータを DB に一括登録する（データベース所有者の接続で実行する。ログイン利用者の権限は使わない）。
 * 残高（stock_balances）は商品の登録時にトリガーが 0 で作るので、最後に生成した値で上書きする。
 */
import type { Sql, TransactionSql } from "postgres";
import type { DemoDataset } from "./generator";

type Row = object;
const CHUNK = 500;

async function insertRows(tx: TransactionSql, table: string, rows: Row[]) {
  if (rows.length === 0) return;
  const columns = Object.keys(rows[0]);
  const [schema, name] = table.includes(".") ? table.split(".") : ["public", table];
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    await tx`insert into ${tx(schema)}.${tx(name)} ${tx(chunk as Record<string, never>[], columns)}`;
  }
}

/** データセットを登録する。before は同じトランザクションの中で先に行う処理（古いデモの削除など） */
export async function loadDataset(sql: Sql, data: DemoDataset, before?: (tx: TransactionSql) => Promise<void>) {
  await sql.begin(async (tx) => {
    if (before) await before(tx);
    await insertRows(tx, "app_auth.users", data.users);
    await insertRows(tx, "organizations", [data.organization]);
    await insertRows(tx, "organization_settings", [data.settings]);
    await insertRows(tx, "profiles", data.profiles);
    await insertRows(tx, "organization_members", data.members);
    await insertRows(tx, "categories", data.categories);
    await insertRows(tx, "suppliers", data.suppliers);
    await insertRows(tx, "products", data.products);
    await insertRows(tx, "purchase_orders", data.purchaseOrders);
    await insertRows(tx, "purchase_order_items", data.purchaseOrderItems);
    await insertRows(tx, "stock_receipts", data.receipts);
    await insertRows(tx, "stock_receipt_items", data.receiptItems);
    await insertRows(tx, "stock_movements", data.movements);
    await insertRows(tx, "inventory_adjustments", data.adjustments);
    await tx`
      update public.stock_balances b set on_hand = x.on_hand, last_out_on = x.last_out_on
        from jsonb_to_recordset(${tx.json(data.balances as never)}::jsonb) as x(product_id uuid, on_hand numeric, last_out_on date)
       where b.organization_id = ${data.organizationId} and b.product_id = x.product_id`;
    await insertRows(tx, "app_private.counters", data.counters);
  });
}
