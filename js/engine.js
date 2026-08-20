/* =====================================================================
 * engine.js — Motore regole: mazzi, carte e logica di Scopa, Briscola,
 *             Burraco.  Vanilla JS / ES6 / OOP.  Nessuna dipendenza.
 * ===================================================================== */
'use strict';

/* ---------------------------------------------------------------------
 * 1. CATALOGO DEI SEMI E DEI MAZZI ITALIANI (tutta Italia)
 * --------------------------------------------------------------------- */
const SEMI_ITALIANI = {
  denari:  { nome: 'denari',  simbolo: '♦', colore: '#c9971a', classe: 'denari'  },
  coppe:   { nome: 'coppe',   simbolo: '♥', colore: '#1f4e9c', classe: 'coppe'   },
  spade:   { nome: 'spade',   simbolo: '♠', colore: '#222222', classe: 'spade'   },
  bastoni: { nome: 'bastoni', simbolo: '♣', colore: '#2e7d32', classe: 'bastoni' }
};

const SEMI_FRANCESI = {
  cuori:  { nome: 'cuori',  simbolo: '♥', colore: '#c62828', classe: 'cuori'  },
  quadri: { nome: 'quadri', simbolo: '♦', colore: '#c62828', classe: 'quadri' },
  fiori:  { nome: 'fiori',  simbolo: '♣', colore: '#222222', classe: 'fiori'  },
  picche: { nome: 'picche', simbolo: '♠', colore: '#222222', classe: 'picche' }
};

const SEME_JOLLY = { nome: 'jolly', simbolo: '★', colore: '#7b1fa2', classe: 'jolly' };

/* Configurazione dei mazzi regionali: le differenze reali tra le carte
 * italiane sono il retro, l'accento cromatico e la resa delle figure.
 * Ogni regione dichiara il proprio stile; le figure standard italiane
 * sono Fante(8), Cavallo(9), Re(10). */
const MAZZI_ITALIANI = {
  napoletane: {
    nome: 'Napoletane', regione: 'Campania', semi: ['denari', 'coppe', 'spade', 'bastoni'],
    figure: { 8: 'Fante', 9: 'Cavallo', 10: 'Re' }, retro: 'pattern-napoletane', accento: '#c9971a',
    immagini: true // le facce sono immagini reali in img/napoletane/
  },
  piacentine: {
    nome: 'Piacentine', regione: 'Emilia-Romagna', semi: ['denari', 'coppe', 'spade', 'bastoni'],
    figure: { 8: 'Donna', 9: 'Cavallo', 10: 'Re' }, retro: 'pattern-piacentine', accento: '#b8860b'
  },
  sarde: {
    nome: 'Sarde', regione: 'Sardegna', semi: ['denari', 'coppe', 'spade', 'bastoni'],
    figure: { 8: 'Fante', 9: 'Cavallo', 10: 'Re' }, retro: 'pattern-sarde', accento: '#8e44ad'
  },
  siciliane: {
    nome: 'Siciliane', regione: 'Sicilia', semi: ['denari', 'coppe', 'spade', 'bastoni'],
    figure: { 8: 'Fante', 9: 'Cavallo', 10: 'Re' }, retro: 'pattern-siciliane', accento: '#e67e22'
  },
  trevisane: {
    nome: 'Trevisane', regione: 'Veneto', semi: ['denari', 'coppe', 'spade', 'bastoni'],
    figure: { 8: 'Donna', 9: 'Cavallo', 10: 'Re' }, retro: 'pattern-trevisane', accento: '#16a085'
  },
  bergamasche: {
    nome: 'Bergamasche', regione: 'Lombardia', semi: ['denari', 'coppe', 'spade', 'bastoni'],
    figure: { 8: 'Donna', 9: 'Cavallo', 10: 'Re' }, retro: 'pattern-bergamasche', accento: '#2980b9'
  },
  bresciane: {
    nome: 'Bresciane', regione: 'Lombardia', semi: ['denari', 'coppe', 'spade', 'bastoni'],
    figure: { 8: 'Donna', 9: 'Cavallo', 10: 'Re' }, retro: 'pattern-bresciane', accento: '#27ae60'
  },
  bolognesi: {
    nome: 'Bolognesi', regione: 'Emilia-Romagna', semi: ['denari', 'coppe', 'spade', 'bastoni'],
    figure: { 8: 'Donna', 9: 'Cavallo', 10: 'Re' }, retro: 'pattern-bolognesi', accento: '#d35400'
  },
  genovesi: {
    nome: 'Genovesi', regione: 'Liguria', semi: ['denari', 'coppe', 'spade', 'bastoni'],
    figure: { 8: 'Donna', 9: 'Cavallo', 10: 'Re' }, retro: 'pattern-genovesi', accento: '#2c3e50'
  },
  toscane: {
    nome: 'Toscane', regione: 'Toscana', semi: ['denari', 'coppe', 'spade', 'bastoni'],
    figure: { 8: 'Fante', 9: 'Cavallo', 10: 'Re' }, retro: 'pattern-toscane', accento: '#8b4513'
  }
};

const ELENCO_MAZZI = Object.keys(MAZZI_ITALIANI);

/* ---------------------------------------------------------------------
 * 2. CLASSE CARTA
 * --------------------------------------------------------------------- */
class Carta {
  /**
   * @param {number} valore  1..10 (italiane) o 1..13 (burraco); 0 = jolly
   * @param {object} seme    oggetto seme (vedi SEMI_*)
   * @param {string} tipoMazzo chiave in MAZZI_ITALIANI oppure 'francese'
   * @param {object} [opts]  { jolly: bool, id: string }
   */
  constructor(valore, seme, tipoMazzo, opts = {}) {
    this.valore = valore;
    this.seme = seme;
    this.tipoMazzo = tipoMazzo;
    this.jolly = !!opts.jolly;
    this.coperta = true;
    this.id = opts.id || `${tipoMazzo}-${seme.nome}-${valore}`;
  }

  get eFigura() {
    if (this.jolly) return false;
    return this.tipoMazzo === 'francese' ? this.valore >= 11 : this.valore >= 8;
  }
  get eJolly() { return this.jolly; }
  get ePinella() { return !this.jolly && this.valore === 2; }

