'use strict';

const App = (() => {
  const state = {
    profiles: [],
    activeProfileId: null,
    activeView: 'dashboard',
    documents: [],
    doctors: [],
    therapies: [],
    exemptions: [],
    diagnoses: [],
    measurements: [],
    weightJourneys: [],
    documentVersions: [],
    calendarEvents: [],
    calendarFamilyEvents: [],
    calendarFamilySuggestions: [],
    calendarProfileMeta: {},
    calendarModalDoctors: [],
    calendarSuggestions: [],
    calendarLocalStatus: {ok:false,supported:false},
    googleCalendarStatus: {ok:false,configured:false,connected:false},
    googleCalendarEventStatus: {},
    googleCalendarEmail: '',
    calendarFamilyVirtualLocalStatus: {},
    calendarView: 'list',
    calendarPresentation: localStorage.getItem('calendarPresentationV13')==='extended'?'extended':'simple',
    calendarMonth: '',
    selectedCalendarEventId: '',
    calendarQuery: '',
    calendarCategory: 'Tutti',
    monitorGraphType: 'weight',
    bodyGraphType: '',
    archiveHandle: null,
    selectedFiles: [],
    importQueue: [],
    ocrHealth: {ok:false,ocrAvailable:false,checking:true},
    graphParameterId: '',
    graphUnitKey: '',
    compareQuery: '',
    importOptions: {},
    objectUrls: [],
    healthCardSide: 'front',
    globalPreferences: {},
    profilePreferences: {},
    therapySort: 'time-asc',
    diagnosisSort: 'date-desc',
    storageEstimate: null,
    selectedDocIds: new Set(),
    visibleDocumentIds: [],
    trashItems: [],
    securityPreferencesHtml: '',
    cloudPanelHtml: '',
    lastBackupReport: null,
    lastRestoreReport: null,
    lastClinicalMigrationReport: null
  };
  let licensePlanReady = false;
  let licensePlanApplyBusy = false;

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const uid = (prefix='id') => `${prefix}_${crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36)+Math.random().toString(36).slice(2)}`;
  const today = () => new Date().toISOString().slice(0,10);
  const formatDate = (value) => value ? new Intl.DateTimeFormat('it-IT').format(new Date(`${value}T12:00:00`)) : 'Data non definita';
  const formatDateTime = (value) => value ? new Intl.DateTimeFormat('it-IT', {dateStyle:'short', timeStyle:'short'}).format(new Date(value)) : 'Mai';
  const formatBytes = (bytes=0) => {
    const units = ['B','KB','MB','GB']; let i=0, value=bytes;
    while (value >= 1024 && i < units.length-1) { value/=1024; i++; }
    return `${value.toFixed(i ? 1 : 0)} ${units[i]}`;
  };
  const esc = (s='') => String(s).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const slug = (s='profilo') => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'').slice(0,45) || 'profilo';
  const activeProfile = () => state.profiles.find(p => p.id === state.activeProfileId) || null;
  const MIN_CLINICAL_DATE='1900-01-01';
  const PALETTES = {
    teal:{name:'Verde petrolio',primary:'#0f766e',primaryDark:'#0b5f59',primarySoft:'#dff4f1',sidebar:'#0b4f4a',line:'#dbe8e6',bg:'#f3f7f7',surface2:'#eef6f5',chart2:'#2f9b8e'},
    green:{name:'Verde clinico',primary:'#2f7d4a',primaryDark:'#245f39',primarySoft:'#e4f4e8',sidebar:'#244f35',line:'#d9e8dd',bg:'#f4f8f5',surface2:'#eef6f0',chart2:'#69a878'},
    blue:{name:'Blu sanitario',primary:'#2563a8',primaryDark:'#1d4f86',primarySoft:'#e4eef9',sidebar:'#173e69',line:'#d9e3ef',bg:'#f3f6fa',surface2:'#edf3f9',chart2:'#5f8fc4'},
    burgundy:{name:'Bordeaux sobrio',primary:'#8a3347',primaryDark:'#692535',primarySoft:'#f6e7eb',sidebar:'#53212d',line:'#eadce0',bg:'#f8f4f5',surface2:'#f7edf0',chart2:'#b56c7c'},
    violet:{name:'Viola tenue',primary:'#6c4aa1',primaryDark:'#52377c',primarySoft:'#eee8f7',sidebar:'#412f61',line:'#e2dced',bg:'#f6f4f9',surface2:'#f1edf7',chart2:'#9479bc'},
    graphite:{name:'Grafite',primary:'#52616b',primaryDark:'#39464e',primarySoft:'#e9eef1',sidebar:'#29343a',line:'#dde3e6',bg:'#f4f6f7',surface2:'#edf1f3',chart2:'#7d8b94'}
  };
  const PROFILE_COLORS=['#0f766e','#2f7d4a','#2563a8','#8a3347','#6c4aa1','#c56a1a','#52616b','#b2473e'];
  const DEFAULT_GLOBAL_PREFS={palette:'teal',theme:'light',textScale:'normal',density:'comfortable',confirmImports:true,backupFrequency:'weekly',googleCalendarEmail:'',agendaDefaultReminders:[1440],medicationReorderGroupDays:7};
  const R41_STARTUP_COMPAT_GOOGLE_LABEL='Account Google Calendar predefinito';
  const DEFAULT_PROFILE_PREFS={profileColor:'#0f766e',therapySort:'time-asc',diagnosisSort:'date-desc',diagnosisView:'extended',dashboardOverviewChart:'weight',pdfDiagnosisMode:'both',exemptionView:'compact',includeHealthCard:true,includeDoctorPhone:true,pdfSpaceSaving:false,pdfIncludeGraphs:true,selectedGraphs:[],pdfExcludedDocumentTypes:[],pdfDefaultExcludeComplexClinical:true,monitorPdfTables:true,monitorPdfSilhouette:false,monitorPdfGraphs:['weight','blood_pressure','spo2','glucose','heart_rate']};
  const currentProfilePreferences=()=>{const value={...DEFAULT_PROFILE_PREFS,...(activeProfile()?.preferences||{}),...(state.profilePreferences||{})};if(globalThis.DossierFeatures&&!DossierFeatures.has('temporalGraphs'))value.pdfIncludeGraphs=false;return value;};
  function graphParameterSortDescriptor(parameter={}) {
    const name=String(parameter.name||parameter.parameterName||'').toLocaleLowerCase('it-IT').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
    const compact=name.replace(/\s+/g,'');
    if(compact==='ft3'||compact==='freet3'||compact==='triiodotironinalibera'||compact==='triiodotironinafree')return{key:'ft3',group:0};
    if(compact==='ft4'||compact==='freet4'||compact==='tiroxinalibera'||compact==='tiroxinafree')return{key:'ft3',group:1};
    if(compact==='tsh'||compact==='tireotropina'||compact==='ormonetireostimolante')return{key:'ft3',group:2};
    return{key:name||String(parameter.id||''),group:0};
  }
  const CLINICAL_VALIDATION_VERSION='test27-v24';
  const EXTERNAL_REFERENCE_VERSION='2026.08.06-test27';
  const EXTERNAL_REFERENCE_SOURCES={
    hdl:{name:'ESC/EAS',version:'aggiornamento 2025',date:'2025-08-29',scope:'Adulti, colesterolo HDL'},
    thyroid:{name:'Mayo Clinic Laboratories e ARUP Laboratories',version:'cataloghi adulti consultati 2026-08-05',date:'2026-08-05',scope:'Adulti, FT3 e FT4; metodo e unità compatibili'},
    urinalysis:{name:'MedlinePlus e manuali di laboratorio per esame urine',version:'riferimenti generali consultati 2026-08-05',date:'2026-08-05',scope:'Adulti, urine; usare solo con unità o risultato compatibile'},
    cbc:{name:'Mayo Clinic Laboratories e intervalli ematologici per adulti',version:'catalogo CBC consultato 2026-08-05',date:'2026-08-05',scope:'Adulti, emocromo; sesso e unità compatibili quando rilevanti'},
    differential:{name:'Intervalli ematologici adulti per formula leucocitaria',version:'riferimenti adulti consultati 2026-08-05',date:'2026-08-05',scope:'Adulti, percentuali leucocitarie; unità %'},
    chemistry:{name:'Riferimenti clinici generali per adulti',version:'riferimenti adulti consultati 2026-08-05',date:'2026-08-05',scope:'Adulti; usato solo quando manca uno storico compatibile'},
    vitaminD:{name:'Mayo Clinic Laboratories',version:'25HDN consultato 2026-08-05',date:'2026-08-05',scope:'25-idrossivitamina D totale, ng/mL o µg/L'},
    lipids:{name:'Mayo Clinic Laboratories',version:'Lipid Panel adulti consultato 2026-08-05',date:'2026-08-05',scope:'Adulti, LDL in mg/dL; valore desiderabile'},
    glucose:{name:'Mayo Clinic Laboratories e criteri ADA',version:'riferimenti adulti consultati 2026-08-05',date:'2026-08-05',scope:'Adulti, glicemia in mg/dL; riferimento a digiuno quando il referto non specifica diversamente'},
    coagulation:{name:'Mayo Clinic Laboratories',version:'PTTP consultato 2026-08-05',date:'2026-08-05',scope:'Adulti, INR; intervallo terapeutico distinto quando è documentata terapia anticoagulante'},
    urineCreatinine:{name:'Mayo Clinic Laboratories',version:'RCTUR consultato 2026-08-05',date:'2026-08-05',scope:'Adulti, creatinina urinaria casuale in mg/dL'},
    renal:{name:'Mayo Clinic Laboratories',version:'CRTS1 consultato 2026-08-05',date:'2026-08-05',scope:'Adulti, creatinina sierica; sesso e unità compatibili'},
    liver:{name:'Mayo Clinic Laboratories',version:'AST, ALT e BILIT consultati 2026-08-05',date:'2026-08-05',scope:'Adulti, unità U/L o mg/dL compatibili'},
    electrolytes:{name:'Mayo Clinic Laboratories e intervalli clinici adulti',version:'catalogo consultato 2026-08-05',date:'2026-08-05',scope:'Adulti, unità compatibili'},
    ntprobnp:{name:'Mayo Clinic Laboratories',version:'PBNP1 consultato 2026-08-05',date:'2026-08-05',scope:'Adulti, NT-proBNP in pg/mL; età e sesso compatibili'},
    immunology:{name:'CDC e riferimenti di immunologia clinica',version:'interpretazione qualitativa consultata 2026-08-05',date:'2026-08-05',scope:'Test immunologici qualitativi espliciti'},
    psa:{name:'Riferimenti clinici urologici per PSA',version:'riferimenti adulti consultati 2026-08-05',date:'2026-08-05',scope:'PSA totale in ng/mL e rapporto libero/totale'},
    thyroidTsh:{name:'Mayo Clinic Laboratories e ARUP Laboratories',version:'TSH adulto consultato 2026-08-05',date:'2026-08-05',scope:'Adulti, TSH in mUI/L o equivalenti'},
    enzymes:{name:'Mayo Clinic Laboratories e intervalli enzimatici adulti',version:'riferimenti consultati 2026-08-05',date:'2026-08-05',scope:'Lipasi e attività protrombinica con unità compatibili'},
    albuminuria:{name:'KDIGO e riferimenti di laboratorio per albuminuria',version:'criteri consultati 2026-08-05',date:'2026-08-05',scope:'Albumina urinaria e rapporto albumina/creatinina'}
  };
  function normalizedWords(value=''){return HealthExtractors.normalizeText(String(value||'')).replace(/[^a-z0-9]+/g,' ').trim();}
  function facilityFamily(doc={}){
    const raw=normalizedWords(doc.facility||'');
    const context=normalizedWords(`${doc.facility||''} ${doc.department||''} ${String(doc.structuredText||doc.extractedText||'').slice(0,5000)}`);
    if(/ospedale f lotti|f lotti pontedera/.test(context))return'ospedale-f-lotti-pontedera';
    if(/ospedale s m maddalena|s m maddalena volterra/.test(context))return'ospedale-s-m-maddalena-volterra';
    if(/nuovo ospedale santa chiara cisanello|ospedale cisanello/.test(context))return'aou-pisana-cisanello';
    if(/spedali riuniti.*santa chiara|ospedale santa chiara/.test(context))return'aou-pisana-santa-chiara';
    if(/ospedale garibaldi/.test(context))return'ospedale-garibaldi';
    if(/ospedale di circolo.*busto arsizio/.test(context))return'ospedale-circolo-busto-arsizio';
    if(/s d patologia clinica universitaria/.test(context))return'sd-patologia-clinica-universitaria';
    if(raw){
      return raw
        .replace(/\b(?:ssn|servizio sanitario nazionale|regione toscana|azienda|ospedaliero|ospedaliera|universitaria|universitario|usl|uoc|uo|laboratorio|analisi|chimico|cliniche|servizio|tel|fax)\b/g,' ')
        .replace(/\s+/g,' ').trim().split(' ').filter(Boolean).slice(0,18).join('-');
    }
    return'';
  }
  function docDateValue(doc={}){const t=Date.parse(`${doc.clinicalDate||doc.issueDate||'1900-01-01'}T12:00:00`);return Number.isFinite(t)?t:0;}
  function validRangeObject(range){return !!range&&(Number.isFinite(range.min)||Number.isFinite(range.max)||Number.isFinite(range.low)||Number.isFinite(range.high)||Number.isFinite(range.limit));}
  function inferredProfileSex(profile={}){const explicit=String(profile.sex||profile.gender||'').toLowerCase();if(/^(?:f|female|donna|femmina)$/.test(explicit))return'f';if(/^(?:m|male|uomo|maschio)$/.test(explicit))return'm';const cf=String(profile.taxCode||profile.fiscalCode||profile.codiceFiscale||'').replace(/\s+/g,'').toUpperCase();const day=Number(cf.slice(9,11));return Number.isFinite(day)&&day>0?(day>40?'f':'m'):'';}
  function profileAge(profile={},doc={}){if(!profile.birthDate)return null;const birth=new Date(`${profile.birthDate}T12:00:00`);if(!Number.isFinite(birth.getTime()))return null;const candidates=[doc.clinicalDate,doc.issueDate,String(doc.addedAt||'').slice(0,10),String(doc.updatedAt||'').slice(0,10),new Date().toISOString().slice(0,10)].filter(Boolean);for(const raw of candidates){const date=new Date(`${String(raw).slice(0,10)}T12:00:00`);if(!Number.isFinite(date.getTime())||date.getTime()<=birth.getTime())continue;let age=date.getFullYear()-birth.getFullYear();if(date.getMonth()<birth.getMonth()||(date.getMonth()===birth.getMonth()&&date.getDate()<birth.getDate()))age--;if(age>=0)return age;}return null;}
  function labMethodKey(doc={},row={}){return normalizedWords(row.method||row.analyticalMethod||doc.labMethod||doc.analyticalMethod||doc.method||'');}
  function parameterKey(row={}){return String(row.parameterId||HealthExtractors.normalizedExamKey?.(row.parameterName||row.test||'')||'');}
  function unitCompatible(a='',b=''){const x=HealthExtractors.canonicalUnitKey(a),y=HealthExtractors.canonicalUnitKey(b);return x===y||(x==='unita_non_rilevata'&&y==='unita_non_rilevata');}
  function calculatedStatus(value,range){
    if(!Number.isFinite(Number(value))||!range)return'da verificare';const v=Number(value),lo=Number.isFinite(range.min)?range.min:range.low,hi=Number.isFinite(range.max)?range.max:range.high;
    if(Number.isFinite(lo)&&v<lo)return'basso';if(Number.isFinite(hi)&&v>hi)return'alto';
    if(Number.isFinite(range.limit)){const op=range.operator||'';if(op==='<'&&v>=range.limit)return'alto';if(op==='≤'&&v>range.limit)return'alto';if(op==='>'&&v<=range.limit)return'basso';if(op==='≥'&&v<range.limit)return'basso';}
    return'nei limiti';
  }
  function extRange(raw,low,high,operator,limit){const range={raw};if(Number.isFinite(low)){range.low=low;range.min=low;}if(Number.isFinite(high)){range.high=high;range.max=high;}if(operator){range.operator=operator;range.limit=limit;}return range;}
  function calculatedRowStatus(row={},range){
    const value=Number(row.value);
    if(typeof HealthExtractors?.statusFromRange==='function'){
      try{return HealthExtractors.statusFromRange(value,range,`${range?.semanticRaw||range?.raw||''} ${row.sourceLine||''}`)||'da verificare';}catch(_){/* fallback below */}
    }
    return calculatedStatus(value,range);
  }
  function isUrineContext(row={},doc={}){
    const t=normalizedWords(`${row.sample||''} ${row.parameterName||row.test||''} ${row.sourceLine||''} ${doc.title||''} ${doc.originalName||''} ${doc.documentKind||''}`);
    return /\burin|sedimento|urinalisi|chimico fisico\b/.test(t)||/^(?:custom_chetoni|custom_bilirubina|custom_sangue|custom_glucosio|urine_ph|urobilinogen|creatinine_urine)$/.test(parameterKey(row));
  }
  function referenceNotApplicableFor(row={},doc={}){
    if(row.referenceNotApplicable===true||row.referenceApplicability==='not_applicable')return true;
    const name=normalizedWords(row.parameterName||row.test||'');
    const result=normalizedWords(row.result??row.rawValue??row.value??'');
    if(/^(?:estradiolo e2|fsh|lh|progesterone)$/.test(name)&&/picco|fase|ciclo|menopausa|gravidanza/.test(normalizedWords(row.sourceLine||'')))return true;
    if(/^(?:massa grassa|massa magra|massa muscolare|massa ossea|acqua intracellulare|acqua extracellulare|proteine corporee|metabolismo basale|eta metabolica|altezza|peso)$/.test(name))return true;
    if(/(?:esame annullato|campione non consegnato|non eseguito|campione (?:emolizzato|coagulato|insufficiente|non idoneo)|emolizzato|coagulato)/.test(result))return true;
    if(/^(?:interferone gamma antigene tb1|interferone gamma antigene tb2|mitogeno|psa libero|anti hbc|anti hbe)$/.test(name))return true;
    return false;
  }
  function specialClinicalResultResolution(row={},doc={}){
    const name=normalizedWords(row.parameterName||row.test||'');
    const result=normalizedWords(row.result??row.rawValue??row.value??'');
    const raw=String(row.result??row.rawValue??row.displayResult??'').trim();
    if(/(?:campione\s+)?(?:emolizzato|emolisi|siero\/?plasma\s+emolizzato)/.test(result)){
      return {displayResult:'Risultato non disponibile',status:'Non valutabile',statusSource:'sample_quality',statusSourceLabel:'',referenceApplicability:'not_required',referenceNotApplicable:false,sampleQualityNote:raw||'Campione emolizzato'};
    }
    if(/non\s+calcolabil/.test(result))return {displayResult:'Non calcolabile',status:'Non valutabile',statusSource:'not_evaluable',statusSourceLabel:'',referenceApplicability:'not_required',referenceNotApplicable:false};
    if(isUrineContext(row,doc)&&Number.isFinite(Number(row.value))&&Number(row.value)===0&&/^(?:chetoni|corpi chetonici|bilirubina|sangue|emoglobina|glucosio|glicosuria)$/.test(name))return {displayResult:String(row.rawValue??row.value??'0'),status:'nei limiti',statusSource:'external',statusSourceLabel:'esterno',referenceApplicability:'applicable',referenceNotApplicable:false,range:{raw:'Assente'},referenceSource:EXTERNAL_REFERENCE_SOURCES.urinalysis};
    if(/^anti\s*hav\s*igg$/.test(name)){
      if(/^(?:positivo|positiva|rilevato|rilevata|reattivo|reattiva)$/.test(result))return {status:'Immunità presente',statusSource:'interpretive',statusSourceLabel:'',referenceApplicability:'not_required',referenceNotApplicable:false,referenceSource:EXTERNAL_REFERENCE_SOURCES.immunology};
      if(/^(?:negativo|negativa|non rilevato|non rilevata|non reattivo|non reattiva)$/.test(result))return {status:'Immunità non rilevata',statusSource:'interpretive',statusSourceLabel:'',referenceApplicability:'not_required',referenceNotApplicable:false,referenceSource:EXTERNAL_REFERENCE_SOURCES.immunology};
    }
    return null;
  }
  function externalReferenceFor(row={},profile={},doc={}){
    const id=parameterKey(row),name=normalizedWords(row.parameterName||''),unit=HealthExtractors.canonicalUnitKey(row.unit||''),value=Number(row.value),age=profileAge(profile,doc),sex=inferredProfileSex(profile);if(!Number.isFinite(value)||Number.isFinite(age)&&age<18)return null;
    let range=null,source=null,inferredUnit='',specialStatus='';
    const context=normalizedWords(`${row.sourceLine||''} ${doc.title||''} ${doc.originalName||''} ${doc.extractedTherapies?.map?.(x=>x.medication||'').join(' ')||''}`);
    if((id==='hdl'||/colesterolo hdl/.test(name))&&unit==='mg/dl'){const limit=sex==='f'?50:40;range=extRange(`≥${limit}`,null,null,'≥',limit);source=EXTERNAL_REFERENCE_SOURCES.hdl;}
    else if((id==='ft3'||/^ft3$|triiodotironina libera/.test(name))&&unit==='pg/ml'){range=extRange('2,0 - 4,4',2,4.4);source=EXTERNAL_REFERENCE_SOURCES.thyroid;}
    else if((id==='ft4'||/^ft4$|tiroxina libera/.test(name))&&unit==='ng/dl'){range=extRange('0,9 - 1,7',0.9,1.7);source=EXTERNAL_REFERENCE_SOURCES.thyroid;}
    else if((id==='ft4'||/^ft4$|tiroxina libera/.test(name))&&unit==='ng/l'){range=extRange('9,0 - 17,0',9,17);source=EXTERNAL_REFERENCE_SOURCES.thyroid;}
    else if((id==='urine_ph'||/^ph urine$/.test(name))&&(unit==='unita_non_rilevata'||unit==='ph')){range=extRange('4,6 - 8,0',4.6,8);source=EXTERNAL_REFERENCE_SOURCES.urinalysis;}
    else if((id==='urobilinogen'||/urobilinogeno/.test(name))&&/^(?:mg\/dl|u\/dl|eu\/dl|unita_non_rilevata)$/.test(unit)){range=extRange('0,1 - 1,0',0.1,1);source=EXTERNAL_REFERENCE_SOURCES.urinalysis;if(unit==='unita_non_rilevata')inferredUnit='EU/dL';}
    else if((id==='bilirubin_indirect'||/bilirubina indiretta/.test(name))&&unit==='mg/dl'){range=extRange('0,2 - 0,8',0.2,0.8);source=EXTERNAL_REFERENCE_SOURCES.chemistry;}
    else if((id==='vitamin_d'||/vitamina d/.test(name))&&/^(?:ng\/ml|ug\/l|µg\/l|\?g\/l)$/.test(unit)&&/(?:25 oh|25oh)/.test(normalizedWords(`${row.parameterName||''} ${row.sourceLine||''}`))&&!/1 25 oh/.test(normalizedWords(`${row.parameterName||''} ${row.sourceLine||''}`))){range=extRange('20 - 50',20,50);source=EXTERNAL_REFERENCE_SOURCES.vitaminD;specialStatus=value<20?'insufficiente':value<=50?'nei limiti':'alto';if(unit==='?g/l')inferredUnit='µg/L';}
    else if((id==='ldl'||/colesterolo ldl/.test(name))&&unit==='mg/dl'){range=extRange('<100',null,null,'<',100);source=EXTERNAL_REFERENCE_SOURCES.lipids;}
    else if((id==='glucose_blood'||/^glicemia$|glucosio plasmatico|glucosio sangue/.test(name))&&(unit==='mg/dl'||unit==='unita_non_rilevata')){
      if(/(?:2 ore|120 min|post prand|postprand|dopo pasto)/.test(context))range=extRange('<140',null,null,'<',140);
      else range=extRange('70 - 99',70,99);
      source=EXTERNAL_REFERENCE_SOURCES.glucose;if(unit==='unita_non_rilevata')inferredUnit='mg/dL';
    }
    else if((id==='custom_inr'||/^inr$/.test(name))){const anticoag=/\b(?:warfarin|coumadin|sintrom|acenocumarolo|acenocoumarol)\b/.test(context);range=anticoag?extRange('2,0 - 3,0',2,3):extRange('0,9 - 1,1',0.9,1.1);source=EXTERNAL_REFERENCE_SOURCES.coagulation;inferredUnit='';}
    else if((id==='creatinine_urine'||/creatinina urinaria|creatininuria/.test(name))&&unit==='mg/dl'){range=extRange('16 - 326',16,326);source=EXTERNAL_REFERENCE_SOURCES.urineCreatinine;}
    else if((id==='creatinine'||id==='creatinine_serum'||/creatinina ematica|creatinina sierica|^creatinina$/.test(name))&&(unit==='mg/dl'||unit==='unita_non_rilevata')){range=sex==='f'?extRange('0,59 - 1,04',0.59,1.04):extRange('0,74 - 1,35',0.74,1.35);source=EXTERNAL_REFERENCE_SOURCES.renal;if(unit==='unita_non_rilevata')inferredUnit='mg/dL';}
    else if((id==='bilirubin_total'||/bilirubina totale/.test(name))&&unit==='mg/dl'){range=extRange('0,0 - 1,2',0,1.2);source=EXTERNAL_REFERENCE_SOURCES.liver;}
    else if((id==='ast'||/^(?:ast|ast got)$/.test(name))&&(unit==='u/l'||unit==='ul'||unit==='unita_non_rilevata')){range=sex==='f'?extRange('8 - 43',8,43):extRange('8 - 48',8,48);source=EXTERNAL_REFERENCE_SOURCES.liver;if(unit!=='u/l')inferredUnit='U/L';}
    else if((id==='alt'||/^(?:alt|alt gpt)$/.test(name))&&(unit==='u/l'||unit==='ul'||unit==='unita_non_rilevata')){range=extRange('7 - 55',7,55);source=EXTERNAL_REFERENCE_SOURCES.liver;if(unit!=='u/l')inferredUnit='U/L';}
    else if(id==='wbc'&&unit==='unita_non_rilevata'&&value>=0.1&&value<=100){range=extRange('3,4 - 9,6',3.4,9.6);source=EXTERNAL_REFERENCE_SOURCES.cbc;inferredUnit='10^9/L';}
    else if(id==='rbc'&&unit==='unita_non_rilevata'&&value>=1&&value<=8){range=sex==='f'?extRange('3,92 - 5,13',3.92,5.13):extRange('4,35 - 5,65',4.35,5.65);source=EXTERNAL_REFERENCE_SOURCES.cbc;inferredUnit='10^12/L';}
    else if(id==='platelets'&&unit==='unita_non_rilevata'&&value>=20&&value<=1000){range=extRange('150 - 400',150,400);source=EXTERNAL_REFERENCE_SOURCES.cbc;inferredUnit='10^9/L';}
    else if(id==='neutrophils_abs'&&unit==='unita_non_rilevata'&&value>=0&&value<=50){range=extRange('1,56 - 6,45',1.56,6.45);source=EXTERNAL_REFERENCE_SOURCES.cbc;inferredUnit='10^9/L';}
    else if(id==='hemoglobin'&&(unit==='g/dl'||unit==='unita_non_rilevata'||/^(?:i|gia)$/.test(unit))){range=sex==='f'?extRange('11,6 - 15,0',11.6,15):extRange('13,2 - 16,6',13.2,16.6);source=EXTERNAL_REFERENCE_SOURCES.cbc;if(unit!=='g/dl')inferredUnit='g/dL';}
    else if(id==='hematocrit'&&(unit==='%'||unit==='unita_non_rilevata')){range=sex==='f'?extRange('35,5 - 44,9',35.5,44.9):extRange('38,3 - 48,6',38.3,48.6);source=EXTERNAL_REFERENCE_SOURCES.cbc;if(unit==='unita_non_rilevata')inferredUnit='%';}
    else if(id==='mcv'&&(unit==='fl'||unit==='unita_non_rilevata')){range=extRange('80 - 100',80,100);source=EXTERNAL_REFERENCE_SOURCES.cbc;if(unit==='unita_non_rilevata')inferredUnit='fL';}
    else if(id==='mch'&&(unit==='pg'||unit==='unita_non_rilevata')){range=extRange('27 - 33',27,33);source=EXTERNAL_REFERENCE_SOURCES.cbc;if(unit==='unita_non_rilevata')inferredUnit='pg';}
    else if(id==='mchc'&&(unit==='g/dl'||unit==='unita_non_rilevata')){range=extRange('32 - 36',32,36);source=EXTERNAL_REFERENCE_SOURCES.cbc;if(unit==='unita_non_rilevata')inferredUnit='g/dL';}
    else if(id==='rdw'&&(unit==='%'||unit==='unita_non_rilevata')){range=extRange('11,5 - 14,5',11.5,14.5);source=EXTERNAL_REFERENCE_SOURCES.cbc;if(unit==='unita_non_rilevata')inferredUnit='%';}
    else if(id==='neutrophils_pct'&&unit==='%'){range=extRange('40 - 75',40,75);source=EXTERNAL_REFERENCE_SOURCES.differential;}
    else if(id==='lymphocytes_pct'&&unit==='%'){range=extRange('20 - 50',20,50);source=EXTERNAL_REFERENCE_SOURCES.differential;}
    else if(id==='monocytes_pct'&&unit==='%'){range=extRange('2 - 13',2,13);source=EXTERNAL_REFERENCE_SOURCES.differential;}
    else if(id==='eosinophils_pct'&&unit==='%'){range=extRange('≤7',null,null,'≤',7);source=EXTERNAL_REFERENCE_SOURCES.differential;}
    else if(id==='basophils_pct'&&unit==='%'){range=extRange('≤1,5',null,null,'≤',1.5);source=EXTERNAL_REFERENCE_SOURCES.differential;}
    else if(id==='sodium'&&(unit==='mmol/l'||unit==='unita_non_rilevata')){range=extRange('135 - 145',135,145);source=EXTERNAL_REFERENCE_SOURCES.electrolytes;if(unit==='unita_non_rilevata')inferredUnit='mmol/L';}
    else if(id==='potassium'&&(unit==='mmol/l'||unit==='unita_non_rilevata')){range=extRange('3,5 - 5,1',3.5,5.1);source=EXTERNAL_REFERENCE_SOURCES.electrolytes;if(unit==='unita_non_rilevata')inferredUnit='mmol/L';}
    else if((id==='nt_probnp'||id==='ntprobnp'||/nt pro[- ]?bnp/.test(name))&&(unit==='pg/ml'||unit==='unita_non_rilevata')){
      const adultAge=Number.isFinite(age)?age:65;let limit=540;
      if(sex==='m'){if(adultAge<40)limit=79;else if(adultAge<45)limit=72;else if(adultAge<55)limit=87;else if(adultAge<65)limit=88;}
      else if(sex==='f'){if(adultAge<40)limit=160;else if(adultAge<45)limit=162;else if(adultAge<55)limit=141;else if(adultAge<65)limit=226;}
      range=extRange(`≤${limit}`,null,null,'≤',limit);source=EXTERNAL_REFERENCE_SOURCES.ntprobnp;if(unit==='unita_non_rilevata')inferredUnit='pg/mL';
    }
    else if(/^(?:custom_chetoni|custom_bilirubina|custom_sangue|custom_glucosio)$/.test(id)&&unit==='mg/dl'&&value>=0&&isUrineContext(row,doc)){range=extRange('Assente',null,null,'≤',0);source=EXTERNAL_REFERENCE_SOURCES.urinalysis;}
    if(!range&&(id==='hba1c_percent'||/emoglobina glicata/.test(name))&&unit==='%'){range=extRange('4,0 - 5,6',4,5.6);source=EXTERNAL_REFERENCE_SOURCES.glucose;}
    if(!range&&(id==='albumin_urine'||/albumina urinaria/.test(name))&&unit==='mg/l'){range=extRange('<20',null,null,'<',20);source=EXTERNAL_REFERENCE_SOURCES.albuminuria;}
    if(!range&&(id==='chol_total'||/colesterolo totale/.test(name))&&(unit==='mg/dl'||unit==='unita_non_rilevata')){range=extRange('<200',null,null,'<',200);source=EXTERNAL_REFERENCE_SOURCES.lipids;if(unit==='unita_non_rilevata')inferredUnit='mg/dL';}
    if(!range&&(id==='ldl'||/colesterolo ldl/.test(name))&&(unit==='mg/dl'||unit==='unita_non_rilevata')){range=extRange('<100',null,null,'<',100);source=EXTERNAL_REFERENCE_SOURCES.lipids;if(unit==='unita_non_rilevata')inferredUnit='mg/dL';}
    if(!range&&(id==='psa_total'||/psa totale/.test(name))&&(unit==='ng/ml'||unit==='unita_non_rilevata')){range=extRange('<4,0',null,null,'<',4);source=EXTERNAL_REFERENCE_SOURCES.psa;if(unit==='unita_non_rilevata')inferredUnit='ng/mL';}
    if(!range&&(id==='prothrombin_activity'||/attivita protrombinica/.test(name))&&(unit==='%'||unit==='unita_non_rilevata')){range=extRange('70 - 130',70,130);source=EXTERNAL_REFERENCE_SOURCES.enzymes;if(unit==='unita_non_rilevata')inferredUnit='%';}
    if(!range&&(id==='lipase'||/^lipasi$/.test(name))&&(unit==='u/l'||unit==='unita_non_rilevata')){range=extRange('13 - 60',13,60);source=EXTERNAL_REFERENCE_SOURCES.enzymes;if(unit==='unita_non_rilevata')inferredUnit='U/L';}
    if(!range&&(id==='bicarbonate'||/bicarbonat/.test(name))&&(unit==='mmol/l'||unit==='unita_non_rilevata')){range=extRange('22 - 29',22,29);source=EXTERNAL_REFERENCE_SOURCES.chemistry;if(unit==='unita_non_rilevata')inferredUnit='mmol/L';}
    if(!range&&(id==='lactate'||/lattato|acido lattico/.test(name))&&(unit==='mmol/l'||unit==='unita_non_rilevata')){range=extRange('0,5 - 2,2',0.5,2.2);source=EXTERNAL_REFERENCE_SOURCES.chemistry;if(unit==='unita_non_rilevata')inferredUnit='mmol/L';}
    if(!range&&(id==='crp'||/proteina c reattiva/.test(name))&&unit==='mg/dl'){range=extRange('≤0,50',null,null,'≤',0.5);source=EXTERNAL_REFERENCE_SOURCES.chemistry;}
    if(!range&&(id==='urea'||/^urea$/.test(name))&&(unit==='mg/dl'||unit==='unita_non_rilevata')){range=extRange('15 - 43',15,43);source=EXTERNAL_REFERENCE_SOURCES.renal;if(unit==='unita_non_rilevata')inferredUnit='mg/dL';}
    if(!range&&(id==='calcium'||/^calcio$/.test(name))&&(unit==='mg/dl'||unit==='unita_non_rilevata')){range=extRange('8,6 - 10,2',8.6,10.2);source=EXTERNAL_REFERENCE_SOURCES.electrolytes;if(unit==='unita_non_rilevata')inferredUnit='mg/dL';}
    if(!range&&(id==='tsh'||/^tsh$/.test(name))&&/^(?:mui\/l|µui\/ml|miu\/l)$/.test(unit)){range=extRange('0,4 - 4,0',0.4,4);source=EXTERNAL_REFERENCE_SOURCES.thyroidTsh;}
    if(!range)return null;return{range,status:specialStatus||calculatedRowStatus(row,range),source:'external',label:'esterno',sourceInfo:source,ruleVersion:EXTERNAL_REFERENCE_VERSION,inferredUnit};
  }
  function externalQualitativeReferenceFor(row={}){
    const test=normalizedWords(row.test||row.parameterName||''),result=normalizedWords(row.result||row.rawValue||'');let reference='',status='da verificare',statusSource='external',referenceApplicability='';
    if(/^anti\s*hav\s*igg$/.test(test)&&/^(?:positivo|positiva|rilevato|rilevata|reattivo|reattiva)$/.test(result)){status='Immunità presente';statusSource='interpretive';referenceApplicability='not_required';}
    else if(/^anti\s*hav\s*igg$/.test(test)&&/^(?:negativo|negativa|non rilevato|non rilevata|non reattivo|non reattiva)$/.test(result)){status='Immunità non rilevata';statusSource='interpretive';referenceApplicability='not_required';}
    else if(/(?:campione\s+)?(?:emolizzato|emolisi|siero\/?plasma\s+emolizzato)/.test(result)){status='Non valutabile';statusSource='sample_quality';referenceApplicability='not_required';}
    else if(/helicobacter pylori/.test(test)&&/^(?:negativo|negativa|non rilevato|non rilevata)$/.test(result)){reference='Negativo';status='nei limiti';}
    else if(/^(?:anti hcv|anti hbc|anti hbe|hbsag|antigene hbs|virus epatite [bc].*pcr)$/.test(test)&&/^(?:negativo|negativa|non rilevato|non rilevata|non reattivo|non reattiva)$/.test(result)){reference=/pcr/.test(test)?'Non rilevato':'Negativo';status='nei limiti';}
    else if(/tracciato elettroforetico/.test(test)&&/assenza anomal/.test(result)){reference='Assenza anomalie';status='nei limiti';}
    else if(test==='aspetto'){reference='Limpido';status=/^(?:limpido|chiaro)$/.test(result)?'nei limiti':'alterato';}
    else if(test==='colore'){reference='Giallo paglierino';status=/^(?:giallo|paglierino|giallo paglierino|incolore)$/.test(result)?'nei limiti':'alterato';}
    else if(/^(?:chetoni|corpi chetonici|nitriti|bilirubina|glucosio|proteine|sangue|leucociti)$/.test(test)){reference=/leucociti/.test(test)?'Assenti':'Assente';status=/^(?:assente|assenti|negativo|negativa|non rilevato|non rilevata|0|0 0|0 00)$/.test(result)?'nei limiti':'alterato';}
    else if(/^(?:batteri|muco)$/.test(test)){reference='Assenti';status=/^(?:assente|assenti|negativo|negativa|non rilevato|non rilevata)$/.test(result)?'nei limiti':'alterato';}
    else if(test==='urobilinogeno'&&/^(?:assente|assenti|negativo|negativa|normale)$/.test(result)){reference='Normale';status='nei limiti';}
    else if(/virus epatite b genoma.*pcr/.test(test)){reference='Non rilevato';status=/non rilevato|negativo/.test(result)?'nei limiti':'alterato';}
    else if(/hbsag/.test(test)){reference='Negativo';status=/negativo|non reattivo/.test(result)?'nei limiti':'alterato';}
    if(!reference&&!referenceApplicability)return null;
    return{reference,status,statusSource,statusSourceLabel:statusSource==='external'?'esterno':'',referenceSource:statusSource==='interpretive'?EXTERNAL_REFERENCE_SOURCES.immunology:statusSource==='external'?EXTERNAL_REFERENCE_SOURCES.urinalysis:null,referenceRuleVersion:EXTERNAL_REFERENCE_VERSION,referenceApplicability,referenceNotApplicable:false};
  }
  function qualitativeStatusAgainstReference(row={}){
    const result=normalizedWords(row.result??row.rawValue??''),reference=normalizedWords(row.reference||'');
    if(!result||!reference)return'';
    const normal=/^(?:assente|assenti|assenza anomalie|negativo|negativa|non rilevato|non rilevata|normale|limpido|chiaro|giallo|paglierino|giallo paglierino|incolore|0|0 0|0 00)$/.test(result);
    const abnormal=/^(?:presente|presenti|positivo|positiva|rilevato|rilevata|opalescente|torbido|torbida)$/.test(result);
    if(/assent|negativ|non rilevat/.test(reference)){if(normal)return'nei limiti';if(abnormal)return'alterato';}
    if(/limpido|chiaro/.test(reference)){if(/limpido|chiaro/.test(result))return'nei limiti';if(/opalescente|torbido/.test(result))return'alterato';}
    if(/giallo|paglierino|incolore/.test(reference)&&/giallo|paglierino|incolore/.test(result))return'nei limiti';
    if(result===reference||normal&&/normale/.test(reference))return'nei limiti';
    return'';
  }
  function applyReferenceSourcesToDocuments(documents=[],profile={},options={}){
    const targetIds=options?.targetIds instanceof Set?options.targetIds:null;
    let changed=0;
    for(const doc of documents){
      if(targetIds&&!targetIds.has(doc.id))continue;
      for(const row of doc.labValues||[]){
        if(validRangeObject(row.range)){
          row.status=calculatedRowStatus(row,row.range);
          row.statusSource='report';
          row.statusSourceLabel='referto';
          row.referenceNotApplicable=false;
          row.referenceApplicability='applicable';
          delete row.unresolvedReason;
          delete row.referenceSource;
          delete row.referenceRuleVersion;
          if(row.unitSource==='external'||row.unitSource==='historical_same_facility')delete row.unitSource;
          continue;
        }
        row.status='da verificare';
        row.statusSource='report_missing_reference';
        row.statusSourceLabel='';
        row.referenceNotApplicable=false;
        row.referenceApplicability='unknown';
        row.unresolvedReason='Il referto non riporta un intervallo di riferimento utilizzabile: il Dossier non applica intervalli esterni o ricavati da altri documenti.';
        delete row.referenceSource;
        delete row.referenceRuleVersion;
        if(row.unitSource==='external'||row.unitSource==='historical_same_facility')delete row.unitSource;
        changed++;
      }
      for(const row of doc.qualitativeResults||[]){
        if(row.reference){
          const resolved=qualitativeStatusAgainstReference(row);
          row.status=resolved||'da verificare';
          row.statusSource='report';
          row.statusSourceLabel='referto';
          row.referenceNotApplicable=false;
          row.referenceApplicability='applicable';
          delete row.referenceSource;
          delete row.referenceRuleVersion;
          delete row.unresolvedReason;
          continue;
        }
        row.status='da verificare';
        row.statusSource='report_missing_reference';
        row.statusSourceLabel='';
        row.referenceNotApplicable=false;
        row.referenceApplicability='unknown';
        row.unresolvedReason='Il referto non riporta un riferimento qualitativo utilizzabile: il Dossier non interpreta autonomamente il risultato.';
        delete row.referenceSource;
        delete row.referenceRuleVersion;
        changed++;
      }
    }
    return changed;
  }

  function orderGraphParameters(parameters=[]) {
    const collator=new Intl.Collator('it-IT',{sensitivity:'base',numeric:true});
    return [...parameters].sort((a,b)=>{
      const da=graphParameterSortDescriptor(a),db=graphParameterSortDescriptor(b);
      const byKey=collator.compare(da.key,db.key);
      if(byKey)return byKey;
      const byGroup=da.group-db.group;
      if(byGroup)return byGroup;
      return collator.compare(String(a.name||a.id||''),String(b.name||b.id||''));
    });
  }
  function normalizeTimeValue(raw='') {
    const text=String(raw||'').trim().toLowerCase();
    const m=text.match(/\b([01]?\d|2[0-3])\s*[:.]\s*([0-5]\d)\b/)||text.match(/\b([01]?\d|2[0-3])\b/);
    if(!m)return Number.POSITIVE_INFINITY;
    const h=Number(m[1]),min=Number(m[2]||0);return h*60+min;
  }
  function formatTherapyTime(raw='') {
    const original=String(raw||'').trim();
    if(!original)return'';
    const lowered=original.toLocaleLowerCase('it-IT').replace(/\s+/g,' ').trim();
    const daypart=/^(?:al risveglio|prima di colazione|dopo colazione|prima di pranzo|dopo pranzo|prima di cena|dopo cena|prima di coricarsi|al bisogno|durante i pasti)$/i;
    if(daypart.test(lowered))return lowered.replace(/^./,c=>c.toUpperCase());
    const m=lowered.match(/^([01]?\d|2[0-3])\s*[:.]\s*([0-5]\d)$/);
    if(!m)return original;
    return `${String(Number(m[1])).padStart(2,'0')}:${m[2]}`;
  }
  function compareTherapies(a,b,mode='time-asc') {
    const ta=normalizeTimeValue(a.time||a.schedule),tb=normalizeTimeValue(b.time||b.schedule);
    const med=String(a.medication||'').localeCompare(String(b.medication||''),'it',{sensitivity:'base'});
    if(mode==='time-desc')return (tb-ta)||med;
    if(mode==='med-asc')return med||(ta-tb);
    if(mode==='med-desc')return -med||(ta-tb);
    if(mode==='insert')return String(a.createdAt||a.updatedAt||'').localeCompare(String(b.createdAt||b.updatedAt||''));
    return (ta-tb)||med;
  }
  function orderedTherapies(rows=state.therapies,mode=state.therapySort||currentProfilePreferences().therapySort){return [...rows].sort((a,b)=>compareTherapies(a,b,mode));}
  function diagnosisCompare(a,b,mode='date-desc') {
    const da=a.date||'0000-00-00',db=b.date||'0000-00-00';
    const name=String(a.name||'').localeCompare(String(b.name||''),'it',{sensitivity:'base'});
    if(mode==='date-asc')return da.localeCompare(db)||name;
    if(mode==='alpha-asc')return name||db.localeCompare(da);
    if(mode==='alpha-desc')return -name||db.localeCompare(da);
    if(mode==='category')return String(a.category||'').localeCompare(String(b.category||''),'it')||db.localeCompare(da);
    if(mode==='status')return String(a.status||'').localeCompare(String(b.status||''),'it')||db.localeCompare(da);
    if(mode==='specialization')return String(a.specialization||'').localeCompare(String(b.specialization||''),'it')||db.localeCompare(da);
    if(mode==='insert')return String(a.createdAt||a.updatedAt||'').localeCompare(String(b.createdAt||b.updatedAt||''));
    return db.localeCompare(da)||name;
  }

  const DIAGNOSIS_CATEGORIES=['Diagnosi riportata','Diagnosi confermata','Problema clinico','Condizione pregressa','Sospetto diagnostico','Controllo o follow-up','Evento terapeutico','Condizione risolta','Dato da verificare'];
  const DIAGNOSIS_STATUSES=['Riportata','Attiva','Sotto controllo','In evoluzione','Da monitorare','Sospetta','Pregressa','Risolta','Non rilevata','Da verificare'];
  function normalizeClinicalText(value=''){
    return String(value||'').toLocaleLowerCase('it-IT').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
  }
  function cleanDiagnosisName(value=''){
    return String(value||'').replace(/^[\s\-•:;.,\d)]+/,'').replace(/^(?:diagnosi|conclusioni?|problemi?\s+(?:attivi|principali)|quadro\s+clinico)\s*[:\-]\s*/i,'').replace(/\s+/g,' ').trim().replace(/[.;:,\-]+$/,'').trim();
  }
  function isNonDiagnosticDiagnosis(value=''){
    const n=normalizeClinicalText(value);
    if(!n||n.length<4)return true;
    const generic=/^(?:terapia medica|terapia farmacologica|terapie in atto|terapia consigliata|prescrizione|prescrizioni|procedura|procedure|esame|esami|referto|referti|diagnosi|conclusione|conclusioni|anamnesi|programma|indicazioni|raccomandazioni|firma|medico firmatario)$/;
    if(generic.test(n))return true;
    if(/^(?:tac|tc|rm|risonanza|ecg|elettrocardiogramma|ecografia|radiografia|rx|visita|controllo|follow up|intervento|trattamento|piano terapeutico)(?:\s+[a-z0-9]+){0,5}$/.test(n))return true;
    if(/^(?:si consiglia|si raccomanda|proseguire|continuare|eseguire|ripetere|programma terapeutico|indicazioni terapeutiche)\b/.test(n))return true;
    if((n.match(/[a-z]/g)||[]).length<4)return true;
    return false;
  }

  function diagnosisCanonicalKey(value=''){
    const name=cleanDiagnosisName(value);const n=normalizeClinicalText(name);
    if(!n||isNonDiagnosticDiagnosis(name))return'';
    if(/\bobesit/.test(n)){
      const grade3=/(?:classe|classi|tipo|tipi|grado|gradi)\s*(?:3|iii)\b/.test(n)||/\b(?:severa|grave|morbigena|morbida)\b/.test(n);
      if(/\bcentral/.test(n)&&grade3)return'obesita-centrale-classe-3';
      return'obesita';
    }
    if(/\b(?:tiroidit.*autoimmun\w*|hashimoto)\b/.test(n))return'tiroidite-autoimmune';
    if(/\b(?:steatos|masld|mash|steatoepatit|epatopat.*steatos)\w*/.test(n))return'malattia-epatica-steatosica-metabolica';
    if(/\bcirros/.test(n))return'cirrosi-epatica';
    const weak=new Set(['cronica','cronico','croniche','cronici','centrale','tipo','tipi','classe','classi','grado','gradi','stadio','stadi','malattia','patologia','condizione','sindrome','diagnosi','di','da','del','della','dei','delle','con']);
    const tokens=n.split(/\s+/).filter(Boolean).map(t=>t.replace(/(?:mente|zione|zioni)$/,'')).filter(t=>!weak.has(t)&&!/^(?:i{1,4}|[1-4])$/.test(t));
    return tokens.join('-')||n.replace(/\s+/g,'-');
  }

  function diagnosisDisplayName(key,rows=[]){
    const names=rows.map(x=>cleanDiagnosisName(x.name||'')).filter(Boolean);
    if(key==='obesita-centrale-classe-3')return'Obesità centrale di classe 3';
    if(key==='tiroidite-autoimmune')return names.some(x=>/ipotiroid/i.test(x))?'Tiroidite autoimmune con ipotiroidismo':'Tiroidite autoimmune';
    if(key==='malattia-epatica-steatosica-metabolica'){
      if(names.some(x=>/\bmash\b|steatoepatite/i.test(x)))return'MASH / epatopatia steatosica metabolica';
      return'Epatopatia steatosica metabolica (steatosi epatica)';
    }
    return names.sort((a,b)=>b.length-a.length)[0]||'Condizione clinica';
  }
  function inferDiagnosisCategory(row={}){
    if(DIAGNOSIS_CATEGORIES.includes(row.category))return row.category;
    const text=normalizeClinicalText(`${row.name||''} ${row.sourceQuote||''} ${row.notes||''}`);
    if(/\b(?:sospett|possibil|probabil|da escludere|compatibile con)\b/.test(text))return'Sospetto diagnostico';
    if(/\b(?:pregress|storia di|risolt|guarit)\b/.test(text))return'Condizione pregressa';
    if(/\b(?:controllo|follow up|monitoraggio|sorveglianza)\b/.test(text))return'Problema clinico';
    if(/\b(?:diagnosi(?: di)?|affetto da|si conferma|confermata|documentata|presenza di|evidenza di)\b/.test(text))return'Diagnosi riportata';
    return'Dato da verificare';
  }
  function inferDiagnosisStatus(row={},category=inferDiagnosisCategory(row)){
    const text=normalizeClinicalText(`${row.name||''} ${row.sourceQuote||''} ${row.notes||''}`);
    const stored=DIAGNOSIS_STATUSES.includes(row.status)?row.status:'';
    if(stored&&stored!=='Da verificare')return stored;
    if(category==='Sospetto diagnostico')return'Sospetta';
    if(category==='Condizione pregressa'||category==='Condizione risolta'||/\b(?:risolt|guarit|pregress)\b/.test(text))return category==='Condizione risolta'?'Risolta':'Pregressa';
    if(/\b(?:in evoluzione|progression|peggiorament)\b/.test(text))return'In evoluzione';
    if(/\b(?:sotto controllo|stabile|compensat)\b/.test(text))return'Sotto controllo';
    if(category==='Problema clinico'||/\b(?:follow up|monitoraggio|controllo|sorveglianza)\b/.test(text))return'Da monitorare';
    if(category==='Diagnosi riportata')return'Riportata';
    return stored||'Da verificare';
  }

  function diagnosisEvent(row={}){
    return {date:row.date||'',category:inferDiagnosisCategory(row),status:inferDiagnosisStatus(row),notes:String(row.notes||row.summary||row.sourceQuote||'').trim(),sourceQuote:String(row.sourceQuote||'').trim(),sourceDocumentId:row.sourceDocumentId||'',sourceTitle:row.sourceTitle||'',facility:row.facility||'',specialization:row.specialization||'',createdAt:row.createdAt||row.updatedAt||new Date().toISOString()};
  }
  function diagnosisEventKey(event={}){return normalizeClinicalText(`${event.date||''}|${event.category||''}|${event.status||''}|${event.notes||event.sourceQuote||''}|${event.sourceDocumentId||''}`);}
  const DIAGNOSIS_CATEGORY_PRIORITY={'Dato da verificare':0,'Controllo o follow-up':20,'Evento terapeutico':25,'Problema clinico':40,'Sospetto diagnostico':55,'Condizione pregressa':70,'Condizione risolta':80,'Diagnosi riportata':90,'Diagnosi confermata':100};
  const DIAGNOSIS_STATUS_PRIORITY={'Da verificare':0,'Da monitorare':25,'Sospetta':35,'Riportata':50,'Attiva':60,'Sotto controllo':70,'In evoluzione':75,'Pregressa':80,'Risolta':90,'Non rilevata':95};
  function diagnosisEventIdentity(event={}){
    const date=String(event.date||'').trim(),source=String(event.sourceDocumentId||'').trim()||normalizeClinicalText(event.sourceTitle||'');
    if(date||source)return `${date}|${source}`;
    return diagnosisEventKey(event);
  }
  function preferredDiagnosisValue(a='',b='',priority={}){
    const av=String(a||'').trim(),bv=String(b||'').trim();if(!av)return bv;if(!bv)return av;
    const ar=priority[av]??10,br=priority[bv]??10;return br>ar?bv:av;
  }
  function diagnosisNoteParts(value=''){
    const normalized=globalThis.HealthReport?.normalizeClinicalLineBreaks?HealthReport.normalizeClinicalLineBreaks(value):String(value||'');
    const out=[],seen=new Set();
    for(const block of String(normalized||'').split(/\n{1,2}/)){
      let text=String(block||'').replace(/\s+/g,' ').trim();if(!text)continue;
      if(/^(?:[\w .+()'-]+\.(?:pdf|jpg|jpeg|png)|documento originale\b)/i.test(text))continue;
      text=text.replace(/\b(?:sig\.?\/?ra|sig\.?|paziente)\s+[A-ZÀ-ÖØ-Ý][A-ZÀ-ÖØ-Ý' -]{2,}\s+data di nascita\s*[:\-]?\s*\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4}/gi,' ').replace(/\bdata di nascita\s*[:\-]?\s*\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4}/gi,' ').replace(/\bcodice fiscale\s*[:\-]?\s*[A-Z0-9]{11,16}\b/gi,' ').replace(/\s+/g,' ').trim();
      if(!text)continue;const key=normalizeClinicalText(text);if(!key||seen.has(key))continue;seen.add(key);out.push(text);
    }
    return out;
  }
  // R38: pulizia conservativa di sola presentazione per Diagnosi.
  // La Vista estesa mantiene il contenuto clinico/storico della R36 e rimuove
  // soltanto intestazioni OCR, etichette tecniche e frammenti amministrativi spuri.
  function diagnosisDisplayText(value=''){
    const normalized=globalThis.HealthReport?.normalizeClinicalLineBreaks?HealthReport.normalizeClinicalLineBreaks(value):String(value||'');
    const source=String(normalized||'').replace(/\r/g,'');
    if(!source.trim())return'';
    const out=[],seen=new Set();
    const headerRe=/\bdata\s+(?:(?:w[iIl1]{1,3}|v[iIl1]{1,3})\s+)?esame(?:\s+il)?\s+u\.?\s*m\.?\s*[|:]?\s*valore\b/gi;
    const standaloneHeaderRe=/^(?:data|esame|u\.?\s*m\.?|unit[aà]\s+di\s+misura|valore|intervallo|riferimento)(?:\s*[|;:]\s*(?:data|esame|u\.?\s*m\.?|unit[aà]\s+di\s+misura|valore|intervallo|riferimento)){1,}$/i;
    const technicalCodeRe=/\b\d{7,}\s*\((?:ambulatorio|prestazione|accesso|codice)\)\s*/gi;
    const therapyHeaderRe=/\bpasto[_\s]*consigliata\s*:\s*[^\n]{0,48}?\bfarmaco\b[^\n]{0,24}?\bvalore\b\s*[“\"']?/gi;
    const adminLabelRe=/\b(?:parametri\s+antropometrici\s+ed\s+esami|valori\s+desiderabili(?:\s+nel\s+diabete\s+mellito)?)\b\s*[:\-]?\s*/gi;
    for(const raw of source.split(/\n+/)){
      let line=String(raw||'').replace(/\s+/g,' ').trim();
      if(!line)continue;
      line=line.replace(headerRe,' ').replace(technicalCodeRe,' ').replace(therapyHeaderRe,' ').replace(adminLabelRe,' ').replace(/\bData\s+(?=\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4}\b)/gi,' ').replace(/\s+/g,' ').trim();
      if(!line||standaloneHeaderRe.test(line))continue;
      if(/^(?:codice\s+(?:ambulatorio|prestazione|accesso)\s*[:#-]?\s*\d+|pagina\s+\d+\s+di\s+\d+)$/i.test(line))continue;
      // I dump OCR lineari vengono resi leggibili senza eliminare dati clinici:
      // ogni nuova data apre una riga, ma valori, terapie e follow-up restano presenti.
      const pieces=line.replace(/\s+(?=\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4}\b)/g,'\n').split(/\n+/);
      for(let piece of pieces){
        piece=piece.replace(/\s+/g,' ').trim();
        if(!piece||standaloneHeaderRe.test(piece))continue;
        const key=normalizeClinicalText(piece);if(!key||seen.has(key))continue;
        seen.add(key);out.push(piece);
      }
    }
    return out.join('\n').trim();
  }

  function mergeDiagnosisNotes(...values){
    const parts=[],keys=[];for(const value of values){for(const part of diagnosisNoteParts(value)){const key=normalizeClinicalText(part);if(!key)continue;let redundant=false;for(let i=0;i<keys.length;i++){if(keys[i]===key||keys[i].includes(key)){redundant=true;break;}if(key.includes(keys[i])){parts[i]=part;keys[i]=key;redundant=true;break;}}if(!redundant){parts.push(part);keys.push(key);}}}return parts.join('\n');
  }
  function mergeDiagnosisEvents(events=[]){
    const map=new Map(),order=[];
    for(const raw of events||[]){const event=diagnosisEvent(raw),identity=diagnosisEventIdentity(event);if(!identity)continue;if(!map.has(identity)){map.set(identity,{...event,notes:mergeDiagnosisNotes(event.notes,event.sourceQuote)});order.push(identity);continue;}const current=map.get(identity);current.category=preferredDiagnosisValue(current.category,event.category,DIAGNOSIS_CATEGORY_PRIORITY);current.status=preferredDiagnosisValue(current.status,event.status,DIAGNOSIS_STATUS_PRIORITY);current.notes=mergeDiagnosisNotes(current.notes,current.sourceQuote,event.notes,event.sourceQuote);current.sourceQuote=current.sourceQuote||event.sourceQuote||'';current.sourceDocumentId=current.sourceDocumentId||event.sourceDocumentId||'';current.sourceTitle=current.sourceTitle||event.sourceTitle||'';current.facility=current.facility||event.facility||'';current.specialization=current.specialization||event.specialization||'';current.createdAt=[current.createdAt,event.createdAt].filter(Boolean).sort()[0]||current.createdAt||event.createdAt;map.set(identity,current);}
    return order.map(key=>map.get(key)).sort((a,b)=>String(a.date||'0000-00-00').localeCompare(String(b.date||'0000-00-00'))||String(a.createdAt||'').localeCompare(String(b.createdAt||'')));
  }
  function isClinicallyRelevantDiagnosis(row={}){
    const status=inferDiagnosisStatus(row);const category=inferDiagnosisCategory(row);const text=normalizeClinicalText(`${row.name||''} ${row.notes||''} ${row.sourceQuote||''}`);
    if(['Risolta','Non rilevata','Pregressa'].includes(status))return false;
    if(!['Diagnosi riportata','Diagnosi confermata','Problema clinico','Sospetto diagnostico'].includes(category))return false;
    if(['Riportata','Attiva','Sotto controllo','In evoluzione','Da monitorare'].includes(status))return true;
    return /\b(?:diabet|tiroid|obes|steatos|masld|mash|epatopat|cirros|ipertens|renale|cardiopat|neuropat)\w*/.test(text);
  }
  function normalizedDiagnosis(row={}){
    const name=cleanDiagnosisName(row.name||'');if(isNonDiagnosticDiagnosis(name))return null;
    const category=inferDiagnosisCategory(row),status=inferDiagnosisStatus(row,category),canonicalKey=row.forceDistinct?`${diagnosisCanonicalKey(name)}::${row.id||uid('distinct')}`:diagnosisCanonicalKey(name);
    if(!canonicalKey)return null;
    const history=mergeDiagnosisEvents([...(Array.isArray(row.history)?row.history:[]),diagnosisEvent({...row,name,category,status})]);
    return {...row,name,category,status,canonicalKey,history,mainProblem:row.mainProblem===true||String(row.mainProblem)==='true'};
  }
  function mergeDiagnosisRecords(rows=[]){
    const groups=new Map(),discarded=[];
    for(const raw of rows){const row=normalizedDiagnosis(raw);if(!row){if(raw?.id)discarded.push(raw.id);continue;}const key=row.canonicalKey;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
    const merged=[];const removed=[];
    for(const [key,group] of groups){
      group.sort((a,b)=>String(a.createdAt||a.updatedAt||'').localeCompare(String(b.createdAt||b.updatedAt||'')));
      const base={...group[0]};const events=mergeDiagnosisEvents(group.flatMap(row=>row.history||[]));
      const latest=events.at(-1)||diagnosisEvent(group.at(-1));
      const specificCategory=[...events].reverse().find(x=>x.category&&x.category!=='Dato da verificare')?.category||latest.category||base.category;
      const specificStatus=[...events].reverse().find(x=>x.status&&x.status!=='Da verificare')?.status||latest.status||base.status;
      const combined={...base,name:diagnosisDisplayName(key,group),canonicalKey:key,date:latest.date||base.date||'',category:specificCategory,status:specificStatus,notes:latest.notes||base.notes||'',summary:latest.notes||base.summary||'',sourceDocumentId:latest.sourceDocumentId||base.sourceDocumentId||'',sourceTitle:latest.sourceTitle||base.sourceTitle||'',facility:latest.facility||base.facility||'',specialization:latest.specialization||base.specialization||'',history:events,mainProblem:group.some(x=>x.mainProblem),updatedAt:group.map(x=>x.updatedAt||x.createdAt||'').sort().at(-1)||base.updatedAt||base.createdAt||new Date().toISOString()};
      merged.push(combined);for(const row of group.slice(1))if(row.id)removed.push(row.id);
    }
    if(!merged.some(x=>x.mainProblem)){for(const row of merged){if(isClinicallyRelevantDiagnosis(row)){row.mainProblem=true;row.mainProblemSuggested=true;}}}
    return {merged,removed:[...new Set([...removed,...discarded])],discarded};
  }
  async function repairDiagnosesForProfile(profileId,rows=null){
    const source=rows||await DossierDB.byProfile('diagnoses',profileId);const result=mergeDiagnosisRecords(source);
    const originalById=new Map(source.filter(x=>x?.id).map(x=>[x.id,x]));
    const changed=result.removed.length>0||result.merged.some(row=>{const previous=originalById.get(row.id);return !previous||JSON.stringify(previous)!==JSON.stringify(row);});
    if(changed){const backupKey=`diagnosisMigrationBackupTest36:${profileId}`;const existingBackup=await DossierDB.get('settings',backupKey);if(!existingBackup)await DossierDB.put('settings',{key:backupKey,value:{createdAt:new Date().toISOString(),reason:'Consolidamento canonico diagnosi TEST 36',rows:source}} ,{audit:false,sync:false});}
    for(const id of result.removed)await DossierDB.del('diagnoses',id,{details:{event:'diagnosis-duplicate-merged'}});
    for(const row of result.merged){row.profileId=profileId;row.id=row.id||uid('diagnosis');const previous=originalById.get(row.id);if(!previous||JSON.stringify(previous)!==JSON.stringify(row))await DossierDB.put('diagnoses',row,{details:{event:'diagnosis-normalized'}});}
    return result.merged;
  }
  function findEquivalentDiagnosis(candidate,rows=state.diagnoses){const key=diagnosisCanonicalKey(candidate?.name||'');return key?rows.find(x=>!x.forceDistinct&&diagnosisCanonicalKey(x.name||'')===key):null;}
  async function linkDiagnosisUpdate(existing,incoming){
    const current=normalizedDiagnosis(existing),next=normalizedDiagnosis({...incoming,id:existing.id,profileId:existing.profileId,createdAt:existing.createdAt});
    if(!current||!next)return null;const {merged}=mergeDiagnosisRecords([{...current,history:current.history||[]},{...next,history:[diagnosisEvent(incoming)]}]);const row={...merged[0],id:existing.id,profileId:existing.profileId,createdAt:existing.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString(),mainProblem:existing.mainProblem||incoming.mainProblem||merged[0].mainProblem};await DossierDB.put('diagnoses',row);return row;
  }
  function diagnosisHistoryRows(rows=[]){
    const out=[],canonical=mergeDiagnosisRecords(rows).merged;for(const diagnosis of canonical){const events=(diagnosis.history?.length?diagnosis.history:[diagnosisEvent(diagnosis)]);for(const event of events)out.push({...event,name:diagnosis.name,canonicalKey:diagnosis.canonicalKey,mainProblem:diagnosis.mainProblem});}return out.sort((a,b)=>String(b.date||'0000-00-00').localeCompare(String(a.date||'0000-00-00'))||String(a.name||'').localeCompare(String(b.name||''),'it'));
  }
  function multilineHtml(value=''){const normalized=globalThis.HealthReport?.normalizeClinicalLineBreaks?HealthReport.normalizeClinicalLineBreaks(value):String(value||'');return esc(normalized).replace(/\r?\n/g,'<br>');}
  function therapyColgroup(rows=[]){
    if(globalThis.HealthReport?.therapyColgroup){try{return HealthReport.therapyColgroup(rows);}catch(_){}}
    return '<colgroup><col style="width:12%"><col style="width:23%"><col style="width:22%"><col style="width:15%"><col style="width:28%"></colgroup>';
  }
  function therapyUiColgroup(rows=[]){
    return '<colgroup><col style="width:8%"><col style="width:17%"><col style="width:17%"><col style="width:11%"><col style="width:22%"><col style="width:8%"><col style="width:17%"></colgroup>';
  }
  function combineMultiline(...values){const out=[];for(const value of values){const text=String(value||'').trim();if(text&&!out.includes(text))out.push(text);}return out.join('\n');}
  function measurementDateTime(row={}) { return `${row.date||'9999-12-31'}T${row.time||'23:59'}`; }
  const MEASUREMENT_LABELS={weight:'Peso corporeo',height:'Altezza',neck:'Circonferenza collo',chest:'Circonferenza petto / torace',waist:'Circonferenza vita',abdomen:'Circonferenza addome',hips:'Circonferenza fianchi',arm_right:'Braccio destro',arm_left:'Braccio sinistro',thigh_right:'Coscia destra',thigh_left:'Coscia sinistra',calf_right:'Polpaccio destro',calf_left:'Polpaccio sinistro',wrist_right:'Polso destro',wrist_left:'Polso sinistro',ankle_right:'Caviglia destra',ankle_left:'Caviglia sinistra',blood_pressure:'Pressione arteriosa',spo2:'Saturazione ossigeno',glucose:'Glicemia domestica',heart_rate:'Frequenza cardiaca'};
  const BODY_TYPES=['neck','chest','waist','abdomen','hips','arm_right','arm_left','thigh_right','thigh_left','calf_right','calf_left','wrist_right','wrist_left','ankle_right','ankle_left'];
  const MONITOR_GRAPH_TYPES=['weight','blood_pressure','spo2','glucose','heart_rate'];
  function measurementLabel(type=''){return MEASUREMENT_LABELS[type]||String(type||'Parametro personalizzato');}
  function measurementsOf(type){return state.measurements.filter(x=>x.type===type).sort((a,b)=>measurementDateTime(a).localeCompare(measurementDateTime(b)));}
  function measurementTrustedForDerivedClinicalUse(row={}){return !row.sourceClass||row.sourceClass==='clinical-document'||row.sourceClass==='medical-device';}
  function trustedMeasurementsOf(type){return measurementsOf(type).filter(measurementTrustedForDerivedClinicalUse);}
  function latestMeasurement(type){return measurementsOf(type).at(-1)||null;}
  function latestNumeric(type,field='value'){const row=latestMeasurement(type);const n=Number(row?.[field]);return Number.isFinite(n)?n:null;}
  function diffLabel(value,unit=''){const n=Number(value);if(!Number.isFinite(n))return '<span class="measurement-delta neutral">Prima rilevazione</span>';const cls=n<0?'negative':n>0?'positive':'neutral';return `<span class="measurement-delta ${cls}">${n>0?'+':''}${HealthCharts.fmt(n)} ${esc(unit)}</span>`;}
  function bmiFromWeightHeight(weightKg,heightCm){const w=Number(weightKg),h=Number(heightCm)/100;if(!Number.isFinite(w)||!Number.isFinite(h)||w<=0||h<=0)return null;const bmi=w/(h*h);return Number.isFinite(bmi)?bmi:null;}
  function formatBmi(value){const n=Number(value);return Number.isFinite(n)?new Intl.NumberFormat('it-IT',{minimumFractionDigits:1,maximumFractionDigits:1}).format(n):'—';}
  function weightBmiLabel(weightKg,heightCm){const bmi=bmiFromWeightHeight(weightKg,heightCm);return `${HealthCharts.fmt(weightKg)} kg${bmi===null?'':` / BMI ${formatBmi(bmi)}`}`;}
  function journeyGoalDistance(jm){if(!jm)return null;const direction=Math.sign(Number(jm.target)-Number(jm.start))||1;const signed=(Number(jm.target)-Number(jm.current))*direction;if(!Number.isFinite(signed))return null;return {status:Math.abs(signed)<0.05?'reached':signed>0?'missing':'passed',kg:Math.abs(signed)};}
  function ageOn(date=today()){const p=activeProfile();if(!p?.birthDate)return null;const d=new Date(`${date}T12:00:00`),b=new Date(`${p.birthDate}T12:00:00`);let age=d.getFullYear()-b.getFullYear();if(d.getMonth()<b.getMonth()||(d.getMonth()===b.getMonth()&&d.getDate()<b.getDate()))age--;return age>=0?age:null;}
  function activeJourney(){return state.weightJourneys.find(x=>x.status==='active')||state.weightJourneys[0]||null;}
  function journeyMetrics(journey=activeJourney()){
    if(!journey)return null;const weights=trustedMeasurementsOf('weight');const current=weights.at(-1)?.value??journey.startWeight;const start=Number(journey.startWeight),target=Number(journey.targetWeight),cur=Number(current);const startDate=journey.startDate,targetDate=journey.targetDate;
    const totalDelta=target-start,done=cur-start;const progress=totalDelta===0?100:Math.max(0,Math.min(100,(done/totalDelta)*100));
    const daysTotal=Math.max(1,Math.round((new Date(`${targetDate}T12:00:00`)-new Date(`${startDate}T12:00:00`))/86400000));const daysElapsed=Math.max(0,Math.round((new Date(`${today()}T12:00:00`)-new Date(`${startDate}T12:00:00`))/86400000));const daysRemaining=Math.max(0,Math.round((new Date(`${targetDate}T12:00:00`)-new Date(`${today()}T12:00:00`))/86400000));const expected=start+totalDelta*Math.min(1,Math.max(0,daysElapsed/daysTotal));
    return {start,target,current:cur,totalDelta,done,remaining:target-cur,progress,daysTotal,daysElapsed,daysRemaining,expected,deviation:cur-expected,weeklyRequired:Math.abs(totalDelta)/(daysTotal/7)};
  }
  function weightJourneyProjection(rows=[],journey=null){
    if(!journey)return null;
    const dayMs=86400000;
    const atNoon=iso=>{const ms=new Date(`${iso}T12:00:00`).getTime();return Number.isFinite(ms)?ms:null;};
    const pointMs=row=>{if(!row?.date)return null;const t=String(row.time||'12:00').slice(0,5);const ms=new Date(`${row.date}T${t}:00`).getTime();return Number.isFinite(ms)?ms:null;};
    const startMs=atNoon(journey.startDate),targetMs=atNoon(journey.targetDate),startWeight=Number(journey.startWeight),targetWeight=Number(journey.targetWeight);
    if(!Number.isFinite(startMs)||!Number.isFinite(targetMs)||!Number.isFinite(startWeight)||!Number.isFinite(targetWeight))return null;
    const actual=(rows||[]).map(row=>({row,ms:pointMs(row),value:Number(row.value)})).filter(p=>Number.isFinite(p.ms)&&Number.isFinite(p.value)&&p.ms>=startMs).sort((a,b)=>a.ms-b.ms);
    const latest=actual.at(-1)||{ms:startMs,value:startWeight,row:null};
    const direction=Math.sign(targetWeight-latest.value);
    let slope=null,predictedMs=null,trendMethod='';
    if(Math.abs(targetWeight-latest.value)<0.05){
      predictedMs=latest.ms;trendMethod='target-reached';
    }else{
      // Trend robusto sulle rilevazioni recenti: la mediana delle pendenze a
      // coppie (Theil-Sen semplificato) impedisce che UNA sola nuova pesata
      // faccia saltare la data stimata di molti mesi. Il progresso netto
      // dall'inizio resta soltanto il fallback quando i punti sono troppo pochi.
      const recent=actual.slice(-8),slopes=[];
      if(recent.length>=4){
        for(let i=0;i<recent.length;i++)for(let j=i+1;j<recent.length;j++){
          const days=(recent[j].ms-recent[i].ms)/dayMs;if(days>=1)slopes.push((recent[j].value-recent[i].value)/days);
        }
        slopes.sort((a,b)=>a-b);const mid=Math.floor(slopes.length/2);const robust=slopes.length?(slopes.length%2?slopes[mid]:(slopes[mid-1]+slopes[mid])/2):null;
        if(Number.isFinite(robust)&&Math.abs(robust)>=0.003&&((direction<0&&robust<0)||(direction>0&&robust>0))){slope=robust;trendMethod='recent-robust';}
      }
      if(!Number.isFinite(slope)){
        const elapsed=Math.max(0,(latest.ms-startMs)/dayMs);
        const netSlope=elapsed>=2?(latest.value-startWeight)/elapsed:null;
        if(Number.isFinite(netSlope)&&Math.abs(netSlope)>=0.003&&((direction<0&&netSlope<0)||(direction>0&&netSlope>0))){slope=netSlope;trendMethod='net-progress-fallback';}
      }
      if(Number.isFinite(slope)){
        const days=(targetWeight-latest.value)/slope;
        const plannedDays=Math.max(1,(targetMs-startMs)/dayMs);
        // Una data troppo remota non è informativa: viene mostrata come non
        // stimabile invece di deformare il grafico e generare falsi ritardi.
        const maxForecastDays=Math.max(365,plannedDays*3);
        if(Number.isFinite(days)&&days>=0&&days<=maxForecastDays)predictedMs=latest.ms+days*dayMs;
      }
    }
    const plannedDays=Math.max(1,(targetMs-startMs)/dayMs);
    const plannedSlope=(targetWeight-startWeight)/plannedDays;
    const elapsedLatest=Math.max(0,Math.min(plannedDays,(latest.ms-startMs)/dayMs));
    const expectedAtLatest=startWeight+plannedSlope*elapsedLatest;
    const pathDeviationKg=latest.value-expectedAtLatest;
    // Scostamento ATTUALE dal percorso: quanti giorni di traiettoria teorica
    // separano il peso reale dall'atteso alla data dell'ultima pesata.
    // È intenzionalmente distinto dalla data di arrivo stimata dal trend.
    const pathDelayDays=Number.isFinite(plannedSlope)&&Math.abs(plannedSlope)>1e-9?Math.round(-pathDeviationKg/plannedSlope):0;
    const forecastDeltaDays=Number.isFinite(predictedMs)?Math.round((predictedMs-targetMs)/dayMs):null;
    return {actual,startMs,targetMs,startWeight,targetWeight,slope,predictedMs,pathDelayDays,pathDeviationKg,expectedAtLatest,plannedSlope,forecastDeltaDays,dayMs,trendMethod};
  }
  function weightJourneyChartHtml(rows=[],journey=null){
    const model=weightJourneyProjection(rows,journey);if(!model)return '';
    const {actual,startMs,targetMs,startWeight,targetWeight,predictedMs,pathDelayDays,forecastDeltaDays,dayMs,slope}=model;
    const latest=actual.at(-1)||{ms:startMs,value:startWeight};
    // L'asse X contiene sempre sia la scadenza ufficiale sia la data stimata
    // reale. Se il trend prevede un ritardo, il grafico si estende fino a quel
    // giorno invece di troncare la proiezione alla data obiettivo.
    const xMin=Math.min(startMs,actual[0]?.ms??startMs);let xMax=Math.max(targetMs,latest.ms,Number.isFinite(predictedMs)?predictedMs:0);if(xMax<=xMin)xMax=xMin+dayMs;
    const weightAxis=HealthCharts.timeTicks(xMin,xMax,16);const plotMinX=weightAxis.domainMin??xMin,plotMaxX=weightAxis.domainMax??xMax;
    const projectionEndMs=Number.isFinite(predictedMs)?predictedMs:null;
    const projectionEndValue=Number.isFinite(projectionEndMs)&&Number.isFinite(slope)?targetWeight:null;
    const yValues=[startWeight,targetWeight,...actual.map(p=>p.value),...(Number.isFinite(projectionEndValue)?[projectionEndValue]:[])];let yMin=Math.min(...yValues),yMax=Math.max(...yValues);const span=Math.max(2,yMax-yMin);const pad=Math.max(1,span*0.08);yMin=Math.max(0,Math.floor((yMin-pad)*2)/2);yMax=Math.ceil((yMax+pad)*2)/2;
    const W=1080,H=445,L=68,R=28,T=28,B=112;const plotW=W-L-R,plotH=H-T-B;const x=ms=>L+((ms-plotMinX)/(plotMaxX-plotMinX))*plotW;const y=v=>T+((yMax-v)/(yMax-yMin))*plotH;
    const yTicks=6;let grid='';for(let i=0;i<yTicks;i++){const v=yMax-(i/(yTicks-1))*(yMax-yMin),yy=y(v);grid+=`<line x1="${L}" y1="${yy.toFixed(1)}" x2="${W-R}" y2="${yy.toFixed(1)}" class="weight-chart-grid"/><text x="${L-12}" y="${(yy+4).toFixed(1)}" text-anchor="end" class="weight-chart-axis">${HealthCharts.fmt(v)}</text>`;}
    let xLabels='';for(const ms of weightAxis.ticks){const xx=x(ms),label=HealthCharts.timeTickLabel(ms,weightAxis.mode);xLabels+=`<line x1="${xx.toFixed(1)}" y1="${T}" x2="${xx.toFixed(1)}" y2="${H-B}" class="weight-chart-grid vertical"/><text transform="translate(${(xx-2).toFixed(1)} ${H-B+18}) rotate(-40)" text-anchor="end" class="weight-chart-axis weight-chart-date-label">${esc(label)}</text>`;}
    const actualPoints=actual.map(p=>`${x(p.ms).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');const actualLine=actual.length>1?`<polyline points="${actualPoints}" class="weight-chart-actual-line"/>`:'';
    const circles=actual.map(p=>`<circle cx="${x(p.ms).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="5" class="weight-chart-point"><title>${esc(formatDate(p.row.date))}${p.row.time?` ${esc(p.row.time)}`:''}: ${HealthCharts.fmt(p.value)} kg</title></circle>`).join('');
    const goalLine=`<line x1="${x(startMs).toFixed(1)}" y1="${y(startWeight).toFixed(1)}" x2="${x(targetMs).toFixed(1)}" y2="${y(targetWeight).toFixed(1)}" class="weight-chart-goal-line"><title>Percorso teorico: ${HealthCharts.fmt(startWeight)} kg → ${HealthCharts.fmt(targetWeight)} kg entro ${esc(formatDate(journey.targetDate))}</title></line>`;
    const predictedIso=Number.isFinite(predictedMs)?new Date(predictedMs).toISOString().slice(0,10):'';
    const projection=Number.isFinite(projectionEndMs)&&Number.isFinite(projectionEndValue)?`<line x1="${x(latest.ms).toFixed(1)}" y1="${y(latest.value).toFixed(1)}" x2="${x(projectionEndMs).toFixed(1)}" y2="${y(projectionEndValue).toFixed(1)}" class="weight-chart-projection-line"><title>Proiezione reale: peso obiettivo stimato al ${esc(formatDate(predictedIso))}</title></line><circle cx="${x(predictedMs).toFixed(1)}" cy="${y(targetWeight).toFixed(1)}" r="5" class="weight-chart-projection-end"><title>Data stimata: ${esc(formatDate(predictedIso))}</title></circle>`:'';
    const targetMarker=`<circle cx="${x(targetMs).toFixed(1)}" cy="${y(targetWeight).toFixed(1)}" r="5" class="weight-chart-goal-end"><title>Data obiettivo: ${esc(formatDate(journey.targetDate))}</title></circle>`;
    // Le due date terminali sono riportate esplicitamente, anche quando cadono
    // nello stesso mese e i tick mensili non sarebbero sufficienti a distinguerle.
    const targetX=x(targetMs),forecastX=Number.isFinite(predictedMs)?x(predictedMs):null;
    const safeEndpointLabel=(xx,text,kind,yy)=>{const edge=118;let anchor='middle',tx=xx;if(xx>W-R-edge){anchor='end';tx=Math.min(xx,W-R-6);}else if(xx<L+edge){anchor='start';tx=Math.max(xx,L+6);}return `<text x="${tx.toFixed(1)}" y="${yy}" text-anchor="${anchor}" class="weight-chart-end-label ${kind}">${text}</text>`;};
    const endpointLabelY=H-18;
    const endpointLabels=`<line x1="${targetX.toFixed(1)}" y1="${H-B}" x2="${targetX.toFixed(1)}" y2="${H-B+8}" class="weight-chart-end-tick goal"/>${safeEndpointLabel(targetX,`Obiettivo ${esc(formatDate(journey.targetDate))}`,'goal',endpointLabelY)}${Number.isFinite(forecastX)?`<line x1="${forecastX.toFixed(1)}" y1="${H-B}" x2="${forecastX.toFixed(1)}" y2="${H-B+8}" class="weight-chart-end-tick projection"/>${safeEndpointLabel(forecastX,`Stima ${esc(formatDate(predictedIso))}`,'projection',endpointLabelY)}`:''}`;
    const dayWord=n=>Math.abs(n)===1?'giorno':'giorni';
    const status=!Number.isFinite(forecastDeltaDays)?'Data stimata non disponibile':forecastDeltaDays===0?'In linea con la data obiettivo':forecastDeltaDays>0?`In ritardo di ${Math.abs(forecastDeltaDays)} ${dayWord(forecastDeltaDays)}`:`In anticipo di ${Math.abs(forecastDeltaDays)} ${dayWord(forecastDeltaDays)}`;
    const statusClass=!Number.isFinite(forecastDeltaDays)?'neutral':forecastDeltaDays>0?'late':forecastDeltaDays<0?'ahead':'ontrack';
    return `<section class="weight-trajectory"><div class="weight-trajectory-head"><div><h3>Grafico del percorso</h3><p class="kpi-note">Si aggiorna automaticamente con ogni pesata registrata.</p></div></div><div class="weight-chart-summary"><div><small>Data obiettivo</small><strong>${esc(formatDate(journey.targetDate))}</strong></div><div><small>Data stimata dal trend</small><strong>${predictedIso?esc(formatDate(predictedIso)):'Non stimabile'}</strong></div><div class="${statusClass}"><small>Scostamento previsto rispetto all'obiettivo</small><strong>${esc(status)}</strong></div></div><div class="weight-chart-svg-wrap"><svg class="weight-chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Grafico del percorso peso"><text x="${L}" y="16" class="weight-chart-axis-label">Peso (kg)</text>${grid}${xLabels}${goalLine}${projection}${actualLine}${circles}${targetMarker}${endpointLabels}</svg></div><div class="weight-chart-legend weight-chart-legend-bottom"><span><i class="actual"></i>Pesate</span><span><i class="goal"></i>Percorso previsto</span><span><i class="projection"></i>Proiezione reale</span></div></section>`;
  }

  function calorieEstimate(journey=activeJourney()){
    const m=journeyMetrics(journey);if(!journey||!m)return null;const age=ageOn(journey.startDate||today());const height=Number(journey.heightCm||latestNumeric('height'));const weight=Number(m.current);const sex=journey.sex||activeProfile()?.biologicalSex||'';const factor=Number({sedentary:1.2,light:1.375,moderate:1.55,high:1.725,very_high:1.9}[journey.activityLevel]||1.2);
    if(!Number.isFinite(age)||!Number.isFinite(height)||!Number.isFinite(weight)||!['male','female'].includes(sex))return {missing:true};
    const bmr=10*weight+6.25*height-5*age+(sex==='male'?5:-161);const maintenance=bmr*factor;const direction=Math.sign(journey.targetWeight-weight);const dailyChange=Math.abs(Number(journey.targetWeight)-weight)*7700/Math.max(1,m.daysRemaining||m.daysTotal);const targetCalories=maintenance+direction*dailyChange;const unsafeLoss=direction<0&&(m.weeklyRequired>1||targetCalories<1200);return {bmr,maintenance,targetCalories,dailyChange,unsafeLoss,age,height,weight,factor};
  }
  function displayMeasurementValue(row={}){
    if(row.type==='blood_pressure')return `${row.systolic||'-'}/${row.diastolic||'-'} mmHg${row.heartRate?` · ${row.heartRate} bpm`:''}`;
    if(row.type==='spo2')return `${row.value??'-'}%${row.heartRate?` · ${row.heartRate} bpm`:''}`;
    if(row.type==='glucose')return `${row.value??'-'} ${row.unit||'mg/dL'}${row.measurementContext?` · ${row.measurementContext}`:''}`;
    return `${row.value??'-'} ${row.unit||''}`.trim();
  }
  function validHexColor(value){return /^#[0-9a-f]{6}$/i.test(String(value||''));}
  function mixHex(a,b,weight=0.5){
    const parse=x=>[1,3,5].map(i=>parseInt(x.slice(i,i+2),16));const aa=parse(a),bb=parse(b);
    const w=Math.max(0,Math.min(1,Number(weight)));
    return '#'+aa.map((x,i)=>Math.round(x*(1-w)+bb[i]*w).toString(16).padStart(2,'0')).join('');
  }
  function profilePalette(base,fallback){
    const primary=validHexColor(base)?String(base).toLowerCase():fallback.primary;
    return {primary,primaryDark:mixHex(primary,'#000000',0.28),primarySoft:mixHex(primary,'#ffffff',0.84),sidebar:mixHex(primary,'#000000',0.42),line:mixHex(primary,'#ffffff',0.76),bg:mixHex(primary,'#ffffff',0.94),surface2:mixHex(primary,'#ffffff',0.89),chart2:mixHex(primary,'#ffffff',0.32)};
  }
  function applyPreferences() {
    const root=document.documentElement;const g={...DEFAULT_GLOBAL_PREFS,...state.globalPreferences};const p=currentProfilePreferences();const fallback=PALETTES[g.palette]||PALETTES.teal;const pal=profilePalette(p.profileColor,fallback);
    for(const [k,v] of Object.entries({'--primary':pal.primary,'--primary-dark':pal.primaryDark,'--primary-soft':pal.primarySoft,'--sidebar':pal.sidebar,'--line':pal.line,'--bg':pal.bg,'--surface-2':pal.surface2,'--chart-secondary':pal.chart2,'--profile-accent':pal.primary}))root.style.setProperty(k,v);
    root.dataset.theme='light';root.dataset.textScale='large';root.dataset.density='comfortable';
    const meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.content=pal.primary;
  }
  function calendarCurrentUserId(){return String(globalThis.DossierSecurity?.currentUser?.()?.id||'').trim();}
  function calendarGoogleEmailSettingKey(userId=calendarCurrentUserId()){return userId?`googleCalendarEmail:${userId}`:'';}
  async function loadCalendarUserPreferences(){
    const userId=calendarCurrentUserId();state.googleCalendarEmail='';if(!userId)return;
    const key=calendarGoogleEmailSettingKey(userId);const saved=await DossierDB.get('settings',key);
    let email=String(saved?.value?.email||saved?.value||'').trim();
    if(!email){
      const legacy=String(state.globalPreferences?.googleCalendarEmail||'').trim();
      if(legacy){
        const ownerRow=await DossierDB.get('settings','googleCalendarEmailLegacyOwnerV1');const owner=String(ownerRow?.value||'').trim();
        if(!owner||owner===userId){
          email=legacy;
          await DossierDB.put('settings',{key,value:{email,updatedAt:new Date().toISOString()}},{audit:false,sync:true});
          if(!owner)await DossierDB.put('settings',{key:'googleCalendarEmailLegacyOwnerV1',value:userId},{audit:false,sync:true});
        }
      }
    }
    state.googleCalendarEmail=email;
  }
  async function saveCalendarUserEmail(email=''){
    const userId=calendarCurrentUserId();if(!userId)return;
    const value=String(email||'').trim();state.googleCalendarEmail=value;
    await DossierDB.put('settings',{key:calendarGoogleEmailSettingKey(userId),value:{email:value,updatedAt:new Date().toISOString()}},{audit:true,sync:true});
  }
  async function loadPreferences() {
    const saved=await DossierDB.get('settings','globalPreferences');state.globalPreferences={...DEFAULT_GLOBAL_PREFS,...(saved?.value||{})};
    await loadCalendarUserPreferences();
    state.profilePreferences={...DEFAULT_PROFILE_PREFS,...(activeProfile()?.preferences||{})};state.therapySort=state.profilePreferences.therapySort;state.diagnosisSort=state.profilePreferences.diagnosisSort;localStorage.setItem('backupFrequency',state.globalPreferences.backupFrequency||'weekly');applyPreferences();
  }
  async function saveGlobalPreferences(value){state.globalPreferences={...DEFAULT_GLOBAL_PREFS,...value};await DossierDB.put('settings',{key:'globalPreferences',value:state.globalPreferences});applyPreferences();}
  async function saveProfilePreferences(value){const p=activeProfile();if(!p)return;const preferences={...DEFAULT_PROFILE_PREFS,...(p.preferences||{}),...value};const updated={...p,preferences,updatedAt:new Date().toISOString()};await DossierDB.put('profiles',updated);const i=state.profiles.findIndex(x=>x.id===p.id);if(i>=0)state.profiles[i]=updated;state.profilePreferences=preferences;state.therapySort=preferences.therapySort;state.diagnosisSort=preferences.diagnosisSort;applyPreferences();}
  async function refreshStorageEstimate(){try{if(navigator.storage?.estimate){const x=await navigator.storage.estimate();state.storageEstimate={usage:Number(x.usage||0),quota:Number(x.quota||0),free:Math.max(0,Number(x.quota||0)-Number(x.usage||0))};}}catch{}return state.storageEstimate;}
  async function ensureStorageFor(bytes=0,label='operazione'){const est=await refreshStorageEstimate();if(!est?.quota)return true;const required=Math.ceil(Number(bytes||0)*2.5+50*1024*1024);if(est.free<required){toast(`Spazio insufficiente per ${label}: richiesti circa ${formatBytes(required)}, disponibili ${formatBytes(est.free)}.`);return false;}return true;}
  function isValidClinicalDate(value,{allowFuture=false}={}) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value||'')) return false;
    const dt=new Date(`${value}T12:00:00`);
    if (Number.isNaN(dt.getTime()) || dt.toISOString().slice(0,10)!==value) return false;
    if (value<MIN_CLINICAL_DATE) return false;
    if (!allowFuture && value>today()) return false;
    return true;
  }
  function fileToDataUrl(blob) { return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.readAsDataURL(blob);}); }
  async function printAssetDataUrl(asset){
    if(!asset)return'';
    if(typeof asset==='string')return /^(?:data:image\/|blob:)/i.test(asset)?asset:'';
    if(asset instanceof Blob)return fileToDataUrl(asset);
    if(asset?.arrayBuffer){try{return fileToDataUrl(new Blob([await asset.arrayBuffer()],{type:asset.type||'application/octet-stream'}));}catch(_){return'';}}
    return'';
  }
  async function waitForPrintAssets(root,timeoutMs=5000){
    const images=[...root.querySelectorAll('img')];if(!images.length)return;
    await Promise.race([Promise.all(images.map(img=>img.complete&&img.naturalWidth?Promise.resolve():new Promise(resolve=>{const done=()=>resolve();img.addEventListener('load',done,{once:true});img.addEventListener('error',done,{once:true});}))),new Promise(resolve=>setTimeout(resolve,timeoutMs))]);
  }
  function mimeFromName(name=''){const ext=String(name||'').toLowerCase().split('.').pop();return ({pdf:'application/pdf',jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',gif:'image/gif',tif:'image/tiff',tiff:'image/tiff',txt:'text/plain;charset=utf-8'}[ext]||'application/octet-stream');}
  function typedOriginalBlob(blob,name=''){if(!blob)return new Blob([],{type:mimeFromName(name)});const expected=mimeFromName(name);if(blob.type&&blob.type!=='application/octet-stream')return blob;return new Blob([blob],{type:expected});}
  function normalizePageFingerprints(doc) { return doc.pageFingerprints?.length?doc.pageFingerprints:HealthExtractors.buildPageFingerprints([],doc.extractedText||'',doc.clinicalDate||''); }
  function makeObjectUrl(blob){if(!blob)return'';const u=URL.createObjectURL(blob);state.objectUrls.push(u);return u;}
  function clearObjectUrls(){for(const u of state.objectUrls)URL.revokeObjectURL(u);state.objectUrls=[];}
  function profileInitials(profile={}){return `${profile.firstName?.[0]||''}${profile.lastName?.[0]||''}`.toUpperCase();}
  function profileAvatarHtml(profile={},className='avatar'){const url=profile.avatarBlob?makeObjectUrl(profile.avatarBlob):'';return url?`<div class="${className} avatar-photo"><img src="${url}" alt="Foto di ${esc(profile.firstName||'profilo')}" style="object-position:${Number(profile.avatarPositionX??50)}% ${Number(profile.avatarPositionY??50)}%;transform:scale(${Number(profile.avatarZoom||1)})"></div>`:`<div class="${className}">${esc(profileInitials(profile))}</div>`;}
  function doctorContact(profile=activeProfile()){if(!profile)return{name:'',phone:'',email:''};const normalized=HealthExtractors.normalizeText(profile.primaryDoctor||'');const linked=state.doctors.find(d=>d.primary===true)||state.doctors.find(d=>normalized&&HealthExtractors.normalizeText(d.name||'')===normalized);return{name:profile.primaryDoctor||linked?.name||'',phone:profile.primaryDoctorPhone||linked?.phone||'',email:profile.primaryDoctorEmail||linked?.email||''};}
  function isAdministratorProfile(profile=activeProfile()){const relation=String(profile?.relation||'').trim();return relation==='Amministratore'||relation==='Me stesso';}
  function profileRoleLabel(profile=activeProfile()){return isAdministratorProfile(profile)?'Stato':'Ruolo';}
  function profileRoleValue(profile=activeProfile()){if(isAdministratorProfile(profile))return 'Amministratore';return String(profile?.relation||'').trim()||'Non indicato';}
  function profileEmailLink(value=''){const label=String(value||'').trim();return label?`<a href="mailto:${esc(label)}">${esc(label)}</a>`:'';}
  function telLink(value=''){const label=String(value||'').trim();if(!label)return'';const dial=label.replace(/[^+\d]/g,'');return `<a href="tel:${esc(dial)}">${esc(label)}</a>`;}
  function profileEmergencyValue(value=''){const label=String(value||'').trim();if(!label)return 'Non inserito';return /^[+\d][\d\s().\/-]{4,}$/.test(label)?telLink(label):esc(label);}
  function profileEmergencyParts(profile=activeProfile()){const p=profile||{},explicitName=String(p.emergencyContactName||'').trim(),explicitPhone=String(p.emergencyContactPhone||'').trim(),legacy=String(p.emergencyContact||'').trim();if(explicitName||explicitPhone)return{name:explicitName,phone:explicitPhone,notes:String(p.emergencyContactNotes||'').trim()};const match=legacy.match(/([+]?\d[\d\s().\/-]{4,})$/);if(match)return{name:legacy.slice(0,match.index).trim(),phone:String(match[1]||'').trim(),notes:String(p.emergencyContactNotes||'').trim()};return{name:legacy,phone:'',notes:String(p.emergencyContactNotes||'').trim()};}
  function profileAddressHtml(profile=activeProfile()){const p=profile||{},address=String(p.address||'').trim(),postal=String(p.postalCode||'').trim(),city=String(p.city||'').trim(),province=String(p.province||'').trim(),place=[postal,city].filter(Boolean).join(' '),second=province?`${place}${place?' ':''}(${province})`:place;if(!address&&!second)return 'Non inserito';return `${address?`<div>${esc(address)}</div>`:''}${second?`<div>${esc(second)}</div>`:''}`;}
  function profileContactsPanelHtml(profile=activeProfile()){const p=profile||{},doctor=doctorContact(p),emergency=profileEmergencyParts(p);return `<aside class="profile-contacts-panel"><div class="profile-contact-group profile-emergency-group"><h3>Contatto di emergenza</h3><dl class="profile-contacts-list"><dt>Nominativo</dt><dd>${esc(emergency.name||'Non inserito')}</dd><dt>Telefono</dt><dd>${emergency.phone?telLink(emergency.phone):'Non inserito'}</dd><dt>Note</dt><dd class="profile-contact-note">${esc(emergency.notes||'Nessuna')}</dd></dl></div><div class="profile-contact-separator"></div><div class="profile-contact-group profile-doctor-group"><dl class="profile-contacts-list"><dt>Medico di base</dt><dd>${esc(doctor.name||'Non inserito')}</dd><dt>Telefono medico</dt><dd>${doctor.phone?telLink(doctor.phone):'Non inserito'}</dd><dt>Email medico</dt><dd>${doctor.email?profileEmailLink(doctor.email):'Non inserita'}</dd><dt>Note</dt><dd class="profile-contact-note">${esc(p.primaryDoctorNotes||'Nessuna')}</dd></dl></div></aside>`;}
  function profileEmergencyDashboardHtml(profile=activeProfile()){
    const p=profile||{},doctor=doctorContact(p),emergency=profileEmergencyParts(p);
    const relation=String(p.emergencyContactRelation||'').trim();
    const blood=String(p.bloodGroup||'').trim();
    const allergies=String(p.emergencyAllergies||'').trim();
    const criticalTherapies=String(p.emergencyCriticalTherapies||'').trim();
    const conditions=String(p.emergencyRelevantConditions||'').trim();
    const contactLabel=[emergency.name,relation].filter(Boolean).join(' · ')||'Non inserito';
    return `<section class="card dashboard-v13-panel dashboard-v13-emergency-panel emergency-priority-panel">
      <div class="dashboard-v13-panel-head emergency-priority-head"><div class="dashboard-v13-title-icon emergency">${uiIconSvg('shield')}</div><div><h3>Emergenza</h3><p>Dati da vedere subito in caso di necessità</p></div><span class="emergency-priority-badge">PRIORITÀ</span><button class="btn btn-light btn-small" data-action="edit-emergency" ${canEditActive()?'':'disabled'}>Modifica</button></div>
      <div class="dashboard-v13-emergency-grid emergency-priority-grid">
        <div class="dashboard-v13-emergency-item emergency-critical"><span class="dashboard-v13-iconbox rose">${uiIconSvg('phone')}</span><div><small>Contatto di emergenza</small><strong>${esc(contactLabel)}</strong>${emergency.phone?`<span>${telLink(emergency.phone)}</span>`:'<span>Telefono non inserito</span>'}</div></div>
        <div class="dashboard-v13-emergency-item emergency-critical"><span class="dashboard-v13-iconbox warn">${uiIconSvg('diagnosis')}</span><div><small>Allergie rilevanti</small><strong>${esc(allergies||'Nessuna indicata')}</strong></div></div>
        <div class="dashboard-v13-emergency-item emergency-critical"><span class="dashboard-v13-iconbox violet medication-semantic-icon">${uiIconSvg('therapy')}</span><div><small>Terapie critiche</small><strong>${esc(criticalTherapies||'Nessuna indicata')}</strong></div></div>
        <div class="dashboard-v13-emergency-item"><span class="dashboard-v13-iconbox red">${uiIconSvg('droplet')}</span><div><small>Gruppo sanguigno</small><strong>${esc(blood||'Non indicato')}</strong></div></div>
        <div class="dashboard-v13-emergency-item"><span class="dashboard-v13-iconbox blue">${uiIconSvg('shield')}</span><div><small>Condizioni / dispositivi</small><strong>${esc(conditions||'Nessuna indicata')}</strong></div></div>
        <div class="dashboard-v13-emergency-item"><span class="dashboard-v13-iconbox teal">${uiIconSvg('profile')}</span><div><small>Medico di base</small><strong>${esc(doctor.name||'Non inserito')}</strong>${doctor.phone?`<span>${telLink(doctor.phone)}</span>`:''}</div></div>
      </div>
      <div class="emergency-offline-actions"><button class="btn btn-light btn-small" data-action="export-emergency-offline">Esporta scheda offline</button></div>
    </section>`;
  }


  function exportEmergencyOffline(){
    const p=activeProfile();if(!p)return toast('Seleziona prima un profilo');
    const doctor=doctorContact(p),emergency=profileEmergencyParts(p),relation=String(p.emergencyContactRelation||'').trim();
    const contactLabel=[emergency.name,relation].filter(Boolean).join(' · ')||'Non inserito';
    const html=`<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Scheda emergenza</title><style>body{font-family:Arial,sans-serif;margin:24px;color:#172033}article{max-width:900px;margin:auto;border:3px solid #b91c1c;border-radius:16px;padding:20px}h1{margin:0 0 4px;color:#991b1b}h2{font-size:16px;margin:0 0 6px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:18px}.box{border:1px solid #fecaca;border-radius:12px;padding:12px;background:#fff7f7}.box p{margin:0;white-space:pre-wrap}.note{margin-top:18px;font-size:12px;color:#64748b}@media(max-width:650px){.grid{grid-template-columns:1fr}}</style></head><body><article><h1>EMERGENZA SANITARIA</h1><p><strong>${esc(`${p.firstName||''} ${p.lastName||''}`.trim()||'Profilo sanitario')}</strong>${p.birthDate?` · ${formatDate(p.birthDate)}`:''}</p><div class="grid"><section class="box"><h2>Contatto di emergenza</h2><p>${esc(contactLabel)}${emergency.phone?`\n${esc(emergency.phone)}`:''}</p></section><section class="box"><h2>Allergie rilevanti</h2><p>${esc(String(p.emergencyAllergies||'').trim()||'Nessuna indicata')}</p></section><section class="box"><h2>Terapie critiche</h2><p>${esc(String(p.emergencyCriticalTherapies||'').trim()||'Nessuna indicata')}</p></section><section class="box"><h2>Gruppo sanguigno</h2><p>${esc(String(p.bloodGroup||'').trim()||'Non indicato')}</p></section><section class="box"><h2>Condizioni / dispositivi</h2><p>${esc(String(p.emergencyRelevantConditions||'').trim()||'Nessuna indicata')}</p></section><section class="box"><h2>Medico di base</h2><p>${esc(doctor.name||'Non inserito')}${doctor.phone?`\n${esc(doctor.phone)}`:''}</p></section></div><p class="note">Scheda offline generata dai dati già presenti nel pannello Emergenza di Clinica Digitale.</p></article></body></html>`;
    const blob=new Blob([html],{type:'text/html;charset=utf-8'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`scheda_emergenza_${String(p.firstName||'profilo').replace(/[^a-z0-9]+/gi,'_')}.html`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  }

  function canEditActive(){return !globalThis.DossierSecurity||DossierSecurity.canEditProfile(state.activeProfileId);}
  function requireEdit(){try{return !globalThis.DossierSecurity||DossierSecurity.assertCanEdit(state.activeProfileId);}catch(error){toast(error.message);return false;}}

  let staticEventsBound=false;
  let backgroundStartupPromise=null;
  let folderSyncPromise=null;
  let backupExportPromise=null;
  const nextUiTurn=()=>new Promise(resolve=>setTimeout(resolve,0));
  function setMaintenanceStatus(text,color='#f59e0b'){
    const label=$('#appStatusText'),dot=$('#appStatusDot');if(label)label.textContent=text;if(dot)dot.style.background=color;
  }
  function openInitialCloudProgress(){
    let overlay=document.querySelector('#initialCloudMainProgress');if(overlay)overlay.remove();
    overlay=document.createElement('div');overlay.id='initialCloudMainProgress';overlay.className='cloud-main-progress-overlay';overlay.innerHTML=`<div class="cloud-main-progress-card"><div class="cloud-main-progress-head"><img src="assets/icon-64.png" alt=""><div><strong>Ripristino archivio cloud</strong><span id="initialCloudProgressPhase">Preparazione…</span></div><b id="initialCloudProgressPercent">0%</b></div><div class="cloud-main-progress-track"><span id="initialCloudProgressBar" style="width:0%"></span></div><p id="initialCloudProgressDetail">Avvio del ripristino.</p></div>`;document.body.appendChild(overlay);
    const update=(pct,phase,detail='')=>{const v=Math.max(0,Math.min(100,Math.round(Number(pct)||0)));overlay.querySelector('#initialCloudProgressPercent').textContent=`${v}%`;overlay.querySelector('#initialCloudProgressBar').style.width=`${v}%`;overlay.querySelector('#initialCloudProgressPhase').textContent=phase||'Ripristino';overlay.querySelector('#initialCloudProgressDetail').textContent=detail||'';};
    return {update,close:()=>overlay.remove()};
  }
  async function loadShell(){
    const allProfiles=await DossierDB.getAll('profiles');
    state.profiles=globalThis.DossierSecurity?DossierSecurity.filterProfiles(allProfiles):allProfiles;
    state.profiles=globalThis.DossierSecurity?.sortProfiles?DossierSecurity.sortProfiles(state.profiles):state.profiles.sort((a,b)=>(a.lastName||'').localeCompare(b.lastName||'')||(a.firstName||'').localeCompare(b.firstName||''));
    const activeKey=`activeProfileId:${DossierSecurity.currentUser()?.id||'anonymous'}`;const saved=await DossierDB.get('settings',activeKey);
    state.activeProfileId=state.profiles.some(p=>p.id===saved?.value)?saved.value:state.profiles[0]?.id||null;
    state.trashItems=[];
  }
  async function applyLicensePlanScope(){
    if(!licensePlanReady||licensePlanApplyBusy)return;
    licensePlanApplyBusy=true;
    try{
      if(globalThis.DossierSecurity?.planAllowsCurrentAccount&&!DossierSecurity.planAllowsCurrentAccount()){
        licensePlanReady=false;
        await DossierSecurity.lock('Il piano corrente consente l’accesso soltanto all’account amministratore. Gli altri account restano conservati e torneranno disponibili con il piano FULL.');
        return;
      }
      await loadShell();
      if(state.activeProfileId)await loadProfileData({deferCalendarMaintenance:true});
      await loadPreferences();
      render();
    }finally{licensePlanApplyBusy=false;}
  }

  async function runPostLoginStartup({migratedProfiles=0}={}){
    if(backgroundStartupPromise)return backgroundStartupPromise;
    backgroundStartupPromise=(async()=>{
      try{
        setMaintenanceStatus('Accesso eseguito · caricamento del profilo','#f59e0b');
        state.trashItems=await DossierDB.getAll('trash');await loadProfileData();await loadPreferences();render();
        setMaintenanceStatus('Archivio pronto','#62d49e');
        if(migratedProfiles)toast(`${migratedProfiles} anagrafica/e importata/e automaticamente dalla versione precedente`);
        if(!state.test24BackgroundScheduled){
          state.test24BackgroundScheduled=true;
          setTimeout(()=>{void refreshStorageEstimate().catch(()=>{});},3500);
          setTimeout(()=>{void restoreArchiveHandle().catch(()=>{});},5000);
          setTimeout(()=>{void OCRService.health(true).then(health=>{state.ocrHealth=health;const ready=health.ocrAvailable||health.nativePdfAvailable||health.ocrDeferred;setMaintenanceStatus(ready?'Archivio pronto · motore locale disponibile':'Archivio pronto · motore non disponibile',ready?'#62d49e':'#f59e0b');if(state.activeView==='preferences')renderView();}).catch(()=>{});},8000);
        }
        checkScheduledBackup();
      }catch(error){console.error('Avvio non completato',error);setMaintenanceStatus('Archivio aperto · controllo da riprovare','#f59e0b');}
      finally{backgroundStartupPromise=null;}
    })();
    return backgroundStartupPromise;
  }
  async function completePendingInitialCloudRestore(){
    const file=globalThis.__DOSSIER_PENDING_INITIAL_BACKUP__;
    const cloud=globalThis.__DOSSIER_PENDING_INITIAL_CLOUD__;
    if(!file||!cloud)return false;
    globalThis.__DOSSIER_PENDING_INITIAL_BACKUP__=null;
    globalThis.__DOSSIER_PENDING_INITIAL_CLOUD__=null;
    setMaintenanceStatus('Ripristino archivio cloud in corso…','#f59e0b');
    const progress=openInitialCloudProgress();progress.update(1,'Verifica archivio','Preparazione dei dati da ripristinare.');
    try{
      const ok=await restoreZip(file,{mode:'full',replaceAll:true,importUsers:false,skipSafetyBackup:true,skipSafetyDownload:true,skipRefresh:true,onProgress:info=>{const pct=2+(Number(info?.percent||0)*0.82);progress.update(pct,info?.phase||'Ripristino dati',info?.detail||'');}});
      if(!ok)throw new Error('Ripristino dei dati dall’archivio cloud non completato');
      progress.update(86,'Collegamento archivio cloud','Associazione del nuovo dispositivo all’archivio.');
      const uid=DossierSecurity.currentUser()?.id||'';
      const recovery=String(cloud.recoveryKey||'');
      if(!uid||!recovery)throw new Error('Impossibile associare la chiave dell’archivio al dispositivo');
      const restoredCloud=await DossierDB.get('cloudSettings','main').catch(()=>null);
      const processed=Array.isArray(restoredCloud?.processedEventIds)?restoredCloud.processedEventIds.slice(-50000):[];
      const row={key:'main',enabled:true,provider:cloud.provider,remoteName:cloud.remoteName,basePath:cloud.basePath||'Dossier Sanitario Locale',archiveId:cloud.archiveId,displayName:cloud.displayName||restoredCloud?.displayName||'Archivio familiare',createdAt:cloud.createdAt||restoredCloud?.createdAt||new Date().toISOString(),lastSyncAt:restoredCloud?.lastSyncAt||'',lastSnapshotAt:cloud.snapshotModTime||restoredCloud?.lastSnapshotAt||'',lastSnapshotName:cloud.snapshotName||restoredCloud?.lastSnapshotName||'',processedEventIds:processed,wrappedKeys:{[uid]:await DossierSecurity.protectSecret(recovery)},syncMode:'event-log-v1'};
      if(DossierSecurity.protectDeviceSecret)row.deviceWrappedKey=await DossierSecurity.protectDeviceSecret(recovery);
      progress.update(91,'Configurazione sincronizzazione','Salvataggio della configurazione cloud sul dispositivo.');
      await DossierDB.clear('syncQueue');
      await DossierDB.put('cloudSettings',row,{audit:false,sync:false});
      await DossierSecurity.registerCurrentDevice({sync:true});
      localStorage.setItem('dossierCloudProvider',cloud.provider||'mega');
      if(globalThis.DossierCloud)await DossierCloud.loadSettings();
      progress.update(100,'Ripristino completato','Archivio cloud collegato e pronto per la sincronizzazione.');
      await new Promise(r=>setTimeout(r,350));progress.close();setMaintenanceStatus('Archivio cloud ripristinato e collegato','#62d49e');return true;
    }catch(error){progress.update(0,'Ripristino non completato',error.message);await new Promise(r=>setTimeout(r,700));progress.close();throw error;}
  }
  async function init(){
    const started=performance.now();await DossierDB.open();const cloudRestored=await completePendingInitialCloudRestore();const migratedProfiles=await migrateLegacyProfilesIfNeeded();bindStaticEvents();licensePlanReady=false;if(globalThis.DossierFeatures)await DossierFeatures.refresh({force:false});if(globalThis.DossierSecurity?.planAllowsCurrentAccount&&!DossierSecurity.planAllowsCurrentAccount()){await DossierSecurity.lock('Il piano corrente consente l’accesso soltanto all’account amministratore. Gli altri account restano conservati e torneranno disponibili con il piano FULL.');return false;}await loadShell();licensePlanReady=true;await loadPreferences();render();
    // Inizializza il cloud subito dopo il render: la UI è già visibile, ma il
    // contesto di sincronizzazione non resta disattivato per diversi secondi.
    if(globalThis.DossierCloud&&globalThis.DossierFeatures?.has?.('cloudSync')){try{await DossierCloud.init();if(cloudRestored)setMaintenanceStatus('Archivio cloud collegato · sincronizzazione programmata','#f59e0b');}catch(error){console.warn('Inizializzazione cloud da riprovare:',error);}}
    setMaintenanceStatus(cloudRestored?'Archivio cloud collegato · sincronizzazione avviata':'Accesso eseguito · caricamento archivio in background',cloudRestored?'#62d49e':'#f59e0b');state.loginStartupMs=Math.round(performance.now()-started);
    setTimeout(()=>{void runPostLoginStartup({migratedProfiles});},0);
    const pending=globalThis.__DOSSIER_PENDING_INITIAL_BACKUP__;
    if(pending&&!globalThis.__DOSSIER_PENDING_INITIAL_CLOUD__){globalThis.__DOSSIER_PENDING_INITIAL_BACKUP__=null;setTimeout(()=>{void prepareBackupUse(pending);},900);}
    if(localStorage.getItem('dossierOfferBackupSetupAfterFirstLogin')==='1'){
      localStorage.removeItem('dossierOfferBackupSetupAfterFirstLogin');
      setTimeout(()=>{
        if(confirm('Vuoi configurare ora il backup o l’archivio cloud del Dossier?')){
          state.activeView='backup';selectNav('backup');render();
        }
      },700);
    }
    return true;
  }

  async function migrateLegacyProfilesIfNeeded() {
    try {
      const current=await DossierDB.getAll('profiles');
      if (current.length || !indexedDB.databases) return 0;
      const databases=await indexedDB.databases();
      if (!databases.some(d=>d.name==='dossierSanitarioLocaleV1')) return 0;
      const legacy=await new Promise((resolve,reject)=>{
        const request=indexedDB.open('dossierSanitarioLocaleV1');
        request.onerror=()=>reject(request.error);
        request.onsuccess=()=>{
          const db=request.result;
          if (!db.objectStoreNames.contains('profiles')) {db.close();resolve([]);return;}
          const tx=db.transaction('profiles','readonly');
          const get=tx.objectStore('profiles').getAll();
          get.onsuccess=()=>{const rows=get.result||[];db.close();resolve(rows);};
          get.onerror=()=>{db.close();reject(get.error);};
        };
      });
      let imported=0;
      for (const profile of legacy) {
        if (!profile?.id || !profile?.firstName || !profile?.lastName) continue;
        await DossierDB.put('profiles',{...profile,updatedAt:new Date().toISOString(),migratedFrom:'V1'});
        imported++;
      }
      return imported;
    } catch { return 0; }
  }

  function bindStaticEvents() {
    if(staticEventsBound)return;staticEventsBound=true;
    $('#addProfileBtn').addEventListener('click', () => {if(!globalThis.DossierFeatures?.has?.('multiProfile'))return toast(DossierFeatures.message('multiProfile'));const u=DossierSecurity.currentUser?.();if(!DossierSecurity.isAdministrator()&&u?.linkedProfileId)return toast('Solo un amministratore può creare altri profili');openProfileModal();});
    $('#emptyAddProfileBtn').addEventListener('click', () => {if(state.profiles.length&& !globalThis.DossierFeatures?.has?.('multiProfile'))return toast(DossierFeatures.message('multiProfile'));const u=DossierSecurity.currentUser?.();if(!DossierSecurity.isAdministrator()&&u?.linkedProfileId)return toast('Solo un amministratore può creare altri profili');openProfileModal();});
    $('#addDocumentBtn').addEventListener('click', () => {if(!DossierSecurity.canEditProfile(state.activeProfileId)||!DossierSecurity.canUse('importDocuments'))return toast('Autorizzazione al caricamento necessaria');openImportModal();});
    $('#exportPdfBtn').addEventListener('click',()=>{if(!DossierSecurity.canUse('exportPdf'))return toast('Esportazione PDF non autorizzata');exportPdf();});
    $('#lockNowBtn')?.addEventListener('click',()=>{if(confirm('Vuoi effettuare il logout?'))DossierSecurity.lock('Logout');});
    $('#globalSearchBtn')?.addEventListener('click',()=>{state.activeView='search-dossier';selectNav('search-dossier');render();});
    const openProfilePage=()=>{if(!activeProfile())return toast('Seleziona prima un profilo');state.activeView='profile';selectNav('profile');render();if(window.innerWidth<=820)$('#sidebar').classList.remove('open');};
    $('#profileDataPageBtn')?.addEventListener('click',openProfilePage);
    $('#profileDataAvatarBtn')?.addEventListener('click',openProfilePage);
    $('#sidebarColorShortcut')?.addEventListener('click',()=>{state.activeView='preferences';selectNav('preferences');render();});
    bindDeveloperModeTrigger();
    updateDeveloperModeBadge();
    window.addEventListener('dossier-security-changed',()=>{if(state.activeView==='preferences')renderPreferences();void syncAuthorizedCalendarToGoogle({silent:true,force:true}).catch(()=>{});});
    window.addEventListener('dossier-developer-mode',()=>{updateDeveloperModeBadge();if(state.activeView==='preferences')renderPreferences();});
    window.addEventListener('dossier-unlocked',()=>{void (async()=>{licensePlanReady=false;if(globalThis.DossierFeatures)await DossierFeatures.refresh({force:false});if(globalThis.DossierSecurity?.planAllowsCurrentAccount&&!DossierSecurity.planAllowsCurrentAccount()){await DossierSecurity.lock('Il piano corrente consente l’accesso soltanto all’account amministratore. Gli altri account restano conservati e torneranno disponibili con il piano FULL.');return;}await loadShell();licensePlanReady=true;await loadPreferences();render();setMaintenanceStatus('Accesso eseguito · caricamento archivio in background','#f59e0b');void runPostLoginStartup();})();});
    window.addEventListener('dossier-license-changed',()=>{const plan=globalThis.DossierFeatures?.current?.()?.plan||'FREE';document.body.dataset.licensePlan=plan;if(!licensePlanReady)return;void applyLicensePlanScope();});
    window.addEventListener('dossier-locked',()=>{licensePlanReady=false;developerVersionClicks=0;developerVersionLastClick=0;updateDeveloperModeBadge();state.profiles=[];state.activeProfileId=null;state.documents=[];state.doctors=[];state.therapies=[];state.exemptions=[];state.diagnoses=[];state.measurements=[];state.weightJourneys=[];state.calendarEvents=[];state.calendarSuggestions=[];state.calendarLocalStatus={ok:false,supported:false};renderProfileSelect();});
    $('#profileSelect').addEventListener('change', async e => {
      state.activeProfileId = e.target.value || null;
      state.graphParameterId='';state.graphUnitKey='';state.graphSelectedRowKey='';
      const activeKey=`activeProfileId:${DossierSecurity.currentUser()?.id||'anonymous'}`;await DossierDB.put('settings', {key:activeKey, value:state.activeProfileId});
      await loadProfileData({deferCalendarMaintenance:true}); await loadPreferences(); render();
      void runDeferredProfileCalendarMaintenance(state.activeProfileId);
    });
    $$('.nav-item').forEach(btn => btn.addEventListener('click', () => {
      state.activeView = btn.dataset.view;
      syncNavigation();
      render();
      if (window.innerWidth <= 820) $('#sidebar').classList.remove('open');
    }));
    $('#menuBtn').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
    $('#closeModalBtn').addEventListener('click', closeModal);
    $('#modalBackdrop').addEventListener('click', closeModal);
    window.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
  }

  async function loadAll() {
    await loadShell();state.trashItems=await DossierDB.getAll('trash');await loadProfileData();
  }

  function migrationSnapshot(doc={}){
    const snap=interpretationSnapshot(doc);delete snap.updatedAt;delete snap.labRepairVersion;delete snap.labPanelVersion;delete snap.labReferenceRepairVersion;return JSON.stringify(snap);
  }

  function statusCountChanged(before=[],after=[]){
    const key=v=>`${v.parameterId||HealthExtractors.normalizedExamKey?.(v.parameterName||'')}|${Number(v.value)}|${HealthExtractors.canonicalUnitKey(v.unit||'')}`;
    const bm=new Map((before||[]).map(v=>[key(v),HealthExtractors.normalizeText(v.status||'')]));let count=0;
    for(const v of after||[]){const k=key(v);if(bm.has(k)&&bm.get(k)!==HealthExtractors.normalizeText(v.status||''))count++;}
    return count;
  }

  function canonicalStoredNarrativeLabel(value=''){
    const clean=String(value||'Sezione clinica').replace(/\s+/g,' ').trim().replace(/[,;:\-]?\s*continua\s*$/i,'').trim();
    const n=normalizedWords(clean);
    if(/^commento\b/.test(n))return{key:'commento',label:'Commento'};
    if(/^esami ematochimici\b/.test(n))return{key:'esami-ematochimici',label:'Esami ematochimici'};
    if(/^reperti e conclusioni\b/.test(n))return{key:'reperti-conclusioni',label:'Reperti e conclusioni'};
    if(/^referto\b/.test(n))return{key:'referto',label:'Referto'};
    if(/^dalla presente analisi.*classificazione/.test(n))return{key:'classificazione-analisi',label:clean};
    return{key:n||'sezione-clinica',label:clean||'Sezione clinica'};
  }
  function mergeStoredNarrativeList(rows=[],labelField='title',textField='text'){
    const merged=new Map(),order=[];
    for(const item of rows||[]){
      const label=String(item?.[labelField]||'').trim(),text=String(item?.[textField]||'').trim();if(!label||!text)continue;
      const info=canonicalStoredNarrativeLabel(label),content=text.replace(/\r/g,'').replace(/\n{3,}/g,'\n\n').trim(),ck=normalizedWords(content);
      if(!merged.has(info.key)){merged.set(info.key,{label:info.label,parts:[],seen:new Set(),template:{...item}});order.push(info.key);}
      const row=merged.get(info.key);if(!row.seen.has(ck)){row.seen.add(ck);row.parts.push(content);}
    }
    return order.map(key=>{const row=merged.get(key);return{...row.template,[labelField]:row.label,[textField]:row.parts.join('\n\n')}}).filter(x=>String(x[textField]||'').trim());
  }
  function obviousReferenceOnlyClinicalRow(row={}){
    const name=normalizedWords(row.parameterName||row.test||''),source=normalizedWords(row.sourceLine||'');
    if(name.length>70&&/(?:non applicabile|gravidanza|massa corporea|massa muscolare|patologie multiple|stato nutrizionale|gruppi etnici)/.test(`${name} ${source}`))return'Nota interpretativa, non esame autonomo';
    if(/[<>≤≥]\s*$/.test(String(row.parameterName||row.test||'').trim())&&Number.isFinite(Number(row.value??row.result)))return'Soglia di riferimento letta come esame';
    if(/^(?:ricerca sangue occulto)\s*[<>≤≥]?$/.test(name)&&Number.isFinite(Number(row.value??row.result)))return'Soglia o intestazione letta come risultato';
    return'';
  }
  function quarantineTechnicalRows21(doc={}){
    const technical=[...(doc.technicalReviewRows||[])],lab=[],qual=[];let removed=0;
    const push=(row,kind,reason)=>{technical.push({kind,test:row.parameterName||row.test||'',result:row.rawValue??row.value??row.result??'',unit:row.unit||'',reference:row.range?.raw||row.reference||'',status:row.status||'',sourceLine:row.sourceLine||'',pageNumber:row.pageNumber,reason,reviewStatus:'Da verificare nei dati tecnici',quarantinedBy:'test23-v1'});removed++;};
    for(const row of doc.labValues||[]){const reason=obviousReferenceOnlyClinicalRow(row);if(reason)push(row,'numeric',reason);else lab.push(row);}
    for(const row of doc.qualitativeResults||[]){const reason=obviousReferenceOnlyClinicalRow(row);if(reason)push(row,'qualitative',reason);else qual.push(row);}
    return{lab,qual,technical,removed};
  }
  function quickDocumentFinalization21(doc={}){
    const filtered=quarantineTechnicalRows21(doc);
    let current={...doc,
      labValues:filtered.lab.map(v=>({...v,range:v.range?{...v.range}:v.range})),
      qualitativeResults:filtered.qual.map(v=>({...v})),
      technicalReviewRows:filtered.technical,
      reportSections:mergeStoredNarrativeList(doc.reportSections||[],'title','text'),
      pdfFields:mergeStoredNarrativeList((doc.pdfFields||[]).filter(x=>x?.include!==false),'label','value')
    };
    if(globalThis.HealthExtractors?.repairNarrativeDocumentData&&(current.reportSections.length||current.pdfFields.length)){current=HealthExtractors.repairNarrativeDocumentData(current).document;}
    if(current.reportSections.length)current.reconstructedText=current.reportSections.map(s=>`${s.title}\n${s.text}`).join('\n\n');
    current.narrativeRepairVersion='test23-v1';current.clinicalValidationVersion='test23-v1';current.labReferenceRepairVersion='test23-v1';
    return current;
  }
  async function saveDetachedDocumentVersion20(doc,reason,versionsByDoc){
    const list=versionsByDoc.get(doc.id)||[];const max=list.reduce((m,v)=>Math.max(m,Number(v.versionNumber||0)),0);
    const row={id:uid('docver'),profileId:doc.profileId,documentId:doc.id,versionNumber:max+1,reason,engine:doc.ocrEngine||'',appVersion:'5.0.0 TEST 23',createdAt:new Date().toISOString(),snapshot:interpretationSnapshot(doc)};
    await DossierDB.put('documentVersions',row,{details:{event:'test22-quick-finalization-history'}});list.push(row);versionsByDoc.set(doc.id,list);return row;
  }
  function narrativeHasFragments(doc={}){
    for(const [rows,labelField] of [[doc.reportSections||[],'title'],[doc.pdfFields||[],'label']]){
      const keys=new Set();
      for(const row of rows){
        const label=String(row?.[labelField]||'').trim();if(!label)continue;
        if(/\bcontinua\s*$/i.test(label))return true;
        const key=canonicalStoredNarrativeLabel(label).key;if(keys.has(key))return true;keys.add(key);
      }
    }
    return false;
  }
  function documentNeedsTest21Completion(doc={}){
    if(narrativeHasFragments(doc))return true;
    for(const row of doc.labValues||[]){
      const missing=!validRangeObject(row.range);
      if(missing&&row.referenceApplicability!=='not_applicable'&&row.referenceApplicability!=='not_required')return true;
      if(/da verificare|non definito/.test(normalizedWords(row.status||'')))return true;
    }
    for(const row of doc.qualitativeResults||[]){
      const missing=!String(row.reference||'').trim();
      if(missing&&row.referenceApplicability!=='not_applicable'&&row.referenceApplicability!=='not_required')return true;
      if(/da verificare|non definito/.test(normalizedWords(row.status||'')))return true;
    }
    return false;
  }
  const nextIdleTurn=()=>new Promise(resolve=>{
    if(typeof requestIdleCallback==='function')requestIdleCallback(()=>resolve(),{timeout:120});
    else setTimeout(resolve,16);
  });
  function clinicalView(doc={}){return JSON.stringify({l:doc.labValues||[],q:doc.qualitativeResults||[],s:doc.reportSections||[],p:doc.pdfFields||[]});}
  let test22MaintenancePromise=null;
  async function runTest22TargetedMaintenance(){
    if(test22MaintenancePromise)return test22MaintenancePromise;
    test22MaintenancePromise=(async()=>{
      const allowed=new Set(state.profiles.map(p=>p.id));if(!allowed.size)return;
      const completed=await DossierDB.get('settings','clinicalMigrationCompleted:test22-v1');
      if(completed?.value===true){const saved=await DossierDB.get('settings','clinicalMigrationReport:test22-v1');state.lastClinicalMigrationReport=saved?.value||null;return;}
      const allDocs=(await DossierDB.getAll('documents')).filter(d=>allowed.has(d.profileId));
      const allVersions=await DossierDB.getAll('documentVersions'),versionsByDoc=new Map();for(const v of allVersions){if(!versionsByDoc.has(v.documentId))versionsByDoc.set(v.documentId,[]);versionsByDoc.get(v.documentId).push(v);}
      const profileMap=new Map(state.profiles.map(p=>[p.id,p]));
      const report={version:'test22-v1',status:'running',startedAt:new Date().toISOString(),documentsAnalyzed:allDocs.length,documentsChanged:0,referencesResolved:0,sectionsUnified:0,verifyRemaining:0,nonApplicable:0,bloodGroupsDetected:0,doubtfulDocuments:[],errors:[],applied:false};
      setMaintenanceStatus('Archivio utilizzabile · completamento leggero in corso','#f59e0b');
      for(const profile of state.profiles){
        await nextIdleTurn();
        const original=allDocs.filter(d=>d.profileId===profile.id);
        if(!original.length)continue;
        const working=original.map(d=>{const filtered=quarantineTechnicalRows21(d);return{...d,labValues:filtered.lab.map(v=>({...v,range:v.range?{...v.range}:v.range})),qualitativeResults:filtered.qual.map(v=>({...v})),technicalReviewRows:filtered.technical,reportSections:mergeStoredNarrativeList(d.reportSections||[],'title','text'),pdfFields:mergeStoredNarrativeList((d.pdfFields||[]).filter(x=>x?.include!==false),'label','value')};});
        report.referencesResolved+=applyReferenceSourcesToDocuments(working,profile);
        for(let i=0;i<working.length;i++){
          const before=original[i],current=working[i];
          const beforeSections=(before.reportSections||[]).length+(before.pdfFields||[]).length,afterSections=(current.reportSections||[]).length+(current.pdfFields||[]).length;
          report.sectionsUnified+=Math.max(0,beforeSections-afterSections);
          const rows=[...(current.labValues||[]),...(current.qualitativeResults||[])];
          const unresolved=rows.filter(v=>/da verificare|non definito/.test(normalizedWords(v.status||'')));
          report.verifyRemaining+=unresolved.length;report.nonApplicable+=rows.filter(v=>v.referenceApplicability==='not_applicable'||v.referenceApplicability==='not_required').length;
          if(unresolved.length)report.doubtfulDocuments.push({documentId:current.id,file:current.originalName||current.title||'',rows:unresolved.length,reasons:[...new Set(unresolved.map(v=>v.unresolvedReason||'Dati insufficienti'))].slice(0,5)});
          if(clinicalView(before)!==clinicalView(current)){
            try{await saveDetachedDocumentVersion20(before,'Copia prima del completamento clinico TEST 22',versionsByDoc);current.clinicalValidationVersion='test22-v1';current.labReferenceRepairVersion='test22-v1';current.narrativeRepairVersion='test22-v1';current.updatedAt=new Date().toISOString();await DossierDB.put('documents',current,{details:{event:'test22-targeted-finalization'}});report.documentsChanged++;if(current.profileId===state.activeProfileId){const pos=state.documents.findIndex(d=>d.id===current.id);if(pos>=0)state.documents[pos]=current;}}
            catch(error){report.errors.push({documentId:current.id,file:current.originalName||'',message:error.message});}
          }
          if(i%8===7)await nextIdleTurn();
        }
        const detected=await detectAndSaveBloodGroup22(profile,working,{automatic:true});if(detected?.saved)report.bloodGroupsDetected++;
      }
      report.status=report.errors.length?'completed_with_errors':'completed';report.applied=true;report.completedAt=new Date().toISOString();report.doubtfulDocumentsCount=report.doubtfulDocuments.length;report.doubtfulDocuments=report.doubtfulDocuments.slice(0,100);
      await DossierDB.put('settings',{key:'clinicalMigrationReport:test22-v1',value:report});await DossierDB.put('settings',{key:'clinicalMigrationCompleted:test22-v1',value:true});state.lastClinicalMigrationReport=report;
      if(report.documentsChanged){render();toast(`TEST 22 completata: ${report.documentsChanged} documenti aggiornati, ${report.referencesResolved} riferimenti completati.`);}
      setMaintenanceStatus('Archivio pronto','#62d49e');
    })().catch(error=>{console.error('Completamento TEST 22 non riuscito',error);setMaintenanceStatus('Archivio pronto · completamento da riprovare','#f59e0b');}).finally(()=>{test22MaintenancePromise=null;});
    return test22MaintenancePromise;
  }
  async function rollbackTest22ClinicalMigration(){
    if(!confirm('Ripristinare le interpretazioni precedenti alla TEST 22? I documenti originali non verranno modificati.'))return;
    const allowed=new Set(state.profiles.map(p=>p.id));const versions=(await DossierDB.getAll('documentVersions')).filter(v=>allowed.has(v.profileId)&&v.reason==='Copia prima del completamento clinico TEST 22');
    const latest=new Map();for(const v of versions){const cur=latest.get(v.documentId);if(!cur||String(v.createdAt||'')>String(cur.createdAt||''))latest.set(v.documentId,v);}
    let restored=0,errors=0;for(const [documentId,version] of latest){try{const doc=await DossierDB.get('documents',documentId);if(!doc||!version.snapshot)continue;const restoredDoc={...doc,...version.snapshot,id:doc.id,profileId:doc.profileId,fileBlob:doc.fileBlob,originalName:doc.originalName,mimeType:doc.mimeType,size:doc.size,hash:doc.hash,updatedAt:new Date().toISOString()};await DossierDB.put('documents',restoredDoc,{details:{event:'test22-rollback'}});restored++;}catch(_){errors++;}}
    const report={...(state.lastClinicalMigrationReport||{}),rolledBack:true,rolledBackAt:new Date().toISOString(),documentsRolledBack:restored,rollbackErrors:errors,status:'rolled_back'};
    await DossierDB.put('settings',{key:'clinicalMigrationReport:test22-v1',value:report});state.lastClinicalMigrationReport=report;await loadProfileData();renderPreferences();toast(`Ripristino TEST 22 completato: ${restored} documenti${errors?`, ${errors} errori`:''}.`);
  }

  function legacyDocumentMode(doc={}) {
    const text=HealthExtractors.normalizeText(`${doc.title||''} ${doc.category||''} ${doc.extractedText||doc.structuredText||''}`);
    if(/terapie farmacologiche|schema terapeutico|piano terapeutico/.test(text))return 'therapy';
    if(/esenzione sanitaria|codice esenzione|attestato di esenzione/.test(text))return 'exemption';
    if(/visita (epatologica|diabetologica|neurologica|cardiologica|endocrinologica|oculistica|specialistica)|motivo della visita|alla cortese attenzione del medico curante/.test(text))return /\besame\b.*\b(?:esito|risultato)\b.*\b(?:unita|u\.m)/.test(text)?'mixed':'narrative';
    if(doc.category==='Esami di laboratorio'||/laboratorio analisi|patologia clinica|emocromo/.test(text))return 'lab';
    return 'narrative';
  }

  function legacyDocumentKind(doc={},mode='') {
    const text=HealthExtractors.normalizeText(`${doc.title||''} ${doc.extractedText||''}`);
    for(const [label,re] of [['Visita epatologica',/visita epatologica|u\.o\. epatologia/],['Visita diabetologica',/visita diabetologica|diabetologia/],['Visita neurologica',/visita neurologica|u\.o\.c?\. neurologia/],['Visita cardiologica',/visita cardiologica|cardiologia/],['Visita endocrinologica',/visita endocrinologica|endocrinologia/],['Visita oculistica',/visita oculistica|fundus oculi/],['TAC',/\btac\b|tomografia/],['Ecografia',/ecografia/]])if(re.test(text))return label;
    return mode==='lab'?'Esami di laboratorio':mode==='therapy'?'Terapie farmacologiche':mode==='exemption'?'Esenzione sanitaria':doc.category||'Documento sanitario';
  }

  function basicNarrativeText(text='') {
    return String(text||'').replace(/===\s*PAGINA\s*\d+\s*===/gi,'\n').replace(/\r/g,'').split('\n').map(x=>x.replace(/\s+/g,' ').trim()).filter(x=>x&&!/\b(?:page|pagina)\s*\d+\s*(?:di|\/)\s*\d+/i.test(x)).join('\n').replace(/\n{3,}/g,'\n\n').trim();
  }

  const V602_CANONICAL_VERSION='v6.0.4-canonical-v18';
  const DOCUMENT_CLASSIFIER_VERSION='document-classifier-v18';
  // FIX27: validazione dei valori numerici già OCRizzati. È separata dal parser:
  // non provoca una nuova lettura dei documenti e usa sourceLine/rawValue esistenti.
  const LAB_GRAPH_VALIDATION_VERSION='lab-graph-validation-v27';
  // Versione del motore/parser clinico: cambia SOLO quando cambia realmente il motore clinico.
  // Le FIX/build dell'interfaccia non devono provocare una nuova rilettura dei documenti.
  const CLINICAL_PARSER_VERSION='clinical-parser-v16';
  const LEGACY_CANONICAL_PARSER_VERSION='clinical-parser-v16';
  const BOOKING_INTERPRETATION_VERSION='booking-parser-1.0.0-corrected-v2';
  const DOCUMENT_REANALYSIS_POLICY_VERSION='document-reread-safe-1.0.0-corrected-v1';
  const yieldInterface=()=>new Promise(resolve=>setTimeout(resolve,0));
  // Il mapping legacy e volutamente fisso: quando CLINICAL_PARSER_VERSION salira,
  // i documenti privi del nuovo metadato risulteranno correttamente da riallineare.
  const legacyParserVersionForDocument=doc=>doc?.clinicalCanonicalRereadVersion===V602_CANONICAL_VERSION?LEGACY_CANONICAL_PARSER_VERSION:'';
  const storedClinicalParserVersion=doc=>String(doc?.clinicalParserVersion||legacyParserVersionForDocument(doc)||'');
  // R36: lo stato di riallineamento appartiene al documento e viaggia con il dossier.
  // Non dipende piu dal localStorage del singolo browser/PC, quindi un archivio
  // ripristinato su una nuova installazione conserva esattamente cosa e gia stato
  // elaborato e cosa richiede ancora il parser corrente.
  const parserRereadTargetVersion=doc=>String(doc?.clinicalParserRereadTargetVersion||'');
  const parserRereadStatus=doc=>String(doc?.clinicalCanonicalRereadStatus||'');
  const parserFailedForCurrentVersion=doc=>parserRereadStatus(doc)==='failed'&&parserRereadTargetVersion(doc)===CLINICAL_PARSER_VERSION;
  const isComplexClinicalDoc=doc=>Boolean(doc&&(doc.complexClinicalContainer===true||/cartella\s+clinica/i.test(String(doc.documentKind||doc.category||doc.title||doc.originalName||''))||globalThis.HealthExtractors?.isComplexClinicalDocumentV16?.(doc)===true||globalThis.HealthExtractors?.isComplexClinicalDocumentV15?.(doc)===true||globalThis.HealthExtractors?.isComplexClinicalDocumentV14?.(doc)===true||globalThis.HealthExtractors?.isComplexClinicalDocumentV13?.(doc)===true||globalThis.HealthExtractors?.isComplexClinicalDocumentV12?.(doc)===true||globalThis.HealthExtractors?.isComplexClinicalDocumentV11?.(doc)===true||globalThis.HealthExtractors?.isComplexClinicalContainer603?.(doc)===true));
  const needsAutomaticParserReread=doc=>Boolean(doc?.fileBlob&&isComplexClinicalDoc(doc)&&!parserFailedForCurrentVersion(doc)&&(storedClinicalParserVersion(doc)!==CLINICAL_PARSER_VERSION||parserRereadStatus(doc)==='in_progress'));
  async function maybeFinishAutomaticParserMigration(){
    // Compatibilita diagnostica soltanto: la decisione non dipende da questo valore.
    // La fonte autorevole e sempre clinicalParserVersion/stato persistiti nel documento.
    try{localStorage.setItem('dossier.clinicalParserVersion',CLINICAL_PARSER_VERSION);}catch(_){ }
  }
  const documentPdfTypeKey=doc=>String(doc?.documentKind||doc?.category||'Documento sanitario').trim()||'Documento sanitario';
  const defaultPdfExportMode=(doc)=>isComplexClinicalDoc(doc)?'exclude':'full';
  const effectivePdfExportMode=(doc)=>doc?.pdfExportOverride===true?(doc.pdfExportMode||'full'):defaultPdfExportMode(doc);
  const documentIncludedInPdf=(doc,prefs=currentProfilePreferences())=>effectivePdfExportMode(doc,prefs)!=='exclude';
  const forceComplexCanonical=(doc,profile={})=>globalThis.HealthExtractors?.canonicalizeComplexClinicalDocumentV16?HealthExtractors.canonicalizeComplexClinicalDocumentV16(doc,{profile}):(globalThis.HealthExtractors?.canonicalizeComplexClinicalDocumentV15?HealthExtractors.canonicalizeComplexClinicalDocumentV15(doc,{profile}):(globalThis.HealthExtractors?.canonicalizeComplexClinicalDocumentV14?HealthExtractors.canonicalizeComplexClinicalDocumentV14(doc,{profile}):(globalThis.HealthExtractors?.canonicalizeComplexClinicalDocumentV13?HealthExtractors.canonicalizeComplexClinicalDocumentV13(doc,{profile}):(globalThis.HealthExtractors?.canonicalizeComplexClinicalDocumentV12?HealthExtractors.canonicalizeComplexClinicalDocumentV12(doc,{profile}):(globalThis.HealthExtractors?.canonicalizeComplexClinicalDocumentV11?HealthExtractors.canonicalizeComplexClinicalDocumentV11(doc,{profile}):(HealthExtractors.canonicalizeClinicalDocument24?HealthExtractors.canonicalizeClinicalDocument24({...doc,complexClinicalContainer:true,documentKind:'Cartella clinica',category:'Cartella clinica',documentMode:'narrative'},{profile}).document:doc))))));
  const documentClassifierVersionOf=doc=>String(doc?.documentClassifierVersion||'');
  const needsAutomaticDocumentClassifierMigration=doc=>Boolean(doc&&!isComplexClinicalDoc(doc)&&(documentClassifierVersionOf(doc)!==DOCUMENT_CLASSIFIER_VERSION||String(doc.clinicalCanonicalVersion||'')!==V602_CANONICAL_VERSION));
  async function migrateDocumentClassifierAutomatically(documents=[],profile={},options={}) {
    const rows=Array.isArray(documents)?documents:[];
    const out=[];let changed=0,failed=0;
    const onProgress=typeof options.onProgress==='function'?options.onProgress:null;
    for(let i=0;i<rows.length;i++){
      const source=rows[i];
      if(!needsAutomaticDocumentClassifierMigration(source)){out.push(source);continue;}
      try{
        const result=(typeof HealthExtractors!=='undefined'&&HealthExtractors.canonicalizeClinicalDocument24)?HealthExtractors.canonicalizeClinicalDocument24({...source},{profile}):null;
        let canonical=result?.document||source;
        canonical=protectManualDocumentInterpretation(source,canonical);
        const now=new Date().toISOString();
        canonical.documentClassifierVersion=DOCUMENT_CLASSIFIER_VERSION;
        canonical.documentClassifierMigratedAt=now;
        canonical.clinicalCanonicalVersion=V602_CANONICAL_VERSION;
        canonical.clinicalCanonicalLastProcessedAt=now;
        await DossierDB.put('documents',canonical,{sync:false,audit:false,details:{event:'fix23-document-classifier-auto-migration'}});
        out.push(canonical);changed++;
      }catch(error){
        console.error('FIX23: migrazione automatica classificatore non riuscita',source?.title||source?.originalName,error);
        out.push(source);failed++;
      }
      try{onProgress?.({done:i+1,total:rows.length,changed,failed});}catch(_){ }
      await nextIdleTurn();
    }
    return{documents:out,changed,failed};
  }

  const needsAutomaticLabGraphValidation=doc=>Boolean(doc&&Array.isArray(doc.labValues)&&doc.labValues.length&&String(doc.labGraphValidationVersion||'')!==LAB_GRAPH_VALIDATION_VERSION);
  async function migrateLabGraphValidationAutomatically(documents=[],options={}){
    const rows=Array.isArray(documents)?documents:[],out=[];let changed=0,failed=0;
    const onProgress=typeof options.onProgress==='function'?options.onProgress:null;
    for(let i=0;i<rows.length;i++){
      const source=rows[i];if(!needsAutomaticLabGraphValidation(source)){out.push(source);continue;}
      try{
        const result=HealthExtractors?.repairLabDocumentData?HealthExtractors.repairLabDocumentData(source):{document:source};
        const repaired=result?.document||source;repaired.labGraphValidationVersion=LAB_GRAPH_VALIDATION_VERSION;repaired.labGraphValidationAt=new Date().toISOString();
        await DossierDB.put('documents',repaired,{sync:false,audit:false,details:{event:'fix27-lab-graph-auto-validation'}});out.push(repaired);changed++;
      }catch(error){console.error('FIX27: validazione automatica valori grafici non riuscita',source?.title||source?.originalName,error);out.push(source);failed++;}
      try{onProgress?.({done:i+1,total:rows.length,changed,failed});}catch(_){ }
      await nextIdleTurn();
    }
    return{documents:out,changed,failed};
  }

  async function canonicalizeDocuments602(documents=[],profile={},options={}) {
    const rows=Array.isArray(documents)?documents:[];
    const out=[];let changed=0;
    const onProgress=typeof options.onProgress==='function'?options.onProgress:null;
    for(let i=0;i<rows.length;i++){
      const source=rows[i];let canonical=source;let wasChanged=false;
      const isComplexSource=isComplexClinicalDoc(source);const pendingComplex=isComplexSource&&needsAutomaticParserReread(source);
      if(pendingComplex){out.push(source);try{onProgress?.({done:i+1,total:rows.length,document:source,changed});}catch(_){ }await nextIdleTurn();continue;}
      try{
        if(globalThis.HealthExtractors?.canonicalizeClinicalDocument24){
          const result=HealthExtractors.canonicalizeClinicalDocument24(source,{profile});
          canonical=protectManualDocumentInterpretation(source,result?.document||source);wasChanged=result?.changed===true||canonical.clinicalCanonicalVersion!==source.clinicalCanonicalVersion||canonical.clinicalCanonicalSourceFingerprint!==source.clinicalCanonicalSourceFingerprint;
          // Se cambia davvero il parser, anche i documenti normali aggiornano classificazione e titolo
          // dal testo già letto, senza rifare inutilmente l'OCR. Le cartelle cliniche complesse seguono
          // invece la rilettura completa una tantum gestita sotto.
          if(!isComplexSource&&storedClinicalParserVersion(source)!==CLINICAL_PARSER_VERSION){
            canonical={...canonical,clinicalParserVersion:CLINICAL_PARSER_VERSION,clinicalCanonicalLastProcessedAt:new Date().toISOString()};
            wasChanged=true;
          }
        }
      }catch(error){console.error('V6.0.4: normalizzazione canonica non riuscita',source?.title||source?.originalName,error);canonical=source;}
      if(canonical&&canonical.clinicalCanonicalVersion===V602_CANONICAL_VERSION&&wasChanged&&options.persist!==false){
        try{await DossierDB.put('documents',canonical,{sync:false,audit:false,details:{event:'v603-canonical-cache'}});changed++;}catch(error){console.warn('Cache canonica non salvata:',error);}
      }
      out.push(canonical);
      try{onProgress?.({done:i+1,total:rows.length,document:canonical,changed});}catch(_){ }
      await nextIdleTurn();
    }
    return {documents:out,changed};
  }

  let complexMigration603Promise=null;
  async function migrateComplexClinicalDocuments603(profile={}) {
    if(complexMigration603Promise)return complexMigration603Promise;
    const detector=typeof globalThis.HealthExtractors?.isComplexClinicalContainer603==='function'?globalThis.HealthExtractors.isComplexClinicalContainer603:()=>false;
    const candidates=(state.documents||[]).filter(d=>d?.fileBlob&&(isComplexClinicalDoc(d)||detector(d))&&needsAutomaticParserReread(d));
    if(!candidates.length){await maybeFinishAutomaticParserMigration();return {done:0,failed:0};}
    complexMigration603Promise=(async()=>{
      const progress=openExportProgress(profile,'Aggiornamento cartelle cliniche','Il programma sta rileggendo i documenti perché è cambiata la versione del motore clinico. Questa operazione viene eseguita una sola volta per versione del parser.');let done=0,failed=0;
      try{
        await progress.update(1,'Aggiornamento cartelle cliniche',`${candidates.length} documenti complessi da rileggere una sola volta.`);
        for(let i=0;i<candidates.length;i++){
          const doc=candidates[i],label=doc.title||doc.originalName||'Cartella clinica';
          try{
            await progress.update(3+(i/candidates.length)*90,'Rilettura cartella clinica',`${label} · preparazione`);
            try{await saveDocumentVersion(doc,'Copia prima della rilettura cartella clinica V6.0.4 canone v14',{sync:false,audit:false});}catch(error){console.warn('Snapshot pre-migrazione non salvato',error);}
            const startedAt=new Date().toISOString();
            // Lo stato in_progress viene salvato nel documento, ma la versione del
            // parser viene promossa solo al completamento. Se il processo si interrompe,
            // il dossier potra riprendere automaticamente la rilettura al prossimo avvio.
            const inProgress={...doc,clinicalParserRereadTargetVersion:CLINICAL_PARSER_VERSION,clinicalCanonicalRereadVersion:V602_CANONICAL_VERSION,clinicalCanonicalRereadStatus:'in_progress',clinicalCanonicalRereadStartedAt:startedAt,clinicalCanonicalRereadError:'',updatedAt:startedAt};
            await DossierDB.put('documents',inProgress,{sync:false,audit:false,details:{event:'v604-canonical-v14-reread-start'}});
            const result=await OCRService.analyzeFile(doc.fileBlob,p=>{
              const local=Math.max(0,Math.min(100,Number(p?.progress||0)))/100;
              const pct=3+((i+local)/candidates.length)*90;
              void progress.update(pct,'Rilettura cartella clinica',`${label} · ${p?.message||'analisi in corso'}`);
            });
            if(!String(result?.text||'').trim()&&!(result?.pages||[]).length)throw new Error('Rilettura senza contenuto utilizzabile');
            let a=analyzeOcrResult(result,doc.profileId,doc.originalName);const bookingOverlay=calendarBookingOverlayForImportedAnalysis(result.text||'',a);a=bookingOverlay.analysis;const mode=a.documentMode||doc.documentMode||'narrative';
            const reread={...doc,clinicalDate:isValidClinicalDate(a.clinicalDate||'')?a.clinicalDate:doc.clinicalDate||'',issueDate:isValidClinicalDate(a.issueDate||'')?a.issueDate:doc.issueDate||'',title:a.title||doc.title,category:a.category||doc.category,documentMode:mode,documentKind:a.documentKind||doc.documentKind||a.category,specialization:a.specialization||a.department||doc.specialization||'',department:a.department||a.specialization||doc.department||'',facility:a.facility||doc.facility||'',facilityContact:'',doctor:a.doctor||doc.doctor||'',extractedText:result.text||'',structuredText:a.structuredText||result.text||'',reconstructedText:a.reconstructedText||'',bookingService:a.bookingService||doc.bookingService||'',bookingStartDate:a.bookingStartDate||doc.bookingStartDate||'',bookingStartTime:a.bookingStartTime||doc.bookingStartTime||'',bookingLocation:a.bookingLocation||doc.bookingLocation||'',bookingFacility:a.bookingFacility||doc.bookingFacility||'',bookingReferences:a.bookingReferences||doc.bookingReferences||[],reportSections:a.reportSections||[],ecgParameters:a.ecgParameters||[],labValues:a.labValues||[],qualitativeResults:[],tableRows:[],ocrPageData:result.pages||[],ocrStatus:'completed',ocrEngine:result.engine||'',ocrLanguage:result.language||'',ocrProcessedPages:result.processedPages||0,ocrQuality:Math.round((result.pages||[]).reduce((x,p)=>x+Number(p.quality||0),0)/Math.max(1,(result.pages||[]).length)),clinicalCanonicalVersion:'',clinicalCanonicalSourceFingerprint:'',pdfExportMode:doc.pdfExportMode||'summary',lastAnalysisAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
            const canonical=forceComplexCanonical(reread,profile)||reread;
            if(canonical.clinicalCanonicalVersion!==V602_CANONICAL_VERSION||canonical.documentMode!=='narrative')throw new Error('Canone cartella clinica non completato');
            canonical.clinicalParserVersion=CLINICAL_PARSER_VERSION;canonical.clinicalParserRereadTargetVersion=CLINICAL_PARSER_VERSION;canonical.clinicalCanonicalRereadVersion=V602_CANONICAL_VERSION;canonical.clinicalCanonicalRereadStatus='completed';canonical.clinicalCanonicalRereadError='';canonical.clinicalCanonicalRereadAt=new Date().toISOString();canonical.clinicalCanonicalLastProcessedAt=canonical.clinicalCanonicalRereadAt;canonical.lastAnalysisAt=canonical.clinicalCanonicalRereadAt;
            await DossierDB.put('documents',canonical,{sync:false,audit:false,details:{event:'v604-canonical-v14-complex-parser-migration'}});done++;
          }catch(error){
            failed++;console.error('V6.0.4: migrazione cartella clinica non riuscita',label,error);
            try{const fallback=HealthExtractors.canonicalizeClinicalDocument24({...doc,clinicalCanonicalVersion:'',clinicalCanonicalSourceFingerprint:''},{profile}).document||doc;fallback.clinicalParserVersion=storedClinicalParserVersion(doc);fallback.clinicalParserRereadTargetVersion=CLINICAL_PARSER_VERSION;fallback.clinicalCanonicalRereadVersion=V602_CANONICAL_VERSION;fallback.clinicalCanonicalRereadStatus='failed';fallback.clinicalCanonicalRereadError=String(error?.message||error);fallback.clinicalCanonicalRereadAt=new Date().toISOString();fallback.clinicalCanonicalLastProcessedAt=fallback.clinicalCanonicalRereadAt;await DossierDB.put('documents',fallback,{sync:false,audit:false,details:{event:'v604-canonical-v14-reread-fallback'}});}catch(saveError){console.error('Salvataggio fallback cartella clinica non riuscito',saveError);}
          }
          await yieldInterface();
        }
        await progress.update(98,'Aggiornamento cartelle cliniche',`Completato: ${done}${failed?` · ${failed} da verificare`:''}.`);
      }finally{progress.close();complexMigration603Promise=null;}
      await maybeFinishAutomaticParserMigration();
      return{done,failed};
    })();
    return complexMigration603Promise;
  }

  let documentMaintenanceTimer=null;
  let documentMaintenancePromise=null;
  let pendingMaintenanceProfileId=null;
  function scheduleDocumentMaintenanceForProfile(profileId=state.activeProfileId,delay=900){
    if(!profileId)return;
    pendingMaintenanceProfileId=profileId;
    if(documentMaintenanceTimer)clearTimeout(documentMaintenanceTimer);
    documentMaintenanceTimer=setTimeout(()=>{documentMaintenanceTimer=null;void runDocumentMaintenanceForProfile(profileId);},Math.max(100,Number(delay)||900));
  }
  let bookingArchiveMigrationTimer=null;
  function scheduleBookingArchiveMigration(profileId=state.activeProfileId,delay=650){
    if(!profileId)return;
    if(bookingArchiveMigrationTimer)clearTimeout(bookingArchiveMigrationTimer);
    bookingArchiveMigrationTimer=setTimeout(async()=>{
      bookingArchiveMigrationTimer=null;
      try{
        const profile=state.profiles.find(p=>String(p.id)===String(profileId))||{};
        const docs=await DossierDB.byProfile('documents',profileId);
        const result=await migrateBookingDocumentsAutomatically(docs,profile);
        if((result.changed||result.events)&&String(state.activeProfileId)===String(profileId)){
          state.documents=(await DossierDB.byProfile('documents',profileId)).sort(compareDocs);
          state.calendarEvents=(await DossierDB.byProfile('calendarEvents',profileId)).sort((a,b)=>calendarEventDateTime(a).localeCompare(calendarEventDateTime(b)));
          if(['documents','calendar','dashboard'].includes(state.activeView))renderView();
        }
      }catch(error){console.error('R16: manutenzione automatica prenotazioni non completata',error);}
    },Math.max(150,Number(delay)||650));
  }

  async function runDocumentMaintenanceForProfile(profileId){
    if(!profileId)return;
    if(documentMaintenancePromise){pendingMaintenanceProfileId=profileId;return documentMaintenancePromise;}
    const profile=state.profiles.find(p=>p.id===profileId)||{};
    pendingMaintenanceProfileId=null;
    documentMaintenancePromise=(async()=>{
      await nextIdleTurn();
      let docs=await DossierDB.byProfile('documents',profileId);
      if(!docs.length)return;
      const countPending=docs.filter(d=>needsAutomaticDocumentClassifierMigration(d)||needsAutomaticLabGraphValidation(d)||(String(d.clinicalCanonicalVersion||'')!==V602_CANONICAL_VERSION&&!needsAutomaticParserReread(d))).length;
      if(countPending)setMaintenanceStatus(`Archivio pronto · aggiornamento clinico 0/${countPending}`,'#f59e0b');
      if(typeof HealthExtractors!=='undefined'&&HealthExtractors.canonicalizeClinicalDocument24){
        const migration=await migrateDocumentClassifierAutomatically(docs,profile,{onProgress:({done,total})=>{if(countPending)setMaintenanceStatus(`Archivio pronto · classificazioni ${done}/${total}`,'#f59e0b');}});
        docs=migration.documents;
        await nextIdleTurn();
        const prepared=await canonicalizeDocuments602(docs,profile,{persist:true,onProgress:({done,total})=>{if(countPending)setMaintenanceStatus(`Archivio pronto · ottimizzazione ${done}/${total}`,'#f59e0b');}});
        docs=prepared.documents;
        await nextIdleTurn();
        const graphValidation=await migrateLabGraphValidationAutomatically(docs,{onProgress:({done,total})=>{if(countPending)setMaintenanceStatus(`Archivio pronto · grafici ${done}/${total}`,'#f59e0b');}});
        docs=graphValidation.documents;
      }
      const bookingMigration=await migrateBookingDocumentsAutomatically(docs,profile,{onProgress:({done,total})=>{if(total)setMaintenanceStatus(`Archivio pronto · prenotazioni ${done}/${total}`,'#f59e0b');}});
      docs=bookingMigration.documents;
      if(profileId===state.activeProfileId){
        state.documents=docs.slice().sort(compareDocs);
        if(globalThis.HealthExtractors?.completeReferences24)applyReferenceSourcesToDocuments(state.documents,profile);else applyReferenceSourcesToDocuments(state.documents,profile);
      }
      await nextIdleTurn();
      const migration603=await migrateComplexClinicalDocuments603(profile);
      if(profileId===state.activeProfileId&&(migration603?.done||migration603?.failed))state.documents=(await DossierDB.byProfile('documents',profileId)).sort(compareDocs);
      setMaintenanceStatus('Archivio pronto','#62d49e');
    })().catch(error=>{console.error('Aggiornamento clinico in background non completato',error);setMaintenanceStatus('Archivio pronto · aggiornamento da riprovare','#f59e0b');}).finally(()=>{
      documentMaintenancePromise=null;
      const next=pendingMaintenanceProfileId;pendingMaintenanceProfileId=null;
      if(next)scheduleDocumentMaintenanceForProfile(next,350);
    });
    return documentMaintenancePromise;
  }

  async function repairTherapyIngredientsForProfile(profileId,rows=[]){
    if(!profileId||!globalThis.DossierMedicines?.repairRows)return rows;
    try{
      const repaired=await DossierMedicines.repairRows(rows);
      for(let i=0;i<repaired.length;i++){
        const before=rows[i]||{},after=repaired[i]||before;
        if((after.activeIngredient||'')!==(before.activeIngredient||'')||(after.manufacturer||'')!==(before.manufacturer||'')){
          const saved={...before,...after,profileId,id:before.id||after.id||uid('therapy'),updatedAt:new Date().toISOString()};
          repaired[i]=saved;
          await DossierDB.put('therapies',saved,{details:{event:'therapy-medicine-autofill-r35'}});
        }
      }
      return repaired;
    }catch(error){console.error('R35: completamento automatico principi attivi/produttori non disponibile',error);return rows;}
  }

  function therapyMedicationKey(value=''){
    return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('it-IT').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
  }

  async function propagateTherapyManufacturer(saved={}){
    const manufacturer=String(saved.manufacturer||'').trim();
    const medicationKey=therapyMedicationKey(saved.medication||'');
    if(!manufacturer||!medicationKey||!saved.profileId)return 0;
    const ingredientKey=therapyMedicationKey(saved.activeIngredient||'');
    const rows=await DossierDB.byProfile('therapies',saved.profileId);
    let changed=0;
    for(const row of rows||[]){
      if(!row||row.id===saved.id||row.active===false)continue;
      if(therapyMedicationKey(row.medication||'')!==medicationKey)continue;
      const rowIngredientKey=therapyMedicationKey(row.activeIngredient||'');
      if(ingredientKey&&rowIngredientKey&&ingredientKey!==rowIngredientKey)continue;
      if(String(row.manufacturer||'').trim()===manufacturer)continue;
      await DossierDB.put('therapies',{...row,manufacturer,updatedAt:new Date().toISOString()},{details:{event:'therapy-manufacturer-propagation-r35',sourceTherapyId:saved.id}});
      changed++;
    }
    return changed;
  }


  const MEDICATION_REORDER_LEAD_DAYS=7;
  const THERAPY_DAY_KEYS=['mon','tue','wed','thu','fri','sat','sun'];
  const THERAPY_DAY_LABELS={mon:'Lun',tue:'Mar',wed:'Mer',thu:'Gio',fri:'Ven',sat:'Sab',sun:'Dom'};
  const THERAPY_JS_DAY_TO_KEY=['sun','mon','tue','wed','thu','fri','sat'];

  function normalizedTherapyDays(therapy={}){
    const raw=Array.isArray(therapy.therapyDays)?therapy.therapyDays.map(String):[];
    const valid=THERAPY_DAY_KEYS.filter(k=>raw.includes(k));
    return valid.length?valid:[...THERAPY_DAY_KEYS];
  }

  function therapyDaysEditorHtml(item={}){
    const selected=new Set(normalizedTherapyDays(item));
    return `<div class="form-group full"><label>Giorni di assunzione</label><div style="display:flex;flex-wrap:wrap;gap:8px 14px;padding:10px 0">${THERAPY_DAY_KEYS.map(k=>`<label style="display:inline-flex;align-items:center;gap:6px;font-weight:600"><input type="checkbox" name="therapyDay_${k}" ${selected.has(k)?'checked':''}>${THERAPY_DAY_LABELS[k]}</label>`).join('')}</div><small class="field-help">Per dosaggi diversi nella settimana registra una riga per ogni dosaggio e seleziona i relativi giorni. Esempio: Eutirox 150 µg Lun-Ven e Eutirox 175 µg Sab-Dom.</small></div>`;
  }

  function therapyDaysFromForm(v={}){
    const selected=THERAPY_DAY_KEYS.filter(k=>v[`therapyDay_${k}`]==='on');
    return selected.length?selected:[...THERAPY_DAY_KEYS];
  }

  function therapyScheduleText(therapy={}){
    const days=normalizedTherapyDays(therapy);
    const everyDay=days.length===THERAPY_DAY_KEYS.length;
    const dayText=everyDay?'':`Giorni: ${days.map(k=>THERAPY_DAY_LABELS[k]).join(', ')}`;
    const detail=String(therapy.frequency||therapy.notes||'').trim();
    const effective=(validTherapyPlanDate(therapy.doseEffectiveDate)&&therapy.doseEffectiveDate!==therapy.packStartDate)?`Piano attuale dal ${formatDate(therapy.doseEffectiveDate)}`:'';
    return [dayText,detail,effective].filter(Boolean).join(' · ');
  }

  function validTherapyPlanDate(value=''){
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value||''));
  }

  function therapyPlanSignature(dailyUnits=0,therapyDays=[]){
    const units=Number(dailyUnits||0);
    const days=THERAPY_DAY_KEYS.filter(k=>(therapyDays||[]).map(String).includes(k));
    return `${Number.isFinite(units)?units:0}|${(days.length?days:THERAPY_DAY_KEYS).join(',')}`;
  }

  function normalizedDosePlanHistory(therapy={}){
    const start=String(therapy.packStartDate||'');
    return (Array.isArray(therapy.dosePlanHistory)?therapy.dosePlanHistory:[])
      .map(row=>({
        from:String(row?.from||''),
        to:String(row?.to||''),
        dailyUnits:Number(row?.dailyUnits||0),
        therapyDays:normalizedTherapyDays(row||{}),
        scope:String(row?.scope||'')
      }))
      .filter(row=>validTherapyPlanDate(row.from)&&validTherapyPlanDate(row.to)&&row.from<row.to&&row.dailyUnits>0&&(!start||row.to>start))
      .sort((a,b)=>a.from.localeCompare(b.from));
  }

  function truncateDosePlanHistory(history=[],cutDate=''){
    if(!validTherapyPlanDate(cutDate))return history;
    const result=[];
    for(const row of history){
      if(row.from>=cutDate)continue;
      if(row.to>cutDate)result.push({...row,to:cutDate});
      else result.push({...row});
    }
    return result.filter(row=>row.from<row.to);
  }

  function prepareTherapyDosePlan(item={},draft={},requestedEffectiveDate=''){
    const clean={...draft};
    delete clean.planEffectiveDate;
    for(const key of THERAPY_DAY_KEYS)delete clean[`therapyDay_${key}`];

    const newStart=String(clean.packStartDate||'').trim();
    const oldStart=String(item.packStartDate||'').trim();
    const newDays=normalizedTherapyDays(clean);
    const oldDays=normalizedTherapyDays(item);
    clean.therapyDays=newDays;
    // Dal correttivo pubblico 1.0.0-r3 dailyUnits è dichiarato esplicitamente
    // come quantità PER SINGOLA SOMMINISTRAZIONE. Il marcatore di riga serve
    // a distinguere con certezza i dati nuovi dalle cronologie legacy, nelle
    // quali il totale giornaliero era stato propagato su più righe.
    clean.dailyUnitsScope='per-intake-v3';

    if(!item?.id||newStart!==oldStart){
      clean.dosePlanHistory=[];
      clean.doseEffectiveDate=validTherapyPlanDate(newStart)?newStart:'';
      return clean;
    }

    const oldSignature=therapyPlanSignature(item.dailyUnits,oldDays);
    const newSignature=therapyPlanSignature(clean.dailyUnits,newDays);
    const currentFrom=validTherapyPlanDate(item.doseEffectiveDate)?String(item.doseEffectiveDate):oldStart;
    let history=normalizedDosePlanHistory(item);

    if(oldSignature===newSignature){
      clean.dosePlanHistory=history;
      clean.doseEffectiveDate=currentFrom||newStart;
      return clean;
    }

    let effective=String(requestedEffectiveDate||'').trim();
    if(!validTherapyPlanDate(effective))effective=today();
    if(validTherapyPlanDate(newStart)&&effective<newStart)effective=newStart;

    history=truncateDosePlanHistory(history,effective);

    if(validTherapyPlanDate(currentFrom)&&effective>currentFrom&&Number(item.dailyUnits||0)>0){
      history.push({
        from:currentFrom,
        to:effective,
        dailyUnits:Number(item.dailyUnits),
        therapyDays:oldDays,
        scope:'per-intake-v2'
      });
    }

    clean.dosePlanHistory=history.sort((a,b)=>a.from.localeCompare(b.from));
    clean.doseEffectiveDate=effective;
    return clean;
  }

  function therapyDosePlanForDate(therapy={},dateText=''){
    const history=normalizedDosePlanHistory(therapy);
    for(const row of history){
      if(dateText>=row.from&&dateText<row.to)return {dailyUnits:row.dailyUnits,therapyDays:row.therapyDays,fromHistory:true,historyFrom:row.from,historyTo:row.to,historyScope:row.scope||''};
    }
    return {dailyUnits:Number(therapy.dailyUnits||0),therapyDays:normalizedTherapyDays(therapy),fromHistory:false,historyFrom:'',historyTo:'',historyScope:'per-intake-v2'};
  }


  function medicationReorderDateAdd(dateText='',days=0){
    const d=new Date(`${dateText}T12:00:00`);
    if(Number.isNaN(d.getTime()))return'';
    d.setDate(d.getDate()+Number(days||0));
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  function medicationReorderDaysBetween(a='',b=''){
    const da=new Date(`${a}T12:00:00`),db=new Date(`${b}T12:00:00`);
    if(Number.isNaN(da.getTime())||Number.isNaN(db.getTime()))return Infinity;
    return Math.round((db-da)/86400000);
  }

  function medicationReorderHash(value=''){
    let h=2166136261;
    for(const ch of String(value||'')){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}
    return (h>>>0).toString(36);
  }

  function medicationReorderDisplayName(therapy={}){
    return String(therapy.medication||therapy.activeIngredient||'Farmaco').trim()||'Farmaco';
  }

  function medicationReorderLeadDays(therapy={}){
    const raw=Number(therapy.reorderLeadDays??MEDICATION_REORDER_LEAD_DAYS);
    return Math.max(1,Math.min(60,Number.isFinite(raw)?Math.round(raw):MEDICATION_REORDER_LEAD_DAYS));
  }

  function medicationRequiresPrescription(therapy={}){
    return therapy.requiresPrescription!==false;
  }

  function medicationStockNorm(value=''){
    return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase()
      .replace(/[^A-Z0-9]+/g,' ').replace(/\s+/g,' ').trim();
  }

  function medicationStockKey(therapy={}){
    const medication=medicationStockNorm(therapy.medication||therapy.activeIngredient||'');
    if(!medication)return'';
    const dosage=medicationStockNorm(therapy.dosage||'');
    return `${medication}|${dosage}`;
  }

  function hasMedicationStockConfiguration(therapy={}){
    return Boolean(
      therapy.reorderEnabled ||
      Number(therapy.packUnits||0)>0 ||
      String(therapy.packStartDate||'').trim()
    );
  }

  function medicationStockPayload(source={}){
    return {
      reorderEnabled:Boolean(source.reorderEnabled),
      requiresPrescription:medicationRequiresPrescription(source),
      reorderLeadDays:medicationReorderLeadDays(source),
      packUnits:source.packUnits??'',
      packCount:Math.max(1,Math.floor(Number(source.packCount||1))),
      packStartDate:String(source.packStartDate||'')
    };
  }

  async function synchronizeMedicationStockSettings(saved={},options={}){
    if(!saved?.profileId||!saved?.id)return saved;
    const key=medicationStockKey(saved);
    if(!key)return saved;

    const all=await DossierDB.byProfile('therapies',saved.profileId);
    const same=(all||[]).filter(row=>medicationStockKey(row)===key);
    if(same.length<2)return saved;

    const existingConfigured=same
      .filter(row=>String(row.id)!==String(saved.id)&&hasMedicationStockConfiguration(row))
      .sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')))[0];

    const savedIsConfiguration=hasMedicationStockConfiguration(saved);
    const preferSaved=Boolean(options.preferSaved)||savedIsConfiguration||!existingConfigured;
    const source=preferSaved?saved:existingConfigured;
    const payload=medicationStockPayload(source);
    const now=new Date().toISOString();

    let result=saved;
    for(const row of same){
      const updated={...row,...payload,updatedAt:String(row.id)===String(saved.id)?saved.updatedAt||now:now};
      await DossierDB.put('therapies',updated,{details:{event:'therapy-stock-shared',sourceTherapyId:source.id}});
      if(String(updated.id)===String(saved.id))result=updated;
    }
    return result;
  }

  function medicationStockPayloadEqual(row={},payload={}){
    return (
      Boolean(row.reorderEnabled)===Boolean(payload.reorderEnabled) &&
      medicationRequiresPrescription(row)===Boolean(payload.requiresPrescription) &&
      medicationReorderLeadDays(row)===Number(payload.reorderLeadDays||MEDICATION_REORDER_LEAD_DAYS) &&
      String(row.packUnits??'')===String(payload.packUnits??'') &&
      Number(row.packCount||1)===Number(payload.packCount||1) &&
      String(row.packStartDate||'')===String(payload.packStartDate||'')
    );
  }

  async function repairSharedMedicationStockSettings(profileId='',therapies=[]){
    if(!profileId||!Array.isArray(therapies)||therapies.length<2)return {changed:false,therapies};
    const groups=new Map();
    for(const row of therapies){
      const key=medicationStockKey(row);
      if(!key)continue;
      if(!groups.has(key))groups.set(key,[]);
      groups.get(key).push(row);
    }

    let changed=false;
    for(const rows of groups.values()){
      if(rows.length<2)continue;
      const source=rows
        .filter(hasMedicationStockConfiguration)
        .sort((a,b)=>String(b.updatedAt||b.createdAt||'').localeCompare(String(a.updatedAt||a.createdAt||'')))[0];
      if(!source)continue;
      const payload=medicationStockPayload(source);
      const now=new Date().toISOString();

      for(const row of rows){
        if(medicationStockPayloadEqual(row,payload))continue;
        const updated={...row,...payload,updatedAt:now};
        await DossierDB.put('therapies',updated,{
          details:{event:'therapy-stock-shared-repair',sourceTherapyId:source.id}
        });
        changed=true;
      }
    }

    return {
      changed,
      therapies:changed?await DossierDB.byProfile('therapies',profileId):therapies
    };
  }


  async function repairLegacyMedicationDoseHistory(profileId='',therapies=[]){
    if(!profileId||!Array.isArray(therapies)||therapies.length<2)return {changed:false,therapies};
    const groups=new Map();
    for(const row of therapies){
      const key=medicationStockKey(row);
      if(!key)continue;
      if(!groups.has(key))groups.set(key,[]);
      groups.get(key).push(row);
    }

    let changed=false;
    const now=new Date().toISOString();
    for(const rows of groups.values()){
      const active=rows.filter(row=>row&&row.active!==false);
      if(active.length<2)continue;
      const currentTotal=medicationReorderCurrentDailyUnits(active);
      if(!(currentTotal>0))continue;

      const occurrences=new Map();
      for(const row of active){
        const history=normalizedDosePlanHistory(row);
        history.forEach((entry,index)=>{
          const days=(entry.therapyDays&&entry.therapyDays.length?entry.therapyDays:THERAPY_DAY_KEYS).map(String).sort().join(',');
          const signature=`${entry.from}|${entry.to}|${Number(entry.dailyUnits||0)}|${days}`;
          if(!occurrences.has(signature))occurrences.set(signature,[]);
          occurrences.get(signature).push({row,index,entry});
        });
      }

      const legacySignatures=new Set();
      for(const [signature,items] of occurrences){
        if(items.length<2)continue;
        const units=Number(items[0].entry.dailyUnits||0);
        // La vecchia semantica propagava il TOTALE giornaliero su tutte le righe.
        // Il caso è riconoscibile quando la stessa identica fascia storica è
        // duplicata su più somministrazioni e quel valore è almeno pari al totale
        // corrente del farmaco. Non tocchiamo cronologie nuove esplicitamente v3.
        const allExplicitV3=items.every(({row})=>String(row.dailyUnitsScope||'')==='per-intake-v3');
        if(!allExplicitV3&&units>0&&units+0.0000001>=currentTotal)legacySignatures.add(signature);
      }
      if(!legacySignatures.size)continue;

      for(const row of active){
        const raw=Array.isArray(row.dosePlanHistory)?row.dosePlanHistory:[];
        if(!raw.length)continue;
        let rowChanged=false;
        const fixed=raw.map(entry=>{
          const normalized={
            from:String(entry?.from||''),to:String(entry?.to||''),dailyUnits:Number(entry?.dailyUnits||0),
            therapyDays:normalizedTherapyDays(entry||{})
          };
          const days=(normalized.therapyDays&&normalized.therapyDays.length?normalized.therapyDays:THERAPY_DAY_KEYS).map(String).sort().join(',');
          const signature=`${normalized.from}|${normalized.to}|${Number(normalized.dailyUnits||0)}|${days}`;
          if(!legacySignatures.has(signature)||String(entry?.scope||'')==='legacy-group-total-v1')return entry;
          rowChanged=true;
          return {...entry,scope:'legacy-group-total-v1'};
        });
        if(!rowChanged)continue;
        await DossierDB.put('therapies',{...row,dosePlanHistory:fixed,updatedAt:now},{details:{event:'therapy-dose-history-legacy-repair'}});
        changed=true;
      }
    }
    return {changed,therapies:changed?await DossierDB.byProfile('therapies',profileId):therapies};
  }

  function medicationReorderDailyUsageForRows(rows=[],dateText=''){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(dateText||'')))return 0;
    const d=new Date(`${dateText}T12:00:00`);
    if(Number.isNaN(d.getTime()))return 0;
    const dayKey=THERAPY_JS_DAY_TO_KEY[d.getDay()];
    const active=(rows||[]).filter(therapy=>therapy&&therapy.active!==false);
    if(!active.length)return 0;

    const plans=active.map(therapy=>({therapy,plan:therapyDosePlanForDate(therapy,dateText)}));

    // Compatibilità con i dati creati PRIMA della semantica per singola
    // somministrazione. In quelle versioni il totale giornaliero poteva essere
    // copiato su più righe e, durante il passaggio precedente, alcune cronologie
    // sono state marcate erroneamente per-intake-v2 pur continuando a rappresentare
    // il totale del FARMACO. Il marcatore storico esplicito prevale; inoltre, per i
    // dati non ancora migrati, riconosciamo la stessa fascia duplicata su più righe.
    const currentTotal=medicationReorderCurrentDailyUnits(active);
    const currentMax=Math.max(...active.map(row=>Math.max(0,Number(row.dailyUnits||0))),0);
    const historyGroups=new Map();
    for(const item of plans){
      const {therapy,plan}=item;
      if(!plan.fromHistory)continue;
      const days=(plan.therapyDays&&plan.therapyDays.length?plan.therapyDays:THERAPY_DAY_KEYS).map(String).sort().join(',');
      const signature=`${plan.historyFrom}|${plan.historyTo}|${Number(plan.dailyUnits||0)}|${days}`;
      if(!historyGroups.has(signature))historyGroups.set(signature,[]);
      historyGroups.get(signature).push(item);
    }
    for(const items of historyGroups.values()){
      const plan=items[0].plan;
      const units=Number(plan.dailyUnits||0);
      const allowed=new Set((plan.therapyDays&&plan.therapyDays.length?plan.therapyDays:THERAPY_DAY_KEYS).map(String));
      const explicitLegacy=items.some(x=>x.plan.historyScope==='legacy-group-total-v1');
      const duplicatedUnmigrated=items.length>1&&items.some(x=>String(x.therapy.dailyUnitsScope||'')!=='per-intake-v3');
      const partialUnmigrated=items.length===1&&plans.some(x=>!x.plan.fromHistory)&&String(items[0].therapy.dailyUnitsScope||'')!=='per-intake-v3';
      if(units>0&&allowed.has(dayKey)&&(explicitLegacy||duplicatedUnmigrated||partialUnmigrated)&&(units+0.0000001>=currentTotal||units>currentMax+0.0000001))return units;
    }

    let total=0;
    for(const {plan} of plans){
      const units=Number(plan.dailyUnits||0);
      if(!(units>0))continue;
      const allowed=new Set((plan.therapyDays&&plan.therapyDays.length?plan.therapyDays:THERAPY_DAY_KEYS).map(String));
      if(allowed.has(dayKey))total+=units;
    }
    return total;
  }

  function medicationReorderCurrentDailyUnits(rows=[]){
    return (rows||[])
      .filter(row=>row&&row.active!==false)
      .reduce((sum,row)=>sum+Math.max(0,Number(row.dailyUnits||0)),0);
  }

  function medicationReorderCurrentDays(rows=[]){
    const set=new Set();
    for(const row of rows||[]){
      if(!row||row.active===false)continue;
      for(const key of normalizedTherapyDays(row))set.add(String(key));
    }
    return THERAPY_DAY_KEYS.filter(key=>set.has(key));
  }

  function medicationReorderDepletionDateForRows(rows=[],startDate='',totalUnits=0){
    let remaining=Number(totalUnits||0);
    if(!(remaining>0)||!/^\d{4}-\d{2}-\d{2}$/.test(String(startDate||'')))return'';

    let cursor=String(startDate);
    for(let guard=0;guard<36525;guard++){
      const dailyUsage=medicationReorderDailyUsageForRows(rows,cursor);
      if(dailyUsage>0){
        if(remaining+0.0000001<dailyUsage)return cursor;
        remaining-=dailyUsage;
        if(remaining<=0.0000001)return medicationReorderDateAdd(cursor,1);
      }
      cursor=medicationReorderDateAdd(cursor,1);
      if(!cursor)return'';
    }
    return'';
  }

  function medicationReorderCandidateForStock(rows=[],todayText=today()){
    if(!globalThis.DossierFeatures?.has?.('stockAutomation'))return null;
    const all=(rows||[]).filter(Boolean);
    const active=all.filter(row=>row.active!==false);
    if(!active.length)return null;

    const source=all
      .filter(hasMedicationStockConfiguration)
      .sort((a,b)=>String(b.updatedAt||b.createdAt||'').localeCompare(String(a.updatedAt||a.createdAt||'')))[0];
    if(!source||!source.reorderEnabled)return null;

    const packUnits=Number(source.packUnits||0);
    const packCount=Math.max(1,Math.floor(Number(source.packCount||1)));
    const totalUnits=packUnits*packCount;
    const startDate=String(source.packStartDate||'').trim();
    if(!(packUnits>0)||!(totalUnits>0)||!/^\d{4}-\d{2}-\d{2}$/.test(startDate))return null;

    const dailyUnits=medicationReorderCurrentDailyUnits(active);
    if(!(dailyUnits>0))return null;

    const depletionDate=medicationReorderDepletionDateForRows(active,startDate,totalUnits);
    if(!depletionDate)return null;

    const durationDays=Math.max(1,medicationReorderDaysBetween(startDate,depletionDate));
    const reorderLeadDays=medicationReorderLeadDays(source);
    const requiresPrescription=medicationRequiresPrescription(source);
    const reorderDate=medicationReorderDateAdd(depletionDate,-reorderLeadDays);
    if(!reorderDate)return null;
    if(active.some(row=>String(row.reorderResolvedDate||'')===reorderDate))return null;

    const sourceTherapyIds=[...new Set(active.map(row=>String(row.id||'')).filter(Boolean))].sort();
    const therapyDays=medicationReorderCurrentDays(active);
    const stockKey=medicationStockKey(source)||`therapy:${source.id}`;
    const hasDoseHistory=active.some(row=>Array.isArray(row.dosePlanHistory)&&row.dosePlanHistory.length);
    const scheduleSummary=active
      .map(row=>{
        const units=Number(row.dailyUnits||0);
        const when=String(row.time||row.schedule||'').trim();
        return units>0?`${when||'orario non indicato'}: ${units}`:'';
      })
      .filter(Boolean)
      .join(' + ');

    return {
      therapyId:String(source.id||sourceTherapyIds[0]||''),
      sourceTherapyIds,
      stockKey,
      medication:medicationReorderDisplayName(source),
      packUnits,
      packCount,
      totalUnits,
      dailyUnits,
      therapyDays,
      intakeCount:active.length,
      scheduleSummary,
      hasDoseHistory,
      durationDays,
      depletionDate,
      reorderDate,
      reorderLeadDays,
      requiresPrescription
    };
  }

  function medicationReorderCandidate(therapy={},todayText=today()){
    return medicationReorderCandidateForStock([therapy],todayText);
  }

  function medicationReorderStockCandidates(therapies=[],todayText=today()){
    const groups=new Map();
    for(const therapy of therapies||[]){
      if(!therapy)continue;
      const key=medicationStockKey(therapy)||`therapy:${therapy.id}`;
      if(!groups.has(key))groups.set(key,[]);
      groups.get(key).push(therapy);
    }

    const rows=[];
    for(const [stockKey,stockRows] of groups){
      const candidate=medicationReorderCandidateForStock(stockRows,todayText);
      if(candidate)rows.push({...candidate,stockKey});
    }
    return rows.sort((a,b)=>a.depletionDate.localeCompare(b.depletionDate)||a.medication.localeCompare(b.medication,'it',{sensitivity:'base'}));
  }

  function medicationReorderGroups(therapies=[],groupDays=7,todayText=today()){
    const maxGap=Math.max(0,Math.min(10,Number(groupDays)||0));
    const rows=medicationReorderStockCandidates(therapies,todayText);
    const prescriptionRows=rows.filter(row=>row.requiresPrescription!==false).sort((a,b)=>a.reorderDate.localeCompare(b.reorderDate));
    const purchaseRows=rows.filter(row=>row.requiresPrescription===false).sort((a,b)=>a.reorderDate.localeCompare(b.reorderDate));

    const groups=[];
    for(const row of prescriptionRows){
      const current=groups.at(-1);
      if(!current||medicationReorderDaysBetween(current[0].reorderDate,row.reorderDate)>maxGap)groups.push([row]);
      else current.push(row);
    }
    for(const row of purchaseRows)groups.push([row]);
    return groups.sort((a,b)=>String(a[0]?.reorderDate||'9999').localeCompare(String(b[0]?.reorderDate||'9999')));
  }

  function medicationReorderEventFromGroup(profile={},group=[],reminderMinutes=[1440]){
    if(!profile?.id||!group.length)return null;
    const ids=[...new Set(group.flatMap(x=>x.sourceTherapyIds||[x.therapyId]).map(String).filter(Boolean))].sort();
    const stockKeys=[...new Set(group.map(x=>String(x.stockKey||x.therapyId||'')).filter(Boolean))].sort();
    const reorderDate=group.map(x=>x.reorderDate).sort()[0];
    const medicines=[...new Set(group.map(x=>x.medication))];
    const firstName=String(profile.firstName||profile.name||'Profilo').trim()||'Profilo';
    const requiresPrescription=group.every(x=>x.requiresPrescription!==false);
    const title=requiresPrescription?`${firstName}: ${medicines.join(' + ')} il ${formatDate(reorderDate)}`:`${firstName}: riordino ${medicines.join(' + ')} il ${formatDate(reorderDate)}`;
    const notes=[
      requiresPrescription?'Promemoria automatico per la richiesta/riordino dei farmaci con ricetta, calcolato dalla scheda Terapie.':'Promemoria automatico di acquisto/riordino per farmaco senza ricetta, calcolato dalla scheda Terapie.',
      ...group.map(x=>`${x.medication}: ${x.packCount} ${x.packCount===1?'confezione':'confezioni'} × ${x.packUnits} unità = ${x.totalUnits} unità totali · consumo complessivo attuale ${x.dailyUnits} unità/giorno calcolato sommando ${x.intakeCount||1} ${Number(x.intakeCount||1)===1?'somministrazione':'somministrazioni'}${x.scheduleSummary?` (${x.scheduleSummary})`:''}${x.hasDoseHistory?' · consumo precedente già conteggiato':''} · copertura completa ${x.durationDays} giorni · nuova confezione necessaria dal ${formatDate(x.depletionDate)}.`)
    ].join('\n');
    const now=new Date().toISOString();
    return {
      id:`therapy-reorder-${profile.id}-${medicationReorderHash(stockKeys.join('|'))}`,
      profileId:profile.id,
      category:requiresPrescription?'Ricetta':'Altro',
      title,
      startDate:reorderDate,
      startTime:'09:00',
      allDay:false,
      durationMinutes:30,
      status:'planned',
      doctorId:'',
      doctorName:'',
      location:'',
      notes,
      reminders:[...new Set((reminderMinutes||[]).map(Number).filter(v=>CALENDAR_REMINDER_VALUES.has(v)))].slice(0,5),
      recurrence:'none',
      sourceKind:'therapy-reorder',
      medicationReorderMode:requiresPrescription?'prescription':'purchase',
      requiresPrescription,
      reorderLeadDays:Math.max(...group.map(x=>Number(x.reorderLeadDays||MEDICATION_REORDER_LEAD_DAYS))),
      sourceTherapyIds:ids,
      medicationStockKeys:stockKeys,
      medicationNames:medicines,
      medicationReorder:true,
      medicationReorderItems:group.map(x=>({stockKey:x.stockKey,therapyId:x.therapyId,sourceTherapyIds:x.sourceTherapyIds||[x.therapyId],medication:x.medication,packUnits:x.packUnits,packCount:x.packCount,totalUnits:x.totalUnits,dailyUnits:x.dailyUnits,therapyDays:x.therapyDays,intakeCount:x.intakeCount||1,scheduleSummary:x.scheduleSummary||'',depletionDate:x.depletionDate,reorderDate:x.reorderDate,reorderLeadDays:x.reorderLeadDays,requiresPrescription:x.requiresPrescription!==false})),
      medicationReorderGroupDays:Math.max(0,Math.min(10,Number((state.globalPreferences||{}).medicationReorderGroupDays??7))),
      createdAt:now,
      updatedAt:now
    };
  }

  function medicationReorderEventEquivalent(a={},b={}){
    const keys=['title','category','startDate','startTime','allDay','durationMinutes','status','notes','sourceKind','medicationReorderMode','requiresPrescription','reorderLeadDays'];
    if(keys.some(k=>String(a[k]??'')!==String(b[k]??'')))return false;
    const ar=(a.reminders||[]).map(Number).sort((x,y)=>x-y),br=(b.reminders||[]).map(Number).sort((x,y)=>x-y);
    const ai=(a.sourceTherapyIds||[]).map(String).sort(),bi=(b.sourceTherapyIds||[]).map(String).sort();
    const ak=(a.medicationStockKeys||[]).map(String).sort(),bk=(b.medicationStockKeys||[]).map(String).sort();
    return JSON.stringify(ar)===JSON.stringify(br)&&JSON.stringify(ai)===JSON.stringify(bi)&&JSON.stringify(ak)===JSON.stringify(bk);
  }

  async function syncMedicationReorderAgenda(profile=activeProfile()){
    if(!globalThis.DossierFeatures?.has?.('reorderAutomation'))return false;
    if(!profile?.id)return false;
    const therapies=await DossierDB.byProfile('therapies',profile.id);
    const prefs={...DEFAULT_GLOBAL_PREFS,...state.globalPreferences};
    const groupDays=Math.max(0,Math.min(10,Number(prefs.medicationReorderGroupDays??7)));
    const medicationReminders=calendarDefaultReminders();
    const desiredGroups=medicationReorderGroups(therapies,groupDays,today());
    const desiredRows=desiredGroups.map(g=>medicationReorderEventFromGroup(profile,g,medicationReminders)).filter(Boolean);
    const desired=new Map(desiredRows.map(x=>[x.id,x]));
    const rows=await DossierDB.byProfile('calendarEvents',profile.id);
    const existing=(rows||[]).filter(x=>x.sourceKind==='therapy-reorder');
    let changed=false;

    for(const old of existing){
      if(desired.has(old.id))continue;
      try{await DossierCalendar.googleAdvancedDeleteEvent(old.id);}catch{}
      try{await DossierCalendar.cancelLocal(old.id);}catch{}
      try{await DossierCalendar.cancelMedicationLocal(old.id,profile.id);}catch{}
      await DossierDB.del('calendarEvents',old.id,{details:{event:'therapy-reorder-remove'}});
      changed=true;
    }

    let googleStatus=null;
    try{googleStatus=await DossierCalendar.googleAdvancedStatus();}catch{}
    const medicationGoogleFeature=Boolean(globalThis.DossierFeatures?.has?.('googleMedicationSync'));
    if(!medicationGoogleFeature&&googleStatus?.medicationDataConsent?.granted){
      try{await DossierCalendar.googleAdvancedSetMedicationConsent(false);googleStatus=await DossierCalendar.googleAdvancedStatus();}catch{}
    }
    const canSyncGoogle=Boolean(
      medicationGoogleFeature &&
      googleStatus?.connected &&
      googleStatus?.healthDataConsent?.granted &&
      googleStatus?.medicationDataConsent?.granted
    );
    const profileName=[profile.firstName,profile.lastName].filter(Boolean).join(' ');

    for(const desiredRow of desiredRows){
      const old=existing.find(x=>x.id===desiredRow.id);
      let row=desiredRow;
      if(old&&medicationReorderEventEquivalent(old,desiredRow)){
        row={...old,medicationNames:desiredRow.medicationNames,sourceTherapyIds:desiredRow.sourceTherapyIds,medicationStockKeys:desiredRow.medicationStockKeys,medicationReorderItems:desiredRow.medicationReorderItems,medicationReorderGroupDays:desiredRow.medicationReorderGroupDays,medicationReorder:true};
        try{await DossierCalendar.cancelLocal(row.id);}catch{}
        try{await DossierCalendar.scheduleMedicationLocal(row,profileName);}catch(error){console.warn('Promemoria farmaci Windows non aggiornato:',error);}
      }else{
        row={...desiredRow,createdAt:old?.createdAt||desiredRow.createdAt,updatedAt:new Date().toISOString()};
        try{await DossierCalendar.cancelLocal(row.id);}catch{}
        try{const local=await DossierCalendar.scheduleMedicationLocal(row,profileName);row.localAlertStatus=local.scheduled?'scheduled':'none';row.localAlertCount=local.scheduled?1:0;row.localAlertError=local.error||'';row.localAlertUpdatedAt=new Date().toISOString();}catch(error){row.localAlertStatus='error';row.localAlertError=error.message;}
        await DossierDB.put('calendarEvents',row,{details:{event:old?'therapy-reorder-update':'therapy-reorder-create'}});
        changed=true;
      }
      if(canSyncGoogle){
        try{await DossierCalendar.googleAdvancedSyncEvent(row,profileName,true);}catch(error){console.warn('Promemoria riordino non sincronizzato con Google Calendar:',error);}
      }
    }
    return changed;
  }

  async function reconcileMedicationBackgroundActions(profileId=''){
    if(!profileId||!globalThis.DossierCalendar?.medicationLocalActions)return false;
    let payload=null;try{payload=await DossierCalendar.medicationLocalActions(profileId);}catch{return false;}
    const actions=Array.isArray(payload?.actions)?payload.actions:[];if(!actions.length)return false;
    const therapies=await DossierDB.byProfile('therapies',profileId);let changed=false;const consumed=[];
    for(const action of actions){
      if(action.type!=='purchased'||!action.stockKey)continue;
      const matched=therapies.filter(row=>medicationStockKey(row)===String(action.stockKey));if(!matched.length)continue;
      const purchase={purchasedAt:String(action.purchasedAt||new Date().toISOString()),purchaseDate:String(action.purchaseDate||'').slice(0,10),cycleStartDate:String(action.cycleStartDate||''),previousDepletionDate:String(action.previousDepletionDate||''),packCount:Number(action.packCount||matched[0].packCount||1),packUnits:Number(action.packUnits||matched[0].packUnits||0)};
      for(const row of matched){
        const history=Array.isArray(row.stockPurchaseHistory)?row.stockPurchaseHistory.slice(-49):[];
        const updated={...row,packStartDate:purchase.cycleStartDate||row.packStartDate,lastStockPurchaseAt:purchase.purchasedAt,lastStockPurchaseDate:purchase.purchaseDate,stockPurchaseHistory:[...history,purchase],updatedAt:new Date().toISOString()};
        await DossierDB.put('therapies',updated,{details:{event:'therapy-stock-purchased-background'}});changed=true;
      }
      consumed.push(String(action.id||''));
    }
    if(consumed.length)try{await DossierCalendar.consumeMedicationLocalActions(consumed);}catch{}
    return changed;
  }

  async function loadProfileData({deferCalendarMaintenance=false}={}) {
    if(!state.activeProfileId){state.documents=[];state.doctors=[];state.therapies=[];state.exemptions=[];state.diagnoses=[];state.measurements=[];state.weightJourneys=[];state.documentVersions=[];state.calendarEvents=[];state.calendarSuggestions=[];state.calendarFamilySuggestions=[];return;}
    await reconcileMedicationBackgroundActions(state.activeProfileId);
    [state.documents,state.doctors,state.therapies,state.exemptions,state.diagnoses,state.measurements,state.weightJourneys,state.documentVersions,state.calendarEvents,state.calendarSuggestions]=await Promise.all([
      DossierDB.byProfile('documents',state.activeProfileId),DossierDB.byProfile('doctors',state.activeProfileId),DossierDB.byProfile('therapies',state.activeProfileId),DossierDB.byProfile('exemptions',state.activeProfileId),DossierDB.byProfile('diagnoses',state.activeProfileId),DossierDB.byProfile('measurements',state.activeProfileId),DossierDB.byProfile('weightJourneys',state.activeProfileId),DossierDB.byProfile('documentVersions',state.activeProfileId),DossierDB.byProfile('calendarEvents',state.activeProfileId),DossierDB.byProfile('calendarSuggestions',state.activeProfileId)
    ]);
    state.therapies=await repairTherapyIngredientsForProfile(state.activeProfileId,state.therapies);
    const doseHistoryRepair=await repairLegacyMedicationDoseHistory(state.activeProfileId,state.therapies);
    state.therapies=doseHistoryRepair.therapies;
    const sharedStockRepair=await repairSharedMedicationStockSettings(state.activeProfileId,state.therapies);
    state.therapies=sharedStockRepair.therapies;
    state.measurements.sort((a,b)=>measurementDateTime(a).localeCompare(measurementDateTime(b)));
    state.weightJourneys.sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
    state.documentVersions.sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
    applyReferenceSourcesToDocuments(state.documents,activeProfile()||{});
    try{state.diagnoses=await repairDiagnosesForProfile(state.activeProfileId,state.diagnoses);}catch(error){console.error('TEST 36: consolidamento diagnosi non completato',error);state.diagnoses=mergeDiagnosisRecords(state.diagnoses).merged;}
    state.documents.sort(compareDocs);
    state.calendarEvents.sort((a,b)=>calendarEventDateTime(a).localeCompare(calendarEventDateTime(b)));
    scheduleBookingArchiveMigration(state.activeProfileId,650);
    if(!deferCalendarMaintenance){
      await runProfileCalendarMaintenance(state.activeProfileId);
    }
  }

  let deferredProfileMaintenanceSerial=0;
  async function runDeferredProfileCalendarMaintenance(profileId=''){
    const serial=++deferredProfileMaintenanceSerial;
    // Lascia che la nuova scheda profilo venga dipinta prima di eventuali I/O
    // Calendar/Google. Il cambio profilo non resta più in attesa della rete.
    await new Promise(resolve=>setTimeout(resolve,0));
    if(!profileId||serial!==deferredProfileMaintenanceSerial||state.activeProfileId!==profileId)return;
    try{await runProfileCalendarMaintenance(profileId,{serial});}
    catch(error){console.warn('Manutenzione Agenda differita non completata',error);}
  }

  async function runProfileCalendarMaintenance(profileId='',guard={}){
    if(!profileId||state.activeProfileId!==profileId)return;
    const stale=()=>Boolean(guard.serial&&(guard.serial!==deferredProfileMaintenanceSerial||state.activeProfileId!==profileId));
    await cleanLegacyCalendarEvents();if(stale())return;
    await rollForwardYearlyCalendarEvents();if(stale())return;
    const healthCardAgendaChanged=await syncHealthCardExpiryAgenda(activeProfile());if(stale())return;
    const medicationAgendaChanged=await syncMedicationReorderAgenda(activeProfile());if(stale())return;
    if(healthCardAgendaChanged||medicationAgendaChanged)state.calendarEvents=await DossierDB.byProfile('calendarEvents',profileId);
    state.calendarEvents.sort((a,b)=>calendarEventDateTime(a).localeCompare(calendarEventDateTime(b)));
    await refreshCalendarSuggestionsFromDocuments();if(stale())return;
    ensureCalendarReminderLoop();
    void syncLocalCalendarAlerts({silent:true});
    if(['calendar','dashboard','therapies'].includes(state.activeView)&&state.activeProfileId===profileId)renderView();
  }

  function compareDocs(a,b) {
    const ad = a.clinicalDate || '9999-12-31';
    const bd = b.clinicalDate || '9999-12-31';
    return ad.localeCompare(bd) || (a.addedAt || '').localeCompare(b.addedAt || '');
  }

  const VIEW_TITLES = {
    dashboard:['Panoramica','La situazione essenziale del profilo selezionato.'],
    timeline:['Cronologia clinica','Eventi ordinati per data clinica, anche se caricati successivamente.'],
    documents:['Documenti','Referti, immagini e PDF associati alla persona.'],
    graphs:['Grafici','Andamento storico dei valori estratti dai referti.'],
    compare:['Confronta','Ricerca e confronta valori, esami e documenti nel tempo.'],
    profile:['Dati personali','Anagrafica, tessera sanitaria e contatti principali.'],
    'health-card':['Tessera sanitaria','Visualizza, mostra e aggiorna fronte e retro della tessera sanitaria.'],
    doctors:['Medici e specialisti','Contatti dei professionisti che seguono la persona.'],
    therapies:['Terapie','Farmaci attivi, dosaggi, orari e note.'],
    exemptions:['Esenzioni','Codici, validità e documenti di esenzione.'],
    diagnoses:['Diagnosi e problemi principali','Quadro attuale e cronologia completa delle condizioni cliniche.'],
    'symptom-diary':['Diario sintomi','Sintomi, intensità, durata, localizzazione e andamento nel tempo.'],
    vaccinations:['Vaccinazioni','Dosi, date, strutture, documenti fonte e richiami collegati all’Agenda.'],
    interventions:['Interventi, procedure e dispositivi','Interventi, procedure, protesi e dispositivi impiantati con documenti collegati.'],
    calendar:['Agenda e scadenze','Visite, richiami, rinnovi e promemoria del profilo selezionato.'],
    'prepare-visit':['Prepara visita','Raccogli i documenti utili, aggiungi richieste e crea un fascicolo mirato per la visita.'],
    'search-dossier':['Cerca nel Dossier','Trova visite, referti, medici, diagnosi, terapie e appuntamenti già presenti nel Dossier.'],
    preferences:['Preferenze','Personalizza aspetto, sicurezza e impostazioni del Dossier.'],
    'access-log':['Registro accessi','Consultazioni e modifiche registrate per il profilo selezionato.'],
    interoperability:['Interoperabilità','FHIR, FSE e compatibilità dei dati tra piattaforme.'],
    backup:['Backup e ripristino','Copie locali, archivio fisico e recupero dei dati.'],
    help:['Aiuto','Informazioni essenziali per usare il Dossier Sanitario in modo semplice e consapevole.'],
    'monitor-home':['Monitoraggio personale','Misurazioni, parametri domestici e percorso del profilo attivo.'],
    'monitor-weight':['Percorso peso','Peso, obiettivo, differenze e stima orientativa del fabbisogno.'],
    'monitor-body':['Misurazioni corporee','Circonferenze corporee in centimetri, separate dal percorso peso.'],
    'monitor-pressure':['Pressione arteriosa e frequenza cardiaca','Archivio unificato di pressione e battito: puoi registrare sia misurazioni complete sia rilevazioni di sola frequenza cardiaca.'],
    'monitor-spo2':['Saturazione ossigeno','Storico delle misurazioni SpO₂ domestiche.'],
    'monitor-glucose':['Glicemia domestica','Misurazioni capillari distinte dai risultati di laboratorio.'],
    'monitor-heart':['Pressione arteriosa e frequenza cardiaca','La frequenza cardiaca è gestita nella stessa area della pressione arteriosa.'],
    'monitor-graphs':['Grafici monitoraggio','Andamento temporale dei parametri selezionati.'],
    'monitor-preferences':['Preferenze monitoraggio','Scegli tabelle, silhouette e grafici da inserire nel dossier.']
  };
  const PROFILE_INDEPENDENT_VIEWS = new Set(['preferences','backup','help']);
  let renderSequence = 0;
  function setViewHeader(view=state.activeView){
    const [title,subtitle]=VIEW_TITLES[view]||['Dossier Sanitario Locale','Sezione non disponibile.'];
    $('#viewTitle').textContent=title;
    $('#viewSubtitle').textContent=subtitle;
  }
  function viewRequiresProfile(view=state.activeView){return !PROFILE_INDEPENDENT_VIEWS.has(view);}

  function render() {
    clearObjectUrls();
    renderProfileSelect();
    setViewHeader();
    const hasProfiles = state.profiles.length > 0;
    const canOpenWithoutProfile = PROFILE_INDEPENDENT_VIEWS.has(state.activeView);
    const showEmptyState = !hasProfiles && !canOpenWithoutProfile;
    $('#emptyState').classList.toggle('hidden', !showEmptyState);
    $('#viewContainer').classList.toggle('hidden', showEmptyState);
    if(showEmptyState) $('#viewContainer').innerHTML='';
    $('#addDocumentBtn').disabled = !hasProfiles;
    $('#exportPdfBtn').disabled = !hasProfiles;
    if($('#doctorExportBtn')){$('#doctorExportBtn').disabled=!hasProfiles||!globalThis.DossierFeatures?.has?.('doctorVersion');$('#doctorExportBtn').title=globalThis.DossierFeatures?.has?.('doctorVersion')?'Versione per medico':DossierFeatures.message('doctorVersion');}
    applyPreferences();
    if (!showEmptyState) void renderView();
  }

  function renderProfileSelect() {
    const select = $('#profileSelect');
    select.innerHTML = state.profiles.length
      ? state.profiles.map(p => `<option value="${p.id}" ${p.id===state.activeProfileId?'selected':''}>${esc(p.firstName)} ${esc(p.lastName)}</option>`).join('')
      : '<option value="">Nessun profilo</option>';
    const p=activeProfile();const color=p?.preferences?.profileColor||state.profilePreferences.profileColor||'#0f766e';document.querySelector('.profile-switcher')?.style.setProperty('--profile-accent',color);document.documentElement.style.setProperty('--profile-accent',color);const dot=document.querySelector('#activeProfileColorDot');if(dot){dot.style.background=color;dot.title=p?`Colore del profilo ${p.firstName} ${p.lastName}`:'Colore del profilo';}const sideColor=document.querySelector('#sidebarColorPreview');if(sideColor){sideColor.style.background=color;sideColor.title=p?`Colore del profilo ${p.firstName} ${p.lastName}`:'Colore personalizzato';}const slot=$('#activeProfileAvatar');if(slot){slot.innerHTML=p?profileAvatarHtml(p,'profile-switcher-avatar'):'';}
  }

  function modernViewFrameMeta(view=state.activeView){
    const p=activeProfile();
    const data={
      timeline:{icon:'trend',tone:'rose',chips:[`${state.documents.length} documenti`,'Storico clinico']},
      documents:{icon:'document',tone:'blue',chips:[`${state.documents.length} documenti`,`${state.trashItems.filter(x=>x.profileId===state.activeProfileId).length} nel Cestino`]},
      graphs:{icon:'trend',tone:'teal',chips:[`${HealthCharts.collect(state.documents).length} rilevazioni valide`,'Serie cliniche']},
      compare:{icon:'trend',tone:'violet',chips:['Confronto temporale','Dati normalizzati']},
      profile:{icon:'profile',tone:'blue',chips:[p?`${esc(p.firstName||'')} ${esc(p.lastName||'')}`:'Profilo','Dati personali']},
      'health-card':{icon:'document',tone:'teal',chips:['Tessera sanitaria','Fronte e retro']},
      doctors:{icon:'profile',tone:'teal',chips:[`${state.doctors.length} contatti`,'Professionisti sanitari']},
      therapies:{icon:'therapy',tone:'violet',chips:[`${state.therapies.filter(x=>x.active!==false).length} attive`,`${state.therapies.length} totali`]},
      exemptions:{icon:'shield',tone:'green',chips:[`${state.exemptions.length} esenzioni`,'Documenti collegati']},
      diagnoses:{icon:'diagnosis',tone:'rose',chips:[`${state.diagnoses.length} condizioni`,`${state.diagnoses.filter(x=>x.mainProblem===true||String(x.mainProblem)==='true').length} principali`]},
      'symptom-diary':{icon:'diagnosis',tone:'rose',chips:['Diario clinico','Sintomi registrati']},
      vaccinations:{icon:'shield',tone:'teal',chips:['Vaccinazioni','Richiami in Agenda']},
      interventions:{icon:'checklist',tone:'blue',chips:['Interventi e procedure','Dispositivi collegati']},
      'prepare-visit':{icon:'checklist',tone:'teal',chips:['Fascicolo mirato','Documenti e richieste']},
      'search-dossier':{icon:'document',tone:'blue',chips:['Ricerca completa','Tutto il Dossier']},
      preferences:{icon:'checklist',tone:'violet',chips:['Aspetto e funzioni','Impostazioni del profilo']},
      'access-log':{icon:'shield',tone:'blue',chips:['Consultazioni','Modifiche']},
      interoperability:{icon:'shield',tone:'teal',chips:['FHIR','FSE italiano']},
      backup:{icon:'shield',tone:'green',chips:['Archivio locale','Ripristino e cloud']},
      help:{icon:'document',tone:'blue',chips:['Guida rapida','Argomenti consultabili']},
      'monitor-home':{icon:'trend',tone:'teal',chips:[`${state.measurements.length} misurazioni`,'Monitoraggio personale']},
      'monitor-weight':{icon:'weight',tone:'blue',chips:[`${measurementsOf('weight').length} pesate`,'Percorso peso']},
      'monitor-body':{icon:'profile',tone:'violet',chips:['Circonferenze','Misurazioni corporee']},
      'monitor-pressure':{icon:'heart',tone:'rose',chips:['Pressione','Frequenza cardiaca']},
      'monitor-spo2':{icon:'shield',tone:'teal',chips:['SpO₂','Storico domestico']},
      'monitor-glucose':{icon:'droplet',tone:'rose',chips:['Glicemia','Storico domestico']},
      'monitor-heart':{icon:'heart',tone:'rose',chips:['Frequenza cardiaca','Storico domestico']},
      'monitor-graphs':{icon:'trend',tone:'teal',chips:['Grafici','Andamento temporale']},
      'monitor-preferences':{icon:'checklist',tone:'violet',chips:['Preferenze','Monitoraggio']}
    };
    return data[view]||null;
  }
  function applyModernViewFrame(view=state.activeView){
    if(view==='dashboard'||view==='calendar')return;
    const host=$('#viewContainer');if(!host||host.querySelector(':scope > .modern-view-banner'))return;
    const meta=modernViewFrameMeta(view);if(!meta)return;
    const [title,subtitle]=VIEW_TITLES[view]||['Clinica Digitale',''];
    const banner=document.createElement('section');
    banner.className=`modern-view-banner tone-${meta.tone||'blue'}`;
    banner.innerHTML=`<div class="modern-view-banner-icon">${uiIconSvg(meta.icon||'document')}</div><div class="modern-view-banner-copy"><h2>${esc(title)}</h2><p>${esc(subtitle)}</p></div><div class="modern-view-banner-side"><div class="modern-view-banner-chips">${(meta.chips||[]).map(x=>`<span>${x}</span>`).join('')}</div></div>`;
    host.prepend(banner);

    // La testata moderna è l'unica intestazione della pagina: porta qui i comandi
    // operativi del primo blocco e rimuove l'intestazione interna ridondante.
    const firstShell=host.querySelector(':scope > .modern-content-shell');
    const firstHead=firstShell?.querySelector(':scope > .modern-content-head');
    const actions=firstHead?.querySelector(':scope > .row-actions');
    if(actions&&actions.children.length){
      const actionHost=document.createElement('div');
      actionHost.className='modern-view-banner-actions';
      [...actions.children].forEach(node=>actionHost.appendChild(node));
      banner.querySelector('.modern-view-banner-side')?.appendChild(actionHost);
    }
    const copy=firstHead?.querySelector(':scope > div:first-child');
    if(copy)copy.remove();
    if(firstHead&&!firstHead.children.length)firstHead.remove();
    else if(firstHead&&firstHead.querySelector(':scope > .row-actions')&&!firstHead.querySelector(':scope > .row-actions')?.children.length)firstHead.remove();
  }

  function isMonitorView(view=state.activeView){return String(view||'').startsWith('monitor-');}
  function syncNavigation(){const monitor=isMonitorView();$('#mainNav')?.classList.remove('hidden');$('#monitorNav')?.classList.add('hidden');$$('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.view===state.activeView));for(const group of document.querySelectorAll('#mainNav details.nav-group'))group.open=!!group.querySelector('.nav-item.active');$('#addDocumentBtn')?.classList.toggle('hidden',monitor);document.body.dataset.activeView=state.activeView||'';document.body.classList.toggle('modern-banner-page',!['dashboard','calendar'].includes(state.activeView));}

  async function renderView() {
    const sequence=++renderSequence;
    clearObjectUrls();renderProfileSelect();syncNavigation();setViewHeader();
    const premiumViews={graphs:'temporalGraphs','monitor-graphs':'temporalGraphs'};
    const requiredFeature=premiumViews[state.activeView];
    if(requiredFeature&&!globalThis.DossierFeatures?.has?.(requiredFeature)){
      const required=DossierFeatures.requiredPlan(requiredFeature);
      $('#viewContainer').innerHTML=`<section class="card"><div class="notice warning"><strong>Funzione disponibile dal piano ${esc(required)}.</strong><br>I dati già presenti restano conservati e non vengono cancellati. Puoi verificare il piano in Preferenze.</div><div class="section-spacer"></div><button class="btn btn-primary" id="openLicensePreferencesBtn">Apri Preferenze</button></section>`;
      $('#openLicensePreferencesBtn')?.addEventListener('click',()=>{state.activeView='preferences';selectNav('preferences');render();});
      return;
    }
    if(viewRequiresProfile()&&!activeProfile()){
      $('#viewContainer').innerHTML='';
      return;
    }
    const renderer = {
      dashboard: renderDashboard, timeline: renderTimeline, documents: renderDocuments,
      graphs: renderGraphs, compare: renderCompare, profile: renderProfile, 'health-card': renderHealthCard, doctors: renderDoctors, therapies: renderTherapies, exemptions: renderExemptions,
      diagnoses: renderDiagnoses, 'symptom-diary':()=>globalThis.ClinicaClinicalExtensions?.render('symptom-diary'), vaccinations:()=>globalThis.ClinicaClinicalExtensions?.render('vaccinations'), interventions:()=>globalThis.ClinicaClinicalExtensions?.render('interventions'), calendar: renderCalendar, 'prepare-visit': renderPrepareVisit, 'search-dossier': renderDossierSearch, preferences: renderPreferences, 'access-log':()=>globalThis.ClinicaLot2?.renderAuditLog?.(), interoperability:()=>globalThis.ClinicaLot3?.renderInteroperability?.(), backup: renderBackup, help: renderHelp,
      'monitor-home':renderMonitorHome,'monitor-weight':renderMonitorWeight,'monitor-body':renderMonitorBody,'monitor-pressure':()=>renderVitalSection('blood_pressure'),'monitor-spo2':()=>renderVitalSection('spo2'),'monitor-glucose':()=>renderVitalSection('glucose'),'monitor-heart':()=>renderVitalSection('heart_rate'),'monitor-graphs':renderMonitorGraphs,'monitor-preferences':renderMonitorPreferences
    }[state.activeView];
    if(!renderer){
      $('#viewContainer').innerHTML='<div class="notice danger"><strong>Sezione non disponibile.</strong><br>Il collegamento selezionato non corrisponde a una funzione del programma.</div>';
      return;
    }
    try{
      await renderer();
      await globalThis.ClinicaLot2?.afterRender?.(state.activeView);
      await globalThis.ClinicaLot3?.afterRender?.(state.activeView);
      applyModernViewFrame(state.activeView);
    }catch(error){
      console.error(`Errore apertura sezione ${state.activeView}:`,error);
      if(sequence!==renderSequence)return;
      $('#viewContainer').innerHTML=`<div class="notice danger"><strong>La sezione non è stata aperta.</strong><br>${esc(error?.message||String(error))}<div class="section-spacer"></div><button class="btn btn-light" id="retryViewBtn">Riprova</button></div>`;
      $('#retryViewBtn')?.addEventListener('click',()=>void renderView());
    }
  }

  const CALENDAR_CATEGORIES=['Visita','Prenotazione visita','Esame','Prenotazione esami','Controllo','Richiamo','Rinnovo esenzione','Piano terapeutico','Ricetta','Richiesta impegnativa medico curante','Documento sanitario','Telefonare','Altro'];
  const CALENDAR_REMINDERS=[
    [40320,'4 settimane prima'],[20160,'2 settimane prima'],[10080,'1 settimana prima'],[2880,'2 giorni prima'],[1440,'1 giorno prima'],[120,'2 ore prima'],[90,'1 ora e 30 minuti prima'],[60,'1 ora prima'],[30,'30 minuti prima']
  ];
  const CALENDAR_REMINDER_VALUES=new Set(CALENDAR_REMINDERS.map(([value])=>Number(value)));
  function calendarDefaultReminders(){
    const prefs={...DEFAULT_GLOBAL_PREFS,...state.globalPreferences};
    const values=(prefs.agendaDefaultReminders||[1440]).map(Number).filter(v=>CALENDAR_REMINDER_VALUES.has(v));
    return [...new Set(values)].slice(0,5);
  }
  const WORD_NUMBERS={uno:1,una:1,due:2,tre:3,quattro:4,cinque:5,sei:6,sette:7,otto:8,nove:9,dieci:10,dodici:12,quindici:15,venti:20,ventiquattro:24};
  let calendarReminderTimer=null;
  let calendarLocalSyncBusy=false;
  let calendarLocalSyncLastAt=0;
  let calendarProviderRefreshBusy=false;
  let calendarGoogleFamilySyncBusy=false;
  let calendarGoogleFamilySyncLastAt=0;

  function calendarLocalToday(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
  function calendarEventDateTime(row={}){return `${row.startDate||'9999-12-31'}T${row.allDay?'09:00':row.startTime||'23:59'}`;}
  function calendarProfileMeta(profileId=''){return state.calendarProfileMeta?.[String(profileId||'')]||state.profiles.find(p=>String(p.id||'')===String(profileId||''))||null;}
  function calendarProfileName(profileId=''){const p=calendarProfileMeta(profileId);return [p?.firstName,p?.lastName].filter(Boolean).join(' ')||'Profilo';}
  function calendarProfileColor(profileId=''){const raw=String(calendarProfileMeta(profileId)?.preferences?.profileColor||calendarProfileMeta(profileId)?.profileColor||'#52616b');return /^#[0-9a-f]{6}$/i.test(raw)?raw:'#52616b';}
  function calendarContrastText(color='#52616b'){const m=String(color).match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);if(!m)return'#fff';const [r,g,b]=m.slice(1).map(x=>parseInt(x,16)/255).map(v=>v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4));return .2126*r+.7152*g+.0722*b>.48?'#12304d':'#fff';}
  function calendarProfilePill(profileId='',extraClass=''){if(!profileId)return'';const name=calendarProfileName(profileId),color=calendarProfileColor(profileId),text=calendarContrastText(color);return `<span class="member-profile-pill ${esc(extraClass)}" style="--member-color:${color};--member-text:${text};background:${color};color:${text};border-color:${color}">${esc(name)}</span>`;}
  function calendarProfileBadge(row={}){if(row.familyMedicationGroup&&Array.isArray(row.familyProfileIds))return row.familyProfileIds.map(id=>calendarProfilePill(id,'compact')).join('');if(!row.profileId)return'';return calendarProfilePill(row.profileId,'compact');}
  function calendarIsMedicationRequest(row={}){return row.sourceKind==='therapy-reorder'||row.sourceKind==='family-therapy-reorder-group'||row.medicationReorder===true;}
  function calendarIsPrescriptionMedicationRequest(row={}){return calendarIsMedicationRequest(row)&&(row.familyMedicationGroup||row.medicationReorderMode!=='purchase')&&row.requiresPrescription!==false;}
  function aggregateFamilyMedicationEvents(rows=[],groupDays=7){
    const meds=rows.filter(calendarIsPrescriptionMedicationRequest).filter(x=>(x.status||'planned')==='planned').sort((a,b)=>calendarEventDateTime(a).localeCompare(calendarEventDateTime(b)));
    if(meds.length<2)return rows.slice();
    const maxGap=Math.max(0,Math.min(10,Number(groupDays)||0)),groups=[];
    for(const row of meds){const current=groups.at(-1);if(!current||medicationReorderDaysBetween(current[0].startDate,row.startDate)>maxGap)groups.push([row]);else current.push(row);}
    const consumed=new Set(),virtual=[];
    for(const group of groups){
      if(group.length<2)continue;
      group.forEach(x=>consumed.add(String(x.id)));
      const profileIds=[...new Set(group.map(x=>String(x.profileId||'')).filter(Boolean))];
      const childIds=group.map(x=>String(x.id||'')).filter(Boolean).sort();
      const id=`family-med-${medicationReorderHash(childIds.join('|'))}`;
      const memberItems=[];
      for(const event of group){
        const items=Array.isArray(event.medicationReorderItems)&&event.medicationReorderItems.length?event.medicationReorderItems:(event.medicationNames||[]).map(name=>({medication:name,reorderDate:event.startDate,depletionDate:event.startDate}));
        memberItems.push({profileId:event.profileId,profileName:calendarProfileName(event.profileId),eventId:event.id,startDate:event.startDate,items:items.map(x=>({...x,medication:x.medication||'Farmaco'}))});
      }
      const lines=memberItems.map(m=>`${m.profileName}: ${m.items.map(x=>x.medication).join(', ')}`);
      const localState=state.calendarFamilyVirtualLocalStatus?.[id]||{};
      virtual.push({id,familyMedicationGroup:true,familyProfileIds:profileIds,familyMedicationItems:memberItems,familyChildEventIds:childIds,profileId:'',category:'Ricetta',title:'Richiesta farmaci famiglia',startDate:group.map(x=>x.startDate).sort()[0],startTime:'09:00',allDay:false,durationMinutes:30,status:'planned',notes:lines.join('\n'),sourceKind:'family-therapy-reorder-group',medicationReorder:true,medicationReorderMode:'prescription',requiresPrescription:true,medicationReorderGroupDays:maxGap,reminders:[60],updatedAt:group.map(x=>x.updatedAt||'').sort().at(-1)||'',...localState});
    }
    return [...rows.filter(x=>!consumed.has(String(x.id))),...virtual].sort((a,b)=>calendarEventDateTime(a).localeCompare(calendarEventDateTime(b)));
  }
  function calendarOperationalEvents(rows=[]){
    const groupDays=Math.max(0,Math.min(10,Number((state.globalPreferences||{}).medicationReorderGroupDays??7)));
    return aggregateFamilyMedicationEvents(rows,groupDays).filter(row=>row&&row.id&&!row.pendingDuplicateResolution);
  }
  function calendarFamilyChildIds(rows=[]){return new Set((rows||[]).filter(x=>x?.familyMedicationGroup).flatMap(x=>x.familyChildEventIds||[]).map(String));}
  function calendarCanManageFamilyMedication(row={}){const ids=(row.familyProfileIds||[]).map(String).filter(Boolean);return ids.length>0&&ids.every(id=>calendarCanManageProfile(id,'medications'));}
  function calendarCanManageProfile(profileId='',kind='appointments'){if(!globalThis.DossierSecurity)return String(profileId||'')===String(state.activeProfileId||'')&&canEditActive();const profile=calendarProfileMeta(profileId);if(!profile)return false;return kind==='medications'?DossierSecurity.canManageAgendaMedications(profile):DossierSecurity.canManageAgendaAppointments(profile);}
  function calendarCanManageEvent(row={}){return calendarCanManageProfile(row.profileId||state.activeProfileId,calendarIsMedicationRequest(row)?'medications':'appointments');}
  function calendarVisibleEventById(id=''){return state.calendarFamilyEvents.find(x=>String(x.id)===String(id))||state.calendarEvents.find(x=>String(x.id)===String(id))||null;}
  async function loadFamilyAgendaContext(){
    const allProfiles=await DossierDB.getAll('profiles');
    const familyAgendaLicensed=Boolean(globalThis.DossierFeatures?.has?.('familyDossier'));
    let visible;
    if(!familyAgendaLicensed){
      visible=allProfiles.filter(p=>String(p.id)===String(state.activeProfileId)&&(!globalThis.DossierSecurity||DossierSecurity.canAccessProfile(p.id)));
    }else{
      visible=globalThis.DossierSecurity?allProfiles.filter(p=>DossierSecurity.canViewAgendaProfile(p)):allProfiles.filter(p=>String(p.id)===String(state.activeProfileId));
    }
    if(!visible.length&&state.activeProfileId){const fallback=allProfiles.find(p=>String(p.id)===String(state.activeProfileId)&&(!globalThis.DossierSecurity||DossierSecurity.canAccessProfile(p.id)));if(fallback)visible=[fallback];}
    state.calendarProfileMeta=Object.fromEntries(visible.map(p=>[String(p.id),p]));
    const [eventGroups,suggestionGroups]=await Promise.all([Promise.all(visible.map(p=>DossierDB.byProfile('calendarEvents',p.id))),Promise.all(visible.map(p=>DossierDB.byProfile('calendarSuggestions',p.id)))]);
    state.calendarFamilyEvents=eventGroups.flat().sort((a,b)=>calendarEventDateTime(a).localeCompare(calendarEventDateTime(b)));
    state.calendarFamilySuggestions=suggestionGroups.flat().sort((a,b)=>String(a.suggestedDate||'9999-12-31').localeCompare(String(b.suggestedDate||'9999-12-31')));
    return{profiles:visible,events:state.calendarFamilyEvents,suggestions:state.calendarFamilySuggestions};
  }
  function calendarOwnerEvent(row={}){const ownerName=calendarProfileName(row.profileId||state.activeProfileId);return{...row,calendarOwnerName:ownerName};}
  function calendarVisiblePersistentEvents(rows=[]){return calendarOperationalEvents(rows);}
  async function syncAuthorizedCalendarToGoogle({silent=true,force=false}={}){
    if(!globalThis.DossierCalendar||!state.activeProfileId||calendarGoogleFamilySyncBusy)return 0;
    const now=Date.now();if(!force&&now-calendarGoogleFamilySyncLastAt<2*60*1000)return 0;
    calendarGoogleFamilySyncBusy=true;calendarGoogleFamilySyncLastAt=now;
    try{
      const googleStatus=await DossierCalendar.googleAdvancedStatus();state.googleCalendarStatus=googleStatus||state.googleCalendarStatus;
      if(!googleStatus?.connected||!googleStatus?.healthDataConsent?.granted)return 0;
      const context=await loadFamilyAgendaContext();
      const todayKey=calendarLocalToday();
      const operational=calendarOperationalEvents(context.events);
      const childIds=calendarFamilyChildIds(operational);
      const rows=operational.filter(row=>(row.status||'planned')==='planned'&&(String(row.startDate||'')>=todayKey||calendarOpenOverdueMedication(row,todayKey)));
      const userKey=calendarCurrentUserId()||'session';const storageKey=`calendarGoogleOperationalIdsV2:${userKey}`;
      let previous=[];try{previous=JSON.parse(localStorage.getItem(storageKey)||'[]');if(!Array.isArray(previous))previous=[];}catch{previous=[];}
      const currentIds=new Set(rows.map(row=>String(row.id)));
      const cleanupIds=new Set([...previous.filter(id=>!currentIds.has(String(id))),...childIds]);
      for(const stale of cleanupIds){try{await DossierCalendar.googleAdvancedDeleteEvent(String(stale));}catch{}}
      if(!rows.length){state.googleCalendarEventStatus={};localStorage.setItem(storageKey,'[]');return 0;}
      const before=await DossierCalendar.googleAdvancedEventStatuses(rows.map(row=>row.id));
      const statuses=before?.events||{};state.googleCalendarEventStatus=statuses;
      let changed=0;
      for(const row of rows){
        if(calendarIsMedicationRequest(row)&&!googleStatus?.medicationDataConsent?.granted)continue;
        const status=statuses[row.id]||{};
        const revision=String(row.updatedAt||'');
        if(status.linked&&revision&&String(status.syncedLocalUpdatedAt||'')===revision&&!status.lastError)continue;
        const owner=row.familyMedicationGroup?'Agenda famiglia':calendarProfileName(row.profileId);
        try{await DossierCalendar.googleAdvancedSyncEvent({...row,calendarOwnerName:row.familyMedicationGroup?'':owner},owner,true);changed++;}
        catch(error){if(!silent)toast(`Google Calendar: ${error.message}`);}
      }
      const after=await DossierCalendar.googleAdvancedEventStatuses(rows.map(row=>row.id));state.googleCalendarEventStatus=after?.events||{};
      localStorage.setItem(storageKey,JSON.stringify(rows.map(row=>String(row.id))));
      return changed;
    }finally{calendarGoogleFamilySyncBusy=false;}
  }
  function calendarOpenOverdueMedication(row={},todayKey=calendarLocalToday()){return (row.status||'planned')==='planned'&&calendarIsMedicationRequest(row)&&String(row.startDate||'')&&String(row.startDate||'')<todayKey;}
  function calendarUpcomingEvents(){const todayKey=calendarLocalToday();return [...state.calendarEvents].filter(x=>(x.status||'planned')==='planned'&&(String(x.startDate||'')>=todayKey||calendarOpenOverdueMedication(x,todayKey))).sort((a,b)=>calendarEventDateTime(a).localeCompare(calendarEventDateTime(b)));}
  async function cleanLegacyCalendarEvents(){const legacyKeys=['syncGoogle','googleEventId','googleHtmlLink','googleSyncStatus','googleSyncError','googleSyncedAt'];for(let i=0;i<state.calendarEvents.length;i++){const row=state.calendarEvents[i];if(!legacyKeys.some(k=>Object.prototype.hasOwnProperty.call(row,k)))continue;const clean={...row};for(const key of legacyKeys)delete clean[key];clean.updatedAt=clean.updatedAt||new Date().toISOString();await DossierDB.put('calendarEvents',clean,{audit:false,sync:false});state.calendarEvents[i]=clean;}}
  async function rollForwardYearlyCalendarEvents(){const todayKey=calendarLocalToday();for(let i=0;i<state.calendarEvents.length;i++){const row=state.calendarEvents[i];if((row.status||'planned')!=='planned'||row.recurrence!=='yearly'||!row.startDate||row.startDate>=todayKey)continue;let next=row.startDate;let guard=0;while(next<todayKey&&guard++<20)next=calendarDateAdd(next,1,'anno');if(next&&next!==row.startDate){const updated={...row,startDate:next,updatedAt:new Date().toISOString(),recurrenceRolledAt:new Date().toISOString()};await DossierDB.put('calendarEvents',updated,{audit:false,sync:false});state.calendarEvents[i]=updated;}}}
  function calendarRecentHistory(){const todayKey=calendarLocalToday();return [...state.calendarEvents].filter(x=>!calendarOpenOverdueMedication(x,todayKey)&&((x.status||'planned')!=='planned'||String(x.startDate||'')<todayKey)).sort((a,b)=>calendarEventDateTime(b).localeCompare(calendarEventDateTime(a))).slice(0,20);}
  function calendarCategoryFromText(text=''){const n=normalizedWords(text);if(/esenz|rinnovo/.test(n))return'Rinnovo esenzione';if(/richiamo/.test(n))return'Richiamo';if(/esame|analisi|ecograf|tac|risonanza|rmn|radiograf/.test(n))return'Esame';if(/visita/.test(n))return'Visita';return'Controllo';}
  function calendarHash(text=''){let h=2166136261;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0).toString(36);}
  function calendarDocumentText(doc={}){
    const sections=[...(doc.reportSections||[]),...(doc.clinicalSummarySections||[])].map(x=>`${x.title||x.label||''}\n${x.content||x.text||x.value||''}`).filter(Boolean);
    const fallback=String(doc.reconstructedText||doc.narrativeClinicalSource||doc.structuredText||doc.extractedText||'');
    const text=(sections.length?sections.join('\n'):fallback).replace(/\r/g,'\n').replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n');
    return text.slice(0,1500000);
  }
  function calendarDateAdd(base,count,unit){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(base||''))return'';
    const d=new Date(`${base}T12:00:00`);if(Number.isNaN(d.getTime()))return'';
    const n=Math.max(1,Number(count)||1),u=normalizedWords(unit);
    if(/giorn/.test(u))d.setDate(d.getDate()+n);
    else if(/settiman/.test(u))d.setDate(d.getDate()+n*7);
    else if(/mes/.test(u)){const day=d.getDate();d.setDate(1);d.setMonth(d.getMonth()+n);const last=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();d.setDate(Math.min(day,last));}
    else if(/ann/.test(u)){const month=d.getMonth(),day=d.getDate();d.setDate(1);d.setFullYear(d.getFullYear()+n);d.setMonth(month);const last=new Date(d.getFullYear(),month+1,0).getDate();d.setDate(Math.min(day,last));}
    else return'';
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  function calendarDateShiftMonths(base,months){
    const d=new Date(`${base}T12:00:00`);if(Number.isNaN(d.getTime()))return'';const day=d.getDate();d.setDate(1);d.setMonth(d.getMonth()+months);const last=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();d.setDate(Math.min(day,last));return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  function calendarSuggestionCutoff(){return calendarDateShiftMonths(calendarLocalToday(),-8);}
  function calendarSuggestionDateAllowed(date=''){return /^\d{4}-\d{2}-\d{2}$/.test(date)&&date>=calendarSuggestionCutoff();}
  function calendarParseExplicitDate(raw=''){
    const value=String(raw||'').trim();let m=value.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);let iso='';
    if(m)iso=`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;else if(/^\d{4}-\d{2}-\d{2}$/.test(value))iso=value;
    if(!iso)return'';const dt=new Date(`${iso}T12:00:00`);return Number.isNaN(dt.getTime())?'':iso;
  }
  function calendarExcerpt(text,index,length=280){const start=Math.max(0,index-110),end=Math.min(text.length,index+length);return text.slice(start,end).replace(/\s+/g,' ').trim();}
  function calendarSuggestionDecisionKey(docId,rule,dueDate,match){return `${docId}|${rule}|${dueDate}|${calendarHash(normalizedWords(match).slice(0,240))}`;}

  // BOOKING_IMPORT_V1_BEGIN
  const CALENDAR_BOOKING_SOURCE_NOTE='Per tutte le informazioni necessarie, consulta il file originale allegato.';
  function calendarBookingLines(text=''){return String(text||'').replace(/\r/g,'\n').split(/\n+/).map(x=>x.replace(/[ \t]+/g,' ').trim()).filter(Boolean);}
  function calendarBookingIsoDate(day,month,year){const d=Number(day),m=Number(month),y=Number(year);if(y<1900||m<1||m>12||d<1||d>31)return'';const iso=`${String(y).padStart(4,'0')}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;const dt=new Date(`${iso}T12:00:00`);return Number.isNaN(dt.getTime())||dt.getFullYear()!==y||dt.getMonth()+1!==m||dt.getDate()!==d?'':iso;}
  function calendarBookingDateTimeCandidates(text=''){
    const lines=calendarBookingLines(text),today=calendarLocalToday(),out=[];
    const dateRe=/(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})/g,timeRe=/(?:^|\s)([01]?\d|2[0-3])[:.]([0-5]\d)(?=\s|$|[^0-9])/;
    const nearbyTime=(index,line)=>{const direct=String(line||'').match(timeRe);if(direct)return{match:direct,distance:0,line:String(line||'')};for(const distance of [1,2,3])for(const pos of [index+distance,index-distance]){if(pos<0||pos>=lines.length)continue;const m=String(lines[pos]||'').match(timeRe);if(m)return{match:m,distance,line:String(lines[pos]||'')};}return null;};
    lines.forEach((line,index)=>{for(const match of line.matchAll(dateRe)){const iso=calendarBookingIsoDate(match[1],match[2],match[3]);if(!iso)continue;const n=normalizedWords(line),near=nearbyTime(index,line),timeMatch=near?.match||null;let score=0;if(timeMatch)score+=near.distance===0?65:Math.max(35,60-near.distance*8);if(/data e ora|appuntamento|quando presentarsi|prestazione|giorno.*ora|ora.*giorno/.test(n))score+=45;if(/visita|esame|analisi|prelievo|risonanza|rm\b|tac\b|tc\b|ecograf|radiograf|mammograf|endoscop/.test(n))score+=25;if(iso>=today)score+=20;if(/data nascita|nascita|del\s*$|operatore|emissione|stampat|prenotazione del/.test(n))score-=90;out.push({iso,time:timeMatch?`${String(timeMatch[1]).padStart(2,'0')}:${timeMatch[2]}`:'',line,index,score,match:String(match[0]),timeLine:near?.line||'',timeDistance:near?.distance??99});}});
    return out.sort((a,b)=>b.score-a.score||String(b.iso).localeCompare(String(a.iso))||a.index-b.index);
  }
  function calendarBookingStripService(line='',candidate={}){
    let value=String(line||'');if(candidate.match)value=value.replace(candidate.match,' ');if(candidate.time)value=value.replace(candidate.time,' ');
    value=value.replace(/\b(?:lun|mar|mer|gio|ven|sab|dom)(?:edi|edì|oledi|oledì|vedi|vedì|ato|enica)?\s*[-:]?/ig,' ')
      .replace(/\bnon\s+disponibile\b/ig,' ').replace(/\b(?:data|ora|giorno|nr\.?\s*chiamata)\b\s*:?/ig,' ')
      .replace(/^\s*[A-Z0-9]{2,8}\s+(?=[A-ZÀ-ÖØ-Ý])/,' ').replace(/\s{2,}/g,' ').trim().replace(/^[-:|]+|[-:|]+$/g,'').trim();
    return value;
  }
  function calendarBookingUnique(values=[]){const seen=new Set(),out=[];for(const raw of values){const v=String(raw||'').replace(/\s+/g,' ').trim().replace(/^[•·\-–—]\s*/,'');if(!v)continue;const key=normalizedWords(v);if(!key||seen.has(key))continue;seen.add(key);out.push(v);}return out;}
  function calendarBookingLabelValue(lines=[],labels=[]){for(const line of lines){for(const label of labels){const re=new RegExp(`^\\s*${label}\\s*[:\\-]\\s*(.+)$`,'i'),m=line.match(re);if(m&&m[1]?.trim())return m[1].trim();}}return'';}
  function calendarBookingCleanOperationalLocation(value=''){
    let v=String(value||'').replace(/&#8217;|&#x2019;/gi,'’').replace(/\s+/g,' ').trim();
    v=v.replace(/^(?:dove\s+presentarsi(?:\s+per\s+visite\s+ed\s+esami)?|presentarsi\s+al\s+seguente\s+indirizzo)\s*[:\-]?\s*/i,'').replace(/^\s*\[\d+\]\s*[-–—]?\s*/,'').replace(/\s+(?:dove\s+presentarsi(?:\s+per\s+visite\s+ed\s+esami)?|presentarsi\s+al\s+seguente\s+indirizzo)\s*[:\-]?\s*$/i,'').trim();
    return v.replace(/\s+(?:Unit[aà]\s+di\s+prenotazione\/?accettazione|Informazioni\s+per\s+il\s+paziente).*$/i,'').trim();
  }
  function calendarBookingOperationalLocation(lines=[]){
    const street=/\b(?:VIALE|VIA|PIAZZA|P\.?(?:ZZA)?|LARGO|CORSO|STRADA|LOCALIT[ÀA]|LOC\.)\s+[^\n]{3,150}/i;
    const useful=/\b(?:misericordia|ospedale|clinica|policlinico|presidio|centro|casa\s+di\s+cura|ambulatorio|reparto|padiglione|via|viale|piazza|largo|corso|strada|localit[àa]|loc\.)\b/i;
    const candidates=[];
    const push=(value,score)=>{const cleaned=calendarBookingCleanOperationalLocation(value);if(cleaned&&useful.test(cleaned))candidates.push({value:cleaned,score:Number(score||0)+(street.test(cleaned)?35:0)});};
    lines.forEach((line,index)=>{
      const n=normalizedWords(line);
      if(/presentarsi al seguente indirizzo/.test(n)){
        const parts=String(line).split(/presentarsi\s+al\s+seguente\s+indirizzo\s*:?/i);push(parts[1]||'',130);push(parts[0]||'',125);push(lines[index+1]||'',120);push(lines[index+2]||'',110);push(lines[index-1]||'',95);
      }
      if(/^dove presentarsi(?: per visite ed esami)?/.test(n))for(let offset=1;offset<=5;offset++)push(lines[index+offset]||'',115-offset*3);
      if(/sede appuntamento|sede della prestazione|ambulatorio/.test(n)&&street.test(line))push(line,100);
    });
    candidates.sort((a,b)=>b.score-a.score||b.value.length-a.value.length);return candidates[0]?.value||'';
  }
  function calendarBookingAddress(lines=[],operational=''){
    const street=/\b(?:VIALE|VIA|PIAZZA|P\.?(?:ZZA)?|LARGO|CORSO|STRADA|LOCALIT[ÀA]|LOC\.)\s+[^\n]{3,150}/i;
    if(operational){const m=String(operational).match(street);if(m)return calendarBookingCleanOperationalLocation(m[0]);}
    const direct=calendarBookingLabelValue(lines,['indirizzo','sede']);if(direct&&/\b(?:via|viale|piazza|largo|loc(?:alita)?|strada|corso)\b/i.test(direct))return direct;
    for(const line of lines){const m=line.match(street);if(!m)continue;let v=m[0].replace(/\s+(?:Presentarsi|Unit[aà]\s+di\s+prenotazione|Informazioni\s+per\s+il\s+paziente).*$/i,'').trim();if(v.length>4)return v;}
    return direct||'';
  }
  function calendarBookingFacility(lines=[],address='',analysis={},operational=''){
    if(operational){let part=String(operational);const streetIndex=part.search(/\b(?:via|viale|piazza|largo|corso|strada|localit[àa]|loc\.)\b/i);if(streetIndex>0)part=part.slice(0,streetIndex);part=part.replace(/^\s*\d+\s+/,' ').replace(/\s{2,}/g,' ').trim().replace(/[,:;\-]+$/,'').trim();if(part.length>=4&&part.length<=140)return part;}
    const luogo=calendarBookingLabelValue(lines,['luogo']);if(luogo){const cleaned=luogo.split(/\s+-\s+(?=(?:via|viale|piazza|largo|corso|strada)\b)/i)[0].trim();if(cleaned)return cleaned;}
    const facilityWords=/\b(?:misericordia|ospedale|clinica|policlinico|presidio|centro\s+(?:medico|diagnostico)|casa\s+di\s+cura|ambulatorio)\b/i;
    for(const line of lines){if(!facilityWords.test(line))continue;let part=line;const streetIndex=part.search(/\b(?:via|viale|piazza|largo|corso|strada|localit[àa]|loc\.)\b/i);if(streetIndex>0)part=part.slice(0,streetIndex);part=part.replace(/\[\d+\]|-\[?\d+\]?/g,' ').replace(/^\s*\d+\s+/,' ').replace(/\s{2,}/g,' ').trim().replace(/[,:;\-]+$/,'').trim();if(part.length>=4&&part.length<=120)return part;}
    const detected=String(analysis?.facility||'').trim();return detected&&detected.length<=140?detected:'';
  }
  function calendarBookingSentences(text=''){return calendarBookingUnique(String(text||'').replace(/\r/g,'\n').split(/(?<=[.!?])\s+|\n+/).map(x=>x.trim()).filter(Boolean));}
  function calendarBookingInstructionGroups(text=''){
    const sentences=calendarBookingSentences(text),preparation=[],route=[];
    const prepRe=/\b(?:digiun|non\s+mangiare|non\s+bere|bere\s+(?:acqua|liquid)|acqua|vescica\s+piena|sospend|sospensione|farmac|preparazione|documentazione|esami\s+precedenti|referti\s+precedenti|mezzo\s+di\s+contrasto|allerg|portare|porti\s+con|arrivare\b.{0,100}(?:minut|prima)|presentarsi\b.{0,120}(?:minut|prima))\b/i;
    const routeRe=/\b(?:padiglione|piano|scala|ingresso|percorso|ambulatorio|reparto|blocco|edificio|stanza|accettazione|unit[aà]\s+di\s+prenotazione|dove\s+presentarsi|presentarsi\s+al\s+seguente\s+indirizzo)\b/i;
    const bareHeading=/^(?:quando\s+presentarsi(?:\s+per\s+visite\s+ed\s+esami)?(?:\s+rit\.?\s*referti?)?|dove\s+presentarsi(?:\s+per\s+visite\s+ed\s+esami)?|unit[aà]\s+di\s+prenotazione\/?accettazione)\s*:?$/i;
    for(const sentenceRaw of sentences){const sentence=String(sentenceRaw||'').replace(/&#8217;|&#x2019;/gi,'’').replace(/\s+/g,' ').trim();if(!sentence||sentence.length>320)continue;if(routeRe.test(sentence)&&!bareHeading.test(sentence))route.push(sentence);if(prepRe.test(sentence)&&!bareHeading.test(sentence))preparation.push(sentence);}
    return{preparation:calendarBookingUnique(preparation).slice(0,10),route:calendarBookingUnique(route).slice(0,10)};
  }
  function calendarBookingReferences(text='',lines=[]){
    const refs=[];const nres=[...String(text||'').toUpperCase().matchAll(/\b\d{4}[A-Z]\d{10,11}\b/g)].map(m=>m[0]);if(nres.length)refs.push(`NRE: ${calendarBookingUnique(nres).join(', ')}`);
    const labels=[['Pincode','pincode|pin'],['Numero assegnato','numero\\s+assegnato'],['IUV','(?:posizione\\s+)?iris[- ]?iuv|iuv'],['Codice prenotazione','codice\\s+prenotazione'],['Impegnativa','impegnativa\\s*\\/?\\s*nr']];
    for(const [label,pattern] of labels){for(const line of lines){const m=line.match(new RegExp(`(?:${pattern})\\s*[:\\-]?\\s*([A-Z0-9][A-Z0-9 .\\/-]{1,80})$`,'i'));if(m&&m[1]?.trim()){const value=m[1].trim().replace(/\s{2,}/g,' ');if(value&&!/^(?:regione|azienda|servizio sanitario)/i.test(value))refs.push(`${label}: ${value}`);break;}}}
    return calendarBookingUnique(refs).slice(0,12);
  }
  function calendarBookingCategory(service=''){const n=normalizedWords(service);if(/\bvisita\b|consult|specialist/.test(n))return'Prenotazione visita';if(/prelievo|esame|analisi|risonanza|\brm\b|rmn|tac|\btc\b|ecograf|radiograf|mammograf|endoscop|colonscop|gastroscop|elettrocard|ecg/.test(n))return'Prenotazione esami';return'Esame';}
  function calendarBookingDataFromText(text='',analysis={}){
    const lines=calendarBookingLines(text),candidates=calendarBookingDateTimeCandidates(text),chosen=candidates[0]||{};
    const serviceNoise=/^(?:prenotazione|quando presentarsi|data(?:\s+e\s+ora)?|ora|giorno|nr\.?\s*chiamata|non disponibile|documento sanitario(?: da classificare)?)$/i;
    const serviceClinical=/\b(?:visita|ecocolordoppler|eco(?:color)?doppler|ecograf|elettrocard|ecg|risonanza|rmn?|tac|tc|radiograf|rx|mammograf|endoscop|colonscop|gastroscop|prelievo|analisi|esame|spirometr|holter|doppler|audiometr|densitometr|moc|urofluss|elettromiograf)\b/i;
    const cleanService=value=>calendarBookingStripService(String(value||''),chosen).replace(/^\s*\d{2,8}\s+/,'').replace(/^\s*[A-Z0-9]{1,6}[-/]\s*/,'').replace(/\s+(?:non\s+disponibile\s*)+$/i,'').trim();
    const flatText=String(text||'').replace(/\r/g,'\n').replace(/[\n\t ]+/g,' ').trim();
    const flatServiceMatch=flatText.match(/\bPrestazione\b(?:\s+Data\b)?(?:\s+Ora\b)?(?:\s+Giorno\b)?(?:\s+Nr\.?\s*Chiamata\b)?\s+(.{3,220}?)\s+(?:Lun|Mar|Mer|Gio|Ven|Sab|Dom)(?:edì|edi|oledì|oledi|vedì|vedi|ato|enica)?\s*[-:]?\s*\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{4}\s+(?:[01]?\d|2[0-3])[:.]([0-5]\d)\b/i);
    let service=flatServiceMatch?cleanService(flatServiceMatch[1]):calendarBookingLabelValue(lines,['servizio','prestazione','esame','visita']);
    if(serviceNoise.test(String(service||'').trim()))service='';
    if(!service){
      const around=[];if(Number.isInteger(chosen.index)){for(let d=0;d<=5;d++)for(const pos of [chosen.index-d,chosen.index+d])if(pos>=0&&pos<lines.length&&!around.includes(pos))around.push(pos);}
      for(const pos of around){const raw=String(lines[pos]||'');if(!serviceClinical.test(raw))continue;const candidate=cleanService(raw);if(candidate.length>=4&&!serviceNoise.test(candidate)&&!/^\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{4}/.test(candidate)){service=candidate;break;}}
    }
    if(!service){
      const header=lines.findIndex(x=>/\bprestazione\b/i.test(x)&&/\bdata\b/i.test(x));if(header>=0)for(let pos=header+1;pos<Math.min(lines.length,header+7);pos++){const raw=String(lines[pos]||'');if(!serviceClinical.test(raw))continue;const candidate=cleanService(raw);if(candidate.length>=4&&!serviceNoise.test(candidate)){service=candidate;break;}}
    }
    if(!service&&chosen.line){const candidate=cleanService(chosen.line);if(serviceClinical.test(candidate)&&!serviceNoise.test(candidate))service=candidate;}
    const fallback=String(analysis?.documentKind||analysis?.title||'').trim();if(!service&&fallback&&!serviceNoise.test(fallback))service=fallback;
    service=String(service||'Appuntamento sanitario').replace(/\s{2,}/g,' ').trim().slice(0,180);
    const operationalLocation=calendarBookingOperationalLocation(lines),address=calendarBookingAddress(lines,operationalLocation),facility=calendarBookingFacility(lines,address,analysis,operationalLocation),groups=calendarBookingInstructionGroups(text),references=calendarBookingReferences(text,lines);
    const location=operationalLocation||[facility,address].filter(Boolean).filter((v,i,a)=>a.findIndex(x=>normalizedWords(x)===normalizedWords(v))===i).join(' · ');
    const noteSections=[];if(groups.route.length)noteSections.push(`Indicazioni per raggiungere l'ambulatorio / la sede:\n${groups.route.map(x=>`• ${x}`).join('\n')}`);if(groups.preparation.length)noteSections.push(`Indicazioni dalla prenotazione:\n${groups.preparation.map(x=>`• ${x}`).join('\n')}`);if(references.length)noteSections.push(`Riferimenti:\n${references.map(x=>`• ${x}`).join('\n')}`);noteSections.push(CALENDAR_BOOKING_SOURCE_NOTE);
    return{service,category:calendarBookingCategory(service),startDate:chosen.iso||'',startTime:chosen.time||'',facility,address,location,route:groups.route,preparation:groups.preparation,references,notes:noteSections.join('\n\n'),dateCandidate:chosen};
  }
  function calendarBookingLooksLikeDocument(text='',parsed={}){
    const n=normalizedWords(text),service=String(parsed?.service||'');return Boolean(parsed?.startDate&&parsed?.startTime&&service&&service!=='Appuntamento sanitario'&&!/documento sanitario/i.test(service)&&/quando presentarsi|dove presentarsi|prenotazione|prestazione/.test(n)&&/visita|esame|ecocolordoppler|ecograf|risonanza|tac|tc|radiograf|mammograf|prelievo|analisi|doppler|neurolog/.test(normalizedWords(service)));
  }
  function calendarBookingSpecialization(text='',parsed={},analysis={}){
    const raw=String(text||'').replace(/\r/g,'\n');
    const rules=[
      [/\b(?:U\.?O\.?|UNIT[AÀ]|REPARTO|AMBULATORIO|CORRIDOIO)\b[^\n]{0,120}\bNEUROLOG(?:IA|ICA|ICO)\b|\bNEUROLOG(?:IA|ICA|ICO)\b[^\n]{0,120}\b(?:U\.?O\.?|UNIT[AÀ]|REPARTO|AMBULATORIO)\b/i,'Neurologia'],
      [/\bCARDIOLOG(?:IA|ICA|ICO)\b/i,'Cardiologia'],
      [/\bDERMATOLOG(?:IA|ICA|ICO)\b/i,'Dermatologia'],
      [/\bOCULIST(?:ICA|ICO)|OFTALMOLOG(?:IA|ICA|ICO)\b/i,'Oculistica'],
      [/\bORTOPED(?:IA|ICA|ICO)\b/i,'Ortopedia'],
      [/\bUROLOG(?:IA|ICA|ICO)\b/i,'Urologia'],
      [/\bGINECOLOG(?:IA|ICA|ICO)\b/i,'Ginecologia'],
      [/\bOTORINOLARINGOIATR(?:IA|ICA|ICO)|\bORL\b/i,'Otorinolaringoiatria'],
      [/\bPNEUMOLOG(?:IA|ICA|ICO)\b/i,'Pneumologia'],
      [/\bGASTROENTEROLOG(?:IA|ICA|ICO)\b/i,'Gastroenterologia'],
      [/\bENDOCRINOLOG(?:IA|ICA|ICO)\b/i,'Endocrinologia'],
      [/\bREUMATOLOG(?:IA|ICA|ICO)\b/i,'Reumatologia']
    ];
    for(const [re,label] of rules)if(re.test(raw))return label;
    const service=normalizedWords(parsed?.service||'');
    if(/neurolog/.test(service))return'Neurologia';
    return String(analysis?.specialization||analysis?.department||'').trim();
  }
  function calendarBookingOverlayForImportedAnalysis(text='',analysis={}){
    const parsed=calendarBookingDataFromText(text,analysis);
    if(!calendarBookingLooksLikeDocument(text,parsed))return{analysis,parsed:null};
    const category=parsed.category==='Prenotazione visita'?'Prenotazione visita':'Prenotazione esami';
    const specialization=calendarBookingSpecialization(text,parsed,analysis);
    return{analysis:{...analysis,title:`Prenotazione · ${parsed.service}`,category,documentKind:'Promemoria di prenotazione',specialization:specialization||analysis.specialization||'',department:specialization||analysis.department||'',documentContext:'prenotazione-sanitaria',bookingService:parsed.service,bookingStartDate:parsed.startDate,bookingStartTime:parsed.startTime,bookingLocation:parsed.location||'',bookingFacility:parsed.facility||'',bookingReferences:parsed.references||[]},parsed};
  }
  function calendarBookingDocumentText(doc={}){
    const sources=[doc.ocrIntegralText,doc.extractedText,doc.structuredText,doc.reconstructedText,calendarDocumentText(doc)].map(x=>String(x||'').replace(/\r/g,'\n').trim()).filter(Boolean);
    const seen=new Set(),parts=[];for(const source of sources){const key=source.slice(0,50000);if(seen.has(key))continue;seen.add(key);parts.push(source);}
    return parts.join('\n').replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').slice(0,1500000);
  }
  function calendarNormalizeImportedBookingDocument(doc={}){
    const text=calendarBookingDocumentText(doc),parsed=calendarBookingDataFromText(text,doc);if(!calendarBookingLooksLikeDocument(text,parsed))return{doc,parsed:null};
    const now=new Date().toISOString(),category=parsed.category==='Prenotazione visita'?'Prenotazione visita':'Prenotazione esami';
    const specialization=calendarBookingSpecialization(text,parsed,doc);
    const inheritedClinicalDate=(doc.clinicalDate===parsed.startDate&&String(parsed.startDate||'')>calendarLocalToday())?'':String(doc.clinicalDate||'');
    const manualIdentity=Boolean(doc.manualIdentityOverride&&doc.manualIdentity);
    const manualBookingIdentity=manualIdentity&&/prenotaz|promemoria di prenotazione/.test(normalizedWords(`${doc.manualIdentity?.documentKind||doc.documentKind||''} ${doc.manualIdentity?.category||doc.category||''}`));
    const manualStoredTitle=String(doc.manualIdentity?.title||doc.title||'').trim();
    const staleManualBookingTitle=manualBookingIdentity&&/^(?:prestazione|esame)\s*[·\-:]/i.test(manualStoredTitle);
    const normalizedBookingTitle=`Prenotazione · ${parsed.service}`;
    const normalized={...doc,
      documentKind:manualIdentity?(doc.documentKind||doc.manualIdentity?.documentKind||'Promemoria di prenotazione'):'Promemoria di prenotazione',
      category:manualIdentity?(doc.category||doc.manualIdentity?.category||category):category,
      title:manualIdentity?(staleManualBookingTitle?normalizedBookingTitle:(manualStoredTitle||normalizedBookingTitle)):normalizedBookingTitle,
      specialization:manualIdentity?(doc.specialization||doc.manualIdentity?.specialization||specialization):(specialization||doc.specialization||''),
      clinicalDate:inheritedClinicalDate,dateStatus:inheritedClinicalDate?(doc.dateStatus||'confirmed'):'not_applicable',needsCompletion:false,
      facility:doc.facility||parsed.facility||'',department:manualIdentity?(doc.department||doc.manualIdentity?.specialization||specialization):(specialization||doc.department||''),documentContext:'prenotazione-sanitaria',
      bookingService:parsed.service,bookingStartDate:parsed.startDate,bookingStartTime:parsed.startTime,
      bookingLocation:parsed.location||'',bookingFacility:parsed.facility||'',bookingReferences:parsed.references||[],
      bookingDetectedAt:now,bookingDetectedVersion:BOOKING_INTERPRETATION_VERSION,updatedAt:now};
    if(staleManualBookingTitle){normalized.manualIdentityOverride=true;normalized.manualIdentity={...doc.manualIdentity,title:normalized.title};normalized.documentTypeSource=doc.documentTypeSource||'correzione manuale';normalized.documentTypeConfidence=100;}
    return{doc:normalized,parsed};
  }
  function calendarBookingStoredCandidate(doc={}){
    const text=calendarBookingDocumentText(doc),hint=normalizedWords(`${doc.documentContext||''} ${doc.documentKind||''} ${doc.category||''} ${doc.title||''} ${text.slice(0,120000)}`);
    const likely=/prenotaz|quando presentarsi|dove presentarsi|nr chiamata|prestazione/.test(hint)&&/visita|esame|ecocolordoppler|ecograf|risonanza|tac|tc|radiograf|mammograf|prelievo|analisi|doppler|neurolog/.test(hint);
    if(!likely)return false;
    if(String(doc.bookingDetectedVersion||'')!==BOOKING_INTERPRETATION_VERSION)return true;
    const parsed=calendarBookingDataFromText(text,doc);if(!calendarBookingLooksLikeDocument(text,parsed))return false;
    const manualIdentity=Boolean(doc.manualIdentityOverride&&doc.manualIdentity);
    if(manualIdentity){const manualBooking=/prenotaz|promemoria di prenotazione/.test(normalizedWords(`${doc.manualIdentity?.documentKind||doc.documentKind||''} ${doc.manualIdentity?.category||doc.category||''}`));const manualTitle=String(doc.manualIdentity?.title||doc.title||'').trim();const staleManualTitle=manualBooking&&/^(?:prestazione|esame)\s*[·\-:]/i.test(manualTitle);return staleManualTitle||!doc.bookingStartDate||!doc.bookingStartTime||!doc.bookingLocation;}
    const expectedCategory=parsed.category==='Prenotazione visita'?'Prenotazione visita':'Prenotazione esami';
    const expectedTitle=`Prenotazione · ${parsed.service}`;
    const expectedSpecialization=calendarBookingSpecialization(text,parsed,doc);
    return normalizedWords(doc.title||'')!==normalizedWords(expectedTitle)||String(doc.documentKind||'')!=='Promemoria di prenotazione'||String(doc.category||'')!==expectedCategory||String(doc.bookingStartDate||'')!==String(parsed.startDate||'')||String(doc.bookingStartTime||'')!==String(parsed.startTime||'')||normalizedWords(doc.bookingLocation||'')!==normalizedWords(parsed.location||'')||(expectedSpecialization&&normalizedWords(doc.specialization||'')!==normalizedWords(expectedSpecialization));
  }
  function calendarBookingMigrationChanged(before={},after={}){
    const keys=['title','category','documentKind','clinicalDate','dateStatus','facility','documentContext','bookingService','bookingStartDate','bookingStartTime','bookingLocation','bookingFacility','bookingDetectedVersion'];
    return keys.some(k=>JSON.stringify(before?.[k]??'')!==JSON.stringify(after?.[k]??''));
  }
  async function migrateBookingDocumentsAutomatically(documents=[],profile={},options={}){
    const rows=Array.isArray(documents)?documents:[],out=[];let changed=0,events=0,failed=0;
    const onProgress=typeof options.onProgress==='function'?options.onProgress:null;
    for(let i=0;i<rows.length;i++){
      const source=rows[i];
      if(!calendarBookingStoredCandidate(source)){out.push(source);continue;}
      try{
        const normalized=calendarNormalizeImportedBookingDocument(source);
        if(!normalized.parsed){out.push(source);continue;}
        const next=protectManualDocumentInterpretation(source,normalized.doc);
        if(calendarBookingMigrationChanged(source,next)){
          try{await saveDocumentVersion(source,'Copia prima del riallineamento automatico prenotazione 1.0.0',{sync:false,audit:false});}catch(_){ }
          await DossierDB.put('documents',next,{sync:false,audit:false,details:{event:'booking-targeted-migration-1.0.0'}});changed++;
        }
        const stored=calendarBookingMigrationChanged(source,next)?next:source;
        const event=await calendarEnsureEventForImportedBooking(stored,normalized.parsed);if(event)events++;
        out.push(stored);
      }catch(error){console.error('Prenotazioni: riallineamento automatico non riuscito',source?.title||source?.originalName,error);out.push(source);failed++;}
      try{onProgress?.({done:i+1,total:rows.length,changed,events,failed});}catch(_){ }
      await nextIdleTurn();
    }
    return{documents:out,changed,events,failed};
  }
  async function calendarEnsureEventForImportedBooking(doc={},parsed=null){
    if(!parsed||!doc?.id||!calendarBookingLooksLikeDocument(calendarBookingDocumentText(doc),parsed))return null;const profileId=String(doc.profileId||state.activeProfileId||'');if(!profileId)return null;const rows=await DossierDB.byProfile('calendarEvents',profileId);const existing=rows.find(x=>String(x.sourceDocumentId||'')===String(doc.id));if(existing){let repaired={...existing,category:parsed.category,title:parsed.service,startDate:parsed.startDate,startTime:parsed.startTime,allDay:false,location:parsed.location||existing.location||'',notes:parsed.notes||existing.notes||CALENDAR_BOOKING_SOURCE_NOTE,sourceDocumentTitle:doc.title||doc.originalName||'Prenotazione sanitaria',sourceKind:'booking-import',sourceExcerpt:'Documento originale della prenotazione allegato.',bookingOriginalName:doc.originalName||'',updatedAt:new Date().toISOString()};try{repaired=await scheduleLocalCalendarEvent(repaired,{silent:true});}catch(_){}await DossierDB.put('calendarEvents',repaired,{details:{event:'r13-booking-repair-linked-event'}});upsertCalendarEventState(repaired);try{await calendarBookingGoogleSyncFinal(repaired);}catch(_){}return repaired;}const probe={profileId,title:parsed.service,startDate:parsed.startDate,startTime:parsed.startTime,category:parsed.category};const duplicate=rows.find(x=>String(x.startDate||'')===probe.startDate&&String(x.startTime||'')===probe.startTime&&calendarBookingTextSimilarity(x.title,probe.title)>=.7);if(duplicate){const enriched={...duplicate,sourceDocumentId:doc.id,sourceDocumentTitle:doc.title||doc.originalName||'Prenotazione sanitaria',sourceKind:'booking-import',sourceExcerpt:'Documento originale della prenotazione allegato.',bookingOriginalName:doc.originalName||'',updatedAt:new Date().toISOString()};await DossierDB.put('calendarEvents',enriched,{details:{event:'r10-booking-link-existing'}});upsertCalendarEventState(enriched);return enriched;}const now=new Date().toISOString();let row={id:uid('calevent'),profileId,category:parsed.category,title:parsed.service,startDate:parsed.startDate,startTime:parsed.startTime,allDay:false,durationMinutes:60,status:'planned',doctorId:'',doctorName:'',location:parsed.location||'',notes:parsed.notes||CALENDAR_BOOKING_SOURCE_NOTE,reminders:calendarDefaultReminders(),recurrence:'none',sourceDocumentId:doc.id,sourceDocumentTitle:doc.title||doc.originalName||'Prenotazione sanitaria',sourceKind:'booking-import',sourceExcerpt:'Documento originale della prenotazione allegato.',bookingOriginalName:doc.originalName||'',createdAt:now,updatedAt:now};try{row=await scheduleLocalCalendarEvent(row,{silent:true});}catch(_){}await DossierDB.put('calendarEvents',row,{details:{event:'r10-booking-auto-from-document'}});upsertCalendarEventState(row);return row;
  }
  function calendarBookingSimilarityTokens(value=''){
    const stop=new Set(['di','del','della','dei','degli','delle','e','ed','a','al','alla','alle','da','in','con','per','il','lo','la','i','gli','le','un','una']);
    return new Set(normalizedWords(value).split(/\s+/).filter(x=>x.length>1&&!stop.has(x)));
  }
  function calendarBookingTextSimilarity(a='',b=''){
    const aa=normalizedWords(a),bb=normalizedWords(b);if(!aa||!bb)return 0;if(aa===bb)return 1;const A=calendarBookingSimilarityTokens(aa),B=calendarBookingSimilarityTokens(bb);if(!A.size||!B.size)return 0;let common=0;for(const token of A)if(B.has(token))common++;return common/Math.max(A.size,B.size);
  }
  function calendarBookingTimeMinutes(value=''){const m=String(value||'').match(/^(\d{1,2}):(\d{2})$/);return m?Number(m[1])*60+Number(m[2]):null;}
  function calendarBookingDuplicateScore(existing={},incoming={}){
    if(!existing?.id||existing.id===incoming.id||existing.profileId!==incoming.profileId||existing.pendingDuplicateResolution||(existing.status||'planned')!=='planned'||String(existing.startDate||'')!==String(incoming.startDate||''))return 0;
    let score=20;const a=calendarBookingTimeMinutes(existing.startTime),b=calendarBookingTimeMinutes(incoming.startTime);
    if(a!==null&&b!==null){const diff=Math.abs(a-b);if(diff===0)score+=35;else if(diff<=15)score+=25;else if(diff<=30)score+=10;else return 0;}else score+=8;
    const titleSim=calendarBookingTextSimilarity(existing.title,incoming.title);if(titleSim>=.9)score+=40;else if(titleSim>=.7)score+=34;else if(titleSim>=.55)score+=26;else if(titleSim>=.4)score+=16;else return 0;
    const locationSim=calendarBookingTextSimilarity(existing.location,incoming.location);if(locationSim>=.7)score+=12;else if(locationSim>=.4)score+=7;
    if(normalizedWords(existing.category)===normalizedWords(incoming.category))score+=3;return score;
  }
  function calendarBookingSimilarEvents(row={}){return state.calendarEvents.map(existing=>({existing,score:calendarBookingDuplicateScore(existing,row)})).filter(x=>x.score>=75).sort((a,b)=>b.score-a.score).map(x=>x.existing);}
  function calendarBookingMergeNotes(a='',b=''){
    const parts=[...String(a||'').split(/\n{2,}/),...String(b||'').split(/\n{2,}/)].map(x=>x.trim()).filter(Boolean),seen=new Set(),out=[];for(const part of parts){const key=normalizedWords(part);if(!key||seen.has(key))continue;seen.add(key);out.push(part);}return out.join('\n\n');
  }
  function calendarBookingDuplicateCard(row={},label='Appuntamento'){
    return `<article class="calendar-suggestion"><div><h3>${esc(label)} · ${esc(row.title||'Appuntamento')}</h3><p><strong>${esc(formatDate(row.startDate||''))}${row.allDay?'':` · ${esc(row.startTime||'Ora da definire')}`}</strong>${row.location?`<br>${esc(row.location)}`:''}</p>${row.notes?`<p class="kpi-note">${multilineHtml(row.notes)}</p>`:''}</div></article>`;
  }
  async function calendarBookingGoogleSyncFinal(row={}){
    let warning='';try{const googleStatus=await DossierCalendar.googleAdvancedStatus();if(googleStatus?.connected&&googleStatus?.healthDataConsent?.granted){const profileName=[activeProfile()?.firstName,activeProfile()?.lastName].filter(Boolean).join(' ');await DossierCalendar.googleAdvancedSyncEvent(row,profileName,true);}}catch(error){warning=error.message||'Sincronizzazione Google Calendar non riuscita';}return warning;
  }
  async function resolveCalendarBookingDuplicate(importedId='',existingId='',choice='existing'){
    if(!requireEdit())return;const imported=state.calendarEvents.find(x=>x.id===importedId),existing=state.calendarEvents.find(x=>x.id===existingId);if(!imported){toast('Prenotazione importata non trovata');return;}if(choice!=='both'&&!existing){toast('Appuntamento precedente non trovato');return;}
    const now=new Date().toISOString();let finalRow=null,googleWarning='';
    if(choice==='both'){
      const clean={...imported,pendingDuplicateResolution:false,duplicateCandidateIds:[],duplicateDetectedAt:'',updatedAt:now};finalRow=await scheduleLocalCalendarEvent(clean);await DossierDB.put('calendarEvents',finalRow,{details:{event:'calendar-booking-duplicate-keep-both'}});googleWarning=await calendarBookingGoogleSyncFinal(finalRow);
    }else{
      try{await DossierCalendar.cancelLocal(imported.id);}catch{}await DossierDB.del('calendarEvents',imported.id,{details:{event:'calendar-booking-duplicate-remove-provisional'}});
      if(choice==='imported'){
        const cleanImported={...imported};for(const key of ['pendingDuplicateResolution','duplicateCandidateIds','duplicateDetectedAt','localAlertStatus','localAlertCount','localAlertError','localAlertUpdatedAt'])delete cleanImported[key];finalRow={...cleanImported,id:existing.id,createdAt:existing.createdAt||cleanImported.createdAt||now,updatedAt:now};
      }else{
        finalRow={...existing,sourceDocumentId:imported.sourceDocumentId||existing.sourceDocumentId||'',sourceDocumentTitle:imported.sourceDocumentTitle||existing.sourceDocumentTitle||'',sourceKind:imported.sourceKind||existing.sourceKind||'',sourceExcerpt:imported.sourceExcerpt||existing.sourceExcerpt||'',bookingOriginalName:imported.bookingOriginalName||existing.bookingOriginalName||'',notes:calendarBookingMergeNotes(existing.notes,imported.notes),updatedAt:now};
      }
      finalRow=await scheduleLocalCalendarEvent(finalRow);await DossierDB.put('calendarEvents',finalRow,{details:{event:choice==='imported'?'calendar-booking-duplicate-use-imported':'calendar-booking-duplicate-use-existing'}});googleWarning=await calendarBookingGoogleSyncFinal(finalRow);
    }
    closeModal();await loadProfileData({deferCalendarMaintenance:true});await renderCalendar();toast(choice==='both'?'Entrambi gli appuntamenti mantenuti':choice==='imported'?'Prenotazione importata mantenuta e appuntamento esistente aggiornato':'Appuntamento precedente mantenuto e arricchito con la prenotazione');if(googleWarning)toast(`Google Calendar: ${googleWarning}`);
  }
  function openCalendarBookingDuplicateResolutionModal(importedId=''){
    const imported=state.calendarEvents.find(x=>x.id===importedId);if(!imported)return;const ids=(imported.duplicateCandidateIds||[]).filter(Boolean),candidates=ids.map(id=>state.calendarEvents.find(x=>x.id===id)).filter(Boolean);if(!candidates.length){const clean={...imported,pendingDuplicateResolution:false,duplicateCandidateIds:[],duplicateDetectedAt:'',updatedAt:new Date().toISOString()};void (async()=>{const ready=await scheduleLocalCalendarEvent(clean);await DossierDB.put('calendarEvents',ready,{details:{event:'calendar-booking-duplicate-no-longer-present'}});const warning=await calendarBookingGoogleSyncFinal(ready);await loadProfileData({deferCalendarMaintenance:true});await renderCalendar();if(warning)toast(`Google Calendar: ${warning}`);})();return;}
    const options=candidates.map((row,index)=>`<label class="check-row"><input type="radio" name="calendarDuplicateExisting" value="${esc(row.id)}" ${index===0?'checked':''}><span><strong>${esc(row.title)}</strong><small>${esc(formatDate(row.startDate||''))}${row.allDay?'':` · ${esc(row.startTime||'')}`}${row.location?` · ${esc(row.location)}`:''}</small></span></label>`).join('');
    openModal('Possibile appuntamento duplicato','La prenotazione è stata registrata nel Dossier ma NON è stata inviata a Google Calendar.',`<div class="notice warning"><strong>Sono presenti ${candidates.length+1} appuntamenti simili.</strong><br>Scegli quale mantenere prima della sincronizzazione con Google Calendar. Nessun secondo evento Google viene creato in questa fase.</div><div class="section-spacer"></div>${calendarBookingDuplicateCard(imported,'Prenotazione importata')}<div class="section-spacer"></div><h3>Appuntamento già presente da confrontare</h3>${options}<div class="form-actions"><button type="button" class="btn btn-light" id="calendarDuplicateKeepExisting">Mantieni il precedente</button><button type="button" class="btn btn-primary" id="calendarDuplicateKeepImported">Mantieni quello importato</button><button type="button" class="btn btn-ghost" id="calendarDuplicateKeepBoth">Mantieni entrambi</button></div><p class="kpi-note">Se mantieni uno solo dei due, Clinica Digitale conserva l'identificativo dell'appuntamento già esistente. Google Calendar riceve quindi al massimo un aggiornamento, non una creazione seguita da una cancellazione.</p>`);
    const selected=()=>String($('#modalBody input[name="calendarDuplicateExisting"]:checked')?.value||candidates[0]?.id||'');$('#calendarDuplicateKeepExisting').onclick=()=>resolveCalendarBookingDuplicate(imported.id,selected(),'existing');$('#calendarDuplicateKeepImported').onclick=()=>resolveCalendarBookingDuplicate(imported.id,selected(),'imported');$('#calendarDuplicateKeepBoth').onclick=()=>resolveCalendarBookingDuplicate(imported.id,selected(),'both');
  }
  function calendarBookingDetectedProfileId(analysis={}){const best=analysis?.profileEvidence?.best;return best&&Number(best.score||0)>=70&&state.profiles.some(p=>p.id===best.profileId)?best.profileId:state.activeProfileId;}
  async function archiveCalendarBookingDocument(importData={},profileId=''){
    const file=importData.file;if(!(file instanceof Blob))throw new Error('File originale della prenotazione non disponibile');
    const hash=await fileHash(file),docs=await DossierDB.byProfile('documents',profileId),existing=docs.find(d=>d.hash===hash);
    if(existing){const reconciled=calendarNormalizeImportedBookingDocument(existing);if(reconciled.parsed){await DossierDB.put('documents',reconciled.doc,{details:{event:'r12-booking-existing-archive-reconciled'}});if(profileId===state.activeProfileId){const idx=state.documents.findIndex(x=>String(x.id)===String(reconciled.doc.id));if(idx>=0)state.documents[idx]=reconciled.doc;}return reconciled.doc;}return existing;}
    const now=new Date().toISOString(),parsed=importData.parsed||{},result=importData.result||{},general=importData.analysis||{},category=parsed.category==='Prenotazione visita'?'Prenotazione visita':'Prenotazione esami';
    const clinicalDate=isValidClinicalDate(general.clinicalDate||'')?general.clinicalDate:'',issueDate=isValidClinicalDate(general.issueDate||'')?general.issueDate:'';
    const doc={id:uid('doc'),profileId,originalName:file.name||'prenotazione',mimeType:file.type||'application/octet-stream',size:Number(file.size||0),fileBlob:file,hash,clinicalDate,issueDate,dateStatus:clinicalDate?(general.dateStatus||'confirmed'):'not_applicable',title:`Prenotazione · ${String(parsed.service||file.name||'appuntamento').replace(/\.[^.]+$/,'').trim()}`.slice(0,220),category,documentMode:general.documentMode||'narrative',documentKind:'Promemoria di prenotazione',specialization:general.specialization||general.department||'',department:general.department||general.specialization||'',facility:general.facility||parsed.facility||'',doctor:general.doctor||'',doctorQualification:general.doctorQualification||'',documentNumber:general.documentNumber||(parsed.references||[]).join(' · ').slice(0,500),extractedText:String(result.text||general.extractedText||''),structuredText:String(general.structuredText||result.text||''),reconstructedText:String(general.reconstructedText||''),documentContext:'prenotazione-agenda',ocrIntegralText:String(result.text||general.ocrIntegralText||''),reportSections:general.reportSections||[],ecgParameters:general.ecgParameters||[],notes:general.notes||'',labValues:general.labValues||[],qualitativeResults:general.qualitativeResults||[],tableRows:general.tableRows||[],extractionStats:general.extractionStats||null,medicalPersonnel:general.medicalPersonnel||[],identifiers:general.identifiers||[],extractedTherapies:general.extractedTherapies||[],extractedDiagnoses:general.extractedDiagnoses||[],extractedExemptions:general.extractedExemptions||[],dateCandidates:general.dateCandidates||[],profileEvidence:general.profileEvidence||null,textFingerprint:general.textFingerprint||HealthExtractors.textFingerprint(String(result.text||'')),pageFingerprints:general.pageFingerprints||HealthExtractors.buildPageFingerprints(result.pages||[],String(result.text||''),clinicalDate),ocrPageData:(result.pages||[]).map(p=>({pageNumber:p.pageNumber,text:p.text||'',visualHash:p.visualHash||'',lines:p.lines||[],selectedPass:p.selectedPass||'',quality:Number(p.quality||0),passes:p.passes||[],width:p.width||0,height:p.height||0})),ocrStatus:'completed',ocrEngine:result.engine||'',ocrLanguage:result.language||'',ocrProcessedPages:result.processedPages||0,ocrQuality:Math.round((result.pages||[]).reduce((a,p)=>a+Number(p.quality||0),0)/Math.max(1,(result.pages||[]).length)),lastAnalysisAt:now,needsCompletion:false,timelineVisible:false,sourceSection:'calendar',pdfExportOverride:true,pdfExportMode:'exclude',bookingService:parsed.service||'',bookingStartDate:parsed.startDate||'',bookingStartTime:parsed.startTime||'',bookingLocation:parsed.location||'',bookingFacility:parsed.facility||'',bookingReferences:parsed.references||[],bookingDetectedAt:now,bookingDetectedVersion:'r12-booking-parser-isolated',addedAt:now,updatedAt:now};
    await DossierDB.put('documents',doc,{details:{event:'calendar-booking-source-import-r12'}});
    if(profileId===state.activeProfileId){const idx=state.documents.findIndex(x=>String(x.id)===String(doc.id));if(idx>=0)state.documents[idx]=doc;else state.documents.unshift(doc);}
    if(state.archiveHandle&&profileId===state.activeProfileId)await syncDocumentToFolder(doc).catch(()=>{});return doc;
  }
  function openCalendarBookingImportModal(){
    if(!requireEdit())return;
    openModal('Importa prenotazione','Da PDF, fotografia o scanner. Il documento originale resterà allegato all’appuntamento.',`<section><div class="notice">Il Dossier legge localmente il documento e prepara i dati dell’evento. Prima del salvataggio puoi correggere ogni campo.</div><div class="section-spacer"></div><input id="calendarBookingFileInput" class="hidden" type="file" accept="application/pdf,image/jpeg,image/png,image/bmp,image/tiff,.pdf,.jpg,.jpeg,.png,.bmp,.tif,.tiff"><div class="row-actions"><button type="button" class="btn btn-primary" id="calendarBookingChooseFileBtn">Scegli PDF o foto</button><button type="button" class="btn btn-light" id="calendarBookingCameraBtn">Fotografa</button><button type="button" class="btn btn-light" id="calendarBookingScannerBtn">Scanner</button></div><div class="section-spacer"></div><div class="notice success"><strong>File originale sempre disponibile.</strong><br>${esc(CALENDAR_BOOKING_SOURCE_NOTE)}</div></section>`);
    $('#calendarBookingChooseFileBtn').onclick=()=>$('#calendarBookingFileInput').click();$('#calendarBookingFileInput').onchange=e=>{const file=e.target.files?.[0];if(file)void analyzeCalendarBookingFile(file);};
    $('#calendarBookingCameraBtn').onclick=()=>{closeModal();void openCameraCapture({single:false,title:'Fotografa prenotazione',onComplete:async files=>{if(files?.[0])await analyzeCalendarBookingFile(files[0]);}});};
    $('#calendarBookingScannerBtn').onclick=()=>{closeModal();void openScannerCapture({title:'Scansiona prenotazione',onComplete:async files=>{if(files?.[0])await analyzeCalendarBookingFile(files[0]);}});};
  }
  async function analyzeCalendarBookingFile(file){
    if(!(file instanceof File||file instanceof Blob))return;openModal('Analisi prenotazione',file.name||'Documento acquisito','<div class="notice" id="calendarBookingProgress">Preparazione del riconoscimento…</div>');
    const progress=$('#calendarBookingProgress');try{if(!state.ocrHealth.ok)state.ocrHealth=await OCRService.health(true);const isPdf=/\.pdf$/i.test(file.name||'')||file.type==='application/pdf';if(!state.ocrHealth.ocrAvailable&&!state.ocrHealth.ocrDeferred&&!(isPdf&&state.ocrHealth.nativePdfAvailable))throw new Error(state.ocrHealth.error||'Motore locale non disponibile');const result=await OCRService.analyzeFile(file,p=>{if(progress)progress.textContent=p?.message||`Analisi in corso ${Math.round(Number(p?.progress||0))}%`;});const analysis=analyzeOcrResult(result,state.activeProfileId,file.name||'prenotazione');const parsed=calendarBookingDataFromText(result.text||'',analysis);openCalendarBookingReview(file,result,analysis,parsed);}catch(error){openModal('Importazione non completata','Il file originale non è stato modificato.',`<div class="notice danger">${esc(error?.message||String(error))}</div><div class="form-actions"><button type="button" class="btn btn-light" id="calendarBookingRetryClose">Chiudi</button></div>`);$('#calendarBookingRetryClose').onclick=closeModal;}
  }
  function openCalendarBookingReview(file,result,analysis,parsed){
    const detectedProfileId=calendarBookingDetectedProfileId(analysis),profileOptions=state.profiles.map(p=>`<option value="${esc(p.id)}" ${p.id===detectedProfileId?'selected':''}>${esc(`${p.firstName||''} ${p.lastName||''}`.trim()||'Profilo')}</option>`).join('');const profileEvidence=analysis?.profileEvidence?.best,detectedLabel=profileEvidence&&Number(profileEvidence.score||0)>=70?`Profilo rilevato dal documento: <strong>${esc(profileEvidence.name||'')}</strong>.`:'';
    openModal('Verifica prenotazione','Controlla i dati rilevati prima di creare l’appuntamento.',`<form id="calendarBookingReviewForm"><div class="notice ${parsed.startDate&&parsed.service?'success':'warning'}">${parsed.startDate&&parsed.service?'I dati principali sono stati rilevati.':'Controlla i campi evidenziati: alcuni dati non sono stati riconosciuti con certezza.'}${detectedLabel?`<br>${detectedLabel}`:''}</div><div class="section-spacer"></div><div class="form-grid"><div class="form-group"><label>Profilo</label><select class="form-control" name="profileId">${profileOptions}</select></div><div class="form-group"><label>Tipo</label><select class="form-control" name="category">${CALENDAR_CATEGORIES.map(x=>`<option ${parsed.category===x?'selected':''}>${esc(x)}</option>`).join('')}</select></div><div class="form-group span-2"><label>Prestazione / titolo</label><input class="form-control" name="title" required value="${esc(parsed.service||'')}"></div><div class="form-group"><label>Data</label><input class="form-control" type="date" name="startDate" required value="${esc(parsed.startDate||'')}"></div><div class="form-group"><label>Ora</label><input class="form-control" type="time" name="startTime" value="${esc(parsed.startTime||'')}"></div><div class="form-group"><label>Durata</label><select class="form-control" name="durationMinutes"><option value="30">30 minuti</option><option value="60" selected>1 ora</option><option value="90">1 ora e 30</option><option value="120">2 ore</option><option value="180">3 ore</option><option value="240">4 ore</option></select></div><div class="form-group span-2"><label>Luogo / struttura</label><input class="form-control" name="location" value="${esc(parsed.location||'')}"></div><div class="form-group span-2"><label>Indicazioni e riferimenti rilevati</label><textarea class="form-control" name="notes" rows="9">${esc(parsed.notes||CALENDAR_BOOKING_SOURCE_NOTE)}</textarea><small>Comprende, quando presenti, padiglione/percorso, preparazione, digiuno, anticipo richiesto e riferimenti della prenotazione.</small></div></div><div class="section-spacer"></div><div class="notice success"><strong>Originale allegato:</strong> ${esc(file.name||'documento acquisito')}<br>${esc(CALENDAR_BOOKING_SOURCE_NOTE)}</div><div class="form-actions"><button type="button" class="btn btn-light" id="calendarBookingReviewCancel">Annulla</button><button class="btn btn-primary">Continua</button></div></form>`);
    $('#calendarBookingReviewCancel').onclick=closeModal;$('#calendarBookingReviewForm').onsubmit=async e=>{e.preventDefault();if(!requireEdit())return;const fd=new FormData(e.currentTarget),profileId=String(fd.get('profileId')||state.activeProfileId),title=String(fd.get('title')||'').trim(),startDate=String(fd.get('startDate')||'');if(!title||!startDate){toast('Inserisci prestazione e data');return;}if(profileId!==state.activeProfileId){state.activeProfileId=profileId;await DossierDB.put('settings',{key:'activeProfileId',value:profileId});await loadProfileData({deferCalendarMaintenance:true});renderProfileSelect();}const item={category:String(fd.get('category')||'Esame'),title,startDate,startTime:String(fd.get('startTime')||''),allDay:false,durationMinutes:Number(fd.get('durationMinutes')||60),status:'planned',location:String(fd.get('location')||'').trim(),notes:String(fd.get('notes')||CALENDAR_BOOKING_SOURCE_NOTE).trim(),sourceKind:'booking-import',sourceExcerpt:'Documento originale della prenotazione allegato.',pendingBookingImport:{file,result,analysis,parsed:{...parsed,service:title,category:String(fd.get('category')||parsed.category||'Esame'),startDate,startTime:String(fd.get('startTime')||''),location:String(fd.get('location')||'').trim(),notes:String(fd.get('notes')||'').trim()},profileId}};closeModal();openCalendarEventModal({...item,lockProfile:true});};
  }
  // BOOKING_IMPORT_V1_END

  function calendarSuggestionsForDocument(doc={}){
    if(!doc?.id||isComplexClinicalDoc(doc))return[];
    const text=calendarDocumentText(doc);if(!text)return[];
    const out=[],seen=new Set(),base=doc.clinicalDate||'';
    const add=(match,index,dueDate,kind='')=>{
      if(!calendarSuggestionDateAllowed(dueDate))return;
      const decisionKey=calendarSuggestionDecisionKey(doc.id,kind||'richiamo-referto',dueDate,match);if(seen.has(decisionKey))return;seen.add(decisionKey);
      const excerpt=calendarExcerpt(text,index,Math.max(260,String(match||'').length+180));const category=calendarCategoryFromText(`${kind} ${match}`);const titleBase=String(doc.documentKind||doc.category||doc.title||'Referto').replace(/\s+/g,' ').trim();
      out.push({id:`calsug_${calendarHash(decisionKey)}`,decisionKey,profileId:doc.profileId,sourceDocumentId:doc.id,sourceDocumentTitle:doc.title||doc.originalName||'Documento',sourceClinicalDate:doc.clinicalDate||'',sourceExcerpt:excerpt,sourceMatch:String(match||'').replace(/\s+/g,' ').trim(),suggestedDate:dueDate,category,title:`${category} consigliato · ${titleBase}`,status:'pending',detectedAt:new Date().toISOString(),rule:kind||'richiamo-referto'});
    };
    const relative=/(?:si\s+consiglia\s+|si\s+raccomanda\s+|programma(?:re)?\s+|da\s+)?(?:controllo|ricontrollo|rivalutazione|follow[\s-]?up|richiamo|visita\s+di\s+controllo|ripetere|ripetizione|rivedere|nuova\s+visita)[^\n.!?]{0,100}?(?:tra|fra|entro|a\s+distanza\s+di|in|a)\s+(\d{1,2}|uno|una|due|tre|quattro|cinque|sei|sette|otto|nove|dieci|dodici|quindici|venti|ventiquattro)\s+(giorn[oi]|settiman[ae]|mes[ei]|ann[oi])/gi;
    for(const m of text.matchAll(relative)){const count=Number(m[1])||WORD_NUMBERS[normalizedWords(m[1])]||0;if(!count||!base)continue;add(m[0],m.index||0,calendarDateAdd(base,count,m[2]),'intervallo');}
    const explicit=/(?:controllo|ricontrollo|rivalutazione|follow[\s-]?up|richiamo|visita|appuntamento|ripetere)[^\n.!?]{0,90}?(?:il|per|entro|in\s+data)?\s*(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{4}|\d{4}-\d{2}-\d{2})/gi;
    for(const m of text.matchAll(explicit)){const due=calendarParseExplicitDate(m[1]);if(due)add(m[0],m.index||0,due,'data-esplicita');}
    const annual=/(?:controllo|ricontrollo|rivalutazione|follow[\s-]?up|richiamo|visita)[^\n.!?]{0,70}?(?:annuale|annualmente|ogni\s+anno)/gi;
    for(const m of text.matchAll(annual)){if(base)add(m[0],m.index||0,calendarDateAdd(base,1,'anno'),'annuale');}
    return out.slice(0,12);
  }
  async function refreshCalendarSuggestionsFromDocuments(){
    if(!state.activeProfileId)return;
    const existing=state.calendarSuggestions.length?state.calendarSuggestions:await DossierDB.byProfile('calendarSuggestions',state.activeProfileId);
    const byId=new Map(existing.map(x=>[x.id,x])),byDecision=new Map(existing.filter(x=>x.decisionKey).map(x=>[x.decisionKey,x])),detected=[];
    const mergeDecision=(raw)=>{const legacy=existing.find(x=>x.sourceDocumentId===raw.sourceDocumentId&&x.suggestedDate===raw.suggestedDate&&(x.rule||'')===(raw.rule||'')&&(!x.decisionKey||x.decisionKey===raw.decisionKey));const old=byDecision.get(raw.decisionKey)||byId.get(raw.id)||legacy;return old?{...raw,id:old.id||raw.id,status:old.status||'pending',scheduledEventId:old.scheduledEventId||'',dismissedAt:old.dismissedAt||'',createdAt:old.createdAt||raw.detectedAt,updatedAt:new Date().toISOString()}:{...raw,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};};
    for(const doc of state.documents)for(const raw of calendarSuggestionsForDocument(doc))detected.push(mergeDecision(raw));
    for(const exemption of state.exemptions){
      const due=calendarParseExplicitDate(String(exemption.expiry||'').trim());if(!due||!calendarSuggestionDateAllowed(due))continue;
      const sourceDoc=state.documents.find(d=>d.id===exemption.sourceDocumentId);const decisionKey=`exemption|${exemption.id}|${due}`;
      const raw={id:`calexp_${calendarHash(decisionKey)}`,decisionKey,profileId:state.activeProfileId,sourceDocumentId:exemption.sourceDocumentId||'',sourceDocumentTitle:sourceDoc?.title||sourceDoc?.originalName||'',sourceClinicalDate:sourceDoc?.clinicalDate||exemption.validFrom||'',sourceExcerpt:`Scadenza dell’esenzione ${exemption.code||''}${exemption.description?` · ${exemption.description}`:''}`.trim(),sourceMatch:`${exemption.code||''}|${exemption.description||''}`,suggestedDate:due,category:'Rinnovo esenzione',title:`Rinnovo esenzione${exemption.code?` ${exemption.code}`:''}`,status:'pending',detectedAt:new Date().toISOString(),rule:'scadenza-esenzione'};
      detected.push(mergeDecision(raw));
    }
    const retained=[...detected];const detectedIds=new Set(detected.map(x=>x.id));
    for(const old of existing){if(['dismissed','scheduled'].includes(old.status)&&!detectedIds.has(old.id))retained.push(old);}
    for(const row of retained){const old=byId.get(row.id);if(!old||JSON.stringify({...old,updatedAt:''})!==JSON.stringify({...row,updatedAt:''}))await DossierDB.put('calendarSuggestions',row,{audit:false,sync:false});}
    for(const old of existing){if(old.status==='pending'&&!detectedIds.has(old.id))await DossierDB.del('calendarSuggestions',old.id,{audit:false,sync:false});}
    state.calendarSuggestions=(await DossierDB.byProfile('calendarSuggestions',state.activeProfileId)).sort((a,b)=>String(a.suggestedDate||'9999-12-31').localeCompare(String(b.suggestedDate||'9999-12-31')));
  }
  function calendarSourceHtml(row={}){if(!row.sourceDocumentId)return'';const booking=row.sourceKind==='booking-import';return `<div class="calendar-source"><div><strong>Origine:</strong> ${esc(row.sourceDocumentTitle||'Documento sanitario')}${row.sourceClinicalDate?` · ${formatDate(row.sourceClinicalDate)}`:''}${row.sourceExcerpt?`<br><span>${esc(row.sourceExcerpt)}</span>`:''}</div><button type="button" class="btn btn-ghost btn-small" data-calendar-open-source="${esc(row.sourceDocumentId)}">${booking?'Apri file originale':'Apri referto di origine'}</button></div>`;}
  function bindCalendarSourceButtons(scope=document){$$('[data-calendar-open-source]',scope).forEach(button=>button.addEventListener('click',()=>{const id=button.dataset.calendarOpenSource;if(id)viewDocument(id);}));}
  function calendarReminderLabels(values=[]){const map=new Map(CALENDAR_REMINDERS.map(([v,l])=>[Number(v),l]));const fallback=v=>{if(v%10080===0){const n=v/10080;return `${n} ${n===1?'settimana':'settimane'} prima`;}if(v%1440===0){const n=v/1440;return `${n} ${n===1?'giorno':'giorni'} prima`;}if(v%60===0){const n=v/60;return `${n} ${n===1?'ora':'ore'} prima`;}return `${v} minuti prima`;};return (values||[]).map(Number).filter(Number.isFinite).sort((a,b)=>b-a).map(v=>map.get(v)||fallback(v)).join(', ');}
  function calendarStatusLabel(status='planned'){return status==='completed'?'Completato':status==='cancelled'?'Annullato':'Programmato';}
  async function refreshLocalCalendarStatus(){state.calendarLocalStatus=globalThis.DossierCalendar?await DossierCalendar.localStatus():{ok:false,supported:false,error:'Modulo agenda locale non disponibile'};return state.calendarLocalStatus;}
  async function scheduleLocalCalendarEvent(row,{silent=false,readOnlyMedication=false}={}){
    if(!globalThis.DossierCalendar)return row;
    if(row.pendingDuplicateResolution){try{await DossierCalendar.cancelLocal(row.id);}catch{}row.localAlertStatus='none';row.localAlertCount=0;row.localAlertError='';return row;}
    const medicationRow=row.sourceKind==='therapy-reorder'||row.medicationReorder===true;
    if(medicationRow){
      try{await DossierCalendar.cancelLocal(row.id);}catch{}
      try{await DossierCalendar.cancelMedicationLocal(row.id,row.profileId||state.activeProfileId);}catch{}
      if((row.status||'planned')!=='planned'||!(row.reminders||[]).length){row.localAlertStatus='none';row.localAlertCount=0;row.localAlertError='';return row;}
      try{
        const profileName=calendarProfileName(row.profileId||state.activeProfileId);
        const result=readOnlyMedication?await DossierCalendar.scheduleLocal(row,profileName):await DossierCalendar.scheduleMedicationLocal(row,profileName);
        row.localAlertStatus=(readOnlyMedication?Number(result.scheduledCount||0)>0:!!result.scheduled)?'scheduled':'none';
        row.localAlertCount=readOnlyMedication?Number(result.scheduledCount||0):(result.scheduled?1:0);row.localAlertError=result.error||'';row.localAlertUpdatedAt=new Date().toISOString();
      }
      catch(error){row.localAlertStatus='error';row.localAlertError=error.message;if(!silent)toast(`Promemoria farmaco non programmato: ${error.message}`);}
      return row;
    }
    if((row.status||'planned')!=='planned'||!(row.reminders||[]).length){try{await DossierCalendar.cancelLocal(row.id);}catch{}row.localAlertStatus='none';row.localAlertError='';return row;}
    try{const profileName=calendarProfileName(row.profileId||state.activeProfileId);const result=await DossierCalendar.scheduleLocal(row,profileName);row.localAlertStatus=result.scheduledCount>0?'scheduled':'none';row.localAlertCount=Number(result.scheduledCount||0);row.localAlertError=result.error||'';row.localAlertUpdatedAt=new Date().toISOString();}
    catch(error){row.localAlertStatus='error';row.localAlertError=error.message;if(!silent)toast(`Appuntamento salvato. Avviso Windows non programmato: ${error.message}`);}
    return row;
  }
  async function syncLocalCalendarAlerts({silent=true,force=false}={}){
    if(!globalThis.DossierCalendar||!state.activeProfileId||calendarLocalSyncBusy)return 0;
    const now=Date.now();if(!force&&now-calendarLocalSyncLastAt<2*60*1000)return 0;
    calendarLocalSyncBusy=true;calendarLocalSyncLastAt=now;let count=0;
    try{
      const context=await loadFamilyAgendaContext();
      const rows=calendarOperationalEvents(context.events);
      const childIds=calendarFamilyChildIds(rows);
      for(const child of context.events.filter(x=>childIds.has(String(x.id)))){try{await DossierCalendar.cancelLocal(String(child.id));}catch{}try{await DossierCalendar.cancelMedicationLocal(String(child.id),String(child.profileId||''));}catch{}}
      const visibleIds=new Set(rows.map(row=>String(row.id)));
      let oldIds=[];try{oldIds=JSON.parse(localStorage.getItem('calendarAuthorizedScheduledIdsV2')||localStorage.getItem('calendarAuthorizedScheduledIdsV1')||'[]');if(!Array.isArray(oldIds))oldIds=[];}catch{oldIds=[];}
      for(const oldId of oldIds){if(!visibleIds.has(String(oldId))){try{await DossierCalendar.cancelLocal(String(oldId));}catch{}try{await DossierCalendar.cancelMedicationLocal(String(oldId),'');}catch{}}}
      const futureIds=[];
      for(let i=0;i<rows.length;i++){
        const current=rows[i];if((current.status||'planned')!=='planned'||String(current.startDate||'')<calendarLocalToday())continue;
        futureIds.push(String(current.id));
        let updated={...current};
        if(current.familyMedicationGroup){
          const interactive=calendarCanManageFamilyMedication(current);
          try{await DossierCalendar.cancelLocal(current.id);}catch{}try{await DossierCalendar.cancelMedicationLocal(current.id,'');}catch{}
          try{
            const result=interactive?await DossierCalendar.scheduleMedicationLocal(current,'Famiglia'):await DossierCalendar.scheduleLocal({...current,reminders:[60]},'Famiglia');
            updated.localAlertStatus=(interactive?!!result.scheduled:Number(result.scheduledCount||0)>0)?'scheduled':'none';
            updated.localAlertCount=interactive?(result.scheduled?1:0):Number(result.scheduledCount||0);updated.localAlertError=result.error||'';updated.localAlertUpdatedAt=new Date().toISOString();
          }catch(error){updated.localAlertStatus='error';updated.localAlertError=error.message;}
          state.calendarFamilyVirtualLocalStatus[current.id]={localAlertStatus:updated.localAlertStatus,localAlertCount:updated.localAlertCount,localAlertError:updated.localAlertError,localAlertUpdatedAt:updated.localAlertUpdatedAt};
          if(updated.localAlertStatus!==current.localAlertStatus||updated.localAlertCount!==current.localAlertCount||updated.localAlertError!==current.localAlertError)count++;
          continue;
        }
        updated=await scheduleLocalCalendarEvent(updated,{silent:true,readOnlyMedication:calendarIsMedicationRequest(updated)&&!calendarCanManageProfile(updated.profileId,'medications')});
        if(updated.localAlertStatus!==current.localAlertStatus||updated.localAlertCount!==current.localAlertCount||updated.localAlertError!==current.localAlertError){
          await DossierDB.put('calendarEvents',updated,{audit:false,sync:false});count++;
          const familyIndex=state.calendarFamilyEvents.findIndex(x=>String(x.id)===String(updated.id));if(familyIndex>=0)state.calendarFamilyEvents[familyIndex]=updated;
          const activeIndex=state.calendarEvents.findIndex(x=>String(x.id)===String(updated.id));if(activeIndex>=0)state.calendarEvents[activeIndex]=updated;
        }
      }
      localStorage.setItem('calendarAuthorizedScheduledIdsV2',JSON.stringify(futureIds));
      void syncAuthorizedCalendarToGoogle({silent:true,force});
      if(count&&!silent)toast(`${count} promemoria Windows aggiornati`);return count;
    }finally{calendarLocalSyncBusy=false;}
  }
  function calendarReminderInstant(row,minutes){
    const base=new Date(`${row.startDate}T${row.allDay?'09:00':row.startTime||'09:00'}:00`);if(Number.isNaN(base.getTime()))return null;base.setMinutes(base.getMinutes()-Number(minutes||0));return base;
  }
  function checkCalendarRemindersInApp(){
    if(!state.activeProfileId)return;const now=Date.now();const rows=state.calendarFamilyEvents?.length?state.calendarFamilyEvents:state.calendarEvents;
    for(const row of rows){if((row.status||'planned')!=='planned'||row.pendingDuplicateResolution)continue;const profileName=calendarProfileName(row.profileId||state.activeProfileId);for(const minutes of row.reminders||[]){const instant=calendarReminderInstant(row,minutes);if(!instant)continue;const diff=now-instant.getTime();if(diff<0||diff>15*60*1000)continue;const key=`calendarAlert:${row.id}:${minutes}:${row.startDate}:${row.startTime||''}`;if(localStorage.getItem(key))continue;localStorage.setItem(key,new Date().toISOString());toast(`${profileName?profileName+' · ':''}${row.title} · ${calendarReminderLabels([minutes])}`);}}
  }
  function ensureCalendarReminderLoop(){if(calendarReminderTimer)return;calendarReminderTimer=setInterval(checkCalendarRemindersInApp,60000);setTimeout(checkCalendarRemindersInApp,1500);}
  function calendarMonthKey(date=calendarLocalToday()){return /^\d{4}-\d{2}/.test(date)?date.slice(0,7):calendarLocalToday().slice(0,7);}
  function calendarShiftMonth(key,offset){const [y,m]=key.split('-').map(Number);const d=new Date(y,m-1+offset,1,12);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;}
  function calendarMonthHtml(monthKey,eventRows=state.calendarEvents){
    const [year,month]=monthKey.split('-').map(Number),first=new Date(year,month-1,1,12),days=new Date(year,month,0).getDate();let weekday=(first.getDay()+6)%7;const cells=[];
    for(let i=0;i<weekday;i++)cells.push('<div class="calendar-month-day empty"></div>');
    for(let day=1;day<=days;day++){
      const date=`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;const rows=eventRows.filter(x=>(x.status||'planned')==='planned'&&x.startDate===date).sort((a,b)=>calendarEventDateTime(a).localeCompare(calendarEventDateTime(b)));const isToday=date===calendarLocalToday();
      cells.push(`<div class="calendar-month-day ${isToday?'today':''}"><button type="button" class="calendar-month-date" data-calendar-day="${date}" aria-label="Aggiungi voce il ${day}"><strong>${day}</strong></button>${rows.slice(0,2).map(x=>{const sync=calendarSyncPresentation(x);const selected=state.selectedCalendarEventId===x.id;const meta=[x.category,x.location||x.doctorName].filter(Boolean).join(' · ');const shortSync=sync.googleSynced&&x.localAlertStatus==='scheduled'?'Win + Google':sync.googleSynced?'Google':x.localAlertStatus==='scheduled'?'Windows':'Avvisi non impostati';return `<button type="button" class="calendar-month-entry ${selected?'selected':''}" data-calendar-select="${x.id}"><span class="calendar-month-entry-main"><b class="calendar-month-entry-time">${x.allDay?'':esc(x.startTime||'')}</b><strong class="calendar-month-entry-title">${esc(x.title||'Appuntamento')}</strong></span><small class="calendar-month-entry-meta" style="color:${calendarProfileColor(x.profileId)}">${esc(calendarProfileName(x.profileId))} · ${esc(meta||'Appuntamento')}</small><em class="calendar-month-entry-sync ${sync.cls}" title="${esc(sync.label)}">${esc(shortSync)}</em></button>`;}).join('')}${rows.length>2?`<small class="calendar-month-more">+${rows.length-2} altri</small>`:''}</div>`);
    }
    const label=new Intl.DateTimeFormat('it-IT',{month:'long',year:'numeric'}).format(first);
    return `<div class="calendar-month-toolbar"><button class="btn btn-light btn-small" id="calendarPrevMonth">‹</button><strong>${esc(label.charAt(0).toUpperCase()+label.slice(1))}</strong><button class="btn btn-light btn-small" id="calendarNextMonth">›</button></div><div class="calendar-month-weekdays">${['Lun','Mar','Mer','Gio','Ven','Sab','Dom'].map(x=>`<span>${x}</span>`).join('')}</div><div class="calendar-month-grid">${cells.join('')}</div>`;
  }
  const CALENDAR_UI_COMPAT_TEXT='Sincronizza agenda con Google Calendar · Google Calendar ✓ Sincronizzato · Google Calendar · Da sincronizzare · Google Calendar ⚠ Sincronizzazione non riuscita · I singoli appuntamenti vengono sincronizzati automaticamente al salvataggio. · La configurazione è <strong>facoltativa e gratuita, nei limiti di utilizzo previsti da Google</strong>';
  function calendarCategoryVisual(category='Altro'){
    const c=String(category||'Altro').toLowerCase();
    if(/farmac|medicin|terap|ricetta|prescrizion|riordin|piano terapeut/.test(c))return{icon:'therapy',tone:'violet'};
    if(/visita|controllo/.test(c))return{icon:'heart',tone:'rose'};
    if(/esame/.test(c))return{icon:'diagnosis',tone:'teal'};
    if(/vaccin|richiam|preven/.test(c))return{icon:'shield',tone:'green'};
    if(/document/.test(c))return{icon:'document',tone:'blue'};
    return{icon:'calendar',tone:'amber'};
  }
  function calendarEventVisual(row={}){
    const semantic=String([row.category,row.title,row.sourceKind,row.kind,row.type].filter(Boolean).join(' ')).toLowerCase();
    if(row.familyMedicationGroup||/farmac|medicin|terap|ricetta|prescrizion|riordin|piano terapeut/.test(semantic))return{icon:'therapy',tone:'violet'};
    return calendarCategoryVisual(row.category);
  }
  function calendarSyncPresentation(row){
    const googleState=state.googleCalendarEventStatus?.[row.id]||{};
    const googleConnected=Boolean(state.googleCalendarStatus?.connected);
    const currentRevision=String(row.updatedAt||'');
    const attemptedRevision=String(googleState.attemptedLocalUpdatedAt||'');
    const syncedRevision=String(googleState.syncedLocalUpdatedAt||'');
    const localOk=row.localAlertStatus==='scheduled';
    const localError=row.localAlertStatus==='error';
    const googleError=Boolean(googleState.lastError&&attemptedRevision&&attemptedRevision===currentRevision);
    const googleSynced=Boolean(googleConnected&&googleState.linked&&syncedRevision&&syncedRevision===currentRevision&&!googleError);
    if(row.pendingDuplicateResolution)return{label:'Google sospeso · possibile duplicato',cls:'warning',googleSynced:false};
    if(localError)return{label:'Avvisi Windows da verificare',cls:'warning',googleSynced};
    if(localOk&&googleSynced)return{label:'Avvisi Windows + Google',cls:'success',googleSynced:true};
    if(localOk&&googleConnected&&googleError)return{label:'Avvisi Windows · Google da verificare',cls:'warning',googleSynced:false};
    if(localOk&&googleConnected)return{label:'Avvisi Windows · Google da sincronizzare',cls:'neutral',googleSynced:false};
    if(localOk)return{label:'Avvisi Windows',cls:'success',googleSynced:false};
    if(googleSynced)return{label:'Google Calendar',cls:'success',googleSynced:true};
    return{label:'Avvisi non impostati',cls:'neutral',googleSynced:false};
  }
  function calendarEventRow(row){
    const visual=calendarEventVisual(row),sync=calendarSyncPresentation(row),selected=state.selectedCalendarEventId===row.id;
    const extended=false;
    if(row.familyMedicationGroup){const members=(row.familyProfileIds||[]).map(id=>calendarProfilePill(id,'compact')).join('');const medCount=(row.familyMedicationItems||[]).reduce((n,m)=>n+(m.items||[]).length,0),overdue=calendarOpenOverdueMedication(row);return `<button type="button" class="agenda-event-row family-medication-event ${selected?'selected':''}" data-calendar-select="${row.id}"><span class="agenda-event-time"><strong>${esc(row.startTime||'09:00')}</strong><small>unico evento</small></span><span class="agenda-event-icon violet medication-semantic-icon">${uiIconSvg('therapy')}</span><span class="agenda-event-content"><span class="agenda-event-titleline"><strong>Richiesta farmaci famiglia</strong><span class="badge agenda-category-badge">${medCount} farmaci</span>${overdue?'<span class="badge warning">In ritardo</span>':''}</span><span class="family-member-pills">${members}</span><small>Raggruppamento familiare entro la finestra impostata</small></span><span class="badge agenda-sync-pill ${sync.cls}">${esc(sync.label)}</span><span class="agenda-event-chevron">›</span></button>`;}
    const overdue=calendarOpenOverdueMedication(row);return `<button type="button" class="agenda-event-row ${selected?'selected':''}" data-calendar-select="${row.id}"><span class="agenda-event-time"><strong>${row.allDay?'—':esc(row.startTime||'—')}</strong>${!row.allDay&&row.durationMinutes?`<small>${Number(row.durationMinutes)} min</small>`:''}</span><span class="agenda-event-icon ${visual.tone} ${visual.icon==='therapy'?'medication-semantic-icon':''}">${uiIconSvg(visual.icon)}</span><span class="agenda-event-content"><span class="agenda-event-titleline"><strong>${esc(row.title||'Appuntamento')}</strong><span class="badge agenda-category-badge">${esc(row.category||'Altro')}</span>${calendarProfileBadge(row)}${overdue?'<span class="badge warning">In ritardo</span>':''}</span><small>${esc([row.doctorName,row.location].filter(Boolean).join(' · ')||'Nessun luogo o medico indicato')}</small>${extended&&row.notes?`<span class="agenda-event-note">${esc(String(row.notes).replace(/\s+/g,' ').slice(0,120))}${String(row.notes).length>120?'…':''}</span>`:''}</span><span class="badge agenda-sync-pill ${sync.cls}">${esc(sync.label)}</span><span class="agenda-event-chevron">›</span></button>`;
  }
  function profileHomeAddressText(profile=activeProfile()){const p=profile||{};return [String(p.address||'').trim(),[String(p.postalCode||'').trim(),String(p.city||'').trim()].filter(Boolean).join(' '),String(p.province||'').trim()].filter(Boolean).join(', ');}
  function approximateTravelFromHome(location='',profile=activeProfile()){
    const p=profile||{},rawLocation=String(location||''),loc=normalizeClinicalText(rawLocation),home=normalizeClinicalText(profileHomeAddressText(p)),city=normalizeClinicalText(String(p.city||'')),province=normalizeClinicalText(String(p.province||'')),street=normalizeClinicalText(String(p.address||'').replace(/\d+/g,'').trim());
    if(!loc||!home||!String(p.address||'').trim()||!String(p.city||'').trim())return null;
    const homePostal=String(p.postalCode||'').match(/\b\d{5}\b/)?.[0]||'';
    const destPostal=rawLocation.match(/\b\d{5}\b/)?.[0]||'';
    let minutes=45,label='stima locale del tragitto';
    if(street&&street.length>5&&loc.includes(street)){minutes=2;label='tragitto urbano molto breve';}
    else if(city&&loc.includes(city)){minutes=3;label='tragitto urbano stimato';}
    else if(homePostal&&destPostal&&homePostal.slice(0,3)===destPostal.slice(0,3)){minutes=25;label='tragitto locale stimato';}
    else if(province&&province.length>=2&&new RegExp(`(?:\\(|\\b)${province}(?:\\)|\\b)`,'i').test(rawLocation)){minutes=30;label='tragitto provinciale stimato';}
    else if(homePostal&&destPostal&&homePostal.slice(0,2)===destPostal.slice(0,2)){minutes=35;label='tragitto territoriale stimato';}
    return{minutes,label,home:profileHomeAddressText(p)};
  }

  function calendarMapQueryLocation(location=''){
    const original=String(location||'').trim();
    let v=calendarBookingCleanOperationalLocation(original).replace(/^\s*\[\d+\]\s*[-–—]?\s*/,'').replace(/^\s*\d{2,5}\s*[-–—]\s*/,'').replace(/\bOSP\.?(?=\s|$)/gi,'OSPEDALE').replace(/\bP\.?\s*ZZA\b/gi,'PIAZZA').replace(/\bLOC\.?(?=\s|$)/gi,'LOCALITA').replace(/\s+/g,' ').trim();
    const street=v.match(/\b(?:VIALE|VIA|PIAZZA|LARGO|CORSO|STRADA|LOCALITA)\b[\s\S]*$/i);if(street)v=street[0];
    v=v.replace(/\b(\d{5})\b/g,' ').replace(/\s*[-–—·]\s*(?:UO|UNIT[AÀ]|REPARTO|AMBULATORIO|ACCETTAZIONE)\b[\s\S]*$/i,'').replace(/\s+/g,' ').replace(/\s+,/g,',').trim();
    const city=(original.match(/\b(PISA|LIVORNO|LUCCA|FIRENZE|PRATO|PISTOIA|MASSA|CARRARA|GROSSETO|SIENA|AREZZO)\b/i)||[])[1]||'';
    if(city&&!new RegExp(`\\b${city}\\b`,'i').test(v))v=`${v}, ${city}`;
    if(v&&!/\bITALIA\b/i.test(v))v=`${v}, Italia`;
    return v||original;
  }
  function calendarDetailsHtml(row){
    if(!row)return `<aside class="agenda-detail-panel empty"><div class="agenda-detail-empty">Seleziona una voce per visualizzare i dettagli.</div></aside>`;
    if(row.familyMedicationGroup){const sync=calendarSyncPresentation(row);const blocks=(row.familyMedicationItems||[]).map(member=>{const canResolve=calendarCanManageProfile(member.profileId,'medications');return `<section class="family-medication-member"><div>${calendarProfilePill(member.profileId)}</div><ul>${(member.items||[]).map(x=>`<li><strong>${esc(x.medication||'Farmaco')}</strong>${x.reorderDate?`<span>Richiesta prevista ${formatDate(x.reorderDate)}</span>`:''}<button type="button" class="btn btn-light btn-small" data-family-medication-resolve="1" data-profile-id="${esc(member.profileId)}" data-stock-key="${esc(x.stockKey||'')}" data-reorder-date="${esc(x.reorderDate||member.startDate||'')}" data-medication="${esc(x.medication||'Farmaco')}" ${canResolve&&x.stockKey?'':'disabled'}>Risolto</button></li>`).join('')}</ul></section>`;}).join('');return `<aside class="agenda-detail-panel family-medication-detail"><div class="agenda-detail-head"><div><span class="agenda-detail-icon violet medication-semantic-icon">${uiIconSvg('therapy')}</span><div><h3>Richiesta farmaci famiglia</h3><span class="badge">Evento aggregato</span></div></div><span class="badge agenda-sync-pill ${sync.cls}">${esc(sync.label)}</span></div><div class="agenda-detail-list"><div><span>Data</span><strong>${formatDate(row.startDate)}</strong></div><div><span>Regola</span><strong>Un solo evento per le richieste comprese nella finestra familiare</strong></div></div><div class="family-medication-members">${blocks}</div><div class="notice">Ogni farmaco mantiene il proprio titolare. Usa “Risolto” solo per la singola richiesta effettivamente gestita: le altre, comprese quelle future, restano attive.</div></aside>`;}
    const sync=calendarSyncPresentation(row),visual=calendarEventVisual(row),googleState=state.googleCalendarEventStatus?.[row.id]||{};const location=String(row.location||'').trim();const mapEligible=location&&!/^(online|web|telefono|telefonata)$/i.test(location);const mapLocation=calendarMapQueryLocation(location);const mapsQuery=encodeURIComponent(mapLocation);const clinicalSourceAllowed=!globalThis.DossierSecurity||DossierSecurity.canAccessProfile(row.profileId||state.activeProfileId);const sourceDoc=clinicalSourceAllowed&&String(row.profileId||'')===String(state.activeProfileId)&&row.sourceDocumentId?state.documents.find(d=>d.id===row.sourceDocumentId):null;const travel=mapEligible?approximateTravelFromHome(location):null;const canManage=calendarCanManageEvent(row);const personalCalendar=String(row.profileId||'')===String(state.activeProfileId);
    return `<aside class="agenda-detail-panel"><div class="agenda-detail-head"><div><span class="agenda-detail-icon ${visual.tone} ${visual.icon==='therapy'?'medication-semantic-icon':''}">${uiIconSvg(visual.icon)}</span><div><h3>${esc(row.title||'Appuntamento')}</h3><span class="badge">${esc(row.category||'Altro')}</span></div></div><button class="btn btn-primary btn-small" data-calendar-edit="${row.id}" ${canManage?'':'disabled'}>Modifica</button></div><div class="agenda-detail-actions"><button class="btn btn-light btn-small" data-calendar-complete="${row.id}" ${canManage&&!row.pendingDuplicateResolution?'':'disabled'}>Completa</button><button class="btn btn-danger btn-small" data-calendar-delete="${row.id}" ${canManage?'':'disabled'}>Elimina</button></div><div class="agenda-detail-list"><div><span>Profilo</span><strong style="color:${calendarProfileColor(row.profileId)}">${esc(calendarProfileName(row.profileId))}</strong></div><div><span>Data e ora</span><strong>${formatDate(row.startDate)}${row.allDay?' · Tutto il giorno':` · ${esc(row.startTime||'')}`}</strong></div>${row.doctorName?`<div><span>Medico</span><strong>${esc(row.doctorName)}</strong></div>`:''}${location?`<div><span>Struttura / indirizzo</span><strong>${esc(location)}</strong></div>`:''}${row.notes?`<div><span>Note</span><strong class="agenda-detail-note">${multilineHtml(row.notes)}</strong></div>`:''}</div>${travel?`<div class="agenda-travel-estimate"><div><span>Tempo indicativo da casa</span><strong>circa ${travel.minutes} min</strong></div><small>${esc(travel.label)} · partenza: ${esc(travel.home)}</small></div>`:''}${mapEligible?`<div class="agenda-map-card"><iframe title="Mappa ${esc(location)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="https://www.google.com/maps?output=embed&q=${mapsQuery}&z=16"></iframe><div class="agenda-map-footer"><span>${esc(mapLocation)}</span><a class="btn btn-light btn-small" href="https://www.google.com/maps/search/?api=1&query=${mapsQuery}" target="_blank" rel="noopener noreferrer">Apri mappa</a></div></div>`:''}<div class="agenda-detail-links">${row.pendingDuplicateResolution&&personalCalendar?`<button class="btn btn-primary" data-calendar-resolve-duplicate="${row.id}">Risolvi possibile duplicato</button>`:`<button class="btn btn-light" data-calendar-export="${row.id}">${sync.googleSynced?'Google Calendar ✓':'Aggiungi al calendario'}</button>`}${sourceDoc?`<button class="btn btn-light" data-action="view-doc" data-id="${sourceDoc.id}">Apri file originale</button>`:''}</div>${googleState.lastError?`<div class="notice warning compact-notice">${esc(googleState.lastError)}</div>`:''}</aside>`;
  }
  function calendarGroupedList(rows){
    if(!rows.length)return '<div class="notice">Nessun appuntamento o promemoria futuro.</div>';
    const groups=[];for(const row of rows){let g=groups.at(-1);if(!g||g.date!==row.startDate){g={date:row.startDate,rows:[]};groups.push(g);}g.rows.push(row);}
    return groups.map(g=>`<section class="agenda-day-group"><div class="agenda-day-title"><strong>${esc(new Intl.DateTimeFormat('it-IT',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date(`${g.date}T12:00:00`)))}</strong><span>${g.rows.length} ${g.rows.length===1?'voce':'voci'}</span></div>${g.rows.map(calendarEventRow).join('')}</section>`).join('');
  }
  async function resolveFamilyMedicationRequest(profileId='',stockKey='',reorderDate='',medication='Farmaco') {
    const pid=String(profileId||''),key=String(stockKey||''),date=String(reorderDate||'').slice(0,10);
    if(!pid||!key||!/^\d{4}-\d{2}-\d{2}$/.test(date))return;
    if(!calendarCanManageProfile(pid,'medications')){toast('Non hai i permessi per modificare le richieste farmaci di questo profilo');return;}
    if(!confirm(`Segnare come risolta la richiesta per ${medication||'questo farmaco'} del ${formatDate(date)}?`))return;
    const therapies=await DossierDB.byProfile('therapies',pid);
    const matched=(therapies||[]).filter(row=>medicationStockKey(row)===key);
    if(!matched.length){toast('Richiesta farmaco non trovata');return;}
    const now=new Date().toISOString();
    for(const row of matched){await DossierDB.put('therapies',{...row,reorderResolvedDate:date,reorderResolvedAt:now,updatedAt:now},{details:{event:'therapy-reorder-resolved-agenda',reorderDate:date}});}
    const profile=calendarProfileMeta(pid)||state.profiles.find(p=>String(p.id)===pid)||{id:pid};
    await syncMedicationReorderAgenda(profile);
    if(String(state.activeProfileId)===pid)state.therapies=await DossierDB.byProfile('therapies',pid);
    await loadFamilyAgendaContext();
    await syncLocalCalendarAlerts({silent:true,force:true});
    await syncAuthorizedCalendarToGoogle({silent:true,force:true});
    toast(`${medication||'Farmaco'}: richiesta segnata come risolta`);
    if(state.activeView==='calendar')await renderCalendar({refreshProviders:false});
  }

  async function refreshCalendarProviderState(){
    if(calendarProviderRefreshBusy||state.activeView!=='calendar')return;calendarProviderRefreshBusy=true;
    try{
      const [localStatus,googleStatus]=await Promise.all([refreshLocalCalendarStatus(),DossierCalendar.googleAdvancedStatus()]);
      state.calendarLocalStatus=localStatus||{ok:false,supported:false};state.googleCalendarStatus=googleStatus||{ok:false,configured:false,connected:false};
      if(state.googleCalendarStatus.connected){try{const context=await loadFamilyAgendaContext();const ids=calendarVisiblePersistentEvents(context.events).map(x=>x.id);const statusResult=await DossierCalendar.googleAdvancedEventStatuses(ids);state.googleCalendarEventStatus=statusResult?.events||{};void syncAuthorizedCalendarToGoogle({silent:true});}catch{}}else state.googleCalendarEventStatus={};
    }finally{calendarProviderRefreshBusy=false;if(state.activeView==='calendar')void renderCalendar({refreshProviders:false});}
  }
  async function renderCalendar({refreshProviders=true}={}){
    ensureCalendarReminderLoop();void syncLocalCalendarAlerts({silent:true});
    const familyContext=await loadFamilyAgendaContext();const visibleEvents=familyContext.events,visibleProfiles=familyContext.profiles;
    const localStatus=state.calendarLocalStatus||{ok:false,supported:false};
    const todayKey=calendarLocalToday();const groupDays=Math.max(0,Math.min(10,Number((state.globalPreferences||{}).medicationReorderGroupDays??7)));const displayEvents=aggregateFamilyMedicationEvents(visibleEvents,groupDays);const allUpcoming=[...displayEvents].filter(x=>(x.status||'planned')==='planned'&&(String(x.startDate||'')>=todayKey||calendarOpenOverdueMedication(x,todayKey))).sort((a,b)=>calendarEventDateTime(a).localeCompare(calendarEventDateTime(b)));const history=[...displayEvents].filter(x=>!calendarOpenOverdueMedication(x,todayKey)&&((x.status||'planned')!=='planned'||String(x.startDate||'')<todayKey)).sort((a,b)=>calendarEventDateTime(b).localeCompare(calendarEventDateTime(a))).slice(0,20),pending=(familyContext.suggestions||state.calendarFamilySuggestions||state.calendarSuggestions).filter(x=>x.status==='pending'&&calendarSuggestionDateAllowed(x.suggestedDate));
    if(!state.calendarMonth)state.calendarMonth=calendarMonthKey(allUpcoming[0]?.startDate||calendarLocalToday());
    const q=String(state.calendarQuery||'').trim().toLowerCase(),cat=state.calendarCategory||'Tutti';
    const upcoming=allUpcoming.filter(x=>(cat==='Tutti'||x.category===cat)&&(!q||[x.title,x.category,x.doctorName,x.location,x.notes].join(' ').toLowerCase().includes(q)));
    if(!state.selectedCalendarEventId||!upcoming.some(x=>x.id===state.selectedCalendarEventId))state.selectedCalendarEventId=upcoming[0]?.id||'';
    const selected=upcoming.find(x=>x.id===state.selectedCalendarEventId)||null;
    const googleConsent=Boolean(state.googleCalendarStatus?.healthDataConsent?.granted),googleConnected=Boolean(state.googleCalendarStatus?.connected);
    const localBadge=localStatus.supported?'<span class="badge success">Avvisi Windows attivi</span>':'<span class="badge warning">Avvisi Windows da verificare</span>';
    const googleBadge=googleConnected?(googleConsent?'<span class="badge success">Google Calendar collegato</span>':'<span class="badge warning">Google collegato · consenso sospeso</span>'):state.googleCalendarStatus?.configured?'<span class="badge warning">Google Calendar da ricollegare</span>':'<span class="badge">Google Calendar non collegato</span>';
    const categories=['Tutti',...new Set(allUpcoming.map(x=>x.category).filter(Boolean))];
    const listHtml=`<div class="agenda-split"><div class="agenda-list-pane"><div class="agenda-filter-row"><input id="calendarQuickSearch" class="form-control" placeholder="Cerca appuntamenti…" value="${esc(state.calendarQuery||'')}"><select id="calendarCategoryFilter" class="form-control">${categories.map(x=>`<option value="${esc(x)}" ${x===cat?'selected':''}>${esc(x)}</option>`).join('')}</select></div><div class="agenda-scroll-list">${calendarGroupedList(upcoming)}</div></div>${calendarDetailsHtml(selected)}</div>`;
    const monthHtml=`<div class="agenda-split agenda-calendar-split"><div class="agenda-list-pane agenda-calendar-pane"><div class="agenda-month-host">${calendarMonthHtml(state.calendarMonth,displayEvents)}</div></div>${calendarDetailsHtml(selected)}</div>`;
    $('#viewContainer').innerHTML=`
      <section class="card unified-section-card agenda-provider-strip"><div class="agenda-provider-status"><div>${localBadge}${googleBadge}</div>${localStatus.error?`<span class="agenda-provider-error">${esc(localStatus.error)}</span>`:''}</div><div class="row-actions"><button class="btn btn-light btn-small" id="exportCalendarIcsBtn" ${allUpcoming.length?'':'disabled'}>Esporta agenda .ics</button>${googleConnected&&googleConsent?`<button class="btn btn-primary btn-small" id="syncGoogleAgendaBtn" ${state.calendarEvents.length?'':'disabled'}>Sincronizza Google</button>`:state.googleCalendarStatus?.configured?`<button class="btn btn-light btn-small" id="repairGoogleAgendaBtn">Ricollega Google</button>`:''}</div></section>
      <section class="card unified-section-card agenda-main-card"><div class="agenda-main-head"><div class="agenda-main-title"><span class="agenda-page-icon">${uiIconSvg('calendar')}</span><div><h2>Agenda</h2><p class="kpi-note">${visibleProfiles.length>1?'Agenda familiare: sono mostrati soltanto i profili autorizzati.':'Appuntamenti, scadenze e promemoria del profilo autorizzato.'}</p><div class="row-actions" style="justify-content:flex-start;margin-top:8px">${visibleProfiles.map(p=>`<span class="badge" style="border-color:${calendarProfileColor(p.id)};color:${calendarProfileColor(p.id)}">${esc(calendarProfileName(p.id))}</span>`).join('')}</div></div></div><div class="row-actions"><button class="btn btn-light" id="importCalendarBookingBtn" ${canEditActive()?'':'disabled'}>Importa prenotazione</button><button class="btn btn-primary" id="newCalendarEventBtn" ${visibleProfiles.some(p=>calendarCanManageProfile(p.id,'appointments'))?'':'disabled'}>Nuovo appuntamento</button></div></div><div class="agenda-tabs"><button class="agenda-tab ${state.calendarView!=='month'?'active':''}" id="calendarSimplePresentationBtn">Vista semplice</button><button class="agenda-tab ${state.calendarView==='month'?'active':''}" id="calendarMonthViewBtn">Calendario</button></div>${state.calendarView==='month'?monthHtml:listHtml}</section>
      <div class="agenda-secondary-grid"><section class="card unified-section-card"><details ${pending.length?'open':''}><summary><strong>Proposte da valutare</strong><span class="badge ${pending.length?'warning':'success'}">${pending.length}</span></summary>${pending.length?`<div class="calendar-suggestion-list compact">${pending.map(s=>`<article class="calendar-suggestion"><div class="calendar-suggestion-main">${calendarProfilePill(s.profileId)}<h3>${esc(s.title)}</h3><p><strong>${formatDate(s.suggestedDate)}</strong></p></div><div class="row-actions"><button class="btn btn-primary btn-small" data-calendar-schedule-suggestion="${s.id}" ${calendarCanManageProfile(s.profileId,'appointments')?'':'disabled'}>Imposta</button><button class="btn btn-light btn-small" data-calendar-dismiss-suggestion="${s.id}" ${calendarCanManageProfile(s.profileId,'appointments')?'':'disabled'}>Ignora</button></div></article>`).join('')}</div>`:'<div class="notice success compact-notice">Nessuna proposta da valutare.</div>'}</details></section>${history.length?`<section class="card unified-section-card"><details><summary><strong>Storico recente</strong><span class="badge">${history.length}</span></summary><div class="calendar-history compact">${history.slice(0,12).map(x=>`<div class="list-item"><span><strong>${formatDate(x.startDate)}${x.allDay?'':` · ${esc(x.startTime||'')}`}</strong><br>${x.familyMedicationGroup?(x.familyProfileIds||[]).map(id=>calendarProfilePill(id,'compact')).join(''):calendarProfilePill(x.profileId,'compact')} · ${esc(x.title)}</span><span class="badge">${calendarStatusLabel(x.status||'planned')}</span></div>`).join('')}</div></details></section>`:''}</div>`;
    $('#importCalendarBookingBtn')?.addEventListener('click',()=>openCalendarBookingImportModal());
    $('#newCalendarEventBtn')?.addEventListener('click',()=>openCalendarEventModal());
    $('#calendarSimplePresentationBtn')?.addEventListener('click',()=>{state.calendarPresentation='simple';state.calendarView='list';localStorage.setItem('calendarPresentationV13','simple');renderCalendar({refreshProviders:false});});
    $('#calendarMonthViewBtn')?.addEventListener('click',()=>{state.calendarPresentation='simple';state.calendarView='month';localStorage.setItem('calendarPresentationV13','simple');renderCalendar({refreshProviders:false});});
    $('#calendarPrevMonth')?.addEventListener('click',()=>{state.calendarMonth=calendarShiftMonth(state.calendarMonth,-1);renderCalendar({refreshProviders:false});});$('#calendarNextMonth')?.addEventListener('click',()=>{state.calendarMonth=calendarShiftMonth(state.calendarMonth,1);renderCalendar({refreshProviders:false});});
    $('#calendarQuickSearch')?.addEventListener('input',e=>{state.calendarQuery=e.target.value;renderCalendar({refreshProviders:false});});
    $('#calendarCategoryFilter')?.addEventListener('change',e=>{state.calendarCategory=e.target.value;renderCalendar({refreshProviders:false});});
    $$('[data-calendar-select]').forEach(b=>b.addEventListener('click',()=>{state.selectedCalendarEventId=b.dataset.calendarSelect;renderCalendar({refreshProviders:false});}));
    $$('[data-calendar-day]').forEach(b=>b.addEventListener('click',()=>openCalendarEventModal({startDate:b.dataset.calendarDay})));
    $$('[data-calendar-edit]').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();openCalendarEventModal(calendarVisibleEventById(b.dataset.calendarEdit)||{});}));
    $$('[data-calendar-delete]').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();deleteCalendarEvent(b.dataset.calendarDelete);}));$$('[data-calendar-complete]').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();completeCalendarEvent(b.dataset.calendarComplete);}));$$('[data-calendar-export]').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();const row=calendarVisibleEventById(b.dataset.calendarExport);if(row)openCalendarTargetModal(row);}));$$('[data-calendar-resolve-duplicate]').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();openCalendarBookingDuplicateResolutionModal(b.dataset.calendarResolveDuplicate);}));
    $$('[data-family-medication-resolve]').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();void resolveFamilyMedicationRequest(b.dataset.profileId,b.dataset.stockKey,b.dataset.reorderDate,b.dataset.medication);}));
    $('#exportCalendarIcsBtn')?.addEventListener('click',()=>DossierCalendar.downloadIcs(allUpcoming,visibleProfiles.length>1?'Agenda familiare':[activeProfile()?.firstName,activeProfile()?.lastName].filter(Boolean).join(' ')));
    $('#syncGoogleAgendaBtn')?.addEventListener('click',syncWholeAgendaWithGoogle);$('#repairGoogleAgendaBtn')?.addEventListener('click',()=>{state.activeView='preferences';selectNav('preferences');renderPreferences();});
    bindViewActions($('#viewContainer'));
    bindCalendarSourceButtons($('#viewContainer'));
    $$('[data-calendar-schedule-suggestion]').forEach(b=>b.addEventListener('click',()=>{const s=(state.calendarFamilySuggestions||[]).find(x=>x.id===b.dataset.calendarScheduleSuggestion)||state.calendarSuggestions.find(x=>x.id===b.dataset.calendarScheduleSuggestion);if(s)openCalendarEventModal({category:s.category,title:s.title,startDate:s.suggestedDate,sourceDocumentId:s.sourceDocumentId,sourceDocumentTitle:s.sourceDocumentTitle,sourceClinicalDate:s.sourceClinicalDate,sourceExcerpt:s.sourceExcerpt,suggestionId:s.id,profileId:s.profileId||state.activeProfileId,lockProfile:true});}));
    $$('[data-calendar-dismiss-suggestion]').forEach(b=>b.addEventListener('click',()=>dismissCalendarSuggestion(b.dataset.calendarDismissSuggestion)));
    if(refreshProviders)void refreshCalendarProviderState();
  }

  async function syncWholeAgendaWithGoogle(){
    if(!state.googleCalendarStatus?.connected){toast('Collega prima Google Calendar dalle Preferenze');return;}
    const button=$('#syncGoogleAgendaBtn');const original=button?.textContent||'Sincronizza agenda con Google Calendar';if(button){button.disabled=true;button.textContent='Sincronizzazione in corso…';}
    try{
      const context=await loadFamilyAgendaContext();
      const rows=calendarOperationalEvents(context.events);
      const pendingDuplicates=rows.filter(x=>x.pendingDuplicateResolution);const syncableEvents=rows.filter(x=>!x.pendingDuplicateResolution).map(row=>row.familyMedicationGroup?{...row,calendarOwnerName:''}:calendarOwnerEvent(row));if(!syncableEvents.length&&pendingDuplicates.length){toast('Risolvi prima i possibili appuntamenti duplicati');return;}
      const childIds=calendarFamilyChildIds(rows);for(const childId of childIds){try{await DossierCalendar.googleAdvancedDeleteEvent(childId);}catch{}}
      const result=await DossierCalendar.googleAdvancedSyncAll(syncableEvents,'Agenda familiare');
      await renderCalendar();
      const errors=Number(result.errorCount||result.errors?.length||0);
      openModal('Sincronizzazione Google Calendar',errors?'Sincronizzazione completata con elementi da verificare.':'Agenda sincronizzata correttamente.',`<div class="backup-report-grid"><div><small>Appuntamenti controllati</small><strong>${Number(result.checked||0)}</strong></div><div><small>Creati</small><strong>${Number(result.created||0)}</strong></div><div><small>Aggiornati</small><strong>${Number(result.updated||0)}</strong></div><div><small>Riconosciuti dopo reinstallazione</small><strong>${Number(result.recovered||0)}</strong></div><div><small>Duplicati Dossier rimossi</small><strong>${Number(result.duplicatesRemoved||0)}</strong></div><div><small>Errori</small><strong>${errors}</strong></div></div>${pendingDuplicates.length?`<div class="notice warning" style="margin-top:14px"><strong>${pendingDuplicates.length} possibile/i duplicato/i non sincronizzato/i.</strong><br>Devono essere risolti nell'Agenda prima di qualsiasi invio a Google Calendar.</div>`:''}${errors?`<div class="notice warning" style="margin-top:14px">${(result.errors||[]).slice(0,8).map(x=>`${esc(x.title||x.eventId)}: ${esc(x.error||'Errore')}`).join('<br>')}</div>`:'<div class="notice success" style="margin-top:14px">Google Calendar e Agenda condivisa sono allineati per gli appuntamenti definitivi.</div>'}<div class="form-actions"><button class="btn btn-primary" id="googleSyncSummaryClose">Chiudi</button></div>`);
      $('#googleSyncSummaryClose')?.addEventListener('click',closeModal);
    }catch(error){alert(`Sincronizzazione Google Calendar: ${error.message}`);}
    finally{if(button?.isConnected){button.disabled=false;button.textContent=original;}}
  }

  async function openCalendarTargetModal(row={}){
    if(row.pendingDuplicateResolution){openCalendarBookingDuplicateResolutionModal(row.id);return;}
    const profileName=calendarProfileName(row.profileId||state.activeProfileId);
    row=calendarOwnerEvent(row);
    const calendarEmail=String(state.googleCalendarEmail||'').trim();
    const advanced=await DossierCalendar.googleAdvancedStatus();
    const accountNote=calendarEmail?`<br>Account Google predefinito: <strong>${esc(calendarEmail)}</strong>`:'<br>Nessun account Google predefinito: verrà usato/selezionato l’account attivo nel browser.';
    const googleLabel=advanced?.connected?'Sincronizza con Google Calendar':'Google Calendar';
    const advancedNote=advanced?.connected?`<br><strong>Sincronizzazione avanzata attiva:</strong> l’evento viene creato/aggiornato direttamente nel calendario <strong>${esc(advanced.calendarId||'primary')}</strong> con gli stessi avvisi del Dossier.`:'';
    openModal('Aggiungi al calendario','Scegli dove aggiungere questo appuntamento.',`<div class="form-actions"><button class="btn btn-primary" id="calendarGoogleTarget">${esc(googleLabel)}</button><button class="btn btn-light" id="calendarIcsTarget">Scarica file .ics</button><button class="btn btn-ghost" id="calendarCalendarCancel">Annulla</button></div><p class="kpi-note" style="margin-top:12px">${advanced?.connected?'Google Calendar viene sincronizzato direttamente senza abbandonare il Dossier.':'Google Calendar si apre con data, ora, titolo, luogo e note già compilati.'}${accountNote}${advancedNote} Il file .ics resta disponibile per Outlook, Apple Calendar e altri calendari compatibili.</p>`);
    $('#calendarGoogleTarget')?.addEventListener('click',async()=>{
      const button=$('#calendarGoogleTarget');if(button){button.disabled=true;button.textContent='Sincronizzazione…';}
      try{
        if(!advanced?.healthDataConsent?.granted){if(!confirm('Per aggiungere questo appuntamento a Google Calendar verranno trasferiti dati sanitari contenuti nell’evento. Autorizzi il trasferimento?')){if(button){button.disabled=false;button.textContent=googleLabel;}return;}await DossierCalendar.googleAdvancedSetHealthConsent(true);}
        if(advanced?.connected){const result=await DossierCalendar.googleAdvancedSyncEvent(row,profileName,true);closeModal();toast(result.created?'Appuntamento aggiunto a Google Calendar':'Appuntamento aggiornato su Google Calendar');return;}
        const result=DossierCalendar.openGoogleCalendar(row,profileName,calendarEmail);closeModal();
        if(!result?.opened){openModal('Apri Google Calendar','Il browser ha bloccato l’apertura automatica. Il Dossier resta aperto e connesso.',`<div class="form-actions"><a class="btn btn-primary" href="${esc(result?.url||'')}" target="_blank" rel="noopener noreferrer">Apri Google Calendar</a><button class="btn btn-light" id="calendarPopupClose">Chiudi</button></div>`);$('#calendarPopupClose')?.addEventListener('click',closeModal);}
      }catch(error){alert(`Google Calendar: ${error.message}`);if(button){button.disabled=false;button.textContent=googleLabel;}}
    });
    $('#calendarIcsTarget')?.addEventListener('click',()=>{DossierCalendar.downloadIcs(row,profileName);closeModal();});
    $('#calendarCalendarCancel')?.addEventListener('click',closeModal);
  }

  async function openCalendarEventModal(item={}){
    const allProfiles=await DossierDB.getAll('profiles');const medication=calendarIsMedicationRequest(item);const permissionKind=medication?'medications':'appointments';const manageable=allProfiles.filter(p=>calendarCanManageProfile(p.id,permissionKind));
    let targetProfileId=String(item.profileId||'');if(!targetProfileId)targetProfileId=manageable.find(p=>String(p.id)===String(state.activeProfileId))?.id||manageable[0]?.id||'';
    if(!targetProfileId||!manageable.some(p=>String(p.id)===String(targetProfileId))){toast('Non hai il permesso di modificare questa voce dell’Agenda.');return;}
    const targetProfile=allProfiles.find(p=>String(p.id)===String(targetProfileId))||null;state.calendarProfileMeta[String(targetProfileId)]=targetProfile||state.calendarProfileMeta[String(targetProfileId)]||{};
    state.calendarModalDoctors=String(targetProfileId)===String(state.activeProfileId)?state.doctors:await DossierDB.byProfile('doctors',targetProfileId);
    const doctorOptions=state.calendarModalDoctors.map(d=>`<option value="${esc(d.id)}" ${item.doctorId===d.id?'selected':''}>${esc(d.name||d.fullName||'Medico')}</option>`).join('');const reminders=new Set((item.reminders?.length?item.reminders:calendarDefaultReminders()).map(Number));const status=item.status||'planned';
    const profileSelect=!item.id&&manageable.length>1&&!item.lockProfile&&!item.pendingBookingImport?`<div class="form-group span-2"><label>Profilo</label><select name="targetProfileId" id="calendarTargetProfile" class="form-control">${manageable.map(p=>`<option value="${esc(p.id)}" ${String(p.id)===String(targetProfileId)?'selected':''}>${esc(`${p.firstName||''} ${p.lastName||''}`.trim()||'Profilo')}</option>`).join('')}</select></div>`:`<input type="hidden" name="targetProfileId" value="${esc(targetProfileId)}"><div class="notice span-2"><strong>Profilo:</strong> <span style="color:${calendarProfileColor(targetProfileId)}">${esc(calendarProfileName(targetProfileId))}</span></div>`;
    openModal(item.id?'Modifica appuntamento':'Nuovo appuntamento',item.pendingBookingImport?'Importato da una prenotazione: verifica prima di salvare':item.sourceDocumentId?(item.sourceKind==='booking-import'?'Creato da una prenotazione allegata':'Proposto da un referto sanitario'):'Inserimento manuale',`<form id="calendarEventForm"><div class="form-grid">${profileSelect}<div class="form-group"><label>Tipo</label><select name="category" class="form-control">${CALENDAR_CATEGORIES.map(x=>`<option ${item.category===x?'selected':''}>${esc(x)}</option>`).join('')}</select></div><div class="form-group span-2"><label>Titolo</label><input class="form-control" name="title" required value="${esc(item.title||'')}"></div><div class="form-group"><label>Data</label><input class="form-control" type="date" name="startDate" required value="${esc(item.startDate||calendarLocalToday())}"></div><div class="form-group"><label>Ora</label><input class="form-control" type="time" name="startTime" value="${esc(item.startTime||'09:00')}" ${item.allDay?'disabled':''}></div><div class="form-group"><label>Durata</label><select class="form-control" name="durationMinutes"><option value="30" ${Number(item.durationMinutes)===30?'selected':''}>30 minuti</option><option value="60" ${!item.durationMinutes||Number(item.durationMinutes)===60?'selected':''}>1 ora</option><option value="90" ${Number(item.durationMinutes)===90?'selected':''}>1 ora e 30</option><option value="120" ${Number(item.durationMinutes)===120?'selected':''}>2 ore</option><option value="180" ${Number(item.durationMinutes)===180?'selected':''}>3 ore</option><option value="240" ${Number(item.durationMinutes)===240?'selected':''}>4 ore</option></select></div><label class="check-row"><input type="checkbox" name="allDay" ${item.allDay?'checked':''}><span><strong>Tutto il giorno</strong></span></label><div class="form-group"><label>Stato</label><select class="form-control" name="status"><option value="planned" ${status==='planned'?'selected':''}>Programmato</option><option value="completed" ${status==='completed'?'selected':''}>Completato</option><option value="cancelled" ${status==='cancelled'?'selected':''}>Annullato</option></select></div><div class="form-group"><label>Medico</label><select name="doctorId" class="form-control"><option value="">Nessuno / altro</option>${doctorOptions}</select></div><div class="form-group"><label>Luogo / struttura</label><input class="form-control" name="location" value="${esc(item.location||'')}"></div><div class="form-group span-2"><label>Note</label><textarea class="form-control" name="notes" rows="4">${esc(item.notes||'')}</textarea></div></div><div class="section-spacer"></div><h3>Avvisi sul PC</h3><p class="kpi-note">Puoi impostare fino a 5 avvisi per ogni appuntamento.</p><div class="calendar-reminder-grid">${CALENDAR_REMINDERS.map(([value,label])=>`<label class="check-row compact"><input type="checkbox" name="reminder" value="${value}" ${reminders.has(value)?'checked':''}><span>${esc(label)}</span></label>`).join('')}</div><div class="section-spacer"></div><label class="check-row"><input type="checkbox" name="recurrenceYearly" ${item.recurrence==='yearly'?'checked':''}><span><strong>Ripeti ogni anno</strong><small>Utile per scadenze e rinnovi annuali.</small></span></label>${item.pendingBookingImport?`<div class="notice success"><strong>Documento originale pronto per essere allegato.</strong><br>${esc(CALENDAR_BOOKING_SOURCE_NOTE)}</div>`:calendarSourceHtml(item)}<div class="form-actions"><button type="button" class="btn btn-light" id="cancelCalendarEventBtn">Annulla</button><button class="btn btn-primary">Salva</button></div></form>`);
    bindCalendarSourceButtons($('#modalBody'));const allDay=$('#calendarEventForm [name="allDay"]'),time=$('#calendarEventForm [name="startTime"]');allDay?.addEventListener('change',()=>{time.disabled=allDay.checked;});
    const reminderInputs=[...$('#calendarEventForm').querySelectorAll('input[name="reminder"]')];const refreshReminderLimit=()=>{const selected=reminderInputs.filter(input=>input.checked).length;reminderInputs.forEach(input=>{input.disabled=selected>=5&&!input.checked;input.closest('.check-row')?.classList.toggle('disabled',input.disabled);});};reminderInputs.forEach(input=>input.addEventListener('change',refreshReminderLimit));refreshReminderLimit();
    $('#calendarTargetProfile')?.addEventListener('change',e=>{const fd=new FormData($('#calendarEventForm'));openCalendarEventModal({...item,profileId:e.target.value,category:String(fd.get('category')||item.category||'Altro'),title:String(fd.get('title')||item.title||''),startDate:String(fd.get('startDate')||item.startDate||calendarLocalToday()),startTime:String(fd.get('startTime')||item.startTime||'09:00'),location:String(fd.get('location')||item.location||''),notes:String(fd.get('notes')||item.notes||'')});});
    $('#cancelCalendarEventBtn').onclick=closeModal;$('#calendarEventForm').onsubmit=e=>saveCalendarEvent(e,item);
  }
  function upsertCalendarEventState(row={}){
    if(String(row.profileId||'')===String(state.activeProfileId)){const index=state.calendarEvents.findIndex(x=>x.id===row.id);if(index>=0)state.calendarEvents[index]=row;else state.calendarEvents.push(row);state.calendarEvents.sort((a,b)=>calendarEventDateTime(a).localeCompare(calendarEventDateTime(b)));}
    const familyIndex=state.calendarFamilyEvents.findIndex(x=>x.id===row.id);if(familyIndex>=0)state.calendarFamilyEvents[familyIndex]=row;else state.calendarFamilyEvents.push(row);state.calendarFamilyEvents.sort((a,b)=>calendarEventDateTime(a).localeCompare(calendarEventDateTime(b)));return row;
  }
  async function finalizeCalendarEventAfterQuickSave(row={},suggestionId=''){
    try{
      const scheduled=await scheduleLocalCalendarEvent({...row},{silent:true});
      await DossierDB.put('calendarEvents',scheduled,{audit:false,sync:false});upsertCalendarEventState(scheduled);
      if(suggestionId){const suggestion=(state.calendarFamilySuggestions||[]).find(x=>x.id===suggestionId)||state.calendarSuggestions.find(x=>x.id===suggestionId);if(suggestion){const updatedSuggestion={...suggestion,status:'scheduled',scheduledEventId:scheduled.id,updatedAt:new Date().toISOString()};await DossierDB.put('calendarSuggestions',updatedSuggestion,{details:{event:'calendar-suggestion-scheduled'}});const i=state.calendarSuggestions.findIndex(x=>x.id===suggestion.id);if(i>=0)state.calendarSuggestions[i]=updatedSuggestion;const fi=(state.calendarFamilySuggestions||[]).findIndex(x=>x.id===suggestion.id);if(fi>=0)state.calendarFamilySuggestions[fi]=updatedSuggestion;}}
      const warning=scheduled.pendingDuplicateResolution||String(scheduled.profileId||'')!==String(state.activeProfileId)?'':await calendarBookingGoogleSyncFinal(scheduled);
      if(state.activeView==='calendar')void renderCalendar({refreshProviders:false});
      void refreshCalendarProviderState();
      if(warning)toast(`Google Calendar: ${warning}`);
    }catch(error){console.error('Completamento agenda in background non riuscito:',error);toast(`Appuntamento salvato. Operazioni successive da verificare: ${error.message}`);}
  }
  async function saveCalendarEvent(event,item={}){
    event.preventDefault();const fd=new FormData(event.target),targetProfileId=String(fd.get('targetProfileId')||item.profileId||state.activeProfileId||'');if(!calendarCanManageProfile(targetProfileId,calendarIsMedicationRequest(item)?'medications':'appointments')){toast('Non hai il permesso di modificare questa voce dell’Agenda.');return;}const now=new Date().toISOString();const doctorId=String(fd.get('doctorId')||''),doctor=state.calendarModalDoctors.find(d=>d.id===doctorId);const base={...item};delete base.pendingBookingImport;for(const key of ['syncGoogle','googleEventId','googleHtmlLink','googleSyncStatus','googleSyncError','googleSyncedAt'])delete base[key];
    let bookingExisting=null;if(item.pendingBookingImport){const sourceDoc=await archiveCalendarBookingDocument(item.pendingBookingImport,state.activeProfileId);base.sourceDocumentId=sourceDoc.id;base.sourceDocumentTitle=sourceDoc.title||sourceDoc.originalName||'Prenotazione sanitaria';base.sourceKind='booking-import';base.sourceExcerpt='Documento originale della prenotazione allegato.';base.bookingOriginalName=sourceDoc.originalName||'';if(!item.id)bookingExisting=state.calendarEvents.find(x=>x.sourceKind==='booking-import'&&x.sourceDocumentId===sourceDoc.id)||null;}
    let row={...(bookingExisting||{}),...base,id:item.id||bookingExisting?.id||uid('calevent'),profileId:targetProfileId,category:String(fd.get('category')||'Altro'),title:String(fd.get('title')||'').trim(),startDate:String(fd.get('startDate')||''),startTime:fd.has('allDay')?'':String(fd.get('startTime')||'09:00'),allDay:fd.has('allDay'),durationMinutes:Number(fd.get('durationMinutes')||60),status:String(fd.get('status')||'planned'),doctorId,doctorName:doctor?.name||doctor?.fullName||'',location:String(fd.get('location')||'').trim(),notes:String(fd.get('notes')||'').trim(),reminders:fd.getAll('reminder').map(Number).filter(Number.isFinite).slice(0,5),recurrence:fd.has('recurrenceYearly')?'yearly':'none',createdAt:item.createdAt||bookingExisting?.createdAt||now,updatedAt:now};
    if(!row.title||!row.startDate){toast('Inserisci titolo e data');return;}const updating=Boolean(item.id||bookingExisting);
    if(item.pendingBookingImport&&!updating){const similar=calendarBookingSimilarEvents(row);if(similar.length){row={...row,pendingDuplicateResolution:true,duplicateCandidateIds:similar.map(x=>x.id),duplicateDetectedAt:now,localAlertStatus:'none',localAlertCount:0,localAlertError:''};await DossierDB.put('calendarEvents',row,{details:{event:'calendar-booking-possible-duplicate'}});upsertCalendarEventState(row);closeModal();await renderCalendar({refreshProviders:false});openCalendarBookingDuplicateResolutionModal(row.id);toast('Possibile appuntamento duplicato: Google Calendar non è stato contattato');return;}}
    await DossierDB.put('calendarEvents',row,{details:{event:updating?'calendar-event-update':'calendar-event-create'}});upsertCalendarEventState(row);closeModal();await renderCalendar({refreshProviders:false});toast((item.id||bookingExisting)?'Appuntamento aggiornato':'Appuntamento salvato');
    void finalizeCalendarEventAfterQuickSave(row,item.suggestionId||'');
  }
  async function completeCalendarEvent(id){const row=calendarVisibleEventById(id);if(!row||!calendarCanManageEvent(row)){toast('Non hai il permesso di gestire questa voce dell’Agenda.');return;}const now=new Date().toISOString();let updated;if(row.recurrence==='yearly'){let next=calendarDateAdd(row.startDate,1,'anno');while(next<calendarLocalToday())next=calendarDateAdd(next,1,'anno');updated={...row,startDate:next,status:'planned',lastCompletedAt:now,updatedAt:now};updated=await scheduleLocalCalendarEvent(updated,{silent:true});}else{updated={...row,status:'completed',completedAt:now,updatedAt:now};try{await DossierCalendar.cancelLocal(id);}catch{}}await DossierDB.put('calendarEvents',updated,{details:{event:'calendar-event-completed'}});upsertCalendarEventState(updated);if(row.recurrence==='yearly'&&String(row.profileId||'')===String(state.activeProfileId)){try{const st=await DossierCalendar.googleAdvancedStatus();if(st?.connected&&st?.healthDataConsent?.granted){const profileName=calendarProfileName(row.profileId);await DossierCalendar.googleAdvancedSyncEvent(updated,profileName,true);}}catch(error){toast(`Google Calendar: ${error.message}`);}}if(String(row.profileId||'')===String(state.activeProfileId))await loadProfileData();await renderCalendar();toast(row.recurrence==='yearly'?'Scadenza completata e riprogrammata per il prossimo anno':'Appuntamento segnato come completato');}
  async function deleteCalendarEvent(id){
    const row=calendarVisibleEventById(id);if(!row||!calendarCanManageEvent(row)){toast('Non hai il permesso di gestire questa voce dell’Agenda.');return;}if(!confirm(`Eliminare “${row.title}”?`))return;
    if(String(row.profileId||'')===String(state.activeProfileId)&&!row.pendingDuplicateResolution)try{await DossierCalendar.googleAdvancedDeleteEvent(id);}catch(error){alert(`Impossibile eliminare l'appuntamento sincronizzato da Google Calendar: ${error.message}\n\nIl Dossier non è stato modificato, così i due calendari restano coerenti.`);return;}
    try{await DossierCalendar.cancelLocal(id);}catch{}
    await DossierDB.del('calendarEvents',id,{details:{event:'calendar-event-delete'}});if(String(row.profileId||'')===String(state.activeProfileId)){for(const s of state.calendarSuggestions.filter(x=>x.scheduledEventId===id))await DossierDB.put('calendarSuggestions',{...s,status:'dismissed',dismissedAt:new Date().toISOString(),scheduledEventId:'',updatedAt:new Date().toISOString()},{details:{event:'calendar-suggestion-dismissed-with-event'}});await loadProfileData();}state.calendarFamilyEvents=state.calendarFamilyEvents.filter(x=>x.id!==id);await renderCalendar();toast('Appuntamento eliminato');
  }
  async function dismissCalendarSuggestion(id){const row=(state.calendarFamilySuggestions||[]).find(x=>x.id===id)||state.calendarSuggestions.find(x=>x.id===id);if(!row||!calendarCanManageProfile(row.profileId||state.activeProfileId,'appointments'))return;const updated={...row,status:'dismissed',dismissedAt:new Date().toISOString(),updatedAt:new Date().toISOString()};await DossierDB.put('calendarSuggestions',updated,{details:{event:'calendar-suggestion-dismissed'}});state.calendarFamilySuggestions=(state.calendarFamilySuggestions||[]).map(x=>x.id===id?updated:x);if(String(row.profileId||'')===String(state.activeProfileId))state.calendarSuggestions=await DossierDB.byProfile('calendarSuggestions',state.activeProfileId);renderCalendar();}
  function dashboardCalendarHtml(){
    const upcoming=calendarUpcomingEvents().slice(0,4),pending=state.calendarSuggestions.filter(x=>x.status==='pending'&&calendarSuggestionDateAllowed(x.suggestedDate)).length;
    return `<div class="card dashboard-deadlines-card"><div class="card-title-row"><div><h3>Prossime scadenze</h3><p class="kpi-note">Appuntamenti e promemoria sanitari.</p></div><button class="btn btn-ghost btn-small" data-action="go-calendar">Apri agenda</button></div>${upcoming.length?`<div class="list-stack dashboard-deadlines-list">${upcoming.map(x=>`<div class="list-item"><span><strong>${formatDate(x.startDate)}${x.allDay?'':` · ${esc(x.startTime||'')}`}</strong><br>${esc(x.title)}</span><span class="badge">${esc(x.category||'Altro')}</span></div>`).join('')}</div>`:'<p class="kpi-note">Nessuna scadenza futura registrata.</p>'}${pending?`<div class="notice warning" style="margin-top:10px"><strong>${pending} richiam${pending===1?'o':'i'} rilevat${pending===1?'o':'i'} nei referti da valutare.</strong></div>`:''}</div>`;
  }


  const healthCardExpiryReminders=()=>calendarDefaultReminders();
  function healthCardExpiryEventMatches(existing={},profile={},expiry=''){
    const reminders=(existing.reminders||[]).map(Number).filter(Number.isFinite).sort((a,b)=>b-a);
    const expected=healthCardExpiryReminders().slice().sort((a,b)=>b-a);return existing.id===`health-card-expiry-${profile.id}`&&existing.profileId===profile.id&&existing.category==='Documento sanitario'&&existing.title==='Scadenza tessera sanitaria'&&existing.startDate===expiry&&existing.startTime==='12:00'&&existing.allDay===false&&Number(existing.durationMinutes||0)===60&&(existing.status||'planned')==='planned'&&!existing.doctorId&&!existing.doctorName&&!existing.location&&existing.notes==='Promemoria automatico generato dalla scadenza della tessera sanitaria.'&&JSON.stringify(reminders)===JSON.stringify(expected);
  }

  async function syncHealthCardExpiryAgenda(profile,previousExpiry=''){
    if(!profile?.id)return false;
    const eventId=`health-card-expiry-${profile.id}`;const rows=await DossierDB.byProfile('calendarEvents',profile.id);const existing=(rows||[]).find(x=>x.id===eventId||x.sourceKind==='health-card-expiry');const expiry=String(profile.healthCardExpiry||'').trim();
    if(!expiry){if(existing){try{await DossierCalendar.googleAdvancedDeleteEvent(existing.id);}catch{}try{await DossierCalendar.cancelLocal(existing.id);}catch{}await DossierDB.del('calendarEvents',existing.id,{details:{event:'health-card-expiry-remove'}});return true;}return false;}
    if(existing&&healthCardExpiryEventMatches(existing,profile,expiry))return false;
    const now=new Date().toISOString();let row={...(existing||{}),id:eventId,profileId:profile.id,category:'Documento sanitario',title:'Scadenza tessera sanitaria',startDate:expiry,startTime:'12:00',allDay:false,durationMinutes:60,status:'planned',doctorId:'',doctorName:'',location:'',notes:'Promemoria automatico generato dalla scadenza della tessera sanitaria.',reminders:healthCardExpiryReminders(),recurrence:'none',sourceKind:'health-card-expiry',sourceProfileId:profile.id,createdAt:existing?.createdAt||now,updatedAt:now};
    row=await scheduleLocalCalendarEvent(row,{silent:true});await DossierDB.put('calendarEvents',row,{details:{event:existing?'health-card-expiry-update':'health-card-expiry-create'}});
    try{const st=await DossierCalendar.googleAdvancedStatus();if(st?.connected&&st?.healthDataConsent?.granted){const profileName=[profile.firstName,profile.lastName].filter(Boolean).join(' ');await DossierCalendar.googleAdvancedSyncEvent(row,profileName,true);}}catch(error){console.warn('Sincronizzazione Google della scadenza tessera non completata:',error);}
    return true;
  }

  function uiIconSvg(name,extraClass=''){
    const icons={
      profile:'<path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/>',
      diagnosis:'<path d="M12 3v18M3 12h18"/><circle cx="12" cy="12" r="8"/>',
      therapy:'<path d="m7 17 10-10a4 4 0 0 1 0 6L13 17a4 4 0 0 1-6 0z"/><path d="m9 9 6 6"/>',
      phone:'<path d="M6.5 3.5 9 8 7 10c1.7 3.3 3.7 5.3 7 7l2-2 4.5 2.5c.4.2.6.7.5 1.1-.5 1.7-2 2.9-3.8 2.9C9.6 21.5 2.5 14.4 2.5 5.8 2.5 4 3.7 2.5 5.4 2c.4-.1.9.1 1.1.5z"/>',
      calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 9h18"/>',
      document:'<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5M9 12h6M9 16h6"/>',
      weight:'<path d="M5 6h14l2 14H3z"/><path d="M9 9a3 3 0 0 1 6 0"/>',
      heart:'<path d="M12 21S4 16.2 4 9.6A4.6 4.6 0 0 1 12 6a4.6 4.6 0 0 1 8 3.6C20 16.2 12 21 12 21z"/>',
      droplet:'<path d="M12 3s6 7 6 12a6 6 0 1 1-12 0c0-5 6-12 6-12z"/>',
      shield:'<path d="M12 3 20 6v6c0 5-3.3 8-8 9-4.7-1-8-4-8-9V6z"/><path d="m8.5 12 2.2 2.2 4.8-5"/>',
      checklist:'<path d="M9 5h10M9 12h10M9 19h10"/><path d="m3.5 5 1.5 1.5L7.5 4M3.5 12l1.5 1.5 2.5-2.5M3.5 19l1.5 1.5 2.5-2.5"/>',
      share:'<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.5-4.4M8.2 13.2l7.5 4.4"/>',
      trend:'<path d="M4 18 9 13l4 3 7-9"/><path d="M16 7h4v4"/>'
    };
    return `<svg class="ui-icon ${extraClass}" viewBox="0 0 24 24" aria-hidden="true">${icons[name]||icons.document}</svg>`;
  }

  function dashboardMonitorOverviewMap(){
    return {
      weight:{id:'weight',kind:'monitor',selectLabel:'Peso · Misurazioni personali',title:'Andamento del peso · Misurazioni personali',button:'Apri percorso',view:'monitor-weight',axis:'kg',icon:'weight',empty:'Registra almeno una pesata per visualizzare l’andamento.',goal:true,
        latest:()=>{const row=latestMeasurement('weight');return {main:row?`${HealthCharts.fmt(row.value)} kg`:'—',sub:row?`Ultimo valore · ${formatDate(row.date)} · Misurazioni personali`:'Nessun dato'};},
        extra:()=>{const journey=activeJourney();const jm=journeyMetrics(journey);const goalLabel=jm?`${HealthCharts.fmt(jm.target)} kg`:'Non impostato';const rows=measurementsOf('weight');const delta=rows.length>1?Number(rows.at(-1).value)-Number(rows[0].value):null;return {goalLabel,delta};}
      },
      blood_pressure:{id:'blood_pressure',kind:'monitor',selectLabel:'Pressione · Misurazioni domestiche',title:'Andamento della pressione · Misurazioni domestiche',button:'Apri pressione',view:'monitor-pressure',axis:'mmHg',icon:'heart',empty:'Registra almeno una misurazione della pressione per visualizzare l’andamento.',
        latest:()=>{const row=latestMeasurement('blood_pressure');return {main:row&&Number.isFinite(Number(row.systolic))&&Number.isFinite(Number(row.diastolic))?`${row.systolic}/${row.diastolic} mmHg`:'—',sub:row?`Ultimo valore · ${formatDate(row.date)} · Misurazioni domestiche`:'Nessun dato'};}},
      glucose:{id:'glucose',kind:'monitor',selectLabel:'Glicemia · Misurazioni domestiche',title:'Andamento della glicemia · Misurazioni domestiche',button:'Apri glicemia',view:'monitor-glucose',axis:'mg/dL',icon:'droplet',empty:'Registra almeno una glicemia domestica per visualizzare l’andamento.',
        latest:()=>{const row=latestMeasurement('glucose');return {main:row?`${HealthCharts.fmt(row.value)} ${row.unit||'mg/dL'}`:'—',sub:row?`Ultimo valore · ${formatDate(row.date)} · Misurazioni domestiche`:'Nessun dato'};}},
      spo2:{id:'spo2',kind:'monitor',selectLabel:'Saturazione · Misurazioni domestiche',title:'Andamento della saturazione · Misurazioni domestiche',button:'Apri saturazione',view:'monitor-spo2',axis:'%',icon:'shield',empty:'Registra almeno una saturazione per visualizzare l’andamento.',
        latest:()=>{const row=latestMeasurement('spo2');return {main:row?`${HealthCharts.fmt(row.value)}%`:'—',sub:row?`Ultimo valore · ${formatDate(row.date)} · Misurazioni domestiche`:'Nessun dato'};}},
      heart_rate:{id:'heart_rate',kind:'monitor',selectLabel:'Frequenza cardiaca · Misurazioni domestiche',title:'Andamento della frequenza cardiaca · Misurazioni domestiche',button:'Apri frequenza',view:'monitor-heart',axis:'bpm',icon:'heart',empty:'Registra almeno una frequenza cardiaca per visualizzare l’andamento.',
        latest:()=>{const row=latestMeasurement('heart_rate');return {main:row?`${HealthCharts.fmt(row.value)} bpm`:'—',sub:row?`Ultimo valore · ${formatDate(row.date)} · Misurazioni domestiche`:'Nessun dato'};}}
    };
  }

  function dashboardLabOverviewKey(parameterId='',unitKey=''){return `lab:${encodeURIComponent(String(parameterId||''))}:${encodeURIComponent(String(unitKey||''))}`;}
  function dashboardLabOverviewParts(value=''){
    const m=String(value||'').match(/^lab:([^:]+):(.+)$/);if(!m)return null;
    try{return {parameterId:decodeURIComponent(m[1]),unitKey:decodeURIComponent(m[2])};}catch{return null;}
  }
  function dashboardOverviewOptions(){
    const selected=String(currentProfilePreferences()?.dashboardOverviewChart||'weight');
    const options=[];const monitorMap=dashboardMonitorOverviewMap();
    for(const [key,config] of Object.entries(monitorMap)){
      const data=monitorGraphData(key);const points=(data.series||[]).reduce((n,row)=>n+(row.points||[]).length,0);
      if(points||selected===key)options.push({value:key,label:config.selectLabel,source:'monitor'});
    }
    const rows=HealthCharts.collect(state.documents);const params=orderGraphParameters(HealthCharts.groupParameters(rows));
    for(const parameter of params){
      const units=parameter.units||[];
      for(const unit of units){
        const value=dashboardLabOverviewKey(parameter.id,unit.key);
        const label=`${parameter.name} · Laboratorio${units.length>1?` · ${unit.label}`:''}`;
        options.push({value,label,source:'lab'});
      }
    }
    if(!options.some(x=>x.value===selected)){
      const monitor=monitorMap[selected];if(monitor)options.unshift({value:selected,label:monitor.selectLabel,source:'monitor'});
    }
    return options;
  }

  function dashboardOverviewConfig(){
    const pref=String(currentProfilePreferences()?.dashboardOverviewChart||'weight');
    const monitorMap=dashboardMonitorOverviewMap();
    if(monitorMap[pref])return monitorMap[pref];
    const lab=dashboardLabOverviewParts(pref);
    if(lab){
      const rows=HealthCharts.collect(state.documents);
      const series=rows.filter(r=>r.parameterId===lab.parameterId&&r.unitKey===lab.unitKey&&r.clinicalDate).sort((a,b)=>String(a.clinicalDate).localeCompare(String(b.clinicalDate)));
      if(series.length){
        const grouped=HealthCharts.groupParameters(rows).find(x=>x.id===lab.parameterId);
        const name=grouped?.name||series.at(-1)?.parameterName||'Parametro clinico';
        const unit=grouped?.units?.find(x=>x.key===lab.unitKey)?.label||series.at(-1)?.unit||lab.unitKey;
        const latest=series.at(-1);
        return {id:pref,kind:'lab',parameterId:lab.parameterId,unitKey:lab.unitKey,title:`${name} · Laboratorio`,button:'Apri grafico',view:'graphs',axis:unit,icon:'trend',series,empty:'Nessuna rilevazione di laboratorio disponibile.',latest:()=>({main:`${HealthCharts.fmt(latest.value)} ${latest.unit||unit}`,sub:`Ultimo valore · ${formatDate(latest.clinicalDate)} · Laboratorio`})};
      }
    }
    return monitorMap.weight;
  }

  function dashboardOverviewTrendHtml(config){
    if(!globalThis.DossierFeatures?.has?.('temporalGraphs'))return `<div class="dashboard-v13-chart-empty"><strong>Grafici temporali disponibili dal piano MEDIUM.</strong><br>I valori registrati restano conservati.</div>`;
    if(config.kind==='lab'){
      if(!config.series?.length)return `<div class="dashboard-v13-chart-empty">${config.empty}</div>`;
      return `<div class="dashboard-v13-chart">${HealthCharts.svg(config.series,{unit:config.axis})}</div>`;
    }
    const data=monitorGraphData(config.id);
    const points=(data.series||[]).reduce((n,s)=>n+(s.points||[]).length,0);
    if(!points)return `<div class="dashboard-v13-chart-empty">${config.empty}</div>`;
    return `<div class="dashboard-v13-chart">${HealthCharts.timelineSvg(data.series,{axisLabel:config.axis,ariaLabel:config.title,compact:false})}</div>`;
  }

  function renderDashboard() {
    const p=activeProfile();
    const diagnoses=state.diagnoses.filter(x=>String(x.status||'').toLowerCase()!=='risolta').slice().sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
    const therapies=state.therapies.filter(x=>x.active!==false);
    const therapyGroups=[...new Map(therapies.map((x,i)=>[medicationStockKey(x)||String(x.id||`therapy-${i}`),x])).values()];
    const upcoming=calendarUpcomingEvents().slice(0,4);
    const todayKey=calendarLocalToday();
    const activeExemptions=state.exemptions.filter(x=>{const expiry=calendarParseExplicitDate(x.expiry||'');return !expiry||expiry>=todayKey;});
    const recentDocs=[...state.documents].filter(x=>x.clinicalDate&&!isDocumentGroupMember(x)).sort((a,b)=>String(b.clinicalDate||'').localeCompare(String(a.clinicalDate||''))).slice(0,4);
    const pending=state.calendarSuggestions.filter(x=>x.status==='pending'&&calendarSuggestionDateAllowed(x.suggestedDate));
    const preventiveEvents=calendarUpcomingEvents().filter(x=>/vaccin|screen|richiam|preven/i.test(`${x.category||''} ${x.title||''}`));
    const prevention=[...pending.map(x=>({title:x.title||'Richiamo da valutare',date:x.suggestedDate||'',kind:'Proposta',action:'go-calendar'})),...preventiveEvents.map(x=>({title:x.title||x.category||'Richiamo',date:x.startDate||'',kind:x.category||'Prevenzione',action:'go-calendar'}))].slice(0,3);
    const weight=latestMeasurement('weight');
    const glucose=latestMeasurement('glucose');
    const pressure=latestMeasurement('blood_pressure');
    const journey=activeJourney();const jm=journeyMetrics(journey);
    const activeDiagnosisNames=diagnoses.slice(0,2).map(x=>x.name).filter(Boolean);
    const activeTherapyNames=therapyGroups.slice(0,2).map(x=>[x.medication,x.dosage].filter(Boolean).join(' ')).filter(Boolean);
    const activeExemptionNames=activeExemptions.slice(0,2).map(x=>[x.code,x.description].filter(Boolean).join(' · ')).filter(Boolean);
    const emergency=[p.emergencyContactName,p.emergencyContactPhone].filter(Boolean).join(' · ');
    const weightRows=measurementsOf('weight');
    const weightDelta=weightRows.length>1?Number(weightRows.at(-1).value)-Number(weightRows[0].value):null;
    const appointmentHtml=upcoming.length?upcoming.map(x=>`<button type="button" class="dashboard-v13-list-row" data-action="go-calendar"><span class="dashboard-v13-date"><strong>${esc(String(x.startDate||'').slice(8,10)||'--')}</strong><small>${esc(new Intl.DateTimeFormat('it-IT',{month:'short'}).format(new Date(`${x.startDate}T12:00:00`)))}</small></span><span class="dashboard-v13-row-main"><strong>${esc(x.title||'Appuntamento')}</strong><small>${esc([x.location,x.doctorName].filter(Boolean).join(' · ')||x.category||'Agenda')}</small></span><span class="dashboard-v13-row-meta">${x.allDay?'Tutto il giorno':esc(x.startTime||'')}</span></button>`).join(''):'<p class="dashboard-v13-empty">Nessun appuntamento futuro registrato.</p>';
    const docsHtml=recentDocs.length?recentDocs.map(d=>`<div class="dashboard-v13-list-row dashboard-v13-doc-row"><span class="dashboard-v13-iconbox doc">${uiIconSvg('document')}</span><span class="dashboard-v13-row-main"><strong>${esc(d.title||d.originalName||'Documento')}</strong><small>${d.clinicalDate?formatDate(d.clinicalDate):''}${d.documentKind||d.category?` · ${esc(d.documentKind||d.category)}`:''}</small></span><button class="btn btn-light btn-small" data-action="view-doc" data-id="${esc(d.id)}">Apri originale</button></div>`).join(''):'<p class="dashboard-v13-empty">Nessun documento archiviato.</p>';
    const preventionHtml=prevention.length?prevention.map((x,i)=>`<button type="button" class="dashboard-v13-prevention-row" data-action="${x.action}"><span class="dashboard-v13-iconbox ${i===0?'warn':'soft'}">${uiIconSvg(i===0?'checklist':'calendar')}</span><span><strong>${esc(x.title)}</strong><small>${x.date?formatDate(x.date):'Da valutare'} · ${esc(x.kind)}</small></span><span class="dashboard-v13-arrow">›</span></button>`).join(''):`<div class="dashboard-v13-safe-empty">${uiIconSvg('shield')}<span>Nessun richiamo da valutare in questo momento.</span></div>`;
    const overviewConfig=dashboardOverviewConfig();
    const overviewLatest=overviewConfig.latest?overviewConfig.latest():{main:'—',sub:'Nessun dato'};
    const overviewExtra=overviewConfig.extra?overviewConfig.extra():null;
    const firstName=esc(p.firstName||'');
    $('#viewContainer').innerHTML=`
      <section class="dashboard-v13-hero">
        <div><h2>Buongiorno, ${firstName}!</h2><p>Qui trovi un riepilogo della tua situazione sanitaria e delle prossime attività.</p></div>
        <div class="dashboard-v13-hero-mark"><span>La prevenzione oggi</span><strong>per un domani più sereno.</strong></div>
      </section>

      ${profileEmergencyDashboardHtml(p)}

      <div class="dashboard-v13-grid dashboard-v13-top-grid">
        <section class="card dashboard-v13-panel">
          <div class="dashboard-v13-panel-head"><div class="dashboard-v13-title-icon">${uiIconSvg('profile')}</div><h3>Profilo sanitario sintetico</h3><button class="btn btn-light btn-small" data-action="edit-profile">Modifica</button></div>
          <button class="dashboard-v13-summary-row" data-action="go-diagnoses"><span class="dashboard-v13-iconbox blue">${uiIconSvg('diagnosis')}</span><span><strong>Diagnosi attive</strong><small>${activeDiagnosisNames.length?esc(activeDiagnosisNames.join(' · ')):'Nessuna diagnosi attiva registrata'}</small></span><b>${diagnoses.length}</b></button>
          <button class="dashboard-v13-summary-row" data-action="go-therapies"><span class="dashboard-v13-iconbox violet medication-semantic-icon">${uiIconSvg('therapy')}</span><span><strong>Terapie in corso</strong><small>${activeTherapyNames.length?esc(activeTherapyNames.join(' · ')):'Nessuna terapia attiva registrata'}</small></span><b>${therapyGroups.length}</b></button>
          <button class="dashboard-v13-summary-row" data-action="go-exemptions"><span class="dashboard-v13-iconbox green">${uiIconSvg('shield')}</span><span><strong>Esenzioni attive</strong><small>${activeExemptionNames.length?esc(activeExemptionNames.join(' · ')):'Nessuna esenzione attiva registrata'}</small></span><b>${activeExemptions.length}</b></button>
        </section>

        <section class="card dashboard-v13-panel">
          <div class="dashboard-v13-panel-head"><div class="dashboard-v13-title-icon">${uiIconSvg('calendar')}</div><h3>Prossimi appuntamenti</h3><button class="btn btn-light btn-small" data-action="go-calendar">Vedi agenda</button></div>
          <div class="dashboard-v13-list">${appointmentHtml}</div>
        </section>

        <section class="card dashboard-v13-panel">
          <div class="dashboard-v13-panel-head"><div class="dashboard-v13-title-icon">${uiIconSvg('document')}</div><h3>Documenti recenti</h3><button class="btn btn-light btn-small" data-action="go-documents">Vedi tutti</button></div>
          <div class="dashboard-v13-list">${docsHtml}</div>
        </section>
      </div>

      <div class="dashboard-v13-grid dashboard-v13-middle-grid">
        <section class="card dashboard-v13-panel">
          <div class="dashboard-v13-panel-head"><div class="dashboard-v13-title-icon">${uiIconSvg('trend')}</div><h3>Monitoraggio · Ultimi valori</h3><button class="btn btn-light btn-small" data-action="go-monitor">Vedi tutti</button></div>
          <div class="dashboard-v13-monitor-grid">
            <button class="dashboard-v13-monitor-card" data-action="monitor-go" data-view="monitor-weight"><span class="dashboard-v13-iconbox blue">${uiIconSvg('weight')}</span><small>Peso</small><strong>${weight?`${HealthCharts.fmt(weight.value)} kg`:'—'}</strong><span>${weight?formatDate(weight.date):'Nessun dato'}</span></button>
            <button class="dashboard-v13-monitor-card" data-action="monitor-go" data-view="monitor-pressure"><span class="dashboard-v13-iconbox rose">${uiIconSvg('heart')}</span><small>Pressione</small><strong>${pressure&&Number.isFinite(Number(pressure.systolic))&&Number.isFinite(Number(pressure.diastolic))?`${pressure.systolic}/${pressure.diastolic} mmHg`:'—'}</strong><span>${pressure?formatDate(pressure.date):'Nessun dato'}</span></button>
            <button class="dashboard-v13-monitor-card" data-action="monitor-go" data-view="monitor-glucose"><span class="dashboard-v13-iconbox red">${uiIconSvg('droplet')}</span><small>Glicemia</small><strong>${glucose?`${HealthCharts.fmt(glucose.value)} ${esc(glucose.unit||'mg/dL')}`:'—'}</strong><span>${glucose?formatDate(glucose.date):'Nessun dato'}</span></button>
          </div>
        </section>

        <section class="card dashboard-v13-panel dashboard-v13-weight-panel">
          <div class="dashboard-v13-panel-head"><div class="dashboard-v13-title-icon">${uiIconSvg('trend')}</div><h3>${overviewConfig.title}</h3><button class="btn btn-light btn-small" ${overviewConfig.kind==='lab'?`data-action="dashboard-open-clinical-graph" data-parameter="${esc(overviewConfig.parameterId)}" data-unit="${esc(overviewConfig.unitKey)}"`:`data-action="monitor-go" data-view="${overviewConfig.view}"`}>${overviewConfig.button}</button></div>
          <div class="dashboard-v13-weight-layout"><div>${dashboardOverviewTrendHtml(overviewConfig)}</div><aside><strong>${overviewLatest.main}</strong><small>${overviewLatest.sub}</small>${overviewConfig.id==='weight'?`<div class="dashboard-v13-weight-goal"><span>Obiettivo</span><b>${overviewExtra?.goalLabel||'Non impostato'}</b></div>${Number.isFinite(overviewExtra?.delta)?`<div class="dashboard-v13-weight-delta ${overviewExtra.delta<=0?'good':'warn'}">${overviewExtra.delta>0?'+':''}${HealthCharts.fmt(overviewExtra.delta)} kg <small>dalla prima pesata</small></div>`:''}`:''}</aside></div>
        </section>
      </div>

      <div class="dashboard-v13-grid dashboard-v13-bottom-grid">
        <section class="card dashboard-v13-panel">
          <div class="dashboard-v13-panel-head"><div class="dashboard-v13-title-icon">${uiIconSvg('shield')}</div><h3>Richiami e prevenzione</h3><button class="btn btn-light btn-small" data-action="go-calendar">Vedi tutti</button></div>
          <div class="dashboard-v13-prevention-list">${preventionHtml}</div>
        </section>

        <section class="card dashboard-v13-panel dashboard-v13-prepare">
          <div class="dashboard-v13-panel-head"><div class="dashboard-v13-title-icon">${uiIconSvg('checklist')}</div><h3>Prepara visita</h3></div>
          <p>Strumenti utili per raccogliere quello che serve prima della prossima visita.</p>
          <ul><li>Condizioni e terapie attive</li><li>Documenti associati e proposti</li><li>Cose da chiedere al medico</li><li>Farmaci da richiedere</li></ul>
          <button class="btn btn-primary btn-full" data-action="go-prepare-visit">Prepara il mio riepilogo</button>
        </section>

        <section class="card dashboard-v13-panel dashboard-v13-share">
          <div class="dashboard-v13-panel-head"><div class="dashboard-v13-title-icon">${uiIconSvg('share')}</div><h3>Condividi il tuo dossier</h3></div>
          <p>Prepara una versione ordinata del Dossier da mostrare o consegnare al medico.</p>
          <button class="btn btn-light btn-full" data-action="doctor-export">Versione per medico</button>
          <button class="btn btn-primary btn-full" data-action="export-pdf-dashboard">Esporta dossier PDF</button>
          <div class="dashboard-v13-security-note">${uiIconSvg('shield')}<span><strong>I tuoi dati restano protetti</strong><small>Archivio locale e backup mantengono le regole di sicurezza già attive.</small></span><button class="btn btn-light btn-small" data-action="go-backup">Backup</button></div>
        </section>
      </div>`;
    bindViewActions();
  }

  function documentGroupPrimaryId(doc={}){const explicit=String(doc.examGroupPrimaryId||'');if(explicit)return explicit;if(doc.examGroupRole==='primary')return String(doc.id||'');return'';}
  function isDocumentGroupMember(doc={}){const primary=documentGroupPrimaryId(doc);return Boolean(primary&&String(primary)!==String(doc.id||''));}
  function documentGroupRows(doc={}){const primary=documentGroupPrimaryId(doc)||String(doc.id||'');const groupId=String(doc.examGroupId||'');return state.documents.filter(x=>String(x.profileId||'')===String(doc.profileId||state.activeProfileId||'')&&(groupId?String(x.examGroupId||'')===groupId:String(documentGroupPrimaryId(x)||x.id)===primary));}
  function documentGroupCount(doc={}){const rows=documentGroupRows(doc);return rows.length||1;}
  function normalizedExamAssociationKey(doc={}){let title=normalizeClinicalText(doc.title||doc.originalName||'').replace(/\b(?:immagine|foto|pagina|scansione|scan|fronte|retro|anteriore|laterale|ap|pa)\b/g,' ').replace(/\s+/g,' ').trim();const kind=normalizeClinicalText(doc.documentKind||doc.category||'');return `${doc.clinicalDate||''}|${title}|${kind}`;}
  function compatibleExamCandidates(doc={},pool=state.documents){const key=normalizedExamAssociationKey(doc);if(!doc.clinicalDate||!key)return[];return pool.filter(x=>x&&String(x.id)!==String(doc.id)&&String(x.profileId||'')===String(doc.profileId||'')&&!isDocumentGroupMember(x)&&normalizedExamAssociationKey(x)===key);}
  async function associateDocumentGroup(primaryId,ids=[]){if(!requireEdit())return;const unique=[...new Set([primaryId,...ids].map(String).filter(Boolean))];const rows=state.documents.filter(d=>unique.includes(String(d.id)));if(rows.length<2)throw new Error('Seleziona almeno due documenti da associare.');const profileId=String(rows[0].profileId||'');if(rows.some(d=>String(d.profileId||'')!==profileId))throw new Error('I documenti devono appartenere allo stesso profilo.');const primary=rows.find(d=>String(d.id)===String(primaryId))||rows[0];const existing=documentGroupRows(primary).filter(x=>String(x.id)!==String(primary.id));const allMap=new Map([...existing,...rows].map(x=>[String(x.id),x]));allMap.set(String(primary.id),primary);const groupId=String(primary.examGroupId||existing[0]?.examGroupId||`examgrp_${Date.now()}_${Math.random().toString(36).slice(2,9)}`),now=new Date().toISOString();for(const row of allMap.values()){const isPrimary=String(row.id)===String(primary.id);const updated={...row,examGroupId:groupId,examGroupPrimaryId:primary.id,examGroupRole:isPrimary?'primary':'member',examGroupUpdatedAt:now,timelineVisible:isPrimary?(row.timelineVisible!==false):false,updatedAt:now};await DossierDB.put('documents',updated,{details:{event:'document-exam-group',primaryDocumentId:primary.id,groupId}});}await loadProfileData();state.selectedDocIds.clear();renderView();toast(`${allMap.size} documenti associati nello stesso esame`);return primary.id;}
  async function detachDocumentFromGroup(id){const row=state.documents.find(d=>String(d.id)===String(id))||await DossierDB.get('documents',id);if(!row?.examGroupId)return;const primaryId=documentGroupPrimaryId(row);if(String(row.id)===String(primaryId)){toast('Il documento principale non può essere separato finché contiene documenti associati. Scegli prima un altro documento principale dalla selezione multipla.');return;}const updated={...row,examGroupId:'',examGroupPrimaryId:'',examGroupRole:'',timelineVisible:true,examGroupUpdatedAt:new Date().toISOString(),updatedAt:new Date().toISOString()};await DossierDB.put('documents',updated,{details:{event:'document-exam-group-detach',primaryDocumentId:primaryId}});await loadProfileData();renderView();toast('Documento separato dal gruppo');}
  function openAssociateSelectedDocuments(ids=[]){const rows=state.documents.filter(d=>ids.includes(String(d.id)));if(rows.length<2){toast('Seleziona almeno due documenti.');return;}const options=rows.map(d=>`<option value="${esc(d.id)}">${esc(`${d.clinicalDate?formatDate(d.clinicalDate)+' · ':''}${d.title||d.originalName||'Documento'}`)}</option>`).join('');openModal('Associa nello stesso esame','Gli originali restano distinti e recuperabili. Nell’Archivio verranno mostrati come un unico esame.',`<div class="notice success"><strong>${rows.length} documenti selezionati.</strong><br>Scegli il documento principale che rappresenterà l’esame.</div><div class="form-group"><label>Documento principale</label><select id="documentGroupPrimarySelect" class="form-control">${options}</select></div><div class="document-association-list">${rows.map(d=>`<article class="document-association-item"><span class="document-group-row-icon">${uiIconSvg('document')}</span><div><strong>${esc(d.title||d.originalName||'Documento')}</strong><small>${d.clinicalDate?formatDate(d.clinicalDate):'Data non indicata'} · ${esc(d.documentKind||d.category||'Documento sanitario')}</small></div><span class="badge">Originale preservato</span></article>`).join('')}</div><div class="form-actions"><button class="btn btn-light" type="button" id="cancelDocumentGroupBtn">Annulla</button><button class="btn btn-primary" type="button" id="confirmDocumentGroupBtn">Associa documenti</button></div>`);$('#cancelDocumentGroupBtn').onclick=closeModal;$('#confirmDocumentGroupBtn').onclick=async()=>{const b=$('#confirmDocumentGroupBtn');b.disabled=true;b.textContent='Associazione…';try{await associateDocumentGroup($('#documentGroupPrimarySelect').value,rows.map(x=>x.id));closeModal();}catch(e){toast(e.message);b.disabled=false;b.textContent='Associa documenti';}};}
  function openDocumentAssociationModal(doc){const primaryId=documentGroupPrimaryId(doc)||doc.id,primary=state.documents.find(x=>String(x.id)===String(primaryId))||doc,current=documentGroupRows(primary),currentIds=new Set(current.map(x=>String(x.id))),candidates=state.documents.filter(x=>String(x.profileId||'')===String(primary.profileId||'')&&!currentIds.has(String(x.id))&&!isDocumentGroupMember(x)).sort((a,b)=>{const ac=compatibleExamCandidates(primary,[a]).length?0:1,bc=compatibleExamCandidates(primary,[b]).length?0:1;return ac-bc||String(b.clinicalDate||'').localeCompare(String(a.clinicalDate||''));});openModal('Associa altri documenti',primary.title||primary.originalName||'Esame',`<div class="notice"><strong>Documento principale:</strong> ${esc(primary.title||primary.originalName||'Documento')} · ${primary.clinicalDate?formatDate(primary.clinicalDate):'data non indicata'}.<br>Seleziona altri file da raccogliere nello stesso esame. Gli originali non vengono cancellati.</div>${current.length>1?`<div class="notice success"><strong>Già associati: ${current.length} file.</strong></div>`:''}<div class="document-association-list">${candidates.length?candidates.map(c=>{const compatible=compatibleExamCandidates(primary,[c]).length>0;return`<label class="document-association-item ${compatible?'compatible':''}"><input type="checkbox" data-associate-document value="${esc(c.id)}"><span class="document-group-row-icon">${uiIconSvg('document')}</span><div><strong>${esc(c.title||c.originalName||'Documento')}</strong><small>${c.clinicalDate?formatDate(c.clinicalDate):'Data non indicata'} · ${esc(c.documentKind||c.category||'Documento sanitario')}${compatible?' · compatibile per data e descrizione':''}</small></div></label>`;}).join(''):'<div class="notice">Non ci sono altri documenti disponibili da associare.</div>'}</div><div class="form-actions"><button class="btn btn-light" type="button" id="cancelAssociateDocumentsBtn">Annulla</button><button class="btn btn-primary" type="button" id="saveAssociateDocumentsBtn" ${candidates.length?'':'disabled'}>Associa selezionati</button></div>`);$('#cancelAssociateDocumentsBtn').onclick=closeModal;$('#saveAssociateDocumentsBtn').onclick=async()=>{const ids=$$('[data-associate-document]:checked',$('#modalBody')).map(x=>x.value);if(!ids.length){toast('Seleziona almeno un documento da associare');return;}const b=$('#saveAssociateDocumentsBtn');b.disabled=true;try{await associateDocumentGroup(primary.id,[...current.map(x=>x.id),...ids]);closeModal();setTimeout(()=>viewDocument(primary.id),100);}catch(e){toast(e.message);b.disabled=false;}};}
  function openImportAssociationSuggestion(docId,candidateId){const doc=state.documents.find(x=>String(x.id)===String(docId)),candidate=state.documents.find(x=>String(x.id)===String(candidateId));if(!doc||!candidate)return;openModal('Possibile stesso esame','Il Dossier ha trovato un esame compatibile già presente.',`<div class="notice success"><strong>${esc(doc.title||doc.originalName||'Nuovo documento')}</strong> sembra appartenere allo stesso esame di <strong>${esc(candidate.title||candidate.originalName||'documento esistente')}</strong>.</div><div class="document-association-list"><article class="document-association-item compatible"><span class="document-group-row-icon">${uiIconSvg('document')}</span><div><strong>${esc(candidate.title||candidate.originalName||'Documento')}</strong><small>${candidate.clinicalDate?formatDate(candidate.clinicalDate):''} · esame già presente</small></div></article><article class="document-association-item compatible"><span class="document-group-row-icon">${uiIconSvg('document')}</span><div><strong>${esc(doc.title||doc.originalName||'Documento')}</strong><small>${doc.clinicalDate?formatDate(doc.clinicalDate):''} · appena importato</small></div></article></div><div class="form-actions"><button class="btn btn-light" id="keepImportSeparateBtn" type="button">Mantieni separati</button><button class="btn btn-primary" id="associateImportExamBtn" type="button">Aggiungi allo stesso esame</button></div>`);$('#keepImportSeparateBtn').onclick=closeModal;$('#associateImportExamBtn').onclick=async()=>{const b=$('#associateImportExamBtn');b.disabled=true;try{await associateDocumentGroup(candidate.id,[candidate.id,doc.id]);closeModal();}catch(e){toast(e.message);b.disabled=false;}};}

  function renderTimeline() {
    const docs=[...state.documents].filter(d=>d.timelineVisible!==false&&!isDocumentGroupMember(d)).sort(compareDocs);
    const visual=d=>{const t=normalizeClinicalText(`${d.documentKind||''} ${d.category||''} ${d.title||''}`);if(/laboratorio|esami/.test(t))return{icon:'droplet',tone:'blue'};if(/visita|cardiolog|neurolog|diabetolog|ocul/.test(t))return{icon:'profile',tone:'teal'};if(/terapia|ricetta/.test(t))return{icon:'therapy',tone:'violet'};if(/tac|risonanza|radiolog|ecograf|elettrocard/.test(t))return{icon:'trend',tone:'rose'};return{icon:'document',tone:'blue'};};
    const uniqueMeta=d=>[d.facility,d.specialization||d.department].map(x=>String(x||'').trim()).filter((x,i,a)=>x&&a.findIndex(y=>normalizeClinicalText(y)===normalizeClinicalText(x))===i);
    const cleanPreview=(d,meta=[])=>{
      let value=String(d.reconstructedText||d.structuredText||'').replace(/\s+/g,' ').trim();
      if(!value)return'';
      const labLike=/laborator|esami di laboratorio/i.test([d.documentKind,d.category,d.title].filter(Boolean).join(' '));
      const remove=[d.title,d.originalName,d.facility,d.specialization,d.department,d.documentKind,d.category].map(x=>String(x||'').trim()).filter(Boolean);
      for(const token of remove){
        const normToken=normalizeClinicalText(token);
        if(!normToken)continue;
        const raw=value;
        value=value.split(token).join(' ');
        if(value===raw){
          const chunks=value.split(/(?=[.;·|])|(?<=[.;·|])/).filter(Boolean);
          value=chunks.filter(chunk=>{
            const n=normalizeClinicalText(chunk);
            if(!n)return true;
            const words=n.split(' ').filter(Boolean), tokenWords=new Set(normToken.split(' ').filter(Boolean));
            const overlap=words.length?words.filter(w=>tokenWords.has(w)).length/words.length:0;
            return !(normToken.includes(n)||n.includes(normToken)||overlap>.76);
          }).join(' ');
        }
      }
      value=value.replace(/\s*[·|]\s*(?:[·|]\s*)+/g,' · ').replace(/\s{2,}/g,' ').replace(/^[\s·|,:;\-]+|[\s·|,:;\-]+$/g,'').trim();
      if(!value)return'';
      const norm=normalizeClinicalText(value),metaNorm=normalizeClinicalText(meta.join(' '));
      if(metaNorm){
        const words=norm.split(' ').filter(Boolean),metaWords=new Set(metaNorm.split(' ').filter(Boolean));
        const overlap=words.length?words.filter(w=>metaWords.has(w)).length/words.length:0;
        const firstWords=words.slice(0,Math.min(28,words.length));
        const firstOverlap=firstWords.length?firstWords.filter(w=>metaWords.has(w)).length/firstWords.length:0;
        if(norm===metaNorm||metaNorm.includes(norm)||norm.includes(metaNorm)||overlap>.58||firstOverlap>.64)return'';
      }
      // Nei referti di laboratorio la cronologia deve restare compatta: se esiste già
      // la riga struttura/reparto, non ripetere l'intestazione OCR come anteprima.
      if(labLike&&meta.length)return'';
      return value;
    };
    $('#viewContainer').innerHTML=`<section class="card modern-content-shell timeline-modern-shell"><div class="modern-content-head"><div><h2>Eventi clinici</h2><p>Consultazione cronologica compatta dei documenti sanitari.</p></div><button class="btn btn-primary" data-action="import">Aggiungi documento</button></div>
      ${docs.length?`<div class="timeline-modern-list">${docs.map(d=>{const v=visual(d),meta=uniqueMeta(d),preview=cleanPreview(d,meta);return `<article class="timeline-modern-card"><span class="timeline-modern-marker ${v.tone} ${v.icon==='therapy'?'medication-semantic-icon':''}">${uiIconSvg(v.icon)}</span><div class="timeline-modern-main"><div class="timeline-modern-title"><span class="timeline-modern-date">${formatDate(d.clinicalDate)}</span><h3>${esc(d.title||d.originalName||'Documento')}</h3><span class="badge">${esc(d.documentKind||d.category||'Documento sanitario')}</span></div>${meta.length?`<p class="timeline-modern-meta">${meta.map(esc).join(' · ')}</p>`:''}${preview?`<p class="timeline-modern-preview">${esc(preview.slice(0,220))}${preview.length>220?'…':''}</p>`:''}</div><div class="timeline-modern-actions"><button class="btn btn-light btn-small" data-action="view-doc" data-id="${d.id}">Apri referto</button><button class="btn btn-ghost btn-small" data-action="edit-doc" data-id="${d.id}">Modifica</button></div></article>`;}).join('')}</div>`:'<div class="modern-empty-state">'+uiIconSvg('document')+'<h3>Nessun evento clinico</h3><p>I documenti inseriti nel Dossier compariranno qui in ordine cronologico.</p></div>'}
    </section>`;
    bindViewActions();
  }

  function renderDocuments() {
    const trashCount=state.trashItems.filter(x=>x.profileId===state.activeProfileId).length;
    $('#viewContainer').innerHTML = `
      <section class="card modern-content-shell documents-modern-shell">
        <div class="modern-content-head"><div><h2>Archivio documenti</h2><p>Referti, immagini e PDF organizzati in schede compatte con accesso rapido alle funzioni principali.</p></div><div class="row-actions"><button class="btn btn-light" data-action="open-trash">Cestino${trashCount?` · ${trashCount}`:''}</button><button class="btn btn-light" data-action="reanalyze-all" ${canEditActive()?'':'disabled'}>Rianalizza archivio completo</button><button class="btn btn-light" id="importDicomBtn" type="button" ${canEditActive()?'':'disabled'}>Importa DICOM</button><button class="btn btn-primary" data-action="import" ${canEditActive()?'':'disabled'}>Importa</button></div></div>
        <div class="documents-modern-toolbar"><div class="documents-search-box"><span>${uiIconSvg('document')}</span><input id="docSearch" class="form-control" placeholder="Cerca per titolo, categoria, medico o struttura"></div><div class="form-group compact-control"><label for="docSort">Ordina</label><select id="docSort" class="form-control"><option value="asc">Dal più vecchio</option><option value="desc">Dal più recente</option><option value="added">Ultimi caricati</option></select></div></div>
        <div class="bulk-toolbar modern-bulk-toolbar"><label class="check-row compact"><input type="checkbox" id="selectVisibleDocs"><span><strong>Seleziona i documenti visibili</strong></span></label><span id="selectedDocsCount">0 selezionati</span><button id="bulkAssociateBtn" class="btn btn-primary btn-small" disabled>Associa / raggruppa</button><button id="bulkPdfIncludeBtn" class="btn btn-light btn-small" disabled>Includi nel PDF</button><button id="bulkPdfExcludeBtn" class="btn btn-light btn-small" disabled>Escludi dal PDF</button><button id="bulkTrashBtn" class="btn btn-danger btn-small" disabled>Sposta nel Cestino</button><button id="clearDocSelectionBtn" class="btn btn-light btn-small" disabled>Deseleziona</button></div>
        <div id="documentsTable"></div>
      </section>`;
    $('#docSearch').addEventListener('input', refreshDocumentsTable);
    $('#docSort').addEventListener('change', refreshDocumentsTable);
    $('#selectVisibleDocs').addEventListener('change',e=>{state.visibleDocumentIds.forEach(id=>e.target.checked?state.selectedDocIds.add(id):state.selectedDocIds.delete(id));refreshDocumentsTable();});
    $('#bulkAssociateBtn').addEventListener('click',()=>openAssociateSelectedDocuments([...state.selectedDocIds]));
    $('#bulkTrashBtn').addEventListener('click',()=>moveDocumentsToTrash([...state.selectedDocIds]));
    $('#bulkPdfIncludeBtn').addEventListener('click',()=>setDocumentsPdfInclusion([...state.selectedDocIds],true));
    $('#bulkPdfExcludeBtn').addEventListener('click',()=>setDocumentsPdfInclusion([...state.selectedDocIds],false));
    $('#clearDocSelectionBtn').addEventListener('click',()=>{state.selectedDocIds.clear();refreshDocumentsTable();});
    refreshDocumentsTable(); bindViewActions();
  }

  function refreshDocumentsTable() {
    const target=$('#documentsTable');if(!target)return;
    const q=($('#docSearch')?.value||'').toLowerCase().trim();const sort=$('#docSort')?.value||'asc';
    let docs=state.documents.filter(d=>!isDocumentGroupMember(d)&&[d.title,d.documentKind,d.category,d.specialization,d.facility,d.originalName,d.reconstructedText,d.extractedText,(d.labValues||[]).map(v=>v.parameterName).join(' ')].join(' ').toLowerCase().includes(q));
    docs=[...docs].sort(sort==='desc'?(a,b)=>(b.clinicalDate||'').localeCompare(a.clinicalDate||''):sort==='added'?(a,b)=>(b.addedAt||'').localeCompare(a.addedAt||''):compareDocs);
    state.visibleDocumentIds=docs.map(d=>d.id);const selectedVisible=docs.filter(d=>state.selectedDocIds.has(d.id)).length;
    const selectAll=$('#selectVisibleDocs');if(selectAll){selectAll.checked=!!docs.length&&selectedVisible===docs.length;selectAll.indeterminate=selectedVisible>0&&selectedVisible<docs.length;}
    const count=$('#selectedDocsCount');if(count)count.textContent=`${state.selectedDocIds.size} selezionati`;const associate=$('#bulkAssociateBtn');if(associate)associate.disabled=state.selectedDocIds.size<2||!canEditActive();const bulk=$('#bulkTrashBtn');if(bulk)bulk.disabled=!state.selectedDocIds.size||!canEditActive();const bulkPdfInclude=$('#bulkPdfIncludeBtn');if(bulkPdfInclude)bulkPdfInclude.disabled=!state.selectedDocIds.size||!canEditActive();const bulkPdfExclude=$('#bulkPdfExcludeBtn');if(bulkPdfExclude)bulkPdfExclude.disabled=!state.selectedDocIds.size||!canEditActive();const clear=$('#clearDocSelectionBtn');if(clear)clear.disabled=!state.selectedDocIds.size;
    const readMeta=d=>{const complex=isComplexClinicalDoc(d),status=complex?(d.clinicalCanonicalRereadStatus||''):'';const when=d.clinicalCanonicalRereadAt||d.lastAnalysisAt||d.addedAt||'';if(status==='in_progress')return'Rilettura in corso…';if(status==='failed')return`Da riprovare${when?` · ${formatDateTime(when)}`:''}`;return when?`Letto ${formatDateTime(when)}`:'Lettura non disponibile';};
    const contentMeta=d=>{let base;if(isComplexClinicalDoc(d)){const n=(d.labValues||[]).length;base=`Sintesi clinica${n?` · ${n} valori`:''}`;}else base=['lab','mixed'].includes(d.documentMode)||d.category==='Esami di laboratorio'?`${(d.labValues||[]).length} valori numerici · ${(d.qualitativeResults||[]).length} qualitativi`:d.documentMode==='therapy'?`${(d.extractedTherapies||[]).length} terapie`:'Referto integrale';const n=(d.linkedDicomStudyIds||[]).length,g=documentGroupCount(d);return`${base}${n?` · ${n} studio${n===1?'':'i'} DICOM associato${n===1?'':'i'}`:''}${g>1?` · ${g} file nello stesso esame`:''}`;};
    target.innerHTML=docs.length?`<div class="documents-modern-list"><div class="document-row-head"><span></span><span></span><span>Documento</span><span>Struttura</span><span>Contenuto</span><span>PDF / lettura</span><span>Azioni</span></div>${docs.map(d=>`<article class="document-row-modern ${state.selectedDocIds.has(d.id)?'selected':''}"><label class="document-select-box"><input type="checkbox" class="doc-select" data-id="${d.id}" ${state.selectedDocIds.has(d.id)?'checked':''}></label><span class="document-modern-icon">${uiIconSvg('document')}</span><div class="document-row-title"><small>${d.clinicalDate?formatDate(d.clinicalDate):'Data non indicata'}</small><strong>${esc(d.title||d.originalName||'Documento')}</strong><span>${esc(d.documentKind||d.category||'Documento sanitario')}</span>${documentGroupCount(d)>1?`<span class="document-group-badge">${documentGroupCount(d)} file associati</span>`:''}</div><div class="document-row-cell"><small>Struttura</small><strong>${esc(d.facility||d.specialization||'Non indicata')}</strong></div><div class="document-row-cell"><small>Contenuto</small><strong>${esc(contentMeta(d))}</strong></div><div class="document-row-status"><small>${esc(readMeta(d))}</small><label class="pdf-toggle"><input type="checkbox" class="doc-pdf-toggle" data-id="${d.id}" ${documentIncludedInPdf(d)?'checked':''} ${canEditActive()?'':'disabled'}><span>Nel PDF</span></label>${d.needsCompletion?'<span class="badge warning">Da completare</span>':''}</div><div class="document-row-actions"><button class="btn btn-light btn-small" data-action="view-doc" data-id="${d.id}">Apri</button><button class="btn btn-ghost btn-small" data-action="edit-doc" data-id="${d.id}" ${canEditActive()?'':'disabled'}>Modifica</button><button class="btn btn-danger btn-small" data-action="delete-doc" data-id="${d.id}" ${canEditActive()?'':'disabled'}>Cestino</button></div></article>`).join('')}</div>`:'<div class="modern-empty-state">'+uiIconSvg('document')+'<h3>Nessun documento corrispondente</h3><p>Modifica la ricerca o importa un nuovo documento.</p></div>';
    $$('.doc-select',target).forEach(input=>input.addEventListener('change',e=>{e.target.checked?state.selectedDocIds.add(e.target.dataset.id):state.selectedDocIds.delete(e.target.dataset.id);refreshDocumentsTable();}));
    $$('.doc-pdf-toggle',target).forEach(input=>input.addEventListener('change',async e=>{await setDocumentsPdfInclusion([e.target.dataset.id],e.target.checked,{keepSelection:true});}));bindViewActions(target);
  }

  async function setDocumentsPdfInclusion(ids=[],include=true,{keepSelection=false}={}) {
    if(!ids.length||!requireEdit())return;
    for(const id of ids){const doc=state.documents.find(d=>d.id===id);if(!doc)continue;const updated={...doc,pdfExportOverride:true,pdfExportMode:include?(isComplexClinicalDoc(doc)?'summary':'full'):'exclude',updatedAt:new Date().toISOString()};await DossierDB.put('documents',updated,{details:{event:include?'document-pdf-include':'document-pdf-exclude'}});const idx=state.documents.findIndex(d=>d.id===id);if(idx>=0)state.documents[idx]=updated;}
    if(!keepSelection)state.selectedDocIds.clear();refreshDocumentsTable();toast(include?'Documento/i inclusi nel PDF':'Documento/i esclusi dal PDF; dati clinici mantenuti per grafici e storico');
  }

  async function linkedDocumentData(doc) {
    const versions=(await DossierDB.byProfile('documentVersions',doc.profileId)).filter(x=>x.documentId===doc.id);
    const therapies=(await DossierDB.byProfile('therapies',doc.profileId)).filter(x=>x.sourceDocumentId===doc.id);
    const exemptions=(await DossierDB.byProfile('exemptions',doc.profileId)).filter(x=>x.sourceDocumentId===doc.id);
    const diagnoses=(await DossierDB.byProfile('diagnoses',doc.profileId)).filter(x=>x.sourceDocumentId===doc.id);
    return {versions,therapies,exemptions,diagnoses,parameters:(doc.labValues||[]).length+(doc.qualitativeResults||[]).length};
  }

  async function moveDocumentsToTrash(ids=[]) {
    if(!ids.length||!requireEdit())return;const docs=ids.map(id=>state.documents.find(d=>d.id===id)).filter(Boolean);if(!docs.length)return;
    const linked=[];for(const doc of docs)linked.push({doc,related:await linkedDocumentData(doc)});
    const totals=linked.reduce((a,x)=>({versions:a.versions+x.related.versions.length,therapies:a.therapies+x.related.therapies.length,exemptions:a.exemptions+x.related.exemptions.length,diagnoses:a.diagnoses+x.related.diagnoses.length,parameters:a.parameters+x.related.parameters}),{versions:0,therapies:0,exemptions:0,diagnoses:0,parameters:0});
    const message=`Spostare ${docs.length} document${docs.length===1?'o':'i'} nel Cestino?\n\nCollegamenti conservati per il ripristino:\n${totals.diagnoses} diagnosi o problemi\n${totals.therapies} terapie\n${totals.exemptions} esenzioni\n${totals.parameters} parametri estratti\n${totals.versions} versioni OCR`;
    if(!confirm(message))return;
    for(const {doc,related} of linked){const trash={id:uid('trash'),profileId:doc.profileId,entityType:'document',entityId:doc.id,title:doc.title||doc.originalName,deletedAt:new Date().toISOString(),deletedBy:DossierSecurity.currentUser()?.id||'',payload:{document:doc,...related}};await DossierDB.put('trash',trash,{details:{event:'document-to-trash'}});await DossierDB.del('documents',doc.id,{details:{event:'document-to-trash'}});for(const [store,rows] of [['documentVersions',related.versions],['therapies',related.therapies],['exemptions',related.exemptions],['diagnoses',related.diagnoses]])for(const row of rows)await DossierDB.del(store,row.id,{details:{event:'linked-to-trash'}});}
    state.selectedDocIds.clear();await loadAll();await loadPreferences();render();state.activeView='documents';selectNav('documents');renderDocuments();toast(`${docs.length} document${docs.length===1?'o spostato':'i spostati'} nel Cestino`);
  }

  async function restoreTrashItem(id) {
    if(!requireEdit())return;const item=await DossierDB.get('trash',id);if(!item?.payload)return;const payload=item.payload;await DossierDB.put('documents',payload.document,{details:{event:'trash-restore'}});for(const [store,rows] of [['documentVersions',payload.versions||[]],['therapies',payload.therapies||[]],['exemptions',payload.exemptions||[]],['diagnoses',payload.diagnoses||[]]])for(const row of rows)await DossierDB.put(store,row,{details:{event:'trash-restore'}});await DossierDB.del('trash',id,{details:{event:'trash-restore'}});closeModal();await loadAll();await loadPreferences();render();state.activeView='documents';selectNav('documents');renderDocuments();toast('Documento ripristinato');
  }

  async function purgeTrashItem(id) {
    if(!requireEdit()||!confirm('Eliminare definitivamente questo documento e tutti i collegamenti conservati? L’operazione non è annullabile.'))return;const item=await DossierDB.get('trash',id);await DossierDB.del('trash',id,{details:{event:'trash-purge'}});if(state.archiveHandle&&item?.payload?.document)await deleteSyncedDocument(item.payload.document).catch(()=>{});closeModal();await loadAll();renderDocuments();toast('Documento eliminato definitivamente');
  }

  function openTrashModal() {
    const rows=state.trashItems.filter(x=>x.profileId===state.activeProfileId).sort((a,b)=>String(b.deletedAt).localeCompare(String(a.deletedAt)));
    openModal('Cestino documenti','Gli elementi restano ripristinabili finché non vengono eliminati definitivamente.',rows.length?`<div class="list-stack">${rows.map(x=>`<div class="list-item"><div><h3>${esc(x.title||'Documento')}</h3><p>Spostato il ${formatDateTime(x.deletedAt)} · ${(x.payload?.versions||[]).length} versioni OCR conservate</p></div><div class="row-actions"><button class="btn btn-primary btn-small" data-trash-restore="${x.id}">Ripristina</button><button class="btn btn-danger btn-small" data-trash-purge="${x.id}">Elimina definitivamente</button></div></div>`).join('')}</div>`:'<div class="notice">Il Cestino è vuoto.</div>');
    $$('[data-trash-restore]',$('#modalBody')).forEach(b=>b.onclick=()=>restoreTrashItem(b.dataset.trashRestore));$$('[data-trash-purge]',$('#modalBody')).forEach(b=>b.onclick=()=>purgeTrashItem(b.dataset.trashPurge));
  }

  function renderGraphs() {
    const rows=HealthCharts.collect(state.documents);
    const params=orderGraphParameters(HealthCharts.groupParameters(rows));
    const rememberedParameterId=String(state.graphParameterId||'');
    const rememberedUnitKey=String(state.graphUnitKey||'');
    const rememberedRowKey=String(state.graphSelectedRowKey||'');
    $('#viewContainer').innerHTML=`<section class="card clinical-graphs-shell">
      <div class="clinical-graphs-toolbar">
        <div class="form-group"><label>Parametro clinico</label><select id="graphParameter" class="form-control"><option value="">Scegli il parametro desiderato</option>${params.map(p=>`<option value="${esc(p.id)}">${esc(p.name)} · ${p.datedCount} rilevazioni</option>`).join('')}</select></div>
        <div class="form-group hidden" id="graphUnitGroup"><label>Unità</label><select id="graphUnit" class="form-control"></select></div>
      </div>
      <div id="graphOutput" class="clinical-graphs-empty"><div class="modern-empty-state">${uiIconSvg('trend')}<h3>Scegli il parametro desiderato</h3><p>Il grafico e tutte le rilevazioni correlate compariranno qui.</p></div></div>
    </section>`;
    if(!params.length){$('#graphOutput').innerHTML='<div class="notice warning">Nessuna serie clinica valida disponibile.</div>';return;}

    const rowKey=(r,i)=>`${r.documentId||'doc'}-${r.clinicalDate||'date'}-${i}`;
    const statusClass=status=>HealthReport.statusClass?.(status)||'non-definito';
    const detailHtml=(r)=>{
      if(!r)return `<div class="clinical-graph-detail-empty">Seleziona una rilevazione nell'elenco a destra per visualizzare direttamente il referto collegato.</div>`;
      const doc=state.documents.find(d=>d.id===r.documentId)||{};const mode=doc.documentMode||((doc.category==='Esami di laboratorio')?'lab':'narrative');const labRows=HealthReport.resultRows(doc,{profile:activeProfile()||{}});const groups=HealthReport.groupedResultRows?.(labRows)||[{section:'Risultati clinici',rows:labRows}];const narrativeRows=HealthReport.narrativeRows?.(doc)||[];
      const narrative=(mode==='narrative'||mode==='mixed'||mode==='diagnosis')&&narrativeRows.length?`<div class="clinical-inline-report-section"><h4>Referto clinico</h4>${narrativeRows.map(([label,body])=>`<section><strong>${esc(label||'Referto')}</strong>${String(body).split(/\n+/).filter(Boolean).map(par=>`<p>${esc(par)}</p>`).join('')}</section>`).join('')}</div>`:'';
      const labs=(mode==='lab'||mode==='mixed'||isComplexClinicalDoc(doc))&&labRows.length?`<div class="clinical-inline-report-section"><h4>Risultati clinici</h4>${groups.map(g=>`<div class="clinical-inline-lab-group"><strong>${esc(g.section||'Risultati')}</strong><div class="table-wrap"><table><thead><tr><th>Esame</th><th>Risultato</th><th>Unità</th><th>Riferimento</th><th>Stato</th></tr></thead><tbody>${g.rows.map(x=>`<tr><td>${esc(x.test)}</td><td><strong>${esc(x.result)}</strong></td><td>${esc(x.unit||'')}</td><td>${esc(x.reference||'')}</td><td>${x.status?`<span class="badge ${esc(HealthReport.statusClass?.(x.status)||'')}">${esc(x.status)}</span>`:''}</td></tr>`).join('')}</tbody></table></div></div>`).join('')}</div>`:'';
      const fallback=!narrative&&!labs?`<div class="clinical-inline-report-text">${multilineHtml(doc.reconstructedText||doc.structuredText||doc.extractedText||'Referto non ricostruito. Usa Apri file originale.')}</div>`:'';
      return `<article class="clinical-inline-report"><div class="clinical-inline-report-head"><span class="clinical-graph-detail-icon">${uiIconSvg('document')}</span><div><small>Referto collegato</small><h3>${esc(doc.title||r.documentTitle||doc.originalName||'Referto')}</h3><p>${formatDate(r.clinicalDate)}${doc.facility?` · ${esc(doc.facility)}`:''}${doc.documentKind||doc.category?` · ${esc(doc.documentKind||doc.category)}`:''}</p></div><button class="btn btn-light" data-action="view-doc" data-id="${esc(r.documentId||'')}">Apri file originale</button></div><div class="clinical-inline-report-body">${narrative}${labs}${fallback}</div></article>`;
    };
    const refresh=()=>{
      const pid=$('#graphParameter')?.value||'';
      if(!pid){state.graphParameterId='';state.graphUnitKey='';$('#graphUnitGroup')?.classList.add('hidden');$('#graphOutput').innerHTML=`<div class="modern-empty-state">${uiIconSvg('trend')}<h3>Scegli il parametro desiderato</h3><p>Il grafico e tutte le rilevazioni correlate compariranno qui.</p></div>`;return;}
      state.graphParameterId=pid;
      const p=params.find(x=>x.id===pid);
      const unitSelect=$('#graphUnit');
      const units=p?.units||[];
      if(!unitSelect.dataset.ready||!units.some(u=>u.key===unitSelect.value)){
        unitSelect.innerHTML=units.map(u=>`<option value="${esc(u.key)}">${esc(u.label)} · ${u.count}</option>`).join('');
        unitSelect.dataset.ready='1';
      }
      if(!units.some(u=>u.key===unitSelect.value))unitSelect.value=units[0]?.key||'';
      state.graphUnitKey=unitSelect.value||units[0]?.key||'';
      $('#graphUnitGroup').classList.toggle('hidden',units.length<=1);
      const unit=units.find(u=>u.key===state.graphUnitKey)?.label||'';
      const series=rows.filter(r=>r.parameterId===pid&&r.unitKey===state.graphUnitKey).sort((a,b)=>(a.clinicalDate||'9999').localeCompare(b.clinicalDate||'9999'));
      const keyedSeries=series.map((r,i)=>({r,key:rowKey(r,i)}));
      const selectedPair=keyedSeries.find(x=>x.key===String(state.graphSelectedRowKey||''))||null;
      if(!selectedPair)state.graphSelectedRowKey='';
      const list=keyedSeries.map(({r,key})=>`<button type="button" class="clinical-related-row ${selectedPair?.key===key?'selected':''}" data-graph-row="${esc(key)}"><span>${formatDate(r.clinicalDate)}</span><strong>${HealthCharts.fmt(r.value)} ${esc(r.unit)}</strong><span>${esc(HealthReport.visibleReference?.(r)||r.range?.raw||'Non rilevato')}</span><span class="badge ${esc(statusClass(r.status))}">${esc(r.status||'Non definito')}</span><b>›</b></button>`).join('');
      $('#graphOutput').innerHTML=`<div class="clinical-graph-layout">
        <div class="clinical-graph-main">
          <section class="clinical-graph-card"><div class="clinical-graph-card-head"><div><span class="clinical-graph-icon">${uiIconSvg('trend')}</span><div><h3>${esc(p?.name||'Parametro')}</h3><p>${series.length} rilevazioni valide${unit?` · ${esc(unit)}`:''}</p></div></div></div><div class="chart-shell clinical-chart-compact">${HealthCharts.svg(series,{unit})}</div></section>
          <div id="clinicalGraphDetail">${detailHtml(selectedPair?.r||null)}</div>
        </div>
        <aside class="clinical-related-panel"><div class="clinical-related-head"><div><h3>Esami correlati</h3><p>Tutte le rilevazioni utilizzate per questo grafico.</p></div><span class="badge">${series.length}</span></div><div class="clinical-related-columns"><span>Data referto</span><span>Valore rilevato</span><span>Intervallo</span><span>Stato</span><span></span></div><div class="clinical-related-list">${list||'<div class="notice">Nessuna rilevazione disponibile.</div>'}</div></aside>
      </div>`;
      const map=new Map(keyedSeries.map(x=>[x.key,x.r]));
      $$('[data-graph-row]',$('#graphOutput')).forEach(btn=>btn.addEventListener('click',()=>{
        $$('[data-graph-row]',$('#graphOutput')).forEach(x=>x.classList.toggle('selected',x===btn));
        const r=map.get(btn.dataset.graphRow);state.graphSelectedRowKey=btn.dataset.graphRow;
        $('#clinicalGraphDetail').innerHTML=detailHtml(r);bindViewActions($('#clinicalGraphDetail'));
      }));
      bindViewActions($('#graphOutput'));
    };
    $('#graphParameter').addEventListener('change',()=>{state.graphSelectedRowKey='';const p=params.find(x=>x.id===$('#graphParameter').value);const units=p?.units||[];const unitSelect=$('#graphUnit');unitSelect.innerHTML=units.map(u=>`<option value="${esc(u.key)}">${esc(u.label)} · ${u.count}</option>`).join('');unitSelect.dataset.ready='1';refresh();});
    $('#graphUnit').addEventListener('change',()=>{state.graphSelectedRowKey='';refresh();});
    if(rememberedParameterId&&params.some(p=>p.id===rememberedParameterId)){
      $('#graphParameter').value=rememberedParameterId;
      const p=params.find(x=>x.id===rememberedParameterId);const units=p?.units||[];const unitSelect=$('#graphUnit');
      unitSelect.innerHTML=units.map(u=>`<option value="${esc(u.key)}">${esc(u.label)} · ${u.count}</option>`).join('');unitSelect.dataset.ready='1';
      if(rememberedUnitKey&&units.some(u=>u.key===rememberedUnitKey))unitSelect.value=rememberedUnitKey;
      state.graphSelectedRowKey=rememberedRowKey;refresh();
    }
  }

  function compareParameterMatches(query=''){
    const q=HealthExtractors.normalizeText(query);if(!q)return[];
    const params=Array.isArray(HealthExtractors.PARAMS)?HealthExtractors.PARAMS:[];
    const aliases=p=>[p.name,...(p.aliases||[])].map(x=>HealthExtractors.normalizeText(x)).filter(Boolean);
    const exact=params.filter(p=>aliases(p).some(a=>a===q));
    if(exact.length)return exact;
    const direct=params.filter(p=>aliases(p).some(a=>a.includes(q)||(a.length>=4&&q.includes(a))));
    if(direct.length)return direct;
    return HealthExtractors.parameterMatches(query).filter(p=>aliases(p).some(a=>a.includes(q)||(a.length>=4&&q.includes(a))));
  }



  // WINDOWS V9: PREPARA VISITA + CERCA NEL DOSSIER
  // Modulo deterministico. Legge i dati esistenti e non modifica parser, Diagnosi,
  // Terapie, Agenda, Grafici o documenti originali.
  const VISIT_SPECIALTIES_V9 = [
    {key:'medico-base',label:'Medico di base',spec:['medico di base','medicina generale','mmg'],keywords:[],labs:[]},
    {key:'epatologia',label:'Epatologia',spec:['epatolog','malattie del fegato'],keywords:['epatolog','fegato','epatic','epatit','steatos','cirros','fibrosi epatic','transaminas','bilirubin','gamma gt','ggt','fosfatasi alcalina'],labs:['alt','gpt','ast','got','ggt','gamma gt','bilirubina','fosfatasi alcalina','albumina','inr']},
    {key:'gastroenterologia',label:'Gastroenterologia',spec:['gastroenterolog'],keywords:['gastroenter','gastroscopia','endoscopia','esofag','stomac','gastrit','reflus','colon','intestin','celiach'],labs:['amilasi','lipasi','calprotectina','sangue occulto']},
    {key:'cardiologia',label:'Cardiologia',spec:['cardiolog'],keywords:['cardiolog','cuore','cardiac','ecg','elettrocardiogram','ecocardiogram','holter','coronar','scompenso'],labs:['troponina','nt probnp','bnp','colesterolo','ldl','hdl','trigliceridi','potassio','sodio']},
    {key:'diabetologia',label:'Diabetologia',spec:['diabetolog'],keywords:['diabet','glicem','emoglobina glicata','hba1c','microalbumin'],labs:['glicemia','glucosio','hba1c','emoglobina glicata','microalbumina','albuminuria']},
    {key:'endocrinologia',label:'Endocrinologia',spec:['endocrinolog'],keywords:['endocrin','tiroid','tsh','ft3','ft4','ormonal'],labs:['tsh','ft3','ft4','cortisolo','prolattina','paratormone','pth']},
    {key:'nefrologia',label:'Nefrologia',spec:['nefrolog'],keywords:['nefrolog','renale','rene','insufficienza renal','proteinuria','albuminuria'],labs:['creatinina','egfr','azotemia','urea','potassio','sodio','albuminuria','proteinuria']},
    {key:'ematologia',label:'Ematologia',spec:['ematolog'],keywords:['ematolog','anemia','leucocit','piastrin','emoglobin','linfocit','coagul'],labs:['emocromo','emoglobina','ematocrito','leucociti','piastrine','ferritina','sideremia','inr']},
    {key:'pneumologia',label:'Pneumologia',spec:['pneumolog'],keywords:['pneumolog','polmon','respirator','spirometr','bronch','asma','bpco'],labs:['emogas','d dimero']},
    {key:'neurologia',label:'Neurologia',spec:['neurolog'],keywords:['neurolog','encefal','cerebr','emicran','epiless','neuropat','elettromiograf','eeg'],labs:[]},
    {key:'reumatologia',label:'Reumatologia',spec:['reumatolog'],keywords:['reumatolog','artrit','autoimmun','connettivit','lupus','vasculit'],labs:['pcr','ves','ana','ena','fattore reumatoide','anticcp']},
    {key:'oncologia',label:'Oncologia',spec:['oncolog'],keywords:['oncolog','tumor','neoplas','chemioterap','radioterap'],labs:[]},
    {key:'urologia',label:'Urologia',spec:['urolog'],keywords:['urolog','prostat','vescic','urinari','renale','psa'],labs:['psa','esame urine','urinocoltura']},
    {key:'ginecologia',label:'Ginecologia',spec:['ginecolog'],keywords:['ginecolog','uter','ovar','pap test','hpv','mamm'],labs:[]},
    {key:'dermatologia',label:'Dermatologia',spec:['dermatolog'],keywords:['dermatolog','cute','pelle','nevo','melanoma','dermatit'],labs:[]},
    {key:'ortopedia',label:'Ortopedia',spec:['ortoped'],keywords:['ortoped','articol','osseo','frattur','colonna','ginocchio','anca','spalla'],labs:[]},
    {key:'oculistica',label:'Oculistica',spec:['oculist','oftalmolog'],keywords:['oculist','oftalmolog','retin','occhio','glaucoma','cataratta'],labs:[]},
    {key:'otorinolaringoiatria',label:'Otorinolaringoiatria',spec:['otorinolaring','orl'],keywords:['otorinolaring','orecchio','udito','audiometr','sinus','laringe'],labs:[]},
    {key:'medicina-interna',label:'Medicina interna',spec:['medicina interna','internist'],keywords:['medicina interna','internist'],labs:[]}
  ];
  let visitDraftProfileV9='';
  let visitDraftV9=null;

  function visitDraftStorageKeyV9(){return `clinicaDigitaleVisitPrepV9:${state.activeProfileId||'none'}`;}
  function visitDefaultDraftV9(){return{specialtyKey:'',specialtyLabel:'',conditionId:'',visitDate:today(),medicationWindowDays:10,pdfLayout:'compact',requests:[],manualDocIds:[],suggestedDocIds:[],excludedDirectDocIds:[]};}
  function visitLoadDraftV9(){
    if(visitDraftProfileV9===state.activeProfileId&&visitDraftV9)return visitDraftV9;
    visitDraftProfileV9=state.activeProfileId||'';let saved=null;
    try{saved=JSON.parse(localStorage.getItem(visitDraftStorageKeyV9())||'null');}catch(_){saved=null;}
    visitDraftV9={...visitDefaultDraftV9(),...(saved&&typeof saved==='object'?saved:{})};
    for(const key of ['requests','manualDocIds','suggestedDocIds','excludedDirectDocIds'])if(!Array.isArray(visitDraftV9[key]))visitDraftV9[key]=[];
    visitDraftV9.medicationWindowDays=Math.max(1,Math.min(10,Number(visitDraftV9.medicationWindowDays)||10));
    if(!['compact','one-per-page'].includes(visitDraftV9.pdfLayout))visitDraftV9.pdfLayout='compact';
    return visitDraftV9;
  }
  function visitSaveDraftV9(){if(!visitDraftV9)return;localStorage.setItem(visitDraftStorageKeyV9(),JSON.stringify(visitDraftV9));}
  function visitResetDraftV9(){visitDraftV9=visitDefaultDraftV9();visitSaveDraftV9();renderPrepareVisit();}
  function visitTextHasAnyV9(text='',needles=[]){const n=normalizedWords(text);return (needles||[]).some(x=>{const q=normalizedWords(x);return q&&n.includes(q);});}
  function visitSpecialtyConfigV9(key='',label=''){
    const standard=VISIT_SPECIALTIES_V9.find(x=>x.key===key);if(standard)return standard;
    const normalized=normalizedWords(label||String(key).replace(/^custom:/,''));return{key,label:label||normalized,spec:[normalized],keywords:[normalized],labs:[]};
  }
  function visitSpecialtyOptionsV9(){
    const rows=VISIT_SPECIALTIES_V9.map(x=>({...x}));const seen=new Set(rows.flatMap(x=>[normalizedWords(x.label),...(x.spec||[]).map(normalizedWords)]).filter(Boolean));
    const add=(raw)=>{const label=String(raw||'').replace(/\s+/g,' ').trim();const n=normalizedWords(label);if(!label||n.length<4||seen.has(n))return;if(/^(?:specialista|medico|medico specialista|documento sanitario)$/.test(n))return;seen.add(n);rows.push({key:`custom:${n}`,label,spec:[n],keywords:[n],labs:[]});};
    state.documents.forEach(d=>{add(d.specialization);add(d.department);});state.doctors.forEach(d=>add(d.role));
    const fixed=rows.filter(x=>!String(x.key).startsWith('custom:'));const custom=rows.filter(x=>String(x.key).startsWith('custom:')).sort((a,b)=>a.label.localeCompare(b.label,'it',{sensitivity:'base'}));return[...fixed,...custom];
  }
  function visitDocIsLabV9(doc={}){const n=normalizedWords(`${doc.documentMode||''} ${doc.category||''} ${doc.documentKind||''}`);return doc.documentMode==='lab'||doc.documentMode==='mixed'||n.includes('esami di laboratorio')||n.includes('laboratorio analisi');}
  function visitDocBucketV9(doc={}){
    if(visitDocIsLabV9(doc))return'lab';
    if(isSpecialistVisitDocument(doc)||visitTextHasAnyV9(`${doc.category||''} ${doc.documentKind||''}`,['visita specialistica','visita medica']))return'visit';
    const t=normalizedWords(`${doc.title||''} ${doc.category||''} ${doc.documentKind||''}`);
    if(/gastroscop|colonscop|endoscop|ecograf|ecocardi|elettrocard|\becg\b|holter|tac|tomograf|risonanza|\brmn\b|radiograf|spirometr|elettromiograf|\beeg\b|mammograf/.test(t))return'instrumental';
    if(/ricovero|dimission|pronto soccorso|verbale ps/.test(t))return'hospital';
    if(/referto|certificat|relazione|lettera/.test(t)||['narrative','mixed'].includes(doc.documentMode))return'report';
    return'other';
  }
  function visitDiagnosisSourceIdsV9(diagnosis={}){const ids=new Set();if(diagnosis.sourceDocumentId)ids.add(String(diagnosis.sourceDocumentId));for(const e of diagnosis.history||[])if(e?.sourceDocumentId)ids.add(String(e.sourceDocumentId));return ids;}
  function visitDirectReasonV9(doc={},draft=visitLoadDraftV9()){
    const condition=state.diagnoses.find(x=>String(x.id)===String(draft.conditionId||''));
    if(condition){
      if(visitDiagnosisSourceIdsV9(condition).has(String(doc.id)))return`Collegato direttamente a “${condition.name}”`;
      const wanted=diagnosisCanonicalKey(condition.name||'');
      if(wanted&&(doc.extractedDiagnoses||[]).some(x=>diagnosisCanonicalKey(x?.name||x?.condition||'')===wanted))return`Condizione “${condition.name}” riconosciuta nel referto`;
    }
    if(!draft.specialtyKey||draft.specialtyKey==='medico-base')return'';
    const cfg=visitSpecialtyConfigV9(draft.specialtyKey,draft.specialtyLabel);const structured=`${doc.specialization||''} ${doc.department||''}`;
    if(visitTextHasAnyV9(structured,cfg.spec))return`Specialità del documento: ${doc.specialization||doc.department}`;
    if(isSpecialistVisitDocument(doc)&&visitTextHasAnyV9(`${doc.title||''} ${doc.documentKind||''} ${doc.category||''}`,cfg.spec))return`Visita identificata come ${cfg.label}`;
    if((doc.extractedDiagnoses||[]).some(x=>visitTextHasAnyV9(`${x?.name||''} ${x?.condition||''}`,cfg.keywords)))return`Patologia riconosciuta nel referto e collegabile a ${cfg.label}`;
    const linkedDiagnosis=state.diagnoses.find(d=>visitDiagnosisSourceIdsV9(d).has(String(doc.id))&&visitTextHasAnyV9(`${d.name||''} ${d.specialization||''}`,cfg.keywords));
    if(linkedDiagnosis)return`Documento già collegato a “${linkedDiagnosis.name}”`;
    return'';
  }
  function visitSuggestionInfoV9(doc={},draft=visitLoadDraftV9(),latestLabIds=new Set()){
    if(visitDirectReasonV9(doc,draft))return null;
    const reasons=[];let score=0;const condition=state.diagnoses.find(x=>String(x.id)===String(draft.conditionId||''));
    const cfg=visitSpecialtyConfigV9(draft.specialtyKey,draft.specialtyLabel);
    const compact=`${doc.title||''} ${doc.category||''} ${doc.documentKind||''} ${doc.specialization||''} ${doc.department||''} ${doc.facility||''} ${doc.doctor||''}`;
    const full=`${compact} ${String(doc.reconstructedText||doc.structuredText||doc.extractedText||'').slice(0,180000)}`;
    if(condition){const tokens=normalizedWords(condition.name||'').split(' ').filter(x=>x.length>=4);if(tokens.length&&tokens.every(t=>normalizedWords(full).includes(t))){score+=95;reasons.push(`Riferimento testuale a “${condition.name}”`);}}
    if(draft.specialtyKey&&draft.specialtyKey!=='medico-base'){
      if(visitTextHasAnyV9(compact,cfg.keywords)){score+=70;reasons.push(`Contenuto collegabile a ${cfg.label}`);}
      if(visitDocIsLabV9(doc)){
        const labs=(doc.labValues||[]).map(v=>`${v.parameterName||''} ${v.test||''} ${v.parameterId||''}`).join(' ');
        if(visitTextHasAnyV9(labs,cfg.labs)){score+=90;reasons.push(`Esami ematici con parametri utili per ${cfg.label}`);}
        if(visitTextHasAnyV9(`${doc.department||''} ${doc.specialization||''} ${doc.facility||''}`,cfg.spec)){score+=80;reasons.push('Prelievo eseguito nel reparto o nella specialità selezionata');}
      }
    }
    if(visitDocIsLabV9(doc)&&latestLabIds.has(String(doc.id))){score+=35;reasons.push('Tra gli ultimi prelievi ematici disponibili');}
    if(!score)return null;return{doc,score,reasons:[...new Set(reasons)]};
  }
  function visitCollectionV9(draft=visitLoadDraftV9()){
    const direct=[];for(const doc of state.documents){const reason=visitDirectReasonV9(doc,draft);if(reason)direct.push({doc,reason});}
    direct.sort((a,b)=>String(b.doc.clinicalDate||'').localeCompare(String(a.doc.clinicalDate||'')));
    if(draft.specialtyKey==='medico-base'){
      const cutoff=/^\d{4}-\d{2}-\d{2}$/.test(draft.visitDate||'')?draft.visitDate:today();
      const suggested=[...state.documents].filter(d=>d.timelineVisible!==false&&d.clinicalDate&&String(d.clinicalDate)<=cutoff).sort((a,b)=>String(b.clinicalDate||'').localeCompare(String(a.clinicalDate||''))).slice(0,4).map((doc,i)=>({doc,score:100-i,reasons:['Tra gli ultimi 4 eventi clinici registrati']}));
      const suggestedIds=new Set(suggested.map(x=>String(x.doc.id)));const manual=state.documents.filter(d=>(draft.manualDocIds||[]).includes(String(d.id))&&!suggestedIds.has(String(d.id))).sort((a,b)=>String(b.clinicalDate||'').localeCompare(String(a.clinicalDate||'')));
      return{direct:[],suggested,manual};
    }
    const latestLabs=[...state.documents].filter(visitDocIsLabV9).sort((a,b)=>String(b.clinicalDate||'').localeCompare(String(a.clinicalDate||''))).slice(0,5);const latestIds=new Set(latestLabs.map(x=>String(x.id)));
    const suggested=state.documents.map(doc=>visitSuggestionInfoV9(doc,draft,latestIds)).filter(Boolean).sort((a,b)=>b.score-a.score||String(b.doc.clinicalDate||'').localeCompare(String(a.doc.clinicalDate||''))).slice(0,30);
    const directIds=new Set(direct.map(x=>String(x.doc.id))),suggestedIds=new Set(suggested.map(x=>String(x.doc.id)));const manual=state.documents.filter(d=>(draft.manualDocIds||[]).includes(String(d.id))&&!directIds.has(String(d.id))&&!suggestedIds.has(String(d.id))).sort((a,b)=>String(b.clinicalDate||'').localeCompare(String(a.clinicalDate||'')));
    return{direct,suggested,manual};
  }
  function visitSelectedDocIdsV9(draft=visitLoadDraftV9(),collection=visitCollectionV9(draft)){
    const ids=new Set((draft.manualDocIds||[]).map(String));(draft.suggestedDocIds||[]).forEach(x=>ids.add(String(x)));const excluded=new Set((draft.excludedDirectDocIds||[]).map(String));for(const row of collection.direct)if(!excluded.has(String(row.doc.id)))ids.add(String(row.doc.id));return ids;
  }
  function visitSelectedDocumentsV9(draft=visitLoadDraftV9(),collection=visitCollectionV9(draft)){const ids=visitSelectedDocIdsV9(draft,collection);return state.documents.filter(d=>ids.has(String(d.id))).sort((a,b)=>String(a.clinicalDate||'9999').localeCompare(String(b.clinicalDate||'9999')));}
  function visitDateAddDaysV9(value='',days=0){if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return'';const d=new Date(`${value}T12:00:00`);if(Number.isNaN(d.getTime()))return'';d.setDate(d.getDate()+Number(days||0));return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
  function visitMedicationCandidatesV9(draft=visitLoadDraftV9()){
    if(draft.specialtyKey!=='medico-base'||!/^\d{4}-\d{2}-\d{2}$/.test(draft.visitDate||''))return[];
    const preferenceDays=Math.max(0,Math.min(10,Number(state.globalPreferences?.medicationReorderGroupDays??7)));const end=visitDateAddDaysV9(draft.visitDate,preferenceDays);const byStock=new Map();
    const agendaRows=(state.calendarEvents||[]).filter(x=>(x.sourceKind==='therapy-reorder'||x.medicationReorder===true)&&(x.status||'planned')==='planned'&&String(x.startDate||'')>=draft.visitDate&&String(x.startDate||'')<=end);
    for(const event of agendaRows){const items=Array.isArray(event.medicationReorderItems)&&event.medicationReorderItems.length?event.medicationReorderItems:(event.medicationNames||[]).map((name,i)=>({stockKey:`agenda:${event.id}:${i}`,medication:name,reorderDate:event.startDate,depletionDate:''}));for(const raw of items){const row={...raw,medication:raw.medication||'Farmaco',reorderDate:raw.reorderDate||event.startDate||'',depletionDate:raw.depletionDate||''};const key=String(raw.stockKey||raw.therapyId||row.medication).toLowerCase();if(!byStock.has(key)||String(row.reorderDate)<String(byStock.get(key).reorderDate))byStock.set(key,row);}}
    if(byStock.size)return[...byStock.values()].sort((a,b)=>String(a.reorderDate).localeCompare(String(b.reorderDate))||String(a.medication).localeCompare(String(b.medication),'it'));
    for(const c of medicationReorderStockCandidates(state.therapies||[],today())){const when=String(c.reorderDate||'');if(!when||when<draft.visitDate||when>end)continue;const key=String(c.stockKey||c.therapyId||c.medication);if(!byStock.has(key)||String(c.reorderDate)<String(byStock.get(key).reorderDate))byStock.set(key,c);}
    return[...byStock.values()].sort((a,b)=>String(a.reorderDate).localeCompare(String(b.reorderDate))||String(a.medication).localeCompare(String(b.medication),'it'));
  }

  async function visitFamilyMedicationCandidatesV26(draft=visitLoadDraftV9()){
    if(draft.specialtyKey!=='medico-base'||!/^\d{4}-\d{2}-\d{2}$/.test(draft.visitDate||''))return[];
    const preferenceDays=Math.max(0,Math.min(10,Number(state.globalPreferences?.medicationReorderGroupDays??7)));
    const end=visitDateAddDaysV9(draft.visitDate,preferenceDays),byStock=new Map();
    let family={profiles:[activeProfile()].filter(Boolean),events:state.calendarEvents||[]};
    try{family=await loadFamilyAgendaContext();}catch(_){ }
    const allowedProfiles=(family.profiles||[]).filter(p=>String(p.id||'')===String(state.activeProfileId||'')||calendarCanManageProfile(p.id,'medications'));
    const allowedIds=new Set(allowedProfiles.map(p=>String(p.id||'')));
    const addRow=(raw={},profileId='',fallbackDate='')=>{
      profileId=String(profileId||state.activeProfileId||'');if(!allowedIds.has(profileId))return;
      const row={...raw,profileId,profileName:calendarProfileName(profileId),profileColor:calendarProfileColor(profileId),medication:raw.medication||'Farmaco',reorderDate:raw.reorderDate||fallbackDate||'',depletionDate:raw.depletionDate||''};
      if(!row.reorderDate||row.reorderDate<draft.visitDate||row.reorderDate>end)return;
      const key=`${profileId}|${String(raw.stockKey||raw.therapyId||row.medication).toLowerCase()}`;
      if(!byStock.has(key)||String(row.reorderDate)<String(byStock.get(key).reorderDate))byStock.set(key,row);
    };
    const agendaRows=(family.events||[]).filter(x=>(x.sourceKind==='therapy-reorder'||x.medicationReorder===true)&&(x.status||'planned')==='planned'&&String(x.startDate||'')>=draft.visitDate&&String(x.startDate||'')<=end);
    for(const event of agendaRows){const items=Array.isArray(event.medicationReorderItems)&&event.medicationReorderItems.length?event.medicationReorderItems:(event.medicationNames||[]).map((name,i)=>({stockKey:`agenda:${event.id}:${i}`,medication:name,reorderDate:event.startDate,depletionDate:''}));for(const raw of items)addRow(raw,event.profileId,event.startDate);}
    for(const profile of allowedProfiles){let therapies=[];try{therapies=String(profile.id)===String(state.activeProfileId)?(state.therapies||[]):await DossierDB.byProfile('therapies',profile.id);}catch(_){therapies=[];}for(const c of medicationReorderStockCandidates(therapies,today()))addRow(c,profile.id,c.reorderDate);}
    return[...byStock.values()].sort((a,b)=>String(a.reorderDate).localeCompare(String(b.reorderDate))||String(a.profileName).localeCompare(String(b.profileName),'it')||String(a.medication).localeCompare(String(b.medication),'it'));
  }

  function visitDocLineV9(doc={}){return`${formatDate(doc.clinicalDate)} · ${esc(doc.documentKind||doc.category||'Documento sanitario')}${doc.specialization||doc.department?` · ${esc(doc.specialization||doc.department)}`:''}${doc.doctor?` · ${esc(doc.doctor)}`:''}${doc.facility?` · ${esc(doc.facility)}`:''}`;}
  function visitDocChoiceHtmlV9(row,type,draft){const doc=row.doc||row;const id=String(doc.id);const checked=type==='direct'?!(draft.excludedDirectDocIds||[]).includes(id):type==='suggested'?(draft.suggestedDocIds||[]).includes(id):true;const reason=type==='direct'?row.reason:type==='suggested'?(row.reasons||[]).join(' · '):'Aggiunto manualmente dal Dossier';return`<article class="visit-doc-choice"><label class="check-row"><input type="checkbox" data-visit-doc-type="${type}" data-visit-doc-id="${esc(id)}" ${checked?'checked':''}><span><strong>${esc(doc.title||doc.originalName||'Documento')}</strong><small>${visitDocLineV9(doc)}</small></span></label><p class="visit-match-reason">${esc(reason)}</p><button type="button" class="btn btn-light btn-small" data-action="view-doc" data-id="${esc(id)}">Apri documento</button></article>`;}
  function visitConditionOptionsV9(selected=''){return`<option value="">Tutta la specialità / nessuna patologia specifica</option>${[...state.diagnoses].sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'it',{sensitivity:'base'})).map(d=>`<option value="${esc(d.id)}" ${String(d.id)===String(selected)?'selected':''}>${esc(d.name||'Condizione')} ${d.specialization?`· ${esc(d.specialization)}`:''}</option>`).join('')}`;}

  async function renderPrepareVisit(){
    const draft=visitLoadDraftV9(),options=visitSpecialtyOptionsV9();if(draft.specialtyKey&&!options.some(x=>x.key===draft.specialtyKey)){draft.specialtyKey='';draft.specialtyLabel='';visitSaveDraftV9();}
    const selectedOption=options.find(x=>x.key===draft.specialtyKey);if(selectedOption)draft.specialtyLabel=selectedOption.label;
    const collection=visitCollectionV9(draft),selectedDocs=visitSelectedDocumentsV9(draft,collection),isBase=draft.specialtyKey==='medico-base',meds=isBase?await visitFamilyMedicationCandidatesV26(draft):[];
    const prefDays=Math.max(0,Math.min(10,Number(state.globalPreferences?.medicationReorderGroupDays??7)));
    const reqHtml=(draft.requests||[]).length?`<div class="visit-request-list">${draft.requests.map(r=>`<div class="visit-request-row"><div>${calendarProfilePill(r.profileId||state.activeProfileId,'compact')}<span class="badge">${esc(r.type||'Richiesta')}</span><strong>${esc(r.text||'')}</strong></div><button type="button" class="btn btn-ghost btn-small" data-visit-remove-request="${esc(r.id)}">Rimuovi</button></div>`).join('')}</div>`:'<div class="notice">Nessuna richiesta inserita.</div>';
    const medHtml=isBase?`<section class="card visit-block visit-medications-card"><div class="card-title-row"><div><h3>Farmaci da richiedere</h3><p class="kpi-note">Proposte familiari calcolate usando la finestra di ${prefDays} ${prefDays===1?'giorno':'giorni'} impostata nelle Preferenze. Ogni voce mantiene il proprio titolare.</p></div><span class="badge warning">${meds.length}</span></div>${meds.length?`<div class="visit-medication-list">${meds.map(m=>`<div class="visit-medication-row"><span class="visit-med-icon medication-semantic-icon">${uiIconSvg('therapy')}</span><div class="visit-medication-main">${calendarProfilePill(m.profileId,'compact')}<h3>${esc(m.medication)}</h3><p>Richiesta prevista ${formatDate(m.reorderDate)} · scorta stimata fino al ${formatDate(m.depletionDate)}</p></div><span class="badge warning">Da richiedere</span></div>`).join('')}</div>`:'<div class="notice success">Nessun farmaco da richiedere nel periodo previsto dalle Preferenze.</div>'}</section>`:'';
    $('#viewContainer').innerHTML=`<div class="visit-prep-page visit-prep-modern">
      <section class="card visit-hero"><div><h2>Prepara una visita</h2><p>Raccogli documenti, richieste e farmaci utili per la visita.</p></div><div class="visit-hero-count"><strong>${selectedDocs.length}</strong><span>documenti selezionati</span></div></section>
      <section class="card visit-config-card"><div class="form-grid visit-config-grid"><div class="form-group"><label>Tipo di visita</label><select id="visitSpecialty" class="form-control"><option value="">Seleziona la visita</option>${options.map(x=>`<option value="${esc(x.key)}" ${x.key===draft.specialtyKey?'selected':''}>${esc(x.label)}</option>`).join('')}</select></div><div class="form-group"><label>Data prevista</label><input id="visitDate" type="date" class="form-control" value="${esc(draft.visitDate||today())}"></div>${!isBase?`<div class="form-group span-2"><label>Patologia o condizione specifica</label><select id="visitCondition" class="form-control" ${draft.specialtyKey?'':'disabled'}>${visitConditionOptionsV9(draft.conditionId)}</select><small>Se la scegli, i documenti già collegati alla condizione entrano automaticamente nel fascicolo.</small></div>`:''}</div></section>
      ${draft.specialtyKey?`<div class="visit-prep-columns"><div class="visit-prep-column"><section class="card visit-block"><div class="card-title-row"><div><h3>Documenti associati</h3><p class="kpi-note">Documenti già collegati direttamente alla specialità o alla condizione.</p></div><span class="badge success">${collection.direct.length}</span></div>${collection.direct.length?`<div class="visit-doc-grid">${collection.direct.map(r=>visitDocChoiceHtmlV9(r,'direct',draft)).join('')}</div>`:'<div class="notice">Nessun documento risulta già associato in modo diretto.</div>'}</section><section class="card visit-block"><div class="card-title-row"><div><h3>Altri documenti scelti da te</h3><p class="kpi-note">Aggiungi manualmente altri documenti dal Dossier.</p></div><button type="button" class="btn btn-primary" id="visitAddDocumentsBtn">Aggiungi dal Dossier</button></div>${collection.manual.length?`<div class="visit-doc-grid">${collection.manual.map(d=>visitDocChoiceHtmlV9(d,'manual',draft)).join('')}</div>`:'<div class="notice">Nessun documento aggiunto manualmente.</div>'}</section>${medHtml}</div><div class="visit-prep-column"><section class="card visit-block"><div class="card-title-row"><div><h3>Documenti proposti</h3><p class="kpi-note">${isBase?'Gli ultimi 4 eventi clinici avvenuti, indipendentemente dal tipo di documento.':'Documenti pertinenti alla specializzazione selezionata.'}</p></div><span class="badge">${collection.suggested.length}</span></div>${collection.suggested.length?`<div class="visit-doc-grid">${collection.suggested.map(r=>visitDocChoiceHtmlV9(r,'suggested',draft)).join('')}</div>`:'<div class="notice">Nessuna proposta ulteriore per i criteri scelti.</div>'}</section><section class="card visit-block"><div class="card-title-row"><div><h3>Cose da chiedere</h3><p class="kpi-note">Ricette, impegnative, domande o richieste specifiche.</p></div></div><div class="visit-request-entry"><select id="visitRequestType" class="form-control"><option>Richiesta</option><option>Ricetta per visita specialistica</option><option>Ricetta per esami</option><option>Domanda al medico</option><option>Promemoria</option><option>Altro</option></select><input id="visitRequestText" class="form-control" placeholder="Es. richiedere impegnativa per visita cardiologica"><button type="button" class="btn btn-primary" id="visitAddRequestBtn">Aggiungi</button></div>${reqHtml}</section></div></div>
      <section class="card visit-export-card"><div class="visit-export-copy"><h3>Fascicolo visita</h3><p class="kpi-note">Riepilogo, richieste, farmaci pertinenti e documenti selezionati.</p></div><div class="visit-pdf-layout"><label for="visitPdfLayout">Impaginazione PDF</label><select id="visitPdfLayout" class="form-control"><option value="compact" ${draft.pdfLayout!=='one-per-page'?'selected':''}>Compatto · più esami per pagina</option><option value="one-per-page" ${draft.pdfLayout==='one-per-page'?'selected':''}>Un esame per pagina</option></select><small>Questa scelta vale solo per il fascicolo della visita.</small></div><div class="row-actions"><button type="button" class="btn btn-light" id="visitExternalExportBtn" ${selectedDocs.length||draft.requests.length||meds.length?'':'disabled'}>Esporta su memoria esterna</button><button type="button" class="btn btn-light" id="visitExportOriginalsBtn" ${selectedDocs.some(d=>d.fileBlob)?'':'disabled'}>Esporta originali ZIP</button><button type="button" class="btn btn-primary" id="visitPrintBtn" ${selectedDocs.length||draft.requests.length||meds.length?'':'disabled'}>Stampa / Salva PDF</button><button type="button" class="btn btn-ghost" id="visitResetBtn">Azzera preparazione</button></div></section>`:'<section class="card"><div class="notice">Seleziona prima il tipo di visita. I documenti originali non verranno modificati.</div></section>'}
    </div>`;
    $('#visitSpecialty')?.addEventListener('change',e=>{const opt=options.find(x=>x.key===e.target.value);draft.specialtyKey=e.target.value;draft.specialtyLabel=opt?.label||'';draft.conditionId='';draft.suggestedDocIds=[];draft.excludedDirectDocIds=[];visitSaveDraftV9();renderPrepareVisit();});
    $('#visitDate')?.addEventListener('change',e=>{draft.visitDate=e.target.value||today();visitSaveDraftV9();renderPrepareVisit();});
    $('#visitCondition')?.addEventListener('change',e=>{draft.conditionId=e.target.value;draft.suggestedDocIds=[];draft.excludedDirectDocIds=[];visitSaveDraftV9();renderPrepareVisit();});
    $$('[data-visit-doc-type]',$('#viewContainer')).forEach(box=>box.addEventListener('change',()=>{const id=String(box.dataset.visitDocId),type=box.dataset.visitDocType;if(type==='direct'){const set=new Set((draft.excludedDirectDocIds||[]).map(String));box.checked?set.delete(id):set.add(id);draft.excludedDirectDocIds=[...set];}else if(type==='suggested'){const set=new Set((draft.suggestedDocIds||[]).map(String));box.checked?set.add(id):set.delete(id);draft.suggestedDocIds=[...set];}visitSaveDraftV9();renderPrepareVisit();}));
    $('#visitAddDocumentsBtn')?.addEventListener('click',openVisitDocumentPickerV9);$('#visitAddRequestBtn')?.addEventListener('click',()=>{const text=$('#visitRequestText')?.value.trim();if(!text)return toast('Scrivi la richiesta da aggiungere');draft.requests.push({id:uid('visitreq'),profileId:state.activeProfileId,type:$('#visitRequestType')?.value||'Richiesta',text});visitSaveDraftV9();renderPrepareVisit();});$('#visitRequestText')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();$('#visitAddRequestBtn')?.click();}});$$('[data-visit-remove-request]',$('#viewContainer')).forEach(btn=>btn.addEventListener('click',()=>{draft.requests=draft.requests.filter(x=>String(x.id)!==String(btn.dataset.visitRemoveRequest));visitSaveDraftV9();renderPrepareVisit();}));$('#visitPdfLayout')?.addEventListener('change',e=>{draft.pdfLayout=e.target.value==='one-per-page'?'one-per-page':'compact';visitSaveDraftV9();});$('#visitPrintBtn')?.addEventListener('click',()=>void printVisitPreparationV9());$('#visitExternalExportBtn')?.addEventListener('click',()=>void openVisitExternalExportV10());$('#visitExportOriginalsBtn')?.addEventListener('click',()=>void exportVisitOriginalsV9());$('#visitResetBtn')?.addEventListener('click',()=>{if(confirm('Azzerare la preparazione corrente? I documenti nel Dossier non verranno modificati.'))visitResetDraftV9();});bindViewActions($('#viewContainer'));
  }

  function openVisitDocumentPickerV9(){
    const draft=visitLoadDraftV9();openModal('Aggiungi documenti alla visita','Seleziona una categoria e poi uno o più documenti già presenti nel Dossier.',`<div class="visit-picker"><div class="search-row"><select id="visitPickerCategory" class="form-control"><option value="all">Tutti i documenti</option><option value="lab">Esami di laboratorio</option><option value="visit">Visite specialistiche</option><option value="report">Referti diagnostici</option><option value="instrumental">Esami strumentali</option><option value="hospital">Ricoveri / Pronto soccorso</option><option value="other">Documenti generici</option></select><input id="visitPickerSearch" class="form-control" placeholder="Cerca per titolo, medico, struttura o data"></div><div id="visitPickerResults"></div><div class="form-actions sticky-actions"><button type="button" class="btn btn-light" id="visitPickerCancel">Annulla</button><button type="button" class="btn btn-primary" id="visitPickerSave">Aggiungi selezionati</button></div></div>`);
    const render=()=>{const cat=$('#visitPickerCategory')?.value||'all',q=normalizedWords($('#visitPickerSearch')?.value||'');const tokens=q.split(' ').filter(Boolean);const rows=[...state.documents].filter(d=>(cat==='all'||visitDocBucketV9(d)===cat)&&(!tokens.length||tokens.every(t=>normalizedWords(`${d.title||''} ${d.originalName||''} ${d.documentKind||''} ${d.category||''} ${d.specialization||''} ${d.department||''} ${d.doctor||''} ${d.facility||''} ${d.clinicalDate||''}`).includes(t)))).sort((a,b)=>String(b.clinicalDate||'').localeCompare(String(a.clinicalDate||'')));const selected=new Set((draft.manualDocIds||[]).map(String));$('#visitPickerResults').innerHTML=rows.length?`<div class="visit-picker-list">${rows.map(d=>`<label class="visit-picker-row"><input type="checkbox" data-visit-picker-id="${esc(d.id)}" ${selected.has(String(d.id))?'checked':''}><span><strong>${esc(d.title||d.originalName||'Documento')}</strong><small>${visitDocLineV9(d)}</small></span></label>`).join('')}</div>`:'<div class="notice">Nessun documento corrisponde ai filtri.</div>';};
    $('#visitPickerCategory').onchange=render;$('#visitPickerSearch').oninput=render;$('#visitPickerCancel').onclick=closeModal;$('#visitPickerSave').onclick=()=>{draft.manualDocIds=$$('[data-visit-picker-id]',$('#visitPickerResults')).filter(x=>x.checked).map(x=>String(x.dataset.visitPickerId));visitSaveDraftV9();closeModal();renderPrepareVisit();};render();
  }

  function visitSummaryTextV9(draft,docs,meds){
    const profile=activeProfile()||{},condition=state.diagnoses.find(x=>String(x.id)===String(draft.conditionId||''));const lines=[`PREPARAZIONE VISITA: ${draft.specialtyLabel||'Visita'}`,`Paziente: ${`${profile.firstName||''} ${profile.lastName||''}`.trim()}`,`Data visita: ${draft.visitDate?formatDate(draft.visitDate):'Non definita'}`];if(condition)lines.push(`Patologia/condizione: ${condition.name}`);lines.push('',`Documenti selezionati: ${docs.length}`,...docs.map(d=>`- ${d.clinicalDate?formatDate(d.clinicalDate):'Data non definita'} | ${d.title||d.originalName||'Documento'}`));if((draft.requests||[]).length)lines.push('','Cose da chiedere:',...draft.requests.map(r=>`- ${calendarProfileName(r.profileId||state.activeProfileId)} | ${r.type}: ${r.text}`));if(meds.length)lines.push('','Farmaci da richiedere:',...meds.map(m=>`- ${m.profileName||calendarProfileName(m.profileId)} | ${m.medication} | richiesta prevista ${formatDate(m.reorderDate)} | scorta stimata fino al ${formatDate(m.depletionDate)}`));return lines.join('\r\n');
  }
  async function exportVisitOriginalsV9(){
    const draft=visitLoadDraftV9(),collection=visitCollectionV9(draft),docs=visitSelectedDocumentsV9(draft,collection),meds=await visitFamilyMedicationCandidatesV26(draft);const originals=docs.filter(d=>d.fileBlob);if(!originals.length)return toast('Nessun file originale disponibile tra i documenti selezionati');if(typeof JSZip==='undefined')return toast('Modulo ZIP non disponibile');
    const auditProfile=activeProfile();if(auditProfile)void DossierDB.addAudit('export','profiles',auditProfile.id,auditProfile.id,{event:'prepare-visit-originals',documentCount:originals.length}).catch(()=>{});const zip=new JSZip();zip.file('RIEPILOGO_VISITA.txt',visitSummaryTextV9(draft,docs,meds));const used=new Set();for(const doc of originals){let name=originalDocumentFileName(doc).replace(/[\\/:*?"<>|]+/g,'_');let base=name,idx=2;while(used.has(name.toLowerCase())){const dot=base.lastIndexOf('.');name=dot>0?`${base.slice(0,dot)}_${idx++}${base.slice(dot)}`:`${base}_${idx++}`;}used.add(name.toLowerCase());zip.file(`documenti/${name}`,doc.fileBlob);}const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:6}});const p=activeProfile()||{};downloadBlob(blob,`Fascicolo_visita_${slug(draft.specialtyLabel||'visita')}_${slug(`${p.firstName||''}_${p.lastName||''}`)}_${draft.visitDate||today()}.zip`);toast('Fascicolo con documenti originali esportato');
  }
  function visitExternalSafeNameV10(value='file'){
    const text=String(value||'file').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[\\/:*?"<>|]+/g,'_').replace(/\s+/g,' ').trim().replace(/[ .]+$/g,'');
    return (text||'file').slice(0,120);
  }
  async function visitExternalUploadV10(session,path,data){
    const body=data instanceof Blob?data:new Blob([String(data)],{type:/\.html$/i.test(path)?'text/html;charset=utf-8':'text/plain;charset=utf-8'});
    const response=await fetch('http://127.0.0.1:8896/api/doctor-export/file',{method:'POST',headers:{'X-Doctor-Export-Id':session.exportId,'X-Relative-Path':path,'X-Optimize-Medical':'0','Content-Type':body.type||'application/octet-stream'},body,cache:'no-store'});
    let result={};try{result=await response.json();}catch{}
    if(!response.ok||result.ok===false)throw new Error(result.error||`Scrittura non riuscita (${response.status})`);
    return result;
  }
  async function visitExternalPdfV10(session,html){
    const response=await fetch('http://127.0.0.1:8896/api/visit-export/pdf',{method:'POST',headers:{'X-Doctor-Export-Id':session.exportId,'X-Relative-Path':'Riepilogo_visita.pdf','Content-Type':'text/html;charset=utf-8'},body:new Blob([html],{type:'text/html;charset=utf-8'}),cache:'no-store'});
    let result={};try{result=await response.json();}catch{}
    if(!response.ok||result.ok===false)throw new Error(result.error||`Creazione PDF non riuscita (${response.status})`);
    return result;
  }
  async function visitPrintableHtmlV10(draft,selected,meds,p){
    const condition=state.diagnoses.find(x=>String(x.id)===String(draft.conditionId||''));
    const docs=globalThis.HealthExtractors?.prepareDocuments24?HealthExtractors.prepareDocuments24(selected,p):selected;
    const root=$('#printRoot'),spaceSaving=draft.pdfLayout!=='one-per-page';
    root.className='print-root visit-print-root';root.classList.toggle('print-space-saving',spaceSaving);root.dataset.spaceSaving=spaceSaving?'true':'false';
    const req=(draft.requests||[]).map(r=>`<li><strong>${esc(r.type||'Richiesta')}:</strong> ${esc(r.text||'')}</li>`).join('');
    const medsHtml=meds.map(m=>`<tr><td><strong>${esc(m.profileName||calendarProfileName(m.profileId))}</strong></td><td><strong>${esc(m.medication)}</strong></td><td>${formatDate(m.reorderDate)}</td><td>${formatDate(m.depletionDate)}</td></tr>`).join('');
    const indexRows=docs.map((d,i)=>`<tr><td>${i+1}</td><td>${formatDate(d.clinicalDate)}</td><td><strong>${esc(d.title||d.originalName||'Documento')}</strong><br>${esc([d.documentKind||d.category,d.specialization||d.department,d.doctor,d.facility].filter(Boolean).join(' · '))}</td></tr>`).join('');
    root.innerHTML=`<section class="print-page print-cover visit-print-cover modern-pdf-cover modern-pdf-cover-visit"><div class="modern-cover-topline"><p class="modern-cover-kicker">Sintesi per consulto</p><p class="modern-cover-motto">Ascolto<br>prevenzione<br>percorso</p></div><div class="modern-cover-title"><h1>Prepara la visita</h1><p class="modern-cover-subtitle">Le informazioni essenziali per il tuo consulto.</p></div><div class="modern-cover-patient"><p class="modern-cover-label">Paziente</p><h2>${esc(p.firstName)} ${esc(p.lastName)}</h2><dl class="modern-cover-meta"><dt>Data di nascita</dt><dd>${formatDate(p.birthDate)}</dd><dt>Data prevista</dt><dd>${draft.visitDate?formatDate(draft.visitDate):'Non definita'}</dd><dt>Tipo visita</dt><dd>${esc(draft.specialtyLabel||'Visita')}</dd></dl></div><div class="modern-cover-summary">${condition?`<div class="modern-cover-visit-box"><small>Motivo / condizione</small><strong>${esc(condition.name)}</strong></div>`:''}<div><strong>${docs.length}</strong><span>documenti allegati</span></div><div><strong>${meds.length}</strong><span>farmaci da valutare</span></div><div><strong>${(draft.requests||[]).length}</strong><span>cose da chiedere</span></div></div><div class="modern-cover-product"><div><strong>Clinica Digitale - Dossier Sanitario</strong><span>Per maggiori informazioni e per scaricare gratuitamente il programma: <b>www.dossiersanitario.it</b></span></div><img class="modern-cover-qr" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAASgAAAEoAQAAAADDfFG0AAABfElEQVR42u2Zy27EMAwDOUX//5fZgyTn5d3tsQWYQxAYPA1omlawfvF8Kaqooorqr6m+JYn6tjAWFpKP1fC68ZKLGkLCksyxGl5PFTQgYyGfV8PrpcpCyJTJkl8fVOC2lgmvN/l1pmQ0Mebw2vNqN2GMZUxTC6/bg3dr+LoeXhcVq0sIakeash3h9VS5XYWwaUYg08EfXld/oaN2tbv6O/7a+qtoYQvmKlRrDq+nvyy3v7DVLQytQzK8rioAu5N/TgCtO2R4XfuXp1pgsZrEHJHhtekTrELf0xx3BUt+7fajzXlGoWNrJr9252OdhKacVsHf7/DanY/HdbFjyxKyk1+7+yOVU7g+q37R8+nwuvMqMjPZYb3XQCe8tvMJpqfOy+R/x6Z/jbXM/B66uS68Lrx0DrHKfp9u3+F159WskKu1TrO3kvdbXivrPaHWt8n0rzcq1HWV7vc4/X7rr/V/aDoXq4GF15MXy18zyddsR9InXvavJFNUUUX1j1Q/kVmgg2GquzYAAAAASUVORK5CYII=" alt="QR www.dossiersanitario.it"></div><p class="modern-cover-footer">Questo fascicolo per la visita è stato creato con Clinica Digitale - Dossier Sanitario. Da utilizzare come supporto per la visita medica.</p></section><section class="print-page print-section visit-print-summary"><h2>Promemoria per la visita</h2>${req?`<h3>Cose da chiedere</h3><ul class="visit-print-list">${req}</ul>`:'<p>Nessuna richiesta specifica inserita.</p>'}${meds.length?`<h3>Farmaci da richiedere</h3><table class="print-table"><thead><tr><th>Persona</th><th>Farmaco</th><th>Richiesta prevista</th><th>Scorta stimata fino al</th></tr></thead><tbody>${medsHtml}</tbody></table>`:''}<h3>Documenti inclusi</h3>${docs.length?`<table class="print-table"><thead><tr><th>#</th><th>Data</th><th>Documento</th></tr></thead><tbody>${indexRows}</tbody></table>`:'<p>Nessun documento selezionato.</p>'}</section>${docs.map(d=>HealthReport.documentHtml(d,{formatDate,formatDateTime,profile:p,documents:docs})).join('')}`;
    try{await waitForPrintAssets(root);await HealthReport.preparePrintLayout?.(root,{spaceSaving});}catch(error){console.warn('Impaginazione fascicolo visita per memoria esterna:',error);}
    let css='';try{const response=await fetch('css/app.css',{cache:'no-store'});if(response.ok)css=await response.text();}catch{}
    const body=root.outerHTML;
    root.innerHTML='';root.className='';delete root.dataset.spaceSaving;
    return `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Preparazione visita</title><style>${css}\nbody{background:#fff!important;margin:0!important}#printRoot{display:block!important}.print-root{display:block!important}@page{size:A4;margin:12mm}</style></head><body>${body}</body></html>`;
  }
  async function openVisitExternalExportV10(){
    const draft=visitLoadDraftV9(),collection=visitCollectionV9(draft),selected=visitSelectedDocumentsV9(draft,collection),meds=await visitFamilyMedicationCandidatesV26(draft),p=activeProfile();if(!p)return;
    const docIds=new Set(selected.map(d=>String(d.id))),studies=(await DossierDB.byProfile('dicomStudies',p.id)).filter(s=>docIds.has(String(s.linkedDocumentId||''))),linkedImages=(await DossierDB.byProfile('mediaAttachments',p.id)).filter(x=>docIds.has(String(x.linkedDocumentId||'')));
    const originals=selected.filter(d=>d.fileBlob),dicomFiles=studies.reduce((n,s)=>n+(s.files?.length||0),0),dicomBytes=studies.reduce((n,s)=>n+Number(s.totalBytes||0),0),imageBytes=linkedImages.reduce((n,x)=>n+Number(x.size||0),0);
    openModal('Esporta per struttura sanitaria','La destinazione deve essere una memoria esterna: chiavetta USB, SSD o HDD esterno.',`<div class="form-grid"><div class="form-group full"><label class="check-row"><input type="radio" name="visitExternalMode" value="pdf" checked><span><strong>Solo PDF</strong><small>Esporta soltanto il fascicolo della visita in PDF.</small></span></label></div><div class="form-group full"><label class="check-row"><input type="radio" name="visitExternalMode" value="documents"><span><strong>PDF + referti e immagini associate</strong><small>${originals.length} referti originali · ${linkedImages.length} immagini associate${linkedImages.length?` · ${formatBytes(imageBytes)}`:''}.</small></span></label></div><div class="form-group full"><label class="check-row"><input type="radio" name="visitExternalMode" value="all" ${studies.length?'':'disabled'}><span><strong>PDF + referti + immagini + DICOM</strong><small>${studies.length?`${studies.length} studi DICOM · ${dicomFiles} file · ${formatBytes(dicomBytes)} · ${linkedImages.length} immagini associate`:'Nessuno studio DICOM collegato ai referti selezionati.'}</small></span></label></div><div class="form-group full"><div class="notice">La cartella viene creata direttamente sulla memoria esterna scelta. I file del Dossier originale non vengono modificati.</div></div><div class="form-group full hidden" id="visitExternalProgress"><div class="card-title-row"><strong id="visitExternalPhase">Preparazione</strong><span id="visitExternalPct">0%</span></div><div style="height:8px;background:#e5e7eb;border-radius:99px;overflow:hidden;margin:7px 0"><span id="visitExternalBar" style="display:block;height:100%;width:0%;background:#0f766e"></span></div><small id="visitExternalDetail"></small></div><div class="form-actions full"><button type="button" class="btn btn-light" id="visitExternalCancel">Annulla</button><button type="button" class="btn btn-primary" id="visitExternalStart">Scegli memoria esterna</button></div></div>`);
    $('#visitExternalCancel').onclick=closeModal;
    $('#visitExternalStart').onclick=async()=>{
      const mode=$('input[name="visitExternalMode"]:checked')?.value||'pdf',start=$('#visitExternalStart'),cancel=$('#visitExternalCancel'),progress=$('#visitExternalProgress'),phase=$('#visitExternalPhase'),pct=$('#visitExternalPct'),bar=$('#visitExternalBar'),detail=$('#visitExternalDetail');
      const update=(value,label,text='')=>{const v=Math.max(0,Math.min(100,Math.round(value)));progress.classList.remove('hidden');pct.textContent=`${v}%`;bar.style.width=`${v}%`;phase.textContent=label;detail.textContent=text;};
      start.disabled=true;cancel.disabled=true;
      try{
        update(2,'Scelta destinazione','Seleziona una chiavetta USB, un SSD o un HDD esterno.');
        const session=await DossierSecurity.request('/api/visit-export/select-folder',{method:'POST',body:{specialty:draft.specialtyLabel||'Visita',visitDate:draft.visitDate||today()}});
        if(session.cancelled){start.disabled=false;cancel.disabled=false;progress.classList.add('hidden');return;}
        update(8,'Preparazione PDF','Composizione del fascicolo della visita.');
        const html=await visitPrintableHtmlV10(draft,selected,meds,p);await visitExternalPdfV10(session,html);update(25,'PDF creato','Riepilogo_visita.pdf');
        let tasks=[];
        if(mode==='documents'||mode==='all'){
          const used=new Set();
          for(const doc of originals){let name=visitExternalSafeNameV10(originalDocumentFileName(doc));const base=name;let n=2;while(used.has(name.toLowerCase())){const dot=base.lastIndexOf('.');name=dot>0?`${base.slice(0,dot)}_${n++}${base.slice(dot)}`:`${base}_${n++}`;}used.add(name.toLowerCase());tasks.push({kind:'doc',path:`Referti_originali/${name}`,blob:doc.fileBlob});}
          for(const image of linkedImages){const doc=selected.find(d=>String(d.id)===String(image.linkedDocumentId||''));const folder=visitExternalSafeNameV10(`${doc?.clinicalDate||'senza_data'}_${doc?.title||doc?.originalName||'Referto'}`);tasks.push({kind:'image',image,path:`Immagini_associate/${folder}/${visitExternalSafeNameV10(image.name||'immagine.jpg')}`});}
        }
        if(mode==='all'){
          for(const study of studies){const folder=visitExternalSafeNameV10(`${study.studyDate||'senza_data'}_${study.studyDescription||study.seriesDescription||study.studyUID||'Studio_DICOM'}`);for(const f of study.files||[])tasks.push({kind:'dicom',study,file:f,path:`DICOM/${folder}/${String(f.relativePath||f.name).replace(/\\/g,'/').split('/').map(visitExternalSafeNameV10).join('/')}`});}
        }
        const readme=`CLINICA DIGITALE - ESPORTAZIONE PER STRUTTURA SANITARIA\r\n\r\nRiepilogo_visita.pdf: fascicolo preparato per la visita.\r\nReferti_originali: copie dei documenti originali selezionati.\r\nImmagini_associate: JPG/PNG collegati ai referti selezionati.\r\nDICOM: immagini diagnostiche originali collegate ai referti selezionati. Per visualizzare i file DICOM serve un visualizzatore DICOM disponibile nella struttura sanitaria.\r\n\r\nQuesta cartella contiene dati sanitari personali.\r\n`;
        tasks.unshift({kind:'text',path:'LEGGIMI.txt',blob:new Blob([readme],{type:'text/plain;charset=utf-8'})});
        for(let i=0;i<tasks.length;i++){
          const task=tasks[i];let blob=task.blob;if(task.kind==='dicom'){if(!globalThis.ClinicaLot2?.getDicomFileBlob)throw new Error('Lettore DICOM non disponibile');blob=await ClinicaLot2.getDicomFileBlob(task.study,task.file);}else if(task.kind==='image'){if(!globalThis.ClinicaLot2?.getManagedMediaBlob)throw new Error('Archivio immagini locale non disponibile');blob=await ClinicaLot2.getManagedMediaBlob('image',task.image.profileId,task.image.id,task.image.storagePath||task.image.name);}
          update(25+((i+1)/Math.max(1,tasks.length))*70,'Copia sulla memoria esterna',`${i+1}/${tasks.length} · ${task.path}`);await visitExternalUploadV10(session,task.path,blob);if(i%8===7)await new Promise(r=>setTimeout(r,0));
        }
        await DossierSecurity.request('/api/doctor-export/complete',{method:'POST',body:{exportId:session.exportId}}).catch(()=>{});await DossierDB.addAudit('export','profiles',p.id,p.id,{event:'prepare-visit-external',mode,documentCount:originals.length,linkedImages:mode==='pdf'?0:linkedImages.length,dicomStudies:mode==='all'?studies.length:0}).catch(()=>{});update(100,'Completato',session.folderPath||session.folderName||'Cartella pronta');setTimeout(()=>{closeModal();alert(`Esportazione completata sulla memoria esterna:\n${session.folderPath||session.folderName||''}`);},250);
      }catch(error){console.error(error);alert(error?.message||'Esportazione non riuscita');start.disabled=false;cancel.disabled=false;}
    };
  }

  async function printVisitPreparationV9(){
    const draft=visitLoadDraftV9(),collection=visitCollectionV9(draft),selected=visitSelectedDocumentsV9(draft,collection),meds=await visitFamilyMedicationCandidatesV26(draft),p=activeProfile();if(!p)return;void DossierDB.addAudit('export','profiles',p.id,p.id,{event:'prepare-visit-print',layout:draft.pdfLayout||'compact',documentCount:selected.length}).catch(()=>{});const condition=state.diagnoses.find(x=>String(x.id)===String(draft.conditionId||''));const docs=globalThis.HealthExtractors?.prepareDocuments24?HealthExtractors.prepareDocuments24(selected,p):selected;const root=$('#printRoot'),spaceSaving=draft.pdfLayout!=='one-per-page';root.className='print-root visit-print-root';root.classList.toggle('print-space-saving',spaceSaving);root.dataset.spaceSaving=spaceSaving?'true':'false';const cleanupVisitPrint=()=>{root.classList.remove('visit-print-root');root.classList.remove('print-space-saving');delete root.dataset.spaceSaving;window.removeEventListener('afterprint',cleanupVisitPrint);};window.addEventListener('afterprint',cleanupVisitPrint,{once:true});const req=(draft.requests||[]).map(r=>`<li><strong>${esc(r.type||'Richiesta')}:</strong> ${esc(r.text||'')}</li>`).join('');const medsHtml=meds.map(m=>`<tr><td><strong>${esc(m.profileName||calendarProfileName(m.profileId))}</strong></td><td><strong>${esc(m.medication)}</strong></td><td>${formatDate(m.reorderDate)}</td><td>${formatDate(m.depletionDate)}</td></tr>`).join('');const indexRows=docs.map((d,i)=>`<tr><td>${i+1}</td><td>${formatDate(d.clinicalDate)}</td><td><strong>${esc(d.title||d.originalName||'Documento')}</strong><br>${esc([d.documentKind||d.category,d.specialization||d.department,d.doctor,d.facility].filter(Boolean).join(' · '))}</td></tr>`).join('');root.innerHTML=`<section class="print-page print-cover visit-print-cover modern-pdf-cover modern-pdf-cover-visit"><div class="modern-cover-topline"><p class="modern-cover-kicker">Sintesi per consulto</p><p class="modern-cover-motto">Ascolto<br>prevenzione<br>percorso</p></div><div class="modern-cover-title"><h1>Prepara la visita</h1><p class="modern-cover-subtitle">Le informazioni essenziali per il tuo consulto.</p></div><div class="modern-cover-patient"><p class="modern-cover-label">Paziente</p><h2>${esc(p.firstName)} ${esc(p.lastName)}</h2><dl class="modern-cover-meta"><dt>Data di nascita</dt><dd>${formatDate(p.birthDate)}</dd><dt>Data prevista</dt><dd>${draft.visitDate?formatDate(draft.visitDate):'Non definita'}</dd><dt>Tipo visita</dt><dd>${esc(draft.specialtyLabel||'Visita')}</dd></dl></div><div class="modern-cover-summary">${condition?`<div class="modern-cover-visit-box"><small>Motivo / condizione</small><strong>${esc(condition.name)}</strong></div>`:''}<div><strong>${docs.length}</strong><span>documenti allegati</span></div><div><strong>${meds.length}</strong><span>farmaci da valutare</span></div><div><strong>${(draft.requests||[]).length}</strong><span>cose da chiedere</span></div></div><div class="modern-cover-product"><div><strong>Clinica Digitale - Dossier Sanitario</strong><span>Per maggiori informazioni e per scaricare gratuitamente il programma: <b>www.dossiersanitario.it</b></span></div><img class="modern-cover-qr" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAASgAAAEoAQAAAADDfFG0AAABfElEQVR42u2Zy27EMAwDOUX//5fZgyTn5d3tsQWYQxAYPA1omlawfvF8Kaqooorqr6m+JYn6tjAWFpKP1fC68ZKLGkLCksyxGl5PFTQgYyGfV8PrpcpCyJTJkl8fVOC2lgmvN/l1pmQ0Mebw2vNqN2GMZUxTC6/bg3dr+LoeXhcVq0sIakeash3h9VS5XYWwaUYg08EfXld/oaN2tbv6O/7a+qtoYQvmKlRrDq+nvyy3v7DVLQytQzK8rioAu5N/TgCtO2R4XfuXp1pgsZrEHJHhtekTrELf0xx3BUt+7fajzXlGoWNrJr9252OdhKacVsHf7/DanY/HdbFjyxKyk1+7+yOVU7g+q37R8+nwuvMqMjPZYb3XQCe8tvMJpqfOy+R/x6Z/jbXM/B66uS68Lrx0DrHKfp9u3+F159WskKu1TrO3kvdbXivrPaHWt8n0rzcq1HWV7vc4/X7rr/V/aDoXq4GF15MXy18zyddsR9InXvavJFNUUUX1j1Q/kVmgg2GquzYAAAAASUVORK5CYII=" alt="QR www.dossiersanitario.it"></div><p class="modern-cover-footer">Questo fascicolo per la visita è stato creato con Clinica Digitale - Dossier Sanitario. Da utilizzare come supporto per la visita medica.</p></section><section class="print-page print-section visit-print-summary"><h2>Promemoria per la visita</h2>${req?`<h3>Cose da chiedere</h3><ul class="visit-print-list">${req}</ul>`:'<p>Nessuna richiesta specifica inserita.</p>'}${meds.length?`<h3>Farmaci da richiedere</h3><table class="print-table"><thead><tr><th>Persona</th><th>Farmaco</th><th>Richiesta prevista</th><th>Scorta stimata fino al</th></tr></thead><tbody>${medsHtml}</tbody></table>`:''}<h3>Documenti inclusi</h3>${docs.length?`<table class="print-table"><thead><tr><th>#</th><th>Data</th><th>Documento</th></tr></thead><tbody>${indexRows}</tbody></table>`:'<p>Nessun documento selezionato.</p>'}</section>${docs.map(d=>HealthReport.documentHtml(d,{formatDate,formatDateTime,profile:p,documents:docs})).join('')}`;try{await waitForPrintAssets(root);await HealthReport.preparePrintLayout?.(root,{spaceSaving});}catch(error){console.warn('Impaginazione fascicolo visita:',error);}toast('Si aprirà la stampa. Scegli “Salva come PDF” per esportare il fascicolo.');setTimeout(()=>window.print(),150);
  }

  function dossierSearchTokensV9(query=''){const raw=normalizedWords(query).split(' ').filter(Boolean),stop=new Set(['dottor','dottore','dottoressa','dott','dr','prof','professor','professoressa']);const clean=raw.filter(x=>!stop.has(x));return clean.length?clean:raw;}
  function dossierSearchMatchV9(text='',tokens=[]){const n=normalizedWords(text);if(!tokens.length||!tokens.every(t=>n.includes(t)))return 0;let score=tokens.reduce((s,t)=>s+(n.includes(t)?10:0),0);const phrase=tokens.join(' ');if(phrase&&n.includes(phrase))score+=30;return score;}
  function dossierSearchSnippetV9(doc={},tokens=[]){const text=String(doc.reconstructedText||doc.structuredText||doc.extractedText||'').replace(/\s+/g,' ').trim();if(!text)return'';const n=normalizedWords(text),token=tokens.find(t=>n.includes(t));if(!token)return text.slice(0,220)+(text.length>220?'…':'');const index=n.indexOf(token);const ratio=text.length/Math.max(1,n.length);const start=Math.max(0,Math.floor(index*ratio)-90),end=Math.min(text.length,start+300);return`${start?'…':''}${text.slice(start,end).trim()}${end<text.length?'…':''}`;}
  function dossierSearchResultsV9(query=''){
    const tokens=dossierSearchTokensV9(query);if(!tokens.length)return{documents:[],calendar:[],doctors:[],diagnoses:[],therapies:[]};
    const documents=state.documents.map(d=>{const personnel=(d.medicalPersonnel||[]).map(x=>`${x.name||''} ${x.role||''} ${x.specialization||''}`).join(' '),meta=`${d.title||''} ${d.originalName||''} ${d.category||''} ${d.documentKind||''} ${d.specialization||''} ${d.department||''} ${d.facility||''} ${d.doctor||''} ${d.doctorQualification||''} ${personnel}`,body=String(d.reconstructedText||d.structuredText||d.extractedText||'').slice(0,300000);const metaScore=dossierSearchMatchV9(meta,tokens),bodyScore=dossierSearchMatchV9(body,tokens);return{item:d,score:metaScore*3+bodyScore,snippet:dossierSearchSnippetV9(d,tokens)};}).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||String(b.item.clinicalDate||'').localeCompare(String(a.item.clinicalDate||''))).slice(0,60);
    const calendar=state.calendarEvents.map(x=>({item:x,score:dossierSearchMatchV9(`${x.title||''} ${x.category||''} ${x.doctorName||''} ${x.location||''} ${x.notes||''} ${x.startDate||''}`,tokens)})).filter(x=>x.score).sort((a,b)=>b.score-a.score||String(b.item.startDate||'').localeCompare(String(a.item.startDate||''))).slice(0,30);
    const doctors=state.doctors.map(x=>({item:x,score:dossierSearchMatchV9(`${x.name||''} ${x.role||''} ${x.facility||''} ${x.notes||''} ${x.email||''} ${x.phone||''}`,tokens)})).filter(x=>x.score).sort((a,b)=>b.score-a.score).slice(0,30);
    const diagnoses=state.diagnoses.map(x=>({item:x,score:dossierSearchMatchV9(`${x.name||''} ${x.specialization||''} ${x.facility||''} ${x.notes||''} ${(x.history||[]).map(h=>`${h.notes||''} ${h.sourceTitle||''}`).join(' ')}`,tokens)})).filter(x=>x.score).sort((a,b)=>b.score-a.score).slice(0,30);
    const therapies=state.therapies.map(x=>({item:x,score:dossierSearchMatchV9(`${x.medication||''} ${x.activeIngredient||''} ${x.manufacturer||''} ${x.dosage||''} ${x.frequency||''} ${x.notes||''}`,tokens)})).filter(x=>x.score).sort((a,b)=>b.score-a.score).slice(0,30);
    return{documents,calendar,doctors,diagnoses,therapies};
  }
  function renderDossierSearch(){
    $('#viewContainer').innerHTML=`<section class="card modern-content-shell dossier-search-page"><div class="modern-content-head"><div><h2>Ricerca completa</h2><p>Trova visite, referti, diagnosi, terapie, medici e appuntamenti già presenti.</p></div></div><div class="dossier-search-modern-bar"><span>${uiIconSvg('document')}</span><input id="dossierSearchV9" class="form-control" placeholder="Es. Dottor Rossi, gastroscopia, epatologia, glicemia"><button id="dossierSearchBtnV9" class="btn btn-primary">Cerca</button></div><div id="dossierSearchOutputV9"><div class="modern-empty-state">${uiIconSvg('trend')}<h3>Inserisci un termine</h3><p>I risultati verranno raggruppati per categoria.</p></div></div></section>`;
    const group=(title,icon,tone,count,html)=>count?`<section class="search-modern-group ${tone}"><div class="search-modern-head"><span class="${icon==='therapy'?'medication-semantic-icon':''}">${uiIconSvg(icon)}</span><h3>${title}</h3><span class="badge">${count}</span></div><div class="search-modern-list">${html}</div></section>`:'';
    const run=()=>{const query=$('#dossierSearchV9')?.value.trim()||'',out=$('#dossierSearchOutputV9');if(!query){out.innerHTML='<div class="notice">Inserisci almeno un termine.</div>';return;}const r=dossierSearchResultsV9(query),total=Object.values(r).reduce((n,x)=>n+x.length,0);if(!total){out.innerHTML='<div class="notice warning">Nessuna corrispondenza trovata nel Dossier.</div>';return;}
      const docs=group('Visite e referti','document','blue',r.documents.length,r.documents.map(({item:d,snippet})=>`<article class="search-modern-item"><span class="search-modern-icon">${uiIconSvg('document')}</span><div><h4>${esc(d.title||d.originalName||'Documento')}</h4><p>${visitDocLineV9(d)}</p>${snippet?`<p class="search-result-snippet">${esc(snippet)}</p>`:''}</div><button class="btn btn-primary btn-small" data-action="view-doc" data-id="${esc(d.id)}">Apri</button></article>`).join(''));
      const cal=group('Agenda','calendar','rose',r.calendar.length,r.calendar.map(({item:x})=>{const v=calendarEventVisual(x);return `<article class="search-modern-item"><span class="search-modern-icon ${v.icon==='therapy'?'medication-semantic-icon':''}">${uiIconSvg(v.icon)}</span><div><h4>${esc(x.title||x.category||'Evento')}</h4><p>${x.startDate?formatDate(x.startDate):'Data non definita'}${x.doctorName?' · '+esc(x.doctorName):''}${x.location?' · '+esc(x.location):''}</p></div><button class="btn btn-light btn-small" data-search-go-v9="calendar">Apri Agenda</button></article>`;}).join(''));
      const doctors=group('Medici e specialisti','profile','teal',r.doctors.length,r.doctors.map(({item:x})=>`<article class="search-modern-item"><span class="search-modern-icon">${uiIconSvg('profile')}</span><div><h4>${esc(x.name||'Medico')}</h4><p>${esc([x.role,x.facility,x.phone,x.email].filter(Boolean).join(' · '))}</p></div><button class="btn btn-light btn-small" data-search-go-v9="doctors">Apri Medici</button></article>`).join(''));
      const diagnoses=group('Diagnosi e problemi','diagnosis','violet',r.diagnoses.length,r.diagnoses.map(({item:x})=>`<article class="search-modern-item"><span class="search-modern-icon">${uiIconSvg('diagnosis')}</span><div><h4>${esc(x.name||'Condizione')}</h4><p>${x.date?formatDate(x.date):'Data non definita'}${x.specialization?' · '+esc(x.specialization):''}</p></div><button class="btn btn-light btn-small" data-search-go-v9="diagnoses">Apri Diagnosi</button></article>`).join(''));
      const therapies=group('Terapie','therapy','violet',r.therapies.length,r.therapies.map(({item:x})=>`<article class="search-modern-item"><span class="search-modern-icon medication-semantic-icon">${uiIconSvg('therapy')}</span><div><h4>${esc(x.medication||'Farmaco')}</h4><p>${esc([x.activeIngredient,x.dosage,x.frequency].filter(Boolean).join(' · '))}</p></div><button class="btn btn-light btn-small" data-search-go-v9="therapies">Apri Terapie</button></article>`).join(''));
      out.innerHTML=`<div class="dossier-search-summary"><strong>${total}</strong> risultati trovati per “${esc(query)}”</div><div class="dossier-search-results-grid">${docs}${diagnoses}${cal}${doctors}${therapies}</div>`;bindViewActions(out);$$('[data-search-go-v9]',out).forEach(btn=>btn.addEventListener('click',()=>{state.activeView=btn.dataset.searchGoV9;selectNav(state.activeView);renderView();}));};
    $('#dossierSearchBtnV9').onclick=run;$('#dossierSearchV9').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();run();}});
  }

  // FINE WINDOWS V9 PREPARA VISITA + CERCA NEL DOSSIER

  function renderCompare() {
    const q=state.compareQuery||'';
    $('#viewContainer').innerHTML=`<section class="card modern-content-shell compare-modern-shell"><div class="modern-content-head"><div><h2>Confronta nel tempo</h2><p>Cerca un parametro, un esame, un medico o una struttura e visualizza i risultati in ordine temporale.</p></div></div><div class="compare-modern-search"><span>${uiIconSvg('trend')}</span><input id="compareSearch" class="form-control" value="${esc(q)}" placeholder="Es. creatinina, glicemia, TSH, cardiologia..."><button id="compareBtn" class="btn btn-primary">Confronta</button></div><div id="compareOutput"></div><div class="startup-compat hidden" aria-hidden="true"><table><thead><tr><th>Stato</th></tr></thead></table><span class="compare-value-normal compare-value-alert"></span></div></section>`;
    const run=()=>{
      state.compareQuery=$('#compareSearch').value.trim(); const query=state.compareQuery;
      const output=$('#compareOutput');
      if (!query) {output.innerHTML='<div class="modern-empty-state">'+uiIconSvg('trend')+'<h3>Inserisci un termine da confrontare</h3><p>Puoi cercare valori clinici, esami, medici o strutture.</p></div>';return;}
      const matches=compareParameterMatches(query);const ids=new Set(matches.map(p=>p.id));
      const rows=HealthCharts.collect(state.documents).filter(r=>ids.has(r.parameterId)).sort((a,b)=>(a.clinicalDate||'9999').localeCompare(b.clinicalDate||'9999'));
      const qn=HealthExtractors.normalizeText(query);const docs=state.documents.filter(d=>HealthExtractors.normalizeText([d.title,d.category,d.doctor,d.facility,d.originalName,d.extractedText].join(' ')).includes(qn));
      const values=rows.map(r=>{let status=String(r.status||'').toLocaleLowerCase('it-IT');if((!status||status==='non definito')&&typeof HealthExtractors.statusFromRange==='function'&&r.range){try{status=String(HealthExtractors.statusFromRange(Number(r.value),r.range,r.sourceLine||'')||'').toLocaleLowerCase('it-IT');}catch(_){}}const badgeClass=HealthReport.statusClass?.(status)||'non-definito';const label=/alto|elevat|superior/i.test(status)?'Alto':/basso|ridott|inferior/i.test(status)?'Basso':/limiti|normale|regolare/i.test(status)?'Nei limiti':(status||'Non definito');return `<article class="compare-value-card"><div class="compare-value-date"><strong>${formatDate(r.clinicalDate)}</strong><small>${esc(r.parameterName)}</small></div><div><small>Valore rilevato</small><strong>${HealthCharts.fmt(r.value)} ${esc(r.unit)}</strong></div><div><small>Intervallo</small><strong>${esc(HealthReport.visibleReference?.(r)||r.range?.raw||'Non rilevato')}</strong></div><span class="badge ${esc(badgeClass)}">${esc(label)}</span><button class="btn btn-light btn-small" data-action="view-doc" data-id="${r.documentId}">Apri referto</button></article>`;}).join('');
      const docCards=docs.map(d=>`<article class="compare-doc-card"><span>${uiIconSvg('document')}</span><div><h3>${esc(d.title||d.originalName||'Documento')}</h3><p>${d.clinicalDate?formatDate(d.clinicalDate):''}${d.facility?` · ${esc(d.facility)}`:''}</p></div><button class="btn btn-light btn-small" data-action="view-doc" data-id="${d.id}">Apri</button></article>`).join('');
      output.innerHTML=(rows.length||docs.length)?`${rows.length?`<section class="compare-result-section"><div class="compare-result-head"><h3>Valori storici</h3><span class="badge">${rows.length}</span></div><div class="compare-values-list">${values}</div></section>`:''}${docs.length?`<section class="compare-result-section"><div class="compare-result-head"><h3>Documenti correlati</h3><span class="badge">${docs.length}</span></div><div class="compare-doc-grid">${docCards}</div></section>`:''}`:'<div class="notice warning">Nessun dato o documento corrispondente.</div>';
      bindViewActions(output);
    };
    $('#compareBtn').addEventListener('click',run);$('#compareSearch').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();run();}});if(q)run();
  }

  function renderProfile() {
    const p = activeProfile();
    const front=p.healthCardFrontBlob?makeObjectUrl(p.healthCardFrontBlob):'';
    const back=p.healthCardBackBlob?makeObjectUrl(p.healthCardBackBlob):'';
    if(state.healthCardSide==='front'&&!front&&back)state.healthCardSide='back';
    if(state.healthCardSide==='back'&&!back&&front)state.healthCardSide='front';
    const side=state.healthCardSide==='back'?'back':'front';
    const cardUrl=side==='front'?front:back;
    const cardLabel=side==='front'?'Fronte':'Retro';
    const otherLabel=side==='front'?'Retro':'Fronte';
    const hasBoth=!!front&&!!back;
    const cardStatus=healthCardStatus(p);
    const expiryLabel=p.healthCardExpiry?formatDate(p.healthCardExpiry):'Non indicata';
    const statusLabel=cardStatus.complete?'Fronte e retro presenti':cardStatus.hasFront||cardStatus.hasBack?'Tessera incompleta':'Tessera non caricata';
    const statusClass=cardStatus.complete?'success':'warning';
    const cardVisual=cardUrl
      ? `<button class="health-card-compact-view" data-action="view-health-card" aria-label="Mostra ${cardLabel.toLowerCase()} della tessera sanitaria"><img src="${cardUrl}" alt="${cardLabel} tessera sanitaria"></button>`
      : `<div class="health-card-compact-placeholder"><strong>${cardLabel}</strong><span>Immagine non disponibile.</span></div>`;
    $('#viewContainer').innerHTML = `
      <div class="personal-page-grid">
        <section class="card profile-data-card">
          <div class="profile-details-head">
            ${profileAvatarHtml(p,'avatar profile-page-avatar')}
            <div class="profile-details-title"><div class="card-title-row"><h2>Dati del profilo</h2><button class="btn btn-primary" data-action="edit-profile" ${canEditActive()?'':'disabled'}>Modifica</button></div></div>
          </div>
          <div class="profile-data-layout">
            <dl class="meta-list profile-meta-list profile-main-meta">
              <dt>Nome e cognome</dt><dd>${esc(p.firstName)} ${esc(p.lastName)}</dd>
              <dt>${profileRoleLabel(p)}</dt><dd>${esc(profileRoleValue(p))}</dd>
              <dt>Data di nascita</dt><dd>${formatDate(p.birthDate)}</dd>
              <dt>Codice fiscale</dt><dd>${esc(p.taxCode || 'Non inserito')}</dd>
              <dt>Tessera sanitaria</dt><dd>${esc(p.healthCard || 'Non inserita')}</dd>
              <dt>Scadenza tessera</dt><dd>${formatDate(p.healthCardExpiry)}</dd>
              <dt>Email</dt><dd>${esc(p.email || 'Non inserita')}</dd>
              <dt>Telefono</dt><dd>${esc(p.phone || 'Non inserito')}</dd>
              <dt>Indirizzo</dt><dd class="profile-address-value">${profileAddressHtml(p)}</dd>
            </dl>
            ${profileContactsPanelHtml(p)}
            <div class="profile-notes-wide"><div class="profile-notes-label">Note</div><div class="profile-notes-value">${esc(p.notes || 'Nessuna')}</div></div>
          </div>
        </section>
        <section class="card personal-health-card">
          <div class="card-title-row personal-health-title"><div><h2>Tessera sanitaria</h2><p class="kpi-note">Numero ${esc(p.healthCard||'non inserito')} · scadenza ${expiryLabel}</p></div><button class="btn btn-light btn-small" data-action="edit-profile">Carica o sostituisci</button></div>
          <div class="health-card-compact-toolbar"><span class="badge ${statusClass}">${statusLabel}</span>${hasBoth?`<button class="btn btn-light btn-small" data-action="flip-health-card-page">Mostra ${otherLabel.toLowerCase()}</button>`:''}</div>
          <div class="health-card-compact-label">${cardLabel}</div>
          ${cardVisual}
          <div class="row-actions health-card-compact-actions">
            ${front||back?'<button class="btn btn-primary btn-small" data-action="view-health-card">Mostra tessera</button>':''}
            <button class="btn btn-light btn-small" data-action="camera-card-front">Fotografa fronte</button>
            <button class="btn btn-light btn-small" data-action="camera-card-back">Fotografa retro</button>
            <button class="btn btn-light btn-small" data-action="scanner-card-front">Scansiona fronte</button>
            <button class="btn btn-light btn-small" data-action="scanner-card-back">Scansiona retro</button>
          </div>
        </section>
      </div>`;
    bindViewActions();
  }

  function healthCardStatus(profile) {
    const hasFront=!!profile?.healthCardFrontBlob;
    const hasBack=!!profile?.healthCardBackBlob;
    const expiry=profile?.healthCardExpiry||'';
    let expiryState='';
    if (expiry) {
      if (expiry<today()) expiryState='scaduta';
      else {
        const days=Math.ceil((new Date(`${expiry}T12:00:00`)-new Date(`${today()}T12:00:00`))/86400000);
        if (days<=60) expiryState='in-scadenza';
      }
    }
    return {hasFront,hasBack,complete:hasFront&&hasBack,expiryState};
  }

  function normalizeBloodGroup22(value=''){
    const raw=String(value||'').toUpperCase().replace(/\bZERO\b/g,'0').replace(/\bPOSITIVO\b|\bPOSITIVA\b/g,'+').replace(/\bNEGATIVO\b|\bNEGATIVA\b/g,'-').replace(/RH\s*\(?D\)?/g,' RH ').replace(/[^ABO0+\- ]/g,' ').replace(/\s+/g,' ').trim();
    const abo=(raw.match(/(?:^|\s)(AB|A|B|0|O)(?:\s|$)/)||[])[1];const rh=(raw.match(/(?:^|\s)([+\-])(?:\s|$)/)||[])[1];
    if(!abo&&!rh)return'';return `${abo==='O'?'0':abo||''}${rh||''}`;
  }
  function bloodGroupEvidence22(doc={}){
    const text=String(doc.structuredText||doc.extractedText||doc.reconstructedText||'').replace(/\r/g,' '),context=normalizedWords(`${doc.title||''} ${doc.originalName||''} ${doc.documentKind||''} ${doc.category||''} ${doc.specialization||''}`);
    const reliable=/gruppo sanguigno|gruppo (?:abo|ab0)|immunoematolog|trasfusion|tipizzazione|abo\s*\/\s*rh/.test(normalizedWords(`${context} ${text.slice(0,5000)}`));if(!reliable)return[];
    const evidence=[];const aboLabel='(?:gruppo\\s+(?:sanguigno|ematico)(?:\\s+(?:abo|ab0))?|gruppo\\s+(?:abo|ab0)|sistema\\s+(?:abo|ab0)|abo\\s*\\/\\s*rh)';
    const patterns=[
      new RegExp(`${aboLabel}\\s*[:=\\-]\\s*(AB|A|B|0|O)\\b\\s*(?:rh\\s*\\(?d\\)?|fattore\\s+rh)?\\s*[:=\\-]?\\s*(positivo|negativo|\\+|\\-)`,'ig'),
      new RegExp(`${aboLabel}\\s*[:=\\-]\\s*(AB|A|B|0|O)\\b[\\s\\S]{0,120}?(?:rh\\s*\\(?d\\)?|fattore\\s+rh)\\s*[:=\\-]\\s*(positivo|negativo|\\+|\\-)`,'ig')
    ];
    for(const re of patterns){let m;while((m=re.exec(text))){const around=text.slice(Math.max(0,m.index-80),Math.min(text.length,re.lastIndex+80));if(/(?:madre|figlio|figlia|donatore|donatrice|coniuge|familiare)\s*[:\-]?[^\n]{0,40}$/i.test(around.slice(0,80)))continue;const value=normalizeBloodGroup22(`${m[1]} ${m[2]}`);if(value)evidence.push({value,documentId:doc.id,file:doc.originalName||doc.title||'',date:doc.clinicalDate||doc.issueDate||'',excerpt:m[0].replace(/\s+/g,' ').trim(),confidence:'alta'});}}
    const seen=new Set();return evidence.filter(e=>{const key=`${e.value}|${e.documentId}|${e.excerpt}`;if(seen.has(key))return false;seen.add(key);return true;});
  }
  function detectBloodGroup22(profile={},documents=[]){
    const evidence=documents.flatMap(bloodGroupEvidence22);const byValue=new Map();for(const e of evidence){if(!byValue.has(e.value))byValue.set(e.value,[]);byValue.get(e.value).push(e);}const values=[...byValue.keys()];
    if(!values.length)return{status:'not_found',evidence:[]};if(values.length>1)return{status:'conflict',values,evidence};const value=values[0];return{status:'found',value,evidence:byValue.get(value)};
  }
  async function detectAndSaveBloodGroup22(profile={},documents=[],options={}){
    const existing=String(profile.bloodGroup||'').trim();const manual=existing&&profile.bloodGroupSourceType!=='automatic'&&profile.bloodGroupAutoDetected!==true;if(manual)return{status:'manual_preserved',saved:false,value:existing};
    const found=detectBloodGroup22(profile,documents);if(found.status==='found'){
      const updated={...profile,bloodGroup:found.value,bloodGroupSourceType:'automatic',bloodGroupAutoDetected:true,bloodGroupDetectionStatus:'confirmed',bloodGroupEvidence:found.evidence.slice(0,10),bloodGroupDetectedAt:new Date().toISOString(),updatedAt:new Date().toISOString()};await DossierDB.put('profiles',updated,{details:{event:'blood-group-detected-test22'}});const pos=state.profiles.findIndex(p=>p.id===profile.id);if(pos>=0)state.profiles[pos]=updated;return{...found,saved:true};
    }
    if(found.status==='conflict'){
      const updated={...profile,bloodGroupDetectionStatus:'conflict',bloodGroupConflictValues:found.values,bloodGroupEvidence:found.evidence.slice(0,20),bloodGroupDetectedAt:new Date().toISOString(),updatedAt:new Date().toISOString()};await DossierDB.put('profiles',updated,{details:{event:'blood-group-conflict-test22'}});const pos=state.profiles.findIndex(p=>p.id===profile.id);if(pos>=0)state.profiles[pos]=updated;return{...found,saved:false};
    }
    return{...found,saved:false};
  }

  function renderHealthCard() {
    const p=activeProfile();
    const status=healthCardStatus(p);
    const front=p.healthCardFrontBlob?makeObjectUrl(p.healthCardFrontBlob):'';
    const back=p.healthCardBackBlob?makeObjectUrl(p.healthCardBackBlob):'';
    const statusLabel=status.complete?'Fronte e retro presenti':status.hasFront||status.hasBack?'Tessera incompleta':'Tessera non caricata';
    const statusClass=status.complete?'success':'warning';
    const expiryLabel=p.healthCardExpiry?formatDate(p.healthCardExpiry):'Non indicata';
    const expiryBadge=status.expiryState==='scaduta'?'<span class="badge danger">Scaduta</span>':status.expiryState==='in-scadenza'?'<span class="badge warning">In scadenza</span>':'';

    if(state.healthCardSide==='front'&&!front&&back)state.healthCardSide='back';
    if(state.healthCardSide==='back'&&!back&&front)state.healthCardSide='front';
    const side=state.healthCardSide==='back'?'back':'front';
    const url=side==='front'?front:back;
    const label=side==='front'?'Fronte':'Retro';
    const otherLabel=side==='front'?'Retro':'Fronte';
    const hasBoth=!!front&&!!back;

    const sideCard=url
      ? `<figure class="health-card-display"><div class="health-card-display-head"><strong>${label}</strong><span class="badge success">Disponibile</span></div><button class="health-card-large" data-action="view-health-card" aria-label="Mostra ${label.toLowerCase()} della tessera sanitaria"><img src="${url}" alt="${label} tessera sanitaria"></button><div class="row-actions"><button class="btn btn-light btn-small" data-action="upload-card-${side}">Sostituisci file</button><button class="btn btn-light btn-small" data-action="camera-card-${side}">Fotografa</button><button class="btn btn-light btn-small" data-action="scanner-card-${side}">Scansiona</button>${hasBoth?`<button class="btn btn-primary btn-small" data-action="flip-health-card-page">Gira tessera · mostra ${otherLabel.toLowerCase()}</button>`:''}</div></figure>`
      : `<figure class="health-card-display health-card-missing"><div class="health-card-display-head"><strong>${label}</strong><span class="badge warning">Mancante</span></div><div class="health-card-placeholder"><span>${label}</span><small>Carica, fotografa o scansiona questo lato.</small></div><div class="row-actions"><button class="btn btn-primary btn-small" data-action="upload-card-${side}">Carica file</button><button class="btn btn-light btn-small" data-action="camera-card-${side}">Fotografa</button><button class="btn btn-light btn-small" data-action="scanner-card-${side}">Scansiona</button>${front||back?'<button class="btn btn-light btn-small" data-action="flip-health-card-page">Mostra lato disponibile</button>':''}</div></figure>`;

    $('#viewContainer').innerHTML=`
      <div class="card profile-hero health-card-hero">
        <div class="avatar">TS</div>
        <div><h2>Tessera sanitaria di ${esc(p.firstName)} ${esc(p.lastName)}</h2><p>Numero: ${esc(p.healthCard||'non inserito')} · Scadenza: ${expiryLabel} ${expiryBadge}</p></div>
        <div class="row-actions"><span class="badge ${statusClass}">${statusLabel}</span>${status.hasFront||status.hasBack?'<button class="btn btn-primary" data-action="view-health-card">Mostra tessera</button>':''}</div>
      </div>
      <div class="section-spacer"></div>
      <div class="health-card-page-grid single">
        ${sideCard}
      </div>
      <div class="section-spacer"></div>
      <div class="card">
        <div class="card-title-row"><div><h2>Gestione tessera</h2><p class="kpi-note">È visibile un solo lato alla volta. Usa Gira tessera per passare dal fronte al retro.</p></div><button class="btn btn-light" data-action="edit-health-card">Modifica dati tessera</button></div>
        <input id="healthCardFrontQuickInput" type="file" accept="image/*" class="hidden">
        <input id="healthCardBackQuickInput" type="file" accept="image/*" class="hidden">
      </div>`;
    bindViewActions();
    const frontInput=$('#healthCardFrontQuickInput');
    const backInput=$('#healthCardBackQuickInput');
    if(frontInput)frontInput.onchange=async e=>{const file=e.target.files?.[0];if(file)await saveHealthCardImage('front',file);};
    if(backInput)backInput.onchange=async e=>{const file=e.target.files?.[0];if(file)await saveHealthCardImage('back',file);};
  }

  function renderDoctors() {
    const cards=state.doctors.map(d=>`<article class="doctor-modern-card"><div class="doctor-modern-head"><span class="doctor-modern-icon">${uiIconSvg('profile')}</span><div><small>${esc(d.role||'Specialista')}</small><h3>${esc(d.name||'Medico')}</h3><p>${esc(d.facility||'Struttura non indicata')}</p></div>${d.primary?'<span class="badge success">Medico di base</span>':''}</div><div class="doctor-modern-contacts">${d.phone?`<a href="tel:${esc(String(d.phone).replace(/[^+\d]/g,''))}">${uiIconSvg('phone')}<span>${esc(d.phone)}</span></a>`:''}${d.email?`<a href="mailto:${esc(d.email)}">${uiIconSvg('document')}<span>${esc(d.email)}</span></a>`:''}</div>${d.notes?`<div class="doctor-modern-note">${esc(d.notes)}</div>`:''}<div class="doctor-modern-actions"><button class="btn btn-ghost btn-small" data-action="edit-doctor" data-id="${d.id}">Modifica</button><button class="btn btn-danger btn-small" data-action="delete-doctor" data-id="${d.id}">Elimina</button></div></article>`).join('');
    $('#viewContainer').innerHTML=`<section class="card modern-content-shell doctors-modern-shell"><div class="modern-content-head"><div><h2>Medici e specialisti</h2><p>Contatti, strutture e riferimenti dei professionisti sanitari.</p></div><button class="btn btn-primary" data-action="add-doctor">Aggiungi medico</button></div>${state.doctors.length?`<div class="doctor-modern-grid">${cards}</div>`:`<div class="modern-empty-state">${uiIconSvg('profile')}<h3>Nessun medico registrato</h3><p>Aggiungi un professionista sanitario per averne i riferimenti sempre disponibili.</p></div>`}</section>`;
    bindViewActions();
  }

  function renderTherapies() {
    const prefs=currentProfilePreferences();state.therapySort=state.therapySort||prefs.therapySort||'time-asc';
    const ordered=orderedTherapies(state.therapies,state.therapySort);
    const activeCount=ordered.filter(t=>t.active!==false).length;
    const therapyRows=ordered.map(t=>{
      const status=t.active===false?'Sospesa':'Attiva';
      const statusClass=t.active===false?'':'success';
      const time=esc(t.time||t.schedule||'—');
      const manufacturer=[t.manufacturer,t.medicineType].filter(Boolean).join(' · ');
      const reorderEnabled=Boolean(t.reorderEnabled);
      const requiresPrescription=medicationRequiresPrescription(t);
      const leadDays=medicationReorderLeadDays(t);
      const reorderState=reorderEnabled
        ? `<span class="therapy-reorder-state enabled"><span class="therapy-reorder-check" aria-hidden="true">✓</span><span><strong>Automatico</strong><small>${requiresPrescription?'Ricetta':'Senza ricetta'} · ${leadDays} gg</small></span></span>`
        : `<span class="therapy-reorder-state disabled"><span class="therapy-reorder-check" aria-hidden="true"></span><span><strong>Non gestito</strong><small>Riordino manuale</small></span></span>`;
      return `<article class="therapy-timeline-row ${t.active===false?'is-paused':''}">
        <span class="therapy-row-time"><strong>${time}</strong></span>
        <span class="therapy-modern-icon medication-semantic-icon">${uiIconSvg('therapy')}</span>
        <div class="therapy-row-med"><strong>${esc(t.medication||'Farmaco')}</strong>${manufacturer?`<small>${esc(manufacturer)}</small>`:''}</div>
        <div class="therapy-row-cell"><small>Principio attivo</small><strong>${esc(t.activeIngredient||'Non indicato')}</strong></div>
        <div class="therapy-row-cell dosage"><small>Dosaggio</small><strong>${esc(t.dosage||'Non indicato')}</strong></div>
        <div class="therapy-row-cell schedule"><small>Frequenza / indicazioni</small><span>${multilineHtml(therapyScheduleText(t)||'Nessuna indicazione aggiuntiva')}</span></div>
        <div class="therapy-row-reorder">${reorderState}</div>
        <span class="badge ${statusClass}">${status}</span>
        <div class="therapy-row-actions">${t.sourceDocumentId?`<button class="btn btn-light btn-small" data-action="view-doc" data-id="${t.sourceDocumentId}" title="Documento originale">Documento</button>`:''}<button class="btn btn-ghost btn-small" data-action="edit-therapy" data-id="${t.id}">Modifica</button><button class="btn btn-danger btn-small" data-action="delete-therapy" data-id="${t.id}">Elimina</button></div>
      </article>`;
    }).join('');
    $('#viewContainer').innerHTML=`<section class="card modern-content-shell therapies-modern-shell"><div class="modern-content-head"><div><h2>Terapie farmacologiche</h2><p>Farmaci, dosaggi e indicazioni ordinati per orario, con lettura cronologica immediata.</p></div><div class="row-actions"><button class="btn btn-light" data-action="import-therapy-file">Importa file terapie</button><button class="btn btn-primary" data-action="add-therapy">Aggiungi terapia</button></div></div>
      <div class="modern-filter-strip"><div class="modern-filter-summary"><span class="modern-filter-icon medication-semantic-icon">${uiIconSvg('therapy')}</span><div><strong>${activeCount} terapie attive</strong><small>${ordered.length} registrazioni totali</small></div></div><div class="form-group compact-control"><label for="therapySort">Ordina terapie</label><select id="therapySort" class="form-control"><option value="time-asc" ${state.therapySort==='time-asc'?'selected':''}>Orario crescente</option><option value="time-desc" ${state.therapySort==='time-desc'?'selected':''}>Orario decrescente</option><option value="med-asc" ${state.therapySort==='med-asc'?'selected':''}>Farmaco A-Z</option><option value="med-desc" ${state.therapySort==='med-desc'?'selected':''}>Farmaco Z-A</option><option value="insert" ${state.therapySort==='insert'?'selected':''}>Ordine di inserimento</option></select></div></div>
      ${ordered.length?`<div class="therapy-timeline-list"><div class="therapy-timeline-head"><span>Orario</span><span></span><span>Farmaco</span><span>Principio attivo</span><span>Dosaggio</span><span>Frequenza / indicazioni</span><span>Riordino</span><span>Stato</span><span>Azioni</span></div>${therapyRows}</div>`:'<div class="modern-empty-state medication-empty-state">'+uiIconSvg('therapy')+'<h3>Nessuna terapia registrata</h3><p>Aggiungi una terapia o importala da un documento.</p></div>'}
    </section>`;
    $('#therapySort')?.addEventListener('change',async e=>{state.therapySort=e.target.value;await saveProfilePreferences({therapySort:state.therapySort});renderTherapies();});
    bindViewActions();
  }

  function renderExemptions() {
    const prefs=currentProfilePreferences();const mode=prefs.exemptionView==='extended'?'extended':'compact';
    const rows=state.exemptions;
    const cards=rows.map(x=>`<article class="exemption-modern-card ${mode==='extended'?'extended':''}">
      <div class="exemption-modern-head"><span class="exemption-modern-icon">${uiIconSvg('shield')}</span><div class="exemption-modern-title"><strong class="exemption-code">${esc(x.code||'Codice non indicato')}</strong><h3>${esc(x.description||'Esenzione sanitaria')}</h3></div><div class="exemption-modern-actions">${x.sourceDocumentId?`<button class="btn btn-light btn-small" data-action="view-doc" data-id="${x.sourceDocumentId}">Documento</button>`:''}<button class="btn btn-ghost btn-small" data-action="edit-exemption" data-id="${x.id}" ${canEditActive()?'':'disabled'}>Modifica</button><button class="btn btn-danger btn-small" data-action="delete-exemption" data-id="${x.id}" ${canEditActive()?'':'disabled'}>Elimina</button></div></div>
      <div class="exemption-modern-meta"><div><small>Validità</small><strong>${x.validFrom?'Dal '+formatDate(x.validFrom):'Non indicata'}${x.expiry?' · '+esc(x.expiry):''}</strong></div><div><small>Ente</small><strong>${esc(x.issuer||'Non indicato')}</strong></div></div>
      ${mode==='extended'&&x.limitations?`<div class="exemption-modern-text"><small>Prestazioni</small><p>${multilineHtml(x.limitations)}</p></div>`:''}
      ${mode==='extended'&&x.notes?`<div class="exemption-modern-text"><small>Note</small><p>${multilineHtml(x.notes)}</p></div>`:''}
    </article>`).join('');
    $('#viewContainer').innerHTML=`<section class="card modern-content-shell exemptions-modern-shell"><div class="modern-content-head"><div><h2>Esenzioni sanitarie</h2><p>Codici, validità, enti e documenti collegati in un'unica vista.</p></div><div class="row-actions"><button class="btn btn-light" data-action="import-exemption-file" ${canEditActive()?'':'disabled'}>Importa attestato</button><button class="btn btn-primary" data-action="add-exemption" ${canEditActive()?'':'disabled'}>Aggiungi esenzione</button></div></div>
      <div class="modern-filter-strip"><div class="modern-filter-summary"><span class="modern-filter-icon green">${uiIconSvg('shield')}</span><div><strong>${rows.length} esenzioni registrate</strong><small>Visualizzazione e documenti collegati</small></div></div><div class="form-group compact-control"><label for="exemptionViewMode">Visualizzazione</label><select id="exemptionViewMode" class="form-control"><option value="compact" ${mode==='compact'?'selected':''}>Versione compressa</option><option value="extended" ${mode==='extended'?'selected':''}>Versione estesa</option></select></div></div>
      ${rows.length?`<div class="exemption-modern-grid ${mode}">${cards}</div>`:`<div class="modern-empty-state">${uiIconSvg('shield')}<h3>Nessuna esenzione registrata</h3><p>Aggiungi un'esenzione o importa l'attestato.</p></div>`}
    </section>`;
    $('#exemptionViewMode').onchange=async e=>{await saveProfilePreferences({exemptionView:e.target.value});renderExemptions();};bindViewActions();
  }

  function renderDiagnoses() {
    const prefs=currentProfilePreferences();state.diagnosisSort=state.diagnosisSort||prefs.diagnosisSort||'date-desc';
    const viewMode=prefs.diagnosisView==='compact'?'compact':'extended';
    const ordered=[...state.diagnoses].sort((a,b)=>diagnosisCompare(a,b,state.diagnosisSort));
    const main=ordered.filter(d=>d.mainProblem===true||String(d.mainProblem)==='true');
    const statusClass=d=>d.status==='Risolta'?'success':d.status==='Attiva'||d.status==='In evoluzione'?'warning':'';
    const historyHtml=d=>{if(viewMode==='compact')return'';const events=[...(d.history||[])].sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));if(events.length<=1)return'';return `<details class="diagnosis-history-modern"><summary>${events.length} eventi storici collegati</summary><div>${events.map(e=>`<article><strong>${formatDate(e.date)}</strong><span>${esc(e.category||'')}</span><span>${esc(e.status||'')}</span>${e.sourceDocumentId?`<button class="btn btn-light btn-small" data-action="view-doc" data-id="${e.sourceDocumentId}">Fonte</button>`:''}</article>`).join('')}</div></details>`;};
    const mainCards=main.map(d=>`<article class="diagnosis-focus-card"><div class="diagnosis-focus-head"><span class="diagnosis-focus-icon">${uiIconSvg('diagnosis')}</span><div><small>${d.date?'Aggiornata al '+formatDate(d.date):'Data non definita'}</small><h3>${esc(d.name)}</h3>${d.specialization?`<p>${esc(d.specialization)}</p>`:''}</div><span class="badge ${statusClass(d)}">${esc(d.status||'Da verificare')}</span></div>${viewMode==='extended'&&diagnosisDisplayText(d.summary||d.notes||'')?`<div class="diagnosis-focus-body">${multilineHtml(diagnosisDisplayText(d.summary||d.notes||''))}</div>`:''}${historyHtml(d)}<div class="diagnosis-focus-actions">${d.sourceDocumentId?`<button class="btn btn-light btn-small" data-action="view-doc" data-id="${d.sourceDocumentId}">Documento originale</button>`:''}<button class="btn btn-ghost btn-small" data-action="edit-diagnosis" data-id="${d.id}">Modifica</button></div></article>`).join('');
    const allCards=ordered.map(d=>{const note=diagnosisDisplayText(d.notes||d.summary||'');return `<article class="diagnosis-record-card"><span class="diagnosis-record-icon">${uiIconSvg('diagnosis')}</span><div class="diagnosis-record-main"><div class="diagnosis-record-title"><h3>${esc(d.name)}</h3>${d.mainProblem?'<span class="badge">Principale</span>':''}<span class="badge '+statusClass(d)+'">'+esc(d.status||'Da verificare')+'</span></div><div class="diagnosis-record-meta"><span>${formatDate(d.date)}</span>${d.specialization||d.facility?`<span>${esc(d.specialization||d.facility)}</span>`:''}${d.category?`<span>${esc(d.category)}</span>`:''}</div>${note?`<div class="diagnosis-record-note">${multilineHtml(note)}</div>`:''}${historyHtml(d)}</div><div class="diagnosis-record-actions">${d.sourceDocumentId?`<button class="btn btn-light btn-small" data-action="view-doc" data-id="${d.sourceDocumentId}">Fonte</button>`:''}<button class="btn btn-ghost btn-small" data-action="edit-diagnosis" data-id="${d.id}">Modifica</button><button class="btn btn-danger btn-small" data-action="delete-diagnosis" data-id="${d.id}">Elimina</button></div></article>`;}).join('');
    $('#viewContainer').innerHTML=`<section class="card modern-content-shell diagnosis-modern-shell"><div class="modern-content-head"><div><h2>Condizioni cliniche registrate</h2><p>Condizioni equivalenti riunite, stato attuale e intera evoluzione clinica.</p></div><div class="row-actions"><button class="btn btn-light" data-action="propose-diagnoses">Rileva dai referti</button><button class="btn btn-light" data-action="import-diagnosis-file">Importa documento</button><button class="btn btn-primary" data-action="add-diagnosis">Aggiungi condizione</button></div></div>
      <section class="diagnosis-modern-search"><div><span class="diagnosis-search-icon">${uiIconSvg('document')}</span><div><h3>Cerca una condizione nei documenti</h3><p>Collega referti già archiviati senza duplicare i file originali.</p></div></div><div class="diagnosis-search-controls"><input id="diagnosisSearchTerm" class="form-control" placeholder="Es. steatosi, malattia rara, sindrome..."><select id="diagnosisSearchMode" class="form-control"><option value="exact">Termine esatto</option><option value="variants">Termine e varianti / errori OCR</option></select><button class="btn btn-primary" data-action="search-diagnosis-documents">Cerca nei documenti</button></div></section>
      <section class="diagnosis-main-section"><div class="diagnosis-focus-section"><div class="diagnosis-section-head"><div><h3>Quadro clinico principale</h3><p>Condizioni attive, persistenti, sotto controllo o in evoluzione.</p></div><div class="diagnosis-main-controls"><span class="badge">${main.length} principali</span><select id="diagnosisView" class="form-control"><option value="compact" ${viewMode==='compact'?'selected':''}>Vista compatta</option><option value="extended" ${viewMode==='extended'?'selected':''}>Vista estesa</option></select></div></div>${main.length?`<div class="diagnosis-focus-grid ${viewMode}">${mainCards}</div>`:'<div class="modern-empty-state">'+uiIconSvg('diagnosis')+'<h3>Nessuna condizione principale</h3><p>Puoi selezionarla modificando una condizione registrata.</p></div>'} </div></section>
      <section class="diagnosis-records-section"><div class="diagnosis-section-head"><div><h3>Archivio completo</h3><p>Tutte le condizioni con note, stato ed evoluzione storica.</p></div><div class="form-group compact-control"><label for="diagnosisSort">Ordina per</label><select id="diagnosisSort" class="form-control"><option value="date-desc" ${state.diagnosisSort==='date-desc'?'selected':''}>Data più recente</option><option value="date-asc" ${state.diagnosisSort==='date-asc'?'selected':''}>Data meno recente</option><option value="alpha-asc" ${state.diagnosisSort==='alpha-asc'?'selected':''}>Alfabetico A-Z</option><option value="alpha-desc" ${state.diagnosisSort==='alpha-desc'?'selected':''}>Alfabetico Z-A</option><option value="category" ${state.diagnosisSort==='category'?'selected':''}>Categoria</option><option value="status" ${state.diagnosisSort==='status'?'selected':''}>Stato</option><option value="specialization" ${state.diagnosisSort==='specialization'?'selected':''}>Specializzazione</option><option value="insert" ${state.diagnosisSort==='insert'?'selected':''}>Ordine di inserimento</option></select></div></div>${ordered.length?`<div class="diagnosis-records-list">${allCards}</div>`:'<div class="notice">Nessuna condizione registrata.</div>'}</section>
      <div class="startup-compat hidden" aria-hidden="true"><span>Tabella completa</span><table class="diagnosis-history-table"><thead><tr><th>Note ed evoluzione</th></tr></thead></table></div>
    </section>`;
    $('#diagnosisSort')?.addEventListener('change',async e=>{state.diagnosisSort=e.target.value;await saveProfilePreferences({diagnosisSort:state.diagnosisSort});renderDiagnoses();});
    $('#diagnosisView')?.addEventListener('change',async e=>{await saveProfilePreferences({diagnosisView:e.target.value});renderDiagnoses();});
    bindViewActions();
  }

  function entityListPage(title, button, items, content, type) {
    return `<div class="card"><div class="card-title-row"><h2>${title}</h2><button class="btn btn-primary" data-action="add-${type}">${button}</button></div>${items.length ? `<div class="list-stack">${items.map(item=>`<div class="list-item">${content(item)}<div class="row-actions"><button class="btn btn-ghost btn-small" data-action="edit-${type}" data-id="${item.id}">Modifica</button><button class="btn btn-danger btn-small" data-action="delete-${type}" data-id="${item.id}">Elimina</button></div></div>`).join('')}</div>` : '<div class="notice">Nessun elemento registrato.</div>'}</div>`;
  }

  let developerVersionClicks=0;
  let developerVersionLastClick=0;

  function developerModeActive(){
    return Boolean(globalThis.DossierSecurity?.isDeveloperMode?.());
  }

  function updateDeveloperModeBadge(){
    let badge=document.querySelector('#developerModeBadge');
    const host=document.querySelector('.top-actions');
    if(!developerModeActive()){
      badge?.remove();
      return;
    }
    if(!badge&&host){
      badge=document.createElement('span');
      badge.id='developerModeBadge';
      badge.textContent='Modalità sviluppatore attiva';
      badge.style.cssText='display:inline-flex;align-items:center;padding:6px 10px;border:1px solid #d97706;border-radius:999px;background:#fff7ed;color:#9a3412;font-size:12px;font-weight:700;white-space:nowrap';
      host.prepend(badge);
    }
  }

  async function activateDeveloperMode(){
    try{
      const status=await DossierSecurity.verifyDeveloperMfa('');
      if(status?.verified){
        await DossierSecurity.setDeveloperMode(true);
        updateDeveloperModeBadge();
        toast('Modalità sviluppatore attiva · timeout sospeso');
        if(state.activeView==='preferences')await renderPreferences();
        return;
      }
      if(!status?.needsOtp)return;
      openModal('Modalità sviluppatore','Verifica tecnica',`<div class="notice warning"><strong>Accesso tecnico riservato.</strong><br>Usa lo stesso codice temporaneo del tuo Authenticator già associato a Clinica Digitale. Se lo hai verificato negli ultimi 5 minuti, il codice non viene richiesto.</div><form id="developerMfaForm"><div class="form-group"><label>Codice temporaneo</label><input class="form-control" name="otp" maxlength="6" inputmode="numeric" autocomplete="one-time-code" required autofocus></div><div class="form-actions"><button type="button" class="btn btn-light" id="developerMfaCancel">Annulla</button><button class="btn btn-primary">Attiva modalità sviluppatore</button></div></form>`);
      $('#developerMfaCancel')?.addEventListener('click',closeModal);
      $('#developerMfaForm')?.addEventListener('submit',async e=>{
        e.preventDefault();
        const button=e.currentTarget.querySelector('button[type="submit"]');
        if(button){button.disabled=true;button.textContent='Verifica…';}
        try{
          const otp=String(new FormData(e.currentTarget).get('otp')||'').trim();
          const result=await DossierSecurity.verifyDeveloperMfa(otp);
          if(!result?.verified)throw new Error('Verifica non completata');
          await DossierSecurity.setDeveloperMode(true);
          closeModal();
          updateDeveloperModeBadge();
          toast('Modalità sviluppatore attiva · timeout sospeso');
          if(state.activeView==='preferences')await renderPreferences();
        }catch(error){
          alert(`Modalità sviluppatore: ${error.message}`);
          if(button){button.disabled=false;button.textContent='Attiva modalità sviluppatore';}
        }
      });
    }catch(error){
      alert(`Modalità sviluppatore: ${error.message}`);
    }
  }

  function bindDeveloperModeTrigger(){
    const trigger=$('#appVersionDeveloperTrigger');
    if(!trigger||trigger.dataset.developerBound==='1')return;
    trigger.dataset.developerBound='1';
    trigger.addEventListener('click',async()=>{
      const now=Date.now();
      if(now-developerVersionLastClick>2000)developerVersionClicks=0;
      developerVersionLastClick=now;
      developerVersionClicks++;
      if(developerVersionClicks<9)return;
      developerVersionClicks=0;
      if(developerModeActive()){
        toast('Modalità sviluppatore già attiva');
        return;
      }
      await activateDeveloperMode();
    });
  }

  function polishPreferencesLayout(){
    const form=$('#preferencesForm');if(!form)return;
    const warnings=form.querySelector('.pref-warnings');
    const warningButton=form.querySelector('#reviewGeneralWarningsBtn');
    const warningHead=warnings?.querySelector('.card-title-row');
    if(warningButton&&warningHead&&!warningHead.contains(warningButton)){
      const right=document.createElement('div');right.className='pref-head-actions';
      const badge=warningHead.querySelector('.badge');if(badge)right.appendChild(badge);
      right.appendChild(warningButton);warningHead.appendChild(right);
    }
    const updates=form.querySelector('#updatesPreferenceSection');
    const updateButton=form.querySelector('#checkUpdatesNowBtn');
    const updateHead=updates?.querySelector('.card-title-row');
    if(updateButton&&updateHead&&!updateHead.contains(updateButton)){
      let right=updateHead.querySelector('.pref-head-actions');
      if(!right){right=document.createElement('div');right.className='pref-head-actions';const badge=updateHead.querySelector('.badge');if(badge)right.appendChild(badge);updateHead.appendChild(right);}
      right.appendChild(updateButton);
    }
  }

  async function renderPreferences() {
    const expectedView=state.activeView;
    const securityHtml=await DossierSecurity.preferencesHtml();
    if(state.activeView!==expectedView||expectedView!=='preferences')return;
    const hasActiveProfile=!!activeProfile();
    const g={...DEFAULT_GLOBAL_PREFS,...state.globalPreferences};const p=currentProfilePreferences();
    const googlePlanEnabled=Boolean(globalThis.DossierFeatures?.has?.('googleCalendarAuto'));
    const googleAdvanced=googlePlanEnabled?await DossierCalendar.googleAdvancedStatus():{connected:false,needsReauthorization:false,healthDataConsent:{granted:false},medicationDataConsent:{granted:false},licenseLocked:true};
    const rows=HealthCharts.collect(state.documents);const params=orderGraphParameters(HealthCharts.groupParameters(rows));
    const selected=new Set(p.selectedGraphs||[]);const storage=state.storageEstimate;const dashboardOptions=dashboardOverviewOptions();
    const graphChoiceStyle=isSelected=>isSelected?'background:color-mix(in srgb,var(--profile-accent) 30%,white);border-color:color-mix(in srgb,var(--profile-accent) 72%,var(--line));':'';
    const pdfGraphsHtml=!globalThis.DossierFeatures?.has?.('temporalGraphs')?'<div class="notice warning"><strong>Grafici temporali disponibili dal piano MEDIUM.</strong><br>Le rilevazioni restano conservate.</div>':params.length?`<div class="graph-selection-grid">${params.map(x=>`<label class="check-row graph-choice" style="${graphChoiceStyle(selected.has(x.id))}"><input type="checkbox" name="selectedGraphs" value="${esc(x.id)}" ${selected.has(x.id)?'checked':''}><span><strong>${esc(x.name)}</strong><small>${x.datedCount} rilevazioni valide</small></span></label>`).join('')}</div>`:'<div class="notice">Non sono ancora disponibili serie cliniche selezionabili.</div>';
    const license=globalThis.DossierFeatures?.current?.()||{plan:'FREE',dossierId:'',offline:false,cached:false};
    const licenseState=license.offline?(license.cached?'Licenza firmata in cache':'Offline · FREE di sicurezza'):(license.reason==='server_signed'?'Verificata online':license.reason==='server_free'?'FREE verificato':'Locale');
    $('#viewContainer').innerHTML=`<form id="preferencesForm" class="preferences-layout">
      <section class="card preference-section pref-license"><div class="card-title-row"><div><h2>Piano Clinica Digitale</h2><p class="kpi-note">Il piano appartiene al Dossier e vale per tutti gli account autorizzati; ruoli e permessi restano separati.</p></div><span class="badge ${license.plan==='FULL'?'success':license.plan==='MEDIUM'?'':'warning'}">${esc(license.plan||'FREE')}</span></div><div class="pref-license-grid"><div class="form-group pref-license-id"><label>ID Dossier per la licenza</label><input class="form-control" id="licenseDossierId" readonly value="${esc(license.dossierId||'Disponibile dopo la creazione dell’account')}"><small>Comunica questo ID soltanto per assegnare o verificare il piano. Non contiene password o chiavi private.</small></div><div class="form-group pref-license-status"><label>Stato</label><div class="notice ${license.offline?'warning':'success'}">${esc(licenseState)}</div></div><div class="form-group pref-license-validity"><label>Validità</label><div class="notice neutral">${license.validUntil?esc(new Date(license.validUntil).toLocaleString('it-IT')):'Nessuna scadenza specifica registrata'}</div></div><div class="pref-license-actions"><button type="button" class="btn btn-light" id="copyLicenseDossierIdBtn" ${license.dossierId?'':'disabled'}>Copia ID Dossier</button><button type="button" class="btn btn-primary" id="refreshLicenseBtn">Verifica licenza</button></div></div>${license.warning?`<div class="notice warning pref-license-warning">${esc(license.warning)}</div>`:''}</section>
      <section class="card preference-section pref-appearance"><div class="card-title-row"><div><h2>Aspetto generale</h2><p class="kpi-note">Impostazioni del profilo attivo che incidono realmente sulla visualizzazione del Dossier.</p></div></div><div class="form-grid"><div class="form-group"><label>Colore identificativo</label><input type="color" name="profileColor" class="form-control color-control" value="${esc(p.profileColor)}"></div><div class="form-group"><label>Visualizzazione esenzioni</label><select name="exemptionView" class="form-control"><option value="compact" ${p.exemptionView==='compact'?'selected':''}>Versione compressa</option><option value="extended" ${p.exemptionView==='extended'?'selected':''}>Versione estesa</option></select></div><div class="form-group"><label>Grafico mostrato in Panoramica</label><select name="dashboardOverviewChart" class="form-control">${dashboardOptions.map(x=>`<option value="${esc(x.value)}" ${String(p.dashboardOverviewChart||'weight')===x.value?'selected':''}>${esc(x.label)}</option>`).join('')}</select><small>Scegli tra misurazioni personali/domestiche e parametri di laboratorio disponibili per questo profilo.</small></div></div></section>
      <section class="card preference-section pref-agenda"><div class="card-title-row"><div><h2>Agenda</h2><p class="kpi-note">Impostazioni del calendario usato per gli appuntamenti sanitari.</p></div></div><div class="pref-agenda-top"><div class="form-group"><label>Indirizzo Google Calendar da associare</label><input type="email" name="googleCalendarEmail" id="googleCalendarEmail" class="form-control" autocomplete="email" spellcheck="false" placeholder="nome@gmail.com" value="${esc(state.googleCalendarEmail||'')}"><small>Account Google da usare per la sincronizzazione.</small></div><div class="pref-google-compact"><div><strong>Sincronizzazione con Google Calendar</strong><small>${googleAdvanced?.connected?`Collegato a ${esc(googleAdvanced.calendarId||state.googleCalendarEmail||'primary')}`:googleAdvanced?.needsReauthorization?'Da ricollegare':'Non collegato'}</small></div><span class="badge ${googleAdvanced?.connected?'success':googleAdvanced?.needsReauthorization?'warning':''}">${googleAdvanced?.connected?'Collegato':googleAdvanced?.needsReauthorization?'Da ricollegare':'Facoltativo'}</span></div></div><div class="pref-google-consent-row"><label class="check-row"><input type="checkbox" id="googleHealthDataConsentToggle" ${googleAdvanced?.healthDataConsent?.granted?'checked':''}><span><strong>Autorizzo il trasferimento a Google Calendar degli appuntamenti sanitari personali e dei profili Agenda che posso visualizzare</strong><small>Gli eventi condivisi indicano sempre il titolare nel titolo. Revocando il consenso la sincronizzazione si interrompe; l'Agenda locale resta invariata.</small></span></label><div class="row-actions"><button type="button" class="btn btn-primary" id="googleOAuthConnectBtn">${googleAdvanced?.connected?'Riautorizza Google Calendar':googleAdvanced?.needsReauthorization?'Ricollega Google Calendar':'Collega Google Calendar'}</button>${googleAdvanced?.connected?'<button type="button" class="btn btn-danger" id="googleOAuthDisconnectBtn">Scollega Google Calendar</button>':''}</div></div><div class="pref-agenda-lower"><div class="agenda-reminders-group"><label>Avvisi predefiniti Agenda</label><div class="calendar-reminder-grid">${CALENDAR_REMINDERS.map(([value,label])=>`<label class="check-row compact"><input type="checkbox" name="agendaDefaultReminder" value="${value}" ${calendarDefaultReminders().includes(Number(value))?'checked':''}><span>${esc(label)}</span></label>`).join('')}</div><small>Fino a 5 avvisi, modificabili anche sul singolo evento.</small></div><div class="agenda-medication-settings"><div class="form-group agenda-reorder-group"><label>Raggruppamento riordini farmaci</label><select name="medicationReorderGroupDays" class="form-control">${Array.from({length:11},(_,i)=>`<option value="${i}" ${Number(g.medicationReorderGroupDays??7)===i?'selected':''}>${i===0?'Non raggruppare':`${i} ${i===1?'giorno':'giorni'}`}</option>`).join('')}</select><small>Riunisce in un solo promemoria i riordini ravvicinati.</small></div><label class="check-row medication-google-name"><input type="checkbox" id="googleMedicationDataConsentToggle" ${googleAdvanced?.medicationDataConsent?.granted?'checked':''} ${(googleAdvanced?.healthDataConsent?.granted&&globalThis.DossierFeatures?.has?.('googleMedicationSync'))?'':'disabled'}><span><strong>Mostra i nomi dei farmaci nei promemoria Google</strong><small>${globalThis.DossierFeatures?.has?.('googleMedicationSync')?'Consenso separato e revocabile.':'Disponibile nella versione completa.'}</small></span></label></div></div>${developerModeActive()?`<details class="pref-developer-google"><summary><strong>Modalità sviluppatore · configurazione tecnica Google Calendar</strong></summary><div class="form-grid"><div class="form-group span-2"><label>Client ID Google</label><input type="text" id="googleOAuthClientId" class="form-control" autocomplete="off" value="${esc(googleAdvanced?.clientId||'')}"></div><div class="form-group span-2"><label>Client secret Google</label><input type="password" id="googleOAuthClientSecret" class="form-control" autocomplete="new-password"></div><div class="form-group span-2"><label>ID calendario tecnico</label><input type="text" id="googleOAuthCalendarId" class="form-control" autocomplete="off" value="${esc(googleAdvanced?.calendarId||state.googleCalendarEmail||'primary')}"></div></div><div class="row-actions"><button type="button" class="btn btn-light" id="googleOAuthSaveBtn">Salva configurazione tecnica</button><button type="button" class="btn btn-light" id="googleOAuthResetOfficialBtn">Ripristina configurazione ufficiale</button><button type="button" class="btn btn-danger" id="developerModeDisableBtn">Disattiva modalità sviluppatore</button></div></details>`:''}</section>
      <section class="card preference-section pref-pdf"><div class="card-title-row"><div><h2>Dossier PDF</h2><p class="kpi-note">Scegli le sezioni e i grafici da inserire per questo profilo.</p></div></div><div class="form-grid"><div class="form-group"><label>Diagnosi e problemi</label><select name="pdfDiagnosisMode" class="form-control"><option value="both" ${p.pdfDiagnosisMode==='both'?'selected':''}>Versione estesa + tabella completa</option><option value="main" ${p.pdfDiagnosisMode==='main'?'selected':''}>Solo versione estesa</option><option value="table" ${p.pdfDiagnosisMode==='table'?'selected':''}>Solo tabella completa</option><option value="none" ${p.pdfDiagnosisMode==='none'?'selected':''}>Non inserire</option></select></div><label class="check-row"><input type="checkbox" name="includeHealthCard" ${p.includeHealthCard?'checked':''}><span><strong>Includi tessera sanitaria</strong><small>Fronte e retro, se disponibili.</small></span></label><label class="check-row"><input type="checkbox" name="includeDoctorPhone" ${p.includeDoctorPhone?'checked':''}><span><strong>Includi telefono del medico</strong><small>Viene riportato solo quando è stato impostato.</small></span></label><label class="check-row"><input type="checkbox" name="pdfSpaceSaving" ${p.pdfSpaceSaving?'checked':''}><span><strong>Risparmia spazio</strong><small>Consente a referti e visite di iniziare nello spazio disponibile della pagina precedente, evitando pagine parzialmente vuote.</small></span></label><label class="check-row"><input type="checkbox" name="pdfIncludeGraphs" ${p.pdfIncludeGraphs?'checked':''}><span><strong>Includi grafici selezionati</strong><small>A monitor continuerà a essere mostrato un grafico alla volta.</small></span></label></div><div class="section-spacer pref-pdf-graphs-spacer"></div><h3 class="pref-pdf-graphs-title">Grafici da inserire</h3>${pdfGraphsHtml}</section>
      <section class="card preference-section pref-docs"><div class="card-title-row"><div><h2>Documenti, OCR e backup</h2><p class="kpi-note">Impostazioni generali del programma.</p></div></div><div class="form-grid"><label class="check-row"><input type="checkbox" name="confirmImports" ${g.confirmImports?'checked':''}><span><strong>Conferma sempre le estrazioni</strong><small>Terapie, diagnosi ed esenzioni vengono mostrate prima del salvataggio.</small></span></label><div class="form-group"><label>Frequenza promemoria backup</label><select name="backupFrequency" class="form-control"><option value="manual" ${g.backupFrequency==='manual'?'selected':''}>Manuale</option><option value="daily" ${g.backupFrequency==='daily'?'selected':''}>Giornaliera</option><option value="weekly" ${g.backupFrequency==='weekly'?'selected':''}>Settimanale</option><option value="monthly" ${g.backupFrequency==='monthly'?'selected':''}>Mensile</option></select></div></div><div class="storage-card"><strong>Spazio del dispositivo</strong><span>${storage?.quota?`${formatBytes(storage.usage)} occupati · ${formatBytes(storage.free)} disponibili nel contenitore del browser`:'Stima non disponibile su questo dispositivo'}</span><button type="button" class="btn btn-light btn-small" id="refreshStorageBtn">Aggiorna stima</button></div></section>
      ${state.lastClinicalMigrationReport?`<section class="card preference-section pref-test22"><div class="card-title-row"><div><h2>Rapporto completamento clinico TEST 22</h2><p class="kpi-note">Completamento mirato di riferimenti e sezioni narrative. L’interfaccia resta utilizzabile durante l’elaborazione.</p></div><span class="badge ${state.lastClinicalMigrationReport.blocked||state.lastClinicalMigrationReport.errors?.length?'warning':'success'}">${state.lastClinicalMigrationReport.blocked?'Bloccata':state.lastClinicalMigrationReport.rolledBack?'Ripristinata':state.lastClinicalMigrationReport.errors?.length?'Con errori':'Completata'}</span></div><div class="backup-report-grid">${[['Documenti analizzati',state.lastClinicalMigrationReport.documentsAnalyzed],['Documenti laboratorio',state.lastClinicalMigrationReport.labDocumentsAnalyzed],['Documenti modificati',state.lastClinicalMigrationReport.documentsChanged],['Riferimenti completati',state.lastClinicalMigrationReport.referencesResolved],['Sezioni unificate',state.lastClinicalMigrationReport.sectionsUnified],['Stati non applicabili',state.lastClinicalMigrationReport.nonApplicable],['Da verificare rimasti',state.lastClinicalMigrationReport.verifyRemaining],['Errori',state.lastClinicalMigrationReport.errors?.length||0]].map(([label,value])=>`<div><small>${esc(label)}</small><strong>${Number(value||0)}</strong></div>`).join('')}</div>${state.lastClinicalMigrationReport.preflightViolations?.length?`<details style="margin-top:14px" open><summary><strong>Controlli preventivi non superati</strong></summary><div class="list-stack" style="margin-top:10px">${state.lastClinicalMigrationReport.preflightViolations.slice(0,100).map(x=>`<div class="list-item"><span>${esc(x.file||x.documentId)} · ${esc(x.message||'')}</span></div>`).join('')}</div></details>`:''}<details style="margin-top:14px"><summary><strong>Documenti con righe ancora da verificare</strong></summary><div class="list-stack" style="margin-top:10px">${(state.lastClinicalMigrationReport.doubtfulDocuments||[]).slice(0,100).map(x=>`<div class="list-item"><span>${esc(x.file||x.documentId)}</span><strong>${Number(x.rows||0)}</strong></div>`).join('')||'<div class="notice">Nessun documento dubbio registrato.</div>'}</div></details>${state.lastClinicalMigrationReport.applied&&!state.lastClinicalMigrationReport.rolledBack?'<div class="row-actions" style="margin-top:14px"><button type="button" class="btn btn-danger" id="rollbackTest22Btn">Ripristina dati precedenti alla TEST 22</button></div>':''}</section>`:''}
      <section class="card preference-section pref-warnings" id="generalWarningsSection"><div class="card-title-row"><div><h2>Avvertenze generali</h2><p class="kpi-note">Limitazioni d'uso delle interpretazioni automatiche.</p></div><span class="badge warning">Da consultare</span></div><div class="notice warning"><strong>Il Dossier è uno strumento di organizzazione e supporto informativo.</strong><br>Le classificazioni automatiche non costituiscono diagnosi, non modificano i referti originali e non sostituiscono la valutazione del laboratorio o del medico. Gli intervalli possono dipendere da metodo, unità, età, sesso e condizioni cliniche. Quando manca un riferimento utilizzabile nel referto, il Dossier lascia il dato da verificare e non applica intervalli esterni o ricavati da altri documenti per attribuirgli autonomamente un significato clinico.</div><button type="button" class="btn btn-light" id="reviewGeneralWarningsBtn">Rileggi le avvertenze</button></section>
      ${securityHtml}
      <div class="form-actions preference-actions"><button type="button" class="btn btn-light" id="resetPreferencesBtn">Ripristina impostazioni predefinite</button><button class="btn btn-primary">Salva preferenze</button></div></form>`;
    polishPreferencesLayout();
    setTimeout(polishPreferencesLayout,80);
    setTimeout(polishPreferencesLayout,300);
    if(!hasActiveProfile){
      const sections=[...$('#viewContainer').querySelectorAll('.preference-section')];
      for(const section of sections){
        const title=section.querySelector('h2')?.textContent?.trim();
        if(title==='Aspetto generale'||title==='Dossier PDF') section.innerHTML=`<div class="card-title-row"><div><h2>${esc(title)}</h2><p class="kpi-note">Queste impostazioni diventano disponibili dopo la creazione o il ripristino di almeno un profilo sanitario.</p></div></div><div class="notice">Apri Backup per ripristinare un archivio esistente oppure usa “Aggiungi persona”.</div>`;
      }
    }
    DossierSecurity.bindPreferences($('#viewContainer'));
    $('[name="profileColor"]')?.addEventListener('input',e=>{const preview=profilePalette(e.target.value,PALETTES.teal);for(const [k,v] of Object.entries({'--primary':preview.primary,'--primary-dark':preview.primaryDark,'--primary-soft':preview.primarySoft,'--sidebar':preview.sidebar,'--line':preview.line,'--bg':preview.bg,'--surface-2':preview.surface2,'--chart-secondary':preview.chart2,'--profile-accent':preview.primary}))document.documentElement.style.setProperty(k,v);});
    const refreshSelectedGraphChoice=input=>{const label=input?.closest?.('.graph-choice');if(!label)return;label.style.background=input.checked?'color-mix(in srgb,var(--profile-accent) 30%,white)':'';label.style.borderColor=input.checked?'color-mix(in srgb,var(--profile-accent) 72%,var(--line))':'';};
    $$('input[name="selectedGraphs"]',$('#preferencesForm')).forEach(input=>{refreshSelectedGraphChoice(input);input.addEventListener('change',()=>refreshSelectedGraphChoice(input));});
    $('#copyLicenseDossierIdBtn')?.addEventListener('click',async()=>{const id=String(globalThis.DossierFeatures?.current?.()?.dossierId||'');if(!id)return;try{await navigator.clipboard.writeText(id);toast('ID Dossier copiato');}catch{const input=$('#licenseDossierId');input?.select?.();document.execCommand?.('copy');toast('ID Dossier copiato');}});
    $('#refreshLicenseBtn')?.addEventListener('click',async()=>{const button=$('#refreshLicenseBtn');if(button){button.disabled=true;button.textContent='Verifica…';}try{await DossierFeatures.refresh({force:true});toast(`Piano ${DossierFeatures.current().plan} verificato`);await renderPreferences();}catch(error){alert(`Verifica licenza: ${error.message}`);}finally{if(button){button.disabled=false;button.textContent='Verifica licenza';}}});
    if(!googlePlanEnabled){for(const el of ['googleCalendarEmail','googleHealthDataConsentToggle','googleMedicationDataConsentToggle','googleOAuthConnectBtn','googleOAuthDisconnectBtn','googleOAuthSaveBtn','googleOAuthResetOfficialBtn'].map(id=>$('#'+id)).filter(Boolean))el.disabled=true;}
    if(!globalThis.DossierFeatures?.has?.('temporalGraphs')){const dash=$('[name="dashboardOverviewChart"]'),pdf=$('[name="pdfIncludeGraphs"]');if(dash)dash.disabled=true;if(pdf){pdf.checked=false;pdf.disabled=true;}}
    $('#refreshStorageBtn').onclick=async()=>{await refreshStorageEstimate();renderPreferences();};
    $('#rollbackTest22Btn')?.addEventListener('click',rollbackTest22ClinicalMigration);
    $('#googleHealthDataConsentToggle')?.addEventListener('change',async e=>{
      const toggle=e.currentTarget;toggle.disabled=true;
      const granting=Boolean(toggle.checked);
      try{
        const consentResult=await DossierCalendar.googleAdvancedSetHealthConsent(granting);
        if(granting){
          const googleStatus=await DossierCalendar.googleAdvancedStatus();
          if(googleStatus?.connected){
            const context=await loadFamilyAgendaContext();const syncRows=calendarOperationalEvents(context.events).map(row=>row.familyMedicationGroup?{...row,calendarOwnerName:''}:calendarOwnerEvent(row));
            const syncResult=await DossierCalendar.googleAdvancedSyncAll(syncRows,'Agenda familiare');
            const errors=Number(syncResult?.errorCount||0);
            toast(errors?`Consenso registrato. ${errors} appuntamenti non sincronizzati`:'Consenso registrato: Agenda sincronizzata con Google Calendar');
          }else{
            toast('Consenso Google Calendar registrato');
          }
        }else{
          const cleanupErrors=Number(consentResult?.cleanup?.errorCount||0);
          toast(cleanupErrors?'Consenso revocato. Alcuni eventi Google non sono stati rimossi: riprova quando la connessione è disponibile':'Consenso revocato: eventi del Dossier rimossi da Google Calendar');
        }
        await renderPreferences();
      }
      catch(error){toggle.checked=!toggle.checked;alert(`Consenso Google Calendar: ${error.message}`);}
      finally{toggle.disabled=false;}
    });
    $('#googleMedicationDataConsentToggle')?.addEventListener('change',async e=>{
      const toggle=e.currentTarget;
      if(!globalThis.DossierFeatures?.has?.('googleMedicationSync')){toggle.checked=false;toggle.disabled=true;return;}
      toggle.disabled=true;
      const granting=Boolean(toggle.checked);
      try{
        const result=await DossierCalendar.googleAdvancedSetMedicationConsent(granting);
        if(granting){
          if(activeProfile())await syncMedicationReorderAgenda(activeProfile());
          toast('Consenso ai nomi dei farmaci registrato');
        }else{
          const errors=Number(result?.cleanup?.errorCount||0);
          toast(errors?'Consenso revocato. Alcuni promemoria farmaci Google non sono stati rimossi':'Consenso revocato: promemoria farmaci rimossi da Google Calendar');
        }
        await renderPreferences();
      }catch(error){
        toggle.checked=!toggle.checked;
        alert(`Consenso promemoria farmaci: ${error.message}`);
      }finally{toggle.disabled=false;}
    });
    $('#googleOAuthSaveBtn')?.addEventListener('click',async()=>{
      const button=$('#googleOAuthSaveBtn');if(button)button.disabled=true;
      try{await DossierCalendar.googleAdvancedConfigure({clientId:String($('#googleOAuthClientId')?.value||'').trim(),clientSecret:String($('#googleOAuthClientSecret')?.value||''),calendarId:String($('#googleOAuthCalendarId')?.value||'primary').trim()||'primary'});toast('Configurazione OAuth Google salvata su questo dispositivo');await renderPreferences();}catch(error){alert(`Configurazione Google Calendar: ${error.message}`);}finally{if(button)button.disabled=false;}
    });
    $('#googleOAuthResetOfficialBtn')?.addEventListener('click',async()=>{
      const button=$('#googleOAuthResetOfficialBtn');if(button)button.disabled=true;
      try{
        const calendarId=String($('#googleOAuthCalendarId')?.value||$('#googleCalendarEmail')?.value||state.googleCalendarEmail||'primary').trim()||'primary';
        await DossierCalendar.googleAdvancedConfigure({official:true,calendarId});
        toast('Configurazione Google ufficiale ripristinata');
        await renderPreferences();
      }catch(error){alert(`Ripristino configurazione Google: ${error.message}`);}
      finally{if(button)button.disabled=false;}
    });
    $('#developerModeDisableBtn')?.addEventListener('click',async()=>{
      await DossierSecurity.setDeveloperMode(false);
      updateDeveloperModeBadge();
      toast('Modalità sviluppatore disattivata · timeout ripristinato');
      await renderPreferences();
    });
    $('#googleOAuthConnectBtn')?.addEventListener('click',async()=>{
      if(!googleAdvanced?.healthDataConsent?.granted){alert('Prima autorizza il trasferimento dei dati degli appuntamenti sanitari a Google Calendar.');return;}
      const accountEmail=String($('#googleCalendarEmail')?.value||state.googleCalendarEmail||'').trim();
      if(!accountEmail||!accountEmail.includes('@')){alert('Inserisci prima l\'indirizzo Google Calendar che vuoi associare.');return;}
      try{await DossierCalendar.googleAdvancedConfigure({official:true,calendarId:accountEmail});}
      catch(error){alert(`Preparazione Google Calendar: ${error.message}`);return;}
      try{
        const result=await DossierCalendar.googleAdvancedStartOAuth();
        toast(result?.opened?'Completa l’autorizzazione Google nel browser':'Autorizzazione Google pronta');
        startGoogleOAuthStatusPolling();
      }catch(error){alert(`Collegamento Google Calendar: ${error.message}`);}
    });
    function startGoogleOAuthStatusPolling(){
      const started=Date.now();
      const timer=setInterval(async()=>{
        if(Date.now()-started>180000){clearInterval(timer);return;}
        const st=await DossierCalendar.googleAdvancedStatus();
        if(st?.connected){
          clearInterval(timer);
          let aligned=true;
          try{
            if(st?.healthDataConsent?.granted){
              const context=await loadFamilyAgendaContext();const syncRows=calendarOperationalEvents(context.events).map(row=>row.familyMedicationGroup?{...row,calendarOwnerName:''}:calendarOwnerEvent(row));
              const result=await DossierCalendar.googleAdvancedSyncAll(syncRows,'Agenda familiare');
              aligned=Number(result?.errorCount||0)===0;
            }
          }catch(error){aligned=false;console.warn('Riallineamento automatico Google Calendar rinviato:',error);}
          if(state.activeView==='preferences')await renderPreferences();
          if(state.activeView==='calendar')await renderCalendar();
          toast(aligned?'Google Calendar collegato e agenda riallineata':'Google Calendar collegato. Alcuni appuntamenti restano da riallineare.');
        }
      },1500);
    }
    $('#googleOAuthDisconnectBtn')?.addEventListener('click',async()=>{if(!confirm('Disconnettere Google Calendar da questo dispositivo? Gli eventi già creati su Google non vengono cancellati.'))return;try{await DossierCalendar.googleAdvancedDisconnect();await renderPreferences();toast('Google Calendar disconnesso');}catch(error){alert(error.message);}});
    const agendaDefaultReminderInputs=[...$('#preferencesForm').querySelectorAll('input[name="agendaDefaultReminder"]')];
    const refreshAgendaDefaultReminderLimit=()=>{const selectedCount=agendaDefaultReminderInputs.filter(input=>input.checked).length;agendaDefaultReminderInputs.forEach(input=>{input.disabled=selectedCount>=5&&!input.checked;input.closest('.check-row')?.classList.toggle('disabled',input.disabled);});};
    agendaDefaultReminderInputs.forEach(input=>input.addEventListener('change',refreshAgendaDefaultReminderLimit));refreshAgendaDefaultReminderLimit();
    $('#resetPreferencesBtn').onclick=async()=>{if(!confirm('Ripristinare le preferenze predefinite?'))return;await saveGlobalPreferences(DEFAULT_GLOBAL_PREFS);await saveProfilePreferences(DEFAULT_PROFILE_PREFS);renderPreferences();toast('Preferenze ripristinate');};
    $('#preferencesForm').onsubmit=async e=>{
      e.preventDefault();
      const form=e.target;const submit=form.querySelector('button[type="submit"]');const normalLabel=submit?.textContent||'Salva preferenze';
      if(submit){submit.disabled=true;submit.textContent='Salvataggio in corso…';}
      try{
        const fd=new FormData(form);const securityTimeoutValue=$('#securityTimeout')?.value;
        const agendaReminderSelection=fd.getAll('agendaDefaultReminder').map(Number).filter(v=>CALENDAR_REMINDER_VALUES.has(v)).slice(0,5);const userGoogleEmail=String(fd.get('googleCalendarEmail')||'').trim();const global={palette:g.palette||'teal',theme:'light',textScale:'normal',density:'comfortable',confirmImports:fd.has('confirmImports'),backupFrequency:fd.get('backupFrequency'),googleCalendarEmail:'',agendaDefaultReminders:agendaReminderSelection,medicationReorderGroupDays:Math.max(0,Math.min(10,Number(fd.get('medicationReorderGroupDays')??7)))};
        const profile={profileColor:fd.get('profileColor')||p.profileColor,therapySort:p.therapySort,diagnosisSort:p.diagnosisSort,diagnosisView:p.diagnosisView||'extended',dashboardOverviewChart:globalThis.DossierFeatures?.has?.('temporalGraphs')?(fd.get('dashboardOverviewChart')||p.dashboardOverviewChart||'weight'):(activeProfile()?.preferences?.dashboardOverviewChart||p.dashboardOverviewChart||'weight'),exemptionView:fd.get('exemptionView')||p.exemptionView,pdfDiagnosisMode:fd.get('pdfDiagnosisMode'),includeHealthCard:fd.has('includeHealthCard'),includeDoctorPhone:fd.has('includeDoctorPhone'),pdfSpaceSaving:fd.has('pdfSpaceSaving'),pdfIncludeGraphs:globalThis.DossierFeatures?.has?.('temporalGraphs')?fd.has('pdfIncludeGraphs'):Boolean(activeProfile()?.preferences?.pdfIncludeGraphs),selectedGraphs:globalThis.DossierFeatures?.has?.('temporalGraphs')?fd.getAll('selectedGraphs'):(activeProfile()?.preferences?.selectedGraphs||p.selectedGraphs||[])};
        const previousEmail=String(state.googleCalendarEmail||'').trim();const previousGroupDays=Number(g.medicationReorderGroupDays??7);const previousAgendaReminders=JSON.stringify(calendarDefaultReminders().slice().sort((a,b)=>a-b));
        await saveGlobalPreferences(global);await saveCalendarUserEmail(userGoogleEmail);await saveProfilePreferences(profile);
        localStorage.setItem('backupFrequency',global.backupFrequency);toast('Preferenze salvate');
        const calendarDefaultsChanged=previousGroupDays!==Number(global.medicationReorderGroupDays)||previousAgendaReminders!==JSON.stringify((global.agendaDefaultReminders||[1440]).slice().sort((a,b)=>a-b));
        setTimeout(()=>{void (async()=>{
          try{if(userGoogleEmail&&userGoogleEmail.includes('@')&&userGoogleEmail!==previousEmail)await DossierCalendar.googleAdvancedConfigure({official:true,calendarId:userGoogleEmail});}catch(error){console.warn('Configurazione Google Calendar rinviata:',error);toast(`Preferenze salvate. Google Calendar da verificare: ${error.message}`);}
          try{if(calendarDefaultsChanged&&activeProfile()){await syncHealthCardExpiryAgenda(activeProfile());await syncMedicationReorderAgenda(activeProfile());}}catch(error){console.warn('Aggiornamento promemoria Agenda rinviato:',error);toast(`Preferenze salvate. Promemoria Agenda da verificare: ${error.message}`);}
          try{if(securityTimeoutValue)await DossierSecurity.saveSecuritySettings({timeoutMinutes:Number(securityTimeoutValue)});}catch(error){console.warn('Impostazione sicurezza non aggiornata:',error);toast(`Preferenze salvate. Timeout sicurezza da verificare: ${error.message}`);}
          if(state.activeView==='preferences')void renderPreferences();
        })();},0);
      }catch(error){console.error('Salvataggio preferenze non riuscito:',error);alert(`Impossibile salvare le preferenze: ${error.message}`);}
      finally{if(submit){submit.disabled=false;submit.textContent=normalLabel;}}
    };
  }

  function backupReportHtml(title,report){
    if(!report)return'';
    const missing=Array.isArray(report.missing)?report.missing.length:Number(report.missing||0);
    const corrupt=Array.isArray(report.corrupt)?report.corrupt.length:Number(report.corrupt||0);
    const unassociated=Array.isArray(report.unassociated)?report.unassociated.length:Number(report.unassociated||0);
    const conflicts=Number(report.conflicts||0),duplicates=Number(report.duplicates||0),possibleDuplicates=Number(report.possibleDuplicates||0),imported=Number(report.imported||0);
    const ok=missing===0&&corrupt===0;
    const rows=report.mode?[
      ['Modalità',restoreModeLabel(report.mode)],['Importati',imported],['Duplicati già presenti',duplicates],['Possibili versioni simili',possibleDuplicates],
      ['Conflitti: mantenuti attuali',conflicts],['Profili creati',report.createdProfiles||0],['Corrotti',corrupt],['Mancanti',missing]
    ]:[
      ['File verificati',report.found||0],['Corrotti',corrupt],['Non associati',unassociated],['Mancanti',missing]
    ];
    return `<section class="card backup-verification-card"><div class="card-title-row"><div><h2>${esc(title)}</h2><p class="kpi-note">${esc(report.message||'Controllo fisico completato.')}</p></div><span class="badge ${ok?'success':'warning'}">${ok?'Verificato':'Da controllare'}</span></div><div class="backup-report-grid">${rows.map(([label,value])=>`<div><small>${esc(label)}</small><strong>${typeof value==='number'?value:esc(value)}</strong></div>`).join('')}</div>${report.legacy?'<div class="notice warning">Backup creato da una versione precedente: struttura e file originali verificati; le vecchie versioni non disponevano ancora delle impronte SHA-256 per ogni voce.</div>':''}</section>`;
  }

  function renderHelp(){
    const megaHome='https://mega.io/';
    $('#viewContainer').innerHTML=`
      <section class="card help-continuous">
        <div class="card-title-row"><div><p class="kpi-note">Guida pratica a <strong>Clinica Digitale - Dossier Sanitario</strong>, scritta per essere utilizzabile senza conoscenze tecniche.</p></div></div>
        <div class="notice success help-security-declaration"><strong>Protezione dei dati, GDPR e servizi esterni.</strong><br>Clinica Digitale - Dossier Sanitario è progettato secondo i principi di protezione dei dati personali e sanitari previsti dal GDPR, con archivio locale cifrato, credenziali personali e controlli di accesso. Il secondo fattore di autenticazione diventa obbligatorio quando i dati del Dossier vengono associati a un cloud esterno, perché in quel caso le informazioni protette escono dal solo perimetro del computer locale. Clinica Digitale protegge il collegamento e il contenuto affidato al cloud secondo l'architettura prevista dal Dossier; sicurezza, disponibilità e gestione dell'infrastruttura del servizio esterno restano invece soggette alle responsabilità, alle condizioni e alle misure di sicurezza del provider scelto, nei limiti stabiliti dalla legge. L'attivazione di un cloud è facoltativa. Questa ripartizione descrive i diversi ambiti tecnici e non sostituisce le responsabilità inderogabili previste dalla normativa applicabile.</div>
        <div class="help-continuous-text">
          <p><strong>1. Che cos'è Clinica Digitale.</strong> Clinica Digitale raccoglie e organizza in un unico Dossier personale documenti, referti, terapie, diagnosi riportate nei documenti, valori di laboratorio, medici, appuntamenti e misurazioni. Il documento originale viene conservato insieme alle informazioni estratte, così puoi sempre risalire alla fonte.</p>

          <p><strong>2. Profili e account.</strong> Il <strong>profilo sanitario</strong> è la persona a cui appartengono i dati clinici. L'<strong>account</strong> è invece la persona che accede al programma. Ogni utente usa le proprie credenziali e i propri permessi. Password, codici temporanei e dati di recupero sono personali.</p>

          <p><strong>3. Dossier familiare e accesso ai dati di un altro adulto.</strong> Un Dossier familiare può comprendere più profili e più account. L'appartenenza alla famiglia non dà automaticamente diritto a leggere i dati sanitari di un altro adulto: l'accesso deve essere autorizzato e deve poter essere revocato. Gli altri utenti non devono conoscere le credenziali del provider cloud dell'amministratore.</p>

          <p><strong>4. Aggiungere un familiare.</strong> L'amministratore deve avere configurato l'archivio cloud familiare. In <strong>Preferenze → Sicurezza e accessi</strong> preme <strong>Genera password familiare</strong>: Clinica Digitale genera una <strong>sola password familiare di 15 caratteri</strong>, valida 48 ore e utilizzabile una sola volta. Non si sceglie preventivamente il familiare e non vengono comunicati codici lunghi, UUID, chiavi o credenziali del provider cloud. Il familiare installa Clinica Digitale, sceglie <strong>Ho una password familiare</strong> e inserisce soltanto quella password. Se possiede già un account creato dall'amministratore, accede con le credenziali già ricevute e mantiene il collegamento al profilo esistente. Se non possiede ancora un account, crea autonomamente le proprie credenziali e, dopo l'ingresso, può creare il proprio profilo sanitario. Prima dell'accesso operativo ai dati cloud deve essere attivato il secondo fattore personale. Sono compatibili 2FAS Authenticator, consigliato per semplicità, Google Authenticator, Microsoft Authenticator e le altre app TOTP. Il QR è affiancato dalla chiave manuale copiabile. In <strong>Preferenze → Sicurezza e accessi</strong> è inoltre possibile cambiare app di autenticazione senza disattivare prima quella esistente: il vecchio autenticatore resta valido finché il nuovo codice non viene verificato.</p>

          <p><strong>5. Account familiari già esistenti nelle versioni precedenti.</strong> Se Gaia, Maria Giovanna o un altro adulto possiedono già un account creato in passato dall'amministratore, non viene creato un duplicato e non viene perso il collegamento al profilo sanitario. Al primo accesso con le vecchie credenziali il Dossier riconosce l'account precedente e chiede alla persona di renderlo personale: deve scegliere una nuova password e una nuova domanda/risposta di recupero che l'amministratore non conosce. Se il Dossier familiare utilizza un cloud esterno, dopo la personalizzazione viene richiesto anche il codice temporaneo personale tramite TOTP prima di aprire i dati sanitari. Se la persona non ricorda le vecchie credenziali, l'amministratore può reimpostare le credenziali dell'account già esistente e generare una nuova password familiare, senza creare un secondo profilo o un secondo account sanitario.</p>

          <p><strong>6. Uscita dal Dossier familiare e migrazione del proprio profilo.</strong> Un adulto può esportare esclusivamente il proprio profilo per trasferirlo in un nuovo Dossier, per esempio quando un figlio crea una propria famiglia o in caso di separazione tra coniugi. Il pacchetto di migrazione contiene soltanto quel profilo e i relativi documenti, diagnosi, terapie, medici, monitoraggi, Agenda, tessera e storico necessari; non include credenziali cloud o dati degli altri familiari. Il pacchetto viene verificato con manifest, conteggi e impronte SHA-256 prima del download. L'esportazione non autorizza automaticamente la cancellazione dal Dossier di origine. L'amministratore può sospendere l'accesso dell'account, ma non può cancellare unilateralmente il profilo sanitario dell'adulto. Soltanto la persona interessata, dopo avere verificato la migrazione nel nuovo Dossier, può registrare l'autorizzazione alla rimozione dal Dossier familiare originario. Se questa autorizzazione non viene data, i dati originari restano conservati.</p>

          <p><strong>7. Nuovo computer o altro dispositivo.</strong> Un utente già creato accede con il proprio account. L'autorizzazione riguarda la persona e i suoi permessi nel Dossier, non la conoscenza delle credenziali cloud. Dopo l'associazione prevista dal Dossier, l'utente può usare i dispositivi autorizzati senza dover configurare manualmente il provider della famiglia.</p>

          <p><strong>8. Importare documenti.</strong> Puoi importare PDF e immagini compatibili, comprese fotografie di documenti sanitari. Clinica Digitale legge il testo, tenta di riconoscere tipologia, specialità, data, struttura, medico e informazioni utili e conserva sempre l'originale. Le informazioni estratte possono essere controllate e, dove previsto, corrette manualmente.</p>

          <p><strong>9. Diagnosi.</strong> Clinica Digitale <strong>non formula diagnosi autonome</strong>. La sezione Diagnosi organizza diagnosi e condizioni riportate esplicitamente nei documenti oppure inserite manualmente dall'utente. Quando il testo non consente un'attribuzione sicura, il dato resta da verificare invece di essere trasformato automaticamente in una diagnosi "confermata" o "attiva".</p>

          <p><strong>10. Esami di laboratorio.</strong> I valori vengono mostrati insieme agli intervalli di riferimento presenti nel relativo referto. Se il documento non contiene un riferimento utilizzabile, il Dossier non applica automaticamente intervalli esterni o ricavati da altri referti per attribuire un significato diagnostico al risultato.</p>

          <p><strong>11. Terapie e archivio AIFA.</strong> La sezione Terapie organizza farmaci, dosaggi, orari, giorni di assunzione e note. L'archivio locale dei medicinali deriva dagli Open Data dell'<strong>Agenzia Italiana del Farmaco (AIFA)</strong>, licenza CC BY 4.0. Quando un nome può indicare più medicinali, il Dossier propone le corrispondenze e lascia scegliere quella corretta invece di indovinare.</p>

          <p><strong>12. Dosaggi complessi.</strong> Puoi registrare quantità frazionarie, per esempio <strong>0,5</strong> o <strong>1,5</strong> compresse al giorno, più assunzioni nella stessa giornata e giorni diversi della settimana. Per schemi come Eutirox 150 µg per 5 giorni e 175 µg per 2 giorni si registrano le due dosi con i rispettivi giorni.</p>

          <p><strong>13. Scorte e riordino dei farmaci.</strong> Puoi indicare unità per confezione, numero di confezioni disponibili, quantità assunta nelle singole somministrazioni e data reale di inizio della scorta. Il Dossier calcola l'esaurimento e consente di scegliere il preavviso di riordino per ciascun farmaco. I farmaci che richiedono ricetta possono essere raggruppati nella richiesta familiare entro la finestra scelta, fino a 10 giorni; i farmaci acquistabili senza ricetta restano invece promemoria di acquisto separati, così il preavviso può essere aumentato quando servono tempi di consegna. In Preferenze puoi inoltre impostare fino a 5 avvisi Agenda.</p>

          <p><strong>14. Più somministrazioni dello stesso farmaco.</strong> Le impostazioni della scorta vengono condivise tra le righe dello <strong>stesso farmaco e dello stesso dosaggio</strong>. Devi impostare il totale giornaliero una sola volta. Esempio: Omega 3, una capsula mattino + una a pranzo + una alla sera = <strong>3 al giorno</strong>; il Dossier genera un solo conteggio e un solo promemoria, non tre.</p>

          <p><strong>15. Se cambia il piano terapeutico.</strong> Se il medico modifica quantità o giorni di assunzione mentre una confezione è già iniziata, indica la <strong>decorrenza della modifica</strong>. Clinica Digitale conserva il consumo precedente, ricalcola la scorta residua e sposta il promemoria. Se avevi indicato una data di acquisto ma inizi realmente la confezione più tardi, correggi la data di inizio: la vecchia scadenza viene sostituita da quella ricalcolata.</p>

          <p><strong>16. Agenda locale.</strong> L'Agenda funziona anche senza Internet, cloud o Google Calendar. Puoi registrare visite, esami, richieste, rinnovi e altre scadenze sanitarie, indicando data, ora, durata, luogo, note e fino a <strong>5 avvisi</strong>.</p>

          <p><strong>17. Google Calendar: collegamento semplice.</strong> Nessun utente deve entrare nella Google Cloud Console o creare Client ID, secret, progetti o configurazioni tecniche. Vai in <strong>Preferenze → Agenda</strong>, inserisci l'indirizzo Google da associare, autorizza il trasferimento dei dati degli appuntamenti e premi <strong>Collega Google Calendar</strong>. Google ti chiederà di scegliere/accedere al tuo account e di autorizzare Clinica Digitale. Se non colleghi Google Calendar, l'Agenda locale continua a funzionare normalmente.</p>

          <p><strong>18. Dati inviati a Google Calendar.</strong> Quando autorizzi la sincronizzazione possono essere trasferiti i dati necessari agli eventi personali e agli eventi dei profili Agenda che sei autorizzato a visualizzare, come titolo con nome del titolare, profilo interessato, categoria, data, ora, durata, luogo, note, documento di origine e avvisi. La sincronizzazione dei nomi dei farmaci richiede un consenso separato. Revocando il consenso, Clinica Digitale elimina da Google Calendar i promemoria farmaci creati dal Dossier e mantiene quelli locali.</p>

          <p><strong>19. Cloud e backup.</strong> Il cloud è facoltativo. Clinica Digitale continua a funzionare localmente anche senza collegamenti esterni. Se utilizzi un provider compatibile, l'archivio cifrato può essere sincronizzato e ripristinato sui dispositivi autorizzati. Puoi inoltre creare backup locali indipendenti e conservarli su un disco, una chiavetta USB o altra posizione sicura. <a href="${megaHome}" target="_blank" rel="noopener noreferrer">Apri MEGA</a> · <a href="https://drive.google.com/" target="_blank" rel="noopener noreferrer">Apri Google Drive</a> · <a href="https://www.icloud.com/" target="_blank" rel="noopener noreferrer">Apri iCloud</a>.</p>

          <p><strong>20. Monitoraggio personale.</strong> Il peso e tutte le pesate sono gestiti esclusivamente nel Percorso peso. La sezione Misurazioni corporee contiene soltanto circonferenze in centimetri, come collo, petto/torace, vita, addome, fianchi, braccia, cosce, polpacci, polsi e caviglie. Pressione, frequenza cardiaca, saturazione e glicemia restano nei Parametri vitali. Quando disponibili, i grafici mostrano l'andamento nel tempo. BMI, stime e indicatori numerici hanno funzione informativa e organizzativa e non costituiscono diagnosi o prescrizioni.</p>

          <p><strong>21. Prepara visita e PDF.</strong> <strong>Prepara visita</strong> raccoglie solo le informazioni utili per una visita: documenti collegati, documenti proposti, cose da chiedere e farmaci da richiedere. Quando crei il PDF puoi scegliere <strong>Compatto</strong>, per usare meno pagine, oppure <strong>Un esame per pagina</strong>, più comodo da leggere. Questo PDF è separato dall'esportazione dell'intero Dossier.</p>

          <p><strong>22. Sicurezza e secondo fattore.</strong> Le password non vengono conservate in chiaro. Se hai attivato il codice temporaneo personale, utilizzi lo stesso Authenticator per accedere al tuo account. Conserva separatamente gli eventuali codici di recupero. Il Logout termina la sessione ma non cancella il Dossier.</p>

          <p><strong>23. Segnalare un problema.</strong> Il comando di segnalazione genera un file ZIP con diagnostica tecnica sanitizzata e limitata ai dati necessari per individuare il malfunzionamento. Il pacchetto non deve contenere documenti sanitari, testi clinici, descrizioni libere, credenziali, nomi dei profili o percorsi dei file clinici. Dopo la tua conferma si apre la pagina MEGA; seleziona manualmente il file ZIP appena generato e completa il caricamento.</p>

          <p><strong>24. Fascicolo Sanitario Elettronico (FSE).</strong> Nella sezione <strong>Interoperabilità</strong> trovi la mappa dell'Italia con le Regioni e le Province autonome di Trento e Bolzano. La mappa indica se Clinica Digitale può collegarsi davvero al Fascicolo Sanitario Elettronico di una Regione. Una Regione viene indicata come collegata solo quando il programma può recuperare e importare i documenti in modo completo e autorizzato. Se il collegamento non è disponibile, puoi comunque scaricare il referto dal portale sanitario e importarlo normalmente nel Dossier.</p>

          <p><strong>25. Privacy e trattamento dei dati.</strong> <strong>Titolare del trattamento: Clinica Digitale, Pisa.</strong> Contatto privacy: <strong>dossiersanitario@gmail.com</strong>. Clinica Digitale adotta un'impostazione local-first: le funzioni principali non richiedono che i dati sanitari siano inviati al sito. Cloud, Google Calendar e altri servizi esterni sono facoltativi e vengono utilizzati soltanto quando l'utente li attiva. Per conoscere l'effettivo utilizzo del programma viene registrata una statistica tecnica minima e pseudonima: identificativo tecnico del Dossier e dell'installazione, versione, piattaforma, primo e ultimo utilizzo e numero di avvii. Non vengono trasmessi documenti, diagnosi, terapie, nomi dei profili, e-mail o altri contenuti sanitari.</p>

          <p><strong>26. Se qualcosa non funziona.</strong> Non modificare manualmente i file interni del Dossier. Controlla lo stato dell'archivio, le modifiche eventualmente in attesa e le sincronizzazioni configurate. Una sincronizzazione non riuscita non significa automaticamente che i dati locali siano perduti. Per assistenza usa <strong>dossiersanitario@gmail.com</strong>.</p>

          <p><strong>27. Vaccinazioni.</strong> In <strong>Salute → Vaccinazioni</strong> puoi registrare il vaccino, la dose, la data, la struttura e collegare il documento che lo dimostra. Se inserisci una data di richiamo, il richiamo viene aggiunto alla normale Agenda: non viene creato un secondo calendario.</p>

          <p><strong>28. Interventi, procedure e dispositivi.</strong> In <strong>Salute → Interventi e dispositivi</strong> puoi annotare un intervento, una procedura, una protesi o un dispositivo impiantato. Puoi indicare data, struttura, esito e collegare il relativo referto o documento già presente nel Dossier.</p>

          <p><strong>29. Diario dei sintomi.</strong> In <strong>Diagnosi e condizioni → Diario sintomi</strong> puoi annotare un sintomo quando vuoi ricordarne data, intensità, durata, zona interessata e andamento. È un diario personale: <strong>non crea diagnosi</strong> e non sostituisce il medico.</p>

          <p><strong>30. Profilo sanitario sintetico.</strong> Nella Panoramica trovi un riepilogo dei dati più importanti del profilo, per esempio condizioni, terapie, vaccinazioni, interventi, medico e contatti utili. Serve per avere il quadro generale senza aprire una sezione alla volta.</p>

          <p><strong>31. Emergenza, allergie e scheda offline.</strong> Le allergie non hanno un archivio separato: si gestiscono nel riquadro <strong>Emergenza</strong> della Panoramica insieme a contatto di emergenza, terapie critiche, gruppo sanguigno, condizioni o dispositivi importanti e medico di base. Con <strong>Esporta scheda offline</strong> puoi creare una scheda semplice da conservare sul dispositivo e consultare anche senza aprire tutto il Dossier.</p>

          <p><strong>32. Registro accessi e modifiche.</strong> Il Registro mostra le attività importanti, per esempio apertura di un documento sanitario, modifica di dati, importazioni ed esportazioni. <strong>Il semplice passaggio da una pagina all'altra non viene registrato.</strong> Serve per capire chi ha fatto cosa e quando.</p>

          <p><strong>33. Importa dati salute e affidabilità della fonte.</strong> In <strong>Monitoraggio</strong> trovi <strong>Importa dati salute</strong>. Su Windows puoi importare misurazioni da file compatibili come CSV, JSON, XML o FHIR. Ogni dato viene accompagnato dalla sua provenienza e da una classificazione: <strong>clinico/documentale</strong>, <strong>dispositivo sanitario certificato o validato</strong>, <strong>wellness/consumer</strong> oppure <strong>fonte non verificata</strong>. La classificazione riguarda la singola misurazione, non tutto il dispositivo. I dati wellness o non verificati restano informativi e non devono essere trattati automaticamente come dati clinici.</p>

          <p><strong>34. DICOM: immagini di esami radiologici.</strong> DICOM è il formato usato da TAC, risonanze, cone beam, radiografie e altri esami per immagini. In <strong>Documenti</strong> usa <strong>Importa DICOM</strong>. Puoi scegliere <strong>Archivio DICOM gestito dal Dossier</strong>, che copia lo studio in una cartella dedicata scelta dall’utente, anche su SSD/HDD USB o percorso di rete accessibile a Windows; <strong>Copia nel Dossier</strong>, che conserva i file nella memoria interna del Dossier; oppure <strong>Mantieni nella posizione attuale</strong>, per lasciare i file su HDD, SSD, chiavetta o altra memoria. Durante l'importazione vedi percentuale, file elaborati e quantità copiata. Il programma prova a trovare il referto già presente e puoi confermare o cambiare il collegamento. Dal referto o dalla scheda DICOM usa <strong>Apri immagini DICOM</strong> per scorrere le immagini. Se scegli un supporto esterno, quel supporto deve essere collegato per visualizzarle.</p>

          <p><strong>35. FHIR: scambio dati con altri software sanitari.</strong> FHIR è uno standard usato per scambiare dati sanitari tra programmi diversi. In <strong>Interoperabilità</strong> puoi importare o esportare dati FHIR come diagnosi, terapie, misurazioni, vaccinazioni e procedure. Serve a ridurre errori e interpretazioni diverse quando due software compatibili si scambiano informazioni. I documenti originali del Dossier restano comunque la fonte principale.</p>

          <p><strong>36. Percorsi di cura.</strong> I Percorsi di cura servono a riunire in un unico quadro elementi che esistono già, per esempio una terapia, un controllo in Agenda e alcune misurazioni da seguire. <strong>Clinica Digitale non prescrive cure</strong>: il percorso deve rappresentare indicazioni già date da un medico o altro professionista sanitario.</p>

          <p><strong>37. Esporta per struttura sanitaria.</strong> In <strong>Prepara visita</strong> puoi creare una copia da consegnare a un medico o a un ospedale. La destinazione deve essere una <strong>memoria esterna</strong>, per esempio una chiavetta USB, un SSD o un HDD esterno. Puoi scegliere di esportare soltanto il PDF della visita, il PDF insieme ai referti originali e alle immagini associate, oppure aggiungere anche gli eventuali esami DICOM collegati. I file vengono messi in cartelle separate e non serve installare Clinica Digitale sul computer della struttura sanitaria.</p>

          <p><strong>38. Aggiungi documento.</strong> Nella parte alta del Dossier trovi un solo comando <strong>Aggiungi documento</strong>. Da lì puoi scegliere un file già presente sul computer, acquisire più pagine con la fotocamera oppure usare lo scanner locale. Non servono due comandi diversi.</p>

          <p><strong>39. Immagini associate a un referto.</strong> Apri un referto e usa <strong>Allega immagini</strong> per collegare fotografie o immagini radiografiche in formato JPG, JPEG o PNG. Le immagini vengono copiate nell'<strong>Archivio immagini locale</strong> gestito da Clinica Digitale. Dalla stessa scheda puoi aprirle, ingrandirle, ruotarle e passare da una all'altra.</p>

          <p><strong>40. DICOM e immagini nel backup cloud.</strong> Per evitare di riempire rapidamente lo spazio cloud, DICOM e immagini associate sono <strong>esclusi per impostazione predefinita</strong>. Nella sezione Cloud puoi scegliere di includerli nelle copie complete. In questo caso il cloud resta una copia di backup e non sostituisce automaticamente l’Archivio gestito scelto dall’utente. Prima di attivare l'opzione controlla lo spazio occupato: TAC, risonanze e cone beam possono richiedere molti gigabyte.</p>

          <p><strong>41. Disinstallazione e Archivio locale.</strong> Quando disinstalli Clinica Digitale, il programma ti chiede se vuoi <strong>mantenere i dati e l'Archivio locale</strong> oppure <strong>rimuovere tutto</strong>. Scegli di mantenere i dati se pensi di reinstallare il programma o vuoi conservare DICOM e immagini sul computer.</p>
        </div>
      </section>`;
    const helpHost=$('.help-continuous-text');
    if(helpHost){
      for(const paragraph of [...helpHost.querySelectorAll(':scope > p')]){
        const titleNode=paragraph.querySelector(':scope > strong');
        if(!titleNode)continue;
        const title=titleNode.textContent.trim();
        const body=paragraph.cloneNode(true);
        body.querySelector(':scope > strong')?.remove();
        const details=document.createElement('details');details.className='help-topic';
        const summary=document.createElement('summary');summary.textContent=title;details.appendChild(summary);
        const content=document.createElement('div');content.className='help-topic-body';content.innerHTML=body.innerHTML.trim();details.appendChild(content);
        paragraph.replaceWith(details);
      }
    }
  }

  function renderBackup() {
    const lastBackup = localStorage.getItem('lastBackupAt');
    const frequency = localStorage.getItem('backupFrequency') || 'weekly';
    const canBackup=DossierSecurity.canUse?.('backup')!==false;
    const canRestore=DossierSecurity.canUse?.('restore')!==false;
    const u=DossierSecurity.currentUser?.();
    const migrationAvailable=Boolean(u?.linkedProfileId&&!DossierSecurity.isAdministrator?.());
    const migrationCard=migrationAvailable?`<section class="card backup-compact-card backup-migration-card"><div class="backup-compact-head"><div><h2>Trasferisci il mio profilo</h2><p class="kpi-note">Pacchetto cifrato con il solo profilo personale e i documenti collegati.</p></div><span class="badge success">Disponibile</span></div><div class="row-actions"><button class="btn btn-primary" data-action="export-profile-migration">Esporta il mio profilo</button><button class="btn btn-light" data-action="authorize-profile-departure">Autorizza rimozione</button></div><details class="backup-inline-details"><summary>Informazioni sulla sicurezza</summary><div class="notice"><strong>L'esportazione non autorizza alcuna cancellazione.</strong> Il profilo nel Dossier familiare di origine resta protetto finché non autorizzi personalmente la futura rimozione dopo avere verificato il nuovo Dossier.</div></details></section>`:`<section class="card backup-compact-card backup-migration-card"><div class="backup-compact-head"><div><h2>Migrazione profilo adulto</h2><p class="kpi-note">L'operazione deve essere eseguita dal titolare entrando con il proprio account personale.</p></div><span class="badge warning">Account titolare richiesto</span></div><div class="backup-migration-status"><strong>Disponibile dall'account personale del titolare</strong><span>L'amministratore non può esportare o autorizzare la rimozione al posto dell'adulto interessato.</span></div></section>`;
    const testTools=DossierSecurity.isAdministrator()?`<section class="card backup-admin-strip"><div><h2>Strumenti amministrativi</h2><p class="kpi-note">Codici monouso personali e azzeramento esclusivo di un archivio di prova.</p></div><div class="row-actions"><button class="btn btn-light" data-action="regenerate-recovery-codes">Genera codici monouso</button><button class="btn btn-danger" data-action="reset-test-data">Azzera dati di prova</button></div></section>`:'';
    $('#viewContainer').innerHTML = `
      <div class="backup-top-grid">
        <section class="card backup-compact-card">
          <div class="backup-compact-head"><div><h2>Archivio fisico incrementale</h2><p class="kpi-note">Aggiorna su cartella locale o disco esterno solo i file nuovi o modificati.</p></div><span class="backup-state-icon ${state.archiveHandle?'ok':''}">✓</span></div>
          <div class="backup-compact-state"><strong>${state.archiveHandle ? 'Cartella collegata' : 'Nessuna cartella collegata'}</strong>${state.archiveHandle?`<span>${esc(state.archiveHandle.name)}</span>`:''}</div>
          <div class="row-actions"><button class="btn btn-primary" data-action="connect-folder" ${canBackup?'':'disabled'}>${state.archiveHandle ? 'Cambia cartella' : 'Collega cartella'}</button><button class="btn btn-light" data-action="sync-folder" ${state.archiveHandle&&canBackup?'':'disabled'}>Sincronizza adesso</button></div>
        </section>
        <section class="card backup-compact-card">
          <div class="backup-compact-head"><div><h2>Backup portatile locale</h2><p class="kpi-note">Esporta uno ZIP verificato oppure usa un backup esistente.</p></div></div>
          <div class="row-actions"><button class="btn btn-primary" data-action="export-backup" ${canBackup?'':'disabled'}>Esporta backup completo</button><button class="btn btn-light" data-action="import-backup" ${canRestore?'':'disabled'}>Usa un backup</button><input id="backupFileInput" type="file" accept=".zip" class="hidden"></div>
          ${!canBackup||!canRestore?`<div class="notice warning compact-notice">Il tuo account non dispone di tutte le autorizzazioni.</div>`:''}
        </section>
        ${migrationCard}
        <section class="card backup-compact-card backup-schedule-card">
          <div class="backup-compact-head"><div><h2>Programmazione locale</h2><p class="kpi-note">Controllo dell'archivio mentre il programma è aperto.</p></div></div>
          <div class="form-group"><label>Frequenza</label><select id="backupFrequency" class="form-control"><option value="daily" ${frequency==='daily'?'selected':''}>Ogni giorno</option><option value="weekly" ${frequency==='weekly'?'selected':''}>Ogni settimana</option><option value="monthly" ${frequency==='monthly'?'selected':''}>Ogni mese</option><option value="manual" ${frequency==='manual'?'selected':''}>Solo manuale</option></select></div>
          <p class="kpi-note">Ultima sincronizzazione: ${lastBackup ? formatDateTime(lastBackup) : 'mai'}</p>
        </section>
      </div>
      ${backupReportHtml('Ultima verifica del backup',state.lastBackupReport)}
      ${backupReportHtml('Ultima operazione da backup',state.lastRestoreReport)}
      <div id="cloudPanelHost" class="backup-cloud-host"><section class="card"><div class="card-title-row"><div><h2>Archivio condiviso esterno</h2><p class="kpi-note">Verifica del connettore cloud in corso.</p></div></div></section></div>
      ${testTools}`;
    $('#backupFrequency')?.addEventListener('change', e => { localStorage.setItem('backupFrequency', e.target.value); toast('Frequenza salvata'); });
    $('#backupFileInput')?.addEventListener('change', e => prepareBackupUse(e.target.files[0]));
    bindViewActions();
    const host=$('#cloudPanelHost');
    if(!host)return;
    if(!globalThis.DossierFeatures?.has?.('cloudSync')){host.innerHTML=`<section class="card"><div class="notice warning"><strong>Archivio cloud disponibile dal piano MEDIUM.</strong><br>Backup locale e ripristino restano utilizzabili nel piano FREE. I dati cloud già esistenti non vengono cancellati.</div></section>`;return;}
    if(!globalThis.DossierCloud){host.innerHTML='<section class="card"><div class="notice warning">Il modulo cloud non è disponibile. Backup locale e ripristino restano utilizzabili.</div></section>';return;}
    Promise.resolve(DossierCloud.panelHtml()).then(async html=>{
      if(!host.isConnected)return;
      host.innerHTML=html;
      await DossierCloud.bind(host);
    }).catch(error=>{
      console.error('Pannello cloud non disponibile:',error);
      if(host.isConnected)host.innerHTML=`<section class="card"><div class="notice warning"><strong>Connettore cloud non disponibile.</strong><br>${esc(error?.message||String(error))}<br>Backup locale e ripristino continuano a funzionare.</div></section>`;
    });
  }

  function monitorModuleCard(view,title,description,lastValue='Nessun dato'){
    return `<article class="module-card"><span class="badge">${esc(lastValue)}</span><h3>${esc(title)}</h3><p class="kpi-note">${esc(description)}</p><button class="btn btn-light btn-small" data-action="monitor-go" data-view="${esc(view)}">Apri sezione</button></article>`;
  }

  function renderMonitorHome(){
    const p=activeProfile();const journey=activeJourney();const jm=journeyMetrics(journey);const lastWeight=latestMeasurement('weight');const lastSpo2=latestMeasurement('spo2');const lastGlucose=latestMeasurement('glucose');
    const pressureRows=state.measurements.filter(x=>x.type==='blood_pressure'||x.type==='heart_rate').slice().sort((a,b)=>measurementDateTime(a).localeCompare(measurementDateTime(b)));const lastPressure=pressureRows.at(-1)||null;
    const pressureValue=(()=>{if(!lastPressure)return'—';if(lastPressure.type==='heart_rate')return Number.isFinite(Number(lastPressure.value))?`${HealthCharts.fmt(lastPressure.value)} bpm`:'—';const hp=Number.isFinite(Number(lastPressure.systolic))&&Number.isFinite(Number(lastPressure.diastolic)),hh=Number.isFinite(Number(lastPressure.heartRate));return hp?`${lastPressure.systolic}/${lastPressure.diastolic} mmHg${hh?` · ${HealthCharts.fmt(lastPressure.heartRate)} bpm`:''}`:hh?`${HealthCharts.fmt(lastPressure.heartRate)} bpm`:'—';})();
    const bodyRows=state.measurements.filter(x=>BODY_TYPES.includes(x.type));
    $('#viewContainer').innerHTML=`<div class="monitor-home-modern"><section class="card dashboard-v13-greeting monitor-home-greeting"><div><h2>Monitoraggio di ${esc(p.firstName)}</h2><p>Valori domestici, percorso peso e misurazioni personali in un'unica panoramica.</p></div><div class="row-actions"><button class="btn btn-primary" data-action="monitor-go" data-view="monitor-weight">Registra peso</button><button class="btn btn-light" data-action="monitor-go" data-view="monitor-graphs">Apri tutti i grafici</button></div></section>
      <div class="monitor-home-top-grid"><section class="card dashboard-v13-panel monitor-home-values"><div class="dashboard-v13-panel-head"><div class="dashboard-v13-title-icon">${uiIconSvg('trend')}</div><h3>Ultimi valori</h3></div><div class="monitor-home-kpi-grid"><button class="monitor-home-kpi" data-action="monitor-go" data-view="monitor-weight"><span class="dashboard-v13-iconbox blue">${uiIconSvg('weight')}</span><small>Peso</small><strong>${lastWeight?`${HealthCharts.fmt(lastWeight.value)} kg`:'—'}</strong><span>${lastWeight?formatDate(lastWeight.date):'Nessun dato'}</span></button><button class="monitor-home-kpi" data-action="monitor-go" data-view="monitor-pressure"><span class="dashboard-v13-iconbox rose">${uiIconSvg('heart')}</span><small>Pressione e frequenza</small><strong>${pressureValue}</strong><span>${lastPressure?formatDate(lastPressure.date):'Nessun dato'}</span></button><button class="monitor-home-kpi" data-action="monitor-go" data-view="monitor-glucose"><span class="dashboard-v13-iconbox red">${uiIconSvg('droplet')}</span><small>Glicemia</small><strong>${lastGlucose?`${HealthCharts.fmt(lastGlucose.value)} ${esc(lastGlucose.unit||'mg/dL')}`:'—'}</strong><span>${lastGlucose?formatDate(lastGlucose.date):'Nessun dato'}</span></button><button class="monitor-home-kpi" data-action="monitor-go" data-view="monitor-spo2"><span class="dashboard-v13-iconbox teal">${uiIconSvg('shield')}</span><small>Saturazione</small><strong>${lastSpo2?`${HealthCharts.fmt(lastSpo2.value)}%`:'—'}</strong><span>${lastSpo2?formatDate(lastSpo2.date):'Nessun dato'}</span></button></div></section>
      <section class="card dashboard-v13-panel monitor-home-progress"><div class="dashboard-v13-panel-head"><div class="dashboard-v13-title-icon">${uiIconSvg('weight')}</div><h3>Percorso peso</h3><button class="btn btn-light btn-small" data-action="monitor-go" data-view="monitor-weight">Apri percorso</button></div>${jm?`<div class="monitor-home-progress-value"><strong>${Math.round(jm.progress)}%</strong><span>Avanzamento</span></div><div class="journey-progress" style="--progress:${jm.progress}%"><span></span></div><p>${HealthCharts.fmt(Math.abs(jm.remaining))} kg al peso obiettivo</p>`:'<div class="modern-empty-state compact"><h3>Percorso non impostato</h3><p>Apri il percorso peso per configurarlo.</p></div>'}</section></div>
      <div class="monitor-home-module-grid">${monitorModuleCard('monitor-weight','Percorso peso','Obiettivo, differenze tra pesate e stima orientativa delle calorie.',lastWeight?`${HealthCharts.fmt(lastWeight.value)} kg`:'Da iniziare')}${monitorModuleCard('monitor-body','Misurazioni corporee','Circonferenze corporee e storico.',`${bodyRows.length} misurazioni`)}${monitorModuleCard('monitor-pressure','Pressione e frequenza','Sistolica, diastolica, frequenza e contesto.',pressureValue)}${monitorModuleCard('monitor-spo2','Saturazione ossigeno','SpO₂, frequenza e note.',lastSpo2?`${lastSpo2.value}%`:'Nessun dato')}${monitorModuleCard('monitor-glucose','Glicemia domestica','Misurazioni capillari e contesto del pasto.',lastGlucose?`${lastGlucose.value} ${lastGlucose.unit||'mg/dL'}`:'Nessun dato')}</div></div>`;
    bindViewActions();
  }

  function renderMonitorWeight(){
    const rows=measurementsOf('weight');const journey=activeJourney();const jm=journeyMetrics(journey);const calories=calorieEstimate(journey);const heightCm=Number(journey?.heightCm||latestNumeric('height'));const goal=journeyGoalDistance(jm);
    const goalCard=!goal?'':goal.status==='missing'?`<div><small>Mancano all'obiettivo</small><strong>${HealthCharts.fmt(goal.kg)} kg</strong></div>`:goal.status==='passed'?`<div><small>Obiettivo superato</small><strong>${HealthCharts.fmt(goal.kg)} kg</strong></div>`:`<div><small>Obiettivo raggiunto</small><strong>0 kg</strong></div>`;
    const calorieBox=!journey?'<div class="notice">Imposta un percorso per ottenere la stima orientativa.</div>':calories?.missing?'<div class="notice warning">Per la stima servono data di nascita, altezza, sesso biologico usato dal calcolo e livello di attività.</div>':`<div class="journey-summary calorie-summary"><div><small>Mantenimento calorico stimato</small><strong>${Math.round(calories.maintenance)} kcal/giorno</strong><span class="calorie-explain">Stima delle calorie giornaliere necessarie per mantenere il peso attuale.</span></div><div><small>Apporto giornaliero stimato per il percorso</small><strong>${Math.max(0,Math.round(calories.targetCalories))} kcal/giorno</strong><span class="calorie-explain">Stima teorica coerente con l'obiettivo e con il tempo impostato.</span></div><div><small>Variazione media di peso richiesta</small><strong>${HealthCharts.fmt(jm.weeklyRequired)} kg/settimana</strong><span class="calorie-explain">Variazione media teorica necessaria per raggiungere l'obiettivo entro la data prevista.</span></div><div><small>Metabolismo a riposo stimato</small><strong>${Math.round(calories.bmr)} kcal/giorno</strong><span class="calorie-explain">Stima dell'energia utilizzata dall'organismo a riposo.</span></div></div><details class="calorie-info"><summary>Come leggere questi valori</summary><div><p>Le stime sono matematiche e orientative. Non costituiscono dieta o prescrizione nutrizionale.</p></div></details>${calories.unsafeLoss?'<div class="safety-note"><strong>Obiettivo potenzialmente troppo rapido.</strong><br>Valuta una data obiettivo più lunga o verifica il percorso con un professionista.</div>':'<div class="safety-note"><strong>Stime orientative, non prescrizioni nutrizionali.</strong></div>'}`;
    $('#viewContainer').innerHTML=`<section class="card modern-content-shell monitor-weight-modern"><div class="modern-content-head weight-modern-head"><div><h2>Andamento e obiettivi</h2><p>Obiettivo, andamento, rilevazioni e strumenti nello stesso linguaggio grafico del Dossier.</p></div>${journey&&jm?`<div class="weight-head-progress"><small>Avanzamento</small><strong>${Math.round(jm.progress)}%</strong><div class="journey-progress" style="--progress:${jm.progress}%"><span></span></div></div>`:''}<div class="row-actions"><button class="btn btn-light" data-action="edit-journey">${journey?'Modifica percorso':'Crea percorso'}</button><button class="btn btn-primary" data-action="add-weight">Aggiungi pesata</button></div></div>
      ${journey&&jm?`<section class="weight-modern-summary"><div class="weight-modern-kpis"><div><small>Inizio · ${formatDate(journey.startDate)}</small><strong>${weightBmiLabel(jm.start,heightCm)}</strong></div><div><small>Attuale</small><strong>${weightBmiLabel(jm.current,heightCm)}</strong></div><div><small>Obiettivo · ${formatDate(journey.targetDate)}</small><strong>${weightBmiLabel(jm.target,heightCm)}</strong></div>${goalCard}<div><small>Giorni rimanenti</small><strong>${jm.daysRemaining}</strong></div></div></section>`:'<div class="notice">Non è stato ancora impostato un percorso peso.</div>'}
      ${monitorExplorerHtml('weight')}
      <div class="monitor-tools-grid"><section class="monitor-tool-card"><div class="monitor-tool-head"><span>${uiIconSvg('weight')}</span><div><h3>Calcolatore BMI</h3><p>I valori inseriti qui non vengono salvati.</p></div></div><div class="bmi-calculator"><div class="form-group"><label for="bmiCalcHeight">Altezza (cm)</label><input id="bmiCalcHeight" type="number" min="50" max="260" step="0.1" class="form-control"></div><div class="form-group"><label for="bmiCalcWeight">Peso (kg)</label><input id="bmiCalcWeight" type="number" min="1" max="500" step="0.1" class="form-control"></div><div class="form-group"><label for="bmiCalcResult">BMI</label><input id="bmiCalcResult" type="text" class="form-control" readonly></div></div></section><section class="monitor-tool-card"><div class="monitor-tool-head"><span>${uiIconSvg('trend')}</span><div><h3>Stima calorica del percorso</h3><p>Valori orientativi basati sui dati del percorso.</p></div></div>${calorieBox}</section></div>
    </section>`;
    bindViewActions();bindMonitorExplorer('weight',$('#viewContainer'));
    const bmiHeight=$('#bmiCalcHeight'),bmiWeight=$('#bmiCalcWeight'),bmiResult=$('#bmiCalcResult');const updateBmiCalculator=()=>{const bmi=bmiFromWeightHeight(bmiWeight?.value,bmiHeight?.value);if(bmiResult)bmiResult.value=bmi===null?'':formatBmi(bmi);};bmiHeight?.addEventListener('input',updateBmiCalculator);bmiWeight?.addEventListener('input',updateBmiCalculator);
  }

  function silhouetteHtml(){
    const profile=activeProfile()||{},sex=inferredProfileSex(profile),female=sex==='f';
    const weight=Number(latestNumeric('weight'));
    const full=Number.isFinite(weight)&&(female?weight>90:weight>110);
    const src=`assets/body/${female?(full?'female_full':'female_normal'):(full?'male_full':'male_normal')}.png`;
    const shapeLabel=full?'Sagoma corpulenta':'Sagoma normale';
    return `<div class="body-silhouette" title="Riferimento visivo per le circonferenze"><img src="${src}" alt="${female?'Sagoma femminile':'Sagoma maschile'} · ${shapeLabel}"></div>`;
  }


  function monitorChartHtml(type,{compact=false,title=''}={}){
    const data=monitorGraphData(type);const pointCount=(data.series||[]).reduce((n,row)=>n+(row.points||[]).length,0);const count=Number.isFinite(Number(data.recordCount))?Number(data.recordCount):pointCount;
    if(!pointCount)return `<div class="notice">Non ci sono ancora dati sufficienti per visualizzare il grafico.</div>`;
    return `<section class="monitor-inline-chart ${compact?'compact':''}">${title?`<div class="monitor-inline-chart-head"><h3>${esc(title)}</h3><span class="badge success">${count} rilevazioni</span></div>`:''}<div class="chart-shell">${HealthCharts.timelineSvg(data.series,{axisLabel:data.unit||data.axis,references:data.references||[],ariaLabel:data.title,compact})}</div></section>`;
  }

  function bodyGraphData(type=''){
    const available=BODY_TYPES.filter(key=>measurementsOf(key).some(x=>Number.isFinite(Number(x.value))));
    const selected=available.includes(type)?type:(available[0]||BODY_TYPES[0]);
    const points=measurementsOf(selected).map(x=>({date:x.date,time:x.time,value:x.value}));
    return {selected,available,title:`${measurementLabel(selected)}`,unit:'cm',series:[{name:measurementLabel(selected),unit:'cm',points}]};
  }

  function bodyChartHtml(){
    const data=bodyGraphData(state.bodyGraphType);state.bodyGraphType=data.selected;
    if(!data.available.length)return '<div class="notice">Non ci sono ancora misurazioni corporee sufficienti per visualizzare il grafico.</div>';
    return `<section class="monitor-inline-chart"><div class="monitor-inline-chart-head"><div><h3>Andamento delle misurazioni</h3><p class="kpi-note">Seleziona la circonferenza da visualizzare nel tempo.</p></div><div class="form-group body-graph-filter"><label>Misurazione</label><select id="bodyGraphSelect" class="form-control">${data.available.map(key=>`<option value="${key}" ${key===data.selected?'selected':''}>${esc(measurementLabel(key))}</option>`).join('')}</select></div></div><div class="chart-shell">${HealthCharts.timelineSvg(data.series,{axisLabel:'cm',ariaLabel:`Andamento ${data.title}`})}</div></section>`;
  }

  function bindBodyGraphSelect(){const select=$('#bodyGraphSelect');if(select)select.onchange=e=>{state.bodyGraphType=e.target.value;renderMonitorBody();};}

  function renderMonitorBody(){
    const rows=state.measurements.filter(x=>BODY_TYPES.includes(x.type)).sort((a,b)=>measurementDateTime(b).localeCompare(measurementDateTime(a)));const latestByType=BODY_TYPES.map(type=>latestMeasurement(type)).filter(Boolean);
    $('#viewContainer').innerHTML=`<div class="card"><div class="card-title-row"><div><h2>Misurazioni corporee</h2><p class="kpi-note">Qui registri esclusivamente le circonferenze in centimetri. Peso e pesate restano nel Percorso peso.</p></div><button class="btn btn-primary" data-action="add-body-set">Registra misurazioni</button></div><div class="monitor-hero-grid"><div>${latestByType.length?`<div class="body-measure-grid">${latestByType.map(x=>`<div class="monitor-kpi"><small>${esc(measurementLabel(x.type))}</small><strong>${HealthCharts.fmt(x.value)} ${esc(x.unit||'')}</strong><small>${formatDate(x.date)}</small></div>`).join('')}</div>`:'<div class="notice">Nessuna misurazione corporea registrata.</div>'}</div><div>${silhouetteHtml()}<p class="kpi-note" style="text-align:center">Riferimento visivo delle aree corporee. Tutti i valori sono espressi in centimetri.</p></div></div><div class="section-spacer"></div>${bodyChartHtml()}<div class="section-spacer"></div><h3>Storico completo</h3>${rows.length?`<div class="table-wrap"><table><thead><tr><th>Data</th><th>Parametro</th><th>Valore</th><th>Differenza precedente</th><th>Note</th><th></th></tr></thead><tbody>${rows.map(r=>{const typed=measurementsOf(r.type);const idx=typed.findIndex(x=>x.id===r.id);const prev=idx>0?typed[idx-1]:null;return `<tr><td>${formatDate(r.date)}</td><td>${esc(measurementLabel(r.type))}</td><td><strong>${HealthCharts.fmt(r.value)} ${esc(r.unit||'')}</strong></td><td>${diffLabel(prev?Number(r.value)-Number(prev.value):null,r.unit||'')}</td><td>${esc(r.notes||'')}</td><td><div class="row-actions"><button class="btn btn-ghost btn-small" data-action="edit-measurement" data-id="${r.id}">Modifica</button><button class="btn btn-danger btn-small" data-action="delete-measurement" data-id="${r.id}">Elimina</button></div></td></tr>`}).join('')}</tbody></table></div>`:'<div class="notice">Nessun dato registrato.</div>'}</div>`;
    bindViewActions();bindBodyGraphSelect();
  }

  function vitalSectionConfig(type){
    return {
      blood_pressure:{title:'Pressione arteriosa e frequenza cardiaca',subtitle:'Sistolica, diastolica, frequenza, ora e contesto. Accetta anche rilevazioni di sola frequenza cardiaca.',button:'Aggiungi pressione o frequenza'},
      spo2:{title:'Saturazione ossigeno',subtitle:'SpO₂, frequenza rilevata e dispositivo.',button:'Aggiungi saturazione'},
      glucose:{title:'Glicemia domestica',subtitle:'Misurazioni separate dai referti di laboratorio.',button:'Aggiungi glicemia'},
      heart_rate:{title:'Pressione arteriosa e frequenza cardiaca',subtitle:'La frequenza cardiaca è gestita insieme alla pressione arteriosa.',button:'Aggiungi pressione o frequenza'}
    }[type];
  }

  function renderVitalSection(type){
    if(type==='heart_rate'){renderVitalSection('blood_pressure');return;}
    const cfg=vitalSectionConfig(type);
    const explorerType=type==='heart_rate'?'blood_pressure':type;
    $('#viewContainer').innerHTML=`<section class="card modern-content-shell monitor-vital-modern"><div class="modern-content-head"><div><h2>${esc(cfg.title)}</h2><p>${esc(cfg.subtitle)}</p></div><button class="btn btn-primary" data-action="add-vital" data-type="${explorerType}">${esc(cfg.button)}</button></div>${monitorExplorerHtml(explorerType)}<div class="notice warning monitor-safety-note">Archivio di misurazioni, non valutazione clinica. Il programma non formula diagnosi e non suggerisce modifiche terapeutiche.</div></section>`;
    bindViewActions();bindMonitorExplorer(explorerType,$('#viewContainer'));
  }

  function monitorGraphData(type){
    if(type==='weight'){
      const rows=measurementsOf('weight');
      const actualPoints=rows.map(x=>({date:x.date,time:x.time,value:x.value}));
      const trustedRows=trustedMeasurementsOf('weight');
      const j=activeJourney(),model=j?weightJourneyProjection(trustedRows,j):null;
      const series=[{name:'Pesate',unit:'kg',className:'weight-actual-series',points:actualPoints}];
      if(model){
        series.push({name:'Percorso previsto',unit:'kg',className:'weight-goal-series',points:[
          {date:new Date(model.startMs).toISOString().slice(0,10),value:model.startWeight},
          {date:new Date(model.targetMs).toISOString().slice(0,10),value:model.targetWeight}
        ]});
        const latest=model.actual.at(-1);
        if(latest&&Number.isFinite(model.predictedMs)&&Number.isFinite(model.slope)){
          const visibleEndMs=model.predictedMs;
          series.push({name:'Proiezione reale',unit:'kg',className:'weight-projection-series',points:[
            {date:new Date(latest.ms).toISOString().slice(0,10),time:latest.row?.time||'',value:latest.value},
            {date:new Date(visibleEndMs).toISOString().slice(0,10),value:model.targetWeight}
          ]});
        }
      }
      return {title:'Percorso peso',unit:'kg',recordCount:rows.length,series};
    }
    if(type==='blood_pressure'){
      const rows=measurementsOf('blood_pressure');
      return {
        title:'Pressione arteriosa',
        unit:'mmHg',
        recordCount:rows.length,
        series:[
          {name:'Sistolica',unit:'mmHg',points:rows.filter(x=>Number.isFinite(Number(x.systolic))).map(x=>({date:x.date,time:x.time,value:x.systolic}))},
          {name:'Diastolica',unit:'mmHg',points:rows.filter(x=>Number.isFinite(Number(x.diastolic))).map(x=>({date:x.date,time:x.time,value:x.diastolic}))}
        ]
      };
    }
    if(type==='spo2'){
      const rows=measurementsOf(type);
      return {title:'Saturazione ossigeno',unit:'%',recordCount:rows.length,series:[{name:'SpO₂',unit:'%',points:rows.map(x=>({date:x.date,time:x.time,value:x.value}))}]};
    }
    if(type==='glucose'){
      const rows=measurementsOf(type).map(x=>({...x,normalizedValue:String(x.unit||'mg/dL')==='mmol/L'?Number(x.value)*18.0182:Number(x.value)}));
      return {title:'Glicemia domestica',unit:'mg/dL',recordCount:rows.length,series:[{name:'Glicemia',unit:'mg/dL',points:rows.map(x=>({date:x.date,time:x.time,value:x.normalizedValue}))}]};
    }
    const sourceRows=[
      ...measurementsOf('blood_pressure').filter(x=>Number.isFinite(Number(x.heartRate))).map(x=>({...x,_heartValue:x.heartRate})),
      ...measurementsOf('heart_rate').filter(x=>Number.isFinite(Number(x.value))).map(x=>({...x,_heartValue:x.value}))
    ];
    const merged=sourceRows.map(x=>({date:x.date,time:x.time,value:x._heartValue})).sort((a,b)=>`${a.date||'9999-12-31'}T${a.time||'23:59'}`.localeCompare(`${b.date||'9999-12-31'}T${b.time||'23:59'}`));
    return {title:'Frequenza cardiaca',unit:'bpm',recordCount:sourceRows.length,series:[{name:'Frequenza cardiaca',unit:'bpm',points:merged}]};
  }

  function monitorExplorerRows(type){
    if(type==='weight')return measurementsOf('weight').slice().sort((a,b)=>measurementDateTime(b).localeCompare(measurementDateTime(a)));
    if(type==='blood_pressure')return [...measurementsOf('blood_pressure'),...measurementsOf('heart_rate')].sort((a,b)=>measurementDateTime(b).localeCompare(measurementDateTime(a)));
    return measurementsOf(type).slice().sort((a,b)=>measurementDateTime(b).localeCompare(measurementDateTime(a)));
  }
  function monitorExplorerValue(type,row){
    if(type==='weight')return `${HealthCharts.fmt(row.value)} kg`;
    if(type==='blood_pressure'){
      const pressure=Number.isFinite(Number(row.systolic))&&Number.isFinite(Number(row.diastolic))?`${row.systolic}/${row.diastolic} mmHg`:'';
      const hr=Number.isFinite(Number(row.heartRate))?`${row.heartRate} bpm`:Number.isFinite(Number(row.value))?`${row.value} bpm`:'';
      return [pressure,hr].filter(Boolean).join(' · ')||'Non disponibile';
    }
    if(type==='spo2')return `${HealthCharts.fmt(row.value)}%${Number.isFinite(Number(row.heartRate))?` · ${row.heartRate} bpm`:''}`;
    if(type==='glucose')return `${HealthCharts.fmt(row.value)} ${esc(row.unit||'mg/dL')}`;
    return `${HealthCharts.fmt(row.value)} ${esc(row.unit||'')}`.trim();
  }
  function monitorExplorerContext(type,row){
    const base=type==='weight'?(row.source||'Pesata'):type==='blood_pressure'?(row.context||row.device||'Rilevazione'):(row.context||row.device||row.source||'Rilevazione');
    const sourceLabel=row.sourceClass?globalThis.ClinicaLot2?.SOURCE_LABELS?.[row.sourceClass]:'';
    return sourceLabel?`${base} · ${sourceLabel}`:base;
  }
  function monitorExplorerDetailHtml(type,row){
    if(!row)return `<div class="monitor-explorer-detail-empty">Seleziona una rilevazione nell'elenco a destra per visualizzarne i dettagli.</div>`;
    const parts=[];
    if(row.time)parts.push(`Ora: ${esc(row.time)}`);
    if(row.context)parts.push(`Contesto: ${esc(row.context)}`);
    if(row.device)parts.push(`Dispositivo/Fonte: ${esc(row.device)}`);
    if(row.source&&!row.device)parts.push(`Fonte: ${esc(row.source)}`);
    if(row.notes)parts.push(`Note: ${esc(row.notes)}`);
    return `<article class="monitor-explorer-detail-card"><span class="monitor-explorer-detail-icon">${uiIconSvg(type==='weight'?'weight':type==='glucose'?'droplet':type==='blood_pressure'?'heart':'shield')}</span><div><small>Rilevazione selezionata</small><h3>${formatDate(row.date)} · ${monitorExplorerValue(type,row)}</h3>${globalThis.ClinicaLot2?.sourceBadgeHtml?.(row)||''}<p>${parts.join(' · ')||'Nessun dettaglio aggiuntivo.'}</p></div><div class="row-actions"><button class="btn btn-ghost btn-small" data-action="edit-measurement" data-id="${row.id}">Modifica</button><button class="btn btn-danger btn-small" data-action="delete-measurement" data-id="${row.id}">Elimina</button></div></article>`;
  }
  function monitorExplorerHtml(type){
    const rows=monitorExplorerRows(type);
    const list=rows.map(row=>`<button type="button" class="monitor-explorer-row" data-monitor-row="${row.id}"><span>${formatDate(row.date)}</span><strong>${monitorExplorerValue(type,row)}</strong><span>${esc(monitorExplorerContext(type,row))}</span><b>›</b></button>`).join('');
    if(type==='blood_pressure'){
      const pressureData=monitorGraphData('blood_pressure');
      const heartData=monitorGraphData('heart_rate');
      const chartCard=data=>{
        const pointCount=(data.series||[]).reduce((n,x)=>n+(x.points||[]).length,0);
        return `<section class="monitor-explorer-chart-card"><div class="monitor-explorer-chart-head"><span class="monitor-explorer-icon">${uiIconSvg('heart')}</span><div><h3>${esc(data.title)}</h3><p>${data.recordCount||0} rilevazioni registrate</p></div></div>${pointCount?`<div class="chart-shell monitor-explorer-chart">${HealthCharts.timelineSvg(data.series,{axisLabel:data.unit||data.axis,references:data.references||[],ariaLabel:data.title,compact:false})}</div>`:'<div class="notice">Non ci sono ancora dati sufficienti per visualizzare il grafico.</div>'}</section>`;
      };
      return `<div class="monitor-explorer-layout" data-monitor-explorer="${type}"><div class="monitor-explorer-main"><div style="display:grid;gap:12px">${chartCard(pressureData)}${chartCard(heartData)}</div><div class="monitor-explorer-detail" id="monitorExplorerDetail-${type}">${monitorExplorerDetailHtml(type,null)}</div></div><aside class="monitor-explorer-panel"><div class="monitor-explorer-panel-head"><div><h3>Rilevazioni</h3><p>Pressione e frequenza della stessa misurazione restano insieme.</p></div><span class="badge">${rows.length}</span></div><div class="monitor-explorer-columns"><span>Data</span><span>Pressione / frequenza</span><span>Contesto/Fonte</span><span></span></div><div class="monitor-explorer-list">${list||'<div class="notice">Nessuna rilevazione registrata.</div>'}</div></aside></div>`;
    }
    const data=monitorGraphData(type);const title=data.title||measurementLabel(type);const icon=type==='weight'?'weight':type==='glucose'?'droplet':'shield';
    const pointCount=(data.series||[]).reduce((n,x)=>n+(x.points||[]).length,0);
    return `<div class="monitor-explorer-layout" data-monitor-explorer="${type}"><div class="monitor-explorer-main"><section class="monitor-explorer-chart-card"><div class="monitor-explorer-chart-head"><span class="monitor-explorer-icon">${uiIconSvg(icon)}</span><div><h3>${esc(title)}</h3><p>${rows.length} rilevazioni registrate</p></div></div>${pointCount?`<div class="chart-shell monitor-explorer-chart">${HealthCharts.timelineSvg(data.series,{axisLabel:data.unit||data.axis,references:data.references||[],ariaLabel:title,compact:false})}</div>`:'<div class="notice">Non ci sono ancora dati sufficienti per visualizzare il grafico.</div>'}</section><div class="monitor-explorer-detail" id="monitorExplorerDetail-${type}">${monitorExplorerDetailHtml(type,null)}</div></div><aside class="monitor-explorer-panel"><div class="monitor-explorer-panel-head"><div><h3>Rilevazioni</h3><p>Seleziona una riga per vedere il dettaglio.</p></div><span class="badge">${rows.length}</span></div><div class="monitor-explorer-columns"><span>Data</span><span>Valore rilevato</span><span>Contesto/Fonte</span><span></span></div><div class="monitor-explorer-list">${list||'<div class="notice">Nessuna rilevazione registrata.</div>'}</div></aside></div>`;
  }
  function bindMonitorExplorer(type,host=document){
    const map=new Map(monitorExplorerRows(type).map(r=>[String(r.id),r]));
    $$(`[data-monitor-explorer="${type}"] [data-monitor-row]`,host).forEach(btn=>btn.addEventListener('click',()=>{
      $$(`[data-monitor-explorer="${type}"] [data-monitor-row]`,host).forEach(x=>x.classList.toggle('selected',x===btn));
      const detail=$(`#monitorExplorerDetail-${type}`,host)||document.querySelector(`#monitorExplorerDetail-${type}`);if(detail){detail.innerHTML=monitorExplorerDetailHtml(type,map.get(String(btn.dataset.monitorRow)));bindViewActions(detail);}
    }));
  }

  function renderMonitorGraphs(){
    const types=MONITOR_GRAPH_TYPES;
    const iconFor=type=>type==='weight'?'weight':type==='glucose'?'droplet':type==='blood_pressure'||type==='heart_rate'?'heart':'shield';
    const cards=types.map(type=>{const data=monitorGraphData(type);const count=(data.series||[]).reduce((n,s)=>n+(s.points||[]).length,0);return `<section class="monitor-graph-only-card"><div class="monitor-graph-only-head"><span class="monitor-explorer-icon">${uiIconSvg(iconFor(type))}</span><div><h3>${esc(data.title||measurementLabel(type))}</h3><p>${count} rilevazioni</p></div></div>${count?`<div class="chart-shell monitor-graph-only-chart">${HealthCharts.timelineSvg(data.series,{axisLabel:data.unit||data.axis,references:data.references||[],ariaLabel:data.title||measurementLabel(type),compact:false})}</div>`:'<div class="monitor-graph-only-empty">Nessuna rilevazione disponibile.</div>'}</section>`;}).join('');
    $('#viewContainer').innerHTML=`<section class="card modern-content-shell monitor-graphs-modern"><div class="modern-content-head"><div><h2>Tutti i grafici</h2><p>Andamento dei parametri del monitoraggio personale in un'unica pagina.</p></div></div><div class="monitor-graphs-only-grid">${cards}</div></section>`;
    bindViewActions($('#viewContainer'));
  }

  function renderMonitorPreferences(){
    const prefs=currentProfilePreferences();
    $('#viewContainer').innerHTML=`<div class="card"><div class="card-title-row"><div><h2>Preferenze del monitoraggio</h2><p class="kpi-note">Le scelte sono specifiche del profilo e vengono incluse nei backup.</p></div></div><form id="monitorPrefsForm" class="preferences-layout"><section class="preference-section"><h3>Dossier PDF</h3><div class="notice success"><strong>Le tabelle complete vengono sempre inserite.</strong> Tutti i parametri registrati restano disponibili nel dossier; qui scegli soltanto gli elementi grafici aggiuntivi.</div><label class="graph-choice"><input type="checkbox" name="monitorPdfSilhouette" ${prefs.monitorPdfSilhouette?'checked':''}> Inserisci anche la silhouette corporea orientativa</label><h4>Grafici da inserire</h4><div class="graph-selection-grid">${MONITOR_GRAPH_TYPES.map(type=>`<label class="graph-choice"><input type="checkbox" name="monitorGraph" value="${type}" ${(prefs.monitorPdfGraphs||[]).includes(type)?'checked':''}> ${esc(measurementLabel(type))}</label>`).join('')}</div></section><div class="preference-actions"><button class="btn btn-primary">Salva preferenze del profilo</button></div></form></div>`;
    $('#monitorPrefsForm').onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.target);await saveProfilePreferences({monitorPdfTables:true,monitorPdfSilhouette:fd.get('monitorPdfSilhouette')==='on',monitorPdfGraphs:fd.getAll('monitorGraph')});toast('Preferenze del monitoraggio salvate');renderMonitorPreferences();};
  }

  function openWeightMeasurementModal(item={}){
    openModal(item.id?'Modifica pesata':'Nuova pesata','Il confronto viene calcolato in base alla data, non all’ordine di inserimento.',`<form id="weightMeasurementForm" class="form-grid"><div class="form-group"><label>Data</label><input type="date" name="date" required class="form-control" value="${item.date||today()}"></div><div class="form-group"><label>Ora</label><input type="time" name="time" class="form-control" value="${item.time||''}"></div><div class="form-group"><label>Peso (kg)</label><input type="number" min="10" max="500" step="0.1" name="value" required class="form-control" value="${item.value??''}"></div><div class="form-group full"><label>Note</label><textarea name="notes" class="form-control">${esc(item.notes||'')}</textarea></div><div class="form-actions full"><button type="button" class="btn btn-light" id="cancelMeasurementBtn">Annulla</button><button class="btn btn-primary">Salva pesata</button></div></form>`);
    $('#cancelMeasurementBtn').onclick=closeModal;$('#weightMeasurementForm').onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.target);const row={...item,id:item.id||uid('measure'),profileId:state.activeProfileId,type:'weight',date:fd.get('date'),time:fd.get('time'),value:Number(fd.get('value')),unit:'kg',notes:String(fd.get('notes')||''),source:item.source||'Inserimento manuale',createdAt:item.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};await DossierDB.put('measurements',row);closeModal();await loadProfileData();renderView();toast('Pesata salvata');};
  }

  function openJourneyModal(item=activeJourney()||{}){
    const latestWeight=latestNumeric('weight');const latestHeight=latestNumeric('height');
    openModal(item.id?'Modifica percorso peso':'Nuovo percorso peso','La stima calorica è orientativa e non sostituisce la valutazione di un professionista.',`<form id="journeyForm" class="form-grid"><div class="form-group"><label>Data inizio</label><input type="date" name="startDate" required class="form-control" value="${item.startDate||today()}"></div><div class="form-group"><label>Peso iniziale (kg)</label><input type="number" step="0.1" min="10" max="500" name="startWeight" required class="form-control" value="${item.startWeight??latestWeight??''}"></div><div class="form-group"><label>Data obiettivo</label><input type="date" name="targetDate" required class="form-control" value="${item.targetDate||''}"></div><div class="form-group"><label>Peso obiettivo (kg)</label><input type="number" step="0.1" min="10" max="500" name="targetWeight" required class="form-control" value="${item.targetWeight??''}"></div><div class="form-group"><label>Altezza (cm)</label><input type="number" step="0.1" min="80" max="250" name="heightCm" class="form-control" value="${item.heightCm??latestHeight??''}"></div><div class="form-group"><label>Sesso biologico usato dal calcolo</label><select name="sex" class="form-control"><option value="">Seleziona</option><option value="male" ${item.sex==='male'?'selected':''}>Maschile</option><option value="female" ${item.sex==='female'?'selected':''}>Femminile</option></select></div><div class="form-group"><label>Livello di attività</label><select name="activityLevel" class="form-control"><option value="sedentary" ${item.activityLevel==='sedentary'?'selected':''}>Sedentario</option><option value="light" ${item.activityLevel==='light'?'selected':''}>Leggermente attivo</option><option value="moderate" ${item.activityLevel==='moderate'?'selected':''}>Moderatamente attivo</option><option value="high" ${item.activityLevel==='high'?'selected':''}>Molto attivo</option><option value="very_high" ${item.activityLevel==='very_high'?'selected':''}>Attività molto elevata</option></select></div><div class="form-group"><label>Stato</label><select name="status" class="form-control"><option value="active" ${item.status!=='paused'&&item.status!=='completed'?'selected':''}>Attivo</option><option value="paused" ${item.status==='paused'?'selected':''}>Sospeso</option><option value="completed" ${item.status==='completed'?'selected':''}>Concluso</option></select></div><div class="form-group full"><label>Note</label><textarea name="notes" class="form-control">${esc(item.notes||'')}</textarea></div><div class="form-actions full"><button type="button" class="btn btn-light" id="cancelJourneyBtn">Annulla</button><button class="btn btn-primary">Salva percorso</button></div></form>`);
    $('#cancelJourneyBtn').onclick=closeModal;$('#journeyForm').onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.target);const startDate=String(fd.get('startDate')),targetDate=String(fd.get('targetDate'));if(targetDate<=startDate){toast('La data obiettivo deve essere successiva alla data di inizio');return;}const status=String(fd.get('status'));if(status==='active'){for(const j of state.weightJourneys.filter(x=>x.id!==item.id&&x.status==='active'))await DossierDB.put('weightJourneys',{...j,status:'archived',updatedAt:new Date().toISOString()});}const row={...item,id:item.id||uid('journey'),profileId:state.activeProfileId,startDate,targetDate,startWeight:Number(fd.get('startWeight')),targetWeight:Number(fd.get('targetWeight')),heightCm:Number(fd.get('heightCm'))||null,sex:String(fd.get('sex')),activityLevel:String(fd.get('activityLevel')),status,notes:String(fd.get('notes')||''),createdAt:item.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};await DossierDB.put('weightJourneys',row);closeModal();await loadProfileData();renderView();toast('Percorso salvato');};
  }

  function openBodySetModal(){
    const fields=BODY_TYPES.map(type=>`<div class="form-group"><label>${esc(measurementLabel(type))} (cm)</label><input type="number" step="0.1" min="0" name="${type}" class="form-control"></div>`).join('');
    openModal('Registra misurazioni corporee','Compila soltanto i valori misurati in questa data.',`<form id="bodySetForm" class="form-grid"><div class="form-group"><label>Data</label><input type="date" name="date" required class="form-control" value="${today()}"></div><div class="form-group"><label>Ora</label><input type="time" name="time" class="form-control"></div>${fields}<div class="form-group full"><label>Note comuni</label><textarea name="notes" class="form-control"></textarea></div><div class="form-actions full"><button type="button" class="btn btn-light" id="cancelBodySetBtn">Annulla</button><button class="btn btn-primary">Salva misurazioni</button></div></form>`);
    $('#cancelBodySetBtn').onclick=closeModal;$('#bodySetForm').onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.target);const date=String(fd.get('date')),time=String(fd.get('time')||''),notes=String(fd.get('notes')||'');let saved=0;for(const type of BODY_TYPES){const value=Number(fd.get(type));if(!Number.isFinite(value)||value<=0)continue;const row={id:uid('measure'),profileId:state.activeProfileId,type,date,time,value,unit:'cm',notes,source:'Inserimento manuale',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};await DossierDB.put('measurements',row);saved++;}if(!saved){toast('Inserisci almeno una misurazione');return;}closeModal();await loadProfileData();renderView();toast(`${saved} misurazioni salvate`);};
  }

  function openBodySingleModal(item={}){
    openModal('Modifica misurazione corporea',measurementLabel(item.type),`<form id="bodySingleForm" class="form-grid"><div class="form-group"><label>Data</label><input type="date" name="date" required class="form-control" value="${item.date||today()}"></div><div class="form-group"><label>Ora</label><input type="time" name="time" class="form-control" value="${item.time||''}"></div><div class="form-group"><label>Valore (${esc(item.unit||'cm')})</label><input type="number" step="0.1" min="0" name="value" required class="form-control" value="${item.value??''}"></div><div class="form-group full"><label>Note</label><textarea name="notes" class="form-control">${esc(item.notes||'')}</textarea></div><div class="form-actions full"><button type="button" class="btn btn-light" id="cancelBodySingleBtn">Annulla</button><button class="btn btn-primary">Salva</button></div></form>`);
    $('#cancelBodySingleBtn').onclick=closeModal;$('#bodySingleForm').onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.target);const row={...item,date:String(fd.get('date')),time:String(fd.get('time')||''),value:Number(fd.get('value')),notes:String(fd.get('notes')||''),updatedAt:new Date().toISOString()};await DossierDB.put('measurements',row);closeModal();await loadProfileData();renderView();toast('Misurazione aggiornata');};
  }

  function openVitalModal(type,item={}){
    if(type==='heart_rate' && !('systolic' in item) && !('diastolic' in item)) type='blood_pressure';
    const cfg=vitalSectionConfig(type); let fields='';
    if(type==='blood_pressure'){
      const bpmValue=item.heartRate??item.value??'';
      fields=`<div class="form-group"><label>Sistolica (mmHg)</label><input type="number" min="0" max="300" name="systolic" class="form-control" value="${item.systolic??''}"></div>
      <div class="form-group"><label>Diastolica (mmHg)</label><input type="number" min="0" max="200" name="diastolic" class="form-control" value="${item.diastolic??''}"></div>
      <div class="form-group"><label>Frequenza cardiaca (bpm)</label><input type="number" min="0" max="250" name="heartRate" class="form-control" value="${bpmValue}"></div>
      <div class="form-group"><label>Contesto</label><input name="context" class="form-control" value="${esc(item.context||'')}" placeholder="Riposo, mattina, dopo terapia..."></div>
      <div class="form-group"><label>Dispositivo / Fonte</label><input name="device" class="form-control" value="${esc(item.device||'')}"></div>
      <div class="form-group full"><label>Note</label><textarea name="notes" class="form-control">${esc(item.notes||'')}</textarea></div>`;
    }else if(type==='spo2'){
      fields=`<div class="form-group"><label>Valore SpO₂ (%)</label><input type="number" min="0" max="100" name="value" required class="form-control" value="${item.value??''}"></div>
      <div class="form-group"><label>Frequenza cardiaca (bpm)</label><input type="number" min="0" max="250" name="heartRate" class="form-control" value="${item.heartRate??''}"></div>
      <div class="form-group"><label>Contesto</label><input name="context" class="form-control" value="${esc(item.context||'')}"></div>
      <div class="form-group"><label>Dispositivo / Fonte</label><input name="device" class="form-control" value="${esc(item.device||'')}"></div>
      <div class="form-group full"><label>Note</label><textarea name="notes" class="form-control">${esc(item.notes||'')}</textarea></div>`;
    }else if(type==='glucose'){
      fields=`<div class="form-group"><label>Valore glicemia</label><input type="number" min="0" step="0.1" name="value" required class="form-control" value="${item.value??''}"></div>
      <div class="form-group"><label>Unità</label><select name="unit" class="form-control">${['mg/dL','mmol/L'].map(x=>`<option value="${x}" ${(item.unit||'mg/dL')===x?'selected':''}>${x}</option>`).join('')}</select></div>
      <div class="form-group"><label>Contesto</label><input name="context" class="form-control" value="${esc(item.context||'')}"></div>
      <div class="form-group"><label>Dispositivo / Fonte</label><input name="device" class="form-control" value="${esc(item.device||'')}"></div>
      <div class="form-group full"><label>Note</label><textarea name="notes" class="form-control">${esc(item.notes||'')}</textarea></div>`;
    }else{
      fields=`<div class="form-group"><label>Frequenza (bpm)</label><input type="number" min="0" max="250" name="value" required class="form-control" value="${item.value??''}"></div>
      <div class="form-group"><label>Contesto</label><input name="context" class="form-control" value="${esc(item.context||'')}"></div>
      <div class="form-group"><label>Dispositivo / Fonte</label><input name="device" class="form-control" value="${esc(item.device||'')}"></div>
      <div class="form-group full"><label>Note</label><textarea name="notes" class="form-control">${esc(item.notes||'')}</textarea></div>`;
    }
    openModal(item.id?`Modifica ${cfg.title.toLowerCase()}`:cfg.title,cfg.subtitle,`<form id="vitalForm" class="form-grid"><div class="form-group"><label>Data</label><input type="date" name="date" required class="form-control" value="${item.date||today()}"></div><div class="form-group"><label>Ora</label><input type="time" name="time" class="form-control" value="${item.time||''}"></div>${fields}<div class="form-actions full"><button type="button" class="btn btn-light" id="cancelVitalBtn">Annulla</button><button class="btn btn-primary">Salva misurazione</button></div></form>`);
    $('#cancelVitalBtn').onclick=closeModal;
    $('#vitalForm').onsubmit=async e=>{
      e.preventDefault();
      const fd=new FormData(e.target);
      const row={...item,id:item.id||uid('measure'),type,profileId:state.activeProfileId,date:String(fd.get('date')||today()),time:String(fd.get('time')||''),context:String(fd.get('context')||''),device:String(fd.get('device')||''),notes:String(fd.get('notes')||''),updatedAt:new Date().toISOString()};
      if(!item.createdAt)row.createdAt=row.updatedAt;
      if(type==='blood_pressure'){
        const systolicRaw=String(fd.get('systolic')||'').trim(), diastolicRaw=String(fd.get('diastolic')||'').trim(), hrRaw=String(fd.get('heartRate')||'').trim();
        const hasPressure=systolicRaw!=='' || diastolicRaw!=='';
        const hasHr=hrRaw!=='';
        if(!hasPressure && !hasHr){ toast('Inserisci almeno la pressione oppure la frequenza cardiaca'); return; }
        if((systolicRaw==='') !== (diastolicRaw==='')){ toast('Per la pressione arteriosa inserisci sia sistolica sia diastolica'); return; }
        if(systolicRaw!=='') row.systolic=Number(systolicRaw); else delete row.systolic;
        if(diastolicRaw!=='') row.diastolic=Number(diastolicRaw); else delete row.diastolic;
        if(hrRaw!=='') row.heartRate=Number(hrRaw); else delete row.heartRate;
      }else if(type==='spo2'){
        row.value=Number(fd.get('value'));
        const hrRaw=String(fd.get('heartRate')||'').trim();
        if(hrRaw!=='') row.heartRate=Number(hrRaw); else delete row.heartRate;
      }else if(type==='glucose'){
        row.value=Number(fd.get('value')); row.unit=String(fd.get('unit')||'mg/dL');
      }else{
        row.value=Number(fd.get('value'));
      }
      await DossierDB.put('measurements',row);
      closeModal(); await loadProfileData(); renderView(); toast(item.id?'Misurazione aggiornata':'Misurazione salvata');
    };
  }

  async function deleteMeasurement(id){if(!confirm('Eliminare questa misurazione?'))return;await DossierDB.del('measurements',id);await loadProfileData();renderView();toast('Misurazione eliminata');}

  function documentCard(d) {
    const description=['lab','mixed'].includes(d.documentMode)||d.category==='Esami di laboratorio'?`${(d.labValues||[]).length} valori`:(d.documentMode==='therapy'?`${(d.extractedTherapies||[]).length} terapie`:'Referto integrale');
    return `<div class="list-item"><div><h3>${esc(d.title)} ${d.needsCompletion?'<span class="badge warning">Da completare</span>':''}</h3><p>${formatDate(d.clinicalDate)} · ${esc(d.documentKind||d.category||'Documento sanitario')} · ${description}</p></div><button class="btn btn-light btn-small" data-action="view-doc" data-id="${d.id}">Apri</button></div>`;
  }

  function bindViewActions(root=document) {
    $$('[data-action]', root).forEach(btn => {
      if (btn.dataset.bound) return; btn.dataset.bound='1';
      btn.addEventListener('click', async () => {
        const a=btn.dataset.action, id=btn.dataset.id;
        const actionCapability={
          'edit-profile':'editOtherProfiles','edit-emergency':'editOtherProfiles','edit-health-card':'editOtherProfiles','upload-card-front':'editOtherProfiles','upload-card-back':'editOtherProfiles','camera-card-front':'editOtherProfiles','camera-card-back':'editOtherProfiles','scanner-card-front':'editOtherProfiles','scanner-card-back':'editOtherProfiles',
          'import':'importDocuments','reanalyze-all':'editDocuments','edit-doc':'editDocuments','delete-doc':'deleteDocuments',
          'add-doctor':'editOtherProfiles','edit-doctor':'editOtherProfiles','delete-doctor':'editOtherProfiles',
          'import-therapy-file':'editTherapies','import-exemption-file':'editOtherProfiles','add-therapy':'editTherapies','edit-therapy':'editTherapies','delete-therapy':'editTherapies','add-exemption':'editOtherProfiles','edit-exemption':'editOtherProfiles','delete-exemption':'editOtherProfiles',
          'propose-diagnoses':'editDiagnoses','import-diagnosis-file':'editDiagnoses','add-diagnosis':'editDiagnoses','edit-diagnosis':'editDiagnoses','delete-diagnosis':'editDiagnoses',
          'add-weight':'editOtherProfiles','edit-journey':'editOtherProfiles','add-body-set':'editOtherProfiles','add-vital':'editOtherProfiles','edit-measurement':'editOtherProfiles','delete-measurement':'editOtherProfiles'
        };
        const requiredCapability=actionCapability[a];
        if(requiredCapability&&(!DossierSecurity.canEditProfile(state.activeProfileId)||!DossierSecurity.canUse(requiredCapability))){toast('Funzione non autorizzata per questo utente');return;}
        if(a==='reset-test-data'&&!DossierSecurity.isAdministrator()){toast('Operazione riservata all’amministratore');return;}
        if(a==='regenerate-recovery-codes'){await DossierSecurity.regenerateRecoveryCodes();return;}
        if (a==='edit-profile') openProfileDataModal(activeProfile());
        if (a==='edit-emergency') openEmergencyModal(activeProfile());
        if (a==='export-emergency-offline') exportEmergencyOffline();
        if (a==='edit-health-card') openHealthCardEditModal(activeProfile());
        if (a==='view-health-card') openHealthCardViewer();
        if (a==='flip-health-card-page') { state.healthCardSide=state.healthCardSide==='front'?'back':'front'; renderView(); }
        if (a==='go-health-card') { state.activeView='health-card'; state.healthCardSide='front'; selectNav('health-card'); renderView(); }
        if (a==='upload-card-front') $('#healthCardFrontQuickInput')?.click();
        if (a==='upload-card-back') $('#healthCardBackQuickInput')?.click();
        if (a==='camera-card-front') acquireHealthCardSide('front','camera');
        if (a==='camera-card-back') acquireHealthCardSide('back','camera');
        if (a==='scanner-card-front') acquireHealthCardSide('front','scanner');
        if (a==='scanner-card-back') acquireHealthCardSide('back','scanner');
        if (a==='go-documents') { state.activeView='documents'; selectNav('documents'); renderView(); }
        if (a==='go-calendar') { state.activeView='calendar'; selectNav('calendar'); renderView(); }
        if (a==='go-therapies') { state.activeView='therapies'; selectNav('therapies'); renderView(); }
        if (a==='go-exemptions') { state.activeView='exemptions'; selectNav('exemptions'); renderView(); }
        if (a==='go-doctors') { state.activeView='doctors'; selectNav('doctors'); renderView(); }
        if (a==='go-diagnoses') { state.activeView='diagnoses'; selectNav('diagnoses'); renderView(); }
        if (a==='go-prepare-visit') { state.activeView='prepare-visit'; selectNav('prepare-visit'); renderView(); }
        if (a==='go-monitor') { state.activeView='monitor-home'; selectNav('monitor-home'); renderView(); }
        if (a==='go-backup') { state.activeView='backup'; selectNav('backup'); renderView(); }
        if (a==='doctor-export') { $('#doctorExportBtn')?.click(); }
        if (a==='export-pdf-dashboard') { $('#exportPdfBtn')?.click(); }
        if (a==='import') openImportModal();
        if (a==='view-doc') viewDocument(id);
        if (a==='reanalyze-all') reanalyzeAllDocuments();
        if (a==='edit-doc') openDocumentEditModal(state.documents.find(d=>d.id===id));
        if (a==='delete-doc') deleteDocument(id);
        if (a==='open-trash') openTrashModal();
        if (a==='add-doctor') openDoctorModal();
        if (a==='edit-doctor') openDoctorModal(state.doctors.find(x=>x.id===id));
        if (a==='delete-doctor') deleteEntity('doctors',id,'doctor');
        if (a==='import-therapy-file') openImportModal({preferredCategory:'Piano terapeutico',extractTherapies:true,targetSection:'therapies'});
        if (a==='import-exemption-file') openImportModal({preferredCategory:'Esenzione sanitaria',extractExemptions:true,targetSection:'exemptions'});
        if (a==='add-therapy') openTherapyModal();
        if (a==='edit-therapy') openTherapyModal(state.therapies.find(x=>x.id===id));
        if (a==='delete-therapy') deleteEntity('therapies',id,'therapy');
        if (a==='add-exemption') openExemptionModal();
        if (a==='edit-exemption') openExemptionModal(state.exemptions.find(x=>x.id===id));
        if (a==='delete-exemption') deleteEntity('exemptions',id,'exemption');
        if (a==='propose-diagnoses') proposeDiagnosesFromDocuments();
        if (a==='search-diagnosis-documents') openDiagnosisDocumentSearch();
        if (a==='import-diagnosis-file') openImportModal({preferredCategory:'Diagnosi o certificazione',extractDiagnoses:true,targetSection:'diagnoses'});
        if (a==='add-diagnosis') openDiagnosisModal();
        if (a==='edit-diagnosis') openDiagnosisModal(state.diagnoses.find(x=>x.id===id));
        if (a==='delete-diagnosis') deleteEntity('diagnoses',id,'diagnosis');
        if (a==='dashboard-open-clinical-graph') { state.graphParameterId=String(btn.dataset.parameter||'');state.graphUnitKey=String(btn.dataset.unit||'');state.graphSelectedRowKey='';state.activeView='graphs';selectNav('graphs');renderView(); }
        if (a==='monitor-go') { state.activeView=btn.dataset.view||'monitor-home'; selectNav(state.activeView); renderView(); }
        if (a==='add-weight') openWeightMeasurementModal();
        if (a==='edit-journey') openJourneyModal();
        if (a==='add-body-set') openBodySetModal();
        if (a==='add-vital') openVitalModal(btn.dataset.type);
        if (a==='edit-measurement') { const row=state.measurements.find(x=>x.id===id); if(row){ if(row.type==='weight')openWeightMeasurementModal(row); else if(['blood_pressure','spo2','glucose','heart_rate'].includes(row.type))openVitalModal(row.type,row); else openBodySingleModal(row); } }
        if (a==='delete-measurement') deleteMeasurement(id);
        if (a==='connect-folder') connectArchiveFolder();
        if (a==='sync-folder') syncAllToFolder(true);
        if (a==='export-backup') {if(!DossierSecurity.canUse('backup'))return toast('Creazione backup non autorizzata');exportZip();}
        if (a==='export-profile-migration') exportOwnProfileMigration();
        if (a==='authorize-profile-departure') authorizeOwnProfileDeparture();
        if (a==='import-backup') {if(!DossierSecurity.canUse('restore'))return toast('Ripristino backup non autorizzato');$('#backupFileInput').click();}
        if (a==='reset-test-data') resetTestData();
      });
    });
  }

  function selectNav(view) { state.activeView=view;syncNavigation(); }

  function openModal(title, subtitle, html) {
    $('#modalTitle').textContent=title; $('#modalSubtitle').textContent=subtitle||''; $('#modalBody').innerHTML=html;
    $('#modal').classList.remove('hidden'); $('#modalBackdrop').classList.remove('hidden');
    $('#modalBackdrop').setAttribute('aria-hidden','false');
  }
  function closeModal() { $('#modal').classList.add('hidden'); $('#modal').classList.remove('modal-diagnosis-workspace'); $('#modalBackdrop').classList.add('hidden'); $('#modalBackdrop').setAttribute('aria-hidden','true'); }


  function base64ToBlob(base64,mimeType='image/png') {
    const binary=atob(base64);const bytes=new Uint8Array(binary.length);
    for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
    return new Blob([bytes],{type:mimeType});
  }

  function stopMediaStream(stream) {
    try {for(const track of stream?.getTracks?.()||[])track.stop();} catch {}
  }

  async function imageFileToJpegPage(file) {
    const url=URL.createObjectURL(file);
    try {
      const image=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error(`Immagine non leggibile: ${file.name}`));img.src=url;});
      const maxEdge=3000;const longEdge=Math.max(image.naturalWidth,image.naturalHeight);const scale=Math.min(1,maxEdge/Math.max(1,longEdge));
      const width=Math.max(1,Math.round(image.naturalWidth*scale));const height=Math.max(1,Math.round(image.naturalHeight*scale));
      const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
      const ctx=canvas.getContext('2d',{alpha:false});ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);ctx.drawImage(image,0,0,width,height);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.94));
      if(!blob)throw new Error('Conversione immagine non riuscita');
      return {bytes:new Uint8Array(await blob.arrayBuffer()),width,height};
    } finally {URL.revokeObjectURL(url);}
  }

  async function imageFilesToPdfFile(files,namePrefix='documento_acquisito') {
    if(!files?.length)throw new Error('Nessuna pagina acquisita');
    const pages=[];for(const file of files)pages.push(await imageFileToJpegPage(file));
    const enc=new TextEncoder();const chunks=[];const offsets=[0];let byteLength=0;
    const push=value=>{const bytes=typeof value==='string'?enc.encode(value):value;chunks.push(bytes);byteLength+=bytes.byteLength;};
    const addObject=(id,parts)=>{offsets[id]=byteLength;push(`${id} 0 obj\n`);for(const part of parts)push(part);push('\nendobj\n');};
    push('%PDF-1.4\n% Dossier Sanitario Locale\n');
    const totalObjects=2+pages.length*3;
    addObject(1,['<< /Type /Catalog /Pages 2 0 R >>']);
    const kids=pages.map((_,i)=>`${3+i*3} 0 R`).join(' ');
    addObject(2,[`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`]);
    pages.forEach((image,index)=>{
      const pageId=3+index*3,imageId=pageId+1,contentId=pageId+2;
      const portrait=image.height>=image.width;const pageW=portrait?595:842,pageH=portrait?842:595,margin=18;
      const factor=Math.min((pageW-margin*2)/image.width,(pageH-margin*2)/image.height);
      const drawW=image.width*factor,drawH=image.height*factor,x=(pageW-drawW)/2,y=(pageH-drawH)/2;
      const content=`q ${drawW.toFixed(3)} 0 0 ${drawH.toFixed(3)} ${x.toFixed(3)} ${y.toFixed(3)} cm /Im0 Do Q`;
      const contentBytes=enc.encode(content);
      addObject(pageId,[`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`]);
      addObject(imageId,[`<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.bytes.byteLength} >>\nstream\n`,image.bytes,'\nendstream']);
      addObject(contentId,[`<< /Length ${contentBytes.byteLength} >>\nstream\n`,contentBytes,'\nendstream']);
    });
    const xrefOffset=byteLength;push(`xref\n0 ${totalObjects+1}\n`);push('0000000000 65535 f \n');
    for(let id=1;id<=totalObjects;id++)push(`${String(offsets[id]||0).padStart(10,'0')} 00000 n \n`);
    push(`trailer\n<< /Size ${totalObjects+1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);
    const stamp=new Date().toISOString().replace(/[-:T]/g,'').slice(0,14);
    return new File([new Blob(chunks,{type:'application/pdf'})],`${namePrefix}_${stamp}.pdf`,{type:'application/pdf'});
  }

  async function openCameraCapture({single=false,title='Fotocamera documento',onComplete=null}={}) {
    if (!navigator.mediaDevices?.getUserMedia) {
      const fallback=$('#cameraInput');
      if(fallback){fallback.click();return;}
      toast('La fotocamera non è disponibile in questo browser');return;
    }
    const overlay=document.createElement('div');
    overlay.className='capture-overlay';
    overlay.innerHTML=`<section class="capture-panel" role="dialog" aria-modal="true">
      <div class="capture-header"><div><h2>${esc(title)}</h2><p>Inquadra il documento intero, evita riflessi e mantieni il dispositivo fermo.</p></div><button class="icon-btn" data-capture-close aria-label="Chiudi">×</button></div>
      <video class="capture-video" autoplay playsinline muted></video>
      <canvas class="hidden"></canvas>
      <div class="capture-previews"></div>
      <div class="capture-actions">
        <button type="button" class="btn btn-light" data-capture-close>Annulla</button>
        <button type="button" class="btn btn-primary" data-capture-shot>${single?'Scatta immagine':'Scatta pagina'}</button>
        ${single?'':`<button type="button" class="btn btn-primary" data-capture-finish disabled>Termina e analizza</button>`}
      </div>
      <div class="notice hidden" data-capture-error></div>
    </section>`;
    document.body.appendChild(overlay);
    const video=$('.capture-video',overlay), canvas=$('canvas',overlay), previews=$('.capture-previews',overlay);
    const finishBtn=$('[data-capture-finish]',overlay), errorBox=$('[data-capture-error]',overlay);
    let stream=null;const files=[];
    const close=()=>{stopMediaStream(stream);overlay.remove();};
    $$('[data-capture-close]',overlay).forEach(b=>b.onclick=close);
    try {
      stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:2200},height:{ideal:1600}},audio:false});
      video.srcObject=stream;
    } catch(error) {
      errorBox.classList.remove('hidden');errorBox.textContent=`Impossibile usare la fotocamera: ${error.message}`;
      return;
    }
    $('[data-capture-shot]',overlay).onclick=async()=>{
      if(!video.videoWidth){toast('Attendi che la fotocamera sia pronta');return;}
      const maxWidth=2400;const scale=Math.min(1,maxWidth/video.videoWidth);
      canvas.width=Math.max(1,Math.round(video.videoWidth*scale));canvas.height=Math.max(1,Math.round(video.videoHeight*scale));
      canvas.getContext('2d',{alpha:false}).drawImage(video,0,0,canvas.width,canvas.height);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.94));
      if(!blob)return;
      const stamp=new Date().toISOString().replace(/[-:T]/g,'').slice(0,14);
      const file=new File([blob],`fotocamera_${stamp}_p${String(files.length+1).padStart(2,'0')}.jpg`,{type:'image/jpeg'});
      files.push(file);
      const url=URL.createObjectURL(blob);
      const figure=document.createElement('figure');figure.innerHTML=`<img src="${url}" alt="Pagina acquisita"><figcaption>Pagina ${files.length}</figcaption>`;
      previews.appendChild(figure);
      if(finishBtn)finishBtn.disabled=false;
      if(single){close();if(onComplete)await onComplete(files);}
    };
    if(finishBtn)finishBtn.onclick=async()=>{
      if(!files.length)return;
      finishBtn.disabled=true;finishBtn.textContent='Creazione PDF...';
      try {const pdf=await imageFilesToPdfFile(files,'referto_fotocamera');close();if(onComplete)await onComplete([pdf]);}
      catch(error){finishBtn.disabled=false;finishBtn.textContent='Termina e analizza';toast(error.message);}
    };
  }

  async function scanWithLocalScanner() {
    const res=await fetch('http://127.0.0.1:8896/api/scan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({format:'png'})});
    const data=await res.json().catch(()=>({ok:false,error:`Risposta scanner non valida (${res.status})`}));
    if(!res.ok||!data.ok)throw new Error(data.error||'Scansione non riuscita');
    const blob=base64ToBlob(data.base64,data.mimeType||'image/png');
    return new File([blob],data.fileName||`scanner_${Date.now()}.png`,{type:data.mimeType||'image/png'});
  }

  async function openScannerCapture({title='Scanner documento',onComplete=null}={}) {
    const overlay=document.createElement('div');overlay.className='capture-overlay';
    overlay.innerHTML=`<section class="capture-panel" role="dialog" aria-modal="true">
      <div class="capture-header"><div><h2>${esc(title)}</h2><p>Acquisisci una pagina alla volta. Al termine le pagine vengono riunite in un unico PDF.</p></div><button class="icon-btn" data-scan-close aria-label="Chiudi">×</button></div>
      <div class="capture-previews"></div>
      <div class="capture-actions"><button type="button" class="btn btn-light" data-scan-close>Annulla</button><button type="button" class="btn btn-primary" data-scan-page>Scansiona pagina</button><button type="button" class="btn btn-primary" data-scan-finish disabled>Termina e analizza</button></div>
      <div class="notice hidden" data-scan-error></div>
    </section>`;
    document.body.appendChild(overlay);
    const previews=$('.capture-previews',overlay),scanBtn=$('[data-scan-page]',overlay),finishBtn=$('[data-scan-finish]',overlay),errorBox=$('[data-scan-error]',overlay);const files=[];
    const close=()=>overlay.remove();$$('[data-scan-close]',overlay).forEach(b=>b.onclick=close);
    scanBtn.onclick=async()=>{
      scanBtn.disabled=true;scanBtn.textContent='Scanner in corso...';errorBox.classList.add('hidden');
      try {
        const file=await scanWithLocalScanner();files.push(file);const url=URL.createObjectURL(file);const figure=document.createElement('figure');figure.innerHTML=`<img src="${url}" alt="Pagina scansionata"><figcaption>Pagina ${files.length}</figcaption>`;previews.appendChild(figure);finishBtn.disabled=false;
      } catch(error){errorBox.classList.remove('hidden');errorBox.textContent=error.message;}
      finally {scanBtn.disabled=false;scanBtn.textContent='Scansiona altra pagina';}
    };
    finishBtn.onclick=async()=>{
      if(!files.length)return;finishBtn.disabled=true;finishBtn.textContent='Creazione PDF...';
      try {const pdf=await imageFilesToPdfFile(files,'referto_scanner');close();if(onComplete)await onComplete([pdf]);}
      catch(error){finishBtn.disabled=false;finishBtn.textContent='Termina e analizza';errorBox.classList.remove('hidden');errorBox.textContent=error.message;}
    };
  }

  async function acquireFromScannerForQueue() {
    await openScannerCapture({onComplete:addImportFiles});
  }

  async function saveHealthCardImage(side,file) {
    const p=activeProfile();if(!p||!file)return;
    const field=side==='front'?'healthCardFrontBlob':'healthCardBackBlob';
    const nameField=side==='front'?'healthCardFrontName':'healthCardBackName';
    const updated={...p,[field]:file,[nameField]:file.name,updatedAt:new Date().toISOString()};
    await DossierDB.put('profiles',updated);await loadAll();await loadProfileData();renderView();toast(`${side==='front'?'Fronte':'Retro'} tessera salvato`);
  }

  async function acquireHealthCardSide(side,source) {
    if(source==='scanner') {
      try {const file=await scanWithLocalScanner();await saveHealthCardImage(side,file);}
      catch(error){toast(error.message);}
      return;
    }
    await openCameraCapture({single:true,title:`Fotografa ${side==='front'?'il fronte':'il retro'} della tessera sanitaria`,onComplete:async files=>saveHealthCardImage(side,files[0])});
  }

  function openHealthCardViewer() {
    const p=activeProfile();if(!p)return;
    const items=[];
    if(p.healthCardFrontBlob)items.push({label:'Fronte',url:makeObjectUrl(p.healthCardFrontBlob)});
    if(p.healthCardBackBlob)items.push({label:'Retro',url:makeObjectUrl(p.healthCardBackBlob)});
    if(!items.length){toast('Nessuna immagine della tessera sanitaria disponibile');return;}
    let index=0;
    openModal('Tessera sanitaria',`${p.firstName} ${p.lastName} · ${p.healthCard||'numero non inserito'}`,`
      <div class="health-card-viewer">
        <div class="health-card-side-label" id="healthCardSideLabel">${items[0].label}</div>
        <img id="healthCardViewerImage" src="${items[0].url}" alt="${items[0].label} tessera sanitaria">
        <div class="row-actions center-actions">
          ${items.length>1?'<button class="btn btn-primary" id="flipHealthCardBtn">Gira tessera</button>':''}
          <a class="btn btn-light" id="openHealthCardImageBtn" href="${items[0].url}" target="_blank" rel="noopener">Apri immagine</a>
        </div>
      </div>`);
    const update=()=>{$('#healthCardViewerImage').src=items[index].url;$('#healthCardViewerImage').alt=`${items[index].label} tessera sanitaria`;$('#healthCardSideLabel').textContent=items[index].label;$('#openHealthCardImageBtn').href=items[index].url;};
    if($('#flipHealthCardBtn'))$('#flipHealthCardBtn').onclick=()=>{index=(index+1)%items.length;update();};
    const keyHandler=e=>{if(!$('#healthCardViewerImage')){window.removeEventListener('keydown',keyHandler);return;}if(items.length>1&&(e.key==='ArrowLeft'||e.key==='ArrowRight')){index=(index+(e.key==='ArrowRight'?1:items.length-1))%items.length;update();}};
    window.addEventListener('keydown',keyHandler);
  }

  function openProfileDataModal(profile=activeProfile()){
    const p=profile||{};
    openModal('Modifica dati del profilo','Modifica esclusivamente i dati personali di questo riquadro.',`
      <form id="profileDataOnlyForm" class="form-grid">
        <div class="form-group full avatar-editor"><div id="profileDataAvatarPreview">${profileAvatarHtml(p,'avatar avatar-large')}</div><div><label>Avatar o fotografia personale</label><input type="file" name="avatarFile" accept="image/jpeg,image/png,image/webp" class="form-control">${p.avatarBlob?'<label class="check-row"><input type="checkbox" name="removeAvatar"> Rimuovi immagine attuale</label>':''}</div></div>
        <div class="form-group"><label>Posizione orizzontale</label><input type="range" name="avatarPositionX" min="0" max="100" value="${Number(p.avatarPositionX??50)}"></div>
        <div class="form-group"><label>Posizione verticale</label><input type="range" name="avatarPositionY" min="0" max="100" value="${Number(p.avatarPositionY??50)}"></div>
        <div class="form-group"><label>Zoom fotografia</label><input type="range" name="avatarZoom" min="1" max="2" step="0.05" value="${Number(p.avatarZoom||1)}"></div>
        <div class="form-group"><label>Nome *</label><input name="firstName" class="form-control" required value="${esc(p.firstName||'')}"></div>
        <div class="form-group"><label>Cognome *</label><input name="lastName" class="form-control" required value="${esc(p.lastName||'')}"></div>
        <div class="form-group"><label>Relazione con l’amministratore</label><select name="relation" class="form-control">${['Amministratore','Figlio minorenne','Genitore','Coniuge','Familiare','Persona assistita','Altro'].map(x=>{const desired=p.relation==='Me stesso'?'Amministratore':(p.relation||(!profile&&!DossierSecurity.isAdministrator()?'Familiare':''));return `<option ${(desired===x)?'selected':''}>${x}</option>`;}).join('')}</select></div>
        <div class="form-group"><label>Colore identificativo</label><input type="color" name="profileColor" class="form-control color-control" value="${esc(p.preferences?.profileColor||'#0f766e')}"></div>
        <div class="form-group"><label>Data di nascita</label><input type="date" name="birthDate" min="1900-01-01" max="${today()}" class="form-control" value="${p.birthDate||''}"></div>
        <div class="form-group"><label>Codice fiscale</label><input name="taxCode" class="form-control" value="${esc(p.taxCode||'')}"></div>
        <div class="form-group"><label>Email</label><input type="email" name="email" class="form-control" value="${esc(p.email||'')}"></div>
        <div class="form-group full"><label>Recapiti telefonici</label><div id="profileDataPhoneRows" class="profile-phone-list"></div><button type="button" class="btn btn-light btn-small" id="profileDataAddPhoneBtn">Aggiungi numero</button></div>
        <div class="form-group full"><label>Indirizzo</label><input name="address" class="form-control" value="${esc(p.address||'')}"></div>
        <div class="form-group"><label>CAP</label><input name="postalCode" class="form-control" value="${esc(p.postalCode||'')}" inputmode="numeric"></div>
        <div class="form-group"><label>Città</label><input name="city" class="form-control" value="${esc(p.city||'')}"></div>
        <div class="form-group"><label>Provincia</label><input name="province" class="form-control" value="${esc(p.province||'')}"></div>
        <div class="form-group full"><label>Note</label><textarea name="notes" class="form-control">${esc(p.notes||'')}</textarea></div>
        <div class="form-actions full"><button type="button" class="btn btn-light" id="profileDataCancelBtn">Annulla</button><button class="btn btn-primary">Salva</button></div>
      </form>`);
    $('#profileDataCancelBtn').onclick=closeModal;
    const phoneTypes=['Personale','Lavoro','Casa','Ufficio','Altro'],rows=$('#profileDataPhoneRows');
    const existing=(Array.isArray(p.phoneNumbers)&&p.phoneNumbers.length?p.phoneNumbers:(p.phone?[{type:'Personale',number:p.phone,customLabel:''}]:[{type:'Personale',number:'',customLabel:''}]));
    const addRow=(item={type:'Personale',number:'',customLabel:''})=>{const row=document.createElement('div');row.className='profile-phone-row';const type=phoneTypes.includes(String(item.type||''))?String(item.type):'Altro';row.innerHTML=`<select class="form-control profile-phone-type">${phoneTypes.map(x=>`<option value="${x}" ${type===x?'selected':''}>${x}</option>`).join('')}</select><input class="form-control profile-phone-custom ${type==='Altro'?'':'hidden'}" value="${esc(item.customLabel||'')}" placeholder="Etichetta"><input class="form-control profile-phone-number" value="${esc(item.number||'')}" placeholder="Numero" inputmode="tel"><button type="button" class="btn btn-ghost btn-small profile-phone-remove">Elimina</button>`;const sel=row.querySelector('.profile-phone-type'),custom=row.querySelector('.profile-phone-custom');sel.onchange=()=>{custom.classList.toggle('hidden',sel.value!=='Altro');if(sel.value!=='Altro')custom.value='';};row.querySelector('.profile-phone-remove').onclick=()=>row.remove();rows.appendChild(row);};
    existing.forEach(addRow);$('#profileDataAddPhoneBtn').onclick=()=>addRow();
    const avatarInput=$('#profileDataOnlyForm [name="avatarFile"]'),avatarPreview=$('#profileDataAvatarPreview');
    const updatePreview=()=>{const file=avatarInput?.files?.[0];if(file){const url=URL.createObjectURL(file);avatarPreview.innerHTML=`<div class="avatar avatar-large avatar-photo"><img src="${url}" alt="Anteprima"></div>`;}const img=avatarPreview?.querySelector('img');if(img){img.style.objectPosition=`${$('#profileDataOnlyForm [name="avatarPositionX"]').value}% ${$('#profileDataOnlyForm [name="avatarPositionY"]').value}%`;img.style.transform=`scale(${$('#profileDataOnlyForm [name="avatarZoom"]').value})`;}};avatarInput?.addEventListener('change',updatePreview);['avatarPositionX','avatarPositionY','avatarZoom'].forEach(name=>$('#profileDataOnlyForm [name="'+name+'"]')?.addEventListener('input',updatePreview));
    $('#profileDataOnlyForm').onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.target),birthDate=String(fd.get('birthDate')||'');if(birthDate&&!isValidClinicalDate(birthDate)){toast('Data di nascita non valida');return;}const phoneNumbers=[...e.target.querySelectorAll('.profile-phone-row')].map(row=>{const type=String(row.querySelector('.profile-phone-type')?.value||'Personale'),number=String(row.querySelector('.profile-phone-number')?.value||'').trim(),customLabel=type==='Altro'?String(row.querySelector('.profile-phone-custom')?.value||'').trim():'';return{type,number,customLabel};}).filter(x=>x.number);const avatar=fd.get('avatarFile'),relation=String(fd.get('relation')||'');const updated={...p,firstName:String(fd.get('firstName')||'').trim(),lastName:String(fd.get('lastName')||'').trim(),relation:relation==='Me stesso'?'Amministratore':relation,birthDate,taxCode:String(fd.get('taxCode')||'').trim(),email:String(fd.get('email')||'').trim(),phoneNumbers,phone:phoneNumbers[0]?.number||'',address:String(fd.get('address')||'').trim(),postalCode:String(fd.get('postalCode')||'').trim(),city:String(fd.get('city')||'').trim(),province:String(fd.get('province')||'').trim(),notes:String(fd.get('notes')||'').trim(),preferences:{...DEFAULT_PROFILE_PREFS,...(p.preferences||{}),profileColor:String(fd.get('profileColor')||p.preferences?.profileColor||'#0f766e')},avatarPositionX:Number(fd.get('avatarPositionX')||50),avatarPositionY:Number(fd.get('avatarPositionY')||50),avatarZoom:Number(fd.get('avatarZoom')||1),updatedAt:new Date().toISOString()};if(fd.get('removeAvatar')){delete updated.avatarBlob;delete updated.avatarName;}if(avatar instanceof File&&avatar.size){updated.avatarBlob=avatar;updated.avatarName=avatar.name;}await DossierDB.put('profiles',updated);closeModal();await loadAll();state.activeProfileId=updated.id;await loadProfileData();render();toast('Dati del profilo salvati');};
  }

  function openEmergencyModal(profile=activeProfile()){
    const p=profile||{},emergency=profileEmergencyParts(p),doctor=doctorContact(p);
    openModal('Modifica emergenza','Modifica esclusivamente le informazioni del riquadro Emergenza.',`
      <form id="emergencyOnlyForm" class="form-grid">
        <div class="form-group"><label>Nominativo contatto</label><input name="emergencyContactName" class="form-control" value="${esc(emergency.name||'')}"></div>
        <div class="form-group"><label>Rapporto</label><input name="emergencyContactRelation" class="form-control" value="${esc(p.emergencyContactRelation||'')}" placeholder="Es. coniuge"></div>
        <div class="form-group"><label>Telefono contatto</label><input name="emergencyContactPhone" class="form-control" value="${esc(emergency.phone||'')}" inputmode="tel"></div>
        <div class="form-group"><label>Gruppo sanguigno</label><div class="inline-field-actions"><input name="bloodGroup" class="form-control" value="${esc(p.bloodGroup||'')}"><button type="button" class="btn btn-light" id="emergencyDetectBloodBtn">Rileva dai referti</button></div></div>
        <div class="form-group full"><label>Note contatto di emergenza</label><textarea name="emergencyContactNotes" class="form-control">${esc(p.emergencyContactNotes||'')}</textarea></div>
        <div class="form-group full"><label>Allergie rilevanti</label><textarea name="emergencyAllergies" class="form-control">${esc(p.emergencyAllergies||'')}</textarea></div>
        <div class="form-group full"><label>Terapie critiche</label><textarea name="emergencyCriticalTherapies" class="form-control">${esc(p.emergencyCriticalTherapies||'')}</textarea></div>
        <div class="form-group full"><label>Condizioni o dispositivi rilevanti</label><textarea name="emergencyRelevantConditions" class="form-control">${esc(p.emergencyRelevantConditions||'')}</textarea></div>
        <div class="form-group full profile-form-section-title"><h3>Medico di base</h3></div>
        <div class="form-group"><label>Nominativo medico</label><input name="primaryDoctor" class="form-control" value="${esc(doctor.name||'')}"></div>
        <div class="form-group"><label>Telefono medico</label><input name="primaryDoctorPhone" class="form-control" value="${esc(doctor.phone||'')}"></div>
        <div class="form-group full"><label>Email medico</label><input type="email" name="primaryDoctorEmail" class="form-control" value="${esc(doctor.email||'')}"></div>
        <div class="form-group full"><label>Note medico</label><textarea name="primaryDoctorNotes" class="form-control">${esc(p.primaryDoctorNotes||'')}</textarea></div>
        <div class="form-actions full"><button type="button" class="btn btn-light" id="emergencyCancelBtn">Annulla</button><button class="btn btn-primary">Salva emergenza</button></div>
      </form>`);
    $('#emergencyCancelBtn').onclick=closeModal;
    $('#emergencyDetectBloodBtn').onclick=async()=>{const b=$('#emergencyDetectBloodBtn');b.disabled=true;try{const found=detectBloodGroup22(p,state.documents.filter(d=>d.profileId===p.id)),input=$('#emergencyOnlyForm [name="bloodGroup"]');if(found.status==='found'){input.value=found.value;input.dataset.autoDetected='true';input.dataset.evidence=JSON.stringify(found.evidence.slice(0,10));toast(`Gruppo ${found.value} rilevato.`);}else if(found.status==='conflict')toast(`Fonti discordanti: ${found.values.join(', ')}.`);else toast('Nessun gruppo sanguigno affidabile trovato.');}finally{b.disabled=false;}};
    $('#emergencyOnlyForm').onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.target),bloodInput=e.target.querySelector('[name="bloodGroup"]');const updated={...p,emergencyContactName:String(fd.get('emergencyContactName')||'').trim(),emergencyContactRelation:String(fd.get('emergencyContactRelation')||'').trim(),emergencyContactPhone:String(fd.get('emergencyContactPhone')||'').trim(),emergencyContactNotes:String(fd.get('emergencyContactNotes')||'').trim(),emergencyAllergies:String(fd.get('emergencyAllergies')||'').trim(),emergencyCriticalTherapies:String(fd.get('emergencyCriticalTherapies')||'').trim(),emergencyRelevantConditions:String(fd.get('emergencyRelevantConditions')||'').trim(),bloodGroup:String(fd.get('bloodGroup')||'').trim(),primaryDoctor:String(fd.get('primaryDoctor')||'').trim(),primaryDoctorPhone:String(fd.get('primaryDoctorPhone')||'').trim(),primaryDoctorEmail:String(fd.get('primaryDoctorEmail')||'').trim(),primaryDoctorNotes:String(fd.get('primaryDoctorNotes')||'').trim(),updatedAt:new Date().toISOString()};updated.emergencyContact=[updated.emergencyContactName,updated.emergencyContactPhone].filter(Boolean).join(' ');if(bloodInput?.dataset.autoDetected==='true'){updated.bloodGroupSourceType='automatic';updated.bloodGroupAutoDetected=true;updated.bloodGroupDetectionStatus='confirmed';try{updated.bloodGroupEvidence=JSON.parse(bloodInput.dataset.evidence||'[]');}catch{updated.bloodGroupEvidence=[];}}else if(updated.bloodGroup){updated.bloodGroupSourceType='manual';updated.bloodGroupAutoDetected=false;updated.bloodGroupDetectionStatus='manual';}await DossierDB.put('profiles',updated);closeModal();await loadAll();await loadProfileData();render();toast('Emergenza aggiornata');};
  }

  function openHealthCardEditModal(profile=activeProfile()){
    const p=profile||{};
    openModal('Modifica tessera sanitaria','Modifica esclusivamente numero, scadenza e immagini della tessera.',`
      <form id="healthCardOnlyForm" class="form-grid">
        <div class="form-group"><label>Numero tessera sanitaria</label><input name="healthCard" class="form-control" value="${esc(p.healthCard||'')}"></div>
        <div class="form-group"><label>Scadenza tessera</label><input type="date" name="healthCardExpiry" class="form-control" value="${p.healthCardExpiry||''}"></div>
        <div class="form-group"><label>Fronte tessera</label><input type="file" name="healthCardFrontFile" accept="image/*" class="form-control">${p.healthCardFrontBlob?'<label class="check-row"><input type="checkbox" name="removeHealthCardFront"> Rimuovi fronte attuale</label>':''}</div>
        <div class="form-group"><label>Retro tessera</label><input type="file" name="healthCardBackFile" accept="image/*" class="form-control">${p.healthCardBackBlob?'<label class="check-row"><input type="checkbox" name="removeHealthCardBack"> Rimuovi retro attuale</label>':''}</div>
        <div class="form-actions full"><button type="button" class="btn btn-light" id="healthCardOnlyCancelBtn">Annulla</button><button class="btn btn-primary">Salva tessera</button></div>
      </form>`);
    $('#healthCardOnlyCancelBtn').onclick=closeModal;
    $('#healthCardOnlyForm').onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.target),front=fd.get('healthCardFrontFile'),back=fd.get('healthCardBackFile');const updated={...p,healthCard:String(fd.get('healthCard')||'').trim(),healthCardExpiry:String(fd.get('healthCardExpiry')||''),updatedAt:new Date().toISOString()};if(fd.get('removeHealthCardFront')){delete updated.healthCardFrontBlob;delete updated.healthCardFrontName;}if(fd.get('removeHealthCardBack')){delete updated.healthCardBackBlob;delete updated.healthCardBackName;}if(front instanceof File&&front.size){updated.healthCardFrontBlob=front;updated.healthCardFrontName=front.name;}if(back instanceof File&&back.size){updated.healthCardBackBlob=back;updated.healthCardBackName=back.name;}await DossierDB.put('profiles',updated);await syncHealthCardExpiryAgenda(updated,p.healthCardExpiry||'');closeModal();await loadAll();await loadProfileData();render();toast('Tessera sanitaria aggiornata');};
  }

  function openProfileModal(profile=null) {
    const p=profile||{}, emergency=profileEmergencyParts(p);
    openModal(profile?'Modifica profilo':'Nuova persona','Ogni profilo mantiene documenti e dati separati.',`
      <form id="profileForm" class="form-grid">
        <div class="form-group full avatar-editor"><div id="avatarPreview">${profileAvatarHtml(p,'avatar avatar-large')}</div><div><label>Avatar o fotografia personale</label><input type="file" name="avatarFile" accept="image/jpeg,image/png,image/webp" class="form-control"><small>L’immagine viene copiata nell’archivio e inclusa nei backup.</small>${p.avatarBlob?'<label class="check-row"><input type="checkbox" name="removeAvatar"> Rimuovi immagine attuale</label>':''}</div></div>
        <div class="form-group"><label>Posizione orizzontale</label><input type="range" name="avatarPositionX" min="0" max="100" value="${Number(p.avatarPositionX??50)}"></div>
        <div class="form-group"><label>Posizione verticale</label><input type="range" name="avatarPositionY" min="0" max="100" value="${Number(p.avatarPositionY??50)}"></div>
        <div class="form-group"><label>Zoom fotografia</label><input type="range" name="avatarZoom" min="1" max="2" step="0.05" value="${Number(p.avatarZoom||1)}"></div>
        <div class="form-group"><label>Nome *</label><input name="firstName" class="form-control" required value="${esc(p.firstName||'')}"></div>
        <div class="form-group"><label>Cognome *</label><input name="lastName" class="form-control" required value="${esc(p.lastName||'')}"></div>
        <div class="form-group"><label>Relazione con l’amministratore</label><select name="relation" class="form-control">${['Amministratore','Figlio minorenne','Genitore','Coniuge','Familiare','Persona assistita','Altro'].map(x=>`<option ${((p.relation==='Me stesso'?'Amministratore':p.relation)===x)?'selected':''}>${x}</option>`).join('')}</select></div>
        <div class="form-group"><label>Colore identificativo</label><input type="color" name="profileColor" class="form-control color-control" value="${esc(p.preferences?.profileColor||PROFILE_COLORS[state.profiles.length%PROFILE_COLORS.length])}"></div>
        <div class="form-group"><label>Data di nascita</label><input type="date" name="birthDate" min="1900-01-01" max="${today()}" class="form-control" value="${p.birthDate||''}"></div>
        <div class="form-group"><label>Codice fiscale</label><input name="taxCode" class="form-control" value="${esc(p.taxCode||'')}"></div>
        <div class="form-group"><label>Numero tessera sanitaria</label><input name="healthCard" class="form-control" value="${esc(p.healthCard||'')}"></div>
        <div class="form-group"><label>Scadenza tessera</label><input type="date" name="healthCardExpiry" min="1900-01-01" class="form-control" value="${p.healthCardExpiry||''}"></div>
        <div class="form-group"><label>Gruppo sanguigno</label><div class="inline-field-actions"><input name="bloodGroup" class="form-control" value="${esc(p.bloodGroup||'')}"><button type="button" class="btn btn-light" id="detectBloodGroupBtn">Rileva dai referti</button></div><small>${p.bloodGroupSourceType==='automatic'?`Rilevato automaticamente${p.bloodGroupDetectionStatus==='conflict'?' · fonti discordanti':''}`:p.bloodGroup?'Inserito manualmente':'Non impostato'}</small></div>
        <div class="form-group"><label>Fronte tessera sanitaria</label><input type="file" name="healthCardFrontFile" accept="image/*" class="form-control"><small>${p.healthCardFrontName?`Attuale: ${esc(p.healthCardFrontName)}`:'Nessuna immagine caricata'}</small>${p.healthCardFrontBlob?'<label class="check-row"><input type="checkbox" name="removeHealthCardFront"> Rimuovi immagine attuale</label>':''}</div>
        <div class="form-group"><label>Retro tessera sanitaria</label><input type="file" name="healthCardBackFile" accept="image/*" class="form-control"><small>${p.healthCardBackName?`Attuale: ${esc(p.healthCardBackName)}`:'Nessuna immagine caricata'}</small>${p.healthCardBackBlob?'<label class="check-row"><input type="checkbox" name="removeHealthCardBack"> Rimuovi immagine attuale</label>':''}</div>
        <div class="form-group"><label>Email</label><input type="email" name="email" class="form-control" value="${esc(p.email||'')}"></div>
        <div class="form-group full"><label>Recapiti telefonici</label><div id="profilePhoneRows" class="profile-phone-list"></div><button type="button" class="btn btn-light btn-small" id="addProfilePhoneBtn">Aggiungi numero</button><small>Per ogni numero scegli Personale, Lavoro, Casa, Ufficio oppure Altro. Se scegli Altro puoi creare un’etichetta personale.</small></div>
        <div class="form-group full"><label>Indirizzo</label><input name="address" class="form-control" value="${esc(p.address||'')}"></div>
        <div class="form-group"><label>CAP</label><input name="postalCode" class="form-control" value="${esc(p.postalCode||'')}" inputmode="numeric" autocomplete="postal-code"></div>
        <div class="form-group"><label>Città</label><input name="city" class="form-control" value="${esc(p.city||'')}" autocomplete="address-level2"></div>
        <div class="form-group"><label>Provincia</label><input name="province" class="form-control" value="${esc(p.province||'')}" autocomplete="address-level1"></div>
        <div class="form-group full profile-form-section-title"><h3>Emergenza</h3><small>Inserisci solo informazioni che possono essere utili rapidamente in caso di necessità.</small></div>
        <div class="form-group"><label>Nominativo contatto di emergenza</label><input name="emergencyContactName" class="form-control" value="${esc(emergency.name||'')}"></div>
        <div class="form-group"><label>Rapporto con il contatto</label><input name="emergencyContactRelation" class="form-control" value="${esc(p.emergencyContactRelation||'')}" placeholder="Es. coniuge, figlia, fratello"></div>
        <div class="form-group"><label>Telefono di emergenza</label><input name="emergencyContactPhone" class="form-control" value="${esc(emergency.phone||'')}" inputmode="tel" autocomplete="tel"></div>
        <div class="form-group"><label>Gruppo sanguigno</label><div class="inline-field-actions"><input name="emergencyBloodGroupMirror" class="form-control" value="${esc(p.bloodGroup||'')}" readonly><button type="button" class="btn btn-light" id="focusBloodGroupBtn">Modifica sopra</button></div></div>
        <div class="form-group full"><label>Allergie rilevanti</label><textarea name="emergencyAllergies" class="form-control" placeholder="Es. penicillina, lattice, mezzo di contrasto">${esc(p.emergencyAllergies||'')}</textarea></div>
        <div class="form-group full"><label>Terapie critiche</label><textarea name="emergencyCriticalTherapies" class="form-control" placeholder="Es. anticoagulante, insulina">${esc(p.emergencyCriticalTherapies||'')}</textarea></div>
        <div class="form-group full"><label>Condizioni o dispositivi rilevanti</label><textarea name="emergencyRelevantConditions" class="form-control" placeholder="Es. pacemaker, epilessia, diabete insulinotrattato">${esc(p.emergencyRelevantConditions||'')}</textarea></div>
        <div class="form-group full"><label>Note contatto di emergenza</label><textarea name="emergencyContactNotes" class="form-control">${esc(p.emergencyContactNotes||'')}</textarea></div>
        <div class="form-group full profile-form-section-title"><h3>Medico di base</h3></div>
        <div class="form-group"><label>Medico di base</label><input name="primaryDoctor" class="form-control" value="${esc(p.primaryDoctor||'')}"></div>
        <div class="form-group"><label>Telefono medico di base</label><input name="primaryDoctorPhone" class="form-control" value="${esc(p.primaryDoctorPhone||'')}"></div>
        <div class="form-group"><label>Email medico di base</label><input type="email" name="primaryDoctorEmail" class="form-control" value="${esc(p.primaryDoctorEmail||'')}"></div>
        <div class="form-group full"><label>Note medico di base</label><textarea name="primaryDoctorNotes" class="form-control">${esc(p.primaryDoctorNotes||'')}</textarea></div>
        <div class="form-group full"><label>Note</label><textarea name="notes" class="form-control">${esc(p.notes||'')}</textarea></div>
        <div class="form-actions"><button type="button" class="btn btn-light" id="cancelModalBtn">Annulla</button><button class="btn btn-primary">Salva profilo</button></div>
      </form>`);
    $('#cancelModalBtn').onclick=closeModal;
    const avatarInput=$('#profileForm [name="avatarFile"]');const avatarPreview=$('#avatarPreview');
    const updateAvatarPreview=()=>{const file=avatarInput?.files?.[0];const img=avatarPreview?.querySelector('img');if(file){const url=URL.createObjectURL(file);avatarPreview.innerHTML=`<div class="avatar avatar-large avatar-photo"><img src="${url}" alt="Anteprima fotografia"></div>`;}const target=avatarPreview?.querySelector('img');if(target){target.style.objectPosition=`${$('#profileForm [name="avatarPositionX"]').value}% ${$('#profileForm [name="avatarPositionY"]').value}%`;target.style.transform=`scale(${$('#profileForm [name="avatarZoom"]').value})`;}};
    avatarInput?.addEventListener('change',updateAvatarPreview);['avatarPositionX','avatarPositionY','avatarZoom'].forEach(name=>$('#profileForm [name="'+name+'"]')?.addEventListener('input',updateAvatarPreview));
    const phoneTypes=['Personale','Lavoro','Casa','Ufficio','Altro'];
    const existingPhones=(Array.isArray(p.phoneNumbers)&&p.phoneNumbers.length?p.phoneNumbers:(p.phone?[{type:'Personale',number:p.phone,customLabel:''}]:[{type:'Personale',number:'',customLabel:''}])).map(x=>({type:phoneTypes.includes(String(x?.type||''))?String(x.type):'Altro',number:String(x?.number||''),customLabel:String(x?.customLabel||'')}));
    const phoneRows=$('#profilePhoneRows');
    const addPhoneRow=(item={type:'Personale',number:'',customLabel:''})=>{const row=document.createElement('div');row.className='profile-phone-row';row.innerHTML=`<select class="form-control profile-phone-type" aria-label="Tipo numero">${phoneTypes.map(type=>`<option value="${type}" ${item.type===type?'selected':''}>${type}</option>`).join('')}</select><input class="form-control profile-phone-custom ${item.type==='Altro'?'':'hidden'}" value="${esc(item.customLabel||'')}" placeholder="Etichetta personalizzata" aria-label="Etichetta personalizzata"><input class="form-control profile-phone-number" value="${esc(item.number||'')}" placeholder="Numero di telefono" inputmode="tel" autocomplete="tel"><button type="button" class="btn btn-ghost btn-small profile-phone-remove">Elimina</button>`;const typeSelect=row.querySelector('.profile-phone-type'),custom=row.querySelector('.profile-phone-custom');typeSelect.addEventListener('change',()=>{custom.classList.toggle('hidden',typeSelect.value!=='Altro');if(typeSelect.value!=='Altro')custom.value='';});row.querySelector('.profile-phone-remove').addEventListener('click',()=>{if(phoneRows.children.length>1)row.remove();else{row.querySelector('.profile-phone-number').value='';custom.value='';typeSelect.value='Personale';custom.classList.add('hidden');}});phoneRows.appendChild(row);};
    existingPhones.forEach(addPhoneRow);$('#addProfilePhoneBtn')?.addEventListener('click',()=>addPhoneRow());
    $('#focusBloodGroupBtn')?.addEventListener('click',()=>{const input=$('#profileForm [name="bloodGroup"]');if(input){input.scrollIntoView({behavior:'smooth',block:'center'});setTimeout(()=>input.focus(),250);}});
    const detectBloodButton=$('#detectBloodGroupBtn');if(detectBloodButton)detectBloodButton.onclick=async()=>{detectBloodButton.disabled=true;detectBloodButton.textContent='Ricerca in corso';try{const found=detectBloodGroup22(p,state.documents.filter(d=>d.profileId===p.id));const input=$('#profileForm [name="bloodGroup"]');if(found.status==='found'){input.value=found.value;input.dataset.autoDetected='true';input.dataset.evidence=JSON.stringify(found.evidence.slice(0,10));toast(`Gruppo ${found.value} rilevato in ${found.evidence.length} fonte/i.`);}else if(found.status==='conflict'){toast(`Fonti discordanti: ${found.values.join(', ')}. Nessun valore inserito.`);}else toast('Nessun gruppo sanguigno esplicito e affidabile trovato.');}finally{detectBloodButton.disabled=false;detectBloodButton.textContent='Rileva dai referti';}};
    $('#profileForm').onsubmit=async e=>{
      e.preventDefault(); const fd=new FormData(e.target); const data=Object.fromEntries(fd); const bloodInput=e.target.querySelector('[name="bloodGroup"]');
      const birthDate=String(data.birthDate||'');
      if (birthDate && !isValidClinicalDate(birthDate)) {toast('La data di nascita deve essere compresa tra il 01/01/1900 e oggi');return;}
      const front=fd.get('healthCardFrontFile'), back=fd.get('healthCardBackFile'), avatar=fd.get('avatarFile');
      delete data.healthCardFrontFile; delete data.healthCardBackFile; delete data.removeHealthCardFront; delete data.removeHealthCardBack; delete data.avatarFile; delete data.removeAvatar; delete data.emergencyBloodGroupMirror;
      const profileColor=data.profileColor||p.preferences?.profileColor||PROFILE_COLORS[state.profiles.length%PROFILE_COLORS.length];delete data.profileColor;const phoneNumbers=[...e.target.querySelectorAll('.profile-phone-row')].map(row=>{const type=String(row.querySelector('.profile-phone-type')?.value||'Personale');const number=String(row.querySelector('.profile-phone-number')?.value||'').trim();const customLabel=type==='Altro'?String(row.querySelector('.profile-phone-custom')?.value||'').trim():'';return {type,number,customLabel};}).filter(x=>x.number);data.phoneNumbers=phoneNumbers;data.phone=phoneNumbers[0]?.number||'';data.emergencyContactName=String(data.emergencyContactName||'').trim();data.emergencyContactRelation=String(data.emergencyContactRelation||'').trim();data.emergencyContactPhone=String(data.emergencyContactPhone||'').trim();data.emergencyAllergies=String(data.emergencyAllergies||'').trim();data.emergencyCriticalTherapies=String(data.emergencyCriticalTherapies||'').trim();data.emergencyRelevantConditions=String(data.emergencyRelevantConditions||'').trim();data.emergencyContactNotes=String(data.emergencyContactNotes||'').trim();data.primaryDoctorNotes=String(data.primaryDoctorNotes||'').trim();data.emergencyContact=[data.emergencyContactName,data.emergencyContactPhone].filter(Boolean).join(' ');if(data.relation==='Me stesso')data.relation='Amministratore';const value={...p,...data,preferences:{...DEFAULT_PROFILE_PREFS,...(p.preferences||{}),profileColor},id:p.id||uid('profile'),createdAt:p.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};
      if(bloodInput?.dataset.autoDetected==='true'){value.bloodGroupSourceType='automatic';value.bloodGroupAutoDetected=true;value.bloodGroupDetectionStatus='confirmed';try{value.bloodGroupEvidence=JSON.parse(bloodInput.dataset.evidence||'[]');}catch(_){value.bloodGroupEvidence=[];}}else if(String(value.bloodGroup||'').trim()){value.bloodGroupSourceType='manual';value.bloodGroupAutoDetected=false;value.bloodGroupDetectionStatus='manual';delete value.bloodGroupConflictValues;}else{delete value.bloodGroupSourceType;delete value.bloodGroupAutoDetected;delete value.bloodGroupDetectionStatus;delete value.bloodGroupEvidence;}
      if (fd.get('removeAvatar')) {delete value.avatarBlob;delete value.avatarName;}
      if (avatar instanceof File && avatar.size) {value.avatarBlob=avatar;value.avatarName=avatar.name;}
      value.avatarPositionX=Number(fd.get('avatarPositionX')||50);value.avatarPositionY=Number(fd.get('avatarPositionY')||50);value.avatarZoom=Number(fd.get('avatarZoom')||1);
      if (fd.get('removeHealthCardFront')) {delete value.healthCardFrontBlob;delete value.healthCardFrontName;}
      if (fd.get('removeHealthCardBack')) {delete value.healthCardBackBlob;delete value.healthCardBackName;}
      if (front instanceof File && front.size) {value.healthCardFrontBlob=front;value.healthCardFrontName=front.name;}
      if (back instanceof File && back.size) {value.healthCardBackBlob=back;value.healthCardBackName=back.name;}
      await DossierDB.put('profiles',value);if(!p.id&&!DossierSecurity.isAdministrator()&&!DossierSecurity.currentUser?.()?.linkedProfileId)await DossierSecurity.linkOwnProfile(value.id);await syncHealthCardExpiryAgenda(value,p.healthCardExpiry||''); closeModal(); await loadAll(); state.activeProfileId=value.id; await DossierDB.put('settings',{key:'activeProfileId',value:value.id}); await loadProfileData(); await loadPreferences(); render(); toast('Profilo salvato');
    };
  }

  async function openImportModal(options={}) {
    if (!activeProfile()) return;
    state.importOptions=(options&&!(options instanceof Event))?options:{};
    state.selectedFiles=[]; state.importQueue=[];
    openModal(state.importOptions.preferredCategory?`Importa ${state.importOptions.preferredCategory.toLowerCase()}`:'Importa e analizza documenti',`Profilo: ${activeProfile().firstName} ${activeProfile().lastName}`,`
      <div class="import-workspace">
        <div class="file-drop" id="fileDrop"><strong>Acquisisci referti e documenti sanitari</strong><p class="kpi-note">Puoi caricare file, fotografare più pagine o usare uno scanner locale. L’analisi parte automaticamente e i campi secondari restano facoltativi.</p><input id="fileInput" type="file" multiple accept="application/pdf,image/jpeg,image/png,image/bmp,image/tiff" class="hidden"><input id="cameraInput" type="file" accept="image/*" capture="environment" class="hidden"><div class="acquisition-buttons"><button type="button" id="chooseFilesBtn" class="btn btn-primary">Scegli file</button><button type="button" id="cameraBtn" class="btn btn-light">Fotocamera multipagina</button><button type="button" id="scannerBtn" class="btn btn-light">Scanner locale</button></div><small>Per PDF con testo digitale il programma usa prima l’estrazione nativa, quando il componente è installato; le scansioni usano OCR locale a 3 passaggi.</small></div>
        <div class="ocr-health ${(state.ocrHealth.ocrAvailable||state.ocrHealth.nativePdfAvailable||state.ocrHealth.ocrDeferred)?'ok':'error'}"><strong>${(state.ocrHealth.ocrAvailable||state.ocrHealth.nativePdfAvailable||state.ocrHealth.ocrDeferred)?'Motore locale disponibile':'Motore locale non disponibile'}</strong><span>${esc(state.ocrHealth.engine||'Motore Python locale')}${state.ocrHealth.nativePdfAvailable?' · lettura PDF attiva':' · motore PDF non disponibile'}${state.ocrHealth.scannerAvailable?' · scanner rilevato':' · scanner verificato al primo utilizzo'}</span></div>
        <div id="queueSummary"></div>
        <div id="importQueue" class="import-queue"></div>
        <div class="form-actions sticky-actions"><button type="button" class="btn btn-light" id="cancelModalBtn">Annulla</button><button type="button" class="btn btn-light" id="retryOcrBtn">Rianalizza errori</button><button type="button" class="btn btn-primary" id="archiveQueueBtn">Attendi analisi</button></div>
      </div>`);
    $('#cancelModalBtn').onclick=closeModal;
    $('#chooseFilesBtn').onclick=()=>$('#fileInput').click();
    $('#cameraBtn').onclick=()=>openCameraCapture({single:false,onComplete:addImportFiles});
    $('#scannerBtn').onclick=acquireFromScannerForQueue;
    $('#fileInput').onchange=e=>addImportFiles([...e.target.files]);
    $('#cameraInput').onchange=e=>addImportFiles([...e.target.files]);
    $('#retryOcrBtn').onclick=()=>processImportQueue(true);
    $('#archiveQueueBtn').onclick=archiveImportQueue;
    const drop=$('#fileDrop');
    ['dragenter','dragover'].forEach(evt=>drop.addEventListener(evt,e=>{e.preventDefault();drop.classList.add('dragover');}));
    ['dragleave','drop'].forEach(evt=>drop.addEventListener(evt,e=>{e.preventDefault();drop.classList.remove('dragover');}));
    drop.addEventListener('drop',e=>addImportFiles([...e.dataTransfer.files]));
    renderImportQueue();
  }

  async function addImportFiles(files=[]) {
    let accepted=files.filter(f=>/^(application\/pdf|image\/(jpeg|png|bmp|tiff))$/i.test(f.type)||/\.(pdf|jpe?g|png|bmp|tiff?)$/i.test(f.name));
    if (!accepted.length) {toast('Nessun formato supportato selezionato');return;}
    if(accepted.length>1&&!globalThis.DossierFeatures?.has?.('bulkImport')){accepted=accepted.slice(0,1);toast('Nel piano FREE puoi importare un documento alla volta. Importazione multipla disponibile dal piano MEDIUM.');}
    const totalBytes=accepted.reduce((sum,f)=>sum+Number(f.size||0),0);if(!await ensureStorageFor(totalBytes,'l’importazione dei documenti'))return;
    for (const file of accepted) {
      const fileDate=(HealthExtractors.detectDateFromFilename(file.name)||[]).find(x=>HealthExtractors.isPlausibleClinicalIso(x.iso))||null;
      state.importQueue.push({
        id:uid('queue'),file,include:true,status:'queued',progress:0,message:fileDate?`Data ${fileDate.iso.split('-').reverse().join('/')} rilevata dal nome file · in attesa di analisi`:'In attesa di analisi',hash:'',reviewOpen:false,allowNoDate:false,
        meta:{clinicalDate:fileDate?.iso||'',issueDate:'',title:file.name.replace(/\.[^.]+$/,'').replace(/[_-]+/g,' '),category:state.importOptions.preferredCategory||'',doctor:'',facility:'',department:'',documentNumber:'',extractedText:'',notes:'',labValues:[],extractedTherapies:[],extractedDiagnoses:[],extractedExemptions:[],importTherapies:Boolean(state.importOptions.extractTherapies),importDiagnoses:Boolean(state.importOptions.extractDiagnoses),importExemptions:Boolean(state.importOptions.extractExemptions),targetSection:state.importOptions.targetSection||'',sectionMergePolicy:'keep',documentMode:'',documentKind:'',specialization:'',reconstructedText:'',reportSections:[],dateCandidates:fileDate?[fileDate]:[],dateStatus:fileDate?'filename-preliminary':'missing',dateConfidence:fileDate?92:0,profileEvidence:null,pageFingerprints:[],medicalPersonnel:[],identifiers:[],qualitativeResults:[],tableRows:[],structuredText:'',extractionStats:null},
        duplicateDecision:null,profileDecision:null,errorDecision:null,error:''
      });
    }
    renderImportQueue();
    await processImportQueue(false);
  }

  async function ensureDocumentHashes(allDocs) {
    for (const doc of allDocs) {
      if (!doc.hash && doc.fileBlob) {
        try {doc.hash=await fileHash(doc.fileBlob);await DossierDB.put('documents',doc);} catch {}
      }
    }
  }

  function candidatePageFingerprints(candidate) {
    if (candidate.file) return candidate.meta?.pageFingerprints||[];
    return normalizePageFingerprints(candidate);
  }

  function findPageRelationships(item, allDocs) {
    const source=item.meta?.pageFingerprints||[]; if (!source.length) return [];
    const candidates=[...allDocs.map(d=>({kind:'archived',ref:d,label:d.title||d.originalName})),...state.importQueue.filter(q=>q!==item&&q.meta?.pageFingerprints?.length&&q.status!=='error').map(q=>({kind:'queue',ref:q,label:q.meta?.title||q.file.name}))];
    const found=[];
    for (const c of candidates) {
      const comparison=HealthExtractors.comparePageCollections(source,candidatePageFingerprints(c.ref));
      if (!comparison) continue;
      found.push({...comparison,kind:c.kind,ref:c.ref,label:c.label});
    }
    return found.sort((a,b)=>b.average-a.average||b.matches.length-a.matches.length);
  }

  function statusAfterResolved(item) {
    if (item.exactDuplicate && !item.duplicateDecision) return 'duplicate-update';
    if (item.meta.profileEvidence?.status==='conflict' && item.profileDecision!=='confirmed') return 'profile-conflict';
    if (!isValidClinicalDate(item.meta.clinicalDate||'')) return 'pending-date';
    return 'ready';
  }

  function queueIsProcessing(item) { return ['queued','hashing','ocr'].includes(item.status); }
  function queueNeedsDecision(item) { return item.include && ['duplicate','duplicate-update','possible-duplicate','page-overlap','profile-conflict','pending-date','error'].includes(item.status); }
  function queueCanArchive(item) { return !item.include || item.status==='ready'; }

  function analyzeOcrResult(result,profileId,fileName='') {
    // Compatibilità parser v17: Python resta la fonte per OCR/coordinate e per gli estrattori
    // strutturati, ma NON puo' sovrascrivere come ultimo passaggio la
    // classificazione semantica e la ricostruzione narrativa del browser.
    // Dopo il merge si applica sempre il canone corrente una sola volta.
    const text=String(result?.text||'');
    const fallback=HealthExtractors.analyzeText(text,state.profiles,profileId,result?.pages||[],fileName);
    const py=result&&result.analysis;
    let merged=py?{...fallback,...py,
      extractedText:text,
      originalName:fileName||py.originalName||fallback.originalName||'',
      labValues:HealthExtractors.canonicalizeLabValues(py.labValues||fallback.labValues||[]),
      qualitativeResults:py.qualitativeResults||fallback.qualitativeResults||[],
      profileEvidence:fallback.profileEvidence,
      extractedTherapies:py.extractedTherapies||fallback.extractedTherapies||[],
      extractedDiagnoses:py.extractedDiagnoses||fallback.extractedDiagnoses||[],
      extractedExemptions:py.extractedExemptions||fallback.extractedExemptions||[],
      reconstructedText:py.reconstructedText||fallback.reconstructedText||'',
      reportSections:py.reportSections||fallback.reportSections||[],
      structuredText:py.structuredText||fallback.structuredText||text,
      ocrPageData:result?.pages||[],
      dateCandidates:Array.isArray(py.dateCandidates)?py.dateCandidates:fallback.dateCandidates
    }:{...fallback,extractedText:text,originalName:fileName||fallback.originalName||'',ocrPageData:result?.pages||[]};
    if(HealthExtractors.repairLabDocumentData){
      try{merged=HealthExtractors.repairLabDocumentData(merged).document||merged;}catch(error){console.warn('Riparazione laboratorio non applicata:',error);}
    }
    if(HealthExtractors.canonicalizeClinicalDocument24){
      try{merged=HealthExtractors.canonicalizeClinicalDocument24(merged,{reason:'import-ocr-final'}).document||merged;}catch(error){console.warn('Canone clinico finale non applicato:',error);}
    }
    return merged;
  }

  async function processImportQueue(retryOnly=false) {
    const allDocs=await DossierDB.getAll('documents'); await ensureDocumentHashes(allDocs);
    const activeItems=state.importQueue.filter(item=>!retryOnly||item.status==='error');
    for (const item of activeItems) {
      if (!item.include || !['queued','error'].includes(item.status)) continue;
      try {
        item.reviewOpen=false; item.errorDecision=null;
        item.status='hashing';item.progress=3;item.message='Controllo duplicati esatti';renderImportQueue();
        item.hash=await fileHash(item.file);
        const exact=allDocs.find(d=>d.hash===item.hash) || state.importQueue.find(other=>other!==item&&other.hash===item.hash&&other.status!=='error');
        if (exact) {
          const existing=exact.file?null:exact;const source=existing||exact.meta||{};
          if(existing){
            const reconciled=calendarNormalizeImportedBookingDocument(existing);
            if(reconciled.parsed){
              await DossierDB.put('documents',reconciled.doc,{details:{event:'r12-booking-exact-duplicate-reconciled'}});
              const stateIndex=state.documents.findIndex(x=>String(x.id)===String(reconciled.doc.id));if(stateIndex>=0)state.documents[stateIndex]=reconciled.doc;
              await calendarEnsureEventForImportedBooking(reconciled.doc,reconciled.parsed);
              item.exactDuplicate=reconciled.doc;item.previousAnalysis=reconciled.doc;item.include=false;item.status='excluded';item.progress=100;item.message='Già archiviato · prenotazione aggiornata in Agenda';item.reviewOpen=false;renderImportQueue();continue;
            }
          }
          const sourceText=String(source.extractedText||source.structuredText||'').trim();
          const sourceStructured=(source.labValues||[]).length+(source.qualitativeResults||[]).length+(source.identifiers||[]).length+(source.medicalPersonnel||[]).length;
          const sourceWasAnalyzed=source.ocrStatus==='completed' && sourceText.length>=40;
          if(sourceWasAnalyzed){
            item.exactDuplicate=existing||{id:'',title:source.title||exact.file.name,clinicalDate:source.clinicalDate||'',originalName:exact.file.name,profileId:state.activeProfileId};
            item.previousAnalysis=source;
            item.message='Documento già presente: eseguo una nuova lettura per confrontare le interpretazioni';
          } else if(existing){
            item.repairExisting=existing;
            item.message=`Recupero dati del documento già archiviato senza riconoscimento (${sourceStructured} elementi salvati)`;
          }
        }
        item.status='ocr';item.progress=12;item.message='Analisi PDF/OCR in corso';renderImportQueue();
        const isPdf=/\.pdf$/i.test(item.file.name)||item.file.type==='application/pdf';
        if (!state.ocrHealth.ok) state.ocrHealth=await OCRService.health(true);
        if (!state.ocrHealth.ocrAvailable && !state.ocrHealth.ocrDeferred && !(isPdf&&state.ocrHealth.nativePdfAvailable)) throw new Error(state.ocrHealth.error||'Motore locale non disponibile');
        const result=await OCRService.analyzeFile(item.file,p=>{item.progress=p.progress||item.progress;item.message=p.message||item.message;renderImportQueue();});
        state.ocrHealth=await OCRService.health(true);
        const text=result.text||'';
        let analysis=analyzeOcrResult(result,state.activeProfileId,item.file.name);
        const bookingOverlay=calendarBookingOverlayForImportedAnalysis(text,analysis);analysis=bookingOverlay.analysis;item.bookingParsed=bookingOverlay.parsed;
        if (state.importOptions.preferredCategory && (!analysis.category || analysis.category==='Altro')) analysis.category=state.importOptions.preferredCategory;
        const pageFingerprints=HealthExtractors.buildPageFingerprints(result.pages||[],text,analysis.clinicalDate||'');
        item.ocr={engine:result.engine,language:result.language,pageCount:result.pageCount,processedPages:result.processedPages,warning:result.warning,pages:result.pages||[],quality:Math.round((result.pages||[]).reduce((a,p)=>a+Number(p.quality||0),0)/Math.max(1,(result.pages||[]).length))};
        item.meta={...item.meta,...analysis,category:analysis.category||item.meta.category,extractedText:text,textFingerprint:HealthExtractors.textFingerprint(text),pageFingerprints,importTherapies:item.meta.importTherapies||analysis.documentMode==='therapy',importDiagnoses:item.meta.importDiagnoses||analysis.documentMode==='diagnosis'||(['narrative','mixed'].includes(analysis.documentMode)&&(analysis.extractedDiagnoses||[]).length>0),importExemptions:item.meta.importExemptions||analysis.documentMode==='exemption'};
        item.pageRelationships=findPageRelationships(item,allDocs);
        const significantPages=item.pageRelationships.filter(r=>['same','source-contained','target-contained','partial-overlap'].includes(r.relation));
        const probable=HealthExtractors.probableDuplicate({text,clinicalDate:analysis.clinicalDate,category:analysis.category,facility:analysis.facility},allDocs);
        if (item.exactDuplicate) {item.status='duplicate-update';item.message='Confronta la nuova lettura con quella archiviata';item.reviewOpen=true;}
        else if (analysis.profileEvidence?.status==='conflict') {item.status='profile-conflict';item.message='Decisione richiesta: possibile profilo errato';item.reviewOpen=true;}
        else if (item.bookingParsed) {item.status='ready';item.message=`Pronto · ${item.bookingParsed.service} · ${formatDate(item.bookingParsed.startDate)}${item.bookingParsed.startTime?` · ${item.bookingParsed.startTime}`:''}`;item.reviewOpen=false;}
        else if (significantPages.length) {item.status='page-overlap';item.message=`Decisione richiesta: ${significantPages.length} corrispondenza/e pagina`;item.reviewOpen=true;}
        else if (probable) {item.probableDuplicate=probable;item.status='possible-duplicate';item.message=`Decisione richiesta: possibile duplicato (${Math.round(probable.similarity*100)}%)`;item.reviewOpen=true;}
        else if (!analysis.clinicalDate || analysis.dateStatus==='ambiguous') {item.status='pending-date';item.message=analysis.dateStatus==='ambiguous'?'Chiarimento richiesto: più date plausibili':'Chiarimento richiesto: data clinica non rilevata';item.reviewOpen=true;}
        else {item.status='ready';item.message=analysis.documentMode==='lab'||analysis.documentMode==='mixed'?`Pronto · ${analysis.labValues.length} valori clinici rilevati`:analysis.documentMode==='therapy'?`Pronto · ${(analysis.extractedTherapies||[]).length} terapie rilevate`:analysis.documentMode==='diagnosis'?`Pronto · ${(analysis.extractedDiagnoses||[]).length} diagnosi rilevate`:analysis.documentMode==='exemption'?`Pronto · ${(analysis.extractedExemptions||[]).length} esenzioni rilevate`:(analysis.extractedDiagnoses||[]).length?`Pronto · referto integrale e ${(analysis.extractedDiagnoses||[]).length} proposta/e clinica/he`:'Pronto · referto integrale ricostruito';item.reviewOpen=false;}
        item.progress=100;
      } catch(error) {
        item.status='error';item.error=error.name==='AbortError'?'Tempo OCR scaduto':error.message;item.message='Chiarimento richiesto: OCR non riuscito';item.progress=100;item.reviewOpen=true;
      }
      renderImportQueue();
    }
  }

  function queueStatusClass(item) {
    if (item.status==='ready') return 'success';
    if (['duplicate','duplicate-update','possible-duplicate','page-overlap','profile-conflict','pending-date'].includes(item.status)) return 'warning';
    if (item.status==='error') return 'danger';
    return '';
  }

  function existingDocLabel(doc) {
    const p=state.profiles.find(x=>x.id===doc?.profileId); return `${doc?.title||doc?.originalName||'Documento'}${doc?.clinicalDate?' · '+formatDate(doc.clinicalDate):''}${p?' · '+p.firstName+' '+p.lastName:''}`;
  }

  function queueSummaryHtml() {
    const total=state.importQueue.length;
    const processing=state.importQueue.filter(queueIsProcessing).length;
    const ready=state.importQueue.filter(i=>i.include&&i.status==='ready').length;
    const decisions=state.importQueue.filter(queueNeedsDecision).length;
    const excluded=state.importQueue.filter(i=>!i.include).length;
    if (!total) return '';
    return `<div class="queue-summary"><span><strong>${total}</strong> selezionati</span><span><strong>${processing}</strong> in analisi</span><span><strong>${ready}</strong> pronti</span><span class="${decisions?'attention':''}"><strong>${decisions}</strong> da chiarire</span>${excluded?`<span><strong>${excluded}</strong> esclusi</span>`:''}</div>`;
  }

  function isSpecialistVisitDocument(doc={}) {
    const category=normalizeClinicalText(doc.category||'');
    const kind=normalizeClinicalText(doc.documentKind||'');
    const mode=normalizeClinicalText(doc.documentMode||'');
    if(mode==='lab'||category.includes('esami di laboratorio')||kind.includes('esami di laboratorio'))return false;
    return category.includes('visita specialistica')||(kind.startsWith('visita ')&&mode==='narrative');
  }

  function renderOptionalReview(item) {
    const m=item.meta||{};const mode=m.documentMode||((m.category==='Esami di laboratorio')?'lab':'narrative');
    const therapyRows=(m.extractedTherapies||[]).map((t,i)=>`<tr><td><input class="form-control" data-therapy-field="time" data-row-index="${i}" data-id="${item.id}" value="${esc(t.time||t.schedule||'')}"></td><td><input class="form-control" data-therapy-field="medication" data-row-index="${i}" data-id="${item.id}" value="${esc(t.medication||'')}"></td><td><input class="form-control" data-therapy-field="activeIngredient" data-row-index="${i}" data-id="${item.id}" value="${esc(t.activeIngredient||'')}"></td><td><input class="form-control" data-therapy-field="dosage" data-row-index="${i}" data-id="${item.id}" value="${esc(t.dosage||'')}"></td><td><input class="form-control" data-therapy-field="frequency" data-row-index="${i}" data-id="${item.id}" value="${esc(t.frequency||t.notes||'')}"></td></tr>`).join('');
    const diagnosisRows=(m.extractedDiagnoses||[]).map((d,i)=>`<tr><td class="diag-import-check"><input type="checkbox" data-diagnosis-field="selected" data-row-index="${i}" data-id="${item.id}" ${d.selected===false?'':'checked'}></td><td><input class="form-control" data-diagnosis-field="name" data-row-index="${i}" data-id="${item.id}" value="${esc(d.name||'')}"><small>${d.sourceQuote?esc(d.sourceQuote):''}</small></td><td><input type="date" class="form-control" data-diagnosis-field="date" data-row-index="${i}" data-id="${item.id}" value="${isValidClinicalDate(d.date||'')?d.date:''}"></td><td><div class="diagnosis-import-stack"><label><span>Categoria</span><select class="form-control" data-diagnosis-field="category" data-row-index="${i}" data-id="${item.id}">${DIAGNOSIS_CATEGORIES.map(x=>`<option ${d.category===x?'selected':''}>${x}</option>`).join('')}</select></label><label><span>Stato</span><select class="form-control" data-diagnosis-field="status" data-row-index="${i}" data-id="${item.id}">${DIAGNOSIS_STATUSES.map(x=>`<option ${d.status===x?'selected':''}>${x}</option>`).join('')}</select></label></div></td><td class="diag-import-check"><input type="checkbox" data-diagnosis-field="mainProblem" data-row-index="${i}" data-id="${item.id}" ${d.mainProblem?'checked':''}></td><td><textarea class="form-control compact-textarea" data-diagnosis-field="notes" data-row-index="${i}" data-id="${item.id}">${esc(d.notes||'')}</textarea></td></tr>`).join('');
    const exemptionRows=(m.extractedExemptions||[]).map((x,i)=>`<tr><td><input class="form-control" data-exemption-field="code" data-row-index="${i}" data-id="${item.id}" value="${esc(x.code||'')}"></td><td><input class="form-control" data-exemption-field="description" data-row-index="${i}" data-id="${item.id}" value="${esc(x.description||'')}"></td><td><input class="form-control" data-exemption-field="expiry" data-row-index="${i}" data-id="${item.id}" value="${esc(x.expiry||'')}"></td><td><input class="form-control" data-exemption-field="issuer" data-row-index="${i}" data-id="${item.id}" value="${esc(x.issuer||m.facility||'')}"></td></tr>`).join('');
    return `<div class="optional-review">
      ${item.bookingParsed?`<div class="notice success"><strong>Prenotazione rilevata:</strong> ${esc(item.bookingParsed.service)}<br><strong>Data:</strong> ${esc(formatDate(item.bookingParsed.startDate))}${item.bookingParsed.startTime?` · <strong>Ora:</strong> ${esc(item.bookingParsed.startTime)}`:''}${item.bookingParsed.location?`<br><strong>Luogo:</strong> ${esc(item.bookingParsed.location)}`:''}</div>`:''}
      <div class="notice success"><strong>Tipo riconosciuto:</strong> ${esc(m.documentKind||m.category||'Documento sanitario')} · modalità ${esc(mode)}${m.specialization?` · ${esc(m.specialization)}`:''}</div>
      <div class="form-grid compact-grid">
        <div class="form-group"><label>Data clinica ${m.dateConfidence?`<span class="confidence">OCR ${m.dateConfidence}%</span>`:''}</label><input type="date" min="${MIN_CLINICAL_DATE}" max="${today()}" class="form-control ${item.dateError?'invalid':''}" data-q-date="clinicalDate" data-id="${item.id}" value="${isValidClinicalDate(m.clinicalDate||'')?m.clinicalDate:''}"><small>${item.dateError?esc(item.dateError):'Determina la posizione nella cronologia.'}</small></div>
        <div class="form-group"><label>Data emissione</label><input type="date" min="${MIN_CLINICAL_DATE}" max="${today()}" class="form-control" data-q-date="issueDate" data-id="${item.id}" value="${isValidClinicalDate(m.issueDate||'')?m.issueDate:''}"></div>
        <div class="form-group full"><label>Titolo nel dossier</label><input class="form-control" data-q-field="title" data-id="${item.id}" value="${esc(m.title||item.file.name)}"></div>
        <div class="form-group"><label>Modalità documento</label><select class="form-control" data-q-field="documentMode" data-id="${item.id}">${[['lab','Laboratorio / tabella'],['narrative','Referto narrativo'],['mixed','Documento misto'],['therapy','Piano terapeutico'],['diagnosis','Diagnosi o certificazione'],['exemption','Esenzione']].map(([v,l])=>`<option value="${v}" ${mode===v?'selected':''}>${l}</option>`).join('')}</select></div>
        <div class="form-group"><label>Tipologia</label><input class="form-control" data-q-field="documentKind" data-id="${item.id}" value="${esc(m.documentKind||m.category||'')}"></div>
        <div class="form-group"><label>Specializzazione</label><input class="form-control" data-q-field="specialization" data-id="${item.id}" value="${esc(m.specialization||m.department||'')}"></div>
        ${isSpecialistVisitDocument(m)?`<div class="form-group"><label>Medico/refertante</label><input class="form-control" data-q-field="doctor" data-id="${item.id}" value="${esc(m.doctor||'')}"><small>Conservato per le visite specialistiche; non viene duplicato nel corpo del referto.</small></div>`:''}
        <div class="form-group full"><label>Struttura sanitaria</label><input class="form-control" data-q-field="facility" data-id="${item.id}" value="${esc(m.facility||'')}"></div>
      </div>
      ${m.targetSection?`<div class="form-group full"><label>Gestione dei dati già presenti nella sezione</label><select class="form-control" data-q-field="sectionMergePolicy" data-id="${item.id}"><option value="keep" ${(m.sectionMergePolicy||'keep')==='keep'?'selected':''}>Mantieni le voci esistenti e aggiungi le nuove</option><option value="update" ${m.sectionMergePolicy==='update'?'selected':''}>Aggiorna le voci corrispondenti e aggiungi le nuove</option><option value="replace" ${m.sectionMergePolicy==='replace'?'selected':''}>Sostituisci tutte le voci attuali della sezione</option></select><small>La scelta viene applicata solo dopo la tua conferma di archiviazione.</small></div>`:''}
      ${m.dateCandidates?.length?`<details><summary>Date individuate</summary><div class="candidate-list">${m.dateCandidates.slice(0,10).map(d=>`<button type="button" class="btn btn-light btn-small" data-use-date="${d.iso}" data-id="${item.id}">${formatDate(d.iso)} · ${esc(d.kind||'data')}</button>`).join('')}</div></details>`:''}
      ${(mode==='lab'||mode==='mixed')&&m.labValues?.length?`<details open><summary>${m.labValues.length} valori numerici e ${(m.qualitativeResults||[]).length} qualitativi</summary><div class="table-wrap"><table><thead><tr><th>Parametro</th><th>Valore</th><th>Unità</th><th>Riferimento</th><th>Stato</th></tr></thead><tbody>${m.labValues.map(v=>`<tr><td>${esc(v.parameterName)}</td><td><strong>${HealthCharts.fmt(v.value)}</strong></td><td>${esc(v.unit||'')}</td><td>${esc(HealthReport.visibleReference?.(v)||v.range?.raw||'')}</td><td>${v.status?`<span class="badge ${esc(HealthReport.statusClass?.(v.status)||'non-definito')}">${esc(v.status)}</span>`:''}</td></tr>`).join('')}${(m.qualitativeResults||[]).map(v=>`<tr><td>${esc(v.test)}</td><td><strong>${esc(v.result)}</strong></td><td>${esc(v.unit||'')}</td><td>${esc(v.reference||'')}</td><td></td></tr>`).join('')}</tbody></table></div></details>`:''}
      ${(mode==='narrative'||mode==='mixed'||mode==='diagnosis')?`<details open><summary>${m.complexClinicalContainer?'Contenuto clinico ricostruito':'Referto integrale ricostruito'}</summary><p class="kpi-note">${m.complexClinicalContainer?'Sono esclusi dati amministrativi, recapiti, anagrafica, modulistica e rumore OCR. Il documento originale resta sempre consultabile.':'Il testo clinico ricostruito viene conservato nel dossier. Puoi correggere errori OCR o impaginazione.'}</p><textarea class="form-control ocr-text narrative-review" data-q-field="reconstructedText" data-id="${item.id}">${esc(m.reconstructedText||m.structuredText||m.extractedText||'')}</textarea></details>`:''}
      ${m.extractedTherapies?.length?`<details open><summary>${m.extractedTherapies.length} assunzioni terapeutiche riconosciute</summary><label class="check-row"><input type="checkbox" data-import-extracted="therapies" data-id="${item.id}" ${m.importTherapies?'checked':''}> Compila la sezione Terapie</label><div class="table-wrap"><table><thead><tr><th>Orario</th><th>Farmaco</th><th>Principio attivo</th><th>Dosaggio</th><th>Frequenza / Note</th></tr></thead><tbody>${therapyRows}</tbody></table></div></details>`:''}
      ${m.extractedDiagnoses?.length?`<details open><summary>${m.extractedDiagnoses.length} proposte per diagnosi e problemi principali</summary><label class="check-row"><input type="checkbox" data-import-extracted="diagnoses" data-id="${item.id}" ${m.importDiagnoses?'checked':''}> Compila la sezione Diagnosi e problemi principali dopo la conferma</label><div class="notice warning">Deseleziona le voci non corrette. Il programma non deve trasformare sintomi, negazioni o semplici esami in diagnosi.</div><div class="table-wrap diagnosis-import-wrap"><table class="diagnosis-import-table"><colgroup><col class="diag-import-insert"><col class="diag-import-condition"><col class="diag-import-date"><col class="diag-import-clinical-state"><col class="diag-import-main"><col class="diag-import-notes"></colgroup><thead><tr><th>Inserisci</th><th>Condizione</th><th>Data</th><th>Categoria / Stato</th><th>Principale</th><th>Note</th></tr></thead><tbody>${diagnosisRows}</tbody></table></div></details>`:''}
      ${m.extractedExemptions?.length?`<details open><summary>${m.extractedExemptions.length} esenzioni riconosciute</summary><label class="check-row"><input type="checkbox" data-import-extracted="exemptions" data-id="${item.id}" ${m.importExemptions?'checked':''}> Compila la sezione Esenzioni</label><div class="table-wrap"><table><thead><tr><th>Codice</th><th>Descrizione</th><th>Validità</th><th>Ente</th></tr></thead><tbody>${exemptionRows}</tbody></table></div></details>`:''}
      ${item.ocr?.pages?.length?`<details><summary>Diagnostica OCR</summary><div class="table-wrap"><table><thead><tr><th>Pagina</th><th>Metodo</th><th>Qualità</th></tr></thead><tbody>${item.ocr.pages.map(p=>`<tr><td>${p.pageNumber}</td><td>${esc(p.selectedPass||'')}</td><td>${Math.round(Number(p.quality||0))}%</td></tr>`).join('')}</tbody></table></div></details>`:''}
      ${m.extractedText?`<details><summary>Testo OCR grezzo</summary><textarea class="form-control ocr-text" data-q-field="extractedText" data-id="${item.id}">${esc(m.extractedText)}</textarea></details>`:''}
    </div>`;
  }

  function duplicateComparisonHtml(item,duplicate){
    if(!item.exactDuplicate)return `<div class="duplicate-box"><strong>Possibile documento già presente</strong><p>${esc(existingDocLabel(duplicate))}</p><div class="row-actions"><button type="button" class="btn btn-light btn-small" data-duplicate-choice="keep-old" data-id="${item.id}">Non importare</button><button type="button" class="btn btn-primary btn-small" data-duplicate-choice="keep-both" data-id="${item.id}">Importa comunque</button>${duplicate.id?`<button type="button" class="btn btn-ghost btn-small" data-open-existing="${duplicate.id}">Apri esistente</button>`:''}</div></div>`;
    const old=item.previousAnalysis||duplicate||{},fresh=item.meta||{};const stat=(label,a,b)=>`<div class="version-stat"><small>${esc(label)}</small><strong>${esc(String(a??0))} → ${esc(String(b??0))}</strong></div>`;
    return `<div class="duplicate-box version-box"><strong>Documento identico già presente: nuova interpretazione completata</strong><p>${esc(existingDocLabel(duplicate))}</p><div class="version-diff-grid">${stat('Caratteri del referto',String(old.reconstructedText||old.extractedText||'').length,String(fresh.reconstructedText||fresh.extractedText||'').length)}${stat('Valori numerici',(old.labValues||[]).length,(fresh.labValues||[]).length)}${stat('Risultati qualitativi',(old.qualitativeResults||[]).length,(fresh.qualitativeResults||[]).length)}${stat('Diagnosi proposte',(old.extractedDiagnoses||[]).length,(fresh.extractedDiagnoses||[]).length)}</div><p class="kpi-note">Lettura precedente: ${esc(old.ocrEngine||'motore non registrato')} · Nuova lettura: ${esc(item.ocr?.engine||'motore locale')}. La scelta consigliata conserva lo storico e sostituisce soltanto l’interpretazione.</p><div class="row-actions"><button type="button" class="btn btn-light btn-small" data-duplicate-choice="keep-old" data-id="${item.id}">Mantieni precedente</button><button type="button" class="btn btn-primary btn-small" data-duplicate-choice="update-interpretation" data-id="${item.id}">Aggiorna e conserva storico</button><button type="button" class="btn btn-light btn-small" data-duplicate-choice="update-data" data-id="${item.id}">Aggiorna solo dati estratti</button><button type="button" class="btn btn-ghost btn-small" data-duplicate-choice="keep-both" data-id="${item.id}">Conserva entrambe</button>${duplicate.id?`<button type="button" class="btn btn-ghost btn-small" data-open-existing="${duplicate.id}">Apri esistente</button>`:''}</div></div>`;
  }

  function renderImportQueue() {
    const target=$('#importQueue'); if (!target) return;
    const summary=$('#queueSummary'); if(summary) summary.innerHTML=queueSummaryHtml();
    if (!state.importQueue.length) {
      target.innerHTML='<div class="notice">Seleziona uno o più documenti. L’analisi OCR partirà automaticamente.</div>';
      const archive=$('#archiveQueueBtn'); if(archive){archive.disabled=true;archive.textContent='Attendi analisi';}
      const retry=$('#retryOcrBtn'); if(retry)retry.disabled=true;
      return;
    }
    target.innerHTML=state.importQueue.map(item=>{
      const m=item.meta||{}; const duplicate=item.exactDuplicate||item.probableDuplicate?.doc;
      const profileConflict=m.profileEvidence?.status==='conflict'?m.profileEvidence.best:null;
      const processing=queueIsProcessing(item);
      const summaryBits=[m.clinicalDate?formatDate(m.clinicalDate):'',m.category||'',m.doctor||'',m.facility||''].filter(Boolean);
      return `<article class="import-card ${queueStatusClass(item)} ${processing?'processing':''}" data-queue-id="${item.id}">
        <div class="import-card-head"><label class="check-row"><input type="checkbox" data-queue-include="${item.id}" ${item.include?'checked':''} ${processing?'disabled':''}> <span><strong>${esc(item.file.name)}</strong><small>${formatBytes(item.file.size)}${summaryBits.length?' · '+esc(summaryBits.join(' · ')):''}</small></span></label><div class="row-actions"><span class="badge ${queueStatusClass(item)}">${esc(item.message)}</span>${!processing?`<button type="button" class="btn btn-ghost btn-small" data-toggle-review="${item.id}">${item.reviewOpen?'Nascondi dettagli':'Controlla'}</button>`:''}<button type="button" class="btn btn-danger btn-small" data-queue-remove="${item.id}" ${processing?'disabled':''}>Rimuovi</button></div></div>
        ${processing?`<div class="progress"><span style="width:${item.progress}%"></span></div><p class="kpi-note">Il programma sta analizzando questo documento. I campi verranno mostrati soltanto al termine.</p>`:''}
        ${item.status==='ready'&&!item.reviewOpen?item.bookingParsed?`<div class="ready-summary"><strong>Prenotazione riconosciuta.</strong> ${esc(item.bookingParsed.service)} · ${esc(formatDate(item.bookingParsed.startDate))}${item.bookingParsed.startTime?` · ${esc(item.bookingParsed.startTime)}`:''}${item.bookingParsed.location?` · ${esc(item.bookingParsed.location)}`:''}. Il file originale verrà archiviato e collegato all’Agenda.</div>`:`<div class="ready-summary"><strong>Analisi completata.</strong> ${m.clinicalDate?`Data clinica ${formatDate(m.clinicalDate)}.`:'Data non definita.'} ${['lab','mixed'].includes(m.documentMode)?`${(m.labValues||[]).length} valori numerici e ${(m.qualitativeResults||[]).length} risultati qualitativi ricostruiti.`:m.documentMode==='therapy'?`${(m.extractedTherapies||[]).length} assunzioni terapeutiche riconosciute.`:m.documentMode==='diagnosis'?`${(m.extractedDiagnoses||[]).length} diagnosi riconosciute.`:m.documentMode==='exemption'?`${(m.extractedExemptions||[]).length} esenzioni riconosciute.`:(m.complexClinicalContainer?'Contenuto clinico ricostruito e ripulito.':'Referto integrale ricostruito.')}</div>`:''}
        ${item.status==='error'?`<div class="notice warning"><strong>Analisi OCR non completata.</strong> ${esc(item.error||'')}<div class="row-actions"><button type="button" class="btn btn-primary btn-small" data-error-choice="archive" data-id="${item.id}">Archivia comunque</button><button type="button" class="btn btn-light btn-small" data-error-choice="retry" data-id="${item.id}">Riprova OCR</button></div></div>`:''}
        ${duplicate?duplicateComparisonHtml(item,duplicate):''}
        ${item.status==='page-overlap'?`<div class="duplicate-box"><strong>Corrispondenze rilevate pagina per pagina</strong><p>${(item.pageRelationships||[]).slice(0,8).map(r=>`${esc(item.file.name)}: ${r.matches.length} pagina/e corrispondenti con ${esc(r.label)} · ${r.relation==='source-contained'?'questo file è già contenuto nell’altro documento':r.relation==='target-contained'?'questo file contiene l’altro documento':r.relation==='same'?'stesso contenuto':'sovrapposizione parziale'} · ${Math.round(r.average*100)}%`).join('<br>')}</p><div class="row-actions"><button type="button" class="btn btn-light btn-small" data-page-choice="skip" data-id="${item.id}">Non importare questo file</button><button type="button" class="btn btn-primary btn-small" data-page-choice="prefer-current" data-id="${item.id}">Conserva questo documento</button><button type="button" class="btn btn-ghost btn-small" data-page-choice="keep-all" data-id="${item.id}">Conserva tutti</button></div><small>Se il documento corrente è un PDF completo, “Conserva questo documento” esclude dalla stessa coda le immagini già comprese nel PDF. I documenti già archiviati non vengono cancellati automaticamente.</small></div>`:''}
        ${profileConflict?`<div class="notice warning"><strong>Possibile profilo errato.</strong> OCR: ${esc(profileConflict.name)}. Profilo selezionato: ${esc(activeProfile().firstName+' '+activeProfile().lastName)}.<div class="row-actions"><button type="button" class="btn btn-light btn-small" data-profile-confirm="${item.id}">Conferma il profilo selezionato</button></div></div>`:''}
        ${item.status==='pending-date'?`<div class="notice warning"><strong>Data clinica non rilevata.</strong> Inseriscila, scegli una delle date proposte oppure archivia esplicitamente il documento senza data.<div class="row-actions"><button type="button" class="btn btn-light btn-small" data-no-date="${item.id}">Archivia senza data</button></div></div>`:''}
        ${item.reviewOpen&&!processing?renderOptionalReview(item):''}
      </article>`;
    }).join('');

    $$('[data-queue-remove]',target).forEach(b=>b.onclick=()=>{state.importQueue=state.importQueue.filter(x=>x.id!==b.dataset.queueRemove);renderImportQueue();});
    $$('[data-queue-include]',target).forEach(c=>c.onchange=()=>{const i=state.importQueue.find(x=>x.id===c.dataset.queueInclude);if(i)i.include=c.checked;renderImportQueue();});
    $$('[data-toggle-review]',target).forEach(b=>b.onclick=()=>{const i=state.importQueue.find(x=>x.id===b.dataset.toggleReview);if(i)i.reviewOpen=!i.reviewOpen;renderImportQueue();});
    $$('[data-q-field]',target).forEach(el=>{const apply=()=>{const i=state.importQueue.find(x=>x.id===el.dataset.id);if(!i)return;const field=el.dataset.qField;i.meta[field]=el.value;if(field==='extractedText')i.meta.textFingerprint=HealthExtractors.textFingerprint(el.value);if(['title','documentMode','documentKind','specialization'].includes(field)){i.meta.manualIdentityOverride=true;i.meta.manualIdentity={...(i.meta.manualIdentity||{}),title:i.meta.title||'',documentMode:i.meta.documentMode||'',documentKind:i.meta.documentKind||'',category:i.meta.category||'',specialization:i.meta.specialization||''};}if(field==='reconstructedText'){i.meta.manualNarrativeOverride=true;}};el.oninput=apply;el.onchange=apply;});
    $$('[data-therapy-field]',target).forEach(el=>el.oninput=()=>{const i=state.importQueue.find(x=>x.id===el.dataset.id);const row=i?.meta?.extractedTherapies?.[Number(el.dataset.rowIndex)];if(row)row[el.dataset.therapyField]=el.value;});
    $$('[data-diagnosis-field]',target).forEach(el=>{const apply=()=>{const i=state.importQueue.find(x=>x.id===el.dataset.id);const row=i?.meta?.extractedDiagnoses?.[Number(el.dataset.rowIndex)];if(!row)return;const field=el.dataset.diagnosisField;row[field]=el.type==='checkbox'?el.checked:el.value;};el.oninput=apply;el.onchange=apply;});
    $$('[data-exemption-field]',target).forEach(el=>el.oninput=()=>{const i=state.importQueue.find(x=>x.id===el.dataset.id);const row=i?.meta?.extractedExemptions?.[Number(el.dataset.rowIndex)];if(row)row[el.dataset.exemptionField]=el.value;});
    $$('[data-q-date]',target).forEach(el=>el.onchange=()=>{const i=state.importQueue.find(x=>x.id===el.dataset.id);if(!i)return;const field=el.dataset.qDate;const value=el.value;if(value&&!isValidClinicalDate(value)){i.dateError='Data non valida. Inserisci una data compresa tra il 01/01/1900 e oggi.';if(field==='clinicalDate'){i.meta.clinicalDate='';i.status='pending-date';i.reviewOpen=true;}renderImportQueue();return;}i.dateError='';i.meta[field]=value;if(field==='clinicalDate'){i.allowNoDate=false;i.status=statusAfterResolved(i);i.message=i.status==='ready'?`Pronto · ${(i.meta.labValues||[]).length} valori clinici rilevati`:'Decisione ancora richiesta';i.reviewOpen=i.status!=='ready';}renderImportQueue();});
    $$('[data-import-extracted]',target).forEach(el=>el.onchange=()=>{const i=state.importQueue.find(x=>x.id===el.dataset.id);if(!i)return;if(el.dataset.importExtracted==='therapies')i.meta.importTherapies=el.checked;else if(el.dataset.importExtracted==='diagnoses')i.meta.importDiagnoses=el.checked;else i.meta.importExemptions=el.checked;});
    $$('[data-duplicate-choice]',target).forEach(b=>b.onclick=()=>{const i=state.importQueue.find(x=>x.id===b.dataset.id);if(!i)return;const choice=b.dataset.duplicateChoice;i.duplicateDecision=choice;if(choice==='keep-old'){i.include=false;i.status='excluded';i.message='Versione precedente conservata';i.reviewOpen=false;}else{i.include=true;i.status=statusAfterResolved(i);i.message=i.status==='ready'?(choice==='update-interpretation'?'Pronto: interpretazione aggiornata con storico':choice==='update-data'?'Pronto: dati estratti aggiornati':'Pronto: entrambe le versioni saranno conservate'):'Decisione ancora richiesta';i.reviewOpen=i.status!=='ready';}renderImportQueue();});
    $$('[data-page-choice]',target).forEach(b=>b.onclick=()=>{const i=state.importQueue.find(x=>x.id===b.dataset.id);if(!i)return;const choice=b.dataset.pageChoice;i.pageDecision=choice;if(choice==='skip'){i.include=false;i.status='excluded';i.message='Escluso perché già contenuto in un altro documento';i.reviewOpen=false;}else{if(choice==='prefer-current'){for(const r of i.pageRelationships||[]){if(r.kind==='queue'&&['target-contained','same'].includes(r.relation)){r.ref.include=false;r.ref.status='excluded';r.ref.message=`Escluso: contenuto in ${i.file.name}`;r.ref.reviewOpen=false;}}}i.include=true;i.status=statusAfterResolved(i);i.message=i.status==='ready'?`Pronto · ${(i.meta.labValues||[]).length} valori clinici rilevati`:'Decisione ancora richiesta';i.reviewOpen=i.status!=='ready';}renderImportQueue();});
    $$('[data-profile-confirm]',target).forEach(b=>b.onclick=()=>{const i=state.importQueue.find(x=>x.id===b.dataset.profileConfirm);if(!i)return;i.profileDecision='confirmed';i.status=statusAfterResolved(i);i.message=i.status==='ready'?`Pronto · ${(i.meta.labValues||[]).length} valori clinici rilevati`:'Chiarimento richiesto: data clinica non rilevata';i.reviewOpen=i.status!=='ready';renderImportQueue();});
    $$('[data-use-date]',target).forEach(b=>b.onclick=()=>{const i=state.importQueue.find(x=>x.id===b.dataset.id);if(!i)return;if(!isValidClinicalDate(b.dataset.useDate)){i.dateError='La data proposta non è valida.';renderImportQueue();return;}i.meta.clinicalDate=b.dataset.useDate;i.dateError='';i.allowNoDate=false;i.status=statusAfterResolved(i);i.message=i.status==='ready'?`Pronto · ${(i.meta.labValues||[]).length} valori clinici rilevati`:'Decisione ancora richiesta';i.reviewOpen=i.status!=='ready';renderImportQueue();});
    $$('[data-no-date]',target).forEach(b=>b.onclick=()=>{const i=state.importQueue.find(x=>x.id===b.dataset.noDate);if(!i)return;i.allowNoDate=true;i.status='ready';i.message=`Pronto senza data · ${(i.meta.labValues||[]).length} valori clinici rilevati`;i.reviewOpen=false;renderImportQueue();});
    $$('[data-error-choice]',target).forEach(b=>b.onclick=async()=>{const i=state.importQueue.find(x=>x.id===b.dataset.id);if(!i)return;if(b.dataset.errorChoice==='retry'){i.status='error';await processImportQueue(true);}else{i.errorDecision='archive';i.status='pending-date';i.message='OCR ignorato: scegli la data o archivia senza data';i.reviewOpen=true;renderImportQueue();}});
    $$('[data-open-existing]',target).forEach(b=>b.onclick=()=>viewDocument(b.dataset.openExisting));

    const processing=state.importQueue.some(i=>i.include&&queueIsProcessing(i));
    const decisions=state.importQueue.filter(queueNeedsDecision).length;
    const ready=state.importQueue.filter(i=>i.include&&i.status==='ready').length;
    const archive=$('#archiveQueueBtn');
    if (archive) {
      archive.disabled=processing||decisions>0||ready===0;
      archive.textContent=processing?'Attendi analisi':decisions?`Risolvi ${decisions} richiesta/e`:`Archivia ${ready} documento/i`;
    }
    const retry=$('#retryOcrBtn'); if(retry) retry.disabled=!state.importQueue.some(i=>i.status==='error');
  }

  function interpretationSnapshot(doc={}){
    const keys=['complexClinicalContainer','clinicalDate','issueDate','dateStatus','title','category','documentMode','documentKind','specialization','department','facility','doctor','doctorQualification','extractedText','structuredText','reconstructedText','documentContext','ocrIntegralText','reportSections','ecgParameters','labRepairVersion','labPanelVersion','clinicalValidationVersion','technicalReviewRows','narrativeRepairVersion','labReferenceRepairVersion','pdfFields','notes','labValues','qualitativeResults','tableRows','extractionStats','medicalPersonnel','identifiers','extractedTherapies','extractedDiagnoses','extractedExemptions','dateCandidates','profileEvidence','textFingerprint','pageFingerprints','ocrPageData','ocrStatus','ocrEngine','ocrLanguage','ocrProcessedPages','ocrQuality','clinicalCanonicalVersion','clinicalParserVersion','clinicalCanonicalRereadVersion','clinicalCanonicalRereadStatus','clinicalCanonicalRereadStartedAt','clinicalCanonicalRereadAt','clinicalCanonicalRereadError','clinicalCanonicalLastProcessedAt','lastAnalysisAt','pdfExportMode','pdfExportOverride','manualIdentityOverride','manualIdentity','manualNarrativeOverride','documentTypeSource','documentTypeConfidence','bookingService','bookingStartDate','bookingStartTime','bookingLocation','bookingFacility','bookingReferences','bookingDetectedAt','bookingDetectedVersion','reanalysisPolicyVersion','needsCompletion','updatedAt'];const out={};for(const k of keys)out[k]=doc[k];return out;
  }
  async function saveDocumentVersion(doc,reason='Aggiornamento interpretazione',options={}){
    if(!doc?.id)return null;const existing=state.documentVersions.filter(v=>v.documentId===doc.id);const row={id:uid('docver'),profileId:doc.profileId,documentId:doc.id,versionNumber:existing.length+1,reason,engine:doc.ocrEngine||'',appVersion:'5.0.0',createdAt:new Date().toISOString(),snapshot:interpretationSnapshot(doc)};await DossierDB.put('documentVersions',row,{...options});state.documentVersions.unshift(row);return row;
  }

  function protectManualDocumentInterpretation(previous={},candidate={}){
    const out={...candidate};
    if(previous.manualIdentityOverride&&previous.manualIdentity){
      const manual=previous.manualIdentity||{};
      const manualBooking=/prenotaz|promemoria di prenotazione/.test(normalizedWords(`${manual.documentKind||previous.documentKind||''} ${manual.category||previous.category||''}`));
      const manualTitle=String(manual.title||previous.title||'').trim();
      const normalizeStaleBookingTitle=manualBooking&&documentLooksLikeBookingInterpretation(candidate)&&/^(?:prestazione|esame)\s*[·\-:]/i.test(manualTitle);
      out.title=normalizeStaleBookingTitle?(candidate.title||manualTitle||previous.title||out.title):(manualTitle||previous.title||out.title);
      out.documentMode=manual.documentMode||previous.documentMode||out.documentMode;
      out.documentKind=manual.documentKind||previous.documentKind||out.documentKind;
      out.category=manual.category||previous.category||out.category;
      out.specialization=manual.specialization||previous.specialization||out.specialization;
      out.department=manual.specialization||previous.department||out.department;
      out.manualIdentityOverride=true;out.manualIdentity=normalizeStaleBookingTitle?{...previous.manualIdentity,title:out.title}:previous.manualIdentity;
      out.documentTypeSource=previous.documentTypeSource||'correzione manuale';out.documentTypeConfidence=100;
    }
    if(previous.manualNarrativeOverride){
      out.reconstructedText=previous.reconstructedText||'';out.reportSections=previous.reportSections||[];out.pdfFields=previous.pdfFields||[];out.manualNarrativeOverride=true;
    }
    return out;
  }
  function documentInterpretationTextLength(doc={}){
    return String(doc.ocrIntegralText||doc.extractedText||doc.structuredText||doc.reconstructedText||'').replace(/\s+/g,' ').trim().length;
  }
  function documentLooksLikeBookingInterpretation(doc={}){
    const n=normalizedWords(`${doc.documentContext||''} ${doc.documentKind||''} ${doc.category||''} ${doc.title||''}`);
    return n.includes('prenotaz')||n.includes('promemoria di prenotazione')||Boolean(doc.bookingStartDate&&doc.bookingStartTime);
  }
  function documentReanalysisRegressionReasons(previous={},candidate={}){
    const reasons=[];
    const critical=[['title','titolo'],['category','tipologia'],['documentKind','tipo documento'],['specialization','specializzazione'],['facility','struttura']];
    for(const [key,label] of critical)if(String(previous[key]||'').trim()&&!String(candidate[key]||'').trim())reasons.push(`${label} perso`);
    const oldLen=documentInterpretationTextLength(previous),newLen=documentInterpretationTextLength(candidate);
    if(oldLen>=250&&newLen<Math.max(120,Math.floor(oldLen*.68)))reasons.push('testo OCR molto ridotto');
    if(documentLooksLikeBookingInterpretation(previous)){
      if(!documentLooksLikeBookingInterpretation(candidate))reasons.push('riconoscimento prenotazione perso');
      for(const [key,label] of [['bookingStartDate','data appuntamento'],['bookingStartTime','ora appuntamento'],['bookingLocation','luogo appuntamento']])if(String(previous[key]||'').trim()&&!String(candidate[key]||'').trim())reasons.push(`${label} perso`);
    }
    const oldLabs=Array.isArray(previous.labValues)?previous.labValues.length:0,newLabs=Array.isArray(candidate.labValues)?candidate.labValues.length:0;
    if(oldLabs>=4&&newLabs<Math.floor(oldLabs*.6))reasons.push('troppi valori di laboratorio persi');
    const oldSections=Array.isArray(previous.reportSections)?previous.reportSections.length:0,newSections=Array.isArray(candidate.reportSections)?candidate.reportSections.length:0;
    if(oldSections>=2&&newSections===0&&String(previous.reconstructedText||'').trim().length>300)reasons.push('referto ricostruito perso');
    return [...new Set(reasons)];
  }
  async function saveDocumentCandidateVersion(current={},candidate={},reason='Nuova interpretazione non applicata'){
    if(!current?.id)return null;const existing=state.documentVersions.filter(v=>v.documentId===current.id);const row={id:uid('docver'),profileId:current.profileId,documentId:current.id,versionNumber:existing.length+1,reason,engine:candidate.ocrEngine||'',appVersion:'5.0.0',candidateOnly:true,createdAt:new Date().toISOString(),snapshot:interpretationSnapshot(candidate)};await DossierDB.put('documentVersions',row);state.documentVersions.unshift(row);return row;
  }
  function safeReanalysisDecision(previous={},candidate={}){
    const protectedCandidate=protectManualDocumentInterpretation(previous,{...candidate,reanalysisPolicyVersion:DOCUMENT_REANALYSIS_POLICY_VERSION});
    const reasons=documentReanalysisRegressionReasons(previous,protectedCandidate);
    return{apply:reasons.length===0,candidate:protectedCandidate,reasons};
  }

  async function archiveImportQueue() {
    const included=state.importQueue.filter(i=>i.include);
    if(!included.length){toast('Nessun documento selezionato');return;}
    if(included.some(queueIsProcessing)){toast('Attendi il completamento dell’analisi');return;}
    if(included.some(queueNeedsDecision)){toast('Completa le verifiche evidenziate');return;}
    const addedAt=new Date().toISOString();let saved=0,therapyCount=0,diagnosisCount=0,exemptionCount=0;const replacedSections=new Set(),associationSuggestions=[];
    for(const item of included.filter(i=>i.status==='ready')){
      const m=item.meta||{};if(m.clinicalDate&&!isValidClinicalDate(m.clinicalDate)){toast(`Data non valida nel file ${item.file.name}`);return;}
      const existingDuplicate=item.exactDuplicate?.id?await DossierDB.get('documents',item.exactDuplicate.id):null;const updateExisting=Boolean(existingDuplicate&&['update-interpretation','update-data'].includes(item.duplicateDecision));if(updateExisting)await saveDocumentVersion(existingDuplicate,item.duplicateDecision==='update-data'?'Aggiornamento dei dati estratti':'Nuova interpretazione del documento');const previous=item.repairExisting||(updateExisting?existingDuplicate:{});const dataOnly=item.duplicateDecision==='update-data';const target=m.targetSection||state.importOptions.targetSection||'';const mergePolicy=m.sectionMergePolicy||'keep';
      if(mergePolicy==='replace'&&target&&!replacedSections.has(target)){
        const store=target==='therapies'?'therapies':target==='diagnoses'?'diagnoses':target==='exemptions'?'exemptions':'';
        const stateKey=target==='therapies'?'therapies':target==='diagnoses'?'diagnoses':target==='exemptions'?'exemptions':'';
        if(store&&stateKey){for(const row of state[stateKey])await DossierDB.del(store,row.id);state[stateKey]=[];replacedSections.add(target);}
      }
      let doc={...previous,id:previous.id||uid('doc'),profileId:state.activeProfileId,originalName:updateExisting?(previous.originalName||item.file.name):item.file.name,mimeType:updateExisting?(previous.mimeType||item.file.type||'application/octet-stream'):(item.file.type||'application/octet-stream'),size:updateExisting?(previous.size||item.file.size):item.file.size,fileBlob:updateExisting?(previous.fileBlob||item.file):item.file,hash:item.hash||await fileHash(item.file),
        clinicalDate:dataOnly?(previous.clinicalDate||''):(m.clinicalDate||''),issueDate:dataOnly?(previous.issueDate||''):(isValidClinicalDate(m.issueDate||'')?m.issueDate:''),dateStatus:dataOnly?(previous.dateStatus||'confirmed'):(m.clinicalDate?'confirmed':'missing'),title:dataOnly?(previous.title||item.file.name.replace(/\.[^.]+$/,'')):(m.title||item.file.name.replace(/\.[^.]+$/,'')),category:dataOnly?(previous.category||''):(m.category||''),documentMode:dataOnly?(previous.documentMode||''):(m.documentMode||''),documentKind:dataOnly?(previous.documentKind||previous.category||''):(m.documentKind||m.category||''),specialization:dataOnly?(previous.specialization||previous.department||''):(m.specialization||m.department||''),department:dataOnly?(previous.department||previous.specialization||''):(m.department||m.specialization||''),facility:dataOnly?(previous.facility||''):(m.facility||''),doctor:dataOnly?(previous.doctor||''):(m.doctor||''),doctorQualification:dataOnly?(previous.doctorQualification||''):(m.doctorQualification||''),documentNumber:dataOnly?(previous.documentNumber||''):(m.documentNumber||''),
        extractedText:m.extractedText||'',structuredText:m.structuredText||m.extractedText||'',reconstructedText:m.reconstructedText||'',documentContext:m.documentContext||'',ocrIntegralText:m.ocrIntegralText||m.extractedText||'',reportSections:m.reportSections||[],ecgParameters:m.ecgParameters||[],notes:m.notes||previous.notes||'',labValues:m.labValues||[],qualitativeResults:m.qualitativeResults||[],tableRows:m.tableRows||[],extractionStats:m.extractionStats||null,medicalPersonnel:m.medicalPersonnel||[],identifiers:m.identifiers||[],extractedTherapies:m.extractedTherapies||[],extractedDiagnoses:m.extractedDiagnoses||[],extractedExemptions:m.extractedExemptions||[],
        dateCandidates:m.dateCandidates||[],profileEvidence:m.profileEvidence||null,textFingerprint:m.textFingerprint||HealthExtractors.textFingerprint(m.extractedText||''),pageFingerprints:m.pageFingerprints||HealthExtractors.buildPageFingerprints(item.ocr?.pages||[],m.extractedText||'',m.clinicalDate||''),ocrPageData:(item.ocr?.pages||[]).map(p=>({pageNumber:p.pageNumber,text:p.text||'',visualHash:p.visualHash||'',lines:p.lines||[],selectedPass:p.selectedPass||'',quality:Number(p.quality||0),passes:p.passes||[],width:p.width||0,height:p.height||0})),
        ocrStatus:item.errorDecision==='archive'?'failed':m.extractedText?'completed':'not_run',ocrEngine:item.ocr?.engine||'',ocrLanguage:item.ocr?.language||'',ocrProcessedPages:item.ocr?.processedPages||0,ocrQuality:item.ocr?.quality||0,lastAnalysisAt:item.errorDecision==='archive'?(previous.lastAnalysisAt||previous.addedAt||''):addedAt,needsCompletion:item.bookingParsed?false:!m.clinicalDate,duplicateForced:item.duplicateDecision==='keep-both'||item.pageDecision==='keep-all',duplicateOf:(item.exactDuplicate||item.probableDuplicate?.doc)?.id||'',pageDecision:item.pageDecision||'',profileConfirmed:item.profileDecision==='confirmed',sourceSection:target,timelineVisible:!['therapies','diagnoses','exemptions'].includes(target),manualIdentityOverride:!!m.manualIdentityOverride,manualIdentity:m.manualIdentity||null,manualNarrativeOverride:!!m.manualNarrativeOverride,addedAt:previous.addedAt||addedAt,updatedAt:addedAt};
      if(!updateExisting&&!previous.id){doc.pdfExportOverride=false;doc.pdfExportMode=defaultPdfExportMode(doc);}
      if(['lab','mixed'].includes(doc.documentMode)||doc.category==='Esami di laboratorio'){
        const validated=HealthExtractors.repairLabDocumentData(doc);
        if(!validated.validation?.ok){item.status='error';item.message=`Importazione bloccata dal controllo clinico: ${(validated.validation?.violations||[])[0]||'dati non sicuri'}`;renderImportQueue();continue;}
        doc=validated.document;const referenceSet=state.documents.filter(x=>x.id!==doc.id).map(x=>typeof structuredClone==='function'?structuredClone(x):JSON.parse(JSON.stringify(x)));referenceSet.push(doc);applyReferenceSourcesToDocuments(referenceSet,activeProfile()||{}, {targetIds:new Set([doc.id])});doc=referenceSet[referenceSet.length-1];doc.clinicalValidationVersion=CLINICAL_VALIDATION_VERSION;doc.labReferenceRepairVersion=CLINICAL_VALIDATION_VERSION;
      }
      if(['narrative','mixed','diagnosis'].includes(doc.documentMode)||Array.isArray(doc.reportSections)&&doc.reportSections.length){doc=HealthExtractors.repairNarrativeDocumentData(doc).document;}
      if(doc.ocrStatus==='completed'){
        doc.clinicalParserVersion=CLINICAL_PARSER_VERSION;doc.clinicalCanonicalLastProcessedAt=doc.lastAnalysisAt||addedAt;
        if(isComplexClinicalDoc(doc)){
          doc.clinicalParserRereadTargetVersion=CLINICAL_PARSER_VERSION;doc.clinicalCanonicalRereadVersion=V602_CANONICAL_VERSION;doc.clinicalCanonicalRereadStatus='completed';doc.clinicalCanonicalRereadError='';doc.clinicalCanonicalRereadAt=doc.lastAnalysisAt||addedAt;
        }
      }
      const bookingNormalized=calendarNormalizeImportedBookingDocument(doc);doc=bookingNormalized.doc;
      if(item.bookingParsed&&bookingNormalized.parsed){doc={...doc,bookingService:item.bookingParsed.service||bookingNormalized.parsed.service||'',bookingStartDate:item.bookingParsed.startDate||bookingNormalized.parsed.startDate||'',bookingStartTime:item.bookingParsed.startTime||bookingNormalized.parsed.startTime||'',bookingLocation:item.bookingParsed.location||bookingNormalized.parsed.location||'',bookingFacility:item.bookingParsed.facility||bookingNormalized.parsed.facility||'',bookingReferences:item.bookingParsed.references||bookingNormalized.parsed.references||[]};}
      await DossierDB.put('documents',doc);
      if(!updateExisting&&bookingNormalized.parsed)await calendarEnsureEventForImportedBooking(doc,bookingNormalized.parsed);
      if(!updateExisting&&/^image\//i.test(String(doc.mimeType||''))){try{const pool=(await DossierDB.byProfile('documents',doc.profileId)).filter(x=>String(x.id)!==String(doc.id));const candidate=compatibleExamCandidates(doc,pool)[0];if(candidate)associationSuggestions.push({docId:doc.id,candidateId:candidate.id});}catch(_){}}
        if(!String(activeProfile()?.bloodGroup||'').trim())setTimeout(()=>{void detectAndSaveBloodGroup22(activeProfile()||{},[...state.documents,doc],{automatic:true}).catch(()=>{});},0);
      if(m.importTherapies){for(const t of m.extractedTherapies||[]){if(!t.medication)continue;const exactKey=HealthExtractors.normalizeText(`${t.time||t.schedule||''}|${t.medication}|${t.dosage||''}|${t.frequency||t.notes||''}`);const matchKey=HealthExtractors.normalizeText(`${t.time||t.schedule||''}|${t.medication}`);const exact=state.therapies.find(x=>HealthExtractors.normalizeText(`${x.time||x.schedule||''}|${x.medication}|${x.dosage||''}|${x.frequency||x.notes||''}`)===exactKey);if(exact)continue;const match=mergePolicy==='update'?state.therapies.find(x=>HealthExtractors.normalizeText(`${x.time||x.schedule||''}|${x.medication}`)===matchKey):null;const enriched=globalThis.DossierMedicines?await DossierMedicines.enrich(t):t;const row={...(match||{}),...enriched,id:match?.id||uid('therapy'),profileId:state.activeProfileId,sourceDocumentId:doc.id,validFrom:t.validFrom||m.clinicalDate||'',createdAt:match?.createdAt||addedAt,updatedAt:addedAt};await DossierDB.put('therapies',row);if(match)state.therapies[state.therapies.findIndex(x=>x.id===match.id)]=row;else state.therapies.push(row);therapyCount++;}}
      if(m.importDiagnoses){for(const d of m.extractedDiagnoses||[]){if(d.selected===false||!d.name)continue;const proposal=normalizedDiagnosis({...d,date:d.date||m.clinicalDate||'',facility:d.facility||m.facility||'',specialization:d.specialization||m.specialization||'',sourceDocumentId:doc.id,sourceTitle:doc.title||doc.originalName||'',profileId:state.activeProfileId});if(!proposal)continue;const match=findEquivalentDiagnosis(proposal);if(match){await linkDiagnosisUpdate(match,proposal);const idx=state.diagnoses.findIndex(x=>x.id===match.id);if(idx>=0)state.diagnoses[idx]=await DossierDB.get('diagnoses',match.id);diagnosisCount++;continue;}const row={...proposal,id:uid('diagnosis'),profileId:state.activeProfileId,createdAt:addedAt,updatedAt:addedAt};await DossierDB.put('diagnoses',row);state.diagnoses.push(row);diagnosisCount++;}}
      if(m.importExemptions){for(const x of m.extractedExemptions||[]){if(!x.code&&!x.description)continue;const exactKey=HealthExtractors.normalizeText(`${x.code}|${x.description}`);const matchKey=HealthExtractors.normalizeText(x.code||x.description);const exact=state.exemptions.find(e=>HealthExtractors.normalizeText(`${e.code}|${e.description}`)===exactKey);if(exact)continue;const match=mergePolicy==='update'?state.exemptions.find(e=>HealthExtractors.normalizeText(e.code||e.description)===matchKey):null;const row={...(match||{}),...x,validFrom:x.validFrom||m.clinicalDate||'',issuer:x.issuer||m.facility||'',id:match?.id||uid('exemption'),profileId:state.activeProfileId,sourceDocumentId:doc.id,createdAt:match?.createdAt||addedAt,updatedAt:addedAt};await DossierDB.put('exemptions',row);if(match)state.exemptions[state.exemptions.findIndex(e=>e.id===match.id)]=row;else state.exemptions.push(row);exemptionCount++;}}
      if(state.archiveHandle)await syncDocumentToFolder(doc).catch(()=>{});saved++;
    }
    closeModal();await loadProfileData();renderView();const extras=[therapyCount?`${therapyCount} terapie`:'',diagnosisCount?`${diagnosisCount} diagnosi`:'',exemptionCount?`${exemptionCount} esenzioni`:''].filter(Boolean).join(', ');toast(`${saved} file elaborati${extras?` · ${extras}`:''}`);if(associationSuggestions.length)setTimeout(()=>openImportAssociationSuggestion(associationSuggestions[0].docId,associationSuggestions[0].candidateId),120);
  }

  function documentNeedsRecognitionRepair(doc) {
    if (!doc || doc.ocrStatus==='repair_failed') return false;
    const text=String(doc.extractedText||doc.structuredText||'').trim();
    const structured=(doc.labValues||[]).length+(doc.qualitativeResults||[]).length+(doc.identifiers||[]).length+(doc.medicalPersonnel||[]).length;
    return Boolean(doc.fileBlob) && (doc.ocrStatus==='failed' || doc.ocrStatus==='not_run' || (text.length<40 && structured===0));
  }

  function openDocumentEditModal(doc) {
    if(!doc)return;if(documentNeedsRecognitionRepair(doc)){reanalyzeDocument(doc,{skipConfirm:true,automatic:true});return;}
    const complexDoc=isComplexClinicalDoc(doc);
    const mode=complexDoc?'narrative':(doc.documentMode||((doc.category==='Esami di laboratorio')?'lab':'narrative'));
    const valueRow=(v={})=>`<tr data-lab-row><td><input class="form-control" data-lab="parameterName" value="${esc(v.parameterName||'')}"></td><td><input type="number" step="any" class="form-control" data-lab="value" value="${Number.isFinite(Number(v.value))?Number(v.value):''}"></td><td><input class="form-control" data-lab="unit" value="${esc(v.unit||'')}"></td><td><input class="form-control" data-lab="range" value="${esc(v.range?.raw||'')}">${v.statusSource&&v.statusSource!=='report'?`<small>${esc(v.statusSource==='historical_same_facility'?'storico':'esterno')}</small>`:''}</td><td><select class="form-control" data-lab="status">${['da verificare','nei limiti','alto','basso','insufficiente','critico'].map(x=>`<option ${v.status===x?'selected':''}>${x}</option>`).join('')}</select></td><td><button type="button" class="btn btn-danger btn-small" data-remove-lab>×</button></td></tr>`;
    const qualitativeRow=(v={})=>`<tr data-qual-row><td><input class="form-control" data-qual="test" value="${esc(v.test||'')}"></td><td><input class="form-control" data-qual="result" value="${esc(v.result||'')}"></td><td><input class="form-control" data-qual="unit" value="${esc(v.unit||'')}"></td><td><input class="form-control" data-qual="reference" value="${esc(v.reference||'')}"></td><td><button type="button" class="btn btn-danger btn-small" data-remove-qual>×</button></td></tr>`;
    const labBlock=(mode==='lab'||mode==='mixed'||complexDoc)?`<div class="form-group full"><div class="card-title-row"><label>Tabella degli esami</label><button type="button" class="btn btn-light btn-small" id="addLabValueBtn">Aggiungi valore</button></div><div class="table-wrap"><table><thead><tr><th>Parametro</th><th>Valore</th><th>Unità</th><th>Riferimento</th><th>Stato</th><th></th></tr></thead><tbody id="labEditRows">${(doc.labValues||[]).map(valueRow).join('')}</tbody></table></div></div><div class="form-group full"><div class="card-title-row"><label>Risultati qualitativi</label><button type="button" class="btn btn-light btn-small" id="addQualValueBtn">Aggiungi risultato</button></div><div class="table-wrap"><table><thead><tr><th>Esame</th><th>Risultato</th><th>Unità</th><th>Riferimento</th><th></th></tr></thead><tbody id="qualEditRows">${(doc.qualitativeResults||[]).map(qualitativeRow).join('')}</tbody></table></div></div>`:'';
    const pdfFieldRow=(field={})=>`<div class="pdf-field-row" data-pdf-field-row><label class="pdf-field-toggle"><input type="checkbox" data-pdf-field="include" ${field.include===false?'':'checked'}><span>Nel PDF</span></label><input class="form-control" data-pdf-field="label" value="${esc(field.label||'')}" placeholder="Etichetta"><textarea class="form-control" data-pdf-field="value" placeholder="Contenuto">${esc(field.value||'')}</textarea><button type="button" class="btn btn-danger btn-small" data-remove-pdf-field>×</button></div>`;
    const initialPdfFields=Array.isArray(doc.pdfFields)?doc.pdfFields:(HealthReport.narrativeRows?.(doc)||[]).map(([label,value])=>({label,value,include:true}));
    const pdfFieldsBlock=(mode==='narrative'||mode==='mixed'||mode==='diagnosis')?`<div class="form-group full"><div class="card-title-row"><div><label>Campi inclusi nel PDF</label><small>Puoi nascondere, rinominare, correggere o aggiungere campi senza alterare il file originale.</small></div><button type="button" class="btn btn-light btn-small" id="addPdfFieldBtn">Aggiungi campo</button></div><div id="pdfFieldRows" class="pdf-field-editor">${initialPdfFields.map(pdfFieldRow).join('')}</div></div>`:'';
    const narrativeLabel=complexDoc?'Contenuto clinico ricostruito':'Referto integrale ricostruito';
    const narrativeNote=complexDoc?'Sono esclusi dati amministrativi, recapiti, anagrafica, modulistica e rumore OCR. Il documento originale resta sempre consultabile.':'Il testo originale ricostruito resta disponibile. La tabella sopra stabilisce cosa viene mostrato nel PDF.';
    const complexReadStatus=complexDoc?(()=>{const status=doc.clinicalCanonicalRereadStatus||((doc.clinicalCanonicalRereadVersion===V602_CANONICAL_VERSION)?'completed':'pending');const label=status==='completed'?'Rilettura completata':status==='in_progress'?'Rilettura in corso':status==='failed'?'Rilettura da riprovare':'Da rileggere';const when=doc.clinicalCanonicalRereadAt||doc.lastAnalysisAt||doc.clinicalCanonicalLastProcessedAt||'';const detail=when?` · ultima elaborazione ${formatDateTime(when)}`:'';const err=status==='failed'&&doc.clinicalCanonicalRereadError?`<br><small>${esc(doc.clinicalCanonicalRereadError)}</small>`:'';return `<div class="form-group full"><div class="notice ${status==='completed'?'success':status==='failed'?'warning':''}"><strong>${label}</strong>${detail}<br><small>Parser clinico: ${esc(storedClinicalParserVersion(doc)||CLINICAL_PARSER_VERSION)} · canone ${esc(doc.clinicalCanonicalRereadVersion||doc.clinicalCanonicalVersion||V602_CANONICAL_VERSION)} · build FIX23</small>${err}</div></div>`;})():'';
    const narrativeBlock=(mode==='narrative'||mode==='mixed'||mode==='diagnosis')?`<div class="form-group full"><label>${narrativeLabel}</label><textarea name="reconstructedText" class="form-control narrative-editor">${esc(doc.reconstructedText||doc.structuredText||doc.extractedText||'')}</textarea><small>${narrativeNote}</small></div>`:'';
    openModal('Modifica documento','La scheda cambia in base alla tipologia: tabella per i laboratori, referto integrale per le visite.',`<form id="docEditForm" class="form-grid">
      <div class="form-group full"><div class="notice success"><strong>${esc(doc.documentKind||doc.category||'Documento sanitario')}</strong> · ${esc(mode)} · ${esc(doc.ocrEngine||'motore locale')}</div></div>
      ${complexReadStatus}
      ${complexDoc?'<div class="form-group full"><div class="notice warning"><strong>Documento complesso.</strong> L’interpretazione automatica può essere incompleta o contenere errori. Per informazioni complete fare riferimento al documento originale. Per sicurezza questa tipologia può essere esclusa dal PDF senza perdere i valori clinici validi usati nei grafici e nello storico.</div></div>':''}
      <div class="form-group"><label>Data clinica</label><input type="date" min="${MIN_CLINICAL_DATE}" max="${today()}" name="clinicalDate" class="form-control" value="${isValidClinicalDate(doc.clinicalDate||'')?doc.clinicalDate:''}"></div>
      <div class="form-group"><label>Data emissione</label><input type="date" min="${MIN_CLINICAL_DATE}" max="${today()}" name="issueDate" class="form-control" value="${isValidClinicalDate(doc.issueDate||'')?doc.issueDate:''}"></div>
      <div class="form-group full"><label>Titolo nel dossier</label><input name="title" required class="form-control" value="${esc(doc.title||'')}"></div>
      <div class="form-group"><label>Modalità</label><select name="documentMode" class="form-control">${[['lab','Laboratorio / tabella'],['narrative','Referto narrativo'],['mixed','Documento misto'],['therapy','Piano terapeutico'],['diagnosis','Diagnosi'],['exemption','Esenzione']].map(([v,l])=>`<option value="${v}" ${mode===v?'selected':''}>${l}</option>`).join('')}</select></div>
      <div class="form-group"><label>Tipologia</label><input name="documentKind" class="form-control" value="${esc(doc.documentKind||doc.category||'')}"></div>
      <div class="form-group"><label>Specializzazione</label><input name="specialization" class="form-control" value="${esc(doc.specialization||doc.department||'')}"></div>
      ${isSpecialistVisitDocument(doc)?`<div class="form-group"><label>Medico/refertante</label><input name="doctor" class="form-control" value="${esc(doc.doctor||'')}"></div>`:''}
      <div class="form-group full"><label>Struttura sanitaria</label><input name="facility" class="form-control" value="${esc(doc.facility||'')}"></div>
      <div class="form-group full"><label>Inclusione nel dossier PDF</label><select name="pdfExportMode" class="form-control"><option value="full" ${effectivePdfExportMode(doc)==='full'?'selected':''}>Includi contenuto clinico elaborato</option><option value="summary" ${effectivePdfExportMode(doc)==='summary'?'selected':''}>Solo contenuto clinico rilevante / sintesi</option><option value="exclude" ${effectivePdfExportMode(doc)==='exclude'?'selected':''}>Escludi dal PDF / stampa (mantieni i valori nei grafici)</option></select><small>Il file originale resta sempre archiviato. I valori clinici validi restano disponibili per grafici e storico anche se il documento è escluso dal PDF.</small></div>
      ${pdfFieldsBlock}${narrativeBlock}${labBlock}
      <div class="form-group full"><label>Note personali</label><textarea name="notes" class="form-control">${esc(doc.notes||'')}</textarea></div>
      <div class="form-actions"><button type="button" class="btn btn-danger" id="deleteDocFromEditBtn">Elimina documento</button><button type="button" class="btn btn-light" id="reanalyzeDocBtn">Rianalizza con Python</button><button type="button" class="btn btn-light" id="cancelModalBtn">Annulla</button><button class="btn btn-primary">Salva</button></div>
    </form>`);
    $('#cancelModalBtn').onclick=closeModal;$('#deleteDocFromEditBtn').onclick=async()=>{closeModal();await deleteDocument(doc.id);};$('#reanalyzeDocBtn').onclick=async()=>{closeModal();await reanalyzeDocument(doc);};
    const bindLabRemove=()=>$$('[data-remove-lab]',$('#labEditRows')).forEach(b=>b.onclick=()=>b.closest('tr').remove());const bindQualRemove=()=>$$('[data-remove-qual]',$('#qualEditRows')).forEach(b=>b.onclick=()=>b.closest('tr').remove());
    if($('#addLabValueBtn')){$('#addLabValueBtn').onclick=()=>{$('#labEditRows').insertAdjacentHTML('beforeend',valueRow({}));bindLabRemove();};bindLabRemove();}
    if($('#addQualValueBtn')){$('#addQualValueBtn').onclick=()=>{$('#qualEditRows').insertAdjacentHTML('beforeend',qualitativeRow({}));bindQualRemove();};bindQualRemove();}
    const bindPdfFieldRemove=()=>$$('[data-remove-pdf-field]',$('#pdfFieldRows')||document.createElement('div')).forEach(b=>b.onclick=()=>b.closest('[data-pdf-field-row]').remove());
    if($('#addPdfFieldBtn')){$('#addPdfFieldBtn').onclick=()=>{$('#pdfFieldRows').insertAdjacentHTML('beforeend',pdfFieldRow({include:true}));bindPdfFieldRemove();};bindPdfFieldRemove();}
    $('#docEditForm').onsubmit=async e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.target));if(data.clinicalDate&&!isValidClinicalDate(data.clinicalDate)){toast('Data clinica non valida');return;}if(data.issueDate&&!isValidClinicalDate(data.issueDate)){toast('Data di emissione non valida');return;}
      const values=$$('[data-lab-row]',$('#labEditRows')||document.createElement('tbody')).map(row=>{const get=k=>row.querySelector(`[data-lab="${k}"]`)?.value||'';const value=Number(String(get('value')).replace(',','.'));if(!get('parameterName')||!Number.isFinite(value))return null;return {id:uid('value'),parameterId:HealthExtractors.parameterMatches(get('parameterName'))[0]?.id||`custom_${slug(get('parameterName'))}`,parameterName:get('parameterName'),sample:'',value,rawValue:String(value),unit:get('unit'),range:get('range')?{raw:get('range')}:null,status:get('status'),sourceLine:'Correzione manuale',confidence:100,graphEligible:true};}).filter(Boolean);
      const qualitativeResults=$$('[data-qual-row]',$('#qualEditRows')||document.createElement('tbody')).map(row=>{const get=k=>row.querySelector(`[data-qual="${k}"]`)?.value?.trim()||'';return get('test')&&get('result')?{test:get('test'),result:get('result'),unit:get('unit'),reference:get('reference'),sourceLine:'Correzione manuale',confidence:100}:null;}).filter(Boolean);
      const pdfFields=$$('[data-pdf-field-row]',$('#pdfFieldRows')||document.createElement('div')).map(row=>({id:uid('pdf-field'),include:!!row.querySelector('[data-pdf-field="include"]')?.checked,label:String(row.querySelector('[data-pdf-field="label"]')?.value||'').trim(),value:String(row.querySelector('[data-pdf-field="value"]')?.value||'').trim()})).filter(x=>x.label||x.value);
      const reconstructedText=data.reconstructedText??doc.reconstructedText??'';delete data.reconstructedText;const category=data.documentMode==='lab'?'Esami di laboratorio':data.documentMode==='therapy'?'Piano terapeutico':data.documentMode==='exemption'?'Esenzione sanitaria':data.documentMode==='diagnosis'?'Diagnosi o certificazione':data.documentMode==='narrative'||data.documentMode==='mixed'?'Visita specialistica':doc.category;
      const manualIdentity={title:data.title||doc.title||'',documentMode:data.documentMode||doc.documentMode||'',documentKind:data.documentKind||doc.documentKind||'',category,specialization:data.specialization||''};
      const edited={...doc,...data,pdfExportOverride:true,category,department:data.specialization||doc.department||'',reconstructedText,reportSections:reconstructedText?[{title:'Referto',text:reconstructedText}]:(doc.reportSections||[]),pdfFields:['narrative','mixed','diagnosis'].includes(data.documentMode)?pdfFields:doc.pdfFields,labValues:values,qualitativeResults,manualIdentityOverride:true,manualIdentity,manualNarrativeOverride:['narrative','mixed','diagnosis'].includes(data.documentMode),needsCompletion:!data.clinicalDate,dateStatus:data.clinicalDate?'confirmed':'missing',updatedAt:new Date().toISOString()};
      const canonicalEdited=HealthExtractors.canonicalizeClinicalDocument24?HealthExtractors.canonicalizeClinicalDocument24(edited,{profile:activeProfile()||{}}).document:edited;
      Object.assign(canonicalEdited,{title:manualIdentity.title,documentMode:manualIdentity.documentMode,documentKind:manualIdentity.documentKind,category:manualIdentity.category,specialization:manualIdentity.specialization,department:manualIdentity.specialization,manualIdentityOverride:true,manualIdentity,manualNarrativeOverride:edited.manualNarrativeOverride,documentTypeSource:'correzione manuale',documentTypeConfidence:100});
      if(edited.manualNarrativeOverride){canonicalEdited.reconstructedText=reconstructedText;canonicalEdited.reportSections=reconstructedText?[{title:'Referto',text:reconstructedText}]:[];canonicalEdited.pdfFields=pdfFields;}
      await DossierDB.put('documents',canonicalEdited);closeModal();await loadProfileData();renderView();toast('Documento aggiornato');};
  }

  // R16: la rilettura produce sempre una nuova interpretazione candidata. Le correzioni manuali sono protette e una lettura peggiorativa non sostituisce la scheda corrente.
  async function reanalyzeDocument(doc,options={}) {
    if(!doc?.fileBlob)return;
    if(!options.skipConfirm&&!confirm('Rianalizzare integralmente il documento con il motore Python? La lettura attuale resterà protetta se la nuova interpretazione perde informazioni.'))return;
    toast(options.automatic?'Recupero automatico in corso':'Rianalisi integrale in corso');
    try{
      const isComplex=isComplexClinicalDoc(doc),rereadProgress=isComplex?openExportProgress(activeProfile()||{},'Rilettura cartella clinica','Il programma sta rianalizzando questa cartella clinica. Attendi il completamento dell’elaborazione.'):null;let result;
      try{result=await OCRService.analyzeFile(doc.fileBlob,p=>{if(rereadProgress)void rereadProgress.update(Number(p?.progress||0),'Rilettura cartella clinica',p?.message||'Analisi in corso');});}finally{if(rereadProgress)rereadProgress.close();}
      let analysis=analyzeOcrResult(result,doc.profileId,doc.originalName);const bookingOverlay=calendarBookingOverlayForImportedAnalysis(result.text||'',analysis);analysis=bookingOverlay.analysis;const mode=analysis.documentMode||doc.documentMode||'';
      const updated={...doc,clinicalDate:isValidClinicalDate(analysis.clinicalDate||'')?analysis.clinicalDate:doc.clinicalDate||'',issueDate:isValidClinicalDate(analysis.issueDate||'')?analysis.issueDate:doc.issueDate||'',title:analysis.title||doc.title,category:analysis.category||doc.category,documentMode:mode,documentKind:analysis.documentKind||doc.documentKind||analysis.category,specialization:analysis.specialization||doc.specialization||analysis.department||'',department:analysis.department||analysis.specialization||doc.department||'',facility:analysis.facility||doc.facility||'',doctor:analysis.doctor||'',doctorQualification:analysis.doctorQualification||'',documentNumber:analysis.documentNumber||doc.documentNumber||'',
        extractedText:result.text||'',structuredText:analysis.structuredText||result.text||'',reconstructedText:analysis.reconstructedText||'',documentContext:analysis.documentContext||'',bookingService:analysis.bookingService||doc.bookingService||'',bookingStartDate:analysis.bookingStartDate||doc.bookingStartDate||'',bookingStartTime:analysis.bookingStartTime||doc.bookingStartTime||'',bookingLocation:analysis.bookingLocation||doc.bookingLocation||'',bookingFacility:analysis.bookingFacility||doc.bookingFacility||'',bookingReferences:analysis.bookingReferences||doc.bookingReferences||[],bookingDetectedVersion:bookingOverlay.parsed?BOOKING_INTERPRETATION_VERSION:(doc.bookingDetectedVersion||''),ocrIntegralText:analysis.ocrIntegralText||result.text||'',reportSections:analysis.reportSections||[],ecgParameters:analysis.ecgParameters||[],labValues:isComplex?(analysis.labValues||[]):(['lab','mixed'].includes(mode)?analysis.labValues||[]:[]),qualitativeResults:isComplex?[]:(['lab','mixed'].includes(mode)?analysis.qualitativeResults||[]:[]),tableRows:isComplex?[]:(['lab','mixed'].includes(mode)?analysis.tableRows||[]:[]),extractionStats:analysis.extractionStats||null,medicalPersonnel:analysis.medicalPersonnel||[],identifiers:analysis.identifiers||[],profileEvidence:analysis.profileEvidence||null,extractedTherapies:analysis.extractedTherapies||[],extractedDiagnoses:analysis.extractedDiagnoses||[],extractedExemptions:analysis.extractedExemptions||[],dateCandidates:analysis.dateCandidates||[],textFingerprint:HealthExtractors.textFingerprint(result.text||''),pageFingerprints:HealthExtractors.buildPageFingerprints(result.pages||[],result.text||'',analysis.clinicalDate||''),ocrPageData:result.pages||[],ocrStatus:'completed',ocrEngine:result.engine||'',ocrLanguage:result.language||'',ocrProcessedPages:result.processedPages||0,ocrQuality:Math.round((result.pages||[]).reduce((a,p)=>a+Number(p.quality||0),0)/Math.max(1,(result.pages||[]).length)),lastAnalysisAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
      updated.needsCompletion=!updated.clinicalDate;updated.dateStatus=updated.clinicalDate?'confirmed':analysis.dateStatus||'missing';
      let canonicalUpdated=isComplex?forceComplexCanonical({...updated,complexClinicalContainer:true,documentKind:'Cartella clinica',category:'Cartella clinica',documentMode:'narrative'},activeProfile()||{}):(HealthExtractors.canonicalizeClinicalDocument24?HealthExtractors.canonicalizeClinicalDocument24(updated,{profile:activeProfile()||{}}).document:updated);
      if(bookingOverlay.parsed)canonicalUpdated=calendarNormalizeImportedBookingDocument({...canonicalUpdated,ocrIntegralText:result.text||canonicalUpdated.ocrIntegralText||''}).doc;
      if(isComplex){canonicalUpdated.clinicalParserVersion=CLINICAL_PARSER_VERSION;canonicalUpdated.clinicalParserRereadTargetVersion=CLINICAL_PARSER_VERSION;canonicalUpdated.clinicalCanonicalRereadVersion=V602_CANONICAL_VERSION;canonicalUpdated.clinicalCanonicalRereadStatus='completed';canonicalUpdated.clinicalCanonicalRereadError='';canonicalUpdated.clinicalCanonicalRereadAt=new Date().toISOString();canonicalUpdated.clinicalCanonicalLastProcessedAt=canonicalUpdated.clinicalCanonicalRereadAt;canonicalUpdated.lastAnalysisAt=canonicalUpdated.clinicalCanonicalRereadAt;}
      const decision=safeReanalysisDecision(doc,canonicalUpdated);
      if(!decision.apply){await saveDocumentCandidateVersion(doc,decision.candidate,`Rianalisi non applicata · ${decision.reasons.join(', ')}`);await loadProfileData();renderView();toast('Nuova lettura conservata nello storico: la scheda attuale è stata mantenuta');openDocumentEditModal(state.documents.find(x=>x.id===doc.id)||doc);return;}
      await saveDocumentVersion(doc,options.automatic?'Copia prima della riparazione automatica':'Copia prima della rianalisi');
      await DossierDB.put('documents',decision.candidate);
      if(bookingOverlay.parsed)await calendarEnsureEventForImportedBooking(decision.candidate,bookingOverlay.parsed);
      await loadProfileData();renderView();toast(options.automatic?'Scheda ricostruita':'Rianalisi completata');openDocumentEditModal(decision.candidate);
    }catch(error){toast(`Rianalisi non riuscita: ${error.message}`);if(options.automatic)openDocumentEditModal({...doc,ocrStatus:'repair_failed',extractedText:doc.extractedText||' '});}
  }

  async function reanalyzeAllDocuments() {
    const docs=state.documents.filter(d=>d.fileBlob);if(!docs.length){toast('Nessun documento da rianalizzare');return;}
    if(!confirm(`Rianalizzare ${docs.length} documenti con Python? Le correzioni manuali resteranno protette e una nuova lettura che perde informazioni non sostituirà quella corrente.`))return;
    let updatedCount=0,keptCount=0,failed=0;$('#appStatusText').textContent=`Rianalisi archivio 0/${docs.length}`;
    for(let index=0;index<docs.length;index++){
      const doc=docs[index];
      try{
        const result=await OCRService.analyzeFile(doc.fileBlob);let a=analyzeOcrResult(result,doc.profileId,doc.originalName);const bookingOverlay=calendarBookingOverlayForImportedAnalysis(result.text||'',a);a=bookingOverlay.analysis;const mode=a.documentMode||doc.documentMode||'';
        const updated={...doc,clinicalDate:isValidClinicalDate(a.clinicalDate||'')?a.clinicalDate:doc.clinicalDate||'',issueDate:isValidClinicalDate(a.issueDate||'')?a.issueDate:doc.issueDate||'',title:a.title||doc.title,category:a.category||doc.category,documentMode:mode,documentKind:a.documentKind||a.category||doc.documentKind,specialization:a.specialization||a.department||doc.specialization||'',department:a.department||a.specialization||doc.department||'',facility:a.facility||doc.facility||'',doctor:a.doctor||'',doctorQualification:a.doctorQualification||'',medicalPersonnel:a.medicalPersonnel||[],documentContext:a.documentContext||'',bookingService:a.bookingService||doc.bookingService||'',bookingStartDate:a.bookingStartDate||doc.bookingStartDate||'',bookingStartTime:a.bookingStartTime||doc.bookingStartTime||'',bookingLocation:a.bookingLocation||doc.bookingLocation||'',bookingFacility:a.bookingFacility||doc.bookingFacility||'',bookingReferences:a.bookingReferences||doc.bookingReferences||[],bookingDetectedVersion:bookingOverlay.parsed?BOOKING_INTERPRETATION_VERSION:(doc.bookingDetectedVersion||''),ocrIntegralText:a.ocrIntegralText||result.text||'',extractedText:result.text||'',structuredText:a.structuredText||result.text||'',reconstructedText:a.reconstructedText||'',reportSections:a.reportSections||[],ecgParameters:a.ecgParameters||[],labValues:isComplexClinicalDoc(doc)?(a.labValues||[]):(['lab','mixed'].includes(mode)?a.labValues||[]:[]),qualitativeResults:isComplexClinicalDoc(doc)?[]:(['lab','mixed'].includes(mode)?a.qualitativeResults||[]:[]),tableRows:isComplexClinicalDoc(doc)?[]:(['lab','mixed'].includes(mode)?a.tableRows||[]:[]),extractedTherapies:a.extractedTherapies||[],extractedDiagnoses:a.extractedDiagnoses||[],extractedExemptions:a.extractedExemptions||[],ocrPageData:result.pages||[],ocrStatus:'completed',ocrEngine:result.engine||'',ocrQuality:Math.round((result.pages||[]).reduce((x,p)=>x+Number(p.quality||0),0)/Math.max(1,(result.pages||[]).length)),lastAnalysisAt:new Date().toISOString(),dataNormalizationVersion:'5.0.0',updatedAt:new Date().toISOString()};
        const complexSource=isComplexClinicalDoc(doc);let canonicalUpdated=complexSource?forceComplexCanonical({...updated,complexClinicalContainer:true,documentKind:'Cartella clinica',category:'Cartella clinica',documentMode:'narrative'},activeProfile()||{}):(HealthExtractors.canonicalizeClinicalDocument24?HealthExtractors.canonicalizeClinicalDocument24(updated,{profile:activeProfile()||{}}).document:updated);
        if(bookingOverlay.parsed)canonicalUpdated=calendarNormalizeImportedBookingDocument({...canonicalUpdated,ocrIntegralText:result.text||canonicalUpdated.ocrIntegralText||''}).doc;
        if(complexSource){canonicalUpdated.clinicalParserVersion=CLINICAL_PARSER_VERSION;canonicalUpdated.clinicalParserRereadTargetVersion=CLINICAL_PARSER_VERSION;canonicalUpdated.clinicalCanonicalRereadVersion=V602_CANONICAL_VERSION;canonicalUpdated.clinicalCanonicalRereadStatus='completed';canonicalUpdated.clinicalCanonicalRereadAt=new Date().toISOString();canonicalUpdated.clinicalCanonicalLastProcessedAt=canonicalUpdated.clinicalCanonicalRereadAt;canonicalUpdated.lastAnalysisAt=canonicalUpdated.clinicalCanonicalRereadAt;}
        const decision=safeReanalysisDecision(doc,canonicalUpdated);
        if(decision.apply){await saveDocumentVersion(doc,'Copia prima della rianalisi completa archivio');await DossierDB.put('documents',decision.candidate);if(bookingOverlay.parsed)await calendarEnsureEventForImportedBooking(decision.candidate,bookingOverlay.parsed);updatedCount++;}
        else{await saveDocumentCandidateVersion(doc,decision.candidate,`Rianalisi archivio non applicata · ${decision.reasons.join(', ')}`);keptCount++;}
      }catch(error){console.error('R16: rianalisi archivio non riuscita',doc?.title||doc?.originalName,error);failed++;}
      $('#appStatusText').textContent=`Rianalisi archivio ${index+1}/${docs.length}`;await nextIdleTurn();
    }
    $('#appStatusText').textContent='Archivio locale pronto';await loadProfileData();renderView();toast(`Rianalisi completata: ${updatedCount} aggiornati${keptCount?`, ${keptCount} mantenuti perché la nuova lettura era peggiorativa`:''}${failed?`, ${failed} errori`:''}`);
  }

  async function restoreDocumentVersion(versionId){
    const version=state.documentVersions.find(v=>v.id===versionId)||await DossierDB.get('documentVersions',versionId);if(!version)return;const doc=state.documents.find(d=>d.id===version.documentId)||await DossierDB.get('documents',version.documentId);if(!doc)return;if(!confirm(`Ripristinare la versione ${version.versionNumber}? La versione attuale verrà conservata nello storico.`))return;await saveDocumentVersion(doc,'Versione salvata prima del ripristino');const updated={...doc,...version.snapshot,id:doc.id,profileId:doc.profileId,fileBlob:doc.fileBlob,originalName:doc.originalName,mimeType:doc.mimeType,size:doc.size,hash:doc.hash,updatedAt:new Date().toISOString()};await DossierDB.put('documents',updated);closeModal();await loadProfileData();renderView();toast('Interpretazione precedente ripristinata');viewDocument(updated.id);
  }

  async function imagePreviewDataUrl(file,maxSide=260){
    try{const bitmap=await createImageBitmap(file),ratio=Math.min(1,maxSide/Math.max(bitmap.width,bitmap.height)),w=Math.max(1,Math.round(bitmap.width*ratio)),h=Math.max(1,Math.round(bitmap.height*ratio)),canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;canvas.getContext('2d').drawImage(bitmap,0,0,w,h);bitmap.close?.();return canvas.toDataURL('image/jpeg',.82);}catch{return'';}
  }

  async function addImagesToDocument(doc){
    if(!doc||!DossierSecurity.canEditProfile(doc.profileId)||!globalThis.ClinicaLot2?.storeManagedMedia)return;
    const input=document.createElement('input');input.type='file';input.multiple=true;input.accept='image/jpeg,image/png,.jpg,.jpeg,.png';input.className='hidden';document.body.appendChild(input);
    input.onchange=async()=>{const files=[...input.files].filter(f=>/^image\/(jpeg|png)$/i.test(f.type)||/\.(jpe?g|png)$/i.test(f.name));input.remove();if(!files.length)return;const previews=await Promise.all(files.map(async(file,i)=>({file,previewDataUrl:await imagePreviewDataUrl(file),name:file.name||`immagine_${i+1}.jpg`,size:Number(file.size||0)})));openModal('Allega immagini',doc.title||doc.originalName||'Referto',`<div class="notice"><strong>${previews.length} immagin${previews.length===1?'e selezionata':'i selezionate'}.</strong><br>Le immagini non vengono archiviate finché non premi <strong>Salva</strong>.</div><div class="document-attach-review">${previews.map(x=>`<article class="document-attach-review-card">${x.previewDataUrl?`<img src="${x.previewDataUrl}" alt="${esc(x.name)}">`:'<span>Immagine</span>'}<div><strong>${esc(x.name)}</strong><small>${globalThis.ClinicaLot2?.formatBytes?.(x.size)||''}</small></div></article>`).join('')}</div><div class="form-actions"><button type="button" class="btn btn-light" id="cancelAttachImagesBtn">Annulla</button><button type="button" class="btn btn-primary" id="saveAttachImagesBtn">Salva</button></div>`);$('#cancelAttachImagesBtn').onclick=closeModal;$('#saveAttachImagesBtn').onclick=async()=>{const saveBtn=$('#saveAttachImagesBtn');if(saveBtn){saveBtn.disabled=true;saveBtn.textContent='Salvataggio…';}const progress=openExportProgress(activeProfile()||{},'Salvataggio immagini associate','Le immagini vengono copiate nell’Archivio locale solo dopo la conferma.');let done=0;try{for(const item of previews){const file=item.file,id=uid('media'),path=item.name;await progress.update((done/previews.length)*100,'Copia nell’Archivio immagini locale',`${done} / ${previews.length} immagini`);await ClinicaLot2.storeManagedMedia('image',doc.profileId,id,path,file);const now=new Date().toISOString();await DossierDB.put('mediaAttachments',{id,profileId:doc.profileId,linkedDocumentId:doc.id,name:item.name,type:file.type||'image/jpeg',size:item.size,storageMode:'managed',storagePath:path,previewDataUrl:item.previewDataUrl,createdAt:now,updatedAt:now},{sync:false,details:{event:'document-image-attach',documentId:doc.id,name:item.name}});done++;}await progress.update(100,'Salvataggio completato',`${done} immagini collegate al referto`);toast(`${done} immagini salvate e collegate al referto`);closeModal();setTimeout(()=>viewDocument(doc.id),120);}catch(error){toast(`Salvataggio immagini non completato: ${error.message}`);if(saveBtn){saveBtn.disabled=false;saveBtn.textContent='Salva';}}finally{progress.close();}};};
    input.click();
  }

  async function deleteMediaAttachment(row,documentId){
    if(!row||!confirm(`Rimuovere l’immagine “${row.name||'Immagine'}” dal referto? Il file verrà eliminato dall’Archivio immagini locale.`))return;
    await globalThis.ClinicaLot2?.deleteManagedMediaOwner?.('image',row.profileId,row.id);await DossierDB.del('mediaAttachments',row.id,{sync:false,profileId:row.profileId,details:{event:'document-image-delete',documentId}});toast('Immagine rimossa');closeModal();setTimeout(()=>viewDocument(documentId),100);
  }

  async function openMediaAttachmentViewer(rows=[],start=0){
    if(!rows.length||!globalThis.ClinicaLot2?.getManagedMediaBlob)return;const overlay=document.createElement('div');overlay.className='document-image-viewer-overlay';overlay.innerHTML=`<div class="document-image-viewer"><header><div><strong data-image-title>Immagine associata</strong><small data-image-count></small></div><button class="btn btn-light btn-small" data-image-close>Chiudi</button></header><div class="document-image-stage"><div class="document-image-canvas"><img alt="Immagine associata"></div><div class="document-image-error hidden"></div></div><footer><button class="btn btn-light btn-small" data-image-prev>◀</button><button class="btn btn-light btn-small" data-image-zoom-out>−</button><span class="document-image-zoom-label" data-image-zoom-label>100%</span><button class="btn btn-light btn-small" data-image-zoom-in>+</button><button class="btn btn-light btn-small" data-image-fit>Adatta</button><button class="btn btn-light btn-small" data-image-rotate>Ruota</button><span data-image-index></span><button class="btn btn-light btn-small" data-image-next>▶</button></footer></div>`;document.body.appendChild(overlay);let index=Math.max(0,Math.min(rows.length-1,start)),url='',zoom=1,rotation=0,fitScale=1;const img=overlay.querySelector('img'),stage=overlay.querySelector('.document-image-stage'),box=overlay.querySelector('.document-image-canvas'),err=overlay.querySelector('.document-image-error'),title=overlay.querySelector('[data-image-title]'),count=overlay.querySelector('[data-image-count]'),idx=overlay.querySelector('[data-image-index]'),zoomLabel=overlay.querySelector('[data-image-zoom-label]');const updateGeometry=()=>{if(!img.naturalWidth||!img.naturalHeight)return;const sourceW=img.naturalWidth*fitScale*zoom,sourceH=img.naturalHeight*fitScale*zoom,swapped=Math.abs(rotation%180)===90;box.style.width=`${Math.max(1,swapped?sourceH:sourceW)}px`;box.style.height=`${Math.max(1,swapped?sourceW:sourceH)}px`;img.style.width=`${Math.max(1,sourceW)}px`;img.style.height=`${Math.max(1,sourceH)}px`;img.style.transform=`translate(-50%,-50%) rotate(${rotation}deg)`;zoomLabel.textContent=`${Math.round(zoom*100)}%`;};const fitImage=()=>{if(!img.naturalWidth||!img.naturalHeight)return;const availW=Math.max(100,stage.clientWidth-36),availH=Math.max(100,stage.clientHeight-36);fitScale=Math.min(1,availW/img.naturalWidth,availH/img.naturalHeight);zoom=1;stage.scrollLeft=0;stage.scrollTop=0;updateGeometry();};async function show(next){index=(next+rows.length)%rows.length;zoom=1;rotation=0;fitScale=1;if(url){URL.revokeObjectURL(url);url='';}err.classList.add('hidden');img.classList.remove('hidden');const row=rows[index];title.textContent=row.name||'Immagine associata';count.textContent=`${ClinicaLot2.formatBytes?.(row.size)||''}`;idx.textContent=`${index+1} / ${rows.length}`;try{const blob=await ClinicaLot2.getManagedMediaBlob('image',row.profileId,row.id,row.storagePath||row.name);url=URL.createObjectURL(blob);img.onload=()=>requestAnimationFrame(fitImage);img.src=url;}catch(error){img.classList.add('hidden');err.classList.remove('hidden');err.textContent='Immagine non disponibile nell’Archivio locale.';}}overlay.querySelector('[data-image-prev]').onclick=()=>show(index-1);overlay.querySelector('[data-image-next]').onclick=()=>show(index+1);overlay.querySelector('[data-image-zoom-in]').onclick=()=>{zoom=Math.min(6,zoom+.25);updateGeometry();};overlay.querySelector('[data-image-zoom-out]').onclick=()=>{zoom=Math.max(.25,zoom-.25);updateGeometry();};overlay.querySelector('[data-image-fit]').onclick=fitImage;overlay.querySelector('[data-image-rotate]').onclick=()=>{rotation=(rotation+90)%360;updateGeometry();};overlay.querySelector('[data-image-close]').onclick=()=>{if(url)URL.revokeObjectURL(url);overlay.remove();};await show(index);
  }

  async function viewDocument(id) {
    const stored=state.documents.find(d=>d.id===id)||await DossierDB.get('documents',id);if(!stored)return;
    void DossierDB.addAudit('access','documents',stored.id,stored.profileId||'',{event:'open-document',title:stored.title||stored.originalName||'Documento sanitario'}).catch(()=>{});
    const prepared=globalThis.HealthExtractors?.prepareDocuments24?HealthExtractors.prepareDocuments24([stored],activeProfile()||{})[0]:stored;
    const doc=prepared;const versions=state.documentVersions.filter(v=>v.documentId===id).sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));const dicomPromise=globalThis.ClinicaLot2?.getDicomStudiesForDocument?ClinicaLot2.getDicomStudiesForDocument(stored):(async()=>{const all=await DossierDB.byProfile('dicomStudies',stored.profileId||state.activeProfileId);return all.filter(x=>String(x.linkedDocumentId||'')===String(stored.id));})();const [linkedDicomStudies,linkedImages]=await Promise.all([dicomPromise,(await DossierDB.byProfile('mediaAttachments',stored.profileId||state.activeProfileId)).filter(x=>String(x.linkedDocumentId||'')===String(stored.id)).sort((a,b)=>String(a.createdAt||'').localeCompare(String(b.createdAt||'')))]);const groupPrimaryId=documentGroupPrimaryId(stored)||stored.id,groupPrimary=state.documents.find(x=>String(x.id)===String(groupPrimaryId))||stored,groupedDocuments=documentGroupRows(groupPrimary).filter(x=>String(x.id)!==String(stored.id));const originalBlob=typedOriginalBlob(stored.fileBlob,stored.originalName);const url=URL.createObjectURL(originalBlob);const mode=doc.documentMode||((doc.category==='Esami di laboratorio')?'lab':'narrative');
    const labRows=HealthReport.resultRows(doc,{profile:activeProfile()||{}});const labGroups=HealthReport.groupedResultRows?.(labRows)||[{section:'Risultati clinici',rows:labRows}];
    const sheetNarrativeRows=HealthReport.narrativeRows?.(doc)||[];
    const ecgHtml=HealthReport.ecgTable?.(doc)||'';
    const labHtml=(mode==='lab'||mode==='mixed'||isComplexClinicalDoc(doc))&&labRows.length?`<div class="card" style="margin-top:18px"><h3>Risultati clinici</h3>${labGroups.map(group=>`<div class="lab-panel-block"><h4>${esc(group.section)}</h4><div class="table-wrap"><table><thead><tr><th>Esame</th><th>Risultato</th><th>Unità</th><th>Riferimento</th><th>Stato</th></tr></thead><tbody>${group.rows.map(r=>{const cls=HealthReport.statusClass?.(r.status)||'';return `<tr><td>${esc(r.test)}</td><td><strong>${esc(r.result)}</strong></td><td>${esc(r.unit||'')}</td><td>${esc(r.reference||'')}</td><td>${r.status?`<span class="badge ${esc(cls)}">${esc(r.status)}</span>`:''}</td></tr>`}).join('')}</tbody></table></div></div>`).join('')}</div>`:'';
    const narrativeHtml=(mode==='narrative'||mode==='mixed'||mode==='diagnosis')&&sheetNarrativeRows.length?`<div class="card" style="margin-top:18px"><h3>Referto clinico ricostruito</h3><div class="document-report">${sheetNarrativeRows.map(([label,text])=>`<section><h4>${esc(label||'Referto')}</h4>${String(text).split(/\n+/).filter(Boolean).map(par=>`<p>${esc(par)}</p>`).join('')}</section>`).join('')}</div><p class="kpi-note">Le righe tecniche o prive di contenuto clinico utile vengono conservate nel file originale ma non mostrate nella scheda.</p></div>`:'';
    const therapyHtml=(doc.extractedTherapies||[]).length?`<div class="card" style="margin-top:18px"><h3>Terapie riconosciute</h3><div class="table-wrap"><table class="therapy-table">${therapyColgroup(doc.extractedTherapies)}<thead><tr><th>Orario</th><th>Farmaco</th><th>Principio attivo</th><th>Dosaggio</th><th>Frequenza / Note</th></tr></thead><tbody>${doc.extractedTherapies.map(t=>`<tr><td>${esc(t.time||t.schedule||'')}</td><td><strong>${esc(t.medication||'')}</strong></td><td>${esc(t.activeIngredient||'')}</td><td>${esc(t.dosage||'')}</td><td>${esc(t.frequency||t.notes||'')}</td></tr>`).join('')}</tbody></table></div></div>`:'';
    openModal(doc.title,`${formatDate(doc.clinicalDate)} · ${doc.originalName}`,`<div class="row-actions" style="margin-bottom:14px"><button class="btn btn-primary" id="openOriginalBtn" type="button">Apri file originale</button><button class="btn btn-light" id="downloadOriginalBtn" type="button">Scarica originale</button>${linkedDicomStudies.length?`<button class="btn btn-light" id="openLinkedDicomBtn" type="button">Apri immagini DICOM${linkedDicomStudies.length>1?` (${linkedDicomStudies.length})`:``}</button>`:``}<button class="btn btn-light" id="attachImagesBtn" type="button">Allega immagini</button><button class="btn btn-light" id="associateDocumentsBtn" type="button">Associa documenti</button><button class="btn btn-light" id="editDocumentBtn">Modifica scheda</button><button class="btn btn-light" id="reanalyzeDocumentBtn">Rianalizza con Python</button><button class="btn btn-danger" id="deleteDocumentBtn">Elimina</button></div>
      <dl class="meta-list"><dt>Data clinica</dt><dd>${formatDate(doc.clinicalDate)}</dd>${doc.issueDate&&doc.issueDate!==doc.clinicalDate?`<dt>Data emissione</dt><dd>${formatDate(doc.issueDate)}</dd>`:''}<dt>Tipologia</dt><dd>${esc(doc.documentKind||doc.category||'Documento sanitario')}</dd><dt>Specializzazione</dt><dd>${esc(doc.specialization||doc.department||'Non indicata')}</dd>${isSpecialistVisitDocument(doc)&&doc.doctor?`<dt>Medico/refertante</dt><dd>${esc(doc.doctor)}</dd>`:''}<dt>Struttura</dt><dd>${esc(doc.facility||'Non indicata')}</dd><dt>Motore</dt><dd>${esc(doc.ocrEngine||'Non indicato')} · qualità ${Math.round(Number(doc.ocrQuality||0))}%</dd><dt>Ultima lettura</dt><dd>${doc.clinicalCanonicalRereadAt||doc.lastAnalysisAt||doc.addedAt?formatDateTime(doc.clinicalCanonicalRereadAt||doc.lastAnalysisAt||doc.addedAt):'Non disponibile'}</dd>${linkedDicomStudies.length?`<dt>Imaging associato</dt><dd>${linkedDicomStudies.length} studio${linkedDicomStudies.length===1?'':'i'} DICOM · ${linkedDicomStudies.reduce((n,s)=>n+Number(s.fileCount||0),0)} immagini</dd>`:''}${isComplexClinicalDoc(doc)?`<dt>Canone clinico</dt><dd>${doc.clinicalCanonicalRereadAt?formatDateTime(doc.clinicalCanonicalRereadAt):(doc.clinicalCanonicalRereadStatus==='failed'?'Da riprovare':'Da rileggere')} · ${esc(doc.clinicalCanonicalRereadVersion||doc.clinicalCanonicalVersion||'')}</dd>`:''}</dl>
      ${ecgHtml}${narrativeHtml}${labHtml}${therapyHtml}${linkedDicomStudies.length?`<div class="card document-linked-dicom" style="margin-top:18px"><div class="card-title-row"><div><h3>Immagini radiologiche associate</h3><p class="kpi-note">Questo referto è collegato a ${linkedDicomStudies.length} studio${linkedDicomStudies.length===1?'':'i'} DICOM gestito${linkedDicomStudies.length===1?'':'i'} dal Dossier.</p></div><button class="btn btn-primary btn-small" type="button" data-open-linked-dicom>Apri immagini DICOM</button></div><div class="dicom-summary-line">${linkedDicomStudies.map(s=>`<span class="badge success">${esc(s.modality||'DICOM')} · ${Number(s.fileCount||0)} immagini</span>`).join('')}</div></div>`:''}${doc.notes?`<div class="card" style="margin-top:18px"><h3>Note personali</h3><p>${esc(doc.notes)}</p></div>`:''}
      ${linkedImages.length?`<div class="card document-linked-images" style="margin-top:18px"><div class="card-title-row"><div><h3>Immagini associate · ${linkedImages.length}</h3><p class="kpi-note">Radiografie e altre immagini collegate a questo referto e conservate nell’Archivio immagini locale.</p></div></div><div class="document-linked-image-grid">${linkedImages.map((img,i)=>`<article class="document-linked-image-card"><button type="button" class="document-linked-image-open" data-linked-image-index="${i}">${img.previewDataUrl?`<img src="${img.previewDataUrl}" alt="${esc(img.name||'Immagine associata')}">`:`<span>Immagine</span>`}</button><div><strong>${esc(img.name||'Immagine')}</strong><small>${globalThis.ClinicaLot2?.formatBytes?.(img.size)||''}</small><button type="button" class="btn btn-danger btn-small" data-delete-linked-image="${esc(img.id)}">Rimuovi</button></div></article>`).join('')}</div></div>`:''}
      ${groupedDocuments.length?`<div class="card document-group-card" style="margin-top:18px"><div class="card-title-row"><div><h3>Documenti dello stesso esame · ${groupedDocuments.length+1}</h3><p class="kpi-note">Gli originali restano distinti, ma vengono consultati come un unico esame.</p></div><button class="btn btn-light btn-small" id="manageDocumentGroupBtn" type="button">Gestisci associazioni</button></div>${groupedDocuments.map(g=>`<div class="document-group-row"><span class="document-group-row-icon">${uiIconSvg('document')}</span><div><strong>${esc(g.title||g.originalName||'Documento')}</strong><small>${g.clinicalDate?formatDate(g.clinicalDate):'Data non indicata'} · ${esc(g.documentKind||g.category||'Documento sanitario')}</small></div><div class="row-actions"><button class="btn btn-light btn-small" data-open-group-doc="${esc(g.id)}">Apri</button><button class="btn btn-ghost btn-small" data-detach-group-doc="${esc(g.id)}">Separa</button></div></div>`).join('')}</div>`:''}
      ${versions.length?`<details class="card version-history" style="margin-top:18px"><summary><strong>Cronologia delle interpretazioni · ${versions.length}</strong></summary>${versions.map(v=>`<div class="version-history-item"><strong>Versione ${v.versionNumber}</strong> · ${esc(v.reason||'Aggiornamento')}<br><small>${formatDateTime(v.createdAt)} · ${esc(v.engine||'motore non registrato')} · app ${esc(v.appVersion||'')}</small><div class="row-actions"><button class="btn btn-light btn-small" data-restore-version="${v.id}">Ripristina questa interpretazione</button></div></div>`).join('')}</details>`:''}
      <details class="card" style="margin-top:18px"><summary><strong>Testo OCR grezzo e diagnostica</strong></summary><pre class="ocr-structured-text">${esc(doc.extractedText||'')}</pre></details>`);
    $('#openLinkedDicomBtn')?.addEventListener('click',()=>globalThis.ClinicaLot2?.openDicomForDocument?.(stored.id));$$('[data-open-linked-dicom]',$('#modalBody')).forEach(b=>b.addEventListener('click',()=>globalThis.ClinicaLot2?.openDicomForDocument?.(stored.id)));$('#attachImagesBtn')?.addEventListener('click',()=>addImagesToDocument(stored));$('#associateDocumentsBtn')?.addEventListener('click',()=>openDocumentAssociationModal(groupPrimary));$('#manageDocumentGroupBtn')?.addEventListener('click',()=>openDocumentAssociationModal(groupPrimary));$$('[data-open-group-doc]',$('#modalBody')).forEach(b=>b.onclick=()=>{URL.revokeObjectURL(url);closeModal();viewDocument(b.dataset.openGroupDoc);});$$('[data-detach-group-doc]',$('#modalBody')).forEach(b=>b.onclick=async()=>{URL.revokeObjectURL(url);closeModal();await detachDocumentFromGroup(b.dataset.detachGroupDoc);setTimeout(()=>viewDocument(groupPrimary.id),100);});$$('[data-linked-image-index]',$('#modalBody')).forEach(b=>b.onclick=()=>openMediaAttachmentViewer(linkedImages,Number(b.dataset.linkedImageIndex)||0));$$('[data-delete-linked-image]',$('#modalBody')).forEach(b=>b.onclick=()=>deleteMediaAttachment(linkedImages.find(x=>String(x.id)===String(b.dataset.deleteLinkedImage)),stored.id));    $('#openOriginalBtn').onclick=async()=>{const b=$('#openOriginalBtn');if(b){b.disabled=true;b.textContent='Apertura…';}void DossierDB.addAudit('access','documents',stored.id,stored.profileId||'',{event:'open-original',title:stored.title||stored.originalName||'Documento sanitario'}).catch(()=>{});try{await openOriginalWithName(originalBlob,doc);}catch(error){console.warn('Anteprima nominata non disponibile:',error);window.open(url,'_blank','noopener');}finally{if(b){b.disabled=false;b.textContent='Apri file originale';}}};$('#downloadOriginalBtn').onclick=()=>{void DossierDB.addAudit('export','documents',stored.id,stored.profileId||'',{event:'download-original',title:stored.title||stored.originalName||'Documento sanitario'}).catch(()=>{});downloadBlob(originalBlob,originalDocumentFileName(doc));};$('#editDocumentBtn').onclick=()=>{URL.revokeObjectURL(url);openDocumentEditModal(doc);};$('#reanalyzeDocumentBtn').onclick=()=>{URL.revokeObjectURL(url);closeModal();reanalyzeDocument(doc);};$('#deleteDocumentBtn').onclick=async()=>{URL.revokeObjectURL(url);closeModal();await deleteDocument(doc.id);};$$('[data-restore-version]',$('#modalBody')).forEach(b=>b.onclick=()=>{URL.revokeObjectURL(url);restoreDocumentVersion(b.dataset.restoreVersion);});$('#closeModalBtn').addEventListener('click',()=>URL.revokeObjectURL(url),{once:true});
  }

  async function deleteDocument(id) {
    await moveDocumentsToTrash([id]);
  }

  function openDoctorModal(item={}) { simpleEntityModal('Medico o specialista','doctorForm',`
    <div class="form-group"><label>Nome e cognome *</label><input name="name" required class="form-control" value="${esc(item.name||'')}"></div><div class="form-group"><label>Specializzazione</label><input name="role" class="form-control" value="${esc(item.role||'')}"></div><div class="form-group"><label>Email</label><input type="email" name="email" class="form-control" value="${esc(item.email||'')}"></div><div class="form-group"><label>Telefono</label><input name="phone" class="form-control" value="${esc(item.phone||'')}"></div><div class="form-group full"><label>Struttura</label><input name="facility" class="form-control" value="${esc(item.facility||'')}"></div><div class="form-group full"><label>Note</label><textarea name="notes" class="form-control">${esc(item.notes||'')}</textarea></div>`, 'doctors', item); }
  function openTherapyModal(item={}) { simpleEntityModal('Terapia farmacologica','therapyForm',`
    <div class="form-group"><label>Orario/i</label><input name="time" class="form-control" value="${esc(item.time||item.schedule||'')}" placeholder="Es. 08:30 oppure mattina + sera"></div><div class="form-group"><label>Farmaco *</label><input name="medication" required class="form-control" list="therapyMedicineOptions" autocomplete="off" value="${esc(item.medication||'')}"><datalist id="therapyMedicineOptions"></datalist><small id="therapyMedicineHint" class="field-help">Scrivi il nome commerciale: principio attivo e produttore vengono proposti dall’anagrafica AIFA locale.</small><small class="field-help">Fonte dati medicinali: Agenzia Italiana del Farmaco (AIFA), Open Data, licenza CC BY 4.0. Dati rielaborati localmente da Clinica Digitale.</small></div><div class="form-group"><label>Principio attivo</label><input name="activeIngredient" class="form-control" value="${esc(item.activeIngredient||'')}"></div><div class="form-group"><label>Produttore / Marca</label><input name="manufacturer" class="form-control" value="${esc(item.manufacturer||'')}" placeholder="Es. Teva Italia S.r.l., EG S.p.A."></div><div class="form-group"><label>Tipo</label><select name="medicineType" class="form-control"><option value="" ${!item.medicineType?'selected':''}>Non specificato</option><option value="Originale / originatore" ${item.medicineType==='Originale / originatore'?'selected':''}>Originale / originatore</option><option value="Generico / equivalente" ${item.medicineType==='Generico / equivalente'?'selected':''}>Generico / equivalente</option><option value="Altro" ${item.medicineType==='Altro'?'selected':''}>Altro</option></select></div><div class="form-group"><label>Dosaggio</label><input name="dosage" class="form-control" value="${esc(item.dosage||'')}"></div><div class="form-group full"><label>Frequenza e modalità</label><input name="frequency" class="form-control" value="${esc(item.frequency||'')}" placeholder="Es. 1/2 compressa al mattino + 1 compressa alla sera"></div>${therapyDaysEditorHtml(item)}<div class="form-group"><label>Validità / aggiornamento</label><input name="period" class="form-control" value="${esc(item.period||'')}"></div><div class="form-group"><label>Stato</label><select name="active" class="form-control"><option value="true" ${item.active!==false?'selected':''}>Attiva</option><option value="false" ${item.active===false?'selected':''}>Sospesa</option></select></div><div class="form-group full"><label class="check-row"><input type="checkbox" name="reorderEnabled" ${item.reorderEnabled?'checked':''}><span><strong>Gestisci automaticamente il riordino di questo farmaco</strong><small>I dati della scorta sono condivisi tra tutte le somministrazioni dello stesso farmaco e dosaggio. Quantità e giorni di assunzione restano invece specifici di ogni riga; il Dossier li somma automaticamente e genera un solo promemoria di riordino.</small></span></label></div><div class="form-group"><label>Richiede ricetta per il riordino</label><select name="requiresPrescription" class="form-control"><option value="true" ${item.requiresPrescription!==false?'selected':''}>Sì, va richiesto al medico</option><option value="false" ${item.requiresPrescription===false?'selected':''}>No, acquistabile senza ricetta</option></select><small class="field-help">I farmaci senza ricetta non entrano nel gruppo “Richiesta farmaci famiglia”: generano un promemoria di acquisto separato.</small></div><div class="form-group"><label>Preavviso riordino</label><div class="therapy-lead-days-control"><input type="number" min="1" max="60" step="1" name="reorderLeadDays" class="form-control" value="${medicationReorderLeadDays(item)}"><span>giorni prima</span></div><small class="field-help">Puoi aumentarlo, ad esempio per acquisti online che richiedono alcuni giorni di consegna.</small></div><div class="form-group"><label>Unità nella confezione</label><input type="number" min="1" step="1" name="packUnits" class="form-control" value="${item.packUnits??''}" placeholder="Es. 20"></div><div class="form-group"><label>Numero confezioni disponibili</label><input type="number" min="1" step="1" name="packCount" class="form-control" value="${item.packCount??1}" placeholder="Es. 4"><small class="field-help">Indica quante confezioni hai complessivamente a disposizione per il ciclo corrente.</small></div><div class="form-group"><label>Unità assunte in questa somministrazione</label><input type="number" min="0.01" step="any" name="dailyUnits" class="form-control" value="${item.dailyUnits??''}" placeholder="Es. 1"><small class="field-help">Indica la quantità assunta in questa singola riga/orario. Se lo stesso farmaco compare in più somministrazioni, il Dossier somma automaticamente le quantità e i relativi giorni di assunzione per calcolare la durata reale della confezione.</small></div>${item.id?`<div class="form-group"><label>Decorrenza modifica del piano</label><input type="date" name="planEffectiveDate" class="form-control"><small class="field-help">Usalo se stai cambiando quantità giornaliera o giorni di assunzione a confezione già iniziata. Se lo lasci vuoto, il nuovo piano decorre da oggi. Il Dossier conserva il consumo precedente e ricalcola la scorta residua.</small></div>`:'<div class="form-group therapy-plan-effective-placeholder" aria-hidden="true"></div>'}<div class="form-group"><label>Data inizio confezione corrente</label><input type="date" name="packStartDate" class="form-control" value="${esc(item.packStartDate||'')}"></div><div class="form-group"><label>Calcolo riordino</label><div class="notice therapy-reorder-calculation" style="margin:0">Avviso previsto <strong>${medicationReorderLeadDays(item)} giorni prima</strong> dell'esaurimento. I farmaci con ricetta possono essere raggruppati secondo Preferenze → Agenda; quelli senza ricetta restano separati.</div></div><div class="form-group full"><label>Note</label><textarea name="notes" class="form-control">${esc(item.notes||'')}</textarea></div>`, 'therapies', item, async v=>{const enriched=globalThis.DossierMedicines?await DossierMedicines.enrich(v):v;const draft={...enriched,schedule:v.time,active:v.active==='true',therapyDays:therapyDaysFromForm(v),reorderEnabled:globalThis.DossierFeatures?.has?.('stockAutomation')?(v.reorderEnabled==='on'):Boolean(item.reorderEnabled),requiresPrescription:globalThis.DossierFeatures?.has?.('stockAutomation')?(v.requiresPrescription!=='false'):(item.requiresPrescription!==false),reorderLeadDays:globalThis.DossierFeatures?.has?.('stockAutomation')?Math.max(1,Math.min(60,Math.round(Number(v.reorderLeadDays||MEDICATION_REORDER_LEAD_DAYS)))):medicationReorderLeadDays(item),packUnits:globalThis.DossierFeatures?.has?.('stockAutomation')?(v.packUnits?Number(v.packUnits):''):(item.packUnits??''),packCount:globalThis.DossierFeatures?.has?.('stockAutomation')?(v.packCount?Math.max(1,Math.floor(Number(v.packCount))):1):(item.packCount??1),dailyUnits:globalThis.DossierFeatures?.has?.('stockAutomation')?(v.dailyUnits?Number(String(v.dailyUnits).replace(',','.')):''):(item.dailyUnits??''),dailyUnitsScope:'per-intake-v3',packStartDate:globalThis.DossierFeatures?.has?.('stockAutomation')?String(v.packStartDate||''):String(item.packStartDate||'')};return prepareTherapyDosePlan(item,draft,v.planEffectiveDate);}); globalThis.DossierMedicines?.bindTherapyForm($('#therapyForm')); const therapyForm=$('#therapyForm');if(therapyForm&&!globalThis.DossierFeatures?.has?.('stockAutomation')){for(const name of ['reorderEnabled','requiresPrescription','reorderLeadDays','packUnits','packCount','dailyUnits','packStartDate','planEffectiveDate']){const el=therapyForm.querySelector(`[name="${name}"]`);if(el)el.disabled=true;}const note=document.createElement('div');note.className='notice warning';note.innerHTML='<strong>Scorte e riordino automatico disponibili dal piano MEDIUM.</strong><br>I dati già registrati restano conservati e non vengono modificati nel piano FREE.';therapyForm.querySelector('.form-grid')?.appendChild(note);}const leadInput=therapyForm?.querySelector('[name="reorderLeadDays"]');const calculation=therapyForm?.querySelector('.therapy-reorder-calculation');if(leadInput&&calculation){const updateLead=()=>{const days=Math.max(1,Math.min(60,Math.round(Number(leadInput.value||MEDICATION_REORDER_LEAD_DAYS))));calculation.innerHTML=`Avviso previsto <strong>${days} giorni prima</strong> dell'esaurimento. I farmaci con ricetta possono essere raggruppati secondo Preferenze → Agenda; quelli senza ricetta restano separati.`;};leadInput.addEventListener('input',updateLead);} }
  function openExemptionModal(item={}) { simpleEntityModal('Esenzione sanitaria','exemptionForm',`
    <div class="form-group"><label>Codice *</label><input name="code" required class="form-control" value="${esc(item.code||'')}"></div><div class="form-group"><label>Decorrenza</label><input type="date" min="${MIN_CLINICAL_DATE}" max="${today()}" name="validFrom" class="form-control" value="${isValidClinicalDate(item.validFrom||'')?item.validFrom:''}"></div><div class="form-group full"><label>Descrizione</label><input name="description" class="form-control" value="${esc(item.description||'')}"></div><div class="form-group"><label>Scadenza o validità</label><input name="expiry" class="form-control" value="${esc(item.expiry||'')}" placeholder="Es. Illimitata"></div><div class="form-group"><label>Ente emittente</label><input name="issuer" class="form-control" value="${esc(item.issuer||'')}"></div><div class="form-group full"><label>Prestazioni / limitazioni</label><textarea name="limitations" class="form-control" placeholder="Inserisci ogni codice o prestazione su una riga distinta">${esc(item.limitations||'')}</textarea></div><div class="form-group full"><label>Note</label><textarea name="notes" class="form-control">${esc(item.notes||'')}</textarea></div>`, 'exemptions', item); }
  function diagnosisContextForText(value=''){
    const t=normalizeClinicalText(value);
    if(/\b(?:assenza di|non evidenza di|negativ[oa] per|esclus[oa]|senza segni di)\b/.test(t))return {category:'Controllo o follow-up',status:'Non rilevata',mainProblem:false};
    if(/\b(?:sospett|possibil|probabil|compatibil|da escludere|borderline)\b/.test(t))return {category:'Sospetto diagnostico',status:'Sospetta',mainProblem:false};
    if(/\b(?:pregress|storia di|risolt|guarit)\b/.test(t))return {category:'Condizione pregressa',status:'Pregressa',mainProblem:false};
    if(/\b(?:in evoluzione|progression|peggiorament)\b/.test(t))return {category:'Problema clinico',status:'In evoluzione',mainProblem:true};
    if(/\b(?:follow up|monitoraggio|controllo|sorveglianza)\b/.test(t))return {category:'Problema clinico',status:'Da monitorare',mainProblem:false};
    if(/\b(?:diagnosi(?: di)?|affetto da|si conferma|confermata|documentata|presenza di|evidenza di|problemi attivi|problemi principali|quadro clinico)\b/.test(t))return {category:'Diagnosi riportata',status:'Riportata',mainProblem:true};
    return {category:'Dato da verificare',status:'Da verificare',mainProblem:false};
  }
  function plausibleDiagnosisPhrase(value=''){
    const clean=cleanDiagnosisName(value);const n=normalizeClinicalText(clean);
    if(isNonDiagnosticDiagnosis(clean)||clean.length>260)return false;
    if(/^(?:si consiglia|si raccomanda|proseguire|continuare|eseguire|ripetere|terapia|farmaco|dosaggio|firma|medico|data|codice|telefono|indirizzo)\b/.test(n))return false;
    if(/^\d+(?:[.,]\d+)?(?:\s*[a-z/%]+)?$/.test(n))return false;
    return (clean.match(/[A-Za-zÀ-ÿ]/g)||[]).length>=4;
  }
  function splitDiagnosisPhrases(value=''){
    return String(value||'').split(/\s*;\s*|\s+[•]\s+|\s+\|\s+/).map(cleanDiagnosisName).filter(plausibleDiagnosisPhrase);
  }
  function genericDiagnosisCandidatesFromDocument(doc={}){
    const full=[doc.extractedText,doc.structuredText,doc.reconstructedText,(doc.reportSections||[]).map(x=>`${x.title||''}\n${x.text||''}`).join('\n')].filter(Boolean).join('\n');
    const lines=full.split(/\r?\n+/).map(x=>String(x||'').replace(/\s+/g,' ').trim()).filter(x=>x.length>=4);
    const rows=[];const seen=new Set();let section='';
    const add=(name,quote,context='')=>{name=cleanDiagnosisName(name);if(!plausibleDiagnosisPhrase(name))return;const ctx=diagnosisContextForText(`${context} ${quote}`);const key=`${diagnosisCanonicalKey(name)}|${normalizeClinicalText(quote)}`;if(!key||seen.has(key))return;seen.add(key);rows.push({name,date:doc.clinicalDate||'',category:ctx.category,status:ctx.status,mainProblem:ctx.mainProblem,notes:quote,sourceQuote:quote,facility:doc.facility||'',specialization:doc.specialization||doc.department||'',sourceDocumentId:doc.id,sourceTitle:doc.title||doc.originalName||'Referto'});};
    for(const line of lines){
      const heading=line.match(/^(diagnosi(?:\s*\/\s*sospetto diagnostico)?|problemi? (?:attivi|principali)|quadro clinico|condizioni cliniche|patologie|conclusioni?)\s*[:\-]?\s*(.*)$/i);
      if(heading){section=normalizeClinicalText(heading[1]);for(const p of splitDiagnosisPhrases(heading[2]||''))add(p,line,section);if(heading[2])section='';continue;}
      if(section){if(/^[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÿ ]{2,40}:$/.test(line)){section='';continue;}for(const p of splitDiagnosisPhrases(line))add(p,line,section);if(!/^(?:[-•]|\d+[.)])/.test(line))section='';continue;}
      const explicit=line.match(/\b(?:diagnosi\s+di|affett[oa]\s+da|si\s+conferma|documentat[oa]|nota\s+per|in\s+follow[- ]?up\s+per|quadro\s+compatibile\s+con|presenza\s+di|evidenza\s+di)\s+(.{4,220})/i);
      if(explicit){for(const p of splitDiagnosisPhrases(explicit[1]))add(p,line,'frase clinica esplicita');}
    }
    return rows;
  }
  function levenshteinDistance(a='',b=''){
    a=normalizeClinicalText(a);b=normalizeClinicalText(b);if(a===b)return 0;if(!a)return b.length;if(!b)return a.length;
    const prev=Array.from({length:b.length+1},(_,i)=>i),curr=new Array(b.length+1);
    for(let i=1;i<=a.length;i++){curr[0]=i;for(let j=1;j<=b.length;j++)curr[j]=Math.min(curr[j-1]+1,prev[j]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));for(let j=0;j<=b.length;j++)prev[j]=curr[j];}
    return prev[b.length];
  }
  function documentClinicalText(doc={}){
    return [doc.title,doc.originalName,doc.extractedText,doc.structuredText,doc.reconstructedText,(doc.reportSections||[]).map(x=>`${x.title||''}\n${x.text||''}`).join('\n')].filter(Boolean).join('\n');
  }
  function lineMatchesDiagnosisQuery(line='',query='',mode='exact'){
    const nl=normalizeClinicalText(line),nq=normalizeClinicalText(query);if(!nl||!nq)return false;if(nl.includes(nq))return true;if(mode!=='variants')return false;
    const queryTokens=nq.split(/\s+/).filter(x=>x.length>=4),lineTokens=nl.split(/\s+/).filter(x=>x.length>=4);
    return queryTokens.every(q=>lineTokens.some(w=>w.startsWith(q.slice(0,Math.max(4,q.length-2)))||q.startsWith(w.slice(0,Math.max(4,w.length-2)))||levenshteinDistance(w,q)<=Math.max(1,Math.floor(q.length/5))));
  }
  function searchDiagnosisEvidence(query='',mode='exact',documents=state.documents){
    const terms=String(query||'').split(',').map(x=>x.trim()).filter(Boolean);if(!terms.length)return[];const results=[];
    for(const doc of documents){const lines=documentClinicalText(doc).split(/\r?\n+|(?<=[.;])\s+/).map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean);const matches=[],matchKeys=new Set();
      for(const line of lines){const lineKey=normalizeClinicalText(line);if(terms.some(term=>lineMatchesDiagnosisQuery(line,term,mode))&&!matchKeys.has(lineKey)){matchKeys.add(lineKey);matches.push(line);}if(matches.length>=6)break;}
      if(matches.length)results.push({documentId:doc.id,date:doc.clinicalDate||'',title:doc.title||doc.originalName||'Documento',kind:doc.documentKind||doc.category||'',facility:doc.facility||'',snippets:matches});
    }
    return results.sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))||a.title.localeCompare(b.title,'it'));
  }
  function diagnosisDestinationOptions(selectedId=''){
    return [...state.diagnoses].sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'it')).map(d=>`<option value="${esc(d.id)}" ${d.id===selectedId?'selected':''}>${esc(d.name)}</option>`).join('');
  }
  function openDiagnosisDocumentSearch(){
    const query=$('#diagnosisSearchTerm')?.value?.trim()||'';const mode=$('#diagnosisSearchMode')?.value||'exact';if(!query){toast('Inserisci un termine da cercare');return;}
    const results=searchDiagnosisEvidence(query,mode);if(!results.length){toast('Nessun documento contiene il termine cercato');return;}
    const hasDiagnoses=state.diagnoses.length>0;const existingMatch=state.diagnoses.find(d=>String(query).split(',').some(term=>lineMatchesDiagnosisQuery(d.name||'',term.trim(),'variants')))||null;const defaultCreate=!existingMatch;
    openModal('Ricerca clinica nei documenti',`${results.length} documento/i trovato/i. Lo stesso referto può essere collegato a più condizioni.`,`<form id="diagnosisSearchForm" class="diagnosis-search-workspace"><div class="notice">Seleziona i documenti pertinenti. Il file originale resta unico e può essere collegato anche ad altre condizioni in ricerche successive.</div><div class="diagnosis-search-results">${results.map((r,i)=>`<article class="diagnosis-evidence-card" data-evidence-row="${i}"><label class="check-row"><input type="checkbox" data-field="selected"><span><strong>${esc(r.title)}</strong><small>${r.date?formatDate(r.date)+' · ':''}${esc(r.kind||'Documento sanitario')}${r.facility?' · '+esc(r.facility):''}</small></span></label><div class="diagnosis-evidence-snippets">${r.snippets.map(s=>`<blockquote>${esc(s)}</blockquote>`).join('')}</div><button type="button" class="btn btn-light btn-small" data-open-search-document="${esc(r.documentId)}">Apri documento</button></article>`).join('')}</div><section class="diagnosis-link-panel"><div class="form-grid"><div class="form-group"><label>Azione</label><select id="diagnosisSearchAction" class="form-control">${hasDiagnoses?`<option value="link" ${defaultCreate?'':'selected'}>Collega a una condizione esistente</option>`:''}<option value="create" ${defaultCreate?'selected':''}>Crea una nuova condizione</option></select></div><div class="form-group" id="diagnosisSearchTargetGroup" ${defaultCreate?'hidden':''}><label>Condizione di destinazione</label><select id="diagnosisSearchTarget" class="form-control">${diagnosisDestinationOptions(existingMatch?.id||'')}</select></div><div class="form-group" id="diagnosisSearchNameGroup" ${defaultCreate?'':'hidden'}><label>Nome della nuova condizione</label><input id="diagnosisSearchName" class="form-control" value="${esc(query)}"></div><div class="form-group"><label>Categoria</label><select id="diagnosisSearchCategory" class="form-control">${DIAGNOSIS_CATEGORIES.map(x=>`<option ${x==='Dato da verificare'?'selected':''}>${x}</option>`).join('')}</select></div><div class="form-group"><label>Stato</label><select id="diagnosisSearchStatus" class="form-control">${DIAGNOSIS_STATUSES.map(x=>`<option ${x==='Da verificare'?'selected':''}>${x}</option>`).join('')}</select></div><label class="check-row form-group"><input id="diagnosisSearchMain" type="checkbox"><span><strong>Problema principale</strong><small>Inserisce la condizione nel quadro clinico principale.</small></span></label></div></section><div class="form-actions sticky-actions"><button type="button" class="btn btn-light" id="cancelDiagnosisSearchBtn">Annulla</button><button class="btn btn-primary">Collega i documenti selezionati</button></div></form>`);
    $('#modal').classList.add('modal-diagnosis-workspace');$('#cancelDiagnosisSearchBtn').onclick=closeModal;
    $$('[data-open-search-document]').forEach(b=>b.onclick=()=>viewDocument(b.dataset.openSearchDocument));
    const toggle=()=>{const create=$('#diagnosisSearchAction').value==='create';$('#diagnosisSearchTargetGroup').classList.toggle('hidden',create);$('#diagnosisSearchNameGroup').classList.toggle('hidden',!create);};$('#diagnosisSearchAction').onchange=toggle;toggle();
    $('#diagnosisSearchForm').onsubmit=async e=>{e.preventDefault();const selected=$$('[data-evidence-row]',e.target).filter(x=>x.querySelector('[data-field="selected"]').checked).map(x=>results[Number(x.dataset.evidenceRow)]);if(!selected.length){toast('Seleziona almeno un documento');return;}
      const action=$('#diagnosisSearchAction').value,category=$('#diagnosisSearchCategory').value,status=$('#diagnosisSearchStatus').value,mainProblem=$('#diagnosisSearchMain').checked;let target=null;
      if(action==='link'){target=state.diagnoses.find(x=>x.id===$('#diagnosisSearchTarget').value);if(!target){toast('Scegli una condizione di destinazione');return;}}
      else{const name=$('#diagnosisSearchName').value.trim();if(!name){toast('Inserisci il nome della nuova condizione');return;}const first=selected[0];target=normalizedDiagnosis({id:uid('diagnosis'),profileId:state.activeProfileId,name,date:first.date,category,status,mainProblem,notes:first.snippets.join('\n'),sourceQuote:first.snippets.join('\n'),sourceDocumentId:first.documentId,sourceTitle:first.title,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});if(!target){toast('Il nome inserito non descrive una condizione valida');return;}await DossierDB.put('diagnoses',target);selected.shift();}
      let linked=0;for(const evidence of selected){await linkDiagnosisUpdate(target,{name:target.name,date:evidence.date,category,status,mainProblem,notes:evidence.snippets.join('\n'),sourceQuote:evidence.snippets.join('\n'),sourceDocumentId:evidence.documentId,sourceTitle:evidence.title,facility:evidence.facility||''});target=await DossierDB.get('diagnoses',target.id)||target;linked++;}
      closeModal();await loadProfileData();renderDiagnoses();toast(`${linked+(action==='create'?1:0)} documento/i collegato/i a “${target.name}”`);
    };
  }

  async function proposeDiagnosesFromDocuments() {
    state.diagnoses=await repairDiagnosesForProfile(state.activeProfileId,state.diagnoses);
    const candidates=[];const seen=new Set();
    for(const doc of state.documents){
      const combined=[...(doc.extractedDiagnoses||[]),...genericDiagnosisCandidatesFromDocument(doc)];
      for(const raw of combined){
        const normalized=normalizedDiagnosis({...raw,date:raw.date||doc.clinicalDate||'',facility:raw.facility||doc.facility||'',specialization:raw.specialization||doc.specialization||'',sourceDocumentId:doc.id,sourceTitle:doc.title||doc.originalName||'Referto'});
        if(!normalized)continue;const key=`${normalized.canonicalKey}|${normalized.date||''}|${doc.id}`;if(seen.has(key))continue;seen.add(key);
        const match=findEquivalentDiagnosis(normalized);candidates.push({...normalized,sourceTitle:doc.title||doc.originalName||'Referto',action:match?'link':'create',targetId:match?.id||'',matchName:match?.name||'',mainProblem:normalized.mainProblem||isClinicallyRelevantDiagnosis(normalized)});
      }
    }
    if(!candidates.length){toast('Nessuna nuova condizione clinica valida trovata nei referti già analizzati');return;}
    const categoryOptions=d=>DIAGNOSIS_CATEGORIES.map(x=>`<option ${d.category===x?'selected':''}>${x}</option>`).join('');
    const statusOptions=d=>DIAGNOSIS_STATUSES.map(x=>`<option ${d.status===x?'selected':''}>${x}</option>`).join('');
    openModal('Proposte da referti specialistici','Scegli chiaramente la destinazione di ogni proposta.',`<form id="diagnosisProposalForm" class="diagnosis-proposal-workspace"><div class="notice warning">Ogni referto può alimentare più condizioni. Per ogni proposta scegli se collegarla a una condizione esistente, crearne una nuova oppure ignorarla.</div><div class="diagnosis-proposal-list">${candidates.map((d,i)=>`<article class="diagnosis-proposal-card" data-proposal-row="${i}"><header><div><strong>${esc(d.name)}</strong><small>${d.date?formatDate(d.date)+' · ':''}${esc(d.sourceTitle)}</small></div><span class="badge">Proposta ${i+1}</span></header><div class="form-grid"><div class="form-group"><label>Azione</label><select class="form-control" data-field="action"><option value="link" ${d.targetId?'selected':''} ${state.diagnoses.length?'':'disabled'}>Collega come aggiornamento</option><option value="create" ${d.targetId?'':'selected'}>Crea nuova condizione distinta</option><option value="ignore">Ignora</option></select></div><div class="form-group proposal-target-group" ${d.targetId?'':'hidden'}><label>Collega alla condizione</label><select class="form-control" data-field="targetId"><option value="">Scegli la condizione...</option>${diagnosisDestinationOptions(d.targetId)}</select></div><div class="form-group"><label>Data</label><input type="date" class="form-control" data-field="date" value="${isValidClinicalDate(d.date||'')?d.date:''}"></div><div class="form-group full"><label>Condizione / problema</label><input class="form-control" data-field="name" value="${esc(d.name)}"></div><div class="form-group"><label>Categoria</label><select class="form-control" data-field="category">${categoryOptions(d)}</select></div><div class="form-group"><label>Stato</label><select class="form-control" data-field="status">${statusOptions(d)}</select></div><label class="check-row form-group"><input type="checkbox" data-field="mainProblem" ${d.mainProblem?'checked':''}><span><strong>Problema principale</strong></span></label><div class="form-group full"><label>Frase o nota proveniente dal referto</label><textarea class="form-control compact-textarea" data-field="notes">${esc(d.notes||d.sourceQuote||'')}</textarea></div></div></article>`).join('')}</div><div class="form-actions sticky-actions"><button type="button" class="btn btn-light" id="cancelProposalBtn">Annulla</button><button class="btn btn-primary">Applica le scelte</button></div></form>`);
    $('#modal').classList.add('modal-diagnosis-workspace');$('#cancelProposalBtn').onclick=closeModal;
    $$('[data-proposal-row]').forEach(card=>{const action=card.querySelector('[data-field="action"]'),group=card.querySelector('.proposal-target-group');const sync=()=>group.classList.toggle('hidden',action.value!=='link');action.onchange=sync;sync();});
    $('#diagnosisProposalForm').onsubmit=async e=>{e.preventDefault();let linked=0,created=0,ignored=0;
      for(const card of $$('[data-proposal-row]',e.target)){const i=Number(card.dataset.proposalRow);const d={...candidates[i]};const get=f=>card.querySelector(`[data-field="${f}"]`);d.action=get('action').value;d.targetId=get('targetId')?.value||'';d.date=get('date').value;d.name=get('name').value.trim();d.notes=get('notes').value.trim();d.category=get('category').value;d.status=get('status').value;d.mainProblem=get('mainProblem').checked;
        if(d.action==='ignore'||!d.name){ignored++;continue;}
        if(d.action==='link'){const existing=state.diagnoses.find(x=>x.id===d.targetId);if(!existing){toast(`Scegli la condizione di destinazione per “${d.name}”`);return;}await linkDiagnosisUpdate(existing,d);linked++;continue;}
        const row=normalizedDiagnosis({...d,id:uid('diagnosis'),profileId:state.activeProfileId,forceDistinct:true,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});if(row){await DossierDB.put('diagnoses',row);created++;}
      }
      closeModal();await loadProfileData();renderDiagnoses();toast(`${linked} aggiornamento/i collegato/i · ${created} nuova/e condizione/i · ${ignored} ignorata/e`);
    };
  }

  function openDiagnosisModal(item={}) { simpleEntityModal('Diagnosi o problema clinico','diagnosisForm',`
    <div class="form-group full"><label>Condizione o problema *</label><input name="name" required class="form-control" value="${esc(item.name||'')}"></div>
    <div class="form-group"><label>Data</label><input type="date" min="${MIN_CLINICAL_DATE}" max="${today()}" name="date" class="form-control" value="${isValidClinicalDate(item.date||'')?item.date:''}"></div>
    <div class="form-group"><label>Categoria</label><select name="category" class="form-control">${DIAGNOSIS_CATEGORIES.map(x=>`<option ${item.category===x?'selected':''}>${x}</option>`).join('')}</select></div>
    <div class="form-group"><label>Stato</label><select name="status" class="form-control">${DIAGNOSIS_STATUSES.map(x=>`<option ${item.status===x?'selected':''}>${x}</option>`).join('')}</select></div>
    <label class="check-row form-group"><input type="checkbox" name="mainProblem" ${item.mainProblem?'checked':''}><span><strong>Problema principale</strong><small>Mostra questa voce anche nella versione estesa del dossier.</small></span></label>
    <div class="form-group"><label>Specializzazione</label><input name="specialization" class="form-control" value="${esc(item.specialization||'')}"></div>
    <div class="form-group"><label>Struttura</label><input name="facility" class="form-control" value="${esc(item.facility||'')}"></div>
    <div class="form-group full"><label>Quadro attuale sintetico</label><textarea name="summary" class="form-control" placeholder="Stato attuale, valori recenti, andamento e monitoraggio">${esc(item.summary||'')}</textarea></div>
    <div class="form-group full"><label>Note storiche</label><textarea name="notes" class="form-control">${esc(item.notes||'')}</textarea></div>
    ${item.sourceQuote?`<div class="form-group full"><label>Frase originale del referto</label><div class="source-quote">${esc(item.sourceQuote)}</div></div>`:''}
    `, 'diagnoses', item, v=>({...v,mainProblem:v.mainProblem==='on'})); }
  function simpleEntityModal(title, formId, fields, store, item={}, transform=v=>v) {
    openModal(title,'I dati resteranno associati al profilo attivo.',`<form id="${formId}" class="form-grid">${fields}<div class="form-actions"><button type="button" class="btn btn-light" id="cancelModalBtn">Annulla</button><button class="btn btn-primary">Salva</button></div></form>`);
    $('#cancelModalBtn').onclick=closeModal;
    $(`#${formId}`).onsubmit=async e=>{e.preventDefault();let data=await transform(Object.fromEntries(new FormData(e.target)));let saved={...item,...data,id:item.id||uid(store.slice(0,-1)),profileId:state.activeProfileId,createdAt:item.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};await DossierDB.put(store,saved);if(store==='therapies'){if(String(saved.manufacturer||'').trim())await propagateTherapyManufacturer(saved);saved=await synchronizeMedicationStockSettings(saved,{preferSaved:Boolean(item.id)});}closeModal();await loadProfileData();renderView();toast('Dati salvati');};
  }
  async function deleteEntity(store,id,type) { if (!confirm('Eliminare questo elemento?')) return; await DossierDB.del(store,id); await loadProfileData(); renderView(); toast('Elemento eliminato'); }

  async function resetTestData() {
    const answer=prompt('Per cancellare tutti i dati di prova salvati nel browser, scrivi AZZERA');
    if (answer!=='AZZERA') {toast('Azzeramento annullato');return;}
    for (const store of ['documents','doctors','therapies','exemptions','diagnoses','measurements','weightJourneys','documentVersions','calendarEvents','calendarSuggestions','vaccinations','interventions','symptoms','therapyAdherence','carePlans','dicomStudies','profiles','settings','handles','users','auditLog','trash','cloudSettings','syncQueue']) await DossierDB.clear(store);
    localStorage.removeItem('lastBackupAt');localStorage.removeItem('backupFrequency');
    state.archiveHandle=null;state.activeProfileId=null;await loadAll();render();toast('Dati di prova cancellati dal browser');
  }

  async function connectArchiveFolder() {
    if (!window.showDirectoryPicker) { toast('Questa funzione richiede Chrome o Edge avviati da localhost'); return; }
    try { state.archiveHandle=await window.showDirectoryPicker({mode:'readwrite'}); await DossierDB.put('handles',{key:'archiveRoot',handle:state.archiveHandle}); await syncAllToFolder(true); renderView(); }
    catch(e) { if (e.name!=='AbortError') toast('Impossibile collegare la cartella'); }
  }

  async function restoreArchiveHandle() {
    const saved=await DossierDB.get('handles','archiveRoot'); if (!saved?.handle) return;
    try { const perm=await saved.handle.queryPermission({mode:'readwrite'}); if (perm==='granted') state.archiveHandle=saved.handle; } catch {}
  }

  async function ensureDir(parent,name) { return parent.getDirectoryHandle(name,{create:true}); }
  async function writeFile(dir,name,data) { const fh=await dir.getFileHandle(name,{create:true}); const w=await fh.createWritable(); await w.write(data); await w.close(); }
  async function fileHash(blob) { const buf=await blob.arrayBuffer(); const hash=await crypto.subtle.digest('SHA-256',buf); return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join(''); }

  async function removeRelativeEntry(root,relativePath='') {
    const parts=String(relativePath).split('/').filter(Boolean);if(!parts.length)return;
    let dir=root;for(const part of parts.slice(0,-1)){dir=await dir.getDirectoryHandle(part);}await dir.removeEntry(parts.at(-1));
  }
  async function deleteSyncedDocument(doc) {
    if(!state.archiveHandle)return;let relative=doc.syncedRelativePath||'';
    if(!relative&&doc.syncedPath){const p=state.profiles.find(x=>x.id===doc.profileId);if(p){const folder=`${slug(p.firstName+'_'+p.lastName)}_${p.id.slice(-8)}`;const date=doc.clinicalDate||'';relative=/^\d{4}-\d{2}-\d{2}$/.test(date)?`profili/${folder}/documenti/${date.slice(0,4)}/${date.slice(5,7)}/${doc.syncedPath}`:`profili/${folder}/documenti/data_sconosciuta/${doc.syncedPath}`;}}
    if(relative)await removeRelativeEntry(state.archiveHandle,relative);
  }

  async function syncDocumentToFolder(doc) {
    if (!state.archiveHandle) return;
    const profilesDir=await ensureDir(state.archiveHandle,'profili'); const p=state.profiles.find(x=>x.id===doc.profileId); if (!p) return;
    const profileFolder=`${slug(p.firstName+'_'+p.lastName)}_${p.id.slice(-8)}`;
    const profileDir=await ensureDir(profilesDir,profileFolder);
    const docsDir=await ensureDir(profileDir,'documenti'); const date=doc.clinicalDate||'data_sconosciuta';
    let target=docsDir,relativeParts=['profili',profileFolder,'documenti'];
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {target=await ensureDir(await ensureDir(docsDir,date.slice(0,4)),date.slice(5,7));relativeParts.push(date.slice(0,4),date.slice(5,7));}
    else {target=await ensureDir(docsDir,'data_sconosciuta');relativeParts.push('data_sconosciuta');}
    const hash=await fileHash(doc.fileBlob); const safeName=`${doc.clinicalDate||'senza_data'}_${slug(doc.title)}_${doc.id.slice(-6)}.${(doc.originalName.split('.').pop()||'dat').replace(/[^a-z0-9]/gi,'')}`;
    const relativePath=[...relativeParts,safeName].join('/');
    if (doc.syncedHash!==hash || doc.syncedRelativePath!==relativePath) {
      if(doc.syncedRelativePath&&doc.syncedRelativePath!==relativePath) await removeRelativeEntry(state.archiveHandle,doc.syncedRelativePath).catch(()=>{});
      await writeFile(target,safeName,doc.fileBlob);
      doc.syncedHash=hash; doc.syncedPath=safeName; doc.syncedRelativePath=relativePath; doc.syncedAt=new Date().toISOString(); await DossierDB.put('documents',doc);
    }
  }

  async function syncAllToFolder(showMessage=false) {
    if (!state.archiveHandle) return;
    if(folderSyncPromise){if(showMessage)toast('Sincronizzazione della cartella già in corso. Attendi il completamento.');return folderSyncPromise;}
    const buttons=()=>$$('[data-action="sync-folder"]');
    const task=(async()=>{
      buttons().forEach(b=>{b.disabled=true;b.setAttribute('aria-busy','true');});
      try {
        const perm=await state.archiveHandle.requestPermission({mode:'readwrite'}); if (perm!=='granted') throw new Error('Permesso negato');
        const profilesDir=await ensureDir(state.archiveHandle,'profili');
        for (const p of state.profiles) {
          const profileDir=await ensureDir(profilesDir,`${slug(p.firstName+'_'+p.lastName)}_${p.id.slice(-8)}`);
          const docs=await DossierDB.byProfile('documents',p.id); const doctors=await DossierDB.byProfile('doctors',p.id); const therapies=await DossierDB.byProfile('therapies',p.id); const exemptions=await DossierDB.byProfile('exemptions',p.id); const diagnoses=await DossierDB.byProfile('diagnoses',p.id); const measurements=await DossierDB.byProfile('measurements',p.id); const journeys=await DossierDB.byProfile('weightJourneys',p.id); const versions=await DossierDB.byProfile('documentVersions',p.id); const calendarEvents=await DossierDB.byProfile('calendarEvents',p.id); const calendarSuggestions=await DossierDB.byProfile('calendarSuggestions',p.id); const vaccinations=await DossierDB.byProfile('vaccinations',p.id); const interventions=await DossierDB.byProfile('interventions',p.id); const symptoms=await DossierDB.byProfile('symptoms',p.id); const therapyAdherence=await DossierDB.byProfile('therapyAdherence',p.id); const carePlans=await DossierDB.byProfile('carePlans',p.id);
          const {healthCardFrontBlob,healthCardBackBlob,...profileMeta}=p;await writeFile(profileDir,'profilo.json',JSON.stringify(profileMeta,null,2));if(healthCardFrontBlob||healthCardBackBlob){const cardDir=await ensureDir(profileDir,'tessera_sanitaria');if(healthCardFrontBlob)await writeFile(cardDir,p.healthCardFrontName||'fronte.jpg',healthCardFrontBlob);if(healthCardBackBlob)await writeFile(cardDir,p.healthCardBackName||'retro.jpg',healthCardBackBlob);}
          await writeFile(profileDir,'indice_documenti.json',JSON.stringify(docs.map(({fileBlob,...d})=>d),null,2));
          await writeFile(profileDir,'medici.json',JSON.stringify(doctors,null,2));
          await writeFile(profileDir,'terapie.json',JSON.stringify(therapies,null,2));
          await writeFile(profileDir,'esenzioni.json',JSON.stringify(exemptions,null,2));
          await writeFile(profileDir,'diagnosi.json',JSON.stringify(diagnoses,null,2));
          await writeFile(profileDir,'misurazioni.json',JSON.stringify(measurements,null,2));
          await writeFile(profileDir,'percorsi_peso.json',JSON.stringify(journeys,null,2));
          await writeFile(profileDir,'versioni_documenti.json',JSON.stringify(versions,null,2));
          await writeFile(profileDir,'agenda.json',JSON.stringify(calendarEvents,null,2));
          await writeFile(profileDir,'richiami_calendario.json',JSON.stringify(calendarSuggestions,null,2));
          await writeFile(profileDir,'vaccinazioni.json',JSON.stringify(vaccinations,null,2));
          await writeFile(profileDir,'interventi_dispositivi.json',JSON.stringify(interventions,null,2));
          await writeFile(profileDir,'diario_sintomi.json',JSON.stringify(symptoms,null,2));
          await writeFile(profileDir,'aderenza_terapie.json',JSON.stringify(therapyAdherence,null,2));
          await writeFile(profileDir,'percorsi_cura.json',JSON.stringify(carePlans,null,2));
          for (const doc of docs) await syncDocumentToFolder(doc);
        }
        const manifest={app:'Dossier Sanitario Locale',version:'5.0.0',updatedAt:new Date().toISOString(),profiles:state.profiles.length,documents:(await DossierDB.getAll('documents')).length};
        await writeFile(state.archiveHandle,'preferenze.json',JSON.stringify({globalPreferences:state.globalPreferences},null,2));
        await writeFile(state.archiveHandle,'manifest.json',JSON.stringify(manifest,null,2));
        localStorage.setItem('lastBackupAt',new Date().toISOString());
        if (showMessage) toast('Archivio fisico sincronizzato');
        if (state.activeView==='backup'||state.activeView==='dashboard') renderView();
      } catch(e) { toast(`Backup non completato: ${e.message}`); }
      finally{buttons().forEach(b=>{b.disabled=false;b.setAttribute('aria-busy','false');});}
    })();
    folderSyncPromise=task;try{return await task;}finally{folderSyncPromise=null;}
  }

  async function backupBytes(value){
    if(value instanceof Uint8Array)return value;
    if(value instanceof ArrayBuffer)return new Uint8Array(value);
    if(ArrayBuffer.isView(value))return new Uint8Array(value.buffer,value.byteOffset,value.byteLength);
    if(value instanceof Blob)return new Uint8Array(await value.arrayBuffer());
    return new TextEncoder().encode(String(value??''));
  }
  async function backupHash(value){const bytes=await backupBytes(value);const digest=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');}
  async function addBackupEntry(zip,entries,path,data,meta={}){const bytes=await backupBytes(data);zip.file(path,bytes);entries.push({path,size:bytes.byteLength,sha256:await backupHash(bytes),required:meta.required!==false,kind:meta.kind||'data',profileId:meta.profileId||''});return bytes.byteLength;}
  const backupJson=value=>JSON.stringify(value,null,2);
  function cleanComparable(value){
    if(Array.isArray(value))return value.map(cleanComparable);
    if(value&&typeof value==='object'&&!(value instanceof Blob)){const out={};for(const key of Object.keys(value).sort()){if(key==='_syncMeta'||key==='fileBlob'||key==='avatarBlob'||key==='healthCardFrontBlob'||key==='healthCardBackBlob')continue;out[key]=cleanComparable(value[key]);}return out;}
    return value;
  }
  function sameMetadata(a,b){return JSON.stringify(cleanComparable(a))===JSON.stringify(cleanComparable(b));}
  async function sameBlob(a,b){if(!(a instanceof Blob)||!(b instanceof Blob))return !a&&!b;return a.size===b.size&&(await backupHash(a))===(await backupHash(b));}
  async function sameRecord(a,b){if(!a||!b||!sameMetadata(a,b))return false;for(const key of ['fileBlob','avatarBlob','healthCardFrontBlob','healthCardBackBlob'])if(key in a||key in b)if(!await sameBlob(a?.[key],b?.[key]))return false;const an=a?.payload?.document?.fileBlob,bn=b?.payload?.document?.fileBlob;if(an||bn)if(!await sameBlob(an,bn))return false;return true;}
  function profileFolderName(p){return `${slug(p.firstName+'_'+p.lastName)}_${p.id.slice(-8)}`;}
  function arrayOrEmpty(value){return Array.isArray(value)?value:[];}

  async function verifyBackupBlob(blob){
    const report={found:0,imported:0,skipped:0,duplicates:0,missing:[],corrupt:[],unassociated:[],legacy:false,message:''};
    let zip,manifest={};
    try{zip=await JSZip.loadAsync(blob,{checkCRC32:true});}catch(error){report.corrupt.push(`Archivio ZIP: ${error.message}`);report.message='Il file ZIP è corrotto o incompleto.';return{ok:false,manifest,report,zip:null};}
    try{const mf=zip.file('manifest.json');if(!mf)throw new Error('manifest.json mancante');manifest=JSON.parse(await mf.async('string'));}catch(error){report.missing.push('manifest.json');report.message=`Manifest non leggibile: ${error.message}`;return{ok:false,manifest,report,zip};}
    if(manifest.app&&manifest.app!=='Dossier Sanitario Locale'){report.corrupt.push('Applicazione non riconosciuta');report.message='Il file non appartiene al Dossier Sanitario Locale.';return{ok:false,manifest,report,zip};}
    const entries=arrayOrEmpty(manifest.entries);report.legacy=!entries.length||Number(manifest.formatVersion||0)<6;
    if(entries.length){
      for(const entry of entries){const file=zip.file(entry.path);if(!file){if(entry.required!==false)report.missing.push(entry.path);continue;}try{const bytes=await file.async('uint8array');report.found++;if(Number(entry.size)!==bytes.byteLength)report.corrupt.push(`${entry.path}: dimensione non corrispondente`);else if(entry.sha256&&(await backupHash(bytes))!==entry.sha256)report.corrupt.push(`${entry.path}: impronta SHA-256 non corrispondente`);}catch(error){report.corrupt.push(`${entry.path}: ${error.message}`);}}
    }else{
      report.found=Object.keys(zip.files).filter(name=>!zip.files[name].dir).length;
    }
    const profileFiles=Object.keys(zip.files).filter(name=>/profili\/[^/]+\/profilo\.json$/.test(name));
    const profileIds=new Set();let documentCount=0;
    for(const path of profileFiles){
      const base=path.replace(/profilo\.json$/,'');
      try{const profile=JSON.parse(await zip.file(path).async('string'));if(!profile?.id){report.corrupt.push(`${path}: id profilo mancante`);continue;}profileIds.add(profile.id);
        const indexFile=zip.file(base+'indice_documenti.json');if(!indexFile){report.missing.push(base+'indice_documenti.json');continue;}
        const docs=arrayOrEmpty(JSON.parse(await indexFile.async('string')));documentCount+=docs.length;
        for(const doc of docs){if(doc.profileId&&doc.profileId!==profile.id)report.unassociated.push(`${base}indice_documenti.json:${doc.id}`);const filePath=Object.keys(zip.files).find(name=>name.startsWith(base+'documenti/'+doc.id+'__')&&!zip.files[name].dir);if(!filePath)report.missing.push(`${base}documenti/${doc.id}__${doc.originalName||''}`);}
        for(const jsonName of ['medici.json','terapie.json','esenzioni.json','diagnosi.json','misurazioni.json','percorsi_peso.json','versioni_documenti.json','agenda.json','richiami_calendario.json','vaccinazioni.json','interventi_dispositivi.json','diario_sintomi.json']){const jf=zip.file(base+jsonName);if(!jf)continue;const rows=arrayOrEmpty(JSON.parse(await jf.async('string')));for(const row of rows)if(row.profileId&&row.profileId!==profile.id)report.unassociated.push(`${base}${jsonName}:${row.id||'record'}`);}
      }catch(error){report.corrupt.push(`${path}: ${error.message}`);}
    }
    if(Number(manifest.counts?.profiles??manifest.profiles??profileFiles.length)!==profileFiles.length)report.corrupt.push('Conteggio profili non corrispondente');
    if(Number(manifest.counts?.documents??manifest.documents??documentCount)!==documentCount)report.corrupt.push('Conteggio documenti non corrispondente');
    report.message=report.missing.length||report.corrupt.length?'Verifica non superata: il database non è stato modificato.':'Backup verificato fisicamente: file, conteggi e impronte coerenti.';
    return{ok:report.missing.length===0&&report.corrupt.length===0,manifest,report,zip};
  }

  function migrationPasswordDialog(){
    return new Promise(resolve=>{
      openModal('Esporta il mio profilo','Crea una password personale per proteggere il pacchetto di migrazione.',`<div class="notice"><strong>Il pacchetto conterrà soltanto il tuo profilo sanitario.</strong><br>La password di migrazione non viene salvata nel Dossier. Annotala: servirà per importare e verificare il pacchetto nel nuovo Dossier.</div><form id="migrationPasswordForm" class="security-form"><label>Password di migrazione<input class="form-control" type="password" name="password" minlength="12" required autocomplete="new-password"></label><label>Ripeti password<input class="form-control" type="password" name="confirm" minlength="12" required autocomplete="new-password"></label><div id="migrationPasswordError" class="notice danger hidden"></div><div class="form-actions"><button type="button" class="btn btn-light" id="cancelMigrationPassword">Annulla</button><button type="submit" class="btn btn-primary">Crea pacchetto cifrato</button></div></form>`);
      $('#cancelMigrationPassword').onclick=()=>{closeModal();resolve('');};
      $('#migrationPasswordForm').onsubmit=e=>{e.preventDefault();const fd=new FormData(e.currentTarget),pw=String(fd.get('password')||''),confirmPw=String(fd.get('confirm')||''),err=$('#migrationPasswordError');if(pw.length<12){err.textContent='La password di migrazione deve contenere almeno 12 caratteri.';err.classList.remove('hidden');return;}if(pw!==confirmPw){err.textContent='Le password non coincidono.';err.classList.remove('hidden');return;}closeModal();resolve(pw);};
    });
  }

  function migrationImportPasswordDialog(){
    return new Promise(resolve=>{
      openModal('Importa profilo migrato','Inserisci la password scelta dal titolare durante l’esportazione.',`<div class="notice"><strong>Il pacchetto verrà decifrato e verificato prima di modificare il nuovo Dossier.</strong></div><form id="migrationImportPasswordForm" class="security-form"><label>Password di migrazione<input class="form-control" type="password" name="password" required autocomplete="current-password"></label><div class="form-actions"><button type="button" class="btn btn-light" id="cancelMigrationImportPassword">Annulla</button><button type="submit" class="btn btn-primary">Verifica pacchetto</button></div></form>`);
      $('#cancelMigrationImportPassword').onclick=()=>{closeModal();resolve('');};
      $('#migrationImportPasswordForm').onsubmit=e=>{e.preventDefault();const pw=String(new FormData(e.currentTarget).get('password')||'');if(!pw)return;closeModal();resolve(pw);};
    });
  }

  async function buildSingleProfileBackupBlob(profileId,receiptSecret=""){
    if(!window.JSZip)throw new Error('Modulo ZIP non disponibile');
    const profile=await DossierDB.get('profiles',profileId);if(!profile)throw new Error('Profilo personale non trovato');
    const stores=['documents','doctors','therapies','exemptions','diagnoses','measurements','weightJourneys','documentVersions','calendarEvents','calendarSuggestions','vaccinations','interventions','symptoms','therapyAdherence','carePlans','trash'];
    const values=Object.fromEntries(await Promise.all(stores.map(async store=>[store,(await DossierDB.getAll(store)).filter(x=>String(x.profileId||'')===String(profileId))])));
    const zip=new JSZip(),entries=[],base=`profili/${profileFolderName(profile)}/`;
    const {healthCardFrontBlob,healthCardBackBlob,avatarBlob,...profileMeta}=profile;
    await addBackupEntry(zip,entries,base+'profilo.json',backupJson(profileMeta),{kind:'profile',profileId});
    if(avatarBlob)await addBackupEntry(zip,entries,base+`avatar/${profile.avatarName||'avatar.jpg'}`,avatarBlob,{kind:'avatar',profileId});
    if(healthCardFrontBlob)await addBackupEntry(zip,entries,base+`tessera_sanitaria/${profile.healthCardFrontName||'fronte.jpg'}`,healthCardFrontBlob,{kind:'health-card-front',profileId});
    if(healthCardBackBlob)await addBackupEntry(zip,entries,base+`tessera_sanitaria/${profile.healthCardBackName||'retro.jpg'}`,healthCardBackBlob,{kind:'health-card-back',profileId});
    const mappings=[['medici.json','doctors'],['terapie.json','therapies'],['esenzioni.json','exemptions'],['diagnosi.json','diagnoses'],['misurazioni.json','measurements'],['percorsi_peso.json','weightJourneys'],['versioni_documenti.json','documentVersions'],['agenda.json','calendarEvents'],['richiami_calendario.json','calendarSuggestions'],['vaccinazioni.json','vaccinations'],['interventi_dispositivi.json','interventions'],['diario_sintomi.json','symptoms'],['aderenza_terapie.json','therapyAdherence'],['percorsi_cura.json','carePlans']];
    const profileCounts={profileId,name:`${profile.firstName||''} ${profile.lastName||''}`.trim(),documents:values.documents.length,trash:values.trash.length};
    for(const [name,store] of mappings){profileCounts[store]=values[store].length;await addBackupEntry(zip,entries,base+name,backupJson(values[store]),{kind:store,profileId});}
    await addBackupEntry(zip,entries,base+'indice_documenti.json',backupJson(values.documents.map(({fileBlob,...d})=>d)),{kind:'document-index',profileId});
    for(const d of values.documents){if(!(d.fileBlob instanceof Blob)||!d.fileBlob.size)throw new Error(`File originale mancante per “${d.title||d.originalName||d.id}”`);await addBackupEntry(zip,entries,base+`documenti/${d.id}__${d.originalName||'documento.bin'}`,d.fileBlob,{kind:'document',profileId});}
    const trashMeta=[];for(const item of values.trash){const document=item.payload?.document;const safePayload={...item.payload,document:document?((({fileBlob,...rest})=>rest)(document)):null};trashMeta.push({...item,payload:safePayload});if(document?.fileBlob)await addBackupEntry(zip,entries,base+`cestino/${item.id}__${document.originalName||'documento.bin'}`,document.fileBlob,{kind:'trash-document',profileId});}
    await addBackupEntry(zip,entries,base+'cestino.json',backupJson(trashMeta),{kind:'trash',profileId});
    const counts={profiles:1,documents:values.documents.length};
    for(const [,store] of mappings)counts[store]=values[store].length;counts.trash=values.trash.length;
    const manifest={app:'Dossier Sanitario Locale',version:'1.0.0',formatVersion:6,createdAt:new Date().toISOString(),counts,profiles:[profileCounts],entries,securityIncluded:false,migration:{type:'single-profile',profileId,subjectControlled:true,sourceAccountId:DossierSecurity.currentUser()?.id||'',receiptSecret:String(receiptSecret||'')}};
    zip.file('manifest.json',backupJson(manifest));
    const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:6}});
    const verification=await verifyBackupBlob(blob);if(!verification.ok)throw new Error(verification.report.message);return blob;
  }

  async function encryptMigrationPackage(innerBlob,password,profileId){
    const plain=new Uint8Array(await innerBlob.arrayBuffer()),salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12)),iterations=310000;
    const baseKey=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveKey']);
    const key=await crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations,hash:'SHA-256'},baseKey,{name:'AES-GCM',length:256},false,['encrypt']);
    const cipher=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,plain));
    const zip=new JSZip();zip.file('profilo_migrazione.enc',cipher);
    const manifest={app:'Dossier Sanitario Locale',format:'profile-migration',formatVersion:1,createdAt:new Date().toISOString(),profileId:String(profileId||''),cipher:'AES-256-GCM',kdf:'PBKDF2-SHA256',iterations,salt:Array.from(salt),iv:Array.from(iv),cipherSha256:await backupHash(cipher),plainSha256:await backupHash(plain)};
    zip.file('migration_manifest.json',backupJson(manifest));
    return {blob:await zip.generateAsync({type:'blob',compression:'STORE'}),manifest};
  }

  async function unwrapMigrationPackage(file){
    const outerPackageSha256=await backupHash(await file.arrayBuffer());
    let outer;try{outer=await JSZip.loadAsync(file,{checkCRC32:true});}catch{return file;}
    const mf=outer.file('migration_manifest.json'),enc=outer.file('profilo_migrazione.enc');if(!mf||!enc)return file;
    const manifest=JSON.parse(await mf.async('string'));if(manifest?.format!=='profile-migration')return file;
    const cipher=await enc.async('uint8array');if(manifest.cipherSha256&&(await backupHash(cipher))!==manifest.cipherSha256)throw new Error('Pacchetto di migrazione danneggiato: impronta cifrata non corrispondente');
    const password=await migrationImportPasswordDialog();if(!password)throw new Error('Importazione annullata');
    try{
      const salt=new Uint8Array(manifest.salt||[]),iv=new Uint8Array(manifest.iv||[]),baseKey=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveKey']);
      const key=await crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:Number(manifest.iterations||310000),hash:'SHA-256'},baseKey,{name:'AES-GCM',length:256},false,['decrypt']);
      const plain=new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv},key,cipher));
      if(manifest.plainSha256&&(await backupHash(plain))!==manifest.plainSha256)throw new Error('Impronta interna non corrispondente');
      const blob=new Blob([plain],{type:'application/zip'}),verification=await verifyBackupBlob(blob);if(!verification.ok)throw new Error(verification.report.message);
      blob.__dossierMigrationOuter={...manifest,packageSha256:outerPackageSha256};
      return blob;
    }catch(error){throw new Error(`Migrazione non apribile: ${error.message==='The operation failed for an operation-specific reason'?'password non corretta o pacchetto alterato':error.message}`);}
  }

  async function exportOwnProfileMigration(){
    const user=DossierSecurity.currentUser?.(),profileId=String(user?.linkedProfileId||'');
    if(!profileId||DossierSecurity.isAdministrator?.()){toast('La migrazione personale deve essere eseguita dall’adulto titolare del profilo');return;}
    const password=await migrationPasswordDialog();if(!password)return;
    try{
      toast('Preparazione e verifica del profilo in corso');
      const receiptSecret=b64url(crypto.getRandomValues(new Uint8Array(32)));
      const inner=await buildSingleProfileBackupBlob(profileId,receiptSecret),wrapped=await encryptMigrationPackage(inner,password,profileId),packageSha256=await backupHash(await wrapped.blob.arrayBuffer());
      const receiptChallengeSha256=await backupHash(unb64(receiptSecret));
      await DossierSecurity.request('/api/auth/profile-migration/exported',{method:'POST',body:{profileId,packageSha256,receiptChallengeSha256}});
      downloadBlob(wrapped.blob,`clinica_digitale_migrazione_profilo_${today()}.zip`);
      await DossierDB.put('settings',{key:`profileMigration:${profileId}`,profileId,subjectUserId:user.id,exportedAt:new Date().toISOString(),packageSha256,receiptChallengeSha256,state:'exported-verified-awaiting-receipt'},{audit:true,sync:true});
      toast('Pacchetto cifrato verificato ed esportato. Dopo l’importazione nel nuovo Dossier verrà generata la ricevuta tecnica necessaria per autorizzare la rimozione dall’origine.');
      if(state.activeView==='backup')renderBackup();
    }catch(error){toast(`Migrazione non completata: ${error.message}`);}
  }

  async function authorizeOwnProfileDeparture(){
    const user=DossierSecurity.currentUser?.(),profileId=String(user?.linkedProfileId||'');if(!profileId||DossierSecurity.isAdministrator?.())return;
    const migration=await DossierDB.get('settings',`profileMigration:${profileId}`).catch(()=>null);if(!migration?.packageSha256){toast('Prima esporta e verifica il tuo pacchetto di migrazione');return;}
    openModal('Autorizzazione alla rimozione','Questa decisione può essere presa soltanto dal titolare del profilo e richiede la ricevuta tecnica generata dal nuovo Dossier.',`<div class="notice warning"><strong>La sola esportazione non basta.</strong><br>Importa il pacchetto nel nuovo Dossier. Solo dopo la verifica completa il nuovo Dossier genera un file <strong>.cdreceipt</strong>. Questa ricevuta deve corrispondere crittograficamente al pacchetto esportato da qui.</div><form id="authorizeDepartureForm" class="security-form"><label>Ricevuta tecnica del nuovo Dossier<input class="form-control" type="file" id="departureReceiptFile" accept=".cdreceipt,.json,application/json" required></label><label>Conferma la tua password personale<input class="form-control" type="password" name="password" required autocomplete="current-password"></label><div class="form-actions"><button type="button" class="btn btn-light" id="cancelDepartureAuth">Annulla</button><button type="submit" class="btn btn-danger">Verifica ricevuta e autorizza</button></div></form>`);
    $('#cancelDepartureAuth').onclick=closeModal;$('#authorizeDepartureForm').onsubmit=async e=>{e.preventDefault();const button=e.currentTarget.querySelector('button[type="submit"]'),file=$('#departureReceiptFile')?.files?.[0];if(!file){toast('Seleziona la ricevuta tecnica generata dal nuovo Dossier');return;}button.disabled=true;button.textContent='Verifica ricevuta…';try{let receipt;try{receipt=JSON.parse(await file.text());}catch{throw new Error('Ricevuta tecnica non leggibile');}if(String(receipt?.packageSha256||'').toLowerCase()!==String(migration.packageSha256||'').toLowerCase())throw new Error('La ricevuta non corrisponde al pacchetto esportato da questo Dossier');const result=await DossierSecurity.request('/api/auth/profile-departure/authorize',{method:'POST',body:{profileId,password:String(new FormData(e.currentTarget).get('password')||''),packageSha256:migration.packageSha256,receipt}});closeModal();await DossierDB.put('settings',{...migration,state:'receipt-verified-departure-authorized',receiptId:result.authorization?.receipt?.receiptId||'',authorizedAt:new Date().toISOString()},{audit:true,sync:true});toast('Ricevuta verificata e autorizzazione personale registrata. Nessuna cancellazione può essere eseguita senza questa prova.');if(result.user)window.dispatchEvent(new Event('dossier-security-changed'));if(state.activeView==='backup')renderBackup();}catch(error){button.disabled=false;button.textContent='Verifica ricevuta e autorizza';toast(error.message);}};
  }

  async function buildBackupBlob(options={}) {
    DossierSecurity.beginTechnicalActivity?.('backup-build');
    try{
    const includeMediaArchive=!!options.includeMediaArchive;
    if (!window.JSZip) throw new Error('Modulo ZIP non disponibile');
    const zip=new JSZip(),entries=[];
    const storeNames=['profiles','documents','doctors','therapies','exemptions','diagnoses','measurements','weightJourneys','documentVersions','calendarEvents','calendarSuggestions','vaccinations','interventions','symptoms','therapyAdherence','carePlans','dicomStudies','mediaAttachments','users','devices','auditLog','trash','settings','cloudSettings','syncQueue'];
    const values=Object.fromEntries(await Promise.all(storeNames.map(async store=>[store,await DossierDB.getAll(store)])));
    const allProfiles=values.profiles,allDocs=values.documents,allTrash=values.trash;
    let securityBundle=null;
    try{securityBundle=await DossierSecurity.exportSecurityBackup?.();}catch(error){console.warn('Archivio credenziali non incluso:',error);}
    const counts=Object.fromEntries(storeNames.map(store=>[store,values[store].length]));counts.profiles=allProfiles.length;counts.documents=allDocs.length;
    await addBackupEntry(zip,entries,'preferenze/impostazioni.json',backupJson(values.settings),{kind:'settings'});
    await addBackupEntry(zip,entries,'sicurezza/utenti_indicizzati.json',backupJson(values.users),{kind:'security-index'});
    await addBackupEntry(zip,entries,'sicurezza/dispositivi.json',backupJson(values.devices),{kind:'devices'});
    await addBackupEntry(zip,entries,'sicurezza/registro_attivita.json',backupJson(values.auditLog),{kind:'audit'});
    if(securityBundle)await addBackupEntry(zip,entries,'sicurezza/archivio_credenziali.json',backupJson(securityBundle),{kind:'security-credentials'});
    await addBackupEntry(zip,entries,'sincronizzazione/impostazioni_cloud.json',backupJson(values.cloudSettings.map(({credentials,...row})=>row)),{kind:'cloud'});
    await addBackupEntry(zip,entries,'sincronizzazione/coda.json',backupJson(values.syncQueue),{kind:'sync'});
    const perProfile=[];
    for(const p of allProfiles){
      const base=`profili/${profileFolderName(p)}/`,folder=zip.folder(base);void folder;
      const {healthCardFrontBlob,healthCardBackBlob,avatarBlob,...profileMeta}=p;
      await addBackupEntry(zip,entries,base+'profilo.json',backupJson(profileMeta),{kind:'profile',profileId:p.id});
      if(avatarBlob)await addBackupEntry(zip,entries,base+`avatar/${p.avatarName||'avatar.jpg'}`,avatarBlob,{kind:'avatar',profileId:p.id});
      if(healthCardFrontBlob)await addBackupEntry(zip,entries,base+`tessera_sanitaria/${p.healthCardFrontName||'fronte.jpg'}`,healthCardFrontBlob,{kind:'health-card-front',profileId:p.id});
      if(healthCardBackBlob)await addBackupEntry(zip,entries,base+`tessera_sanitaria/${p.healthCardBackName||'retro.jpg'}`,healthCardBackBlob,{kind:'health-card-back',profileId:p.id});
      const mappings=[['medici.json','doctors'],['terapie.json','therapies'],['esenzioni.json','exemptions'],['diagnosi.json','diagnoses'],['misurazioni.json','measurements'],['percorsi_peso.json','weightJourneys'],['versioni_documenti.json','documentVersions'],['agenda.json','calendarEvents'],['richiami_calendario.json','calendarSuggestions'],['vaccinazioni.json','vaccinations'],['interventi_dispositivi.json','interventions'],['diario_sintomi.json','symptoms'],['aderenza_terapie.json','therapyAdherence'],['percorsi_cura.json','carePlans']];
      const profileCounts={profileId:p.id,name:`${p.firstName||''} ${p.lastName||''}`.trim(),documents:0};
      for(const [name,store] of mappings){const rows=values[store].filter(x=>x.profileId===p.id);profileCounts[store]=rows.length;await addBackupEntry(zip,entries,base+name,backupJson(rows),{kind:store,profileId:p.id});}
      const dicomRows=values.dicomStudies.filter(x=>x.profileId===p.id),dicomMeta=[];profileCounts.dicomStudies=dicomRows.length;
      for(const study of dicomRows){const cleanFiles=[];for(const f of study.files||[]){const {blob,...meta}=f;const clean={...meta};if(includeMediaArchive&&study.storageMode!=='external'){try{const mediaBlob=await globalThis.ClinicaLot2?.getDicomFileBlob?.(study,f);if(mediaBlob instanceof Blob&&mediaBlob.size){const mediaPath=base+`media/dicom/${study.id}/${String(f.relativePath||f.name||'file.dcm').replace(/\\/g,'/').split('/').map(x=>x.replace(/[<>:\"|?*]/g,'_')).join('/')}`;await addBackupEntry(zip,entries,mediaPath,mediaBlob,{kind:'dicom-media',profileId:p.id,required:false});clean.backupPath=mediaPath;}}catch(error){console.warn('DICOM non incluso nel backup:',study.id,f.name,error);}}cleanFiles.push(clean);}dicomMeta.push({...study,files:cleanFiles,backupMediaIncluded:includeMediaArchive&&cleanFiles.some(x=>x.backupPath)});}
      await addBackupEntry(zip,entries,base+'dicom_studies.json',backupJson(dicomMeta),{kind:'dicom-index',profileId:p.id});
      const imageRows=values.mediaAttachments.filter(x=>x.profileId===p.id),imageMeta=[];profileCounts.mediaAttachments=imageRows.length;
      for(const image of imageRows){const clean={...image};if(includeMediaArchive&&image.storageMode==='managed'){try{const mediaBlob=await globalThis.ClinicaLot2?.getManagedMediaBlob?.('image',image.profileId,image.id,image.storagePath||image.name);if(mediaBlob instanceof Blob&&mediaBlob.size){const mediaPath=base+`media/images/${image.id}/${String(image.storagePath||image.name||'immagine.jpg').replace(/[<>:\"|?*]/g,'_')}`;await addBackupEntry(zip,entries,mediaPath,mediaBlob,{kind:'image-media',profileId:p.id,required:false});clean.backupPath=mediaPath;clean.backupMediaIncluded=true;}}catch(error){console.warn('Immagine associata non inclusa nel backup:',image.id,error);}}imageMeta.push(clean);}
      await addBackupEntry(zip,entries,base+'immagini_associate.json',backupJson(imageMeta),{kind:'image-index',profileId:p.id});
      const docs=allDocs.filter(x=>x.profileId===p.id);profileCounts.documents=docs.length;await addBackupEntry(zip,entries,base+'indice_documenti.json',backupJson(docs.map(({fileBlob,...d})=>d)),{kind:'document-index',profileId:p.id});
      for(const d of docs){if(!(d.fileBlob instanceof Blob)||!d.fileBlob.size)throw new Error(`File originale mancante per “${d.title||d.originalName||d.id}”`);await addBackupEntry(zip,entries,base+`documenti/${d.id}__${d.originalName||'documento.bin'}`,d.fileBlob,{kind:'document',profileId:p.id});}
      const trash=allTrash.filter(x=>x.profileId===p.id),trashMeta=[];profileCounts.trash=trash.length;
      for(const item of trash){const document=item.payload?.document;const safePayload={...item.payload,document:document?((({fileBlob,...rest})=>rest)(document)):null};trashMeta.push({...item,payload:safePayload});if(document?.fileBlob)await addBackupEntry(zip,entries,base+`cestino/${item.id}__${document.originalName||'documento.bin'}`,document.fileBlob,{kind:'trash-document',profileId:p.id});}
      await addBackupEntry(zip,entries,base+'cestino.json',backupJson(trashMeta),{kind:'trash',profileId:p.id});perProfile.push(profileCounts);
    }
    const manifest={app:'Dossier Sanitario Locale',version:'5.0.0',formatVersion:7,createdAt:new Date().toISOString(),counts,profiles:perProfile,entries,securityIncluded:!!securityBundle,mediaArchiveIncluded:includeMediaArchive};
    zip.file('manifest.json',backupJson(manifest));
    const estimatedBytes=allDocs.reduce((sum,d)=>sum+Number(d.fileBlob?.size||d.size||0),0)+allTrash.reduce((sum,x)=>sum+Number(x.payload?.document?.fileBlob?.size||0),0)+(includeMediaArchive?values.dicomStudies.reduce((sum,x)=>sum+Number(x.totalBytes||0),0)+values.mediaAttachments.reduce((sum,x)=>sum+Number(x.size||0),0):0);
    if(!await ensureStorageFor(Math.max(estimatedBytes,10*1024*1024),'la preparazione del backup'))throw new Error('Spazio insufficiente per preparare il backup');
    const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:6}});
    const verification=await verifyBackupBlob(blob);state.lastBackupReport=verification.report;if(!verification.ok)throw new Error(verification.report.message);
    return blob;
    }finally{DossierSecurity.endTechnicalActivity?.('backup-build');}
  }

  async function chooseBackupDestination(fileName){
    if(typeof window.showSaveFilePicker!=='function')throw new Error('La finestra Windows “Salva con nome” non è disponibile in questo ambiente. Riavvia Clinica Digitale dall’icona del programma e riprova.');
    try{
      return await window.showSaveFilePicker({
        id:'clinica-digitale-backup-completo',
        suggestedName:fileName,
        types:[{description:'Backup completo Clinica Digitale',accept:{'application/zip':['.zip']}}],
        excludeAcceptAllOption:false
      });
    }catch(error){if(error?.name==='AbortError')return null;throw error;}
  }
  async function writeBackupToDestination(handle,blob){
    const writable=await handle.createWritable();
    try{await writable.write(blob);await writable.close();}
    catch(error){try{await writable.abort?.();}catch{}throw error;}
  }

  async function exportZip() {
    if(!DossierSecurity.canUse?.('backup')){toast('Il tuo account non è autorizzato a creare backup');return;}
    if(backupExportPromise){toast('Preparazione del backup già in corso. Attendi il completamento.');return backupExportPromise;}
    const buttons=()=>$$('[data-action="export-backup"]');
    const task=(async()=>{
      buttons().forEach(b=>{b.disabled=true;b.setAttribute('aria-busy','true');});
      try{
        const fileName=`dossier_sanitario_backup_${today()}.zip`;
        // La destinazione viene scelta PRIMA della generazione: nessun backup finisce automaticamente in Download.
        const destination=await chooseBackupDestination(fileName);if(!destination){toast('Esportazione backup annullata');return;}
        toast('Preparazione e verifica del backup in corso');
        const blob=await buildBackupBlob();
        await writeBackupToDestination(destination,blob);
        localStorage.setItem('lastBackupAt',new Date().toISOString());
        toast('Backup verificato e salvato nella cartella scelta');
        if(state.activeView==='backup')renderBackup();
      }catch(error){toast(`Backup non completato: ${error.message}`);if(state.activeView==='backup')renderBackup();}
      finally{buttons().forEach(b=>{b.disabled=false;b.setAttribute('aria-busy','false');});}
    })();
    backupExportPromise=task;try{return await task;}finally{backupExportPromise=null;}
  }

  async function importRecord(store,item,report){
    const key=item?.id??item?.key;if(!key){report.invalid=(report.invalid||0)+1;return false;}
    const existing=await DossierDB.get(store,key).catch(()=>null);
    if(existing&&await sameRecord(existing,item)){report.duplicates++;return false;}
    if(existing){report.conflicts=(report.conflicts||0)+1;return false;}
    await DossierDB.put(store,item,{audit:false,sync:false});report.imported++;return true;
  }

  const RESTORE_DB_STORES=['profiles','documents','doctors','therapies','diagnoses','exemptions','measurements','weightJourneys','documentVersions','calendarEvents','calendarSuggestions','vaccinations','interventions','symptoms','therapyAdherence','carePlans','dicomStudies','mediaAttachments','users','devices','auditLog','trash','cloudSettings','syncQueue','settings'];
  const CLINICAL_MERGE_STORES=['documents','doctors','therapies','diagnoses','exemptions','measurements','weightJourneys','documentVersions','calendarEvents','calendarSuggestions','vaccinations','interventions','symptoms','therapyAdherence','carePlans','dicomStudies','mediaAttachments'];
  const PROFILE_JSON_STORES=[['medici.json','doctors'],['terapie.json','therapies'],['esenzioni.json','exemptions'],['diagnosi.json','diagnoses'],['misurazioni.json','measurements'],['percorsi_peso.json','weightJourneys'],['versioni_documenti.json','documentVersions'],['agenda.json','calendarEvents'],['richiami_calendario.json','calendarSuggestions'],['vaccinazioni.json','vaccinations'],['interventi_dispositivi.json','interventions'],['diario_sintomi.json','symptoms'],['aderenza_terapie.json','therapyAdherence'],['percorsi_cura.json','carePlans']];
  function restoreModeLabel(mode){return mode==='full'?'Ripristino completo':mode==='documents'?'Solo documenti':'Integrazione dati mancanti';}
  function identityText(value=''){return String(value||'').toLocaleLowerCase('it-IT').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();}
  function profileIdentityScore(source,target){
    if(!source||!target)return 0;
    if(source.id&&source.id===target.id)return 100;
    const sourceTax=identityText(source.taxCode),targetTax=identityText(target.taxCode);
    if(sourceTax&&targetTax&&sourceTax===targetTax)return 95;
    const sourceName=identityText(`${source.firstName||''} ${source.lastName||''}`),targetName=identityText(`${target.firstName||''} ${target.lastName||''}`);
    if(sourceName&&sourceName===targetName&&source.birthDate&&source.birthDate===target.birthDate)return 85;
    if(sourceName&&sourceName===targetName)return 70;
    return 0;
  }
  function suggestedProfileTarget(profile){
    const ranked=state.profiles.map(p=>({id:p.id,score:profileIdentityScore(profile,p)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score);
    if(!ranked.length)return'__new__';
    if(ranked.length>1&&ranked[0].score===ranked[1].score)return'';
    return ranked[0].id;
  }
  function backupProfileName(profile){return `${profile.firstName||''} ${profile.lastName||''}`.trim()||profile.id||'Profilo senza nome';}
  function manifestProfileCounts(manifest,profile){
    const rows=arrayOrEmpty(manifest.profiles);const row=rows.find(x=>x.profileId===profile.id)||rows.find(x=>identityText(x.name)===identityText(backupProfileName(profile)))||{};
    return row;
  }
  function profileAssetPath(context,info,kind,originalName=''){
    const entries=arrayOrEmpty(context.manifest.entries);
    const byKind=entries.find(e=>e.profileId===info.profile.id&&e.kind===kind&&context.zip.file(e.path));
    if(byKind)return byKind.path;
    const names=Object.keys(context.zip.files).filter(n=>n.startsWith(info.base)&&!context.zip.files[n].dir);
    if(kind==='avatar')return names.find(n=>n.startsWith(info.base+'avatar/'))||'';
    const cardNames=names.filter(n=>n.startsWith(info.base+'tessera_sanitaria/'));
    if(originalName){const exact=cardNames.find(n=>n.split('/').pop()===originalName);if(exact)return exact;}
    if(kind==='health-card-front')return cardNames.find(n=>/fronte/i.test(n))||cardNames[0]||'';
    if(kind==='health-card-back')return cardNames.find(n=>/retro/i.test(n))||cardNames[1]||'';
    return'';
  }
  async function profileWithAssets(context,info,targetId){
    const p={...info.profile,id:targetId};
    const avatarPath=profileAssetPath(context,info,'avatar');
    const frontPath=profileAssetPath(context,info,'health-card-front',p.healthCardFrontName||'');
    const backPath=profileAssetPath(context,info,'health-card-back',p.healthCardBackName||'');
    if(avatarPath){p.avatarBlob=await context.zip.file(avatarPath).async('blob');p.avatarName=avatarPath.split('/').pop();}
    if(frontPath){p.healthCardFrontBlob=await context.zip.file(frontPath).async('blob');p.healthCardFrontName=frontPath.split('/').pop().replace(/^fronte__/i,'');}
    if(backPath){p.healthCardBackBlob=await context.zip.file(backPath).async('blob');p.healthCardBackName=backPath.split('/').pop().replace(/^retro__/i,'');}
    return p;
  }
  async function inspectBackupForUse(file){
    if(!file)throw new Error('Nessun file selezionato');
    if(!window.JSZip)throw new Error('Modulo ZIP non disponibile');
    const usableFile=await unwrapMigrationPackage(file);
    const inspection=await verifyBackupBlob(usableFile);
    state.lastRestoreReport={...inspection.report,message:inspection.report.message};
    if(!inspection.ok)throw new Error(inspection.report.message);
    const profilePaths=Object.keys(inspection.zip.files).filter(n=>/profili\/[^/]+\/profilo\.json$/.test(n));
    const profiles=[];
    for(const path of profilePaths){
      const profile=JSON.parse(await inspection.zip.file(path).async('string'));const base=path.replace(/profilo\.json$/,'');
      const docs=arrayOrEmpty(JSON.parse(await inspection.zip.file(base+'indice_documenti.json').async('string')));
      const counts={...manifestProfileCounts(inspection.manifest,profile),documents:docs.length};
      profiles.push({path,base,profile,counts,suggestedTarget:suggestedProfileTarget(profile)});
    }
    const securityFile=inspection.zip.file('sicurezza/archivio_credenziali.json');
    const migrationInner=inspection.manifest?.migration?.type==='single-profile'?inspection.manifest.migration:null;
    const migration=migrationInner?{inner:migrationInner,outer:usableFile.__dossierMigrationOuter||null}:null;
    return {file:usableFile,zip:inspection.zip,manifest:inspection.manifest,inspection,profiles,securityIncluded:!!securityFile,migration,generatedProfileIds:{},previewToken:0};
  }
  function profileMappingFromDialog(context){
    const mapping={};
    for(const info of context.profiles){const select=$(`[data-restore-profile="${CSS.escape(info.profile.id)}"]`,$('#modalBody'));mapping[info.profile.id]=select?.value||info.suggestedTarget||'__new__';}
    return mapping;
  }
  function resolveMappedProfileId(context,backupProfileId,selection){
    if(selection&&selection!=='__new__')return selection;
    if(!context.generatedProfileIds[backupProfileId]){
      const occupied=new Set([...state.profiles.map(p=>p.id),...Object.values(context.generatedProfileIds)]);
      context.generatedProfileIds[backupProfileId]=occupied.has(backupProfileId)?uid('profile'):backupProfileId;
    }
    return context.generatedProfileIds[backupProfileId];
  }
  function profileMappingOptions(info){
    const options=state.profiles.map(p=>`<option value="${esc(p.id)}" ${info.suggestedTarget===p.id?'selected':''}>${esc(backupProfileName(p))}</option>`).join('');
    return `<option value="" ${!info.suggestedTarget?'selected':''}>Seleziona la corrispondenza</option>${options}<option value="__new__" ${info.suggestedTarget==='__new__'?'selected':''}>Crea un nuovo profilo</option>`;
  }
  function backupProfileSummaryHtml(context){
    return context.profiles.map(info=>`<tr><td><strong>${esc(backupProfileName(info.profile))}</strong><small>${esc(info.profile.birthDate?formatDate(info.profile.birthDate):'Data di nascita non indicata')}</small></td><td>${Number(info.counts.documents||0)}</td><td>${Number(info.counts.diagnoses||0)}</td><td>${Number(info.counts.therapies||0)}</td><td>${Number(info.counts.measurements||0)}</td></tr>`).join('');
  }
  function openBackupUseDialog(context){
    state.pendingRestoreContext=context;
    const version=context.manifest.version||'non indicata',created=context.manifest.createdAt||context.manifest.created_at||'';
    openModal('Usa un backup','Scegli l’operazione prima di modificare l’archivio',`<div class="backup-restore-wizard">
      <section class="backup-source-summary"><div><small>File</small><strong>${esc(context.file.name||'backup.zip')}</strong></div><div><small>Versione</small><strong>${esc(version)}</strong></div><div><small>Creato</small><strong>${created?esc(formatDateTime(created)):'Non indicato'}</strong></div><div><small>Integrità</small><strong>Verificata</strong></div></section>
      <div class="backup-profile-table-wrap"><table class="data-table backup-profile-table"><thead><tr><th>Profilo nel backup</th><th>Documenti</th><th>Diagnosi</th><th>Terapie</th><th>Monitoraggi</th></tr></thead><tbody>${backupProfileSummaryHtml(context)}</tbody></table></div>
      <h3>Come vuoi utilizzare questo backup?</h3>
      <div class="restore-mode-grid">
        <label class="restore-mode-card danger"><input type="radio" name="restoreMode" value="full"><span><strong>Ripristina tutto e sostituisci l’archivio</strong><small>Riporta il Dossier allo stato del backup. I dati attuali vengono sostituiti. Prima dell’operazione viene generato automaticamente un backup di sicurezza.</small></span></label>
        <label class="restore-mode-card recommended"><input type="radio" name="restoreMode" value="merge" checked><span><strong>Integra soltanto i dati mancanti</strong><small>Mantiene fotografie, colori, utenti, permessi e impostazioni attuali. Aggiunge i dati nuovi; in caso di conflitto conserva la versione attuale.</small></span></label>
        <label class="restore-mode-card"><input type="radio" name="restoreMode" value="documents"><span><strong>Importa soltanto documenti e file originali</strong><small>Importa PDF, immagini e dati OCR senza modificare diagnosi, terapie, monitoraggi, utenti o preferenze.</small></span></label>
      </div>
      <section id="restoreMappingSection" class="restore-mapping-section"><div class="card-title-row"><div><h3>Associazione dei profili</h3><p class="kpi-note">Verifica a quale profilo attuale corrisponde ogni persona del backup.</p></div></div><div class="restore-mapping-list">${context.profiles.map(info=>`<label><span><strong>${esc(backupProfileName(info.profile))}</strong><small>${esc(info.profile.taxCode||info.profile.birthDate||'Nessun identificativo aggiuntivo')}</small></span><select class="form-control" data-restore-profile="${esc(info.profile.id)}">${profileMappingOptions(info)}</select></label>`).join('')}</div></section>
      <section id="restoreSecuritySection" class="notice ${context.securityIncluded?'':'warning'}"><strong>Utenti e credenziali:</strong> ${context.securityIncluded?'presenti nel backup. Vengono ripristinati soltanto nella modalità completa e solo da un amministratore.':'non presenti. Anche nel ripristino completo gli account attuali verranno conservati.'}</section>
      <section id="restorePlanHost" class="restore-plan-host"><div class="notice">Calcolo di nuovi elementi, duplicati e conflitti in corso.</div></section>
      <section id="restoreFullConfirmation" class="restore-full-confirmation hidden"><label>Per confermare la sostituzione completa scrivi <strong>SOSTITUISCI</strong><input id="restoreTypedConfirmation" class="form-control" autocomplete="off"></label></section>
      <div class="form-actions"><button type="button" class="btn btn-light" id="cancelBackupUseBtn">Annulla</button><button type="button" class="btn btn-primary" id="executeBackupUseBtn">Integra dati mancanti</button></div>
    </div>`);
    $('#cancelBackupUseBtn').onclick=()=>{closeModal();resetBackupInput();};
    $$('[name="restoreMode"]',$('#modalBody')).forEach(r=>r.onchange=()=>refreshRestorePlanPreview(context));
    $$('[data-restore-profile]',$('#modalBody')).forEach(s=>s.onchange=()=>refreshRestorePlanPreview(context));
    $('#executeBackupUseBtn').onclick=()=>executeBackupUseFromDialog(context);
    refreshRestorePlanPreview(context);
  }
  function selectedRestoreMode(){return $('[name="restoreMode"]:checked',$('#modalBody'))?.value||'merge';}
  function resetBackupInput(){const input=$('#backupFileInput');if(input)input.value='';}
  async function prepareBackupUse(file){
    DossierSecurity.beginTechnicalActivity?.('backup-restore');
    try{
    if(!file)return false;
    if(!DossierSecurity.canUse?.('restore')){toast('Il tuo account non è autorizzato al ripristino');resetBackupInput();return false;}
    try{toast('Verifica fisica del backup in corso');const context=await inspectBackupForUse(file);openBackupUseDialog(context);if(state.activeView==='backup')renderBackup();return true;}
    catch(error){state.lastRestoreReport={...(state.lastRestoreReport||{}),corrupt:[error.message],message:`Backup rifiutato: ${error.message}`};toast(state.lastRestoreReport.message);resetBackupInput();if(state.activeView==='backup')renderBackup();return false;}
  
    }finally{DossierSecurity.endTechnicalActivity?.('backup-restore');}
  }
  async function readJsonFile(zip,path,fallback=[]){const f=zip.file(path);if(!f)return fallback;return JSON.parse(await f.async('string'));}
  async function loadBackupDataset(context,mode,mapping,restoreUsers=true){
    const data=Object.fromEntries(RESTORE_DB_STORES.map(s=>[s,[]]));const newProfileIds=new Set();const profileMap={};
    for(const info of context.profiles){
      const selection=mode==='full'?info.profile.id:(mapping[info.profile.id]||info.suggestedTarget||'__new__');
      const targetId=mode==='full'?info.profile.id:resolveMappedProfileId(context,info.profile.id,selection);
      profileMap[info.profile.id]=targetId;
      const current=state.profiles.find(p=>p.id===targetId);
      if(mode==='full'||!current){data.profiles.push(await profileWithAssets(context,info,targetId));if(!current)newProfileIds.add(targetId);}
      const includeClinical=mode!=='documents';
      if(includeClinical){
        for(const [jsonName,store] of PROFILE_JSON_STORES){
          const rows=arrayOrEmpty(await readJsonFile(context.zip,info.base+jsonName,[]));
          for(const row of rows)data[store].push({...row,profileId:targetId});
        }
      }
      const dicomRows=arrayOrEmpty(await readJsonFile(context.zip,info.base+'dicom_studies.json',[]));for(const row of dicomRows)data.dicomStudies.push({...row,profileId:targetId});
      const imageRows=arrayOrEmpty(await readJsonFile(context.zip,info.base+'immagini_associate.json',[]));for(const row of imageRows)data.mediaAttachments.push({...row,profileId:targetId});
      const docs=arrayOrEmpty(await readJsonFile(context.zip,info.base+'indice_documenti.json',[]));
      for(const doc of docs){
        const filePath=Object.keys(context.zip.files).find(n=>n.startsWith(info.base+'documenti/'+doc.id+'__')&&!context.zip.files[n].dir);
        if(!filePath)throw new Error(`File originale mancante per ${doc.title||doc.originalName||doc.id}`);
        const fileBlob=await context.zip.file(filePath).async('blob');data.documents.push({...doc,profileId:targetId,fileBlob});
      }
      if(mode==='full'){
        const trashRows=arrayOrEmpty(await readJsonFile(context.zip,info.base+'cestino.json',[]));
        for(const item of trashRows){const clone=globalThis.structuredClone?globalThis.structuredClone(item):JSON.parse(JSON.stringify(item));const filePath=Object.keys(context.zip.files).find(n=>n.startsWith(info.base+'cestino/'+item.id+'__')&&!context.zip.files[n].dir);if(filePath&&clone.payload?.document)clone.payload.document.fileBlob=await context.zip.file(filePath).async('blob');if(clone.profileId)clone.profileId=targetId;if(clone.payload?.document?.profileId)clone.payload.document.profileId=targetId;data.trash.push(clone);}
      }
    }
    if(mode==='full'){
      const settingsFile=context.zip.file('preferenze/impostazioni.json');
      if(settingsFile)data.settings=arrayOrEmpty(JSON.parse(await settingsFile.async('string')));
      else {const legacy=context.zip.file('preferenze.json');if(legacy){const pref=JSON.parse(await legacy.async('string'));if(pref.globalPreferences)data.settings.push({key:'globalPreferences',value:pref.globalPreferences});if(pref.securitySettings)data.settings.push({key:'securitySettings',value:pref.securitySettings});}}
      for(const [path,store] of [['sicurezza/utenti_indicizzati.json','users'],['sicurezza/utenti.json','users'],['sicurezza/dispositivi.json','devices'],['sicurezza/registro_attivita.json','auditLog'],['sincronizzazione/impostazioni_cloud.json','cloudSettings'],['sincronizzazione/coda.json','syncQueue']]){const f=context.zip.file(path);if(f)data[store]=arrayOrEmpty(JSON.parse(await f.async('string')));}
      if(!context.securityIncluded||!restoreUsers){data.users=[];data.devices=[];}
    }
    return {data,newProfileIds,profileMap};
  }
  function recordPrimaryKey(store,row){return row?.[(['settings','cloudSettings'].includes(store)?'key':'id')];}
  function semanticRecordKey(store,row){
    const p=row.profileId||'';
    if(store==='documents')return `${p}|${row.hash||''}|${row.size||row.fileBlob?.size||0}|${identityText(row.originalName||row.title)}`;
    if(store==='doctors')return `${p}|${identityText(row.name)}|${identityText(row.specialty)}|${identityText(row.phone)}`;
    if(store==='therapies')return `${p}|${identityText(row.medication)}|${identityText(row.dosage)}|${identityText(row.time||row.schedule)}`;
    if(store==='diagnoses')return `${p}|${identityText(row.name)}|${row.date||''}|${identityText(row.category)}`;
    if(store==='exemptions')return `${p}|${identityText(row.code)}|${identityText(row.description)}`;
    if(store==='measurements')return `${p}|${row.type||''}|${row.date||''}|${row.time||''}|${row.value??row.systolic??''}|${row.diastolic??''}`;
    if(store==='weightJourneys')return `${p}|${row.startDate||''}|${row.targetDate||''}`;
    if(store==='calendarEvents')return `${p}|${row.startDate||''}|${row.startTime||''}|${identityText(row.title)}|${identityText(row.category)}`;
    if(store==='calendarSuggestions')return `${p}|${row.sourceDocumentId||''}|${row.suggestedDate||''}|${identityText(row.sourceExcerpt)}`;
    return'';
  }
  async function documentContentKey(row){
    if(row.hash)return String(row.hash).toLowerCase();
    if(row.fileBlob instanceof Blob)return await backupHash(row.fileBlob);
    return'';
  }
  function normalizedDocumentStem(row){
    const source=String(row?.originalName||'').replace(/\.[^.]+$/,'').replace(/(?:[_\-\s]+(?:ocr|ocred|ocrd|searchable|testo))+$|(?:[_\-\s]+pdfa)+$/gi,'');
    return identityText(source);
  }
  function probableDocumentVersion(a,b){
    if(!a||!b||(a.profileId||'')!==(b.profileId||''))return false;
    const dateA=a.clinicalDate||a.issueDate||'',dateB=b.clinicalDate||b.issueDate||'';
    if(!dateA||dateA!==dateB)return false;
    const titleA=identityText(a.title||''),titleB=identityText(b.title||'');
    const stemA=normalizedDocumentStem(a),stemB=normalizedDocumentStem(b);
    return !!((titleA&&titleB&&titleA===titleB)||(stemA&&stemB&&stemA===stemB));
  }
  async function classifyDataset(dataset,mode){
    const operations=Object.fromEntries(RESTORE_DB_STORES.map(s=>[s,[]]));const counts={new:0,duplicates:0,possibleDuplicates:0,possibleDuplicateDetails:[],conflicts:0,invalid:0,byStore:{}};
    const existing=Object.fromEntries(await Promise.all(RESTORE_DB_STORES.map(async store=>[store,await DossierDB.getAll(store)])));
    for(const store of RESTORE_DB_STORES){
      const incoming=arrayOrEmpty(dataset.data[store]);const stat=counts.byStore[store]={new:0,duplicates:0,possibleDuplicates:0,conflicts:0,invalid:0};
      if(mode==='full'){operations[store]=incoming;stat.new=incoming.length;counts.new+=incoming.length;continue;}
      const byKey=new Map(existing[store].map(x=>[recordPrimaryKey(store,x),x]));const semantic=new Map();const plannedKeys=new Set();
      for(const row of existing[store]){const key=semanticRecordKey(store,row);if(key&&!semantic.has(key))semantic.set(key,row);}
      const docContent=new Map();
      if(store==='documents')for(const row of existing.documents){const key=await documentContentKey(row);if(key&&!docContent.has(`${row.profileId||''}|${key}`))docContent.set(`${row.profileId||''}|${key}`,row);}
      for(const row of incoming){
        const key=recordPrimaryKey(store,row);if(!key){stat.invalid++;counts.invalid++;continue;}
        if(plannedKeys.has(key)){stat.conflicts++;counts.conflicts++;continue;}
        const exact=byKey.get(key);
        if(exact){
          if(store==='documents'){
            const incomingContent=await documentContentKey(row),currentContent=await documentContentKey(exact);
            if(incomingContent&&currentContent&&incomingContent===currentContent){stat.duplicates++;counts.duplicates++;continue;}
          }
          if(await sameRecord(exact,row)){stat.duplicates++;counts.duplicates++;}else{stat.conflicts++;counts.conflicts++;}
          continue;
        }
        if(store==='documents'){
          const content=await documentContentKey(row);if(content&&docContent.has(`${row.profileId||''}|${content}`)){stat.duplicates++;counts.duplicates++;continue;}
        }
        const semanticKey=semanticRecordKey(store,row);if(semanticKey&&semantic.has(semanticKey)){stat.duplicates++;counts.duplicates++;continue;}
        if(store==='documents'){
          const similar=existing.documents.find(candidate=>probableDocumentVersion(candidate,row));
          if(similar){
            stat.possibleDuplicates++;counts.possibleDuplicates++;
            if(counts.possibleDuplicateDetails.length<12)counts.possibleDuplicateDetails.push({incomingId:row.id,incomingTitle:row.title||row.originalName||row.id,currentId:similar.id,currentTitle:similar.title||similar.originalName||similar.id,clinicalDate:row.clinicalDate||row.issueDate||''});
          }
        }
        operations[store].push(row);plannedKeys.add(key);stat.new++;counts.new++;
      }
    }
    return {operations,counts,existing};
  }
  async function buildRestorePlan(context,mode,mapping={},options={}){
    if(!['full','merge','documents'].includes(mode))throw new Error('Modalità di ripristino non valida');
    if(mode!=='full')for(const info of context.profiles){const selection=mapping[info.profile.id]||info.suggestedTarget;if(!selection)throw new Error(`Indica a quale profilo corrisponde ${backupProfileName(info.profile)}`);}
    const restoreUsers=mode==='full'&&context.securityIncluded&&DossierSecurity.isAdministrator?.()&&options.restoreUsers!==false;
    const dataset=await loadBackupDataset(context,mode,mapping,restoreUsers);
    const classified=await classifyDataset(dataset,mode);
    const affectedStores=mode==='full'?RESTORE_DB_STORES.filter(store=>!(['users','devices'].includes(store)&&!restoreUsers)):(mode==='documents'?['profiles','documents','dicomStudies','mediaAttachments']:['profiles',...CLINICAL_MERGE_STORES]);
    const securityFile=context.zip.file('sicurezza/archivio_credenziali.json');const securityBundle=restoreUsers&&securityFile?JSON.parse(await securityFile.async('string')):null;
    if(securityBundle)await DossierSecurity.validateSecurityBackup?.(securityBundle);
    return {context,mode,mapping,dataset,operations:classified.operations,counts:classified.counts,affectedStores,restoreUsers,securityBundle};
  }
  function restorePlanHtml(plan){
    const c=plan.counts;const docStat=c.byStore.documents||{};const profileStat=c.byStore.profiles||{};
    const possibleHtml=c.possibleDuplicates?`<div class="notice warning"><strong>${c.possibleDuplicates} possibile versione simile.</strong> Il file non è identico a quello attuale e verrà conservato separatamente. Verifica titolo e data dopo l’importazione.</div>`:'';
    return `<div class="restore-plan-summary"><div><small>Nuovi elementi</small><strong>${c.new}</strong></div><div><small>Nuovi documenti</small><strong>${docStat.new||0}</strong></div><div><small>Duplicati certi</small><strong>${c.duplicates}</strong></div><div><small>Possibili versioni simili</small><strong>${c.possibleDuplicates||0}</strong></div><div><small>Conflitti: resta l’attuale</small><strong>${c.conflicts}</strong></div><div><small>Nuovi profili</small><strong>${profileStat.new||0}</strong></div></div>${possibleHtml}<div class="notice ${plan.mode==='full'?'warning':''}">${plan.mode==='full'?'L’archivio corrente verrà sostituito dopo la creazione automatica di un backup di sicurezza.':c.conflicts?'I conflitti non verranno sovrascritti: resteranno le versioni attuali.':'Nessun dato attuale verrà sovrascritto.'}</div>`;
  }
  async function refreshRestorePlanPreview(context){
    const token=++context.previewToken;const mode=selectedRestoreMode(),mappingSection=$('#restoreMappingSection'),fullConfirm=$('#restoreFullConfirmation'),button=$('#executeBackupUseBtn'),host=$('#restorePlanHost');
    mappingSection?.classList.toggle('hidden',mode==='full');fullConfirm?.classList.toggle('hidden',mode!=='full');if(button)button.textContent=mode==='full'?'Ripristina e sostituisci':mode==='documents'?'Importa soltanto documenti':'Integra dati mancanti';
    if(host)host.innerHTML='<div class="notice">Analisi preventiva in corso: il database non viene modificato.</div>';
    try{const mapping=profileMappingFromDialog(context);const plan=await buildRestorePlan(context,mode,mapping,{restoreUsers:true});if(token!==context.previewToken)return;context.previewPlan=plan;if(host)host.innerHTML=restorePlanHtml(plan);}
    catch(error){if(token!==context.previewToken)return;context.previewPlan=null;if(host)host.innerHTML=`<div class="notice warning"><strong>Operazione non pronta.</strong><br>${esc(error.message)}</div>`;}
  }
  async function preflightRestorePlan(plan){
    const errors=[];let rowsChecked=0;
    for(const store of plan.affectedStores){
      const rows=plan.operations[store]||[],seen=new Set();
      for(const row of rows){
        const key=recordPrimaryKey(store,row);
        if(key===undefined||key===null||String(key)===''){errors.push(`${store}: elemento senza identificativo`);continue;}
        const marker=String(key);if(seen.has(marker)){errors.push(`${store}:${marker} duplicato nel piano di ripristino`);continue;}seen.add(marker);
        if(store==='documents'&&(!(row.fileBlob instanceof Blob)||!row.fileBlob.size))errors.push(`documents:${marker} privo del file originale`);
        if(store==='profiles'&&!row.id)errors.push('profiles: profilo senza identificativo');
        rowsChecked++;
      }
    }
    if(plan.mode==='full'&&!(plan.operations.profiles||[]).length)errors.push('Il ripristino completo non contiene profili sanitari.');
    if(errors.length)throw new Error(`Verifica preventiva non superata: ${errors.slice(0,4).join('; ')}${errors.length>4?'…':''}`);
    if(plan.securityBundle)await DossierSecurity.validateSecurityBackup(plan.securityBundle);
    return rowsChecked;
  }
  async function captureDatabaseSnapshot(){return Object.fromEntries(await Promise.all(RESTORE_DB_STORES.map(async store=>[store,await DossierDB.getAll(store)])));}
  async function restoreDatabaseSnapshot(snapshot){for(const store of RESTORE_DB_STORES){await DossierDB.clear(store);const rows=arrayOrEmpty(snapshot[store]);if(rows.length)await DossierDB.bulkPut(store,rows,{audit:false});}}
  async function validateAppliedPlan(plan){
    const errors=[];let verified=0;
    for(const store of plan.affectedStores){
      const expected=plan.operations[store]||[];
      if(plan.mode==='full'){
        const actual=await DossierDB.getAll(store);if(actual.length!==expected.length)errors.push(`${store}: attesi ${expected.length}, presenti ${actual.length}`);
      }
      for(const row of expected){const key=recordPrimaryKey(store,row);const actual=await DossierDB.get(store,key).catch(()=>null);if(!actual){errors.push(`${store}:${key} non trovato dopo l’importazione`);continue;}if(store==='documents'&&(!(actual.fileBlob instanceof Blob)||!actual.fileBlob.size))errors.push(`documents:${key} privo del file originale`);if(row.profileId&&actual.profileId!==row.profileId)errors.push(`${store}:${key} associato al profilo errato`);verified++;}
    }
    if(errors.length)throw new Error(`Controllo successivo non superato: ${errors.slice(0,4).join('; ')}${errors.length>4?'…':''}`);
    return verified;
  }
  function safetyBackupName(mode){const stamp=new Date().toISOString().replace(/[:.]/g,'-');return `dossier_sanitario_backup_SICUREZZA_PRIMA_${mode}_${stamp}.zip`;}
  async function createMigrationReceipt(plan,verifiedRows){
    const migration=plan.context?.migration;if(!migration)return null;
    const sourceProfileId=String(migration.inner?.profileId||'');
    const receiptSecret=String(migration.inner?.receiptSecret||'');
    const packageSha256=String(migration.outer?.packageSha256||'').toLowerCase();
    if(!sourceProfileId||!receiptSecret||!packageSha256)throw new Error('Il pacchetto di migrazione non contiene i dati necessari per produrre una ricevuta tecnica verificabile.');
    if(Number(verifiedRows||0)<=0)throw new Error('La migrazione non ha importato elementi verificabili: la ricevuta tecnica non può essere emessa.');
    const importedProfile=(plan.dataset?.data?.profiles||[])[0]||{};
    const importedProfileId=String(importedProfile.id||'');if(!importedProfileId)throw new Error('Profilo importato non identificabile dopo la verifica.');
    const receiptId=`rcpt_${globalThis.crypto?.randomUUID?.()||uid('migration')}`;
    const importedAt=new Date().toISOString(),verified=Number(verifiedRows||0);
    const message=`CDMR1|${receiptId}|${packageSha256}|${sourceProfileId}|${importedProfileId}|${importedAt}|${verified}`;
    const key=await crypto.subtle.importKey('raw',unb64(receiptSecret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
    const signature=new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(message)));
    const proof=[...signature].map(x=>x.toString(16).padStart(2,'0')).join('');
    const receipt={format:'profile-migration-receipt',formatVersion:1,receiptId,packageSha256,sourceProfileId,importedProfileId,importedAt,verifiedRows:verified,receiptSecret,proof};
    await DossierDB.put('settings',{key:`profileMigrationReceipt:${packageSha256}`,...receipt,storedAt:new Date().toISOString()},{audit:true,sync:false});
    downloadBlob(new Blob([JSON.stringify(receipt,null,2)],{type:'application/json'}),`clinica_digitale_ricevuta_migrazione_${today()}.cdreceipt`);
    return receipt;
  }

  async function restoreMediaArchiveFiles(plan,notify=()=>{}){
    const dicomRows=plan.operations.dicomStudies||[],imageRows=plan.operations.mediaAttachments||[],tasks=[];
    for(const study of dicomRows)for(const file of study.files||[])if(file.backupPath)tasks.push({kind:'dicom',row:study,file,path:file.backupPath});
    for(const image of imageRows)if(image.backupPath)tasks.push({kind:'image',row:image,path:image.backupPath});
    if(!tasks.length)return 0;if(!globalThis.ClinicaLot2?.storeManagedMedia)throw new Error('Archivio locale immagini non disponibile');let done=0;
    for(const task of tasks){const entry=plan.context.zip.file(task.path);if(!entry){done++;continue;}const blob=await entry.async('blob');if(task.kind==='dicom'){const relative=task.file.relativePath||task.file.name||'file.dcm';await ClinicaLot2.storeManagedMedia('dicom',task.row.profileId,task.row.id,relative,blob);delete task.file.backupPath;task.row.storageMode='managed';task.row.storageName='Archivio locale Clinica Digitale';task.row.backupMediaIncluded=false;}else{const relative=task.row.storagePath||task.row.name||'immagine.jpg';await ClinicaLot2.storeManagedMedia('image',task.row.profileId,task.row.id,relative,blob);delete task.row.backupPath;task.row.storageMode='managed';task.row.backupMediaIncluded=false;}done++;notify(78+(done/Math.max(1,tasks.length))*8,'Ripristino archivio immagini',`${done} / ${tasks.length} file multimediali`);}
    for(const study of dicomRows)await DossierDB.put('dicomStudies',study,{audit:false,sync:false});for(const image of imageRows)await DossierDB.put('mediaAttachments',image,{audit:false,sync:false});return done;
  }

  async function applyRestorePlan(plan,options={}){
    const report={mode:plan.mode,found:plan.context.inspection.report.found,imported:0,duplicates:plan.counts.duplicates,possibleDuplicates:plan.counts.possibleDuplicates||0,possibleDuplicateDetails:plan.counts.possibleDuplicateDetails||[],conflicts:plan.counts.conflicts,createdProfiles:plan.counts.byStore.profiles?.new||0,missing:[],corrupt:[],unassociated:[...plan.context.inspection.report.unassociated],legacy:plan.context.inspection.report.legacy,message:''};
    const notify=(percent,phase,detail='')=>{try{options.onProgress?.({percent,phase,detail});}catch{}};
    notify(1,'Verifica preventiva','Controllo completo del backup prima di modificare l’archivio locale.');await preflightRestorePlan(plan);notify(3,'Preparazione','Salvataggio dello stato corrente per la verifica.');const snapshot=await captureDatabaseSnapshot();let safetyBlob=null;
    try{
      if(!options.skipSafetyBackup){notify(4,'Backup di sicurezza','Preparazione della copia locale precedente al ripristino.');safetyBlob=await buildBackupBlob();if(!options.skipSafetyDownload)downloadBlob(safetyBlob,safetyBackupName(plan.mode));}
      notify(8,'Preparazione database','Apertura delle sezioni da ripristinare.');if(plan.mode==='full')for(const store of plan.affectedStores)await DossierDB.clear(store);
      const order=['profiles','documents','doctors','therapies','diagnoses','exemptions','measurements','weightJourneys','documentVersions','calendarEvents','calendarSuggestions','vaccinations','interventions','symptoms','therapyAdherence','carePlans','dicomStudies','mediaAttachments','trash','settings','users','devices','auditLog','cloudSettings','syncQueue'];
      const totalRows=Math.max(1,order.reduce((n,store)=>n+(plan.operations[store]||[]).length,0));let appliedRows=0;
      for(const store of order){const rows=plan.operations[store]||[];if(rows.length){await DossierDB.bulkPut(store,rows,{audit:false});report.imported+=rows.length;appliedRows+=rows.length;notify(10+(appliedRows/totalRows)*66,'Ripristino dati',`${appliedRows} / ${totalRows} elementi importati`);}}
      await restoreMediaArchiveFiles(plan,notify);notify(87,'Verifica dati','Controllo degli elementi appena ripristinati.');const verifiedRows=await validateAppliedPlan(plan);
      if(plan.securityBundle){notify(90,'Sicurezza e accessi','Ripristino degli account e delle autorizzazioni.');const restoredCloud=(plan.operations.cloudSettings||[]).find(row=>row?.enabled);await DossierSecurity.restoreSecurityBackup(plan.securityBundle,{deviceCloudLinked:Boolean(restoredCloud),archiveId:restoredCloud?.archiveId||''});}if(plan.context?.migration){notify(94,'Ricevuta di migrazione','Generazione della prova tecnica dell’importazione verificata.');await createMigrationReceipt(plan,verifiedRows);}
      notify(96,'Verifica finale','Conferma della coerenza dell’archivio.');report.message=`Operazione “${restoreModeLabel(plan.mode)}” completata: ${report.imported} elementi importati, ${report.duplicates} duplicati già presenti, ${report.possibleDuplicates} possibili versioni simili conservate separatamente, ${report.conflicts} conflitti mantenuti nella versione attuale.`;state.lastRestoreReport=report;
      if(options.skipRefresh!==true){await loadAll();await loadPreferences();render();}
      notify(100,'Ripristino completato',`${report.imported} elementi importati e verificati.`);
      if(plan.securityBundle&&options.skipRefresh!==true){alert(`${report.message}\nUtenti e credenziali sono stati ripristinati. È necessario accedere nuovamente.`);await DossierSecurity.lock('Ripristino completato: accedi nuovamente.');}else toast(report.message);return true;
    }catch(error){
      notify(0,'Ripristino annullato','Ripristino automatico dello stato precedente.');try{await restoreDatabaseSnapshot(snapshot);}catch(rollbackError){console.error('Ripristino automatico dello stato precedente non riuscito:',rollbackError);}report.corrupt=[error.message];report.message=`Operazione annullata e archivio precedente ripristinato: ${error.message}`;state.lastRestoreReport=report;if(options.skipRefresh!==true){await loadAll();await loadPreferences();render();}toast(report.message);return false;
    }
  }
  async function executeBackupUseFromDialog(context){
    const mode=selectedRestoreMode();if(mode==='full'&&String($('#restoreTypedConfirmation')?.value||'').trim().toUpperCase()!=='SOSTITUISCI'){toast('Scrivi SOSTITUISCI per confermare il ripristino completo');return;}
    const button=$('#executeBackupUseBtn');if(button){button.disabled=true;button.textContent='Operazione e controlli in corso';}
    try{const mapping=profileMappingFromDialog(context);const plan=await buildRestorePlan(context,mode,mapping,{restoreUsers:true});closeModal();const ok=await applyRestorePlan(plan);resetBackupInput();return ok;}
    catch(error){toast(`Operazione non avviata: ${error.message}`);if(button){button.disabled=false;button.textContent=mode==='full'?'Ripristina e sostituisci':mode==='documents'?'Importa soltanto documenti':'Integra dati mancanti';}return false;}
  }
  async function restoreZip(file,options={}){
    DossierSecurity.beginTechnicalActivity?.('backup-restore-operation');
    try{
    if(!file)return false;
    if(!options.mode&&!options.replaceAll)return prepareBackupUse(file);
    try{const context=await inspectBackupForUse(file);const mode=options.mode||(options.replaceAll?'full':'merge');const mapping=options.profileMapping||Object.fromEntries(context.profiles.map(info=>[info.profile.id,info.suggestedTarget||'__new__']));const plan=await buildRestorePlan(context,mode,mapping,{restoreUsers:options.importUsers!==false});return applyRestorePlan(plan,options);}
    catch(error){state.lastRestoreReport={mode:options.mode||'merge',found:0,imported:0,duplicates:0,conflicts:0,createdProfiles:0,missing:[],corrupt:[error.message],unassociated:[],message:`Operazione non riuscita: ${error.message}`};toast(state.lastRestoreReport.message);return false;}
    finally{if(options.mode||options.replaceAll)resetBackupInput();}
    }finally{DossierSecurity.endTechnicalActivity?.('backup-restore-operation');}
  }

  function narrativeCoverageFailureReport(errors=[],phase='controllo',profile=activeProfile()||{}) {
    const timestamp=new Intl.DateTimeFormat('it-IT',{dateStyle:'short',timeStyle:'medium'}).format(new Date());
    const lines=[
      'DOSSIER SANITARIO LOCALE',
      'RAPPORTO NOMINATIVO BLOCCO ESPORTAZIONE V6.0.4',
      `Profilo: ${`${profile.firstName||''} ${profile.lastName||''}`.trim()||profile.name||'Non indicato'}`,
      '',
      `Fase: ${phase}`,
      `Generato il: ${timestamp}`,
      `Anomalie rilevate: ${errors.length}`,
      '',
      ...errors.map((error,index)=>`${index+1}. ${error}`),
      '',
      'L’esportazione è stata interrotta per evitare la produzione di un dossier clinicamente incompleto.'
    ];
    return lines.join('\r\n');
  }
  function downloadNarrativeCoverageFailureReport(errors=[],phase='controllo',profile=activeProfile()||{}) {
    if(!errors.length)return;
    const stamp=new Date().toISOString().replace(/[:.]/g,'-');
    const blob=new Blob([narrativeCoverageFailureReport(errors,phase,profile)],{type:'text/plain;charset=utf-8'});
    const who=(`${profile.firstName||''}_${profile.lastName||''}`.trim()||profile.name||'PROFILO').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Za-z0-9_-]+/g,'_').replace(/^_+|_+$/g,'').toUpperCase();
    downloadBlob(blob,`RAPPORTO_BLOCCO_ESPORTAZIONE_${who}_${stamp}.txt`);
  }

  function openExportProgress(profile={},dialogTitle='Esportazione dossier PDF',helperText='Il programma sta lavorando. Non chiudere questa finestra finché la preparazione del PDF non è terminata.') {
    document.querySelector('#exportProgressOverlay')?.remove();
    const overlay=document.createElement('div');overlay.id='exportProgressOverlay';overlay.className='export-progress-overlay';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-live','polite');
    overlay.innerHTML=`<div class="export-progress-card"><div class="export-progress-head"><img src="assets/icon-64.png" alt=""><div><strong>${esc(dialogTitle)}</strong><span>${esc(`${profile.firstName||''} ${profile.lastName||''}`.trim())}</span></div></div><div class="export-progress-body"><div class="export-progress-row"><span id="exportProgressPhase">Preparazione</span><strong id="exportProgressPercent">0%</strong></div><div class="export-progress-track"><span id="exportProgressBar"></span></div><p id="exportProgressDetail">Avvio dell’esportazione…</p><small>${esc(helperText)}</small></div></div>`;
    document.body.appendChild(overlay);
    const bar=overlay.querySelector('#exportProgressBar'),percent=overlay.querySelector('#exportProgressPercent'),phase=overlay.querySelector('#exportProgressPhase'),detail=overlay.querySelector('#exportProgressDetail');
    return{
      async update(value,phaseText,detailText=''){
        const pct=Math.max(0,Math.min(100,Math.round(Number(value)||0)));bar.style.width=`${pct}%`;percent.textContent=`${pct}%`;phase.textContent=phaseText||'Elaborazione';if(detailText)detail.textContent=detailText;await yieldInterface();
      },
      close(){overlay.remove();}
    };
  }

  async function exportPdf() {
    const p=activeProfile();if(!p)return;
    const exportButton=$('#exportPdfBtn');if(exportButton)exportButton.disabled=true;
    const progress=openExportProgress(p);
    try{
      const prefs=currentProfilePreferences();
      await progress.update(2,'Preparazione','Caricamento delle informazioni del profilo.');
      const cardFront=prefs.includeHealthCard?await printAssetDataUrl(p.healthCardFrontBlob||p.healthCardFrontDataUrl||p.healthCardFront):'';
      await progress.update(5,'Preparazione','Preparazione della tessera sanitaria e delle immagini.');
      const cardBack=prefs.includeHealthCard?await printAssetDataUrl(p.healthCardBackBlob||p.healthCardBackDataUrl||p.healthCardBack):'';
      const avatar=p.avatarBlob?await fileToDataUrl(p.avatarBlob):'';
      const doctor=doctorContact(p);
      const exportSource=[...state.documents].filter(d=>d.timelineVisible!==false&&documentIncludedInPdf(d)).sort(compareDocs).map(d=>({...d,labValues:(d.labValues||[]).map(v=>({...v,range:v.range?{...v.range}:v.range})),qualitativeResults:(d.qualitativeResults||[]).map(v=>({...v}))}));
      await progress.update(9,'Controllo clinico',`${exportSource.length} documenti da verificare.`);
      const canonical=await canonicalizeDocuments602(exportSource,p,{persist:true,onProgress:({done,total,document})=>{const pct=9+(total?done/total:1)*27;void progress.update(pct,'Controllo clinico',`Documento ${done}/${total}: ${document?.title||document?.originalName||'documento sanitario'}`);}});
      const docs=canonical.documents;
      applyReferenceSourcesToDocuments(docs,p);
      await progress.update(37,'Preparazione contenuti','Costruzione delle sezioni del dossier.');
    const root=$('#printRoot');delete root.dataset.test25Prepared;delete root.dataset.printLayoutPrepared;root.classList.remove('print-preparing');root.classList.toggle('print-space-saving',prefs.pdfSpaceSaving===true);root.dataset.spaceSaving=prefs.pdfSpaceSaving===true?'true':'false';const updated=new Intl.DateTimeFormat('it-IT').format(new Date());
    const personalRows=[['Data di nascita',formatDate(p.birthDate)],['Codice fiscale',p.taxCode||''],...(p.bloodGroup?[['Gruppo sanguigno',p.bloodGroup]]:[]),...(prefs.includeHealthCard?[['Tessera sanitaria',p.healthCard||'']]:[]),['Telefono',p.phone||''],['Email',p.email||''],['Medico di base',doctor.name||''],...(prefs.includeDoctorPhone&&doctor.phone?[['Telefono medico',doctor.phone]]:[]),['Contatto di emergenza',p.emergencyContact||'']];
    const activeTherapies=orderedTherapies(state.therapies.filter(t=>t.active!==false),prefs.therapySort||'time-asc');
    const diagnoses=[...state.diagnoses].sort((a,b)=>diagnosisCompare(a,b,prefs.diagnosisSort||'date-desc'));
    const diagnosisEvents=diagnosisHistoryRows(diagnoses);
    const mainDiagnoses=diagnoses.filter(d=>d.mainProblem===true||String(d.mainProblem)==='true');
    const diagnosisMode=prefs.pdfDiagnosisMode||'both';
    const mainDiagnosisHtml=(diagnosisMode==='both'||diagnosisMode==='main')?`<h2>Diagnosi e problemi principali</h2>${mainDiagnoses.length?mainDiagnoses.map(d=>{const clean=diagnosisDisplayText(d.summary||d.notes||'');return `<article class="print-diagnosis-main print-diagnosis-compact"><h3>${esc(d.name)}</h3><p><strong>${esc(d.status||'Da verificare')}</strong>${d.date?` · aggiornato al ${formatDate(d.date)}`:''}${d.specialization?` · ${esc(d.specialization)}`:''}</p>${clean&&!HealthReport.isNonInformativeClinicalValue?.(clean)?`<p>${multilineHtml(clean)}</p>`:''}</article>`;}).join(''):'<p>Nessun problema principale selezionato.</p>'}`:'';
    const diagnosisTableRows=diagnosisEvents.map(d=>{
      const rawNote=diagnosisDisplayText(d.notes||d.sourceQuote||'');const note=HealthReport.isNonInformativeClinicalValue?.(rawNote)?'':rawNote;
      return `<tr class="print-splittable-row"><td>${esc(d.date?formatDate(d.date):'Non definita')}</td><td><strong>${esc(d.name)}</strong>${d.specialization?`<br>${esc(d.specialization)}`:''}</td><td>${esc(d.category||'Dato da verificare')}<br>${esc(d.status||'Da verificare')}</td><td class="print-multiline">${multilineHtml(note)}</td></tr>`;
    }).join('');
    const diagnosisTableHtml=(diagnosisMode==='both'||diagnosisMode==='table')?`<h2>Cronologia completa di diagnosi, problemi ed eventi clinici</h2>${diagnosisEvents.length?`<table class="print-table print-diagnosis-table"><colgroup><col style="width:11%"><col style="width:31%"><col style="width:20%"><col style="width:38%"></colgroup><thead><tr><th>Anno / Data</th><th>Condizione</th><th>Categoria / Stato</th><th>Note</th></tr></thead><tbody>${diagnosisTableRows}</tbody></table>`:'<p>Nessuna condizione registrata.</p>'}`:'';
    const graphRows=HealthCharts.collect(state.documents);const params=orderGraphParameters(HealthCharts.groupParameters(graphRows));const selectedGraphs=new Set(prefs.selectedGraphs||[]);
    const clinicalGraphCards=prefs.pdfIncludeGraphs?params.filter(param=>selectedGraphs.has(param.id)).map(param=>{const id=param.id;const unit=param.units?.[0];if(!unit)return'';const series=graphRows.filter(r=>r.parameterId===id&&r.unitKey===unit.key).sort((a,b)=>(a.clinicalDate||'').localeCompare(b.clinicalDate||''));if(!series.length)return'';return `<article class="print-graph-card"><h3>${esc(param.name)}</h3><p>Andamento storico · ${esc(unit.label)} · ${series.length} rilevazioni</p><div class="chart-shell">${HealthCharts.svg(series,{unit:unit.label,print:true})}</div></article>`;}).filter(Boolean):[];
    const weights=measurementsOf('weight');const journey=activeJourney();const jm=journeyMetrics(journey);const bodyRows=state.measurements.filter(x=>BODY_TYPES.includes(x.type)&&x.type!=='weight').sort((a,b)=>measurementDateTime(a).localeCompare(measurementDateTime(b)));const pressureRows=measurementsOf('blood_pressure');const spo2Rows=measurementsOf('spo2');const glucoseRows=measurementsOf('glucose');const heartRows=measurementsOf('heart_rate');
    const weightTable=weights.length?`<h3>Peso corporeo</h3><table class="print-table print-monitor-table"><thead><tr><th>Data</th><th>Peso</th><th>Diff. precedente</th><th>Diff. inizio</th><th>Note</th></tr></thead><tbody>${weights.map((r,i)=>{const prev=i?weights[i-1]:null;const first=Number(weights[0]?.value);const delta=i?Number(r.value)-Number(prev.value):0;const total=Number(r.value)-first;return `<tr><td>${formatDate(r.date)}</td><td><strong>${HealthCharts.fmt(r.value)} kg</strong></td><td>${delta>0?'+':''}${HealthCharts.fmt(delta)} kg</td><td>${total>0?'+':''}${HealthCharts.fmt(total)} kg</td><td class="print-multiline">${multilineHtml(r.notes||'')}</td></tr>`}).join('')}</tbody></table>`:'';
    const bodyTable=bodyRows.length?`<h3>Misurazioni corporee</h3><table class="print-table print-monitor-table"><thead><tr><th>Data</th><th>Parametro</th><th>Valore</th><th>Diff. precedente</th><th>Note</th></tr></thead><tbody>${bodyRows.map(r=>{const typed=measurementsOf(r.type);const idx=typed.findIndex(x=>x.id===r.id);const prev=idx>0?typed[idx-1]:null;const delta=prev?Number(r.value)-Number(prev.value):null;return `<tr><td>${formatDate(r.date)}</td><td>${esc(measurementLabel(r.type))}</td><td><strong>${HealthCharts.fmt(r.value)} ${esc(r.unit||'')}</strong></td><td>${delta===null?'Prima rilevazione':`${delta>0?'+':''}${HealthCharts.fmt(delta)} ${esc(r.unit||'')}`}</td><td class="print-multiline">${multilineHtml(r.notes||'')}</td></tr>`}).join('')}</tbody></table>`:'';
    const vitalTable=(title,rows)=>rows.length?`<h3>${esc(title)}</h3><table class="print-table print-monitor-table"><thead><tr><th>Data e ora</th><th>Valore</th><th>Contesto</th><th>Dispositivo / Fonte</th><th>Note</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${formatDate(r.date)}${r.time?`<br>${esc(r.time)}`:''}</td><td><strong>${esc(displayMeasurementValue(r))}</strong></td><td>${esc(r.measurementContext||r.context||'')}</td><td>${esc(r.device||r.source||'')}</td><td class="print-multiline">${multilineHtml(r.notes||'')}</td></tr>`).join('')}</tbody></table>`:'';
    const journeyHeight=Number(journey?.heightCm||latestNumeric('height'));const printGoal=journeyGoalDistance(jm);const printGoalText=!printGoal?'':printGoal.status==='missing'?`Mancano ${HealthCharts.fmt(printGoal.kg)} kg all’obiettivo`:printGoal.status==='passed'?`Obiettivo superato di ${HealthCharts.fmt(printGoal.kg)} kg`:'Obiettivo raggiunto';
    const journeyHtml=journey&&jm?`<h3>Percorso peso</h3><table class="print-table"><tbody><tr><th>Inizio</th><td>${formatDate(journey.startDate)} · ${weightBmiLabel(jm.start,journeyHeight)}</td></tr><tr><th>Obiettivo</th><td>${formatDate(journey.targetDate)} · ${weightBmiLabel(jm.target,journeyHeight)}</td></tr><tr><th>Ultimo peso</th><td>${weightBmiLabel(jm.current,journeyHeight)}</td></tr>${printGoalText?`<tr><th>Distanza dall’obiettivo</th><td>${esc(printGoalText)}</td></tr>`:''}<tr><th>Avanzamento</th><td>${Math.round(jm.progress)}%</td></tr></tbody></table>`:'';
    const silhouettePrint=prefs.monitorPdfSilhouette?`<div id="body-summary" class="print-silhouette-wrap">${silhouetteHtml()}<div><h3>Riepilogo corporeo</h3><p>La sagoma è una rappresentazione puramente orientativa determinata dal sesso registrato nel profilo e dall’ultimo peso disponibile. I valori numerici nelle tabelle costituiscono il dato principale.</p></div></div>`:'';
    const monitorTablesHtml=state.measurements.length||journey?`<section id="monitoring-personal" class="print-page print-section print-flow-section print-macro-section print-monitor-section"><h2>Monitoraggio personale</h2>${journeyHtml}${weightTable}${bodyTable}${vitalTable('Pressione arteriosa',pressureRows)}${vitalTable('Saturazione ossigeno',spo2Rows)}${vitalTable('Glicemia domestica',glucoseRows)}${vitalTable('Frequenza cardiaca',heartRows)}${silhouettePrint}</section>`:'';
    const selectedMonitorGraphs=new Set(prefs.monitorPdfGraphs||[]);const monitorGraphCards=[...selectedMonitorGraphs].filter(type=>MONITOR_GRAPH_TYPES.includes(type)).map(type=>{const data=monitorGraphData(type);const count=data.series.reduce((n,x)=>n+x.points.length,0);if(!count)return'';return `<article class="print-graph-card print-monitor-chart"><h3>${esc(data.title)}</h3><p>Andamento del monitoraggio personale · ${count} rilevazioni</p><div class="chart-shell">${HealthCharts.timelineSvg(data.series,{axisLabel:data.axis,references:data.references||[],ariaLabel:data.title})}</div></article>`;}).filter(Boolean);
    const allGraphCards=[...clinicalGraphCards,...monitorGraphCards];const graphsHtml=allGraphCards.length?`<section class="print-section print-flow-section print-graphs-section"><div class="print-graphs-start"><h2>Grafici</h2>${allGraphCards[0]}</div>${allGraphCards.slice(1).join('')}</section>`:'';
    const interpretationLegend=HealthReport.automaticInterpretationLegend?.(docs)||'';
    const personalSectionHtml=`<section class="print-page print-section print-flow-section print-macro-section print-personal-section"><h2>Scheda personale</h2><table class="print-table print-compact-table"><tbody>${personalRows.map(r=>`<tr><th>${esc(r[0])}</th><td>${esc(r[1])}</td></tr>`).join('')}</tbody></table></section>`;
    const healthCardSectionHtml=prefs.includeHealthCard?`<section class="print-page print-section print-flow-section print-macro-section print-health-card-section print-health-card-page-section"><h2>Tessera sanitaria</h2>${cardFront||cardBack?`<div class="print-health-card">${cardFront?`<figure><img src="${cardFront}" alt="Fronte tessera sanitaria"><figcaption>Fronte</figcaption></figure>`:''}${cardBack?`<figure><img src="${cardBack}" alt="Retro tessera sanitaria"><figcaption>Retro</figcaption></figure>`:''}</div>`:`<p>Immagini della tessera non disponibili. Numero registrato: ${esc(p.healthCard||'Non indicato')}.</p>`}</section>`:'';
    const mainDiagnosisSectionHtml=mainDiagnosisHtml?`<section class="print-page print-section print-flow-section print-macro-section print-main-diagnosis-section">${mainDiagnosisHtml}</section>`:'';
    const diagnosisHistorySectionHtml=diagnosisTableHtml?`<section class="print-page print-section print-flow-section print-macro-section print-diagnosis-history-section">${diagnosisTableHtml}</section>`:'';
    const therapiesSectionHtml=`<section class="print-page print-section print-flow-section print-macro-section print-treatment-section"><h2>Terapie farmacologiche in corso</h2>${activeTherapies.length?`<table class="print-table print-therapy-table">${therapyColgroup(activeTherapies)}<thead><tr><th>Orario</th><th>Farmaco</th><th>Principio attivo</th><th>Dosaggio</th><th>Frequenza / Note</th></tr></thead><tbody>${activeTherapies.map(t=>`<tr><td>${esc(formatTherapyTime(t.time||t.schedule||''))}</td><td><strong>${esc(t.medication)}</strong>${t.manufacturer||t.medicineType?`<br><span class="print-subtext">${esc([t.manufacturer,t.medicineType].filter(Boolean).join(' · '))}</span>`:''}</td><td>${esc(t.activeIngredient||'')}</td><td>${esc(t.dosage||'')}</td><td class="print-multiline">${multilineHtml(therapyScheduleText(t))}</td></tr>`).join('')}</tbody></table>`:'<p>Nessuna terapia attiva.</p>'}</section>`;
    const exemptionsSectionHtml=`<section class="print-page print-section print-flow-section print-macro-section print-exemptions-section"><h2>Esenzioni</h2>${state.exemptions.length?(prefs.exemptionView==='extended'?`<div class="print-exemptions-extended">${state.exemptions.map(x=>`<article class="print-exemption-card"><header><strong>${esc(x.code||'Senza codice')}</strong><span>${esc(x.description||'')}</span></header><div class="print-exemption-meta">${x.validFrom?`<span><b>Validità</b> Dal ${formatDate(x.validFrom)}${x.expiry?` · ${esc(x.expiry)}`:''}</span>`:''}${x.issuer?`<span><b>Ente</b> ${esc(x.issuer)}</span>`:''}</div>${x.limitations?`<div><b>Prestazioni</b><p class="print-multiline">${multilineHtml(x.limitations)}</p></div>`:''}${x.notes&&!HealthReport.isNonInformativeClinicalValue?.(x.notes)?`<div><b>Note</b><p class="print-multiline">${multilineHtml(x.notes)}</p></div>`:''}</article>`).join('')}</div>`:`<table class="print-table print-exemption-compact"><thead><tr><th>Codice</th><th>Patologia / descrizione</th></tr></thead><tbody>${state.exemptions.map(x=>`<tr><td><strong>${esc(x.code||'')}</strong></td><td>${esc(x.description||'')}</td></tr>`).join('')}</tbody></table>`):'<p>Nessuna esenzione registrata.</p>'}</section>`;
    root.innerHTML=`<section class="print-page print-cover modern-pdf-cover"><div class="modern-cover-topline"><p class="modern-cover-kicker">Archivio sanitario personale</p><p class="modern-cover-motto">Salute<br>informazione<br>continuità</p></div><div class="modern-cover-title"><h1>Dossier sanitario</h1><p class="modern-cover-subtitle">La tua storia clinica, sempre con te.</p></div><div class="modern-cover-patient"><p class="modern-cover-label">Paziente</p><h2>${esc(p.firstName)} ${esc(p.lastName)}</h2><dl class="modern-cover-meta"><dt>Data di nascita</dt><dd>${formatDate(p.birthDate)}</dd><dt>Medico di base</dt><dd>${esc(doctor.name||'Non indicato')}${prefs.includeDoctorPhone&&doctor.phone?`<br>${esc(doctor.phone)}`:''}</dd><dt>Aggiornato al</dt><dd>${updated}</dd></dl></div><div class="modern-cover-summary"><div><strong>${docs.length}</strong><span>documenti clinici</span></div><div><strong>${activeTherapies.length}</strong><span>terapie attive</span></div><div><strong>${diagnoses.length}</strong><span>eventi clinici</span></div></div><div class="modern-cover-product"><div><strong>Clinica Digitale - Dossier Sanitario</strong><span>Per maggiori informazioni e per scaricare gratuitamente il programma: <b>www.dossiersanitario.it</b></span></div><img class="modern-cover-qr" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAASgAAAEoAQAAAADDfFG0AAABfElEQVR42u2Zy27EMAwDOUX//5fZgyTn5d3tsQWYQxAYPA1omlawfvF8Kaqooorqr6m+JYn6tjAWFpKP1fC68ZKLGkLCksyxGl5PFTQgYyGfV8PrpcpCyJTJkl8fVOC2lgmvN/l1pmQ0Mebw2vNqN2GMZUxTC6/bg3dr+LoeXhcVq0sIakeash3h9VS5XYWwaUYg08EfXld/oaN2tbv6O/7a+qtoYQvmKlRrDq+nvyy3v7DVLQytQzK8rioAu5N/TgCtO2R4XfuXp1pgsZrEHJHhtekTrELf0xx3BUt+7fajzXlGoWNrJr9252OdhKacVsHf7/DanY/HdbFjyxKyk1+7+yOVU7g+q37R8+nwuvMqMjPZYb3XQCe8tvMJpqfOy+R/x6Z/jbXM/B66uS68Lrx0DrHKfp9u3+F159WskKu1TrO3kvdbXivrPaHWt8n0rzcq1HWV7vc4/X7rr/V/aDoXq4GF15MXy18zyddsR9InXvavJFNUUUX1j1Q/kVmgg2GquzYAAAAASUVORK5CYII=" alt="QR www.dossiersanitario.it"></div><p class="modern-cover-footer">Questo dossier sanitario è stato creato con Clinica Digitale - Dossier Sanitario. I referti originali restano archiviati e consultabili nel Dossier.</p></section>
      ${personalSectionHtml}${healthCardSectionHtml}${mainDiagnosisSectionHtml}${diagnosisHistorySectionHtml}${interpretationLegend}${therapiesSectionHtml}${exemptionsSectionHtml}
      ${HealthReport.chronologicalIndexHtml(docs,{formatDate,extended:prefs.pdfSpaceSaving!==true,profile:p,documents:docs,monitorLinks:monitorTablesHtml?[{href:'#monitoring-personal',label:'Monitoraggio personale'},...(silhouettePrint?[{href:'#body-summary',label:'Riepilogo corporeo'}]:[])]:[]})}${docs.map(d=>HealthReport.documentHtml(d,{formatDate,formatDateTime,profile:p,documents:docs})).join('')}${graphsHtml}${monitorTablesHtml}`;
    if(graphsHtml){const lastDocument=[...root.querySelectorAll('.print-document')].at(-1);lastDocument?.classList.add('print-document-before-graphs');}
    await progress.update(48,'Validazione clinica','Controllo che tutti i referti canonici siano presenti e puliti.');
    const narrativeErrorsBefore=HealthReport.validateNarrativeCoverage?.(docs,root)||[];
    if(narrativeErrorsBefore.length){console.error('Esportazione bloccata: contenuti narrativi mancanti',narrativeErrorsBefore);downloadNarrativeCoverageFailureReport(narrativeErrorsBefore,'prima dell’impaginazione',p);toast(`Esportazione annullata: ${narrativeErrorsBefore.length} anomalie cliniche. Rapporto nominativo scaricato.`);return;}
    await progress.update(53,'Preparazione grafica','Caricamento delle immagini e degli elementi grafici.');
    await waitForPrintAssets(root);
    await progress.update(58,'Impaginazione','Calcolo delle pagine del dossier.');
    await HealthReport.preparePrintLayout?.(root,{spaceSaving:prefs.pdfSpaceSaving===true,onProgress:info=>{const ratio=Math.max(0,Math.min(1,Number(info?.ratio||0)));void progress.update(58+ratio*34,'Impaginazione',info?.label||'Composizione delle pagine.');}});
    const layoutOverflowCount=Number(root.dataset.printLayoutOverflowCount||0);
    if(layoutOverflowCount>0){const layoutError=root.dataset.printLayoutError||`${layoutOverflowCount} pagine oltre l’area utile`;console.error('Esportazione bloccata: errore di impaginazione V6.0.4',layoutError);toast(`Esportazione annullata: ${layoutError}.`);return;}
    await progress.update(94,'Verifica finale','Controllo del contenuto dopo l’impaginazione.');
    const narrativeErrorsAfter=HealthReport.validateNarrativeCoverage?.(docs,root)||[];
    if(narrativeErrorsAfter.length){console.error('Esportazione bloccata dopo impaginazione',narrativeErrorsAfter);downloadNarrativeCoverageFailureReport(narrativeErrorsAfter,'dopo l’impaginazione',p);toast(`Esportazione annullata: ${narrativeErrorsAfter.length} anomalie dopo l’impaginazione. Rapporto nominativo scaricato.`);return;}
    await progress.update(100,'Pronto','Dossier preparato. Apertura della finestra di stampa.');
    progress.close();
    toast('Si aprirà la stampa del dossier. Scegli “Salva come PDF”.');setTimeout(()=>window.print(),150);
    }catch(error){console.error('Esportazione PDF non riuscita:',error);toast(`Esportazione non riuscita: ${error?.message||error}`);}
    finally{progress.close();if(exportButton)exportButton.disabled=false;}
  }

  function originalDocumentFileName(doc={}) {
    const raw=String(doc.originalName||'').trim();if(raw&&!/^(?:blob|documento)[_-]?[a-f0-9-]{12,}$/i.test(raw))return raw;
    const mime=String(doc.mimeType||'').toLowerCase();const ext=raw.includes('.')?'.'+raw.split('.').pop():(mime.includes('pdf')?'.pdf':mime.includes('png')?'.png':mime.includes('jpeg')||mime.includes('jpg')?'.jpg':'');
    const title=String(doc.title||'documento sanitario').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[\\/:*?"<>|]+/g,' ').replace(/\s+/g,' ').trim()||'documento sanitario';
    return `${title}${ext}`;
  }
  async function openOriginalWithName(blob,doc={}) {
    const name=originalDocumentFileName(doc),mime=String(doc.mimeType||blob?.type||'application/octet-stream');
    const response=await fetch('http://127.0.0.1:8896/api/document-preview/start',{method:'POST',headers:{'X-File-Name':encodeURIComponent(name),'X-Mime-Type':mime},body:blob,cache:'no-store'});
    const data=await response.json().catch(()=>({}));if(!response.ok||data.ok===false||!data.url)throw new Error(data.error||'Anteprima non disponibile');
    window.open(data.url,'_blank','noopener');
  }
  function downloadBlob(blob,name) { const a=document.createElement('a'); const url=URL.createObjectURL(blob); a.href=url;a.download=String(name||'documento');document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000); }
  function toast(message) { const t=$('#toast');t.textContent=message;t.classList.remove('hidden');clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.classList.add('hidden'),3500); }

  async function checkScheduledBackup() {
    if (!state.archiveHandle) return;
    const frequency=localStorage.getItem('backupFrequency')||'weekly'; if (frequency==='manual') return;
    const last=localStorage.getItem('lastBackupAt'); const days=frequency==='daily'?1:frequency==='monthly'?30:7;
    if (!last || Date.now()-new Date(last).getTime()>days*86400000) syncAllToFolder(false);
  }

  // FIX24: la Versione per medico riceve, per il profilo attivo, la stessa
  // collezione clinica gia preparata che alimenta renderGraphs(). Nessun secondo
  // parser o classificatore viene usato per ricostruire le serie nella copia.
  globalThis.DossierDoctorGraphSource=(profileId)=>profileId===state.activeProfileId?state.documents:null;

  const testApi=globalThis.__DOSSIER_TEST__?{state,normalizeTimeValue,formatTherapyTime,compareTherapies,diagnosisCompare,normalizeClinicalText,cleanDiagnosisName,isNonDiagnosticDiagnosis,diagnosisDisplayText,diagnosisCanonicalKey,normalizedDiagnosis,mergeDiagnosisRecords,repairDiagnosesForProfile,findEquivalentDiagnosis,linkDiagnosisUpdate,diagnosisHistoryRows,isClinicallyRelevantDiagnosis,genericDiagnosisCandidatesFromDocument,documentClinicalText,lineMatchesDiagnosisQuery,searchDiagnosisEvidence,levenshteinDistance,proposeDiagnosesFromDocuments,openDiagnosisDocumentSearch,multilineHtml,combineMultiline,measurementDateTime,measurementsOf,journeyMetrics,bmiFromWeightHeight,formatBmi,weightBmiLabel,journeyGoalDistance,calorieEstimate,displayMeasurementValue,monitorGraphData,interpretationSnapshot,duplicateComparisonHtml,renderTherapies,renderExemptions,renderDiagnoses,renderPreferences,renderMonitorHome,renderMonitorWeight,renderMonitorBody,renderMonitorGraphs,renderMonitorPreferences,exportPdf,currentProfilePreferences,graphParameterSortDescriptor,orderGraphParameters,applyReferenceSourcesToDocuments,externalReferenceFor,inferredProfileSex,specialClinicalResultResolution,detectBloodGroup22,bloodGroupEvidence22,runTest22TargetedMaintenance,rollbackTest22ClinicalMigration,buildBackupBlob,verifyBackupBlob,restoreZip,prepareBackupUse,inspectBackupForUse,buildRestorePlan,applyRestorePlan,loadBackupDataset,profileIdentityScore,probableDocumentVersion,normalizedDocumentStem,backupHash,sameRecord,calendarDateAdd,calendarSuggestionDateAllowed,calendarSuggestionsForDocument,calendarSuggestionDecisionKey,refreshCalendarSuggestionsFromDocuments,aggregateFamilyMedicationEvents,calendarOperationalEvents,calendarFamilyChildIds,calendarCanManageFamilyMedication,renderGraphs,medicationReorderLeadDays,medicationRequiresPrescription,medicationReorderCandidateForStock,medicationReorderGroups,medicationReorderEventFromGroup}:null;
  return testApi?{init,__test:testApi}:{init,buildBackupBlob,restoreZip,refreshAfterExternalRestore:async()=>{await loadAll();await loadPreferences();await loadFamilyAgendaContext();void syncLocalCalendarAlerts({silent:true,force:true});render();},toast};
})();

// Lifecycle 1.0.0: the engine owns no persistent background process.
// A long-lived loopback lease follows the actual Dossier tab even when browser
// timers are throttled in the background. When the tab/browser disappears the
// TCP lease closes and the engine enters the same short graceful shutdown used
// by pagehide. Heartbeats remain diagnostic only.
(() => {
  const API='http://127.0.0.1:8896/api/app';
  const lifecycleId=globalThis.crypto?.randomUUID?.()||`${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
  const payload=()=>JSON.stringify({lifecycleId});
  let timer=0,started=false,lease=null;
  const heartbeat=()=>fetch(`${API}/heartbeat`,{method:'POST',headers:{'Content-Type':'application/json'},body:payload(),cache:'no-store'}).catch(()=>{});
  const start=()=>{
    if(started)return;started=true;heartbeat();timer=window.setInterval(heartbeat,5000);
    try{lease=new EventSource(`${API}/lease?lifecycleId=${encodeURIComponent(lifecycleId)}`);}catch(_e){lease=null;}
  };
  const closing=()=>{
    if(!started)return;
    started=false;
    if(timer){window.clearInterval(timer);timer=0;}
    try{lease?.close();}catch(_e){} lease=null;
    try{
      const body=payload();
      const blob=new Blob([body],{type:'application/json'});
      if(navigator.sendBeacon)navigator.sendBeacon(`${API}/closing`,blob);
      else fetch(`${API}/closing`,{method:'POST',headers:{'Content-Type':'application/json'},body,keepalive:true}).catch(()=>{});
    }catch(_e){}
  };
  window.addEventListener('pagehide',closing,{capture:true});
  window.addEventListener('beforeunload',closing,{capture:true});
  globalThis.__DOSSIER_START_LIFECYCLE__=start;
})();

async function claimPrimaryDossierTab(){
  if(!navigator.locks?.request)return true;
  return new Promise(resolve=>{
    navigator.locks.request('clinica-digitale-dossier-primary-ui',{mode:'exclusive',ifAvailable:true},lock=>{
      if(!lock){resolve(false);return;}
      resolve(true);
      return new Promise(()=>{});
    }).catch(()=>resolve(true));
  });
}
function showSecondaryDossierTab(){
  document.body.innerHTML=`<main style="min-height:100vh;display:grid;place-items:center;background:#f3f7f7;padding:24px;font-family:Segoe UI,Arial,sans-serif;color:#1f2937"><section style="width:min(560px,100%);background:white;border:1px solid #dbe8e6;border-radius:18px;padding:28px;box-shadow:0 18px 45px rgba(15,118,110,.12)"><strong style="color:#0f766e">CLINICA DIGITALE</strong><h1 style="margin:8px 0 12px">Dossier già aperto</h1><p>È già attiva un’altra scheda del Dossier su questo computer. Per evitare operazioni duplicate, questa seconda scheda non viene avviata.</p><p>Usa la scheda già aperta oppure chiudila e premi Riprova.</p><button type="button" onclick="location.reload()" style="border:0;border-radius:10px;background:#0f766e;color:white;padding:11px 18px;font-weight:700;cursor:pointer">Riprova</button></section></main>`;
}
document.addEventListener('DOMContentLoaded',async()=>{
  const primary=await claimPrimaryDossierTab();
  if(!primary){showSecondaryDossierTab();return;}
  globalThis.__DOSSIER_START_LIFECYCLE__?.();
  return DossierSecurity.bootstrap(async()=>{if(globalThis.DossierDiagnostics)await DossierDiagnostics.ensureAccepted();return App.init();});
},{once:true});
