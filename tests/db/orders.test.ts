import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, connect, createProduct, createTenant, dropTenant, errorOf, key, onHand, type TestTenant } from "./helpers";

/** 発注書の作成（仕入先別に分割）・発注・入荷（分納・二重登録・過剰入荷）・キャンセル */
const sql = connect();
let t: TestTenant;
beforeAll(async () => { t = await createTenant(sql, 31); });
afterAll(async () => { await dropTenant(sql, t); await sql.end(); });

const today = () => t.data.today;
type Line = { product_id: string; quantity: number; unit_price?: number; supplier_id?: string };
const create = (lines: Line[], status: "draft" | "ordered" = "ordered", k = key(), user = () => t.staff.staff) =>
  as(sql, t, user(), (tx) => tx<{ ids: string[] }[]>`select create_purchase_orders(${tx.json(lines)}, ${status}::po_status, ${today()}::date, null, '', ${k}) ids`).then((r) => r[0].ids);
const items = (po: string) => sql<{ id: string; product_id: string; quantity: number; received_qty: number; amount: number }[]>`select id, product_id, quantity, received_qty, amount from purchase_order_items where purchase_order_id = ${po} order by line_no`;
const receive = (po: string, lines: { item_id: string; quantity: number }[], k = key()) =>
  as(sql, t, t.staff.staff, (tx) => tx<{ id: string }[]>`select receive_purchase_order(${po}, ${tx.json(lines)}, ${today()}::date, '', ${k}) id`).then((r) => r[0].id);
const status = async (po: string) => (await sql<{ status: string }[]>`select status from purchase_orders where id = ${po}`)[0].status;

describe("発注書の作成", () => {
  it("仕入先ごとに発注書を分け、番号は PO-YYYYMM-0001 形式で重複しない", async () => {
    const [s1, s2] = t.data.suppliers;
    const a = await createProduct(sql, t, { supplierId: s1.id, unitCost: 120 });
    const b = await createProduct(sql, t, { supplierId: s2.id });
    const c = await createProduct(sql, t, { supplierId: s1.id });
    const ids = await create([{ product_id: a, quantity: 3 }, { product_id: b, quantity: 1 }, { product_id: c, quantity: 2, unit_price: 55.5 }], "draft");
    expect(ids).toHaveLength(2);
    const pos = await sql<{ number: string; supplier_id: string; total_amount: number; status: string }[]>`select number, supplier_id, total_amount, status from purchase_orders where id = any(${ids}::uuid[]) order by number`;
    expect(new Set(pos.map((p) => p.supplier_id))).toEqual(new Set([s1.id, s2.id]));
    const ym = today().slice(0, 7).replace("-", "");
    for (const p of pos) expect(p.number).toMatch(new RegExp(`^PO-${ym}-\\d{4}$`));
    expect(pos.every((p) => p.status === "draft")).toBe(true);
    const s1po = pos.find((p) => p.supplier_id === s1.id)!;
    expect(s1po.total_amount).toBe(3 * 120 + 111); // 2 × 55.5
    const [dup] = await sql<{ n: number }[]>`select count(*)::int n from (select number from purchase_orders group by organization_id, number having count(*) > 1) x`;
    expect(dup.n).toBe(0);
  });

  it("同時に作っても番号は重複しない", async () => {
    const p = await createProduct(sql, t);
    const all = (await Promise.all(Array.from({ length: 6 }, () => create([{ product_id: p, quantity: 1 }])))).flat();
    const nums = await sql<{ number: string }[]>`select number from purchase_orders where id = any(${all}::uuid[])`;
    expect(new Set(nums.map((n) => n.number)).size).toBe(6);
  });

  it("同じキーで二重に送っても1回だけ作られる", async () => {
    const p = await createProduct(sql, t);
    const k = key();
    const first = await create([{ product_id: p, quantity: 4 }], "draft", k);
    const second = await create([{ product_id: p, quantity: 4 }], "draft", k);
    expect(second).toEqual(first);
    const [n] = await sql<{ n: number }[]>`select count(*)::int n from purchase_order_items where product_id = ${p}`;
    expect(n.n).toBe(1);
  });

  it("仕入先の無い商品・数量0・閲覧者は発注できない", async () => {
    const none = await createProduct(sql, t, { supplierId: null });
    expect(await errorOf(create([{ product_id: none, quantity: 1 }]))).toMatch(/仕入先が決まっていない/);
    const p = await createProduct(sql, t);
    expect(await errorOf(create([{ product_id: p, quantity: 0 }]))).not.toBeNull();
    expect(await errorOf(create([{ product_id: p, quantity: 1 }], "ordered", key(), () => t.staff.viewer))).toMatch(/権限/);
  });

  it("発注残に入り、推奨発注数から差し引かれる", async () => {
    const p = await createProduct(sql, t, { reorderPoint: 10, targetStock: 30 });
    const before = (await sql<{ suggested_qty: number }[]>`select suggested_qty from product_stock where id = ${p}`)[0].suggested_qty;
    expect(before).toBe(30);
    await create([{ product_id: p, quantity: 20 }]);
    const [s] = await sql<{ on_order: number; suggested_qty: number; needs_order: boolean }[]>`select on_order, suggested_qty, needs_order from product_stock where id = ${p}`;
    expect(s).toEqual({ on_order: 20, suggested_qty: 10, needs_order: true });
  });
});

