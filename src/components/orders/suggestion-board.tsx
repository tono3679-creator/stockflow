"use client";
import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { QtyInput } from "@/components/common/qty-input";
import { StockBadge } from "@/components/common/status";
import { Button } from "@/components/ui/button";
import { createOrders } from "@/lib/actions/orders";
import { safeAction } from "@/lib/client/safe-action";
import { addDays } from "@/lib/domain/dates";
import { lineAmount } from "@/lib/domain/reorder";
import { formatQty, formatYen } from "@/lib/format";
import { cn } from "@/lib/utils";

export type Suggestion = {
  id: string; code: string; name: string; unit: string; onHand: number; onOrder: number; draftQty: number; suggested: number;
  unitCost: number; supplierId: string | null; supplierName: string | null; status: "out" | "low" | "ok";
};

/**
 * 発注提案：候補を表示 → 対象を選ぶ → 数量を確認 → 発注書を作成。
 * 初めから全部を選んだ状態にしておき、確認して「作成」を押すだけで済むようにする。仕入先ごとに発注書を分けて作る。
 */
export function SuggestionBoard({ rows, today, leadDays, only }: { rows: Suggestion[]; today: string; leadDays: number; only?: string }) {
  const router = useRouter();
  const [checked, setChecked] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(rows.map((r) => [r.id, !!r.supplierId && (only ? r.id === only : true)])));
  const [qty, setQty] = useState<Record<string, string>>(() => Object.fromEntries(rows.map((r) => [r.id, String(r.suggested)])));
  const [busy, setBusy] = useState(false);
  const key = useRef(crypto.randomUUID());

  const groups = useMemo(() => {
    const map = new Map<string, { id: string | null; name: string; rows: Suggestion[] }>();
    for (const r of rows) {
      const k = r.supplierId ?? "none";
      if (!map.has(k)) map.set(k, { id: r.supplierId, name: r.supplierName ?? "仕入先未設定", rows: [] });
      map.get(k)!.rows.push(r);
    }
    return [...map.values()];
  }, [rows]);

  const selected = rows.filter((r) => checked[r.id] && r.supplierId);
  const invalid = selected.filter((r) => !(Number(qty[r.id]) > 0));
  const total = selected.reduce((s, r) => s + (Number(qty[r.id]) > 0 ? lineAmount(Number(qty[r.id]), r.unitCost) : 0), 0);
  const supplierCount = new Set(selected.map((r) => r.supplierId)).size;

  const create = async () => {
    if (selected.length === 0 || invalid.length > 0) return;
    setBusy(true);
    const r = await safeAction(() => createOrders({
      lines: selected.map((s) => ({ productId: s.id, quantity: qty[s.id] })),
      status: "draft",
      orderOn: today,
      expectedOn: addDays(today, leadDays),
      notes: "",
      key: key.current,
    }));
    if (!r.ok) {
      setBusy(false);
      toast.error(r.error);
      return;
    }
    const ids = r.data!.ids;
    toast.success(`発注書を${ids.length}件作成しました`);
    key.current = crypto.randomUUID();
    router.push(ids.length === 1 ? `/orders/${ids[0]}` : "/orders?status=draft");
    router.refresh();
  };

  return (
    <div className="pb-24">
      <div className="grid gap-4">
        {groups.map((g) => {
          const all = g.rows.every((r) => checked[r.id]);
          return (
            <section key={g.id ?? "none"} className="rounded-lg border bg-card">
              <header className="flex items-center gap-3 border-b px-4 py-2.5">
                <input
                  type="checkbox"
                  aria-label={`${g.name} をすべて選ぶ`}
                  className="size-4 accent-[var(--brand)]"
                  disabled={!g.id}
                  checked={!!g.id && all}
                  onChange={(e) => setChecked((c) => ({ ...c, ...Object.fromEntries(g.rows.map((r) => [r.id, e.target.checked])) }))}
                />
                <h2 className="flex-1 truncate text-sm font-semibold">{g.name}</h2>
                {!g.id && <span className="text-xs text-muted-foreground">商品管理で仕入先を設定してください</span>}
              </header>
              <table className="w-full table-fixed text-sm">
                <thead className="sr-only sm:not-sr-only">
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="w-10 px-4 py-2"><span className="sr-only">選択</span></th>
                    <th className="px-2 py-2 font-medium">商品</th>
                    <th className="hidden w-24 px-2 py-2 text-right font-medium sm:table-cell">現在庫</th>
                    <th className="hidden w-24 px-2 py-2 text-right font-medium sm:table-cell">発注残</th>
                    <th className="w-32 px-2 py-2 text-right font-medium sm:w-36">発注数量</th>
                    <th className="hidden w-28 px-4 py-2 text-right font-medium md:table-cell">金額</th>
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map((r) => {
                    const n = Number(qty[r.id]);
                    return (
                      <tr key={r.id} className={cn("border-t", !checked[r.id] && "text-muted-foreground")}>
                        <td className="px-4 py-2.5 align-top sm:align-middle">
                          <input
                            type="checkbox"
                            aria-label={`${r.name} を発注する`}
                            className="mt-0.5 size-4 accent-[var(--brand)]"
                            disabled={!r.supplierId}
                            checked={!!checked[r.id]}
                            onChange={(e) => setChecked((c) => ({ ...c, [r.id]: e.target.checked }))}
                          />
                        </td>
                        <td className="px-2 py-2.5">
                          <Link href={`/inventory/${r.id}`} className="block truncate font-medium text-foreground hover:underline">{r.name}</Link>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                            <StockBadge status={r.status} />
                            <span className="sm:hidden">在庫 {formatQty(r.onHand, r.unit)}・発注残 {formatQty(r.onOrder)}</span>
                            {r.draftQty > 0 && <span className="text-warning-strong">下書きあり {formatQty(r.draftQty, r.unit)}</span>}
                          </div>
                        </td>
                        <td className="hidden px-2 py-2.5 text-right sm:table-cell">{formatQty(r.onHand, r.unit)}</td>
                        <td className="hidden px-2 py-2.5 text-right text-muted-foreground sm:table-cell">{formatQty(r.onOrder)}</td>
                        <td className="px-2 py-2">
                          <QtyInput
                            unit={r.unit}
                            value={qty[r.id]}
                            aria-label={`${r.name} の発注数量`}
                            aria-invalid={checked[r.id] && !(n > 0)}
                            onChange={(e) => {
                              setQty((q) => ({ ...q, [r.id]: e.target.value }));
                              if (r.supplierId) setChecked((c) => ({ ...c, [r.id]: true }));
                            }}
                          />
                          {Number(qty[r.id]) !== r.suggested && <div className="mt-0.5 text-right text-[11px] text-muted-foreground">推奨 {formatQty(r.suggested)}</div>}
                        </td>
                        <td className="hidden px-4 py-2.5 text-right md:table-cell">{n > 0 ? formatYen(lineAmount(n, r.unitCost)) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          );
        })}
      </div>

      <div className="fixed inset-x-0 bottom-14 z-20 border-t bg-card/95 backdrop-blur lg:bottom-0 lg:left-56">
        <div className="mx-auto flex max-w-[1200px] items-center gap-4 px-4 py-3 sm:px-6">
          <div className="min-w-0 flex-1 text-sm">
            <span className="tabular font-semibold">{selected.length}</span>品目
            <span className="mx-1.5 text-muted-foreground">/</span>
            <span className="tabular font-semibold">{supplierCount}</span>社
            <span className="ml-3 tabular font-semibold">{formatYen(total)}</span>
            <span className="ml-3 hidden text-xs text-muted-foreground sm:inline">納品予定 {leadDays}日後（変更可）</span>
          </div>
          <Button variant="brand" size="lg" disabled={busy || selected.length === 0 || invalid.length > 0} onClick={create}>
            {busy && <Loader2 className="animate-spin" aria-hidden />}
            発注書を作成
          </Button>
        </div>
      </div>
    </div>
  );
}
