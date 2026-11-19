"use client";
import { useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPrice, formatQty, formatYen } from "@/lib/format";
import { cn } from "@/lib/utils";
import { DraftEditor } from "./draft-editor";
import type { PriceProduct } from "./line-editor";

type Item = { id: string; productId: string; code: string; name: string; quantity: number; unit: string; unitPrice: number; amount: number; received: number; onHand: number };

/** 明細の表示（下書きなら編集に切り替えられる） */
export function OrderItems({ id, items, total, editable, products, expectedOn, notes, min, showReceived }: {
  id: string; items: Item[]; total: number; editable: boolean; products: PriceProduct[]; expectedOn: string | null; notes: string; min: string; showReceived: boolean;
}) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <DraftEditor
        id={id}
        products={products}
        expectedOn={expectedOn}
        notes={notes}
        min={min}
        onClose={() => setEditing(false)}
        initial={items.map((i) => ({
          key: i.id,
          product: { id: i.productId, code: i.code, name: i.name, unit: i.unit, onHand: i.onHand },
          quantity: String(i.quantity),
          unitPrice: String(i.unitPrice),
        }))}
      />
    );
  }
  return (
    <section className="rounded-lg border bg-card">
      <header className="flex items-center justify-between border-b px-4 py-2.5">
        <h2 className="text-sm font-semibold">明細</h2>
        {editable && <Button variant="ghost" size="sm" onClick={() => setEditing(true)}><Pencil aria-hidden />編集</Button>}
      </header>
      <table className="w-full table-fixed text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="px-4 py-2 font-medium">商品</th>
            <th className="w-24 px-2 py-2 text-right font-medium">数量</th>
            {showReceived && <th className="hidden w-24 px-2 py-2 text-right font-medium sm:table-cell">入荷済</th>}
            <th className="hidden w-28 px-2 py-2 text-right font-medium md:table-cell">単価</th>
            <th className="w-28 px-4 py-2 text-right font-medium">金額</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.id} className="border-b last:border-0">
              <td className="px-4 py-2.5">
                <div className="truncate font-medium">{i.name}</div>
                <div className="text-xs text-muted-foreground">{i.code}{showReceived && <span className="sm:hidden">・入荷 {formatQty(i.received)}</span>}</div>
              </td>
              <td className="px-2 py-2.5 text-right whitespace-nowrap">{formatQty(i.quantity)}<span className="ml-0.5 text-xs text-muted-foreground">{i.unit}</span></td>
              {showReceived && (
                <td className={cn("hidden px-2 py-2.5 text-right sm:table-cell", i.received >= i.quantity ? "text-success-strong" : i.received > 0 && "text-warning-strong")}>
                  {formatQty(i.received)}
                </td>
              )}
              <td className="hidden px-2 py-2.5 text-right text-muted-foreground md:table-cell">{formatPrice(i.unitPrice)}</td>
              <td className="px-4 py-2.5 text-right">{formatYen(i.amount)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t">
            <td className="px-4 py-3 text-right text-sm text-muted-foreground" colSpan={showReceived ? 4 : 3}>合計</td>
            <td className="px-4 py-3 text-right text-base font-semibold">{formatYen(total)}</td>
          </tr>
        </tfoot>
      </table>
    </section>
  );
}
