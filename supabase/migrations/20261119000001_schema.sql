-- StockFlow のスキーマ（表・型・index）
--
-- * すべての業務表に organization_id を持たせ、(organization_id, id) を一意にする。
--   子の表は (organization_id, 親id) の複合外部キーで参照するため、別の会社の行は指せない。
-- * 数量は numeric(14,3)（m・kg など小数の単位にも対応）。浮動小数点は使わない。
-- * 金額（円）は bigint の整数。単価だけは銭まで持てるよう numeric(14,2)。
-- * 在庫の正本は stock_movements（追記のみ・更新も削除もしない）。stock_balances は参照を速くするための残高で、
--   入出庫の DB 関数が同じトランザクションの中で、行ロックをかけて更新する（20261119000002）。
-- * 日付だけの項目は date（*_on）、日時は timestamptz（*_at）。
-- * 商品・仕入先・履歴はログイン利用者からは削除できない（無効にする）。削除されるのは組織ごと消すとき（デモの片付け）だけなので、
--   組織の削除が途中で止まらないよう、子の表の外部キーはすべて on delete cascade にしている。

create schema if not exists app_private;
create schema if not exists app_auth;
revoke all on schema app_private from public;
revoke all on schema app_auth from public;

-- ---------------------------------------------------------------
-- 型
-- ---------------------------------------------------------------
-- admin：管理者 / staff：担当者 / viewer：閲覧者
create type public.org_role as enum ('admin', 'staff', 'viewer');
-- opening：初期在庫 / in：入庫 / out：出庫 / receipt：発注の入荷 / adjust：棚卸調整 / reversal：取消
create type public.movement_kind as enum ('opening', 'in', 'out', 'receipt', 'adjust', 'reversal');
create type public.po_status as enum ('draft', 'ordered', 'partial', 'received', 'cancelled');
create type public.import_kind as enum ('products', 'opening', 'movements');

-- ---------------------------------------------------------------
-- ログインの利用者（Supabase Auth の auth.users と衝突しないよう app_auth に置く）
-- ---------------------------------------------------------------
create table app_auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  encrypted_password text,
  is_anonymous boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index users_email_lower_idx on app_auth.users (lower(email)) where email is not null;

-- ---------------------------------------------------------------
-- 組織（テナント）
-- ---------------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100),
  is_demo boolean not null default false,
  demo_expires_at timestamptz,
  is_showcase boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not is_demo or demo_expires_at is not null)
);
create index organizations_demo_idx on public.organizations (demo_expires_at) where is_demo;

create table public.organization_settings (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  timezone text not null default 'Asia/Tokyo' check (char_length(timezone) <= 50),
  -- 発注書に載せる発注元の情報
  company_name text not null default '' check (char_length(company_name) <= 100),
  postal_code text not null default '' check (char_length(postal_code) <= 10),
  address text not null default '' check (char_length(address) <= 200),
  phone text not null default '' check (char_length(phone) <= 30),
  email text not null default '' check (char_length(email) <= 200),
  contact_name text not null default '' check (char_length(contact_name) <= 50),
  -- 発注書の備考（支払条件など）
  po_note text not null default '' check (char_length(po_note) <= 500),
  -- この日数のあいだ出庫がない品目を「滞留」とする
  stale_days integer not null default 90 check (stale_days between 7 and 730),
  -- 発注から納品予定日までの既定の日数
  default_lead_days integer not null default 7 check (default_lead_days between 0 and 180),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references app_auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 50),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.org_role not null default 'viewer',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create index organization_members_user_idx on public.organization_members (user_id);

-- 採番（発注番号の月ごとの連番など）
create table app_private.counters (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  kind text not null,
  value integer not null default 0,
  primary key (organization_id, kind)
);

