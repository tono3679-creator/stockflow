"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

/** 数量の入力（数字だけ・単位を右に表示・スマートフォンでは数字のキーボード） */
export function QtyInput({ unit, className, large, ...props }: React.ComponentProps<"input"> & { unit?: string; large?: boolean }) {
  return (
    <div className={cn("relative", className)}>
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        {...props}
        onChange={(e) => {
          // 数字・小数点以外は入れない（全角数字は半角にする）
          e.target.value = e.target.value.replace(/[０-９．]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/[^0-9.]/g, "");
          props.onChange?.(e);
        }}
        className={cn(
          "tabular w-full rounded-md border border-input bg-card pr-12 pl-3 text-right outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30 aria-invalid:border-destructive",
          large ? "h-14 text-2xl font-semibold" : "h-9 text-sm",
        )}
      />
      {unit && <span className={cn("pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted-foreground", large ? "text-base" : "text-xs")}>{unit}</span>}
    </div>
  );
}
