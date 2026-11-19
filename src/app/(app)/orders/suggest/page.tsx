import Link from "next/link";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader, Panel } from "@/components/common/page-header";
import { SuggestionBoard } from "@/components/orders/suggestion-board";
import { Button } from "@/components/ui/button";
import { asCurrentUser, requireRole } from "@/lib/auth";
import { listSuggestions } from "@/lib/data/orders";
import { todayFor } from "@/lib/today";
import { param, type SearchParams } from "@/lib/url";

export const metadata = { title: "発注提案" };

export default async function SuggestPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const user = await requireRole(["admin", "staff"]);
  const rows = await asCurrentUser((tx) => listSuggestions(tx));
  return (
    <>
      <PageHeader title="発注提案" back={{ href: "/orders", label: "発注" }} sub={rows.length > 0 ? `発注待ち ${rows.length}品目` : undefined} />
      {rows.length === 0 ? (
        <Panel><EmptyState title="発注が必要な商品はありません" action={<Button variant="outline" asChild><Link href="/orders/new">手動で発注書を作成</Link></Button>} /></Panel>
      ) : (
        <SuggestionBoard
          today={todayFor(user)}
          leadDays={user.settings.defaultLeadDays}
          only={param(sp, "product") || undefined}
          rows={rows.map((r) => ({
            id: r.id, code: r.code, name: r.name, unit: r.unit, onHand: r.on_hand, onOrder: r.on_order, draftQty: r.draft_qty, suggested: r.suggested_qty,
            unitCost: r.unit_cost, supplierId: r.supplier_id, supplierName: r.supplier_name, status: r.status,
          }))}
        />
      )}
    </>
  );
}
