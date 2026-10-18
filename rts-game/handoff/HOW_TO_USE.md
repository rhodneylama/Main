# How to hand Scrapline Command to Gemini

This folder has everything Gemini needs to rebuild your game from scratch.

## What's in here

| Item | What it is |
| --- | --- |
| `PROMPT.md` | **The message to give Gemini.** It explains the game, what each file is, the rules it must follow, the order to build things in, the mistakes we already made (so Gemini can avoid them), and how to check the result. |
| `docs/GAME_DESIGN.md` | The full description of your game: every rule and number. |
| `docs/ECONOMY_TEST_REPORT.md` | The latest economy changes and test results. |
| `docs/README.md` | Your player's guide: how to play and the controls. |
| `docs/UNIT_SPRITES.md` | How your unit and building designs plug into the game. |
| `docs/ROADMAP.md` | Ideas for later (Gemini is told not to build these). |
| `assets/sprites.js`, `assets/sprites_kethra.js` | Your vehicle and building designs for both factions. Gemini is told to use them unchanged. |
| `tests/rules.js` | An automatic check of the game rules (74 checks). |
| `screenshots/` | 16 pictures of the current game, on desktop and phone. |

The game's actual program code is **not** included, on purpose: the point is
to see whether Gemini can rebuild the game from the description alone.

## Steps

1. **Unzip** this folder.
2. Open Gemini. A version that accepts **file uploads** works best, for
   example Gemini in Google AI Studio, the Gemini app with file upload, or
   the Gemini command-line tool. The design document is long, so pick the
   model with the biggest "context" (the most it can read at once) you have.
3. **Upload all the files**: the `docs`, `assets` and `tests` files, plus
   the screenshots.
4. **Paste the whole of `PROMPT.md`** as your message (or upload it too and
   write "Follow the instructions in PROMPT.md").
5. Gemini will probably build it **in stages**. After each stage:
   - save the files it gives you into one folder, keeping the folder layout
     it uses (`index.html`, a `js` folder, a `tests` folder);
   - double-click `index.html` to try it;
   - tell Gemini what you saw, in your own words, and ask for the next stage.

## Checking Gemini's version

- **Play it** on your computer and your phone, and compare with the
  screenshots.
- **The rules check** needs Node.js (a free download from nodejs.org). Then,
  in a terminal, inside Gemini's project folder, type:
  `node tests/rules.js`
  The last line says how many of the 74 checks passed. If some fail, paste
  the output back to Gemini and ask it to fix them.
- **The "do nothing" test:** start a game, deploy your Recycler, then just
  watch. You should lose after roughly 21 minutes on Easy, 9 on Normal or 6½
  on Hard.

## Good to know

- If Gemini's answer gets cut off, say "continue" or "give me the rest of
  that file in full".
- If it starts changing rules or numbers, remind it: "The spec is the source
  of truth; please don't rebalance."
- Our version stays on GitHub, untouched, so you can compare the two any
  time.
