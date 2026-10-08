// LUMEN offline shell and privacy-safe system notifications.
const CACHE='lumen-static-v4';
const ASSETS=['/','/style.css','/app.js','/experience.js','/notification-watch.js','/projections.js','/manifest.webmanifest',
  '/icons/lumen.svg','/icons/icon-192.png','/icons/icon-512.png'];
self.addEventListener('install',event=>event.waitUntil(
  caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())
));
self.addEventListener('activate',event=>event.waitUntil(
  caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())
));
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
  if(request.mode==='navigate'){
    event.respondWith(fetch(request).then(response=>{
      if(response.ok&&url.pathname==='/'){const clone=response.clone();event.waitUntil(caches.open(CACHE).then(c=>c.put('/',clone)));}
      return response;
    }).catch(()=>caches.match('/')));
    return;
  }
  if(ASSETS.includes(url.pathname)){
    event.respondWith(caches.match(request).then(cached=>cached||fetch(request).then(response=>{
      if(response.ok){const clone=response.clone();event.waitUntil(caches.open(CACHE).then(c=>c.put(request,clone)));}
      return response;
    })));
  }
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
