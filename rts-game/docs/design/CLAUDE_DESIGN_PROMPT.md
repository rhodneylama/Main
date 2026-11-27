# Prompt for Claude Design: Scrapline Command menus and screens

Paste everything below the line into Claude Design, and attach the
screenshots in `docs/design/screens/` (the `portrait-` ones matter most:
most play is on a phone held upright).

---

## What I need

Help me redesign the **menus and screens** of my browser strategy game,
**Scrapline Command**. Today they work and have just been simplified (fewer
buttons, more drop-downs), but they look plain: dark green boxes, system
font, flat buttons. I want them to look like a polished game with real
character, while staying fast, compact and readable on a phone, held upright
or sideways. The battlefield must get as much of the screen as possible.

Please give me:

1. **A visual direction**: two or three moods to pick from, each shown on
   the start screen, before you go further.
2. **A small design system** for the chosen direction: colour tokens,
   type (one display face for titles, one text face; Google Fonts are fine),
   spacing, corner radii, borders and panel style, and button styles
   (primary, secondary, danger, selected/active, disabled, a "ready" glow).
3. **Every screen in the list below**, each at three sizes:
   **phone upright, 390 × 844** (the one that matters most),
   **phone sideways, 844 × 390**, and **desktop, 1280 × 800**.
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
- **Phones, upright or sideways.** Design for 390 × 844 and 844 × 390, and
  check 360 × 740 (a small phone). Sideways there's very little height; no
  screen should need scrolling to reach its main buttons. Respect notches
  (safe-area insets). The game can also be installed to the Home Screen and
  run full screen.
- **Touch targets at least 44 px** on phones.
- **Readable at a glance**: text of 13 px or more on phones, strong
  contrast, nothing that relies on colour alone (the war map pairs colour
  with shapes and icons).
- **The battle screen must stay clear**: in-battle menus (pause, the
  drop-downs) sit over the action, so they should be compact and slightly
  see-through. **Keep the current structure**: the everyday actions as a few
  buttons, everything else in drop-downs; restyle it rather than adding
  buttons back.
- Keep animations light (CSS transitions, small SVG animations), with no
  heavy effects that would slow a phone.

## Screens to design

The IDs in brackets are what the code uses today. Please keep them.

1. **Start screen** (`#menu`, `.card.menu`): the game title, the tagline
   "Gather scrap. Build your base. Destroy theirs.", and the **faction
   choice**: two cards (`.faction`, `data-faction="scrapline"` / `"kethra"`),
   each with an animated line-up of that faction's vehicles drawn by the
   game into a `<canvas>` (keep a 300 × 110 canvas slot in each card). Then
   two drop-downs, **Battle** (`#modesel`: Destroy the Recycler / Capture the
   uplinks) and **Difficulty** (`#diffsel`), and the buttons **Start battle**
   (`#start`), **Campaign** (`#campaign`), Load game (`.loadbtn`) and **More
   ▾** (`#menumore`: How to play, Full screen, Open on its own page, Music,
   Watch AI vs AI).
2. **The battle's top bar** (`#topbar`): scrap (`#scrap`, "300 / 900"),
   units ("28 / 100"), your base's and the enemy's health (bars, hidden on
   narrow screens), the uplink status in uplink battles (three diamonds and
   a countdown), then the buttons **Army ▾** (`#q-army`), **Call-in**
   (`#q-callin`, with a count; it glows gold when one is ready),
   **Deselect** (`#q-clear`), **Map** (`#maptoggle`), the clock and **❚❚**
   (`#pausebtn`). On a 360 px phone all the buttons must fit on one row.
   The **minimap** (`#minimap-wrap`, a canvas) drops down from the Map
   button into the top-right corner, just under the bar.
3. **The battle's command panel** (`#panel`): a one- or two-line summary of
   what's selected (`#selinfo`, e.g. "18 vehicles · 9 × Tank · 5 × Hornet",
   or a building's health, or a vehicle's rank "Veteran · 3 kills"), then
   its command buttons (`#commands`). For vehicles: **Attack-move**, **Hunt
   ▾**, a stance drop-down showing the current stance (**Aggressive ▾** /
   Return fire / Stealth), **Orders ▾** (Guard, Patrol, Scout, Go repair)
   and **Stop**. For a Factory: one **production button** per vehicle, each
   with its price, a count badge, a progress fill while building, a − to
   remove one from the queue, and on a Factory II a **Mk I / Mk II chip**
   that opens a drop-down to pick which version it builds. For a
   Constructor: one button per building (some "Research first"), plus
   Rotate ↻ while placing a Shield Projector. On phones the panel may take
   at most about 38% of the height.
