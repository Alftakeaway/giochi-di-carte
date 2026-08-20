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

  /* Configurazione di un mazzo: quelli regionali in MAZZI_ITALIANI,
     il francese (Burraco) in CONF_FRANCESE. */
  _confMazzo(tipo) {
    if (tipo === 'francese') {
      return window.CONF_FRANCESE || { retro: 'pattern-francese', accento: '#1f4e9c', immagini: true };
    }
    return MAZZI_ITALIANI[tipo] || {};
  },

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

        const confMazzo = UI._confMazzo(carta.tipoMazzo);
    const retroClass = carta.tipoMazzo === 'francese' ? 'pattern-francese' : (confMazzo.retro || 'pattern-napoletane');

    // Facce reali: per i mazzi con immagini si usa la foto ritagliata
    // (es. img/napoletane/denari_07.jpg, img/francese/picche_11.jpg)
    // al posto del rendering CSS/SVG. Anche i jolly hanno la loro foto.
    const usaImmagine = !!confMazzo.immagini;

    node.innerHTML = `
      <div class="carta-inner">
        <div class="carta-fronte ${usaImmagine ? 'fronte-immagine' : ''}" style="--accento:${carta.seme.colore}">
          ${this._fronteHtml(carta, confMazzo, usaImmagine)}
          ${(carta.eJolly || carta.ePinella)
            ? `<span class="badge-wild ${carta.eJolly ? 'b-jolly' : 'b-pinella'}">${carta.eJolly ? 'JOLLY' : 'PIN'}</span>`
            : ''}
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
      const percorso = carta.jolly
        ? `img/${carta.tipoMazzo}/jolly.jpg`
        : `img/${carta.tipoMazzo}/${carta.seme.nome}_${String(carta.valore).padStart(2, '0')}.jpg`;
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

  /* Organizza la mano del Burraco in gruppi visivi: SCALE (sequenze dello
     stesso seme, con jolly/pinelle che colmano i buchi) e TRIS (stesso
     valore), il resto come singole. Usata solo per la disposizione a
     schermo: l'ordine della mano reale nell'engine resta invariato. */
  organizzaManoBurraco(mano) {
    const gruppi = [];
    const usati = new Set();
    const jolly = mano.filter(c => c.eJolly);
    const pinelle = mano.filter(c => c.ePinella);
    const natura = mano.filter(c => !c.eJolly && !c.ePinella);
    const scalaValida = (window.Burraco && window.Burraco.validaScalaConJolly) || (() => false);
    const prendiSelvatica = (sj, sp) => (sp.length ? sp.shift() : sj.shift());

    // 1) SCALE pulite: per ogni seme la sequenza consecutiva più lunga,
    //    ripetuta finché esistono run di 3+ carte
    const perSeme = new Map();
    for (const c of natura) {
      if (!perSeme.has(c.seme.nome)) perSeme.set(c.seme.nome, []);
      perSeme.get(c.seme.nome).push(c);
    }
    let cambiate = true;
    while (cambiate) {
      cambiate = false;
      let migliore = null;
      for (const lista of perSeme.values()) {
        const disp = lista.filter(c => !usati.has(c.id)).sort((a, b) => a.valore - b.valore);
        let inizio = 0;
        for (let i = 1; i <= disp.length; i++) {
          if (i === disp.length || disp[i].valore !== disp[i - 1].valore + 1) {
            const len = i - inizio;
            if (len >= 3 && (!migliore || len > migliore.carte.length)) {
              migliore = { carte: disp.slice(inizio, i) };
            }
            inizio = i;
          }
        }
      }
      if (migliore) {
        migliore.carte.forEach(c => usati.add(c.id));
        gruppi.push({ tipo: 'scala', carte: migliore.carte });
        cambiate = true;
      }
    }

    // 2) TRIS puliti (al più 3 carte per valore)
    const rimNatura = natura.filter(c => !usati.has(c.id));
    const perValore = new Map();
    for (const c of rimNatura) {
      if (!perValore.has(c.valore)) perValore.set(c.valore, []);
      perValore.get(c.valore).push(c);
    }
    for (const valore of [...perValore.keys()].sort((a, b) => a - b)) {
      const lista = perValore.get(valore);
      if (lista.length >= 3) {
        const tris = lista.slice(0, 3);
        tris.forEach(c => usati.add(c.id));
        gruppi.push({ tipo: 'tris', carte: tris.sort((a, b) => a.seme.nome.localeCompare(b.seme.nome)) });
      }
    }

    // 3) TRIS con jolly/pinella: 2 naturali + 1 selvatica
    const nJolly = jolly.filter(c => !usati.has(c.id));
    const nPinelle = pinelle.filter(c => !usati.has(c.id));
    const rim = mano.filter(c => !usati.has(c.id) && !c.eJolly && !c.ePinella);
    const rValori = new Map();
    for (const c of rim) {
      if (!rValori.has(c.valore)) rValori.set(c.valore, []);
      rValori.get(c.valore).push(c);
    }
    for (const valore of [...rValori.keys()].sort((a, b) => a - b)) {
      const lista = rValori.get(valore);
      if (lista.length === 2 && (nJolly.length + nPinelle.length) >= 1) {
        const j = prendiSelvatica(nJolly, nPinelle);
        gruppi.push({ tipo: 'tris', carte: [...lista, j] });
        lista.forEach(c => usati.add(c.id)); usati.add(j.id);
      }
    }

    // 4) SCALE con jolly/pinella: buchi colmabili sulle carte rimaste
    const sJolly = jolly.filter(c => !usati.has(c.id));
    const sPinelle = pinelle.filter(c => !usati.has(c.id));
    const rNatura = mano.filter(c => !usati.has(c.id) && !c.eJolly && !c.ePinella);
    const rPerSeme = new Map();
    for (const c of rNatura) {
      if (!rPerSeme.has(c.seme.nome)) rPerSeme.set(c.seme.nome, []);
      rPerSeme.get(c.seme.nome).push(c);
    }
    const wildDisp = () => sJolly.length + sPinelle.length;
    for (const lista of rPerSeme.values()) {
      const ord = lista.slice().sort((a, b) => a.valore - b.valore);
      let i = 0;
      while (i < ord.length) {
        let bestLen = 0, bestK = 0, bestWindow = null;
        // validaScalaConJolly copre sia i buchi interni (es. 5-7+J) sia
        // l'estensione alle estremità (es. 5-6+J = 5-6-7); con le regole
        // ufficiali è ammessa al più 1 matta per gioco.
        for (let j = ord.length - 1; j >= i; j--) {
          const window = ord.slice(i, j + 1);
          const n = window.length;
          const k = 1;
          if (k > wildDisp()) continue;
          if (n + k < 3) continue;
          if (scalaValida(window, k) && n + k > bestLen) {
            bestLen = n + k; bestK = k; bestWindow = window;
          }
        }
        if (bestWindow) {
          const wilds = [];
          for (let w = 0; w < bestK; w++) {
            const j = prendiSelvatica(sJolly, sPinelle);
            if (j) wilds.push(j);
          }
          if (wilds.length === bestK) {
            const carte = [...bestWindow, ...wilds].sort((a, b) => a.valore - b.valore);
            gruppi.push({ tipo: 'scala', carte });
            bestWindow.forEach(c => usati.add(c.id));
            wilds.forEach(c => usati.add(c.id));
            i = ord.indexOf(bestWindow[bestWindow.length - 1]) + 1;
            continue;
          }
          sJolly.unshift(...wilds.filter(c => c.eJolly));
          sPinelle.unshift(...wilds.filter(c => c.ePinella));
        }
        i++;
      }
    }

    // 5) SINGOLE rimaste (jolly/pinelle in evidenza)
    const singole = mano.filter(c => !usati.has(c.id));
    if (singole.length) {
      singole.sort((a, b) => {
        const wa = a.eJolly ? 0 : a.ePinella ? 1 : 2;
        const wb = b.eJolly ? 0 : b.ePinella ? 1 : 2;
        if (wa !== wb) return wa - wb;
        return a.valore - b.valore;
      });
      gruppi.push({ tipo: 'singole', carte: singole });
    }

    return gruppi;
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
      const confVolante = carta ? UI._confMazzo(carta.tipoMazzo) : {};
      const usaRetroFoto = !!confVolante.immagini;
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
  },

  /* Etichetta compatta per la vista mini dell'avversario (es. A, 7, J, Q, K). */
  _valoreCompatto(carta) {
    if (carta.eJolly) return 'J';
    if (carta.tipoMazzo === 'francese') {
      const m = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
      return m[carta.valore] || String(carta.valore);
    }
    const m = { 1: 'A', 8: 'F', 9: 'C', 10: 'R' };
    return m[carta.valore] || String(carta.valore);
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
    this._manoKeyBurraco = null;             // ordine mano burraco (stabile)
    this._manoGruppi = null;
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
    // i 2 pozzetti (mazzetti da 11 carte coperti)
    for (const giocatore of [0, 1]) {
      const stack = s.pozzetti && s.pozzetti[giocatore] ? s.pozzetti[giocatore] : [];
      if (stack.length === 0) continue;
      const pozzettoNode = this._carta({ carta: stack[stack.length - 1], coperta: true });
      pozzettoNode.classList.add('stack');
      pozzettoNode.title = `Pozzetto del giocatore ${giocatore + 1} (${stack.length} carte)`;
      const wrap = document.createElement('div');
      wrap.className = 'pozzetto-wrap';
      const label = document.createElement('span');
      label.className = 'gruppo-label';
      label.textContent = `Pozzetto ${giocatore + 1}`;
      wrap.append(label, pozzettoNode);
      zonaMazzi.appendChild(wrap);
    }

    // combinazioni calate dei due giocatori
    for (const giocatore of [0, 1]) {
      const zona = document.getElementById(`zona-combinazioni-${giocatore}`);
      if (!zona) continue;
      const isMio = giocatore === this.umano;
      s.combinazioni[giocatore].forEach((combo, idx) => {
        const box = document.createElement('div');
        box.className = 'combinazione' + (combo.burraco ? ' burraco' : '');
        box.title = `${combo.tipo} — ${combo.punti} pt${combo.burraco ? (combo.pulito ? ' (burraco pulito)' : ' (burraco sporco)') : ''}`;
        if (!isMio) {
          // vista avversario: colonna compatta verticale (solo seme+valore),
          // così non invade il campo come le carte intere orizzontali
          box.classList.add('mini');
          combo.carte.forEach(c => {
            const chip = document.createElement('div');
            chip.className = 'carta-mini' + (c.eJolly || c.ePinella ? ' matta' : '');
            chip.style.setProperty('--accento', c.seme.colore);
            chip.title = `${c.nome} di ${c.seme.nome}`;
            chip.innerHTML = `<span class="cm-valore">${UI._valoreCompatto(c)}</span><span class="cm-seme">${c.seme.simbolo}</span>`;
            box.appendChild(chip);
          });
          zona.appendChild(box);
          return;
        }
        // vista giocatore: carte impilate in verticale, ogni carta fa
        // intravedere solo la striscia in alto con seme e numero
        box.classList.add('impilata');
        const peekCombo = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--peek-combo')) || 18;
        const nCarte = combo.carte.length;
        const sporco = combo.carte.some(c => c.eJolly || c.ePinella);
        const nDiTraverso = nCarte >= 7 ? (sporco ? 1 : 2) : 0;
        const mkCarta = c => this._carta({
          carta: c,
          coperta: false,
          cliccabile: isMio && s.turno === this.umano && s.fase === 'gioco',
          onClic: isMio ? () => this._selezionaComboPerLega(idx) : undefined
        });
        if (nDiTraverso > 0) {
          // burraco: la pila resta compatta, l'ultima carta (o le ultime
          // due se pulito) è messa DI TRAVERSO in cima alla pila
          box.classList.add('burraco');
          const pila = document.createElement('div');
          pila.className = 'pila';
          pila.style.height = ((nCarte - nDiTraverso) * peekCombo) + 'px';
          combo.carte.slice(0, nCarte - nDiTraverso).forEach(c => pila.appendChild(mkCarta(c)));
          box.appendChild(pila);
          const traverso = document.createElement('div');
          traverso.className = 'di-traverso';
          combo.carte.slice(nCarte - nDiTraverso).forEach(c => traverso.appendChild(mkCarta(c)));
          box.appendChild(traverso);
        } else {
          box.style.setProperty('--n-carte', nCarte);
          box.style.height = (nCarte * peekCombo) + 'px';
          combo.carte.forEach(c => box.appendChild(mkCarta(c)));
        }
        zona.appendChild(box);
      });
    }

    // mano giocatore: organizzata in TRIS/SCALE (ordine stabile finché la
    // composizione della mano non cambia, per non far saltare le carte
    // durante la selezione)
    const zonaMan = document.getElementById('zona-giocatore');
    const mano = s.mani[this.umano] || s.mani[0];
    const chiaveMano = mano.map(c => c.id).sort().join('|');
    if (this._manoKeyBurraco !== chiaveMano) {
      this._manoKeyBurraco = chiaveMano;
      this._manoGruppi = UI.organizzaManoBurraco(mano);
    }
    const mioTurno = s.turno === this.umano && s.fase === 'gioco';
    for (const gruppo of (this._manoGruppi || [{ tipo: 'singole', carte: mano }])) {
      const wrap = document.createElement('div');
      wrap.className = 'gruppo-mano';
      if (gruppo.tipo !== 'singole') {
        const label = document.createElement('span');
        label.className = 'gruppo-label';
        label.textContent = gruppo.tipo === 'scala' ? 'Scala' : 'Tris';
        wrap.appendChild(label);
      }
      gruppo.carte.forEach(c => wrap.appendChild(this._carta({
        carta: c, coperta: false,
        selezionabile: mioTurno, cliccabile: mioTurno,
        selezionata: this.selezione.has(c.id),
        onClic: () => this._clickSelezioneBurraco(c)
      })));
      zonaMan.appendChild(wrap);
    }

    this._infoBurraco(s);
  }

  _infoBurraco(s) {
    const zonaInfo = document.getElementById('zona-info');
    const pozz1 = s.pozzettoPreso[0] ? '✓' : '✗';
    const pozz2 = s.pozzettoPreso[1] ? '✓' : '✗';
    zonaInfo.innerHTML = `
      <div class="info-blocco"><span class="info-label">Punti</span>
        <span class="info-valore">${s.punti[0]} : ${s.punti[1]}</span></div>
      <div class="info-blocco"><span class="info-label">Burrachi</span>
        <span class="info-valore">${s.burrachi[0]} : ${s.burrachi[1]}</span></div>
      <div class="info-blocco"><span class="info-label">Mazzo</span>
        <span class="info-valore">${s.mazzo.lunghezza}</span></div>
      <div class="info-blocco"><span class="info-label">Pozzetti</span>
        <span class="info-valore">${pozz1} : ${pozz2}</span></div>`;
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

      const mano = s.mani[this.umano] || s.mani[0];
      // mano vuota: l'unica azione possibile è prendere il proprio pozzetto
      if (mano.length === 0) {
        const pozzetto = document.createElement('button');
        pozzetto.className = 'btn btn-primario';
        pozzetto.textContent = '🃏 Prendi il pozzetto';
        pozzetto.disabled = (s.pozzetti[this.umano] || []).length === 0 || s.pozzettoPreso[this.umano];
        pozzetto.addEventListener('click', () => this._azioneBurraco({ tipo: 'pozzetto' }));
        bar.append(pozzetto);
        if (pozzetto.disabled) {
          const info = document.createElement('div');
          info.className = 'info-pozzetto';
          info.textContent = s.pozzettoPreso[this.umano]
            ? 'Pozzetto già preso: per chiudere scarta l\'ultima carta (non matta) con un Burraco fatto.'
            : 'Pozzetto esaurito: non puoi proseguire.';
          bar.append(info);
        }
        return;
      }

      const pescaMazzo = document.createElement('button');
      pescaMazzo.className = 'btn btn-primario';
      pescaMazzo.textContent = '🂠 Pesca dal mazzo';
      pescaMazzo.addEventListener('click', () => this._azioneBurraco({ tipo: 'pesca', sorgente: 'mazzo' }));

      const pescaMonte = document.createElement('button');
      pescaMonte.className = 'btn';
      pescaMonte.textContent = s.monte.length > 1 ? `♻ Raccogli monte (${s.monte.length})` : '♻ Raccogli monte';
      pescaMonte.title = 'Prendi TUTTE le carte del monte degli scarti';
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
          else this.gioco.raccogliMonte(giocatore);
          break;
        case 'pozzetto':
          this.gioco.prendiPozzetto(giocatore);
          break;
        case 'cala': {
          const esito = this.gioco.calaCombinazione(giocatore, mossa.idCarte);
          if (!esito.ok) UI.notifica(esito.motivo, 'errore', 2000);
          else if (esito.chiusura) UI.notifica('Chiusura! Mano vuota con un Burraco', 'successo', 2500);
          else if (esito.pozzetto) UI.notifica('Mano vuota: hai preso il pozzetto per continuare', 'successo', 2500);
          break;
        }
        case 'lega': {
          const esito = this.gioco.legaATavolo(giocatore, mossa.cartaId, mossa.indice);
          if (!esito.ok) UI.notifica(esito.motivo, 'errore', 2000);
          else if (esito.chiusura) UI.notifica('Chiusura! Mano vuota con un Burraco', 'successo', 2500);
          else if (esito.pozzetto) UI.notifica('Mano vuota: hai preso il pozzetto per continuare', 'successo', 2500);
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
        else this.gioco.raccogliMonte(g);
        break;
      case 'pozzetto': this.gioco.prendiPozzetto(g); break;
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
      // mano vuota: il bot prende il proprio pozzetto per continuare
      if (s.mani[this.botIdx].length === 0 && !s.pozzettoPreso[this.botIdx]) {
        this.gioco.prendiPozzetto(this.botIdx);
        this.render();
        await this._pausa(300);
      }
      const decisione = Bot.mossaBotBurraco(
        s.mani[this.botIdx], s.combinazioni[this.botIdx], s.monte, this.gioco
      );
      if (s.mani[this.botIdx].length === 0) {
        // senza carte e senza pozzetto il bot non può muovere
        await this._sveglia();
        return;
      }
      if (decisione.pescaDaMonte) this.gioco.raccogliMonte(this.botIdx);
      else this.gioco.pescaDaMazzo(this.botIdx);
      this.render();
      await this._pausa(300);
      for (const ids of decisione.calate) this.gioco.calaCombinazione(this.botIdx, ids);
      if (this.gioco.stato.fase !== 'gioco') { await this._sveglia(); return; }
      for (const leg of decisione.legate) this.gioco.legaATavolo(this.botIdx, leg.cartaId, leg.indice);
      this.render();
      await this._pausa(300);
      if (this.gioco.stato.fase !== 'gioco') { await this._sveglia(); return; }
      if (decisione.scartoId) this.gioco.scarta(this.botIdx, decisione.scartoId);
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