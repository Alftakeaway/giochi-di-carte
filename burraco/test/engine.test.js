/* =========================================================================
 * test/engine.test.js — Test del motore Burraco
 * Esecuzione:  node test/engine.test.js
 * ========================================================================= */
'use strict';

const E = require('../js/burraco-engine.js');

let passati = 0;
let falliti = 0;
const errori = [];

function ok(cond, nome, extra) {
  if (cond) { passati++; }
  else { falliti++; errori.push(nome + (extra ? '  -> ' + extra : '')); }
}
function eq(a, b, nome) {
  ok(a === b, nome, 'atteso ' + JSON.stringify(b) + ', ottenuto ' + JSON.stringify(a));
}
function sezione(t) { console.log('\n=== ' + t + ' ==='); }

/* ------------------------- helper carte ------------------------- */
let contatoreId = 0;
function C(valore, seme, jolly) {
  return new E.Carta('t' + (contatoreId++), jolly ? 0 : valore, jolly ? null : seme, !!jolly);
}
const JOLLY = () => C(0, null, true);
const PIN = (seme) => C(2, seme);
const A = (s) => C(1, s), K = (s) => C(13, s), Q = (s) => C(12, s), J = (s) => C(11, s);
const N = (n, s) => C(n, s);

/* =====================================================================
 * 1. MAZZO
 * ===================================================================== */
sezione('Mazzo');
{
  const m = E.creaMazzo();
  eq(m.length, 108, 'il mazzo ha 108 carte');
  eq(m.filter(E.isJolly).length, 4, '4 jolly');
  eq(m.filter(E.isPinella).length, 8, '8 pinelle (i quattro 2 in doppia copia)');
  eq(m.filter(c => c.valore === 1).length, 8, '8 assi');
  eq(m.filter(c => c.valore === 13).length, 8, '8 re');
  eq(new Set(m.map(c => c.id)).size, 108, 'gli id sono unici');
  eq(m.reduce((a, c) => a + c.punti, 0), 1080, 'somma punti del mazzo = 1080');
}

/* =====================================================================
 * 2. VALORI DELLE CARTE
 * ===================================================================== */
sezione('Valori delle carte');
{
  eq(E.puntiCarta(JOLLY()), 30, 'jolly = 30');
  eq(E.puntiCarta(PIN('cuori')), 20, 'pinella (2) = 20');
  eq(E.puntiCarta(A('cuori')), 15, 'asso = 15');
  eq(E.puntiCarta(K('cuori')), 10, 're = 10');
  eq(E.puntiCarta(N(10, 'cuori')), 10, 'dieci = 10');
  eq(E.puntiCarta(N(9, 'cuori')), 10, 'nove = 10');
  eq(E.puntiCarta(N(8, 'cuori')), 10, 'otto = 10');
  eq(E.puntiCarta(N(7, 'cuori')), 5, 'sette = 5');
  eq(E.puntiCarta(N(3, 'cuori')), 5, 'tre = 5');
  eq(E.etichettaCarta(K('picche')), 'K\u2660', 'etichetta re di picche');
}

/* =====================================================================
 * 3. GRUPPI
 * ===================================================================== */
sezione('Gruppi');
{
  let r = E.validaCombinazione([N(7, 'cuori'), N(7, 'quadri'), N(7, 'picche')]);
  ok(r && r.tipo === 'gruppo', 'tre sette di semi diversi = gruppo');
  eq(r.punti, 15, 'gruppo di sette vale 15');
  eq(r.burraco, false, 'gruppo di 3 non è burraco');

  r = E.validaCombinazione([N(7, 'cuori'), N(7, 'cuori'), N(7, 'picche')]);
  ok(r && r.tipo === 'gruppo', 'due carte dello stesso seme ammesse (doppio mazzo)');

  r = E.validaCombinazione([N(7, 'cuori'), N(7, 'cuori'), N(7, 'cuori')]);
  ok(r === null, 'tre carte identiche (stesso seme e valore) in un gruppo: rifiutato');

  r = E.validaCombinazione([N(9, 'cuori'), N(9, 'quadri'), JOLLY()]);
  ok(r && r.tipo === 'gruppo' && r.matte === 1, 'gruppo con 1 jolly valido');

  r = E.validaCombinazione([N(9, 'cuori'), N(9, 'quadri'), JOLLY(), PIN('fiori')]);
  ok(r === null, 'gruppo con 2 matte rifiutato');

  r = E.validaCombinazione([N(9, 'cuori'), JOLLY(), PIN('fiori')]);
  ok(r === null, 'gruppo con una sola carta naturale rifiutato');

  r = E.validaCombinazione([PIN('cuori'), PIN('quadri'), PIN('picche')]);
  ok(r === null, 'gruppo di soli 2 (pinelle) rifiutato');

  r = E.validaCombinazione([N(9, 'cuori'), N(9, 'quadri')]);
  ok(r === null, 'due carte non formano una combinazione');

  // burraco pulito: 7 carte dello stesso valore
  const sette = [N(9, 'cuori'), N(9, 'quadri'), N(9, 'picche'), N(9, 'fiori'),
                 N(9, 'cuori'), N(9, 'quadri'), N(9, 'picche')];
  r = E.validaCombinazione(sette);
  ok(r && r.burraco && r.pulito, 'gruppo di 7 = burraco pulito');
  eq(r.punti, 70, 'burraco di nove vale 70');
}

