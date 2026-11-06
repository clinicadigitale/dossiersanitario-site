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
let py=null,ponte=null,pronto=null,coda=Promise.resolve();
const stato=(testo,fine,errore)=>postMessage({tipo:'stato',testo,fine:!!fine,errore:!!errore});
function syncfs(daDisco){return new Promise((ok,ko)=>py.FS.syncfs(daDisco,e=>e?ko(e):ok()));}
async function avvia(base){
  stato('Preparazione del motore del Dossier nel browser…');
  importScripts(PYODIDE+'pyodide.js');
  py=await loadPyodide({indexURL:PYODIDE});
  stato('Caricamento dei componenti del motore…');
  await py.loadPackage(['numpy','pillow','pyodide-http']);
  py.FS.mkdirTree('/dati');
  py.FS.mount(py.FS.filesystems.IDBFS,{},'/dati');
  await syncfs(true);
  py.FS.mkdirTree('/motore/vendor/qrcode/image/styles/moduledrawers');py.FS.mkdirTree('/motore/vendor/qrcode/compat');py.FS.mkdirTree('/ponte');
  const scarica=async(url)=>{const r=await fetch(url,{cache:'no-cache'});if(!r.ok)throw new Error('file mancante: '+url);return await r.text();};
  await Promise.all(FILE_MOTORE.map(async f=>{py.FS.writeFile('/motore/'+f,await scarica(base+'python_engine/'+nomeWeb(f)));}));
  py.FS.writeFile('/ponte/ponte_web.py',await scarica(base+'ponte/ponte_web.py'));
  py.runPython("import sys\nsys.path.insert(0,'/ponte')\nimport ponte_web\nponte_web.prepara_ambiente('/dati','/motore')\nponte_web.motore()");
  ponte=py.globals.get('ponte_web')||py.pyimport('ponte_web');
  stato('Motore del Dossier pronto',true);
}
async function esegui(m){
  await pronto;
  const corpo=new Uint8Array(m.corpo||new ArrayBuffer(0));
  const ris=ponte.richiesta(m.metodo,m.percorso,py.toPy(m.intestazioni||{}),py.toPy(corpo));
  const arr=ris.toJs({create_pyproxies:false});ris.destroy&&ris.destroy();
  const [status,hh,dati]=arr;
  const intestazioni=[];for(const x of hh){intestazioni.push([String(x[0]),String(x[1])]);}
  const buf=dati instanceof Uint8Array?dati:new Uint8Array(dati);
  if(!['GET','HEAD','OPTIONS'].includes(m.metodo))await syncfs(false).catch(()=>{});
  return {status,intestazioni,corpo:buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength)};
}
onmessage=e=>{const m=e.data||{};
  if(m.tipo==='avvia'){pronto=avvia(m.base).catch(err=>{stato('Il motore del Dossier non si è avviato: '+err.message,true,true);throw err;});return;}
  if(m.tipo==='richiesta'){coda=coda.then(()=>esegui(m)).then(r=>postMessage({id:m.id,...r},[r.corpo])).catch(err=>postMessage({id:m.id,errore:String(err&&err.message||err)}));}
};
