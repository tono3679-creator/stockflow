import { getCurrentUser } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { getOrder } from "@/lib/data/orders";
import { pdfResponse, renderPurchaseOrderPdf } from "@/lib/pdf/purchase-order";
import { savePurchaseOrderPdf } from "@/lib/pdf/storage";

export const runtime = "nodejs";

/** 発注書の PDF（ログイン中の利用者の会社の発注書だけ。RLS で確かめる）。?download=1 でダウンロード */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "ログインしてください" }, { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return Response.json({ error: "見つかりません" }, { status: 404 });
  const o = await asUser(user.userId, (tx) => getOrder(tx, id), user.organizationId);
  if (!o) return Response.json({ error: "見つかりません" }, { status: 404 });
  const s = user.settings;
  const bytes = await renderPurchaseOrderPdf({
    number: o.number, status: o.status, orderOn: o.order_on, expectedOn: o.expected_on, notes: o.notes, total: o.total_amount,
    supplier: { name: o.supplier.name, contactName: o.supplier.contact_name, phone: o.supplier.phone, address: o.supplier.address },
    issuer: { companyName: s.companyName || user.organizationName, postalCode: s.postalCode, address: s.address, phone: s.phone, email: s.email, contactName: s.contactName, poNote: s.poNote },
    lines: o.items.map((i) => ({ code: i.code, name: i.name, quantity: i.quantity, unit: i.unit, unitPrice: i.unit_price, amount: i.amount })),
  });
  // 発注済の発注書は Storage にも保存する（設定があるときだけ。失敗しても PDF は返す）
  if (o.status !== "draft" && user.role !== "viewer") {
    const saved = await savePurchaseOrderPdf(user.organizationId, o.number, bytes);
    if (saved) await asUser(user.userId, (tx) => tx`select record_po_pdf(${id}, ${saved})`, user.organizationId).catch(() => {});
  }
  return pdfResponse(bytes, `発注書_${o.number}_${o.supplier.name}.pdf`, new URL(request.url).searchParams.has("download"));
}
