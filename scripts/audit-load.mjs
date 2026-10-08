// Deterministic post-load mutation audit. The load runner must stop before inspection.
import {DatabaseSync} from 'node:sqlite';
const path=process.env.LUMEN_DB_PATH;
const users=Number(process.env.LOAD_USERS||2000);
if(process.env.NODE_ENV!=='test'||!path?.includes('load'))throw Error('Load audit only works on synthetic test DB');
const db=new DatabaseSync(path,{readOnly:true});
const count=(sql,...params)=>Number(db.prepare(sql).get(...params).n);
const ready=count("SELECT count(*) n FROM holds WHERE status='ready'");
const queued=count("SELECT count(*) n FROM holds WHERE status='queued'");
const total=count("SELECT count(*) n FROM holds");
const receipts=count("SELECT count(*) n FROM idempotency WHERE operation='hold'");
const dup=count("SELECT count(*) n FROM (SELECT book_id,user_id FROM holds WHERE status IN ('queued','ready') GROUP BY book_id,user_id HAVING count(*)>1)");
const overbooked=count("SELECT count(*) n FROM (SELECT b.id, (SELECT count(*) FROM holds h WHERE h.book_id=b.id AND h.status='ready') ready, (SELECT count(*) FROM copies c WHERE c.book_id=b.id) copies FROM books b) WHERE ready>copies");
const nonexistent=count("SELECT count(*) n FROM holds h WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id=h.user_id) OR NOT EXISTS (SELECT 1 FROM books b WHERE b.id=h.book_id)");
const check=db.prepare('PRAGMA quick_check').get().quick_check;
const report={users,total,receipts,ready,queued,duplicate_holds:dup,overbooked_titles:overbooked,orphan_holds:nonexistent,sqlite_integrity:check};
console.log(JSON.stringify(report,null,2));
db.close();
const expectedReady=users-Math.floor(users/20),expectedQueued=Math.floor(users/20);
if(total!==users||receipts!==users||ready!==expectedReady||queued!==expectedQueued||dup||overbooked||nonexistent||check!=='ok'){
  console.error('WRITE_SATURATION_INVARIANT_FAILED');
  process.exitCode=1;
}
