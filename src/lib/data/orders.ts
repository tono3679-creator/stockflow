import "server-only";
import type { Tx } from "@/lib/db";
import type { PoStatus } from "@/lib/domain/labels";
import { PAGE_SIZE } from "./inventory";

export type OrderRow = {
  id: string; number: string; status: PoStatus; supplier_id: string; supplier_name: string; order_on: string; expected_on: string | null;
  total_amount: number; item_count: number; delayed: boolean; first_item: string | null;
};

export type OrderFilter = "" | "draft" | "open" | "partial" | "delayed" | "received" | "cancelled";

export async function listOrders(
  tx: Tx, opts: { status?: OrderFilter; supplierId?: string; q?: string; page?: number; limit?: number },
): Promise<{ rows: OrderRow[]; total: number; counts: Record<"draft" | "open" | "delayed", number> }> {
  const limit = opts.limit ?? PAGE_SIZE;
  const offset = Math.max(0, (opts.page ?? 1) - 1) * limit;
  const st = opts.status ?? "";
  const q = opts.q?.trim() ?? "";
  const like = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
  const rows = await tx<(OrderRow & { total: number })[]>`
    with o as (
      select po.id, po.number, po.status, po.supplier_id, s.name supplier_name, po.order_on, po.expected_on, po.total_amount,
             (select count(*)::int from purchase_order_items i where i.organization_id = po.organization_id and i.purchase_order_id = po.id) item_count,
             (select p.name from purchase_order_items i join products p on p.organization_id = i.organization_id and p.id = i.product_id
               where i.organization_id = po.organization_id and i.purchase_order_id = po.id order by i.line_no limit 1) first_item,
             (po.status in ('ordered', 'partial') and po.expected_on < org_today(po.organization_id)) delayed, po.created_at
        from purchase_orders po join suppliers s on s.organization_id = po.organization_id and s.id = po.supplier_id
       where (${opts.supplierId ?? ""} = '' or po.supplier_id::text = ${opts.supplierId ?? ""})
         and (${q} = '' or po.number ilike ${like} or s.name ilike ${like})
    )
    select *, count(*) over ()::int total from o
     where ${st} = ''
        or (${st} = 'open' and status in ('ordered', 'partial'))
        or (${st} = 'delayed' and delayed)
        or status::text = ${st}
     order by case when status = 'draft' then 0 when delayed then 1 when status in ('ordered', 'partial') then 2 else 3 end,
              order_on desc, number desc
     limit ${limit} offset ${offset}`;
  const [c] = await tx<{ draft: number; open: number; delayed: number }[]>`
    select (count(*) filter (where status = 'draft'))::int draft,
           (count(*) filter (where status in ('ordered', 'partial')))::int open,
           (count(*) filter (where status in ('ordered', 'partial') and expected_on < org_today(organization_id)))::int delayed
      from purchase_orders where (${opts.supplierId ?? ""} = '' or supplier_id::text = ${opts.supplierId ?? ""})`;
  return { rows, total: rows[0]?.total ?? 0, counts: c };
}

export type OrderItem = {
  id: string; product_id: string; code: string; name: string; line_no: number; quantity: number; unit: string; unit_price: number; amount: number;
  received_qty: number; on_hand: number;
};
export type OrderDetail = OrderRow & {
  notes: string; ordered_at: Date | null; cancelled_at: Date | null; cancel_reason: string; pdf_path: string | null; pdf_saved_at: Date | null;
  created_by_name: string | null; created_at: Date;
  supplier: { name: string; contact_name: string; phone: string; email: string; address: string };
  items: OrderItem[];
  receipts: { id: string; received_on: string; note: string; created_by_name: string | null; lines: { name: string; quantity: number; unit: string }[] }[];
};

export async function getOrder(tx: Tx, id: string): Promise<OrderDetail | null> {
  const [po] = await tx<(OrderRow & Omit<OrderDetail, keyof OrderRow | "supplier" | "items" | "receipts"> & { s_name: string; s_contact: string; s_phone: string; s_email: string; s_address: string })[]>`
    select po.id, po.number, po.status, po.supplier_id, s.name supplier_name, po.order_on, po.expected_on, po.total_amount, 0 item_count, null first_item,
           (po.status in ('ordered', 'partial') and po.expected_on < org_today(po.organization_id)) delayed,
           po.notes, po.ordered_at, po.cancelled_at, po.cancel_reason, po.pdf_path, po.pdf_saved_at, pr.display_name created_by_name, po.created_at,
           s.name s_name, s.contact_name s_contact, s.phone s_phone, s.email s_email, s.address s_address
      from purchase_orders po
      join suppliers s on s.organization_id = po.organization_id and s.id = po.supplier_id
      left join profiles pr on pr.id = po.created_by
     where po.id = ${id}`;
  if (!po) return null;
  const items = await tx<OrderItem[]>`
    select i.id, i.product_id, p.code, p.name, i.line_no, i.quantity, i.unit, i.unit_price, i.amount, i.received_qty, b.on_hand
      from purchase_order_items i
      join products p on p.organization_id = i.organization_id and p.id = i.product_id
      join stock_balances b on b.organization_id = p.organization_id and b.product_id = p.id
     where i.purchase_order_id = ${id} order by i.line_no`;
  const receiptRows = await tx<{ id: string; received_on: string; note: string; created_by_name: string | null; name: string; quantity: number; unit: string }[]>`
    select r.id, r.received_on, r.note, pr.display_name created_by_name, p.name, ri.quantity, i.unit
      from stock_receipts r
      join stock_receipt_items ri on ri.organization_id = r.organization_id and ri.receipt_id = r.id
      join purchase_order_items i on i.organization_id = ri.organization_id and i.id = ri.purchase_order_item_id
      join products p on p.organization_id = i.organization_id and p.id = i.product_id
      left join profiles pr on pr.id = r.created_by
     where r.purchase_order_id = ${id} order by r.received_on, r.created_at, i.line_no`;
  const receipts: OrderDetail["receipts"] = [];
  for (const r of receiptRows) {
    let rec = receipts.find((x) => x.id === r.id);
    if (!rec) receipts.push((rec = { id: r.id, received_on: r.received_on, note: r.note, created_by_name: r.created_by_name, lines: [] }));
    rec.lines.push({ name: r.name, quantity: r.quantity, unit: r.unit });
  }
  const { s_name, s_contact, s_phone, s_email, s_address, ...rest } = po;
  return { ...rest, item_count: items.length, supplier: { name: s_name, contact_name: s_contact, phone: s_phone, email: s_email, address: s_address }, items, receipts };
}

export type SuggestionRow = {
  id: string; code: string; name: string; unit: string; on_hand: number; on_order: number; draft_qty: number; reorder_point: number; target_stock: number;
  suggested_qty: number; unit_cost: number; supplier_id: string | null; supplier_name: string | null; status: "out" | "low" | "ok";
};

/** 発注提案：発注待ちの商品（発注点以下で、発注残を含めても目標在庫に届かない） */
export async function listSuggestions(tx: Tx): Promise<SuggestionRow[]> {
  return tx<SuggestionRow[]>`
    select id, code, name, unit, on_hand, on_order, draft_qty, reorder_point, target_stock, suggested_qty, unit_cost, supplier_id, supplier_name, status
      from product_stock
     where is_active and needs_order
     order by supplier_name nulls last, case status when 'out' then 0 else 1 end, code`;
}
