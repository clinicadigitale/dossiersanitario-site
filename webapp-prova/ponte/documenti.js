/* File originali dei referti nella webapp.
   Con l'archivio cloud nel formato nuovo (files-v1 dei documenti) ogni referto e' un file cifrato
   separato nel cloud (DossierCloud.documenti). Sui dispositivi:
   - computer: tiene una copia di tutti i file, come prima;
   - telefono e tablet: tengono solo i dati; un referto si scarica quando serve e non resta salvato,
     salvo che la persona scelga "Archivio completo su questo telefono".
   Togliere un file dalla memoria del telefono non e' mai una modifica da sincronizzare: si scrive
   sempre con sync:false, e il campo fileBlob non fa parte dei dati sincronizzati (db.js, cloud.js). */
(function(){
  'use strict';
  const NOME_DB='dossier-documenti-web';
  const CHIAVE_COMPLETO='dossierArchivioCompletoTelefono';
  let dbp=null;
  function db(){
    if(!dbp)dbp=new Promise((ok,ko)=>{const r=indexedDB.open(NOME_DB,1);
      r.onupgradeneeded=()=>{const d=r.result;if(!d.objectStoreNames.contains('caricati'))d.createObjectStore('caricati');};
      r.onsuccess=()=>ok(r.result);r.onerror=()=>ko(r.error);});
    return dbp;
  }
  async function op(mode,fn){const d=await db();return new Promise((ok,ko)=>{const t=d.transaction('caricati',mode);const req=fn(t.objectStore('caricati'));t.oncomplete=()=>ok(req?req.result:undefined);t.onerror=()=>ko(t.error);t.onabort=()=>ko(t.error);});}
  // registro dei file gia' nel cloud, per archivio: cambiando archivio si riparte da zero
  const chiaveReg=id=>`${window.DossierCloud?.documenti?.archivioCorrente?.()||'nessuno'}|${id}`;
  const leggiCaricato=id=>op('readonly',s=>s.get(chiaveReg(id))).catch(()=>null);
  const segnaCaricato=(id,rel)=>op('readwrite',s=>s.put(String(rel),chiaveReg(id)));
  const togliCaricato=id=>op('readwrite',s=>s.delete(chiaveReg(id))).catch(()=>{});

  const telefono=()=>!!window.FotoDocumento?.isTelefono?.();
  const cloud=()=>window.DossierCloud?.documenti||null;
  const attivo=()=>!!cloud()?.attivo?.();
  const pronto=()=>!!cloud()?.pronto?.();
  function completo(){try{return localStorage.getItem(CHIAVE_COMPLETO)==='1';}catch(_){return false;}}
  const leggero=()=>telefono()&&attivo()&&!completo();
  const tieneFile=()=>!leggero();
  const relDi=doc=>String(doc?.hash||'originale');
  const blobOk=b=>b instanceof Blob&&b.size>0;
  const spazioFinito=e=>e&&(e.name==='QuotaExceededError'||/quota|spazio/i.test(String(e.message||'')));
  const errore=(testo,codice)=>Object.assign(new Error(testo),{codice});

  // ---------- invio dei file al cloud ----------
  async function assicuraCaricato(doc,{verifica=false}={}){
    if(!pronto()||!doc?.id||!blobOk(doc.fileBlob))return false;
    const rel=relDi(doc);const segnato=(await leggiCaricato(doc.id))===rel;
    if(segnato&&!verifica)return true;
    // gia' nel cloud (inviato da un altro dispositivo o in un giro precedente): non si reinvia
    if(await cloud().esiste(doc.id,rel,doc.fileBlob.size)){if(!segnato)await segnaCaricato(doc.id,rel);return true;}
    if(!navigator.onLine)throw errore('Connessione assente: il referto verrà inviato più tardi.','doc_offline');
    let ultimo=null;
    for(let t=0;t<3;t++){try{await cloud().carica(doc.id,rel,doc.fileBlob);await segnaCaricato(doc.id,rel);return true;}catch(e){ultimo=e;await new Promise(r=>setTimeout(r,[1500,5000,12000][t]));}}
    throw errore('Invio del referto al cloud non riuscito: '+(ultimo?.message||ultimo),'doc_upload');
  }
  let invioInCorso=false;
  async function caricaInAttesa(){
    if(invioInCorso||!pronto()||cloud()?.inRipristino?.()||typeof DossierDB==='undefined')return;invioInCorso=true;
    try{
      if(!navigator.onLine)return;
      // una volta al giorno si controlla davvero nel cloud che i file segnati come inviati ci siano ancora
      const chiaveVer='dossierVerificaReferti|'+(cloud()?.archivioCorrente?.()||'');let verifica=false;try{verifica=Date.now()-Number(localStorage.getItem(chiaveVer)||0)>24*3600*1000;}catch(_){}
      const docs=(await DossierDB.getAll('documents').catch(()=>[])).filter(d=>blobOk(d.fileBlob));
      const cestino=(await DossierDB.getAll('trash').catch(()=>[])).map(t=>t?.payload?.document).filter(d=>d&&blobOk(d.fileBlob));
      let errori=0;for(const doc of [...docs,...cestino])await assicuraCaricato(doc,{verifica}).catch(e=>{errori++;console.warn('Referto non ancora inviato:',doc.id,e);});
      if(verifica&&!errori){try{localStorage.setItem(chiaveVer,String(Date.now()));}catch(_){}}
    }finally{invioInCorso=false;}
  }

  // ---------- lettura di un referto (locale o dal cloud) ----------
  async function file(doc,{salva=true}={}){
    if(blobOk(doc?.fileBlob))return doc.fileBlob;
    const fresco=doc?.id?await DossierDB.get('documents',doc.id).catch(()=>null):null;
    if(blobOk(fresco?.fileBlob))return fresco.fileBlob;
    const base=fresco||doc;
    if(!pronto())throw errore('Il file originale di questo referto non è su questo dispositivo e l’archivio cloud non è collegato.','doc_missing');
    if(!navigator.onLine)throw errore('Per aprire questo referto serve la connessione a internet: il file si trova nell’archivio cloud.','doc_offline');
    const b=await cloud().scarica(base.id,relDi(base));
    if(!b)throw errore('Il file originale di questo referto non è stato trovato nell’archivio cloud.','doc_notfound');
    const out=new Blob([b],{type:base.mimeType||b.type||'application/octet-stream'});
    if(salva&&tieneFile()&&fresco&&!blobOk(fresco.fileBlob))await salvaSeInvariato(fresco,out);
    return out;
  }
  const stessoRecord=(a,b)=>!!a&&!!b&&String(a._syncMeta?.eventId||'')===String(b._syncMeta?.eventId||'')&&String(a.hash||'')===String(b.hash||'')&&String(a.updatedAt||'')===String(b.updatedAt||'');
  async function salvaSeInvariato(prima,blob){
    const ora=await DossierDB.get('documents',prima.id).catch(()=>null);
    if(!stessoRecord(prima,ora)||blobOk(ora.fileBlob))return false;
    try{await DossierDB.put('documents',{...ora,fileBlob:blob},{sync:false,audit:false});await segnaCaricato(ora.id,relDi(ora));return true;}
    catch(e){if(spazioFinito(e))throw errore('Spazio insufficiente su questo dispositivo per salvare il referto.','doc_quota');throw e;}
  }
  // file di piu' referti, con avviso di avanzamento; restituisce Map id -> Blob
  async function fileDi(docs,{titolo='Preparazione dei referti'}={}){
    const out=new Map();const lista=(docs||[]).filter(Boolean);let fatti=0;const daScaricare=lista.filter(d=>!blobOk(d.fileBlob)).length;
    for(const d of lista){
      if(!blobOk(d.fileBlob)){mostra(`${titolo}: ${fatti+1} / ${daScaricare} referti dal cloud`);}
      try{out.set(d.id,await file(d));}catch(e){out.set(d.id,null);console.warn('Referto non disponibile:',d.id,e);}
      if(!blobOk(d.fileBlob))fatti++;
    }
    const mancanti=[...out.values()].filter(x=>!x).length;
    if(daScaricare||mancanti)mostra(mancanti?`${titolo}: ${mancanti} referti non disponibili (serve la connessione o il file non è nel cloud)`:`${titolo}: completata`,true);
    return out;
  }
  // il referto ha un file originale (qui o nel cloud)?
  function haFile(doc){return blobOk(doc?.fileBlob)||!!(attivo()&&doc&&(doc.hash||doc.size));}

  // ---------- passaggio di un archivio esistente al formato nuovo ----------
  async function haTuttiIFile(){
    // il cestino non conta: un elemento del cestino gia' privo del file (vecchio formato) resta com'e'
    if(typeof DossierDB==='undefined')return false;
    const docs=await DossierDB.getAll('documents').catch(()=>null);if(!docs)return false;
    return !docs.some(d=>!blobOk(d.fileBlob));
  }
  let passaggioInCorso=false;
  async function passaggio(){
    const c=cloud();if(passaggioInCorso||!c?.inPassaggio?.()||!pronto()||!navigator.onLine)return false;passaggioInCorso=true;
    try{
      const docs=(await DossierDB.getAll('documents')).filter(d=>blobOk(d.fileBlob));
      const cestino=(await DossierDB.getAll('trash')).map(t=>t?.payload?.document).filter(d=>d&&blobOk(d.fileBlob));
      const tutti=[...docs,...cestino];let fatti=0,errori=0;let i=0;
      mostra(`Invio dei referti al cloud come file separati: 0 / ${tutti.length}`);
      const lavora=async()=>{while(i<tutti.length&&errori<10){const d=tutti[i++];try{await assicuraCaricato(d);fatti++;}catch(e){errori++;console.warn('Passaggio referto rinviato:',d.id,e);}mostra(`Invio dei referti al cloud come file separati: ${fatti} / ${tutti.length}`);}};
      await Promise.all([lavora(),lavora(),lavora()]);
      if(errori){mostra(`Invio dei referti: ${fatti} inviati, ${tutti.length-fatti} da riprovare più tardi`,true);return false;}
      // controllo finale sui referti di adesso (ne puo' essere arrivato uno nuovo durante l'invio)
      for(const d of await DossierDB.getAll('documents')){if(!blobOk(d.fileBlob)){mostra('Invio dei referti: manca il file di un referto su questo dispositivo, passaggio rinviato',true);return false;}if((await leggiCaricato(d.id))!==relDi(d)){try{await assicuraCaricato(d);}catch(e){mostra('Invio dei referti: da riprovare più tardi',true);return false;}}}
      await c.passaggioTerminato();
      mostra('Aggiornamento completato: i referti sono ora nel cloud come file separati.',true);try{await window.DossierCloud?.loadSettings?.();}catch(_){}
      setTimeout(()=>void dopoSync(),3000);
      return true;
    }finally{passaggioInCorso=false;}
  }

  // ---------- telefono leggero: toglie i file gia' al sicuro nel cloud ----------
  let alleggerimentoInCorso=false;
  async function alleggerisci(){
    if(alleggerimentoInCorso||!leggero()||cloud()?.inRipristino?.())return 0;alleggerimentoInCorso=true;let tolti=0;
    try{
      for(const doc of await DossierDB.getAll('documents').catch(()=>[])){
        if(!blobOk(doc.fileBlob))continue;
        try{await assicuraCaricato(doc);}catch(e){continue;}
        const fresco=await DossierDB.get('documents',doc.id).catch(()=>null);if(!stessoRecord(doc,fresco)||!blobOk(fresco.fileBlob))continue;
        const {fileBlob,...senza}=fresco;await DossierDB.put('documents',senza,{sync:false,audit:false});tolti++;
      }
      for(const t of await DossierDB.getAll('trash').catch(()=>[])){
        const d=t?.payload?.document;if(!d||!('fileBlob' in d))continue;
        if(blobOk(d.fileBlob)){try{await assicuraCaricato(d);}catch(e){continue;}}
        const fresca=await DossierDB.get('trash',t.id).catch(()=>null);if(!fresca?.payload?.document||String(fresca._syncMeta?.eventId||'')!==String(t._syncMeta?.eventId||''))continue;
        const {fileBlob,...senza}=fresca.payload.document;await DossierDB.put('trash',{...fresca,payload:{...fresca.payload,document:senza}},{sync:false,audit:false});tolti++;
      }
    }finally{alleggerimentoInCorso=false;}
    return tolti;
  }

  // ---------- dispositivi che tengono tutti i file: scaricano quelli che mancano ----------
  const nonTrovati=new Map();
  const daRiprovare=id=>{const x=nonTrovati.get(String(id));return !x||Date.now()>=x.prossimo;};
  const segnaNonTrovato=id=>{const x=nonTrovati.get(String(id))||{attesa:5*60*1000};nonTrovati.set(String(id),{attesa:Math.min(x.attesa*2,6*3600*1000),prossimo:Date.now()+x.attesa});};
  let allineaInCorso=null;
  function allinea(opz){if(allineaInCorso)return allineaInCorso;allineaInCorso=allineaGiro(opz).finally(()=>{allineaInCorso=null;});return allineaInCorso;}
  async function allineaGiro({avviso=true}={}){
    if(!tieneFile()||!attivo()||!pronto()||cloud()?.inRipristino?.()||!navigator.onLine)return {scaricati:0,mancanti:0};
    let scaricati=0,mancanti=0;
    try{
      const docs=(await DossierDB.getAll('documents').catch(()=>[])).filter(d=>!blobOk(d.fileBlob)&&(avviso==='sempre'||daRiprovare(d.id)));
      const cestino=(await DossierDB.getAll('trash').catch(()=>[])).filter(t=>t?.payload?.document&&!blobOk(t.payload.document.fileBlob)&&(t.payload.document.hash||t.payload.document.size)&&(avviso==='sempre'||daRiprovare(t.payload.document.id)));
      const totale=docs.length+cestino.length;if(!totale)return {scaricati:0,mancanti:0};
      let i=0;const lista=[...docs.map(d=>({tipo:'doc',d})),...cestino.map(t=>({tipo:'cestino',t}))];
      const lavora=async()=>{while(i<lista.length){const x=lista[i++];
        try{
          if(x.tipo==='doc'){if(!tieneFile())continue;await file(x.d);nonTrovati.delete(String(x.d.id));scaricati++;}
          else{if(!tieneFile())continue;const d=x.t.payload.document;const b=await cloud().scarica(d.id,relDi(d));if(!b){mancanti++;segnaNonTrovato(d.id);continue;}
            const fresco=await DossierDB.get('trash',x.t.id).catch(()=>null);if(!fresco?.payload?.document||String(fresco._syncMeta?.eventId||'')!==String(x.t._syncMeta?.eventId||'')||!tieneFile())continue;
            await DossierDB.put('trash',{...fresco,payload:{...fresco.payload,document:{...fresco.payload.document,fileBlob:new Blob([b],{type:d.mimeType||b.type||'application/octet-stream'})}}},{sync:false,audit:false});scaricati++;}
        }catch(e){if(e?.codice==='doc_quota'||spazioFinito(e))throw e;mancanti++;if(x.tipo==='doc')segnaNonTrovato(x.d.id);console.warn('Referto non scaricato:',e);}
        if(avviso)mostra(`Scaricamento dei referti dal cloud: ${scaricati} / ${totale}`);}};
      await Promise.all([lavora(),lavora(),lavora()]);
      if(avviso&&(scaricati||avviso==='sempre'))mostra(scaricati?`Referti scaricati dal cloud: ${scaricati}${mancanti?` · ${mancanti} non disponibili per ora`:''}`:`Referti dal cloud: ${mancanti} non disponibili per ora`,true);
    }finally{}
    return {scaricati,mancanti};
  }

  async function dopoSync(){
    try{
      if(!pronto())return;
      if(cloud()?.inPassaggio?.()){await passaggio();return;}
      if(!attivo())return;
      await caricaInAttesa();
      if(leggero())await alleggerisci();
      else{await allinea();if(telefono()&&completo()){const m=await window.DossierMediaWeb?.completaTelefono?.();if(m?.errore)throw Object.assign(m.errore,{codice:'doc_quota'});}}
    }catch(e){if(e?.codice==='doc_quota'&&telefono()&&completo())await annullaCompleto(true);else console.warn('Gestione dei referti rinviata:',e);}
  }

  // ---------- archivio completo su questo telefono ----------
  function documentoSize(d){return Number(d?.size||(d?.fileBlob instanceof Blob?d.fileBlob.size:0)||0);}
  async function spazioNecessario(){
    const docs=await DossierDB.getAll('documents').catch(()=>[]);const cestino=await DossierDB.getAll('trash').catch(()=>[]);
    const studi=await DossierDB.getAll('dicomStudies').catch(()=>[]);const immagini=await DossierDB.getAll('mediaAttachments').catch(()=>[]);
    let n=docs.reduce((s,d)=>s+documentoSize(d),0)+cestino.reduce((s,t)=>s+documentoSize(t?.payload?.document),0);
    n+=studi.filter(s=>s.storageMode==='managed').reduce((s,x)=>s+(Number(x.totalBytes||0)||(x.files||[]).reduce((a,f)=>a+Number(f.size||0),0)),0);
    n+=immagini.filter(i=>i.storageMode==='managed').reduce((s,x)=>s+Number(x.size||0),0);
    return Math.ceil(n*1.1);
  }
  function formatoBytes(n){n=Number(n)||0;if(n<1024*1024)return `${Math.max(1,Math.round(n/1024))} KB`;if(n<1024*1024*1024)return `${(n/1024/1024).toFixed(n<10*1024*1024?1:0).replace('.',',')} MB`;return `${(n/1024/1024/1024).toFixed(1).replace('.',',')} GB`;}
  async function annullaCompleto(perSpazio){
    try{localStorage.removeItem(CHIAVE_COMPLETO);}catch(_){}
    await alleggerisci().catch(()=>{});
    await window.DossierMediaWeb?.svuotaCache?.().catch?.(()=>{});
    mostra('',true);
    if(perSpazio)alert('Spazio insufficiente: non è possibile scaricare l’archivio completo su questo telefono.\n\nIl telefono resta nella modalità leggera: i referti si scaricano dal cloud quando li apri.');
    window.dispatchEvent(new Event('dossier-archivio-completo'));
  }
  async function impostaCompleto(attiva){
    if(!telefono())return false;
    if(!attiva){
      if(!confirm('Togliere dal telefono i file dei referti, dei DICOM e delle immagini?\n\nRestano nell’archivio cloud e si scaricano quando li apri.'))return false;
      await annullaCompleto(false);return true;
    }
    if(!attivo()||!pronto()){alert('L’archivio completo è disponibile solo con l’archivio cloud collegato.');return false;}
    const serve=await spazioNecessario();
    if(!confirm(`Per scaricare l’archivio completo su questo telefono serve circa ${formatoBytes(serve)} di spazio libero.\n\nProsegui solo se il telefono ha questo spazio.`))return false;
    try{localStorage.setItem(CHIAVE_COMPLETO,'1');}catch(_){}
    window.dispatchEvent(new Event('dossier-archivio-completo'));
    try{
      try{await navigator.storage?.persist?.();}catch(_){}
      const r=await allinea({avviso:'sempre'});
      const m=await window.DossierMediaWeb?.completaTelefono?.();
      if(m?.errore)throw m.errore;
      mostra(`Archivio completo su questo telefono${r.mancanti||m?.mancanti?' (alcuni file non sono disponibili nel cloud)':''}.`,true);
      return true;
    }catch(e){
      if(e?.codice==='doc_quota'||spazioFinito(e)){await annullaCompleto(true);return false;}
      await annullaCompleto(false);mostra('Scaricamento interrotto: '+(e?.message||e)+'. Il telefono resta leggero.',true);return false;
    }
  }

  // ---------- eliminazione definitiva ----------
  async function eliminaDalCloud(doc){
    if(!doc?.id||!pronto())return;
    if(await DossierDB.get('documents',doc.id).catch(()=>null))return;
    if((await DossierDB.getAll('trash').catch(()=>[])).some(t=>String(t?.payload?.document?.id||'')===String(doc.id)))return;
    await togliCaricato(doc.id);await cloud().elimina(doc.id).catch(e=>console.warn('File del referto non eliminato dal cloud:',e));
  }

  // ---------- avviso in basso ----------
  let barra=null,chiudiBarra=null;
  function mostra(testo,fine){
    if(!testo){barra?.remove();barra=null;return;}
    if(!barra){barra=document.createElement('div');barra.setAttribute('role','status');barra.style.cssText='position:fixed;left:16px;bottom:70px;z-index:9999;max-width:min(420px,calc(100vw - 32px));background:#fff;border:1px solid #cfe3dc;border-radius:12px;padding:10px 14px;font:13px/1.4 system-ui,sans-serif;color:#1f3b34;box-shadow:0 6px 20px rgba(0,0,0,.12)';document.body.appendChild(barra);}
    barra.textContent=testo;clearTimeout(chiudiBarra);if(fine)chiudiBarra=setTimeout(()=>{barra?.remove();barra=null;},6000);
  }

  setInterval(()=>{try{if(window.DossierSecurity?.currentUser?.())void dopoSync();}catch(_){}},5*60*1000);
  window.DossierDocumentiWeb={attivo,leggero,tieneFile,completo,telefono,haFile,file,fileDi,assicuraCaricato,caricaInAttesa,haTuttiIFile,passaggio,alleggerisci,allinea,dopoSync,spazioNecessario,formatoBytes,impostaCompleto,eliminaDalCloud,_leggiCaricato:leggiCaricato};
})();
