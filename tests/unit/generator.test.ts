import { describe, expect, it } from "vitest";
import { generateDemoData } from "@/lib/demo/generator";
import { reorderState } from "@/lib/domain/reorder";

const now = new Date("2026-11-19T03:00:00Z");
const gen = (seed = 1) => generateDemoData({ seed, now, organizationId: "00000000-0000-4000-8000-000000000000", mode: { kind: "demo", expiresAt: new Date(now.getTime() + 86400_000) } });

describe("デモデータ", () => {
  const d = gen();
  it("仕様の規模（商品約100・仕入先約15・入出庫300件以上・発注30件以上・6か月）", () => {
    expect(d.products.length).toBeGreaterThanOrEqual(95);
    expect(d.suppliers.length).toBeGreaterThanOrEqual(15);
    expect(d.movements.length).toBeGreaterThanOrEqual(300);
    expect(d.purchaseOrders.length).toBeGreaterThanOrEqual(30);
    const first = d.movements.map((m) => m.occurred_on).sort()[0];
    expect(first <= "2026-05-25").toBe(true);
  });

  it("在庫は入出庫の合計と一致し、マイナスにならない", () => {
    const sum = new Map<string, number>();
    for (const m of [...d.movements].sort((a, b) => a.occurred_on.localeCompare(b.occurred_on))) {
      const next = Math.round(((sum.get(m.product_id) ?? 0) + m.quantity) * 1000) / 1000;
      expect(next).toBeGreaterThanOrEqual(0);
      sum.set(m.product_id, next);
    }
    for (const b of d.balances) expect(b.on_hand).toBe(sum.get(b.product_id) ?? 0);
  });

  it("すべての状態がそろう（欠品・在庫不足・発注待ち・分納・入荷遅延・下書き）", () => {
    const onOrder = new Map<string, number>();
    const open = new Set(d.purchaseOrders.filter((p) => p.status === "ordered" || p.status === "partial").map((p) => p.id));
    for (const i of d.purchaseOrderItems) if (open.has(i.purchase_order_id)) onOrder.set(i.product_id, (onOrder.get(i.product_id) ?? 0) + i.quantity - i.received_qty);
    const bal = new Map(d.balances.map((b) => [b.product_id, b.on_hand]));
    const states = d.products.map((p) => reorderState({
      onHand: bal.get(p.id) ?? 0, onOrder: onOrder.get(p.id) ?? 0, reorderPoint: p.reorder_point, targetStock: p.target_stock, minOrderQty: p.min_order_qty, orderLot: p.order_lot,
    }));
    expect(states.filter((s) => s.status === "out").length).toBeGreaterThan(0);
    expect(states.filter((s) => s.status === "low").length).toBeGreaterThan(0);
    expect(states.filter((s) => s.needsOrder).length).toBeGreaterThan(0);
    const statuses = new Set(d.purchaseOrders.map((p) => p.status));
    for (const s of ["draft", "ordered", "partial", "received"]) expect(statuses.has(s as never)).toBe(true);
    expect(d.purchaseOrders.some((p) => (p.status === "ordered" || p.status === "partial") && p.expected_on && p.expected_on < d.today)).toBe(true);
  });

  it("同じ seed なら同じ内容（ID 以外）", () => {
    const a = gen(5);
    const b = gen(5);
    expect(a.movements.map((m) => [m.occurred_on, m.quantity])).toEqual(b.movements.map((m) => [m.occurred_on, m.quantity]));
  });
});
