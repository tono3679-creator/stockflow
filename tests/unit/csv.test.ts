import { describe, expect, it } from "vitest";
import {
  applyMapping, decodeCsvBytes, escapeCell, guessMapping, normalizeImportRow, parseCsv, parseDateCell, parseDirectionCell, parseNumberCell, toCsv,
} from "@/lib/domain/csv";

describe("CSV 出力", () => {
  it("BOM・CRLF・必要なときだけ囲む", () => {
    expect(toCsv(["a", "b"], [["x,y", 'say "hi"'], [1, null]])).toBe('﻿a,b\r\n"x,y","say ""hi"""\r\n1,\r\n');
  });
  it("数式として実行される値を無害化する（CSVインジェクション）", () => {
    expect(escapeCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(escapeCell("+81")).toBe("'+81");
    expect(escapeCell("@cmd")).toBe("'@cmd");
    expect(escapeCell(-3)).toBe("-3"); // 数値はそのまま
  });
});

describe("CSV 読み込み", () => {
  it("引用符の中のカンマ・改行・二重引用符、BOM、空行", () => {
    expect(parseCsv('﻿a,b\r\n"1,2","x\ny"\r\n\r\n"he said ""ok""",\n')).toEqual([["a", "b"], ["1,2", "x\ny"], ['he said "ok"', ""]]);
  });
  it("UTF-8 と Shift_JIS を判別して読む", () => {
    const utf8 = new TextEncoder().encode("商品コード,数量");
    expect(decodeCsvBytes(utf8)).toEqual({ text: "商品コード,数量", encoding: "UTF-8" });
    // 「在庫」の Shift_JIS
    const sjis = new Uint8Array([0x8d, 0xdd, 0x8c, 0xc9]);
    expect(decodeCsvBytes(sjis)).toEqual({ text: "在庫", encoding: "Shift_JIS" });
  });
});

describe("項目の割り当て", () => {
  it("見出しの表記ゆれから推測する", () => {
    const m = guessMapping("movements", ["日付", "品番", "入出庫", "数", "メモ"]);
    expect(m).toEqual({ occurred_on: 0, code: 1, direction: 2, quantity: 3, note: 4 });
    expect(applyMapping("movements", [["2026/11/01", " A-1 ", "入庫", "3", ""]], m)).toEqual([{ occurred_on: "2026/11/01", code: "A-1", direction: "入庫", quantity: "3", note: "" }]);
  });
  it("見つからない項目は null", () => {
    expect(guessMapping("opening", ["コード"]).quantity).toBeNull();
  });
});

describe("セルの値", () => {
  it("数値：カンマ・全角を受け付ける", () => {
    expect(parseNumberCell("1,200")).toBe(1200);
    expect(parseNumberCell("１２．５")).toBe(12.5);
    expect(parseNumberCell("")).toBeNull();
    expect(Number.isNaN(parseNumberCell("abc"))).toBe(true);
  });
  it("日付：/ - 年月日 を受け付け、存在しない日は null", () => {
    expect(parseDateCell("2026/1/5")).toBe("2026-01-05");
    expect(parseDateCell("2026-11-01")).toBe("2026-11-01");
    expect(parseDateCell("2026年2月3日")).toBe("2026-02-03");
    expect(parseDateCell("2026/02/30")).toBeNull();
    expect(parseDateCell("11/01")).toBeNull();
  });
  it("区分", () => {
    expect(parseDirectionCell("入庫")).toBe("in");
    expect(parseDirectionCell("OUT")).toBe("out");
    expect(parseDirectionCell("返品")).toBeNull();
  });
});

describe("1行の検証", () => {
  const today = "2026-11-19";
  it("商品マスタ：空欄は既定値、目標在庫 < 発注点 は誤り", () => {
    const ok = normalizeImportRow("products", { code: "A-1", name: "部品", reorder_point: "5" }, 1, today);
    expect(ok.errors).toEqual([]);
    expect(ok.value).toMatchObject({ unit: "個", target_stock: 5, order_lot: 1, unit_cost: 0 });
    const bad = normalizeImportRow("products", { code: "", name: "部品", reorder_point: "10", target_stock: "5", unit_cost: "x" }, 2, today);
    expect(bad.value).toBeNull();
    expect(bad.errors).toEqual(["商品コードを入力してください", "仕入単価は数字で入力してください", "目標在庫は発注点以上にしてください"]);
  });
  it("初期在庫：数量は0より大きい、日付の空欄は今日", () => {
    expect(normalizeImportRow("opening", { code: "A-1", quantity: "10" }, 1, today).value).toEqual({ code: "A-1", quantity: 10, occurred_on: today });
    expect(normalizeImportRow("opening", { code: "A-1", quantity: "0" }, 1, today).errors).toEqual(["数量は0より大きい数にしてください"]);
  });
  it("入出庫：未来日・区分の誤り・小数第4位", () => {
    const r = normalizeImportRow("movements", { occurred_on: "2026/12/01", code: "A-1", direction: "返品", quantity: "1.2345" }, 1, today);
    expect(r.errors).toEqual(["区分は「入庫」か「出庫」にしてください", "日付に未来の日付は入力できません", "数量の小数の桁が多すぎます"]);
  });
});
