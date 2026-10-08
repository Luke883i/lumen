import test from 'node:test';
import assert from 'node:assert/strict';
import {openStore,bootstrap,hashPassword,verifyPassword} from '../src/store.mjs';
import {createService} from '../src/service.mjs';

function fixture() {
  const s=openStore(':memory:');
  bootstrap(s,{NODE_ENV:'test',LUMEN_DEMO:'1'});
  const svc=createService(s);
  const users=s.all('SELECT * FROM users');
  const user=role=>users.find(x=>x.role===role);
  const book=s.get('SELECT * FROM books ORDER BY title LIMIT 1');
  return {s,svc,user,book};
}
function fails(cb,code){assert.throws(cb,e=>e.code===code);}
test('bootstrap: only explicit local demo; production requires secure admin',()=>{
  const s=openStore(':memory:');
  assert.equal(s.get('SELECT count(*) n FROM users').n,0);
  assert.throws(()=>bootstrap(s,{NODE_ENV:'production'}),/ADMIN_EMAIL/);
  bootstrap(s,{NODE_ENV:'production',ADMIN_EMAIL:'admin@example.edu',ADMIN_PASSWORD:'a-very-long-secret'});
  assert.equal(s.get('SELECT count(*) n FROM users').n,1);
  assert.equal(s.get('SELECT role FROM users').role,'librarian');
  s.close();
});
test('credential hashing and role-separated login',()=>{
  const p=hashPassword('sample-pass-123');
  assert.ok(verifyPassword('sample-pass-123',p));
  assert.ok(!verifyPassword('wrong',p));
  const {s,svc}=fixture();
  const r=svc.login('student@lumen.local','Demo1234!');
  assert.equal(svc.current(r.token).role,'student');
  assert.equal(svc.current(r.token).csrf,r.csrf);
  svc.logout(r.token);
  assert.equal(svc.current(r.token),null);
  fails(()=>svc.login('student@lumen.local','no'), 'BAD_CREDENTIALS');
  s.close();
});
test('catalog search escapes SQL wildcard and detail resolves beyond first 120',()=>{
  const {s,svc,user}=fixture(),staff=user('librarian');
  for(let i=0;i<125;i++)svc.addBook(staff,{title:'Z'+String(i).padStart(3,'0'),author:'Fixture',copies:1});
  const books=svc.books('Z124');
  assert.equal(books.length,1);
  assert.equal(svc.book(books[0].id).title,'Z124');
  assert.equal(svc.books('%').length,0);
  assert.equal(svc.books().length,120);
  s.close();
});
test('last available copy and queue satisfy exclusivity and FIFO promotion',()=>{
  const {s,svc,user,book}=fixture();
  const student=user('student'),faculty=user('faculty'),staff=user('librarian');
  const next=svc.createUser(staff,{name:'Terza Persona',email:'third@lumen.local',role:'student',password:'a-valid-long-password'});
  const third=s.get('SELECT * FROM users WHERE id=?',next.id);
  const a=svc.requestHold(student,book.id),b=svc.requestHold(faculty,book.id),c=svc.requestHold(third,book.id);
  assert.equal(a.status,'ready');assert.equal(b.status,'ready');assert.equal(c.status,'queued');
  assert.equal(svc.books(book.title)[0].available,0);
  fails(()=>svc.requestHold(student,book.id),'DUPLICATE_HOLD');
  svc.cancelHold(student,a.id);
  assert.equal(s.get('SELECT status FROM holds WHERE id=?',c.id).status,'ready');
  assert.equal(s.get("SELECT count(*) n FROM holds WHERE book_id=? AND status='ready'",book.id).n,2);
  const la=svc.checkout(staff,faculty.id,book.id),lb=svc.checkout(staff,third.id,book.id);
  assert.notEqual(la.copy_id,lb.copy_id);
  assert.equal(svc.books(book.title)[0].available,0);
  fails(()=>svc.checkout(staff,student.id,book.id),'NO_AVAILABLE_COPY');
  svc.returnLoan(staff,la.id);
  fails(()=>svc.returnLoan(staff,la.id),'INVALID_STATE');
  assert.equal(svc.books(book.title)[0].available,1);
  s.close();
});
test('renew blocked by waitlist; cross-user access denied',()=>{
  const {s,svc,user,book}=fixture();
  const student=user('student'),faculty=user('faculty'),staff=user('librarian');
  const other=svc.createUser(staff,{name:'Other',email:'other@lumen.local',role:'student',password:'strong-temporary-pass'});
  const third=s.get('SELECT * FROM users WHERE id=?',other.id);
  svc.requestHold(student,book.id);
  svc.requestHold(faculty,book.id);
  svc.requestHold(third,book.id);
  const l=svc.checkout(staff,student.id,book.id);
  fails(()=>svc.renew(faculty,l.id),'FORBIDDEN');
  fails(()=>svc.renew(student,l.id),'WAITING_LIST');
  svc.cancelHold(third,svc.holds(third)[0].id);
  const renewed=svc.renew(student,l.id);
  assert.ok(renewed.due_at>l.due_at);
  fails(()=>svc.renew(student,l.id),'RENEWAL_UNAVAILABLE');
  s.close();
});
test('faculty acquisitions and allowed state transitions',()=>{
  const {s,svc,user,book}=fixture();
  const student=user('student'),faculty=user('faculty'),staff=user('librarian');
  fails(()=>svc.suggest(student,{title:'New Book',author:'A',reason:'For course'}),'FORBIDDEN');
  const sg=svc.suggest(faculty,{title:'New Book',author:'An Author',isbn:'1111111111',reason:'Teaching materials'});
  fails(()=>svc.suggest(faculty,{title:'New Book',author:'An Author',isbn:'1111111111',reason:'Teaching materials'}),'DUPLICATE_SUGGESTION');
  fails(()=>svc.reviewSuggestion(student,sg.id,'approved'),'FORBIDDEN');
  svc.reviewSuggestion(staff,sg.id,'approved');
  svc.reviewSuggestion(staff,sg.id,'ordered');
  fails(()=>svc.reviewSuggestion(staff,sg.id,'rejected'),'INVALID_STATE');
  fails(()=>svc.suggest(faculty,{title:book.title,author:book.author,isbn:book.isbn,reason:'Already held'}),'DUPLICATE_SUGGESTION');
  s.close();
});
test('notifications scoped to recipients; librarian can revoke accounts',()=>{
  const {s,svc,user}=fixture();
  const student=user('student'),faculty=user('faculty'),staff=user('librarian');
  const r=svc.broadcast(staff,{role:'student',title:'Orari',body:'Apertura straordinaria'});
  assert.equal(r.recipients,1);
  assert.equal(svc.notifyList(student).length,1);
  assert.equal(svc.notifyList(faculty).length,0);
  fails(()=>svc.broadcast(faculty,{role:'all',title:'Illegal',body:'No'}),'FORBIDDEN');
  const notification=svc.notifyList(student)[0];
  fails(()=>svc.readNotification(faculty,notification.id),'NOT_FOUND');
  svc.readNotification(student,notification.id);
  assert.ok(svc.notifyList(student)[0].read_at);
  fails(()=>svc.disableUser(staff,staff.id),'SELF_DISABLE');
  svc.disableUser(staff,student.id);
  assert.equal(s.get('SELECT active FROM users WHERE id=?',student.id).active,0);
  fails(()=>svc.requestHold(student,s.get('SELECT id FROM books').id),'ACCOUNT_DISABLED');
  s.close();
});
test('transaction rollback: failed issue leaves all values unchanged',()=>{
  const {s,svc,user,book}=fixture();
  const staff=user('librarian'),student=user('student');
  const before=s.get('SELECT count(*) n FROM loans').n;
  fails(()=>svc.checkout(staff,'nonexistent',book.id),'PATRON_NOT_FOUND');
  assert.equal(s.get('SELECT count(*) n FROM loans').n,before);
  fails(()=>svc.cancelHold(student,'absent'),'NOT_FOUND');
  assert.equal(s.get('SELECT count(*) n FROM holds').n,0);
  s.close();
});

