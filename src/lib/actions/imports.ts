"use server";
import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { asCurrentUser } from "@/lib/auth";
import type { Tx } from "@/lib/db";
import { IMPORT_KINDS, MAX_IMPORT_ROWS, normalizeImportRow, type ImportKind, type NormalizedRow } from "@/lib/domain/csv";
import { formatQty } from "@/lib/format";
import { todayFor } from "@/lib/today";
import { toUserMessage } from "./errors";
import type { ActionResult } from "./result";

const inputSchema = z.object({
  kind: z.enum(["products", "opening", "movements"]),
  fileName: z.string().max(200).default(""),
  rows: z.array(z.record(z.string(), z.string().max(2000))).min(1, "取り込む行がありません").max(MAX_IMPORT_ROWS, `一度に取り込めるのは${MAX_IMPORT_ROWS.toLocaleString()}行までです`),
});

export type ImportCheck = {
  total: number;
  valid: number;
  inserts: number;
  updates: number;
  skips: number;
  duplicateFile: boolean;
  /** 行ごとのエラー（最大100行分） */
  errors: { row: number; messages: string[] }[];
  errorRows: number;
};

type Analysis = ImportCheck & { normalized: NormalizedRow[]; hash: string };

/**
 * 取込前の検証（サーバー側。画面の検証は信用しない）。
 *   1. 各行の形式（数値・日付・必須・桁数）
 *   2. ファイル内の重複（商品コード）
 *   3. DB との突き合わせ：商品コードの有無、初期在庫の登録済み、出庫で在庫がマイナスにならないか、同じファイルの再取込
 * ファイルの同一性は、整形後の行の内容から計算したハッシュで判断する（保存し直しただけのファイルも同じものとみなす）。
 */
async function analyze(tx: Tx, kind: ImportKind, rows: Record<string, string>[], today: string): Promise<Analysis> {
  const checks = rows.map((raw, i) => normalizeImportRow(kind, raw, i + 1, today));
  const errs = new Map<number, string[]>();
  const add = (row: number, msg: string) => errs.set(row, [...(errs.get(row) ?? []), msg]);
  for (const c of checks) for (const e of c.errors) add(c.row, e);

  const codes = [...new Set(checks.map((c) => String(c.value?.code ?? "")).filter(Boolean))];
  const existing = new Map(
    (await tx<{ id: string; code: string; unit: string; on_hand: number; has_opening: boolean }[]>`
      select p.id, p.code, p.unit, coalesce(b.on_hand, 0) on_hand,
             exists (select 1 from stock_movements m where m.organization_id = p.organization_id and m.product_id = p.id and m.kind = 'opening') has_opening
        from products p left join stock_balances b on b.organization_id = p.organization_id and b.product_id = p.id
       where p.code = any(${codes}::text[])`).map((p) => [p.code, p]),
  );

  let inserts = 0;
  let updates = 0;
  let skips = 0;
  const seen = new Map<string, number>();
  if (kind === "products" || kind === "opening") {
    for (const c of checks) {
      if (!c.value) continue;
      const code = String(c.value.code);
      const first = seen.get(code);
      if (first) {
        add(c.row, `商品コード「${code}」が${first}行目と重複しています`);
        continue;
      }
      seen.set(code, c.row);
      const p = existing.get(code);
      if (kind === "products") {
        if (p) updates++;
        else inserts++;
      } else if (!p) add(c.row, `商品コード「${code}」が見つかりません`);
      else if (p.has_opening) skips++;
      else inserts++;
    }
  } else {
    // 日付の古い順に、今の在庫から足し引きしてマイナスにならないか確かめる（DB の関数も同じ順で処理する）
    const stock = new Map([...existing.values()].map((p) => [p.code, p.on_hand]));
    const ordered = checks.filter((c) => c.value).sort((a, b) => String(a.value!.occurred_on).localeCompare(String(b.value!.occurred_on)) || a.row - b.row);
    for (const c of ordered) {
      const v = c.value!;
      const code = String(v.code);
      const p = existing.get(code);
      if (!p) {
        add(c.row, `商品コード「${code}」が見つかりません`);
        continue;
      }
      const next = (stock.get(code) ?? 0) + (v.direction === "in" ? 1 : -1) * Number(v.quantity);
      if (next < -1e-9) {
        add(c.row, `在庫が不足しています（残り${formatQty(stock.get(code) ?? 0, p.unit)}）`);
        continue;
      }
      stock.set(code, Math.round(next * 1000) / 1000);
      inserts++;
    }
  }

  const normalized = checks.map((c) => c.value).filter((v): v is NormalizedRow => v !== null);
  const hash = createHash("sha256").update(`${kind}\n${JSON.stringify(normalized)}`).digest("hex");
  let duplicateFile = false;
  if (kind !== "products") {
    const [dup] = await tx<{ n: number }[]>`select count(*)::int n from import_jobs where kind = ${kind} and file_hash = ${hash}`;
    duplicateFile = dup.n > 0;
  }
  const errorList = [...errs.entries()].sort((a, b) => a[0] - b[0]).map(([row, messages]) => ({ row, messages }));
  return {
    total: rows.length,
    valid: rows.length - errorList.length,
    inserts, updates, skips, duplicateFile,
    errors: errorList.slice(0, 100),
    errorRows: errorList.length,
    normalized, hash,
  };
}