/* =====================================================================
 * 4. SEQUENZE
 * ===================================================================== */
sezione('Sequenze');
{
  let r = E.validaCombinazione([N(5, 'cuori'), N(6, 'cuori'), N(7, 'cuori')]);
  ok(r && r.tipo === 'sequenza' && r.seme === 'cuori', '5-6-7 di cuori = sequenza');
  eq(r.punti, 15, '5+6+7 = 15 punti');

  r = E.validaCombinazione([N(5, 'cuori'), N(6, 'cuori'), N(8, 'cuori')]);
  ok(r === null, 'buco non colmato: rifiutata');

  r = E.validaCombinazione([N(5, 'cuori'), N(6, 'cuori'), N(7, 'quadri')]);
  ok(r === null, 'semi diversi: rifiutata');

  r = E.validaCombinazione([N(5, 'cuori'), N(6, 'cuori'), JOLLY()]);
  ok(r && r.tipo === 'sequenza' && r.matte === 1, 'jolly prolunga la sequenza');
  eq(r.lunghezza, 3, '5-6 + jolly = 3 carte');

  r = E.validaCombinazione([N(5, 'cuori'), N(7, 'cuori'), JOLLY()]);
  ok(r && r.slots[1].wild, 'il jolly colma il buco interno (6)');
  eq(r.slots[1].valore, 6, 'il jolly copre il 6');

  r = E.validaCombinazione([N(5, 'cuori'), N(8, 'cuori'), JOLLY()]);
  ok(r === null, 'un solo jolly non basta per due buchi');

  r = E.validaCombinazione([N(12, 'cuori'), N(13, 'cuori'), JOLLY()]);
  ok(r && r.tipo === 'sequenza' && r.slots[0].valore === 11 && r.slots[0].wild,
    'il jolly non può superare il K: si colloca sotto (J-Q-K)');

  r = E.validaCombinazione([A('picche'), N(2, 'picche'), N(3, 'picche')]);
  ok(r && r.tipo === 'sequenza' && r.matte === 0, 'A-2-3 con il 2 naturale = pulita');

  r = E.validaCombinazione([A('picche'), N(2, 'picche'), N(3, 'picche'), N(4, 'picche'),
                            N(5, 'picche'), N(6, 'picche'), N(7, 'picche')]);
  ok(r && r.burraco && r.pulito, 'A-2-3-4-5-6-7 = burraco pulito con il 2 naturale');
  eq(r.punti, 15 + 20 + 5 * 5, 'punteggio A+2+5+5+5+5+5 = 60');

  r = E.validaCombinazione([N(3, 'picche'), N(4, 'picche'), N(5, 'picche'), N(6, 'picche'),
                            N(7, 'picche'), N(8, 'picche'), JOLLY()]);
  ok(r && r.burraco && r.sporco && !r.pulito, 'sequenza di 7 con jolly = burraco sporco');

  // due matte solo con la pinella naturale del seme
  r = E.validaCombinazione([N(2, 'cuori'), N(3, 'cuori'), N(4, 'cuori'), JOLLY(), PIN('picche')]);
  ok(r && r.matte === 2, 'eccezione: con il 2 naturale del seme sono ammesse 2 matte');

  r = E.validaCombinazione([N(5, 'cuori'), N(6, 'cuori'), N(7, 'cuori'), JOLLY(), PIN('picche')]);
  ok(r === null, 'senza il 2 naturale resta il limite di 1 matta');

  r = E.validaCombinazione([JOLLY(), PIN('picche'), PIN('fiori')]);
  ok(r === null, 'solo matte: rifiutata');

  r = E.validaCombinazione([N(13, 'cuori'), N(12, 'cuori'), N(11, 'cuori'), N(10, 'cuori'),
                            N(9, 'cuori'), N(8, 'cuori'), N(7, 'cuori')]);
  ok(r && r.pulito, '7-K di cuori in ordine sparso = burraco pulito');
}

