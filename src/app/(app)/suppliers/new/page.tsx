import { PageHeader } from "@/components/common/page-header";
import { SupplierForm } from "@/components/suppliers/supplier-form";
import { requireRole } from "@/lib/auth";

export const metadata = { title: "仕入先登録" };

export default async function NewSupplierPage() {
  await requireRole(["admin"]);
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="仕入先登録" back={{ href: "/suppliers", label: "仕入先管理" }} />
      <SupplierForm initial={{ name: "", contactName: "", phone: "", email: "", address: "", notes: "", isActive: true }} />
    </div>
  );
}
