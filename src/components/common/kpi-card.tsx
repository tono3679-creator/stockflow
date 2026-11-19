import Link from "next/link";
import { cn } from "@/lib/utils";

/** KPI：ラベル・数値・（必要なときだけ）補足。アイコンや説明文は置かない */
export function KpiCard({ label, value, unit, sub, tone, href }: {
  label: string; value: string; unit?: string; sub?: React.ReactNode; tone?: "danger" | "warning"; href?: string;
}) {
  const body = (
    <div className={cn("flex h-full flex-col rounded-lg border bg-card px-4 py-3.5 transition-colors sm:px-5 sm:py-4", href && "hover:border-foreground/20")}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn("tabular mt-1 text-2xl font-bold tracking-tight sm:text-[28px]", tone === "danger" && "text-danger-strong", tone === "warning" && "text-warning-strong")}>
        {value}
        {unit && <span className="ml-0.5 text-sm font-medium text-muted-foreground">{unit}</span>}
      </span>
      {sub && <span className="mt-0.5 text-xs text-muted-foreground">{sub}</span>}
    </div>
  );
  return href ? <Link href={href} className="block rounded-lg focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none">{body}</Link> : body;
}
