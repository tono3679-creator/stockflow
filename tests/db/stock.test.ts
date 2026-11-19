import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, connect, createProduct, createTenant, dropTenant, errorOf, key, onHand, type TestTenant } from "./helpers";
import { suggestQuantity } from "@/lib/domain/reorder";
import { Random } from "@/lib/demo/random";

/** 入出庫・在庫の計算（DB の関数の中で、行ロック付きのトランザクションで行う） */
const sql = connect();
let t: TestTenant;
beforeAll(async () => { t = await createTenant(sql, 21); });
afterAll(async () => { await dropTenant(sql, t); await sql.end(); });

const today = () => t.data.today;
const move = (user: string, product: string, dir: "in" | "out", qty: number, k = key(), date = today()) =>
  as(sql, t, user, (tx) => tx<{ id: string }[]>`select record_stock_movement(${product}, ${dir}, ${qty}, ${date}::date, '', ${k}) id`).then((r) => r[0].id);

describe("入庫・出庫", () => {
  it("入庫で増え、出庫で減る。処理後の在庫が履歴に残る", async () => {
    const p = await createProduct(sql, t);
    await move(t.staff.staff, p, "in", 10);
    const id = await move(t.staff.staff, p, "out", 3);
    expect(await onHand(sql, p)).toBe(7);
    const [m] = await sql<{ quantity: number; balance_after: number; kind: string; created_by: string }[]>`select quantity, balance_after, kind, created_by from stock_movements where id = ${id}`;
    expect(m).toEqual({ quantity: -3, balance_after: 7, kind: "out", created_by: t.staff.staff });
  });

  it("在庫を超える出庫はできない（残りを知らせる）", async () => {
    const p = await createProduct(sql, t);
    await move(t.staff.staff, p, "in", 8);
    const err = await errorOf(move(t.staff.staff, p, "out", 9));
    expect(err).toBe("在庫が不足しています（残り8個）");
    expect(await onHand(sql, p)).toBe(8);
  });

  it("0以下・未来日・1年より前の日付は登録できない", async () => {
    const p = await createProduct(sql, t);
    expect(await errorOf(move(t.staff.staff, p, "in", 0))).toMatch(/0より大きい/);
    expect(await errorOf(move(t.staff.staff, p, "in", -1))).toMatch(/0より大きい/);
    expect(await errorOf(move(t.staff.staff, p, "in", 1, key(), "2099-01-01"))).toMatch(/未来/);
    expect(await errorOf(move(t.staff.staff, p, "in", 1, key(), "2020-01-01"))).not.toBeNull();
  });

  it("同時に出庫しても在庫はマイナスにならない（行ロック）", async () => {
    const p = await createProduct(sql, t);
    await move(t.staff.staff, p, "in", 10);
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => move(t.staff.staff, p, "out", 3)));
    const ok = results.filter((r) => r.status === "fulfilled").length;
    expect(ok).toBe(3);
    expect(await onHand(sql, p)).toBe(1);
    const [s] = await sql<{ s: number }[]>`select sum(quantity)::numeric s from stock_movements where product_id = ${p}`;
    expect(s.s).toBe(1);
  });

  it("同じ冪等性キーの二重送信は1回だけ登録される", async () => {
    const p = await createProduct(sql, t);
    const k = key();
    const [a, b] = await Promise.all([move(t.staff.staff, p, "in", 5, k), move(t.staff.staff, p, "in", 5, k)].map((x) => x.catch(() => null)));
    expect(await onHand(sql, p)).toBe(5);
    const again = await move(t.staff.staff, p, "in", 5, k);
    expect(again).toBe(a ?? b);
    expect(await onHand(sql, p)).toBe(5);
  });

  it("閲覧者は入出庫できない", async () => {
    const p = await createProduct(sql, t);
    expect(await errorOf(move(t.staff.viewer, p, "in", 1))).toMatch(/権限/);
  });
});

