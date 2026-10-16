# Unit & building sprites: implementation brief

Replaces the placeholder shapes in `js/render.js` with the designed vehicles and buildings. Source of truth is `js/sprites.js` (included). It draws everything with vector shapes on the canvas, so it needs no image files and stays sharp at every zoom. It covers the art task in GAME_DESIGN.md §17 / Phase 8.

## Files

| File | Put it in | What it is |
| --- | --- | --- |
| `sprites.js` | `js/sprites.js` | All shape data + canvas draw functions. Exposes `window.UnitSprites`. |
| `UNIT_SPRITES.md` | repo root or `docs/` | This brief. |

Load it in `index.html` **before** `render.js`:

```html
<script src="js/sprites.js"></script>
```

## Conventions (already baked in)

- Units are **game pixels**, centred on the unit/building centre.
- Vehicles **face +x (right)**. Angle 0 = right, radians, same as the sim.
- Buildings are axis-aligned squares of `tiles × 32` px. They never rotate.
- Team colour: Blue `#4aa3ff`, Red `#ff5a4a`. Only the "team" panels change; hulls are neutral steel.
- Outline width is 0.6 px (scales with zoom).

## ID map (sprite id → game type)

| Sprite id | Game type | Size |
| --- | --- | --- |
| `tank` | Tank / Tank Mk II | Ø30, barrel to 22 |
| `scout` | Scout / Scout Mk II | Ø22 |
| `artillery` | Artillery / Artillery Mk II | Ø30, barrel to 36 |
| `constructor` | Constructor / Constructor II | Ø26 |
| `scavenger` | Scavenger / Scavenger II | Ø26 |
| `transport` | Transport | Ø28 |
| `recyclerV` | Recycler (mobile) | Ø44 |
| `recycler` | Recycler / Recycler II (deployed) | 3×3 = 96 |
| `factory` | Factory / Factory II | 3×3 = 96 |
| `repair` | Repair Pad | 3×3 = 96, flat |
| `extractor` | Extractor | 2×2 = 64 |
| `silo` | Base Silo | 2×2 = 64 |
| `exsilo` | Extractor Silo | 2×2 = 64 |
| `tower` | Gun Tower | 2×2 = 64 |
| `lab` | Research Lab | 2×2 = 64 |
| `radar` | Radar | 2×2 = 64 |

Mk II vehicles, Tier II workers and upgraded buildings use the **same id** with `mk: true`. That adds the gold chevrons (plus side skirts on the Tank Mk II, fins on the Scout Mk II and clamps on the Scavenger II).

## API

```js
UnitSprites.drawSprite(ctx, id, {
  x, y,            // world position (px)
  heading,         // rad, vehicles only
  turret,          // rad, RELATIVE to heading (tank, artillery, tower)
  team,            // 'blue' | 'red'
  mk,              // bool
  t,               // seconds (game time); drives spin + pulse animations
  legE,            // 0..1 artillery stabiliser extension
  fire,            // seconds since last shot, or null → recoil + muzzle flash
  shield,          // Transport: shield > 0
  shieldHit,       // Transport: hit in the last ~0.5 s → flicker
  wreck,           // vehicle wreck palette, turret knocked askew
  mask,            // debug: team areas white, rest dark
  scale            // optional extra scale
});
UnitSprites.drawDamage(ctx, id, x, y, t);            // smoke + scorch + sparks
UnitSprites.drawExplosion(ctx, id, x, y, p, team);   // p 0..1 over ~1.2 s
UnitSprites.drawCrater(ctx, id, x, y);               // destroyed-building remains
UnitSprites.bake(id, team, mk, res);                 // optional offscreen cache (no turret)
```

Call it inside the existing world transform (camera zoom/pan already applied), just as the current shape code is.

## Animations & rules

| Thing | Behaviour | Driven by |
| --- | --- | --- |
| Tank / Artillery / Gun Tower turret | Rotates independently of the hull. The sim already turns turrets at 4 rad/s. | `turret` |
| Firing (armed turrets) | Barrel recoils 3 px and eases back over 0.35 s. Muzzle flash for the first 0.14 s. | `fire` = time since shot |
| **Artillery stabilisers** | Four legs are hidden under the hull while it moves. To fire it must **stop**, extend its legs (0.6 s), fire, then retract (0.6 s) before moving. | `legE` |
| Radar dish | Rotates 90°/s constantly. | `t` |
| Extractor pump head | Spins 120°/s; centre glows. | `t` |
| Recycler (deployed) | Centre processing drum turns 25°/s. **No turret** (see open question). | `t` |
| Research Lab dome | Glow pulses. Pulse only while researching if you want (see below). | `t` |
| Repair Pad cross | Green cross pulses. | `t` |
| Factory bay lights | Blink. | `t` |
| Transport shield | Dashed bubble while shield > 0; flickers when hit; gone at 0. | `shield`, `shieldHit` |
| Damaged (HP < 50%) | Scorch marks, rising smoke, spark flicker. | `drawDamage` |
| Death (vehicle) | `drawExplosion` for 1.2 s; after p > 0.3 draw the sprite with `wreck: true` for the existing 20 s wreck fade. | |
| Death (building) | `drawExplosion`, then `drawCrater` (building is removed, per the rules). | |

### Required sim change: artillery must be stationary to fire

Add a per-unit `legE` (0..1) and a small state machine for Artillery and Artillery Mk II:

1. **Moving**: `legE = 0`. Cannot fire.
2. **Target in range and no move order** → stop, **Deploying**: `legE += dt / ARTILLERY.deploy`.
3. **Deployed** (`legE === 1`): may fire (existing 3.5 s reload, 110–440 range).
4. **Move order received** → **Retracting**: `legE -= dt / ARTILLERY.retract`. Movement is blocked until `legE === 0`.

Timings are exported as `UnitSprites.ARTILLERY` (`deploy: 0.6`, `retract: 0.6`). The deploy time adds to the first-shot delay, which is a small balance nerf worth noting in the change log.

## Integration steps

1. Add `js/sprites.js` and the script tag.
2. In `render.js`, replace each vehicle's and building's shape drawing with `UnitSprites.drawSprite(...)`, using the id map above.
3. Pass `turret` as `unit.turretAngle - unit.angle` (relative to the hull).
4. Track `lastShotTime` per armed unit and pass `fire = now - lastShotTime` (or `null` if it hasn't fired in the last 0.5 s).
5. Keep the existing health bars, selection ring, production/upgrade bars and fog handling. The sprite draws only the body.
6. Enemy buildings under fog: draw with `ctx.globalAlpha` reduced, as now.
7. Minimap: keep the current dots; sprites are too small there.
8. Performance (optional): if frame time rises, `bake()` the hull of each (id, team, mk) once and `drawImage` it, then draw only the turret/spin parts live.

## Open question for the designer

GAME_DESIGN.md says the deployed Recycler has a defence gun (210 range, 24 dmg). The art now has **no turret** on the Recycler, by request. Either remove the Recycler's gun from `config.js`, or fire it from the centre drum without a visible barrel. Confirm which before implementing.
