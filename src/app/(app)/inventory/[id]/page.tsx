import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, ShoppingCart } from "lucide-react";
import { StockTrendChart } from "@/components/charts/charts";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader, Panel } from "@/components/common/page-header";
import { PoBadge, StockBadge } from "@/components/common/status";
import { AdjustDialog } from "@/components/stock/adjust-dialog";
import { MovementTable } from "@/components/stock/movement-table";
import { ProductQuickActions } from "@/components/stock/product-quick-actions";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { asCurrentUser, requireUser } from "@/lib/auth";
import { getProductStock, listMovements, productOrders, productTrend } from "@/lib/data/inventory";
import { can } from "@/lib/domain/labels";
import { formatDate, formatPrice, formatQty, formatYen } from "@/lib/format";
import { todayFor } from "@/lib/today";
import { uuidSchema } from "@/lib/actions/helpers";
import { cn } from "@/lib/utils";

export const metadata = { title: "商品" };

function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "danger" | "warning" }) {
  return (
    <div className="px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("tabular mt-0.5 text-lg font-semibold", tone === "danger" && "text-danger-strong", tone === "warning" && "text-warning-strong")}>{value}</div>
    </div>
  );
}

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const user = await requireUser();
  const data = await asCurrentUser(async (tx) => {
    const p = await getProductStock(tx, id);
    if (!p) return null;
    const [moves, orders, trend] = await Promise.all([listMovements(tx, { productId: id, limit: 30 }), productOrders(tx, id), productTrend(tx, id, 90)]);
    return { p, moves, orders, trend };
  });
  if (!data) notFound();
  const { p, moves, orders, trend } = data;
  const today = todayFor(user);
  const unit = p.unit;
  return (
    <>
      <PageHeader
        back={{ href: "/inventory", label: "在庫" }}
        title={p.name}
        sub={<span className="flex flex-wrap items-center gap-2">{p.code}<StockBadge status={p.status} />{!p.is_active && <span>（無効）</span>}</span>}
        actions={
          <>
            {can.moveStock(user.role) && p.is_active && <ProductQuickActions product={{ id: p.id, code: p.code, name: p.name, unit, onHand: p.on_hand }} today={today} />}
            {can.adjust(user.role) && <AdjustDialog product={{ id: p.id, name: p.name, unit, onHand: p.on_hand }} today={today} />}
            {can.editMaster(user.role) && (
              <Button variant="ghost" size="icon" asChild><Link href={`/products/${p.id}/edit`} aria-label="商品を編集"><Pencil /></Link></Button>
            )}
          </>
        }
      />

      <Panel className="mb-6 grid grid-cols-2 divide-x divide-y sm:grid-cols-3 sm:divide-y-0 lg:grid-cols-5">
        <Stat label="現在庫" value={formatQty(p.on_hand, unit)} tone={p.status === "out" ? "danger" : p.status === "low" ? "warning" : undefined} />
        <Stat label="発注点" value={formatQty(p.reorder_point, unit)} />
        <Stat label="目標在庫" value={formatQty(p.target_stock, unit)} />
        <Stat label="発注残" value={formatQty(p.on_order, unit)} />
        <Stat label="仕入単価" value={formatPrice(p.unit_cost)} />
      </Panel>

      {p.needs_order && (
        <div className="mb-6 flex flex-col gap-3 rounded-lg border border-warning/40 bg-warning-soft px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm">
            <span className="font-semibold text-warning-strong">発注が必要です</span>
            <span className="ml-2">推奨 <span className="tabular font-semibold">{formatQty(p.suggested_qty, unit)}</span></span>
          </div>
          {can.order(user.role) && (
            <Button asChild variant="brand" size="sm"><Link href={`/orders/suggest?product=${p.id}`}><ShoppingCart aria-hidden />発注提案へ</Link></Button>
          )}
        </div>
      )}

      <Tabs defaultValue="trend">
        <TabsList>
          <TabsTrigger value="trend">在庫推移</TabsTrigger>
          <TabsTrigger value="moves">入出庫</TabsTrigger>
          <TabsTrigger value="orders">発注</TabsTrigger>
          <TabsTrigger value="info">商品情報</TabsTrigger>
        </TabsList>
        <TabsContent value="trend">
          <Panel className="p-4">
            <div className="mb-2 text-xs text-muted-foreground">過去90日</div>
            <StockTrendChart data={trend} unit={unit} reorderPoint={p.reorder_point} />
          </Panel>
        </TabsContent>
        <TabsContent value="moves">
          <Panel>
            {moves.rows.length === 0 ? <EmptyState title="入出庫の記録はありません" /> : <MovementTable rows={moves.rows} canReverse={can.reverse(user.role)} />}
            {moves.total > moves.rows.length && (
              <div className="border-t px-4 py-3 text-right text-sm"><Link className="text-brand hover:underline" href={`/movements?product=${p.id}`}>すべて見る（{moves.total}件）</Link></div>
            )}
          </Panel>
        </TabsContent>
        <TabsContent value="orders">
          <Panel>
            {orders.length === 0 ? <EmptyState title="発注の記録はありません" /> : (
              <ul className="divide-y">
                {orders.map((o) => (
                  <li key={o.po_id}>
                    <Link href={`/orders/${o.po_id}`} className="flex items-center gap-4 px-4 py-3 text-sm hover:bg-muted/40">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">{o.number}</div>
                        <div className="text-xs text-muted-foreground">{formatDate(o.order_on)}・{o.supplier_name}</div>
                      </div>
                      <div className="tabular text-right">
                        {formatQty(o.received_qty)} / {formatQty(o.quantity, unit)}
                        <div className="text-xs text-muted-foreground">入荷 / 発注</div>
                      </div>
                      <PoBadge status={o.status} delayed={o.delayed} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </TabsContent>
        <TabsContent value="info">
          <Panel>
            <dl className="grid divide-y text-sm sm:grid-cols-2 sm:divide-y-0">
              {[
                ["商品コード", p.code],
                ["カテゴリ", p.category_name ?? "—"],
                ["単位", p.unit],
                ["仕入先", p.supplier_name ?? "—"],
                ["発注単位", formatQty(p.order_lot, unit)],
                ["最低発注数量", p.min_order_qty > 0 ? formatQty(p.min_order_qty, unit) : "—"],
                ["保管場所", p.location || "—"],
                ["在庫金額", formatYen(p.stock_value)],
                ["最終出庫日", formatDate(p.last_out_on)],
                ["備考", p.notes || "—"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 border-b px-4 py-2.5 sm:[&:nth-last-child(-n+2)]:border-b-0">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="text-right">{v}</dd>
                </div>
              ))}
            </dl>
          </Panel>
        </TabsContent>
      </Tabs>
    </>
  );
}
