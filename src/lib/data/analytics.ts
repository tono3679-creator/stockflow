import "server-only";
import type { Tx } from "@/lib/db";

/**
 * 集計（ダッシュボード・レポートが共通で使う。数字はすべてここの SQL だけで出す）。
 * 単位の違う数量を足さないため、量の比較は「金額（数量 × 仕入単価）」か「件数」で行う。
 * 在庫金額は管理用の仕入単価（現在の値）で評価した参考値で、会計上の棚卸評価とは別。
 */

export type Kpis = {
  shortage: number; out: number; needsOrder: number; outCount: number; outCountPrev: number; stockValue: number; stockValuePrev: number;
};

export async function kpis(tx: Tx): Promise<Kpis> {
  const [row] = await tx<Kpis[]>`
    with t as (select org_today(current_org_id()) today)
    select
      (select count(*)::int from product_stock where is_active and status in ('out', 'low')) "shortage",
      (select count(*)::int from product_stock where is_active and status = 'out') "out",
      (select count(*)::int from product_stock where is_active and needs_order) "needsOrder",
      (select count(*)::int from stock_movements m, t where m.kind = 'out' and not exists (select 1 from stock_movements r where r.reverses_id = m.id)
         and m.occurred_on >= date_trunc('month', t.today)::date) "outCount",
      (select count(*)::int from stock_movements m, t where m.kind = 'out' and not exists (select 1 from stock_movements r where r.reverses_id = m.id)
         and m.occurred_on >= (date_trunc('month', t.today) - interval '1 month')::date
         and m.occurred_on <= (t.today - interval '1 month')::date) "outCountPrev",
      (select coalesce(sum(stock_value), 0)::bigint from product_stock) "stockValue",
      (select coalesce(round(sum(greatest(x.q, 0) * p.unit_cost)), 0)::bigint from products p, t,
         lateral (select coalesce(sum(m.quantity), 0) q from stock_movements m where m.organization_id = p.organization_id and m.product_id = p.id
                   and m.occurred_on <= (date_trunc('month', t.today) - interval '1 day')::date) x) "stockValuePrev"
    `;
  return row;
}

export type AttentionItem =
  | { kind: "out" | "low"; id: string; name: string; onHand: number; unit: string; reorderPoint: number; suggested: number; covered: boolean }
  | { kind: "draft" | "delayed"; id: string; name: string; number: string; date: string | null; supplier: string };

/** 要対応（優先順：欠品 → 在庫不足 → 発注待ち（下書きのまま）→ 入荷遅延） */
export async function attention(tx: Tx, limit = 5): Promise<{ items: AttentionItem[]; total: number }> {
  const products = await tx<{ id: string; name: string; on_hand: number; unit: string; reorder_point: number; suggested_qty: number; status: "out" | "low"; needs_order: boolean }[]>`
    select id, name, on_hand, unit, reorder_point, suggested_qty, status, needs_order from product_stock
     where is_active and (status = 'out' or needs_order)
     order by case status when 'out' then 0 else 1 end, needs_order desc, on_hand / nullif(reorder_point, 0) nulls first, code`;
  const orders = await tx<{ id: string; number: string; status: string; expected_on: string | null; order_on: string; supplier: string; first_item: string }[]>`
    select po.id, po.number, po.status, po.expected_on, po.order_on, s.name supplier,
           (select p.name from purchase_order_items i join products p on p.id = i.product_id where i.purchase_order_id = po.id order by i.line_no limit 1) first_item
      from purchase_orders po join suppliers s on s.id = po.supplier_id
     where po.status = 'draft' or (po.status in ('ordered', 'partial') and po.expected_on < org_today(po.organization_id))
     order by case when po.status = 'draft' then 0 else 1 end, po.expected_on nulls last, po.number`;
  const items: AttentionItem[] = [
    ...products.map((p) => ({ kind: p.status, id: p.id, name: p.name, onHand: p.on_hand, unit: p.unit, reorderPoint: p.reorder_point, suggested: p.suggested_qty, covered: !p.needs_order })),
    ...orders.map((o) => ({ kind: (o.status === "draft" ? "draft" : "delayed") as "draft" | "delayed", id: o.id, name: o.first_item, number: o.number, date: o.status === "draft" ? o.order_on : o.expected_on, supplier: o.supplier })),
  ];
  return { items: items.slice(0, limit), total: items.length };
}

