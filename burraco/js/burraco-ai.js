/* =========================================================================
 * burraco-ai.js — Avversario automatico per il Burraco
 *
 * Il bot non modifica mai lo stato: espone solo una funzione che, dato lo
 * stato attuale, propone la PROSSIMA azione del giocatore di turno.
 * L'interfaccia (o i test) la esegue tramite il motore, che resta l'unica
 * autorità sulle regole.
 *
 * Azioni possibili:
 *   { tipo:'pesca',  sorgente:'tallone' | 'monte' }
 *   { tipo:'cala',   ids:[...] }
 *   { tipo:'lega',   indice:n, id:'...' }
 *   { tipo:'scarta', id:'...' }
 *   null  -> il turno è terminato o la partita è finita
 *
 * Lo stesso bot gira sia a due giocatori sia a quattro (a squadre): nelle
 * decisioni tiene conto di TUTTI gli avversari, non solo di quello di turno.
 * ========================================================================= */
(function (root) {
  'use strict';

  const E = root.BurracoEngine ||
    (typeof require !== 'undefined' ? require('./burraco-engine.js') : null);

  const LIVELLI = {
    facile: { saltaCalata: 0.30, rumoreScarto: 6, sogliaCalata: 12, montePrudente: true },
    normale: { saltaCalata: 0.08, rumoreScarto: 2, sogliaCalata: 8, montePrudente: false },
    difficile: { saltaCalata: 0.0, rumoreScarto: 0, sogliaCalata: 5, montePrudente: false }
  };

  function conf(livello) { return LIVELLI[livello] || LIVELLI.normale; }

  /* Generatore casuale sostituibile: nei test permette di riprodurre
   * esattamente la stessa partita. */
  let rng = Math.random;
  function impostaRng(fn) { rng = typeof fn === 'function' ? fn : Math.random; }

  /* ---------------------------------------------------------------------
   * Stima del valore potenziale di una carta nella mano del giocatore
   * ------------------------------------------------------------------- */
  function utilitaPotenziale(carta, mano) {
    if (E.isMatta(carta)) return 12;
    let u = 0;
    let compagni = 0;
    let vicini = 0;
    for (const c of mano) {
      if (c.id === carta.id || E.isMatta(c)) continue;
      if (c.valore === carta.valore) compagni++;
      if (c.seme === carta.seme && Math.abs(c.valore - carta.valore) <= 2) vicini++;
    }
    u += Math.min(compagni, 2) * 3;
    u += Math.min(vicini, 2) * 1.5;
    if (carta.valore === 1) u += 0.5;
    return u;
  }

  /* ---------------------------------------------------------------------
   * Scelta della sorgente da cui pescare
   * ------------------------------------------------------------------- */
  function scegliSorgente(p, g, livello) {
    const s = p.stato;
    if (!s.monte.length) return 'tallone';
    if (!s.tallone.length) return 'monte';

    const c = conf(livello);
    const cima = s.monte[s.monte.length - 1];
    const mano = s.mani[g];
    const melds = s.melds[g];

    /* Monte di una sola carta: è solo uno scambio, quindi conviene prenderlo
     * unicamente se la carta serve subito. Insistere su un monte da una carta
     * con una mano già corta non fa progredire la smazzata. */
    if (s.monte.length === 1) {
      for (const m of melds) if (E.provaLegatura(m, cima)) return 'monte';
      if (mano.length <= 3) return 'tallone';
      if (E.isMatta(cima)) return 'monte';
      let compagni = 0;
      for (const x of mano) {
        if (!E.isMatta(x) && x.valore === cima.valore) compagni++;
      }
      if (compagni >= 2) return 'monte';
      return 'tallone';
    }

    // la carta in cima si lega subito a una combinazione calata: monte
    for (const m of melds) if (E.provaLegatura(m, cima)) return 'monte';

    // è una matta o ha ottimi compagni in mano
    if (utilitaPotenziale(cima, mano) >= 4) return 'monte';

    // monte consistente e mano corta: conviene raccoglierlo
    if (s.monte.length >= 3 && mano.length <= 7) return 'monte';
    if (s.monte.length >= 6) return 'monte';

    // il tallone sta finendo: il monte è l'unico modo per continuare a giocare
    if (s.tallone.length <= 6 && s.monte.length >= 2) return 'monte';

    // se il monte è grande ma non lo vogliamo, meglio non ingolfarsi
    if (c.montePrudente && s.monte.length > 2) return 'tallone';

    return 'tallone';
  }

  /* ---------------------------------------------------------------------
   * Verifica che una mossa lasci il giocatore in uno stato giocabile
   * (specchia i vincoli del motore)
   * ------------------------------------------------------------------- */
  function ammissibile(p, g, idsDaRimuovere, burrachiProiettati) {
    const s = p.stato;
    const squadra = p.squadre ? p.squadre[g] : g;
    const rimossi = new Set(idsDaRimuovere);
    const restanti = s.mani[g].filter(c => !rimossi.has(c.id));
    const burrachi = burrachiProiettati === undefined ? p.contaBurrachi(g) : burrachiProiettati;

    if (restanti.length === 0) {
      if (s.pozzettoPreso[squadra]) return false;
      if (!(s.pozzetti[squadra] || []).length) return false;
      return true;
    }
    if (s.pozzettoPreso[squadra]) {
      if (restanti.every(E.isMatta)) return false;
      if (restanti.length === 1 && burrachi < 1) return false;
    }
    return true;
  }

  /* ---------------------------------------------------------------------
   * Scelta della mossa di gioco (calata o legatura)
   * ------------------------------------------------------------------- */
  function scegliMossa(p, g, livello) {
    const s = p.stato;
    const c = conf(livello);
    const mano = s.mani[g];
    const melds = s.melds[g];
    const burrachiAttuali = p.contaBurrachi(g);
    const opzioni = [];

    /* --- calate --- */
    const candidate = E.suggerisciCombinazioni(mano, 40);
    for (const cand of candidate) {
      const esito = cand.esito;
      const proiettati = burrachiAttuali + (esito.burraco ? 1 : 0);
      if (!ammissibile(p, g, cand.ids, proiettati)) continue;
      let punteggio = esito.punti;
      if (esito.burraco) punteggio += esito.pulito ? 140 : 110;
      punteggio -= esito.matte * 16;              // le matte sono preziose
      punteggio += (cand.ids.length - 3) * 2.5;   // combinazioni lunghe meglio
      if (cand.ids.length === 3 && esito.matte === 0 && esito.punti <= 15) punteggio -= 3;
      opzioni.push({ tipo: 'cala', ids: cand.ids, punteggio: punteggio });
    }

    /* --- legature --- */
    for (let i = 0; i < melds.length; i++) {
      const m = melds[i];
      for (const carta of mano) {
        const prova = E.provaLegatura(m, carta);
        if (!prova) continue;
        const diventeraBurraco = prova.slots.length >= 7 && !m.burraco;
        const proiettati = burrachiAttuali + (diventeraBurraco ? 1 : 0);
        if (!ammissibile(p, g, [carta.id], proiettati)) continue;
        let punteggio = carta.punti + 7;
        if (diventeraBurraco) punteggio += 160;
        if (prova.sostituzione) punteggio += 10;
        punteggio += m.slots.length * 0.6;         // avvicinarsi al burraco
        opzioni.push({ tipo: 'lega', indice: i, id: carta.id, punteggio: punteggio });
      }
    }

    if (!opzioni.length) return null;
    opzioni.sort((a, b) => b.punteggio - a.punteggio);

    // fra opzioni quasi equivalenti scegli a caso: rende il gioco meno prevedibile
    const migliore = opzioni[0];
    if (migliore.punteggio < c.sogliaCalata) return null;
    if (c.saltaCalata > 0 && rng() < c.saltaCalata) return null;

    return migliore.tipo === 'cala'
      ? { tipo: 'cala', ids: migliore.ids }
      : { tipo: 'lega', indice: migliore.indice, id: migliore.id };
  }

  /* ---------------------------------------------------------------------
   * Scelta della carta da scartare
   * ------------------------------------------------------------------- */
  function scegliScarto(p, g, livello) {
    const s = p.stato;
    const c = conf(livello);
    const mano = s.mani[g];
    const melds = s.melds[g];
    /* gli avversari: a quattro giocatori sono due (l'altra squadra) */
    const avversari = p.avversariDi ? p.avversariDi(g) : [1 - g];

    // se possiamo chiudere, chiudiamo subito
    if (mano.length === 1 && p.chiudeCon(g, mano[0].id)) return mano[0].id;

    const scartabili = mano.filter(x => !p.scartoVietato(g, x.id));
    if (!scartabili.length) return null;

    let migliore = null;
    let punteggioMinimo = Infinity;
    for (const carta of scartabili) {
      let u = 0;
      if (E.isMatta(carta)) u += 70;

      let compagni = 0;
      let vicini = 0;
      for (const x of mano) {
        if (x.id === carta.id || E.isMatta(x)) continue;
        if (x.valore === carta.valore) compagni++;
        if (x.seme === carta.seme && Math.abs(x.valore - carta.valore) <= 2) vicini++;
      }
      u += Math.min(compagni, 2) * 7;
      u += Math.min(vicini, 2) * 3.5;

      // la carta si legherebbe a una nostra combinazione: non scartarla
      for (const m of melds) if (E.provaLegatura(m, carta)) { u += 14; break; }

      // la carta servirebbe a un avversario (si legherebbe ai suoi giochi)
      for (const avv of avversari) {
        for (const m of s.melds[avv]) if (E.provaLegatura(m, carta)) { u += 18; break; }
      }

      // scartare carte di valore alto è costoso se un avversario chiude
      u += carta.punti * 0.4;

      if (c.rumoreScarto) u += rng() * c.rumoreScarto;

      if (u < punteggioMinimo) { punteggioMinimo = u; migliore = carta; }
    }
    return migliore ? migliore.id : scartabili[0].id;
  }

  /* ---------------------------------------------------------------------
   * API pubblica
   * ------------------------------------------------------------------- */
  /**
   * Propone la prossima azione per il giocatore di turno.
   * @param {BurracoEngine.Partita} p
   * @param {string} [livello] 'facile' | 'normale' | 'difficile'
   * @param {boolean} [soloScarto] se true propone direttamente lo scarto
   */
  function prossimaAzione(p, livello, soloScarto) {
    const s = p.stato;
    if (!s || s.finita) return null;
    const g = s.turno;

    if (s.fase === 'pesca') {
      return { tipo: 'pesca', sorgente: scegliSorgente(p, g, livello) };
    }
    if (!soloScarto) {
      const mossa = scegliMossa(p, g, livello);
      if (mossa) return mossa;
    }
    const id = scegliScarto(p, g, livello);
    if (id === null) return null;
    return { tipo: 'scarta', id: id };
  }

  /** Esegue l'azione proposta direttamente sul motore. */
  function eseguiAzione(p, azione) {
    if (!azione) return { ok: false, motivo: 'Nessuna azione' };
    switch (azione.tipo) {
      case 'pesca':
        return azione.sorgente === 'monte' ? p.prendiMonte() : p.pescaTallone();
      case 'cala': return p.cala(azione.ids);
      case 'lega': return p.lega(azione.indice, azione.id);
      case 'scarta': return p.scarta(azione.id);
      default: return { ok: false, motivo: 'Azione sconosciuta: ' + azione.tipo };
    }
  }

  /**
   * Gioca un intero turno del bot.
   * @returns {Array} elenco delle azioni eseguite (per log/animazione)
   */
  function giocaTurno(p, livello) {
    const azioni = [];
    const gIniziale = p.stato.turno;
    let guardia = 0;
    while (guardia++ < 60) {
      const s = p.stato;
      if (s.finita) break;
      if (s.turno !== gIniziale) break;
      let azione = prossimaAzione(p, livello);
      if (!azione) break;
      let esito = eseguiAzione(p, azione);
      if (!esito.ok) {
        // la proposta è stata rifiutata: ripiega sullo scarto
        azione = prossimaAzione(p, livello, true);
        if (!azione) break;
        esito = eseguiAzione(p, azione);
        if (!esito.ok) break;
      }
      azioni.push(azione);
      if (azione.tipo === 'scarta') break;
    }
    return azioni;
  }

  const API = {
    LIVELLI: Object.keys(LIVELLI),
    prossimaAzione: prossimaAzione,
    eseguiAzione: eseguiAzione,
    giocaTurno: giocaTurno,
    scegliScarto: scegliScarto,
    scegliSorgente: scegliSorgente,
    scegliMossa: scegliMossa,
    impostaRng: impostaRng
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.BurracoAI = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
