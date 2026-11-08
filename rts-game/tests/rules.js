// =============================================================================
// tests/rules.js — RULES TESTS
//
// Runs the game's rules without any graphics and checks they behave as
// designed. Run it from the project folder with:
//
//     node rts-game/tests/rules.js
//
// Each check prints PASS or FAIL. The last line says how many failed.
// =============================================================================

const fs = require('fs'), path = require('path'), vm = require('vm');
const dir = path.join(__dirname, '..', 'js');
const code = ['config', 'map', 'sim', 'ai', 'campaign'].map(f => fs.readFileSync(path.join(dir, f + '.js'), 'utf8')).join('\n');

// A fresh copy of the game code for each test, so tests can't affect each other.
function load() {
  const ctx = { console, Math, performance: { now: () => Date.now() }, btoa, atob };
  vm.createContext(ctx);
  vm.runInContext(code + '\n;Object.assign(globalThis, { CONFIG, UNIT_TYPES, BUILDING_TYPES, RESEARCH, TILE_ROCK, TILE_WATER, ' +
    'createGame, generateMap, stepGame, issueCommand, addUnit, addBuilding, findPath, canPlaceBuilding, scrapCapacity, bankScrap, ' +
    'aiUpdate, dist, isBlockedTile, padUnder, recycleValue, nameOf, FACTIONS, nearestOpenTile, saveGame, loadGame, THEATER, WAR_PACE, WAR_AWAY_CAP, createCampaign, warReport, catchUp, setPace, canAttack, support, neighbours, battleSetup, beginBattle, endBattle, fieldShare, addUnitNear, CALLINS, prepareBattle, landAttacker, landingZones, fortification, isBlockedAt, hitChance, snapFacing });', ctx);
  return ctx;
}

