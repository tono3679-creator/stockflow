import "server-only";
import type { Tx } from "@/lib/db";
import type { MovementKind, PoStatus } from "@/lib/domain/labels";
import type { StockStatus } from "@/lib/domain/reorder";

export type ProductStock = {
  id: string; code: string; name: string; category_id: string | null; category_name: string | null; unit: string;
  supplier_id: string | null; supplier_name: string | null; unit_cost: number; reorder_point: number; target_stock: number;
  order_lot: number; min_order_qty: number; location: string; is_active: boolean; notes: string;
  on_hand: number; last_out_on: string | null; on_order: number; draft_qty: number; stock_value: number;
  status: StockStatus; suggested_qty: number; needs_order: boolean;
};

export type StockFilter = "all" | "ok" | "low" | "out" | "attention";
export const PAGE_SIZE = 50;

export async function listProductStock(
  tx: Tx,
  opts: { q?: string; filter?: StockFilter; category?: string; supplier?: string; includeInactive?: boolean; byCode?: boolean; page?: number; limit?: number },
): Promise<{ rows: ProductStock[]; total: number; counts: Record<"all" | "ok" | "low" | "out", number> }> {
  const q = opts.q?.trim() ?? "";
  const like = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
  const limit = opts.limit ?? PAGE_SIZE;
  const offset = Math.max(0, (opts.page ?? 1) - 1) * limit;
  const where = tx`
    (${!!opts.includeInactive} or is_active)
    and (${q} = '' or name ilike ${like} or code ilike ${like})
    and (${opts.category ?? ""} = '' or category_id::text = ${opts.category ?? ""})
    and (${opts.supplier ?? ""} = '' or supplier_id::text = ${opts.supplier ?? ""})`;
  const f = opts.filter ?? "all";
  const rows = await tx<(ProductStock & { total: number })[]>`
    select *, count(*) over ()::int total from product_stock
     where ${where}
       and (${f} = 'all' or (${f} = 'attention' and (status = 'out' or needs_order)) or status = ${f})
     order by ${opts.byCode ? tx`code` : tx`case status when 'out' then 0 when 'low' then 1 else 2 end, needs_order desc, code`}
     limit ${limit} offset ${offset}`;
  const [c] = await tx<{ all: number; ok: number; low: number; out: number }[]>`
    select count(*)::int "all", (count(*) filter (where status = 'ok'))::int ok, (count(*) filter (where status = 'low'))::int low,
           (count(*) filter (where status = 'out'))::int "out"
      from product_stock where ${where}`;
  return { rows, total: rows[0]?.total ?? 0, counts: c };
}

export async function getProductStock(tx: Tx, id: string): Promise<ProductStock | null> {
  const [row] = await tx<ProductStock[]>`select * from product_stock where id = ${id}`;
  return row ?? null;
}

export type MovementRow = {
  id: string; product_id: string; product_name: string; product_code: string; unit: string; kind: MovementKind; quantity: number;
  balance_after: number; occurred_on: string; note: string; created_at: Date; created_by_name: string | null;
  reversed: boolean; reverses_id: string | null; po_id: string | null; po_number: string | null;
};

export async function listMovements(
  tx: Tx,
  opts: { productId?: string; kind?: string; from?: string; to?: string; q?: string; page?: number; limit?: number },
): Promise<{ rows: MovementRow[]; total: number }> {
  const limit = opts.limit ?? PAGE_SIZE;
  const offset = Math.max(0, (opts.page ?? 1) - 1) * limit;
  const q = opts.q?.trim() ?? "";
  const like = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
  const kinds = opts.kind === "in" ? ["in", "receipt", "opening"] : opts.kind === "out" ? ["out"] : opts.kind === "adjust" ? ["adjust", "reversal"] : null;
  const rows = await tx<(MovementRow & { total: number })[]>`
    select m.id, m.product_id, p.name product_name, p.code product_code, p.unit, m.kind, m.quantity, m.balance_after, m.occurred_on, m.note,
           m.created_at, pr.display_name created_by_name, m.reverses_id,
           exists (select 1 from stock_movements r where r.organization_id = m.organization_id and r.reverses_id = m.id) reversed,
           po.id po_id, po.number po_number,
           count(*) over ()::int total
      from stock_movements m
      join products p on p.organization_id = m.organization_id and p.id = m.product_id
      left join profiles pr on pr.id = m.created_by
      left join stock_receipt_items ri on ri.organization_id = m.organization_id and ri.id = m.receipt_item_id
      left join stock_receipts sr on sr.organization_id = ri.organization_id and sr.id = ri.receipt_id
      left join purchase_orders po on po.organization_id = sr.organization_id and po.id = sr.purchase_order_id
     where (${opts.productId ?? ""} = '' or m.product_id::text = ${opts.productId ?? ""})
       and (${kinds === null} or m.kind::text = any(${kinds ?? []}::text[]))
       and (${opts.from ?? ""} = '' or m.occurred_on >= ${opts.from || "1900-01-01"}::date)
       and (${opts.to ?? ""} = '' or m.occurred_on <= ${opts.to || "2999-12-31"}::date)
       and (${q} = '' or p.name ilike ${like} or p.code ilike ${like})
     order by m.occurred_on desc, m.created_at desc
     limit ${limit} offset ${offset}`;
  return { rows, total: rows[0]?.total ?? 0 };
}

export type ProductOrderRow = {
  po_id: string; number: string; status: PoStatus; order_on: string; expected_on: string | null; quantity: number; received_qty: number;
  unit_price: number; supplier_name: string; delayed: boolean;
};

export async function productOrders(tx: Tx, productId: string): Promise<ProductOrderRow[]> {
  return tx<ProductOrderRow[]>`
    select po.id po_id, po.number, po.status, po.order_on, po.expected_on, i.quantity, i.received_qty, i.unit_price, s.name supplier_name,
           (po.status in ('ordered', 'partial') and po.expected_on < org_today(po.organization_id)) delayed
      from purchase_order_items i
      join purchase_orders po on po.organization_id = i.organization_id and po.id = i.purchase_order_id
      join suppliers s on s.organization_id = po.organization_id and s.id = po.supplier_id
     where i.product_id = ${productId}
     order by po.order_on desc, po.number desc limit 30`;
}

/** 在庫推移（日ごとの残高。期間の初日の残高 + 期間中の増減の累計） */
export async function productTrend(tx: Tx, productId: string, days = 90): Promise<{ date: string; qty: number }[]> {
  return tx<{ date: string; qty: number }[]>`
    with t as (select org_today(organization_id) today from products where id = ${productId}),
    d as (select generate_series((select today from t) - ${days}::int, (select today from t), interval '1 day')::date date)
    select d.date::text date,
           coalesce((select sum(m.quantity) from stock_movements m where m.product_id = ${productId} and m.occurred_on <= d.date), 0)::numeric qty
      from d order by d.date`;
}