function strip(a: Analysis): ImportCheck {
  const { normalized: _n, hash: _h, ...rest } = a;
  return rest;
}

/** 取込前の確認（何件登録・更新・スキップされるか、どの行が誤りか） */
export async function checkImport(input: unknown): Promise<ActionResult<ImportCheck>> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "取込の内容が正しくありません" };
  const d = parsed.data;
  try {
    const result = await asCurrentUser(async (tx, user) => {
      if (user.role !== "admin") return null;
      return strip(await analyze(tx, d.kind, d.rows, todayFor(user)));
    });
    if (!result) return { ok: false, error: "CSVの取込は管理者が行えます" };
    return { ok: true, data: result };
  } catch (e) {
    return { ok: false, error: toUserMessage(e) };
  }
}

/** 取込の実行。もう一度検証し、誤りが1行でもあれば取り込まない（全件まとめて1つのトランザクション） */
export async function runImport(input: unknown): Promise<ActionResult<{ message: string }>> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "取込の内容が正しくありません" };
  const d = parsed.data;
  try {
    const out = await asCurrentUser(async (tx, user): Promise<ActionResult<{ message: string }>> => {
      if (user.role !== "admin") return { ok: false, error: "CSVの取込は管理者が行えます" };
      const a = await analyze(tx, d.kind, d.rows, todayFor(user));
      if (a.duplicateFile) return { ok: false, error: "同じファイルは取り込み済みです（在庫が二重に増えるのを防ぐため、2回目は取り込みません）" };
      if (a.errorRows > 0) return { ok: false, error: `${a.errorRows}行に誤りがあります。修正してからもう一度取り込んでください` };
      const fileName = d.fileName.slice(0, 200);
      const [r] = d.kind === "products"
        ? await tx<{ r: { inserted: number; updated: number; skipped: number } }[]>`select import_products(${tx.json(a.normalized as never)}, ${fileName}, ${a.hash}) r`
        : await tx<{ r: { inserted: number; updated: number; skipped: number } }[]>`select import_stock(${d.kind}::import_kind, ${tx.json(a.normalized as never)}, ${fileName}, ${a.hash}) r`;
      const parts = [
        r.r.inserted ? `${d.kind === "products" ? "新規" : "登録"} ${r.r.inserted}件` : "",
        r.r.updated ? `更新 ${r.r.updated}件` : "",
        r.r.skipped ? `スキップ ${r.r.skipped}件` : "",
      ].filter(Boolean);
      return { ok: true, data: { message: `${IMPORT_KINDS[d.kind].label}を取り込みました（${parts.join("・") || "0件"}）` } };
    });
    if (out.ok) for (const p of ["/dashboard", "/inventory", "/movements", "/products", "/suppliers", "/import"]) revalidatePath(p);
    return out;
  } catch (e) {
    return { ok: false, error: toUserMessage(e) };
  }
}
