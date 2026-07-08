import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { isAdminSession } from "@/lib/auth/admin-session";

export default async function SiteChromeLayout({ children }: { children: React.ReactNode }) {
  const isAdmin = await isAdminSession();
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader isAdmin={isAdmin} />
      <div className="flex-1">{children}</div>
      <SiteFooter />
    </div>
  );
}