  get nome() {
    if (this.jolly) return 'Jolly';
    if (this.tipoMazzo === 'francese') {
      const n = { 1: 'Asso', 11: 'Fante', 12: 'Donna', 13: 'Re' }[this.valore];
      return n || String(this.valore);
    }
    const fig = MAZZI_ITALIANI[this.tipoMazzo]?.figure[this.valore];
    if (fig) return fig;
    if (this.valore === 1) return 'Asso';
    return String(this.valore);
  }

  get puntiBriscola() {
    if (this.jolly) return 0;
    switch (this.valore) {
      case 1: return 11;   // Asso
      case 3: return 10;   // Tre
      case 10: return 4;   // Re
      case 9: return 3;    // Cavallo
      case 8: return 2;    // Fante
      default: return 0;
    }
  }

  /* Coefficiente Primiera (Scopa): 7=21, 6=18, A=16, 5=15, 4=14, 3=13, 2=12, figure=10 */
  get puntiPrimiera() {
    if (this.jolly) return 0;
    switch (this.valore) {
      case 7: return 21;
      case 6: return 18;
      case 1: return 16;
      case 5: return 15;
      case 4: return 14;
      case 3: return 13;
      case 2: return 12;
      default: return 10;
    }
  }

  /* Punti Burraco: A=11, K/Q/J/10/9/8=10, 7..3=5, 2(pinella)=20, jolly=30 */
  get puntiBurraco() {
    if (this.jolly) return 30;
    if (this.tipoMazzo === 'francese') {
      if (this.valore === 1) return 11;
      if (this.valore === 2) return 20;
      if (this.valore >= 3 && this.valore <= 7) return 5;
      return 10;
    }
    if (this.valore === 1) return 11;
    if (this.valore === 2) return 20;
    if (this.valore >= 3 && this.valore <= 7) return 5;
    return 10;
  }

  clona() {
    return new Carta(this.valore, { ...this.seme }, this.tipoMazzo,
      { jolly: this.jolly, id: this.id });
  }

  serializza() {
    return { id: this.id, valore: this.valore, seme: this.seme.nome, tipoMazzo: this.tipoMazzo, jolly: this.jolly, coperta: this.coperta };
  }

  static daSerializzato(obj) {
    const seme = obj.jolly ? SEME_JOLLY :
      (obj.tipoMazzo === 'francese' ? SEMI_FRANCESI[obj.seme] : SEMI_ITALIANI[obj.seme]);
    const c = new Carta(obj.valore, seme, obj.tipoMazzo, { jolly: obj.jolly, id: obj.id });
    c.coperta = !!obj.coperta;
    return c;
  }
}

/* ---------------------------------------------------------------------
 * 3. CLASSE MAZZO
 * --------------------------------------------------------------------- */
class Mazzo {
  /**
   * @param {string} tipo chiave MAZZI_ITALIANI ('napoletane', ...) o 'francese'
   * @param {boolean} [perBurraco] se true crea 2 mazzi da 52 + 4 jolly (108 carte)
   */
  constructor(tipo = 'napoletane', perBurraco = false) {
    this.tipo = tipo;
    this.perBurraco = perBurraco;
    this.carte = this.creaMazzo(tipo, perBurraco);
    this.mescolaMazzo();
  }

  /** Funzioni comuni del mazzo */
  creaMazzo(tipo, perBurraco) {
    if (perBurraco) return this._creaBurraco();
    const conf = MAZZI_ITALIANI[tipo] || MAZZI_ITALIANI.napoletane;
    const carte = [];
    for (const nomeSeme of conf.semi) {
      const seme = SEMI_ITALIANI[nomeSeme];
      for (let v = 1; v <= 10; v++) {
        carte.push(new Carta(v, seme, tipo, { id: `ita-${nomeSeme}-${v}` }));
      }
    }
    return carte;
  }

  _creaBurraco() {
    const carte = [];
    for (let copia = 1; copia <= 2; copia++) {
      for (const nomeSeme of Object.keys(SEMI_FRANCESI)) {
        const seme = SEMI_FRANCESI[nomeSeme];
        for (let v = 1; v <= 13; v++) {
          carte.push(new Carta(v, seme, 'francese', { id: `bur-${copia}-${nomeSeme}-${v}` }));
        }
      }
    }
    for (let i = 1; i <= 4; i++) {
      carte.push(new Carta(0, SEME_JOLLY, 'francese', { jolly: true, id: `jolly-${i}` }));
    }
    return carte;
  }

  /** Fisher-Yates: randomizzazione perfetta, in-place. */
  mescolaMazzo() {
    for (let i = this.carte.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.carte[i], this.carte[j]] = [this.carte[j], this.carte[i]];
    }
    return this.carte;
  }

  /**
   * Distribuisce numCarte a numGiocatori.
   * @returns {Array<Array<Carta>>} mani dei giocatori
   */
  distribuisciCarte(numGiocatori, numCarte) {
    const mani = Array.from({ length: numGiocatori }, () => []);
    for (let giro = 0; giro < numCarte; giro++) {
      for (let g = 0; g < numGiocatori; g++) {
        const c = this.carte.pop();
        if (c) mani[g].push(c);
      }
    }
    return mani;
  }

  pesca() { return this.carte.pop() || null; }
  get lunghezza() { return this.carte.length; }
}

/* =====================================================================
 * 4. CLASSE ASTRATTA GiocoBase
 * ===================================================================== */
class GiocoBase {
  constructor(config = {}) {
    if (new.target === GiocoBase) {
      throw new TypeError('GiocoBase è astratta: estenderla in Scopa/Briscola/Burraco.');
    }
    this.tipo = config.tipo;
    this.tipoMazzo = config.tipoMazzo || 'napoletane';
    this.stato = null;
  }

  creaMazzo(tipo, perBurraco = false) { return new Mazzo(tipo, perBurraco); }
  mescolaMazzo() { return this.stato.mazzo.mescolaMazzo(); }
  distribuisciCarte(n, c) { return this.stato.mazzo.distribuisciCarte(n, c); }

