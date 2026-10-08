import test from 'node:test';
import assert from 'node:assert/strict';
import {openStore,bootstrap} from '../src/store.mjs';
import {createService} from '../src/service.mjs';
import {beginPushWorker} from '../src/webpush.mjs';
import {pushKeys} from './push-fixtures.mjs';
function make(){
 const db=openStore(':memory:');bootstrap(db,{NODE_ENV:'test',LUMEN_DEMO:'1'});
 const api=createService(db);
 const byRole=role=>db.get('SELECT * FROM users WHERE role=?',role);
 return {db,api,student:byRole('student'),faculty:byRole('faculty'),staff:byRole('librarian')};
}
const count=(db,uid,kind)=>db.get('SELECT count(*) n FROM notifications WHERE user_id=? AND kind=?',uid,kind).n;
test('hold ready/queued both surface to librarian and alert active staff exactly once',()=>{
 const f=make();
 try{
  const librarian2=f.api.createUser(f.staff,{name:'Seconda bibliotecaria',email:'staff2@lumen.local',password:'long-password-staff2',role:'librarian'});
  const inactive=f.api.createUser(f.staff,{name:'Disabilitato',email:'oldstaff@lumen.local',password:'long-password-staff3',role:'librarian'});
  f.api.disableUser(f.staff,inactive.id);
  const book=f.api.addBook(f.staff,{title:'Wiring request book',author:'Integration',copies:1});
  const first=f.api.requestHold(f.student,book.id,'hold-wiring-key-0001');
  const second=f.api.requestHold(f.faculty,book.id,'hold-wiring-key-0002');
  assert.equal(first.status,'ready');
  assert.equal(second.status,'queued');
  const desk=f.api.staffHolds(f.staff);
  assert.equal(desk.total,2);
  assert.equal(desk.rows[0].status,'ready');
  assert.equal(desk.rows[1].status,'queued');
  assert.equal(desk.rows[0].patron,f.student.name);
  assert.equal(desk.rows[1].patron,f.faculty.name);
  assert.equal(desk.rows[1].title,'Wiring request book');
  assert.equal(count(f.db,f.staff.id,'staff_hold'),2);
  assert.equal(count(f.db,librarian2.id,'staff_hold'),2);
  assert.equal(count(f.db,inactive.id,'staff_hold'),0);
  assert.equal(f.api.requestHold(f.student,book.id,'hold-wiring-key-0001').id,first.id);
  assert.equal(count(f.db,f.staff.id,'staff_hold'),2,'idempotent retry cannot rebroadcast');
  assert.equal(count(f.db,f.faculty.id,'hold_queued'),1);
  assert.equal(count(f.db,f.student.id,'hold_ready'),1);
  assert.equal(f.api.staffHolds(f.staff,{limit:1,offset:0}).rows.length,1);
  assert.equal(f.api.staffHolds(f.staff,{limit:1,offset:1}).rows[0].id,second.id);
  const no=fn=>assert.throws(fn,e=>e.code==='FORBIDDEN');
  no(()=>f.api.staffHolds(f.student));
  no(()=>f.api.staffHolds(f.faculty));
  for(const value of [-1,1.5,101,NaN])assert.throws(()=>f.api.staffHolds(f.staff,{limit:value}),e=>e.code==='PAGINATION_INVALID');
  // Staff sees queue but cannot force a checkout reserved for another patron.
  assert.throws(()=>f.api.checkout(f.staff,f.faculty.id,book.id),e=>e.code==='NO_AVAILABLE_COPY');
  f.api.cancelHold(f.student,first.id);
  assert.equal(f.api.staffHolds(f.staff).rows.length,1);
  assert.equal(f.api.staffHolds(f.staff).rows[0].status,'ready');
  assert.equal(f.api.staffHolds(f.staff).rows[0].user_id,f.faculty.id);
 }finally{f.db.close();}
});
test('faculty acquisition request and librarian broadcast have transactional inbox receipts',()=>{
 const f=make();
 try{
  const suggestion=f.api.suggest(f.faculty,{title:'Libro proposto E2E',author:'Docente Test',reason:'Uso didattico'});
  assert.equal(suggestion.status,'pending');
  assert.equal(count(f.db,f.staff.id,'staff_acquisition'),1);
  assert.equal(count(f.db,f.faculty.id,'suggestion'),1);
  assert.equal(f.api.suggestions(f.staff)[0].title,'Libro proposto E2E');
  const result=f.api.broadcast(f.staff,{role:'student',title:'Comunicazione E2E',body:'Controlla la casella'},'staff-broadcast-key-001');
  assert.ok(result.recipients>=1);
  assert.equal(f.api.notifyList(f.student).filter(x=>x.title==='Comunicazione E2E').length,1);
  assert.equal(f.api.notifyList(f.faculty).filter(x=>x.title==='Comunicazione E2E').length,0);
  f.api.broadcast(f.staff,{role:'student',title:'Comunicazione E2E',body:'Controlla la casella'},'staff-broadcast-key-001');
  assert.equal(f.api.notifyList(f.student).filter(x=>x.title==='Comunicazione E2E').length,1);
 }finally{f.db.close();}
});
test('push worker picks up librarian hold notifications only with a valid opt-in subscription',async()=>{
 const f=make(),sent=[];
 try{
  const book=f.api.addBook(f.staff,{title:'Push test item',author:'QA',copies:1});
  f.api.requestHold(f.student,book.id);
  const staffNotice=f.api.notifyList(f.staff).find(n=>n.kind==='staff_hold');
  assert.ok(staffNotice);
  const client={sendNotification:async(sub,payload)=>sent.push({sub,payload:JSON.parse(payload)})};
  const worker=await beginPushWorker(f.db,{}, {client,manual:true});
  await worker.tick();
  assert.equal(sent.length,0);
  assert.equal(f.db.get('SELECT push_status FROM notifications WHERE id=?',staffNotice.id).push_status,'skipped');
  const login=f.api.login(f.staff.email,'Demo1234!');
  const endpoint='https://fcm.googleapis.com/fcm/send/lumen-staff-'+Date.now();
  f.api.subscribe(f.staff,{endpoint,keys:pushKeys},login.token);
  f.api.broadcast(f.staff,{role:'librarian',title:'Staff test',body:'Private operator message'});
  await worker.tick();
  assert.ok(sent.some(x=>x.payload.kind==='broadcast'));
  assert.ok(sent.every(x=>x.payload.body===undefined&&x.payload.title===undefined));
  const before=sent.length;
  f.api.logout(login.token);
  f.api.broadcast(f.staff,{role:'librarian',title:'After logout',body:'not deliverable'});
  await worker.tick();
  assert.equal(sent.length,before,'logout leaves inbox content but revokes OS delivery');
  assert.ok(f.api.notifyList(f.staff).some(x=>x.title==='After logout'));
 }finally{f.db.close();}
});
