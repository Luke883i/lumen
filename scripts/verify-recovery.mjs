// Read-only operator gate: npm run verify:recovery -- /path/to/offsite.sqlite
import {verifyRecovery} from '../src/recovery.mjs';
const path=process.argv[2];
if(!path){
  console.error('Usage: npm run verify:recovery -- /path/to/backup.sqlite');
  process.exitCode=2;
}else{
  try{
    const report=await verifyRecovery({backupPath:path,manifestPath:process.env.LUMEN_BACKUP_MANIFEST||undefined});
    console.log(JSON.stringify(report,null,2));
  }catch(error){
    // No absolute paths, patron names or backup contents in failure output.
    console.log(JSON.stringify({gate:'R10_OFFLINE_RECOVERY',status:'FAIL',
      code:error.code||'RECOVERY_FAILURE',revision:process.env.GIT_SHA||'unbound'},null,2));
    process.exitCode=1;
  }
}
