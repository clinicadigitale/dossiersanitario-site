'use strict';

const DossierDiagnostics = (()=>{
  const API='http://127.0.0.1:8896';
  let status=null;
  let accepted=false;
  let consentKnown=false;
  let installationId='';

  async function request(path,options={}){
    const response=await fetch(API+path,{cache:'no-store',...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});
    const data=await response.json().catch(()=>({}));
    if(!response.ok||data.ok===false)throw new Error(data.error||`Errore ${response.status}`);
    return data;
  }

  async function loadStatus(){
    status=await request('/api/diagnostics/status');
    installationId=String(status.installationId||'');
    const cfg=status.config||{};
    const notice=String(cfg.noticeVersion||'');
    consentKnown=Object.prototype.hasOwnProperty.call(status.consents||{},notice);
    accepted=!!status.consents?.[notice]?.accepted;
    return status;
  }

  function esc(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));}

  function overlayHtml(cfg){
    return `<div id="diagnosticsNoticeOverlay" style="position:fixed;inset:0;z-index:100000;background:rgba(15,23,42,.62);display:flex;align-items:center;justify-content:center;padding:24px;font-family:Segoe UI,Arial,sans-serif">
      <section style="width:min(680px,100%);max-height:90vh;overflow:auto;background:white;border-radius:18px;box-shadow:0 24px 70px rgba(0,0,0,.25);padding:30px;color:#1f2937">
        <div style="display:flex;gap:16px;align-items:center;margin-bottom:18px"><img src="assets/icon-128.png" alt="" style="width:64px;height:64px"><div><div style="font-size:12px;font-weight:800;letter-spacing:.08em;color:#0f766e">DOSSIER SANITARIO LOCALE</div><h2 style="margin:4px 0 0;font-size:26px">${esc(cfg.displayName||'Versione 1.0.0')}</h2></div></div>
        <div style="background:#eef8f6;border:1px solid #ccebe5;border-radius:12px;padding:16px;line-height:1.55">
          <strong>Clinica Digitale può raccogliere, solo con il tuo consenso, una diagnostica tecnica locale per individuare malfunzionamenti.</strong><br><br>
          Se scegli <strong>Accetto e continuo</strong>, il Dossier registra automaticamente, su questo dispositivo, soltanto informazioni tecniche utili a individuare errori: versione, ID installazione, sezione attiva ed eventuali errori del programma. <strong>Non vengono inclusi documenti sanitari, testi clinici, credenziali o contenuti dell'archivio.</strong><br><br>
          Se scegli <strong>Non accetto e continuo</strong>, puoi usare normalmente il Dossier ma non partecipi alla raccolta diagnostica: non vengono registrati né preparati report tecnici. La scelta potrà essere modificata successivamente.<br><br>
          Se partecipi, per inviare una segnalazione usa il pulsante <strong>Segnala problema</strong>: verrà creato un pacchetto diagnostico tecnico e si aprirà la pagina MEGA dedicata alle segnalazioni tecniche. L'invio del pacchetto avviene soltanto dopo una tua conferma esplicita.
        </div>
        <p style="font-size:13px;color:#64748b;margin:14px 0 0">ID installazione: <strong>${esc(installationId||'in preparazione')}</strong></p>
        <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:22px;flex-wrap:wrap"><button id="diagnosticsDeclineBtn" style="border:1px solid #cbd5e1;border-radius:10px;background:#fff;color:#334155;padding:11px 18px;font-weight:700;cursor:pointer">Non accetto e continuo</button><button id="diagnosticsAcceptBtn" style="border:0;border-radius:10px;background:#0f766e;color:white;padding:11px 18px;font-weight:700;cursor:pointer">Accetto e continuo</button></div>
      </section>
    </div>`;
  }

  async function ensureAccepted(){
    try{await loadStatus();}catch(error){console.warn('Stato diagnostica non disponibile:',error);return true;}
    const cfg=status?.config||{};
    if(!cfg.active)return true;
    if(consentKnown){if(accepted){installDiagnostics();installReportButton();}installConsentControl();return true;}
    document.body.insertAdjacentHTML('beforeend',overlayHtml(cfg));
    return await new Promise(resolve=>{
      const accept=document.querySelector('#diagnosticsAcceptBtn'),decline=document.querySelector('#diagnosticsDeclineBtn');
      const choose=async value=>{
        if(accept)accept.disabled=true;if(decline)decline.disabled=true;
        const active=value?accept:decline;if(active)active.textContent='Salvataggio…';
        try{
          const result=await request('/api/diagnostics/consent',{method:'POST',body:JSON.stringify({accepted:value,noticeVersion:cfg.noticeVersion})});
          accepted=value;consentKnown=true;installationId=result.installationId||installationId;document.querySelector('#diagnosticsNoticeOverlay')?.remove();
          if(accepted){installDiagnostics();installReportButton();}installConsentControl();resolve(true);
        }catch(error){if(accept){accept.disabled=false;accept.textContent='Accetto e continuo';}if(decline){decline.disabled=false;decline.textContent='Non accetto e continuo';}alert(`Impossibile registrare la scelta: ${error.message}`);}
      };
      accept?.addEventListener('click',()=>void choose(true));decline?.addEventListener('click',()=>void choose(false));
    });
  }

  function consentDialog(){
    const cfg=status?.config||{};const value=accepted;
    const overlay=document.createElement('div');overlay.id='diagnosticsConsentSettingsOverlay';overlay.style.cssText='position:fixed;inset:0;z-index:100001;background:rgba(15,23,42,.62);display:flex;align-items:center;justify-content:center;padding:24px;font-family:Segoe UI,Arial,sans-serif';
    overlay.innerHTML=`<section style="width:min(560px,100%);background:#fff;border-radius:18px;box-shadow:0 24px 70px rgba(0,0,0,.25);padding:26px;color:#1f2937"><h2 style="margin-top:0">Diagnostica tecnica</h2><p>${value?'La diagnostica tecnica è attiva. Puoi disattivarla e continuare a usare normalmente il Dossier.':'La raccolta diagnostica è disattivata. Puoi attivarla in qualsiasi momento.'}</p><div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px"><button id="diagnosticsConsentClose" class="btn btn-light" type="button">Chiudi</button><button id="diagnosticsConsentToggle" class="btn btn-primary" type="button">${value?'Non accetto e continuo':'Accetto e partecipo'}</button></div></section>`;
    document.body.appendChild(overlay);overlay.querySelector('#diagnosticsConsentClose')?.addEventListener('click',()=>overlay.remove());overlay.querySelector('#diagnosticsConsentToggle')?.addEventListener('click',async()=>{const b=overlay.querySelector('#diagnosticsConsentToggle');if(b){b.disabled=true;b.textContent='Salvataggio…';}try{await request('/api/diagnostics/consent',{method:'POST',body:JSON.stringify({accepted:!value,noticeVersion:cfg.noticeVersion})});accepted=!value;consentKnown=true;overlay.remove();if(accepted){installDiagnostics();installReportButton();}else{document.querySelector('#diagnosticsReportBtn')?.remove();}installConsentControl();}catch(error){if(b){b.disabled=false;b.textContent=value?'Non accetto e continuo':'Accetto e partecipo';}alert(`Impossibile aggiornare la scelta: ${error.message}`);}});
  }
  function installConsentControl(){
    const actions=document.querySelector('.top-actions');if(!actions)return;
    let b=actions.querySelector('#diagnosticsConsentBtn');
    if(!b){b=document.createElement('button');b.id='diagnosticsConsentBtn';b.type='button';b.className='btn btn-light';b.addEventListener('click',consentDialog);actions.prepend(b);}
    const label=accepted?'Diagnostica attiva':'Diagnostica disattivata';if(b.textContent!==label)b.textContent=label;
    b.title='Gestisci la diagnostica tecnica';
  }

  function reportEndpoint(){return String(status?.config?.diagnostics?.endpoint||'').trim();}

  function reportFileNameFromDisposition(value=''){
    const star=String(value||'').match(/filename\*=UTF-8''([^;]+)/i);if(star){try{return decodeURIComponent(star[1].replace(/^"|"$/g,''));}catch{}}
    const plain=String(value||'').match(/filename="?([^";]+)"?/i);return plain?plain[1]:'ClinicaDigitale_diagnostica.zip';
  }
  function downloadReportBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);}
  function reportDialog(){
    const endpoint=reportEndpoint();
    if(!endpoint){alert('Canale segnalazioni tecniche non configurato.');return;}
    const overlay=document.createElement('div');
    overlay.id='diagnosticsReportOverlay';
    overlay.style.cssText='position:fixed;inset:0;z-index:100001;background:rgba(15,23,42,.62);display:flex;align-items:center;justify-content:center;padding:24px;font-family:Segoe UI,Arial,sans-serif';
    overlay.innerHTML=`<section style="width:min(640px,100%);background:#fff;border-radius:18px;box-shadow:0 24px 70px rgba(0,0,0,.25);padding:28px;color:#1f2937"><h2 style="margin-top:0">Segnala un problema</h2><p>Il Dossier genera un file ZIP contenente soltanto la diagnostica tecnica del programma.</p><div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:14px;line-height:1.55;margin-top:14px"><strong>Il pacchetto non contiene descrizioni libere, documenti sanitari o testi clinici.</strong> Non allegare manualmente referti, immagini o schermate che contengano dati clinici o personali.</div><div style="background:#eef8f6;border:1px solid #ccebe5;border-radius:12px;padding:14px;line-height:1.6;margin-top:14px"><strong>Come funziona:</strong><br>1. Premi <strong>Genera file ZIP</strong>.<br>2. Il file viene salvato nella cartella usata dal tuo dispositivo o browser per i download.<br>3. Il Dossier ti mostra il nome esatto del file generato.<br>4. Solo dopo una tua seconda conferma si apre la pagina MEGA per l'invio.<br>5. Nella pagina MEGA carica <strong>anche il file ZIP appena generato</strong>: è il file diagnostico che devi inviare. Non caricare referti, immagini o altri file contenenti dati clinici o personali.</div><p style="font-size:13px;color:#64748b">ID installazione: <strong>${esc(installationId||'')}</strong></p><div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px"><button id="diagnosticsReportCancel" class="btn btn-light" type="button">Annulla</button><button id="diagnosticsReportPrepare" class="btn btn-primary" type="button">Genera file ZIP</button></div></section>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#diagnosticsReportCancel')?.addEventListener('click',()=>overlay.remove());
    overlay.querySelector('#diagnosticsReportPrepare')?.addEventListener('click',async()=>{
      const b=overlay.querySelector('#diagnosticsReportPrepare');if(b){b.disabled=true;b.textContent='Generazione…';}
      try{
        await sendEvent('manual-report-prepared',{installationId});
        const response=await fetch(API+'/api/diagnostics/report-package',{cache:'no-store'});
        if(!response.ok)throw new Error('Pacchetto diagnostico non disponibile');
        const name=reportFileNameFromDisposition(response.headers.get('Content-Disposition')||'');
        const blob=await response.blob();
        downloadReportBlob(blob,name);
        overlay.innerHTML=`<section style="width:min(640px,100%);background:#fff;border-radius:18px;box-shadow:0 24px 70px rgba(0,0,0,.25);padding:28px;color:#1f2937"><h2 style="margin-top:0">File ZIP generato</h2><div style="background:#eef8f6;border:1px solid #ccebe5;border-radius:12px;padding:16px;line-height:1.65"><strong>Il Dossier ha generato il file diagnostico e lo ha salvato nella cartella utilizzata dal tuo dispositivo o browser per i download.</strong><br><br>File da allegare su MEGA:<br><code style="display:inline-block;margin:8px 0 12px;word-break:break-all">${esc(name)}</code><br><strong>Conferma l'invio solo se vuoi realmente segnalare un problema.</strong> Dopo la conferma si aprirà la pagina MEGA: seleziona lì il file ZIP indicato sopra. Non caricare altri file contenenti dati clinici o personali.</div><div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px"><button id="diagnosticsReportAbortSend" class="btn btn-light" type="button">Annulla invio</button><button id="diagnosticsReportConfirmSend" class="btn btn-primary" type="button">Conferma e apri MEGA</button></div></section>`;
        overlay.querySelector('#diagnosticsReportAbortSend')?.addEventListener('click',()=>overlay.remove());
        overlay.querySelector('#diagnosticsReportConfirmSend')?.addEventListener('click',async()=>{
          const confirmButton=overlay.querySelector('#diagnosticsReportConfirmSend');
          if(confirmButton){confirmButton.disabled=true;confirmButton.textContent='Apertura MEGA…';}
          await sendEvent('manual-report-confirmed',{installationId});
          const megaWindow=window.open(endpoint,'_blank');
          if(!megaWindow){window.location.href=endpoint;return;}
          overlay.innerHTML=`<section style="width:min(640px,100%);background:#fff;border-radius:18px;box-shadow:0 24px 70px rgba(0,0,0,.25);padding:28px;color:#1f2937"><h2 style="margin-top:0">Invio su MEGA</h2><div style="background:#eef8f6;border:1px solid #ccebe5;border-radius:12px;padding:16px;line-height:1.65">Nella pagina MEGA appena aperta scegli il file:<br><code style="display:inline-block;margin:8px 0 12px;word-break:break-all">${esc(name)}</code><br>Il file si trova nella cartella usata per i download. <strong>Se non hai altro materiale da aggiungere</strong>, seleziona soltanto questo file ZIP. Non aggiungere referti, immagini o altri file contenenti dati clinici o personali. Il caricamento su MEGA parte dopo che lo hai selezionato.</div><div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px"><button id="diagnosticsReportDone" class="btn btn-primary" type="button">Ho terminato il caricamento</button></div></section>`;
          overlay.querySelector('#diagnosticsReportDone')?.addEventListener('click',()=>overlay.remove());
        });
      }catch(error){
        if(b){b.disabled=false;b.textContent='Riprova';}
        alert(`Impossibile preparare la segnalazione: ${error.message}`);
      }
    });
  }

  function installReportButton(){
    const actions=document.querySelector('.top-actions');
    if(!actions||actions.querySelector('#diagnosticsReportBtn'))return;
    const button=document.createElement('button');button.id='diagnosticsReportBtn';button.type='button';button.className='btn btn-light';button.textContent='Segnala problema';button.title='Invia una segnalazione tecnica';button.addEventListener('click',reportDialog);actions.prepend(button);
  }

  function compactError(error){
    if(!error)return{};
    return {message:String(error.message||error).slice(0,2000),stack:String(error.stack||'').slice(0,8000)};
  }

  async function sendEvent(type,details={}){
    if(!accepted)return;
    try{await request('/api/diagnostics/event',{method:'POST',body:JSON.stringify({type,userAgent:navigator.userAgent,view:document.querySelector('.nav-item.active')?.dataset?.view||'',details})});}catch{}
  }

  let diagnosticsInstalled=false;
  function installDiagnostics(){
    if(diagnosticsInstalled||!accepted)return;diagnosticsInstalled=true;
    window.addEventListener('error',event=>void sendEvent('javascript-error',{message:String(event.message||''),source:String(event.filename||''),line:event.lineno||0,column:event.colno||0,...compactError(event.error)}));
    window.addEventListener('unhandledrejection',event=>void sendEvent('unhandled-rejection',compactError(event.reason)));
    void sendEvent('session-start',{href:location.href});
  }

  async function info(){if(!status)await loadStatus().catch(()=>{});return {status,accepted,consentKnown,installationId};}

  return {ensureAccepted,installDiagnostics,info,sendEvent};
})();
globalThis.DossierDiagnostics=DossierDiagnostics;
