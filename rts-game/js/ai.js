// =============================================================================
// ai.js — THE ENEMY COMMANDER
//
// The computer opponent plays by exactly the same rules as you. It can only
// act through issueCommand(), the same way your taps and clicks do. How hard
// it plays is set by DIFFICULTY in config.js.
//
// Its plan: gather scrap, build a base and defences, expand toward scrap
// by deploying Scavengers onto scrap geysers, then attack in waves until
// your Recycler falls.
// =============================================================================

function aiUpdate(game, team) {
  const diff = DIFFICULTY[game.difficulty];
  const ai = game.ai[team] || (game.ai[team] = { next: 0, nextWave: diff.firstAttack });
  if (game.time < ai.next) return;
  // A little jitter so the two commanders don't always think on the same tick
  // (whoever acts first on a shared tick would get a small, unfair edge).
  ai.next = game.time + diff.thinkEvery * (0.85 + game.rng() * 0.3);

  const mine = game.entities.filter(e => e.team === team);
  const units = mine.filter(e => e.kind === 'unit');
  const buildings = mine.filter(e => e.kind === 'building');
  const tm = game.teams[team];
  const enemy = 3 - team;
  const hq = buildings.find(b => b.type === 'recycler');
  if (!hq) {
    // Still on wheels: deploy the Recycler on the nearest free geyser.
    const mobile = units.find(u => u.type === 'mobileRecycler');
    if (mobile && mobile.order.type !== 'deploy') {
      const g = game.geysers.filter(x => !geyserTaken(game, x)).sort((a, b) => dist(a, mobile) - dist(b, mobile))[0];
      if (g) issueCommand(game, team, { type: 'deploy', ids: [mobile.id], geyserId: g.id });
    }
    return;
  }
  // Counts by basic kind, so a Tank Mk II counts as a tank.
  const count = type => units.filter(u => baseType(u) === type).length +
    buildings.reduce((n, b) => n + b.queue.filter(q => (UNIT_TYPES[q].base || q) === type).length, 0);
  const has = type => buildings.filter(b => b.type === type).length;
  const cmd = c => issueCommand(game, team, c);
  const toCenter = angleTo(hq, { x: game.map.W * CONFIG.TILE / 2, y: game.map.H * CONFIG.TILE / 2 });
  const rally = { x: hq.x + Math.cos(toCenter) * 220, y: hq.y + Math.sin(toCenter) * 220 };

  // --- Economy -------------------------------------------------------------
  const extractors = buildings.filter(b => b.type === 'extractor' && b.built >= 1);
  // Geysers are the long-term income, so once some are pumping the AI keeps
  // fewer Scavengers on loose scrap (one fewer per two Extractors, at least 3).
  const scavWanted = Math.max(3, Math.min(diff.maxScavengers, 3 + Math.floor(game.time / 150)) - Math.floor(extractors.length / 2));
  // --- Recycler upgrade: needed for Scavenger IIs (geysers) and Constructor IIs (repairs)
  const upgraded = hq.level > 1;
  const scavType = upgraded ? 'scavenger2' : 'scavenger', conType = upgraded ? 'constructor2' : 'constructor';
  ai.savingUp = false;
  if (!upgraded && hq.upgrading === null && game.time > diff.upgradeBaseAfter && has('factory')) {
    if (tm.scrap >= BUILDING_TYPES.recycler.upgrade.cost) cmd({ type: 'upgrade', buildingId: hq.id });
    else ai.savingUp = true;
  }
  const deployers = units.filter(u => u.def.canDeploy && u.order.type !== 'deploy');
  const wantsGeyser = upgraded && has('extractor') < diff.maxExtractors && expansionTarget(game, team, hq);
  if (!hq.queue.length && hq.upgrading === null) {
    if (count('constructor') < 1 && tm.scrap >= UNIT_TYPES[conType].cost) cmd({ type: 'produce', buildingId: hq.id, unit: conType });
    // One Constructor II so buildings can be repaired.
    else if (upgraded && !units.some(u => u.type === 'constructor2') && count('constructor') < 2 && tm.scrap >= UNIT_TYPES.constructor2.cost) cmd({ type: 'produce', buildingId: hq.id, unit: 'constructor2' });
    // A Scavenger II to claim the next geyser.
    else if (wantsGeyser && !deployers.length && tm.scrap >= UNIT_TYPES.scavenger2.cost) cmd({ type: 'produce', buildingId: hq.id, unit: 'scavenger2' });
    else if (count('scavenger') < scavWanted && tm.scrap >= UNIT_TYPES[scavType].cost) cmd({ type: 'produce', buildingId: hq.id, unit: scavType });
  }

  // --- Expansion: turn a Scavenger into an Extractor on a free geyser --------
  const easy = game.difficulty === 'easy';
  const deploying = units.some(u => u.order.type === 'deploy');
  if (!deploying && wantsGeyser && game.time > (easy ? 360 : 90) && game.time - (ai.lastDeploy || -99) > 30) {
    const geyser = wantsGeyser;
    if (deployers.length) {
      const scav = deployers.sort((a, b) => dist(a, geyser) - dist(b, geyser))[0];
      cmd({ type: 'deploy', ids: [scav.id], geyserId: geyser.id });
      ai.lastDeploy = game.time;
    }
  }

  // --- Construction --------------------------------------------------------
  // Prefer a Constructor II, since only it can repair.
  const idleBuilders = units.filter(u => u.def.role === 'builder' && u.order.type === 'idle');
  const builder = idleBuilders.find(u => u.def.canRepair) || idleBuilders[0];
  if (builder && !ai.savingUp) {
    const damaged = buildings.find(b => b.built >= 1 && b.hp < b.maxHp * 0.6);
    const unfinished = buildings.find(b => b.built < 1);
    let want = null, near = null;
    if (unfinished) cmd({ type: 'repair', ids: [builder.id], targetId: unfinished.id });
    else if (damaged && builder.def.canRepair) cmd({ type: 'repair', ids: [builder.id], targetId: damaged.id });
    else if (!has('factory')) want = 'factory';
    else if (has('tower') < 1 && game.time > (easy ? 300 : 90)) want = 'tower';
    // More storage once the bank keeps filling up.
    else if (has('basesilo') < diff.maxBaseSilos && tm.scrap >= scrapCapacity(game, team) * 0.7 && game.time > 150) want = 'basesilo';
    else if (diff.labAfter && !has('lab') && game.time > diff.labAfter) want = 'lab';
    else if (diff.radarAfter && !has('radar') && game.time > diff.radarAfter) want = 'radar';
    else if (diff.secondFactory && has('factory') < 2 && game.time > 300) want = 'factory';
    // A Repair Pad, so damaged vehicles can be sent back to it.
    else if (diff.tactics && diff.tactics.repair && !has('repairpad') && game.time > diff.tactics.repair) want = 'repairpad';
    else if (has('tower') < 1 + has('extractor') && game.time > 200) {
      // Guard the outpost that has the fewest towers nearby.
      want = 'tower';
      const outposts = buildings.filter(b => b.type === 'extractor' && b.built >= 1);
      near = outposts.find(s => !buildings.some(t => t.type === 'tower' && dist(t, s) < 260)) || null;
    }
    if (want === 'factory' || want === 'basesilo' || want === 'lab' || want === 'radar' || want === 'repairpad') near = null;  // these go around the Recycler
    ai.saving = want === 'basesilo' && tm.scrap < BUILDING_TYPES[want].cost;
    if (want && tm.scrap >= BUILDING_TYPES[want].cost) {
      const spot = findBuildSpot(game, team, want, hq, toCenter, near);
      if (spot) cmd({ type: 'build', ids: [builder.id], building: want, tx: spot.x, ty: spot.y });
    }
  }

  // --- Research and Factory upgrades ------------------------------------------
  for (const lab of buildings.filter(b => b.type === 'lab' && b.built >= 1 && !b.researching)) {
    const next = ['tank2', 'scout2', 'artillery2'].find(k => !tm.research[k] &&
      !buildings.some(b => b.researching && b.researching.key === k));
    // Save up for it: army production pauses until it can be afforded.
    if (next && tm.scrap >= RESEARCH[next].cost) cmd({ type: 'research', buildingId: lab.id, key: next });
    else if (next) ai.savingUp = true;
  }
  if (Object.keys(tm.research).length) {
    const f = buildings.find(b => b.type === 'factory' && b.built >= 1 && b.level === 1 && b.upgrading === null);
    if (f && !buildings.some(b => b.type === 'factory' && b.upgrading !== null)) {
      if (tm.scrap >= BUILDING_TYPES.factory.upgrade.cost) cmd({ type: 'upgrade', buildingId: f.id });
      else ai.savingUp = true;
    }
  }

  // --- Gun Tower upgrades: one at a time. Towers at home become Heavy Gun
  // Towers; towers out at the Extractors become Artillery Towers (more reach).
  if (diff.towerUpgradeAfter && game.time > diff.towerUpgradeAfter && !ai.saving && !ai.savingUp &&
      !buildings.some(b => b.type === 'tower' && b.upgrading !== null)) {
    const t = buildings.find(b => b.type === 'tower' && b.built >= 1 && b.level === 1);
    if (t) {
      const opt = BUILDING_TYPES.tower.upgrades.find(o => o.key === (dist(t, hq) < 500 ? 'heavytower' : 'arttower'));
      if (tm.scrap >= opt.cost) cmd({ type: 'upgrade', buildingId: t.id, option: opt.key });
    }
  }

  // --- Army production -----------------------------------------------------
  const army = units.filter(u => u.def.role === 'combat');
  // Lower difficulties grow their army slowly, so you have time to prepare.
  const armyCap = diff.armyPerMinute ? Math.min(diff.maxArmy, 3 + Math.floor(game.time / 60 * diff.armyPerMinute)) : diff.maxArmy;
  for (const f of buildings.filter(b => b.type === 'factory' && b.built >= 1)) {
    if (f.queue.length >= 2 || count('scout') + count('tank') + count('artillery') >= armyCap) continue;
    if (units.length >= CONFIG.UNIT_CAP - 2) continue;
    const scouts = count('scout'), tanks = count('tank'), arty = count('artillery');
    let pick = 'tank';
    if (scouts < 2 || scouts * 4 < army.length) pick = 'scout';
    else if (arty * 4 < tanks && game.time > diff.artilleryAfter) pick = 'artillery';
    // Keep a reserve for the builder, and hold off while saving for a Base Silo.
    if (ai.saving || ai.savingUp || f.upgrading !== null) continue;
    // Build the Mk II version when researched and this Factory is upgraded.
    if (f.level > 1 && tm.research[pick + '2']) pick = pick + '2';
    if (tm.scrap >= UNIT_TYPES[pick].cost + (builder ? 60 : 0)) cmd({ type: 'produce', buildingId: f.id, unit: pick });
    if (!f.rally) cmd({ type: 'rally', buildingId: f.id, x: rally.x, y: rally.y });
  }

  // Normal and Hard fight with squads and tactics; Easy keeps the simple waves.
  if (diff.tactics) { runTactics(game, team, ai, diff, { hq, army, buildings, rally, cmd, enemy }); return; }

  // --- Defence -------------------------------------------------------------
  const intruder = game.entities.find(e => e.team === enemy && e.kind === 'unit' && e.def.role === 'combat' &&
    buildings.some(b => dist(b, e) < 380) && isVisibleTo(game, team, e));
  if (intruder) {
    const defenders = army.filter(u => dist(u, hq) < 1400 && u.order.type !== 'attack');
    if (defenders.length) cmd({ type: 'move', ids: defenders.map(u => u.id), x: intruder.x, y: intruder.y, attackMove: true });
    return;
  }

  // --- Attack --------------------------------------------------------------
  const idle = army.filter(u => u.order.type === 'idle' && !u.target);
  const atHome = idle.filter(u => dist(u, rally) < 300);
  const inField = idle.filter(u => dist(u, rally) >= 300);
  const objective = pickObjective(game, team, hq);

  // Units already out attacking keep pushing to the next target.
  if (inField.length && objective && game.time >= diff.firstAttack) {
    cmd({ type: 'move', ids: inField.map(u => u.id), x: objective.x, y: objective.y, attackMove: true });
  } else if (inField.length) {
    cmd({ type: 'move', ids: inField.map(u => u.id), x: rally.x, y: rally.y });
  }

  // Launch a wave once it's time and enough units have gathered.
  const waveSize = Math.min(diff.maxArmy, diff.waveBase + Math.floor(Math.max(0, game.time - diff.firstAttack) / 60 * diff.waveGrowth));
  if (objective && game.time >= ai.nextWave && atHome.length >= waveSize) {
    // Send the wave; anything extra stays home to defend.
    const wave = atHome.sort((a, b) => dist(a, objective) - dist(b, objective)).slice(0, waveSize);
    cmd({ type: 'move', ids: wave.map(u => u.id), x: objective.x, y: objective.y, attackMove: true });
    ai.nextWave = game.time + diff.waveEvery;
    pushEvent(game, enemy, 'Enemy attack force spotted, heading your way!', 'bad');
  }
}