let fails = 0, passes = 0;
function check(name, ok, detail = '') {
  if (ok) passes++; else fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`);
}
function section(name) { console.log(`\n== ${name}`); }

const run = (g, S, seconds) => { for (let i = 0; i < seconds * S.CONFIG.TICK_RATE; i++) S.stepGame(g); };
const mine = (g, team, type) => g.entities.filter(e => e.team === team && e.type === type);

// A game with no computer players, team 1's Recycler deployed on its home geyser.
function deployedGame(S, seed = 42) {
  const g = S.createGame({ seed, difficulty: 'normal', aiTeams: [] });
  for (const t of [1, 2]) {
    const m = mine(g, t, 'mobileRecycler')[0];
    const gy = g.geysers.slice().sort((a, b) => S.dist(a, m) - S.dist(b, m))[0];
    S.issueCommand(g, t, { type: 'deploy', ids: [m.id], geyserId: gy.id });
  }
  run(g, S, 25);
  return g;
}

// The first spot near (x, y) in world pixels where team can place this building.
function spotFor(S, g, team, type, x, y) {
  const T = S.CONFIG.TILE, cx = Math.floor(x / T), cy = Math.floor(y / T);
  for (let r = 0; r < 20; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    if (S.canPlaceBuilding(g, team, type, cx + dx, cy + dy).ok) return { tx: cx + dx, ty: cy + dy };
  }
  return null;
}
function placeDone(S, g, team, type, near) {
  const s = spotFor(S, g, team, type, near.x, near.y);
  return s && S.addBuilding(g, type, team, s.tx, s.ty, true);
}

// -----------------------------------------------------------------------------
section('Map');
{
  const S = load();
  const seeds = [1, 2, 3, 42, 777, 1234, 9001, 31337, 55555, 80808];
  let sym = true, edge = true, reach = true, spacing = Infinity, geyserCount = true, half = true, mirrorG = true, mirrorS = true, fields = true;
  for (const seed of seeds) {
    const m = S.generateMap(seed), { W, H, tiles } = m;
    for (let i = 0; i < W * H && sym; i++) if (tiles[i] !== tiles[W * H - 1 - i]) sym = false;
    for (let x = 0; x < W; x++) if (tiles[x] !== S.TILE_ROCK || tiles[(H - 1) * W + x] !== S.TILE_ROCK) edge = false;
    for (let y = 0; y < H; y++) if (tiles[y * W] !== S.TILE_ROCK || tiles[y * W + W - 1] !== S.TILE_ROCK) edge = false;
    const gs = m.geysers;
    if (gs.length !== 20) geyserCount = false;
    for (let i = 0; i < gs.length; i++) for (let j = i + 1; j < gs.length; j++)
      spacing = Math.min(spacing, Math.hypot(gs[i].tx - gs[j].tx, gs[i].ty - gs[j].ty));
    const b1 = m.bases[1], b2 = m.bases[2];
    if (gs.filter(p => Math.hypot(p.tx - b1.x, p.ty - b1.y) < Math.hypot(p.tx - b2.x, p.ty - b2.y)).length !== 10) half = false;
    for (const p of gs) if (!gs.some(q => q.tx === W - p.tx && q.ty === H - p.ty)) mirrorG = false;
    const T = S.CONFIG.TILE;
    for (const p of m.scrap) if (!m.scrap.some(q => Math.abs(q.x - (W * T - p.x)) < 1e-6 && Math.abs(q.y - (H * T - p.y)) < 1e-6)) { mirrorS = false; break; }
    if (m.fields.length !== 36) fields = false;
    for (const f of m.fields) if (!m.fields.some(q => q.x === W - 1 - f.x && q.y === H - 1 - f.y)) fields = false;
    // Drive-ability: flood fill from base 1 reaches the enemy base, every geyser and every pile.
    const open = i => tiles[i] !== S.TILE_ROCK && tiles[i] !== S.TILE_WATER;
    const seen = new Uint8Array(W * H), stack = [b1.y * W + b1.x]; seen[stack[0]] = 1;
    while (stack.length) {
      const i = stack.pop(), x = i % W, y = (i / W) | 0;
      for (const j of [i + 1, i - 1, i + W, i - W]) if (j >= 0 && j < W * H && !seen[j] && open(j) && Math.abs((j % W) - x) <= 1) { seen[j] = 1; stack.push(j); }
    }
    if (!seen[b2.y * W + b2.x]) reach = false;
    for (const p of gs) if (!seen[p.ty * W + p.tx] && !seen[(p.ty - 1) * W + p.tx - 1]) reach = false;
    for (const p of m.scrap) { const i = Math.floor(p.y / T) * W + Math.floor(p.x / T); if (open(i) && !seen[i]) reach = false; }
  }
  const m = S.generateMap(42);
  check('map is 223 x 168 squares', m.W === 223 && m.H === 168, `${m.W} x ${m.H}`);
  check('bases sit in opposite corners', m.bases[1].x <= 12 && m.bases[1].y >= m.H - 12 && m.bases[2].x >= m.W - 12 && m.bases[2].y <= 11);
  check('terrain is point-symmetric (10 seeds)', sym);
  check('map edge is rock (10 seeds)', edge);
  check('20 geysers (10 seeds)', geyserCount);
  check('geysers at least 20 squares apart', spacing >= 20, `closest pair ${spacing.toFixed(1)}`);
  check('10 geysers on each half', half);
  check('geysers mirrored exactly', mirrorG);
  check('scrap piles mirrored exactly', mirrorS);
  check('36 scrap fields, mirrored', fields, `${S.generateMap(42).fields.length} fields`);
  check('bases, geysers and scrap all reachable (10 seeds)', reach);
}

section('Route-finding at full size');
{
  const S = load();
  const g = S.createGame({ seed: 42, aiTeams: [] });
  const u = mine(g, 1, 'tank')[0], foe = mine(g, 2, 'mobileRecycler')[0];
  const t0 = Date.now(); let p;
  for (let i = 0; i < 20; i++) p = S.findPath(g, u.x, u.y, foe.x, foe.y);
  const ms = (Date.now() - t0) / 20;
  const end = p[p.length - 1];
  check('a route exists from one base to the other', p.length > 0 && Math.hypot(end.x - foe.x, end.y - foe.y) < 80);
  check('a cross-map route takes under 15 ms', ms < 15, `${ms.toFixed(1)} ms`);
}

section('Recycler and economy');
{
  const S = load();
  const g = deployedGame(S);
  const rec = mine(g, 1, 'recycler')[0];
  check('the mobile Recycler deploys into a Recycler', !!rec && rec.built >= 1);
  check('the Recycler holds 300 scrap', S.scrapCapacity(g, 1) === 300);
  g.teams[1].scrap = 290; S.bankScrap(g, 1, 50, true);
  check('storage is capped', g.teams[1].scrap === 300);
  placeDone(S, g, 1, 'basesilo', rec);
  check('a Base Silo adds 300 storage', S.scrapCapacity(g, 1) === 600);
  // Take the Scavengers away so only the Recycler's own pump counts.
  for (const u of g.entities) if (u.team === 1 && u.def.role === 'harvester') u.hp = 0;
  run(g, S, 1);
  g.teams[1].scrap = 0; run(g, S, 60);
  const gain = g.teams[1].scrap;
  check('the Recycler pumps about 2 scrap a minute (a twentieth of an Extractor)', gain > 1.6 && gain < 2.6, gain.toFixed(2));
}

section('Workers and tech');
{
  const S = load();
  const g = deployedGame(S);
  const rec = mine(g, 1, 'recycler')[0];
  const free = g.geysers.filter(x => !x.extractorId).sort((a, b) => S.dist(a, rec) - S.dist(b, rec))[0];
  const scav = mine(g, 1, 'scavenger')[0];
  g.events.length = 0;
  S.issueCommand(g, 1, { type: 'deploy', ids: [scav.id], geyserId: free.id });
  check('a basic Scavenger cannot deploy', scav.order.type !== 'deploy');
  g.teams[1].scrap = 300;
  S.issueCommand(g, 1, { type: 'upgrade', buildingId: rec.id });
  run(g, S, 41);
  check('the Recycler upgrades to Recycler II', rec.level === 2);
  const s2 = S.addUnit(g, 'scavenger2', 1, rec.x + 60, rec.y);
  S.issueCommand(g, 1, { type: 'deploy', ids: [s2.id], geyserId: free.id });
  run(g, S, 90);
  check('a Scavenger II deploys as an Extractor', mine(g, 1, 'extractor').length === 1);
  const ex = mine(g, 1, 'extractor')[0];
  // Only the Extractor and the Recycler's trickle pay in: no Scavengers.
  for (const u of g.entities) if (u.team === 1 && u.def.role === 'harvester') u.hp = 0;
  run(g, S, 1);
  g.teams[1].scrap = 0; ex.stored = 0; run(g, S, 60);
  check('an Extractor pays about 42 scrap a minute straight into storage', Math.abs(g.teams[1].scrap - 42 - 2.1) < 2, g.teams[1].scrap.toFixed(1));
  g.teams[1].scrap = S.scrapCapacity(g, 1); run(g, S, 200);
  check('with storage full, an Extractor holds up to 120', Math.abs(ex.stored - 120) < 0.01, ex.stored.toFixed(1));
  g.teams[1].scrap = 0; run(g, S, 1);
  check('the held scrap flows in once there is room', ex.stored < 1 && g.teams[1].scrap >= 120, `${Math.round(g.teams[1].scrap)} banked`);
  check('no Transports or Extractor Silos exist', !S.UNIT_TYPES.transport && !S.BUILDING_TYPES.outsilo);
  const lab = placeDone(S, g, 1, 'lab', rec);
  g.teams[1].scrap = 300;
  S.issueCommand(g, 1, { type: 'research', buildingId: lab.id, key: 'tank2' });
  run(g, S, 61);
  check('research completes', !!g.teams[1].research.tank2);
}

section('Production queue');
{
  const S = load();
  const g = deployedGame(S);
  const rec = mine(g, 1, 'recycler')[0];
  placeDone(S, g, 1, 'basesilo', rec);
  const fac = placeDone(S, g, 1, 'factory', { x: rec.x + 200, y: rec.y - 150 });
  for (const u of g.entities) if (u.team === 1 && u.def.role === 'harvester') u.hp = 0;
  run(g, S, 0.1);
  g.teams[1].scrap = 250;
  S.issueCommand(g, 1, { type: 'produce', buildingId: fac.id, unit: 'tank', count: 12 });
  S.issueCommand(g, 1, { type: 'produce', buildingId: fac.id, unit: 'scout' });
  check('more than 5 vehicles can be queued', fac.queue.length === 13, `${fac.queue.length} queued`);
  S.stepGame(g);
  check('only the vehicle being built is paid for', Math.round(g.teams[1].scrap) === 150, `${Math.round(g.teams[1].scrap)} left`);
  const tanks0 = mine(g, 1, 'tank').length;
  run(g, S, 31);
  check('the queue keeps building while scrap lasts', mine(g, 1, 'tank').length === tanks0 + 2, `${mine(g, 1, 'tank').length - tanks0} built`);
  g.teams[1].scrap = 0; run(g, S, 20);
  check('with no scrap, the queue waits', fac.waiting && mine(g, 1, 'tank').length === tanks0 + 2);
  g.teams[1].scrap = 100; S.stepGame(g);
  const paidBefore = g.teams[1].scrap;
  S.issueCommand(g, 1, { type: 'cancel', buildingId: fac.id, unit: 'scout' });
  check('removing a waiting vehicle refunds nothing (it was never paid for)', g.teams[1].scrap === paidBefore && !fac.queue.includes('scout'));
  while (fac.queue.length > 1) S.issueCommand(g, 1, { type: 'cancel', buildingId: fac.id, unit: 'tank' });
  S.issueCommand(g, 1, { type: 'cancel', buildingId: fac.id, unit: 'tank' });
  check('cancelling the vehicle being built refunds its cost', g.teams[1].scrap === paidBefore + 100 && fac.queue.length === 0, `${g.teams[1].scrap}`);
}

section('Combat, demolish and the Repair Pad');
{
  const S = load();
  const g = deployedGame(S);
  const rec = mine(g, 1, 'recycler')[0];
  const tower = placeDone(S, g, 1, 'tower', { x: rec.x + 200, y: rec.y - 100 });
  const foe = S.addUnit(g, 'tank', 2, tower.x + 150, tower.y);
  const hp0 = foe.hp; run(g, S, 3);
  check('a Gun Tower shoots enemies in range', foe.hp < hp0);
  foe.hp = 0; run(g, S, 1);

  const fac = placeDone(S, g, 1, 'factory', { x: rec.x + 100, y: rec.y - 200 });
  const before = g.scrap.reduce((a, s) => a + s.amount, 0);
  S.issueCommand(g, 1, { type: 'demolish', buildingId: fac.id });
  run(g, S, 1);
  const after = g.scrap.reduce((a, s) => a + s.amount, 0);
  check('demolishing leaves half the cost as scrap', after - before === 75, `${after - before}`);

  const pad = placeDone(S, g, 1, 'repairpad', { x: rec.x + 100, y: rec.y - 200 });
  check('vehicles can drive over a Repair Pad', !S.isBlockedTile(g, pad.tx + 1, pad.ty + 1));
  const kinds = ['scout', 'tank', 'artillery', 'scavenger', 'constructor', 'scout2', 'tank2', 'artillery2', 'scavenger2', 'constructor2'];
  const hurt = kinds.map((k, i) => { const u = S.addUnit(g, k, 1, pad.x - 30 + (i % 4) * 20, pad.y - 30 + Math.floor(i / 4) * 20); u.hp = u.maxHp / 2; if (u.def.shield) u.shield = 0; return u; });
  run(g, S, 20);
  const healed = hurt.filter(u => u.hp >= u.maxHp - 1 || u.hp > u.maxHp * 0.5 + 300);
  check('every kind of vehicle is repaired on the pad', healed.length === kinds.length,
    hurt.filter(u => !healed.includes(u)).map(u => u.type).join(',') || 'all repaired');
}

section('Repair Pad: workers wait, and Recycle');
{
  const S = load();
  const g = deployedGame(S);
  const rec = mine(g, 1, 'recycler')[0];
  const pad = placeDone(S, g, 1, 'repairpad', { x: rec.x + 150, y: rec.y - 200 });
  // Hurt workers sent to the pad stay until repaired instead of going back to work.
  const scav = mine(g, 1, 'scavenger')[0];
  scav.hp = scav.maxHp * 0.3;
  S.issueCommand(g, 1, { type: 'gorepair', ids: [scav.id] });
  run(g, S, 60);
  check('a hurt Scavenger waits on the pad until fully repaired', scav.hp >= scav.maxHp - 1, `${Math.round(scav.hp)}/${scav.maxHp}`);
  run(g, S, 10);
  check('repaired workers then go back to work', !S.padUnder(g, scav) || scav.order.type !== 'idle');

  // Vehicles sent by Go repair drive off once fixed: beside the pad, or to its waypoint.
  const t1 = S.addUnit(g, 'tank', 1, rec.x + 80, rec.y - 60), t2b = S.addUnit(g, 'constructor', 1, rec.x + 100, rec.y - 60);
  t1.hp = 100; t2b.hp = 40;
  S.issueCommand(g, 1, { type: 'gorepair', ids: [t1.id, t2b.id] });
  run(g, S, 60);
  check('a repaired Tank leaves the pad by itself', t1.hp >= t1.maxHp - 1 && !S.padUnder(g, t1), `hp ${Math.round(t1.hp)}, on pad ${!!S.padUnder(g, t1)}`);
  check('a Constructor can Go repair and leaves once fixed', t2b.hp >= t2b.maxHp - 1 && !S.padUnder(g, t2b));
  const wp = { x: pad.x + 260, y: pad.y - 120 };
  S.issueCommand(g, 1, { type: 'rally', buildingId: pad.id, x: wp.x, y: wp.y });
  t1.hp = 100;
  S.issueCommand(g, 1, { type: 'gorepair', ids: [t1.id] });
  run(g, S, 60);
  check("a repaired vehicle drives to the pad's waypoint", S.dist(t1, wp) < 90, `${Math.round(S.dist(t1, wp))} px away`);
  S.issueCommand(g, 1, { type: 'rally', buildingId: pad.id, clear: true });
  t1.hp = 0; t2b.hp = 0; run(g, S, 0.1);

  // Recycle: half the cost back, only on the pad, never the Recycler.
  const T = S.CONFIG.TILE;
  const onPad = (k, i) => S.addUnit(g, k, 1, (pad.tx + 0.6 + i * 0.9) * T, (pad.ty + 1.5) * T);
  const tank = onPad('tank', 0), art2 = onPad('artillery2', 1), cons = onPad('constructor', 2);
  const away = S.addUnit(g, 'tank', 1, rec.x + 400, rec.y - 400);
  placeDone(S, g, 1, 'basesilo', rec);                     // room to bank the refund
  for (const u of g.entities) if (u.team === 1 && u.def.role === 'harvester') u.hp = 0;  // no deliveries meanwhile
  run(g, S, 0.1);
  g.teams[1].scrap = 0;
  S.issueCommand(g, 1, { type: 'recycle', ids: [tank.id, art2.id, cons.id, away.id] });
  run(g, S, 0.2);
  const want = [tank, art2, cons].reduce((a, u) => a + S.recycleValue(u), 0);
  check('recycling on the pad refunds half the cost', Math.round(g.teams[1].scrap) === want, `${g.teams[1].scrap} of ${want}`);
  check('recycled vehicles are removed', ![tank, art2, cons].some(u => g.entities.includes(u)));
  check('recycled vehicles leave no wreck or salvage', !g.scrap.some(p => p.id === 100000 + tank.id) && !g.effects.some(e => e.kind === 'wreck' && Math.hypot(e.x - tank.x, e.y - tank.y) < 1));
  check('a vehicle off the pad cannot be recycled', g.entities.includes(away) && away.hp > 0);
  const mobile = S.addUnit(g, 'mobileRecycler', 1, pad.x, pad.y);
  S.issueCommand(g, 1, { type: 'recycle', ids: [mobile.id] });
  run(g, S, 0.2);
  check('the mobile Recycler cannot be recycled', g.entities.includes(mobile) && mobile.hp > 0);
  mobile.hp = 0; run(g, S, 0.1);
  const enemy = S.addUnit(g, 'scout', 2, pad.x, pad.y);
  S.issueCommand(g, 1, { type: 'recycle', ids: [enemy.id] });
  S.issueCommand(g, 2, { type: 'recycle', ids: [enemy.id] });
  run(g, S, 0.2);
  check("nobody can recycle on the other side's pad", g.entities.includes(enemy));
  // Storage full: the refund that doesn't fit is left on the pad as loose scrap.
  g.teams[1].scrap = S.scrapCapacity(g, 1) - 10;
  const t2 = onPad('tank', 0);
  const before = g.scrap.reduce((a, p) => a + p.amount, 0);
  S.issueCommand(g, 1, { type: 'recycle', ids: [t2.id] });
  const after = g.scrap.reduce((a, p) => a + p.amount, 0);
  check('with storage full, the rest of the refund is left on the pad', g.teams[1].scrap === S.scrapCapacity(g, 1) && after - before === 40, `banked 10, ground ${after - before}`);
}

section('Guard');
{
  const S = load();
  const g = deployedGame(S);
  const rec = mine(g, 1, 'recycler')[0];
  // Escort: two Tanks guard a Scavenger that drives off; an enemy attacks it.
  const scav = S.addUnit(g, 'scavenger', 1, rec.x + 120, rec.y - 120);
  const g1 = S.addUnit(g, 'tank', 1, rec.x + 60, rec.y - 60), g2 = S.addUnit(g, 'tank', 1, rec.x + 80, rec.y - 40);
  S.issueCommand(g, 1, { type: 'guard', ids: [g1.id, g2.id], targetId: scav.id });
  const dest = { x: rec.x + 500, y: rec.y - 350 };
  S.issueCommand(g, 1, { type: 'move', ids: [scav.id], x: dest.x, y: dest.y });
  run(g, S, 25);
  check('guards follow the vehicle they guard', S.dist(g1, scav) < 130 && S.dist(g2, scav) < 130, `${Math.round(S.dist(g1, scav))} and ${Math.round(S.dist(g2, scav))} px away`);
  const foe = S.addUnit(g, 'scout', 2, scav.x + 150, scav.y);
  const hp0 = foe.hp; run(g, S, 4);
  check('guards attack an enemy near the guarded vehicle', foe.hp < hp0 || foe.hp <= 0 || !g.entities.includes(foe));
  scav.hp = 0; run(g, S, 0.2);
  check('guards stand down when the guarded vehicle is gone', g1.order.type === 'idle' && g2.order.type === 'idle');
  // Guard a building: any armed vehicle, not just Artillery.
  const tower = placeDone(S, g, 1, 'tower', { x: rec.x + 220, y: rec.y - 150 });
  S.issueCommand(g, 1, { type: 'guard', ids: [g1.id], targetId: tower.id });
  run(g, S, 25);
  check('a Tank can guard a building (takes a post beside it)', g1.order.type === 'guard' && Math.hypot(g1.x - g1.order.px, g1.y - g1.order.py) < 40 && S.dist(g1, tower) < 200, `${Math.round(S.dist(g1, tower))} px from the tower`);
}

section('Gun Tower upgrades');
{
  const S = load();
  const g = deployedGame(S);
  const rec = mine(g, 1, 'recycler')[0];
  const t1 = placeDone(S, g, 1, 'tower', { x: rec.x + 220, y: rec.y - 160 });
  const t2 = placeDone(S, g, 1, 'tower', { x: rec.x + 120, y: rec.y - 300 });
  g.teams[1].scrap = 300;
  S.issueCommand(g, 1, { type: 'upgrade', buildingId: t1.id, option: 'arttower' });
  check('an upgrade costs scrap (Artillery Tower 180)', g.teams[1].scrap === 120);
  S.issueCommand(g, 1, { type: 'upgrade', buildingId: t1.id, option: 'heavytower' });
  check('a tower can only upgrade one way', g.teams[1].scrap === 120);
  run(g, S, 31);
  check('a Gun Tower becomes an Artillery Tower', t1.variant === 'arttower' && t1.def.weapon.range === 520 && t1.def.name === 'Artillery Tower' && t1.maxHp === 1200);
  check('the base Gun Tower type is unchanged', S.BUILDING_TYPES.tower.weapon.range === 250 && t2.def.weapon.range === 250);
  // An enemy far beyond a Gun Tower's range, spotted by a friendly Scout.
  const ang = Math.atan2(-1, 1), d = 460;
  const foe = S.addUnit(g, 'tank', 2, t1.x + Math.cos(ang) * d, t1.y + Math.sin(ang) * d);
  foe.hp = foe.maxHp = 1e6; foe.def = Object.assign({}, foe.def, { weapon: undefined });
  S.addUnit(g, 'scout', 1, foe.x - 120, foe.y + 60);
  run(g, S, 8);
  check('an Artillery Tower shells a spotted enemy at long range', foe.hp < 1e6, `${Math.round(1e6 - foe.hp)} damage at ${d} px`);
  g.teams[1].scrap = 300;
  S.issueCommand(g, 1, { type: 'upgrade', buildingId: t2.id, option: 'heavytower' });
  run(g, S, 26);
  check('a Gun Tower becomes a Heavy Gun Tower', t2.variant === 'heavytower' && t2.maxHp === 1600 && t2.def.weapon.cooldown === 0.6);
}

section('Artillery stabilisers');
{
  const S = load();
  const g = deployedGame(S);
  const rec = mine(g, 1, 'recycler')[0];
  const T = S.CONFIG.TILE;
  // An open stretch of ground near the base, with room for a target 200 px east.
  let P = null;
  for (let k = 0; k < 2000 && !P; k += 8) {
    const x = rec.x + 150 + (k % 400), y = rec.y - 200 - Math.floor(k / 400) * 40;
    if (!S.isBlockedTile(g, Math.floor(x / T), Math.floor(y / T)) && !S.isBlockedTile(g, Math.floor((x + 200) / T), Math.floor(y / T))) P = { x, y };
  }
  const art = S.addUnit(g, 'artillery', 1, P.x, P.y);
  // A target inside the artillery's own sight that can't shoot back or die.
  const foe = S.addUnit(g, 'tank', 2, P.x + 200, P.y);
  foe.hp = foe.maxHp = 1e6; foe.def = Object.assign({}, foe.def, { weapon: undefined });
  let first = null;
  for (let i = 0; i < 90; i++) { S.stepGame(g); if (first === null && art.lastShot !== undefined) first = (i + 1) / 30; }
  check('artillery fires only after lowering its legs (about 0.6 s)', first !== null && first >= 0.55 && art.legE === 1, first && `${first.toFixed(2)} s`);
  const x0 = art.x, y0 = art.y;
  art.stance = 'return';   // keep driving (an aggressive one would stay and fight)
  S.issueCommand(g, 1, { type: 'move', ids: [art.id], x: art.x, y: art.y - 200 });
  let moved = null;
  for (let i = 0; i < 60; i++) { S.stepGame(g); if (moved === null && Math.hypot(art.x - x0, art.y - y0) > 1) moved = (i + 1) / 30; }
  check('artillery raises its legs before driving off (about 0.6 s)', moved !== null && moved >= 0.55, moved && `${moved.toFixed(2)} s`);
  S.issueCommand(g, 1, { type: 'move', ids: [art.id], x: P.x + 100, y: P.y + 400 });
  let firedMoving = false;
  for (let i = 0; i < 120; i++) { const shot = art.lastShot, px = art.x, py = art.y; S.stepGame(g); if (art.lastShot !== shot && Math.hypot(art.x - px, art.y - py) > 0.01) firedMoving = true; }
  check('artillery never fires while moving', !firedMoving);
}

section('Artillery fires on what its side can see');
{
  const S = load();
  const g = deployedGame(S);
  const rec = mine(g, 1, 'recycler')[0];
  const T = S.CONFIG.TILE, open = (x, y) => !S.isBlockedTile(g, Math.floor(x / T), Math.floor(y / T));
  let P = null;
  for (let k = 0; k < 4000 && !P; k += 8) {
    const x = rec.x + 150 + (k % 400), y = rec.y - 200 - Math.floor(k / 400) * 40;
    if (open(x, y) && open(x + 380, y) && open(x + 330, y + 60)) P = { x, y };
  }
  const art = S.addUnit(g, 'artillery', 1, P.x, P.y);
  // A harmless target past the artillery's own sight (220) but inside its range (440).
  const foe = S.addUnit(g, 'tank', 2, P.x + 380, P.y);
  foe.hp = foe.maxHp = 1e6; foe.def = Object.assign({}, foe.def, { weapon: undefined });
  run(g, S, 3);
  check('on its own, artillery does not fire at what it cannot see', art.lastShot === undefined);
  // A friendly Scout (unarmed for the test) spots the target.
  const spotter = S.addUnit(g, 'scout', 1, P.x + 330, P.y + 60);
  spotter.def = Object.assign({}, spotter.def, { weapon: undefined });
  run(g, S, 3);
  check('artillery fires at a target a friendly vehicle spots, out to its full range', art.lastShot !== undefined);
}

section('Hornet and Sentry');
{
  const S = load();
  const g = deployedGame(S);
  const rec = mine(g, 1, 'recycler')[0];
  const T = S.CONFIG.TILE, open = (x, y) => !S.isBlockedTile(g, Math.floor(x / T), Math.floor(y / T));
  const f = placeDone(S, g, 1, 'factory', { x: rec.x + 200, y: rec.y });
  check('a Factory builds Hornets and Sentries', ['hornet', 'sentry'].every(t => f.def.produces.includes(t)));
  const H = S.UNIT_TYPES.hornet, Tk = S.UNIT_TYPES.tank;
  const Sc = S.UNIT_TYPES.scout;
  check('the Hornet sits between a Scout and a Tank (cost, armour, speed)', H.cost > Sc.cost && H.cost < Tk.cost && H.hp > Sc.hp && H.hp < Tk.hp && H.speed < Sc.speed && H.speed > Tk.speed);
  let P = null;
  for (let k = 0; k < 4000 && !P; k += 8) {
    const x = rec.x + 150 + (k % 400), y = rec.y - 200 - Math.floor(k / 400) * 40;
    if (open(x, y) && open(x + 180, y)) P = { x, y };
  }
  // A Sentry with a harmless target in range: packed up it never fires; dug in,
  // legs first, then a rapid stream; it never moves or gives chase.
  const sen = S.addUnit(g, 'sentry', 1, P.x, P.y);
  const foe = S.addUnit(g, 'tank', 2, P.x + 180, P.y);
  foe.hp = foe.maxHp = 1e6; foe.def = Object.assign({}, foe.def, { weapon: undefined });
  run(g, S, 2);
  check('a packed-up Sentry does not fire', sen.lastShot === undefined);
  S.issueCommand(g, 1, { type: 'dig', ids: [sen.id] });
  const x0 = sen.x, y0 = sen.y;
  let first = null, shots = 0, last;
  for (let i = 0; i < 90; i++) { S.stepGame(g); if (sen.lastShot !== last) { last = sen.lastShot; if (last !== undefined) { shots++; if (first === null) first = (i + 1) / 30; } } }
  check('a dug-in Sentry lowers its legs before it fires (about 0.6 s)', first !== null && first >= 0.55, first && `${first.toFixed(2)} s`);
  check('then fires a rapid stream (several shots a second)', shots >= 8, `${shots} shots in 3 s`);
  foe.x += 200;   // the target backs out of range
  run(g, S, 3);
  check('a dug-in Sentry never moves or gives chase', Math.hypot(sen.x - x0, sen.y - y0) < 1 && sen.deployed);
  S.issueCommand(g, 1, { type: 'move', ids: [sen.id], x: P.x, y: P.y + 120 });
  run(g, S, 3);
  check('a move order packs it up and it drives off', !sen.deployed && Math.hypot(sen.x - x0, sen.y - y0) > 20);
  const hor = S.addUnit(g, 'hornet', 1, foe.x - 150, foe.y);
  let rocket = false;
  for (let i = 0; i < 60; i++) { S.stepGame(g); if (g.projectiles.some(p => p.owner === hor.id && p.kind === 'rocket')) rocket = true; }
  check('a Hornet fires rockets', rocket);
}

section('Factions');
{
  const S = load();
  const g = S.createGame({ seed: 42, difficulty: 'normal', aiTeams: [], factions: { 1: 'kethra', 2: 'scrapline' } });
  check('each side gets the faction it chose', g.teams[1].faction === 'kethra' && g.teams[2].faction === 'scrapline');
  const k = mine(g, 1, 'mobileRecycler')[0], sc = mine(g, 2, 'mobileRecycler')[0];
  check('vehicles carry their side\'s faction', k.faction === 'kethra' && sc.faction === 'scrapline');
  const t1 = S.addUnit(g, 'tank2', 1, k.x, k.y), t2 = S.addUnit(g, 'tank', 2, sc.x, sc.y);
  check('names are in each faction\'s words (Bulwark Mk II, Tank)', S.nameOf(t1) === 'Bulwark Mk II' && S.nameOf(t2) === 'Tank', `${S.nameOf(t1)}, ${S.nameOf(t2)}`);
  const gy = g.geysers.slice().sort((a, b) => S.dist(a, k) - S.dist(b, k))[0];
  S.issueCommand(g, 1, { type: 'deploy', ids: [k.id], geyserId: gy.id });
  run(g, S, 25);
  const nexus = mine(g, 1, 'recycler')[0];
  const said = g.events.filter(e => e.team === 1 && e.text).map(e => e.text);
  check('the Kethra Recycler is a Nexus, and its messages say so', S.nameOf(nexus) === 'Nexus' && said.some(t => /Nexus deploying/.test(t)) && !said.some(t => /Recycler/.test(t)), said.slice(0, 2).join(' / '));
  const same = Object.keys(S.UNIT_TYPES).every(t => S.UNIT_TYPES[t].hp > 0);
  check('both factions use the same unit numbers (only names differ)', same && t1.def === S.UNIT_TYPES.tank2);
  const g2 = S.createGame({ seed: 5, difficulty: 'normal', aiTeams: [] });
  check('a side with no faction chosen is Scrapline', g2.teams[1].faction === 'scrapline' && g2.teams[2].faction === 'scrapline');
}

section('Orders: stance, Hunt, Guard, spreading out');
{
  const S = load();
  // An empty battlefield with no computer players: team 1's vehicles at `from`.
  const field = () => {
    const g = S.createGame({ seed: 42, difficulty: 'normal', aiTeams: [] });
    for (const e of g.entities) e.hp = e.type === 'mobileRecycler' ? e.hp : 0;
    S.stepGame(g);
    return g;
  };
  const T = 32;
  // Open ground for a building of `size` near (x, y), ignoring territory.
  const openSpot = (g, x, y, size = 3) => {
    const cx = Math.floor(x / T), cy = Math.floor(y / T);
    for (let r = 0; r < 30; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      let ok = true;
      for (let yy = -1; yy <= size && ok; yy++) for (let xx = -1; xx <= size && ok; xx++) if (S.isBlockedTile(g, cx + dx + xx, cy + dy + yy)) ok = false;
      if (ok) return { tx: cx + dx, ty: cy + dy };
    }
    return null;
  };
  const runUntil = (g, sec, done) => { for (let i = 0; i < sec * 30; i++) { S.stepGame(g); if (done && done()) return i / 30; } return Infinity; };
  const hq1 = g => mine(g, 1, 'mobileRecycler')[0];
  // A group drives past an enemy tank sitting beside the route.
  const drive = stance => {
    const g = field(), h = hq1(g), from = { x: h.x + 300, y: h.y - 300 };
    const us = [0, 1, 2, 3].map(i => S.addUnitNear(g, 'tank', 1, from.x + (i % 2) * 36, from.y + Math.floor(i / 2) * 36));
    const dir = { x: Math.sign(g.map.W * T / 2 - h.x), y: Math.sign(g.map.H * T / 2 - h.y) };
    const dest = { x: from.x + dir.x * 1100, y: from.y };
    const foe = S.addUnitNear(g, 'tank', 2, from.x + dir.x * 550, from.y + 150);
    foe.stance = 'stealth';   // it just sits there
    if (stance) S.issueCommand(g, 1, { type: 'stance', ids: us.map(u => u.id), stance });
    S.issueCommand(g, 1, { type: 'move', ids: us.map(u => u.id), x: dest.x, y: dest.y });
    const t = runUntil(g, 90, () => us.every(u => u.order.type === 'idle'));
    return { t, foeHp: foe.hp / foe.maxHp, arrived: us.filter(u => S.dist(u, dest) < 150).length };
  };
  const ag = drive(null), st = drive('stealth'), rf = drive('return');
  check('vehicles are aggressive by default: an enemy beside the route gets attacked, then they carry on to where they were sent',
    ag.foeHp <= 0 && ag.arrived === 4, `enemy at ${Math.round(Math.max(0, ag.foeHp) * 100)}%, ${ag.arrived}/4 arrived`);
  check('Stealth: they hold fire and just drive there', st.foeHp === 1 && st.arrived === 4 && st.t < ag.t, `${st.t.toFixed(0)} s vs ${ag.t.toFixed(0)} s`);
  check('Return fire: they shoot what they pass but keep going', rf.foeHp < 1 && rf.arrived === 4 && rf.t < ag.t,
    `enemy at ${Math.round(Math.max(0, rf.foeHp) * 100)}%, ${rf.t.toFixed(0)} s`);

  // Hunt: as a pack, they find a known enemy building far away and destroy it, keeping together.
  {
    const g = field(), h = hq1(g);
    const us = [0, 1, 2, 3].map(i => S.addUnitNear(g, 'tank', 1, h.x + 250 + i * 36, h.y - 250));
    const far = openSpot(g, g.map.W * T / 2, g.map.H * T / 2);
    const b = S.addBuilding(g, 'factory', 2, far.tx, far.ty, true);
    b.seen[1] = true;
    S.issueCommand(g, 1, { type: 'hunt', ids: us.map(u => u.id), pack: true });
    let spread = 0;
    const t = runUntil(g, 240, () => {
      const c = { x: us.reduce((a, u) => a + u.x, 0) / 4, y: us.reduce((a, u) => a + u.y, 0) / 4 };
      if (g.tick % 30 === 0) spread = Math.max(spread, ...us.map(u => S.dist(u, c)));
      return b.hp <= 0;
    });
    check('Hunt as a pack: they go and destroy a known enemy far away', t < 240, `${Math.round(S.dist(h, b))} px away, ${Math.round(t)} s`);
    check('and the pack keeps together on the way', spread < 300, `furthest ${Math.round(spread)} px from the middle`);
    // With nothing known, hunters go searching.
    const g2 = field(), h2 = hq1(g2), lone = S.addUnitNear(g2, 'hornet', 1, h2.x + 250, h2.y - 250);
    S.issueCommand(g2, 1, { type: 'hunt', ids: [lone.id] });
    runUntil(g2, 20);
    check('Hunt with no enemy in sight: it goes searching', S.dist(lone, h2) > 500 && lone.order.type === 'hunt');
  }

  // Guard: the guarded building is shot at from beyond the guard's range; the guard goes after the attacker, then returns.
  {
    const g = deployedGame(S), rec = mine(g, 1, 'recycler')[0];
    for (const e of g.entities) if (e.team === 2 && e.type !== 'recycler') e.hp = 0;
    S.stepGame(g);
    const guard = S.addUnitNear(g, 'tank', 1, rec.x, rec.y - 150);
    S.issueCommand(g, 1, { type: 'guard', ids: [guard.id], targetId: rec.id });
    runUntil(g, 10);
    const post = { x: guard.order.px, y: guard.order.py };
    const away = S.dist(post, rec) > 0 ? { x: rec.x - (post.x - rec.x), y: rec.y - (post.y - rec.y) } : post;
    const k = (rec.radius * 0.8 + 180) / S.dist(away, rec);
    const foe = S.addUnitNear(g, 'tank', 2, rec.x + (away.x - rec.x) * k, rec.y + (away.y - rec.y) * k);
    S.issueCommand(g, 2, { type: 'attack', ids: [foe.id], targetId: rec.id });
    const t = runUntil(g, 40, () => foe.hp <= 0);
    check('a guard goes after whoever attacks what it guards, even out of its range', t < 40, `${Math.round(t)} s`);
    runUntil(g, 25);
    check('then goes back to its post', S.dist(guard, post) < 60, `${Math.round(S.dist(guard, post))} px from it`);
  }

  // An idle vehicle helps a friend under fire nearby.
  {
    const g = field(), h = hq1(g), p = { x: h.x + 400, y: h.y - 400 };
    const helper = S.addUnitNear(g, 'tank', 1, p.x, p.y);
    const friend = S.addUnitNear(g, 'tank', 1, p.x + 300, p.y);
    friend.stance = 'stealth';
    const foe = S.addUnitNear(g, 'tank', 2, p.x + 480, p.y);
    S.issueCommand(g, 2, { type: 'attack', ids: [foe.id], targetId: friend.id });
    const t = runUntil(g, 40, () => foe.hp <= 0);
    check('an idle vehicle drives over to help a friend under fire nearby', t < 40 && S.dist(helper, p) > 100, `${Math.round(t)} s`);
  }

  // Attacking together: they fan out round the target instead of piling into one clump.
  {
    const g = field(), h = hq1(g);
    const us = [...Array(8).keys()].map(i => S.addUnitNear(g, 'tank', 1, h.x + 250 + (i % 4) * 34, h.y - 250 - Math.floor(i / 4) * 34));
    const at = openSpot(g, h.x + 1300 * Math.sign(g.map.W * T / 2 - h.x), h.y - 250);
    const b = S.addBuilding(g, 'factory', 2, at.tx, at.ty, true);
    b.hp = b.maxHp = 50000; b.seen[1] = true;
    S.issueCommand(g, 1, { type: 'attack', ids: us.map(u => u.id), targetId: b.id });
    runUntil(g, 60, () => us.every(u => !u.path.length && S.dist(u, b) < 260));
    let near = 0;
    for (let i = 0; i < us.length; i++) for (let j = i + 1; j < us.length; j++) near = Math.max(near, 0) + (S.dist(us[i], us[j]) < 30 ? 1 : 0);
    const angles = us.map(u => Math.atan2(u.y - b.y, u.x - b.x)), mean = Math.atan2(angles.reduce((a, x) => a + Math.sin(x), 0), angles.reduce((a, x) => a + Math.cos(x), 0));
    const arc = Math.max(...angles.map(a => Math.abs(Math.atan2(Math.sin(a - mean), Math.cos(a - mean)))));
    check('a group attacking one target fans out in an arc around it', arc > 0.35 && near <= 2, `arc ±${arc.toFixed(2)} rad, ${near} pairs bumper to bumper`);
  }

  check('each side can have 100 units', S.CONFIG.UNIT_CAP === 100);
  // Two armies of 100 meet: the rules keep up (time is for this computer; phones are slower).
  {
    const g = S.createGame({ seed: 4, aiTeams: [] });
    const types = ['tank', 'tank', 'hornet', 'scout', 'artillery'];
    for (const t of [1, 2]) {
      const h = g.entities.find(e => e.team === t && e.type === 'mobileRecycler'), s = t === 1 ? 1 : -1;
      for (let i = 0; i < 93; i++) S.addUnitNear(g, types[i % 5], t, h.x + ((i % 10) - 5) * 30 * s + 200 * s, h.y - (Math.floor(i / 10) - 5) * 30 * s);
    }
    const mid = { x: g.map.W * T / 2, y: g.map.H * T / 2 };
    for (const t of [1, 2]) S.issueCommand(g, t, { type: 'move', ids: g.entities.filter(e => e.team === t && e.def.weapon && e.kind === 'unit').map(e => e.id), x: mid.x, y: mid.y });
    runUntil(g, 5);
    const t0 = Date.now(); runUntil(g, 60); const ms = (Date.now() - t0) / 60;
    check('200 vehicles fighting: each second of battle takes well under a second to work out', ms < 250, `${ms.toFixed(0)} ms per battle second`);
  }
}

section('Saving and loading');
{
  const S = load();
  const g = S.createGame({ seed: 9, difficulty: 'hard', aiTeams: [1, 2] });
  const step = x => { if (x.rng() < 0.5) { S.aiUpdate(x, 1); S.aiUpdate(x, 2); } else { S.aiUpdate(x, 2); S.aiUpdate(x, 1); } S.stepGame(x); x.events.length = 0; };
  for (let i = 0; i < 30 * 420; i++) step(g);
  const text = S.saveGame(g, { note: 'hi' });
  const { game: h, extra } = S.loadGame(text);
  check('a battle saves and loads (with the screen\'s own notes)', h.entities.length === g.entities.length && extra.note === 'hi', `${Math.round(text.length / 1024)} KB`);
  for (let i = 0; i < 30 * 180; i++) { step(g); step(h); }
  const sig = x => x.entities.map(e => `${e.id}:${e.x.toFixed(3)},${e.y.toFixed(3)},${e.hp.toFixed(2)}`).join('|') + `#${x.teams[1].scrap.toFixed(3)}#${x.teams[2].scrap.toFixed(3)}#${x.tick}`;
  check('a loaded battle plays on exactly as the original (3 more minutes, two computer players)', sig(g) === sig(h));
  let bad = false;
  try { S.loadGame('{"hello":1}'); } catch (err) { bad = true; }
  check('something that is not a save is refused', bad);
}

