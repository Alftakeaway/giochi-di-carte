/* =====================================================================
 * ui.js — Gestione del DOM, rendering delle carte, animazioni e
 *         Controller che coordina engine + bot + rete (P2P).
 * ===================================================================== */
'use strict';

/* ---------------------------------------------------------------------
 * UI — helper puri per la costruzione dei nodi carta e le animazioni
 * --------------------------------------------------------------------- */
const UI = {
  /* Dimensioni base carta (px) usate per le animazioni */
  CARTA_W: 64,
  CARTA_H: 90,

  /**
   * Crea il nodo DOM di una carta.
   * @param {Carta} carta
   * @param {object} [opts] { coperta, selezionabile, selezionata, cliccabile, onClic }
   * @returns {HTMLElement}
   */
  creaCarta(carta, opts = {}) {
    const node = document.createElement('div');
    node.className = 'carta';
    node.dataset.id = carta.id;
    node.dataset.valore = carta.valore;
    node.dataset.seme = carta.seme.nome;

    // Di default la carta si mostra scoperta (fronte); il retro solo se
    // viene richiesto esplicitamente con coperta:true. (engine.js marca
    // ogni carta come coperta=TRUE per default, quindi NON bisogna
    // ripiegare su carta.coperta qui, altrimenti tutte le carte
    // risulterebbero coperte.)
    const coperta = opts.coperta !== undefined ? opts.coperta : false;
    if (coperta) node.classList.add('coperta');

    const confMazzo = MAZZI_ITALIANI[carta.tipoMazzo] || {};
    const retroClass = carta.tipoMazzo === 'francese' ? 'pattern-francese' : (confMazzo.retro || 'pattern-napoletane');

    // Facce reali: per i mazzi con immagini si usa la foto ritagliata
    // (es. img/napoletane/denari_07.jpg) al posto del rendering CSS/SVG.
    const usaImmagine = !carta.jolly && !!confMazzo.immagini;

    node.innerHTML = `
      <div class="carta-inner">
        <div class="carta-fronte ${usaImmagine ? 'fronte-immagine' : ''}" style="--accento:${carta.seme.colore}">
          ${this._fronteHtml(carta, confMazzo, usaImmagine)}
        </div>
        <div class="carta-retro ${retroClass} ${usaImmagine ? 'retro-immagine' : ''}">
          ${usaImmagine
            ? `<img class="retro-img" src="img/${carta.tipoMazzo}/retro.jpg" alt="" draggable="false">`
            : this._emblemaRetro()}
        </div>
      </div>`;

    if (opts.selezionata) node.classList.add('selezionata');
    if (opts.selezionabile) node.classList.add('selezionabile');
    if (opts.cliccabile) node.classList.add('cliccabile');
    if (opts.onClic) node.addEventListener('click', (ev) => { ev.stopPropagation(); opts.onClic(carta, node, ev); });
    return node;
  },

  /* Contenuto del fronte di una carta: foto reale (mazzi con immagini)
     oppure rendering CSS/SVG (valori, figure, asso). */
  _fronteHtml(carta, confMazzo, usaImmagine) {
    if (usaImmagine) {
      const percorso = `img/${carta.tipoMazzo}/${carta.seme.nome}_${String(carta.valore).padStart(2, '0')}.jpg`;
      return `<img class="faccia-img" src="${percorso}" alt="${carta.nome} di ${carta.seme.nome}" draggable="false">`;
    }
    return `
      <div class="angolo alto">
        <span class="valore">${carta.nome}</span>
        <span class="seme">${carta.seme.simbolo}</span>
      </div>
      <div class="centro">
        ${carta.eFigura
          ? `<div class="figura-container">${this._figuraSvg(carta.nome, confMazzo.accento)}</div><span class="figura-nome">${carta.nome}</span>`
          : carta.eJolly
            ? `<span class="figura jolly">JOLLY</span><span class="seme-grande">${carta.seme.simbolo}</span>`
            : carta.valore === 1
              ? this._assoCentro(carta)
              : this._puntiCentro(carta)}
      </div>
      <div class="angolo basso">
        <span class="seme">${carta.seme.simbolo}</span>
        <span class="valore">${carta.nome}</span>
      </div>`;
  },

  /* Riproduce i "semi" centrali delle carte numeriche (1..10) nella
     disposizione tradizionale (a colonne simmetriche). */
  _puntiCentro(carta) {
    const n = carta.valore;
    const sim = `<span class="seme-punto">${carta.seme.simbolo}</span>`;
    const ripeti = (k) => Array.from({ length: k }, () => sim).join('');
    let layout = '';
    if (n === 1) layout = `<div class="punto singolo">${sim}</div>`;
    else if (n === 2) layout = `<div class="punto due">${ripeti(2)}</div>`;
    else if (n === 3) layout = `<div class="punto tre">${ripeti(3)}</div>`;
    else if (n === 4) layout = `<div class="punto quattro">${ripeti(4)}</div>`;
    else if (n === 5) layout = `<div class="punto cinque">${ripeti(4)}<span class="centro-punto">${sim}</span></div>`;
    else if (n === 6) layout = `<div class="punto sei">${ripeti(6)}</div>`;
    else if (n === 7) layout = `<div class="punto sette">${ripeti(6)}<span class="centro-punto">${sim}</span></div>`;
    else if (n === 8) layout = `<div class="punto otto">${ripeti(8)}</div>`;
    else if (n === 9) layout = `<div class="punto nove">${ripeti(8)}<span class="centro-punto">${sim}</span></div>`;
    else layout = `<div class="punto dieci">${ripeti(10)}</div>`;
    return layout;
  },

  /* Asso ornamentale: simbolo grande dentro un anello decorativo. */
  _assoCentro(carta) {
    return `<div class="asso"><span class="asso-anello">${carta.seme.simbolo}</span></div>`;
  },

  /* Illustrazione SVG di una figura (Fante/Donna/Cavallo/Re) in stile
     tradizionale, colorata con l'accento del mazzo regionale. */
  _figuraSvg(nome, accento) {
    const uid = 'fig' + (++UI._uid);
    const col = accento || '#c9971a';
    const scuro = UI._ombreggia(col, -0.35);
    const chiaro = UI._ombreggia(col, 0.35);
    const tipo = String(nome).toLowerCase();
    let accessori = '';
    if (tipo.includes('re')) {
      accessori = `<path d="M19 34 L17 25 Q17 21 21 20 L22 27 L25 21 L28 27 L30 20 L32 27 L35 21 L38 27 L39 20 Q43 21 43 25 L41 34 Z" fill="#f4c74d" stroke="#a8781a" stroke-width="0.8"/>`;
    } else if (tipo.includes('cavallo')) {
      accessori = `<path d="M18 36 Q17 24 30 22 Q43 24 42 36 Q44 21 30 19 Q16 21 18 36 Z" fill="#8e99a6"/><path d="M30 20 V11" stroke="#8e99a6" stroke-width="3"/><path d="M30 14 L25 9 M30 14 L35 9" stroke="#8e99a6" stroke-width="2"/>`;
    } else if (tipo.includes('donna')) {
      accessori = `<path d="M18 42 Q16 24 30 22 Q44 24 42 42 Q40 27 30 29 Q20 27 18 42 Z" fill="#6d4421"/><circle cx="30" cy="26.5" r="2.3" fill="#e34b3f"/>`;
    } else {
      accessori = `<path d="M18 39 Q18 26 30 23 Q42 26 42 39 Q40 27 30 28 Q20 27 18 39 Z" fill="#3d2b1f"/>`;
    }
    return `<svg class="figura-illustrazione" viewBox="0 0 60 90" aria-hidden="true">
      <defs>
        <linearGradient id="${uid}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="${chiaro}"/><stop offset="1" stop-color="${scuro}"/>
        </linearGradient>
      </defs>
      <path d="M8 90 V42 Q8 16 30 16 Q52 16 52 42 V90 Z" fill="rgba(0,0,0,0.06)"/>
      <path d="M12 90 Q12 58 30 56 Q48 58 48 90 Z" fill="url(#${uid})"/>
      <path d="M21 61 Q30 70 39 61 Q35 74 25 74 Z" fill="#fffdf6" opacity="0.9"/>
      <circle cx="30" cy="40" r="12.5" fill="#e8b48c"/>
      ${accessori}
    </svg>`;
  },

  /* Emblema centrale del retro: rombo + stella in tinte regionali. */
  _emblemaRetro() {
    return `<svg class="retro-emblema" viewBox="0 0 44 44" aria-hidden="true">
      <rect x="9" y="9" width="26" height="26" transform="rotate(45 22 22)" fill="none" stroke="var(--retro-a, #8a1f2b)" stroke-width="2"/>
      <rect x="12.5" y="12.5" width="19" height="19" transform="rotate(45 22 22)" fill="var(--retro-c, #c9971a)" opacity="0.30"/>
      <path d="M22 13 L25 19 L31 20.5 L25 22 L22 28 L19 22 L13 20.5 L19 19 Z" fill="var(--retro-a, #8a1f2b)"/>
    </svg>`;
  },

  /* Schiarisce/scurisce un colore esadecimale (-1..1). */
  _ombreggia(hex, fattore) {
    if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return hex;
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const t = fattore < 0 ? 0 : 255;
    const p = Math.abs(fattore);
    r = Math.round(r + (t - r) * p);
    g = Math.round(g + (t - g) * p);
    b = Math.round(b + (t - b) * p);
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
  },

  /** Coordinate centro (viewport) di un elemento o di un contenitore. */
  coordinateDi(el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  },

  /**
   * animaSpostamento(cartaId, coordInizio, coordFine, opts)
   * Fa "volare" una carta dal punto A al punto B con transizioni CSS
   * dinamiche (posizione assoluta + transition su left/top/transform).
   * @returns {Promise<void>}
   */
  animaSpostamento(cartaId, coordInizio, coordFine, opts = {}) {
    const { durata = 450, angolo = 8 } = opts;
    return new Promise((resolve) => {
      const w = UI.CARTA_W, h = UI.CARTA_H;
      const carta = opts.carta || null;
      const confVolante = (carta && MAZZI_ITALIANI[carta.tipoMazzo]) || {};
      const usaRetroFoto = !!(carta && confVolante.immagini);
      const retroVolanteClass = carta && carta.tipoMazzo === 'francese' ? 'pattern-francese' : (confVolante.retro || 'pattern-napoletane');
      // la carta volante mostra la FACCIA, così si vede sempre quale carta
      // l'avversario sta giocando (e quale esce quindi dal gioco)
      const fronte = carta
        ? `<div class="carta-fronte ${usaRetroFoto ? 'fronte-immagine' : ''}" style="--accento:${carta.seme.colore}">${UI._fronteHtml(carta, confVolante, usaRetroFoto)}</div>`
        : `<div class="carta-fronte volante-fronte"></div>`;
      const retro = usaRetroFoto
        ? `<div class="carta-retro ${retroVolanteClass} retro-immagine"><img class="retro-img" src="img/${carta.tipoMazzo}/retro.jpg" alt=""></div>`
        : `<div class="carta-retro ${retroVolanteClass}"></div>`;
      const volante = document.createElement('div');
      volante.className = 'carta volante';
      volante.dataset.id = cartaId;
      volante.innerHTML = `<div class="carta-inner">${fronte}${retro}</div>`;
      volante.style.width = w + 'px';
      volante.style.height = h + 'px';
      volante.style.left = (coordInizio.x - w / 2) + 'px';
      volante.style.top = (coordInizio.y - h / 2) + 'px';
      volante.style.transition = `left ${durata}ms cubic-bezier(.25,.8,.3,1), top ${durata}ms cubic-bezier(.25,.8,.3,1), transform ${durata}ms ease`;
      document.body.appendChild(volante);

      // forza il reflow per attivare la transizione
      void volante.offsetWidth;
      volante.style.left = (coordFine.x - w / 2) + 'px';
      volante.style.top = (coordFine.y - h / 2) + 'px';
      volante.style.transform = `rotate(${angolo}deg) scale(1.05)`;

      setTimeout(() => { volante.remove(); resolve(); }, durata + 50);
    });
  },

  /** Collega il nodo carta reale al container (dopo l'animazione). */
  montaCarta(node, container) {
    container.appendChild(node);
  },

  /** Messaggio temporaneo sovrapposto al tavolo. */
  notifica(testo, tipo = 'info', ms = 1600) {
    const el = document.getElementById('notifica');
    if (!el) return;
    el.textContent = testo;
    el.className = `notifica visibile ${tipo}`;
    clearTimeout(UI._timerNotifica);
    UI._timerNotifica = setTimeout(() => el.classList.remove('visibile'), ms);
  },

  formattaPuntiBriscola(punti) {
    const nomi = { 11: 'Asso', 10: 'Tre', 4: 'Re', 3: 'Cavallo', 2: 'Fante', 0: 'zero' };
    return punti;
  }
};