  /* Metodi astratti da implementare nelle sottoclassi */
  inizializza() { throw new Error('inizializza() non implementato'); }
  eseguiMossa() { throw new Error('eseguiMossa() non implementato'); }
  validaMossa() { throw new Error('validaMossa() non implementato'); }
  calcolaPunteggio() { throw new Error('calcolaPunteggio() non implementato'); }
  statoSerializzabile() { throw new Error('statoSerializzabile() non implementato'); }
  applicaStato() { throw new Error('applicaStato() non implementato'); }

  /* Utilities condivise di serializzazione (le carte vengono ricostruite) */
  _serieMano(mano) { return mano.map(c => c.serializza()); }
  _deserMano(arr) { return arr.map(c => Carta.daSerializzato(c)); }
}

/* =====================================================================
 * 5. SCOPA (40 carte)
 * ===================================================================== */
class Scopa extends GiocoBase {
  constructor(config = {}) {
    super({ ...config, tipo: 'scopa' });
    this.punteggioTarget = config.punteggioTarget || 11; // partita a 11 (o 16)
  }

  inizializza() {
    const mazzo = this.creaMazzo(this.tipoMazzo, false);
    const mani = mazzo.distribuisciCarte(2, 3);
    const tavolo = [];
    for (let i = 0; i < 4; i++) { const c = mazzo.pesca(); if (c) tavolo.push(c); }
    this.stato = {
      gioco: 'scopa', tipoMazzo: this.tipoMazzo,
      mazzo, mani, tavolo,
      prese: [[], []], scope: [0, 0],
      turno: 0, ultimoPresa: 0,
      fase: 'gioco', // 'gioco' | 'fine'
      vincitore: null,
      punteggi: null
    };
    return this.stato;
  }

  /**
   * Verifica quali carte sul tavolo la carta giocata può prendere.
   * Regole ufficiali: se sul tavolo ci sono carte dello stesso valore si
   * prendono TUTTE (mai la somma). Se non esistono, si valuta la
   * combinazione di 2+ carte la cui somma eguaglia il valore.
   * @returns {{ combinazioni: Array<Array<Carta>>, scopa: boolean }}
   */
  validaPresaScopa(cartaGiocata, carteSulTavolo) {
    const v = cartaGiocata.valore;
    const esiti = { combinazioni: [], scopa: false };
    if (carteSulTavolo.length === 0) {
      esiti.combinazioni.push([]); // nessuna presa possibile
      return esiti;
    }

    // 1) presa singola obbligatoria: con più carte dello stesso valore
    //    si prendono TUTTE (mai la somma con altre carte)
    const singola = carteSulTavolo.filter(c => c.valore === v);
    if (singola.length > 0) {
      esiti.combinazioni.push(singola);
      return esiti;
    }

    // 2) combinazioni di 2+ carte che sommano a v (brute force su <=9 carte)
    const n = carteSulTavolo.length;
    const trovate = [];
    for (let mask = 1; mask < (1 << n); mask++) {
      let somma = 0, cont = 0;
      const idx = [];
      for (let i = 0; i < n; i++) {
        if (mask & (1 << i)) { somma += carteSulTavolo[i].valore; cont++; idx.push(i); }
      }
      if (somma === v && cont >= 2) trovate.push(idx);
    }
    if (trovate.length === 0) {
      esiti.combinazioni.push([]); // nessuna presa: carta resta sul tavolo
      return esiti;
    }
    // Più combinazioni possibili: si ordinano per numero di carte (default)
    trovate.sort((a, b) => b.length - a.length);
    esiti.combinazioni = trovate.map(idxSet => idxSet.map(i => carteSulTavolo[i]));
    return esiti;
  }

  /** Controlla se, dopo una presa, il tavolo è vuoto => Scopa. */
  controllaScopa(carteSulTavolo) {
    return carteSulTavolo.length === 0;
  }

  eseguiMossa(giocatore, cartaId, listaIdPrese = []) {
    const s = this.stato;
    const carta = s.mani[giocatore].find(c => c.id === cartaId);
    if (!carta) throw new Error('Carta non in mano');
    const esito = this.validaPresaScopa(carta, s.tavolo);
    let prese = listaIdPrese.length
      ? listaIdPrese.map(id => s.tavolo.find(c => c.id === id)).filter(Boolean)
      : (esito.combinazioni[0] || []);

    s.mani[giocatore] = s.mani[giocatore].filter(c => c.id !== cartaId);

    if (prese.length === 0) {
      // nessuna presa: la carta resta sul tavolo
      s.tavolo.push(carta);
    } else {
      const presa = [carta, ...prese];
      s.prese[giocatore].push(...presa);
      const idPresa = new Set(presa.map(c => c.id));
      s.tavolo = s.tavolo.filter(c => !idPresa.has(c.id));
    }

    const tavoloVuoto = s.tavolo.length === 0;
    if (tavoloVuoto && !this._ultimoGiro()) {
      s.scope[giocatore]++;
    }
    s.ultimoPresa = giocatore;

    // Ripresa: quando la mano si svuota si pescano 3 carte (se disponibili)
    if (s.mani[giocatore].length === 0 && s.mazzo.lunghezza > 0) {
      const nuove = s.mazzo.distribuisciCarte(1, 3);
      s.mani[giocatore] = nuove[0];
    }

    // Fine gioco: mazzo esaurito e mani vuote
    if (s.mazzo.lunghezza === 0 && s.mani[0].length === 0 && s.mani[1].length === 0) {
      // le carte rimaste sul tavolo vanno a chi ha fatto l'ultima presa
      if (s.tavolo.length > 0) {
        s.prese[s.ultimoPresa].push(...s.tavolo);
        s.tavolo = [];
      }
      s.punteggi = this.calcolaPunteggioFinaleScopa(s.prese[0], s.prese[1], s.scope);
      s.fase = 'fine';
      s.vincitore = s.punteggi.p1.tot === s.punteggi.p2.tot ? null
        : (s.punteggi.p1.tot > s.punteggi.p2.tot ? 0 : 1);
    }

    s.turno = 1 - giocatore;
    return s;
  }

  _ultimoGiro() {
    const s = this.stato;
    return s.mazzo.lunghezza === 0 && s.mani[0].length === 0 && s.mani[1].length === 0;
  }

