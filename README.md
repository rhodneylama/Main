# Sales Floor

A sales performance screen for the office wall, built on top of your
GoHighLevel pipeline. Reps see where they stand, managers see where the money
is, and everybody sees a deal the moment it closes.

It is also where the team trains — a materials library plus live voice roleplay
against AI prospects, with practice scores feeding the same leaderboard as real
revenue.

## What it does

**Performance**

- **The floor** — closed revenue, open pipeline, activity, win rate and quota
  attainment, with a 30-day trend and the open pipeline broken down by stage.
- **Leaderboards** — reps or teams, over today / week / month / quarter / all
  time, ranked by points, revenue, deals or raw activity.
- **Points, levels and badges.** Effort earns points, outcomes earn more, and a
  won deal scales with its value so a big close outranks a small one without
  swamping the board.
- **Competitions.** Run a sprint on any measure the board tracks, between reps
  or between teams, with an optional target and a prize.
- **TV mode** at `/tv` — a chrome-free wall display that rotates between boards
  on its own and throws a full-width celebration when a deal lands.

**Training**

- **Materials library.** Upload PDFs, videos, images and audio, or link to
  whatever already lives in Drive or Loom. Mark materials required, and track
  who has completed what.
- **AI voice roleplay.** Practise live cold calls against prospects that push
  back, object, and hang up on you, then get a coached scorecard on every call.
  A 90+ call is worth three times a bare pass; an unscored one is worth nothing.

## Setup

Requires Node 20+.

```bash
npm install
cp .env.example .env.local
npm run dev                    # http://localhost:3000
```

It runs immediately with a seeded demo team — eight reps, three teams, 90 days
of activity and a live competition — so you can see what it looks like populated
before connecting anything. Set `SALESFLOOR_SEED_DEMO=false` to start empty.

```bash
npm run build && npm start     # production
npm test                       # unit tests
npm run typecheck
```

## Putting it online

See **[DEPLOY.md](DEPLOY.md)** for a step-by-step walkthrough written for
someone who has not deployed anything before.

The short version: this app stores its data in a file on disk, so it needs a
host that provides a **permanent disk mounted at `/data`** — Railway, Render,
Fly.io or your own server. **Vercel and Netlify will not work**, because they
give the app a blank filesystem on every deploy. A `Dockerfile` is included and
is the recommended way to run it anywhere.

Set `SALESFLOOR_PASSWORD` when hosting anywhere public. It puts the whole site
behind one shared team password — the app has no per-rep login, so without it
anyone with the URL can read your revenue and log activity as any rep. The
GoHighLevel webhook endpoint stays reachable either way, since it carries its
own secret.

## Connecting GoHighLevel

Go to **Settings → GoHighLevel** and enter a location id and a private
integration token (GoHighLevel: Settings → Private Integrations). Saving with
"Use GoHighLevel as the source" ticked tests the credentials immediately.

**Sync** pulls pipelines, users and opportunities. Won and lost opportunities
become leaderboard activity, so GHL revenue lands on the board without anyone
logging it twice. Syncing is idempotent — everything is upserted by its GHL id,
and each opportunity's outcome is recorded against that id, so re-running a sync
never pays a rep twice.

GHL users are matched to existing reps by name before a new rep is created, so
connecting an account that already has reps on the board links them rather than
duplicating them.

**For live updates**, add a webhook action to your GoHighLevel workflows
pointing at `/api/ghl/webhook` (the Settings page shows the full URL). These
events are understood:

| GoHighLevel event | Becomes |
|---|---|
| `OpportunityStatusUpdate` → won | Deal won, with its value and a celebration |
| `OpportunityStatusUpdate` → lost / abandoned | Deal lost |
| `AppointmentCreate` | Appointment set, with a celebration |
| `AppointmentUpdate` → showed | Appointment held |
| `OutboundMessage` | Dial, email or text, by channel |
| `InboundMessage` (call) | Conversation |

Anything else is acknowledged and ignored — an unmapped event is not an error,
and a webhook that returns a failure gets retried by GoHighLevel forever. Each
event is deduplicated on its id, so a redelivery does not pay out twice.

