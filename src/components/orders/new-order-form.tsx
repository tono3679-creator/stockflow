"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Field } from "@/components/common/form-field";
import { Panel } from "@/components/common/page-header";
import { SelectField } from "@/components/common/select-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createOrders } from "@/lib/actions/orders";
import { safeAction } from "@/lib/client/safe-action";
import { addDays } from "@/lib/domain/dates";
import { LineEditor, toLineInput, type EditLine, type PriceProduct } from "./line-editor";

/** 手動の発注書作成（仕入先を選んで明細を入れる） */
export function NewOrderForm({ suppliers, products, today, leadDays }: {
  suppliers: { id: string; name: string }[]; products: (PriceProduct & { supplierId: string | null })[]; today: string; leadDays: number;
}) {
  const router = useRouter();
  const [supplierId, setSupplierId] = useState("");
  const [expectedOn, setExpectedOn] = useState(addDays(today, leadDays));
  const [lines, setLines] = useState<EditLine[]>([{ key: "1", product: null, quantity: "", unitPrice: "" }]);
  const [busy, setBusy] = useState(false);
  const key = useRef(crypto.randomUUID());
  const list = supplierId ? [...products.filter((p) => p.supplierId === supplierId), ...products.filter((p) => p.supplierId !== supplierId)] : products;
  const submit = async () => {
    if (!supplierId) return toast.error("仕入先を選んでください");
    const input = toLineInput(lines).map((l) => ({ ...l, supplierId }));
    if (input.length === 0) return toast.error("商品を選んでください");
    setBusy(true);
    const r = await safeAction(() => createOrders({ lines: input, status: "draft", orderOn: today, expectedOn, notes: "", key: key.current }));
    setBusy(false);
    if (!r.ok) return toast.error(r.fieldErrors ? Object.values(r.fieldErrors)[0] ?? r.error : r.error);
    toast.success("発注書を作成しました");
    router.push(`/orders/${r.data!.ids[0]}`);
  };
  return (
    <div className="grid gap-4">
      <Panel className="grid gap-4 p-4 sm:grid-cols-2 sm:p-6">
        <Field label="仕入先" htmlFor="supplier" required>
          <SelectField id="supplier" value={supplierId} onChange={setSupplierId} options={suppliers.map((s) => ({ value: s.id, label: s.name }))} />
        </Field>
        <Field label="納品予定日" htmlFor="expected">
          <Input id="expected" type="date" min={today} value={expectedOn} onChange={(e) => setExpectedOn(e.target.value)} />
        </Field>
      </Panel>
      <Panel className="p-4 sm:p-6">
        <LineEditor lines={lines} onChange={setLines} products={list} />
      </Panel>
      <div className="flex justify-end">
        <Button variant="brand" size="lg" onClick={submit} disabled={busy}>下書きを作成</Button>
      </div>
    </div>
  );
}
