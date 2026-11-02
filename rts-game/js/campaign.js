// =============================================================================
// campaign.js — THE WAR FOR A THEATER
//
// A theater is fifteen battlefields joined into a web. Your side (the
// faction you picked) starts with the west, the enemy with the east, and the
// AI commanders of both sides fight over the front lines "on paper": every
// war report (real time, at the pace you choose) each battle swings one way
// or the other, and fresh offensives start against neighbouring
// battlefields. You can jump into any battle your side is fighting (take
// command, or reinforce the allied commander), or start an attack of your
// own on an enemy battlefield next to one your side holds.
//
// Holding the battlefields around a fight gives that side a better start
// there: extra vehicles for every neighbour held. Control all fifteen to win
// the theater; lose them all and the war is lost.
//
// Everything here is plain data and rules, with no drawing, so the rules
// tests can run it. war.js draws the war map and runs the battles.
// =============================================================================

const THEATER = {
  name: 'The Cinder Reach',
  // x 0–100 west to east, y 0–64 north to south (the war map's layout).
  // `uplinks`: a capture-and-hold battlefield (three uplinks; hold two to win).
  sectors: [
    { name: 'Westgate', x: 6, y: 32, capital: 'ally' },
    { name: 'Cinder Flats', x: 19, y: 13 },
    { name: 'Rustwater', x: 21, y: 33, uplinks: true },
    { name: 'Saltpan', x: 19, y: 53 },
    { name: 'Ironreach', x: 36, y: 8 },
    { name: 'Gallows Pass', x: 37, y: 26, uplinks: true },
    { name: 'Old Foundry', x: 35, y: 46 },
    { name: 'The Crucible', x: 51, y: 35, uplinks: true },
    { name: 'Broken Spire', x: 53, y: 14 },
    { name: 'Ashfall Ridge', x: 50, y: 57 },
    { name: 'Black Mire', x: 66, y: 26, uplinks: true },
    { name: 'Glasswind', x: 66, y: 47 },
    { name: 'Vantor Deep', x: 80, y: 11 },
    { name: 'Shard Basin', x: 80, y: 55, uplinks: true },
    { name: 'Eastgate', x: 94, y: 32, capital: 'enemy' },
  ],
  links: [
    [0, 1], [0, 2], [0, 3], [1, 2], [2, 3], [1, 4], [1, 5], [2, 5], [2, 6], [3, 6], [4, 5], [5, 6],
    [4, 8], [5, 8], [5, 7], [6, 7], [6, 9], [3, 9], [7, 8], [7, 9], [7, 10], [7, 11], [8, 10], [8, 12],
    [9, 11], [9, 13], [10, 11], [10, 12], [11, 13], [10, 14], [11, 14], [12, 14], [13, 14],
  ],
};

// How often a war report comes in. While you are away the war moves at most
// WAR_AWAY_CAP reports, so you never come back to find it decided.
const WAR_PACE = {
  fast:   { label: 'Fast',      every: 10 * 60e3,   note: 'a report every 10 minutes' },
  normal: { label: 'Normal',    every: 30 * 60e3,   note: 'a report every 30 minutes' },
  slow:   { label: 'Slow',      every: 2 * 3600e3,  note: 'a report every 2 hours' },
  crawl:  { label: 'Very slow', every: 8 * 3600e3,  note: 'a report every 8 hours' },
  hold:   { label: 'Hold',      every: Infinity,    note: 'the war only moves when you finish a battle' },
};
const WAR_AWAY_CAP = 12;

// Extra vehicles for each neighbouring battlefield a side holds (the
// battlefield itself counts too, for its owner), up to four levels.
const SUPPORT_BONUS = [['tank', 'scavenger'], ['hornet', 'hornet'], ['tank', 'artillery'], ['tank', 'sentry']];
const SUPPORT_MAX = 4;
// What you land with when you reinforce an allied commander, plus one more
// vehicle per support level.
const REINFORCE_BASE = ['tank', 'tank', 'hornet', 'hornet', 'scout'];
const REINFORCE_EXTRA = ['tank', 'artillery', 'hornet', 'tank'];
const REINFORCE_SHARE = 3;   // the allied commander sends you every third fighting vehicle it builds

