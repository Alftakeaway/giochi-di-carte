/* =========================================================================
 * test/drag.test.js — Trascinamento delle carte, pile verticali e burraco
 * Verifica con il mouse vero:
 *   1. le combinazioni sono impilate in verticale
 *   2. una carta si sposta da un tris a una scala e viene integrata subito
 *   3. una carta della mano si trascina su una combinazione
 *   4. a burraco fatto la prima carta va di traverso in basso
 *   5. i timbri PULITO / SEMIPULITO / SPORCO
 *   6. i ordinamento automatico della mano per combinazioni
 *   NODE_PATH=<workspace>/node_modules node test/drag.test.js
 * ========================================================================= */
'use strict';

const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright-core');

const ROOT = path.resolve(__dirname, '..');
const URL_FILE = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/');
const SHOT = path.join(ROOT, 'test', 'screenshots');
const CHROME = 'C:/Users/Alfredo/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';

let passati = 0;
let falliti = 0;
function verifica(nome, condizione, extra) {
  if (condizione) { passati++; console.log('  ✓ ' + nome); }
  else {
    falliti++;
    console.log('  ✗ ' + nome + (extra === undefined ? '' : ' -> ' + JSON.stringify(extra)));
  }
}

/* Prende la carta con il puntatore e la lascia sull'elemento indicato.
 * Il punto di presa è l'angolo in alto a sinistra, l'unica parte visibile
 * di una carta impilata. */
async function trascina(page, selDa, selA, presa) {
  const a = await page.locator(selDa).boundingBox();
  const b = await page.locator(selA).boundingBox();
  const px = a.x + (presa && presa.x !== undefined ? presa.x : 14);
  const py = a.y + (presa && presa.y !== undefined ? presa.y : 7);
  await page.mouse.move(px, py);
  await page.mouse.down();
  await page.mouse.move(px + 14, py + 14, { steps: 4 });
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 14 });
  await page.waitForTimeout(90);
  await page.mouse.up();
  await page.waitForTimeout(280);
}

