/** 画面に出す名前（DB の値 → 日本語） */

export type OrgRole = "admin" | "staff" | "viewer";
export type MovementKind = "opening" | "in" | "out" | "receipt" | "adjust" | "reversal";
export type PoStatus = "draft" | "ordered" | "partial" | "received" | "cancelled";

export const ROLE_LABEL: Record<OrgRole, string> = { admin: "管理者", staff: "担当者", viewer: "閲覧者" };
export const ROLES: OrgRole[] = ["admin", "staff", "viewer"];

export const MOVEMENT_LABEL: Record<MovementKind, string> = {
  opening: "初期在庫",
  in: "入庫",
  out: "出庫",
  receipt: "入荷",
  adjust: "棚卸調整",
  reversal: "取消",
};

export const PO_STATUS_LABEL: Record<PoStatus, string> = {
  draft: "下書き",
  ordered: "発注済",
  partial: "一部入荷",
  received: "入荷完了",
  cancelled: "キャンセル",
};
export const PO_STATUSES: PoStatus[] = ["draft", "ordered", "partial", "received", "cancelled"];

export const STOCK_STATUS_LABEL = { out: "欠品", low: "在庫不足", ok: "正常" } as const;

/** 役割ごとにできること（画面の出し分け。最終的な判断は DB の関数と RLS） */
export const can = {
  editMaster: (r: OrgRole) => r === "admin",
  moveStock: (r: OrgRole) => r === "admin" || r === "staff",
  order: (r: OrgRole) => r === "admin" || r === "staff",
  adjust: (r: OrgRole) => r === "admin",
  reverse: (r: OrgRole) => r === "admin",
  import: (r: OrgRole) => r === "admin",
  settings: (r: OrgRole) => r === "admin",
};