// Per difficulty: how many offensives the enemy runs at once, how keen it is
// to start one, and a nudge to every paper battle (+ favours your side).
const WAR_DIFFICULTY = {
  easy:   { enemyFronts: 1, enemyEagerness: 0.3,  bias: 1.5 },
  normal: { enemyFronts: 2, enemyEagerness: 0.45, bias: 0 },
  hard:   { enemyFronts: 3, enemyEagerness: 0.6,  bias: -0.5 },
};
const ALLY_FRONTS = 2, ALLY_EAGERNESS = 0.45;

const otherSide = side => side === 'ally' ? 'enemy' : 'ally';
const neighbours = i => THEATER.links.filter(l => l.includes(i)).map(l => l[0] === i ? l[1] : l[0]);

function createCampaign({ faction = 'scrapline', difficulty = 'normal', pace = 'normal', seed = Math.floor(Math.random() * 99999) + 1, now = Date.now() } = {}) {
  const n = THEATER.sectors.length;
  const c = {
    v: 1, seed, faction, enemy: faction === 'kethra' ? 'scrapline' : 'kethra', difficulty, pace,
    started: now, lastReport: now, report: 0,
    owner: THEATER.sectors.map((s, i) => (i <= 6 ? 'ally' : 'enemy')),
    battles: {},        // sector -> { by: side attacking, p: 0–100 how much is yours, since: report it started }
    playing: null,      // { sector, mode } while you are in a battle
    log: [],
    outcome: null,      // 'won' or 'lost' once the theater is decided
    fought: { won: 0, lost: 0, left: 0 },
    heldSince: THEATER.sectors.map(() => 0),   // the report each battlefield last changed hands
  };
  // The war is already under way: one offensive each across the middle.
  c.battles[7] = { by: 'ally', p: 45, since: 0 };
  c.battles[6] = { by: 'enemy', p: 55, since: 0 };
  warLog(c, now, `The war for ${THEATER.name} begins. Your side holds the west.`, 'info');
  return c;
}

function warLog(c, now, text, kind = 'info') {
  c.log.unshift({ at: now, report: c.report, text, kind });
  c.log.length = Math.min(c.log.length, 40);
}

const sectorName = i => THEATER.sectors[i].name;
const sideLabel = (c, side) => FACTIONS[side === 'ally' ? c.faction : c.enemy].name;

// How many of a battlefield's neighbours a side holds, plus one if it holds
// the battlefield itself: that side's support there (0–4).
function support(c, i, side) {
  const n = neighbours(i).filter(j => c.owner[j] === side).length + (c.owner[i] === side ? 1 : 0);
  return Math.min(SUPPORT_MAX, n);
}

// You (and the AI) can only attack an enemy battlefield next to one your side holds.
function canAttack(c, i, side = 'ally') {
  return c.owner[i] === otherSide(side) && !c.battles[i] && neighbours(i).some(j => c.owner[j] === side);
}

function supportBonus(level) { return SUPPORT_BONUS.slice(0, Math.max(0, Math.min(SUPPORT_MAX, level))).flat(); }

