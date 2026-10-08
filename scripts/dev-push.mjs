// Local-only VAPID setup. Public dev:push opts in explicitly and persists
// a private key under ignored data/, not in git or stdout.
import {mkdirSync,readFileSync,writeFileSync,chmodSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawn} from 'node:child_process';
import webpush from 'web-push';
const base=resolve('data');
const configPath=resolve(base,'dev-push-vapid.json');
mkdirSync(base,{recursive:true,mode:0o700});
let keys;
try{
  const saved=JSON.parse(readFileSync(configPath,'utf8'));
  if(!saved.publicKey||!saved.privateKey)throw Error('INVALID_KEYS');
  keys=saved;
}catch{
  keys=webpush.generateVAPIDKeys();
  writeFileSync(configPath,JSON.stringify(keys),{mode:0o600,flag:'w'});
}
chmodSync(configPath,0o600);
console.log('LUMEN dev:push: Web Push abilitato sul server locale. Chiavi VAPID private in data/ (gitignored).');
console.log('Apri LUMEN dalla porta 3000 su localhost o dalla URL HTTPS di Codespaces.');
console.log('Accedi → Impostazioni → Attiva su questo dispositivo. Il browser deve concedere il permesso.');
console.log('Il recapito tramite sistema operativo non è garantito: la casella Comunicazioni è autorevole.');
const child=spawn('npm',['run','dev'],{stdio:'inherit',env:{
 ...process.env,
 VAPID_PUBLIC_KEY:keys.publicKey,
 VAPID_PRIVATE_KEY:keys.privateKey,
 VAPID_SUBJECT:'mailto:library@localhost.invalid'
}});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
child.on('error',error=>{console.error(error.message);process.exitCode=1;});
child.on('exit',(code,signal)=>{if(signal)process.exitCode=1;else process.exitCode=code??1;});