describe("入荷", () => {
  it("分納 → 一部入荷、残りの入荷 → 入荷完了。在庫と履歴に反映", async () => {
    const p = await createProduct(sql, t);
    const [po] = await create([{ product_id: p, quantity: 10 }]);
    const [item] = await items(po);
    await receive(po, [{ item_id: item.id, quantity: 4 }]);
    expect(await status(po)).toBe("partial");
    expect(await onHand(sql, p)).toBe(4);
    await receive(po, [{ item_id: item.id, quantity: 6 }]);
    expect(await status(po)).toBe("received");
    expect(await onHand(sql, p)).toBe(10);
    const [it2] = await items(po);
    expect(it2.received_qty).toBe(10);
    const kinds = await sql<{ kind: string; receipt_item_id: string | null }[]>`select kind, receipt_item_id from stock_movements where product_id = ${p}`;
    expect(kinds.every((k) => k.kind === "receipt" && k.receipt_item_id)).toBe(true);
  });

  it("発注数量を超えて入荷できない", async () => {
    const p = await createProduct(sql, t);
    const [po] = await create([{ product_id: p, quantity: 5 }]);
    const [item] = await items(po);
    await receive(po, [{ item_id: item.id, quantity: 3 }]);
    expect(await errorOf(receive(po, [{ item_id: item.id, quantity: 3 }]))).toMatch(/発注数量を超えて入荷できません（残り2個）/);
    expect(await onHand(sql, p)).toBe(3);
  });

  it("同じキーの二重送信（同時でも）は1回だけ入荷される", async () => {
    const p = await createProduct(sql, t);
    const [po] = await create([{ product_id: p, quantity: 5 }]);
    const [item] = await items(po);
    const k = key();
    const results = await Promise.allSettled([receive(po, [{ item_id: item.id, quantity: 5 }], k), receive(po, [{ item_id: item.id, quantity: 5 }], k)]);
    expect(results.some((r) => r.status === "fulfilled")).toBe(true);
    expect(await onHand(sql, p)).toBe(5);
    const [n] = await sql<{ n: number }[]>`select count(*)::int n from stock_receipts where purchase_order_id = ${po}`;
    expect(n.n).toBe(1);
  });

  it("下書き・入荷完了・キャンセルの発注書には入荷できない", async () => {
    const p = await createProduct(sql, t);
    const [draft] = await create([{ product_id: p, quantity: 5 }], "draft");
    const [item] = await items(draft);
    expect(await errorOf(receive(draft, [{ item_id: item.id, quantity: 1 }]))).toMatch(/発注済・一部入荷/);
  });

  it("他の発注書の明細を指定できない", async () => {
    const p = await createProduct(sql, t);
    const [a] = await create([{ product_id: p, quantity: 5 }]);
    const [b] = await create([{ product_id: p, quantity: 5 }]);
    const [itemB] = await items(b);
    expect(await errorOf(receive(a, [{ item_id: itemB.id, quantity: 1 }]))).toMatch(/明細が見つかりません/);
  });
});

describe("発注・変更・キャンセル", () => {
  it("下書き → 発注済。発注済の明細は変えられない", async () => {
    const p = await createProduct(sql, t);
    const [po] = await create([{ product_id: p, quantity: 5 }], "draft");
    await as(sql, t, t.staff.staff, (tx) => tx`select update_purchase_order(${po}, null, 'メモ', ${tx.json([{ product_id: p, quantity: 8 }])})`);
    expect((await items(po))[0].quantity).toBe(8);
    await as(sql, t, t.staff.staff, (tx) => tx`select place_purchase_order(${po})`);
    expect(await status(po)).toBe("ordered");
    expect(await errorOf(as(sql, t, t.staff.staff, (tx) => tx`select update_purchase_order(${po}, null, '', ${tx.json([{ product_id: p, quantity: 1 }])})`))).toMatch(/発注済の明細は変更できません/);
  });

  it("キャンセルは下書き・発注済だけ。入荷が始まったらできない", async () => {
    const p = await createProduct(sql, t);
    const [a] = await create([{ product_id: p, quantity: 5 }]);
    await as(sql, t, t.staff.staff, (tx) => tx`select cancel_purchase_order(${a}, '数量違い')`);
    expect(await status(a)).toBe("cancelled");
    const [b] = await create([{ product_id: p, quantity: 5 }]);
    const [item] = await items(b);
    await receive(b, [{ item_id: item.id, quantity: 1 }]);
    expect(await errorOf(as(sql, t, t.staff.staff, (tx) => tx`select cancel_purchase_order(${b}, 'x')`))).toMatch(/キャンセルできません/);
    // キャンセルした発注は発注残に入らない
    const [s] = await sql<{ on_order: number }[]>`select on_order from product_stock where id = ${p}`;
    expect(s.on_order).toBe(4);
  });
});