// One war report: every paper battle swings, and each side may start a new offensive.
function warReport(c, now = Date.now()) {
  if (c.outcome) return;
  c.report++;
  const rng = makeRng(c.seed * 977 + c.report * 131 + 17);
  const wd = WAR_DIFFICULTY[c.difficulty] || WAR_DIFFICULTY.normal;
  for (const key of Object.keys(c.battles)) {
    const i = +key, b = c.battles[i];
    if (c.playing && c.playing.sector === i) continue;   // you are fighting this one for real
    const A = 1 + support(c, i, 'ally'), E = 1 + support(c, i, 'enemy');
    b.p = Math.max(0, Math.min(100, b.p + 12 * (A - E) / (A + E) + wd.bias + (rng() * 2 - 1) * 24));
    if (b.p >= 100 || b.p <= 0) settle(c, i, b.p >= 100 ? 'ally' : 'enemy', now);
  }
  for (const side of ['enemy', 'ally']) {
    const fronts = side === 'ally' ? ALLY_FRONTS : wd.enemyFronts;
    const eager = side === 'ally' ? ALLY_EAGERNESS : wd.enemyEagerness;
    if (Object.values(c.battles).filter(b => b.by === side).length >= fronts || rng() > eager) continue;
    // Pick the target where this side has the most support over the other.
    const targets = THEATER.sectors.map((s, i) => i).filter(i => canAttack(c, i, side));
    if (!targets.length) continue;
    targets.sort((a, b) => (support(c, b, side) - support(c, b, otherSide(side))) - (support(c, a, side) - support(c, a, otherSide(side))) || rng() - 0.5);
    const t = targets[rng() < 0.7 ? 0 : Math.floor(rng() * targets.length)];
    c.battles[t] = { by: side, p: side === 'ally' ? 45 : 55, since: c.report };
    warLog(c, now, side === 'ally' ? `Allied forces attack ${sectorName(t)}.` : `${sideLabel(c, 'enemy')} forces attack ${sectorName(t)}!`, side === 'ally' ? 'info' : 'warn');
  }
  checkOutcome(c, now);
}

// A battle is over: `winner` ('ally' or 'enemy') holds the battlefield.
function settle(c, i, winner, now = Date.now(), byYou = false) {
  const b = c.battles[i];
  delete c.battles[i];
  const before = c.owner[i];
  c.owner[i] = winner;
  if (before !== winner) (c.heldSince || (c.heldSince = THEATER.sectors.map(() => 0)))[i] = c.report;
  const who = byYou ? 'You' : winner === 'ally' ? 'Allied forces' : sideLabel(c, 'enemy') + ' forces';
  const what = before === winner ? 'held' : 'took';
  warLog(c, now, `${who} ${what} ${sectorName(i)}.`, winner === 'ally' ? 'good' : 'bad');
  if (b && c.playing && c.playing.sector === i) c.playing = null;
  checkOutcome(c, now);
}

function checkOutcome(c, now) {
  if (c.outcome) return;
  if (c.owner.every(o => o === 'ally')) { c.outcome = 'won'; warLog(c, now, `${THEATER.name} is yours. The theater is won!`, 'good'); }
  else if (c.owner.every(o => o === 'enemy')) { c.outcome = 'lost'; warLog(c, now, `${THEATER.name} has fallen. The war is lost.`, 'bad'); }
}

// Run the war reports that came due since the last one. Returns how many ran.
function catchUp(c, now = Date.now()) {
  const every = (WAR_PACE[c.pace] || WAR_PACE.normal).every;
  if (!isFinite(every) || c.outcome) { c.lastReport = now; return 0; }
  let due = Math.floor((now - c.lastReport) / every);
  if (due <= 0) return 0;
  const capped = due > WAR_AWAY_CAP;
  due = Math.min(due, WAR_AWAY_CAP);
  for (let k = 0; k < due && !c.outcome; k++) warReport(c, c.lastReport + (k + 1) * every);
  c.lastReport = capped ? now : c.lastReport + due * every;
  return due;
}
// Milliseconds until the next war report (Infinity on Hold).
const nextReportIn = (c, now = Date.now()) => Math.max(0, c.lastReport + (WAR_PACE[c.pace] || WAR_PACE.normal).every - now);

function setPace(c, pace, now = Date.now()) {
  catchUp(c, now);
  c.pace = pace;
  if (pace === 'hold' || !isFinite((WAR_PACE[c.pace] || {}).every)) c.lastReport = now;
  else c.lastReport = Math.max(c.lastReport, now - WAR_PACE[pace].every + 1000);   // a slower pace doesn't fire at once
}

