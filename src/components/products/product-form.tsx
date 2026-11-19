"use client";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Field } from "@/components/common/form-field";
import { QtyInput } from "@/components/common/qty-input";
import { SelectField } from "@/components/common/select-field";
import { Panel } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createProduct, updateProduct } from "@/lib/actions/products";
import { safeAction } from "@/lib/client/safe-action";
import { productSchema, type ProductInput } from "@/lib/validation";

type Option = { id: string; name: string };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Panel className="p-4 sm:p-6">
      <h2 className="mb-4 text-sm font-semibold">{title}</h2>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </Panel>
  );
}

export function ProductForm({
  id, initial, categories, suppliers, isNew,
}: { id?: string; initial: ProductInput; categories: Option[]; suppliers: Option[]; isNew: boolean }) {
  const router = useRouter();
  const form = useForm<ProductInput>({ resolver: zodResolver(productSchema), defaultValues: initial });
  const { register, control, formState: { errors, isSubmitting }, setError, watch } = form;
  const unit = watch("unit") || "";

  const submit = form.handleSubmit(async (values) => {
    const r = await safeAction(() => (isNew ? createProduct(values) : updateProduct(id!, values)));
    if (!r.ok) {
      for (const [k, m] of Object.entries(r.fieldErrors ?? {})) setError(k as keyof ProductInput, { message: m });
      toast.error(r.error);
      return;
    }
    toast.success(isNew ? "商品を登録しました" : "保存しました");
    const newId = isNew && r.data && "id" in r.data ? (r.data as { id: string }).id : id;
    router.push(`/inventory/${newId}`);
    router.refresh();
  });

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <Section title="基本情報">
        <Field label="商品名" htmlFor="name" error={errors.name?.message} required className="sm:col-span-2">
          <Input id="name" {...register("name")} aria-invalid={!!errors.name} />
        </Field>
        <Field label="商品コード" htmlFor="code" error={errors.code?.message} required>
          <Input id="code" {...register("code")} aria-invalid={!!errors.code} />
        </Field>
        <Field label="単位" htmlFor="unit" error={errors.unit?.message} required>
          <Input id="unit" placeholder="個・本・箱・m" {...register("unit")} aria-invalid={!!errors.unit} />
        </Field>
        <Field label="カテゴリ" htmlFor="categoryId">
          <Controller control={control} name="categoryId" render={({ field }) => (
            <SelectField id="categoryId" value={field.value ?? ""} onChange={field.onChange} noneLabel="なし" options={categories.map((c) => ({ value: c.id, label: c.name }))} />
          )} />
        </Field>
        <Field label="仕入先" htmlFor="supplierId">
          <Controller control={control} name="supplierId" render={({ field }) => (
            <SelectField id="supplierId" value={field.value ?? ""} onChange={field.onChange} noneLabel="未設定" options={suppliers.map((c) => ({ value: c.id, label: c.name }))} />
          )} />
        </Field>
        <Field label="保管場所" htmlFor="location" error={errors.location?.message}>
          <Input id="location" placeholder="例：A-01" {...register("location")} />
        </Field>
        <Field label="仕入単価（円）" htmlFor="unitCost" error={errors.unitCost?.message}>
          <QtyInput id="unitCost" unit="円" {...register("unitCost")} />
        </Field>
      </Section>

      <Section title="発注の基準">
        <Field label="発注点" htmlFor="reorderPoint" error={errors.reorderPoint?.message} hint="この数以下で「在庫不足」">
          <QtyInput id="reorderPoint" unit={unit} {...register("reorderPoint")} />
        </Field>
        <Field label="目標在庫" htmlFor="targetStock" error={errors.targetStock?.message} hint="発注後にこの数まで補充">
          <QtyInput id="targetStock" unit={unit} {...register("targetStock")} />
        </Field>
        <Field label="発注単位" htmlFor="orderLot" error={errors.orderLot?.message} hint="この数の倍数で発注">
          <QtyInput id="orderLot" unit={unit} {...register("orderLot")} />
        </Field>
        <Field label="最低発注数量" htmlFor="minOrderQty" error={errors.minOrderQty?.message}>
          <QtyInput id="minOrderQty" unit={unit} {...register("minOrderQty")} />
        </Field>
        {isNew && (
          <Field label="初期在庫" htmlFor="openingStock" error={errors.openingStock?.message} hint="今ある数量（任意）">
            <QtyInput id="openingStock" unit={unit} {...register("openingStock")} />
          </Field>
        )}
      </Section>

      <Section title="その他">
        <Field label="備考" htmlFor="notes" error={errors.notes?.message} className="sm:col-span-2">
          <Textarea id="notes" rows={2} {...register("notes")} />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-[var(--brand)]" {...register("isActive")} />
          有効（在庫・発注の対象にする）
        </label>
      </Section>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>キャンセル</Button>
        <Button type="submit" variant="brand" disabled={isSubmitting}>{isNew ? "登録" : "保存"}</Button>
      </div>
    </form>
  );
}
