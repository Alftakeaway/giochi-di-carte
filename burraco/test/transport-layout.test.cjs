const assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process');
const old=cp.execFileSync('git',['show','1b539649d691fdc5076f65951e6f5b5f6f027fff:burraco/online.html'],{encoding:'utf8'}),now=fs.readFileSync('burraco/online.html','utf8');
assert.equal(now.match(/<script>([\s\S]*?)<\/script>/)[1].replace(/\r\n/g,'\n'),old.match(/<script>([\s\S]*?)<\/script>/)[1].replace(/\r\n/g,'\n'));
assert.equal(cp.execFileSync('git',['diff','--name-only','1b539649d691fdc5076f65951e6f5b5f6f027fff','--','burraco-server','vercel.json'],{encoding:'utf8'}),'');
console.log('PASS: connection/reconnection/actions inline script identical ignoring line endings; Rust server and Vercel config unchanged');
