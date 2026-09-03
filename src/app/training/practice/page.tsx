import { listPersonas, getProductContext } from "@/lib/db";
import { hasCredentials } from "@/lib/anthropic";
import CallSetup from "@/components/CallSetup";
import Link from "next/link";

// Reads the database on every request — prerendering this would freeze the
// page at build-time data.
export const dynamic = "force-dynamic";

export default function HomePage() {
  const personas = listPersonas();
  const ctx = getProductContext();
  const pitchConfigured = Object.values(ctx).some((v) => v.trim().length > 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Start a practice call</h1>
        <p className="mt-1 text-sm text-muted">
          Pick a prospect, dial in, and talk. They pick up first — just like a real call.
        </p>
      </div>

      {!hasCredentials() && (
        <div className="panel border-warn/40 bg-warn/10 p-4 text-sm text-amber-200">
          <strong className="font-semibold">No API key configured.</strong> Copy{" "}
          <code className="rounded bg-ink px-1.5 py-0.5 text-xs">.env.example</code> to{" "}
          <code className="rounded bg-ink px-1.5 py-0.5 text-xs">.env.local</code>, add your
          Anthropic API key, and restart the dev server.
        </div>
      )}

      {!pitchConfigured && (
        <div className="panel p-4 text-sm text-slate-300">
          Prospects will react to whatever you pitch them. To make them push back on{" "}
          <em>your</em> actual offer, fill in{" "}
          <Link href="/settings" className="text-accent hover:underline">
            your pitch and product details
          </Link>
          .
        </div>
      )}

      <CallSetup personas={personas} />
    </div>
  );
}
