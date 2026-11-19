import {
  ArrowLeftRight, Boxes, ChartColumn, FileUp, LayoutDashboard, Package, Settings, ShoppingCart, Truck, type LucideIcon,
} from "lucide-react";
import type { OrgRole } from "@/lib/domain/labels";

export type NavItem = { href: string; label: string; short?: string; icon: LucideIcon; roles?: OrgRole[] };

/** メインの5項目（スマートフォンでは下のタブ） */
export const MAIN_NAV: NavItem[] = [
  { href: "/dashboard", label: "ダッシュボード", short: "ホーム", icon: LayoutDashboard },
  { href: "/inventory", label: "在庫", icon: Boxes },
  { href: "/movements", label: "入出庫", icon: ArrowLeftRight },
  { href: "/orders", label: "発注", icon: ShoppingCart },
  { href: "/reports", label: "レポート", icon: ChartColumn },
];

/** 管理（下にまとめる） */
export const SUB_NAV: NavItem[] = [
  { href: "/products", label: "商品管理", icon: Package },
  { href: "/suppliers", label: "仕入先管理", icon: Truck },
  { href: "/import", label: "CSVインポート", icon: FileUp, roles: ["admin"] },
  { href: "/settings", label: "設定", icon: Settings, roles: ["admin"] },
];

export function visible(items: NavItem[], role: OrgRole) {
  return items.filter((i) => !i.roles || i.roles.includes(role));
}

export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
