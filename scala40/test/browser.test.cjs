const{chromium}=require('playwright-core'),a=require('node:assert/strict');
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:3160';
(async()=>{const b=await chromium.launch({executablePath:'C:/Users/Alfredo/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe',headless:true});try{
  const p=await b.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.status()>=400&&r.url().startsWith(base))errors.push(r.status()+' '+r.url())});await p.goto(base+'/scala40/');
  await p.locator('[data-variant="quattro"]').click();a.ok(await p.locator('#seats select').count()===4);
  await p.locator('[data-variant="due"]').click();await p.locator('[data-duration="r1"]').click();await p.locator('#start').click();
  await p.waitForFunction(()=>document.querySelectorAll('#hand button').length===13);
  await p.waitForFunction(()=>[...document.querySelectorAll('img')].every(i=>!i.offsetParent||(i.complete&&i.naturalWidth>0)));
  a.ok(await p.locator('#deck-pile').isEnabled());a.ok(await p.locator('#discard-pile').isEnabled());
  await p.locator('#deck-pile').click();
  await p.waitForFunction(()=>document.querySelectorAll('#hand button').length===14);
  await p.locator('#hand button').first().click();a.ok(await p.locator('#btn-scarta').isEnabled());
  await p.locator('#btn-scarta').click();
  await p.waitForFunction(()=>document.querySelectorAll('#hand button').length===13);
  await p.locator('#menu').click();await p.getByRole('button',{name:'Regole',exact:true}).click();
  a.match(await p.locator('#dialog-body').innerText(),/apertura/i);await p.locator('#dialog-close').click();
  await p.reload();await p.locator('#resume').click();await p.waitForFunction(()=>window.ScalaApp&&ScalaApp.match);
  a.ok(await p.locator('#hand button').count()>=13);a.deepEqual(errors,[]);console.log('PASS scala40 setup, pesca, scarto, regole, resume, immagini');
}finally{await b.close()}})().catch(e=>{console.error(e);process.exitCode=1});
