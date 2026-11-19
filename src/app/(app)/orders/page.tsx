import Link from "next/link";
import { Download, Plus, Search, Sparkles } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { FilterTabs } from "@/components/common/filter-tabs";
import { PageHeader, Panel } from "@/components/common/page-header";
import { Pagination } from "@/components/common/pagination";
import { OrderList } from "@/components/orders/order-list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { asCurrentUser, requireUser } from "@/lib/auth";
import { PAGE_SIZE } from "@/lib/data/inventory";
import { listOrders, type OrderFilter } from "@/lib/data/orders";
import { can } from "@/lib/domain/labels";
import { pageParam, param, withParams, type SearchParams } from "@/lib/url";

export const metadata = { title: "発注" };

const FILTERS: OrderFilter[] = ["", "draft", "open", "delayed", "received", "cancelled"];

export default async function OrdersPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const user = await requireUser();
  const status = (FILTERS.includes(param(sp, "status") as OrderFilter) ? param(sp, "status") : "") as OrderFilter;
  const q = param(sp, "q");
  const page = pageParam(sp);
  const [{ rows, total, counts }, [need]] = await asCurrentUser((tx) => Promise.all([
    listOrders(tx, { status, q, page }),
    tx<{ n: number }[]>`select count(*)::int n from product_stock where is_active and needs_order`,
  ]));
  const href = (s: string) => withParams("/orders", { status: s, q });
  return (
    <>
      <PageHeader
        title="発注"
        actions={
          <>
            <Button variant="outline" size="sm" asChild><a href={withParams("/api/export/orders", { status, q })}><Download aria-hidden />CSV</a></Button>
            {can.order(user.role) && <Button variant="outline" asChild><Link href="/orders/new"><Plus aria-hidden />新規</Link></Button>}
          </>
        }
      />
      {can.order(user.role) && need.n > 0 && (
        <Link href="/orders/suggest" className="mb-5 flex items-center gap-3 rounded-lg border border-brand/30 bg-brand-soft px-4 py-3 hover:border-brand/60">
          <Sparkles className="size-4 text-brand" aria-hidden />
          <span className="flex-1 text-sm"><span className="font-semibold">発注提案</span><span className="ml-2 text-muted-foreground">発注待ち</span><span className="tabular ml-1 font-semibold">{need.n}</span>品目</span>
          <span className="text-sm font-medium text-brand">確認する</span>
        </Link>
      )}
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <FilterTabs current={status} items={[
          { value: "", label: "すべて", href: href("") },
          { value: "draft", label: "下書き", href: href("draft"), count: counts.draft },
          { value: "open", label: "入荷待ち", href: href("open"), count: counts.open },
          { value: "delayed", label: "遅延", href: href("delayed"), count: counts.delayed, tone: "danger" },
          { value: "received", label: "入荷完了", href: href("received") },
          { value: "cancelled", label: "キャンセル", href: href("cancelled") },
        ]} />
        <form className="relative md:w-64" role="search">
          {status && <input type="hidden" name="status" value={status} />}
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input name="q" type="search" defaultValue={q} placeholder="発注番号・仕入先" aria-label="発注を検索" className="pl-9" />
        </form>
      </div>
      <Panel>
        {rows.length === 0 ? <EmptyState title="発注書がありません" /> : <OrderList rows={rows} />}
        <div className="border-t">
          <Pagination page={page} pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))} total={total} pageSize={PAGE_SIZE} hrefFor={(n) => withParams("/orders", { status, q, page: n })} />
        </div>
      </Panel>
    </>
  );
}
