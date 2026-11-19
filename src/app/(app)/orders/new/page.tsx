import { PageHeader } from "@/components/common/page-header";
import { NewOrderForm } from "@/components/orders/new-order-form";
import { asCurrentUser, requireRole } from "@/lib/auth";
import { supplierOptions } from "@/lib/data/lookups";
import { todayFor } from "@/lib/today";

export const metadata = { title: "発注書作成" };

export default async function NewOrderPage() {
  const user = await requireRole(["admin", "staff"]);
  const [suppliers, products] = await asCurrentUser((tx) => Promise.all([
    supplierOptions(tx),
    tx<{ id: string; code: string; name: string; unit: string; on_hand: number; unit_cost: number; supplier_id: string | null }[]>`
      select id, code, name, unit, on_hand, unit_cost, supplier_id from product_stock where is_active order by code`,
  ]));
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="発注書作成" back={{ href: "/orders", label: "発注" }} />
      <NewOrderForm
        suppliers={suppliers}
        today={todayFor(user)}
        leadDays={user.settings.defaultLeadDays}
        products={products.map((p) => ({ id: p.id, code: p.code, name: p.name, unit: p.unit, onHand: p.on_hand, unitCost: p.unit_cost, supplierId: p.supplier_id }))}
      />
    </div>
  );
}
