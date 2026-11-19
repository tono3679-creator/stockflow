import { describe, expect, it } from "vitest";
import { movementSchema, productSchema, receiveSchema, toNumberInput } from "@/lib/validation";

const id = "6f1c1d1e-0000-4000-8000-000000000001";
const mv = (quantity: unknown) => movementSchema.safeParse({ productId: id, direction: "out", quantity, occurredOn: "2026-11-19", key: "key-12345678" });
const message = (r: ReturnType<typeof mv>) => (r.success ? null : r.error.issues[0].message);

describe("数値の入力", () => {
  it("全角数字・カンマを受け付ける", () => {
    expect(toNumberInput("１，２００")).toBe(1200);
    expect(toNumberInput("")).toBeUndefined();
    expect(Number.isNaN(toNumberInput("12a"))).toBe(true);
  });
});

describe("入出庫の数量", () => {
  it("0より大きい数だけ", () => {
    expect(mv("3").success).toBe(true);
    expect(mv("0.5").success).toBe(true);
    expect(message(mv("0"))).toBe("数量は0より大きい数を入力してください");
    expect(message(mv("-1"))).toBe("数量は0より大きい数を入力してください");
    expect(message(mv("abc"))).toBe("数量を数字で入力してください");
    expect(message(mv(""))).toBe("数量を数字で入力してください");
    expect(message(mv("1.2345"))).toBe("小数は第3位まで入力できます");
  });
  it("存在しない日付は受け付けない", () => {
    expect(movementSchema.safeParse({ productId: id, direction: "in", quantity: 1, occurredOn: "2026-02-30", key: "key-12345678" }).success).toBe(false);
  });
});

describe("商品", () => {
  const base = { code: "A-1", name: "部品", unit: "個", unitCost: "100", reorderPoint: "10", targetStock: "20", orderLot: "1", minOrderQty: "0" };
  it("目標在庫は発注点以上", () => {
    expect(productSchema.safeParse(base).success).toBe(true);
    const r = productSchema.safeParse({ ...base, targetStock: "5" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].path).toEqual(["targetStock"]);
  });
  it("発注単位は0より大きい", () => {
    expect(productSchema.safeParse({ ...base, orderLot: "0" }).success).toBe(false);
  });
});

describe("入荷", () => {
  it("入荷数は0以上（0の行は入荷しない）", () => {
    const ok = receiveSchema.safeParse({ poId: id, receivedOn: "2026-11-19", key: "key-12345678", lines: [{ itemId: id, quantity: "0" }] });
    expect(ok.success).toBe(true);
    expect(receiveSchema.safeParse({ poId: id, receivedOn: "2026-11-19", key: "key-12345678", lines: [{ itemId: id, quantity: "-1" }] }).success).toBe(false);
  });
});