  /**
   * Calcolo punteggio finale Scopa:
   *  - Settebello (7 di denari)
   *  - Denari  (maggior numero di carte di denari)
   *  - Lungo   (maggior numero di carte totali)
   *  - Primiera (somma dei coefficienti migliori per seme)
   *  - Scope   (punti scopa)
   */
  calcolaPunteggioFinaleScopa(cartePrese1, cartePrese2, scope = [0, 0]) {
    const gruppi = [
      { presi: cartePrese1, lato: 'p1' },
      { presi: cartePrese2, lato: 'p2' }
    ];
    const risultato = {
      p1: { settebello: 0, denari: 0, carte: 0, primiera: 0, scope: scope[0], tot: 0 },
      p2: { settebello: 0, denari: 0, carte: 0, primiera: 0, scope: scope[1], tot: 0 }
    };

    const cntDenari = { p1: 0, p2: 0 };
    const cntCarte = { p1: 0, p2: 0 };
    for (const g of gruppi) {
      const r = risultato[g.lato];
      r.carte = g.presi.length;
      r.settebello = g.presi.some(c => c.valore === 7 && c.seme.nome === 'denari') ? 1 : 0;
      r.denari = g.presi.filter(c => c.seme.nome === 'denari').length;
      r.primiera = this._calcolaPrimiera(g.presi);
      cntDenari[g.lato] = r.denari;
      cntCarte[g.lato] = r.carte;
    }

    const p1 = risultato.p1, p2 = risultato.p2;
    // Il Settebello è unico: chi lo possiede ha 1 punto.
    // (già assegnato nel ciclo; i due valori sono mutuamente esclusivi)

    // Denari: 1 punto a chi ha più carte di denari
    p1.denari = cntDenari.p1 > cntDenari.p2 ? 1 : 0;
    p2.denari = cntDenari.p2 > cntDenari.p1 ? 1 : 0;

    // Lungo (Carte): 1 punto a chi ha più carte totali
    p1.carte = cntCarte.p1 > cntCarte.p2 ? 1 : 0;
    p2.carte = cntCarte.p2 > cntCarte.p1 ? 1 : 0;

    // Primiera: 1 punto a chi ha il coefficiente maggiore
    p1.primiera = p1.primiera > p2.primiera ? 1 : 0;
    p2.primiera = p2.primiera > p1.primiera ? 1 : 0;

    p1.tot = p1.settebello + p1.denari + p1.carte + p1.primiera + p1.scope;
    p2.tot = p2.settebello + p2.denari + p2.carte + p2.primiera + p2.scope;
    return risultato;
  }

  _calcolaPrimiera(cartePrese) {
    const migliori = {};
    for (const c of cartePrese) {
      const s = c.seme.nome;
      if (!migliori[s] || c.puntiPrimiera > migliori[s].punti) {
        migliori[s] = { punti: c.puntiPrimiera };
      }
    }
    const semi = Object.keys(migliori);
    if (semi.length < 4) return 0; // serve almeno una carta per ogni seme
    return semi.reduce((acc, s) => acc + migliori[s].punti, 0);
  }

  statoSerializzabile() {
    const s = this.stato;
    return {
      gioco: s.gioco, tipoMazzo: s.tipoMazzo, turno: s.turno,
      fase: s.fase, vincitore: s.vincitore, punteggi: s.punteggi,
      scope: s.scope, ultimoPresa: s.ultimoPresa,
      mani: [this._serieMano(s.mani[0]), this._serieMano(s.mani[1])],
      prese: [this._serieMano(s.prese[0]), this._serieMano(s.prese[1])],
      tavolo: this._serieMano(s.tavolo),
      mazzoCount: s.mazzo.lunghezza
    };
  }

  applicaStato(data) {
    const mazzo = (this.stato && this.stato.mazzo) ? this.stato.mazzo : new Mazzo(this.tipoMazzo, false);
    this.stato = {
      gioco: 'scopa', tipoMazzo: data.tipoMazzo,
      mazzo, mani: [this._deserMano(data.mani[0]), this._deserMano(data.mani[1])],
      tavolo: this._deserMano(data.tavolo),
      prese: [this._deserMano(data.prese[0]), this._deserMano(data.prese[1])],
      scope: data.scope, turno: data.turno, ultimoPresa: data.ultimoPresa,
      fase: data.fase, vincitore: data.vincitore, punteggi: data.punteggi
    };
  }
}

/* =====================================================================
 * 6. BRISCOLA (40 carte)
 * ===================================================================== */
class Briscola extends GiocoBase {
  constructor(config = {}) {
    super({ ...config, tipo: 'briscola' });
  }

  inizializza() {
    const mazzo = this.creaMazzo(this.tipoMazzo, false);
    const mani = mazzo.distribuisciCarte(2, 3);
    const briscola = mazzo.pesca();
    briscola.coperta = false; // la briscola resta scoperta finché il mazzo non finisce
    this.stato = {
      gioco: 'briscola', tipoMazzo: this.tipoMazzo,
      mazzo, mani, briscola,
      tavolo: [null, null],
      turno: 0, // 0 = gioca per primo
      primoMano: null, // chi ha aperto la mano corrente
      ultimoVincitore: null, // vincitore dell'ultima mano conclusa
      prese: [[], []], punti: [0, 0],
      fase: 'gioco', vincitore: null, punteggi: null
    };
    return this.stato;
  }

  /**
   * Confronta due carte e restituisce il vincitore della mano (0 o 1).
   * Dominanza: briscola batte tutto; a parità di seme vince la carta
   * col punteggio gerarchico maggiore (A=11, 3=10, Re=4, Cav=3, Fan=2,
   * e in caso di doppio zero la prima giocata).
   * @returns {number|null} indice vincitore, null se semi diversi (vince chi ha giocato per primo)
   */
  determinaVincitoreMano(cartaP1, cartaP2, semeBriscola) {
    const nomeBriscola = semeBriscola.nome;
    const b1 = cartaP1.seme.nome === nomeBriscola;
    const b2 = cartaP2.seme.nome === nomeBriscola;
    if (b1 && b2) return cartaP1.puntiBriscola >= cartaP2.puntiBriscola ? 0 : 1;
    if (b1) return 0;
    if (b2) return 1;
    if (cartaP1.seme.nome === cartaP2.seme.nome) {
      return cartaP1.puntiBriscola >= cartaP2.puntiBriscola ? 0 : 1;
    }
    return null; // semi diversi, non briscola: vince chi ha giocato per primo
  }

