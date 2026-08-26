# Cold Call Trainer

An internal sales-training tool. Reps practise live cold calls against AI
prospects that push back, object, and hang up — then get a coached scorecard on
every call.

Built to replace a per-seat AI roleplay subscription with something you run
yourself. The only running cost is Anthropic API usage, which is typically a
few cents per practice call.

## What it does

- **Voice roleplay.** You talk, the prospect talks back. They pick up first,
  just like a real dial.
- **Six built-in prospects**, from a curious ops lead who lets you ramble to an
  IT director who opens with "you've got ten seconds." Add your own.
- **Four call types** — cold call, discovery, closing, follow-up.
- **The prospect controls the call.** They hang up if you waste their time, and
  they agree to a meeting only if you clear a bar defined per persona.
- **Post-call scorecard** — scored on opener, objection handling, discovery,
  talk/listen balance and closing, with specific "you said X, try Y instead"
  coaching tied to real moments in the transcript.
- **History and leaderboard** — per-rep averages, best scores and meetings
  booked over time.
- **Your pitch, not a generic one.** Enter your product, ICP and the objections
  you actually hear, and prospects react to your real offer.

## Setup

Requires Node 20+.

```bash
npm install
cp .env.example .env.local     # then add your ANTHROPIC_API_KEY
npm run dev                    # http://localhost:3000
```

Get an API key at [console.anthropic.com](https://console.anthropic.com/settings/keys).

For the team, deploy it anywhere that runs a Node process and give everyone the
URL. Reps type their name on the practice screen — there is no login, because
this is an internal tool with no sensitive data in it.

```bash
npm run build && npm start     # production
npm test                       # unit tests
npm run typecheck
```

## Browser and audio requirements

Speech recognition uses the browser's built-in Web Speech API.

- **Works:** Chrome, Edge, Safari 16.4+
- **Does not work:** Firefox (no speech recognition)
- Grant microphone access when prompted.

**Headphones are strongly recommended.** On speakers, the microphone hears the
prospect's synthesised voice and transcribes it as if the rep said it. The app
defaults to muting the mic while the prospect speaks, which avoids the problem
but means you cannot interrupt. Tick **Allow interruptions** on the practice
screen to keep the mic live and talk over them — only do that with headphones on.

## How a call flows

1. The prospect picks up and speaks first.
2. You talk. Pause for ~1.5 seconds and your turn is sent, or press
   **Done speaking** to send immediately.
3. The prospect's reply streams back and is spoken aloud.
4. Repeat until someone ends the call.
5. **Review this call** saves the transcript and generates the scorecard.

The prospect ends the call by emitting a hidden control marker
(`[[HANGUP]]` or `[[MEETING_BOOKED]]`) that the server strips before anything
reaches the screen or the speech synthesiser. `tests/markers.test.ts` covers
the case where a marker arrives split across two stream chunks.

## Costs

Two API calls shape the bill:

- **Each turn of a call** runs at `effort: "low"` so replies come back fast, and
  the persona system prompt is cached across turns — it is resent every turn, so
  caching it is the main saving.
- **The scorecard** runs once per call at full effort, since quality matters
  more than latency there and it only happens once.

Both models are configurable via `PROSPECT_MODEL` and `SCORING_MODEL`.

## Upgrading the voice

The browser's speech synthesis is free but sounds robotic, and its recognition
is decent rather than great. Everything voice-related sits behind the
`VoiceProvider` interface in `src/voice/types.ts`, and nothing else in the app
touches the Web Speech API directly.

To use a paid provider (ElevenLabs for a natural prospect voice, Deepgram for
better transcription, or a realtime speech-to-speech API), implement that
interface in a new module under `src/voice/` and return it from
`getVoiceProvider()` in `src/voice/index.ts`. The call console needs no changes.

## Layout

```
src/
├── app/
│   ├── page.tsx              Practice setup
│   ├── call/                 Live call screen
│   ├── review/[id]/          Scorecard
│   ├── personas/             Prospect management
│   ├── history/              Calls + leaderboard
│   ├── settings/             Your pitch and product context
│   └── api/
│       ├── chat/             Streams one prospect turn (NDJSON)
│       ├── score/            Generates the scorecard (structured output)
│       └── …                 Personas, calls, settings, stats
├── lib/
│   ├── prompts.ts            Persona system prompt + scoring rubric
│   ├── seed-personas.ts      The six built-in prospects
│   ├── use-call-session.ts   Call state machine (turn-taking, barge-in)
│   ├── db.ts                 SQLite storage
│   └── types.ts
└── voice/                    Swappable speech layer
```

Data lives in a SQLite file at `data/trainer.db` (override with
`TRAINER_DB_PATH`). It is gitignored. Back it up by copying the file.

## Notes

- Prospects never break character. Asking them for feedback mid-call gets you a
  confused prospect — feedback comes from the scorecard.
- The **What wins them over** panel is shown to the rep during practice as a
  training aid. The prospect will not tell you this on the call.
- Built-in personas cannot be deleted, so the seed set is always available.
- This tool does not dial anyone. Every call is a simulation.