// Everything needed to start (or drop into) a battle on battlefield i.
//   mode 'lead':      a fresh attack that you command from the first minute
//   mode 'command':   take over the allied side of a battle in progress
//   mode 'reinforce': land with a strike force beside the allied commander
// The game itself is made from this by war.js (createGame + fast-forward).
function battleSetup(c, i, mode) {
  const b = c.battles[i];
  let allyLv = support(c, i, 'ally'), enemyLv = support(c, i, 'enemy');
  let fastForward = 0;
  if (mode !== 'lead' && b) {
    // Join a battle that's been going for a while: the side that's ahead on
    // paper starts with more, and the battle runs on a few minutes first.
    fastForward = Math.max(150, Math.min(360, 150 + 50 * (c.report - b.since)));
    const lead = Math.round((b.p - 50) / 25);
    if (lead > 0) allyLv += lead; else enemyLv -= lead;
  }
  const reinforce = mode === 'reinforce' ? REINFORCE_BASE.concat(REINFORCE_EXTRA.slice(0, support(c, i, 'ally'))) : [];
  return {
    sector: i, mode,
    mapSeed: (c.seed * 31 + i * 7919) % 99991 + 1,
    seed: (c.seed * 17 + c.report * 389 + i * 61 + c.fought.won * 7 + c.fought.lost * 11 + c.fought.left * 13) % 99991 + 1,
    difficulty: c.difficulty,
    factions: { 1: c.faction, 2: c.enemy },
    // Support adds vehicles; the holder's support also shows in how built-up
    // its base is (fortification), so it gets two levels fewer here.
    bonus: { 1: supportBonus(allyLv - (c.owner[i] === 'ally' ? 2 : 0)), 2: supportBonus(enemyLv - (c.owner[i] === 'enemy' ? 2 : 0)) },
    allyLv: Math.min(SUPPORT_MAX, allyLv), enemyLv: Math.min(SUPPORT_MAX, enemyLv),
    fastForward, reinforce, shareEvery: mode === 'reinforce' ? REINFORCE_SHARE : 0,
    // The holder has a base there already; the other side lands.
    defender: c.owner[i] === 'ally' ? 1 : 2, fort: fortification(c, i),
    uplinks: !!THEATER.sectors[i].uplinks, tempo: CONFIG.CAMPAIGN_TEMPO,
  };
}

// You start a battle (or drop into one) on battlefield i.
function beginBattle(c, i, mode, now = Date.now()) {
  if (!c.battles[i]) {
    if (!canAttack(c, i)) throw new Error('You can only attack a battlefield next to one your side holds');
    c.battles[i] = { by: 'ally', p: 45, since: c.report };
    warLog(c, now, `You lead an attack on ${sectorName(i)}.`, 'info');
  } else warLog(c, now, mode === 'reinforce' ? `You reinforce the allied commander at ${sectorName(i)}.` : `You take command at ${sectorName(i)}.`, 'info');
  c.playing = { sector: i, mode };
}

// Your battle is over. result: 'won', 'lost', or 'left' with `share` (0–1),
// how much of the fighting strength on the field was yours when you left.
function endBattle(c, result, share = 0.5, now = Date.now()) {
  if (!c.playing) return;
  const i = c.playing.sector;
  c.fought[result]++;
  if (result === 'won') settle(c, i, 'ally', now, true);
  else if (result === 'lost') settle(c, i, 'enemy', now);
  else {
    // Back on paper, starting from how things stood when you left.
    const b = c.battles[i];
    if (b) b.p = Math.max(5, Math.min(95, Math.round(share * 100)));
    warLog(c, now, `You left the battle for ${sectorName(i)}. The allied commander fights on.`, 'info');
    c.playing = null;
  }
  // On Hold the war waits for you, so each battle you finish moves it on once.
  if (c.pace === 'hold') warReport(c, now);
}

// How much of the fighting strength in a game is team 1's (for leaving a battle).
function fieldShare(game) {
  const worth = t => game.entities.filter(e => e.team === t && e.hp > 0).reduce((s, e) => s + (e.def.cost || 150) * (e.hp / e.maxHp), 0);
  const a = worth(1), b = worth(2);
  return a + b > 0 ? a / (a + b) : 0.5;
}

