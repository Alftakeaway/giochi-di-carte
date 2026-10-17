const { chromium } = require('playwright-core');
const CHROME = 'C:/Users/Alfredo/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  for (const vp of [{ w: 1366, h: 768 }, { w: 390, h: 844 }]) {
    const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h } });
    const errori = [];
    page.on('pageerror', e => errori.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errori.push('console: ' + m.text()); });
    await page.goto('http://127.0.0.1:8765/index.html', { waitUntil: 'load' });
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
    await page.waitForTimeout(500);
    const m = await page.evaluate(function () {
      const q = sel => document.querySelector(sel);
      const carta = q('#mano-giocatore .carta');
      const meldCarta = q('#melds-0 .pila-meld > .carta');
      const rMeld = meldCarta ? meldCarta.getBoundingClientRect() : null;
      const passo = (function () {
        const c1 = q('#melds-0 .pila-meld > .carta:nth-child(1)');
        const c2 = q('#melds-0 .pila-meld > .carta:nth-child(2)');
        if (!c1 || !c2) return null;
        return Math.round(c2.getBoundingClientRect().left - c1.getBoundingClientRect().left);
      })();
      const immagini = Array.prototype.slice.call(document.querySelectorAll('#mano-giocatore .faccia')).map(function (i) { return i.getAttribute('src'); });
      const veloSuMano = q('#mano-giocatore .carta.matta .velo-matta') ? 1 : 0;
      return {
        mano: { w: Math.round(carta.getBoundingClientRect().width), h: Math.round(carta.getBoundingClientRect().height) },
        meld: rMeld ? { w: Math.round(rMeld.width), h: Math.round(rMeld.height) } : null,
        passo: passo,
        barra: {
          h: Math.round(q('.barra-azioni').getBoundingClientRect().height),
          contieneOrdina: !!q('.barra-azioni .ordinamento'),
          contieneInfo: !!q('.barra-azioni .info-mano'),
          altezzaMano: Math.round(q('#mano-giocatore').getBoundingClientRect().height)
        },
        areaManoH: Math.round(q('.area-mano').getBoundingClientRect().height),
        velo: document.querySelectorAll('.velo-matta').length,
        veloSuMano: veloSuMano,
        immagini: immagini.slice(0, 3),
        nImmaginiTot: document.images.length,
        footerDentro: q('.footer-tavolo').getBoundingClientRect().bottom <= window.innerHeight + 1
      };
    });
    console.log(vp.w + 'x' + vp.h, JSON.stringify(m, null, 1));
    console.log('  errori:', errori.length ? errori : 'nessuno');
    await page.screenshot({ path: 'C:/Users/Alfredo/WorkBuddy AI/2026-10-17-03-02-04/burraco/test/screenshots/carte-' + vp.w + '.png' });
    await page.close();
  }
  await browser.close();
})();
