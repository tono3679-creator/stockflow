-- 行レベルセキュリティ（RLS）と権限
--
-- * どの表も「自分の組織（current_org_id()）」の行しか見えない
-- * マスタ（商品・仕入先・カテゴリ）と設定・メンバーを変えられるのは管理者だけ
-- * 在庫・発注・入荷・取込・操作記録の表には、ログイン利用者の書き込み権限を付けない。
--   書き込みは 20261119000002 の DB 関数（中で役割を確かめる）だけが行う
-- 関数呼び出しは (select …) で包み、1回の問い合わせで1回だけ評価させる。

alter table public.organizations enable row level security;
alter table public.organization_settings enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_members enable row level security;
alter table public.categories enable row level security;
alter table public.suppliers enable row level security;
alter table public.products enable row level security;
alter table public.stock_balances enable row level security;
alter table public.stock_movements enable row level security;
alter table public.inventory_adjustments enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_items enable row level security;
alter table public.stock_receipts enable row level security;
alter table public.stock_receipt_items enable row level security;
alter table public.import_jobs enable row level security;
alter table public.audit_logs enable row level security;

-- まず全部取り上げてから、必要なものだけ許可する（Supabase の既定の権限も外す）
revoke all on all tables in schema public from public, anon, authenticated;
revoke all on all sequences in schema public from public, anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
revoke all on all functions in schema app_private from public, anon, authenticated;
revoke all on all tables in schema app_private from public, anon, authenticated;
revoke all on all tables in schema app_auth from public, anon, authenticated;
alter default privileges in schema public revoke all on tables from public, anon, authenticated;
alter default privileges in schema public revoke all on functions from public, anon, authenticated;
alter default privileges in schema public revoke all on sequences from public, anon, authenticated;
alter default privileges in schema app_private revoke all on functions from public;

grant usage on schema app_private to authenticated;

-- ---------------------------------------------------------------
-- 権限（表・列）
-- ---------------------------------------------------------------
grant select on public.organizations, public.organization_settings, public.profiles, public.organization_members,
  public.categories, public.suppliers, public.products, public.stock_balances, public.stock_movements,
  public.inventory_adjustments, public.purchase_orders, public.purchase_order_items, public.stock_receipts,
  public.stock_receipt_items, public.import_jobs, public.audit_logs, public.product_stock
  to authenticated;

grant update (name) on public.organizations to authenticated;
grant update (timezone, company_name, postal_code, address, phone, email, contact_name, po_note, stale_days, default_lead_days)
  on public.organization_settings to authenticated;
grant update (display_name) on public.profiles to authenticated;
grant update (role, is_active) on public.organization_members to authenticated;

grant insert (organization_id, name, sort_order), update (name, sort_order), delete on public.categories to authenticated;
grant insert (organization_id, name, contact_name, phone, email, address, notes, is_active),
      update (name, contact_name, phone, email, address, notes, is_active)
  on public.suppliers to authenticated;
-- 仕入先・商品は削除しない（発注・入出庫の履歴が残るため）。使わなくなったら無効にする
grant insert (organization_id, code, name, category_id, unit, supplier_id, unit_cost, reorder_point, target_stock, order_lot,
              min_order_qty, location, is_active, notes),
      update (code, name, category_id, unit, supplier_id, unit_cost, reorder_point, target_stock, order_lot,
              min_order_qty, location, is_active, notes)
  on public.products to authenticated;

grant execute on function public.current_org_id(), public.current_org_role(), public.org_today(uuid),
  public.record_stock_movement(uuid, text, numeric, date, text, text),
  public.set_opening_stock(uuid, numeric, date, text),
  public.adjust_stock(uuid, numeric, date, text, text),
  public.reverse_stock_movement(uuid, text),
  public.create_purchase_orders(jsonb, public.po_status, date, date, text, text),
  public.update_purchase_order(uuid, date, text, jsonb),
  public.place_purchase_order(uuid),
  public.cancel_purchase_order(uuid, text),
  public.receive_purchase_order(uuid, jsonb, date, text, text),
  public.record_po_pdf(uuid, text),
  public.import_products(jsonb, text, text),
  public.import_stock(public.import_kind, jsonb, text, text)
  to authenticated;
-- 画面の表（product_stock）が使う計算と、呼び出した利用者の権限で動くトリガー
grant execute on function app_private.suggest_qty(numeric, numeric, numeric, numeric, numeric), app_private.touch_updated_at()
  to authenticated;

-- ---------------------------------------------------------------
-- ポリシー
-- ---------------------------------------------------------------
create policy organizations_read on public.organizations for select to authenticated
  using (id = (select public.current_org_id()));
create policy organizations_update on public.organizations for update to authenticated
  using (id = (select public.current_org_id()) and (select public.current_org_role()) = 'admin')
  with check (id = (select public.current_org_id()));

create policy settings_read on public.organization_settings for select to authenticated
  using (organization_id = (select public.current_org_id()));
create policy settings_update on public.organization_settings for update to authenticated
  using (organization_id = (select public.current_org_id()) and (select public.current_org_role()) = 'admin')
  with check (organization_id = (select public.current_org_id()));

create policy members_read on public.organization_members for select to authenticated
  using (organization_id = (select public.current_org_id()));
create policy members_update on public.organization_members for update to authenticated
  using (organization_id = (select public.current_org_id()) and (select public.current_org_role()) = 'admin')
  with check (organization_id = (select public.current_org_id()));

-- 同じ組織のメンバーのプロフィールだけ見える。自分のプロフィールは自分で、他人のは管理者が直せる
create policy profiles_read on public.profiles for select to authenticated
  using (exists (select 1 from public.organization_members m where m.user_id = profiles.id and m.organization_id = (select public.current_org_id())));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid()) or ((select public.current_org_role()) = 'admin'
         and exists (select 1 from public.organization_members m where m.user_id = profiles.id and m.organization_id = (select public.current_org_id()))));

-- マスタ：読むのは全員・書くのは管理者
do $$
declare
  t text;
begin
  foreach t in array array['categories', 'suppliers', 'products'] loop
    execute format('create policy %1$s_read on public.%1$s for select to authenticated using (organization_id = (select public.current_org_id()))', t);
    execute format($p$create policy %1$s_write on public.%1$s for all to authenticated
      using (organization_id = (select public.current_org_id()) and (select public.current_org_role()) = 'admin')
      with check (organization_id = (select public.current_org_id()) and (select public.current_org_role()) = 'admin')$p$, t);
  end loop;
end $$;

-- 在庫・発注・取込・記録：読むのは全員（書き込みは DB 関数だけ）
do $$
declare
  t text;
begin
  foreach t in array array['stock_balances', 'stock_movements', 'inventory_adjustments', 'purchase_orders', 'purchase_order_items',
                           'stock_receipts', 'stock_receipt_items', 'import_jobs'] loop
    execute format('create policy %1$s_read on public.%1$s for select to authenticated using (organization_id = (select public.current_org_id()))', t);
  end loop;
end $$;

-- 操作の記録は管理者だけが見る
create policy audit_logs_read on public.audit_logs for select to authenticated
  using (organization_id = (select public.current_org_id()) and (select public.current_org_role()) = 'admin');
