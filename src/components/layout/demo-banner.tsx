"use client";
import { useTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ListChecks } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { switchDemoPersona } from "@/lib/actions/session";
import type { OrgRole } from "@/lib/domain/labels";
import { cn } from "@/lib/utils";
import { DEMO_PERSONA_LIST } from "./demo-personas";

/** 3〜5分で試せる流れ（ダッシュボード → 発注提案 → 発注書 → PDF → 入荷 → 在庫） */
const TOUR = [
  { label: "在庫不足を見つける", href: "/dashboard" },
  { label: "発注提案を確認する", href: "/orders/suggest" },
  { label: "発注書を作成する", href: "/orders/suggest" },
  { label: "PDFを表示する", href: "/orders?status=draft" },
  { label: "入荷を登録する", href: "/orders?status=open" },
  { label: "在庫の更新を確認する", href: "/inventory" },
];

/** デモ環境であることを常に表示し、役割をワンタップで切り替えられるようにする */
export function DemoBanner({ role }: { role: OrgRole }) {
  const [pending, startTransition] = useTransition();
  const pathname = usePathname();
  return (
    <div className="flex items-center gap-3 border-b bg-brand-soft px-3 py-1.5 text-xs sm:px-6" role="note">
      <span className="font-semibold text-info-strong">デモ</span>
      <span className="hidden text-muted-foreground md:inline">架空のデータです。24時間後に自動で削除されます。</span>
      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center gap-1 rounded px-1.5 py-0.5 font-medium text-info-strong hover:bg-card">
          <ListChecks className="size-3.5" aria-hidden />
          体験の流れ
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-60">
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">3〜5分で試せます</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {TOUR.map((t, i) => (
            <DropdownMenuItem key={t.label} asChild>
              <Link href={t.href}>
                <span className="tabular w-4 text-muted-foreground">{i + 1}</span>
                {t.label}
              </Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <div className="ml-auto flex items-center gap-1" role="group" aria-label="体験する役割">
        {DEMO_PERSONA_LIST.map((p) => (
          <button
            key={p.persona}
            type="button"
            disabled={pending || p.persona === role}
            aria-pressed={p.persona === role}
            onClick={() => startTransition(() => switchDemoPersona(p.persona, `/${pathname.split("/")[1] || "dashboard"}`))}
            className={cn(
              "rounded-full px-2.5 py-0.5 font-medium transition-colors disabled:cursor-default",
              p.persona === role ? "bg-brand text-white" : "text-info-strong hover:bg-card disabled:opacity-50",
            )}
          >
            {p.short}
          </button>
        ))}
      </div>
    </div>
  );
}
