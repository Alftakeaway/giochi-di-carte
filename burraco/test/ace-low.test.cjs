/* Regressione: l'asso deve potersi attaccare sia in ALTO (…Q-K-A) sia in
 * BASSO (A-2-3-…). Prima del fix la posizione in basso non veniva mai
 * tentata, quindi una scala che partiva dal 2 non poteva più accogliere l'asso. */
const E = require('../js/burraco-engine.js');
const a = require('node:assert/strict');
let id = 0;
const c = (v, s = 'cuori', j = false) => new E.Carta('t' + (id++), v, s, j);
const jolly = () => c(0, null, true);
const seq = vals => E.validaCombinazione(vals.map(v => c(v)));
const valori = m => m.slots.map(s => s.valore);

// L'asso si attacca in BASSO a una scala che parte dal 2: 2-3-4 + A -> A-2-3-4
{
  const leg = E.provaLegatura(seq([2, 3, 4]), c(1));
  a.ok(leg, 'A♥ deve attaccarsi a 2-3-4');
  a.deepEqual(valori(leg), [1, 2, 3, 4]);
  a.equal(leg.sostituzione, false, 'è un\'estensione, non una sostituzione');
}

// Anche a una scala più lunga che parte dal 2: 2..Q + A -> A..Q (asso in basso)
{
  const lunghi = Array.from({ length: 11 }, (_, i) => i + 2); // 2..12
  const leg = E.provaLegatura(seq(lunghi), c(1));
  a.ok(leg, 'A♥ deve attaccarsi in basso a 2..Q');
  a.deepEqual(valori(leg), [1, ...lunghi]);
}

// 2..K (2→13): l'asso va preferibilmente in ALTO (comportamento invariato)
{
  const da2aK = Array.from({ length: 12 }, (_, i) => i + 2); // 2..13
  const leg = E.provaLegatura(seq(da2aK), c(1));
  a.ok(leg);
  a.deepEqual(valori(leg), [...da2aK, 14]);
}

// L'asso NON si attacca se manca il 2 (buco non colmabile): 3-4-5 + A
a.equal(E.provaLegatura(seq([3, 4, 5]), c(1)), null, '3-4-5 + A deve essere rifiutata');
// A-2-3 + K resta rifiutata
a.equal(E.provaLegatura(seq([1, 2, 3]), c(13)), null, 'A-2-3 + K non continua la scala');

// Sostituzione: l'asso prende il posto di una matta che rappresentava l'asso
{
  const meld = { tipo: 'sequenza', seme: 'cuori', slots: [
    { carta: jolly(), valore: 1, wild: true },
    { carta: c(2), valore: 2, wild: false },
    { carta: c(3), valore: 3, wild: false }
  ] };
  const leg = E.provaLegatura(meld, c(1));
  a.ok(leg, 'A♥ sostituisce la matta che valeva A');
  a.equal(leg.sostituzione, true, 'qui è davvero una sostituzione');
  a.deepEqual(valori(leg), [1, 2, 3, 4]);
  a.ok(leg.slots.some(s => s.carta.jolly), 'la matta resta calata');
}

// La sostituzione "vera" (matta nel mezzo) resta segnalata
{
  const meld = { tipo: 'sequenza', seme: 'cuori', slots: [
    { carta: c(5), valore: 5, wild: false },
    { carta: jolly(), valore: 6, wild: true },
    { carta: c(7), valore: 7, wild: false }
  ] };
  const leg = E.provaLegatura(meld, c(6));
  a.ok(leg && leg.sostituzione, 'il 6 sostituisce il jolly');
  a.deepEqual(valori(leg), [5, 6, 7, 8]);
}

// L'attacco naturale della pinella all'estremità NON è una sostituzione
a.equal(E.provaLegatura(seq([3, 4, 5]), c(2)).sostituzione, false, 'pinella in basso = estensione');

console.log('PASS: asso in basso (2-3-4 + A -> A-2-3-4), asso in alto invariato, casi non validi rifiutati, sostituzione segnalata correttamente');
