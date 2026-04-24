import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { CustomerLoginForm } from "./login-form";

export default async function CustomerLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const query = await searchParams;
  const nextPath = query.next?.startsWith("/") ? query.next : "/app";

  return (
    <div className="flex min-h-dvh flex-col bg-gradient-to-b from-zinc-100 to-white px-4 py-10">
      <div className="mx-auto mb-6 w-full max-w-md">
        <Link href="/" className="text-sm font-medium text-zinc-600 hover:text-zinc-900">
          ← Back to site
        </Link>
      </div>
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center pb-12">
        <div className="rounded-3xl border border-zinc-200 bg-white p-8 shadow-xl shadow-zinc-200/80">
          <BrandMark compact href="/" />
          <h1 className="mt-5 text-2xl font-semibold tracking-tight text-zinc-900">Access your workspace</h1>
          <p className="mt-2 text-sm leading-relaxed text-zinc-600">
            Enter your email and we&apos;ll send a secure sign-in link. No password required.
          </p>
          <CustomerLoginForm nextPath={nextPath} />
        </div>
      </div>
    </div>
  );
}