describe("棚卸の調整と取消（更新・削除はせず、記録を追加する）", () => {
  it("実在庫との差を調整として記録し、理由を残す", async () => {
    const p = await createProduct(sql, t);
    await move(t.staff.staff, p, "in", 10);
    await as(sql, t, t.staff.admin, (tx) => tx`select adjust_stock(${p}, 7, ${today()}::date, '棚卸で不足', ${key()})`);
    expect(await onHand(sql, p)).toBe(7);
    const [adj] = await sql<{ system_qty: number; counted_qty: number; reason: string }[]>`select system_qty, counted_qty, reason from inventory_adjustments where product_id = ${p}`;
    expect(adj).toMatchObject({ system_qty: 10, counted_qty: 7, reason: "棚卸で不足" });
    const [m] = await sql<{ quantity: number }[]>`select quantity from stock_movements where product_id = ${p} and kind = 'adjust'`;
    expect(m.quantity).toBe(-3);
  });

  it("担当者は調整・取消できない", async () => {
    const p = await createProduct(sql, t);
    expect(await errorOf(as(sql, t, t.staff.staff, (tx) => tx`select adjust_stock(${p}, 1, ${today()}::date, 'x', ${key()})`))).toMatch(/権限/);
  });

  it("取消は逆の記録を追加し、元の記録は残る。同じ記録は2回取り消せない", async () => {
    const p = await createProduct(sql, t);
    await move(t.staff.staff, p, "in", 10);
    const out = await move(t.staff.staff, p, "out", 4);
    await as(sql, t, t.staff.admin, (tx) => tx`select reverse_stock_movement(${out}, '数え間違い')`);
    expect(await onHand(sql, p)).toBe(10);
    const rows = await sql<{ kind: string; quantity: number }[]>`select kind, quantity from stock_movements where product_id = ${p} order by created_at`;
    expect(rows.map((r) => [r.kind, r.quantity])).toEqual([["in", 10], ["out", -4], ["reversal", 4]]);
    expect(await errorOf(as(sql, t, t.staff.admin, (tx) => tx`select reverse_stock_movement(${out}, 'もう一度')`))).not.toBeNull();
  });

  it("取消で在庫がマイナスになるなら取り消せない", async () => {
    const p = await createProduct(sql, t);
    const inId = await move(t.staff.staff, p, "in", 5);
    await move(t.staff.staff, p, "out", 5);
    expect(await errorOf(as(sql, t, t.staff.admin, (tx) => tx`select reverse_stock_movement(${inId}, 'x')`))).toMatch(/在庫が不足/);
  });

  it("履歴は直接書き換えも削除もできない", async () => {
    const p = await createProduct(sql, t);
    const id = await move(t.staff.staff, p, "in", 5);
    expect(await errorOf(as(sql, t, t.staff.admin, (tx) => tx`update stock_movements set quantity = 100 where id = ${id}`))).toMatch(/permission denied/);
    expect(await errorOf(as(sql, t, t.staff.admin, (tx) => tx`delete from stock_movements where id = ${id}`))).toMatch(/permission denied/);
    expect(await errorOf(as(sql, t, t.staff.admin, (tx) => tx`update stock_balances set on_hand = 999 where product_id = ${p}`))).toMatch(/permission denied/);
  });
});

describe("在庫の状態と推奨発注数（DB とアプリで同じ式）", () => {
  it("product_stock の状態・推奨数", async () => {
    const p = await createProduct(sql, t, { reorderPoint: 10, targetStock: 30 });
    await move(t.staff.staff, p, "in", 8);
    const [s] = await as(sql, t, t.staff.viewer, (tx) => tx<{ status: string; suggested_qty: number; needs_order: boolean }[]>`select status, suggested_qty, needs_order from product_stock where id = ${p}`);
    expect(s).toEqual({ status: "low", suggested_qty: 22, needs_order: true });
  });

  it("suggest_qty は TypeScript の suggestQuantity と一致する（ランダムな500通り）", async () => {
    const rng = new Random(99);
    const cases = Array.from({ length: 500 }, () => {
      const lot = rng.pick([1, 1, 5, 10, 12, 0.5, 0.25, 0]);
      return {
        targetStock: rng.int(0, 200), onHand: rng.int(-5, 200) + rng.pick([0, 0.5, 0.125]), onOrder: rng.int(0, 60),
        minOrderQty: rng.pick([0, 0, 10, 25, 7.5]), orderLot: lot,
      };
    });
    const rows = await sql<{ q: number }[]>`
      select app_private.suggest_qty(x.t, x.h, x.o, x.m, x.l) q
        from jsonb_to_recordset(${sql.json(cases.map((c, n) => ({ n, t: c.targetStock, h: c.onHand, o: c.onOrder, m: c.minOrderQty, l: c.orderLot })))}::jsonb)
             as x(n int, t numeric, h numeric, o numeric, m numeric, l numeric)
       order by x.n`;
    rows.forEach((r, i) => expect(r.q, JSON.stringify(cases[i])).toBe(suggestQuantity(cases[i])));
  });
});
