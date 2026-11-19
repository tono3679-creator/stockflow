import Link from "next/link";
import { Download, Plus, Search } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { FilterTabs } from "@/components/common/filter-tabs";
import { PageHeader, Panel } from "@/components/common/page-header";
import { Pagination } from "@/components/common/pagination";
import { MovementTable } from "@/components/stock/movement-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { asCurrentUser, requireUser } from "@/lib/auth";
import { listMovements, PAGE_SIZE } from "@/lib/data/inventory";
import { can } from "@/lib/domain/labels";
import { pageParam, param, withParams, type SearchParams } from "@/lib/url";

export const metadata = { title: "入出庫" };

export default async function MovementsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const user = await requireUser();
  const kind = ["in", "out", "adjust"].includes(param(sp, "kind")) ? param(sp, "kind") : "";
  const q = param(sp, "q");
  const product = param(sp, "product");
  const page = pageParam(sp);
  const { rows, total } = await asCurrentUser((tx) => listMovements(tx, { kind, q, productId: /^[0-9a-f-]{36}$/.test(product) ? product : "", page }));
  const href = (k: string) => withParams("/movements", { kind: k, q, product });
  return (
    <>
      <PageHeader
        title="入出庫"
        actions={
          <>
            <Button variant="outline" size="sm" asChild><a href={withParams("/api/export/movements", { kind, q, product })}><Download aria-hidden />CSV</a></Button>
            {can.moveStock(user.role) && (
              <Button variant="brand" asChild><Link href="/movements/new"><Plus aria-hidden />入出庫登録</Link></Button>
            )}
          </>
        }
      />
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <FilterTabs current={kind} items={[
          { value: "", label: "すべて", href: href("") },
          { value: "in", label: "入庫", href: href("in") },
          { value: "out", label: "出庫", href: href("out") },
          { value: "adjust", label: "調整・取消", href: href("adjust") },
        ]} />
        <form className="relative md:w-72" role="search">
          {kind && <input type="hidden" name="kind" value={kind} />}
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input name="q" type="search" defaultValue={q} placeholder="商品名・コード" aria-label="商品で絞り込む" className="pl-9" />
        </form>
      </div>
      <Panel>
        {rows.length === 0 ? <EmptyState title="記録がありません" /> : <MovementTable rows={rows} showProduct canReverse={can.reverse(user.role)} />}
        <div className="border-t">
          <Pagination page={page} pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))} total={total} pageSize={PAGE_SIZE} hrefFor={(n) => withParams("/movements", { kind, q, product, page: n })} />
        </div>
      </Panel>
    </>
  );
}
