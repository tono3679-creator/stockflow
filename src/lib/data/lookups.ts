import "server-only";
import type { Tx } from "@/lib/db";
import type { PickerProduct } from "@/components/stock/product-picker";

/** 入出庫・発注で選べる商品（有効なものだけ） */
export async function pickerProducts(tx: Tx): Promise<PickerProduct[]> {
  const rows = await tx<{ id: string; code: string; name: string; unit: string; on_hand: number }[]>`
    select p.id, p.code, p.name, p.unit, b.on_hand from products p
      join stock_balances b on b.organization_id = p.organization_id and b.product_id = p.id
     where p.is_active order by p.code`;
  return rows.map((r) => ({ id: r.id, code: r.code, name: r.name, unit: r.unit, onHand: r.on_hand }));
}

export async function supplierOptions(tx: Tx): Promise<{ id: string; name: string }[]> {
  return tx<{ id: string; name: string }[]>`select id, name from suppliers where is_active order by name`;
}

export async function categoryOptions(tx: Tx): Promise<{ id: string; name: string }[]> {
  return tx<{ id: string; name: string }[]>`select id, name from categories order by sort_order, name`;
}
