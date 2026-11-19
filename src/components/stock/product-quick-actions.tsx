"use client";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MoveDialog } from "./move-dialog";
import type { PickerProduct } from "./product-picker";

export function ProductQuickActions({ product, today }: { product: PickerProduct; today: string }) {
  return (
    <>
      <MoveDialog product={product} direction="in" today={today}>
        {(open) => <Button variant="brand" onClick={open}><Plus aria-hidden />入庫</Button>}
      </MoveDialog>
      <MoveDialog product={product} direction="out" today={today}>
        {(open) => <Button variant="outline" onClick={open} disabled={product.onHand <= 0}><Minus aria-hidden />出庫</Button>}
      </MoveDialog>
    </>
  );
}
