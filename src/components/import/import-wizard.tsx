"use client";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Download, FileUp } from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/common/page-header";
import { SelectField } from "@/components/common/select-field";
import { Button } from "@/components/ui/button";
import { checkImport, runImport, type ImportCheck } from "@/lib/actions/imports";
import { safeAction } from "@/lib/client/safe-action";
import {
  applyMapping, decodeCsvBytes, guessMapping, IMPORT_KINDS, MAX_IMPORT_ROWS, parseCsv, toCsv,
  type ColumnMapping, type ImportKind,
} from "@/lib/domain/csv";
import { cn } from "@/lib/utils";

const MAX_BYTES = 5 * 1024 * 1024;
const STEPS = ["ファイル", "項目の割り当て", "確認", "完了"] as const;
type Loaded = { name: string; encoding: string; header: string[]; body: string[][] };

/**
 * CSV 取込：ファイル選択 → プレビュー・項目の割り当て → サーバーで検証 → 登録。
 * 画面では読み込みと割り当てだけを行い、値の検証と登録はサーバー（と DB の関数）が行う。
 */
export function ImportWizard() {
  const router = useRouter();
  const [kind, setKind] = useState<ImportKind>("products");
  const [file, setFile] = useState<Loaded | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [check, setCheck] = useState<ImportCheck | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fileError, setFileError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const def = IMPORT_KINDS[kind];
  const step = done ? 3 : check ? 2 : file ? 1 : 0;

  const missing = useMemo(() => def.fields.filter((f) => f.required && (mapping[f.key] ?? null) === null).map((f) => f.label), [def, mapping]);

  function reset(nextKind = kind) {
    setKind(nextKind);
    setFile(null);
    setMapping({});
    setCheck(null);
    setDone(null);
    setFileError("");
    if (inputRef.current) inputRef.current.value = "";
  }

  async function onFile(f: File | undefined) {
    setFileError("");
    if (!f) return;
    if (f.size > MAX_BYTES) return setFileError("ファイルが大きすぎます（5MBまで）");
    if (!/\.(csv|txt)$/i.test(f.name)) return setFileError("CSVファイル（.csv）を選んでください");
    const { text, encoding } = decodeCsvBytes(new Uint8Array(await f.arrayBuffer()));
    const rows = parseCsv(text);
    if (rows.length < 2) return setFileError("見出しの行と、1行以上のデータが必要です");
    if (rows.length - 1 > MAX_IMPORT_ROWS) return setFileError(`一度に取り込めるのは${MAX_IMPORT_ROWS.toLocaleString()}行までです`);
    const [header, ...body] = rows;
    setFile({ name: f.name, encoding, header, body });
    setMapping(guessMapping(kind, header));
    setCheck(null);
  }

  const payload = () => ({ kind, fileName: file!.name, rows: applyMapping(kind, file!.body, mapping) });

  async function verify() {
    setBusy(true);
    const r = await safeAction(() => checkImport(payload()));
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    setCheck(r.data!);
  }

  async function execute() {
    setBusy(true);
    const r = await safeAction(() => runImport(payload()));
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    setDone(r.data!.message);
    toast.success(r.data!.message);
    router.refresh();
  }

  function downloadTemplate() {
    const [header, ...rows] = def.sample;
    const blob = new Blob([toCsv(header, rows)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${def.label}_テンプレート.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="grid gap-4">
      {/* 種類 */}
      <div role="radiogroup" aria-label="取り込むデータ" className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1 sm:w-fit">
        {(Object.keys(IMPORT_KINDS) as ImportKind[]).map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={kind === k}
            onClick={() => reset(k)}
            className={cn("h-9 rounded-md px-4 text-sm font-semibold transition-colors", kind === k ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground")}
          >
            {IMPORT_KINDS[k].label}
          </button>
        ))}
      </div>

      <ol className="flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label="手順">
        {STEPS.map((s, i) => (
          <li key={s} aria-current={i === step ? "step" : undefined} className={cn("flex items-center gap-1.5", i === step ? "font-semibold text-foreground" : i < step ? "text-muted-foreground" : "text-muted-foreground/60")}>
            <span className={cn("grid size-5 place-items-center rounded-full text-[11px] tabular", i <= step ? "bg-foreground text-background" : "bg-muted")}>{i + 1}</span>
            {s}
          </li>
        ))}
      </ol>

      {/* 1. ファイル */}
      <Panel className="p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm">{def.description}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              項目：{def.fields.map((f) => `${f.label}${f.required ? "（必須）" : ""}`).join("、")}
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={downloadTemplate} className="shrink-0"><Download aria-hidden />テンプレート</Button>
        </div>
        <label
          className="mt-4 flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-6 text-center hover:bg-muted/50 focus-within:ring-2 focus-within:ring-ring"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            reset(kind);
            void onFile(e.dataTransfer.files[0]);
          }}
        >
          <FileUp className="size-5 text-muted-foreground" aria-hidden />
          <span className="text-sm font-medium">{file ? file.name : "CSVファイルを選ぶ"}</span>
          <span className="text-xs text-muted-foreground">
            {file ? `${file.body.length.toLocaleString()}行・${file.encoding}` : "UTF-8 / Shift_JIS・5MB・5,000行まで"}
          </span>
          <input ref={inputRef} type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => { setCheck(null); setDone(null); void onFile(e.target.files?.[0]); }} />
        </label>
        {fileError && <p role="alert" className="mt-2 text-sm text-danger-strong">{fileError}</p>}
      </Panel>

      {/* 2. 割り当てとプレビュー */}
      {file && !done && (
        <Panel className="p-4 sm:p-5">
          <h2 className="mb-3 text-sm font-semibold">項目の割り当て</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {def.fields.map((f) => (
              <div key={f.key} className="grid gap-1">
                <label htmlFor={`map-${f.key}`} className="text-xs text-muted-foreground">
                  {f.label}{f.required && <span className="text-danger-strong">＊</span>}{f.hint && <span className="ml-1">（{f.hint}）</span>}
                </label>
                <SelectField
                  id={`map-${f.key}`}
                  value={mapping[f.key] === null || mapping[f.key] === undefined ? "" : String(mapping[f.key])}
                  onChange={(v) => { setMapping((m) => ({ ...m, [f.key]: v === "" ? null : Number(v) })); setCheck(null); }}
                  noneLabel="使わない"
                  options={file.header.map((h, i) => ({ value: String(i), label: h || `（${i + 1}列目）` }))}
                  invalid={f.required && (mapping[f.key] ?? null) === null}
                />
              </div>
            ))}
          </div>

          <div className="mt-4 overflow-x-auto rounded-md border">
            <table className="w-full text-xs">
              <caption className="sr-only">先頭5行のプレビュー</caption>
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="w-10 px-2 py-1.5 text-right font-normal">行</th>
                  {def.fields.filter((f) => (mapping[f.key] ?? null) !== null).map((f) => <th key={f.key} className="px-2 py-1.5 text-left font-normal whitespace-nowrap">{f.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {applyMapping(kind, file.body.slice(0, 5), mapping).map((r, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-2 py-1.5 text-right tabular text-muted-foreground">{i + 1}</td>
                    {def.fields.filter((f) => (mapping[f.key] ?? null) !== null).map((f) => <td key={f.key} className="max-w-48 truncate px-2 py-1.5 whitespace-nowrap">{r[f.key]}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {file.body.length > 5 && <p className="mt-1 text-xs text-muted-foreground">ほか {(file.body.length - 5).toLocaleString()}行</p>}

          <div className="mt-4 flex items-center justify-end gap-3">
            {missing.length > 0 && <p className="text-xs text-danger-strong">{missing.join("、")}を割り当ててください</p>}
            <Button type="button" variant="brand" disabled={busy || missing.length > 0} onClick={verify}>{busy && !check ? "確認中…" : "内容を確認"}</Button>
          </div>
        </Panel>
      )}

      {/* 3. 検証結果 */}
      {check && !done && (
        <Panel className="p-4 sm:p-5">
          <h2 className="mb-3 text-sm font-semibold">確認</h2>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="行数" value={check.total} />
            <Stat label={kind === "products" ? "新規" : "登録"} value={check.inserts} />
            {kind === "products" ? <Stat label="更新" value={check.updates} /> : <Stat label="スキップ" value={check.skips} hint={kind === "opening" ? "初期在庫が登録済み" : undefined} />}
            <Stat label="エラー" value={check.errorRows} danger={check.errorRows > 0} />
          </dl>

          {check.duplicateFile && (
            <p role="alert" className="mt-4 flex items-start gap-2 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-strong">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />同じ内容のファイルは取り込み済みです。在庫が二重に増えるのを防ぐため、取り込めません。
            </p>
          )}

          {check.errorRows > 0 && (
            <div className="mt-4 max-h-72 overflow-y-auto rounded-md border">
              <table className="w-full text-sm">
                <caption className="sr-only">エラーのある行</caption>
                <tbody>
                  {check.errors.map((e) => (
                    <tr key={e.row} className="border-b last:border-0">
                      <th scope="row" className="w-20 px-3 py-2 text-left align-top font-normal text-muted-foreground tabular">{e.row}行目</th>
                      <td className="px-3 py-2 text-danger-strong">{e.messages.join("／")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {check.errorRows > check.errors.length && <p className="border-t px-3 py-2 text-xs text-muted-foreground">ほか {check.errorRows - check.errors.length}行</p>}
            </div>
          )}

          <div className="mt-4 flex items-center justify-end gap-3">
            {check.errorRows > 0 && <p className="text-xs text-muted-foreground">誤りのある行を直してから、もう一度選んでください</p>}
            <Button type="button" variant="brand" disabled={busy || check.errorRows > 0 || check.duplicateFile || check.inserts + check.updates === 0} onClick={execute}>
              {busy ? "取り込み中…" : check.errorRows > 0 || check.duplicateFile || check.inserts + check.updates === 0 ? "取り込めません" : `${(check.inserts + check.updates).toLocaleString()}件を取り込む`}
            </Button>
          </div>
        </Panel>
      )}

      {done && (
        <Panel className="flex flex-col items-start gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <p className="flex items-center gap-2 text-sm font-medium"><CheckCircle2 className="size-4 text-success" aria-hidden />{done}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => reset(kind)}>続けて取り込む</Button>
        </Panel>
      )}
    </div>
  );
}

function Stat({ label, value, hint, danger }: { label: string; value: number; hint?: string; danger?: boolean }) {
  return (
    <div className="rounded-md border px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("text-lg font-semibold tabular", danger && "text-danger-strong")}>{value.toLocaleString()}</dd>
      {hint && <dd className="text-[11px] text-muted-foreground">{hint}</dd>}
    </div>
  );
}