section('Campaign');
{
  const S = load();
  const n = S.THEATER.sectors.length;
  const linked = S.THEATER.links.every(([a, b]) => a !== b && a < n && b < n);
  // Every battlefield can be reached from every other.
  const seen = new Set([0]), todo = [0];
  while (todo.length) for (const j of S.neighbours(todo.pop())) if (!seen.has(j)) { seen.add(j); todo.push(j); }
  check('the theater has fifteen battlefields, all joined up', n === 15 && linked && seen.size === n);
  const c = S.createCampaign({ seed: 5, difficulty: 'normal', pace: 'normal', now: 0 });
  check('the war starts with each side holding its half, two battles under way',
    c.owner.filter(o => o === 'ally').length === 7 && Object.keys(c.battles).length === 2);
  const deep = S.THEATER.sectors.findIndex(s => s.capital === 'enemy');
  const near = [...Array(n).keys()].find(i => S.canAttack(c, i));
  check('you can attack an enemy battlefield next to yours, but not one behind enemy lines', near !== undefined && !S.canAttack(c, deep));
  let refused = false;
  try { S.beginBattle(c, deep, 'lead', 0); } catch (err) { refused = true; }
  check('starting an attack deep in enemy ground is refused', refused);
  // Holding the neighbours of a battlefield gives you a better start there.
  const x = JSON.parse(JSON.stringify(c)), before = S.battleSetup(x, near, 'lead').bonus[1].length;
  for (const j of S.neighbours(near)) x.owner[j] = 'ally';
  const after = S.battleSetup(x, near, 'lead');
  check('more neighbouring battlefields held means more vehicles at the start', after.bonus[1].length > before && after.allyLv > S.battleSetup(c, near, 'lead').allyLv,
    `${before} → ${after.bonus[1].length} extra vehicles`);
  const g = S.createGame({ seed: after.seed, mapSeed: after.mapSeed, aiTeams: [2], factions: after.factions, bonus: after.bonus });
  check('and they are there when the battle begins', g.entities.filter(e => e.team === 1 && e.kind === 'unit').length === 7 + after.bonus[1].length);
  const m1 = S.createGame({ seed: 1, mapSeed: after.mapSeed }), m2 = S.createGame({ seed: 2, mapSeed: after.mapSeed });
  check('each battlefield keeps its own map', m1.map.tiles.join() === m2.map.tiles.join() && m1.map.tiles.join() !== S.createGame({ seed: 1 }).map.tiles.join());
  // War reports run on real time, at the chosen pace, at most 12 while you're away.
  const y = S.createCampaign({ seed: 6, pace: 'fast', now: 0 });
  const ran = S.catchUp(y, 25 * 60e3);
  check('war reports come in as time passes (Fast: every 10 minutes)', ran === 2 && y.report === 2);
  const away = S.catchUp(y, 30 * 24 * 3600e3);
  check(`a month away moves the war only ${S.WAR_AWAY_CAP} reports`, away === S.WAR_AWAY_CAP);
  S.setPace(y, 'hold', 31 * 24 * 3600e3);
  check('on Hold the war waits', S.catchUp(y, 99 * 24 * 3600e3) === 0);
  // A paper war left alone on Normal doesn't run away from you.
  let decided = 0;
  for (let s = 1; s <= 10; s++) { const z = S.createCampaign({ seed: s, now: 0 }); for (let r = 0; r < 60; r++) S.warReport(z, r); if (z.outcome) decided++; }
  check('on Normal the AI commanders alone don\'t decide the war in 60 reports', decided === 0);
  // Your battle: win it and the battlefield is yours; leave and it goes back on paper.
  const w = S.createCampaign({ seed: 7, now: 0 });
  S.beginBattle(w, near, 'lead', 0);
  S.endBattle(w, 'won', 0.5, 1);
  check('win your battle and the battlefield is yours', w.owner[near] === 'ally' && !w.battles[near] && !w.playing);
  S.beginBattle(w, 7, 'command', 2);
  S.endBattle(w, 'left', 0.8, 3);
  check('leave a battle and it carries on, on paper, from how it stood', w.battles[7] && w.battles[7].p === 80 && !w.playing);
  // Reinforce: your strike force is yours alone; the allied commander sends you more.
  const rs = S.battleSetup(w, 7, 'reinforce');
  const r = S.createGame({ seed: rs.seed, mapSeed: rs.mapSeed, aiTeams: [1, 2], factions: rs.factions, bonus: rs.bonus });
  r.teams[1].shareEvery = rs.shareEvery;
  const hq = r.entities.find(e => e.team === 1 && e.type === 'mobileRecycler');
  const force = rs.reinforce.map(t => { const u = S.addUnitNear(r, t, 1, hq.x + 200, hq.y); u.cmdr = 'player'; return u; });
  const spot = force.map(u => `${u.x},${u.y}`).join();
  const stepR = () => { if (r.rng() < 0.5) { S.aiUpdate(r, 1); S.aiUpdate(r, 2); } else { S.aiUpdate(r, 2); S.aiUpdate(r, 1); } S.stepGame(r); r.events.length = 0; };
  for (let i = 0; i < 30 * 600 && !r.winner; i++) stepR();
  const yours = r.entities.filter(e => e.cmdr === 'player');
  check('the allied commander never moves your strike force', force.every(u => u.hp <= 0 || u.order.type === 'idle' || u.order.type === 'guard') || spot === force.map(u => `${u.x},${u.y}`).join(),
    force.map(u => u.order.type).join());
  check('and sends you some of the vehicles it builds', yours.length > force.filter(u => u.hp > 0).length || r.teams[1].shared >= rs.shareEvery,
    `${r.teams[1].shared || 0} built, ${yours.length} yours`);
}