-- ---------------------------------------------------------------
-- マスタ
-- ---------------------------------------------------------------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, name)
);

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  contact_name text not null default '' check (char_length(contact_name) <= 50),
  phone text not null default '' check (char_length(phone) <= 30),
  email text not null default '' check (char_length(email) <= 200),
  address text not null default '' check (char_length(address) <= 200),
  notes text not null default '' check (char_length(notes) <= 1000),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, name)
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  code text not null check (char_length(code) between 1 and 40),
  name text not null check (char_length(name) between 1 and 100),
  category_id uuid,
  unit text not null default '個' check (char_length(unit) between 1 and 10),
  supplier_id uuid,
  -- 管理用の仕入単価（円。会計上の棚卸評価とは別）
  unit_cost numeric(14, 2) not null default 0 check (unit_cost >= 0),
  reorder_point numeric(14, 3) not null default 0 check (reorder_point >= 0),
  target_stock numeric(14, 3) not null default 0 check (target_stock >= 0),
  -- 発注単位（この数の倍数で発注する。1 なら切り上げなし）
  order_lot numeric(14, 3) not null default 1 check (order_lot > 0),
  min_order_qty numeric(14, 3) not null default 0 check (min_order_qty >= 0),
  location text not null default '' check (char_length(location) <= 50),
  is_active boolean not null default true,
  notes text not null default '' check (char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, code),
  check (target_stock >= reorder_point),
  foreign key (organization_id, category_id) references public.categories (organization_id, id) on delete set null (category_id),
  foreign key (organization_id, supplier_id) references public.suppliers (organization_id, id) on delete set null (supplier_id)
);
create index products_org_name_idx on public.products (organization_id, name);
create index products_supplier_idx on public.products (organization_id, supplier_id);
create index products_search_idx on public.products using gin ((name || ' ' || code) extensions.gin_trgm_ops);

-- ---------------------------------------------------------------
-- 在庫
-- ---------------------------------------------------------------
-- 残高（参照用）。商品を作ると 0 で作られ、入出庫の DB 関数だけが更新する
create table public.stock_balances (
  organization_id uuid not null,
  product_id uuid not null,
  on_hand numeric(14, 3) not null default 0,
  last_out_on date,
  updated_at timestamptz not null default now(),
  primary key (organization_id, product_id),
  foreign key (organization_id, product_id) references public.products (organization_id, id) on delete cascade
);

-- 取込（CSV）。同じファイル（内容のハッシュ）の在庫の取込は2回目を断る
create table public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  kind public.import_kind not null,
  file_name text not null default '' check (char_length(file_name) <= 200),
  file_hash text not null check (file_hash ~ '^[0-9a-f]{64}$'),
  row_count integer not null default 0,
  inserted_count integer not null default 0,
  updated_count integer not null default 0,
  skipped_count integer not null default 0,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, id)
);
create unique index import_jobs_stock_once_idx on public.import_jobs (organization_id, kind, file_hash) where kind <> 'products';

-- 入出庫の履歴（正本）。quantity は在庫の増減（入庫は正、出庫は負）
create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  product_id uuid not null,
  kind public.movement_kind not null,
  quantity numeric(14, 3) not null check (quantity <> 0),
  balance_after numeric(14, 3) not null,
  occurred_on date not null,
  note text not null default '' check (char_length(note) <= 200),
  -- 取消の記録が指す元の記録（1件に1回だけ取り消せる）
  reverses_id uuid,
  receipt_item_id uuid,
  import_job_id uuid,
  -- 通信の再試行などで同じ登録が2回届いても1件にする
  idempotency_key text check (char_length(idempotency_key) <= 100),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, product_id) references public.products (organization_id, id) on delete cascade,
  foreign key (organization_id, reverses_id) references public.stock_movements (organization_id, id) on delete cascade,
  foreign key (organization_id, import_job_id) references public.import_jobs (organization_id, id) on delete cascade,
  check ((kind = 'reversal') = (reverses_id is not null)),
  check (kind not in ('in', 'opening', 'receipt') or quantity > 0),
  check (kind <> 'out' or quantity < 0)
);
create unique index stock_movements_reverses_idx on public.stock_movements (organization_id, reverses_id) where reverses_id is not null;
create unique index stock_movements_key_idx on public.stock_movements (organization_id, idempotency_key) where idempotency_key is not null;
create index stock_movements_product_idx on public.stock_movements (organization_id, product_id, occurred_on desc, created_at desc);
create index stock_movements_date_idx on public.stock_movements (organization_id, occurred_on desc, created_at desc);

