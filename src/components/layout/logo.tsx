import { cn } from "@/lib/utils";

/** ロゴ：積み上がった在庫を表す3本の線＋名前（装飾は最小限） */
export function Logo({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <svg viewBox="0 0 24 24" className="size-6 shrink-0" aria-hidden>
        <rect x="3" y="14" width="18" height="6" rx="1.5" fill="var(--brand)" />
        <rect x="6" y="8" width="12" height="5" rx="1.5" fill="var(--brand)" opacity="0.6" />
        <rect x="9" y="3" width="6" height="4" rx="1.5" fill="var(--brand)" opacity="0.3" />
      </svg>
      <span className="text-[15px] font-bold tracking-tight text-foreground">StockFlow</span>
    </div>
  );
}
