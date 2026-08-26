import { getProductContext } from "@/lib/db";
import PitchSettings from "@/components/PitchSettings";

// Reads the database on every request — prerendering this would freeze the
// page at build-time data.
export const dynamic = "force-dynamic";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Your pitch</h1>
        <p className="mt-1 text-sm text-muted">
          Tell the AI prospects what you actually sell, so they push back on your real offer
          instead of a generic one. Nothing here is revealed to the prospect on the call — it
          only shapes how they react.
        </p>
      </div>
      <PitchSettings initial={getProductContext()} />
    </div>
  );
}
