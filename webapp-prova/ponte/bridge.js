/* Ponte web del Dossier Sanitario.
   L'interfaccia originale parla con il motore locale su 127.0.0.1:8896.
   Qui quelle richieste vengono passate al motore originale (Python) che gira
   dentro il browser, in un worker separato. Nessun dato esce dal dispositivo. */
(function(){
  'use strict';
  const PORTA='8896';
  const isMotore=u=>{try{const x=new URL(u,location.href);return x.port===PORTA||/^127\.0\.0\.1$|^localhost$/.test(x.hostname)&&x.port===PORTA;}catch(_e){return false;}};
  const base=(document.currentScript&&document.currentScript.src)?new URL('.',document.currentScript.src).href:new URL('ponte/',location.href).href;
  let worker=null,seq=0;const attese=new Map();let pronto=false;
  function avvia(){
    if(worker)return worker;
    // Il motore parte da un piccolo avvio interno alla pagina: cosi' eredita sempre l'isolamento
    // della pagina (serve per usare piu' processori) senza dipendere dalle intestazioni del file.
    const avvio=new Blob(["importScripts("+JSON.stringify(base+'engine-worker.js?v=web10')+");"],{type:'text/javascript'});
    worker=new Worker(URL.createObjectURL(avvio));
    worker.onmessage=e=>{const m=e.data||{};
      if(m.tipo==='stato'){mostraStato(m.testo,m.fine,m.errore);if(m.fine)pronto=true;return;}
      const a=attese.get(m.id);if(!a)return;attese.delete(m.id);
      if(m.errore){a.reject(new TypeError('Motore del Dossier: '+m.errore));return;}
      if(a.percorso==='/api/calendar/google/oauth/start'&&m.status===200)apriGoogle(m.corpo);
      if(a.percorso==='/api/calendar/local/status'&&m.status===200)m.corpo=statoAvvisi(m.corpo);
      if(a.percorso==='/api/doctor-export/complete'&&m.status===200)scaricaEsportazione(m.corpo);
      a.resolve(new Response(m.status===204||m.status===304?null:m.corpo,{status:m.status,headers:m.intestazioni}));};
    worker.onerror=e=>{mostraStato('Il motore del Dossier non si è avviato: '+(e.message||'errore'),true,true);};
    worker.postMessage({tipo:'avvia',base:new URL('..',base).href});
    return worker;
  }
  // Esportazioni: il motore consegna un file ZIP che il browser scarica nella cartella Download
  async function scaricaEsportazione(corpo){
    let d={};try{d=JSON.parse(new TextDecoder().decode(corpo));}catch(_e){return;}
    if(!d.download)return;
    try{const r=await window.fetch('http://127.0.0.1:'+PORTA+d.download);if(!r.ok)throw new Error('file non disponibile');
      const url=URL.createObjectURL(await r.blob());const a=document.createElement('a');a.href=url;a.download=d.downloadName||'Dossier.zip';
      document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
    }catch(err){mostraStato('Il file da scaricare non è stato creato: '+(err&&err.message||err),true,true);}
  }
  async function chiedi(req){
    avvia();
    const corpo=['GET','HEAD'].includes(req.method)?new ArrayBuffer(0):await req.arrayBuffer();
    const h={};req.headers.forEach((v,k)=>{h[k]=v;});
    const u=new URL(req.url);
    const id=++seq;
    return new Promise((resolve,reject)=>{attese.set(id,{resolve,reject,percorso:u.pathname});worker.postMessage({tipo:'richiesta',id,metodo:req.method,percorso:u.pathname+u.search,intestazioni:h,corpo},[corpo]);});
  }
  const fetchOriginale=window.fetch.bind(window);
  window.fetch=function(input,init){
    const url=typeof input==='string'?input:(input&&input.url)||String(input);
    if(!isMotore(url))return fetchOriginale(input,init);
    let req;try{req=new Request(url,init);}catch(e){return Promise.reject(e);}
    if(input instanceof Request&&!init)req=input;
    if(isPdf(req))return caratteriPerPdf().then(()=>chiedi(req));
    return chiedi(req);
  };
  // XMLHttpRequest verso il motore (usato da caricamenti e download cloud)
  const XO=window.XMLHttpRequest;
  window.XMLHttpRequest=function(){const x=new XO();let url='',metodo='GET',hh={};const self=this;
    const ev={};this.upload={addEventListener(){} ,onprogress:null};
    this.open=(m,u)=>{metodo=m;url=u;if(!isMotore(u))x.open(m,u,true);};
    this.setRequestHeader=(k,v)=>{hh[k]=v;if(!isMotore(url))x.setRequestHeader(k,v);};
    this.addEventListener=(t,f)=>{(ev[t]=ev[t]||[]).push(f);if(!isMotore(url))x.addEventListener(t,f);};
    this.send=b=>{if(!isMotore(url)){['onload','onerror','onprogress','onreadystatechange'].forEach(k=>{if(self[k])x[k]=self[k];});x.responseType=self.responseType||'';x.send(b);Object.defineProperty(self,'response',{get:()=>x.response});Object.defineProperty(self,'status',{get:()=>x.status});Object.defineProperty(self,'responseText',{get:()=>x.responseText});return;}
      window.fetch(url,{method:metodo,headers:hh,body:b}).then(async r=>{self.status=r.status;self.readyState=4;
        if(self.responseType==='blob')self.response=await r.blob();else if(self.responseType==='json')self.response=await r.json().catch(()=>null);else{self.responseText=await r.text();self.response=self.responseText;}
        (ev.load||[]).forEach(f=>f({target:self}));if(self.onload)self.onload({target:self});if(self.onreadystatechange)self.onreadystatechange();
      }).catch(err=>{(ev.error||[]).forEach(f=>f(err));if(self.onerror)self.onerror(err);});};
    this.abort=()=>{};this.getResponseHeader=()=>null;this.responseType='';
  };
  // Il "lease" dell'exe tiene vivo il motore: nel browser il motore vive con la pagina.
  const ES=window.EventSource;
  window.EventSource=function(u,o){if(!isMotore(u))return new ES(u,o);const f={readyState:1,close(){this.readyState=2;},addEventListener(){},removeEventListener(){},onmessage:null,onerror:null,onopen:null};setTimeout(()=>{f.onopen&&f.onopen({});},0);return f;};
  const beacon=navigator.sendBeacon&&navigator.sendBeacon.bind(navigator);
  if(beacon)navigator.sendBeacon=(u,d)=>isMotore(u)?true:beacon(u,d);

  // Google Calendar: nell'exe la pagina di Google si apre nel browser di sistema e
  // ritorna al motore su 127.0.0.1. Qui la apre il ponte e la pagina di ritorno
  // (oauth-google.html) consegna la risposta di Google al motore della webapp.
  function apriGoogle(corpo){
    let url='';try{url=JSON.parse(new TextDecoder().decode(corpo)).authUrl||'';}catch(_e){}
    if(!url)return;
    const w=window.open(url,'dossier_google','width=520,height=680');
    if(!w){mostraStato('Il browser ha bloccato la finestra di Google. ',true,true);if(box){const a=document.createElement('a');a.href=url;a.target='dossier_google';a.textContent='Apri Google';a.style.cssText='color:#fff;text-decoration:underline;margin-left:6px';a.onclick=()=>setTimeout(()=>{box&&box.remove();box=null;},500);box.appendChild(a);}}
  }
  try{
    const canale=new BroadcastChannel('dossier-google-oauth');
    canale.onmessage=async e=>{const q=e.data&&e.data.query;if(!q||e.data.tipo!=='ritorno')return;
      let ok=false,testo='';
      try{const r=await window.fetch('http://127.0.0.1:'+PORTA+'/?'+q);ok=r.ok;testo=(await r.text()).replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();}catch(err){testo=String(err&&err.message||err);}
      canale.postMessage({tipo:'esito',ok,testo});};
  }catch(_e){}

  // ---------------------------------------------------------------------
  // Avvisi del browser. Nell'exe li mostrano le Operazioni pianificate di
  // Windows; qui il motore li prepara come sempre e la pagina li mostra come
  // notifiche del browser (solo mentre il Dossier e' aperto).
  const radice=new URL('..',base).href;
  let regAvvisi=null,ultimoFarmaci=null;
  const permesso=()=>('Notification' in window)?Notification.permission:'unsupported';
  function statoAvvisi(corpo){
    try{const d=JSON.parse(new TextDecoder().decode(corpo));d.supported=permesso()==='granted';d.browser=true;d.engine='Avvisi del browser';return new TextEncoder().encode(JSON.stringify(d)).buffer;}catch(_e){return corpo;}
  }
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register(radice+'sw-dossier.js',{scope:radice}).then(r=>{regAvvisi=r;}).catch(err=>console.warn('Avvisi del browser non attivati:',err));
    // Alla prima apertura la pagina non e' ancora isolata: appena il servizio e' attivo si ricarica una volta sola
    if(!window.crossOriginIsolated&&!navigator.serviceWorker.controller){
      navigator.serviceWorker.addEventListener('controllerchange',()=>{let gia=false;try{gia=sessionStorage.getItem('ponteIsolamento')==='1';sessionStorage.setItem('ponteIsolamento','1');}catch(_e){gia=true;}if(!gia)location.reload();},{once:true});
    }
    navigator.serviceWorker.addEventListener('message',e=>{const d=e.data||{};if(d.fonte!=='dossier-avvisi')return;
      if(d.azione==='elenco'&&ultimoFarmaci&&accessoAttivo())apriFinestraFarmaci(ultimoFarmaci);
      if(d.azione==='rimanda')azioneFarmaci('snooze');});
  }
  async function notifica(titolo,opz){
    if(permesso()!=='granted')return false;
    try{const r=regAvvisi||await navigator.serviceWorker.ready;await r.showNotification(titolo,opz);return true;}catch(err){console.warn('Avviso del browser non mostrato:',err);return false;}
  }
  async function chiudiNotifiche(tag){try{const r=regAvvisi||await navigator.serviceWorker.ready;(await r.getNotifications({tag})).forEach(n=>n.close());}catch(_e){}}
  async function ponte(percorso,opz){const r=await window.fetch('http://127.0.0.1:'+PORTA+percorso,opz);return r.json();}
  function leggiFarmaci(d){
    const parti=String(d.testo||'').split('\n\n');const nota=parti.length>1?parti.pop():'';
    const sezioni=parti.map(p=>{const r=p.split('\n');return{nome:r[0],voci:r.slice(1).map(x=>x.replace(/^•\s*/,''))};});
    return{...d,sezioni,nota,n:sezioni.reduce((a,x)=>a+x.voci.length,0)};
  }
  function dividiVoce(v){const m=String(v).match(/^(.*) · nuova scorta necessaria dal (\d\d)\/(\d\d)\/\d{4}$/);return m?[m[1],m[2]+'/'+m[3]]:[String(v),''];}
  // Elenco completo disegnato in un'immagine: una colonna per persona, al massimo tre per riga.
  function immagineFarmaci(f){
    const W=1092,col=Math.min(3,Math.max(1,f.sezioni.length)),cw=W/col,pad=18,riga=40,top=24;
    const righe=[];for(let i=0;i<f.sezioni.length;i+=col)righe.push(f.sezioni.slice(i,i+col));
    const alte=righe.map(r=>top+riga*(Math.max(...r.map(x=>x.voci.length))+1)+pad);
    const H=Math.max(Math.round(W/2),alte.reduce((a,b)=>a+b,0));
    const c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d');
    x.fillStyle='#ffffff';x.fillRect(0,0,W,H);let y0=0;
    righe.forEach((r,ri)=>{r.forEach((g,ci)=>{const x0=ci*cw+pad;let y=y0+top+riga;
      if(ci){x.fillStyle='#e3e9ee';x.fillRect(ci*cw,y0+12,2,alte[ri]-24);}
      x.fillStyle='#0f766e';x.font='700 32px Segoe UI, sans-serif';x.fillText(g.nome,x0,y-6,cw-pad*2);
      g.voci.forEach(v=>{const [nome,data]=dividiVoce(v);y+=riga;x.fillStyle='#14243a';x.font='500 28px Segoe UI, sans-serif';x.fillText(nome,x0,y-8,cw-pad*2-(data?78:0));
        if(data){x.fillStyle='#5b6b7c';x.textAlign='right';x.fillText(data,ci*cw+cw-pad,y-8);x.textAlign='left';}});});
      if(ri){x.fillStyle='#e3e9ee';x.fillRect(12,y0,W-24,2);}y0+=alte[ri];});
    return c.toDataURL('image/png');
  }
  function stileFinestra(){if(document.getElementById('ponteAvvisiStile'))return;const st=document.createElement('style');st.id='ponteAvvisiStile';
    st.textContent='#ponteFarmaci{position:fixed;inset:0;background:rgba(20,36,58,.45);display:flex;align-items:center;justify-content:center;padding:16px;z-index:99998}#ponteFarmaci .fin{background:#fff;color:#14243a;border-radius:16px;max-width:620px;width:100%;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 20px 50px rgba(0,0,0,.3);font-family:Segoe UI,system-ui,sans-serif}#ponteFarmaci header{display:flex;gap:12px;align-items:center;padding:18px 22px;border-bottom:1px solid #e3e9ee}#ponteFarmaci header img{width:40px;height:40px}#ponteFarmaci header small{display:block;color:#5b6b7c;font-size:12px;font-weight:600;letter-spacing:.04em}#ponteFarmaci header b{font-size:19px}#ponteFarmaci .corpo{padding:8px 22px 16px;overflow:auto}#ponteFarmaci h3{font-size:15px;margin:14px 0 6px}#ponteFarmaci ul{margin:0;padding-left:20px}#ponteFarmaci li{margin:4px 0;line-height:1.4}#ponteFarmaci .nota{font-size:13px;color:#4a5a6a;background:#f4f7f9;border-radius:10px;padding:10px 12px;margin-top:14px;line-height:1.45}#ponteFarmaci footer{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end;padding:14px 22px;border-top:1px solid #e3e9ee}#ponteFarmaci footer button{font:600 15px Segoe UI,system-ui,sans-serif;border-radius:12px;padding:11px 18px;cursor:pointer;border:1px solid #cfd8e0;background:#fff;color:#14243a}#ponteFarmaci footer button.pr{background:#0f766e;border-color:#0f766e;color:#fff}#ponteFarmaci footer button:disabled{opacity:.6;cursor:wait}';
    document.head.appendChild(st);}
  function apriFinestraFarmaci(f){
    stileFinestra();let v=document.getElementById('ponteFarmaci');if(v)v.remove();
    v=document.createElement('div');v.id='ponteFarmaci';v.innerHTML='<div class="fin" role="dialog" aria-modal="true"><header><img alt=""><div><small>CLINICA DIGITALE</small><b></b></div></header><div class="corpo"></div><footer><button type="button" data-a="snooze">Rimanda di 12 ore</button><button type="button" class="pr" data-a="purchased"></button></footer></div>';
    v.querySelector('img').src=radice+'assets/icon-192.png';v.querySelector('header b').textContent=f.titolo||'Riordino farmaci';
    const corpo=v.querySelector('.corpo');
    f.sezioni.forEach(g=>{const h=document.createElement('h3');h.textContent=g.nome;corpo.appendChild(h);const ul=document.createElement('ul');g.voci.forEach(t=>{const li=document.createElement('li');li.textContent=t;ul.appendChild(li);});corpo.appendChild(ul);});
    if(f.nota){const n=document.createElement('div');n.className='nota';n.textContent=f.nota;corpo.appendChild(n);}
    v.querySelector('[data-a=purchased]').textContent=f.multi?'Tutto acquistato':'Acquistato';
    v.querySelectorAll('footer button').forEach(b=>b.onclick=async()=>{v.querySelectorAll('footer button').forEach(x=>x.disabled=true);await azioneFarmaci(b.dataset.a);v.remove();});
    document.body.appendChild(v);
  }
  async function azioneFarmaci(azione){
    try{const r=await ponte('/ponte/farmaci/azione',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({azione})});
      if(!r.ok)throw new Error(r.error||'errore');
      chiudiNotifiche('dossier-farmaci');try{sessionStorage.removeItem('ponteFarmaciMostrato');}catch(_e){}
      const v=document.getElementById('ponteFarmaci');if(v)v.remove();ultimoFarmaci=null;
      mostraStato(azione==='purchased'?'Acquisto registrato: le terapie si aggiornano alla prossima apertura del profilo':'Promemoria farmaci rimandato di 12 ore',true);
    }catch(err){mostraStato('Promemoria farmaci non aggiornato: '+(err.message||err),true,true);}
  }
  let controlloInCorso=false,finestraTesto='';
  function accessoAttivo(){
    try{const sh=document.getElementById('appShell');return !!(globalThis.DossierSecurity&&DossierSecurity.currentUser&&DossierSecurity.currentUser())&&!!sh&&!sh.hasAttribute('inert');}catch(_e){return false;}
  }
  async function controllaAvvisi(){
    if(!pronto||controlloInCorso)return;controlloInCorso=true;
    try{
      const d=await ponte('/ponte/avvisi');if(!d||!d.ok)return;
      for(const p of d.promemoria||[])await notifica('Clinica Digitale',{body:(p.messaggi||[]).join('\n\n'),icon:radice+'assets/icon-192.png',tag:'dossier-promemoria-'+p.id,requireInteraction:true,data:{tipo:'promemoria'}});
      if(d.farmaci&&d.farmaci.testo){
        const f=leggiFarmaci(d.farmaci);ultimoFarmaci=f;
        let gia='';try{gia=sessionStorage.getItem('ponteFarmaciMostrato')||'';}catch(_e){}
        if(gia!==f.testo){
          try{sessionStorage.setItem('ponteFarmaciMostrato',f.testo);}catch(_e){}
          const corto=f.sezioni.map(g=>g.nome+': '+g.voci.map(v=>dividiVoce(v)[0]).join(', ')).join('\n');
          await notifica((f.titolo||'Riordino farmaci')+' · '+f.n+(f.n===1?' farmaco':' farmaci')+' da ordinare',{body:corto,icon:radice+'assets/icon-192.png',image:immagineFarmaci(f),tag:'dossier-farmaci',requireInteraction:true,data:{tipo:'farmaci'},actions:[{action:'elenco',title:'Apri elenco completo'},{action:'rimanda',title:'Rimanda di 12 ore'}]});
        }
        // la finestra con l'elenco si apre da sola, ma solo dopo l'accesso al Dossier
        if(accessoAttivo()&&finestraTesto!==f.testo&&!document.getElementById('ponteFarmaci')){finestraTesto=f.testo;apriFinestraFarmaci(f);}
      }
    }catch(err){console.warn('Controllo avvisi non riuscito:',err);}
    finally{controlloInCorso=false;}
  }
  setTimeout(controllaAvvisi,8000);setInterval(controllaAvvisi,60000);
  // Pulsante per concedere al browser il permesso delle notifiche, nella striscia dell'Agenda.
  function pulsantePermesso(){
    const ra=document.querySelector('.agenda-provider-strip .row-actions');if(!ra)return;
    const b=document.getElementById('ponteAttivaAvvisi');
    if(permesso()==='granted'||permesso()==='unsupported'){if(b)b.remove();return;}
    if(b)return;
    const n=document.createElement('button');n.type='button';n.id='ponteAttivaAvvisi';n.className='btn btn-primary btn-small';
    n.textContent=permesso()==='denied'?'Avvisi bloccati dal browser':'Attiva avvisi del browser';
    n.onclick=async()=>{if(permesso()==='denied'){mostraStato('Le notifiche di questo sito sono bloccate: riattivale dal lucchetto accanto all’indirizzo, alla voce Notifiche.',true,true);return;}
      const p=await Notification.requestPermission();if(p==='granted'){n.remove();const nav=[...document.querySelectorAll('a,button')].find(x=>/^\s*Agenda\s*$/.test(x.textContent||''));if(nav)nav.click();controllaAvvisi();}};
    ra.prepend(n);
  }
  new MutationObserver(pulsantePermesso).observe(document.documentElement,{childList:true,subtree:true});

  // ---------------------------------------------------------------------
  // Caratteri del computer per leggere i PDF. Molti referti non contengono i
  // propri caratteri: l'exe usa quelli di Windows, qui li chiediamo al browser
  // (Chrome ed Edge) con il permesso della persona. Restano sul dispositivo.
  const FAMIGLIE=['arial','arial narrow','arial black','times new roman','courier new','tahoma','verdana','symbol','wingdings',
    'calibri','cambria','georgia','trebuchet ms','segoe ui','century gothic','garamond','book antiqua','bookman old style',
    'lucida console','lucida sans unicode','microsoft sans serif','consolas','comic sans ms','impact','palatino linotype',
    'franklin gothic medium','helvetica','helvetica neue','times','courier'];
  let caratteriFatto=null;
  const supportaCaratteri=()=>typeof window.queryLocalFonts==='function';
  async function statoPermessoCaratteri(){
    if(!supportaCaratteri())return 'unsupported';
    try{return (await navigator.permissions.query({name:'local-fonts'})).state;}catch(_e){return 'prompt';}
  }
  async function inviaCaratteri(){
    let fonti=[];try{fonti=await window.queryLocalFonts();}catch(_e){return 0;}
    const scelte=fonti.filter(f=>FAMIGLIE.includes(String(f.family||'').toLowerCase()));
    const visti=new Set(),lista=[],trasf=[];
    for(const f of scelte){
      try{const dati=await (await f.blob()).arrayBuffer();const v=new Uint8Array(dati);
        const firma=dati.byteLength+':'+Array.from(v.subarray(0,64)).join(',')+':'+Array.from(v.subarray(Math.max(0,v.length-64))).join(',');
        if(visti.has(firma))continue;visti.add(firma);
        const tipo=String.fromCharCode(v[0],v[1],v[2],v[3]);const est=tipo==='ttcf'?'.ttc':tipo==='OTTO'?'.otf':'.ttf';
        lista.push({nome:String(f.postscriptName||('c'+lista.length)).replace(/[^A-Za-z0-9_.-]/g,'_')+est,dati});trasf.push(dati);
      }catch(_e){}
    }
    if(lista.length){avvia();worker.postMessage({tipo:'caratteri',lista},trasf);}
    return lista.length;
  }
  function chiediCaratteri(){
    return new Promise(fine=>{
      stileFinestra();const v=document.createElement('div');v.id='ponteFarmaci';
      v.innerHTML='<div class="fin" role="dialog" aria-modal="true"><header><img alt=""><div><small>CLINICA DIGITALE</small><b>Lettura più precisa dei referti PDF</b></div></header><div class="corpo"><p style="line-height:1.5;margin:12px 0">Molti referti in PDF usano caratteri che non sono inclusi nel file. Se permetti alla webapp di usare i caratteri installati sul tuo computer, i referti vengono letti e interpretati esattamente come nel programma Dossier per Windows.</p><div class="nota">I caratteri restano sul tuo computer: non vengono inviati da nessuna parte. Dopo «Consenti» il browser ti chiederà di confermare.</div></div><footer><button type="button" data-a="no">Non ora</button><button type="button" class="pr" data-a="si">Consenti</button></footer></div>';
      v.querySelector('img').src=radice+'assets/icon-192.png';
      v.querySelector('[data-a=no]').onclick=()=>{try{sessionStorage.setItem('ponteCaratteriNonOra','1');}catch(_e){}v.remove();fine(0);};
      v.querySelector('[data-a=si]').onclick=async()=>{v.querySelectorAll('footer button').forEach(x=>x.disabled=true);
        const n=await inviaCaratteri();v.remove();
        if(n)mostraStato('Caratteri del computer attivi per la lettura dei PDF',true);
        else mostraStato('Permesso dei caratteri non concesso: i PDF vengono letti con i caratteri di base',true,true);
        fine(n);};
      document.body.appendChild(v);
    });
  }
  // Prima di analizzare un PDF: se il permesso c'e' gia' i caratteri si caricano da soli,
  // altrimenti alla prima occasione si spiega a cosa servono.
  function caratteriPerPdf(){
    if(caratteriFatto)return caratteriFatto;
    const p=(async()=>{
      const st=await statoPermessoCaratteri();
      if(st==='granted')return inviaCaratteri();
      if(st!=='prompt')return 0;
      let nonOra=false;try{nonOra=sessionStorage.getItem('ponteCaratteriNonOra')==='1';}catch(_e){}
      if(nonOra)return 0;
      return chiediCaratteri();
    })().catch(()=>0);
    caratteriFatto=p.then(n=>{if(!n)caratteriFatto=null;return n;});
    return caratteriFatto;
  }
  const isPdf=req=>{try{const u=new URL(req.url);if(!/^\/api\/ocr(\/start)?$/.test(u.pathname))return false;const nome=decodeURIComponent(req.headers.get('X-File-Name')||'');
    // i PDF creati dalle foto contengono solo immagini: i caratteri non servono
    return /\.pdf$/i.test(nome)&&!/^referto_(fotocamera|scanner)_/i.test(nome);}catch(_e){return false;}};

  let box=null;
  function mostraStato(testo,fine,errore){
    if(!box){box=document.createElement('div');box.style.cssText='position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:99999;background:#14243a;color:#fff;padding:12px 18px;border-radius:12px;font:600 13px Segoe UI,system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.25);max-width:90vw';(document.body||document.documentElement).appendChild(box);}
    box.textContent=testo;box.style.background=errore?'#9b1c1c':'#14243a';
    if(fine&&!errore)setTimeout(()=>{box&&box.remove();box=null;},1500);
  }
  document.addEventListener('DOMContentLoaded',()=>{if(!pronto)mostraStato('Preparazione del motore del Dossier nel browser…');});
  avvia();
  window.DossierPonteWeb={pronto:()=>pronto};
})();
