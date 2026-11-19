import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, connect, createProduct, createTenant, dropTenant, errorOf, key, type TestTenant } from "./helpers";

/** 会社ごとの分離（RLS）・役割ごとの権限・DB の権限の一覧 */
const sql = connect();
let a: TestTenant;
let b: TestTenant;
beforeAll(async () => { a = await createTenant(sql, 41); b = await createTenant(sql, 42); });
afterAll(async () => { await dropTenant(sql, a); await dropTenant(sql, b); await sql.end(); });

const TABLES = ["categories", "suppliers", "products", "stock_balances", "stock_movements", "inventory_adjustments", "purchase_orders",
  "purchase_order_items", "stock_receipts", "stock_receipt_items", "organization_settings", "product_stock"] as const;

describe("会社ごとの分離", () => {
  it("自分の会社のデータしか見えない（すべての表）", async () => {
    for (const table of TABLES) {
      const orgs = await as(sql, a, a.staff.admin, (tx) => tx<{ organization_id: string }[]>`select distinct organization_id from ${tx(`public.${table}`)}`);
      expect(orgs.length, table).toBeGreaterThan(0);
      expect(orgs.map((r) => r.organization_id), table).toEqual([a.orgId]);
    }
  });

  it("所属していない会社を指定しても何も見えない", async () => {
    const [r] = await as(sql, b, a.staff.admin, (tx) => tx<{ n: number }[]>`select count(*)::int n from public.products`);
    expect(r.n).toBe(0);
  });

  it("他社の行は ID を指定しても読めず、書き換えられない", async () => {
    const target = b.data.products[0];
    expect(await as(sql, a, a.staff.admin, (tx) => tx`select id from products where id = ${target.id}`)).toHaveLength(0);
    expect(await as(sql, a, a.staff.admin, (tx) => tx`update products set name = 'x' where id = ${target.id} returning id`)).toHaveLength(0);
    expect(await as(sql, a, a.staff.admin, (tx) => tx`delete from categories where id = ${b.data.categories[0].id} returning id`)).toHaveLength(0);
  });

  it("他社の ID で行を作れない", async () => {
    const err = await errorOf(as(sql, a, a.staff.admin, (tx) => tx`insert into products (organization_id, code, name) values (${b.orgId}, 'X-1', '侵入テスト')`));
    expect(err).toMatch(/row-level security/);
  });

  it("他社の商品・発注書を DB の関数から操作できない", async () => {
    const p = b.data.products[0].id;
    expect(await errorOf(as(sql, a, a.staff.staff, (tx) => tx`select record_stock_movement(${p}, 'in', 1, ${a.data.today}::date, '', ${key()})`))).toMatch(/見つかりません/);
    const po = b.data.purchaseOrders.find((x) => x.status === "ordered")!;
    expect(await errorOf(as(sql, a, a.staff.staff, (tx) => tx`select cancel_purchase_order(${po.id}, 'x')`))).toBe("発注書が見つかりません");
    expect(await errorOf(as(sql, a, a.staff.staff, (tx) => tx`select create_purchase_orders(${tx.json([{ product_id: p, quantity: 1 }])}, 'draft', ${a.data.today}::date, null, '', ${key()})`))).not.toBeNull();
    const [s] = await sql<{ status: string }[]>`select status from purchase_orders where id = ${po.id}`;
    expect(s.status).toBe("ordered");
  });

  it("他社の仕入先を指定して発注できない", async () => {
    const p = await createProduct(sql, a);
    const err = await errorOf(as(sql, a, a.staff.staff, (tx) => tx`select create_purchase_orders(${tx.json([{ product_id: p, quantity: 1, supplier_id: b.data.suppliers[0].id }])}, 'draft', ${a.data.today}::date, null, '', ${key()})`));
    expect(err).toMatch(/仕入先が見つかりません/);
  });
});

