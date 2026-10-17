/* =========================================================================
 * quattro.test.js — la modalità a quattro giocatori (a squadre)
 *
 * Controlla il motore: distribuzione, turno in cerchio, pozzetto di squadra,
 * punteggio a squadre. Poi una partita completa giocata dai bot (nessuno
 * deve inchiodarsi: la smazzata deve arrivare in fondo).
 * ========================================================================= */
'use strict';

const E = require('../js/burraco-engine.js');
const AI = require('../js/burraco-ai.js');

let passati = 0, falliti = 0;
function sezione(n) { console.log('\n== ' + n + ' =='); }
function ok(nome, cond, extra) {
  if (cond) { passati++; console.log('  ok   ' + nome); }
  else { falliti++; console.log('  FAIL ' + nome + (extra !== undefined ? ' -> ' + JSON.stringify(extra) : '')); }
}
function eq(a, b, nome) { ok(nome + ' (' + JSON.stringify(a) + ')', a === b, { atteso: b, ottenuto: a }); }

/* scala di cuori 3-9: sette carte, un burraco pulito */
function scalaCuori() {
  return [3, 4, 5, 6, 7, 8, 9].map(function (v) {
    return { carta: new E.Carta('c' + v, v, 'cuori', false), valore: v, wild: false };
  });
}

/* =====================================================================
 * 1. STRUTTURA: 4 giocatori, 2 squadre
 * ===================================================================== */
sezione('Struttura a quattro');
{
  const p = new E.Partita({ giocatori: 4, seed: 5 });
  const s = p.stato;
  eq(p.nGioc, 4, 'quattro giocatori');
  ok('le squadre sono 0+2 contro 1+3', p.squadre.join(',') === '0,1,0,1', p.squadre);
  eq(s.mani.length, 4, 'quattro mani');
  eq(s.melds.length, 4, 'quattro elenchi di combinazioni');
  eq(s.totali.length, 4, 'quattro totali');
  eq(s.pozzetti.length, 2, 'due pozzetti (uno per squadra)');
  eq(s.pozzettoPreso.length, 2, 'stato del pozzetto per squadra');
  s.mani.forEach(function (m, g) { eq(m.length, 11, 'mano ' + g + ' ha 11 carte'); });
  s.pozzetti.forEach(function (z, t) { eq(z.length, 11, 'pozzetto squadra ' + t + ' ha 11 carte'); });
  ok('il monte ha una carta scoperta', s.monte.length === 1, s.monte.length);
  /* 108 = 4x11 mani + 2x11 pozzetti + 1 monte + tallone */
  eq(s.tallone.length, 41, 'tallone di 41 carte');
  const ids = [].concat(s.mani[0], s.mani[1], s.mani[2], s.mani[3],
    s.pozzetti[0], s.pozzetti[1], s.monte);
  eq(new Set(ids.map(c => c.id)).size, ids.length, 'nessuna carta duplicata');
}

/* =====================================================================
 * 2. TURNO IN CERCHIO E MAZZIERE
 * ===================================================================== */
sezione('Turno in cerchio');
{
  const p = new E.Partita({ giocatori: 4, seed: 9 });
  const s = p.stato;
  eq(s.mazziere, 1, 'il mazziere della prima smazzata è il giocatore 1');
  eq(s.turno, 2, 'inizia chi segue il mazziere');

  /* fa finire il turno a tutti e conta il giro */
  const visti = [];
  s.turniSmazzata = 0;
  for (let i = 0; i < 8; i++) {
    visti.push(s.turno);
    s.mani[s.turno].push(new E.Carta('x' + i, 5, 'cuori', false));
    s.fase = 'gioco';
    p.scarta(s.mani[s.turno][s.mani[s.turno].length - 1].id);
  }
  ok('il turno gira in cerchio 2-3-0-1', visti.join(',') === '2,3,0,1,2,3,0,1', visti);

  /* il mazziere avanza di uno a smazzata */
  const prima = p.stato.mazziere;
  p.stato.finita = true;
  p.stato.vincitore = null;
  p.smazzataSuccessiva();
  eq(p.stato.mazziere, (prima + 1) % 4, 'il mazziere avanza in cerchio');
  eq(p.stato.turno, (prima + 2) % 4, 'inizia chi segue il nuovo mazziere');
}

/* =====================================================================
 * 3. POZZETTO DI SQUADRA
 * ===================================================================== */
