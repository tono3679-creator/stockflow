"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PackageCheck } from "lucide-react";
import { QtyInput } from "@/components/common/qty-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { receiveOrder } from "@/lib/actions/orders";
import { safeAction } from "@/lib/client/safe-action";
import { formatQty } from "@/lib/format";

type Item = { id: string; name: string; unit: string; quantity: number; received: number };

/**
 * 入荷登録。残りの数量を最初から入れておき、全数届いたときは「入荷を登録」を押すだけにする。
 * 冪等性キーは画面を開いたときに作り、成功するまで同じキーを使う（通信の再試行で二重に計上しない）。
 */
export function ReceivePanel({ poId, items, today, minDate }: { poId: string; items: Item[]; today: string; minDate: string }) {
  const router = useRouter();
  const open = items.filter((i) => i.quantity > i.received);
  const [qty, setQty] = useState<Record<string, string>>(() => Object.fromEntries(open.map((i) => [i.id, String(+(i.quantity - i.received).toFixed(3))])));
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const key = useRef(crypto.randomUUID());

  const submit = async () => {
    const errs: Record<string, string> = {};
    for (const i of open) {
      const n = Number(qty[i.id] || 0);
      if (n > i.quantity - i.received) errs[i.id] = `残り${formatQty(i.quantity - i.received, i.unit)}までです`;
    }
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    const r = await safeAction(() => receiveOrder({
      poId, receivedOn: date, note, key: key.current, lines: open.map((i) => ({ itemId: i.id, quantity: qty[i.id] || "0" })),
    }));
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    key.current = crypto.randomUUID();
    toast.success(r.data!.status === "received" ? "入荷完了。在庫に反映しました" : "一部入荷として在庫に反映しました");
    router.refresh();
  };

  return (
    <section className="rounded-lg border border-brand/30 bg-card">
      <header className="flex items-center gap-2 border-b px-4 py-3">
        <PackageCheck className="size-4 text-brand" aria-hidden />
        <h2 className="text-sm font-semibold">入荷登録</h2>
      </header>
      <ul className="divide-y">
        {open.map((i) => (
          <li key={i.id} className="grid grid-cols-[1fr_8rem] items-center gap-3 px-4 py-2.5 sm:grid-cols-[1fr_7rem_9rem]">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{i.name}</div>
              <div className="text-xs text-muted-foreground sm:hidden">未入荷 {formatQty(i.quantity - i.received, i.unit)}</div>
              {errors[i.id] && <div className="text-xs text-destructive">{errors[i.id]}</div>}
            </div>
            <div className="tabular hidden text-right text-sm text-muted-foreground sm:block">未入荷 {formatQty(i.quantity - i.received, i.unit)}</div>
            <QtyInput unit={i.unit} aria-label={`${i.name} の今回の入荷数`} value={qty[i.id]} onChange={(e) => setQty((q) => ({ ...q, [i.id]: e.target.value }))} aria-invalid={!!errors[i.id]} />
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-end">
        <div className="grid gap-1.5">
          <Label htmlFor="rcv-date">入荷日</Label>
          <Input id="rcv-date" type="date" value={date} min={minDate} max={today} onChange={(e) => setDate(e.target.value)} className="sm:w-40" />
        </div>
        <div className="grid flex-1 gap-1.5">
          <Label htmlFor="rcv-note">備考</Label>
          <Input id="rcv-note" value={note} placeholder="任意" onChange={(e) => setNote(e.target.value)} />
        </div>
        <Button variant="brand" size="lg" onClick={submit} disabled={busy}>入荷を登録</Button>
      </div>
    </section>
  );
}
