import { formatClock } from "../brain/analyze.js";
import type { CallSession } from "../loop/session.js";
import { DISCOVERY_FIELDS } from "../types.js";

/**
 * A markdown review of a replay. Each nudge sits right under the line it
 * followed, so you can judge whether it was the right thing at that moment.
 */
export function buildReport(session: CallSession, errors: string[]): string {
  const { call, state, utterances } = session;
  const out: string[] = [];

  out.push(`# Wingman replay of ${call.origin}`);
  out.push("");
  out.push(`- Rep speaker: ${call.repNames.join(", ")}`);
  if (call.prospectCompany) out.push(`- Prospect: ${call.prospectCompany}`);
  out.push(`- Lines: ${utterances.length}`);
  out.push(`- Analysis passes: ${session.passCount}`);
  out.push(`- Nudges shown: ${state.nudges.length}`);
  out.push(`- Research notes: ${state.research.length}`);
  const warned = state.nudges.filter((n) => n.copyWarnings.length);
  if (warned.length) out.push(`- Nudges with copy warnings: ${warned.length}`);
  if (errors.length) out.push(`- Errors: ${errors.length}`);
  out.push("");

  if (session.postCall) {
    const pc = session.postCall;
    out.push("## Summary");
    out.push("");
    out.push(pc.summary);
    out.push("");
    out.push("## Next steps");
    out.push("");
    for (const step of pc.nextSteps) out.push(`- ${step}`);
    out.push("");
    out.push("## Recap email draft");
    out.push("");
    out.push(`**${pc.recapEmail.subject}**`);
    out.push("");
    out.push(pc.recapEmail.body);
    out.push("");
  }

  out.push("## Discovery form");
  out.push("");
  for (const { key, label } of DISCOVERY_FIELDS) out.push(`- ${label}: ${state.form[key] ?? "not stated"}`);
  out.push("");

  out.push("## Pains");
  out.push("");
  if (!state.pains.length) out.push("None recorded.");
  for (const p of state.pains) out.push(`- **${p.label}** "${p.quote}" Suggested, ${p.solution}`);
  out.push("");

  out.push("## Suggested services");
  out.push("");
  if (!state.fit.length) out.push("Not enough information for a fit.");
  state.fit.forEach((f, i) => out.push(`${i + 1}. **${f.service}** ${f.reason}`));
  out.push("");

  if (state.research.length) {
    out.push("## Research");
    out.push("");
    for (const r of state.research) out.push(`- **${r.query}** (${r.kind}) ${r.summary.replace(/\n/g, " ")}`);
    out.push("");
  }

  if (errors.length) {
    out.push("## Errors");
    out.push("");
    for (const e of errors) out.push(`- ${e}`);
    out.push("");
  }

  out.push("## Transcript with nudges");
  out.push("");
  const bySeq = new Map<number, typeof state.nudges>();
  for (const n of state.nudges) bySeq.set(n.afterSeq, [...(bySeq.get(n.afterSeq) ?? []), n]);
  for (const u of utterances) {
    out.push(`**${formatClock(u.atMs)} ${u.isRep ? "REP" : "PROSPECT"} ${u.speaker}:** ${u.text}`);
    out.push("");
    for (const n of bySeq.get(u.seq) ?? []) {
      const warn = n.copyWarnings.length ? ` _(copy, ${n.copyWarnings.join("; ")})_` : "";
      out.push(`> **NUDGE [${n.kind}]** ${n.text}${warn}`);
      out.push("");
    }
  }
  return out.join("\n");
}
