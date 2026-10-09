import {readdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join,dirname,relative} from 'node:path';
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
const cards=[];
const escapeHtml=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
for(const file of files){
 const v=JSON.parse(readFileSync(file,'utf8'));
 for(const s of v.screenshots){
  const short=x=>String(x||'').replace(/[|\n]/g,' ').slice(0,65);
  const primary=s.actions.find(a=>a.primary)?.label || s.actions[0]?.label || 'informativa';
  const box=s.layout.hero ? 'hero '+s.layout.hero.height+'px':'cards '+(s.layout.largestCardHeight??'-')+'px';
  console.log('| '+short(v.project)+' | '+short(s.id)+' | '+short(s.role)+' | '+short(s.mainHeading)+' | '+short(primary)+' | '+short(box)+' | '+(s.issues.length?s.issues.join(', '):'PASS')+' |');
  const src=relative(root,join(dirname(file),s.screenshot)).split('\\').join('/');
  cards.push('<article><p class="tag">'+escapeHtml(v.project)+' · '+escapeHtml(s.role)+' · '+escapeHtml(s.id)+'</p>'+
    '<h2>'+escapeHtml(s.mainHeading)+'</h2>'+
    '<p><strong>Intento:</strong> '+escapeHtml(s.meaning)+'</p>'+
    '<p><strong>Autorità:</strong> '+escapeHtml(s.authority)+'</p>'+
    '<p><strong>CTA:</strong> '+escapeHtml(primary)+' · <strong>Esito audit:</strong> '+escapeHtml(s.issues.join(', ')||'PASS')+'</p>'+
    '<a href="'+encodeURI(src)+'" target="_blank"><img src="'+encodeURI(src)+'" alt="Screenshot reale '+escapeHtml(s.id)+'" loading="lazy"></a></article>');
  rows++;issues+=s.issues.length;
 }
}
console.log('');
writeFileSync(join(root,'lumen-visual-gallery.html'),
  '<!doctype html><html lang="it"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'+
  '<title>LUMEN · Audit screenshot</title><style>body{font:15px system-ui;background:#f4f8ff;color:#0b2550;margin:20px}h1{font-size:1.5rem}'+
  'main{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,380px),1fr));gap:16px}article{background:white;padding:16px;border:1px solid #d8e4f7;border-radius:12px;min-width:0}'+
  'article img{max-width:100%;height:auto;border:1px solid #d8e4f7}.tag{font-size:.85rem;color:#50647f}</style>'+
  '<h1>LUMEN · Screenshot e audit semantico</h1><p>Real headless Chromium at exact Git SHA '+escapeHtml(process.env.GITHUB_SHA||'local')+
  '. Demo only. These captures do not certify physical Android, Render production or GDPR compliance.</p>'+
  '<main>'+cards.join('')+'</main></html>');
console.log('**Captured screens:** '+rows+'. **Detected issues:** '+issues+'. **Evidence bound to SHA:** '+(process.env.GITHUB_SHA||'local')+'.');
console.log('**Gallery:** `lumen-visual-gallery.html` inside artifact. **External gates still blocked:** physical Android/Windows PWA, live Koha/IdP, actual Render/restore, 2,000 mixed concurrency, privacy/WCAG human review and legal authorization.');
if(rows<12||issues>0)process.exitCode=1;