/* ---------------------------------------------------------------------
 * CONTROLLER — coordina engine, bot, rete e UI
 * --------------------------------------------------------------------- */
class Controller {
  constructor(config) {
    this.config = config;
    this.gioco = creaGioco({ tipo: config.gioco, tipoMazzo: config.mazzo });
    this.modalita = config.modalita;         // 'bot' | 'p2p'
    this.ruolo = config.ruolo || 'host';     // per p2p
    this.nome = config.nome || 'Giocatore';
    this.occupato = false;                   // evita doppie mosse
    this.selezione = new Set();              // id carte selezionate (burraco)
    this.comboSelezionata = null;            // indice combinazione per legare
    this.inPresa = null;                     // scopa: { carta, combinazioni }
    this.attesaBot = false;
    this.game = document.getElementById('gioco');
  }

  /* ------------------------- avvio ------------------------- */

  async avvia() {
    // In P2P solo l'host crea la partita; il guest riceve lo stato
    // autorevole (incluse le proprie carte) tramite broadcastGameState.
    const aspettaHost = this.modalita === 'p2p' && this.ruolo === 'guest';
    this.umano = this.modalita === 'bot' ? 0 : (this.ruolo === 'host' ? 0 : 1);
    this.botIdx = 1 - this.umano;
    if (!aspettaHost) this.gioco.inizializza();
    this.render();
    this._aggiornaTitolo();

    if (this.modalita === 'bot') {
      await this._sveglia();
    } else {
      if (this.ruolo === 'guest') {
        UI.notifica('In attesa della partita dall\'host…', 'info', 3000);
      } else {
        await this._sveglia();
      }
    }
  }

