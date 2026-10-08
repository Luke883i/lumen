// R9b: the inbox is canonical. Push is a revocable, best-effort device channel.
// A send already in flight cannot be recalled by a subsequent logout.
export async function beginPushWorker(s,env=process.env,{client,manual=false}={}) {
  const webpush=client||(await import('web-push')).default;
  if(!client)webpush.setVapidDetails(env.VAPID_SUBJECT||'mailto:library@example.edu',env.VAPID_PUBLIC_KEY,env.VAPID_PRIVATE_KEY);
  let busy=false;
  async function tick() {
    if(busy)return;
    busy=true;
    try{
      const rows=s.all("SELECT n.* FROM notifications n JOIN users u ON u.id=n.user_id WHERE n.push_status='pending' AND n.push_attempts<4 AND u.active=1 ORDER BY n.created_at,n.id LIMIT 30");
      for(const row of rows){
        // Do not deliver queued notifications for disabled accounts. A formerly
        // active account can be disabled during any awaited transport operation.
        if(!s.get('SELECT 1 FROM users WHERE id=? AND active=1',row.user_id))continue;
        const subs=s.all('SELECT endpoint,payload FROM subscriptions WHERE user_id=?',row.user_id);
        if(!subs.length){
          s.run("UPDATE notifications SET push_status='skipped' WHERE id=? AND push_status='pending'",row.id);
          continue;
        }
        let success=0;
        for(const sub of subs){
          const alive=s.get('SELECT 1 FROM subscriptions p JOIN users u ON u.id=p.user_id WHERE p.endpoint=? AND p.user_id=? AND p.payload=? AND u.active=1',
            sub.endpoint,row.user_id,sub.payload);
          if(!alive)continue;
          try{
            await webpush.sendNotification(JSON.parse(sub.payload),JSON.stringify({
              id:row.id,kind:row.kind,url:'/notifiche'
            }),{TTL:86400});
            success++;
          }catch(e){
            if(e.statusCode===404||e.statusCode===410){
              s.run('DELETE FROM subscriptions WHERE endpoint=? AND user_id=? AND payload=?',sub.endpoint,row.user_id,sub.payload);
            }else{
              console.error(JSON.stringify({event:'push_failed',status:e.statusCode||'unknown'}));
            }
          }
        }
        s.run("UPDATE notifications SET push_attempts=push_attempts+1,push_status=? WHERE id=? AND push_status='pending'",
          success>0?'sent':row.push_attempts>=3?'failed':'pending',row.id);
      }
    }catch(e){console.error(JSON.stringify({event:'push_worker_failed',message:e.message}));}
    finally{busy=false;}
  }
  if(!manual)setInterval(tick,15000).unref();
  if(!manual)void tick();
  return {tick};
}
