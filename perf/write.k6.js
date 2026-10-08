import http from 'k6/http';
import {check,sleep} from 'k6';
import {Counter,Rate} from 'k6/metrics';
const base=__ENV.TARGET_URL||'http://127.0.0.1:3000';
const users=Number(__ENV.LOAD_USERS||2000);
const failed=new Rate('lumen_write_errors');
const accepted=new Counter('lumen_write_accepted');
const replays=new Counter('lumen_write_replays');
export const options={
  scenarios:{holds:{executor:'ramping-vus',startVUs:0,stages:[
    {duration:'15s',target:users},{duration:'20s',target:users},{duration:'10s',target:0}
  ],gracefulRampDown:'10s'}},
  thresholds:{lumen_write_errors:['rate<0.005'],http_req_failed:['rate<0.005'],http_req_duration:['p(95)<1500']}
};
let first=null;
export default function(){
  const id=__VU;
  const bookId=id%20===0?'load-book-1':'load-book-'+id;
  const key='write-'+String(id).padStart(8,'0')+'-receipt';
  const header={Origin:base,Cookie:'lumen_session=load-session-'+id,'X-CSRF-Token':'load-csrf-'+id,
    'Content-Type':'application/json','Idempotency-Key':key};
  if(__ITER===0 || __ITER===1){
    const res=http.post(base+'/api/holds',JSON.stringify({bookId:bookId}),{headers:header,tags:{name:'hold-write'}});
    const ok=check(res,{'committed or replayed':r=>r.status===201,'valid receipt':r=>{
      try{return JSON.parse(r.body).user_id==='load-user-'+id;}catch{return false;}
    }});
    failed.add(!ok);
    if(ok){
      const record=JSON.parse(res.body);
      if(__ITER===0){first=record.id;accepted.add(1);}
      if(__ITER===1){replays.add(1);failed.add(record.id!==first);}
    }
  }else{
    const response=http.get(base+'/api/holds',{headers:{Cookie:header.Cookie},tags:{name:'patron-holds'}});
    failed.add(!check(response,{'scoped holds':r=>r.status===200}));
  }
  sleep(1+Math.random());
}
export function handleSummary(data){
  return {'perf/write-evidence.json':JSON.stringify({
    sha:__ENV.GIT_SHA||'unknown',
    profile:'holds_unique_plus_shared_title',
    users:users,
    dataset:__ENV.LOAD_BOOKS||'20000',
    metrics:data.metrics,
    thresholds:options.thresholds
  },null,2)};
}
