const CACHE='lumen-static-v1';
const ASSETS=['/','/style.css','/app.js','/manifest.webmanifest','/icons/lumen.svg','/icons/icon-192.png','/icons/icon-512.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/')) return;
  event.respondWith(fetch(event.request).then(response=>{
    if(response.ok&&(url.pathname==='/'||ASSETS.includes(url.pathname))) {const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));}
    return response;
  }).catch(()=>caches.match(event.request).then(r=>r||caches.match('/'))));
});
self.addEventListener('push',event=>{
  let data={title:'LUMEN',body:'Nuova comunicazione',url:'/notifiche'};
  try{data={...data,...event.data.json()};}catch{}
  event.waitUntil(self.registration.showNotification(data.title,{body:data.body,icon:'/icons/icon-192.png',badge:'/icons/icon-192.png',data:{url:data.url},tag:'lumen-message'}));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  event.waitUntil(self.clients.openWindow(event.notification.data?.url||'/notifiche'));
});