/* =====================================================================
 * 5. LEGATURA E SOSTITUZIONE
 * ===================================================================== */
sezione('Legatura e sostituzione');
{
  const meld = {
    tipo: 'sequenza', seme: 'cuori',
    slots: [
      { carta: N(5, 'cuori'), valore: 5, wild: false },
      { carta: N(6, 'cuori'), valore: 6, wild: false },
      { carta: N(7, 'cuori'), valore: 7, wild: false }
    ]
  };
  ok(E.provaLegatura(meld, N(8, 'cuori')), 'l\'8 di cuori si lega in alto');
  ok(E.provaLegatura(meld, N(4, 'cuori')), 'il 4 di cuori si lega in basso');
  ok(!E.provaLegatura(meld, N(9, 'cuori')), 'il 9 non si lega');
  ok(!E.provaLegatura(meld, N(8, 'quadri')), 'carta di altro seme non si lega');
  ok(E.provaLegatura(meld, JOLLY()), 'il jolly si lega come matta');
  const dopoJolly = E.provaLegatura(meld, JOLLY()).slots;
  ok(!E.provaLegatura({ tipo: 'sequenza', seme: 'cuori', slots: dopoJolly }, PIN('picche')),
    'seconda matta rifiutata su sequenza senza 2 naturale');

  const meldConMatta = {
    tipo: 'sequenza', seme: 'cuori',
    slots: [
      { carta: N(5, 'cuori'), valore: 5, wild: false },
      { carta: JOLLY(), valore: 6, wild: true },
      { carta: N(7, 'cuori'), valore: 7, wild: false }
    ]
  };
  const sost = E.provaLegatura(meldConMatta, N(6, 'cuori'));
  ok(sost && sost.sostituzione, 'il 6 di cuori sostituisce il jolly');
  eq(sost.slots.length, 4, 'dopo la sostituzione la sequenza ha 4 carte');
  eq(sost.slots.filter(s => s.wild).length, 1, 'la matta resta calata');
  ok(sost.slots.some(s => s.carta.jolly), 'il jolly è ancora nella sequenza');

  const gruppo = {
    tipo: 'gruppo', seme: null,
    slots: [
      { carta: N(9, 'cuori'), valore: 9, wild: false },
      { carta: N(9, 'quadri'), valore: 9, wild: false },
      { carta: N(9, 'picche'), valore: 9, wild: false }
    ]
  };
  ok(E.provaLegatura(gruppo, N(9, 'fiori')), 'quarto nove nel gruppo');
  ok(E.provaLegatura(gruppo, PIN('fiori')), 'pinella come matta nel gruppo');
  const gruppoConMatta = E.provaLegatura(gruppo, PIN('fiori')).slots;
  ok(!E.provaLegatura({ tipo: 'gruppo', seme: null, slots: gruppoConMatta }, JOLLY()),
    'seconda matta rifiutata nel gruppo');
  ok(!E.provaLegatura(gruppo, N(8, 'fiori')), 'carta di valore diverso rifiutata');
}

/* =====================================================================
 * 6. DISTRIBUZIONE
 * ===================================================================== */
sezione('Distribuzione');
{
  const p = new E.Partita({ seed: 42 });
  const s = p.stato;
  eq(s.mani[0].length, 11, 'giocatore 0 ha 11 carte');
  eq(s.mani[1].length, 11, 'giocatore 1 ha 11 carte');
  eq(s.pozzetti[0].length, 11, 'pozzetto 0 da 11 carte');
  eq(s.pozzetti[1].length, 11, 'pozzetto 1 da 11 carte');
  eq(s.monte.length, 1, 'una carta scoperta sul monte');
  eq(s.tallone.length, 63, 'il tallone ha 63 carte');
  eq(s.turno, 0, 'inizia chi non è mazziere (mazziere = 1)');
  const tot = s.mani[0].length + s.mani[1].length + s.pozzetti[0].length +
    s.pozzetti[1].length + s.monte.length + s.tallone.length;
  eq(tot, 108, 'le 108 carte sono tutte in gioco');
}

