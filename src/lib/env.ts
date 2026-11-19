import "server-only";

/** サーバー専用の環境変数。足りなければ使うときに分かるようにする。 */
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`環境変数 ${name} が設定されていません（.env.example を参照）`);
  return value;
}

function positiveInt(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

export const serverEnv = {
  get databaseUrl() {
    return required("DATABASE_URL");
  },
  get cronSecret() {
    return process.env.CRON_SECRET ?? "";
  },
  /** 同時に存在できるデモ組織の上限 */
  get demoMaxActive() {
    return positiveInt("DEMO_MAX_ACTIVE", 40);
  },
  /** 同じ接続元から1時間に作れるデモ環境の数（大量作成の対策） */
  get demoCreateLimitPerHour() {
    return positiveInt("DEMO_CREATE_LIMIT_PER_HOUR", 30);
  },
};

/**
 * Supabase Storage（任意）。両方あれば、発注書の PDF を非公開のバケット purchase-orders に保存する。
 * サービスロールキーはサーバーだけで使う（NEXT_PUBLIC_ を付けない・ブラウザに送らない）。
 */
export const storageEnv = {
  get url() {
    return (process.env.SUPABASE_URL ?? "").replace(/\/$/, "");
  },
  get serviceRoleKey() {
    return process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  },
  get enabled() {
    return !!this.url && !!this.serviceRoleKey;
  },
};
