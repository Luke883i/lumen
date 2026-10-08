import { randomBytes, createHash } from 'node:crypto';
import {validPushKeys} from './push-keys.mjs';
import { newId, now, hashPassword, verifyPassword, tokenHash } from './store.mjs';

export class Failure extends Error {
  constructor(status, code, message) { super(message); this.status=status; this.code=code; }
}
const fail = (status,code,message) => { throw new Failure(status,code,message); };
const str = (v,max=200) => typeof v === 'string' ? v.trim().slice(0,max) : '';
const needed = (v,max=200) => { const s=str(v,max); if(!s) fail(400,'INPUT_REQUIRED','Campo obbligatorio mancante'); return s; };
const daysAfter = (date, days) => new Date(new Date(date).getTime() + days*86400000).toISOString();
const minLength = (v,n) => typeof v === 'string' && v.length>=n;
function notify(s, userId, title, body, kind='general') {
  s.run("INSERT INTO notifications(id,user_id,title,body,kind,created_at) VALUES(?,?,?,?,?,?)",newId(),userId,title,body,kind,now());
}
function requireRole(user, roles) {
  if(!user) fail(401,'AUTH_REQUIRED','Effettua l’accesso');
  if(!user.active) fail(403,'ACCOUNT_DISABLED','Account disabilitato');
  if(!roles.includes(user.role)) fail(403,'FORBIDDEN','Permesso insufficiente');
}
function freeCopies(s,bookId) {
  const total=s.get('SELECT count(*) n FROM copies WHERE book_id=?',bookId).n;
  const lent=s.get("SELECT count(*) n FROM loans l JOIN copies c ON c.id=l.copy_id WHERE c.book_id=? AND l.status='active'",bookId).n;
  const reserved=s.get("SELECT count(*) n FROM holds WHERE book_id=? AND status='ready'",bookId).n;
  return Math.max(0,total-lent-reserved);
}
function promote(s,bookId) {
  let count=0;
  while(freeCopies(s,bookId)>0) {
    const next=s.get("SELECT * FROM holds WHERE book_id=? AND status='queued' ORDER BY created_at,rowid LIMIT 1",bookId);
    if(!next) break;
    s.run("UPDATE holds SET status='ready',updated_at=? WHERE id=?",now(),next.id);
    notify(s,next.user_id,'Libro pronto per il ritiro','La prenotazione e pronta. Rivolgiti al banco prestiti.','hold_ready');
    count++;
  }
  return count;
}
export function createService(s) {
  const catalogueCache=new Map();
  let catalogueCacheRevision=-1;
  function requireRole(user, roles) {
    if(!user) fail(401,'AUTH_REQUIRED','Effettua l’accesso');
    const current=s.get('SELECT active,role FROM users WHERE id=?',user.id);
    if(!current||!current.active) fail(403,'ACCOUNT_DISABLED','Account disabilitato');
    if(current.role!==user.role||!roles.includes(current.role)) fail(403,'FORBIDDEN','Permesso insufficiente');
  }
  function recordAudit(user,operation,payload,result,key=null) {
    const requestHash=createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    const receiptHash=createHash('sha256').update(JSON.stringify(result)).digest('hex');
    s.run("INSERT INTO audit_events(actor_id,operation,request_hash,receipt_hash,idempotency_key,occurred_at) VALUES(?,?,?,?,?,?)",
      user.id,operation,requestHash,receiptHash,key,now());
  }
  function idempotent(user,key,operation,payload,fn) {
    if(!key) return s.tx(()=>{
      const result=JSON.parse(JSON.stringify(fn()));
      recordAudit(user,operation,payload,result);
      return result;
    });
    if(typeof key!=='string'||!/^[a-zA-Z0-9_-]{12,100}$/.test(key)) fail(400,'IDEMPOTENCY_KEY_INVALID','Chiave idempotente non valida');
    return s.tx(()=>{
      const digest=createHash('sha256').update(JSON.stringify(payload)).digest('hex');
      const past=s.get('SELECT * FROM idempotency WHERE user_id=? AND key=?',user.id,key);
      if(past) {
        if(past.operation!==operation||past.payload_hash!==digest) fail(409,'IDEMPOTENCY_CONFLICT','Chiave già usata per operazione diversa');
        return JSON.parse(past.result_json);
      }
      const result=JSON.parse(JSON.stringify(fn()));
      s.run('INSERT INTO idempotency(user_id,key,operation,payload_hash,result_json,created_at) VALUES(?,?,?,?,?,?)',user.id,key,operation,digest,JSON.stringify(result),now());
      recordAudit(user,operation,payload,result,key);
      return result;
    });
  }
  const api = {
    current(token) {
      if(!token) return null;
      const row=s.get("SELECT u.id,u.name,u.email,u.role,u.active,ss.csrf,ss.auth_method FROM sessions ss JOIN users u ON u.id=ss.user_id WHERE ss.token_hash=? AND ss.expires_at>?",tokenHash(token),now());
      return row || null;
    },
    login(email,password) {
      const u=s.get('SELECT * FROM users WHERE email=?',str(email,254).toLowerCase());
      if(!u || !u.active || !verifyPassword(password || '',u.passhash)) fail(401,'BAD_CREDENTIALS','Credenziali non valide');
      const token=randomBytes(32).toString('base64url');
      const csrf=randomBytes(24).toString('base64url');
      const expires=daysAfter(now(),0.5);
      s.tx(()=>{
        s.run("DELETE FROM sessions WHERE expires_at<?",now());
        s.run("DELETE FROM sessions WHERE user_id=? AND token_hash NOT IN (SELECT token_hash FROM sessions WHERE user_id=? ORDER BY rowid DESC LIMIT 4)",u.id,u.id);
        s.run('INSERT INTO sessions(token_hash,user_id,csrf,expires_at) VALUES(?,?,?,?)',tokenHash(token),u.id,csrf,expires);
      });
      return { token, user:{id:u.id,name:u.name,role:u.role,email:u.email}, csrf };
    },
    logout(token) {
      if(!token)return;
      // Server-side revocation is authoritative even if browser SW is offline
      // and pushManager.unsubscribe() fails. Never revoke other device sessions.
      s.tx(()=>{
        const hash=tokenHash(token);
        s.run('DELETE FROM subscriptions WHERE session_hash=?',hash);
        s.run('DELETE FROM sessions WHERE token_hash=?',hash);
      });
    },
    books(query='') {
      const q=str(query,120);
      const currentRevision=s.get('SELECT version FROM catalogue_revision WHERE id=1').version;
      if(currentRevision!==catalogueCacheRevision){catalogueCache.clear();catalogueCacheRevision=currentRevision;}
      if(catalogueCache.has(q))return catalogueCache.get(q).map(row=>({...row}));
      const words=(q.normalize('NFKC').match(/[\p{L}\p{N}]+/gu)||[]).slice(0,6);
      if(q.trim() && !words.length) return [];
      const match=words.map(w=>'"'+w.toLowerCase()+'"*').join(' AND ');
      const columns="SELECT b.*, (SELECT count(*) FROM copies c WHERE c.book_id=b.id) AS copies, (SELECT count(*) FROM loans l JOIN copies c ON c.id=l.copy_id WHERE c.book_id=b.id AND l.status='active') AS borrowed, (SELECT count(*) FROM holds h WHERE h.book_id=b.id AND h.status='ready') AS reserved, (SELECT count(*) FROM holds h WHERE h.book_id=b.id AND h.status='queued') AS queue";
      const books=match
        ? s.all(columns+" FROM books_fts JOIN books b ON b.rowid=books_fts.rowid WHERE books_fts MATCH ? ORDER BY lower(b.title),b.id LIMIT 120",match)
        : s.all(columns+" FROM books b ORDER BY lower(b.title),b.id LIMIT 120");
      const view=books.map(({copies,borrowed,reserved,...b})=>({...b,copies,available:Math.max(0,copies-borrowed-reserved),reserved,borrowed}));
      if(catalogueCache.size>=80)catalogueCache.delete(catalogueCache.keys().next().value);
      catalogueCache.set(q,view);
      return view.map(row=>({...row}));
    },
    book(id) {
      const b=s.get('SELECT * FROM books WHERE id=?',id);
      if(!b) fail(404,'NOT_FOUND','Titolo non trovato');
      const copies=s.get('SELECT count(*) n FROM copies WHERE book_id=?',id).n;
      const borrowed=s.get("SELECT count(*) n FROM loans l JOIN copies c ON c.id=l.copy_id WHERE c.book_id=? AND l.status='active'",id).n;
      const reserved=s.get("SELECT count(*) n FROM holds WHERE book_id=? AND status='ready'",id).n;
      const queue=s.get("SELECT count(*) n FROM holds WHERE book_id=? AND status='queued'",id).n;
      return {...b,copies,borrowed,reserved,queue,available:Math.max(0,copies-borrowed-reserved),items:s.all('SELECT c.id,c.barcode,c.shelf, CASE WHEN EXISTS(SELECT 1 FROM loans l WHERE l.copy_id=c.id AND l.status=\'active\') THEN 1 ELSE 0 END as onLoan FROM copies c WHERE c.book_id=? ORDER BY barcode',id)};
    },
    holds(user) {
      requireRole(user,['student','faculty','librarian']);
      return s.all("SELECT h.*,b.title,b.author FROM holds h JOIN books b ON b.id=h.book_id WHERE h.user_id=? ORDER BY h.created_at DESC",user.id);
    },
    requestHold(user,bookId,key=null) {
      requireRole(user,['student','faculty','librarian']);
      return idempotent(user,key,'hold',{bookId},()=>{
        if(!s.get('SELECT id FROM books WHERE id=?',bookId)) fail(404,'NOT_FOUND','Titolo inesistente');
        if(s.get("SELECT id FROM holds WHERE book_id=? AND user_id=? AND status IN ('queued','ready')",bookId,user.id)) fail(409,'DUPLICATE_HOLD','Prenotazione già attiva');
        if(s.get("SELECT l.id FROM loans l JOIN copies c ON c.id=l.copy_id WHERE c.book_id=? AND l.user_id=? AND l.status='active'",bookId,user.id)) fail(409,'ALREADY_BORROWED','Hai già un prestito attivo per questo titolo');
        const id=newId(), stamp=now();
        s.run("INSERT INTO holds(id,book_id,user_id,status,created_at,updated_at) VALUES(?,?,?,?,?,?)",id,bookId,user.id,'queued',stamp,stamp);
        promote(s,bookId);
        const result=s.get("SELECT * FROM holds WHERE id=?",id);
        if(result.status==='queued') notify(s,user.id,'Prenotazione in coda','La richiesta e stata registrata.','hold_queued');
        return result;
      });
    },
    cancelHold(user,id,key=null) {
      requireRole(user,['student','faculty','librarian']);
      return idempotent(user,key,'cancel-hold',{id},()=>{
        const h=s.get('SELECT * FROM holds WHERE id=?',id);
        if(!h) fail(404,'NOT_FOUND','Prenotazione inesistente');
        if(user.role!=='librarian' && h.user_id!==user.id) fail(403,'FORBIDDEN','Prenotazione altrui');
        if(!['queued','ready'].includes(h.status)) fail(409,'INVALID_STATE','Prenotazione non annullabile');
        s.run("UPDATE holds SET status='cancelled',updated_at=? WHERE id=?",now(),id);
        promote(s,h.book_id);
        return {ok:true};
      });
    },
    loans(user) {
      requireRole(user,['student','faculty','librarian']);
      return s.all("SELECT l.*,b.id AS book_id,b.title,b.author,c.barcode FROM loans l JOIN copies c ON c.id=l.copy_id JOIN books b ON b.id=c.book_id WHERE l.user_id=? ORDER BY l.checked_out_at DESC",user.id);
    },
    checkout(user,patronId,bookId,key=null) {
      requireRole(user,['librarian']);
      return idempotent(user,key,'checkout',{patronId,bookId},()=>{
        const patron=s.get('SELECT * FROM users WHERE id=?',patronId);
        if(!patron||!patron.active) fail(404,'PATRON_NOT_FOUND','Utente non attivo');
        if(!s.get('SELECT id FROM books WHERE id=?',bookId)) fail(404,'NOT_FOUND','Titolo inesistente');
        const ready=s.get("SELECT * FROM holds WHERE user_id=? AND book_id=? AND status='ready' ORDER BY created_at LIMIT 1",patronId,bookId);
        if(!ready && freeCopies(s,bookId)===0) fail(409,'NO_AVAILABLE_COPY','Nessuna copia disponibile per questo utente');
        const copy=s.get("SELECT c.* FROM copies c WHERE c.book_id=? AND NOT EXISTS (SELECT 1 FROM loans l WHERE l.copy_id=c.id AND l.status='active') ORDER BY c.barcode LIMIT 1",bookId);
        if(!copy) fail(409,'NO_AVAILABLE_COPY','Nessuna copia fisica disponibile');
        const id=newId(), date=now();
        s.run("INSERT INTO loans(id,copy_id,user_id,status,checked_out_at,due_at) VALUES(?,?,?,?,?,?)",id,copy.id,patronId,'active',date,daysAfter(date,patron.role==='faculty'?28:14));
        if(ready) s.run("UPDATE holds SET status='fulfilled',updated_at=? WHERE id=?",now(),ready.id);
        notify(s,patronId,'Prestito registrato','Controlla la scadenza nella sezione Prestiti.','loan');
        return s.get('SELECT * FROM loans WHERE id=?',id);
      });
    },
    returnLoan(user,id,key=null) {
      requireRole(user,['librarian']);
      return idempotent(user,key,'return',{id},()=>{
        const loan=s.get("SELECT l.*,c.book_id FROM loans l JOIN copies c ON c.id=l.copy_id WHERE l.id=?",id);
        if(!loan) fail(404,'NOT_FOUND','Prestito inesistente');
        if(loan.status!=='active') fail(409,'INVALID_STATE','Prestito gia restituito');
        s.run("UPDATE loans SET status='returned',returned_at=? WHERE id=?",now(),id);
        notify(s,loan.user_id,'Restituzione registrata','Grazie per aver restituito il libro.','return');
        promote(s,loan.book_id);
        return {ok:true};
      });
    },
    renew(user,id,key=null) {
      requireRole(user,['student','faculty','librarian']);
      return idempotent(user,key,'renew',{id},()=>{
        const l=s.get("SELECT l.*,c.book_id FROM loans l JOIN copies c ON c.id=l.copy_id WHERE l.id=?",id);
        if(!l) fail(404,'NOT_FOUND','Prestito non trovato');
        if(user.role!=='librarian' && l.user_id!==user.id) fail(403,'FORBIDDEN','Prestito altrui');
        if(l.status!=='active'||l.renewal_count>=1) fail(409,'RENEWAL_UNAVAILABLE','Rinnovo non disponibile');
        if(s.get("SELECT id FROM holds WHERE book_id=? AND status='queued' LIMIT 1",l.book_id)) fail(409,'WAITING_LIST','Rinnovo negato: utenti in attesa');
        const due=daysAfter(l.due_at,14);
        s.run('UPDATE loans SET due_at=?,renewal_count=renewal_count+1 WHERE id=?',due,id);
        notify(s,l.user_id,'Prestito rinnovato','Nuova scadenza: '+due.slice(0,10),'renewal');
        return {due_at:due};
      });
    },
    suggest(user,form,key=null) {
      requireRole(user,['faculty']);
      const title=needed(form.title,200), author=needed(form.author,160), reason=needed(form.reason,500);
      const isbn=str(form.isbn,32);
      return idempotent(user,key,'suggest',form,()=>{
        if(isbn && (s.get("SELECT id FROM books WHERE isbn=? LIMIT 1",isbn) || s.get("SELECT id FROM suggestions WHERE isbn=? AND user_id=? AND status IN ('pending','approved') LIMIT 1",isbn,user.id))) fail(409,'DUPLICATE_SUGGESTION','Titolo gia presente o proposta gia attiva');
        const id=newId();
        s.run("INSERT INTO suggestions(id,user_id,title,author,isbn,reason,status,created_at) VALUES(?,?,?,?,?,?,?,?)",id,user.id,title,author,isbn,reason,'pending',now());
        notify(s,user.id,'Proposta ricevuta','La biblioteca valuterà la tua richiesta.','suggestion');
        return {id,status:'pending'};
      });
    },
    suggestions(user) {
      requireRole(user,['faculty','librarian']);
      if(user.role==='librarian') return s.all("SELECT sg.*,u.name requester FROM suggestions sg JOIN users u ON u.id=sg.user_id ORDER BY sg.created_at DESC");
      return s.all("SELECT * FROM suggestions WHERE user_id=? ORDER BY created_at DESC",user.id);
    },
    reviewSuggestion(user,id,status,key=null) {
      requireRole(user,['librarian']);
      if(!['approved','rejected','ordered'].includes(status)) fail(400,'INPUT_INVALID','Stato non valido');
      return idempotent(user,key,'review',{id,status},()=>{
        const sg=s.get('SELECT * FROM suggestions WHERE id=?',id);
        if(!sg) fail(404,'NOT_FOUND','Richiesta non trovata');
        if(!((sg.status==='pending'&&['approved','rejected'].includes(status))||(sg.status==='approved'&&status==='ordered'))) fail(409,'INVALID_STATE','Transizione non consentita');
        s.run('UPDATE suggestions SET status=?,reviewed_at=? WHERE id=?',status,now(),id);
        notify(s,sg.user_id,'Aggiornamento proposta','Stato della richiesta: '+status,'suggestion');
        return {ok:true};
      });
    },
    users(user) {
      requireRole(user,['librarian']);
      return s.all('SELECT id,name,email,role,active FROM users ORDER BY name');
    },
    createUser(user,form) {
      requireRole(user,['librarian']);
      const email=needed(form.email,254).toLowerCase(),name=needed(form.name,120),role=str(form.role,30);
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!['student','faculty','librarian'].includes(role)||!minLength(form.password,12)) fail(400,'INPUT_INVALID','Email, ruolo o password non validi (min. 12 caratteri)');
      if(s.get('SELECT id FROM users WHERE email=?',email)) fail(409,'USER_EXISTS','Utente esistente');
      const id=newId();
      s.run("INSERT INTO users(id,email,name,role,passhash,created_at) VALUES(?,?,?,?,?,?)",id,email,name,role,hashPassword(form.password),now());
      return {id};
    },
    changePassword(user,oldPassword,newPassword) {
      requireRole(user,['student','faculty','librarian']);
      if(!minLength(newPassword,12)) fail(400,'INPUT_INVALID','La nuova password deve avere almeno 12 caratteri');
      const row=s.get('SELECT passhash FROM users WHERE id=?',user.id);
      if(!verifyPassword(oldPassword||'',row.passhash)) fail(403,'BAD_CREDENTIALS','Password attuale non valida');
      s.tx(()=>{
        s.run('UPDATE users SET passhash=? WHERE id=?',hashPassword(newPassword),user.id);
        s.run('DELETE FROM sessions WHERE user_id=?',user.id);
      });
      return {ok:true,reauthenticate:true};
    },
    disableUser(user,id) {
      requireRole(user,['librarian']);
      return s.tx(()=>{
        if(id===user.id) fail(409,'SELF_DISABLE','Non puoi disabilitare il tuo account');
        const target=s.get('SELECT * FROM users WHERE id=?',id);
        if(!target) fail(404,'NOT_FOUND','Account non trovato');
        if(target.role==='librarian' && target.active && s.get("SELECT count(*) n FROM users WHERE role='librarian' AND active=1").n<=1) fail(409,'LAST_LIBRARIAN','Serve almeno un bibliotecario attivo');
        s.run('UPDATE users SET active=0 WHERE id=?',id);
        s.run('DELETE FROM sessions WHERE user_id=?',id);
        s.run('DELETE FROM subscriptions WHERE user_id=?',id);
        return {ok:true};
      });
    },
    addBook(user,form,key=null) {
      requireRole(user,['librarian']);
      const title=needed(form.title,200),author=needed(form.author,160),isbn=str(form.isbn,32),subject=str(form.subject,120),description=str(form.description,1200);
      const count=Number(form.copies);
      if(!Number.isInteger(count)||count<1||count>30) fail(400,'INPUT_INVALID','Copie: numero fra 1 e 30');
      return idempotent(user,key,'book',form,()=>{
        const id=newId();
        s.run("INSERT INTO books(id,title,author,isbn,subject,description,created_at) VALUES(?,?,?,?,?,?,?)",id,title,author,isbn,subject,description,now());
        for(let i=0;i<count;i++) s.run("INSERT INTO copies(id,book_id,barcode,shelf) VALUES(?,?,?,?)",newId(),id,'LUM-'+randomBytes(8).toString('hex').toUpperCase(),str(form.shelf,80));
        return {id};
      });
    },
    notifyList(user) {
      requireRole(user,['student','faculty','librarian']);
      return s.all("SELECT id,title,body,kind,created_at,read_at FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 200",user.id);
    },
    readNotification(user,id) {
      requireRole(user,['student','faculty','librarian']);
      const result=s.run('UPDATE notifications SET read_at=? WHERE id=? AND user_id=?',now(),id,user.id);
      if(!result.changes) fail(404,'NOT_FOUND','Notifica non trovata');
      return {ok:true};
    },
    broadcast(user,form,key=null) {
      requireRole(user,['librarian']);
      const role=str(form.role,30),title=needed(form.title,120),body=needed(form.body,600);
      if(!['all','student','faculty','librarian'].includes(role)) fail(400,'INPUT_INVALID','Destinatari non validi');
      return idempotent(user,key,'broadcast',form,()=>{
        const users=role==='all'?s.all('SELECT id FROM users WHERE active=1'):s.all('SELECT id FROM users WHERE active=1 AND role=?',role);
        for(const u of users) notify(s,u.id,title,body,'broadcast');
        return {recipients:users.length};
      });
    },
    subscribe(user,subscription,token) {
      requireRole(user,['student','faculty','librarian']);
      if(!token || typeof token!=='string')fail(401,'AUTH_REQUIRED','Sessione necessaria per registrare questo dispositivo');
      const sessionHash=tokenHash(token);
      const session=s.get('SELECT user_id FROM sessions WHERE token_hash=? AND expires_at>?',sessionHash,now());
      if(session?.user_id!==user.id)fail(401,'AUTH_REQUIRED','Sessione scaduta o non associata');
      let endpointHost='';
      try {
        const url=new URL(subscription?.endpoint);
        if(url.protocol!=='https:'||url.username||url.password||url.port||url.hash)throw 0;
        endpointHost=url.hostname.toLowerCase();
      } catch {fail(400,'INPUT_INVALID','Endpoint push non valido');}
      const approved=['fcm.googleapis.com','fcm-xm.googleapis.com','android.googleapis.com','updates.push.services.mozilla.com','web.push.apple.com'];
      if(!approved.includes(endpointHost)&&!endpointHost.endsWith('.notify.windows.com')&&!endpointHost.endsWith('.push.apple.com'))
        fail(400,'PUSH_PROVIDER_DENIED','Provider push non consentito');
      if(typeof subscription?.endpoint!=='string'||subscription.endpoint.length>2000||
        !validPushKeys(subscription.keys))
        fail(400,'INPUT_INVALID','Sottoscrizione push non valida');
      return s.tx(()=>{
        const existing=s.get('SELECT user_id FROM subscriptions WHERE endpoint=?',subscription.endpoint);
        if(existing&&existing.user_id!==user.id)
          fail(409,'PUSH_ENDPOINT_IN_USE','Il dispositivo ha una sottoscrizione di un altro account. Disattivala dal browser e riprova.');
        // A current account may refresh its own endpoint after a renewed login.
        // We never silently transfer a delivery address across account IDs.
        s.run("INSERT INTO subscriptions(endpoint,user_id,payload,created_at,session_hash) VALUES(?,?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET payload=excluded.payload,created_at=excluded.created_at,session_hash=excluded.session_hash",
          subscription.endpoint,user.id,JSON.stringify(subscription),now(),sessionHash);
        return {ok:true};
      });
    },
    subscriptionStatus(user,endpoint) {
      requireRole(user,['student','faculty','librarian']);
      const value=str(endpoint,2000);
      if(!value)return {owned:false};
      return {owned:!!s.get('SELECT 1 FROM subscriptions WHERE endpoint=? AND user_id=?',value,user.id)};
    },
    unsubscribe(user,endpoint) {
      requireRole(user,['student','faculty','librarian']);
      s.run('DELETE FROM subscriptions WHERE user_id=? AND endpoint=?',user.id,str(endpoint,2000));
      return {ok:true};
    },
    audit(user,limit=100) {
      requireRole(user,['librarian']);
      const bounded=Math.max(1,Math.min(200,Number(limit)||100));
      return s.all('SELECT sequence,actor_id,operation,request_hash,receipt_hash,idempotency_key,occurred_at FROM audit_events ORDER BY sequence DESC LIMIT ?',bounded);
    },
    stats(user) {
      requireRole(user,['librarian']);
      return {
        users:s.get('SELECT count(*) n FROM users').n,
        books:s.get('SELECT count(*) n FROM books').n,
        copies:s.get('SELECT count(*) n FROM copies').n,
        loans:s.get("SELECT count(*) n FROM loans WHERE status='active'").n,
        queued:s.get("SELECT count(*) n FROM holds WHERE status='queued'").n,
        pending:s.get("SELECT count(*) n FROM suggestions WHERE status='pending'").n,
        activeLoans:s.all("SELECT l.id,l.user_id,u.name patron,b.title,b.id book_id,l.due_at FROM loans l JOIN users u ON u.id=l.user_id JOIN copies c ON c.id=l.copy_id JOIN books b ON b.id=c.book_id WHERE l.status='active' ORDER BY l.checked_out_at DESC LIMIT 150"),
        readyHolds:s.all("SELECT h.id,u.name patron,u.id user_id,b.title,b.id book_id FROM holds h JOIN users u ON u.id=h.user_id JOIN books b ON b.id=h.book_id WHERE h.status='ready' ORDER BY h.created_at LIMIT 150")
      };
    }
  };
  return api;
}
