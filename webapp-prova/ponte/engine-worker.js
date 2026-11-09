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
  py.FS.writeFile('/ponte/pdfium_web/pypdfium2/__init__.py',await scarica(base+'ponte/pdfium_web/pypdfium2/'+nomeWeb('__init__.py')));
  // file di configurazione che il motore legge dalla cartella del programma (ROOT = cartella sopra /motore)
  for(const f of ['diagnostics_config.json']){py.FS.writeFile('/'+f,await scarica(base+f));}
  const dek=await chiaveDispositivo();
  py.runPython("import sys\nsys.path.insert(0,'/ponte')\nsys.path.insert(0,'/ponte/pdfium_web')\nimport ponte_web\nponte_web.prepara_ambiente('/dati','/motore')\nponte_web.motore()\nponte_web.adatta_cifratura()");
  ponte=py.globals.get('ponte_web')||py.pyimport('ponte_web');
  ponte.imposta_chiave(py.toPy(Array.from(dek)));dek.fill(0);
  py.runPython("ponte_web.adatta_google('"+base+"oauth-google.html')\nponte_web.adatta_avvisi('/dati')\nponte_web.adatta_esportazioni()");
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
  if(m.tipo==='richiesta'){coda=coda.then(()=>esegui(m)).then(r=>postMessage({id:m.id,...r},[r.corpo])).catch(err=>postMessage({id:m.id,errore:String(err&&err.message||err)}));}
};
