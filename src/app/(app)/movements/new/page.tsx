import { PageHeader, Panel } from "@/components/common/page-header";
import { MovementForm } from "@/components/stock/movement-form";
import { asCurrentUser, requireRole } from "@/lib/auth";
import { pickerProducts } from "@/lib/data/lookups";
import { todayFor } from "@/lib/today";
import { param, type SearchParams } from "@/lib/url";

export const metadata = { title: "入出庫登録" };

/** 現場で片手でも使えるよう、大きな入力欄とボタンにしている */
export default async function NewMovementPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const user = await requireRole(["admin", "staff"]);
  const products = await asCurrentUser((tx) => pickerProducts(tx));
  const initial = products.find((p) => p.id === param(sp, "product"));
  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title="入出庫登録" back={{ href: "/movements", label: "入出庫" }} />
      <Panel className="p-4 sm:p-6">
        <MovementForm
          key={initial?.id ?? "new"}
          products={products}
          product={initial}
          direction={param(sp, "dir") === "out" ? "out" : "in"}
          today={todayFor(user)}
          large
        />
      </Panel>
    </div>
  );
}
