// Pure notification read-model for foreground/browser-tab alerts.
// Does not grant OS permission, send push, or change inbox authority.
export function createInboxWatcher(){
  let owner=null,initialized=false,seen=new Set();
  return {
    reset(){owner=null;initialized=false;seen.clear();},
    observe(userId,rows=[]){
      if(!userId){this.reset();return {unread:0,arrivals:0};}
      if(owner!==userId){owner=userId;initialized=false;seen.clear();}
      const unread=rows.filter(row=>row&&!row.read_at&&typeof row.id==='string');
      const arrivals=initialized?unread.filter(row=>!seen.has(row.id)).length:0;
      for(const row of rows)if(typeof row?.id==='string')seen.add(row.id);
      if(seen.size>500){seen=new Set(rows.map(x=>x.id).filter(Boolean));}
      initialized=true;
      return {unread:unread.length,arrivals};
    }
  };
}
