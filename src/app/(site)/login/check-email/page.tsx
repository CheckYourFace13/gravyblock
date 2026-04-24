import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";

export default function CheckEmailPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-gradient-to-b from-zinc-100 to-white px-4 py-10">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center pb-12">
        <div className="rounded-3xl border border-zinc-200 bg-white p-8 shadow-xl shadow-zinc-200/80">
          <BrandMark compact href="/" />
          <h1 className="mt-5 text-2xl font-semibold tracking-tight text-zinc-900">Check your email</h1>
          <p className="mt-2 text-sm leading-relaxed text-zinc-600">
            We sent a secure sign-in link. Use this link to open your GravyBlock dashboard. No password required.
          </p>
          <div className="mt-6 text-sm text-zinc-700">
            Didn&apos;t get it?{" "}
            <Link href="/login" className="font-semibold text-red-800 hover:underline">
              Send a new link
            </Link>
            .
          </div>
        </div>
      </div>
    </div>
  );
}

