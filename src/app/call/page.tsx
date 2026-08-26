import { notFound } from "next/navigation";
import { getPersona } from "@/lib/db";
import CallConsole from "@/components/CallConsole";
import type { CallType } from "@/lib/types";

const VALID_TYPES: CallType[] = ["cold_call", "discovery", "closing", "follow_up"];

export default async function CallPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const personaId = typeof params.persona === "string" ? params.persona : "";
  const rep = typeof params.rep === "string" ? params.rep : "";
  const rawType = typeof params.type === "string" ? params.type : "cold_call";

  const persona = personaId ? getPersona(personaId) : null;
  const callType = VALID_TYPES.includes(rawType as CallType)
    ? (rawType as CallType)
    : "cold_call";

  if (!persona || !rep.trim()) notFound();

  return (
    <CallConsole
      persona={persona}
      callType={callType}
      repName={rep.trim()}
      allowBargeIn={params.bargeIn === "true"}
    />
  );
}
