import Image from "next/image";
import Link from "next/link";
import { Logo } from "@/components/layout/logo";
import { DemoButton } from "@/components/public/demo-buttons";
import { Button } from "@/components/ui/button";

export const metadata = {
  title: { absolute: "StockFlow — 在庫・発注管理" },
  description: "在庫の不足に気づき、発注書を作り、入荷までを1つの画面で。中小企業向けの在庫・発注管理システム（デモ）。",
};

const PROBLEMS = [
  { before: "在庫数がExcelと現物で合わない", after: "入出庫の記録から在庫を計算。訂正も履歴に残るので、ずれの原因を追える" },
  { before: "欠品してから発注漏れに気づく", after: "発注点を下回った商品を自動で表示。目標在庫と発注単位から発注数まで提案" },
  { before: "発注書を仕入先ごとに手作りしている", after: "提案から選ぶだけで、仕入先別の発注書（PDF）をまとめて作成" },
  { before: "どれが届いて、どれが未着か分からない", after: "分納・入荷遅延を一覧で。入荷を登録すると在庫に自動で反映" },
];

const COMPARE = [
  ["在庫の確認", "倉庫を見て回り、Excelに転記", "一覧で在庫数と状態（正常・不足・欠品）を確認"],
  ["発注の判断", "担当者の経験と記憶", "発注点・目標在庫から発注数を自動で提案"],
  ["発注書", "仕入先ごとにWordで作成・FAX", "選んだ商品を仕入先別に分け、PDFを出力"],
  ["入荷の管理", "納品書を見て手で在庫を足す", "発注に対して入荷を登録（分納にも対応）"],
  ["振り返り", "月末にExcelで集計", "入出庫・在庫金額・滞留在庫をレポートで確認"],
] as const;

const ESTIMATE = [
  ["在庫の確認・集計", 8, 2],
  ["発注数の判断・発注書の作成", 6, 1.5],
  ["入荷の確認・在庫表への転記", 4, 1.5],
  ["欠品・問い合わせの確認", 2, 1],
] as const;

const FLOW = [
  ["不足を見つける", "ダッシュボードの「要対応」に欠品・在庫不足の商品"],
  ["発注を提案", "発注数は目標在庫・発注残・発注単位から計算済み"],
  ["発注書を作る", "選んだ商品を仕入先ごとに下書きへ"],
  ["PDFを出力", "会社情報入りのA4発注書"],
  ["入荷を登録", "届いた数だけ入力。分納も可"],
  ["在庫に反映", "在庫数と状態がその場で更新"],
] as const;

const FEATURES = [
  ["在庫一覧", "検索・状態での絞り込み・その場で入出庫"],
  ["入出庫", "スマホで片手入力。在庫を超える出庫は登録できない"],
  ["発注提案・発注書", "仕入先別に自動で分割。PDF出力"],
  ["入荷", "分納・二重登録の防止・過剰入荷の防止"],
  ["レポート", "在庫金額・月別入出庫・出庫ランキング・滞留在庫"],
  ["CSV", "商品・初期在庫・入出庫履歴の取込、各一覧の出力"],
  ["権限", "管理者・担当者・閲覧者。画面・サーバー・DBの3段階で制御"],
  ["会社ごとの分離", "すべてのデータを会社単位で分離（行レベルセキュリティ）"],
] as const;

