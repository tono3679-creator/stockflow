import { notFound } from "next/navigation";
import { PageHeader } from "@/components/common/page-header";
import { ProductForm } from "@/components/products/product-form";
import { uuidSchema } from "@/lib/actions/helpers";
import { asCurrentUser, requireRole } from "@/lib/auth";
import { getProductStock } from "@/lib/data/inventory";
import { categoryOptions, supplierOptions } from "@/lib/data/lookups";

export const metadata = { title: "商品の編集" };

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  await requireRole(["admin"]);
  const data = await asCurrentUser((tx) => Promise.all([getProductStock(tx, id), categoryOptions(tx), supplierOptions(tx)]));
  const [p, categories, suppliers] = data;
  if (!p) notFound();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="商品の編集" back={{ href: `/inventory/${id}`, label: p.name }} />
      <ProductForm
        id={id}
        isNew={false}
        categories={categories}
        suppliers={p.supplier_id && !suppliers.some((s) => s.id === p.supplier_id) ? [...suppliers, { id: p.supplier_id, name: p.supplier_name ?? "" }] : suppliers}
        initial={{
          code: p.code, name: p.name, categoryId: p.category_id ?? "", unit: p.unit, supplierId: p.supplier_id ?? "",
          unitCost: String(p.unit_cost) as never, reorderPoint: String(p.reorder_point) as never, targetStock: String(p.target_stock) as never,
          orderLot: String(p.order_lot) as never, minOrderQty: String(p.min_order_qty) as never, location: p.location, isActive: p.is_active, notes: p.notes,
        }}
      />
    </div>
  );
}
