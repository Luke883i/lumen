import {DatabaseSync,backup} from 'node:sqlite';
import {existsSync,mkdirSync,renameSync,rmSync,readFileSync,statSync,writeFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
export async function createBackup({source,destination}){
  if(!source||source===':memory:'||!destination)throw new Error('File-backed source/destination required');
  const src=resolve(source),target=resolve(destination);
  if(src===target)throw new Error('Backup must not overwrite live database');
  if(!existsSync(src))throw new Error('Source database missing');
  mkdirSync(dirname(target),{recursive:true});
  const tmp=target+'.partial-'+randomBytes(5).toString('hex');
  let db;
  try{
    db=new DatabaseSync(src,{readOnly:true});
    await backup(db,tmp);
    db.close();db=null;
    const verify=new DatabaseSync(tmp,{readOnly:true});
    const row=verify.prepare('PRAGMA integrity_check').get();
    verify.close();
    if(row.integrity_check!=='ok')throw new Error('Backup integrity check failed');
    const bytes=statSync(tmp).size;
    const sha256=createHash('sha256').update(readFileSync(tmp)).digest('hex');
    renameSync(tmp,target);
    const manifest={version:1,source:src.split('/').at(-1),destination:target,bytes,sha256,integrity:'ok',created_at:new Date().toISOString()};
    writeFileSync(target+'.manifest.json',JSON.stringify(manifest,null,2)+'\n',{mode:0o600});
    return manifest;
  }catch(e){db?.close();rmSync(tmp,{force:true});throw e;}
}
if(process.argv[1]?.endsWith('/backup.mjs')){
  const source=process.env.LUMEN_DB_PATH||'./data/lumen.sqlite';
  const target=process.argv[2];
  if(!target){console.error('Usage: npm run backup -- /path/to/backup.sqlite');process.exitCode=2;}
  else createBackup({source,destination:target}).then(manifest=>console.log(JSON.stringify(manifest,null,2))).catch(e=>{console.error(e.message);process.exitCode=1;});
}
