"use client";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Field } from "@/components/common/form-field";
import { Panel } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createSupplier, updateSupplier } from "@/lib/actions/products";
import { safeAction } from "@/lib/client/safe-action";
import { supplierSchema, type SupplierInput } from "@/lib/validation";

export function SupplierForm({ id, initial }: { id?: string; initial: SupplierInput }) {
  const router = useRouter();
  const form = useForm<SupplierInput>({ resolver: zodResolver(supplierSchema), defaultValues: initial });
  const { register, formState: { errors, isSubmitting }, setError } = form;
  const submit = form.handleSubmit(async (values) => {
    const r = await safeAction(() => (id ? updateSupplier(id, values) : createSupplier(values)));
    if (!r.ok) {
      for (const [k, m] of Object.entries(r.fieldErrors ?? {})) setError(k as keyof SupplierInput, { message: m });
      toast.error(r.error);
      return;
    }
    toast.success(id ? "保存しました" : "仕入先を登録しました");
    const target = id ?? (r.data as { id: string } | undefined)?.id;
    router.push(`/suppliers/${target}`);
    router.refresh();
  });
  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <Panel className="grid gap-4 p-4 sm:grid-cols-2 sm:p-6">
        <Field label="仕入先名" htmlFor="name" error={errors.name?.message} required className="sm:col-span-2">
          <Input id="name" {...register("name")} aria-invalid={!!errors.name} />
        </Field>
        <Field label="担当者" htmlFor="contactName" error={errors.contactName?.message}>
          <Input id="contactName" {...register("contactName")} />
        </Field>
        <Field label="電話番号" htmlFor="phone" error={errors.phone?.message}>
          <Input id="phone" type="tel" inputMode="tel" {...register("phone")} aria-invalid={!!errors.phone} />
        </Field>
        <Field label="メールアドレス" htmlFor="email" error={errors.email?.message} className="sm:col-span-2">
          <Input id="email" type="email" {...register("email")} aria-invalid={!!errors.email} />
        </Field>
        <Field label="住所" htmlFor="address" error={errors.address?.message} className="sm:col-span-2">
          <Input id="address" {...register("address")} />
        </Field>
        <Field label="備考" htmlFor="notes" error={errors.notes?.message} className="sm:col-span-2">
          <Textarea id="notes" rows={2} {...register("notes")} />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-[var(--brand)]" {...register("isActive")} />
          取引中
        </label>
      </Panel>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>キャンセル</Button>
        <Button type="submit" variant="brand" disabled={isSubmitting}>{id ? "保存" : "登録"}</Button>
      </div>
    </form>
  );
}
