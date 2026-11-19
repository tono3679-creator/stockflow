"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Field } from "@/components/common/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateOrder } from "@/lib/actions/orders";
import { safeAction } from "@/lib/client/safe-action";
import { LineEditor, toLineInput, type EditLine, type PriceProduct } from "./line-editor";

/** 下書きの編集（明細・納品予定日・備考） */
export function DraftEditor({ id, initial, products, expectedOn, notes, min, onClose }: {
  id: string; initial: EditLine[]; products: PriceProduct[]; expectedOn: string | null; notes: string; min: string; onClose: () => void;
}) {
  const router = useRouter();
  const [lines, setLines] = useState(initial);
  const [date, setDate] = useState(expectedOn ?? "");
  const [memo, setMemo] = useState(notes);
  const [busy, setBusy] = useState(false);
  return (
    <div className="grid gap-4 rounded-lg border bg-card p-4 sm:p-6">
      <LineEditor lines={lines} onChange={setLines} products={products} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="納品予定日" htmlFor="d-expected"><Input id="d-expected" type="date" min={min} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="備考（発注書に記載）" htmlFor="d-notes"><Input id="d-notes" value={memo} onChange={(e) => setMemo(e.target.value)} /></Field>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>閉じる</Button>
        <Button
          variant="brand"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const r = await safeAction(() => updateOrder({ id, expectedOn: date, notes: memo, lines: toLineInput(lines) }));
            setBusy(false);
            if (!r.ok) return toast.error(r.fieldErrors ? Object.values(r.fieldErrors)[0] ?? r.error : r.error);
            toast.success("保存しました");
            onClose();
            router.refresh();
          }}
        >
          保存
        </Button>
      </div>
    </div>
  );
}
