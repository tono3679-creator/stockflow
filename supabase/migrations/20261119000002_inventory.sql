-- 在庫・発注の業務ルール（DB 関数とトリガー）
--
-- * 在庫を変える処理はすべてここの関数を通す（画面やクライアントで在庫を計算して保存することはしない）。
--   残高の行を `for update` でロックしてから検証・履歴の追加・残高の更新を同じトランザクションで行うので、
--   同時に出庫しても在庫がマイナスになったり、数がずれたりしない。
-- * 通信の再試行で同じ登録が2回届いても、冪等性キー（idempotency_key）で1回分だけ記録する。
-- * 過去の記録は直さない。取り消すときは逆の数量の「取消」を追記する（誰がいつ取り消したか残る）。
-- * 推奨発注数量の式は app_private.suggest_qty（src/lib/domain/reorder.ts と同じ式。DB テストで一致を確認）。

-- ---------------------------------------------------------------
-- 現在の利用者
-- ---------------------------------------------------------------
-- 利用者がどの組織として操作しているか。アプリが request.jwt.claims に org_id を入れる（無ければ最初に所属した組織）。
-- 所属していない組織の ID を入れても null になる（＝何も見えない）。
create or replace function public.current_org_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select m.organization_id
    from public.organization_members m
   where m.user_id = auth.uid()
     and m.is_active
     and (
       nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'org_id', '') is null
       or m.organization_id = (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'org_id')::uuid
     )
   order by m.created_at, m.organization_id
   limit 1
$$;

create or replace function public.current_org_role() returns public.org_role
language sql stable security definer set search_path = '' as $$
  select m.role from public.organization_members m
   where m.user_id = auth.uid() and m.organization_id = public.current_org_id() and m.is_active
$$;

-- 組織のタイムゾーンでの「今日」
create or replace function public.org_today(p_org uuid) returns date
language sql stable security definer set search_path = '' as $$
  select (now() at time zone coalesce((select s.timezone from public.organization_settings s where s.organization_id = p_org), 'Asia/Tokyo'))::date
$$;

-- 役割の確認。足りなければ権限エラー。戻り値は組織 ID
create or replace function app_private.require_role(p_roles public.org_role[]) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  v_org uuid := public.current_org_id();
begin
  if v_org is null then
    raise exception 'ログインしてください' using errcode = '42501';
  end if;
  if not (public.current_org_role() = any (p_roles)) then
    raise exception 'この操作を行う権限がありません' using errcode = '42501';
  end if;
  return v_org;
end $$;

