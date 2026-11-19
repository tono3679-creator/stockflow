import Link from "next/link";
import { ReverseButton } from "@/components/stock/reverse-button";
import { Badge } from "@/components/ui/badge";
import type { MovementRow } from "@/lib/data/inventory";
import { MOVEMENT_LABEL } from "@/lib/domain/labels";
import { formatDate, formatQty, formatSignedQty } from "@/lib/format";
import { cn } from "@/lib/utils";

const KIND_VARIANT = { opening: "neutral", in: "info", receipt: "info", out: "neutral", adjust: "warning", reversal: "warning" } as const;

/** 入出庫の履歴（showProduct＝商品名の列を出す。canReverse＝管理者の取消ボタン） */
export function MovementTable({ rows, showProduct, canReverse }: { rows: MovementRow[]; showProduct?: boolean; canReverse?: boolean }) {
  return (
    <>
      <table className="hidden w-full table-fixed text-sm md:table">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="w-28 px-4 py-2.5 font-medium">日付</th>
            <th className="w-24 px-4 py-2.5 font-medium">区分</th>
            {showProduct && <th className="px-4 py-2.5 font-medium">商品</th>}
            <th className="w-28 px-4 py-2.5 text-right font-medium">数量</th>
            <th className="w-24 px-4 py-2.5 text-right font-medium">記録後</th>
            <th className={cn("px-4 py-2.5 font-medium", showProduct && "w-56")}>備考</th>
            <th className="w-24 px-4 py-2.5 font-medium">登録者</th>
            {canReverse && <th className="w-16 px-2 py-2.5"><span className="sr-only">操作</span></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m.id} className={cn("border-b last:border-0", m.reversed && "text-muted-foreground")}>
              <td className="px-4 py-2.5 whitespace-nowrap">{formatDate(m.occurred_on)}</td>
              <td className="px-4 py-2.5"><Badge variant={KIND_VARIANT[m.kind]}>{MOVEMENT_LABEL[m.kind]}</Badge></td>
              {showProduct && (
                <td className="truncate px-4 py-2.5">
                  <Link href={`/inventory/${m.product_id}`} className="hover:underline">{m.product_name}</Link>
                </td>
              )}
              <td className={cn("px-4 py-2.5 text-right font-semibold whitespace-nowrap", m.reversed && "line-through")}>{formatSignedQty(m.quantity, m.unit)}</td>
              <td className="px-4 py-2.5 text-right whitespace-nowrap text-muted-foreground">{formatQty(m.balance_after)}</td>
              <td className="truncate px-4 py-2.5 text-muted-foreground">
                {m.po_id ? <Link href={`/orders/${m.po_id}`} className="hover:underline">{m.note}</Link> : m.note}
                {m.reversed && <span className="ml-1 text-xs">（取消済）</span>}
              </td>
              <td className="truncate px-4 py-2.5 text-muted-foreground">{m.created_by_name ?? "—"}</td>
              {canReverse && (
                <td className="px-2 py-1.5 text-right">
                  {!m.reversed && ["in", "out", "adjust", "opening"].includes(m.kind) && (
                    <ReverseButton movementId={m.id} label={`${formatDate(m.occurred_on)} ${m.product_name} ${MOVEMENT_LABEL[m.kind]} ${formatSignedQty(m.quantity, m.unit)}`} />
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="divide-y md:hidden">
        {rows.map((m) => (
          <li key={m.id} className={cn("flex items-center gap-3 px-4 py-3", m.reversed && "text-muted-foreground")}>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Badge variant={KIND_VARIANT[m.kind]}>{MOVEMENT_LABEL[m.kind]}</Badge>
                {formatDate(m.occurred_on)}
              </div>
              {showProduct && <div className="mt-1 truncate text-sm">{m.product_name}</div>}
              {m.note && <div className="truncate text-xs text-muted-foreground">{m.note}</div>}
            </div>
            <div className={cn("tabular shrink-0 text-right font-semibold", m.reversed && "line-through")}>{formatSignedQty(m.quantity, m.unit)}</div>
          </li>
        ))}
      </ul>
    </>
  );
}
