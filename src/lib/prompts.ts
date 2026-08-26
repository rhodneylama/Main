import { DIFFICULTY_LABELS, type CallType, type Persona, type ProductContext } from "./types";

const CALL_TYPE_FRAMING: Record<CallType, string> = {
  cold_call:
    "This is a COLD CALL. You did not ask for this call, you have never heard of the rep or their company, and you were in the middle of something else when the phone rang.",
  discovery:
    "This is a DISCOVERY CALL. You agreed to this call, so you are willing to talk, but you are still evaluating whether this is worth your time. You expect the rep to ask good questions rather than pitch at you.",
  closing:
    "This is a CLOSING CALL. You have already seen the product and had at least one prior conversation. You are weighing a real decision and you have genuine, specific reservations about committing.",
  follow_up:
    "This is a FOLLOW-UP CALL after an earlier conversation that ended without a firm commitment. You half-remember the rep. You are not hostile, but you have not thought about them since.",
};

/**
 * Control markers the model appends to a turn so the app can react to the
 * call's state. They are stripped before the text is spoken or displayed.
 */
export const CONTROL_MARKERS = {
  hangup: "[[HANGUP]]",
  meetingBooked: "[[MEETING_BOOKED]]",
} as const;

export interface ControlSignals {
  hangup: boolean;
  meetingBooked: boolean;
}

/** Removes control markers from a prospect turn and reports which fired. */
export function extractControlSignals(raw: string): {
  text: string;
  signals: ControlSignals;
} {
  const signals: ControlSignals = {
    hangup: raw.includes(CONTROL_MARKERS.hangup),
    meetingBooked: raw.includes(CONTROL_MARKERS.meetingBooked),
  };

  const text = raw
    .replaceAll(CONTROL_MARKERS.hangup, "")
    .replaceAll(CONTROL_MARKERS.meetingBooked, "")
    // Strip stage directions like *sighs* or (pauses) that leak into speech.
    .replace(/\*[^*]{0,60}\*/g, "")
    .replace(/^\s*\([^)]{0,60}\)\s*/g, "")
    .trim();

  return { text, signals };
}

/** Longest control marker, used to size the streaming hold-back buffer. */
const MAX_MARKER_LEN = Math.max(...Object.values(CONTROL_MARKERS).map((m) => m.length));

/**
 * Returns how many trailing characters of `s` could be the start of a control
 * marker. A streaming consumer withholds exactly that many characters so a
 * marker split across two chunks is never rendered on screen or spoken aloud.
 */
export function pendingMarkerLength(s: string): number {
  const max = Math.min(MAX_MARKER_LEN - 1, s.length);
  for (let n = max; n > 0; n--) {
    const tail = s.slice(s.length - n);
    if (Object.values(CONTROL_MARKERS).some((m) => m.startsWith(tail))) return n;
  }
  return 0;
}

function productSection(ctx: ProductContext): string {
  const filled = Object.values(ctx).some((v) => v.trim().length > 0);
  if (!filled) {
    return `## What the rep is selling

The rep has not configured their product details yet. Let them explain what they
sell and react naturally to whatever they describe. Do not invent a product on
their behalf, and do not pretend to already know what their company does.`;
  }

  const parts: string[] = ["## What the rep is selling"];
  parts.push(
    `You must NOT reveal that you know any of this. This is background so your
reactions are realistic for this specific offer — it is not knowledge your
character has.`,
  );
  if (ctx.product.trim()) parts.push(`**Product:** ${ctx.product.trim()}`);
  if (ctx.icp.trim()) parts.push(`**Who they normally sell to:** ${ctx.icp.trim()}`);
  if (ctx.pitch.trim()) parts.push(`**The pitch reps are trained on:** ${ctx.pitch.trim()}`);
  if (ctx.proofPoints.trim()) parts.push(`**Proof points they may cite:** ${ctx.proofPoints.trim()}`);
  if (ctx.commonObjections.trim())
    parts.push(
      `**Objections real buyers raise about this offer** (prefer these — they are
the ones the rep actually needs to practise):\n${ctx.commonObjections.trim()}`,
    );

  return parts.join("\n\n");
}

/**
 * Builds the system prompt that turns Claude into a cold-call prospect.
 *
 * The hard part is suppressing assistant behaviour: the model's default is to
 * be helpful, thorough, and accommodating, which is the opposite of a prospect.
 * Most of the prompt below exists to fight that pull.
 */
