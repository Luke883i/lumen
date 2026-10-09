// R10: read-only verification of a LUMEN SQLite online backup in an isolated
// temporary restore sandbox. The live database is NEVER opened for writing.
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {lstat,readFile,mkdtemp,copyFile,chmod,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';

const CRITICAL_TABLES=Object.freeze([
  'users','books','copies','holds','loans','suggestions','notifications',
  'metadata','audit_events','idempotency'
]);
const CRITICAL_INDEXES=Object.freeze(['one_active_loan_per_copy','one_open_hold_per_patron_book']);
export class RecoveryError extends Error{
  constructor(code){super(code);this.name='RecoveryError';this.code=code;}
}
const deny=code=>{throw new RecoveryError(code);};
const hex64=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
async function sha256(file){
  const hash=createHash('sha256');
  for await(const chunk of createReadStream(file))hash.update(chunk);
  return hash.digest('hex');
}
/**
 * A complete, independently copied snapshot is verified in a temporary
 * directory. The backup is not trusted until both manifest and SQLite checks
 * pass. No migrations, account queries, or recovery writes touch production.
 */
export async function verifyRecovery({backupPath,manifestPath}={}){
  if(typeof backupPath!=='string'||!backupPath.trim())deny('BACKUP_PATH_REQUIRED');
  const source=resolve(backupPath);
  const manifestFile=resolve(manifestPath||source+'.manifest.json');
  if(source===manifestFile)deny('MANIFEST_PATH_INVALID');
  let workspace=null,db=null;
  try{
    const [a,b]=await Promise.all([lstat(source),lstat(manifestFile)]);
    if(!a.isFile()||a.isSymbolicLink()||!b.isFile()||b.isSymbolicLink())
      deny('BACKUP_NOT_REGULAR_FILE');
    if(a.size<=0||a.size>40*1024*1024*1024)deny('BACKUP_SIZE_OUT_OF_RANGE');
    if(b.size<2||b.size>65536)deny('MANIFEST_SIZE_OUT_OF_RANGE');
    let manifest;
    try{manifest=JSON.parse(await readFile(manifestFile,'utf8'));}
    catch{deny('MANIFEST_INVALID_JSON');}
    if(!manifest||typeof manifest!=='object'||Array.isArray(manifest)||
      manifest.version!==1||manifest.integrity!=='ok'||
      !Number.isSafeInteger(manifest.bytes)||manifest.bytes<=0||
      !hex64(manifest.sha256)||typeof manifest.source!=='string'||
      typeof manifest.created_at!=='string'||
      !Number.isFinite(Date.parse(manifest.created_at)))deny('MANIFEST_INVALID_CONTRACT');
    if(a.size!==manifest.bytes)deny('BACKUP_SIZE_MISMATCH');
    workspace=await mkdtemp(join(tmpdir(),'lumen-recovery-'));
    const sandbox=join(workspace,'isolated.sqlite');
    await copyFile(source,sandbox);
    await chmod(sandbox,0o600);
    const copyInfo=await stat(sandbox);
    if(copyInfo.size!==manifest.bytes)deny('BACKUP_SIZE_MISMATCH');
    const actualHash=await sha256(sandbox);
    if(actualHash!==manifest.sha256)deny('BACKUP_HASH_MISMATCH');
    try{
      db=new DatabaseSync(sandbox,{readOnly:true});
      if(db.prepare('PRAGMA integrity_check').get()?.integrity_check!=='ok')
        deny('SQLITE_INTEGRITY_FAILED');
      if(db.prepare('PRAGMA foreign_key_check').all().length!==0)
        deny('SQLITE_FOREIGN_KEY_FAILED');
      const tables=new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(x=>x.name));
      const indexes=new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all().map(x=>x.name));
      if(CRITICAL_TABLES.some(t=>!tables.has(t))||CRITICAL_INDEXES.some(i=>!indexes.has(i)))
        deny('LUMEN_SCHEMA_INCOMPLETE');
      // Aggregate counts avoid returning or logging any patron/catalogue payload.
      const counts=Object.fromEntries(['users','books','copies','holds','loans','notifications']
        .map(t=>[t,db.prepare('SELECT count(*) AS n FROM '+t).get().n]));
      return Object.freeze({
        gate:'R10_OFFLINE_RECOVERY',status:'PASS',manifestVersion:1,
        sha256:actualHash,bytes:copyInfo.size,integrity:'ok',foreignKeys:'ok',
        schema:'lumen',counts,
        revision:process.env.GIT_SHA||'unbound',
        caveats:['NOT_OFFSITE_EVIDENCE','NOT_LIVE_RENDER_RESTORE','NOT_HA']
      });
    }catch(e){if(e instanceof RecoveryError)throw e;deny('SQLITE_VERIFICATION_FAILED');}
  }catch(e){
    if(e instanceof RecoveryError)throw e;
    if(e.code==='ENOENT')deny('BACKUP_OR_MANIFEST_MISSING');
    if(e.code==='EACCES'||e.code==='EPERM')deny('BACKUP_NOT_READABLE');
    deny('RECOVERY_IO_FAILURE');
  }finally{
    if(db)try{db.close();}catch{}
    if(workspace)await rm(workspace,{recursive:true,force:true});
  }
}
