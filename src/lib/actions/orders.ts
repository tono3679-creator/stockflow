"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { asCurrentUser } from "@/lib/auth";
import { createOrdersSchema, receiveSchema, updateOrderSchema } from "@/lib/validation";
import { run, uuidSchema, validate } from "./helpers";
import type { ActionResult } from "./result";

function refresh(id?: string) {
  revalidatePath("/orders");
  revalidatePath("/dashboard");
  revalidatePath("/inventory");
  if (id) revalidatePath(`/orders/${id}`);
}

const lineJson = (lines: { productId: string; quantity: number; unitPrice?: number; supplierId?: string }[]) =>
  lines.map((l) => ({
    product_id: l.productId, quantity: l.quantity,
    ...(l.unitPrice !== undefined ? { unit_price: l.unitPrice } : {}),
    ...(l.supplierId ? { supplier_id: l.supplierId } : {}),
  }));

/** 発注書の作成（仕入先ごとに自動で分ける）。作った発注書の ID を返す */
export async function createOrders(input: unknown): Promise<ActionResult<{ ids: string[] }>> {
  const v = validate(createOrdersSchema, input);
  if (!v.ok) return v.result;
  const d = v.data;
  const r = await run(() => asCurrentUser(async (tx) => {
    const [row] = await tx<{ ids: string[] }[]>`
      select create_purchase_orders(${tx.json(lineJson(d.lines) as never)}::jsonb, ${d.status}::po_status, ${d.orderOn}::date,
                                    ${d.expectedOn || null}::date, ${d.notes}, ${d.key}) ids`;
    return row.ids;
  }));
  if (!r.ok) return r.result;
  refresh();
  return { ok: true, data: { ids: r.value } };
}

export async function updateOrder(input: unknown): Promise<ActionResult> {
  const v = validate(updateOrderSchema, input);
  if (!v.ok) return v.result;
  const d = v.data;
  const r = await run(() => asCurrentUser((tx) => tx`
    select update_purchase_order(${d.id}, ${d.expectedOn || null}::date, ${d.notes}, ${d.lines ? tx.json(lineJson(d.lines) as never) : null}::jsonb)`));
  if (!r.ok) return r.result;
  refresh(d.id);
  return { ok: true };
}

export async function placeOrder(id: string): Promise<ActionResult> {
  if (!uuidSchema.safeParse(id).success) return { ok: false, error: "不正な操作です" };
  const r = await run(() => asCurrentUser((tx) => tx`select place_purchase_order(${id})`));
  if (!r.ok) return r.result;
  refresh(id);
  return { ok: true };
}

export async function cancelOrder(input: unknown): Promise<ActionResult> {
  const v = validate(z.object({ id: z.uuid(), reason: z.string().trim().max(200).default("") }), input);
  if (!v.ok) return v.result;
  const r = await run(() => asCurrentUser((tx) => tx`select cancel_purchase_order(${v.data.id}, ${v.data.reason})`));
  if (!r.ok) return r.result;
  refresh(v.data.id);
  return { ok: true };
}

/** 入荷登録（在庫・履歴・発注残・ステータスを DB の関数が1つのトランザクションで更新する） */
export async function receiveOrder(input: unknown): Promise<ActionResult<{ status: string }>> {
  const v = validate(receiveSchema, input);
  if (!v.ok) return v.result;
  const d = v.data;
  const lines = d.lines.filter((l) => l.quantity > 0).map((l) => ({ item_id: l.itemId, quantity: l.quantity }));
  if (lines.length === 0) return { ok: false, error: "入荷数を入力してください" };
  const r = await run(() => asCurrentUser(async (tx) => {
    await tx`select receive_purchase_order(${d.poId}, ${tx.json(lines as never)}::jsonb, ${d.receivedOn}::date, ${d.note}, ${d.key})`;
    const [po] = await tx<{ status: string }[]>`select status from purchase_orders where id = ${d.poId}`;
    return po.status;
  }));
  if (!r.ok) return r.result;
  refresh(d.poId);
  return { ok: true, data: { status: r.value } };
}