-- 棚卸調整（実在庫を数えた記録。差分は stock_movements の adjust として記録する）
create table public.inventory_adjustments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  product_id uuid not null,
  counted_qty numeric(14, 3) not null check (counted_qty >= 0),
  system_qty numeric(14, 3) not null,
  movement_id uuid,
  counted_on date not null,
  reason text not null default '' check (char_length(reason) <= 200),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, product_id) references public.products (organization_id, id) on delete cascade,
  foreign key (organization_id, movement_id) references public.stock_movements (organization_id, id) on delete cascade
);

-- ---------------------------------------------------------------
-- 発注
-- ---------------------------------------------------------------
create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  -- PO-202611-0001（発注日の年月ごとの連番。DB が採番する）
  number text not null,
  supplier_id uuid not null,
  status public.po_status not null default 'draft',
  order_on date not null,
  expected_on date,
  notes text not null default '' check (char_length(notes) <= 500),
  -- 明細の金額の合計（円）。明細が変わるとトリガーが計算し直す
  total_amount bigint not null default 0,
  -- Supabase Storage に保存した発注書 PDF の場所（保存していなければ null）
  pdf_path text,
  pdf_saved_at timestamptz,
  ordered_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text not null default '' check (char_length(cancel_reason) <= 200),
  idempotency_key text check (char_length(idempotency_key) <= 100),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, number),
  foreign key (organization_id, supplier_id) references public.suppliers (organization_id, id) on delete cascade,
  check (expected_on is null or expected_on >= order_on)
);
create unique index purchase_orders_key_idx on public.purchase_orders (organization_id, idempotency_key, supplier_id) where idempotency_key is not null;
create index purchase_orders_status_idx on public.purchase_orders (organization_id, status, order_on desc);
create index purchase_orders_supplier_idx on public.purchase_orders (organization_id, supplier_id, order_on desc);

create table public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  purchase_order_id uuid not null,
  product_id uuid not null,
  line_no integer not null,
  quantity numeric(14, 3) not null check (quantity > 0),
  -- 発注した時点の単位・単価（あとで商品マスタを変えても発注書は変わらない）
  unit text not null,
  unit_price numeric(14, 2) not null check (unit_price >= 0),
  amount bigint generated always as (round(quantity * unit_price)::bigint) stored,
  received_qty numeric(14, 3) not null default 0 check (received_qty >= 0),
  unique (organization_id, id),
  unique (purchase_order_id, product_id),
  foreign key (organization_id, purchase_order_id) references public.purchase_orders (organization_id, id) on delete cascade,
  foreign key (organization_id, product_id) references public.products (organization_id, id) on delete cascade,
  check (received_qty <= quantity)
);
create index purchase_order_items_product_idx on public.purchase_order_items (organization_id, product_id);

-- 入荷（発注に対する受け取り。1回の入荷登録が1件）
create table public.stock_receipts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  purchase_order_id uuid not null,
  received_on date not null,
  note text not null default '' check (char_length(note) <= 200),
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 100),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, idempotency_key),
  foreign key (organization_id, purchase_order_id) references public.purchase_orders (organization_id, id) on delete cascade
);
create index stock_receipts_po_idx on public.stock_receipts (organization_id, purchase_order_id);

create table public.stock_receipt_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  receipt_id uuid not null,
  purchase_order_item_id uuid not null,
  quantity numeric(14, 3) not null check (quantity > 0),
  unique (organization_id, id),
  unique (receipt_id, purchase_order_item_id),
  foreign key (organization_id, receipt_id) references public.stock_receipts (organization_id, id) on delete cascade,
  foreign key (organization_id, purchase_order_item_id) references public.purchase_order_items (organization_id, id) on delete cascade
);
alter table public.stock_movements
  add foreign key (organization_id, receipt_item_id) references public.stock_receipt_items (organization_id, id) on delete cascade;

-- ---------------------------------------------------------------
-- 操作の記録
-- ---------------------------------------------------------------
create table public.audit_logs (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null check (char_length(action) <= 60),
  entity text not null check (char_length(entity) <= 40),
  entity_id uuid,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_org_idx on public.audit_logs (organization_id, created_at desc);
