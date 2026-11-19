"use client";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MoveDialog } from "./move-dialog";
import type { PickerProduct } from "./product-picker";

/** 一覧の行の「入庫」「出庫」 */
export function RowActions({ product, today, compact }: { product: PickerProduct; today: string; compact?: boolean }) {
  return (
    <div className="flex justify-end gap-1">
      <MoveDialog product={product} direction="in" today={today}>
        {(open) => (
          <Button type="button" variant="outline" size={compact ? "icon-sm" : "sm"} onClick={open} aria-label={`${product.name} を入庫`}>
            <Plus aria-hidden />
            {!compact && "入庫"}
          </Button>
        )}
      </MoveDialog>
      <MoveDialog product={product} direction="out" today={today}>
        {(open) => (
          <Button type="button" variant="outline" size={compact ? "icon-sm" : "sm"} onClick={open} aria-label={`${product.name} を出庫`} disabled={product.onHand <= 0}>
            <Minus aria-hidden />
            {!compact && "出庫"}
          </Button>
        )}
      </MoveDialog>
    </div>
  );
}
