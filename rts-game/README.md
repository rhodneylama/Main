# Scrapline Command

A top-down, real-time battle game that runs in your web browser. You command a
small army of vehicles, collect scrap to pay for more, and fight a computer
opponent for control of the battlefield.

It borrows ideas from:

- **Battlezone 2**: scrap as the only resource, Scavengers that collect it,
  a Recycler as your HQ, and a Constructor that builds your base.
- **Battlefield 2**: capture flags and a ticket count. Holding more flags than
  the enemy drains their tickets, and losing vehicles costs tickets too.
- **RTS / 4X games**: box-selecting units, a minimap, fog of war, and
  territory that grows as you capture flags.

---

## How to play it

**On your own computer (no install needed):**

1. On the GitHub page for this project, click the green **Code** button, then
   **Download ZIP**.
2. Unzip the file (double-click it on a Mac; right-click → *Extract All* on Windows).
3. Open the `rts-game` folder and double-click **`index.html`**. It opens in
   your web browser and you're playing.

**Tip:** add `?watch` to the end of the address in the browser bar (for example
`.../index.html?watch`) to watch two computer players fight each other.
Add `?seed=42` to get the same map every time.

---

## How to win

- **Drain the enemy's tickets to zero.** Both sides start with 300. Every
  5 seconds, whoever holds more flags drains the other side's tickets by the
  difference. Every combat vehicle destroyed costs its side 1 ticket.
- **Or destroy the enemy Recycler** (their HQ, in the top-right corner).

## Controls

| Action | How |
| --- | --- |
| Select | Left-click, or drag a box. Double-click selects every unit of that type on screen. |
| Move / attack / gather | Right-click |
| Attack-move (fight anything on the way) | `A`, then left-click |
| Stop | `S` |
| Command buttons | `Q` `W` `E` `R`, or click them |
| Save a squad | `Ctrl` + `1`–`9`. Press the number to reselect it; press twice to jump to it. |
| Scroll the map | Arrow keys, push the mouse against the screen edge, middle-drag, or click the minimap |
| Zoom | Mouse wheel |
| Jump to base / to selection | `H` / `Space` |
| Find an idle worker | `X` |
| Pause · mute · help | `P` · `M` · `F1` |

## Your forces

| Unit | Cost | Role |
| --- | --- | --- |
| Scavenger | 60 | Collects scrap automatically. More scavengers means more income. |
| Constructor | 80 | Builds and repairs buildings. |
| Scout | 50 | Fast, sees far. Good for grabbing flags and spotting for artillery. |
| Tank | 100 | Tough all-rounder. |
| Artillery | 140 | Very long range and splash damage, but it can only hit what your side can see. |

| Building | Cost | Role |
| --- | --- | --- |
| Recycler | — | Your HQ. Makes Scavengers and Constructors. Has a light defence gun. |
| Factory | 150 | Makes Scouts, Tanks and Artillery. |
| Scrap Silo | 60 | A closer drop-off point for Scavengers working far from home. |
| Gun Tower | 110 | Defensive turret. |

**A good first few minutes:** send your two Scouts to the nearest flags. Select
the Constructor, press `Q`, and place a Factory near your Recycler. Then build
a third Scavenger from the Recycler and start making Tanks.

---

## What's in this folder

You don't need to understand these to play. They're here so you know where to
point an AI assistant when you want to change something.

| File | What it does |
| --- | --- |
| `index.html` | The page itself: the top bar, bottom panel, menus and help screen. |
| `js/config.js` | **All the balance numbers.** Costs, health, speed, damage, starting scrap, difficulty. The easiest file to experiment with. |
| `js/map.js` | Builds the random, mirrored battlefield and finds routes around obstacles. |
| `js/sim.js` | The rules: movement, combat, gathering, building, flags, tickets, winning. |
| `js/ai.js` | The computer opponent's decision-making. |
| `js/render.js` | Draws everything on screen. |
| `js/main.js` | Mouse, keyboard, the on-screen panels, sound, and the main loop. |

### Changing the game with an AI assistant

Good requests are specific and name the file. For example:

- *"In `rts-game/js/config.js`, make Tanks cost 120 and give them 500 health."*
- *"In `rts-game/js/sim.js` and `config.js`, add a new unit called Rocket
  Buggy that is fast and does extra damage to buildings. Add it to the Factory."*
- *"In `rts-game/js/ai.js`, make the enemy build more Gun Towers on Hard."*
- *"In `rts-game/js/render.js`, draw Tanks with a longer barrel."*

After any change, reload `index.html` in your browser to try it. If something
breaks, the browser's developer console shows the error: press `F12` and open
the *Console* tab. Paste that error back to the AI.

See [`ROADMAP.md`](ROADMAP.md) for where the game could go next, including
online multiplayer.
