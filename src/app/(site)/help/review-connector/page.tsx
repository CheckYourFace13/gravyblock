import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Review connector | GravyBlock",
  robots: { index: false, follow: false },
};

const example = `{
  "externalId": "order-10432",
  "email": "customer@example.com",
  "name": "Pat Smith",
  "completedAt": "2026-09-20T15:30:00Z"
}`;

export default function ReviewConnectorHelp() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12 text-zinc-800">
      <h1 className="text-2xl font-semibold text-zinc-900">Review connector</h1>
      <p className="mt-3 text-sm leading-relaxed">
        Send GravyBlock each customer whose job or purchase is complete, from Zapier, a webhook, or your
        point-of-sale system. We email each of them one neutral request to review your business on Google.
      </p>

      <h2 className="mt-8 text-lg font-semibold text-zinc-900">Webhook URL</h2>
      <pre className="mt-2 overflow-x-auto rounded-lg bg-zinc-100 p-3 text-xs">
POST https://gravyblock.com/api/connect/transactions/&lt;token&gt;
      </pre>
      <p className="mt-2 text-sm">Your private token is in your workspace. Keep it secret.</p>

      <h2 className="mt-8 text-lg font-semibold text-zinc-900">Request body</h2>
      <p className="mt-2 text-sm">
        One object, or an array of up to 50. Only <code>externalId</code> and <code>email</code> are required.
        Sending the same <code>externalId</code> twice is safe.
      </p>
      <pre className="mt-2 overflow-x-auto rounded-lg bg-zinc-100 p-3 text-xs">{example}</pre>

      <h2 className="mt-8 text-lg font-semibold text-zinc-900">How requests are sent</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
        <li>Every completed customer gets the same request, regardless of how their experience went.</li>
        <li>No incentives, discounts, or rewards are offered for reviews.</li>
        <li>Each customer receives one email, at least an hour after completion, and at most one reminder a week later.</li>
        <li>Anyone who unsubscribes is never contacted again.</li>
      </ul>
    </main>
  );
}
