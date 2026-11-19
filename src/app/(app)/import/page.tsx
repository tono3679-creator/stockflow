import { PageHeader, Panel, SectionTitle } from "@/components/common/page-header";
import { ImportWizard } from "@/components/import/import-wizard";
import { asCurrentUser, requireRole } from "@/lib/auth";
import { formatDateTimeFull } from "@/lib/format";

export const metadata = { title: "CSVインポート" };

const KIND_LABEL = { products: "商品マスタ", opening: "初期在庫", movements: "入出庫履歴" } as const;

export default async function ImportPage() {
  await requireRole(["admin"]);
  const jobs = await asCurrentUser((tx) => tx<{ id: string; kind: keyof typeof KIND_LABEL; file_name: string; row_count: number; inserted_count: number; updated_count: number; skipped_count: number; created_at: Date; by: string | null }[]>`
    select j.id, j.kind, j.file_name, j.row_count, j.inserted_count, j.updated_count, j.skipped_count, j.created_at, p.display_name "by"
      from import_jobs j left join profiles p on p.id = j.created_by
     order by j.created_at desc limit 10`);
  return (
    <>
      <PageHeader title="CSVインポート" />
      <ImportWizard />
      <SectionTitle className="mt-8">取込の履歴</SectionTitle>
      <Panel>
        {jobs.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">まだ取り込んでいません</p>
        ) : (
          <ul className="divide-y text-sm">
            {jobs.map((j) => (
              <li key={j.id} className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
                <span className="w-24 shrink-0 font-medium">{KIND_LABEL[j.kind]}</span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{j.file_name || "—"}</span>
                <span className="tabular text-muted-foreground">
                  {j.row_count}行（{[j.inserted_count && `登録 ${j.inserted_count}`, j.updated_count && `更新 ${j.updated_count}`, j.skipped_count && `スキップ ${j.skipped_count}`].filter(Boolean).join("・") || "0件"}）
                </span>
                <span className="tabular text-xs text-muted-foreground sm:w-40 sm:text-right">{formatDateTimeFull(j.created_at)}{j.by ? `・${j.by}` : ""}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
