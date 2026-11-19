import { PageHeader } from "@/components/common/page-header";
import { CategoryEditor } from "@/components/settings/category-editor";
import { GeneralForm } from "@/components/settings/general-form";
import { MemberEditor } from "@/components/settings/member-editor";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { asCurrentUser, requireRole } from "@/lib/auth";
import type { OrgRole } from "@/lib/domain/labels";
import { formatDate } from "@/lib/format";

export const metadata = { title: "設定" };

const TABS = [["general", "会社・在庫ルール"], ["categories", "カテゴリ"], ["members", "メンバー・権限"]] as const;

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requireRole(["admin"]);
  const { tab } = await searchParams;
  const { categories, members } = await asCurrentUser(async (tx) => ({
    categories: await tx<{ id: string; name: string; product_count: number }[]>`
      select c.id, c.name, (select count(*)::int from products p where p.organization_id = c.organization_id and p.category_id = c.id) product_count
        from categories c order by c.sort_order, c.name`,
    members: await tx<{ id: string; name: string; role: OrgRole; is_active: boolean; created_at: Date }[]>`
      select m.user_id id, p.display_name "name", m.role, m.is_active, m.created_at
        from organization_members m join profiles p on p.id = m.user_id
       order by case m.role when 'admin' then 0 when 'staff' then 1 else 2 end, p.display_name`,
  }));
  const st = user.settings;
  const current = TABS.some(([k]) => k === tab) ? tab! : "general";
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="設定" />
      <Tabs defaultValue={current} className="grid min-w-0 grid-cols-1 gap-4">
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <TabsList>{TABS.map(([k, label]) => <TabsTrigger key={k} value={k}>{label}</TabsTrigger>)}</TabsList>
        </div>
        <TabsContent value="general">
          <GeneralForm initial={{
            companyName: st.companyName, postalCode: st.postalCode, address: st.address, phone: st.phone, email: st.email,
            contactName: st.contactName, poNote: st.poNote, staleDays: st.staleDays, defaultLeadDays: st.defaultLeadDays,
          }} />
        </TabsContent>
        <TabsContent value="categories">
          <CategoryEditor categories={categories.map((c) => ({ id: c.id, name: c.name, productCount: c.product_count }))} />
        </TabsContent>
        <TabsContent value="members">
          <MemberEditor
            members={members.map((m) => ({ id: m.id, name: m.name, role: m.role, isActive: m.is_active, since: formatDate(m.created_at) }))}
            currentUserId={user.userId}
            isDemo={user.isDemo}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
