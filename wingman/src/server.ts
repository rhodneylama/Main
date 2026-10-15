import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { handleLogin, loginPage, requireAuth } from "./auth.js";
import { formatClock } from "./brain/analyze.js";
import { claudeBrain, mockBrain } from "./brain/index.js";
import { config, hasCredentials } from "./config.js";
import { callExists, getCall, getUtterances, listCalls, storedEvents } from "./db.js";
import { LiveCalls, safeEqual } from "./live/manager.js";
import type { CallSession } from "./loop/session.js";
import { isMeetingUrl, parseBotStatusEvent, parseTranscriptEvent } from "./recall/client.js";
import { startReplay } from "./replay/run.js";
import type { PostCall, WingmanEvent } from "./types.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(here, "../public");
const samplesDir = path.resolve(config.samplesDir);

if (config.publicBaseUrl && !config.password) {
  // A public server with no password lets anyone send bots and read transcripts.
  console.error("PUBLIC_BASE_URL is set but WINGMAN_PASSWORD is not. Set a password before going public.");
  process.exit(1);
}

/** Replays running in this process, so the page can follow them live. */
const replays = new Map<string, CallSession>();
const live = new LiveCalls(claudeBrain);

function activeSession(id: string): CallSession | undefined {
  return replays.get(id) ?? live.get(id);
}

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));

app.get("/login", loginPage);
app.post("/login", handleLogin);
app.use(requireAuth);
app.use(express.static(publicDir));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    model: config.model,
    credentials: hasCredentials(),
    recall: Boolean(config.recallApiKey && config.publicBaseUrl),
  });
});

app.get("/api/samples", (_req, res) => {
  const files = fs.existsSync(samplesDir)
    ? fs.readdirSync(samplesDir).filter((f) => /\.(txt|vtt|json|md|srt)$/i.test(f) && !/^readme/i.test(f))
    : [];
  res.json({ dir: samplesDir, files: files.sort() });
});

app.get("/api/calls", (_req, res) => {
  res.json({ calls: listCalls() });
});

app.get("/api/calls/:id", (req, res) => {
  const row = getCall(req.params.id);
  if (!row) {
    res.status(404).json({ error: "No such call." });
    return;
  }
  res.json({
    id: row.id,
    source: row.source,
    status: row.status,
    origin: row.origin,
    prospectCompany: row.prospect_company,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    live: Boolean(activeSession(row.id)),
    postCall: row.post_call ? (JSON.parse(row.post_call) as PostCall) : null,
  });
});

/** The full transcript as plain text. */
app.get("/api/calls/:id/transcript.txt", (req, res) => {
  const row = getCall(req.params.id);
  if (!row) {
    res.status(404).end();
    return;
  }
  const lines = getUtterances(row.id).map((u) => `[${formatClock(u.atMs)}] ${u.speaker}: ${u.text}`);
  res.type("text/plain").attachment(`${fileStem(row.prospect_company ?? row.origin)}-transcript.txt`);
  res.send(lines.join("\n") + "\n");
});

/** Summary, pains, fit and the recap draft as one text file. Nothing is sent. */
app.get("/api/calls/:id/recap.txt", (req, res) => {
  const row = getCall(req.params.id);
  if (!row?.post_call) {
    res.status(404).type("text/plain").send("No recap for this call yet.");
    return;
  }
  const post = JSON.parse(row.post_call) as PostCall;
  const state = row.final_state ? JSON.parse(row.final_state) : { pains: [], fit: [] };
  const out = [
    "SUMMARY",
    post.summary,
    "",
    "NEXT STEPS",
    ...post.nextSteps.map((s) => `- ${s}`),
    "",
    "PAINS",
    ...(state.pains as { label: string; quote: string; solution: string }[]).map(
      (p) => `- ${p.label}. "${p.quote}" ${p.solution}`,
    ),
    "",
    "SERVICE FIT",
    ...(state.fit as { service: string; reason: string }[]).map((f, i) => `${i + 1}. ${f.service}. ${f.reason}`),
    "",
    "RECAP EMAIL DRAFT (review before sending)",
    `Subject line. ${post.recapEmail.subject}`,
    "",
    post.recapEmail.body,
    "",
  ];
  res.type("text/plain").attachment(`${fileStem(row.prospect_company ?? row.origin)}-recap.txt`);
  res.send(out.join("\n"));
});

