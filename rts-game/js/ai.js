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
  if (diff.tactics && diff.tactics.adapt) updateIntel(game, team, ai);
  // Lower difficulties grow their army slowly, so you have time to prepare.
  const armyCap = diff.armyPerMinute ? Math.min(diff.maxArmy, 3 + Math.floor(game.time / 60 * diff.armyPerMinute)) : diff.maxArmy;
  for (const f of buildings.filter(b => b.type === 'factory' && b.built >= 1)) {
    if (f.queue.length >= 2 || count('scout') + count('tank') + count('artillery') >= armyCap) continue;
    if (units.length >= CONFIG.UNIT_CAP - 2) continue;
    const scouts = count('scout'), tanks = count('tank'), arty = count('artillery');
    let pick = 'tank';
    if (diff.tactics && diff.tactics.adapt && ai.intel) pick = adaptiveMix(ai.intel, diff, scouts, tanks, arty, game.time);
    else if (scouts < 2 || scouts * 4 < army.length) pick = 'scout';
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
function enemyPowerNear(game, team, p, r, unitsOnly) {
  let s = 0;
  for (const e of game.entities) {
    if (e.team === team || e.hp <= 0 || !e.def.weapon || dist(e, p) > r) continue;
    if (unitsOnly && e.kind !== 'unit') continue;
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

// --- Scouting report ---------------------------------------------------------
// What the enemy has shown us: the most of each kind of vehicle seen at once
// recently (fading over about a minute), and the buildings we know about.
function updateIntel(game, team, ai) {
  const now = game.time;
  const I = ai.intel || (ai.intel = { scout: 0, tank: 0, artillery: 0, towers: 0, extractors: 0, at: 0 });
  if (now - I.at < 4) return;
  I.at = now;
  const seen = { scout: 0, tank: 0, artillery: 0 };
  let towers = 0, extractors = 0;
  for (const e of game.entities) {
    if (e.team === team || e.hp <= 0) continue;
    if (e.kind === 'unit') { if (e.def.role === 'combat' && isVisibleTo(game, team, e)) seen[baseType(e)]++; }
    else if (e.seen[team]) { if (e.type === 'tower') towers++; else if (e.type === 'extractor') extractors++; }
  }
  for (const k in seen) I[k] = Math.max(seen[k], I[k] * 0.95);
  I.towers = towers; I.extractors = extractors;
}

// Which vehicle to build next, answering what the enemy fields: Artillery to
// crack Gun Towers and massed Tanks, Scouts to run down enemy Artillery, and
// Tanks against swarms of Scouts. Always at least two Scouts for raids.
function adaptiveMix(I, diff, scouts, tanks, arty, time) {
  if (scouts < 2) return 'scout';
  const a = diff.tactics.adapt, eT = I.tank, eA = I.artillery, eS = I.scout, eAll = eT + eA + eS || 1;
  const want = {
    scout: 0.22 + a * (0.2 * eA / eAll - 0.1 * eS / eAll),
    artillery: time > diff.artilleryAfter ? 0.17 + a * (0.12 * Math.min(1, I.towers / 3) + 0.1 * eT / eAll) : 0,
  };
  want.tank = 1 - want.scout - want.artillery;
  const have = { scout: scouts, tank: tanks, artillery: arty }, total = scouts + tanks + arty + 1;
  let pick = 'tank', gap = -Infinity;
  for (const k of ['tank', 'scout', 'artillery']) {
    const g = want[k] * total - have[k];
    if (g > gap) { gap = g; pick = k; }
  }
  return pick;
}

// --- Combined arms -------------------------------------------------------------
// In an assault each vehicle has a job: Tanks are the wall that takes the
// hits, Artillery sets up behind them and shells what they reveal, and the fast
// Scouts swing round to strike somewhere else at the same moment.
const roleOf = u => { const b = baseType(u); return b === 'tank' ? 'wall' : b === 'artillery' ? 'guns' : 'fast'; };

// A point `d` from `target`, back toward `from`, on open ground.
function standOff(game, target, from, d) {
  return flankPoint(game, target, from, 0, Math.min(0.9, d / (dist(target, from) || 1)), 0);
}

// A soft target for the flankers near `target`: an unarmed building we know
// of, preferring ones far from Gun Towers; failing that, another outpost.
function softTarget(game, team, target) {
  let best = null, bs = Infinity;
  const armed = game.entities.filter(e => e.team !== team && e.kind === 'building' && e.def.weapon && e.hp > 0 && e.seen[team]);
  for (const b of game.entities) {
    if (b.team === team || b.kind !== 'building' || b.def.weapon || b.hp <= 0 || !b.seen[team] || b.type === 'recycler') continue;
    const d = dist(b, target);
    if (d > 1300) continue;
    const guarded = armed.some(t => dist(t, b) < (t.def.weapon.range + 120));
    const score = d + (guarded ? 700 : 0);
    if (score < bs) { bs = score; best = b; }
  }
  return best;
}

function runTactics(game, team, ai, diff, c) {
  const { hq, army, buildings, rally, cmd, enemy } = c, tac = diff.tactics, now = game.time;
  const byId = id => { const u = game.byId.get(id); return u && u.hp > 0 && u.team === team ? u : null; };
  const move = (list, p, fight = true) => list.length && cmd({ type: 'move', ids: list.map(u => u.id), x: p.x, y: p.y, attackMove: fight });
  const pad = buildings.find(b => b.type === 'repairpad' && b.built >= 1);
  // Combined-arms assault on `target`: gather out of range (by way of `via`,
  // a flank, if given), then go in together. Waves with fewer than two Tanks
  // or Artillery simply attack-move as before.
  const startAssault = (list, target, via) => {
    if (!tac.combined || list.filter(u => roleOf(u) !== 'fast').length < 2) { move(list, via || target); return; }
    const from = via || centroidOf(list);
    const stage = standOff(game, target, from, 700);
    ai.squads.push({ kind: 'assault', ids: list.map(u => u.id), targetId: target.id, via, stage, phase: via ? 'via' : 'stage', t: now, phaseAt: now });
    move(list, via || stage);
  };

  // Squads currently away on a job (raids, retreats); their vehicles are left
  // out of the normal wave logic below.
  ai.squads = (ai.squads || []).filter(s => !s.done && (s.ids = s.ids.filter(byId)).length);
  const busy = new Set(ai.squads.flatMap(s => s.ids));
  const mainArmy = army.filter(u => !busy.has(u.id));

  // --- Defence (as before): everyone near home meets an intruder.
  const intruder = game.entities.find(e => e.team === enemy && e.kind === 'unit' && e.def.role === 'combat' &&
    buildings.some(b => dist(b, e) < 380) && isVisibleTo(game, team, e));
  if (intruder) {
    const defenders = mainArmy.filter(u => dist(u, hq) < 1400 && u.order.type !== 'attack');
    if (defenders.length) move(defenders, intruder);
    ai.defending = (ai.defending || 0) + 1;
  } else if ((tac.counter || tac.hold) && ai.defending > 6) {
    ai.beatOff = (ai.beatOff || 0) + 1;
    // Just beat off an attack: the enemy's army is spent, so strike back now.
    ai.defending = 0;
    ai.nextWave = Math.min(ai.nextWave, now);
    ai.counterNow = true;
  } else ai.defending = 0;

  // --- Repair: badly damaged idle vehicles go to the Repair Pad.
  if (tac.repair && pad && !intruder && now - (ai.lastRepair || 0) > 3) {
    ai.lastRepair = now;
    const hurt = mainArmy.filter(u => u.order.type === 'idle' && !u.target && u.hp < u.maxHp * 0.45 && dist(u, pad) > 120);
    if (hurt.length) cmd({ type: 'gorepair', ids: hurt.map(u => u.id) });
  }

  const idle = mainArmy.filter(u => u.order.type === 'idle' && !u.target);
  const atHome = idle.filter(u => dist(u, rally) < 300 || (pad && dist(u, pad) < 200));
  const inField = idle.filter(u => !atHome.includes(u));
  const objective = pickObjective(game, team, hq);

  // --- Retreat: a fighting group badly outnumbered by enemy vehicles falls back.
  if (tac.retreatAt && now - (ai.lastRetreatCheck || 0) > 1.5) {
    ai.lastRetreatCheck = now;
    const out = mainArmy.filter(u => dist(u, rally) > 900 && u.order.type !== 'idle');
    // Group them into clusters around the first unit of each.
    const left = out.slice();
    while (left.length) {
      const seed = left.shift(), grp = [seed];
      for (let i = left.length - 1; i >= 0; i--) if (dist(left[i], seed) < 450) grp.push(left.splice(i, 1)[0]);
      const ctr = centroidOf(grp), own = grp.reduce((a, u) => a + unitPower(u), 0);
      const foe = enemyPowerNear(game, team, ctr, 600, true);
      if (foe > 0 && own < foe * tac.retreatAt) {
        ai.squads.push({ kind: 'retreat', ids: grp.map(u => u.id), t: now });
        move(grp, rally, false);
      }
    }
  }

  // --- Units already out attacking keep pushing (as before), unless intruders need them.
  if (!intruder) {
    if (inField.length && objective && now >= diff.firstAttack) move(inField, objective);
    else if (inField.length) move(inField, rally);
  }

  // --- Waves (as before), optionally round a flank.
  const waveSize = Math.min(diff.maxArmy, diff.waveBase + Math.floor(Math.max(0, now - diff.firstAttack) / 60 * diff.waveGrowth));
  const need = ai.counterNow ? Math.ceil(waveSize * (tac.counter || 0.6)) : waveSize;
  // Hold: early on, let the enemy's waves break on our defences first, and only
  // strike back after beating one off (or once the army is twice the wave size).
  const holding = tac.hold && !ai.counterNow && !ai.beatOff && now < tac.hold && atHome.length < waveSize * (tac.holdArmy || 2);
  if (!intruder && objective && !holding && now >= ai.nextWave && atHome.length >= need) {
    ai.counterNow = false;
    const wave = atHome.slice().sort((a, b) => dist(a, objective) - dist(b, objective)).slice(0, tac.allIn ? atHome.length : waveSize);
    let first = objective;
    if (tac.flank && game.rng() < tac.flank) {
      const L = flankPoint(game, rally, objective, 1, 0.55, 0.35), R = flankPoint(game, rally, objective, -1, 0.55, 0.35);
      const pl = enemyPowerNear(game, team, L, 700), pr = enemyPowerNear(game, team, R, 700);
      first = pl < pr ? L : pr < pl ? R : (game.rng() < 0.5 ? L : R);
      ai.raidSide = first === L ? -1 : 1;
    }
    // Feigned retreat: two fast ones poke ahead, the wave waits halfway.
    const fast = wave.filter(u => u.def.speed >= 60).slice(0, 2);
    if (tac.feint && game.rng() < tac.feint && wave.length >= 6 && fast.length === 2) {
      const ambush = flankPoint(game, rally, objective, 0, 0.45, 0);
      const rest = wave.filter(u => !fast.includes(u));
      ai.squads.push({ kind: 'ambush', ids: rest.map(u => u.id), t: now, ambush, first });
      ai.squads.push({ kind: 'bait', ids: fast.map(u => u.id), t: now, ambush, state: 'poke' });
      move(rest, ambush); move(fast, objective);
    } else startAssault(wave, objective, first !== objective ? first : null);
    ai.nextWave = now + diff.waveEvery;
    if (tac.raidWithWave) ai.nextRaid = Math.min(ai.nextRaid || 0, now);
    pushEvent(game, enemy, 'Enemy attack force spotted, heading your way!', 'bad');
  }

  // --- Raids: spare fast vehicles hit enemy workers and outposts.
  if (tac.raid && !intruder && now > tac.raidAfter && now >= (ai.nextRaid || 0) && !ai.squads.some(s => s.kind === 'raid')) {
    const spare = atHome.length - waveSize;
    const raiders = atHome.filter(u => u.def.speed >= 60).slice(0, Math.min(tac.raidSize, spare));
    if (raiders.length >= 2) {
      const outpost = pickTarget(game, team, rally, 3, 'extractor');
      const foeHq = game.entities.find(e => e.team === enemy && (e.type === 'recycler' || e.type === 'mobileRecycler'));
      const goal = outpost || (foeHq ? flankPoint(game, foeHq, hq, 0, 0.3, 0) : null);
      if (goal) {
        const side = ai.raidSide || (game.rng() < 0.5 ? 1 : -1);
        const route = [flankPoint(game, rally, goal, side, 0.6, 0.45), { x: goal.x, y: goal.y }];
        ai.squads.push({ kind: 'raid', ids: raiders.map(u => u.id), t: now, route, wpi: 0, targetId: outpost ? outpost.id : 0 });
        move(raiders, route[0]);
        ai.nextRaid = now + tac.raidEvery; ai.raidSide = 0;
      }
    } else ai.nextRaid = now + 20;
  }

  // --- Run the squads.
  for (const s of ai.squads) {
    const m = s.ids.map(byId), ctr = centroidOf(m), age = now - s.t;
    if (s.kind === 'retreat') { if (dist(ctr, rally) < 500 || age > 60) s.done = true; continue; }
    if (s.kind === 'bait') {
      const contact = game.entities.some(e => e.team === enemy && e.kind === 'unit' && e.def.weapon && dist(e, ctr) < 420 && isVisibleTo(game, team, e));
      if (s.state === 'poke' && (contact || m.some(u => u.hp < u.maxHp * 0.8))) { s.state = 'lure'; s.t = now; move(m, s.ambush, false); }
      else if (s.state === 'poke' && age > 50) s.done = true;
      else if (s.state === 'lure' && (dist(ctr, s.ambush) < 260 || age > 35)) s.done = true;
      continue;
    }
    if (s.kind === 'ambush') {
      const baiting = ai.squads.some(b => b.kind === 'bait' && !b.done);
      if (enemyPowerNear(game, team, s.ambush, 550, true) > 0) s.clearAt = now;
      if ((!baiting && now - (s.clearAt || s.t) > 5) || age > 70) {
        s.done = true;
        const goal = objective && objective.hp > 0 ? objective : null;
        if (goal) startAssault(m, goal, s.first !== goal && dist(s.first, goal) > 900 ? s.first : null); else move(m, s.first);
      }
      continue;
    }
    if (s.kind === 'assault') { runAssault(game, team, ai, tac, s, m, { move, cmd, rally, enemy, now }); continue; }
    if (s.kind === 'raid') {
      const own = m.reduce((a, u) => a + unitPower(u), 0);
      if (enemyPowerNear(game, team, ctr, 600) > own * tac.raidRetreat || age > 150) { s.done = true; ai.squads.push({ kind: 'retreat', ids: s.ids.slice(), t: now }); move(m, rally, false); continue; }
      const wp = s.route[s.wpi];
      if (wp && (dist(ctr, wp) < 260 || now - (s.wpAt || s.t) > 90)) { s.wpi++; s.wpAt = now; if (s.route[s.wpi]) move(m, s.route[s.wpi]); }
      if (s.wpi >= s.route.length || dist(ctr, s.route[s.route.length - 1]) < 700) {
        let prey = null, pd = Infinity;
        for (const e of game.entities) {
          if (e.team !== enemy || e.kind !== 'unit' || e.def.weapon || e.hp <= 0 || !isVisibleTo(game, team, e)) continue;
          const d = dist(e, ctr); if (d < 650 && d < pd) { pd = d; prey = e; }
        }
        if (prey && now - (s.hitAt || 0) > 2) { s.hitAt = now; cmd({ type: 'attack', ids: m.map(u => u.id), targetId: prey.id }); }
        else if (!prey && now - (s.hitAt || 0) > 8) {
          s.hitAt = now;
          const t = s.targetId && game.byId.get(s.targetId);
          if (t && t.hp > 0) move(m, t); else if (age > 40) { s.done = true; ai.squads.push({ kind: 'retreat', ids: s.ids.slice(), t: now }); move(m, rally, false); }
        }
      }
    }
  }

  // --- Focus fire: each fighting group shoots its weakest visible enemy.
  if (tac.focus && now - (ai.focusAt || 0) > 1.5) {
    ai.focusAt = now;
    const assault = new Set(ai.squads.filter(q => q.kind === 'assault').flatMap(q => q.ids));
    for (const u of army) {
      if (!(assault.has(u.id) ? roleOf(u) !== 'guns' : !busy.has(u.id))) continue;
      if (!u.def.weapon || u.order.type === 'idle' && !u.target) continue;
      let pick = null, ps = Infinity;
      for (const e of game.entities) {
        if (e.team === team || e.kind !== 'unit' || e.hp <= 0 || dist(e, u) > u.def.weapon.range || !isVisibleTo(game, team, e)) continue;
        if (u.def.weapon.minRange && dist(e, u) < u.def.weapon.minRange) continue;
        const sc = e.hp - (e.def.weapon ? 150 : 0);
        if (sc < ps) { ps = sc; pick = e; }
      }
      if (pick && u.target !== pick) u.target = pick;   // switch target without changing its orders
    }
  }
  ai.squads = ai.squads.filter(s => !s.done);
}

// One step of a combined-arms assault (see startAssault in runTactics).
function runAssault(game, team, ai, tac, s, m, c) {
  const { move, cmd, rally, enemy, now } = c;
  const wall = m.filter(u => roleOf(u) === 'wall'), guns = m.filter(u => roleOf(u) === 'guns'), fast = m.filter(u => roleOf(u) === 'fast');
  const core = wall.length + guns.length ? wall.concat(guns) : fast, ctr = centroidOf(core);
  const finish = () => { s.done = true; };
  if (now - s.t > 300) return finish();
  // Losing badly: everyone falls back, without stopping to fight.
  const own = m.reduce((a, u) => a + unitPower(u), 0), foe = enemyPowerNear(game, team, ctr, 600, true);
  if (tac.retreatAt && foe > 0 && own < foe * tac.retreatAt) {
    finish(); ai.squads.push({ kind: 'retreat', ids: s.ids.slice(), t: now }); move(m, rally, false); return;
  }
  let target = game.byId.get(s.targetId);
  if (!target || target.hp <= 0) {
    // Target down: move on to the nearest known enemy building, if it's close.
    const next = pickTarget(game, team, ctr, 1);
    if (!next || dist(next, ctr) > 1500) return finish();
    s.targetId = next.id; target = next;
    if (s.phase === 'fight') s.phase = 'go';
  }
  if (s.phase === 'via') {
    if (dist(ctr, s.via) < 320 || now - s.phaseAt > 90) { s.phase = 'stage'; s.phaseAt = now; move(m, s.stage); }
    return;
  }
  if (s.phase === 'stage') {
    // Wait out of range until the slow vehicles have caught up (or we're found).
    const arrived = core.filter(u => dist(u, s.stage) < 320).length >= core.length * 0.7;
    const found = game.entities.some(e => e.team === enemy && e.kind === 'unit' && e.def.weapon && dist(e, ctr) < 450 && isVisibleTo(game, team, e));
    if (arrived || found || now - s.phaseAt > 80) s.phase = 'go';
    else return;
  }
  if (s.phase === 'go') {
    s.phase = 'fight'; s.phaseAt = now;
    const from = dist(s.stage, target) < 1200 ? s.stage : ctr;
    s.gunSpot = standOff(game, target, from, 360);
    move(wall, target);
    move(guns, s.gunSpot);
    // Flankers: dive on enemy Artillery if any is in sight, otherwise strike a
    // soft target round the side at the same time as the wall goes in.
    const n = Math.round(fast.length * (tac.flankers || 0));
    const strikers = fast.slice(0, n), rest = fast.slice(n);
    move(rest, target);
    if (strikers.length) {
      let arty = null, ad = Infinity;
      for (const e of game.entities) {
        if (e.team !== enemy || e.kind !== 'unit' || baseType(e) !== 'artillery' || e.hp <= 0 || !isVisibleTo(game, team, e)) continue;
        const d = dist(e, target); if (d < 900 && d < ad) { ad = d; arty = e; }
      }
      const soft = arty ? null : softTarget(game, team, target);
      if (arty) cmd({ type: 'attack', ids: strikers.map(u => u.id), targetId: arty.id });
      else if (soft) {
        const side = game.rng() < 0.5 ? 1 : -1;
        const route = [flankPoint(game, ctr, soft, side, 0.55, 0.55), { x: soft.x, y: soft.y }];
        ai.squads.push({ kind: 'raid', strike: true, ids: strikers.map(u => u.id), t: now, route, wpi: 0, targetId: soft.id });
        move(strikers, route[0]);
      } else move(strikers, target);
      if (arty || soft) s.ids = s.ids.filter(id => !strikers.some(u => u.id === id));
    }
    return;
  }
  // Fighting. The Artillery shells Gun Towers and enemy Artillery first
  // (whatever its side can see), the Tanks keep pushing the target.
  for (const g of guns) {
    const cur = g.order.type === 'attack' && game.byId.get(g.order.targetId);
    if (cur && cur.hp > 0) continue;
    let pick = null, ps = Infinity;
    const w = g.def.weapon;
    for (const e of game.entities) {
      if (e.team === team || e.hp <= 0) continue;
      const d = dist(e, g);
      if (d > w.range + 60 || d < w.minRange + 20 || !isVisibleTo(game, team, e)) continue;
      const sc = d - (e.kind === 'building' && e.def.weapon ? 400 : baseType(e) === 'artillery' ? 300 : e.kind === 'building' ? 100 : 0);
      if (sc < ps) { ps = sc; pick = e; }
    }
    if (pick) cmd({ type: 'attack', ids: [g.id], targetId: pick.id });
    else if (g.order.type === 'idle' && dist(g, s.gunSpot) > 200) move([g], s.gunSpot);
  }
  const idleWall = wall.filter(u => u.order.type === 'idle' && !u.target);
  if (idleWall.length) move(idleWall, target);
}
