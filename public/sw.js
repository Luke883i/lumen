// LUMEN offline shell and privacy-safe system notifications.
const CACHE='lumen-static-v10';
const CACHE_PREFIX='lumen-static-';
const ASSETS=['/','/style.css','/app.js','/experience.js','/interaction.js','/notification-watch.js','/projections.js','/navigation.js','/journey.js','/empty-state.js','/credits.js','/legal.js','/manifest.webmanifest',
  '/icons/lumen.svg','/icons/icon-192.png','/icons/icon-512.png'];
self.addEventListener('install',event=>event.waitUntil(
  caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())
));
self.addEventListener('activate',event=>event.waitUntil(
  caches.keys().then(keys=>Promise.all(
    keys.filter(k=>k.startsWith(CACHE_PREFIX)&&k!==CACHE).map(k=>caches.delete(k))
  )).then(()=>self.clients.claim())
));
// Immutable URLs must be content-addressed. LUMEN uses stable /app.js and
// /style.css routes, so cache-first would serve an obsolete deployment forever
// if a subsequent commit didn't also edit sw.js. Prefer actual network truth,
// bypass browser HTTP caches, then retain verified assets for offline use.
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
  const navigate=request.mode==='navigate';
  if(!navigate&&!ASSETS.includes(url.pathname))return;
  const cacheKey=navigate?'/':request;
  event.respondWith((async()=>{
    try{
      const response=await fetch(request,{cache:'no-store'});
      if(response.ok && (!navigate||url.pathname==='/')){
        // Wait for cache write before completing the response promise; this
        // retains the latest authenticated-independent static shell offline.
        const cache=await caches.open(CACHE);
        await cache.put(cacheKey,response.clone());
      }
      return response;
    }catch(error){
      const cached=await caches.match(cacheKey);
      if(cached)return cached;
      throw error; // No invented successful response when even offline shell is absent.
    }
  })());
});
const safeTarget=value=>{
  if(typeof value!=='string'||!/^\/(notifiche|me|catalogo)(\/|$)/.test(value)||value.startsWith('//'))return '/notifiche';
  try{const url=new URL(value,self.location.origin);return url.origin===self.location.origin?url.pathname:'/notifiche';}
  catch{return '/notifiche';}
};
self.addEventListener('push',event=>{
  let payload={};
  try{const parsed=event.data?.json();payload=parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:{};}catch{}
  // Keep private loan/identity details off the device's lock screen.
  const title=payload.kind==='hold_ready'?'LUMEN · Prenotazioni':'LUMEN · Biblioteca';
  const data={url:safeTarget(payload.url)};
  const id=typeof payload.id==='string'&&/^[0-9a-f-]{20,42}$/i.test(payload.id)?payload.id:null;
  event.waitUntil(self.registration.showNotification(title,{
    body:'Hai un nuovo avviso. Apri LUMEN per leggerlo.',
    icon:'/icons/icon-192.png',badge:'/icons/icon-192.png',data,
    ...(id?{tag:'lumen-'+id}:{})
  }));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const target=safeTarget(event.notification.data?.url);
  const wanted=new URL(target,self.location.origin).href;
  event.waitUntil((async()=>{
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const existing=windows.find(c=>new URL(c.url).origin===self.location.origin);
    if(existing){
      if(typeof existing.navigate==='function'&&existing.url!==wanted)await existing.navigate(wanted);
      return existing.focus();
    }
    return self.clients.openWindow(wanted);
  })());
});