sezione('Pozzetto di squadra');
{
  const p = new E.Partita({ giocatori: 4, seed: 11 });
  const s = p.stato;
  ok('nessuno può chiudere all\'inizio', !p.puoChiudere(0) && !p.puoChiudere(2));

  /* il pozzetto è della squadra: se lo prende il giocatore 0, il compagno 2
   * può chiudere (con un burraco) anche se non ha preso nulla lui */
  s.pozzettoPreso[0] = true;
  s.melds[2] = [{ id: 'c2', tipo: 'sequenza', seme: 'cuori', slots: scalaCuori() }];
  p._aggiornaMeld(s.melds[2][0]);
  ok('il compagno può chiudere quando la squadra ha il pozzetto e un burraco',
    p.puoChiudere(2) === true, p.puoChiudere(2));
  ok('gli avversari no (il loro pozzetto non è preso)',
    !p.puoChiudere(1) && !p.puoChiudere(3));

  /* prendere il pozzetto: lo prende il giocatore di turno, per la squadra */
  s.pozzettoPreso[0] = false;
  s.melds[2] = [];
  s.fase = 'gioco';
  s.turno = 0;
  s.mani[0] = [new E.Carta('sola', 3, 'cuori', false)];
  s.pozzetti[0] = [new E.Carta('p1', 4, 'cuori', false), new E.Carta('p2', 5, 'cuori', false)];
  const r = p.scarta('sola');
  ok('scartando l\'ultima carta si va a pozzetto', r.ok && r.pozzetto === true, r);
  ok('il pozzetto della squadra è segnato come preso', s.pozzettoPreso[0] === true);
  ok('il pozzetto dell\'altra squadra è intatto', s.pozzettoPreso[1] === false);
  eq(s.mani[0].length, 2, 'le carte del pozzetto sono finite in mano a chi le ha prese');
  eq(s.turno, 1, 'dopo il pozzetto il turno passa al prossimo');
}

/* =====================================================================
 * 4. PUNTEGGIO A SQUADRE
 * ===================================================================== */
sezione('Punteggio a squadre');
{
  const p = new E.Partita({ giocatori: 4, seed: 21, target: 505 });
  const s = p.stato;
  /* situazione finale costruita a mano: il giocatore 0 chiude */
  s.fase = 'gioco';
  s.turno = 0;
  s.pozzettoPreso = [true, false];
  s.mani[0] = [new E.Carta('ult', 3, 'cuori', false)];   // l'ultima carta per chiudere
  s.mani[1] = [new E.Carta('m1', 10, 'quadri', false), new E.Carta('m1b', 9, 'quadri', false)];
  s.mani[2] = [new E.Carta('m2', 8, 'picche', false)];
  s.mani[3] = [new E.Carta('m3', 4, 'fiori', false)];
  /* un burraco pulito per il giocatore 0 (7 carte di cuori) */
  s.melds[0] = [{ id: 'bur', tipo: 'sequenza', seme: 'cuori', slots: scalaCuori() }];
  p._aggiornaMeld(s.melds[0][0]);
  ok('la combinazione è un burraco pulito', s.melds[0][0].burraco && s.melds[0][0].pulito);

  const r = p.scarta('ult');
  ok('chiusura riuscita', r.ok && r.chiusura === true, r);
  const pu = s.punteggiUltima;
  eq(pu.chiusaDa, 0, 'ha chiuso il giocatore 0');
  /* carte del burraco (5+5+5+5+5+10+10 = 45) + 200 pulito + 100 chiusura */
  eq(pu.punti[0], 345, 'il giocatore 0 prende chiusura + burraco');
  eq(pu.punti[2], 0, 'il compagno non viene penalizzato');
  eq(pu.punti[1], -(10 + 10 + 100), 'l\'avversario 1 paga le carte in mano e il pozzetto');
  eq(pu.punti[3], -(5 + 100), 'l\'avversario 3 paga le carte in mano e il pozzetto');
  const t = p.totaliSquadra();
  eq(t[0], 345, 'la squadra di 0 totalizza 345');
  eq(t[1], -225, 'la squadra avversaria totalizza il saldo dei due');
  ok('la partita non è finita (505 non raggiunto)', s.vincitore === null, s.vincitore);
}

/* =====================================================================
 * 5. PARTITA COMPLETA CONTRO I BOT (4 giocatori)
 * ===================================================================== */
sezione('Partita completa a quattro giocatori (bot)');
{
  let conclusioni = 0, errori = 0;
  const PARTITE = 8;
  for (let n = 0; n < PARTITE; n++) {
    try {
      const p = new E.Partita({ giocatori: 4, seed: 100 + n, target: 505 });
      let turni = 0;
      while (!p.stato.finita && turni < 6000) {
        const g = p.stato.turno;
        const az = AI.giocaTurno(p, 'normale');
        if (p.stato.turno === g && !p.stato.finita) {
          errori++;
          console.log('    partita ' + n + ': il giocatore ' + g + ' non conclude il turno');
          break;
        }
        turni += az.length;
        if (p.stato.finita && p.stato.vincitore === null) p.smazzataSuccessiva();
      }
      if (p.stato.finita && p.stato.vincitore !== null) conclusioni++;
    } catch (e) {
      errori++;
      console.log('    partita ' + n + ' errore: ' + e.message);
    }
  }
  eq(conclusioni, PARTITE, 'tutte le partite a quattro arrivano a un vincitore');
  eq(errori, 0, 'nessun errore nei bot a quattro giocatori');
}

console.log('\n========================================================');
console.log('TEST QUATTRO: passati ' + passati + ' · falliti ' + falliti);
console.log('========================================================');
process.exit(falliti ? 1 : 0);
