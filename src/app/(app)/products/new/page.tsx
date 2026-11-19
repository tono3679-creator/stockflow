import { PageHeader } from "@/components/common/page-header";
import { ProductForm } from "@/components/products/product-form";
import { asCurrentUser, requireRole } from "@/lib/auth";
import { categoryOptions, supplierOptions } from "@/lib/data/lookups";

export const metadata = { title: "商品登録" };

export default async function NewProductPage() {
  await requireRole(["admin"]);
  const [categories, suppliers] = await asCurrentUser((tx) => Promise.all([categoryOptions(tx), supplierOptions(tx)]));
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="商品登録" back={{ href: "/products", label: "商品管理" }} />
      <ProductForm
        isNew
        categories={categories}
        suppliers={suppliers}
        initial={{ code: "", name: "", categoryId: "", unit: "個", supplierId: "", unitCost: "" as never, reorderPoint: "" as never, targetStock: "" as never, orderLot: "1" as never, minOrderQty: "" as never, location: "", isActive: true, notes: "", openingStock: "" as never }}
      />
    </div>
  );
}
