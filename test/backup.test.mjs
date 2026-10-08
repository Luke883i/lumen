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
