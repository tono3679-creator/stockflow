"use client";
import { useId, useMemo, useState } from "react";
import { X } from "lucide-react";
import { formatQty } from "@/lib/format";
import { cn } from "@/lib/utils";

export type PickerProduct = { id: string; code: string; name: string; unit: string; onHand: number };

const normalize = (s: string) => s.normalize("NFKC").toLowerCase().replace(/\s/g, "");

/** 商品名・商品コードで絞り込んで選ぶ */
export function ProductPicker({
  id, products, value, onChange, large,
}: { id: string; products: PickerProduct[]; value: PickerProduct | null; onChange: (p: PickerProduct | null) => void; large?: boolean }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const matches = useMemo(() => {
    const n = normalize(q);
    return (n ? products.filter((p) => normalize(`${p.name}${p.code}`).includes(n)) : products).slice(0, 8);
  }, [q, products]);

  if (value) {
    return (
      <div className={cn("flex items-center justify-between gap-2 rounded-md border bg-card px-3", large ? "h-12" : "h-9")}>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{value.name}</div>
        </div>
        <button type="button" onClick={() => onChange(null)} className="rounded p-1 text-muted-foreground hover:bg-muted" aria-label="商品を選び直す">
          <X className="size-4" />
        </button>
      </div>
    );
  }
  const choose = (p: PickerProduct) => {
    onChange(p);
    setQ("");
    setOpen(false);
  };
  return (
    <div className="relative">
      <input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        value={q}
        placeholder="商品名・コードで検索"
        autoComplete="off"
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, matches.length - 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          if (e.key === "Enter" && open && matches[active]) { e.preventDefault(); choose(matches[active]); }
        }}
        className={cn(
          "w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30",
          large ? "h-12 text-base" : "h-9",
        )}
      />
      {open && (
        <ul id={listId} role="listbox" className="absolute inset-x-0 top-full z-20 mt-1 max-h-80 overflow-y-auto rounded-md border bg-popover p-1 shadow-md">
          {matches.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">見つかりません</li>}
          {matches.map((p, i) => (
            <li
              key={p.id}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(p);
              }}
              className={cn("flex cursor-pointer items-center justify-between gap-3 rounded px-3 py-2 text-sm", i === active && "bg-muted")}
            >
              <span className="min-w-0">
                <span className="block truncate">{p.name}</span>
                <span className="block text-xs text-muted-foreground">{p.code}</span>
              </span>
              <span className="tabular shrink-0 text-xs text-muted-foreground">{formatQty(p.onHand, p.unit)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
