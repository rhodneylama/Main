# Kethra Concord (alien faction) sprites: implementation brief

Second playable faction. Same conventions as `UNIT_SPRITES.md` (read that first): vector canvas drawing in game pixels, centred on the unit, vehicles face +x (angle 0 = right), buildings are axis-aligned and never rotate. This brief lists only the differences.

## Files

| File | Put it in |
| --- | --- |
| `sprites_kethra.js` | `js/sprites_kethra.js`, exposes `window.KethraSprites` |

Load after `sprites.js` and before `render.js`. Use `KethraSprites.drawSprite` for Kethra-owned units and buildings, `UnitSprites.drawSprite` for Scrapline.

## Look

Hovering machines: no tracks or legs. Obsidian-violet hulls, pale ceramic blades floating apart from the body, hexagon/triangle/arc geometry, team colour as lit conduits. Blue Concord `#35d9ff`, Red Concord `#ff4f8b` (pass `team: 'blue' | 'red'` as before). Every vehicle draws a dashed gravity ring underneath.

## ID map (Kethra id → Scrapline counterpart)

| Id | Counterpart | Size |
| --- | --- | --- |
| `bulwark` | Tank | Ø30, lance to 22 |
| `talon` | Hornet (light rocket tank) | Ø26, rack to 17 |
| `shard` | Scout | Ø22 |
| `spire` | Artillery | Ø30, lance to 36 |
| `pylon` | Sentry (mobile turret) | Ø24, guns to 18 |
| `loom` | Constructor | Ø26 |
| `skimmer` | Scavenger | Ø26 |
| `ferry` | Transport | Ø28 |
| `monad` | Recycler (mobile) | Ø44 |
| `nexus` | Recycler | 96 (3×3) |
| `assembler` | Factory | 96 (3×3) |
| `lattice` | Repair Pad | 96 (3×3, flat) |
| `siphon` | Extractor | 64 (2×2) |
| `vault` | Base Silo | 64 (2×2) |
| `cell` | Extractor Silo | 64 (2×2) |
| `prism` | Gun Tower | 64 (2×2) |
| `archive` | Research Lab | 64 (2×2) |
| `array` | Radar | 64 (2×2) |

Upgraded variants use the same id with `mk: true` (gold markings): bulwark, shard, spire, loom, skimmer, nexus, assembler.

## API (differences from UnitSprites)

```js
KethraSprites.drawSprite(ctx, id, {
  x, y, heading, turret, team, mk, t,
  thrust,              // bool: unit is moving → exhaust glow (replaces walk cycles)
  legE,                // 0..1 anchor extension (spire, pylon)
  fire,                // seconds since shot or null → recoil + team-colour flash
  shield, shieldHit,   // ferry
  wreck, mask, scale
});
KethraSprites.drawDamage(ctx, id, x, y, t);
KethraSprites.drawExplosion(ctx, id, x, y, p, team);   // p 0..1 over ~1.2 s
KethraSprites.drawCrater(ctx, id, x, y);
KethraSprites.ARTILLERY, KethraSprites.SENTRY, KethraSprites.rapidFire(sec)
```

There is no `bake()`; call `drawSprite` directly.

## Animations

| Thing | Behaviour |
| --- | --- |
| Gravity ring | Dashed ring under every vehicle; brighter with `thrust`. |
| Turrets (bulwark, talon, spire, pylon, prism) | Independent rotation via `turret`; 3 px recoil and flash on `fire`. |
| Spire / Pylon anchors | Stationary-to-fire, same rules as Artillery and Sentry in UNIT_SPRITES.md: stop → anchors extend (0.6 s) → fire → retract (0.6 s) → move. Pylon fires every 0.2 s via `rapidFire`. |
| Loom, Monad, Nexus, Siphon, Archive, Sensor Array | Rotating ring / iris / dish / lattice, driven by `t`. |
| Nexus | Core beats slowly. No turret. |
| Assembler, Mending Lattice, Vault Orb, Siphon Cell | Pulsing glows, driven by `t`. |
| Ferry shield | Dashed bubble while shield > 0; flickers when hit. |
| Damage / death | `drawDamage` under 50% HP; vehicles explode then draw `wreck: true`; buildings explode then `drawCrater`. |

## Integration

1. Add `faction: 'scrapline' | 'kethra'` to unit and building definitions and choose the sprite module by faction.
2. Stats for equivalent classes can mirror the Scrapline ones; only the art differs.
3. Faction selection and AI faction choice are out of scope for this art drop.
