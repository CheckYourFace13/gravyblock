import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb, businesses } from "@/lib/db";
import { checkVerifyToken } from "@/lib/auth/email-verify";

export const metadata: Metadata = {
  title: "Verify email — GravyBlock",
  robots: { index: false, follow: false },
};

type Props = { searchParams: Promise<{ b?: string; e?: string; t?: string }> };

export default async function VerifyEmailPage({ searchParams }: Props) {
  const { b: businessId, e: email, t: token } = await searchParams;

  let ok = false;
  if (businessId && email && token && checkVerifyToken(businessId, email, token)) {
    const db = getDb();
    if (db) {
      await db
        .update(businesses)
        .set({ emailVerified: "true", accountEmail: email.toLowerCase() })
        .where(eq(businesses.id, businessId))
        .catch(() => {});
      ok = true;
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-20 text-center sm:px-6">
      {ok ? (
        <>
          <p className="text-4xl">✅</p>
          <h1 className="mt-3 text-2xl font-semibold text-zinc-900">Email confirmed</h1>
          <p className="mt-2 text-zinc-600">Thanks — your account email is verified. You&apos;re all set.</p>
          {businessId && (
            <Link href={`/workspace/${businessId}`} className="mt-6 inline-block rounded-full bg-red-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-red-500">
              Go to my workspace →
            </Link>
          )}
        </>
      ) : (
        <>
          <p className="text-4xl">⚠️</p>
          <h1 className="mt-3 text-2xl font-semibold text-zinc-900">Link invalid or expired</h1>
          <p className="mt-2 text-zinc-600">This verification link isn&apos;t valid. You can resend it from your workspace settings.</p>
        </>
      )}
    </div>
  );
}
