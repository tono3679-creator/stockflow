import "server-only";
import type { Tx } from "@/lib/db";

export type SupplierRow = {
  id: string; name: string; contact_name: string; phone: string; email: string; address: string; notes: string; is_active: boolean;
  product_count: number; open_orders: number; delayed_orders: number;
};

export async function listSuppliers(tx: Tx, q = ""): Promise<SupplierRow[]> {
  const like = `%${q.trim().replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
  return tx<SupplierRow[]>`
    select s.*,
           (select count(*)::int from products p where p.organization_id = s.organization_id and p.supplier_id = s.id and p.is_active) product_count,
           (select count(*)::int from purchase_orders po where po.organization_id = s.organization_id and po.supplier_id = s.id and po.status in ('ordered', 'partial')) open_orders,
           (select count(*)::int from purchase_orders po where po.organization_id = s.organization_id and po.supplier_id = s.id and po.status in ('ordered', 'partial')
              and po.expected_on < org_today(po.organization_id)) delayed_orders
      from suppliers s
     where (${q.trim()} = '' or s.name ilike ${like} or s.contact_name ilike ${like})
     order by s.is_active desc, s.name`;
}

export async function getSupplier(tx: Tx, id: string): Promise<SupplierRow | null> {
  const [row] = await tx<SupplierRow[]>`
    select s.*, 0 product_count, 0 open_orders, 0 delayed_orders from suppliers s where s.id = ${id}`;
  return row ?? null;
}
