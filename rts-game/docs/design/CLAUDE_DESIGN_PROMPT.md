# Prompt for Claude Design: Scrapline Command menus and screens

Paste everything below the line into Claude Design, and attach the
screenshots in `docs/design/screens/` (the `phone-` ones matter most:
the game is played sideways on phones).

---

## What I need

Help me redesign the **menus and screens** of my browser strategy game,
**Scrapline Command**. Today they work but look plain: dark green boxes,
system font, flat buttons. I want them to look like a polished game with
real character, while staying fast and readable on a phone held sideways.

Please give me:

1. **A visual direction**: two or three moods to pick from, each shown on
   the start screen, before you go further.
2. **A small design system** for the chosen direction: colour tokens,
   type (one display face for titles, one text face; Google Fonts are fine),
   spacing, corner radii, borders and panel style, and button styles
   (primary, secondary, danger, selected/active, disabled, a "ready" glow).
3. **Every screen in the list below**, each at two sizes:
   **phone sideways, 844 × 390** (the one that matters most) and
   **desktop, 1280 × 800**.
4. **Small graphics as inline SVG**: a wordmark/logo for "Scrapline Command",
   an emblem for each faction, and icons for the things listed under
   "Icons" below.
5. The result as **HTML and CSS** I can hand to a developer, keeping the
   element IDs and class names listed here wherever you can, so the new look
   can be dropped into the existing game.

## The game in brief

A real-time strategy game inspired by *Battlezone 2*, with a war campaign
like *Helldivers 2*. You gather scrap, build a base, and fight with tanks,
hover-tanks, artillery and scouts, seen from above.

- **Two factions** that play the same but look different:
  - **Scrapline:** tracked steel war machines built from scrap. Think
    rust, olive drab, gunmetal, hazard stripes, stencilled lettering.
  - **Kethra Concord:** hovering alien constructs riding gravity rings.
    Think cyan and teal glow, violet accents, smooth plates, light.

  The whole interface should feel neutral-military, with each faction's
  colour coming through where that faction appears (faction cards, the
  emblem of the side you play).
- **Team colours in battle are fixed:** you are blue `#4aa3ff`, the enemy
  red `#ff5a4a`. On the war map, your side is blue and the enemy red. Please
  keep those two.
- **Current palette**, to evolve rather than keep: background `#0b0d0a`,
  panels `rgba(16,20,16,.88)`, edges `#3a4a38`, text `#dfe8da`, dim text
  `#93a08e`, accent green `#8cffa0`, warning `#f0c040`, bad `#ff6a5a`,
  scrap gold `#e8cf82`, call-in gold `#ffd25a`.

## Hard constraints

- **Plain HTML, CSS and JavaScript**, no frameworks and no build step. The
  battlefield is drawn on a `<canvas>`; the menus are ordinary HTML on top.
- **No image files.** Graphics must be inline SVG or CSS. Fonts from Google
  Fonts are fine.
- **Phones are played sideways only.** Design for 844 × 390 and check
  667 × 375 (a small phone). There's very little height: no screen should
  need scrolling to reach its main buttons. Respect notches (safe-area
  insets on the left and right).
- **Touch targets at least 44 px** on phones.
- **Readable at a glance**: text of 13 px or more on phones, strong
  contrast, nothing that relies on colour alone (the war map pairs colour
  with shapes and icons).
- **The battle screen must stay clear**: in-battle menus (pause, call-in)
  sit over the action, so they should be compact and slightly see-through.
- Keep animations light (CSS transitions, small SVG animations), with no
  heavy effects that would slow a phone.

## Screens to design

The IDs in brackets are what the code uses today.

