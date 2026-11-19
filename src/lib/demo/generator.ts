/**
 * デモデータの生成（純粋関数。乱数は seed で再現できる。ID だけは毎回ランダム）。
 *
 * 「今日」から過去6か月を1日ずつ進めて、出庫 → 在庫が発注点を下回る → 月・木に仕入先ごとに発注 → リードタイム後に入荷、
 * という流れを再現する。在庫の残高・入出庫の balance_after・発注残は、すべてこの流れから計算した値なので互いに矛盾しない
 * （tests/db/demo.test.ts で、DB の残高が履歴の合計と一致することを確かめている）。
 * 最後に master-data.ts の SCENARIOS で、欠品・在庫不足・一部入荷・入荷遅延などの「今」の状況を作る。
 */
import { addDays, toLocalDate } from "@/lib/domain/dates";
import { suggestQuantity } from "@/lib/domain/reorder";
import { CATEGORIES, DEMO_COMPANY, PRODUCTS, SCENARIOS, STAFF, SUPPLIERS, type Frequency, type StaffKey } from "./master-data";
import { Random } from "./random";

export const DEFAULT_DEMO_SEED = 20261119;
const HISTORY_DAYS = 182;

export type DemoMode = { kind: "demo"; expiresAt: Date } | { kind: "showcase"; passwordHash: string };

type MovementKind = "opening" | "in" | "out" | "receipt" | "adjust" | "reversal";

export type DemoDataset = ReturnType<typeof generateDemoData>;

const uuid = () => crypto.randomUUID();

