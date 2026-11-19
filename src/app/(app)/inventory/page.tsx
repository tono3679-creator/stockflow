import Link from "next/link";
import { Download, Search } from "lucide-react";
import { FilterTabs } from "@/components/common/filter-tabs";
import { PageHeader, Panel } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { Pagination } from "@/components/common/pagination";
import { StockBadge } from "@/components/common/status";
import { RowActions } from "@/components/stock/row-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { asCurrentUser, requireUser } from "@/lib/auth";
import { listProductStock, PAGE_SIZE, type StockFilter } from "@/lib/data/inventory";
import { can } from "@/lib/domain/labels";
import { formatQty } from "@/lib/format";
import { todayFor } from "@/lib/today";
import { pageParam, param, withParams, type SearchParams } from "@/lib/url";
import { cn } from "@/lib/utils";

export const metadata = { title: "在庫" };

const FILTERS: StockFilter[] = ["all", "ok", "low", "out", "attention"];

export default async function InventoryPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const user = await requireUser();
  const q = param(sp, "q");
  const filter = (FILTERS.includes(param(sp, "filter") as StockFilter) ? param(sp, "filter") : "all") as StockFilter;
  const page = pageParam(sp);
  const { rows, total, counts } = await asCurrentUser((tx) => listProductStock(tx, { q, filter, page }));
  const today = todayFor(user);
  const canMove = can.moveStock(user.role);
  const href = (f: string) => withParams("/inventory", { q, filter: f === "all" ? "" : f });

  return (
    <>
      <PageHeader title="在庫" actions={<Button variant="outline" size="sm" asChild><a href={withParams("/api/export/inventory", { q, filter: filter === "all" ? "" : filter })}><Download aria-hidden />CSV</a></Button>} />
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <FilterTabs
          current={filter}
          items={[
            { value: "all", label: "すべて", href: href("all"), count: counts.all },
            { value: "ok", label: "正常", href: href("ok"), count: counts.ok },
            { value: "low", label: "在庫不足", href: href("low"), count: counts.low, tone: "warning" },
            { value: "out", label: "欠品", href: href("out"), count: counts.out, tone: "danger" },
            ...(filter === "attention" ? [{ value: "attention", label: "要対応", href: href("attention") }] : []),
          ]}
        />
        <form className="relative md:w-72" role="search">
          {filter !== "all" && <input type="hidden" name="filter" value={filter} />}
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input name="q" type="search" defaultValue={q} placeholder="商品名・コード" aria-label="商品を検索" className="pl-9" />
        </form>
      </div>

      <Panel>
        {rows.length === 0 ? (
          <EmptyState title={q ? "該当する商品がありません" : "商品がありません"} />
        ) : (
          <>
            {/* PC：表 */}
            <table className="hidden w-full table-fixed text-sm md:table">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">商品</th>
                  <th className="w-28 px-4 py-2.5 text-right font-medium">在庫</th>
                  <th className="w-20 px-4 py-2.5 text-right font-medium">発注点</th>
                  <th className="w-40 px-4 py-2.5 font-medium">状態</th>
                  <th className="hidden w-44 px-4 py-2.5 font-medium lg:table-cell">仕入先</th>
                  {canMove && <th className="w-44 px-4 py-2.5"><span className="sr-only">操作</span></th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-2.5">
                      <Link href={`/inventory/${p.id}`} className="block truncate font-medium hover:underline">{p.name}</Link>
                      <div className="text-xs text-muted-foreground">{p.code}</div>
                    </td>
                    <td className={cn("px-4 py-2.5 text-right font-semibold whitespace-nowrap", p.status === "out" && "text-danger-strong", p.status === "low" && "text-warning-strong")}>
                      {formatQty(p.on_hand)}<span className="ml-0.5 text-xs font-normal text-muted-foreground">{p.unit}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap text-muted-foreground">{formatQty(p.reorder_point)}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <StockBadge status={p.status} />
                      {p.status !== "ok" && (
                        <span className="ml-1.5 text-xs text-muted-foreground">{p.needs_order ? "発注待ち" : p.on_order > 0 ? "発注済" : ""}</span>
                      )}
                    </td>
                    <td className="hidden truncate px-4 py-2.5 text-muted-foreground lg:table-cell">{p.supplier_name ?? "—"}</td>
                    {canMove && (
                      <td className="px-4 py-2 whitespace-nowrap">
                        <RowActions product={{ id: p.id, code: p.code, name: p.name, unit: p.unit, onHand: p.on_hand }} today={today} />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {/* スマートフォン：リスト */}
            <ul className="divide-y md:hidden">
              {rows.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                  <Link href={`/inventory/${p.id}`} className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{p.name}</div>
                    <div className="mt-1 flex items-center gap-2">
                      <StockBadge status={p.status} />
                      <span className="text-xs text-muted-foreground">発注点 {formatQty(p.reorder_point)}</span>
                    </div>
                  </Link>
                  <div className={cn("tabular shrink-0 text-right text-lg font-semibold", p.status === "out" && "text-danger-strong", p.status === "low" && "text-warning-strong")}>
                    {formatQty(p.on_hand)}<span className="ml-0.5 text-xs font-normal text-muted-foreground">{p.unit}</span>
                  </div>
                  {canMove && <RowActions compact product={{ id: p.id, code: p.code, name: p.name, unit: p.unit, onHand: p.on_hand }} today={today} />}
                </li>
              ))}
            </ul>
            <div className="border-t">
              <Pagination page={page} pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))} total={total} pageSize={PAGE_SIZE} hrefFor={(n) => withParams("/inventory", { q, filter: filter === "all" ? "" : filter, page: n })} />
            </div>
          </>
        )}
      </Panel>
    </>
  );
}
