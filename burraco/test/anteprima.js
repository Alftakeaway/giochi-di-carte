/* =========================================================================
 * test/anteprima.js — Cattura schermate del tavolo in varie situazioni
 * (solo per revisione visiva)
 * ========================================================================= */
'use strict';

const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright-core');

const ROOT = path.resolve(__dirname, '..');
const URL_FILE = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/');
const SHOT = path.join(ROOT, 'test', 'screenshots');
const CHROME = 'C:/Users/Alfredo/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';

const gioca = `
async function gioca(n) {
  const b = window.__burraco;
  b.ui.animazione = false;
  const p = b.ui.partita;
  const attesa = (ms) => new Promise(r => setTimeout(r, ms));
  const btn = (re) => Array.prototype.slice.call(document.querySelectorAll('#barra-azioni .btn'))
    .find(x => re.test(x.textContent));
  const carte = () => Array.prototype.slice.call(document.querySelectorAll('#mano-giocatore .carta.cliccabile'));
  let fatti = 0;
  let guardia = 0;
  while (fatti < n && guardia++ < 3000) {
    if (!document.getElementById('overlay-fine').hidden) {
      const b1 = document.querySelector('#fine-azioni .btn');
      if (b1) b1.click();
      await attesa(20);
      continue;
    }
    if (b.ui.botInCorso) { await attesa(15); continue; }
    const s = p.stato;
    if (s.turno !== b.ui.manoVisibile) { await attesa(15); continue; }
    if (s.fase === 'pesca') { const x = btn(/Pesca dal tallone/) || btn(/Prendi il monte/); if (x && !x.disabled) x.click(); }
    else {
      const sug = btn(/Suggerisci/); if (sug) sug.click();
      const cala = btn(/Cala/);
      if (cala && !cala.disabled) cala.click();
      else {
        const ann = btn(/Annulla/); if (ann) ann.click();
        let okk = false;
        for (let i = 0; i < 20 && !okk; i++) {
          const c = carte(); if (i >= c.length) break;
          c[i].click();
          const t = document.querySelector('#melds-0 .meld.target');
          if (t) { t.click(); okk = true; break; }
          const c2 = carte(); if (c2[i]) c2[i].click();
        }
        if (!okk) {
          for (let i = 0; i < 20 && !okk; i++) {
            const c = carte(); if (i >= c.length) break;
            c[i].click();
            const sc = btn(/Scarta|Chiudi/);
            if (sc && !sc.disabled) { sc.click(); okk = true; break; }
            const c2 = carte(); if (c2[i]) c2[i].click();
          }
        }
      }
    }
    fatti++;
    await attesa(8);
  }
  return { fatti, mano: p.stato.mani[0].length, melds: p.stato.melds[0].length };
}
`;

(async () => {
  if (!fs.existsSync(SHOT)) fs.mkdirSync(SHOT, { recursive: true });
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--allow-file-access-from-files', '--disable-gpu']
  });
  const page = await browser.newContext({ viewport: { width: 1280, height: 900 } }).then(c => c.newPage());
  await page.goto(URL_FILE, { waitUntil: 'load' });
  await page.addScriptTag({ content: gioca });

  await page.evaluate(function () {
    window.__burraco.avvia({ modo: 'cpu', livello: 'normale', target: 2005, nomi: ['Tu', 'Computer'] });
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(SHOT, 'a-inizio.png') });

  for (const tappe of [12, 25, 40, 60]) {
    const r = await page.evaluate('gioca(' + tappe + ')');
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(SHOT, 'b-' + tappe + '.png') });
    console.log('tappa ' + tappe + ': ' + JSON.stringify(r));
  }

  /* forza una situazione con burraco e pozzetto per la schermata */
  await page.evaluate(function () {
    const b = window.__burraco;
    const p = b.ui.partita;
    const E = window.BurracoEngine;
    const s = p.stato;
    s.turno = 0;
    s.fase = 'gioco';
    s.pozzettoPreso = [true, true];
    s.pozzetti = [[], []];
    const crea = function (v, seme) {
      return new E.Carta('x' + v + seme, v, seme, false);
    };
    const scala = [3, 4, 5, 6, 7, 8, 9].map(function (v) { return crea(v, 'cuori'); });
    s.melds[0] = [{
      id: 'demo1', tipo: 'sequenza', seme: 'cuori',
      slots: scala.map(function (c) { return { carta: c, valore: c.valore, wild: false }; }),
      punti: scala.reduce(function (a, c) { return a + c.punti; }, 0),
      burraco: true, pulito: true, sporco: false, matte: 0, lunghezza: 7
    }];
    const gruppo = [crea(13, 'quadri'), crea(13, 'fiori'), crea(13, 'picche'), crea(13, 'quadri')];
    s.melds[0].push({
      id: 'demo2', tipo: 'gruppo', seme: null,
      slots: gruppo.map(function (c) { return { carta: c, valore: 13, wild: false }; }),
      punti: 40, burraco: false, pulito: false, sporco: false, matte: 0, lunghezza: 4
    });
    s.melds[1] = [{
      id: 'demo3', tipo: 'sequenza', seme: 'picche',
      slots: [
        { carta: crea(10, 'picche'), valore: 10, wild: false },
        { carta: crea(11, 'picche'), valore: 11, wild: false },
        { carta: new E.Carta('jw', 0, null, true), valore: 12, wild: true },
        { carta: crea(13, 'picche'), valore: 13, wild: false }
      ],
      punti: 60, burraco: false, pulito: false, sporco: false, matte: 1, lunghezza: 4
    }];
    s.mani[0] = [crea(4, 'cuori'), crea(10, 'cuori'), crea(11, 'quadri'), crea(6, 'fiori'), crea(7, 'fiori')];
    b.ui.selezione.clear();
    b.ui.selezione.add('x4cuori');
    b.ui.selezione.add('x10cuori');
    b.render();
  });
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(SHOT, 'c-burraco.png') });

  /* vista mobile con combinazioni */
  await page.setViewportSize({ width: 390, height: 800 });
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(SHOT, 'd-mobile-tavolo.png') });

  await browser.close();
  console.log('Schermate salvate in ' + SHOT);
})();
