import Link from "next/link";
import { redirect } from "next/navigation";
import { adminLogoutAction } from "@/app/actions/admin-login";
import { isAdminSession } from "@/lib/auth/admin-session";

export const dynamic = "force-dynamic";

export default async function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  const ok = await isAdminSession();
  if (!ok) redirect("/admin/login");

  return (
    <div className="min-h-dvh bg-zinc-50 text-zinc-900">
      <div className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-6 text-sm font-semibold">
            <Link href="/admin" className="text-zinc-900">
              Overview
            </Link>
            <Link href="/admin/reports" className="text-zinc-600 hover:text-zinc-900">
              Reports
            </Link>
            <Link href="/admin/leads" className="text-zinc-600 hover:text-zinc-900">
              Leads
            </Link>
            <Link href="/admin/businesses" className="text-zinc-600 hover:text-zinc-900">
              Businesses
            </Link>
            <Link href="/admin/brands" className="text-zinc-600 hover:text-zinc-900">
              Brands
            </Link>
            <Link href="/admin/locations" className="text-zinc-600 hover:text-zinc-900">
              Locations
            </Link>
            <Link href="/admin/autopilot" className="text-zinc-600 hover:text-zinc-900">
              Autopilot
            </Link>
            <Link href="/" className="hidden text-zinc-500 hover:text-zinc-900 sm:inline">
              Marketing site
            </Link>
          </div>
          <form action={adminLogoutAction}>
            <button
              type="submit"
              className="text-sm font-medium text-zinc-600 underline-offset-4 hover:text-zinc-900 hover:underline"
            >
              Log out
            </button>
          </form>
        </div>
      </div>
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">{children}</div>
    </div>
  );
}