section('Uplinks and call-ins');
{
  const S = load();
  const g = S.createGame({ seed: 11, aiTeams: [], uplinks: true });
  check('an uplink battle has three uplinks on open ground, the middle one in the middle', g.uplinks.length === 3 &&
    g.uplinks.every(u => !S.isBlockedAt(g, u.x, u.y)) && S.dist(g.uplinks[0], { x: g.map.W * 16, y: g.map.H * 16 }) < 400);
  const W = g.map.W * 32, H = g.map.H * 32;
  check('the two side uplinks mirror each other', Math.abs(g.uplinks[1].x + g.uplinks[2].x - W) < 400 && Math.abs(g.uplinks[1].y + g.uplinks[2].y - H) < 400);
  const run = (sec) => { for (let i = 0; i < sec * 30; i++) S.stepGame(g); };
  const put = (team, u, n) => [...Array(n).keys()].map(k => S.addUnitNear(g, 'tank', team, u.x + (k - n / 2) * 30, u.y + 20));
  const a = put(1, g.uplinks[1], 1);
  run(S.CONFIG.UPLINK_CAPTURE / 3 + 1);
  const partial = g.uplinks[1].p;
  run(S.CONFIG.UPLINK_CAPTURE);
  check('one vehicle on an uplink captures it in about 15 s', g.uplinks[1].owner === 1 && partial > 0.2 && partial < 0.6, `${Math.round(partial * 100)}% after 6 s`);
  const b = put(2, g.uplinks[1], 2); for (const u of [...a, ...b]) u.stance = 'stealth';
  const before = g.uplinks[1].p; run(5);
  check('with both sides on it, nothing changes', g.uplinks[1].contested && g.uplinks[1].p === before);
  for (const u of b) u.hp = 0;
  put(1, g.uplinks[2], 3);
  run(8);
  check('three vehicles capture three times as fast', g.uplinks[2].owner === 1);
  const callinsBefore = g.teams[1].callins;
  run(Math.max(0, S.CONFIG.UPLINK_ONLINE - g.time) + 2);
  check('holding two only starts the countdown once the uplinks are online', g.uplinkHold.team === 1 && g.uplinkHold.since >= S.CONFIG.UPLINK_ONLINE);
  run(S.CONFIG.UPLINK_WIN + 1);
  check('hold two for 3 minutes and you win', g.winner === 1 && /uplinks/.test(g.endReason), g.endReason);
  check('uplinks held earn call-ins', g.teams[1].callins > callinsBefore, `${callinsBefore} → ${g.teams[1].callins}`);

  const h = S.createGame({ seed: 12, aiTeams: [] });
  check('everyone starts a battle with one call-in', h.teams[1].callins === 1 && h.teams[2].callins === 1);
  const m = h.entities.find(e => e.team === 1 && e.type === 'mobileRecycler');
  h.teams[1].scrap = 0;
  S.issueCommand(h, 1, { type: 'callin', kind: 'supply' });
  for (let i = 0; i < 30 * (S.CONFIG.CALLIN_DELAY + 0.5); i++) S.stepGame(h);
  check('a supply drop lands a few seconds later with 300 scrap', h.teams[1].scrap === 300 && h.teams[1].callins === 0);
  S.issueCommand(h, 1, { type: 'callin', kind: 'reinforce', x: m.x + 200, y: m.y });
  const n0 = h.entities.filter(e => e.team === 1).length;
  for (let i = 0; i < 30 * 6; i++) S.stepGame(h);
  check('with none left, nothing more can be called', h.entities.filter(e => e.team === 1).length === n0);
  h.teams[1].callins = 1;
  S.issueCommand(h, 1, { type: 'callin', kind: 'reinforce', x: m.x + 200 * Math.sign(h.map.W * 16 - m.x), y: m.y });
  for (let i = 0; i < 30 * (S.CONFIG.CALLIN_DELAY + 0.5); i++) S.stepGame(h);
  const dropped = h.entities.filter(e => e.team === 1 && e.kind === 'unit').length - (n0 - 0);
  check('reinforcements: 2 Tanks and 2 Hornets land where you chose', h.lastDrop && h.lastDrop.ids.length === 4 && h.lastDrop.ids.every(id => S.dist(h.byId.get(id), m) < 300));
  h.teams[1].callins = 1;
  S.issueCommand(h, 1, { type: 'callin', kind: 'reinforce', x: h.map.W * 32 - m.x, y: h.map.H * 32 - m.y });
  check('but only on ground you have explored', h.teams[1].callins === 1);
}

