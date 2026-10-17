/* =========================================================================
 * test/simulazione.test.js — Simulazione AI contro AI
 * Verifica che il motore non si rompa mai e che le partite si concludano.
 * Esecuzione: node test/simulazione.test.js [numeroPartite]
 * ========================================================================= */
'use strict';

const E = require('../js/burraco-engine.js');
const AI = require('../js/burraco-ai.js');

const PARTITE = Number(process.argv[2] || 200);
const LIVELLI = ['normale', 'difficile', 'facile'];

let falliti = 0;
const errori = [];
function ok(cond, nome, extra) {
  if (!cond) { falliti++; errori.push(nome + (extra ? ' -> ' + extra : '')); }
}

/* Controlla che le 108 carte siano sempre tutte tracciate. */
function contaCarte(s) {
  let n = 0;
  n += s.tallone.length + s.monte.length;
  n += s.mani[0].length + s.mani[1].length;
  n += s.pozzetti[0].length + s.pozzetti[1].length;
  n += s.melds[0].reduce((a, m) => a + m.slots.length, 0);
  n += s.melds[1].reduce((a, m) => a + m.slots.length, 0);
  return n;
}

/* Verifica che nessuna carta sia duplicata. */
function carteDuplicate(s) {
  const ids = [];
  const push = arr => arr.forEach(c => ids.push(c.id));
  push(s.tallone); push(s.monte); push(s.mani[0]); push(s.mani[1]);
  push(s.pozzetti[0]); push(s.pozzetti[1]);
  s.melds[0].forEach(m => m.slots.forEach(sl => ids.push(sl.carta.id)));
  s.melds[1].forEach(m => m.slots.forEach(sl => ids.push(sl.carta.id)));
  const set = new Set(ids);
  return ids.length !== set.size;
}

/* Verifica che tutte le combinazioni calate restino valide. */
function meldValidi(s) {
  for (const lato of [0, 1]) {
    for (const m of s.melds[lato]) {
      const esito = m.tipo === 'gruppo'
        ? E.verificaSlotsGruppo(m.slots)
        : E.verificaSlotsSequenza(m.slots, m.seme);
      if (!esito) return false;
      if (m.burraco !== (m.slots.length >= 7)) return false;
      if (m.pulito !== (m.burraco && m.slots.filter(x => x.wild).length === 0)) return false;
    }
  }
  return true;
}

const statistiche = {
  partite: 0, smazzate: 0, chiusure: 0, senzaChiusura: 0, annullate: 0,
  burracoPuliti: 0, burracoSemipuliti: 0, burracoSporchi: 0, sostituzioni: 0,
  vittorie0: 0, vittorie1: 0, smazzateMax: 0, turniMax: 0, tempiTotali: []
};

const inizio = Date.now();

