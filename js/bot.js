/* =====================================================================
 * bot.js — Intelligenza Artificiale locale (Single Player).
 * Funzioni decisionali PURE: nessuna libreria esterna, nessuno stato
 * globale. Il bot ragiona sulle stesse regole di engine.js.
 * ===================================================================== */
'use strict';

/* Istanza condivisa per le sole valutazioni Burraco (nessuna stato) */
const _burracoHelper = new Burraco();

const Bot = {
  /**
   * mossaBotScopa(manoBot, tavolo, engine)
   * Sceglie la carta e l'eventuale presa per il massimo vantaggio.
   * Priorità (euristica):
   *   1. Fare Scopa (tavolo vuoto dopo la presa)
   *   2. Prendere il Settebello (7 di denari)
   *   3. Prendere carte di Denari (per il punto Denari)
   *   4. Prendere carte ad alto coefficiente Primiera
   *   5. Se non prende nulla: giocare una carta "sicura" che non lasci
   *      all'avversario la possibilità di fare Scopa al turno successivo.
   * @returns {{ carta: Carta, prese: Carta[], punteggio: number }}
   */
  mossaBotScopa(manoBot, tavolo, engine) {
    let migliore = null;

    for (const carta of manoBot) {
      const esito = engine.validaPresaScopa(carta, tavolo);
      const opzioni = esito.combinazioni; // lista di combinazioni candidate

      for (const combinazione of opzioni) {
        let score = this._valutaPresaScopa(carta, combinazione, tavolo, manoBot);
        if (combinazione.length === 0) {
          // Nessuna presa: valuta se la carta è "sicura"
          score += this._valutaCartaSicuraScopa(carta, tavolo);
        } else {
          // Simula il tavolo dopo la presa: scopa?
          const restanti = tavolo.filter(t => !combinazione.some(p => p.id === t.id));
          if (restanti.length === 0 && engine.controllaScopa(restanti)) {
            score += 1000; // SCOPA
          }
        }
        if (!migliore || score > migliore.punteggio) {
          migliore = { carta, prese: combinazione, punteggio: score };
        }
      }
    }
    return migliore;
  },

  _valutaPresaScopa(carta, combinazione, tavolo) {
    let score = 0;
    if (combinazione.length === 0) return score;
    for (const c of combinazione) {
      if (c.valore === 7 && c.seme.nome === 'denari') score += 150;   // Settebello
      if (c.seme.nome === 'denari') score += 25;                       // Denari
      score += c.puntiPrimiera / 4;                                    // Primiera
    }
    // preferiamo prendere con una carta "scarsa" (non sprecare figure/assi)
    if (carta.puntiPrimiera <= 12) score += 10;
    // non regalare prese: la presa toglie carte dal tavolo (buono)
    score += combinazione.length * 5;
    return score;
  },

  /**
   * "Carta sicura": giocarla NON deve creare una situazione in cui
   * l'avversario, al turno successivo, può fare Scopa o prendere carte
   * preziose con una sola carta.
   */
  _valutaCartaSicuraScopa(carta, tavolo) {
    let score = 0;
    // 1) Evita di giocare un valore che esiste già sul tavolo:
    //    l'avversario potrebbe prendere la nostra carta facilmente.
    const stessoValore = tavolo.some(t => t.valore === carta.valore);
    if (stessoValore) score -= 60;

    // 2) Controlla che la nostra carta non completi una somma "pericolosa":
    //    per ogni coppia/terna sul tavolo la cui somma + carta = valore X
    //    con X presente in mano all'avversario (sconosciuta): stima di rischio
    const valoriTavolo = tavolo.map(t => t.valore);
    const somme = this._tutteLeSomme(valoriTavolo);
    const pericolose = somme.filter(s => s + carta.valore <= 10 && s + carta.valore >= 2);
    score -= pericolose.length * 15;

    // 3) Preferisci "scaricare" carte poco preziose
    score -= carta.puntiPrimiera / 2;

    // 4) Se il tavolo ha carte preziose (settebello o 6) evitiamo di
    //    lasciare la somma esatta per l'avversario
    const prezioso = tavolo.some(t => (t.valore === 7 && t.seme.nome === 'denari') || t.valore === 6);
    if (prezioso && carteValidePerScopa(tavolo, carta).length === 0) {
      // carta che non può essere presa neanche dall'avversario => ottima
      score += 30;
    }
    return score;
  },

  _tutteLeSomme(valori) {
    const n = valori.length;
    const somme = new Set();
    for (let mask = 1; mask < (1 << n); mask++) {
      let s = 0, cont = 0;
      for (let i = 0; i < n; i++) if (mask & (1 << i)) { s += valori[i]; cont++; }
      if (cont >= 2) somme.add(s);
    }
    return [...somme];
  },

  /* -----------------------------------------------------------------
   * mossaBotBriscola(manoBot, cartaAvversaria, briscola, carteGiocate)
   * -----------------------------------------------------------------
   * - Se gioca PER SECONDO (cartaAvversaria presente):
   *     * Se può vincere spendendo poco, vince ("strozza" solo se
   *       l'avversario ha giocato una carta di valore).
   *     * Se non conviene vincere, "liscia" sacrificando la carta da
   *       meno punti possibile.
   * - Se gioca PER PRIMO:
   *     * Gioca la carta a minor rischio: seme corto, basso valore.
   * @returns {Carta} la carta da giocare
   */
  mossaBotBriscola(manoBot, cartaAvversaria, briscola, carteGiocate) {
    if (!cartaAvversaria) {
      // --- gioca per primo ---
      return this._giocaPerPrimo(manoBot, briscola);
    }
    return this._giocaPerSecondo(manoBot, cartaAvversaria, briscola, carteGiocate);
  },

  _giocaPerPrimo(manoBot, briscola) {
    const nomeBriscola = briscola.nome;
    const normali = manoBot.filter(c => c.seme.nome !== nomeBriscola);
    const briscole = manoBot.filter(c => c.seme.nome === nomeBriscola);

    if (normali.length > 0) {
      // meno rischioso: carta di punto 0 o basso, di un seme "corto"
      return normali
        .slice()
        .sort((a, b) => a.puntiBriscola - b.puntiBriscola || a.puntiPrimiera - b.puntiPrimiera)[0];
    }
    // ha solo briscole: gioca la più piccola
    return briscole.slice().sort((a, b) => a.puntiBriscola - b.puntiBriscola)[0];
  },

  _giocaPerSecondo(manoBot, cartaAvversaria, briscola, carteGiocate) {
    const nomeBriscola = briscola.nome;
    const puoVincereCon = this._carteCheBattono(manoBot, cartaAvversaria, nomeBriscola);

    if (cartaAvversaria.seme.nome === nomeBriscola) {
      // avversario ha giocato briscola: conviene vincere solo se la
      // nostra briscola è più forte e il gioco lo richiede
      if (puoVincereCon.length > 0) {
        // strozza con la briscola minima che vince
        return puoVincereCon.sort((a, b) => a.puntiBriscola - b.puntiBriscola)[0];
      }
      // altrimenti lisciamo con la carta da meno punti
      return this._cartaDaScaricare(manoBot, cartaAvversaria, nomeBriscola);
    }

    if (puoVincereCon.length > 0 && cartaAvversaria.puntiBriscola >= 4) {
      // l'avversario ha giocato una carta di valore: conviene prendere
      return puoVincereCon.sort((a, b) => a.puntiBriscola - b.puntiBriscola)[0];
    }

    if (puoVincereCon.length > 0) {
      // avversario ha giocato carta bassa: vinciamo solo con la carta
      // più economica possibile, altrimenti lisciamo
      const economica = puoVincereCon.sort((a, b) => a.puntiBriscola - b.puntiBriscola)[0];
      if (economica.puntiBriscola <= 2) return economica;
    }

    // lisciare: sacrifica la carta da meno punti (0 punti se possibile)
    return this._cartaDaScaricare(manoBot, cartaAvversaria, nomeBriscola);
  },

  _carteCheBattono(mano, cartaAvversaria, nomeBriscola) {
    const bA = cartaAvversaria.seme.nome === nomeBriscola;
    return mano.filter(c => {
      const bC = c.seme.nome === nomeBriscola;
      if (bA && !bC) return false;
      if (!bA && bC) return true;            // briscola batte
      if (c.seme.nome !== cartaAvversaria.seme.nome) return false; // seme diverso non batte
      return c.puntiBriscola >= cartaAvversaria.puntiBriscola;
    });
  },

  _cartaDaScaricare(mano, cartaAvversaria, nomeBriscola) {
    return mano
      .slice()
      .filter(c => c.seme.nome !== nomeBriscola || true)
      .sort((a, b) => a.puntiBriscola - b.puntiBriscola || a.puntiPrimiera - b.puntiPrimiera)[0] ||
      mano[0];
  },

  /* -----------------------------------------------------------------
   * mossaBotBurraco(manoBot, combinazioniTavolo, monteScarti, engine)
   * -----------------------------------------------------------------
   * 1. Valuta se il valore della carta in cima al monte è utile per
   *    aprire nuovi giochi o legare a combinazioni esistenti.
   * 2. In caso positivo pesca dal monte, altrimenti dal mazzo.
   * 3. Cala tutto il possibile (prima le combinazioni migliori, poi
   *    lega le carte).
   * 4. Scarta la carta meno utile.
   * @returns {{
   *   pescaDaMonte: boolean,
   *   calate: Array<Array<string>>,   // id carte calate
   *   legate: Array<{cartaId:string, indice:number}>,
   *   scartoId: string
   * }}
   */
  mossaBotBurraco(manoBot, combinazioniTavolo, monteScarti, engine) {
    const decisione = { pescaDaMonte: false, calate: [], legate: [], scartoId: null };

    // --- 1) valutazione monte ---
    const cima = monteScarti && monteScarti.length ? monteScarti[monteScarti.length - 1] : null;
    if (cima) {
      const utilita = this._utilitaCartaMonte(cima, manoBot, combinazioniTavolo);
      // il monte conviene se la carta apre un nuovo gioco valido o lega
      decisione.pescaDaMonte = utilita >= 1;
    }

    // --- 2) calata di tutto il possibile ---
    const lavoro = manoBot.slice();
    const calate = [];
    const usate = new Set();

    // 2a) gruppi di stesso valore (con jolly/pinella se utile)
    const perValore = this._raggruppaPerValore(lavoro);
    for (const gruppo of perValore) {
      const esito = engine.validaCombinazione(gruppo.carte);
      if (esito.valida) {
        calate.push(gruppo.carte.map(c => c.id));
        gruppo.carte.forEach(c => usate.add(c.id));
      }
    }

    // 2b) sequenze dello stesso seme
    const perSeme = this._raggruppaPerSeme(lavoro.filter(c => !usate.has(c.id)));
    for (const seq of perSeme) {
      const esito = engine.validaCombinazione(seq.carte);
      if (esito.valida) {
        calate.push(seq.carte.map(c => c.id));
        seq.carte.forEach(c => usate.add(c.id));
      }
    }

    // 2c) lega carte alle combinazioni già sul tavolo
    const rimaste = lavoro.filter(c => !usate.has(c.id));
    const legate = [];
    for (const carta of rimaste) {
      let trovato = false;
      for (let i = 0; i < combinazioniTavolo.length && !trovato; i++) {
        const esito = engine.legaCarta(carta, combinazioniTavolo[i]);
        if (esito.valida) { legate.push({ cartaId: carta.id, indice: i }); trovato = true; }
      }
      if (trovato) usate.add(carta.id);
    }

    // --- 4) scarto della carta meno utile ---
    const daScartare = lavoro.filter(c => !usate.has(c.id));
    const scarto = daScartare.length
      ? daScartare.sort((a, b) => a.puntiBurraco - b.puntiBurraco ||
          this._utilitaCartaInMano(a) - this._utilitaCartaInMano(b))[0]
      : null;

    decisione.calate = calate;
    decisione.legate = legate;
    decisione.scartoId = scarto ? scarto.id : null;
    return decisione;
  },

  _raggruppaPerValore(mano) {
    const mappa = new Map();
    for (const c of mano) {
      const chiave = c.eJolly || c.ePinella ? 'selvatica' : String(c.valore);
      if (!mappa.has(chiave)) mappa.set(chiave, { chiave, carte: [] });
      mappa.get(chiave).carte.push(c);
    }
    const lista = [...mappa.values()];
    // se c'è un solo gruppo selvatico, proviamo ad agganciarlo al gruppo
    // naturale più numeroso (manca la logica di assegnazione del valore:
    // qui l'engine la validerà solo se il gruppo è già valido).
    return lista.map(g => ({ ...g, carte: g.carte })).filter(g => g.carte.length >= 3);
  },

  _raggruppaPerSeme(mano) {
    const mappa = new Map();
    for (const c of mano) {
      if (c.eJolly || c.ePinella) continue; // mai in sequenza
      if (!mappa.has(c.seme.nome)) mappa.set(c.seme.nome, []);
      mappa.get(c.seme.nome).push(c);
    }
    const liste = [];
    for (const lista of mappa.values()) {
      const ordinate = lista.slice().sort((a, b) => a.valore - b.valore);
      // spezza in blocchi consecutivi
      let blocco = [ordinate[0]];
      for (let i = 1; i < ordinate.length; i++) {
        if (ordinate[i].valore === ordinate[i - 1].valore + 1) blocco.push(ordinate[i]);
        else { if (blocco.length >= 3) liste.push({ carte: blocco }); blocco = [ordinate[i]]; }
      }
      if (blocco.length >= 3) liste.push({ carte: blocco });
    }
    return liste;
  },

  /** Utilità della carta in cima al monte: 2 = lega, 1 = apre nuovo gioco, 0 = inutile */
  _utilitaCartaMonte(carta, mano, combinazioniTavolo) {
    if (!carta) return 0;
    // lega a combinazioni esistenti?
    for (const combo of combinazioniTavolo) {
      const esito = _burracoHelper.legaCarta(carta, combo);
      if (esito.valida) return 2;
    }
    // forma un gruppo con carte in mano?
    const uguali = mano.filter(c => c.valore === carta.valore && !c.eJolly);
    if (uguali.length >= 2) return 1;
    // forma una sequenza con carte in mano?
    const stessoSeme = mano.filter(c => c.seme.nome === carta.seme.nome && !c.eJolly && !c.ePinella)
      .map(c => c.valore);
    if (stessoSeme.includes(carta.valore - 1) && stessoSeme.includes(carta.valore + 1)) return 1;
    if (stessoSeme.includes(carta.valore - 1) && stessoSeme.includes(carta.valore - 2)) return 1;
    if (stessoSeme.includes(carta.valore + 1) && stessoSeme.includes(carta.valore + 2)) return 1;
    return 0;
  },

  /** Utilità di una carta in mano (per decidere lo scarto) */
  _utilitaCartaInMano(carta) {
    if (carta.eJolly) return 100;      // mai scartare un jolly
    if (carta.ePinella) return 60;     // mai scartare una pinella
    return carta.puntiBurraco;
  }
};

/* Helper locale (usato da Scopa): carte che con una singola mossa
 * dell'avversario potrebbero prendere qualcosa dal tavolo attuale. */
function carteValidePerScopa(tavolo, cartaAppenaGiocata) {
  const validi = [];
  for (const c of tavolo) {
    const esito = new Scopa({ tipoMazzo: 'napoletane' }).validaPresaScopa(c, tavolo.concat([cartaAppenaGiocata]));
    if (esito.combinazioni.some(comb => comb.length > 0)) validi.push(c);
  }
  return validi;
}

/* Esposizione globale */
if (typeof window !== 'undefined') {
  window.Bot = Bot;
}