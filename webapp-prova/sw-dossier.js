/* Servizio della webapp del Dossier: gestisce i clic sugli avvisi del browser e
   isola la pagina, cosi' la lettura dei documenti usa piu' processori insieme
   (GitHub Pages non permette di impostare queste intestazioni dal sito). */
self.addEventListener('install',()=>{self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil(self.clients.claim());});
self.addEventListener('notificationclick',e=>{
  const tipo=(e.notification.data||{}).tipo||'';
  const azione=e.action||(tipo==='farmaci'?'elenco':'apri');
  e.notification.close();
  e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{
    const scope=new URL(self.registration.scope).pathname;
    const c=list.find(x=>new URL(x.url).pathname.startsWith(scope))||null;
    if(c){c.postMessage({fonte:'dossier-avvisi',azione,tipo});return azione==='rimanda'?undefined:c.focus();}
    if(azione!=='rimanda')return self.clients.openWindow(self.registration.scope+'index.html');
  }));
});
self.addEventListener('fetch',e=>{
  const r=e.request;
  if(r.mode!=='navigate'&&r.destination!=='worker')return;
  if(new URL(r.url).origin!==self.location.origin)return;
  e.respondWith(fetch(r).then(res=>{
    if(!res||res.status===0||res.type==='opaqueredirect')return res;
    const h=new Headers(res.headers);
    h.set('Cross-Origin-Opener-Policy','same-origin');
    h.set('Cross-Origin-Embedder-Policy','credentialless');
    return new Response(res.body,{status:res.status,statusText:res.statusText,headers:h});
  }).catch(()=>fetch(r)));
});
