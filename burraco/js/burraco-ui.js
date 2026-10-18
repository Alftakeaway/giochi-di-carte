/* =========================================================================
 * burraco-ui.js — Interfaccia del tavolo da Burraco
 * Si appoggia a BurracoEngine (regole) e BurracoAI (avversario).
 * ========================================================================= */
(function () {
  'use strict';

  const E = window.BurracoEngine;
  const AI = window.BurracoAI;

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.prototype.slice.call(document.querySelectorAll(sel));

  /* =====================================================================
   * STATO DELL'INTERFACCIA
   * ===================================================================== */
  const ui = {
    partita: null,
    config: { modo: 'cpu', livello: 'normale', target: 2005, giocatori: 2, nomi: ['Tu', 'Computer'] },
    selezione: new Set(),
    manoVisibile: 0,
    botInCorso: false,
    attesaConsegna: false,
    ultimaMossa: null,
    messaggio: '',
    animazione: true,
    spostamento: null,     // carta di una combinazione scelta per essere spostata
    trascinamento: null,   // trascinamento in corso
    sopprimiClic: false,   // evita che il click dopo un drag selezioni una carta
    ordineMano: 'combinazioni'
  };

  const SEME_ORDINE = { cuori: 0, quadri: 1, fiori: 2, picche: 3 };

  /* =====================================================================
   * UTILITÀ
   * ===================================================================== */
  function notifica(testo, tipo, durata) {
    const box = $('#notifiche');
    if (!box) return;
    /* niente duplicati: se lo stesso avviso è già a schermo non lo si ripete */
    const uguali = Array.prototype.filter.call(box.children, function (n) {
      return n.textContent === testo;
    });
    if (uguali.length) {
      uguali.forEach(function (n) { box.removeChild(n); });
      /* lo si rimette in cima, così resta visibile per l'intera durata */
    }
    /* al massimo due avvisi contemporanei: la colonna è stretta */
    while (box.children.length >= 2) box.removeChild(box.firstChild);
    const el = document.createElement('div');
    el.className = 'notifica' + (tipo ? ' ' + tipo : '');
    el.textContent = testo;
    box.appendChild(el);
    setTimeout(function () {
      el.style.transition = 'opacity .25s, transform .25s';
      el.style.opacity = '0';
      el.style.transform = 'translateY(-8px)';
      setTimeout(function () { el.remove(); }, 260);
    }, durata || 2400);
  }

  /* Aggiorna la riga di testo al centro del tavolo (usata per le azioni
   * dell'avversario, meno invadente delle notifiche). */
  function stato(testo) { ui.messaggio = testo; $('#log-mosse').textContent = testo; }

  function pausa(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  /* "1 carta" / "3 carte": il singolare conta. */
  function carte(n) { return n + ' cart' + (n === 1 ? 'a' : 'e'); }

  /* Il meno tipografico al posto del trattino. */
  function num(v) { return String(v).replace('-', '−'); }

  function nomeGiocatore(g) { return ui.config.nomi[g] || ('Giocatore ' + (g + 1)); }

  /* Nome della squadra (a quattro giocatori). A due giocatori la squadra
   * coincides con il giocatore. */
  function nomeSquadra(t) {
    if (ui.partita && ui.partita.nGioc === 4) {
      const mia = ui.partita.squadre.indexOf(t);
      const altri = [];
      for (let g = 0; g < ui.partita.nGioc; g++) {
        if (ui.partita.squadre[g] === t && g !== mia) altri.push(nomeGiocatore(g));
      }
      return (t === 0 ? 'Voi' : 'Loro') + ' (' + nomeGiocatore(mia) +
        (altri.length ? ' + ' + altri.join(' + ') : '') + ')';
    }
    return nomeGiocatore(t);
  }

  /* Il giocatore locale si chiama "Tu": per lui i verbi vanno alla seconda
   * persona, per gli altri alla terza. */
  function frase(g, terzaPersona, secondaPersona) {
    const locale = ui.config.modo === 'cpu' && g === ui.manoVisibile;
    return locale ? secondaPersona : nomeGiocatore(g) + ' ' + terzaPersona;
  }

  /* Ordina la mano per seme e valore (i jolly in fondo). */
  function perSemeEValore(a, b) {
    if (a.jolly !== b.jolly) return a.jolly ? 1 : -1;
    const sa = SEME_ORDINE[a.seme] === undefined ? 9 : SEME_ORDINE[a.seme];
    const sb = SEME_ORDINE[b.seme] === undefined ? 9 : SEME_ORDINE[b.seme];
    if (sa !== sb) return sa - sb;
    return a.valore - b.valore;
  }

  /* Ordinamento «per numero»: asso, 2, 3 … re; a parità di valore si
   * raccolgono i semi nello stesso ordine. I jolly chiudono la fila. */
  function perValoreESeme(a, b) {
    if (a.jolly !== b.jolly) return a.jolly ? 1 : -1;
    if (a.valore !== b.valore) return a.valore - b.valore;
    const sa = SEME_ORDINE[a.seme] === undefined ? 9 : SEME_ORDINE[a.seme];
    const sb = SEME_ORDINE[b.seme] === undefined ? 9 : SEME_ORDINE[b.seme];
    return sa - sb;
  }

  /* Dispone la mano in blocchi: prima le combinazioni che si possono già
   * calare (tris e scale, con le matte al posto giusto), poi le carte
   * sciolte. Serve a vedere a colpo d'occhio cosa si ha in mano. */
  function raggruppaMano(carte) {
    /* «per numero» e «per seme» sono ordinamenti semplici: un unico blocco */
    if (ui.ordineMano === 'numero') {
      return [{ carte: carte.slice().sort(perValoreESeme), tipo: 'resto', punti: 0 }];
    }
    if (ui.ordineMano === 'seme') {
      return [{ carte: carte.slice().sort(perSemeEValore), tipo: 'resto', punti: 0 }];
    }
    const sciolte = carte.slice().sort(perSemeEValore);

    let proposte = [];
    try { proposte = E.suggerisciCombinazioni(carte, 80) || []; } catch (e) { proposte = []; }

    /* prima le combinazioni più lunghe: un burraco potenziale vale più di
     * una coppia con la matta */
    proposte.sort(function (a, b) {
      return (b.ids.length - a.ids.length) || (b.esito.punti - a.esito.punti);
    });

    const usate = new Set();
    const blocchi = [];
    for (const pr of proposte) {
      if (!pr.ids || pr.ids.length < 3) continue;
      if (pr.ids.some(function (id) { return usate.has(id); })) continue;
      /* l'ordine buono è quello dei posti calcolati dal motore: la matta
       * finisce dove rappresenta il valore, non in testa */
      const idsOrdinati = (pr.esito.slots && pr.esito.slots.length === pr.ids.length)
        ? pr.esito.slots.map(function (sl) { return sl.carta.id; })
        : pr.ids;
      const gruppo = idsOrdinati.map(function (id) {
        return carte.find(function (c) { return c.id === id; });
      }).filter(Boolean);
      if (gruppo.length < 3) continue;
      pr.ids.forEach(function (id) { usate.add(id); });
      blocchi.push({ carte: gruppo, tipo: pr.esito.tipo, punti: pr.esito.punti });
    }

    blocchi.sort(function (a, b) {
      return (b.punti - a.punti) || (b.carte.length - a.carte.length);
    });

    const resto = sciolte.filter(function (c) { return !usate.has(c.id); });
    if (resto.length) blocchi.push({ carte: resto, tipo: 'resto', punti: 0 });
    if (!blocchi.length) return [{ carte: sciolte, tipo: 'resto', punti: 0 }];
    return blocchi;
  }

  function ordinaMano(carte) {
    return raggruppaMano(carte).reduce(function (acc, b) { return acc.concat(b.carte); }, []);
  }

  /* =====================================================================
   * COSTRUZIONE ELEMENTI
   * ===================================================================== */
  /* Le facce delle carte sono immagini di un mazzo di dominio pubblico
   * (Wikimedia Commons, categoria «Public domain playing cards», CC0:
   * utilizzo libero anche commerciale, senza attribuzione). Sono fornite in
   * JXL (formato principale, più leggero) con ripiego WebP per i browser
   * che non lo decodificano ancora: il <picture> sceglie quello giusto. */
  const NOME_FILE_RANGO = { 1: 'Ace', 11: 'Jack', 12: 'Queen', 13: 'King' };
  const NOME_FILE_SEME = { cuori: 'Hearts', quadri: 'Diamonds', fiori: 'Clubs', picche: 'Spades' };

  /* Percorso senza estensione dell'immagine che rappresenta la carta.
   * Una matta calata mostra la carta che rappresenta (valore e seme
   * passati nelle opzioni), non il 2 o il jolly che è in realtà. */
  function fileFaccia(carta, o) {
    if (carta.jolly) return 'img/carte/Joker_red';
    const valore = (o && o.wild && o.valoreRappresentato) ? o.valoreRappresentato : carta.valore;
    const seme = (o && o.seme) || carta.seme;
    const r = NOME_FILE_RANGO[valore] || String(valore);
    return 'img/carte/' + r + '_of_' + (NOME_FILE_SEME[seme] || 'Spades');
  }

  /* Nomignolo per il jolly: due mazzi, jolly rossi e neri alternati, come
   * in un mazzo vero (le carte jolly del motore si chiamano j0…j3). */
  function fileJolly(carta) {
    const ultima = carta.id.charAt(carta.id.length - 1);
    return 'img/carte/Joker_' + (ultima === '1' || ultima === '3' ? 'black' : 'red');
  }

  /* Il <picture> con la faccia della carta. */
  function facciaHtml(percorso, alt) {
    return '<picture>' +
      '<source type="image/jxl" srcset="' + percorso + '.jxl">' +
      '<img class="faccia" src="' + percorso + '.webp" alt="' + escapeHtml(alt || '') + '" draggable="false">' +
      '</picture>';
  }

  /* Velo viola: dice «questa carta è una matta» (jolly o pinella) senza
   * coprire nulla, a differenza del vecchio bollino MATTA. */
  function veloMatta() { return '<span class="velo-matta"></span>'; }

  function creaCartaEl(carta, opzioni) {
    const o = opzioni || {};
    const el = document.createElement('div');
    el.className = 'carta' + (carta.jolly ? ' jolly' : '') + (carta.rossa ? ' rossa' : '');
    el.dataset.id = carta.id;

    if (o.coperta) {
      el.classList.add('coperta');
      el.innerHTML = facciaHtml('img/carte/retro', 'Carta coperta');
      if (o.titolo) el.title = o.titolo;
      return el;
    }

    if (o.wild && o.valoreRappresentato) {
      /* matta dentro una combinazione: mostra la carta che rappresenta,
       * con il velo viola che la distingue dalle carte naturali */
      el.classList.add('matta-figurata');
      const alt = (carta.nomeLungo || 'Matta') + ' che vale come ' +
        (E.RANGO_CORTO[o.valoreRappresentato] || o.valoreRappresentato) +
        (E.SIMBOLO[o.seme] || '');
      el.innerHTML = facciaHtml(fileFaccia(carta, o), alt) + veloMatta();
      if (o.titolo) el.title = o.titolo;
      return el;
    }

    if (carta.jolly) {
      el.classList.add('matta');
      el.innerHTML = facciaHtml(fileJolly(carta), 'Jolly') + veloMatta();
      if (o.titolo) el.title = o.titolo;
      return el;
    }

    if (carta.valore === 2) el.classList.add('matta');
    el.innerHTML = facciaHtml(fileFaccia(carta, o), carta.nomeLungo || '') +
      (carta.valore === 2 ? veloMatta() : '');
    if (o.titolo) el.title = o.titolo;
    return el;
  }

  /* =====================================================================
   * RENDERING
   * ===================================================================== */
  function render() {
    renderBase();
    evidenziaTarget();
  }

  function renderBase() {
    const p = ui.partita;
    if (!p) return;
    const s = p.stato;

    $('#tavolo').hidden = false;
    $('#schermata-avvio').hidden = true;

    renderPunteggi();
    renderTurno();
    renderAvversario();
    renderCentro();
    renderMelds();
    renderMano();
    if (window.BurracoApproved && document.getElementById('turno-badge')) $('#tavolo .barra-superiore').appendChild($('#turno-badge'));
    renderAzioni();

    $('#log-mosse').textContent = ui.messaggio ||
      (s.log && s.log.length ? s.log[s.log.length - 1] : '');
    if (window.BurracoApproved) window.BurracoApproved.decorate(p, ui);
  }

  function renderPunteggi() {
    const p = ui.partita;
    const s = p.stato;
    const box = $('#punteggi');
    box.innerHTML = '';
    if (p.nGioc === 4) {
      /* a squadre: due riquadri, uno per squadra */
      const tSq = p.totaliSquadra();
      for (let t = 0; t < 2; t++) {
        const el = document.createElement('div');
        el.className = 'punteggio-box' + (s.turno !== null && p.squadre[s.turno] === t && !s.finita ? ' attivo' : '');
        let delta = '';
        const pu = s.punteggiUltima;
        if (pu && !pu.annullata && pu.punti) {
          let d = 0;
          for (let g = 0; g < p.nGioc; g++) if (p.squadre[g] === t) d += pu.punti[g];
          delta = '<span class="delta ' + (d >= 0 ? 'positivo' : 'negativo') +
            '" title="Punti dell\'ultima smazzata">(' + (d >= 0 ? '+' : '−') + Math.abs(d) + ')</span>';
        }
        el.innerHTML = '<span class="nome">' + escapeHtml(nomeSquadra(t)) + '</span>' +
          '<span class="val">' + num(tSq[t]) + '</span>' + delta;
        box.appendChild(el);
      }
      return;
    }
    for (let g = 0; g < 2; g++) {
      const el = document.createElement('div');
      el.className = 'punteggio-box' + (s.turno === g && !s.finita ? ' attivo' : '');
      const pu = s.punteggiUltima;
      let delta = '';
      if (pu && !pu.annullata && pu.punti) {
        const d = pu.punti[g];
        delta = '<span class="delta ' + (d >= 0 ? 'positivo' : 'negativo') +
          '" title="Punti dell\'ultima smazzata">(' + (d >= 0 ? '+' : '−') + Math.abs(d) + ')</span>';
      }
      el.innerHTML = '<span class="nome">' + escapeHtml(nomeGiocatore(g)) + '</span>' +
        '<span class="val">' + num(s.totali[g]) + '</span>' + delta;
      box.appendChild(el);
    }
  }

  function renderTurno() {
    const s = ui.partita.stato;
    const badge = $('#turno-badge');
    if (s.finita) {
      badge.textContent = 'Smazzata conclusa';
      badge.className = 'turno-badge';
      return;
    }
    const mio = ui.config.modo === 'cpu' ? s.turno === 0 : true;
    badge.textContent = 'Turno di ' + nomeGiocatore(s.turno);
    badge.className = 'turno-badge' + (mio ? ' mio' : ' attesa');
  }

  /* Le mani nascoste: a due giocatori è l'avversario, a quattro sono i due
   * avversari più il compagno — ognuno con il suo nome e quante carte ha. */
  function renderAvversario() {
    const p = ui.partita;
    const s = p.stato;
    const box = $('#mano-avversario');
    const etichetta = $('#etichetta-avversario');
    box.innerHTML = '';

    const bots = [];
    if (p.nGioc === 4) {
      bots.push(1, 2, 3);
      if (etichetta) etichetta.textContent = 'Le mani al tavolo';
    } else {
      const avv = 1 - ui.manoVisibile;
      bots.push(avv);
      if (etichetta) etichetta.textContent = nomeGiocatore(avv);
    }

    bots.forEach(function (g) {
      const gruppo = document.createElement('div');
      gruppo.className = 'mano-bot';
      const nom = document.createElement('div');
      nom.className = 'nome-bot';
      nom.textContent = nomeGiocatore(g) + ' · ' + carte(s.mani[g].length);
      gruppo.appendChild(nom);
      const fila = document.createElement('div');
      fila.className = 'fila-bot';
      const n = s.mani[g].length;
      for (let i = 0; i < n; i++) {
        const el = creaCartaEl(s.mani[g][i], { coperta: true });
        el.style.marginLeft = i === 0 ? '0' : '-20px';
        fila.appendChild(el);
      }
      if (n === 0) {
        const v = document.createElement('div');
        v.style.cssText = 'font-size:12px;opacity:.5';
        v.textContent = 'nessuna carta';
        fila.appendChild(v);
      }
      gruppo.appendChild(fila);
      box.appendChild(gruppo);
    });
  }

  function renderCentro() {
    const p = ui.partita;
    const s = p.stato;
    const possoPescare = s.fase === 'pesca' && s.turno === ui.manoVisibile && !s.finita;

    /* tallone */
    const pilaT = $('#tallone-pila');
    pilaT.innerHTML = '';
    const nT = s.tallone.length;
    const mostraT = Math.min(nT, 4);
    for (let i = 0; i < mostraT; i++) {
      const el = creaCartaEl({ id: 'back' + i, jolly: false }, { coperta: true });
      el.style.transform = 'translate(' + (-i * 1.5) + 'px,' + (-i * 1.5) + 'px)';
      pilaT.appendChild(el);
    }
    if (nT === 0) {
      const v = document.createElement('div');
      v.className = 'monte-vuoto';
      v.textContent = 'esaurito';
      pilaT.appendChild(v);
    }
    /* nome e quantità sulla stessa riga: su schermi bassi la seconda riga
     * era la prima cosa a sparire */
    $('#tallone-didascalia').innerHTML = '<strong>Tallone</strong>' +
      '<span class="conta">' + (nT ? '· ' + nT : '· esaurito') + '</span>';
    $('#tallone-didascalia').title = nT ? nT + ' carte nel tallone' : 'Tallone esaurito';
    const mt = $('#mazzetto-tallone');
    mt.classList.toggle('cliccabile', possoPescare && nT > 0);
    mt.classList.toggle('evidenziato', possoPescare && nT > 0 && !s.monte.length);

    /* monte */
    const pilaM = $('#monte-pila');
    pilaM.innerHTML = '';
    const n = s.monte.length;
    if (n === 0) {
      const v = document.createElement('div');
      v.className = 'monte-vuoto';
      v.textContent = 'vuoto';
      pilaM.appendChild(v);
    } else {
      const mostra = Math.min(n, 4);
      for (let i = 0; i < mostra; i++) {
        const idx = n - mostra + i;
        const carta = s.monte[idx];
        const el = (i === mostra - 1)
          ? creaCartaEl(carta, {})
          : creaCartaEl(carta, { coperta: true });
        el.style.transform = 'translate(' + ((mostra - 1 - i) * 2) + 'px,' +
          ((mostra - 1 - i) * -2) + 'px)';
        pilaM.appendChild(el);
      }
    }
    $('#monte-didascalia').innerHTML = '<strong>Monte</strong>' +
      '<span class="conta">' + (n ? '· ' + n : '· vuoto') + '</span>';
    $('#monte-didascalia').title = n ? n + ' carte sul monte' : 'Monte vuoto';
    const mm = $('#mazzetto-monte');
    const utile = possoPescare && n > 0;
    mm.classList.toggle('cliccabile', utile);
    mm.classList.toggle('evidenziato', utile && n > 0 && !s.tallone.length);
  }

  function renderMelds() {
    const p = ui.partita;
    const n = p.nGioc;
    for (let g = 0; g < n; g++) {
      const cont = document.getElementById('melds-' + g);
      if (!cont) continue;
      cont.innerHTML = '';
      const melds = p.stato.melds[g];
      if (!melds.length) {
        const v = document.createElement('div');
        v.className = 'vuoto';
        v.textContent = g === ui.manoVisibile ? 'Nessuna combinazione calata' : 'Nessuna combinazione';
        cont.appendChild(v);
      }
      melds.forEach(function (m, idx) { cont.appendChild(creaMeldEl(m, g, idx)); });
      aggiustaPassoMelds(cont);

      /* punti, burrachi e stato del pozzetto di ogni giocatore, nella
       * striscia sopra la sua colonna */
      const bur = p.contaBurrachi(g);
      const pill = document.getElementById('pill-' + g);
      if (pill) {
        pill.textContent = (p.puntiMeld(g) + p.bonusMeld(g)) + ' pt' +
          (bur ? ' · ' + bur + ' burraco' + (bur > 1 ? 'hi' : '') : '');
      }
      const pp = document.getElementById('pill-pozzetto-' + g);
      if (pp) {
        const t = p.squadre ? p.squadre[g] : g;
        pp.textContent = p.stato.pozzettoPreso[t] ? 'pozzetto preso' : 'pozzetto da prendere';
      }
    }
  }

  /* Descrizione completa di una combinazione (tooltip). */
  function descrizioneMeld(m) {
    const tipo = m.tipo === 'gruppo'
      ? 'Gruppo di ' + (E.RANGO_CORTO[m.slots[0].valore] || m.slots[0].valore)
      : 'Sequenza di ' + (E.NOME_SEME[m.seme] || '');
    let testo = tipo + ' · ' + m.slots.length + ' carte · ' + m.punti + ' punti';
    if (m.burraco) {
      testo += ' · BURRACO ' + (m.pulito ? 'PULITO' : (m.semipulito ? 'SEMIPULITO' : 'SPORCO')) +
        ' +' + E.bonusBurraco(m);
    }
    return testo;
  }

  /* Una combinazione è una pila verticale di carte dritte (non a ventaglio):
   * ognuna scavalca quella sopra e resta scoperta la striscia in alto con
   * valore e seme, come quando si calano le carte sul tavolo. Quando è un
   * burraco la prima carta sta di traverso in fondo alla pila. */
  function creaMeldEl(m, g, idx) {
    const el = document.createElement('div');
    el.className = 'meld' + (m.burraco
      ? ' burraco ' + (m.pulito ? 'pulito' : (m.semipulito ? 'semipulito' : 'sporco'))
      : '');
    el.dataset.indice = idx;
    el.dataset.giocatore = g;
    el.title = descrizioneMeld(m);

    const testa = document.createElement('div');
    testa.className = 'testata';
    testa.innerHTML = '<span class="pt">' + m.punti + ' pt</span>';
    if (m.burraco) {
      const timbro = document.createElement('span');
      timbro.className = 'timbro';
      timbro.textContent = m.pulito ? 'PULITO' : (m.semipulito ? 'SEMIPULITO' : 'SPORCO');
      testa.appendChild(timbro);
    }
    el.appendChild(testa);

    const pila = document.createElement('div');
    pila.className = 'pila-meld';

    const nodo = function (slot, i) {
      const semeSlot = m.seme || (slot.carta.seme || '');
      const c = creaCartaEl(slot.carta, {
        wild: slot.wild,
        valoreRappresentato: slot.valore,
        seme: semeSlot,
        titolo: slot.wild
          ? slot.carta.nomeLungo + ' (matta) che vale come ' +
            (E.RANGO_CORTO[slot.valore] || slot.valore) + (E.SIMBOLO[semeSlot] || '')
          : slot.carta.nomeLungo
      });
      c.classList.add('impilata');
      c.dataset.slot = i;
      c.dataset.giocatore = g;
      c.dataset.indiceMeld = idx;
      /* impilate in verticale come sul tavolo: la carta sopra copre quella da
       * sotto, così di ognuna resta visibile solo l'angolo in alto a sinistra
       * con valore e seme */
      c.style.zIndex = String(200 - i);
      /* solo le combinazioni del giocatore locale si possono riordinare */
      if (g === ui.manoVisibile) {
        c.classList.add('spostabile');
        c.addEventListener('pointerdown', function (ev) {
          avviaTrascinamento(ev, slot.carta, idx, c);
        });
      }
      return c;
    };

    /* la carta di traverso (la prima del burraco) sta in fondo alla pila:
     * sotto, al centro — è il segno del burraco, come al tavolo */
    for (let i = m.slots.length - 1; i >= 1; i--) pila.appendChild(nodo(m.slots[i], i));
    const prima = m.slots[0];
    if (m.burraco) {
      const supporto = document.createElement('div');
      supporto.className = 'slot-traverso';
      supporto.style.zIndex = '200';
      supporto.appendChild(nodo(prima, 0));
      supporto.firstChild.classList.add('di-traverso');
      pila.appendChild(supporto);
    } else {
      pila.appendChild(nodo(prima, 0));
    }
    el.appendChild(pila);

    if (m.nuovo) { el.classList.add('appena-giocata'); delete m.nuovo; }
    return el;
  }

  /* Le pile lunghe non devono sbordare dalla colonna: se la combinazione è
   * più alta dello spazio che c'è, le carte si accavallano di più (il passo
   * si restringe) ma restano dritte. Il valore finisce in --passo, che il
   * CSS usa per il margine negativo fra una carta e l'altra. */
  function aggiustaPassoMelds(cont) {
    const stile = getComputedStyle(document.documentElement);
    const cw = parseFloat(stile.getPropertyValue('--cw-meld')) || 60;
    const ch = parseFloat(stile.getPropertyValue('--ch-meld')) || cw * 1.4;
    const passoBase = parseFloat(stile.getPropertyValue('--passo-meld')) || 20;
    const PASSO_MINIMO = 11;
    /* l'altezza utile è quella della colonna (che scorre se serve) meno lo
     * spazio per la testata e i bordi */
    const colonna = cont.parentElement;
    const disponibile = ((colonna && colonna.clientHeight) || 0) - 26;
    if (disponibile <= ch) return;
    Array.prototype.slice.call(cont.children).forEach(function (meldEl) {
      if (!meldEl.classList || !meldEl.contains) return;
      if (!meldEl.classList.contains('meld')) return;
      const n = meldEl.querySelectorAll('.pila-meld > .carta').length;
      if (n < 2) return;
      let passo = passoBase;
      const massimo = Math.floor((disponibile - ch) / (n - 1));
      if (massimo < passo) passo = Math.max(PASSO_MINIMO, massimo);
      meldEl.style.setProperty('--passo', passo + 'px');
    });
  }

  function renderMano() {
    const p = ui.partita;
    const s = p.stato;
    const g = ui.manoVisibile;
    const manoEl = $('#mano-giocatore');
    manoEl.innerHTML = '';
    /* le scritte sulla mano (nome, quante carte, pozzetto) sono nella barra
     * dei comandi: renderAzioni le scrive in informazioniMano() */

    /* in due sullo stesso dispositivo la mano resta coperta finché non si
     * conferma il passaggio del dispositivo */
    const nascosta = ui.attesaConsegna;
    const interattivo = !nascosta && !s.finita && s.turno === g && !ui.botInCorso;

    if (nascosta) {
      s.mani[g].forEach(function (c, i) {
        const el = creaCartaEl(c, { coperta: true });
        el.style.marginLeft = i === 0 ? '0' : '-22px';
        manoEl.appendChild(el);
      });
      return;
    }

    const blocchi = raggruppaMano(s.mani[g]);
    const nodi = [];
    const inizioBlocco = new Set();
    blocchi.forEach(function (b, bi) {
      b.carte.forEach(function (carta, ci) {
        const el = creaCartaEl(carta, { titolo: carta.nomeLungo + ' · trascinala su una combinazione' });
        el.dataset.blocco = String(bi);
        if (ci === 0 && bi > 0) { inizioBlocco.add(nodi.length); el.classList.add('inizio-blocco'); }
        if (b.tipo === 'gruppo' || b.tipo === 'sequenza') el.classList.add('in-combinazione');
        if (interattivo) {
          el.classList.add('cliccabile');
          if (ui.selezione.has(carta.id)) el.classList.add('selezionata');
          el.addEventListener('click', function () { onClicCarta(carta); });
          el.addEventListener('pointerdown', function (ev) { avviaTrascinamento(ev, carta, null, el); });
        }
        nodi.push(el);
        manoEl.appendChild(el);
      });
    });

    /* La mano è una fila dritta di carte che si accavallano (non a
     * ventaglio): ognuna lascia scoperta la striscia di sinistra con il
     * valore, come quando si tengono le carte in mano. Il passo si adatta
     * da sé: con poche carte o tanto spazio la fila si allarga, con tante
     * carte si stringe per non sbordare. Fra un blocco e l'altro resta un
     * varco, così i tris e le scale si distinguono. */
    requestAnimationFrame(function () {
      const stile = getComputedStyle(document.documentElement);
      const cw = parseFloat(stile.getPropertyValue('--cw')) || 62;
      const varco = blocchi.length > 1 ? 9 : 0;
      const n = nodi.length;
      if (!n) return;
      const larghezza = manoEl.clientWidth - 8;
      /* quanto basta perché si veda il valore sulla striscia scoperta */
      const PASSO_MINIMO = Math.round(cw * 0.32);
      let passo = cw * 0.58;
      if (n > 1) passo = Math.min(passo, (larghezza - cw) / (n - 1));
      passo = Math.max(PASSO_MINIMO, passo);
      nodi.forEach(function (el, i) {
        if (i === 0) { el.style.marginLeft = '0'; return; }
        const extra = inizioBlocco.has(i) ? varco : 0;
        el.style.marginLeft = Math.round(passo - cw + extra) + 'px';
      });
    });
  }

  /* Filetto verticale fra le scritte e i pulsanti veri e propri. */
  function separatoreBarra() {
    const el = document.createElement('div');
    el.className = 'separatore';
    return el;
  }

  /* Le scritte che stavano sopra le carte in mano (nome della mano, quante
   * carte, pozzetto) e i comandi di ordinamento ora stanno nella barra dei
   * comandi: così la fascia di verde sopra le carte resta libera e le carte
   * hanno tutto lo spazio. La barra non va mai a capo, quindi la sua altezza
   * è fissa e la mano non salta quando cambiano i pulsanti. */
  function informazioniMano() {
    const p = ui.partita;
    const s = p.stato;
    const g = ui.manoVisibile;
    const info = document.createElement('div');
    info.className = 'info-mano';
    const nome = document.createElement('span');
    nome.textContent = (ui.config.modo === 'cpu' && g === 0) ? 'La tua mano' : 'Mano di ' + nomeGiocatore(g);
    info.appendChild(nome);
    const quante = document.createElement('span');
    quante.className = 'pill';
    quante.id = 'pill-mano';
    quante.textContent = carte(s.mani[g].length);
    info.appendChild(quante);
    const pozzetto = document.createElement('span');
    pozzetto.className = 'pill';
    pozzetto.id = 'pill-pozzetto-mio';
    pozzetto.textContent = s.pozzettoPreso[g]
      ? 'pozzetto preso'
      : 'pozzetto pronto (' + (s.pozzetti[g] || []).length + ')';
    info.appendChild(pozzetto);
    return info;
  }

  /* I tre comandi di ordinamento, ricreati a ogni render della barra (il
   * click è gestito con la delega su #barra-azioni). */
  function comandiOrdinamento() {
    const box = document.createElement('div');
    box.className = 'ordinamento';
    box.id = 'ordinamento';
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', 'Ordina le carte in mano');
    [
      { ordine: 'combinazioni', testo: 'Combinazioni', titolo: 'Mette vicine le carte che formano già tris o scale' },
      { ordine: 'numero', testo: 'Numero', titolo: 'Ordina per valore, dall\'asso al re' },
      { ordine: 'seme', testo: 'Seme', titolo: 'Raggruppa per seme' }
    ].forEach(function (o) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ord-btn' + (ui.ordineMano === o.ordine ? ' attivo' : '');
      b.dataset.ordine = o.ordine;
      b.title = o.titolo;
      b.textContent = o.testo;
      b.setAttribute('aria-pressed', ui.ordineMano === o.ordine ? 'true' : 'false');
      box.appendChild(b);
    });
    return box;
  }

  function renderAzioni() {
    const p = ui.partita;
    const s = p.stato;
    const bar = $('#barra-azioni');
    bar.innerHTML = '';

    if (s.finita) return;

    /* tutto il contenuto sta in un solo figlio: la barra scorre di lato se
     * avanza, ma non va mai a capo (l'altezza non deve cambiare) */
    const interno = document.createElement('div');
    interno.className = 'barra-interno';
    bar.appendChild(interno);

    const g = ui.manoVisibile;
    const eMioTurno = s.turno === g && !ui.botInCorso && !ui.attesaConsegna;

    if (!eMioTurno) {
      const att = document.createElement('div');
      att.style.cssText = 'font-size:13.5px;opacity:.7;padding:10px';
      att.textContent = '⏳ In attesa di ' + nomeGiocatore(s.turno) + '…';
      interno.appendChild(att);
      return;
    }

    interno.appendChild(informazioniMano());
    interno.appendChild(separatoreBarra());

    /* ---- fase di pesca ---- */
    if (s.fase === 'pesca') {
      const b1 = pulsante('🎴 Pesca dal tallone', 'btn-primario', function () {
        esegui(function () { return p.pescaTallone(); }, 'pesca');
      });
      b1.disabled = s.tallone.length === 0;
      const b2 = pulsante('♻️ Prendi il monte' + (s.monte.length ? ' (' + s.monte.length + ')' : ''),
        '', function () {
          esegui(function () { return p.prendiMonte(); }, 'pesca');
        });
      b2.disabled = s.monte.length === 0;
      interno.appendChild(b1);
      interno.appendChild(b2);
      interno.appendChild(suggerimento());
      interno.appendChild(separatoreBarra());
      interno.appendChild(comandiOrdinamento());
      return;
    }

    /* ---- fase di gioco ---- */
    const selezionate = carteSelezionate();
    const anteprima = document.createElement('div');
    anteprima.className = 'anteprima';
    anteprima.id = 'anteprima';
    /* l'anteprima sta fuori dal flusso (ancorata al piè di pagina), non
     * dentro il contenuto che scorre: se stesse dentro, la barra cambierebbe
     * larghezza e la mano salterebbe */
    bar.appendChild(anteprima);

    if (!selezionate.length) {
      /* La guida lunga («tocca una carta per scartarla…») è stata tolta:
       * stava nella barra e a ogni pescata faceva saltare su la mano.
       * Resta solo l'aiuto mentre si sposta una carta, che compare
       * quando il giocatore lo chiede. */
      if (ui.spostamento) {
        anteprima.className = 'anteprima guida';
        anteprima.textContent = 'Tocca la combinazione che deve ricevere la carta, oppure trascinala.';
      }
    }

    if (!selezionate.length) {
      /* La guida lunga («tocca una carta per scartarla…») è stata tolta:
       * stava nella barra e a ogni pescata faceva saltare su la mano.
       * Resta solo l'aiuto mentre si sposta una carta, che compare
       * quando il giocatore lo chiede. */
      if (ui.spostamento) {
        anteprima.className = 'anteprima guida';
        anteprima.textContent = 'Tocca la combinazione che deve ricevere la carta, oppure trascinala.';
      }
    }

    if (selezionate.length >= 3) {
      const esito = E.validaCombinazione(selezionate);
      if (esito) {
        const blocco = p.motivoCalataNonAmmessa(g, selezionate);
        let testo = (esito.tipo === 'gruppo' ? 'Gruppo' : 'Sequenza di ' + E.NOME_SEME[esito.seme]) +
          ' di ' + esito.lunghezza + ' carte · ' + esito.punti + ' punti';
        if (esito.burraco) {
          testo += ' · 🏆 BURRACO ' + E.nomeBurraco(esito).toUpperCase() +
            ' (+' + E.bonusBurraco(esito) + ')';
        } else if (esito.matte) testo += ' · ' + esito.matte + ' matta';
        if (blocco) {
          anteprima.className = 'anteprima non-valida';
          anteprima.textContent = '⚠️ ' + blocco;
        } else {
          anteprima.className = 'anteprima valida';
          anteprima.textContent = testo;
        }
      } else {
        anteprima.className = 'anteprima non-valida';
        anteprima.textContent = '✗ ' + E.motivoNonValida(selezionate);
      }
    }

    if (selezionate.length === 1) {
      const carta = selezionate[0];
      const compatibili = p.meldsCompatibili(g, carta.id);
      if (compatibili.length) {
        anteprima.className = 'anteprima valida';
        anteprima.textContent = '👆 Tocca una tua combinazione evidenziata per attaccare ' + carta.etichetta;
      } else if (p.chiudeCon(g, carta.id)) {
        anteprima.className = 'anteprima valida';
        anteprima.textContent = '🏁 Puoi chiudere la smazzata scartando questa carta';
      }
    }

    const bCala = pulsante('⬆️ Cala' + (selezionate.length >= 3 ? ' (' + selezionate.length + ')' : ''),
      'btn-primario', function () {
        esegui(function () { return p.cala(carteSelezionate().map(function (c) { return c.id; })); }, 'cala');
      });
    bCala.disabled = !(selezionate.length >= 3 && p.calaAmmissibile(g, selezionate));
    interno.appendChild(bCala);

    const bScarta = pulsante(
      (selezionate.length === 1 && p.chiudeCon(g, selezionate[0].id)) ? '🏁 Chiudi la smazzata' : '⬇️ Scarta',
      (selezionate.length === 1 && p.chiudeCon(g, selezionate[0].id)) ? 'btn-oro' : '',
      function () {
        esegui(function () { return p.scarta(carteSelezionate()[0].id); }, 'scarta');
      });
    bScarta.disabled = !(selezionate.length === 1 && !p.scartoVietato(g, selezionate[0].id));
    interno.appendChild(bScarta);

    if (selezionate.length) {
      interno.appendChild(pulsante('✕ Annulla', 'btn-icona', function () {
        ui.selezione.clear();
        render();
      }));
    }
    interno.appendChild(suggerimento());
    interno.appendChild(separatoreBarra());
    interno.appendChild(comandiOrdinamento());
  }

  function suggerimento() {
    return pulsante('💡 Suggerisci', 'btn-icona', function () {
      const p = ui.partita;
      const s = p.stato;
      const g = ui.manoVisibile;
      if (s.fase !== 'gioco') { notifica('Prima pesca una carta.', 'errore'); return; }
      const lista = p.suggerimenti(g);
      if (!lista.length) {
        /* informazione di servizio: va nella riga di stato, non in un avviso */
        stato('Nessuna combinazione da calare con queste carte: attacca una carta a un tuo gioco oppure scarta.');
        return;
      }
      ui.selezione.clear();
      lista[0].ids.forEach(function (id) { ui.selezione.add(id); });
      render();
      stato('Combinazione suggerita: ' + lista[0].esito.lunghezza + ' carte, ' +
        lista[0].esito.punti + ' punti. Premi Cala per giocarla.');
    });
  }

  function pulsante(testo, classe, azione) {
    const b = document.createElement('button');
    b.className = 'btn ' + (classe || '');
    b.innerHTML = testo;
    b.addEventListener('click', azione);
    return b;
  }

  function carteSelezionate() {
    const g = ui.manoVisibile;
    const mano = ui.partita.stato.mani[g];
    return mano.filter(function (c) { return ui.selezione.has(c.id); });
  }

  function escapeHtml(t) {
    return String(t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* =====================================================================
   * INTERAZIONI
   * ===================================================================== */
  /* =====================================================================
   * TRASCINAMENTO DELLE CARTE (mouse e touch)
   * ===================================================================== */
  const SOGLIA_DRAG = 7;

  /* Combinazioni in cui la carta può entrare: dalla mano (daMeld null) o
   * spostandola da un'altra combinazione. */
  function meldsCheAccettano(carta, daMeld) {
    const p = ui.partita;
    if (!p) return [];
    const melds = p.stato.melds[ui.manoVisibile];
    const out = [];
    melds.forEach(function (m, i) {
      if (daMeld !== null && i === daMeld) return;
      if (daMeld === null || daMeld === undefined) {
        if (E.provaLegatura(m, carta)) out.push(i);
      } else if (p.valutaSpostamento(daMeld, carta.id, i).ok) {
        out.push(i);
      }
    });
    return out;
  }

  function puoInteragire() {
    const s = ui.partita && ui.partita.stato;
    return !!s && !s.finita && s.fase === 'gioco' &&
      s.turno === ui.manoVisibile && !ui.botInCorso && !ui.attesaConsegna;
  }

  function avviaTrascinamento(ev, carta, daMeld, nodo) {
    if (ui.trascinamento || ev.button === 2) return;
    if (!puoInteragire()) return;
    const t = {
      carta: carta,
      daMeld: (daMeld === undefined || daMeld === null) ? null : daMeld,
      nodo: nodo,
      partenza: { x: ev.clientX, y: ev.clientY },
      attivo: false,
      bersagli: [],
      ghost: null,
      sotto: null
    };
    ui.trascinamento = t;

    const muovi = function (e) {
      const att = ui.trascinamento;
      if (!att || att !== t) return;
      if (!att.attivo) {
        if (Math.abs(e.clientX - att.partenza.x) < SOGLIA_DRAG &&
            Math.abs(e.clientY - att.partenza.y) < SOGLIA_DRAG) return;
        att.attivo = true;
        att.bersagli = meldsCheAccettano(att.carta, att.daMeld);
        creaGhost(att);
        document.body.classList.add('trascinando');
        if (att.nodo) att.nodo.classList.add('trascinata');
        mostraBersagli(att.bersagli, att.daMeld);
        if (!att.bersagli.length) {
          stato('Nessuna combinazione può ricevere ' + att.carta.etichetta + '.');
        }
      }
      posizionaGhost(att, e.clientX, e.clientY);
      aggiornaSotto(att, e.clientX, e.clientY);
      e.preventDefault();
    };

    const fine = function (e) {
      document.removeEventListener('pointermove', muovi);
      document.removeEventListener('pointerup', fine);
      document.removeEventListener('pointercancel', annulla);
      const att = ui.trascinamento;
      ui.trascinamento = null;
      if (!att || !att.attivo) return;
      ui.sopprimiClic = true;
      setTimeout(function () { ui.sopprimiClic = false; }, 60);
      chiudiTrascinamento(att);
      const meldEl = elementoMeldSotto(e.clientX, e.clientY);
      if (meldEl && att.bersagli.indexOf(Number(meldEl.dataset.indice)) >= 0) {
        eseguiSpostamento(att, Number(meldEl.dataset.indice));
      } else if (meldEl) {
        const idx = Number(meldEl.dataset.indice);
        if (att.daMeld === null) {
          esegui(function () { return ui.partita.lega(idx, att.carta.id); }, 'lega');
        } else {
          const giudizio = ui.partita.valutaSpostamento(att.daMeld, att.carta.id, idx);
          notifica(giudizio.motivo || 'Spostamento non consentito.', 'errore', 3200);
        }
      } else {
        render();
      }
    };

    const annulla = function () {
      document.removeEventListener('pointermove', muovi);
      document.removeEventListener('pointerup', fine);
      document.removeEventListener('pointercancel', annulla);
      const att = ui.trascinamento;
      ui.trascinamento = null;
      if (att && att.attivo) chiudiTrascinamento(att);
      render();
    };

    document.addEventListener('pointermove', muovi);
    document.addEventListener('pointerup', fine);
    document.addEventListener('pointercancel', annulla);
  }

  function creaGhost(t) {
    const nodo = t.nodo ? t.nodo.cloneNode(true) : creaCartaEl(t.carta, {});
    nodo.classList.add('ghost-drag');
    nodo.classList.remove('selezionata', 'cliccabile', 'impilata', 'di-traverso', 'trascinata');
    nodo.style.cssText = '';
    document.body.appendChild(nodo);
    t.ghost = nodo;
  }

  function posizionaGhost(t, x, y) {
    if (!t.ghost) return;
    t.ghost.style.left = x + 'px';
    t.ghost.style.top = y + 'px';
  }

  function chiudiTrascinamento(t) {
    if (t.ghost && t.ghost.parentNode) t.ghost.parentNode.removeChild(t.ghost);
    document.body.classList.remove('trascinando');
    $$('.meld.sotto').forEach(function (el) { el.classList.remove('sotto'); });
    if (t.nodo) t.nodo.classList.remove('trascinata');
  }

  function mostraBersagli(indici, daMeld) {
    $$('#melds-0 .meld').forEach(function (el) {
      const i = Number(el.dataset.indice);
      if (indici.indexOf(i) >= 0) el.classList.add('target');
      if (daMeld !== null && i === daMeld) el.classList.add('origine');
    });
  }

  function elementoMeldSotto(x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el || !el.closest) return null;
    const meld = el.closest('#melds-0 .meld');
    return meld || null;
  }

  function aggiornaSotto(t, x, y) {
    const meld = elementoMeldSotto(x, y);
    const idx = meld ? Number(meld.dataset.indice) : null;
    if (t.sotto === idx) return;
    t.sotto = idx;
    $$('#melds-0 .meld.sotto').forEach(function (el) { el.classList.remove('sotto'); });
    if (meld && t.bersagli.indexOf(idx) >= 0) meld.classList.add('sotto');
  }

  function eseguiSpostamento(t, indiceDestinazione) {
    if (t.daMeld === null) {
      esegui(function () { return ui.partita.lega(indiceDestinazione, t.carta.id); }, 'lega');
    } else {
      esegui(function () { return ui.partita.sposta(t.daMeld, t.carta.id, indiceDestinazione); }, 'sposta');
    }
  }

  /* =====================================================================
   * CLIC SULLE CARTE
   * ===================================================================== */
  function onClicCarta(carta) {
    if (ui.sopprimiClic) return;
    const s = ui.partita.stato;
    if (s.fase !== 'gioco' || s.turno !== ui.manoVisibile || ui.botInCorso) return;
    ui.spostamento = null;
    if (ui.selezione.has(carta.id)) ui.selezione.delete(carta.id);
    else ui.selezione.add(carta.id);
    render();
  }

  /* Clic su una carta di una combinazione: la sceglie per spostarla. */
  function onClicCartaMeld(g, indice, idCarta) {
    if (ui.sopprimiClic) return;
    const p = ui.partita;
    const s = p.stato;
    if (s.finita || s.fase !== 'gioco' || ui.botInCorso) return;
    if (carteSelezionate().length === 1) { onClicMeld(g, indice); return; }
    if (ui.spostamento) {
      /* sto già spostando una carta: toccare un'altra combinazione vuol dire
       * "lasciala qui", toccare un'altra carta della stessa combinazione vuol
       * dire "cambio quella che sto spostando" */
      if (ui.spostamento.idCarta === idCarta) { ui.spostamento = null; render(); return; }
      if (ui.spostamento.indiceMeld !== indice) { onClicMeld(g, indice); return; }
    }
    ui.spostamento = { indiceMeld: indice, idCarta: idCarta };
    ui.selezione.clear();
    render();
    const validi = meldsCheAccettano(cartaDiMeld(indice, idCarta), indice);
    stato(validi.length
      ? 'Sposta ' + (cartaDiMeld(indice, idCarta) || {}).etichetta +
        ': tocca una combinazione evidenziata, oppure trascinala.'
      : 'Questa carta non può passare in un\'altra combinazione.');
  }

  function cartaDiMeld(indice, idCarta) {
    const melds = ui.partita.stato.melds[ui.manoVisibile];
    const m = melds[indice];
    if (!m) return null;
    const slot = m.slots.filter(function (x) { return x.carta.id === idCarta; })[0];
    return slot ? slot.carta : null;
  }

  function onClicMeld(g, indice) {
    if (ui.sopprimiClic) return;
    const p = ui.partita;
    const s = p.stato;
    if (s.fase !== 'gioco' || ui.botInCorso) return;
    if (ui.spostamento) {
      const sp = ui.spostamento;
      ui.spostamento = null;
      esegui(function () { return p.sposta(sp.indiceMeld, sp.idCarta, indice); }, 'sposta');
      return;
    }
    const sel = carteSelezionate();
    if (sel.length !== 1) return;
    esegui(function () { return p.lega(indice, sel[0].id); }, 'lega');
  }

  /* Esegue un'azione sul motore, gestendo errori e aggiornamento della vista. */
  function esegui(fn, tipo) {
    const p = ui.partita;
    let esito;
    try {
      esito = fn();
    } catch (err) {
      notifica('Errore interno: ' + err.message, 'errore', 4000);
      console.error(err);
      render();
      return { ok: false };
    }
    if (!esito || !esito.ok) {
      notifica((esito && esito.motivo) || 'Mossa non consentita.', 'errore', 3200);
      render();
      return esito || { ok: false };
    }

    /* messaggi contestuali */
    if (tipo === 'cala' && esito.esito) {
      if (esito.esito.burraco) {
        const nome = esito.esito.semipulito ? 'semipulito' : (esito.esito.pulito ? 'pulito' : 'sporco');
        const bonus = esito.esito.semipulito ? E.BONUS_BURRACO_SEMIPULITO
          : (esito.esito.pulito ? E.BONUS_BURRACO_PULITO : E.BONUS_BURRACO_SPORCO);
        notifica('🏆 BURRACO ' + nome.toUpperCase() + '! +' + bonus + ' punti', 'oro', 2800);
      }
      if (esito.pozzetto) notifica('Mano esaurita: hai preso il pozzetto e continui a giocare!', 'ok', 2600);
    }
    if (tipo === 'lega') {
      if (esito.nuovoBurraco && esito.meld) {
        notifica('🏆 BURRACO ' + E.nomeBurraco(esito.meld).toUpperCase() + ' completato! +' +
          E.bonusBurraco(esito.meld) + ' punti', 'oro', 2800);
      } else if (esito.sostituzione) {
        notifica('Sostituzione: la matta si sposta all\'estremità della sequenza.', 'ok', 2400);
      }
      if (esito.pozzetto) notifica('Mano esaurita: hai preso il pozzetto e continui a giocare!', 'ok', 2600);
    }
    if (tipo === 'sposta') {
      const m = esito.meld;
      stato('Hai spostato ' + E.etichettaCarta(esito.carta) + ' in un\'altra combinazione.');
      if (esito.nuovoBurraco && m) {
        notifica('🏆 Con lo spostamento hai completato un BURRACO ' + E.nomeBurraco(m).toUpperCase() +
          '! +' + E.bonusBurraco(m) + ' punti', 'oro', 2800);
      } else {
        notifica('Carta spostata: ' + E.etichettaCarta(esito.carta) + ' è ora nella combinazione di destinazione.',
          'ok', 2200);
      }
    }
    if (tipo === 'scarta' && esito.pozzetto) {
      notifica('Hai preso il pozzetto: 11 nuove carte dal prossimo turno.', 'ok', 2800);
    }
    if (tipo === 'scarta' && esito.chiusura) {
      notifica('🏁 Hai chiuso la smazzata! +100 punti', 'oro', 3000);
    }

    ui.selezione.clear();
    render();
    controllaDopoAzione();
    return esito;
  }

  /* =====================================================================
   * FLUSSO DI GIOCO
   * ===================================================================== */
  function controllaDopoAzione() {
    const p = ui.partita;
    const s = p.stato;
    if (s.finita) { mostraFineSmazzata(); return; }
    /* nella modalità contro il computer giocano il bot: a due giocatori è
     * l'avversario, a quattro sono i tre posti occupati dai bot */
    if (ui.config.modo === 'cpu' && s.turno !== 0) {
      setTimeout(turnoBot, 620);
      return;
    }
    if (ui.config.modo === 'hotseat' && s.turno !== ui.manoVisibile) {
      chiediConsegna(s.turno);
    }
  }

  function chiediConsegna(g) {
    ui.attesaConsegna = true;
    $('#consegna-testo').textContent = 'Passa il dispositivo a ' + nomeGiocatore(g) +
      ' per continuare la partita.';
    $('#overlay-consegna').hidden = false;
    render();
  }

  async function turnoBot() {
    const p = ui.partita;
    if (ui.botInCorso || p.stato.finita) return;
    ui.botInCorso = true;
    render();

    const g = p.stato.turno;
    let guardia = 0;
    while (!p.stato.finita && p.stato.turno === g && guardia++ < 60) {
      const attore = p.stato.turno;
      let azione = AI.prossimaAzione(p, ui.config.livello);
      if (!azione) break;
      let esito = AI.eseguiAzione(p, azione);
      if (!esito.ok) {
        azione = AI.prossimaAzione(p, ui.config.livello, true);
        if (!azione) break;
        esito = AI.eseguiAzione(p, azione);
        if (!esito.ok) break;
      }
      annunciaAzioneBot(azione, esito, attore);
      render();
      await pausa(ui.animazione ? 480 : 90);
    }

    ui.botInCorso = false;
    render();
    if (p.stato.finita) { mostraFineSmazzata(); return; }
    /* a quattro giocatori il turno passa a un altro bot: la catena continua
     * finché non arriva al giocatore umano (o finisce la smazzata) */
    if (ui.config.modo === 'cpu' && p.stato.turno !== 0) {
      setTimeout(turnoBot, 500);
    }
  }

  function annunciaAzioneBot(azione, esito, attore) {
    const g = (attore === undefined || attore === null) ? ui.partita.stato.turno : attore;
    if (azione.tipo === 'pesca') {
      const dove = azione.sorgente === 'monte' ? 'il monte' : 'il tallone';
      stato(frase(g, 'ha pescato dal ' + dove + '.', 'Hai pescato dal ' + dove + '.'));
      if (azione.sorgente === 'monte') notifica(frase(g, 'ha raccolto il monte.', 'Hai raccolto il monte.'), '', 1400);
    } else if (azione.tipo === 'cala') {
      const bur = esito.esito && esito.esito.burraco;
      const quante = esito.esito ? esito.esito.lunghezza : '';
      stato(frase(g, 'ha calato ' + quante + ' carte' + (bur ? ' (burraco!)' : '') + '.',
        'Hai calato ' + quante + ' carte' + (bur ? ' (burraco!)' : '') + '.'));
      if (bur) notifica(frase(g, 'ha fatto un BURRACO!', 'BURRACO!'), 'oro', 2000);
    } else if (azione.tipo === 'lega') {
      stato(frase(g, 'ha attaccato una carta' + (esito.nuovoBurraco ? ' completando un burraco!' : '') + '.',
        'Hai attaccato una carta' + (esito.nuovoBurraco ? ' completando un burraco!' : '') + '.'));
      if (esito.nuovoBurraco) notifica(frase(g, 'ha completato un BURRACO!', 'BURRACO completato!'), 'oro', 2000);
    } else if (azione.tipo === 'scarta') {
      if (esito.chiusura) {
        stato(frase(g, 'ha chiuso la smazzata.', 'Hai chiuso la smazzata!'));
        notifica(frase(g, 'ha CHIUSO la smazzata!', 'Hai chiuso la smazzata!'), 'oro', 2400);
      } else if (esito.pozzetto) {
        stato(frase(g, 'ha preso il pozzetto.', 'Hai preso il pozzetto.'));
        notifica(frase(g, 'ha preso il pozzetto.', 'Hai preso il pozzetto.'), '', 1500);
      } else {
        stato(frase(g, 'ha scartato.', 'Hai scartato.'));
      }
    }
  }

  /* =====================================================================
   * FINE SMAZZATA / PARTITA
   * ===================================================================== */
  function mostraFineSmazzata() {
    const p = ui.partita;
    const s = p.stato;
    const pu = s.punteggiUltima;
    const box = $('#overlay-fine');
    const azioni = $('#fine-azioni');
    azioni.innerHTML = '';

    if (pu.annullata) {
      $('#fine-titolo').textContent = 'Smazzata annullata';
      $('#fine-sottotitolo').textContent =
        'Nessuno ha preso il pozzetto: la smazzata viene ripetuta senza assegnare punti.';
      $('#fine-contenuto').innerHTML = '';
    } else {
      if (pu.chiusaDa !== null) {
        $('#fine-titolo').textContent = frase(pu.chiusaDa, 'ha chiuso la smazzata', 'Hai chiuso la smazzata');
        $('#fine-sottotitolo').textContent = 'Smazzata n. ' + pu.smazzata +
          ' · bonus chiusura +' + E.BONUS_CHIUSURA;
      } else {
        $('#fine-titolo').textContent = 'Smazzata n. ' + pu.smazzata + ' conclusa';
        $('#fine-sottotitolo').textContent =
          'Nessuno ha chiuso: il tallone è terminato. Nessun bonus di chiusura.';
      }
      $('#fine-contenuto').innerHTML = tabellaPunteggi(pu);
    }

    if (s.vincitore !== null) {
      const box2 = document.createElement('div');
      box2.style.cssText = 'text-align:center;margin:16px 0 0;font-size:19px;font-weight:700;color:#f0cf6d';
      box2.textContent = '🏆 ' + nomeSquadra(s.vincitore) + ' vince la partita!';
      $('#fine-contenuto').appendChild(box2);

      azioni.appendChild(pulsante('🔄 Nuova partita', 'btn-oro btn-grande', function () {
        box.hidden = true;
        avviaPartita();
      }));
      azioni.appendChild(pulsante('📖 Regole', 'btn-grande', function () {
        $('#overlay-regole').hidden = false;
      }));
    } else {
      azioni.appendChild(pulsante('▶ Continua', 'btn-oro btn-grande', function () {
        box.hidden = true;
        p.smazzataSuccessiva();
        ui.selezione.clear();
        ui.messaggio = '';
        ui.manoVisibile = ui.config.modo === 'cpu' ? 0 : p.stato.turno;
        if (ui.config.modo === 'hotseat') {
          chiediConsegna(p.stato.turno);
        } else {
          render();
          controllaDopoAzione();
        }
      }));
      azioni.appendChild(pulsante('📖 Regole', 'btn-grande', function () {
        $('#overlay-regole').hidden = false;
      }));
    }
    box.hidden = false;
  }

  function tabellaPunteggi(pu) {
    const p = ui.partita;
    const n = p.nGioc;
    const quattro = n === 4;
    let h = '<table class="tabella-punti"><thead><tr><th>Voce</th>';
    for (let g = 0; g < n; g++) {
      h += '<th' + (quattro ? ' style="font-size:11px"' : '') + '>' +
        escapeHtml(nomeGiocatore(g)) + '</th>';
    }
    h += '</tr></thead><tbody>';

    const celle = function (etichetta, valori, classe) {
      let out = '<td>' + etichetta + '</td>';
      for (let g = 0; g < n; g++) out += '<td>' + valori[g] + '</td>';
      return '<tr' + (classe ? ' class="' + classe + '"' : '') + '>' + out + '</tr>';
    };

    const fmt = function (v) {
      if (v === null || v === undefined || v === 0) return '<span style="opacity:.35">—</span>';
      const segno = v > 0 ? '+' : '−';
      const cls = v > 0 ? 'positivo' : 'negativo';
      return '<span class="' + cls + '">' + segno + Math.abs(v) + '</span>';
    };

    const d = pu.dettaglio;
    h += celle('Carte calate', d.map(function (x) { return fmt(x.puntiCarte); }));
    h += celle('Bonus burraco (' + d.map(function (x) { return x.burrachi; }).join(' / ') + ')',
      d.map(function (x) { return fmt(x.bonusBurraco); }));
    h += celle('Bonus chiusura', d.map(function (x) { return fmt(x.chiusura); }));
    h += celle('Carte rimaste in mano', d.map(function (x) { return fmt(-x.carteInMano); }));
    h += celle('Pozzetto non preso', d.map(function (x) { return fmt(-x.penalePozzetto); }));
    const num = function (v) { return String(v).replace('-', '−'); };
    h += celle('Punti smazzata', pu.punti.map(num), 'totale');
    if (quattro) {
      /* totali per squadra: due celle, ognuna sulla colonna dei due compagni */
      const tSq = p.totaliSquadra();
      for (let t = 0; t < 2; t++) {
        let out = '<td>Squadra ' + (t === 0 ? 'vostra' : 'avversaria') + '</td>';
        for (let g = 0; g < n; g++) {
          out += p.squadre[g] === t
            ? '<td class="totale-parziale">' + num(tSq[t]) + ' / ' + p.target + '</td>'
            : '<td style="opacity:.35">—</td>';
        }
        h += '<tr class="totale">' + out + '</tr>';
      }
    } else {
      h += '<tr class="totale"><td>Totale partita</td>' +
        '<td class="totale-parziale">' + num(p.stato.totali[0]) + ' / ' + p.target + '</td>' +
        '<td class="totale-parziale">' + num(p.stato.totali[1]) + ' / ' + p.target + '</td></tr>';
    }
    h += '</tbody></table>';
    return h;
  }

  /* =====================================================================
   * STRUTTURA DEL TAVOLO
   * A due giocatori il campo è quello statico dell'HTML (avversario a
   * sinistra, mazzetti al centro, io a destra). A quattro giocatori lo
   * ricostruiamo: avversari a sinistra, compagno e io a destra — la
   * squadra si legge a colpo d'occhio.
   * ===================================================================== */
  function colonnaGiocatore(g, classe, etichetta) {
    return '<div class="colonna ' + classe + '">' +
      '<div class="etichetta-zona">' +
      '<span>' + escapeHtml(etichetta) + '</span>' +
      '<span class="pill" id="pill-' + g + '"></span>' +
      '<span class="pill" id="pill-pozzetto-' + g + '"></span>' +
      '</div>' +
      '<div class="lista-melds" id="melds-' + g + '"></div>' +
      '</div>';
  }

  function colonnaCentro() {
    return '<div class="colonna col-centro">' +
      '<div class="mazzetti">' +
      '<div class="mazzetto" id="mazzetto-tallone">' +
      '<div class="pila" id="tallone-pila"></div>' +
      '<div class="didascalia" id="tallone-didascalia"><strong>Tallone</strong></div>' +
      '</div>' +
      '<div class="mazzetto" id="mazzetto-monte">' +
      '<div class="pila" id="monte-pila"></div>' +
      '<div class="didascalia" id="monte-didascalia"><strong>Monte</strong></div>' +
      '</div>' +
      '</div>' +
      '<div class="centro-destra">' +
      '<div class="log-mosse" id="log-mosse"></div>' +
      '<div class="notifiche" id="notifiche" role="status" aria-live="polite"></div>' +
      '</div>' +
      '</div>';
  }

  function costruisciTavolo() {
    const campo = $('#campo-gioco');
    const tavolo = $('#tavolo');
    if (!campo) return;
    const n = ui.partita ? ui.partita.nGioc : ui.config.giocatori;
    if (tavolo) tavolo.classList.toggle('quattro', n === 4);
    const nomi = ui.partita ? ui.partita.nomi : ui.config.nomi;
    if (n === 4) {
      /* avversari a sinistra, mazzetti al centro, compagno e io a destra:
       * la squadra si legge a colpo d'occhio */
      campo.innerHTML =
        colonnaGiocatore(1, 'col-avv', nomi[1] || 'Avversario 1') +
        colonnaGiocatore(3, 'col-avv', nomi[3] || 'Avversario 3') +
        colonnaCentro() +
        colonnaGiocatore(2, 'col-comp', (nomi[2] || 'Compagno') + ' (con te)') +
        colonnaGiocatore(0, 'col-mie', 'Le tue combinazioni');
    } else {
      campo.innerHTML =
        colonnaGiocatore(1, 'col-avv', nomi[1] || 'Avversario') +
        colonnaCentro() +
        colonnaGiocatore(0, 'col-mie', 'Le tue combinazioni');
    }
  }

  /* =====================================================================
   * AVVIO PARTITA
   * ===================================================================== */
  function avviaPartita() {
    const quattro = ui.config.giocatori === 4 && ui.config.modo !== 'hotseat';
    const nomi = quattro
      ? [($('#nome-0') && $('#nome-0').value || 'Tu').trim().slice(0, 14) || 'Tu',
         'Computer 1', 'Computer 2', 'Computer 3']
      : [
        ($('#nome-0').value || 'Giocatore 1').trim().slice(0, 14),
        ($('#nome-1').value || 'Giocatore 2').trim().slice(0, 14)
      ];
    ui.partita = new E.Partita({
      target: ui.config.target,
      nomi: nomi,
      giocatori: quattro ? 4 : 2
    });
    ui.config.nomi = nomi;
    ui.selezione.clear();
    ui.attesaConsegna = false;
    ui.botInCorso = false;
    ui.manoVisibile = 0;
    ui.messaggio = '';

    costruisciTavolo();

    $('#overlay-fine').hidden = true;
    $('#overlay-consegna').hidden = true;
    $('#overlay-menu').hidden = true;
    $('#tavolo').hidden = false;
    $('#schermata-avvio').hidden = true;

    render();
    notifica('Buona partita! Si comincia con ' + nomeGiocatore(ui.partita.stato.turno) + '.', 'ok', 2600);
    controllaDopoAzione();
  }

  /* =====================================================================
   * SCHERMATA INIZIALE
   * ===================================================================== */
  function collegaScelte() {
    $$('#scelta-modo .scelta').forEach(function (b) {
      b.addEventListener('click', function () {
        $$('#scelta-modo .scelta').forEach(function (x) { x.classList.remove('attiva'); });
        b.classList.add('attiva');
        ui.config.modo = b.dataset.modo;
        $('#campo-livello').style.display = ui.config.modo === 'cpu' ? '' : 'none';
        /* i quattro giocatori hanno senso solo contro il computer */
        $('#campo-giocatori').style.display = ui.config.modo === 'cpu' ? '' : 'none';
        if (ui.config.modo !== 'cpu') selezionaGiocatori(2);
        $('#nome-1').value = ui.config.modo === 'cpu' ? 'Computer' : 'Giocatore 2';
        $('#nome-1').style.display = ui.config.modo === 'cpu' && ui.config.giocatori === 4
          ? 'none' : '';
      });
    });
    /*numero di giocatori: 2 (classico) o 4 a squadre contro il computer */
    function selezionaGiocatori(n) {
      ui.config.giocatori = n;
      $$('#scelta-giocatori .scelta').forEach(function (x) {
        x.classList.toggle('attiva', Number(x.dataset.giocatori) === n);
      });
      /* a quattro giocatori i compagni/avversari sono il computer: il nome
       * dell'avversario non si può scegliere */
      $('#nome-1').style.display = (ui.config.modo === 'cpu' && n === 4) ? 'none' : '';
    }
    $$('#scelta-giocatori .scelta').forEach(function (b) {
      b.addEventListener('click', function () { selezionaGiocatori(Number(b.dataset.giocatori)); });
    });
    $$('#scelta-livello .scelta').forEach(function (b) {
      b.addEventListener('click', function () {
        $$('#scelta-livello .scelta').forEach(function (x) { x.classList.remove('attiva'); });
        b.classList.add('attiva');
        ui.config.livello = b.dataset.livello;
      });
    });
    $$('#scelta-target .scelta').forEach(function (b) {
      b.addEventListener('click', function () {
        $$('#scelta-target .scelta').forEach(function (x) { x.classList.remove('attiva'); });
        b.classList.add('attiva');
        ui.config.target = Number(b.dataset.target);
      });
    });

    $('#btn-avvia').addEventListener('click', function () {
      ui.config.nomi = [
        ($('#nome-0').value || 'Giocatore 1').trim().slice(0, 14),
        ($('#nome-1').value || 'Giocatore 2').trim().slice(0, 14)
      ];
      avviaPartita();
    });

    $('#btn-regole-avvio').addEventListener('click', function () { $('#overlay-regole').hidden = false; });
    $('#btn-chiudi-regole').addEventListener('click', function () { $('#overlay-regole').hidden = true; });

    /* ordine delle carte in mano: i tre bottoni ora stanno nella barra dei
     * comandi e vengono ricreati a ogni render, quindi il click lo si
     * intercetta con la delega su #barra-azioni */
    $('#tavolo').addEventListener('click', function (ev) {
      const btn = ev.target && ev.target.closest ? ev.target.closest('.ord-btn') : null;
      if (!btn) return;
      if (!ui.partita) return;
      if (ui.ordineMano === btn.dataset.ordine) return;
      ui.ordineMano = btn.dataset.ordine;
      render();
    });

    $('#btn-menu').addEventListener('click', function () { $('#overlay-menu').hidden = false; });
    $('#btn-menu-riprendi').addEventListener('click', function () { $('#overlay-menu').hidden = true; });
    $('#btn-menu-regole').addEventListener('click', function () {
      $('#overlay-menu').hidden = true;
      $('#overlay-regole').hidden = false;
    });
    $('#btn-menu-nuova').addEventListener('click', function () {
      $('#overlay-menu').hidden = true;
      $('#overlay-fine').hidden = true;
      $('#tavolo').hidden = true;
      $('#schermata-avvio').hidden = false;
    });

    $('#btn-consegna').addEventListener('click', function () {
      ui.attesaConsegna = false;
      ui.manoVisibile = ui.partita.stato.turno;
      $('#overlay-consegna').hidden = true;
      render();
    });

    /* pesca toccando i mazzetti (delega: a quattro giocatori il campo viene
     * ricostruto, i listener diretti su #mazzetto-* andrebbero persi) */
    document.addEventListener('click', function (ev) {
      if (!ev.target || !ev.target.closest) return;
      const p = ui.partita;
      if (!p || p.stato.finita || ui.botInCorso) return;
      if (p.stato.fase !== 'pesca' || p.stato.turno !== ui.manoVisibile) return;
      if (ev.target.closest('#mazzetto-tallone')) {
        if (!p.stato.tallone.length) return;
        esegui(function () { return p.pescaTallone(); }, 'pesca');
      } else if (ev.target.closest('#mazzetto-monte')) {
        if (!p.stato.monte.length) return;
        esegui(function () { return p.prendiMonte(); }, 'pesca');
      }
    });

    /* click sulle combinazioni: attacca la carta selezionata oppure sposta
     * la carta scelta con un tocco */
    document.addEventListener('click', function (ev) {
      if (ui.sopprimiClic) return;
      if (!ev.target.closest) return;
      const meldEl = ev.target.closest('.meld');
      if (!meldEl) return;
      const g = Number(meldEl.dataset.giocatore);
      const idx = Number(meldEl.dataset.indice);
      if (g !== ui.manoVisibile) return;
      const cartaEl = ev.target.closest('.meld .carta');
      if (cartaEl && cartaEl.dataset.id) {
        onClicCartaMeld(g, idx, cartaEl.dataset.id);
        return;
      }
      onClicMeld(g, idx);
    });

    /* scorciatoie da tastiera */
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') {
        ui.selezione.clear();
        ui.spostamento = null;
        render();
      }
      if (ev.key === 'Enter') {
        const bar = $('#barra-azioni');
        const primo = bar.querySelector('.btn-primario:not(:disabled)');
        if (primo) primo.click();
      }
    });
  }

  /* Evidenzia le combinazioni su cui si può attaccare la carta selezionata
   * oppure in cui si può spostare la carta scelta da un'altra combinazione. */
  function evidenziaTarget() {
    const p = ui.partita;
    if (!p) return;
    const s = p.stato;
    if (s.fase !== 'gioco' || s.turno !== ui.manoVisibile || ui.botInCorso) return;
    const contenitori = $$('#melds-0 .meld');

    if (ui.spostamento) {
      const carta = cartaDiMeld(ui.spostamento.indiceMeld, ui.spostamento.idCarta);
      if (!carta) { ui.spostamento = null; return; }
      const validi = meldsCheAccettano(carta, ui.spostamento.indiceMeld);
      contenitori.forEach(function (el) {
        const i = Number(el.dataset.indice);
        if (validi.indexOf(i) >= 0) el.classList.add('target');
        if (i === ui.spostamento.indiceMeld) el.classList.add('origine');
      });
      const scelta = contenitori.filter(function (el) {
        return Number(el.dataset.indice) === ui.spostamento.indiceMeld;
      })[0];
      if (scelta) {
        const c = scelta.querySelector('.carta[data-id="' + ui.spostamento.idCarta + '"]');
        if (c) c.classList.add('scelta-per-spostare');
      }
      return;
    }

    const sel = carteSelezionate();
    if (sel.length !== 1) return;
    const compatibili = p.meldsCompatibili(ui.manoVisibile, sel[0].id);
    contenitori.forEach(function (el) {
      if (compatibili.indexOf(Number(el.dataset.indice)) >= 0) el.classList.add('target');
    });
  }

  /* =====================================================================
   * AVVIO
   * ===================================================================== */
  collegaScelte();

  /* Il gioco sta dentro il sito delle carte: il collegamento alla dashboard
   * ha senso solo quando la pagina è servita da /burraco/. Da sola (cartella
   * aperta da file:// o pubblicata come sito a sé) non avrebbe una dashboard
   * a cui tornare, quindi lo si nasconde. */
  (function collegaRitorno() {
    const link = document.getElementById('link-giochi');
    if (!link) return;
    const servito = /^https?:$/.test(window.location.protocol) &&
      /\/burraco(\/|$)/i.test(window.location.pathname);
    if (!servito) link.hidden = true;
  })();

  /* Aggancio di diagnostica: consente di pilotare la partita dalla console
   * del browser (utile per il debug e per i test automatici). */
  window.__burraco = {
    ui: ui,
    render: render,
    avvia: function (config) {
      if (config) {
        if (config.modo) ui.config.modo = config.modo;
        if (config.livello) ui.config.livello = config.livello;
        if (config.target) ui.config.target = config.target;
        if (config.giocatori) ui.config.giocatori = config.giocatori;
        if (config.nomi) ui.config.nomi = config.nomi.slice();
      }
      avviaPartita();
    },
    azione: esegui,
    mostraFineSmazzata: mostraFineSmazzata
  };
})();
