/* =========================================================================
 * test/browser.test.js — Test dell'interfaccia con un browser reale
 * Esecuzione:
 *   NODE_PATH=<workspace>/node_modules node test/browser.test.js
 * ========================================================================= */
'use strict';

const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright-core');

const ROOT = path.resolve(__dirname, '..');
const URL_FILE = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/');
const SHOT = path.join(ROOT, 'test', 'screenshots');
const CHROME = 'C:/Users/Alfredo/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';

const erroriConsole = [];
const erroriPagina = [];
const problemi = [];
const log = console.log;

/* Codice che gira DENTRO la pagina: gioca in autonomia cliccando la vera UI. */
const PILOTA = `
async function pilota(partiteMax) {
  const b = window.__burraco;
  b.ui.animazione = false;
  const p = b.ui.partita;
  const attesa = (ms) => new Promise(r => setTimeout(r, ms));
  const btnBarra = (re) => Array.prototype.slice.call(document.querySelectorAll('#barra-azioni .btn'))
    .find(x => re.test(x.textContent));
  const carteMano = () => Array.prototype.slice.call(document.querySelectorAll('#mano-giocatore .carta.cliccabile'));
  const firmaMano = () => p.stato.fase + '|' + p.stato.turno + '|' + p.stato.mani[0].length + '|' +
    p.stato.melds[0].map(m => m.slots.length).join(',') + '|' + p.stato.melds[1].map(m => m.slots.length).join(',');
  const conta = () => {
    const s = p.stato;
    let n = s.tallone.length + s.monte.length + s.mani[0].length + s.mani[1].length +
      s.pozzetti[0].length + s.pozzetti[1].length;
    n += s.melds[0].reduce((a, m) => a + m.slots.length, 0);
    n += s.melds[1].reduce((a, m) => a + m.slots.length, 0);
    return n;
  };

  const rapporti = { iterazioni: 0, partite: 0, problemi: [], smazzate: 0, fermo: 0 };
  let firmaPrec = '';
  let fermoDa = 0;

  function firma() {
    const s = p.stato;
    return [s.turno, s.fase, s.mani[0].length, s.mani[1].length,
      s.tallone.length, s.monte.length, s.melds[0].length, s.melds[1].length,
      s.pozzettoPreso[0] ? 1 : 0, s.pozzettoPreso[1] ? 1 : 0].join('|');
  }

  function turnoUmano() {
    const s = p.stato;
    if (s.fase === 'pesca') {
      const b1 = btnBarra(/Pesca dal tallone/);
      if (b1 && !b1.disabled) { b1.click(); return true; }
      const b2 = btnBarra(/Prendi il monte/);
      if (b2 && !b2.disabled) { b2.click(); return true; }
      return false;
    }
    const sug = btnBarra(/Suggerisci/);
    if (sug) sug.click();
    const cala = btnBarra(/Cala/);
    if (cala && !cala.disabled) {
      const prima = firmaMano();
      cala.click();
      if (firmaMano() !== prima) return true;
    }

    for (let i = 0; i < 24; i++) {
      const c = carteMano();
      if (i >= c.length) break;
      const prima = firmaMano();
      c[i].click();
      const t = document.querySelector('#melds-0 .meld.target');
      if (t) {
        t.click();
        if (firmaMano() !== prima) return true;
      }
      const c2 = carteMano();
      if (c2[i]) c2[i].click();
    }
    /* deseleziona tutto prima di provare lo scarto */
    const annulla = btnBarra(/Annulla/);
    if (annulla) { annulla.click(); }

    for (let i = 0; i < 24; i++) {
      const c = carteMano();
      if (i >= c.length) break;
      const prima = firmaMano();
      c[i].click();
      const sc = btnBarra(/Scarta|Chiudi/);
      if (sc && !sc.disabled) {
        sc.click();
        if (firmaMano() !== prima) return true;
      }
      const c2 = carteMano();
      if (c2[i]) c2[i].click();
    }
    return false;
  }

  while (rapporti.partite < partiteMax && rapporti.iterazioni < 4000) {
    rapporti.iterazioni++;
    const s = p.stato;

    if (!document.getElementById('overlay-fine').hidden) {
      const primo = document.querySelector('#fine-azioni .btn');
      if (s.vincitore !== null) { rapporti.partite++; break; }
      if (primo) primo.click();
      await attesa(20);
      rapporti.smazzate++;
      continue;
    }

    if (b.ui.botInCorso) { await attesa(15); continue; }

    if (s.turno !== b.ui.manoVisibile) { await attesa(15); continue; }

    const fatto = turnoUmano();
    if (!fatto) {
      rapporti.problemi.push('turno bloccato: ' + JSON.stringify({
        fase: s.fase, turno: s.turno, manoVisibile: b.ui.manoVisibile,
        mano: s.mani[s.turno].length, tallone: s.tallone.length, monte: s.monte.length,
        botInCorso: b.ui.botInCorso, attesaConsegna: b.ui.attesaConsegna,
        cliccabili: document.querySelectorAll('#mano-giocatore .carta.cliccabile').length,
        pozzettoPreso: s.pozzettoPreso[s.turno], burrachi: p.contaBurrachi(s.turno),
        monteBloccato: s.monteBloccato,
        barra: document.getElementById('barra-azioni').textContent.trim()
      }));
      break;
    }

    /* rilevatore di stallo: nessun cambiamento di stato per troppe iterazioni */
    const f = firma();
    if (f === firmaPrec) { fermoDa++; } else { firmaPrec = f; fermoDa = 0; }
    if (fermoDa > 400) {
      rapporti.problemi.push('stallo: nessun progresso per 400 iterazioni, firma=' + f);
      break;
    }
    rapporti.fermo = Math.max(rapporti.fermo, fermoDa);

    if (conta() !== 108) {
      rapporti.problemi.push('carte non conservate: ' + conta() + ' al giro ' + rapporti.iterazioni);
      break;
    }
    await attesa(6);
  }
  rapporti.carteFinali = conta();
  rapporti.finita = p.stato.finita;
  rapporti.vincitore = p.stato.vincitore;
  rapporti.totali = p.stato.totali.slice();
  rapporti.smazzata = p.stato.smazzata;
  return rapporti;
}
`;

