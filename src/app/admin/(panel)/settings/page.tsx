import { SettingsForm } from "@/components/admin/settings-form";
import { PageTitle } from "@/components/admin/ui";
import { getStore } from "@/lib/store";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const store = await getStore();
  const [settings, festivals] = await Promise.all([store.getSettings(), store.listFestivals()]);
  return (
    <>
      <PageTitle title="Settings" sub="Homepage season, delivery and contact details" />
      <SettingsForm settings={settings} festivals={festivals} />
    </>
  );
}
