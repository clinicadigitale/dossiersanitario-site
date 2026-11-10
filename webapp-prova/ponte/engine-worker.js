/* Worker che ospita il motore originale del Dossier (Python) dentro il browser. */
'use strict';
const PYODIDE='https://cdn.jsdelivr.net/pyodide/v0.27.2/full/';
const FILE_MOTORE=['server.py','auth_service.py','license_manager.py','dossier_engine.py',
  'vendor/qrcode/__init__.py','vendor/qrcode/base.py','vendor/qrcode/constants.py','vendor/qrcode/exceptions.py','vendor/qrcode/LUT.py','vendor/qrcode/main.py','vendor/qrcode/util.py','vendor/qrcode/release.py','vendor/qrcode/console_scripts.py',
  'vendor/qrcode/compat/__init__.py','vendor/qrcode/compat/etree.py','vendor/qrcode/compat/png.py',
  'vendor/qrcode/image/__init__.py','vendor/qrcode/image/base.py','vendor/qrcode/image/pil.py','vendor/qrcode/image/pure.py','vendor/qrcode/image/svg.py','vendor/qrcode/image/styledpil.py',
  'vendor/qrcode/image/styles/__init__.py','vendor/qrcode/image/styles/colormasks.py','vendor/qrcode/image/styles/moduledrawers/__init__.py','vendor/qrcode/image/styles/moduledrawers/base.py','vendor/qrcode/image/styles/moduledrawers/pil.py','vendor/qrcode/image/styles/moduledrawers/svg.py'];
