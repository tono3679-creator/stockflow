"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Field } from "@/components/common/form-field";
import { Panel } from "@/components/common/page-header";
import { SelectField } from "@/components/common/select-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addMember, updateMember } from "@/lib/actions/settings";
import { safeAction } from "@/lib/client/safe-action";
import { ROLE_LABEL, ROLES, type OrgRole } from "@/lib/domain/labels";

type Member = { id: string; name: string; since: string; role: OrgRole; isActive: boolean };

const ROLE_HELP: Record<OrgRole, string> = {
  admin: "すべての操作（マスタ・設定・調整・取消・CSV取込）",
  staff: "入出庫・発注・入荷",
  viewer: "閲覧とCSV出力のみ",
};

/** メンバーと役割 */
export function MemberEditor({ members, currentUserId, isDemo }: { members: Member[]; currentUserId: string; isDemo: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const change = (m: Member, role: OrgRole, isActive: boolean) => start(async () => {
    const r = await safeAction(() => updateMember(m.id, role, isActive));
    if (!r.ok) return void toast.error(r.error);
    toast.success(`${m.name}さんを更新しました`);
    router.refresh();
  });

  return (
    <div className="grid gap-4">
      <Panel>
        <ul className="divide-y">
          {members.map((m) => (
            <li key={m.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{m.name}{m.id === currentUserId && <span className="ml-1 text-xs font-normal text-muted-foreground">（あなた）</span>}</div>
                <div className="text-xs text-muted-foreground tabular">{m.since} から</div>
              </div>
              <SelectField className="w-full sm:w-36" value={m.role} disabled={pending || isDemo} onChange={(v) => change(m, v as OrgRole, m.isActive)} ariaLabel={`${m.name}さんの役割`}
                options={ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }))} />
              <label className="flex items-center gap-2 text-sm sm:w-24">
                <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={m.isActive} disabled={pending || isDemo || m.id === currentUserId} onChange={(e) => change(m, m.role, e.target.checked)} />
                {m.isActive ? "利用中" : "停止中"}
              </label>
            </li>
          ))}
        </ul>
        <dl className="grid gap-1 border-t px-4 py-3 text-xs text-muted-foreground">
          {ROLES.map((r) => <div key={r} className="flex gap-2"><dt className="w-14 shrink-0 font-medium text-foreground">{ROLE_LABEL[r]}</dt><dd>{ROLE_HELP[r]}</dd></div>)}
          {isDemo && <p className="mt-1">デモでは役割の変更・メンバー追加はできません。画面上部で役割を切り替えてお試しください。</p>}
        </dl>
      </Panel>
      {!isDemo && <AddMember />}
    </div>
  );
}

function AddMember() {
  const router = useRouter();
  const blank = { email: "", displayName: "", role: "staff" as OrgRole, password: "" };
  const [v, setV] = useState(blank);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  return (
    <Panel className="p-4 sm:p-5">
      <form className="grid gap-4" noValidate onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const r = await safeAction(() => addMember(v));
        setBusy(false);
        if (!r.ok) { setErrors(r.fieldErrors ?? {}); return void toast.error(r.error); }
        setErrors({}); setV(blank);
        toast.success("メンバーを追加しました。メールアドレスと初期パスワードを本人に伝えてください");
        router.refresh();
      }}>
        <h3 className="text-sm font-semibold">メンバーを追加</h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="氏名" htmlFor="m-name" required error={errors.displayName}><Input id="m-name" value={v.displayName} onChange={(e) => setV({ ...v, displayName: e.target.value })} /></Field>
          <Field label="メールアドレス" htmlFor="m-email" required error={errors.email}><Input id="m-email" type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} /></Field>
          <Field label="役割" htmlFor="m-role" required><SelectField id="m-role" value={v.role} onChange={(x) => setV({ ...v, role: x as OrgRole })} options={ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }))} /></Field>
          <Field label="初期パスワード" htmlFor="m-pw" required error={errors.password} hint="12文字以上"><Input id="m-pw" type="password" autoComplete="new-password" value={v.password} onChange={(e) => setV({ ...v, password: e.target.value })} /></Field>
        </div>
        <div className="flex justify-end"><Button type="submit" variant="brand" disabled={busy}><UserPlus aria-hidden />{busy ? "追加中…" : "追加"}</Button></div>
      </form>
    </Panel>
  );
}
