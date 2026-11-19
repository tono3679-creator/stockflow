"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deleteCategory, saveCategory } from "@/lib/actions/settings";
import { safeAction } from "@/lib/client/safe-action";

type Category = { id: string; name: string; productCount: number };

/** カテゴリの追加・名前の変更・削除（削除した カテゴリの商品は「未分類」になる） */
export function CategoryEditor({ categories }: { categories: Category[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, done: string, after?: () => void) => start(async () => {
    const r = await safeAction(fn as () => Promise<{ ok: true } | { ok: false; error: string }>);
    if (!r.ok) return void toast.error(r.error);
    toast.success(done);
    after?.();
    router.refresh();
  });

  return (
    <Panel>
      <ul className="divide-y">
        {categories.map((c) => (
          <li key={c.id} className="flex items-center gap-3 px-4 py-2">
            <Input
              defaultValue={c.name}
              aria-label={`${c.name}の名前`}
              className="h-8 max-w-64"
              disabled={pending}
              onBlur={(e) => {
                const next = e.target.value.trim();
                if (next && next !== c.name) act(() => saveCategory({ id: c.id, name: next }), "カテゴリ名を変更しました");
                else e.target.value = c.name;
              }}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            />
            <span className="flex-1 text-xs text-muted-foreground tabular">{c.productCount}品目</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`${c.name}を削除`}
              disabled={pending}
              onClick={() => {
                if (c.productCount > 0 && !window.confirm(`「${c.name}」を削除します。${c.productCount}品目は未分類になります。`)) return;
                act(() => deleteCategory(c.id), "カテゴリを削除しました");
              }}
            >
              <Trash2 aria-hidden />
            </Button>
          </li>
        ))}
      </ul>
      <form
        className="flex gap-2 border-t px-4 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) act(() => saveCategory({ name }), "カテゴリを追加しました", () => setName(""));
        }}
      >
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="新しいカテゴリ" aria-label="新しいカテゴリ名" className="h-9 max-w-64" />
        <Button type="submit" variant="outline" disabled={pending || !name.trim()}><Plus aria-hidden />追加</Button>
      </form>
    </Panel>
  );
}
