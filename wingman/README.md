# Wingman

A live sales call assistant for ABU discovery calls. Wingman follows the call
transcript and sends you short private nudges on a second screen or your
phone. It suggests the next discovery question, tracks the pains it hears,
fills in the discovery checklist, looks up towns and tools the prospect
mentions, and ranks which ABU service fits. It never speaks on the call.

This folder is its own app, separate from the Sales Floor app at the repo
root. It has its own `package.json` and deploys on its own.

## Status

| Step | What | State |
| --- | --- | --- |
| 1 | Replay mode, the analysis loop, research, a basic watch page | Built |
| 2 | Live Recall.ai bot that joins Zoom or Meet | Next |
| 3 | Full private page, post-call summary, pains, fit and recap email draft | Basic page only |
| 4 | Google Calendar auto-join | Later |

## Quick start

```bash
cd wingman
npm install
cp .env.example .env        # add ANTHROPIC_API_KEY and your name in WINGMAN_REP_NAMES
```

Put your saved call transcripts in the repo's `samples/` folder (see
`samples/README.md` for the formats it reads), then:

```bash
npm run replay                                   # list what's in samples/
npm run replay -- my-call.txt --rep "Rhodney"    # replay one call
npm run replay -- --all                          # replay every sample
npm run replay -- my-call.txt --mock             # no API calls, plumbing check only
```

Each replay prints nudges as they fire, then writes a review to
`wingman/replays/`. The review puts each nudge right under the line it
followed, so you can judge whether it was the right thing at that moment.

To watch a replay on the page instead, run `npm run dev`, open
http://localhost:3001, pick a transcript and a speed.

Useful flags: `--company`, `--website`, `--speed 1` (real time),
`--interval 15`, `--no-research`, `--quiet` (nudges only, no transcript).

## How the loop works

1. Transcript lines arrive, from a file in replay or from Recall on a live call.
2. A pass runs when the prospect finishes a real turn (six or more words), or
   after `WINGMAN_INTERVAL_SECONDS` of anyone talking. Only one pass runs at a
   time. Lines that arrive during a pass wait for the next one.
3. Each pass sends Claude the frozen system prompt (cached), what Wingman
   already knows, the nudges already sent, and the last 40 lines with the new
   ones marked.
4. Claude returns structured JSON, which is nudge, pains, form, fit and lookups.
5. The server merges it. A null never erases a known answer. Repeated nudges
   are dropped. Copy rules are applied, and anything it can't fix (like
   "leads") is flagged in the review.
6. Lookups go to a separate web search call. The two-line result is shown as
   research and fed back so Wingman stops suggesting questions it already
   knows the answer to.

## File structure

```
wingman/
  src/
    config.ts            env settings
    types.ts             the data model below
    db.ts                SQLite storage
    server.ts            Express, replay API, server-sent events
    brain/
      prompt.ts          Wingman's rules, service fit and pricing
      analyze.ts         one analysis pass, structured output
      research.ts        web search lookups
      copy.ts            copy rule filter
      client.ts          Anthropic client, fallback handling
      index.ts           Brain interface, Claude and mock versions
    loop/
      session.ts         CallSession, decides when to run a pass
      merge.ts           folds each pass into the running state
    replay/
      parse.ts           transcript file reader (VTT, Otter style, JSON, plain)
      run.ts             feeds a file through a CallSession
      report.ts          markdown review of a replay
    cli/replay.ts        npm run replay
  public/                index.html (start), call.html (private page)
  tests/
```

Coming in later steps: `src/recall/` (bot API and transcript webhook),
`src/brain/postcall.ts` (summary and recap draft), `src/calendar/`.

## Data model

Defined in `src/types.ts`.

- **Call** has id, source (replay or live), status, origin (meeting link or file
  name), prospect company and website, rep names, start and end times, Recall
  bot id, and later summary and recap email draft.
- **Utterance** has seq, speaker, whether it is the rep, text, and ms from start.
- **CallState** is the running picture carried between passes. It holds
  pains (label, quote, solution), the discovery form (eleven fields, null
  until stated), the fit ranking (service and reason), research notes, and
  nudges sent (text, kind, time, the line it followed, copy warnings).
- **WingmanEvent** is what the page receives. It is one of utterance, nudge,
  state, research, status or error.

SQLite tables are `calls`, `utterances`, and `events` (every event as JSON,
so any call can be replayed on the page afterwards). The final state is
saved on the call row.

## Cost and speed

The live loop uses `claude-sonnet-5-5` at low effort. Expect a pass about every
prospect turn, so a 45 minute call is a couple of hundred passes. The system
prompt is cached, and each pass sends only the last 40 lines plus the state,
so cost stays flat as the call gets longer. Raise `WINGMAN_LIVE_EFFORT` to
`medium` if replays show the nudges are too shallow. Refusal fallbacks are on,
and if your account isn't enrolled in that beta Wingman retries without it.

## Deploy

Railway or Heroku, with this folder as the app root. Build with
`npm run build` and start with `npm start` (a `Procfile` is included). Set the
variables from `.env.example`. SQLite needs a persistent volume on Railway.
Heroku's disk is wiped on restart, so treat stored calls there as temporary
until we move storage.
