import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {openStore} from '../src/store.mjs';
import {createBackup} from '../src/backup.mjs';

test('backup is integrity-checked and actually restorable',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'lumen-backup-'));
  try{
    const src=join(dir,'live.sqlite'),dest=join(dir,'snapshot.sqlite');
    const s=openStore(src);
    s.run("INSERT INTO metadata(key,value) VALUES(?,?)",'testmarker','preserved');
    const manifest=await createBackup({source:src,destination:dest});
    assert.equal(manifest.integrity,'ok');
    assert.match(manifest.sha256,/^[0-9a-f]{64}$/);
    assert.ok(manifest.bytes>0);
    s.close();
    const restored=new DatabaseSync(dest);
    assert.equal(restored.prepare("SELECT value FROM metadata WHERE key='testmarker'").get().value,'preserved');
    restored.close();
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test('backup publication never silently overwrites an earlier snapshot or manifest',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'lumen-backup-exclusive-'));
 try{
   const source=join(dir,'live.sqlite'),destination=join(dir,'snapshot.sqlite');
   const s=openStore(source);
   s.run("INSERT INTO metadata(key,value) VALUES(?,?)",'r10-exclusive','first');
   const first=await createBackup({source,destination});
   s.run("UPDATE metadata SET value=? WHERE key=?",'second','r10-exclusive');
   await assert.rejects(createBackup({source,destination}),/already exists/);
   const restored=new DatabaseSync(destination,{readOnly:true});
   assert.equal(restored.prepare("SELECT value FROM metadata WHERE key='r10-exclusive'").get().value,'first');
   restored.close();
   const {readFileSync}=await import('node:fs');
   assert.equal(JSON.parse(readFileSync(destination+'.manifest.json','utf8')).sha256,first.sha256);
   s.close();
 }finally{rmSync(dir,{recursive:true,force:true});}
});