(async () => {
  if (!fs.existsSync(SHOT)) fs.mkdirSync(SHOT, { recursive: true });

  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--allow-file-access-from-files', '--disable-gpu']
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);

  page.on('console', function (m) { if (m.type() === 'error') erroriConsole.push(m.text()); });
  page.on('pageerror', function (e) { erroriPagina.push(e.message); });

  log('Apertura ' + URL_FILE);
  await page.goto(URL_FILE, { waitUntil: 'load' });
  await page.addScriptTag({ content: PILOTA });

  /* ---------------------------------------------------------------- 1 */
  log('1. schermata iniziale visibile: ' + (await page.isVisible('#schermata-avvio')));
  await page.screenshot({ path: path.join(SHOT, '1-avvio.png') });

  /* ---------------------------------------------------------------- 2 */
  await page.click('#scelta-modo .scelta[data-modo="cpu"]');
  await page.click('#scelta-livello .scelta[data-livello="normale"]');
  await page.click('#scelta-target .scelta[data-target="505"]');
  await page.click('#btn-avvia');
  await page.waitForTimeout(600);
  log('2. tavolo visibile: ' + (await page.isVisible('#tavolo')));
  log('   stato iniziale: ' + JSON.stringify(await page.evaluate(function () {
    const s = window.__burraco.ui.partita.stato;
    return {
      mano: [s.mani[0].length, s.mani[1].length], pozzetti: [s.pozzetti[0].length, s.pozzetti[1].length],
      tallone: s.tallone.length, monte: s.monte.length, turno: s.turno
    };
  })));
  await page.screenshot({ path: path.join(SHOT, '2-tavolo-iniziale.png') });

  /* --------------------------------------- 3. click REALI sulla interfaccia */
  const btnPesca = page.locator('#barra-azioni .btn', { hasText: 'Pesca dal tallone' });
  await btnPesca.click();
  await page.waitForTimeout(200);
  const dopoPesca = await page.evaluate(function () {
    return {
      fase: window.__burraco.ui.partita.stato.fase,
      mano: window.__burraco.ui.partita.stato.mani[0].length,
      carteVisibili: document.querySelectorAll('#mano-giocatore .carta').length
    };
  });
  log('3. click reale "Pesca dal tallone": ' + JSON.stringify(dopoPesca));

  await page.locator('#mano-giocatore .carta.cliccabile').first().click();
  await page.waitForTimeout(150);
  const selezione = await page.evaluate(function () {
    return {
      selezionate: window.__burraco.ui.selezione.size,
      evidenziate: document.querySelectorAll('.carta.selezionata').length,
      scartaAbilitato: !document.querySelector('#barra-azioni .btn:last-child') ? null : null
    };
  });
  log('   click reale su una carta: ' + JSON.stringify(selezione));
  const scartaDisabilitato = await page.evaluate(function () {
    const b = Array.prototype.slice.call(document.querySelectorAll('#barra-azioni .btn'))
      .find(x => /Scarta|Chiudi/.test(x.textContent));
    return b ? b.disabled : null;
  });
  log('   pulsante Scarta abilitato dopo la selezione: ' + (scartaDisabilitato === false));
  await page.screenshot({ path: path.join(SHOT, '3-carta-selezionata.png') });

  /* ------------------------------------------------- 4. partita completa */
  log('4. gioco una partita completa pilotando la UI…');
  const inizio = Date.now();
  const rapp = await page.evaluate('pilota(1)');
  log('   iterazioni: ' + rapp.iterazioni + ' · durata ' + ((Date.now() - inizio) / 1000).toFixed(1) + ' s');
  log('   esito: ' + JSON.stringify({
    finita: rapp.finita, vincitore: rapp.vincitore, totali: rapp.totali,
    smazzate: rapp.smazzata, carte: rapp.carteFinali
  }));
  rapp.problemi.forEach(function (p) { problemi.push(p); });
  if (rapp.carteFinali !== 108) problemi.push('carte non conservate a fine partita');
  await page.screenshot({ path: path.join(SHOT, '4-fine-partita.png') });

  /* -------------------------------------------------- 5. altre 2 partite */
  log('5. altre due partite (livello difficile)…');
  await page.evaluate(function () {
    window.__burraco.ui.config.livello = 'difficile';
    window.__burraco.avvia({ modo: 'cpu', livello: 'difficile', target: 505 });
  });
  await page.waitForTimeout(400);
  const rapp2 = await page.evaluate('pilota(2)');
  log('   esito: ' + JSON.stringify({
    finita: rapp2.finita, vincitore: rapp2.vincitore, totali: rapp2.totali,
    smazzate: rapp2.smazzata, carte: rapp2.carteFinali
  }));
  rapp2.problemi.forEach(function (p) { problemi.push(p); });
  if (rapp2.carteFinali !== 108) problemi.push('carte non conservate nella seconda partita');

  /* --------------------------------------------------------- 6. regole */
  await page.evaluate(function () { document.getElementById('overlay-regole').hidden = false; });
  await page.waitForTimeout(250);
  log('6. pannello regole visibile: ' + (await page.isVisible('#overlay-regole .regole')));
  await page.screenshot({ path: path.join(SHOT, '6-regole.png') });
  await page.evaluate(function () { document.getElementById('overlay-regole').hidden = true; });

  /* --------------------------------------------------------- 7. mobile */
  await page.setViewportSize({ width: 390, height: 780 });
  await page.waitForTimeout(400);
  const mobileOk = await page.evaluate(function () {
    return document.documentElement.scrollWidth <= window.innerWidth + 2;
  });
  log('7. mobile senza scorrimento orizzontale: ' + mobileOk);
  await page.screenshot({ path: path.join(SHOT, '7-mobile.png') });

  /* ------------------------------------------------- 8. due giocatori */
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(function () {
    document.getElementById('overlay-fine').hidden = true;
    window.__burraco.avvia({ modo: 'hotseat', nomi: ['Anna', 'Marco'], target: 505 });
  });
  await page.waitForTimeout(400);
  const hs = await page.evaluate(function () {
    return {
      modo: window.__burraco.ui.config.modo,
      manoVisibile: window.__burraco.ui.manoVisibile,
      turno: window.__burraco.ui.partita.stato.turno
    };
  });
  log('8. modalità in due: ' + JSON.stringify(hs));

  /* gioca un turno e verifica il passaggio del dispositivo */
  await page.locator('#barra-azioni .btn', { hasText: 'Pesca dal tallone' }).click();
  await page.waitForTimeout(150);
  await page.locator('#mano-giocatore .carta.cliccabile').first().click();
  await page.waitForTimeout(100);
  await page.locator('#barra-azioni .btn', { hasText: /Scarta|Chiudi/ }).click();
  await page.waitForTimeout(250);
  const consegna = await page.evaluate(function () {
    return {
      overlay: !document.getElementById('overlay-consegna').hidden,
      testo: document.getElementById('consegna-testo').textContent,
      manoVisibile: window.__burraco.ui.manoVisibile
    };
  });
  log('   passaggio dispositivo richiesto: ' + consegna.overlay + ' -> "' + consegna.testo + '"');
  await page.screenshot({ path: path.join(SHOT, '8b-consegna.png') });
  await page.click('#btn-consegna');
  await page.waitForTimeout(250);
  const dopoConsegna = await page.evaluate(function () {
    return {
      manoVisibile: window.__burraco.ui.manoVisibile,
      turno: window.__burraco.ui.partita.stato.turno,
      manoRenderizzata: document.querySelectorAll('#mano-giocatore .carta').length
    };
  });
  log('   dopo la conferma: ' + JSON.stringify(dopoConsegna));
  if (!consegna.overlay) problemi.push('il passaggio del dispositivo non viene richiesto');
  if (dopoConsegna.manoVisibile !== dopoConsegna.turno) problemi.push('mano visibile non allineata al turno');
  await page.screenshot({ path: path.join(SHOT, '8-due-giocatori.png') });

  /* --------------------------------------------- 9. aggiornamento schermo */
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(function () { window.__burraco.avvia({ modo: 'cpu', livello: 'normale', target: 505 }); });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(SHOT, '9-tavolo-pulito.png') });

  log('');
  log('========================================================');
  log('Errori di pagina   : ' + erroriPagina.length);
  erroriPagina.forEach(function (e) { log('   x ' + e); });
  log('Errori in console  : ' + erroriConsole.length);
  erroriConsole.slice(0, 10).forEach(function (e) { log('   x ' + e); });
  log('Problemi di gioco  : ' + problemi.length);
  problemi.slice(0, 10).forEach(function (e) { log('   x ' + e); });
  log('========================================================');

  await browser.close();

  const ok = erroriPagina.length === 0 && erroriConsole.length === 0 && problemi.length === 0 &&
    rapp.carteFinali === 108 && rapp2.carteFinali === 108 && rapp.finita && mobileOk;
  console.log(ok ? 'TEST BROWSER: SUPERATO' : 'TEST BROWSER: FALLITO');
  process.exit(ok ? 0 : 1);
})();
