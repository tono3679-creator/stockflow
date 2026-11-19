import { cn } from "@/lib/utils";

export function EmptyState({ title, action, className }: { title: string; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 px-6 py-12 text-center text-sm text-muted-foreground", className)}>
      <p className="text-keep">{title}</p>
      {action}
    </div>
  );
}
