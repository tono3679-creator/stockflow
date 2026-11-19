import { asCurrentUser, getCurrentUser } from "@/lib/auth";
import { listMovements, listProductStock, type StockFilter } from "@/lib/data/inventory";
import { listOrders, type OrderFilter } from "@/lib/data/orders";
import { toCsv, type CsvValue } from "@/lib/domain/csv";
import { toLocalDate } from "@/lib/domain/dates";
import { MOVEMENT_LABEL, PO_STATUS_LABEL, STOCK_STATUS_LABEL } from "@/lib/domain/labels";
import { formatDateTimeFull } from "@/lib/format";

export const runtime = "nodejs";

const KINDS = { products: "商品マスタ", inventory: "在庫一覧", movements: "入出庫履歴", orders: "発注一覧" } as const;
type Kind = keyof typeof KINDS;
const MAX = 50_000;
const STOCK_FILTERS = ["all", "ok", "low", "out", "attention"];
const ORDER_FILTERS = ["", "draft", "open", "partial", "delayed", "received", "cancelled"];

/**
 * CSV 出力（UTF-8 BOM 付き・CRLF。Excel でそのまま開ける）。ログイン中の利用者の権限（RLS）で読む。
 * 一覧画面の絞り込み条件（URL）を引き継ぐ。セルの先頭が = + - @ のときは数式として実行されないようにする。
 * 商品マスタの出力は、そのまま「商品マスタ」の取込に使える列の並び。
 */
export async function GET(request: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  if (!(kind in KINDS)) return new Response("Not Found", { status: 404 });
  const user = await getCurrentUser();
  if (!user) return new Response("ログインしてください", { status: 401 });
  const sp = new URL(request.url).searchParams;
  const get = (k: string) => (sp.get(k) ?? "").slice(0, 100);

  const { header, rows } = await asCurrentUser(async (tx): Promise<{ header: string[]; rows: CsvValue[][] }> => {
    switch (kind as Kind) {
      case "products": {
        const { rows: list } = await listProductStock(tx, { q: get("q"), includeInactive: true, byCode: true, limit: MAX });
        return {
          header: ["商品コード", "商品名", "カテゴリ", "単位", "仕入先", "仕入単価", "発注点", "目標在庫", "発注単位", "最低発注数量", "保管場所", "メモ", "有効"],
          rows: list.map((p) => [p.code, p.name, p.category_name, p.unit, p.supplier_name, p.unit_cost, p.reorder_point, p.target_stock, p.order_lot, p.min_order_qty, p.location, p.notes, p.is_active ? "有効" : "無効"]),
        };
      }
      case "inventory": {
        const filter = (STOCK_FILTERS.includes(get("filter")) ? get("filter") : "all") as StockFilter;
        const { rows: list } = await listProductStock(tx, { q: get("q"), filter, byCode: true, limit: MAX });
        return {
          header: ["商品コード", "商品名", "カテゴリ", "仕入先", "単位", "在庫数", "発注点", "目標在庫", "発注残", "状態", "発注提案数", "仕入単価", "在庫金額（参考）", "最終出庫日", "保管場所"],
          rows: list.map((p) => [p.code, p.name, p.category_name, p.supplier_name, p.unit, p.on_hand, p.reorder_point, p.target_stock, p.on_order, STOCK_STATUS_LABEL[p.status], p.suggested_qty || "", p.unit_cost, p.stock_value, p.last_out_on, p.location]),
        };
      }
      case "movements": {
        const k = ["in", "out", "adjust"].includes(get("kind")) ? get("kind") : "";
        const { rows: list } = await listMovements(tx, { kind: k, q: get("q"), productId: /^[0-9a-f-]{36}$/.test(get("product")) ? get("product") : "", limit: MAX });
        return {
          header: ["日付", "商品コード", "商品名", "区分", "数量", "単位", "在庫（処理後）", "発注番号", "備考", "登録者", "登録日時", "取消済み"],
          rows: list.map((m) => [m.occurred_on, m.product_code, m.product_name, MOVEMENT_LABEL[m.kind], m.quantity, m.unit, m.balance_after, m.po_number, m.note, m.created_by_name, formatDateTimeFull(m.created_at), m.reversed ? "はい" : ""]),
        };
      }
      case "orders": {
        const status = (ORDER_FILTERS.includes(get("status")) ? get("status") : "") as OrderFilter;
        const { rows: list } = await listOrders(tx, { status, q: get("q"), limit: MAX });
        return {
          header: ["発注番号", "仕入先", "状態", "発注日", "納品予定日", "入荷遅延", "明細数", "合計金額（税抜）"],
          rows: list.map((o) => [o.number, o.supplier_name, PO_STATUS_LABEL[o.status], o.order_on, o.expected_on, o.delayed ? "遅延" : "", o.item_count, o.total_amount]),
        };
      }
    }
  });

  const filename = `${KINDS[kind as Kind]}_${toLocalDate(new Date(), user.settings.timezone).replace(/-/g, "")}.csv`;
  return new Response(toCsv(header, rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${kind}.csv"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}