  /** Somma i punti matematici del mazzo delle prese. */
  calcolaPuntiMazzo(cartePrese) {
    return cartePrese.reduce((acc, c) => acc + c.puntiBriscola, 0);
  }

  eseguiMossa(giocatore, cartaId) {
    const s = this.stato;
    const carta = s.mani[giocatore].find(c => c.id === cartaId);
    if (!carta) throw new Error('Carta non in mano');
    carta.coperta = false;
    s.mani[giocatore] = s.mani[giocatore].filter(c => c.id !== cartaId);
    s.tavolo[giocatore] = carta;
    if (s.tavolo[1 - giocatore] === null) s.primoMano = giocatore; // primo della mano

    // Endgame: mazzo esaurito e avversario senza carte => la carta del
    // leader viene presa direttamente (non c'è risposta possibile).
    const endgameSenzaRisposta =
      s.mazzo.lunghezza === 0 && s.mani[1 - giocatore].length === 0 && s.tavolo[1 - giocatore] === null;

    if (endgameSenzaRisposta) {
      s.prese[giocatore].push(carta);
      s.punti[giocatore] = this.calcolaPuntiMazzo(s.prese[giocatore]);
      s.tavolo[giocatore] = null;
      s.turno = giocatore;
      s.ultimoVincitore = giocatore;
      return this._endgameSeBloccato(s);
    }

    // Se entrambi hanno giocato => risolvi la mano
    if (s.tavolo[0] && s.tavolo[1]) {
      const vincitore = this.determinaVincitoreMano(s.tavolo[0], s.tavolo[1], s.briscola);
      // semi diversi senza briscola: vince chi ha aperto la mano
      const vincente = vincitore === null ? s.primoMano : vincitore;
      s.prese[vincente].push(s.tavolo[0], s.tavolo[1]);
      s.punti[vincente] = this.calcolaPuntiMazzo(s.prese[vincente]);
      s.tavolo = [null, null];
      s.turno = vincente;
      s.ultimoVincitore = vincente;

      // Ripresa finché il mazzo ha carte (vince chi prende, pesca per primo)
      if (s.mazzo.lunghezza > 0) {
        for (let i = 0; i < 2; i++) {
          const pescatore = (vincente + i) % 2;
          const c = s.mazzo.pesca();
          if (c) { c.coperta = true; s.mani[pescatore].push(c); }
        }
      }

      // Fine: mazzo esaurito E mani vuote => la briscola va al vincitore
      // dell'ultima mano.
      const fine = s.mazzo.lunghezza === 0 && s.mani[0].length === 0 && s.mani[1].length === 0;
      if (fine) {
        if (s.briscola) {
          s.prese[vincente].push(s.briscola);
          s.punti[vincente] = this.calcolaPuntiMazzo(s.prese[vincente]); // include la briscola
          s.briscola = null;
        }
        s.punteggi = { p1: s.punti[0], p2: s.punti[1] };
        s.fase = 'fine';
        s.vincitore = s.punti[0] === s.punti[1] ? null : (s.punti[0] > s.punti[1] ? 0 : 1);
      }
    } else {
      s.turno = 1 - giocatore;
    }
    return this._endgameSeBloccato(s);
  }

  /**
   * Endgame: se tocca a un giocatore che non ha carte e il mazzo è
   * esaurito, le carte residue dell'avversario restano all'avversario
   * (non giocate, nessuno può prenderle) e la briscola va al vincitore
   * dell'ultima mano conclusa. Mantiene l'invariante dei 120 punti.
   */
  _endgameSeBloccato(s) {
    if (s.fase === 'fine' || s.mazzo.lunghezza > 0) return s;
    if (s.mani[s.turno].length > 0) return s;

    const altro = 1 - s.turno;
    if (s.mani[altro].length > 0) {
      s.prese[altro].push(...s.mani[altro]);
      s.punti[altro] = this.calcolaPuntiMazzo(s.prese[altro]);
      s.mani[altro] = [];
    }
    const destinatarioBriscola = (s.ultimoVincitore !== null && s.ultimoVincitore !== undefined)
      ? s.ultimoVincitore : altro;
    if (s.briscola) {
      s.prese[destinatarioBriscola].push(s.briscola);
      s.punti[destinatarioBriscola] = this.calcolaPuntiMazzo(s.prese[destinatarioBriscola]);
      s.briscola = null;
    }
    s.punteggi = { p1: s.punti[0], p2: s.punti[1] };
    s.fase = 'fine';
    s.vincitore = s.punti[0] === s.punti[1] ? null : (s.punti[0] > s.punti[1] ? 0 : 1);
    return s;
  }

  validaMossa(giocatore, cartaId) {
    return this.stato.turno === giocatore &&
      this.stato.mani[giocatore].some(c => c.id === cartaId);
  }

  statoSerializzabile() {
    const s = this.stato;
    return {
      gioco: s.gioco, tipoMazzo: s.tipoMazzo, turno: s.turno,
      fase: s.fase, vincitore: s.vincitore, punteggi: s.punteggi,
      punti: s.punti, primoMano: s.primoMano, ultimoVincitore: s.ultimoVincitore,
      briscola: s.briscola ? s.briscola.serializza() : null,
      tavolo: s.tavolo.map(c => c ? c.serializza() : null),
      mani: [this._serieMano(s.mani[0]), this._serieMano(s.mani[1])],
      prese: [this._serieMano(s.prese[0]), this._serieMano(s.prese[1])],
      mazzoCount: s.mazzo.lunghezza
    };
  }

