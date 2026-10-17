/* Verifica che burraco/online.html (frontend statico) si connetta al server
 * Rust su ws://localhost:3000 e giochi alcuni turni contro i bot. */
const { chromium } = require('playwright-core');
const path = require('path');

const EXE = 'C:/Users/Alfredo/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
const FILE = 'file:///' + path.resolve('C:/Users/Alfredo/WorkBuddy AI/2026-10-17-03-02-04/burraco/online.html').split('\\').join('/');

const st = (p) => p.evaluate(() => { try { return JSON.parse(document.getElementById('json').textContent); } catch (e) { return null; } });

(async () => {
  const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox', '--allow-file-access-from-files'] });
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

  await p1.goto(FILE);
  await p1.evaluate(() => crea());
  await p1.waitForFunction(() => /Stanza [0-9A-F]{4}/.test(document.getElementById('status').textContent), null, { timeout: 8000 });
  const code = (await p1.textContent('#status')).match(/Stanza ([0-9A-F]{4})/)[1];
  console.log('Codice stanza:', code);

  await p2.goto(FILE);
  await p2.evaluate((c) => openConn(c), code);
  await p2.waitForFunction(() => document.getElementById('status').textContent.includes('sei il giocatore'), null, { timeout: 8000 });

  await p1.waitForFunction(() => { const s = JSON.parse(document.getElementById('json').textContent || '{}'); return s && s.turno !== undefined; }, null, { timeout: 8000 });

  let turniUmani = 0;
  const pagine = { 0: p1, 2: p2 };
  for (let i = 0; i < 80; i++) {
    const s = await st(p1);
    if (!s) { await p1.waitForTimeout(50); continue; }
    if (s.finita) break;
    const seat = s.turno;
    const p = pagine[seat];
    if (!p) { await p1.waitForTimeout(30); continue; }
    await p.evaluate(() => pesca('tallone'));
    try {
      await p.waitForFunction((seat) => {
        const st = JSON.parse(document.getElementById('json').textContent);
        return st.seats[seat].handCount === 12;
      }, seat, { timeout: 3000 });
    } catch (e) {}
    const cur = await st(p);
    if (!cur || !cur.seats[seat].hand || cur.seats[seat].hand.length === 0) break;
    const id = cur.seats[seat].hand[0].id;
    await p.evaluate((id) => act({ tipo: 'scarta', id }), id);
    turniUmani++;
    await p1.waitForTimeout(20);
  }

  console.log('Turni umani giocati (via online.html):', turniUmani);
  const ok = turniUmani >= 4 && errors.length === 0;
  console.log(ok ? 'PASS: online.html gioca contro il server Rust' : 'FAIL');
  if (errors.length) console.log('ERRORI:', errors);
  await browser.close();
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
