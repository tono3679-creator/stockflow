import "server-only";
import { toLocalDate } from "@/lib/domain/dates";
import type { CurrentUser } from "@/lib/auth";

/** 組織のタイムゾーンでの今日（'YYYY-MM-DD'） */
export function todayFor(user: CurrentUser): string {
  return toLocalDate(new Date(), user.settings.timezone);
}
