"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { ClipboardCheck } from "lucide-react";
import { Field } from "@/components/common/form-field";
import { QtyInput } from "@/components/common/qty-input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { adjustStock } from "@/lib/actions/stock";
import { safeAction } from "@/lib/client/safe-action";
import { formatQty, formatSignedQty } from "@/lib/format";
import { adjustSchema } from "@/lib/validation";
import type { z } from "zod";

/** 棚卸調整（数えた数量に合わせる。差分が履歴に残る） */
export function AdjustDialog({ product, today }: { product: { id: string; name: string; unit: string; onHand: number }; today: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const key = useRef(crypto.randomUUID());
  const form = useForm<z.input<typeof adjustSchema>>({
    resolver: zodResolver(adjustSchema),
    defaultValues: { productId: product.id, counted: "" as never, countedOn: today, reason: "", key: key.current },
  });
  const counted = Number(form.watch("counted"));
  const diff = Number.isFinite(counted) && String(form.watch("counted") ?? "") !== "" ? counted - product.onHand : null;
  const submit = form.handleSubmit(async (values) => {
    const r = await safeAction(() => adjustStock({ ...values, key: key.current }));
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    toast.success("棚卸調整を登録しました");
    key.current = crypto.randomUUID();
    setOpen(false);
    form.reset({ productId: product.id, counted: "" as never, countedOn: today, reason: "", key: key.current });
    router.refresh();
  });
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <ClipboardCheck aria-hidden />
        棚卸
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>棚卸調整</DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="grid gap-4" noValidate>
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-muted-foreground">システム上の在庫</span>
              <span className="tabular font-semibold">{formatQty(product.onHand, product.unit)}</span>
            </div>
            <Field label="実在庫（数えた数量）" htmlFor="adj-count" error={form.formState.errors.counted?.message} required>
              <QtyInput id="adj-count" unit={product.unit} {...form.register("counted")} />
            </Field>
            {diff !== null && (
              <p className="text-sm">
                差分 <span className="tabular font-semibold">{formatSignedQty(diff, product.unit)}</span>
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label="日付" htmlFor="adj-date" error={form.formState.errors.countedOn?.message}>
                <Input id="adj-date" type="date" max={today} {...form.register("countedOn")} />
              </Field>
              <Field label="理由" htmlFor="adj-reason" error={form.formState.errors.reason?.message} required>
                <Input id="adj-reason" placeholder="例：月末棚卸" {...form.register("reason")} />
              </Field>
            </div>
            <DialogFooter>
              <Button type="submit" variant="brand" disabled={form.formState.isSubmitting}>調整を登録</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
