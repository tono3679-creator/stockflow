"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { OrgRole } from "@/lib/domain/labels";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";
import { isActive, MAIN_NAV, SUB_NAV, visible, type NavItem } from "./nav";

export type NavBadges = { orders: number };

function Item({ item, pathname, badge, onNavigate }: { item: NavItem; pathname: string; badge?: number; onNavigate?: () => void }) {
  const active = isActive(pathname, item.href);
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-9 items-center gap-3 rounded-md px-3 text-sm transition-colors",
        active ? "bg-sidebar-accent font-semibold text-foreground" : "text-sidebar-foreground hover:bg-sidebar-accent/70 hover:text-foreground",
      )}
    >
      <item.icon className={cn("size-4 shrink-0", active ? "text-brand" : "text-sidebar-muted")} aria-hidden />
      <span className="flex-1">{item.label}</span>
      {!!badge && (
        <span className="tabular rounded-full bg-warning-soft px-1.5 text-[11px] leading-5 font-semibold text-warning-strong" aria-label={`発注待ち ${badge} 件`}>
          {badge}
        </span>
      )}
    </Link>
  );
}

export function SidebarBody({
  organizationName, role, badges, onNavigate,
}: { organizationName: string; role: OrgRole; badges: NavBadges; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <div className="flex h-full flex-col border-r bg-sidebar">
      <div className="flex h-14 items-center px-5">
        <Link href="/dashboard" onClick={onNavigate} aria-label="ダッシュボードへ">
          <Logo />
        </Link>
      </div>
      <nav aria-label="メインメニュー" className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 pt-2 pb-4">
        <div className="flex flex-col gap-0.5">
          {MAIN_NAV.map((item) => (
            <Item key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} badge={item.href === "/orders" ? badges.orders : undefined} />
          ))}
        </div>
        <div className="flex flex-col gap-0.5">
          <div className="px-3 pb-1 text-[11px] font-medium text-sidebar-muted">管理</div>
          {visible(SUB_NAV, role).map((item) => (
            <Item key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} />
          ))}
        </div>
      </nav>
      <div className="border-t px-5 py-3 text-xs text-muted-foreground">
        <div className="text-keep truncate font-medium text-foreground">{organizationName}</div>
      </div>
    </div>
  );
}

export function Sidebar(props: { organizationName: string; role: OrgRole; badges: NavBadges }) {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 lg:block">
      <SidebarBody {...props} />
    </aside>
  );
}

/** スマートフォンの下のタブ（メインの5項目） */
export function BottomNav({ badges }: { badges: NavBadges }) {
  const pathname = usePathname();
  return (
    <nav aria-label="メインメニュー" className="fixed inset-x-0 bottom-0 z-30 border-t bg-card pb-[env(safe-area-inset-bottom)] lg:hidden">
      <div className="grid grid-cols-5">
        {MAIN_NAV.map((item) => {
          const active = isActive(pathname, item.href);
          const badge = item.href === "/orders" ? badges.orders : 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn("relative flex h-14 flex-col items-center justify-center gap-0.5 text-[11px]", active ? "font-semibold text-brand" : "text-muted-foreground")}
            >
              <item.icon className="size-5" aria-hidden />
              {item.short ?? item.label}
              {badge > 0 && (
                <span className="tabular absolute top-1.5 left-1/2 ml-2 min-w-4 rounded-full bg-warning px-1 text-center text-[10px] leading-4 font-bold text-white" aria-label={`発注待ち ${badge} 件`}>
                  {badge}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
