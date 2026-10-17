const { chromium } = require('playwright-core');
const CHROME = 'C:/Users/Alfredo/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
const URL = 'https://giochi-di-carte.vercel.app/burraco/';
(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  for (const vp of [{ w: 1366, h: 768 }, { w: 390, h: 844 }]) {
    const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h } });
    const errori = [];
    page.on('pageerror', e => errori.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errori.push('console: ' + m.text()); });
    page.on('requestfailed', r => errori.push('reqfail: ' + r.url()));
    await page.goto(URL, { waitUntil: 'networkidle' });
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
        new E.Carta('hk', 13, 'picche', false)
      ];
      function scala(id, seme, valori) {
        const slots = valori.map(function (v, i) {
          return { carta: new E.Carta(id + v + i, v, seme, false), valore: v, wild: false };
        });
        const m = { id: id, tipo: 'sequenza', seme: seme, slots: slots };
        p._aggiornaMeld(m); return m;
      }
      const b7 = scala('ba', 'cuori', [3, 4, 5, 6, 7, 8, 9]);
      s.melds[1] = [b7];
      const m1 = scala('mq', 'quadri', [5, 6, 7, 8, 9]);
      m1.slots[2] = { carta: new E.Carta('mq-p', 2, 'quadri', false), valore: 6, wild: true };
      p._aggiornaMeld(m1);
      s.melds[0] = [m1];
      b.render();
    });
    await page.waitForTimeout(1200);
    const m = await page.evaluate(function () {
      const q = s => document.querySelector(s);
      const imgs = Array.prototype.slice.call(document.querySelectorAll('.faccia'));
      const caricate = imgs.filter(function (i) { return i.complete && i.naturalWidth > 0; }).length;
      const meld = q('#melds-0 .pila-meld > .carta');
      const rMeld = meld ? meld.getBoundingClientRect() : null;
      return {
        tipoImg: imgs.length ? imgs[0].currentSrc.split('/').pop() : null,
        immaginiTotali: imgs.length,
        immaginiCaricate: caricate,
        meldW: rMeld ? Math.round(rMeld.width) : null,
        meldH: rMeld ? Math.round(rMeld.height) : null,
        velo: document.querySelectorAll('.velo-matta').length,
        barraH: Math.round(q('.barra-azioni').getBoundingClientRect().height),
        footerDentro: q('.footer-tavolo').getBoundingClientRect().bottom <= window.innerHeight + 1
      };
    });
    console.log('PROD ' + vp.w + 'x' + vp.h, JSON.stringify(m));
    console.log('  errori:', errori.length ? errori : 'nessuno');
    await page.screenshot({ path: 'C:/Users/Alfredo/WorkBuddy AI/2026-10-17-03-02-04/burraco/test/screenshots/prod-' + vp.w + '.png' });
    await page.close();
  }
  await browser.close();
})();
