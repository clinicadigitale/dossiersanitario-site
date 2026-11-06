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
    worker=new Worker(base+'engine-worker.js?v=web2');
    worker.onmessage=e=>{const m=e.data||{};
      if(m.tipo==='stato'){mostraStato(m.testo,m.fine,m.errore);if(m.fine)pronto=true;return;}
      const a=attese.get(m.id);if(!a)return;attese.delete(m.id);
      if(m.errore){a.reject(new TypeError('Motore del Dossier: '+m.errore));return;}
      a.resolve(new Response(m.status===204||m.status===304?null:m.corpo,{status:m.status,headers:m.intestazioni}));};
    worker.onerror=e=>{mostraStato('Il motore del Dossier non si è avviato: '+(e.message||'errore'),true,true);};
    worker.postMessage({tipo:'avvia',base:new URL('..',base).href});
    return worker;
  }
  async function chiedi(req){
    avvia();
    const corpo=['GET','HEAD'].includes(req.method)?new ArrayBuffer(0):await req.arrayBuffer();
    const h={};req.headers.forEach((v,k)=>{h[k]=v;});
    const u=new URL(req.url);
    const id=++seq;
    return new Promise((resolve,reject)=>{attese.set(id,{resolve,reject});worker.postMessage({tipo:'richiesta',id,metodo:req.method,percorso:u.pathname+u.search,intestazioni:h,corpo},[corpo]);});
  }
  const fetchOriginale=window.fetch.bind(window);
  window.fetch=function(input,init){
    const url=typeof input==='string'?input:(input&&input.url)||String(input);
    if(!isMotore(url))return fetchOriginale(input,init);
    let req;try{req=new Request(url,init);}catch(e){return Promise.reject(e);}
    if(input instanceof Request&&!init)req=input;
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