{
  // The computer opponent's call-ins actually land (aimed at open ground).
  const S = load();
  const g = S.createGame({ seed: 5, difficulty: 'normal', aiTeams: [1, 2] });
  for (let i = 0; i < 30 * 200 && !g.lastDrop; i++) { S.aiUpdate(g, 1); S.aiUpdate(g, 2); S.stepGame(g); g.events.length = 0; }
  check('the computer opponent uses its call-ins too', g.teams[1].callins + g.teams[2].callins < 2, `${g.teams[1].callins} and ${g.teams[2].callins} left after ${Math.round(g.time)} s`);
}

section('Campaign battlefields');
{
  const S = load();
  const c = S.createCampaign({ seed: 3, now: 0 });
  const near = [...Array(15).keys()].find(i => S.canAttack(c, i));
  const setup = S.battleSetup(c, near, 'lead');
  const prep = S.prepareBattle(setup, [2]);
  const g = prep.game, def = prep.defender;
  const has = type => g.entities.filter(e => e.team === def && e.type === type).length;
  check('the side holding a battlefield starts with a base there', setup.defender === 2 && has('recycler') === 1 && has('factory') === 1 && has('tower') >= 1 && has('extractor') >= 1,
    `level ${setup.fort}: ${has('extractor')} Extractors, ${has('tower')} Gun Towers`);
  const x = JSON.parse(JSON.stringify(c)); x.owner[near] = 'enemy';
  for (const j of S.neighbours(near)) x.owner[j] = 'enemy';
  x.heldSince[near] = -20;
  check('a battlefield held longer, with more support around it, is more built up', S.fortification(x, near) > S.fortification(c, near),
    `${S.fortification(c, near)} → ${S.fortification(x, near)}`);
  check('two landing zones to choose from, well clear of their defences', prep.zones.length === 2 &&
    prep.zones.every(z => Math.min(...g.entities.filter(e => e.team === def && e.kind === 'building').map(b => S.dist(b, z))) > 500), prep.zones.map(z => z.key).join(' + '));
  const lib = prep.zones.find(z => z.key === 'liberate');
  {
    const hqd = g.entities.find(e => e.team === def && e.type === 'recycler'), oc = g.map.bases[g.corner[3 - def]], home = { x: (oc.x + 0.5) * 32, y: (oc.y + 0.5) * 32 };
    check('landing zones are always on the far half of the map from their base', prep.zones.every(z => S.dist(z, hqd) > S.dist(z, home)));
  }
  check('one of them next to an Extractor of theirs to liberate (from base level 2)', setup.fort < 2 || !!lib);
  S.landAttacker(prep, setup, prep.zones[1]);
  const mob = g.entities.find(e => e.team === 1 && e.type === 'mobileRecycler');
  check('you land at the zone you chose, Recycler on wheels, with a strike force', mob && S.dist(mob, prep.zones[1]) < 200 &&
    g.entities.filter(e => e.team === 1 && e.def.role === 'combat').length >= 6);
  check('the landing brings three call-ins', g.teams[1].callins === 3);
  check('with supply crates to start on, and knowing where their Recycler is',
    g.scrap.filter(n => S.dist(n, prep.zones[1]) < 400).length >= 4 && g.entities.find(e => e.team === def && e.type === 'recycler').seen[1]);
  check('campaign battles run faster (economy and production)', g.tempo > 1 && g.teams[1].incomeMult === g.tempo);
  const up = S.THEATER.sectors.findIndex(s => s.uplinks);
  const us = S.battleSetup(c, up, 'command');
  check('some battlefields are capture-and-hold', us.uplinks && S.prepareBattle(us, [1, 2]).game.uplinks.length === 3);
}