function dow(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function generateDemoData(opts: { seed: number; now: Date; organizationId: string; mode: DemoMode }) {
  const rng = new Random(opts.seed);
  const org = opts.organizationId;
  const today = toLocalDate(opts.now);
  const start = addDays(today, -HISTORY_DAYS);

  // ---------------- 組織・利用者 ----------------
  const staff = Object.fromEntries(STAFF.map((s) => [s.key, uuid()])) as Record<StaffKey, string>;
  const users = STAFF.map((s) => ({
    id: staff[s.key],
    email: opts.mode.kind === "showcase" ? s.email : null,
    encrypted_password: opts.mode.kind === "showcase" ? opts.mode.passwordHash : null,
    is_anonymous: opts.mode.kind === "demo",
  }));
  const organization = {
    id: org,
    name: DEMO_COMPANY.name,
    is_demo: opts.mode.kind === "demo",
    demo_expires_at: opts.mode.kind === "demo" ? opts.mode.expiresAt : null,
    is_showcase: opts.mode.kind === "showcase",
  };
  const settings = {
    organization_id: org,
    company_name: DEMO_COMPANY.name,
    postal_code: DEMO_COMPANY.postalCode,
    address: DEMO_COMPANY.address,
    phone: DEMO_COMPANY.phone,
    email: DEMO_COMPANY.email,
    contact_name: DEMO_COMPANY.contactName,
    po_note: DEMO_COMPANY.poNote,
  };
  const profiles = STAFF.map((s) => ({ id: staff[s.key], display_name: s.name }));
  const createdAt = new Date(`${start}T09:00:00+09:00`);
  const members = STAFF.map((s, i) => ({
    organization_id: org, user_id: staff[s.key], role: s.key, is_active: true, created_at: new Date(createdAt.getTime() + i * 1000),
  }));

  // ---------------- マスタ ----------------
  const categories = CATEGORIES.map((name, i) => ({ id: uuid(), organization_id: org, name, sort_order: i }));
  const suppliers = SUPPLIERS.map((s) => ({
    id: uuid(), organization_id: org, name: s.name, contact_name: s.contact, phone: s.phone, email: s.email, address: s.address, notes: "",
  }));
  type P = {
    id: string; code: string; name: string; unit: string; cost: number; rp: number; target: number; lot: number; min: number;
    freq: Frequency; supplier: number; location: string; categoryId: string;
    stock: number; open: boolean; lastOut: string | null; scenario?: (typeof SCENARIOS)[number];
  };
  const items: P[] = [];
  CATEGORIES.forEach((cat, ci) => {
    for (const [code, name, unit, cost, rp, target, lot, min, freq, supplier, location] of PRODUCTS[cat]) {
      items.push({
        id: uuid(), code, name, unit, cost, rp, target, lot, min, freq, supplier, location, categoryId: categories[ci].id,
        stock: 0, open: false, lastOut: null, scenario: SCENARIOS.find((s) => s.code === code),
      });
    }
  });
  const products = items.map((p) => ({
    id: p.id, organization_id: org, code: p.code, name: p.name, category_id: p.categoryId, unit: p.unit,
    supplier_id: suppliers[p.supplier].id, unit_cost: p.cost, reorder_point: p.rp, target_stock: p.target,
    order_lot: p.lot, min_order_qty: p.min, location: p.location, notes: "",
    created_at: createdAt, updated_at: createdAt,
  }));

  // ---------------- 入出庫・発注のシミュレーション ----------------
  const movements: {
    id: string; organization_id: string; product_id: string; kind: MovementKind; quantity: number; balance_after: number;
    occurred_on: string; note: string; reverses_id: string | null; receipt_item_id: string | null; created_by: string; created_at: Date;
  }[] = [];
  const seqByDay = new Map<string, number>();
  const stamp = (date: string) => {
    const n = (seqByDay.get(date) ?? 0) + 1;
    seqByDay.set(date, n);
    const minutes = Math.min(8 * 60 + n * 4, 19 * 60);
    return new Date(`${date}T${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}:00+09:00`);
  };
  const move = (p: P, kind: MovementKind, qty: number, date: string, note: string, by: string, extra: { reverses?: string; receiptItem?: string } = {}) => {
    p.stock += qty;
    if (kind === "out") p.lastOut = date;
    const row = {
      id: uuid(), organization_id: org, product_id: p.id, kind, quantity: qty, balance_after: p.stock, occurred_on: date, note,
      reverses_id: extra.reverses ?? null, receipt_item_id: extra.receiptItem ?? null, created_by: by, created_at: stamp(date),
    };
    movements.push(row);
    return row;
  };

  type PoItem = { id: string; organization_id: string; purchase_order_id: string; product_id: string; line_no: number; quantity: number; unit: string; unit_price: number; received_qty: number };
  type Po = {
    id: string; organization_id: string; number: string; supplier_id: string; status: string; order_on: string; expected_on: string;
    notes: string; ordered_at: Date | null; created_by: string; created_at: Date; updated_at: Date; total_amount: number;
  };
  const pos: Po[] = [];
  const poItems: PoItem[] = [];
  const receipts: { id: string; organization_id: string; purchase_order_id: string; received_on: string; note: string; idempotency_key: string; created_by: string; created_at: Date }[] = [];
  const receiptItems: { id: string; organization_id: string; receipt_id: string; purchase_order_item_id: string; quantity: number }[] = [];
  const counters = new Map<string, number>();
  const scheduled = new Map<string, { po: Po; lines: { item: PoItem; qty: number }[] }[]>();
  const schedule = (date: string, po: Po, lines: { item: PoItem; qty: number }[]) => {
    scheduled.set(date, [...(scheduled.get(date) ?? []), { po, lines }]);
  };
  const productOf = new Map(items.map((p) => [p.id, p]));

  const createPo = (supplier: number, date: string, lines: { p: P; qty: number }[], status: "draft" | "ordered", expected: string, by: string) => {
    const month = date.slice(0, 7).replace("-", "");
    const n = (counters.get(month) ?? 0) + 1;
    counters.set(month, n);
    const at = stamp(date);
    const po: Po = {
      id: uuid(), organization_id: org, number: `PO-${month}-${String(n).padStart(4, "0")}`, supplier_id: suppliers[supplier].id, status,
      order_on: date, expected_on: expected, notes: "", ordered_at: status === "ordered" ? at : null, created_by: by, created_at: at, updated_at: at,
      total_amount: 0,
    };
    pos.push(po);
    const its = lines.map(({ p, qty }, i) => {
      const item: PoItem = {
        id: uuid(), organization_id: org, purchase_order_id: po.id, product_id: p.id, line_no: i + 1, quantity: qty, unit: p.unit,
        unit_price: p.cost, received_qty: 0,
      };
      poItems.push(item);
      if (status === "ordered") p.open = true;
      return item;
    });
    po.total_amount = its.reduce((s, i) => s + Math.round(i.quantity * i.unit_price), 0);
    return { po, items: its };
  };

  const receive = (date: string, po: Po, lines: { item: PoItem; qty: number }[]) => {
    const receipt = { id: uuid(), organization_id: org, purchase_order_id: po.id, received_on: date, note: "", idempotency_key: `demo-${uuid()}`, created_by: staff.staff, created_at: stamp(date) };
    receipts.push(receipt);
    for (const line of lines) {
      const item = line.item;
      // qty = -1 は「残り全部」
      const qty = line.qty === -1 ? item.quantity - item.received_qty : line.qty;
      if (qty <= 0) continue;
      const ri = { id: uuid(), organization_id: org, receipt_id: receipt.id, purchase_order_item_id: item.id, quantity: qty };
      receiptItems.push(ri);
      item.received_qty += qty;
      const p = productOf.get(item.product_id)!;
      move(p, "receipt", qty, date, `入荷 ${po.number}`, staff.staff, { receiptItem: ri.id });
    }
    const its = poItems.filter((i) => i.purchase_order_id === po.id);
    const done = its.every((i) => i.received_qty >= i.quantity);
    po.status = done ? "received" : "partial";
    po.updated_at = receipt.created_at;
    if (done) for (const i of its) productOf.get(i.product_id)!.open = false;
  };

  const adjustments: {
    id: string; organization_id: string; product_id: string; counted_qty: number; system_qty: number; movement_id: string;
    counted_on: string; reason: string; created_by: string; created_at: Date;
  }[] = [];

  // 初期在庫（6か月前に棚卸しした数量）
  for (const p of items) {
    const q = Math.max(p.rp + p.lot, Math.round((p.target * rng.float(0.85, 1.15)) / p.lot) * p.lot);
    move(p, "opening", q, start, "初期在庫", staff.admin);
  }

  const RATE: Record<Frequency, number> = { fast: 0.4, normal: 0.12, slow: 0.05, stale: 0, faded: 0.15 };
  const SIZE: Record<Frequency, number> = { fast: 0.16, normal: 0.25, slow: 0.3, stale: 0, faded: 0.25 };
  const scenarioCut = addDays(today, -28);
  const tweakDay = addDays(today, -1);
  let reversalDone = false;

  for (let d = addDays(start, 1); d <= today; d = addDays(d, 1)) {
    const wd = dow(d);
    // 1) 入荷
    for (const r of scheduled.get(d) ?? []) receive(d, r.po, r.lines);

    // 2) 発注の見どころ（SCENARIOS）
    if (d === addDays(today, -11)) scenarioPo("delayed", d, addDays(today, -4));
    if (d === addDays(today, -10)) scenarioPo("partial", d, addDays(today, -3));
    if (d === addDays(today, -2)) scenarioPo("ordered", d, addDays(today, 5));

    // 3) 出庫
    for (const p of items) {
      if (p.freq === "faded" && d > addDays(start, 60)) continue;
      if (p.scenario && d > addDays(today, -2)) continue;
      const rate = RATE[p.freq] * (wd === 0 ? 0 : wd === 6 ? 0.3 : 1);
      if (rate === 0 || !rng.chance(rate) || p.stock <= 0) continue;
      const max = Math.max(1, Math.round(p.target * SIZE[p.freq]));
      const qty = Math.min(p.stock, rng.int(1, max));
      // 今日の出庫で新しい在庫不足は作らない（見どころの商品だけが「発注待ち」になるように）
      if (d === today && p.stock - qty <= p.rp) continue;
      const row = move(p, "out", -qty, d, rng.pick(["現場出庫", "現場出庫", "工事用", "修理対応", "メンテナンス"]), rng.chance(0.8) ? staff.staff : staff.admin);
      // 入力ミスの取消（監査の見本。1件だけ）
      if (!reversalDone && p.freq === "normal" && d > addDays(start, 120) && qty >= 2) {
        reversalDone = true;
        move(p, "reversal", qty, d, "取消：数量の入力ミス", staff.admin, { reverses: row.id });
        move(p, "out", -1, d, "現場出庫", staff.staff);
      }
    }

    // 4) 毎週月曜に、発注点を下回った商品を仕入先ごとにまとめて発注する（同じ仕入先で発注点に近い商品も一緒に）
    if ((wd === 1 || d >= addDays(today, -6)) && d <= addDays(today, -1)) {
      const triggered = new Set(items.filter((p) => !p.open && p.stock <= p.rp && !(p.scenario && d >= scenarioCut)).map((p) => p.supplier));
      const bySupplier = new Map<number, { p: P; qty: number }[]>();
      for (const p of items) {
        if (!triggered.has(p.supplier) || p.open || p.stock > p.rp * 1.5) continue;
        if (p.scenario && d >= scenarioCut) continue;
        const qty = suggestQuantity({ onHand: p.stock, onOrder: 0, targetStock: p.target, minOrderQty: p.min, orderLot: p.lot });
        if (qty <= 0) continue;
        bySupplier.set(p.supplier, [...(bySupplier.get(p.supplier) ?? []), { p, qty }]);
      }
      for (const [s, lines] of bySupplier) {
        const lead = SUPPLIERS[s].leadDays;
        const expected = addDays(d, lead);
        const { po, items: its } = createPo(s, d, lines, "ordered", expected, rng.chance(0.7) ? staff.staff : staff.admin);
        let arrive = rng.chance(0.2) ? addDays(expected, 1) : expected;
        if (arrive > today) arrive = expected > today ? arrive : today;
        if (arrive > today) continue; // まだ届いていない（納品予定日も先）
        if (rng.chance(0.12) && addDays(arrive, 6) < today) {
          // 一部だけ先に届き、残りは数日後
          schedule(arrive, po, its.map((i) => ({ item: i, qty: Math.max(1, Math.floor(i.quantity * 0.6)) })));
          schedule(addDays(arrive, rng.int(2, 5)), po, its.map((i) => ({ item: i, qty: -1 })));
        } else {
          schedule(arrive, po, its.map((i) => ({ item: i, qty: i.quantity })));
        }
      }
    }

    // 5) 月末の棚卸（差異を調整）
    if (addDays(d, 1).slice(8) === "01" && d > addDays(start, 100)) {
      for (const p of items.filter((x) => x.freq === "normal" && x.stock > 3 && !x.scenario).slice(rng.int(0, 10), rng.int(11, 14))) {
        if (!rng.chance(0.35)) continue;
        const system = p.stock;
        const row = move(p, "adjust", -1, d, "棚卸：数量差異", staff.admin);
        adjustments.push({ id: uuid(), organization_id: org, product_id: p.id, counted_qty: system - 1, system_qty: system, movement_id: row.id, counted_on: d, reason: "数量差異", created_by: staff.admin, created_at: row.created_at });
      }
    }

    // 6) 見どころの商品の在庫を、最後に決めた数にそろえる
    if (d === tweakDay) {
      for (const p of items.filter((x) => x.scenario)) {
        const want = p.scenario!.kind === "out" ? 0 : (p.scenario!.value ?? Math.floor(p.rp / 2));
        if (p.stock > want) move(p, "out", want - p.stock, d, "現場出庫", staff.staff);
        else if (p.stock < want) move(p, "in", want - p.stock, d, "倉庫間移動", staff.staff);
      }
    }
  }

  // 下書きの発注書（今日作成）
  {
    const p = items.find((x) => x.scenario?.kind === "draft")!;
    const qty = suggestQuantity({ onHand: p.stock, onOrder: 0, targetStock: p.target, minOrderQty: p.min, orderLot: p.lot });
    createPo(p.supplier, today, [{ p, qty }], "draft", addDays(today, SUPPLIERS[p.supplier].leadDays), staff.staff);
  }

  function scenarioPo(kind: "partial" | "delayed" | "ordered", date: string, expected: string) {
    const ps = items.filter((x) => x.scenario?.kind === kind);
    if (ps.length === 0) return;
    const lines = ps.map((p) => ({ p, qty: p.target + p.rp }));
    const { po, items: its } = createPo(ps[0].supplier, date, lines, "ordered", expected, staff.staff);
    if (kind === "partial") schedule(expected, po, its.map((i) => ({ item: i, qty: Math.floor(i.quantity / 2) })));
  }

  const balances = items.map((p) => ({ organization_id: org, product_id: p.id, on_hand: p.stock, last_out_on: p.lastOut }));
  const counterRows = [...counters].map(([month, value]) => ({ organization_id: org, kind: `po:${month}`, value }));
  return {
    organizationId: org, today, staff, users, organization, settings, profiles, members, categories, suppliers, products, balances,
    movements, adjustments, purchaseOrders: pos, purchaseOrderItems: poItems, receipts, receiptItems, counters: counterRows,
  };
}