export type RecentRow = { id: string; date: string; title: string; detail: string; href: string };

export async function recent(tx: Tx): Promise<{ ins: RecentRow[]; outs: RecentRow[]; orders: RecentRow[] }> {
  const moves = await tx<{ id: string; product_id: string; name: string; unit: string; quantity: number; occurred_on: string; kind: string; rn: number }[]>`
    select * from (
      select m.id, m.product_id, p.name, p.unit, m.quantity, m.occurred_on, m.kind,
             row_number() over (partition by (m.kind = 'out') order by m.occurred_on desc, m.created_at desc) rn
        from stock_movements m join products p on p.id = m.product_id
       where m.kind in ('in', 'receipt', 'out') and m.occurred_on >= org_today(m.organization_id) - 60
    ) x where rn <= 4 order by occurred_on desc`;
  const qty = (n: number, u: string) => `${n > 0 ? "+" : "−"}${Math.abs(n).toLocaleString("ja-JP", { maximumFractionDigits: 3 })}${u}`;
  const toRow = (m: (typeof moves)[number]): RecentRow => ({ id: m.id, date: m.occurred_on, title: m.name, detail: qty(m.quantity, m.unit), href: `/inventory/${m.product_id}` });
  const orders = await tx<{ id: string; number: string; order_on: string; supplier: string; total_amount: number; status: string }[]>`
    select po.id, po.number, po.order_on, s.name supplier, po.total_amount, po.status from purchase_orders po join suppliers s on s.id = po.supplier_id
     where po.status <> 'cancelled' order by po.created_at desc limit 4`;
  return {
    ins: moves.filter((m) => m.kind !== "out").map(toRow),
    outs: moves.filter((m) => m.kind === "out").map(toRow),
    orders: orders.map((o) => ({ id: o.id, date: o.order_on, title: o.supplier, detail: `¥${o.total_amount.toLocaleString("ja-JP")}`, href: `/orders/${o.id}` })),
  };
}

/** 月別の入庫・出庫（金額）。初期在庫・棚卸調整・取消は含めない（取消された記録も除く） */
export async function monthlyInOut(tx: Tx, months = 6): Promise<{ month: string; inAmount: number; outAmount: number; outCount: number }[]> {
  return tx`
    with t as (select org_today(current_org_id()) today),
    ms as (select to_char(generate_series(date_trunc('month', t.today) - make_interval(months => ${months - 1}), date_trunc('month', t.today), interval '1 month'), 'YYYY-MM') as month from t)
    select ms.month,
           coalesce(round(sum(abs(m.quantity) * p.unit_cost) filter (where m.kind in ('in', 'receipt'))), 0)::bigint "inAmount",
           coalesce(round(sum(abs(m.quantity) * p.unit_cost) filter (where m.kind = 'out')), 0)::bigint "outAmount",
           (count(m.id) filter (where m.kind = 'out'))::int "outCount"
      from ms
      left join stock_movements m on to_char(m.occurred_on, 'YYYY-MM') = ms.month and m.kind in ('in', 'receipt', 'out')
           and not exists (select 1 from stock_movements r where r.reverses_id = m.id)
      left join products p on p.id = m.product_id
     group by ms.month order by ms.month`;
}