describe("役割ごとの権限", () => {
  it("商品マスタを変えられるのは管理者だけ", async () => {
    const id = a.data.products[0].id;
    expect(await as(sql, a, a.staff.admin, (tx) => tx`update products set location = 'Z-9' where id = ${id} returning id`)).toHaveLength(1);
    expect(await as(sql, a, a.staff.staff, (tx) => tx`update products set location = 'Z-1' where id = ${id} returning id`)).toHaveLength(0);
    expect(await errorOf(as(sql, a, a.staff.staff, (tx) => tx`insert into products (organization_id, code, name) values (${a.orgId}, 'S-1', '担当者')`))).toMatch(/row-level security/);
    expect(await errorOf(as(sql, a, a.staff.viewer, (tx) => tx`insert into suppliers (organization_id, name) values (${a.orgId}, '閲覧者')`))).toMatch(/row-level security/);
  });

  it("担当者は入出庫・発注できるが、調整・取消・CSV取込はできない", async () => {
    const p = await createProduct(sql, a);
    await as(sql, a, a.staff.staff, (tx) => tx`select record_stock_movement(${p}, 'in', 5, ${a.data.today}::date, '', ${key()})`);
    expect(await errorOf(as(sql, a, a.staff.staff, (tx) => tx`select adjust_stock(${p}, 1, ${a.data.today}::date, 'x', ${key()})`))).toMatch(/権限/);
    expect(await errorOf(as(sql, a, a.staff.staff, (tx) => tx`select import_products(${tx.json([{ code: "Z", name: "Z" }])}, 'a.csv', ${"0".repeat(64)})`))).toMatch(/権限/);
  });

  it("閲覧者は何も書き込めない", async () => {
    const p = a.data.products[0].id;
    for (const q of [
      (tx: Parameters<Parameters<typeof as>[3]>[0]) => tx`select record_stock_movement(${p}, 'in', 1, ${a.data.today}::date, '', ${key()})`,
      (tx: Parameters<Parameters<typeof as>[3]>[0]) => tx`select create_purchase_orders(${tx.json([{ product_id: p, quantity: 1 }])}, 'draft', ${a.data.today}::date, null, '', ${key()})`,
      (tx: Parameters<Parameters<typeof as>[3]>[0]) => tx`select import_stock('movements', ${tx.json([{ code: "x", quantity: 1, occurred_on: a.data.today, direction: "in" }])}, 'a.csv', ${"1".repeat(64)})`,
    ]) expect(await errorOf(as(sql, a, a.staff.viewer, q))).toMatch(/権限/);
    expect(await as(sql, a, a.staff.viewer, (tx) => tx`update organization_settings set stale_days = 30 returning organization_id`)).toHaveLength(0);
  });

  it("操作の記録は管理者だけが見られる", async () => {
    const [x] = await as(sql, a, a.staff.staff, (tx) => tx<{ n: number }[]>`select count(*)::int n from audit_logs`);
    expect(x.n).toBe(0);
    const [y] = await as(sql, a, a.staff.admin, (tx) => tx<{ n: number }[]>`select count(*)::int n from audit_logs`);
    expect(y.n).toBeGreaterThan(0);
  });

  it("利用停止したメンバーは何も見えない", async () => {
    await sql`update organization_members set is_active = false where organization_id = ${a.orgId} and user_id = ${a.staff.viewer}`;
    const [r] = await as(sql, a, a.staff.viewer, (tx) => tx<{ n: number }[]>`select count(*)::int n from products`);
    expect(r.n).toBe(0);
    await sql`update organization_members set is_active = true where organization_id = ${a.orgId} and user_id = ${a.staff.viewer}`;
  });

  it("最後の管理者を外せない", async () => {
    const err = await errorOf(as(sql, a, a.staff.admin, (tx) => tx`update organization_members set role = 'staff' where user_id = ${a.staff.admin}`));
    expect(err).toMatch(/管理者/);
  });
});

