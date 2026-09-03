import Link from "next/link";
import { listMaterials } from "@/lib/training-db";
import { ensureSeeded } from "@/lib/seed-demo";
import MaterialLibrary from "@/components/MaterialLibrary";

export const dynamic = "force-dynamic";

export default function TrainingLibraryPage() {
  ensureSeeded();

  // Per-rep completion is resolved in the browser, where we know who is looking.
  const materials = listMaterials();

  return (
    <div className="space-y-5">
      <div className="panel flex flex-wrap items-center justify-between gap-3 border-accent/30 bg-accent/5 p-4">
        <div>
          <h2 className="text-sm font-semibold text-white">Practice against an AI prospect</h2>
          <p className="mt-0.5 text-sm text-muted">
            Live voice roleplay with a scored coaching card at the end. Scores pay points.
          </p>
        </div>
        <Link href="/training/practice" className="btn-primary">
          Start a call
        </Link>
      </div>

      <MaterialLibrary materials={materials} />
    </div>
  );
}