  applicaStato(data) {
    const mazzo = (this.stato && this.stato.mazzo) ? this.stato.mazzo : new Mazzo(this.tipoMazzo, false);
    this.stato = {
      gioco: 'briscola', tipoMazzo: data.tipoMazzo,
      mazzo, mani: [this._deserMano(data.mani[0]), this._deserMano(data.mani[1])],
      briscola: data.briscola ? Carta.daSerializzato(data.briscola) : null,
      tavolo: data.tavolo.map(c => c ? Carta.daSerializzato(c) : null),
      prese: [this._deserMano(data.prese[0]), this._deserMano(data.prese[1])],
      punti: data.punti, turno: data.turno, primoMano: data.primoMano ?? null,
      ultimoVincitore: data.ultimoVincitore ?? null,
      fase: data.fase, vincitore: data.vincitore, punteggi: data.punteggi
    };
  }
}

/* =====================================================================
 * 7. BURRACO (108 carte: 2 mazzi da 52 + 4 jolly)
 * ===================================================================== */
class Burraco extends GiocoBase {
  constructor(config = {}) {
    super({ ...config, tipo: 'burraco' });
    this.tipoMazzo = 'francese'; // il Burraco usa SEMPRE carte da poker (2 mazzi + 4 Jolly)
    this.punteggioTarget = config.punteggioTarget || 2000; // partita a 2000
  }

  inizializza() {
    const mazzo = this.creaMazzo('francese', true); // 108 carte
    const mani = mazzo.distribuisciCarte(2, 11);
    this.stato = {
      gioco: 'burraco', tipoMazzo: 'francese',
      mazzo, mani,
      monte: [],            // scarti (coperti, visibile solo l'ultima)
      combinazioni: [[], []], // liste di combinazioni per giocatore
      burrachi: [0, 0],     // conteggio burrachi (puliti+sporchi)
      punti: [0, 0],        // punti accumulati dalle combinazioni
      turno: 0,
      pozzettoDisponibile: false,
      fase: 'gioco', vincitore: null, punteggi: null
    };
    const prima = mazzo.pesca();
    if (prima) { prima.coperta = false; this.stato.monte.push(prima); }
    return this.stato;
  }

  /* ------------------------- validazioni ------------------------- */

  /**
   * Valida una combinazione calata.
   * - GRUPPO: 3+ carte dello stesso valore, con al più UN jolly O UNA
   *   pinella, almeno 2 carte naturali e, essendoci un doppio mazzo,
   *   al massimo 2 carte per ogni seme.
   * - SEQUENZA: 3+ carte consecutive dello stesso seme, SENZA jolly/pinelle.
   * @returns {{valida: boolean, tipo: 'gruppo'|'sequenza'|null, punti: number, burraco: boolean, pulito: boolean, motivo?: string}}
   */
  validaCombinazione(arrayCarte) {
    const carte = [...arrayCarte].filter(Boolean);
    if (carte.length < 3) {
      return { valida: false, tipo: null, punti: 0, burraco: false, pulito: false, motivo: 'Servono almeno 3 carte' };
    }
    const naturali = carte.filter(c => !c.eJolly && !c.ePinella);
    const jolly = carte.filter(c => c.eJolly);
    const pinelle = carte.filter(c => c.ePinella);
    const selvatiche = jolly.length + pinelle.length;

    if (selvatiche > 1) {
      return { valida: false, tipo: null, punti: 0, burraco: false, pulito: false, motivo: 'Max 1 jolly o 1 pinella per combinazione' };
    }
    if (naturali.length < 2) {
      return { valida: false, tipo: null, punti: 0, burraco: false, pulito: false, motivo: 'Servono almeno 2 carte naturali' };
    }

    const stessoValore = naturali.every(c => c.valore === naturali[0].valore);
    const stessoSeme = naturali.every(c => c.seme.nome === naturali[0].seme.nome);

    if (stessoValore) {
      // gruppo: con il doppio mazzo ogni seme può comparire al più 2 volte
      const contSemi = {};
      for (const c of naturali) contSemi[c.seme.nome] = (contSemi[c.seme.nome] || 0) + 1;
      if (Object.values(contSemi).some(n => n > 2)) {
        return { valida: false, tipo: null, punti: 0, burraco: false, pulito: false, motivo: 'Al massimo 2 carte dello stesso seme nel gruppo' };
      }
      return this._esitoCombinazione(carte, 'gruppo');
    }

    if (stessoSeme && selvatiche === 0) {
      // sequenza: valori consecutivi, senza jolly/pinelle
      const valori = naturali.map(c => c.valore).sort((a, b) => a - b);
      for (let i = 1; i < valori.length; i++) {
        if (valori[i] !== valori[i - 1] + 1) {
          return { valida: false, tipo: null, punti: 0, burraco: false, pulito: false, motivo: 'La sequenza non è consecutiva' };
        }
      }
      return this._esitoCombinazione(carte, 'sequenza');
    }

    return { valida: false, tipo: null, punti: 0, burraco: false, pulito: false, motivo: 'Combinazione non riconosciuta' };
  }

  _esitoCombinazione(carte, tipo) {
    const punti = carte.reduce((acc, c) => acc + c.puntiBurraco, 0);
    const burraco = carte.length >= 7;
    const pulito = burraco && carte.every(c => !c.eJolly && !c.ePinella);
    return { valida: true, tipo, punti, burraco, pulito };
  }

  /**
   * Verifica se una carta può essere attaccata a una combinazione già calata.
   * @param {Carta} carta
   * @param {{carte: Carta[], tipo: string}} combinazioneEsistente
   */
  legaCarta(carta, combinazioneEsistente) {
    const esistente = combinazioneEsistente.carte || combinazioneEsistente;
    const tipo = combinazioneEsistente.tipo || this._tipoDi(esistente);
    if (!tipo) return { valida: false, motivo: 'Combinazione non valida' };

    if (tipo === 'gruppo') {
      const naturali = esistente.filter(c => !c.eJolly && !c.ePinella);
      const selvatiche = esistente.filter(c => c.eJolly || c.ePinella);
      if (carta.eJolly || carta.ePinella) {
        if (selvatiche.length >= 1) return { valida: false, motivo: 'Gruppo già completo di jolly/pinella' };
        return { valida: true };
      }
      if (carta.valore !== naturali[0].valore) return { valida: false, motivo: 'Valore diverso dal gruppo' };
      const doppioni = esistente.filter(c => c.seme.nome === carta.seme.nome).length;
      if (doppioni >= 2) return { valida: false, motivo: 'Già 2 carte dello stesso seme nel gruppo' };
      return { valida: true };
    }

    if (tipo === 'sequenza') {
      if (carta.eJolly || carta.ePinella) return { valida: false, motivo: 'Nelle sequenze niente jolly/pinelle' };
      if (carta.seme.nome !== esistente[0].seme.nome) return { valida: false, motivo: 'Seme diverso' };
      const valori = esistente.map(c => c.valore).sort((a, b) => a - b);
      const min = valori[0], max = valori[valori.length - 1];
      if (carta.valore === min - 1 || carta.valore === max + 1) return { valida: true };
      return { valida: false, motivo: 'La carta non estende la sequenza' };
    }
    return { valida: false, motivo: 'Tipo sconosciuto' };
  }

