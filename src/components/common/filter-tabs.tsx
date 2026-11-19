import Link from "next/link";
import { cn } from "@/lib/utils";

/** 一覧の絞り込み（リンクのタブ。件数を添える） */
export function FilterTabs({ items, current }: { items: { value: string; label: string; href: string; count?: number; tone?: "danger" | "warning" }[]; current: string }) {
  return (
    <nav aria-label="絞り込み" className="flex gap-1 overflow-x-auto">
      {items.map((t) => {
        const active = t.value === current;
        return (
          <Link
            key={t.value}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-8 shrink-0 items-center gap-1.5 rounded-md px-3 text-sm transition-colors",
              active ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {t.label}
            {t.count !== undefined && (
              <span className={cn("tabular text-xs", !active && t.tone === "danger" && t.count > 0 && "text-danger-strong", !active && t.tone === "warning" && t.count > 0 && "text-warning-strong")}>
                {t.count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
