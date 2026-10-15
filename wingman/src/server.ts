import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { claudeBrain, mockBrain } from "./brain/index.js";
import { config, hasCredentials } from "./config.js";
import { callExists, listCalls, storedEvents } from "./db.js";
import type { CallSession } from "./loop/session.js";
import { startReplay } from "./replay/run.js";
import type { WingmanEvent } from "./types.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(here, "../public");
const samplesDir = path.resolve(config.samplesDir);

/** Calls running in this process, so the page can follow them live. */
const active = new Map<string, CallSession>();

const app = express();
app.use(express.json());
app.use(express.static(publicDir));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, model: config.model, credentials: hasCredentials() });
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
    active.set(id, replay.session);
    replay.done.finally(() => setTimeout(() => active.delete(id), 60_000));
    res.json({ id, repNotice: replay.repNotice });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

/** Server-sent events. Replays everything so far, then follows the call live. */
app.get("/api/calls/:id/stream", (req, res) => {
  const { id } = req.params;
  const session = active.get(id);
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

app.listen(config.port, () => {
  console.log(`Wingman listening on http://localhost:${config.port}`);
  if (!hasCredentials()) console.log("ANTHROPIC_API_KEY is not set. Only mock replays will work.");
});
