/**
 * CSV の読み書きと、取込データの整形（純粋関数。画面とサーバーで同じものを使う）。
 *   出力：UTF-8（BOM 付き・Excel で文字化けしない）、CRLF、必要なときだけ "" で囲む。
 *   数式として解釈される値（= + - @ で始まる文字列）は先頭に ' を付けて無害化する（CSV インジェクション対策）。
 *   入力：RFC 4180（"" で囲んだ項目の中の改行・カンマ・"" に対応）。BOM は取り除く。
 */
import { isDateString } from "./dates";

export type CsvValue = string | number | boolean | null | undefined;

const FORMULA = /^[=+\-@\t\r]/;

export function escapeCell(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (typeof value === "string" && FORMULA.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: CsvValue[][]): string {
  const lines = [header, ...rows].map((r) => r.map(escapeCell).join(","));
  return `﻿${lines.join("\r\n")}\r\n`;
}

/** CSV の文字列を行の配列にする（空行は除く） */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"' && cell === "") {
      quoted = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/** バイト列を文字列にする。UTF-8 として読めなければ Shift_JIS（Excel の既定の保存形式）として読む */
export function decodeCsvBytes(bytes: Uint8Array): { text: string; encoding: "UTF-8" | "Shift_JIS" } {
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes), encoding: "UTF-8" };
  } catch {
    return { text: new TextDecoder("shift_jis").decode(bytes), encoding: "Shift_JIS" };
  }
}

// ---------------------------------------------------------------
// 取込の種類と項目
// ---------------------------------------------------------------
export type ImportKind = "products" | "opening" | "movements";

export type ImportField = { key: string; label: string; required?: boolean; aliases: string[]; hint?: string };

export const IMPORT_KINDS: Record<ImportKind, { label: string; description: string; fields: ImportField[]; sample: string[][] }> = {
  products: {
    label: "商品マスタ",
    description: "商品コードが同じ商品は上書きします。カテゴリ・仕入先は名前で探し、無ければ作ります。",
    fields: [
      { key: "code", label: "商品コード", required: true, aliases: ["コード", "品番", "code", "sku"] },
      { key: "name", label: "商品名", required: true, aliases: ["品名", "名称", "name"] },
      { key: "category", label: "カテゴリ", aliases: ["分類", "category"] },
      { key: "unit", label: "単位", aliases: ["unit"], hint: "空欄は「個」" },
      { key: "supplier", label: "仕入先", aliases: ["仕入先名", "supplier"] },
      { key: "unit_cost", label: "仕入単価", aliases: ["単価", "原価", "unit_cost", "cost"] },
      { key: "reorder_point", label: "発注点", aliases: ["reorder_point"] },
      { key: "target_stock", label: "目標在庫", aliases: ["適正在庫", "target_stock"], hint: "空欄は発注点と同じ" },
      { key: "order_lot", label: "発注単位", aliases: ["ロット", "入数", "order_lot"], hint: "空欄は1" },
      { key: "min_order_qty", label: "最低発注数量", aliases: ["最小発注数", "min_order_qty"] },
      { key: "location", label: "保管場所", aliases: ["棚番", "ロケーション", "location"] },
      { key: "notes", label: "メモ", aliases: ["備考", "notes", "memo"] },
    ],
    sample: [
      ["商品コード", "商品名", "カテゴリ", "単位", "仕入先", "仕入単価", "発注点", "目標在庫", "発注単位", "最低発注数量", "保管場所", "メモ"],
      ["PP-0001", "塩ビ管 VP20（4m）", "配管部材", "本", "東邦管材", "980", "20", "40", "10", "0", "A-01", ""],
    ],
  },
  opening: {
    label: "初期在庫",
    description: "使い始めの在庫数を登録します。初期在庫が登録済みの商品は飛ばします。",
    fields: [
      { key: "code", label: "商品コード", required: true, aliases: ["コード", "品番", "code", "sku"] },
      { key: "quantity", label: "数量", required: true, aliases: ["在庫数", "在庫", "数", "quantity", "qty"] },
      { key: "occurred_on", label: "基準日", aliases: ["日付", "棚卸日", "date"], hint: "空欄は今日" },
    ],
    sample: [["商品コード", "数量", "基準日"], ["PP-0001", "35", ""]],
  },
  movements: {
    label: "入出庫履歴",
    description: "過去の入庫・出庫をまとめて登録します。同じファイルは2回取り込めません。",
    fields: [
      { key: "occurred_on", label: "日付", required: true, aliases: ["入出庫日", "date"] },
      { key: "code", label: "商品コード", required: true, aliases: ["コード", "品番", "code", "sku"] },
      { key: "direction", label: "区分", required: true, aliases: ["入出庫", "種別", "direction", "type"], hint: "入庫／出庫" },
      { key: "quantity", label: "数量", required: true, aliases: ["数", "quantity", "qty"] },
      { key: "note", label: "備考", aliases: ["メモ", "note", "memo"] },
    ],
    sample: [["日付", "商品コード", "区分", "数量", "備考"], ["2026/11/01", "PP-0001", "入庫", "10", ""], ["2026/11/02", "PP-0001", "出庫", "3", "現場A"]],
  },
};

export const MAX_IMPORT_ROWS = 5000;

const normalizeHeader = (s: string) => s.trim().toLowerCase().replace(/[\s_　（）()]/g, "");

export type ColumnMapping = Record<string, number | null>;

/** 見出しの名前から、項目の割り当てを推測する */
export function guessMapping(kind: ImportKind, header: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const used = new Set<number>();
  for (const field of IMPORT_KINDS[kind].fields) {
    const names = [field.label, ...field.aliases].map(normalizeHeader);
    const index = header.findIndex((h, i) => !used.has(i) && names.includes(normalizeHeader(h)));
    mapping[field.key] = index >= 0 ? index : null;
    if (index >= 0) used.add(index);
  }
  return mapping;
}

