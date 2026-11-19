import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { AmountLineChart, InOutChart } from "@/components/charts/charts";
import { EmptyState } from "@/components/common/empty-state";
import { KpiCard } from "@/components/common/kpi-card";
import { Panel, SectionTitle } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { asCurrentUser, requireUser } from "@/lib/auth";
import { attention, kpis, monthlyInOut, recent, stockValueTrend, type AttentionItem, type RecentRow } from "@/lib/data/analytics";
import { formatDateShort, formatQty, formatSignedPercent, formatYen, formatYenCompact } from "@/lib/format";
import { param, type SearchParams } from "@/lib/url";

export const metadata = { title: "ダッシュボード" };

const LABEL = { out: "欠品", low: "在庫不足", draft: "発注待ち", delayed: "入荷遅延" } as const;
const VARIANT = { out: "danger", low: "warning", draft: "neutral", delayed: "danger" } as const;

function AttentionRow({ item }: { item: AttentionItem }) {
  const product = item.kind === "out" || item.kind === "low";
  let title: string;
  let detail: string;
  if (!("number" in item)) {
    title = item.name;
    detail = `在庫 ${formatQty(item.onHand, item.unit)} / 発注点 ${formatQty(item.reorderPoint)}${item.covered ? "・発注済" : `・推奨 ${formatQty(item.suggested, item.unit)}`}`;
  } else {
    title = `${item.number}・${item.supplier}`;
    detail = item.kind === "draft" ? `${item.name} ほか・未発注` : `納品予定 ${formatDateShort(item.date)}`;
  }
  return (
    <li>
      <Link href={product ? `/inventory/${item.id}` : `/orders/${item.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40">
        <Badge variant={VARIANT[item.kind]} className="w-[4.5rem] justify-center">{LABEL[item.kind]}</Badge>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{title}</span>
          <span className="block truncate text-xs text-muted-foreground">{detail}</span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </Link>
    </li>
  );
}

function RecentList({ title, rows, href }: { title: string; rows: RecentRow[]; href: string }) {
  return (
    <Panel>
      <div className="flex items-center justify-between border-b px-4 py-2.5">
        <h3 className="text-sm font-semibold">{title}</h3>
        <Link href={href} className="text-xs text-muted-foreground hover:text-foreground">すべて</Link>
      </div>
      {rows.length === 0 ? <EmptyState title="記録なし" className="py-6" /> : (
        <ul className="divide-y">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={r.href} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted/40">
                <span className="tabular w-10 shrink-0 text-xs text-muted-foreground">{formatDateShort(r.date)}</span>
                <span className="min-w-0 flex-1 truncate">{r.title}</span>
                <span className="tabular shrink-0 font-medium">{r.detail}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export default async function DashboardPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  await requireUser();
  const [k, att, rec, inout, value] = await asCurrentUser((tx) => Promise.all([kpis(tx), attention(tx, 5), recent(tx), monthlyInOut(tx, 6), stockValueTrend(tx, 6)]));
  const outDiff = k.outCountPrev > 0 ? ((k.outCount - k.outCountPrev) / k.outCountPrev) * 100 : null;
  const valueDiff = k.stockValuePrev > 0 ? ((k.stockValue - k.stockValuePrev) / k.stockValuePrev) * 100 : null;
  return (
    <>
      {param(sp, "denied") && (
        <div className="mb-4 rounded-md border border-warning/40 bg-warning-soft px-4 py-2 text-sm text-warning-strong" role="alert">この画面を開く権限がありません</div>
      )}
      <h1 className="sr-only">ダッシュボード</h1>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <KpiCard label="在庫不足" value={String(k.shortage)} unit="品目" tone={k.shortage > 0 ? "warning" : undefined} sub={k.out > 0 ? `うち欠品 ${k.out}` : undefined} href="/inventory?filter=low" />
        <KpiCard label="発注待ち" value={String(k.needsOrder)} unit="品目" tone={k.needsOrder > 0 ? "danger" : undefined} href="/orders/suggest" />
        <KpiCard label="今月出庫" value={k.outCount.toLocaleString("ja-JP")} unit="件" sub={outDiff !== null ? `前月同日比 ${formatSignedPercent(outDiff)}` : undefined} href="/movements?kind=out" />
        <KpiCard label="在庫金額" value={formatYenCompact(k.stockValue)} sub={valueDiff !== null ? `前月末比 ${formatSignedPercent(valueDiff)}` : undefined} href="/reports" />
      </div>

      <section className="mt-8">
        <SectionTitle action={att.total > 5 && <Link href="/inventory?filter=attention" className="text-xs text-muted-foreground hover:text-foreground">すべて見る（{att.total}）</Link>}>
          要対応
        </SectionTitle>
        <Panel>
          {att.items.length === 0 ? <EmptyState title="対応が必要なものはありません" /> : (
            <ul className="divide-y">{att.items.map((i) => <AttentionRow key={`${i.kind}-${i.id}`} item={i} />)}</ul>
          )}
        </Panel>
      </section>

      <section className="mt-8">
        <SectionTitle>最近の動き</SectionTitle>
        <div className="grid gap-4 md:grid-cols-3">
          <RecentList title="入庫" rows={rec.ins} href="/movements?kind=in" />
          <RecentList title="出庫" rows={rec.outs} href="/movements?kind=out" />
          <RecentList title="発注" rows={rec.orders} href="/orders" />
        </div>
      </section>

      <section className="mt-8 grid gap-4 lg:grid-cols-2">
        <Panel className="p-4">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold">月別入出庫</h2>
            <span className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-chart-1" />入庫</span>
              <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-chart-2" />出庫</span>
              <span>金額</span>
            </span>
          </div>
          <InOutChart data={inout} />
        </Panel>
        <Panel className="p-4">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold">在庫金額推移</h2>
            <span className="tabular text-xs text-muted-foreground">現在 {formatYen(k.stockValue)}</span>
          </div>
          <AmountLineChart data={value} label="在庫金額" />
        </Panel>
      </section>
    </>
  );
}
