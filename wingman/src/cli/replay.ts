/**
 * Replay a saved transcript through Wingman and print the nudges as they fire.
 *
 *   npm run replay                       list the transcripts in the samples folder
 *   npm run replay -- call1.txt          replay one, as fast as Claude answers
 *   npm run replay -- --all              replay every sample
 *
 * Options
 *   --rep "Name"        speaker label for the ABU rep (default WINGMAN_REP_NAMES)
 *   --company "Name"    prospect company
 *   --website URL       prospect website
 *   --speed N           0 is as fast as possible (default), 1 is real time
 *   --interval N        seconds between passes (default WINGMAN_INTERVAL_SECONDS)
 *   --no-research       skip web lookups
 *   --mock              no API calls, checks the plumbing only
 *
 * A markdown review is written to replays/ for each run.
 */
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { formatClock } from "../brain/analyze.js";
import { claudeBrain, mockBrain } from "../brain/index.js";
import { config, hasCredentials } from "../config.js";
import { buildReport } from "../replay/report.js";
import { startReplay } from "../replay/run.js";
import type { WingmanEvent } from "../types.js";

const TRANSCRIPT_EXTENSIONS = [".txt", ".vtt", ".json", ".md", ".srt"];

const c = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  green: (s: string) => `\x1b[1;32m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
};

function listSamples(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => TRANSCRIPT_EXTENSIONS.includes(path.extname(f).toLowerCase()) && !/^readme/i.test(f))
    .sort();
}

function resolveFile(arg: string, samplesDir: string): string {
  if (fs.existsSync(arg)) return arg;
  const inSamples = path.join(samplesDir, arg);
  if (fs.existsSync(inSamples)) return inSamples;
  throw new Error(`Cannot find ${arg} here or in ${samplesDir}.`);
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      rep: { type: "string", multiple: true },
      company: { type: "string" },
      website: { type: "string" },
      speed: { type: "string", default: "0" },
      interval: { type: "string" },
      "no-research": { type: "boolean", default: false },
      mock: { type: "boolean", default: false },
      all: { type: "boolean", default: false },
      quiet: { type: "boolean", default: false },
    },
  });

  const samplesDir = path.resolve(config.samplesDir);
  const samples = listSamples(samplesDir);

  let files: string[];
  if (values.all) files = samples.map((f) => path.join(samplesDir, f));
  else if (positionals.length) files = positionals.map((p) => resolveFile(p, samplesDir));
  else {
    console.log(`Transcripts in ${samplesDir}:`);
    if (!samples.length) console.log("  none yet. Drop your saved call transcripts there.");
    for (const f of samples) console.log(`  ${f}`);
    console.log(`\nReplay one with   npm run replay -- <file> --rep "Your Name"`);
    return;
  }

  if (!values.mock && !hasCredentials()) {
    throw new Error("ANTHROPIC_API_KEY is not set. Add it to .env, or pass --mock to test the plumbing.");
  }

  for (const file of files) await replayOne(file, values);
}

async function replayOne(
  filePath: string,
  values: {
    rep?: string[];
    company?: string;
    website?: string;
    speed?: string;
    interval?: string;
    "no-research"?: boolean;
    mock?: boolean;
    quiet?: boolean;
  },
) {
  const errors: string[] = [];
  const replay = startReplay({
    filePath,
    brain: values.mock ? mockBrain() : claudeBrain,
    intervalMs: values.interval ? Number(values.interval) * 1000 : config.intervalMs,
    research: config.research && !values["no-research"],
    speed: Number(values.speed ?? 0),
    repNames: values.rep?.length ? values.rep : config.repNames,
    prospectCompany: values.company,
    prospectWebsite: values.website,
  });

  console.log(c.bold(`\nReplaying ${path.basename(filePath)}`));
  if (replay.repNotice) console.log(c.yellow(replay.repNotice));

  replay.session.on("event", (event: WingmanEvent) => {
    switch (event.type) {
      case "utterance": {
        if (values.quiet) break;
        const u = event.utterance;
        const who = u.isRep ? "REP " : "PROS";
        console.log(c.dim(`${formatClock(u.atMs).padStart(6)} ${who} ${u.speaker}: ${truncate(u.text, 140)}`));
        break;
      }
      case "nudge": {
        const n = event.nudge;
        const warn = n.copyWarnings.length ? c.yellow(`  (copy, ${n.copyWarnings.join("; ")})`) : "";
        console.log(`${formatClock(n.atMs).padStart(6)} ${c.green(`NUDGE [${n.kind}]`)} ${c.bold(n.text)}${warn}`);
        break;
      }
      case "research":
        console.log(`${formatClock(event.note.atMs).padStart(6)} ${c.cyan(`RESEARCH ${event.note.query}`)} ${event.note.summary.replace(/\n/g, " / ")}`);
        break;
      case "error":
        errors.push(event.message);
        console.log(c.red(`  ERROR ${event.message}`));
        break;
    }
  });

  await replay.done;

  const report = buildReport(replay.session, errors);
  const dir = path.resolve("replays");
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const out = path.join(dir, `${path.basename(filePath, path.extname(filePath))}-${stamp}.md`);
  fs.writeFileSync(out, report);

  const { state } = replay.session;
  console.log(
    c.bold(
      `\nDone. ${replay.session.passCount} passes, ${state.nudges.length} nudges, ${state.pains.length} pains, ${state.research.length} research notes.`,
    ),
  );
  console.log(`Review written to ${out}`);
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

main().catch((err) => {
  console.error(c.red(err instanceof Error ? err.message : String(err)));
  process.exit(1);
});