/* =====================================================================
 * 7. FLUSSO DI UN TURNO
 * ===================================================================== */
sezione('Flusso di un turno');
{
  const p = new E.Partita({ seed: 7 });
  const s = p.stato;
  const g = s.turno;
  ok(!p.cala(s.mani[g].slice(0, 3).map(c => c.id)).ok, 'non si può calare prima di pescare');
  ok(!p.scarta(s.mani[g][0].id).ok, 'non si può scartare prima di pescare');

  const r1 = p.pescaTallone();
  ok(r1.ok, 'pesca dal tallone');
  eq(s.mani[g].length, 12, 'dopo la pesca il giocatore ha 12 carte');
  eq(s.fase, 'gioco', 'fase di gioco');
  ok(!p.pescaTallone().ok, 'non si può pescare due volte');
  ok(!p.prendiMonte().ok, 'non si può prendere il monte dopo aver pescato');

  const r2 = p.scarta(s.mani[g][0].id);
  ok(r2.ok, 'scarto valido');
  eq(s.turno, 1 - g, 'passa il turno');
  eq(s.fase, 'pesca', 'si torna alla fase di pesca');
  eq(s.monte.length, 2, 'il monte ora ha 2 carte');
}

/* =====================================================================
 * 8. MONTE
 * ===================================================================== */
sezione('Monte');
{
  const p = new E.Partita({ seed: 11 });
  const s = p.stato;
  const g = s.turno;
  const cartaIniziale = s.monte[0];
  const r = p.prendiMonte();
  ok(r.ok, 'si può prendere il monte');
  eq(s.monte.length, 0, 'il monte resta vuoto');
  eq(s.mani[g].length, 12, 'il giocatore ha preso la carta del monte');
  eq(s.monteBloccato, cartaIniziale.id, 'la carta del monte di una sola carta è bloccata');
  ok(!p.scarta(cartaIniziale.id).ok, 'non si può riscartare subito la carta presa dal monte');
  const altra = s.mani[g].find(c => c.id !== cartaIniziale.id);
  ok(p.scarta(altra.id).ok, 'si scarta un\'altra carta');
  eq(s.monte.length, 1, 'il monte contiene la carta scartata');
  eq(s.monte[0].id, altra.id, 'la nuova carta è sul monte');
}

/* =====================================================================
 * 9. POZZETTO
 * ===================================================================== */
sezione('Pozzetto');
{
  const p = new E.Partita({ seed: 3 });
  const s = p.stato;
  const g = s.turno;
  const c5 = N(5, 'cuori');
  const c6 = N(6, 'quadri');
  s.mani[g] = [c5];
  p.pescaTallone();
  s.mani[g] = [c5, c6];
  s.fase = 'gioco';
  const r = p.scarta(c6.id);
  ok(r.ok, 'scarto valido');
  eq(s.mani[g].length, 1, 'resta una carta');
  s.fase = 'gioco';   // il turno è già passato: rimetto in fase di gioco per il test
  s.turno = g;
  const r2 = p.scarta(c5.id);
  ok(r2.ok && r2.pozzetto, 'svuotando la mano si prende il pozzetto');
  eq(s.pozzettoPreso[g], true, 'pozzetto segnato come preso');
  eq(s.mani[g].length, 11, 'la mano contiene le 11 carte del pozzetto');
  eq(s.pozzetti[g].length, 0, 'il pozzetto è vuoto');
  ok(!s.pozzettoPreso[1 - g], 'l\'altro giocatore non ha preso il pozzetto');
}

/* =====================================================================
 * 10. CHIUSURA
 * ===================================================================== */
