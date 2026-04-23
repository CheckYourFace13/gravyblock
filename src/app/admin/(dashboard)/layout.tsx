import Link from "next/link";
import { redirect } from "next/navigation";
import { adminLogoutAction } from "@/app/actions/admin-login";
import { AdminShellNav } from "@/components/admin-shell-nav";
import { isAdminSession } from "@/lib/auth/admin-session";

export const dynamic = "force-dynamic";

export default async function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  const ok = await isAdminSession();
  if (!ok) redirect("/admin/login");

  return (
    <div className="min-h-dvh bg-zinc-100 text-zinc-900">
      <div className="flex min-h-dvh">
        <aside className="hidden w-56 shrink-0 flex-col border-r border-zinc-200 bg-white lg:flex">
          <div className="border-b border-zinc-200 px-4 py-5">
            <Link href="/admin" className="text-sm font-semibold uppercase tracking-wide text-red-800">
              Operator
            </Link>
            <p className="mt-1 text-xs text-zinc-500">GravyBlock backend</p>
          </div>
          <div className="flex-1 overflow-y-auto px-2 py-4">
            <AdminShellNav variant="sidebar" />
            <p className="mt-6 border-t border-zinc-100 px-3 pt-4 text-xs text-zinc-500">
              Social URLs and signals are on each business detail page.
            </p>
          </div>
          <div className="border-t border-zinc-200 p-3">
            <Link href="/" className="block rounded-lg px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900">
              ← Marketing site
            </Link>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="border-b border-zinc-200 bg-white">
            <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
              <details className="group relative lg:hidden">
                <summary className="cursor-pointer list-none rounded-lg border border-zinc-200 px-3 py-2 text-sm font-semibold text-zinc-800 marker:hidden [&::-webkit-details-marker]:hidden">
                  <span className="inline-flex items-center gap-2">
                    Menu
                    <span className="text-zinc-400 group-open:rotate-180">▾</span>
                  </span>
                </summary>
                <div className="absolute left-0 z-20 mt-1 w-56 rounded-xl border border-zinc-200 bg-white p-2 shadow-lg">
                  <AdminShellNav variant="mobile" />
                </div>
              </details>
              <p className="hidden text-sm font-semibold text-zinc-800 lg:block">Control center</p>
              <form action={adminLogoutAction} className="ml-auto">
                <button
                  type="submit"
                  className="rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
                >
                  Log out
                </button>
              </form>
            </div>
          </header>

          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