section('Hit and miss, shooting on the move');
{
  const S = load();
  const g = S.createGame({ seed: 21, aiTeams: [] });
  for (const e of g.entities) if (e.type !== 'mobileRecycler') e.hp = 0;
  S.stepGame(g);
  const h = g.entities.find(e => e.team === 1 && e.type === 'mobileRecycler');
  const tank = S.addUnitNear(g, 'tank', 1, h.x + 300, h.y - 300), scout = S.addUnitNear(g, 'scout', 2, h.x + 450, h.y - 300);
  const still = S.hitChance(g, tank, scout, 150);
  scout.movingTick = g.tick;
  const moving = S.hitChance(g, tank, scout, 150), far = S.hitChance(g, tank, scout, 200);
  tank.movingTick = g.tick;
  const both = S.hitChance(g, tank, scout, 150);
  check('shots can miss: less likely to hit a fast mover, at long range, or when firing on the move', still > moving && moving > far && moving > both && both > 0.3,
    `${Math.round(still * 100)}% still, ${Math.round(moving * 100)}% moving, ${Math.round(far * 100)}% at full range, ${Math.round(both * 100)}% both moving`);
  check('buildings are always hit', S.hitChance(g, tank, h, 150) === 1 || S.hitChance(g, tank, { kind: 'building', def: {} }, 150) === 1);
  // Two tanks fight: some shots miss, and they keep moving while they fire.
  const a = S.addUnitNear(g, 'tank', 1, h.x + 600, h.y - 500), b = S.addUnitNear(g, 'tank', 2, h.x + 760, h.y - 500);
  let shots = 0, hits = 0, moved = 0;
  const hpb = () => b.hp;
  let last = a.lastShot, lastHp = b.hp, x0 = a.x, y0 = a.y;
  S.issueCommand(g, 1, { type: 'attack', ids: [a.id], targetId: b.id });
  for (let i = 0; i < 30 * 40 && b.hp > 0 && a.hp > 0; i++) {
    S.stepGame(g);
    if (a.lastShot !== last) { last = a.lastShot; shots++; }
    if (b.hp < lastHp) { hits++; lastHp = b.hp; }
    if (i % 30 === 0) { moved = Math.max(moved, Math.hypot(a.x - x0, a.y - y0)); }
  }
  check('in a fight some shots miss', shots > 4 && hits < shots, `${hits} hits from ${shots} shots`);
  check('and vehicles keep moving while they fire', moved > 60, `moved ${Math.round(moved)} px while fighting`);
}

