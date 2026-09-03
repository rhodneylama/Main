import { listPersonas } from "@/lib/db";
import PersonaManager from "@/components/PersonaManager";

// Reads the database on every request — prerendering this would freeze the
// page at build-time data.
export const dynamic = "force-dynamic";

export default function PersonasPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Prospects</h1>
        <p className="mt-1 text-sm text-muted">
          Six prospects ship with the app, from a friendly ops lead to an IT director who wants
          you off the phone. Add your own to mirror the buyers your team actually calls.
        </p>
      </div>
      <PersonaManager initial={listPersonas()} />
    </div>
  );
}
