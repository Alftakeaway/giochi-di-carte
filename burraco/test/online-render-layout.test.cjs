'use strict';
const {chromium}=require('playwright-core');const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({executablePath:'C:/Users/Alfredo/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe',headless:true});
try{
 const ctx=await browser.newContext({viewport:{width:1366,height:768}}),a=await ctx.newPage(),b=await ctx.newPage(),errors=[];
 for(const p of [a,b])p.on('pageerror',e=>errors.push(e.message));
 const url=(process.env.TEST_BASE_URL||'http://127.0.0.1:3140')+'/burraco/online.html?server=wss://giochi-di-carte.onrender.com';
 await a.goto(url);await b.goto(url);await a.getByRole('button',{name:'Crea partita',exact:true}).click();
 await a.waitForFunction(()=>document.getElementById('status').textContent.includes('Stanza '),{},{timeout:120000});
 const room=await a.evaluate(()=>document.getElementById('status').textContent.match(/Stanza ([A-Z0-9]+)/)[1]);
 b.once('dialog',d=>d.accept(room));await b.getByRole('button',{name:'Entra con codice',exact:true}).click();
 for(const p of [a,b])await p.waitForFunction(()=>document.body.classList.contains('layout-online'),{},{timeout:120000});
 for(const p of [a,b]){
  assert.equal(await p.evaluate(()=>last.seats.filter(s=>s.seat!==seat).every(s=>s.hand.length===0)),true);
  assert.equal(await p.locator('#mano-giocatore>.carta').count(),11);
 }
 console.log('PASS: both clients connected to existing Render; both seats render, opponent hands remain private');
 const who=await a.evaluate(()=>last.turno);const active=(await a.evaluate(()=>seat))===who?a:b;
 const n=await active.locator('#mano-giocatore>.carta').count();
 await active.getByRole('button',{name:'Pesca dal tallone',exact:true}).click();await active.waitForFunction(()=>last.fase==='gioco');
 assert.equal(await active.locator('#mano-giocatore>.carta').count(),n+1);
 await active.locator('#mano-giocatore>.carta').last().click();
 await active.getByRole('button',{name:'Scarta',exact:true}).click();await active.waitForFunction(old=>last.turno!==old,who);
 const next=await active.evaluate(()=>last.turno);for(const p of [a,b])await p.waitForFunction(expected=>last.turno===expected,next);
 assert.equal(await a.evaluate(()=>last.turno),await b.evaluate(()=>last.turno));
 assert.equal(await active.locator('#mano-giocatore>.carta').count(),n);
 assert.deepEqual(errors,[]);
 for(const p of [a,b])assert.equal(await p.evaluate(()=>document.querySelector('#barra-azioni').getBoundingClientRect().bottom<=document.querySelector('#mano-giocatore>.carta').getBoundingClientRect().top),true);
 console.log('PASS: draw and discard acknowledged by Render; both clients synchronized; no browser errors');
 await a.screenshot({path:'../../outputs/burraco-online-render-verificato.jpg'});
}finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
