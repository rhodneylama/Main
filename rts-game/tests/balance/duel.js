// One game: the current opponent (js/ai.js, team 1) against the previous one
// (ai_previous.js, team 2). Prints one line of JSON.
//   node duel.js <seed> <difficulty> [limitSeconds]
// Environment: BOTHOLD=1 plays the previous opponent on both sides (the
// baseline: should come out even); OVER="js" runs after the settings load,
// e.g. OVER="DIFFICULTY.hard.tactics.feint=0" to try a change.
const fs = require('fs'), vm = require('vm'), path = require('path');
const dir = path.join(__dirname, '..', '..', 'js');
const [seed, diff, limit] = [+process.argv[2], process.argv[3] || 'normal', +(process.argv[4] || 3600)];
const code = ['config', 'map', 'sim', 'ai'].map(f => fs.readFileSync(path.join(dir, f + '.js'), 'utf8')).join('\n') + '\n' + fs.readFileSync(path.join(__dirname, 'ai_previous.js'), 'utf8');
const ctx = { console, Math }; vm.createContext(ctx);
vm.runInContext(code + ';' + (process.env.OVER || '') + `;
var g = createGame({ seed: ${seed}, difficulty: '${diff}', aiTeams: [1, 2] });
const A1 = ${process.env.BOTHOLD ? 'aiUpdateOld' : 'aiUpdate'};
while (!g.winner && g.time < ${limit}) {
  if (g.rng() < 0.5) { A1(g, 1); aiUpdateOld(g, 2); } else { aiUpdateOld(g, 2); A1(g, 1); }
  stepGame(g); g.events.length = 0;
}
console.log(JSON.stringify({ seed: ${seed}, diff: '${diff}', winner: g.winner, time: Math.round(g.time), lost: [g.teams[1].stats.lost, g.teams[2].stats.lost] }));`, ctx);
