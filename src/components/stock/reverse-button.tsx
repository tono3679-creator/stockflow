"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { reverseMovement } from "@/lib/actions/stock";
import { safeAction } from "@/lib/client/safe-action";

/** 入出庫の取消（元の記録は残し、逆の数量を追記する） */
export function ReverseButton({ movementId, label }: { movementId: string; label: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  return (
    <>
      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground" onClick={() => setOpen(true)}>取消</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>記録を取り消す</DialogTitle>
            <DialogDescription>{label}。元の記録は残り、逆の数量が追加されます。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor={`rev-${movementId}`}>理由</Label>
            <Input id={`rev-${movementId}`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="例：数量の入力ミス" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>やめる</Button>
            <Button
              variant="destructive"
              disabled={busy || !reason.trim()}
              onClick={async () => {
                setBusy(true);
                const r = await safeAction(() => reverseMovement({ movementId, reason }));
                setBusy(false);
                if (!r.ok) return toast.error(r.error);
                toast.success("取り消しました");
                setOpen(false);
                router.refresh();
              }}
            >
              取り消す
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