-- 操作の記録
create or replace function app_private.audit(p_org uuid, p_action text, p_entity text, p_entity_id uuid, p_detail jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.audit_logs (organization_id, actor_id, action, entity, entity_id, detail)
  values (p_org, auth.uid(), p_action, p_entity, p_entity_id, coalesce(p_detail, '{}'::jsonb))
$$;

-- 数量の表示（末尾の 0 を消す：12.000 → 12、2.500 → 2.5）
create or replace function app_private.fmt_qty(p numeric) returns text
language sql immutable set search_path = '' as $$
  select trim(trailing '.' from trim(trailing '0' from to_char(p, 'FM999999999990.000')))
$$;

-- ---------------------------------------------------------------
-- 共通のトリガー
-- ---------------------------------------------------------------
create or replace function app_private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger organizations_touch before update on public.organizations for each row execute function app_private.touch_updated_at();
create trigger settings_touch before update on public.organization_settings for each row execute function app_private.touch_updated_at();
create trigger profiles_touch before update on public.profiles for each row execute function app_private.touch_updated_at();
create trigger suppliers_touch before update on public.suppliers for each row execute function app_private.touch_updated_at();
create trigger products_touch before update on public.products for each row execute function app_private.touch_updated_at();
create trigger purchase_orders_touch before update on public.purchase_orders for each row execute function app_private.touch_updated_at();

-- 商品を作ったら残高 0 の行も作る
create or replace function app_private.product_balance() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.stock_balances (organization_id, product_id) values (new.organization_id, new.id) on conflict do nothing;
  return new;
end $$;
create trigger products_balance after insert on public.products for each row execute function app_private.product_balance();

-- 商品マスタの変更を記録する（誰がいつ単価・発注点を変えたか）
create or replace function app_private.product_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    perform app_private.audit(new.organization_id, 'product.create', 'product', new.id, jsonb_build_object('code', new.code, 'name', new.name));
  else
    perform app_private.audit(new.organization_id, 'product.update', 'product', new.id,
      (select coalesce(jsonb_object_agg(n.key, jsonb_build_object('from', o.value, 'to', n.value)), '{}'::jsonb)
         from jsonb_each(to_jsonb(new)) n join jsonb_each(to_jsonb(old)) o using (key)
        where n.value is distinct from o.value and n.key not in ('updated_at')));
  end if;
  return new;
end $$;
create trigger products_audit after insert or update on public.products for each row execute function app_private.product_audit();

-- 管理者が1人もいなくなる変更は断る
create or replace function app_private.keep_one_admin() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.role = 'admin' and old.is_active and (new.role <> 'admin' or not new.is_active)
     and not exists (select 1 from public.organization_members m
                      where m.organization_id = old.organization_id and m.user_id <> old.user_id and m.role = 'admin' and m.is_active) then
    raise exception '管理者が1人もいなくなるため変更できません' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger members_keep_admin before update on public.organization_members for each row execute function app_private.keep_one_admin();

-- ---------------------------------------------------------------
-- 推奨発注数量
-- ---------------------------------------------------------------
-- MAX(0, 目標在庫 − 現在庫 − 未入荷の発注残)。必要数があれば最低発注数量まで増やし、発注単位の倍数に切り上げる
create or replace function app_private.suggest_qty(p_target numeric, p_on_hand numeric, p_on_order numeric, p_min numeric, p_lot numeric)
returns numeric language sql immutable set search_path = '' as $$
  select case
    when greatest(0, p_target - p_on_hand - p_on_order) = 0 then 0
    else ceil(greatest(p_target - p_on_hand - p_on_order, coalesce(p_min, 0)) / coalesce(nullif(p_lot, 0), 1)) * coalesce(nullif(p_lot, 0), 1)
  end
$$;

-- 品目ごとの在庫の状況（画面・レポート・CSV が共通で使う。呼び出した利用者の RLS で絞られる）
--   status：out（欠品：在庫 0 以下）/ low（在庫不足：発注点以下）/ ok（正常）
--   on_order：発注済・一部入荷の未入荷数量 / draft_qty：下書きの発注書にある数量
--   needs_order：発注点以下で、発注残を含めても目標在庫に届かない（＝発注待ち）
create or replace view public.product_stock with (security_invoker = true) as
select
  p.id, p.organization_id, p.code, p.name, p.category_id, c.name as category_name, p.unit, p.supplier_id, s.name as supplier_name,
  p.unit_cost, p.reorder_point, p.target_stock, p.order_lot, p.min_order_qty, p.location, p.is_active, p.notes,
  b.on_hand, b.last_out_on,
  coalesce(o.on_order, 0) as on_order,
  coalesce(o.draft_qty, 0) as draft_qty,
  round(greatest(b.on_hand, 0) * p.unit_cost)::bigint as stock_value,
  case when b.on_hand <= 0 then 'out' when b.on_hand <= p.reorder_point then 'low' else 'ok' end as status,
  case when b.on_hand <= p.reorder_point
       then app_private.suggest_qty(p.target_stock, b.on_hand, coalesce(o.on_order, 0), p.min_order_qty, p.order_lot)
       else 0 end as suggested_qty,
  (b.on_hand <= p.reorder_point
   and app_private.suggest_qty(p.target_stock, b.on_hand, coalesce(o.on_order, 0), p.min_order_qty, p.order_lot) > 0) as needs_order
from public.products p
join public.stock_balances b on b.organization_id = p.organization_id and b.product_id = p.id
left join public.categories c on c.organization_id = p.organization_id and c.id = p.category_id
left join public.suppliers s on s.organization_id = p.organization_id and s.id = p.supplier_id
left join lateral (
  select sum(i.quantity - i.received_qty) filter (where po.status in ('ordered', 'partial')) as on_order,
         sum(i.quantity) filter (where po.status = 'draft') as draft_qty
    from public.purchase_order_items i
    join public.purchase_orders po on po.organization_id = i.organization_id and po.id = i.purchase_order_id
   where i.organization_id = p.organization_id and i.product_id = p.id and po.status in ('draft', 'ordered', 'partial')
) o on true;

-- ---------------------------------------------------------------
-- 在庫の増減（すべての入出庫がここを通る）
-- ---------------------------------------------------------------
-- 残高をロックし、マイナスにならないか確かめてから、履歴の追加と残高の更新を行う
create or replace function app_private.apply_movement(
  p_org uuid, p_product uuid, p_kind public.movement_kind, p_quantity numeric, p_occurred_on date, p_note text,
  p_key text default null, p_reverses uuid default null, p_receipt_item uuid default null, p_import_job uuid default null
) returns public.stock_movements
language plpgsql security definer set search_path = '' as $$
declare
  v_on_hand numeric;
  v_unit text;
  v_after numeric;
  v_row public.stock_movements;
begin
  select b.on_hand, p.unit into v_on_hand, v_unit
    from public.stock_balances b join public.products p on p.organization_id = b.organization_id and p.id = b.product_id
   where b.organization_id = p_org and b.product_id = p_product
     for update of b;
  if not found then
    raise exception '商品が見つかりません' using errcode = 'P0002';
  end if;
  v_after := v_on_hand + p_quantity;
  if v_after < 0 then
    raise exception '在庫が不足しています（残り%）', app_private.fmt_qty(v_on_hand) || v_unit using errcode = '23514';
  end if;
  insert into public.stock_movements (organization_id, product_id, kind, quantity, balance_after, occurred_on, note,
                                      reverses_id, receipt_item_id, import_job_id, idempotency_key, created_by)
  values (p_org, p_product, p_kind, p_quantity, v_after, p_occurred_on, coalesce(p_note, ''),
          p_reverses, p_receipt_item, p_import_job, p_key, auth.uid())
  returning * into v_row;
  update public.stock_balances
     set on_hand = v_after,
         last_out_on = case when p_kind = 'out' then greatest(coalesce(last_out_on, p_occurred_on), p_occurred_on) else last_out_on end,
         updated_at = now()
   where organization_id = p_org and product_id = p_product;
  return v_row;
end $$;

-- 業務日付の範囲（未来日と、1年より前は登録できない）
create or replace function app_private.check_business_date(p_org uuid, p_date date) returns void
language plpgsql stable set search_path = '' as $$
begin
  if p_date is null then
    raise exception '日付を入力してください' using errcode = '22023';
  end if;
  if p_date > public.org_today(p_org) then
    raise exception '未来の日付では登録できません' using errcode = '22023';
  end if;
  if p_date < public.org_today(p_org) - 366 then
    raise exception '1年より前の日付では登録できません' using errcode = '22023';
  end if;
end $$;

-- 入庫・出庫の登録（管理者・担当者）。同じキーで2回呼ばれたら、1回目の記録を返す
create or replace function public.record_stock_movement(
  p_product uuid, p_direction text, p_quantity numeric, p_occurred_on date, p_note text, p_key text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := app_private.require_role(array['admin', 'staff']::public.org_role[]);
  v_existing public.stock_movements;
  v_product public.products;
  v_row public.stock_movements;
begin
  if p_direction not in ('in', 'out') then
    raise exception '入庫か出庫を選んでください' using errcode = '22023';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception '数量は0より大きい数を入力してください' using errcode = '22023';
  end if;
  if p_key is null or char_length(p_key) < 8 then
    raise exception '登録キーが正しくありません' using errcode = '22023';
  end if;
  select * into v_product from public.products where organization_id = v_org and id = p_product;
  if v_product.id is null then
    raise exception '商品が見つかりません' using errcode = 'P0002';
  end if;
  if not v_product.is_active then
    raise exception '無効の商品には登録できません' using errcode = '23514';
  end if;
  perform app_private.check_business_date(v_org, p_occurred_on);
  -- 同じ商品の登録を1件ずつ処理する（残高の行ロック）。そのあとで二重登録を確かめる
  perform 1 from public.stock_balances where organization_id = v_org and product_id = p_product for update;
  select * into v_existing from public.stock_movements where organization_id = v_org and idempotency_key = p_key;
  if v_existing.id is not null then
    if v_existing.product_id <> p_product then
      raise exception '登録キーが重複しています' using errcode = '23505';
    end if;
    return v_existing.id;
  end if;
  v_row := app_private.apply_movement(v_org, p_product, p_direction::public.movement_kind,
            case when p_direction = 'in' then p_quantity else -p_quantity end, p_occurred_on, left(coalesce(p_note, ''), 200), p_key);
  return v_row.id;
end $$;

-- 初期在庫（商品ごとに1回だけ。後から直すときは棚卸調整）
create or replace function public.set_opening_stock(p_product uuid, p_quantity numeric, p_occurred_on date, p_key text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := app_private.require_role(array['admin']::public.org_role[]);
  v_row public.stock_movements;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception '初期在庫は0より大きい数を入力してください' using errcode = '22023';
  end if;
  perform 1 from public.stock_balances where organization_id = v_org and product_id = p_product for update;
  if not found then
    raise exception '商品が見つかりません' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.stock_movements where organization_id = v_org and product_id = p_product and kind = 'opening') then
    raise exception '初期在庫は登録済みです（変更は棚卸調整で行ってください）' using errcode = '23514';
  end if;
  v_row := app_private.apply_movement(v_org, p_product, 'opening', p_quantity, p_occurred_on, '初期在庫', p_key);
  return v_row.id;
end $$;
create unique index stock_movements_opening_once_idx on public.stock_movements (organization_id, product_id) where kind = 'opening';

-- 棚卸調整（管理者）：数えた数量に合わせ、差分を記録する
create or replace function public.adjust_stock(p_product uuid, p_counted numeric, p_counted_on date, p_reason text, p_key text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := app_private.require_role(array['admin']::public.org_role[]);
  v_on_hand numeric;
  v_move public.stock_movements;
  v_id uuid;
begin
  if p_counted is null or p_counted < 0 then
    raise exception '実在庫は0以上の数を入力してください' using errcode = '22023';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception '調整の理由を入力してください' using errcode = '22023';
  end if;
  perform app_private.check_business_date(v_org, p_counted_on);
  select on_hand into v_on_hand from public.stock_balances where organization_id = v_org and product_id = p_product for update;
  if not found then
    raise exception '商品が見つかりません' using errcode = 'P0002';
  end if;
  if p_key is not null then
    select a.id into v_id from public.inventory_adjustments a
      join public.stock_movements m on m.organization_id = a.organization_id and m.id = a.movement_id
     where a.organization_id = v_org and m.idempotency_key = p_key;
    if v_id is not null then
      return v_id;
    end if;
  end if;
  if p_counted <> v_on_hand then
    v_move := app_private.apply_movement(v_org, p_product, 'adjust', p_counted - v_on_hand, p_counted_on, left('棚卸：' || p_reason, 200), p_key);
  end if;
  insert into public.inventory_adjustments (organization_id, product_id, counted_qty, system_qty, movement_id, counted_on, reason, created_by)
  values (v_org, p_product, p_counted, v_on_hand, v_move.id, p_counted_on, left(p_reason, 200), auth.uid())
  returning id into v_id;
  perform app_private.audit(v_org, 'stock.adjust', 'product', p_product,
    jsonb_build_object('system', v_on_hand, 'counted', p_counted, 'reason', p_reason));
  return v_id;
end $$;

-- 入出庫の取消（管理者）：逆の数量を追記する。入荷の記録・取消の記録は取り消せない
create or replace function public.reverse_stock_movement(p_movement uuid, p_reason text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := app_private.require_role(array['admin']::public.org_role[]);
  v_src public.stock_movements;
  v_row public.stock_movements;
begin
  if coalesce(trim(p_reason), '') = '' then
    raise exception '取消の理由を入力してください' using errcode = '22023';
  end if;
  select * into v_src from public.stock_movements where organization_id = v_org and id = p_movement;
  if v_src.id is null then
    raise exception '記録が見つかりません' using errcode = 'P0002';
  end if;
  if v_src.kind in ('receipt', 'reversal') then
    raise exception 'この記録は取り消せません' using errcode = '23514';
  end if;
  perform 1 from public.stock_balances where organization_id = v_org and product_id = v_src.product_id for update;
  if exists (select 1 from public.stock_movements where organization_id = v_org and reverses_id = p_movement) then
    raise exception 'この記録は取消済みです' using errcode = '23514';
  end if;
  v_row := app_private.apply_movement(v_org, v_src.product_id, 'reversal', -v_src.quantity, public.org_today(v_org),
            left('取消：' || p_reason, 200), null, v_src.id);
  perform app_private.audit(v_org, 'stock.reverse', 'stock_movement', v_src.id, jsonb_build_object('reason', p_reason, 'quantity', v_src.quantity));
  return v_row.id;
end $$;

-- ---------------------------------------------------------------
-- 発注
-- ---------------------------------------------------------------
-- 発注番号（PO-YYYYMM-0001。発注日の年月ごとの連番）
create or replace function app_private.next_po_number(p_org uuid, p_order_on date) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_month text := to_char(p_order_on, 'YYYYMM');
  v integer;
begin
  insert into app_private.counters (organization_id, kind, value) values (p_org, 'po:' || v_month, 1)
  on conflict (organization_id, kind) do update set value = app_private.counters.value + 1
  returning value into v;
  return 'PO-' || v_month || '-' || lpad(v::text, 4, '0');
end $$;

-- 明細が変わったら合計金額を計算し直す
create or replace function app_private.po_total() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := coalesce(new.organization_id, old.organization_id);
  v_po uuid := coalesce(new.purchase_order_id, old.purchase_order_id);
begin
  update public.purchase_orders po
     set total_amount = coalesce((select sum(i.amount) from public.purchase_order_items i where i.organization_id = v_org and i.purchase_order_id = v_po), 0)
   where po.organization_id = v_org and po.id = v_po;
  return null;
end $$;
create trigger purchase_order_items_total after insert or update or delete on public.purchase_order_items
  for each row execute function app_private.po_total();

-- 明細の検証と登録（create / update で共通）。p_lines：[{product_id, quantity, unit_price?}]
create or replace function app_private.insert_po_lines(p_org uuid, p_po uuid, p_lines jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_line jsonb;
  v_product public.products;
  v_qty numeric;
  v_price numeric;
  v_no integer := 0;
begin
  for v_line in select * from jsonb_array_elements(p_lines) loop
    select * into v_product from public.products where organization_id = p_org and id = (v_line ->> 'product_id')::uuid;
    if v_product.id is null then
      raise exception '商品が見つかりません' using errcode = 'P0002';
    end if;
    v_qty := (v_line ->> 'quantity')::numeric;
    if v_qty is null or v_qty <= 0 then
      raise exception '「%」の数量は0より大きい数を入力してください', v_product.name using errcode = '22023';
    end if;
    if v_qty > 9999999 then
      raise exception '「%」の数量が大きすぎます', v_product.name using errcode = '22023';
    end if;
    v_price := coalesce((v_line ->> 'unit_price')::numeric, v_product.unit_cost);
    if v_price < 0 then
      raise exception '「%」の単価は0以上にしてください', v_product.name using errcode = '22023';
    end if;
    v_no := v_no + 1;
    begin
      insert into public.purchase_order_items (organization_id, purchase_order_id, product_id, line_no, quantity, unit, unit_price)
      values (p_org, p_po, v_product.id, v_no, v_qty, v_product.unit, round(v_price, 2));
    exception when unique_violation then
      raise exception '「%」が同じ発注書に2回入っています', v_product.name using errcode = '23514';
    end;
  end loop;
  return v_no;
end $$;

-- 発注書の作成（管理者・担当者）。仕入先ごとに発注書を分けて作り、作った発注書の ID を返す。
--   p_lines：[{product_id, quantity, unit_price?, supplier_id?}]（supplier_id を省くと商品の仕入先）
--   p_status：draft（下書き）か ordered（すぐに発注済にする）
--   同じ p_key で2回呼ばれたら、1回目に作った発注書を返す（二重作成の防止）
create or replace function public.create_purchase_orders(
  p_lines jsonb, p_status public.po_status, p_order_on date, p_expected_on date, p_notes text, p_key text
) returns uuid[]
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := app_private.require_role(array['admin', 'staff']::public.org_role[]);
  v_ids uuid[];
  v_group record;
  v_po uuid;
begin
  if p_status not in ('draft', 'ordered') then
    raise exception '作成時のステータスは下書きか発注済です' using errcode = '22023';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception '発注する商品を選んでください' using errcode = '22023';
  end if;
  if jsonb_array_length(p_lines) > 200 then
    raise exception '一度に発注できるのは200品目までです' using errcode = '22023';
  end if;
  if p_order_on is null then
    raise exception '発注日を入力してください' using errcode = '22023';
  end if;
  if p_expected_on is not null and p_expected_on < p_order_on then
    raise exception '納品予定日は発注日以降にしてください' using errcode = '22023';
  end if;
  if p_key is not null then
    -- 同じキーの作成が同時に届いたときに1つずつ処理する
    perform pg_advisory_xact_lock(hashtext(v_org::text || ':' || p_key));
    select array_agg(id order by number) into v_ids from public.purchase_orders where organization_id = v_org and idempotency_key = p_key;
    if v_ids is not null then
      return v_ids;
    end if;
  end if;
  v_ids := '{}';
  for v_group in
    select coalesce((l ->> 'supplier_id')::uuid, p.supplier_id) as supplier_id, jsonb_agg(l order by p.code) as lines
      from jsonb_array_elements(p_lines) l
      left join public.products p on p.organization_id = v_org and p.id = (l ->> 'product_id')::uuid
     group by 1
     order by 1
  loop
    if v_group.supplier_id is null then
      raise exception '仕入先が決まっていない商品があります（商品管理で仕入先を設定してください）' using errcode = '23514';
    end if;
    if not exists (select 1 from public.suppliers where organization_id = v_org and id = v_group.supplier_id) then
      raise exception '仕入先が見つかりません' using errcode = 'P0002';
    end if;
    insert into public.purchase_orders (organization_id, number, supplier_id, status, order_on, expected_on, notes, ordered_at, idempotency_key, created_by)
    values (v_org, app_private.next_po_number(v_org, p_order_on), v_group.supplier_id, p_status, p_order_on, p_expected_on,
            left(coalesce(p_notes, ''), 500), case when p_status = 'ordered' then now() end, p_key, auth.uid())
    returning id into v_po;
    perform app_private.insert_po_lines(v_org, v_po, v_group.lines);
    perform app_private.audit(v_org, 'po.create', 'purchase_order', v_po, jsonb_build_object('status', p_status));
    v_ids := v_ids || v_po;
  end loop;
  return v_ids;
end $$;

-- 下書きの編集（明細を入れ替える）。発注済のあとは納品予定日と備考だけ変えられる
create or replace function public.update_purchase_order(p_po uuid, p_expected_on date, p_notes text, p_lines jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := app_private.require_role(array['admin', 'staff']::public.org_role[]);
  v_po public.purchase_orders;
begin
  select * into v_po from public.purchase_orders where organization_id = v_org and id = p_po for update;
  if v_po.id is null then
    raise exception '発注書が見つかりません' using errcode = 'P0002';
  end if;
  if v_po.status in ('received', 'cancelled') then
    raise exception '入荷完了・キャンセルの発注書は変更できません' using errcode = '23514';
  end if;
  if p_expected_on is not null and p_expected_on < v_po.order_on then
    raise exception '納品予定日は発注日以降にしてください' using errcode = '22023';
  end if;
  if p_lines is not null then
    if v_po.status <> 'draft' then
      raise exception '発注済の明細は変更できません' using errcode = '23514';
    end if;
    if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
      raise exception '明細を1行以上入力してください' using errcode = '22023';
    end if;
    delete from public.purchase_order_items where organization_id = v_org and purchase_order_id = p_po;
    perform app_private.insert_po_lines(v_org, p_po, p_lines);
  end if;
  update public.purchase_orders set expected_on = p_expected_on, notes = left(coalesce(p_notes, ''), 500)
   where organization_id = v_org and id = p_po;
  perform app_private.audit(v_org, 'po.update', 'purchase_order', p_po, jsonb_build_object('lines_changed', p_lines is not null));
end $$;

-- 下書き → 発注済
create or replace function public.place_purchase_order(p_po uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := app_private.require_role(array['admin', 'staff']::public.org_role[]);
  v_po public.purchase_orders;
begin
  select * into v_po from public.purchase_orders where organization_id = v_org and id = p_po for update;
  if v_po.id is null then
    raise exception '発注書が見つかりません' using errcode = 'P0002';
  end if;
  if v_po.status = 'ordered' then
    return; -- 二度押しは何もしない
  end if;
  if v_po.status <> 'draft' then
    raise exception '下書きの発注書だけ発注できます' using errcode = '23514';
  end if;
  if not exists (select 1 from public.purchase_order_items where organization_id = v_org and purchase_order_id = p_po) then
    raise exception '明細がありません' using errcode = '23514';
  end if;
  update public.purchase_orders set status = 'ordered', ordered_at = now() where organization_id = v_org and id = p_po;
  perform app_private.audit(v_org, 'po.order', 'purchase_order', p_po);
end $$;

-- キャンセル（入荷が1件もないものだけ）
create or replace function public.cancel_purchase_order(p_po uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := app_private.require_role(array['admin', 'staff']::public.org_role[]);
  v_po public.purchase_orders;
begin
  select * into v_po from public.purchase_orders where organization_id = v_org and id = p_po for update;
  if v_po.id is null then
    raise exception '発注書が見つかりません' using errcode = 'P0002';
  end if;
  if v_po.status = 'cancelled' then
    return;
  end if;
  if v_po.status not in ('draft', 'ordered') then
    raise exception '入荷済みの商品があるためキャンセルできません' using errcode = '23514';
  end if;
  update public.purchase_orders set status = 'cancelled', cancelled_at = now(), cancel_reason = left(coalesce(p_reason, ''), 200)
   where organization_id = v_org and id = p_po;
  perform app_private.audit(v_org, 'po.cancel', 'purchase_order', p_po, jsonb_build_object('reason', p_reason));
end $$;

-- 入荷登録（管理者・担当者）。在庫・入出庫履歴・発注残・ステータスを1つのトランザクションで更新する。
--   p_lines：[{item_id, quantity}]。同じ p_key は1回だけ処理する（2回目は1回目の入荷 ID を返す）
create or replace function public.receive_purchase_order(p_po uuid, p_lines jsonb, p_received_on date, p_note text, p_key text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := app_private.require_role(array['admin', 'staff']::public.org_role[]);
  v_po public.purchase_orders;
  v_receipt uuid;
  v_line jsonb;
  v_item record;
  v_qty numeric;
  v_ri uuid;
  v_count integer := 0;
begin
  if p_key is null or char_length(p_key) < 8 then
    raise exception '登録キーが正しくありません' using errcode = '22023';
  end if;
  -- 発注書をロックしてから二重登録を確かめる（同じ発注書の入荷は1件ずつ処理される）
  select * into v_po from public.purchase_orders where organization_id = v_org and id = p_po for update;
  if v_po.id is null then
    raise exception '発注書が見つかりません' using errcode = 'P0002';
  end if;
  select id into v_receipt from public.stock_receipts where organization_id = v_org and idempotency_key = p_key;
  if v_receipt is not null then
    return v_receipt;
  end if;
  if v_po.status not in ('ordered', 'partial') then
    raise exception '発注済・一部入荷の発注書だけ入荷登録できます' using errcode = '23514';
  end if;
  perform app_private.check_business_date(v_org, p_received_on);
  if p_received_on < v_po.order_on then
    raise exception '入荷日は発注日以降にしてください' using errcode = '22023';
  end if;
  insert into public.stock_receipts (organization_id, purchase_order_id, received_on, note, idempotency_key, created_by)
  values (v_org, p_po, p_received_on, left(coalesce(p_note, ''), 200), p_key, auth.uid())
  returning id into v_receipt;

  for v_line in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    v_qty := (v_line ->> 'quantity')::numeric;
    if v_qty is null or v_qty = 0 then
      continue;
    end if;
    select i.*, p.name as product_name into v_item
      from public.purchase_order_items i join public.products p on p.organization_id = i.organization_id and p.id = i.product_id
     where i.organization_id = v_org and i.purchase_order_id = p_po and i.id = (v_line ->> 'item_id')::uuid
       for update of i;
    if v_item.id is null then
      raise exception '発注の明細が見つかりません' using errcode = 'P0002';
    end if;
    if v_qty < 0 then
      raise exception '「%」の入荷数は0より大きい数を入力してください', v_item.product_name using errcode = '22023';
    end if;
    if v_item.received_qty + v_qty > v_item.quantity then
      raise exception '「%」は発注数量を超えて入荷できません（残り%）', v_item.product_name,
        app_private.fmt_qty(v_item.quantity - v_item.received_qty) || v_item.unit using errcode = '23514';
    end if;
    insert into public.stock_receipt_items (organization_id, receipt_id, purchase_order_item_id, quantity)
    values (v_org, v_receipt, v_item.id, v_qty) returning id into v_ri;
    perform app_private.apply_movement(v_org, v_item.product_id, 'receipt', v_qty, p_received_on,
              left('入荷 ' || v_po.number, 200), null, null, v_ri);
    update public.purchase_order_items set received_qty = received_qty + v_qty where organization_id = v_org and id = v_item.id;
    v_count := v_count + 1;
  end loop;
  if v_count = 0 then
    raise exception '入荷数を入力してください' using errcode = '22023';
  end if;
  update public.purchase_orders po
     set status = case when not exists (select 1 from public.purchase_order_items i
                                         where i.organization_id = v_org and i.purchase_order_id = p_po and i.received_qty < i.quantity)
                       then 'received'::public.po_status else 'partial'::public.po_status end
   where po.organization_id = v_org and po.id = p_po;
  perform app_private.audit(v_org, 'po.receive', 'purchase_order', p_po, jsonb_build_object('receipt_id', v_receipt, 'lines', v_count));
  return v_receipt;
end $$;

-- 発注書 PDF を Storage に保存した場所を記録する
create or replace function public.record_po_pdf(p_po uuid, p_path text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := app_private.require_role(array['admin', 'staff']::public.org_role[]);
begin
  if p_path !~ ('^' || v_org::text || '/[A-Za-z0-9_.-]+\.pdf$') then
    raise exception '保存先が正しくありません' using errcode = '22023';
  end if;
  update public.purchase_orders set pdf_path = p_path, pdf_saved_at = now() where organization_id = v_org and id = p_po;
end $$;

-- ---------------------------------------------------------------
-- CSV の取込（管理者）。アプリで検証したあと、DB でももう一度検証して登録する
-- ---------------------------------------------------------------
-- 商品マスタ：商品コードが同じなら更新、無ければ追加。カテゴリ・仕入先は名前で探し、無ければ作る。在庫は変えない
create or replace function public.import_products(p_rows jsonb, p_file_name text, p_file_hash text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := app_private.require_role(array['admin']::public.org_role[]);
  v_row jsonb;
  v_n integer := 0;
  v_ins integer := 0;
  v_upd integer := 0;
  v_cat uuid;
  v_sup uuid;
  v_inserted boolean;
  v_job uuid;
begin
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception '取り込む行がありません' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rows) > 5000 then
    raise exception '一度に取り込めるのは5,000行までです' using errcode = '22023';
  end if;
  for v_row in select * from jsonb_array_elements(p_rows) loop
    v_n := v_n + 1;
    if coalesce(trim(v_row ->> 'code'), '') = '' or coalesce(trim(v_row ->> 'name'), '') = '' then
      raise exception '%行目：商品コードと商品名は必須です', v_n using errcode = '22023';
    end if;
    v_cat := null;
    v_sup := null;
    if coalesce(trim(v_row ->> 'category'), '') <> '' then
      insert into public.categories (organization_id, name) values (v_org, trim(v_row ->> 'category'))
      on conflict (organization_id, name) do update set name = excluded.name returning id into v_cat;
    end if;
    if coalesce(trim(v_row ->> 'supplier'), '') <> '' then
      insert into public.suppliers (organization_id, name) values (v_org, trim(v_row ->> 'supplier'))
      on conflict (organization_id, name) do update set name = excluded.name returning id into v_sup;
    end if;
    begin
      insert into public.products as p (organization_id, code, name, category_id, unit, supplier_id, unit_cost, reorder_point, target_stock,
                                   order_lot, min_order_qty, location, notes)
      values (v_org, trim(v_row ->> 'code'), trim(v_row ->> 'name'), v_cat, coalesce(nullif(trim(v_row ->> 'unit'), ''), '個'), v_sup,
              coalesce((v_row ->> 'unit_cost')::numeric, 0), coalesce((v_row ->> 'reorder_point')::numeric, 0),
              coalesce((v_row ->> 'target_stock')::numeric, coalesce((v_row ->> 'reorder_point')::numeric, 0)),
              coalesce((v_row ->> 'order_lot')::numeric, 1), coalesce((v_row ->> 'min_order_qty')::numeric, 0),
              coalesce(v_row ->> 'location', ''), coalesce(v_row ->> 'notes', ''))
      on conflict (organization_id, code) do update set
        name = excluded.name, category_id = coalesce(excluded.category_id, p.category_id), unit = excluded.unit,
        supplier_id = coalesce(excluded.supplier_id, p.supplier_id), unit_cost = excluded.unit_cost,
        reorder_point = excluded.reorder_point, target_stock = excluded.target_stock, order_lot = excluded.order_lot,
        min_order_qty = excluded.min_order_qty, location = excluded.location, notes = excluded.notes, is_active = true
      returning (xmax = 0) into v_inserted;
    exception
      when check_violation then
        raise exception '%行目：数値の範囲が正しくありません（目標在庫は発注点以上、発注単位は0より大きい数）', v_n using errcode = '23514';
      when invalid_text_representation or numeric_value_out_of_range then
        raise exception '%行目：数値の形式が正しくありません', v_n using errcode = '22023';
    end;
    if v_inserted then v_ins := v_ins + 1; else v_upd := v_upd + 1; end if;
  end loop;
  insert into public.import_jobs (organization_id, kind, file_name, file_hash, row_count, inserted_count, updated_count, created_by)
  values (v_org, 'products', left(coalesce(p_file_name, ''), 200), p_file_hash, v_n, v_ins, v_upd, auth.uid()) returning id into v_job;
  perform app_private.audit(v_org, 'import.products', 'import_job', v_job, jsonb_build_object('inserted', v_ins, 'updated', v_upd));
  return jsonb_build_object('job_id', v_job, 'rows', v_n, 'inserted', v_ins, 'updated', v_upd, 'skipped', 0);
end $$;

-- 初期在庫・入出庫履歴：同じファイルは1回だけ取り込める（再取込で在庫が二重に増えない）。
--   p_rows：[{code, quantity, occurred_on, direction?('in'|'out'), note?}]
--   初期在庫は、初期在庫が登録済みの商品を飛ばす（skipped に数える）
create or replace function public.import_stock(p_kind public.import_kind, p_rows jsonb, p_file_name text, p_file_hash text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := app_private.require_role(array['admin']::public.org_role[]);
  v_job uuid;
  v_row record;
  v_product uuid;
  v_qty numeric;
  v_date date;
  v_dir text;
  v_ins integer := 0;
  v_skip integer := 0;
  v_n integer;
begin
  if p_kind not in ('opening', 'movements') then
    raise exception '取込の種類が正しくありません' using errcode = '22023';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception '取り込む行がありません' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rows) > 5000 then
    raise exception '一度に取り込めるのは5,000行までです' using errcode = '22023';
  end if;
  v_n := jsonb_array_length(p_rows);
  begin
    insert into public.import_jobs (organization_id, kind, file_name, file_hash, row_count, created_by)
    values (v_org, p_kind, left(coalesce(p_file_name, ''), 200), p_file_hash, v_n, auth.uid()) returning id into v_job;
  exception when unique_violation then
    raise exception '同じファイルは取り込み済みです（在庫が二重に増えるのを防ぐため、2回目は取り込みません）' using errcode = '23514';
  end;
  -- 日付の古い順に適用する（出庫の前に入庫が入るように）
  for v_row in
    select r.value as j, r.ordinality as n from jsonb_array_elements(p_rows) with ordinality r
     order by (r.value ->> 'occurred_on'), r.ordinality
  loop
    select id into v_product from public.products where organization_id = v_org and code = trim(v_row.j ->> 'code');
    if v_product is null then
      raise exception '%行目：商品コード「%」が見つかりません', v_row.n, v_row.j ->> 'code' using errcode = 'P0002';
    end if;
    begin
      v_qty := (v_row.j ->> 'quantity')::numeric;
      v_date := (v_row.j ->> 'occurred_on')::date;
    exception when others then
      raise exception '%行目：数量または日付の形式が正しくありません', v_row.n using errcode = '22023';
    end;
    if v_qty is null or v_qty <= 0 then
      raise exception '%行目：数量は0より大きい数を入力してください', v_row.n using errcode = '22023';
    end if;
    if v_date is null or v_date > public.org_today(v_org) then
      raise exception '%行目：日付が正しくありません（未来日は不可）', v_row.n using errcode = '22023';
    end if;
    if p_kind = 'opening' then
      perform 1 from public.stock_balances where organization_id = v_org and product_id = v_product for update;
      if exists (select 1 from public.stock_movements where organization_id = v_org and product_id = v_product and kind = 'opening') then
        v_skip := v_skip + 1;
        continue;
      end if;
      perform app_private.apply_movement(v_org, v_product, 'opening', v_qty, v_date, '初期在庫（CSV）', null, null, null, v_job);
    else
      v_dir := lower(coalesce(v_row.j ->> 'direction', ''));
      if v_dir not in ('in', 'out') then
        raise exception '%行目：区分は「入庫」か「出庫」にしてください', v_row.n using errcode = '22023';
      end if;
      begin
        perform app_private.apply_movement(v_org, v_product, v_dir::public.movement_kind, case when v_dir = 'in' then v_qty else -v_qty end,
                  v_date, left(coalesce(v_row.j ->> 'note', ''), 200), null, null, null, v_job);
      exception when check_violation then
        raise exception '%行目：%', v_row.n, sqlerrm using errcode = '23514';
      end;
    end if;
    v_ins := v_ins + 1;
  end loop;
  update public.import_jobs set inserted_count = v_ins, skipped_count = v_skip where id = v_job;
  perform app_private.audit(v_org, 'import.' || p_kind::text, 'import_job', v_job, jsonb_build_object('inserted', v_ins, 'skipped', v_skip));
  return jsonb_build_object('job_id', v_job, 'rows', v_n, 'inserted', v_ins, 'updated', 0, 'skipped', v_skip);
end $$;