// =============================================================================
// Campaign battlefields: the side holding a battlefield has a base there
// already; the attacker lands at a landing zone with its Recycler on wheels
// and a strike force, then claims a free geyser or liberates one of the
// defender's. (Uses sim.js and ai.js; war.js calls these.)
// =============================================================================

// How built-up the holder's base is, 1–4: more with more support around it,
// on home ground, and the longer it has been held.
function fortification(c, i) {
  const side = c.owner[i], held = c.report - ((c.heldSince || [])[i] || 0);
  return Math.max(1, Math.min(4, 1 + Math.floor(support(c, i, side) / 3) + (THEATER.sectors[i].capital ? 1 : 0) + (held >= 6 ? 1 : 0)));
}

// What the holder's base has at each level (each level adds to the ones below).
const FORT = {
  extractors: [1, 2, 2, 3], towers: [1, 2, 3, 4], silos: [0, 1, 1, 2], scavengers: [3, 4, 5, 6],
  garrison: ['tank', 'tank', 'scout', 'hornet', 'hornet', 'tank', 'artillery', 'tank', 'hornet', 'artillery', 'tank', 'tank'],
  garrisonSize: [2, 4, 6, 9], sentries: [0, 1, 1, 2],
};

function clearTeam(game, team) {
  for (const e of game.entities) if (e.team === team) game.byId.delete(e.id);
  game.entities = game.entities.filter(e => e.team !== team);
}

// A Recycler or Extractor set down on a geyser, finished.
function placeOnGeyser(game, team, type, g) {
  const size = BUILDING_TYPES[type].size;
  const off = size === 3 && inMirroredHalf(game, g.x, g.y) ? 2 : 1;
  const tx = g.tx - off, ty = g.ty - off;
  for (let y = ty; y < ty + size; y++) for (let x = tx; x < tx + size; x++) if (isBlockedTile(game, x, y)) return null;
  const b = addBuilding(game, type, team, tx, ty, true);
  b.geyserId = g.id; g.extractorId = b.id;
  return b;
}

const mapCentre = game => ({ x: game.map.W * CONFIG.TILE / 2, y: game.map.H * CONFIG.TILE / 2 });

// The holder's base in its corner, built up to `fort` (1–4), plus `extra` vehicles.
function establishBase(game, team, fort, extra = []) {
  clearTeam(game, team);
  const T = CONFIG.TILE, L = fort - 1, corner = game.map.bases[game.corner[team]];
  const home = { x: (corner.x + 0.5) * T, y: (corner.y + 0.5) * T };
  const free = () => game.geysers.filter(g => !geyserTaken(game, g));
  const hq = placeOnGeyser(game, team, 'recycler', free().sort((a, b) => dist(a, home) - dist(b, home))[0]);
  if (fort >= 3) hq.level = 2;   // Recycler II
  // Extractors on the nearest geysers, except that from level 2 one of them
  // is an outpost further out (one an attacker can try to liberate).
  const near = free().sort((a, b) => dist(a, hq) - dist(b, hq));
  const outpost = fort >= 2 ? near.find(g => dist(g, hq) > 1200 && dist(g, hq) < 2400) : null;
  const picks = near.filter(g => g !== outpost && dist(g, hq) < 1200).slice(0, FORT.extractors[L] - (outpost ? 1 : 0)).concat(outpost ? [outpost] : []);
  for (const g of picks) placeOnGeyser(game, team, 'extractor', g);
  updateVisibility(game);
  const toC = angleTo(hq, mapCentre(game));
  const put = (type, near) => { const s = findBuildSpot(game, team, type, hq, toC, near); return s ? addBuilding(game, type, team, s.x, s.y, true) : null; };
  put('factory');
  for (let k = 0; k < FORT.silos[L]; k++) put('basesilo');
  const outposts = game.entities.filter(e => e.team === team && e.type === 'extractor').sort((a, b) => dist(b, hq) - dist(a, hq));
  for (let k = 0; k < FORT.towers[L]; k++) put('tower', k === 0 ? null : outposts[(k - 1) % Math.max(1, outposts.length)] || null);
  if (fort >= 3) put('repairpad');
  if (fort >= 4) put('lab');
  // Vehicles: workers at home, the garrison just in front of the base.
  const rally = { x: hq.x + Math.cos(toC) * 220, y: hq.y + Math.sin(toC) * 220 };
  const nearTo = (type, p, k) => addUnitNear(game, type, team, p.x + ((k % 4) - 1.5) * 34, p.y + (Math.floor(k / 4) - 1) * 34);
  for (let k = 0; k < FORT.scavengers[L]; k++) nearTo(hq.level > 1 ? 'scavenger2' : 'scavenger', { x: hq.x - Math.cos(toC) * 90, y: hq.y - Math.sin(toC) * 90 }, k);
  nearTo(hq.level > 1 ? 'constructor2' : 'constructor', hq, 5);
  FORT.garrison.slice(0, FORT.garrisonSize[L]).concat(extra).forEach((type, k) => nearTo(type, rally, k));
  for (let k = 0; k < FORT.sentries[L]; k++) {
    const s = nearTo('sentry', { x: rally.x + Math.cos(toC) * 90, y: rally.y + Math.sin(toC) * 90 }, k * 2);
    s.deployed = true; s.legE = 1;
  }
  const tm = game.teams[team];
  tm.scrap = Math.min(scrapCapacity(game, team), 150 + 50 * fort);
  for (const e of game.entities) if (e.team === team && e.kind === 'unit' && e.def.role === 'harvester') autoHarvest(game, e);
  delete game.ai[team];
  updateVisibility(game);
  return hq;
}

