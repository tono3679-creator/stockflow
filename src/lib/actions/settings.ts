"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { asCurrentUser } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { categorySchema, memberSchema, settingsSchema } from "@/lib/validation";
import { isUniqueViolation, toUserMessage } from "./errors";
import { run, uuidSchema, validate } from "./helpers";
import type { ActionResult } from "./result";

const denied = () => Object.assign(new Error("設定を変更できるのは管理者だけです"), { code: "42501" });

/** 会社情報（発注書に印字）・滞留の判定日数・既定のリードタイム */
export async function saveSettings(input: unknown): Promise<ActionResult> {
  const v = validate(settingsSchema, input);
  if (!v.ok) return v.result;
  const d = v.data;
  const r = await run(() => asCurrentUser(async (tx, user) => {
    if (user.role !== "admin") throw denied();
    const [row] = await tx`
      update organization_settings set ${tx({
        company_name: d.companyName, postal_code: d.postalCode, address: d.address, phone: d.phone, email: d.email,
        contact_name: d.contactName, po_note: d.poNote, stale_days: d.staleDays, default_lead_days: d.defaultLeadDays,
      })} where organization_id = ${user.organizationId} returning organization_id`;
    if (!row) throw denied();
  }));
  if (!r.ok) return r.result;
  revalidatePath("/", "layout");
  return { ok: true };
}

/** カテゴリの追加・名前の変更 */
export async function saveCategory(input: unknown): Promise<ActionResult> {
  const v = validate(categorySchema, input);
  if (!v.ok) return v.result;
  const d = v.data;
  try {
    await asCurrentUser(async (tx, user) => {
      if (user.role !== "admin") throw denied();
      if (d.id) {
        const [row] = await tx`update categories set name = ${d.name} where id = ${d.id} returning id`;
        if (!row) throw denied();
      } else {
        const [{ n }] = await tx<{ n: number }[]>`select coalesce(max(sort_order), 0) + 1 n from categories`;
        await tx`insert into categories ${tx({ organization_id: user.organizationId, name: d.name, sort_order: n })}`;
      }
    });
  } catch (e) {
    if (isUniqueViolation(e, "name")) return { ok: false, error: "同じ名前のカテゴリがあります" };
    return { ok: false, error: toUserMessage(e) };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

/** カテゴリの削除（商品のカテゴリは「未分類」になる） */
export async function deleteCategory(id: string): Promise<ActionResult> {
  if (!uuidSchema.safeParse(id).success) return { ok: false, error: "不正な操作です" };
  const r = await run(() => asCurrentUser(async (tx, user) => {
    if (user.role !== "admin") throw denied();
    const [row] = await tx`delete from categories where id = ${id} returning id`;
    if (!row) throw denied();
  }));
  if (!r.ok) return r.result;
  revalidatePath("/", "layout");
  return { ok: true };
}

/** メンバーの追加（管理者。デモ環境では DB 側で断る） */
export async function addMember(input: unknown): Promise<ActionResult> {
  const v = validate(memberSchema, input);
  if (!v.ok) return v.result;
  const d = v.data;
  const r = await run(async () => {
    const hash = await hashPassword(d.password);
    await asCurrentUser((tx) => tx`select public.admin_add_member(${d.email}, ${d.displayName}, ${d.role}, ${hash})`);
  });
  if (!r.ok) return r.result;
  revalidatePath("/settings");
  return { ok: true };
}

/** 役割の変更・利用停止（管理者が1人もいなくなる変更は DB が断る） */
export async function updateMember(userId: string, role: string, isActive: boolean): Promise<ActionResult> {
  const parsed = z.object({ userId: uuidSchema, role: z.enum(["admin", "staff", "viewer"]), isActive: z.boolean() }).safeParse({ userId, role, isActive });
  if (!parsed.success) return { ok: false, error: "不正な操作です" };
  const r = await run(() => asCurrentUser(async (tx, user) => {
    if (user.role !== "admin") throw denied();
    if (user.isDemo) throw Object.assign(new Error("デモ環境ではメンバーの役割を変更できません。画面上部で役割を切り替えてお試しください"), { code: "42501" });
    const [row] = await tx`update organization_members set role = ${parsed.data.role}, is_active = ${parsed.data.isActive} where user_id = ${parsed.data.userId} returning user_id`;
    if (!row) throw denied();
  }));
  if (!r.ok) return r.result;
  revalidatePath("/settings");
  return { ok: true };
}
