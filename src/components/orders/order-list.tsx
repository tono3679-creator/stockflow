import Link from "next/link";
import { PoBadge } from "@/components/common/status";
import type { OrderRow } from "@/lib/data/orders";
import { formatDate, formatYen } from "@/lib/format";
import { cn } from "@/lib/utils";

export function OrderList({ rows, hideSupplier }: { rows: OrderRow[]; hideSupplier?: boolean }) {
  return (
    <ul className="divide-y">
      {rows.map((o) => (
        <li key={o.id}>
          <Link href={`/orders/${o.id}`} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-4 py-3 text-sm hover:bg-muted/40 md:grid-cols-[9rem_1fr_7rem_7rem_8rem]">
            <span className="font-medium">{o.number}</span>
            <span className="min-w-0 truncate text-muted-foreground max-md:col-start-1 max-md:row-start-2">
              {!hideSupplier && <span className="text-foreground">{o.supplier_name}</span>}
              {!hideSupplier && " ・ "}
              {o.first_item}{o.item_count > 1 && ` ほか${o.item_count - 1}件`}
            </span>
            <span className="hidden text-right md:block">{formatYen(o.total_amount)}</span>
            <span className={cn("hidden text-right text-xs md:block", o.delayed ? "font-semibold text-danger-strong" : "text-muted-foreground")}>
              {o.status === "draft" ? formatDate(o.order_on) : o.expected_on ? `納期 ${formatDate(o.expected_on).slice(5)}` : "—"}
            </span>
            <span className="text-right max-md:row-span-2 max-md:row-start-1 max-md:col-start-2"><PoBadge status={o.status} delayed={o.delayed} /></span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
