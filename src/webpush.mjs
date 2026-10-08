// Optional Web Push worker. Database inbox remains canonical even if delivery fails.
export async function beginPushWorker(s,env=process.env) {
  const webpush=(await import('web-push')).default;
  webpush.setVapidDetails(env.VAPID_SUBJECT||'mailto:library@example.edu',env.VAPID_PUBLIC_KEY,env.VAPID_PRIVATE_KEY);
  let busy=false;
  async function tick() {
    if(busy) return;
    busy=true;
    try {
      const rows=s.all("SELECT * FROM notifications WHERE push_status='pending' AND push_attempts<4 ORDER BY created_at LIMIT 30");
      for(const row of rows) {
        const subs=s.all('SELECT endpoint,payload FROM subscriptions WHERE user_id=?',row.user_id);
        if(!subs.length){s.run("UPDATE notifications SET push_status='skipped' WHERE id=?",row.id);continue;}
        let success=0;
        for(const sub of subs) {
          try {
            await webpush.sendNotification(JSON.parse(sub.payload),JSON.stringify({
              id:row.id,kind:row.kind,url:'/notifiche'
            }),{TTL:86400});
            success++;
          } catch(e) {
            if(e.statusCode===404||e.statusCode===410) s.run('DELETE FROM subscriptions WHERE endpoint=?',sub.endpoint);
            else console.error(JSON.stringify({event:'push_failed',status:e.statusCode||'unknown'}));
          }
        }
        s.run("UPDATE notifications SET push_attempts=push_attempts+1,push_status=? WHERE id=?",success>0?'sent':row.push_attempts>=3?'failed':'pending',row.id);
      }
    } catch(e) { console.error(JSON.stringify({event:'push_worker_failed',message:e.message})); }
    finally {busy=false;}
  }
  setInterval(tick,15000).unref();
  tick();
}
