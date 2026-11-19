"use client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signInWithPassword } from "@/lib/actions/session";
import { safeAction } from "@/lib/client/safe-action";

const schema = z.object({
  email: z.email("メールアドレスの形式が正しくありません"),
  password: z.string().min(1, "パスワードを入力してください"),
});

export function LoginForm() {
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { email: "", password: "" } });
  const onSubmit = form.handleSubmit(async (values) => {
    const result = await safeAction(() => signInWithPassword(values));
    if (result && !result.ok) toast.error(result.error);
  });
  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <div className="grid gap-1.5">
        <Label htmlFor="email">メールアドレス</Label>
        <Input id="email" type="email" autoComplete="email" aria-invalid={!!form.formState.errors.email} {...form.register("email")} />
        {form.formState.errors.email && <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>}
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="password">パスワード</Label>
        <Input id="password" type="password" autoComplete="current-password" aria-invalid={!!form.formState.errors.password} {...form.register("password")} />
        {form.formState.errors.password && <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>}
      </div>
      <Button type="submit" disabled={form.formState.isSubmitting} className="w-full" variant="outline">
        {form.formState.isSubmitting && <Loader2 className="animate-spin" aria-hidden />}
        ログイン
      </Button>
    </form>
  );
}
