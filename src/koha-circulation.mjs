// R3 Koha circulation adapter: Koha is authoritative; SQLite only records bindings and receipts.
// No fall-through to standalone holds, no blind replay after ambiguous external responses.
import {createHash} from 'node:crypto';
import {now,newId} from './store.mjs';
import {Failure} from './service.mjs';

const error=(status,code,message)=>{throw new Failure(status,code,message);};
const positive=v=>/^[1-9]\d{0,11}$/.test(String(v||'')) ? Number(v) : error(400,'KOHA_ID_INVALID','Identificativo Koha non valido');
const keyValid=k=>typeof k==='string'&&/^[A-Za-z0-9_-]{12,100}$/.test(k);
function activeUser(s,user,roles){
  if(!user)error(401,'AUTH_REQUIRED','Effettua l’accesso');
  const row=s.get('SELECT active,role,email FROM users WHERE id=?',user.id);
  if(!row||!row.active||row.role!==user.role||!roles.includes(row.role))error(403,'FORBIDDEN','Account non autorizzato');
  return row;
}
export function createKohaCirculation(s,koha,config=process.env){
  const enabled=koha.configured&&config.KOHA_CIRCULATION_ENABLED==='1'&&
    typeof config.KOHA_PICKUP_LIBRARY_ID==='string'&&/^[\w-]{1,20}$/.test(config.KOHA_PICKUP_LIBRARY_ID);
  function gate(){
    if(!enabled)error(503,'KOHA_CIRCULATION_DISABLED','La circolazione Koha non è configurata.');
  }
  function mapping(user){
    gate();activeUser(s,user,['student','faculty','librarian']);
    const row=s.get('SELECT koha_patron_id FROM koha_patron_mappings WHERE user_id=?',user.id);
    if(!row)error(409,'KOHA_MAPPING_MISSING','L’account non è ancora collegato al catalogo Koha.');
    return row.koha_patron_id;
  }
  return {
    enabled,
    getBinding(user){
      gate();
      activeUser(s,user,['student','faculty','librarian']);
      const row=s.get('SELECT koha_patron_id,verified_at FROM koha_patron_mappings WHERE user_id=?',user.id);
      return {mapped:!!row,patronId:row?.koha_patron_id||null,verifiedAt:row?.verified_at||null};
    },
    async bind(staff,userId,remoteId){
      gate();activeUser(s,staff,['librarian']);
      const target=s.get('SELECT id,email,active FROM users WHERE id=?',userId);
      if(!target||!target.active)error(404,'USER_NOT_FOUND','Account non attivo o inesistente');
      const patronId=positive(remoteId);
      const patron=await koha.patron(patronId);
      // Exact institutional email match; never auto-associate on a guess.
      if(patron.patron_id!==patronId || !patron.email ||
        patron.email.trim().toLowerCase()!==target.email.trim().toLowerCase()){
        error(409,'KOHA_IDENTITY_MISMATCH','Email dell’utente e identità Koha non corrispondono.');
      }
      return s.tx(()=>{
        const other=s.get('SELECT user_id FROM koha_patron_mappings WHERE koha_patron_id=?',patronId);
        if(other&&other.user_id!==userId)error(409,'KOHA_PATRON_ALREADY_BOUND','Patron Koha già associato');
        const stamp=now();
        s.run('INSERT INTO koha_patron_mappings(user_id,koha_patron_id,verified_by,verified_at) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET koha_patron_id=excluded.koha_patron_id,verified_by=excluded.verified_by,verified_at=excluded.verified_at',userId,patronId,staff.id,stamp);
        return {mapped:true,userId,kohaPatronId:patronId,verifiedAt:stamp};
      });
    },
    async myHolds(user){
      const patronId=mapping(user);
      const holds=await koha.patronHolds(patronId);
      if(!Array.isArray(holds))error(503,'KOHA_BAD_RESPONSE','Risposta Koha non conforme');
      return {source:'koha',patronId,holds:holds.filter(h=>h.patron_id===patronId)};
    },
    async placeHold(user,biblio,requestKey){
      const patronId=mapping(user), biblioId=positive(biblio);
      if(!keyValid(requestKey))error(400,'IDEMPOTENCY_KEY_REQUIRED','Serve una chiave idempotente valida');
      const payload=JSON.stringify({patronId,biblioId,pickupLibraryId:config.KOHA_PICKUP_LIBRARY_ID});
      const digest=createHash('sha256').update(payload).digest('hex');
      const prior=s.get('SELECT * FROM koha_hold_attempts WHERE user_id=? AND request_key=?',user.id,requestKey);
      if(prior){
        if(prior.payload_hash!==digest)error(409,'IDEMPOTENCY_CONFLICT','Chiave usata per una richiesta diversa');
        if(prior.state==='succeeded')return JSON.parse(prior.receipt_json);
        error(409,prior.state==='uncertain' || prior.state==='reserved'?'KOHA_RECONCILIATION_REQUIRED':'KOHA_REQUEST_REJECTED',
          prior.state==='uncertain'||prior.state==='reserved'?'Esito Koha da verificare prima di ripetere la richiesta.':'Richiesta precedente respinta. Usa una nuova operazione solo dopo verifica.');
      }
      const attemptId=newId();
      s.tx(()=>{
        // Unfinished writes for this patron and title cannot overlap even under different keys.
        const ongoing=s.get("SELECT id FROM koha_hold_attempts WHERE user_id=? AND biblio_id=? AND state IN ('reserved','uncertain') LIMIT 1",user.id,biblioId);
        if(ongoing)error(409,'KOHA_RECONCILIATION_REQUIRED','Esiste già un’operazione Koha da verificare.');
        s.run("INSERT INTO koha_hold_attempts(id,user_id,patron_id,biblio_id,request_key,payload_hash,state,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
          attemptId,user.id,patronId,biblioId,requestKey,digest,'reserved',now(),now());
      });
      // Any crash leaves 'reserved', which is deliberately interpreted as unknown on retry.
      let posted=false;
      try{
        const existing=await koha.patronHolds(patronId);
        if(!Array.isArray(existing))error(503,'KOHA_BAD_RESPONSE','Lista prenotazioni Koha non valida');
        if(existing.some(h=>h.biblio_id===biblioId && !h.cancellation_date)){
          error(409,'KOHA_HOLD_EXISTS','Koha ha già una prenotazione per questo titolo.');
        }
        posted=true;
        const remote=await koha.placeHold({patronId,biblioId,pickupLibraryId:config.KOHA_PICKUP_LIBRARY_ID});
        if(!Number.isSafeInteger(remote.hold_id)||remote.hold_id<=0 || remote.patron_id!==patronId || remote.biblio_id!==biblioId){
          error(503,'KOHA_RECEIPT_INVALID','Ricevuta Koha non verificabile');
        }
        const receipt={source:'koha',status:'confirmed',holdId:remote.hold_id,patronId,biblioId,priority:remote.priority??null};
        s.tx(()=>{
          s.run("UPDATE koha_hold_attempts SET state='succeeded',receipt_json=?,updated_at=? WHERE id=?",
            JSON.stringify(receipt),now(),attemptId);
          s.run('INSERT INTO audit_events(actor_id,operation,request_hash,receipt_hash,idempotency_key,occurred_at) VALUES(?,?,?,?,?,?)',
            user.id,'koha_hold',digest,createHash('sha256').update(JSON.stringify(receipt)).digest('hex'),requestKey,now());
        });
        return receipt;
      }catch(e){
        const definitePreflight=!posted;
        const definiteRejection=posted && e.code?.startsWith('KOHA_HTTP_') && ['400','401','403','404','409','412'].includes(e.code.slice(-3));
        // Any timeout, 5xx or malformed positive response could have committed at Koha.
        const state=definitePreflight||definiteRejection?'rejected':'uncertain';
        s.run("UPDATE koha_hold_attempts SET state=?,error_code=?,updated_at=? WHERE id=?",
          state,String(e.code||'KOHA_UNKNOWN').slice(0,80),now(),attemptId);
        if(state==='uncertain')error(409,'KOHA_RECONCILIATION_REQUIRED',
          'Koha potrebbe aver registrato la richiesta. Non ripetere: contatta la biblioteca per verificare l’esito.');
        throw e;
      }
    },
    async reconcile(staff,attemptId,remoteHoldId){
      gate();activeUser(s,staff,['librarian']);
      const attempt=s.get('SELECT * FROM koha_hold_attempts WHERE id=?',attemptId);
      if(!attempt)error(404,'KOHA_ATTEMPT_MISSING','Operazione da riconciliare non trovata');
      if(!['reserved','uncertain'].includes(attempt.state))error(409,'KOHA_INVALID_STATE','Operazione già risolta');
      const hold=await koha.hold(positive(remoteHoldId));
      if(hold.hold_id!==positive(remoteHoldId)||hold.patron_id!==attempt.patron_id||
        hold.biblio_id!==attempt.biblio_id||hold.cancellation_date){
        error(409,'KOHA_RECEIPT_MISMATCH','Il record Koha non conferma questa prenotazione.');
      }
      const receipt={source:'koha',status:'confirmed',holdId:hold.hold_id,
        patronId:hold.patron_id,biblioId:hold.biblio_id,priority:hold.priority??null,reconciled:true};
      s.tx(()=>{
        const result=s.run("UPDATE koha_hold_attempts SET state='succeeded',receipt_json=?,updated_at=? WHERE id=? AND state IN ('reserved','uncertain')",
          JSON.stringify(receipt),now(),attempt.id);
        if(!result.changes)error(409,'KOHA_INVALID_STATE','Operazione già risolta');
        s.run('INSERT INTO audit_events(actor_id,operation,request_hash,receipt_hash,idempotency_key,occurred_at) VALUES(?,?,?,?,?,?)',
          staff.id,'koha_hold_reconciled',attempt.payload_hash,
          createHash('sha256').update(JSON.stringify(receipt)).digest('hex'),attempt.request_key,now());
      });
      return receipt;
    },
    pending(staff){
      gate();activeUser(s,staff,['librarian']);
      return s.all("SELECT id,user_id,patron_id,biblio_id,request_key,state,error_code,created_at,updated_at FROM koha_hold_attempts WHERE state IN ('reserved','uncertain') ORDER BY created_at ASC LIMIT 200");
    }
  };
}