app.post("/api/replays", (req, res) => {
  const { file, rep, company, website, speed, mock } = req.body ?? {};
  // Only files that sit directly in the samples folder can be replayed.
  const name = path.basename(String(file ?? ""));
  const filePath = path.join(samplesDir, name);
  if (!name || !fs.existsSync(filePath)) {
    res.status(404).json({ error: "That transcript is not in the samples folder." });
    return;
  }
  if (!mock && !hasCredentials()) {
    res.status(400).json({ error: "ANTHROPIC_API_KEY is not set on the server." });
    return;
  }
  try {
    const replay = startReplay({
      filePath,
      brain: mock ? mockBrain() : claudeBrain,
      intervalMs: config.intervalMs,
      research: config.research,
      speed: Number(speed ?? 4),
      repNames: rep ? [String(rep)] : config.repNames,
      prospectCompany: company || null,
      prospectWebsite: website || null,
    });
    const id = replay.session.call.id;
    replays.set(id, replay.session);
    replay.done.finally(() => setTimeout(() => replays.delete(id), 60_000));
    res.json({ id, repNotice: replay.repNotice });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post("/api/live", async (req, res) => {
  const meetingUrl = String(req.body?.meetingUrl ?? "").trim();
  if (!isMeetingUrl(meetingUrl)) {
    res.status(400).json({ error: "Paste a Zoom or Google Meet link that starts with https." });
    return;
  }
  if (!hasCredentials()) {
    res.status(400).json({ error: "ANTHROPIC_API_KEY is not set on the server." });
    return;
  }
  if (!config.recallApiKey || !config.publicBaseUrl) {
    res.status(400).json({ error: "RECALL_API_KEY and PUBLIC_BASE_URL must be set for live calls." });
    return;
  }
  try {
    const session = await live.start({
      meetingUrl,
      prospectCompany: req.body?.company,
      prospectWebsite: req.body?.website,
    });
    res.json({ id: session.call.id });
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post("/api/calls/:id/end", (req, res) => {
  if (!live.get(req.params.id)) {
    res.status(404).json({ error: "That call is not live." });
    return;
  }
  void live.end(req.params.id, "Call ended from the page.");
  res.json({ ok: true });
});

/** Recall posts each finished transcript line here. The token is per call. */
app.post("/api/recall/transcript/:callId", (req, res) => {
  const line = parseTranscriptEvent(req.body);
  const token = String(req.query.token ?? "");
  if (!live.get(req.params.callId)) {
    res.status(404).end();
    return;
  }
  if (line && !live.addLine(req.params.callId, token, line)) {
    res.status(403).end();
    return;
  }
  res.status(200).end();
});

/**
 * Bot status events from the webhook set up in the Recall dashboard. Point it
 * at /api/recall/status?token=<RECALL_WEBHOOK_TOKEN>. Optional, since the End
 * call button and the silence timeout also end calls.
 */
app.post("/api/recall/status", (req, res) => {
  if (!config.recallWebhookToken || !safeEqual(String(req.query.token ?? ""), config.recallWebhookToken)) {
    res.status(403).end();
    return;
  }
  const status = parseBotStatusEvent(req.body);
  const callId = status ? live.findByBotId(status.botId) : undefined;
  if (status?.ended && callId) void live.end(callId, "The meeting ended.");
  // Recall times out after 15 seconds, so answer now and finish in the background.
  res.status(200).end();
});

/** Server-sent events. Replays everything so far, then follows the call live. */
app.get("/api/calls/:id/stream", (req, res) => {
  const { id } = req.params;
  const session = activeSession(id);
  if (!session && !callExists(id)) {
    res.status(404).end();
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  const send = (event: WingmanEvent) => res.write(`data: ${JSON.stringify(event)}\n\n`);

  for (const event of storedEvents(id)) send(event);
  if (!session) {
    res.write(`event: done\ndata: {}\n\n`);
    res.end();
    return;
  }

  session.on("event", send);
  // Proxies on Heroku and Railway drop idle connections, so keep this one warm.
  const ping = setInterval(() => res.write(": ping\n\n"), 20_000);
  req.on("close", () => {
    clearInterval(ping);
    session.off("event", send);
  });
});

function fileStem(s: string): string {
  return s.replace(/^https?:\/\//, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 60) || "call";
}

app.listen(config.port, () => {
  console.log(`Wingman listening on http://localhost:${config.port}`);
  if (!hasCredentials()) console.log("ANTHROPIC_API_KEY is not set. Only mock replays will work.");
  if (!config.recallApiKey || !config.publicBaseUrl) console.log("Live calls are off until RECALL_API_KEY and PUBLIC_BASE_URL are set.");
  if (!config.password) console.log("No WINGMAN_PASSWORD set. Fine on your own machine, not on a public server.");
});
