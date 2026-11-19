"use server";
import { revalidatePath } from "next/cache";
import { asCurrentUser } from "@/lib/auth";
import { formatQty, formatSignedQty } from "@/lib/format";
import { adjustSchema, movementSchema, reverseSchema } from "@/lib/validation";
import { run, validate } from "./helpers";
import type { ActionResult } from "./result";

function refresh(productId?: string) {
  revalidatePath("/dashboard");
  revalidatePath("/inventory");
  revalidatePath("/movements");
  if (productId) revalidatePath(`/inventory/${productId}`);
}

/** 入庫・出庫（在庫の検証と更新は DB の関数がトランザクションの中で行う） */
export async function recordMovement(input: unknown): Promise<ActionResult<{ message: string; onHand: number }>> {
  const v = validate(movementSchema, input);
  if (!v.ok) return v.result;
  const d = v.data;
  const r = await run(() => asCurrentUser(async (tx) => {
    await tx`select record_stock_movement(${d.productId}, ${d.direction}, ${d.quantity}, ${d.occurredOn}::date, ${d.note}, ${d.key})`;
    const [p] = await tx<{ name: string; unit: string; on_hand: number }[]>`select name, unit, on_hand from product_stock where id = ${d.productId}`;
    return p;
  }));
  if (!r.ok) return r.result;
  refresh(d.productId);
  const p = r.value;
  return {
    ok: true,
    data: { message: `${d.direction === "in" ? "入庫" : "出庫"}しました（${p.name} ${formatSignedQty(d.direction === "in" ? d.quantity : -d.quantity, p.unit)}・在庫 ${formatQty(p.on_hand, p.unit)}）`, onHand: p.on_hand },
  };
}

export async function adjustStock(input: unknown): Promise<ActionResult> {
  const v = validate(adjustSchema, input);
  if (!v.ok) return v.result;
  const d = v.data;
  const r = await run(() => asCurrentUser((tx) => tx`select adjust_stock(${d.productId}, ${d.counted}, ${d.countedOn}::date, ${d.reason}, ${d.key})`));
  if (!r.ok) return r.result;
  refresh(d.productId);
  return { ok: true };
}

export async function reverseMovement(input: unknown): Promise<ActionResult> {
  const v = validate(reverseSchema, input);
  if (!v.ok) return v.result;
  const r = await run(() => asCurrentUser((tx) => tx<{ product_id: string }[]>`
    select product_id from stock_movements where id = reverse_stock_movement(${v.data.movementId}, ${v.data.reason})`));
  if (!r.ok) return r.result;
  refresh(r.value[0]?.product_id);
  return { ok: true };
}
