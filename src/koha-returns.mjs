// R5: staff-assisted check-in verification, NOT a return API.
// Physical returns are committed in Koha staff workflows; this module only
// records the handoff and verifies an authoritative checked-in checkout.
import {createHash} from 'node:crypto';
import {now,newId} from './store.mjs';
import {Failure} from './service.mjs';

const deny=(status,code,message)=>{throw new Failure(status,code,message);};
const numberId=value=>/^[1-9]\d{0,11}$/.test(String(value??''))?Number(value):deny(400,'KOHA_ID_INVALID','ID prestito non valido');
const safeKey=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{12,100}$/.test(value);
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
function requireStaff(s,actor){
  if(!actor)deny(401,'AUTH_REQUIRED','Accesso necessario');
  const row=s.get('SELECT id,role,active FROM users WHERE id=?',actor.id);
  if(!row?.active||row.role!=='librarian'||actor.role!=='librarian')deny(403,'FORBIDDEN','Solo bibliotecari attivi');
}
export function createKohaReturns(s,koha,config=process.env){
  const enabled=!!koha.configured&&config.KOHA_CIRCULATION_ENABLED==='1'&&
    config.KOHA_LOANS_ENABLED==='1'&&config.KOHA_RETURNS_ENABLED==='1';
  function gate(){
    if(!enabled)deny(503,'KOHA_RETURNS_DISABLED','Verifica restituzioni Koha non abilitata');
  }
  const find=id=>s.get('SELECT * FROM koha_return_tickets WHERE id=?',id);
  function publicTicket(r){
    return {ticketId:r.id,checkoutId:r.checkout_id,patronId:r.patron_id,itemId:r.item_id,
      state:r.state,createdAt:r.created_at,verifiedAt:r.verified_at||null,receipt:r.receipt_json?JSON.parse(r.receipt_json):null};
  }
  return {
    enabled,
    list(staff){
      gate();requireStaff(s,staff);
      return s.all("SELECT * FROM koha_return_tickets WHERE state='awaiting_koha' ORDER BY created_at ASC,id ASC LIMIT 200").map(publicTicket);
    },
    async prepare(staff,checkoutId,requestKey){
      gate();requireStaff(s,staff);
      const checkout=numberId(checkoutId);
      if(!safeKey(requestKey))deny(400,'IDEMPOTENCY_KEY_REQUIRED','Chiave idempotente obbligatoria');
      const prior=s.get('SELECT * FROM koha_return_tickets WHERE staff_id=? AND request_key=?',staff.id,requestKey);
      if(prior){
        if(prior.checkout_id!==checkout)deny(409,'IDEMPOTENCY_CONFLICT','Chiave già utilizzata per un altro prestito');
        return publicTicket(prior);
      }
      // No Koha mutations: this read verifies current ownership before a physical
      // item may be accepted into the Koha staff check-in workflow.
      const remote=await koha.checkout(checkout);
      if(remote.checkout_id!==checkout||!Number.isSafeInteger(remote.patron_id)||remote.patron_id<=0||
        !Number.isSafeInteger(remote.item_id)||remote.item_id<=0||remote.checkin_date)
        deny(409,'KOHA_CHECKOUT_NOT_ACTIVE','Prestito Koha non attivo o incompleto');
      return s.tx(()=>{
        requireStaff(s,staff);
        const existing=s.get('SELECT * FROM koha_return_tickets WHERE staff_id=? AND request_key=?',staff.id,requestKey);
        if(existing){
          if(existing.checkout_id!==checkout)deny(409,'IDEMPOTENCY_CONFLICT','Chiave già usata');
          return publicTicket(existing);
        }
        const id=newId(),stamp=now();
        try{
          s.run('INSERT INTO koha_return_tickets(id,checkout_id,patron_id,item_id,staff_id,request_key,state,created_at) VALUES(?,?,?,?,?,?,?,?)',
            id,checkout,remote.patron_id,remote.item_id,staff.id,requestKey,'awaiting_koha',stamp);
        }catch(error){
          if(/UNIQUE constraint failed/i.test(String(error.message)))
            deny(409,'KOHA_RETURN_ALREADY_PENDING','Prestito già in verifica: nessuna nuova restituzione registrata');
          throw error;
        }
        return publicTicket(find(id));
      });
    },
    async verify(staff,ticketId){
      gate();requireStaff(s,staff);
      const ticket=find(String(ticketId||''));
      if(!ticket)deny(404,'KOHA_RETURN_TICKET_NOT_FOUND','Richiesta di verifica non trovata');
      if(ticket.state==='verified')return publicTicket(ticket);
      if(ticket.state!=='awaiting_koha')deny(409,'KOHA_RETURN_INVALID_STATE','Stato non riconosciuto');
      // Checking a current checkout 404 is not evidence of return. Require a
      // positive historical record with identical checkout, patron, copy and date.
      const checked=await koha.checkedInCheckout({
        checkoutId:ticket.checkout_id,patronId:ticket.patron_id,itemId:ticket.item_id
      });
      if(!checked)deny(409,'KOHA_RETURN_NOT_CONFIRMED',
        'Koha non mostra una restituzione verificabile. Registrala prima nel gestionale.');
      if(checked.checkout_id!==ticket.checkout_id||checked.patron_id!==ticket.patron_id||
        checked.item_id!==ticket.item_id||typeof checked.checkin_date!=='string'||
        !Number.isFinite(Date.parse(checked.checkin_date)))
        deny(409,'KOHA_RETURN_MISMATCH','Il rientro Koha non corrisponde al prestito atteso');
      const checkedAt=Date.parse(checked.checkin_date);
      const openedAt=Date.parse(ticket.created_at);
      // Allow limited clock skew, but reject unrelated historical or future dates.
      if(checkedAt<openedAt-120000||checkedAt>Date.now()+120000)
        deny(409,'KOHA_RETURN_TEMPORAL_MISMATCH','Data di rientro Koha incompatibile con la verifica in corso');
      return s.tx(()=>{
        requireStaff(s,staff);
        const latest=find(ticket.id);
        if(latest.state==='verified')return publicTicket(latest);
        if(latest.state!=='awaiting_koha')deny(409,'KOHA_RETURN_INVALID_STATE','Stato non valido');
        const receipt={source:'koha',status:'verified_return',checkoutId:ticket.checkout_id,
          patronId:ticket.patron_id,itemId:ticket.item_id,checkinDate:checked.checkin_date,
          checkinLibraryId:checked.checkin_library_id||null,verifiedBy:staff.id};
        const stamp=now();
        const updated=s.run("UPDATE koha_return_tickets SET state='verified',receipt_json=?,verified_at=?,verified_by=? WHERE id=? AND state='awaiting_koha'",
          JSON.stringify(receipt),stamp,staff.id,ticket.id);
        if(!updated.changes)deny(409,'KOHA_RETURN_INVALID_STATE','Conferma duplicata');
        s.run('INSERT INTO audit_events(actor_id,operation,request_hash,receipt_hash,idempotency_key,occurred_at) VALUES(?,?,?,?,?,?)',
          staff.id,'koha_return_verified',
          sha({checkoutId:ticket.checkout_id,patronId:ticket.patron_id,itemId:ticket.item_id}),
          sha(receipt),ticket.request_key,stamp);
        return publicTicket(find(ticket.id));
      });
    }
  };
}
