'use strict';

const DossierSecurity = (() => {
  const API_ORIGIN = `${location.protocol}//${location.hostname}:8896`;
  const MAX_TIMEOUT_MINUTES = 240;
  const DEFAULT_TIMEOUT_MINUTES = 15;
  const CLIENT_KDF_ITERATIONS = 240000;
  const encoder = new TextEncoder();
  let session = null;
  let startApplication = null;
  let inactivityTimer = null;
  let activityBound = false;
  let device = null;
  let administratorDisplayName = '';
  let licensedPrimaryProfileId = '';
  let processingFamilyUri = false;
  let pendingFamilyPackage = null;
  // Impronta (o volto/PIN del dispositivo) al posto del codice a 6 cifre, solo sul dispositivo dove e' stata attivata.
  const Impronta=(()=>{
    const CHIAVE='dossierImpronta';
    const b64u=buf=>{const a=new Uint8Array(buf);let s='';for(const x of a)s+=String.fromCharCode(x);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');};
    const daB64u=t=>{const s=atob(String(t||'').replace(/-/g,'+').replace(/_/g,'/')+'==='.slice((String(t||'').length+3)%4));const a=new Uint8Array(s.length);for(let i=0;i<s.length;i++)a[i]=s.charCodeAt(i);return a;};
    const leggi=()=>{try{return JSON.parse(localStorage.getItem(CHIAVE)||'null');}catch{return null;}};
    async function disponibile(){try{return !!(window.PublicKeyCredential&&await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());}catch{return false;}}
    function perUtente(username){const v=leggi();const u=String(username||'').trim().toLowerCase();return v&&v.credentialId&&v.rpId===location.hostname&&u&&String(v.username||'').toLowerCase()===u?v:null;}
    function messaggio(error){if(error?.name==='NotAllowedError')return'Impronta annullata o non riconosciuta';if(error?.name==='InvalidStateError')return'Su questo dispositivo l’impronta è già registrata';return error?.message||String(error);}
    async function attiva(otp,user){
      const start=await api('/api/auth/webauthn/register-start',{method:'POST',body:{otp,rpId:location.hostname}});
      let cred;
      try{cred=await navigator.credentials.create({publicKey:{challenge:daB64u(start.challenge),rp:{name:'Dossier Sanitario',id:start.rpId},user:{id:daB64u(start.userId),name:start.userName,displayName:start.displayName},pubKeyCredParams:[{type:'public-key',alg:-7},{type:'public-key',alg:-257}],authenticatorSelection:{authenticatorAttachment:'platform',userVerification:'required',residentKey:'discouraged'},excludeCredentials:(start.excludeIds||[]).map(id=>({type:'public-key',id:daB64u(id)})),timeout:start.timeout||120000,attestation:'none'}});}
      catch(error){throw new Error(messaggio(error));}
      const r=cred.response;
      if(typeof r.getPublicKey!=='function'||!r.getPublicKey())throw new Error('Questo browser non permette di usare l’impronta per il Dossier');
      const etichetta=window.FotoDocumento?.isTelefono?.()?'Telefono':'Computer';
      await api('/api/auth/webauthn/register-finish',{method:'POST',body:{credentialId:b64u(cred.rawId),publicKey:b64u(r.getPublicKey()),alg:r.getPublicKeyAlgorithm(),clientDataJSON:b64u(r.clientDataJSON),label:etichetta}});
      localStorage.setItem(CHIAVE,JSON.stringify({username:String(user?.username||'').toLowerCase(),credentialId:b64u(cred.rawId),rpId:location.hostname,createdAt:new Date().toISOString()}));
    }
    async function disattiva(){const v=leggi();if(v?.credentialId){try{await api('/api/auth/webauthn/remove',{method:'POST',body:{credentialId:v.credentialId}});}catch(error){console.warn('Rimozione impronta dal motore:',error);}}localStorage.removeItem(CHIAVE);}
    async function asserzione(username){
      const start=await api('/api/auth/webauthn/login-start',{method:'POST',auth:false,body:{username}});
      const locale=perUtente(username);
      const ids=(start.credentialIds||[]).filter(id=>!locale||id===locale.credentialId);
      if(!ids.length)throw new Error('Impronta non registrata per questo account');
      let a;
      try{a=await navigator.credentials.get({publicKey:{challenge:daB64u(start.challenge),rpId:location.hostname,allowCredentials:ids.map(id=>({type:'public-key',id:daB64u(id)})),userVerification:'required',timeout:start.timeout||120000}});}
      catch(error){throw new Error(messaggio(error));}
      return {credentialId:b64u(a.rawId),clientDataJSON:b64u(a.response.clientDataJSON),authenticatorData:b64u(a.response.authenticatorData),signature:b64u(a.response.signature)};
    }
    return {disponibile,perUtente,attiva,disattiva,asserzione,leggi};
  })();

  // Sul telefono il gestore password di Chrome non riconosce da solo l'accesso fatto senza cambio di pagina:
  // dopo un accesso riuscito gli si chiede esplicitamente di proporre il salvataggio.
  function offriSalvataggioPassword(username,password,user){
    try{
      if(!username||!password||!('PasswordCredential' in window)||!navigator.credentials?.store)return;
      if(!window.FotoDocumento?.isTelefono?.())return;
      void navigator.credentials.store(new PasswordCredential({id:username,password,name:String(user?.displayName||username)})).catch(()=>{});
    }catch(_e){}
  }
  let developerMode = false;
  let developerKeepaliveTimer = null;
  const technicalActivityCounts = new Map();

  const esc = (s='') => String(s).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const usernameKey = value => String(value||'').trim().toLocaleLowerCase('it-IT');
  const clampTimeout = value => Math.min(MAX_TIMEOUT_MINUTES, Math.max(1, Number(value)||DEFAULT_TIMEOUT_MINUTES));
  const bytesToBase64 = bytes => {let binary='';for(const b of bytes)binary+=String.fromCharCode(b);return btoa(binary);};
  const base64ToBytes = value => {const raw=String(value||'').replace(/-/g,'+').replace(/_/g,'/');const binary=atob(raw+'='.repeat((4-raw.length%4)%4));const out=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)out[i]=binary.charCodeAt(i);return out;};
  const randomId = prefix => {const bytes=new Uint8Array(12);crypto.getRandomValues(bytes);return `${prefix}_${Date.now().toString(36)}_${[...bytes].map(x=>x.toString(16).padStart(2,'0')).join('')}`;};
  const CAPABILITIES=[
    ['viewOtherProfiles','Vede profili','Consultazione'],
    ['editOtherProfiles','Modifica profili','Modifica'],
    ['importDocuments','Carica doc.','Modifica'],
    ['editDocuments','Modifica doc.','Modifica'],
    ['deleteDocuments','Elimina doc.','Modifica'],
    ['viewDiagnoses','Vede diagnosi','Consultazione'],
    ['editDiagnoses','Modifica diagnosi','Modifica'],
    ['viewTherapies','Vede terapie','Consultazione'],
    ['editTherapies','Modifica terapie','Modifica'],
    ['exportPdf','Esporta PDF','Consultazione'],
    ['backup','Crea backup','Modifica'],
    ['restore','Ripristina','Modifica'],
    ['manageUsers','Gestisce utenti','Gestione'],
    ['managePermissions','Gestisce permessi','Gestione'],
  ];
  const EDIT_ONLY_CAPS=new Set(['editOtherProfiles','importDocuments','editDocuments','deleteDocuments','editDiagnoses','editTherapies','backup','restore','manageUsers','managePermissions']);
  const relationOrder={'Me stesso':0,'Coniuge':10,'Figlio minorenne':20,'Figlio maggiorenne':21,'Genitore':30,'Familiare':40,'Persona assistita':50,'Altro':60};
  const normalizedName=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/gi,' ').trim().toLocaleLowerCase('it-IT');
  function accessLevel(user=currentUser()){if(user?.role==='administrator')return'administrator';return user?.accessLevel==='editor'?'editor':'viewer';}
  function capabilityDefaults(level){const out={};const editorEnabled=new Set(['viewOtherProfiles','editOtherProfiles','importDocuments','editDocuments','deleteDocuments','viewDiagnoses','editDiagnoses','viewTherapies','editTherapies','exportPdf','manageUsers','managePermissions']);for(const [key,,group] of CAPABILITIES)out[key]=level==='administrator'||(level==='editor'?editorEnabled.has(key):group==='Consultazione');return out;}
  function normalizedCapabilities(user=currentUser()){const level=accessLevel(user),out=capabilityDefaults(level);for(const [key] of CAPABILITIES)if(user?.capabilities&&key in user.capabilities)out[key]=!!user.capabilities[key];if(level==='administrator')for(const key of Object.keys(out))out[key]=true;if(level==='viewer')for(const key of EDIT_ONLY_CAPS)out[key]=false;return out;}
  function canUse(capability){return accessLevel()==='administrator'||!!normalizedCapabilities()[capability];}
  function planHas(feature){return Boolean(globalThis.DossierFeatures?.has?.(feature));}
  function planAllowsCurrentAccount(user=currentUser()){return !!user&&(accessLevel(user)==='administrator'||planHas('multiUser'));}
  function canManageUsers(){if(!planHas('accessManagement'))return false;return accessLevel()==='administrator'||(accessLevel()==='editor'&&canUse('manageUsers'));}
  function canManagePermissions(){if(!planHas('accessManagement'))return false;return accessLevel()==='administrator'||(accessLevel()==='editor'&&canUse('managePermissions'));}
  function profileSortKey(profile={}){const fullName=normalizedName(`${profile.firstName||''} ${profile.lastName||''}`);const isAdministratorProfile=administratorDisplayName&&fullName===normalizedName(administratorDisplayName);const rank=isAdministratorProfile?-100:(relationOrder[profile.relation]??70);return [rank,normalizedName(profile.lastName),normalizedName(profile.firstName),String(profile.id||'')];}
  function sortProfiles(profiles=[]){return [...profiles].sort((a,b)=>{const ak=profileSortKey(a),bk=profileSortKey(b);for(let i=0;i<ak.length;i++){if(ak[i]<bk[i])return-1;if(ak[i]>bk[i])return 1;}return 0;});}
  function primaryProfileIdForPlan(profiles=[]){
    const ordered=sortProfiles(profiles);
    const linked=String(currentUser()?.linkedProfileId||'').trim();
    if(linked&&ordered.some(p=>String(p.id||'')===linked))return linked;
    const adminName=normalizedName(administratorDisplayName||currentUser()?.displayName||'');
    if(adminName){
      const own=ordered.find(p=>normalizedName(`${p.firstName||''} ${p.lastName||''}`)===adminName);
      if(own?.id)return String(own.id);
    }
    return String(ordered[0]?.id||'');
  }

  async function api(path,{method='GET',body=null,auth=true}={}) {
    const headers={'Accept':'application/json'};
    if(body!==null)headers['Content-Type']='application/json';
    if(auth&&session?.token)headers['X-Dossier-Session']=session.token;
    let response;
    try{
      response=await fetch(`${API_ORIGIN}${path}`,{method,headers,body:body===null?undefined:JSON.stringify(body),cache:'no-store'});
    }catch(error){
      const localError=new Error('Il sistema di accesso del Dossier non risponde. Ricarica la pagina (tasto F5) e riprova.');
      localError.code='local_service_unavailable';
      localError.cause=error;
      throw localError;
    }
    let data={};
    try{data=await response.json();}catch{}
    if(!response.ok||data.ok===false){const error=new Error(data.error||`Operazione non riuscita (${response.status})`);error.code=data.code||'request_failed';error.status=response.status;throw error;}
    return data;
  }

  async function uploadBlob(path,blob,{contentType='application/octet-stream',auth=true}={}) {
    const headers={'Accept':'application/json','Content-Type':contentType||blob?.type||'application/octet-stream'};
    if(auth&&session?.token)headers['X-Dossier-Session']=session.token;
    let response;
    try{response=await fetch(`${API_ORIGIN}${path}`,{method:'POST',headers,body:blob,cache:'no-store'});}catch(error){const localError=new Error('Il motore del Dossier non risponde. Ricarica la pagina (tasto F5) e riprova.');localError.code='local_service_unavailable';localError.cause=error;throw localError;}
    let data={};try{data=await response.json();}catch{}
    if(!response.ok||data.ok===false){const error=new Error(data.error||`Operazione non riuscita (${response.status})`);error.code=data.code||'request_failed';error.status=response.status;throw error;}
    return data;
  }

  async function fetchBlob(path,{auth=true}={}) {
    const headers={'Accept':'application/octet-stream'};if(auth&&session?.token)headers['X-Dossier-Session']=session.token;
    let response;
    try{response=await fetch(`${API_ORIGIN}${path}`,{method:'GET',headers,cache:'no-store'});}catch(error){const localError=new Error('Il motore del Dossier non risponde. Ricarica la pagina (tasto F5) e riprova.');localError.code='local_service_unavailable';localError.cause=error;throw localError;}
    if(!response.ok){let data={};try{data=await response.json();}catch{}const error=new Error(data.error||`Operazione non riuscita (${response.status})`);error.code=data.code||'request_failed';error.status=response.status;throw error;}
    return response.blob();
  }

  async function deriveClientKey(password,saltBase64) {
    const material=await crypto.subtle.importKey('raw',encoder.encode(String(password||'')),'PBKDF2',false,['deriveKey']);
    return crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt:base64ToBytes(saltBase64),iterations:CLIENT_KDF_ITERATIONS},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
  }
  async function encryptText(value,key) {
    const iv=new Uint8Array(12);crypto.getRandomValues(iv);
    const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,encoder.encode(String(value)));
    return {iv:bytesToBase64(iv),data:bytesToBase64(new Uint8Array(cipher))};
  }
  async function decryptText(payload,key) {
    if(!payload?.iv||!payload?.data)return'';
    const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:base64ToBytes(payload.iv)},key,base64ToBytes(payload.data));
    return new TextDecoder().decode(plain);
  }

  function overlay(){let root=document.querySelector('#securityOverlay');if(root)return root;root=document.createElement('div');root.id='securityOverlay';root.className='security-overlay hidden';root.innerHTML='<div class="security-panel" id="securityPanel"></div>';document.body.appendChild(root);return root;}

  const GENERAL_WARNINGS_VERSION='2026.08.05-v1';
  const GENERAL_WARNINGS_TEXT=`Il Dossier Sanitario Locale è uno strumento di organizzazione e supporto informativo. Le classificazioni automatiche non costituiscono diagnosi, non modificano il referto originale e non sostituiscono la valutazione del laboratorio o del medico. Gli intervalli e le soglie possono variare in base a metodo analitico, unità di misura, età, sesso e condizioni cliniche. Quando il referto non contiene un intervallo, il programma può usare un intervallo storico compatibile della stessa struttura oppure una fonte autorevole esterna, che viene indicata. I dati da verificare devono essere sottoposti a controllo professionale prima di decisioni cliniche.`;
  async function warningsStatus(){return api('/api/auth/warnings');}
  async function acceptGeneralWarnings(){return api('/api/auth/warnings/accept',{method:'POST',body:{version:GENERAL_WARNINGS_VERSION,text:GENERAL_WARNINGS_TEXT,device:currentDeviceSummary()}});}
  function warningsDialog(required=true){return new Promise((resolve,reject)=>{showOverlay(`<div class="security-brand"><img src="assets/icon-192.png" alt=""><div><span>AVVERTENZE GENERALI</span><h1>Dossier Sanitario Locale</h1></div></div><h2>Limitazioni d'uso</h2><div class="security-warning-scroll"><p>${esc(GENERAL_WARNINGS_TEXT)}</p></div><label class="check-row"><input type="checkbox" id="acceptWarningsCheck"> <span>Dichiaro di aver letto e compreso le Avvertenze generali e accetto le limitazioni d'uso del programma.</span></label><button id="acceptWarningsBtn" class="btn btn-primary btn-full" disabled>Accetta e continua</button>${required?'':'<button id="closeWarningsBtn" class="btn btn-light btn-full">Chiudi</button>'}`);const check=document.querySelector('#acceptWarningsCheck'),btn=document.querySelector('#acceptWarningsBtn');check.onchange=()=>btn.disabled=!check.checked;btn.onclick=async()=>{try{await acceptGeneralWarnings();hideOverlay();resetTimer();resolve(true);}catch(e){errorText(e.message);reject(e);}};document.querySelector('#closeWarningsBtn')?.addEventListener('click',()=>{hideOverlay();resetTimer();resolve(false);});});}
  async function ensureGeneralWarningsAccepted(){const result=await warningsStatus();if(result.accepted===true&&result.version===GENERAL_WARNINGS_VERSION)return true;return warningsDialog(true);}
  async function reviewGeneralWarnings(){return warningsDialog(false);}

  function showOverlay(html){const root=overlay();root.querySelector('#securityPanel').innerHTML=html;root.classList.remove('hidden');root.setAttribute('aria-hidden','false');document.querySelector('#appShell')?.setAttribute('inert','');}
  function hideOverlay(){const root=overlay();root.classList.add('hidden');root.setAttribute('aria-hidden','true');document.querySelector('#appShell')?.removeAttribute('inert');}
  function errorText(message=''){const el=document.querySelector('#securityError');if(el){el.textContent=message;el.classList.toggle('hidden',!message);}}
  function setBusy(button,busy,label,normal){if(!button)return;button.disabled=busy;button.textContent=busy?label:normal;}

  function ensureDevice(){
    try{device=JSON.parse(localStorage.getItem('dossierDeviceV5RC5')||'null');}catch{device=null;}
    if(!device?.id){device={id:randomId('device'),name:'Questo dispositivo',createdAt:new Date().toISOString(),lastSeenAt:new Date().toISOString(),revokedAt:''};}
    device.lastSeenAt=new Date().toISOString();localStorage.setItem('dossierDeviceV5RC5',JSON.stringify(device));return device;
  }

  // webapp: sistema e browser di questo dispositivo, al posto di "Windows" dell'exe
  function descriviDispositivo(){
    const ua=navigator.userAgent||'';const p=String(navigator.userAgentData?.platform||'');
    const so=/win/i.test(p)||/Windows/.test(ua)?'Windows':/mac/i.test(p)||/Macintosh/.test(ua)?'macOS':/android/i.test(p)||/Android/.test(ua)?'Android':/iPhone|iPad|iOS/.test(ua)?'iPhone/iPad':/linux|cros/i.test(p+ua)?'Linux':'dispositivo';
    const br=/Edg\//.test(ua)?'Edge':/OPR\//.test(ua)?'Opera':/Firefox\//.test(ua)?'Firefox':/Chrome\//.test(ua)?'Chrome':/Safari\//.test(ua)?'Safari':'browser';
    return `${br} su ${so}`;
  }

  function currentDeviceSummary(){
    let registered='';
    if(device?.createdAt){
      const parsed=new Date(device.createdAt);
      if(!Number.isNaN(parsed.getTime()))registered=` · registrato il ${parsed.toLocaleDateString('it-IT')}`;
    }
    return `${descriviDispositivo()}${registered}`;
  }

  async function getSecuritySettings(){
    if(!session)return {timeoutMinutes:DEFAULT_TIMEOUT_MINUTES,mfaRequiredForCloud:true};
    try{
      const result=await api('/api/auth/preferences');
      const settings={timeoutMinutes:clampTimeout(result.preferences?.timeoutMinutes),mfaRequiredForCloud:true};
      session.user.securityPreferences=settings;
      return settings;
    }catch(error){
      console.error('Impossibile leggere le preferenze di sicurezza:',error);
      const cached=session.user?.securityPreferences||{};
      return {timeoutMinutes:clampTimeout(cached.timeoutMinutes),mfaRequiredForCloud:true};
    }
  }
  async function saveSecuritySettings(value={}){
    if(!session)throw new Error('Archivio bloccato');
    const hasRequested=value.timeoutMinutes!==undefined&&value.timeoutMinutes!==null&&value.timeoutMinutes!=='';
    const requested=hasRequested?clampTimeout(value.timeoutMinutes):(await getSecuritySettings()).timeoutMinutes;
    const result=await api('/api/auth/preferences',{method:'POST',body:{timeoutMinutes:requested}});
    const returned=result.preferences?.timeoutMinutes;
    if(Number(returned)!==Number(requested))throw new Error(`Il motore ha restituito ${returned??'un valore vuoto'} invece di ${requested} minuti.`);
    const settings={timeoutMinutes:clampTimeout(returned),mfaRequiredForCloud:true};
    session.user.securityPreferences=settings;
    await resetTimer();
    return settings;
  }

  async function bootstrap(callback){
    startApplication=callback;ensureDevice();bindActivity();
    try{
      const [status,firstUse]=await Promise.all([api('/api/auth/status',{auth:false}),api('/api/system/first-use',{auth:false})]);
      const proceed=()=>{if(!status.initialized)showInitialSetup();else showLogin(status.users||[]);};
      if(firstUse?.accepted)proceed();else showFirstUseReadme(async()=>{await api('/api/system/first-use/accept',{method:'POST',auth:false,body:{accepted:true}});proceed();});
    }
    catch(error){showOverlay(`<div class="security-brand"><img src="assets/icon-192.png" alt=""><div><span>ERRORE DI AVVIO</span><h1>Dossier Sanitario Locale</h1></div></div><div class="notice danger">Il sistema di accesso del Dossier non è disponibile.</div><p>${esc(error.message)}</p><button type="button" id="retrySecurityBootstrap" class="btn btn-primary btn-full">Riprova</button>`);document.querySelector('#retrySecurityBootstrap').onclick=()=>bootstrap(callback);}
  }

  async function bootstrapRestoreFromFile(file,statusLabel='Verifica backup in corso…'){
    if(!file)throw new Error('Nessun backup selezionato');
    if(!globalThis.JSZip)throw new Error('Modulo backup non disponibile');
    const zip=await JSZip.loadAsync(file);
    const securityEntry=zip.file('sicurezza/archivio_credenziali.json');
    if(!securityEntry)throw new Error('Il backup non contiene utenti e credenziali. Usa un backup completo del Dossier.');
    const bundle=JSON.parse(await securityEntry.async('string'));
    const result=await api('/api/auth/bootstrap-restore',{method:'POST',auth:false,body:{bundle}});
    globalThis.__DOSSIER_PENDING_INITIAL_BACKUP__=file;
    const needsMfaReenroll=(result.users||[]).some(u=>u.mfaReenrollRequired);
    showLogin(result.users||[],needsMfaReenroll?'Archivio riconosciuto. Il secondo fattore di almeno un account era protetto dal vecchio computer: accedi con la password e il Dossier ti farà configurare nuovamente il codice temporaneo prima di aprire i dati.':'Archivio riconosciuto. Accedi con le credenziali già presenti nel backup; dopo l’accesso potrai completare il ripristino dei dati.');
  }

  async function cloudApi(path,{method='GET',body=null,binary=false}={}){
    const headers={};if(body!==null)headers['Content-Type']='application/json';
    const response=await fetch(`${API_ORIGIN}/api/cloud${path}`,{method,headers,body:body===null?undefined:JSON.stringify(body),cache:'no-store'});
    if(binary){if(!response.ok)throw new Error(`Download cloud non riuscito (${response.status})`);return response.blob();}
    let data={};try{data=await response.json();}catch{}
    if(!response.ok||data.ok===false)throw new Error(data.error||`Operazione cloud non riuscita (${response.status})`);
    return data;
  }
  function cloudStreamDownload(remote,onProgress){
    return new Promise((resolve,reject)=>{
      const xhr=new XMLHttpRequest();xhr.open('GET',`${API_ORIGIN}/api/cloud/stream?remote=${encodeURIComponent(remote)}`,true);xhr.responseType='blob';
      xhr.onprogress=e=>{if(e.lengthComputable&&e.total>0)onProgress?.(e.loaded,e.total);};
      xhr.onload=()=>xhr.status>=200&&xhr.status<300?resolve(xhr.response):reject(new Error(`Download cloud non riuscito (${xhr.status})`));
      xhr.onerror=()=>reject(new Error('Connessione al servizio cloud interrotta durante il download'));xhr.onabort=()=>reject(new Error('Download cloud annullato'));xhr.send();
    });
  }
  async function ensureCloudConnector(button){
    let st=await cloudApi('/status');if(st.installed)return st;
    if(button)setBusy(button,true,'Installazione connettore…','Ripristina da cloud esterno');
    await cloudApi('/install',{method:'POST',body:{}});st=await cloudApi('/status');
    if(!st.installed)throw new Error('Connettore cloud non disponibile');return st;
  }
  function cloudProviderLabel(id){return id==='mega'?'MEGA':id==='drive'?'Google Drive':'Apple iCloud';}
  async function cloudGuidedConfigure(provider,remoteName){
    let response=await cloudApi('/configure',{method:'POST',body:{name:remoteName,provider,params:{}}});let guard=0;
    while(!response.complete&&response.question&&guard++<30){const q=response.question;const url=JSON.stringify(q).match(/https?:\/\/[^\s"']+/)?.[0];if(url)window.open(url,'_blank','noopener');const option=q.Option||{};let answer='';
      if(Array.isArray(option.Examples)&&option.Examples.length){const choices=option.Examples.map((x,i)=>`${i+1}. ${x.Value??x.value??''} ${x.Help??x.help??''}`).join('\n');const selected=prompt(`${option.Help||option.Question||option.Name||'Completa l’accesso'}\n\n${choices}\n\nInserisci il numero o il valore:`,option.Default??'');if(selected===null)throw new Error('Configurazione annullata');const n=Number(selected);answer=Number.isInteger(n)&&n>=1&&n<=option.Examples.length?String(option.Examples[n-1].Value??option.Examples[n-1].value??''):selected;}else{answer=prompt(option.Help||option.Question||option.Name||'Completa l’accesso',option.Default??'');if(answer===null)throw new Error('Configurazione annullata');}
      response=await cloudApi('/configure',{method:'POST',body:{name:remoteName,provider,continue:true,state:q.State||'',result:answer}});
    }
    if(!response.complete)throw new Error('La procedura del servizio cloud non è stata completata');return remoteName;
  }
  async function configureExternalCloud(provider){
    const remoteName=`restore_${provider}_${Date.now().toString(36)}`;
    if(provider==='mega'){
      const email=String(document.querySelector('#restoreMegaEmail')?.value||'').trim();const password=String(document.querySelector('#restoreMegaPassword')?.value||'');if(!email||!password)throw new Error('Inserisci e-mail e password MEGA');
      const result=await cloudApi('/configure',{method:'POST',body:{name:remoteName,provider:'mega',params:{user:email,pass:password}}});if(!result.complete||!result.verified)throw new Error('Impossibile verificare l’accesso a MEGA');return remoteName;
    }
    return cloudGuidedConfigure(provider,remoteName);
  }
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
  const unb64=text=>{let value=String(text||'').replace(/-/g,'+').replace(/_/g,'/');while(value.length%4)value+='=';const raw=atob(value);return Uint8Array.from(raw,c=>c.charCodeAt(0));};
  const b64url=bytes=>{let s='';const a=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);for(let i=0;i<a.length;i+=0x8000)s+=String.fromCharCode(...a.subarray(i,i+0x8000));return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');};
  async function decryptCloudSnapshot(blob,keyText){
    const keyBytes=decodeRecoveryKey(keyText);if(!keyBytes)throw new Error('Chiave di recupero non valida');
    const bytes=new Uint8Array(await blob.arrayBuffer());if(bytes.length<24)throw new Error('Snapshot cifrato non valido');
    if(new TextDecoder().decode(bytes.subarray(0,8))!=='DSL5ENC1')throw new Error('Formato snapshot non riconosciuto');
    const metaLength=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(8,false);const meta=JSON.parse(new TextDecoder().decode(bytes.subarray(12,12+metaLength)));
    const iv=unb64(meta.iv);const key=await crypto.subtle.importKey('raw',keyBytes,{name:'AES-GCM'},false,['decrypt']);
    let plain;try{plain=await crypto.subtle.decrypt({name:'AES-GCM',iv},key,bytes.subarray(12+metaLength));}catch{throw new Error('Chiave di recupero errata o archivio non decifrabile');}
    return {blob:new Blob([plain],{type:'application/zip'}),meta};
  }
  async function listCloudArchives(remoteName){
    const result=await cloudApi(`/discover?remote=${encodeURIComponent(remoteName+':')}&basePath=${encodeURIComponent('Dossier Sanitario Locale')}`);
    const archives=Array.isArray(result.archives)?result.archives:[];
    if(archives.length)return archives;
    if(result.reason==='base_folder_missing')throw new Error('Accesso a MEGA riuscito, ma in questo account non è presente la cartella “Dossier Sanitario Locale”. Verifica di avere inserito l’account MEGA che contiene il tuo archivio.');
    if(result.reason==='archive_invalid')throw new Error('La cartella del Dossier è presente su MEGA, ma l’archivio non supera la verifica di struttura. Nessun dato è stato modificato.');
    throw new Error('La cartella del Dossier è raggiungibile, ma non contiene un archivio cifrato ripristinabile.');
  }
  function showExistingArchiveOptions(){
    showOverlay(`<div class="security-brand"><img src="assets/icon-192.png" alt=""><div><span>ARCHIVIO ESISTENTE</span><h1>Dossier Sanitario Locale</h1></div></div><h2>Da dove vuoi ripristinare?</h2><p>Puoi collegare un archivio cifrato del Dossier già presente su un servizio cloud esterno oppure scegliere un backup già salvato su questo dispositivo, su una chiavetta o su un disco esterno.</p><div id="securityError" class="notice danger hidden"></div><div class="security-choice-grid"><button type="button" id="externalCloudRestoreChoice" class="btn btn-primary btn-full">Ripristina da cloud esterno</button><button type="button" id="localRestoreChoice" class="btn btn-light btn-full">Ripristina da backup locale</button></div><input id="existingArchiveFile" type="file" accept=".zip,application/zip" hidden><button type="button" id="backInitialChoice" class="btn btn-light btn-full">Indietro</button>`);
    document.querySelector('#backInitialChoice').onclick=showInitialSetup;
    const input=document.querySelector('#existingArchiveFile');document.querySelector('#localRestoreChoice').onclick=()=>input.click();input.onchange=async()=>{const file=input.files?.[0];if(!file)return;const button=document.querySelector('#localRestoreChoice');errorText('');setBusy(button,true,'Verifica backup in corso…','Ripristina da backup locale');try{await bootstrapRestoreFromFile(file);}catch(error){errorText(error.message);setBusy(button,false,'','Ripristina da backup locale');input.value='';}};
    document.querySelector('#externalCloudRestoreChoice').onclick=showExternalCloudRestore;
  }
  async function showExternalCloudRestore(preselected='mega'){
    showOverlay(`<div class="security-brand"><img src="assets/icon-192.png" alt=""><div><span>RIPRISTINO DA CLOUD ESTERNO</span><h1>Dossier Sanitario Locale</h1></div></div><h2>Scegli il servizio</h2><p>Il Dossier supporta servizi cloud esterni senza legare il backup a un singolo fornitore.</p><div id="securityError" class="notice danger hidden"></div><label>Servizio cloud<select id="restoreCloudProvider" class="form-control"><option value="mega">MEGA</option><option value="drive">Google Drive</option><option value="iclouddrive">Apple iCloud</option></select></label><div id="restoreMegaFields" class="security-form" style="margin-top:12px"><label>E-mail MEGA<input id="restoreMegaEmail" class="form-control" type="email" autocomplete="off" autocapitalize="none" spellcheck="false" readonly></label><label>Password MEGA<input id="restoreMegaPassword" class="form-control" type="password" autocomplete="new-password" readonly></label></div><p id="restoreProviderHelp" class="security-help">Le credenziali vengono usate dal connettore locale per accedere al tuo spazio cloud e non vengono inserite nel backup.</p><div id="cloudRestoreProgress" class="cloud-restore-progress hidden"><div class="cloud-restore-progress-track"><span></span></div><strong id="cloudRestoreStage">Preparazione…</strong><small id="cloudRestoreElapsed">0 s</small></div><button type="button" id="connectRestoreCloud" class="btn btn-primary btn-full">Collega e cerca archivio</button><button type="button" id="backExistingChoice" class="btn btn-light btn-full">Indietro</button>`);
    const provider=document.querySelector('#restoreCloudProvider'),fields=document.querySelector('#restoreMegaFields'),help=document.querySelector('#restoreProviderHelp'),megaEmail=document.querySelector('#restoreMegaEmail'),megaPassword=document.querySelector('#restoreMegaPassword');if([...provider.options].some(o=>o.value===preselected))provider.value=preselected;for(const input of [megaEmail,megaPassword]){if(!input)continue;input.value='';const unlock=()=>{input.readOnly=false;input.value='';};input.addEventListener('pointerdown',unlock,{once:true});input.addEventListener('focus',unlock,{once:true});input.addEventListener('keydown',unlock,{once:true});}const update=()=>{const mega=provider.value==='mega';fields.classList.toggle('hidden',!mega);help.textContent=mega?'Inserisci le credenziali del tuo account MEGA. I campi restano volutamente vuoti e non usano il riempimento automatico del browser.':'Si aprirà la procedura ufficiale di autorizzazione del servizio selezionato.';};provider.onchange=update;update();document.querySelector('#backExistingChoice').onclick=showInitialSetup;
    document.querySelector('#connectRestoreCloud').onclick=async()=>{const button=document.querySelector('#connectRestoreCloud'),box=document.querySelector('#cloudRestoreProgress'),stage=document.querySelector('#cloudRestoreStage'),elapsed=document.querySelector('#cloudRestoreElapsed'),track=box?.querySelector('.cloud-restore-progress-track');errorText('');box?.classList.remove('hidden');track?.classList.remove('stopped');const started=Date.now();const update=(label)=>{if(stage)stage.textContent=label;if(elapsed)elapsed.textContent=Math.max(0,Math.round((Date.now()-started)/1000))+' s';};const timer=setInterval(()=>{if(elapsed)elapsed.textContent=Math.max(0,Math.round((Date.now()-started)/1000))+' s';},1000);setBusy(button,true,'Collegamento in corso…','Collega e cerca archivio');try{update('Verifica del connettore cloud…');await ensureCloudConnector();update('Accesso al servizio cloud…');const remote=await configureExternalCloud(provider.value);update('Ricerca diretta dell’archivio cifrato del Dossier…');const archives=await listCloudArchives(remote);update('Archivio trovato. Verifica struttura completata.');clearInterval(timer);showCloudArchiveList(remote,provider.value,archives);}catch(error){clearInterval(timer);track?.classList.add('stopped');errorText(error.message);setBusy(button,false,'','Collega e cerca archivio');update('Operazione non completata.');}};
  }
  function showCloudArchiveList(remote,provider,archives){
    showOverlay(`<div class="security-brand"><img src="assets/icon-192.png" alt=""><div><span>ARCHIVIO TROVATO</span><h1>Dossier Sanitario Locale</h1></div></div><h2>${esc(cloudProviderLabel(provider))}</h2><p>Seleziona l’archivio cifrato già creato dal Dossier e inserisci la relativa chiave di recupero.</p><div id="securityError" class="notice danger hidden"></div><label>Archivio<select id="cloudArchiveSelect" class="form-control">${archives.map((x,i)=>`<option value="${i}">${esc(x.displayName)} · ${esc(x.id)}${x.modTime?' · '+esc(new Date(x.modTime).toLocaleString('it-IT')):''}</option>`).join('')}</select></label><label style="margin-top:12px">Chiave di recupero<input id="cloudArchiveRecovery" class="form-control" autocomplete="off" placeholder="Incolla la chiave dell’archivio"></label><p class="security-help">La chiave è quella generata quando è stato creato l’archivio cifrato. Non viene inviata al servizio cloud.</p><div id="cloudArchiveRestoreProgress" class="cloud-restore-progress hidden determinate"><div class="cloud-restore-progress-head"><strong id="cloudArchiveRestoreStage">Preparazione…</strong><span id="cloudArchiveRestorePercent">0%</span></div><div class="cloud-restore-progress-track"><span id="cloudArchiveRestoreBar" style="width:0%"></span></div><small id="cloudArchiveRestoreDetail"></small></div><button type="button" id="restoreSelectedCloudArchive" class="btn btn-primary btn-full">Ripristina questo archivio</button><button type="button" id="backCloudProvider" class="btn btn-light btn-full">Indietro</button>`);
    document.querySelector('#backCloudProvider').onclick=showExternalCloudRestore;
    document.querySelector('#restoreSelectedCloudArchive').onclick=async()=>{const button=document.querySelector('#restoreSelectedCloudArchive'),box=document.querySelector('#cloudArchiveRestoreProgress'),stage=document.querySelector('#cloudArchiveRestoreStage'),percent=document.querySelector('#cloudArchiveRestorePercent'),bar=document.querySelector('#cloudArchiveRestoreBar'),detail=document.querySelector('#cloudArchiveRestoreDetail');errorText('');box?.classList.remove('hidden');const update=(pct,label,info='')=>{const v=Math.max(0,Math.min(100,Math.round(Number(pct)||0)));if(stage)stage.textContent=label;if(percent)percent.textContent=`${v}%`;if(bar)bar.style.width=`${v}%`;if(detail)detail.textContent=info;};setBusy(button,true,'Download e decifratura…','Ripristina questo archivio');try{const item=archives[Number(document.querySelector('#cloudArchiveSelect').value)||0];const recovery=String(document.querySelector('#cloudArchiveRecovery').value||'').trim();if(!recovery)throw new Error('Inserisci la chiave di recupero dell’archivio');const keyBytes=decodeRecoveryKey(recovery);if(!keyBytes)throw new Error('Chiave di recupero non valida');const snapPath=String(item?.snapshot?.Path||item?.snapshot?.Name||'');if(!snapPath)throw new Error('Snapshot dell’archivio non disponibile');update(1,'Download sicuro dello snapshot cifrato…','Connessione al servizio cloud.');const fullRemote=remote+':'+snapPath;const encrypted=await cloudStreamDownload(fullRemote,(loaded,total)=>{const pct=2+(loaded/total)*68;update(pct,'Download sicuro dello snapshot cifrato…',`${Math.round(loaded/1048576)} MB / ${Math.round(total/1048576)} MB`);});update(72,'Decifratura locale dell’archivio…','Verifica della chiave e decifratura sul computer.');const decoded=await decryptCloudSnapshot(encrypted,recovery);const file=new File([decoded.blob],'dossier_cloud_restore.zip',{type:'application/zip'});update(82,'Preparazione credenziali…','Lettura degli utenti presenti nell’archivio.');globalThis.__DOSSIER_PENDING_INITIAL_CLOUD__={remoteName:remote,provider,archiveId:item.id,displayName:item.displayName,basePath:item.basePath||'Dossier Sanitario Locale',createdAt:item.createdAt||'',snapshotName:String(item.snapshot?.Path||item.snapshot?.Name||'').split('/').pop(),snapshotModTime:item.modTime||'',recoveryKey:b64url(keyBytes)};await bootstrapRestoreFromFile(file,'Verifica archivio in corso…');}catch(error){globalThis.__DOSSIER_PENDING_INITIAL_CLOUD__=null;errorText(error.message);setBusy(button,false,'','Ripristina questo archivio');update(0,'Ripristino non completato.',error.message);}};
  }
  function chooseInitialLocalBackup(){
    const input=document.createElement('input');input.type='file';input.accept='.zip,application/zip';input.style.display='none';document.body.appendChild(input);
    input.onchange=async()=>{const file=input.files?.[0];input.remove();if(!file)return;try{await bootstrapRestoreFromFile(file);}catch(error){errorText(error.message);}};input.oncancel=()=>input.remove();input.click();
  }

  const jsonToken=value=>b64url(encoder.encode(JSON.stringify(value)));
  const tokenJson=value=>JSON.parse(new TextDecoder().decode(unb64(String(value||''))));
  const FAMILY_TEMP_PREFIX='CDFA1.';
  const FAMILY_RELAY_URL='https://clinica-digitale-family.dossiersanitario.workers.dev';
  const FAMILY_PASSWORD_RE=/^(?=.{15}$)(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/;
  async function temporaryFamilyKey(password,salt){
    const material=await crypto.subtle.importKey('raw',encoder.encode(String(password||'')),'PBKDF2',false,['deriveKey']);
    return crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt,iterations:260000},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
  }
  async function sealTemporaryFamilyPackage(payload,password){
    const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
    const key=await temporaryFamilyKey(password,salt);
    const additionalData=encoder.encode('ClinicaDigitale-FamilyTemporary-v1');
    const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData},key,encoder.encode(JSON.stringify(payload)));
    return FAMILY_TEMP_PREFIX+jsonToken({v:1,salt:b64url(salt),iv:b64url(iv),data:b64url(new Uint8Array(cipher))});
  }
  function extractTemporaryFamilyCode(value=''){
    const text=String(value||'').trim();const match=text.match(/CDFA1\.[A-Za-z0-9_-]+/);return match?match[0]:text;
  }
  async function openTemporaryFamilyPackage(code,password){
    const clean=extractTemporaryFamilyCode(code);if(!clean.startsWith(FAMILY_TEMP_PREFIX))throw new Error('Accesso familiare non riconosciuto.');
    let envelope;try{envelope=tokenJson(clean.slice(FAMILY_TEMP_PREFIX.length));}catch{throw new Error('Accesso familiare non valido.');}
    if(envelope?.v!==1||!envelope.salt||!envelope.iv||!envelope.data)throw new Error('Accesso familiare incompleto.');
    try{
      const key=await temporaryFamilyKey(password,unb64(envelope.salt));const additionalData=encoder.encode('ClinicaDigitale-FamilyTemporary-v1');
      const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(envelope.iv),additionalData},key,unb64(envelope.data));
      const payload=JSON.parse(new TextDecoder().decode(plain));
      if(payload?.kind!=='family-temporary-access'||![1,2].includes(Number(payload?.version))||!payload.activationId||!payload.cloud||!payload.securityBundle||!payload.joinSecret)throw new Error('Pacchetto di accesso non valido.');
      if(Number(payload.expiresAtEpoch||0)&&Date.now()/1000>Number(payload.expiresAtEpoch))throw new Error('Questo accesso familiare è scaduto. Chiedi all’amministratore di generarne uno nuovo.');
      return payload;
    }catch(error){if(/scaduto|non valido/.test(String(error?.message||'')))throw error;throw new Error('Password familiare errata oppure accesso non disponibile.');}
  }
  async function familyRelayDigest(label,password){
    const digest=await crypto.subtle.digest('SHA-256',encoder.encode(`ClinicaDigitale:${label}:v1:${String(password||'')}`));
    return b64url(new Uint8Array(digest));
  }
  async function familyRelayCoordinates(password){
    const lookupDigest=await crypto.subtle.digest('SHA-256',encoder.encode(String(password||'')));
    return {
      inviteId:b64url(new Uint8Array(lookupDigest)),
      deleteProof:await familyRelayDigest('family-invite-delete',password),
    };
  }
  async function publishTemporaryFamilyRelay(blob,password){
    const {inviteId,deleteProof}=await familyRelayCoordinates(password);
    const response=await fetch(`${FAMILY_RELAY_URL}/v1/invites/${inviteId}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({v:1,blob,deleteProof}),cache:'no-store'});
    let data={};try{data=await response.json();}catch{}
    if(!response.ok||data.ok===false)throw new Error(data.error==='INVITE_ALREADY_EXISTS'?'Generazione non riuscita: riprova per ottenere una nuova password.':'Il servizio di associazione familiare non è raggiungibile. Riprova tra poco.');
    return data;
  }
  async function fetchTemporaryFamilyRelay(password){
    const {inviteId}=await familyRelayCoordinates(password);
    let response;try{response=await fetch(`${FAMILY_RELAY_URL}/v1/invites/${inviteId}`,{method:'GET',cache:'no-store'});}catch{throw new Error('Il servizio di associazione familiare non è raggiungibile. Controlla la connessione Internet e riprova.');}
    let data={};try{data=await response.json();}catch{}
    if(response.status===404)throw new Error('Password familiare non riconosciuta oppure accesso già utilizzato/scaduto.');
    if(!response.ok||data.ok===false||typeof data.blob!=='string')throw new Error('Non è stato possibile recuperare l’accesso familiare. Riprova.');
    return data;
  }
  async function deleteTemporaryFamilyRelay(password){
    const {inviteId,deleteProof}=await familyRelayCoordinates(password);
    try{await fetch(`${FAMILY_RELAY_URL}/v1/invites/${inviteId}`,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({deleteProof}),cache:'no-store'});}catch{}
  }
  function temporaryAccessSummary(password,expiresAtEpoch){
    const expiry=expiresAtEpoch?new Date(Number(expiresAtEpoch)*1000).toLocaleString('it-IT'):'';
    return `CLINICA DIGITALE - ACCESSO FAMILIARE\nValidità: ${expiry||'48 ore'}\n\nPASSWORD FAMILIARE:\n${password}\n\nÈ l’unico dato da comunicare al familiare. L’accesso è monouso.`;
  }

  async function protectDeviceSecretLocal(value){
    if(!session)throw new Error('Archivio bloccato');
    const r=await api('/api/security/device-secret/protect',{method:'POST',body:{value:String(value)}});
    return r.protected;
  }
  async function unprotectDeviceSecretLocal(protectedValue){
    if(!session)throw new Error('Archivio bloccato');
    const r=await api('/api/security/device-secret/unprotect',{method:'POST',body:{protected:String(protectedValue||'')}});
    return r.value;
  }
  async function saveProtectedExchangePrivate(storageKey,privateJwk){
    const protectedValue=await protectDeviceSecretLocal(JSON.stringify(privateJwk));
    localStorage.setItem(storageKey,protectedValue);
  }
  async function loadProtectedExchangePrivate(storageKey){
    const protectedValue=localStorage.getItem(storageKey);if(!protectedValue)throw new Error('La chiave locale dell’invito non è più disponibile su questo dispositivo.');
    return JSON.parse(await unprotectDeviceSecretLocal(protectedValue));
  }

  function showPendingAssociationHome(message=''){
    showOverlay(`<div class="security-brand"><img src="assets/icon-192.png" alt=""><div><span>ACCOUNT PERSONALE</span><h1>Dossier Sanitario Locale</h1></div></div><h2>Associazione familiare da completare</h2>${message?`<div class="notice warning">${esc(message)}</div>`:''}<p>Per il nuovo collegamento familiare l’amministratore genera dal proprio Dossier un <strong>accesso provvisorio valido 48 ore</strong>. Non servono e-mail, link speciali o credenziali del provider cloud.</p><div id="securityError" class="notice danger hidden"></div><button type="button" id="pendingAssociationLogout" class="btn btn-light btn-full">Logout</button>`);
    document.querySelector('#pendingAssociationLogout').onclick=()=>lock('Logout');
  }

  function showFirstUseReadme(onContinue){
    showOverlay(`<div class="security-brand"><img src="assets/icon-192.png" alt=""><div><span>PRIMA DI INIZIARE</span><h1>Dossier Sanitario Locale</h1></div></div><h2>Informazioni per il primo utilizzo</h2><div class="notice"><strong>Clinica Digitale - Dossier Sanitario</strong> può essere utilizzato completamente in locale. Il collegamento a un cloud è facoltativo e gratuito. Se fai parte di un Dossier familiare, utilizzerai il tuo account personale e potrai associarti al Dossier senza conoscere le credenziali cloud dell’amministratore. Le integrazioni esterne, come Google Calendar, sono facoltative e possono essere configurate successivamente.</div><label class="check-row" style="margin-top:16px"><input type="checkbox" id="firstUseReadmeCheck"><span><strong>Ho letto e compreso le informazioni per il primo utilizzo</strong></span></label><button type="button" id="firstUseReadmeContinue" class="btn btn-primary btn-full" disabled>Continua</button>`);
    const check=document.querySelector('#firstUseReadmeCheck'),button=document.querySelector('#firstUseReadmeContinue');
    check.onchange=()=>{button.disabled=!check.checked;};
    button.onclick=()=>{button.disabled=true;Promise.resolve(onContinue?.()).catch(error=>{button.disabled=false;const box=document.querySelector('#securityError');if(box){box.textContent=error.message||'Operazione non completata';box.classList.remove('hidden');}else alert(error.message||'Operazione non completata');});};
  }

  function showInitialSetup(){
    showOverlay(`<div class="security-brand"><img src="assets/icon-192.png" alt=""><div><span>PRIMA CONFIGURAZIONE</span><h1>Dossier Sanitario Locale</h1></div></div><h2>Come vuoi iniziare?</h2><p>Scegli se creare un nuovo Dossier, entrare in un Dossier familiare con la password ricevuta dall’amministratore oppure ripristinare un backup locale.</p><div id="securityError" class="notice danger hidden"></div><div class="security-form"><button type="button" id="newDossierChoice" class="btn btn-primary btn-full">Crea un nuovo Dossier</button><button type="button" id="temporaryFamilyChoice" class="btn btn-light btn-full">Ho una password familiare</button><button type="button" id="localBackupChoice" class="btn btn-light btn-full">Ripristina da backup locale</button></div><p class="security-help">Per entrare in un Dossier familiare serve soltanto la password di 15 caratteri generata dall’amministratore. Non servono codici lunghi, link speciali o credenziali del provider cloud.</p>`);
    document.querySelector('#newDossierChoice').onclick=showCreateAdminForm;
    document.querySelector('#temporaryFamilyChoice').onclick=showTemporaryFamilyAccessForm;
    document.querySelector('#localBackupChoice').onclick=e=>{e.preventDefault();e.stopPropagation();chooseInitialLocalBackup();};
  }

  function showTemporaryFamilyAccessForm(){
    showOverlay(`<div class="security-brand"><img src="assets/icon-192.png" alt=""><div><span>ACCESSO FAMILIARE</span><h1>Dossier Sanitario Locale</h1></div></div><h2>Inserisci la password familiare</h2><p>L’amministratore del Dossier ti ha fornito una sola password di 15 caratteri, valida 48 ore e utilizzabile una sola volta.</p><div id="securityError" class="notice danger hidden"></div><form id="temporaryFamilyForm" class="security-form"><label>Password familiare<input class="form-control mono" type="password" name="familyPassword" minlength="15" maxlength="15" required autocomplete="off" spellcheck="false"></label><button type="submit" class="btn btn-primary btn-full">Continua</button><button type="button" id="backInitialChoice" class="btn btn-light btn-full">Indietro</button></form>`);
    document.querySelector('#backInitialChoice').onclick=showInitialSetup;
    document.querySelector('#temporaryFamilyForm').onsubmit=async e=>{
      e.preventDefault();errorText('');
      const form=e.currentTarget,button=form.querySelector('button[type="submit"]'),password=String(new FormData(form).get('familyPassword')||'');
      if(!FAMILY_PASSWORD_RE.test(password)){errorText('La password familiare deve contenere esattamente 15 caratteri, con lettere, numeri e almeno un carattere speciale.');return;}
      setBusy(button,true,'Ricerca del Dossier…','Continua');
      try{
        const relay=await fetchTemporaryFamilyRelay(password);
        const payload=await openTemporaryFamilyPackage(relay.blob,password);
        await api('/api/auth/family-bootstrap-restore',{method:'POST',auth:false,body:{bundle:payload.securityBundle,activationId:payload.activationId,joinSecret:payload.joinSecret}});
        pendingFamilyPackage={...payload,__familyPassword:password};
        await showTemporaryFamilyJoinChoice(payload);
      }catch(error){errorText(error.message);setBusy(button,false,'','Continua');}
    };
  }

  async function showTemporaryFamilyJoinChoice(payload){
    const status=await api('/api/auth/status',{auth:false});
    const available=(status.users||[]).filter(u=>u.active!==false&&u.role!=='administrator');
    const profileId=String(payload.profileId||payload.membershipTemplate?.linkedProfileId||'');
    const profileName=String(payload.profileName||'').trim();
    const existingForProfile=profileId?available.find(u=>String(u.linkedProfileId||'')===profileId):null;
    if(profileId){
      const label=profileName||'profilo sanitario esistente';
      showOverlay(`<div class="security-brand"><img src="assets/icon-192.png" alt=""><div><span>DOSSIER TROVATO</span><h1>Dossier Sanitario Locale</h1></div></div><h2>${esc(label)}</h2><div class="notice success">La password familiare è corretta ed è stata generata per questo profilo sanitario.</div><div class="security-choice-grid">${existingForProfile?'<button type="button" id="familyExistingAccountChoice" class="btn btn-primary btn-full">Accedi con le credenziali esistenti</button>':''}<button type="button" id="familyResetProfileAccountChoice" class="btn btn-primary btn-full">Crea o reimposta le credenziali personali</button></div><p class="security-help">La seconda scelta non crea un nuovo profilo sanitario: mantiene documenti, diagnosi, terapie e storico già presenti e sostituisce soltanto le credenziali personali di accesso per questo profilo.</p>`);
      if(existingForProfile)document.querySelector('#familyExistingAccountChoice').onclick=()=>showTemporaryFamilyExistingLogin(payload);
      document.querySelector('#familyResetProfileAccountChoice').onclick=()=>showTemporaryFamilyNewCredentials(payload);
      return;
    }
    showOverlay(`<div class="security-brand"><img src="assets/icon-192.png" alt=""><div><span>DOSSIER TROVATO</span><h1>Dossier Sanitario Locale</h1></div></div><h2>${esc(payload.archiveLabel||'Dossier familiare')}</h2><div class="notice success">La password è corretta. Ora scegli come accedere.</div><div class="security-choice-grid"><button type="button" id="familyExistingAccountChoice" class="btn btn-primary btn-full">Ho già un account nel Dossier</button><button type="button" id="familyNewAccountChoice" class="btn btn-light btn-full">Sono un nuovo membro</button></div><p class="security-help">Se possiedi già un account usa le tue credenziali. Se sei una nuova persona crea adesso il tuo account personale.</p>`);
    document.querySelector('#familyExistingAccountChoice').onclick=()=>showTemporaryFamilyExistingLogin(payload);
    document.querySelector('#familyNewAccountChoice').onclick=()=>showTemporaryFamilyNewCredentials(payload);
  }

  async function showTemporaryFamilyExistingLogin(payload){
    const status=await api('/api/auth/status',{auth:false});
    const available=(status.users||[]).filter(u=>u.active!==false&&u.role!=='administrator');
    showOverlay(`<div class="security-brand"><img src="assets/icon-192.png" alt=""><div><span>ACCOUNT ESISTENTE</span><h1>Dossier Sanitario Locale</h1></div></div><h2>Accedi con le tue credenziali</h2><div id="securityError" class="notice danger hidden"></div><form id="familyExistingLoginForm" class="security-form"><label>Nome utente o e-mail<input class="form-control" name="username" required autocomplete="username"></label><label>Password<div style="display:flex;gap:6px;align-items:center"><input class="form-control" style="flex:1" type="password" name="password" required autocomplete="current-password"><button type="button" class="btn btn-light btn-small" id="toggleLoginPassword" aria-label="Mostra password" title="Mostra password">👁</button></div></label><label id="familyExistingOtpRow" class="hidden">Codice temporaneo personale oppure codice di recupero<input class="form-control" name="otp" autocomplete="one-time-code"></label><button type="submit" class="btn btn-primary btn-full">Accedi e collega il Dossier</button><button type="button" id="backFamilyJoinChoice" class="btn btn-light btn-full">Indietro</button></form>`);
    document.querySelector('#backFamilyJoinChoice').onclick=()=>showTemporaryFamilyJoinChoice(payload);
    {const occhio=document.querySelector('#familyExistingLoginForm #toggleLoginPassword'),campo=document.querySelector('#familyExistingLoginForm [name="password"]');if(occhio&&campo)occhio.onclick=()=>{const visibile=campo.type==='text';campo.type=visibile?'password':'text';occhio.setAttribute('aria-label',visibile?'Mostra password':'Nascondi password');occhio.title=visibile?'Mostra password':'Nascondi password';};}
    const form=document.querySelector('#familyExistingLoginForm'),otpRow=document.querySelector('#familyExistingOtpRow');
    form.onsubmit=async e=>{e.preventDefault();errorText('');const fd=new FormData(form),button=form.querySelector('button[type="submit"]'),username=String(fd.get('username')||''),password=String(fd.get('password')||''),otp=String(fd.get('otp')||'');setBusy(button,true,'Verifica credenziali…','Accedi e collega il Dossier');try{const result=await api('/api/auth/login',{method:'POST',auth:false,body:{username,password,otp}});offriSalvataggioPassword(username,password,result.user);const encryptionKey=await deriveClientKey(password,result.clientSalt);pendingFamilyPackage=pendingFamilyPackage||payload;await completeLogin(result.user,result.token,encryptionKey);}catch(error){if(error.code==='mfa_required'||error.code==='invalid_otp')otpRow.classList.remove('hidden');errorText(error.message);setBusy(button,false,'','Accedi e collega il Dossier');}};
  }

  function showTemporaryFamilyNewCredentials(payload){
    const profileId=String(payload.profileId||payload.membershipTemplate?.linkedProfileId||'');
    const profileName=String(payload.profileName||'').trim();
    const bound=!!profileId;
    const heading=bound?`Credenziali personali per ${esc(profileName||'il profilo esistente')}`:'Crea le tue credenziali personali';
    const notice=bound?`Il profilo sanitario <strong>${esc(profileName||'selezionato')}</strong> resterà invariato. Verranno create o reimpostate soltanto le credenziali personali di accesso; non verrà creato alcun profilo duplicato.`:'L’amministratore non vedrà né conoscerà la password personale che scegli qui. Dopo l’accesso potrai creare il tuo profilo sanitario.';
    const action=bound?'Salva credenziali e collega il profilo':'Crea account e collega il Dossier';
    showOverlay(`<div class="security-brand"><img src="assets/icon-192.png" alt=""><div><span>${bound?'PROFILO ESISTENTE':'NUOVO MEMBRO'}</span><h1>Dossier Sanitario Locale</h1></div></div><h2>${heading}</h2><div class="notice">${notice}</div><div id="securityError" class="notice danger hidden"></div><form id="temporaryFamilyNewForm" class="security-form"><label>Nome visualizzato<input class="form-control" name="displayName" value="${esc(profileName)}" required autocomplete="name"></label><label>E-mail personale<input class="form-control" type="email" name="email" required autocomplete="email"></label><label>Nome utente<input class="form-control" name="username" required autocomplete="username"></label><label>Password personale<input class="form-control" type="password" name="password" minlength="10" required autocomplete="new-password"><small>Almeno 10 caratteri.</small></label><label>Ripeti password<input class="form-control" type="password" name="confirm" minlength="10" required autocomplete="new-password"></label><div class="section-spacer"></div><h3>Recupero password</h3><label>Domanda di recupero<input class="form-control" name="recoveryQuestion" minlength="5" required autocomplete="off"></label><label>Risposta personale<input class="form-control" type="password" name="recoveryAnswer" minlength="3" required autocomplete="new-password"></label><button type="submit" class="btn btn-primary btn-full">${action}</button><button type="button" id="backFamilyJoinChoice" class="btn btn-light btn-full">Indietro</button></form>`);
    document.querySelector('#backFamilyJoinChoice').onclick=()=>showTemporaryFamilyJoinChoice(payload);
    document.querySelector('#temporaryFamilyNewForm').onsubmit=async e=>{e.preventDefault();errorText('');const form=e.currentTarget,fd=new FormData(form),button=form.querySelector('button[type="submit"]'),password=String(fd.get('password')||'');if(password!==String(fd.get('confirm')||'')){errorText('Le password non coincidono.');return;}if(password.length<10){errorText('La password deve contenere almeno 10 caratteri.');return;}setBusy(button,true,bound?'Aggiornamento credenziali…':'Creazione account…',action);try{const result=await api('/api/auth/family-temporary/join-new',{method:'POST',auth:false,body:{activationId:payload.activationId,joinSecret:payload.joinSecret,displayName:fd.get('displayName'),email:fd.get('email'),username:fd.get('username'),password,recoveryQuestion:fd.get('recoveryQuestion'),recoveryAnswer:fd.get('recoveryAnswer')}});const encryptionKey=await deriveClientKey(password,result.clientSalt);pendingFamilyPackage=pendingFamilyPackage||payload;await completeLogin(result.user,result.token,encryptionKey);}catch(error){errorText(error.message);setBusy(button,false,'',action);}};
  }

  function showCreatePersonalAccountForm(invitation=null){
    showOverlay(`<div class="security-brand"><img src="assets/icon-192.png" alt=""><div><span>ACCOUNT PERSONALE</span><h1>Dossier Sanitario Locale</h1></div></div><h2>Crea le tue credenziali</h2><p>Questo account appartiene soltanto a te. L’amministratore del Dossier familiare non vedrà mai la tua password o la risposta di recupero.</p>${invitation?`<div class="notice">Dopo la creazione potrai richiedere l’associazione al profilo <strong>${esc(invitation.profileName||'indicato nell’invito')}</strong>.</div>`:''}<div id="securityError" class="notice danger hidden"></div><form id="personalSecurityForm" class="security-form"><label>Nome visualizzato<input class="form-control" name="displayName" required autocomplete="name"></label><label>E-mail personale<input class="form-control" type="email" name="email" required autocomplete="email"></label><label>Nome utente<input class="form-control" name="username" required autocomplete="username"><small>Potrai accedere usando il nome utente oppure l’e-mail.</small></label><label>Password<input class="form-control" type="password" name="password" minlength="10" required autocomplete="new-password"><small>Almeno 10 caratteri.</small></label><label>Ripeti password<input class="form-control" type="password" name="confirm" minlength="10" required autocomplete="new-password"></label><div class="section-spacer"></div><h3>Recupero password</h3><p class="security-help">Scegli una domanda personale la cui risposta sia conosciuta soltanto da te e non facilmente ricavabile da informazioni pubbliche.</p><label>Domanda di recupero<input class="form-control" name="recoveryQuestion" minlength="5" required autocomplete="off"></label><label>Risposta personale<input class="form-control" type="password" name="recoveryAnswer" minlength="3" required autocomplete="new-password"></label><button type="submit" class="btn btn-primary btn-full">Crea il mio account</button><button type="button" id="backInitialChoice" class="btn btn-light btn-full">Indietro</button></form>`);
    document.querySelector('#backInitialChoice').onclick=showInitialSetup;
    const form=document.querySelector('#personalSecurityForm');
    form.onsubmit=async e=>{e.preventDefault();errorText('');const button=form.querySelector('button[type="submit"]');const fd=new FormData(form);const displayName=String(fd.get('displayName')||'').trim();const email=String(fd.get('email')||'').trim();const username=String(fd.get('username')||'').trim();const password=String(fd.get('password')||'');const recoveryQuestion=String(fd.get('recoveryQuestion')||'').trim();const recoveryAnswer=String(fd.get('recoveryAnswer')||'');if(!displayName||!username||!email.includes('@')){errorText('Compila nome, e-mail e nome utente.');return;}if(password!==String(fd.get('confirm')||'')){errorText('Le password non coincidono.');return;}if(password.length<10){errorText('La password deve contenere almeno 10 caratteri.');return;}if(recoveryQuestion.length<5||recoveryAnswer.trim().length<3){errorText('Completa domanda e risposta di recupero.');return;}setBusy(button,true,'Creazione account…','Crea il mio account');try{const result=await api('/api/auth/setup-personal',{method:'POST',auth:false,body:{displayName,email,username,password,recoveryQuestion,recoveryAnswer}});const encryptionKey=await deriveClientKey(password,result.clientSalt);if(invitation)localStorage.setItem('dossierPendingFamilyInvite',JSON.stringify(invitation));await completeLogin(result.user,result.token,encryptionKey);}catch(error){errorText(error.message);setBusy(button,false,'','Crea il mio account');}};
  }

  function showCreateAdminForm(){
    showOverlay(`<div class="security-brand"><img src="assets/icon-192.png" alt=""><div><span>NUOVO ARCHIVIO</span><h1>Dossier Sanitario Locale</h1></div></div><h2>Crea l’amministratore dell’archivio</h2><p>Le credenziali appartengono soltanto a te. Dopo l’accesso potrai configurare backup, cloud e altre protezioni dalle Preferenze.</p><div id="securityError" class="notice danger hidden"></div><form id="initialSecurityForm" class="security-form"><label>Nome visualizzato<input class="form-control" name="displayName" required autocomplete="name"></label><label>E-mail personale<input class="form-control" type="email" name="email" required autocomplete="email"></label><label>Nome utente<input class="form-control" name="username" required autocomplete="username"><small>Potrai accedere usando il nome utente oppure l’e-mail.</small></label><label>Password<input class="form-control" type="password" name="password" minlength="10" required autocomplete="new-password"><small>Almeno 10 caratteri.</small></label><label>Ripeti password<input class="form-control" type="password" name="confirm" minlength="10" required autocomplete="new-password"></label><div class="section-spacer"></div><h3>Recupero password</h3><p class="security-help">Scegli una domanda personale la cui risposta sia conosciuta soltanto da te.</p><label>Domanda di recupero<input class="form-control" name="recoveryQuestion" minlength="5" required autocomplete="off"></label><label>Risposta personale<input class="form-control" type="password" name="recoveryAnswer" minlength="3" required autocomplete="new-password"></label><button type="submit" class="btn btn-primary btn-full">Crea amministratore e accedi</button><button type="button" id="backInitialChoice" class="btn btn-light btn-full">Indietro</button></form><p class="security-help">La risposta di recupero viene protetta localmente e non viene conservata in chiaro.</p>`);
    document.querySelector('#backInitialChoice').onclick=showInitialSetup;const form=document.querySelector('#initialSecurityForm');form.onsubmit=async e=>{e.preventDefault();errorText('');const button=form.querySelector('button[type="submit"]');const fd=new FormData(form);const displayName=String(fd.get('displayName')||'').trim();const email=String(fd.get('email')||'').trim();const username=String(fd.get('username')||'').trim();const password=String(fd.get('password')||'');const recoveryQuestion=String(fd.get('recoveryQuestion')||'').trim();const recoveryAnswer=String(fd.get('recoveryAnswer')||'');if(!displayName||!username||!email.includes('@')){errorText('Compila nome, e-mail e nome utente.');return;}if(password!==String(fd.get('confirm')||'')){errorText('Le password non coincidono.');return;}if(password.length<10){errorText('La password deve contenere almeno 10 caratteri.');return;}if(recoveryQuestion.length<5||recoveryAnswer.trim().length<3){errorText('Completa domanda e risposta di recupero.');return;}setBusy(button,true,'Creazione e apertura in corso…','Crea amministratore e accedi');try{const result=await api('/api/auth/setup',{method:'POST',auth:false,body:{displayName,email,username,password,recoveryQuestion,recoveryAnswer}});localStorage.setItem('dossierOfferBackupSetupAfterFirstLogin','1');const encryptionKey=await deriveClientKey(password,result.clientSalt);await completeLogin(result.user,result.token,encryptionKey);}catch(error){errorText(error.message);setBusy(button,false,'','Crea amministratore e accedi');}};
  }

  function showLogin(users=[],message=''){
    administratorDisplayName=String(users.find(u=>u.role==='administrator')?.displayName||administratorDisplayName||'');const available=users.filter(u=>u.active!==false);const defaultUser=available.length===1?(available[0].email||available[0].username):'';
    showOverlay(`<div class="security-brand"><img src="assets/icon-192.png" alt=""><div><span>ARCHIVIO PROTETTO</span><h1>Dossier Sanitario Locale</h1></div></div><h2>Accedi</h2><p>I profili e i documenti resteranno nascosti fino all’autenticazione.</p>${message?`<div class="notice success">${esc(message)}</div>`:''}<div id="securityError" class="notice danger hidden"></div><form id="loginSecurityForm" class="security-form"><label>Nome utente o e-mail<input class="form-control" name="username" value="${esc(defaultUser)}" required autocomplete="username"></label><label>Password<input class="form-control" type="password" name="password" required autocomplete="current-password"></label><label id="otpLoginRow" class="hidden">Codice temporaneo personale oppure codice di recupero<input class="form-control" name="otp" autocomplete="one-time-code"><small>Richiesto quando l'account è associato a un archivio cloud esterno.</small></label><button type="submit" class="btn btn-primary btn-full">Accedi</button><button type="button" id="forgotPasswordBtn" class="btn btn-light btn-full">Password dimenticata?</button></form><p class="security-help">Dopo cinque password errate l’accesso viene sospeso temporaneamente.</p>`);
    const form=document.querySelector('#loginSecurityForm');const otpRow=document.querySelector('#otpLoginRow');const passwordInput=form.elements.password;const togglePassword=document.querySelector('#toggleLoginPassword');if(togglePassword&&passwordInput)togglePassword.onclick=()=>{const visible=passwordInput.type==='text';passwordInput.type=visible?'password':'text';togglePassword.setAttribute('aria-label',visible?'Mostra password':'Nascondi password');togglePassword.title=visible?'Mostra password':'Nascondi password';};document.querySelector('#forgotPasswordBtn').onclick=()=>showPasswordRecovery(available);let collegato=null;const statoCloud=deviceCloudStatus().then(state=>{collegato=!!state.linked;return collegato;}).catch(()=>{collegato=false;return false;});const improntaHint=document.createElement('p');improntaHint.className='security-help hidden';improntaHint.textContent='Su questo dispositivo il codice a 6 cifre è sostituito dall’impronta: dopo “Accedi” ti verrà chiesta.';otpRow.after(improntaHint);let otpForzato=false;const aggiornaSecondoFattore=()=>{const conImpronta=!!Impronta.perUtente(form.elements.username.value);const serve=collegato&&available.some(u=>u.mfaEnabled);otpRow.classList.toggle('hidden',!(serve&&(otpForzato||!conImpronta)));improntaHint.classList.toggle('hidden',!(serve&&conImpronta&&!otpForzato));};statoCloud.then(aggiornaSecondoFattore);form.elements.username.addEventListener('input',aggiornaSecondoFattore);form.elements.username.addEventListener('change',aggiornaSecondoFattore);form.onsubmit=async e=>{e.preventDefault();errorText('');const button=form.querySelector('button[type="submit"]');const fd=new FormData(form);const username=String(fd.get('username')||'');const password=String(fd.get('password')||'');const otp=String(fd.get('otp')||'');let webauthn=null;if(!otp&&!otpForzato&&Impronta.perUtente(username)&&await statoCloud){setBusy(button,true,'Verifica impronta…','Accedi');try{webauthn=await Impronta.asserzione(username);}catch(error){otpForzato=true;aggiornaSecondoFattore();errorText(`${error.message}. Inserisci il codice a 6 cifre.`);setBusy(button,false,'','Accedi');form.elements.otp?.focus();return;}}setBusy(button,true,webauthn?'Verifica credenziali…':otpRow.classList.contains('hidden')?'Verifica credenziali…':'Verifica codice…','Accedi');try{const result=await api('/api/auth/login',{method:'POST',auth:false,body:{username,password,otp,webauthn}});offriSalvataggioPassword(username,password,result.user);const encryptionKey=await deriveClientKey(password,result.clientSalt);await completeLogin(result.user,result.token,encryptionKey);}catch(error){if(error.code==='mfa_required'||error.code==='invalid_otp'||String(error.code||'').startsWith('webauthn')){if(String(error.code||'').startsWith('webauthn'))otpForzato=true;otpRow.classList.remove('hidden');improntaHint.classList.add('hidden');const otpInput=form.elements.otp;if(otpInput)otpInput.focus();}errorText(error.message);setBusy(button,false,'','Accedi');}};
  }

  function showPasswordRecovery(users=[]){
    const defaultEmail=users.length===1?String(users[0].email||''):'';showOverlay(`<div class="security-brand"><img src="assets/icon-192.png" alt=""><div><span>RECUPERO ACCESSO</span><h1>Dossier Sanitario Locale</h1></div></div><h2>Password dimenticata?</h2><p>Inserisci l’e-mail registrata. Se viene riconosciuta, il Dossier mostrerà la tua domanda personale di recupero.</p><div id="securityError" class="notice danger hidden"></div><form id="recoveryEmailForm" class="security-form"><label>E-mail registrata<input class="form-control" type="email" name="email" value="${esc(defaultEmail)}" required autocomplete="email"></label><button type="submit" class="btn btn-primary btn-full">Continua</button><button type="button" id="useRecoveryCodeBtn" class="btn btn-light btn-full">Usa un codice di recupero</button><button type="button" id="cancelRecoveryBtn" class="btn btn-light btn-full">Torna all’accesso</button></form>`);document.querySelector('#cancelRecoveryBtn').onclick=async()=>{const status=await api('/api/auth/status',{auth:false});showLogin(status.users||[]);};document.querySelector('#useRecoveryCodeBtn').onclick=()=>showRecoveryCodeRecovery(users);const form=document.querySelector('#recoveryEmailForm');form.onsubmit=async e=>{e.preventDefault();errorText('');const email=String(new FormData(form).get('email')||'').trim();const button=form.querySelector('button[type="submit"]');setBusy(button,true,'Verifica in corso…','Continua');try{const result=await api(`/api/auth/recovery-question?email=${encodeURIComponent(email)}`,{auth:false});showRecoveryQuestionReset(email,result.question,users);}catch(error){errorText(error.message);setBusy(button,false,'','Continua');}};
  }
  function showRecoveryQuestionReset(email,question,users=[]){showOverlay(`<div class="security-brand"><img src="assets/icon-192.png" alt=""><div><span>RECUPERO ACCESSO</span><h1>Dossier Sanitario Locale</h1></div></div><h2>Rispondi alla tua domanda</h2><div class="notice"><strong>${esc(question||'Domanda di recupero')}</strong></div><div id="securityError" class="notice danger hidden"></div><form id="recoveryQuestionForm" class="security-form"><label>Risposta personale<input class="form-control" type="password" name="answer" required autocomplete="off"></label><label>Nuova password<input class="form-control" type="password" name="password" minlength="10" required autocomplete="new-password"></label><label>Ripeti nuova password<input class="form-control" type="password" name="confirm" minlength="10" required autocomplete="new-password"></label><button type="submit" class="btn btn-primary btn-full">Reimposta e accedi</button><button type="button" id="backRecoveryEmailBtn" class="btn btn-light btn-full">Indietro</button></form><p class="security-help">Dopo cinque risposte errate il recupero viene temporaneamente bloccato.</p>`);document.querySelector('#backRecoveryEmailBtn').onclick=()=>showPasswordRecovery(users);const form=document.querySelector('#recoveryQuestionForm');form.onsubmit=async e=>{e.preventDefault();errorText('');const fd=new FormData(form);const password=String(fd.get('password')||'');if(password!==String(fd.get('confirm')||'')){errorText('Le nuove password non coincidono.');return;}if(password.length<10){errorText('La password deve contenere almeno 10 caratteri.');return;}const button=form.querySelector('button[type="submit"]');setBusy(button,true,'Recupero in corso…','Reimposta e accedi');try{const result=await api('/api/auth/recover-question',{method:'POST',auth:false,body:{email,answer:fd.get('answer'),newPassword:password}});const encryptionKey=await deriveClientKey(password,result.clientSalt);await completeLogin(result.user,result.token,encryptionKey);}catch(error){errorText(error.message);setBusy(button,false,'','Reimposta e accedi');}};}
  function showRecoveryCodeRecovery(users=[]){const defaultUser=users.length===1?users[0].username:'';showOverlay(`<div class="security-brand"><img src="assets/icon-192.png" alt=""><div><span>RECUPERO ACCESSO</span><h1>Dossier Sanitario Locale</h1></div></div><h2>Usa un codice monouso</h2><div id="securityError" class="notice danger hidden"></div><form id="passwordRecoveryForm" class="security-form"><label>Nome utente o e-mail<input class="form-control" name="username" value="${esc(defaultUser)}" required></label><label>Codice monouso<input class="form-control" name="code" required></label><label>Nuova password<input class="form-control" type="password" name="password" minlength="10" required></label><label>Ripeti password<input class="form-control" type="password" name="confirm" minlength="10" required></label><button type="submit" class="btn btn-primary btn-full">Reimposta e accedi</button><button type="button" id="backQuestionRecoveryBtn" class="btn btn-light btn-full">Indietro</button></form>`);document.querySelector('#backQuestionRecoveryBtn').onclick=()=>showPasswordRecovery(users);const form=document.querySelector('#passwordRecoveryForm');form.onsubmit=async e=>{e.preventDefault();errorText('');const fd=new FormData(form);const password=String(fd.get('password')||'');if(password!==String(fd.get('confirm')||'')){errorText('Le password non coincidono.');return;}if(password.length<10){errorText('La password deve contenere almeno 10 caratteri.');return;}const button=form.querySelector('button[type="submit"]');setBusy(button,true,'Recupero in corso…','Reimposta e accedi');try{const result=await api('/api/auth/recover',{method:'POST',auth:false,body:{username:fd.get('username'),code:fd.get('code'),newPassword:password}});const encryptionKey=await deriveClientKey(password,result.clientSalt);await completeLogin(result.user,result.token,encryptionKey);}catch(error){errorText(error.message);setBusy(button,false,'','Reimposta e accedi');}};}


  async function personalizeLegacyCredentialsDialog(){
    if(!session?.user?.requiresCredentialPersonalization)return true;
    return new Promise(resolve=>{
      showOverlay(`<div class="security-brand"><img src="assets/icon-192.png" alt=""><div><span>PROTEZIONE CREDENZIALI</span><h1>Rendi personale il tuo account</h1></div></div><h2>Le vecchie credenziali devono essere sostituite</h2><div class="notice warning"><strong>Questo account proviene da una versione precedente ed è stato creato dall'amministratore del Dossier.</strong><br>Per proteggere la tua riservatezza devi scegliere adesso una password e una risposta di recupero che conosci soltanto tu. Il profilo sanitario, i documenti, lo storico e i permessi restano invariati.</div><div id="securityError" class="notice danger hidden"></div><form id="legacyPersonalizationForm" class="security-form"><label>Password attuale<input class="form-control" type="password" name="old" required autocomplete="current-password"></label><label>Nuova password personale<input class="form-control" type="password" name="password" minlength="10" required autocomplete="new-password"></label><label>Ripeti nuova password<input class="form-control" type="password" name="confirm" minlength="10" required autocomplete="new-password"></label><label>Nuova domanda personale di recupero<input class="form-control" name="recoveryQuestion" minlength="5" required autocomplete="off"></label><label>Risposta personale<input class="form-control" type="password" name="recoveryAnswer" minlength="3" required autocomplete="new-password"></label><button type="submit" class="btn btn-primary btn-full">Rendi personale il mio account</button></form><p class="security-help">L'amministratore non potrà vedere né recuperare la nuova password o la nuova risposta.</p>`);
      const form=document.querySelector('#legacyPersonalizationForm');
      form.onsubmit=async e=>{
        e.preventDefault();errorText('');
        const fd=new FormData(form),oldPassword=String(fd.get('old')||''),newPassword=String(fd.get('password')||'');
        if(newPassword!==String(fd.get('confirm')||'')){errorText('Le nuove password non coincidono.');return;}
        if(newPassword.length<10){errorText('La nuova password deve contenere almeno 10 caratteri.');return;}
        const button=form.querySelector('button[type="submit"]');setBusy(button,true,'Protezione account in corso…','Rendi personale il mio account');
        try{
          const cloud=await DossierDB.get('cloudSettings','main').catch(()=>null);let cloudSecret='';
          if(cloud?.wrappedKeys?.[session.user.id])cloudSecret=await decryptText(cloud.wrappedKeys[session.user.id],session.encryptionKey);
          const result=await api('/api/auth/legacy-personalize',{method:'POST',body:{oldPassword,newPassword,recoveryQuestion:String(fd.get('recoveryQuestion')||''),recoveryAnswer:String(fd.get('recoveryAnswer')||'')}});
          const newKey=await deriveClientKey(newPassword,result.clientSalt);
          if(cloudSecret){cloud.wrappedKeys={...cloud.wrappedKeys,[session.user.id]:await encryptText(cloudSecret,newKey)};await DossierDB.put('cloudSettings',cloud,{audit:false,sync:false});}
          session.user={...result.user,requiresCredentialPersonalization:false};session.encryptionKey=newKey;
          hideOverlay();resolve(true);
        }catch(error){errorText(error.message);setBusy(button,false,'','Rendi personale il mio account');}
      };
    });
  }


  async function publishPendingFamilyCompletion(){
    const activationId=localStorage.getItem('dossierPendingFamilyCompletion');
    if(!activationId||!session?.user?.mfaEnabled)return false;
    const exported=await api('/api/auth/account-export');
    await DossierCloud.publishFamilyAccountCompletion({activationId,profileId:session.user?.linkedProfileId||'',account:exported.account});
    localStorage.removeItem('dossierPendingFamilyCompletion');
    return true;
  }

  async function completeLogin(user,token,encryptionKey){
    session=null;clearTimeout(inactivityTimer);session={user:{...user},token,encryptionKey,unlockedAt:new Date().toISOString()};
    void resetTimer().catch(error=>console.warn('Timer di inattività non inizializzato',error));
    const showStartError=error=>{window.__DOSSIER_APP_STARTED__=false;showOverlay(`<div class="security-brand"><img src="assets/icon-192.png" alt=""><div><span>AVVIO NON COMPLETATO</span><h1>Dossier Sanitario Locale</h1></div></div><div class="notice danger">L’accesso è riuscito, ma l’interfaccia non si è avviata.</div><p>${esc(error?.message||'Errore sconosciuto')}</p><button type="button" id="retryApplicationStart" class="btn btn-primary btn-full">Riprova ad aprire il Dossier</button><button type="button" id="returnToLoginAfterStartError" class="btn btn-light btn-full">Torna all’accesso</button>`);document.querySelector('#retryApplicationStart').onclick=()=>{hideOverlay();window.__DOSSIER_APP_STARTED__=true;Promise.resolve().then(()=>startApplication?.()).catch(showStartError);};document.querySelector('#returnToLoginAfterStartError').onclick=async()=>{session=null;const status=await api('/api/auth/status',{auth:false});showLogin(status.users||[]);};};
    try{
      if(session.user?.requiresCredentialPersonalization){
        const personalized=await personalizeLegacyCredentialsDialog();
        if(!personalized)return;
      }
      if(pendingFamilyPackage){
        const familyPackage=pendingFamilyPackage;
        await DossierCloud.importFamilyAccess(familyPackage.cloud);
        localStorage.setItem('dossierPendingFamilyCompletion',familyPackage.activationId);
        localStorage.setItem('dossierFamilyActivationId',familyPackage.activationId);
        pendingFamilyPackage=null;
        if(familyPackage.__familyPassword)await deleteTemporaryFamilyRelay(familyPackage.__familyPassword);
      }
      // Il precedente flusso e-mail/URI non è più un meccanismo operativo.
      for(const key of ['dossierPendingAdminRequest','dossierPendingFamilyGrant','dossierPendingFamilyInvite']) localStorage.removeItem(key);
      if(session.user?.pendingAssociation){
        showPendingAssociationHome('Questo account personale non è ancora associato. Chiedi all’amministratore un nuovo accesso provvisorio di 48 ore. Il precedente sistema tramite e-mail o link speciali non viene più utilizzato.');
        return;
      }
      await publishPendingFamilyCompletion().catch(error=>console.warn('Completamento familiare rinviato:',error));
      const localCloudEnabled=await cloudIsEnabled();const deviceCloud=await deviceCloudStatus();if(localCloudEnabled&&!deviceCloud.linked){const localCloud=await DossierDB.get('cloudSettings','main').catch(()=>null);await setDeviceCloudLinked(true,localCloud?.archiveId||'');await lock('Archivio cloud riconosciuto: accedi nuovamente con il codice temporaneo personale.');return;}
      if(localCloudEnabled&&!session.user?.mfaEnabled){
        const ok=await enableMfa({required:true});
        if(!ok)return;
      }
      if(session.user?.mfaReenrollRequired){
        const ok=await enableMfa({required:true,migration:true});
        if(!ok)return;
        session.user.mfaReenrollRequired=false;
      }
      await publishPendingFamilyCompletion().catch(error=>console.warn('Completamento familiare rinviato:',error));
      if(startApplication&&!window.__DOSSIER_APP_STARTED__){
        await ensureGeneralWarningsAccepted();window.__DOSSIER_APP_STARTED__=true;hideOverlay();
        Promise.resolve().then(()=>startApplication()).catch(showStartError);
      }else{
        hideOverlay();queueMicrotask(()=>window.dispatchEvent(new CustomEvent('dossier-unlocked',{detail:{user:{...session.user}}})));
      }
    }catch(error){showStartError(error);}
  }

  async function lock(reason='Archivio bloccato'){const previousUser=session?.user?{...session.user}:null;developerMode=false;clearInterval(developerKeepaliveTimer);developerKeepaliveTimer=null;technicalActivityCounts.clear();if(session?.token)await api('/api/auth/logout',{method:'POST',body:{}}).catch(()=>{});session=null;clearTimeout(inactivityTimer);document.querySelector('#modal')?.classList.add('hidden');document.querySelector('#modalBackdrop')?.classList.add('hidden');window.dispatchEvent(new CustomEvent('dossier-locked',{detail:{reason,previousUser}}));const status=await api('/api/auth/status',{auth:false}).catch(()=>({users:[]}));showLogin(status.users||[],reason);}
  function technicalActivityActive(){for(const count of technicalActivityCounts.values())if(Number(count)>0)return true;return false;}
  function beginTechnicalActivity(name='operation'){const key=String(name||'operation');technicalActivityCounts.set(key,Number(technicalActivityCounts.get(key)||0)+1);clearTimeout(inactivityTimer);inactivityTimer=null;return key;}
  function endTechnicalActivity(name='operation'){const key=String(name||'operation'),count=Number(technicalActivityCounts.get(key)||0);if(count<=1)technicalActivityCounts.delete(key);else technicalActivityCounts.set(key,count-1);if(!technicalActivityActive())void resetTimer();}
  async function resetTimer(){clearTimeout(inactivityTimer);inactivityTimer=null;if(!session||developerMode||technicalActivityActive())return;const settings=await getSecuritySettings();if(technicalActivityActive())return;inactivityTimer=setTimeout(()=>{if(technicalActivityActive()){void resetTimer();return;}void lock('Blocco automatico per inattività');},clampTimeout(settings.timeoutMinutes)*60000);}
  function isDeveloperMode(){return Boolean(developerMode);}
  async function setDeveloperMode(active=false){
    developerMode=Boolean(active);
    clearTimeout(inactivityTimer);
    clearInterval(developerKeepaliveTimer);
    developerKeepaliveTimer=null;
    if(developerMode&&session){
      developerKeepaliveTimer=setInterval(()=>{if(!session||!developerMode)return;api('/api/auth/preferences').catch(()=>{});},5*60*1000);
    }else if(session){
      await resetTimer();
    }
    window.dispatchEvent(new CustomEvent('dossier-developer-mode',{detail:{active:developerMode}}));
    return developerMode;
  }
  async function verifyDeveloperMfa(otp=''){if(!session)throw new Error('Archivio bloccato');return api('/api/auth/developer-mfa',{method:'POST',body:{otp:String(otp||'')}});}
  function bindActivity(){if(activityBound)return;activityBound=true;let last=0;const touch=()=>{if(!session)return;const now=Date.now();if(now-last<15000)return;last=now;resetTimer();};['pointerdown','keydown','wheel','touchstart'].forEach(name=>window.addEventListener(name,touch,{passive:true}));}

  function currentUser(){return session?.user||null;}function currentDevice(){return device;}
  function permissionFor(profileId){const user=currentUser();if(!user)return'none';if(user.role==='administrator')return'admin';const value=String(user.profilePermissions?.[profileId]||'none').toLowerCase();return value==='admin'?'edit':value;}
  function agendaPrincipalIdentity(user={}){const linked=String(user?.linkedProfileId||'').trim(),uk=usernameKey(user?.usernameKey||user?.username||''),email=String(user?.email||'').trim().toLocaleLowerCase('it-IT'),id=String(user?.id||'').trim();const canonicalKey=linked?`principal:profile:${linked}`:uk?`principal:username:${uk}`:email?`principal:email:${email}`:id?`principal:id:${id}`:'';return{canonicalKey,targetUserId:id,targetLinkedProfileId:linked,targetUsernameKey:uk,targetEmailKey:email};}
  function agendaGrantMatchesUser(grantKey='',grant={},user=currentUser()){if(!user||!grant||typeof grant!=='object')return false;const identity=agendaPrincipalIdentity(user),key=String(grantKey||'');if(identity.canonicalKey&&key===identity.canonicalKey)return true;if(identity.targetUserId&&(key===identity.targetUserId||String(grant.targetUserId||'')===identity.targetUserId))return true;if(identity.targetLinkedProfileId&&String(grant.targetLinkedProfileId||'')===identity.targetLinkedProfileId)return true;if(identity.targetUsernameKey&&usernameKey(grant.targetUsernameKey||'')===identity.targetUsernameKey)return true;if(identity.targetEmailKey&&String(grant.targetEmailKey||'').trim().toLocaleLowerCase('it-IT')===identity.targetEmailKey)return true;return false;}
  function agendaGrantEntriesForUser(profile={},user=currentUser()){const grants=profile?.agendaAccessGrants&&typeof profile.agendaAccessGrants==='object'?profile.agendaAccessGrants:{};if(!user)return[];return Object.entries(grants).filter(([key,grant])=>agendaGrantMatchesUser(key,grant,user));}
  function agendaGrantForUser(profile={},user=currentUser()){const entries=agendaGrantEntriesForUser(profile,user);if(!entries.length)return null;entries.sort((a,b)=>String(b[1]?.updatedAt||'').localeCompare(String(a[1]?.updatedAt||'')));return entries[0][1]||null;}
  function agendaAccessForProfile(profile={}){const user=currentUser();const pid=String(profile?.id||'');if(!user||!pid||!canAccessProfile(pid))return{view:false,appointments:false,medications:false};if(accessLevel(user)==='administrator')return{view:true,appointments:true,medications:true};const row=agendaGrantForUser(profile,user);if(String(user.linkedProfileId||'')===pid){if(row)return{view:true,appointments:!!row.appointments,medications:!!row.medications};const edit=canEditProfile(pid);return{view:true,appointments:edit,medications:edit};}const appointments=!!row?.appointments,medications=!!row?.medications,view=!!row?.view||appointments||medications;return{view,appointments,medications};}
  async function repairAgendaGrantPrincipals(){if(accessLevel(currentUser())!=='administrator')return 0;let users=[];try{users=(await api('/api/auth/users')).users||[];}catch{return 0;}users=users.filter(u=>u&&u.role!=='administrator').sort((a,b)=>Number(a.active!==false)-Number(b.active!==false));const profiles=await DossierDB.getAll('profiles');let repaired=0;for(const profile of profiles){const current=profile?.agendaAccessGrants&&typeof profile.agendaAccessGrants==='object'?profile.agendaAccessGrants:null;if(!current)continue;let grants={...current},changed=false;for(const user of users){const entries=Object.entries(grants).filter(([key,grant])=>agendaGrantMatchesUser(key,grant,user));if(!entries.length)continue;entries.sort((a,b)=>String(b[1]?.updatedAt||'').localeCompare(String(a[1]?.updatedAt||'')));const latest=entries[0][1]||{},identity=agendaPrincipalIdentity(user);if(!identity.canonicalKey)continue;for(const [key] of entries){if(key!==identity.canonicalKey){delete grants[key];changed=true;}}const normalized={...latest,...identity,view:!!latest.view||!!latest.appointments||!!latest.medications,appointments:!!latest.appointments,medications:!!latest.medications};if(JSON.stringify(grants[identity.canonicalKey]||null)!==JSON.stringify(normalized)){grants[identity.canonicalKey]=normalized;changed=true;}}if(changed){await DossierDB.put('profiles',{...profile,agendaAccessGrants:grants},{details:{event:'family-agenda-principal-repair'}});repaired++;}}return repaired;}
  function canViewAgendaProfile(profile={}){return agendaAccessForProfile(profile).view;}
  function canManageAgendaAppointments(profile={}){return agendaAccessForProfile(profile).appointments;}
  function canManageAgendaMedications(profile={}){return agendaAccessForProfile(profile).medications;}
  function agendaAuthorizedProfileIds(profiles=[]){return profiles.filter(p=>canViewAgendaProfile(p)).map(p=>String(p.id));}
  function healthConsentRequired(profileId){return (currentUser()?.consentRequiredProfileIds||[]).map(String).includes(String(profileId||''));}
  function healthConsentGranted(profileId){const row=currentUser()?.healthDataConsents?.[profileId];return Boolean(row&&row.granted);}
  function roleCanAccessProfile(profileId){const user=currentUser();if(!user)return false;const pid=String(profileId||'');if(String(user.linkedProfileId||'')===pid)return true;if(accessLevel()==='administrator')return true;if(healthConsentRequired(pid)&&!healthConsentGranted(pid))return false;if(!canUse('viewOtherProfiles'))return false;return ['view','edit'].includes(permissionFor(pid));}
  function roleCanEditProfile(profileId){const user=currentUser();if(!user)return false;const pid=String(profileId||'');if(String(user.linkedProfileId||'')===pid&&pid)return true;if(accessLevel()==='administrator')return true;if(healthConsentRequired(pid)&&!healthConsentGranted(pid))return false;return permissionFor(pid)==='edit'&&canUse('editOtherProfiles');}
  function canAccessProfile(profileId){
    const user=currentUser(),pid=String(profileId||'');
    if(!user||!pid||!planAllowsCurrentAccount(user)||!roleCanAccessProfile(pid))return false;
    if(planHas('multiProfile'))return true;
    const linked=String(user.linkedProfileId||'').trim();
    if(linked)return pid===linked;
    return !!licensedPrimaryProfileId&&pid===licensedPrimaryProfileId;
  }
  function canEditProfile(profileId){
    const pid=String(profileId||'');
    if(!canAccessProfile(pid))return false;
    return roleCanEditProfile(pid);
  }
  function isAdministrator(){return accessLevel()==='administrator';}
  function assertCanEdit(profileId){if(!canEditProfile(profileId))throw new Error('Il tuo utente dispone soltanto dell’autorizzazione alla consultazione.');return true;}
  function filterProfiles(profiles=[]){
    if(!planAllowsCurrentAccount()){licensedPrimaryProfileId='';return[];}
    const roleVisible=sortProfiles(profiles.filter(p=>roleCanAccessProfile(p.id)));
    if(planHas('multiProfile')){licensedPrimaryProfileId='';return roleVisible;}
    licensedPrimaryProfileId=primaryProfileIdForPlan(roleVisible);
    return licensedPrimaryProfileId?roleVisible.filter(p=>String(p.id||'')===licensedPrimaryProfileId):[];
  }

  function downloadTextFile(text,name){const blob=new Blob([text],{type:'text/plain;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function showRecoveryCodes(codes,{title='Codici monouso'}={}){return new Promise(resolve=>{showOverlay(`<div class="security-brand"><img src="assets/icon-192.png" alt=""><div><span>RECUPERO ACCESSO</span><h1>${esc(title)}</h1></div></div><h2>Conservali adesso</h2><div class="notice warning">Questi codici vengono mostrati una sola volta. Ogni codice può essere utilizzato una sola volta. Servono soltanto se dimentichi la password o non puoi usare il tuo codice temporaneo personale. Sono personali per questo account: non condividerli con altri utenti. Per l’archivio locale sono facoltativi ma consigliati. Conservali separati dal computer. Una nuova generazione annulla tutti i codici precedenti.</div><div id="securityError" class="notice danger hidden"></div><pre class="recovery-codes">${codes.map(esc).join('\n')}</pre><div class="row-actions"><button type="button" id="copyRecoveryBtn" class="btn btn-light">Copia</button><button type="button" id="downloadRecoveryBtn" class="btn btn-light">Scarica TXT</button><button type="button" id="printRecoveryBtn" class="btn btn-light">Stampa</button><button type="button" id="continueRecoveryBtn" class="btn btn-primary">Li ho conservati</button></div>`);document.querySelector('#copyRecoveryBtn').onclick=async()=>{try{await navigator.clipboard.writeText(codes.join('\n'));document.querySelector('#copyRecoveryBtn').textContent='Copiati';}catch{errorText('Copia automatica non disponibile. Usa “Scarica TXT”.');}};document.querySelector('#downloadRecoveryBtn').onclick=()=>downloadTextFile(`Dossier Sanitario Locale - codici di recupero\n\n${codes.join('\n')}\n`,'codici_recupero_dossier.txt');document.querySelector('#printRecoveryBtn').onclick=()=>window.print();document.querySelector('#continueRecoveryBtn').onclick=()=>{hideOverlay();resetTimer();resolve(true);};});}
  async function regenerateRecoveryCodes(){if(!session)return false;if(!confirm('Generare una nuova serie? I codici precedenti verranno annullati.'))return false;const result=await api('/api/auth/recovery/generate',{method:'POST',body:{}});session.user.recoveryCodesAvailable=result.codes.length;await showRecoveryCodes(result.codes,{title:'Nuovi codici di recupero'});window.dispatchEvent(new Event('dossier-security-changed'));return true;}

  async function enableMfa({required=false,migration=false,replace=false}={}){
    if(!session)return false;
    let setup;try{setup=await api('/api/auth/mfa/start',{method:'POST',body:{}});}catch(error){alert(error.message);return false;}
    return new Promise(resolve=>{
      const replacing=replace&&session.user?.mfaEnabled;
      showOverlay(`<div class="security-brand"><img src="assets/icon-192.png" alt=""><div><span>${migration?'TRASFERIMENTO SICURO':replacing?'CAMBIO AUTENTICATORE':'AUTENTICAZIONE PERSONALE'}</span><h1>Proteggi il tuo accesso</h1></div></div><h2>${migration?'Ricollega il codice temporaneo':replacing?'Configura la nuova app di autenticazione':'Configura il tuo generatore di codici'}</h2><div class="notice"><strong>${replacing?'Il vecchio autenticatore resta valido finché il nuovo non viene verificato.':migration?'Il secondo fattore deve essere configurato nuovamente su questo dispositivo.':'Questa configurazione appartiene soltanto a '+esc(session.user?.displayName||'questo utente')+'.'}</strong><br>${replacing?'Se annulli o il nuovo codice non viene verificato, non cambia nulla e continui a usare l’autenticatore attuale.':migration?'La password e i dati dell’account restano invariati.':'Ogni utente configura autonomamente il proprio secondo fattore.'}</div><p><strong>Consigliato per semplicità: 2FAS Authenticator.</strong> Sono compatibili anche Google Authenticator, Microsoft Authenticator e le altre app che supportano lo standard TOTP. Puoi usare il QR oppure copiare la chiave manuale.</p><div class="mfa-setup-grid"><div class="mfa-qr"><img src="${API_ORIGIN}/api/security/qr?data=${encodeURIComponent(setup.uri)}" alt="QR autenticazione personale"><span>QR non disponibile. Usa la chiave manuale.</span></div><div><label>Chiave manuale personale<input id="mfaManualSecret" class="form-control mono" readonly value="${esc(setup.secret.match(/.{1,4}/g).join(' '))}"></label><button type="button" id="copyMfaSecretBtn" class="btn btn-light btn-small">Copia chiave</button><p class="kpi-note">Su un solo smartphone puoi copiare la chiave e inserirla manualmente nell’autenticatore. Il QR resta valido per questa configurazione per circa 10 minuti.</p></div></div><div id="securityError" class="notice danger hidden"></div><form id="mfaConfirmForm" class="security-form"><label>Conferma la tua password del Dossier<input class="form-control" type="password" name="password" required autocomplete="current-password"></label><label>Codice a 6 cifre generato dalla nuova app<input class="form-control" name="otp" maxlength="6" inputmode="numeric" required autocomplete="one-time-code"></label><button type="submit" class="btn btn-primary btn-full">${replacing?'Verifica e sostituisci autenticatore':'Verifica e attiva per il mio account'}</button>${required?'':'<button type="button" id="cancelMfaBtn" class="btn btn-light btn-full">Annulla</button>'}</form>`);
      document.querySelector('#copyMfaSecretBtn')?.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(setup.secret);document.querySelector('#copyMfaSecretBtn').textContent='Chiave copiata';}catch{const input=document.querySelector('#mfaManualSecret');input?.select();}});
      document.querySelector('#cancelMfaBtn')?.addEventListener('click',()=>{hideOverlay();resetTimer();resolve(false);});
      document.querySelector('#mfaConfirmForm').onsubmit=async e=>{e.preventDefault();errorText('');const button=e.target.querySelector('button[type="submit"]'),normal=replacing?'Verifica e sostituisci autenticatore':'Verifica e attiva per il mio account';setBusy(button,true,'Verifica in corso…',normal);const fd=new FormData(e.target);try{const result=await api('/api/auth/mfa/confirm',{method:'POST',body:{nonce:setup.nonce,otp:fd.get('otp'),password:fd.get('password')}});session.user.mfaEnabled=true;session.user.mfaReenrollRequired=false;session.user.recoveryCodesAvailable=result.codes.length;await showRecoveryCodes(result.codes,{title:replacing?'Nuovi codici di recupero':'Codici di recupero personali'});window.dispatchEvent(new Event('dossier-security-changed'));resolve(true);}catch(error){errorText(error.message);setBusy(button,false,'',normal);}};
    });
  }
  async function disableMfa(){if(!session?.user?.mfaEnabled)return;if(await cloudIsEnabled()){alert('Non puoi disattivare il secondo fattore mentre è attivo un archivio esterno.');return;}if(!confirm('Disattivare il codice temporaneo personale per il tuo account?'))return;const result=await api('/api/auth/mfa/disable',{method:'POST',body:{}});session.user.mfaEnabled=false;session.user.recoveryCodesAvailable=result.codes.length;await showRecoveryCodes(result.codes);window.dispatchEvent(new Event('dossier-security-changed'));}
  async function requireMfaForCloud(){if(session?.user?.mfaEnabled)return true;return enableMfa();}
  async function deviceCloudStatus(){try{return await api('/api/auth/device-cloud-status',{auth:false});}catch{return {linked:false};}}
  async function setDeviceCloudLinked(linked=true,archiveId=''){if(!session)throw new Error('Archivio bloccato');return api('/api/auth/device-cloud-state',{method:'POST',body:{linked:Boolean(linked),archiveId:String(archiveId||'')}});}
  async function cloudIsEnabled(){const row=await DossierDB.get('cloudSettings','main').catch(()=>null);return !!row?.enabled;}

  async function changePasswordDialog(){if(!session)return;showOverlay(`<div class="security-brand"><img src="assets/icon-192.png" alt=""><div><span>SICUREZZA</span><h1>Cambia password</h1></div></div><div id="securityError" class="notice danger hidden"></div><form id="changePasswordForm" class="security-form"><label>Password attuale<input class="form-control" type="password" name="old" required></label><label>Nuova password<input class="form-control" type="password" name="password" minlength="10" required></label><label>Ripeti nuova password<input class="form-control" type="password" name="confirm" minlength="10" required></label><button type="submit" class="btn btn-primary btn-full">Aggiorna password</button><button type="button" id="cancelChangePassword" class="btn btn-light btn-full">Annulla</button></form>`);document.querySelector('#cancelChangePassword').onclick=()=>{hideOverlay();resetTimer();};document.querySelector('#changePasswordForm').onsubmit=async e=>{e.preventDefault();errorText('');const fd=new FormData(e.target);const oldPassword=String(fd.get('old')||'');const newPassword=String(fd.get('password')||'');if(newPassword!==String(fd.get('confirm')||'')){errorText('Le nuove password non coincidono.');return;}if(newPassword.length<10){errorText('La nuova password deve contenere almeno 10 caratteri.');return;}const button=e.target.querySelector('button[type="submit"]');setBusy(button,true,'Aggiornamento in corso…','Aggiorna password');try{const cloud=await DossierDB.get('cloudSettings','main').catch(()=>null);let cloudSecret='';if(cloud?.wrappedKeys?.[session.user.id])cloudSecret=await decryptText(cloud.wrappedKeys[session.user.id],session.encryptionKey);const result=await api('/api/auth/change-password',{method:'POST',body:{oldPassword,newPassword}});const newKey=await deriveClientKey(newPassword,result.clientSalt);if(cloudSecret){cloud.wrappedKeys={...cloud.wrappedKeys,[session.user.id]:await encryptText(cloudSecret,newKey)};await DossierDB.put('cloudSettings',cloud,{audit:false,sync:false});}session.encryptionKey=newKey;session.user=result.user;hideOverlay();resetTimer();alert('Password aggiornata.');}catch(error){errorText(error.message);setBusy(button,false,'','Aggiorna password');}};}

  function levelLabel(level){return level==='administrator'?'Amministratore':level==='editor'?'Modifica':'Consultazione';}
  function canEditUserRow(actor,target){const actorLevel=accessLevel(actor),targetLevel=target?.role==='administrator'?'administrator':(target?.accessLevel||'viewer');if(actorLevel==='administrator')return targetLevel!=='administrator';return actorLevel==='editor'&&canManagePermissions()&&targetLevel==='viewer'&&target?.id!==actor?.id;}
  function capabilityCell(user,key,editable,rowKind){
    const definition=CAPABILITIES.find(x=>x[0]===key)||[key,key,''];
    const group=definition[2]||'';
    const belongs=rowKind==='consultation'?group==='Consultazione':group!=='Consultazione';
    if(!belongs)return '<td class="permission-check-cell permission-cell-empty" aria-hidden="true"></td>';
    const level=user.role==='administrator'?'administrator':(user.accessLevel||accessLevel(user));
    const checked=level==='administrator'||!!user.capabilities?.[key];
    const disabled=!editable||level==='administrator';
    return `<td class="permission-check-cell"><input type="checkbox" data-capability="${esc(key)}" ${checked?'checked':''} ${disabled?'disabled':''} aria-label="${esc(definition[1]||key)}"></td>`;
  }
  function permissionLevelCell(user,editable,rowKind){
    const level=user.role==='administrator'?'administrator':(user.accessLevel||'viewer');
    const label=rowKind==='consultation'?'Consultazione':'Modifica';
    return `<td class="permission-level-cell"><span class="permission-level-static">${label}</span>${level==='administrator'?'<small>Sempre attiva</small>':''}</td>`;
  }
  function userMatrixRow(user,actor){
    const level=user.role==='administrator'?'administrator':(user.accessLevel||accessLevel(user));
    const editable=canEditUserRow(actor,user);
    const admin=level==='administrator';
    const userTools=admin
      ? '<div class="permission-user-tools"><span class="badge success">Protetto</span><label class="permission-active-inline"><input type="checkbox" checked disabled> Account attivo</label></div>'
      : `<div class="permission-user-tools"><label class="permission-active-inline"><input type="checkbox" data-user-active ${user.active!==false?'checked':''} ${!editable?'disabled':''}> Account attivo</label>${editable?`<button type="button" class="btn btn-light btn-small" data-profile-access="${esc(user.id)}">Profili</button>${accessLevel(actor)==='administrator'?`<button type="button" class="btn btn-light btn-small" data-agenda-access="${esc(user.id)}">Agenda familiare</button><button type="button" class="btn btn-light btn-small" data-reset-password="${esc(user.id)}">Reimposta password</button>`:''}<button type="button" class="btn btn-primary btn-small" data-save-permissions="${esc(user.id)}">Salva</button>`:'<span class="kpi-note">Sola lettura</span>'}</div>`;
    const userCell=`<td class="permission-user-cell" rowspan="2"><strong>${esc(user.displayName)}</strong><small>${esc(user.username)}</small>${user.id===actor?.id?'<span class="badge permission-active-user">Utente attivo</span>':''}<span class="kpi-note">${user.mfaEnabled?'Codice temporaneo personale attivo':'Codice temporaneo non attivo'}</span>${userTools}</td>`;
    const consultation=`<tr class="permission-subrow permission-subrow-consultation" data-user-row="${esc(user.id)}" data-access-level="${esc(level)}">${userCell}${permissionLevelCell(user,editable,'consultation')}${CAPABILITIES.map(([key])=>capabilityCell(user,key,editable,'consultation')).join('')}</tr>`;
    const modification=`<tr class="permission-subrow permission-subrow-modification" data-user-row="${esc(user.id)}" data-access-level="${esc(level)}">${permissionLevelCell(user,editable,'modification')}${CAPABILITIES.map(([key])=>capabilityCell(user,key,editable,'modification')).join('')}</tr>`;
    return consultation+modification;
  }

  // Telefono / riquadro stretto: una scheda per persona con i permessi raggruppati (stessi campi della tabella).
  function userPermissionCard(user,actor){
    const level=user.role==='administrator'?'administrator':(user.accessLevel||accessLevel(user));
    const editable=canEditUserRow(actor,user),admin=level==='administrator';
    const initials=String(user.displayName||user.username||'?').split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0].toUpperCase()).join('');
    const pills=[user.id===actor?.id?'<span class="badge permission-active-user">Utente attivo</span>':'',admin?'<span class="badge success">Amministratore · protetto</span>':'',`<span class="badge">${user.mfaEnabled?'Codice a 6 cifre attivo':'Codice a 6 cifre non attivo'}</span>`].join('');
    const head=`<div class="permission-card-head"><span class="permission-card-avatar">${esc(initials)}</span><div><strong>${esc(user.displayName)}</strong><small>${esc(user.username)}</small><div class="permission-card-pills">${pills}</div></div></div>`;
    if(admin)return `<article class="permission-card" data-user-row="${esc(user.id)}">${head}<p class="kpi-note">L’amministratore ha sempre tutti i permessi.</p></article>`;
    const group=(title,keys)=>`<div class="permission-card-group"><p>${title}</p><div class="permission-card-grid">${keys.map(([key,label])=>`<label class="permission-card-cap"><input type="checkbox" data-capability="${esc(key)}" ${user.capabilities?.[key]?'checked':''} ${!editable?'disabled':''}><span>${esc(label)}</span></label>`).join('')}</div></div>`;
    const tools=editable?`<div class="permission-card-actions"><button type="button" class="btn btn-light btn-small" data-profile-access="${esc(user.id)}">Profili</button>${accessLevel(actor)==='administrator'?`<button type="button" class="btn btn-light btn-small" data-agenda-access="${esc(user.id)}">Agenda familiare</button><button type="button" class="btn btn-light btn-small" data-reset-password="${esc(user.id)}">Reimposta password</button>`:''}<button type="button" class="btn btn-primary btn-small" data-save-permissions="${esc(user.id)}">Salva</button></div>`:'';
    return `<article class="permission-card" data-user-row="${esc(user.id)}">${head}<label class="permission-card-active"><span>Account attivo</span><input type="checkbox" data-user-active ${user.active!==false?'checked':''} ${!editable?'disabled':''}></label>${group('Consultazione',CAPABILITIES.filter(c=>c[2]==='Consultazione'))}${group('Modifica',CAPABILITIES.filter(c=>c[2]==='Modifica'))}${group('Gestione',CAPABILITIES.filter(c=>c[2]==='Gestione'))}${tools}</article>`;
  }

  async function adminResetPasswordDialog(user){if(!isAdministrator()||!user||user.role==='administrator')return;showOverlay(`<div class="security-brand"><img src="assets/icon-192.png" alt=""><div><span>SICUREZZA ACCOUNT</span><h1>Reimposta password</h1></div></div><h2>${esc(user.displayName||user.username||'Utente')}</h2><div class="notice warning">La password precedente verrà invalidata. Non è necessario conoscerla.</div><div id="securityError" class="notice danger hidden"></div><form id="adminResetPasswordForm" class="security-form"><label>Nuova password<input class="form-control" type="password" name="password" minlength="10" required autocomplete="new-password"></label><label>Ripeti nuova password<input class="form-control" type="password" name="confirm" minlength="10" required autocomplete="new-password"></label><button type="submit" class="btn btn-primary btn-full">Reimposta password</button><button type="button" id="cancelAdminResetPassword" class="btn btn-light btn-full">Annulla</button></form>`);document.querySelector('#cancelAdminResetPassword').onclick=()=>{hideOverlay();resetTimer();};document.querySelector('#adminResetPasswordForm').onsubmit=async e=>{e.preventDefault();errorText('');const fd=new FormData(e.target);const password=String(fd.get('password')||'');if(password!==String(fd.get('confirm')||'')){errorText('Le nuove password non coincidono.');return;}if(password.length<10){errorText('La nuova password deve contenere almeno 10 caratteri.');return;}const button=e.target.querySelector('button[type="submit"]');setBusy(button,true,'Reimpostazione…','Reimposta password');try{await api('/api/auth/users/reset-password',{method:'POST',body:{id:user.id,password}});hideOverlay();resetTimer();alert('Password reimpostata. La password precedente non è più valida.');window.dispatchEvent(new Event('dossier-security-changed'));}catch(error){errorText(error.message);setBusy(button,false,'','Reimposta password');}};}

  async function modifyRecoveryQuestionDialog(){if(!session)return;showOverlay(`<div class="security-brand"><img src="assets/icon-192.png" alt=""><div><span>SICUREZZA</span><h1>Domanda di recupero</h1></div></div><p>La risposta è personale e non viene conservata in chiaro.</p><div id="securityError" class="notice danger hidden"></div><form id="recoveryQuestionUpdateForm" class="security-form"><label>Conferma la password attuale<input class="form-control" type="password" name="password" required autocomplete="current-password"></label><label>Nuova domanda di recupero<input class="form-control" name="question" minlength="5" required autocomplete="off"></label><label>Nuova risposta personale<input class="form-control" type="password" name="answer" minlength="3" required autocomplete="new-password"></label><button type="submit" class="btn btn-primary btn-full">Salva domanda di recupero</button><button type="button" id="cancelRecoveryQuestionUpdate" class="btn btn-light btn-full">Annulla</button></form>`);document.querySelector('#cancelRecoveryQuestionUpdate').onclick=()=>{hideOverlay();resetTimer();};document.querySelector('#recoveryQuestionUpdateForm').onsubmit=async e=>{e.preventDefault();errorText('');const fd=new FormData(e.target);const button=e.target.querySelector('button[type="submit"]');setBusy(button,true,'Salvataggio…','Salva domanda di recupero');try{const result=await api('/api/auth/recovery-question/update',{method:'POST',body:{password:fd.get('password'),question:fd.get('question'),answer:fd.get('answer')}});session.user=result.user;hideOverlay();resetTimer();alert('Domanda di recupero aggiornata.');window.dispatchEvent(new Event('dossier-security-changed'));}catch(error){errorText(error.message);setBusy(button,false,'','Salva domanda di recupero');}};}

  async function invitePersonDialog(){
    if(!isAdministrator())return;
    const cloud=await DossierDB.get('cloudSettings','main');
    if(!cloud?.enabled||!cloud?.archiveId||!cloud?.remoteName){
      showOverlay(`<div class="security-brand"><img src="assets/icon-192.png" alt=""><div><span>ACCESSO FAMILIARE</span><h1>Dossier Sanitario Locale</h1></div></div><h2>Archivio familiare non sincronizzato</h2><div class="notice warning">Per generare una password familiare serve prima un archivio cloud già configurato. Il familiare non vedrà né dovrà inserire le credenziali del provider.</div><button type="button" id="openBackupForInvite" class="btn btn-primary btn-full">Vai a Backup e ripristino</button><button type="button" id="cancelInvitePerson" class="btn btn-light btn-full">Annulla</button>`);
      document.querySelector('#cancelInvitePerson').onclick=()=>{hideOverlay();resetTimer();};
      document.querySelector('#openBackupForInvite').onclick=()=>{hideOverlay();resetTimer();document.querySelector('.nav-item[data-view="backup"]')?.click();};return;
    }
    const profiles=sortProfiles(await DossierDB.getAll('profiles'));
    const ownProfileId=String(currentUser()?.linkedProfileId||'');
    const selectable=profiles.filter(p=>String(p.id||'')!==ownProfileId);
    showOverlay(`<div class="security-brand"><img src="assets/icon-192.png" alt=""><div><span>ACCESSO FAMILIARE</span><h1>Dossier Sanitario Locale</h1></div></div><h2>Genera una password familiare</h2><p>La password dura 48 ore ed è utilizzabile una sola volta.</p><div id="securityError" class="notice danger hidden"></div><label>Chi deve collegarsi?<select id="familyInviteProfile" class="form-control"><option value="">Nuovo membro senza profilo esistente</option>${selectable.map(p=>`<option value="${esc(p.id)}">${esc(`${p.firstName||''} ${p.lastName||''}`.trim()||'Profilo')} ${p.relation?`· ${esc(p.relation)}`:''}</option>`).join('')}</select></label><div class="notice" style="margin-top:12px">Se la persona ha già un profilo nel Dossier, selezionalo qui. In questo modo sul nuovo computer potrà creare o reimpostare le proprie credenziali senza creare un secondo profilo e senza perdere i dati sanitari esistenti.</div><button type="button" id="generateFamilyPasswordBtn" class="btn btn-primary btn-full">Genera password familiare</button><button type="button" id="cancelInvitePerson" class="btn btn-light btn-full">Annulla</button>`);
    document.querySelector('#cancelInvitePerson').onclick=()=>{hideOverlay();resetTimer();};
    document.querySelector('#generateFamilyPasswordBtn').onclick=async()=>{
      const btn=document.querySelector('#generateFamilyPasswordBtn');errorText('');setBusy(btn,true,'Generazione…','Genera password familiare');
      try{
        const selectedId=String(document.querySelector('#familyInviteProfile')?.value||'');
        const selectedProfile=selectable.find(p=>String(p.id||'')===selectedId)||null;
        const selectedName=selectedProfile?`${selectedProfile.firstName||''} ${selectedProfile.lastName||''}`.trim():'';
        const cloudBundle=await DossierCloud.exportFamilyAccess();
        const created=await api('/api/auth/family-temporary/create',{method:'POST',body:{archiveId:cloud.archiveId,profileId:selectedId,profileName:selectedName}});
        const access=created.access;if(!access?.id||!access?.temporaryPassword||!access?.joinSecret)throw new Error('Accesso familiare non creato correttamente.');
        const backup=await exportSecurityBackup();const store=backup?.usersStore||{};const activation=(store.temporaryFamilyAccesses||[]).find(x=>x?.id===access.id);
        const securityBundle={formatVersion:1,createdAt:new Date().toISOString(),usersStore:{version:store.version||6,users:Array.isArray(store.users)?store.users:[],invitations:[],temporaryFamilyAccesses:activation?[activation]:[]},authAudit:''};
        const membershipTemplate={accessLevel:'viewer',profilePermissions:selectedId?{[selectedId]:'edit'}:{},capabilities:[],linkedProfileId:selectedId};
        const packagePayload={kind:'family-temporary-access',version:2,activationId:access.id,joinSecret:access.joinSecret,profileId:selectedId,profileName:selectedName||'Nuovo membro',archiveLabel:cloud.displayName||'Archivio familiare',archiveId:cloud.archiveId,expiresAtEpoch:access.expiresAtEpoch,membershipTemplate,securityBundle,cloud:cloudBundle};
        const sealed=await sealTemporaryFamilyPackage(packagePayload,access.temporaryPassword);await publishTemporaryFamilyRelay(sealed,access.temporaryPassword);
        const summary=temporaryAccessSummary(access.temporaryPassword,access.expiresAtEpoch);
        showOverlay(`<div class="security-brand"><img src="assets/icon-192.png" alt=""><div><span>ACCESSO PRONTO</span><h1>Dossier Sanitario Locale</h1></div></div><h2>Password familiare${selectedName?` per ${esc(selectedName)}`:''}</h2><div class="notice success">Valida fino al <strong>${esc(new Date(Number(access.expiresAtEpoch)*1000).toLocaleString('it-IT'))}</strong> e utilizzabile una sola volta.</div><label>Comunica al familiare soltanto questa password<input class="form-control mono" readonly id="temporaryFamilyPassword" value="${esc(access.temporaryPassword)}"></label><div class="row-actions"><button type="button" id="copyTemporaryFamilyAll" class="btn btn-primary">Copia password</button><button type="button" id="closeTemporaryFamily" class="btn btn-light">Chiudi</button></div><p class="security-help">Nessun codice lungo, UUID, chiave o credenziale cloud deve essere comunicato.</p>`);
        document.querySelector('#copyTemporaryFamilyAll').onclick=async()=>{try{await navigator.clipboard.writeText(access.temporaryPassword);document.querySelector('#copyTemporaryFamilyAll').textContent='Copiata';}catch{alert(summary);}};
        document.querySelector('#closeTemporaryFamily').onclick=()=>{hideOverlay();resetTimer();window.dispatchEvent(new Event('dossier-security-changed'));};
      }catch(error){errorText(error.message);setBusy(btn,false,'','Genera password familiare');}
    };
  }

  async function profileAccessDialog(user){const actor=currentUser();if(!canEditUserRow(actor,user))return;const profiles=sortProfiles(await DossierDB.getAll('profiles'));const actorIsAdmin=isAdministrator();const targetLevel=user.accessLevel||'viewer';showOverlay(`<div class="security-brand"><img src="assets/icon-192.png" alt=""><div><span>PROFILI AUTORIZZATI</span><h1>${esc(user.displayName)}</h1></div></div><div id="securityError" class="notice danger hidden"></div><form id="profileAccessForm" class="security-form"><p>Il profilo sanitario visualizzato non modifica mai il ruolo dell’utente autenticato. Per i profili collegati a un account personale adulto, questa autorizzazione è efficace solo se il titolare ha concesso anche il proprio consenso sanitario.</p><label>Profilo personale collegato<select class="form-control" name="linkedProfileId"><option value="">Nessun collegamento</option>${profiles.map(p=>`<option value="${esc(p.id)}" ${user.linkedProfileId===p.id?'selected':''}>${esc(p.firstName)} ${esc(p.lastName)}</option>`).join('')}</select></label><fieldset><legend>Accesso ai profili</legend>${profiles.map(p=>`<label class="permission-row"><span>${esc(p.firstName)} ${esc(p.lastName)}<small>${esc(p.relation||'')}</small></span><select name="perm_${esc(p.id)}" class="form-control"><option value="none">Nessun accesso</option><option value="view" ${(user.profilePermissions?.[p.id]||'none')==='view'?'selected':''}>Consultazione</option>${actorIsAdmin&&targetLevel==='editor'?`<option value="edit" ${(user.profilePermissions?.[p.id]||'none')==='edit'?'selected':''}>Modifica</option>`:''}</select></label>`).join('')}</fieldset><button type="submit" class="btn btn-primary btn-full">Salva profili</button><button type="button" id="cancelProfileAccess" class="btn btn-light btn-full">Annulla</button></form>`);document.querySelector('#cancelProfileAccess').onclick=()=>{hideOverlay();resetTimer();};document.querySelector('#profileAccessForm').onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.target);const permissions={};profiles.forEach(p=>permissions[p.id]=String(fd.get(`perm_${p.id}`)||'none'));try{await api('/api/auth/users/update',{method:'POST',body:{id:user.id,accessLevel:user.accessLevel||'viewer',linkedProfileId:fd.get('linkedProfileId'),profilePermissions:permissions,capabilities:user.capabilities||{}}});hideOverlay();resetTimer();window.dispatchEvent(new Event('dossier-security-changed'));}catch(error){errorText(error.message);}};}

  async function agendaAccessDialog(user){
    if(!isAdministrator()||!user||user.role==='administrator')return;
    const profiles=sortProfiles(await DossierDB.getAll('profiles'));
    const ownId=String(user.linkedProfileId||'');
    const grantFor=p=>agendaGrantForUser(p,user)||null;
    const rows=profiles.map(p=>{
      const pid=String(p.id||''),own=!!ownId&&pid===ownId,g=grantFor(p),appointments=own?(g?!!g.appointments:true):!!g?.appointments,medications=own?(g?!!g.medications:true):!!g?.medications,view=own||!!g?.view||appointments||medications;
      const profileName=esc(`${p.firstName||''} ${p.lastName||''}`.trim()||'Profilo');
      const relation=esc(p.relation||'');
      const check=(name,checked,locked=false)=>`<label class="agenda-permission-check"><input type="checkbox" name="${name}_${esc(pid)}" ${checked?'checked':''} ${locked?'disabled':''}><span>${locked?'Sempre':'Consenti'}</span></label>`;
      return `<div class="agenda-permission-grid agenda-permission-row ${own?'is-own-profile':''}" data-agenda-profile-row="${esc(pid)}"><div class="agenda-profile-identity"><strong>${profileName}</strong><small>${relation}${own?' · profilo personale':''}</small>${own?'<span class="badge success">Sempre incluso</span>':''}</div>${check('agenda_view',view,own)}${check('agenda_appointments',appointments,false)}${check('agenda_medications',medications,false)}</div>`;
    }).join('');
    const ownNotice=ownId?`<div class="notice"><strong>Come si legge:</strong> “Visualizza” permette di vedere appuntamenti e richieste farmaci del profilo. “Modifica appuntamenti” e “Modifica farmaci” autorizzano invece a cambiarli. Il profilo personale è sempre visibile, ma i due permessi di modifica restano separati e revocabili.</div>`:`<div class="notice warning"><strong>Profilo personale non collegato.</strong> Per questo utente nessuna riga può essere indicata come “Sempre incluso”. Collega prima il suo profilo personale dalla funzione “Profili autorizzati”; i permessi Agenda restano comunque configurabili qui.</div>`;
    showOverlay(`<div class="security-brand"><img src="assets/icon-192.png" alt=""><div><span>AGENDA FAMILIARE</span><h1>${esc(user.displayName)}</h1></div></div><div id="securityError" class="notice danger hidden"></div><form id="agendaAccessForm" class="security-form agenda-family-form"><p><strong>Stai decidendo cosa ${esc(user.displayName)} può vedere o modificare nell’Agenda dei singoli profili.</strong> Questi permessi riguardano soltanto l’Agenda e non concedono accesso ai documenti clinici.</p>${ownNotice}<fieldset class="agenda-family-fieldset"><legend>Profili autorizzati</legend><div class="agenda-permission-grid agenda-permission-head"><span>Profilo</span><span>Visualizza</span><span>Modifica appuntamenti</span><span>Modifica farmaci</span></div>${rows}</fieldset><button type="submit" class="btn btn-primary btn-full">Salva Agenda familiare</button><button type="button" id="cancelAgendaAccess" class="btn btn-light btn-full">Annulla</button></form>`);
    document.querySelector('#cancelAgendaAccess').onclick=()=>{hideOverlay();resetTimer();};
    document.querySelectorAll('[data-agenda-profile-row]').forEach(row=>{
      const view=row.querySelector('input[name^="agenda_view_"]'),appointments=row.querySelector('input[name^="agenda_appointments_"]'),medications=row.querySelector('input[name^="agenda_medications_"]');
      const ensureView=()=>{if((appointments?.checked||medications?.checked)&&view)view.checked=true;};
      appointments?.addEventListener('change',ensureView);medications?.addEventListener('change',ensureView);
      view?.addEventListener('change',()=>{if(!view.checked){if(appointments)appointments.checked=false;if(medications)medications.checked=false;}});
    });
    document.querySelector('#agendaAccessForm').onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.target),button=e.target.querySelector('button[type="submit"]');if(button){button.disabled=true;button.textContent='Salvataggio…';}try{const identity=agendaPrincipalIdentity(user);for(const p of profiles){const pid=String(p.id||'');if(!pid)continue;const own=!!ownId&&pid===ownId,view=own||fd.has(`agenda_view_${pid}`),appointments=fd.has(`agenda_appointments_${pid}`),medications=fd.has(`agenda_medications_${pid}`),grants={...(p.agendaAccessGrants||{})};for(const [key,grant] of Object.entries(grants)){if(agendaGrantMatchesUser(key,grant,user))delete grants[key];}if((view||appointments||medications)&&identity.canonicalKey)grants[identity.canonicalKey]={view:view||appointments||medications,appointments,medications,...identity,grantedByUserId:currentUser()?.id||'',updatedAt:new Date().toISOString()};const before=JSON.stringify(p.agendaAccessGrants||{}),after=JSON.stringify(grants);if(before!==after)await DossierDB.put('profiles',{...p,agendaAccessGrants:grants},{details:{event:'family-agenda-permission-update',targetUserId:user.id,targetPrincipal:identity.canonicalKey}});}hideOverlay();resetTimer();window.dispatchEvent(new Event('dossier-security-changed'));setTimeout(()=>{const task=globalThis.DossierCloud?.syncNow?.({silent:true,quick:true});task?.catch?.(error=>console.warn('Sincronizzazione permessi Agenda rinviata:',error));},0);}catch(error){if(button){button.disabled=false;button.textContent='Riprova';}errorText(error.message);}};
  }

  async function savePermissionRow(userId,root){
    if(!canManagePermissions()){alert('Il tuo account dispone soltanto della consultazione e non può modificare autorizzazioni.');return;}
    const users=(await api('/api/auth/users')).users||[];
    const user=users.find(u=>u.id===userId);
    const tutte=[...root.querySelectorAll(`[data-user-row="${CSS.escape(userId)}"]`)];const visibili=tutte.filter(r=>r.getClientRects().length);const rows=visibili.length?visibili:tutte;
    if(!user||!rows.length)return;
    if(!canEditUserRow(currentUser(),user)){alert('Non puoi modificare questo utente. Un utente con livello Modifica può intervenire soltanto sugli utenti in Consultazione e mai sull’amministratore.');return;}
    const capabilities={};
    for(const [key] of CAPABILITIES){const input=rows.map(row=>row.querySelector(`[data-capability="${key}"]`)).find(Boolean);capabilities[key]=!!input?.checked;}
    const level=[...EDIT_ONLY_CAPS].some(key=>capabilities[key])?'editor':'viewer';
    const activeInput=rows.map(row=>row.querySelector('[data-user-active]')).find(Boolean);
    try{await api('/api/auth/users/update',{method:'POST',body:{id:user.id,displayName:user.displayName,active:!!activeInput?.checked,accessLevel:level,linkedProfileId:user.linkedProfileId||'',profilePermissions:user.profilePermissions||{},capabilities}});window.dispatchEvent(new Event('dossier-security-changed'));}catch(error){alert(error.message);}
  }


  async function healthDataAccessHtml(){
    if(!globalThis.DossierFeatures?.has?.('adultConsent'))return'';
    const user=currentUser();if(!user?.linkedProfileId)return'';
    try{
      const status=await api('/api/auth/health-access');
      const users=status.users||[];
      return `<div class="section-spacer"></div><div class="card-title-row"><div><h3>Accesso ai miei dati sanitari</h3><p class="kpi-note">Per un profilo collegato a un account personale, l’accesso di un altro adulto richiede anche il consenso del titolare. Puoi revocarlo in qualsiasi momento.</p></div></div>${users.length?`<div class="notice">Le autorizzazioni amministrative restano separate: questa scelta concede o revoca esclusivamente il consenso alla consultazione del tuo profilo sanitario.</div><div class="security-form">${users.map(row=>`<label class="check-row"><input type="checkbox" data-health-access-user="${esc(row.id)}" ${row.granted?'checked':''}><span><strong>${esc(row.displayName)}</strong>${row.username?`<small style="display:block">${esc(row.username)}</small>`:''}</span></label>`).join('')}</div><button type="button" class="btn btn-primary" id="saveHealthDataAccessBtn">Salva consensi</button>`:'<div class="notice">Non ci sono altri account attivi a cui concedere l’accesso.</div>'}`;
    }catch(error){return `<div class="section-spacer"></div><div class="notice warning">Consensi sanitari non disponibili: ${esc(error.message)}</div>`;}
  }

  async function preferencesHtml(){const settings=await getSecuritySettings();const familyLicensed=Boolean(globalThis.DossierFeatures?.has?.('accessManagement'));const plan=String(globalThis.DossierFeatures?.current?.()?.plan||'FREE');const healthDataAccess=familyLicensed?await healthDataAccessHtml():'';let users=[];if(familyLicensed&&canManagePermissions())try{users=(await api('/api/auth/users')).users||[];}catch{}const user=currentUser();const planNotice=familyLicensed?'':plan==='FREE'?`<div class="section-spacer"></div><div class="notice warning"><strong>Piano FREE: un solo profilo operativo.</strong><br>Gli altri profili e tutti i relativi dati, se già presenti, restano conservati nell’archivio ma non sono visibili né modificabili. Tornano visibili dal piano MEDIUM. Account separati, permessi familiari e gestione accessi restano disponibili nel piano FULL.</div>`:`<div class="section-spacer"></div><div class="notice"><strong>Piano MEDIUM: profili locali multipli disponibili.</strong><br>Gli eventuali profili già presenti sono nuovamente visibili e utilizzabili dall’amministratore. Account separati, permessi familiari, gestione accessi e collaborazione multiutente restano disponibili nel piano FULL.</div>`;const matrix=familyLicensed&&canManagePermissions()?`<div class="section-spacer"></div><div class="card-title-row"><div><h3>Utenti autorizzati</h3><p class="kpi-note">I poteri dipendono dall’account con cui è stato effettuato il login, non dal profilo sanitario selezionato.</p></div>${isAdministrator()?'<button type="button" class="btn btn-primary btn-small" id="inviteDossierUserBtn">Genera password familiare</button>':''}</div><div class="permission-actor-banner"><strong>Account autenticato: ${esc(user?.displayName||'')}</strong><span>Livello: ${accessLevel(user)==='administrator'?'Amministratore':accessLevel(user)==='editor'?'Modifica':'Consultazione'}</span></div><div class="permission-matrix-wrap"><table class="permission-matrix"><colgroup><col class="col-user"><col class="col-level">${CAPABILITIES.map(()=>'<col class="col-capability">').join('')}</colgroup><thead><tr><th>Utente e comandi</th><th>Tipo</th>${CAPABILITIES.map(([,label])=>`<th title="${esc(label)}"><span>${esc(label)}</span></th>`).join('')}</tr></thead><tbody>${users.map(u=>userMatrixRow(u,user)).join('')}</tbody></table></div><div class="permission-cards">${users.map(u=>userPermissionCard(u,user)).join('')}</div><div class="notice"><strong>Gerarchia:</strong> l’amministratore può modificare tutti. Un utente “Modifica” può intervenire soltanto sugli utenti “Consultazione” e mai sull’amministratore. Un utente “Consultazione” non può cambiare alcun permesso.</div>`:'';return `<section class="card preference-section" id="securityPreferences"><div class="card-title-row"><div><h2>Sicurezza e accessi</h2><p class="kpi-note">Password, domanda di recupero, codice temporaneo e codici di recupero sono personali per l’account con cui hai effettuato l’accesso.</p></div><span class="badge ${user?.mfaEnabled?'success':''}">${user?.mfaEnabled?'Secondo fattore attivo':'Accesso locale con password'}</span></div><div class="notice"><strong>Il secondo fattore è personale.</strong><br>Tu configuri soltanto il tuo generatore di codici. Gli altri utenti configurano il proprio entrando con il loro account. Puoi usare 2FAS Authenticator, consigliato per semplicità, Google Authenticator, Microsoft Authenticator o qualunque altra app compatibile TOTP. Se utilizzi questo stesso account su un altro computer autorizzato, continui a usare il tuo codice personale già configurato.</div><div class="form-grid"><div class="form-group"><label>Blocco dopo inattività</label><select id="securityTimeout" class="form-control">${[1,2,5,10,15,20,25,30,60,120,240].map(n=>`<option value="${n}" ${settings.timeoutMinutes===n?'selected':''}>${n===120?'120 minuti (2 ore)':n===240?'240 minuti (4 ore)':`${n} ${n===1?'minuto':'minuti'}`}</option>`).join('')}</select></div><div class="form-group"><label>Utente attivo</label><input class="form-control" readonly value="${esc(user?.displayName||'')}"></div></div><div class="notice ${user?.recoveryCodesAvailable?'success':'warning'}">${user?.recoveryCodesAvailable?`Codici di recupero disponibili: ${user.recoveryCodesAvailable}.`:'I codici di recupero non sono ancora stati generati.'}<br><br>Sono un metodo di recupero aggiuntivo se non puoi usare la domanda personale o il codice temporaneo. Ogni codice può essere usato una sola volta. Conservali in un luogo sicuro e separato dal computer.<br><br>Non servono per il normale accesso. Per l’archivio locale sono facoltativi ma consigliati. Generando nuovi codici, quelli precedenti vengono annullati.</div><div class="row-actions"><button type="button" class="btn btn-light" id="changePasswordBtn">Cambia password</button><button type="button" class="btn btn-light" id="modifyRecoveryQuestionBtn">Modifica domanda di recupero</button><button type="button" class="btn btn-light" id="regenerateRecoveryCodesBtn">Genera codici di recupero</button>${user?.mfaEnabled?'<button type="button" class="btn btn-primary" id="changeMfaBtn">Cambia app di autenticazione</button><button type="button" class="btn btn-light" id="toggleMfaBtn">Disattiva il mio codice temporaneo</button>':'<button type="button" class="btn btn-primary" id="toggleMfaBtn">Configura il mio codice temporaneo</button>'}</div>${user?.mfaEnabled?'<div id="improntaHost"></div>':''}${planNotice}${healthDataAccess}${matrix}${familyLicensed&&canManagePermissions()?`<div class="section-spacer"></div><h3>Dispositivo corrente</h3><div class="notice"><strong>Questo dispositivo</strong><br><span>${esc(currentDeviceSummary())}</span></div>`:''}</section>`;}
  function bindPreferences(root=document){root.querySelector('#saveHealthDataAccessBtn')?.addEventListener('click',async()=>{const button=root.querySelector('#saveHealthDataAccessBtn');const grants=[...root.querySelectorAll('[data-health-access-user]')].map(input=>({userId:input.dataset.healthAccessUser,granted:!!input.checked}));if(button){button.disabled=true;button.textContent='Salvataggio…';}try{await api('/api/auth/health-access',{method:'POST',body:{grants}});if(button)button.textContent='Consensi salvati';}catch(error){if(button){button.disabled=false;button.textContent='Riprova';}alert(error.message);}});root.querySelector('#changePasswordBtn')?.addEventListener('click',changePasswordDialog);root.querySelector('#modifyRecoveryQuestionBtn')?.addEventListener('click',modifyRecoveryQuestionDialog);root.querySelector('#regenerateRecoveryCodesBtn')?.addEventListener('click',regenerateRecoveryCodes);root.querySelector('#changeMfaBtn')?.addEventListener('click',()=>enableMfa({replace:true}));root.querySelector('#toggleMfaBtn')?.addEventListener('click',()=>currentUser()?.mfaEnabled?disableMfa():enableMfa());root.querySelector('#inviteDossierUserBtn')?.addEventListener('click',invitePersonDialog);void disegnaImpronta(root);root.querySelectorAll('[data-save-permissions]').forEach(btn=>btn.addEventListener('click',()=>savePermissionRow(btn.dataset.savePermissions,root)));root.querySelectorAll('[data-profile-access]').forEach(btn=>btn.addEventListener('click',async()=>{const users=(await api('/api/auth/users')).users||[];const user=users.find(u=>u.id===btn.dataset.profileAccess);if(user)profileAccessDialog(user);}));root.querySelectorAll('[data-agenda-access]').forEach(btn=>btn.addEventListener('click',async()=>{const users=(await api('/api/auth/users')).users||[];const user=users.find(u=>u.id===btn.dataset.agendaAccess);if(user)agendaAccessDialog(user);}));root.querySelectorAll('[data-reset-password]').forEach(btn=>btn.addEventListener('click',async()=>{const users=(await api('/api/auth/users')).users||[];const user=users.find(u=>u.id===btn.dataset.resetPassword);if(user)adminResetPasswordDialog(user);}));}

  async function disegnaImpronta(root=document){
    const host=root.querySelector('#improntaHost');if(!host)return;
    const user=currentUser();if(!user?.mfaEnabled){host.innerHTML='';return;}
    if(!await Impronta.disponibile()){host.innerHTML='';return;}
    const attiva=!!Impronta.perUtente(user.username);
    const telefono=!!window.FotoDocumento?.isTelefono?.();
    const testo=attiva?(telefono?'Su questo dispositivo il codice a 6 cifre è sostituito dall’impronta. Il codice resta utilizzabile se l’impronta non funziona.':'Su questo dispositivo il codice a 6 cifre è sostituito dall’impronta, dal volto o dal PIN del dispositivo. Il codice resta utilizzabile se non funzionano.'):(telefono?'Su questo dispositivo puoi usare l’impronta al posto del codice a 6 cifre. Vale solo per questo dispositivo.':'Su questo dispositivo puoi usare l’impronta, il volto o il PIN del dispositivo al posto del codice a 6 cifre. Vale solo per questo dispositivo.');
    host.innerHTML=`<div class="section-spacer"></div><h3>Accesso con impronta</h3><p class="kpi-note">${testo}</p><div class="security-form" id="improntaForm">${attiva?'':'<label>Codice a 6 cifre attuale, per confermare<input class="form-control" name="improntaOtp" inputmode="numeric" autocomplete="one-time-code" maxlength="6"></label>'}<button type="button" class="btn ${attiva?'btn-light':'btn-primary'}" id="improntaBtn">${attiva?'Disattiva l’impronta su questo dispositivo':'Usa l’impronta al posto del codice a 6 cifre'}</button><div class="notice danger hidden" id="improntaErrore"></div></div>`;
    const btn=host.querySelector('#improntaBtn'),err=host.querySelector('#improntaErrore');
    btn.addEventListener('click',async()=>{
      err.classList.add('hidden');btn.disabled=true;
      try{
        if(attiva){if(!confirm('Disattivare l’impronta su questo dispositivo? Dal prossimo accesso servirà il codice a 6 cifre.')){btn.disabled=false;return;}await Impronta.disattiva();}
        else{const otp=String(host.querySelector('[name="improntaOtp"]')?.value||'').replace(/\D/g,'');if(otp.length!==6)throw new Error('Inserisci il codice a 6 cifre attuale');btn.textContent='Appoggia il dito sul sensore…';await Impronta.attiva(otp,user);alert('Impronta attivata. Dal prossimo accesso su questo dispositivo non servirà più il codice a 6 cifre.');}
      }catch(error){err.textContent=error.message;err.classList.remove('hidden');btn.disabled=false;btn.textContent=attiva?'Disattiva l’impronta su questo dispositivo':'Usa l’impronta al posto del codice a 6 cifre';return;}
      await disegnaImpronta(root);
    });
  }

  async function linkOwnProfile(profileId){
    if(!session)throw new Error('Archivio bloccato');
    const result=await api('/api/auth/family-self-profile',{method:'POST',body:{profileId:String(profileId||'')}});
    session.user=result.user;
    const activationId=localStorage.getItem('dossierFamilyActivationId');
    if(activationId&&session.user?.mfaEnabled){
      try{const exported=await api('/api/auth/account-export');await DossierCloud.publishFamilyAccountCompletion({activationId,profileId:session.user.linkedProfileId||'',account:exported.account});localStorage.removeItem('dossierFamilyActivationId');}catch(error){console.warn('Aggiornamento collegamento profilo familiare rinviato:',error);}
    }
    window.dispatchEvent(new Event('dossier-security-changed'));
    return session.user;
  }

  async function registerCurrentDevice(){ensureDevice();return device;}async function assertDeviceActive(){return true;}

  async function exportSecurityBackup(){if(!session)throw new Error('Archivio bloccato');if(!canUse('backup'))throw new Error('Il tuo account non è autorizzato a creare backup');const result=await api('/api/auth/backup');return result.bundle||{};}
  async function validateSecurityBackup(bundle){if(!session)throw new Error('Archivio bloccato');if(!isAdministrator())throw new Error('La verifica di utenti e credenziali è riservata all’amministratore');return api('/api/auth/backup/validate',{method:'POST',body:{bundle}});}
  async function restoreSecurityBackup(bundle,{deviceCloudLinked=false,archiveId=''}={}){if(!session)throw new Error('Archivio bloccato');if(!isAdministrator())throw new Error('Il ripristino di utenti e credenziali è riservato all’amministratore');return api('/api/auth/backup/restore',{method:'POST',body:{bundle,deviceCloudLinked:Boolean(deviceCloudLinked),archiveId:String(archiveId||'')}});}

  return {bootstrap,lock,currentUser,currentDevice,canAccessProfile,canEditProfile,canViewAgendaProfile,canManageAgendaAppointments,canManageAgendaMedications,agendaAuthorizedProfileIds,repairAgendaGrantPrincipals,assertCanEdit,filterProfiles,sortProfiles,isAdministrator,accessLevel,canUse,canManageUsers,canManagePermissions,planAllowsCurrentAccount,preferencesHtml,bindPreferences,enableMfa,requireMfaForCloud,getSecuritySettings,saveSecuritySettings,verifyDeveloperMfa,setDeveloperMode,isDeveloperMode,regenerateRecoveryCodes,linkOwnProfile,registerCurrentDevice,assertDeviceActive,beginTechnicalActivity,endTechnicalActivity,technicalActivityActive,exportSecurityBackup,validateSecurityBackup,restoreSecurityBackup,deviceCloudStatus,setDeviceCloudLinked,reviewGeneralWarnings,ensureGeneralWarningsAccepted,request:api,uploadBlob,fetchBlob,protectSecret:async value=>{if(!session)throw new Error('Archivio bloccato');return encryptText(String(value),session.encryptionKey);},unprotectSecret:async payload=>{if(!session)throw new Error('Archivio bloccato');return decryptText(payload,session.encryptionKey);},protectDeviceSecret:protectDeviceSecretLocal,unprotectDeviceSecret:unprotectDeviceSecretLocal};
})();

window.addEventListener('unhandledrejection',event=>{const overlay=document.querySelector('#securityOverlay:not(.hidden)');if(!overlay)return;const error=document.querySelector('#securityError');if(error){error.textContent=`Operazione non completata: ${event.reason?.message||event.reason||'errore sconosciuto'}`;error.classList.remove('hidden');}console.error('Errore non gestito nel sistema di accesso:',event.reason);});
globalThis.DossierSecurity = DossierSecurity;
