/* Servizio della sola pagina di prova degli avvisi. */
self.addEventListener('install',function(){self.skipWaiting();});
self.addEventListener('activate',function(e){e.waitUntil(self.clients.claim());});
self.addEventListener('notificationclick',function(e){
  var lungo=/^prova-(lungo|img)/.test(e.notification.tag||'');
  if(lungo&&(e.action==='elenco'||!e.action)){e.notification.close();e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(function(list){
    if(list.length){list.forEach(function(c){c.postMessage('elenco');});return list[0].focus();}
    return self.clients.openWindow('prova-avvisi.html?elenco=1');}));return;}
  var scelta=e.action==='acquistato'?'Acquistato':e.action==='rimanda'?'Rimanda di 12 ore':'l\'avviso (apre il Dossier)';
  e.notification.close();
  e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(function(list){
    list.forEach(function(c){c.postMessage(scelta);});
    if(!e.action&&list.length)return list[0].focus();
  }));
});