sezione('Chiusura');
{
  const p = new E.Partita({ seed: 5 });
  const s = p.stato;
  const g = s.turno;
  // preparo: pozzetto preso, burraco calato, una sola carta in mano
  s.pozzettoPreso[g] = true;
  s.pozzetti[g] = [];
  const carteBurraco = [N(9, 'cuori'), N(9, 'quadri'), N(9, 'picche'), N(9, 'fiori'),
                        N(9, 'cuori'), N(9, 'quadri'), N(9, 'picche')];
  s.melds[g].push({
    id: 'mX', tipo: 'gruppo', seme: null,
    slots: carteBurraco.map(c => ({ carta: c, valore: 9, wild: false })),
    punti: 70, burraco: true, pulito: true, sporco: false, matte: 0, lunghezza: 7
  });
  ok(p.puoChiudere(g), 'con burraco e pozzetto si può chiudere');

  const j = JOLLY();
  s.mani[g] = [j];
  s.fase = 'gioco';
  const rMatta = p.scarta(j.id);
  ok(!rMatta.ok, 'non si chiude scartando una matta');

  const c4 = N(4, 'fiori');
  s.mani[g] = [c4];
  s.fase = 'gioco';
  const rOk = p.scarta(c4.id);
  ok(rOk.ok && rOk.chiusura, 'chiusura con l\'ultima carta naturale');
  eq(s.finita, true, 'smazzata finita');
  eq(s.chiusaDa, g, 'chiusa dal giocatore di turno');
  const d0 = s.punteggiUltima.dettaglio[g];
  eq(d0.chiusura, 100, 'bonus chiusura 100');
  ok(s.punteggiUltima.punti[g] >= 70 + 100, 'il punteggio include le carte calate e il bonus');
}

/* =====================================================================
 * 11. PUNTEGGI E PENALITÀ
 * ===================================================================== */
sezione('Punteggi e penalità');
{
  const p = new E.Partita({ seed: 9 });
  const s = p.stato;
  const g = s.turno;
  const avv = 1 - g;
  s.pozzettoPreso[g] = true;
  s.pozzetti[g] = [];
  const carteBurraco = [N(9, 'cuori'), N(9, 'quadri'), N(9, 'picche'), N(9, 'fiori'),
                        N(9, 'cuori'), N(9, 'quadri'), N(9, 'picche')];
  s.melds[g].push({
    id: 'mX', tipo: 'gruppo', seme: null,
    slots: carteBurraco.map(c => ({ carta: c, valore: 9, wild: false })),
    punti: 70, burraco: true, pulito: true, sporco: false, matte: 0, lunghezza: 7
  });
  s.mani[avv] = [N(13, 'cuori'), JOLLY()];   // 10 + 30 = 40 punti in mano
  const c4 = N(4, 'fiori');
  s.mani[g] = [c4];
  s.fase = 'gioco';
  p.scarta(c4.id);

  eq(s.punteggiUltima.punti[g], 70 + 200 + 100, 'chiusura: 70 carte + 200 burraco pulito + 100 chiusura');
  eq(s.punteggiUltima.punti[avv], -(40 + 100), 'avversario: -40 carte in mano -100 pozzetto non preso');
}

/* =====================================================================
 * 12. FINE SENZA CHIUSURA
 * ===================================================================== */
sezione('Fine senza chiusura');
{
  const p = new E.Partita({ seed: 13 });
  const s = p.stato;
  s.tallone = s.tallone.slice(0, 3);
  s.pozzettoPreso = [true, true];
  s.pozzetti = [[], []];
  p.pescaTallone();
  const r = p.scarta(s.mani[0][0].id);
  ok(r.ok, 'scarto valido');
  eq(s.finita, true, 'la smazzata finisce quando restano 2 carte nel tallone');
  eq(s.chiusaDa, null, 'nessuna chiusura');
  eq(s.punteggiUltima.senzaChiusura, true, 'segnata come senza chiusura');
}

/* =====================================================================
 * 13. SMazzata annullata
 * ===================================================================== */
sezione('Smazzata annullata');
{
  const p = new E.Partita({ seed: 17 });
  const s = p.stato;
  s.tallone = s.tallone.slice(0, 3);
  p.pescaTallone();
  p.scarta(s.mani[0][0].id);
  eq(s.punteggiUltima.annullata, true, 'se nessuno ha preso il pozzetto la smazzata si ripete');
  eq(s.totali[0], 0, 'nessun punto assegnato');
}

/* =====================================================================
 * 14. PARTITA COMPLETA CONTRO UN GIOCATORE CASUALE
 * ===================================================================== */
