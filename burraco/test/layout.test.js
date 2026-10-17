'use strict';
/* Verifica che il tavolo non tagli niente, nemmeno sugli schermi bassi dei
 * portatili (15,6" = 1366x768 oppure 1536x864 con il zoom di Windows).
 * Copre i difetti segnalati giocando davvero:
 *   - le scritte Tallone / Monte tagliate a metà e il numero di carte sparito
 *   - le tue combinazioni che sparivano quando l'avversario calava le sue
 *   - l'ordinamento della mano (combinazioni / numero / seme)
 *   - la scritta guida che a ogni pescata faceva saltare su la mano
 *   - le carte (mano e combinazioni) sono immagini reali, ingrandite, con
 *     il formato vero 5:7, e le matte portano il velo viola al posto dei
 *     vecchi segni agli angoli (che coprivano il numero)
 *
 * Uso: node test/layout.test.js   (richiede playwright-core) */
const path = require('path');
const { chromium } = require('playwright-core');

const ROOT = path.resolve(__dirname, '..');
const URL_FILE = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/');
const CHROME = 'C:/Users/Alfredo/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';

let passati = 0;
const falliti = [];
function verifica(nome, condizione, dettaglio) {
  if (condizione) { passati++; console.log('  ok   ' + nome); }
  else { falliti.push(nome); console.log('  FAIL ' + nome + (dettaglio !== undefined ? '  → ' + JSON.stringify(dettaglio) : '')); }
}

/* stato "tavolo pieno": l'avversario ha tre combinazioni (una da 8 carte),
 * il giocatore un burraco da 7. È il caso che faceva sparire tutto. */
