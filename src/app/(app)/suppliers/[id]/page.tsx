import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader, Panel } from "@/components/common/page-header";
import { OrderList } from "@/components/orders/order-list";
import { StockBadge } from "@/components/common/status";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { uuidSchema } from "@/lib/actions/helpers";
import { asCurrentUser, requireUser } from "@/lib/auth";
import { listProductStock } from "@/lib/data/inventory";
import { listOrders } from "@/lib/data/orders";
import { getSupplier } from "@/lib/data/suppliers";
import { can } from "@/lib/domain/labels";
import { formatQty } from "@/lib/format";

export const metadata = { title: "仕入先" };

export default async function SupplierPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const user = await requireUser();
  const data = await asCurrentUser(async (tx) => {
    const s = await getSupplier(tx, id);
    if (!s) return null;
    const [products, open, all] = await Promise.all([
      listProductStock(tx, { supplier: id, limit: 200 }),
      listOrders(tx, { supplierId: id, status: "open", limit: 50 }),
      listOrders(tx, { supplierId: id, limit: 30 }),
    ]);
    return { s, products, open, all };
  });
  if (!data) notFound();
  const { s, products, open, all } = data;
  return (
    <>
      <PageHeader
        back={{ href: "/suppliers", label: "仕入先管理" }}
        title={s.name}
        sub={[s.contact_name && `${s.contact_name} 様`, s.phone, s.email].filter(Boolean).join("・")}
        actions={can.editMaster(user.role) && <Button variant="ghost" size="icon" asChild><Link href={`/suppliers/${id}/edit`} aria-label="仕入先を編集"><Pencil /></Link></Button>}
      />
      <Tabs defaultValue={open.total > 0 ? "open" : "products"}>
        <TabsList>
          <TabsTrigger value="open">未入荷 {open.total > 0 && <span className="tabular ml-1 text-xs">{open.total}</span>}</TabsTrigger>
          <TabsTrigger value="products">取扱商品</TabsTrigger>
          <TabsTrigger value="history">発注履歴</TabsTrigger>
          <TabsTrigger value="info">情報</TabsTrigger>
        </TabsList>
        <TabsContent value="open"><Panel>{open.rows.length ? <OrderList rows={open.rows} hideSupplier /> : <EmptyState title="未入荷の発注はありません" />}</Panel></TabsContent>
        <TabsContent value="products">
          <Panel>
            {products.rows.length === 0 ? <EmptyState title="取扱商品はありません" /> : (
              <ul className="divide-y">
                {products.rows.map((p) => (
                  <li key={p.id}>
                    <Link href={`/inventory/${p.id}`} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted/40">
                      <span className="min-w-0 flex-1 truncate">{p.name}</span>
                      <span className="tabular">{formatQty(p.on_hand, p.unit)}</span>
                      <span className="w-20 text-right"><StockBadge status={p.status} /></span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </TabsContent>
        <TabsContent value="history"><Panel>{all.rows.length ? <OrderList rows={all.rows} hideSupplier /> : <EmptyState title="発注の記録はありません" />}</Panel></TabsContent>
        <TabsContent value="info">
          <Panel>
            <dl className="divide-y text-sm">
              {[["担当者", s.contact_name], ["電話番号", s.phone], ["メールアドレス", s.email], ["住所", s.address], ["備考", s.notes]].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 px-4 py-2.5"><dt className="text-muted-foreground">{k}</dt><dd className="text-right">{v || "—"}</dd></div>
              ))}
            </dl>
          </Panel>
        </TabsContent>
      </Tabs>
    </>
  );
}
