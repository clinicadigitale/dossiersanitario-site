/* Archivio media della webapp: DICOM e immagini associate ai referti.
   L'exe li teneva in una cartella del computer. Nella webapp:
   - computer (Chrome/Edge): cartella "Clinica Digitale - Archivio" scelta una volta dall'utente,
     con la copia completa dei file;
   - telefono, tablet e browser senza accesso alle cartelle: memoria temporanea nel browser
     con un tetto fisso, i file si scaricano dal cloud solo quando vengono aperti;
   - cloud: ogni file e' un oggetto cifrato separato nell'archivio (vedi cloud.js, DossierCloud.media).
   Le richieste /api/media/* dell'interfaccia originale arrivano qui dal ponte. */
(function(){
  'use strict';
  const NOME_CARTELLA='Clinica Digitale - Archivio';
  const MARCATORE='.clinica_digitale_media_archive.json';
  const TETTO_TELEFONO=500*1024*1024;
  const TETTO_COMPUTER_SENZA_CARTELLA=2*1024*1024*1024;
  const NOME_DB='dossier-media-web';

  // ---------- piccolo archivio IndexedDB del ponte ----------
  let dbp=null;
  function db(){
    if(!dbp)dbp=new Promise((ok,ko)=>{const r=indexedDB.open(NOME_DB,2);
      r.onupgradeneeded=()=>{const d=r.result;for(const s of ['chiavi','cache','indice','attesa'])if(!d.objectStoreNames.contains(s))d.createObjectStore(s);};
      r.onsuccess=()=>ok(r.result);r.onerror=()=>ko(r.error);});
    return dbp;
  }
  async function op(store,mode,fn){const d=await db();return new Promise((ok,ko)=>{const t=d.transaction(store,mode);const req=fn(t.objectStore(store));t.oncomplete=()=>ok(req?req.result:undefined);t.onerror=()=>ko(t.error);t.onabort=()=>ko(t.error);});}
  const leggi=(s,k)=>op(s,'readonly',x=>x.get(k));
  const metti=(s,k,v)=>op(s,'readwrite',x=>x.put(v,k));
  const togli=(s,k)=>op(s,'readwrite',x=>x.delete(k));
  const chiavi=s=>op(s,'readonly',x=>x.getAllKeys());

  // ---------- regole dei nomi (uguali al motore dell'exe) ----------
  function token(v){const t=String(v||'').trim().replace(/[^A-Za-z0-9._-]+/g,'_').replace(/^[._]+|[._]+$/g,'');if(!t||t.length>160)throw new Error('Identificativo non valido');return t;}
  function segmenti(kind,pid,owner,rel){
    kind=String(kind||'').toLowerCase();if(!['dicom','image'].includes(kind))throw new Error('Tipo archivio non valido');
    const base=[token(pid),kind==='dicom'?'DICOM':'Immagini',token(owner)];
    if(rel===undefined||rel===null||rel==='')return base;
    const r=String(rel).replace(/\\/g,'/').split('/').filter(Boolean);
    if(!r.length||String(rel).length>600||r.some(p=>p==='.'||p==='..'||p.includes(':')))throw new Error('Percorso file non valido');
    return base.concat(r);
  }
  function tipoMime(nome){const n=String(nome||'').toLowerCase();if(/\.dcm$/.test(n))return'application/dicom';if(/\.jpe?g$/.test(n))return'image/jpeg';if(/\.png$/.test(n))return'image/png';if(/\.webp$/.test(n))return'image/webp';return'application/octet-stream';}

  const telefono=()=>!!window.FotoDocumento?.isTelefono?.();
  const conCartella=()=>!telefono()&&typeof window.showDirectoryPicker==='function';
  const cloud=()=>window.DossierCloud?.media||null;

  // ---------- cartella sul computer ----------
  async function radice({chiedi=false}={}){
    if(!conCartella())return null;
    const h=await leggi('chiavi','radice').catch(()=>null);if(!h)return null;
    try{let p=await h.queryPermission({mode:'readwrite'});if(p!=='granted'&&chiedi)p=await h.requestPermission({mode:'readwrite'});return p==='granted'?h:null;}catch(_){return null;}
  }
  async function dir(r,segs,crea){let d=r;for(const s of segs)d=await d.getDirectoryHandle(s,{create:crea});return d;}
  async function scriviCartella(r,segs,blob){const d=await dir(r,segs.slice(0,-1),true);const fh=await d.getFileHandle(segs.at(-1),{create:true});const w=await fh.createWritable();await w.write(blob);await w.close();}
  async function leggiCartella(r,segs){try{const d=await dir(r,segs.slice(0,-1),false);return await (await d.getFileHandle(segs.at(-1))).getFile();}catch(_){return null;}}
  async function eliminaCartella(r,segs){try{const d=await dir(r,segs.slice(0,-1),false);await d.removeEntry(segs.at(-1),{recursive:true});}catch(_){}}
  async function marcatore(r){try{const f=await (await r.getFileHandle(MARCATORE)).getFile();return JSON.parse(await f.text());}catch(_){return null;}}

  // ---------- memoria temporanea nel browser ----------
  const tetto=()=>telefono()?TETTO_TELEFONO:TETTO_COMPUTER_SENZA_CARTELLA;
  async function leggiCache(k){const b=await leggi('cache',k).catch(()=>null);if(!b)return null;const i=await leggi('indice',k).catch(()=>null);if(i){i.uso=Date.now();metti('indice',k,i).catch(()=>{});}return b;}
  let ultimoSfoltimento=0;
  async function scriviCache(k,blob,caricato){await metti('cache',k,blob);await metti('indice',k,{dimensione:blob.size,uso:Date.now(),caricato:!!caricato});if(!cloud()?.inRipristino?.()&&Date.now()-ultimoSfoltimento>15000){ultimoSfoltimento=Date.now();await sfoltisci();}}
  async function eliminaCache(prefisso){for(const k of await chiavi('indice'))if(k===prefisso||String(k).startsWith(prefisso+'/')){await togli('cache',k).catch(()=>{});await togli('indice',k).catch(()=>{});}}
  async function segnaCaricato(k){const i=await leggi('indice',k).catch(()=>null);if(i){i.caricato=true;await metti('indice',k,i);}}
  async function sfoltisci(){
    const ks=await chiavi('indice');const voci=[];let totale=0;
    for(const k of ks){const i=await leggi('indice',k);if(!i)continue;voci.push([k,i]);totale+=Number(i.dimensione||0);}
    if(totale<=tetto())return;
    voci.sort((a,b)=>a[1].uso-b[1].uso);
    for(const [k,i] of voci){if(totale<=tetto())break;if(!i.caricato)continue;await togli('cache',k);await togli('indice',k);totale-=Number(i.dimensione||0);}
  }

  // ---------- operazioni ----------
  async function stato(){
    const out={ok:true,configured:true,available:true,path:'',defaultPath:'',freeBytes:null,totalBytes:null,archiveId:'',web:true,modalita:'memoria-browser'};
    try{const e=await navigator.storage?.estimate?.();if(e){out.totalBytes=e.quota||null;out.freeBytes=e.quota&&e.usage!=null?e.quota-e.usage:null;}}catch(_){}
    if(conCartella()){
      const h=await leggi('chiavi','radice').catch(()=>null);
      out.modalita='cartella';out.configured=!!h;out.path=h?h.name:'';
      out.available=!!(h&&await radice());
      const m=h&&out.available?await marcatore(h):null;out.archiveId=m?.archiveId||'';
    }else out.path='Memoria del browser su questo dispositivo';
    return out;
  }
  async function scegliCartella(){
    if(!conCartella())return {...await stato(),cancelled:false};
    let scelta;
    try{scelta=await window.showDirectoryPicker({id:'dossier-archivio',mode:'readwrite',startIn:'documents'});}
    catch(e){if(e&&e.name==='AbortError')return {ok:true,cancelled:true};throw e;}
    let r=scelta;
    if(!(await marcatore(scelta))&&scelta.name!==NOME_CARTELLA)r=await scelta.getDirectoryHandle(NOME_CARTELLA,{create:true});
    let m=await marcatore(r);
    if(!m){m={archiveId:'media_'+crypto.randomUUID(),createdAt:new Date().toISOString(),product:'Clinica Digitale'};const fh=await r.getFileHandle(MARCATORE,{create:true});const w=await fh.createWritable();await w.write(JSON.stringify(m,null,2));await w.close();}
    await metti('chiavi','radice',r);
    // i file gia' presenti nella memoria del browser passano nella cartella
    let spostati=0;
    for(const k of await chiavi('indice')){const b=await leggi('cache',k);if(b){try{await scriviCartella(r,String(k).split('/'),b);spostati++;}catch(_){}}}
    if(spostati){for(const k of await chiavi('indice')){await togli('cache',k).catch(()=>{});await togli('indice',k).catch(()=>{});}}
    setTimeout(()=>void allinea(),1500);
    return {...await stato(),cancelled:false,migratedFiles:spostati};
  }
  async function salva(kind,pid,owner,rel,blob){
    const segs=segmenti(kind,pid,owner,rel),k=segs.join('/');const c=cloud();
    const inRipristino=!!c?.inRipristino?.();
    let caricato=false;
    // durante un collegamento i file si salvano solo qui e partono verso il cloud subito dopo, in sottofondo
    if(!inRipristino&&c?.pronto?.()){
      let errore=null;
      for(let i=0;i<3&&!caricato;i++){try{await c.carica(kind,pid,owner,rel,blob);caricato=true;}catch(e){errore=e;await new Promise(r=>setTimeout(r,[2000,6000,15000][i]));}}
      if(!caricato)console.warn('Invio al cloud rinviato:',k,errore);
    }
    if(!caricato&&(inRipristino||c?.pronto?.()))await metti('attesa',k,{kind,pid,owner,rel,at:Date.now()});
    const r=await radice();
    if(r){await scriviCartella(r,segs,blob);}
    else{await scriviCache(k,blob,caricato);}
    if(!r&&!inRipristino&&conCartella())avvisaCartella();
    if(!caricato&&!inRipristino)setTimeout(()=>void riprovaAttese(),5000);
    return {ok:true,savedBytes:blob.size,archive:'ArchivioLocale',relativePath:String(rel||''),savedPath:k};
  }
  async function apri(kind,pid,owner,rel){
    const segs=segmenti(kind,pid,owner,rel),k=segs.join('/');
    const r=await radice();
    let f=r?await leggiCartella(r,segs):null;if(f)return f;
    f=await leggiCache(k);if(f)return f;
    const c=cloud();
    if(c?.pronto?.()){
      const b=await c.scarica(kind,pid,owner,rel);
      if(b){if(r)await scriviCartella(r,segs,b).catch(()=>{});else await scriviCache(k,b,true).catch(()=>{});return b;}
      return null;
    }
    if(conCartella()&&!r&&await leggi('chiavi','radice').catch(()=>null))throw Object.assign(new Error('La cartella “'+NOME_CARTELLA+'” non è collegata. Ricollegala per aprire il file.'),{codice:'media_archive_unavailable'});
    return null;
  }
  async function elimina(kind,pid,owner){
    const segs=segmenti(kind,pid,owner),k=segs.join('/');
    const r=await radice();if(r)await eliminaCartella(r,segs);
    await eliminaCache(k);
    for(const a of await chiavi('attesa'))if(String(a).startsWith(k+'/'))await togli('attesa',a).catch(()=>{});
    const c=cloud();if(c?.pronto?.())await c.eliminaProprietario(kind,pid,owner).catch(e=>console.warn('Eliminazione dal cloud rinviata:',e));
    return {ok:true};
  }

  async function eliminaLocale(kind,pid,owner){try{const segs=segmenti(kind,pid,owner),k=segs.join('/');const r=await radice();if(r)await eliminaCartella(r,segs);await eliminaCache(k);}catch(e){console.warn('Pulizia locale media rinviata:',e);}}

  // ---------- invii in sospeso (anche il passaggio dei DICOM dell'exe al nuovo formato) ----------
  let riprovaInCorso=false;
  async function riprovaAttese(){
    const c=cloud();if(riprovaInCorso||!c?.pronto?.()||c?.inRipristino?.())return;
    // subito dopo l'accesso la chiave dell'archivio puo' non essere ancora pronta: si riprova al giro successivo
    if(c.chiaveDisponibile&&!(await c.chiaveDisponibile()))return;
    riprovaInCorso=true;
    let fatti=0,errori=0;
    try{
      const lista=await chiavi('attesa');const totale=lista.length;
      if(totale)mostra(`Invio di DICOM e immagini al cloud: 0 / ${totale}`);
      let indice=0;
      const lavora=async()=>{while(indice<lista.length&&errori<20){const k=lista[indice++];const a=await leggi('attesa',k);if(!a)continue;const segs=String(k).split('/');const r=await radice();let b=r?await leggiCartella(r,segs):null;if(!b)b=await leggi('cache',k).catch(()=>null);if(!b){await togli('attesa',k);fatti++;continue;}
        let ok=false;for(let t=0;t<3&&!ok;t++){try{await c.carica(a.kind,a.pid,a.owner,a.rel,b);ok=true;}catch(e){if(t===2){console.warn('Invio media rinviato:',k,e);errori++;}else await new Promise(x=>setTimeout(x,[3000,10000][t]));}}
        if(ok){await togli('attesa',k);await segnaCaricato(k);fatti++;mostra(`Invio di DICOM e immagini al cloud: ${fatti} / ${totale}`);}}};
      await Promise.all([lavora(),lavora(),lavora(),lavora()]);
      const restano=(await chiavi('attesa')).length;
      if(!restano&&c.inPassaggio?.()){try{await c.passaggioTerminato();mostra('DICOM e immagini sono ora nel cloud come file separati.',true);}catch(e){console.warn('Chiusura del passaggio rinviata:',e);}}
      else if(totale)mostra(restano?`Invio al cloud: ${fatti} file inviati, ${restano} in attesa (nuovo tentativo tra poco)`:`Invio al cloud completato: ${fatti} file`,true);
      if(!restano)await sfoltisci().catch(()=>{});
    }finally{riprovaInCorso=false;}
  }

  // ---------- copia completa nella cartella del computer ----------
  let allineaInCorso=false;
  function elencoFile(studi,immagini){
    const out=[];
    for(const s of studi||[])if(s.storageMode==='managed')for(const f of s.files||[])out.push({kind:'dicom',pid:s.profileId,owner:s.id,rel:f.relativePath||f.name,size:Number(f.size||0)});
    for(const i of immagini||[])if(i.storageMode==='managed')out.push({kind:'image',pid:i.profileId,owner:i.id,rel:i.storagePath||i.name,size:Number(i.size||0)});
    return out.filter(x=>x.pid&&x.owner&&x.rel);
  }
  async function allinea(){
    if(allineaInCorso)return;const c=cloud();const r=await radice();if(!r||!c?.pronto?.()||c?.inRipristino?.()||typeof DossierDB==='undefined')return;
    allineaInCorso=true;let fatti=0,scaricati=0;
    try{
      const lista=elencoFile(await DossierDB.getAll('dicomStudies').catch(()=>[]),await DossierDB.getAll('mediaAttachments').catch(()=>[]));
      for(const x of lista){
        let segs;try{segs=segmenti(x.kind,x.pid,x.owner,x.rel);}catch(_){continue;}
        const f=await leggiCartella(r,segs);
        if(!f||(x.size&&f.size!==x.size)){try{const b=await c.scarica(x.kind,x.pid,x.owner,x.rel);if(b){await scriviCartella(r,segs,b);scaricati++;}}catch(e){console.warn('Copia nella cartella rinviata:',e);}}
        fatti++;if(scaricati)mostra(`Archivio “${NOME_CARTELLA}”: ${fatti} / ${lista.length} file controllati, ${scaricati} copiati dal cloud`);
      }
    }finally{allineaInCorso=false;if(scaricati)mostra(`Archivio “${NOME_CARTELLA}” allineato: ${scaricati} file copiati dal cloud`,true);}
  }
  let barra=null,chiudiBarra=null;
  function mostra(testo,fine){
    if(!barra){barra=document.createElement('div');barra.setAttribute('role','status');barra.style.cssText='position:fixed;left:16px;bottom:16px;z-index:9999;max-width:min(420px,calc(100vw - 32px));background:#fff;border:1px solid #cfe3dc;border-radius:12px;padding:10px 14px;font:13px/1.4 system-ui,sans-serif;color:#1f3b34;box-shadow:0 6px 24px rgba(0,0,0,.12)';document.body.appendChild(barra);}
    barra.textContent=testo;clearTimeout(chiudiBarra);if(fine)chiudiBarra=setTimeout(()=>{barra?.remove();barra=null;},6000);
  }

  // ---------- richiesta di scelta o ricollegamento della cartella ----------
  let avvisoMostrato=false;
  function avvisaCartella(forza=false){
    if(!forza&&(avvisoMostrato||cloud()?.inRipristino?.()))return Promise.resolve(false);
    if(!conCartella()||document.getElementById('mediaCartellaAvviso'))return Promise.resolve(false);
    try{if(!window.DossierSecurity?.currentUser?.())return Promise.resolve(false);}catch(_){return Promise.resolve(false);}
    avvisoMostrato=true;
    return new Promise(fine=>leggi('chiavi','radice').then(h=>{
      const nuovo=!h;const o=document.createElement('div');o.id='mediaCartellaAvviso';
      o.style.cssText='position:fixed;inset:0;z-index:10000;background:rgba(15,40,34,.45);display:flex;align-items:center;justify-content:center;padding:16px';
      const testo=nuovo?`Il Dossier tiene DICOM e immagini nella cartella <strong>${NOME_CARTELLA}</strong>. Scegli dove crearla: ti consigliamo <strong>Documenti</strong>. Va fatto una sola volta su questo computer.`:`Il browser chiede di nuovo il permesso per la cartella <strong>${NOME_CARTELLA}</strong>. Se compare la scelta, seleziona <strong>Consenti a ogni visita</strong>.`;
      const extra=forza?'<br><br>Il collegamento all’archivio cloud parte solo dopo che la cartella è stata scelta.':'';
      o.innerHTML=`<div style="background:#fff;border-radius:16px;max-width:520px;width:100%;padding:22px;font:15px/1.5 system-ui,sans-serif;color:#1f3b34;box-shadow:0 12px 40px rgba(0,0,0,.25)"><h3 style="margin:0 0 8px;font-size:19px">${nuovo?'Cartella dell’archivio su questo computer':'Ricollega la cartella dell’archivio'}</h3><p style="margin:0 0 10px">${testo}${extra}</p><p data-esito style="margin:0 0 12px;color:#9b1c1c;font-weight:600;display:none"></p><div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap"><button type="button" data-dopo style="padding:9px 14px;border-radius:10px;border:1px solid #cfd8d5;background:#fff;cursor:pointer">${forza?'Annulla':'Più tardi'}</button><button type="button" data-ok style="padding:9px 14px;border-radius:10px;border:0;background:#0f6f5c;color:#fff;font-weight:600;cursor:pointer">${nuovo?'Scegli dove crearla':'Ricollega'}</button></div></div>`;
      document.body.appendChild(o);
      const esito=o.querySelector('[data-esito]');
      o.querySelector('[data-dopo]').onclick=()=>{o.remove();fine(false);};
      o.querySelector('[data-ok]').onclick=async()=>{
        let ok=false;
        try{if(nuovo){const r=await scegliCartella();ok=!r?.cancelled&&!!(await radice());}else{ok=!!(await radice({chiedi:true}));if(ok)setTimeout(()=>void allinea(),1000);}}
        catch(e){esito.textContent='Cartella non collegata: '+(e?.message||e);esito.style.display='block';return;}
        if(!ok){esito.textContent='Nessuna cartella scelta. Clicca di nuovo il pulsante verde per sceglierla'+(forza?', oppure Annulla per non collegare l’archivio.':'.');esito.style.display='block';return;}
        o.remove();fine(true);};
    }).catch(()=>fine(false)));
  }
  // Prima di un collegamento o ripristino dal cloud: su computer la cartella e' obbligatoria,
  // cosi' DICOM e immagini finiscono direttamente li'. Restituisce false se l'utente rinuncia.
  async function assicuraCartella(){if(!conCartella())return true;const h=await leggi('chiavi','radice').catch(()=>null);if(h&&await radice())return true;return await avvisaCartella(true);}
  async function verificaCartella(){
    if(!conCartella())return;const h=await leggi('chiavi','radice').catch(()=>null);
    if(!h){if(cloud()?.pronto?.())avvisaCartella();return;}
    if(await radice()){void allinea();return;}
    avvisaCartella();
  }

  // ---------- risposta alle richieste dell'interfaccia ----------
  const json=(stato,obj)=>new Response(JSON.stringify(obj),{status:stato,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  const sessioni=new Map();
  async function sessioneValida(req,chiediMotore){
    const t=req.headers.get('x-dossier-session')||'';if(!t)return false;
    const scad=sessioni.get(t);if(scad&&scad>Date.now())return true;
    const r=await chiediMotore(new Request('http://127.0.0.1:8896/api/auth/preferences',{headers:{'X-Dossier-Session':t}}));
    if(r.status===200){sessioni.set(t,Date.now()+20000);return true;}return false;
  }
  async function gestisci(req,chiediMotore){
    const u=new URL(req.url),p=u.pathname,q=u.searchParams;
    try{
      if(p==='/api/media/archive/select'){const out=await scegliCartella();if(!(await sessioneValida(req,chiediMotore)))return json(401,{ok:false,error:'Sessione scaduta',code:'auth_required'});return json(200,out);}
      if(!(await sessioneValida(req,chiediMotore)))return json(401,{ok:false,error:'Sessione scaduta',code:'auth_required'});
      if(p==='/api/media/archive/status')return json(200,await stato());
      if(p==='/api/media/store'){const rel=q.get('path')||'';if(!rel)return json(400,{ok:false,error:'Nome file archivio mancante',code:'media_store'});const blob=await req.blob();return json(200,await salva(q.get('kind'),q.get('profileId'),q.get('ownerId'),rel,blob));}
      if(p==='/api/media/file'){const rel=q.get('path')||'';if(!rel)return json(400,{ok:false,error:'Nome file archivio mancante',code:'media_file'});const f=await apri(q.get('kind'),q.get('profileId'),q.get('ownerId'),rel);if(!f)return json(404,{ok:false,error:'File dell’Archivio gestito non disponibile',code:'media_missing'});return new Response(f,{status:200,headers:{'Content-Type':tipoMime(rel),'Cache-Control':'no-store'}});}
      if(p==='/api/media/delete'){const d=await req.json().catch(()=>({}));return json(200,await elimina(d.kind,d.profileId,d.ownerId));}
      return json(404,{ok:false,error:'Funzione archivio non disponibile',code:'media_unknown'});
    }catch(e){
      if(e?.codice==='media_archive_unavailable'){avvisaCartella();return json(503,{ok:false,error:e.message,code:'media_archive_unavailable'});}
      console.error('Archivio media:',e);return json(400,{ok:false,error:String(e?.message||e),code:'media_error'});
    }
  }

  setInterval(()=>{void riprovaAttese();},60000);
  // controllo dopo l'accesso: ogni 30 secondi finche' non trova un utente collegato
  const controllo=setInterval(()=>{try{if(window.DossierSecurity?.currentUser?.()){clearInterval(controllo);setTimeout(()=>void verificaCartella(),8000);}}catch(_){}},30000);
  window.DossierMediaWeb={_chiaviCache:()=>chiavi('indice'),eliminaLocale,assicuraCartella,gestisci,stato,scegliCartella,allinea,riprovaAttese,verificaCartella,elencoFile,_cache:{leggiCache,scriviCache,sfoltisci}};
})();
