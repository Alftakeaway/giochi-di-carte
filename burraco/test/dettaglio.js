/* Dettaglio carte: primo piano delle carte (jolly, pinella, normali)
 * per controllare la resa tipografica. */
const path = require('path');
const { chromium } = require('playwright-core');

const ROOT = path.resolve(__dirname, '..');
const SHOT = path.join(__dirname, 'screenshots');
const CHROME = 'C:/Users/Alfredo/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--allow-file-access-from-files']
  });
  const page = await browser.newPage({ viewport: { width: 900, height: 640 }, deviceScaleFactor: 3 });
  await page.goto('file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/'));
  await page.evaluate(function () {
    window.__burraco.avvia({ modo: 'cpu', livello: 'normale', target: 2005 });
  });
  await page.waitForTimeout(400);

  await page.evaluate(function () {
    const E = window.BurracoEngine;
    const s = window.__burraco.ui.partita.stato;
    const C = E.Carta;
    s.mani[0] = [
      new C('d1', 1, 'cuori', false),
      new C('d2', 13, 'picche', false),
      new C('d3', 2, 'quadri', false),
      new C('d4', 2, 'fiori', false),
      new C('d5', 12, 'cuori', false),
      new C('d6', 11, 'picche', false),
      new C('d7', 10, 'quadri', false),
      new C('d8', 8, 'fiori', false),
      new C('d9', 0, null, true)
    ];
    window.__burraco.render();
  });
  await page.waitForTimeout(350);

  const mano = await page.$('#mano-giocatore');
  await mano.screenshot({ path: path.join(SHOT, '_dettaglio-carte.png') });

  /* una combinazione con matta per vedere il badge "= valore" */
  await page.evaluate(function () {
    const E = window.BurracoEngine;
    const s = window.__burraco.ui.partita.stato;
    const C = E.Carta;
    s.melds[0] = [{
      tipo: 'sequenza', seme: 'cuori',
      slots: [
        { carta: new C('m1', 8, 'cuori', false), valore: 8, wild: false },
        { carta: new C('m2', 9, 'cuori', false), valore: 9, wild: false },
        { carta: new C('m3', 10, 'cuori', false), valore: 10, wild: false },
        { carta: new C('m4', 0, null, true), valore: 11, wild: true },
        { carta: new C('m5', 12, 'cuori', false), valore: 12, wild: false },
        { carta: new C('m6', 13, 'cuori', false), valore: 13, wild: false },
        { carta: new C('m7', 1, 'cuori', false), valore: 1, wild: false }
      ],
      punti: 105, burraco: true, pulito: false, nuovo: true
    }];
    window.__burraco.render();
  });
  await page.waitForTimeout(350);
  const meld = await page.$('#melds-0 .meld');
  if (meld) await meld.screenshot({ path: path.join(SHOT, '_dettaglio-meld.png') });

  console.log('ok');
  await browser.close();
})();
