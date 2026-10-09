import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,writeFileSync,appendFileSync,symlinkSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {spawnSync} from 'node:child_process';
import {openStore} from '../src/store.mjs';
import {createBackup} from '../src/backup.mjs';
import {verifyRecovery,RecoveryError} from '../src/recovery.mjs';

const fixture=()=>mkdtempSync(join(tmpdir(),'lumen-r10-test-'));
const reject=async (p,code)=>assert.rejects(p,e=>e instanceof RecoveryError&&e.code===code);
async function prepared(dir){
 const source=join(dir,'source.sqlite'),backup=join(dir,'snapshot.sqlite');
 const store=openStore(source);
 store.run('INSERT INTO metadata(key,value) VALUES(?,?)','r10-marker','pre-backup');
 store.close();
 const manifest=await createBackup({source,destination:backup});
 return {source,backup,manifest,path:backup+'.manifest.json'};
}
test('R10 verifies a real LUMEN backup in a separate read-only sandbox, without writing live data',async()=>{
 const dir=fixture();
 try{
  const f=await prepared(dir);
  const source=new DatabaseSync(f.source);
  source.prepare("UPDATE metadata SET value=? WHERE key='r10-marker'").run('post-backup-change');
  source.close();
  const good=await verifyRecovery({backupPath:f.backup});
  assert.equal(good.status,'PASS');
  assert.equal(good.sha256,f.manifest.sha256);
  assert.equal(good.bytes,f.manifest.bytes);
  assert.equal(good.foreignKeys,'ok');
  assert.equal(good.schema,'lumen');
  assert.equal(good.counts.users,0);
  assert.equal(good.caveats.includes('NOT_LIVE_RENDER_RESTORE'),true);
  const original=new DatabaseSync(f.source,{readOnly:true});
  assert.equal(original.prepare("SELECT value FROM metadata WHERE key='r10-marker'").get().value,'post-backup-change');
  original.close();
  // The exported snapshot is internally consistent, independent of a later live mutation.
  const snapshot=new DatabaseSync(f.backup,{readOnly:true});
  assert.equal(snapshot.prepare("SELECT value FROM metadata WHERE key='r10-marker'").get().value,'pre-backup');
  snapshot.close();
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('R10 falsifies byte tampering, truncated and forged manifests without printing personal data',async()=>{
 const dir=fixture();
 try{
  const f=await prepared(dir);
  const m=JSON.parse(readFileSync(f.path,'utf8'));
  appendFileSync(f.backup,'TAMPER');
  await reject(verifyRecovery({backupPath:f.backup}),'BACKUP_SIZE_MISMATCH');
  m.bytes+=6;
  writeFileSync(f.path,JSON.stringify(m));
  await reject(verifyRecovery({backupPath:f.backup}),'BACKUP_HASH_MISMATCH');
  m.sha256='0'.repeat(64);
  writeFileSync(f.path,JSON.stringify(m));
  await reject(verifyRecovery({backupPath:f.backup}),'BACKUP_HASH_MISMATCH');
  writeFileSync(f.path,'{invalid');
  await reject(verifyRecovery({backupPath:f.backup}),'MANIFEST_INVALID_JSON');
  writeFileSync(f.path,JSON.stringify({...m,version:99}));
  await reject(verifyRecovery({backupPath:f.backup}),'MANIFEST_INVALID_CONTRACT');
  assert.equal(existsSync(f.source),true);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('R10 rejects a valid SQLite file with missing LUMEN domain schema',async()=>{
 const dir=fixture();
 try{
  const source=join(dir,'impostor.sqlite'),dest=join(dir,'impostor-snapshot.sqlite');
  const db=new DatabaseSync(source);db.exec('CREATE TABLE unrelated(x TEXT)');db.close();
  await createBackup({source,destination:dest});
  await reject(verifyRecovery({backupPath:dest}),'LUMEN_SCHEMA_INCOMPLETE');
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('R10 rejects foreign key damage even if PRAGMA integrity_check reports ok',async()=>{
 const dir=fixture();
 try{
  const source=join(dir,'foreign.sqlite'),dest=join(dir,'foreign-snapshot.sqlite');
  // Exercise the actual stored schema, then use a raw test-only SQLite
  // connection to introduce FK damage that LUMEN itself normally prohibits.
  const initialized=openStore(source);
  initialized.close();
  const db=new DatabaseSync(source);
  db.exec('PRAGMA foreign_keys=OFF');
  db.prepare('INSERT INTO copies(id,book_id,barcode) VALUES(?,?,?)')
    .run('orphan-copy','missing-book','r10-broken');
  db.close();
  await createBackup({source,destination:dest});
  await reject(verifyRecovery({backupPath:dest}),'SQLITE_FOREIGN_KEY_FAILED');
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('R10 missing, symlink and non-regular backup inputs fail closed',async()=>{
 const dir=fixture();
 try{
  const f=await prepared(dir);
  await reject(verifyRecovery({backupPath:join(dir,'absent.sqlite')}),'BACKUP_OR_MANIFEST_MISSING');
  symlinkSync(f.backup,join(dir,'alias.sqlite'));
  writeFileSync(join(dir,'alias.sqlite.manifest.json'),readFileSync(f.path));
  await reject(verifyRecovery({backupPath:join(dir,'alias.sqlite')}),'BACKUP_NOT_REGULAR_FILE');
  assert.equal(existsSync(f.backup),true);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('R10 CLI emits machine-readable FAIL without leaking private filesystem paths',async()=>{
 const dir=fixture();
 try{
  const p=join(dir,'sensitive-patron-name.sqlite');
  const r=spawnSync(process.execPath,['scripts/verify-recovery.mjs',p],{encoding:'utf8',
    cwd:new URL('../',import.meta.url),timeout:20000});
  assert.equal(r.status,1);
  const report=JSON.parse(r.stdout);
  assert.deepEqual([report.gate,report.status,report.code],
    ['R10_OFFLINE_RECOVERY','FAIL','BACKUP_OR_MANIFEST_MISSING']);
  assert.equal(r.stdout.includes(dir),false);
  assert.equal(r.stdout.includes('sensitive-patron-name'),false);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('R10 standard npm CLI passes on independently relocated offsite snapshot and manifest',async()=>{
 const dir=fixture();
 try{
  const original=await prepared(dir);
  const {mkdirSync,renameSync}=await import('node:fs');
  const remote=join(dir,'offsite-extract');
  mkdirSync(remote);
  const backup=join(remote,'imported.sqlite');
  renameSync(original.backup,backup);
  renameSync(original.path,backup+'.manifest.json');
  // The manifest has the original Render-like destination pathname; the
  // archive must remain verifiable after relocation off the origin disk.
  const r=spawnSync('npm',['run','verify:recovery','--',backup],{
    cwd:new URL('../',import.meta.url),encoding:'utf8',timeout:25000
  });
  assert.equal(r.status,0,r.stderr+' '+r.stdout);
  const start=r.stdout.indexOf('{\n');
  const result=JSON.parse(r.stdout.slice(start));
  assert.equal(result.gate,'R10_OFFLINE_RECOVERY');
  assert.equal(result.status,'PASS');
  assert.equal(result.sha256,original.manifest.sha256);
  assert.equal(result.caveats.includes('NOT_OFFSITE_EVIDENCE'),true);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
