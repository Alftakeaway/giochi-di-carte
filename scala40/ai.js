(function(root){
'use strict';
/* Scala 40 — bot locale (facile/normale/difficile).
 * `suggerisci(match, g)` restituisce UNA azione alla volta:
 * {tipo:'pesca',sorgente} | {tipo:'cala',ids} | {tipo:'lega',idx,ids} |
 * {tipo:'scarta',id} | null (passo già concluso). */
function utile(scarto,hand,E){
  if(!scarto) return false;
  // il bot prende lo scarto se con le carte in mano forma un gioco valido
  const h=hand.filter(c=>c.id!==scarto.id);
  for(let a=0;a<h.length;a++) for(let b=a+1;b<h.length;b++){
    if(E.validaMeld([h[a],h[b],scarto]).ok) return true;
  }
  // oppure se fa coppia secca con 2+ carte (valore uguale o scala possibile)
  let coppie=0;
  for(const c of h){
    if(c.jolly) continue;
    if(scarto.jolly){coppie++;continue}
    if(c.value===scarto.value||(c.suit===scarto.suit&&Math.abs(c.value-scarto.value)<=2)) coppie++;
  }
  return coppie>=2;
}
function tutteMeld(hand,E,maxLen){
  // enumera sottoinsiemi (3..maxLen) che formano un gioco valido
  const out=[],n=hand.length;
  const idx=k=>{const r=[];const rec=(s,l)=>{if(l===0){r.push(s.slice());return}for(let i=s.length?s[s.length-1]+1:0;i<n;i++){s.push(i);rec(s,l-1);s.pop()}};rec([],k);return r};
  for(let k=3;k<=Math.min(maxLen||6,n);k++){
    for(const comb of idx(k)){
      const sub=comb.map(i=>hand[i]);
      const v=E.validaMeld(sub);
      if(v.ok) out.push({ids:sub.map(c=>c.id),punti:v.punti});
    }
  }
  return out;
}
function cercaApertura(hand,E){
  // 1) tutta la mano in un colpo
  let p=E.partiziona(hand);
  if(p&&p.reduce((a,m)=>a+m.punti,0)>=E.APERTURA_MIN) return hand.map(c=>c.id);
  // 2) greedy: combina giochi disgiunti fino a 40
  const ms=tutteMeld(hand,E,6).sort((a,b)=>b.punti-a.punti);
  const usate=new Set(),scelte=[];
  let tot=0;
  for(const m of ms){
    if(m.ids.some(id=>usate.has(id))) continue;
    // verifica che il resto non serva: accetta solo giochi disgiunti
    m.ids.forEach(id=>usate.add(id));scelte.push(m);tot+=m.punti;
    if(tot>=E.APERTURA_MIN) return scelte.flatMap(m=>m.ids);
  }
  // 3) ricaduta esaustiva su sottoinsiemi grandi (n-1, n-2)
  const n=hand.length;
  for(let size=n-1;size>=Math.max(3,n-2);size--){
    const idx=[];const rec=(s,l)=>{if(l===0){idx.push(s.slice());return}for(let i=s.length?s[s.length-1]+1:0;i<n;i++){s.push(i);rec(s,l-1);s.pop()}};rec([],size);
    for(const comb of idx){
      const sub=comb.map(i=>hand[i]);
      const q=E.partiziona(sub);
      if(q&&q.reduce((a,m)=>a+m.punti,0)>=E.APERTURA_MIN) return sub.map(c=>c.id);
    }
  }
  return null;
}
function punteggioScarto(c,hand){
  // più alto = da scartare prima. Jolly quasi mai, coppie e scale potenziali no.
  if(c.jolly) return -100;
  let s=(c.value===1?11:c.value>10?10:c.value);
  for(const o of hand){
    if(o.id===c.id||o.jolly) continue;
    if(o.value===c.value) s-=12;
    else if(o.suit===c.suit&&Math.abs(o.value-c.value)<=2) s-=5;
  }
  return s;
}
function suggerisci(match,g,E){
  E=E||(typeof require!=='undefined'?require('./engine.js'):ScalaEngine);
  const o=match.observation(g);
  if(o.fineMano) return null;
  const diff=match.options.difficulty;
  if(o.fase==='pesca'){
    if(diff==='easy') return {tipo:'pesca',sorgente:'tallone'};
    if(o.scartiTop&&utile(o.scartiTop,o.hand,E)) return {tipo:'pesca',sorgente:'scarti'};
    return {tipo:'pesca',sorgente:'tallone'};
  }
  // fase gioco
  const team=match.team(g);
  if(!o.aperto[team]){
    if(diff==='easy'){
      const p=E.partiziona(o.hand);
      if(p&&p.reduce((a,m)=>a+m.punti,0)>=E.APERTURA_MIN) return {tipo:'cala',ids:o.hand.map(c=>c.id)};
    }else{
      const ids=cercaApertura(o.hand,E);
      if(ids) return {tipo:'cala',ids};
    }
  }else{
    // attacca tutto l'attaccabile (una carta alla volta, in ordine)
    const melds=o.melds;
    for(const c of o.hand){
      for(let i=0;i<melds.length;i++){
        if(E.validaMeld(melds[i].carte.concat([c])).ok) return {tipo:'lega',idx:i,ids:[c.id]};
      }
    }
    // cala un gioco singolo se possibile (non-apertura o post-apertura)
    if(diff!=='easy'){
      const ms=tutteMeld(o.hand,E,5);
      if(ms.length){
        ms.sort((a,b)=>b.punti-a.punti);
        return {tipo:'cala',ids:ms[0].ids};
      }
    }else{
      const p=E.partiziona(o.hand);
      if(p&&p.length===1) return {tipo:'cala',ids:o.hand.map(c=>c.id)};
    }
  }
  // scarta: la carta meno utile (il difficile chiude se può farlo scartando)
  const sorted=o.hand.slice().sort((a,b)=>punteggioScarto(b,o.hand)-punteggioScarto(a,o.hand));
  if(diff==='hard'&&o.aperto[team]&&o.hand.length===1) return {tipo:'scarta',id:o.hand[0].id};
  return {tipo:'scarta',id:(sorted[0]||o.hand[0]).id};
}
const api={suggerisci};
if(typeof module!=='undefined') module.exports=api;else root.ScalaAI=api;
})(typeof window==='undefined'?globalThis:window);
