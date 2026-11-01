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
  sectors: [
    { name: 'Westgate', x: 6, y: 32, capital: 'ally' },
    { name: 'Cinder Flats', x: 19, y: 13 },
    { name: 'Rustwater', x: 21, y: 33 },
    { name: 'Saltpan', x: 19, y: 53 },
    { name: 'Ironreach', x: 36, y: 8 },
    { name: 'Gallows Pass', x: 37, y: 26 },
    { name: 'Old Foundry', x: 35, y: 46 },
    { name: 'The Crucible', x: 51, y: 35 },
    { name: 'Broken Spire', x: 53, y: 14 },
    { name: 'Ashfall Ridge', x: 50, y: 57 },
    { name: 'Black Mire', x: 66, y: 26 },
    { name: 'Glasswind', x: 66, y: 47 },
    { name: 'Vantor Deep', x: 80, y: 11 },
    { name: 'Shard Basin', x: 80, y: 55 },
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
    bonus: { 1: supportBonus(allyLv), 2: supportBonus(enemyLv) },
    allyLv: Math.min(SUPPORT_MAX, allyLv), enemyLv: Math.min(SUPPORT_MAX, enemyLv),
    fastForward, reinforce, shareEvery: mode === 'reinforce' ? REINFORCE_SHARE : 0,
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