/** 在庫金額の推移（各月末。今月は今日時点） */
export async function stockValueTrend(tx: Tx, months = 6): Promise<{ month: string; amount: number }[]> {
  return tx`
    with t as (select org_today(current_org_id()) today),
    ms as (
      select to_char(d, 'YYYY-MM') as month, least((d + interval '1 month' - interval '1 day')::date, t.today) at_date
        from t, generate_series(date_trunc('month', t.today) - make_interval(months => ${months - 1}), date_trunc('month', t.today), interval '1 month') d
    )
    select ms.month, coalesce(round(sum(greatest(x.q, 0) * p.unit_cost)), 0)::bigint amount
      from ms cross join products p
      cross join lateral (select coalesce(sum(m.quantity), 0) q from stock_movements m where m.product_id = p.id and m.occurred_on <= ms.at_date) x
     group by ms.month order by ms.month`;
}

/** 発注金額の推移（発注日の月。下書き・キャンセルを除く） */
export async function orderAmountTrend(tx: Tx, months = 6): Promise<{ month: string; amount: number }[]> {
  return tx`
    with t as (select org_today(current_org_id()) today),
    ms as (select to_char(generate_series(date_trunc('month', t.today) - make_interval(months => ${months - 1}), date_trunc('month', t.today), interval '1 month'), 'YYYY-MM') as month from t)
    select ms.month, coalesce(sum(po.total_amount), 0)::bigint amount
      from ms left join purchase_orders po on to_char(po.order_on, 'YYYY-MM') = ms.month and po.status not in ('draft', 'cancelled')
     group by ms.month order by ms.month`;
}

/** 在庫不足の件数の推移（各月末に発注点以下だった品目数。発注点は現在の設定で判定） */
export async function shortageTrend(tx: Tx, months = 6): Promise<{ month: string; count: number }[]> {
  return tx`
    with t as (select org_today(current_org_id()) today),
    ms as (
      select to_char(d, 'YYYY-MM') as month, least((d + interval '1 month' - interval '1 day')::date, t.today) at_date
        from t, generate_series(date_trunc('month', t.today) - make_interval(months => ${months - 1}), date_trunc('month', t.today), interval '1 month') d
    )
    select ms.month, (count(*) filter (where x.q <= p.reorder_point))::int count
      from ms cross join products p
      cross join lateral (select coalesce(sum(m.quantity), 0) q from stock_movements m where m.product_id = p.id and m.occurred_on <= ms.at_date) x
     where p.is_active and p.created_at::date <= ms.at_date
     group by ms.month order by ms.month`;
}

/** 商品別の出庫ランキング（出庫金額の順。期間：直近 days 日） */
export async function outRanking(tx: Tx, days = 90, limit = 10) {
  return tx<{ id: string; name: string; unit: string; quantity: number; count: number; amount: number }[]>`
    select p.id, p.name, p.unit, sum(-m.quantity) quantity, count(*)::int count, round(sum(-m.quantity * p.unit_cost))::bigint amount
      from stock_movements m join products p on p.id = m.product_id
     where m.kind = 'out' and m.occurred_on > org_today(m.organization_id) - ${days}::int
       and not exists (select 1 from stock_movements r where r.reverses_id = m.id)
     group by p.id, p.name, p.unit order by amount desc, count desc limit ${limit}`;
}

/** カテゴリ別の在庫金額 */
export async function valueByCategory(tx: Tx) {
  return tx<{ name: string; amount: number; items: number }[]>`
    select coalesce(category_name, '未分類') name, sum(stock_value)::bigint amount, count(*)::int items
      from product_stock where is_active group by 1 order by amount desc`;
}

/** 長期滞留在庫（在庫があり、staleDays 日以上出庫がない。出庫が一度もない商品は登録日から数える） */
export async function staleStock(tx: Tx, staleDays: number) {
  return tx<{ id: string; name: string; unit: string; on_hand: number; stock_value: number; last_out_on: string | null; days: number | null }[]>`
    select s.id, s.name, s.unit, s.on_hand, s.stock_value, s.last_out_on,
           (org_today(s.organization_id) - coalesce(s.last_out_on, p.created_at::date))::int days
      from product_stock s join products p on p.id = s.id
     where s.is_active and s.on_hand > 0
       and coalesce(s.last_out_on, p.created_at::date) < org_today(s.organization_id) - ${staleDays}::int
     order by s.stock_value desc`;
}
