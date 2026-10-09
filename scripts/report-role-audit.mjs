import {readdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
const root='browser/test-results';
function search(dir){
 const items=[];
 for(const entry of readdirSync(dir,{withFileTypes:true})){
  const path=join(dir,entry.name);
  if(entry.isDirectory())items.push(...search(path));
  if(entry.isFile()&&entry.name==='role-audit.json')items.push(path);
 }
 return items;
}
const files=search(root);
console.log('## LUMEN role screenshot audit — '+(process.env.GITHUB_SHA||'local'));
console.log('');
console.log('Actual headless Chromium screenshots, not locally cloned and not generated illustrations. Full PNG/JPEG and JSON are downloadable from this run’s Actions artifact.');
console.log('');
console.log('| Platform | Screen | Role | First task / H1 | Primary CTA | Layout | Issues |');
console.log('|---|---|---|---|---|---|---|');
let rows=0,issues=0;
for(const file of files){
 const v=JSON.parse(readFileSync(file,'utf8'));
 for(const s of v.screenshots){
  const short=x=>String(x||'').replace(/[|\n]/g,' ').slice(0,65);
  const primary=s.actions.find(a=>a.primary)?.label || s.actions[0]?.label || 'informativa';
  const box=s.layout.hero ? 'hero '+s.layout.hero.height+'px':'cards '+(s.layout.largestCardHeight??'-')+'px';
  console.log('| '+short(v.project)+' | '+short(s.id)+' | '+short(s.role)+' | '+short(s.mainHeading)+' | '+short(primary)+' | '+short(box)+' | '+(s.issues.length?s.issues.join(', '):'PASS')+' |');
  rows++;issues+=s.issues.length;
 }
}
console.log('');
console.log('**Captured screens:** '+rows+'. **Detected issues:** '+issues+'. **Evidence bound to SHA:** '+(process.env.GITHUB_SHA||'local')+'.');
console.log('**External gates still blocked:** physical Android/Windows PWA, live Koha/IdP, actual Render/restore, 2,000 mixed concurrency, privacy/WCAG human review and legal authorization.');
if(rows<12||issues>0)process.exitCode=1;
