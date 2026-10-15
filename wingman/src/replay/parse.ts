/**
 * Reads a saved call transcript into timed lines. Handles the shapes saved
 * transcripts usually come in:
 *
 *   - Zoom or Meet WebVTT (.vtt) with "Name: text" cues
 *   - "[00:01:23] Name: text" or "00:01:23 Name: text"
 *   - "Name  0:05" on its own line with the text below (Otter, Fireflies, Fathom)
 *   - plain "Name: text" lines, with no times at all
 *   - JSON, either [{speaker, text, start}] or Recall's [{participant, words}]
 *
 * When there are no times, they are estimated from speaking pace so the replay
 * still triggers passes the way a live call would.
 */

export interface TranscriptLine {
  speaker: string;
  text: string;
  /** Milliseconds from the start of the call. */
  atMs: number;
}

const WORDS_PER_SECOND = 2.5;
const GAP_MS = 600;
/** Long monologues are split so the replay streams them like a live call. */
const CHUNK_WORDS = 45;

interface RawLine {
  speaker: string;
  text: string;
  atMs: number | null;
}

export function parseTranscript(content: string, fileName = ""): TranscriptLine[] {
  const trimmed = content.replace(/^﻿/, "").trim();
  let raw: RawLine[];
  if (fileName.endsWith(".json") || /^(\{|\[\s*[{\]])/.test(trimmed)) raw = parseJson(trimmed);
  else if (trimmed.startsWith("WEBVTT") || /-->/.test(trimmed)) raw = parseVtt(trimmed);
  else raw = parseText(trimmed);

  return chunk(fillTimes(mergeRuns(raw.filter((l) => l.text.trim()))));
}

function parseClock(s: string): number {
  const parts = s.split(":").map((p) => parseFloat(p));
  let seconds = 0;
  for (const p of parts) seconds = seconds * 60 + p;
  return Math.round(seconds * 1000);
}

function parseJson(content: string): RawLine[] {
  const data = JSON.parse(content);
  const items: unknown[] = Array.isArray(data) ? data : (data.transcript ?? data.utterances ?? data.segments ?? []);
  const lines: RawLine[] = [];
  for (const item of items as Record<string, any>[]) {
    // Recall.ai transcript shape.
    if (item.participant && Array.isArray(item.words)) {
      const text = item.words.map((w: any) => w.text).join(" ");
      const start = item.words[0]?.start_timestamp;
      const seconds = typeof start === "number" ? start : (start?.relative ?? null);
      lines.push({ speaker: item.participant.name ?? "Unknown", text, atMs: seconds == null ? null : seconds * 1000 });
      continue;
    }
    const speaker = item.speaker ?? item.name ?? item.participant ?? "Unknown";
    const text = item.text ?? item.content ?? "";
    const start = item.start ?? item.start_time ?? item.timestamp ?? null;
    let atMs: number | null = null;
    if (typeof start === "number") atMs = start > 100000 ? start : start * 1000;
    else if (typeof start === "string" && /^\d/.test(start)) atMs = parseClock(start);
    lines.push({ speaker: String(speaker), text: String(text), atMs });
  }
  return lines;
}

function parseVtt(content: string): RawLine[] {
  const lines: RawLine[] = [];
  for (const block of content.split(/\r?\n\r?\n/)) {
    const rows = block.split(/\r?\n/);
    const timeRow = rows.findIndex((r) => r.includes("-->"));
    if (timeRow < 0) continue;
    const atMs = parseClock(rows[timeRow].split("-->")[0].trim());
    const body = rows.slice(timeRow + 1).join(" ").trim();
    const m = body.match(/^([^:]{1,60}):\s*(.*)$/);
    lines.push(m ? { speaker: m[1].trim(), text: m[2], atMs } : { speaker: "Unknown", text: body, atMs });
  }
  return lines;
}

const CLOCK = String.raw`\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?`;
const BRACKETED = new RegExp(String.raw`^\[?(${CLOCK})\]?\s+([^:]{1,60}?):\s*(.*)$`);
const NAME_THEN_CLOCK = new RegExp(String.raw`^([^:]{1,60}?)\s*[\(\[]?(${CLOCK})[\)\]]?\s*:\s*(.*)$`);
const HEADER = new RegExp(String.raw`^([A-Za-z][^:]{0,60}?)\s+(?:[-|]\s*)?[\(\[]?(${CLOCK})[\)\]]?\s*$`);
const PLAIN = /^([A-Za-z][\w .'\-]{0,40}):\s+(.*)$/;

function parseText(content: string): RawLine[] {
  const lines: RawLine[] = [];
  let pendingHeader: { speaker: string; atMs: number | null } | null = null;

  for (const row of content.split(/\r?\n/)) {
    const line = row.trim();
    if (!line) {
      pendingHeader = null;
      continue;
    }
    // Export footers like Otter's "Transcribed by https://otter.ai".
    if (/^transcribed by\b/i.test(line)) continue;
    let m = line.match(BRACKETED);
    if (m) {
      lines.push({ speaker: m[2].trim(), text: m[3], atMs: parseClock(m[1]) });
      pendingHeader = null;
      continue;
    }
    m = line.match(NAME_THEN_CLOCK);
    if (m) {
      lines.push({ speaker: m[1].trim(), text: m[3], atMs: parseClock(m[2]) });
      pendingHeader = null;
      continue;
    }
    m = line.match(HEADER);
    if (m) {
      pendingHeader = { speaker: m[1].trim(), atMs: parseClock(m[2]) };
      continue;
    }
    if (pendingHeader) {
      lines.push({ speaker: pendingHeader.speaker, text: line, atMs: pendingHeader.atMs });
      // Later lines under the same header continue the same turn.
      pendingHeader.atMs = null;
      continue;
    }
    m = line.match(PLAIN);
    if (m) {
      lines.push({ speaker: m[1].trim(), text: m[2], atMs: null });
      continue;
    }
    // A wrapped continuation of the previous line.
    const prev = lines[lines.length - 1];
    if (prev) prev.text += ` ${line}`;
  }
  return lines;
}

/** Back-to-back lines from the same speaker are one turn. */
function mergeRuns(lines: RawLine[]): RawLine[] {
  const out: RawLine[] = [];
  for (const line of lines) {
    const prev = out[out.length - 1];
    if (prev && prev.speaker === line.speaker) prev.text = `${prev.text} ${line.text.trim()}`;
    else out.push({ ...line, text: line.text.trim() });
  }
  return out;
}

function speakingMs(text: string): number {
  return (text.split(/\s+/).length / WORDS_PER_SECOND) * 1000;
}

function fillTimes(lines: RawLine[]): TranscriptLine[] {
  const out: TranscriptLine[] = [];
  let lastAt = 0;
  let estimate = 0;
  for (const line of lines) {
    // A real timestamp wins as long as it does not go backwards.
    const atMs = line.atMs != null && line.atMs >= lastAt ? line.atMs : Math.max(estimate, lastAt);
    out.push({ speaker: line.speaker, text: line.text, atMs });
    lastAt = atMs;
    estimate = atMs + speakingMs(line.text) + GAP_MS;
  }
  return out;
}

function chunk(lines: TranscriptLine[]): TranscriptLine[] {
  const out: TranscriptLine[] = [];
  for (const line of lines) {
    const words = line.text.split(/\s+/);
    if (words.length <= CHUNK_WORDS * 1.5) {
      out.push(line);
      continue;
    }
    // Split at sentence ends near the chunk size, so a chunk reads naturally.
    const sentences = line.text.match(/[^.?!]+[.?!]+["')\]]*\s*|[^.?!]+$/g) ?? [line.text];
    let buf = "";
    let at = line.atMs;
    for (const sentence of sentences) {
      buf += sentence;
      if (buf.split(/\s+/).filter(Boolean).length >= CHUNK_WORDS) {
        out.push({ speaker: line.speaker, text: buf.trim(), atMs: Math.round(at) });
        at += speakingMs(buf);
        buf = "";
      }
    }
    if (buf.trim()) out.push({ speaker: line.speaker, text: buf.trim(), atMs: Math.round(at) });
  }
  return out;
}

/**
 * Guess which speaker is the rep when no name was given. The rep is usually
 * the one asking the most questions on a discovery call.
 */
export function guessRep(lines: TranscriptLine[]): string | null {
  const questions = new Map<string, number>();
  for (const l of lines) questions.set(l.speaker, (questions.get(l.speaker) ?? 0) + (l.text.match(/\?/g)?.length ?? 0));
  let best: string | null = null;
  let bestCount = 0;
  for (const [speaker, count] of questions) {
    if (count > bestCount) {
      best = speaker;
      bestCount = count;
    }
  }
  return best;
}

export function speakers(lines: TranscriptLine[]): string[] {
  return [...new Set(lines.map((l) => l.speaker))];
}
