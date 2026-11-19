"use server";
import { revalidatePath } from "next/cache";
import { asCurrentUser } from "@/lib/auth";
import { productSchema, supplierSchema } from "@/lib/validation";
import { isUniqueViolation, toUserMessage } from "./errors";
import { uuidSchema, validate } from "./helpers";
import type { ActionResult } from "./result";
import { toLocalDate } from "@/lib/domain/dates";

function productRow(d: ReturnType<typeof productSchema.parse>) {
  return {
    code: d.code, name: d.name, category_id: d.categoryId || null, unit: d.unit, supplier_id: d.supplierId || null,
    unit_cost: d.unitCost, reorder_point: d.reorderPoint, target_stock: d.targetStock, order_lot: d.orderLot, min_order_qty: d.minOrderQty,
    location: d.location, is_active: d.isActive, notes: d.notes,
  };
}

/** 商品の登録（管理者）。初期在庫があれば、同じトランザクションで初期在庫の記録も作る */
export async function createProduct(input: unknown): Promise<ActionResult<{ id: string }>> {
  const v = validate(productSchema, input);
  if (!v.ok) return v.result;
  const d = v.data;
  try {
    const id = await asCurrentUser(async (tx, user) => {
      const [row] = await tx<{ id: string }[]>`insert into products ${tx({ organization_id: user.organizationId, ...productRow(d) })} returning id`;
      if (d.openingStock && d.openingStock > 0) {
        await tx`select set_opening_stock(${row.id}, ${d.openingStock}, ${toLocalDate(new Date(), user.settings.timezone)}::date, ${`opening:${row.id}`})`;
      }
      return row.id;
    });
    revalidatePath("/products");
    revalidatePath("/inventory");
    return { ok: true, data: { id } };
  } catch (e) {
    if (isUniqueViolation(e, "code")) return { ok: false, error: "入力内容を確認してください", fieldErrors: { code: "この商品コードは使われています" } };
    return { ok: false, error: toUserMessage(e) };
  }
}

export async function updateProduct(id: string, input: unknown): Promise<ActionResult> {
  if (!uuidSchema.safeParse(id).success) return { ok: false, error: "不正な操作です" };
  const v = validate(productSchema, input);
  if (!v.ok) return v.result;
  try {
    const updated = await asCurrentUser((tx) => tx`update products set ${tx(productRow(v.data))} where id = ${id} returning id`);
    if (updated.length === 0) return { ok: false, error: "この操作を行う権限がありません" };
  } catch (e) {
    if (isUniqueViolation(e, "code")) return { ok: false, error: "入力内容を確認してください", fieldErrors: { code: "この商品コードは使われています" } };
    return { ok: false, error: toUserMessage(e) };
  }
  revalidatePath("/products");
  revalidatePath("/inventory");
  revalidatePath(`/inventory/${id}`);
  return { ok: true };
}

function supplierRow(d: ReturnType<typeof supplierSchema.parse>) {
  return { name: d.name, contact_name: d.contactName, phone: d.phone, email: d.email, address: d.address, notes: d.notes, is_active: d.isActive };
}

export async function createSupplier(input: unknown): Promise<ActionResult<{ id: string }>> {
  const v = validate(supplierSchema, input);
  if (!v.ok) return v.result;
  try {
    const id = await asCurrentUser(async (tx, user) => {
      const [row] = await tx<{ id: string }[]>`insert into suppliers ${tx({ organization_id: user.organizationId, ...supplierRow(v.data) })} returning id`;
      return row.id;
    });
    revalidatePath("/suppliers");
    return { ok: true, data: { id } };
  } catch (e) {
    if (isUniqueViolation(e, "name")) return { ok: false, error: "入力内容を確認してください", fieldErrors: { name: "同じ名前の仕入先があります" } };
    return { ok: false, error: toUserMessage(e) };
  }
}

export async function updateSupplier(id: string, input: unknown): Promise<ActionResult> {
  if (!uuidSchema.safeParse(id).success) return { ok: false, error: "不正な操作です" };
  const v = validate(supplierSchema, input);
  if (!v.ok) return v.result;
  try {
    const updated = await asCurrentUser((tx) => tx`update suppliers set ${tx(supplierRow(v.data))} where id = ${id} returning id`);
    if (updated.length === 0) return { ok: false, error: "この操作を行う権限がありません" };
  } catch (e) {
    if (isUniqueViolation(e, "name")) return { ok: false, error: "入力内容を確認してください", fieldErrors: { name: "同じ名前の仕入先があります" } };
    return { ok: false, error: toUserMessage(e) };
  }
  revalidatePath("/suppliers");
  revalidatePath(`/suppliers/${id}`);
  return { ok: true };
}