1. **Start screen** (`#menu`, `.card.menu`): the game title, the tagline
   "Gather scrap. Build your base. Destroy theirs.", and the **faction choice**:
   two cards (`.faction`, `data-faction="scrapline"` / `"kethra"`), each with
   an animated line-up of that faction's vehicles drawn by the game into a
   `<canvas>` (keep a 300 × 110 canvas slot in each card). Below that, the
   **battle type** (`data-mode`: "Destroy the Recycler" / "Capture the
   uplinks"), **difficulty** (`data-difficulty`: Easy / Normal / Hard), and
   the buttons: **Start battle** (`#start`, primary), **Campaign**
   (`#campaign`, primary), Load game (`.loadbtn`), How to play (`#howto`),
   Watch AI vs AI (`#watch`), Music on/off (`.musicbtn`). On a phone
   sideways this all has to fit without scrolling: maybe faction cards on
   the left and options on the right.
2. **New campaign** (`#warnew`): a short pitch for the theater "The Cinder
   Reach" (fifteen battlefields, your side holds the west), who you fight
   as, and a choice of **war pace** (`#warnew-pace`, five cards: Fast,
   Normal, Slow, Very slow, Hold, each with a one-line note), then
   "Begin the war" and "Back".
3. **War map** (`#war`): the heart of the campaign, a Helldivers-style
   galactic-war screen. A header with the theater name, "7 / 15 held ·
   Scrapline vs Kethra Concord · Normal", a countdown "Next war report in
   29:59" and the pace buttons (`#war-pace`), plus "Main menu". The **map**
   (`#war-map`, an SVG, viewBox `-4 -2 108 69`) shows 15 battlefields as
   nodes joined by links. Node states to design:
   - held by you (blue) or the enemy (red);
   - home ground (★, a gold ring);
   - a **battle in progress** (⚔, with a two-colour ring showing how much
     is going your way, and a pulse);
   - **your current battle** (gold pulse);
   - **attackable** (an enemy node next to yours: dashed ring);
   - **capture-and-hold** battlefield (◆);
   - **selected**.

   Links on a front line (between a blue and a red node) are highlighted.
   Beside the map, a **detail panel** (`#war-detail`): the battlefield's
   name, who holds it, a front bar (blue vs red) for a battle in progress,
   what each side starts with, and **big action buttons** (Attack / Take
   command / Reinforce, each with a one-line explanation). Below it the
   **war reports** feed (`#war-log`), a timestamped list of events coloured
   good / bad / warning. On a phone sideways: map on the left, panel on the
   right.
4. **Landing zone** (`#lz`): before an attack, a picture of the battlefield
   (`#lz-map`, a canvas the game draws: terrain, gold geyser rings, the
   enemy base in red, landing zones A and B), and a card per zone
   (`.lzcard`): "Unclaimed geyser" or "Liberate a geyser", a description,
   and the distance to the enemy base. Plus "Back to the war map". Should
   feel like a mission briefing.
5. **Dropping in** (`#wardrop`): a loading screen with a progress bar
   while a battle in progress is fast-forwarded ("Dropping in to Gallows
   Pass. The battle has been raging for 4 minutes…").
6. **Pause** (`#paused`): "PAUSED", Resume, Help, Save game, Load game,
   Leave battle (campaign only), music on/off and volume.
7. **End of battle** (`#end`): Victory / Defeat, the reason ("Kethra
   Concord lost their Nexus."), a small stats table (vehicles built,
   enemies destroyed, vehicles lost, scrap gathered, for both sides), and
   "Play again" / "Back to the war map".
8. **Save / load** (`#saves`): four slot rows (Autosave, Slots 1–3), each
   with a description ("Scrapline · Normal · 12:40 into the battle · saved 2
   Nov, 14:05") and Save / Overwrite / Load / Delete; plus "Download this
   game", "Load from a file…", "Back".
9. **How to play** (`#help`): a long reference page (mission, factions,
   vehicles, controls, tips). Needs comfortable reading and quick scanning,
   maybe sections in tabs or columns on wide screens.
10. **Call-in menu** (`#callinmenu`, opened by the **Call-in** button in the
    battle's top bar, which shows how many are ready and glows gold when one
    is): two cards, **Supply drop** and **Reinforcements**, each with a
    one-line description, and a note on how more are earned.
11. **Turn your device** (`#rotate`): shown on a phone held upright, with an
    animated phone turning sideways and "Turn your device sideways".

**Optional, if there's time:** a tidier **in-battle top bar** (`#topbar`:
scrap, workers, units, both bases' health, the quick buttons Army /
Call-in / Base / Idle / Deselect, the uplink status with three diamonds
and a countdown, clock, speed, pause) and **command panel** (`#panel`: a
summary of what's selected, then a grid of command buttons, some with a
price and a progress fill). Both must stay compact on a phone sideways.

## Icons (inline SVG, about 24 px, one colour, `currentColor`)

Supply drop, reinforcements (a drop pod), uplink (a mast), war report,
war pace (a clock), attack, take command, reinforce, landing zone, battle
in progress (crossed swords), home ground (a star or flag), capture and
hold (a diamond), scrap, units, base, save, load, pause, music, help,
victory and defeat badges.

## Tone

Gritty military-industrial, not cartoonish: worn metal, stencils, radar
greens, warning stripes used sparingly. Think a commander's field terminal
rather than a mobile game store. Calm and readable first, flashy second.
Bold, condensed type for titles, a clean sans for everything else.

## The screenshots attached

`phone-*` are 844 × 390 (sideways phone, double resolution); `desktop-*` are
1280 × 800. In order: start, how to play, load, new campaign, war map (three
states), landing zone, a battle just after landing, the call-in menu, pause,
end of battle, the rotate screen (upright phone), and an uplink in battle.