Set `GHL_WEBHOOK_SECRET` (or fill it in on the Settings page) and the endpoint
requires it as an `x-webhook-secret` header. Without one the endpoint is open,
which is only appropriate behind a private network.

Nothing about the rest of the app depends on GoHighLevel — activity can be
logged by hand from the floor screen, and the demo data works standalone.

## Points

| Activity | Points |
|---|---|
| Dial | 2 |
| Conversation | 5 |
| Email / text | 1 |
| Appointment set | 25 |
| Appointment held | 40 |
| Proposal sent | 30 |
| Deal won | 100 + 10 per 1,000 of value |
| Deal lost | 5 |
| Practice call | 5–30, by scorecard |
| Training material completed | Per material, 15 by default |

Levels run from Rookie at 0 to Legend at 32,000 lifetime points — roughly two
years for a rep on a full desk. Badges are awarded automatically and never taken
away.

## Browser and audio requirements

The practice-call feature uses the browser's built-in Web Speech API.

- **Works:** Chrome, Edge, Safari 16.4+
- **Does not work:** Firefox (no speech recognition)

**Headphones are strongly recommended.** On speakers the microphone hears the
prospect's synthesised voice and transcribes it as if the rep said it. The app
mutes the mic while the prospect speaks by default, which avoids the problem but
means you cannot interrupt. Tick **Allow interruptions** to talk over them.

The rest of the app has no audio requirements and works in any browser.

## Layout

```
src/
├── app/
│   ├── page.tsx              The floor — dashboard
│   ├── leaderboard/          Reps and teams, by period and measure
│   ├── competitions/         Sprints and their standings
│   ├── training/             Materials library
│   │   ├── practice/         Start a practice call
│   │   ├── call/             Live call screen
│   │   ├── review/[id]/      Scorecard
│   │   ├── personas/         AI prospect management
│   │   └── history/          Past practice calls
│   ├── team/                 Reps, teams and quotas
│   ├── tv/                   Wall display
│   ├── settings/             GoHighLevel, scoring, your pitch
│   └── api/                  …one route per resource, plus ghl/{sync,webhook}
├── lib/
│   ├── schema.ts             Every table, as CREATE ... IF NOT EXISTS
│   ├── sales-db.ts           Reps, deals, activity, leaderboards, competitions
│   ├── training-db.ts        Materials and completion
│   ├── points.ts             Point rules, levels, badge criteria
│   ├── analytics.ts          Dashboard aggregation
│   ├── seed-demo.ts          The demo floor
│   ├── ghl/                  GoHighLevel client, mapping and sync
│   └── prompts.ts            Persona system prompt + scoring rubric
├── components/               Charts, boards, forms
└── voice/                    Swappable speech layer
```

Data lives in a SQLite file at `data/salesfloor.db` (override with
`SALESFLOOR_DB_PATH`), and uploaded training files in `data/uploads`. Both are
gitignored. Back them up by copying the directory.

## Notes on the design

- **Chart colours are validated, not chosen by eye.** The five categorical
  series colours in `tailwind.config.ts` clear the lightness band, chroma floor,
  3:1 contrast and adjacent-pair colour-vision separation against the app's
  chart surface. Status colours are reserved and never reused as a series.
- **No dual-axis charts.** The trend chart shows one measure at a time, because
  activity counts and revenue don't share a scale and putting them on two axes
  would invent a crossover that isn't in the data.
- **There is no per-rep login.** This is an internal wall board — reps pick
  their name once and it sticks in that browser, and the board trusts them.
  `SALESFLOOR_PASSWORD` puts one shared password in front of the whole site,
  which is a front door rather than an identity system: it keeps strangers out,
  it does not stop one rep logging activity as another.
- **Reps are deactivated, never deleted**, so past leaderboards and finished
  competitions still add up.
- **Voice is swappable.** Everything speech-related sits behind the
  `VoiceProvider` interface in `src/voice/types.ts`. To use ElevenLabs or
  Deepgram, implement that interface and return it from `getVoiceProvider()`.
- This tool does not dial anyone. Every practice call is a simulation.
