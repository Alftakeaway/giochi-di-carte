/* Smoke end-to-end del server: due client reali (Chromium) si collegano via
 * WebSocket, uno crea la stanza e l'altro entra col codice, poi un umano
 * esegue una pesca e verifichiamo che lo stato torni aggiornato. */
const { chromium } = require('playwright-core');

const EXE = 'C:/Users/Alfredo/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
const BASE = 'http://localhost:3000';

(async () => {
  const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  const errors = [];
  const mk = async () => {
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    p.on('console', (m) => { if (m.type() === 'error') errors.push(p.url() + ': ' + m.text()); });
    p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    return p;
  };
  const p1 = await mk();
  const p2 = await mk();

  await p1.goto(BASE + '/');
  await p1.click('text=Crea partita');
  await p1.waitForFunction(() => /Stanza [0-9A-F]{4}/.test(document.getElementById('status').textContent), null, { timeout: 8000 });
  const status = await p1.textContent('#status');
  const code = status.match(/Stanza ([0-9A-F]{4})/)[1];
  console.log('Codice stanza:', code);

  await p2.goto(BASE + '/');
  await p2.evaluate((c) => open(c), code);
  await p2.waitForFunction(() => document.getElementById('status').textContent.includes('sei il giocatore'), null, { timeout: 8000 });

  // Il gioco parte: il bot (sedile 1) gioca, tocca al sedile 2 (p2).
  await p2.waitForFunction(() => document.getElementById('json').textContent.length > 2, null, { timeout: 8000 });
  await p2.evaluate(() => pesca('tallone'));
  await p2.waitForTimeout(600);

  const st2 = JSON.parse(await p2.textContent('#json'));
  const hand2 = st2.seats[2].handCount;
  const turno = st2.turno;
  console.log('p2 handCount dopo pesca:', hand2, ' turno:', turno);

  const ok = hand2 === 12;
  console.log(ok ? 'PASS: azione umana propagata via server' : 'FAIL: handCount atteso 12, ottenuto ' + hand2);
  if (errors.length) console.log('ERRORI CONSOLE:', errors);
  await browser.close();
  process.exit(ok && errors.length === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
