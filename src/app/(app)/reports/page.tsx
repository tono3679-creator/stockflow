import Link from "next/link";
import { AmountLineChart, CountBarChart, InOutChart } from "@/components/charts/charts";
import { EmptyState } from "@/components/common/empty-state";
import { FilterTabs } from "@/components/common/filter-tabs";
import { PageHeader, Panel } from "@/components/common/page-header";
import { asCurrentUser, requireUser } from "@/lib/auth";
import { monthlyInOut, orderAmountTrend, outRanking, shortageTrend, staleStock, stockValueTrend, valueByCategory } from "@/lib/data/analytics";
import { formatDate, formatQty, formatYen } from "@/lib/format";
import { param, type SearchParams } from "@/lib/url";

export const metadata = { title: "レポート" };

function Card({ title, note, children, className }: { title: string; note?: string; children: React.ReactNode; className?: string }) {
  return (
    <Panel className={className}>
      <div className="flex items-baseline justify-between gap-2 px-4 pt-4 pb-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {note && <span className="text-xs text-muted-foreground">{note}</span>}
      </div>
      <div className="px-4 pb-4">{children}</div>
    </Panel>
  );
}

export default async function ReportsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const user = await requireUser();
  const months = param(sp, "range") === "12" ? 12 : 6;
  const stale = user.settings.staleDays;
  const [value, inout, orders, shortage, ranking, categories, stales] = await asCurrentUser((tx) => Promise.all([
    stockValueTrend(tx, months), monthlyInOut(tx, months), orderAmountTrend(tx, months), shortageTrend(tx, months),
    outRanking(tx, 90, 10), valueByCategory(tx), staleStock(tx, stale),
  ]));
  const catTotal = categories.reduce((s, c) => s + c.amount, 0);
  const rankMax = Math.max(1, ...ranking.map((r) => r.amount));
  const staleTotal = stales.reduce((s, r) => s + r.stock_value, 0);
  return (
    <>
      <PageHeader
        title="レポート"
        actions={<FilterTabs current={String(months)} items={[{ value: "6", label: "6か月", href: "/reports" }, { value: "12", label: "12か月", href: "/reports?range=12" }]} />}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="在庫金額推移" note="月末時点・仕入単価で評価"><AmountLineChart data={value} label="在庫金額" /></Card>
        <Card title="月別入出庫" note="金額"><InOutChart data={inout} /></Card>
        <Card title="発注金額推移" note="発注日の月"><AmountLineChart data={orders} label="発注金額" /></Card>
        <Card title="在庫不足件数推移" note="月末時点・発注点以下"><CountBarChart data={shortage} label="在庫不足" color="var(--warning)" /></Card>

        <Card title="出庫ランキング" note="直近90日・出庫金額">
          {ranking.length === 0 ? <EmptyState title="出庫の記録がありません" /> : (
            <ol className="grid gap-2.5">
              {ranking.map((r, i) => (
                <li key={r.id} className="grid grid-cols-[1.25rem_1fr_auto] items-center gap-x-3 text-sm">
                  <span className="tabular text-xs text-muted-foreground">{i + 1}</span>
                  <div className="min-w-0">
                    <Link href={`/inventory/${r.id}`} className="block truncate hover:underline">{r.name}</Link>
                    <div className="mt-1 h-1.5 rounded-full bg-muted"><div className="h-1.5 rounded-full bg-chart-2" style={{ width: `${(r.amount / rankMax) * 100}%` }} /></div>
                  </div>
                  <div className="tabular text-right">
                    {formatYen(r.amount)}
                    <div className="text-xs text-muted-foreground">{formatQty(r.quantity, r.unit)}・{r.count}回</div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <Card title="カテゴリ別在庫金額" note={`合計 ${formatYen(catTotal)}`}>
          <ul className="grid gap-2.5">
            {categories.map((c) => (
              <li key={c.name} className="grid grid-cols-[7rem_1fr_6.5rem] items-center gap-3 text-sm">
                <span className="truncate">{c.name}</span>
                <div className="h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-chart-1" style={{ width: `${catTotal ? (c.amount / catTotal) * 100 : 0}%` }} /></div>
                <span className="tabular text-right">{formatYen(c.amount)}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="長期滞留在庫" note={`${stale}日以上出庫なし・${stales.length}品目・${formatYen(staleTotal)}`} className="lg:col-span-2">
          {stales.length === 0 ? <EmptyState title="滞留している在庫はありません" /> : (
            <table className="w-full table-fixed text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 font-medium">商品</th>
                  <th className="w-28 py-2 text-right font-medium">在庫</th>
                  <th className="hidden w-32 py-2 text-right font-medium sm:table-cell">在庫金額</th>
                  <th className="w-28 py-2 text-right font-medium">最終出庫</th>
                </tr>
              </thead>
              <tbody>
                {stales.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="truncate py-2"><Link href={`/inventory/${r.id}`} className="hover:underline">{r.name}</Link></td>
                    <td className="py-2 text-right">{formatQty(r.on_hand, r.unit)}</td>
                    <td className="hidden py-2 text-right sm:table-cell">{formatYen(r.stock_value)}</td>
                    <td className="py-2 text-right text-muted-foreground">{r.last_out_on ? formatDate(r.last_out_on) : "出庫なし"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">在庫金額は管理用の仕入単価で計算した参考値です（会計上の棚卸評価とは異なります）。</p>
    </>
  );
}
