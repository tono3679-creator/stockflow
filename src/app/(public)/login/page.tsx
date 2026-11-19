import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/layout/logo";
import { DemoPersonaButtons } from "@/components/public/demo-buttons";
import { Separator } from "@/components/ui/separator";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const metadata = { title: "ログイン" };

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");
  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <Link href="/" aria-label="トップへ" className="mb-8 inline-block"><Logo /></Link>
        <h1 className="text-xl font-bold">デモを試す</h1>
        <p className="mt-1 mb-5 text-sm text-muted-foreground">登録不要・あなた専用の架空データ</p>
        <DemoPersonaButtons />
        <div className="my-8 flex items-center gap-3 text-xs text-muted-foreground">
          <Separator className="flex-1" />
          アカウントでログイン
          <Separator className="flex-1" />
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
