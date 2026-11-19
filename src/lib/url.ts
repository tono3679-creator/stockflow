/** 検索条件を保ったまま URL を作る（空の値は外す） */
export function withParams(path: string, params: Record<string, string | number | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  const s = sp.toString();
  return s ? `${path}?${s}` : path;
}

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export function param(sp: Record<string, string | string[] | undefined>, key: string): string {
  const v = sp[key];
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

export function pageParam(sp: Record<string, string | string[] | undefined>): number {
  const n = Number(param(sp, "page"));
  return Number.isInteger(n) && n > 0 ? Math.min(n, 10_000) : 1;
}