  _tipoDi(carte) {
    const esito = this.validaCombinazione(carte);
    return esito.valida ? esito.tipo : null;
  }

  /**
   * Gestisce il passaggio al pozzetto e la chiusura finale.
   * @param {Carta[]} manoGiocatore
   * @param {boolean} pozzettoPreso ha appena preso il pozzetto
   * @returns {{puoChiudere: boolean, motivo?: string, puoPrenderePozzetto: boolean}}
   */
  verificaChiusura(manoGiocatore, pozzettoPreso) {
    const s = this.stato;
    const giocatore = s.turno;
    const burracoFatto = s.burrachi[giocatore] >= 1;
    const manoVuota = manoGiocatore.length === 0;
    const pozzettoDisponibile = s.pozzettoDisponibile && s.monte.length > 0;

    if (manoVuota) {
      // mano vuota: per continuare devi prendere il pozzetto; non puoi chiudere
      if (pozzettoDisponibile && !pozzettoPreso) {
        return { puoChiudere: false, puoPrenderePozzetto: true, motivo: 'Mano vuota: prendi il pozzetto per continuare' };
      }
      if (!pozzettoDisponibile) {
        return { puoChiudere: false, puoPrenderePozzetto: false, motivo: 'Mano vuota e pozzetto non disponibile' };
      }
    }

    if (!burracoFatto) {
      return { puoChiudere: false, puoPrenderePozzetto: pozzettoDisponibile && !pozzettoPreso, motivo: 'Devi fare almeno un Burraco per chiudere' };
    }
    if (manoGiocatore.length > 1) {
      return { puoChiudere: false, puoPrenderePozzetto: false, motivo: 'Devi avere 0 carte in mano (dopo lo scarto) per chiudere' };
    }
    if (manoGiocatore.length === 1) {
      // puoi chiudere scartando l'ultima carta
      return { puoChiudere: true, puoPrenderePozzetto: false, motivo: 'Puoi chiudere scartando l\'ultima carta' };
    }
    return { puoChiudere: true, puoPrenderePozzetto: false, motivo: 'Puoi chiudere' };
  }

  /* ------------------------- esecuzione ------------------------- */

  /**
   * Verifica una situazione di stallo: il giocatore di turno non ha carte,
   * il mazzo è esaurito e il monte è vuoto. Il gioco non può proseguire.
   */
  verificaStallo() {
    const s = this.stato;
    if (s.fase !== 'gioco') return false;
    return s.mani[s.turno].length === 0 && s.mazzo.lunghezza === 0 && s.monte.length === 0;
  }

  _stallo() {
    const s = this.stato;
    s.punteggi = { p1: s.punti[0], p2: s.punti[1], stallo: true };
    s.fase = 'fine';
    s.vincitore = s.punti[0] === s.punti[1] ? null : (s.punti[0] > s.punti[1] ? 0 : 1);
    return s;
  }

  pescaDaMazzo(giocatore) {
    const s = this.stato;
    // Pozzetto: quando il mazzo è esaurito, il monte (tranne la carta in
    // cima, che resta come primo scarto) viene girato e diventa il mazzo.
    if (s.mazzo.lunghezza === 0 && s.monte.length > 1) {
      const nuovoMazzo = s.monte.splice(0, s.monte.length - 1).reverse();
      nuovoMazzo.forEach(c => { c.coperta = true; });
      s.mazzo.carte = nuovoMazzo;
    }
    const c = s.mazzo.pesca();
    if (c) { c.coperta = true; s.mani[giocatore].push(c); }
    s.pozzettoDisponibile = false;
    return c;
  }

  pescaDalMonte(giocatore) {
    const s = this.stato;
    if (s.monte.length === 0) return null;
    const c = s.monte.pop();
    c.coperta = false;
    s.mani[giocatore].push(c);
    s.pozzettoDisponibile = false;
    return c;
  }

  /** Prende l'intero pozzetto (monte) quando la mano è vuota. */
  prendiPozzetto(giocatore) {
    const s = this.stato;
    if (s.monte.length === 0) return null;
    const prese = s.monte.splice(0, s.monte.length);
    prese.forEach(c => { c.coperta = true; s.mani[giocatore].push(c); });
    s.pozzettoDisponibile = false;
    return prese;
  }

  calaCombinazione(giocatore, idCarte) {
    const s = this.stato;
    const carte = idCarte.map(id => s.mani[giocatore].find(c => c.id === id)).filter(Boolean);
    const esito = this.validaCombinazione(carte);
    if (!esito.valida) return { ok: false, motivo: esito.motivo };
    s.combinazioni[giocatore].push({ carte, tipo: esito.tipo, punti: esito.punti, burraco: esito.burraco, pulito: esito.pulito });
    if (esito.burraco) s.burrachi[giocatore]++;
    s.punti[giocatore] += esito.punti + (esito.burraco ? (esito.pulito ? 200 : 100) : 0);
    const ids = new Set(carte.map(c => c.id));
    s.mani[giocatore] = s.mani[giocatore].filter(c => !ids.has(c.id));
    // Regola: non si può rimanere senza carte in mano se non chiudendo
    // (la calata stessa può creare il burraco necessario, quindi si valuta
    // il conteggio burrachi DOPO l'aggiunta).
    if (s.mani[giocatore].length === 0 && s.burrachi[giocatore] < 1) {
      // rollback
      s.combinazioni[giocatore].pop();
      if (esito.burraco) s.burrachi[giocatore]--;
      s.punti[giocatore] -= esito.punti + (esito.burraco ? (esito.pulito ? 200 : 100) : 0);
      s.mani[giocatore].push(...carte);
      return { ok: false, motivo: 'Non puoi rimanere senza carte in mano se non chiudi (serve un Burraco)' };
    }
    return { ok: true, esito };
  }

