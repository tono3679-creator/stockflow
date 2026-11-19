import postgres, { type Sql, type TransactionSql } from "postgres";
import { randomUUID } from "node:crypto";
import { generateDemoData, type DemoDataset } from "@/lib/demo/generator";
import { loadDataset } from "@/lib/demo/load";
import { DB_TYPES } from "@/lib/db/types";
import { runAsUser } from "@/lib/db/rls";

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/stockflow";

export function connect(): Sql {
  return postgres(TEST_DATABASE_URL, { max: 4, prepare: false, onnotice: () => {}, types: DB_TYPES });
}

export type TestTenant = { orgId: string; data: DemoDataset; staff: DemoDataset["staff"] };

/** テスト用の組織を1つ作る（デモと同じ株式会社山田設備のデータ。利用者は admin / staff / viewer） */
export async function createTenant(sql: Sql, seed = 7, now = new Date()): Promise<TestTenant> {
  const orgId = randomUUID();
  const data = generateDemoData({ seed, now, organizationId: orgId, mode: { kind: "demo", expiresAt: new Date(Date.now() + 3600_000) } });
  await loadDataset(sql, data);
  return { orgId, data, staff: data.staff };
}

export async function dropTenant(sql: Sql, t: TestTenant) {
  await sql`delete from public.organizations where id = ${t.orgId}`;
  await sql`delete from app_auth.users where id in ${sql(Object.values(t.staff))}`;
}

/** その組織の利用者として実行する（RLS が効く） */
export function as<T>(sql: Sql, t: TestTenant, userId: string, fn: (tx: TransactionSql) => Promise<T>) {
  return runAsUser(sql, userId, fn, t.orgId);
}

/** 例外のメッセージ（失敗しなかったら null） */
export async function errorOf(p: Promise<unknown>): Promise<string | null> {
  try {
    await p;
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

let seq = 0;
/** テスト用の商品を1つ作る（在庫 0。仕入先は組織の最初の仕入先） */
export async function createProduct(
  sql: Sql, t: TestTenant,
  opts: { unit?: string; reorderPoint?: number; targetStock?: number; orderLot?: number; minOrderQty?: number; unitCost?: number; supplierId?: string | null } = {},
): Promise<string> {
  const [p] = await sql<{ id: string }[]>`
    insert into public.products ${sql({
      organization_id: t.orgId, code: `T-${Date.now().toString(36)}-${++seq}`, name: `テスト商品${seq}`, unit: opts.unit ?? "個",
      supplier_id: opts.supplierId === undefined ? t.data.suppliers[0].id : opts.supplierId,
      unit_cost: opts.unitCost ?? 100, reorder_point: opts.reorderPoint ?? 10, target_stock: opts.targetStock ?? 30,
      order_lot: opts.orderLot ?? 1, min_order_qty: opts.minOrderQty ?? 0,
    })} returning id`;
  return p.id;
}

export const key = () => `test-${randomUUID()}`;

export async function onHand(sql: Sql, productId: string): Promise<number> {
  const [b] = await sql<{ on_hand: number }[]>`select on_hand from public.stock_balances where product_id = ${productId}`;
  return b.on_hand;
}
