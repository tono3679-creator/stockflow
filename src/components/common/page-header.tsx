import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

/** 画面の見出しと主要な操作（説明文は置かない） */
export function PageHeader({
  title, sub, actions, back, className,
}: { title: React.ReactNode; sub?: React.ReactNode; actions?: React.ReactNode; back?: { href: string; label: string }; className?: string }) {
  return (
    <div className={cn("mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        {back && (
          <Link href={back.href} className="mb-1 inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground">
            <ChevronLeft className="size-3.5" aria-hidden />
            {back.label}
          </Link>
        )}
        <h1 className="text-keep text-xl font-bold tracking-tight sm:text-2xl">{title}</h1>
        {sub && <div className="mt-1 text-sm text-muted-foreground">{sub}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** 画面の中の区切り（見出し＋右側のリンク） */
export function SectionTitle({ children, action, className }: { children: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mb-3 flex items-center justify-between gap-2", className)}>
      <h2 className="text-sm font-semibold">{children}</h2>
      {action}
    </div>
  );
}

/** 白い面（カード）。影は付けず、境界線だけ */
export function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <section className={cn("rounded-lg border bg-card", className)}>{children}</section>;
}