describe("CSV 取込", () => {
  it("同じ入出庫ファイルは2回取り込めない（在庫が二重に増えない）", async () => {
    const p = await createProduct(sql, a);
    const [{ code }] = await sql<{ code: string }[]>`select code from products where id = ${p}`;
    const rows = [{ code, quantity: 5, occurred_on: a.data.today, direction: "in" }];
    const hash = "a".repeat(63) + "1";
    const r = await as(sql, a, a.staff.admin, (tx) => tx<{ r: { inserted: number } }[]>`select import_stock('movements', ${tx.json(rows)}, 'mv.csv', ${hash}) r`);
    expect(r[0].r.inserted).toBe(1);
    const err = await errorOf(as(sql, a, a.staff.admin, (tx) => tx`select import_stock('movements', ${tx.json(rows)}, 'mv.csv', ${hash})`));
    expect(err).toMatch(/取り込み済み/);
    const [b2] = await sql<{ on_hand: number }[]>`select on_hand from stock_balances where product_id = ${p}`;
    expect(b2.on_hand).toBe(5);
  });

  it("初期在庫は登録済みの商品を飛ばす。1行でも誤りがあれば全体を取り込まない", async () => {
    const p1 = await createProduct(sql, a);
    const p2 = await createProduct(sql, a);
    const codes = await sql<{ id: string; code: string }[]>`select id, code from products where id in (${p1}, ${p2})`;
    const c = (id: string) => codes.find((x) => x.id === id)!.code;
    await as(sql, a, a.staff.admin, (tx) => tx`select set_opening_stock(${p1}, 3, ${a.data.today}::date, ${key()})`);
    const r = await as(sql, a, a.staff.admin, (tx) => tx<{ r: { inserted: number; skipped: number } }[]>`
      select import_stock('opening', ${tx.json([{ code: c(p1), quantity: 9, occurred_on: a.data.today }, { code: c(p2), quantity: 4, occurred_on: a.data.today }])}, 'o.csv', ${"b".repeat(64)}) r`);
    expect(r[0].r).toMatchObject({ inserted: 1, skipped: 1 });
    const err = await errorOf(as(sql, a, a.staff.admin, (tx) => tx`
      select import_stock('movements', ${tx.json([{ code: c(p2), quantity: 1, occurred_on: a.data.today, direction: "in" }, { code: "NOPE", quantity: 1, occurred_on: a.data.today, direction: "in" }])}, 'm.csv', ${"c".repeat(64)})`));
    expect(err).toMatch(/2行目：商品コード「NOPE」が見つかりません/);
    const [bal] = await sql<{ on_hand: number }[]>`select on_hand from stock_balances where product_id = ${p2}`;
    expect(bal.on_hand).toBe(4);
  });

  it("商品マスタはコードで上書きし、カテゴリ・仕入先を名前で作る", async () => {
    const code = a.data.products[1].code;
    const r = await as(sql, a, a.staff.admin, (tx) => tx<{ r: { inserted: number; updated: number } }[]>`
      select import_products(${tx.json([{ code, name: "上書き", unit: "本", reorder_point: 1, target_stock: 2 }, { code: "NEW-X", name: "新規", category: "新しい分類", supplier: "新しい仕入先" }])}, 'p.csv', ${"d".repeat(64)}) r`);
    expect(r[0].r).toMatchObject({ inserted: 1, updated: 1 });
    const [p] = await sql<{ name: string; cat: string; sup: string }[]>`
      select p.name, c.name cat, s.name sup from products p join categories c on c.id = p.category_id join suppliers s on s.id = p.supplier_id where p.organization_id = ${a.orgId} and p.code = 'NEW-X'`;
    expect(p).toEqual({ name: "新規", cat: "新しい分類", sup: "新しい仕入先" });
  });
});

describe("DB の権限の一覧（広げてしまわないよう固定する）", () => {
  it("表はすべて読み取りのみ（カテゴリの削除を除く）。書き込みは列単位で許可", async () => {
    const rows = await sql<{ g: string }[]>`
      select table_name || ':' || string_agg(privilege_type, ',' order by privilege_type) as g
        from information_schema.role_table_grants where grantee = 'authenticated' and table_schema in ('public', 'app_auth', 'app_private')
       group by table_schema, table_name order by 1`;
    expect(rows.map((r) => r.g)).toEqual([
      "audit_logs:SELECT", "categories:DELETE,SELECT", "import_jobs:SELECT", "inventory_adjustments:SELECT", "organization_members:SELECT",
      "organization_settings:SELECT", "organizations:SELECT", "product_stock:SELECT", "products:SELECT", "profiles:SELECT",
      "purchase_order_items:SELECT", "purchase_orders:SELECT", "stock_balances:SELECT", "stock_movements:SELECT", "stock_receipt_items:SELECT",
      "stock_receipts:SELECT", "suppliers:SELECT",
    ]);
  });

  it("在庫・発注・入荷・操作記録の表には書き込めない（DB の関数だけが書く）", async () => {
    const rows = await sql<{ t: string }[]>`
      select distinct table_name || ':' || privilege_type as t from information_schema.column_privileges
       where grantee = 'authenticated' and table_schema in ('public', 'app_auth', 'app_private') and privilege_type in ('INSERT', 'UPDATE') order by 1`;
    expect(rows.map((r) => r.t)).toEqual([
      "categories:INSERT", "categories:UPDATE", "organization_members:UPDATE", "organization_settings:UPDATE", "organizations:UPDATE",
      "products:INSERT", "products:UPDATE", "profiles:UPDATE", "suppliers:INSERT", "suppliers:UPDATE",
    ]);
  });

  it("未ログイン（anon）は何も読めない", async () => {
    const err = await errorOf(sql.begin(async (tx) => {
      await tx`set local role anon`;
      await tx`select count(*) from public.products`;
    }));
    expect(err).toMatch(/permission denied/);
  });

  it("ログイン情報（パスワード・セッション）は読めない", async () => {
    for (const table of ["app_auth.users", "app_auth.sessions"]) {
      const err = await errorOf(as(sql, a, a.staff.admin, (tx) => tx.unsafe(`select * from ${table} limit 1`)));
      expect(err, table).toMatch(/permission denied/);
    }
  });
});
