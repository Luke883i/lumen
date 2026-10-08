// Static deployment contract, not a claim of a real Render deployment.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
const read=p=>readFileSync(resolve(root,p),'utf8');
const pkg=JSON.parse(read('package.json'));
const container=JSON.parse(read('.devcontainer/devcontainer.json'));
const yaml=read('render.yaml'),version=read('.node-version').trim();
const checks=[];
const gate=(name,ok,detail)=>checks.push({name,status:ok?'PASS':'FAIL',detail});
const line=(name,value)=>yaml.split('\n').some(x=>x.trim()===name+': '+value);
gate('node24',version.startsWith('24.') && /^>=24.*<25/.test(pkg.engines.node),'pin Node 24');
gate('codespaces',container.image==='mcr.microsoft.com/devcontainers/javascript-node:24-bookworm'&&container.postCreateCommand==='bash scripts/bootstrap.sh'&&container.forwardPorts.includes(3000),'node/npm and deps');
gate('canonical-entrypoints',pkg.scripts.dev?.includes('src/server.mjs')&&pkg.scripts.start==='node src/server.mjs','standard npm commands');
gate('runtime-prestart',pkg.scripts.prestart==='node scripts/preflight.mjs','preflight cannot be skipped by npm start');
gate('render-plan',line('plan','starter')&&line('runtime','node'),'pilot single-node');
gate('ci-gated-deploy',line('autoDeployTrigger','checksPass'),'Render must wait for commit checks');
gate('render-build',line('buildCommand','npm ci && npm run check && npm test'),'test before deployment');
gate('render-start',line('startCommand','npm start')&&line('healthCheckPath','/api/health'),'start + probe');
gate('persistent-disk',line('mountPath','/var/data')&&line('sizeGB','1')&&line('value','/var/data/lumen.sqlite'),'sqlite survives deploy');
gate('production-profile',line('value','production')&&/key: LUMEN_DEMO\s*\n\s*value: '0'/.test(yaml),'never demo');
gate('operator-secrets',/key: ADMIN_EMAIL\s*\n\s*sync: false/.test(yaml)&&/key: ADMIN_PASSWORD\s*\n\s*sync: false/.test(yaml),'initial admin');
gate('no-predeploy-disk-assumption',!yaml.includes('preDeployCommand:'),'attached disk is available only at runtime');
const good=checks.every(x=>x.status==='PASS');
console.log(JSON.stringify({suite:'render_deploy_contract',status:good?'PASS':'FAIL',
 revision:process.env.GIT_SHA||'unbound',checks,
 blocked:['Render live service not deployed','actual Koha/IdP not connected','2k on target hardware not certified']},null,2));
if(!good)process.exitCode=1;
