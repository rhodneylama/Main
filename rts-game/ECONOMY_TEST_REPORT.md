# Scrapline Command: Economy Retune Test Report

**Date:** 16 October 2026
**Branch:** `claude/topdown-2d-rts-game-5pqhc1`
**Status:** the requested changes are **in the game**. The final
recommendation (section 9) is **not applied yet**.

> **Update, 18 October 2026:** Transports and Extractor Silos have since been
> **removed** from the game. Extractors now pay straight into your total
> (about 42 scrap a minute each) and only hold up to 120 while your storage
> is full. The Transport numbers below are kept as a record only.

This report covers one round of balance work:

1. Halve the number of geysers.
2. Find out whether the computer opponent prefers loose scrap to geysers, and
   fix it if so.
3. Halve Transport capacity.
4. Make geyser (Extractor) tanks 4× bigger.
5. Cut geyser output by about 30%.

Each change was then tested by playing many computer-vs-computer games and
measuring where the scrap came from. The report ends with recommendations.

It is written so it can be read on its own, or handed to an AI assistant for
the next round of planning. All rules and numbers for the rest of the game
are in [`GAME_DESIGN.md`](GAME_DESIGN.md).

---

## Contents

1. [Summary](#1-summary)
2. [What changed](#2-what-changed)
3. [How it was tested](#3-how-it-was-tested)
4. [Did the opponent prefer loose scrap?](#4-did-the-opponent-prefer-loose-scrap)
5. [What the opponent fix does](#5-what-the-opponent-fix-does)
6. [What each way of earning is worth to a player](#6-what-each-way-of-earning-is-worth-to-a-player)
7. [Results: the options compared](#7-results-the-options-compared)
8. [Easy and Hard](#8-easy-and-hard)
9. [Recommendations](#9-recommendations)
10. [A bug found along the way](#10-a-bug-found-along-the-way)
11. [Limits of these tests](#11-limits-of-these-tests)
12. [Open questions for the next round](#12-open-questions-for-the-next-round)
13. [How to rerun the tests](#13-how-to-rerun-the-tests)
14. [Raw numbers](#14-raw-numbers)

---

## 1. Summary

- **Yes, the opponent preferred loose scrap.** Before this round, about
  **70%** of its income came from Scavengers picking up loose scrap and only
  about **29%** from geysers.
- **Why:** it was capped at a few Extractors, built only one Transport per
  Extractor, and never built Extractor Silos. Its Extractor tanks sat full
  (and stopped pumping) **40%** of the time.
- **Your number changes on their own made this worse:** geysers fell to
  about **22%** of its income, because each geyser now earns less and needs
  more Transport trips.
- **With the opponent fixed as well** (the version now in the game),
  geysers give **37%** of its income, tanks are full only **10%** of the
  time, and it builds Extractor Silos.
- **Side effect:** with Transports carrying only 30, far geysers need two
  Transports each. The opponent spends so much on them that its army at
  10 minutes shrinks (2.8 vehicles, from 4.3), and more games stall.
- **Recommendation:** keep 12 geysers, the 120-scrap tank and the opponent
  fix, but **soften two numbers**: Transports carry **45** (instead of 30),
  and geyser output is cut **15%** (instead of 30%). In testing this gave
  geysers **41%** of income with the army back to normal.
- **The deeper issue:** one Scavenger on a nearby field earns about
  **92 scrap a minute**. A geyser, even with an Extractor Silo, earns at most
  **42** now (60 before). So a smart human player will still favour
  Scavengers. Fixing that is a separate decision (section 12).
- **Bug fixed:** late in long games, a vehicle with an unreachable
  destination re-searched its route every tick. On the big map this slowed
  the game to a crawl. Fixed and committed.

---

## 2. What changed

### The requested changes (in the game now)

| Setting | Before | Now | File |
| --- | --- | --- | --- |
| Geysers on the map | 24 (12 per side) | **12 (6 per side)** | `js/map.js` |
| Transport load | 60 | **30** (−50%) | `js/config.js`, `transport.carryMax` |
| Extractor tank | 30 | **120** (×4) | `js/config.js`, `extractor.store` |
| Extractor output | 1.0 a second (60 a minute) | **0.7 a second (42 a minute)** (−30%) | `js/config.js`, `extractor.income` |
| Recycler's own trickle | 0.05 a second (3 a minute) | **0.035 a second (2.1 a minute)** | `js/config.js`, `recycler.income` |

The Recycler's trickle was cut too, to keep an earlier design rule: it pumps a
twentieth of an Extractor's rate.

### The 6 geysers per side

Positions are tile corners, for the bottom-left player. The other side is the
mirror image.

| Geyser | Position | Tiles from the start | Role |
| --- | --- | --- | --- |
| 1 | (10, 127) | 1 | Under the starting Recycler |
| 2 | (34, 118) | 25 | Home |
| 3 | (42, 92) | 47 | Middle distance |
| 4 | (84, 116) | 74 | Forward, bottom flank |
| 5 | (24, 46) | 81 | Forward, left flank |
| 6 | (78, 74) | 86 | Contested, near the centre |

They were chosen from the previous 24 to keep an even spread from home to the
middle. Every geyser is still at least 20 tiles from every other geyser,
including the other side's.

### The opponent fix (in the game now)

| Behaviour | Before | Now |
| --- | --- | --- |
| Most Extractors (Easy / Normal / Hard) | 1 / 3 / 4 | **2 / 4 / 5** |
| Transports | 1 per Extractor without a silo | **Enough for the distance**: each Extractor's output × the round trip ÷ the Transport load, at least 1 and **at most 2** per Extractor |
| Extractor Silos | Only if it happened to have 500 spare (in practice never) | **Saves up for one** on its furthest Extractor after 10:00 (Normal) or 7:00 (Hard); never on Easy |
| Scavengers on loose scrap | Up to the difficulty limit | **One fewer for every two Extractors** it runs (never below 3) |

These live in `js/ai.js` and in the `DIFFICULTY` table in `js/config.js`
(`maxExtractors`, `extractorSilos`).

---

## 3. How it was tested

**Computer-vs-computer games.** Both sides are played by the computer
opponent, so nothing depends on how a person plays. Each game ran without
graphics, at full speed, for up to **60 minutes** of game time.

- **Normal:** 12 games per option (map seeds 1 to 12).
- **Easy and Hard:** 6 to 8 games per option.
- The same seeds were used for every option, so the maps match.

**What was measured, for each side:**

- Where every bit of scrap that reached storage came from: **Scavengers**
  (loose scrap), **Transports** (hauled from Extractor tanks), **Extractors**
  (straight in through an Extractor Silo), or the **Recycler's** own
  trickle. Split into 0–10, 10–20 and 20–30 minutes.
- Number of Extractors at 5, 10, 20 and 30 minutes, and when the first one
  went up.
- How often Extractor tanks were **full** (a full tank stops pumping).
- Peak Scavengers and Transports, Extractor Silos built, army size.
- How much loose scrap was left on the map.
- Who won, and when, or whether the game was **unfinished** at 60 minutes.

**"Geyser share"** below means Transport plus Extractor-direct income, as a
share of all income. It is the main measure of whether geysers matter.

**Worth to a player** (section 6) was measured separately: one side alone, no
fighting, 10 minutes, with storage made unlimited so nothing is wasted.

**"Do nothing" survival:** the human side deploys its Recycler and then does
nothing; how long until the opponent wins. One map (seed 5).

---

## 4. Did the opponent prefer loose scrap?

**Yes.** These are the games before any of this round's changes (24 geysers,
old numbers). The Normal column is the re-run with the bug fix from section 10
(12 games); Easy and Hard are 6 games each from before the fix.

| | Easy | Normal | Hard |
| --- | --- | --- | --- |
| Income from loose scrap (whole game) | 74% | 70% | 71% |
| Income from geysers (whole game) | 25% | 29% | 28% |
| Income from geysers, first 10 minutes | 5% | 13% | 18% |
| Extractors at 10 / 20 / 30 min | 1.0 / 1.0 / 0.8 | 2.5 / 2.8 / 2.6 | 3.5 / 4.0 / 4.0 |
| Extractor tanks full | 2% of the time | **40%** of the time | **43%** of the time |
| Peak Transports | 1 | 3 | 3.8 |
| Extractor Silos built by 20 min | 0.1 | **0** | **0** |
| Loose scrap left at 40 minutes | 41k of ~52k | 39k of ~52k | 37k of ~52k |

**The causes:**

1. **A hard cap on Extractors.** The opponent stopped at 1 / 3 / 4, even
   with 11 free geysers on its side.
2. **Too few Transports.** One per Extractor can't keep up once the geyser
   is more than about 25 tiles out. Tanks filled up and stopped pumping, so
   geysers delivered far less than they could.
3. **No Extractor Silos.** The rule was "build one if you have 500 spare",
   but it always spent its scrap on the army first.
4. **Loose scrap never runs out.** About 26,000 per side on the big map;
   after 40 minutes three quarters of it is still there, so Scavengers never
   run dry.

---

## 5. What the opponent fix does

Normal difficulty, 12 games each:

| | Before | Your numbers only | Your numbers + opponent fix |
| --- | --- | --- | --- |
| Geyser share of income | 29% | 22% | **37%** |
| Extractor tanks full | 40% | 30% | **10%** |
| Extractors at 10 / 20 min | 2.5 / 2.8 | 2.7 / 2.8 | 3.4 / 3.8 |
| Extractor Silos by 20 min | 0 | 0 | **1.0** |
| Peak Transports | 3 | 3 | **8** |
| Army at 10 minutes | 4.3 | 3.3 | **2.8** |
| Income per side (whole game) | 9,142 | 7,681 | **11,049** |
| Unfinished games | 2 of 12 | 3 of 12 | 4 of 12 |

Notes:

- The "your numbers only" batch ran before the bug fix in section 10, so
  its game lengths aren't directly comparable. Its income shares are.
- In a first version of the fix (no limit on Transports), the opponent built
  **up to 12** Transports. Far geysers at 30 per trip need 3 or 4 each.
  The "at most 2 per Extractor" limit was added to push it toward Extractor
  Silos instead.

---

## 6. What each way of earning is worth to a player

One side alone, no fighting, 10 minutes, unlimited storage. Scrap per minute
reaching storage.

### Under the numbers now in the game (output 42/min, tank 120, Transport 30)

| Setup | Cost | Scrap a minute |
| --- | --- | --- |
| 1 Scavenger on a nearby field | 60 | **92** |
| 3 Scavengers | 180 | **196** (fields nearby get crowded) |
| Geyser 26 tiles out + 1 Transport | 150 | 41 |
| Geyser 26 tiles out + 2 Transports | 220 | 39 |
| Geyser 26 tiles out + Extractor Silo | 580 | 42 |
| Geyser 47 tiles out + 1 Transport | 150 | **21** (tank stays full) |
| Geyser 47 tiles out + 2 Transports | 220 | 36 |
| Geyser 47 tiles out + Extractor Silo | 580 | 42 |
| Geyser 75 tiles out + 1 Transport | 150 | **12** |
| Geyser 75 tiles out + 2 Transports | 220 | 24 |
| Geyser 75 tiles out + Extractor Silo | 580 | 42 |

Geyser costs above count the Scavenger II (80) that becomes the Extractor,
plus Transports (70 each) or the Extractor Silo (500).

### Under the old numbers (output 60/min, tank 30, Transport 60)

| Setup | Scrap a minute |
| --- | --- |
| Geyser 26 tiles out + 1 Transport | 49 |
| Geyser 47 tiles out + 1 or 2 Transports | 22 (the small tank fills between trips) |
| Geyser 75 tiles out + 1 or 2 Transports | 12–13 |
| Any geyser + Extractor Silo | 60 |

### With Transports carrying 45 (other numbers as now)

| Setup | Scrap a minute |
| --- | --- |
| Geyser 47 tiles out + 1 Transport | 31 |
| Geyser 75 tiles out + 2 Transports | 31 |

### What this means

- **A Scavenger beats a geyser.** It costs less, earns about twice as much,
  and doesn't need a second vehicle. This was true before this round too.
- **What a geyser has going for it:** it never runs out, it extends your
  building territory, and an Extractor Silo makes it pay at any distance.
- **The bigger tank helps far geysers:** it no longer overflows between
  Transport trips, so a second Transport now adds real income (at 47 tiles,
  36 a minute instead of 22).
- **Transports at 30 are the bottleneck:** past about 45 tiles, one
  Transport delivers only half of what the geyser pumps.

---

## 7. Results: the options compared

Normal difficulty, 12 computer-vs-computer games each, 60-minute limit, all
with the opponent fix.

| Option | Geyser share | Income per side | Army at 10 / 20 min | Tanks full | Unfinished | Typical length (median) |
| --- | --- | --- | --- | --- | --- | --- |
| Before this round (24 geysers, old numbers, no fix) | 29% | 9,142 | 4.3 / 6.8 | 40% | 2 of 12 | 26 min |
| **A. Your changes (in the game now)** | 37% | 11,049 | 2.8 / 6.8 | 10% | 4 of 12 | 26 min |
| B. A, but Transports carry 45 | 35% | 9,432 | 3.9 / 6.7 | 7% | 2 of 12 | 28 min |
| C. A, but no output cut (60/min) | 42% | 11,252 | 3.3 / 5.0 | 20% | **1 of 12** | 29 min |
| D. A, but half the loose scrap | **46%** | 10,037 | 3.0 / 4.0 | 18% | **6 of 12** | 37 min |
| **E. A, but Transports 45 and output cut only 15% (51/min)** | **41%** | **11,986** | **4.3 / 8.2** | 11% | 3 of 12 | 27 min |

For D, each scrap pile holds 200 instead of 400. For E, the Recycler's
trickle is 2.55 a minute, keeping the one-twentieth rule.

**Reading the table:**

- **A (now):** geysers clearly matter more than before. But the early army
  is the smallest of all options, because Transports eat the budget.
- **B:** bigger Transports bring the early army back and fewer games stall,
  but geysers matter a little less than in A.
- **C:** geysers matter a lot and games finish most reliably. The 30%
  output cut is undone, though, which is not what was asked.
- **D:** geysers dominate, but both sides are starved early, armies stay
  small and half the games never finish. Not recommended.
- **E:** the best all-round result: geysers at 41%, the early army back to
  its old size, the most income, and stalemates close to the old level.

---

## 8. Easy and Hard

Option A (in the game now):

| | Easy before | Easy now | Hard before | Hard now |
| --- | --- | --- | --- | --- |
| Geyser share | 25% | 31% | 28% | 39% |
| Extractors at 10 / 20 min | 1.0 / 1.0 | 2.0 / 1.6 | 3.5 / 4.0 | 4.0 / 4.4 |
| Extractor Silos by 20 min | 0.1 | 0 (never on Easy) | 0 | 1.3 |
| Income per side | 4,014 | 4,253 | 9,907 | 13,289 |
| Unfinished games | 1 of 6 | 4 of 8 | 1 of 6 | **5 of 8** |

**"Do nothing" survival** (one map; the first attacks still come at 10:00 /
5:00 / 3:00):

| | Easy | Normal | Hard |
| --- | --- | --- | --- |
| Before this round | about 17 min | about 13 min | about 8 min |
| Now | about 21 min | about 11 min | about 6 min |

**Reading this:**

- **Easy stays easy** for a human: it takes longer to lose by doing
  nothing. Easy-vs-Easy games stall more often, which matters less, since
  nobody plays Easy against Easy.
- **Hard got richer** (about a third more income) and much more prone to
  stalemate between two Hard opponents: both sides build strong defences.
  Against a human it may simply feel harder. Worth watching.

---

## 9. Recommendations

### Keep

1. **12 geysers (6 per side).** The spread still covers home, the middle
   distance, both flanks and the centre.
2. **The 120-scrap Extractor tank.** It makes far geysers workable and
   wastes less.
3. **The opponent fix.** Without it, your number changes push the opponent
   even further toward loose scrap.

### Change (recommended, not applied)

4. **Transports carry 45, not 30.** At 30, every geyser past about 45 tiles
   needs two Transports, and the opponent's early army shrinks.
5. **Cut geyser output by 15%, not 30%:** 0.85 a second (51 a minute), with
   the Recycler at 0.0425 a second (2.55 a minute).

Together these are option E: the best balance measured. To apply them, in
`js/config.js`:

```js
transport: { ... carryMax: 45, ... }
recycler:  { ... income: 0.0425, ... }
extractor: { ... income: 0.85, store: 120, ... }
```

### Don't

6. **Don't halve the loose scrap** to force geyser use. It made half the
   games stall and kept armies small.

### Consider next

7. **If geysers should be the main economy for human players too,** the
   Scavenger is the thing to look at, not the geyser. See section 12.
8. **Look at Hard-vs-Hard stalemates** separately (section 8).

---

## 10. A bug found along the way

**Symptom:** some long games slowed to a crawl after about 20 minutes. In
one test game, 10 seconds of play took 12 seconds of computer time; the
same game had been running at about 70 ms per 10 seconds a moment before.
A player would have seen the game slow right down late in a match.

**Cause:** two of the opponent's Constructors were sent to a building site
they couldn't reach. Several orders work like "if I have no route, plan
one", so when planning failed, they tried again on the very next tick, 30
times a second. On the big map, a search that finds nothing has to look at
the whole map (about 20 ms each time). Idle Tanks that had arrived "close
enough" also re-planned every tick, which was cheap but wasteful.

**Fix (in `js/sim.js`, `planPath`):** a vehicle won't search for a route to
the same spot again within **2 seconds** if the last try failed, or within
**half a second** otherwise. The slow game now runs at about 70 ms per 10
seconds of play from start to finish, and normal games run faster too.

---

## 11. Limits of these tests

- **Computer vs computer, not people.** The opponent plays one fixed way. A
  human will use Scavengers, geysers and silos very differently, and will
  certainly exploit the Scavenger's advantage (section 6).
- **Small samples.** 12 games per option on Normal (6–8 on Easy and Hard).
  That's enough to see big differences, such as 29% vs 41% geyser share or
  6 of 12 stalled games. It isn't enough for small ones, such as 35% vs
  37%, or which side or corner wins more (the wins were lopsided in some
  batches, 2 to 7, which is very likely chance at this size).
- **60-minute limit.** "Unfinished" games might have ended later.
- **"Do nothing" survival** is one map only.
- **No real phone or real-person playtest** has been done of these numbers.

---

## 12. Open questions for the next round

1. **Should geysers be the main economy for a human player?** If yes, the
   simplest levers to test are:
   - a slower Scavenger (lower `gatherRate` than 4 a second, or a smaller
     load than 25);
   - smaller scrap fields near home, so Scavengers have to drive further;
   - cheaper Extractor Silos (500 now), so a geyser pays straight into
     storage sooner.
2. **Is Transport hauling meant to be a big part of the game,** or just a
   stopgap until you can afford an Extractor Silo? That decides whether
   Transports should be 45 or even back to 60.
3. **How long should a typical game be?** Normal games run about 26–29
   minutes, with 1 to 4 in 12 not finished within an hour, depending on the
   option.
4. **Hard vs Hard stalemates:** is it a problem if two Hard opponents stall,
   as long as Hard against a human feels right?

---

## 13. How to rerun the tests

Everything is in `rts-game/tests/` and needs only Node.js.

| Tool | What it does |
| --- | --- |
| `tests/rules.js` | The rules tests (43 checks), including the new Extractor (42 a minute, tank 120) and Transport (30) values and the 12-geyser map. Run `node rts-game/tests/rules.js`. |
| `tests/balance/bench.js` | One computer-vs-computer game with income tracking. Prints one line of results. |
| `tests/balance/batch.sh` | Runs many games, 4 at a time, into `tests/balance/out/<label>.jsonl`. |
| `tests/balance/summ.js` | Prints the summary tables from one or more result files. |
| `tests/balance/worth.js` | The player's-eye income test from section 6. |

Examples, from the repository folder:

```sh
# The game as it is now, Normal, 12 maps, 60-minute limit
OVER="" rts-game/tests/balance/batch.sh now_normal $PWD/rts-game/js normal 3600 $(seq 1 12)

# Option E: try different numbers without editing the game
OVER="UNIT_TYPES.transport.carryMax=45;BUILDING_TYPES.extractor.income=0.85;BUILDING_TYPES.recycler.income=0.0425" \
  rts-game/tests/balance/batch.sh option_e $PWD/rts-game/js normal 3600 $(seq 1 12)

# Summaries
node rts-game/tests/balance/summ.js now_normal option_e

# Scrap a minute for each way of earning
node rts-game/tests/balance/worth.js $PWD/rts-game/js
```

`OVER` is a line of JavaScript run after the game's settings load, so any
number in `js/config.js` can be tried without editing the file. A 12-game
batch takes about 10 to 15 minutes on a 4-core machine.

The result files behind this report are saved in `tests/balance/out/`:

| File | What it is |
| --- | --- |
| `base_easy`, `base_normal`, `base_hard` | Before this round |
| `e1_easy`, `e1_normal`, `e1_hard` | Your numbers, opponent not yet fixed (before the bug fix) |
| `f_base_normal` | Before this round, re-run with the bug fix |
| `f_prop_normal`, `f_prop_easy`, `f_prop_hard` | Option A: in the game now |
| `f_carry45` | Option B |
| `f_out100` | Option C |
| `f_scrap200` | Option D |
| `f_mix` | Option E |

---

## 14. Raw numbers

Normal difficulty, whole-game income share by source (Scavengers /
Extractor direct / Transports / Recycler), average income per side, and
Extractors at 10 / 20 / 30 minutes.

| Run | Scavengers | Extractor direct | Transports | Recycler | Income per side | Extractors 10 / 20 / 30 min |
| --- | --- | --- | --- | --- | --- | --- |
| Before (with bug fix) | 70% | 1% | 28% | 1% | 9,142 | 2.5 / 2.8 / 2.6 |
| Your numbers, no opponent fix | 77% | 1% | 21% | 1% | 7,681 | 2.7 / 2.8 / 3.0 |
| A: now | 63% | 16% | 21% | 1% | 11,049 | 3.4 / 3.8 / 3.6 |
| B: Transport 45 | 64% | 12% | 23% | 1% | 9,432 | 3.4 / 3.8 / 3.3 |
| C: output 60 | 57% | 20% | 22% | 1% | 11,252 | 3.5 / 3.6 / 3.8 |
| D: half loose scrap | 53% | 19% | 27% | 1% | 10,037 | 3.0 / 3.4 / 3.6 |
| E: Transport 45 + output 51 | 58% | 18% | 23% | 1% | 11,986 | 3.7 / 3.8 / 3.8 |

Income share by period for option A (now) and option E:

| Period | A: Scavengers / geysers | E: Scavengers / geysers |
| --- | --- | --- |
| 0–10 min | 87% / 13% | 84% / 16% |
| 10–20 min | 59% / 40% | 54% / 46% |
| 20–30 min | 48% / 51% | 45% / 54% |

In every option, the first 10 minutes run almost entirely on loose scrap: no
geyser except the Recycler's own can be claimed until the Recycler is
upgraded to Recycler II. Geysers take over from about the 20-minute mark.

Game lengths (minutes, games that ended), Normal:

| Run | Ended games | Unfinished at 60 min |
| --- | --- | --- |
| Before (with bug fix) | 17, 23, 24, 25, 26, 26, 26, 37, 41, 60 | 2 |
| A: now | 16, 19, 20, 22, 26, 30, 39, 41 | 4 |
| B: Transport 45 | 15, 22, 23, 25, 26, 28, 29, 30, 31, 38 | 2 |
| C: output 60 | 19, 22, 23, 26, 27, 29, 35, 35, 36, 53, 55 | 1 |
| D: half loose scrap | 15, 26, 32, 37, 49, 51 | 6 |
| E: Transport 45 + output 51 | 19, 19, 23, 27, 27, 28, 31, 33, 57 | 3 |
