"use client";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Field } from "@/components/common/form-field";
import { QtyInput } from "@/components/common/qty-input";
import { ProductPicker, type PickerProduct } from "@/components/stock/product-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { recordMovement } from "@/lib/actions/stock";
import { safeAction } from "@/lib/client/safe-action";
import { formatQty } from "@/lib/format";
import { cn } from "@/lib/utils";
import { movementSchema, type MovementInput } from "@/lib/validation";

type Direction = "in" | "out";

/**
 * 入庫・出庫の登録。商品が決まっていれば（一覧・詳細からのクイック操作）商品の選択を省く。
 * 登録のたびに新しい冪等性キーを使い、二度押しや通信の再試行で二重に登録されないようにする。
 */
export function MovementForm({
  products, product: fixed, direction: initialDirection, today, onDone, large = false,
}: {
  products?: PickerProduct[];
  product?: PickerProduct;
  direction: Direction;
  today: string;
  onDone?: () => void;
  large?: boolean;
}) {
  const [direction, setDirection] = useState<Direction>(initialDirection);
  const [selected, setSelected] = useState<PickerProduct | null>(fixed ?? null);
  const [onHand, setOnHand] = useState<Record<string, number>>({});
  const [key, setKey] = useState(() => crypto.randomUUID());
  const form = useForm<MovementInput>({
    resolver: zodResolver(movementSchema),
    defaultValues: { productId: fixed?.id ?? "", direction: initialDirection, quantity: "" as never, occurredOn: today, note: "", key },
  });
  const { register, handleSubmit, formState, setValue, setError, reset } = form;
  const current = selected ? (onHand[selected.id] ?? selected.onHand) : null;

  const submit = handleSubmit(async (values) => {
    // 出庫は在庫を超えられない（画面でも先に知らせる。最終的な判断はサーバー）
    const qty = Number(values.quantity);
    if (direction === "out" && current !== null && qty > current) {
      setError("quantity", { message: `在庫が不足しています（残り${formatQty(current, selected?.unit)}）` });
      return;
    }
    const result = await safeAction(() => recordMovement({ ...values, direction, key }));
    if (!result.ok) {
      if (result.fieldErrors?.quantity) setError("quantity", { message: result.fieldErrors.quantity });
      else if (result.error.startsWith("在庫が不足")) setError("quantity", { message: result.error });
      else toast.error(result.error);
      return;
    }
    toast.success(result.data!.message);
    if (selected) setOnHand((m) => ({ ...m, [selected.id]: result.data!.onHand }));
    const next = crypto.randomUUID();
    setKey(next);
    reset({ productId: fixed?.id ?? values.productId, direction, quantity: "" as never, occurredOn: values.occurredOn, note: "", key: next });
    onDone?.();
  });

  const unit = selected?.unit ?? "";
  const tabs = useMemo(() => ([["in", "入庫"], ["out", "出庫"]] as const), []);

  return (
    <form onSubmit={submit} className="grid gap-5" noValidate>
      <div role="radiogroup" aria-label="区分" className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
        {tabs.map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={direction === value}
            onClick={() => {
              setDirection(value);
              setValue("direction", value);
            }}
            className={cn(
              "rounded-md font-semibold transition-colors",
              large ? "h-12 text-base" : "h-9 text-sm",
              direction === value ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {!fixed && products && (
        <Field label="商品" htmlFor="mv-product" error={formState.errors.productId?.message}>
          <ProductPicker
            id="mv-product"
            products={products}
            value={selected}
            onChange={(p) => {
              setSelected(p);
              setValue("productId", p?.id ?? "", { shouldValidate: formState.isSubmitted });
            }}
            large={large}
          />
        </Field>
      )}
      {selected && (
        <div className="-mt-2 flex items-baseline justify-between text-sm">
          <span className="text-muted-foreground">現在庫</span>
          <span className="tabular font-semibold">{formatQty(current, unit)}</span>
        </div>
      )}

      <Field label="数量" htmlFor="mv-qty" error={formState.errors.quantity?.message}>
        <QtyInput id="mv-qty" unit={unit} large={large} placeholder="0" aria-invalid={!!formState.errors.quantity} {...register("quantity")} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="日付" htmlFor="mv-date" error={formState.errors.occurredOn?.message}>
          <Input id="mv-date" type="date" max={today} className={large ? "h-11" : undefined} {...register("occurredOn")} />
        </Field>
        <Field label="備考" htmlFor="mv-note" error={formState.errors.note?.message}>
          <Input id="mv-note" placeholder="任意" className={large ? "h-11" : undefined} {...register("note")} />
        </Field>
      </div>

      <Button type="submit" variant="brand" size={large ? "xl" : "lg"} disabled={formState.isSubmitting} className="w-full">
        {formState.isSubmitting ? "登録中…" : direction === "in" ? "入庫を登録" : "出庫を登録"}
      </Button>
    </form>
  );
}
