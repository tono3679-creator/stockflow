import Link from "next/link";
import { Download, Plus, Search } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader, Panel } from "@/components/common/page-header";
import { Pagination } from "@/components/common/pagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { asCurrentUser, requireUser } from "@/lib/auth";
import { listProductStock, PAGE_SIZE } from "@/lib/data/inventory";
import { can } from "@/lib/domain/labels";
import { formatPrice, formatQty } from "@/lib/format";
import { pageParam, param, withParams, type SearchParams } from "@/lib/url";

export const metadata = { title: "商品管理" };

export default async function ProductsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const user = await requireUser();
  const q = param(sp, "q");
  const page = pageParam(sp);
  const { rows, total } = await asCurrentUser((tx) => listProductStock(tx, { q, page, includeInactive: true, byCode: true }));
  const editable = can.editMaster(user.role);
  return (
    <>
      <PageHeader
        title="商品管理"
        actions={
          <>
            <Button variant="outline" size="sm" asChild><a href={withParams("/api/export/products", { q })}><Download aria-hidden />CSV</a></Button>
            {editable && <Button variant="brand" asChild><Link href="/products/new"><Plus aria-hidden />商品登録</Link></Button>}
          </>
        }
      />
      <form className="relative mb-4 md:w-72" role="search">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input name="q" type="search" defaultValue={q} placeholder="商品名・コード" aria-label="商品を検索" className="pl-9" />
      </form>
      <Panel>
        {rows.length === 0 ? <EmptyState title="商品がありません" /> : (
          <table className="w-full table-fixed text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="w-28 px-4 py-2.5 font-medium">コード</th>
                <th className="px-4 py-2.5 font-medium">商品名</th>
                <th className="hidden w-32 px-4 py-2.5 font-medium lg:table-cell">カテゴリ</th>
                <th className="hidden w-28 px-4 py-2.5 text-right font-medium md:table-cell">仕入単価</th>
                <th className="hidden w-40 px-4 py-2.5 text-right font-medium sm:table-cell">発注点 / 目標</th>
                <th className="w-16 px-4 py-2.5 font-medium"><span className="sr-only">状態</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="border-b last:border-0 hover:bg-muted/40">
                  <td className="truncate px-4 py-2.5 text-muted-foreground">{p.code}</td>
                  <td className="truncate px-4 py-2.5">
                    <Link href={editable ? `/products/${p.id}/edit` : `/inventory/${p.id}`} className="font-medium hover:underline">{p.name}</Link>
                  </td>
                  <td className="hidden truncate px-4 py-2.5 text-muted-foreground lg:table-cell">{p.category_name ?? "—"}</td>
                  <td className="hidden px-4 py-2.5 text-right md:table-cell">{formatPrice(p.unit_cost)}</td>
                  <td className="hidden px-4 py-2.5 text-right whitespace-nowrap sm:table-cell">{formatQty(p.reorder_point)} / {formatQty(p.target_stock)}<span className="ml-0.5 text-xs text-muted-foreground">{p.unit}</span></td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{p.is_active ? "" : "無効"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="border-t">
          <Pagination page={page} pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))} total={total} pageSize={PAGE_SIZE} hrefFor={(n) => withParams("/products", { q, page: n })} />
        </div>
      </Panel>
    </>
  );
}