test('idempotency keys replay committed receipts and reject cross-purpose reuse',()=>{
  const {s,svc,user,book}=fixture();
  const student=user('student'),staff=user('librarian');
  const key='hold-stable-key-123456';
  const a=svc.requestHold(student,book.id,key);
  assert.deepEqual(svc.requestHold(student,book.id,key),a);
  assert.equal(s.get('SELECT count(*) n FROM holds').n,1);
  const other=s.all('SELECT * FROM books WHERE id<>? LIMIT 1',book.id)[0];
  fails(()=>svc.requestHold(student,other.id,key),'IDEMPOTENCY_CONFLICT');
  const out=svc.checkout(staff,student.id,book.id,'issue-key-123456');
  const again=svc.checkout(staff,student.id,book.id,'issue-key-123456');
  assert.deepEqual(out,again);
  assert.equal(s.get("SELECT count(*) n FROM loans WHERE status='active'").n,1);
  s.close();
});
test('password rotation revokes sessions and rejects stale credentials',()=>{
  const {s,svc,user}=fixture();
  const student=user('student');
  const oldSession=svc.login(student.email,'Demo1234!');
  fails(()=>svc.changePassword(student,'incorrect','changed-strong-password'),'BAD_CREDENTIALS');
  svc.changePassword(student,'Demo1234!','changed-strong-password');
  assert.equal(svc.current(oldSession.token),null);
  fails(()=>svc.login(student.email,'Demo1234!'),'BAD_CREDENTIALS');
  assert.ok(svc.login(student.email,'changed-strong-password').token);
  s.close();
});
test('web push endpoints cannot redirect delivery to arbitrary hosts',()=>{
  const {s,svc,user}=fixture();
  const student=user('student');
  fails(()=>svc.subscribe(student,{endpoint:'https://127.0.0.1/admin',keys:{p256dh:'AA',auth:'BB'}}),'PUSH_PROVIDER_DENIED');
  assert.ok(svc.subscribe(student,{endpoint:'https://fcm.googleapis.com/fcm/send/abc',keys:{p256dh:'AA',auth:'BB'}}).ok);
  s.close();
});

