/* Servizio della webapp del Dossier: gestisce i clic sugli avvisi del browser. */
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
