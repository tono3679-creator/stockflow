"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { startDemo } from "@/lib/actions/session";
import { safeAction } from "@/lib/client/safe-action";
import type { DemoPersona } from "@/lib/demo/sandbox";
import { cn } from "@/lib/utils";

const PERSONAS: { persona: DemoPersona; title: string; text: string }[] = [
  { persona: "admin", title: "管理者", text: "すべての操作・設定" },
  { persona: "staff", title: "担当者", text: "入出庫・発注・入荷" },
  { persona: "viewer", title: "閲覧者", text: "閲覧のみ" },
];

/** 「デモを試す」：訪問者専用のデモ環境を作ってログインする */
export function DemoButton({ size = "lg", className, label = "デモを試す" }: { size?: "lg" | "xl"; className?: string; label?: string }) {
  const [pending, setPending] = useState(false);
  const [, startTransition] = useTransition();
  return (
    <Button
      size={size}
      variant="brand"
      className={className}
      disabled={pending}
      onClick={() => {
        setPending(true);
        startTransition(async () => {
          const r = await safeAction(() => startDemo("admin"));
          if (r && !r.ok) {
            toast.error(r.error);
            setPending(false);
          }
        });
      }}
    >
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
      {pending ? "準備しています…" : label}
      {!pending && <ArrowRight aria-hidden />}
    </Button>
  );
}

/** 役割を選んでデモを始める（ログイン画面） */
export function DemoPersonaButtons() {
  const [pending, setPending] = useState<DemoPersona | null>(null);
  const [, startTransition] = useTransition();
  return (
    <div className="grid gap-2">
      {PERSONAS.map((p, i) => (
        <button
          key={p.persona}
          type="button"
          disabled={pending !== null}
          onClick={() => {
            setPending(p.persona);
            startTransition(async () => {
              const r = await safeAction(() => startDemo(p.persona));
              if (r && !r.ok) {
                toast.error(r.error);
                setPending(null);
              }
            });
          }}
          className={cn(
            "flex items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3 text-left transition-colors hover:border-brand/50 focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none disabled:opacity-60",
            i === 0 && "border-brand/40",
          )}
        >
          <span>
            <span className="block font-semibold">{p.title}で試す</span>
            <span className="block text-xs text-muted-foreground">{p.text}</span>
          </span>
          {pending === p.persona ? <Loader2 className="size-4 animate-spin text-brand" aria-label="準備中" /> : <ArrowRight className="size-4 text-muted-foreground" aria-hidden />}
        </button>
      ))}
    </div>
  );
}
