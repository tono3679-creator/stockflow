"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MovementForm } from "./movement-form";
import type { PickerProduct } from "./product-picker";

/** 一覧・詳細から、その商品の入庫・出庫をすぐに登録する */
export function MoveDialog({
  product, direction, today, children,
}: { product: PickerProduct; direction: "in" | "out"; today: string; children: (open: () => void) => React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return (
    <>
      {children(() => setOpen(true))}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle className="text-keep">{product.name}</DialogTitle>
          </DialogHeader>
          {open && (
            <MovementForm
              product={product}
              direction={direction}
              today={today}
              onDone={() => {
                setOpen(false);
                router.refresh();
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
