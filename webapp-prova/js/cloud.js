'use strict';

const DossierCloud = (() => {
  const API='http://127.0.0.1:8896/api/cloud';
  const CLIENT_REV='r41-sync-readfix-firstuse';
  const ROOT_FOLDER='Dossier Sanitario Locale';
  const MAX_PROCESSED=50000;
  const AUTO_SYNC_INTERVAL_MS=30*60*1000;
  const AUTO_SYNC_START_DELAY_MS=5000;
  const FAST_PUSH_DEBOUNCE_MS=1800;
  const FAST_REMOTE_POLL_INTERVAL_MS=12000;
  const FAST_REMOTE_RETRY_MS=20000;
  const SNAPSHOT_MAINTENANCE_DELAY_MS=30*60*1000;
  const REMOTE_REMINDER_START_DELAY_MS=5000;
  const REMOTE_REMINDER_INTERVAL_MS=30*60*1000;
  const REMOTE_REMINDER_SNOOZE_KEY='dossierCloudRemoteSyncRemindAfterV9';
  const SNAPSHOT_MAX_AGE_MS=7*24*60*60*1000;
  const SNAPSHOT_EVENT_THRESHOLD=50;
  const MAX_SNAPSHOTS=5;
  const RECOVERY_SAFE_CUTOFF_MS=Date.parse('2026-08-28T16:49:00.000Z');
  const RECOVERY_SAFE_LAST_BATCH='batch23_2026-08-28T16-48-01-432Z_2d29c27e-d2f2-4482-a87e-df72027ea26c';
  const CHANGE_DOWNLOAD_CONCURRENCY=4;
  let settings=null;
  let syncTimer=null;
  let fastPushTimer=null;
  let fastRemoteTimer=null;
  let snapshotMaintenanceTimer=null;
  let remoteReminderTimer=null;
  let remoteReminderVisible=false;
  let running=false;
  let onlineListenerBound=false;
  let fastSyncListenerBound=false;
  let currentSyncPromise=null;
  let mediaPreferenceWrite=Promise.resolve();
  let recoveryInProgress=false;
  const TAB_ID=`tab_${crypto.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2)}`;
  const SYNC_LEASE_KEY='dossierCloudSyncLeaseV2';
  const SYNC_LEASE_MS=90*1000;
  let syncLeaseTimer=null;
  const PROVIDERS={mega:{label:'MEGA',security:'Il Dossier cifra i dati prima del trasferimento. MEGA aggiunge la propria protezione lato servizio ed è la scelta consigliata quando si privilegia la riservatezza.'},drive:{label:'Google Drive',security:'Il Dossier cifra i dati prima del trasferimento. Google Drive protegge inoltre i dati durante il trasferimento e l’archiviazione sul servizio.'},iclouddrive:{label:'Apple iCloud',security:'Il Dossier cifra i dati prima del trasferimento. Le ulteriori protezioni iCloud dipendono dalle impostazioni di sicurezza dell’account Apple.'}};
  const MEGA_REFERRAL_URL='';
  const MEGA_SIGNUP_FALLBACK='https://mega.io/';
  let selectedProvider=localStorage.getItem('dossierCloudProvider')||'mega';
  if(!PROVIDERS[selectedProvider])selectedProvider='mega';

  const esc=value=>String(value??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));
  const uid=(prefix='id')=>`${prefix}_${crypto.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2)}`;
  const b64=bytes=>{let s='';const a=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);for(let i=0;i<a.length;i+=0x8000)s+=String.fromCharCode(...a.subarray(i,i+0x8000));return btoa(s);};
  const unb64=text=>{let value=String(text||'').replace(/-/g,'+').replace(/_/g,'/');while(value.length%4)value+='=';const s=atob(value);return Uint8Array.from(s,c=>c.charCodeAt(0));};
  const b64url=bytes=>b64(bytes).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  const normalizeRecovery=value=>String(value||'').replace(/[^A-Za-z0-9_-]/g,'');
  function recoveryCandidates(value){
    let text=String(value||'').trim();
    const labelled=text.match(/CHIAVE\s*:\s*([A-Za-z0-9_-]+)/i);if(labelled)text=labelled[1];
    text=text.replace(/\s+/g,'');
    const candidates=[];if(text)candidates.push(text);
    if(text.includes('-')){
      let raw='';let i=0;
      while(i<text.length){for(let n=0;n<5&&i<text.length;n++)raw+=text[i++];if(i<text.length&&text[i]==='-')i++;}
      if(raw&&raw!==text)candidates.push(raw);
    }
    return [...new Set(candidates.map(normalizeRecovery).filter(Boolean))];
  }
  function decodeRecoveryKey(value){
    for(const candidate of recoveryCandidates(value)){try{const raw=unb64(candidate);if(raw.length===32)return raw;}catch{}}
    return null;
  }
  const formatRecovery=value=>String(value||'').match(/.{1,5}/g)?.join('-')||'';
  const deviceId=()=>DossierSecurity.currentDevice()?.id||'device_local';
  const userId=()=>DossierSecurity.currentUser()?.id||'unknown';
  const safePart=value=>String(value||'').replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,80);

  function italianCloudError(error){
    const raw=String(error?.message||error||'Errore cloud non specificato').trim();
    const read=raw.match(/Can't read the data of ['"]([^'"]+)['"]/i);
    if(read)return `Non è stato possibile leggere il file “${read[1]}”. Il file verrà mantenuto nell’archivio locale e la sincronizzazione potrà essere riprovata.`;
    if(/supported JavaScript type|Blob, ArrayBuffer/i.test(raw))return 'Non è stato possibile preparare uno dei file locali per la sincronizzazione. Riprova; se il problema continua usa “Segnala problema”.';
    if(error?.code==='local_service_unavailable'||/motore locale|servizio locale|8896|connessione al motore locale/i.test(raw))return 'Il motore del Dossier non risponde. Ricarica la pagina (tasto F5) e riprova.';
    if(/network|failed to fetch|timed? out|timeout/i.test(raw))return 'Connessione al servizio cloud non completata. Verifica la rete e riprova.';
    if(/(?:codice|code)\s*[34]\b/i.test(raw))return 'Il percorso cloud richiesto non è ancora presente. Il Dossier riproverà senza considerarlo un errore di sincronizzazione.';
    if(/Source doesn't exist or is a directory and destination is a file/i.test(raw))return 'Un file dell’archivio cloud non è stato letto correttamente. Le modifiche locali restano in attesa e la sincronizzazione può essere riprovata.';
    if(/not found|non trovato/i.test(raw))return raw.replace(/^.*not found.*$/i,'Archivio o file cloud non trovato. Aggiorna la ricerca e riprova.');
    if(/CRITICAL:/i.test(raw))return 'Sincronizzazione cloud non completata. Le modifiche locali restano in attesa e possono essere riprovate.';
    return raw;
  }
  function setCloudProgress(percent,phase,detail=''){
    const box=document.querySelector('#cloudSyncProgress');if(!box)return;
    const known=percent!==null&&percent!==undefined&&Number.isFinite(Number(percent));
    const pct=known?Math.max(0,Math.min(100,Math.round(Number(percent)))):0;box.classList.remove('hidden');box.classList.toggle('indeterminate',!known);
    const bar=box.querySelector('[data-cloud-progress-bar]'),label=box.querySelector('[data-cloud-progress-percent]'),stage=box.querySelector('[data-cloud-progress-stage]'),info=box.querySelector('[data-cloud-progress-detail]');
    if(bar)bar.style.width=known?`${pct}%`:'35%';if(label)label.textContent=known?`${pct}%`:'…';if(stage)stage.textContent=phase||'Sincronizzazione';if(info)info.textContent=detail||'';
  }
  function formatTransferBytes(value){const n=Math.max(0,Number(value)||0);if(n<1024)return `${Math.round(n)} B`;if(n<1024**2)return `${(n/1024).toFixed(1)} KB`;if(n<1024**3)return `${(n/1024**2).toFixed(1)} MB`;return `${(n/1024**3).toFixed(2)} GB`;}
  async function cloudQuota(row=settings){if(!row?.remoteName)return{supported:false};try{return await get(`/quota?remote=${encodeURIComponent(row.remoteName)}`);}catch(error){return{supported:false,error:italianCloudError(error)};}}
  function quotaCardHtml(quota,plannedBytes=0){if(!quota?.supported)return`<div class="cloud-quota-grid"><div class="cloud-quota-card warn"><span>Spazio cloud</span><strong>Quota non disponibile</strong></div><div class="cloud-quota-card info"><span>Backup previsto</span><strong>${plannedBytes?formatTransferBytes(plannedBytes):'Calcolato prima dell’invio'}</strong></div><div class="cloud-quota-card"><span>Protezione</span><strong>Nessun valore inventato</strong></div></div>`;const free=Math.max(0,Number(quota.free)||0),total=Math.max(0,Number(quota.total)||0),used=Math.max(0,Number(quota.used)||0),residual=plannedBytes?Math.max(0,free-plannedBytes):free;return`<div class="cloud-quota-grid"><div class="cloud-quota-card good"><span>Spazio libero sul cloud</span><strong>${formatTransferBytes(free)}</strong></div><div class="cloud-quota-card info"><span>Spazio usato / totale</span><strong>${formatTransferBytes(used)}${total?` / ${formatTransferBytes(total)}`:''}</strong></div><div class="cloud-quota-card ${plannedBytes&&plannedBytes>free?'warn':'good'}"><span>${plannedBytes?'Residuo dopo questo backup':'Disponibile per nuovi backup'}</span><strong>${plannedBytes?formatTransferBytes(residual):formatTransferBytes(free)}</strong></div></div>`;}
  async function assertCloudSpace(row,requiredBytes,onProgress){const quota=await cloudQuota(row);row.lastQuotaCheckedAt=new Date().toISOString();row.lastQuota=quota?.supported?{total:Number(quota.total)||0,used:Number(quota.used)||0,free:Number(quota.free)||0}:null;await DossierDB.put('cloudSettings',row,{audit:false,sync:false});if(!quota?.supported){onProgress?.(null,'Spazio cloud non verificabile','Il provider non ha restituito una quota. Il Dossier non inventa valori e prosegue solo perché la verifica non è disponibile.');return quota;}const free=Math.max(0,Number(quota.free)||0),reserve=Math.max(8*1024*1024,Math.ceil(Number(requiredBytes||0)*.02));onProgress?.(null,'Verifica spazio cloud',`Liberi ${formatTransferBytes(free)} · backup ${formatTransferBytes(requiredBytes)} · margine ${formatTransferBytes(reserve)}`);if(Number(requiredBytes||0)+reserve>free)throw new Error(`Spazio cloud insufficiente: disponibili ${formatTransferBytes(free)}, necessari circa ${formatTransferBytes(Number(requiredBytes||0)+reserve)}.`);return quota;}

  function openCloudRecoveryProgress(){
    document.querySelector('#cloudRecoveryMainProgress')?.remove();
    const overlay=document.createElement('div');overlay.id='cloudRecoveryMainProgress';overlay.className='cloud-main-progress-overlay';
    overlay.innerHTML=`<div class="cloud-main-progress-card"><div class="cloud-main-progress-head"><img src="assets/icon-64.png" alt=""><div><strong>Collegamento e ripristino cloud</strong><span data-recovery-phase>Preparazione…</span></div><b data-recovery-percent>0%</b></div><div class="cloud-main-progress-track"><span data-recovery-bar style="width:0%"></span></div><p data-recovery-detail>Avvio del collegamento.</p></div>`;
    document.body.appendChild(overlay);
    const update=(pct,phase,detail='')=>{const v=Math.max(0,Math.min(100,Math.round(Number(pct)||0)));const percent=overlay.querySelector('[data-recovery-percent]'),bar=overlay.querySelector('[data-recovery-bar]'),stage=overlay.querySelector('[data-recovery-phase]'),info=overlay.querySelector('[data-recovery-detail]');if(percent)percent.textContent=`${v}%`;if(bar)bar.style.width=`${v}%`;if(stage)stage.textContent=phase||'Ripristino';if(info)info.textContent=detail||'';setCloudProgress(v,phase,detail);};
    return {update,close:()=>overlay.remove()};
  }
  function readSyncLease(){try{return JSON.parse(localStorage.getItem(SYNC_LEASE_KEY)||'null');}catch{return null;}}
  function acquireSyncLease(){const now=Date.now();const lease=readSyncLease();if(lease&&lease.tabId!==TAB_ID&&Number(lease.expiresAt||0)>now)return false;localStorage.setItem(SYNC_LEASE_KEY,JSON.stringify({tabId:TAB_ID,expiresAt:now+SYNC_LEASE_MS}));const verify=readSyncLease();if(!verify||verify.tabId!==TAB_ID)return false;clearInterval(syncLeaseTimer);syncLeaseTimer=setInterval(()=>{const cur=readSyncLease();if(cur?.tabId!==TAB_ID){clearInterval(syncLeaseTimer);syncLeaseTimer=null;return;}localStorage.setItem(SYNC_LEASE_KEY,JSON.stringify({tabId:TAB_ID,expiresAt:Date.now()+SYNC_LEASE_MS}));},20000);return true;}
  function releaseSyncLease(){clearInterval(syncLeaseTimer);syncLeaseTimer=null;const lease=readSyncLease();if(lease?.tabId===TAB_ID)localStorage.removeItem(SYNC_LEASE_KEY);}
  async function runWithCrossTabSyncLock(work,{silent=false}={}){
    const busyMessage=()=>{if(!silent){App.toast('La sincronizzazione è già in corso in un’altra scheda del Dossier.');updateStatusText('Sincronizzazione già in corso in un’altra scheda.');}};
    if(navigator.locks?.request){
      return navigator.locks.request('dossier-cloud-sync-v2',{mode:'exclusive',ifAvailable:true},async lock=>{if(!lock){busyMessage();return;}return work();});
    }
    if(!acquireSyncLease()){busyMessage();return;}
    try{return await work();}finally{releaseSyncLease();}
  }
  function setSyncButtonsBusy(busy){document.querySelectorAll('#cloudSyncNow,#cloudSnapshotNow').forEach(btn=>{btn.disabled=!!busy;btn.setAttribute('aria-busy',busy?'true':'false');});}

  async function request(path,options={}) {
    let response;
    try{response=await fetch(`${API}${path}`,options);}catch(cause){const error=new Error('Il motore del Dossier non risponde. Ricarica la pagina (tasto F5) e riprova.');error.code='local_service_unavailable';error.cause=cause;throw error;}
    if(!response.ok){let message=`Errore cloud ${response.status}`,code='cloud_request_failed';try{const j=await response.json();message=j.error||message;code=j.code||code;}catch{}const error=new Error(message);error.code=code;error.status=response.status;throw error;}
    const type=response.headers.get('content-type')||'';
    return type.includes('application/json')?response.json():response.blob();
  }
  const get=(path)=>request(path);
  const postJson=(path,data)=>request(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  const upload=(remote,blob)=>request('/upload',{method:'POST',headers:{'Content-Type':'application/octet-stream','X-Remote-Path':encodeURIComponent(remote),'X-Dossier-Client':CLIENT_REV},body:blob});
  async function uploadWithRealProgress(remote,blob,onProgress){
    const start=await new Promise((resolve,reject)=>{const xhr=new XMLHttpRequest();xhr.open('POST',`${API}/upload-start`);xhr.setRequestHeader('Content-Type','application/octet-stream');xhr.setRequestHeader('X-Remote-Path',encodeURIComponent(remote));xhr.setRequestHeader('X-Dossier-Client',CLIENT_REV);xhr.responseType='json';xhr.upload.onprogress=e=>{if(e.lengthComputable)onProgress?.(null,'Preparazione invio',`${formatTransferBytes(e.loaded)} / ${formatTransferBytes(e.total)} trasferiti al motore del Dossier`);};xhr.onerror=()=>{const error=new Error('Connessione al motore del Dossier interrotta durante la preparazione del trasferimento.');error.code='local_service_unavailable';reject(error);};xhr.onload=()=>{const body=xhr.response||{};if(xhr.status<200||xhr.status>=300)return reject(new Error(body.error||`Errore cloud ${xhr.status}`));resolve(body);};xhr.send(blob);});
    const jobId=String(start.jobId||'');if(!jobId)throw new Error('Impossibile avviare il trasferimento cloud.');
    for(;;){await new Promise(r=>setTimeout(r,450));const st=await get(`/upload-progress?id=${encodeURIComponent(jobId)}`);const total=Math.max(0,Number(st.totalBytes)||Number(blob.size)||0),done=Math.max(0,Number(st.bytes)||0);if(st.status==='error')throw new Error(st.error||'Trasferimento cloud non completato.');const pct=Number.isFinite(Number(st.percent))?Math.max(0,Math.min(100,Math.round(Number(st.percent)))):(total>0?Math.max(0,Math.min(100,Math.round(done/total*100))):null);if(st.status==='queued'||st.stage==='prepare')onProgress?.(null,'Preparazione invio','Preparazione del collegamento e dello spazio di destinazione.');else if(st.stage==='verify')onProgress?.(null,'Verifica copia cifrata',total>0?`${formatTransferBytes(total)} trasferiti · verifica integrità e dimensione`:'Verifica del trasferimento.');else if(st.stage==='commit')onProgress?.(null,'Conferma archivio cloud','Rendendo definitiva la copia verificata.');else onProgress?.(pct,'Invio copia cifrata',total>0?`${formatTransferBytes(done)} / ${formatTransferBytes(total)}${pct!==null?` · ${pct}%`:''}`:'Trasferimento al servizio cloud in corso.');if(st.status==='done')return st;}
  }
  const download=(remote)=>request(`/download?remote=${encodeURIComponent(remote)}`);
  async function downloadStream(remote,onProgress){
    const start=await postJson('/download-start',{remote});
    const jobId=String(start.jobId||'');if(!jobId)throw new Error('Impossibile preparare il download cloud.');
    let total=0,sha256='';
    try{
      for(;;){
        await new Promise(r=>setTimeout(r,450));
        const st=await get(`/download-progress?id=${encodeURIComponent(jobId)}`);
        if(st.status==='error')throw new Error(st.error||'Download cloud non completato.');
        if(st.status==='ready'){total=Math.max(0,Number(st.totalBytes)||0);sha256=String(st.sha256||'');break;}
        const pct=Number.isFinite(Number(st.percent))?Math.max(0,Math.min(100,Math.round(Number(st.percent)))):null;
        onProgress?.(Math.max(0,Number(st.bytes)||0),Math.max(0,Number(st.totalBytes)||0),pct);
      }
      if(total<=0)throw new Error('Dimensione del file cloud non valida.');
      const chunkSize=4*1024*1024,parts=[];let received=0;
      for(let offset=0;offset<total;offset+=chunkSize){
        const expected=Math.min(chunkSize,total-offset);let part=null,lastError=null;
        for(let attempt=0;attempt<5;attempt++){
          try{
            const response=await fetch(`${API}/download-chunk?id=${encodeURIComponent(jobId)}&offset=${offset}&length=${expected}`,{cache:'no-store'});
            if(!response.ok)throw new Error(`Blocco locale non disponibile (${response.status})`);
            const blob=await response.blob();
            if(blob.size!==expected)throw new Error(`Blocco locale incompleto: attesi ${expected} byte, ricevuti ${blob.size}`);
            part=blob;break;
          }catch(error){lastError=error;if(attempt<4)await new Promise(r=>setTimeout(r,300*(attempt+1)));}
        }
        if(!part)throw lastError||new Error('Trasferimento locale del blocco non riuscito.');
        parts.push(part);received+=part.size;onProgress?.(received,total,total?Math.round(received/total*100):null);
      }
      if(received!==total)throw new Error(`Download locale incompleto: attesi ${total} byte, ricevuti ${received}`);
      const blob=new Blob(parts,{type:'application/octet-stream'});
      if(blob.size!==total)throw new Error('Il file ricomposto non corrisponde alla dimensione attesa.');
      if(sha256){
        const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()));
        const actual=Array.from(digest,b=>b.toString(16).padStart(2,'0')).join('');
        if(actual.toLowerCase()!==sha256.toLowerCase())throw new Error('Verifica integrità del download locale non superata.');
      }
      return blob;
    }finally{
      try{await postJson('/download-finish',{jobId});}catch{}
    }
  }
  function archiveTimestampFromName(value,prefix){
    const leaf=String(value||'').split('/').pop();
    const m=leaf.match(new RegExp(`^${prefix}(\\d{4}-\\d{2}-\\d{2})T(\\d{2})-(\\d{2})-(\\d{2})-(\\d{3})Z`));
    if(!m)return 0;
    const parsed=Date.parse(`${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z`);
    return Number.isFinite(parsed)?parsed:0;
  }
  async function remoteStat(remote){return get(`/stat?remote=${encodeURIComponent(remote)}`);}
  const deleteRemote=(remote)=>postJson('/delete',{remote});
  async function assertLocalServiceReady({retries=4,delay=450}={}){
    let lastError=null;
    for(let attempt=0;attempt<Math.max(1,retries);attempt++){
      try{
        const health=await DossierSecurity.request('/api/health',{auth:false});
        if(health?.ok)return health;
        const error=new Error(health?.error||'Il motore del Dossier non è pronto.');error.code='local_service_unavailable';lastError=error;
      }catch(error){lastError=error;}
      if(attempt+1<Math.max(1,retries))await new Promise(r=>setTimeout(r,delay));
    }
    if(lastError?.code==='local_service_unavailable')throw lastError;
    const localError=new Error('Il motore del Dossier non risponde. Ricarica la pagina (tasto F5) e riprova.');
    localError.code='local_service_unavailable';localError.cause=lastError;throw localError;
  }

  async function loadSettings(){settings=await DossierDB.get('cloudSettings','main')||null;applySyncContext();return settings;}
  async function persistMediaPreference(enabled){
    const row=await DossierDB.get('cloudSettings','main');if(!row)return;
    row.includeMediaArchive=!!enabled;row.mediaSnapshotRequired=!!enabled;row.mediaPreferenceUpdatedAt=new Date().toISOString();
    await DossierDB.put('cloudSettings',row,{audit:false,sync:false});settings=row;applySyncContext();
  }
  async function mediaArchiveFingerprint(){
    const dicom=await DossierDB.getAll('dicomStudies').catch(()=>[]),images=await DossierDB.getAll('mediaAttachments').catch(()=>[]);
    const compact={dicom:dicom.map(s=>({id:s.id,profileId:s.profileId,storageMode:s.storageMode,totalBytes:Number(s.totalBytes||0),updatedAt:s.updatedAt||s.importedAt||'',files:(s.files||[]).map(f=>[f.relativePath||f.name||'',Number(f.size||0),Number(f.lastModified||0)])})).sort((a,b)=>String(a.id).localeCompare(String(b.id))),images:images.map(x=>({id:x.id,profileId:x.profileId,storageMode:x.storageMode,size:Number(x.size||0),storagePath:x.storagePath||x.name||'',updatedAt:x.updatedAt||x.createdAt||''})).sort((a,b)=>String(a.id).localeCompare(String(b.id)))};
    const bytes=new TextEncoder().encode(JSON.stringify(compact));const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));return [...digest].map(x=>x.toString(16).padStart(2,'0')).join('');
  }
  async function mediaSnapshotNeeded(row=settings){if(!row?.includeMediaArchive)return false;if(row.mediaSnapshotRequired)return true;const fingerprint=await mediaArchiveFingerprint();return !row.lastMediaSnapshotFingerprint||fingerprint!==row.lastMediaSnapshotFingerprint;}
  function applySyncContext(){DossierDB.setSyncContext(()=>({enabled:!!settings?.enabled,deviceId:deviceId()}));}
  function cleanBasePath(value){const clean=String(value||ROOT_FOLDER).replace(/\\/g,'/').replace(/^\/+|\/+$/g,'').replace(/\.{2,}/g,'.');return clean||ROOT_FOLDER;}
  function remoteRoot(row=settings){return `${row.remoteName}:${cleanBasePath(row.basePath)}/${row.archiveId}`;}
  function cloudPath(relative,row=settings){return `${remoteRoot(row)}/${String(relative||'').replace(/^\/+/, '')}`;}

  async function importAesKey(raw){return crypto.subtle.importKey('raw',raw,{name:'AES-GCM'},false,['encrypt','decrypt']);}
  async function encryptBlob(blob,keyBytes,metadata={}){
    const iv=crypto.getRandomValues(new Uint8Array(12));const key=await importAesKey(keyBytes);const plain=await blob.arrayBuffer();
    const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,plain);
    const meta=new TextEncoder().encode(JSON.stringify({format:'DSL5-AESGCM',version:1,createdAt:new Date().toISOString(),iv:b64(iv),...metadata}));
    const header=new Uint8Array(12);header.set(new TextEncoder().encode('DSL5ENC1'),0);new DataView(header.buffer).setUint32(8,meta.length,false);
    return new Blob([header,meta,new Uint8Array(cipher)],{type:'application/octet-stream'});
  }
  async function decryptBlob(blob,keyBytes){
    const bytes=new Uint8Array(await blob.arrayBuffer());if(bytes.length<24)throw new Error('Archivio cifrato non valido');
    const magic=new TextDecoder().decode(bytes.subarray(0,8));if(magic!=='DSL5ENC1')throw new Error('Formato cifrato non riconosciuto');
    const length=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(8,false);const meta=JSON.parse(new TextDecoder().decode(bytes.subarray(12,12+length)));
    const key=await importAesKey(keyBytes);const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(meta.iv)},key,bytes.subarray(12+length));
    return {blob:new Blob([plain]),metadata:meta};
  }

  function keyError(message,code='recovery_key_missing'){const error=new Error(message);error.code=code;return error;}
  function validMasterKey(encoded){return decodeRecoveryKey(encoded);}
  async function saveDeviceMasterKey(row,encoded,{alsoForCurrentUser=true}={}){
    const raw=validMasterKey(encoded);if(!raw)throw keyError('Chiave di recupero non valida','recovery_key_invalid');
    const normalized=b64url(raw);
    // La copia per l'utente viene salvata prima della protezione dispositivo: se il servizio
    // locale si interrompe in questo istante, la chiave resta comunque recuperabile al riavvio.
    if(alsoForCurrentUser){row.wrappedKeys={...(row.wrappedKeys||{}),[userId()]:await DossierSecurity.protectSecret(normalized)};await DossierDB.put('cloudSettings',row,{audit:false,sync:false});}
    if(globalThis.DossierSecurity?.protectDeviceSecret){
      try{row.deviceWrappedKey=await DossierSecurity.protectDeviceSecret(normalized);}
      catch(error){
        if(error?.code==='local_service_unavailable')throw error;
        console.warn('Protezione dispositivo non disponibile; resta valida la copia cifrata per l’utente:',error);
      }
    }
    if(/chiave di recupero non inserita|chiave non disponibile/i.test(String(row.lastError||'')))row.lastError='';
    await DossierDB.put('cloudSettings',row,{audit:false,sync:false});settings=row;return raw;
  }
  async function masterKey(row=settings,{promptIfMissing=true}={}){
    if(!row)throw new Error('Archivio cloud non configurato');
    if(row.deviceWrappedKey&&globalThis.DossierSecurity?.unprotectDeviceSecret){
      try{const encoded=await DossierSecurity.unprotectDeviceSecret(row.deviceWrappedKey);const raw=validMasterKey(encoded);if(raw)return raw;}
      catch(error){if(error?.code==='local_service_unavailable')throw error;console.warn('Chiave dispositivo non leggibile, provo la copia cifrata dell’utente:',error);}
    }
    const wraps=row.wrappedKeys||{};const wrapped=wraps[userId()];
    if(wrapped){
      try{const encoded=await DossierSecurity.unprotectSecret(wrapped);const raw=validMasterKey(encoded);if(raw){try{await saveDeviceMasterKey(row,encoded,{alsoForCurrentUser:false});}catch(error){if(error?.code==='local_service_unavailable')throw error;}return raw;}}
      catch(error){if(error?.code==='local_service_unavailable')throw error;console.warn('Chiave utente non leggibile, provo le copie compatibili:',error);}
    }
    for(const candidate of Object.values(wraps)){
      if(!candidate||candidate===wrapped)continue;
      try{const encoded=await DossierSecurity.unprotectSecret(candidate);const raw=validMasterKey(encoded);if(raw){await saveDeviceMasterKey(row,encoded,{alsoForCurrentUser:true});return raw;}}catch(error){if(error?.code==='local_service_unavailable')throw error;}
    }
    if(!promptIfMissing)throw keyError('Chiave dell’archivio non disponibile su questo dispositivo');
    const entered=prompt('Inserisci la chiave di recupero dell’archivio condiviso. Serve soltanto per autorizzare questo dispositivo e verrà memorizzata in modo protetto.');
    const raw=decodeRecoveryKey(entered);if(!String(entered||'').trim())throw keyError('Chiave di recupero non inserita');if(!raw)throw keyError('Chiave di recupero non valida','recovery_key_invalid');
    await saveDeviceMasterKey(row,b64url(raw),{alsoForCurrentUser:true});return raw;
  }


  function downloadText(text,name){const a=document.createElement('a');const url=URL.createObjectURL(new Blob([text],{type:'text/plain'}));a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  async function status(){try{return await get('/status');}catch(error){return {ok:false,installed:false,error:error.message};}}
  const REMOTE_PROVIDER_KEY='dossierCloudRemoteProviders';
  function loadRemoteProviders(){try{return JSON.parse(localStorage.getItem(REMOTE_PROVIDER_KEY)||'{}')||{};}catch{return{};}}
  function saveRemoteProvider(name,provider){if(!name||!PROVIDERS[provider])return;const map=loadRemoteProviders();map[String(name)]=provider;localStorage.setItem(REMOTE_PROVIDER_KEY,JSON.stringify(map));}
  function inferRemoteProvider(name){const n=String(name||'').toLowerCase();if(n.startsWith('mega')||n.includes('_mega'))return'mega';if(n.startsWith('google')||n.startsWith('drive')||n.includes('_google'))return'drive';if(n.startsWith('icloud')||n.includes('_icloud'))return'iclouddrive';return'';}
  async function remotes(){
    try{
      const payload=await get('/remotes');const known=loadRemoteProviders();
      if(Array.isArray(payload.details))return payload.details.map(x=>{const name=String(x.name||'');const provider=String(x.provider||known[name]||inferRemoteProvider(name)||'');if(provider)saveRemoteProvider(name,provider);return{name,provider};}).filter(x=>x.name);
      return (payload.remotes||[]).map(value=>{const name=String(value||'');return{name,provider:String(known[name]||inferRemoteProvider(name)||'')};});
    }catch{return[];}
  }
  const providerLabel=value=>PROVIDERS[value]?.label||String(value||'Servizio cloud');
  function remoteMatchesProvider(remote,provider){return remote?.provider===provider;}
  async function assertRemoteProvider(remoteName,provider){
    const list=await remotes();const row=list.find(x=>x.name===remoteName);if(row?.provider&&row.provider!==provider)throw new Error(`La connessione ${remoteName} appartiene a ${providerLabel(row.provider)}, non a ${providerLabel(provider)}.`);return true;
  }
  function providerDescription(provider){const info=PROVIDERS[provider]||PROVIDERS.mega;return `<strong>${esc(info.label)}</strong><p>${esc(info.security)}</p>${provider==='mega'?'<span class="cloud-security-recommended">Consigliato per maggiore riservatezza</span>':''}`;}
  function providerRemoteOptions(list,provider){return list.filter(row=>remoteMatchesProvider(row,provider)).map(row=>`<option value="${esc(row.name)}">${esc(row.name)}</option>`).join('');}


  async function installConnector(button){if(button){button.disabled=true;button.textContent='Installazione in corso…';}try{await postJson('/install',{});App.toast('Connettore cloud installato e verificato');}finally{if(button){button.disabled=false;button.textContent='Installa connettore';}await refreshPanel();}}

  async function configureMega(form){
    const fd=new FormData(form);const name=safePart(fd.get('remoteName')||'mega_dossier');const user=String(fd.get('email')||'').trim();const pass=String(fd.get('password')||'');
    if(!user||!pass)throw new Error('Inserisci e-mail e password MEGA');
    const result=await postJson('/configure',{name,provider:'mega',params:{user,pass}});
    if(!result.complete||!result.verified)throw new Error(result.error||'Impossibile verificare l’accesso all’account MEGA');
    saveRemoteProvider(name,'mega');form.reset();App.toast('Account MEGA collegato e verificato');await refreshPanel();
  }

  function questionText(question){return question?.Option?.Help||question?.Option?.Question||question?.Question||question?.Option?.Name||'Inserisci il valore richiesto';}
  async function configureGuided(provider,remoteName){
    let response=await postJson('/configure',{name:remoteName,provider,params:{}});let guard=0;
    while(!response.complete&&response.question&&guard++<30){const q=response.question;const url=JSON.stringify(q).match(/https?:\/\/[^\s"']+/)?.[0];if(url&&confirm('Il servizio richiede l’accesso nel browser. Aprire la pagina di autorizzazione?'))window.open(url,'_blank','noopener');
      const option=q.Option||{};let answer='';if(Array.isArray(option.Examples)&&option.Examples.length){const choices=option.Examples.map((x,i)=>`${i+1}. ${x.Value??x.value??''} ${x.Help??x.help??''}`).join('\n');const selected=prompt(`${questionText(q)}\n\n${choices}\n\nInserisci il numero o il valore:`,option.Default??'');if(selected===null)throw new Error('Configurazione annullata');const n=Number(selected);answer=Number.isInteger(n)&&n>=1&&n<=option.Examples.length?String(option.Examples[n-1].Value??option.Examples[n-1].value??''):selected;}else{answer=prompt(questionText(q),option.Default??'');if(answer===null)throw new Error('Configurazione annullata');}
      response=await postJson('/configure',{name:remoteName,provider,continue:true,state:q.State||'',result:answer});
    }
    if(!response.complete)throw new Error('La procedura del servizio non è stata completata');saveRemoteProvider(remoteName,provider);App.toast('Servizio cloud collegato');await refreshPanel();
  }

  async function createManifest(row){const manifest={app:'Dossier Sanitario Locale',format:'DSL5-CLOUD',archiveId:row.archiveId,displayName:row.displayName,provider:row.provider,basePath:cleanBasePath(row.basePath),createdAt:row.createdAt,version:'5.0.0'};await upload(cloudPath('archive.json',row),new Blob([JSON.stringify(manifest)],{type:'application/json'}));}
  function snapshotName(){return `snapshot23_${new Date().toISOString().replace(/[:.]/g,'-')}_${safePart(deviceId())}_${crypto.randomUUID()}.dsl5`;}
  async function pruneOldSnapshots(row,keep=MAX_SNAPSHOTS){
    const result=await get(`/list?remote=${encodeURIComponent(cloudPath('snapshots',row))}`);
    const all=(result.items||[]).filter(x=>!x.IsDir);
    const commitNames=new Set(all.map(x=>String(x.Path||x.Name||'').replace(/\\/g,'/').split('/').pop()).filter(n=>n.endsWith('.commit')));
    const snapshots=all.filter(x=>String(x.Path||x.Name||'').replace(/\\/g,'/').split('/').pop().endsWith('.dsl5'));
    snapshots.sort((a,b)=>{
      const at=Date.parse(a.ModTime||a.modTime||'')||0,bt=Date.parse(b.ModTime||b.modTime||'')||0;
      if(at!==bt)return bt-at;
      const an=String(a.Path||a.Name||''),bn=String(b.Path||b.Name||'');
      return bn.localeCompare(an);
    });
    for(const item of snapshots.slice(Math.max(0,Number(keep)||0))){
      const leaf=String(item.Path||item.Name||'').replace(/\\/g,'/').split('/').pop();
      if(!leaf)continue;
      await deleteRemote(cloudPath(`snapshots/${leaf}`,row));
      if(commitNames.has(`${leaf}.commit`))await deleteRemote(cloudPath(`snapshots/${leaf}.commit`,row));
    }
  }
  async function uploadSnapshot(row,keyBytes,onProgress){
    const includeMediaArchive=!!row.includeMediaArchive;
    const mediaFingerprint=includeMediaArchive?await mediaArchiveFingerprint():'';
    const retrying=!!row.pendingSnapshotName;
    let name=row.pendingSnapshotName||snapshotName();
    if(!retrying){row.pendingSnapshotName=name;row.pendingSnapshotStartedAt=new Date().toISOString();await DossierDB.put('cloudSettings',row,{audit:false,sync:false});}
    let finalRemote=cloudPath(`snapshots/${name}`,row),commitRemote=cloudPath(`snapshots/${name}.commit`,row);
    let existing={exists:false},committed={exists:false};
    if(retrying){[existing,committed]=await Promise.all([remoteStat(finalRemote),remoteStat(commitRemote)]);}
    onProgress?.(null,'Consolidamento archivio','Creazione e verifica della copia protetta.');
    const backup=await App.buildBackupBlob({includeMediaArchive});onProgress?.(null,'Cifratura consolidamento',includeMediaArchive?'Protezione della copia, comprese immagini e DICOM locali.':'Protezione della copia prima del trasferimento.');const encrypted=await encryptBlob(backup,keyBytes,{kind:'snapshot',archiveId:row.archiveId,deviceId:deviceId()});
    if(existing?.exists&&Number(existing.item?.Size??-1)!==encrypted.size){name=snapshotName();row.pendingSnapshotName=name;await DossierDB.put('cloudSettings',row,{audit:false,sync:false});finalRemote=cloudPath(`snapshots/${name}`,row);commitRemote=cloudPath(`snapshots/${name}.commit`,row);existing={exists:false};committed={exists:false};}
    if(!existing?.exists){await assertCloudSpace(row,encrypted.size,onProgress);await uploadWithRealProgress(finalRemote,encrypted,onProgress);}
    if(!committed?.exists){const marker=new Blob([JSON.stringify({format:'DSL5-COMMIT',kind:'snapshot',name,size:encrypted.size,at:new Date().toISOString()})],{type:'application/json'});await uploadWithRealProgress(commitRemote,marker,(pct)=>onProgress?.(pct===100?100:null,'Conferma consolidamento','Registrazione del commit della copia.'));}
    row.lastSnapshotAt=new Date().toISOString();row.lastSnapshotName=name;if(includeMediaArchive){row.lastMediaSnapshotFingerprint=mediaFingerprint;row.lastMediaSnapshotAt=row.lastSnapshotAt;row.mediaSnapshotRequired=false;}delete row.pendingSnapshotName;delete row.pendingSnapshotStartedAt;await DossierDB.put('cloudSettings',row,{audit:false,sync:false});setTimeout(()=>void pruneOldSnapshots(row,MAX_SNAPSHOTS).catch(error=>console.warn('Rotazione snapshot rinviata:',error)),3000);onProgress?.(100,'Verifica finale',includeMediaArchive?'Archivio consolidato con DICOM e immagini confermato.':'Archivio consolidato e confermato.');return name;}

  async function createArchive(form){
    if(!await DossierSecurity.requireMfaForCloud())throw new Error('Completa prima l’attivazione del codice temporaneo, poi ripeti la creazione');
    const fd=new FormData(form);const remoteName=String(fd.get('remote')||'');const provider=String(fd.get('provider')||selectedProvider);const displayName=String(fd.get('archiveName')||'Archivio familiare').trim();const basePath=cleanBasePath(fd.get('basePath'));if(!remoteName)throw new Error('Seleziona un account cloud collegato');if(!PROVIDERS[provider])throw new Error('Servizio cloud non valido');await assertRemoteProvider(remoteName,provider);
    const raw=crypto.getRandomValues(new Uint8Array(32));const recovery=b64url(raw);const archiveId=`archive_${crypto.randomUUID()}`;
    const row={key:'main',enabled:true,provider,remoteName,basePath,archiveId,displayName,createdAt:new Date().toISOString(),lastSyncAt:'',processedEventIds:[],wrappedKeys:{[userId()]:await DossierSecurity.protectSecret(recovery)},syncMode:'event-log-v1'};
    await postJson('/mkdir',{remote:remoteRoot(row)});await postJson('/mkdir',{remote:cloudPath('snapshots',row)});await postJson('/mkdir',{remote:cloudPath('changes',row)});await createManifest(row);await uploadSnapshot(row,raw);
    await DossierDB.clear('syncQueue');await DossierDB.put('cloudSettings',row,{audit:false,sync:false});settings=row;applySyncContext();await DossierSecurity.setDeviceCloudLinked(true,row.archiveId);await DossierSecurity.registerCurrentDevice({sync:true});
    const recoveryText=`DOSSIER SANITARIO LOCALE\nChiave di recupero archivio\n\nArchivio: ${displayName}\nIdentificativo: ${archiveId}\nServizio: ${remoteName}\n\nCHIAVE: ${formatRecovery(recovery)}\n\nConservare separatamente dal computer e dal cloud. Chi possiede questa chiave può decifrare l'archivio.`;
    downloadText(recoveryText,`CHIAVE_RECUPERO_DOSSIER_${archiveId.slice(-8)}.txt`);alert(`Archivio cloud creato.\n\nLa chiave di recupero è stata salvata in un file sul computer. Conservala anche su carta o in un luogo separato.\n\nIdentificativo archivio:\n${archiveId}`);
    await refreshPanel();startAutomaticSync();
  }

  async function latestSnapshot(row){const result=await get(`/list?remote=${encodeURIComponent(cloudPath('snapshots',row))}`);const all=(result.items||[]).filter(x=>!x.IsDir),names=new Set(all.map(x=>String(x.Path||x.Name||'')));const files=all.filter(x=>{const n=String(x.Path||x.Name||'');if(!n.endsWith('.dsl5'))return false;const leaf=n.split('/').pop();return !leaf.startsWith('snapshot23_')||names.has(`${n}.commit`)||names.has(`${leaf}.commit`);});files.sort((a,b)=>String(b.Path||b.Name||'').localeCompare(String(a.Path||a.Name||'')));return files[0]||null;}

  async function linkArchive(form){
    if(recoveryInProgress)throw new Error('Ripristino già in corso. Attendi il completamento.');
    recoveryInProgress=true;clearTimeout(syncTimer);syncTimer=null;DossierSecurity.beginTechnicalActivity?.('cloud-restore');
    const recoveryUi=openCloudRecoveryProgress();
    let recoveryRow=null,recoveryCompleted=false;
    try{
      recoveryUi.update(1,'Connessione all’archivio','Verifica dei dati di collegamento.');
      const fd=new FormData(form);const remoteName=String(fd.get('remote')||'');const provider=String(fd.get('provider')||selectedProvider);const basePath=cleanBasePath(fd.get('basePath'));const archiveId=String(fd.get('archiveId')||'').trim();const recoveryText=String(fd.get('recoveryKey')||'');if(!remoteName||!archiveId||!recoveryText.trim())throw new Error('Compila account cloud, identificativo e chiave di recupero');if(!PROVIDERS[provider])throw new Error('Servizio cloud non valido');await assertRemoteProvider(remoteName,provider);const raw=decodeRecoveryKey(recoveryText);if(!raw)throw new Error('Chiave di recupero non valida');
      const row={key:'main',enabled:false,provider,remoteName,basePath,archiveId,displayName:'Archivio familiare',createdAt:new Date().toISOString(),lastSyncAt:'',processedEventIds:[],wrappedKeys:{[userId()]:await DossierSecurity.protectSecret(b64url(raw))},syncMode:'event-log-v1'};recoveryRow=row;
      if(DossierSecurity.protectDeviceSecret){try{row.deviceWrappedKey=await DossierSecurity.protectDeviceSecret(b64url(raw));}catch(error){if(error?.code==='local_service_unavailable')throw error;}}
      // Il contesto di sincronizzazione resta disattivato fino al termine di TUTTO il ripristino.
      settings=row;applySyncContext();
      recoveryUi.update(4,'Verifica archivio','Lettura del manifesto cloud.');
      try{const manifestBlob=await download(cloudPath('archive.json',row));const manifest=JSON.parse(await manifestBlob.text());if(manifest.format!=='DSL5-CLOUD'||manifest.archiveId!==archiveId)throw new Error('Manifesto archivio non valido');row.displayName=manifest.displayName||row.displayName;}catch(error){throw new Error(`Archivio non trovato nella cartella indicata: ${error.message}`);}
      recoveryUi.update(7,'Ricerca copia completa','Individuazione dell’ultima copia valida.');
      const snap=await latestSnapshot(row);if(!snap)throw new Error('Nessuna copia iniziale trovata nell’archivio indicato');const snapName=String(snap.Path||snap.Name||'');const snapshotMs=archiveTimestampFromName(snapName.split('/').pop(),'snapshot23_');const remote=cloudPath(`snapshots/${snapName}`,row);
      const encrypted=await downloadStream(remote,(bytes,total,pct)=>{const localPct=Number.isFinite(Number(pct))?Number(pct):(total?bytes/total*100:0);recoveryUi.update(8+localPct*.47,'Download copia completa',total?`${formatTransferBytes(bytes)} / ${formatTransferBytes(total)} · ${Math.round(localPct)}%`:'Preparazione download');});
      recoveryUi.update(56,'Verifica e decifratura','Controllo integrità e apertura della copia cifrata.');
      const decoded=await decryptBlob(encrypted,raw);decoded.blob.name='dossier_cloud_restore.zip';
      recoveryUi.update(60,'Ripristino copia completa','Ricostruzione dell’archivio locale.');
      const restored=await App.restoreZip(decoded.blob,{skipConfirm:true,importUsers:true,replaceAll:true,skipRefresh:true});if(!restored)throw new Error('La copia cloud non è stata ripristinata');
      // Qualsiasi coda precedente allo stato ripristinato viene azzerata mentre il cloud è ancora disattivato.
      await DossierDB.clear('syncQueue');
      const progress=(pct,phase,detail)=>{const rawPct=Math.max(0,Math.min(100,Number(pct)||0));const overall=68+rawPct*.26;updateStatusText(`${phase}${detail?` · ${detail}`:''}`);setCloudProgress(overall,phase,detail);recoveryUi.update(overall,phase,detail);};
      recoveryUi.update(68,'Aggiornamenti successivi','Preparazione dei pacchetti successivi alla copia completa.');
      // Riproduce tutti i pacchetti confermati, di tutti i dispositivi, fino all'ultimo punto valido del 28/08.
      const received=await downloadChanges(row,raw,progress,{includeOwn:true,afterMs:0,beforeMs:RECOVERY_SAFE_CUTOFF_MS,strict:true,markAfterCutoffProcessed:true,requiredBatchId:RECOVERY_SAFE_LAST_BATCH});
      if(received.deferred)throw new Error(`Recupero cloud incompleto: ${received.deferred} pacchetti non sono stati scaricati.`);
      recoveryUi.update(95,'Verifica finale','Controllo del Dossier ricostruito e preparazione dell’accesso.');
      row.lastSnapshotAt=snapshotMs?new Date(snapshotMs).toISOString():new Date().toISOString();row.lastSyncAt=new Date().toISOString();row.lastError='';row.recoveryCheckpoint='2026-08-28T18:48:01+02:00';
      // Rimane disattivato durante il refresh: eventuali scritture interne non devono diventare modifiche da inviare.
      row.enabled=false;await DossierDB.put('cloudSettings',row,{audit:false,sync:false});settings=row;applySyncContext();await DossierSecurity.registerCurrentDevice();
      if(App.refreshAfterExternalRestore)await App.refreshAfterExternalRestore();
      // Le attività interne generate dal caricamento dello stato ripristinato non sono modifiche dell'utente.
      await DossierDB.clear('syncQueue');
      row.enabled=true;await DossierDB.put('cloudSettings',row,{audit:false,sync:false});settings=row;applySyncContext();
      const pendingAfterRecovery=await pendingLocalCount();if(pendingAfterRecovery!==0)throw new Error(`Verifica finale non superata: ${pendingAfterRecovery} modifiche locali risultano ancora in attesa.`);
      await refreshPanel();
      recoveryCompleted=true;recoveryUi.update(100,'Ripristino completato','Dossier aggiornato al 28/08/2026 ore 18:48 · 0 modifiche locali in attesa.');
      await new Promise(r=>setTimeout(r,250));
      alert(`Ripristino completato fino al 28/08/2026 ore 18:48.\n\nSono stati applicati ${received.applied} aggiornamenti cloud. Le modifiche successive al punto di recupero sono state escluse.\n\nIl Dossier verrà ora chiuso per sicurezza: accedi nuovamente con le tue credenziali.`);
      await DossierSecurity.lock('Ripristino cloud completato: accedi nuovamente.');
    }catch(error){
      if(recoveryRow){recoveryRow.enabled=false;recoveryRow.lastError=italianCloudError(error);await DossierDB.put('cloudSettings',recoveryRow,{audit:false,sync:false}).catch(()=>{});settings=recoveryRow;applySyncContext();}
      recoveryUi.update(0,'Ripristino non completato',italianCloudError(error));
      await new Promise(r=>setTimeout(r,500));
      throw error;
    }finally{
      recoveryUi.close();recoveryInProgress=false;DossierSecurity.endTechnicalActivity?.('cloud-restore');
      if(settings?.enabled)startAutomaticSync();
    }
  }

  async function eventToBlob(event,keyBytes){
    const zip=new JSZip();const clone={...event};delete clone.entity;delete clone.previous;const payload={event:clone,entity:null};
    if(event.entity){payload.entity={};for(const [key,value] of Object.entries(event.entity)){if(value instanceof Blob){const name=`blobs/${safePart(key)}.bin`;zip.file(name,value);payload.entity[key]={__blob:name,type:value.type||'application/octet-stream',name:value.name||''};}else payload.entity[key]=value;}}
    zip.file('event.json',JSON.stringify(payload));const packed=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:6}});return encryptBlob(packed,keyBytes,{kind:'change',eventId:event.id,deviceId:event.deviceId});
  }
  async function blobToEvent(blob,keyBytes){const decoded=await decryptBlob(blob,keyBytes);const zip=await JSZip.loadAsync(decoded.blob);const payload=JSON.parse(await zip.file('event.json').async('string'));if(payload.entity){for(const [key,value] of Object.entries(payload.entity)){if(value?.__blob){const file=zip.file(value.__blob);payload.entity[key]=file?await file.async('blob'):new Blob([],{type:value.type||''});}}}return {...payload.event,entity:payload.entity};}

  async function pendingLocalCount(){return (await DossierDB.getAll('syncQueue')).filter(x=>x.status==='pending').length;}

  async function listRemoteChangeItems(row,{excludeOwn=true}={}){
    const result=await get(`/list?remote=${encodeURIComponent(cloudPath('changes',row))}`);
    const all=(result.items||[]).filter(x=>!x.IsDir),allNames=new Set(all.map(x=>String(x.Path||x.Name||'')));
    const ownPrefix=`${safePart(deviceId())}/`;
    const listed=all.filter(x=>{
      const remoteName=String(x.Path||x.Name||'').replace(/^\/+/, '');
      if(excludeOwn&&(remoteName.startsWith(ownPrefix)||remoteName.includes(`/${ownPrefix}`)))return false;
      if(!/\.(dslb|dslc)$/.test(remoteName))return false;
      const leaf=remoteName.split('/').pop(),id=leaf.replace(/\.(dslb|dslc)$/,'');
      if(!id.startsWith('batch23_'))return true;
      const dir=remoteName.includes('/')?remoteName.slice(0,remoteName.lastIndexOf('/')+1):'';
      return allNames.has(`${dir}${id}.commit`)||allNames.has(`${id}.commit`);
    }).sort((a,b)=>String(a.Path||a.Name||'').localeCompare(String(b.Path||b.Name||'')));
    const unique=new Map();for(const item of listed){const remoteName=String(item.Path||item.Name||'');const id=remoteName.split('/').pop().replace(/\.(dslb|dslc)$/,'');if(!unique.has(id)||Number(item.Size||0)>Number(unique.get(id)?.Size||0))unique.set(id,item);}
    return [...unique.values()];
  }

  async function hasRemoteChanges(row){
    const items=await listRemoteChangeItems(row,{excludeOwn:true});
    const processed=new Set(row.processedEventIds||[]);
    return items.some(item=>{const remoteName=String(item.Path||item.Name||'');const id=remoteName.split('/').pop().replace(/\.(dslb|dslc)$/,'');return !processed.has(id);});
  }

  function remoteReminderSnoozeUntil(){
    const value=Number(localStorage.getItem(REMOTE_REMINDER_SNOOZE_KEY)||0);
    return Number.isFinite(value)&&value>0?value:0;
  }
  function setRemoteReminderSnooze(hours){
    const amount=Math.max(1,Number(hours)||1);
    const until=Date.now()+amount*60*60*1000;
    localStorage.setItem(REMOTE_REMINDER_SNOOZE_KEY,String(until));
    return until;
  }
  function clearRemoteReminderSnooze(){localStorage.removeItem(REMOTE_REMINDER_SNOOZE_KEY);}
  function closeRemoteUpdateReminder(){
    document.querySelector('#cloudRemoteReminderV9')?.remove();
    document.querySelector('#cloudRemoteReminderBackdropV9')?.remove();
    remoteReminderVisible=false;
  }
  function scheduleRemoteReminderCheck(delay=REMOTE_REMINDER_INTERVAL_MS){
    clearTimeout(remoteReminderTimer);remoteReminderTimer=null;
    if(!settings?.enabled)return;
    remoteReminderTimer=setTimeout(()=>void checkRemoteUpdateReminder(),Math.max(1000,Number(delay)||REMOTE_REMINDER_INTERVAL_MS));
  }
  function showRemoteUpdateReminder(){
    if(remoteReminderVisible||document.querySelector('#cloudRemoteReminderV9'))return true;
    const activeModal=document.querySelector('#modal');
    if(activeModal&&!activeModal.classList.contains('hidden'))return false;
    const backdrop=document.createElement('div');backdrop.id='cloudRemoteReminderBackdropV9';backdrop.className='modal-backdrop';
    const modal=document.createElement('section');modal.id='cloudRemoteReminderV9';modal.className='modal';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-labelledby','cloudRemoteReminderTitleV9');modal.style.width='min(620px, calc(100% - 28px))';modal.style.top='12vh';
    modal.innerHTML=`<header class="modal-header"><div><h2 id="cloudRemoteReminderTitleV9">Sincronizzazione dati sanitari</h2><p>Aggiornamento del Dossier disponibile</p></div><button type="button" class="icon-btn" id="cloudRemoteReminderCloseV9" aria-label="Chiudi">×</button></header><div class="modal-body" id="cloudRemoteReminderBodyV9"><div class="notice"><strong>I dati sanitari presenti su questo dispositivo non sono aggiornati.</strong><br>Vuoi sincronizzarli adesso?</div><div class="form-actions"><button type="button" class="btn btn-light" id="cloudRemoteReminderLaterV9">Ricordamelo più tardi</button><button type="button" class="btn btn-primary" id="cloudRemoteReminderNowV9">Sincronizza ora</button></div></div>`;
    document.body.append(backdrop,modal);remoteReminderVisible=true;
    const dismissForOneHour=()=>{setRemoteReminderSnooze(1);closeRemoteUpdateReminder();scheduleRemoteReminderCheck(60*60*1000);};
    backdrop.addEventListener('click',dismissForOneHour,{once:true});
    modal.querySelector('#cloudRemoteReminderCloseV9')?.addEventListener('click',dismissForOneHour,{once:true});
    modal.querySelector('#cloudRemoteReminderNowV9')?.addEventListener('click',()=>{clearRemoteReminderSnooze();closeRemoteUpdateReminder();void syncNow({silent:false});},{once:true});
    modal.querySelector('#cloudRemoteReminderLaterV9')?.addEventListener('click',()=>{
      const body=modal.querySelector('#cloudRemoteReminderBodyV9');if(!body)return;
      body.innerHTML=`<div class="notice">Quando vuoi essere avvisato di nuovo?</div><div class="grid grid-2" id="cloudRemoteSnoozeOptionsV9">${[1,3,6,12,24].map(h=>`<button type="button" class="btn btn-light" data-cloud-snooze-hours="${h}">${h} ${h===1?'ora':'ore'}</button>`).join('')}</div><div class="form-actions"><button type="button" class="btn btn-ghost" id="cloudRemoteSnoozeBackV9">Indietro</button></div>`;
      body.querySelectorAll('[data-cloud-snooze-hours]').forEach(btn=>btn.addEventListener('click',()=>{const hours=Number(btn.dataset.cloudSnoozeHours)||1;setRemoteReminderSnooze(hours);closeRemoteUpdateReminder();scheduleRemoteReminderCheck(hours*60*60*1000);},{once:true}));
      body.querySelector('#cloudRemoteSnoozeBackV9')?.addEventListener('click',()=>{closeRemoteUpdateReminder();showRemoteUpdateReminder();},{once:true});
    },{once:true});
    return true;
  }
  async function checkRemoteUpdateReminder(){
    if(recoveryInProgress||running||currentSyncPromise){scheduleRemoteReminderCheck(60*1000);return false;}
    try{
      await loadSettings();
      if(!settings?.enabled)return false;
      if(!navigator.onLine){scheduleRemoteReminderCheck(REMOTE_REMINDER_INTERVAL_MS);return false;}
      const snoozeUntil=remoteReminderSnoozeUntil();
      if(snoozeUntil>Date.now()){scheduleRemoteReminderCheck(Math.min(REMOTE_REMINDER_INTERVAL_MS,Math.max(1000,snoozeUntil-Date.now())));return false;}
      await assertLocalServiceReady();
      if(await hasRemoteChanges(settings)){
        try{await syncNow({silent:true,quick:true,throwOnError:true});clearRemoteReminderSnooze();closeRemoteUpdateReminder();return true;}catch(error){console.warn('Sincronizzazione automatica remota rinviata:',error);const shown=showRemoteUpdateReminder();scheduleRemoteReminderCheck(shown?REMOTE_REMINDER_INTERVAL_MS:60*1000);return shown;}
      }
      clearRemoteReminderSnooze();
      settings.lastRemoteCheckAt=new Date().toISOString();settings.lastError='';
      await DossierDB.put('cloudSettings',settings,{audit:false,sync:false});
    }catch(error){
      const transient=error?.code==='local_service_unavailable';
      if(!transient&&settings){settings.lastError=italianCloudError(error);await DossierDB.put('cloudSettings',settings,{audit:false,sync:false}).catch(()=>{});}
    }
    scheduleRemoteReminderCheck(REMOTE_REMINDER_INTERVAL_MS);return false;
  }

  async function uploadPending(row,keyBytes,onProgress){
    let totalSent=0,guard=0;
    while(guard++<100){
      const queue=(await DossierDB.getAll('syncQueue')).filter(x=>x.status==='pending').sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt)));
      if(!queue.length){if(!totalSent)onProgress?.(100,'Invio modifiche','Nessuna modifica locale da inviare.');return totalSent;}
      let batchId=String(queue.find(x=>x.pendingBatchId)?.pendingBatchId||''),batchQueue;const retryingBatch=!!batchId;
      if(batchId)batchQueue=queue.filter(x=>x.pendingBatchId===batchId);
      else{batchId=`batch23_${new Date().toISOString().replace(/[:.]/g,'-')}_${crypto.randomUUID()}`;batchQueue=queue.filter(x=>!x.pendingBatchId);for(const event of batchQueue){event.pendingBatchId=batchId;await DossierDB.put('syncQueue',event,{audit:false,sync:false});}}
      if(!batchQueue.length)continue;
      const zip=new JSZip();let done=0;
      for(const event of batchQueue){zip.file(`events/${event.id}.dslc`,await eventToBlob(event,keyBytes));done++;onProgress?.((done/batchQueue.length)*100,'Preparazione modifiche',`${done} / ${batchQueue.length} elementi preparati`);}
      const packed=await zip.generateAsync({type:'blob',compression:'STORE'});const encrypted=await encryptBlob(packed,keyBytes,{kind:'change-batch',batchId,deviceId:deviceId(),events:batchQueue.length});
      const finalRemote=cloudPath(`changes/${safePart(deviceId())}/${batchId}.dslb`,row),commitRemote=cloudPath(`changes/${safePart(deviceId())}/${batchId}.commit`,row);
      let existing={exists:false},committed={exists:false};
      if(retryingBatch){[existing,committed]=await Promise.all([remoteStat(finalRemote),remoteStat(commitRemote)]);}
      if(existing?.exists&&Number(existing.item?.Size??-1)!==encrypted.size){for(const event of batchQueue){delete event.pendingBatchId;await DossierDB.put('syncQueue',event,{audit:false,sync:false});}continue;}
      if(!existing?.exists){onProgress?.(null,'Invio modifiche',`${batchQueue.length} elementi in trasferimento`);await uploadWithRealProgress(finalRemote,encrypted,onProgress);}
      if(!committed?.exists){const marker=new Blob([JSON.stringify({format:'DSL5-COMMIT',kind:'changes',batchId,size:encrypted.size,events:batchQueue.length,deviceId:deviceId(),at:new Date().toISOString()})],{type:'application/json'});await uploadWithRealProgress(commitRemote,marker,(pct)=>onProgress?.(pct===100?100:null,'Conferma modifiche','Registrazione del commit del pacchetto.'));}
      const processedOwn=new Set(row.processedEventIds||[]);processedOwn.add(batchId);row.processedEventIds=[...processedOwn].slice(-MAX_PROCESSED);await DossierDB.put('cloudSettings',row,{audit:false,sync:false});
      const sentAt=new Date().toISOString();for(const event of batchQueue){event.status='sent';event.sentAt=sentAt;event.batchId=batchId;delete event.pendingBatchId;await DossierDB.put('syncQueue',event,{audit:false,sync:false});}
      totalSent+=batchQueue.length;onProgress?.(100,'Invio modifiche',`${totalSent} elementi trasferiti e confermati`);
    }
    throw new Error('La coda di sincronizzazione non si è stabilizzata. Riprova dopo aver chiuso eventuali altre schede del Dossier.');
  }


  async function batchToEvents(blob,keyBytes){
    const decoded=await decryptBlob(blob,keyBytes);const zip=await JSZip.loadAsync(decoded.blob);const events=[];
    for(const name of Object.keys(zip.files).filter(n=>n.startsWith('events/')&&n.endsWith('.dslc')&&!zip.files[n].dir))events.push(await blobToEvent(await zip.file(name).async('blob'),keyBytes));
    events.sort((a,b)=>String(a.createdAt||'').localeCompare(String(b.createdAt||'')));return events;
  }

  function syncComparable(value){
    if(value instanceof Blob)return {__blob:true,size:Number(value.size||0),type:String(value.type||''),name:String(value.name||''),lastModified:Number(value.lastModified||0)};
    if(Array.isArray(value))return value.map(syncComparable);
    if(value&&typeof value==='object'){const out={};for(const key of Object.keys(value).sort()){if(key==='_syncMeta')continue;out[key]=syncComparable(value[key]);}return out;}
    if(typeof value==='undefined')return {__undefined:true};
    return value;
  }
  function syncValueEqual(a,b){try{return JSON.stringify(syncComparable(a))===JSON.stringify(syncComparable(b));}catch(_){return a===b;}}
  function syncRecordClock(entity,event=null){
    return {at:String(entity?._syncMeta?.updatedAt||entity?.updatedAt||event?.createdAt||entity?.createdAt||'1970-01-01T00:00:00.000Z'),deviceId:String(entity?._syncMeta?.deviceId||event?.deviceId||'legacy'),eventId:String(entity?._syncMeta?.eventId||event?.id||'')};
  }
  function syncClock(entity,key,event=null){
    const clock=entity?._syncMeta?.fields?.[key];
    if(clock&&typeof clock==='object')return {at:String(clock.at||syncRecordClock(entity,event).at),deviceId:String(clock.deviceId||entity?._syncMeta?.deviceId||event?.deviceId||'legacy'),eventId:String(clock.eventId||'')};
    return syncRecordClock(entity,event);
  }
  function compareSyncClock(a,b){
    const atA=Date.parse(a?.at||'')||0,atB=Date.parse(b?.at||'')||0;
    if(atA!==atB)return atA>atB?1:-1;
    const device=String(a?.deviceId||'').localeCompare(String(b?.deviceId||''));
    if(device)return device>0?1:-1;
    const eventId=String(a?.eventId||'').localeCompare(String(b?.eventId||''));
    return eventId===0?0:(eventId>0?1:-1);
  }
  function laterSyncClock(a,b){return compareSyncClock(a,b)>=0?a:b;}
  function syncEntityKeys(entity){
    const keys=new Set(Object.keys(entity||{}).filter(key=>key!=='_syncMeta'&&key!=='updatedAt'&&key!=='id'&&key!=='key'));
    for(const key of Object.keys(entity?._syncMeta?.fields||{}))if(key!=='updatedAt'&&key!=='id'&&key!=='key')keys.add(key);
    return keys;
  }
  function latestIso(...values){
    let chosen='';let chosenMs=-1;
    for(const value of values){const text=String(value||'');const ms=Date.parse(text);if(Number.isFinite(ms)&&ms>chosenMs){chosen=text;chosenMs=ms;}}
    return chosen||String(values.find(Boolean)||'');
  }
  function earliestIso(...values){
    let chosen='';let chosenMs=Number.POSITIVE_INFINITY;
    for(const value of values){const text=String(value||'');const ms=Date.parse(text);if(Number.isFinite(ms)&&ms<chosenMs){chosen=text;chosenMs=ms;}}
    return chosen||String(values.find(Boolean)||'');
  }
  function mergeRemoteEntity(local,remote,event){
    const merged={...local};const fields={...(local?._syncMeta?.fields||{})};let changed=false;
    const keys=new Set([...syncEntityKeys(local),...syncEntityKeys(remote)]);
    for(const key of keys){
      const hasLocal=Object.prototype.hasOwnProperty.call(local||{},key),hasRemote=Object.prototype.hasOwnProperty.call(remote||{},key);
      const localValue=hasLocal?local[key]:undefined,remoteValue=hasRemote?remote[key]:undefined;
      const localClock=syncClock(local,key,null),remoteClock=syncClock(remote,key,event),winner=laterSyncClock(localClock,remoteClock);
      fields[key]=winner;
      if(syncValueEqual(localValue,remoteValue))continue;
      if(compareSyncClock(remoteClock,localClock)>0){
        if(hasRemote)merged[key]=remoteValue;else delete merged[key];
        changed=true;
      }
    }
    if(local?.id!==undefined)merged.id=local.id;else if(remote?.id!==undefined)merged.id=remote.id;
    if(local?.key!==undefined)merged.key=local.key;else if(remote?.key!==undefined)merged.key=remote.key;
    const createdAt=earliestIso(local?.createdAt,remote?.createdAt);if(createdAt)merged.createdAt=createdAt;
    const recordClock=laterSyncClock(syncRecordClock(local,null),syncRecordClock(remote,event));
    const updatedAt=latestIso(local?._syncMeta?.updatedAt,local?.updatedAt,remote?._syncMeta?.updatedAt,remote?.updatedAt,event?.createdAt);
    if(updatedAt)merged.updatedAt=updatedAt;
    merged._syncMeta={
      revision:Math.max(Number(local?._syncMeta?.revision||0),Number(remote?._syncMeta?.revision||event?.revision||0)),
      baseRevision:Math.max(Number(local?._syncMeta?.baseRevision||0),Number(remote?._syncMeta?.baseRevision||event?.baseRevision||0)),
      eventId:String(recordClock.eventId||event?.id||local?._syncMeta?.eventId||''),
      deviceId:String(recordClock.deviceId||event?.deviceId||local?._syncMeta?.deviceId||'legacy'),
      updatedAt:String(updatedAt||recordClock.at||new Date().toISOString()),
      fields
    };
    return {merged,changed};
  }
  async function applyRemoteEvent(event){
    if(!event||!event.store||!event.entityId)return'ignored';
    const local=await DossierDB.get(event.store,event.entityId).catch(()=>null);
    if(local?._syncMeta?.eventId===event.id)return'ignored';
    if(event.operation==='put'){
      if(!event.entity)return'ignored';
      if(!local){await DossierDB.put(event.store,event.entity,{sync:false,details:{event:'cloud-apply',sourceDevice:event.deviceId}});return'applied';}
      const result=mergeRemoteEntity(local,event.entity,event);
      const metaChanged=!syncValueEqual(local?._syncMeta||{},result.merged?._syncMeta||{});
      if(result.changed||metaChanged)await DossierDB.put(event.store,result.merged,{sync:false,details:{event:'cloud-merge',sourceDevice:event.deviceId}});
      return result.changed?'applied':'ignored';
    }
    if(event.operation==='delete'){
      if(!local)return'ignored';
      const deleteClock={at:String(event.createdAt||'1970-01-01T00:00:00.000Z'),deviceId:String(event.deviceId||'legacy'),eventId:String(event.id||'')};
      const localClock=syncRecordClock(local,null);
      if(compareSyncClock(deleteClock,localClock)>=0){await DossierDB.del(event.store,event.entityId,{sync:false,details:{event:'cloud-delete',sourceDevice:event.deviceId}});return'applied';}
      return'ignored';
    }
    return'ignored';
  }

  async function reconcileStoredConflicts(){
    const rows=(await DossierDB.getAll('syncQueue')).filter(item=>item.status==='conflict'&&item.remoteEvent);
    let reconciled=0;
    for(const row of rows){
      try{await applyRemoteEvent(row.remoteEvent);await DossierDB.del('syncQueue',row.id,{audit:false,sync:false});reconciled++;}
      catch(error){console.warn('Conflitto storico non riconciliato automaticamente:',row.id,error);}
    }
    return reconciled;
  }

  async function downloadChanges(row,keyBytes,onProgress,{includeOwn=false,afterMs=0,beforeMs=0,strict=false,markAfterCutoffProcessed=false,requiredBatchId=''}={}){
    onProgress?.(0,'Confronto archivio','Lettura delle modifiche disponibili sul cloud.');
    let items=await listRemoteChangeItems(row,{excludeOwn:!includeOwn});
    const processed=new Set(row.processedEventIds||[]),quarantined=[];
    const itemId=item=>String(item.Path||item.Name||'').split('/').pop().replace(/\.(dslb|dslc)$/,'');
    const itemMs=item=>archiveTimestampFromName(itemId(item),'batch23_');
    if(afterMs>0)items=items.filter(item=>{const ms=itemMs(item);return !ms||ms>afterMs;});
    if(beforeMs>0){items=items.filter(item=>{const ms=itemMs(item),id=itemId(item);if(ms&&ms>beforeMs){if(markAfterCutoffProcessed){processed.add(id);quarantined.push(id);}return false;}return true;});}
    if(requiredBatchId&&!items.some(item=>itemId(item)===requiredBatchId))throw new Error('L’ultimo pacchetto valido del 28/08/2026 ore 18:48 non è presente nell’archivio cloud. Ripristino interrotto per sicurezza.');
    items.sort((a,b)=>{const am=itemMs(a)||0,bm=itemMs(b)||0;if(am!==bm)return am-bm;return String(a.Path||a.Name||'').localeCompare(String(b.Path||b.Name||''));});
    const todo=items.filter(item=>!processed.has(itemId(item)));let applied=0,conflicts=0,deferred=0;
    if(!todo.length){onProgress?.(100,'Confronto archivio','Nessuna modifica remota da scaricare.');row.processedEventIds=[...processed].slice(-MAX_PROCESSED);return {applied,conflicts,deferred,quarantined:quarantined.length,processedBatches:0};}

    // I pacchetti vengono scaricati in parallelo, ma applicati rigorosamente nell'ordine cronologico.
    // In questo modo il recupero è molto più rapido senza cambiare la logica clinica di merge.
    const blobs=new Array(todo.length),errors=new Array(todo.length),bytesByItem=new Array(todo.length).fill(0);
    const totalBytes=todo.reduce((sum,item)=>sum+Math.max(0,Number(item.Size)||0),0);let nextIndex=0,finishedDownloads=0;
    const reportDownloadProgress=(index,bytes,total)=>{bytesByItem[index]=Math.max(0,Number(bytes)||0);const transferred=bytesByItem.reduce((a,b)=>a+b,0);const pct=totalBytes>0?Math.min(82,(transferred/totalBytes)*82):(finishedDownloads/todo.length)*82;onProgress?.(pct,'Download aggiornamenti',`${finishedDownloads} / ${todo.length} pacchetti scaricati${totalBytes>0?` · ${formatTransferBytes(transferred)} / ${formatTransferBytes(totalBytes)}`:''}`);};
    const worker=async()=>{for(;;){const index=nextIndex++;if(index>=todo.length)return;const item=todo[index],remoteName=String(item.Path||item.Name||'');try{blobs[index]=await downloadStream(cloudPath(`changes/${remoteName}`,row),(bytes,total)=>reportDownloadProgress(index,bytes,total));bytesByItem[index]=Math.max(bytesByItem[index],Number(blobs[index]?.size)||0);}catch(error){errors[index]=error;}finally{finishedDownloads++;reportDownloadProgress(index,bytesByItem[index],Number(item.Size)||0);}}};
    const workers=Array.from({length:Math.min(CHANGE_DOWNLOAD_CONCURRENCY,todo.length)},()=>worker());await Promise.all(workers);

    let done=0;
    for(let index=0;index<todo.length;index++){
      const item=todo[index],remoteName=String(item.Path||item.Name||''),id=itemId(item),blob=blobs[index],lastError=errors[index];
      if(!blob){if(strict)throw new Error(`Pacchetto cloud obbligatorio non scaricato: ${remoteName}. ${lastError?.message||''}`);deferred++;done++;continue;}
      const events=remoteName.endsWith('.dslb')?await batchToEvents(blob,keyBytes):[await blobToEvent(blob,keyBytes)];
      for(const event of events){const outcome=await applyRemoteEvent(event);if(outcome==='applied')applied++;if(outcome==='conflict')conflicts++;}
      processed.add(id);done++;const pct=82+(done/todo.length)*18;onProgress?.(pct,'Applicazione aggiornamenti',`${done} / ${todo.length} pacchetti applicati`);
    }
    row.processedEventIds=[...processed].slice(-MAX_PROCESSED);
    return {applied,conflicts,deferred,quarantined:quarantined.length,processedBatches:done};
  }

  async function syncNow({silent=false,forceSnapshot=false,includeOwnRemote=false,pullOnly=false,requireComplete=false,throwOnError=false,recoveryAfterMs=0,quick=false}={}){
    if(recoveryInProgress&&!pullOnly){if(!silent)App.toast('Ripristino cloud in corso. La sincronizzazione in uscita è temporaneamente disattivata.');return;}
    if(running||currentSyncPromise){if(!silent){App.toast('Sincronizzazione già in corso. Attendi il completamento.');updateStatusText('Sincronizzazione già in corso.');}return currentSyncPromise;}
    const task=(async()=>{
      await mediaPreferenceWrite.catch(()=>{});await loadSettings();
      if(!settings?.enabled){if(!silent)App.toast('Nessun archivio cloud attivo');return;}
      if(!navigator.onLine){if(!silent)App.toast('Connessione assente: le modifiche restano in attesa');return;}
      const mediaDue=!pullOnly&&await mediaSnapshotNeeded(settings).catch(()=>false);
      const progress=(pct,phase,detail)=>{updateStatusText(`${phase}${detail?` · ${detail}`:''}`);setCloudProgress(pct,phase,detail);};
      return runWithCrossTabSyncLock(async()=>{running=true;setSyncButtonsBusy(true);DossierSecurity.beginTechnicalActivity?.('cloud-sync');progress(null,quick?'Aggiornamento rapido':'Sincronizzazione cloud','Avvio e verifica della chiave.');
        try{await loadSettings();await assertLocalServiceReady();const key=await masterKey(settings,{promptIfMissing:!silent});await consumeFamilyAccountCompletions().catch(()=>0);const reconciled=await reconcileStoredConflicts();if(reconciled)progress(null,'Riconciliazione archivio',`${reconciled} conflitti storici risolti automaticamente`);const received=await downloadChanges(settings,key,progress,{includeOwn:includeOwnRemote,afterMs:recoveryAfterMs});received.reconciled=reconciled;if(requireComplete&&received.deferred)throw new Error(`Recupero cloud incompleto: ${received.deferred} pacchetti non sono stati scaricati. Riprova senza modificare i dati locali.`);await DossierDB.put('cloudSettings',settings,{audit:false,sync:false});await DossierSecurity.assertDeviceActive();const sent=pullOnly?0:await uploadPending(settings,key,progress);await loadSettings();const activity=sent+received.applied;const lastSnapshot=settings.lastSnapshotAt?new Date(settings.lastSnapshotAt).getTime():0;const eventsSince=Number(settings.incrementalEventsSinceSnapshot||0)+activity;const snapshotDue=!pullOnly&&(forceSnapshot||mediaDue||!lastSnapshot||(activity>0&&(Date.now()-lastSnapshot>SNAPSHOT_MAX_AGE_MS||eventsSince>=SNAPSHOT_EVENT_THRESHOLD)));
        if(forceSnapshot){progress(null,'Consolidamento archivio','Creazione della copia completa richiesta.');await uploadSnapshot(settings,key,progress);settings.incrementalEventsSinceSnapshot=0;delete settings.snapshotDeferredAt;delete settings.snapshotDeferredReason;}
        else if(pullOnly){settings.incrementalEventsSinceSnapshot=eventsSince;progress(100,'Recupero cloud completato',received.applied?`${received.applied} modifiche remote applicate senza modificare il cloud.`:'Archivio locale allineato senza modificare il cloud.');}
        else{settings.incrementalEventsSinceSnapshot=eventsSince;if(snapshotDue){settings.snapshotDeferredAt=settings.snapshotDeferredAt||new Date().toISOString();settings.snapshotDeferredReason=mediaDue?'media':(!lastSnapshot?'initial':eventsSince>=SNAPSHOT_EVENT_THRESHOLD?'events':'age');scheduleSnapshotMaintenance(SNAPSHOT_MAINTENANCE_DELAY_MS);}setTimeout(()=>void pruneOldSnapshots(settings,MAX_SNAPSHOTS).catch(error=>console.warn('Rotazione snapshot rinviata:',error)),3000);progress(100,quick?'Aggiornamento rapido completato':'Aggiornamento dati completato',activity?'Modifiche incrementali confermate. La copia completa, quando necessaria, viene gestita separatamente senza rallentare l’aggiornamento.':'Nessuna modifica da trasferire.');}
        settings.lastSyncAt=new Date().toISOString();settings.lastError='';await DossierDB.put('cloudSettings',settings,{audit:false,sync:false});progress(100,quick?'Aggiornamento completato':'Sincronizzazione completata',`${sent} inviate · ${received.applied} ricevute${received.deferred?` · ${received.deferred} rinviate`:''}`);if(received.applied&&App.refreshAfterExternalRestore)await App.refreshAfterExternalRestore();if(!silent)App.toast(`Sincronizzazione completata: ${sent} inviate, ${received.applied} ricevute${received.reconciled?` · ${received.reconciled} conflitti storici riconciliati`:''}`);}
        catch(error){const transientKeyMissing=silent&&error?.code==='recovery_key_missing';const transientService=silent&&error?.code==='local_service_unavailable';const message=italianCloudError(error);if(settings){if(!transientKeyMissing&&!transientService)settings.lastError=message;if(String(error.message).includes('revocato'))settings.enabled=false;await DossierDB.put('cloudSettings',settings,{audit:false,sync:false}).catch(()=>{});}applySyncContext();if(!(transientKeyMissing||transientService))setCloudProgress(0,'Sincronizzazione non completata',message);if(!silent)App.toast(`Sincronizzazione non completata: ${message}`);if(throwOnError)throw error;}
        finally{running=false;setSyncButtonsBusy(false);DossierSecurity.endTechnicalActivity?.('cloud-sync');scheduleAutomaticSync(AUTO_SYNC_INTERVAL_MS);scheduleFastRemotePoll(FAST_REMOTE_POLL_INTERVAL_MS);if(await pendingLocalCount().catch(()=>0))scheduleFastPush(FAST_REMOTE_RETRY_MS);await new Promise(r=>setTimeout(r,150));if(!silent)await refreshPanel().catch(()=>{});}
      },{silent});
    })();
    currentSyncPromise=task;
    try{return await task;}finally{if(currentSyncPromise===task)currentSyncPromise=null;}
  }


  async function disableCloud(){if(!settings?.enabled)return;if(!confirm('Scollegare questo dispositivo dall’archivio cloud? I dati locali resteranno disponibili e i file cloud non verranno cancellati.'))return;settings.enabled=false;await DossierDB.put('cloudSettings',settings,{audit:false,sync:false});await DossierSecurity.setDeviceCloudLinked(false,'');applySyncContext();clearTimeout(syncTimer);clearTimeout(fastPushTimer);clearTimeout(fastRemoteTimer);clearTimeout(snapshotMaintenanceTimer);syncTimer=fastPushTimer=fastRemoteTimer=snapshotMaintenanceTimer=null;await refreshPanel();}
  function conflictLabel(entity={},fallback='Elemento') {return entity.title||entity.name||entity.medication||entity.code||entity.firstName&&`${entity.firstName} ${entity.lastName||''}`||fallback;}
  function conflictSummary(entity={}) {const excluded=new Set(['fileBlob','avatarBlob','healthCardFrontBlob','healthCardBackBlob','_syncMeta']);const rows=[];for(const [key,value] of Object.entries(entity||{})){if(excluded.has(key)||value===null||value===undefined||value==='')continue;if(typeof value==='object')continue;rows.push(`<dt>${esc(key)}</dt><dd>${esc(String(value).slice(0,500))}</dd>`);if(rows.length>=12)break;}return rows.join('')||'<dd>Nessun dettaglio testuale disponibile</dd>';}
  async function resolveOneConflict(conflict,choice){const remote=conflict.remoteEvent;const local=conflict.localEntity;
    if(choice==='local'){
      if(local)await DossierDB.put(conflict.store,{...local,updatedAt:new Date().toISOString()},{details:{event:'conflict-local'}});
      else if(remote.operation==='delete')await DossierDB.del(conflict.store,conflict.entityId,{details:{event:'conflict-local-delete'}});
    }else if(choice==='remote'){
      if(remote.operation==='delete')await DossierDB.del(conflict.store,conflict.entityId,{sync:false,details:{event:'conflict-remote-delete'}});
      else await DossierDB.put(conflict.store,remote.entity,{sync:false,details:{event:'conflict-remote'}});
    }else if(choice==='both'){
      if(remote.operation==='delete')throw new Error('Non è possibile conservare entrambe le versioni quando quella remota è una cancellazione');
      const duplicate={...remote.entity,id:uid('merged'),updatedAt:new Date().toISOString(),createdAt:remote.entity?.createdAt||new Date().toISOString()};delete duplicate._syncMeta;
      if(duplicate.title)duplicate.title+= ' (versione concorrente)';else if(duplicate.name)duplicate.name+=' (versione concorrente)';else if(duplicate.medication)duplicate.notes=`${duplicate.notes||''}
Versione concorrente conservata`.trim();
      await DossierDB.put(conflict.store,duplicate,{details:{event:'conflict-both'}});
    }
    await DossierDB.del('syncQueue',conflict.id,{audit:false,sync:false});
  }
  async function resolveConflicts(){const conflicts=(await DossierDB.getAll('syncQueue')).filter(x=>x.status==='conflict');if(!conflicts.length){App.toast('Nessun conflitto presente');return;}
    const modal=document.querySelector('#modal'),backdrop=document.querySelector('#modalBackdrop'),body=document.querySelector('#modalBody');if(!modal||!body)return;
    document.querySelector('#modalTitle').textContent='Conflitti di sincronizzazione';document.querySelector('#modalSubtitle').textContent='Nessuna versione viene sovrascritta senza una scelta esplicita.';
    body.innerHTML=`<div class="conflict-list">${conflicts.map((c,i)=>`<article class="conflict-card" data-conflict="${esc(c.id)}"><header><div><span class="badge warning">${esc(c.store)}</span><h3>${esc(conflictLabel(c.localEntity||c.remoteEvent?.entity,`Conflitto ${i+1}`))}</h3></div><small>${esc(c.remoteEvent?.deviceId||'altro dispositivo')} · ${c.remoteEvent?.createdAt?new Date(c.remoteEvent.createdAt).toLocaleString('it-IT'):''}</small></header><div class="conflict-columns"><section><h4>Versione locale</h4><dl>${conflictSummary(c.localEntity)}</dl></section><section><h4>Versione ricevuta</h4><dl>${c.remoteEvent?.operation==='delete'?'<dd>Richiesta di eliminazione</dd>':conflictSummary(c.remoteEvent?.entity)}</dl></section></div><div class="row-actions"><button class="btn btn-light" data-conflict-choice="local">Conserva locale</button><button class="btn btn-primary" data-conflict-choice="remote">Usa ricevuta</button>${c.remoteEvent?.operation!=='delete'?'<button class="btn btn-light" data-conflict-choice="both">Conserva entrambe</button>':''}</div></article>`).join('')}</div>`;
    modal.classList.remove('hidden');backdrop?.classList.remove('hidden');
    body.querySelectorAll('[data-conflict-choice]').forEach(btn=>btn.addEventListener('click',async()=>{const card=btn.closest('[data-conflict]');const conflict=conflicts.find(x=>x.id===card.dataset.conflict);if(!conflict)return;btn.disabled=true;try{await resolveOneConflict(conflict,btn.dataset.conflictChoice);card.remove();App.toast('Conflitto risolto');if(!body.querySelector('.conflict-card')){modal.classList.add('hidden');backdrop?.classList.add('hidden');await syncNow({silent:true});if(App.refreshAfterExternalRestore)await App.refreshAfterExternalRestore();}}catch(error){App.toast(error.message);btn.disabled=false;}}));
  }

  async function saveRecoveryKeyCopy(){
    if(!settings?.enabled)throw new Error('Archivio cloud non configurato');
    const raw=await masterKey(settings,{promptIfMissing:false});
    const recovery=b64url(raw);
    const text=`DOSSIER SANITARIO LOCALE
Chiave di recupero archivio

Archivio: ${settings.displayName||'Archivio familiare'}
Identificativo: ${settings.archiveId}
Servizio: ${settings.provider||settings.remoteName}

CHIAVE: ${formatRecovery(recovery)}

Conservare separatamente dal computer e dal cloud. Chi possiede questa chiave può decifrare l'archivio.`;
    downloadText(text,`CHIAVE_RECUPERO_DOSSIER_${String(settings.archiveId||'').slice(-8)}.txt`);
  }
  async function replaceStoredRecoveryKey(){
    if(!settings?.enabled)throw new Error('Archivio cloud non configurato');
    const entered=prompt('Incolla la chiave di recupero corretta dell’archivio. Verrà verificata sullo snapshot cloud prima di essere memorizzata su questo dispositivo.');
    if(entered===null)return false;
    const raw=decodeRecoveryKey(entered);if(!raw)throw new Error('Chiave di recupero non valida');
    const snap=await latestSnapshot(settings);if(!snap)throw new Error('Nessuno snapshot disponibile per verificare la chiave');
    const encrypted=await download(cloudPath(`snapshots/${snap.Path||snap.Name}`,settings));
    try{await decryptBlob(encrypted,raw);}catch{throw new Error('La chiave non corrisponde a questo archivio');}
    await saveDeviceMasterKey(settings,b64url(raw),{alsoForCurrentUser:true});
    App.toast('Chiave verificata e memorizzata su questo dispositivo');
    return true;
  }
  function cloudHowItWorksHtml(){return `<details class="cloud-setup cloud-how-it-works"><summary>Come funzionano sincronizzazione e ripristino</summary><div class="cloud-how-it-works-body"><p><strong>Sincronizzazione</strong>: allinea le modifiche tra questo dispositivo e l’archivio cloud. Durante una normale sincronizzazione non serve uscire dal Dossier.</p><p><strong>Ripristino</strong>: recupera prima la copia completa, poi tutti gli aggiornamenti successivi confermati. Durante il recupero il Dossier non invia nuove modifiche al cloud e non sostituisce i dati locali finché la copia non è stata verificata.</p><p>Quando il ripristino è terminato e verificato, il Dossier esegue il <strong>logout automatico</strong>. Accedi nuovamente con le tue credenziali; se sul tuo account è attiva la verifica in due passaggi, in quel momento verrà richiesto anche il codice TOTP o il codice previsto.</p></div></details>`;}

  async function panelHtml(){
    // La pagina Backup deve riflettere SEMPRE il record persistito, anche se
    // viene aperta immediatamente dopo il login prima del timer di startup.
    await loadSettings();
    const st=await status();const rs=!settings?.enabled&&st.installed?await remotes():[];const quotaInfo=settings?.enabled?await cloudQuota(settings):{supported:false};const conflicts=(await DossierDB.getAll('syncQueue').catch(()=>[])).filter(x=>x.status==='conflict').length;const pending=(await DossierDB.getAll('syncQueue').catch(()=>[])).filter(x=>x.status==='pending').length;const dicomRows=await DossierDB.getAll('dicomStudies').catch(()=>[]),imageRows=await DossierDB.getAll('mediaAttachments').catch(()=>[]),localMediaBytes=dicomRows.filter(x=>x.storageMode!=='external').reduce((n,x)=>n+Number(x.totalBytes||0),0)+imageRows.reduce((n,x)=>n+Number(x.size||0),0),mediaSizeLabel=localMediaBytes<1048576?`${Math.round(localMediaBytes/1024)} KB`:localMediaBytes<1073741824?`${(localMediaBytes/1048576).toFixed(1)} MB`:`${(localMediaBytes/1073741824).toFixed(2)} GB`;
    if(settings?.enabled)return `<section class="card cloud-card" id="cloudPanel"><div class="card-title-row"><div><h2>Archivio cloud collegato</h2><p class="kpi-note">Aggiornamento automatico rapido attivo tra questo dispositivo e l’archivio familiare.</p></div><span class="badge success">Sincronizzazione attiva</span></div><div class="cloud-status-grid"><div><span>Servizio</span><strong>${esc(PROVIDERS[settings.provider]?.label||settings.provider||settings.remoteName)}</strong></div><div><span>Archivio</span><strong>${esc(settings.displayName||settings.archiveId)}</strong></div><div><span>Ultima sincronizzazione</span><strong>${settings.lastSyncAt?new Date(settings.lastSyncAt).toLocaleString('it-IT'):'Non ancora completata'}</strong></div><div><span>Modifiche in attesa</span><strong>${pending}</strong></div><div><span>Conflitti</span><strong>${conflicts}</strong></div><div><span>Dispositivo</span><strong>${esc(DossierSecurity.currentDevice()?.name||'Dispositivo locale')}</strong></div></div>${quotaCardHtml(quotaInfo)}${settings.lastError?`<div class="notice danger">${esc(italianCloudError(settings.lastError))}</div>`:''}${pending>0?`<div class="notice warning cloud-pending-advice"><strong>${pending===1?'È presente 1 modifica locale non ancora sincronizzata.':`Sono presenti ${pending} modifiche locali non ancora sincronizzate.`}</strong><span> L’invio automatico parte entro pochi secondi; “Sincronizza adesso” forza il controllo immediato.</span></div>`:''}<div id="cloudLiveStatus" class="notice hidden"></div><div id="cloudSyncProgress" class="cloud-sync-progress hidden"><div class="cloud-sync-progress-head"><strong data-cloud-progress-stage>Sincronizzazione</strong><span data-cloud-progress-percent>0%</span></div><div class="cloud-sync-progress-track"><span data-cloud-progress-bar style="width:0%"></span></div><small data-cloud-progress-detail></small></div><label class="check-row cloud-media-backup-choice"><input type="checkbox" id="cloudIncludeMediaArchive" ${settings.includeMediaArchive?'checked':''}><span><strong>Includi DICOM e immagini associate nel backup cloud</strong><small>Disattivato per impostazione predefinita. Archivio locale attuale: ${mediaSizeLabel}. L’attivazione può occupare rapidamente molti GB di spazio cloud.</small></span></label><div class="row-actions"><button class="btn btn-primary" id="cloudSyncNow">Sincronizza adesso</button><button class="btn btn-light" id="cloudSnapshotNow">Crea copia cifrata</button><button class="btn btn-light" id="cloudConflicts">Conflitti (${conflicts})</button><button class="btn btn-light" id="cloudSaveRecovery">Salva copia chiave</button><button class="btn btn-light" id="cloudReplaceRecovery">Aggiorna chiave memorizzata</button><button class="btn btn-danger" id="cloudDisconnect">Scollega dispositivo</button></div><p class="kpi-note">Il provider è vincolato all'archivio corrente. Per cambiarlo servirà una procedura separata di migrazione. Password cloud, chiave dell’archivio e credenziali del Dossier restano separate.</p>${cloudHowItWorksHtml()}</section>`;
    if(!st.installed)return `<section class="card cloud-card" id="cloudPanel"><div class="card-title-row"><div><h2>Archivio condiviso esterno</h2><p class="kpi-note">MEGA, Google Drive e Apple iCloud possono essere collegati direttamente dal programma.</p></div><span class="badge warning">Da installare</span></div><div class="notice">Il componente di collegamento viene scaricato una sola volta, ne viene verificata l’integrità e resta nella cartella tecnica del Dossier.</div>${st.error?`<div class="notice danger">${esc(st.error)}</div>`:''}<button class="btn btn-primary" id="cloudInstallConnector">Installa connettore cloud</button></section>`;
    const current=PROVIDERS[selectedProvider]?selectedProvider:'mega';const options=Object.entries(PROVIDERS).map(([id,info])=>`<option value="${id}" ${id===current?'selected':''}>${esc(info.label)}</option>`).join('');const remoteOptions=providerRemoteOptions(rs,current);const hasRemote=!!remoteOptions;const megaSignup=MEGA_REFERRAL_URL||MEGA_SIGNUP_FALLBACK;
    return `<section class="card cloud-card" id="cloudPanel"><div class="card-title-row"><div><h2>Archivio condiviso esterno</h2><p class="kpi-note">Scegli un solo servizio cloud. Il Dossier userà quel provider per creare o collegare l'archivio familiare.</p></div><span class="badge">${esc(st.version||'Connettore installato')}</span></div>${cloudHowItWorksHtml()}<details class="cloud-setup" open><summary>1. Scegli e collega il servizio cloud</summary><div class="cloud-provider-choice"><div class="cloud-provider-selector"><h3>Servizio cloud</h3><label>Provider<select class="form-control" id="cloudProviderSelect">${options}</select></label><div class="cloud-security-box" id="cloudSecurityInfo">${providerDescription(current)}</div><p class="kpi-note">È possibile creare un solo archivio condiviso alla volta. Dopo la creazione, il provider resta associato all'archivio.</p></div><div class="cloud-provider-stage"><div class="cloud-provider-pane ${current==='mega'?'':'hidden'}" data-provider-pane="mega"><h3>MEGA</h3><div class="cloud-mega-account-grid"><form id="megaCloudForm" class="cloud-provider-compact"><h4>Hai già un account MEGA</h4><label>Nome connessione<input class="form-control" name="remoteName" value="mega_dossier" required></label><label>E-mail MEGA<input class="form-control" type="email" name="email" required autocomplete="off" autocapitalize="none" spellcheck="false"></label><label>Password MEGA<input class="form-control" type="password" name="password" required autocomplete="new-password"></label><button class="btn btn-primary">Collega MEGA</button></form><div class="cloud-provider-compact"><h4>Non hai un account MEGA</h4><p class="kpi-note">Crea gratuitamente l'account sul sito ufficiale MEGA, poi torna qui per collegarlo.</p><a class="btn btn-light" id="megaRegisterLink" href="${esc(megaSignup)}" target="_blank" rel="noopener noreferrer">Crea un account MEGA gratuito</a><p class="cloud-referral-note">Il collegamento di registrazione può includere un codice di invito del distributore dell'applicazione. Il codice non viene mostrato nell'interfaccia.</p></div></div></div><div class="cloud-provider-pane ${current==='drive'?'':'hidden'}" data-provider-pane="drive"><h3>Google Drive</h3><p class="kpi-note">L'accesso avviene tramite la procedura ufficiale Google. La password Google non viene inserita nel Dossier.</p><div><button class="btn btn-primary" id="configureGoogle">Accedi con Google</button></div></div><div class="cloud-provider-pane ${current==='iclouddrive'?'':'hidden'}" data-provider-pane="iclouddrive"><h3>Apple iCloud</h3><p class="kpi-note">La modalità di accesso dipende dall'account Apple e dal connettore iCloud disponibile sul dispositivo.</p><div><button class="btn btn-primary" id="configureIcloud">Accedi con Apple</button></div></div></div></div></details><details class="cloud-setup" ${hasRemote?'open':''}><summary>2. Crea o collega l'archivio familiare</summary><div class="cloud-archive-provider-line">Provider selezionato: <strong id="cloudArchiveProviderLabel">${esc(providerLabel(current))}</strong></div><div id="cloudArchiveForms">${hasRemote?archiveFormsHtml(remoteOptions,current):'<div class="notice warning cloud-no-connection">Collega prima un account del servizio selezionato.</div>'}</div></details><div id="cloudLiveStatus" class="notice hidden"></div></section>`;
  }

  function archiveFormsHtml(remoteOptions,provider){
    return `<div class="grid grid-2"><form id="createCloudArchiveForm" class="cloud-provider"><h3>Crea nuovo archivio</h3><input type="hidden" name="provider" value="${esc(provider)}"><label>Connessione<select class="form-control" name="remote">${remoteOptions}</select></label><label>Nome archivio<input class="form-control" name="archiveName" value="Archivio familiare" required></label><label>Cartella cloud dedicata<input class="form-control" name="basePath" value="Dossier Sanitario Locale" required><small>Con account distinti, indica il nome o percorso della cartella condivisa.</small></label><button class="btn btn-primary">Crea archivio protetto</button></form><form id="linkCloudArchiveForm" class="cloud-provider"><h3>Collega archivio esistente</h3><input type="hidden" name="provider" value="${esc(provider)}"><label>Connessione<select class="form-control" name="remote">${remoteOptions}</select></label><label>Cartella cloud dedicata<input class="form-control" name="basePath" value="Dossier Sanitario Locale" required><small>Deve corrispondere alla cartella propria o condivisa visibile nell’account.</small></label><label>Identificativo archivio<input class="form-control mono" name="archiveId" placeholder="archive_…" required></label><label>Chiave di recupero<input class="form-control mono" name="recoveryKey" required></label><button class="btn btn-primary">Collega questo dispositivo</button></form></div>`;
  }

  function setBusy(form,busy,text='Operazione in corso…'){const btn=form?.querySelector('button[type="submit"],button:not([type])');if(!btn)return;if(busy){btn.dataset.label=btn.textContent;btn.textContent=text;btn.disabled=true;}else{btn.textContent=btn.dataset.label||btn.textContent;btn.disabled=false;}}
  async function refreshProviderUi(root=document){
    const select=root.querySelector('#cloudProviderSelect');if(!select)return;selectedProvider=PROVIDERS[select.value]?select.value:'mega';localStorage.setItem('dossierCloudProvider',selectedProvider);root.querySelectorAll('[data-provider-pane]').forEach(pane=>pane.classList.toggle('hidden',pane.dataset.providerPane!==selectedProvider));const info=root.querySelector('#cloudSecurityInfo');if(info)info.innerHTML=providerDescription(selectedProvider);const label=root.querySelector('#cloudArchiveProviderLabel');if(label)label.textContent=providerLabel(selectedProvider);const list=await remotes();const remoteOptions=providerRemoteOptions(list,selectedProvider);const forms=root.querySelector('#cloudArchiveForms');if(forms)forms.innerHTML=remoteOptions?archiveFormsHtml(remoteOptions,selectedProvider):'<div class="notice warning cloud-no-connection">Collega prima un account del servizio selezionato.</div>';bindArchiveForms(root);
  }
  function bindArchiveForms(root=document){
    root.querySelector('#createCloudArchiveForm')?.addEventListener('submit',async e=>{e.preventDefault();const form=e.currentTarget;setBusy(form,true,'Creazione e cifratura…');try{await createArchive(form);}catch(err){App.toast(err.message);}finally{setBusy(form,false);}});
    root.querySelector('#linkCloudArchiveForm')?.addEventListener('submit',async e=>{e.preventDefault();const form=e.currentTarget;setBusy(form,true,'Download e ripristino…');try{await linkArchive(form);}catch(err){App.toast(err.message);}finally{setBusy(form,false);}});
  }
  async function bind(root=document){
    root.querySelector('#cloudInstallConnector')?.addEventListener('click',e=>installConnector(e.currentTarget).catch(err=>App.toast(err.message)));
    root.querySelector('#cloudProviderSelect')?.addEventListener('change',()=>refreshProviderUi(root).catch(err=>App.toast(err.message)));
    root.querySelector('#megaCloudForm')?.addEventListener('submit',async e=>{e.preventDefault();const form=e.currentTarget;setBusy(form,true);try{await configureMega(form);}catch(err){App.toast(err.message);}finally{setBusy(form,false);}});
    root.querySelector('#configureGoogle')?.addEventListener('click',async()=>{try{await configureGuided('drive',`google_${Date.now().toString(36)}`);}catch(err){App.toast(err.message);}});
    root.querySelector('#configureIcloud')?.addEventListener('click',async()=>{try{await configureGuided('iclouddrive',`icloud_${Date.now().toString(36)}`);}catch(err){App.toast(err.message);}});
    bindArchiveForms(root);
    root.querySelector('#cloudIncludeMediaArchive')?.addEventListener('change',e=>{const enabled=!!e.currentTarget.checked;mediaPreferenceWrite=mediaPreferenceWrite.catch(()=>{}).then(()=>persistMediaPreference(enabled));mediaPreferenceWrite.then(()=>App.toast(enabled?'DICOM e immagini saranno inclusi nel backup cloud':'DICOM e immagini esclusi dal backup cloud')).catch(err=>App.toast(`Impostazione backup media non salvata: ${italianCloudError(err)}`));});
    root.querySelector('#cloudSyncNow')?.addEventListener('click',async()=>{await mediaPreferenceWrite.catch(()=>{});await syncNow();});root.querySelector('#cloudSnapshotNow')?.addEventListener('click',async()=>{await mediaPreferenceWrite.catch(()=>{});await syncNow({forceSnapshot:true});});root.querySelector('#cloudDisconnect')?.addEventListener('click',disableCloud);root.querySelector('#cloudConflicts')?.addEventListener('click',resolveConflicts);root.querySelector('#cloudSaveRecovery')?.addEventListener('click',()=>saveRecoveryKeyCopy().catch(err=>App.toast(err.message)));root.querySelector('#cloudReplaceRecovery')?.addEventListener('click',()=>replaceStoredRecoveryKey().catch(err=>App.toast(err.message)));
  }
  function updateStatusText(text){const el=document.querySelector('#cloudLiveStatus');if(!el)return;el.textContent=text;el.classList.remove('hidden');}
  async function refreshPanel(){const host=document.querySelector('#cloudPanel')?.parentElement;if(!host||!document.querySelector('#cloudPanel'))return;const old=document.querySelector('#cloudPanel');const wrap=document.createElement('div');wrap.innerHTML=await panelHtml();old.replaceWith(wrap.firstElementChild);await bind(document);}
  function scheduleAutomaticSync(delay=AUTO_SYNC_INTERVAL_MS){clearTimeout(syncTimer);syncTimer=null;if(!settings?.enabled)return;syncTimer=setTimeout(()=>void automaticSyncCheck(),Math.max(1000,Number(delay)||AUTO_SYNC_INTERVAL_MS));}
  function nextAutomaticDelay(row=settings){const last=Date.parse(row?.lastSyncAt||'');if(!Number.isFinite(last)||!last)return AUTO_SYNC_START_DELAY_MS;return Math.max(AUTO_SYNC_START_DELAY_MS,AUTO_SYNC_INTERVAL_MS-(Date.now()-last));}
  function scheduleFastPush(delay=FAST_PUSH_DEBOUNCE_MS){clearTimeout(fastPushTimer);fastPushTimer=null;if(!settings?.enabled)return;fastPushTimer=setTimeout(()=>void fastPushPending(),Math.max(250,Number(delay)||FAST_PUSH_DEBOUNCE_MS));}
  async function fastPushPending(){
    if(!settings?.enabled)return;if(recoveryInProgress||running||currentSyncPromise){scheduleFastPush(FAST_REMOTE_RETRY_MS);return;}if(!navigator.onLine){scheduleFastPush(FAST_REMOTE_RETRY_MS);return;}
    try{const pending=await pendingLocalCount();if(pending>0)await syncNow({silent:true,quick:true,throwOnError:true});}
    catch(error){console.warn('Invio rapido modifiche rinviato:',error);scheduleFastPush(FAST_REMOTE_RETRY_MS);}
  }
  function scheduleFastRemotePoll(delay=FAST_REMOTE_POLL_INTERVAL_MS){clearTimeout(fastRemoteTimer);fastRemoteTimer=null;if(!settings?.enabled)return;const effective=document.visibilityState==='hidden'?Math.max(30000,Number(delay)||0):Math.max(3000,Number(delay)||FAST_REMOTE_POLL_INTERVAL_MS);fastRemoteTimer=setTimeout(()=>void fastRemotePoll(),effective);}
  async function fastRemotePoll(){
    if(!settings?.enabled)return;if(recoveryInProgress||running||currentSyncPromise){scheduleFastRemotePoll(5000);return;}if(!navigator.onLine){scheduleFastRemotePoll(FAST_REMOTE_RETRY_MS);return;}
    try{await loadSettings();await assertLocalServiceReady();if(await hasRemoteChanges(settings)){await syncNow({silent:true,quick:true,throwOnError:true});clearRemoteReminderSnooze();closeRemoteUpdateReminder();}}
    catch(error){if(error?.code!=='local_service_unavailable')console.warn('Controllo rapido aggiornamenti rinviato:',error);}
    finally{scheduleFastRemotePoll(FAST_REMOTE_POLL_INTERVAL_MS);}
  }
  function scheduleSnapshotMaintenance(delay=SNAPSHOT_MAINTENANCE_DELAY_MS){clearTimeout(snapshotMaintenanceTimer);snapshotMaintenanceTimer=null;if(!settings?.enabled)return;snapshotMaintenanceTimer=setTimeout(()=>void runSnapshotMaintenance(),Math.max(60000,Number(delay)||SNAPSHOT_MAINTENANCE_DELAY_MS));}
  async function runSnapshotMaintenance(){
    if(!settings?.enabled||!settings?.snapshotDeferredAt)return;if(recoveryInProgress||running||currentSyncPromise||!navigator.onLine){scheduleSnapshotMaintenance(10*60*1000);return;}
    try{if(await pendingLocalCount()>0){scheduleSnapshotMaintenance(10*60*1000);return;}await syncNow({silent:true,forceSnapshot:true,throwOnError:true});}
    catch(error){console.warn('Copia completa differita rinviata:',error);scheduleSnapshotMaintenance(30*60*1000);}
  }
  async function automaticSyncCheck(){
    if(recoveryInProgress){scheduleAutomaticSync(60*1000);return;}
    if(!settings?.enabled)return;if(running||currentSyncPromise){scheduleAutomaticSync(60*1000);return;}if(!navigator.onLine){scheduleAutomaticSync(AUTO_SYNC_INTERVAL_MS);return;}
    let delegated=false;try{
      await loadSettings();await assertLocalServiceReady();
      if(await hasRemoteChanges(settings)){delegated=true;try{await syncNow({silent:true,quick:true,throwOnError:true});clearRemoteReminderSnooze();closeRemoteUpdateReminder();}catch(error){console.warn('Sincronizzazione automatica remota rinviata:',error);if(remoteReminderSnoozeUntil()<=Date.now())showRemoteUpdateReminder();}return;}
      const pending=await pendingLocalCount();if(pending>0){delegated=true;await syncNow({silent:true,quick:true});return;}
      if(await mediaSnapshotNeeded(settings)){settings.snapshotDeferredAt=settings.snapshotDeferredAt||new Date().toISOString();settings.snapshotDeferredReason='media';await DossierDB.put('cloudSettings',settings,{audit:false,sync:false});scheduleSnapshotMaintenance(SNAPSHOT_MAINTENANCE_DELAY_MS);}
      settings.lastRemoteCheckAt=new Date().toISOString();settings.lastError='';await DossierDB.put('cloudSettings',settings,{audit:false,sync:false});
    }catch(error){const transient=error?.code==='local_service_unavailable';if(!transient&&settings){settings.lastError=italianCloudError(error);await DossierDB.put('cloudSettings',settings,{audit:false,sync:false}).catch(()=>{});}}finally{if(!delegated)scheduleAutomaticSync(AUTO_SYNC_INTERVAL_MS);}
  }
  function startAutomaticSync(){
    clearTimeout(syncTimer);syncTimer=null;clearTimeout(remoteReminderTimer);remoteReminderTimer=null;clearTimeout(fastRemoteTimer);fastRemoteTimer=null;
    if(!settings?.enabled)return;
    scheduleAutomaticSync(nextAutomaticDelay(settings));scheduleRemoteReminderCheck(REMOTE_REMINDER_START_DELAY_MS);scheduleFastRemotePoll(2000);
    if(settings.snapshotDeferredAt)scheduleSnapshotMaintenance(SNAPSHOT_MAINTENANCE_DELAY_MS);
    if(!fastSyncListenerBound){fastSyncListenerBound=true;window.addEventListener('dossier-sync-pending',()=>{if(settings?.enabled)scheduleFastPush(FAST_PUSH_DEBOUNCE_MS);});}
    if(!onlineListenerBound){
      onlineListenerBound=true;
      window.addEventListener('online',()=>{if(settings?.enabled){scheduleFastPush(1000);scheduleFastRemotePoll(1500);scheduleAutomaticSync(nextAutomaticDelay(settings));scheduleRemoteReminderCheck(2000);}},{once:false});
      window.addEventListener('focus',()=>{if(settings?.enabled){scheduleFastRemotePoll(500);scheduleFastPush(800);scheduleRemoteReminderCheck(2000);}},{once:false});
      document.addEventListener('visibilitychange',()=>{if(settings?.enabled&&document.visibilityState==='visible')scheduleFastRemotePoll(500);},{once:false});
    }
  }

  async function publishFamilyActivationPending(record){
    await loadSettings();
    if(!settings?.enabled||!settings.remoteName||!settings.archiveId)throw new Error('Configura prima l’archivio cloud familiare da Backup e ripristino.');
    const key=await masterKey(settings,{promptIfMissing:true});
    const activationId=safePart(record?.activationId||'');if(!activationId)throw new Error('Identificativo dell’accesso provvisorio non valido.');
    await postJson('/mkdir',{remote:cloudPath('family',settings)}).catch(()=>{});
    await postJson('/mkdir',{remote:cloudPath('family/activations',settings)}).catch(()=>{});
    const plain=new Blob([JSON.stringify({format:'DSL5-FAMILY-ACTIVATION',version:1,...record})],{type:'application/json'});
    const encrypted=await encryptBlob(plain,key,{kind:'family-activation',activationId});
    await uploadWithRealProgress(cloudPath(`family/activations/${activationId}.dslf`,settings),encrypted,()=>{});
    return {activationId};
  }

  async function publishFamilyAccountCompletion(record){
    await loadSettings();
    if(!settings?.enabled||!settings.remoteName||!settings.archiveId)throw new Error('Archivio familiare non collegato.');
    const key=await masterKey(settings,{promptIfMissing:false});
    const activationId=safePart(record?.activationId||'');if(!activationId)throw new Error('Identificativo dell’attivazione non valido.');
    await postJson('/mkdir',{remote:cloudPath('family',settings)}).catch(()=>{});
    await postJson('/mkdir',{remote:cloudPath('family/completions',settings)}).catch(()=>{});
    const plain=new Blob([JSON.stringify({format:'DSL5-FAMILY-COMPLETION',version:1,...record,completedAt:new Date().toISOString()})],{type:'application/json'});
    const encrypted=await encryptBlob(plain,key,{kind:'family-completion',activationId});
    await uploadWithRealProgress(cloudPath(`family/completions/${activationId}.dslf`,settings),encrypted,()=>{});
    return {activationId};
  }

  async function consumeFamilyAccountCompletions(){
    if(!globalThis.DossierSecurity?.isAdministrator?.())return 0;
    await loadSettings();if(!settings?.enabled)return 0;
    let key;try{key=await masterKey(settings,{promptIfMissing:false});}catch{return 0;}
    let listed;try{listed=await get(`/list?remote=${encodeURIComponent(cloudPath('family/completions',settings))}`);}catch{return 0;}
    const items=(listed?.items||[]).filter(x=>!x.IsDir&&String(x.Path||x.Name||'').endsWith('.dslf'));
    let completed=0;
    for(const item of items){
      const leaf=String(item.Path||item.Name||'').replace(/\\/g,'/').split('/').pop();
      try{
        const encrypted=await download(cloudPath(`family/completions/${leaf}`,settings));
        const decoded=await decryptBlob(encrypted,key);const payload=JSON.parse(await decoded.blob.text());
        if(payload?.format!=='DSL5-FAMILY-COMPLETION'||!payload.activationId||!payload.account)continue;
        await DossierSecurity.request('/api/auth/family-temporary/finalize',{method:'POST',body:{activationId:payload.activationId,account:payload.account}});
        await deleteRemote(cloudPath(`family/completions/${leaf}`,settings)).catch(()=>{});
        await deleteRemote(cloudPath(`family/activations/${safePart(payload.activationId)}.dslf`,settings)).catch(()=>{});
        completed++;
      }catch(error){console.warn('Completamento accesso familiare rinviato:',error);}
    }
    if(completed)window.dispatchEvent(new Event('dossier-security-changed'));
    return completed;
  }

  async function exportFamilyAccess(){
    await loadSettings();
    if(!settings?.enabled||!settings.remoteName||!settings.archiveId)throw new Error('Configura prima l’archivio cloud familiare da Backup e ripristino.');
    const keyBytes=await masterKey(settings,{promptIfMissing:true});
    const remote=await DossierSecurity.request(`/api/cloud/remote-export?name=${encodeURIComponent(settings.remoteName)}`);
    if(!remote?.section)throw new Error('La connessione del cloud familiare non può essere esportata su questo dispositivo.');
    return {
      version:1,
      provider:settings.provider,
      archiveId:settings.archiveId,
      displayName:settings.displayName||'Archivio familiare',
      basePath:settings.basePath||'Dossier Sanitario Locale',
      createdAt:settings.createdAt||'',
      recoveryKey:b64url(keyBytes),
      remoteSection:remote.section
    };
  }

  async function importFamilyAccess(bundle,onProgress){
    if(!bundle||bundle.version!==1||!bundle.archiveId||!bundle.remoteSection||!bundle.recoveryKey)throw new Error('Autorizzazione cloud familiare incompleta.');
    await DossierDB.open();
    let st=await status();
    if(!st.installed){onProgress?.(3,'Preparazione collegamento','Installazione del connettore cloud.');await postJson('/install',{});st=await status();}
    if(!st.installed)throw new Error('Connettore cloud non disponibile.');
    const raw=decodeRecoveryKey(bundle.recoveryKey);if(!raw)throw new Error('Chiave dell’archivio familiare non valida.');
    const localName=`family_${safePart(String(bundle.archiveId).slice(-16))}`;
    onProgress?.(8,'Autorizzazione cloud','Importazione sicura della connessione familiare sul dispositivo.');
    const imported=await DossierSecurity.request('/api/cloud/remote-import',{method:'POST',body:{name:localName,section:bundle.remoteSection}});
    const remoteName=String(imported?.name||localName);saveRemoteProvider(remoteName,bundle.provider||'mega');
    const row={key:'main',enabled:false,provider:bundle.provider||'mega',remoteName,basePath:cleanBasePath(bundle.basePath||'Dossier Sanitario Locale'),archiveId:String(bundle.archiveId),displayName:String(bundle.displayName||'Archivio familiare'),createdAt:bundle.createdAt||new Date().toISOString(),lastSyncAt:'',processedEventIds:[],wrappedKeys:{[userId()]:await DossierSecurity.protectSecret(bundle.recoveryKey)},syncMode:'event-log-v1'};
    if(DossierSecurity.protectDeviceSecret)row.deviceWrappedKey=await DossierSecurity.protectDeviceSecret(bundle.recoveryKey);
    onProgress?.(14,'Verifica archivio','Controllo del manifesto del Dossier familiare.');
    const manifestBlob=await download(cloudPath('archive.json',row));const manifest=JSON.parse(await manifestBlob.text());
    if(manifest.format!=='DSL5-CLOUD'||manifest.archiveId!==row.archiveId)throw new Error('L’archivio indicato dall’invito non corrisponde al Dossier familiare autorizzato.');
    row.displayName=manifest.displayName||row.displayName;
    const snap=await latestSnapshot(row);if(!snap)throw new Error('Nessuna copia valida trovata nell’archivio familiare.');
    const remote=cloudPath(`snapshots/${snap.Path||snap.Name}`,row);
    onProgress?.(22,'Download archivio','Scaricamento della copia cifrata del Dossier familiare.');
    const encrypted=await download(remote);
    onProgress?.(55,'Decifratura locale','Apertura della copia cifrata sul dispositivo.');
    const decoded=await decryptBlob(encrypted,raw);decoded.blob.name='dossier_family_invite_restore.zip';
    const restored=await App.restoreZip(decoded.blob,{mode:'full',replaceAll:true,importUsers:false,skipSafetyBackup:true,skipSafetyDownload:true,skipRefresh:true});
    if(!restored)throw new Error('Ripristino del Dossier familiare non completato.');
    onProgress?.(82,'Configurazione sincronizzazione','Associazione permanente di questo dispositivo.');
    await DossierDB.clear('syncQueue');row.enabled=true;row.lastSnapshotAt=new Date().toISOString();row.lastSnapshotName=String(snap.Path||snap.Name||'').split('/').pop();
    await DossierDB.put('cloudSettings',row,{audit:false,sync:false});settings=row;applySyncContext();await DossierSecurity.registerCurrentDevice({sync:true});
    localStorage.setItem('dossierCloudProvider',row.provider);
    const appStarted=!!window.__DOSSIER_APP_STARTED__;
    if(appStarted)await App.refreshAfterExternalRestore?.();
    onProgress?.(94,'Configurazione completata',appStarted?'Verifica delle modifiche più recenti.':'Il Dossier verrà aperto dopo l’applicazione delle autorizzazioni.');
    if(appStarted){try{await syncNow({silent:true});}catch(error){console.warn('Prima sincronizzazione rinviata:',error);}startAutomaticSync();}
    onProgress?.(96,'Archivio collegato','Questo dispositivo è autorizzato al Dossier familiare.');
    return row;
  }

  async function init(){await loadSettings();if(settings?.enabled){await DossierSecurity.registerCurrentDevice({sync:true});try{await masterKey(settings,{promptIfMissing:false});}catch(error){console.warn('Chiave archivio non ancora associata a questo dispositivo:',error);}try{await DossierSecurity.repairAgendaGrantPrincipals?.();}catch(error){console.warn('Allineamento permessi Agenda rinviato:',error);}setTimeout(()=>{void (async()=>{try{await assertLocalServiceReady();await pruneOldSnapshots(settings,MAX_SNAPSHOTS);const completed=await consumeFamilyAccountCompletions();if(completed)await DossierSecurity.repairAgendaGrantPrincipals?.();}catch(error){console.warn('Manutenzione cloud rinviata:',error);}})();},1500);}startAutomaticSync();return settings;}

  return {init,panelHtml,bind,syncNow,loadSettings,exportFamilyAccess,importFamilyAccess,publishFamilyActivationPending,publishFamilyAccountCompletion,consumeFamilyAccountCompletions};
})();
globalThis.DossierCloud = DossierCloud;
