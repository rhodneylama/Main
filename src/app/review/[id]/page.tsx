import { notFound } from "next/navigation";
import Link from "next/link";
import { getCall, getPersona } from "@/lib/db";
import ScorecardView from "@/components/ScorecardView";
import DifficultyDots from "@/components/DifficultyDots";
import { DIFFICULTY_LABELS } from "@/lib/types";

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const call = getCall(id);
  if (!call) notFound();

  const persona = getPersona(call.personaId);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Call review</h1>
          <p className="mt-1 text-sm text-muted">
            {call.repName} → {call.personaName}
            {persona && ` (${persona.title} at ${persona.company})`} ·{" "}
            {call.callType.replace("_", " ")} ·{" "}
            {Math.floor(call.durationSec / 60)}m {call.durationSec % 60}s
          </p>
          <div className="mt-2 flex items-center gap-2">
            <DifficultyDots value={call.difficulty} />
            <span className="text-xs text-muted">{DIFFICULTY_LABELS[call.difficulty]}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <Link href="/history" className="btn-ghost">
            History
          </Link>
          <Link href="/" className="btn-primary">
            Practise again
          </Link>
        </div>
      </div>

      <ScorecardView
        callId={call.id}
        initialScorecard={call.scorecard}
        transcript={call.transcript}
        prospectName={call.personaName.split(" ")[0]}
      />
    </div>
  );
}