4. **Drop-down menus** (`#popmenu`): used by Army, Call-in, Hunt, the
   stance, Orders, the Mk picker and More. Each item has a label, sometimes
   a count or a one-line note, an active state, and section headings
   ("Jump to").
5. **New campaign** (`#warnew`): a short pitch for the theater "The Cinder
   Reach" (fifteen battlefields, your side holds the west), who you fight
   as, and a choice of **war pace** (`#warnew-pace`: Fast, Normal, Slow,
   Very slow, Hold, each with a one-line note), then "Begin the war" and
   "Back".
6. **War map** (`#war`): the heart of the campaign, a Helldivers-style war
   screen. A header with the theater name, "7 / 15 held · Scrapline vs
   Kethra Concord · Normal", a countdown "Next war report in 29:59", the pace
   buttons (`#war-pace`) and "Main menu". The **map** (`#war-map`, an SVG,
   viewBox `-4 -2 108 69`) shows 15 battlefields as nodes joined by links.
   Node states: held by you (blue) or the enemy (red); home ground (★, gold
   ring); a **battle in progress** (⚔, a two-colour ring showing how much is
   going your way, and a pulse); **your current battle** (gold pulse);
   **attackable** (dashed ring); **capture and hold** (◆ before the name);
   **selected**. Links on a front line are highlighted. Beside (or, upright,
   below) the map: a **detail panel** (`#war-detail`) with the battlefield's
   name, holder, type of battle, base level, a front bar for a battle in
   progress, both sides' starting forces, and **big action buttons**
   (Attack / Take command / Reinforce, each with a one-line explanation);
   then the **war reports** feed (`#war-log`).
7. **Landing zone** (`#lz`): before an attack, a picture of the battlefield
   (`#lz-map`, a canvas the game draws: terrain, gold geyser rings, the enemy
   base in red, landing zones A and B), and a card per zone (`.lzcard`:
   "Unclaimed geyser" / "Liberate a geyser", a description, the distance to
   the enemy base), plus "Back to the war map". A mission briefing.
8. **Dropping in** (`#wardrop`): a loading screen with a progress bar.
9. **Pause** (`#paused`): "PAUSED", Resume; Save, Load, Help, Full screen;
   Speed (×1/×2/×4 drop-down), Music, Volume; Leave battle (campaign) or Quit
   to menu.
10. **End of battle** (`#end`): Victory / Defeat, the reason, a small stats
    table for both sides, and "Play again" / "Back to the war map".
11. **Save / load** (`#saves`): four slot rows (Autosave, Slots 1–3) with
    descriptions and Save / Overwrite / Load / Delete; "Download this game",
    "Load from a file…", "Back".
12. **How to play** (`#help`): a long reference page. Needs comfortable
    reading and quick scanning, maybe sections in tabs.
13. **Messages** (`#log`, top left over the battlefield; `#toast`, a
    message at the bottom over any screen).

## On the battlefield (only if there's time)

These are drawn by the game on the canvas, so ideas or small style sheets
are welcome but not required: rank marks on veteran vehicles (1–3 gold
chevrons), the shield wall (blue, orange, red as it weakens), uplink masts,
drop pods, the landing-zone markers.

## Icons (inline SVG, about 24 px, one colour, `currentColor`)

Supply drop, reinforcements (a drop pod), uplink (a mast), shield,
power generator, radar, veteran rank (chevron), war report,
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

`portrait-*` are 390 × 844 (phone upright, double resolution),
`landscape-*` 844 × 390 (phone sideways), `desktop-*` 1280 × 800. In
order: start, the More menu, how to play, load, new campaign, the war map
(and with a battlefield selected), landing zone, a battle just after
landing, the Army menu with the minimap open, the stance drop-down, a
Factory II with the Mk I / Mk II picker, a shield wall under fire, pause,
end of battle.
