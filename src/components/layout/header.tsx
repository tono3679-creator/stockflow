"use client";
import { useState } from "react";
import Link from "next/link";
import { Menu, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { can, type OrgRole } from "@/lib/domain/labels";
import { Logo } from "./logo";
import { SidebarBody, type NavBadges } from "./sidebar";
import { UserMenu } from "./user-menu";

export function Header({
  displayName, role, organizationName, isDemo, badges,
}: { displayName: string; role: OrgRole; organizationName: string; isDemo: boolean; badges: NavBadges }) {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-card px-3 sm:px-6">
      <Sheet open={open} onOpenChange={setOpen}>
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(true)} aria-label="メニューを開く">
          <Menu />
        </Button>
        <SheetContent side="left" aria-describedby={undefined} className="w-64 p-0">
          <SheetTitle className="sr-only">メニュー</SheetTitle>
          <SidebarBody organizationName={organizationName} role={role} badges={badges} onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
      <Link href="/dashboard" className="lg:hidden" aria-label="ダッシュボードへ">
        <Logo />
      </Link>
      <div className="ml-auto flex items-center gap-2">
        {can.moveStock(role) && (
          <Button asChild variant="brand" size="sm">
            <Link href="/movements/new">
              <Plus aria-hidden />
              入出庫
            </Link>
          </Button>
        )}
        <UserMenu displayName={displayName} role={role} isDemo={isDemo} />
      </div>
    </header>
  );
}
