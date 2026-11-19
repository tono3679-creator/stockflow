import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { asUser, type Tx } from "@/lib/db";
import type { OrgRole } from "@/lib/domain/labels";
import { readSession } from "@/lib/session";

export type OrgSettings = {
  timezone: string;
  companyName: string;
  postalCode: string;
  address: string;
  phone: string;
  email: string;
  contactName: string;
  poNote: string;
  staleDays: number;
  defaultLeadDays: number;
};

export type CurrentUser = {
  userId: string;
  role: OrgRole;
  organizationId: string;
  organizationName: string;
  displayName: string;
  isDemo: boolean;
  isAnonymous: boolean;
  settings: OrgSettings;
};

/** ログイン中の利用者と所属組織（未ログイン・所属なしなら null） */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await readSession();
  if (!session) return null;
  const rows = await asUser(session.id, (tx) => tx<{
    role: OrgRole; organization_id: string; organization_name: string; display_name: string; is_demo: boolean;
    timezone: string; company_name: string; postal_code: string; address: string; phone: string; email: string; contact_name: string;
    po_note: string; stale_days: number; default_lead_days: number;
  }[]>`
    select m.role, o.id organization_id, o.name organization_name, p.display_name, o.is_demo,
           s.timezone, s.company_name, s.postal_code, s.address, s.phone, s.email, s.contact_name, s.po_note, s.stale_days, s.default_lead_days
      from organizations o
      join organization_members m on m.organization_id = o.id and m.user_id = ${session.id} and m.is_active
      join profiles p on p.id = m.user_id
      join organization_settings s on s.organization_id = o.id
     where o.id = current_org_id()`, session.organizationId);
  const row = rows[0];
  if (!row) return null;
  return {
    userId: session.id,
    role: row.role,
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    displayName: row.display_name,
    isDemo: row.is_demo,
    isAnonymous: session.isAnonymous,
    settings: {
      timezone: row.timezone,
      companyName: row.company_name,
      postalCode: row.postal_code,
      address: row.address,
      phone: row.phone,
      email: row.email,
      contactName: row.contact_name,
      poNote: row.po_note,
      staleDays: row.stale_days,
      defaultLeadDays: row.default_lead_days,
    },
  };
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** 役割が足りなければダッシュボードへ（画面用。Server Actions も同じ確認をし、DB の関数と RLS が最終的に断る） */
export async function requireRole(roles: OrgRole[]): Promise<CurrentUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect("/dashboard?denied=1");
  return user;
}

/** ログイン中の利用者として RLS 付きで実行（データ取得と Server Actions の入口） */
export async function asCurrentUser<T>(fn: (tx: Tx, user: CurrentUser) => Promise<T>): Promise<T> {
  const user = await requireUser();
  return asUser(user.userId, (tx) => fn(tx, user), user.organizationId);
}
