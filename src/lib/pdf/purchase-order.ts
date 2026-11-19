/**
 * 発注書の PDF（A4 縦）。pdf-lib で直接描く（ブラウザや外部サービスは使わない）。
 * 日本語は IPAゴシック（assets/fonts）を、使う文字だけ埋め込むので文字化けしない。
 * 取引先に送っても違和感のないよう、罫線と余白だけのシンプルな帳票にしている。
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";

const A4 = { w: 595.28, h: 841.89 };
const M = 50;
const INK = rgb(0.094, 0.094, 0.106);
const MUTED = rgb(0.443, 0.443, 0.478);
const LINE = rgb(0.894, 0.894, 0.906);
const TINT = rgb(0.957, 0.957, 0.961);
const WHITE = rgb(1, 1, 1);

let fontBytes: Promise<Buffer> | null = null;
function loadFont(): Promise<Buffer> {
  fontBytes ??= readFile(path.join(process.cwd(), "assets/fonts/ipag.ttf"));
  return fontBytes;
}

export type PurchaseOrderPdf = {
  number: string;
  status: string;
  orderOn: string;
  expectedOn: string | null;
  notes: string;
  total: number;
  supplier: { name: string; contactName: string; phone: string; address: string };
  issuer: { companyName: string; postalCode: string; address: string; phone: string; email: string; contactName: string; poNote: string };
  lines: { code: string; name: string; quantity: number; unit: string; unitPrice: number; amount: number }[];
};

const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;
const num = (n: number, d = 3) => n.toLocaleString("ja-JP", { maximumFractionDigits: d });
const date = (d: string | null) => (d ? `${d.slice(0, 4)}年${Number(d.slice(5, 7))}月${Number(d.slice(8, 10))}日` : "—");

class Canvas {
  page!: PDFPage;
  constructor(readonly doc: PDFDocument, readonly font: PDFFont) {}
  newPage() {
    this.page = this.doc.addPage([A4.w, A4.h]);
  }
  width(t: string, size: number) {
    return this.font.widthOfTextAtSize(t, size);
  }
  /** y は上からの距離 */
  text(t: string, x: number, y: number, size: number, o: { align?: "left" | "right" | "center"; color?: ReturnType<typeof rgb>; bold?: boolean } = {}) {
    const w = this.width(t, size);
    const dx = o.align === "right" ? -w : o.align === "center" ? -w / 2 : 0;
    const draw = (ox: number) => this.page.drawText(t, { x: x + dx + ox, y: A4.h - y - size, size, font: this.font, color: o.color ?? INK });
    draw(0);
    if (o.bold) draw(0.3); // IPAゴシックには太字が無いので少しずらして重ねる
  }
  rect(x: number, y: number, w: number, h: number, o: { fill?: ReturnType<typeof rgb>; stroke?: ReturnType<typeof rgb> } = {}) {
    this.page.drawRectangle({ x, y: A4.h - y - h, width: w, height: h, color: o.fill, borderColor: o.stroke, borderWidth: o.stroke ? 0.8 : 0 });
  }
  line(x1: number, y: number, x2: number, color = LINE, thickness = 0.6) {
    this.page.drawLine({ start: { x: x1, y: A4.h - y }, end: { x: x2, y: A4.h - y }, color, thickness });
  }
  wrap(t: string, size: number, max: number): string[] {
    const out: string[] = [];
    for (const para of t.split("\n")) {
      let line = "";
      for (const ch of [...para]) {
        if (this.width(line + ch, size) > max && line) {
          out.push(line);
          line = ch;
        } else line += ch;
      }
      out.push(line);
    }
    return out;
  }
}

