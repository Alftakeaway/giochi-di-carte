'use strict';
const {chromium}=require('playwright-core');
const assert=require('node:assert/strict');
const path=require('node:path');
const chrome='C:/Users/Alfredo/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
(async()=>{
 const browser=await chromium.launch({executablePath:chrome,headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1366,height:768}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{const timer=window.setTimeout.bind(window);window.setTimeout=(fn,...args)=>fn&&fn.name==='turnoBot'?0:timer(fn,...args)});
  await page.goto('http://127.0.0.1:3140/burraco/');
  await page.evaluate(()=>{window.__burraco.avvia({giocatori:4,modo:'cpu',nomi:['Tu','Avv. 1','Compagno','Avv. 2']});const b=window.__burraco;b.ui.partita.stato.turno=0;b.ui.partita.stato.fase='pesca';b.ui.botInCorso=false;b.render()});
  await page.waitForFunction(()=>document.querySelector('#mano-giocatore').children[0].getBoundingClientRect().height===70);
  const before=await page.evaluate(()=>window.__burraco.ui.partita.stato.mani[0].length);
  await page.locator('#mazzetto-tallone').click();
  assert.equal(await page.evaluate(()=>window.__burraco.ui.partita.stato.mani[0].length),before+1);
  await page.locator('#mano-giocatore>.carta').last().click();
  await page.waitForFunction(()=>window.__burraco.ui.selezione.size===1);
  assert.equal(await page.getByRole('button',{name:'Scarta',exact:true}).isEnabled(),true);
  await page.getByRole('button',{name:'Scarta',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.__burraco.ui.partita.stato.mani[0].length),before);
  console.log('PASS: actual draw, selection, discard, bot handoff');
  await page.evaluate(()=>{const b=window.__burraco,E=window.BurracoEngine,p=b.ui.partita,s=p.stato;s.turno=0;s.fase='gioco';b.ui.botInCorso=false;s.mani[0]=[new E.Carta('layout-six',6,'cuori',false),new E.Carta('layout-nine',9,'picche',false)];const m={id:'layout-lega',tipo:'sequenza',seme:'cuori',slots:[3,4,5].map(v=>({carta:new E.Carta('layout-heart'+v,v,'cuori',false),valore:v,wild:false}))};p._aggiornaMeld(m);s.melds[0]=[m];b.render()});
  await page.locator('#mano-giocatore>.carta').first().click();await page.getByRole('button',{name:'Lega',exact:true}).click();await page.locator('#melds-0 .meld').click();
  assert.equal(await page.evaluate(()=>window.__burraco.ui.partita.stato.melds[0][0].slots.length),4);console.log('PASS: Lega control attaches the selected card through the original engine');
  // Rendering stress only: native engine objects, sixteen combinations per team.
  await page.evaluate(()=>{
   const b=window.__burraco,E=window.BurracoEngine,p=b.ui.partita,s=p.stato;s.turno=0;s.fase='gioco';b.ui.botInCorso=false;
   s.melds=Array.from({length:4},(_,g)=>Array.from({length:8},(_,i)=>{const ranks=i===0?Array.from({length:13},(_,k)=>k+1):[3,4,5];const slots=ranks.map((v,k)=>({carta:new E.Carta('layout'+g+'-'+i+'-'+k,v,['cuori','quadri','fiori','picche'][g],false),valore:v,wild:false}));const m={id:'layout-'+g+'-'+i,tipo:'sequenza',seme:['cuori','quadri','fiori','picche'][g],slots};p._aggiornaMeld(m);return m}));b.render();
  });
  for(const viewport of [{width:1366,height:768},{width:1536,height:864},{width:1280,height:720}]){
   await page.setViewportSize(viewport);await page.waitForTimeout(80);
   const result=await page.evaluate(()=>{const melds=[...document.querySelectorAll('.approved-board .meld')].map(m=>m.getBoundingClientRect()),dock=document.querySelector('.footer-tavolo').getBoundingClientRect();return{count:melds.length,over:melds.filter(r=>r.left<0||r.right>innerWidth||r.bottom>dock.top+1).map(r=>({l:r.left,r:r.right,b:r.bottom})),dock:dock.top,inside:melds.every(r=>r.left>=0&&r.right<=innerWidth&&r.bottom<=dock.top+1),noScroll:document.documentElement.scrollWidth===innerWidth&&document.documentElement.scrollHeight===innerHeight}});
   assert.equal(result.count,32);assert.ok(result.inside,JSON.stringify({viewport,result}));assert.ok(result.noScroll);
  }
  console.log('PASS: 32 combinations, thirteen-card runs, three laptop sizes');
  await page.getByRole('button',{name:'Seme',exact:true}).click();assert.equal(await page.evaluate(()=>window.__burraco.ui.ordineMano),'seme');
  assert.deepEqual(errors,[]);console.log('PASS: sorting and no browser exceptions');
  await page.screenshot({path:'../../outputs/burraco-tavolo-reale.jpg'});
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
