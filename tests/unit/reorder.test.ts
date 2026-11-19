import { describe, expect, it } from "vitest";
import { lineAmount, reorderState, roundUpToLot, stockStatus, suggestQuantity } from "@/lib/domain/reorder";

describe("在庫の状態", () => {
  it("0以下は欠品、発注点以下は在庫不足、それ以外は正常", () => {
    expect(stockStatus(0, 10)).toBe("out");
    expect(stockStatus(-1, 10)).toBe("out");
    expect(stockStatus(10, 10)).toBe("low");
    expect(stockStatus(8, 10)).toBe("low");
    expect(stockStatus(11, 10)).toBe("ok");
    expect(stockStatus(0.5, 0)).toBe("ok");
  });
});

describe("発注単位への切り上げ", () => {
  it("倍数に切り上げる", () => {
    expect(roundUpToLot(22, 10)).toBe(30);
    expect(roundUpToLot(30, 10)).toBe(30);
    expect(roundUpToLot(1, 12)).toBe(12);
  });
  it("小数の誤差で1単位多くならない", () => {
    expect(roundUpToLot(0.3, 0.1)).toBe(0.3);
    expect(roundUpToLot(1.2, 0.4)).toBe(1.2);
    expect(roundUpToLot(0.7, 0.1)).toBe(0.7);
  });
  it("発注単位が0以下なら1とみなす", () => {
    expect(roundUpToLot(2.5, 0)).toBe(3);
  });
});

describe("推奨発注数量 = MAX(0, 目標 − 在庫 − 発注残) → 最低発注数量 → 発注単位", () => {
  const base = { onHand: 8, onOrder: 0, targetStock: 30, minOrderQty: 0, orderLot: 1 };
  it("仕様書の例（在庫8・目標30）→ 22", () => {
    expect(suggestQuantity(base)).toBe(22);
  });
  it("発注残を差し引く", () => {
    expect(suggestQuantity({ ...base, onOrder: 10 })).toBe(12);
    expect(suggestQuantity({ ...base, onOrder: 22 })).toBe(0);
    expect(suggestQuantity({ ...base, onOrder: 50 })).toBe(0);
  });
  it("最低発注数量まで増やし、発注単位に切り上げる", () => {
    expect(suggestQuantity({ ...base, minOrderQty: 50 })).toBe(50);
    expect(suggestQuantity({ ...base, orderLot: 10 })).toBe(30);
    expect(suggestQuantity({ ...base, minOrderQty: 25, orderLot: 10 })).toBe(30);
  });
  it("必要数が0なら最低発注数量があっても0", () => {
    expect(suggestQuantity({ ...base, onHand: 30, minOrderQty: 10 })).toBe(0);
  });
});

describe("発注待ちの判定", () => {
  it("発注点以下で推奨数量があれば発注待ち", () => {
    expect(reorderState({ onHand: 8, onOrder: 0, reorderPoint: 10, targetStock: 30, minOrderQty: 0, orderLot: 1 })).toEqual({ status: "low", suggested: 22, needsOrder: true, coveredByOrders: false });
  });
  it("発注残で足りるなら発注待ちではない", () => {
    expect(reorderState({ onHand: 8, onOrder: 30, reorderPoint: 10, targetStock: 30, minOrderQty: 0, orderLot: 1 })).toMatchObject({ needsOrder: false, coveredByOrders: true });
  });
  it("正常なら提案しない", () => {
    expect(reorderState({ onHand: 20, onOrder: 0, reorderPoint: 10, targetStock: 30, minOrderQty: 0, orderLot: 1 }).suggested).toBe(0);
  });
});

describe("金額", () => {
  it("数量×単価を円に四捨五入（整数で計算）", () => {
    expect(lineAmount(3, 980)).toBe(2940);
    expect(lineAmount(0.333, 100)).toBe(33);
    expect(lineAmount(1.005, 100)).toBe(101);
    expect(lineAmount(3, 19.99)).toBe(60);
  });
});
