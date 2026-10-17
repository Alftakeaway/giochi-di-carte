'use strict';
/* Verifica che il tavolo non tagli niente, nemmeno sugli schermi bassi dei
 * portatili (15,6" = 1366x768 oppure 1536x864 con il zoom di Windows).
 * Copre i difetti segnalati giocando davvero:
 *   - le scritte Tallone / Monte tagliate a metà e il numero di carte sparito
 *   - le tue combinazioni che sparivano quando l'avversario calava le sue
 *   - l'ordinamento della mano (combinazioni / numero / seme)
 *   - la scritta guida che a ogni pescata faceva saltare su la mano
 *   - il bollino MATTA che copriva il numero, sostituito dai segni jolly
 *     agli angoli (numero sceso di un altro 10%)
 *   - la scritta JOLLY che copriva il segno in basso a sinistra
 *   - il numero in basso a destra tolto per sbaglio: rimesso come nelle
 *     carte da poker, con le carte ingrandite del 20% così niente si tocca
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
  /* Il contenitore del tavolo si chiama .campo-gioco proprio perché .campo
   * è già usato dai gruppi della schermata iniziale: quando si chiamava
   * .campo anche lui, le etichette andavano a capo su due righe. */
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
      const r = e => { const b = e.getBoundingClientRect(); return { t: b.top, b: b.bottom, h: b.height, l: b.left, r: b.right }; };
      const q = s => document.querySelector(s);
      const centro = q('.col-centro');
      const avv = q('.col-avv');
      const mie = q('.col-mie');
      const didT = q('#tallone-didascalia');
      const didM = q('#monte-didascalia');
      const meldsAvv = Array.prototype.slice.call(document.querySelectorAll('#melds-1 .meld'));
      const meldsMie = Array.prototype.slice.call(document.querySelectorAll('#melds-0 .meld'));
      const rc = r(centro), ra = r(avv), rm = r(mie);
      return {
        view: window.innerHeight,
        larghezza: window.innerWidth,
        centro: rc, avv: ra, mie: rm,
        didT: r(didT), didM: r(didM),
        pilaT: r(q('#tallone-pila')), pilaM: r(q('#monte-pila')),
        testoTallone: didT.textContent, testoMonte: didM.textContent,
        /* ogni combinazione deve stare dentro la sua colonna */
        avvDentro: meldsAvv.every(function (el) { const b = r(el); return b.t >= ra.t - 1 && b.b <= ra.b + 1; }),
        avvAltezze: meldsAvv.map(function (el) { return Math.round(r(el).h); }),
        mieDentro: meldsMie.every(function (el) { const b = r(el); return b.t >= rm.t - 1 && b.b <= rm.b + 1; }),
        mieAltezze: meldsMie.map(function (el) { return Math.round(r(el).h); }),
        footerBasso: r(q('.footer-tavolo')).b,
        traverso: document.querySelectorAll('#melds-0 .slot-traverso').length,
        rango: getComputedStyle(q('#mano-giocatore .carta .rango')).fontSize,
        carteMano: Array.prototype.slice.call(document.querySelectorAll('#mano-giocatore .carta')).map(function (el) {
          const marc = el.querySelectorAll('.matta-angolo');
          const svg = marc.length ? marc[0].querySelector('path') : null;
          const rb = el.querySelector('.angolo.basso .rango');
          const rbR = rb ? rb.getBoundingClientRect() : null;
          const mbR = (function () { const e = el.querySelector('.matta-angolo.basso'); return e ? e.getBoundingClientRect() : null; })();
          return {
            id: el.dataset.id,
            jolly: el.classList.contains('jolly'),
            nRango: el.querySelectorAll('.rango').length,
            nMarc: marc.length,
            colore: svg ? getComputedStyle(svg).fill : null,
            bassoTesto: rb ? rb.textContent : null,
            bassoRot: (function () { const a = el.querySelector('.angolo.basso'); return a ? getComputedStyle(a).transform : null; })(),
            /* il numero in basso a destra non deve toccare il segno jolly
             * in basso a sinistra (pinelle e jolly) */
            numeroSulSegno: rbR && mbR &&
              rbR.left < mbR.right - 0.5 && mbR.left < rbR.right - 0.5 &&
              rbR.top < mbR.bottom - 0.5 && mbR.top < rbR.bottom - 0.5
          };
        }),
        badge: document.querySelectorAll('.badge-matta').length,
        /* rettangoli reali del jolly in mano: la scritta non deve toccare
         * né il segno in basso a sinistra né la corona, e la corona non
         * deve toccare il segno in alto a destra */
        jollyRects: (function () {
          const el = document.querySelector('#mano-giocatore .carta.jolly');
          if (!el) return null;
          const rr = s => { const e = el.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { t: b.top, b: b.bottom, l: b.left, r: b.right }; };
          const tocca = (a, c) => a && c && a.l < c.r - 0.5 && c.l < a.r - 0.5 && a.t < c.b - 0.5 && c.t < a.b - 0.5;
          const parola = rr('.etichetta-jolly'), basso = rr('.matta-angolo.basso'),
            corona = rr('.jolly-svg'), alto = rr('.matta-angolo.alto');
          return {
            parola: parola, basso: basso, corona: corona, alto: alto,
            sovrapposizioni: [tocca(parola, basso), tocca(parola, corona), tocca(corona, alto)].filter(Boolean).length
          };
        })(),
        anteprimaPos: (function () {
          const a = q('#anteprima');
          return a ? getComputedStyle(a).position : null;
        })(),
        ordBtns: Array.prototype.map.call(document.querySelectorAll('#ordinamento .ord-btn'), function (b) {
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
    verifica('il numero in angolo è sceso di un altro 10% (20 px)', m.rango === '20px', m.rango);
    verifica('il bollino MATTA non c\'è più (copriva il numero)', m.badge === 0, m.badge);
    verifica('il numero compare due volte: in alto a sinistra e in basso a destra',
      m.carteMano.every(function (c) { return c.jolly || c.nRango === 2; }),
      m.carteMano.map(function (c) { return c.id + ':' + c.nRango; }));
    verifica('il numero in basso è a testa in giù (rotate 180)',
      m.carteMano.every(function (c) { return c.jolly || /matrix\(-1, 0, 0, -1, 0, 0\)/.test(c.bassoRot || ''); }),
      m.carteMano.filter(function (c) { return !c.jolly; }).map(function (c) { return c.id + ':' + c.bassoRot; }));
    verifica('il numero in basso a destra non copre il segno jolly in basso a sinistra',
      m.carteMano.every(function (c) { return !c.numeroSulSegno; }),
      m.carteMano.filter(function (c) { return c.numeroSulSegno; }).map(function (c) { return c.id; }));
    const pinella = m.carteMano.filter(function (c) { return c.id === 'h2d'; })[0];
    verifica('la pinella porta il segno jolly in entrambi gli angoli',
      pinella && pinella.nMarc === 2, pinella);
    verifica('il segno della pinella è rosso come il suo seme',
      pinella && pinella.colore === 'rgb(198, 40, 40)', pinella && pinella.colore);
    const jolly = m.carteMano.filter(function (c) { return c.id === 'hj'; })[0];
    verifica('il jolly porta il segno colorato in entrambi gli angoli',
      jolly && jolly.nMarc === 2 && jolly.colore === 'rgb(123, 31, 162)', jolly);
    verifica('le carte normali non hanno segni agli angoli',
      m.carteMano.every(function (c) { return c.id === 'h2d' || c.id === 'hj' || c.nMarc === 0; }),
      m.carteMano.filter(function (c) { return c.nMarc > 0; }).map(function (c) { return c.id; }));
    verifica('l\'anteprima è fuori dal flusso della barra', m.anteprimaPos === 'absolute', m.anteprimaPos);
    verifica('sul jolly la scritta non copre né il segno in basso né la corona',
      m.jollyRects && m.jollyRects.sovrapposizioni === 0,
      m.jollyRects && { parola: m.jollyRects.parola, basso: m.jollyRects.basso, corona: m.jollyRects.corona, alto: m.jollyRects.alto });
    verifica('i tre comandi di ordinamento sono visibili', m.ordBtns.length === 3 && m.ordBtns.every(b => b.visibile), m.ordBtns);
    verifica('all\'inizio è attivo «Combinazioni»',
      m.ordBtns.filter(b => b.attivo).map(b => b.ordine).join(',') === 'combinazioni', m.ordBtns);

    await page.close();
  }

  /* ------------------------------------------------- la mano non deve saltare */
  /* La scritta guida stava DENTRO la barra delle azioni: a ogni pescata
   * compariva, la barra cresceva di 34 px e la mano del giocatore saltava
   * su (e poi giù quando spariva). Ora l'anteprima è fuori dal flusso:
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

  await page.click('#ordinamento .ord-btn[data-ordine="numero"]');
  await page.waitForTimeout(120);
  const perNumero = await page.evaluate(leggi);
  verifica('«Numero» ordina dal valore più basso al più alto',
    perNumero.join(',') === 'h2d,h3,h5,h8,h9,h10,h12,hj', perNumero);
  verifica('il jolly resta in fondo con «Numero»', perNumero[perNumero.length - 1] === 'hj', perNumero);
  const attivoNumero = await page.evaluate(function () {
    return Array.prototype.filter.call(document.querySelectorAll('#ordinamento .ord-btn'),
      function (b) { return b.classList.contains('attivo'); }).map(function (b) { return b.dataset.ordine; }).join(',');
  });
  verifica('si accende solo il comando «Numero»', attivoNumero === 'numero', attivoNumero);

  await page.click('#ordinamento .ord-btn[data-ordine="seme"]');
  await page.waitForTimeout(120);
  const perSeme = await page.evaluate(leggi);
  verifica('«Seme» raggruppa cuori, quadri, fiori, picche',
    perSeme.join(',') === 'h8,h9,h10,h2d,h3,h5,h12,hj', perSeme);

  await page.click('#ordinamento .ord-btn[data-ordine="combinazioni"]');
  await page.waitForTimeout(120);
  const tornato = await page.evaluate(leggi);
  verifica('tornando su «Combinazioni» la scala si ricompatta',
    tornato.join(',') === inizio.join(','), { tornato: tornato, inizio: inizio });

  verifica('nessun errore JavaScript', errori.length === 0, errori.slice(0, 3));

  await browser.close();

  console.log('\nTEST PASSATI: ' + passati + '   FALLITI: ' + falliti.length);
  if (falliti.length) { console.log('Falliti: ' + falliti.join(' | ')); process.exit(1); }
})();
