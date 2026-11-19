import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, createTenant, dropTenant, type TestTenant } from "./helpers";

/** デモデータを DB に入れたときの整合性（在庫＝入出庫の合計、発注残・ステータス、各状態がそろうこと） */
const sql = connect();
let t: TestTenant;
beforeAll(async () => { t = await createTenant(sql, 51); });
afterAll(async () => { await dropTenant(sql, t); await sql.end(); });

describe("デモデータの整合性", () => {
  it("すべての商品で、在庫数 = 入出庫の合計", async () => {
    const rows = await sql<{ n: number }[]>`
      select count(*)::int n from stock_balances b
       where b.organization_id = ${t.orgId}
         and b.on_hand <> coalesce((select sum(quantity) from stock_movements m where m.organization_id = b.organization_id and m.product_id = b.product_id), 0)`;
    expect(rows[0].n).toBe(0);
  });

  it("入荷数 = 入荷明細の合計、ステータスと入荷数が合っている", async () => {
    const [bad] = await sql<{ n: number }[]>`
      select count(*)::int n from purchase_order_items i
       where i.organization_id = ${t.orgId}
         and i.received_qty <> coalesce((select sum(quantity) from stock_receipt_items r where r.purchase_order_item_id = i.id), 0)`;
    expect(bad.n).toBe(0);
    const [st] = await sql<{ n: number }[]>`
      select count(*)::int n from purchase_orders po
       where po.organization_id = ${t.orgId} and (
         (po.status = 'received' and exists (select 1 from purchase_order_items i where i.purchase_order_id = po.id and i.received_qty < i.quantity))
         or (po.status = 'partial' and not exists (select 1 from purchase_order_items i where i.purchase_order_id = po.id and i.received_qty > 0))
         or (po.status in ('draft', 'ordered') and exists (select 1 from purchase_order_items i where i.purchase_order_id = po.id and i.received_qty > 0)))`;
    expect(st.n).toBe(0);
  });

  it("発注書の合計金額 = 明細の合計", async () => {
    const [r] = await sql<{ n: number }[]>`
      select count(*)::int n from purchase_orders po
       where po.organization_id = ${t.orgId} and po.total_amount <> (select coalesce(sum(amount), 0) from purchase_order_items i where i.purchase_order_id = po.id)`;
    expect(r.n).toBe(0);
  });

  it("欠品・在庫不足・発注待ち・分納・入荷遅延・長期滞留がそろう", async () => {
    const [s] = await sql<{ out: number; low: number; needs: number; partial: number; delayed: number; stale: number }[]>`
      select (select count(*)::int from product_stock where organization_id = ${t.orgId} and status = 'out') "out",
             (select count(*)::int from product_stock where organization_id = ${t.orgId} and status = 'low') low,
             (select count(*)::int from product_stock where organization_id = ${t.orgId} and needs_order) needs,
             (select count(*)::int from purchase_orders where organization_id = ${t.orgId} and status = 'partial') partial,
             (select count(*)::int from purchase_orders where organization_id = ${t.orgId} and status in ('ordered', 'partial') and expected_on < ${t.data.today}::date) delayed,
             (select count(*)::int from product_stock where organization_id = ${t.orgId} and on_hand > 0 and coalesce(last_out_on, '1900-01-01') < ${t.data.today}::date - 90) stale`;
    for (const [k, v] of Object.entries(s)) expect(v, k).toBeGreaterThan(0);
  });

  it("仕様書の例：PP-0002 は在庫8・目標30で、推奨発注数22", async () => {
    const [p] = await sql<{ on_hand: number; target_stock: number; on_order: number; suggested_qty: number }[]>`
      select on_hand, target_stock, on_order, suggested_qty from product_stock where organization_id = ${t.orgId} and code = 'PP-0002'`;
    expect(p).toEqual({ on_hand: 8, target_stock: 30, on_order: 0, suggested_qty: 22 });
  });
});
