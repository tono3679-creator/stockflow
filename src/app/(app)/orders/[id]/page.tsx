import { notFound } from "next/navigation";
import { PageHeader, Panel } from "@/components/common/page-header";
import { PoBadge } from "@/components/common/status";
import { CancelButton, ExpectedDialog, PdfButtons, PlaceButton } from "@/components/orders/order-actions";
import { OrderItems } from "@/components/orders/order-items";
import { ReceivePanel } from "@/components/orders/receive-panel";
import { uuidSchema } from "@/lib/actions/helpers";
import { asCurrentUser, requireUser } from "@/lib/auth";
import { getOrder } from "@/lib/data/orders";
import { can } from "@/lib/domain/labels";
import { formatDate, formatDateTimeFull, formatQty } from "@/lib/format";
import { todayFor } from "@/lib/today";
import Link from "next/link";
import { cn } from "@/lib/utils";

export const metadata = { title: "発注書" };

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const user = await requireUser();
  const data = await asCurrentUser(async (tx) => {
    const o = await getOrder(tx, id);
    if (!o) return null;
    const products = o.status === "draft"
      ? await tx<{ id: string; code: string; name: string; unit: string; on_hand: number; unit_cost: number }[]>`
          select id, code, name, unit, on_hand, unit_cost from product_stock where is_active order by (supplier_id = ${o.supplier_id}) desc nulls last, code`
      : [];
    return { o, products };
  });
  if (!data) notFound();
  const { o, products } = data;
  const today = todayFor(user);
  const canOrder = can.order(user.role);
  const open = o.status === "ordered" || o.status === "partial";
  return (
    <>
      <PageHeader
        back={{ href: "/orders", label: "発注" }}
        title={<span className="flex flex-wrap items-center gap-3">{o.number}<PoBadge status={o.status} delayed={o.delayed} /></span>}
        sub={<Link href={`/suppliers/${o.supplier_id}`} className="hover:underline">{o.supplier_name}</Link>}
        actions={
          <>
            {canOrder && o.status === "draft" && <PlaceButton id={o.id} />}
            <PdfButtons id={o.id} />
            {canOrder && open && <ExpectedDialog id={o.id} expectedOn={o.expected_on} notes={o.notes} min={o.order_on} />}
            {canOrder && (o.status === "draft" || o.status === "ordered") && <CancelButton id={o.id} status={o.status} />}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <div className="grid min-w-0 gap-6">
          {canOrder && open && (
            <ReceivePanel
              poId={o.id}
              today={today}
              minDate={o.order_on}
              items={o.items.map((i) => ({ id: i.id, name: i.name, unit: i.unit, quantity: i.quantity, received: i.received_qty }))}
            />
          )}
          <OrderItems
            id={o.id}
            editable={canOrder && o.status === "draft"}
            showReceived={o.status !== "draft" && o.status !== "cancelled"}
            total={o.total_amount}
            expectedOn={o.expected_on}
            notes={o.notes}
            min={o.order_on}
            products={products.map((p) => ({ id: p.id, code: p.code, name: p.name, unit: p.unit, onHand: p.on_hand, unitCost: p.unit_cost }))}
            items={o.items.map((i) => ({
              id: i.id, productId: i.product_id, code: i.code, name: i.name, quantity: i.quantity, unit: i.unit, unitPrice: i.unit_price,
              amount: i.amount, received: i.received_qty, onHand: i.on_hand,
            }))}
          />
          {o.receipts.length > 0 && (
            <Panel>
              <h2 className="border-b px-4 py-2.5 text-sm font-semibold">入荷履歴</h2>
              <ul className="divide-y">
                {o.receipts.map((r) => (
                  <li key={r.id} className="px-4 py-3 text-sm">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{formatDate(r.received_on)}</span>
                      <span>{r.created_by_name}</span>
                    </div>
                    <ul className="mt-1">
                      {r.lines.map((l) => (
                        <li key={l.name} className="flex justify-between gap-3"><span className="truncate">{l.name}</span><span className="tabular">+{formatQty(l.quantity, l.unit)}</span></li>
                      ))}
                    </ul>
                    {r.note && <div className="mt-1 text-xs text-muted-foreground">{r.note}</div>}
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>

        <Panel className="h-fit">
          <dl className="divide-y text-sm">
            {[
              ["発注日", formatDate(o.order_on)],
              ["納品予定日", <span key="e" className={cn(o.delayed && "font-semibold text-danger-strong")}>{formatDate(o.expected_on)}{o.delayed && "（遅延）"}</span>],
              ["作成者", o.created_by_name ?? "—"],
              ["発注日時", o.ordered_at ? formatDateTimeFull(o.ordered_at) : "—"],
              ...(o.status === "cancelled" ? [["キャンセル理由", o.cancel_reason || "—"]] : []),
              ...(o.notes ? [["備考", o.notes]] : []),
              ["仕入先 担当", o.supplier.contact_name ? `${o.supplier.contact_name} 様` : "—"],
              ["電話", o.supplier.phone || "—"],
            ].map(([k, v]) => (
              <div key={String(k)} className="flex justify-between gap-4 px-4 py-2.5">
                <dt className="shrink-0 text-muted-foreground">{k}</dt>
                <dd className="text-right">{v}</dd>
              </div>
            ))}
          </dl>
        </Panel>
      </div>
    </>
  );
}
