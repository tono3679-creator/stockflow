import type { DemoPersona } from "@/lib/demo/sandbox";

/** デモで体験できる利用者（src/lib/demo/master-data.ts の STAFF と同じ人） */
export const DEMO_PERSONA_LIST: { persona: DemoPersona; name: string; short: string }[] = [
  { persona: "admin", name: "山田 太郎", short: "管理者" },
  { persona: "staff", name: "佐藤 健", short: "担当者" },
  { persona: "viewer", name: "鈴木 花子", short: "閲覧者" },
];