section('Shields');
{
  const S = load();
  const g = deployedGame(S), rec = mine(g, 1, 'recycler')[0], T = S.CONFIG.TILE;
  for (const e of g.entities) if (e.team === 2 && e.type !== 'recycler') e.hp = 0;
  S.stepGame(g);
  g.teams[1].scrap = 300;
  const toward = Math.atan2(g.map.H * 16 - rec.y, g.map.W * 16 - rec.x);
  const sh = placeDone(S, g, 1, 'shield', { x: rec.x + Math.cos(toward) * 200, y: rec.y + Math.sin(toward) * 200 });
  sh.facing = S.snapFacing(toward);
  for (let i = 0; i < 30 * 20; i++) S.stepGame(g);
  check('a Shield Projector without a Generator has no field', !sh.powered && (!g.activeFields || !g.activeFields.length));
  placeDone(S, g, 1, 'generator', rec);
  for (let i = 0; i < 30 * 3; i++) S.stepGame(g);
  check('with a Power Generator it starts up (after its reboot time)', sh.powered && sh.field.state === 'down');
  for (let i = 0; i < 30 * (S.CONFIG.ACC_MIN + S.BUILDING_TYPES.shield.field.reboot); i++) S.stepGame(g);
  check('then the field is up', sh.field.state === 'up' && g.activeFields.length === 1);
  g.teams[1].incomeMult = 0;   // no income, to see the upkeep
  const scrap0 = g.teams[1].scrap;
  for (let i = 0; i < 30 * 10; i++) S.stepGame(g);
  check('a powered projector burns scrap (6 a minute)', Math.abs((scrap0 - g.teams[1].scrap) - 1) < 0.2, `${(scrap0 - g.teams[1].scrap).toFixed(2)} in 10 s`);
  // An enemy tank shoots at the projector from the front: the field takes it.
  const fx = Math.cos(sh.facing), fy = Math.sin(sh.facing);
  const front = S.addUnitNear(g, 'tank', 2, sh.x + fx * 200, sh.y + fy * 200);
  for (let i = 0; i < 3; i++) S.stepGame(g);   // let it see the projector
  const field0 = sh.field.hp, hp0 = sh.hp;
  S.issueCommand(g, 2, { type: 'attack', ids: [front.id], targetId: sh.id });
  for (let i = 0; i < 30 * 6; i++) S.stepGame(g);
  check('enemy fire from the front is stopped by the field', sh.field.hp < field0 && sh.hp === hp0, `field ${Math.round(field0)} → ${Math.round(sh.field.hp)}, projector ${Math.round(sh.hp)}`);
  // From behind it gets through.
  front.hp = 0;
  const back = S.addUnitNear(g, 'tank', 2, sh.x - fx * 150, sh.y - fy * 150);
  S.issueCommand(g, 2, { type: 'attack', ids: [back.id], targetId: sh.id });
  for (let i = 0; i < 30 * 6; i++) S.stepGame(g);
  check('but fire from behind gets through (the field faces one way)', sh.hp < hp0);
  back.hp = 0; S.stepGame(g);
  // Knock it down: it collapses, then reboots.
  sh.field.hp = 5;
  const hammer = S.addUnitNear(g, 'tank', 2, sh.x + fx * 200, sh.y + fy * 200);
  S.issueCommand(g, 2, { type: 'attack', ids: [hammer.id], targetId: sh.id });
  for (let i = 0; i < 30 * 4 && sh.field.state === 'up'; i++) S.stepGame(g);
  check('a field shot down collapses and leaves the projector open', sh.field.state === 'down' && !g.activeFields.some(f => f.b === sh));
  hammer.hp = 0;
  for (let i = 0; i < 30 * (S.BUILDING_TYPES.shield.field.reboot + 1); i++) S.stepGame(g);
  check('then reboots after 15 s, partly charged', sh.field.state === 'up' && sh.field.hp < S.BUILDING_TYPES.shield.field.hp * 0.5);
  // One Generator powers four.
  const more = [1, 2, 3, 4].map(k => placeDone(S, g, 1, 'shield', { x: rec.x - Math.cos(toward) * (150 + k * 80), y: rec.y - Math.sin(toward) * (150 + k * 80) })).filter(Boolean);
  S.stepGame(g);
  const powered = g.entities.filter(e => e.type === 'shield' && e.team === 1 && e.powered).length;
  check('one Generator powers four Shield Projectors', more.length === 4 && powered === 4, `${powered} of ${more.length + 1} powered`);
  g.teams[1].scrap = 0; S.stepGame(g);
  check('with no scrap the shields go down', !g.entities.some(e => e.type === 'shield' && e.powered));
}