// GitHub Pages esclude le cartelle "vendor" e i file che iniziano con "_": sul sito hanno nomi diversi
const nomeWeb=f=>f.replace(/^vendor\//,'librerie/').replace(/__init__\.py$/,'init_pkg.py');
let py=null,ponte=null,pronto=null,coda=Promise.resolve(),BASE='';
// Lettura dei PDF: PDFium (stessa versione dell'exe, compilato per il browser) e OpenCV,
// caricati solo quando serve il primo documento. I caratteri del computer arrivano dalla pagina.
let pdfium=null,caratteriInAttesa=[];
const RICHIEDE_PDF=/^\/api\/(ocr|doctor-export)/;
function caricaPdfium(){
  if(pdfium)return pdfium;
  pdfium=(async()=>{
    const dir=BASE+'ponte/pdfium/';
    importScripts(BASE+'ponte/pdfium_ponte.js?v=web6');
    const src=await (await fetch(dir+'pdfium.js?v=7947',{cache:'force-cache'})).text();
    const M=await new Promise((ok,ko)=>{const m={locateFile:p=>dir+p+'?v=7947',onRuntimeInitialized:()=>ok(m),onAbort:ko,print:()=>{},printErr:()=>{}};
      new Function('Module',src+'\nModule.FS=FS;')(m);});
    self.pdfiumPonte=creaPdfiumPonte(M,caratteriInAttesa);caratteriInAttesa=[];
    await py.loadPackage(['opencv-python','pyclipper','shapely','pyyaml','requests','tqdm']);
    // all'avvio il ponte aveva messo un segnaposto per cv2: ora c'e' quello vero
    py.runPython("import sys\n_m=sys.modules.get('cv2')\nif _m is not None and not hasattr(_m,'cvtColor'): sys.modules.pop('cv2',None)\nimport cv2");
    await preparaOcr();
    return self.pdfiumPonte;
  })();
  pdfium.catch(()=>{pdfium=null;});
  return pdfium;
}
// OCR: RapidOCR dell'exe (stessi modelli) con onnxruntime-web al posto di onnxruntime.
// I file Python arrivano subito, i modelli (circa 31 MB) solo alla prima foto o scansione.
const ORT_URL='https://cdn.jsdelivr.net/npm/onnxruntime-web@1.23.0/dist/';
const JSPI=typeof WebAssembly!=='undefined'&&(typeof WebAssembly.Suspending==='function'||typeof WebAssembly.Suspender==='function');
let manifestoOcr=null,ortP=null;const sessioni=[];
async function preparaOcr(){
  const dir=BASE+'ponte/ocr/';
  manifestoOcr=await (await fetch(dir+'manifest.json?v=ocr2',{cache:'no-cache'})).json();
  await Promise.all(manifestoOcr.map(async m=>{
    const dest='/ponte/ocr/'+m.fs;py.FS.mkdirTree(dest.slice(0,dest.lastIndexOf('/')));
    if(m.modello){py.FS.writeFile(dest,new Uint8Array(0));return;}
    const r=await fetch(dir+m.web+'?v=ocr1',{cache:'no-cache'});if(!r.ok)throw new Error('file OCR mancante: '+m.web);
    py.FS.writeFile(dest,new Uint8Array(await r.arrayBuffer()));}));
  // all'avvio il ponte aveva messo dei segnaposto per rapidocr: ora ci sono quelli veri
  py.runPython("import sys\nsys.path.insert(0,'/ponte/ocr')\nfor _n in [k for k in list(sys.modules) if k=='rapidocr' or k.startswith('rapidocr.') or k=='onnxruntime' or k.startswith('onnxruntime.')]: sys.modules.pop(_n,None)\nimport dossier_engine as _de\nfrom rapidocr.utils.download_file import DownloadFile as _DF\n_orig=_DF.run.__func__\ndef _run(cls,ip,_o=_orig):\n    import os\n    p=str(ip.save_path)\n    if os.path.exists(p) and os.path.getsize(p)==0:\n        from pyodide.ffi import run_sync\n        import js\n        open(p,'wb').write(bytes(run_sync(js.ortModello(p)).to_py()))\n    return _o(cls,ip)\n_DF.run=classmethod(_run)\nif "+(JSPI?'True':'False')+":\n    import compat_web\n    compat_web.applica()\n_de._RAPID_OCR=None\n_de._RAPID_OCR_ERROR=None if "+(JSPI?'True':'False')+" else 'RapidOCR non disponibile: questo browser non supporta il riconoscimento del testo (serve una versione recente di Chrome o Edge)'");
}
function caricaOrt(){
  if(!ortP){ortP=(async()=>{importScripts(ORT_URL+'ort.wasm.min.js');self.ort.env.wasm.wasmPaths=ORT_URL;self.ort.env.wasm.numThreads=self.crossOriginIsolated?Math.max(1,Math.min(8,(navigator.hardwareConcurrency||2)-1)):1;self.ort.env.logLevel='error';return self.ort;})();ortP.catch(()=>{ortP=null;});}
  return ortP;
}
// Decodifica JPEG del browser (libjpeg-turbo, come Pillow dell'exe), pixel senza gestione colore
self.decodificaJpeg=async dati=>{
  const bmp=await createImageBitmap(new Blob([new Uint8Array(dati)],{type:'image/jpeg'}),{colorSpaceConversion:'none',premultiplyAlpha:'none',imageOrientation:'none'});
  const c=new OffscreenCanvas(bmp.width,bmp.height);const x=c.getContext('2d',{colorSpace:'srgb',willReadFrequently:true});
  x.drawImage(bmp,0,0);const px=x.getImageData(0,0,bmp.width,bmp.height).data;bmp.close();
  return {w:c.width,h:c.height,data:new Uint8Array(px.buffer,px.byteOffset,px.byteLength)};
};
self.ortModello=async percorso=>{
  const fs=String(percorso).replace(/^\/ponte\/ocr\//,'');const m=(manifestoOcr||[]).find(x=>x.fs===fs);
  if(!m)throw new Error('modello OCR sconosciuto: '+fs);
  const r=await fetch(BASE+'ponte/ocr/'+m.web+'?v=ocr1',{cache:'force-cache'});if(!r.ok)throw new Error('modello OCR non scaricato: '+m.web);
  return new Uint8Array(await r.arrayBuffer());
};
self.ortCrea=async dati=>{
  const o=await caricaOrt();const s=await o.InferenceSession.create(new Uint8Array(dati),{executionProviders:['wasm'],graphOptimizationLevel:'all'});
  sessioni.push(s);return {id:sessioni.length-1,inputNames:Array.from(s.inputNames),outputNames:Array.from(s.outputNames)};
};
self.ortEsegui=async(id,nomi,forme,dati,uscite)=>{
  const o=await caricaOrt();const s=sessioni[id];const feeds={};
  Array.from(nomi).forEach((n,i)=>{const u=new Uint8Array(dati[i]);feeds[n]=new o.Tensor('float32',new Float32Array(u.buffer,u.byteOffset,u.byteLength/4),Array.from(forme[i]).map(Number));});
  const r=await s.run(feeds,Array.from(uscite));
  return Array.from(uscite).map(n=>{const t=r[n];const d=t.data;return {dims:Array.from(t.dims),data:new Uint8Array(d.buffer,d.byteOffset,d.byteLength)};});
};
// ---------------------------------------------------------------------------
// Cloud: nell'exe i comandi verso MEGA li esegue rclone.exe; qui li esegue il browser
// con la libreria megajs. Il motore (cloud_web.py) li chiede con cloudOp.
const MEGA_URL='https://cdn.jsdelivr.net/npm/megajs@1.3.10/dist/main.browser-umd.js';
const megaSessioni=new Map();
function libreriaMega(){
  if(!self.mega||!self.mega.Storage)importScripts(MEGA_URL);
  if(!self.mega||!self.mega.Storage)throw new Error('Il collegamento a MEGA non si è caricato: controlla la connessione a internet');
  return self.mega;
}
function sessioneMega(user,pass){
  const k=user+'\n'+pass;let s=megaSessioni.get(k);if(s)return s;
  s=(async()=>{const M=libreriaMega();const st=new M.Storage({email:user,password:pass,keepalive:true,autologin:true,autoload:true});await st.ready;st.__ricarica=Date.now();return st;})();
  megaSessioni.set(k,s);s.catch(()=>megaSessioni.delete(k));return s;
}
// chiamata compatibile con le due forme della libreria (callback o Promise)
function chiama(o,m,...a){return new Promise((ok,ko)=>{let fatto=false;const fine=(e,r)=>{if(fatto)return;fatto=true;e?ko(e):ok(r);};let r;try{r=o[m](...a,fine);}catch(e){fine(e);return;}if(r&&typeof r.then==='function')r.then(x=>fine(null,x),e=>fine(e));});}
const parti=p=>String(p||'').replace(/\\/g,'/').split('/').filter(x=>x&&x!=='.');
const figli=n=>(n&&Array.isArray(n.children))?n.children:[];
function ultimo(lista){return lista.slice().sort((a,b)=>(Number(b.timestamp)||0)-(Number(a.timestamp)||0))[0]||null;}
function trova(st,percorso){let n=st.root;for(const nome of parti(percorso)){if(!n||!n.directory)return null;n=ultimo(figli(n).filter(x=>x.name===nome));}return n||null;}
const iso=n=>new Date((Number(n.timestamp)||0)*1000).toISOString().replace('.000Z','Z');
const voce=(n,percorso)=>({Path:percorso,Name:n.name,Size:n.directory?-1:Number(n.size)||0,ModTime:iso(n),IsDir:!!n.directory});
function elenca(n,{recursive,filesOnly,dirsOnly},prefisso='',out=[]){
  for(const f of figli(n)){const p=prefisso?prefisso+'/'+f.name:f.name;
    if(f.directory){if(!filesOnly)out.push(voce(f,p));if(recursive)elenca(f,{recursive,filesOnly,dirsOnly},p,out);}
    else if(!dirsOnly)out.push(voce(f,p));}
  return out;
}
// le cartelle si creano una alla volta: con piu' invii insieme non devono nascere doppioni
let catenaCartelle=Promise.resolve();
function inFila(fn){const p=catenaCartelle.then(fn,fn);catenaCartelle=p.catch(()=>{});return p;}
const connessioni=new Map();
async function cartella(st,percorso){let n=st.root;for(const nome of parti(percorso)){let c=ultimo(figli(n).filter(x=>x.name===nome&&x.directory));if(!c)c=await chiama(n,'mkdir',nome);n=c;}return n;}
async function aggiorna(st,forza){if(typeof st.reload!=='function')return;if(forza||Date.now()-(st.__ricarica||0)>5*60*1000){await chiama(st,'reload',true);st.__ricarica=Date.now();}}
async function cerca(st,percorso){let n=trova(st,percorso);if(!n){await aggiorna(st,true);n=trova(st,percorso);}return n;}
function nonTrovato(percorso,cartellaAttesa){return {ok:false,code:cartellaAttesa?'notfound_dir':'notfound',error:'non trovato: '+percorso};}
async function scrivi(st,percorso,dati){
  const p=parti(percorso),nome=p.pop();const dir=await inFila(()=>cartella(st,p.join('/')));
  const vecchi=figli(dir).filter(x=>x.name===nome&&!x.directory);
  await dir.upload({name:nome,size:dati.byteLength,allowUploadBuffering:true},dati).complete;
  for(const v of vecchi){try{await chiama(v,'delete',false);}catch(_e){}}
}
async function operazioneMega(op,conn,a,dati){
  let st;
  try{st=await sessioneMega(conn.user,conn.pass);}
  catch(e){const t=String(e&&e.message||e);return {ok:false,code:/ENOENT|EKEY|password|credential|-9|-16/i.test(t)?'auth':'error',error:'Accesso a MEGA non riuscito: '+t};}
  const percorso=a.path||'';
  if(op==='about'){const i=await chiama(st,'getAccountInfo');return {ok:true,total:Number(i.spaceTotal)||0,used:Number(i.spaceUsed)||0,free:Math.max(0,(Number(i.spaceTotal)||0)-(Number(i.spaceUsed)||0))};}
  if(op==='list'){await aggiorna(st,false);const n=percorso?await cerca(st,percorso):st.root;if(!n||!n.directory)return nonTrovato(percorso,true);return {ok:true,items:elenca(n,a)};}
  if(op==='stat'){const n=percorso?await cerca(st,percorso):st.root;if(!n)return nonTrovato(percorso,false);return {ok:true,item:voce(n,n.name)};}
  if(op==='read'){const n=await cerca(st,percorso);if(!n||n.directory)return nonTrovato(percorso,false);return {ok:true,data:await scaricaMega(n)};}
  if(op==='write'){await scrivi(st,percorso,dati);return {ok:true};}
  if(op==='mkdir'){await cartella(st,percorso);return {ok:true};}
  if(op==='delete'){const n=await cerca(st,percorso);if(!n)return nonTrovato(percorso,false);await chiama(n,'delete',false);return {ok:true};}
  if(op==='copy'||op==='move'){const n=await cerca(st,percorso);if(!n||n.directory)return nonTrovato(percorso,false);
    await scrivi(st,a.to,await scaricaMega(n));
    if(op==='move'){try{await chiama(n,'delete',false);}catch(_e){}}return {ok:true};}
  return {ok:false,code:'error',error:'operazione cloud non disponibile: '+op};
}
async function scaricaMega(n){
  if(typeof n.download!=='function'){const b=await chiama(n,'downloadBuffer',{});return new Uint8Array(b.buffer,b.byteOffset,b.byteLength);}
  return await new Promise((ok,ko)=>{let s;try{s=n.download({});}catch(e){ko(e);return;}
    const parti=[];let tot=0,ultimo=0;const totale=Number(n.size)||0;
    const avvisa=(car,fine)=>{const ora=Date.now();if(!fine&&ora-ultimo<400)return;ultimo=ora;try{postMessage({tipo:'cloudProgresso',caricati:car,totale:totale||car});}catch(_){}};
    s.on('data',c=>{const u=c instanceof Uint8Array?c:new Uint8Array(c);parti.push(u);tot+=u.length;self.__ultimoDatoCloud=Date.now();avvisa(tot,false);});
    s.on('error',ko);
    s.on('end',()=>{avvisa(tot,true);const out=new Uint8Array(tot);let o=0;for(const u of parti){out.set(u,o);o+=u.length;}ok(out);});});}
self.cloudOp=async(op,connJson,argsJson,dati)=>{
  const conn=JSON.parse(connJson),a=JSON.parse(argsJson||'{}');if(conn&&conn.name)connessioni.set(conn.name,conn);
  const corpo=dati?new Uint8Array(dati):null;
  try{
    // tempo massimo per ogni operazione: un trasferimento rimasto appeso non deve bloccare tutto il Dossier
    // invii: limite in base alla dimensione; scaricamenti: si interrompe solo se per 2 minuti non arriva niente
    const limite=120000+Math.round((corpo?corpo.byteLength:0)/40);let timer;const inizio=Date.now();
    const scade=new Promise(r=>{timer=setInterval(()=>{const ora=Date.now();const fermo=op==='read'?ora-Math.max(inizio,self.__ultimoDatoCloud||0)>120000:(op==='copy'||op==='move')?ora-inizio>1800000:ora-inizio>limite;if(fermo)r({ok:false,code:'error',error:'Tempo scaduto per l’operazione su MEGA ('+op+')'});},5000);});
    if(conn.type==='mega')return await Promise.race([operazioneMega(op,conn,a,corpo),scade]).finally(()=>clearInterval(timer));
    return {ok:false,code:'error',error:'Servizio cloud non ancora disponibile nel browser'};
  }catch(e){const t=String(e&&e.message||e);return {ok:false,code:/not found|ENOENT/i.test(t)?'notfound':'error',error:t};}
};
const stato=(testo,fine,errore)=>postMessage({tipo:'stato',testo,fine:!!fine,errore:!!errore});
// Chiave del dispositivo: AES casuale, salvata cifrata con una chiave del browser
// non esportabile. Nell'exe questo ruolo e' di DPAPI di Windows.
function idb(){return new Promise((ok,ko)=>{const r=indexedDB.open('dossier-chiave-dispositivo',1);r.onupgradeneeded=()=>r.result.createObjectStore('k');r.onsuccess=()=>ok(r.result);r.onerror=()=>ko(r.error);});}
function idbGet(db,k){return new Promise((ok,ko)=>{const q=db.transaction('k').objectStore('k').get(k);q.onsuccess=()=>ok(q.result);q.onerror=()=>ko(q.error);});}
function idbAdd(db,k,v){return new Promise((ok,ko)=>{const tx=db.transaction('k','readwrite');tx.objectStore('k').add(v,k);tx.oncomplete=()=>ok(true);tx.onerror=e=>{e.preventDefault();ok(false);};});}
async function chiaveDispositivo(){
  const db=await idb();
  let kek=await idbGet(db,'kek');
  if(!kek){const nuova=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);await idbAdd(db,'kek',nuova);kek=await idbGet(db,'kek');}
  let w=await idbGet(db,'dek');
  if(!w){const dek=crypto.getRandomValues(new Uint8Array(32));const iv=crypto.getRandomValues(new Uint8Array(12));
    const ct=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},kek,dek));await idbAdd(db,'dek',{iv,ct});w=await idbGet(db,'dek');}
  const dek=new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:w.iv},kek,w.ct));db.close();return dek;
}
function syncfs(daDisco){return new Promise((ok,ko)=>py.FS.syncfs(daDisco,e=>e?ko(e):ok()));}
async function avvia(base){
  BASE=base;
  stato('Preparazione del motore del Dossier nel browser…');
  importScripts(PYODIDE+'pyodide.js');
  py=await loadPyodide({indexURL:PYODIDE});
  stato('Caricamento dei componenti del motore…');
  await py.loadPackage(['numpy','pillow','pyodide-http','hashlib','cryptography']);
  py.FS.mkdirTree('/dati');
  py.FS.mount(py.FS.filesystems.IDBFS,{},'/dati');
  await syncfs(true);
  py.FS.mkdirTree('/motore/vendor/qrcode/image/styles/moduledrawers');py.FS.mkdirTree('/motore/vendor/qrcode/compat');py.FS.mkdirTree('/ponte/pdfium_web/pypdfium2');
  // durante la pubblicazione di un aggiornamento il sito puo' rispondere per pochi secondi con errori: si riprova
  const scarica=async(url)=>{for(let t=0;;t++){try{const r=await fetch(url,{cache:'no-cache'});if(r.ok)return await r.text();if(t>=3)throw new Error('file mancante: '+url);}catch(e){if(t>=3)throw e;}await new Promise(ok=>setTimeout(ok,1500*(t+1)));}};
  await Promise.all(FILE_MOTORE.map(async f=>{py.FS.writeFile('/motore/'+f,await scarica(base+'python_engine/'+nomeWeb(f)));}));
  py.FS.writeFile('/ponte/ponte_web.py',await scarica(base+'ponte/ponte_web.py'));
  py.FS.writeFile('/ponte/cloud_web.py',await scarica(base+'ponte/cloud_web.py'));
  py.FS.writeFile('/ponte/pdfium_web/pypdfium2/__init__.py',await scarica(base+'ponte/pdfium_web/pypdfium2/'+nomeWeb('__init__.py')));
  // file di configurazione che il motore legge dalla cartella del programma (ROOT = cartella sopra /motore)
  for(const f of ['diagnostics_config.json']){py.FS.writeFile('/'+f,await scarica(base+f));}
  const dek=await chiaveDispositivo();
  py.runPython("import sys\nsys.path.insert(0,'/ponte')\nsys.path.insert(0,'/ponte/pdfium_web')\nimport ponte_web\nponte_web.prepara_ambiente('/dati','/motore')\nponte_web.motore()\nponte_web.adatta_cifratura()");
  ponte=py.globals.get('ponte_web')||py.pyimport('ponte_web');
  ponte.imposta_chiave(py.toPy(Array.from(dek)));dek.fill(0);
  py.runPython("ponte_web.adatta_google('"+base+"oauth-google.html')\nponte_web.adatta_avvisi('/dati')\nponte_web.adatta_esportazioni()\nponte_web.adatta_cloud()");
  stato('Motore del Dossier pronto',true);
}
async function esegui(m){
  await pronto;
  if(RICHIEDE_PDF.test(String(m.percorso)))await caricaPdfium();
  const corpo=new Uint8Array(m.corpo||new ArrayBuffer(0));
  // con JSPI il motore puo' attendere onnxruntime-web (asincrono) come se fosse sincrono
  const args=[m.metodo,m.percorso,py.toPy(m.intestazioni||{}),py.toPy(corpo)];
  const ris=JSPI?await ponte.richiesta.callPromising(...args):ponte.richiesta(...args);
  const arr=ris.toJs({create_pyproxies:false});ris.destroy&&ris.destroy();
  const [status,hh,dati]=arr;
  const intestazioni=[];for(const x of hh){intestazioni.push([String(x[0]),String(x[1])]);}
  const buf=dati instanceof Uint8Array?dati:new Uint8Array(dati);
  if(!['GET','HEAD','OPTIONS'].includes(m.metodo)||String(m.percorso).startsWith('/ponte/'))await syncfs(false).catch(()=>{});
  return {status,intestazioni,corpo:buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength)};
}
onmessage=e=>{const m=e.data||{};
  if(m.tipo==='avvia'){pronto=avvia(m.base).catch(err=>{stato('Il motore del Dossier non si è avviato: '+err.message,true,true);throw err;});return;}
  // caratteri del computer concessi dalla persona: aggiunti tra una richiesta e l'altra
  if(m.tipo==='caratteri'){coda=coda.then(async()=>{const lista=(m.lista||[]).map(c=>({nome:c.nome,dati:new Uint8Array(c.dati)}));
      if(self.pdfiumPonte)self.pdfiumPonte.impostaCaratteri(lista);else caratteriInAttesa.push(...lista);
      postMessage({tipo:'caratteri',n:lista.length});}).catch(()=>{});return;}
  // operazioni cloud dirette (DICOM e immagini): non passano dalla coda del motore e possono andare in parallelo
  if(m.tipo==='cloudDiretta'){(async()=>{const r=String(m.remote||''),i=r.indexOf(':');const conn=i>0?connessioni.get(r.slice(0,i)):null;if(!conn)return {ok:false,code:'nonpronto',error:'Collegamento cloud non ancora pronto'};return self.cloudOp(m.op,JSON.stringify(conn),JSON.stringify({path:r.slice(i+1)}),m.dati||null);})().then(es=>{const t=es&&es.data&&es.data.buffer?[es.data.buffer]:[];postMessage({tipo:'cloudDiretta',id:m.id,esito:es},t);}).catch(err=>postMessage({tipo:'cloudDiretta',id:m.id,esito:{ok:false,code:'error',error:String(err&&err.message||err)}}));return;}
  if(m.tipo==='richiesta'){coda=coda.then(()=>esegui(m)).then(r=>postMessage({id:m.id,...r},[r.corpo])).catch(err=>postMessage({id:m.id,errore:String(err&&err.message||err)}));}
};
