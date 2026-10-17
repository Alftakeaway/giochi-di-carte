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
    config: { modo: 'cpu', livello: 'normale', target: 2005, nomi: ['Tu', 'Computer'] },
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

  /* Dispone la mano in blocchi: prima le combinazioni che si possono già
   * calare (tris e scale, con le matte al posto giusto), poi le carte
   * sciolte. Serve a vedere a colpo d'occhio cosa si ha in mano. */
  function raggruppaMano(carte) {
    const sciolte = carte.slice().sort(perSemeEValore);
    if (ui.ordineMano !== 'combinazioni') return [{ carte: sciolte, tipo: 'resto', punti: 0 }];

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
  /* Il jolly è disegnato con un SVG: l'emoji 🃏 cambia aspetto (e a volte
   * non esiste) da un sistema all'altro, il disegno no. */
  function svgJolly() {
    return '<svg class="jolly-svg" viewBox="0 0 40 44" aria-hidden="true">' +
      '<path d="M4 7 L12 15 L20 4 L28 15 L36 7 C36 19 29 27 20 33 C11 27 4 19 4 7 Z" fill="#7b1fa2"/>' +
      '<circle cx="4" cy="7" r="3.1" fill="#e0bb52"/>' +
      '<circle cx="20" cy="4" r="3.1" fill="#e0bb52"/>' +
      '<circle cx="36" cy="7" r="3.1" fill="#e0bb52"/>' +
      '</svg>';
  }

  function creaCartaEl(carta, opzioni) {
    const o = opzioni || {};
    const el = document.createElement('div');
    el.className = 'carta' + (carta.rossa ? ' rossa' : ' nera') + (carta.jolly ? ' jolly' : '');
    el.dataset.id = carta.id;

    if (o.coperta) {
      el.classList.add('coperta');
      return el;
    }

    /* matta dentro una combinazione: si comporta come la carta che rappresenta
     * (angolo con valore e seme) ma resta riconoscibile dal colore viola */
    if (o.wild && o.valoreRappresentato) {
      el.classList.add('matta-figurata');
      const r = E.RANGO_CORTO[o.valoreRappresentato] || String(o.valoreRappresentato);
      const s = E.SIMBOLO[o.seme] || (carta.seme ? E.SIMBOLO[carta.seme] : '') || '';
      if (s === '\u2665' || s === '\u2666') el.classList.add('rossa');
      el.innerHTML =
        '<span class="angolo alto"><span class="rango">' + r + '</span><span class="seme">' + s + '</span></span>' +
        '<span class="centro">' + s + '</span>' +
        '<span class="angolo basso"><span class="rango">' + r + '</span><span class="seme">' + s + '</span></span>' +
        '<span class="badge-matta">MATTA</span>';
      if (o.titolo) el.title = o.titolo;
      return el;
    }

    if (carta.jolly) {
      el.innerHTML =
        '<span class="centro">' + svgJolly() + '</span>' +
        '<span class="etichetta-jolly">JOLLY</span>' +
        '<span class="badge-matta">MATTA</span>';
    } else {
      const r = E.RANGO_CORTO[carta.valore] || String(carta.valore);
      const s = E.SIMBOLO[carta.seme] || '';
      el.innerHTML =
        '<span class="angolo alto"><span class="rango">' + r + '</span><span class="seme">' + s + '</span></span>' +
        '<span class="centro">' + s + '</span>' +
        '<span class="angolo basso"><span class="rango">' + r + '</span><span class="seme">' + s + '</span></span>' +
        (carta.valore === 2 ? '<span class="badge-matta">MATTA</span>' : '');
    }

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
    renderAzioni();

    $('#log-mosse').textContent = ui.messaggio ||
      (s.log && s.log.length ? s.log[s.log.length - 1] : '');
  }

  function renderPunteggi() {
    const p = ui.partita;
    const s = p.stato;
    const box = $('#punteggi');
    box.innerHTML = '';
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

  function renderAvversario() {
    const p = ui.partita;
    const s = p.stato;
    const g = 1 - ui.manoVisibile;

    $('#etichetta-avversario').textContent = nomeGiocatore(g);

    const pill = $('#pill-avversario');
    const bur = p.contaBurrachi(g);
    const pt = p.puntiMeld(g) + p.bonusMeld(g);
    pill.textContent = pt + ' pt' + (bur ? ' · ' + bur + ' burraco' + (bur > 1 ? 'hi' : '') : '');

    $('#pill-pozzetto-avv').textContent = s.pozzettoPreso[g] ? 'pozzetto preso' : 'pozzetto da prendere';

    const manoEl = $('#mano-avversario');
    manoEl.innerHTML = '';
    const n = s.mani[g].length;
    for (let i = 0; i < n; i++) {
      const el = creaCartaEl(s.mani[g][i], { coperta: true });
      el.style.marginLeft = i === 0 ? '0' : '-20px';
      manoEl.appendChild(el);
    }
    if (n === 0) {
      const v = document.createElement('div');
      v.style.cssText = 'font-size:12px;opacity:.5';
      v.textContent = 'nessuna carta in mano';
      manoEl.appendChild(v);
    }
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
    $('#tallone-didascalia').innerHTML = '<strong>Tallone</strong>' + (nT ? carte(nT) : 'esaurito');
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
    $('#monte-didascalia').innerHTML = '<strong>Monte</strong>' + (n ? carte(n) : 'vuoto');
    const mm = $('#mazzetto-monte');
    const utile = possoPescare && n > 0;
    mm.classList.toggle('cliccabile', utile);
    mm.classList.toggle('evidenziato', utile && n > 0 && !s.tallone.length);
  }

  function renderMelds() {
    for (let lato = 0; lato < 2; lato++) {
      const g = lato === 0 ? ui.manoVisibile : 1 - ui.manoVisibile;
      const cont = document.getElementById('melds-' + lato);
      cont.innerHTML = '';
      const melds = ui.partita.stato.melds[g];
      if (!melds.length) {
        const v = document.createElement('div');
        v.className = 'vuoto';
        v.textContent = lato === 0 ? 'Nessuna combinazione calata' : 'Nessuna combinazione';
        cont.appendChild(v);
      }
      melds.forEach(function (m, idx) { cont.appendChild(creaMeldEl(m, g, idx)); });
    }
    const p = ui.partita;
    const bur = p.contaBurrachi(ui.manoVisibile);
    $('#pill-mie').textContent = (p.puntiMeld(ui.manoVisibile) + p.bonusMeld(ui.manoVisibile)) +
      ' pt' + (bur ? ' · ' + bur + ' burraco' + (bur > 1 ? 'hi' : '') : '');
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

  /* Una combinazione è una pila verticale: le carte si sovrappongono e si
   * vede solo l'angolo in alto a sinistra. Quando è un burraco l'ultima carta
   * in basso viene messa di traverso, come si fa al tavolo. */
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
      /* impilate come sul tavolo: la carta più in basso copre quella sopra,
       * così di ognuna resta visibile solo l'angolo in alto a sinistra */
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

    /* dall'ultima carta alla seconda: la prima finisce in fondo alla pila */
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

  function renderMano() {
    const p = ui.partita;
    const s = p.stato;
    const g = ui.manoVisibile;
    const manoEl = $('#mano-giocatore');
    manoEl.innerHTML = '';

    $('#etichetta-mano').textContent = (ui.config.modo === 'cpu' && g === 0)
      ? 'La tua mano'
      : 'Mano di ' + nomeGiocatore(g);
    $('#pill-mano').textContent = carte(s.mani[g].length);
    $('#pill-pozzetto-mio').textContent = s.pozzettoPreso[g]
      ? 'pozzetto preso'
      : 'pozzetto pronto (' + (s.pozzetti[g] || []).length + ')';

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

    /* sovrapposizione calcolata in base allo spazio disponibile: fra un
     * blocco e l'altro resta un varco, così i tris e le scale si distinguono */
    requestAnimationFrame(function () {
      const stile = getComputedStyle(document.documentElement);
      const cw = parseFloat(stile.getPropertyValue('--cw')) || 62;
      const gap = 6;
      const varco = blocchi.length > 1 ? 9 : 0;
      const n = nodi.length;
      if (!n) return;
      const larghezza = manoEl.clientWidth - 8;
      const varchi = inizioBlocco.size * varco;
      const totale = n * cw + (n - 1) * gap + varchi;
      let sovrapposizione = 0;
      if (totale > larghezza && n > 1) sovrapposizione = (totale - larghezza) / (n - 1);
      nodi.forEach(function (el, i) {
        if (i === 0) { el.style.marginLeft = '0'; return; }
        const extra = inizioBlocco.has(i) ? varco : 0;
        el.style.marginLeft = Math.round(gap - sovrapposizione + extra) + 'px';
      });
    });
  }

  function renderAzioni() {
    const p = ui.partita;
    const s = p.stato;
    const bar = $('#barra-azioni');
    bar.innerHTML = '';

    if (s.finita) return;

    const g = ui.manoVisibile;
    const eMioTurno = s.turno === g && !ui.botInCorso && !ui.attesaConsegna;

    if (!eMioTurno) {
      const att = document.createElement('div');
      att.style.cssText = 'font-size:13.5px;opacity:.7;padding:10px';
      att.textContent = '⏳ In attesa di ' + nomeGiocatore(s.turno) + '…';
      bar.appendChild(att);
      return;
    }

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
      bar.appendChild(b1);
      bar.appendChild(b2);
      bar.appendChild(suggerimento());
      return;
    }

    /* ---- fase di gioco ---- */
    const selezionate = carteSelezionate();
    const anteprima = document.createElement('div');
    anteprima.className = 'anteprima';
    anteprima.id = 'anteprima';
    bar.appendChild(anteprima);

    if (!selezionate.length) {
      anteprima.className = 'anteprima guida';
      anteprima.textContent = ui.spostamento
        ? 'Tocca la combinazione che deve ricevere la carta, oppure trascinala.'
        : 'Tocca una carta per scartarla, 3 o più carte per calare una combinazione, oppure trascina una carta su una combinazione.';
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
    bar.appendChild(bCala);

    const bScarta = pulsante(
      (selezionate.length === 1 && p.chiudeCon(g, selezionate[0].id)) ? '🏁 Chiudi la smazzata' : '⬇️ Scarta',
      (selezionate.length === 1 && p.chiudeCon(g, selezionate[0].id)) ? 'btn-oro' : '',
      function () {
        esegui(function () { return p.scarta(carteSelezionate()[0].id); }, 'scarta');
      });
    bScarta.disabled = !(selezionate.length === 1 && !p.scartoVietato(g, selezionate[0].id));
    bar.appendChild(bScarta);

    if (selezionate.length) {
      bar.appendChild(pulsante('✕ Annulla', 'btn-icona', function () {
        ui.selezione.clear();
        render();
      }));
    }
    bar.appendChild(suggerimento());
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
    if (ui.config.modo === 'cpu' && s.turno === 1) {
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
    if (p.stato.finita) mostraFineSmazzata();
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
      box2.textContent = '🏆 ' + nomeGiocatore(s.vincitore) + ' vince la partita!';
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
    let h = '<table class="tabella-punti"><thead><tr><th>Voce</th><th>' +
      escapeHtml(nomeGiocatore(0)) + '</th><th>' + escapeHtml(nomeGiocatore(1)) + '</th></tr></thead><tbody>';

    const riga = function (etichetta, v0, v1, classe) {
      const fmt = function (v) {
        if (v === null || v === undefined || v === 0) return '<span style="opacity:.35">—</span>';
        const segno = v > 0 ? '+' : '−';
        const cls = v > 0 ? 'positivo' : 'negativo';
        return '<span class="' + cls + '">' + segno + Math.abs(v) + '</span>';
      };
      return '<tr' + (classe ? ' class="' + classe + '"' : '') + '><td>' + etichetta + '</td><td>' +
        fmt(v0) + '</td><td>' + fmt(v1) + '</td></tr>';
    };

    const d = pu.dettaglio;
    h += riga('Carte calate', d[0].puntiCarte, d[1].puntiCarte);
    h += riga('Bonus burraco (' + d[0].burrachi + ' / ' + d[1].burrachi + ')',
      d[0].bonusBurraco, d[1].bonusBurraco);
    h += riga('Bonus chiusura', d[0].chiusura, d[1].chiusura);
    h += riga('Carte rimaste in mano', -d[0].carteInMano, -d[1].carteInMano);
    h += riga('Pozzetto non preso', -d[0].penalePozzetto, -d[1].penalePozzetto);
    const num = function (v) { return String(v).replace('-', '−'); };
    h += '<tr class="totale"><td>Punti smazzata</td><td>' + num(pu.punti[0]) +
      '</td><td>' + num(pu.punti[1]) + '</td></tr>';
    h += '<tr class="totale"><td>Totale partita</td><td class="totale-parziale">' + num(p.stato.totali[0]) +
      ' / ' + p.target + '</td><td class="totale-parziale">' + num(p.stato.totali[1]) + ' / ' + p.target + '</td></tr>';
    h += '</tbody></table>';
    return h;
  }

  /* =====================================================================
   * AVVIO PARTITA
   * ===================================================================== */
  function avviaPartita() {
    ui.partita = new E.Partita({
      target: ui.config.target,
      nomi: ui.config.nomi.slice()
    });
    ui.selezione.clear();
    ui.attesaConsegna = false;
    ui.botInCorso = false;
    ui.manoVisibile = 0;
    ui.messaggio = '';

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
        $('#nome-1').value = ui.config.modo === 'cpu' ? 'Computer' : 'Giocatore 2';
      });
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

    /* ordine delle carte in mano: per combinazioni possibili o per seme */
    $('#toggle-ordine').addEventListener('click', function () {
      if (!ui.partita) return;
      ui.ordineMano = ui.ordineMano === 'combinazioni' ? 'seme' : 'combinazioni';
      $('#toggle-ordine-testo').textContent =
        ui.ordineMano === 'combinazioni' ? 'per combinazioni' : 'per seme';
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

    /* pesca toccando i mazzetti */
    $('#mazzetto-tallone').addEventListener('click', function () {
      const p = ui.partita;
      if (!p || p.stato.finita) return;
      if (p.stato.fase !== 'pesca' || p.stato.turno !== ui.manoVisibile || ui.botInCorso) return;
      if (!p.stato.tallone.length) return;
      esegui(function () { return p.pescaTallone(); }, 'pesca');
    });
    $('#mazzetto-monte').addEventListener('click', function () {
      const p = ui.partita;
      if (!p || p.stato.finita) return;
      if (p.stato.fase !== 'pesca' || p.stato.turno !== ui.manoVisibile || ui.botInCorso) return;
      if (!p.stato.monte.length) return;
      esegui(function () { return p.prendiMonte(); }, 'pesca');
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
        if (config.nomi) ui.config.nomi = config.nomi.slice();
      }
      avviaPartita();
    },
    azione: esegui
  };
})();