(async () => {
  if (!fs.existsSync(SHOT)) fs.mkdirSync(SHOT, { recursive: true });
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--allow-file-access-from-files', '--disable-gpu']
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  const errori = [];
  page.on('pageerror', e => errori.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errori.push(m.text()); });

  await page.goto(URL_FILE, { waitUntil: 'load' });
  await page.evaluate(function () {
    window.__burraco.avvia({ modo: 'cpu', livello: 'normale', target: 505, nomi: ['Tu', 'Computer'] });
    window.__burraco.ui.animazione = false;
  });
  await page.waitForTimeout(300);

  /* =====================================================================
   * SITUAZIONE DI PARTENZA
   *   combinazione 0: tris di 7 (7♠ 7♥ 7♦ 7♣)
   *   combinazione 1: scala di fiori 3-4-5-6
   *   mano: 8♣ 9♣ 10♣ (sequenza possibile) + 2♦ + 5♥
   * ===================================================================== */
  const inizio = await page.evaluate(function () {
    const b = window.__burraco;
    const E = window.BurracoEngine;
    const p = b.ui.partita;
    const s = p.stato;

    s.turno = 0;
    s.fase = 'gioco';
    s.finita = false;
    s.pozzettoPreso = [true, false];
    s.pozzetti = [[], []];
    s.monte = [];
    s.melds[1] = [];
    s.mani[1] = [
      new E.Carta('av1', 10, 'quadri', false),
      new E.Carta('av2', 13, 'picche', false)
    ];

    s.mani[0] = [
      new E.Carta('h8', 8, 'fiori', false),
      new E.Carta('h9', 9, 'fiori', false),
      new E.Carta('h10', 10, 'fiori', false),
      new E.Carta('h2', 2, 'quadri', false),
      new E.Carta('h5', 5, 'cuori', false)
    ];

    /* tris di 7: quattro semi diversi */
    const tris = [
      new E.Carta('t7s', 7, 'picche', false),
      new E.Carta('t7h', 7, 'cuori', false),
      new E.Carta('t7d', 7, 'quadri', false),
      new E.Carta('t7c', 7, 'fiori', false)
    ];
    const meldTris = {
      id: 'm-tris', tipo: 'gruppo', seme: null,
      slots: tris.map(function (c) { return { carta: c, valore: c.valore, wild: false }; })
    };
    p._aggiornaMeld(meldTris);

    /* scala di fiori 3-4-5-6 */
    const scala = [3, 4, 5, 6].map(function (v) {
      return new E.Carta('f' + v, v, 'fiori', false);
    });
    const meldScala = {
      id: 'm-scala', tipo: 'sequenza', seme: 'fiori',
      slots: scala.map(function (c) { return { carta: c, valore: c.valore, wild: false }; })
    };
    p._aggiornaMeld(meldScala);

    s.melds[0] = [meldTris, meldScala];
    b.ui.selezione.clear();
    b.ui.spostamento = null;
    b.render();

    return {
      melds: s.melds[0].length,
      trisPunti: meldTris.punti,
      scalaPunti: meldScala.punti,
      maniCarte: s.mani[0].length
    };
  });
  await page.waitForTimeout(200);
  console.log('situazione preparata:', JSON.stringify(inizio));

  /* =====================================================================
   * 1. LE COMBINAZIONI SONO PILE VERTICALI
   * ===================================================================== */
  const pile = await page.evaluate(function () {
    const meld = document.querySelectorAll('#melds-0 .meld')[0];
    const carte = Array.prototype.slice.call(meld.querySelectorAll('.pila-meld .carta'));
    const box = carte.map(function (c) {
      const r = c.getBoundingClientRect();
      return { y: Math.round(r.y), h: Math.round(r.height), z: getComputedStyle(c).zIndex };
    });
    const alt = carte.map(function (c) { return Math.round(c.getBoundingClientRect().top); });
    return {
      quante: carte.length,
      box: box,
      verticale: alt.every(function (v, i) { return i === 0 || v > alt[i - 1]; }),
      passo: alt.length > 1 ? Math.round(alt[1] - alt[0]) : 0,
      cartaH: box.length ? box[0].h : 0
    };
  });
  verifica('la combinazione ha 4 carte', pile.quante === 4, pile.quante);
  verifica('le carte sono disposte in verticale (y crescente)', pile.verticale, pile.box);
  verifica('le carte si sovrappongono (passo minore dell\'altezza)',
    pile.passo > 0 && pile.passo < pile.cartaH, { passo: pile.passo, altezza: pile.cartaH });

  /* =====================================================================
   * 2. LA MANO È ORDINATA PER COMBINAZIONI POSSIBILI
   * ===================================================================== */
  const mano = await page.evaluate(function () {
    const carte = Array.prototype.slice.call(document.querySelectorAll('#mano-giocatore .carta'));
    return {
      ordine: carte.map(function (c) { return c.dataset.id; }),
      inCombinazione: carte.filter(function (c) { return c.classList.contains('in-combinazione'); })
        .map(function (c) { return c.dataset.id; }),
      blocchi: carte.map(function (c) { return c.dataset.blocco; })
    };
  });
  verifica('la sequenza 8-9-10 di fiori è riconosciuta come combinazione',
    mano.inCombinazione.slice(0, 3).join(',') === 'h8,h9,h10', mano.inCombinazione);
  verifica('il 2♦ è associato come pinella in coda alla sequenza',
    mano.inCombinazione[3] === 'h2', mano.inCombinazione);
  verifica('le carte della combinazione stanno insieme in testa alla mano',
    mano.ordine.slice(0, 3).join(',') === 'h8,h9,h10', mano.ordine);
  verifica('le carte sciolte restano in un blocco separato',
    mano.blocchi[4] !== mano.blocchi[0] && mano.blocchi[4] === '1', mano.blocchi);

  await page.screenshot({ path: path.join(SHOT, 'f-tavolo.png') });

  /* =====================================================================
   * 3. DAL TRIS ALLA SCALA: la carta deve entrare subito
   * ===================================================================== */
  await trascina(page, '#melds-0 .meld:nth-child(1) .carta[data-id="t7c"]',
    '#melds-0 .meld:nth-child(2)');

  const dopoDrag = await page.evaluate(function () {
    const s = window.__burraco.ui.partita.stato;
    return {
      tris: s.melds[0][0].slots.map(function (x) { return x.carta.id; }),
      scala: s.melds[0][1].slots.map(function (x) { return x.carta.id; }),
      puntiScala: s.melds[0][1].punti,
      puntiTris: s.melds[0][0].punti,
      lunghezzaScala: s.melds[0][1].lunghezza,
      totCarte: s.melds[0][0].slots.length + s.melds[0][1].slots.length,
      messaggio: document.getElementById('log-mosse').textContent
    };
  });
  console.log('dopo il trascinamento:', JSON.stringify(dopoDrag));

  verifica('il 7♣ ha lasciato il tris', dopoDrag.tris.indexOf('t7c') < 0, dopoDrag.tris);
  verifica('il tris resta di tre carte', dopoDrag.tris.length === 3, dopoDrag.tris);
  verifica('il 7♣ è entrato nella scala, in fondo',
    dopoDrag.scala[dopoDrag.scala.length - 1] === 't7c', dopoDrag.scala);
  verifica('la scala è lunga 5', dopoDrag.lunghezzaScala === 5, dopoDrag.lunghezzaScala);
  verifica('i punti della scala sono stati ricalcolati',
    dopoDrag.puntiScala === inizio.scalaPunti + 5, { dopo: dopoDrag.puntiScala, prima: inizio.scalaPunti });
  verifica('i punti del tris sono stati ricalcolati',
    dopoDrag.puntiTris === inizio.trisPunti - 5, { dopo: dopoDrag.puntiTris, prima: inizio.trisPunti });
  verifica('nessuna carta è sparita', dopoDrag.totCarte === 8, dopoDrag.totCarte);
  verifica('il gioco annuncia lo spostamento', /spostat/i.test(dopoDrag.messaggio), dopoDrag.messaggio);

  await page.screenshot({ path: path.join(SHOT, 'f-dopo-drag.png') });

  /* =====================================================================
   * 4. DALLA MANO ALLA SCALA: 8♣ e 9♣ completano il burraco
   * ===================================================================== */
  await trascina(page, '#mano-giocatore .carta[data-id="h8"]', '#melds-0 .meld:nth-child(2)',
    { x: 20, y: 24 });
  await trascina(page, '#mano-giocatore .carta[data-id="h9"]', '#melds-0 .meld:nth-child(2)',
    { x: 20, y: 24 });

  const burraco = await page.evaluate(function () {
    const s = window.__burraco.ui.partita.stato;
    const m = s.melds[0][1];
    const el = document.querySelectorAll('#melds-0 .meld')[1];
    const traverso = el.querySelector('.slot-traverso .carta');
    const stile = traverso ? getComputedStyle(traverso).transform : null;
    return {
      lunghezza: m.lunghezza,
      burraco: m.burraco,
      pulito: m.pulito,
      semipulito: m.semipulito,
      sporco: m.sporco,
      classe: el.className,
      timbro: el.querySelector('.timbro') ? el.querySelector('.timbro').textContent : null,
      haTraverso: !!traverso,
      traversoId: traverso ? traverso.dataset.id : null,
      trasformazione: stile,
      mani: s.mani[0].length
    };
  });
  console.log('burraco:', JSON.stringify(burraco));

  verifica('la scala arriva a 7 carte', burraco.lunghezza === 7, burraco.lunghezza);
  verifica('il motore la considera un burraco', burraco.burraco === true, burraco);
  verifica('il burraco è pulito (nessuna matta)', burraco.pulito === true, burraco);
  verifica('la combinazione ha la classe burraco pulito',
    /meld/.test(burraco.classe) && /burraco/.test(burraco.classe) && /pulito/.test(burraco.classe),
    burraco.classe);
  verifica('il timbro dice PULITO', burraco.timbro === 'PULITO', burraco.timbro);
  verifica('c\'è una carta di traverso in basso', burraco.haTraverso === true, burraco);
  verifica('la carta di traverso è la prima della combinazione',
    burraco.traversoId === 'f3', { traverso: burraco.traversoId });
  verifica('la carta di traverso è ruotata di 90°',
    !!burraco.trasformazione && burraco.trasformazione !== 'none' &&
    /matrix/.test(burraco.trasformazione), burraco.trasformazione);
  verifica('la mano è scesa a 3 carte', burraco.mani === 3, burraco.mani);

  await page.screenshot({ path: path.join(SHOT, 'f-burraco.png') });

  /* =====================================================================
   * 5. I TRE TIPI DI BURRACO
   * ===================================================================== */
  const tipi = await page.evaluate(function () {
    const b = window.__burraco;
    const E = window.BurracoEngine;
    const p = b.ui.partita;
    const s = p.stato;

    function scalaConMatta(seme, conJolly) {
      const valori = [3, 4, 5, 6, 7, 8, 9];
      const slots = valori.map(function (v) {
        return { carta: new E.Carta('x' + seme + v, v, seme, false), valore: v, wild: false };
      });
      /* l'ultima carta diventa una matta: pinella (2 del seme) o jolly */
      if (conJolly) slots[6] = { carta: new E.Carta('jolly-' + seme, 0, null, true), valore: 9, wild: true };
      else slots[6] = { carta: new E.Carta('pinella-' + seme, 2, seme, false), valore: 9, wild: true };
      const m = { id: 'm-' + seme, tipo: 'sequenza', seme: seme, slots: slots };
      p._aggiornaMeld(m);
      return m;
    }

    s.melds[0] = [scalaConMatta('cuori', false), scalaConMatta('picche', true)];
    b.render();

    const els = Array.prototype.slice.call(document.querySelectorAll('#melds-0 .meld'));
    return els.map(function (el) {
      return {
        classe: el.className,
        timbro: el.querySelector('.timbro') ? el.querySelector('.timbro').textContent : null,
        traverso: !!el.querySelector('.slot-traverso .carta')
      };
    });
  });
  console.log('tipi di burraco:', JSON.stringify(tipi));

  verifica('burraco con la pinella: timbro SEMIPULITO',
    tipi[0] && tipi[0].timbro === 'SEMIPULITO', tipi[0]);
  verifica('burraco con la pinella: classe semipulito',
    tipi[0] && /semipulito/.test(tipi[0].classe), tipi[0] && tipi[0].classe);
  verifica('burraco con la pinella: carta di traverso',
    tipi[0] && tipi[0].traverso === true, tipi[0]);
  verifica('burraco con il jolly: timbro SPORCO',
    tipi[1] && tipi[1].timbro === 'SPORCO', tipi[1]);
  verifica('burraco con il jolly: classe sporco',
    tipi[1] && /sporco/.test(tipi[1].classe), tipi[1] && tipi[1].classe);

  const bonusTipi = await page.evaluate(function () {
    const s = window.__burraco.ui.partita.stato;
    return s.melds[0].map(function (m) {
      return { nome: window.BurracoEngine.nomeBurraco(m), bonus: window.BurracoEngine.bonusBurraco(m) };
    });
  });
  verifica('la pinella vale +150', bonusTipi[0] && bonusTipi[0].bonus === 150, bonusTipi[0]);
  verifica('il jolly vale +100', bonusTipi[1] && bonusTipi[1].bonus === 100, bonusTipi[1]);

  await page.screenshot({ path: path.join(SHOT, 'f-tipi.png') });

  /* =====================================================================
   * 6. UNO SPOSTAMENTO NON CONSENTITO NON CAMBIA NULLA
   * ===================================================================== */
  const rifiuto = await page.evaluate(function () {
    const b = window.__burraco;
    const E = window.BurracoEngine;
    const p = b.ui.partita;
    const s = p.stato;
    const tris = {
      id: 'm-10', tipo: 'gruppo', seme: null,
      slots: [10, 10, 10].map(function (v, i) {
        const semi = ['fiori', 'cuori', 'quadri'][i];
        const c = new E.Carta('d10' + i, v, semi, false);
        return { carta: c, valore: v, wild: false };
      })
    };
    p._aggiornaMeld(tris);
    s.melds[0] = [tris, s.melds[0][0]];
    s.turno = 0;
    s.fase = 'gioco';
    b.render();
    const giudizio = p.valutaSpostamento(0, 'd101', 1);   // 10 di cuori su una scala di cuori
    return { ok: giudizio.ok, motivo: giudizio.motivo, tris: s.melds[0][0].slots.length };
  });
  verifica('il motore rifiuta uno spostamento che romperebbe il tris', rifiuto.ok === false, rifiuto);
  verifica('il rifiuto spiega il perché', /meno di 3|non può entrare|non sarebbe/i.test(rifiuto.motivo || ''), rifiuto.motivo);
  verifica('il tris è rimasto intatto', rifiuto.tris === 3, rifiuto.tris);

  /* =====================================================================
   * 7. IL TRASCINAMENTO NON FA SCATTARE ANCHE IL CLIC
   * ===================================================================== */
  const selezioni = await page.evaluate(function () {
    return {
      selezione: Array.from(window.__burraco.ui.selezione),
      spostamento: window.__burraco.ui.spostamento
    };
  });
  verifica('dopo il trascinamento non resta nessuna carta selezionata',
    selezioni.selezione.length === 0, selezioni.selezione);
  verifica('non resta uno spostamento a metà', !selezioni.spostamento, selezioni.spostamento);

  /* =====================================================================
   * 8. LO SPOSTAMENTO CON UN TOCCO (alternativa al trascinamento)
   * ===================================================================== */
  const pronto = await page.evaluate(function () {
    const b = window.__burraco;
    const E = window.BurracoEngine;
    const p = b.ui.partita;
    const s = p.stato;
    s.turno = 0; s.fase = 'gioco'; s.finita = false;
    s.pozzettoPreso = [true, false];
    s.mani[0] = [new E.Carta('r1', 2, 'quadri', false), new E.Carta('r2', 9, 'cuori', false)];

    const tris = {
      id: 'm-nove', tipo: 'gruppo', seme: null,
      slots: [['n9s', 'picche'], ['n9h', 'cuori'], ['n9d', 'quadri'], ['n9c', 'fiori']].map(function (x) {
        return { carta: new E.Carta(x[0], 9, x[1], false), valore: 9, wild: false };
      })
    };
    p._aggiornaMeld(tris);

    const scala = {
      id: 'm-picche', tipo: 'sequenza', seme: 'picche',
      slots: [6, 7, 8].map(function (v) {
        return { carta: new E.Carta('p' + v, v, 'picche', false), valore: v, wild: false };
      })
    };
    p._aggiornaMeld(scala);

    s.melds[0] = [tris, scala];
    b.ui.selezione.clear();
    b.ui.spostamento = null;
    b.render();
    return { tris: tris.slots.length, scala: scala.slots.length };
  });
  await page.waitForTimeout(150);

  await page.locator('#melds-0 .meld:nth-child(1) .carta[data-id="n9s"]')
    .click({ position: { x: 14, y: 7 } });
  await page.waitForTimeout(150);

  const scelta = await page.evaluate(function () {
    const el = document.querySelectorAll('#melds-0 .meld')[1];
    return {
      spostamento: window.__burraco.ui.spostamento,
      bersaglio: el.classList.contains('target'),
      origine: document.querySelectorAll('#melds-0 .meld')[0].classList.contains('origine'),
      messaggio: document.getElementById('log-mosse').textContent
    };
  });
  verifica('toccando una carta della combinazione si prepara lo spostamento',
    scelta.spostamento && scelta.spostamento.idCarta === 'n9s', scelta.spostamento);
  verifica('la combinazione che può riceverla si illumina', scelta.bersaglio === true, scelta);
  verifica('la combinazione di partenza resta segnata', scelta.origine === true, scelta);

  /* tocco su una carta della combinazione di destinazione */
  await page.locator('#melds-0 .meld:nth-child(2) .carta[data-id="p7"]')
    .click({ position: { x: 14, y: 7 } });
  await page.waitForTimeout(250);

  const dopoTocco = await page.evaluate(function () {
    const s = window.__burraco.ui.partita.stato;
    return {
      tris: s.melds[0][0].slots.map(function (x) { return x.carta.id; }),
      scala: s.melds[0][1].slots.map(function (x) { return x.carta.id; }),
      spostamento: window.__burraco.ui.spostamento
    };
  });
  console.log('dopo il tocco:', JSON.stringify(dopoTocco));

  verifica('il 9♠ è uscito dal tris con un tocco', dopoTocco.tris.indexOf('n9s') < 0, dopoTocco.tris);
  verifica('il 9♠ è entrato nella scala con un tocco',
    dopoTocco.scala[dopoTocco.scala.length - 1] === 'n9s', dopoTocco.scala);
  verifica('lo spostamento a metà è stato azzerato', !dopoTocco.spostamento, dopoTocco.spostamento);
  verifica('le carte totali sono ancora 7',
    dopoTocco.tris.length + dopoTocco.scala.length === pronto.tris + pronto.scala,
    { prima: pronto.tris + pronto.scala, dopo: dopoTocco.tris.length + dopoTocco.scala.length });

  verifica('nessun errore JavaScript', errori.length === 0, errori.slice(0, 4));

  await browser.close();
  console.log('\n========================================================');
  console.log('TEST DRAG: passati ' + passati + ' · falliti ' + falliti);
  console.log('========================================================');
  process.exit(falliti === 0 ? 0 : 1);
})();
