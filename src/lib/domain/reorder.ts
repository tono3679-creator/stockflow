/**
 * 在庫の状態と推奨発注数量（純粋関数）。
 * DB の public.product_stock / app_private.suggest_qty と同じ式（tests/db/stock.test.ts で一致を確認している）。
 *
 *   状態：在庫 0 以下 → 欠品 / 発注点以下 → 在庫不足 / それ以外 → 正常
 *   推奨数量：MAX(0, 目標在庫 − 現在庫 − 未入荷の発注残)。
 *            必要数があれば最低発注数量まで増やし、発注単位の倍数に切り上げる。
 *   発注待ち：発注点以下で、推奨数量が 0 より大きい（発注残を含めても目標在庫に届かない）
 *   発注不要：発注点以下だが、発注残で目標在庫まで補充できる
 */

export type StockStatus = "out" | "low" | "ok";

export type ReorderParams = {
  onHand: number;
  onOrder: number;
  reorderPoint: number;
  targetStock: number;
  minOrderQty: number;
  orderLot: number;
};

/** 小数の誤差を消す（数量は小数第3位まで） */
export function roundQty(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function stockStatus(onHand: number, reorderPoint: number): StockStatus {
  if (onHand <= 0) return "out";
  if (onHand <= reorderPoint) return "low";
  return "ok";
}

/** 発注単位の倍数に切り上げる（発注単位が 0 以下なら 1 とみなす） */
export function roundUpToLot(quantity: number, lot: number): number {
  const l = lot > 0 ? lot : 1;
  // 1000 倍して整数で計算し、小数の誤差で1単位多く切り上げないようにする
  const q = Math.round(quantity * 1000);
  const u = Math.round(l * 1000);
  return (Math.ceil(q / u) * u) / 1000;
}

export function suggestQuantity(p: Omit<ReorderParams, "reorderPoint">): number {
  const need = roundQty(p.targetStock - p.onHand - p.onOrder);
  if (need <= 0) return 0;
  return roundUpToLot(Math.max(need, p.minOrderQty), p.orderLot);
}

export type ReorderState = {
  status: StockStatus;
  suggested: number;
  /** 発注待ち（発注が必要で、まだ足りる発注がされていない） */
  needsOrder: boolean;
  /** 発注点以下だが、発注残で足りる */
  coveredByOrders: boolean;
};

export function reorderState(p: ReorderParams): ReorderState {
  const status = stockStatus(p.onHand, p.reorderPoint);
  const suggested = status === "ok" ? 0 : suggestQuantity(p);
  return { status, suggested, needsOrder: status !== "ok" && suggested > 0, coveredByOrders: status !== "ok" && suggested === 0 };
}

/** 金額（円・整数）。数量 × 単価を四捨五入（DB の purchase_order_items.amount と同じ） */
export function lineAmount(quantity: number, unitPrice: number): number {
  // 銭（単価の小数第2位）と数量の小数第3位まで、整数で計算してから円に丸める
  const q = Math.round(quantity * 1000);
  const p = Math.round(unitPrice * 100);
  return Math.round((q * p) / 100_000);
}