const PREPARA = function () {
  const b = window.__burraco, E = window.BurracoEngine;
  b.avvia({ modo: 'cpu', livello: 'normale', target: 505, nomi: ['Tu', 'Computer'] });
  b.ui.animazione = false;
  const p = b.ui.partita, s = p.stato;
  s.turno = 0; s.fase = 'gioco'; s.pozzettoPreso = [true, false]; s.pozzetti = [[], []];
  s.mani[1] = [new E.Carta('av1', 10, 'quadri', false)];
  s.mani[0] = [
    new E.Carta('h8', 8, 'cuori', false), new E.Carta('h9', 9, 'cuori', false),
    new E.Carta('h10', 10, 'cuori', false), new E.Carta('h3', 3, 'quadri', false),
    new E.Carta('h5', 5, 'fiori', false), new E.Carta('h12', 12, 'picche', false),
    new E.Carta('h2d', 2, 'quadri', false), new E.Carta('hj', 0, null, true)
  ];
  function scala(id, seme, valori, matta) {
    const slots = valori.map(function (v, i) {
      return { carta: new E.Carta(id + seme + v + i, v, seme, false), valore: v, wild: false };
    });
    if (matta) slots[3] = { carta: new E.Carta(id + 'p' + seme, 2, seme, false), valore: 7, wild: true };
    const m = { id: id + seme + valori.length, tipo: 'sequenza', seme: seme, slots: slots };
    p._aggiornaMeld(m); return m;
  }
  function gruppo(id, v) {
    const slots = ['picche', 'cuori', 'quadri', 'fiori'].map(function (seme) {
      return { carta: new E.Carta(id + seme, v, seme, false), valore: v, wild: false };
    });
    const m = { id: id, tipo: 'gruppo', seme: null, slots: slots };
    p._aggiornaMeld(m); return m;
  }
  s.melds[1] = [scala('a', 'cuori', [3, 4, 5, 6, 7, 8, 9, 10], false), gruppo('b', 9), scala('c', 'picche', [4, 5, 6, 7], true)];
  s.melds[0] = [scala('d', 'quadri', [5, 6, 7, 8, 9, 10, 11], false)];
  b.render();
};

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--allow-file-access-from-files'] });
  const errori = [];

  /* ------------------------------------------------- schermata iniziale */
  console.log('\n== schermata iniziale ==');
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
    page.on('pageerror', e => errori.push('avvio: ' + e));
    await page.goto(URL_FILE, { waitUntil: 'load' });
    await page.waitForTimeout(150);
    const avvio = await page.evaluate(function () {
      return {
        etichette: Array.prototype.map.call(document.querySelectorAll('.campo > label'), function (el) {
          return { testo: el.textContent, h: Math.round(el.getBoundingClientRect().height) };
        }),
        scelte: Array.prototype.map.call(document.querySelectorAll('.campo .scelta'), function (el) {
          return { testo: el.textContent.trim().slice(0, 18), w: Math.round(el.getBoundingClientRect().width) };
        }),
        tavoloNascosto: document.getElementById('tavolo').hidden
      };
    });
    verifica('ci sono le 4 etichette dei gruppi', avvio.etichette.length === 4, avvio.etichette.length);
    verifica('nessuna etichetta va a capo su due righe',
      avvio.etichette.every(function (e) { return e.h <= 20; }), avvio.etichette);
    verifica('le scelte restano larghe come il gruppo',
      avvio.scelte.length > 0 && avvio.scelte.every(function (s) { return s.w > 100; }), avvio.scelte.slice(0, 3));
    verifica('il tavolo è nascosto prima di iniziare', avvio.tavoloNascosto === true, avvio.tavoloNascosto);
    await page.close();
  }

  /* ---------------------------------------------------------- schermi */
  const SCHERMI = [
    { nome: 'laptop 1366x768', w: 1366, h: 768 },
    { nome: 'laptop 1536x864 (zoom 125%)', w: 1536, h: 864 },
    { nome: 'desktop 1920x1080', w: 1920, h: 1080 }
  ];

  for (const sc of SCHERMI) {
    console.log('\n== ' + sc.nome + ' ==');
    const page = await browser.newPage({ viewport: { width: sc.w, height: sc.h } });
    page.on('pageerror', e => errori.push(sc.nome + ': ' + e));
    await page.goto(URL_FILE, { waitUntil: 'load' });
    await page.evaluate(PREPARA);
    await page.waitForTimeout(200);

    const m = await page.evaluate(function () {
      const r = e => { const b = e.getBoundingClientRect(); return { t: b.top, b: b.bottom, h: b.height, l: b.left, r: b.right, w: b.width }; };
      const q = s => document.querySelector(s);
      const centro = q('.col-centro');
      const avv = q('.col-avv');
      const mie = q('.col-mie');
      const didT = q('#tallone-didascalia');
      const didM = q('#monte-didascalia');
      const meldsAvv = Array.prototype.slice.call(document.querySelectorAll('#melds-1 .meld'));
      const meldsMie = Array.prototype.slice.call(document.querySelectorAll('#melds-0 .meld'));
      const rc = r(centro), ra = r(avv), rm = r(mie);
      const meldCard = q('#melds-0 .pila-meld > .carta');
      return {
        view: window.innerHeight,
        larghezza: window.innerWidth,
        centro: rc, avv: ra, mie: rm,
        didT: r(didT), didM: r(didM),
        pilaT: r(q('#tallone-pila')), pilaM: r(q('#monte-pila')),
        testoTallone: didT.textContent, testoMonte: didM.textContent,
        avvDentro: meldsAvv.every(function (el) { const b = r(el); return b.t >= ra.t - 1 && b.b <= ra.b + 1; }),
        avvAltezze: meldsAvv.map(function (el) { return Math.round(r(el).h); }),
        mieDentro: meldsMie.every(function (el) { const b = r(el); return b.t >= rm.t - 1 && b.b <= rm.b + 1; }),
        mieAltezze: meldsMie.map(function (el) { return Math.round(r(el).h); }),
        footerBasso: r(q('.footer-tavolo')).b,
        traverso: document.querySelectorAll('#melds-0 .slot-traverso').length,
        meldCard: meldCard ? { w: Math.round(meldCard.getBoundingClientRect().width), h: Math.round(meldCard.getBoundingClientRect().height) } : null,
        meldPasso: (function () {
          const c1 = q('#melds-0 .pila-meld > .carta:nth-child(1)');
          const c2 = q('#melds-0 .pila-meld > .carta:nth-child(2)');
          if (!c1 || !c2) return null;
          return Math.round(c2.getBoundingClientRect().left - c1.getBoundingClientRect().left);
        })(),
        carteMano: Array.prototype.slice.call(document.querySelectorAll('#mano-giocatore .carta')).map(function (el) {
          const img = el.querySelector('img.faccia');
          return {
            id: el.dataset.id,
            coperta: el.classList.contains('coperta'),
            matta: el.classList.contains('matta') || el.classList.contains('matta-figurata'),
            src: img ? (img.getAttribute('srcset') || img.getAttribute('src')) : null,
            haVelo: !!el.querySelector('.velo-matta')
          };
        }),
        badge: document.querySelectorAll('.badge-matta').length,
        anteprimaPos: (function () {
          const a = q('#anteprima');
          return a ? getComputedStyle(a).position : null;
        })(),
        ordBtns: Array.prototype.map.call(document.querySelectorAll('.barra-azioni .ord-btn'), function (b) {
          return { ordine: b.dataset.ordine, attivo: b.classList.contains('attivo'), visibile: b.getBoundingClientRect().width > 0 };
        })
      };
    });

    verifica('il tallone è al centro dello schermo', m.pilaT.l > m.larghezza / 8 && m.pilaT.r < m.larghezza * 7 / 8, m.pilaT);
    verifica('la scritta Tallone sta dentro la colonna centrale', m.didT.t >= m.centro.t - 1 && m.didT.b <= m.centro.b + 1, m.didT);
    verifica('la scritta Monte sta dentro la colonna centrale', m.didM.t >= m.centro.t - 1 && m.didM.b <= m.centro.b + 1, m.didM);
    verifica('il tallone mostra quante carte restano', /\d+/.test(m.testoTallone), m.testoTallone);
    verifica('il monte mostra quante carte ci sono', /\d+/.test(m.testoMonte), m.testoMonte);
    verifica('le combinazioni dell\'avversario si vedono per intero', m.avvDentro, m.avvAltezze);
    verifica('le tue combinazioni si vedono per intero', m.mieDentro, m.mieAltezze);
    verifica('la mano non esce dallo schermo', m.footerBasso <= m.view + 1, { footer: m.footerBasso, view: m.view });
    verifica('il burraco mostra la carta di traverso', m.traverso >= 1, m.traverso);
    verifica('le combinazioni usano carte ingrandite (>= 48px) col formato vero 5:7',
      m.meldCard && m.meldCard.w >= 48 && Math.abs((m.meldCard.h / m.meldCard.w) - 1.4) < 0.06, m.meldCard);
    verifica('le carte delle combinazioni si accavallano dritte (passo < larghezza)',
      m.meldPasso !== null && m.meldPasso > 0 && m.meldPasso < m.meldCard.w, m.meldPasso);
    verifica('il bollino MATTA non c\'è più (copriva il numero)', m.badge === 0, m.badge);
    verifica('ogni carta in mano ha una faccia reale (immagine .webp)',
      m.carteMano.every(function (c) { return c.coperta || (c.src && /\.webp$/.test(c.src)); }),
      m.carteMano.map(function (c) { return c.id + ':' + c.src; }));
    verifica('le matte hanno il velo viola al posto dei segni agli angoli',
      m.carteMano.filter(function (c) { return c.matta; }).every(function (c) { return c.haVelo; }),
      m.carteMano.filter(function (c) { return c.matta; }).map(function (c) { return c.id + ':' + c.haVelo; }));
    verifica('le carte normali non hanno il velo matta',
      m.carteMano.filter(function (c) { return !c.matta && !c.coperta; }).every(function (c) { return !c.haVelo; }),
      m.carteMano.filter(function (c) { return c.haVelo && !c.matta; }).map(function (c) { return c.id; }));
    const pinella = m.carteMano.filter(function (c) { return c.id === 'h2d'; })[0];
    verifica('la pinella è marcata come matta (velo viola)', pinella && pinella.matta && pinella.haVelo, pinella);
    const jolly = m.carteMano.filter(function (c) { return c.id === 'hj'; })[0];
    verifica('il jolly è marcato come matta (velo viola)', jolly && jolly.matta && jolly.haVelo, jolly);
    verifica('l\'anteprima è fuori dal flusso della barra', m.anteprimaPos === 'absolute', m.anteprimaPos);
    verifica('i tre comandi di ordinamento sono nella barra e visibili',
      m.ordBtns.length === 3 && m.ordBtns.every(b => b.visibile), m.ordBtns);
    verifica('all\'inizio è attivo «Combinazioni»',
      m.ordBtns.filter(b => b.attivo).map(b => b.ordine).join(',') === 'combinazioni', m.ordBtns);

    await page.close();
  }

  /* ------------------------------------------------- la mano non deve saltare */
  /* La scritta guida stava DENTRO la barra delle azioni: a ogni pescata
   * compariva, la barra cresceva di 34 px e la mano del giocatore saltava
   * su (e poi giù quando spariva). Ora l'anteprima è fuori dal flusso e
   * tutte le scritte (nome, pozzetto, ordinamento) stanno nella barra fissa:
   * la mano deve restare ferma in tutte le fasi del turno. */
  console.log('\n== la mano non salta ==');
  {
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    page.on('pageerror', e => errori.push('salto: ' + e));
    await page.goto(URL_FILE, { waitUntil: 'load' });
    await page.click('#btn-avvia');
    await page.evaluate(() => { window.__burraco.ui.animazione = false; });
    await page.waitForTimeout(250);

    const leggiMano = () => page.evaluate(() =>
      Math.round(document.querySelector('#mano-giocatore').getBoundingClientRect().top));

    const prima = await leggiMano();
    await page.evaluate(() => {
      const btn = Array.prototype.slice.call(document.querySelectorAll('#barra-azioni .btn'))
        .find(b => /Pesca dal tallone/.test(b.textContent));
      if (btn) btn.click();
    });
    await page.waitForTimeout(300);
    const dopo = await leggiMano();

    /* seleziona tre carte: compare l'anteprima con l'esito della combinazione */
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => {
        const c = document.querySelector('#mano-giocatore .carta.cliccabile:not(.selezionata)');
        if (c) c.click();
      });
      await page.waitForTimeout(80);
    }
    const selezionate = await leggiMano();
    const anteprimaPiena = await page.evaluate(() => {
      const a = document.querySelector('#anteprima');
      return a ? a.textContent.trim().length > 0 : false;
    });

    verifica('alla pescata la mano non si muove', prima === dopo, { prima, dopo });
    verifica('con l\'anteprima la mano non si muove', prima === selezionate, { prima, selezionate });
    verifica('l\'anteprima mostra l\'esito della selezione', anteprimaPiena === true, anteprimaPiena);
    await page.close();
  }

  /* ------------------------------------------------------- ordinamento */
  console.log('\n== ordinamento della mano ==');
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  page.on('pageerror', e => errori.push('ordinamento: ' + e));
  await page.goto(URL_FILE, { waitUntil: 'load' });
  await page.evaluate(PREPARA);
  await page.waitForTimeout(150);

  const leggi = function () {
    return Array.prototype.map.call(document.querySelectorAll('#mano-giocatore .carta'),
      function (c) { return c.dataset.id; });
  };

  const inizio = await page.evaluate(leggi);
  verifica('con «Combinazioni» le carte della scala stanno insieme',
    inizio.join(',').indexOf('h8,h9,h10') >= 0, inizio);
  verifica('la matta della scala non finisce in mezzo alle carte sciolte',
    inizio.slice(0, 4).join(',') === 'h8,h9,h10,h2d' || inizio.slice(0, 3).join(',') === 'h8,h9,h10', inizio);

  await page.click('.barra-azioni .ord-btn[data-ordine="numero"]');
  await page.waitForTimeout(120);
  const perNumero = await page.evaluate(leggi);
  verifica('«Numero» ordina dal valore più basso al più alto',
    perNumero.join(',') === 'h2d,h3,h5,h8,h9,h10,h12,hj', perNumero);
  verifica('il jolly resta in fondo con «Numero»', perNumero[perNumero.length - 1] === 'hj', perNumero);
  const attivoNumero = await page.evaluate(function () {
    return Array.prototype.filter.call(document.querySelectorAll('.barra-azioni .ord-btn'),
      function (b) { return b.classList.contains('attivo'); }).map(function (b) { return b.dataset.ordine; }).join(',');
  });
  verifica('si accende solo il comando «Numero»', attivoNumero === 'numero', attivoNumero);

  await page.click('.barra-azioni .ord-btn[data-ordine="seme"]');
  await page.waitForTimeout(120);
  const perSeme = await page.evaluate(leggi);
  verifica('«Seme» raggruppa cuori, quadri, fiori, picche',
    perSeme.join(',') === 'h8,h9,h10,h2d,h3,h5,h12,hj', perSeme);

  await page.click('.barra-azioni .ord-btn[data-ordine="combinazioni"]');
  await page.waitForTimeout(120);
  const tornato = await page.evaluate(leggi);
  verifica('tornando su «Combinazioni» la scala si ricompatta',
    tornato.join(',') === inizio.join(','), { tornato: tornato, inizio: inizio });

  verifica('nessun errore JavaScript', errori.length === 0, errori.slice(0, 3));

  await browser.close();

  console.log('\nTEST PASSATI: ' + passati + '   FALLITI: ' + falliti.length);
  if (falliti.length) { console.log('Falliti: ' + falliti.join(' | ')); process.exit(1); }
})();
