"use client";
import { Trash2 } from "lucide-react";
import { QtyInput } from "@/components/common/qty-input";
import { ProductPicker, type PickerProduct } from "@/components/stock/product-picker";
import { Button } from "@/components/ui/button";
import { lineAmount } from "@/lib/domain/reorder";
import { formatYen } from "@/lib/format";

export type EditLine = { key: string; product: PickerProduct | null; quantity: string; unitPrice: string };
export type PriceProduct = PickerProduct & { unitCost: number };

/** 発注書の明細の編集（商品・数量・単価） */
export function LineEditor({ lines, onChange, products }: { lines: EditLine[]; onChange: (l: EditLine[]) => void; products: PriceProduct[] }) {
  const set = (i: number, patch: Partial<EditLine>) => onChange(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const used = new Set(lines.map((l) => l.product?.id));
  const total = lines.reduce((s, l) => s + (Number(l.quantity) > 0 ? lineAmount(Number(l.quantity), Number(l.unitPrice) || 0) : 0), 0);
  return (
    <div className="grid gap-3">
      {lines.map((l, i) => (
        <div key={l.key} className="grid grid-cols-[1fr_auto] gap-2 rounded-md border p-3 sm:grid-cols-[1fr_8rem_8rem_6rem_auto] sm:items-center sm:border-0 sm:p-0">
          <div className="col-span-2 sm:col-span-1">
            <ProductPicker
              id={`line-${l.key}`}
              products={products.filter((p) => !used.has(p.id) || p.id === l.product?.id)}
              value={l.product}
              onChange={(p) => set(i, { product: p, unitPrice: p ? String((p as PriceProduct).unitCost) : l.unitPrice })}
            />
          </div>
          <QtyInput aria-label="数量" placeholder="数量" unit={l.product?.unit} value={l.quantity} onChange={(e) => set(i, { quantity: e.target.value })} />
          <QtyInput aria-label="単価" placeholder="単価" unit="円" value={l.unitPrice} onChange={(e) => set(i, { unitPrice: e.target.value })} />
          <div className="tabular text-right text-sm max-sm:col-start-1 max-sm:text-left">
            {Number(l.quantity) > 0 ? formatYen(lineAmount(Number(l.quantity), Number(l.unitPrice) || 0)) : "—"}
          </div>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="行を削除" onClick={() => onChange(lines.filter((_, j) => j !== i))} disabled={lines.length === 1}>
            <Trash2 />
          </Button>
        </div>
      ))}
      <div className="flex items-center justify-between">
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...lines, { key: crypto.randomUUID(), product: null, quantity: "", unitPrice: "" }])}>
          行を追加
        </Button>
        <div className="text-sm">合計 <span className="tabular text-base font-semibold">{formatYen(total)}</span></div>
      </div>
    </div>
  );
}

export function toLineInput(lines: EditLine[]) {
  return lines.filter((l) => l.product).map((l) => ({ productId: l.product!.id, quantity: l.quantity, unitPrice: l.unitPrice === "" ? undefined : l.unitPrice }));
}
