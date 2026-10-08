// R4 loan operations: Koha is authoritative, LUMEN stores only receipts and uncertain work.
// External mutations cannot be rolled back with a local SQLite transaction.
import {createHash} from 'node:crypto';
import {now,newId} from './store.mjs';
import {Failure} from './service.mjs';
const fail=(status,code,message)=>{throw new Failure(status,code,message);};
const id=v=>/^[1-9]\d{0,11}$/.test(String(v||''))?Number(v):fail(400,'KOHA_ID_INVALID','Identificativo non valido');
const keyOK=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{12,100}$/.test(v);
function role(s,user,allowed){
  if(!user)fail(401,'AUTH_REQUIRED','Accesso necessario');
  const u=s.get('SELECT active,role FROM users WHERE id=?',user.id);
  if(!u||!u.active||u.role!==user.role||!allowed.includes(u.role))fail(403,'FORBIDDEN','Profilo non autorizzato');
}
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const empty=x=>!x || (typeof x==='object' && Object.keys(x).length===0);
export function createKohaLoans(s,koha,config=process.env){
  const enabled=!!koha.configured && config.KOHA_CIRCULATION_ENABLED==='1' &&
    config.KOHA_LOANS_ENABLED==='1' && /^[A-Za-z0-9_-]{1,20}$/.test(config.KOHA_PICKUP_LIBRARY_ID||'');
  function gate(){if(!enabled)fail(503,'KOHA_LOANS_DISABLED','Prestiti Koha non abilitati');}
  function mapped(user){
    gate();role(s,user,['student','faculty','librarian']);
    const r=s.get('SELECT koha_patron_id FROM koha_patron_mappings WHERE user_id=?',user.id);
    if(!r)fail(409,'KOHA_MAPPING_MISSING','Account non collegato a Koha');
    return r.koha_patron_id;
  }
  // All writes are reserved durably BEFORE contacting Koha. Retried keys are never re-posted.
  function reserve(actor,payload,key,kind,details){
    if(!keyOK(key))fail(400,'IDEMPOTENCY_KEY_REQUIRED','Chiave idempotente necessaria');
    return s.tx(()=>{
      role(s,actor,kind==='issue'?['librarian']:['student','faculty','librarian']);
      const digest=hash(payload);
      const prior=s.get('SELECT * FROM koha_loan_attempts WHERE actor_id=? AND request_key=?',actor.id,key);
      if(prior){
        if(prior.kind!==kind||prior.payload_hash!==digest)fail(409,'IDEMPOTENCY_CONFLICT','Chiave riutilizzata con altri dati');
        if(prior.state==='succeeded')return {receipt:JSON.parse(prior.receipt_json)};
        fail(409,'KOHA_RECONCILIATION_REQUIRED','Esito precedente non ripetibile senza verifica su Koha');
      }
      const recordId=newId();
      try{
        s.run("INSERT INTO koha_loan_attempts(id,actor_id,patron_id,item_id,checkout_id,kind,request_key,payload_hash,state,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
          recordId,actor.id,details.patronId,details.itemId??null,details.checkoutId??null,kind,key,digest,'reserved',now(),now());
      }catch(e){
        if(e.code?.startsWith('SQLITE_CONSTRAINT')||/UNIQUE constraint failed/i.test(e.message||''))fail(409,'KOHA_RECONCILIATION_REQUIRED','Operazione per lo stesso volume ancora incerta');
        throw e;
      }
      return {recordId,digest};
    });
  }
  function finish(record,actor,operation,receipt){
    return s.tx(()=>{
      const updated=s.run("UPDATE koha_loan_attempts SET state='succeeded',receipt_json=?,updated_at=? WHERE id=? AND state IN ('reserved','uncertain')",
        JSON.stringify(receipt),now(),record.id);
      if(!updated.changes)fail(409,'KOHA_INVALID_STATE','Operazione già risolta');
      s.run('INSERT INTO audit_events(actor_id,operation,request_hash,receipt_hash,idempotency_key,occurred_at) VALUES(?,?,?,?,?,?)',
        actor.id,operation,record.payload_hash,hash(receipt),record.request_key,now());
      return receipt;
    });
  }
  function failure(record,err,posted){
    const definite=!posted || (err.code?.startsWith('KOHA_HTTP_') && ['400','401','403','404','409','412'].includes(err.code.slice(-3)));
    const state=definite?'rejected':'uncertain';
    s.run('UPDATE koha_loan_attempts SET state=?,error_code=?,updated_at=? WHERE id=?',state,String(err.code||'KOHA_UNKNOWN').slice(0,80),now(),record.id);
    if(!definite)fail(409,'KOHA_RECONCILIATION_REQUIRED','Koha potrebbe aver registrato la richiesta: verifica necessaria');
    throw err;
  }
  function attempt(recordId){return s.get('SELECT * FROM koha_loan_attempts WHERE id=?',recordId);}
  return {
    enabled,
    async mine(user){
      const patronId=mapped(user);
      const loans=await koha.checkoutsForPatron(patronId);
      role(s,user,['student','faculty','librarian']);
      if(!Array.isArray(loans)||loans.some(x=>x.patron_id!==patronId))fail(503,'KOHA_OWNER_MISMATCH','Elenco Koha non coerente');
      return {source:'koha',patronId,loans};
    },
    async renew(user,checkoutId,requestKey){
      const patronId=mapped(user), checkout=id(checkoutId);
      const reservation=reserve(user,{patronId,checkout},requestKey,'renew',{patronId,checkoutId:checkout});
      if(reservation.receipt)return reservation.receipt;
      const record=attempt(reservation.recordId);
      let posted=false;
      try{
        const prior=await koha.checkout(checkout);
        if(prior.patron_id!==patronId||prior.checkin_date)fail(403,'KOHA_OWNER_MISMATCH','Prestito non appartenente al patron o concluso');
        const availability=await koha.renewalAvailability(checkout);
        if(!availability.allowed)fail(409,'KOHA_RENEWAL_DENIED','Koha non consente il rinnovo: '+(availability.reason||'regole biblioteca'));
        role(s,user,['student','faculty','librarian']);
        s.run('UPDATE koha_loan_attempts SET item_id=?,previous_renewals=? WHERE id=?',
          prior.item_id,prior.renewals_count,record.id);
        posted=true;
        const result=await koha.renewCheckout(checkout);
        if(result.checkout_id!==checkout||result.patron_id!==patronId||result.item_id!==prior.item_id||
          result.checkin_date||result.renewals_count<=prior.renewals_count)fail(503,'KOHA_RECEIPT_INVALID','Rinnovo Koha non confermabile');
        return finish(record,user,'koha_renew',{source:'koha',status:'confirmed',kind:'renew',
          checkoutId:checkout,patronId,itemId:prior.item_id,dueDate:result.due_date,renewals:result.renewals_count});
      }catch(e){return failure(record,e,posted);}
    },
    async issue(staff,userId,itemId,requestKey){
      gate();role(s,staff,['librarian']);const item=id(itemId);
      const target=s.get('SELECT u.id,u.active,m.koha_patron_id FROM users u LEFT JOIN koha_patron_mappings m ON m.user_id=u.id WHERE u.id=?',String(userId||''));
      if(!target?.active||!target.koha_patron_id)fail(409,'KOHA_MAPPING_MISSING','Patron inesistente, disabilitato o non associato');
      const patronId=target.koha_patron_id;
      const reservation=reserve(staff,{patronId,item,library:config.KOHA_PICKUP_LIBRARY_ID},requestKey,'issue',{patronId,itemId:item});
      if(reservation.receipt)return reservation.receipt;
      const record=attempt(reservation.recordId);
      let posted=false;
      try{
        const availability=await koha.checkoutAvailability(patronId,item);
        if(!empty(availability.blockers)||!empty(availability.confirms)||!empty(availability.warnings))
          fail(409,'KOHA_CHECKOUT_REQUIRES_STAFF_REVIEW','Koha richiede revisione delle regole di prestito');
        role(s,staff,['librarian']);
        const targetNow=s.get('SELECT active FROM users WHERE id=?',target.id);
        if(!targetNow?.active)fail(409,'KOHA_PATRON_DISABLED','Il patron è stato disabilitato');
        posted=true;
        const result=await koha.issueCheckout({patronId,itemId:item,libraryId:config.KOHA_PICKUP_LIBRARY_ID});
        if(result.patron_id!==patronId||result.item_id!==item||result.checkin_date)
          fail(503,'KOHA_RECEIPT_INVALID','Prestito Koha non confermabile');
        return finish(record,staff,'koha_checkout',{source:'koha',status:'confirmed',kind:'issue',
          checkoutId:result.checkout_id,patronId,itemId:item,dueDate:result.due_date});
      }catch(e){return failure(record,e,posted);}
    },
    pending(staff){
      gate();role(s,staff,['librarian']);
      return s.all("SELECT id,kind,patron_id,item_id,checkout_id,state,error_code,created_at FROM koha_loan_attempts WHERE state IN ('reserved','uncertain') ORDER BY created_at LIMIT 200");
    },
    async reconcile(staff,attemptId,checkoutId){
      gate();role(s,staff,['librarian']);
      const record=attempt(String(attemptId||''));if(!record)fail(404,'KOHA_ATTEMPT_MISSING','Operazione non trovata');
      if(!['reserved','uncertain'].includes(record.state))fail(409,'KOHA_INVALID_STATE','Operazione già risolta');
      const checkout=id(checkoutId);
      if(record.kind==='renew'&&record.checkout_id!==checkout)fail(409,'KOHA_RECEIPT_MISMATCH','ID prestito differente');
      const remote=await koha.checkout(checkout);
      if(remote.patron_id!==record.patron_id ||remote.checkin_date ||
        (record.item_id && remote.item_id!==record.item_id)||
        (record.kind==='issue'&&remote.item_id!==record.item_id)||
        (record.kind==='renew' && (!Number.isSafeInteger(record.previous_renewals) || remote.renewals_count<=record.previous_renewals)))
        fail(409,'KOHA_RECEIPT_MISMATCH','Prestito Koha non dimostra questa transazione');
      role(s,staff,['librarian']);
      return finish(record,staff,'koha_'+record.kind+'_reconciled',
        {source:'koha',status:'confirmed',kind:record.kind,checkoutId:checkout,patronId:remote.patron_id,
          itemId:remote.item_id,dueDate:remote.due_date,reconciled:true,renewals:remote.renewals_count});
    }
  };
}
