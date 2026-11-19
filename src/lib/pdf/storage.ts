import "server-only";
import { storageEnv } from "@/lib/env";

/**
 * 発注書 PDF を Supabase Storage（非公開のバケット purchase-orders）に保存する。
 * SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が無ければ何もしない（PDF はその場で作って返す）。
 * 保存に失敗しても発注の内容は DB にあり、PDF はいつでも作り直せるので、エラーにはしない。
 */
export async function savePurchaseOrderPdf(orgId: string, number: string, bytes: Uint8Array): Promise<string | null> {
  if (!storageEnv.enabled) return null;
  const objectPath = `${orgId}/${number}.pdf`;
  try {
    const res = await fetch(`${storageEnv.url}/storage/v1/object/purchase-orders/${objectPath}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${storageEnv.serviceRoleKey}`,
        apikey: storageEnv.serviceRoleKey,
        "content-type": "application/pdf",
        "x-upsert": "true",
      },
      body: Buffer.from(bytes),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.error("PDF の保存に失敗しました", res.status, await res.text().catch(() => ""));
      return null;
    }
    return objectPath;
  } catch (e) {
    console.error("PDF の保存に失敗しました", e);
    return null;
  }
}
