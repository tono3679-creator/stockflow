import { DemoBanner } from "@/components/layout/demo-banner";
import { Header } from "@/components/layout/header";
import { BottomNav, Sidebar } from "@/components/layout/sidebar";
import { asCurrentUser, requireUser } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [row] = await asCurrentUser((tx) => tx<{ n: number }[]>`select count(*)::int n from product_stock where is_active and needs_order`);
  const badges = { orders: row.n };
  return (
    <div className="min-h-dvh">
      <Sidebar organizationName={user.organizationName} role={user.role} badges={badges} />
      <div className="flex min-h-dvh flex-col lg:pl-56">
        {user.isDemo && <DemoBanner role={user.role} />}
        <Header displayName={user.displayName} role={user.role} organizationName={user.organizationName} isDemo={user.isDemo} badges={badges} />
        <main className="mx-auto w-full max-w-[1200px] flex-1 px-4 pt-6 pb-24 sm:px-6 lg:pb-10">{children}</main>
      </div>
      <BottomNav badges={badges} />
    </div>
  );
}
