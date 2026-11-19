import { notFound } from "next/navigation";
import { PageHeader } from "@/components/common/page-header";
import { SupplierForm } from "@/components/suppliers/supplier-form";
import { uuidSchema } from "@/lib/actions/helpers";
import { asCurrentUser, requireRole } from "@/lib/auth";
import { getSupplier } from "@/lib/data/suppliers";

export const metadata = { title: "仕入先の編集" };

export default async function EditSupplierPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  await requireRole(["admin"]);
  const s = await asCurrentUser((tx) => getSupplier(tx, id));
  if (!s) notFound();
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="仕入先の編集" back={{ href: `/suppliers/${id}`, label: s.name }} />
      <SupplierForm id={id} initial={{ name: s.name, contactName: s.contact_name, phone: s.phone, email: s.email, address: s.address, notes: s.notes, isActive: s.is_active }} />
    </div>
  );
}
