'use strict';

const DossierDoctorExport=(()=>{
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const safeName=v=>String(v||'file').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Za-z0-9._-]+/g,'_').replace(/^_+|_+$/g,'').slice(0,120)||'file';
  const fmtDate=v=>{if(!v)return'';const d=new Date(String(v).length<=10?`${v}T12:00:00`:v);return Number.isNaN(d.getTime())?String(v):new Intl.DateTimeFormat('it-IT',{dateStyle:'short'}).format(d);};
  const fmtDateTime=v=>{if(!v)return'';const d=new Date(v);return Number.isNaN(d.getTime())?String(v):new Intl.DateTimeFormat('it-IT',{dateStyle:'short',timeStyle:'short'}).format(d);};
  const yieldUi=()=>new Promise(r=>setTimeout(r,0));
  const includedDoc=d=>d?.timelineVisible!==false&&((d?.pdfExportOverride===true?(d.pdfExportMode||'full'):(/cartella clinica/i.test(`${d?.documentKind||''} ${d?.category||''}`)?'exclude':'full'))!=='exclude');

  function overlay(html){document.querySelector('#doctorExportOverlay')?.remove();const el=document.createElement('div');el.id='doctorExportOverlay';el.style.cssText='position:fixed;inset:0;z-index:100010;background:rgba(15,23,42,.62);display:flex;align-items:center;justify-content:center;padding:24px;font-family:Segoe UI,Arial,sans-serif';el.innerHTML=html;document.body.appendChild(el);return el;}
  function close(){document.querySelector('#doctorExportOverlay')?.remove();}
  async function profilesAllowed(){const rows=await DossierDB.getAll('profiles');return DossierSecurity?.filterProfiles?DossierSecurity.filterProfiles(rows):rows.filter(p=>DossierSecurity?.canAccessProfile?.(p.id)!==false);}

  async function openDialog(){if(!globalThis.DossierFeatures?.has?.('doctorVersion')){alert(globalThis.DossierFeatures?.message?.('doctorVersion')||'Versione per medico disponibile dal piano MEDIUM.');return;}
    if(!DossierSecurity?.canUse?.('exportPdf')){alert('Esportazione non autorizzata per questo account.');return;}
    const profiles=await profilesAllowed();if(!profiles.length){alert('Nessun profilo disponibile.');return;}
    const active=document.querySelector('#profileSelect')?.value||profiles[0].id;
    const el=overlay(`<section style="width:min(720px,100%);max-height:92vh;overflow:auto;background:#fff;border-radius:18px;box-shadow:0 24px 70px rgba(0,0,0,.28);padding:28px;color:#1f2937">
      <div style="display:flex;align-items:center;gap:14px"><img src="assets/icon-128.png" alt="" style="width:58px;height:58px"><div><div style="font-size:12px;font-weight:800;letter-spacing:.08em;color:#0f766e">VERSIONE PER MEDICO</div><h2 style="margin:4px 0 0">Crea dossier in sola lettura</h2></div></div>
      <p style="line-height:1.55">La copia viene scaricata come file ZIP nella cartella Download del browser. Copiala su una chiavetta USB o consegnala al medico: una volta estratta, il medico apre <strong>APRI_DOSSIER.html</strong>, senza installare nulla.</p>
      <div style="display:grid;gap:12px;margin-top:18px">
        <label style="display:flex;gap:10px;align-items:flex-start;padding:14px;border:1px solid #d8e2e0;border-radius:12px"><input type="radio" name="doctorMode" value="single" checked style="margin-top:4px"><span><strong>Profilo singolo</strong><br><small>Esporta soltanto il profilo attualmente selezionato.</small></span></label>
        <label style="display:flex;gap:10px;align-items:flex-start;padding:14px;border:1px solid #d8e2e0;border-radius:12px"><input type="radio" name="doctorMode" value="family" style="margin-top:4px"><span><strong>Famiglia</strong><br><small>Esporta i profili selezionati nello stesso dossier. Il medico cambia persona dal menu in alto a sinistra.</small></span></label>
      </div>
      <div id="doctorFamilyProfiles" style="display:none;margin:16px 0;padding:14px;border-radius:12px;background:#f8faf9"><strong>Profili da includere</strong><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:8px;margin-top:10px">${profiles.map(p=>`<label style="display:flex;gap:8px;align-items:center"><input type="checkbox" data-doctor-profile="${esc(p.id)}" checked> ${esc(`${p.firstName||''} ${p.lastName||''}`.trim()||p.name||'Profilo')}</label>`).join('')}</div></div>
      <label style="display:flex;gap:10px;align-items:flex-start;margin-top:16px"><input id="doctorIncludeOriginals" type="checkbox" checked style="margin-top:4px"><span><strong>Includi i documenti originali</strong><br><small>La copia clinica contiene comunque tutti i dati del Dossier. Se questa opzione e attiva, vengono aggiunti anche gli originali disponibili, ottimizzati soltanto nella copia per ridurre lo spazio occupato.</small></span></label>
      <div style="margin-top:16px;padding:12px;border-radius:10px;background:#fff7ed;border:1px solid #fed7aa;font-size:13px"><strong>Contiene dati sanitari.</strong> Conserva la chiavetta con la stessa attenzione riservata ai documenti medici cartacei.</div>
      <div id="doctorExportProgress" style="display:none;margin-top:16px"><div style="display:flex;justify-content:space-between"><span id="doctorExportPhase">Preparazione</span><strong id="doctorExportPct">0%</strong></div><div style="height:8px;background:#e5e7eb;border-radius:99px;margin-top:7px;overflow:hidden"><span id="doctorExportBar" style="display:block;height:100%;width:0;background:#0f766e"></span></div><small id="doctorExportDetail" style="display:block;margin-top:7px;color:#64748b"></small></div>
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:22px"><button id="doctorCancelBtn" class="btn btn-light">Annulla</button><button id="doctorCreateBtn" class="btn btn-primary">Scegli dove salvare</button></div>
    </section>`);
    el.querySelectorAll('input[name="doctorMode"]').forEach(r=>r.addEventListener('change',()=>{el.querySelector('#doctorFamilyProfiles').style.display=el.querySelector('input[name="doctorMode"]:checked')?.value==='family'?'block':'none';}));
    el.querySelector('#doctorCancelBtn').onclick=close;
    el.querySelector('#doctorCreateBtn').onclick=async()=>{
      const mode=el.querySelector('input[name="doctorMode"]:checked')?.value||'single';
      let ids=mode==='single'?[active]:[...el.querySelectorAll('[data-doctor-profile]:checked')].map(x=>x.dataset.doctorProfile);
      ids=ids.filter(id=>profiles.some(p=>p.id===id));if(!ids.length){alert('Seleziona almeno un profilo.');return;}
      const includeOriginals=el.querySelector('#doctorIncludeOriginals').checked;
      const button=el.querySelector('#doctorCreateBtn');button.disabled=true;el.querySelector('#doctorCancelBtn').disabled=true;el.querySelector('#doctorExportProgress').style.display='block';
      try{
        el.querySelector('#doctorExportPhase').textContent='Scelta destinazione';
        el.querySelector('#doctorExportDetail').textContent='Preparazione del file ZIP da scaricare.';
        const target=await DossierSecurity.request('/api/doctor-export/select-folder',{method:'POST',body:{}});
        if(target.cancelled){button.disabled=false;el.querySelector('#doctorCancelBtn').disabled=false;el.querySelector('#doctorExportProgress').style.display='none';return;}
        const result=await build(ids,{includeOriginals,mode,exportSession:target,progress:(pct,phase,detail)=>{el.querySelector('#doctorExportPct').textContent=`${Math.round(pct)}%`;el.querySelector('#doctorExportBar').style.width=`${Math.max(0,Math.min(100,pct))}%`;el.querySelector('#doctorExportPhase').textContent=phase;el.querySelector('#doctorExportDetail').textContent=detail||'';}});
        close();alert(`Versione per medico creata. Il file ${result} è stato scaricato nella cartella Download del browser: puoi copiarlo su una chiavetta o inviarlo.`);
      }catch(error){console.error(error);alert(`Versione per medico non creata: ${error.message}`);button.disabled=false;el.querySelector('#doctorCancelBtn').disabled=false;}
    };
  }

  const cloneClean=(obj,skip=new Set())=>{if(obj==null||typeof obj!=='object')return obj;if(obj instanceof Date)return obj.toISOString();if(obj instanceof Blob)return undefined;if(Array.isArray(obj))return obj.map(x=>cloneClean(x,skip)).filter(x=>x!==undefined);const out={};for(const [k,v] of Object.entries(obj)){if(skip.has(k)||v instanceof Blob)continue;const c=cloneClean(v,skip);if(c!==undefined)out[k]=c;}return out;};
  async function addBlob(files,path,blob){if(!(blob instanceof Blob)||!blob.size)return'';files.set(path,blob);return path;}

  function graphSourceDocuments(profile,storedDocuments){
    // FIX24: per il profilo aperto usa ESATTAMENTE i documenti clinici gia preparati
    // dal Dossier principale. In questo modo la versione medico non ricostruisce
    // una propria realta clinica diversa da quella mostrata a video.
    try{
      const live=globalThis.DossierDoctorGraphSource?.(profile.id);
      if(Array.isArray(live)&&live.length)return live;
    }catch(error){console.warn('Sorgente grafici attiva non disponibile:',error);}
    // Per i profili familiari non attivi prepara i record con lo stesso canone
    // prima di passare allo stesso HealthCharts usato dal Dossier principale.
    try{
      if(typeof HealthExtractors!=='undefined'&&HealthExtractors.prepareDocuments24){
        const prepared=HealthExtractors.prepareDocuments24(storedDocuments||[],profile||{});
        if(Array.isArray(prepared))return prepared;
      }
    }catch(error){console.warn('Preparazione documenti per grafici medico non riuscita:',error);}
    return storedDocuments||[];
  }

  function clinicalGraphSnapshot(profile,storedDocuments){
    // FIX24: HealthCharts e' dichiarato con const globale lessicale, quindi NON
    // e' globalThis.HealthCharts. Il controllo globalThis della FIX19-23 rendeva
    // sempre vuoto clinicalGraphRows anche quando i grafici nel Dossier esistevano.
    if(typeof HealthCharts==='undefined'||!HealthCharts.collect)return {rows:[],graphs:[],diagnostics:{sourceDocuments:0,rows:0,graphs:0}};
    const source=graphSourceDocuments(profile,storedDocuments);
    const rows=HealthCharts.collect(source);
    const params=HealthCharts.groupParameters?HealthCharts.groupParameters(rows):[];
    const graphs=[];
    for(const param of params){
      for(const unit of param.units||[]){
        const series=rows.filter(r=>r.parameterId===param.id&&r.unitKey===unit.key).sort((a,b)=>String(a.clinicalDate||'').localeCompare(String(b.clinicalDate||'')));
        if(!series.length)continue;
        graphs.push({parameterId:param.id,parameterName:param.name,unitKey:unit.key,unit:unit.label,count:series.length,html:HealthCharts.svg(series,{unit:unit.label})});
      }
    }
    return {rows,graphs,diagnostics:{sourceDocuments:source.length,rows:rows.length,graphs:graphs.length,seriesWithAtLeastTwo:graphs.filter(g=>g.count>=2).length}};
  }


  async function datasetForProfile(files,profile,options){
    const id=profile.id;
    const base=`profili/${safeName(`${profile.firstName||''}_${profile.lastName||''}_${id.slice(-6)}`)}`;
    const stores=['documents','doctors','therapies','diagnoses','exemptions','measurements','weightJourneys','calendarEvents'];
    const rows={};
    for(const store of stores)rows[store]=await DossierDB.byProfile(store,id);

    const p=cloneClean(profile,new Set(['avatarBlob','healthCardFrontBlob','healthCardBackBlob']));
    p.avatarPath=(await addBlob(files,`${base}/immagini/avatar_${safeName(profile.avatarName||'profilo.jpg')}`,profile.avatarBlob))||profile.avatarDataUrl||'';
    p.healthCardFrontPath=(await addBlob(files,`${base}/immagini/tessera_fronte_${safeName(profile.healthCardFrontName||'fronte.jpg')}`,profile.healthCardFrontBlob))||profile.healthCardFrontDataUrl||profile.healthCardFront||'';
    p.healthCardBackPath=(await addBlob(files,`${base}/immagini/tessera_retro_${safeName(profile.healthCardBackName||'retro.jpg')}`,profile.healthCardBackBlob))||profile.healthCardBackDataUrl||profile.healthCardBack||'';

    // FIX28: la copia medico non usa piu' il filtro del PDF. Conserva l'intero
    // archivio clinico del profilo. I documenti non visibili nella pagina Archivio
    // restano disponibili come sorgenti di terapie, diagnosi, esenzioni e grafici.
    const docs=[];
    const allDocuments=[...rows.documents].sort((a,b)=>String(b.clinicalDate||b.issueDate||b.addedAt||'').localeCompare(String(a.clinicalDate||a.issueDate||a.addedAt||'')));
    for(let i=0;i<allDocuments.length;i++){
      const d=allDocuments[i];
      const clean=cloneClean(d,new Set(['fileBlob','ocrPageData','_syncMeta']));
      clean.archiveVisible=d.timelineVisible!==false;
      if(options.includeOriginals&&d.fileBlob instanceof Blob&&d.fileBlob.size){
        const ext=(String(d.originalName||'').split('.').pop()||'bin').replace(/[^a-z0-9]/gi,'').slice(0,8)||'bin';
        const file=`${String(i+1).padStart(3,'0')}_${safeName(d.title||d.originalName||'documento')}_${safeName(d.id.slice(-6))}.${ext}`;
        clean.originalPath=`${base}/documenti/${file}`;
        await addBlob(files,clean.originalPath,d.fileBlob);
      }
      docs.push(clean);
      if(i%10===9)await yieldUi();
    }

    const graphSnapshot=clinicalGraphSnapshot(profile,rows.documents);
    return {
      profile:p,
      documents:docs,
      doctors:cloneClean(rows.doctors),
      therapies:cloneClean(rows.therapies),
      diagnoses:cloneClean(rows.diagnoses),
      exemptions:cloneClean(rows.exemptions),
      measurements:cloneClean(rows.measurements),
      weightJourneys:cloneClean(rows.weightJourneys),
      calendarEvents:cloneClean(rows.calendarEvents),
      clinicalGraphRows:cloneClean(graphSnapshot.rows),
      clinicalGraphs:cloneClean(graphSnapshot.graphs),
      clinicalGraphDiagnostics:cloneClean(graphSnapshot.diagnostics)
    };
  }

  function viewerHtml(data){
    const json=JSON.stringify(data).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
    return `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Dossier sanitario - versione per medico</title>
<link rel="stylesheet" href="risorse/app.css">
<style>
:root{--doctor-sidebar:#0b4f4a}
html,body{min-height:100%}
.sidebar{background:var(--doctor-sidebar)}
.brand-mark img{width:100%;height:100%;object-fit:contain;border-radius:12px}
.profile-switcher .doctor-profile-line{display:flex;align-items:center;gap:10px;margin-bottom:10px}
.sidebar{overflow-y:auto;scrollbar-gutter:stable;overscroll-behavior:contain}
.doctor-mini-avatar{width:38px;height:38px;border-radius:12px;object-fit:cover;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.22)}
.doctor-mini-avatar.fallback{display:grid;place-items:center;color:#fff;font-weight:800}
.doctor-readonly{margin-top:16px;padding:11px 12px;border-radius:12px;background:rgba(255,255,255,.10);color:#e6f4f2;font-size:12px;line-height:1.45}
.doctor-readonly strong{display:block;color:#fff;margin-bottom:3px}
.readonly-note{padding:10px 12px;border-radius:11px;background:var(--primary-soft);color:var(--primary-dark);font-size:12px}
.doctor-avatar{width:72px;height:72px;border-radius:22px;object-fit:cover;background:var(--primary-soft)}
.doctor-avatar.fallback{display:grid;place-items:center;color:var(--primary);font-weight:800;font-size:24px}
.doctor-source-note{margin:0 0 12px;padding:10px 12px;border-radius:10px;background:var(--primary-soft);color:var(--primary-dark);display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
.doc-viewer-card{border:1px solid var(--line);border-radius:14px;background:#fff;margin:10px 0}
.doc-viewer-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;padding:14px}
.doc-viewer-body{display:none;padding:0 14px 14px;border-top:1px solid var(--line)}
.doc-viewer-card.open .doc-viewer-body{display:block}
.doc-viewer-card.source-focus,.graph-card.source-focus{outline:3px solid var(--primary);outline-offset:3px}
.doc-search{margin:12px 0 16px}
.graph-card{border:1px solid var(--line);border-radius:14px;background:#fff;margin:10px 0}
.graph-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px 14px}
.graph-head h3{margin:0}
.graph-body{display:none;padding:0 14px 14px;border-top:1px solid var(--line)}
.graph-card.open .graph-body{display:block}
.graph-card[hidden]{display:none!important}
.graph-search{display:flex;gap:10px;align-items:center;margin:12px 0 16px}
.graph-search .form-control{flex:1}
.graph-groups{display:grid;gap:14px}
.graph-inline-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}
.graph-inline-row .graph-card{margin:0}
.nav-screen{display:none}
.nav-screen.active{display:block}
.nav{grid-template-columns:1fr}
.nav-item,.nav-subback{display:block;width:100%;box-sizing:border-box}
.nav-section-label{padding:8px 12px 4px;color:rgba(255,255,255,.68);font-size:11px;letter-spacing:.08em;text-transform:uppercase}
.nav-subback{display:flex;align-items:center;gap:8px;width:100%;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.08);color:#fff;border-radius:12px;padding:10px 12px;margin:0 0 10px;text-align:left;font-weight:700;cursor:pointer}
.chart-point{cursor:pointer}
.chart-grid{stroke:#d8e6e4;stroke-width:1}
.chart-tick{fill:#5c6f6d;font-family:Inter,"Segoe UI",Arial,sans-serif;font-size:11px;font-weight:500;font-variant-numeric:tabular-nums}
.chart-tick-x{font-family:Inter,"Segoe UI",Arial,sans-serif;font-size:11px;font-weight:500}
.chart-ref-line{stroke:#c45a5a;stroke-width:1.5;stroke-dasharray:6 4}
.chart-ref-label{fill:#8c3030;font-size:11px;font-weight:700}
.exemption-detail{display:none;padding-top:12px}
.exemption-item.open .exemption-detail{display:block}
.exemption-card-readonly{border:1px solid var(--line);border-radius:14px;padding:15px;background:#fff;margin:10px 0}
.exemption-card-readonly header{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
.exemption-card-readonly h3{margin:4px 0 0}
.exemption-meta-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:12px 0}
.exemption-meta-grid small{display:block;color:var(--muted)}
.exemption-code{display:inline-flex;padding:4px 8px;border-radius:999px;background:var(--primary-soft);color:var(--primary-dark);font-weight:800;font-size:12px}
.diagnosis-history{margin-top:8px}
.diagnosis-history summary{cursor:pointer;font-weight:750;color:var(--primary-dark)}
.preserve-lines{white-space:pre-line}
.pre{white-space:pre-wrap;line-height:1.5;background:#f8fbfb;border:1px solid var(--line);border-radius:11px;padding:12px;max-height:430px;overflow:auto}
.module-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px}
.module-card{border:1px solid var(--line);border-radius:15px;background:#fff;padding:16px}
.module-card h3{margin:10px 0 6px}
.monitor-kpi-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
.monitor-kpi{border:1px solid var(--line);border-radius:15px;background:#fff;padding:15px}
.monitor-kpi small{display:block;color:var(--muted)}
.monitor-kpi strong{display:block;font-size:22px;margin:7px 0}
.weight-summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin:14px 0}
.weight-summary .card{padding:15px}
.weight-summary .kpi-value{font-size:21px;margin-top:8px}
.calorie-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
.calorie-grid .kpi{min-height:auto}
.calorie-info{margin-top:12px}
.calorie-info summary{cursor:pointer;font-weight:750;color:var(--primary-dark)}
.bmi-calculator{margin-top:18px}
.bmi-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;align-items:end}
.timeline-preview{max-width:900px}
.health-card-grid-readonly{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}
.health-card-grid-readonly figure{margin:0;border:1px solid var(--line);border-radius:16px;padding:12px;background:#f8fbfa}
.health-card-grid-readonly img{display:block;width:100%;max-height:420px;object-fit:contain;border-radius:10px;background:#fff}
.health-card-grid-readonly figcaption{text-align:center;margin-top:8px;font-weight:750;color:var(--primary-dark)}
.profile-details-head{display:flex;gap:18px;align-items:center;margin-bottom:16px}
.search-count{font-size:12px;color:var(--muted);white-space:nowrap}
.original-link{text-decoration:none}
.print-only{display:none}
#printRoot{display:none}
@media(max-width:1080px){.monitor-kpi-grid,.calorie-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:820px){.monitor-kpi-grid,.calorie-grid,.bmi-grid,.health-card-grid-readonly,.exemption-meta-grid{grid-template-columns:1fr}}
@media print{
 body>*:not(#printRoot){display:none!important}
 #printRoot{display:block!important;color:#111;background:#fff;font-family:Arial,sans-serif}
 #printRoot .graph-body,#printRoot .doc-viewer-body,#printRoot .exemption-detail{display:block!important}
 #printRoot .btn,#printRoot select,#printRoot input{display:none!important}
 #printRoot .card,#printRoot .graph-card,#printRoot .doc-viewer-card{box-shadow:none;break-inside:avoid}
 #printRoot .health-chart{min-width:0!important}
 @page{size:A4;margin:12mm}
}
</style>
</head>
<body>
<div class="app-shell">
  <aside class="sidebar">
    <div class="brand">
      <div class="brand-mark"><img src="risorse/icon-128.png" alt=""></div>
      <div><strong>Dossier Sanitario</strong><span>Versione per medico</span></div>
    </div>
    <div class="profile-switcher">
      <label>Profilo</label>
      <div class="doctor-profile-line"><div id="miniAvatar" class="doctor-mini-avatar fallback">+</div><select id="profileSelect"></select></div>
    </div>
    <div id="navRoot"><nav class="nav nav-screen active" id="navMain"></nav><nav class="nav nav-screen" id="navMonitor"></nav></div>
    <div class="doctor-readonly"><strong>Sola lettura</strong>Questa copia mostra la fotografia clinica del Dossier al momento dell’esportazione. Nessun dato può essere modificato.</div>
    <div class="sidebar-footer"><span class="status-dot"></span><span id="generatedSide"></span></div>
  </aside>
  <main class="main">
    <header class="topbar">
      <button id="menuBtn" class="icon-btn menu-btn" type="button">☰</button>
      <div><h1 id="title">Panoramica</h1><p id="subtitle">Dossier sanitario in sola lettura.</p></div>
      <div class="top-actions"><button id="printBtn" class="btn btn-primary" type="button">Esporta PDF</button></div>
    </header>
    <section id="viewContainer" class="view-container"></section>
  </main>
</div>
<div id="printRoot"></div>
<script>
'use strict';
const DATA=${json};
let current=0;
let view='dashboard';
let graphReturnState=null;
let exemptionMode='';
let therapySort='';
let diagnosisSort='';

const VIEWS=[
 ['dashboard','Panoramica','La situazione essenziale del profilo selezionato.'],
 ['timeline','Cronologia sanitaria','Eventi ordinati per data clinica.'],
 ['documents','Documenti','Referti, immagini e PDF associati alla persona.'],
 ['graphs','Grafici','Andamento storico dei valori estratti dai referti.'],
 ['profile','Dati personali','Anagrafica, tessera sanitaria e contatti principali.'],
 ['health-card','Tessera sanitaria','Fronte e retro conservati nel Dossier.'],
 ['doctors','Medici e specialisti','Contatti dei professionisti che seguono la persona.'],
 ['therapies','Terapie','Farmaci attivi, dosaggi, orari e note.'],
 ['exemptions','Esenzioni','Codici, validità e documenti di esenzione.'],
 ['diagnoses','Diagnosi e problemi principali','Quadro attuale e cronologia delle condizioni cliniche.'],
 ['calendar','Agenda e scadenze','Visite, richiami, rinnovi e promemoria.'],
 ['monitor-home','Monitoraggio personale','Misurazioni, parametri domestici e percorso del profilo.'],
 ['monitor-weight','Percorso peso','Peso, obiettivo, differenze e stime orientative.'],
 ['monitor-body','Misurazioni corporee','Altezza e circonferenze nel tempo.'],
 ['monitor-pressure','Pressione arteriosa','Sistolica, diastolica e frequenza cardiaca.'],
 ['monitor-spo2','Saturazione ossigeno','Storico delle misurazioni SpO₂.'],
 ['monitor-glucose','Glicemia domestica','Misurazioni capillari distinte dagli esami di laboratorio.'],
 ['monitor-heart','Frequenza cardiaca','Archivio delle rilevazioni domestiche.'],
 ['monitor-graphs','Grafici monitoraggio','Andamento dei parametri registrati manualmente.']
];
const NAV_SECTIONS=[
 ['Area medica',['dashboard','timeline','documents','graphs','profile','health-card','doctors','therapies','exemptions','diagnoses','calendar']],
 ['Misurazioni',['monitor-home','monitor-weight','monitor-body','monitor-pressure','monitor-spo2','monitor-glucose','monitor-heart','monitor-graphs']]
];

const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const N=v=>Number.isFinite(Number(v))?Number(v):null;
const F=n=>{
 const x=N(n);if(x===null)return'';
 return new Intl.NumberFormat('it-IT',{maximumFractionDigits:3}).format(x);
};
const FD=v=>{
 if(!v)return'';
 const d=new Date(String(v).length<=10?String(v)+'T12:00:00':v);
 return Number.isNaN(d.getTime())?String(v):new Intl.DateTimeFormat('it-IT',{dateStyle:'short'}).format(d);
};
const FDT=v=>{
 if(!v)return'';
 const d=new Date(v);
 return Number.isNaN(d.getTime())?String(v):new Intl.DateTimeFormat('it-IT',{dateStyle:'short',timeStyle:'short'}).format(d);
};
const P=()=>DATA.profiles[current]||{};
const D=()=>DATA.datasets[P().id]||{documents:[],doctors:[],therapies:[],diagnoses:[],exemptions:[],measurements:[],weightJourneys:[],calendarEvents:[],clinicalGraphs:[],clinicalGraphRows:[]};
const prefs=()=>Object.assign({profileColor:'#0f766e',therapySort:'time-asc',diagnosisSort:'date-desc',exemptionView:'compact'},P().preferences||{});
const pname=()=>((P().firstName||'')+' '+(P().lastName||'')).trim()||P().name||'Profilo';

function initials(p=P()){
 const a=String(p.firstName||p.name||'').trim().charAt(0);
 const b=String(p.lastName||'').trim().charAt(0);
 return (a+b||'+').toUpperCase();
}
function hexToRgb(hex){
 const x=String(hex||'').trim().replace('#','');
 if(!/^[0-9a-f]{6}$/i.test(x))return[15,118,110];
 return[parseInt(x.slice(0,2),16),parseInt(x.slice(2,4),16),parseInt(x.slice(4,6),16)];
}
function mix(hex,target,t){
 const a=hexToRgb(hex),b=hexToRgb(target);
 const c=a.map((v,i)=>Math.round(v+(b[i]-v)*t));
 return'#'+c.map(v=>v.toString(16).padStart(2,'0')).join('');
}
function applyProfileTheme(){
 const color=prefs().profileColor||'#0f766e';
 const root=document.documentElement;
 root.style.setProperty('--primary',color);
 root.style.setProperty('--primary-dark',mix(color,'#000000',.25));
 root.style.setProperty('--primary-soft',mix(color,'#ffffff',.86));
 root.style.setProperty('--doctor-sidebar',mix(color,'#000000',.42));
 const mini=document.querySelector('#miniAvatar');
 if(mini){
   if(P().avatarPath){mini.className='doctor-mini-avatar';mini.innerHTML='<img src="'+encodeURI(P().avatarPath)+'" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit">';}
   else{mini.className='doctor-mini-avatar fallback';mini.textContent=initials();}
 }
}
function table(headers,rows){
 if(!rows.length)return'<div class="notice">Nessun dato registrato.</div>';
 return'<div class="table-wrap"><table><thead><tr>'+headers.map(h=>'<th>'+E(h)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map(c=>'<td>'+c+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
}
function documentById(id){return(D().documents||[]).find(x=>String(x.id||'')===String(id||''));}
function visibleDocuments(){return(D().documents||[]).filter(x=>x.archiveVisible!==false);}
function docClinicalText(x){
 const sections=[];
 if(x.reconstructedText)sections.push(x.reconstructedText);
 else if(x.structuredText)sections.push(x.structuredText);
 else if(x.extractedText)sections.push(x.extractedText);
 return sections.filter(Boolean).join('\\n\\n');
}
function labTable(x){
 const vals=(x.labValues||[]).filter(v=>v&&String(v.name||v.parameterName||'').trim());
 if(!vals.length)return'';
 return'<div class="section-spacer"></div><h3>Valori di laboratorio</h3>'+table(['Parametro','Valore','Riferimento'],vals.map(v=>[
   '<strong>'+E(v.name||v.parameterName||'')+'</strong>',
   E(String(v.value??'')+(v.unit?' '+v.unit:'')),
   E(v.reference||v.range?.raw||'')
 ]));
}
function docBody(x){
 const parts=[];
 if(x.doctor||x.facility||x.specialization||x.department){
  parts.push('<dl class="meta-list">'+
   (x.facility?'<dt>Struttura</dt><dd>'+E(x.facility)+'</dd>':'')+
   (x.department?'<dt>Reparto / UO</dt><dd>'+E(x.department)+'</dd>':'')+
   (x.specialization?'<dt>Specializzazione</dt><dd>'+E(x.specialization)+'</dd>':'')+
   (x.doctor?'<dt>Medico</dt><dd>'+E(x.doctor)+'</dd>':'')+
   '</dl>');
 }
 parts.push(labTable(x));
 const text=docClinicalText(x);
 if(text)parts.push('<div class="section-spacer"></div><h3>Contenuto clinico</h3><div class="pre">'+E(text)+'</div>');
 if(!parts.join('').trim())parts.push('<div class="notice">Nessun contenuto strutturato disponibile. Usa Vedi originale quando presente.</div>');
 return parts.join('');
}
function openDocument(id,origin){
 const doc=documentById(id);
 if(!doc){alert('Il documento sorgente non è disponibile in questa copia.');return;}
 if(origin&&origin.closest&&origin.closest('[data-graph-card]')){
   const card=origin.closest('[data-graph-card]');
   graphReturnState={profileIndex:current,key:String(card.dataset.graphKey||''),search:String(document.querySelector('#graphSearch')?.value||''),scrollY:window.scrollY||0};
 }
 view='documents';render();
 const card=[...document.querySelectorAll('[data-document-id]')].find(x=>String(x.dataset.documentId||'')===String(id));
 if(!card)return;
 card.classList.add('open','source-focus');
 const btn=card.querySelector('[data-doc-toggle]');if(btn)btn.textContent='Chiudi';
 const body=card.querySelector('.doc-viewer-body');
 if(body&&graphReturnState){
   const note=document.createElement('div');note.className='doctor-source-note';
   const sourcePage=origin?.dataset?.sourcePage||'';note.innerHTML='<span>Documento sorgente del valore selezionato nel grafico'+(sourcePage?' · pagina '+E(sourcePage):'')+'.</span><button type="button" class="btn btn-light btn-small" data-return-graph>← Torna al grafico</button>';
   body.prepend(note);
 }
 card.scrollIntoView({behavior:'smooth',block:'center'});
 setTimeout(()=>card.classList.remove('source-focus'),2200);
}
function returnToGraph(){
 const state=graphReturnState;
 if(!state||Number(state.profileIndex)!==Number(current)){view='graphs';render();return;}
 view='graphs';render();
 const input=document.querySelector('#graphSearch');
 if(input){input.value=state.search||'';input.dispatchEvent(new Event('input',{bubbles:true}));}
 const card=[...document.querySelectorAll('[data-graph-card]')].find(x=>String(x.dataset.graphKey||'')===String(state.key||''));
 if(card){
  card.hidden=false;card.classList.add('open','source-focus');
  const b=card.querySelector('[data-graph-toggle]');if(b)b.textContent='Chiudi';
  requestAnimationFrame(()=>card.scrollIntoView({behavior:'smooth',block:'center'}));
  setTimeout(()=>card.classList.remove('source-focus'),2200);
 }else if(Number.isFinite(Number(state.scrollY)))requestAnimationFrame(()=>window.scrollTo({top:Number(state.scrollY),behavior:'smooth'}));
}
function profileAvatar(cls='doctor-avatar'){
 if(P().avatarPath)return'<img class="'+cls+'" src="'+encodeURI(P().avatarPath)+'" alt="">';
 return'<div class="'+cls+' fallback">'+E(initials())+'</div>';
}
function docListItem(x){
 return'<div class="list-item"><div><h3>'+E(x.title||x.originalName||'Documento')+'</h3><p>'+E(FD(x.clinicalDate||x.issueDate||x.addedAt))+' · '+E(x.documentKind||x.category||'Documento sanitario')+(x.specialization?' · '+E(x.specialization):'')+'</p></div><button class="btn btn-light btn-small" data-open-doc="'+E(x.id||'')+'">Apri</button></div>';
}
function dashboard(){
 const docs=[...visibleDocuments()].sort((a,b)=>String(b.clinicalDate||'').localeCompare(String(a.clinicalDate||'')));
 const last=docs[0];
 const activeTherapies=(D().therapies||[]).filter(x=>x.active!==false);
 const future=(D().calendarEvents||[]).filter(x=>String(x.startDate||x.date||'')>=new Date().toISOString().slice(0,10)&&x.status!=='completed').sort((a,b)=>String(a.startDate||a.date||'').localeCompare(String(b.startDate||b.date||''))).slice(0,4);
 return'<div class="card profile-hero">'+profileAvatar()+'<div><h2>'+E(pname())+'</h2><p>'+E(P().relation||'Profilo personale')+(P().birthDate?' · Nato/a il '+E(FD(P().birthDate)):'')+'</p></div><span class="badge success">Sola lettura</span></div>'+
 '<div class="section-spacer"></div><div class="grid grid-4">'+
 '<div class="card kpi"><div class="kpi-label">Documenti archiviati</div><div class="kpi-value">'+D().documents.length+'</div><div class="kpi-note">PDF, immagini e scansioni</div></div>'+
 '<div class="card kpi"><div class="kpi-label">Ultimo evento clinico</div><div class="kpi-value" style="font-size:20px">'+(last?E(FD(last.clinicalDate||last.issueDate)):'Nessuno')+'</div><div class="kpi-note">'+(last?E(last.title||''):'Nessun documento')+'</div></div>'+
 '<div class="card kpi"><div class="kpi-label">Terapie attive</div><div class="kpi-value">'+activeTherapies.length+'</div><div class="kpi-note">Farmaci e indicazioni registrate</div></div>'+
 '<div class="card kpi"><div class="kpi-label">Prossime scadenze</div><div class="kpi-value">'+future.length+'</div><div class="kpi-note">Agenda sanitaria</div></div>'+
 '</div><div class="section-spacer"></div><div class="grid grid-2">'+
 '<div class="card"><h3>Riepilogo sanitario</h3><dl class="meta-list">'+
 '<dt>Tessera sanitaria</dt><dd>'+E(P().healthCard||'Non inserita')+'</dd>'+
 '<dt>Medico di base</dt><dd>'+E(P().primaryDoctor||'Non inserito')+'</dd>'+
 '<dt>Contatto medico</dt><dd>'+E([P().primaryDoctorPhone,P().primaryDoctorEmail].filter(Boolean).join(' · ')||'Non inserito')+'</dd>'+
 '<dt>Contatto di emergenza</dt><dd>'+E(P().emergencyContact||'Non inserito')+'</dd>'+
 '<dt>Gruppo sanguigno</dt><dd>'+E(P().bloodGroup||'Non inserito')+'</dd>'+
 '</dl></div>'+
 '<div class="card"><div class="card-title-row"><h3>Documenti recenti</h3><button class="btn btn-ghost btn-small" data-go-view="documents">Vedi tutti</button></div>'+(docs.length?'<div class="list-stack">'+docs.slice(0,4).map(docListItem).join('')+'</div>':'<p class="kpi-note">Nessun documento presente.</p>')+'</div></div>'+
 (future.length?'<div class="section-spacer"></div><div class="card"><h3>Prossime scadenze</h3><div class="list-stack">'+future.map(x=>'<div class="list-item"><span><strong>'+E(FD(x.startDate||x.date))+(x.startTime||x.time?' · '+E(x.startTime||x.time):'')+'</strong><br>'+E(x.title||'')+'</span><span class="badge">'+E(x.category||x.type||'Altro')+'</span></div>').join('')+'</div></div>':'');
}
function timeline(){
 const docs=[...visibleDocuments()].sort((a,b)=>String(a.clinicalDate||'9999-12-31').localeCompare(String(b.clinicalDate||'9999-12-31')));
 if(!docs.length)return'<div class="card"><div class="notice">Nessun documento nella cronologia.</div></div>';
 return'<div class="card"><div class="card-title-row"><div><h2>Cronologia completa</h2><p class="kpi-note">Ogni referto è collocato usando la data clinica.</p></div></div><div class="timeline">'+docs.map(d=>{
  const txt=String(d.reconstructedText||d.structuredText||'').replace(/\\s+/g,' ').trim();
  return'<article class="timeline-item"><div class="timeline-date">'+E(FD(d.clinicalDate||d.issueDate||d.addedAt))+'</div><h3>'+E(d.title||d.originalName||'Documento')+'</h3><span class="badge">'+E(d.documentKind||d.category||'Documento sanitario')+'</span><p>'+E(d.facility||'')+((d.specialization||d.department)?' · '+E(d.specialization||d.department):'')+'</p>'+(txt?'<p class="timeline-preview">'+E(txt.slice(0,280))+(txt.length>280?'…':'')+'</p>':'')+'<div class="row-actions" style="margin-top:10px"><button class="btn btn-light btn-small" data-open-doc="'+E(d.id||'')+'">Apri</button></div></article>';
 }).join('')+'</div></div>';
}
function documents(){
 const rows=D().documents||[];
 if(!rows.length)return'<div class="card"><div class="notice">Nessun documento archiviato.</div></div>';
 return'<div class="card"><div class="card-title-row"><div><h2>Archivio documenti</h2><p class="kpi-note">Stesso archivio clinico del Dossier principale, in sola lettura.</p></div><span class="badge">'+rows.length+' documenti</span></div>'+
 '<div class="search-row doc-search"><input id="documentSearch" class="form-control" type="search" placeholder="Cerca visita, esame, specialità o parola nel documento"><span id="documentSearchCount" class="search-count">'+rows.length+' documenti</span></div>'+
 '<div id="documentList">'+rows.map((x,i)=>'<article class="doc-viewer-card" data-document-id="'+E(x.id||'')+'" data-doc-card data-search="'+E([x.title,x.originalName,x.documentKind,x.category,x.specialization,x.facility].join(' ').toLocaleLowerCase('it'))+'"><div class="doc-viewer-head"><div><h3 style="margin:0 0 5px">'+E(x.title||x.originalName||'Documento')+'</h3><p class="kpi-note" style="margin:0">'+E(FD(x.clinicalDate||x.issueDate||x.addedAt))+' · '+E(x.documentKind||x.category||'Documento sanitario')+(x.specialization?' · '+E(x.specialization):'')+'</p></div><div class="row-actions"><button class="btn btn-light btn-small" data-doc-toggle="'+i+'">Apri</button>'+(x.originalPath?'<a class="btn btn-light btn-small original-link" target="_blank" href="'+encodeURI(x.originalPath)+'">Vedi originale</a>':'')+'</div></div><div class="doc-viewer-body">'+docBody(x)+'</div></article>').join('')+'</div><div id="documentSearchEmpty" class="notice" hidden>Nessun documento corrisponde alla ricerca.</div></div>';
}
function graphOrderDescriptor(g={}){
 const id=String(g.parameterId||'').toLowerCase();
 const name=String(g.parameterName||'').toLocaleLowerCase('it-IT').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
 const compact=name.replace(/\s+/g,'');
 if(id==='ft3'||compact==='ft3'||compact==='freet3'||compact==='triiodotironinalibera'||compact==='triiodotironinafree')return{sortKey:'ft3_panel',group:0};
 if(id==='ft4'||compact==='ft4'||compact==='freet4'||compact==='tiroxinalibera'||compact==='tiroxinafree')return{sortKey:'ft3_panel',group:1};
 if(id==='tsh'||compact==='tsh'||compact==='tireotropina'||compact==='ormonetireostimolante')return{sortKey:'ft3_panel',group:2};
 return{sortKey:String(g.parameterName||'').toLocaleLowerCase('it-IT'),group:0};
}
function normalizeGraphTitle(g={}){
 return (String(g.parameterName||'').trim()+' · '+String(g.unit||'').trim()).trim().toLocaleLowerCase('it-IT');
}
function mergeClinicalGraphs(items=[]){
 const merged=new Map();
 for(const raw of items||[]){
  if(!raw||!raw.html)continue;
  const item={...raw};
  const key=normalizeGraphTitle(item);
  const order=graphOrderDescriptor(item);
  if(!merged.has(key)){
   merged.set(key,{...item,_order:order});
   continue;
  }
  const prev=merged.get(key);
  if((Number(item.count)||0)>(Number(prev.count)||0))merged.set(key,{...item,_order:order});
 }
 return [...merged.values()].sort((a,b)=>{
  const oa=a._order||graphOrderDescriptor(a), ob=b._order||graphOrderDescriptor(b);
  if(oa.sortKey!==ob.sortKey)return oa.sortKey.localeCompare(ob.sortKey,'it');
  if(oa.group!==ob.group)return oa.group-ob.group;
  return String(a.parameterName||'').localeCompare(String(b.parameterName||''),'it')||String(a.unit||'').localeCompare(String(b.unit||''),'it');
 });
}

function graphCard(g,i){

 const key=(g.parameterId||g.parameterName||'')+'|'+(g.unitKey||g.unit||'');
 return'<article class="graph-card" data-graph-card data-graph-key="'+E(key)+'" data-search="'+E((String(g.parameterName||'')+' '+String(g.unit||'')).toLocaleLowerCase('it'))+'"><div class="graph-head"><div><h3>'+E(g.parameterName||'Parametro')+' · '+E(g.unit||'')+'</h3><p class="kpi-note" style="margin:4px 0 0">'+E(g.count||0)+' rilevazioni</p></div><button class="btn btn-light btn-small" data-graph-toggle="'+i+'">Apri</button></div><div class="graph-body"><div class="chart-shell">'+String(g.html||'')+'</div></div></article>';
}
function graphs(){
 const items=mergeClinicalGraphs((D().clinicalGraphs||[]).filter(x=>x&&x.html).slice());
 return'<div class="card"><div class="card-title-row"><div><h2>Grafici dei valori clinici</h2><p class="kpi-note">Usano le stesse serie validate e lo stesso renderer HealthCharts del Dossier principale. I grafici sono richiusi soltanto per rendere più rapida la consultazione da chiavetta.</p></div><span class="badge success">'+(D().clinicalGraphRows||[]).length+' rilevazioni valide</span></div>'+
 '<div class="graph-search"><input id="graphSearch" class="form-control" type="search" placeholder="Cerca parametro, per esempio TSH, emoglobina, glicemia"><span id="graphSearchCount" class="search-count">'+items.length+' grafici</span></div>'+
 '<div id="graphList">'+(items.length?items.map(graphCard).join(''):'<div class="notice warning">Nessuna serie clinica valida.</div>')+'</div><div id="graphSearchEmpty" class="notice" hidden>Nessun grafico corrisponde alla ricerca.</div></div>';
}
function profile(){
 const p=P();
 const fields=[
 ['Nome e cognome',pname()],['Relazione con il gestore',p.relation],['Data di nascita',FD(p.birthDate)],['Codice fiscale',p.taxCode],
 ['Tessera sanitaria',p.healthCard],['Scadenza tessera',FD(p.healthCardExpiry)],['Email',p.email],['Telefono',p.phone],['Indirizzo',p.address],
 ['Medico di base',p.primaryDoctor],['Telefono medico',p.primaryDoctorPhone],['Email medico',p.primaryDoctorEmail],['Contatto di emergenza',p.emergencyContact],
 ['Gruppo sanguigno',p.bloodGroup],['Note',p.notes]
 ].filter(x=>x[1]);
 return'<div class="card"><div class="profile-details-head">'+profileAvatar()+'<div><h2 style="margin:0">Dati del profilo</h2><p class="kpi-note">Fotografia dei dati personali presenti nel Dossier.</p></div></div><dl class="meta-list">'+fields.map(x=>'<dt>'+E(x[0])+'</dt><dd>'+E(x[1])+'</dd>').join('')+'</dl></div>';
}
function healthCard(){
 const p=P();
 let h='<div class="card"><div class="card-title-row"><div><h2>Tessera sanitaria</h2><p class="kpi-note">Immagini presenti nel Dossier al momento dell’esportazione.</p></div></div>';
 const sides=[];
 if(p.healthCardFrontPath)sides.push('<figure><img src="'+encodeURI(p.healthCardFrontPath)+'" alt="Fronte tessera sanitaria"><figcaption>Fronte</figcaption></figure>');
 if(p.healthCardBackPath)sides.push('<figure><img src="'+encodeURI(p.healthCardBackPath)+'" alt="Retro tessera sanitaria"><figcaption>Retro</figcaption></figure>');
 h+=sides.length?'<div class="health-card-grid-readonly">'+sides.join('')+'</div>':'<div class="notice">Nessuna immagine della tessera sanitaria caricata.</div>';
 return h+'</div>';
}
function doctors(){
 const rows=D().doctors||[];
 return'<div class="card"><div class="card-title-row"><div><h2>Medici e specialisti</h2><p class="kpi-note">Contatti e note presenti nel Dossier.</p></div></div>'+(rows.length?'<div class="list-stack">'+rows.map(d=>'<div class="list-item"><div><h3>'+E((d.role||d.specialization||'Specialista')+' · '+(d.name||d.doctorName||''))+'</h3><p>'+E(d.facility||'')+(d.email?' · '+E(d.email):'')+(d.phone?' · '+E(d.phone):'')+'</p>'+(d.notes?'<p class="preserve-lines">'+E(d.notes)+'</p>':'')+'</div></div>').join('')+'</div>':'<div class="notice">Nessun medico registrato.</div>')+'</div>';
}
function normTime(raw){
 const text=String(raw||'').trim().toLowerCase();
 let m=text.match(/\\b([01]?\\d|2[0-3])\\s*[:.]\\s*([0-5]\\d)\\b/)||text.match(/\\b([01]?\\d|2[0-3])\\b/);
 if(!m)return Number.POSITIVE_INFINITY;
 return Number(m[1])*60+Number(m[2]||0);
}
function formatTherapyTime(raw){
 const original=String(raw||'').trim();if(!original)return'';
 const lowered=original.toLocaleLowerCase('it-IT').replace(/\\s+/g,' ').trim();
 if(/^(?:al risveglio|prima di colazione|dopo colazione|prima di pranzo|dopo pranzo|prima di cena|dopo cena|prima di coricarsi|al bisogno|durante i pasti)$/i.test(lowered))return lowered.replace(/^./,c=>c.toUpperCase());
 const m=lowered.match(/^([01]?\\d|2[0-3])\\s*[:.]\\s*([0-5]\\d)$/);if(!m)return original;
 return String(Number(m[1])).padStart(2,'0')+':'+m[2];
}
function compareTherapy(a,b,mode){
 const ta=normTime(a.time||a.schedule),tb=normTime(b.time||b.schedule);
 const med=String(a.medication||a.name||'').localeCompare(String(b.medication||b.name||''),'it',{sensitivity:'base'});
 if(mode==='time-desc')return(tb-ta)||med;
 if(mode==='med-asc')return med||(ta-tb);
 if(mode==='med-desc')return -med||(ta-tb);
 if(mode==='insert')return String(a.createdAt||a.updatedAt||'').localeCompare(String(b.createdAt||b.updatedAt||''));
 return(ta-tb)||med;
}
const THERAPY_DAY_KEYS=['mon','tue','wed','thu','fri','sat','sun'];
const THERAPY_DAY_LABELS={mon:'Lun',tue:'Mar',wed:'Mer',thu:'Gio',fri:'Ven',sat:'Sab',sun:'Dom'};
function therapyScheduleText(t={}){
 const raw=Array.isArray(t.therapyDays)?t.therapyDays.map(String):[];
 const days=THERAPY_DAY_KEYS.filter(k=>raw.includes(k));
 const normalized=days.length?days:THERAPY_DAY_KEYS;
 const dayText=normalized.length===7?'':'Giorni: '+normalized.map(k=>THERAPY_DAY_LABELS[k]).join(', ');
 const detail=String(t.frequency||t.notes||'').trim();
 return[dayText,detail].filter(Boolean).join(' · ');
}
function therapies(){
 const mode=therapySort||prefs().therapySort||'time-asc';
 const rows=[...(D().therapies||[])].sort((a,b)=>compareTherapy(a,b,mode));
 return'<div class="card"><div class="card-title-row"><div><h2>Terapie farmacologiche</h2><p class="kpi-note">Stesse informazioni del Dossier completo: orario, farmaco, principio attivo, dosaggio, frequenza e note.</p></div></div>'+
 '<div class="search-row"><div class="form-group"><label>Ordina terapie</label><select id="therapySort" class="form-control"><option value="time-asc" '+(mode==='time-asc'?'selected':'')+'>Orario crescente</option><option value="time-desc" '+(mode==='time-desc'?'selected':'')+'>Orario decrescente</option><option value="med-asc" '+(mode==='med-asc'?'selected':'')+'>Farmaco A-Z</option><option value="med-desc" '+(mode==='med-desc'?'selected':'')+'>Farmaco Z-A</option><option value="insert" '+(mode==='insert'?'selected':'')+'>Ordine di inserimento</option></select></div></div>'+
 (rows.length?table(['Orario','Farmaco','Principio attivo','Dosaggio','Frequenza / Note','Stato','Fonte'],rows.map(t=>[
  '<strong>'+E(formatTherapyTime(t.time||t.schedule||''))+'</strong>',
  '<strong>'+E(t.medication||t.name||'')+'</strong>',
  E(t.activeIngredient||''),
  E(t.dosage||''),
  '<span class="preserve-lines">'+E(therapyScheduleText(t))+'</span>',
  '<span class="badge '+(t.active===false?'':'success')+'">'+E(t.active===false?'Sospesa':'Attiva')+'</span>',
  t.sourceDocumentId?'<button class="btn btn-light btn-small" data-open-doc="'+E(t.sourceDocumentId)+'">Documento originale</button>':''
 ])):'<div class="notice">Nessuna terapia registrata.</div>')+'</div>';
}
function exemptionDetail(x){
 return'<div class="exemption-meta-grid"><div><small>Validità</small><strong>'+E((x.validFrom?'Dal '+FD(x.validFrom):'Non indicata')+(x.expiry?' · '+FD(x.expiry):''))+'</strong></div><div><small>Ente</small><strong>'+E(x.issuer||'Non indicato')+'</strong></div></div>'+
 (x.limitations?'<section><h4>Prestazioni / limitazioni</h4><div class="preserve-lines">'+E(x.limitations)+'</div></section>':'')+
 (x.notes?'<section><h4>Note</h4><div class="preserve-lines">'+E(x.notes)+'</div></section>':'')+
 (x.sourceDocumentId?'<div class="row-actions" style="margin-top:12px"><button class="btn btn-light btn-small" data-open-doc="'+E(x.sourceDocumentId)+'">Documento originale</button></div>':'');
}
function exemptions(){
 const rows=D().exemptions||[];
 const mode=exemptionMode||prefs().exemptionView||'compact';
 let body='';
 if(rows.length){
  if(mode==='extended')body=rows.map(x=>'<article class="exemption-card-readonly"><header><div><span class="exemption-code">'+E(x.code||'Codice non indicato')+'</span><h3>'+E(x.description||'Esenzione sanitaria')+'</h3></div></header>'+exemptionDetail(x)+'</article>').join('');
  else body='<div class="list-stack">'+rows.map((x,i)=>'<article class="list-item exemption-item" id="exemption-'+i+'"><div style="width:100%"><div class="card-title-row" style="margin:0"><div><h3><span class="exemption-code">'+E(x.code||'Codice non indicato')+'</span> '+E(x.description||'')+'</h3></div><button class="btn btn-light btn-small" data-exemption-toggle="'+i+'">Apri</button></div><div class="exemption-detail">'+exemptionDetail(x)+'</div></div></article>').join('')+'</div>';
 }else body='<div class="notice">Nessuna esenzione registrata.</div>';
 return'<div class="card"><div class="card-title-row"><div><h2>Esenzioni sanitarie</h2><p class="kpi-note">La vista può essere compressa o estesa; il contenuto clinico rimane completo.</p></div></div><div class="search-row"><div class="form-group"><label>Visualizzazione</label><select id="exemptionMode" class="form-control"><option value="compact" '+(mode==='compact'?'selected':'')+'>Versione compressa</option><option value="extended" '+(mode==='extended'?'selected':'')+'>Versione estesa</option></select></div></div>'+body+'</div>';
}
function compareDiagnosis(a,b,mode){
 const da=a.date||'0000-00-00',db=b.date||'0000-00-00';
 const name=String(a.name||'').localeCompare(String(b.name||''),'it',{sensitivity:'base'});
 if(mode==='date-asc')return da.localeCompare(db)||name;
 if(mode==='alpha-asc')return name||db.localeCompare(da);
 if(mode==='alpha-desc')return-name||db.localeCompare(da);
 if(mode==='category')return String(a.category||'').localeCompare(String(b.category||''),'it')||db.localeCompare(da);
 if(mode==='status')return String(a.status||'').localeCompare(String(b.status||''),'it')||db.localeCompare(da);
 if(mode==='specialization')return String(a.specialization||'').localeCompare(String(b.specialization||''),'it')||db.localeCompare(da);
 if(mode==='insert')return String(a.createdAt||a.updatedAt||'').localeCompare(String(b.createdAt||b.updatedAt||''));
 return db.localeCompare(da)||name;
}
function diagnosisHistory(d){
 const ev=[...(d.history||[])].sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
 if(ev.length<=1)return'';
 return'<details class="diagnosis-history"><summary>'+ev.length+' eventi storici collegati</summary><div class="list-stack" style="margin-top:10px">'+ev.map(e=>'<div class="list-item"><div><strong>'+E(FD(e.date))+'</strong> · '+E(e.category||'')+' · '+E(e.status||'')+'<br><span class="preserve-lines">'+E(e.notes||e.sourceQuote||'')+'</span></div>'+(e.sourceDocumentId?'<button class="btn btn-light btn-small" data-open-doc="'+E(e.sourceDocumentId)+'">Fonte</button>':'')+'</div>').join('')+'</div></details>';
}
function diagnoses(){
 const mode=diagnosisSort||prefs().diagnosisSort||'date-desc';
 const rows=[...(D().diagnoses||[])].sort((a,b)=>compareDiagnosis(a,b,mode));
 const main=rows.filter(d=>d.mainProblem===true||String(d.mainProblem)==='true');
 return'<div class="card"><div class="card-title-row"><div><h2>Diagnosi e problemi principali</h2><p class="kpi-note">Condizioni equivalenti riunite, con storia e fonti consultabili.</p></div><span class="badge">'+main.length+' principali</span></div>'+
 '<div class="search-row"><div class="form-group"><label>Ordina diagnosi</label><select id="diagnosisSort" class="form-control"><option value="date-desc" '+(mode==='date-desc'?'selected':'')+'>Data più recente</option><option value="date-asc" '+(mode==='date-asc'?'selected':'')+'>Data meno recente</option><option value="alpha-asc" '+(mode==='alpha-asc'?'selected':'')+'>Alfabetico A-Z</option><option value="alpha-desc" '+(mode==='alpha-desc'?'selected':'')+'>Alfabetico Z-A</option><option value="category" '+(mode==='category'?'selected':'')+'>Categoria</option><option value="status" '+(mode==='status'?'selected':'')+'>Stato</option><option value="specialization" '+(mode==='specialization'?'selected':'')+'>Specializzazione</option></select></div></div>'+
 (rows.length?table(['Data','Condizione / problema','Categoria','Stato','Note ed evoluzione','Fonte'],rows.map(d=>[
  E(FD(d.date)),
  '<strong>'+E(d.name||'')+'</strong>'+(d.mainProblem?'<br><span class="badge">Problema principale</span>':'')+(d.specialization?'<br><span class="kpi-note">'+E(d.specialization)+'</span>':''),
  E(d.category||'Dato da verificare'),
  '<span class="badge '+((d.status==='Attiva'||d.status==='In evoluzione')?'warning':d.status==='Risolta'?'success':'')+'">'+E(d.status||'Da verificare')+'</span>',
  '<span class="preserve-lines">'+E(d.notes||d.summary||'')+'</span>'+diagnosisHistory(d),
  d.sourceDocumentId?'<button class="btn btn-light btn-small" data-open-doc="'+E(d.sourceDocumentId)+'">Fonte</button>':''
 ])):'<div class="notice">Nessuna condizione registrata.</div>')+'</div>';
}
function calendar(){
 const rows=[...(D().calendarEvents||[])].sort((a,b)=>String(a.startDate||a.date||'').localeCompare(String(b.startDate||b.date||''))||String(a.startTime||a.time||'').localeCompare(String(b.startTime||b.time||'')));
 return'<div class="card"><div class="card-title-row"><div><h2>Agenda e scadenze</h2><p class="kpi-note">Appuntamenti e promemoria presenti nel profilo al momento dell’esportazione.</p></div></div>'+
 (rows.length?table(['Data','Ora','Categoria','Titolo','Stato','Note'],rows.map(x=>[
   E(FD(x.startDate||x.date)),E(x.allDay?'Tutto il giorno':x.startTime||x.time||''),E(x.category||x.type||'Altro'),'<strong>'+E(x.title||'')+'</strong>',E(x.status||'Pianificato'),'<span class="preserve-lines">'+E(x.notes||x.description||'')+'</span>'
 ])):'<div class="notice">Nessun appuntamento registrato.</div>')+'</div>';
}
const measurementsOf=t=>(D().measurements||[]).filter(x=>x.type===t).slice().sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))||String(a.time||'').localeCompare(String(b.time||'')));
const latest=t=>measurementsOf(t).at(-1)||null;
const activeJourney=()=>[...(D().weightJourneys||[])].filter(x=>x.status==='active').sort((a,b)=>String(b.updatedAt||b.createdAt||'').localeCompare(String(a.updatedAt||a.createdAt||'')))[0]||[...(D().weightJourneys||[])].sort((a,b)=>String(b.updatedAt||b.createdAt||'').localeCompare(String(a.updatedAt||a.createdAt||'')))[0]||null;
function bmi(weight,heightCm){const w=N(weight),h=N(heightCm);return w&&h? w/Math.pow(h/100,2):null;}
function bmiLabel(weight,heightCm){const b=bmi(weight,heightCm);return b?F(b):'—';}
function monitorHome(){
 const w=latest('weight'),bp=latest('blood_pressure'),s=latest('spo2'),g=latest('glucose');
 const j=activeJourney();
 const modules=[
 ['monitor-weight','Percorso peso','Obiettivo, differenze tra pesate e stima orientativa delle calorie.',w?F(w.value)+' kg':'Da iniziare'],
 ['monitor-body','Misurazioni corporee','Altezza e circonferenze con storico tabellare.',(D().measurements||[]).filter(x=>['height','waist','hips','chest','arm','thigh','neck'].includes(x.type)).length+' misurazioni'],
 ['monitor-pressure','Pressione arteriosa','Sistolica, diastolica, frequenza e contesto.',bp?(bp.systolic+'/'+bp.diastolic+' mmHg'):'Nessun dato'],
 ['monitor-spo2','Saturazione ossigeno','SpO₂, frequenza e note.',s?(F(s.value)+'%'):'Nessun dato'],
 ['monitor-glucose','Glicemia domestica','Misurazioni capillari e contesto.',g?(F(g.value)+' '+E(g.unit||'mg/dL')):'Nessun dato'],
 ['monitor-heart','Frequenza cardiaca','Rilevazioni domestiche della frequenza.',latest('heart_rate')?(F(latest('heart_rate').value)+' bpm'):'Nessun dato'],
 ['monitor-graphs','Grafici monitoraggio','Andamento temporale dei parametri registrati.','Apri']
 ];
 return'<div class="card profile-hero">'+profileAvatar()+'<div><span class="badge success">Profilo attivo</span><h2>'+E(pname())+'</h2><p>Area di monitoraggio personale, in sola lettura.</p></div><span class="badge">'+(j?'Percorso peso presente':'Nessun percorso')+'</span></div>'+
 '<div class="section-spacer"></div><div class="monitor-kpi-grid"><div class="monitor-kpi"><small>Ultimo peso</small><strong>'+(w?F(w.value)+' kg':'—')+'</strong><small>'+(w?E(FD(w.date)):'Nessuna pesata')+'</small></div><div class="monitor-kpi"><small>Ultima pressione</small><strong>'+(bp?E(bp.systolic+'/'+bp.diastolic):'—')+'</strong><small>'+(bp?E(FD(bp.date)):'Nessuna rilevazione')+'</small></div><div class="monitor-kpi"><small>Ultima saturazione</small><strong>'+(s?F(s.value)+'%':'—')+'</strong><small>'+(s?E(FD(s.date)):'Nessuna rilevazione')+'</small></div><div class="monitor-kpi"><small>Ultima glicemia</small><strong>'+(g?F(g.value)+' '+E(g.unit||'mg/dL'):'—')+'</strong><small>'+(g?E(FD(g.date)):'Nessuna rilevazione')+'</small></div></div>'+
 '<div class="section-spacer"></div><div class="module-grid">'+modules.map(m=>'<article class="module-card"><span class="badge">'+m[3]+'</span><h3>'+m[1]+'</h3><p class="kpi-note">'+m[2]+'</p><button class="btn btn-light btn-small" data-go-view="'+m[0]+'">Apri sezione</button></article>').join('')+'</div>';
}
function weightRows(){
 return measurementsOf('weight');
}
function weightJourneyMetrics(j,weights){
 if(!j)return null;
 const first=weights[0]?.value??j.startWeight,current=weights.at(-1)?.value??j.startWeight,target=N(j.targetWeight);
 const start=N(first),cur=N(current);
 const remaining=(cur!==null&&target!==null)?cur-target:null;
 const startDate=j.startDate||weights[0]?.date||'';
 const targetDate=j.targetDate||'';
 const days=targetDate?Math.max(0,Math.ceil((new Date(targetDate+'T12:00:00')-new Date(new Date().toISOString().slice(0,10)+'T12:00:00'))/86400000)):null;
 return{start,current:cur,target,remaining,days,startDate,targetDate,heightCm:N(j.heightCm)||N(P().heightCm)||N(P().height)};
}
function calorieEstimate(j,m){
 if(!j||!m||!m.current||!m.heightCm)return null;
 const sex=String(j.sex||P().sex||'').toLowerCase();
 const birth=P().birthDate?new Date(P().birthDate+'T12:00:00'):null;
 const now=new Date();
 const age=birth&&!Number.isNaN(birth.getTime())?Math.max(0,now.getFullYear()-birth.getFullYear()-((now.getMonth()<birth.getMonth()||(now.getMonth()===birth.getMonth()&&now.getDate()<birth.getDate()))?1:0)):null;
 if(age===null)return null;
 const bmr=10*m.current+6.25*m.heightCm-5*age+(sex.startsWith('m')?5:-161);
 const factor={sedentary:1.2,light:1.375,moderate:1.55,high:1.725,very_high:1.9}[j.activityLevel]||1.2;
 const maintenance=bmr*factor;
 let weekly=null,daily=null;
 if(m.target!==null&&m.days&&m.days>0){weekly=(m.current-m.target)/(m.days/7);daily=maintenance-(weekly*7700/7);}
 return{bmr,maintenance,weekly,daily};
}
function monitorWeight(){
 const weights=weightRows(),j=activeJourney(),m=weightJourneyMetrics(j,weights),c=calorieEstimate(j,m);
 const first=N(weights[0]?.value),height=m?.heightCm||N(j?.heightCm)||N(P().heightCm)||N(P().height);
 let summary='';
 if(m){
  let goalText='—';
  if(m.remaining!==null){
   if(Math.abs(m.remaining)<0.05)goalText='Obiettivo raggiunto';
   else if(m.remaining>0)goalText=F(m.remaining)+' kg';
   else goalText='Superato di '+F(Math.abs(m.remaining))+' kg';
  }
  summary='<div class="weight-summary">'+
   '<div class="card kpi"><div class="kpi-label">Peso iniziale / BMI</div><div class="kpi-value">'+(m.start!==null?F(m.start)+' kg / '+bmiLabel(m.start,height):'—')+'</div></div>'+
   '<div class="card kpi"><div class="kpi-label">Peso attuale / BMI</div><div class="kpi-value">'+(m.current!==null?F(m.current)+' kg / '+bmiLabel(m.current,height):'—')+'</div></div>'+
   '<div class="card kpi"><div class="kpi-label">Obiettivo / BMI</div><div class="kpi-value">'+(m.target!==null?F(m.target)+' kg / '+bmiLabel(m.target,height):'—')+'</div></div>'+
   '<div class="card kpi"><div class="kpi-label">Mancano all’obiettivo</div><div class="kpi-value">'+E(goalText)+'</div></div>'+
   '<div class="card kpi"><div class="kpi-label">Giorni rimanenti</div><div class="kpi-value">'+(m.days!==null?m.days:'—')+'</div></div></div>';
 }
 let calorie='';
 if(c){
  calorie='<div class="section-spacer"></div><div class="card"><h2>Stima calorica del percorso</h2><div class="calorie-grid">'+
  '<div class="card kpi"><div class="kpi-label">Mantenimento calorico stimato</div><div class="kpi-value">'+F(c.maintenance)+' kcal/giorno</div><div class="kpi-note">Stima delle calorie giornaliere necessarie per mantenere il peso attuale.</div></div>'+
  '<div class="card kpi"><div class="kpi-label">Apporto giornaliero stimato per il percorso</div><div class="kpi-value">'+(c.daily!==null?F(c.daily)+' kcal/giorno':'—')+'</div><div class="kpi-note">Stima teorica coerente con l’obiettivo e il tempo impostato.</div></div>'+
  '<div class="card kpi"><div class="kpi-label">Variazione media di peso richiesta</div><div class="kpi-value">'+(c.weekly!==null?F(Math.abs(c.weekly))+' kg/settimana':'—')+'</div><div class="kpi-note">Variazione media teorica necessaria per raggiungere l’obiettivo nella data prevista.</div></div>'+
  '<div class="card kpi"><div class="kpi-label">Metabolismo a riposo stimato</div><div class="kpi-value">'+F(c.bmr)+' kcal/giorno</div><div class="kpi-note">Stima dell’energia utilizzata a riposo per le funzioni vitali.</div></div></div>'+
  '<details class="calorie-info"><summary>ⓘ Come leggere questi valori</summary><p class="kpi-note">Stime orientative, non prescrizioni nutrizionali. I valori sono calcolati matematicamente in base ai dati del profilo e al percorso impostato. Condizioni cliniche, terapie, composizione corporea e altri fattori possono modificarne l’interpretazione.</p></details></div>';
 }
 const rows=weights.map((r,i)=>{
  const prev=i?N(r.value)-N(weights[i-1].value):0;
  const ini=first!==null?N(r.value)-first:0;
  return[E(FD(r.date)+(r.time?' '+r.time:'')),'<strong>'+F(r.value)+' kg</strong>',(prev>0?'+':'')+F(prev)+' kg',(ini>0?'+':'')+F(ini)+' kg',E(r.notes||'')];
 });
 return'<div class="card"><div class="card-title-row"><div><h2>Percorso peso</h2><p class="kpi-note">Ogni pesata mostra la differenza rispetto alla precedente e alla prima pesata del percorso.</p></div></div>'+summary+(weights.length?'<h3>Storico del peso</h3>'+table(['Data','Peso','Diff. precedente','Diff. iniziale','Note'],rows):'<div class="notice">Nessuna pesata registrata.</div>')+'</div>'+calorie+
 '<div class="section-spacer"></div><div class="card bmi-calculator"><h2>Calcolatore BMI</h2><p class="kpi-note">Strumento libero: non modifica né salva i dati del profilo.</p><div class="bmi-grid"><div class="form-group"><label>Altezza (cm)</label><input id="bmiHeight" class="form-control" type="number" step="0.1" min="1"></div><div class="form-group"><label>Peso (kg)</label><input id="bmiWeight" class="form-control" type="number" step="0.1" min="1"></div><div class="form-group"><label>BMI</label><input id="bmiResult" class="form-control" readonly></div></div></div>';
}
const bodyLabels={height:'Altezza',waist:'Circonferenza vita',hips:'Circonferenza fianchi',chest:'Circonferenza torace',arm:'Circonferenza braccio',thigh:'Circonferenza coscia',neck:'Circonferenza collo'};
function monitorBody(){
 const rows=(D().measurements||[]).filter(x=>Object.prototype.hasOwnProperty.call(bodyLabels,x.type)).slice().sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
 return'<div class="card"><h2>Misurazioni corporee</h2>'+(rows.length?table(['Data e ora','Parametro','Valore','Note'],rows.map(r=>[E(FD(r.date)+(r.time?' '+r.time:'')),E(bodyLabels[r.type]||r.type),'<strong>'+F(r.value)+' '+E(r.unit||'cm')+'</strong>',E(r.notes||'')])):'<div class="notice">Nessuna misurazione registrata.</div>')+'</div>';
}
function vitalTable(type,title,headers,mapper){
 const rows=measurementsOf(type).slice().reverse();
 return'<div class="card"><h2>'+E(title)+'</h2>'+(rows.length?table(headers,rows.map(mapper)):'<div class="notice">Nessuna rilevazione registrata.</div>')+'</div>';
}
function monitorPressure(){return vitalTable('blood_pressure','Pressione arteriosa',['Data e ora','Pressione','Frequenza','Contesto','Note'],r=>[E(FD(r.date)+(r.time?' '+r.time:'')),'<strong>'+E(r.systolic+'/'+r.diastolic)+' mmHg</strong>',r.heartRate?E(r.heartRate)+' bpm':'',E(r.context||''),E(r.notes||'')]);}
function monitorSpo2(){return vitalTable('spo2','Saturazione ossigeno',['Data e ora','SpO₂','Frequenza','Contesto','Note'],r=>[E(FD(r.date)+(r.time?' '+r.time:'')),'<strong>'+F(r.value)+'%</strong>',r.heartRate?E(r.heartRate)+' bpm':'',E(r.context||''),E(r.notes||'')]);}
function monitorGlucose(){return vitalTable('glucose','Glicemia domestica',['Data e ora','Valore','Tipo','Contesto','Note'],r=>[E(FD(r.date)+(r.time?' '+r.time:'')),'<strong>'+F(r.value)+' '+E(r.unit||'mg/dL')+'</strong>',E(r.measurementContext||''),E(r.context||''),E(r.notes||'')]);}
function monitorHeart(){return vitalTable('heart_rate','Frequenza cardiaca',['Data e ora','Frequenza','Contesto','Note'],r=>[E(FD(r.date)+(r.time?' '+r.time:'')),'<strong>'+F(r.value)+' bpm</strong>',E(r.context||''),E(r.notes||'')]);}
function monitorSvg(rows,label,unit,options={}){
 if(rows.length<1)return'<div class="notice">Nessuna rilevazione disponibile.</div>';
 const ordered=rows.slice().sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))||String(a.time||'').localeCompare(String(b.time||'')));
 const W=960,H=410,p={l:78,r:24,t:26,b:92};
 const values=ordered.map(x=>N(x.value)).filter(x=>x!==null);if(!values.length)return'<div class="notice">Nessun valore numerico valido.</div>';
 let min=Math.min(...values),max=Math.max(...values);
 const refMax=N(options.refMax);
 if(refMax!==null)max=Math.max(max,refMax);
 if(min===max){min-=1;max+=1;}
 const pad=Math.max((max-min)*.12,1);min-=pad;max+=pad;
 const plotW=W-p.l-p.r, plotH=H-p.t-p.b;
 const x=i=>p.l+(ordered.length===1?plotW/2:i*plotW/Math.max(ordered.length-1,1));
 const y=v=>p.t+(max-v)*plotH/(max-min);
 const tickCount=Math.min(5,Math.max(3,values.length>6?5:4));
 const yTicks=Array.from({length:tickCount},(_,i)=>max-(i*(max-min)/(tickCount-1)));
 const formatShortDate=s=>{const d=String(s||''); if(!/^\d{4}-\d{2}-\d{2}$/.test(d)) return d; const [Y,M,D]=d.split('-'); return D+'/'+M+'/'+Y.slice(2);};
 const grid=yTicks.map(v=>'<g><line x1="'+p.l+'" y1="'+y(v)+'" x2="'+(W-p.r)+'" y2="'+y(v)+'" class="chart-grid"></line><text x="'+(p.l-10)+'" y="'+(y(v)+4)+'" text-anchor="end" class="chart-tick">'+E(F(v))+'</text></g>').join('');
 const step=Math.max(1,Math.ceil(ordered.length/14));
 const xTicks=ordered.map((r,i)=>{
   const show=(i===0||i===ordered.length-1||i%step===0);
   return '<g><line x1="'+x(i)+'" y1="'+(H-p.b)+'" x2="'+x(i)+'" y2="'+(H-p.b+6)+'" class="chart-axis"></line>'+(show?'<text x="'+x(i)+'" y="'+(H-p.b+22)+'" text-anchor="end" transform="rotate(-40 '+x(i)+' '+(H-p.b+22)+')" class="chart-tick chart-tick-x">'+E(formatShortDate(r.date))+'</text>':'')+'</g>';
 }).join('');
 const refLine=refMax!==null?'<g><line x1="'+p.l+'" y1="'+y(refMax)+'" x2="'+(W-p.r)+'" y2="'+y(refMax)+'" class="chart-ref-line"></line><text x="'+(W-p.r-4)+'" y="'+(y(refMax)-6)+'" text-anchor="end" class="chart-ref-label">Soglia max '+E(F(refMax))+' '+E(unit)+'</text></g>':'';
 const pts=ordered.map((r,i)=>x(i)+','+y(N(r.value))).join(' ');
 const circles=ordered.map((r,i)=>'<g class="chart-point"><circle cx="'+x(i)+'" cy="'+y(N(r.value))+'" r="4"></circle><title>'+E(FD(r.date)+(r.time?' '+r.time:''))+': '+F(r.value)+' '+E(unit)+'</title></g>').join('');
 return'<div class="chart-shell"><svg class="health-chart" viewBox="0 0 '+W+' '+H+'" role="img"><text x="'+(W/2)+'" y="18" text-anchor="middle" class="chart-axis-title">'+E(label)+'</text>'+grid+refLine+'<line x1="'+p.l+'" y1="'+(H-p.b)+'" x2="'+(W-p.r)+'" y2="'+(H-p.b)+'" class="chart-axis"></line><line x1="'+p.l+'" y1="'+p.t+'" x2="'+p.l+'" y2="'+(H-p.b)+'" class="chart-axis"></line><text x="20" y="'+(H/2)+'" transform="rotate(-90 20 '+(H/2)+')" class="chart-axis-title">'+E(unit)+'</text><text x="'+(W/2)+'" y="'+(H-10)+'" text-anchor="middle" class="chart-axis-title">Data</text><polyline points="'+pts+'" class="chart-line"></polyline>'+circles+xTicks+'</svg></div>';
}
function monitorGraphs(){
 const defs=[
  ['weight','Peso','kg',r=>({date:r.date,time:r.time,value:r.value}),{}],
  ['blood_pressure','Pressione sistolica','mmHg',r=>({date:r.date,time:r.time,value:r.systolic}),{}],
  ['spo2','Saturazione ossigeno','%',r=>({date:r.date,time:r.time,value:r.value}),{}],
  ['glucose','Glicemia domestica','mg/dL',r=>({date:r.date,time:r.time,value:r.value}),{refMax:130}],
  ['heart_rate','Frequenza cardiaca','bpm',r=>({date:r.date,time:r.time,value:r.value}),{}]
 ];
 const blocks=defs.map(d=>{const rows=measurementsOf(d[0]).map(d[3]).filter(r=>N(r.value)!==null);return'<div class="card"><h3>'+E(d[1])+'</h3>'+monitorSvg(rows,d[1],d[2],d[4]||{})+'</div>';}).join('<div class="section-spacer"></div>');
 return'<div class="card"><h2>Grafici monitoraggio</h2><p class="kpi-note">Andamento delle misurazioni registrate manualmente nel Dossier, con date sull’asse orizzontale e valori numerici sull’asse verticale.</p></div><div class="section-spacer"></div>'+blocks;
}
function monitorGraphs(){
 const defs=[
  ['weight','Peso','kg',r=>({date:r.date,value:r.value})],
  ['blood_pressure','Pressione sistolica','mmHg',r=>({date:r.date,value:r.systolic})],
  ['spo2','Saturazione ossigeno','%',r=>({date:r.date,value:r.value})],
  ['glucose','Glicemia domestica','mg/dL',r=>({date:r.date,value:r.value})],
  ['heart_rate','Frequenza cardiaca','bpm',r=>({date:r.date,value:r.value})]
 ];
 const blocks=defs.map(d=>{const rows=measurementsOf(d[0]).map(d[3]).filter(r=>N(r.value)!==null);return'<div class="card"><h3>'+E(d[1])+'</h3>'+monitorSvg(rows,d[1],d[2])+'</div>';}).join('<div class="section-spacer"></div>');
 return'<div class="card"><h2>Grafici monitoraggio</h2><p class="kpi-note">Andamento delle misurazioni registrate manualmente nel Dossier.</p></div><div class="section-spacer"></div>'+blocks;
}
const R={
 dashboard,timeline,documents,graphs,profile,'health-card':healthCard,doctors,therapies,exemptions,diagnoses,calendar,
 'monitor-home':monitorHome,'monitor-weight':monitorWeight,'monitor-body':monitorBody,'monitor-pressure':monitorPressure,
 'monitor-spo2':monitorSpo2,'monitor-glucose':monitorGlucose,'monitor-heart':monitorHeart,'monitor-graphs':monitorGraphs
};

function bindDocumentSearch(){
 const input=document.querySelector('#documentSearch'),count=document.querySelector('#documentSearchCount'),empty=document.querySelector('#documentSearchEmpty');
 if(!input)return;
 const cards=[...document.querySelectorAll('[data-doc-card]')];
 const run=()=>{const q=input.value.trim().toLocaleLowerCase('it');let shown=0;cards.forEach(c=>{const ok=!q||String(c.dataset.search||'').includes(q);c.hidden=!ok;if(ok)shown++;});if(count)count.textContent=shown+' '+(shown===1?'documento':'documenti');if(empty)empty.hidden=shown>0;};
 input.addEventListener('input',run);run();
}
function bindGraphSearch(){
 const input=document.querySelector('#graphSearch'),count=document.querySelector('#graphSearchCount'),empty=document.querySelector('#graphSearchEmpty');
 if(!input)return;
 const cards=[...document.querySelectorAll('[data-graph-card]')];
 const run=()=>{const q=input.value.trim().toLocaleLowerCase('it');let shown=0;cards.forEach(c=>{const ok=!q||String(c.dataset.search||'').includes(q);c.hidden=!ok;if(ok)shown++;});if(count)count.textContent=shown+' '+(shown===1?'grafico':'grafici');if(empty)empty.hidden=shown>0;};
 input.addEventListener('input',run);run();
}
function bindBmi(){
 const h=document.querySelector('#bmiHeight'),w=document.querySelector('#bmiWeight'),out=document.querySelector('#bmiResult');
 if(!h||!w||!out)return;
 const run=()=>{const b=bmi(w.value,h.value);out.value=b?F(b):'';};h.addEventListener('input',run);w.addEventListener('input',run);
}
function setHeader(){
 const meta=VIEWS.find(x=>x[0]===view)||VIEWS[0];
 document.querySelector('#title').textContent=meta[1];
 document.querySelector('#subtitle').textContent=meta[2]+' · Dossier sanitario in sola lettura.';
 document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.view===view || (b.dataset.view==='monitor-home' && isMonitorView(view))));
}
function render(){
 applyProfileTheme();
 const fn=R[view]||dashboard;
 document.querySelector('#viewContainer').innerHTML=fn();
 setHeader();
 showNavScreen(isMonitorView(view)?'monitor':'main');
 if(view==='documents')bindDocumentSearch();
 if(view==='graphs')bindGraphSearch();
 if(view==='monitor-weight')bindBmi();
 if(view==='therapies'){
  const s=document.querySelector('#therapySort');if(s)s.onchange=()=>{therapySort=s.value;render();};
 }
 if(view==='exemptions'){
  const s=document.querySelector('#exemptionMode');if(s)s.onchange=()=>{exemptionMode=s.value;render();};
 }
 if(view==='diagnoses'){
  const s=document.querySelector('#diagnosisSort');if(s)s.onchange=()=>{diagnosisSort=s.value;render();};
 }
}
function printAll(){
 const sections=[profile(),healthCard(),doctors(),diagnoses(),therapies(),exemptions(),timeline(),documents(),graphs(),calendar(),monitorHome(),monitorWeight(),monitorBody(),monitorPressure(),monitorSpo2(),monitorGlucose(),monitorHeart(),monitorGraphs()];
 document.querySelector('#printRoot').innerHTML='<h1>Dossier sanitario - '+E(pname())+'</h1><p class="kpi-note">Generato il '+E(FDT(DATA.generatedAt))+' · copia in sola lettura</p>'+sections.join('<div class="section-spacer"></div>');
 setTimeout(()=>window.print(),80);
}

const sel=document.querySelector('#profileSelect');
DATA.profiles.forEach((p,i)=>{const o=document.createElement('option');o.value=i;o.textContent=((p.firstName||'')+' '+(p.lastName||'')).trim()||p.name||('Profilo '+(i+1));sel.appendChild(o);});
sel.onchange=()=>{current=Number(sel.value)||0;view='dashboard';graphReturnState=null;exemptionMode='';therapySort='';diagnosisSort='';render();};
const navMain=document.querySelector('#navMain');
const navMonitor=document.querySelector('#navMonitor');
const viewMap=new Map(VIEWS.map(v=>[v[0],v]));
const MONITOR_VIEWS=(NAV_SECTIONS.find(x=>x[0]==='Misurazioni')||['',[]])[1]||[];
function showNavScreen(name='main'){
 document.querySelectorAll('.nav-screen').forEach(el=>el.classList.remove('active'));
 (name==='monitor'?navMonitor:navMain).classList.add('active');
}
function isMonitorView(id=''){return MONITOR_VIEWS.includes(id);}
function goToView(id='dashboard'){
 view=id;
 render();
 showNavScreen(isMonitorView(id)?'monitor':'main');
 if(window.innerWidth<=820)document.querySelector('.sidebar')?.classList.remove('open');
}
(function buildNav(){
 const areaMedica=(NAV_SECTIONS.find(x=>x[0]==='Area medica')||['',[]])[1]||[];
 const label=document.createElement('div');label.className='nav-section-label';label.textContent='Area medica';navMain.appendChild(label);
 areaMedica.forEach(id=>{const v=viewMap.get(id);if(!v)return;const b=document.createElement('button');b.type='button';b.className='nav-item';b.dataset.view=v[0];b.textContent=v[1];b.onclick=()=>goToView(v[0]);navMain.appendChild(b);});
 const monitorEntry=document.createElement('button');monitorEntry.type='button';monitorEntry.className='nav-item nav-item-feature';monitorEntry.dataset.view='monitor-home';monitorEntry.textContent='Monitoraggio personale';monitorEntry.onclick=()=>goToView('monitor-home');navMain.appendChild(monitorEntry);
 const back=document.createElement('button');back.type='button';back.className='nav-subback';back.textContent='← Torna al dossier';back.onclick=()=>goToView('dashboard');navMonitor.appendChild(back);
 const ml=document.createElement('div');ml.className='nav-section-label';ml.textContent='Misurazioni';navMonitor.appendChild(ml);
 MONITOR_VIEWS.forEach(id=>{const v=viewMap.get(id);if(!v)return;const b=document.createElement('button');b.type='button';b.className='nav-item';b.dataset.view=v[0];b.textContent=v[1];b.onclick=()=>goToView(v[0]);navMonitor.appendChild(b);});
})();
document.querySelector('#printBtn').onclick=printAll;
document.querySelector('#menuBtn').onclick=()=>document.querySelector('.sidebar')?.classList.toggle('open');
document.querySelector('#generatedSide').textContent='Generato il '+FDT(DATA.generatedAt);

document.addEventListener('click',e=>{
 const go=e.target.closest('[data-go-view]');if(go){view=go.dataset.goView;render();return;}
 const open=e.target.closest('[data-open-doc]');if(open){openDocument(open.dataset.openDoc,open);return;}
 const back=e.target.closest('[data-return-graph]');if(back){returnToGraph();return;}
 const point=e.target.closest('.chart-point[data-doc-id]');if(point){openDocument(point.dataset.docId,point);return;}
 const gt=e.target.closest('[data-graph-toggle]');if(gt){const card=gt.closest('[data-graph-card]');if(card){card.classList.toggle('open');gt.textContent=card.classList.contains('open')?'Chiudi':'Apri';}return;}
 const dt=e.target.closest('[data-doc-toggle]');if(dt){const cards=[...document.querySelectorAll('[data-doc-card]')];const card=cards[Number(dt.dataset.docToggle)];if(card){card.classList.toggle('open');dt.textContent=card.classList.contains('open')?'Chiudi':'Apri';}return;}
 const ex=e.target.closest('[data-exemption-toggle]');if(ex){const card=document.querySelector('#exemption-'+ex.dataset.exemptionToggle);if(card){card.classList.toggle('open');ex.textContent=card.classList.contains('open')?'Chiudi':'Apri';}return;}
});
document.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches?.('.chart-point[data-doc-id]')){e.preventDefault();openDocument(e.target.dataset.docId,e.target);}});
render();
</script>
</body>
</html>`;
  }

  const API_ORIGIN=`${location.protocol}//${location.hostname}:8896`;
  async function uploadExportFile(session,path,data,{optimize=false}={}){
    const body=data instanceof Blob?data:new Blob([String(data)],{type:path.endsWith('.html')?'text/html;charset=utf-8':'text/plain;charset=utf-8'});
    const response=await fetch(`${API_ORIGIN}/api/doctor-export/file`,{method:'POST',headers:{'X-Doctor-Export-Id':session.exportId,'X-Relative-Path':path,'X-Optimize-Medical':optimize?'1':'0','Content-Type':body.type||'application/octet-stream'},body,cache:'no-store'});
    let result={};try{result=await response.json();}catch{}
    if(!response.ok||result.ok===false)throw new Error(result.error||`Scrittura non riuscita (${response.status})`);
    return result;
  }

  async function build(ids,options={}){
    const progress=options.progress||(()=>{}),session=options.exportSession;if(!session?.exportId)throw new Error('Destinazione non selezionata.');progress(2,'Preparazione','Lettura dei profili autorizzati.');const all=await profilesAllowed();const chosen=all.filter(p=>ids.includes(p.id));if(!chosen.length)throw new Error('Nessun profilo autorizzato selezionato.');
    const files=new Map(),datasets={};for(let i=0;i<chosen.length;i++){progress(5+(i/chosen.length)*52,'Preparazione dossier',`${i+1}/${chosen.length}: ${chosen[i].firstName||''} ${chosen[i].lastName||''}`);datasets[chosen[i].id]=await datasetForProfile(files,chosen[i],options);await yieldUi();}
    progress(60,'Creazione interfaccia','Preparazione della copia HTML in sola lettura.');
    try{
      const cssResponse=await fetch('css/app.css',{cache:'no-store'});
      if(cssResponse.ok)files.set('risorse/app.css',await cssResponse.text());
      const iconResponse=await fetch('assets/icon-128.png',{cache:'no-store'});
      if(iconResponse.ok)files.set('risorse/icon-128.png',await iconResponse.blob());
    }catch(error){console.warn('Risorse grafiche condivise non esportate:',error);}
    const publicProfiles=chosen.map(p=>datasets[p.id].profile);
    const data={format:'dossier-medico-readonly-v6',generatedAt:new Date().toISOString(),mode:options.mode||'single',profiles:publicProfiles,datasets:Object.fromEntries(chosen.map(p=>[p.id,datasets[p.id]]))};
    files.set('APRI_DOSSIER.html',viewerHtml(data));files.set('LEGGIMI_PRIMA.txt','DOSSIER SANITARIO LOCALE - VERSIONE PER MEDICO\r\n\r\n1. Aprire APRI_DOSSIER.html con il browser.\r\n2. Non serve installare nulla e in questa cartella non sono presenti file EXE.\r\n3. La copia riproduce i contenuti clinici del Dossier principale in sola lettura: terapie complete, orari, diagnosi, esenzioni, grafici, agenda, monitoraggio, documenti e immagini.\r\n4. Nessun dato puo essere modificato, eliminato, importato o sincronizzato. Il pulsante Esporta PDF usa la funzione di stampa del browser.\r\n5. I dati rappresentano la situazione presente al momento dell esportazione.\r\n6. I documenti originali possono essere ottimizzati in qualita per ridurre il peso della copia, senza modificare gli originali conservati nel Dossier principale.\r\n7. Conservare questa cartella o la chiavetta con attenzione: contiene dati sanitari.\r\n');
    const entries=[...files.entries()];let savedOriginal=0,savedOutput=0;for(let i=0;i<entries.length;i++){const [path,content]=entries[i],optimize=/\/documenti\//i.test(path);progress(64+(i/Math.max(1,entries.length))*35,'Scrittura sulla destinazione',`${i+1}/${entries.length}: ${path}${optimize?' · ottimizzazione leggibilità':''}`);const result=await uploadExportFile(session,path,content,{optimize});savedOriginal+=Number(result.originalBytes||0);savedOutput+=Number(result.savedBytes||0);if(i%4===3)await yieldUi();}
    await DossierSecurity.request('/api/doctor-export/complete',{method:'POST',body:{exportId:session.exportId}}).catch(()=>{});const saving=savedOriginal>savedOutput&&savedOriginal?` · documenti alleggeriti di ${Math.round((1-savedOutput/savedOriginal)*100)}%`:'';progress(100,'Completato',`${session.folderName||'Cartella'} pronta${saving}.`);return session.folderPath||session.folderName||'Cartella creata';
  }

  function init(){document.querySelector('#doctorExportBtn')?.addEventListener('click',()=>void openDialog());}
  document.addEventListener('DOMContentLoaded',init,{once:true});
  return {openDialog,build};
})();
globalThis.DossierDoctorExport=DossierDoctorExport;
