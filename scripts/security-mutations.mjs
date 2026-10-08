// Deterministic 1,000,000 BIME input mutations. Not a pentest.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {trustedOrigin} from '../src/security.mjs';
const ITERATIONS=1000000,sha=createHash('sha256');
let positive=0,negative=0;
const counts=Array(20).fill(0);
for(let i=0;i<ITERATIONS;i++){
 const k=i%20,h='l'+i.toString(36)+'.library.example.edu';
 let origin='https://'+h,host=h,prod=true,expected=false;
 switch(k){
  case 0:expected=true;break;
  case 1:prod=false;origin='http://'+h;expected=true;break;
  case 2:prod=false;expected=true;break;
  case 3:origin='http://'+h;break;
  case 4:origin='https://evil'+i+'.example.edu';break;
  case 5:origin+=' .attacker.invalid';break;
  case 6:origin='https://'+h+'.attacker.invalid';break;
  case 7:origin='https://attacker@'+h;break;
  case 8:origin+='/account';break;
  case 9:origin+='?session=evil';break;
  case 10:origin+='#leak';break;
  case 11:origin='ftp://'+h;break;
  case 12:origin='null';break;
  case 13:host=h+'@evil.invalid';break;
  case 14:host=h+'\t';break;
  case 15:host=h+':443';break;
  case 16:origin='https://'+h+':444';break;
  case 17:origin='https://user:pass@'+h;break;
  case 18:origin='https://'+h+'/../admin';break;
  case 19:origin='data:text/html,'+h;break;
 }
 const actual=trustedOrigin(origin,host,{production:prod});
 assert.equal(actual,expected,'BIME class='+k+' iteration='+i);
 sha.update(String.fromCharCode(48+k));sha.update(actual?'1':'0');
 counts[k]++;if(actual)positive++;else negative++;
}
assert.equal(positive+negative,ITERATIONS);
assert.equal(positive,150000);
assert.equal(negative,850000);
console.log(JSON.stringify({gate:'BIME_TRUST_BOUNDARY_MUTATIONS',status:'PASS',
 iterations:ITERATIONS,classes:counts.length,accepted:positive,rejected:negative,
 witness:sha.digest('hex'),revision:process.env.GIT_SHA||'unbound',
 limits:['not 1m HTTP requests','not an external penetration test']},null,2));
