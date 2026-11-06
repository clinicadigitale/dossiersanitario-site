'use strict';

const DossierUpdates=(()=>{
  const API='http://127.0.0.1:8896';
  const DEFAULT_BACKGROUND_MS=15*60*1000;
  let lastResult=null,checkedAt='',backgroundTimer=null,downloadBusy=false;

  async function request(path,{method='GET',body=null}={}){
    const response=await fetch(API+path,{
      method,
      cache:'no-store',
      headers:{'Content-Type':'application/json'},
      body:body===null?undefined:JSON.stringify(body)
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok||data.ok===false)throw new Error(data.error||`Errore ${response.status}`);
    return data;
  }
  function esc(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));}
  function fmtDate(value){try{return new Intl.DateTimeFormat('it-IT',{dateStyle:'short',timeStyle:'short'}).format(new Date(value));}catch{return value||'Non eseguito';}}
  function updateLabel(data={}){
    if(data.stagedReady)return'Aggiornamento scaricato';
    if(data.available&&downloadBusy)return'Download in corso';
    if(data.available&&!data.environment?.autoDownloadEligible)return'In attesa di Wi-Fi/alimentazione';
    if(data.available)return'Aggiornamento disponibile';
    return'Aggiornato';
  }
  function releaseNotes(data={}){
    const rows=Array.isArray(data.releaseNotes)?data.releaseNotes.filter(Boolean):[];
    return rows.length?`\n\nNovità:\n${rows.slice(0,8).map(x=>`• ${x}`).join('\n')}`:'';
  }
  async function promptInstall(data={}){
    const version=String(data.version||data.displayVersion||'aggiornamento');
    const promptKey=`dossierUpdatePrompted:${version}`;
    if(sessionStorage.getItem(promptKey))return;
    sessionStorage.setItem(promptKey,'1');
    const label=String(data.displayVersion||version);
    const accepted=confirm(`Clinica Digitale ${label} è stato scaricato ed è pronto per l'installazione.${releaseNotes(data)}\n\nInstallarlo adesso?`);
    if(!accepted){injectPreferencesCard();return;}
    try{
      await request('/api/updates/install',{method:'POST',body:{}});
    }catch(error){alert(`Installazione aggiornamento non avviata: ${error.message}`);}
  }
  async function autoDownloadIfEligible(data={}){
    if(!data.available||data.automaticUpdates===false)return;
    if(data.stagedReady){await promptInstall(data);return;}
    if(!data.environment?.autoDownloadEligible||downloadBusy)return;
    downloadBusy=true;injectPreferencesCard();
    try{
      const result=await request('/api/updates/download',{method:'POST',body:{}});
      lastResult={...data,stagedReady:!!result.ready,downloadedBytes:Number(result.bytes||0)};
      injectPreferencesCard();
      if(result.ready)await promptInstall(lastResult);
    }catch(error){
      lastResult={...data,downloadError:error.message};
      injectPreferencesCard();
    }finally{downloadBusy=false;injectPreferencesCard();}
  }
  async function check(showResult=false){
    try{
      lastResult=await request('/api/updates/check');
      checkedAt=new Date().toISOString();
      localStorage.setItem('dossierLastUpdateCheck',checkedAt);
      injectPreferencesCard();
      if(lastResult.available)void autoDownloadIfEligible(lastResult);
      else if(showResult)alert('Clinica Digitale è aggiornato.');
      return lastResult;
    }catch(error){
      lastResult={ok:false,error:error.message,available:false};
      checkedAt=new Date().toISOString();
      injectPreferencesCard();
      if(showResult)alert(`Controllo aggiornamenti non disponibile: ${error.message}`);
      return lastResult;
    }
  }
  function cardHtml(){
    const data=lastResult||{};const failed=!!data.error;const available=!!data.available;
    const latest=available?(data.displayVersion||data.version||'Disponibile'):(data.displayCurrentVersion||data.currentVersion||'—');
    const status=failed?'Stato non disponibile':updateLabel(data);
    const env=data.environment||{};
    const condition=env.hasBattery?(env.wifiConnected&&env.powered?'Wi-Fi e alimentazione disponibili':`Attesa: ${env.wifiConnected?'Wi-Fi OK':'Wi-Fi assente'} · ${env.powered?'alimentazione OK':'collegare alimentazione'}`):'PC fisso: download automatico consentito';
    return `<section class="card preference-section" id="updatesPreferenceSection"><div class="card-title-row"><div><h2>Aggiornamenti</h2><p class="kpi-note">Clinica Digitale controlla gli aggiornamenti all'avvio e in background. Quando le condizioni sono adatte scarica il pacchetto e chiede conferma prima dell'installazione.</p></div><div class="pref-head-actions"><span class="badge ${failed?'warning':available?'success':''}">${esc(status)}</span><button type="button" class="btn btn-light btn-small" id="checkUpdatesNowBtn">Controlla ora</button></div></div><div class="grid grid-2"><div><small>Versione installata</small><strong style="display:block;margin-top:4px">${esc(data.displayCurrentVersion||data.currentVersion||'—')}</strong></div><div><small>Versione più recente</small><strong style="display:block;margin-top:4px">${esc(latest)}</strong></div><div><small>Ultimo controllo</small><strong style="display:block;margin-top:4px">${esc(fmtDate(checkedAt||localStorage.getItem('dossierLastUpdateCheck')||''))}</strong></div><div><small>Download automatico</small><strong style="display:block;margin-top:4px">${esc(condition)}</strong></div></div>${data.downloadError?`<div class="notice warning" style="margin-top:12px">${esc(data.downloadError)}</div>`:''}</section>`;
  }
  function injectPreferencesCard(){
    const form=document.querySelector('#preferencesForm');if(!form)return;
    const old=document.querySelector('#updatesPreferenceSection');if(old)old.outerHTML=cardHtml();else{const actions=form.querySelector('.preference-actions');if(actions)actions.insertAdjacentHTML('beforebegin',cardHtml());else form.insertAdjacentHTML('beforeend',cardHtml());}
    document.querySelector('#checkUpdatesNowBtn')?.addEventListener('click',()=>void check(true));
  }
  function observePreferences(){const container=document.querySelector('#viewContainer');if(!container)return;const observer=new MutationObserver(()=>{const form=document.querySelector('#preferencesForm');if(form&&!form.querySelector('#updatesPreferenceSection'))injectPreferencesCard();});observer.observe(container,{childList:true,subtree:true});}
  function startBackground(){if(backgroundTimer)clearInterval(backgroundTimer);backgroundTimer=setInterval(()=>void check(false),DEFAULT_BACKGROUND_MS);}
  function init(){
    observePreferences();
    setTimeout(()=>void check(false),1200);
    startBackground();
    window.addEventListener('online',()=>setTimeout(()=>void check(false),1000));
    window.addEventListener('focus',()=>{const last=Date.parse(localStorage.getItem('dossierLastUpdateCheck')||'0')||0;if(Date.now()-last>5*60*1000)void check(false);});
  }
  document.addEventListener('DOMContentLoaded',init,{once:true});
  return {check,injectPreferencesCard};
})();
globalThis.DossierUpdates=DossierUpdates;