sezione('Partite simulate');
{
  function sceltaCasuale(arr, rng) { return arr[Math.floor(rng() * arr.length)]; }

  function giocaCasuale(p, rng) {
    const s = p.stato;
    let guardia = 0;
    while (!s.finita && guardia++ < 4000) {
      const g = s.turno;
      if (s.fase === 'pesca') {
        if (s.monte.length && rng() < 0.35) p.prendiMonte();
        else p.pescaTallone();
        continue;
      }
      // prova a calare
      let mosso = false;
      if (rng() < 0.5) {
        const cand = E.suggerisciCombinazioni(s.mani[g], 6);
        if (cand.length) {
          const scelta = sceltaCasuale(cand, rng);
          if (p.cala(scelta.ids).ok) { mosso = true; }
        }
      }
      if (!mosso && rng() < 0.5) {
        for (let i = 0; i < s.melds[g].length && !mosso; i++) {
          const c = sceltaCasuale(s.mani[g], rng);
          if (p.lega(i, c.id).ok) mosso = true;
        }
      }
      // scarta
      const scartabili = s.mani[g].filter(c => !p.scartoVietato(g, c.id));
      if (!scartabili.length) {
        // situazione bloccante: pesca se possibile, altrimenti termina
        break;
      }
      p.scarta(sceltaCasuale(scartabili, rng).id);
    }
  }

  const rng = E.creaRng(2024);
  let partite = 0, smazzate = 0, annullate = 0, chiusure = 0, maxTurni = 0;
  let errore = null;
  try {
    for (let i = 0; i < 400; i++) {
      const p = new E.Partita({ seed: 1000 + i, target: 2005 });
      partite++;
      let giri = 0;
      while (giri++ < 200) {
        giocaCasuale(p, rng);
        if (!p.stato.finita) break;
        smazzate++;
        if (p.stato.punteggiUltima.annullata) annullate++;
        if (p.stato.chiusaDa !== null) chiusure++;
        const carte = p.stato.mani[0].length + p.stato.mani[1].length +
          p.stato.pozzetti[0].length + p.stato.pozzetti[1].length +
          p.stato.monte.length + p.stato.tallone.length +
          p.stato.melds[0].reduce((a, m) => a + m.slots.length, 0) +
          p.stato.melds[1].reduce((a, m) => a + m.slots.length, 0);
        if (carte !== 108) throw new Error('carte non conservate: ' + carte);
        if (p.stato.vincitore !== null) break;
        p.smazzataSuccessiva();
      }
      maxTurni = Math.max(maxTurni, giri);
    }
  } catch (e) { errore = e; }

  ok(!errore, 'nessuna eccezione durante le partite simulate', errore && errore.stack);
  ok(smazzate > 300, 'sono state giocate molte smazzate (' + smazzate + ')');
  console.log('    partite: ' + partite + ', smazzate: ' + smazzate +
    ', chiusure: ' + chiusure + ', annullate: ' + annullate);

  // invarianti di punteggio
  const p2 = new E.Partita({ seed: 77 });
  p2.stato.tallone = p2.stato.tallone.slice(0, 3);
  p2.pescaTallone();
  p2.scarta(p2.stato.mani[0][0].id);
  const sommaPunti = p2.stato.punteggiUltima.punti[0] + p2.stato.punteggiUltima.punti[1];
  ok(Number.isFinite(sommaPunti), 'i punteggi sono numeri finiti');
}

/* =====================================================================
 * 15. RNG DETERMINISTICO
 * ===================================================================== */
sezione('Riproducibilità');
{
  const a = new E.Partita({ seed: 123 });
  const b = new E.Partita({ seed: 123 });
  const idA = a.stato.mani[0].map(c => c.id).join(',');
  const idB = b.stato.mani[0].map(c => c.id).join(',');
  eq(idA, idB, 'con lo stesso seed la distribuzione è identica');
  const c = new E.Partita({ seed: 124 });
  ok(c.stato.mani[0].map(x => x.id).join(',') !== idA, 'con seed diverso la distribuzione cambia');
}

/* =====================================================================
 * 16. BURRACO PULITO / SEMIPULITO / SPORCO
 * ===================================================================== */
