// =============================================================================
// war.js — THE WAR MAP AND CAMPAIGN BATTLES
//
// Draws the theater (campaign.js has the rules), runs the war reports as
// real time passes, and starts your battles: a fresh attack you lead, or a
// drop into a battle in progress, which is first played on by the two AI
// commanders for a few minutes ("dropping in") so you arrive mid-fight.
// The campaign is saved with the other saves (saves.js) as slot "campaign",
// and the battle you're in as slot "warbattle".
// =============================================================================

const War = (() => {
  let c = null, picked = null, timer = null, newPace = 'normal', confirmNew = false, busy = false;
  const ALLY = '#4aa3ff', ENEMY = '#ff5a4a';

  async function load() {
    try { const x = JSON.parse(await Saves.get('campaign')); c = x && x.v === 1 ? x : null; } catch (err) { c = null; }
    return c;
  }
  async function save() {
    if (!c) return;
    try {
      await Saves.put('campaign', JSON.stringify(c), { at: Date.now(), campaign: true, faction: c.faction, difficulty: c.difficulty,
        held: c.owner.filter(o => o === 'ally').length });
    } catch (err) { if ($('war-note')) $('war-note').textContent = 'The campaign could not be saved just now: ' + ((err && err.message) || 'unknown error'); }
  }

  // "Campaign" on the start screen.
  async function entry() {
    unlockAudio();
    await load();
    if (c) open(); else showNew();
  }

  function showNew() {
    $('menu').classList.add('hidden'); $('war').classList.add('hidden');
    $('warnew-who').textContent = `You fight as ${FACTIONS[chosenFaction].name} on ${DIFFICULTY[chosenDifficulty].label}. ` +
      `(Change these on the start screen.) The enemy is the ${FACTIONS[chosenFaction === 'kethra' ? 'scrapline' : 'kethra'].name}.`;
    const box = $('warnew-pace'); box.innerHTML = '';
    for (const [k, p] of Object.entries(WAR_PACE)) {
      const b = document.createElement('button');
      b.className = 'pace' + (k === newPace ? ' active' : '');
      b.innerHTML = `<b>${p.label}</b><span class="dim small">${p.note}</span>`;
      b.onclick = () => { newPace = k; showNew(); };
      box.appendChild(b);
    }
    $('warnew').classList.remove('hidden');
  }
  async function begin() {
    c = createCampaign({ faction: chosenFaction, difficulty: chosenDifficulty, pace: newPace });
    picked = null;
    try { await Saves.del('warbattle'); } catch (err) { /* nothing to remove */ }
    await save();
    open();
  }

  async function open() {
    if (!c) await load();
    if (!c) { showNew(); return; }
    for (const id of ['menu', 'warnew', 'end', 'paused', 'help', 'saves']) $(id).classList.add('hidden');
    $('war').classList.remove('hidden');
    Music.play('menu', c.faction); Music.duck(false);
    const ran = catchUp(c);
    $('war-note').textContent = ran ? `While you were away: ${ran} war report${ran === 1 ? '' : 's'} came in.` : '';
    if (ran) save();
    render();
    clearInterval(timer);
    timer = setInterval(tick, 1000);
  }
  function close() {
    clearInterval(timer); timer = null;
    $('war').classList.add('hidden'); $('menu').classList.remove('hidden');
    Music.play('menu', chosenFaction);
  }
  function tick() {
    if ($('war').classList.contains('hidden')) { clearInterval(timer); timer = null; return; }
    if (catchUp(c)) { $('war-note').textContent = 'A war report just came in.'; save(); render(); sound('alert'); }
    else updateClock();
  }
  function updateClock() {
    const ms = nextReportIn(c);
    let t;
    if (c.outcome) t = c.outcome === 'won' ? 'Theater won' : 'Theater lost';
    else if (!isFinite(ms)) t = 'War on hold: it moves when you finish a battle';
    else {
      const s = Math.ceil(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60;
      t = `Next war report in ${h ? h + ':' + String(m).padStart(2, '0') : m}:${String(s % 60).padStart(2, '0')}`;
    }
    $('war-clock').textContent = t;
  }

  // "+2 Tanks, +1 Scavenger" in your faction's names.
  function describeUnits(list, faction) {
    const n = {};
    for (const t of list) n[t] = (n[t] || 0) + 1;
    return Object.entries(n).map(([t, k]) => {
      const name = factionName(faction, UNIT_TYPES[t].name);
      return `+${k} ${k > 1 ? (name === 'Artillery' ? name : name.replace(/y$/, 'ie') + 's') : name}`;
    }).join(', ') || 'nothing extra';
  }

  function render() {
    const held = c.owner.filter(o => o === 'ally').length, n = THEATER.sectors.length;
    $('war-title').innerHTML = `${THEATER.name.replace(/^The /, 'The <span>')}</span>`;
    $('war-held').innerHTML = `<b style="color:${ALLY}">${held}</b> / ${n} held · ${FACTIONS[c.faction].name} vs ${FACTIONS[c.enemy].name} · ${DIFFICULTY[c.difficulty].label}`;
    const paceBox = $('war-pace'); paceBox.innerHTML = '';
    for (const [k, p] of Object.entries(WAR_PACE)) {
      const b = document.createElement('button');
      b.textContent = p.label; b.title = p.note;
      if (k === c.pace) b.classList.add('active');
      b.onclick = () => { setPace(c, k); save(); render(); };
      paceBox.appendChild(b);
    }
    updateClock();
    drawMap();
    renderDetail();
    $('war-log').innerHTML = c.log.slice(0, 14).map(l =>
      `<div class="wl ${l.kind}"><span class="dim small">${new Date(l.at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span> ${l.text}</div>`).join('');
    $('war-newbtn').textContent = confirmNew ? 'Sure? This ends the campaign' : 'New campaign';
  }

  function drawMap() {
    const S = THEATER.sectors, svg = [];
    for (const [a, b] of THEATER.links) {
      const front = c.owner[a] !== c.owner[b];
      svg.push(`<line x1="${S[a].x}" y1="${S[a].y}" x2="${S[b].x}" y2="${S[b].y}" class="${front ? 'front' : 'link'}"/>`);
    }
    S.forEach((s, i) => {
      const col = c.owner[i] === 'ally' ? ALLY : ENEMY, b = c.battles[i], r = s.capital ? 4 : 3.2;
      const sel = i === picked, yours = c.playing && c.playing.sector === i;
      svg.push(`<g class="sector" data-i="${i}">`);
      svg.push(`<circle cx="${s.x}" cy="${s.y}" r="6" fill="transparent"/>`);
      if (sel) svg.push(`<circle cx="${s.x}" cy="${s.y}" r="${r + 2.2}" class="sel"/>`);
      if (canAttack(c, i) && !c.outcome) svg.push(`<circle cx="${s.x}" cy="${s.y}" r="${r + 1.3}" class="target"/>`);
      svg.push(`<circle cx="${s.x}" cy="${s.y}" r="${r}" fill="${col}" class="node${s.capital ? ' capital' : ''}"/>`);
      if (b) {
        // The ring: how much of the battle is going your way (blue) against theirs (red).
        const R = r + 1.1, L = 2 * Math.PI * R, k = b.p / 100;
        svg.push(`<circle cx="${s.x}" cy="${s.y}" r="${R}" class="ring" stroke="${ENEMY}"/>`);
        svg.push(`<circle cx="${s.x}" cy="${s.y}" r="${R}" class="ring" stroke="${ALLY}" stroke-dasharray="${(L * k).toFixed(2)} ${L.toFixed(2)}" transform="rotate(-90 ${s.x} ${s.y})"/>`);
        svg.push(`<circle cx="${s.x}" cy="${s.y}" r="${R + 0.6}" class="pulse ${yours ? 'yours' : ''}"/>`);
        svg.push(`<text x="${s.x}" y="${s.y + 1}" class="glyph">⚔</text>`);
      } else if (s.capital) svg.push(`<text x="${s.x}" y="${s.y + 1.1}" class="glyph">★</text>`);
      svg.push(`<text x="${s.x}" y="${s.y + r + 4}" class="label">${s.name}</text>`);
      svg.push('</g>');
    });
    $('war-map').innerHTML = svg.join('');
    for (const g of $('war-map').querySelectorAll('.sector')) g.onclick = () => { picked = +g.dataset.i; confirmNew = false; render(); };
  }

  function renderDetail() {
    const box = $('war-detail'), parts = [];
    const btn = (label, note, fn, cls = '') => ({ label, note, fn, cls });
    const actions = [];
    if (c.outcome) {
      parts.push(`<h2>${c.outcome === 'won' ? 'Victory' : 'Defeat'}</h2><p>${c.outcome === 'won'
        ? `Every battlefield in ${THEATER.name} flies your colours.` : `${THEATER.name} has fallen to the ${FACTIONS[c.enemy].name}.`}
        You won ${c.fought.won} battle${c.fought.won === 1 ? '' : 's'} and lost ${c.fought.lost}.</p>`);
    } else if (c.playing) {
      const i = c.playing.sector;
      parts.push(`<h2>You're in a battle</h2><p>You are fighting for <b>${sectorName(i)}</b>${c.playing.mode === 'reinforce' ? ' beside the allied commander' : ''}.</p>`);
      actions.push(btn('Return to the battle', 'Pick up where you left off', resumeBattle, 'big'));
      actions.push(btn('Leave it to the allied commander', 'The battle goes back on paper as it stood', abandonBattle));
    }
    if (picked === null) {
      if (!c.outcome && !c.playing) parts.push(`<h2>Pick a battlefield</h2><p class="small">Tap a battlefield on the map.
        <b>⚔</b> marks a battle in progress: join it to take command or reinforce.
        A <b>dashed ring</b> marks an enemy battlefield next to yours that you can attack.</p>`);
    } else {
      const i = picked, s = THEATER.sectors[i], b = c.battles[i], ownerSide = c.owner[i];
      const owner = ownerSide === 'ally' ? `<span style="color:${ALLY}">your side</span>` : `<span style="color:${ENEMY}">the ${FACTIONS[c.enemy].name}</span>`;
      parts.push(`<h2>${s.name}${s.capital ? ' ★' : ''}</h2><div class="small">Held by ${owner}${s.capital ? (s.capital === 'ally' ? ' · your home ground' : ' · their home ground') : ''}</div>`);
      const nb = neighbours(i), nA = nb.filter(j => c.owner[j] === 'ally').length;
      parts.push(`<div class="small dim">Borders ${nb.map(sectorName).join(', ')} (${nA} of ${nb.length} yours)</div>`);
      if (b) {
        const since = c.report - b.since;
        parts.push(`<div class="front-bar"><div style="width:${b.p}%"></div></div>
          <div class="small">${b.by === 'ally' ? 'Allied attack' : `${FACTIONS[c.enemy].name} attack`} · ${Math.round(b.p)}% going your way ·
          ${since ? `${since} war report${since === 1 ? '' : 's'} so far` : 'just started'}</div>`);
      }
      const lead = battleSetup(c, i, 'lead');
      if (b && !c.playing && !c.outcome) {
        const cmd = battleSetup(c, i, 'command'), rf = battleSetup(c, i, 'reinforce');
        parts.push(`<div class="small"><b>Your side's start:</b> ${describeUnits(cmd.bonus[1], c.faction)} (support ${cmd.allyLv}/4).
          The enemy: ${describeUnits(cmd.bonus[2], c.enemy)} (support ${cmd.enemyLv}/4).</div>`);
        actions.push(btn('Take command', 'Take over the allied base and army as they stand, a few minutes into the battle', () => fight(i, 'command'), 'big'));
        actions.push(btn('Reinforce', `Land with a strike force (${describeUnits(rf.reinforce, c.faction).replace(/\+/g, '')}) beside the allied commander, who keeps fighting and sends you every third vehicle it builds`, () => fight(i, 'reinforce')));
      } else if (!b && canAttack(c, i) && !c.playing && !c.outcome) {
        parts.push(`<div class="small"><b>Your start here:</b> ${describeUnits(lead.bonus[1], c.faction)} (support ${lead.allyLv}/4 from the battlefields you hold around it).
          The enemy: ${describeUnits(lead.bonus[2], c.enemy)} (support ${lead.enemyLv}/4).</div>`);
        actions.push(btn('Attack', 'Lead a fresh attack from the first minute. Win and the battlefield is yours.', () => fight(i, 'lead'), 'big'));
      } else if (!b && ownerSide === 'enemy') {
        parts.push(`<p class="small dim">Behind enemy lines. You can only attack a battlefield next to one your side holds: take a neighbour first.</p>`);
      } else if (!b) {
        parts.push(`<p class="small dim">Quiet for now. If the enemy attacks here, you can come to its defence.
          Fighting here would give your side ${describeUnits(lead.bonus[1], c.faction)}.</p>`);
      }
    }
    box.innerHTML = parts.join('');
    if (actions.length) {
      const row = document.createElement('div'); row.className = 'war-actions';
      for (const a of actions) {
        const el = document.createElement('button');
        el.className = a.cls; el.innerHTML = `<b>${a.label}</b><span class="small dim">${a.note}</span>`;
        el.onclick = () => { if (!busy) a.fn(); };
        row.appendChild(el);
      }
      box.appendChild(row);
    }
  }

  // Start your battle on battlefield i (see battleSetup in campaign.js).
  async function fight(i, mode) {
    busy = true;
    catchUp(c);
    if (mode !== 'lead' && !c.battles[i]) { busy = false; $('war-note').textContent = `The battle for ${sectorName(i)} ended before you got there.`; render(); return; }
    const setup = battleSetup(c, i, mode);
    beginBattle(c, i, mode);
    const g = createGame({ seed: setup.seed, mapSeed: setup.mapSeed, difficulty: setup.difficulty,
      aiTeams: mode === 'lead' ? [2] : [1, 2], factions: setup.factions, bonus: setup.bonus });
    g.teams[1].incomeMult = 1;   // the enemy's difficulty handicap is theirs alone
    if (setup.fastForward) {
      // The battle has been going for a while: let the two commanders play it
      // on, a slice per frame so the page stays responsive.
      $('wardrop').classList.remove('hidden');
      $('wardrop-text').textContent = `Dropping in to ${sectorName(i)}. The battle has been raging for ${Math.round(setup.fastForward / 60)} minutes…`;
      while (g.time < setup.fastForward && !g.winner) {
        const t0 = performance.now();
        while (performance.now() - t0 < 40 && g.time < setup.fastForward && !g.winner) {
          if (g.rng() < 0.5) { aiUpdate(g, 1); aiUpdate(g, 2); } else { aiUpdate(g, 2); aiUpdate(g, 1); }
          stepGame(g); g.events.length = 0;
        }
        $('wardrop-bar').style.width = `${Math.min(100, g.time / setup.fastForward * 100)}%`;
        await new Promise(r => requestAnimationFrame(r));
      }
      $('wardrop').classList.add('hidden');
      if (g.winner) {
        // It was decided before you landed.
        c.playing = null; settle(c, i, g.winner === 1 ? 'ally' : 'enemy');
        $('war-note').textContent = `The battle for ${sectorName(i)} was decided before you landed.`;
        busy = false; save(); render(); return;
      }
    }
    const hq = g.entities.find(e => e.team === 1 && (e.type === 'recycler' || e.type === 'mobileRecycler'));
    let force = [];
    if (mode === 'command') g.aiTeams = [2];
    if (mode === 'reinforce') {
      g.teams[1].shareEvery = setup.shareEvery;
      // Land between the allied base and the middle of the map.
      const mid = { x: g.map.W * CONFIG.TILE / 2, y: g.map.H * CONFIG.TILE / 2 }, a = angleTo(hq, mid);
      force = setup.reinforce.map((type, k) => {
        const u = addUnitNear(g, type, 1, hq.x + Math.cos(a) * (260 + (k % 3) * 40) - Math.sin(a) * ((k % 3) - 1) * 40 + Math.floor(k / 3) * 30,
          hq.y + Math.sin(a) * (260 + (k % 3) * 40) + Math.cos(a) * ((k % 3) - 1) * 40);
        u.cmdr = 'player';
        return u;
      });
    }
    game = g;
    clearInterval(timer); timer = null;
    $('war').classList.add('hidden');
    enterBattle(false, { sector: i, mode });
    input.groups = {}; view.groupOf = new Map();
    view.cam.zoom = Math.max(0.55, Math.min(1, Math.min(view.screenW, view.screenH) / 700));
    if (mode === 'reinforce') { centerOn(force[0]); select(force); }
    else { centerOn(hq); select([hq]); }
    const where = sectorName(i);
    logMessage(mode === 'lead' ? `Attack on ${where}: drive your Recycler onto a geyser and deploy it.`
      : mode === 'command' ? `You have command at ${where}. The base and army are yours.`
      : `You've landed at ${where}. You command the vehicles with gold markers; the allied commander runs the base and sends you more.`, 'info');
    if (setup.bonus[1].length) logMessage(`Support from neighbouring battlefields: ${describeUnits(setup.bonus[1], c.faction)}`, 'good');
    refreshPanel();
    busy = false;
    await save();
    saveTo('warbattle', true);
  }

  // Your campaign battle ended (from showEnd). Returns a line for the end screen.
  function battleOver(won) {
    if (!c || !c.playing) return '';
    const i = c.playing.sector;
    endBattle(c, won ? 'won' : 'lost');
    Saves.del('warbattle').catch(() => {});
    save();
    return won ? `${sectorName(i)} is now yours.` : `${sectorName(i)} falls to the ${FACTIONS[c.enemy].name}.`;
  }
  // "Leave battle" on the pause screen: the battle goes back on paper.
  async function leaveBattle() {
    if (c && c.playing) endBattle(c, 'left', game ? fieldShare(game) : 0.5);
    game = null; view.war = null; view.reinforce = false;
    paused = false; $('paused').classList.add('hidden');
    try { await Saves.del('warbattle'); } catch (err) { /* already gone */ }
    await save();
    open();
  }
  async function resumeBattle() {
    try { resumeFrom(await Saves.get('warbattle')); clearInterval(timer); timer = null; }
    catch (err) { $('war-note').textContent = 'That battle could not be found, so the allied commander has taken it over.'; abandonBattle(); }
  }
  async function abandonBattle() {
    endBattle(c, 'left', 0.5);
    try { await Saves.del('warbattle'); } catch (err) { /* already gone */ }
    await save(); render();
  }

  $('campaign').onclick = entry;
  $('warnew-begin').onclick = begin;
  $('warnew-back').onclick = () => { $('warnew').classList.add('hidden'); $('menu').classList.remove('hidden'); };
  $('war-menu').onclick = close;
  $('war-newbtn').onclick = () => { if (!confirmNew && !c.outcome) { confirmNew = true; render(); return; } confirmNew = false; showNew(); };

  return { open, battleOver, leaveBattle, get campaign() { return c; } };
})();
