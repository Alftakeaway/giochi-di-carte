const assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process');
const old=cp.execFileSync('git',['show','1b539649d691fdc5076f65951e6f5b5f6f027fff:burraco/online.html'],{encoding:'utf8'}),now=fs.readFileSync('burraco/online.html','utf8');
for(const fn of ['pesca','calaSel','scartaSel','act']){
 const re=new RegExp('function '+fn+'\\([^\\n]*');
 assert.equal(now.match(re)[0].trim(),old.match(re)[0].trim());
}
assert.equal(cp.execFileSync('git',['diff','--name-only','1b539649d691fdc5076f65951e6f5b5f6f027fff','--','burraco-server/src/ai.rs','burraco-server/Dockerfile','burraco-server/Cargo.toml','burraco-server/Cargo.lock','vercel.json'],{encoding:'utf8'}),'');
console.log('PASS: native action transport, Rust AI, Docker, dependencies and Vercel config unchanged');
