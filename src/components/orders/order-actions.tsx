"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, CalendarClock, FileDown, FileText, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cancelOrder, placeOrder, updateOrder } from "@/lib/actions/orders";
import { safeAction } from "@/lib/client/safe-action";
import type { PoStatus } from "@/lib/domain/labels";

export function PdfButtons({ id }: { id: string }) {
  return (
    <>
      <Button variant="outline" asChild>
        <a href={`/api/orders/${id}/pdf`} target="_blank" rel="noopener"><FileText aria-hidden />PDF</a>
      </Button>
      <Button variant="ghost" size="icon" asChild>
        <a href={`/api/orders/${id}/pdf?download=1`} aria-label="PDF をダウンロード"><FileDown /></a>
      </Button>
    </>
  );
}

/** 下書き → 発注済 */
export function PlaceButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="brand"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const r = await safeAction(() => placeOrder(id));
        setBusy(false);
        if (!r.ok) return toast.error(r.error);
        toast.success("発注済にしました");
        router.refresh();
      }}
    >
      <Send aria-hidden />
      発注済にする
    </Button>
  );
}

export function CancelButton({ id, status }: { id: string; status: PoStatus }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Button variant="ghost" className="text-muted-foreground" onClick={() => setOpen(true)}><Ban aria-hidden />キャンセル</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>発注をキャンセル</DialogTitle>
            <DialogDescription>{status === "draft" ? "下書きを取り消します。" : "仕入先への連絡も忘れずに行ってください。"}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="cancel-reason">理由（任意）</Label>
            <Input id="cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>やめる</Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const r = await safeAction(() => cancelOrder({ id, reason }));
                setBusy(false);
                if (!r.ok) return toast.error(r.error);
                toast.success("キャンセルしました");
                setOpen(false);
                router.refresh();
              }}
            >
              キャンセルする
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** 納品予定日・備考の変更（発注済・一部入荷） */
export function ExpectedDialog({ id, expectedOn, notes, min }: { id: string; expectedOn: string | null; notes: string; min: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(expectedOn ?? "");
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Button variant="ghost" onClick={() => setOpen(true)}><CalendarClock aria-hidden />納期変更</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>納品予定日</DialogTitle></DialogHeader>
          <Input type="date" min={min} value={date} onChange={(e) => setDate(e.target.value)} aria-label="納品予定日" />
          <DialogFooter>
            <Button
              variant="brand"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const r = await safeAction(() => updateOrder({ id, expectedOn: date, notes }));
                setBusy(false);
                if (!r.ok) return toast.error(r.error);
                toast.success("納品予定日を変更しました");
                setOpen(false);
                router.refresh();
              }}
            >
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
