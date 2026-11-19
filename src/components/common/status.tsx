import { Badge } from "@/components/ui/badge";
import { PO_STATUS_LABEL, STOCK_STATUS_LABEL, type PoStatus } from "@/lib/domain/labels";
import type { StockStatus } from "@/lib/domain/reorder";

const STOCK_VARIANT = { out: "danger", low: "warning", ok: "success" } as const;

/** 在庫の状態（色だけに頼らず文字でも書く） */
export function StockBadge({ status }: { status: StockStatus }) {
  return <Badge variant={STOCK_VARIANT[status]}>{STOCK_STATUS_LABEL[status]}</Badge>;
}

const PO_VARIANT = { draft: "neutral", ordered: "info", partial: "warning", received: "success", cancelled: "neutral" } as const;

export function PoBadge({ status, delayed }: { status: PoStatus; delayed?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1">
      <Badge variant={PO_VARIANT[status]} className={status === "cancelled" ? "line-through" : undefined}>{PO_STATUS_LABEL[status]}</Badge>
      {delayed && <Badge variant="danger">遅延</Badge>}
    </span>
  );
}
