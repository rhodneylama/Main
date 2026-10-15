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
| 2 | Live Recall.ai bot that joins Zoom or Meet | Built, not yet run against a real meeting |
| 3 | Private page, post-call summary, pains, fit and recap email draft | Built |
| 4 | Google Calendar auto-join | Next |

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
`--interval 15`, `--no-research`, `--no-postcall` (skip the recap), `--quiet` (nudges only, no transcript).

## Live calls

1. Deploy (see below) and set `ANTHROPIC_API_KEY`, `RECALL_API_KEY`,
   `RECALL_REGION`, `PUBLIC_BASE_URL` and `WINGMAN_PASSWORD`.
2. Open the site, sign in, paste the Zoom or Meet link, and press
   **Send ABU Notetaker**. The bot joins as "ABU Notetaker" and posts a short
   chat message saying it is transcribing the call. If the meeting has a
   waiting room, admit it.
3. Keep the call page open on your phone or second screen. Nudges arrive at
   the top. **Mute** pauses them on that screen.
4. Press **End call** when you are done, or let it end on its own. The bot
   leaves, and Wingman writes the summary, next steps and a recap email draft
   on the same page. Copy the email or download the recap and transcript. Nothing
   is ever sent for you.

Who counts as you. If `WINGMAN_REP_NAMES` matches your name in the meeting,
that wins. If it is blank, whoever hosts the meeting is treated as the rep.

How a call ends, whichever comes first. The End call button. The Recall
status webhook, if you set `RECALL_WEBHOOK_TOKEN` and add the webhook in the
Recall dashboard. Or `WINGMAN_IDLE_MINUTES` with no one speaking.

Each call gets its own secret in the transcript webhook address, so nothing
else can post lines into it. Live calls are held in memory, so restarting the
server mid-call loses that call's live loop. What was said so far stays saved.

The Recall request and payload shapes all live in `src/recall/client.ts`.
They follow Recall's current docs (`transcript.data` events, `recallai_streaming`
transcription, `chat.on_bot_join`). If your Recall account is on an older API
version and something does not come through, that file is the one to adjust.

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
    auth.ts              password sign-in
    server.ts            Express routes, Recall webhooks, server-sent events
    brain/
      prompt.ts          Wingman's rules, service fit and pricing
      analyze.ts         one analysis pass, structured output
      research.ts        web search lookups
      postcall.ts        summary, next steps, recap email draft
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
    recall/client.ts     Recall bot API and webhook payloads
    live/manager.ts      runs live calls, ends them once
    cli/replay.ts        npm run replay
  public/                index.html (start), call.html (private page)
  tests/
```

Coming next: `src/calendar/` for Google Calendar auto-join.

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
- **PostCall** holds the summary, next steps and recap email (subject and
  body), written once the call ends.
- **WingmanEvent** is what the page receives. It is one of utterance, nudge,
  state, research, status, postcall or error.

SQLite tables are `calls`, `utterances`, and `events` (every event as JSON,
so any call can be replayed on the page afterwards). The final state, the
summary, the recap draft as text, and the full post-call result are saved on
the call row.

## Cost and speed

The live loop uses `claude-sonnet-5-5` at low effort. Expect a pass about every
prospect turn, so a 45 minute call is a couple of hundred passes. The system
prompt is cached, and each pass sends only the last 40 lines plus the state,
so cost stays flat as the call gets longer. Raise `WINGMAN_LIVE_EFFORT` to
`medium` if replays show the nudges are too shallow. Refusal fallbacks are on,
and if your account isn't enrolled in that beta Wingman retries without it.

## Deploy

Railway or Heroku, with this folder as the app root. The server refuses to
start with `PUBLIC_BASE_URL` set and no `WINGMAN_PASSWORD`, since anyone who
found it could otherwise send bots on your Recall account and read your calls. Build with
`npm run build` and start with `npm start` (a `Procfile` is included). Set the
variables from `.env.example`. SQLite needs a persistent volume on Railway.
Heroku's disk is wiped on restart, so treat stored calls there as temporary
until we move storage.
