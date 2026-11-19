/** 日本向けの表示形式（すべて日本時間） */

const TZ = "Asia/Tokyo";

const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 });
const yenPrice = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 2 });
const num = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 3 });
const dateNumeric = new Intl.DateTimeFormat("ja-JP", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const dateShort = new Intl.DateTimeFormat("ja-JP", { timeZone: TZ, month: "numeric", day: "numeric" });
const dateTimeFull = new Intl.DateTimeFormat("ja-JP", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });

function toDate(value: Date | string): Date {
  if (value instanceof Date) return value;
  // 'YYYY-MM-DD' は日本時間の日付として扱う
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T00:00:00+09:00`);
  return new Date(value);
}

export function formatYen(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : yen.format(value);
}

/** 単価（銭まで） */
export function formatPrice(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : yenPrice.format(value);
}

/** グラフの軸などに使う短い金額（例：1,234万円） */
export function formatYenCompact(value: number): string {
  if (Math.abs(value) >= 100_000_000) return `${(value / 100_000_000).toFixed(1)}億円`;
  if (Math.abs(value) >= 10_000) return `${num.format(Math.round(value / 10_000))}万円`;
  return `${num.format(value)}円`;
}

/** 数量（小数は必要なときだけ） */
export function formatQty(value: number | null | undefined, unit = ""): string {
  return value === null || value === undefined ? "—" : `${num.format(value)}${unit}`;
}

/** 増減の数量（+12 / −3） */
export function formatSignedQty(value: number, unit = ""): string {
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${num.format(Math.abs(value))}${unit}`;
}

export function formatNumber(value: number | null | undefined, unit = ""): string {
  return formatQty(value, unit);
}

/** 2026/10/27 */
export function formatDate(value: Date | string | null | undefined): string {
  return value ? dateNumeric.format(toDate(value)) : "—";
}
/** 10/27 */
export function formatDateShort(value: Date | string | null | undefined): string {
  return value ? dateShort.format(toDate(value)) : "—";
}
/** 2026/10/27 09:30 */
export function formatDateTimeFull(value: Date | string | null | undefined): string {
  return value ? dateTimeFull.format(toDate(value)) : "—";
}

/** 前月比など（+12.5%） */
export function formatSignedPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

/** 'YYYY-MM' → 11月 / 2026年11月 */
export function formatMonth(key: string, withYear = false): string {
  const [y, m] = key.split("-").map(Number);
  return withYear ? `${y}年${m}月` : `${m}月`;
}
