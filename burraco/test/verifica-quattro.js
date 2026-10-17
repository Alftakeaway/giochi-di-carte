const { chromium } = require('playwright-core');
const CHROME = 'C:/Users/Alfredo/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
const SHOT = 'C:/Users/Alfredo/WorkBuddy AI/2026-10-17-03-02-04/burraco/test/screenshots/';
(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 1440, height: 810 } });
  const errori = [];
  page.on('pageerror', e => errori.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errori.push('console: ' + m.text()); });

  await page.goto('http://127.0.0.1:8765/index.html', { waitUntil: 'load' });

  /* scegli "Contro il computer" + "Quattro giocatori" e avvia */
  await page.click('#scelta-giocatori .scelta[data-giocatori="4"]');
  await page.click('#btn-avvia');
  await page.waitForTimeout(600);

  const struttura = await page.evaluate(function () {
    const campo = document.querySelector('#campo-gioco');
    return {
      classi: Array.prototype.slice.call(campo.children).map(c => c.className),
      quanteColonne: campo.children.length,
      meldsPresenti: [0, 1, 2, 3].map(function (g) {
        return document.querySelectorAll('#melds-' + g + ' .meld').length;
      }),
      nastri: document.querySelectorAll('#mano-avversario .mano-bot').length,
      nomiNastri: Array.prototype.slice.call(document.querySelectorAll('#mano-avversario .nome-bot'))
        .map(function (n) { return n.textContent; }),
      scatolePunteggio: document.querySelectorAll('#punteggi .punteggio-box').length,
      nomiSquadre: Array.prototype.slice.call(document.querySelectorAll('#punteggi .punteggio-box .nome'))
        .map(function (n) { return n.textContent; }),
      carteInMano: document.querySelectorAll('#mano-giocatore .carta').length,
      quattrо: document.querySelector('#tavolo').classList.contains('quattro'),
      nGioc: window.__burraco.ui.partita.nGioc,
      turno: window.__burraco.ui.partita.stato.turno
    };
  });
  console.log('struttura:', JSON.stringify(struttura, null, 1));

  /* aspetta che i bot giochino qualche turno (la catena bot→bot deve reggere) */
  await page.waitForTimeout(9000);

  const dopo = await page.evaluate(function () {
    const p = window.__burraco.ui.partita, s = p.stato;
    return {
      turno: s.turno,
      carteMano: s.mani[0].length,
      quanteSmazzateLog: s.log.length,
      mani: s.mani.map(function (m) { return m.length; }),
      melds: s.melds.map(function (m) { return m.length; }),
      botInCorso: window.__burraco.ui.botInCorso,
      finita: s.finita
    };
  });
  console.log('dopo i turni dei bot:', JSON.stringify(dopo, null, 1));
  await page.screenshot({ path: SHOT + 'quattro-tavolo.png' });

  /* il giro deve tornare al giocatore umano */
  okTurnoUmano(dopo.turno);
  function okTurnoUmano(t) {
    console.log(t === 0 ? '  ok   il turno è tornato al giocatore umano' :
      '  nota: turno ' + t + ' (bot ancora in corso, verificare)');
  }

  /* simulazione completa: umano + 3 bot fino a fine smazzata */
  const finale = await page.evaluate(async function () {
    const b = window.__burraco, p = b.ui.partita;
    b.ui.animazione = false;
    let passi = 0;
    while (!p.stato.finita && passi < 400) {
      if (p.stato.turno === 0) {
        // l'umano: pesca e scarta la prima carta (azioni minime valide)
        if (p.stato.fase === 'pesca') {
          if (p.stato.tallone.length) p.pescaTallone();
          else if (p.stato.monte.length) p.prendiMonte();
          else break;
        } else {
          const vietate = p.stato.mani[0].filter(function (c) { return p.scartoVietato(0, c.id); });
          const scartabili = p.stato.mani[0].filter(function (c) { return !p.scartoVietato(0, c.id); });
          if (!scartabili.length) break;
          p.scarta(scartabili[Math.floor(Math.random() * scartabili.length)].id);
          void vietate;
        }
      } else {
        window.BurracoAI.giocaTurno(p, 'normale');
      }
      passi++;
    }
    const s = p.stato;
    return {
      finita: s.finita,
      chiusaDa: s.chiusaDa,
      vincitore: s.vincitore,
      totali: s.totali,
      totaliSquadra: p.totaliSquadra(),
      passi: passi
    };
  });
  console.log('smazzata completa:', JSON.stringify(finale, null, 1));

  const pannello = await page.evaluate(function () {
    window.__burraco.mostraFineSmazzata();
    const box = document.querySelector('#overlay-fine');
    return {
      visibile: !box.hidden,
      titolo: document.querySelector('#fine-titolo').textContent,
      righe: document.querySelectorAll('#fine-contenuto .tabella-punti tbody tr').length,
      colonne: document.querySelectorAll('#fine-contenuto .tabella-punti thead th').length,
      contenuto: document.querySelector('#fine-contenuto').textContent.replace(/\s+/g, ' ').slice(0, 300)
    };
  });
  console.log('pannello fine:', JSON.stringify(pannello, null, 1));
  await page.screenshot({ path: SHOT + 'quattro-fine.png' });

  console.log('  errori:', errori.length ? errori : 'nessuno');
  await browser.close();
})();