section('Radar anywhere, Radar upgrades, Forcefield Tech');
{
  const S = load();
  const g = deployedGame(S), rec = mine(g, 1, 'recycler')[0], T = S.CONFIG.TILE;
  // Somewhere explored but well outside the base's territory.
  for (let i = 0; i < g.teams[1].explored.length; i++) g.teams[1].explored[i] = 1;
  const far = { x: rec.x + 1400 * Math.sign(g.map.W * 16 - rec.x), y: rec.y - 900 * Math.sign(rec.y - g.map.H * 16) };
  let spot = null;
  for (let r = 0; r < 25 && !spot; r++) for (let dy = -r; dy <= r && !spot; dy++) for (let dx = -r; dx <= r && !spot; dx++) {
    const tx = Math.floor(far.x / T) + dx, ty = Math.floor(far.y / T) + dy;
    if (S.canPlaceBuilding(g, 1, 'radar', tx, ty).ok) spot = { tx, ty };
  }
  check('a Radar can be built anywhere explored, outside your territory', !!spot && !S.canPlaceBuilding(g, 1, 'tower', spot.tx, spot.ty).ok);
  const radar = S.addBuilding(g, 'radar', 1, spot.tx, spot.ty, true);
  const near = spotFor(S, g, 1, 'tower', radar.x + 80, radar.y + 80);
  check('and lets you build around it (a small territory, like a Lab\'s)', !!near && Math.hypot((near.tx + 1) * T - radar.x, (near.ty + 1) * T - radar.y) < 7 * T && S.BUILDING_TYPES.radar.buildRadius === S.BUILDING_TYPES.lab.buildRadius);
  const pings = () => g.teams[1].pings.length;
  const countPings = sec => { let n = 0, last = radar.pingTimer; for (let i = 0; i < sec * 30; i++) { S.stepGame(g); if (radar.pingTimer > last + 1) n++; last = radar.pingTimer; } return n; };
  radar.pingTimer = 0.01;
  check('a Radar pings every 30 s', countPings(61) === 3);   // at 0, 30 and 60 s
  g.teams[1].scrap = 900; g.teams[1].incomeMult = 0;
  S.issueCommand(g, 1, { type: 'upgrade', buildingId: radar.id });
  for (let i = 0; i < 30 * 31; i++) S.stepGame(g);
  radar.pingTimer = 0.01;
  check('Radar II pings every 15 s', radar.level === 2 && countPings(61) === 5 && S.nameOf(radar) === 'Radar II');
  g.teams[1].scrap = 900;   // more than storage holds, just for this check
  const before = g.teams[1].scrap;
  S.issueCommand(g, 1, { type: 'upgrade', buildingId: radar.id });
  check('each upgrade costs more (250, then 500)', before - g.teams[1].scrap === 500 && S.BUILDING_TYPES.radar.levels[0].cost === 250);
  for (let i = 0; i < 30 * 46; i++) S.stepGame(g);
  const W = g.map.W, at = (Math.floor(radar.y / T) - 15) * W + Math.floor(radar.x / T);
  let seen = 0; for (let i = 0; i < 30 * 10; i++) { S.stepGame(g); if (g.teams[1].vis[at]) seen++; }
  check('Radar III keeps its circle revealed all the time', radar.level === 3 && seen === 30 * 10, `level ${radar.level}, seen ${seen} of 300 ticks`);
  S.issueCommand(g, 1, { type: 'upgrade', buildingId: radar.id });
  check('and that is the last upgrade', radar.upgrading === null);
  // Shields need Forcefield Tech, and cost half as much again.
  g.teams[1].scrap = 900;
  const con = S.addUnitNear(g, 'constructor', 1, rec.x + 100, rec.y);
  const ss = spotFor(S, g, 1, 'shield', rec.x + 150, rec.y + 150);
  S.issueCommand(g, 1, { type: 'build', ids: [con.id], building: 'shield', tx: ss.tx, ty: ss.ty });
  check('a Shield Projector needs Forcefield Tech first', !g.entities.some(e => e.type === 'shield'));
  g.teams[1].research.shields = true;
  S.issueCommand(g, 1, { type: 'build', ids: [con.id], building: 'shield', tx: ss.tx, ty: ss.ty });
  check('then it can be built, for 180 scrap', g.entities.some(e => e.type === 'shield') && 900 - g.teams[1].scrap === 180);
  check('Forcefield Tech is researched at a Research Lab', S.BUILDING_TYPES.lab.researches.includes('shields') && S.RESEARCH.shields.cost > 0);
}

console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
