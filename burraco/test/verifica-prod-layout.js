const { chromium } = require('playwright-core');
const CHROME = 'C:/Users/Alfredo/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
const SHOT = 'C:/Users/Alfredo/WorkBuddy AI/2026-10-17-03-02-04/burraco/test/screenshots/';
(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  for (const vp of [{ w: 1366, h: 768 }, { w: 390, h: 844 }]) {
    const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h } });
    const errori = [];
    page.on('pageerror', e => errori.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errori.push('console: ' + m.text()); });
    await page.goto('https://giochi-di-carte.vercel.app/burraco/', { waitUntil: 'load' });
    await page.evaluate(function () {
      const b = window.__burraco, E = window.BurracoEngine;
      b.avvia({ modo: 'cpu', livello: 'normale', target: 2005, nomi: ['Tu', 'Computer'] });
      b.ui.animazione = false;
      const p = b.ui.partita, s = p.stato;
      s.turno = 0; s.fase = 'gioco'; s.pozzettoPreso = [true, false]; s.pozzetti = [[], []];
      s.mani[1] = [new E.Carta('av1', 10, 'quadri', false)];
      s.mani[0] = [
        new E.Carta('h8', 8, 'cuori', false), new E.Carta('h9', 9, 'cuori', false),
        new E.Carta('h10', 10, 'cuori', false), new E.Carta('h3', 3, 'quadri', false),
        new E.Carta('h2d', 2, 'quadri', false), new E.Carta('hj', 0, null, true),
        new E.Carta('hk', 13, 'picche', false), new E.Carta('h4d', 4, 'quadri', false),
        new E.Carta('h5d', 5, 'quadri', false), new E.Carta('h6d', 6, 'quadri', false),
        new E.Carta('h7d', 7, 'quadri', false)
      ];
      function scala(id, seme, valori) {
        const slots = valori.map(function (v, i) {
          return { carta: new E.Carta(id + v + i, v, seme, false), valore: v, wild: false };
        });
        const m = { id: id, tipo: 'sequenza', seme: seme, slots: slots };
        p._aggiornaMeld(m); return m;
      }
      // combinazione dell'avversario: scala di cuori (7 carte)
      s.melds[1] = [scala('ba', 'cuori', [3, 4, 5, 6, 7, 8, 9])];
      // burraco del giocatore: scala di quadri con la pinella come matta
      const m1 = scala('mq', 'quadri', [5, 6, 7, 8, 9]);
      m1.slots[2] = { carta: new E.Carta('mq-p', 2, 'quadri', false), valore: 6, wild: true };
      p._aggiornaMeld(m1);
      m1.burraco = true; m1.pulito = true;
      s.melds[0] = [m1];
      // una seconda combinazione corta, per vedere la pila con poche carte
      s.melds[0].push(scala('mp', 'picche', [10, 11, 12, 13]));
      b.render();
    });
    await page.waitForTimeout(700);
    const m = await page.evaluate(function () {
      const q = sel => document.querySelector(sel);
      const manoCarte = Array.prototype.slice.call(document.querySelectorAll('#mano-giocatore .carta'));
      const mano = manoCarte.map(function (c) {
        const r = c.getBoundingClientRect();
        return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
      });
      const meldCarte = Array.prototype.slice.call(document.querySelectorAll('#melds-0 .pila-meld > .carta'));
      const pila = meldCarte.map(function (c) {
        const r = c.getBoundingClientRect();
        return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
      });
      const avvCarte = Array.prototype.slice.call(document.querySelectorAll('#melds-1 .pila-meld > .carta'));
      return {
        mano: mano,
        manoPasso: mano.length > 1 ? mano[1].x - mano[0].x : null,
        manoStessaRiga: mano.every(function (c) { return Math.abs(c.y - mano[0].y) <= 1; }),
        pila: pila,
        pilaPasso: pila.length > 1 ? pila[1].y - pila[0].y : null,
        pilaDritta: pila.every(function (c) { return Math.abs(c.x - pila[0].x) <= 1; }),
        pilaLarga: pila.length ? pila[0].w : 0,
        pilaAlta: pila.length ? pila[0].h : 0,
        avvQuante: avvCarte.length,
        traverso: !!q('#melds-0 .slot-traverso'),
        barra: {
          h: Math.round(q('.barra-azioni').getBoundingClientRect().height),
          contieneOrdina: !!q('.barra-azioni .ordinamento'),
          contieneInfo: !!q('.barra-azioni .info-mano')
        },
        velo: document.querySelectorAll('.velo-matta').length,
        footerDentro: q('.footer-tavolo').getBoundingClientRect().bottom <= window.innerHeight + 1,
        colonnaScroll: (function () {
          const c = document.querySelector('.col-mie');
          return c ? { client: c.clientHeight, scroll: c.scrollHeight } : null;
        })()
      };
    });
    console.log(vp.w + 'x' + vp.h, JSON.stringify(m, null, 1));
    console.log('  errori:', errori.length ? errori : 'nessuno');
    await page.screenshot({ path: SHOT + 'layout-' + vp.w + '.png' });
    await page.close();
  }
  await browser.close();
})();