export async function renderPurchaseOrderPdf(d: PurchaseOrderPdf): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(await loadFont(), { subset: true });
  doc.setTitle(`発注書 ${d.number} ${d.supplier.name}`);
  doc.setCreator("StockFlow");
  doc.setProducer("StockFlow");
  doc.setLanguage("ja-JP");
  const c = new Canvas(doc, font);
  const right = A4.w - M;
  const W = A4.w - M * 2;
  const col = { no: M + 8, name: M + 30, qty: M + W * 0.64, unit: M + W * 0.655, price: M + W * 0.84, amount: right - 8 };

  const head = (first: boolean) => {
    c.newPage();
    c.text(first ? "発　注　書" : "発注書（続き）", first ? A4.w / 2 : M, M, first ? 20 : 12, { align: first ? "center" : "left", bold: true });
    c.text(`発注番号　${d.number}`, right, first ? M + 34 : M, 8.5, { align: "right" });
    c.text(`発注日　${date(d.orderOn)}`, right, first ? M + 47 : M + 13, 8.5, { align: "right" });
    if (d.status === "draft" || d.status === "cancelled") {
      c.text(d.status === "draft" ? "下書き" : "キャンセル", M, first ? M + 34 : M + 18, 9, { color: rgb(0.86, 0.15, 0.15), bold: true });
    }
  };
  const tableHead = (y: number) => {
    c.rect(M, y, W, 20, { fill: INK });
    const ty = y + 5.5;
    c.text("No", col.no, ty, 8, { color: WHITE });
    c.text("品名", col.name, ty, 8, { color: WHITE });
    c.text("数量", col.qty, ty, 8, { align: "right", color: WHITE });
    c.text("単位", col.unit, ty, 8, { color: WHITE });
    c.text("単価", col.price, ty, 8, { align: "right", color: WHITE });
    c.text("金額", col.amount, ty, 8, { align: "right", color: WHITE });
    return y + 20;
  };

  head(true);
  // 発注先（左）
  let y = M + 72;
  const supplierName = `${d.supplier.name}`;
  const nameLines = c.wrap(supplierName, 14, W * 0.5);
  for (const l of nameLines) {
    c.text(l, M, y, 14, { bold: true });
    y += 19;
  }
  c.text("御中", M + Math.min(c.width(nameLines.at(-1) ?? "", 14) + 8, W * 0.52), y - 17, 10);
  c.line(M, y + 1, M + W * 0.56, INK, 0.8);
  y += 8;
  if (d.supplier.contactName) {
    c.text(`ご担当　${d.supplier.contactName} 様`, M, y, 8.5, { color: MUTED });
    y += 13;
  }
  y += 10;
  c.text("下記のとおり発注いたします。", M, y, 9.5);
  y += 22;
  c.rect(M, y, W * 0.56, 46, { fill: TINT });
  c.text("合計金額（税抜）", M + 10, y + 9, 8.5, { color: MUTED });
  c.text(yen(d.total), M + W * 0.56 - 10, y + 7, 16, { align: "right", bold: true });
  c.text("納品希望日", M + 10, y + 30, 8.5, { color: MUTED });
  c.text(date(d.expectedOn), M + W * 0.56 - 10, y + 29, 9.5, { align: "right" });
  const leftBottom = y + 46;

  // 発注元（右）
  let ry = M + 72;
  const ix = right;
  c.text(d.issuer.companyName, ix, ry, 11, { align: "right", bold: true });
  ry += 18;
  for (const t of [
    d.issuer.postalCode ? `〒${d.issuer.postalCode}` : "",
    d.issuer.address,
    d.issuer.phone ? `TEL ${d.issuer.phone}` : "",
    d.issuer.email,
    d.issuer.contactName ? `担当　${d.issuer.contactName}` : "",
  ]) {
    if (!t) continue;
    for (const l of c.wrap(t, 8.5, W * 0.4)) {
      c.text(l, ix, ry, 8.5, { align: "right", color: MUTED });
      ry += 12.5;
    }
  }
  y = Math.max(leftBottom, ry) + 24;

  // 明細
  y = tableHead(y);
  const nameW = col.qty - col.name - 50;
  d.lines.forEach((l, i) => {
    const wrapped = c.wrap(l.name, 8.5, nameW);
    const h = Math.max(30, wrapped.length * 11.5 + 18);
    if (y + h > A4.h - M - 30) {
      c.text("次のページに続きます", right, A4.h - M - 10, 8, { align: "right", color: MUTED });
      head(false);
      y = tableHead(M + 34);
    }
    c.text(String(i + 1), col.no, y + 6, 8.5, { color: MUTED });
    wrapped.forEach((t, j) => c.text(t, col.name, y + 6 + j * 11.5, 8.5));
    c.text(l.code, col.name, y + 6 + wrapped.length * 11.5, 7, { color: MUTED });
    c.text(num(l.quantity), col.qty, y + 6, 8.5, { align: "right" });
    c.text(l.unit, col.unit, y + 6, 8.5);
    c.text(num(l.unitPrice, 2), col.price, y + 6, 8.5, { align: "right" });
    c.text(num(l.amount, 0), col.amount, y + 6, 8.5, { align: "right" });
    y += h;
    c.line(M, y, right);
  });

  // 合計・備考
  const notes = [d.notes, d.issuer.poNote].filter(Boolean).join("\n");
  const noteLines = notes ? c.wrap(notes, 8.5, W - 20) : [];
  if (y + 50 + (noteLines.length ? noteLines.length * 12 + 30 : 0) > A4.h - M) {
    head(false);
    y = M + 34;
  }
  y += 10;
  c.text("合計（税抜）", M + W * 0.55, y, 10, { bold: true });
  c.text(yen(d.total), col.amount, y - 1, 12, { align: "right", bold: true });
  y += 18;
  c.text("※消費税は別途、請求時に計算してください。", col.amount, y, 7.5, { align: "right", color: MUTED });
  y += 24;
  if (noteLines.length) {
    const h = noteLines.length * 12 + 22;
    c.rect(M, y, W, h, { stroke: LINE });
    c.text("備考", M + 10, y + 6, 8, { color: MUTED });
    noteLines.forEach((l, i) => c.text(l, M + 10, y + 19 + i * 12, 8.5));
  }

  const pages = doc.getPages();
  if (pages.length > 1) {
    pages.forEach((p, i) => {
      const t = `${i + 1} / ${pages.length}`;
      p.drawText(t, { x: A4.w / 2 - c.width(t, 8) / 2, y: 24, size: 8, font, color: MUTED });
    });
  }
  return doc.save();
}

export function pdfResponse(bytes: Uint8Array, filename: string, download: boolean): Response {
  const safe = filename.replace(/[\\/:*?"<>|\s]+/g, "_");
  return new Response(Buffer.from(bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `${download ? "attachment" : "inline"}; filename="purchase-order.pdf"; filename*=UTF-8''${encodeURIComponent(safe)}`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