// Up to two landing zones for the attacker, given the defender's base:
//   'free':     next to an unclaimed geyser, well clear of the defences
//   'liberate': within striking distance of the defender's most outlying
//               Extractor (destroy it, then deploy on its geyser), or, if all
//               its Extractors sit inside the base, a second free geyser.
function landingZones(game, defTeam) {
  const T = CONFIG.TILE, defs = game.entities.filter(e => e.team === defTeam && e.kind === 'building');
  const hq = defs.find(b => b.type === 'recycler');
  const clear = p => Math.min(...defs.map(b => dist(b, p)));
  const open = (p, away, from) => {
    // Step back from `p`, directly away from `from`, until `away` clear of the defences.
    const a = angleTo(from, p);
    for (let r = 0; r < 1600; r += 40) {
      const q = { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r };
      if (clear(q) < away) continue;
      const t = nearestOpenTile(game, Math.floor(q.x / T), Math.floor(q.y / T), 6);
      if (t) return { x: (t.x + 0.5) * T, y: (t.y + 0.5) * T };
    }
    return null;
  };
  // Unclaimed geysers well clear of the defences, nearest their base first,
  // counting loose scrap within 900 px as being 600 px nearer.
  const scrapNear = g => game.scrap.some(n => dist(n, g) < 900);
  const freeG = game.geysers.filter(g => !geyserTaken(game, g) && clear(g) >= 1100)
    .sort((a, b) => (dist(a, hq) - (scrapNear(a) ? 600 : 0)) - (dist(b, hq) - (scrapNear(b) ? 600 : 0)));
  const zones = [];
  if (freeG[0]) {
    const p = open(freeG[0], 0, hq) || freeG[0];
    zones.push({ key: 'free', name: 'Unclaimed geyser', desc: 'Land beside a geyser nobody holds, well clear of their defences. Deploy and build up, then strike.', x: p.x, y: p.y, geyserId: freeG[0].id });
  }
  const outer = defs.filter(b => b.type === 'extractor').sort((a, b) => dist(b, hq) - dist(a, hq))[0];
  if (outer && dist(outer, hq) > 900) {
    const p = open(outer, 600, hq);
    if (p) zones.push({ key: 'liberate', name: 'Liberate a geyser', desc: 'Land near their outlying Extractor. Destroy it and deploy your Recycler on its geyser: closer to their base, but a fight from the first minute.', x: p.x, y: p.y, geyserId: outer.geyserId });
  }
  if (zones.length < 2) {
    const alt = freeG.slice(1).sort((a, b) => dist(b, freeG[0]) - dist(a, freeG[0]))[0];
    if (alt) { const p = open(alt, 0, hq) || alt; zones.push({ key: 'flank', name: 'Far flank', desc: 'Land beside an unclaimed geyser on the other flank, far from their defences.', x: p.x, y: p.y, geyserId: alt.id }); }
  }
  return zones;
}

