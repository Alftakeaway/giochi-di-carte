/* Play-smoke: due client reali giocano molti turni completi (pesca + scarta)
 * contro i bot, verificando che il loop server (turni umani + turni bot
 * automatici + broadcast) resti stabile e senza errori di console. */
const { chromium } = require('playwright-core');

const EXE = 'C:/Users/Alfredo/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
const BASE = 'http://localhost:3000';

const st = (p) => p.evaluate(() => { try { return JSON.parse(document.getElementById('json').textContent); } catch (e) { return null; } });

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
  const code = (await p1.textContent('#status')).match(/Stanza ([0-9A-F]{4})/)[1];
  console.log('Codice stanza:', code);

  await p2.goto(BASE + '/');
  await p2.evaluate((c) => open(c), code);
  await p2.waitForFunction(() => document.getElementById('status').textContent.includes('sei il giocatore'), null, { timeout: 8000 });

  // Aspetta che entrambi ricevano lo stato iniziale.
  await p1.waitForFunction(() => { const s = JSON.parse(document.getElementById('json').textContent || '{}'); return s && s.turno !== undefined; }, null, { timeout: 8000 });

  let turniUmani = 0;
  let maxTurnoVisto = -1;
  const pagine = { 0: p1, 2: p2 };

  for (let i = 0; i < 120; i++) {
    const s = await st(p1);
    if (!s) { await p1.waitForTimeout(50); continue; }
    if (s.finita) { console.log('Smazzata finita a iterazione', i, 'vincitore=', s.vincitore); break; }
    maxTurnoVisto = Math.max(maxTurnoVisto, s.turno);
    const seat = s.turno;
    const p = pagine[seat];
    if (!p) { await p1.waitForTimeout(30); continue; } // turno di un bot: aspetta
    // turno umano: pesca tallone, poi scarta la prima carta della mano
    await p.evaluate(() => pesca('tallone'));
    try {
      await p.waitForFunction((seat) => {
        const st = JSON.parse(document.getElementById('json').textContent);
        return st.seats[seat].handCount === 12;
      }, seat, { timeout: 3000 });
    } catch (e) { /* potrebbe già essere passato di turno dopo i bot */ }
    const cur = await st(p);
    if (!cur || !cur.seats[seat].hand || cur.seats[seat].hand.length === 0) { break; }
    const id = cur.seats[seat].hand[0].id;
    await p.evaluate((i) => act({ tipo: 'scarta', id: i }), id);
    turniUmani++;
    await p1.waitForTimeout(20);
  }

  console.log('Turni umani giocati:', turniUmani, '| max turno visto:', maxTurnoVisto);
  const ok = turniUmani >= 4 && errors.length === 0;
  console.log(ok ? 'PASS: loop di gioco stabile, azioni umane propagate' : 'FAIL');
  if (errors.length) console.log('ERRORI CONSOLE:', errors);
  await browser.close();
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
