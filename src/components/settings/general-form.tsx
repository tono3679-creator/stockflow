"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Field } from "@/components/common/form-field";
import { Panel } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { saveSettings } from "@/lib/actions/settings";
import { safeAction } from "@/lib/client/safe-action";

export type SettingsValues = {
  companyName: string; postalCode: string; address: string; phone: string; email: string; contactName: string; poNote: string;
  staleDays: string | number; defaultLeadDays: string | number;
};

/** 会社情報（発注書に印字する）と在庫のルール */
export function GeneralForm({ initial, readOnly }: { initial: SettingsValues; readOnly?: boolean }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const bind = (k: keyof SettingsValues) => ({
    id: `s-${k}`, value: String(v[k]), disabled: readOnly, "aria-invalid": !!errors[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value }),
  });

  return (
    <form
      noValidate
      className="grid gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const r = await safeAction(() => saveSettings(v));
        setBusy(false);
        if (!r.ok) {
          setErrors(r.fieldErrors ?? {});
          return void toast.error(r.error);
        }
        setErrors({});
        toast.success("設定を保存しました");
        router.refresh();
      }}
    >
      <Panel className="grid gap-4 p-4 sm:p-5">
        <h2 className="text-sm font-semibold">会社情報<span className="ml-2 text-xs font-normal text-muted-foreground">発注書に印字します</span></h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="会社名" htmlFor="s-companyName" error={errors.companyName}><Input {...bind("companyName")} /></Field>
          <Field label="担当者" htmlFor="s-contactName" error={errors.contactName}><Input {...bind("contactName")} /></Field>
          <Field label="郵便番号" htmlFor="s-postalCode" error={errors.postalCode}><Input {...bind("postalCode")} inputMode="numeric" /></Field>
          <Field label="住所" htmlFor="s-address" error={errors.address}><Input {...bind("address")} /></Field>
          <Field label="電話番号" htmlFor="s-phone" error={errors.phone}><Input {...bind("phone")} inputMode="tel" /></Field>
          <Field label="メールアドレス" htmlFor="s-email" error={errors.email}><Input {...bind("email")} type="email" /></Field>
        </div>
        <Field label="発注書の備考（定型文）" htmlFor="s-poNote" error={errors.poNote}><Textarea {...bind("poNote")} rows={3} /></Field>
      </Panel>

      <Panel className="grid gap-4 p-4 sm:p-5">
        <h2 className="text-sm font-semibold">在庫のルール</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="長期滞留とみなす日数" htmlFor="s-staleDays" error={errors.staleDays} hint="最後の出庫からこの日数を過ぎた在庫をレポートに出します（7〜730日）">
            <div className="flex items-center gap-2"><Input {...bind("staleDays")} inputMode="numeric" className="w-28 tabular" /><span className="text-sm text-muted-foreground">日</span></div>
          </Field>
          <Field label="納品までの日数（既定）" htmlFor="s-defaultLeadDays" error={errors.defaultLeadDays} hint="仕入先にリードタイムが無いとき、納品予定日の初期値に使います">
            <div className="flex items-center gap-2"><Input {...bind("defaultLeadDays")} inputMode="numeric" className="w-28 tabular" /><span className="text-sm text-muted-foreground">日</span></div>
          </Field>
        </div>
      </Panel>

      {!readOnly && <div className="flex justify-end"><Button type="submit" variant="brand" disabled={busy}>{busy ? "保存中…" : "保存"}</Button></div>}
    </form>
  );
}