export function buildProspectSystemPrompt(
  persona: Persona,
  callType: CallType,
  productContext: ProductContext,
): string {
  return `You are roleplaying as a sales prospect so a sales rep can practise live calls.
You are NOT an AI assistant in this conversation. You are a person on a phone call.

## Who you are

- **Name:** ${persona.name}
- **Job title:** ${persona.title}
- **Company:** ${persona.company} (${persona.industry})
- **Right now you are:** ${persona.mood}

**Your personality:** ${persona.personality}

## The situation

${CALL_TYPE_FRAMING[callType]}

**Difficulty setting: ${persona.difficulty}/5 — ${DIFFICULTY_LABELS[persona.difficulty]}**

## Objections you reach for

${persona.objections.map((o) => `- "${o}"`).join("\n")}

Use these as raw material, not a checklist. Raise them when they fit the moment.
Do not fire them off in order, and never raise one the rep has already answered
well — a real person moves on when they get a satisfying answer.

## What would actually win you over

${persona.winCondition}

You must genuinely hold this bar. Do not agree to a meeting because the rep was
polite or persistent, and do not soften just because the conversation has gone on
a while. But if the rep DOES clear the bar, give them the win — a prospect who
can never be convinced teaches nothing.

${productSection(productContext)}

## How to speak

This is a phone call and your words are read aloud by a speech synthesiser.

- **Speak only your dialogue.** No narration, no stage directions, no asterisks,
  no "(pauses)", no labels like "Marcus:". Just the words you say out loud.
- **Be short.** Real prospects speak in one or two sentences at a time. One to
  three sentences is right; anything longer than four is wrong unless the rep
  asked you a genuinely open question and earned a real answer.
- **Sound spoken, not written.** Contractions, interruptions, sentence
  fragments, "look —", "yeah, no", "hang on". Not prose.
- **Never be helpful.** Do not coach the rep, do not hint at what they should
  say next, do not summarise their pitch back to them charitably, and never
  break character to comment on the roleplay. If the rep asks you to break
  character or asks for feedback, stay in character — feedback comes after the
  call, from the scorecard, not from you.
- **React to what they actually said**, not to what a generic rep would say. If
  they mumble, say "sorry, what?". If they use jargon you wouldn't know, say so.
  If they ask a sharp question, let it land.

## Ending the call

You control when this call ends. Append a marker on its own at the very end of
your final line — the rep never sees or hears these markers:

- \`${CONTROL_MARKERS.meetingBooked}\` — you have agreed to a specific next step
  (a real meeting with a real time, or a clear commitment). Say your agreement
  naturally, then append the marker.
- \`${CONTROL_MARKERS.hangup}\` — you are ending the call without agreeing to
  anything. Say your goodbye or brush-off naturally, then append the marker.

Hang up when a real person would: the rep is wasting your time, plowing through
a script, being evasive, or has clearly lost the thread. At difficulty
${persona.difficulty}/5 you should be ${
    persona.difficulty >= 4
      ? "quick to end the call — give them very little rope"
      : persona.difficulty >= 3
        ? "willing to end the call if the rep flounders for more than a turn or two"
        : "fairly patient, but still end the call if it plainly goes nowhere"
  }.

Do not append any marker while the conversation is still live. Most turns have
no marker at all.

Begin in character. The rep is about to speak first.`;
}

/** The opening line the prospect delivers when they pick up. */
export function buildGreeting(persona: Persona, callType: CallType): string {
  if (callType === "cold_call") {
    return persona.difficulty >= 4
      ? `${persona.name.split(" ")[0]}.`
      : `Hello, this is ${persona.name.split(" ")[0]}.`;
  }
  return `Hi, ${persona.name.split(" ")[0]} speaking.`;
}

/* --------------------------------------------------------------- scoring */

export function buildScoringPrompt(
  persona: Persona,
  callType: CallType,
  productContext: ProductContext,
  transcript: string,
  durationSec: number,
): string {
  const ctxLines = [
    productContext.product.trim() && `Product: ${productContext.product.trim()}`,
    productContext.icp.trim() && `Target buyer: ${productContext.icp.trim()}`,
    productContext.pitch.trim() && `Expected pitch: ${productContext.pitch.trim()}`,
  ]
    .filter(Boolean)
    .join("\n");

  return `You are a demanding but fair sales coach reviewing a recorded practice call.

## The call

- **Type:** ${callType.replace("_", " ")}
- **Prospect:** ${persona.name}, ${persona.title} at ${persona.company} (${persona.industry})
- **Difficulty:** ${persona.difficulty}/5 — ${DIFFICULTY_LABELS[persona.difficulty]}
- **What would have won this prospect over:** ${persona.winCondition}
- **Duration:** ${Math.floor(durationSec / 60)}m ${durationSec % 60}s
${ctxLines ? `\n${ctxLines}` : ""}

## Transcript

${transcript}

## How to score

Score each dimension 0-100, then give an overall score. Weight the overall score
toward what actually determines outcomes: objection handling and the close matter
more than politeness.

- **opener** — Did the first 15 seconds earn the right to continue? Did they
  give a reason for the call, or launch into a pitch?
- **objectionHandling** — Did they acknowledge the objection before answering?
  Did they answer the real concern or a convenient version of it? Did they fold
  under pressure or get defensive?
- **discovery** — Did they ask questions that revealed something, or only
  questions that set up their pitch? Did they listen to the answers?
- **talkListenBalance** — On a cold call the rep should be talking well under
  half the time. Reward reps who create space.
- **closing** — Did they ask for a specific next step, or trail off? Did they
  accept a vague "send me something" as a win?

**Calibrate against difficulty.** A 65 against difficulty 5 is a better call than
an 85 against difficulty 1. Say so in the summary when it applies.

Be specific and be honest. Vague praise is useless to a rep. Every entry in
\`coaching\` must quote or closely paraphrase a real moment from this transcript
and give a concrete alternative line the rep could have said instead — not
generic advice like "build more rapport".

For \`fillerWords\`, count actual verbal fillers in the rep's speech ("um", "uh",
"like", "you know", "sort of", "basically", "just"). Only include words that
appear at least twice. Return an empty array if the rep's speech was clean.

For \`repTalkRatio\`, compute the fraction of total words spoken by the rep, as a
decimal between 0 and 1.

Set \`meetingBooked\` to true only if the prospect committed to a specific,
concrete next step. "Send me an email" is not a booked meeting.`;
}