sezione('Tipi di burraco');
{
  const seq = (seme, da, a, matta) => {
    const out = [];
    for (let v = da; v <= a; v++) out.push({ carta: N(v, seme), valore: v, wild: false });
    if (matta) out.push({ carta: matta, valore: a + 1, wild: true });
    return out;
  };

  const pulito = seq('cuori', 5, 11);
  const c1 = E.classificaBurraco(pulito);
  eq(c1.burraco, true, '7 carte sono un burraco');
  eq(c1.pulito, true, 'senza matte è pulito');
  eq(c1.semipulito, false, 'un burraco pulito non è semipulito');

  const conPinella = pulito.slice(0, 6).concat([{ carta: PIN('quadri'), valore: 11, wild: true }]);
  const c2 = E.classificaBurraco(conPinella);
  eq(c2.semipulito, true, 'con una pinella (e nessun jolly) è semipulito');
  eq(c2.pulito, false, 'il semipulito non è pulito');
  eq(c2.sporco, false, 'il semipulito non è sporco');

  const conJolly = pulito.slice(0, 6).concat([{ carta: JOLLY(), valore: 11, wild: true }]);
  const c3 = E.classificaBurraco(conJolly);
  eq(c3.sporco, true, 'con un jolly è sporco');
  eq(c3.semipulito, false, 'con un jolly non è semipulito');

  const misto = pulito.slice(0, 5).concat([
    { carta: PIN('picche'), valore: 10, wild: true },
    { carta: JOLLY(), valore: 11, wild: true }
  ]);
  eq(E.classificaBurraco(misto).sporco, true, 'pinella + jolly resta sporco');

  eq(E.classificaBurraco(pulito.slice(0, 6)).burraco, false, '6 carte non sono un burraco');

  /* la pinella naturale non sporca il burraco */
  const conPinellaNaturale = [];
  for (let v = 2; v <= 8; v++) {
    conPinellaNaturale.push({ carta: N(v, 'fiori'), valore: v, wild: false });
  }
  const c4 = E.classificaBurraco(conPinellaNaturale);
  eq(c4.pulito, true, 'la pinella naturale al suo posto non rende sporco il burraco');

  /* bonus */
  eq(E.bonusBurraco({ burraco: true, pulito: true }), 200, 'bonus burraco pulito 200');
  eq(E.bonusBurraco({ burraco: true, semipulito: true }), 150, 'bonus burraco semipulito 150');
  eq(E.bonusBurraco({ burraco: true, sporco: true }), 100, 'bonus burraco sporco 100');
  eq(E.bonusBurraco({ burraco: false }), 0, 'nessun bonus senza burraco');
  eq(E.nomeBurraco({ burraco: true, semipulito: true }), 'semipulito', 'nome del burraco semipulito');
}

/* =====================================================================
 * 17. SPOSTAMENTO DI UNA CARTA FRA DUE COMBINAZIONI
 * ===================================================================== */
