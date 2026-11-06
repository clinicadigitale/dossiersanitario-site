'use strict';

const DossierCalendar = (() => {
  async function request(path, options={}) {
    if (!globalThis.DossierSecurity?.request) throw new Error('Sessione del Dossier non disponibile');
    return DossierSecurity.request(path, options);
  }

  async function localStatus() {
    try { return await request('/api/calendar/local/status'); }
    catch (error) { return {ok:false, supported:false, error:error.message}; }
  }

  async function scheduleLocal(event, profileName='') {
    return request('/api/calendar/local/schedule', {method:'POST', body:{event, profileName}});
  }

  async function cancelLocal(eventId) {
    return request('/api/calendar/local/cancel', {method:'POST', body:{eventId}});
  }

  async function scheduleMedicationLocal(event, profileName='') {
    return request('/api/calendar/medication/local/schedule', {method:'POST', body:{event,profileName}});
  }
  async function cancelMedicationLocal(eventId='',profileId='') {
    return request('/api/calendar/medication/local/cancel', {method:'POST', body:{eventId:String(eventId||''),profileId:String(profileId||'')}});
  }
  async function medicationLocalActions(profileId='') {
    return request(`/api/calendar/medication/local/actions?profileId=${encodeURIComponent(String(profileId||''))}`);
  }
  async function consumeMedicationLocalActions(ids=[]) {
    return request('/api/calendar/medication/local/actions/consume',{method:'POST',body:{ids:Array.isArray(ids)?ids:[]}});
  }

  function icsEscape(value='') {
    return String(value||'').replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');
  }

  function pad2(value){return String(value).padStart(2,'0');}
  function icsDate(date=''){return String(date||'').replace(/-/g,'');}
  function icsDateTime(date='',time='09:00'){
    const t=String(time||'09:00').slice(0,5).split(':');
    return `${icsDate(date)}T${pad2(t[0]||'09')}${pad2(t[1]||'00')}00`;
  }
  function addMinutes(date='',time='09:00',minutes=60){
    const d=new Date(`${date}T${time||'09:00'}:00`);
    if(Number.isNaN(d.getTime()))return{date,time};
    d.setMinutes(d.getMinutes()+Number(minutes||60));
    return{date:`${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`,time:`${pad2(d.getHours())}:${pad2(d.getMinutes())}`};
  }
  function nextDate(date=''){
    const d=new Date(`${date}T12:00:00`);if(Number.isNaN(d.getTime()))return date;
    d.setDate(d.getDate()+1);return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
  }

  function eventIcsLines(event={}, profileName='') {
    const uid=`${String(event.id||crypto.randomUUID?.()||Date.now())}@dossiersanitariolocale`;
    const now=new Date();const stamp=`${now.getUTCFullYear()}${pad2(now.getUTCMonth()+1)}${pad2(now.getUTCDate())}T${pad2(now.getUTCHours())}${pad2(now.getUTCMinutes())}${pad2(now.getUTCSeconds())}Z`;
    const owner=String(event.calendarOwnerName||profileName||'').trim();const title=String(event.title||'Promemoria sanitario');
    const lines=['BEGIN:VEVENT',`UID:${icsEscape(uid)}`,`DTSTAMP:${stamp}`,`SUMMARY:${icsEscape(owner?`${owner} - ${title}`:title)}`];
    if(event.allDay){lines.push(`DTSTART;VALUE=DATE:${icsDate(event.startDate)}`,`DTEND;VALUE=DATE:${icsDate(nextDate(event.startDate))}`);}else{
      const end=addMinutes(event.startDate,event.startTime||'09:00',event.durationMinutes||60);
      lines.push(`DTSTART:${icsDateTime(event.startDate,event.startTime||'09:00')}`,`DTEND:${icsDateTime(end.date,end.time)}`);
    }
    if(event.location)lines.push(`LOCATION:${icsEscape(event.location)}`);
    const description=[owner?`Profilo: ${owner}`:'',event.category?`Tipo: ${event.category}`:'',event.notes||'',event.sourceDocumentTitle?`Origine: ${event.sourceDocumentTitle}`:''].filter(Boolean).join('\n');
    if(description)lines.push(`DESCRIPTION:${icsEscape(description)}`);
    if(event.recurrence==='yearly')lines.push('RRULE:FREQ=YEARLY');
    for(const raw of event.reminders||[]){const minutes=Math.max(0,Number(raw)||0);if(!minutes)continue;lines.push('BEGIN:VALARM',`TRIGGER:-PT${minutes}M`,'ACTION:DISPLAY',`DESCRIPTION:${icsEscape(event.title||'Promemoria sanitario')}`,'END:VALARM');}
    lines.push('END:VEVENT');return lines;
  }

  function buildIcs(events=[], profileName='') {
    const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Dossier Sanitario Locale//Agenda//IT','CALSCALE:GREGORIAN','METHOD:PUBLISH'];
    for(const event of events)lines.push(...eventIcsLines(event,profileName));
    lines.push('END:VCALENDAR');return lines.join('\r\n')+'\r\n';
  }

  function downloadIcs(events, profileName='') {
    const rows=Array.isArray(events)?events:[events];if(!rows.length)return;
    const blob=new Blob([buildIcs(rows,profileName)],{type:'text/calendar;charset=utf-8'});
    const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;
    const safe=String(profileName||'agenda').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]+/g,'_').replace(/^_+|_+$/g,'')||'agenda';
    a.download=rows.length===1?`Dossier_${safe}_${String(rows[0].startDate||'evento')}.ics`:`Dossier_${safe}_agenda.ics`;
    document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  function googleCalendarUrl(event={}, profileName='', accountEmail='') {
    const owner=String(event.calendarOwnerName||profileName||'').trim();const title=String(event.title||'Promemoria sanitario');
    const params=new URLSearchParams();params.set('action','TEMPLATE');params.set('text',owner?`${owner} - ${title}`:title);
    const preferredAccount=String(accountEmail||'').trim();if(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(preferredAccount))params.set('authuser',preferredAccount);
    if(event.allDay){
      params.set('dates',`${icsDate(event.startDate)}/${icsDate(nextDate(event.startDate))}`);
    }else{
      const end=addMinutes(event.startDate,event.startTime||'09:00',event.durationMinutes||60);
      params.set('dates',`${icsDateTime(event.startDate,event.startTime||'09:00')}/${icsDateTime(end.date,end.time)}`);
      try{const zone=Intl.DateTimeFormat().resolvedOptions().timeZone;if(zone)params.set('ctz',zone);}catch{}
    }
    const details=[owner?`Profilo: ${owner}`:'',event.category?`Tipo: ${event.category}`:'',event.notes||'',event.sourceDocumentTitle?`Origine: ${event.sourceDocumentTitle}`:''].filter(Boolean).join('\n');
    if(details)params.set('details',details);if(event.location)params.set('location',String(event.location));
    if(event.recurrence==='yearly')params.set('recur','RRULE:FREQ=YEARLY');
    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  }

  function openGoogleCalendar(event={}, profileName='', accountEmail='') {
    const url=googleCalendarUrl(event,profileName,accountEmail);
    const win=window.open(url,'_blank','noopener,noreferrer');
    return {opened:!!win,url};
  }

  function googleAdvancedAllowed(){return Boolean(globalThis.DossierFeatures?.has?.('googleCalendarAuto'));}
  function googleAdvancedRequired(){if(!googleAdvancedAllowed())throw new Error(globalThis.DossierFeatures?.message?.('googleCalendarAuto')||'Google Calendar automatico disponibile dal piano MEDIUM.');}
  async function googleAdvancedStatus(){
    if(!googleAdvancedAllowed())return{ok:true,configured:false,connected:false,licenseLocked:true,healthDataConsent:{granted:false},medicationDataConsent:{granted:false}};
    try{return await request('/api/calendar/google/status');}catch(error){return{ok:false,configured:false,connected:false,error:error.message};}
  }
  async function googleAdvancedConfigure(config={}){googleAdvancedRequired();
    return request('/api/calendar/google/configure',{method:'POST',body:config});
  }
  async function googleAdvancedSetHealthConsent(granted=false){googleAdvancedRequired();
    return request('/api/calendar/google/consent',{method:'POST',body:{granted:!!granted}});
  }
  async function googleAdvancedSetMedicationConsent(granted=false){googleAdvancedRequired();
    return request('/api/calendar/google/medication-consent',{method:'POST',body:{granted:!!granted}});
  }
  async function googleAdvancedStartOAuth(){googleAdvancedRequired();
    return request('/api/calendar/google/oauth/start',{method:'POST',body:{}});
  }
  async function googleAdvancedDisconnect(){googleAdvancedRequired();
    return request('/api/calendar/google/disconnect',{method:'POST',body:{}});
  }
  function browserTimeZone(){try{return Intl.DateTimeFormat().resolvedOptions().timeZone||'';}catch{return'';}}
  async function googleAdvancedSyncEvent(event={},profileName='',createIfMissing=false){googleAdvancedRequired();
    return request('/api/calendar/google/event/sync',{method:'POST',body:{event,profileName,createIfMissing:!!createIfMissing,timeZone:browserTimeZone()}});
  }
  async function googleAdvancedSyncAll(events=[],profileName=''){googleAdvancedRequired();
    return request('/api/calendar/google/events/sync-all',{method:'POST',body:{events:Array.isArray(events)?events:[],profileName,timeZone:browserTimeZone()}});
  }
  async function googleAdvancedEventStatuses(eventIds=[]){
    if(!googleAdvancedAllowed())return{ok:true,events:{},licenseLocked:true};
    const ids=(Array.isArray(eventIds)?eventIds:[]).map(x=>String(x||'').trim()).filter(Boolean).slice(0,1000);
    if(!ids.length)return{ok:true,events:{}};
    return request(`/api/calendar/google/events/status?ids=${encodeURIComponent(ids.join(','))}`);
  }
  async function googleAdvancedDeleteEvent(eventId=''){googleAdvancedRequired();
    return request('/api/calendar/google/event/delete',{method:'POST',body:{eventId:String(eventId||'')}});
  }

  return {localStatus, scheduleLocal, cancelLocal,scheduleMedicationLocal,cancelMedicationLocal,medicationLocalActions,consumeMedicationLocalActions, buildIcs, downloadIcs, googleCalendarUrl, openGoogleCalendar,googleAdvancedStatus,googleAdvancedConfigure,googleAdvancedSetHealthConsent,googleAdvancedSetMedicationConsent,googleAdvancedStartOAuth,googleAdvancedDisconnect,googleAdvancedSyncEvent,googleAdvancedSyncAll,googleAdvancedEventStatuses,googleAdvancedDeleteEvent};
})();

globalThis.DossierCalendar = DossierCalendar;
