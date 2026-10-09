// R21-26 consolidated deterministic UI input-mutation gate.
// Exactly one million DISTINCT mixed-radix input vectors. These are input
// perturbations, NOT one million browser sessions or executable code mutants.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {nextJourney} from '../public/journey.js';
import {verifiedEmpty} from '../public/empty-state.js';
import {localAvailability,localStatus} from '../public/experience.js';

const roles=[null,'student','faculty','librarian','admin','guest','__proto__',42];
const authenticated=[true,false,'true',null];
const sources=['lumen','koha','unknown',''];
const configured=[true,false,'true',null];
const online=[true,false,null];
const kinds=['catalog','holds','loans','inbox','proposals','featured','other','__proto__'];
const confirmed=[true,false,'true',null];
const queries=[true,false,'true'];
const stock=[null,-1,0,1,2,5,100,'2',NaN,Infinity,1.5,undefined];
const statuses=['queued','ready','fulfilled','cancelled','pending','constructor','__proto__',null];
const dimensions=[roles,authenticated,sources,configured,online,kinds,confirmed,queries,stock,statuses];
const total=dimensions.reduce((p,a)=>p*a.length,1);
const iterations=1000000;
const multiplier=37,offset=173;
const gcd=(a,b)=>b?gcd(b,a%b):a;
assert.ok(total>iterations&&gcd(total,multiplier)===1);
const sha=createHash('sha256'), counts={guest:0,student:0,faculty:0,librarian:0,
  online:0,offline:0,koha:0,emptyConfirmed:0,unknownEmpty:0,unknownStock:0,
  invalidStatus:0};
const paths={guest:'/catalogo',student:'/me',faculty:'/acquisti',librarian:'/staff'};
const expectedStatus={queued:'In coda',ready:'Pronto al ritiro',fulfilled:'Consegnata',cancelled:'Annullata'};
function checkJourney(result,vector){
 const [role,auth,source,koha,net]=vector;
 const known=auth===true&&['student','faculty','librarian'].includes(role);
 const r=known?role:'guest';
 const offline=net===false,external=net===true&&source==='koha'&&koha===true;
 return result.role===r&&result.href===(offline?null:external?'/koha':paths[r])&&
   result.enabled===!offline&&result.epistemicStatus===(offline?'blocked':'conditional')&&
   result.provenance===(external?'koha.navigation_only':'lumen.navigation_only')&&
   Object.isFrozen(result);
}
function checkEmpty(result,vector){
 const kind=vector[5],yes=vector[6]===true,query=vector[7]===true;
 const known=['catalog','holds','loans','inbox','proposals','featured'].includes(kind);
 if(!yes||!known)return result.status==='unknown'&&result.action===null&&result.epistemicStatus==='unknown';
 const expectedLink=kind==='catalog'?(query?'/catalogo':null):
   ({holds:'/catalogo',loans:'/catalogo',inbox:'/me',proposals:null,featured:'/catalogo'})[kind];
 return result.status==='empty'&&result.epistemicStatus==='supported'&&
   (result.action?.href??null)===expectedLink&&Object.isFrozen(result);
}
function checkStock(result,n){
 const supported=Number.isSafeInteger(n)&&n>=0;
 return result.epistemic===(supported?'supported':'unknown')&&result.status===
   (!supported?'unknown':n===0?'unavailable':'available');
}
function checkStatus(result,status){
 const supported=typeof status==='string'&&Object.hasOwn(expectedStatus,status);
 return result.epistemic===(supported?'supported':'unknown')&&
   (supported?result.label===expectedStatus[status]:result.label==='Stato da verificare');
}
for(let i=0;i<iterations;i++){
 let n=(i*multiplier+offset)%total;
 const v=dimensions.map(values=>{const x=values[n%values.length];n=Math.floor(n/values.length);return x;});
 const [role,auth,source,koha,net,kind,verified,query,copies,status]=v;
 const journey=nextJourney({role,authenticated:auth,source,koha,online:net});
 const absence=verifiedEmpty(kind,{confirmed:verified,query});
 const available=localAvailability(copies);
 const hold=localStatus('hold',status);
 assert.ok(checkJourney(journey,v),'journey case '+i);
 assert.ok(checkEmpty(absence,v),'empty case '+i);
 assert.ok(checkStock(available,copies),'stock case '+i);
 assert.ok(checkStatus(hold,status),'status case '+i);
 counts[journey.role]++;
 counts[net===false?'offline':'online']++;
 if(journey.provenance==='koha.navigation_only')counts.koha++;
 if(absence.status==='empty')counts.emptyConfirmed++;else counts.unknownEmpty++;
 if(available.status==='unknown')counts.unknownStock++;
 if(hold.epistemic==='unknown')counts.invalidStatus++;
 sha.update(String.fromCharCode(65+[roles.indexOf(role),authenticated.indexOf(auth),
  sources.indexOf(source),kinds.indexOf(kind),statuses.indexOf(status)].reduce((a,b)=>a+b,0)));
 sha.update(journey.enabled?'Y':'N');
 sha.update(absence.status==='empty'?'E':'U');
}
// Distinct from inputs: six DELIBERATE incorrect outputs must be killed by
// independent property oracles. Not a complete code-mutation score.
const sample=['student',true,'lumen',true,true,'catalog',true,false,1,'ready'];
const good=nextJourney({role:'student',authenticated:true});
const seen=verifiedEmpty('catalog',{confirmed:true,query:false});
const mutations=[
 ['role-escalation',()=>!checkJourney({...good,role:'librarian'},sample)],
 ['phantom-koha',()=>!checkJourney({...good,href:'/koha'},sample)],
 ['offline-cta',()=>!checkJourney({...nextJourney({role:'student',authenticated:true,online:false}),href:'/me'},
   ['student',true,'lumen',true,false,'catalog',true,false,1,'ready'])],
 ['unverified-empty',()=>!checkEmpty({...verifiedEmpty('holds',{confirmed:false}),status:'empty'},
   ['student',true,'lumen',true,true,'holds',false,false,1,'ready'])],
 ['fake-reset-button',()=>!checkEmpty({...seen,action:{href:'/catalogo',label:'Azzera'}},sample)],
 ['prototype-status',()=>!checkStatus({label:'Constructor',epistemic:'supported'},'constructor')]
];
const killed=mutations.filter(([,rejects])=>rejects()).map(([name])=>name);
assert.equal(killed.length,mutations.length);
assert.equal(Object.values(counts).filter(v=>v===0).length,0,'every tracked class must appear');
const report={gate:'LUMEN_UX_SEMANTIC_MUTATIONS',status:'PASS',
 iterations,uniqueInputVectors:iterations,cartesianDomain:total,
 oracleChecks:iterations*4,syntheticMutants:killed.length,
 mutantNames:killed,counts,revision:process.env.GITHUB_SHA||process.env.GIT_SHA||'unbound',
 witness:sha.digest('hex'),
 limitations:['not one million browser/E2E sessions','not code-level mutation coverage',
 'not live Koha/IdP/Render evidence','not WCAG certification']};
if(process.env.UX_MUTATION_REPORT)writeFileSync(process.env.UX_MUTATION_REPORT,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