for (let i = 0; i < PARTITE; i++) {
  const l0 = LIVELLI[i % LIVELLI.length];
  const l1 = LIVELLI[(i + 1) % LIVELLI.length];
  const p = new E.Partita({ seed: 5000 + i, target: 2005, nomi: ['A', 'B'] });
  let giriPartita = 0;
  let errore = null;

  try {
    while (giriPartita++ < 200) {
      // gioca la smazzata
      let turni = 0;
      while (!p.stato.finita) {
        if (turni++ > 3000) throw new Error('turni infiniti nella smazzata');
        const livello = p.stato.turno === 0 ? l0 : l1;
        const azioni = AI.giocaTurno(p, livello);
        if (!azioni.length) {
          // nessuna azione possibile: stato bloccato
          const s = p.stato;
          if (!s.finita) {
            const g = s.turno;
            const scartabili = s.mani[g].filter(c => !p.scartoVietato(g, c.id));
            throw new Error('bot bloccato: fase=' + s.fase + ' mano=' + s.mani[g].length +
              ' scartabili=' + scartabili.length + ' pozzetto=' + s.pozzettoPreso[g] +
              ' pozzetti=' + s.pozzetti[g].length + ' tallone=' + s.tallone.length +
              ' monte=' + s.monte.length);
          }
        }
        if (contaCarte(p.stato) !== 108) {
          throw new Error('carte non conservate: ' + contaCarte(p.stato));
        }
        if (carteDuplicate(p.stato)) throw new Error('carte duplicate');
        if (!meldValidi(p.stato)) throw new Error('combinazione calata non più valida');
      }

      // statistiche della smazzata
      const pu = p.stato.punteggiUltima;
      statistiche.smazzate++;
      if (pu.annullata) statistiche.annullate++;
      else if (pu.chiusaDa !== null) statistiche.chiusure++;
      else statistiche.senzaChiusura++;
      for (const lato of [0, 1]) {
        for (const m of p.stato.melds[lato]) {
          if (m.burraco && m.pulito) statistiche.burracoPuliti++;
          else if (m.burraco && m.semipulito) statistiche.burracoSemipuliti++;
          else if (m.burraco) statistiche.burracoSporchi++;
        }
      }
      statistiche.turniMax = Math.max(statistiche.turniMax, turni);

      // ogni punteggio deve essere un numero finito
      if (!Number.isFinite(pu.punti[0]) || !Number.isFinite(pu.punti[1])) {
        throw new Error('punteggio non finito');
      }

      /* La tabella mostrata all'utente deve quadrare con il totale:
       * carte calate + bonus burraco + chiusura - carte in mano - penale. */
      if (!pu.annullata) {
        for (const i of [0, 1]) {
          const d = pu.dettaglio[i];
          const atteso = d.puntiCarte + d.bonusBurraco + d.chiusura - d.carteInMano - d.penalePozzetto;
          if (atteso !== pu.punti[i]) {
            throw new Error('punteggio incoerente per il giocatore ' + i + ': ' +
              'dettaglio=' + atteso + ' totale=' + pu.punti[i]);
          }
          if (d.totale !== pu.punti[i]) throw new Error('campo totale incoerente');
        }
        // i punti delle carte calate devono combaciare con la somma delle combinazioni
        for (const i of [0, 1]) {
          let somma = 0, bonus = 0;
          for (const m of p.stato.melds[i]) {
            somma += m.slots.reduce((a, s) => a + s.carta.punti, 0);
            if (m.burraco) bonus += E.bonusBurraco(m);
          }
          if (somma !== pu.dettaglio[i].puntiCarte) {
            throw new Error('punti carte incoerenti per il giocatore ' + i);
          }
          if (bonus !== pu.dettaglio[i].bonusBurraco) {
            throw new Error('bonus burraco incoerente per il giocatore ' + i);
          }
        }
        // i totali di partita sono la somma progressiva delle smazzate
        const sommaStorico = [0, 0];
        for (const s0 of p.stato.storico) {
          if (s0.annullata) continue;
          sommaStorico[0] += s0.punti[0];
          sommaStorico[1] += s0.punti[1];
        }
        if (sommaStorico[0] !== p.stato.totali[0] || sommaStorico[1] !== p.stato.totali[1]) {
          throw new Error('totali di partita incoerenti con lo storico');
        }
      }
      if (pu.punti[0] + pu.punti[1] === 0 && !pu.annullata) {
        // somma zero è possibile solo in casi molto rari; lo segnaliamo
      }

      if (p.stato.vincitore !== null) break;
      p.smazzataSuccessiva();
    }
  } catch (e) { errore = e; }

  ok(!errore, 'partita ' + i + ' senza errori', errore && errore.message);
  if (errore) break;

  statistiche.partite++;
  statistiche.smazzateMax = Math.max(statistiche.smazzateMax, giriPartita);
  if (p.stato.vincitore === 0) statistiche.vittorie0++;
  else if (p.stato.vincitore === 1) statistiche.vittorie1++;
  else {
    ok(false, 'partita ' + i + ' senza vincitore dopo ' + giriPartita + ' smazzate');
  }
}

const durata = Date.now() - inizio;

console.log('========================================================');
console.log('SIMULAZIONE AI vs AI');
console.log('========================================================');
console.log('partite giocate       : ' + statistiche.partite + ' / ' + PARTITE);
console.log('durata                : ' + durata + ' ms');
console.log('smazzate totali       : ' + statistiche.smazzate);
console.log('  concluse con chiusura: ' + statistiche.chiusure +
  ' (' + (100 * statistiche.chiusure / Math.max(1, statistiche.smazzate)).toFixed(1) + '%)');
console.log('  senza chiusura       : ' + statistiche.senzaChiusura);
console.log('  annullate            : ' + statistiche.annullate);
console.log('burrachi puliti       : ' + statistiche.burracoPuliti);
console.log('burrachi semipuliti   : ' + statistiche.burracoSemipuliti);
console.log('burrachi sporchi      : ' + statistiche.burracoSporchi);
console.log('smazzate per partita  : max ' + statistiche.smazzateMax);
console.log('turni per smazzata    : max ' + statistiche.turniMax);
console.log('vittorie giocatore 0  : ' + statistiche.vittorie0);
console.log('vittorie giocatore 1  : ' + statistiche.vittorie1);

ok(statistiche.partite === PARTITE, 'tutte le partite sono state completate');
ok(statistiche.chiusure / Math.max(1, statistiche.smazzate) > 0.5,
  'la maggior parte delle smazzate finisce con una chiusura',
  'chiusure: ' + statistiche.chiusure + '/' + statistiche.smazzate);
ok(statistiche.annullate / Math.max(1, statistiche.smazzate) < 0.1,
  'le smazzate annullate sono rare');
ok(statistiche.turniMax < 400, 'nessuna smazzata anormalmente lunga');
ok(statistiche.burracoPuliti + statistiche.burracoSemipuliti + statistiche.burracoSporchi > statistiche.smazzate * 0.5,
  'vengono realizzati burrachi in quantità ragionevole');

console.log('');
if (falliti) {
  console.log('FALLITI: ' + falliti);
  errori.forEach(e => console.log('  ✗ ' + e));
  process.exit(1);
} else {
  console.log('TUTTI I CONTROLLI SUPERATI');
}