// The attacker lands at a zone: the usual Recycler on wheels, workers and
// escort, plus `extra` vehicles. It knows where the defender's Recycler and
// Extractors are (the reason it came).
// What every landing brings besides the Recycler and workers.
const LANDING_FORCE = ['tank', 'tank', 'hornet', 'hornet', 'scout', 'scout'];
const LANDING_CRATES = 4, LANDING_CRATE_SCRAP = 250;
// The attacker also brings this many extra call-ins.
const LANDING_CALLINS = 2;
function landAt(game, team, zone, extra = [], defTeam = 3 - team) {
  clearTeam(game, team);
  const toward = game.entities.find(e => e.team === defTeam && e.type === 'recycler') || mapCentre(game);
  const a = angleTo(zone, toward), ca = Math.cos(a), sa = Math.sin(a);
  // Rows facing the enemy: escort in front, Recycler and workers behind.
  const at = (f, r) => ({ x: zone.x + ca * f - sa * r, y: zone.y + sa * f + ca * r });
  const put = (type, p) => { const u = addUnitNear(game, type, team, p.x, p.y); u.angle = u.turret = a; return u; };
  put('mobileRecycler', at(-40, 0));
  put('scavenger', at(-90, -40)); put('scavenger', at(-90, 40)); put('constructor', at(-90, 0));
  LANDING_FORCE.concat(extra).forEach((type, k) => put(type, at(40 + Math.floor(k / 4) * 36, ((k % 4) - 1.5) * 36)));
  // Supply crates come down with the landing, so the Scavengers have scrap
  // to work on straight away.
  for (let k = 0; k < LANDING_CRATES; k++) {
    const p = at(-170, (k - (LANDING_CRATES - 1) / 2) * 70), t = nearestOpenTile(game, Math.floor(p.x / CONFIG.TILE), Math.floor(p.y / CONFIG.TILE), 6);
    if (t) game.scrap.push({ id: 500000 + game.nextId++, x: (t.x + 0.5) * CONFIG.TILE, y: (t.y + 0.5) * CONFIG.TILE, amount: LANDING_CRATE_SCRAP, max: LANDING_CRATE_SCRAP, wreck: true });
  }
  for (const b of game.entities) if (b.team === defTeam && (b.type === 'recycler' || b.type === 'extractor')) b.seen[team] = true;
  updateVisibility(game);
  for (const e of game.entities) if (e.team === team && e.kind === 'unit' && e.def.role === 'harvester') autoHarvest(game, e);
}

// The battle's game, before the attacker lands: the holder's base built, the
// landing zones worked out. Then landAttacker() puts the attacker down.
function prepareBattle(setup, aiTeams) {
  const g = createGame({ seed: setup.seed, mapSeed: setup.mapSeed, difficulty: setup.difficulty, aiTeams,
    factions: setup.factions, uplinks: setup.uplinks, tempo: setup.tempo });
  g.teams[1].incomeMult = setup.tempo;   // the difficulty handicap is the enemy's alone
  const defender = setup.defender, attacker = 3 - defender;
  establishBase(g, defender, setup.fort, setup.bonus[defender]);
  g.ai[defender] = { next: 0, nextWave: CONFIG.DEFENDER_FIRST_WAVE };
  g.ai[attacker] = { next: 0, nextWave: CONFIG.LANDER_FIRST_WAVE };   // builds up before striking
  return { game: g, zones: landingZones(g, defender), defender, attacker };
}
function landAttacker(prep, setup, zone) {
  landAt(prep.game, prep.attacker, zone || prep.zones[0], setup.bonus[prep.attacker], prep.defender);
  prep.game.teams[prep.attacker].callins += LANDING_CALLINS;   // support for the landing
}
