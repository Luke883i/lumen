import http from 'k6/http';
import { sleep, check } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const host=__ENV.TARGET_URL||'http://127.0.0.1:3000';
const maxUsers=Number(__ENV.LOAD_USERS||2000);
const holdSeconds=Number(__ENV.LOAD_HOLD_SECONDS||20);
const errors=new Rate('lumen_errors');
const searchLatency=new Trend('catalogue_latency',true);
export const options={
  scenarios:{library_mix:{executor:'ramping-vus',startVUs:0,stages:[
    {duration:'15s',target:maxUsers},
    {duration:holdSeconds+'s',target:maxUsers},
    {duration:'10s',target:0}
  ],gracefulRampDown:'10s'}},
  thresholds:{lumen_errors:['rate<0.01'],http_req_failed:['rate<0.01'],http_req_duration:['p(95)<1500'],catalogue_latency:['p(95)<1000']}
};
export default function(){
  const id=((__VU-1)%maxUsers)+1;
  const headers={Cookie:'lumen_session=load-session-'+id};
  const step=__ITER%4;
  const path=step===0?'/api/me':step===1?'/api/books?q=Title%2012':step===2?'/api/holds':'/api/books?q=Author%201';
  const response=http.get(host+path,{headers,tags:{name:path.split('?')[0]}});
  const ok=check(response,{'HTTP 200':r=>r.status===200,'JSON payload':r=>(r.headers['Content-Type']||'').indexOf('application/json')>=0});
  errors.add(!ok);
  if(path.startsWith('/api/books'))searchLatency.add(response.timings.duration);
  sleep(2+Math.random()*2);
}
export function handleSummary(data){
  const json=JSON.stringify({sha:__ENV.GIT_SHA||'unknown',workload:{users:maxUsers,books:Number(__ENV.LOAD_BOOKS||20000),hold_seconds:holdSeconds,run:'synthetic-GitHub-runner'},metrics:data.metrics,thresholds:options.thresholds},null,2);
  return {'perf/evidence.json':json,stdout:JSON.stringify({vus:maxUsers,checks:data.metrics && data.metrics.checks,failed:data.metrics && data.metrics.http_req_failed,duration:data.metrics && data.metrics.http_req_duration},null,2)};
}
