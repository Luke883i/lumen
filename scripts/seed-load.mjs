// Synthetic-only benchmark seed. NEVER execute against production.
import {openStore,hashPassword,tokenHash,now} from '../src/store.mjs';
const path=process.env.LUMEN_DB_PATH;
if(process.env.NODE_ENV!=='test'||!path?.includes('load'))throw new Error('Synthetic seed requires NODE_ENV=test and LUMEN_DB_PATH containing load');
const s=openStore(path);
const accounts=Number(process.env.LOAD_USERS||2000);
const totalBooks=Number(process.env.LOAD_BOOKS||20000);
if(accounts>3000||accounts<1||totalBooks>50000||totalBooks<1)throw new Error('Invalid fixture size');
const started=Date.now();
const pass=hashPassword('synthetic-test-account-only');
const stamp=now(),expiration=new Date(Date.now()+86400000).toISOString();
s.tx(()=>{
  for(let i=1;i<=accounts;i++){
    const id='load-user-'+i;
    s.run('INSERT OR IGNORE INTO users(id,email,name,role,passhash,created_at) VALUES(?,?,?,?,?,?)',id,'load'+i+'@fixture.invalid','Synthetic '+i,'student',pass,stamp);
    s.run('INSERT OR IGNORE INTO sessions(token_hash,user_id,csrf,expires_at) VALUES(?,?,?,?)',
      tokenHash('load-session-'+i),id,'load-csrf-'+i,expiration);
  }
  for(let i=1;i<=totalBooks;i++){
    const id='load-book-'+i;
    s.run('INSERT OR IGNORE INTO books(id,title,author,isbn,subject,description,created_at) VALUES(?,?,?,?,?,?,?)',
      id,'Title '+i,'Author '+(i%350),'ISBN-'+i,'Subject '+(i%30),'Synthetic catalogue fixture',stamp);
    s.run('INSERT OR IGNORE INTO copies(id,book_id,barcode,shelf) VALUES(?,?,?,?)',
      'load-copy-'+i,id,'LOAD-'+i,'A');
  }
});
console.log(JSON.stringify({fixture:'synthetic',users:accounts,books:totalBooks,duration_ms:Date.now()-started}));
s.close();