  /* Dopo ogni mossa: se tocca al bot (o se in p2p è il turno locale
   * dell'host e non c'è stato remoto) programma la prossima azione. */
  async _sveglia() {
    if (this.gioco.stato.fase === 'fine') {
      this._mostraFine();
      return;
    }
    this.render();

    // Stallo Burraco: mano vuota, mazzo e monte esauriti
    if (this.config.gioco === 'burraco' && this.gioco.verificaStallo()) {
      this.gioco._stallo();
      this._mostraFine();
      return;
    }

    if (this.modalita === 'bot') {
      if (this.gioco.stato.turno === this.botIdx) {
        this.attesaBot = true;
        await this._pausa(650);
        await this._mossaBot();
      }
      return;
    }

    // P2P: l'host è autorevole. Se è il turno dell'host gioca localmente
    // e poi trasmette. Il guest gioca localmente e invia la mossa.
    if (this.ruolo === 'host') {
      if (this.gioco.stato.turno === 0) {
        // attende il click del giocatore locale (host)
      }
    } else {
      if (this.gioco.stato.turno === 1) {
        // attende il click del giocatore locale (guest)
      }
    }
  }

  _pausa(ms) { return new Promise(r => setTimeout(r, ms)); }

  _aggiornaTitolo() {
    const t = document.getElementById('titolo-gioco');
    if (t) t.textContent = this.config.gioco.toUpperCase();
  }