// Attack the enemy building closest to our base: outposts first, then the HQ.
function pickObjective(game, team, hq) {
  let best = null, bd = Infinity;
  for (const b of game.entities) {
    if (b.team === team) continue;
    // Everyone knows where the enemy HQ is, deployed or still on wheels.
    const hqTarget = b.type === 'recycler' || b.type === 'mobileRecycler';
    if (!hqTarget && (b.kind !== 'building' || !b.seen[team])) continue;
    const d = dist(hq, b);
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}

// The nearest free scrap geyser on our side of the map.
function expansionTarget(game, team, hq) {
  const foe = game.entities.find(e => e.team !== team && e.type === 'recycler');
  let best = null, bd = Infinity;
  for (const g of game.geysers) {
    if (geyserTaken(game, g)) continue;
    if (foe && dist(foe, g) < dist(hq, g)) continue;
    const d = dist(hq, g);
    if (d < bd) { bd = d; best = g; }
  }
  return best;
}

// Find a legal spot for a building. With `near`, try to get as close to that
// point as the rules allow; otherwise place it around the base.
// The search runs as if we were Blue, bottom-left, and the answer is mirrored
// for Red, so both sides place buildings in exactly the same way.
function findBuildSpot(game, team, type, hq, towardAngle, near) {
  const T = CONFIG.TILE, size = BUILDING_TYPES[type].size, W = game.map.W, H = game.map.H;
  const flip = !inMirroredHalf(game, hq.x, hq.y);  // based in the top-right corner
  const local = p => flip ? { x: W * T - p.x, y: H * T - p.y } : { x: p.x, y: p.y };
  const world = (tx, ty) => flip ? { x: W - size - tx, y: H - size - ty } : { x: tx, y: ty };
  const ok = (tx, ty) => { const w = world(tx, ty); return canPlaceBuilding(game, team, type, w.x, w.y).ok; };
  // Leave a gap around buildings so units can drive between them.
  const fits = BUILDING_TYPES[type].adjacent ? ok : (tx, ty) => ok(tx - 1, ty - 1) && ok(tx, ty) && ok(tx + 1, ty + 1);
  const home = local(hq);
  if (near) {
    const goal = local(near);
    // Walk from the target back toward home until a spot is allowed.
    const steps = Math.ceil(dist(home, goal) / T);
    for (let i = 0; i <= steps; i++) {
      const x = goal.x + (home.x - goal.x) * i / steps, y = goal.y + (home.y - goal.y) * i / steps;
      for (const [ox, oy] of [[0, 0], [2, 0], [-2, 0], [0, 2], [0, -2]]) {
        const tx = Math.round(x / T - size / 2) + ox, ty = Math.round(y / T - size / 2) + oy;
        if (fits(tx, ty)) return world(tx, ty);
      }
    }
    return null;
  }
  const toward = angleTo(home, { x: W * T / 2, y: H * T / 2 });
  const baseDist = type === 'tower' ? 8 : 5;
  const htx = home.x / T, hty = home.y / T;
  for (let ring = 0; ring < 6; ring++) {
    for (let k = 0; k < 12; k++) {
      const a = toward + ((k % 2 ? 1 : -1) * Math.ceil(k / 2)) * 0.28 + (game.rng() - 0.5) * 0.2;
      const r = baseDist + ring * 1.5;
      const tx = Math.round(htx + Math.cos(a) * r - size / 2), ty = Math.round(hty + Math.sin(a) * r - size / 2);
      if (fits(tx, ty)) return world(tx, ty);
    }
  }
  return null;
}

// =============================================================================
// Battle tactics (Normal and Hard)
//
// The army is split into squads, each with a job and a state:
//   main - the attack force. Picks the weakest target it knows of (distance
//          plus the defences it has seen there), goes straight there or swings
//          round a flank, falls back if the fight turns against it, and on
//          Hard focuses its fire on one enemy at a time.
//   raid - a few fast vehicles that sneak round the side to hit workers and
//          outlying Extractors, and run for home before defenders arrive.
//   bait - a feigned retreat: two fast vehicles poke the enemy, then fall back
//          past the main force waiting in ambush halfway home.
// It only ever uses what its side can see (and enemy buildings it has seen
// before), exactly like a human player. Settings: DIFFICULTY[...].tactics.
// =============================================================================

// Rough fighting strength: health times damage per second.
function unitPower(e) {
  const w = e.def.weapon;
  if (!w || e.hp <= 0) return 0;
  return (e.hp / 100) * (w.damage * (w.splash ? 1.5 : 1) / w.cooldown);
}

// Enemy strength the team can see (or has seen, for buildings) near a point.
function enemyPowerNear(game, team, p, r) {
  let s = 0;
  for (const e of game.entities) {
    if (e.team === team || e.hp <= 0 || !e.def.weapon || dist(e, p) > r) continue;
    if (e.kind === 'unit' ? !isVisibleTo(game, team, e) : !e.seen[team]) continue;
    s += unitPower(e) * (e.kind === 'building' ? 1.3 : 1);
  }
  return s;
}

const centroidOf = list => ({ x: list.reduce((a, u) => a + u.x, 0) / list.length, y: list.reduce((a, u) => a + u.y, 0) / list.length });

// A point `frac` of the way from a to b, pushed sideways by `off` of the
// distance (side +1 or -1; 0 keeps it on the line), moved to open ground.
function flankPoint(game, a, b, side, frac, off) {
  const T = CONFIG.TILE, W = game.map.W * T, H = game.map.H * T;
  const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1, push = side * Math.min(1500, L * off);
  let x = a.x + dx * frac - dy / L * push, y = a.y + dy * frac + dx / L * push;
  x = Math.max(4 * T, Math.min(W - 4 * T, x)); y = Math.max(4 * T, Math.min(H - 4 * T, y));
  const t = nearestOpenTile(game, Math.floor(x / T), Math.floor(y / T), 14);
  return t ? { x: (t.x + 0.5) * T, y: (t.y + 0.5) * T } : { x, y };
}

// The best known target: close, and lightly defended (as far as we know).
function pickTarget(game, team, from, defenceWeight, onlyType) {
  let best = null, bs = Infinity;
  for (const b of game.entities) {
    if (b.team === team || b.hp <= 0) continue;
    const hqT = b.type === 'recycler' || b.type === 'mobileRecycler';
    if (!hqT && (b.kind !== 'building' || !b.seen[team])) continue;
    if (onlyType && b.type !== onlyType) continue;
    const score = dist(from, b) + defenceWeight * enemyPowerNear(game, team, b, 450) * 5;
    if (score < bs) { bs = score; best = b; }
  }
  return best;
}

function runTactics(game, team, ai, diff, c) {
  const { hq, army, buildings, rally, cmd, enemy } = c, tac = diff.tactics, now = game.time;
  const byId = id => { const u = game.byId.get(id); return u && u.hp > 0 && u.team === team ? u : null; };
  const pad = buildings.find(b => b.type === 'repairpad' && b.built >= 1);
  const move = (list, p, fight = true) => list.length && cmd({ type: 'move', ids: list.map(u => u.id), x: p.x, y: p.y, attackMove: fight });
  const sendRepair = list => { const hurt = list.filter(u => u.hp < u.maxHp * 0.5); if (pad && hurt.length) cmd({ type: 'gorepair', ids: hurt.map(u => u.id) }); return hurt; };

  // Tidy the squads: drop the destroyed, and squads with nobody left.
  ai.squads = (ai.squads || []).filter(s => (s.ids = s.ids.filter(byId)).length);
  const inSquad = new Set(ai.squads.flatMap(s => s.ids));
  const free = army.filter(u => !inSquad.has(u.id));

  // --- Defence: free units (and any squad still near home) meet intruders.
  const intruder = game.entities.find(e => e.team === enemy && e.kind === 'unit' && e.def.role === 'combat' &&
    buildings.some(b => dist(b, e) < 420) && isVisibleTo(game, team, e));
  if (intruder && now - (ai.lastDefend || -99) > 3) {
    ai.lastDefend = now;
    const nearHome = ai.squads.filter(s => s.kind === 'main' && s.state !== 'attack' && dist(centroidOf(s.ids.map(byId)), hq) < 1600);
    for (const s of nearHome) { s.state = 'retreat'; s.t = now; }
    const defenders = free.concat(nearHome.flatMap(s => s.ids.map(byId))).filter(u => u.order.type !== 'attack' && u.order.type !== 'move' || u.order.attackMove);
    move(defenders.filter(u => dist(u, hq) < 1800), intruder);
  }

  // --- Damaged free units go to the Repair Pad; strays come back to the rally point.
  if (tac.repair && pad) sendRepair(free.filter(u => u.order.type === 'idle' && !u.target && dist(u, pad) > 120));
  const home = free.filter(u => u.order.type === 'idle' && !u.target && dist(u, rally) < 450 && u.hp >= u.maxHp * 0.5);
  const strays = free.filter(u => u.order.type === 'idle' && !u.target && dist(u, rally) >= 450 && !(pad && dist(u, pad) < 250));
  if (strays.length && !intruder) move(strays, rally, false);

  // --- Launch the main attack.
  const waveSize = Math.min(diff.maxArmy, diff.waveBase + Math.floor(Math.max(0, now - diff.firstAttack) / 60 * diff.waveGrowth));
  const target = pickTarget(game, team, rally, tac.cautious);
  if (target && now >= ai.nextWave && home.length >= waveSize && !ai.squads.some(s => s.kind === 'main')) {
    const wave = home.slice().sort((a, b) => dist(a, target) - dist(b, target)).slice(0, waveSize);
    // Straight in, or round the flank where it has seen fewer defences.
    let route = [];
    if (game.rng() < tac.flank) {
      const L = flankPoint(game, rally, target, 1, 0.55, 0.4), R = flankPoint(game, rally, target, -1, 0.55, 0.4);
      const pl = enemyPowerNear(game, team, L, 700), pr = enemyPowerNear(game, team, R, 700);
      const side = pl < pr ? 1 : pr < pl ? -1 : (game.rng() < 0.5 ? 1 : -1);
      route = [side > 0 ? L : R];
      ai.raidSide = -side;   // a raid at the same time goes round the other side
    }
    const fast = wave.filter(u => u.def.speed >= 60).slice(0, 2);
    if (tac.feint && game.rng() < tac.feint && wave.length >= 5 && fast.length === 2) {
      // Feigned retreat: bait pokes the target, the rest wait in ambush.
      const ambush = flankPoint(game, rally, target, 0, 0.45, 0);
      const main = wave.filter(u => !fast.includes(u));
      ai.squads.push({ kind: 'main', ids: main.map(u => u.id), state: 'ambush', t: now, targetId: target.id, route, ambush });
      ai.squads.push({ kind: 'bait', ids: fast.map(u => u.id), state: 'poke', t: now, targetId: target.id, ambush });
      move(main, ambush); move(fast, target);
    } else {
      ai.squads.push({ kind: 'main', ids: wave.map(u => u.id), state: 'move', t: now, targetId: target.id, route, wpi: 0 });
      move(wave, route[0] || target);
    }
    ai.nextWave = now + diff.waveEvery;
    if (tac.raidWithWave) ai.nextRaid = Math.min(ai.nextRaid || 0, now);
    pushEvent(game, enemy, 'Enemy attack force spotted, heading your way!', 'bad');
  }

  // --- Launch a raid with fast vehicles, at enemy workers and outposts.
  if (tac.raid && now > tac.raidAfter && now >= (ai.nextRaid || 0) && !ai.squads.some(s => s.kind === 'raid')) {
    const raiders = home.filter(u => u.def.speed >= 60 && !ai.squads.some(s => s.ids.includes(u.id))).slice(0, tac.raidSize);
    if (raiders.length >= 2) {
      const foeHq = game.entities.find(e => e.team === enemy && (e.type === 'recycler' || e.type === 'mobileRecycler') && (e.type === 'mobileRecycler' || e.seen[team]));
      const outpost = pickTarget(game, team, rally, 3, 'extractor');
      // Without a known outpost, head for the enemy's side and hunt for workers.
      const goal = outpost || (foeHq ? flankPoint(game, foeHq, hq, 0, 0.3, 0) : flankPoint(game, rally, { x: game.map.W * 32 - rally.x, y: game.map.H * 32 - rally.y }, 0, 0.7, 0));
      const side = ai.raidSide || (game.rng() < 0.5 ? 1 : -1);
      const route = [flankPoint(game, rally, goal, side, 0.6, 0.45), { x: goal.x, y: goal.y }];
      ai.squads.push({ kind: 'raid', ids: raiders.map(u => u.id), state: 'move', t: now, route, wpi: 0, targetId: outpost ? outpost.id : 0 });
      move(raiders, route[0]);
      ai.nextRaid = now + tac.raidEvery; ai.raidSide = 0;
    } else ai.nextRaid = now + 20;
  }

  // --- Run every squad.
  for (const s of ai.squads) {
    const m = s.ids.map(byId);
    const ctr = centroidOf(m);
    const own = m.reduce((a, u) => a + unitPower(u), 0);
    const foe = enemyPowerNear(game, team, ctr, 600);
    const age = now - s.t;
    const to = (state) => { s.state = state; s.t = now; };

    // Falling back: when the fight turns against the squad, run for home.
    const canRetreat = s.state === 'move' || s.state === 'attack' || s.state === 'hunt';
    const limit = s.kind === 'raid' ? tac.raidRetreat : tac.retreatAt;
    if (canRetreat && foe > 0 && own < foe * limit) {
      to('retreat');
      sendRepair(m);
      move(m.filter(u => u.hp >= u.maxHp * 0.5 || !pad), rally, false);
      continue;
    }
    if (s.state === 'retreat') {
      if (dist(ctr, rally) < 450 || age > 90) s.done = true;
      continue;
    }

    // Hard: everyone near a fight shoots the same, weakest enemy.
    if (tac.focus && (s.state === 'attack' || s.state === 'move' || s.state === 'hunt') && foe > 0 && now - (s.focusAt || 0) > 1.5) {
      s.focusAt = now;
      let pick = null, ps = Infinity;
      for (const e of game.entities) {
        if (e.team === team || e.kind !== 'unit' || e.hp <= 0 || dist(e, ctr) > 420 || !isVisibleTo(game, team, e)) continue;
        const score = e.hp - (e.def.weapon ? 150 : 0);
        if (score < ps) { ps = score; pick = e; }
      }
      if (pick) {
        const shooters = m.filter(u => u.def.weapon && dist(u, pick) < u.def.weapon.range + 150 && u.order.targetId !== pick.id && !(u.def.weapon.minRange && dist(u, pick) < u.def.weapon.minRange));
        if (shooters.length) cmd({ type: 'attack', ids: shooters.map(u => u.id), targetId: pick.id });
      }
    }

    if (s.kind === 'bait') {
      const contact = game.entities.some(e => e.team === enemy && e.kind === 'unit' && e.def.weapon && dist(e, ctr) < 420 && isVisibleTo(game, team, e));
      if (s.state === 'poke' && (contact || m.some(u => u.hp < u.maxHp * 0.8))) { to('lure'); move(m, s.ambush, false); }
      else if (s.state === 'poke' && age > 50) s.done = true;              // nobody took the bait
      else if (s.state === 'lure' && (dist(ctr, s.ambush) < 260 || age > 35)) s.done = true;
      continue;
    }

    if (s.state === 'ambush') {
      // Wait until the bait is home and the pursuers are dealt with, then attack.
      const baiting = ai.squads.some(b => b.kind === 'bait' && !b.done);
      const near = enemyPowerNear(game, team, s.ambush, 550);
      if (near > 0) s.clearAt = now;
      if ((!baiting && now - (s.clearAt || s.t) > 5) || age > 70) {
        to('move'); s.wpi = 0;
        const t = byId(s.targetId) ? null : game.byId.get(s.targetId);
        move(m, s.route[0] || (t && t.hp > 0 ? t : pickTarget(game, team, ctr, tac.cautious) || rally));
      }
      continue;
    }

    if (s.state === 'move') {
      // Follow the route's waypoints, then go for the target.
      const wp = s.route[s.wpi];
      if (wp && (dist(ctr, wp) < 260 || age > 100)) { s.wpi++; s.t = now; }
      if (s.wpi < s.route.length) {
        if (now - (s.issued || 0) > 12) { s.issued = now; move(m.filter(u => u.order.type === 'idle'), s.route[s.wpi]); }
      } else {
        to(s.kind === 'raid' ? 'hunt' : 'attack');
      }
      continue;
    }

    if (s.state === 'hunt') {
      // Raiders go for workers first, then the outpost; give up after a while.
      let prey = null, pd = Infinity;
      for (const e of game.entities) {
        if (e.team !== enemy || e.kind !== 'unit' || e.def.weapon || e.hp <= 0 || !isVisibleTo(game, team, e)) continue;
        const d = dist(e, ctr); if (d < 650 && d < pd) { pd = d; prey = e; }
      }
      if (prey && now - (s.issued || 0) > 2) { s.issued = now; cmd({ type: 'attack', ids: m.map(u => u.id), targetId: prey.id }); }
      else if (!prey && now - (s.issued || 0) > 8) {
        s.issued = now;
        const t = s.targetId && game.byId.get(s.targetId);
        if (t && t.hp > 0) move(m, t);
        else if (age > 25) { to('retreat'); move(m, rally, false); }
      }
      if (age > 140) { to('retreat'); move(m, rally, false); }
      continue;
    }

    if (s.state === 'attack') {
      let t = game.byId.get(s.targetId);
      if (!t || t.hp <= 0) {
        t = pickTarget(game, team, ctr, tac.cautious * 0.5);
        if (t) s.targetId = t.id;
      }
      if (!t) { to('retreat'); move(m, rally, false); continue; }
      // Keep the idle members pushing on.
      const idle = m.filter(u => u.order.type === 'idle' && !u.target);
      if (idle.length && now - (s.issued || 0) > 4) { s.issued = now; move(idle, t); }
    }
  }
  // Finished squads hand their vehicles back (they rejoin the next wave).
  ai.squads = ai.squads.filter(s => !s.done);
}