/** 割り当てに従って行を取り出す（列が無い・範囲外は空文字） */
export function applyMapping(kind: ImportKind, rows: string[][], mapping: ColumnMapping): Record<string, string>[] {
  return rows.map((row) => {
    const out: Record<string, string> = {};
    for (const field of IMPORT_KINDS[kind].fields) {
      const index = mapping[field.key];
      out[field.key] = index === null || index === undefined ? "" : (row[index] ?? "").trim();
    }
    return out;
  });
}

// ---------------------------------------------------------------
// 1行の検証と整形（値の形式だけ。商品の有無などはサーバーで DB を見て確かめる）
// ---------------------------------------------------------------
const toHalfWidth = (s: string) => s.replace(/[０-９．－／]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));

/** "1,200" "１２００" → 1200。空は null、数でなければ NaN */
export function parseNumberCell(value: string): number | null {
  const s = toHalfWidth(value).replace(/[,，\s]/g, "");
  if (s === "") return null;
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
}

/** "2026/1/5" "2026-01-05" "2026年1月5日" → "2026-01-05"。読めなければ null */
export function parseDateCell(value: string): string | null {
  const s = toHalfWidth(value).trim();
  const m = s.match(/^(\d{4})[-/年.](\d{1,2})[-/月.](\d{1,2})日?$/);
  if (!m) return null;
  const iso = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  return isDateString(iso) ? iso : null;
}

export function parseDirectionCell(value: string): "in" | "out" | null {
  const v = value.trim().toLowerCase();
  if (["入庫", "入", "in", "+", "受入", "入荷"].includes(v)) return "in";
  if (["出庫", "出", "out", "-", "払出", "出荷"].includes(v)) return "out";
  return null;
}

const decimals3 = (n: number) => Math.abs(Math.round(n * 1000) - n * 1000) < 1e-6;

export type NormalizedRow = Record<string, string | number | null>;
export type RowCheck = { row: number; value: NormalizedRow | null; errors: string[] };

/** 1行を検証して DB 関数に渡す形にする。row は見出しを除いた1始まりの行番号 */
export function normalizeImportRow(kind: ImportKind, raw: Record<string, string>, row: number, today: string): RowCheck {
  const errors: string[] = [];
  const num = (key: string, label: string, opts: { required?: boolean; positive?: boolean; max?: number; digits?: number } = {}) => {
    const n = parseNumberCell(raw[key] ?? "");
    if (n === null) {
      if (opts.required) errors.push(`${label}を入力してください`);
      return null;
    }
    if (Number.isNaN(n)) errors.push(`${label}は数字で入力してください`);
    else if (opts.positive ? n <= 0 : n < 0) errors.push(`${label}は${opts.positive ? "0より大きい数" : "0以上"}にしてください`);
    else if (n > (opts.max ?? 9_999_999)) errors.push(`${label}が大きすぎます`);
    else if (!(opts.digits === 2 ? Math.abs(Math.round(n * 100) - n * 100) < 1e-6 : decimals3(n))) errors.push(`${label}の小数の桁が多すぎます`);
    else return n;
    return null;
  };
  const text = (key: string, label: string, max: number, required = false) => {
    const s = (raw[key] ?? "").trim();
    if (required && s === "") errors.push(`${label}を入力してください`);
    if (s.length > max) errors.push(`${label}は${max}文字以内にしてください`);
    return s;
  };
  const date = (key: string, label: string, required: boolean) => {
    const s = (raw[key] ?? "").trim();
    if (s === "") {
      if (required) errors.push(`${label}を入力してください`);
      return required ? null : today;
    }
    const d = parseDateCell(s);
    if (!d) errors.push(`${label}の形式が正しくありません（例：2026/11/01）`);
    else if (d > today) errors.push(`${label}に未来の日付は入力できません`);
    return d;
  };

  let value: NormalizedRow;
  if (kind === "products") {
    const reorderPoint = num("reorder_point", "発注点") ?? 0;
    const target = num("target_stock", "目標在庫");
    value = {
      code: text("code", "商品コード", 40, true),
      name: text("name", "商品名", 100, true),
      category: text("category", "カテゴリ", 50),
      unit: text("unit", "単位", 10) || "個",
      supplier: text("supplier", "仕入先", 100),
      unit_cost: num("unit_cost", "仕入単価", { max: 99_999_999, digits: 2 }) ?? 0,
      reorder_point: reorderPoint,
      target_stock: target ?? reorderPoint,
      order_lot: num("order_lot", "発注単位", { positive: true }) ?? 1,
      min_order_qty: num("min_order_qty", "最低発注数量") ?? 0,
      location: text("location", "保管場所", 50),
      notes: text("notes", "メモ", 1000),
    };
    if (target !== null && target < reorderPoint) errors.push("目標在庫は発注点以上にしてください");
  } else if (kind === "opening") {
    value = { code: text("code", "商品コード", 40, true), quantity: num("quantity", "数量", { required: true, positive: true }), occurred_on: date("occurred_on", "基準日", false) };
  } else {
    const dirRaw = (raw.direction ?? "").trim();
    const direction = parseDirectionCell(dirRaw);
    if (dirRaw === "") errors.push("区分を入力してください");
    else if (!direction) errors.push("区分は「入庫」か「出庫」にしてください");
    value = {
      occurred_on: date("occurred_on", "日付", true),
      code: text("code", "商品コード", 40, true),
      direction,
      quantity: num("quantity", "数量", { required: true, positive: true }),
      note: text("note", "備考", 200),
    };
  }
  return { row, value: errors.length ? null : value, errors };
}
