/* =========================================================================
 * burraco-engine.js
 * Motore delle regole del Burraco (regolamento italiano / F.I.Bur.)
 * Nessuna dipendenza esterna. Funziona nel browser e in Node (per i test).
 *
 * Regolamento implementato
 * -------------------------------------------------------------------------
 * MAZZO      : 2 mazzi francesi da 52 carte + 4 jolly = 108 carte.
 *              I jolly e tutte le PINELLE (i 2) sono carte matte.
 * DISTRIBUZ. : 11 carte a testa + 2 pozzetti da 11 carte + 1 carta scoperta
 *              sul monte. Il resto forma il tallone.
 * TURNO      : 1) pesca dal tallone OPPURE raccogli il monte
 *              2) cala / lega / sostituisci
 *              3) scarta una carta (obbligatorio)
 * MONTE      : si raccoglie tutto il monte. Se il monte è composto da una
 *              sola carta, quella carta non può essere riscartata nello
 *              stesso turno.
 * COMBINAZIONI
 *   GRUPPO   : >= 3 carte dello stesso valore, semi anche uguali (max 2 per
 *              seme avendo due mazzi). Massimo 1 matta. Non sono ammessi
 *              gruppi di soli 2 (pinelle).
 *   SEQUENZA : >= 3 carte consecutive dello stesso seme. Massimo 1 matta,
 *              che può stare in un buco interno o prolungare un'estremità.
 *              Eccezione: se nella sequenza c'è la pinella del seme stesso
 *              nella sua posizione naturale (il 2), è ammessa una matta in
 *              più.
 *   MATTE    : jolly (30 pt) e pinelle (20 pt). Una matta non può mai
 *              uscire dal gioco: se si possiede la carta naturale che la
 *              matta rappresenta si può SOSTITUIRE, e la matta si sposta
 *              all'estremità della sequenza restando calata.
 * BURRACO    : combinazione o sequenza di almeno 7 carte.
 *              pulito = 200 pt (nessuna matta), sporco = 100 pt.
 * POZZETTO   : quando si resta senza carte si prende il proprio pozzetto.
 *              "in diretta" se la mano si è svuotata calando (si continua a
 *              giocare subito), "con lo scarto" se si è svuotata scartando
 *              (si gioca dal turno successivo). Una matta può essere
 *              scartata per andare a pozzetto.
 * CHIUSURA   : si chiude scartando l'ultima carta, che non può essere una
 *              matta, dopo aver fatto almeno un burraco e aver preso il
 *              pozzetto. Bonus +100.
 * FINE MANO  : se nessuno chiude, la smazzata termina quando restano 2 carte
 *              da pescare nel tallone. Nessun bonus di chiusura.
 * PUNTEGGIO  : punti delle carte calate + bonus burraco; all'avversario che
 *              chiude in mano si sottraggono i punti delle carte rimaste e
 *              100 punti se non ha preso il pozzetto.
 * PARTITA    : si gioca a smazzate fino a 505 / 1005 / 2005 punti.
 * ========================================================================= */
