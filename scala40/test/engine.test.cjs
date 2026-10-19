const assert = require('node:assert/strict');
const E = require('../engine.js');
const AI = require('../ai.js');

let pass = 0;
const ok = (cond, nome) => { assert.ok(cond, nome); pass++; console.log('PASS ' + nome); };

// --- mazzi ---
ok(E.deck(1).length === 54, 'mazzo 2 giocatori = 54 carte');
ok(E.deck(2).length === 108, 'mazzo 4 giocatori = 108 carte');

// --- validaMeld ---
const C = (suit, value, id) => ({ id: id || ('t-' + suit + '-' + value + '-' + Math.random().toString(36).slice(2)), suit, value, jolly: false });
const J = (id) => ({ id: id || ('t-j-' + Math.random().toString(36).slice(2)), suit: null, value: 0, jolly: true });
ok(E.validaMeld([C('cuori', 7), C('quadri', 7), C('picche', 7)]).ok, 'tris valido');
ok(!E.validaMeld([C('cuori', 7), C('quadri', 7)]).ok, 'coppia rifiutata');
ok(E.validaMeld([C('cuori', 3), C('cuori', 4), C('cuori', 5)]).ok, 'scala valida');
ok(E.validaMeld([C('cuori', 1), C('cuori', 2), C('cuori', 3)]).ok, 'asso basso A-2-3 valido');
ok(E.validaMeld([C('cuori', 12), C('cuori', 13), C('cuori', 1)]).ok, 'asso alto Q-K-A valido');
ok(!E.validaMeld([C('cuori', 13), C('cuori', 1), C('cuori', 2)]).ok, 'K-A-2 rifiutato');
ok(E.validaMeld([C('cuori', 3), J(), C('cuori', 5)]).ok, 'jolly riempie il buco');
ok(E.validaMeld([C('cuori', 7), C('quadri', 7), J()]).ok, 'jolly nel tris');
ok(!E.validaMeld([J('a'), J('b'), C('cuori', 7)]).ok, 'due jolly + 1 naturale rifiutati');
ok(!E.validaMeld([C('cuori', 3), C('quadri', 4), C('cuori', 5)]).ok, 'semi misti rifiutati');

// --- apertura ---
{
  const m = new E.Match({ variant: 'due', humans: [0, 1] }, () => 0.5);
  m.state.turn = 0; m.state.fase = 'gioco';
  // mano fissa: tris di K (30) + scala 3-4-5 cuori (12) = 42
  const tris = [C('cuori', 13, 'k1'), C('quadri', 13, 'k2'), C('picche', 13, 'k3')];
  const scala = [C('cuori', 3, 's3'), C('cuori', 4, 's4'), C('cuori', 5, 's5')];
  m.state.hands[0] = tris.concat(scala, [C('fiori', 9, 'x9')]);
  const r = m.cala(0, ['k1', 'k2', 'k3', 's3', 's4', 's5']);
  ok(r.ok && r.apertura && r.punti === 42, 'apertura 42 punti in un colpo (punti=' + (r.punti) + ')');
  ok(m.state.apertoTeam[0] === true, 'squadra aperta');
  // apertura insufficiente
  const m2 = new E.Match({ variant: 'due', humans: [0, 1] }, () => 0.5);
  m2.state.turn = 0; m2.state.fase = 'gioco';
  m2.state.hands[0] = [C('cuori', 3, 'a3'), C('cuori', 4, 'a4'), C('cuori', 5, 'a5'), C('fiori', 9, 'a9')];
  const r2 = m2.cala(0, ['a3', 'a4', 'a5']);
  ok(!r2.ok && /40/.test(r2.error), 'apertura da 12 rifiutata: ' + r2.error);
}

// --- chiusura e penalità ---
{
  const m = new E.Match({ variant: 'due', humans: [0, 1], rounds: 1 }, () => 0.5);
  m.state.turn = 0; m.state.fase = 'gioco'; m.state.apertoTeam = [true, true];
  m.state.melds = [{ team: 0, tipo: 'gruppo', carte: [C('cuori', 7, 'g1'), C('quadri', 7, 'g2'), C('picche', 7, 'g3')], punti: 21 }];
  m.state.hands[0] = [C('cuori', 7, 'h7')]; // lega e resta a zero -> chiusura
  m.state.hands[1] = [C('cuori', 1, 'pen1'), J('penJ')]; // asso(11)+jolly(25)=36
  const r = m.lega(0, 0, ['h7']);
  ok(r.ok && r.chiusa, 'lega finale chiude la mano');
  ok(m.state.finished && m.state.totals[1] === 36, 'penalità avversario 36, totals=' + JSON.stringify(m.state.totals));
  ok(m.state.winners.join() === '0', 'vince chi chiude');
}

// --- export/restore ---
{
  const m = new E.Match({ variant: 'quattro', humans: [0] }, () => 0.5);
  const m2 = E.Match.restore(m.export());
  ok(m2.state.hands.flat().length === 52, 'restore: 52 carte distribuite (4x13)');
  ok(m2.state.tallone.length + m2.state.scarti.length === 56, 'restore: tallone+scarti=56');
}

// --- simulazione completa con bot ---
function simula(variant, seed) {
  const m = new E.Match({ variant, humans: [] }, (() => { let s = seed; return () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648 })());
  let turni = 0;
  while (!m.state.finished && turni < 20000) {
    turni++;
    const g = m.state.turn;
    if (m.state.fase === 'pesca') { m.pescaTallone(g); continue }
    if (m.state.fase !== 'gioco') break;
    const a = AI.suggerisci(m, g);
    if (!a) { m.scarta(g, m.state.hands[g][0].id); continue }
    if (a.tipo === 'cala') { const r = m.cala(g, a.ids); assert.ok(r.ok, 'cala bot: ' + (r.error || '')); }
    else if (a.tipo === 'lega') { const r = m.lega(g, a.idx, a.ids); assert.ok(r.ok, 'lega bot: ' + (r.error || '')); }
    else if (a.tipo === 'scarta') { const r = m.scarta(g, a.id); assert.ok(r.ok, 'scarta bot: ' + (r.error || '')); }
    if (m.state.fineMano && !m.state.finished) m.nextRound();
  }
  return { m, turni };
}
for (const seed of [7, 42]) {
  const { m, turni } = simula('due', seed);
  ok(m.state.finished && m.state.winners.length > 0, 'simulazione 2p seed ' + seed + ' finita in ' + turni + ' turni, totals=' + JSON.stringify(m.state.totals));
}
for (const seed of [7, 42]) {
  const { m, turni } = simula('quattro', seed);
  ok(m.state.finished && m.state.winners.length > 0, 'simulazione 4p seed ' + seed + ' finita in ' + turni + ' turni, totals=' + JSON.stringify(m.state.totals));
}

console.log('\nTUTTI I TEST PASSATI: ' + pass);
