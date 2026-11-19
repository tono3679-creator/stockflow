import Link from "next/link";
import { Plus } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader, Panel } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { asCurrentUser, requireUser } from "@/lib/auth";
import { listSuppliers } from "@/lib/data/suppliers";
import { can } from "@/lib/domain/labels";

export const metadata = { title: "仕入先管理" };

export default async function SuppliersPage() {
  const user = await requireUser();
  const rows = await asCurrentUser((tx) => listSuppliers(tx));
  return (
    <>
      <PageHeader
        title="仕入先管理"
        actions={can.editMaster(user.role) && <Button variant="brand" asChild><Link href="/suppliers/new"><Plus aria-hidden />仕入先登録</Link></Button>}
      />
      <Panel>
        {rows.length === 0 ? <EmptyState title="仕入先がありません" /> : (
          <ul className="divide-y">
            {rows.map((s) => (
              <li key={s.id}>
                <Link href={`/suppliers/${s.id}`} className="flex items-center gap-4 px-4 py-3 hover:bg-muted/40">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{s.name}{!s.is_active && <span className="ml-2 text-xs text-muted-foreground">取引停止</span>}</div>
                    <div className="truncate text-xs text-muted-foreground">{[s.contact_name && `${s.contact_name} 様`, s.phone].filter(Boolean).join("・") || "—"}</div>
                  </div>
                  <div className="hidden text-right text-sm sm:block">
                    <div className="tabular">{s.product_count}</div>
                    <div className="text-xs text-muted-foreground">品目</div>
                  </div>
                  <div className="w-24 text-right">
                    {s.delayed_orders > 0 ? <Badge variant="danger">遅延 {s.delayed_orders}</Badge> : s.open_orders > 0 ? <Badge variant="info">入荷待ち {s.open_orders}</Badge> : null}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