(function (root) {
  'use strict';

  /* ---------------------------------------------------------------------
   * COSTANTI
   * ------------------------------------------------------------------- */
  const SEMI = ['cuori', 'quadri', 'fiori', 'picche'];
  const SIMBOLO = { cuori: '\u2665', quadri: '\u2666', fiori: '\u2663', picche: '\u2660' };
  const NOME_SEME = { cuori: 'Cuori', quadri: 'Quadri', fiori: 'Fiori', picche: 'Picche' };
  const RANGO_CORTO = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
  const RANGO_LUNGO = { 1: 'Asso', 11: 'Fante', 12: 'Donna', 13: 'Re' };

  const PT_JOLLY = 30;
  const PT_PINELLA = 20;
  const PT_ASSO = 15;
  const PT_ALTA = 10;   // 8,9,10,J,Q,K
  const PT_BASSA = 5;   // 3,4,5,6,7

  const BONUS_BURRACO_PULITO = 200;
  const BONUS_BURRACO_SEMIPULITO = 150;
  const BONUS_BURRACO_SPORCO = 100;
  const BONUS_CHIUSURA = 100;
  const PENALE_POZZETTO = 100;

  const CARTE_MANO = 11;
  const CARTE_POZZETTO = 11;
  const CARTE_TALLONE_FINE = 2;   // la smazzata finisce quando ne restano 2

  /* Rete di sicurezza: se entrambi i giocatori continuano a scambiarsi il
   * monte senza pescare dal tallone, la smazzata non finirebbe mai. Una
   * smazzata normale dura 40-120 turni, quindi questo limite non viene mai
   * raggiunto in una partita reale. */
  const LIMITE_TURNI_SMAZZATA = 400;

  const TARGET_VALIDI = [505, 1005, 2005];

  /* ---------------------------------------------------------------------
   * UTILITÀ CARTE
   * ------------------------------------------------------------------- */
  function isJolly(c) { return !!c.jolly; }
  function isPinella(c) { return !c.jolly && c.valore === 2; }
  function isMatta(c) { return isJolly(c) || isPinella(c); }

  function puntiCarta(c) {
    if (!c) return 0;
    if (isJolly(c)) return PT_JOLLY;
    if (c.valore === 2) return PT_PINELLA;
    if (c.valore === 1) return PT_ASSO;
    if (c.valore >= 8) return PT_ALTA;
    return PT_BASSA;
  }

  function etichettaCarta(c) {
    if (!c) return '?';
    if (isJolly(c)) return 'Jolly';
    const r = RANGO_CORTO[c.valore] || String(c.valore);
    return r + (SIMBOLO[c.seme] || '');
  }

  function nomeLungoCarta(c) {
    if (!c) return '?';
    if (isJolly(c)) return 'Jolly';
    if (c.valore === 2) return '2 (Pinella) di ' + NOME_SEME[c.seme];
    const r = RANGO_LUNGO[c.valore] || String(c.valore);
    return r + ' di ' + NOME_SEME[c.seme];
  }

  /* ---------------------------------------------------------------------
   * CLASSIFICAZIONE DEL BURRACO
   *   pulito     : 7+ carte senza nessuna matta            -> +200
   *   semipulito : 7+ carte con pinelle ma senza jolly     -> +150
   *   sporco     : 7+ carte con almeno un jolly            -> +100
   * La pinella naturale (il 2 del seme al suo posto) non è una matta,
   * quindi non sporca il burraco.
   * ------------------------------------------------------------------- */
  function classificaBurraco(slots) {
    const lista = slots || [];
    let matte = 0;
    let jolly = 0;
    for (const s of lista) {
      if (!s.wild) continue;
      matte++;
      if (isJolly(s.carta)) jolly++;
    }
    const burraco = lista.length >= 7;
    return {
      burraco: burraco,
      matte: matte,
      jolly: jolly,
      pinelle: matte - jolly,
      pulito: burraco && matte === 0,
      semipulito: burraco && matte > 0 && jolly === 0,
      sporco: burraco && jolly > 0
    };
  }

  /** Bonus in punti di una combinazione (0 se non è un burraco). */
  function bonusBurraco(meld) {
    if (!meld || !meld.burraco) return 0;
    if (meld.pulito) return BONUS_BURRACO_PULITO;
    if (meld.semipulito) return BONUS_BURRACO_SEMIPULITO;
    return BONUS_BURRACO_SPORCO;
  }

  /** Nome leggibile del tipo di burraco ("pulito", "semipulito", "sporco"). */
  function nomeBurraco(meld) {
    if (!meld || !meld.burraco) return '';
    if (meld.pulito) return 'pulito';
    if (meld.semipulito) return 'semipulito';
    return 'sporco';
  }

  class Carta {
    constructor(id, valore, seme, jolly) {
      this.id = id;
      this.valore = jolly ? 0 : valore;
      this.seme = jolly ? null : seme;
      this.jolly = !!jolly;
    }
    get punti() { return puntiCarta(this); }
    get etichetta() { return etichettaCarta(this); }
    get nomeLungo() { return nomeLungoCarta(this); }
    get rossa() { return this.seme === 'cuori' || this.seme === 'quadri'; }
  }

  /* Crea il mazzo completo: 2 x 52 + 4 jolly = 108 carte. */
  function creaMazzo() {
    const carte = [];
    let n = 0;
    for (let copia = 0; copia < 2; copia++) {
      for (const seme of SEMI) {
        for (let v = 1; v <= 13; v++) {
          carte.push(new Carta('c' + (n++), v, seme, false));
        }
      }
    }
    for (let i = 0; i < 4; i++) carte.push(new Carta('j' + i, 0, null, true));
    return carte;
  }

  /* ---------------------------------------------------------------------
   * RNG deterministico (per test riproducibili) + Fisher-Yates
   * ------------------------------------------------------------------- */
  function creaRng(seed) {
    if (seed === undefined || seed === null) return Math.random;
    let s = seed >>> 0;
    if (s === 0) s = 0x9e3779b9;
    return function () {
      s ^= s << 13; s >>>= 0;
      s ^= s >>> 17;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }

  function mescola(array, rng) {
    const r = rng || Math.random;
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      const t = array[i]; array[i] = array[j]; array[j] = t;
    }
    return array;
  }

  /* ---------------------------------------------------------------------
   * VALIDAZIONE DELLE COMBINAZIONI
   * ------------------------------------------------------------------- */

  /* Verifica la coerenza di una lista di slot di SEQUENZA.
   * Uno slot = { carta, valore, wild }
   *   - valore : posizione occupata nella scala (1..13)
   *   - wild   : true se la carta è una matta che copre quella posizione
   */
  function verificaSlotsSequenza(slots, seme) {
    if (!slots || slots.length < 3) return false;
    const valori = slots.map(s => s.valore);
    if (valori[0] < 1 || valori[valori.length - 1] > 13) return false;
    for (let i = 1; i < valori.length; i++) {
      if (valori[i] !== valori[i - 1] + 1) return false;
    }
    const visti = new Set();
    for (const s of slots) {
      if (visti.has(s.carta.id)) return false;   // stessa carta due volte
      visti.add(s.carta.id);
      if (s.wild) {
        if (!isMatta(s.carta)) return false;
      } else {
        // una carta naturale non è mai un jolly; la pinella è naturale solo
        // quando occupa la posizione del 2 (s.valore === 2)
        if (isJolly(s.carta)) return false;
        if (s.carta.seme !== seme) return false;
        if (s.carta.valore !== s.valore) return false;
      }
    }
    const naturali = slots.filter(s => !s.wild);
    if (naturali.length < 2) return false;
    const matte = slots.length - naturali.length;
    const haPinellaNaturale = naturali.some(s => s.carta.valore === 2);
    const maxMatte = haPinellaNaturale ? 2 : 1;
    if (matte > maxMatte) return false;
    return true;
  }

  /* Verifica una lista di slot contro il tipo di combinazione dichiarato. */
  function slotsValidi(tipo, seme, slots) {
    if (tipo === 'gruppo') return verificaSlotsGruppo(slots);
    return verificaSlotsSequenza(slots, seme);
  }

  /* Verifica la coerenza di una lista di slot di GRUPPO. */
  function verificaSlotsGruppo(slots) {
    if (!slots || slots.length < 3) return false;
    const V = slots[0].valore;
    if (V === 2) return false;                 // gruppi di pinelle non ammessi
    if (slots.some(s => s.valore !== V)) return false;
    const visti = new Set();
    const contSemi = {};
    let naturali = 0, matte = 0;
    for (const s of slots) {
      if (visti.has(s.carta.id)) return false;
      visti.add(s.carta.id);
      if (s.wild) {
        if (!isMatta(s.carta)) return false;
        matte++;
      } else {
        if (isJolly(s.carta)) return false;
        if (s.carta.valore !== V) return false;
        naturali++;
        contSemi[s.carta.seme] = (contSemi[s.carta.seme] || 0) + 1;
      }
    }
    if (naturali < 2) return false;
    if (matte > 1) return false;
    if (Object.keys(contSemi).some(k => contSemi[k] > 2)) return false;
    return true;
  }

  /* Costruisce la migliore SEQUENZA possibile con le carte date (o null). */
  function costruisciSequenza(carte) {
    const jollys = carte.filter(isJolly);
    const nonJolly = carte.filter(c => !isJolly(c));
    if (nonJolly.length < 2) return null;

    const semiPresenti = [];
    for (const c of nonJolly) if (semiPresenti.indexOf(c.seme) < 0) semiPresenti.push(c.seme);

    let migliore = null;
    for (const seme of semiPresenti) {
      const delSeme = nonJolly.filter(c => c.seme === seme);
      const altri = nonJolly.filter(c => c.seme !== seme);
      // le carte di altri semi possono essere solo pinelle (matte)
      if (altri.some(c => c.valore !== 2)) continue;
      const dueDelSeme = delSeme.filter(c => c.valore === 2);
      const altriDelSeme = delSeme.filter(c => c.valore !== 2);

      // i 2 dello stesso seme possono essere naturali o matte: provo tutte le
      // combinazioni (al massimo 2 carte, quindi al massimo 4 tentativi)
      const n2 = dueDelSeme.length;
      for (let mask = 0; mask < (1 << n2); mask++) {
        const natDue = [], wildDue = [];
        for (let i = 0; i < n2; i++) {
          if (mask & (1 << i)) natDue.push(dueDelSeme[i]); else wildDue.push(dueDelSeme[i]);
        }
        const naturals = altriDelSeme.concat(natDue);
        const wilds = jollys.concat(altri, wildDue);
        const slots = provaSequenza(naturals, wilds, seme);
        if (slots) {
          if (!migliore ||
              slots.length > migliore.length ||
              (slots.length === migliore.length &&
                slots.filter(s => s.wild).length < migliore.filter(s => s.wild).length)) {
            migliore = slots;
          }
        }
      }
    }
    return migliore;
  }

  /* Prova a disporre naturals + wilds su una scala consecutiva del seme dato. */
  function provaSequenza(naturals, wilds, seme) {
    if (naturals.length < 2) return null;
    const valori = naturals.map(c => c.valore).sort((a, b) => a - b);
    for (let i = 1; i < valori.length; i++) {
      if (valori[i] === valori[i - 1]) return null;   // valori duplicati
    }
    const min = valori[0];
    const max = valori[valori.length - 1];
    const span = max - min + 1;
    const buchi = span - naturals.length;
    const W = wilds.length;
    const haPinellaNaturale = valori.indexOf(2) >= 0;
    const maxMatte = haPinellaNaturale ? 2 : 1;
    if (W > maxMatte) return null;
    if (W < buchi) return null;

    let extra = W - buchi;
    const perValore = new Map();
    for (const c of naturals) perValore.set(c.valore, c);
    const pool = wilds.slice();
    const slots = [];

    for (let v = min; v <= max; v++) {
      if (perValore.has(v)) {
        slots.push({ carta: perValore.get(v), valore: v, wild: false });
      } else {
        slots.push({ carta: pool.shift(), valore: v, wild: true });
      }
    }
    // eventuali matte in eccesso: prima sopra, poi sotto
    let alto = max;
    while (extra > 0 && alto + 1 <= 13) {
      alto++;
      slots.push({ carta: pool.shift(), valore: alto, wild: true });
      extra--;
    }
    let basso = min;
    while (extra > 0 && basso - 1 >= 1) {
      basso--;
      slots.unshift({ carta: pool.shift(), valore: basso, wild: true });
      extra--;
    }
    if (extra > 0) return null;
    if (!verificaSlotsSequenza(slots, seme)) return null;
    return slots;
  }

  /* Costruisce il miglior GRUPPO possibile con le carte date (o null). */
  function costruisciGruppo(carte) {
    const jollys = carte.filter(isJolly);
    const nonJolly = carte.filter(c => !isJolly(c));
    if (nonJolly.length < 2) return null;
    const pinelle = nonJolly.filter(c => c.valore === 2);
    const naturali = nonJolly.filter(c => c.valore !== 2);
    if (naturali.length < 2) return null;          // gruppi di pinelle non ammessi
    const V = naturali[0].valore;
    if (!naturali.every(c => c.valore === V)) return null;
    const wilds = jollys.concat(pinelle);
    if (wilds.length > 1) return null;
    if (naturali.length + wilds.length < 3) return null;

    const slots = naturali.map(c => ({ carta: c, valore: V, wild: false }));
    for (const w of wilds) slots.push({ carta: w, valore: V, wild: true });
    if (!verificaSlotsGruppo(slots)) return null;
    return slots;
  }

  function esitoDaSlots(slots, tipo, seme) {
    const punti = slots.reduce((a, s) => a + s.carta.punti, 0);
    const cls = classificaBurraco(slots);
    return {
      tipo: tipo,
      seme: seme || null,
      slots: slots,
      carte: slots.map(s => s.carta),
      punti: punti,
      matte: cls.matte,
      lunghezza: slots.length,
      burraco: cls.burraco,
      pulito: cls.pulito,
      semipulito: cls.semipulito,
      sporco: cls.sporco
    };
  }

  /**
   * Valida una combinazione di carte.
   * @returns {null|{tipo,seme,slots,carte,punti,matte,lunghezza,burraco,pulito,sporco}}
   */
  function validaCombinazione(carte) {
    const lista = (carte || []).filter(Boolean);
    if (lista.length < 3) return null;
    const ids = new Set();
    for (const c of lista) {
      if (ids.has(c.id)) return null;
      ids.add(c.id);
    }
    const slotsGruppo = costruisciGruppo(lista);
    if (slotsGruppo) return esitoDaSlots(slotsGruppo, 'gruppo', null);
    const slotsSeq = costruisciSequenza(lista);
    if (slotsSeq) {
      const seme = slotsSeq.filter(s => !s.wild)[0].carta.seme;
      return esitoDaSlots(slotsSeq, 'sequenza', seme);
    }
    return null;
  }

  /** Motivo del rifiuto, per messaggi chiari all'utente. */
  function motivoNonValida(carte) {
    const lista = (carte || []).filter(Boolean);
    if (lista.length < 3) return 'Servono almeno 3 carte per calare una combinazione.';
    const nonJolly = lista.filter(c => !isJolly(c));
    if (nonJolly.length < 2) return 'Una combinazione non può essere formata solo da jolly e pinelle.';
    const semi = [];
    for (const c of nonJolly) if (semi.indexOf(c.seme) < 0) semi.push(c.seme);
    const valori = [];
    for (const c of nonJolly) if (valori.indexOf(c.valore) < 0) valori.push(c.valore);
    const matte = lista.filter(isMatta).length;

    if (semi.length === 1 && valori.length === 1 && valori[0] !== 2) {
      if (matte > 1) return 'Massimo 1 matta per combinazione.';
      return 'Gruppo non valido.';
    }
    if (valori.length === 1 && valori[0] === 2) {
      return 'Non si possono calare gruppi di soli 2 (pinelle): il 2 vale come matta.';
    }
    if (valori.length === 1) {
      if (matte > 1) return 'Massimo 1 matta per gruppo.';
      return 'Gruppo non valido.';
    }
    // sequenza
    const semiDiversi = semi.length > 1;
    if (semiDiversi) {
      const estranei = lista.filter(c => !isJolly(c) && c.valore !== 2 && c.seme !== semi[0]);
      if (estranei.length) return 'In una sequenza tutte le carte devono essere dello stesso seme.';
    }
    if (matte > 2) return 'Troppe matte (jolly/pinelle) in questa sequenza.';
    if (matte > 1) return 'Massimo 1 matta per sequenza (2 solo con la pinella del seme al posto giusto).';
    return 'Le carte non formano una sequenza consecutiva dello stesso seme.';
  }

  /* ---------------------------------------------------------------------
   * LEGATURA DI UNA CARTA A UNA COMBINAZIONE GIÀ CALATA
   * ------------------------------------------------------------------- */
  function clonaSlots(slots) {
    return slots.map(s => ({ carta: s.carta, valore: s.valore, wild: s.wild }));
  }

  function legaSequenza(slots, carta) {
    const nuovi = clonaSlots(slots);
    const seme = nuovi.filter(s => !s.wild)[0].carta.seme;
    const min = nuovi[0].valore;
    const max = nuovi[nuovi.length - 1].valore;

    const provaComeMatta = function () {
      const copia = clonaSlots(slots);
      if (max + 1 <= 13) { copia.push({ carta: carta, valore: max + 1, wild: true }); }
      else if (min - 1 >= 1) { copia.unshift({ carta: carta, valore: min - 1, wild: true }); }
      else return null;
      return verificaSlotsSequenza(copia, seme) ? copia : null;
    };

    if (isMatta(carta)) {
      // la pinella dello stesso seme può però essere naturale: si prova prima
      // l'estensione naturale qui sotto
      if (isJolly(carta) || carta.seme !== seme) return provaComeMatta();
    }

    // estensione naturale (vale anche per la pinella del seme al posto del 2)
    if (!isJolly(carta) && carta.seme === seme) {
      if (carta.valore === max + 1) {
        nuovi.push({ carta: carta, valore: carta.valore, wild: false });
        if (verificaSlotsSequenza(nuovi, seme)) return nuovi;
      }
      if (carta.valore === min - 1) {
        nuovi.unshift({ carta: carta, valore: carta.valore, wild: false });
        if (verificaSlotsSequenza(nuovi, seme)) return nuovi;
      }
    }

    if (isMatta(carta)) return provaComeMatta();
    if (carta.seme !== seme) return null;

    // SOSTITUZIONE: la carta naturale prende il posto di una matta, che
    // viene spostata a un'estremità restando calata.
    const idx = nuovi.findIndex(s => s.wild && s.valore === carta.valore);
    if (idx >= 0) {
      const matta = nuovi[idx].carta;
      nuovi[idx] = { carta: carta, valore: carta.valore, wild: false };
      const nMax = nuovi[nuovi.length - 1].valore;
      const nMin = nuovi[0].valore;
      if (nMax + 1 <= 13) nuovi.push({ carta: matta, valore: nMax + 1, wild: true });
      else if (nMin - 1 >= 1) nuovi.unshift({ carta: matta, valore: nMin - 1, wild: true });
      else return null;
      return verificaSlotsSequenza(nuovi, seme) ? nuovi : null;
    }
    return null;
  }

  function legaGruppo(slots, carta) {
    const nuovi = clonaSlots(slots);
    const V = nuovi[0].valore;
    if (isMatta(carta)) {
      nuovi.push({ carta: carta, valore: V, wild: true });
    } else {
      if (carta.valore !== V) return null;
      nuovi.push({ carta: carta, valore: V, wild: false });
    }
    return verificaSlotsGruppo(nuovi) ? nuovi : null;
  }

  /**
   * Verifica se una carta si può legare a una combinazione già calata.
   * @returns {null|{slots, sostituzione:boolean}}
   */
  function provaLegatura(meld, carta) {
    if (!meld || !carta) return null;
    if (meld.slots.some(s => s.carta.id === carta.id)) return null;
    let slots = null;
    if (meld.tipo === 'gruppo') slots = legaGruppo(meld.slots, carta);
    else slots = legaSequenza(meld.slots, carta);
    if (!slots) return null;
    const sostituzione = meld.tipo === 'sequenza' && slots.length === meld.slots.length + 1 &&
      slots.filter(s => s.wild).length === meld.slots.filter(s => s.wild).length &&
      slots.some((s, i) => meld.slots[i] && s.carta.id !== meld.slots[i].carta.id);
    return { slots: slots, sostituzione: !!sostituzione };
  }

  /* ---------------------------------------------------------------------
   * SUGGERIMENTI / GENERAZIONE COMBINAZIONI (usata da AI e suggerimenti UI)
   * ------------------------------------------------------------------- */
  function suggerisciCombinazioni(carte, limite) {
    const out = [];
    const matte = carte.filter(isMatta);
    const naturali = carte.filter(c => !isMatta(c));

    /* --- gruppi --- */
    const perRango = new Map();
    for (const c of naturali) {
      if (!perRango.has(c.valore)) perRango.set(c.valore, []);
      perRango.get(c.valore).push(c);
    }
    perRango.forEach(function (gruppo, V) {
      const cont = {};
      const sel = [];
      for (const c of gruppo) {
        cont[c.seme] = (cont[c.seme] || 0) + 1;
        if (cont[c.seme] <= 2) sel.push(c);
      }
      if (sel.length >= 3) out.push(sel.map(c => c.id));
      if (sel.length >= 2) {
        for (const m of matte) out.push(sel.map(c => c.id).concat(m.id));
      }
    });

    /* --- sequenze --- */
    for (const seme of SEMI) {
      const delSeme = naturali.filter(c => c.seme === seme);
      if (delSeme.length < 2) continue;
      const perVal = new Map();
      for (const c of delSeme) {
        if (!perVal.has(c.valore)) perVal.set(c.valore, []);
        perVal.get(c.valore).push(c);
      }
      const valori = Array.from(perVal.keys()).sort((a, b) => a - b);
      for (let i = 0; i < valori.length; i++) {
        for (let j = i; j < valori.length; j++) {
          const lo = valori[i], hi = valori[j];
          const span = hi - lo + 1;
          if (span < 2) continue;
          const buchi = span - (j - i + 1);
          if (buchi > 1) continue;
          const sel = [];
          for (let v = lo; v <= hi; v++) if (perVal.has(v)) sel.push(perVal.get(v)[0]);
          const usate = new Set(sel.map(c => c.id));
          const matteLibere = matte.filter(m => !usate.has(m.id));
          const ids = sel.map(c => c.id);
          if (buchi === 1) {
            if (matteLibere.length) out.push(ids.concat(matteLibere[0].id));
          } else {
            if (sel.length >= 3) out.push(ids.slice());
            if (matteLibere.length && sel.length >= 2) out.push(ids.concat(matteLibere[0].id));
          }
        }
      }
    }

    const visti = new Set();
    const validi = [];
    for (const ids of out) {
      const chiave = ids.slice().sort().join(',');
      if (visti.has(chiave)) continue;
      visti.add(chiave);
      const sel = ids.map(id => carte.find(c => c.id === id)).filter(Boolean);
      if (sel.length !== ids.length) continue;
      const esito = validaCombinazione(sel);
      if (esito) validi.push({ ids: sel.map(c => c.id), esito: esito });
    }
    validi.sort(function (a, b) {
      return (b.esito.punti - a.esito.punti) || (b.ids.length - a.ids.length);
    });
    return limite ? validi.slice(0, limite) : validi;
  }

  /* ---------------------------------------------------------------------
   * PARTITA
   * ------------------------------------------------------------------- */
  class Partita {
    /**
     * @param {object} [opzioni]
     *   target  : 505 | 1005 | 2005 (punteggio per vincere la partita)
     *   nomi    : [nomeGiocatore0, nomeGiocatore1]
     *   seed    : seed del generatore casuale (opzionale, per test)
     */
    constructor(opzioni) {
      const o = opzioni || {};
      this.target = TARGET_VALIDI.indexOf(o.target) >= 0 ? o.target : 2005;
      this.nomi = o.nomi || ['Giocatore 1', 'Giocatore 2'];
      this.rng = creaRng(o.seed);
      this.stato = null;
      this.nuovaPartita();
    }

    nuovaPartita() {
      this.stato = {
        smazzata: 0,
        mazziere: 0,          // viene invertito in nuovaSmazzata: il mazziere
                              // della prima smazzata è il giocatore 1 e apre il 2
        turno: 0,
        fase: 'pesca',                 // 'pesca' | 'gioco' | 'fine'
        tallone: [],
        monte: [],
        mani: [[], []],
        pozzetti: [[], []],
        pozzettoPreso: [false, false],
        melds: [[], []],
        totali: [0, 0],
        punteggiUltima: null,
        storico: [],
        chiusaDa: null,
        finita: false,
        vincitore: null,
        monteBloccato: null,
        ultimaAzione: null,
        log: [],
        numMeld: 0
      };
      this.nuovaSmazzata();
      return this.stato;
    }

    /* ---------------- distribuzione ---------------- */
    nuovaSmazzata() {
      const s = this.stato;
      s.smazzata += 1;
      s.mazziere = 1 - s.mazziere;
      s.turno = 1 - s.mazziere;        // inizia chi non è mazziere
      s.fase = 'pesca';
      s.chiusaDa = null;
      s.finita = false;
      s.monteBloccato = null;
      s.turniSmazzata = 0;
      s.ultimaAzione = null;
      s.pozzettoPreso = [false, false];
      s.melds = [[], []];
      s.pozzettoDaGiocare = [false, false];

      const mazzo = mescola(creaMazzo(), this.rng);
      s.tallone = mazzo;
      s.mani = [[], []];
      for (let i = 0; i < CARTE_MANO; i++) {
        s.mani[0].push(s.tallone.pop());
        s.mani[1].push(s.tallone.pop());
      }
      s.pozzetti = [[], []];
      for (let i = 0; i < CARTE_POZZETTO; i++) {
        s.pozzetti[0].push(s.tallone.pop());
        s.pozzetti[1].push(s.tallone.pop());
      }
      s.monte = [s.tallone.pop()];
      s.log = ['Nuova smazzata n. ' + s.smazzata + '. Inizia ' + this.nomi[s.turno] + '.'];
      return s;
    }

    /* ---------------- info di stato ---------------- */
    get giocatoreDiTurno() { return this.stato.turno; }
    get avversarioDiTurno() { return 1 - this.stato.turno; }

    puntiMeld(giocatore) {
      return this.stato.melds[giocatore].reduce((a, m) => a + m.punti, 0);
    }
    bonusMeld(giocatore) {
      return this.stato.melds[giocatore].reduce(function (a, m) {
        return a + bonusBurraco(m);
      }, 0);
    }
    puntiInMano(giocatore) {
      return this.stato.mani[giocatore].reduce((a, c) => a + c.punti, 0);
    }
    contaBurrachi(giocatore) {
      return this.stato.melds[giocatore].filter(m => m.burraco).length;
    }
    puoChiudere(giocatore) {
      const s = this.stato;
      return s.pozzettoPreso[giocatore] && this.contaBurrachi(giocatore) >= 1;
    }

    /* ---------------- pesca ---------------- */
    pescaTallone() {
      const s = this.stato;
      if (s.fase !== 'pesca') return { ok: false, motivo: 'Devi prima pescare una carta.' };
      if (s.tallone.length === 0) return { ok: false, motivo: 'Il tallone è esaurito.' };
      const carta = s.tallone.pop();
      s.mani[s.turno].push(carta);
      s.fase = 'gioco';
      s.monteBloccato = null;
      s.ultimaAzione = { tipo: 'pesca', giocatore: s.turno, sorgente: 'tallone' };
      return { ok: true, carta: carta };
    }

    prendiMonte() {
      const s = this.stato;
      if (s.fase !== 'pesca') return { ok: false, motivo: 'Devi prima pescare una carta.' };
      if (s.monte.length === 0) return { ok: false, motivo: 'Il monte è vuoto.' };
      const carte = s.monte.slice();
      s.monte = [];
      for (const c of carte) s.mani[s.turno].push(c);
      // se il monte era di una sola carta, quella carta non può essere riscartata
      s.monteBloccato = carte.length === 1 ? carte[0].id : null;
      s.fase = 'gioco';
      s.ultimaAzione = { tipo: 'pesca', giocatore: s.turno, sorgente: 'monte', quante: carte.length };
      return { ok: true, carte: carte };
    }

    /* ---------------- calata ---------------- */
    cala(idCarte) {
      const s = this.stato;
      if (s.fase !== 'gioco') return { ok: false, motivo: 'Devi prima pescare una carta.' };
      const giocatore = s.turno;
      const carte = [];
      for (const id of (idCarte || [])) {
        const c = s.mani[giocatore].find(x => x.id === id);
        if (!c) return { ok: false, motivo: 'Carta non in mano.' };
        carte.push(c);
      }
      const esito = validaCombinazione(carte);
      if (!esito) return { ok: false, motivo: motivoNonValida(carte) };

      const restanti = s.mani[giocatore].filter(c => !carte.some(x => x.id === c.id));
      const controllo = this._controllaManoDopoCalata(
        giocatore, restanti, this.contaBurrachi(giocatore) + (esito.burraco ? 1 : 0));
      if (!controllo.ok) return controllo;

      s.melds[giocatore].push({
        id: 'm' + (s.numMeld++),
        tipo: esito.tipo,
        seme: esito.seme,
        slots: esito.slots,
        punti: esito.punti,
        burraco: esito.burraco,
        pulito: esito.pulito,
        semipulito: esito.semipulito,
        sporco: esito.sporco,
        matte: esito.matte,
        lunghezza: esito.lunghezza,
        nuovo: true
      });
      s.mani[giocatore] = restanti;
      s.ultimaAzione = { tipo: 'cala', giocatore: giocatore, meld: s.melds[giocatore][s.melds[giocatore].length - 1] };
      const extra = this._dopoManoSvuotata(giocatore, 'cala');
      return { ok: true, esito: esito, pozzetto: extra.pozzetto };
    }

    /* ---------------- legatura ---------------- */
    lega(indiceMeld, idCarta) {
      const s = this.stato;
      if (s.fase !== 'gioco') return { ok: false, motivo: 'Devi prima pescare una carta.' };
      const giocatore = s.turno;
      const meld = s.melds[giocatore][indiceMeld];
      if (!meld) return { ok: false, motivo: 'Combinazione inesistente.' };
      const carta = s.mani[giocatore].find(c => c.id === idCarta);
      if (!carta) return { ok: false, motivo: 'Carta non in mano.' };

      const prova = provaLegatura(meld, carta);
      if (!prova) return { ok: false, motivo: motivoLegatura(meld, carta) };

      const restanti = s.mani[giocatore].filter(c => c.id !== idCarta);
      const diventeraBurraco = prova.slots.length >= 7 && !meld.burraco;
      const controllo = this._controllaManoDopoCalata(
        giocatore, restanti, this.contaBurrachi(giocatore) + (diventeraBurraco ? 1 : 0));
      if (!controllo.ok) return controllo;

      const eraBurraco = meld.burraco;
      meld.slots = prova.slots;
      this._aggiornaMeld(meld);
      s.mani[giocatore] = restanti;
      s.ultimaAzione = {
        tipo: 'lega', giocatore: giocatore, meld: meld, carta: carta,
        sostituzione: prova.sostituzione, nuovoBurraco: meld.burraco && !eraBurraco
      };
      const extra = this._dopoManoSvuotata(giocatore, 'lega');
      return {
        ok: true, meld: meld, sostituzione: prova.sostituzione,
        nuovoBurraco: meld.burraco && !eraBurraco, pozzetto: extra.pozzetto
      };
    }

    /**
     * Verifica soltanto se uno spostamento è lecito, senza eseguirlo.
     * @returns {{ok:boolean, motivo?:string, restanti?:Array, prova?:Object}}
     */
    valutaSpostamento(indiceOrigine, idCarta, indiceDestinazione) {
      const s = this.stato;
      if (s.finita) return { ok: false, motivo: 'La smazzata è conclusa.' };
      if (s.fase !== 'gioco') return { ok: false, motivo: 'Puoi spostare le carte solo dopo aver pescato.' };
      const melds = s.melds[s.turno];
      const da = melds[indiceOrigine];
      const a = melds[indiceDestinazione];
      if (!da || !a) return { ok: false, motivo: 'Combinazione inesistente.' };
      if (da === a) return { ok: false, motivo: 'La carta è già in quella combinazione.' };

      const i = da.slots.findIndex(function (x) { return x.carta.id === idCarta; });
      if (i < 0) return { ok: false, motivo: 'Carta non presente in quella combinazione.' };
      const carta = da.slots[i].carta;

      const restanti = da.slots.slice(0, i).concat(da.slots.slice(i + 1));
      if (restanti.length < 3) {
        return { ok: false, motivo: 'La combinazione di partenza resterebbe con meno di 3 carte.' };
      }
      if (da.burraco && restanti.length < 7) {
        return { ok: false, motivo: 'Un burraco non si può scomporre: lascialo com\'è.' };
      }
      if (!slotsValidi(da.tipo, da.seme, restanti)) {
        return {
          ok: false,
          motivo: 'Togliendo ' + etichettaCarta(carta) + ' la combinazione di partenza non sarebbe più valida.'
        };
      }
      const prova = provaLegatura(a, carta);
      if (!prova) {
        return { ok: false, motivo: etichettaCarta(carta) + ' non può entrare in quella combinazione.' };
      }
      return { ok: true, restanti: restanti, prova: prova, carta: carta };
    }

    /**
     * Sposta una carta già calata da una combinazione a un'altra dello stesso
     * giocatore (per esempio da un tris a una scala). La combinazione di
     * partenza deve restare valida e un burraco non si può scomporre.
     * @param {number} indiceOrigine indice della combinazione da cui togliere
     * @param {string} idCarta       carta da spostare
     * @param {number} indiceDestinazione indice della combinazione che la riceve
     */
    sposta(indiceOrigine, idCarta, indiceDestinazione) {
      const s = this.stato;
      const giudizio = this.valutaSpostamento(indiceOrigine, idCarta, indiceDestinazione);
      if (!giudizio.ok) return giudizio;

      const melds = s.melds[s.turno];
      const da = melds[indiceOrigine];
      const a = melds[indiceDestinazione];
      const carta = giudizio.carta;

      da.slots = giudizio.restanti;
      this._aggiornaMeld(da);
      const eraBurraco = !!a.burraco;
      a.slots = giudizio.prova.slots;
      this._aggiornaMeld(a);
      a.nuovo = true;
      s.ultimaAzione = {
        tipo: 'sposta', giocatore: s.turno, carta: carta,
        origine: da.id, destinazione: a.id, sostituzione: giudizio.prova.sostituzione
      };
      return {
        ok: true, carta: carta, meldOrigine: da, meldDestinazione: a, meld: a,
        sostituzione: giudizio.prova.sostituzione,
        nuovoBurraco: !!a.burraco && !eraBurraco
      };
    }

    /* Riallinea punti, lunghezza e classificazione di una combinazione. */
    _aggiornaMeld(meld) {
      const cls = classificaBurraco(meld.slots);
      meld.lunghezza = meld.slots.length;
      meld.matte = cls.matte;
      meld.punti = meld.slots.reduce(function (a, x) { return a + x.carta.punti; }, 0);
      meld.burraco = cls.burraco;
      meld.pulito = cls.pulito;
      meld.semipulito = cls.semipulito;
      meld.sporco = cls.sporco;
      return meld;
    }

    /* ---------------- scarto ---------------- */
    scarta(idCarta) {
      const s = this.stato;
      if (s.fase !== 'gioco') return { ok: false, motivo: 'Devi prima pescare una carta.' };
      const giocatore = s.turno;
      const carta = s.mani[giocatore].find(c => c.id === idCarta);
      if (!carta) return { ok: false, motivo: 'Carta non in mano.' };
      if (s.monteBloccato === carta.id && s.mani[giocatore].length > 1) {
        return { ok: false, motivo: 'La carta appena presa da un monte di una sola carta non può essere riscartata.' };
      }

      const ultima = s.mani[giocatore].length === 1;

      if (ultima && !s.pozzettoPreso[giocatore]) {
        // scarto dell'ultima carta per andare a pozzetto
        if (!(s.pozzetti[giocatore] || []).length) {
          return { ok: false, motivo: 'Non hai più carte e non hai un pozzetto: impossibile proseguire.' };
        }
        this._scartaCarta(giocatore, carta);
        const prese = this._prendiPozzetto(giocatore);
        this._fineTurno();
        return { ok: true, pozzetto: true, cartePozzetto: prese };
      }

      if (ultima && s.pozzettoPreso[giocatore]) {
        // tentativo di chiusura
        if (isMatta(carta)) {
          return { ok: false, motivo: 'Non puoi chiudere scartando una matta (jolly o pinella). Pesca un\'altra carta.' };
        }
        if (this.contaBurrachi(giocatore) < 1) {
          return { ok: false, motivo: 'Per chiudere devi aver calato almeno un burraco (7 o più carte).' };
        }
        this._scartaCarta(giocatore, carta);
        this._chiudi(giocatore);
        return { ok: true, chiusura: true };
      }

      this._scartaCarta(giocatore, carta);
      s.ultimaAzione = { tipo: 'scarta', giocatore: giocatore, carta: carta };
      this._fineTurno();
      return { ok: true };
    }

    _scartaCarta(giocatore, carta) {
      const s = this.stato;
      s.mani[giocatore] = s.mani[giocatore].filter(c => c.id !== carta.id);
      s.monte.push(carta);
    }

    /* ---------------- fine turno / fine mano ---------------- */
    _fineTurno() {
      const s = this.stato;
      if (s.finita) return;
      s.turno = 1 - s.turno;
      s.fase = 'pesca';
      s.monteBloccato = null;
      s.turniSmazzata = (s.turniSmazzata || 0) + 1;
      if (s.tallone.length <= CARTE_TALLONE_FINE) {
        this._fineSenzaChiusura();
      } else if (s.turniSmazzata > LIMITE_TURNI_SMAZZATA) {
        s.log.push('Smazzata chiusa d\'ufficio: troppi turni senza progressi.');
        this._fineSenzaChiusura();
      }
    }

    _chiudi(giocatore) {
      const s = this.stato;
      s.chiusaDa = giocatore;
      this._calcolaPunteggi();
    }

    _fineSenzaChiusura() {
      const s = this.stato;
      s.chiusaDa = null;
      this._calcolaPunteggi();
    }

    /* ---------------- pozzetto ---------------- */
    _prendiPozzetto(giocatore) {
      const s = this.stato;
      const stack = s.pozzetti[giocatore] || [];
      if (!stack.length) return null;
      s.pozzetti[giocatore] = [];
      for (const c of stack) s.mani[giocatore].push(c);
      s.pozzettoPreso[giocatore] = true;
      return stack;
    }

    /* Se la mano si è svuotata calando, il pozzetto si prende "in diretta". */
    _dopoManoSvuotata(giocatore, via) {
      const s = this.stato;
      if (s.mani[giocatore].length > 0) return { pozzetto: false };
      if (s.pozzettoPreso[giocatore]) return { pozzetto: false };
      if (!(s.pozzetti[giocatore] || []).length) return { pozzetto: false };
      const prese = this._prendiPozzetto(giocatore);
      s.ultimaAzione = s.ultimaAzione || {};
      s.ultimaAzione.pozzettoInDiretta = true;
      return { pozzetto: true, carte: prese };
    }

    /* Impedisce mosse che lascerebbero il giocatore in una situazione
     * impossibile: senza carte (dopo aver preso il pozzetto), con sole matte
     * in mano, o con una sola carta che non permetterebbe di chiudere.
     * @param {number} [burrachiProiettati] burrachi dopo la mossa in corso */
    _controllaManoDopoCalata(giocatore, restanti, burrachiProiettati) {
      const s = this.stato;
      const burrachi = burrachiProiettati === undefined
        ? this.contaBurrachi(giocatore) : burrachiProiettati;
      if (restanti.length === 0) {
        if (s.pozzettoPreso[giocatore]) {
          return { ok: false, motivo: 'Per chiudere devi scartare l\'ultima carta: non puoi calare tutte le carte.' };
        }
        if (!(s.pozzetti[giocatore] || []).length) {
          return { ok: false, motivo: 'Non puoi restare senza carte.' };
        }
        return { ok: true };
      }
      if (s.pozzettoPreso[giocatore]) {
        if (restanti.every(isMatta)) {
          return { ok: false, motivo: 'Non puoi restare con sole matte in mano: devi tenere una carta da scartare.' };
        }
        if (restanti.length === 1 && burrachi < 1) {
          return { ok: false, motivo: 'Restando con una sola carta dovresti poter chiudere: ti manca ancora un burraco.' };
        }
      }
      return { ok: true };
    }

    /* ---------------- punteggi ---------------- */
    _calcolaPunteggi() {
      const s = this.stato;
      const dettaglio = [];
      const punti = [0, 0];

      for (let i = 0; i < 2; i++) {
        const meld = this.puntiMeld(i);
        const bonus = this.bonusMeld(i);
        punti[i] = meld + bonus;
        dettaglio.push({
          giocatore: i,
          puntiCarte: meld,
          bonusBurraco: bonus,
          burrachi: this.contaBurrachi(i),
          chiusura: 0,
          carteInMano: this.puntiInMano(i),
          penalePozzetto: s.pozzettoPreso[i] ? 0 : PENALE_POZZETTO,
          totale: 0
        });
      }

      // smazzata annullata: nessuno ha preso il pozzetto e nessuno ha chiuso
      const annullata = s.chiusaDa === null && !s.pozzettoPreso[0] && !s.pozzettoPreso[1];
      if (annullata) {
        s.punteggiUltima = {
          annullata: true, punti: [0, 0], dettaglio: dettaglio,
          chiusaDa: null, smazzata: s.smazzata
        };
        s.log.push('Smazzata annullata: nessuno ha preso il pozzetto. Si ripete.');
        s.finita = true;
        return s.punteggiUltima;
      }

      if (s.chiusaDa !== null) {
        const v = s.chiusaDa;
        punti[v] += BONUS_CHIUSURA;
        dettaglio[v].chiusura = BONUS_CHIUSURA;
        const avv = 1 - v;
        const penale = dettaglio[avv].carteInMano + dettaglio[avv].penalePozzetto;
        punti[avv] -= penale;
      } else {
        for (let i = 0; i < 2; i++) {
          punti[i] -= (dettaglio[i].carteInMano + dettaglio[i].penalePozzetto);
        }
      }

      for (let i = 0; i < 2; i++) dettaglio[i].totale = punti[i];
      s.totali[0] += punti[0];
      s.totali[1] += punti[1];
      s.finita = true;
      s.fase = 'fine';

      s.punteggiUltima = {
        annullata: false,
        punti: punti.slice(),
        dettaglio: dettaglio,
        chiusaDa: s.chiusaDa,
        smazzata: s.smazzata,
        senzaChiusura: s.chiusaDa === null,
        totali: s.totali.slice()
      };
      s.storico.push(s.punteggiUltima);

      // vittoria: chi raggiunge il target al termine della smazzata
      if (s.totali[0] >= this.target || s.totali[1] >= this.target) {
        if (s.totali[0] === s.totali[1]) {
          s.vincitore = null;   // parità: si continua
        } else {
          s.vincitore = s.totali[0] > s.totali[1] ? 0 : 1;
        }
      }
      s.log.push('Smazzata conclusa. Punti smazzata: ' + punti[0] + ' / ' + punti[1]);
      return s.punteggiUltima;
    }

    /* Prosegue la partita dopo la fine di una smazzata.
     * @returns {boolean} true se la partita è finita (c'è un vincitore) */
    smazzataSuccessiva() {
      const s = this.stato;
      if (!s.finita) return false;
      if (s.vincitore !== null) return true;
      this.nuovaSmazzata();
      return false;
    }

    /* ---------------- query per UI e AI ---------------- */
    /* Indici delle combinazioni del giocatore a cui la carta si può
     * effettivamente attaccare (tenendo conto anche dei vincoli sulla mano
     * residua, così l'interfaccia non evidenzia mosse poi rifiutate). */
    meldsCompatibili(giocatore, idCarta) {
      const s = this.stato;
      const carta = s.mani[giocatore].find(c => c.id === idCarta);
      if (!carta) return [];
      const restanti = s.mani[giocatore].filter(c => c.id !== idCarta);
      const burrachi = this.contaBurrachi(giocatore);
      const out = [];
      const self = this;
      s.melds[giocatore].forEach(function (m, i) {
        const prova = provaLegatura(m, carta);
        if (!prova) return;
        const diventeraBurraco = prova.slots.length >= 7 && !m.burraco;
        const controllo = self._controllaManoDopoCalata(
          giocatore, restanti, burrachi + (diventeraBurraco ? 1 : 0));
        if (controllo.ok) out.push(i);
      });
      return out;
    }

    /* True se la combinazione è valida E calarla lascia il giocatore in uno
     * stato giocabile (deve sempre restare una carta da scartare). */
    calaAmmissibile(giocatore, carte) {
      const s = this.stato;
      const lista = (carte || []).filter(Boolean);
      const esito = validaCombinazione(lista);
      if (!esito) return false;
      const ids = new Set(lista.map(c => c.id));
      const restanti = s.mani[giocatore].filter(c => !ids.has(c.id));
      const controllo = this._controllaManoDopoCalata(
        giocatore, restanti, this.contaBurrachi(giocatore) + (esito.burraco ? 1 : 0));
      return controllo.ok;
    }

    /* Motivo per cui una combinazione valida non si può calare adesso. */
    motivoCalataNonAmmessa(giocatore, carte) {
      const s = this.stato;
      const lista = (carte || []).filter(Boolean);
      const esito = validaCombinazione(lista);
      if (!esito) return motivoNonValida(lista);
      const ids = new Set(lista.map(c => c.id));
      const restanti = s.mani[giocatore].filter(c => !ids.has(c.id));
      const controllo = this._controllaManoDopoCalata(
        giocatore, restanti, this.contaBurrachi(giocatore) + (esito.burraco ? 1 : 0));
      return controllo.ok ? null : controllo.motivo;
    }

    suggerimenti(giocatore) {
      const self = this;
      const lista = suggerisciCombinazioni(this.stato.mani[giocatore], 40);
      return lista.filter(function (x) {
        return self.calaAmmissibile(giocatore, x.esito.carte);
      }).slice(0, 8);
    }

    /* Indica se il giocatore può scartare la carta (evidenzia i casi vietati). */
    scartoVietato(giocatore, idCarta) {
      const s = this.stato;
      const carta = s.mani[giocatore].find(c => c.id === idCarta);
      if (!carta) return true;
      if (s.monteBloccato === idCarta && s.mani[giocatore].length > 1) return true;
      if (s.mani[giocatore].length === 1 && s.pozzettoPreso[giocatore]) {
        if (isMatta(carta)) return true;
        if (this.contaBurrachi(giocatore) < 1) return true;
      }
      return false;
    }

    /* true se scartando questa carta si chiude la smazzata */
    chiudeCon(giocatore, idCarta) {
      const s = this.stato;
      const carta = s.mani[giocatore].find(c => c.id === idCarta);
      if (!carta) return false;
      return s.mani[giocatore].length === 1 && s.pozzettoPreso[giocatore] &&
        this.contaBurrachi(giocatore) >= 1 && !isMatta(carta);
    }

    /* ---------------- serializzazione (per salvataggio) ---------------- */
    serializza() {
      const s = this.stato;
      const card = c => ({ id: c.id, valore: c.valore, seme: c.seme, jolly: c.jolly });
      return JSON.stringify({
        target: this.target, nomi: this.nomi,
        stato: {
          smazzata: s.smazzata, mazziere: s.mazziere, turno: s.turno, fase: s.fase,
          tallone: s.tallone.map(card), monte: s.monte.map(card),
          mani: [s.mani[0].map(card), s.mani[1].map(card)],
          pozzetti: [s.pozzetti[0].map(card), s.pozzetti[1].map(card)],
          pozzettoPreso: s.pozzettoPreso,
          melds: s.melds.map(l => l.map(m => ({
            tipo: m.tipo, seme: m.seme, punti: m.punti, burraco: m.burraco,
            pulito: m.pulito, sporco: m.sporco, matte: m.matte, lunghezza: m.lunghezza,
            slots: m.slots.map(sl => ({ valore: sl.valore, wild: sl.wild, carta: card(sl.carta) }))
          }))),
          totali: s.totali, punteggiUltima: s.punteggiUltima, storico: s.storico,
          chiusaDa: s.chiusaDa, finita: s.finita, vincitore: s.vincitore,
          monteBloccato: s.monteBloccato, log: s.log, numMeld: s.numMeld
        }
      });
    }
  }

  function motivoLegatura(meld, carta) {
    if (meld.tipo === 'gruppo') {
      if (isMatta(carta)) return 'Questa combinazione ha già una matta: massimo 1 per gruppo.';
      return 'La carta deve avere lo stesso valore delle carte del gruppo (' +
        (RANGO_CORTO[meld.slots[0].valore] || meld.slots[0].valore) + ').';
    }
    const seme = meld.slots.filter(s => !s.wild)[0].carta.seme;
    if (isMatta(carta)) return 'Questa sequenza ha già una matta: massimo 1 per sequenza.';
    if (carta.seme !== seme) return 'La carta deve essere dello stesso seme della sequenza (' + NOME_SEME[seme] + ').';
    return 'La carta non continua la sequenza né sostituisce una matta.';
  }

  /* ---------------------------------------------------------------------
   * ESPORTAZIONE
   * ------------------------------------------------------------------- */
  const API = {
    SEMI: SEMI, SIMBOLO: SIMBOLO, NOME_SEME: NOME_SEME,
    RANGO_CORTO: RANGO_CORTO, RANGO_LUNGO: RANGO_LUNGO,
    TARGET_VALIDI: TARGET_VALIDI,
    PT_JOLLY: PT_JOLLY, PT_PINELLA: PT_PINELLA, PT_ASSO: PT_ASSO,
    PT_ALTA: PT_ALTA, PT_BASSA: PT_BASSA,
    BONUS_BURRACO_PULITO: BONUS_BURRACO_PULITO,
    BONUS_BURRACO_SEMIPULITO: BONUS_BURRACO_SEMIPULITO,
    BONUS_BURRACO_SPORCO: BONUS_BURRACO_SPORCO,
    BONUS_CHIUSURA: BONUS_CHIUSURA,
    PENALE_POZZETTO: PENALE_POZZETTO,
    CARTE_MANO: CARTE_MANO, CARTE_POZZETTO: CARTE_POZZETTO,
    Carta: Carta,
    Partita: Partita,
    creaMazzo: creaMazzo,
    creaRng: creaRng,
    mescola: mescola,
    isJolly: isJolly,
    isPinella: isPinella,
    isMatta: isMatta,
    puntiCarta: puntiCarta,
    etichettaCarta: etichettaCarta,
    nomeLungoCarta: nomeLungoCarta,
    validaCombinazione: validaCombinazione,
    motivoNonValida: motivoNonValida,
    classificaBurraco: classificaBurraco,
    bonusBurraco: bonusBurraco,
    nomeBurraco: nomeBurraco,
    provaLegatura: provaLegatura,
    suggerisciCombinazioni: suggerisciCombinazioni,
    verificaSlotsSequenza: verificaSlotsSequenza,
    verificaSlotsGruppo: verificaSlotsGruppo
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.BurracoEngine = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