  legaATavolo(giocatore, cartaId, combinazioneIdx) {
    const s = this.stato;
    const combo = s.combinazioni[giocatore][combinazioneIdx];
    if (!combo) return { ok: false, motivo: 'Combinazione inesistente' };
    const carta = s.mani[giocatore].find(c => c.id === cartaId);
    if (!carta) return { ok: false, motivo: 'Carta non in mano' };
    const esito = this.legaCarta(carta, combo);
    if (!esito.valida) return { ok: false, motivo: esito.motivo };
    combo.carte.push(carta);
    combo.punti += carta.puntiBurraco;
    if (combo.carte.length >= 7 && !combo.burraco) {
      combo.burraco = true;
      s.burrachi[giocatore]++;
      s.punti[giocatore] += combo.pulito ? 200 : 100;
    }
    s.mani[giocatore] = s.mani[giocatore].filter(c => c.id !== cartaId);
    // Regola: non si può rimanere senza carte in mano se non chiudendo
    if (s.mani[giocatore].length === 0 && s.burrachi[giocatore] < 1) {
      combo.carte.pop();
      combo.punti -= carta.puntiBurraco;
      if (combo.carte.length < 7 && combo.burraco) {
        combo.burraco = false;
        s.burrachi[giocatore]--;
        s.punti[giocatore] -= combo.pulito ? 200 : 100;
      }
      s.punti[giocatore] -= carta.puntiBurraco;
      s.mani[giocatore].push(carta);
      return { ok: false, motivo: 'Non puoi rimanere senza carte in mano se non chiudi (serve un Burraco)' };
    }
    return { ok: true };
  }

  scarta(giocatore, cartaId) {
    const s = this.stato;
    const carta = s.mani[giocatore].find(c => c.id === cartaId);
    if (!carta) return { ok: false, motivo: 'Carta non in mano' };
    carta.coperta = false;
    s.mani[giocatore] = s.mani[giocatore].filter(c => c.id !== cartaId);
    s.monte.push(carta);
    s.pozzettoDisponibile = true;

    // chiusura
    const chiusura = this.verificaChiusura(s.mani[giocatore], false);
    if (s.mani[giocatore].length === 0 && s.burrachi[giocatore] >= 1) {
      this._chiudi(giocatore);
    }
    s.turno = 1 - giocatore;
    return { ok: true, chiusura };
  }

  _chiudi(giocatore) {
    const s = this.stato;
    const avversario = 1 - giocatore;
    // penalità: carte in mano dell'avversario
    const penalita = s.mani[avversario].reduce((acc, c) => acc + c.puntiBurraco, 0);
    s.punti[giocatore] += 100; // bonus chiusura
    s.punti[avversario] -= penalita;
    s.punteggi = { p1: s.punti[0], p2: s.punti[1], penalita };
    s.fase = 'fine';
    s.vincitore = s.punti[giocatore] >= this.punteggioTarget
      ? giocatore : (s.punti[0] > s.punti[1] ? 0 : 1);
  }

  /* ------------------------- stato ------------------------- */

  statoSerializzabile() {
    const s = this.stato;
    return {
      gioco: s.gioco, tipoMazzo: s.tipoMazzo, turno: s.turno,
      fase: s.fase, vincitore: s.vincitore, punteggi: s.punteggi,
      punti: s.punti, burrachi: s.burrachi, pozzettoDisponibile: s.pozzettoDisponibile,
      mani: [this._serieMano(s.mani[0]), this._serieMano(s.mani[1])],
      monte: this._serieMano(s.monte),
      combinazioni: s.combinazioni.map(lista => lista.map(combo => ({
        tipo: combo.tipo, punti: combo.punti, burraco: combo.burraco, pulito: combo.pulito,
        carte: this._serieMano(combo.carte)
      }))),
      mazzoCount: s.mazzo.lunghezza
    };
  }

  applicaStato(data) {
    this.stato = {
      gioco: 'burraco', tipoMazzo: 'francese',
      mazzo: (this.stato && this.stato.mazzo) ? this.stato.mazzo : new Mazzo('francese', true),
      mani: [this._deserMano(data.mani[0]), this._deserMano(data.mani[1])],
      monte: this._deserMano(data.monte),
      combinazioni: data.combinazioni.map(lista => lista.map(combo => ({
        tipo: combo.tipo, punti: combo.punti, burraco: combo.burraco, pulito: combo.pulito,
        carte: this._deserMano(combo.carte)
      }))),
      burrachi: data.burrachi, punti: data.punti, turno: data.turno,
      pozzettoDisponibile: data.pozzettoDisponibile,
      fase: data.fase, vincitore: data.vincitore, punteggi: data.punteggi
    };
  }
}

/* =====================================================================
 * 8. FACTORY: crea il gioco giusto dal nome
 * ===================================================================== */
function creaGioco(config) {
  switch (config.tipo) {
    case 'scopa': return new Scopa(config);
    case 'briscola': return new Briscola(config);
    case 'burraco': return new Burraco(config);
    default: throw new Error(`Gioco sconosciuto: ${config.tipo}`);
  }
}

/* Esposizione globale (script non-module) */
if (typeof window !== 'undefined') {
  window.Carta = Carta;
  window.Mazzo = Mazzo;
  window.GiocoBase = GiocoBase;
  window.Scopa = Scopa;
  window.Briscola = Briscola;
  window.Burraco = Burraco;
  window.creaGioco = creaGioco;
  window.MAZZI_ITALIANI = MAZZI_ITALIANI;
  window.ELENCO_MAZZI = ELENCO_MAZZI;
  window.SEMI_ITALIANI = SEMI_ITALIANI;
  window.SEMI_FRANCESI = SEMI_FRANCESI;
  window.SEME_JOLLY = SEME_JOLLY;
}