  /* ------------------------- rendering ------------------------- */

  render() {
    if (!this.gioco.stato) return; // guest P2P: attende lo stato dall'host
    this._pulisciZone();
    switch (this.config.gioco) {
      case 'scopa': this._renderScopa(); break;
      case 'briscola': this._renderBriscola(); break;
      case 'burraco': this._renderBurraco(); break;
    }
    this._renderPunteggio();
    this._renderTurno();
    this._renderPulsanti();
  }

  _pulisciZone() {
    ['zona-avversario', 'zona-tavolo', 'zona-giocatore', 'zona-mazzi', 'zona-info',
     'zona-combinazioni-0', 'zona-combinazioni-1'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = '';
    });
  }

  _carta(opts = {}) {
    const node = UI.creaCarta(opts.carta, opts);
    return node;
  }

  /* ------------------------- SCOPA ------------------------- */

  _renderScopa() {
    const s = this.gioco.stato;

    // avversario (mano coperta)
    const avv = s.mani[1 - this.umano] || s.mani[1];
    const zonaAvv = document.getElementById('zona-avversario');
    avv.forEach(c => zonaAvv.appendChild(this._carta({ carta: c, coperta: true })));

    // tavolo
    const zonaTav = document.getElementById('zona-tavolo');
    s.tavolo.forEach(c => zonaTav.appendChild(this._carta({ carta: c })));

    // mano giocatore
    const zonaMan = document.getElementById('zona-giocatore');
    const mano = s.mani[this.umano] || s.mani[0];
    mano.forEach(c => {
      const mioTurno = s.turno === this.umano && s.fase === 'gioco';
      zonaMan.appendChild(this._carta({
        carta: c,
        selezionabile: mioTurno,
        cliccabile: mioTurno,
        onClic: () => this._clickScopa(c, mano)
      }));
    });

    // contatori prese
    this._infoScopa(s);
  }

  _infoScopa(s) {
    const zonaInfo = document.getElementById('zona-info');
    const p1 = s.prese[0].length, p2 = s.prese[1].length;
    zonaInfo.innerHTML = `<div class="info-blocco">
        <span class="info-label">Scope</span>
        <span class="info-valore">${s.scope[0]} : ${s.scope[1]}</span>
      </div>
      <div class="info-blocco">
        <span class="info-label">Prese</span>
        <span class="info-valore">${p1} : ${p2}</span>
      </div>`;
  }

  async _clickScopa(carta, mano) {
    if (this.occupato || this.gioco.stato.turno !== this.umano || this.gioco.stato.fase !== 'gioco') return;
    this.occupato = true;
    const s = this.gioco.stato;
    const esito = this.gioco.validaPresaScopa(carta, s.tavolo);

    const combinazioni = esito.combinazioni.filter(c => c.length > 0);
    if (combinazioni.length === 0) {
      // nessuna presa: la carta resta sul tavolo
      await this._animaManoVersoTavolo(carta);
      this.gioco.eseguiMossa(this.umano, carta.id, []);
      this.occupato = false;
      await this._sveglia();
      return;
    }
    if (combinazioni.length === 1) {
      await this._animaPresaScopa(carta, combinazioni[0]);
      this.gioco.eseguiMossa(this.umano, carta.id, combinazioni[0].map(c => c.id));
      this.occupato = false;
      await this._sveglia();
      return;
    }
    // più combinazioni: scelta dell'utente
    this.inPresa = { carta, combinazioni };
    this.render();
    this._mostraSceltaPresa(combinazioni, carta);
    this.occupato = false;
  }

  _mostraSceltaPresa(combinazioni, carta) {
    const zonaInfo = document.getElementById('zona-info');
    const scelte = combinazioni.map((combo, i) => {
      const btn = document.createElement('button');
      btn.className = 'btn btn-scelta';
      btn.innerHTML = `Prendi ${combo.map(c => `${c.nome} ${c.seme.simbolo}`).join(' + ')}`;
      btn.addEventListener('click', async () => {
        this.occupato = true;
        await this._animaPresaScopa(carta, combo);
        this.gioco.eseguiMossa(this.umano, carta.id, combo.map(c => c.id));
        this.inPresa = null;
        this.occupato = false;
        await this._sveglia();
      });
      return btn;
    });
    const info = document.createElement('p');
    info.className = 'info-scelta';
    info.textContent = 'Scegli come prendere:';
    zonaInfo.innerHTML = '';
    zonaInfo.append(info, ...scelte);
  }

  async _animaManoVersoTavolo(carta) {
    const src = document.querySelector(`#zona-giocatore .carta[data-id="${CSS.escape(carta.id)}"]`);
    const dst = document.getElementById('zona-tavolo');
    if (src && dst) {
      await UI.animaSpostamento(carta.id, UI.coordinateDi(src), UI.coordinateDi(dst), { carta });
    }
  }

  async _animaPresaScopa(carta, combo) {
    const src = document.querySelector(`#zona-giocatore .carta[data-id="${CSS.escape(carta.id)}"]`);
    const dst = document.getElementById('zona-tavolo');
    if (src && dst) {
      await UI.animaSpostamento(carta.id, UI.coordinateDi(src), UI.coordinateDi(dst), { carta });
    }
    if (combo.length > 0) {
      const dstPrese = document.getElementById('zona-info');
      for (const c of combo) {
        const node = document.querySelector(`#zona-tavolo .carta[data-id="${CSS.escape(c.id)}"]`);
        if (node) await UI.animaSpostamento(c.id, UI.coordinateDi(node), UI.coordinateDi(dstPrese), { durata: 320, carta: c });
      }
    }
    if (this.gioco.controllaScopa(this.gioco.stato.tavolo.filter(t => !combo.some(p => p.id === t.id)))) {
      UI.notifica('SCOPA! ✨', 'successo');
    }
  }

  /* ------------------------- BRISCOLA ------------------------- */

  _renderBriscola() {
    const s = this.gioco.stato;
    const avv = s.mani[1 - this.umano] || s.mani[1];
    const zonaAvv = document.getElementById('zona-avversario');
    avv.forEach(c => zonaAvv.appendChild(this._carta({ carta: c, coperta: true })));

    // mazzo + briscola
    const zonaMazzi = document.getElementById('zona-mazzi');
    if (s.mazzo.lunghezza > 0) {
      const mazzoNode = this._carta({ carta: s.mazzo.carte[0], coperta: true });
      mazzoNode.classList.add('stack');
      mazzoNode.title = `${s.mazzo.lunghezza} carte nel mazzo`;
      zonaMazzi.appendChild(mazzoNode);
    }
    if (s.briscola) {
      zonaMazzi.appendChild(this._carta({ carta: s.briscola }));
    }

    // tavolo (due slot)
    const zonaTav = document.getElementById('zona-tavolo');
    for (let i = 0; i < 2; i++) {
      const slot = document.createElement('div');
      slot.className = 'slot';
      if (s.tavolo[i]) {
        const giocataDa = i;
        slot.appendChild(this._carta({ carta: s.tavolo[i], coperta: false }));
        slot.classList.add(giocataDa === 0 ? 'lato-p1' : 'lato-p2');
      }
      zonaTav.appendChild(slot);
    }

    // mano giocatore
    const zonaMan = document.getElementById('zona-giocatore');
    const mano = s.mani[this.umano] || s.mani[0];
    const mioTurno = s.turno === this.umano && s.fase === 'gioco';
    mano.forEach(c => zonaMan.appendChild(this._carta({
      carta: c, coperta: false,
      selezionabile: mioTurno, cliccabile: mioTurno,
      onClic: () => this._clickBriscola(c)
    })));

    this._infoBriscola(s);
  }

  _infoBriscola(s) {
    const zonaInfo = document.getElementById('zona-info');
    zonaInfo.innerHTML = `
      <div class="info-blocco"><span class="info-label">Punti</span>
        <span class="info-valore">${s.punti[0]} : ${s.punti[1]}</span></div>
      <div class="info-blocco"><span class="info-label">Carte mazzo</span>
        <span class="info-valore">${s.mazzo.lunghezza}</span></div>`;
  }

  async _clickBriscola(carta) {
    if (this.occupato || this.gioco.stato.turno !== this.umano || this.gioco.stato.fase !== 'gioco') return;
    this.occupato = true;
    const src = document.querySelector(`#zona-giocatore .carta[data-id="${CSS.escape(carta.id)}"]`);
    const dst = document.getElementById('zona-tavolo');
    if (src && dst) await UI.animaSpostamento(carta.id, UI.coordinateDi(src), UI.coordinateDi(dst), { carta });
    const mossa = { tipo: 'gioca', cartaId: carta.id };
    await this._applicaMossa(mossa, this.umano);
    this.occupato = false;
    await this._sveglia();
  }

  /* ------------------------- BURRACO ------------------------- */

  _renderBurraco() {
    const s = this.gioco.stato;
    const avv = s.mani[1 - this.umano] || s.mani[1];
    const zonaAvv = document.getElementById('zona-avversario');
    avv.forEach(c => zonaAvv.appendChild(this._carta({ carta: c, coperta: true })));

    // mazzo + monte scarti
    const zonaMazzi = document.getElementById('zona-mazzi');
    if (s.mazzo.lunghezza > 0) {
      const mazzoNode = this._carta({ carta: s.mazzo.carte[0], coperta: true });
      mazzoNode.classList.add('stack');
      mazzoNode.title = `${s.mazzo.lunghezza} carte nel mazzo`;
      zonaMazzi.appendChild(mazzoNode);
    }
    if (s.monte.length > 0) {
      const top = s.monte[s.monte.length - 1];
      zonaMazzi.appendChild(this._carta({ carta: top }));
    }

    // combinazioni calate dei due giocatori
    for (const giocatore of [0, 1]) {
      const zona = document.getElementById(`zona-combinazioni-${giocatore}`);
      if (!zona) continue;
      s.combinazioni[giocatore].forEach((combo, idx) => {
        const box = document.createElement('div');
        box.className = 'combinazione' + (combo.burraco ? ' burraco' : '');
        box.title = `${combo.tipo} — ${combo.punti} pt${combo.burraco ? (combo.pulito ? ' (burraco pulito)' : ' (burraco sporco)') : ''}`;
        const isMio = giocatore === this.umano;
        combo.carte.forEach(c => {
          box.appendChild(this._carta({
            carta: c,
            coperta: false,
            cliccabile: isMio && s.turno === this.umano && s.fase === 'gioco',
            onClic: isMio ? () => this._selezionaComboPerLega(idx) : undefined
          }));
        });
        zona.appendChild(box);
      });
    }

    // mano giocatore
    const zonaMan = document.getElementById('zona-giocatore');
    const mano = s.mani[this.umano] || s.mani[0];
    const mioTurno = s.turno === this.umano && s.fase === 'gioco';
    mano.forEach(c => zonaMan.appendChild(this._carta({
      carta: c, coperta: false,
      selezionabile: mioTurno, cliccabile: mioTurno,
      selezionata: this.selezione.has(c.id),
      onClic: () => this._clickSelezioneBurraco(c)
    })));

    this._infoBurraco(s);
  }

  _infoBurraco(s) {
    const zonaInfo = document.getElementById('zona-info');
    zonaInfo.innerHTML = `
      <div class="info-blocco"><span class="info-label">Punti</span>
        <span class="info-valore">${s.punti[0]} : ${s.punti[1]}</span></div>
      <div class="info-blocco"><span class="info-label">Burrachi</span>
        <span class="info-valore">${s.burrachi[0]} : ${s.burrachi[1]}</span></div>
      <div class="info-blocco"><span class="info-label">Mazzo</span>
        <span class="info-valore">${s.mazzo.lunghezza}</span></div>`;
  }

  _clickSelezioneBurraco(carta) {
    if (this.occupato || this.gioco.stato.turno !== this.umano || this.gioco.stato.fase !== 'gioco') return;
    if (this.selezione.has(carta.id)) this.selezione.delete(carta.id);
    else this.selezione.add(carta.id);
    this.render();
  }

  _selezionaComboPerLega(idx) {
    this.comboSelezionata = this.comboSelezionata === idx ? null : idx;
    this.render();
  }

  _renderPulsanti() {
    const bar = document.getElementById('pulsanti');
    if (!bar) return;
    bar.innerHTML = '';
    const s = this.gioco.stato;
    const mioTurno = s.turno === this.umano && s.fase === 'gioco';

    if (this.config.gioco === 'burraco') {
      if (!mioTurno) { bar.classList.add('vuota'); return; }
      bar.classList.remove('vuota');

      const pescaMazzo = document.createElement('button');
      pescaMazzo.className = 'btn btn-primario';
      pescaMazzo.textContent = '🂠 Pesca dal mazzo';
      pescaMazzo.addEventListener('click', () => this._azioneBurraco({ tipo: 'pesca', sorgente: 'mazzo' }));

      const pescaMonte = document.createElement('button');
      pescaMonte.className = 'btn';
      pescaMonte.textContent = '♻ Pesca dal monte';
      pescaMonte.disabled = s.monte.length === 0;
      pescaMonte.addEventListener('click', () => this._azioneBurraco({ tipo: 'pesca', sorgente: 'monte' }));

      const cala = document.createElement('button');
      cala.className = 'btn';
      cala.textContent = `Cala selezione (${this.selezione.size})`;
      cala.disabled = this.selezione.size < 3;
      cala.addEventListener('click', () => this._azioneBurraco({ tipo: 'cala', idCarte: [...this.selezione] }));

      const lega = document.createElement('button');
      lega.className = 'btn';
      lega.textContent = this.comboSelezionata !== null
        ? `Lega 1 carta alla combinazione ${this.comboSelezionata}`
        : 'Lega (seleziona combinazione)';
      lega.disabled = this.selezione.size !== 1 || this.comboSelezionata === null;
      lega.addEventListener('click', () => {
        const [cartaId] = [...this.selezione];
        this._azioneBurraco({ tipo: 'lega', cartaId, indice: this.comboSelezionata });
      });

      const scarta = document.createElement('button');
      scarta.className = 'btn btn-pericolo';
      scarta.textContent = 'Scarta';
      scarta.disabled = this.selezione.size !== 1;
      scarta.addEventListener('click', () => {
        const [cartaId] = [...this.selezione];
        this._azioneBurraco({ tipo: 'scarta', cartaId });
      });

      bar.append(pescaMazzo, pescaMonte, cala, lega, scarta);
    }
  }

  async _azioneBurraco(mossa) {
    if (this.occupato || this.gioco.stato.fase !== 'gioco') return;
    if (this.gioco.stato.turno !== this.umano) return;
    this.occupato = true;
    await this._applicaMossa(mossa, this.umano);
    this.selezione.clear();
    this.comboSelezionata = null;
    this.occupato = false;
    await this._sveglia();
  }

  /* ------------------------- mossa (locale + rete) ------------------------- */

  /**
   * Applica una mossa all'engine locale e, in P2P, la propaga.
   * @param {object} mossa
   * @param {number} giocatore
   */
  async _applicaMossa(mossa, giocatore) {
    const s = this.gioco.stato;
    try {
      switch (mossa.tipo) {
        case 'gioca':
          if (this.config.gioco === 'scopa') {
            this.gioco.eseguiMossa(giocatore, mossa.cartaId, mossa.prese || []);
          } else if (this.config.gioco === 'briscola') {
            this.gioco.eseguiMossa(giocatore, mossa.cartaId);
          }
          break;
        case 'pesca':
          if (mossa.sorgente === 'mazzo') this.gioco.pescaDaMazzo(giocatore);
          else this.gioco.pescaDalMonte(giocatore);
          break;
        case 'cala': {
          const esito = this.gioco.calaCombinazione(giocatore, mossa.idCarte);
          if (!esito.ok) UI.notifica(esito.motivo, 'errore', 2000);
          break;
        }
        case 'lega': {
          const esito = this.gioco.legaATavolo(giocatore, mossa.cartaId, mossa.indice);
          if (!esito.ok) UI.notifica(esito.motivo, 'errore', 2000);
          break;
        }
        case 'scarta': {
          const esito = this.gioco.scarta(giocatore, mossa.cartaId);
          if (!esito.ok) UI.notifica(esito.motivo, 'errore', 2000);
          break;
        }
      }
    } catch (err) {
      UI.notifica('Mossa non valida: ' + err.message, 'errore', 2000);
      return;
    }

    // P2P: invia la mossa all'avversario (l'host la valida)
    if (this.modalita === 'p2p') {
      if (this.ruolo === 'guest') {
        rete.inviaMossa({ ...mossa, giocatore });
      } else {
        // host: applica anche sul proprio engine e trasmette lo stato
        if (mossa.giocatore === 1) this._applicaMossaRemota(mossa);
        this._trasmettiStato();
      }
    }

    this.render();
  }

  /** L'host riceve una mossa del guest e la valida/riapplica. */
  _applicaMossaRemota(mossa) {
    // l'host riapplica la mossa del guest sul proprio engine (autorevole)
    this._applicaMossaInterna(mossa);
    this.render();
  }

  _applicaMossaInterna(mossa) {
    const g = mossa.giocatore;
    switch (mossa.tipo) {
      case 'gioca':
        if (this.config.gioco === 'scopa') this.gioco.eseguiMossa(g, mossa.cartaId, mossa.prese || []);
        else if (this.config.gioco === 'briscola') this.gioco.eseguiMossa(g, mossa.cartaId);
        break;
      case 'pesca':
        if (mossa.sorgente === 'mazzo') this.gioco.pescaDaMazzo(g);
        else this.gioco.pescaDalMonte(g);
        break;
      case 'cala': this.gioco.calaCombinazione(g, mossa.idCarte); break;
      case 'lega': this.gioco.legaATavolo(g, mossa.cartaId, mossa.indice); break;
      case 'scarta': this.gioco.scarta(g, mossa.cartaId); break;
    }
  }

  _trasmettiStato() {
    const stato = this.gioco.statoSerializzabile();
    rete.broadcastGameState(stato);
  }

  /** Il guest applica lo stato autorevole ricevuto dall'host. */
  _applicaStatoRemoto(stato) {
    if (!stato || stato.gioco !== this.config.gioco) return;
    // lo stato dell'host è la fonte di verità: tavolo, punteggi, fase,
    // turno e anche la mano del guest (l'host l'ha distribuita lui).
    this.gioco.applicaStato(stato);
    this.render();
    if (this.gioco.stato.fase === 'fine') this._mostraFine();
  }

  /* ------------------------- bot ------------------------- */

  async _mossaBot() {
    const s = this.gioco.stato;
    if (s.fase !== 'gioco') { this._mostraFine(); return; }

    if (this.config.gioco === 'scopa') {
      const scelta = Bot.mossaBotScopa(s.mani[this.botIdx], s.tavolo, this.gioco);
      if (!scelta) { await this._sveglia(); return; }
      // anima la carta del bot verso il tavolo
      const src = document.querySelector(`#zona-avversario .carta[data-id="${CSS.escape(scelta.carta.id)}"]`);
      const dst = document.getElementById('zona-tavolo');
      if (src && dst) await UI.animaSpostamento(scelta.carta.id, UI.coordinateDi(src), UI.coordinateDi(dst), { carta: scelta.carta });
      this.gioco.eseguiMossa(this.botIdx, scelta.carta.id, scelta.prese.map(c => c.id));
      if (this.gioco.controllaScopa(this.gioco.stato.tavolo) && scelta.prese.length > 0) {
        UI.notifica('Il bot fa SCOPA!', 'avversario');
      }
    } else if (this.config.gioco === 'briscola') {
      const carta = Bot.mossaBotBriscola(s.mani[this.botIdx], s.tavolo[this.umano], s.briscola.seme, []);
      const src = document.querySelector(`#zona-avversario .carta[data-id="${CSS.escape(carta.id)}"]`);
      const dst = document.getElementById('zona-tavolo');
      if (src && dst) await UI.animaSpostamento(carta.id, UI.coordinateDi(src), UI.coordinateDi(dst), { carta });
      this.gioco.eseguiMossa(this.botIdx, carta.id);
    } else if (this.config.gioco === 'burraco') {
      const decisione = Bot.mossaBotBurraco(
        s.mani[this.botIdx], s.combinazioni[this.botIdx], s.monte, this.gioco
      );
      if (decisione.pescaDaMonte) this.gioco.pescaDalMonte(this.botIdx);
      else this.gioco.pescaDaMazzo(this.botIdx);
      this.render();
      await this._pausa(300);
      for (const ids of decisione.calate) this.gioco.calaCombinazione(this.botIdx, ids);
      for (const leg of decisione.legate) this.gioco.legaATavolo(this.botIdx, leg.cartaId, leg.indice);
      this.render();
      await this._pausa(300);
      if (decisione.scartoId) this.gioco.scarta(this.botIdx, decisione.scartoId);
      // il bot tenta la chiusura quando può
      const chiusura = this.gioco.verificaChiusura(s.mani[this.botIdx], false);
      if (chiusura.puoChiudere) {
        this.gioco._chiudi(this.botIdx);
      }
    }

    await this._sveglia();
  }

  /* ------------------------- punteggio / turno / fine ------------------------- */

  _renderPunteggio() {
    const el = document.getElementById('punteggio');
    if (!el) return;
    const s = this.gioco.stato;
    if (this.config.gioco === 'briscola' && s.punteggi) {
      el.innerHTML = `<span class="punteggio-numero">${s.punti[0]}</span> : <span class="punteggio-numero">${s.punti[1]}</span>`;
    } else if (this.config.gioco === 'scopa' && s.scope) {
      el.innerHTML = `<span class="punteggio-numero">${s.scope[0]}</span> : <span class="punteggio-numero">${s.scope[1]}</span>`;
    } else if (this.config.gioco === 'burraco' && s.punti) {
      el.innerHTML = `<span class="punteggio-numero">${s.punti[0]}</span> : <span class="punteggio-numero">${s.punti[1]}</span>`;
    } else {
      el.textContent = '';
    }
  }

  _renderTurno() {
    const el = document.getElementById('indicatore-turno');
    if (!el) return;
    const s = this.gioco.stato;
    if (s.fase === 'fine') { el.textContent = 'Partita finita'; return; }
    const chi = s.turno === this.umano ? 'Il tuo turno' : 'Turno avversario';
    el.textContent = chi;
  }

  _mostraFine() {
    const s = this.gioco.stato;
    let msg = 'Partita terminata!';
    let dettagli = '';
    if (this.config.gioco === 'scopa' && s.punteggi) {
      const p = s.punteggi;
      dettagli = `Settebello ${p.p1.settebello}-${p.p2.settebello} · Denari ${p.p1.denari}-${p.p2.denari} · Carte ${p.p1.carte}-${p.p2.carte} · Primiera ${p.p1.primiera}-${p.p2.primiera} · Scope ${p.p1.scope}-${p.p2.scope}`;
      msg = s.vincitore === null ? 'Pareggio!' : (s.vincitore === this.umano ? 'Hai VINTO!' : 'Ha vinto l\'avversario');
    } else if (this.config.gioco === 'briscola' && s.punteggi) {
      msg = s.vincitore === null ? 'Pareggio!' : (s.vincitore === this.umano ? 'Hai VINTO!' : 'Ha vinto l\'avversario');
      dettagli = `Punti finali: ${s.punti[0]} — ${s.punti[1]}`;
    } else if (this.config.gioco === 'burraco' && s.punteggi) {
      msg = s.vincitore === null ? 'Pareggio!' : (s.vincitore === this.umano ? 'Hai VINTO!' : 'Ha vinto l\'avversario');
      dettagli = `Punti finali: ${s.punti[0]} — ${s.punti[1]}`;
    }

    const overlay = document.getElementById('fine-gioco');
    if (!overlay) return;
    overlay.querySelector('.fine-titolo').textContent = msg;
    overlay.querySelector('.fine-dettagli').textContent = dettagli;
    overlay.classList.add('visibile');
  }

  /* ------------------------- P2P: aggancio rete ------------------------- */

  async agganciaRete() {
    const net = rete;
    net.initPeer({
      id: this.ruolo === 'host' ? this.config.stanza : undefined,
      onReady: (id) => {
        if (this.ruolo === 'host') {
          document.getElementById('peer-id').textContent = id;
          document.getElementById('stato-rete').textContent = 'Condividi questo codice stanza con l\'avversario:';
          document.getElementById('peer-id').classList.add('pronto');
          UI.notifica('In attesa di un avversario…', 'info', 4000);
        } else if (this.ruolo === 'guest' && this.config.stanza) {
          this.connettiA(this.config.stanza).catch(err => {
            UI.notifica('Connessione fallita: ' + err.message, 'errore', 4000);
          });
        }
      },
      onConnesso: async (ruolo, peerId) => {
        document.getElementById('stato-rete').textContent = `Connesso a ${peerId}`;
        UI.notifica('Avversario connesso! Partita avviata.', 'successo');
        if (this.ruolo === 'host') {
          this.gioco.inizializza();
          this._trasmettiStato();
        }
        await this._sveglia();
      },
      onData: (msg) => {
        if (msg.tipo === 'mossa' && this.ruolo === 'host') {
          // valida e applica la mossa del guest (autorevole)
          if (msg.payload.giocatore === 1) {
            this._applicaMossaInterna(msg.payload);
            this._trasmettiStato();
            this.render();
            if (this.gioco.stato.fase === 'fine') this._mostraFine();
          }
        } else if (msg.tipo === 'stato' && this.ruolo === 'guest') {
          this._applicaStatoRemoto(msg.payload);
        } else if (msg.tipo === 'errore') {
          UI.notifica('Errore avversario: ' + msg.payload.motivo, 'errore', 2500);
        }
      },
      onDisconnesso: () => {
        UI.notifica('Connessione persa', 'errore', 4000);
      },
      onError: (err) => {
        UI.notifica('Rete: ' + err.type, 'errore', 3000);
      }
    });
  }

  async connettiA(stanza) {
    await rete.connectToPeer(stanza);
  }
}

/* Esposizione globale */
if (typeof window !== 'undefined') {
  window.UI = UI;
  window.Controller = Controller;
}