export default function Home() {
  const before = ESTIMATE.reduce((s, r) => s + r[1], 0);
  const after = ESTIMATE.reduce((s, r) => s + r[2], 0);
  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Logo />
          <nav className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild><Link href="/login">ログイン</Link></Button>
            <DemoButton size="lg" className="hidden h-9 sm:inline-flex" />
          </nav>
        </div>
      </header>

      <main>
        {/* ヒーロー */}
        <section className="mx-auto max-w-6xl px-4 pt-14 pb-12 sm:px-6 sm:pt-20">
          <div className="max-w-2xl">
            <p className="text-sm font-medium text-brand">中小企業向け 在庫・発注管理</p>
            <h1 className="text-keep mt-3 text-3xl leading-tight font-bold tracking-tight sm:text-5xl sm:leading-tight">
              足りない商品が、<br />開いた瞬間に分かる。
            </h1>
            <p className="text-keep mt-5 text-base leading-relaxed text-muted-foreground sm:text-lg">
              入出庫の記録から在庫を計算し、発注が必要な商品と発注数を提案。発注書の作成から入荷まで、ひとつの画面で完結します。
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <DemoButton size="xl" />
              <span className="text-sm text-muted-foreground">登録不要・あなた専用の架空データで約3分</span>
            </div>
          </div>
          <div className="mt-12 overflow-hidden rounded-xl border bg-card shadow-sm">
            <Image src="/screens/dashboard.png" alt="ダッシュボードの画面。在庫不足・発注待ちの件数と、要対応の商品が並ぶ" width={1440} height={900} priority className="h-auto w-full" />
          </div>
        </section>

        {/* 課題と解決 */}
        <Section title="よくある困りごとを、仕組みで解決">
          <div className="grid gap-3 md:grid-cols-2">
            {PROBLEMS.map((p) => (
              <div key={p.before} className="rounded-lg border bg-card p-5">
                <p className="text-sm text-muted-foreground">{p.before}</p>
                <p className="text-keep mt-2 font-medium leading-relaxed">{p.after}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* Before / After */}
        <Section title="導入前と導入後">
          <div className="overflow-hidden rounded-lg border bg-card">
            <table className="w-full text-sm">
              <thead className="hidden bg-muted/50 text-xs text-muted-foreground sm:table-header-group">
                <tr><th className="w-36 px-5 py-2.5 text-left font-medium">業務</th><th className="px-5 py-2.5 text-left font-medium">Before</th><th className="px-5 py-2.5 text-left font-medium">After</th></tr>
              </thead>
              <tbody className="divide-y">
                {COMPARE.map(([task, b, a]) => (
                  <tr key={task} className="grid gap-1 px-5 py-4 sm:table-row sm:p-0">
                    <th scope="row" className="text-left font-semibold sm:px-5 sm:py-3.5">{task}</th>
                    <td className="text-muted-foreground sm:px-5 sm:py-3.5"><span className="mr-2 text-xs sm:hidden">Before</span>{b}</td>
                    <td className="sm:px-5 sm:py-3.5"><span className="mr-2 text-xs text-brand sm:hidden">After</span>{a}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        {/* 効果の試算 */}
        <Section title="効果の試算">
          <div className="grid gap-4 lg:grid-cols-[1fr_1.3fr]">
            <div className="grid grid-cols-3 gap-3 self-start rounded-lg border bg-card p-5">
              <Metric label="導入前" value={`${before}`} unit="時間/月" muted />
              <Metric label="導入後" value={`${after}`} unit="時間/月" />
              <Metric label="削減" value={`${before - after}`} unit="時間/月" accent />
              <div className="col-span-3 border-t pt-4">
                <p className="text-sm text-muted-foreground">年間</p>
                <p className="tabular text-3xl font-bold">{(before - after) * 12}<span className="ml-1 text-base font-medium">時間の削減</span></p>
              </div>
            </div>
            <div className="rounded-lg border bg-card">
              <table className="w-full text-sm">
                <caption className="sr-only">作業ごとの試算（月あたり）</caption>
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-b"><th className="px-5 py-2.5 text-left font-medium">作業（月あたり）</th><th className="px-3 py-2.5 text-right font-medium">導入前</th><th className="px-5 py-2.5 text-right font-medium">導入後</th></tr>
                </thead>
                <tbody className="divide-y">
                  {ESTIMATE.map(([task, b, a]) => (
                    <tr key={task}><td className="px-5 py-3">{task}</td><td className="tabular whitespace-nowrap px-3 py-3 text-right text-muted-foreground">{b}時間</td><td className="tabular whitespace-nowrap px-5 py-3 text-right font-medium">{a}時間</td></tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t font-semibold"><td className="px-5 py-3">合計</td><td className="tabular whitespace-nowrap px-3 py-3 text-right">{before}時間</td><td className="tabular whitespace-nowrap px-5 py-3 text-right">{after}時間</td></tr>
                </tfoot>
              </table>
            </div>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            ※ 商品約100品目・仕入先約15社・担当者2名の会社を想定した試算です。実際の導入実績や効果を保証するものではありません。
          </p>
        </Section>

        {/* デモの流れ */}
        <Section title="3分で体験できる流れ">
          <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {FLOW.map(([t, d], i) => (
              <li key={t} className="flex gap-3 rounded-lg border bg-card p-4">
                <span className="tabular grid size-7 shrink-0 place-items-center rounded-full bg-foreground text-sm font-semibold text-background">{i + 1}</span>
                <div><p className="font-semibold">{t}</p><p className="text-keep mt-0.5 text-sm text-muted-foreground">{d}</p></div>
              </li>
            ))}
          </ol>
          <div className="mt-6 grid items-center gap-6 rounded-lg border bg-card p-5 sm:grid-cols-[1fr_auto] sm:p-6">
            <div>
              <p className="font-semibold">スマートフォンでも、片手で入出庫</p>
              <p className="text-keep mt-1 text-sm text-muted-foreground">倉庫や現場で、商品を選んで数量を入れるだけ。在庫を超える出庫は、その場で知らせます。</p>
            </div>
            <Image src="/screens/mobile-movement.png" alt="スマートフォンの入出庫画面" width={390} height={844} className="mx-auto h-auto w-40 rounded-xl border shadow-sm sm:w-44" />
          </div>
        </Section>

        {/* 機能 */}
        <Section title="主な機能">
          <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map(([t, d]) => (
              <div key={t}><dt className="font-semibold">{t}</dt><dd className="text-keep mt-1 text-sm text-muted-foreground">{d}</dd></div>
            ))}
          </dl>
        </Section>

        <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
          <div className="flex flex-col items-start gap-4 rounded-xl border bg-card p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
            <div>
              <p className="text-lg font-bold">実際に操作してみてください</p>
              <p className="mt-1 text-sm text-muted-foreground">架空の会社「株式会社山田設備」のデータ（約100品目・半年分の履歴）で試せます。</p>
            </div>
            <DemoButton size="xl" />
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:justify-between sm:px-6">
          <span>StockFlow（ポートフォリオ作品）</span>
          <span>掲載している会社名・商品・数値はすべて架空です。</span>
        </div>
      </footer>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <h2 className="mb-6 text-xl font-bold tracking-tight sm:text-2xl">{title}</h2>
      {children}
    </section>
  );
}

function Metric({ label, value, unit, muted, accent }: { label: string; value: string; unit: string; muted?: boolean; accent?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`tabular mt-1 text-3xl font-bold ${muted ? "text-muted-foreground" : accent ? "text-brand" : ""}`}>{value}</p>
      <p className="text-xs text-muted-foreground">{unit}</p>
    </div>
  );
}
