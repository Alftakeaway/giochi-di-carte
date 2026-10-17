/* =========================================================================
 * test/chiusura.test.js — Prova end-to-end della chiusura della smazzata
 * Prepara una situazione di gioco, clicca davvero "Chiudi la smazzata" e
 * controlla i punti assegnati.
 *   NODE_PATH=<workspace>/node_modules node test/chiusura.test.js
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

  /* ---- situazione: ho un burraco pulito, il pozzetto preso e una carta ---- */
  const preparato = await page.evaluate(function () {
    const b = window.__burraco;
    const E = window.BurracoEngine;
    const s = b.ui.partita.stato;
    s.turno = 0;
    s.fase = 'gioco';
    s.pozzettoPreso = [true, false];
    s.pozzetti = [[], []];          // il computer non ha preso il suo
    s.mani[1] = [
      new E.Carta('av1', 10, 'quadri', false),
      new E.Carta('av2', 13, 'picche', false),
      new E.Carta('av3', 1, 'fiori', false)
    ];
    const scala = [3, 4, 5, 6, 7, 8, 9].map(function (v) {
      return new E.Carta('s' + v, v, 'cuori', false);
    });
    s.melds[0] = [{
      id: 'burraco1', tipo: 'sequenza', seme: 'cuori',
      slots: scala.map(function (c) { return { carta: c, valore: c.valore, wild: false }; }),
      punti: scala.reduce(function (a, c) { return a + c.punti; }, 0),
      burraco: true, pulito: true, sporco: false, matte: 0, lunghezza: 7
    }];
    s.melds[1] = [];
    s.mani[0] = [new E.Carta('ultima', 7, 'quadri', false)];
    b.ui.selezione.clear();
    b.render();
    return {
      chiude: b.ui.partita.chiudeCon(0, 'ultima'),
      puntiMeld: b.ui.partita.puntiMeld(0),
      bonus: b.ui.partita.bonusMeld(0),
      inManoAvv: b.ui.partita.puntiInMano(1)
    };
  });

  console.log('situazione preparata:', JSON.stringify(preparato));
  verifica('il motore dichiara la chiusura possibile', preparato.chiude === true, preparato);

  /* ---- click reali: carta, poi il pulsante di chiusura ---- */
  await page.locator('#mano-giocatore .carta').first().click();
  await page.waitForTimeout(120);
  const etichetta = await page.evaluate(function () {
    const b = Array.prototype.slice.call(document.querySelectorAll('#barra-azioni .btn'))
      .find(x => /Chiudi|Scarta/.test(x.textContent));
    return { testo: b ? b.textContent.trim() : null, disabilitato: b ? b.disabled : null };
  });
  verifica('il pulsante diventa "Chiudi la smazzata"', /Chiudi la smazzata/.test(etichetta.testo || ''), etichetta);
  verifica('il pulsante è abilitato', etichetta.disabilitato === false, etichetta);

  await page.locator('#barra-azioni .btn', { hasText: 'Chiudi la smazzata' }).click();
  await page.waitForTimeout(400);

  const dopo = await page.evaluate(function () {
    const p = window.__burraco.ui.partita;
    const pu = p.stato.punteggiUltima;
    return {
      chiusaDa: pu && pu.chiusaDa,
      punti: pu && pu.punti,
      dettaglio: pu && pu.dettaglio,
      totali: p.stato.totali,
      overlayVisibile: !document.getElementById('overlay-fine').hidden,
      titolo: document.getElementById('fine-titolo').textContent,
      tabella: document.getElementById('fine-contenuto').textContent.replace(/\s+/g, ' ').trim()
    };
  });

  console.log('esito chiusura:', JSON.stringify(dopo.punti), '| titolo:', dopo.titolo);
  verifica('la smazzata è chiusa dal giocatore 0', dopo.chiusaDa === 0, dopo.chiusaDa);
  verifica('bonus chiusura +100', dopo.dettaglio && dopo.dettaglio[0].chiusura === 100, dopo.dettaglio);
  verifica('bonus burraco pulito +200', dopo.dettaglio && dopo.dettaglio[0].bonusBurraco === 200, dopo.dettaglio);
  verifica('punti chiude = carte calate + 200 + 100',
    dopo.punti[0] === preparato.puntiMeld + 200 + 100, dopo.punti);
  verifica('avversario: penalità pozzetto -100',
    dopo.dettaglio[1].penalePozzetto === 100, dopo.dettaglio[1]);
  verifica('avversario: carte in mano sottratte',
    dopo.punti[1] === -(preparato.inManoAvv + 100), { punti: dopo.punti[1], atteso: -(preparato.inManoAvv + 100) });
  verifica('i totali di partita si aggiornano', dopo.totali[0] === dopo.punti[0], dopo.totali);
  verifica('compare il riepilogo di fine smazzata', dopo.overlayVisibile === true);
  verifica('il titolo dice che hai chiuso tu', /Hai chiuso la smazzata/.test(dopo.titolo), dopo.titolo);
  verifica('la tabella riporta il bonus di chiusura', /Bonus chiusura/.test(dopo.tabella), dopo.tabella.slice(0, 200));
  verifica('nessun errore JavaScript', errori.length === 0, errori.slice(0, 3));

  await page.screenshot({ path: path.join(SHOT, 'e-chiusura.png') });

  await browser.close();
  console.log('\n========================================================');
  console.log('TEST CHIUSURA: passati ' + passati + ' · falliti ' + falliti);
  console.log('========================================================');
  process.exit(falliti === 0 ? 0 : 1);
})();