sezione('Spostamento fra combinazioni');
{
  const mk = (id, v, s) => new E.Carta(id, v, s, false);
  const crea = function (melds, mano) {
    const p = new E.Partita({ seed: 5 });
    const s = p.stato;
    s.turno = 0;
    s.fase = 'gioco';
    s.mani[0] = mano || [mk('h1', 5, 'cuori')];
    s.melds[0] = melds;
    return p;
  };
  const gruppo = (valore, carte) => ({
    id: 'g' + valore, tipo: 'gruppo', seme: null,
    slots: carte.map(c => ({ carta: c, valore: valore, wild: false })),
    punti: 0, burraco: false, lunghezza: carte.length, matte: 0
  });
  const scala = (seme, da, a, id) => {
    const slots = [];
    for (let v = da; v <= a; v++) slots.push({ carta: mk(id + v, v, seme), valore: v, wild: false });
    const burraco = slots.length >= 7;
    return {
      id: id, tipo: 'sequenza', seme: seme, slots: slots, punti: 0,
      burraco: burraco, pulito: burraco, semipulito: false, sporco: false,
      lunghezza: slots.length, matte: 0
    };
  };

  /* gruppo di 4 + scala: la carta esce dal gruppo ed entra nella scala */
  {
    const p = crea([
      gruppo(7, [mk('a', 7, 'fiori'), mk('b', 7, 'quadri'), mk('c', 7, 'picche'), mk('d', 7, 'cuori')]),
      scala('fiori', 8, 10, 's')
    ]);
    const r = p.sposta(0, 'a', 1);
    eq(r.ok, true, 'sposto il 7 di fiori dal gruppo alla scala');
    eq(p.stato.melds[0][0].slots.length, 3, 'il gruppo resta con 3 carte');
    eq(p.stato.melds[0][1].slots.length, 4, 'la scala passa a 4 carte');
    eq(p.stato.melds[0][1].slots[0].valore, 7, 'il 7 finisce in testa alla scala');
    eq(p.stato.melds[0][1].punti, 5 + 10 + 10 + 10, 'i punti della scala sono ricalcolati');
  }

  /* gruppo di 3: lo spostamento lascerebbe 2 carte -> vietato */
  {
    const p = crea([
      gruppo(7, [mk('a', 7, 'fiori'), mk('b', 7, 'quadri'), mk('c', 7, 'picche')]),
      scala('fiori', 8, 10, 's')
    ]);
    const r = p.sposta(0, 'a', 1);
    eq(r.ok, false, 'non si può svuotare una combinazione sotto le 3 carte');
    ok(/meno di 3/.test(r.motivo), 'il motivo spiega il limite delle 3 carte', r.motivo);
    eq(p.stato.melds[0][0].slots.length, 3, 'la combinazione di partenza resta intatta');
  }

  /* sequenza: togliere una carta interna romperebbe la scala */
  {
    const p = crea([scala('cuori', 5, 9, 's'), scala('picche', 5, 7, 't')]);
    const r = p.sposta(0, 's7', 1);
    eq(r.ok, false, 'non si può togliere una carta dal mezzo di una scala');
    ok(/non sarebbe più valida/.test(r.motivo), 'il motivo parla di combinazione non più valida', r.motivo);
  }

  /* la carta deve poter entrare nella destinazione */
  {
    const p = crea([
      gruppo(7, [mk('a', 7, 'fiori'), mk('b', 7, 'quadri'), mk('c', 7, 'picche'), mk('d', 7, 'cuori')]),
      scala('fiori', 8, 10, 's')
    ]);
    const r = p.sposta(0, 'b', 1);
    eq(r.ok, false, 'il 7 di quadri non entra in una scala di fiori');
    ok(/non può entrare/.test(r.motivo), 'il motivo spiega che la carta non entra', r.motivo);
  }

  /* un burraco non si scompone */
  {
    const lunga = scala('cuori', 3, 9, 'b');
    const p = crea([lunga, scala('picche', 5, 7, 't')]);
    const r = p.sposta(0, 'b9', 1);
    eq(r.ok, false, 'un burraco non si può scomporre');
    ok(/burraco/.test(r.motivo), 'il motivo nomina il burraco', r.motivo);
  }

  /* indice inesistente e stessa combinazione */
  {
    const p = crea([gruppo(7, [mk('a', 7, 'fiori'), mk('b', 7, 'quadri'), mk('c', 7, 'picche'), mk('d', 7, 'cuori')]),
      scala('fiori', 8, 10, 's')]);
    eq(p.sposta(0, 'inesistente', 1).ok, false, 'carta inesistente: rifiutata');
    eq(p.sposta(1, 's8', 1).ok, false, 'stessa combinazione: rifiutata');
    eq(p.sposta(0, 'a', 9).ok, false, 'combinazione di destinazione inesistente: rifiutata');
  }

  /* dopo lo spostamento le carte totali non cambiano */
  {
    const p = crea([
      gruppo(7, [mk('a', 7, 'fiori'), mk('b', 7, 'quadri'), mk('c', 7, 'picche'), mk('d', 7, 'cuori')]),
      scala('fiori', 8, 10, 's')
    ]);
    const prima = p.stato.melds[0].reduce((n, m) => n + m.slots.length, 0);
    p.sposta(0, 'a', 1);
    const dopo = p.stato.melds[0].reduce((n, m) => n + m.slots.length, 0);
    eq(prima, dopo, 'nessuna carta sparisce durante lo spostamento');
  }
}

/* =====================================================================
 * RISULTATO
 * ===================================================================== */
console.log('\n' + '='.repeat(56));
console.log('TEST PASSATI: ' + passati + '   FALLITI: ' + falliti);
if (errori.length) {
  console.log('\nFALLIMENTI:');
  errori.forEach(e => console.log('  ✗ ' + e));
}
console.log('='.repeat(56));
process.exit(falliti ? 1 : 0);
