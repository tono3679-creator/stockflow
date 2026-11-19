/**
 * 入力の検証（画面とサーバーで同じものを使う）。DB の関数・制約でももう一度確かめる。
 */
import { z } from "zod";
import { isDateString } from "@/lib/domain/dates";

/** 全角の数字・カンマを受け付けて数値にする（"１，２００" → 1200） */
export function toNumberInput(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const s = value.replace(/[０-９．]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/[,，\s]/g, "");
  if (s === "") return undefined;
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
}

const decimals = (max: number) => (n: number) => Math.abs(Math.round(n * 10 ** max) - n * 10 ** max) < 1e-6;

export const quantity = (label = "数量") =>
  z.preprocess(
    toNumberInput,
    z.number({ error: `${label}を数字で入力してください` })
      .refine(Number.isFinite, `${label}を数字で入力してください`)
      .refine((n) => n > 0, `${label}は0より大きい数を入力してください`)
      .refine((n) => n <= 9_999_999, `${label}が大きすぎます`)
      .refine(decimals(3), "小数は第3位まで入力できます"),
  );

export const nonNegative = (label: string, max = 9_999_999, digits = 3) =>
  z.preprocess(
    (v) => (v === "" || v === undefined || v === null ? 0 : toNumberInput(v)),
    z.number({ error: `${label}を数字で入力してください` })
      .refine(Number.isFinite, `${label}を数字で入力してください`)
      .refine((n) => n >= 0, `${label}は0以上で入力してください`)
      .refine((n) => n <= max, `${label}が大きすぎます`)
      .refine(decimals(digits), `小数は第${digits}位まで入力できます`),
  );

export const dateString = (label = "日付") =>
  z.string({ error: `${label}を入力してください` }).refine((s) => isDateString(s), `${label}を正しく入力してください`);

const text = (max: number) => z.string().trim().max(max, `${max}文字以内で入力してください`);
const idempotencyKey = z.string().min(8).max(100);

export const movementSchema = z.object({
  productId: z.uuid("商品を選んでください"),
  direction: z.enum(["in", "out"]),
  quantity: quantity(),
  occurredOn: dateString(),
  note: text(200).optional().default(""),
  key: idempotencyKey,
});
export type MovementInput = z.input<typeof movementSchema>;

export const adjustSchema = z.object({
  productId: z.uuid(),
  counted: nonNegative("実在庫"),
  countedOn: dateString(),
  reason: text(200).min(1, "理由を入力してください"),
  key: idempotencyKey,
});

export const reverseSchema = z.object({ movementId: z.uuid(), reason: text(200).min(1, "理由を入力してください") });

export const productSchema = z
  .object({
    code: text(40).min(1, "商品コードを入力してください"),
    name: text(100).min(1, "商品名を入力してください"),
    categoryId: z.union([z.uuid(), z.literal("")]).default(""),
    unit: text(10).min(1, "単位を入力してください"),
    supplierId: z.union([z.uuid(), z.literal("")]).default(""),
    unitCost: nonNegative("仕入単価", 99_999_999, 2),
    reorderPoint: nonNegative("発注点"),
    targetStock: nonNegative("目標在庫"),
    orderLot: quantity("発注単位"),
    minOrderQty: nonNegative("最低発注数量"),
    location: text(50).default(""),
    isActive: z.boolean().default(true),
    notes: text(1000).default(""),
    openingStock: nonNegative("初期在庫").optional(),
  })
  .refine((v) => v.targetStock >= v.reorderPoint, { path: ["targetStock"], message: "目標在庫は発注点以上にしてください" });
export type ProductInput = z.input<typeof productSchema>;

export const supplierSchema = z.object({
  name: text(100).min(1, "仕入先名を入力してください"),
  contactName: text(50).default(""),
  phone: text(30).refine((s) => s === "" || /^[0-9０-９+\-()（） ]+$/.test(s), "電話番号は数字とハイフンで入力してください").default(""),
  email: text(200).refine((s) => s === "" || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s), "メールアドレスの形式が正しくありません").default(""),
  address: text(200).default(""),
  notes: text(1000).default(""),
  isActive: z.boolean().default(true),
});
export type SupplierInput = z.input<typeof supplierSchema>;

export const poLineSchema = z.object({
  productId: z.uuid(),
  quantity: quantity(),
  unitPrice: nonNegative("単価", 99_999_999, 2).optional(),
  supplierId: z.uuid().optional(),
});

export const createOrdersSchema = z.object({
  lines: z.array(poLineSchema).min(1, "発注する商品を選んでください").max(200),
  status: z.enum(["draft", "ordered"]),
  orderOn: dateString("発注日"),
  expectedOn: z.union([dateString("納品予定日"), z.literal("")]).default(""),
  notes: text(500).default(""),
  key: idempotencyKey,
});

export const updateOrderSchema = z.object({
  id: z.uuid(),
  expectedOn: z.union([dateString("納品予定日"), z.literal("")]).default(""),
  notes: text(500).default(""),
  lines: z.array(poLineSchema).min(1, "明細を1行以上入力してください").max(200).optional(),
});

export const receiveSchema = z.object({
  poId: z.uuid(),
  receivedOn: dateString("入荷日"),
  note: text(200).default(""),
  key: idempotencyKey,
  lines: z.array(z.object({ itemId: z.uuid(), quantity: nonNegative("入荷数") })).min(1),
});

export const settingsSchema = z.object({
  companyName: text(100),
  postalCode: text(10),
  address: text(200),
  phone: text(30),
  email: text(200).refine((s) => s === "" || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s), "メールアドレスの形式が正しくありません"),
  contactName: text(50),
  poNote: text(500),
  staleDays: z.preprocess(toNumberInput, z.number().int("整数で入力してください").min(7, "7日以上にしてください").max(730, "730日以内にしてください")),
  defaultLeadDays: z.preprocess(toNumberInput, z.number().int("整数で入力してください").min(0).max(180, "180日以内にしてください")),
});

export const categorySchema = z.object({ id: z.uuid().optional(), name: text(50).min(1, "カテゴリ名を入力してください") });

export const memberSchema = z.object({
  email: z.email("メールアドレスの形式が正しくありません").max(200),
  displayName: text(50).min(1, "氏名を入力してください"),
  role: z.enum(["admin", "staff", "viewer"]),
  password: z.string().min(12, "パスワードは12文字以上にしてください").max(100),
});