test('multiple simultaneous sessions per account are supported but capped',()=>{
  const {s,svc,user}=fixture();
  const student=user('student');
  const sessions=Array.from({length:5},()=>svc.login(student.email,'Demo1234!'));
  assert.equal(sessions.filter(x=>svc.current(x.token)).length,5);
  const sixth=svc.login(student.email,'Demo1234!');
  assert.equal(svc.current(sessions[0].token),null);
  assert.ok(svc.current(sixth.token));
  s.close();
});

test('FTS catalogue index supports multi-term prefix and accent-insensitive searches',()=>{
  const {s,svc,user}=fixture(),staff=user('librarian');
  const b=svc.addBook(staff,{title:'Analisi matematica avanzata',author:'Émile Dupré',subject:'Calcolo',isbn:'978-1234',copies:1});
  assert.equal(svc.books('Analisi matem')[0].id,b.id);
  assert.equal(svc.books('Emile')[0].id,b.id);
  assert.equal(svc.books('978 1234')[0].id,b.id);
  assert.equal(svc.books('%').length,0);
  const queryPlan=s.get("EXPLAIN QUERY PLAN SELECT b.id FROM books_fts JOIN books b ON b.rowid=books_fts.rowid WHERE books_fts MATCH ?",'"analisi"*');
  assert.ok(queryPlan.detail.includes('VIRTUAL TABLE INDEX'));
  s.close();
});
