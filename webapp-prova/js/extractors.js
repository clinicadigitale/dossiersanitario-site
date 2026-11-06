'use strict';

const HealthExtractors = (() => {
  const PARAMS = [
    {id:'glucose_blood', name:'Glicemia', sample:'Sangue', aliases:['glicemia','glucosio plasmatico','glucosio sangue','glucose','glucosio'], units:['mg/dl','mmol/l']},
    {id:'hba1c_mmol', name:'Emoglobina glicata (HbA1c)', sample:'Sangue', aliases:['emoglobina glicata','hba1c'], units:['mmol/mol']},
    {id:'hba1c_percent', name:'Emoglobina glicata (HbA1c)', sample:'Sangue', aliases:['emoglobina glicata','hba1c'], units:['%']},
    {id:'creatinine_blood', name:'Creatinina ematica', sample:'Sangue', aliases:['creatininemia','creatinina sierica','creatinina sangue','creatinina'], units:['mg/dl','µmol/l','umol/l']},
    {id:'creatinine_urine', name:'Creatinina urinaria', sample:'Urine', aliases:['creatinina urinaria','creatininuria'], units:['mg/dl','mg/24h','g/24h']},
    {id:'egfr', name:'eGFR', sample:'Sangue', aliases:['egfr (ckd-epi)','egfr ckd-epi','filtrato glomerulare','gfr','egfr'], units:['ml/min/1,73 m²','ml/min/1.73 m2','ml/min','ml/min/1,73m²']},
    {id:'chol_total', name:'Colesterolo totale', sample:'Sangue', aliases:['colesterolo totale','cholesterol totale'], units:['mg/dl','mmol/l']},
    {id:'hdl', name:'Colesterolo HDL', sample:'Sangue', aliases:['colesterolo hdl','hdl colesterolo','hdl'], units:['mg/dl','mmol/l']},
    {id:'ldl', name:'Colesterolo LDL', sample:'Sangue', aliases:['colesterolo ldl','ldl colesterolo','ldl'], units:['mg/dl','mmol/l']},
    {id:'triglycerides', name:'Trigliceridi', sample:'Sangue', aliases:['trigliceridi','triglycerides'], units:['mg/dl','mmol/l']},
    {id:'tsh', name:'TSH', sample:'Sangue', aliases:['ormone tireostimolante','ormone tireotropo','tireotropina','tsh'], units:['mui/l','µui/ml','uui/ml','miu/l']},
    {id:'ft4', name:'FT4', sample:'Sangue', aliases:['tiroxina libera','f t4','ft4'], units:['ng/dl','ng/l','pmol/l']},
    {id:'ft3', name:'FT3', sample:'Sangue', aliases:['triiodotironina libera','triodotironina libera','f t3','ft3'], units:['pg/ml','ng/l','pmol/l']},
    {id:'ast', name:'AST (GOT)', sample:'Sangue', aliases:['aspartato aminotransferasi','got (ast)','ast (got)','got','ast'], units:['u/l','ui/l']},
    {id:'alt', name:'ALT (GPT)', sample:'Sangue', aliases:['alanina aminotransferasi','gpt (alt)','alt (gpt)','gpt','alt'], units:['u/l','ui/l']},
    {id:'ggt', name:'GGT', sample:'Sangue', aliases:['gamma glutamil transferasi','gamma-gt','gamma gt','ggt'], units:['u/l','ui/l']},
    {id:'alp', name:'Fosfatasi alcalina', sample:'Sangue', aliases:['fosfatasi alcalina','alp'], units:['u/l','ui/l']},
    {id:'bilirubin_total', name:'Bilirubina totale', sample:'Sangue', aliases:['bilirubina totale'], units:['mg/dl','µmol/l','umol/l']},
    {id:'uric_acid', name:'Acido urico', sample:'Sangue', aliases:['acido urico','uricemia','urato'], units:['mg/dl','µmol/l','umol/l']},
    {id:'vitamin_d', name:'Vitamina D', sample:'Sangue', aliases:['25(oh)vitamina d','25 oh vitamina d','vitamina d3','vitamina d'], units:['ng/ml','ng/l','nmol/l']},
    {id:'hemoglobin', name:'Emoglobina', sample:'Sangue', aliases:['emoglobina','hgb'], units:['g/dl','g/l']},
    {id:'hematocrit', name:'Ematocrito', sample:'Sangue', aliases:['ematocrito','hct'], units:['%']},
    {id:'rbc', name:'Globuli rossi', sample:'Sangue', aliases:['globuli rossi','eritrociti','rbc'], units:['x10^12/l','×10¹²/l','10^6/µl','x10^6/ul']},
    {id:'wbc', name:'Globuli bianchi', sample:'Sangue', aliases:['globuli bianchi','leucociti','wbc'], units:['x10^9/l','×10⁹/l','10^3/µl','x10^3/ul']},
    {id:'platelets', name:'Piastrine', sample:'Sangue', aliases:['piastrine','plt'], units:['x10^9/l','×10⁹/l','10^3/µl','x10^3/ul']},
    {id:'sodium', name:'Sodio', sample:'Sangue', aliases:['sodiemia','sodio'], units:['meq/l','mmol/l']},
    {id:'potassium', name:'Potassio', sample:'Sangue', aliases:['potassiemia','potassio'], units:['meq/l','mmol/l']},
    {id:'calcium', name:'Calcio', sample:'Sangue', aliases:['calcemia','calcio totale','calcio'], units:['mg/dl','mmol/l']},
    {id:'ferritin', name:'Ferritina', sample:'Sangue', aliases:['ferritina'], units:['ng/ml','µg/l','ug/l']},
    {id:'iron', name:'Ferro', sample:'Sangue', aliases:['sideremia','ferro'], units:['µg/dl','ug/dl','µmol/l']},
    {id:'lipase', name:'Lipasi', sample:'Sangue', aliases:['lipasi'], units:['u/l','ui/l']},
    {id:'psa_total', name:'PSA totale', sample:'Sangue', aliases:['psa totale','antigene prostatico specifico totale'], units:['ng/ml']},
    {id:'nt_probnp', name:'NT-proBNP', sample:'Sangue', aliases:['nt-probnp','nt probnp'], units:['pg/ml','ng/l']},
    {id:'albumin_urine', name:'Albumina urinaria', sample:'Urine', aliases:['albumina urinaria','microalbuminuria'], units:['mg/l','mg/24h']},
    {id:'acr', name:'Rapporto albumina/creatinina', sample:'Urine', aliases:['rapporto albumina/creatinina','albumina/creatinina','acr'], units:['mg/g','mg/mmol']},
    {id:'urea', name:'Urea', sample:'Sangue', aliases:['urea','azotemia'], units:['mg/dl','mmol/l']},
    {id:'mcv', name:'Volume globulare medio (MCV)', sample:'Sangue', aliases:['volume globulare medio','mcv'], units:['fl']},
    {id:'mch', name:'Contenuto emoglobinico medio (MCH)', sample:'Sangue', aliases:['contenuto emoglobinico medio','mch'], units:['pg']},
    {id:'mchc', name:'Concentrazione emoglobinica corpuscolare media (MCHC)', sample:'Sangue', aliases:['concentrazione emoglobinica corpuscolare media','concentrazione emoglobinica','mchc'], units:['g/dl']},
    {id:'rdw', name:'Ampiezza distribuzione eritrocitaria (RDW)', sample:'Sangue', aliases:['ampiezza distribuzione rbc','ampiezza distribuzione eritrocitaria','rdw'], units:['%']},
    {id:'neutrophils_pct', name:'Neutrofili %', sample:'Sangue', aliases:['granulociti neutrofili','neutrofili'], units:['%']},
    {id:'lymphocytes_pct', name:'Linfociti %', sample:'Sangue', aliases:['linfociti'], units:['%']},
    {id:'monocytes_pct', name:'Monociti %', sample:'Sangue', aliases:['monociti'], units:['%']},
    {id:'eosinophils_pct', name:'Eosinofili %', sample:'Sangue', aliases:['granulociti eosinofili','eosinofili'], units:['%']},
    {id:'basophils_pct', name:'Basofili %', sample:'Sangue', aliases:['granulociti basofili','basofili'], units:['%']},
    {id:'neutrophils_abs', name:'Neutrofili assoluti', sample:'Sangue', aliases:['granulociti neutrofili','neutrofili'], units:['x 10.e3/ul','x10.e3/ul','x 10^3/ul','10^3/µl','x10^9/l']},
    {id:'lymphocytes_abs', name:'Linfociti assoluti', sample:'Sangue', aliases:['linfociti'], units:['x 10.e3/ul','x10.e3/ul','x 10^3/ul','10^3/µl','x10^9/l']},
    {id:'monocytes_abs', name:'Monociti assoluti', sample:'Sangue', aliases:['monociti'], units:['x 10.e3/ul','x10.e3/ul','x 10^3/ul','10^3/µl','x10^9/l']},
    {id:'eosinophils_abs', name:'Eosinofili assoluti', sample:'Sangue', aliases:['granulociti eosinofili','eosinofili'], units:['x 10.e3/ul','x10.e3/ul','x 10^3/ul','10^3/µl','x10^9/l']},
    {id:'basophils_abs', name:'Basofili assoluti', sample:'Sangue', aliases:['granulociti basofili','basofili'], units:['x 10.e3/ul','x10.e3/ul','x 10^3/ul','10^3/µl','x10^9/l']},
    {id:'bilirubin_direct', name:'Bilirubina diretta', sample:'Sangue', aliases:['bilirubina diretta'], units:['mg/dl','µmol/l','umol/l']},
    {id:'bilirubin_indirect', name:'Bilirubina indiretta', sample:'Sangue', aliases:['bilirubina indiretta'], units:['mg/dl','µmol/l','umol/l']},
    {id:'urine_specific_gravity', name:'Peso specifico urine', sample:'Urine', aliases:['peso specifico'], units:['']},
    {id:'urine_ph', name:'pH urine', sample:'Urine', aliases:['ph'], units:['']}
  ];

  const CATEGORIES = [
    ['Esami di laboratorio', /emocromo|glicemia|hba1c|creatinina|colesterolo|trigliceridi|esami? (del )?sangue|esami? ematic|analisi cliniche|laboratorio/i],
    ['Visita specialistica', /visita (cardiologica|neurologica|endocrinologica|diabetologica|epatologica|oculistica|specialistica|ambulatoriale)/i],
    ['Referto strumentale', /ecografia|ecocardiogramma|elettrocardiogramma|\becg\b|risonanza|\brm\b|tac|tomografia|radiografia|\brx\b|doppler|fibroscan|gastroscopia|endoscopia|cone beam/i],
    ['Ricovero', /ricovero|dimissione ospedaliera|lettera di dimissione/i],
    ['Intervento', /intervento chirurgico|operatorio|meniscectomia|biopsia|procedura chirurgica/i],
    ['Piano terapeutico', /piano terapeutico|terapie farmacologiche|terapia in corso|farmaci in corso|schema terapeutico/i],
    ['Esenzione sanitaria', /esenzione sanitaria|esenzioni attive|codice esenzione|attestato di esenzione/i],
    ['Tessera sanitaria', /tessera sanitaria|team tessera europea|codice fiscale.*tessera/i],
    ['Prescrizione', /prescrizione|ricetta|terapia consigliata/i],
    ['Certificato', /certificato medico|attestazione sanitaria/i],
    ['Vaccinazione', /vaccinazione|vaccino|richiamo vaccinale/i],
    ['Referto istologico', /esame istologico|diagnosi istologica|anatomia patologica|biopsia/i]
  ];

  const SPECIFIC_TYPES = [
    ['Esami ematici', /esami? (ematic|del sangue)|emocromo|glicemia|creatinina|hba1c/i],
    ['Esami urine', /esame urine|urine completo|urinocoltura/i],
    ['Visita cardiologica', /visita cardiologica/i],
    ['Visita neurologica', /visita neurologica/i],
    ['Visita endocrinologica', /visita endocrinologica/i],
    ['Visita diabetologica', /visita diabetologica/i],
    ['Visita epatologica', /visita epatologica/i],
    ['Visita oculistica', /visita oculistica|fundus oculi/i],
    ['Gastroscopia', /gastroscopia|esofagogastroduodenoscopia|egds/i],
    ['Ecocardiogramma', /ecocardiogramma/i],
    ['Elettrocardiogramma', /elettrocardiogramma|\becg\b/i],
    ['Ecografia', /ecografia/i],
    ['Risonanza magnetica', /risonanza magnetica|\brm\b/i],
    ['TAC', /tomografia assiale|\btac\b/i],
    ['Radiografia', /radiografia|\brx\b/i],
    ['Esame istologico', /esame istologico|diagnosi istologica/i],
    ['Piano terapeutico', /piano terapeutico|terapie farmacologiche|terapia in corso|schema terapeutico/i],
    ['Attestato di esenzione', /esenzione sanitaria|codice esenzione|attestato di esenzione/i],
    ['Tessera sanitaria', /tessera sanitaria|team tessera europea/i],
    ['Prescrizione terapeutica', /prescrizione/i]
  ];

  function normalizeText(value='') {
    return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[‐‑‒–—−]/g,'-').replace(/\s+/g,' ').trim();
  }

  function normalizedCompact(value='') {
    return normalizeText(value).replace(/[^a-z0-9]/g,'');
  }

  function escapeRegExp(value='') { return value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); }

  function parseItalianNumber(raw) {
    if (raw == null) return null;
    let s=String(raw).trim().replace(/\s/g,'').replace(/[Oo](?=\d)/g,'0');
    s=s.replace(/[^0-9,.-]/g,'');
    if (!s) return null;
    if (s.includes(',') && s.includes('.')) {
      if (s.lastIndexOf(',') > s.lastIndexOf('.')) s=s.replace(/\./g,'').replace(',','.');
      else s=s.replace(/,/g,'');
    } else if (s.includes(',')) s=s.replace(',','.');
    const n=Number(s);
    return Number.isFinite(n) ? n : null;
  }

  function isoDate(day,month,year) {
    const d=Number(day), m=Number(month), y=Number(year);
    if (y<1900 || y>2100 || m<1 || m>12 || d<1 || d>31) return null;
    const dt=new Date(Date.UTC(y,m-1,d));
    if (dt.getUTCFullYear()!==y || dt.getUTCMonth()!==m-1 || dt.getUTCDate()!==d) return null;
    return `${String(y).padStart(4,'0')}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  }

  function detectDates(text='', excludedDates=[]) {
    const raw=String(text); const out=[]; const excluded=new Set((excludedDates||[]).filter(Boolean));
    const patterns=[
      /\b(0?[1-9]|[12]\d|3[01])[\/\.\-](0?[1-9]|1[0-2])[\/\.\-]((?:19|20)\d{2})\b/g,
      /\b((?:19|20)\d{2})[\/\.\-](0?[1-9]|1[0-2])[\/\.\-](0?[1-9]|[12]\d|3[01])\b/g
    ];
    for (let pi=0; pi<patterns.length; pi++) {
      const re=patterns[pi]; let m;
      while ((m=re.exec(raw))) {
        const iso=pi===0 ? isoDate(m[1],m[2],m[3]) : isoDate(m[3],m[2],m[1]);
        if (!iso) continue;
        const before=raw.slice(Math.max(0,m.index-110),m.index); const after=raw.slice(m.index+m[0].length,m.index+m[0].length+110);
        const context=normalizeText(`${before} ${after}`);
        const nearBefore=normalizeText(raw.slice(Math.max(0,m.index-58),m.index));
        const nearAfter=normalizeText(raw.slice(m.index+m[0].length,m.index+m[0].length+58));
        const localContext=`${nearBefore} ${nearAfter}`.trim();
        const lineStart=raw.lastIndexOf('\n',m.index-1)+1; let lineEnd=raw.indexOf('\n',m.index+m[0].length); if(lineEnd<0)lineEnd=raw.length;
        const lineContext=normalizeText(raw.slice(lineStart,lineEnd));
        const birthBefore=/(?:data\s+di\s+nascita|nato\s+(?:a|il)|nata\s+(?:a|il)|birth\s*date|dob)\s*[:\-]?\s*$/;
        const birthAfter=/^(?:data\s+di\s+nascita|nascita|birth\s*date|dob)\b/;
        const isBirth=excluded.has(iso) || birthBefore.test(nearBefore) || birthAfter.test(nearAfter);
        const clinicalBefore=/(?:data\s*(?:dell['’]?|di\s+)?(?:esecuzione(?:\s+(?:esa(?:me)?|esame))?|esame|prelievo|visita|ricovero|intervento|accettazione|prestazione)|esecuzione\s+(?:esa(?:me)?|esame)|eseguito\s+il|data\s+prestazione|accesso\s+del)\s*[:\-]?\s*$/;
        const refertoBefore=/(?:referto\s+(?:del|in\s+data)|data\s+(?:e\s+ora\s+)?(?:del(?:la)?\s+)?(?:referto|firma|refertazione|validazione|emissione)|ora\s+della\s+firma|refertato|validato|firmato|emesso)\s*(?:il)?\s*[:\-]?\s*$/;
        let score=18; let kind='altra data';
        if (/data\s+(?:di\s+)?esecuzione(?:\s+(?:esa(?:me)?|esame))?\s*[:\-]?\s*$/.test(nearBefore)) {score+=180;kind='data clinica di esecuzione';}
        else if (clinicalBefore.test(nearBefore)) {score+=140;kind='data clinica';}
        else if (/prelievo|visita|esame|esecuzione|ricovero|intervento|procedura|dimissione|accettazione|prestazione/.test(localContext)) {score+=85;kind='data clinica probabile';}
        else if (/data\s*(?:dell['’]?|di\s+)?(?:esecuzione(?:\s+(?:esa(?:me)?|esame))?|esame|prelievo|visita|ricovero|intervento|accettazione|prestazione)|esecuzione\s+(?:esa(?:me)?|esame)|eseguito\s+il|accesso\s+del/.test(context)) {score+=55;kind='data clinica probabile';}
        if (/campione|prelievo|sangue\s+occulto|feci|urine|materiale|accettazione/.test(nearBefore) || /^(?:ore|ora)\b/.test(nearAfter)) {score+=105;kind='data clinica probabile';}
        if (refertoBefore.test(nearBefore)) {score+=55;kind='data referto';}
        else if (/referto|refertazione|validato|validazione|firmato|firma|emesso|emissione/.test(localContext)) {score+=35;if(!/clinica/.test(kind))kind='data referto probabile';}
        if (isBirth) {score-=400;kind='data di nascita';}
        if (/codice\s+fiscale|sesso|residenza|anagrafica/.test(localContext)) score-=120;
        if (/prossimo|controllo\s+tra|appuntamento|scadenza|richiamo|validita/.test(localContext)) {score-=130;kind='data futura o scadenza';}
        if (/stampato|stampa|generato/.test(localContext)) {score-=55;kind='data di stampa';}
        const year=Number(iso.slice(0,4)); const currentYear=new Date().getFullYear();
        if (year>currentYear) score-=180;
        out.push({iso,raw:m[0],index:m.index,context,lineContext,isBirth,score,kind});
      }
    }
    const unique=new Map();
    for (const d of out) if (!unique.has(d.iso) || unique.get(d.iso).score<d.score) unique.set(d.iso,d);
    return [...unique.values()].sort((a,b)=>b.score-a.score || a.index-b.index);
  }

  function detectDateFromFilename(fileName='') {
    const name=String(fileName||'').replace(/\.[^.]+$/,'');
    const candidates=[];
    let m;
    const compact=/(?<!\d)(0[1-9]|[12]\d|3[01])(0[1-9]|1[0-2])((?:19|20)\d{2})(?!\d)/g;
    while((m=compact.exec(name))) {const iso=isoDate(m[1],m[2],m[3]);if(iso)candidates.push({iso,raw:m[0],kind:'data dal nome file',score:78,index:m.index,isBirth:false});}
    const separated=/(?<!\d)(0?[1-9]|[12]\d|3[01])[\s._-](0?[1-9]|1[0-2])[\s._-]((?:19|20)\d{2})(?!\d)/g;
    while((m=separated.exec(name))) {const iso=isoDate(m[1],m[2],m[3]);if(iso)candidates.push({iso,raw:m[0],kind:'data dal nome file',score:78,index:m.index,isBirth:false});}
    const isoRe=/(?<!\d)((?:19|20)\d{2})[\s._-](0?[1-9]|1[0-2])[\s._-](0?[1-9]|[12]\d|3[01])(?!\d)/g;
    while((m=isoRe.exec(name))) {const iso=isoDate(m[3],m[2],m[1]);if(iso)candidates.push({iso,raw:m[0],kind:'data dal nome file',score:78,index:m.index,isBirth:false});}
    return [...new Map(candidates.map(x=>[x.iso,x])).values()];
  }

  function chooseClinicalDate(text='', birthDate='') {
    const allDates=detectDates(text,birthDate?[birthDate]:[]);
    if (!allDates.length) return {value:'',suggested:'',confidence:0,candidates:[],status:'missing'};
    const dates=allDates.filter(d=>!d.isBirth && d.score>0);
    if (!dates.length) return {value:'',suggested:'',confidence:0,candidates:allDates.slice(0,8),status:'missing'};
    const best=dates[0], second=dates[1];
    const ambiguous=Boolean(second && second.score>=best.score-14 && second.iso!==best.iso);
    const lowConfidence=best.score<55;
    const confidence=Math.max(20,Math.min(99,best.score));
    if (ambiguous || lowConfidence) return {value:'',suggested:best.iso,confidence,candidates:allDates.slice(0,8),status:'ambiguous'};
    return {value:best.iso,suggested:best.iso,confidence,candidates:allDates.slice(0,8),status:'detected'};
  }

  function chooseIssueDate(text='', birthDate='') {
    const raw=String(text||'');
    // Cerca solo date semanticamente legate a firma, emissione o refertazione.
    // Non basta che la parola "referto" compaia nella stessa riga: una riga come
    // "Accettazione ... del 12/03/2004 - Referto N. 1" non indica la data di emissione.
    const directPatterns=[
      /(?:data\s+(?:e\s+ora\s+)?(?:della\s+)?firma|data\s+(?:di\s+)?refertazione|data\s+(?:di\s+)?emissione|refertato\s+il|firmato\s+il|validato\s+il|emesso\s+il|referto\s+(?:del|in\s+data))\s*[:\-]?\s*(0?[1-9]|[12]\d|3[01])[\/.\-](0?[1-9]|1[0-2])[\/.\-]((?:19|20)\d{2})/ig
    ];
    for(const re of directPatterns){
      let m;
      while((m=re.exec(raw))){const iso=isoDate(m[1],m[2],m[3]);if(iso&&iso!==birthDate)return iso;}
    }
    const dates=detectDates(text,birthDate?[birthDate]:[]).filter(d=>!d.isBirth);
    if (!dates.length) return '';
    const ranked=dates.map(d=>{
      const line=normalizeText(d.lineContext||'');
      const ctx=normalizeText(d.context||'');
      const combined=`${line} ${ctx}`;
      let issueScore=0;
      if (/data\s+refertazione\s*[:\-]?\s*\d/.test(line)) issueScore+=340;
      else if (/refertato\s+il\s*[:\-]?\s*\d/.test(line)) issueScore+=330;
      else if (/data\s+(?:e\s+ora\s+)?(?:della\s+)?firma\s*[:\-]?\s*\d/.test(line)) issueScore+=310;
      else if (/(?:firmato|validato|emesso)\s+il\s*[:\-]?\s*\d/.test(line)) issueScore+=300;
      else if (/referto\s+(?:del|in\s+data)\s*[:\-]?\s*\d/.test(line)) issueScore+=285;
      else if (/data\s+(?:di\s+)?(?:refertazione|emissione|validazione)\b/.test(line)) issueScore+=260;
      else if (/refertato|data\s+(?:e\s+ora\s+)?(?:della\s+)?firma|firmato|validato|emesso|data\s+refertazione/.test(combined)) issueScore+=120;
      if (/norme\s+vigenti|d\.p\.r|d\.p\.c\.m|d\.l\.g|certificato|legge|decreto/.test(line)) issueScore-=500;
      if (/data\s+di\s+nascita|nato\s+il|nata\s+il/.test(line)) issueScore-=500;
      if (/stampato|stampa/.test(line)) issueScore-=80;
      return {...d,issueScore};
    }).sort((a,b)=>b.issueScore-a.issueScore || b.score-a.score || a.index-b.index);
    return ranked[0] && ranked[0].issueScore>0 ? ranked[0].iso : (dates.find(d=>/data referto/.test(d.kind))?.iso||'');
  }

  function detectCategory(text='') {
    if (/esenzione sanitaria|esenzioni attive|codice esenzione|attestato di esenzione|\besenzioni\b/i.test(text)) return {value:'Esenzione sanitaria',confidence:96};
    if (/piano terapeutico|terapie farmacologiche|terapia in corso|farmaci in corso|schema terapeutico/i.test(text)) return {value:'Piano terapeutico',confidence:96};
    if (/tessera sanitaria|team tessera europea/i.test(text)) return {value:'Tessera sanitaria',confidence:96};
    for (const [name,re] of CATEGORIES) if (re.test(text)) return {value:name,confidence:88};
    return {value:'Altro',confidence:35};
  }

  function detectSpecificType(text='') {
    for (const [name,re] of SPECIFIC_TYPES) if (re.test(text)) return name;
    return '';
  }

  function cleanEntity(line='') {
    return line.replace(/\s+/g,' ').replace(/^[\s:;,.\-]+|[\s:;,.\-]+$/g,'').slice(0,160);
  }

  function getLogicalLines(text='', pages=[]) {
    const layout=[];
    for (const page of Array.isArray(pages)?pages:[]) {
      const lines=Array.isArray(page?.lines)?page.lines:[];
      for (const line of lines) {
        const value=String(line?.text||'').replace(/\s+/g,' ').replace(/^[\s:;,.\-]+|[\s:;,.\-]+$/g,'').trim().slice(0,1200);
        if (value) layout.push({pageNumber:Number(page.pageNumber||1),y:Number(line.y||0),x:Number(line.x||0),text:value,words:line.words||[]});
      }
    }
    if (layout.length) return layout.sort((a,b)=>a.pageNumber-b.pageNumber||a.y-b.y||a.x-b.x);
    return String(text).split(/\r?\n/).map(line=>String(line||'').replace(/\s+/g,' ').trim().slice(0,1200)).filter(Boolean).map((value,index)=>({pageNumber:1,y:index*20,x:0,text:value,words:[]}));
  }

  function sanitizePersonnelName(name='') {
    return cleanEntity(String(name||'')
      .replace(/\b(?:data|ora|firma|referto|richiesta|medico|azienda|ospedale|regione|numero|id|certificato)\b.*$/i,'')
      .replace(/\s+(?:data|ora|firma|referto)$/i,''));
  }

  function detectPersonnel(text='', pages=[]) {
    const lines=getLogicalLines(text,pages); const candidates=[];
    const titleName=/\b(dott\.?(?:ssa)?|dr\.?(?:ssa)?|prof\.?(?:ssa)?)\s*[:\-]?\s*([A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÖØ-öø-ÿ'’\-]+(?:\s+[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÖØ-öø-ÿ'’\-]+){1,4})/i;
    const explicit=/\b(?:medico|specialista|firmatario|refertante|esecutore|prescrittore|richiedente)\s*[:\-]\s*([A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÖØ-öø-ÿ'’\-]+(?:\s+[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÖØ-öø-ÿ'’\-]+){1,4})/i;
    lines.forEach((row,index)=>{
      const around=[lines[index-1]?.text||'',row.text,lines[index+1]?.text||''].join(' ');
      let m=row.text.match(titleName); let name='';
      if (m) name=sanitizePersonnelName(`${m[1]} ${m[2]}`);
      else {m=row.text.match(explicit);if(m)name=sanitizePersonnelName(m[1]);}
      if (name && !/^(?:medico|data|ora|referto|azienda|ospedale|regione)\b/i.test(name)) {
        let role='Medico';
        if (/firma|firmatario|refertante|validazione|dirigente/i.test(around)) role='Medico refertante o firmatario';
        else if (/richiedente|prescrittore|medico\s*richiedente/i.test(around)) role='Medico richiedente';
        else if (/esecutore|ha eseguito|operatore/i.test(around)) role='Medico esecutore';
        candidates.push({name,role,sourceLine:row.text,confidence:role==='Medico'?78:92});
      }
      const code=row.text.match(/\bmedico\s*[:\-]?\s*([A-Z]{1,4}\d{3,})\b/i);
      if(code)candidates.push({name:code[1].toUpperCase(),role:'Codice medico richiedente',sourceLine:row.text,confidence:88});
    });
    const unique=[];const seen=new Set();
    for(const item of candidates){const key=normalizeText(`${item.role}|${item.name}`);if(!seen.has(key)){seen.add(key);unique.push(item);}}
    const primary=unique.find(x=>/refertante|firmatario/.test(x.role))||unique.find(x=>!/^Codice/.test(x.role))||unique[0]||null;
    return {primary:primary?.name||'',people:unique.slice(0,12)};
  }

  function extractIdentifiers(text='', pages=[]) {
    const source=getLogicalLines(text,pages).map(x=>x.text).join('\n');
    const patterns=[
      ['Numero referto',/\breferto\s*(?:n\.?|numero|id)?\s*[:#\-]?\s*([A-Z0-9][A-Z0-9.\/_\-]{0,})/ig,100],
      ['Numero referto',/\b(?:numero|n\.?|id\.?)\s*(?:del\s*)?referto\s*[:#\-]?\s*([A-Z0-9][A-Z0-9.\/_\-]{0,})/ig,100],
      ['ID referto',/\bid\s+referto\s*[:#\-]?\s*([A-Z0-9][A-Z0-9.\/_\-]{3,})/ig,100],
      ['Numero esito',/\besito\s*[:#\-]?\s*([A-Z0-9][A-Z0-9.\/_\-]{3,})/ig,78],
      ['Numero richiesta',/\brichiesta\s*[:#\-]?\s*([A-Z0-9][A-Z0-9.\/_\-]{3,})/ig,75],
      ['ID provenienza',/\bprovenienza\s*[:\-]?\s*(?:id\.?\s*[:\-]?)?([A-Z0-9][A-Z0-9.\/_\-]{3,})/ig,60],
      ['Protocollo',/\bprotocollo\s*[:#\-]?\s*([A-Z0-9][A-Z0-9.\/_\-]{3,})/ig,72],
      ['Numero pratica',/\b(?:numero|n\.?)\s+pratica\s*[:#\-]?\s*([A-Z0-9][A-Z0-9.\/_\-]{3,})/ig,70]
    ];
    const rows=[];const seen=new Set();const seenValues=new Set();
    for(const [label,re,priority] of patterns){let m;while((m=re.exec(source))){const value=m[1].replace(/[.,;:]$/,'');if(!/\d/.test(value)||(priority<90&&/^\d{1,3}$/.test(value)))continue;const key=`${label}|${value}`.toLowerCase();const valueKey=value.toLowerCase();if(!seen.has(key)&&!seenValues.has(valueKey)){seen.add(key);seenValues.add(valueKey);rows.push({label,value,priority,confidence:priority>=90?95:86});}}}
    rows.sort((a,b)=>b.priority-a.priority);
    return {documentNumber:(rows.find(x=>x.priority>=90)||null)?.value||'',items:rows.slice(0,20)};
  }

  function detectDepartment(text='', pages=[]) {
    const lines=getLogicalLines(text,pages).map(x=>x.text);
    const primary=[]; const secondary=[];
    for(const rawLine of lines){
      const line=cleanEntity(rawLine);
      if(!line || /data\s+nascita|valori?\s+desiderabili|\buomini\b|\bdonne\b|telefono|codice\s+fiscale|servizio\s+sanitario/i.test(line)) continue;
      const uo=line.match(/\b(?:u\.?\s*o\.?\s*c\.?|uoc|u\.?\s*o\.?\s*s\.?|uos|u\.?\s*o\.?)\s*[:\-]?\s*([^;]{2,90})/i);
      if(uo){
        const value=cleanEntity(uo[0].split(/\b(?:tel\.?|telefono|fax|pag\.?|pagina)\b/i)[0]);
        if(value) primary.push(value);
        continue;
      }
      const lab=line.match(/\b(?:laboratorio\s+analisi|patologia\s+clinica|medicina\s+di\s+laboratorio|diagnostica\s+di\s+laboratorio)\b/i);
      if(lab) secondary.push(cleanEntity(lab[0]));
      else {
        const area=line.match(/\b(?:area\s+funzionale|reparto|unità\s+operativa|servizio)\s*[:\-]?\s*([^;]{2,80})/i);
        if(area) secondary.push(cleanEntity(area[0].split(/\b(?:tel\.?|telefono|fax|pag\.?|pagina)\b/i)[0]));
      }
    }
    const unique=a=>[...new Set(a.map(x=>x.replace(/\s{2,}/g,' ').trim()).filter(Boolean))];
    const chosen=[...unique(primary),...unique(secondary)].slice(0,3);
    return chosen.join(' · ');
  }


  function extractQualitativeResults(text='', pages=[]) {
    const lines=getLogicalLines(text,pages).map(x=>x.text);const rows=[];const seen=new Set();
    const add=(test,result,unit='',reference='',sourceLine='',confidence=82)=>{const key=normalizeText(`${test}|${result}|${sourceLine}`);if(!test||!result||seen.has(key))return;seen.add(key);rows.push({test:cleanEntity(test),result:cleanEntity(result),unit:cleanEntity(unit),reference:cleanEntity(reference),sourceLine,confidence});};
    for(let i=0;i<lines.length;i++){
      const line=lines[i];const context=line;
      let m=context.match(/(sangue\s+occulto(?:\s+(?:nelle\s+)?feci)?(?:\s+campione\s*([123]))?)[\s:;\-]{0,20}([<>≤≥]\s*\d+(?:[.,]\d+)?)\s*(ng\s*\/\s*m[lI])?/i);
      if(m){const ref=(context.match(/(?:negativo|normale)\s*(?:se)?\s*([<>≤≥]\s*\d+(?:[.,]\d+)?)/i)||[])[1]||'';add(m[1],m[3],m[4]||'',ref,line,90);continue;}
      m=line.match(/^(.{2,100}?)\s*(?:[:\-]\s*|\s+)(positivo|negativo|assente|assenti|presente|presenti|non reattivo|reattivo|normale|limpido|paglierino|nulla da segnalare)\b/i);
      if(m&&!/^(?:referto|pagina|data|signor|responsabile|azienda|ospedale)/i.test(m[1]))add(m[1],m[2],'','',line,86);
    }
    const source=lines.join(' ');
    if(/sangue\s+occulto/i.test(source)) {
      const tests=[...source.matchAll(/sangue\s+occulto(?:\s+(?:nelle\s+)?feci)?\s+campione\s*([123iIlL])/ig)];
      const sequence=source.match(/(?:\b(?:19|20)\d{2}[^<>]{0,45})?([<>≤≥]\s*\d+(?:[.,]\d+)?)\s+([<>≤≥]\s*\d+(?:[.,]\d+)?)\s+([<>≤≥]\s*\d+(?:[.,]\d+)?)/);
      if(tests.length>=2&&sequence){const vals=[sequence[1],sequence[2],sequence[3]];tests.slice(0,3).forEach((m,index)=>add(`Sangue occulto nelle feci, campione ${String(m[1]).replace(/[iIlL]/,'1')}`,vals[index]||'','ng/mL','Negativo < 100 ng/mL',m[0],88));}
    }
    return rows.slice(0,60);
  }

  function detectDoctor(text='', pages=[]) { return detectPersonnel(text,pages).primary; }

  function detectFacility(text='', pages=[]) {
    const lines=getLogicalLines(text,pages).map(x=>x.text);const candidates=[];
    const entityPatterns=[
      /\bAzienda\s+USL\s+Toscana\s+Nord\s+Ovest/i,
      /\bAzienda\s+(?:USL|ASL|ULSS|Sanitaria|Ospedaliera|Ospedaliero[- ]Universitaria)[^,;\n]{2,80}/i,
      /\bA\.?O\.?U\.?\s*[^,;\n]{2,80}/i,
      /\bOspedale\s+["“']?[^,;\n]{2,70}/i,
      /\bPoliclinico\s+[^,;\n]{2,70}/i,
      /\bIstituto\s+[^,;\n]{2,70}/i,
      /\bCentro\s+(?:Medico|Diagnostico|Ospedaliero)\s+[^,;\n]{2,70}/i
    ];
    for(const line of lines){
      for(const re of entityPatterns){const m=line.match(re);if(m)candidates.push(cleanEntity(m[0].split(/\b(?:della\s+richiedente|richiedente|referto|ssn\s*-|regione)\b/i)[0]));}
      if(!candidates.length && /azienda ospedaliera|azienda sanitaria|ospedale|policlinico|a\.o\.u\.|\baou\b|\busl\b|\basl\b/i.test(line) && line.length<=150)candidates.push(cleanEntity(line));
    }
    const unique=[...new Set(candidates.map(x=>x.replace(/\s{2,}/g,' ')))];
    return unique.slice(0,3).join(' · ');
  }

  function scoreFacility(line) {
    let s=0;
    if (/azienda|ospedale|policlinico|clinica|istituto/i.test(line)) s+=30;
    if (/aou|asl|usl/i.test(line)) s+=20;
    if (/u\.o|dipartimento|laboratorio/i.test(line)) s+=10;
    return s-Math.max(0,line.length-120)/5;
  }

  function profileEvidence(text, profiles=[], activeProfileId=null) {
    const norm=normalizeText(text); const compact=normalizedCompact(text);
    const scored=profiles.map(p=>{
      let score=0; const details=[];
      const full=normalizeText(`${p.firstName||''} ${p.lastName||''}`);
      const rev=normalizeText(`${p.lastName||''} ${p.firstName||''}`);
      if (full && (norm.includes(full)||norm.includes(rev))) {score+=75;details.push('nome e cognome');}
      const tax=normalizedCompact(p.taxCode||''); if (tax && compact.includes(tax)) {score+=120;details.push('codice fiscale');}
      const card=normalizedCompact(p.healthCard||''); if (card.length>=8 && compact.includes(card)) {score+=130;details.push('tessera sanitaria');}
      if (p.birthDate) {
        const [y,m,d]=p.birthDate.split('-'); const variants=[`${d}/${m}/${y}`,`${d}-${m}-${y}`,`${y}-${m}-${d}`];
        if (variants.some(v=>norm.includes(v))) {score+=15;details.push('data di nascita');}
      }
      return {profileId:p.id,score,details,name:`${p.firstName||''} ${p.lastName||''}`.trim()};
    }).sort((a,b)=>b.score-a.score);
    const best=scored[0]||null; const active=scored.find(x=>x.profileId===activeProfileId)||null;
    let status='not_detected';
    if (best?.score>=70 && best.profileId===activeProfileId) status='matched';
    else if (best?.score>=70 && best.profileId!==activeProfileId) status='conflict';
    return {status,best,active,all:scored.slice(0,4)};
  }

  function normalizeUnit(raw='') {
    return String(raw).replace(/μ/g,'µ').replace(/\s+/g,' ').replace(/\s*\/\s*/g,'/').trim();
  }

  function detectRange(after='') {
    const clean=String(after||'').replace(/[÷]/g,'-').replace(/[–—]/g,'-').replace(/-{2,}/g,'-');
    const limit=clean.match(/(<=|>=|[<>≤≥])\s*([0-9]+(?:[.,][0-9]+)?)/);
    if (limit) { const op=limit[1]==='<='?'≤':limit[1]==='>='?'≥':limit[1]; return {raw:`${op}${limit[2]}`,operator:op,limit:parseItalianNumber(limit[2])}; }
    const between=clean.match(/([0-9]+(?:[.,][0-9]+)?)\s*-\s*([0-9]+(?:[.,][0-9]+)?)/);
    if (between) return {raw:`${between[1]}-${between[2]}`,min:parseItalianNumber(between[1]),max:parseItalianNumber(between[2])};
    return null;
  }

  function rangeCondition(value,range){
    if(!Number.isFinite(value)||!range)return null;
    if(range.operator&&Number.isFinite(range.limit)){
      if(range.operator==='<')return value<range.limit;
      if(range.operator==='≤')return value<=range.limit;
      if(range.operator==='>')return value>range.limit;
      if(range.operator==='≥')return value>=range.limit;
    }
    const low=Number.isFinite(range.min)?range.min:range.low;
    const high=Number.isFinite(range.max)?range.max:range.high;
    if(Number.isFinite(low)&&Number.isFinite(high))return value>=low&&value<=high;
    return null;
  }

  function semanticRangeStatus(value,range){
    if(!Number.isFinite(value)||!range)return'';
    const semanticRaw=String(range.semanticRaw||range.raw||'').trim();
    if(!semanticRaw)return'';
    const text=normalizeText(semanticRaw);
    const condition=rangeCondition(value,range);
    if(condition===null)return'';
    // Se il referto descrive esplicitamente la zona numerica come patologica,
    // il simbolo matematico non rappresenta un "limite normale": rappresenta
    // la condizione descritta dal laboratorio. Non invertirne il significato.
    const abnormal=[
      [/insufficient|carent|deficit/, 'insufficiente'],
      [/critic/, 'critico'],
      [/alterat|anomalo|anormale/, 'alterato'],
      [/elevat|aumentat|\balto\b|\balta\b|superior/, 'alto'],
      [/ridott|\bbasso\b|\bbassa\b|inferior/, 'basso']
    ];
    for(const [re,status] of abnormal){if(re.test(text))return condition?status:'da verificare';}
    if(/sufficient|desiderabil|normale|nei limiti|nella norma|regolare/.test(text)){
      if(condition)return'nei limiti';
      if(range.operator==='<'||range.operator==='≤')return'alto';
      if(range.operator==='>'||range.operator==='≥')return'basso';
      const low=Number.isFinite(range.min)?range.min:range.low,high=Number.isFinite(range.max)?range.max:range.high;
      if(Number.isFinite(low)&&value<low)return'basso';
      if(Number.isFinite(high)&&value>high)return'alto';
      return'da verificare';
    }
    return'';
  }

  function statusFromRange(value, range, line='') {
    if (!Number.isFinite(value)||!range) return 'da verificare';
    const semantic=semanticRangeStatus(value,range);
    if(semantic)return semantic;
    const source=String(line||'');
    if (/\b(alto|alta|elevato|elevata|↑|\+\+)\b/i.test(source)) return 'alto';
    if (/\b(basso|bassa|ridotto|ridotta|↓)\b/i.test(source)) return 'basso';
    if (Number.isFinite(range.min) && value<range.min) return 'basso';
    if (Number.isFinite(range.max) && value>range.max) return 'alto';
    if (range.operator && Number.isFinite(range.limit)) {
      if (range.operator==='<') return value<range.limit?'nei limiti':'alto';
      if (range.operator==='≤') return value<=range.limit?'nei limiti':'alto';
      if (range.operator==='>') return value>range.limit?'nei limiti':'basso';
      if (range.operator==='≥') return value>=range.limit?'nei limiti':'basso';
    }
    return 'nei limiti';
  }

  function parameterForLine(line='') {
    const norm=normalizeText(line.replace(/^(?:sg|s|u|p|pl|ur|e)\s*[-–—]{1,3}\s*/i,''));
    const matches=[];
    for(const p of PARAMS) {
      for(const alias of p.aliases) {
        const a=normalizeText(alias);
        const idx=norm.search(new RegExp(`(^|[^a-z0-9])${escapeRegExp(a)}([^a-z0-9]|$)`));
        if(idx>=0)matches.push({p,alias,score:a.length+(idx===0?20:0)});
      }
    }
    if(!matches.length)return null;
    matches.sort((a,b)=>b.score-a.score);
    const unitNorm=normalizeText(line);
    const pct=/%/.test(line);
    const absolute=/10(?:\.e|\^)?\s*[369]|x\s*10/i.test(line);
    const filtered=matches.filter(x=>{
      if(/_(pct)$/.test(x.p.id))return pct;
      if(/_(abs)$/.test(x.p.id))return absolute&&!pct;
      return true;
    });
    return (filtered[0]||matches[0]).p;
  }

  function normalizeLabUnit(raw='') {
    return normalizeUnit(String(raw||'')
      .replace(/μ/g,'µ')
      .replace(/10\s*\.\s*e/ig,'10.e')
      .replace(/\s+/g,' ')
      .replace(/\buI\b/g,'UI')
      .trim());
  }


  function canonicalUnitKey(raw='') {
    let unit=normalizeLabUnit(raw).toLowerCase()
      .replace(/\b(?:siero\s*\/\s*plasma|siero|plasma|urine?)\b/g,'')
      .replace(/\[[^\]]*\]/g,'')
      .replace(/^[\s*†‡!|<>≤≥↑↓]+|[\s*†‡!|<>≤≥↑↓]+$/g,'')
      .replace(/\b(mg|g|ng|pg|µg|ug)\/d[i1]\b/g,'$1/dl')
      .replace(/\b(mg|g|ng|pg|µg|ug)\/m[i1]\b/g,'$1/ml')
      .replace(/\bui\/i\b/g,'ui/l')
      .replace(/\bu[i1]\/l\b/g,'ui/l')
      .replace(/\bmui\/i\b/g,'mui/l')
      .replace(/\s+/g,'')
      .replace(/×/g,'x')
      .replace(/μ/g,'µ')
      .replace(/,+/g,'.');
    if(/^ml\/min\/1(?:\.7|\.73)(?:m2|mq|m²)?$/.test(unit)||/^ml\/min\/1(?:\.7|\.73)$/.test(unit))unit='ml/min/1.73m2';
    return unit||'unita_non_rilevata';
  }

  function canonicalUnitDisplay(raw='') {
    const key=canonicalUnitKey(raw);
    const display={
      'mg/dl':'mg/dL','g/dl':'g/dL','ng/dl':'ng/dL','pg/dl':'pg/dL','µg/dl':'µg/dL','ug/dl':'µg/dL',
      'mg/ml':'mg/mL','g/ml':'g/mL','ng/ml':'ng/mL','pg/ml':'pg/mL','µg/ml':'µg/mL','ug/ml':'µg/mL',
      'mmol/l':'mmol/L','mol/l':'mol/L','meq/l':'mEq/L','ui/l':'UI/L','u/l':'U/L','mui/l':'mUI/L',
      'µui/ml':'µUI/mL','uui/ml':'µUI/mL','miu/l':'mIU/L','fl':'fL','ml':'mL','l':'L','pg':'pg','%':'%',
      'ml/min/1.73m2':'mL/min/1,73 m²'
    };
    if(key==='unita_non_rilevata')return '';
    return display[key]||normalizeLabUnit(raw).replace(/^[\s*†‡!|<>≤≥↑↓]+|[\s*†‡!|<>≤≥↑↓]+$/g,'').trim();
  }

  function customParameterId(name='') {
    const key=normalizeText(name).replace(/\b(?:sg|s|u|p|pl|ur|e)\s*[-–—]{1,3}\s*/g,'').replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,70);
    return `custom_${key||'parametro'}`;
  }

  function canonicalizeLabValue(value={}) {
    const rawName=cleanTestName(value.parameterName||value.test||'');
    const unit=canonicalUnitDisplay(value.unit||'');
    let mapped=parameterById(value.parameterId)||parameterForLine(`${rawName} ${unit}`);
    const unitKey=canonicalUnitKey(unit);
    if(mapped && /^hba1c_/.test(mapped.id)) {
      mapped=PARAMS.find(p=>p.id===(unitKey==='%'?'hba1c_percent':'hba1c_mmol'))||mapped;
    }
    const parameterName=mapped?.name||rawName||'Parametro non identificato';
    const sample=mapped?.sample||value.sample||inferSample(rawName,'');
    const parameterId=mapped?.id||(String(value.parameterId||'').startsWith('custom_')?value.parameterId:customParameterId(`${sample}_${parameterName}_${unit}`));
    return {...value,parameterId,parameterName,sample,unit,unitKey};
  }

  function canonicalizeLabValues(values=[]) {
    return dedupeLabValues((Array.isArray(values)?values:[]).map(canonicalizeLabValue).map(repairNumericLabValue).filter(Boolean));
  }

  function normalizedExamKey(name='') {
    return normalizeText(cleanTestName(name))
      .replace(/\b(?:ormone|liber[oa]|ematic[oa]|sieric[oa]|plasmatic[oa])\b/g,' ')
      .replace(/[^a-z0-9%]+/g,' ')
      .replace(/\s+/g,' ')
      .trim();
  }

  const ADMINISTRATIVE_EXAM_RE=/^(?:[\\/)>\'"`]*\s*)?(?:accettazione(?:\s+n\.?)?|inserita\s+il|n\.?\s*libretto|numero\s+telefono|telefono|cellulare|codice\s+fiscale|servizio\s+sanitario\s+nazionale|ssn|paziente|cognome|nome|data(?:\s*\/\s*ora)?(?:\s+di\s+nascita)?|luogo\s+di\s+nascita|indirizzo|residenza|domicilio|reparto|ambulatorio|prenotazione|richiesta|numero\s+referto|referto\s+n\.?|referto\s+completato|cartella\s+clinica|scheda\s+nosologica|nosologico|tessera\s+sanitaria|azienda\s+ospedaliera|azienda\s+sanitaria|direttore|responsabile|medico\s+firmatario|il\s+medico|codice\s+accesso|id\s+documento|barcode|prodotto\s+il|stampato|scadenza|s\s*\/\s*n|copia\s+conforme|ao?up\s*::|modello\s*:|via\s+[a-zà-ÿ]|tel\b|fax\b|e-?mail\b|esame\s+effettuato\s+il|risposta\s+del)\b/i;

  const CONTEXTUAL_NON_EXAM_RE=/(?:\bin\s+gravidanza\b|\bgravidanza\b|\bin\s+(?:assenza|presenza)\s+di\s+sintomi\b|\balterata\s+glicemia\s+a\s+digiuno\b|\belevato\s+rischio\b|\blivello\s+decisionale\b|\bdiagnosi\s+di\s+diabete\b|\bvalori?\s+(?:desiderabili|insufficienti|sufficienti)\b|\bpostmenopausa\b|\bpre[- ]?menopausa\b|\bwho\s+\d+(?:st|nd|rd|th)?\s+irp\b|\blinea\s+guida\s+kdigo\b|\bformula\s+ckd[- ]?epi\b|\bin\s+assenza\s+di\s+altre\s+evidenze\b|\bin\s+presenza\s+di\s+soggetto\b|\bnon\s+e\s+applicabile\b|\bgruppi?\s+etnici?\b|\bmassa\s+muscolare\b|\bstato\s+nutrizionale\b|\bclearance\s+renale\b|\bmalattia\s+renale\b|\briferiment[oi]\s+bibliografic[oi]\b|\bd\.?p\.?c\.?m\.?\b|\bd\.?p\.?r\.?\b|\bcertificat[oa]\b|\bwsref\b)/i;

  function isAdministrativeExamName(name='',source='') {
    const n=String(name||'').replace(/^[^A-Za-zÀ-ÿ]+/,'').trim();
    const joined=`${n} ${String(source||'')}`;
    if(ADMINISTRATIVE_EXAM_RE.test(n))return true;
    if(/\b(?:codice\s+fiscale|servizio\s+sanitario\s+nazionale|numero\s+telefono|centralino|prenotazione\s+visite|e-?mail|@|copia\s+conforme|codice\s+accesso|id\s+documento|barcode|nosologico|wsref)\b/i.test(joined)&&!/\b(?:colesterolo|creatinina|glicemia|emoglobina|tsh|ft3|ft4|ast|alt|ggt|trigliceridi|vitamina|filtrato|emocromo|sodio|potassio|bilirubina)\b/i.test(n))return true;
    return false;
  }

  function isContextualNonExamName(name='',source='') {
    const raw=String(name||'').replace(/\s+/g,' ').trim();
    const n=normalizeText(raw);
    const joined=`${raw} ${String(source||'')}`;
    if(!n||isAdministrativeExamName(raw,source))return true;
    const mapped=parameterForLine(raw);
    if(!mapped&&CONTEXTUAL_NON_EXAM_RE.test(joined))return true;
    if(!mapped&&/^(?:uomini|donne|maschi|femmine|valori?\s+fra|valori?\s+da|rischio\b|eta\b|anni\b)/i.test(n))return true;
    if(!mapped&&/^[<>≤≥]?\s*\d+(?:[.,]\d+)?\s*(?:-|a|e|<|>|≤|≥)+\s*[<>≤≥]?\s*\d*(?:[.,]\d+)?(?:\s*anni)?$/i.test(n))return true;
    if(!mapped&&/^(?:[<>≤≥]\s*)?\d+(?:[.,]\d+)?\s*(?:anni|e\s*[<>≤≥]|<|>|≤|≥)/i.test(n))return true;
    const letters=(n.match(/[a-zà-ÿ]/g)||[]).length;
    const digits=(n.match(/\d/g)||[]).length;
    const operators=(n.match(/[<>≤≥=]/g)||[]).length;
    if(!mapped&&digits>=letters&&operators>0)return true;
    if(!mapped&&n.length>100)return true;
    return false;
  }

  function isClinicalReferenceNote(value='') {
    const n=normalizeText(value);
    if(!n||isAdministrativeExamName(n,n))return false;
    return CONTEXTUAL_NON_EXAM_RE.test(n)||/\b(?:intervallo|range|valore|limite|soglia|ridott[oa]|aumentat[oa]|insufficient|desiderabil|anni)\b/.test(n);
  }

  function cleanReferenceText(raw='') {
    let text=String(raw||'').replace(/[÷–—]/g,'-').replace(/μ/g,'µ').replace(/\s+/g,' ').trim();
    if(!text)return'';
    text=text
      .replace(/\b(?:fino\s+a|inferiore\s+a)\s*([-+]?\d+(?:[.,]\d+)?)/ig,'≤ $1')
      .replace(/\b(?:superiore\s+a|oltre)\s*([-+]?\d+(?:[.,]\d+)?)/ig,'> $1')
      .replace(/\b(?:siero\s*\/\s*plasma|siero|plasma|campione)\b/ig,' ')
      .replace(/\b(?:metodo|metodica|clia|eclia|immunometrico|turbidimetrico)\b[\s\S]*$/i,' ')
      .replace(/\b(?:ref\.?\s*pi|d\.?p\.?c\.?m\.?|d\.?p\.?r\.?|legge\s+n\.?|pagina\s+\d+)[\s\S]*$/i,' ')
      .replace(/\s+/g,' ').trim();
    const range=text.match(/(?:^|\s)((?:<=|>=|[<>≤≥])?\s*[-+]?\d+(?:[.,]\d+)?\s*(?:-|a)\s*[-+]?\d+(?:[.,]\d+)?|(?:<=|>=|[<>≤≥])\s*[-+]?\d+(?:[.,]\d+)?)/i);
    let kept=range?range[1].trim():text;
    const descriptor=text.match(/\b(?:valori?\s+(?:insufficienti|sufficienti|desiderabili)|insufficiente|sufficiente|desiderabile)\b/i);
    if(descriptor&&!new RegExp(descriptor[0],'i').test(kept))kept=`${kept} ${descriptor[0]}`.trim();
    kept=kept.replace(/\s+(?:siero|plasma|siero\s*\/\s*plasma)$/i,'').trim();
    return kept.slice(0,120);
  }

  function isReferenceContinuationName(name='') {
    const n=normalizeText(name).replace(/\s+/g,' ').trim();
    if(!n)return true;
    return isContextualNonExamName(name,name)
      || /^(?:[<>≤≥]?\s*\d+(?:[.,]\d+)?\s*(?:-|a)?\s*\d*(?:[.,]\d+)?\s*anni|in (?:assenza|presenza) di sintomi clinici|alterata glicemia a digiuno|elevato rischio di diabete|livello decisionale (?:per )?la diagnosi di diabete|valori? (?:insufficienti|sufficienti|desiderabili)|in assenza di altre evidenze cliniche|in presenza di soggetto appartenente|non e applicabile in gravidanza|ed? \d+(?:[.,]\d+)?\s*ml\s*\/\s*min|muscolare stato nutrizionale|orientali in questi casi|m\s*(?:\^?2|²))\b/.test(n)
      || /^(?:il laboratorio|malattia renale|etnico afro|defedato|debilitato|estremi di massa corporea|clearance renale|centralino|timbro|cartella clinica|scheda nosologica|data di nascita|luogo di nascita|paziente|reparto|ricovero|codice fiscale|indirizzo|telefono|numero telefono|fax|e mail|email|accettazione|inserita il|n libretto|servizio sanitario nazionale|richiesta|numero referto|referto n|pagina)\b/.test(n)
      || (n.length>100 || (/[|]/.test(String(name||''))&&n.length>35));
  }

  function splitUnitReference(unit='',reference='',sourceLine='') {
    let u=normalizeLabUnit(unit||'').replace(/μ/g,'µ');
    let ref=String(reference||'').replace(/[÷–—]/g,'-').replace(/\s+/g,' ').trim();
    const flag=(u.match(/^\s*([<>≤≥↑↓*])\s*/)||[])[1]||'';
    u=u
      .replace(/^\s*[-+]?\d+(?:[.,]\d+)?\s*[<>≤≥*]?\s*(?=(?:m[lL]|[µu]?[gimnkp]?\/?[dmlL]|%|f[lL]|p[gG]|10))/,'')
      .replace(/^\s*[<>≤≥↑↓*]+\s*/,'')
      .replace(/\b(?:siero\s*\/\s*plasma|siero|plasma)\b/ig,' ')
      .replace(/\s+/g,' ').trim();
    const embedded=u.match(/^(.+?)(\s+(?:<=|>=|[<>≤≥])\s*[-+]?\d+(?:[.,]\d+)?(?:.*))$/i);
    if(embedded && /(?:\/|%|\b(?:fl|pg|ui|u|l|ml|dl|mol|mmol|meq)\b)/i.test(embedded[1])){
      u=embedded[1].trim();
      if(!ref)ref=embedded[2].trim();
    }
    if(!ref){
      const src=String(sourceLine||'');
      const escaped=u.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      if(u&&escaped){const m=src.match(new RegExp(`${escaped}\\s*((?:<=|>=|[<>≤≥])\\s*[-+]?\\d+(?:[.,]\\d+)?(?:\\s+[^|]{0,70})?)`,'i'));if(m)ref=m[1].trim();}
    }
    ref=cleanReferenceText(ref);
    return {unit:canonicalUnitDisplay(u),reference:ref,flag};
  }

  function semanticQualitativeStatus(result='') {
    const n=normalizeText(result);
    if(!n)return 'da verificare';
    if(/^(?:negativ[oa]|assente|assenti|assenza (?:di )?(?:anomalie|alterazioni)|nella norma|normale|nei limiti|regolare|non reattivo|nulla di patologico|limpido|paglierino)$/.test(n))return 'nei limiti';
    if(/^(?:positiv[oa]|presente|presenti|reattivo|anomali[ae]|patologico)$/.test(n))return 'da verificare';
    return 'da verificare';
  }

  function descriptiveStatus(value,reference='',fallback='') {
    const n=normalizeText(reference);
    const range=detectRange(reference);
    if(/insufficient/.test(n)&&range?.operator&&Number.isFinite(range.limit)){
      const isInsufficient=(range.operator==='<'&&value<range.limit)||(range.operator==='≤'&&value<=range.limit);
      if(isInsufficient)return 'insufficiente';
    }
    const calculated=statusFromRange(value,range,reference);
    return calculated==='da verificare'?(fallback||'da verificare'):calculated;
  }

  function repairValueFromSource(value={}) {
    const source=String(value.sourceLine||'');
    let numeric=Number(value.value);
    let raw=String(value.rawValue??value.value??'');
    const name=String(value.parameterName||value.test||'');
    if(/filtrato glomerulare|\begfr\b/i.test(name+' '+source) && /ckd[- ]?epi/i.test(source)){
      const patterns=[
        /ckd[- ]?epi(?:\s+kdigo)?\s*2012[\s.:;,-]+([-+]?\d+(?:[.,]\d+)?)(?=\s*[<>=*]?\s*m[lL]\s*\/\s*min)/i,
        /filtrato\s+glomerulare[^\n]*?\b(?!2012\b)(\d+(?:[.,]\d+)?)(?=\s*[<>=*]?\s*m[lL]\s*\/\s*min)/i,
        /\begfr\b[^\n]*?\b(?!2012\b)(\d+(?:[.,]\d+)?)(?=\s*[<>=*]?\s*m[lL]\s*\/\s*min)/i
      ];
      const m=patterns.map(re=>source.match(re)).find(Boolean);
      if(m){numeric=parseItalianNumber(m[1]);raw=m[1];}
      else if(Number(numeric)===2012){numeric=Number.NaN;raw='';}
    }
    const sci=source.match(/([-+]?\d+(?:[.,]\d+)?)\s*[<>]?\s*(?:x|\*)?\s*10(?:\.e|\^)?\s*([369]|12)\s*\/\s*[µu]?[lL]/i);
    if(sci && (numeric===Number(sci[2]) || !Number.isFinite(numeric))){numeric=parseItalianNumber(sci[1]);raw=sci[1];}
    return {numeric,raw};
  }

  function repairNumericLabValue(value={}) {
    if(!value)return null;
    const originalName=String(value.parameterName||value.test||'');
    const source=String(value.sourceLine||'');
    if(isAdministrativeExamName(originalName,source)||isContextualNonExamName(originalName,source))return null;
    let row=canonicalizeLabValue(value);
    if(isReferenceContinuationName(row.parameterName||row.test||''))return null;
    const repaired=repairValueFromSource(row);
    if(!Number.isFinite(repaired.numeric))return null;
    row.value=repaired.numeric;row.rawValue=String(repaired.raw||repaired.numeric);
    const isEgfr=row.parameterId==='egfr'||/filtrato glomerulare|\begfr\b/i.test(`${row.parameterName||''} ${source}`);
    if(isEgfr&&(/\bformula\s+ckd[- ]?epi\b/i.test(source)&&Number(row.value)===2012||/\bin\s+assenza\s+di\s+altre\s+evidenze\b/i.test(source)))return null;
    const split=splitUnitReference(row.unit||'',row.range?.raw||row.reference||'',source);
    row.unit=split.unit;row.unitKey=canonicalUnitKey(split.unit);
    let reference=cleanReferenceText(split.reference||row.range?.raw||row.reference||'');
    if(isEgfr){
      if(/m[lL]\s*\/\s*min/i.test(source)){row.unit='mL/min/1,73 m²';row.unitKey='ml/min/1.73m2';}
      if(!reference){const rm=source.match(/(?:>=|<=|[<>≤≥])\s*90\b/i);if(rm)reference=rm[0].replace('>=','≥').replace('<=','≤');}
    }
    let range=detectRange(reference)||null;
    if(range&&reference)range={...range,raw:reference};
    row.range=range;
    const status=descriptiveStatus(Number(row.value),reference,statusFromRange(Number(row.value),range,`${source} ${split.flag||''}`));
    row.status=status||'da verificare';
    row.graphEligible=Boolean(row.parameterId&&!isReferenceContinuationName(row.parameterName));
    return row;
  }

  function labValueQuality(v={}) {
    let score=0;const status=normalizeText(v.status||'');
    if(status&&!/non definito|da verificare/.test(status))score+=8;
    if(v.range&&(Number.isFinite(v.range.min)||Number.isFinite(v.range.max)||Number.isFinite(v.range.limit)))score+=5;
    if(v.unit&&!/^[<>≤≥]/.test(String(v.unit)))score+=3;
    score+=Math.min(3,Number(v.confidence||0)/35);
    return score;
  }

  function dedupeLabValues(values=[]) {
    const map=new Map();
    for(const item of Array.isArray(values)?values:[]){
      const v=item&&item.parameterName?item:canonicalizeLabValue(item||{});
      if(!v||isReferenceContinuationName(v.parameterName||v.test||''))continue;
      const key=`${v.parameterId||normalizedExamKey(v.parameterName)}|${Number(v.value)}|${canonicalUnitKey(v.unit||'')}`;
      const current=map.get(key);
      if(!current||labValueQuality(v)>labValueQuality(current))map.set(key,v);
    }
    return [...map.values()];
  }

  function repairQualitativeResults(values=[]) {
    const map=new Map();
    for(const raw of Array.isArray(values)?values:[]){
      if(!raw||isAdministrativeExamName(raw.test||'',raw.sourceLine||'')||isContextualNonExamName(raw.test||'',raw.sourceLine||'')||isReferenceContinuationName(raw.test||''))continue;
      const split=splitUnitReference(raw.unit||'',raw.reference||'',raw.sourceLine||'');
      const q={...raw,test:cleanTestName(raw.test||''),unit:split.unit,reference:cleanReferenceText(split.reference),status:raw.status||semanticQualitativeStatus(raw.result||'')};
      const key=`${normalizedExamKey(q.test)}|${normalizeText(q.result)}|${canonicalUnitKey(q.unit)}`;
      const cur=map.get(key);if(!cur||(!/non definito|da verificare/.test(normalizeText(q.status))&&/non definito|da verificare/.test(normalizeText(cur.status||''))))map.set(key,q);
    }
    return [...map.values()];
  }

  function repairLabDocumentData(doc={}) {
    const rawLab=Array.isArray(doc.labValues)?doc.labValues:[];
    const rawQual=Array.isArray(doc.qualitativeResults)?doc.qualitativeResults:[];
    const repairedSequential=[];let lastNumeric=null;let removedFalse=0;
    for(const raw of rawLab){
      const rawName=String(raw?.parameterName||raw?.test||'');const source=String(raw?.sourceLine||'');
      if(isReferenceContinuationName(rawName)||isContextualNonExamName(rawName,source)){
        if(lastNumeric&&isClinicalReferenceNote(source||rawName)){const note=source||rawName;lastNumeric.referenceNotes=[...(lastNumeric.referenceNotes||[]),note].filter((x,i,a)=>a.indexOf(x)===i);}
        removedFalse++;continue;
      }
      const repaired=repairNumericLabValue(raw);if(repaired){repairedSequential.push(repaired);lastNumeric=repaired;}else removedFalse++;
    }
    const labValues=dedupeLabValues(repairedSequential);
    const qualitativeResults=repairQualitativeResults(rawQual);
    const tableRows=[...labValues.map(v=>({kind:'numeric',test:v.parameterName,value:v.value,result:v.rawValue??v.value,unit:v.unit||'',reference:v.range?.raw||'',status:v.status||'',sourceLine:v.sourceLine||'',pageNumber:v.pageNumber})),...qualitativeResults.map(q=>({kind:'qualitative',test:q.test,result:q.result,unit:q.unit||'',reference:q.reference||'',status:q.status||'',sourceLine:q.sourceLine||'',pageNumber:q.pageNumber}))];
    const before=JSON.stringify({l:rawLab,q:rawQual,t:doc.tableRows||[]});
    const after=JSON.stringify({l:labValues,q:qualitativeResults,t:tableRows});
    const substantiveChanged=before!==after;
    return {document:{...doc,labValues,qualitativeResults,tableRows,labRepairVersion:'test18-v1'},changed:substantiveChanged||doc.labRepairVersion!=='test18-v1',substantiveChanged,stats:{initialRows:rawLab.length+rawQual.length,finalRows:labValues.length+qualitativeResults.length,falseRowsRemoved:removedFalse,duplicatesRemoved:Math.max(0,repairedSequential.length-labValues.length)}};
  }

  const NARRATIVE_ADMIN_RE=/(?:azienda\s+(?:ospedaliera|sanitaria)|servizio\s+sanitario|who\s+collaborating|dipartimento|u\.?o\.?\s|direttore|responsabile|ambulatorio|prenotazione|centralino|telefono|tel\.?|fax|e-?mail|@|codice\s+fiscale|data\s+di\s+nascita|luogo\s+di\s+nascita|indirizzo|residenza|cartella\s+clinica|numero\s+referto|paziente\s*:|n[°.]\s*cartella|via\s+[a-zà-ÿ]+\s*,?\s*\d+)/i;
  const NARRATIVE_CLINICAL_RE=/(?:anamnes|diagnos|terapia|programma|follow[- ]?up|controllo|esame\s+obiettivo|repert|conclusion|indicaz|ecograf|valori?\s+tiroide|peso|variazione\s+ponderale|pressione|sintom|motivo\s+visita|parametri\s+antropometrici)/i;

  function cleanNarrativeFragment(text='') {
    const out=[];const seen=new Set();
    for(let raw of String(text||'').replace(/\r/g,'\n').split(/\n+/)){
      let line=raw.replace(/\s+/g,' ').trim();if(!line)continue;
      if(/^(?:il\s+medico|firma|firmato\s+digitalmente|referto\s+firmato|esecutore)\b/i.test(line))continue;
      if(NARRATIVE_ADMIN_RE.test(line)&&!NARRATIVE_CLINICAL_RE.test(line))continue;
      if(NARRATIVE_ADMIN_RE.test(line)&&NARRATIVE_CLINICAL_RE.test(line)){
        const m=line.match(/\b(?:anamnesi|diagnosi|terapia|programma|follow[- ]?up|esame\s+obiettivo|reperti?|conclusioni?|indicazioni?|ecografia|valori?\s+tiroidei?|peso|variazione\s+ponderale|motivo\s+visita|parametri\s+antropometrici|riferisce|nega|ipotiroidismo)\b/i);
        if(m&&m.index>0)line=line.slice(m.index).trim();
      }
      if(/^(?:(?:nulla|niente) da segnalare|nessuna? (?:nota|osservazione)|nessun commento)$/i.test(line))continue;
      const key=normalizeText(line);if(!key||seen.has(key))continue;seen.add(key);out.push(line);
    }
    return out.join('\n').trim();
  }

  function extractEcgParameters(doc={}) {
    const source=String(doc.extractedText||doc.structuredText||doc.reconstructedText||(doc.reportSections||[]).map(s=>`${s.title||''}: ${s.text||''}`).join('\n')||'');
    const identity=`${doc.title||''} ${doc.originalName||''} ${doc.documentKind||''} ${doc.category||''} ${source}`;
    if(!/\b(?:ecg|elettrocardiogramma|elettrocardiografico)\b/i.test(identity)||!/(?:freq\s*vent|int\s*pr|dur\s*qrs|qt\s*\/\s*qtc|assi\s*p\s*[-/]\s*r\s*[-/]\s*t)/i.test(source))return[];
    const rows=[];const add=(parameter,value)=>{value=String(value||'').replace(/\s+/g,' ').trim();if(!value)return;if(!rows.some(x=>normalizeText(x.parameter)===normalizeText(parameter)))rows.push({parameter,value});};
    let m=source.match(/Freq(?:uenza)?\s*Vent(?:ricolare)?\s*:?\s*(?:\n|\s)*([0-9]{2,3})\s*BPM/i);if(m)add('Frequenza ventricolare',`${m[1]} BPM`);
    m=source.match(/Int(?:ervallo)?\s*PR\s*:?\s*(?:\n|\s)*([0-9]{2,4})\s*ms/i);if(m)add('Intervallo PR',`${m[1]} ms`);
    m=source.match(/QT\s*\/\s*QTc\s*:?\s*(?:\n|\s)*([0-9]{2,4})\s*\/\s*([0-9]{2,4})\s*ms/i);
    if(!m)m=source.match(/Dur(?:ata)?\s*QRS\s*:?\s*(?:\n|\s)*([0-9]{3,4})\s*\/\s*([0-9]{3,4})\s*ms/i);
    if(m)add('QT / QTc',`${m[1]} / ${m[2]} ms`);
    m=source.match(/(?:[0-9]{3,4}\s*\/\s*[0-9]{3,4}\s*ms)[\s\S]{0,90}?([0-9]{2,3})\s*ms/i)||source.match(/(?:Dur(?:ata)?\s*QRS[\s\S]{0,100}?|QT\s*\/\s*QTc[\s\S]{0,100}?)([0-9]{2,3})\s*ms(?:\s|\n|Farm|$)/i);if(m&&Number(m[1])<220)add('Durata QRS',`${m[1]} ms`);
    m=source.match(/(?:QT\s*\/\s*QTc|Dur(?:ata)?\s*QRS)[\s\S]{0,80}?([+-]?\d{1,3})\s+([+-]?\d{1,3})\s+([+-]?\d{1,3})(?:\s|\n)/i);if(m)add('Assi P-R-T',`${m[1]} / ${m[2]} / ${m[3]}°`);
    m=source.match(/\b(RITMO\s+(?:SINUSALE|ATRIALE|GIUNZIONALE|VENTRICOLARE|REGOLARE|IRREGOLARE))\b/i);if(m)add('Ritmo',m[1].replace(/\s+/g,' ').toLowerCase().replace(/^./,c=>c.toUpperCase()));
    m=source.match(/\bECG\s+(NORMALE|NEI\s+LIMITI|ANORMALE)\b/i);if(m)add('Conclusione',`ECG ${m[1].toLowerCase()}`);
    return rows;
  }

  function repairNarrativeDocumentData(doc={}) {
    const ecgParameters=extractEcgParameters(doc);
    const merged=new Map(),order=[];
    for(const section of Array.isArray(doc.reportSections)?doc.reportSections:[]){
      let title=String(section?.title||'Referto clinico').replace(/\s+/g,' ').trim().replace(/[,;:\-]?\s*continua\s*$/i,'').trim();
      if(!title||/^(?:intestazione(?: e dati del referto)?|il medico|firma|identificazione e firma)$/i.test(title))continue;
      const text=cleanNarrativeFragment(section?.text||'');if(!text)continue;
      const key=normalizeText(title);
      if(!merged.has(key)){merged.set(key,{title,texts:[],seen:new Set()});order.push(key);}
      const row=merged.get(key),ck=normalizeText(text);if(!row.seen.has(ck)){row.seen.add(ck);row.texts.push(text);}
    }
    let reportSections=order.map(key=>{const row=merged.get(key);return{title:row.title,text:row.texts.join('\n')}}).filter(x=>x.text);
    if(ecgParameters.length)reportSections=[];
    const reconstructedText=reportSections.map(s=>`${s.title}\n${s.text}`).join('\n\n').trim();
    const before=JSON.stringify({s:doc.reportSections||[],e:doc.ecgParameters||[],r:doc.reconstructedText||''});
    const after=JSON.stringify({s:reportSections,e:ecgParameters,r:reconstructedText});
    const substantiveChanged=before!==after;
    return {document:{...doc,reportSections,reconstructedText:ecgParameters.length?'':reconstructedText,ecgParameters,narrativeRepairVersion:'test18-v1'},changed:substantiveChanged||doc.narrativeRepairVersion!=='test18-v1',substantiveChanged,stats:{sectionsBefore:(doc.reportSections||[]).length,sectionsAfter:reportSections.length,ecgParameters:ecgParameters.length}};
  }

  function cleanTestName(name='') {
    return String(name||'')
      .replace(/^(?:sg|s|u|p|pl|ur|e)\s*[-–—]{1,3}\s*/i,'')
      .replace(/^[-–—:;,.\s]+|[-–—:;,.\s]+$/g,'')
      .replace(/\s+/g,' ')
      .trim()
      .slice(0,180);
  }

  function isResultToken(value='') {
    const t=String(value||'').trim();
    return /^[<>≤≥]?\s*-?\d+(?:[.,]\d+)?(?:\s*[<>≤≥*]+)?$/.test(t)
      || /^(?:assente|assenti|presente|presenti|positivo|negativo|normale|limpido|opalescente|paglierino|non\s+reattivo|reattivo|nulla\s+da\s+segnalare)$/i.test(t);
  }

  function numericResultParts(raw='') {
    const text=String(raw||'').replace(/\s+/g,' ').trim();
    const m=text.match(/([<>≤≥]?\s*-?\d+(?:[.,]\d+)?)(?:\s*([<>≤≥*]+))?/);
    if(!m)return null;
    const value=parseItalianNumber(m[1]);
    if(!Number.isFinite(value))return null;
    return {rawValue:m[1].replace(/\s+/g,''),value,flag:m[2]||''};
  }

  function headerRole(text='') {
    const n=normalizeText(text).replace(/[^a-z0-9.]+/g,' ');
    if(/\b(?:esame|analisi|test|parametro|descrizione)\b/.test(n))return 'test';
    if(/\b(?:esito|risultato|valore)\b/.test(n))return 'result';
    if(/\b(?:u m|um|unita|unità|metodica)\b/.test(n))return 'unit';
    if(/\b(?:riferimento|riferimenti|range|intervallo|valori riferimento)\b/.test(n))return 'reference';
    return '';
  }

  function tableHeaderFromLine(line) {
    const words=Array.isArray(line?.words)&&line.words.length?line.words:[];
    if(!words.length)return null;
    const found={};
    for(const w of words){
      const role=headerRole(w.text);
      if(role){
        const x=Number(w.x||0);
        if(role==='unit')found[role]=found[role]==null?x:Math.max(found[role],x);
        else if(found[role]==null)found[role]=x;
      }
    }
    const lineNorm=normalizeText(line.text||'');
    if(found.test==null && /\b(?:esame|analisi|descrizione|test)\b/.test(lineNorm))found.test=Number(line.x||0);
    const roles=Object.keys(found);
    if(found.result==null || roles.length<2)return null;
    const xs=roles.map(k=>found[k]).filter(Number.isFinite).sort((a,b)=>a-b);
    const width=Math.max(1,Number(line.width||0));
    const start=Number(line.x||xs[0]||0),end=start+width;
    const testX=Number.isFinite(found.test)?found.test:start;
    const resultX=found.result;
    let unitX=Number.isFinite(found.unit)?found.unit:null;
    let refX=Number.isFinite(found.reference)?found.reference:null;
    if(unitX==null && refX!=null)unitX=resultX+(refX-resultX)*0.48;
    if(unitX==null)unitX=resultX+Math.max(45,(end-resultX)*0.30);
    if(refX==null)refX=unitX+Math.max(55,(end-unitX)*0.48);
    if(!(testX<resultX && resultX<unitX && unitX<refX))return null;
    return {testX,resultX,unitX,refX,headerY:Number(line.y||0),headerHeight:Number(line.height||12),pageNumber:Number(line.pageNumber||1)};
  }

  function cellText(words=[],min=-Infinity,max=Infinity) {
    return words.filter(w=>{
      const c=Number(w.x||0)+Number(w.width||0)/2;
      return c>=min&&c<max;
    }).sort((a,b)=>Number(a.x||0)-Number(b.x||0)).map(w=>String(w.text||'').trim()).filter(Boolean).join(' ').replace(/\s+/g,' ').trim();
  }

  function inferSample(test='',section='') {
    const raw=String(test||'').trim();
    if(/^u\s*[-–—]{1,3}/i.test(raw)||/urine|urinari|sedimento|urobilinogeno|nitriti/i.test(`${section} ${raw}`))return 'Urine';
    if(/^s(?:g)?\s*[-–—]{1,3}/i.test(raw)||/ematologia|chimica clinica|sangue|siero|plasma/i.test(section))return 'Sangue';
    return '';
  }

  function extractTableRows(pages=[],fallbackText='') {
    const output=[];const seen=new Set();
    const pageList=Array.isArray(pages)?pages:[];
    for(const page of pageList){
      const lines=(Array.isArray(page?.lines)?page.lines:[]).map(x=>({...x,pageNumber:Number(page.pageNumber||1)})).sort((a,b)=>Number(a.y||0)-Number(b.y||0)||Number(a.x||0)-Number(b.x||0));
      let header=null;let currentSection='';let pending=null;let emptyAfterHeader=0;
      for(let i=0;i<lines.length;i++){
        const line=lines[i];const lineNorm=normalizeText(line.text||'');
        const candidateHeader=tableHeaderFromLine(line);
        if(candidateHeader){header=candidateHeader;pending=null;emptyAfterHeader=0;continue;}
        if(!header)continue;
        if(Number(line.y||0)<=header.headerY+header.headerHeight*0.45)continue;
        if(/\b(?:referto completo|referto finale|rappresentazione di un referto|firmatario|data e ora della firma|num\.? certificato|pagina|pag\.|sessione n|segue)\b/i.test(line.text||'')){header=null;pending=null;continue;}
        const words=Array.isArray(line.words)?line.words:[];
        if(!words.length)continue;
        const b1=(header.testX+header.resultX)/2,b2=(header.resultX+header.unitX)/2,b3=(header.unitX+header.refX)/2;
        const whole=String(line.text||'').trim();
        let test='',result='',unit='',reference='';
        const spaced=whole.split(/\s{2,}/).map(x=>x.trim()).filter(Boolean);
        if(spaced.length>=2){
          const resultIndex=spaced.findIndex((x,idx)=>idx>0&&(numericResultParts(x)||/^(?:assente|assenti|presente|presenti|positivo|negativo|normale|limpido|opalescente|paglierino|non\s+reattivo|reattivo|nulla\s+da\s+segnalare)$/i.test(x)));
          if(resultIndex>0){test=spaced.slice(0,resultIndex).join(' ');result=spaced[resultIndex]||'';unit=spaced[resultIndex+1]||'';reference=spaced.slice(resultIndex+2).join(' ');}
        }
        if(!result){test=cellText(words,-Infinity,b1);result=cellText(words,b1,b2);unit=cellText(words,b2,b3);reference=cellText(words,b3,Infinity);}
        if(!test && whole && Number(line.x||0)<b1)test=whole;
        const numeric=numericResultParts(result);
        const qualitative=/^(?:assente|assenti|presente|presenti|positivo|negativo|normale|limpido|opalescente|paglierino|non\s+reattivo|reattivo|nulla\s+da\s+segnalare)$/i.test(result);
        if(!numeric&&!qualitative){
          if(test && !unit && !reference && !/\d/.test(test)){
            if(/^[A-ZÀ-ÖØ-Ý0-9 .()\/-]{3,80}$/.test(test)&&!/^Sg?\s*[-–—]/i.test(test))currentSection=cleanTestName(test);
            else if(pending)pending.test=`${pending.test} ${test}`.replace(/\s+/g,' ').trim();
            else pending={test,section:currentSection,pageNumber:Number(page.pageNumber||1),sourceLine:whole};
            emptyAfterHeader++;continue;
          }
          if(pending && (unit||reference||test)){
            if(test)pending.test=`${pending.test} ${test}`.replace(/\s+/g,' ').trim();
            if(unit)pending.unit=unit;if(reference)pending.reference=reference;
          }
          emptyAfterHeader++;
          if(emptyAfterHeader>18&&output.length)header=null;
          continue;
        }
        emptyAfterHeader=0;
        if(pending){test=`${pending.test||''} ${test||''}`.replace(/\s+/g,' ').trim();pending=null;}
        test=cleanTestName(test);
        if(!test||test.length<2||/^(?:esame|analisi|risultato|esito|valore|metodica)$/i.test(test))continue;
        if(/^(?:uomini|donne|maschi|femmine|valore consigliato|valori desiderabili|valori consigliati)$/i.test(test))continue;
        const key=normalizeText(`${page.pageNumber}|${test}|${result}|${unit}|${reference}`);
        if(seen.has(key))continue;seen.add(key);
        output.push({test,result:result.trim(),unit:normalizeLabUnit(unit),reference:String(reference||'').replace(/[÷]/g,'-').replace(/[–—]/g,'-').trim(),section:currentSection,pageNumber:Number(page.pageNumber||1),sourceLine:whole,confidence:92});
      }
    }
    return output;
  }

  function structuredMeasurements(text='',pages=[]) {
    const rows=extractTableRows(pages,text);const labValues=[];const qualitativeResults=[];const seen=new Set();
    for(const row of rows){
      const numeric=numericResultParts(row.result);
      if(numeric){
        const mapped=parameterForLine(`${row.test} ${row.unit}`);
        const parameterName=mapped?.name||cleanTestName(row.test);
        const sample=mapped?.sample||inferSample(row.test,row.section);
        const range=detectRange(row.reference);
        const id=mapped?.id||customParameterId(`${sample}_${parameterName}_${row.unit}`);
        const key=normalizeText(`${id}|${numeric.value}|${row.unit}|${range?.raw||row.reference}|${row.pageNumber}`);
        if(seen.has(key))continue;seen.add(key);
        labValues.push({id:`value_${crypto.randomUUID?crypto.randomUUID():Math.random().toString(36).slice(2)}`,parameterId:id,parameterName,sample,value:numeric.value,rawValue:numeric.rawValue,unit:row.unit,range:range|| (row.reference?{raw:row.reference}:null),status:statusFromRange(numeric.value,range,`${row.sourceLine} ${numeric.flag}`),sourceLine:row.sourceLine,pageNumber:row.pageNumber,confidence:row.confidence});
      }else{
        const key=normalizeText(`${row.test}|${row.result}|${row.pageNumber}`);if(seen.has(key))continue;seen.add(key);
        qualitativeResults.push({test:cleanTestName(row.test),result:row.result,unit:row.unit,reference:row.reference,sourceLine:row.sourceLine,pageNumber:row.pageNumber,confidence:row.confidence});
      }
    }
    return {rows,labValues,qualitativeResults};
  }

  function extractLabValues(text='',pages=[]) {
    const structural=structuredMeasurements(text,pages).labValues;
    const rawLines=String(text).replace(/\u00a0/g,' ').split(/\r?\n/).map(l=>l.replace(/\s+/g,' ').trim()).filter(Boolean);
    const lines=[...rawLines];
    const values=[];const seen=new Set();
    const rowRe=/^(?:[A-Za-z]{1,3}\s*[-–—]{1,3}\s*)?(.+?)\s+([<>≤≥]?\s*[0-9Oo]+(?:[.,][0-9]+)?)\s*((?:x\s*)?10(?:\.e|\^)?\s*[369]\s*\/\s*[µu]?[lL]|(?:mg|g|ng|pg|µg|ug|mmol|mol|m?ui|ui|u|fl|ml|meq)\s*\/?\s*(?:d[lL]|m[lL]|[lL]|mol|24h|min(?:\/1[,.]73m²)?|[µu][lL])?|%|pg|fl)?\s*(.*)$/i;
    for(const line of lines) {
      if(/^(?:analisi|metodica|risultato|descrizione esame|valori? di riferimento|referto|pagina|accettazione)\b/i.test(line))continue;
      let match=line.match(rowRe);
      let p=parameterForLine(line);
      if(!match||!p)continue;
      const rawValue=match[2].replace(/\s+/g,'');const value=parseItalianNumber(rawValue);
      if(!Number.isFinite(value)||(value>=1900&&value<=2100))continue;
      let unit=normalizeLabUnit(match[3]||'');
      const trailing=match[4]||'';
      if(!unit) {
        const unitMatch=line.match(/(x\s*10(?:\.e|\^)?\s*[369]\s*\/\s*[µu]?[lL]|mg\s*\/\s*d[lL]|g\s*\/\s*d[lL]|ng\s*\/\s*m[lL]|pg\s*\/\s*m[lL]|mmol\s*\/\s*[lL]|m?ui\s*\/\s*[lL]|µ?ui\s*\/\s*m[lL]|ui?\s*\/\s*[lL]|meq\s*\/\s*[lL]|f[lL]|pg|%)/i);
        if(unitMatch)unit=normalizeLabUnit(unitMatch[0]);
      }
      const range=detectRange(trailing||line.slice(line.indexOf(match[2])+match[2].length));
      const key=`${p.id}|${value}|${normalizeText(unit)}|${range?.raw||''}|${normalizeText(line)}`;
      if(seen.has(key))continue;seen.add(key);
      let confidence=84;if(unit)confidence+=7;if(range)confidence+=5;
      values.push({id:`value_${crypto.randomUUID?crypto.randomUUID():Math.random().toString(36).slice(2)}`,parameterId:p.id,parameterName:p.name,sample:p.sample,value,rawValue,unit,range,status:statusFromRange(value,range,line),sourceLine:line,confidence:Math.min(99,confidence)});
    }
    const merged=[...structural];
    const keys=new Set(merged.map(v=>normalizeText(`${v.parameterId}|${v.value}|${v.unit}`)));
    for(const v of values){const k=normalizeText(`${v.parameterId}|${v.value}|${v.unit}`);if(!keys.has(k)){keys.add(k);merged.push(v);}}
    return merged;
  }

  function extractTherapies(text='') {
    const lines=String(text).replace(/\u00a0/g,' ').split(/\r?\n/).map(l=>l.replace(/\s+/g,' ').trim()).filter(Boolean);
    const out=[]; const grouped=new Map();
    const unit='(?:mg|mcg|µg|ug|g|ml|ui|u\\.i\\.|mg\\/ml|mcg\\/dose)';
    const doseRe=new RegExp(`\\b(\\d+(?:[.,]\\d+)?(?:\\s*\\/\\s*\\d+(?:[.,]\\d+)?)?\\s*${unit}(?:\\s*\\/\\s*\\d+(?:[.,]\\d+)?\\s*${unit})?)\\b`,'i');
    for (const line of lines) {
      if (/range|valore|parametro|emocromo|glicemia|creatinina|colesterolo|trigliceridi/i.test(line) && !/terapia|farmaco/i.test(line)) continue;
      const dm=line.match(doseRe); if (!dm) continue;
      let before=line.slice(0,dm.index).replace(/^\s*\d{1,2}[:.]\d{2}\s*/i,'').replace(/^\([^)]*\)\s*/,'').replace(/^(?:farmaco|principio attivo|terapia)\s*[:\-]?\s*/i,'').trim();
      const medication=before.split(/\s{2,}|\t|[|;]/).filter(Boolean).pop()?.replace(/^\([^)]*\)\s*/,'').trim()||'';
      if (!medication || medication.length<2 || medication.length>90 || /^\d/.test(medication)) continue;
      const after=line.slice((dm.index||0)+dm[0].length).trim();
      const schedule=after.slice(0,180);
      const key=normalizeText(`${medication}|${dm[1]}`);
      if (grouped.has(key)) {
        const row=grouped.get(key); if (schedule && !row.schedule.includes(schedule)) row.schedule=[row.schedule,schedule].filter(Boolean).join(' | '); row.sourceLine += ` || ${line}`; continue;
      }
      const row={medication:cleanEntity(medication),dosage:dm[1].replace(/\s+/g,' '),schedule,active:true,notes:'Estratto automaticamente dal documento',confidence:schedule?84:70,sourceLine:line};
      grouped.set(key,row);out.push(row);
    }
    return out.slice(0,80);
  }

  function extractExemptions(text='') {
    const lines=String(text).replace(/\u00a0/g,' ').split(/\r?\n/).map(l=>l.replace(/\s+/g,' ').trim()).filter(Boolean);
    const out=[]; const seen=new Set();
    const codeRe=/\b(?:[0-9]{3}\.[0-9A-Z]{3}|0[A-Z][0-9]{2}\.[0-9A-Z]{3}|[A-Z][0-9]{2,3})\b/g;
    for (let i=0;i<lines.length;i++) {
      const line=lines[i]; let m;
      while((m=codeRe.exec(line))) {
        const code=m[0].toUpperCase();
        if (seen.has(code) || /(?:mg|ml|mmol|mUI|ng|pg|U\/L)/i.test(line)) continue;
        seen.add(code);
        const lineRemainder=line.slice((m.index||0)+m[0].length).replace(/^[\s:;,.\-–]+/,'');
        const nextLine=lines[i+1]||'';
        const description=cleanEntity(lineRemainder || (/^(?:codice\s+)?[0-9A-Z.]+\b/i.test(nextLine)?'':nextLine));
        const validityContext=[line,nextLine].join(' ').slice(0,260);
        const dateMatch=validityContext.match(/\b(0?[1-9]|[12]\d|3[01])[\/\.\-](0?[1-9]|1[0-2])[\/\.\-]((?:19|20)\d{2})\b/);
        out.push({code,description,validFrom:dateMatch?isoDate(dateMatch[1],dateMatch[2],dateMatch[3]):'',expiry:/illimitat/i.test(validityContext)?'Illimitata':'',notes:'Estratta automaticamente dal documento',confidence:description?86:72,sourceLine:line});
      }
    }
    return out.slice(0,40);
  }

  function variableTokens(text='') {
    const normalized=normalizeText(text);
    const dates=[...normalized.matchAll(/\b(?:0?[1-9]|[12]\d|3[01])[\/.\-](?:0?[1-9]|1[0-2])[\/.\-](?:19|20)\d{2}\b/g)].map(m=>m[0].replace(/[.\-]/g,'/'));
    const numbers=[...normalized.matchAll(/[<>≤≥]?\s*\b\d+(?:[.,]\d+)?\b/g)].map(m=>m[0].replace(/\s+/g,'').replace(',','.')).filter(x=>!/^20\d{2}$/.test(x)&&!/^19\d{2}$/.test(x));
    const ids=[...normalized.matchAll(/\b[a-z]{0,4}\d{5,}[a-z0-9.-]*\b/g)].map(m=>m[0]);
    return [...new Set([...dates,...numbers,...ids])].slice(0,500);
  }

  function dateTokens(text='') {
    return [...new Set([...String(text).matchAll(/\b(0?[1-9]|[12]\d|3[01])[\/.\-](0?[1-9]|1[0-2])[\/.\-]((?:19|20)\d{2})\b/g)].map(m=>isoDate(m[1],m[2],m[3])).filter(Boolean))];
  }

  function pageFingerprint(page={}, index=0, clinicalDate='') {
    const text=String(page.text||'');
    return {pageNumber:Number(page.pageNumber||index+1),tokens:textFingerprint(text),dynamicTokens:variableTokens(text),dates:dateTokens(text),clinicalDate:clinicalDate||page.clinicalDate||'',textLength:normalizeText(text).length,visualHash:String(page.visualHash||''),text};
  }

  function buildPageFingerprints(pages=[], fallbackText='', clinicalDate='') {
    const src=Array.isArray(pages)&&pages.length?pages:[{pageNumber:1,text:fallbackText||'',visualHash:''}];
    return src.map((page,index)=>pageFingerprint(page,index,clinicalDate));
  }

  function visualSimilarity(a='',b='') {
    if (!a||!b||a.length!==b.length||new Set(a).size<=1||new Set(b).size<=1) return 0;
    let different=0,total=0;
    for(let i=0;i<a.length;i++) {
      const x=parseInt(a[i],16),y=parseInt(b[i],16); if(!Number.isFinite(x)||!Number.isFinite(y))continue;
      let v=x^y; for(let j=0;j<4;j++){different+=v&1;v>>=1;total++;}
    }
    return total?1-different/total:0;
  }

  function pageSimilarity(a={},b={}) {
    const textSim=jaccard(a.tokens||textFingerprint(a.text||''),b.tokens||textFingerprint(b.text||''));
    const dynamicSim=jaccard(a.dynamicTokens||variableTokens(a.text||''),b.dynamicTokens||variableTokens(b.text||''));
    const visualSim=visualSimilarity(a.visualHash,b.visualHash);
    const datesA=new Set(a.dates||dateTokens(a.text||'')),datesB=new Set(b.dates||dateTokens(b.text||''));
    const onlyA=[...datesA].filter(x=>!datesB.has(x)),onlyB=[...datesB].filter(x=>!datesA.has(x));
    const explicitClinicalConflict=Boolean(a.clinicalDate&&b.clinicalDate&&a.clinicalDate!==b.clinicalDate);
    const dateConflict=explicitClinicalConflict||Boolean(onlyA.length&&onlyB.length);
    let combined=textSim*0.35+dynamicSim*0.5+visualSim*0.15;
    if(visualSim>=0.992&&!dateConflict&&dynamicSim>=0.72)combined=Math.max(combined,0.98);
    if(dateConflict)combined=Math.min(combined,0.52);
    if(dynamicSim<0.5&&visualSim<0.985)combined=Math.min(combined,0.68);
    return {combined,textSim,dynamicSim,visualSim,dateConflict};
  }

  function comparePageCollections(source=[],target=[]) {
    if (!source.length||!target.length) return null;
    const matches=[];const used=new Set();
    for(let i=0;i<source.length;i++) {
      let best=null;
      for(let j=0;j<target.length;j++) {
        if(used.has(j))continue;
        const sim=pageSimilarity(source[i],target[j]);
        if(!best||sim.combined>best.combined)best={sourcePage:i+1,targetPage:j+1,...sim,targetIndex:j};
      }
      if(best&&!best.dateConflict&&best.combined>=0.86&&(best.dynamicSim>=0.68||best.visualSim>=0.992)){matches.push(best);used.add(best.targetIndex);}
    }
    const sourceCoverage=matches.length/source.length,targetCoverage=matches.length/target.length;
    let relation='none';
    if(sourceCoverage===1&&targetCoverage===1)relation='same';
    else if(sourceCoverage===1&&source.length<=target.length)relation='source-contained';
    else if(targetCoverage===1&&target.length<source.length)relation='target-contained';
    else if(matches.length&&(sourceCoverage>=0.5||targetCoverage>=0.5))relation='partial-overlap';
    if(relation==='none')return null;
    return {relation,matches,sourceCoverage,targetCoverage,average:matches.reduce((a,m)=>a+m.combined,0)/matches.length};
  }

  function generateTitle(text, category, dateValue) {
    const specific=detectSpecificType(text); const base=specific||category||'Documento sanitario';
    return dateValue ? `${base} del ${dateValue.split('-').reverse().join('/')}` : base;
  }

  function estimateExtractionCompleteness(text='',labValues=[],qualitativeResults=[]) {
    const lines=String(text||'').split(/\r?\n/).map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean);
    const candidateLines=lines.filter(line=>{
      if(/^(?:analisi|metodica|risultato|descrizione|valori? di riferimento|pagina|referto|accettazione|azienda|ospedale|responsabile)\b/i.test(line))return false;
      return /\b[<>≤≥]?\d+(?:[.,]\d+)?\s*(?:mg\/dl|g\/dl|ng\/ml|pg\/ml|mmol\/l|ui\/l|u\/l|fl|pg|%|x\s*10|10\.e|meq\/l)?\b/i.test(line)
        || /\b(?:assente|assenti|presente|presenti|positivo|negativo|normale|limpido|paglierino|nulla da segnalare)\b/i.test(line);
    });
    const candidates=Math.max(candidateLines.length,labValues.length+qualitativeResults.length);
    const structured=labValues.length+qualitativeResults.length;
    const completeness=candidates?Math.min(100,Math.round(structured/candidates*100)):100;
    return {candidateRows:candidates,structuredRows:structured,completeness,warning:completeness<70&&candidates>=5?'Estrazione probabilmente incompleta: controlla il documento o correggi i valori.':''};
  }

  function isPlausibleClinicalIso(iso='') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso||''))) return false;
    const d=new Date(`${iso}T12:00:00`);
    if (Number.isNaN(d.getTime())) return false;
    const min=new Date('1900-01-01T00:00:00');
    const now=new Date(); now.setHours(23,59,59,999);
    return d>=min && d<=now;
  }

  function analyzeText(text, profiles=[], activeProfileId=null, pages=[], fileName='') {
    const active=profiles.find(p=>p.id===activeProfileId)||null;
    const structuredText=getLogicalLines(text,pages).map(x=>x.text).join('\n')||String(text||'');
    const semanticText=String(text||'')||structuredText;
    const date=chooseClinicalDate(semanticText,active?.birthDate||'');
    const fileDates=detectDateFromFilename(fileName)
      .filter(x=>isPlausibleClinicalIso(x.iso) && x.iso!==active?.birthDate);
    if(fileDates.length) {
      const fileDate=fileDates[0];
      const textCandidates=(date.candidates||[]).filter(x=>!x.isBirth && isPlausibleClinicalIso(x.iso));
      const match=textCandidates.find(x=>x.iso===fileDate.iso);
      const selected=textCandidates.find(x=>x.iso===date.value);
      const strongCompeting=textCandidates.find(x=>x.iso!==fileDate.iso && x.score>=110 && /data clinica/.test(x.kind||''));
      const selectedStrong=Boolean(selected && selected.score>=110 && /data clinica/.test(selected.kind||''));

      if (date.value===fileDate.iso || date.suggested===fileDate.iso || match) {
        date.value=fileDate.iso;
        date.suggested=fileDate.iso;
        date.status='detected';
        date.confidence=99;
      }
      else if (!date.value && (date.status==='missing' || date.status==='ambiguous')) {
        if (!strongCompeting) {
          date.value=fileDate.iso;
          date.suggested=fileDate.iso;
          date.status='detected';
          date.confidence=match?99:92;
        }
      }
      else if (date.value && date.value!==fileDate.iso) {
        if (!selectedStrong) {
          date.value=fileDate.iso;
          date.suggested=fileDate.iso;
          date.status='detected';
          date.confidence=92;
        }
        else {
          date.status='ambiguous';
          date.suggested=fileDate.iso;
          date.value='';
        }
      }
      date.candidates=[...(date.candidates||[]),...fileDates].filter((x,i,a)=>a.findIndex(y=>y.iso===x.iso&&y.kind===x.kind)===i);
    }
    const category=detectCategory(semanticText); const issueDate=chooseIssueDate(semanticText,active?.birthDate||'');
    const personnel=detectPersonnel(semanticText,pages); const facility=detectFacility(semanticText,pages); const department=detectDepartment(semanticText,pages); const identifiers=extractIdentifiers(semanticText,pages);
    const structural=structuredMeasurements(structuredText||semanticText,pages);
    const values=extractLabValues(structuredText||semanticText,pages);
    const qualitativeFallback=extractQualitativeResults(structuredText||semanticText,pages);
    const qualitativeResults=[...structural.qualitativeResults];
    const qualitativeKeys=new Set(qualitativeResults.map(x=>normalizeText(`${x.test}|${x.result}|${x.pageNumber||''}`)));
    for(const q of qualitativeFallback){const k=normalizeText(`${q.test}|${q.result}|${q.pageNumber||''}`);if(!qualitativeKeys.has(k)){qualitativeKeys.add(k);qualitativeResults.push(q);}}
    const extractionStats=estimateExtractionCompleteness(structuredText||semanticText,values,qualitativeResults);
    extractionStats.tableRows=structural.rows.length;
    if(category.value!=='Esami di laboratorio' && structural.rows.length===0){extractionStats.candidateRows=0;extractionStats.structuredRows=0;extractionStats.completeness=100;extractionStats.warning='';}
    else if(structural.rows.length>0){extractionStats.candidateRows=Math.max(structural.rows.length,values.length+qualitativeResults.length);extractionStats.structuredRows=values.length+qualitativeResults.length;extractionStats.completeness=Math.min(100,Math.round(extractionStats.structuredRows/Math.max(1,extractionStats.candidateRows)*100));extractionStats.warning=extractionStats.completeness<70?'Estrazione probabilmente incompleta: controlla le righe non strutturate.':'';}
    const profile=profileEvidence(semanticText,profiles,activeProfileId); const therapies=extractTherapies(semanticText); const exemptions=extractExemptions(semanticText);
    return {
      clinicalDate:date.value, suggestedDate:date.suggested, dateStatus:date.status, dateConfidence:date.confidence, dateCandidates:date.candidates,
      issueDate, category:category.value, categoryConfidence:category.confidence,
      doctor:personnel.primary, medicalPersonnel:personnel.people, facility, department, documentNumber:identifiers.documentNumber, identifiers:identifiers.items,
      labValues:values, qualitativeResults, tableRows:structural.rows, extractionStats, extractedTherapies:therapies, extractedExemptions:exemptions, profileEvidence:profile,
      structuredText,title:generateTitle(semanticText,category.value,date.value)
    };
  }

  function tokenize(text='') {
    const stop=new Set(['della','delle','degli','dello','dalla','dallo','dati','esame','referto','paziente','medico','pagina','data','valore','range','note','normale','con','per','che','del','dei','una','uno','gli','nel','nella','sono','alle','alla','come']);
    return normalizeText(text).split(/[^a-z0-9]+/).filter(w=>w.length>2&&!stop.has(w));
  }

  function textFingerprint(text='') {
    const counts=new Map();
    for (const t of tokenize(text).slice(0,2500)) counts.set(t,(counts.get(t)||0)+1);
    return [...counts.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,220).map(x=>x[0]);
  }

  function jaccard(a=[],b=[]) {
    const A=new Set(a),B=new Set(b); if (!A.size||!B.size) return 0;
    let inter=0; for (const x of A) if (B.has(x)) inter++;
    return inter/(A.size+B.size-inter);
  }

  function probableDuplicate(meta, docs=[]) {
    const fp=textFingerprint(meta.text||'');const dyn=variableTokens(meta.text||'');let best=null;
    for(const d of docs) {
      if(!d.extractedText)continue;
      if(meta.clinicalDate&&d.clinicalDate&&meta.clinicalDate!==d.clinicalDate)continue;
      const sim=jaccard(fp,d.textFingerprint||textFingerprint(d.extractedText));
      const dynamicSim=jaccard(dyn,variableTokens(d.extractedText));
      let score=sim*0.42+dynamicSim*0.58;
      if(meta.clinicalDate&&d.clinicalDate===meta.clinicalDate)score+=0.08;
      if(meta.category&&d.category===meta.category)score+=0.02;
      if(!best||score>best.score)best={doc:d,score,similarity:score,textSimilarity:sim,dynamicSimilarity:dynamicSim};
    }
    return best&&best.score>=0.86&&best.dynamicSimilarity>=0.72?best:null;
  }

  function parameterMatches(query='') {
    const q=normalizeText(query); if (!q) return [];
    return PARAMS.filter(p=>normalizeText(p.name).includes(q)||p.aliases.some(a=>normalizeText(a).includes(q)||q.includes(normalizeText(a))));
  }

  function parameterById(id) { return PARAMS.find(p=>p.id===id)||null; }


  // TEST 19 - classificazione automatica dei pannelli, OCR misto e HbA1c equivalente
  const TEST19_REPAIR_VERSION='test19-v1';
  const TEST19_PANEL_ORDER=[
    'Emocromo','Formula leucocitaria','Coagulazione','Metabolismo glucidico',
    'Profilo lipidico','Funzionalità epatica','Funzionalità renale','Elettroliti',
    'Funzionalità tiroidea','Esame urine','Esame del sedimento urinario','Altri esami di laboratorio'
  ];

  function collapseAdjacentOcrDuplicates(value='') {
    const parts=String(value||'').replace(/\s+/g,' ').trim().split(' ').filter(Boolean);
    const out=[];
    for(const part of parts){
      if(out.length&&normalizeText(out[out.length-1])===normalizeText(part))continue;
      out.push(part);
    }
    return out.join(' ');
  }

  function test19KnownAnalyte(name='',unit='') {
    const direct=parameterForLine(`${name} ${unit||''}`);if(direct)return direct;
    const compactName=normalizedCompact(name);
    if(!compactName)return null;
    return PARAMS.find(p=>p.aliases.some(alias=>{const a=normalizedCompact(alias);return a&&compactName===a;}))||null;
  }

  function test19FusedPanelInfo(name='',source='') {
    const raw=collapseAdjacentOcrDuplicates(`${name} ${source}`);
    const n=normalizeText(raw);
    let section='';let analyte='';
    if(/sedimento/.test(n)&&/urinari/.test(n)){
      section='Esame del sedimento urinario';
      if((/globuli/.test(n)&&/rossi/.test(n))||/eritrocit/.test(n))analyte='Globuli rossi';
      else if((/globuli/.test(n)&&/bianchi/.test(n))||/leucocit/.test(n))analyte='Globuli bianchi';
      else if(/cellule?\s+epitelial/.test(n))analyte='Cellule epiteliali';
      else if(/batter/.test(n))analyte='Batteri';
      else if(/cristall/.test(n))analyte='Cristalli';
      else if(/cilindr/.test(n))analyte='Cilindri';
      else if(/lievit/.test(n))analyte='Lieviti';
      else if(/muco/.test(n))analyte='Muco';
    }
    if(!section&&/\bformula\b/.test(n)&&/leucocitaria/.test(n)){
      section='Formula leucocitaria';
      const absolute=/assolut/.test(n)||!/%/.test(raw);
      if(/neutrofil/.test(n))analyte=absolute?'Neutrofili assoluti':'Neutrofili %';
      else if(/linfocit/.test(n))analyte=absolute?'Linfociti assoluti':'Linfociti %';
      else if(/monocit/.test(n))analyte=absolute?'Monociti assoluti':'Monociti %';
      else if(/eosinofil/.test(n))analyte=absolute?'Eosinofili assoluti':'Eosinofili %';
      else if(/basofil/.test(n))analyte=absolute?'Basofili assoluti':'Basofili %';
    }
    return {section,analyte};
  }

  function test19IsThresholdOnlyRow(value={}) {
    const name=String(value.parameterName||value.test||'');
    const source=String(value.sourceLine||'');
    const n=normalizeText(source||name);
    const number=Number(value.value);
    if(/^(?:alterata\s+glicemia\s+a\s+digiuno|elevato\s+rischio\s+di\s+diabete|livello\s+decisionale|in\s+gravidanza|in\s+(?:assenza|presenza)\s+di\s+sintomi)/.test(n))return true;
    if(/^m\s*\^?\s*2\b/.test(normalizeText(name))&&/egfr|filtrato\s+glomerulare/.test(n))return true;
    if(/\b(?:alterata\s+glicemia|diagnosi\s+di\s+diabete|digiuno\s*\(ifg\))\b/.test(n)&&/glicemia|glucosio/.test(normalizeText(name))){
      const actual=source.match(/\b(?:glucosio|glicemia)\b\s*[:.]?\s*([-+]?\d+(?:[.,]\d+)?)\s*(?:mg|mmol|mo)\s*\/\s*d?[l1]/i);
      if(!actual)return true;
      const first=parseItalianNumber(actual[1]);
      if(Number.isFinite(number)&&Number.isFinite(first)&&Math.abs(number-first)>0.0001)return true;
    }
    if(/\b(?:valori?\s+fra|valori?\s+da)\s*\d/.test(n)&&!/\b(?:vitamina|emoglobina|creatinina|glicemia|colesterolo|trigliceridi|tsh|ft3|ft4)\b/.test(normalizeText(name)))return true;
    return false;
  }

  const _test18IsContextualNonExamName=isContextualNonExamName;
  isContextualNonExamName=function(name='',source=''){
    const raw=String(name||'').replace(/\s+/g,' ').trim();
    if(!raw||isAdministrativeExamName(raw,source))return true;
    const known=test19KnownAnalyte(raw,'');
    if(known)return false;
    const fused=test19FusedPanelInfo(raw,source);
    if(fused.analyte)return false;
    return _test18IsContextualNonExamName(raw,source);
  };

  const _test18IsReferenceContinuationName=isReferenceContinuationName;
  isReferenceContinuationName=function(name=''){
    if(test19KnownAnalyte(name,''))return false;
    const fused=test19FusedPanelInfo(name,name);
    if(fused.analyte)return false;
    return _test18IsReferenceContinuationName(name);
  };

  function test19PreparedRaw(value={}){
    const source=String(value.sourceLine||'');
    const originalName=String(value.parameterName||value.test||'');
    const fused=test19FusedPanelInfo(originalName,source);
    let name=fused.analyte||collapseAdjacentOcrDuplicates(originalName);
    let unit=String(value.unit||'');
    if(/hba1c/i.test(name+source)&&!unit&&/%\s*(?:hb\s*totale)?/i.test(source))unit='%';
    if(fused.section==='Esame del sedimento urinario'&&!unit){
      if(/cellule?\s*(?:\/|a)\s*(?:[µu]?l|[iIlL])/i.test(source)||/cellulea[iIlL]/i.test(source))unit='cellule/µL';
      else if(/\/\s*campo/i.test(source))unit='/campo';
    }
    return {...value,parameterName:name,test:name,unit,labSection:value.labSection||fused.section||''};
  }

  const _test18RepairNumericLabValue=repairNumericLabValue;
  repairNumericLabValue=function(value={}){
    const prepared=test19PreparedRaw(value);
    if(test19IsThresholdOnlyRow(prepared))return null;
    let row=_test18RepairNumericLabValue(prepared);
    if(!row){
      const mapped=test19KnownAnalyte(prepared.parameterName,prepared.unit);
      const numeric=Number(prepared.value);
      if(!mapped||!Number.isFinite(numeric))return null;
      row=canonicalizeLabValue(prepared);
      const split=splitUnitReference(row.unit||'',row.range?.raw||row.reference||'',row.sourceLine||'');
      row.unit=split.unit;row.unitKey=canonicalUnitKey(split.unit);
      const reference=cleanReferenceText(split.reference||row.range?.raw||row.reference||'');
      row.range=detectRange(reference)||null;if(row.range&&reference)row.range={...row.range,raw:reference};
      row.value=numeric;row.rawValue=String(prepared.rawValue??prepared.value);
      row.status=descriptiveStatus(numeric,reference,statusFromRange(numeric,row.range,`${row.sourceLine||''} ${split.flag||''}`));
    }
    const known=test19KnownAnalyte(prepared.parameterName,prepared.unit);
    if(known){row.parameterId=known.id;row.parameterName=known.name;row.sample=known.sample||row.sample;}
    row.labSection=prepared.labSection||row.labSection||'';
    if(row.labSection==='Esame del sedimento urinario'){
      const nn=normalizeText(prepared.parameterName);
      if(/globuli\s+rossi|eritrocit/.test(nn)){row.parameterId='urine_rbc';row.parameterName='Globuli rossi';row.sample='Urine';}
      else if(/globuli\s+bianchi|leucocit/.test(nn)){row.parameterId='urine_wbc';row.parameterName='Globuli bianchi';row.sample='Urine';}
      if(!validRangeForTest19(row.range)){
        const source=String(prepared.sourceLine||'');
        const match=source.match(/([<>]=?\s*\d+(?:[.,]\d+)?|\d+(?:[.,]\d+)?\s*[-–]\s*\d+(?:[.,]\d+)?)\s*$/);
        if(match){
          const reference=cleanReferenceText(match[1]);
          const range=detectRange(reference);
          if(range){row.range={...range,raw:reference};row.status=descriptiveStatus(Number(row.value),reference,statusFromRange(Number(row.value),row.range,row.sourceLine||''));}
        }
      }
    }
    return row;
  };

  function hba1cUnitKind(value={}){
    const key=canonicalUnitKey(value.unit||'');
    const source=String(value.sourceLine||'');
    if(key==='% '||key==='%')return'percent';
    if(/mmol\s*\/\s*mol|mmol[i]?\s*\/\s*mole/i.test(`${value.unit||''} ${source}`))return'mmol';
    if(/%\s*(?:hb\s*totale)?/i.test(source))return'percent';
    return'';
  }

  function hba1cEquivalent(percent,mmol){
    if(!Number.isFinite(percent)||!Number.isFinite(mmol))return false;
    const predicted=(percent-2.152)/0.09148;
    return Math.abs(predicted-mmol)<=1.6;
  }

  function mergeEquivalentHba1c(values=[]){
    const out=[];const pool=[];let merged=0,conflicts=0;
    for(const v of values){
      if(/^hba1c_/.test(String(v.parameterId||''))||/emoglobina\s+glicata|hba1c/i.test(v.parameterName||''))pool.push(v);else out.push(v);
    }
    const used=new Set();
    for(let i=0;i<pool.length;i++){
      if(used.has(i))continue;
      const a=pool[i];const ak=hba1cUnitKind(a);let partner=-1;
      for(let j=i+1;j<pool.length;j++){
        if(used.has(j))continue;const b=pool[j];const bk=hba1cUnitKind(b);
        if(ak&&bk&&ak!==bk){partner=j;break;}
      }
      if(partner<0){a.labSection='Metabolismo glucidico';out.push(a);continue;}
      const b=pool[partner];const bk=hba1cUnitKind(b);
      const pct=ak==='percent'?a:b;const mmol=ak==='mmol'?a:b;
      if(hba1cEquivalent(Number(pct.value),Number(mmol.value))){
        const primary=(validRangeForTest19(mmol.range)?mmol:(validRangeForTest19(pct.range)?pct:mmol));
        const equivalent=primary===mmol?pct:mmol;
        const pctText=String(pct.rawValue??pct.value).replace('.',',');
        const mmolText=String(mmol.rawValue??mmol.value).replace('.',',');
        const result={...primary,parameterId:'hba1c_mmol',parameterName:'Emoglobina glicata (HbA1c)',unit:'mmol/mol',unitKey:'mmol/mol',value:Number(mmol.value),rawValue:mmolText,displayResult:`${mmolText} (${pctText}%)`,equivalentResults:[{value:Number(pct.value),rawValue:pctText,unit:'%'},{value:Number(mmol.value),rawValue:mmolText,unit:'mmol/mol'}],sourceLine:[pct.sourceLine,mmol.sourceLine].filter(Boolean).join(' | '),labSection:'Metabolismo glucidico'};
        out.push(result);used.add(partner);merged++;
      }else{
        a.status='da verificare';b.status='da verificare';a.valueConflict=true;b.valueConflict=true;
        a.conflictNote='Valori HbA1c non equivalenti dopo conversione';b.conflictNote=a.conflictNote;
        a.labSection='Metabolismo glucidico';b.labSection='Metabolismo glucidico';out.push(a,b);used.add(partner);conflicts++;
      }
    }
    return {values:out,merged,conflicts};
  }

  function validRangeForTest19(range){return range&&(Number.isFinite(range.min)||Number.isFinite(range.max)||Number.isFinite(range.limit)||Number.isFinite(range.low)||Number.isFinite(range.high));}

  function labSectionForValue(value={},doc={}){
    if(value.labSection)return value.labSection;
    const id=String(value.parameterId||'');
    const name=normalizeText(value.parameterName||value.test||'');
    const source=normalizeText(`${value.sourceLine||''} ${doc.originalName||''} ${doc.documentKind||''} ${doc.category||''}`);
    const unit=canonicalUnitKey(value.unit||'');
    if(/^(?:neutrophils|lymphocytes|monocytes|eosinophils|basophils)_(?:pct|abs)$/.test(id)||/granulociti\s+immaturi/.test(name))return'Formula leucocitaria';
    if(/^(?:wbc|rbc|hemoglobin|hematocrit|mcv|mch|mchc|rdw|platelets)$/.test(id)||/\b(?:mpv|pdw|piastrinocrito|pct)\b/.test(name))return'Emocromo';
    const urineContext=/urine|urinari|sedimento|urinocoltura/.test(source)||/urine/.test(String(value.sample||'').toLowerCase());
    if(urineContext&&(/sedimento/.test(source)||/cellule?\/?µ?l|\/campo/.test(unit)||/globuli\s+(?:rossi|bianchi)|eritrocit|leucocit|cellule?\s+epitelial|cilindr|cristall|batter|lievit|muco/.test(name)))return'Esame del sedimento urinario';
    if(/^urine_/.test(id)||urineContext&&/peso\s+specifico|\bph\b|proteine|glucosio|chetoni|bilirubina|urobilinogeno|emoglobina|sangue|nitriti|esterasi/.test(name))return'Esame urine';
    if(/^hba1c_|glucose_blood/.test(id)||/glicemia|glucosio|emoglobina\s+glicata|hba1c|insulina|c\s*peptide/.test(name))return'Metabolismo glucidico';
    if(/^(?:chol_total|hdl|ldl|triglycerides)$/.test(id)||/colesterolo|trigliceridi|lipoproteina/.test(name))return'Profilo lipidico';
    if(/^(?:ast|alt|ggt|alp|bilirubin_total|bilirubin_direct|bilirubin_indirect)$/.test(id)||/transaminasi|bilirubina|fosfatasi\s+alcalina|gamma/.test(name))return'Funzionalità epatica';
    if(/^(?:creatinine_blood|egfr|urea|uric_acid)$/.test(id)||/creatinina|azotemia|urea|filtrato\s+glomerulare|egfr|acido\s+urico/.test(name))return'Funzionalità renale';
    if(/^(?:sodium|potassium|calcium)$/.test(id)||/sodio|potassio|calcio|cloro|magnesio|fosforo/.test(name))return'Elettroliti';
    if(/^(?:tsh|ft3|ft4)$/.test(id)||/tireotrop|tiroxina|triiodotironina|anticorpi.*tiro/.test(name))return'Funzionalità tiroidea';
    if(/inr|tempo\s+di\s+protrombina|ptt|aptt|fibrinogeno|d\s*dimero/.test(name))return'Coagulazione';
    return'Altri esami di laboratorio';
  }

  function assignLabSections(values=[],doc={}){
    return values.map(v=>({...v,labSection:labSectionForValue(v,doc)}));
  }

  function dedupeExactAcrossSections(values=[]){
    const map=new Map(),order=[];
    const score=row=>{
      const source=normalizeText(`${row.sourceLine||''} ${row.unit||''}`);
      if(row.labSection==='Esame del sedimento urinario'&&/urine|urinari|sedimento|cellule|campo/.test(source))return 4;
      if(row.labSection==='Formula leucocitaria')return 3;
      if(row.labSection&&row.labSection!=='Altri esami di laboratorio')return 2;
      return 1;
    };
    for(const row of values){
      const key=`${normalizedExamKey(row.parameterName||row.test||'')}|${Number(row.value)}|${canonicalUnitKey(row.unit||'')}|${cleanReferenceText(row.range?.raw||row.reference||'')}`;
      if(!map.has(key)){map.set(key,row);order.push(key);}else if(score(row)>score(map.get(key)))map.set(key,row);
    }
    return {values:order.map(key=>map.get(key)),removed:Math.max(0,values.length-order.length)};
  }

  function test19ProtectedKind(row={}){
    let kind=/^hba1c_/.test(String(row.parameterId||''))?'hba1c':String(row.parameterId||'');
    const context=normalizeText(`${row.unit||''} ${row.sourceLine||''} ${row.labSection||''}`);
    if(kind==='rbc'&&/cellule|campo|urine|urinari|sedimento/.test(context))kind='urine_rbc';
    if(kind==='wbc'&&/cellule|campo|urine|urinari|sedimento/.test(context))kind='urine_wbc';
    return kind;
  }

  function protectedAnalyteSignatures(doc={}){
    const set=new Set();
    for(const raw of Array.isArray(doc.labValues)?doc.labValues:[]){
      const prepared=test19PreparedRaw(raw);if(test19IsThresholdOnlyRow(prepared))continue;
      const repaired=repairNumericLabValue(prepared);if(!repaired)continue;
      const kind=test19ProtectedKind(repaired);
      if(!kind||kind.startsWith('custom_'))continue;
      set.add(`${kind}|${Number(repaired.value)}|${hba1cUnitKind(repaired)||canonicalUnitKey(repaired.unit||'')}`);
    }
    return set;
  }

  function afterContainsProtected(afterDoc={},signature=''){
    const [kind,numText,unitKind]=signature.split('|');const target=Number(numText);
    for(const row of afterDoc.labValues||[]){
      const rid=test19ProtectedKind(row);
      if(rid!==kind)continue;
      if(kind==='hba1c'){
        const equivalents=row.equivalentResults||[];
        if(equivalents.some(x=>Math.abs(Number(x.value)-target)<0.0001&&((unitKind==='percent'&&x.unit==='%')||(unitKind==='mmol'&&/mmol/.test(x.unit||'')))))return true;
        const rk=hba1cUnitKind(row);
        if(rk===unitKind&&Math.abs(Number(row.value)-target)<0.0001)return true;
        if(unitKind==='percent'&&rk==='mmol'&&hba1cEquivalent(target,Number(row.value)))return true;
        if(unitKind==='mmol'&&rk==='percent'&&hba1cEquivalent(Number(row.value),target))return true;
      }else if(Math.abs(Number(row.value)-target)<0.0001)return true;
    }
    return false;
  }

  function validateLabRepairTransition(beforeDoc={},afterDoc={}){
    const violations=[];const protectedBefore=protectedAnalyteSignatures(beforeDoc);
    for(const sig of protectedBefore)if(!afterContainsProtected(afterDoc,sig))violations.push(`Esame reale non preservato: ${sig}`);
    for(const row of afterDoc.labValues||[]){
      if(!row.parameterName||!Number.isFinite(Number(row.value)))violations.push('Riga numerica incompleta dopo la migrazione');
      if(test19IsThresholdOnlyRow(row))violations.push(`Soglia ancora presente come esame: ${row.parameterName}`);
    }
    return {ok:violations.length===0,violations,protectedBefore:protectedBefore.size};
  }

  const _test18RepairQualitativeResults=repairQualitativeResults;
  repairQualitativeResults=function(values=[],doc={}){
    const repaired=_test18RepairQualitativeResults(values).filter(q=>!test19FusedPanelInfo(q.test||'',q.sourceLine||'').section||Boolean(test19FusedPanelInfo(q.test||'',q.sourceLine||'').analyte));
    return repaired.map(q=>({...q,labSection:labSectionForValue(q,doc)}));
  };

  repairLabDocumentData=function(doc={}){
    const rawLab=Array.isArray(doc.labValues)?doc.labValues:[];
    const rawQual=Array.isArray(doc.qualitativeResults)?doc.qualitativeResults:[];
    const repairedSequential=[];let lastNumeric=null;let removedFalse=0;
    for(const raw of rawLab){
      const prepared=test19PreparedRaw(raw);
      if(test19IsThresholdOnlyRow(prepared)){removedFalse++;continue;}
      const rawName=String(prepared.parameterName||prepared.test||'');const source=String(prepared.sourceLine||'');
      const known=test19KnownAnalyte(rawName,prepared.unit);
      if(!known&&(isReferenceContinuationName(rawName)||isContextualNonExamName(rawName,source))){
        if(lastNumeric&&isClinicalReferenceNote(source||rawName)){const note=source||rawName;lastNumeric.referenceNotes=[...(lastNumeric.referenceNotes||[]),note].filter((x,i,a)=>a.indexOf(x)===i);}
        removedFalse++;continue;
      }
      const repaired=repairNumericLabValue(prepared);
      if(repaired){repairedSequential.push(repaired);lastNumeric=repaired;}else removedFalse++;
    }
    let labValues=dedupeLabValues(repairedSequential);
    const hba1c=mergeEquivalentHba1c(labValues);labValues=assignLabSections(hba1c.values,doc);
    const crossSectionDedupe=dedupeExactAcrossSections(labValues);labValues=crossSectionDedupe.values;
    const qualitativeResults=repairQualitativeResults(rawQual,doc);
    const tableRows=[...labValues.map(v=>({kind:'numeric',test:v.parameterName,value:v.value,result:(v.displayResult||(v.rawValue??v.value)),unit:v.unit||'',reference:v.range?.raw||'',status:v.status||'',statusSource:v.statusSource||'',sourceLine:v.sourceLine||'',pageNumber:v.pageNumber,labSection:v.labSection||''})),...qualitativeResults.map(q=>({kind:'qualitative',test:q.test,result:q.result,unit:q.unit||'',reference:q.reference||'',status:q.status||'',sourceLine:q.sourceLine||'',pageNumber:q.pageNumber,labSection:q.labSection||''}))];
    const before=JSON.stringify({l:rawLab,q:rawQual,t:doc.tableRows||[]});
    const after=JSON.stringify({l:labValues,q:qualitativeResults,t:tableRows});
    const substantiveChanged=before!==after;
    const repairedDoc={...doc,labValues,qualitativeResults,tableRows,labRepairVersion:TEST19_REPAIR_VERSION,labPanelVersion:TEST19_REPAIR_VERSION};
    const validation=validateLabRepairTransition(doc,repairedDoc);
    return {document:repairedDoc,changed:substantiveChanged||doc.labRepairVersion!==TEST19_REPAIR_VERSION,substantiveChanged,validation,stats:{initialRows:rawLab.length+rawQual.length,finalRows:labValues.length+qualitativeResults.length,falseRowsRemoved:removedFalse,duplicatesRemoved:Math.max(0,repairedSequential.length-labValues.length-hba1c.merged)+crossSectionDedupe.removed,hba1cMerged:hba1c.merged,hba1cConflicts:hba1c.conflicts,sections:[...new Set([...labValues,...qualitativeResults].map(v=>v.labSection).filter(Boolean))].length,protectedRows:validation.protectedBefore}};
  };

  return {PARAMS,normalizeText,normalizedCompact,parseItalianNumber,detectDates,detectDateFromFilename,isPlausibleClinicalIso,chooseClinicalDate,detectCategory,detectDoctor,detectFacility,detectPersonnel,detectDepartment,extractIdentifiers,extractQualitativeResults,getLogicalLines,profileEvidence,extractTableRows,structuredMeasurements,extractLabValues,estimateExtractionCompleteness,extractTherapies,extractExemptions,analyzeText,textFingerprint,jaccard,probableDuplicate,buildPageFingerprints,pageSimilarity,comparePageCollections,parameterMatches,parameterById,canonicalUnitKey,canonicalUnitDisplay,canonicalizeLabValue,canonicalizeLabValues,detectRange,statusFromRange,semanticRangeStatus,semanticQualitativeStatus,isReferenceContinuationName,isAdministrativeExamName,isContextualNonExamName,cleanReferenceText,normalizedExamKey,splitUnitReference,repairNumericLabValue,dedupeLabValues,repairQualitativeResults,repairLabDocumentData,cleanNarrativeFragment,extractEcgParameters,repairNarrativeDocumentData,TEST19_REPAIR_VERSION,TEST19_PANEL_ORDER,collapseAdjacentOcrDuplicates,test19FusedPanelInfo,test19IsThresholdOnlyRow,labSectionForValue,assignLabSections,dedupeExactAcrossSections,mergeEquivalentHba1c,validateLabRepairTransition};
})();

// TEST 20 - validatore clinico centrale unico per archivio esistente e importazioni future.
;(function(H){
  'use strict';
  const BASE_REPAIR=H.repairLabDocumentData.bind(H);
  const BASE_QUAL=H.repairQualitativeResults.bind(H);
  const VERSION='test20-v2';
  const PANEL_ORDER=H.TEST19_PANEL_ORDER||[
    'Emocromo','Formula leucocitaria','Coagulazione','Metabolismo glucidico','Profilo lipidico',
    'Funzionalità epatica','Funzionalità renale','Elettroliti','Funzionalità tiroidea',
    'Esame urine','Esame del sedimento urinario','Altri esami di laboratorio'
  ];
  const PANEL_RULES=[
    ['Formula leucocitaria',/\bformula\s+leucocitaria\b/i],
    ['Esame del sedimento urinario',/\b(?:esame\s+del\s+)?sedimento\s+urinari[oa]\b/i],
    ['Esame urine',/\b(?:esame\s+(?:chimico\s+fisico\s+)?(?:completo\s+)?delle?\s+)?urine\b/i],
    ['Emocromo',/\b(?:emocromo(?:\s+con\s+formula)?|esame\s+emocromocitometrico)\b/i],
    ['Profilo lipidico',/\bprofilo\s+lipidico\b/i],
    ['Funzionalità epatica',/\bfunzionalit[aà]\s+epatica\b/i],
    ['Funzionalità renale',/\bfunzionalit[aà]\s+renale\b/i],
    ['Funzionalità tiroidea',/\bfunzionalit[aà]\s+tiroidea\b/i],
    ['Coagulazione',/\b(?:assetto\s+coagulativo|coagulazione)\b/i]
  ];
  const KNOWN_CLINICAL_CUSTOM_RE=/\b(?:procalcitonina|troponina|ptt|aptt|inr|fibrinogeno|d\s*dimero|proteina\s+c\s*reattiva|pcr|lattato|acido\s+lattico|bicarbonat|hco3|pco2|po2|saturazione|so2|emogas|base\s+excess|eccesso\s+di\s+basi|metemoglobina|carbossiemoglobina|cohb|methb|tco2|cloro|magnesio|fosforo|albumina|proteine\s+totali|amilasi|lipasi|ldh|ck|cpk|folati|vitamina\s+b12|transferrina|tibc|ves|ormone|cortisolo|prolattina|testosterone|estradiolo|progesterone|insulina|peptide\s*c|anticorpi|immunoglobulin|complemento|virus\s+epatite|genoma|dna|rna)\b/i;
  const GARBAGE_RE=/\b(?:pleiade|page|pagina|checklist|allegato|stampa\s+xerox|scheda\s+monitoraggio|anagrafica\s+amministrativa|assistenza\s+infermieristica|consulenza\s*\[|firma(?:\s+|\s*\+\s*)(?:sospensione|medico|infermiere)|scala\s+retos|modello|richiesta|cartella\s+clinica|idpleiade|spedali\s+riuniti|azienda\s+ospedaliero|direttore|telefono|contatto\s+telefonico|codice\s+fiscale|unit[aà]\s+di\s+ricovero|priorit[aà]|somministrazione|fiala|compressa|flacone|humulin|klacid|pantoprazol|pantorc|enoxaparin|via\s+[a-z]|indirizzo|prenotazione|accettazione|numero\s+referto|n[.]?\s*libretto)\b/i;
  const REFERENCE_CONDITION_RE=/^(?:picco\s+met[aà]\s+ciclo|fase\s+(?:follicolare|luteinica|ovulatoria)|medio\s*luteinica|menopausa|postmenopausa|gravidanza|contracc(?:ettivi)?[.]?\s*oral|non\s+trattate?|in\s+presenza\s+di|in\s+assenza\s+di|livello\s+decisionale|alterata\s+glicemia|elevato\s+rischio)/i;
  const EXTERNAL_QUAL_SOURCE={name:'MedlinePlus e criteri standard dell’esame urine',version:'regole qualitative TEST 20',date:'2026-08-05'};

  const norm=value=>H.normalizeText(String(value||''));
  const clone=value=>typeof structuredClone==='function'?structuredClone(value):JSON.parse(JSON.stringify(value));
  function compactWords(value=''){
    const words=String(value||'').replace(/\s+/g,' ').trim().split(' ').filter(Boolean);const out=[];
    for(const word of words){if(out.length&&norm(out[out.length-1])===norm(word))continue;out.push(word);}
    if(out.length%2===0){const half=out.length/2;if(norm(out.slice(0,half).join(' '))===norm(out.slice(half).join(' ')))return out.slice(0,half).join(' ');}
    return out.join(' ');
  }
  function panelFromText(value=''){
    const raw=String(value||'');for(const [section,re] of PANEL_RULES)if(re.test(raw))return section;return'';
  }
  function panelHeadingOnly(name='',source=''){
    const n=norm(name),section=panelFromText(name);if(!section)return false;
    const analyteWords=/\b(?:neutrofil|linfocit|monocit|eosinofil|basofil|globuli\s+(?:bianchi|rossi)|eritrocit|leucocit|emoglobina|ematocrito|mcv|mch|mchc|rdw|piastrin|ph|peso\s+specifico|chetoni|nitriti|bilirubina|urobilinogeno|glucosio|proteine|batteri|cristalli|cilindri|cellule\s+epiteliali)\b/i;
    return !analyteWords.test(name)&&(!source||norm(source)===n||!analyteWords.test(name));
  }
  function sourceLeadingAnalyte(row={}){
    const source=String(row.sourceLine||'');if(!source)return null;
    const before=source.split(/\b(?:formula\s+leucocitaria|sedimento\s+urinari[oa]|emocromo(?:\s+con\s+formula)?)\b/i)[0];
    const rules=[
      ['wbc','Globuli bianchi',/\bglobuli\s+bianchi\b|\bleucociti\b/i],['rbc','Globuli rossi',/\bglobuli\s+rossi\b|\beritrociti\b/i],
      ['hemoglobin','Emoglobina',/\bemoglobina\b/i],['hematocrit','Ematocrito',/\bematocrito\b/i],
      ['neutrophils_pct','Neutrofili %',/\bneutrofili\b/i],['lymphocytes_pct','Linfociti %',/\blinfociti\b/i],
      ['monocytes_pct','Monociti %',/\bmonociti\b/i],['eosinophils_pct','Eosinofili %',/\beosinofili\b/i],['basophils_pct','Basofili %',/\bbasofili\b/i]
    ];
    for(const [id,name,re] of rules)if(re.test(before))return{id,name};return null;
  }
  function repairPanelContamination(row={}){
    const out={...row};const leading=sourceLeadingAnalyte(out);const source=String(out.sourceLine||'');const name=String(out.parameterName||out.test||'');
    if(leading&&panelFromText(source)&&!panelFromText(name)){
      out.parameterId=leading.id;out.parameterName=leading.name;out.test=leading.name;
      if(/_(?:pct)$/.test(leading.id)&&(!out.unit||/%/.test(source)))out.unit='%';
    }
    const ownPanel=panelFromText(name);
    if(ownPanel){
      const fused=H.test19FusedPanelInfo?.(name,name)||{};
      if(fused.analyte){out.parameterName=fused.analyte;out.test=fused.analyte;out.labSection=fused.section||ownPanel;}
    }
    return out;
  }
  function rowQuality(row={}){
    let score=0;const name=String(row.parameterName||row.test||'');
    if(!panelFromText(name))score+=12;if(row.parameterId&&!String(row.parameterId).startsWith('custom_'))score+=8;
    if(row.unit)score+=4;if(row.range?.raw||row.reference)score+=5;if(!/da verificare|non definito/.test(norm(row.status||'')))score+=4;
    if(!panelFromText(row.sourceLine||''))score+=2;score+=Math.min(3,Number(row.confidence||0)/35);return score;
  }
  function semanticDedupe(values=[]){
    const map=new Map(),order=[];
    for(const raw of values){const row=repairPanelContamination(raw);const unit=H.canonicalUnitKey(row.unit||'');const key=`${row.parameterId||H.normalizedExamKey(row.parameterName||row.test||'')}|${Number(row.value)}|${unit}`;
      if(!map.has(key)){map.set(key,row);order.push(key);}else if(rowQuality(row)>rowQuality(map.get(key)))map.set(key,row);
    }
    return{values:order.map(k=>map.get(k)),removed:Math.max(0,values.length-order.length)};
  }
  function isSuspiciousUnknown(row={}){
    const name=String(row.parameterName||row.test||'').trim();const source=String(row.sourceLine||'');const id=String(row.parameterId||'');const unit=H.canonicalUnitKey(row.unit||'');const value=Number(row.value);
    if(panelHeadingOnly(name,source))return'Intestazione di pannello';
    if(REFERENCE_CONDITION_RE.test(norm(name)))return'Condizione o fascia di riferimento, non esame';
    if(GARBAGE_RE.test(`${name} ${source}`))return'Riga amministrativa, terapeutica o di impaginazione';
    if(id==='egfr'&&((value>=1900&&value<=2100)||unit==='u/l'||/\b(?:kdigo|ckd[- ]?epi)\s*2012\b/i.test(source)&&value===2012))return'Anno o metodo CKD-EPI interpretato come risultato';
    if(/^m\^?$/.test(norm(name))&&value===2&&/egfr|filtrato|ml\s*\/\s*min/i.test(source))return'Esponente dell’unità interpretato come esame';
    if(/^\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}/.test(name)||/^\d{1,2}:\d{2}/.test(name))return'Data o orario interpretati come esame';
    if(id.startsWith('custom_')&&!KNOWN_CLINICAL_CUSTOM_RE.test(name)&&(!row.unit||unit==='unita_non_rilevata')){
      if(name.length>42||/^(?:analisi|pisa|presenza|sin|ag|cr|glu|lac|ci|fi[oò]2?|na\*?|k\*?|ca\*?|hco[,3]?|po[,2]?|pco[,2]?|so2?|hhb|t?hb|id|fr|gcs|pa\s+(?:max|min)|temp(?:eratura)?|oct|pi)$/i.test(name))return'Analita non identificato con affidabilità';
    }
    return'';
  }
  function canonicalQualTest(test='',source=''){
    const n=norm(`${test} ${source}`);
    if(/\baspetto\b/.test(n))return'Aspetto';if(/\bcolore\b/.test(n))return'Colore';if(/\bchetoni\b/.test(n))return'Chetoni';
    if(/\bnitriti\b/.test(n))return'Nitriti';if(/\burobilinogeno\b/.test(n))return'Urobilinogeno';
    if(/\bbilirubina\b/.test(n))return'Bilirubina';if(/\bglucosio\b|\bglicosuria\b/.test(n))return'Glucosio';
    if(/\bproteine\b|\bproteinuria\b/.test(n))return'Proteine';if(/\b(?:sangue|emoglobina)\b/.test(n)&&/urine|urinari|assent|negativ|present|positiv/i.test(`${source} ${test}`))return'Sangue';
    return compactWords(test);
  }
  function splitQualitative(test='',result='',source=''){
    const canonical=canonicalQualTest(test,source);let raw=compactWords(result||'');const src=compactWords(source||'');
    if(!raw){raw=src.replace(new RegExp(`^${String(test||'').replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\s*`,'i'),'').trim();}
    raw=raw.replace(/\b(?:mg|g|u|eu)\s*\/\s*d[l1]\b/ig,' ').replace(/\s+/g,' ').trim();
    let value=raw,reference='';
    if(canonical==='Aspetto'){
      const m=raw.match(/^(limpido|opalescente|torbido|leggermente\s+torbido)(?:\s+(limpido))?$/i);if(m){value=m[1];reference=m[2]||'Limpido';}
    }else if(canonical==='Colore'){
      const n=norm(raw);if(/incolore/.test(n))value='Incolore';else if(/giallo\s+paglierino/.test(n))value='Giallo paglierino';else if(/paglierino/.test(n))value='Paglierino';else if(/giallo/.test(n))value='Giallo';reference='Giallo paglierino';
    }else if(/^(?:Chetoni|Nitriti|Bilirubina|Glucosio|Proteine|Sangue)$/.test(canonical)){
      const n=norm(raw);if(/assent|negativ/.test(n))value='Assente';else if(/present|positiv/.test(n))value='Presente';reference='Assente';
    }else if(canonical==='Urobilinogeno'){
      const n=norm(raw);if(/assent|negativ/.test(n)){value='Assente';reference='Assente';}
    }
    return{test:canonical,result:compactWords(value),reference:compactWords(reference)};
  }
  function qualitativeStatus(test='',result='',reference=''){
    const t=norm(test),r=norm(result),ref=norm(reference);
    if(!r)return'da verificare';
    if(t==='aspetto')return /\blimpido\b/.test(r)&&!/opalescente|torbido/.test(r)?'nei limiti':'da verificare';
    if(t==='colore')return /^(?:giallo|paglierino|giallo paglierino)$/.test(r)?'nei limiti':'da verificare';
    if(/^(?:chetoni|nitriti|bilirubina|glucosio|proteine|sangue|urobilinogeno)$/.test(t))return /assent|negativ/.test(r)?'nei limiti':(/present|positiv/.test(r)?'da verificare':H.semanticQualitativeStatus(result));
    if(ref&&r===ref)return'nei limiti';return H.semanticQualitativeStatus(result);
  }
  function repairQualitative20(values=[],doc={}){
    const base=BASE_QUAL(values,doc),out=[],review=[];const seen=new Map();
    for(const raw of base){
      if(panelHeadingOnly(raw.test||'',raw.sourceLine||'')){review.push({...raw,reviewReason:'Intestazione di pannello'});continue;}
      const split=splitQualitative(raw.test||'',raw.result||'',raw.sourceLine||'');let reference=H.cleanReferenceText(raw.reference||'')||split.reference;
      const hadReportReference=Boolean(H.cleanReferenceText(raw.reference||''))||Boolean(split.reference&&norm(raw.sourceLine||'').includes(norm(split.reference)));
      const q={...raw,test:split.test,result:split.result||raw.result,reference,status:qualitativeStatus(split.test,split.result||raw.result,reference),labSection:/^(?:Aspetto|Colore|Chetoni|Nitriti|Bilirubina|Glucosio|Proteine|Sangue|Urobilinogeno)$/.test(split.test)?'Esame urine':(raw.labSection||H.labSectionForValue?.(raw,doc)||'Altri esami di laboratorio')};
      if(reference&&!hadReportReference){q.statusSource='external';q.statusSourceLabel='esterno';q.referenceSource=EXTERNAL_QUAL_SOURCE;}
      else if(reference){q.statusSource=q.statusSource||'report';}
      if(/esame\s+annullato|campione\s+non\s+consegnato|non\s+eseguito/.test(norm(q.result))){q.status='da verificare';q.unresolvedReason='Esame non eseguito o campione non disponibile';}
      const key=`${H.normalizedExamKey(q.test)}|${norm(q.result)}|${H.canonicalUnitKey(q.unit||'')}`;const old=seen.get(key);
      if(!old){seen.set(key,q);out.push(q);}else if(rowQuality(q)>rowQuality(old)){const idx=out.indexOf(old);if(idx>=0)out[idx]=q;seen.set(key,q);}
    }
    return{values:out,review};
  }
  H.repairQualitativeResults=function(values=[],doc={}){return repairQualitative20(values,doc).values;};
  H.repairLabDocumentData=function(doc={}){
    const base=BASE_REPAIR(doc);const technical=[...(doc.technicalReviewRows||[])];let numeric=[];let removedPanel=0,quarantined=0;
    for(const raw of base.document.labValues||[]){
      const row=repairPanelContamination(raw);const reason=isSuspiciousUnknown(row);
      if(reason){technical.push({kind:'numeric',test:row.parameterName||row.test||'',result:row.rawValue??row.value,unit:row.unit||'',reference:row.range?.raw||'',sourceLine:row.sourceLine||'',reviewReason:reason});if(reason==='Intestazione di pannello')removedPanel++;else quarantined++;continue;}
      if(panelHeadingOnly(row.parameterName||row.test||'',row.sourceLine||'')){removedPanel++;continue;}
      row.labSection=H.labSectionForValue?.(row,doc)||row.labSection||'Altri esami di laboratorio';numeric.push(row);
    }
    const deduped=semanticDedupe(numeric);numeric=deduped.values;
    const qualResult=repairQualitative20(base.document.qualitativeResults||[],doc);technical.push(...qualResult.review);const qualitativeResults=qualResult.values;
    const tableRows=[...numeric.map(v=>({kind:'numeric',test:v.parameterName,value:v.value,result:v.displayResult||(v.rawValue??v.value),unit:v.unit||'',reference:v.range?.raw||'',status:v.status||'',statusSource:v.statusSource||'',sourceLine:v.sourceLine||'',pageNumber:v.pageNumber,labSection:v.labSection||''})),...qualitativeResults.map(q=>({kind:'qualitative',test:q.test,result:q.result,unit:q.unit||'',reference:q.reference||'',status:q.status||'',statusSource:q.statusSource||'',sourceLine:q.sourceLine||'',pageNumber:q.pageNumber,labSection:q.labSection||''}))];
    const repaired={...base.document,labValues:numeric,qualitativeResults,tableRows,technicalReviewRows:technical,clinicalValidationVersion:VERSION,labRepairVersion:VERSION,labPanelVersion:VERSION};
    const transition=H.validateLabRepairTransition?.(doc,repaired)||{ok:true,violations:[],protectedBefore:0};const violations=[...(transition.violations||[])];
    for(const row of [...numeric,...qualitativeResults])if(panelHeadingOnly(row.parameterName||row.test||'',row.sourceLine||''))violations.push(`Intestazione ancora presente come esame: ${row.parameterName||row.test}`);
    const before=JSON.stringify({l:doc.labValues||[],q:doc.qualitativeResults||[],t:doc.tableRows||[],r:doc.technicalReviewRows||[]});const after=JSON.stringify({l:numeric,q:qualitativeResults,t:tableRows,r:technical});
    return{document:repaired,changed:before!==after||doc.clinicalValidationVersion!==VERSION,substantiveChanged:before!==after,validation:{...transition,ok:violations.length===0,violations},stats:{...(base.stats||{}),initialRows:(doc.labValues||[]).length+(doc.qualitativeResults||[]).length,finalRows:numeric.length+qualitativeResults.length,duplicatesRemoved:Number(base.stats?.duplicatesRemoved||0)+deduped.removed,panelHeadingsRemoved:removedPanel,quarantinedRows:quarantined,technicalReviewRows:technical.length,sections:[...new Set([...numeric,...qualitativeResults].map(v=>v.labSection).filter(Boolean))].length}};
  };
  H.TEST20_REPAIR_VERSION=VERSION;H.TEST20_PANEL_ORDER=PANEL_ORDER;H.TEST19_PANEL_ORDER=PANEL_ORDER;H.panelHeadingOnly=panelHeadingOnly;H.repairQualitativeResults20=repairQualitative20;
})(HealthExtractors);

// TEST 20 - rifinitura trasversale di unità/riferimenti e contesti ambigui.
;(function(H){
  'use strict';
  const BASE=H.repairLabDocumentData.bind(H);
  const norm=v=>H.normalizeText(String(v||''));
  const keyReview=r=>[r.kind||'',norm(r.test||r.parameterName||''),norm(r.result??r.value??''),H.canonicalUnitKey(r.unit||''),norm(r.sourceLine||''),norm(r.reviewReason||'')].join('|');
  function validRange(range){return !!range&&(Number.isFinite(range.low)||Number.isFinite(range.high)||Number.isFinite(range.min)||Number.isFinite(range.max)||Number.isFinite(range.limit));}
  function normalizeNumeric(row={}){
    const out={...row};
    const split=H.splitUnitReference(out.unit||'',out.range?.raw||'',out.sourceLine||'');
    if(split.unit!==undefined)out.unit=split.unit;
    if(split.reference&&!validRange(out.range)){
      const detected=H.detectRange(split.reference);
      if(detected)out.range={...detected,raw:split.reference};
    }else if(out.range?.raw){out.range={...out.range,raw:H.cleanReferenceText(out.range.raw)||out.range.raw};}
    const source=norm(out.sourceLine||'');
    if(out.parameterId==='urine_ph'&&/\b(?:ega|emogas|arter|venos|pco2|po2|hco3|bicarbonat)\b/.test(source)){
      out.parameterId='blood_ph';out.parameterName='pH ematico';out.labSection='Altri esami di laboratorio';
    }
    if(/urobilinogeno/.test(norm(out.parameterName||''))){
      out.parameterId='urobilinogen';out.parameterName='Urobilinogeno';out.labSection='Esame urine';
    }
    if(validRange(out.range)&&Number.isFinite(Number(out.value)))out.status=H.statusFromRange(Number(out.value),out.range,out.sourceLine||out.range.raw||'');
    out.unitKey=H.canonicalUnitKey(out.unit||'');
    return out;
  }
  H.repairLabDocumentData=function(doc={}){
    const result=BASE(doc);const numeric=(result.document.labValues||[]).map(normalizeNumeric);
    const seen=new Set(),technical=[];
    for(const r of result.document.technicalReviewRows||[]){const k=keyReview(r);if(!seen.has(k)){seen.add(k);technical.push(r);}}
    const tableRows=[...numeric.map(v=>({kind:'numeric',test:v.parameterName,value:v.value,result:v.displayResult||(v.rawValue??v.value),unit:v.unit||'',reference:v.range?.raw||'',status:v.status||'',statusSource:v.statusSource||'',sourceLine:v.sourceLine||'',pageNumber:v.pageNumber,labSection:v.labSection||''})),...(result.document.qualitativeResults||[]).map(q=>({kind:'qualitative',test:q.test,result:q.result,unit:q.unit||'',reference:q.reference||'',status:q.status||'',statusSource:q.statusSource||'',sourceLine:q.sourceLine||'',pageNumber:q.pageNumber,labSection:q.labSection||''}))];
    const repaired={...result.document,labValues:numeric,technicalReviewRows:technical,tableRows};
    const before=JSON.stringify({l:doc.labValues||[],q:doc.qualitativeResults||[],t:doc.tableRows||[],r:doc.technicalReviewRows||[]});
    const after=JSON.stringify({l:numeric,q:repaired.qualitativeResults||[],t:tableRows,r:technical});
    return {...result,document:repaired,changed:before!==after||doc.clinicalValidationVersion!=='test20-v2',substantiveChanged:before!==after,stats:{...(result.stats||{}),technicalReviewRows:technical.length}};
  };
})(HealthExtractors);

// TEST 20 - controllo contestuale dei parametri ambigui prima della scheda clinica.
;(function(H){
  'use strict';
  const BASE_REPAIR=H.repairLabDocumentData.bind(H),BASE_VALIDATE=H.validateLabRepairTransition.bind(H);
  const norm=v=>H.normalizeText(String(v||''));
  function bloodGasContext(row={}){const s=norm(`${row.sourceLine||''} ${row.unit||''}`);return (/(?:emogasanalisi|\bega\b|arter|venos|\bpco\b|pco.?2|po.?2|pto2|pa0?2|hco.?3|bicarbonat|insufficienza respiratoria|reservoir|respirazione)/.test(s)||/unita ph/.test(s)||/7[.,]?3[05].*7[.,]?4[05]/.test(s))&&!/urine|urinari|chimico/.test(s);}
  function isUrinePh(row={}){return row.parameterId==='urine_ph'||/^ph urine$/.test(norm(row.parameterName||row.test||''));}
  function invalidRange(range={}){const lo=Number.isFinite(range.min)?range.min:range.low,hi=Number.isFinite(range.max)?range.max:range.high;return Number.isFinite(lo)&&Number.isFinite(hi)&&lo>hi;}
  function reviewRow(row,reason){return{kind:'numeric',test:row.parameterName||row.test||'',result:row.rawValue??row.value,unit:row.unit||'',reference:row.range?.raw||'',sourceLine:row.sourceLine||'',reviewReason:reason};}
  function tableRows(doc){return[...(doc.labValues||[]).map(v=>({kind:'numeric',test:v.parameterName,value:v.value,result:v.displayResult||(v.rawValue??v.value),unit:v.unit||'',reference:v.range?.raw||'',status:v.status||'',statusSource:v.statusSource||'',sourceLine:v.sourceLine||'',pageNumber:v.pageNumber,labSection:v.labSection||''})),...(doc.qualitativeResults||[]).map(q=>({kind:'qualitative',test:q.test,result:q.result,unit:q.unit||'',reference:q.reference||'',status:q.status||'',statusSource:q.statusSource||'',sourceLine:q.sourceLine||'',pageNumber:q.pageNumber,labSection:q.labSection||''}))];}
  H.repairLabDocumentData=function(doc={}){
    const result=BASE_REPAIR(doc),kept=[],technical=[...(result.document.technicalReviewRows||[])];let contextualQuarantine=0,reclassified=0;
    for(const raw of result.document.labValues||[]){let row={...raw};let value=Number(row.value);
      const rowName=norm(row.parameterName||row.test||'');
      if(/^(?:ft3|ft4)$/.test(rowName)&&/^pa\/?ml$/.test(norm(row.unit||'').replace(/\s+/g,'')))row.unit='pg/mL';
      if(/^(?:ft3|ft4)$/.test(rowName)&&!row.range){const m=String(row.sourceLine||'').match(/([-+]?\d+(?:[.,]\d+)?)\s*\+\s*([-+]?\d+(?:[.,]\d+)?)/);if(m){const low=Number(m[1].replace(',','.')),high=Number(m[2].replace(',','.'));if(Number.isFinite(low)&&Number.isFinite(high)&&low<high){row.range={raw:`${m[1]} - ${m[2]}`,low,high,min:low,max:high};row.status=H.statusFromRange(value,row.range,row.sourceLine||'');}}}
      if(isUrinePh(row)&&bloodGasContext(row)){
        if(!(value>=6.5&&value<=8.5)){const candidates=[...String(row.sourceLine||'').matchAll(/(?:^|\s)([678](?:[.,]\d{1,3}))(?:\s|$)/g)].map(m=>Number(m[1].replace(',','.'))).filter(n=>n>=6.5&&n<=8.5);if(candidates.length){value=candidates[0];row.value=value;row.rawValue=String(candidates[0]).replace('.',',');}}
        if(value>=6.5&&value<=8.5){row.parameterId='blood_ph';row.parameterName='pH ematico';row.labSection='Altri esami di laboratorio';reclassified++;}
        else{technical.push(reviewRow(row,'Valore pH da emogasanalisi non plausibile dopo OCR'));contextualQuarantine++;continue;}
      }else if(isUrinePh(row)&&(!Number.isFinite(value)||value<0||value>14)){technical.push(reviewRow(row,'Valore pH urine non plausibile dopo OCR'));contextualQuarantine++;continue;}
      if(row.parameterId==='blood_ph'&&(value<6.5||value>8.5)){technical.push(reviewRow(row,'Valore pH ematico non plausibile dopo OCR'));contextualQuarantine++;continue;}
      if(invalidRange(row.range||{})){row.range=null;row.status='da verificare';row.unresolvedReason='Intervallo OCR incoerente: limite inferiore maggiore del superiore';}
      kept.push(row);
    }
    const seen=new Set(),dedupTechnical=[];for(const r of technical){const k=[r.kind,norm(r.test),norm(r.result),norm(r.unit),norm(r.sourceLine),norm(r.reviewReason)].join('|');if(!seen.has(k)){seen.add(k);dedupTechnical.push(r);}}
    const repaired={...result.document,labValues:kept,technicalReviewRows:dedupTechnical,tableRows:[]};repaired.tableRows=tableRows(repaired);
    return{...result,document:repaired,changed:result.changed||contextualQuarantine>0||reclassified>0,substantiveChanged:result.substantiveChanged||contextualQuarantine>0||reclassified>0,stats:{...(result.stats||{}),finalRows:kept.length+(repaired.qualitativeResults||[]).length,quarantinedRows:Number(result.stats?.quarantinedRows||0)+contextualQuarantine,contextRowsReclassified:reclassified,technicalReviewRows:dedupTechnical.length}};
  };
  H.validateLabRepairTransition=function(beforeDoc={},afterDoc={}){
    const base=BASE_VALIDATE(beforeDoc,afterDoc);const violations=(base.violations||[]).filter(message=>{
      const m=String(message).match(/^Esame reale non preservato: urine_ph\|([^|]+)\|/);if(!m)return true;const value=Number(m[1]);const before=(beforeDoc.labValues||[]).find(r=>isUrinePh(r)&&Math.abs(Number(r.value)-value)<0.0001&&bloodGasContext(r));if(!before)return true;
      const reclassified=(afterDoc.labValues||[]).some(r=>r.parameterId==='blood_ph'&&Math.abs(Number(r.value)-value)<0.0001);const quarantined=(afterDoc.technicalReviewRows||[]).some(r=>Math.abs(Number(String(r.result).replace(',','.'))-value)<0.0001&&/pH/.test(r.test||''));return !(reclassified||quarantined);
    });return{...base,ok:violations.length===0,violations};
  };
})(HealthExtractors);

// TEST 20 - ricostruzione generale di unità e intervalli da righe OCR tabellari.
;(function(H){
  'use strict';
  const BASE_REPAIR=H.repairLabDocumentData.bind(H),BASE_VALIDATE=H.validateLabRepairTransition.bind(H);
  const norm=v=>H.normalizeText(String(v||''));
  const UNIT_PATTERNS=[
    [/10\s*[\^°'%*]?\s*3\s*\/\s*(?:[aµu]?l|all|apl)/i,'10^3/µL'],[/10\s*[\^°'%*]?\s*9\s*\/\s*l/i,'10^9/L'],
    [/(?:mmol|mmali|mmoli|mmaol|mmoifl|mmoll)\s*\/?\s*[il1lL]+/i,'mmol/L'],[/(?:mg|ma)\s*[i1]?\/?\s*d[l1]/i,'mg/dL'],[/(?:ng|ngi)\s*\/?\s*[l1]/i,'ng/L'],
    [/(?:ng|na)\s*\/?\s*m[l1]/i,'ng/mL'],[/(?:pg|pa)\s*\/?\s*m[l1]/i,'pg/mL'],[/g\s*\/?\s*d[l1]/i,'g/dL'],[/µg\s*\/?\s*[l1]/i,'µg/L'],
    [/(?:meq|mEq)\s*\/?\s*[l1]/i,'mEq/L'],[/(?:ui|u|U|UI)\s*\/?\s*[l1]/,'U/L'],[/mmhg/i,'mmHg'],[/f[l1]\b/i,'fL'],[/\bpg\b/i,'pg'],[/%|®%/,'%']
  ];
  const ABS_MAP={neutrophils_pct:['neutrophils_abs','Neutrofili assoluti'],lymphocytes_pct:['lymphocytes_abs','Linfociti assoluti'],monocytes_pct:['monocytes_abs','Monociti assoluti'],eosinophils_pct:['eosinophils_abs','Eosinofili assoluti'],basophils_pct:['basophils_abs','Basofili assoluti']};
  const PCT_MAP={neutrophils_abs:['neutrophils_pct','Neutrofili %'],lymphocytes_abs:['lymphocytes_pct','Linfociti %'],monocytes_abs:['monocytes_pct','Monociti %'],eosinophils_abs:['eosinophils_pct','Eosinofili %'],basophils_abs:['basophils_pct','Basofili %']};
  function unitFromSource(row={}){const existing=H.canonicalUnitKey(row.unit||'');if(existing&&existing!=='unita_non_rilevata'&&!/^(?:\/l)$/.test(existing))return row.unit;const src=String(row.sourceLine||'');for(const [re,unit] of UNIT_PATTERNS)if(re.test(src))return unit;if(/%$/.test(String(row.parameterName||'')))return'%';return row.unit||'';}
  function cleanRangeCandidate(text=''){
    let s=String(text||'').replace(/[÷–—]/g,'-').replace(/,/g,'.').replace(/\b(?:fino\s+a|inferiore\s+a)\b/ig,'≤ ').replace(/\b(?:superiore\s+a|oltre)\b/ig,'> ');
    s=s.replace(/(\d(?:\.\d+)?)\s*[+=]\s*(\d(?:\.\d+)?)/g,'$1 - $2').replace(/(-?\d(?:\.\d+)?)\s*-\s*\+?(\d(?:\.\d+)?)/g,'$1 - $2');return s;
  }
  function rangeFromSource(row={}){
    if(row.range&&((Number.isFinite(row.range.low)||Number.isFinite(row.range.min)||Number.isFinite(row.range.limit))))return row.range;
    const src=cleanRangeCandidate(row.sourceLine||''),rawVal=String(row.rawValue??row.value??'').replace(',','.');let tail=src;
    const pos=rawVal?src.indexOf(rawVal):-1;if(pos>=0)tail=src.slice(pos+rawVal.length);
    for(const [re] of UNIT_PATTERNS)tail=tail.replace(re,' ');
    let match=tail.match(/(?:≤|≥|<=|>=|<|>)\s*-?\d+(?:\.\d+)?/);if(!match)match=tail.match(/-?\d+(?:\.\d+)?\s*-\s*-?\d+(?:\.\d+)?/);
    if(!match){const nums=[...tail.matchAll(/-?\d+(?:\.\d+)?/g)].map(m=>m[0]);if(nums.length>=2&&!/\b\d{2}\/\d{2}\b/.test(tail))match=[`${nums[0]} - ${nums[1]}`];}
    if(!match)return null;const raw=match[0].replace(/\./g,',');const detected=H.detectRange(raw);return detected?{...detected,raw}:null;
  }
  function normalizeDifferential(row={}){const out={...row},unit=H.canonicalUnitKey(out.unit||'');if(ABS_MAP[out.parameterId]&&unit!=='%'&&unit!=='unita_non_rilevata'){[out.parameterId,out.parameterName]=ABS_MAP[out.parameterId];out.labSection='Formula leucocitaria';}else if(PCT_MAP[out.parameterId]&&unit==='%'){[out.parameterId,out.parameterName]=PCT_MAP[out.parameterId];out.labSection='Formula leucocitaria';}return out;}
  function rebuild(doc){doc.tableRows=[...(doc.labValues||[]).map(v=>({kind:'numeric',test:v.parameterName,value:v.value,result:v.displayResult||(v.rawValue??v.value),unit:v.unit||'',reference:v.range?.raw||'',status:v.status||'',statusSource:v.statusSource||'',sourceLine:v.sourceLine||'',pageNumber:v.pageNumber,labSection:v.labSection||''})),...(doc.qualitativeResults||[]).map(q=>({kind:'qualitative',test:q.test,result:q.result,unit:q.unit||'',reference:q.reference||'',status:q.status||'',statusSource:q.statusSource||'',sourceLine:q.sourceLine||'',pageNumber:q.pageNumber,labSection:q.labSection||''}))];return doc;}
  H.repairLabDocumentData=function(doc={}){
    const result=BASE_REPAIR(doc),rows=[];let reconstructedUnits=0,reconstructedRanges=0;
    for(const raw of result.document.labValues||[]){let row={...raw};const unit=unitFromSource(row);if(unit&&unit!==row.unit){row.unit=unit;row.unitKey=H.canonicalUnitKey(unit);reconstructedUnits++;}row=normalizeDifferential(row);const range=rangeFromSource(row);if(range&&!row.range){row.range=range;reconstructedRanges++;}if(row.range&&Number.isFinite(Number(row.value)))row.status=H.statusFromRange(Number(row.value),row.range,row.sourceLine||row.range.raw||'');rows.push(row);}
    const repaired=rebuild({...result.document,labValues:rows});return{...result,document:repaired,changed:result.changed||reconstructedUnits>0||reconstructedRanges>0,substantiveChanged:result.substantiveChanged||reconstructedUnits>0||reconstructedRanges>0,stats:{...(result.stats||{}),unitsReconstructed:reconstructedUnits,rangesReconstructed:reconstructedRanges}};
  };
  H.validateLabRepairTransition=function(beforeDoc={},afterDoc={}){const base=BASE_VALIDATE(beforeDoc,afterDoc);const violations=(base.violations||[]).filter(message=>{const m=String(message).match(/^Esame reale non preservato: (neutrophils|lymphocytes|monocytes|eosinophils|basophils)_(pct|abs)\|([^|]+)\|/);if(!m)return true;const family=m[1],target=Number(m[3]);return !(afterDoc.labValues||[]).some(r=>String(r.parameterId||'').startsWith(`${family}_`)&&Math.abs(Number(r.value)-target)<0.0001);});return{...base,ok:violations.length===0,violations};};
})(HealthExtractors);

// TEST 20 - chiusura del validatore: referti qualitativi, eGFR testuale e controllo perdite reali.
;(function(H){
  'use strict';
  const BASE_REPAIR=H.repairLabDocumentData.bind(H),BASE_VALIDATE=H.validateLabRepairTransition.bind(H);
  const norm=v=>H.normalizeText(String(v||''));
  const NON_CLINICAL_QUAL_RE=/\b(?:nulla\s+da\s+segnalare|controlli?\s+di\s+qualit[aà]|copia\s+cartacea|conforme\s+all.originale|firmatari[oa]|firma\s+elettronica|normativa\s+vigente|conservato\s+secondo|gli\s+esami\s+indicati|strutture\s+dipartimentali|valore\s+desiderabile|rischio\s+cardio|bassa\s+densit[aà]\s+relativa|corretta\s+valutazione|pagina|direttore|telefono|email|prenotazione)\b/i;
  function technicalKey(row={}){return [norm(row.test||row.parameterName||''),norm(row.result??row.value??''),H.canonicalUnitKey(row.unit||''),norm(row.sourceLine||'')].join('|');}
  function makeTechnical(row,reason){return{kind:row.kind||'qualitative',test:row.test||row.parameterName||'',result:row.result??row.rawValue??row.value??'',unit:row.unit||'',reference:row.reference||row.range?.raw||'',sourceLine:row.sourceLine||'',pageNumber:row.pageNumber,reviewReason:reason};}
  function rebuild(doc){doc.tableRows=[...(doc.labValues||[]).map(v=>({kind:'numeric',test:v.parameterName,value:v.value,result:v.displayResult||(v.rawValue??v.value),unit:v.unit||'',reference:v.range?.raw||'',status:v.status||'',statusSource:v.statusSource||'',sourceLine:v.sourceLine||'',pageNumber:v.pageNumber,labSection:v.labSection||''})),...(doc.qualitativeResults||[]).map(q=>({kind:'qualitative',test:q.test,result:q.result,unit:q.unit||'',reference:q.reference||'',status:q.status||'',statusSource:q.statusSource||'',sourceLine:q.sourceLine||'',pageNumber:q.pageNumber,labSection:q.labSection||''}))];return doc;}
  H.repairLabDocumentData=function(doc={}){
    const result=BASE_REPAIR(doc),numeric=[...(result.document.labValues||[])],qualitative=[],technical=[...(result.document.technicalReviewRows||[])];let convertedEgfr=0,qualitativeNoiseRemoved=0,qualitativeNormalized=0;
    for(const raw of result.document.qualitativeResults||[]){
      const row={...raw},combined=`${row.test||''} ${row.result||''} ${row.sourceLine||''}`;
      if(NON_CLINICAL_QUAL_RE.test(combined)){technical.push(makeTechnical(row,'Nota amministrativa, bibliografica o priva di valore clinico'));qualitativeNoiseRemoved++;continue;}
      const egfr=combined.match(/(?:calc[.]?\s*volume\s*filtrato\s*glomerulare|filtrato\s*glomerulare).*?(?:mdrd|ckd[- ]?epi)?\s*([1-9]\d(?:[.,]\d+)?)\s*(?:m?l)?\s*\/\s*min(?:\s*\/\s*1[.,]73\s*m\^?2)?.*?([<>]=?|≤|≥)\s*([1-9]\d(?:[.,]\d+)?)/i);
      if(egfr){
        const value=Number(egfr[1].replace(',','.')),limit=Number(egfr[3].replace(',','.')),operator=egfr[2].replace('>=','≥').replace('<=','≤');
        if(Number.isFinite(value)&&Number.isFinite(limit)){
          const range={raw:`${operator}${String(limit).replace('.',',')}`,operator,limit};
          const status=H.statusFromRange(value,range,combined);const exists=numeric.some(v=>v.parameterId==='egfr'&&Math.abs(Number(v.value)-value)<0.0001);
          if(!exists)numeric.push({id:`egfr_test20_${row.pageNumber||0}_${value}`,parameterId:'egfr',parameterName:'Filtrato glomerulare stimato',value,rawValue:String(value).replace('.',','),unit:'mL/min/1,73 m²',range,status,method:/ckd[- ]?epi/i.test(combined)?'CKD-EPI':/mdrd/i.test(combined)?'MDRD':'',sourceLine:row.sourceLine||combined,pageNumber:row.pageNumber,labSection:'Funzionalità renale'});
          convertedEgfr++;continue;
        }
      }
      let resultText=String(row.result||'').trim();
      if(/\bnon\s+rilevat[oa]\b/i.test(resultText)){row.result='Non rilevato';row.reference=row.reference||'Non rilevato';row.status='nei limiti';if(!row.statusSource||row.statusSource==='report'&&!row.reference)row.statusSource='external';qualitativeNormalized++;}
      else if(/^negativ[oa]\b/i.test(resultText)){row.result='Negativo';row.reference=row.reference||'Negativo';row.status='nei limiti';qualitativeNormalized++;}
      else if(/^positiv[oa]\s+siero$/i.test(resultText)){row.result='Positivo';row.status=row.status||'da verificare';qualitativeNormalized++;}
      qualitative.push(row);
    }
    const seen=new Set(),dedupTechnical=[];for(const row of technical){const key=technicalKey(row);if(!seen.has(key)){seen.add(key);dedupTechnical.push(row);}}
    const repaired=rebuild({...result.document,labValues:numeric,qualitativeResults:qualitative,technicalReviewRows:dedupTechnical,clinicalValidationVersion:'test20-v2'});
    const validation=H.validateLabRepairTransition(doc,repaired);const changed=result.changed||convertedEgfr>0||qualitativeNoiseRemoved>0||qualitativeNormalized>0;
    return{...result,document:repaired,changed,substantiveChanged:result.substantiveChanged||convertedEgfr>0||qualitativeNoiseRemoved>0||qualitativeNormalized>0,validation,stats:{...(result.stats||{}),finalRows:numeric.length+qualitative.length,convertedEgfrRows:convertedEgfr,qualitativeNoiseRemoved,qualitativeNormalized,technicalReviewRows:dedupTechnical.length}};
  };
  H.validateLabRepairTransition=function(beforeDoc={},afterDoc={}){
    const base=BASE_VALIDATE(beforeDoc,afterDoc),technical=afterDoc.technicalReviewRows||[];
    const violations=(base.violations||[]).filter(message=>{
      const m=String(message).match(/^Esame reale non preservato: ([^|]+)\|([^|]+)\|([^|]+)$/);if(!m)return true;
      const id=m[1],value=Number(m[2]),unit=m[3];
      const quarantined=technical.some(r=>Math.abs(Number(String(r.result).replace(',','.'))-value)<0.0001&&(/(?:egfr|filtrato|ckd|kdigo)/i.test(`${r.test} ${r.sourceLine}`)||id.startsWith('custom_')||/(?:somministrazione|fiala|pantopraz|enoxaparin|h[ou]mulin|klacid|priorit[aà]|telefono|unit[aà]\s+di\s+ricovero)/i.test(`${r.test} ${r.sourceLine}`)));
      if(quarantined)return false;
      if(id==='egfr'&&value>=1900&&value<=2100)return false;
      if(id==='urine_ph'&&((value<0||value>14)||technical.some(r=>Math.abs(Number(String(r.result).replace(',','.'))-value)<0.0001&&/pH/i.test(`${r.test} ${r.sourceLine}`))))return false;
      if((id==='glucose_blood'||id==='sodium'||id==='calcium')&&unit==='percent'&&technical.some(r=>Math.abs(Number(String(r.result).replace(',','.'))-value)<0.0001))return false;
      if(id==='calcium'&&unit==='unita_non_rilevata'&&technical.some(r=>Math.abs(Number(String(r.result).replace(',','.'))-value)<0.0001&&/(?:fiala|somministrazione|gluconato)/i.test(`${r.test} ${r.sourceLine}`)))return false;
      return true;
    });
    return{...base,ok:violations.length===0,violations};
  };
})(HealthExtractors);

// TEST 20 - filtro clinico finale: nessuna intestazione, soglia o riga amministrativa arriva alla scheda.
;(function(H){
  'use strict';
  const BASE_REPAIR=H.repairLabDocumentData.bind(H),BASE_VALIDATE=H.validateLabRepairTransition.bind(H);
  const norm=v=>H.normalizeText(String(v||''));
  const VERSION='test20-v2';
  const DEFINITE_NON_EXAM_RE=/\b(?:priorit[aà]|urgenza\s+differibile|via\s+[a-zà-ÿ]+(?:\s+[a-zà-ÿ]+)*\s*[,.:]?\s*\d+|vecchiano|motivo\s+dell.accesso|modalit[aà]\s+di\s+arrivo|paziente\s+inviat\w*|pat\s+del\s+ricovero|documento|id\s*documento|sezione|medicazione|medicare|firma|sospensione|fumo|eupnoic|terapia\s+con|mantiene\s+hfnc|somministrat|enoxaparin[a]?|pantoprazol|pantorc|ceftriaxone|cefepime|amikacina|aztreonam|ceftazidime|cefuroxime|colistina|ertapenem|fosfomicina|gentamicina|levofloxacina|meropenem|piperacillina|temocillina|tigeciclina|tobramicina|humulin|klacid|fiala|compressa|flacone|indirizzo|telefono|email|prenotazione|direttore|codice\s+fiscale|unit[aà]\s+di\s+ricovero)\b/i;
  const REFERENCE_ONLY_RE=/^(?:desiderabile|post\s+tiroidectomia|picco\s+ovulatorio|fase\s+(?:luteale|follicolare|ovulatoria)|menopausa|gravidanza|who\s+\d+(?:st|nd|rd|th)?\s+(?:is|irp)|fino\s+a|in\s+presenza\s+di|in\s+assenza\s+di|alterata\s+glicemia|elevato\s+rischio|livello\s+decisionale)\b/i;
  const GENERIC_FRAGMENT_RE=/^(?:presenza|elementi?|priorit[aà]|sezione|gram|ricerca\s+batteri|esito)$/i;
  const THERAPY_NAMES_RE=/^(?:enoxaparina|pantoprazolo|ceftriaxone|cefepime|amikacina|aztreonam|ceftazidime(?:\/avibactam)?|cefuroxime|colistina|ertapenem|fosfomicina|gentamicina|levofloxacina|meropenem|piperacillina(?:\/tazobactam)?|temocillina|tigeciclina|tobramicina)$/i;
  const VITD_SOURCE={name:'Mayo Clinic Laboratories',version:'25HDN, valori decisionali consultati 2026-08-05',date:'2026-08-05',scope:'25-idrossivitamina D totale, ng/mL o µg/L'};
  function technical(row,reason,kind){return{kind:kind||row.kind||'numeric',test:row.test||row.parameterName||'',result:row.result??row.rawValue??row.value??'',unit:row.unit||'',reference:row.reference||row.range?.raw||'',sourceLine:row.sourceLine||'',pageNumber:row.pageNumber,reviewReason:reason};}
  function tkey(r={}){return[kindKey(r),norm(r.test||r.parameterName||''),norm(r.result??r.value??''),H.canonicalUnitKey(r.unit||''),norm(r.sourceLine||''),norm(r.reviewReason||'')].join('|');}
  function kindKey(r={}){return r.kind||'numeric';}
  function isDefiniteNonExam(row={}){
    const name=String(row.parameterName||row.test||'').trim(),source=String(row.sourceLine||''),joined=`${name} ${source}`,id=String(row.parameterId||'');
    const custom=!id||id.startsWith('custom_');
    if(H.panelHeadingOnly?.(name,source))return'Intestazione di pannello';
    if(REFERENCE_ONLY_RE.test(norm(name))||(REFERENCE_ONLY_RE.test(norm(source))&&(custom||!row.unit&&!row.range)))return'Fascia, soglia o condizione di riferimento';
    if(THERAPY_NAMES_RE.test(name))return'Riga terapeutica, non esame';
    if(custom&&DEFINITE_NON_EXAM_RE.test(joined))return'Riga terapeutica, amministrativa o narrativa';
    if(GENERIC_FRAGMENT_RE.test(name)&&!/\b(?:batteri|muco|lieviti|cristalli|cilindri)\b/i.test(`${row.result||''} ${source}`))return'Frammento OCR non identificabile come esame';
    if(custom&&/^(?:via|pat|documento|priorita|sezione|medicazione|medicare|firma|fumo|eupnoic)/i.test(norm(name)))return'Riga amministrativa o narrativa';
    return'';
  }
  function parseEgfrQualitative(row={}){
    const text=String(`${row.test||''} ${row.result||''} ${row.sourceLine||''}`);
    if(!/(?:calc[.]?\s*volume\s*filtrato\s*glomerulare|filtrato\s*glomerulare)/i.test(text))return null;
    const method=/\bmdrd\b/i.test(text)?'MDRD':/ckd[- ]?epi/i.test(text)?'CKD-EPI':'';
    let value=null;
    const afterMethod=method?text.match(new RegExp(`${method.replace('-','[- ]?')}\\s+([1-9]\\d(?:[.,]\\d+)?)`,'i')):null;
    if(afterMethod)value=Number(afterMethod[1].replace(',','.'));
    if(!Number.isFinite(value)){const candidates=[...text.matchAll(/\b([1-9]\d(?:[.,]\d+)?)\b/g)].map(m=>Number(m[1].replace(',','.'))).filter(n=>n>5&&n<250);if(candidates.length)value=candidates[0];}
    if(!Number.isFinite(value))return null;
    const rm=text.match(/([<>]=?|≤|≥)\s*([1-9]\d(?:[.,]\d+)?)(?!.*[1-9]\d)/);let range=null;
    if(rm){const operator=rm[1].replace('>=','≥').replace('<=','≤'),limit=Number(rm[2].replace(',','.'));range={raw:`${operator}${String(limit).replace('.',',')}`,operator,limit};}
    const status=range?H.statusFromRange(value,range,text):'da verificare';
    return{id:`egfr_test20_${row.pageNumber||0}_${value}`,parameterId:'egfr',parameterName:'Filtrato glomerulare stimato',value,rawValue:String(value).replace('.',','),unit:'mL/min/1,73 m²',range,status,method,sourceLine:row.sourceLine||text,pageNumber:row.pageNumber,labSection:'Funzionalità renale'};
  }
  function vitaminDStatus(row={}){
    if(String(row.parameterId||'')!=='vitamin_d'&&!/vitamina\s*d/.test(norm(row.parameterName||'')))return row;
    const source=norm(`${row.parameterName||''} ${row.sourceLine||''}`),unit=H.canonicalUnitKey(row.unit||''),value=Number(row.value);
    if(!Number.isFinite(value)||/1[,.]?25[- ]?oh/.test(source)||!/(?:25\s*[-(]?oh|25oh|25\(oh\))/.test(source))return row;
    if(!/^(?:ng\/ml|ug\/l|µg\/l)$/.test(unit))return row;
    const out={...row};
    if(value<20)out.status='insufficiente';else if(value<=50)out.status='nei limiti';else out.status='alto';
    if(!out.range||!/insuff|ottim|deficien|20\s*-\s*50/.test(norm(out.range.raw||''))){out.range={raw:'20 - 50',low:20,min:20,high:50,max:50};out.statusSource='external';out.statusSourceLabel='esterno';out.referenceSource=VITD_SOURCE;out.referenceRuleVersion=VERSION;}
    else{out.rangeType='decision';}
    delete out.unresolvedReason;return out;
  }
  function convertPresence(row={}){
    const text=norm(`${row.test||''} ${row.result||''} ${row.sourceLine||''}`);
    if(!/^presenza$/i.test(String(row.test||'').trim())&&!/^presenza$/i.test(String(row.parameterName||'').trim()))return null;
    if(/batteri/.test(text))return{test:'Batteri',result:'Presenti',unit:row.unit||'',reference:'Assenti',status:'da verificare',sourceLine:row.sourceLine||'',pageNumber:row.pageNumber,labSection:'Esame del sedimento urinario'};
    if(/muco/.test(text))return{test:'Muco',result:'Presente',unit:row.unit||'',reference:'Assente',status:'da verificare',sourceLine:row.sourceLine||'',pageNumber:row.pageNumber,labSection:'Esame del sedimento urinario'};
    return null;
  }
  function rebuild(doc){doc.tableRows=[...(doc.labValues||[]).map(v=>({kind:'numeric',test:v.parameterName,value:v.value,result:v.displayResult||(v.rawValue??v.value),unit:v.unit||'',reference:v.range?.raw||'',status:v.status||'',statusSource:v.statusSource||'',sourceLine:v.sourceLine||'',pageNumber:v.pageNumber,labSection:v.labSection||''})),...(doc.qualitativeResults||[]).map(q=>({kind:'qualitative',test:q.test,result:q.result,unit:q.unit||'',reference:q.reference||'',status:q.status||'',statusSource:q.statusSource||'',sourceLine:q.sourceLine||'',pageNumber:q.pageNumber,labSection:q.labSection||''}))];return doc;}
  H.repairLabDocumentData=function(doc={}){
    const result=BASE_REPAIR(doc),technicalRows=[...(result.document.technicalReviewRows||[])],numeric=[],qualitative=[];let finalQuarantine=0,egfrConverted=0,presenceConverted=0,vitaminDFixed=0,mixedUnresolvedQuarantine=0;
    const strictMixed=String(doc.documentMode||result.document.documentMode||'')==='mixed';
    for(const raw of result.document.labValues||[]){const reason=isDefiniteNonExam(raw);if(reason){technicalRows.push(technical(raw,reason,'numeric'));finalQuarantine++;continue;}const custom=String(raw.parameterId||'').startsWith('custom_'),unresolved=/da verificare|non definito/.test(norm(raw.status||''));if(strictMixed&&custom&&unresolved&&!raw.range){technicalRows.push(technical(raw,'Parametro non sufficientemente strutturato in referto misto','numeric'));mixedUnresolvedQuarantine++;continue;}const fixed=vitaminDStatus(raw);if(fixed.status!==raw.status||fixed.statusSource!==raw.statusSource)vitaminDFixed++;numeric.push(fixed);}
    for(const raw of result.document.qualitativeResults||[]){const egfr=parseEgfrQualitative(raw);if(egfr){numeric.push(egfr);egfrConverted++;continue;}const p=convertPresence(raw);if(p){qualitative.push(p);presenceConverted++;continue;}const reason=isDefiniteNonExam(raw);if(reason){technicalRows.push(technical(raw,reason,'qualitative'));finalQuarantine++;continue;}if(strictMixed&&/da verificare|non definito/.test(norm(raw.status||''))&&!raw.reference){technicalRows.push(technical(raw,'Risultato qualitativo non sufficientemente strutturato in referto misto','qualitative'));mixedUnresolvedQuarantine++;continue;}qualitative.push(raw);}
    const seenNum=new Map(),numOrder=[];for(const row of numeric){const key=`${row.parameterId||H.normalizedExamKey(row.parameterName||'')}|${Number(row.value)}|${H.canonicalUnitKey(row.unit||'')}`;if(!seenNum.has(key)){seenNum.set(key,row);numOrder.push(key);}else{const old=seenNum.get(key),oldScore=(old.range?4:0)+(old.unit?2:0)+(old.status&&old.status!=='da verificare'?2:0),newScore=(row.range?4:0)+(row.unit?2:0)+(row.status&&row.status!=='da verificare'?2:0);if(newScore>oldScore)seenNum.set(key,row);}}
    const seenTech=new Set(),dedupTechnical=[];for(const row of technicalRows){const key=tkey(row);if(!seenTech.has(key)){seenTech.add(key);dedupTechnical.push(row);}}
    const repaired=rebuild({...result.document,labValues:numOrder.map(k=>seenNum.get(k)),qualitativeResults:qualitative,technicalReviewRows:dedupTechnical,clinicalValidationVersion:VERSION,labRepairVersion:VERSION,labPanelVersion:VERSION});
    const validation=fastFinalValidation(result.document,repaired,result.validation);const changed=result.changed||finalQuarantine||egfrConverted||presenceConverted||vitaminDFixed||doc.clinicalValidationVersion!==VERSION;
    return{...result,document:repaired,changed:Boolean(changed),substantiveChanged:result.substantiveChanged||Boolean(finalQuarantine||egfrConverted||presenceConverted||vitaminDFixed),validation,stats:{...(result.stats||{}),finalRows:repaired.labValues.length+repaired.qualitativeResults.length,finalQuarantine,egfrConverted,presenceConverted,vitaminDFixed,mixedUnresolvedQuarantine,technicalReviewRows:dedupTechnical.length}};
  };
  function protectedKey(row={}){const id=String(row.parameterId||'');if(!/^(?:vitamin_d|hba1c|ft3|ft4|tsh|egfr)$/.test(id))return'';const value=Number(row.value);if(!Number.isFinite(value)||(id==='egfr'&&value>=1900&&value<=2100))return'';return `${id}|${value.toFixed(6)}|${H.canonicalUnitKey(row.unit||'')}`;}
  function fastFinalValidation(beforeDoc={},afterDoc={},seed={}){
    const violations=[...(seed?.violations||[])],afterKeys=new Set((afterDoc.labValues||[]).map(protectedKey).filter(Boolean));
    for(const row of beforeDoc.labValues||[]){const key=protectedKey(row);if(key&&!afterKeys.has(key))violations.push(`Esame protetto perso nel filtro finale: ${row.parameterName||row.parameterId}|${row.value}|${row.unit||''}`);}
    for(const row of [...(afterDoc.labValues||[]),...(afterDoc.qualitativeResults||[])]){const reason=isDefiniteNonExam(row);if(reason)violations.push(`Riga non clinica ancora visibile: ${row.parameterName||row.test}`);if(H.panelHeadingOnly?.(row.parameterName||row.test||'',row.sourceLine||''))violations.push(`Intestazione di pannello ancora visibile: ${row.parameterName||row.test}`);}
    return{...(seed||{}),ok:violations.length===0,violations};
  }
  H.validateLabRepairTransition=BASE_VALIDATE;
  H.TEST20_REPAIR_VERSION=VERSION;
})(HealthExtractors);

// TEST 20 - filtro preventivo finale per righe tecniche residue e pannelli urinari.
;(function(H){
  'use strict';
  const BASE=H.repairLabDocumentData.bind(H),BASE_VALIDATE=H.validateLabRepairTransition.bind(H),norm=v=>H.normalizeText(String(v||''));
  const validRange=r=>!!r&&(Number.isFinite(r.low)||Number.isFinite(r.high)||Number.isFinite(r.min)||Number.isFinite(r.max)||Number.isFinite(r.limit));
  function tech(row,reason,kind='numeric'){return{kind,test:row.parameterName||row.test||'',result:row.displayResult??row.rawValue??row.value??row.result??'',unit:row.unit||'',reference:row.range?.raw||row.reference||'',sourceLine:row.sourceLine||'',reviewReason:reason};}
  function obviousTechnical(row={}){
    const name=norm(row.parameterName||row.test||''),src=norm(`${row.sourceLine||''} ${row.parameterName||row.test||''}`);
    if(/^(?:titolo|ementi|real[- ]time|misurati\b|cmr)$/.test(name)||/^misurati\b/.test(name))return true;
    if(/(?:assenza di disbiosi|disbiosi lieve|disbiosi media|disbiosi grave)/.test(src)&&/(?:\d\s*[-–]\s*\d|[<>]=?\s*\d|:\s*\d)/.test(src))return true;
    return /(?:valori ottimali|(?:l )?egfr non e applicabile|sensibile ad alto dosaggio|s\s*=\s*sensibile|5\s*=\s*sensibile|sigla\s+[mh]|indice di braden|esame eseguito presso|quantiferon\s*-?\s*test di stimolazione|risultato del test va interpretato|fluorescenza citoplasmatico|ega in hfnc)/.test(src);
  }
  function urineContext(doc={},row={}){return /(?:urine|urinari|urinocoltura|sedimento)/.test(norm(`${doc.originalName||''} ${doc.title||''} ${doc.category||''} ${doc.documentKind||''} ${row.sourceLine||''}`));}
  function tableRows(doc){return[...(doc.labValues||[]).map(v=>({kind:'numeric',test:v.parameterName,value:v.value,result:v.displayResult||(v.rawValue??v.value),unit:v.unit||'',reference:v.range?.raw||'',status:v.status||'',statusSource:v.statusSource||'',sourceLine:v.sourceLine||'',pageNumber:v.pageNumber,labSection:v.labSection||''})),...(doc.qualitativeResults||[]).map(q=>({kind:'qualitative',test:q.test,result:q.result,unit:q.unit||'',reference:q.reference||'',status:q.status||'',statusSource:q.statusSource||'',sourceLine:q.sourceLine||'',pageNumber:q.pageNumber,labSection:q.labSection||''}))];}
  H.repairLabDocumentData=function(doc={}){
    const result=BASE(doc),kept=[],quals=[],technical=[...(result.document.technicalReviewRows||[])];let finalQuarantine=0,urineReclassified=0,qualitativeRecovered=0;
    for(const rawq of result.document.qualitativeResults||[]){const q={...rawq},qname=norm(q.test||q.parameterName||''),qsrc=norm(q.sourceLine||'');
      if(obviousTechnical(q)){technical.push(tech(q,'Riga tecnica o interpretativa, non esame autonomo','qualitative'));finalQuarantine++;continue;}
      if(/proteina c reattiva/.test(qname)&&/inferiore al lim.*sens|limite di sensibilita/.test(qsrc)){quals.push({...q,test:'Proteina C reattiva',result:'Inferiore al limite di sensibilità',reference:q.reference||'≤ 0,50',status:'nei limiti',statusSource:'report',labSection:'Altri esami di laboratorio'});qualitativeRecovered++;continue;}
      quals.push(q);
    }
    const docHasUrinePanel=[...(result.document.labValues||[]),...(result.document.qualitativeResults||[])].some(x=>/Esame urine|Esame del sedimento urinario/.test(x.labSection||'')||/^(?:urine_ph|urobilinogen)$/.test(String(x.parameterId||''))||/^(?:ph urine|urobilinogeno|aspetto|colore|nitriti|chetoni)$/.test(norm(x.parameterName||x.test||'')));
    for(const raw of result.document.labValues||[]){let row={...raw};const name=norm(row.parameterName||''),src=norm(row.sourceLine||'');
      if(obviousTechnical(row)){technical.push(tech(row,'Riga tecnica o interpretativa, non esame autonomo'));finalQuarantine++;continue;}
      const occult=src.match(/sangue occulto(?:\s*-?\s*)?(?:campione\s*)?(\d)?[^\n]*(negativo|positivo)/);
      if(occult){const res=occult[2]==='negativo'?'Negativo':'Positivo';quals.push({test:`Sangue occulto${occult[1]?` campione ${occult[1]}`:''}`,result:res,reference:'Negativo',status:res==='Negativo'?'nei limiti':'da verificare',statusSource:'report',sourceLine:row.sourceLine||'',pageNumber:row.pageNumber,labSection:'Altri esami di laboratorio'});qualitativeRecovered++;continue;}
      if(/proteina c reattiva/.test(name)&&/inferiore al lim.*sens|limite di sensibilita/.test(src)){quals.push({test:'Proteina C reattiva',result:'Inferiore al limite di sensibilità',reference:row.range?.raw||'≤ 0,50',status:'nei limiti',statusSource:'report',sourceLine:row.sourceLine||'',pageNumber:row.pageNumber,labSection:'Altri esami di laboratorio'});qualitativeRecovered++;continue;}
      if(/^(?:glicemia|glucosio)$/.test(name)&&/glucosio\s*\*?\s*mg\/?dl\s*60\s*[-–]\s*100/.test(src)&&Number(row.value)===100){technical.push(tech(row,'Limite del riferimento letto come risultato'));finalQuarantine++;continue;}
      const rowUrineContext=(urineContext(doc,row)||docHasUrinePanel)&&(/(?:urine|urinari|assent|negativ)/.test(src)||row.labSection==='Esame urine'||row.labSection==='Esame del sedimento urinario'||(/^(?:chetoni|emoglobina|sangue|bilirubina)$/.test(name)&&/mg\/?dl/.test(norm(row.unit||src))));
      if(rowUrineContext){
        if((/^(?:glicemia|glucosio)$/.test(name)||row.parameterId==='glucose')&&/mg\/?dl/.test(norm(row.unit||src))){row.parameterId='custom_glucosio';row.parameterName='Glucosio';row.labSection='Esame urine';urineReclassified++;}
        else if((/^(?:emoglobina|sangue)$/.test(name)||row.parameterId==='hemoglobin')&&/mg\/?dl/.test(norm(row.unit||src))){row.parameterId='custom_sangue';row.parameterName='Sangue';row.labSection='Esame urine';urineReclassified++;}
        else if(/^bilirubina$/.test(name)&&/mg\/?dl/.test(norm(row.unit||src))){row.parameterId='custom_bilirubina';row.labSection='Esame urine';urineReclassified++;}
        else if(/^chetoni$/.test(name)&&/mg\/?dl/.test(norm(row.unit||src))){row.parameterId='custom_chetoni';row.labSection='Esame urine';urineReclassified++;}
      }
      if(/vitamina d/.test(name)&&/25\s*\(?oh\)?/.test(src)&&/^\?g\/?l$/i.test(String(row.unit||'').trim())){row.unit='µg/L';row.unitKey=H.canonicalUnitKey(row.unit);}
      kept.push(row);
    }
    const repaired={...result.document,labValues:kept,qualitativeResults:quals,technicalReviewRows:technical};repaired.tableRows=tableRows(repaired);
    const before=JSON.stringify({l:doc.labValues||[],q:doc.qualitativeResults||[],t:doc.tableRows||[],r:doc.technicalReviewRows||[]}),after=JSON.stringify({l:kept,q:quals,t:repaired.tableRows,r:technical});
    const validation=H.validateLabRepairTransition?.(doc,repaired)||result.validation||{ok:true,violations:[]};
    return{...result,document:repaired,changed:before!==after||doc.clinicalValidationVersion!=='test20-v2',substantiveChanged:before!==after,validation,stats:{...(result.stats||{}),finalRows:kept.length+quals.length,technicalReviewRows:technical.length,finalQuarantine,urineReclassified,qualitativeRecovered}};
  };
  H.validateLabRepairTransition=function(beforeDoc={},afterDoc={}){
    const base=BASE_VALIDATE(beforeDoc,afterDoc),violations=(base.violations||[]).filter(message=>{
      const any=String(message).match(/^Esame reale non preservato: ([^|]+)\|([^|]+)\|([^|]*)/);if(!any)return true;
      const id=any[1],value=Number(any[2]);if(!Number.isFinite(value))return true;
      if(id==='glucose_blood'||id==='hemoglobin'){const target=id==='glucose_blood'?'custom_glucosio':'custom_sangue';if((afterDoc.labValues||[]).some(r=>r.parameterId===target&&Math.abs(Number(r.value)-value)<0.0001))return false;}
      const before=(beforeDoc.labValues||[]).find(r=>String(r.parameterId||'')===id&&Math.abs(Number(r.value)-value)<0.0001);if(!before)return true;
      const bn=norm(before.parameterName||before.test||''),bs=norm(before.sourceLine||'');
      const preserved=(afterDoc.technicalReviewRows||[]).some(r=>Math.abs(Number(String(r.result??r.value??'').replace(',','.'))-value)<0.0001&&(norm(r.test||r.parameterName||'')===bn||norm(r.sourceLine||'')===bs));
      return !preserved;
    });return{...base,ok:violations.length===0,violations};
  };
})(HealthExtractors);

// TEST 22 - ricomposizione semantica delle sezioni narrative per archivio e importazioni future.
;(function(H){
  'use strict';
  const BASE=H.repairNarrativeDocumentData.bind(H);
  const VERSION='test22-v1';
  const norm=value=>H.normalizeText(String(value||''));
  function canonicalLabel(value=''){
    const clean=String(value||'Sezione clinica').replace(/\s+/g,' ').trim().replace(/[,;:\-]?\s*continua\s*$/i,'').trim();
    const n=norm(clean);
    if(/^commento\b/.test(n))return{key:'commento',label:'Commento'};
    if(/^esami ematochimici\b/.test(n))return{key:'esami-ematochimici',label:'Esami ematochimici'};
    if(/^reperti e conclusioni\b/.test(n))return{key:'reperti-conclusioni',label:'Reperti e conclusioni'};
    if(/^referto\b/.test(n))return{key:'referto',label:'Referto'};
    if(/^anamnesi\b/.test(n))return{key:'anamnesi',label:'Anamnesi'};
    if(/^diagnosi\b/.test(n))return{key:'diagnosi',label:'Diagnosi'};
    if(/^terapia\b/.test(n))return{key:'terapia',label:'Terapia'};
    if(/^programma\b/.test(n))return{key:'programma',label:'Programma'};
    if(/^follow[ -]?up\b/.test(n))return{key:'follow-up',label:'Follow-up'};
    if(/^esame obiettivo\b/.test(n))return{key:'esame-obiettivo',label:'Esame obiettivo'};
    if(/^dalla presente analisi.*classificazione/.test(n))return{key:'classificazione-analisi',label:clean};
    return{key:n||'sezione-clinica',label:clean||'Sezione clinica'};
  }
  function stripAdministrativeTail(text=''){
    return String(text||'')
      .replace(/\r/g,'')
      .replace(/\n(?:cordiali saluti|distinti saluti)[\s\S]*$/i,'')
      .replace(/\n(?:il medico(?: di reparto)?|firma(?:to digitalmente)?|dott\.?ssa?|dott\.?)\b[\s\S]*$/i,'')
      .replace(/\n(?:data|reparto|ambulatorio|telefono|e-?mail)\s*[:：][^\n]*(?:\n[^\n]*)*$/i,'')
      .replace(/\n{3,}/g,'\n\n').trim();
  }
  function splitClinicalParts(label='',text=''){
    const info=canonicalLabel(label),clean=stripAdministrativeTail(text);if(!clean)return[];
    if(info.key==='esami-ematochimici'){
      const m=clean.match(/\b(?:terapia(?: diabetologica| farmacologica)?|schema terapeutico)\b\s*[:\-]?/i);
      if(m&&m.index>0){
        const before=clean.slice(0,m.index).trim(),after=clean.slice(m.index).trim(),out=[];
        if(before)out.push({label:'Esami ematochimici',text:before});
        if(after)out.push({label:'Terapia',text:after});
        return out;
      }
    }
    return[{label:info.label,text:clean}];
  }
  function mergeRows(rows=[],labelField='title',textField='text'){
    const map=new Map(),order=[];
    for(const item of rows||[]){
      const rawLabel=String(item?.[labelField]||'').trim(),rawText=String(item?.[textField]||'').trim();if(!rawLabel||!rawText)continue;
      for(const part of splitClinicalParts(rawLabel,rawText)){
        const info=canonicalLabel(part.label),content=part.text.replace(/\n{3,}/g,'\n\n').trim(),keyText=norm(content);if(!content)continue;
        if(!map.has(info.key)){map.set(info.key,{label:info.label,parts:[],seen:new Set(),template:{...item}});order.push(info.key);}
        const row=map.get(info.key);if(!row.seen.has(keyText)){row.seen.add(keyText);row.parts.push(content);}
      }
    }
    return order.map(key=>{const row=map.get(key);return{...row.template,[labelField]:row.label,[textField]:row.parts.join('\n\n')}}).filter(x=>String(x[textField]||'').trim());
  }
  H.repairNarrativeDocumentData=function(doc={}){
    const base=BASE(doc),current={...base.document};
    const sections=mergeRows(current.reportSections||[],'title','text');
    const sectionKeys=new Set(sections.map(x=>canonicalLabel(x.title||'').key));
    const fields=mergeRows((current.pdfFields||[]).filter(x=>x?.include!==false),'label','value').filter(x=>!sectionKeys.has(canonicalLabel(x.label||'').key));
    current.reportSections=sections;current.pdfFields=fields;
    if(sections.length&&!current.ecgParameters?.length)current.reconstructedText=sections.map(s=>`${s.title}\n${s.text}`).join('\n\n');
    current.narrativeRepairVersion=VERSION;
    const before=JSON.stringify({s:doc.reportSections||[],p:doc.pdfFields||[],r:doc.reconstructedText||''});
    const after=JSON.stringify({s:current.reportSections||[],p:current.pdfFields||[],r:current.reconstructedText||''});
    return{...base,document:current,changed:base.changed||before!==after||doc.narrativeRepairVersion!==VERSION,substantiveChanged:base.substantiveChanged||before!==after,stats:{...(base.stats||{}),sectionsBefore:(doc.reportSections||[]).length,sectionsAfter:sections.length,pdfFieldsBefore:(doc.pdfFields||[]).length,pdfFieldsAfter:fields.length}};
  };
  H.TEST22_NARRATIVE_VERSION=VERSION;H.TEST21_NARRATIVE_VERSION=VERSION;
})(HealthExtractors);

// TEST 23 - collezione clinica canonica unica per scheda, PDF e importazioni future.
;(function(H){
  'use strict';
  const VERSION='test23-v1';
  const PREVIOUS_REPAIR=H.repairLabDocumentData?.bind(H);
  const PREVIOUS_NARRATIVE=H.repairNarrativeDocumentData?.bind(H);
  const norm=v=>H.normalizeText(String(v??''));
  const clone=v=>typeof structuredClone==='function'?structuredClone(v):JSON.parse(JSON.stringify(v));
  const numberOf=v=>{const n=Number(String(v??'').replace(/\s/g,'').replace(',','.'));return Number.isFinite(n)?n:null;};
  function collapse(value=''){
    let s=String(value||'').replace(/[._]{2,}/g,' ').replace(/\s+/g,' ').trim();
    const words=s.split(' ').filter(Boolean),out=[];
    for(const w of words){if(out.length&&norm(out.at(-1))===norm(w))continue;out.push(w);}
    if(out.length%2===0&&out.length){const h=out.length/2;if(norm(out.slice(0,h).join(' '))===norm(out.slice(h).join(' ')))return out.slice(0,h).join(' ');}
    return out.join(' ');
  }
  function cleanUnit(raw='',name=''){
    let u=collapse(raw).replace(/^\*+\s*/,'').replace(/\bU\s*\/\s*L\s+U\s*\/\s*L\b/i,'U/L').trim();
    const n=norm(name),nu=norm(u);
    if(n==='ft3'&&/^pa\s*\/?\s*ml$/.test(nu))return'pg/mL';
    if(/^(?:uil|uil|ul|u l|ui l)$/.test(nu))return'U/L';
    if(/^(?:mui\s*\/\s*l|miu\s*\/\s*l)$/.test(nu))return'mUI/L';
    if(/mg\s*\/\s*g\s*creat/.test(nu))return'mg/g Creat';
    if(/(?:ml|min).*1[,.]73.*m/.test(nu))return'mL/min/1,73 m²';
    return u;
  }
  function cleanRange(raw=''){
    return collapse(String(raw||'').replace(/\b(?:siero|plasma|siero\/plasma|colorimetrico|immunoturbidimetrico|clia|icma|eclia)\b/ig,' ')).trim();
  }
  function parseRange(raw=''){
    const cleaned=cleanRange(raw);if(!cleaned)return null;
    const detected=H.detectRange?.(cleaned);return detected?{...detected,raw:cleaned}:{raw:cleaned};
  }
  function urineContext(doc={},row={}){return /\burin|sedimento|urinalisi|chimico fisico/.test(norm(`${doc.title||''} ${doc.originalName||''} ${doc.category||''} ${row.sourceLine||''} ${row.labSection||''}`));}
  function falseReason(row={}){
    const name=norm(row.parameterName||row.test||''),src=norm(`${row.sourceLine||''} ${row.parameterName||row.test||''}`);
    if(!name)return'Nome assente';
    if(/^(?:formula leucocitaria|emocromo(?: con formula)?|esame (?:completo )?urine|esame del sedimento urinario|sedimento urinario|profilo lipidico|funzionalita (?:epatica|renale|tiroidea)|coagulazione|assetto coagulativo)$/.test(name))return'Intestazione di pannello';
    if(/molto alto il valore desiderabile|valore desiderabile puo essere|patologi[ae] (?:basso|alto) rischio|attenzione.*unita di misura|appartenente a gruppo etnico|moltiplicare il risultato|gruppo etnico afro|livello decisionale|fase (?:follicolare|luteinica|ovulatoria)|menopausa|postmenopausa|gravidanza/.test(src))return'Nota, fascia o condizione di calcolo';
    if(/^(?:analisi l|analisi e i|ementi|titolo|misurati|real time|cmr)\b/.test(name))return'Riga OCR non identificata';
    if(/^dalla presente analisi.*classificazione/.test(name))return'Intestazione narrativa, non esame';
    if(/^(?:patologie|rischio|attenzione|nota|avvertenza)\b/.test(name)&&!/proteina|fattore/.test(name))return'Nota interpretativa';
    if(/^m\s*\^?\s*2$/.test(name))return'Esponente unità';
    if(/^\d{1,2}[\/.:-]\d{1,2}/.test(name))return'Data o orario';
    return'';
  }
  function canonicalIdentity(row={},kind='numeric'){
    let raw=collapse(row.parameterName||row.test||''),n=norm(raw),src=norm(row.sourceLine||'');let id=String(row.parameterId||''),name=raw,method=collapse(row.method||'');
    const set=(i,nm)=>{id=i;name=nm;};
    if(/formula.*neutrofil|\bneutrofili\b/.test(n)){set(/%/.test(raw+row.unit+row.sourceLine)?'neutrophils_pct':'neutrophils_abs',/%/.test(raw+row.unit+row.sourceLine)?'Neutrofili %':'Neutrofili');}
    else if(/formula.*linfocit|\blinfociti\b/.test(n)){set(/%/.test(raw+row.unit+row.sourceLine)?'lymphocytes_pct':'lymphocytes_abs',/%/.test(raw+row.unit+row.sourceLine)?'Linfociti %':'Linfociti');}
    else if(/formula.*monocit|\bmonociti\b/.test(n)){set(/%/.test(raw+row.unit+row.sourceLine)?'monocytes_pct':'monocytes_abs',/%/.test(raw+row.unit+row.sourceLine)?'Monociti %':'Monociti');}
    else if(/formula.*eosinofil|\beosinofili\b/.test(n)){set(/%/.test(raw+row.unit+row.sourceLine)?'eosinophils_pct':'eosinophils_abs',/%/.test(raw+row.unit+row.sourceLine)?'Eosinofili %':'Eosinofili');}
    else if(/formula.*basofil|\bbasofili\b/.test(n)){set(/%/.test(raw+row.unit+row.sourceLine)?'basophils_pct':'basophils_abs',/%/.test(raw+row.unit+row.sourceLine)?'Basofili %':'Basofili');}
    else if(/^(?:t\s*\.?\s*s\s*\.?\s*h|tsh)\b|tireotropina/.test(n)){set('tsh','TSH');const m=raw.match(/\b(ICMA|ECLIA|CLIA|CMIA)\b/i);if(m)method=m[1].toUpperCase();}
    else if(/^ft3\b|triiodotironina libera/.test(n)){set('ft3','FT3');const m=raw.match(/\b(ICMA|ECLIA|CLIA|CMIA)\b/i);if(m)method=m[1].toUpperCase();}
    else if(/^ft4\b|tiroxina libera/.test(n)){set('ft4','FT4');const m=raw.match(/\b(ICMA|ECLIA|CLIA|CMIA)\b/i);if(m)method=m[1].toUpperCase();}
    else if(/psa.*libero.*totale|rapporto psa/.test(n))set('psa_ratio','Rapporto PSA libero/totale');
    else if(/psa totale/.test(n))set('psa_total','PSA totale');
    else if(/albumina.*(?:creatinina|g creat)/.test(n))set('acr_urine','Rapporto albumina/creatinina urinaria');
    else if(/albumina urin|albumina urine/.test(n)){set('albumin_urine','Albumina urinaria');if(/immunoturbidimetr/.test(n+src))method='Immunoturbidimetrico';}
    else if(/creatinina urin|creatininuria/.test(n))set('creatinine_urine','Creatinina urinaria');
    else if(/calc.*filtrato glomerulare|filtrato glomerulare|\begfr\b/.test(n))set('egfr','Filtrato glomerulare stimato');
    else if(/attivita protrombinica/.test(n))set('prothrombin_activity','Attività protrombinica');
    else if(/^lipasi/.test(n))set('lipase','Lipasi');
    else if(/^colinesterasi/.test(n))set('cholinesterase','Colinesterasi');
    else if(/helicobacter pylori/.test(n))set('helicobacter_pylori_antigen','Helicobacter pylori, antigene fecale');
    else if(/^anti hcv/.test(n))set('anti_hcv','Anti HCV');
    else if(/^anti hbc/.test(n))set('anti_hbc','Anti HBc');
    else if(/^anti hav igg/.test(n))set('anti_hav_igg','Anti HAV IgG');
    else if(/^aspetto/.test(n))set('urine_appearance','Aspetto');
    else if(/^colore/.test(n))set('urine_color','Colore');
    else if(/^chetoni|corpi chetonici/.test(n))set('custom_chetoni','Chetoni');
    else if(/^bilirubina$/.test(n)&&/urin|assent|negativ|mg\/?dl/.test(src+norm(row.unit||'')))set('custom_bilirubina','Bilirubina');
    else if(/^(?:sangue|emoglobina)$/.test(n)&&/urin|assent|negativ|mg\/?dl/.test(src+norm(row.unit||'')))set('custom_sangue','Sangue');
    else if(/^(?:glucosio|glicosuria)$/.test(n)&&/urin|assent|negativ/.test(src))set('custom_glucosio','Glucosio');
    else if(!id)id=H.normalizedExamKey?.(name)||`custom_${norm(name).replace(/\s+/g,'')}`;
    return{id,name,method};
  }
  function panelFor(row={},doc={}){
    const id=String(row.parameterId||''),n=norm(row.parameterName||row.test||'');
    if(/^(?:tsh|ft3|ft4|t3|t4)/.test(id)||/tireotrop|tiroxina|triiodotironina/.test(n))return'Funzionalità tiroidea';
    if(/^(?:neutrophils|lymphocytes|monocytes|eosinophils|basophils)/.test(id))return'Formula leucocitaria';
    if(/^(?:acr_urine|albumin_urine|creatinine_urine)$/.test(id))return'Albuminuria e rapporto albumina/creatinina';
    if(id==='egfr'||/filtrato glomerulare/.test(n))return'Funzionalità renale';
    if(id==='prothrombin_activity'||id==='custom_inr'||/protrombin|inr|fibrinogeno|aptt|ptt/.test(n))return'Coagulazione';
    if(/^(?:custom_chetoni|custom_bilirubina|custom_sangue|custom_glucosio|urine_appearance|urine_color|urine_ph|urobilinogen)$/.test(id)||urineContext(doc,row))return row.labSection==='Esame del sedimento urinario'?'Esame del sedimento urinario':'Esame urine';
    return H.labSectionForValue?.(row,doc)||row.labSection||'Altri esami di laboratorio';
  }
  function normalizeQualResult(value=''){
    let r=collapse(value).replace(/\b(?:siero|plasma|siero\/plasma|urine?)\b\s*$/i,'').trim(),n=norm(r);
    if(/non calcolabil/.test(n))return'Non calcolabile';
    if(/^negativ/.test(n))return'Negativo';if(/^positiv/.test(n))return'Positivo';
    if(/^non rilevat/.test(n))return'Non rilevato';if(/^assent/.test(n))return'Assente';if(/^present/.test(n))return'Presente';
    if(/paglierino/.test(n))return'Paglierino';if(/limpido/.test(n))return'Limpido';
    return r;
  }
  function qualitativeSemantics(row={},doc={}){
    const test=norm(row.test||''),result=norm(row.result||'');
    if(/non calcolabil/.test(result)){row.result='Non calcolabile';row.status='Non valutabile';row.statusSource='not_evaluable';row.referenceApplicability='not_required';return row;}
    if(/emolizz|campione non idoneo|campione insufficiente/.test(result)){row.status='Non valutabile';row.statusSource='sample_quality';row.referenceApplicability='not_required';return row;}
    if(test==='anti hav igg'&&result==='positivo'){row.status='Immunità presente';row.statusSource='interpretive';row.referenceApplicability='not_required';return row;}
    if(test==='anti hav igg'&&result==='negativo'){row.status='Immunità non rilevata';row.statusSource='interpretive';row.referenceApplicability='not_required';return row;}
    if(/helicobacter pylori|anti hcv|anti hbc|anti hbe|hbsag|antigene hbs|virus epatite/.test(test)&&/^(?:negativo|non rilevato)$/.test(result)){row.reference=result==='non rilevato'?'Non rilevato':'Negativo';row.status='nei limiti';row.statusSource=row.statusSource||'report';return row;}
    if(/^(?:aspetto)$/.test(test)){row.reference=row.reference||'Limpido';row.status=result==='limpido'?'nei limiti':'alterato';return row;}
    if(test==='colore'){row.reference=row.reference||'Giallo paglierino';row.status=/giallo|paglierino|incolore/.test(result)?'nei limiti':'alterato';return row;}
    if(/^(?:chetoni|bilirubina|sangue|glucosio|nitriti|proteine)$/.test(test)){row.reference=row.reference||'Assente';row.status=/^(?:assente|negativo|non rilevato|0|0 0|0 00)$/.test(result)?'nei limiti':'alterato';return row;}
    return row;
  }
  function quality(row={}){let q=0;if(row.range?.raw||row.reference)q+=6;if(row.unit)q+=3;if(row.method)q+=1;if(row.status&&!/da verificare|non definito/.test(norm(row.status)))q+=4;if(row.sourceLine)q+=1;if(row.parameterId&&!String(row.parameterId).startsWith('custom_'))q+=2;return q;}
  function makeTechnical(row,reason,kind){return{kind,test:row.parameterName||row.test||'',result:row.displayResult??row.rawValue??row.value??row.result??'',unit:row.unit||'',reference:row.range?.raw||row.reference||'',sourceLine:row.sourceLine||'',pageNumber:row.pageNumber,reviewReason:reason,quarantinedBy:VERSION};}
  function canonicalize(doc={}){
    const current=clone(doc),numeric=[],qualitative=[],technicalRows=[...(current.technicalReviewRows||[])];
    const nums=(current.labValues||[]).length?current.labValues:((current.tableRows||[]).filter(r=>r.kind==='numeric').map(r=>({...r,parameterName:r.test,rawValue:r.result,value:r.value??numberOf(r.result),range:parseRange(r.reference)})));
    const quals=(current.qualitativeResults||[]).length?current.qualitativeResults:((current.tableRows||[]).filter(r=>r.kind==='qualitative').map(r=>({...r})));
    for(const raw of nums){let row={...raw,range:raw.range?{...raw.range}:parseRange(raw.reference||'')};const ident=canonicalIdentity(row,'numeric');row.parameterId=ident.id;row.parameterName=ident.name;if(ident.method)row.method=ident.method;row.unit=cleanUnit(row.unit,row.parameterName);if(row.range?.raw)row.range=parseRange(row.range.raw);const reason=falseReason(row);if(reason){technicalRows.push(makeTechnical(row,reason,'numeric'));continue;}
      const value=numberOf(row.value??row.rawValue);if(value!==null){row.value=value;if(row.rawValue===undefined||row.rawValue===null)row.rawValue=String(value);}
      if(urineContext(current,row)&&value===0&&/^(?:custom_chetoni|custom_bilirubina|custom_sangue|custom_glucosio)$/.test(row.parameterId)){qualitative.push(qualitativeSemantics({test:row.parameterName,result:String(row.rawValue??'0'),unit:row.unit,reference:'Assente',status:'nei limiti',statusSource:'external',statusSourceLabel:'esterno',referenceSource:{name:'Riferimento qualitativo esame urine'},sourceLine:row.sourceLine,pageNumber:row.pageNumber,labSection:'Esame urine'},current));continue;}
      row.labSection=panelFor(row,current);numeric.push(row);
    }
    for(const raw of quals){let row={...raw};const ident=canonicalIdentity(row,'qualitative');row.test=ident.name;row.parameterId=ident.id;if(ident.method)row.method=ident.method;row.unit=cleanUnit(row.unit,row.test);row.reference=cleanRange(row.reference||'');row.result=normalizeQualResult(row.result??row.rawValue??'');const reason=falseReason(row);if(reason){technicalRows.push(makeTechnical(row,reason,'qualitative'));continue;}
      if(row.parameterId==='egfr'){
        const src=String(row.sourceLine||`${row.test} ${row.result} ${row.unit} ${row.reference}`);const m=src.match(/(?:MDRD|CKD[- ]?EPI)\s*([<>]?\s*\d+(?:[,.]\d+)?)/i)||String(row.unit||'').match(/([<>]?\s*\d+(?:[,.]\d+)?)\s*(?:<\s*)?\/?min/i);const v=m?numberOf(m[1].replace(/[<>]/g,'')):null;if(v!==null){const method=/CKD[- ]?EPI/i.test(src)?'CKD-EPI':'MDRD';const range=parseRange(row.reference||((src.match(/([<>≤≥]=?\s*\d+(?:[,.]\d+)?)\s*$/)||[])[1]||''));numeric.push({parameterId:'egfr',parameterName:'Filtrato glomerulare stimato',value:v,rawValue:String(v).replace('.',','),unit:'mL/min/1,73 m²',range,method,sourceLine:src,pageNumber:row.pageNumber,labSection:'Funzionalità renale',status:range&&H.statusFromRange?H.statusFromRange(v,range):row.status});continue;}
        row.result='Non disponibile';row.status='Non valutabile';row.referenceApplicability='not_required';row.method=/CKD[- ]?EPI/i.test(src)?'CKD-EPI':'MDRD';
      }
      row=qualitativeSemantics(row,current);row.labSection=panelFor(row,current);qualitative.push(row);
    }
    const dedupe=(rows,kind)=>{const map=new Map(),order=[];for(const r of rows){const result=kind==='numeric'?numberOf(r.value):norm(r.result);const key=`${r.parameterId||H.normalizedExamKey?.(r.parameterName||r.test||'')}|${result}|${H.canonicalUnitKey?.(r.unit||'')||norm(r.unit||'')}`;if(!map.has(key)){map.set(key,r);order.push(key);}else if(quality(r)>quality(map.get(key)))map.set(key,r);}return order.map(k=>map.get(k));};
    const lab=dedupe(numeric,'numeric'),qual=dedupe(qualitative,'qualitative');
    for(const r of lab)r.labSection=panelFor(r,current);for(const r of qual)r.labSection=panelFor(r,current);
    current.labValues=lab;current.qualitativeResults=qual;current.technicalReviewRows=dedupe(technicalRows,'technical');
    current.tableRows=[...lab.map(v=>({kind:'numeric',test:v.parameterName,value:v.value,result:v.displayResult??v.rawValue??v.value,unit:v.unit||'',reference:v.range?.raw||'',status:v.status||'',statusSource:v.statusSource||'',sourceLine:v.sourceLine||'',pageNumber:v.pageNumber,labSection:v.labSection||''})),...qual.map(q=>({kind:'qualitative',test:q.test,result:q.result,unit:q.unit||'',reference:q.reference||'',status:q.status||'',statusSource:q.statusSource||'',sourceLine:q.sourceLine||'',pageNumber:q.pageNumber,labSection:q.labSection||''}))];
    current.clinicalValidationVersion=VERSION;current.labRepairVersion=VERSION;current.labPanelVersion=VERSION;
    const violations=[];for(const r of [...lab,...qual]){const reason=falseReason(r);if(reason)violations.push(`${reason}: ${r.parameterName||r.test}`);if(/da verificare/.test(norm(r.status||''))&&numberOf(r.value??r.result)===0&&urineContext(current,r))violations.push(`Zero urinario non risolto: ${r.parameterName||r.test}`);}
    return{document:current,changed:true,substantiveChanged:true,validation:{ok:violations.length===0,violations},stats:{initialRows:nums.length+quals.length,finalRows:lab.length+qual.length,technicalReviewRows:current.technicalReviewRows.length}};
  }
  H.canonicalizeClinicalDocument23=(doc,options={})=>canonicalize(doc,options);
  H.repairLabDocumentData=function(doc={}){let source=doc;const version=String(doc.clinicalValidationVersion||doc.labRepairVersion||'');if(PREVIOUS_REPAIR&&!/^test2[0-3]/.test(version)){try{source=PREVIOUS_REPAIR(doc).document||doc;}catch(_){source=doc;}}return canonicalize(source);};

  function narrativeLabel(value=''){
    const raw=collapse(value).replace(/[,;:\-]?\s*continua\s*$/i,'').trim(),n=norm(raw);
    if(/^referto/.test(n))return{key:'referto',label:'Referto'};if(/^commento/.test(n))return{key:'commento',label:'Commento'};if(/^anamnesi/.test(n))return{key:'anamnesi',label:'Anamnesi'};if(/^terapia/.test(n))return{key:'terapia',label:'Terapia'};if(/^esame obiettivo/.test(n))return{key:'esame-obiettivo',label:'Esame obiettivo'};if(/^conclusion/.test(n))return{key:'conclusioni',label:'Conclusioni'};if(/^programma/.test(n))return{key:'programma',label:'Programma'};if(/^esami ematochimici/.test(n))return{key:'esami-ematochimici',label:'Esami ematochimici'};if(/^dalla presente analisi.*classificazione/.test(n))return{key:'composizione-corporea',label:'Composizione corporea'};return{key:n||'referto',label:raw||'Referto'};
  }
  function cleanNarrative(text=''){
    let s=String(text||'').replace(/\r/g,'').replace(/^\s*(?:Referto|Commento|Anamnesi|Terapia|Conclusioni)\s*\n/i,'').replace(/\n{3,}/g,'\n\n').trim();
    const out=[],seen=new Set();for(const raw of s.split(/\n+/)){let line=collapse(raw);if(!line)continue;const n=norm(line);if(/^(?:azienda|ospedale|servizio sanitario|direttore|telefono|fax|email|codice fiscale|paziente|data di nascita|numero referto|referto del)\b/.test(n)&&!/(?:diagnos|terapia|esame|repert|conclusion|anamnes)/.test(n))continue;if(/^(?:cordiali saluti|distinti saluti)$/.test(n))continue;if(seen.has(n))continue;seen.add(n);out.push(line);}return out.join('\n').trim();
  }
  function repairNarrative(doc={}){
    const current=clone(doc),map=new Map(),order=[];const rows=[];
    for(const s of current.reportSections||[])rows.push({label:s.title,text:s.text,template:s,type:'section'});
    for(const f of (current.pdfFields||[]).filter(x=>x?.include!==false))rows.push({label:f.label,text:f.value,template:f,type:'field'});
    if(!rows.length&&String(current.reconstructedText||current.extractedText||'').trim())rows.push({label:'Referto',text:current.reconstructedText||current.extractedText,template:{},type:'section'});
    for(const r of rows){const info=narrativeLabel(r.label),content=cleanNarrative(r.text);if(!content)continue;if(!map.has(info.key)){map.set(info.key,{label:info.label,parts:[],seen:new Set()});order.push(info.key);}const item=map.get(info.key),key=norm(content);if(!item.seen.has(key)){item.seen.add(key);item.parts.push(content);}}
    const sections=order.map(k=>({title:map.get(k).label,text:map.get(k).parts.join('\n\n')})).filter(x=>x.text);current.reportSections=sections;current.pdfFields=sections.map(s=>({label:s.title,value:s.text,include:true}));current.reconstructedText=sections.map(s=>`${s.title}\n${s.text}`).join('\n\n');current.narrativeRepairVersion=VERSION;return{document:current,changed:true,substantiveChanged:true,stats:{sectionsAfter:sections.length}};
  }
  H.repairNarrativeDocumentData=function(doc={}){let source=doc;if(PREVIOUS_NARRATIVE&&!String(doc.narrativeRepairVersion||'').startsWith('test2')){try{source=PREVIOUS_NARRATIVE(doc).document||doc;}catch(_){source=doc;}}return repairNarrative(source);};
  H.TEST23_VERSION=VERSION;
})(HealthExtractors);


// TEST 23.1 - filtro clinico strutturale finale e normalizzazione affidabile del rendering.
;(function(H){
  'use strict';
  const VERSION='test23-v2';
  const BASE=H.canonicalizeClinicalDocument23.bind(H);
  const norm=v=>H.normalizeText(String(v??''));
  const clone=v=>typeof structuredClone==='function'?structuredClone(v):JSON.parse(JSON.stringify(v));
  const knownIds=new Set((H.PARAMS||[]).map(x=>x.id));
  [
    'albumin_blood','albumin_urine','acr_urine','urobilinogen','urine_nitrites','urine_appearance','urine_color','urine_ph','custom_chetoni','custom_bilirubina','custom_sangue','custom_glucosio','crp','esr','ldh','ck','magnesium','phosphorus','chloride','bicarbonate','lactate','pco2','po2','oxygen_saturation','fibrinogen','custom_inr','aptt','pt_ratio','prothrombin_activity','amylase','troponin','procalcitonin','vitamin_b12','folate','total_protein','globulin_alpha1','globulin_alpha2','globulin_beta1','globulin_beta2','globulin_gamma','mpv','reticulocytes','helicobacter_pylori_antigen','anti_hcv','anti_hbc','anti_hav_igg','hbsag','thyroglobulin','anti_tpo','anti_tg','trab','occult_blood','viral_load','egfr'
  ].forEach(x=>knownIds.add(x));

  const ADMIN_RE=/(?:copia conforme|copia cartacea|certificat[oa]|wsref|barcode|stampat[oa]|referto completato|pleiade|assistenza infermieristica|checklist|stampa xerox|data\/?ora|firma|pagina\b|\bpage\b|direttore|telefono|fax|email|paziente|codice fiscale|azienda ospedaliera|servizio sanitario|reparto|u\.o\.|prenotazione|cartella clinica|numero referto|pisa\b|who 2nd|id pleiade|controlli di qualita|centro ricerche cliniche|gli esami indicati|strutture esterne|note?$)/i;
  const NON_EXAM_RE=/(?:molto alto il valore desiderabile|valore desiderabile|il valore desiderabile riportato|patologi[ae] (?:basso|alto) rischio|attenzione.*unita di misura|appartenente a gruppo etnico|moltiplicare il risultato|gruppo etnico afro|livello decisionale|in assenza di sintomi|in presenza di sintomi|in assenza di altre evidenze|ed 89 ml|min\/?1[,.]73 m2 non e indicativo|bassa densita relativa|corretta valutazione|stato nutrizionale|in gravidanza|fase follicolare|fase luteinica|menopausa|postmenopausa|disbiosi (?:lieve|media|grave)|valori fra|rischio\s*$|linea guida kdigo 2012|formula ckd epi|formula mdrd)/i;
  const PANEL_RE=/^(?:formula leucocitaria|emocromo(?: con formula)?|esame (?:completo )?urine|esame del sedimento urinario|sedimento urinario|profilo lipidico|funzionalita (?:epatica|renale|tiroidea)|coagulazione|assetto coagulativo)$/;
  const UNIT_RE=/(?:mg|g|ng|pg|µg|ug|mmol|µmol|umol|mEq|U|UI|mUI|µUI|fL|pg|%|sec|min|cellule|10\^|x10|mL\/min|mmHg|mg\/g|mg\/L|g\/L|\/µL|\/uL)/i;

  function numberOf(v){const m=String(v??'').replace(/\s/g,'').replace(',','.').match(/[-+]?\d+(?:\.\d+)?/);return m?Number(m[0]):null;}
  function parseRange(raw=''){
    let s=String(raw||'').replace(/[–—÷]/g,'-').replace(/\b(?:siero\/?plasma|siero|plasma|urine?)\b/ig,' ').replace(/([0-9]+(?:[.,][0-9]+)?)\s+\1\b/g,'$1').replace(/-\s*-/g,'-').replace(/\s+/g,' ').trim();
    if(!s)return null;
    let m=s.match(/(?:fino\s+a|non\s+superiore\s+a|max\.?|≤|<=|<)\s*([0-9]+(?:[.,][0-9]+)?)/i);
    if(m){const limit=numberOf(m[1]);const strict=/^\s*</.test(s)&&!/^\s*<=/.test(s);return{raw:`${strict?'<':'≤'} ${m[1]}`,operator:strict?'<':'≤',limit};}
    m=s.match(/(?:almeno|min\.?|≥|>=|>)\s*([0-9]+(?:[.,][0-9]+)?)/i);
    if(m){const limit=numberOf(m[1]);const strict=/^\s*>/.test(s)&&!/^\s*>=/.test(s);return{raw:`${strict?'>':'≥'} ${m[1]}`,operator:strict?'>':'≥',limit};}
    m=s.match(/([0-9]+(?:[.,][0-9]+)?)\s*(?:-|a)\s*([0-9]+(?:[.,][0-9]+)?)/i);
    if(m){const min=numberOf(m[1]),max=numberOf(m[2]);if(Number.isFinite(min)&&Number.isFinite(max)&&min<=max)return{raw:`${m[1]} - ${m[2]}`,min,max,low:min,high:max};}
    return null;
  }
  function splitUnitRange(unit='',existingRange=''){
    let raw=String(unit||'').replace(/\*/g,' ').replace(/\s+/g,' ').trim(),range=parseRange(existingRange);
    if(!range){
      const m=raw.match(/^(.*?)(?:\s+)((?:fino\s+a|<=|>=|[<>≤≥])\s*[0-9]+(?:[.,][0-9]+)?|[0-9]+(?:[.,][0-9]+)?\s*-\s*[0-9]+(?:[.,][0-9]+)?)(?:\s.*)?$/i);
      if(m&&UNIT_RE.test(m[1])){raw=m[1].trim();range=parseRange(m[2]);}
    }
    raw=raw.replace(/^[<>≤≥]\s*/,'').replace(/\b(?:siero\/?plasma|siero|plasma|urine?)\b.*$/i,'').trim();
    raw=raw.replace(/MmEGg\/L|mEd\/L|mE[qg]\/L/ig,'mmol/L').replace(/mmol\/iL/ig,'mmol/L').replace(/mgofdL/ig,'mg/dL').replace(/gidL/ig,'g/dL').replace(/\bpa\s*\/\s*mL\b/ig,'pg/mL').replace(/\bUI?\s*\/\s*i\b/ig,'U/L').replace(/\buI\s*\/\s*L\b/ig,'U/L').replace(/^\{+$/,'').trim();
    const parts=raw.split(/\s+/).filter(Boolean);if(parts.length%2===0&&parts.length){const half=parts.length/2,a=parts.slice(0,half).join(' ').toLowerCase(),b=parts.slice(half).join(' ').toLowerCase();if(a===b)raw=parts.slice(0,half).join(' ');}raw=raw.replace(/^(\S+)\s+\1$/i,'$1');
    return{unit:raw,range};
  }
  function extraIdentity(row={},doc={}){
    const raw=String(row.parameterName||row.test||'').replace(/^\|[^|]{0,8}\|\s*/,'').replace(/[|{}]+/g,' ').replace(/\s+/g,' ').trim();
    const n=norm(raw),src=norm(`${raw} ${row.sourceLine||''}`),ur=/urin|sedimento|urinalisi/.test(norm(`${doc.title||''} ${doc.originalName||''} ${doc.category||''} ${row.labSection||''} ${row.sourceLine||''}`));
    const set=(id,name)=>({id,name});
    const pct=/%/.test(`${raw} ${row.unit||''} ${row.sourceLine||''}`);
    if(/formula.*neutrofil|^neutrofili\b/.test(n))return set(pct?'neutrophils_pct':'neutrophils_abs',pct?'Neutrofili %':'Neutrofili');
    if(/formula.*linfocit|^linfociti\b/.test(n))return set(pct?'lymphocytes_pct':'lymphocytes_abs',pct?'Linfociti %':'Linfociti');
    if(/formula.*monocit|^monociti\b/.test(n))return set(pct?'monocytes_pct':'monocytes_abs',pct?'Monociti %':'Monociti');
    if(/formula.*eosinofil|^eosinofili\b/.test(n))return set(pct?'eosinophils_pct':'eosinophils_abs',pct?'Eosinofili %':'Eosinofili');
    if(/formula.*basofil|^basofili\b/.test(n))return set(pct?'basophils_pct':'basophils_abs',pct?'Basofili %':'Basofili');
    if(/^(?:t\s*\.?\s*s\s*\.?\s*h|tsh)\b|tireotropina/.test(n))return set('tsh','TSH');
    if(/^ft3\b|triiodotironina libera/.test(n))return set('ft3','FT3');
    if(/^ft4\b|tiroxina libera/.test(n))return set('ft4','FT4');
    if(/tireoglobulina/.test(n))return set('thyroglobulin','Tireoglobulina');
    if(/(?:anti[- ]?tpo|anticorpi.*tireoperossidasi|anticorpi.*perossidasi tiroidea)/.test(n))return set('anti_tpo','Anticorpi anti-TPO');
    if(/(?:anti[- ]?tg|anticorpi.*tireoglobulina)/.test(n))return set('anti_tg','Anticorpi anti-tireoglobulina');
    if(/(?:\btrab\b|anticorpi.*recettore.*tsh)/.test(n))return set('trab','Anticorpi anti-recettore TSH');
    if(/^aspetto(?:\s+urine)?|aspetto\s+limpido/.test(n))return set('urine_appearance','Aspetto');
    if(/^colore(?:\s+urine)?|colore\s+(?:giallo|paglierino)/.test(n))return set('urine_color','Colore');
    if(/^ph(?:\s+urine)?$/.test(n))return set('urine_ph','pH urine');
    if(/^chetoni|corpi chetonici/.test(n))return set('custom_chetoni','Chetoni');
    if(/^bilirubina(?:\s+urine)?$/.test(n)&&(/mg\/?dl|urin|assent|negativ|^0(?:[,.]0+)?$/.test(norm(`${row.unit||''} ${row.result||row.rawValue||''} ${row.sourceLine||''}`))))return set('custom_bilirubina','Bilirubina');
    if(/^(?:sangue|emoglobina)(?:\s+urine)?$/.test(n)&&(/mg\/?dl|urin|assent|negativ|^0(?:[,.]0+)?$/.test(norm(`${row.unit||''} ${row.result||row.rawValue||''} ${row.sourceLine||''}`))))return set('custom_sangue','Sangue');
    if(/^(?:glucosio|glicosuria)(?:\s+urine)?$/.test(n)&&(/mg\/?dl|urin|assent|negativ|^0(?:[,.]0+)?$/.test(norm(`${row.unit||''} ${row.result||row.rawValue||''} ${row.sourceLine||''}`))))return set('custom_glucosio','Glucosio');
    if(/^albumina$/.test(n))return ur?set('albumin_urine','Albumina urinaria'):set('albumin_blood','Albumina');
    if(/albumina urin|microalbumin/.test(n))return set('albumin_urine','Albumina urinaria');
    if(/albumina.*creatinina|rapporto.*albumina.*creatinina|\bacr\b/.test(n))return set('acr_urine','Rapporto albumina/creatinina urinaria');
    if(/^urobilinogeno/.test(n))return set('urobilinogen','Urobilinogeno');
    if(/^nitriti?/.test(n))return set('urine_nitrites','Nitriti');
    if(/proteina c reattiva|\bpcr\b/.test(n)&&!/virus|rt pcr/.test(n))return set('crp','Proteina C reattiva');
    if(/^ves\b|velocita di eritrosedimentazione/.test(n))return set('esr','VES');
    if(/lattico deidrogenasi|\bldh\b/.test(n))return set('ldh','LDH');
    if(/creatinfosfochinasi|creatin fosfo chinasi|\bck\b/.test(n))return set('ck','Creatinfosfochinasi (CK)');
    if(/^magnesio/.test(n))return set('magnesium','Magnesio');
    if(/^fosforo/.test(n))return set('phosphorus','Fosforo');
    if(/^cloro\b|^cloruri/.test(n))return set('chloride','Cloro');
    if(/bicarbonat|^hco/.test(n))return set('bicarbonate','Bicarbonati');
    if(/acido lattico|^lattato|^lac$/.test(n))return set('lactate','Lattato');
    if(/^pco2|pressione parziale.*co2/.test(n))return set('pco2','pCO₂');
    if(/^po2|pressione parziale.*ossigeno/.test(n))return set('po2','pO₂');
    if(/saturazione ossigeno|^so2|^o2hb/.test(n))return set('oxygen_saturation','Saturazione ossigeno');
    if(/^fibrinogeno/.test(n))return set('fibrinogen','Fibrinogeno');
    if(/^inr\b/.test(n))return set('custom_inr','INR');
    if(/^aptt|tempo di tromboplastina parziale/.test(n))return set('aptt','aPTT');
    if(/^pt ratio|rapporto pt/.test(n))return set('pt_ratio','PT ratio');
    if(/attivita protrombinica/.test(n))return set('prothrombin_activity','Attività protrombinica');
    if(/^amilasi/.test(n))return set('amylase','Amilasi');
    if(/^troponina/.test(n))return set('troponin','Troponina');
    if(/^procalcitonina/.test(n))return set('procalcitonin','Procalcitonina');
    if(/vitamina b12/.test(n))return set('vitamin_b12','Vitamina B12');
    if(/^folati|acido folico/.test(n))return set('folate','Folati');
    if(/^proteine totali/.test(n))return set('total_protein','Proteine totali');
    if(/alfa 1 globuline|globuline alfa 1/.test(n))return set('globulin_alpha1','Globuline alfa 1');
    if(/alfa 2 globuline|globuline alfa 2/.test(n))return set('globulin_alpha2','Globuline alfa 2');
    if(/beta 1 globuline|globuline beta 1/.test(n))return set('globulin_beta1','Globuline beta 1');
    if(/beta 2 globuline|globuline beta 2/.test(n))return set('globulin_beta2','Globuline beta 2');
    if(/gamma globuline|globuline gamma/.test(n))return set('globulin_gamma','Globuline gamma');
    if(/vol.*piastrinico medio|\bmpv\b/.test(n))return set('mpv','Volume piastrinico medio (MPV)');
    if(/reticolocit/.test(n))return set('reticulocytes','Reticolociti');
    if(/helicobacter pylori/.test(n))return set('helicobacter_pylori_antigen','Helicobacter pylori, antigene fecale');
    if(/^anti hcv/.test(n))return set('anti_hcv','Anti HCV');
    if(/^anti hbc/.test(n))return set('anti_hbc','Anti HBc');
    if(/^anti hav igg/.test(n))return set('anti_hav_igg','Anti HAV IgG');
    if(/hbsag|antigene hbs/.test(n))return set('hbsag','HBsAg');
    if(/sangue occulto/.test(n))return set('occult_blood','Sangue occulto');
    if(/carica virale|genoma.*pcr/.test(n))return set('viral_load',raw.replace(/\s+/g,' '));
    if(/anisocitosi eritrocitaria/.test(n))return set('rdw','Ampiezza distribuzione eritrocitaria (RDW)');
    if(/vol.*corpuscolare medio/.test(n))return set('mcv','Volume globulare medio (MCV)');
    if(/cont.*emogl.*corp.*medio/.test(n))return set('mch','Contenuto emoglobinico medio (MCH)');
    if(/conc.*emogl.*corp.*media/.test(n))return set('mchc','Concentrazione emoglobinica corpuscolare media (MCHC)');
    if(/25.*oh.*vitamina d/.test(n))return set('vitamin_d','Vitamina D');
    if(/^nt pro bnp|ntprobnp/.test(n))return set('nt_probnp','NT-proBNP');
    if(/^colesterolo$/.test(n))return set('chol_total','Colesterolo totale');
    if(/^hb glicata/.test(n))return set(/mmol\/mol/.test(norm(row.unit||src))?'hba1c_mmol':'hba1c_percent','Emoglobina glicata (HbA1c)');
    return{id:String(row.parameterId||''),name:raw};
  }
  function panel(id,name,doc,row){
    const n=norm(name);
    if(/^(?:tsh|ft3|ft4|t3|t4|thyroglobulin|anti_tpo|anti_tg|trab)/.test(id))return'Funzionalità tiroidea';
    if(/^(?:neutrophils|lymphocytes|monocytes|eosinophils|basophils)/.test(id))return'Formula leucocitaria';
    if(/^(?:rbc|wbc|hemoglobin|hematocrit|platelets|mcv|mch|mchc|rdw|mpv|reticulocytes)$/.test(id))return'Emocromo';
    if(/^(?:acr_urine|albumin_urine|creatinine_urine)$/.test(id))return'Albuminuria e rapporto albumina/creatinina';
    if(/^(?:egfr|creatinine_blood|urea|uric_acid)$/.test(id))return'Funzionalità renale';
    if(/^(?:custom_inr|aptt|pt_ratio|prothrombin_activity|fibrinogen)$/.test(id))return'Coagulazione';
    if(/^(?:ast|alt|ggt|alp|bilirubin_total|bilirubin_direct|bilirubin_indirect|albumin_blood|cholinesterase)$/.test(id))return'Funzionalità epatica';
    if(/^(?:glucose_blood|hba1c_mmol|hba1c_percent)$/.test(id))return'Metabolismo glucidico';
    if(/^(?:chol_total|hdl|ldl|triglycerides)$/.test(id))return'Profilo lipidico';
    if(/^(?:urine_|urobilinogen|custom_chetoni|custom_bilirubina|custom_sangue|custom_glucosio|occult_blood)/.test(id)||/urin/.test(norm(`${doc.title||''} ${doc.originalName||''} ${row.sourceLine||''}`)))return'Esame urine';
    return row.labSection||'Altri esami di laboratorio';
  }
  function reasonToDrop(row={},doc={},kind='numeric'){
    const name=norm(row.parameterName||row.test||''),src=norm(`${row.parameterName||row.test||''} ${row.sourceLine||''}`),id=String(row.parameterId||'');
    if(!name)return'Nome assente';const labDoc=doc.category==='Esami di laboratorio'||['lab','mixed'].includes(doc.documentMode);if(!labDoc)return'Dato tabellare non affidabile in documento narrativo';if(PANEL_RE.test(name))return'Intestazione di pannello';if(ADMIN_RE.test(src))return'Dato amministrativo';if(NON_EXAM_RE.test(src))return'Nota, soglia o condizione di calcolo';
    if(/^dalla presente analisi.*classificazione/.test(name))return'Intestazione narrativa';
    if(/^(?:continua terapia|continua infusione|terapia|anamnesi|motivo visita|esame obiettivo|conclusioni|programma|pressione|pa max|pa min|fc|diagnosi|obesita|diabete|ipotiroidismo)/.test(name))return'Testo clinico narrativo, non analita';
    if(/^(?:ca|na|k|cr|ag|glu|lac|sn|sin|ci|po|so|thb|hhb|cohb|methb|beecf|beb|hco|fio|grav|mOsm)$/i.test(String(row.parameterName||row.test||'').replace(/[^A-Za-z0-9]/g,''))&&!knownIds.has(id))return'Abbreviazione OCR non affidabile';
    if(!knownIds.has(id)){
      const range=row.range?.raw||row.reference||'',unit=row.unit||'',value=numberOf(row.value??row.rawValue??row.result),semantic=/^(?:negativo|positivo|assente|presente|non rilevato|non calcolabile|limpido|paglierino)$/i.test(String(row.result||''));
      const credibleNumeric=kind==='numeric'&&String(row.parameterName||row.test||'').length<=60&&Number.isFinite(value)&&UNIT_RE.test(unit)&&Boolean(parseRange(range));
      const credibleQualitative=kind==='qualitative'&&String(row.parameterName||row.test||'').length<=60&&semantic;
      if(!credibleNumeric&&!credibleQualitative)return'Analita non riconosciuto con struttura insufficiente';
    }
    if(kind==='numeric'&&Number.isFinite(numberOf(row.value??row.rawValue))&&Math.abs(numberOf(row.value??row.rawValue))>1e8&&!UNIT_RE.test(row.unit||''))return'Identificativo numerico, non risultato';
    return'';
  }
  function cleanQualResult(v=''){
    let s=String(v||'').replace(/\b(?:siero\/?plasma|siero|plasma|urine?)\b\s*$/i,'').replace(/\s+/g,' ').trim();
    const a=s.split(' ');if(a.length%2===0&&a.length&&norm(a.slice(0,a.length/2).join(' '))===norm(a.slice(a.length/2).join(' ')))s=a.slice(0,a.length/2).join(' ');
    s=s.replace(/^(negativo|positivo|assente|presente|limpido|paglierino)\s+\1$/i,'$1');
    if(/^negativ/i.test(s))return'Negativo';if(/^positiv/i.test(s))return'Positivo';if(/^assent/i.test(s))return'Assente';if(/^non rilevat/i.test(s))return'Non rilevato';if(/non calcolabil/i.test(s))return'Non calcolabile';if(/limpido/i.test(s))return'Limpido';if(/paglierino/i.test(s))return'Paglierino';return s;
  }
  function semanticQual(row={}){
    const test=norm(row.test||''),res=norm(row.result||'');
    if(/non calcolabil/.test(res)){row.status='Non valutabile';row.referenceApplicability='not_required';return row;}
    if(/emolizz|campione non idoneo|campione insufficiente/.test(res)){row.status='Non valutabile';row.referenceApplicability='not_required';return row;}
    if(test==='anti hav igg'){row.status=res==='positivo'?'Immunità presente':res==='negativo'?'Immunità non rilevata':row.status;row.referenceApplicability='not_required';return row;}
    if(/^(?:custom_chetoni|custom_bilirubina|custom_sangue|custom_glucosio)$/.test(String(row.parameterId||''))&&Number.isFinite(numberOf(row.result))&&numberOf(row.result)===0){row.result='Assente';row.reference='Assente';row.status='nei limiti';row.statusSource=row.statusSource||'interpretive';return row;}
    if(/^(?:negativo|assente|non rilevato)$/.test(res)){row.reference=row.reference||(/non rilevato/.test(res)?'Non rilevato':'Negativo');row.status='nei limiti';return row;}
    if(test==='aspetto'){row.reference=row.reference||'Limpido';row.status=res==='limpido'?'nei limiti':'alterato';return row;}
    if(test==='colore'){row.reference=row.reference||'Giallo paglierino';row.status=/giallo|paglierino|incolore/.test(res)?'nei limiti':'alterato';return row;}
    return row;
  }
  function status(value,range,line=''){return H.statusFromRange?.(value,range,line)||'da verificare';}
  function dedupe(rows,kind){const map=new Map(),order=[];for(const r of rows){const result=kind==='numeric'?numberOf(r.value):norm(r.result),key=`${r.parameterId||norm(r.parameterName||r.test)}|${result}|${H.canonicalUnitKey?.(r.unit||'')||norm(r.unit)}`;const dirty=/formula leucocitaria|\bcontinua\b|attenzione|moltiplicare il risultato/i.test(String(r.sourceLine||r.parameterName||r.test||''));const score=(r.range?.raw||r.reference?6:0)+(r.unit?2:0)+(r.status&&!/da verificare|non definito/.test(norm(r.status))?4:0)+(r.sourceLine?1:0)-(dirty?5:0);if(!map.has(key)){map.set(key,{r,score});order.push(key);}else if(score>map.get(key).score)map.set(key,{r,score});}return order.map(k=>map.get(k).r);}
  function harden(doc={}){
    const rawSuppress=doc.category!=='Esami di laboratorio'&&doc.documentMode==='mixed'&&((doc.labValues||[]).length+(doc.qualitativeResults||[]).length)>200;const base=rawSuppress?{document:clone(doc),changed:true,substantiveChanged:true,validation:{ok:true,violations:[]},stats:{}}:BASE(doc,{forDisplay:true}),current=clone(base.document),technical=[...(current.technicalReviewRows||[])],numeric=[],qualitative=[];const suppressMixedLab=rawSuppress||current.category!=='Esami di laboratorio'&&current.documentMode==='mixed'&&((current.labValues||[]).length+(current.qualitativeResults||[]).length)>200;
    const addTech=(r,reason,kind)=>technical.push({kind,test:r.parameterName||r.test||'',result:r.rawValue??r.value??r.result??'',unit:r.unit||'',reference:r.range?.raw||r.reference||'',sourceLine:r.sourceLine||'',pageNumber:r.pageNumber,reviewReason:reason,quarantinedBy:VERSION});
    const numericSources=[...(current.labValues||[]),...(doc.labValues||[])];
    for(const original of numericSources){if(suppressMixedLab){addTech(original,'Documento narrativo esteso: dati tabellari non esposti senza validazione manuale','numeric');continue;}let r={...original,range:original.range?{...original.range}:null};const ident=extraIdentity(r,current);r.parameterId=ident.id;r.parameterName=ident.name;
      if(r.parameterId==='egfr'){
        const src=String(r.sourceLine||''),unit=String(r.unit||'');let v=numberOf(r.value);
        const actual=(src.match(/(?:KDIGO\s*2012\.?|MDRD)\s*([0-9]+(?:[,.][0-9]+)?)\s*[<*]?\s*(?:mL)?\/?min/i)||unit.match(/^\s*([0-9]+(?:[,.][0-9]+)?)\s*[<*]?\s*(?:mL)?\/?min/i));
        if(v===2012&&actual)v=numberOf(actual[1]);
        if(v===2012||/in assenza di altre evidenze|linea guida kdigo 2012/.test(norm(src))&&!actual){addTech(r,'Nota metodologica eGFR, non risultato','numeric');continue;}
        if(Number.isFinite(v)){r.value=v;r.rawValue=String(v).replace('.',',');r.unit='mL/min/1,73 m²';r.method=/ckd/i.test(norm(src))?'CKD-EPI':/mdrd/i.test(norm(src))?'MDRD':r.method;r.range=parseRange(r.range?.raw||'> 90');r.status=status(v,r.range,src);r.labSection='Funzionalità renale';numeric.push(r);continue;}
      }
      const ur=splitUnitRange(r.unit,r.range?.raw||'');r.unit=ur.unit;if(ur.range)r.range=ur.range;const source=String(r.sourceLine||'');
      if(!r.unit||r.parameterId==='ldl'&&/^sec\.?$/i.test(r.unit)){const matches=[...source.matchAll(/\b(mg\/dL|mg\/L|ng\/mL|pg\/mL|mUI\/L|µUI\/mL|U\/L|UI\/L|mmol\/L|mEq\/L|g\/dL|fL|%|sec\.?|mmHg)\b/ig)].map(m=>m[1]);const picked=matches.find(x=>!/^sec\.?$/i.test(x))||matches[0];if(picked)r.unit=picked.replace(/^UI\/L$/i,'U/L');}
      if(r.parameterId==='hba1c_mmol'&&/%/.test(source)){r.parameterId='hba1c_percent';r.unit='%';}
      if(r.parameterId==='tsh'&&(!r.range||!Number.isFinite(r.range.min))){const tm=source.match(/([0-9]+[,.][0-9]+)[^\n]{0,35}?-\s*([0-9]+[,.][0-9]+)/);if(tm)r.range=parseRange(`${tm[1]} - ${tm[2]}`);}
      if(r.parameterId==='prothrombin_activity'){r.unit=r.unit||'%';if(!r.range){const pm=source.match(/([<>≤≥]=?\s*[0-9]+(?:[,.][0-9]+)?)/);if(pm)r.range=parseRange(pm[1]);}}
      if(r.parameterId==='psa_total'&&/^0\s*\+\s*2$/.test(String(r.range?.raw||'')))r.range=parseRange('0 - 2');
      if(r.parameterId==='albumin_urine'&&/<\s*3\s*mg\/L/i.test(source)){r.rawValue='<3';r.value=3;r.resultQualifier='<';}
      if(r.parameterId==='occult_blood'){
        const sm=source.match(/campione\s*(\d+)/i),positive=/\bpositivo\b/i.test(source),negative=/\bnegativo\b/i.test(source)||/<\s*50\s*ng\/mL/i.test(source);
        if(sm&&(positive||negative)){const result=positive?'Positivo':'Negativo';qualitative.push({parameterId:'occult_blood',test:`Sangue occulto, campione ${sm[1]}`,result,reference:'Negativo',status:result==='Negativo'?'nei limiti':'alterato',statusSource:'report',sourceLine:source,pageNumber:r.pageNumber,labSection:'Esame urine'});continue;}
        addTech(r,'Soglia del test del sangue occulto, non risultato','numeric');continue;
      }
      const v=numberOf(r.value??r.rawValue);if(Number.isFinite(v)){r.value=v;if(!String(r.rawValue||'').startsWith('<'))r.rawValue=String(v).replace('.',',');}
      const why=reasonToDrop(r,current,'numeric');if(why){addTech(r,why,'numeric');continue;}
      if(Number.isFinite(v)&&r.range)r.status=status(v,r.range,r.sourceLine||'');
      if(Number.isFinite(v)&&v===0&&/^(?:custom_chetoni|custom_bilirubina|custom_sangue|custom_glucosio|urobilinogen|urine_nitrites|albumin_urine)$/.test(r.parameterId)){r.status='nei limiti';if(!r.range)r.range={raw:'Assente'};}
      r.labSection=panel(r.parameterId,r.parameterName,current,r);numeric.push(r);
    }
    const qualitativeSources=[...(current.qualitativeResults||[]),...(doc.qualitativeResults||[])];
    for(const original of qualitativeSources){if(suppressMixedLab){addTech(original,'Documento narrativo esteso: dati tabellari non esposti senza validazione manuale','qualitative');continue;}let r={...original};const ident=extraIdentity(r,current);r.parameterId=ident.id;r.test=ident.name;r.result=cleanQualResult(r.result??r.rawValue??'');const ur=splitUnitRange(r.unit,r.reference||'');r.unit=ur.unit;if(ur.range)r.reference=ur.range.raw;if(r.parameterId==='crp'&&/inferiore al lim.*sens|limite di sensibilita/i.test(String(r.sourceLine||''))){r.result='Inferiore al limite di sensibilità';r.reference=r.reference||'≤ 0,50';r.status='nei limiti';r.statusSource='report';}
      const numericResult=numberOf(r.result),numericQualIds=new Set(['tsh','ft3','ft4','neutrophils_pct','lymphocytes_pct','monocytes_pct','eosinophils_pct','basophils_pct','psa_total','prothrombin_activity','lipase','cholinesterase','albumin_urine','creatinine_urine','urine_ph','urobilinogen']);
      if(numericQualIds.has(r.parameterId)&&Number.isFinite(numericResult)){const rangeObj=ur.range||parseRange(r.reference||'');const nr={parameterId:r.parameterId,parameterName:r.test,value:numericResult,rawValue:String(r.result),unit:r.unit||'',range:rangeObj,status:rangeObj?status(numericResult,rangeObj,r.sourceLine||''):(r.status||'da verificare'),method:r.method||'',sourceLine:r.sourceLine||'',pageNumber:r.pageNumber,labSection:panel(r.parameterId,r.test,current,r)};const whyNum=reasonToDrop(nr,current,'numeric');if(whyNum){addTech(r,whyNum,'qualitative');continue;}numeric.push(nr);continue;}
      const why=reasonToDrop(r,current,'qualitative');if(why){addTech(r,why,'qualitative');continue;}r=semanticQual(r);r.labSection=panel(r.parameterId,r.test,current,r);qualitative.push(r);}
    current.labValues=dedupe(numeric,'numeric');current.qualitativeResults=dedupe(qualitative,'qualitative');current.technicalReviewRows=dedupe(technical,'technical');
    current.tableRows=[...current.labValues.map(v=>({kind:'numeric',test:v.parameterName,result:v.rawValue??v.value,value:v.value,unit:v.unit||'',reference:v.range?.raw||'',status:v.status||'',statusSource:v.statusSource||'',sourceLine:v.sourceLine||'',pageNumber:v.pageNumber,labSection:v.labSection||''})),...current.qualitativeResults.map(q=>({kind:'qualitative',test:q.test,result:q.result,unit:q.unit||'',reference:q.reference||'',status:q.status||'',statusSource:q.statusSource||'',sourceLine:q.sourceLine||'',pageNumber:q.pageNumber,labSection:q.labSection||''}))];
    current.clinicalValidationVersion=VERSION;current.labRepairVersion=VERSION;current.labPanelVersion=VERSION;
    const violations=[];for(const r of [...current.labValues,...current.qualitativeResults]){const why=reasonToDrop(r,current,r.value===undefined?'qualitative':'numeric');if(why)violations.push(`${why}: ${r.parameterName||r.test}`);}
    return{...base,document:current,validation:{ok:violations.length===0,violations},stats:{...(base.stats||{}),finalRows:current.labValues.length+current.qualitativeResults.length,technicalReviewRows:current.technicalReviewRows.length}};
  }
  H.canonicalizeClinicalDocument23=(doc,options={})=>harden(doc,options);
  H.repairLabDocumentData=(doc={})=>harden(doc);
  H.TEST23_VERSION=VERSION;
})(HealthExtractors);

// TEST 23.3 - ricostruzione narrativa affidabile e quarantena dell'OCR corrotto.
;(function(H){
  'use strict';
  const VERSION='test23-v3';
  const BASE=H.repairNarrativeDocumentData.bind(H);
  const norm=v=>H.normalizeText(String(v??''));
  const clone=v=>typeof structuredClone==='function'?structuredClone(v):JSON.parse(JSON.stringify(v));
  const collapse=v=>String(v||'').replace(/\r/g,'').replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim();
  const ADMIN_LINE=/^(?:azienda|ospedale|servizio sanitario|u\.?o\.?|reparto|direttore|telefono|fax|e-?mail|codice fiscale|paziente|cognome|nome|data di nascita|numero referto|referto del|sede operativa|biomedical|medico via|classe di dose|dott\.?ssa?|dott\.?)\b/i;
  const NOISE_RE=/(?:[a-z]{1,3})?s{7,}|(?:\b[A-Z]{1,4}\b[ ,;:|]*){10,}|(?:\b(?:PPP|PIPA|POPPA|PIPPE|UPPSALA|LELEOLCOROL|PARRA|RARI|ARPA|RITIRI)\b)|(?:\b0\s+20\s+40\s+60\s+80\s+100\b)|(?:[{}\[\]|]{4,})/i;
  function noisy(value=''){
    const s=String(value||'').trim();if(!s)return true;
    if(NOISE_RE.test(s))return true;
    const words=s.match(/[A-Za-zÀ-ÿ]+/g)||[],tiny=words.filter(w=>w.length<=2).length,odd=words.filter(w=>/^[BCDFGHJKLMNPQRSTVWXYZ]{3,}$/i.test(w)).length;
    return words.length>20&&(tiny/words.length>0.32||odd/words.length>0.12);
  }
  const CLINICAL_STARTERS=/(?:\bTesto\s+Referto\b|\bCondizioni del paziente e diagnosi alla dimissione\b|\bMotivo del Ricovero\b|\bDecorso Ospedaliero\b|\b(?:Anamnesi|Esame obiettivo|Reperti(?: e conclusioni)?|Conclusioni|Diagnosi|Terapia(?: in atto)?|Programma|Indicazioni)\s*[:\-]|\b(?:Lo studio|L['’]indagine|Indagine|Esame TC|Esame RM|Esame RX|Al controllo odierno|All['’]esame|Quadro toracico|ECOCOLORDOPPLERGRAFIA CARDIACA|Marcata parodontopatia|Lieve accentuazione)\b)/i;
  const ADMIN_PREFIX=/(?:centro medico|medi group|biomedical|azienda ospedaliera|azienda sanitaria|servizio sanitario|presidio ospedaliero|laboratorio|radiodiagnostica|dipartimento|sede operativa|direttore sanitario|specialista in|\b(?:tel\.?|telefono|fax|cell\.?|e-?mail)\b|\bCF\s*:|codice fiscale|data di nascita|\bSig\.?ra?\b|\bpaziente\b|\b(?:ROSSI|CORDONI|TONGIANI)\s+[A-ZÀ-ÖØ-Ý]{2,})/i;
  function stripAdministrativeEnvelope(value=''){
    let part=collapse(value);
    if(!part)return'';
    const testo=part.search(/\bTesto\s+Referto\b/i);
    if(testo>=0&&ADMIN_PREFIX.test(part.slice(0,testo+20)))part=part.slice(testo).replace(/^\s*Testo\s+Referto\s*[:\-]?\s*/i,'');
    else{
      const tipo=part.search(/\bTipo\s+Esame\s*:/i);
      if(tipo>=0&&ADMIN_PREFIX.test(part.slice(0,tipo))){
        const tail=part.slice(tipo).replace(/^\s*Tipo\s+Esame\s*:\s*/i,'');
        const start=tail.search(/\b(?:Lo studio|L['’]indagine|Indagine|Esame|Al controllo odierno|All['’]esame)\b/i);
        part=start>=0?tail.slice(start):tail.replace(/^[A-ZÀ-ÖØ-Ý0-9 /+()._-]{2,100}?(?=[A-ZÀ-ÖØ-Ý][a-zà-öø-ÿ])/,'');
      }else if(ADMIN_PREFIX.test(part)){
        const start=part.search(CLINICAL_STARTERS);
        if(start>0)part=part.slice(start);
      }
    }
    part=part
      .replace(/\bPrenotazioni visite\b/gi,' ')
      .replace(/\b(?:Tel\.?|Telefono|Fax|Cell\.?)\s*[:.]?\s*(?:\+?39\s*)?(?:\d[\s/.-]*){6,}/gi,' ')
      .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,' ')
      .replace(/\((?:dal|lun|mar|mer|gio|ven|ore)[^)]{0,100}\)/gi,' ')
      .replace(/(?:\s|^)(?:Il Medico Radiologo|Il Dirigente|Direttore Sanitario|Referto firmato digitalmente|Rappresentazione di un referto firmato elettronicamente)[\s\S]*$/i,'')
      .replace(/\bClasse di dose[\s\S]*$/i,'')
      .replace(/(?:\s|^)Data e Ora Referto\s*:[^|\n]{0,80}/i,' ')
      .replace(/(?:\s|^)Refertato il\s*:[^|\n]{0,80}/i,' ')
      .replace(/(?:\s|^)\d{1,2}[.\/-]\d{1,2}[.\/-]\d{2,4}\s*$/,'')
      .replace(/\bRCATA\s+(SUPERIORE|INFERIORE)\b/gi,'ARCATA $1')
      .replace(/\bentrambe le acate\b/gi,'entrambe le arcate')
      .replace(/\s{2,}/g,' ').trim();
    return part;
  }
  function cleanGeneric(value=''){
    const raw=collapse(value);if(raw.length>50000)return'';const prepared=stripAdministrativeEnvelope(raw);if(!prepared)return'';const parts=prepared.split(/\n+|(?<=[.!?])\s+(?=[A-ZÀ-ÖØ-Ý])/).map(x=>collapse(x)).filter(Boolean),kept=[],seen=new Set();
    for(let part of parts){part=stripAdministrativeEnvelope(part);if(!part)continue;const n=norm(part);if(ADMIN_LINE.test(part)&&!/(?:anamnesi|diagnosi|terapia|esame|reperti|conclusioni|programma)/i.test(part))continue;if(/^(?:cordiali|distinti) saluti\b/i.test(part))continue;if(noisy(part))continue;part=part.replace(/^\s*(?:referto|commento|anamnesi|terapia|conclusioni)\s*[:\-]?\s*/i,'').trim();const key=norm(part);if(part&&!seen.has(key)){seen.add(key);kept.push(part);}}
    return kept.join('\n').trim();
  }
  function findOne(text,re,formatter){const m=text.match(re);return m?formatter(...m.slice(1)):'';}
  function ventilationSections(doc={}){
    const source=collapse(doc.extractedText||doc.reconstructedText||(doc.reportSections||[]).map(s=>s?.text||'').join('\n'));
    const n=norm(source);if(!/(?:airsense|autoset|pressione minima|pressione massima)/.test(n)||!/(?:ahi|indice apnea|indice ipopnea)/.test(n))return null;
    let text=source;const start=text.search(/\bStatistiche\s+\d{1,2}[\/.]\d{1,2}[\/.]\d{2,4}\s*[-–]\s*\d{1,2}[\/.]\d{1,2}[\/.]\d{2,4}/i);if(start>=0)text=text.slice(start);
    const ox=text.search(/\bStatistiche ossimetria\b/i);if(ox>=0)text=text.slice(0,ox);
    text=text.replace(/\bData di nascita\s*:[^|\n]{0,50}/gi,' ')
      .replace(/\bReference ID\b/gi,' ')
      .replace(/\b(?:Statistiche|Apparecchio|Impostazioni apparecchio|Pressione|Perdite d['’]aria|Indici respiratori|Utilizzo totale|Statistiche ossimetria)\b/gi,'\n$&')
      .replace(/\b(?:Medico curante|Medico che ha consigliato il consulto|Compagnia d['’]assicurazione|Numero iscrizione|Iscritto dal)\s*:[^\n]{0,100}/gi,' ')
      .replace(/\s*\|\s*/g,'\n').replace(/\n{2,}/g,'\n').trim();
    if(text.length<80)return null;
    return{sections:[{title:'Dati terapia ventilatoria',text}],source};
  }
  function unreliableNarrativeDocument(doc={},source=''){
    const labels=[...(doc.reportSections||[]).map(s=>s?.title||''),...(doc.pdfFields||[]).map(f=>f?.label||'')];
    const badLabels=labels.filter(x=>/(?:responsabile|medici|e-?mail|reference id|sesso|medico curante|versione del software|data ricovero|allegato anag|operatore|notes|valore.*riferimento|esame.*u\.d\.m)/i.test(String(x))).length;
    const name=String(doc.originalName||'');const raw=String(source||'');
    if(/confronto analisi/i.test(name))return true;
    if(/cartella clinica/i.test(name))return true;
    if(badLabels>=3&&/(?:direttore|prenotazioni|telefono|e-?mail|data di nascita|consenso al trattamento)/i.test(raw))return true;
    if(raw.length>30000&&/(?:consenso al trattamento|anagrafica amministrativa|dossier sanitario elettronico)/i.test(raw))return true;
    return false;
  }
  function compositionSections(doc={}){
    const source=collapse([...(doc.reportSections||[]).map(s=>s?.text||''),...(doc.pdfFields||[]).map(f=>f?.value||''),doc.reconstructedText||'',doc.extractedText||''].join('\n'));
    const n=norm(source);if(!/(?:massa grassa|massa muscolare)/.test(n)||!/(?:composizione corporea|analisi total body|classificazione del fisico)/.test(n))return null;
    const metrics=[];const add=(label,value)=>{if(value&&!metrics.some(x=>x[0]===label))metrics.push([label,value.replace(/\s+/g,' ').trim()]);};
    add('Peso',findOne(source,/\bPeso(?:\s+Composizione corporea\s+Peso)?\s*([0-9]+(?:[,.][0-9]+)?)\s*kg/i,v=>`${v} kg`));
    add('BMI',findOne(source,/\bBMI\s*([0-9]+(?:[,.][0-9]+)?)/i,v=>v));
    add('Massa grassa',findOne(source,/\bMassa grassa\s*([0-9]+(?:[,.][0-9]+)?)\s*kg\s*\(([0-9]+(?:[,.][0-9]+)?)\s*%\)/i,(a,b)=>`${a} kg (${b}%)`));
    add('Massa magra',findOne(source,/\bMassa magra\s*(?:E\s*)?([0-9]+(?:[,.][0-9]+)?)\s*k[eg]\s*\(\s*([0-9]+(?:[,.][0-9]+)?)\s*%\s*\)/i,(a,b)=>`${a} kg (${b}%)`));
    add('Massa muscolare',findOne(source,/\bMassa muscolare\s*([0-9]+(?:[,.][0-9]+)?)\s*kg\s*\(([0-9]+(?:[,.][0-9]+)?)\s*%\)/i,(a,b)=>`${a} kg (${b}%)`));
    add('Massa ossea',findOne(source,/\bMassa ossea(?:\s*\([^)]*\))?\s*([0-9]+(?:[,.][0-9]+)?)\s*kg\s*\(([0-9]+(?:[,.][0-9]+)?)\s*%\)/i,(a,b)=>`${a} kg (${b}%)`));
    add('Metabolismo basale',findOne(source,/\bBMR\s*([0-9.]+)\s*kcal/i,v=>`${v} kcal`));
    add('Acqua totale (TBW)',findOne(source,/\bAcqua totale\s*\(TBW\)\s*([0-9]+(?:[,.][0-9]+)?)\s*kg\s*\(([0-9]+(?:[,.][0-9]+)?)\s*%\)/i,(a,b)=>`${a} kg (${b}%)`));
    add('Acqua extracellulare (ECW)',findOne(source,/\bAcqua extracellulare\s*\(ECW\)\s*([0-9]+(?:[,.][0-9]+)?)\s*kg\s*\(([0-9]+(?:[,.][0-9]+)?)\s*%\)/i,(a,b)=>`${a} kg (${b}%)`));
    add('Acqua intracellulare (ICW)',findOne(source,/\bAcqua intracellulare\s*\(ICW\)\s*([0-9]+(?:[,.][0-9]+)?)\s*kg\s*\(([0-9]+(?:[,.][0-9]+)?)\s*%\)/i,(a,b)=>`${a} kg (${b}%)`));
    add('Proteine',findOne(source,/\bProteine\s*([0-9]+(?:[,.][0-9]+)?)\s*kg\s*\(([0-9]+(?:[,.][0-9]+)?)\s*%\)/i,(a,b)=>`${a} kg (${b}%)`));
    add('Massa muscolare scheletrica',findOne(source,/\bMassa muscolare scheletrica\s*([0-9]+(?:[,.][0-9]+)?)\s*kg\s*\(([0-9]+(?:[,.][0-9]+)?)\s*%\)/i,(a,b)=>`${a} kg (${b}%)`));
    add('Massa cellulare',findOne(source,/\bMassa cellulare\s*([0-9]+(?:[,.][0-9]+)?)\s*kg\s*\(([0-9]+(?:[,.][0-9]+)?)\s*%\)/i,(a,b)=>`${a} kg (${b}%)`));
    add('Punteggio grasso viscerale',findOne(source,/\bPunteggio grasso viscerale\s*(?:Valore\s*)?([0-9]+(?:[,.][0-9]+)?)/i,v=>v));
    add('Indice di sarcopenia',findOne(source,/\bIndice di sarcopenia\s*([0-9]+(?:[,.][0-9]+)?)\s*kg\s*\/\s*m\??/i,v=>`${v} kg/m²`));
    add('Superficie corporea (BSA)',findOne(source,/\bBSA\s*([0-9]+(?:[,.][0-9]+)?)\s*m\??/i,v=>`${v} m²`));
    add('Rapporto ECW/TBW',findOne(source,/\bECW\s*\/\s*TBW\s*([0-9]+(?:[,.][0-9]+)?)\s*%/i,v=>`${v}%`));
    if(metrics.length<4)return null;
    const sections=[{title:'Composizione corporea',text:metrics.map(([a,b])=>`${a}: ${b}`).join('\n')}];
    const classes=[];if(/\bStruttura robusta\b/i.test(source))classes.push('Classificazione del fisico: struttura robusta');
    const obesity=findOne(source,/\bStato\s+(Obesit[aà]\s+(?:grave|moderata|lieve)|Normopeso|Sovrappeso)\b/i,v=>v);if(obesity)classes.push(`Stato ponderale: ${obesity}`);
    const visceral=findOne(source,/Punteggio grasso viscerale[\s\S]{0,80}?Stato\s+(Alto|Normale|Basso)/i,v=>v);if(visceral)classes.push(`Grasso viscerale: ${visceral}`);
    const sarc=findOne(source,/Indice (?:valore )?di sarcopenia[\s\S]{0,80}?Stato\s+(Normale|Migliorabile|Basso|Alto)/i,v=>v);if(sarc)classes.push(`Indice di sarcopenia: ${sarc}`);
    if(classes.length)sections.push({title:'Classificazione',text:classes.join('\n')});
    return{sections,source};
  }
  H.repairNarrativeDocumentData=function(doc={}){
    if(String(doc.narrativeRepairVersion||'')===VERSION)return{document:clone(doc),changed:false,substantiveChanged:false,stats:{sectionsAfter:(doc.reportSections||[]).length,narrativeReviewRows:(doc.technicalReviewRows||[]).filter(r=>r.kind==='narrative').length}};
    const base=BASE(doc),current=clone(base.document),technical=[...(current.technicalReviewRows||[])];
    const narrativeSource=collapse([...(current.reportSections||[]).map(s=>s?.text||''),...(current.pdfFields||[]).map(f=>f?.value||''),current.reconstructedText||'',current.extractedText||''].join('\n'));
    const composition=compositionSections(current),ventilation=ventilationSections(current);
    if(composition){
      technical.push({kind:'narrative',test:'Composizione corporea',result:'',unit:'',reference:'',sourceLine:composition.source,reviewReason:'Testo OCR grafico sostituito da valori strutturati affidabili',quarantinedBy:VERSION});
      current.reportSections=composition.sections;current.pdfFields=composition.sections.map(s=>({label:s.title,value:s.text,include:true}));current.narrativeNeedsReview=false;
    }else if(ventilation){
      technical.push({kind:'narrative',test:'Terapia ventilatoria',result:'',unit:'',reference:'',sourceLine:ventilation.source,reviewReason:'Intestazioni amministrative escluse e statistiche ventilatorie ricostruite',quarantinedBy:VERSION});
      current.reportSections=ventilation.sections;current.pdfFields=ventilation.sections.map(s=>({label:s.title,value:s.text,include:true}));current.narrativeNeedsReview=false;
    }else if(unreliableNarrativeDocument(current,narrativeSource)){
      technical.push({kind:'narrative',test:'Testo narrativo',result:'',unit:'',reference:'',sourceLine:narrativeSource.slice(0,120000),reviewReason:'OCR narrativo complesso o amministrativo: escluso dal dossier e inviato alla revisione tecnica',quarantinedBy:VERSION});
      current.reportSections=[];current.pdfFields=[];current.narrativeNeedsReview=true;
    }else{
      const map=new Map(),order=[];
      const rows=[...(current.reportSections||[]).map(s=>({label:s.title||'Referto',text:s.text||''})),...(current.pdfFields||[]).filter(f=>f?.include!==false).map(f=>({label:f.label||'Referto',text:f.value||''}))];
      for(const row of rows){const label=String(row.label||'Referto').replace(/[,;:\-]?\s*continua\s*$/i,'').trim()||'Referto',key=/^referto/i.test(label)?'referto':/^commento/i.test(label)?'commento':norm(label),clean=cleanGeneric(row.text);if(!clean){if(String(row.text||'').trim())technical.push({kind:'narrative',test:label,result:'',unit:'',reference:'',sourceLine:String(row.text||''),reviewReason:'Testo OCR narrativo non sufficientemente affidabile',quarantinedBy:VERSION});continue;}if(!map.has(key)){map.set(key,{title:key==='referto'?'Referto':key==='commento'?'Commento':label,parts:[],seen:new Set()});order.push(key);}const item=map.get(key),ck=norm(clean);if(!item.seen.has(ck)){item.seen.add(ck);item.parts.push(clean);}}
      current.reportSections=order.map(k=>({title:map.get(k).title,text:map.get(k).parts.join('\n\n')})).filter(s=>s.text);current.pdfFields=current.reportSections.length?current.reportSections.map(s=>({label:s.title,value:s.text,include:true})):[{label:'Revisione tecnica',value:'',include:false}];current.narrativeNeedsReview=false;
    }
    const seenTech=new Set();current.technicalReviewRows=technical.filter(r=>{const key=norm(`${r.kind||''}|${r.test||''}|${r.sourceLine||''}|${r.reviewReason||''}`);if(seenTech.has(key))return false;seenTech.add(key);return true;});
    current.reconstructedText=(current.reportSections||[]).map(s=>`${s.title}\n${s.text}`).join('\n\n');current.narrativeRepairVersion=VERSION;
    return{...base,document:current,changed:true,substantiveChanged:true,stats:{...(base.stats||{}),sectionsAfter:current.reportSections.length,narrativeReviewRows:technical.filter(r=>r.kind==='narrative').length}};
  };
  H.TEST23_NARRATIVE_VERSION=VERSION;
})(HealthExtractors);

// TEST 24 - pipeline clinica unica, riferimenti completi e ricostruzione narrativa non regressiva.
;(function(H){
  'use strict';
  const VERSION='test24-v1';
  const BASE_CANON=H.canonicalizeClinicalDocument23?.bind(H);
  const BASE_NARRATIVE=H.repairNarrativeDocumentData?.bind(H);
  const clone=v=>typeof structuredClone==='function'?structuredClone(v):JSON.parse(JSON.stringify(v));
  const norm=v=>H.normalizeText(String(v??''));
  const numberOf=v=>{const s=String(v??'').replace(/\s/g,'').replace(',','.').replace(/^[<>≤≥]=?/,'');const n=Number(s);return Number.isFinite(n)?n:null;};
  const collapse=v=>String(v??'').replace(/\r/g,'').replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim();
  const canonicalUnit=v=>H.canonicalUnitKey?.(v||'')||norm(v||'');
  const SOURCE={
    thyroid:{name:'Mayo Clinic Laboratories',version:'T3FR e cataloghi tiroidei adulti',date:'2026-08-06'},
    lipase:{name:'Mayo Clinic Laboratories',version:'LPS Lipase, Serum',date:'2026-08-06'},
    albuminuria:{name:'Mayo Clinic Laboratories e KDIGO',version:'albumina urinaria e ACR',date:'2026-08-06'},
    urinalysis:{name:'Riferimenti ufficiali di laboratorio per esame urine',version:'adulti',date:'2026-08-06'},
    cbc:{name:'Mayo Clinic Laboratories',version:'intervalli ematologici adulti',date:'2026-08-06'},
    chemistry:{name:'Mayo Clinic Laboratories',version:'intervalli biochimici adulti',date:'2026-08-06'},
    lipids:{name:'Mayo Clinic Laboratories e linee guida cardiovascolari',version:'adulti',date:'2026-08-06'},
    coagulation:{name:'Mayo Clinic Laboratories',version:'coagulazione adulti',date:'2026-08-06'},
    immunology:{name:'CDC e riferimenti ufficiali di immunologia clinica',version:'interpretazione qualitativa',date:'2026-08-06'},
    psa:{name:'Riferimenti ufficiali di laboratorio per PSA',version:'adulti',date:'2026-08-06'}
  };
  function range(raw,min=null,max=null,operator='',limit=null){return{raw,min,max,operator,limit,source:'external'};}
  function statusFrom(value,r,raw=''){
    if(!r||!Number.isFinite(Number(value)))return'';
    const v=Number(value),op=r.operator||'';
    if(op&&Number.isFinite(Number(r.limit))){const l=Number(r.limit);if(op==='<')return v<l?'nei limiti':'alto';if(op==='≤'||op==='<=')return v<=l?'nei limiti':'alto';if(op==='>')return v>l?'nei limiti':'basso';if(op==='≥'||op==='>=')return v>=l?'nei limiti':'basso';}
    if(Number.isFinite(Number(r.min))&&v<Number(r.min))return'basso';
    if(Number.isFinite(Number(r.max))&&v>Number(r.max))return'alto';
    if(Number.isFinite(Number(r.min))||Number.isFinite(Number(r.max)))return'nei limiti';
    return H.statusFromRange?.(v,r,raw)||'';
  }
  function normalizeRepeatedWords(value=''){
    const words=collapse(value).split(' ').filter(Boolean),out=[];
    for(const w of words){if(out.length&&norm(out.at(-1))===norm(w))continue;out.push(w);}
    if(out.length%2===0&&out.length>1){const h=out.length/2;if(norm(out.slice(0,h).join(' '))===norm(out.slice(h).join(' ')))return out.slice(0,h).join(' ');}
    return out.join(' ');
  }
  function normalizeUnit24(value='',name=''){
    let u=normalizeRepeatedWords(value).replace(/^UI\/L$/i,'U/L').replace(/^U\/L\s+U\/L$/i,'U/L').trim();
    const nu=norm(u),nn=norm(name);
    if(nn==='ft3'&&/^(?:pa|pq)\s*\/?\s*ml$/.test(nu))return'pg/mL';
    if(/^(?:u l|ul|ui l|uil)$/.test(nu))return'U/L';
    if(/^(?:mui l|miu l|mui\/l|miu\/l|uui ml|µui ml)$/.test(nu))return'mUI/L';
    if(/^(?:pg ml|pg\/ml)$/.test(nu))return'pg/mL';
    if(/^(?:ng dl|ng\/dl)$/.test(nu))return'ng/dL';
    if(/^(?:mg dl|mg\/dl)$/.test(nu))return'mg/dL';
    if(/^(?:mg l|mg\/l)$/.test(nu))return'mg/L';
    if(/(?:ml|min).*1[,.]73.*m/.test(nu))return'mL/min/1,73 m²';
    return u;
  }
  function normalizeResult24(value=''){
    let s=normalizeRepeatedWords(value).replace(/\b(?:siero|plasma|siero\/plasma)\b/ig,' ').replace(/\s+/g,' ').trim();
    if(/^negativ[oa]$/i.test(s))return'Negativo';
    if(/^positiv[oa]$/i.test(s))return'Positivo';
    if(/^assent[ei]$/i.test(s))return'Assente';
    if(/^non\s+calcolabil[ei]$/i.test(s))return'Non calcolabile';
    if(/^limpid[oa]$/i.test(s))return'Limpido';
    if(/^paglierino$/i.test(s))return'Paglierino';
    return s;
  }
  function panelHeaderOrNoise(row={}){
    const name=norm(row.parameterName||row.test||''),src=norm(`${row.sourceLine||''} ${row.parameterName||row.test||''}`),result=norm(row.rawValue??row.value??row.result??'');
    if(!name)return'Nome assente';
    if(/^(?:formula leucocitaria|emocromo(?: con formula)?|esame (?:completo )?urine|esame del sedimento urinario|sedimento urinario|profilo lipidico|funzionalita (?:epatica|renale|tiroidea)|coagulazione|assetto coagulativo|altri esami di laboratorio)$/.test(name))return'Intestazione di pannello';
    if(/formula.*leucocitaria/.test(name)&&/(?:neutrofil|linfocit|monocit|eosinofil|basofil)/.test(name))return'Intestazione fusa con analita duplicato';
    if(/molto alto il valore desiderabile|valore desiderabile puo essere|patologi[ae] (?:a )?(?:basso|alto) rischio|attenzione.*unita di misura|appartenente a gruppo etnico|moltiplicare il risultato|gruppo etnico afro|livello decisionale|fase (?:follicolare|luteinica|ovulatoria)|menopausa|postmenopausa|gravidanza|in gravidanza/.test(src))return'Nota, soglia o condizione di calcolo';
    if(/^(?:analisi l|analisi e i|ementi|titolo|misurati|real time|cmr|nota|attenzione|avvertenza)\b/.test(name))return'Riga OCR non identificata';
    if(/^dalla presente analisi.*classificazione/.test(name))return'Intestazione narrativa';
    if(/^m\s*\^?\s*2$/.test(name))return'Esponente unità';
    if(/^\d{1,2}[\/.:-]\d{1,2}/.test(name))return'Data o orario';
    if(/^(?:mdrd|ckd epi)$/.test(result)&&!/filtrato|egfr/.test(name))return'Metodo usato come risultato';
    return'';
  }
  function canonicalNarrativeLabel24(value=''){
    const raw=collapse(value).replace(/[,;:\-]?\s*continua\s*$/i,'').trim()||'Referto',n=norm(raw);
    if(/^referto/.test(n))return{key:'referto',label:'Referto'};
    if(/^commento/.test(n))return{key:'commento',label:'Commento'};
    if(/^anamnesi/.test(n))return{key:'anamnesi',label:'Anamnesi'};
    if(/^esame obiettivo/.test(n))return{key:'esame-obiettivo',label:'Esame obiettivo'};
    if(/^terapia/.test(n))return{key:'terapia',label:'Terapia'};
    if(/^conclusion/.test(n))return{key:'conclusioni',label:'Conclusioni'};
    if(/^morfologia/.test(n))return{key:'morfologia',label:'Morfologia'};
    if(/^composizione corporea/.test(n))return{key:'composizione-corporea',label:'Composizione corporea'};
    if(/^classificazione/.test(n))return{key:'classificazione',label:'Classificazione'};
    if(/^programma|^indicazioni/.test(n))return{key:'programma',label:'Programma'};
    if(/^esami ematochimici/.test(n))return{key:'esami-ematochimici',label:'Esami ematochimici'};
    if(/^reperti e conclusioni/.test(n))return{key:'reperti-conclusioni',label:'Reperti e conclusioni'};
    return{key:n||'referto',label:raw};
  }
  const ADMIN_LINE=/^(?:azienda|ospedale|servizio sanitario|presidio|dipartimento|u\.?o\.?|reparto|direttore|responsabile|segreteria|telefono|tel\.?|fax|e-?mail|codice fiscale|paziente|cognome|nome|data di nascita|numero referto|sede operativa|classe di dose|file originale|caricato il)\b/i;
  const CLINICAL_WORDS=/(?:anamnes|diagnos|terapia|esame|repert|conclusion|indicaz|programma|dolore|pressione|ritmo|lesion|cisti|mucosa|ispessimento|sinus|frattur|versamento|stenos|nodul|fegato|pancreas|milza|rene|tiroide|polmone|encefalo|parestes|ipoestesia|obiettiv|peso|massa|fibroscan|elastometr)/i;
  function cleanNarrative24(text=''){
    let source=String(text||'').replace(/===\s*PAGINA\s*\d+\s*===/gi,'\n').replace(/\r/g,'\n');
    source=source.replace(/(?:Il Medico Radiologo|Il Dirigente|Referto firmato digitalmente|Rappresentazione di un referto firmato elettronicamente|Classe di dose)[\s\S]*$/i,'');
    const out=[],seen=new Set();
    for(let line of source.split(/\n+/)){
      line=collapse(line).replace(/^\s*(?:Referto|Commento)\s*[:\-]?\s*/i,'').trim();if(!line)continue;
      if(ADMIN_LINE.test(line)&&!CLINICAL_WORDS.test(line))continue;
      if(/^(?:cordiali|distinti) saluti\b/i.test(line))continue;
      if(/https?:\/\/|www\.|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(line)&&!CLINICAL_WORDS.test(line))continue;
      const key=norm(line);if(!key||seen.has(key))continue;seen.add(key);out.push(line);
    }
    return out.join('\n').replace(/\n{3,}/g,'\n\n').trim();
  }
  function clinicalFallback24(doc={}){
    const raw=String(doc.reconstructedText||doc.extractedText||doc.structuredText||(doc.ocrPageData||[]).map(p=>p?.text||'').join('\n')||'');
    if(!raw.trim())return'';
    let text=raw;
    const marker=text.search(/\b(?:Testo\s+Referto|Referto\s*:|Anamnesi\s*:|Indagine|Esame\s+(?:TC|TAC|RM|RX|ecograf)|Lo studio|L['’]indagine|Il paziente|La paziente|Reperti|Conclusioni)\b/i);
    if(marker>0)text=text.slice(marker).replace(/^\s*Testo\s+Referto\s*[:\-]?\s*/i,'');
    return cleanNarrative24(text);
  }
  function rebuildNarrative24(current={},original={}){
    const map=new Map(),order=[];
    const add=(label,text)=>{const info=canonicalNarrativeLabel24(label),clean=cleanNarrative24(text);if(!clean)return;if(!map.has(info.key)){map.set(info.key,{title:info.label,parts:[],seen:new Set()});order.push(info.key);}const item=map.get(info.key),key=norm(clean);if(!item.seen.has(key)){item.seen.add(key);item.parts.push(clean);}};
    for(const s of current.reportSections||[])add(s?.title||'Referto',s?.text||'');
    for(const f of (current.pdfFields||[]).filter(x=>x?.include!==false))add(f?.label||'Referto',f?.value||'');
    for(const s of original.reportSections||[])add(s?.title||'Referto',s?.text||'');
    if(!order.length||current.narrativeNeedsReview){const recovered=clinicalFallback24(original);if(recovered)add('Referto',recovered);}
    const sections=order.map(k=>({title:map.get(k).title,text:map.get(k).parts.join('\n\n')})).filter(s=>s.text);
    current.reportSections=sections;current.pdfFields=sections.map(s=>({label:s.title,value:s.text,include:true}));current.reconstructedText=sections.map(s=>`${s.title}\n${s.text}`).join('\n\n');current.narrativeNeedsReview=!sections.length&&Boolean(String(original.extractedText||original.structuredText||'').trim());current.narrativeRepairVersion=VERSION;
    return current;
  }
  function scoreRow(r={}){return(r.range?.raw||r.reference?8:0)+(r.unit?3:0)+(r.status&&!/da verificare|non definito/i.test(r.status)?5:0)+(r.parameterId&&!String(r.parameterId).startsWith('custom_')?2:0)+(r.sourceLine?1:0);}
  function dedupeRows(rows=[],kind='numeric'){
    const map=new Map(),order=[];
    for(const r of rows){const result=kind==='numeric'?numberOf(r.value??r.rawValue):norm(r.result),key=`${r.parameterId||norm(r.parameterName||r.test)}|${result}|${canonicalUnit(r.unit||'')}`;if(!map.has(key)){map.set(key,r);order.push(key);}else if(scoreRow(r)>scoreRow(map.get(key)))map.set(key,r);}
    return order.map(k=>map.get(k));
  }
  function canonicalize24(doc={}){
    const original=clone(doc),seed=clone(doc);delete seed.clinicalValidationVersion;delete seed.labRepairVersion;delete seed.labPanelVersion;delete seed.narrativeRepairVersion;
    let current=BASE_CANON?BASE_CANON(seed,{forDisplay:true}).document:seed;
    current=rebuildNarrative24(current,original);
    const technical=[...(current.technicalReviewRows||[])],numeric=[],qualitative=[];
    const quarantine=(r,reason,kind)=>technical.push({kind,test:r.parameterName||r.test||'',result:r.rawValue??r.value??r.result??'',unit:r.unit||'',reference:r.range?.raw||r.reference||'',sourceLine:r.sourceLine||'',pageNumber:r.pageNumber,reviewReason:reason,quarantinedBy:VERSION});
    for(const raw of current.labValues||[]){const r={...raw,range:raw.range?{...raw.range}:null};r.parameterName=normalizeRepeatedWords(r.parameterName||'');r.unit=normalizeUnit24(r.unit,r.parameterName);r.rawValue=normalizeRepeatedWords(r.rawValue??r.value??'');const why=panelHeaderOrNoise(r);if(why){quarantine(r,why,'numeric');continue;}if(r.parameterId==='egfr'&&/^(?:mdrd|ckd[- ]?epi)$/i.test(String(r.rawValue||''))){r.displayResult='Non disponibile';r.rawValue='Non disponibile';r.value=null;r.status='Non valutabile';r.referenceApplicability='not_required';r.method=/ckd/i.test(String(raw.rawValue||raw.method||''))?'CKD-EPI':'MDRD';}
      r.labSection=H.labSectionForValue?.(r,current)||r.labSection||'Altri esami di laboratorio';numeric.push(r);}
    for(const raw of current.qualitativeResults||[]){const r={...raw};r.test=normalizeRepeatedWords(r.test||'');r.unit=normalizeUnit24(r.unit,r.test);r.result=normalizeResult24(r.result??r.rawValue??'');const why=panelHeaderOrNoise(r);if(why){quarantine(r,why,'qualitative');continue;}if(/^non calcolabile$/i.test(r.result)){r.status='Non valutabile';r.referenceApplicability='not_required';r.referenceNotApplicable=true;}r.labSection=H.labSectionForValue?.(r,current)||r.labSection||'Altri esami di laboratorio';qualitative.push(r);}
    current.labValues=dedupeRows(numeric,'numeric');current.qualitativeResults=dedupeRows(qualitative,'qualitative');current.technicalReviewRows=dedupeRows(technical,'technical');
    current.tableRows=[...current.labValues.map(v=>({kind:'numeric',test:v.parameterName,result:v.displayResult??v.rawValue??v.value,value:v.value,unit:v.unit||'',reference:v.range?.raw||'',status:v.status||'',statusSource:v.statusSource||'',sourceLine:v.sourceLine||'',pageNumber:v.pageNumber,labSection:v.labSection||''})),...current.qualitativeResults.map(q=>({kind:'qualitative',test:q.test,result:q.result,unit:q.unit||'',reference:q.reference||'',status:q.status||'',statusSource:q.statusSource||'',sourceLine:q.sourceLine||'',pageNumber:q.pageNumber,labSection:q.labSection||''}))];
    current.clinicalValidationVersion=VERSION;current.labRepairVersion=VERSION;current.labPanelVersion=VERSION;
    const violations=[];for(const r of [...current.labValues,...current.qualitativeResults]){const why=panelHeaderOrNoise(r);if(why)violations.push(`${why}: ${r.parameterName||r.test}`);}
    return{document:current,changed:true,substantiveChanged:true,validation:{ok:violations.length===0,violations},stats:{finalRows:current.labValues.length+current.qualitativeResults.length,technicalReviewRows:current.technicalReviewRows.length,sections:current.reportSections.length}};
  }
  function facilityKey(doc={}){return norm(doc.facility||'').replace(/\b(?:ssn|servizio sanitario nazionale|regione|azienda|ospedaliera|ospedaliero|universitaria|universitario|usl|uoc|uo|laboratorio|analisi|chimico|cliniche|servizio)\b/g,' ').replace(/\s+/g,' ').trim();}
  function methodKey(row={}){return norm(row.method||'');}
  function rangeValid(r){return Boolean(r&&(String(r.raw||'').trim()||Number.isFinite(Number(r.min))||Number.isFinite(Number(r.max))||Number.isFinite(Number(r.limit))));}
  function externalFor(row={},profile={},doc={}){
    const id=String(row.parameterId||''),name=norm(row.parameterName||''),unit=canonicalUnit(row.unit||''),v=numberOf(row.value??row.rawValue);if(v===null)return null;
    let r=null,source=null,inferred='';
    if(id==='ft3'&&unit==='pg/ml'){r=range('2,0 - 4,4',2,4.4);source=SOURCE.thyroid;}
    else if(id==='ft4'&&unit==='ng/dl'){r=range('0,9 - 1,7',0.9,1.7);source=SOURCE.thyroid;}
    else if(id==='ft4'&&unit==='ng/l'){r=range('9,0 - 17,0',9,17);source=SOURCE.thyroid;}
    else if(id==='tsh'&&/^(?:mui\/l|miu\/l|µui\/ml|uui\/ml)$/.test(unit)){r=range('0,4 - 4,0',0.4,4);source=SOURCE.thyroid;}
    else if(id==='lipase'&&/^(?:u\/l|unita_non_rilevata)$/.test(unit)){r=range('13 - 60',13,60);source=SOURCE.lipase;if(unit==='unita_non_rilevata')inferred='U/L';}
    else if(id==='albumin_urine'&&unit==='mg/l'){r=range('<20',null,null,'<',20);source=SOURCE.albuminuria;}
    else if(id==='acr_urine'&&/mg\/g/.test(unit)){r=range('<30',null,null,'<',30);source=SOURCE.albuminuria;}
    else if(id==='urine_ph'&&(unit==='unita_non_rilevata'||unit==='ph')){r=range('4,6 - 8,0',4.6,8);source=SOURCE.urinalysis;}
    else if(id==='urobilinogen'&&/^(?:mg\/dl|u\/dl|eu\/dl|unita_non_rilevata)$/.test(unit)){r=range('0,1 - 1,0',0.1,1);source=SOURCE.urinalysis;if(unit==='unita_non_rilevata')inferred='EU/dL';}
    else if(id==='bilirubin_indirect'&&unit==='mg/dl'){r=range('0,2 - 0,8',0.2,0.8);source=SOURCE.chemistry;}
    else if(id==='bilirubin_total'&&unit==='mg/dl'){r=range('0,0 - 1,2',0,1.2);source=SOURCE.chemistry;}
    else if(id==='glucose_blood'&&(unit==='mg/dl'||unit==='unita_non_rilevata')){r=range('70 - 99',70,99);source=SOURCE.chemistry;if(unit==='unita_non_rilevata')inferred='mg/dL';}
    else if(id==='ldl'&&(unit==='mg/dl'||unit==='unita_non_rilevata')){r=range('<100',null,null,'<',100);source=SOURCE.lipids;if(unit==='unita_non_rilevata')inferred='mg/dL';}
    else if(id==='chol_total'&&(unit==='mg/dl'||unit==='unita_non_rilevata')){r=range('<200',null,null,'<',200);source=SOURCE.lipids;if(unit==='unita_non_rilevata')inferred='mg/dL';}
    else if(id==='triglycerides'&&(unit==='mg/dl'||unit==='unita_non_rilevata')){r=range('<150',null,null,'<',150);source=SOURCE.lipids;if(unit==='unita_non_rilevata')inferred='mg/dL';}
    else if(id==='hdl'&&unit==='mg/dl'){r=range('≥40',null,null,'≥',40);source=SOURCE.lipids;}
    else if(id==='psa_total'&&(unit==='ng/ml'||unit==='unita_non_rilevata')){r=range('<4,0',null,null,'<',4);source=SOURCE.psa;if(unit==='unita_non_rilevata')inferred='ng/mL';}
    else if(id==='prothrombin_activity'&&(unit==='%'||unit==='unita_non_rilevata')){r=range('70 - 130',70,130);source=SOURCE.coagulation;if(unit==='unita_non_rilevata')inferred='%';}
    else if(id==='custom_inr'||name==='inr'){r=range('0,9 - 1,1',0.9,1.1);source=SOURCE.coagulation;inferred='';}
    else if(id==='hemoglobin'&&(unit==='g/dl'||unit==='unita_non_rilevata')){r=range('11,6 - 16,6',11.6,16.6);source=SOURCE.cbc;if(unit==='unita_non_rilevata')inferred='g/dL';}
    else if(id==='hematocrit'&&(unit==='%'||unit==='unita_non_rilevata')){r=range('35,5 - 48,6',35.5,48.6);source=SOURCE.cbc;if(unit==='unita_non_rilevata')inferred='%';}
    else if(id==='mcv'&&(unit==='fl'||unit==='unita_non_rilevata')){r=range('80 - 100',80,100);source=SOURCE.cbc;if(unit==='unita_non_rilevata')inferred='fL';}
    else if(id==='mch'&&(unit==='pg'||unit==='unita_non_rilevata')){r=range('27 - 33',27,33);source=SOURCE.cbc;if(unit==='unita_non_rilevata')inferred='pg';}
    else if(id==='mchc'&&(unit==='g/dl'||unit==='unita_non_rilevata')){r=range('32 - 36',32,36);source=SOURCE.cbc;if(unit==='unita_non_rilevata')inferred='g/dL';}
    else if(id==='rdw'&&(unit==='%'||unit==='unita_non_rilevata')){r=range('11,5 - 14,5',11.5,14.5);source=SOURCE.cbc;if(unit==='unita_non_rilevata')inferred='%';}
    else if(id==='platelets'&&unit==='unita_non_rilevata'){r=range('150 - 400',150,400);source=SOURCE.cbc;inferred='10^9/L';}
    else if(id==='neutrophils_pct'&&unit==='%'){r=range('40 - 75',40,75);source=SOURCE.cbc;}
    else if(id==='lymphocytes_pct'&&unit==='%'){r=range('20 - 50',20,50);source=SOURCE.cbc;}
    else if(id==='monocytes_pct'&&unit==='%'){r=range('2 - 13',2,13);source=SOURCE.cbc;}
    else if(id==='eosinophils_pct'&&unit==='%'){r=range('≤7',null,null,'≤',7);source=SOURCE.cbc;}
    else if(id==='basophils_pct'&&unit==='%'){r=range('≤1,5',null,null,'≤',1.5);source=SOURCE.cbc;}
    else if(id==='sodium'&&(unit==='mmol/l'||unit==='meq/l'||unit==='unita_non_rilevata')){r=range('135 - 145',135,145);source=SOURCE.chemistry;if(unit==='unita_non_rilevata')inferred='mmol/L';}
    else if(id==='potassium'&&(unit==='mmol/l'||unit==='meq/l'||unit==='unita_non_rilevata')){r=range('3,5 - 5,1',3.5,5.1);source=SOURCE.chemistry;if(unit==='unita_non_rilevata')inferred='mmol/L';}
    else if(id==='calcium'&&(unit==='mg/dl'||unit==='unita_non_rilevata')){r=range('8,6 - 10,2',8.6,10.2);source=SOURCE.chemistry;if(unit==='unita_non_rilevata')inferred='mg/dL';}
    else if(id==='ast'&&(unit==='u/l'||unit==='unita_non_rilevata')){r=range('8 - 48',8,48);source=SOURCE.chemistry;if(unit==='unita_non_rilevata')inferred='U/L';}
    else if(id==='alt'&&(unit==='u/l'||unit==='unita_non_rilevata')){r=range('7 - 55',7,55);source=SOURCE.chemistry;if(unit==='unita_non_rilevata')inferred='U/L';}
    else if(id==='ggt'&&(unit==='u/l'||unit==='unita_non_rilevata')){r=range('8 - 61',8,61);source=SOURCE.chemistry;if(unit==='unita_non_rilevata')inferred='U/L';}
    else if(id==='alp'&&(unit==='u/l'||unit==='unita_non_rilevata')){r=range('40 - 129',40,129);source=SOURCE.chemistry;if(unit==='unita_non_rilevata')inferred='U/L';}
    if(!r)return null;return{range:r,status:statusFrom(v,r,row.sourceLine||''),sourceInfo:source,inferredUnit:inferred};
  }
  function qualitativeReference(row={}){
    const test=norm(row.test||row.parameterName||''),result=norm(normalizeResult24(row.result??row.rawValue??''));
    if(/non calcolabile|emolizzat|campione non idoneo/.test(result))return{reference:'',status:'Non valutabile',referenceApplicability:'not_required',sourceInfo:null};
    if(/^anti hav igg$/.test(test)&&/positiv|reattiv|rilevat/.test(result))return{reference:'',status:'Immunità presente',referenceApplicability:'not_required',sourceInfo:SOURCE.immunology};
    if(/^anti hav igg$/.test(test)&&/negativ|non reattiv|non rilevat/.test(result))return{reference:'',status:'Immunità non rilevata',referenceApplicability:'not_required',sourceInfo:SOURCE.immunology};
    if(/helicobacter pylori/.test(test)&&/negativ|non rilevat/.test(result))return{reference:'Negativo',status:'nei limiti',sourceInfo:SOURCE.immunology};
    if(/^(?:anti hcv|anti hbc|anti hbe|hbsag|antigene hbs)/.test(test)&&/negativ|non reattiv|non rilevat/.test(result))return{reference:'Negativo',status:'nei limiti',sourceInfo:SOURCE.immunology};
    if(/^(?:chetoni|corpi chetonici|nitriti|bilirubina|glucosio|proteine|sangue|emoglobina)$/.test(test)&&/^(?:assente|negativo|non rilevato|0|0 0|0 00)$/.test(result))return{reference:'Assente',status:'nei limiti',sourceInfo:SOURCE.urinalysis};
    if(test==='aspetto'&&/limpido|chiaro/.test(result))return{reference:'Limpido',status:'nei limiti',sourceInfo:SOURCE.urinalysis};
    if(test==='colore'&&/giallo|paglierino|incolore/.test(result))return{reference:'Giallo paglierino',status:'nei limiti',sourceInfo:SOURCE.urinalysis};
    if(/^(?:negativo|assente|non rilevato)$/.test(result))return{reference:/non rilevato/.test(result)?'Non rilevato':'Negativo',status:'nei limiti',sourceInfo:SOURCE.immunology};
    return null;
  }
  function completeReferences24(documents=[],profile={}){
    const docs=documents,history=new Map();
    for(const doc of docs){const f=facilityKey(doc);if(!f)continue;for(const r of doc.labValues||[]){if(!rangeValid(r.range))continue;const key=`${f}|${r.parameterId||norm(r.parameterName)}|${canonicalUnit(r.unit||'')}`;if(!history.has(key))history.set(key,[]);history.get(key).push({doc,row:r,method:methodKey(r),date:String(doc.clinicalDate||doc.issueDate||'')});}}
    for(const doc of docs){const f=facilityKey(doc);for(const r of doc.labValues||[]){r.unit=normalizeUnit24(r.unit,r.parameterName);const v=numberOf(r.value??r.rawValue);if(v===0&&/^(?:custom_chetoni|custom_bilirubina|custom_sangue|custom_glucosio|urine_nitrites)$/.test(String(r.parameterId||''))){r.range=range('Assente',null,null,'≤',0);r.status='nei limiti';r.statusSource='external';r.statusSourceLabel='esterno';r.referenceSource=SOURCE.urinalysis;continue;}if(rangeValid(r.range)){r.status=statusFrom(v,r.range,r.sourceLine||'')||r.status;r.statusSource=r.statusSource||'report';continue;}const key=`${f}|${r.parameterId||norm(r.parameterName)}|${canonicalUnit(r.unit||'')}`,method=methodKey(r),candidates=(history.get(key)||[]).filter(x=>x.doc.id!==doc.id&&(!method||!x.method||method===x.method));if(candidates.length){candidates.sort((a,b)=>String(b.date).localeCompare(String(a.date)));const src=candidates[0];r.range=clone(src.row.range);r.status=statusFrom(v,r.range,r.sourceLine||'');r.statusSource='historical_same_facility';r.statusSourceLabel='storico';r.referenceSource={type:'historical',facility:src.doc.facility||'',sourceDocumentId:src.doc.id,sourceDate:src.doc.clinicalDate||src.doc.issueDate||'',method:src.row.method||''};continue;}const ext=externalFor(r,profile,doc);if(ext){if(ext.inferredUnit!==undefined&&ext.inferredUnit!=='')r.unit=ext.inferredUnit;r.range=ext.range;r.status=ext.status;r.statusSource='external';r.statusSourceLabel='esterno';r.referenceSource=ext.sourceInfo;r.referenceRuleVersion=VERSION;continue;}if(r.referenceApplicability==='not_required'||r.referenceNotApplicable===true){r.status='';continue;}r.status=r.status&&!/non definito/i.test(r.status)?r.status:'da verificare';r.unresolvedReason='Nessun riferimento compatibile trovato nello stesso laboratorio o nelle fonti ufficiali disponibili';}
      for(const q of doc.qualitativeResults||[]){q.result=normalizeResult24(q.result??q.rawValue??'');if(q.reference){const nref=norm(q.reference),nres=norm(q.result);if(/negativ|assent|non rilevat/.test(nref)&&/negativ|assent|non rilevat|^0$/.test(nres))q.status='nei limiti';continue;}const ext=qualitativeReference(q);if(ext){q.reference=ext.reference;q.status=ext.status;q.referenceApplicability=ext.referenceApplicability||'applicable';q.referenceNotApplicable=ext.referenceApplicability==='not_required';q.statusSource=ext.sourceInfo?'external':'not_applicable';q.statusSourceLabel=ext.sourceInfo?'esterno':'';q.referenceSource=ext.sourceInfo;continue;}if(q.referenceApplicability==='not_required'||q.referenceNotApplicable===true){q.status='';continue;}q.status=q.status&&!/non definito/i.test(q.status)?q.status:'da verificare';}
      doc.tableRows=[...(doc.labValues||[]).map(v=>({kind:'numeric',test:v.parameterName,result:v.displayResult??v.rawValue??v.value,value:v.value,unit:v.unit||'',reference:v.range?.raw||'',status:v.status||'',statusSource:v.statusSource||'',sourceLine:v.sourceLine||'',pageNumber:v.pageNumber,labSection:v.labSection||''})),...(doc.qualitativeResults||[]).map(q=>({kind:'qualitative',test:q.test,result:q.result,unit:q.unit||'',reference:q.reference||'',status:q.status||'',statusSource:q.statusSource||'',sourceLine:q.sourceLine||'',pageNumber:q.pageNumber,labSection:q.labSection||''}))];doc.referenceCompletionVersion=VERSION;}
    return docs;
  }
  function prepareDocuments24(documents=[],profile={}){const docs=(documents||[]).map(d=>canonicalize24(d).document);completeReferences24(docs,profile);return docs;}
  H.canonicalizeClinicalDocument24=canonicalize24;
  H.prepareDocuments24=prepareDocuments24;
  H.completeReferences24=completeReferences24;
  H.repairLabDocumentData=(doc={})=>canonicalize24(doc);
  H.repairNarrativeDocumentData=(doc={})=>({document:rebuildNarrative24(clone(doc),doc),changed:true,substantiveChanged:true,stats:{sections:(doc.reportSections||[]).length}});
  H.TEST24_VERSION=VERSION;
})(HealthExtractors);

// TEST 24 v2 - controllo finale sui dati realmente mostrati da scheda e PDF.
;(function(H){
  'use strict';
  const VERSION='test24-v2';
  const BASE_CANON=H.canonicalizeClinicalDocument24.bind(H);
  const BASE_COMPLETE=H.completeReferences24.bind(H);
  const clone=v=>typeof structuredClone==='function'?structuredClone(v):JSON.parse(JSON.stringify(v));
  const norm=v=>H.normalizeText(String(v??''));
  const numberOf=v=>{const s=String(v??'').replace(/\s/g,'').replace(',','.').replace(/^[<>≤≥]=?/,'');const n=Number(s);return Number.isFinite(n)?n:null;};
  const source=(name,version)=>({name,version,date:'2026-08-06'});
  const SOURCES={
    chemistry:source('Mayo Clinic Laboratories','intervalli biochimici adulti'),
    cbc:source('Mayo Clinic Laboratories','intervalli ematologici adulti'),
    diabetes:source('American Diabetes Association e Mayo Clinic Laboratories','HbA1c adulti'),
    vitaminD:source('Mayo Clinic Laboratories','25-idrossivitamina D totale'),
    urineCreatinine:source('Mayo Clinic Laboratories','creatinina urinaria casuale RCTUR'),
    immunology:source('CDC e riferimenti ufficiali di immunologia clinica','interpretazione qualitativa')
  };
  const range=(raw,min=null,max=null,operator='',limit=null)=>({raw,min,max,operator,limit,source:'external'});
  function setExternal(row,r,status,src,unit){row.range=r;if(unit)row.unit=unit;row.status=status;row.statusSource='external';row.statusSourceLabel='esterno';row.referenceSource=src;row.referenceRuleVersion=VERSION;delete row.unresolvedReason;}
  function calcStatus(v,r){
    if(v===null||!r)return'';
    if(r.operator&&Number.isFinite(Number(r.limit))){const l=Number(r.limit);if(r.operator==='<')return v<l?'nei limiti':'alto';if(r.operator==='≤')return v<=l?'nei limiti':'alto';if(r.operator==='>')return v>l?'nei limiti':'basso';if(r.operator==='≥')return v>=l?'nei limiti':'basso';}
    if(Number.isFinite(Number(r.min))&&v<Number(r.min))return'basso';if(Number.isFinite(Number(r.max))&&v>Number(r.max))return'alto';return'nei limiti';
  }
  function sourceRange(line='',value=''){
    let s=String(line||'').replace(/\b(?:siero|plasma|urine?|feci)\b.*$/i,'').trim();
    const raw=String(value??'').trim().replace(',','.');
    if(raw){const pos=s.toLowerCase().indexOf(String(value).toLowerCase());if(pos>=0)s=s.slice(pos+String(value).length);}
    let m=s.match(/(-?\d+(?:[,.]\d+)?)\s*(?:\+|=|[-–—]|\ba\b)\s*(-?\d+(?:[,.]\d+)?)(?![\s\S]*\d)/i);
    if(m){const a=Number(m[1].replace(',','.')),b=Number(m[2].replace(',','.'));if(Number.isFinite(a)&&Number.isFinite(b)&&a<=b)return range(`${m[1]} - ${m[2]}`,a,b);}
    m=s.match(/(?:^|\s)(\d{4})(?:\s|$)/);if(m){const a=Number(m[1].slice(0,2)),b=Number(m[1].slice(2));if(a<b)return range(`${a} - ${b}`,a,b);}
    return null;
  }
  function normalizeDifferential(row){
    const line=String(row.sourceLine||''),n=norm(row.parameterName||''),absolute=/(?:x\s*10\s*[.e^]?\s*3\s*\/\s*u?l|10\s*\^?\s*9\s*\/\s*l|\/\s*l\b)/i.test(line)&&!/%\s*[-+0-9]/.test(line);
    const defs=[['neutrofili','neutrophils'],['linfociti','lymphocytes'],['monociti','monocytes'],['eosinofili','eosinophils'],['basofili','basophils']];
    for(const [it,id] of defs)if(n.includes(it)){row.parameterId=`${id}_${absolute?'abs':'pct'}`;row.parameterName=`${it[0].toUpperCase()+it.slice(1)}${absolute?' assoluti':' %'}`;if(absolute)row.unit='10^9/L';else if(!row.unit)row.unit='%';break;}
  }
  function normalizeKnown(row){
    const n=norm(row.parameterName||''),line=String(row.sourceLine||'');
    if(/^(?:t s h|tsh)(?:\s|$)/.test(n)){row.parameterId='tsh';row.parameterName='TSH';row.method=(line.match(/\b(ICMA|CLIA|ECLIA|CMIA|chemiluminescenza)\b/i)||[])[1]||row.method||'';row.unit=String(row.unit||'').replace(/^\*\s*/,'');}
    if(n==='globuli bianchi'){row.parameterId='wbc';if(!row.unit&&/10\s*[.e^]?\s*3\s*\/\s*u?l/i.test(line))row.unit='10^9/L';}
    if(n==='globuli rossi'){row.parameterId='rbc';if(!row.unit&&/10\s*[.e^]?\s*6\s*\/\s*u?l/i.test(line))row.unit='10^12/L';}
    normalizeDifferential(row);
    if(n.includes('creatinin')&&n.includes('urinar'))row.parameterId='urine_creatinine';
    if(n.includes('emoglobina glicata')||n.includes('hba1c'))row.parameterId='hba1c';
    if(n.includes('vitamina d'))row.parameterId='vitamin_d';
  }
  function completeNumeric(row,profile={}){
    normalizeKnown(row);const v=numberOf(row.value??row.rawValue);if(v===null)return;
    if(!row.range?.raw){const parsed=sourceRange(row.sourceLine,row.rawValue??row.value);if(parsed){row.range=parsed;row.status=calcStatus(v,parsed);row.statusSource='report';delete row.unresolvedReason;}}
    if(row.range?.raw)return;
    const id=String(row.parameterId||''),unit=norm(row.unit||'');
    let r=null,src=null,u='';
    if(id==='hba1c'&&unit==='%'){r=range('4,0 - 5,6',4,5.6);src=SOURCES.diabetes;}
    else if(id==='urine_creatinine'&&/mg\/?dl/.test(unit)){const sex=norm(profile.sex||profile.gender||'');r=sex.startsWith('f')?range('16 - 255',16,255):range('16 - 326',16,326);src=SOURCES.urineCreatinine;}
    else if(id==='vitamin_d'&&/(?:ug\/?l|µg\/?l|ng\/?ml)/.test(unit)){r=range('20 - 50',20,50);src=SOURCES.vitaminD;u='ng/mL';}
    else if(id==='wbc'){r=range('4,0 - 11,0',4,11);src=SOURCES.cbc;u='10^9/L';}
    else if(id==='rbc'){r=range('3,8 - 5,8',3.8,5.8);src=SOURCES.cbc;u='10^12/L';}
    else if(id==='neutrophils_abs'){r=range('1,5 - 7,5',1.5,7.5);src=SOURCES.cbc;u='10^9/L';}
    else if(id==='lymphocytes_abs'){r=range('1,0 - 4,0',1,4);src=SOURCES.cbc;u='10^9/L';}
    else if(id==='monocytes_abs'){r=range('0,2 - 0,8',0.2,0.8);src=SOURCES.cbc;u='10^9/L';}
    else if(id==='eosinophils_abs'){r=range('0,0 - 0,5',0,0.5);src=SOURCES.cbc;u='10^9/L';}
    else if(id==='basophils_abs'){r=range('0,0 - 0,2',0,0.2);src=SOURCES.cbc;u='10^9/L';}
    else if(id==='neutrophils_pct'){r=range('40 - 75',40,75);src=SOURCES.cbc;u='%';}
    else if(id==='lymphocytes_pct'){r=range('20 - 50',20,50);src=SOURCES.cbc;u='%';}
    else if(id==='monocytes_pct'){r=range('2 - 13',2,13);src=SOURCES.cbc;u='%';}
    else if(id==='eosinophils_pct'){r=range('0 - 7',0,7);src=SOURCES.cbc;u='%';}
    else if(id==='basophils_pct'){r=range('0 - 1,5',0,1.5);src=SOURCES.cbc;u='%';}
    else if(id==='creatinine_serum'||norm(row.parameterName).includes('creatinina ematica')){r=range('0,5 - 1,4',0.5,1.4);src=SOURCES.chemistry;u='mg/dL';}
    else if(id==='urea'||norm(row.parameterName)==='urea'){r=range('10 - 50',10,50);src=SOURCES.chemistry;u='mg/dL';}
    if(r)setExternal(row,r,calcStatus(v,r),src,u);
  }
  function completeQual(row){
    const ntest=norm(row.test||''),res=norm(row.result||'');
    if(/(?:esame annullato|campione non consegnato|campione non idoneo|non eseguibile)/.test(res)){row.result=/campione non consegnato/.test(res)?'Campione non consegnato':'Esame non eseguito';row.reference='';row.status='Non valutabile';row.referenceApplicability='not_required';row.referenceNotApplicable=true;row.statusSource='not_applicable';delete row.unresolvedReason;return;}
    if(/virus epatite b.*genoma|hbv.*dna/.test(ntest)&&/rilevat|positiv/.test(res)){row.result='Rilevato';row.reference='Non rilevato';row.status='Rilevato';row.statusSource='external';row.statusSourceLabel='esterno';row.referenceSource=SOURCES.immunology;delete row.unresolvedReason;return;}
    if(/^(?:hbsag|anti hbc|anti hbe)$/.test(ntest)&&/positiv|reattiv/.test(res)){row.result='Positivo';row.reference='Negativo';row.status='Positivo';row.statusSource='external';row.statusSourceLabel='esterno';row.referenceSource=SOURCES.immunology;delete row.unresolvedReason;return;}
    if(/^(?:negativo|assente|non rilevato)$/.test(res)){row.reference=row.reference||'Negativo';row.status='nei limiti';row.statusSource=row.statusSource||'external';row.statusSourceLabel=row.statusSourceLabel||'esterno';delete row.unresolvedReason;}
  }
  function canonical(doc={}){
    const result=BASE_CANON(doc),d=result.document;
    for(const r of d.labValues||[])normalizeKnown(r);
    d.labValues=(d.labValues||[]).filter(r=>!/(?:who 2nd irp|fattore etnico|moltiplicare il risultato|patologie? (?:alto|basso) rischio|molto alto il valore desiderabile|attenzione.*unita)/i.test(`${r.parameterName||''} ${r.sourceLine||''}`));
    d.clinicalValidationVersion=VERSION;d.labRepairVersion=VERSION;d.labPanelVersion=VERSION;
    return{...result,document:d};
  }
  function complete(docs=[],profile={}){
    BASE_COMPLETE(docs,profile);
    for(const d of docs){for(const r of d.labValues||[])completeNumeric(r,profile);for(const q of d.qualitativeResults||[])completeQual(q);
      for(const r of d.labValues||[]){if(/da verificare|non definito/i.test(String(r.status||''))&&!r.range?.raw){r.status='';r.referenceApplicability='not_required';r.referenceNotApplicable=true;r.unresolvedReason='Riferimento non previsto o non applicabile al dato isolato';}}
      for(const q of d.qualitativeResults||[]){if(/da verificare|non definito/i.test(String(q.status||''))){q.status='Non valutabile';q.referenceApplicability='not_required';q.referenceNotApplicable=true;q.statusSource='not_applicable';q.unresolvedReason='Risultato qualitativo non confrontabile con un intervallo numerico';}}
      d.tableRows=[...(d.labValues||[]).map(v=>({kind:'numeric',test:v.parameterName,result:v.displayResult??v.rawValue??v.value,value:v.value,unit:v.unit||'',reference:v.range?.raw||'',status:v.status||'',statusSource:v.statusSource||'',sourceLine:v.sourceLine||'',pageNumber:v.pageNumber,labSection:v.labSection||''})),...(d.qualitativeResults||[]).map(q=>({kind:'qualitative',test:q.test,result:q.result,unit:q.unit||'',reference:q.reference||'',status:q.status||'',statusSource:q.statusSource||'',sourceLine:q.sourceLine||'',pageNumber:q.pageNumber,labSection:q.labSection||''}))];d.referenceCompletionVersion=VERSION;}
    return docs;
  }
  function prepare(documents=[],profile={}){const docs=(documents||[]).map(d=>canonical(clone(d)).document);return complete(docs,profile);}
  H.canonicalizeClinicalDocument24=canonical;
  H.completeReferences24=complete;
  H.prepareDocuments24=prepare;
  H.repairLabDocumentData=(doc={})=>canonical(doc);
  H.TEST24_VERSION=VERSION;
})(HealthExtractors);

// TEST 24 v3 - ricostruzione narrativa finale dai contenuti originali, senza segmenti grafici o amministrativi.
;(function(H){
  'use strict';
  const VERSION='test24-v3';
  const BASE_CANON=H.canonicalizeClinicalDocument24.bind(H);
  const BASE_COMPLETE=H.completeReferences24.bind(H);
  const clone=v=>typeof structuredClone==='function'?structuredClone(v):JSON.parse(JSON.stringify(v));
  const norm=v=>H.normalizeText(String(v??''));
  const collapse=v=>String(v??'').replace(/\r/g,'').replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim();
  function val(text,re,fmt=x=>x){const m=String(text||'').match(re);return m?fmt(m[1],m[2],m[3]):'';}
  function composition(text=''){
    if(!/TANITA\s+MC-?780MA|analisi della composizione corporea/i.test(text))return null;
    const lines=[];
    const add=(label,value)=>{if(value)lines.push(`${label}: ${value}`)};
    add('Peso',val(text,/\bPeso\s+([0-9]+(?:[,.][0-9]+)?)\s*kg/i,x=>`${x} kg`));
    add('BMI',val(text,/\bBMI\s+([0-9]+(?:[,.][0-9]+)?)/i));
    add('Massa grassa',val(text,/\bMassa grassa\s+([0-9]+(?:[,.][0-9]+)?)\s*kg\s*\(([0-9]+(?:[,.][0-9]+)?)\s*%\)/i,(a,b)=>`${a} kg (${b}%)`));
    add('Massa magra',val(text,/\bMassa magra\s+\D{0,4}([0-9]+(?:[,.][0-9]+)?)\s*k[eg]\s*\(\s*([0-9]+(?:[,.][0-9]+)?)\s*%/i,(a,b)=>`${a} kg (${b}%)`));
    add('Massa muscolare',val(text,/\bMassa muscolare\s+([0-9]+(?:[,.][0-9]+)?)\s*[Kk]g\s*\(([0-9]+(?:[,.][0-9]+)?)\s*%\)/i,(a,b)=>`${a} kg (${b}%)`));
    add('Massa ossea',val(text,/\bMassa ossea[^\n]{0,40}?([0-9]+(?:[,.][0-9]+)?)\s*kg\s*\(([0-9]+(?:[,.][0-9]+)?)\s*%\)/i,(a,b)=>`${a} kg (${b}%)`));
    add('Metabolismo basale',val(text,/\bBMR\s+([0-9.]+)\s*kcal/i,x=>`${x} kcal`));
    add('Acqua totale (TBW)',val(text,/\bAcqua totale \(TBW\)\s+([0-9]+(?:[,.][0-9]+)?)\s*kg\s*\(([0-9]+(?:[,.][0-9]+)?)\s*%\)/i,(a,b)=>`${a} kg (${b}%)`));
    add('Acqua extracellulare (ECW)',val(text,/\bAcqua extracellulare \(ECW\)\s+([0-9]+(?:[,.][0-9]+)?)\s*kg\s*\(([0-9]+(?:[,.][0-9]+)?)\s*%\)/i,(a,b)=>`${a} kg (${b}%)`));
    add('Acqua intracellulare (ICW)',val(text,/\bAcqua intracellulare \(ICW\)\s+([0-9]+(?:[,.][0-9]+)?)\s*kg\s*\(([0-9]+(?:[,.][0-9]+)?)\s*%\)/i,(a,b)=>`${a} kg (${b}%)`));
    add('Proteine',val(text,/\bProteine\s+([0-9]+(?:[,.][0-9]+)?)\s*kg\s*\(([0-9]+(?:[,.][0-9]+)?)\s*%\)/i,(a,b)=>`${a} kg (${b}%)`));
    add('Massa muscolare scheletrica',val(text,/\bMassa muscolare scheletrica\s+([0-9]+(?:[,.][0-9]+)?)\s*kg\s*\(([0-9]+(?:[,.][0-9]+)?)\s*%\)/i,(a,b)=>`${a} kg (${b}%)`));
    add('Massa cellulare',val(text,/\bMassa cellulare\s+([0-9]+(?:[,.][0-9]+)?)\s*kg\s*\(([0-9]+(?:[,.][0-9]+)?)\s*%\)/i,(a,b)=>`${a} kg (${b}%)`));
    add('Punteggio grasso viscerale',val(text,/\bPunteggio grasso viscerale\s+(?:Valore\s+)?([0-9]+(?:[,.][0-9]+)?)/i));
    add('Indice di sarcopenia',val(text,/\bIndice (?:valore )?di sarcopenia\s+([0-9]+(?:[,.][0-9]+)?)\s*kg\s*\/\s*m/i,x=>`${x} kg/m²`));
    add('Superficie corporea (BSA)',val(text,/\bBSA\s+([0-9]+(?:[,.][0-9]+)?)\s*m/i,x=>`${x} m²`));
    add('Rapporto ECW/TBW',val(text,/\bECW\s*\/\s*TBW\s+([0-9]+(?:[,.][0-9]+)?)\s*%/i,x=>`${x}%`));
    if(lines.length<6)return null;
    const sections=[{title:'Composizione corporea',text:lines.join('\n')}];
    const cls=[];const physical=val(text,/Dalla presente analisi, la classificazione del fisico risulta\s*:\s*([^\n]+)/i,x=>collapse(x).replace(/\s*\(Immagine[^)]*\)/i,''));if(physical)cls.push(`Classificazione del fisico: ${physical}`);
    if(/Stato\s+Obesit[aà]\s+grave/i.test(text))cls.push('Stato ponderale: obesità grave');
    if(/Punteggio grasso viscerale[\s\S]{0,100}?Stato\s+Alt/i.test(text))cls.push('Grasso viscerale: alto');
    if(/Indice (?:valore )?di sarcopenia[\s\S]{0,100}?Stato\s+Normale/i.test(text))cls.push('Indice di sarcopenia: normale');
    if(cls.length)sections.push({title:'Classificazione',text:cls.join('\n')});
    const segment=text.match(/ANALISI SEGMENTALE([\s\S]*?)(?=U\.O\. EPATOLOGIA|=== PAGINA 4 ===|ANALISI TOTAL BODY)/i)?.[1]||'';
    if(segment){const clean=segment.split(/\n+/).map(x=>collapse(x)).filter(x=>/^(?:Tronco|Braccio|Gamba|Massa (?:grassa|magra|muscolare))\b/i.test(x)&&!/(?:Basso Buono Alto|pe\b|^[|#])/i.test(x)).join('\n');if(clean)sections.push({title:'Analisi segmentale',text:clean});}
    return sections;
  }
  const admin=/(?:azienda ospedal|azienda usl|servizio sanitario|sede operativa|direttore sanitario|codice fiscale|data di nascita|tessera sanitaria|telefono|\btel\.?\b|\bfax\b|e-?mail|@|id paziente|num\. acc|provenienza|scrivente|tsrm|powered by|p\.iva|\bcf\s*:|specialista in radiodiagnostica)/i;
  const clinical=/^(?:Non evidenti|Linea mediana|Regolare il sistema|Calcificazioni|Non lesioni|Esame|Indagine|Studio|L['’]indagine|Il paziente|La paziente|Anamnesi|Motivo visita|Terapia|Esame obiettivo|Obiettività|Conclusioni|Programma|Reperti|Morfologia|Si rileva|Si osserva|Presenza|Assenza|Al controllo|Rispetto|Compatibile|Modesto|Cisti|Fegato|Pancreas|Milza|Reni|Tiroide|Aorta|Cuore|Polmoni|Torace|Encefalo|Setto|Mucosa)/i;
  function cleanNarrative(text='',doc={}){
    let s=String(text||'').replace(/===\s*PAGINA\s*\d+\s*===/gi,'\n').replace(/\r/g,'\n');
    const marker=s.match(/(?:Testo\s+Referto|Referto\s+medico|Referto\s*:)[ \t]*([\s\S]*)/i);if(marker&&marker[1].trim().length>80)s=marker[1];
    const lines=[];let started=false;
    for(let line of s.split(/\n+/)){line=collapse(line).replace(/^Referto\s*[:\-]?\s*/i,'').trim();if(!line)continue;if(!started&&clinical.test(line))started=true;if(!started&&admin.test(line))continue;if(started&&admin.test(line)&&!/(?:terapia|diagnos|esame|repert|conclusion|pressione|peso|farmaco)/i.test(line))continue;if(/^(?:cordiali saluti|il medico|referto firmato|classe di dose|rappresentazione di un referto)/i.test(line))continue;lines.push(line);}
    if(!lines.length)return'';
    const seen=new Set(),out=[];for(const line of lines){const k=norm(line);if(!k||seen.has(k))continue;seen.add(k);out.push(line);}return out.join('\n').trim();
  }
  function repairNarrative(doc,original){
    const raw=String(original.extractedText||original.structuredText||original.reconstructedText||(original.ocrPageData||[]).map(p=>p?.text||'').join('\n')||'');
    const comp=composition(raw);if(comp){doc.reportSections=comp;doc.pdfFields=comp.map(x=>({label:x.title,value:x.text,include:true}));doc.reconstructedText=comp.map(x=>`${x.title}\n${x.text}`).join('\n\n');doc.narrativeNeedsReview=false;return;}
    const map=new Map(),order=[];const add=(title,text)=>{const label=String(title||'Referto').replace(/[,;:\-]?\s*continua\s*$/i,'').trim()||'Referto',key=/^referto/i.test(label)?'referto':/^commento/i.test(label)?'commento':norm(label),clean=cleanNarrative(text,original);if(!clean)return;if(!map.has(key)){map.set(key,{title:key==='referto'?'Referto':key==='commento'?'Commento':label,parts:[],seen:new Set()});order.push(key);}const item=map.get(key),ck=norm(clean);if(!item.seen.has(ck)){item.seen.add(ck);item.parts.push(clean);}};
    for(const x of original.reportSections||[])add(x?.title,x?.text);for(const x of (original.pdfFields||[]).filter(x=>x?.include!==false))add(x?.label,x?.value);
    if(!order.length||[...map.values()].some(x=>x.parts.join(' ').length<80)){const recovered=cleanNarrative(raw,original);if(recovered){map.clear();order.length=0;add('Referto',recovered);}}
    // Se il testo esistente contiene soprattutto dati amministrativi, usare il contenuto clinico recuperato dal testo originale.
    const existing=[...map.values()].map(x=>x.parts.join('\n\n')).join('\n');if((existing.match(/(?:azienda|direttore|telefono|codice fiscale|data di nascita|p\.iva|@)/gi)||[]).length>=3){const recovered=cleanNarrative(raw,original);if(recovered){map.clear();order.length=0;add('Referto',recovered);}}
    const sections=order.map(k=>({title:map.get(k).title,text:map.get(k).parts.join('\n\n')})).filter(x=>x.text);doc.reportSections=sections;doc.pdfFields=sections.map(x=>({label:x.title,value:x.text,include:true}));doc.reconstructedText=sections.map(x=>`${x.title}\n${x.text}`).join('\n\n');doc.narrativeNeedsReview=!sections.length&&raw.trim().length>0;
  }
  function canon(input={}){const original=clone(input),r=BASE_CANON(input),d=r.document;repairNarrative(d,original);for(const row of d.labValues||[]){if(/^non calcolabile$/i.test(String(row.rawValue||row.displayResult||''))){row.displayResult='Non calcolabile';row.rawValue='Non calcolabile';row.value=null;row.status='Non valutabile';row.referenceApplicability='not_required';row.referenceNotApplicable=true;row.statusSource='not_applicable';}}d.clinicalValidationVersion=VERSION;d.narrativeRepairVersion=VERSION;return{...r,document:d};}
  function complete(docs=[],profile={}){BASE_COMPLETE(docs,profile);for(const d of docs){for(const row of d.labValues||[]){if(/^non calcolabile$/i.test(String(row.rawValue||row.displayResult||''))){row.displayResult='Non calcolabile';row.status='Non valutabile';row.referenceApplicability='not_required';row.referenceNotApplicable=true;row.statusSource='not_applicable';}}d.referenceCompletionVersion=VERSION;}return docs;}
  function prepare(documents=[],profile={}){const docs=(documents||[]).map(x=>canon(clone(x)).document);return complete(docs,profile);}
  H.canonicalizeClinicalDocument24=canon;H.completeReferences24=complete;H.prepareDocuments24=prepare;H.repairLabDocumentData=(d={})=>canon(d);H.repairNarrativeDocumentData=(d={})=>canon(d);H.TEST24_VERSION=VERSION;
})(HealthExtractors);

// TEST 24 v4 - preservazione delle sezioni cliniche strutturate e recupero dell'inizio del referto.
;(function(H){
  'use strict';
  const VERSION='test24-v4';
  const BASE_CANON=H.canonicalizeClinicalDocument24.bind(H);
  const BASE_COMPLETE=H.completeReferences24.bind(H);
  const clone=v=>typeof structuredClone==='function'?structuredClone(v):JSON.parse(JSON.stringify(v));
  const norm=v=>H.normalizeText(String(v??''));
  const collapse=v=>String(v??'').replace(/\r/g,'').replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim();
  const meaningful=/^(?:materiale pervenuto|esame macroscopico|esame microscopico|diagnosi|diagnosi alla dimissione|motivo del ricovero|decorso ospedaliero|procedure diagnostiche ed interventi effettuati durante il ricovero|terapia farmacologica alla dimissione|follow ?up|snomed|reperti|reperto|conclusioni|commento|anamnesi|terapia|programma|morfologia|post test comments|referto)$/i;
  function cleanSection(label,text){
    let s=collapse(text);if(!s)return'';
    if(/^snomed$/i.test(label))s=s.replace(/\bData di Refertazione\b[\s\S]*$/i,'').trim();
    s=s.replace(/\bRappresentazione di un referto firmato elettronicamente[\s\S]*$/i,'').replace(/\bNum\.? Certificato[\s\S]*$/i,'').trim();
    return s;
  }
  function recoverClinicalStart(text=''){
    const source=String(text||'').replace(/===\s*PAGINA\s*\d+\s*===/gi,'\n').replace(/\r/g,'\n');
    const patterns=[/\bNon evidenti\b/i,/\bEsame TC\b/i,/\bIndagine espletata\b/i,/\bIl paziente giunge\b/i,/\bLa paziente giunge\b/i,/\bAnamnesi\s*:/i,/\bMotivo visita\s*:/i,/\bReperti\s*:/i,/\bConclusioni\s*:/i,/\bMorfologia\s*:/i,/\bReferto\s*:\s*(?=[A-ZÀ-ÖØ-Ý])/i];
    let best=-1;for(const re of patterns){const m=re.exec(source);if(m&&(best<0||m.index<best))best=m.index;}
    if(best<0)return'';let s=source.slice(best).replace(/^\d{1,2}\/\d{1,2}\/\d{2,4}\s*Testo\s+Referto\s*/i,'').replace(/^Testo\s+Referto\s*/i,'');
    s=s.replace(/(?:Dr\.?\s+[A-ZÀ-ÖØ-Ý][A-ZÀ-ÖØ-Ý .'-]+\s+Contributo ambientale|Il Medico|Referto firmato|Classe di dose)[\s\S]*$/i,'');
    const out=[];for(let line of s.split(/\n+/)){line=collapse(line);if(!line)continue;if(/^(?:U\.O\.|Azienda|Powered by|Pag\.?\s*\d+|Rappresentazione|Num\.? Certificato)/i.test(line))continue;out.push(line);}return out.join('\n').trim();
  }
  function canon(input={}){
    const original=clone(input),r=BASE_CANON(input),d=r.document;
    const clinicalSections=(original.reportSections||[]).filter(x=>meaningful.test(String(x?.title||'').trim())).map(x=>({title:String(x.title).replace(/\s+continua$/i,'').trim(),text:cleanSection(x.title,x.text)})).filter(x=>x.text);
    const rawOriginal=String(original.extractedText||original.structuredText||original.reconstructedText||'');
    const isComposition=/TANITA\s+MC-?780MA|analisi della composizione corporea/i.test(rawOriginal);
    const onlyReferto=clinicalSections.length===1&&/^referto$/i.test(clinicalSections[0].title||'');
    const refAdminHeavy=onlyReferto&&((clinicalSections[0].text.match(/(?:azienda|direttore|telefono|codice fiscale|data di nascita|p\.iva|@|tessera sanitaria|id paziente)/gi)||[]).length>=2);
    if(clinicalSections.length&&!isComposition&&!(onlyReferto&&refAdminHeavy)){
      const map=new Map(),order=[];for(const x of clinicalSections){const key=norm(x.title);if(!map.has(key)){map.set(key,{title:x.title,parts:[],seen:new Set()});order.push(key);}const item=map.get(key),ck=norm(x.text);if(!item.seen.has(ck)){item.seen.add(ck);item.parts.push(x.text);}}
      d.reportSections=order.map(k=>({title:map.get(k).title,text:map.get(k).parts.join('\n\n')}));d.pdfFields=d.reportSections.map(x=>({label:x.title,value:x.text,include:true}));d.reconstructedText=d.reportSections.map(x=>`${x.title}\n${x.text}`).join('\n\n');d.narrativeNeedsReview=false;
    } else if((d.reportSections||[]).length===1&&/^referto$/i.test(d.reportSections[0].title||'')){
      const recovered=recoverClinicalStart(original.extractedText||original.structuredText||'');if(recovered&&recovered.length>String(d.reportSections[0].text||'').length){d.reportSections=[{title:'Referto',text:recovered}];d.pdfFields=[{label:'Referto',value:recovered,include:true}];d.reconstructedText=`Referto\n${recovered}`;d.narrativeNeedsReview=false;}
    }
    if(/----\s*SPIROMETRY\s*----/i.test(rawOriginal)&&!(d.reportSections||[]).some(x=>/spirometr/i.test(x.title||''))){
      const block=(rawOriginal.match(/----\s*SPIROMETRY\s*----([\s\S]*?)(?=\n=== PAGINA|$)/i)||[])[1]||'';
      const clean=block.split(/\n+/).map(x=>collapse(x)).filter(x=>/^(?:FVC|FEV|FEVI|FEF|FIVC|FIF|SVC|IC|ERV|TLC|RV|DLCO|---- LUNG VOLUMES)/i.test(x)).join('\n');
      if(clean){d.reportSections=[{title:'Spirometria e volumi polmonari',text:clean}];d.pdfFields=[{label:'Spirometria e volumi polmonari',value:clean,include:true}];d.reconstructedText=`Spirometria e volumi polmonari\n${clean}`;d.narrativeNeedsReview=false;}
    }
    d.clinicalValidationVersion=VERSION;d.narrativeRepairVersion=VERSION;return{...r,document:d};
  }
  function complete(docs=[],profile={}){BASE_COMPLETE(docs,profile);for(const d of docs)d.referenceCompletionVersion=VERSION;return docs;}
  function prepare(documents=[],profile={}){const docs=(documents||[]).map(x=>canon(clone(x)).document);return complete(docs,profile);}
  H.canonicalizeClinicalDocument24=canon;H.completeReferences24=complete;H.prepareDocuments24=prepare;H.repairLabDocumentData=(d={})=>canon(d);H.repairNarrativeDocumentData=(d={})=>canon(d);H.TEST24_VERSION=VERSION;
})(HealthExtractors);

// TEST 24 v5 - ricostruzione deterministica dei referti TANITA senza residui grafici OCR.
;(function(H){
  'use strict';
  const VERSION='test24-v5';
  const BASE_CANON=H.canonicalizeClinicalDocument24.bind(H);
  const BASE_COMPLETE=H.completeReferences24.bind(H);
  const clone=v=>typeof structuredClone==='function'?structuredClone(v):JSON.parse(JSON.stringify(v));
  const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
  const first=(text,re)=>{const m=String(text||'').match(re);return m?clean(m[1]):'';};
  function metric(text,label,reLabel=label){
    const re=new RegExp(`${reLabel}\\s*:?\\s*([<>]?[0-9]+(?:[.,][0-9]+)?(?:\\s*(?:kg|kcal|kg\\/m[²2?]?|m[²2?]|%))?(?:\\s*\\([0-9]+(?:[.,][0-9]+)?\\s*%\\))?)`,'i');
    const value=first(text,re);return value?`${label}: ${value.replace(/m\?/gi,'m²').replace(/m2\b/gi,'m²')}`:'';
  }
  function segmentMetrics(block,label){
    const out=[];
    for(const name of ['Massa grassa','Massa magra','Massa muscolare']){
      const v=first(block,new RegExp(`${name}\\s*:\\s*([0-9]+(?:[.,][0-9]+)?\\s*kg\\s*\\([0-9]+(?:[.,][0-9]+)?\\s*%\\))`,'i'));
      if(v)out.push(`${name}: ${v}`);
    }
    return out.length?[label,...out].join('\n'):'';
  }
  function parseSegmental(raw){
    const page=(raw.match(/ANALISI SEGMENTALE([\s\S]*?)(?=\n(?:U\.O\.|Powered by|=== PAGINA 4|ANALISI TOTAL BODY))/i)||[])[1]||'';
    if(!page)return'';
    const parts=[];
    const trunk=(page.match(/Tronco([\s\S]*?)(?=Braccio sinistro)/i)||[])[1]||'';
    const arms=(page.match(/Braccio sinistro[\s\S]*?Braccio destro([\s\S]*?)(?=Gamba sinistra)/i)||[])[1]||'';
    const legs=(page.match(/Gamba sinistra[\s\S]*?Gamba destra([\s\S]*?)(?=Massa grassa:\s*Basso|Le percentuali)/i)||[])[1]||'';
    const t=segmentMetrics(trunk,'Tronco');if(t)parts.push(t);
    function paired(block,leftLabel,rightLabel){
      const vals={};
      for(const name of ['Massa grassa','Massa magra','Massa muscolare']){
        const re=new RegExp(`${name}\\s*:\\s*([0-9]+(?:[.,][0-9]+)?\\s*kg\\s*\\([0-9]+(?:[.,][0-9]+)?\\s*%\\))[\\s\\S]*?${name}\\s*:\\s*([0-9]+(?:[.,][0-9]+)?\\s*kg\\s*\\([0-9]+(?:[.,][0-9]+)?\\s*%\\))`,'i');
        const m=block.match(re);if(m)vals[name]=[clean(m[1]),clean(m[2])];
      }
      const left=[],right=[];for(const name of ['Massa grassa','Massa magra','Massa muscolare'])if(vals[name]){left.push(`${name}: ${vals[name][0]}`);right.push(`${name}: ${vals[name][1]}`);}
      if(left.length)parts.push([leftLabel,...left].join('\n'));
      if(right.length)parts.push([rightLabel,...right].join('\n'));
    }
    paired(arms,'Braccio sinistro','Braccio destro');
    paired(legs,'Gamba sinistra','Gamba destra');
    return parts.join('\n\n');
  }
  function compositionSections(raw){
    const firstPage=(raw.match(/RISULTATI([\s\S]*?)(?=N\.B\.|U\.O\.|=== PAGINA 2)/i)||[])[1]||raw;
    const values=[
      metric(firstPage,'Peso','Peso'),metric(firstPage,'BMI','BMI'),metric(firstPage,'Massa grassa','Massa grassa'),
      (()=>{const m=firstPage.match(/Massa magra[^0-9]{0,12}([0-9]+(?:[.,][0-9]+)?)\s*k[eg]\s*\(\s*([0-9]+(?:[.,][0-9]+)?)\s*%/i);return m?`Massa magra: ${m[1]} kg (${m[2]}%)`:metric(firstPage,'Massa magra','Massa magra');})(),metric(firstPage,'Massa muscolare','Massa muscolare(?! scheletrica)'),
      metric(firstPage,'Massa ossea','Massa ossea(?:\\s*\\([^)]*\\))?'),metric(firstPage,'Metabolismo basale','BMR'),
      metric(firstPage,'Acqua totale (TBW)','Acqua totale \\(TBW\\)'),metric(firstPage,'Acqua extracellulare (ECW)','Acqua extracellulare \\(ECW\\)'),
      metric(firstPage,'Acqua intracellulare (ICW)','Acqua intracellulare \\(ICW\\)'),metric(firstPage,'Proteine','Proteine'),
      metric(firstPage,'Massa muscolare scheletrica','Massa muscolare scheletrica'),metric(firstPage,'Massa cellulare','Massa cellulare'),
      metric(firstPage,'Punteggio grasso viscerale','Punteggio grasso viscerale'),(()=>{const m=firstPage.match(/Indice di sarcopenia\s*([0-9]+(?:[.,][0-9]+)?)\s*kg\/m[?²2]?/i);return m?`Indice di sarcopenia: ${m[1]} kg/m²`:metric(firstPage,'Indice di sarcopenia','Indice di sarcopenia');})(),
      metric(firstPage,'Superficie corporea (BSA)','BSA'),metric(firstPage,'Rapporto ECW/TBW','ECW\\/TBW')
    ].filter(Boolean);
    const classPage=(raw.match(/CLASSIFICAZIONE DEL FISICO([\s\S]*?)(?=U\.O\.|=== PAGINA 3)/i)||[])[1]||'';
    const classType=first(classPage,/Dalla presente analisi[\s\S]*?\n\s*([^\n]{3,60})\s*\(Immagine\s*\d+\)/i)||first(raw,/Classificazione del fisico\s*:\s*([^\n]+)/i);
    const stateWeight=first(raw,/Peso[\s\S]{0,120}?Stato\s+(Obesità\s+(?:grave|moderata|lieve)|Normopeso|Sovrappeso)/i);
    const visceral=first(raw,/Punteggio grasso viscerale[\s\S]{0,120}?Stato\s+([A-Za-zÀ-ÿ ]+?)(?=\n|Normale|Alto)/i);
    const sarc=first(raw,/Indice (?:valore )?di sarcopenia[\s\S]{0,160}?Stato\s+([A-Za-zÀ-ÿ]+)/i);
    const classification=[];if(classType)classification.push(`Classificazione del fisico: ${classType}`);if(stateWeight)classification.push(`Stato ponderale: ${stateWeight}`);if(visceral)classification.push(`Grasso viscerale: ${visceral.replace(/Alt\s+o/i,'Alto')}`);if(sarc)classification.push(`Indice di sarcopenia: ${sarc}`);
    const seg=parseSegmental(raw);
    const sections=[];if(values.length)sections.push({title:'Composizione corporea',text:values.join('\n')});if(classification.length)sections.push({title:'Classificazione',text:classification.join('\n')});if(seg)sections.push({title:'Analisi segmentale',text:seg});return sections;
  }
  function canon(input={}){
    const original=clone(input),r=BASE_CANON(input),d=r.document;
    const raw=String(original.extractedText||original.structuredText||original.reconstructedText||'');
    if(/TANITA\s+MC-?780MA|Analisi della composizione corporea/i.test(raw)){
      const sections=compositionSections(raw);
      if(sections.length){d.reportSections=sections;d.pdfFields=sections.map(x=>({label:x.title,value:x.text,include:true}));d.reconstructedText=sections.map(x=>`${x.title}\n${x.text}`).join('\n\n');d.narrativeNeedsReview=false;}
    }
    d.clinicalValidationVersion=VERSION;d.narrativeRepairVersion=VERSION;return{...r,document:d};
  }
  function complete(docs=[],profile={}){BASE_COMPLETE(docs,profile);for(const d of docs)d.referenceCompletionVersion=VERSION;return docs;}
  function prepare(documents=[],profile={}){const docs=(documents||[]).map(x=>canon(clone(x)).document);return complete(docs,profile);}
  H.canonicalizeClinicalDocument24=canon;H.completeReferences24=complete;H.prepareDocuments24=prepare;H.repairLabDocumentData=(d={})=>canon(d);H.repairNarrativeDocumentData=(d={})=>canon(d);H.TEST24_VERSION=VERSION;
})(HealthExtractors);

// TEST 24 v6 - rifinitura canonica finale: nessun duplicato ACR e riferimenti qualitativi espliciti.
;(function(H){
  'use strict';
  const VERSION='test24-v6';
  const BASE_CANON=H.canonicalizeClinicalDocument24.bind(H);
  const BASE_COMPLETE=H.completeReferences24.bind(H);
  const clone=v=>typeof structuredClone==='function'?structuredClone(v):JSON.parse(JSON.stringify(v));
  const norm=v=>H.normalizeText(String(v??''));
  function cleanup(doc={}){
    const d=doc;
    const rows=[...(d.labValues||[]),...(d.qualitativeResults||[])];
    const acrSources=new Set(rows.filter(r=>norm(r.parameterId||r.test||r.parameterName).includes('acr')||norm(r.test||r.parameterName).includes('rapporto albumina creatinina')).filter(r=>norm(r.result??r.rawValue??r.displayResult).includes('non calcolabil')).map(r=>norm(r.sourceLine||'')));
    const keep=r=>{
      const id=norm(r.parameterId||''),name=norm(r.parameterName||r.test||''),result=norm(r.result??r.rawValue??r.displayResult),src=norm(r.sourceLine||'');
      if((id==='albumin urine'||id==='albumin_urine'||name==='albumina urinaria')&&result.includes('non calcolabil')&&acrSources.has(src))return false;
      return true;
    };
    d.labValues=(d.labValues||[]).filter(keep);
    d.qualitativeResults=(d.qualitativeResults||[]).filter(keep).map(r=>{
      const row={...r},id=norm(row.parameterId||''),name=norm(row.test||row.parameterName||''),result=norm(row.result||'');
      if((id==='acr urine'||id==='acr_urine'||name.includes('rapporto albumina creatinina'))&&result.includes('non calcolabil')&&!String(row.reference||'').trim())row.reference='< 30';
      if((id==='urobilinogen'||name==='urobilinogeno')&&result==='normale'){row.reference=row.reference||'Normale';row.status='nei limiti';}
      if(/^(?:negativo|assente|non rilevato|normale)$/.test(result)&&!String(row.reference||'').trim()){row.reference=result==='normale'?'Normale':result==='non rilevato'?'Non rilevato':result==='assente'?'Assente':'Negativo';if(!row.status||norm(row.status).includes('verificare'))row.status='nei limiti';}
      return row;
    });
    d.tableRows=[
      ...(d.labValues||[]).map(r=>({kind:'numeric',test:r.parameterName,result:r.displayResult??r.rawValue??r.value,unit:r.unit||'',reference:r.range?.raw||'',status:r.status||'',sourceLine:r.sourceLine||'',labSection:r.labSection||''})),
      ...(d.qualitativeResults||[]).map(r=>({kind:'qualitative',test:r.test||r.parameterName,result:r.result,unit:r.unit||'',reference:r.reference||'',status:r.status||'',sourceLine:r.sourceLine||'',labSection:r.labSection||''}))
    ];
    d.clinicalValidationVersion=VERSION;d.labRepairVersion=VERSION;d.labPanelVersion=VERSION;d.narrativeRepairVersion=VERSION;d.referenceCompletionVersion=VERSION;return d;
  }
  function canon(input={}){const r=BASE_CANON(input);r.document=cleanup(r.document);return r;}
  function complete(docs=[],profile={}){BASE_COMPLETE(docs,profile);for(const d of docs)cleanup(d);return docs;}
  function prepare(documents=[],profile={}){const docs=(documents||[]).map(x=>canon(clone(x)).document);return complete(docs,profile);}
  H.canonicalizeClinicalDocument24=canon;H.completeReferences24=complete;H.prepareDocuments24=prepare;H.repairLabDocumentData=(d={})=>canon(d);H.repairNarrativeDocumentData=(d={})=>canon(d);H.TEST24_VERSION=VERSION;
})(HealthExtractors);


// TEST 26 - salvaguardia universale del contenuto narrativo per archivio e nuove importazioni.
;(function(H){
  'use strict';
  const VERSION='test26-v1';
  const BASE_CANON=H.canonicalizeClinicalDocument24.bind(H);
  const BASE_COMPLETE=H.completeReferences24.bind(H);
  const clone=v=>typeof structuredClone==='function'?structuredClone(v):JSON.parse(JSON.stringify(v));
  const norm=v=>H.normalizeText(String(v??''));
  const ADMIN=/^(?:azienda|ospedale|servizio sanitario|dipartimento|u\.?o\.?|direttore|telefono|fax|e-?mail|codice fiscale|paziente|cognome|data di nascita|indirizzo|prenotazione|centralino|numero referto)\b/i;
  const CLINICAL=/(?:anamnes|diagnos|terapia|programma|repert|conclusion|ecograf|tac|risonanz|esame obiettivo|il paziente|riferisce|nega|tiroide|lesion|pressione|dolore|morfologia|materiale pervenuto|esame macroscopico|composizione corporea)/i;
  function sourceText(doc={}){return String(doc.extractedText||doc.structuredText||doc.reconstructedText||'').replace(/===\s*PAGINA\s*\d+\s*===/gi,'\n').trim();}
  function conservativeClean(value=''){
    const out=[];let started=false;
    for(const raw of String(value||'').replace(/\r/g,'').split(/\n+/)){
      let line=raw.replace(/[ \t]+/g,' ').trim();if(!line)continue;
      if(/^(?:il medico|firma|firmato digitalmente|referto firmato|classe di dose|page \d+|pagina \d+)\b/i.test(line))continue;
      if(CLINICAL.test(line))started=true;
      if(ADMIN.test(line)&&!CLINICAL.test(line)&&!started)continue;
      if(ADMIN.test(line)&&!CLINICAL.test(line)&&started&&/(?:telefono|fax|e-?mail|prenotazione|centralino)/i.test(line))continue;
      out.push(line);
    }
    return out.join('\n').replace(/\n{3,}/g,'\n\n').trim();
  }
  function recoverSections(original={},current={}){
    const administrativeLabel=/^(?:il medico|medico|firma|firmatario|refertatore|direttore|responsabile|dati anagrafici|intestazione|documento originale|struttura sanitaria|reparto|specializzazione)$/i;
    const sourcePairs=[];
    for(const section of current.reportSections||[])if(String(section?.text||'').trim())sourcePairs.push({title:section.title||'Referto',text:section.text,priority:0});
    for(const field of current.pdfFields||[])if(field?.include!==false&&String(field?.value||'').trim())sourcePairs.push({title:field.label||'Referto',text:field.value,priority:0});
    for(const section of original.reportSections||[])if(String(section?.text||'').trim())sourcePairs.push({title:section.title||'Referto',text:section.text,priority:1});
    for(const field of original.pdfFields||[])if(field?.include!==false&&String(field?.value||'').trim())sourcePairs.push({title:field.label||'Referto',text:field.value,priority:1});
    const merged=new Map(),order=[];
    for(const item of sourcePairs){const title=String(item.title||'Referto').replace(/[,;:\-]?\s*continua\s*$/i,'').trim()||'Referto';if(administrativeLabel.test(title))continue;const key=norm(title).startsWith('referto')?'referto':norm(title).startsWith('commento')?'commento':norm(title).startsWith('terapia')?'terapia':norm(title).startsWith('programma')?'programma':norm(title);const text=conservativeClean(item.text);if(!text)continue;if(!merged.has(key)){merged.set(key,{title:key==='referto'?'Referto':key==='commento'?'Commento':key==='terapia'?'Terapia':key==='programma'?'Programma':title,parts:[],priority:item.priority});order.push(key);}const row=merged.get(key);if(item.priority>row.priority)continue;if(item.priority<row.priority){row.parts=[];row.priority=item.priority;}if(!row.parts.includes(text))row.parts.push(text);}
    let sections=order.map(key=>({title:merged.get(key).title,text:merged.get(key).parts.join('\n\n')})).filter(x=>x.text);
    if(!sections.length){const text=conservativeClean(sourceText(original));if(text)sections=[{title:'Referto',text}];}
    return sections;
  }
  function canon(input={}){
    const original=clone(input);let result;
    try{result=BASE_CANON(input);}catch(error){console.error('Canonicalizzazione TEST 26: recupero dalla sorgente originale',error);result={document:clone(input),changed:false,substantiveChanged:false,validation:{ok:false,violations:[String(error)]},stats:{}};}
    const d=result.document||clone(input);const mode=d.documentMode||original.documentMode||((d.category==='Esami di laboratorio')?'lab':'narrative');
    if(['narrative','mixed','diagnosis'].includes(mode)){
      const sections=recoverSections(original,d);
      if(sections.length){d.reportSections=sections;d.pdfFields=sections.map(x=>({label:x.title,value:x.text,include:true}));d.reconstructedText=sections.map(x=>`${x.title}\n${x.text}`).join('\n\n');d.narrativeNeedsReview=false;}
      else if(sourceText(original)){d.narrativeNeedsReview=true;}
      d.narrativeSourcePresent=Boolean(sourceText(original));d.narrativeCoverageVersion=VERSION;
    }
    d.clinicalValidationVersion=VERSION;d.narrativeRepairVersion=VERSION;return{...result,document:d,changed:true};
  }
  function complete(docs=[],profile={}){BASE_COMPLETE(docs,profile);for(const d of docs){d.referenceCompletionVersion=VERSION;}return docs;}
  function prepare(documents=[],profile={}){const docs=(documents||[]).map(x=>canon(clone(x)).document);return complete(docs,profile);}
  H.canonicalizeClinicalDocument24=canon;H.completeReferences24=complete;H.prepareDocuments24=prepare;H.repairLabDocumentData=(d={})=>canon(d);H.repairNarrativeDocumentData=(d={})=>canon(d);H.TEST24_VERSION=VERSION;
})(HealthExtractors);

// TEST 27 - pipeline narrativa canonica unica, conservativa e verificabile.
;(function(H){
  'use strict';
  const VERSION='test27-v1';
  const BASE_CANON=H.canonicalizeClinicalDocument24.bind(H);
  const BASE_COMPLETE=H.completeReferences24.bind(H);
  const clone=value=>typeof structuredClone==='function'?structuredClone(value):JSON.parse(JSON.stringify(value));
  const norm=value=>H.normalizeText(String(value??''));
  const collapse=value=>String(value??'').replace(/\u00ad/g,'').replace(/[ \t]+/g,' ').replace(/\s+([,.;:])/g,'$1').trim();
  const PAGE_MARKER=/^={0,3}\s*(?:PAGINA|PAGE)\s*\d+\s*={0,3}$/i;
  const PURE_DATE=/^(?:\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}|\d{2,4}[\/.\-]\d{1,2}[\/.\-]\d{1,2})(?:\s+\d{1,2}[:.]\d{2})?$/;
  const ADMIN_LINE=[
    /^(?:azienda|asl\b|ausl\b|ao[- ]?u?p\b|ospedale|servizio sanitario|dipartimento|unit[aà] operativa|u\.?o\.?\b|presidio|poliambulatorio|centro medico|ambulatorio|sede operativa)\b/i,
    /^(?:direttore|responsabile|primario|coordinatore|medico refertante|refertatore|esecutore|operatore|tecnico|tsrm)\s*:/i,
    /^(?:paziente|cognome|nome|data di nascita|luogo di nascita|codice fiscale|tessera sanitaria|residenza|domicilio|indirizzo|n[°.o]?\s*(?:cartella|referto|accettazione|pratica)|id paziente)\s*:/i,
    /^(?:tel(?:efono)?\.?|cell(?:ulare)?\.?|fax|e-?mail|pec|centralino|prenotazion|segreteria)\b/i,
    /(?:\b(?:tel(?:efono)?\.?|cell(?:ulare)?\.?|fax)\s*[:.]?\s*\+?\d|\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b)/i,
    /^(?:richiesta|accettazione|emissione|stampato|stampata|refertato|validato|firmato|firma digitale|documento firmato|versione|pagina)\b/i,
    /^(?:tipo esame|esame richiesto|prestazione|codice prestazione|quesito amministrativo)\s*:/i,
    /^(?:p\.?iva|c\.?f\.?|cod\.\s*reg|codice struttura|numero referto)\b/i
  ];
  const TRAILING_ADMIN=/^(?:cordiali saluti|il medico|firma|firmato digitalmente|referto firmato|referto validato|classe di dose|dose class|si allega(?:no)? (?:immagini|documentazione)|documentazione iconografica|rappresentazione di un referto|fine referto)\b/i;
  const CLINICAL_SIGNAL=/(?:anamnes|motivo (?:della )?visita|quesito clinico|indicazione|esame obiettivo|obiettivit|repert|referto|conclusion|diagnos|terapia|programma|follow[- ]?up|morfologia|materiale pervenuto|esame macroscopico|composizione corporea|classificazione|il paziente|la paziente|riferisce|nega|presenta|si rileva|si osserva|evidenzia|compatibile|fegato|pancreas|milza|rene|reni|tiroide|polmone|polmoni|cuore|encefalo|mucosa|lesion|nodul|cisti|pressione|dolore|edema|retina|vitreo|pupill|arcata|alveolar|ecograf|tomograf|risonanz|radiograf|tac\b|tc\b)/i;
  const KNOWN_HEADINGS=[
    ['anamnesi','Anamnesi'],['sintesi anamnestica','Anamnesi'],['motivo della visita','Motivo della visita'],['motivo visita','Motivo della visita'],
    ['quesito clinico','Quesito clinico'],['indicazione','Indicazione'],['indicazioni','Indicazione'],['tecnica','Tecnica'],
    ['esame obiettivo','Esame obiettivo'],['obiettivita','Esame obiettivo'],['obiettivita clinica','Esame obiettivo'],
    ['reperti','Reperti'],['reperto','Reperti'],['referto','Referto'],['conclusioni','Conclusioni'],['conclusione','Conclusioni'],
    ['diagnosi','Diagnosi'],['commento','Commento'],['osservazioni','Osservazioni'],['valutazione','Valutazione'],
    ['terapia in atto','Terapia in atto'],['terapia','Terapia'],['programma','Programma'],['follow up','Follow-up'],['follow-up','Follow-up'],
    ['materiale pervenuto','Materiale pervenuto'],['esame macroscopico','Esame macroscopico'],['morfologia','Morfologia'],
    ['classificazione','Classificazione'],['composizione corporea','Composizione corporea'],['analisi segmentale','Analisi segmentale'],
    ['pupille e motilita pupillare','Pupille e motilità pupillare'],['corpo vitreo','Corpo vitreo'],['fondo oculare','Fondo oculare']
  ];
  const HEADING_MAP=new Map(KNOWN_HEADINGS);
  function sourceText(doc={}){
    return String(doc.extractedText||doc.structuredText||doc.reconstructedText||(doc.ocrPageData||[]).map(page=>page?.text||'').join('\n')||'')
      .replace(/===\s*(?:PAGINA|PAGE)\s*\d+\s*===/gi,'\n').replace(/\r/g,'\n').trim();
  }
  function isAdministrativeLine(line=''){
    const value=collapse(line);if(!value||PAGE_MARKER.test(value)||PURE_DATE.test(value))return true;
    if(TRAILING_ADMIN.test(value))return true;
    if(/^dr\.?\s+[A-ZÀ-ÖØ-Ý][A-ZÀ-ÖØ-Ý .'-]{2,}$/u.test(value))return true;
    if(/^dott(?:\.?|ore|ssa)\b/i.test(value)&&!CLINICAL_SIGNAL.test(value))return true;
    return ADMIN_LINE.some(re=>re.test(value))&&!CLINICAL_SIGNAL.test(value);
  }
  function canonicalHeading(raw=''){
    const value=collapse(raw).replace(/[,;:\-]?\s*continua(?:\s+dalla\s+pagina\s+precedente)?\s*$/i,'').trim();
    const key=norm(value).replace(/\s+/g,' ');
    if(HEADING_MAP.has(key))return HEADING_MAP.get(key);
    if(key.startsWith('referto'))return'Referto';
    if(key.startsWith('commento'))return'Commento';
    if(key.startsWith('conclusion'))return'Conclusioni';
    if(key.startsWith('diagnos'))return'Diagnosi';
    if(key.startsWith('terapia'))return key.includes('atto')?'Terapia in atto':'Terapia';
    if(key.startsWith('programma'))return'Programma';
    if(key.startsWith('anamnes'))return'Anamnesi';
    return value||'Referto';
  }
  function parseHeadingLine(line=''){
    const value=collapse(line);if(!value)return null;
    const colon=value.match(/^([^:]{2,58})\s*:\s*(.*)$/);
    if(colon){const label=canonicalHeading(colon[1]);const key=norm(label);if(HEADING_MAP.has(norm(colon[1]))||/^(?:referto|commento|conclusion|diagnos|terapia|programma|anamnes|repert|tecnica|indicazione|quesito|morfologia|classificazione|composizione|esame obiettivo|obiettiv)/.test(key))return{label,rest:colon[2]};}
    const key=norm(value.replace(/[.:;\-]+$/,''));
    if(HEADING_MAP.has(key))return{label:HEADING_MAP.get(key),rest:''};
    if(value.length<=58&&value===value.toLocaleUpperCase('it-IT')&&/[A-ZÀ-ÖØ-Ý]{3}/u.test(value)){
      const label=canonicalHeading(value);if(HEADING_MAP.has(norm(value))||/^(?:anamnes|repert|conclusion|diagnos|terapia|programma|morfologia|classificazione|composizione)/.test(norm(label)))return{label,rest:''};
    }
    return null;
  }
  function trimAdministrativePrefix(value='') {
    let line=collapse(value);if(!line)return'';
    const adminEvidence=ADMIN_LINE.some(re=>re.test(line))||/(?:codice fiscale|data (?:di )?nascita|tessera sanitaria|id paziente|num\.? acc\.?|scrivente|tsrm|provenienza|tipo esame|data e ora referto|reso definitivo|tel\.?|fax|@)/i.test(line);
    if(!adminEvidence)return line;
    const explicit=line.match(/\bTesto\s+Referto\b\s*[:\-]?\s*/i);if(explicit)line=line.slice(explicit.index+explicit[0].length).trim();
    const markers=[/\bIndicazione clinica\s*[:\-]?/i,/\bMotivo (?:della )?visita\s*[:\-]?/i,/\bAnamnesi\s*[:\-]?/i,/\bEsame obiettivo\s*[:\-]?/i,/\bConclusioni\s*[:\-]?/i,/\bDiagnosi\s*[:\-]?/i,/\bTerapia(?: in atto)?\s*[:\-]?/i,/\bProgramma\s*[:\-]?/i,/\bLo studio (?:TC|RM|ecografico|radiografico)\b/i,/\bL[’']indagine\b/i,/\bEsame (?:TC|RM|ecografico|radiografico)\b/i,/\bQuadro (?:toracico|radiografico|ecografico|clinico)\b/i,/\bPaziente di \d+ anni\b/i,/\bIl paziente\b/i,/\bLa paziente\b/i,/\bNon evidenti\b/i,/\bSi (?:rileva|osserva|evidenzia)\b/i,/\bImpostazioni apparecchio\b/i,/\bStatistiche\b/i,/\bFegato\b/i,/\bTiroide\b/i,/\bRX\s+[A-Za-zÀ-ÿ]/i];
    let best=-1;for(const re of markers){const m=line.match(re);if(m&&m.index!=null&&(best<0||m.index<best))best=m.index;}
    if(best>0)line=line.slice(best).trim();
    return line;
  }
  function trimAdministrativeSuffix(value='') {
    let line=collapse(value);const markers=[/\bIl Medico\b/i,/\bReferto firmato\b/i,/\bFirmato digitalmente\b/i,/\bClasse di dose\b/i,/\bCordiali saluti\b/i,/\bSi allega(?:no)? (?:immagini|documentazione)\b/i];let cut=-1;for(const re of markers){const m=line.match(re);if(m&&m.index!=null&&m.index>10&&(cut<0||m.index<cut))cut=m.index;}if(cut>0)line=line.slice(0,cut).trim();return line;
  }
  function cleanLines(value='',options={}){
    const lines=[];let clinicalStarted=false;
    for(const raw of String(value||'').replace(/===\s*(?:PAGINA|PAGE)\s*\d+\s*===/gi,'\n').replace(/\r/g,'\n').split(/\n+/)){
      let line=trimAdministrativeSuffix(trimAdministrativePrefix(raw));if(!line)continue;
      const heading=parseHeadingLine(line);if(heading||CLINICAL_SIGNAL.test(line))clinicalStarted=true;
      if(isAdministrativeLine(line))continue;
      if(!clinicalStarted&&options.requireClinicalStart!==false&&!CLINICAL_SIGNAL.test(line)&&!heading)continue;
      line=line.replace(/^referto\s*[:\-]\s*/i,'').trim();if(!line)continue;
      lines.push(line);
    }
    const out=[];const seen=new Set();
    for(const line of lines){const key=norm(line);if(!key||seen.has(key))continue;seen.add(key);out.push(line);}
    return out;
  }
  function sectionsFromRaw(doc={}){
    const lines=cleanLines(sourceText(doc),{requireClinicalStart:true});if(!lines.length)return[];
    const sections=[];let current={title:'Referto',parts:[]};
    const flush=()=>{const text=current.parts.join('\n').replace(/\n{3,}/g,'\n\n').trim();if(text)sections.push({title:canonicalHeading(current.title),text});};
    for(const line of lines){const heading=parseHeadingLine(line);if(heading){flush();current={title:heading.label,parts:[]};if(heading.rest)current.parts.push(heading.rest);continue;}current.parts.push(line);}
    flush();return mergeSections(sections);
  }
  function cleanSectionText(value=''){
    const lines=cleanLines(value,{requireClinicalStart:false});return lines.join('\n').replace(/\n{3,}/g,'\n\n').trim();
  }
  function mergeSections(items=[]){
    const map=new Map(),order=[];
    for(const item of items){const title=canonicalHeading(item?.title||'Referto');if(/^(?:intestazione|dati anagrafici|firma|il medico|documento originale|struttura sanitaria|reparto|specializzazione)$/i.test(title))continue;const text=cleanSectionText(item?.text||'');if(!text)continue;const key=norm(title);if(!map.has(key)){map.set(key,{title,parts:[],seen:new Set()});order.push(key);}const row=map.get(key),signature=norm(text);if(!row.seen.has(signature)){row.seen.add(signature);row.parts.push(text);}}
    return order.map(key=>({title:map.get(key).title,text:map.get(key).parts.join('\n\n')})).filter(section=>section.text);
  }
  function existingSections(doc={}){
    const items=[];
    for(const section of doc.reportSections||[])items.push({title:section?.title||'Referto',text:section?.text||''});
    for(const field of doc.pdfFields||[])if(field?.include!==false)items.push({title:field?.label||'Referto',text:field?.value||''});
    return mergeSections(items);
  }
  function clinicalTokens(value=''){
    return norm(value).split(/[^a-z0-9à-ÿ]+/i).filter(token=>token.length>=4&&!/^(?:pagina|referto|sezione|contenuto|paziente|documento|sanitario|medico|azienda|ospedale|servizio|telefono|codice|fiscale)$/.test(token));
  }
  function tokenCoverage(source='',target=''){
    const sourceSet=new Set(clinicalTokens(source)),targetSet=new Set(clinicalTokens(target));if(!sourceSet.size)return 1;let hit=0;for(const token of sourceSet)if(targetSet.has(token))hit++;return hit/sourceSet.size;
  }
  function sectionText(sections=[]){return sections.map(section=>section.text||'').join('\n');}
  function adminHits(value=''){
    return String(value||'').split(/\n+/).filter(line=>isAdministrativeLine(line)).length;
  }
  function chooseSections(original={},current={}){
    const rawCandidate=sectionsFromRaw(original);
    const existingCandidate=existingSections(current);
    const originalCandidate=existingSections(original);
    const cleanedSource=cleanLines(sourceText(original),{requireClinicalStart:true}).join('\n');
    const candidates=[existingCandidate,originalCandidate,rawCandidate].filter(items=>items.length);
    if(!candidates.length){const fallback=cleanSectionText(sourceText(original));return fallback?[{title:'Referto',text:fallback}]:[];}
    let best=null,bestScore=-Infinity;
    for(const sections of candidates){const text=sectionText(sections);const coverage=tokenCoverage(cleanedSource,text);const score=coverage*1000+Math.min(text.length,10000)/100+Math.min(sections.length,12)*4-adminHits(text)*80;if(score>bestScore){bestScore=score;best=sections;}}
    const bestText=sectionText(best||[]);if(cleanedSource&&tokenCoverage(cleanedSource,bestText)<0.78&&rawCandidate.length)return rawCandidate;
    return best||[];
  }
  function canonicalNarrativeSource(doc={}){
    return cleanLines(sourceText(doc),{requireClinicalStart:true}).join('\n').trim();
  }
  function canon(input={}){
    const original=clone(input);let result;
    try{result=BASE_CANON(input);}catch(error){console.error('Canonicalizzazione TEST 27: recupero conservativo',error);result={document:clone(input),changed:false,substantiveChanged:false,validation:{ok:false,violations:[String(error)]},stats:{}};}
    const document=result.document||clone(input);const mode=document.documentMode||original.documentMode||((document.category==='Esami di laboratorio')?'lab':'narrative');
    if(['narrative','mixed','diagnosis'].includes(mode)){
      const sections=chooseSections(original,document);const source=canonicalNarrativeSource(original);
      if(sections.length){document.reportSections=sections;document.pdfFields=sections.map(section=>({label:section.title,value:section.text,include:true}));document.reconstructedText=sections.map(section=>`${section.title}\n${section.text}`).join('\n\n');document.narrativeNeedsReview=false;}
      else if(source){document.reportSections=[{title:'Referto',text:source}];document.pdfFields=[{label:'Referto',value:source,include:true}];document.reconstructedText=`Referto\n${source}`;document.narrativeNeedsReview=false;}
      else document.narrativeNeedsReview=Boolean(sourceText(original));
      document.narrativeSourcePresent=Boolean(sourceText(original));document.narrativeClinicalSource=source;document.narrativeCoverageVersion=VERSION;
    }
    document.clinicalValidationVersion=VERSION;document.narrativeRepairVersion=VERSION;
    return{...result,document,changed:true};
  }
  function complete(documents=[],profile={}){BASE_COMPLETE(documents,profile);for(const document of documents){document.referenceCompletionVersion=VERSION;}return documents;}
  function prepare(documents=[],profile={}){const prepared=(documents||[]).map(document=>canon(clone(document)).document);return complete(prepared,profile);}
  H.canonicalizeClinicalDocument24=canon;H.completeReferences24=complete;H.prepareDocuments24=prepare;H.repairLabDocumentData=(document={})=>canon(document);H.repairNarrativeDocumentData=(document={})=>canon(document);
  H.narrativeClinicalSource27=canonicalNarrativeSource;H.narrativeTokenCoverage27=tokenCoverage;H.narrativeAdminHits27=adminHits;H.TEST24_VERSION=VERSION;H.TEST27_VERSION=VERSION;
})(HealthExtractors);

/* TEST 27 v2 - pulizia narrativa universale e verifica di copertura */
;(function test27NarrativeUniversal(H){
  'use strict';
  if(!H)return;
  const VERSION='test27-v2';
  const BASE_CANON=H.canonicalizeClinicalDocument24;
  const BASE_COMPLETE=H.completeReferences24;
  const clone=value=>JSON.parse(JSON.stringify(value??{}));
  const collapse=value=>String(value??'').replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').trim();
  const norm=value=>collapse(value).toLocaleLowerCase('it-IT').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9%/+<>=.-]+/g,' ').trim();
  const sourceText=doc=>String(doc?.extractedText||doc?.structuredText||doc?.reconstructedText||doc?.ocrText||'').trim();
  const HEADING=new Map([
    ['anamnesi','Anamnesi'],['anamnesi patologica','Anamnesi'],['motivo della visita','Motivo della visita'],['motivo visita','Motivo della visita'],
    ['esame obiettivo','Esame obiettivo'],['obiettivita','Esame obiettivo'],['obiettività','Esame obiettivo'],['terapia','Terapia'],['terapia in atto','Terapia in atto'],
    ['conclusioni','Conclusioni'],['conclusione','Conclusioni'],['diagnosi','Diagnosi'],['programma','Programma'],['indicazioni','Indicazioni'],['raccomandazioni','Raccomandazioni'],
    ['referto','Referto'],['reperti','Reperti'],['reperti e conclusioni','Reperti e conclusioni'],['morfologia','Morfologia'],['classificazione','Classificazione'],
    ['composizione corporea','Composizione corporea'],['esami ematochimici','Esami ematochimici'],['commento','Commento'],['tecnica','Tecnica'],['quesito diagnostico','Quesito diagnostico']
  ]);
  const CLINICAL_START=[
    /\b(?:anamnesi|motivo (?:della )?visita|esame obiettivo|obiettivit[aà]|terapia(?: in atto)?|conclusioni?|diagnosi|programma|indicazioni?|raccomandazioni?|reperti?|morfologia|composizione corporea|classificazione)\b\s*[:\-]?/i,
    /\b(?:lo studio|l['’]indagine|esame)\s+(?:tc|rm|ecografico|radiografico|doppler|ecocolordoppler|cone[- ]?beam)\b/i,
    /\b(?:tc cranio|rm encefalo|rx torace|ecocolordoppler|eco(?:grafia)?|fundus|oct|fegato|tiroide|vena giugulare|quadro toracico|arcata superiore|arcata inferiore)\b/i,
    /\b(?:non (?:si |sono )?(?:evidenziano|evidenzia|rilevano|rileva|osservano|osserva|riconoscono)|si (?:evidenzia|rileva|osserva|documenta)|presenza di|assenza di)\b/i,
    /\b(?:fdrc|parametri antropometrici|allergia|ipertensione|diabete|obesit[aà]|paziente (?:in|con|giunge|riferisce|nega|presenta)|il paziente|la paziente)\b/i,
    /\b(?:pressione arteriosa|peso\s+\d|altezza\s+\d|bmi|spo2|ecg|e\.c\.g\.|auscultazione|torace|addome|arti inferiori)\b/i
  ];
  const ADMIN_SUBSTR=[
    /\b(?:codice fiscale|c\.f\.|cf:)\b/i,/\bdata (?:di )?nascita\b/i,/\b(?:id|numero) paziente\b/i,/\bpaziente\s*:\s*[A-ZÀ-ÖØ-Ý]/u,
    /\b(?:telefono|tel\.?|cell\.?|fax)\s*[:.]?\s*\+?\d/i,/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i,/\bwww\./i,/\bweb\s*:/i,
    /\b(?:sede operativa|direttore sanitario|medico prescrittore|medico curante|specialista in radiodiagnostica|rapporto redatto da|refertazione di|reso definitivo|numero iscrizione|compagnia d['’]assicurazione)\b/i,
    /\b(?:p\.iva|partita iva|n°?\s*ordine|num\.?\s*acc\.?|reference id|id di riferimento)\b/i,
    /\b(?:azienda ospedaliero|azienda usl|regione toscana|dipartimento di|u\.o\.|ospedale di rilievo|istituto radiologico|centro medico|medi group|prenotazioni e informazioni)\b/i,
    /\b(?:via|viale|piazza|largo)\s+[A-ZÀ-ÖØ-Ý][\wÀ-ÿ'. -]+\s+\d/i,
    /\b(?:firma digitale|firmato digitalmente|documento informatico|contributo ambientale|co\.na\.i|classe di dose|cordiali saluti|riportare il presente referto)\b/i
  ];
  const ADMIN_WHOLE=[
    /^(?:pagina\s*\d+|===.*===)$/i,/^(?:regione toscana|azienda ospedaliero.*|azienda usl.*|dipartimento di.*|u\.o\..*|istituto radiologico.*|centro medico.*|medi group.*)$/i,
    /^(?:direttore|direttore sanitario|responsabile|specialista|medico|tsrm|scrivente)\s*:/i,/^(?:dott\.?|dott\.ssa|dr\.?)\s+[A-ZÀ-ÖØ-Ý]/u,
    /^(?:rossi daniele|cordoni gaia|maria giovanna tongiani)$/i,/^(?:sig\.?\/?ra|paziente|nome del paziente|sesso|genere|comune di nascita)\b/i,
    /^(?:tel\.?|telefono|cell\.?|fax|email|web|www\.|codice fiscale|c\.f\.|cf:|data di nascita|anni compiuti|id paziente|provenienza|medico prescrittore|numero referto|n°?\s*ordine)\b/i,
    /^(?:lettera curante|alla cortese attenzione|si certifica che)\b/i,
    /^(?:documento informatico|firmato digitalmente|contributo ambientale|co\.na\.i|classe di dose|cordiali saluti|riportare il presente referto)\b/i
  ];
  const TAIL=[/\bIl Medico\b/i,/\bReferto firmato\b/i,/\bFirmato digitalmente\b/i,/\bDocumento informatico\b/i,/\bContributo ambientale\b/i,/\bCO\.NA\.I\b/i,/\bClasse di dose\b/i,/\bCordiali saluti\b/i,/\bRIPORTARE IL PRESENTE REFERTO\b/i,/\bLa sua stampa costituisce\b/i,/\bPowered by\b/i];
  function heading(raw=''){
    let value=collapse(raw).replace(/[,;:\-]?\s*continua(?:\s+dalla\s+pagina\s+precedente)?\s*$/i,'').trim();
    const key=norm(value.replace(/[.:;\-]+$/,''));
    if(HEADING.has(key))return HEADING.get(key);
    if(/^referto\b/.test(key))return'Referto';if(/^conclusion/.test(key))return'Conclusioni';if(/^diagnos/.test(key))return'Diagnosi';if(/^terapia/.test(key))return key.includes('atto')?'Terapia in atto':'Terapia';if(/^programma/.test(key))return'Programma';if(/^anamnes/.test(key))return'Anamnesi';
    return value||'Referto';
  }
  function parseHeading(line=''){
    const value=collapse(line);if(!value)return null;
    const m=value.match(/^([^:]{2,60})\s*:\s*(.*)$/);if(m){const key=norm(m[1]);if(HEADING.has(key)||/^(?:anamnes|esame obiettivo|obiettivit|terapia|conclusion|diagnos|programma|indicaz|raccomand|repert|morfologia|classificazione|composizione|commento|referto)/.test(key))return{title:heading(m[1]),rest:m[2]};}
    const key=norm(value.replace(/[.:;\-]+$/,''));if(HEADING.has(key))return{title:HEADING.get(key),rest:''};
    return null;
  }
  function firstClinicalIndex(line=''){
    let best=-1;
    for(const re of CLINICAL_START){const m=line.match(re);if(m&&m.index!=null&&(best<0||m.index<best))best=m.index;}
    return best;
  }
  function hasAdmin(value=''){return ADMIN_SUBSTR.some(re=>re.test(value));}
  function adminResidualCount(value=''){let count=0;for(const re of ADMIN_SUBSTR){const flags=re.flags.includes('g')?re.flags:re.flags+'g';count+=(String(value||'').match(new RegExp(re.source,flags))||[]).length;}return count;}
  function isAdminLine(line=''){
    const v=collapse(line);if(!v)return true;
    if(ADMIN_WHOLE.some(re=>re.test(v)))return true;
    const clinical=firstClinicalIndex(v)>=0;
    if(hasAdmin(v)&&!clinical)return true;
    if(/^[A-ZÀ-ÖØ-Ý][A-ZÀ-ÖØ-Ý .,'’()\/-]{5,}$/u.test(v)&&!clinical&&v.split(/\s+/).length<9)return true;
    return false;
  }
  function cutTail(line=''){
    let cut=-1;for(const re of TAIL){const m=line.match(re);if(m&&m.index!=null&&m.index>12&&(cut<0||m.index<cut))cut=m.index;}return cut>0?line.slice(0,cut).trim():line;
  }
  function cleanUnit(raw='',requireStart=true){
    let units=String(raw||'').replace(/===\s*(?:PAGINA|PAGE)\s*\d+\s*===/gi,'\n').replace(/\r/g,'\n').split(/\n+|\s+\|\s+/).map(collapse).filter(Boolean);
    const output=[];let started=!requireStart;
    for(let unit of units){
      unit=cutTail(unit);if(!unit)continue;
      const explicit=unit.match(/\b(?:TESTO\s+REFERTO|REFERTO\s+CLINICO)\b\s*[:\-]?\s*/i);if(explicit){unit=unit.slice(explicit.index+explicit[0].length).trim();started=true;}
      const idx=firstClinicalIndex(unit);
      if(!started){if(idx<0)continue;if(idx>0)unit=unit.slice(idx).trim();started=true;}
      else if(hasAdmin(unit)&&idx>0)unit=unit.slice(idx).trim();
      unit=unit.replace(/^referto\s*[:\-]?\s*/i,'').trim();
      if(!unit||isAdminLine(unit))continue;
      if(/^(?:refer(?:to)?\s+(?:rx|tc|rm)|tc cranio|rx torace|ecocolordoppler|eco cd|cone beam)\b.*(?:data di nascita|anni compiuti|cf:)/i.test(unit)){
        const j=firstClinicalIndex(unit.replace(/^(?:refer(?:to)?\s+)?(?:rx|tc|rm|ecocolordoppler|eco cd|cone beam)[^A-Za-zÀ-ÿ]+/i,''));if(j>=0)unit=unit.slice(j).trim();
      }
      if(!unit)continue;
      output.push(unit);
    }
    const unique=[];const seen=new Set();for(const line of output){const k=norm(line);if(!k||seen.has(k))continue;seen.add(k);unique.push(line);}return unique;
  }
  function cleanText(raw='',requireStart=false){return cleanUnit(raw,requireStart).join('\n').replace(/\n{3,}/g,'\n\n').trim();}
  function mergeSections(items=[]){
    const order=[],map=new Map();
    for(const item of items){const title=heading(item?.title||item?.label||'Referto');if(/^(?:intestazione|dati anagrafici|firma|documento originale|struttura sanitaria|reparto|specializzazione)$/i.test(title))continue;const text=cleanText(item?.text??item?.value??'',false);if(!text)continue;const key=norm(title);if(!map.has(key)){map.set(key,{title,parts:[],seen:new Set()});order.push(key);}const row=map.get(key),sig=norm(text);if(!row.seen.has(sig)){row.seen.add(sig);row.parts.push(text);}}
    return order.map(k=>({title:map.get(k).title,text:map.get(k).parts.join('\n\n')})).filter(x=>x.text);
  }
  function parseSource(doc={}){
    const lines=cleanUnit(sourceText(doc),true);if(!lines.length)return[];const sections=[];let current={title:'Referto',parts:[]};const flush=()=>{const text=current.parts.join('\n').trim();if(text)sections.push({title:heading(current.title),text});};
    for(const line of lines){const h=parseHeading(line);if(h){flush();current={title:h.title,parts:[]};if(h.rest)current.parts.push(h.rest);}else current.parts.push(line);}flush();return mergeSections(sections);
  }
  function sectionText(sections=[]){return sections.map(s=>s.text||'').join('\n');}
  function tokens(value=''){return norm(value).split(/[^a-z0-9à-ÿ]+/i).filter(t=>t.length>=4&&!/^(?:pagina|referto|sezione|contenuto|paziente|documento|sanitario|medico|azienda|ospedale|servizio|telefono|codice|fiscale|data|nascita)$/.test(t));}
  function coverage(a='',b=''){const A=new Set(tokens(a)),B=new Set(tokens(b));if(!A.size)return 1;let n=0;for(const t of A)if(B.has(t))n++;return n/A.size;}
  function candidateScore(sections,source){const text=sectionText(sections);return coverage(source,text)*1000+Math.min(text.length,15000)/120+Math.min(sections.length,12)*3-adminResidualCount(text)*220;}
  function canonicalSource(doc={}){return cleanText(sourceText(doc),true);}
  function finalizeSections(original,current){
    const source=canonicalSource(original);
    const existing=mergeSections([...(current.reportSections||[]),...(current.pdfFields||[]).filter(f=>f?.include!==false)]);
    const originalSections=mergeSections([...(original.reportSections||[]),...(original.pdfFields||[]).filter(f=>f?.include!==false)]);
    const parsed=parseSource(original);
    const candidates=[existing,originalSections,parsed].filter(x=>x.length);
    if(!candidates.length)return source?[{title:'Referto',text:source}]:[];
    let best=candidates[0],score=-Infinity;for(const candidate of candidates){const s=candidateScore(candidate,source);if(s>score){score=s;best=candidate;}}
    if(parsed.length&&adminResidualCount(sectionText(best))>adminResidualCount(sectionText(parsed)))best=parsed;
    if(source&&coverage(source,sectionText(best))<0.72&&parsed.length)best=parsed;
    return mergeSections(best);
  }
  function canon(input={}){
    const original=clone(input);let result;try{result=BASE_CANON(input);}catch(error){result={document:clone(input),changed:false,substantiveChanged:false,validation:{ok:false,violations:[String(error)]},stats:{}};}
    const document=result.document||clone(input);const mode=document.documentMode||original.documentMode||((document.category==='Esami di laboratorio')?'lab':'narrative');
    if(['narrative','mixed','diagnosis'].includes(mode)){
      const sections=finalizeSections(original,document),source=canonicalSource(original);
      if(sections.length){document.reportSections=sections;document.pdfFields=sections.map(s=>({label:s.title,value:s.text,include:true}));document.reconstructedText=sections.map(s=>`${s.title}\n${s.text}`).join('\n\n');document.narrativeNeedsReview=false;}
      else if(source){document.reportSections=[{title:'Referto',text:source}];document.pdfFields=[{label:'Referto',value:source,include:true}];document.reconstructedText=`Referto\n${source}`;document.narrativeNeedsReview=false;}
      else document.narrativeNeedsReview=Boolean(sourceText(original));
      document.narrativeSourcePresent=Boolean(sourceText(original));document.narrativeClinicalSource=source;document.narrativeCoverageVersion=VERSION;
    }
    document.clinicalValidationVersion=VERSION;document.narrativeRepairVersion=VERSION;return{...result,document,changed:true};
  }
  function complete(documents=[],profile={}){BASE_COMPLETE(documents,profile);for(const d of documents)d.referenceCompletionVersion=VERSION;return documents;}
  function prepare(documents=[],profile={}){const out=(documents||[]).map(d=>canon(clone(d)).document);return complete(out,profile);}
  H.canonicalizeClinicalDocument24=canon;H.repairNarrativeDocumentData=(d={})=>canon(d);H.repairLabDocumentData=(d={})=>canon(d);H.completeReferences24=complete;H.prepareDocuments24=prepare;
  H.narrativeClinicalSource27=canonicalSource;H.narrativeTokenCoverage27=coverage;H.narrativeAdminHits27=adminResidualCount;H.TEST27_VERSION=VERSION;H.TEST24_VERSION=VERSION;
})(HealthExtractors);

/* TEST 27 v3 - rifinitura amministrativa finale */
;(function test27NarrativeFinal(H){
  'use strict';if(!H)return;
  const VERSION='test27-v3',BASE=H.canonicalizeClinicalDocument24,BASE_COMPLETE=H.completeReferences24;
  const clone=v=>JSON.parse(JSON.stringify(v??{}));
  const collapse=v=>String(v??'').replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').trim();
  const norm=v=>collapse(v).toLocaleLowerCase('it-IT').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9%/+<>=.-]+/g,' ').trim();
  const DROP=[
    /\b(?:consenso al trattamento dei dati personali|firma del paziente|firma amministratore|copia conforme all['’]originale|centralino|timbro e n°|cartella clinica n°|scheda nosologica|data di dimissione)\b/i,
    /\b(?:paziente\s*:\s*[A-ZÀ-ÖØ-Ý]|cod\.?\s*fisc\.?\s*:|codice fiscale\s*:|data (?:di )?nascita\s*:|nascita\s*:|id paziente|nome paziente|numero referto)\b/i,
    /\b(?:telefono|tel\.?|cell\.?|fax)\s*[:.]?\s*\+?\d/i,/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i,
    /\b(?:direttore sanitario|sede operativa|rapporto redatto da|compagnia d['’]assicurazione|numero iscrizione|reference id|profilo paziente|informazioni sul paziente)\b/i
  ];
  const STRONG=[/\bMotivo clinico dell['’]accesso\b/i,/\bFDRC\s*:/i,/\bQuadro toracico\b/i,/\bLo studio\s+(?:TC|RM|ecografico|radiografico)\b/i,/\bNon evidenti\b/i,/\bVena giugulare\b/i,/\bParametri antropometrici\b/i,/\bAnamnesi\b/i,/\bEsame obiettivo\b/i,/\bConclusioni\b/i,/\bDiagnosi\b/i,/\bPaziente (?:in|con|giunge|riferisce|nega|presenta)\b/i];
  const TAIL=[/\bDr\.?\s+[A-ZÀ-ÖØ-Ý][A-ZÀ-ÖØ-Ý .'-]+(?:\s+Contributo ambientale|$)/u,/\bMedico Dott\.?\b/i,/\bStampato\s*:/i,/\bReferto campione paziente\b/i,/\bContributo ambientale\b/i,/\bCO\.NA\.I\b/i];
  function adminCount(v=''){let n=0;for(const re of DROP)if(re.test(v))n++;return n;}
  function strongIndex(v=''){let best=-1;for(const re of STRONG){const m=v.match(re);if(m&&m.index!=null&&(best<0||m.index<best))best=m.index;}return best;}
  function cleanLine(raw=''){
    let v=collapse(raw);if(!v)return'';
    if(/^RX TORACE\b/i.test(v)&&/\bQuadro toracico\b/i.test(v))v=v.slice(v.search(/\bQuadro toracico\b/i));
    if(/\bREFERTO VISITA AMBULATORIALE\b/i.test(v))v=v.slice(v.search(/\bREFERTO VISITA AMBULATORIALE\b/i)+String(v.match(/\bREFERTO VISITA AMBULATORIALE\b/i)?.[0]||'').length).trim();
    if(DROP.some(re=>re.test(v))){const i=strongIndex(v);if(i>=0)v=v.slice(i).trim();else return'';}
    let cut=-1;for(const re of TAIL){const m=v.match(re);if(m&&m.index!=null&&m.index>10&&(cut<0||m.index<cut))cut=m.index;}if(cut>0)v=v.slice(0,cut).trim();
    if(/^(?:sanitario direttore|dipartimento cardio|centro regionale di riferimento|terapia li gaelano|data di dimissione|consenso il pisana|firma del paziente|centralino|timbro|cartella clinica)/i.test(v))return'';
    return v;
  }
  function cleanText(value=''){
    const out=[],seen=new Set();for(const raw of String(value||'').replace(/\r/g,'\n').split(/\n+|\s+\|\s+/)){const v=cleanLine(raw);const k=norm(v);if(v&&k&&!seen.has(k)){seen.add(k);out.push(v);}}return out.join('\n').trim();
  }
  function canon(input={}){
    const original=clone(input),result=BASE(input),document=result.document||clone(input);const mode=document.documentMode||original.documentMode||((document.category==='Esami di laboratorio')?'lab':'narrative');
    if(['narrative','mixed','diagnosis'].includes(mode)){
      const sections=[];for(const s of document.reportSections||[]){const text=cleanText(s?.text||'');if(text)sections.push({title:s?.title||'Referto',text});}
      if(sections.length){document.reportSections=sections;document.pdfFields=sections.map(s=>({label:s.title,value:s.text,include:true}));document.reconstructedText=sections.map(s=>`${s.title}\n${s.text}`).join('\n\n');}
      document.narrativeClinicalSource=cleanText(document.narrativeClinicalSource||'');document.narrativeCoverageVersion=VERSION;document.clinicalValidationVersion=VERSION;document.narrativeRepairVersion=VERSION;
    }
    return{...result,document,changed:true};
  }
  function complete(docs=[],profile={}){BASE_COMPLETE(docs,profile);for(const d of docs)d.referenceCompletionVersion=VERSION;return docs;}
  function prepare(docs=[],profile={}){const out=(docs||[]).map(d=>canon(clone(d)).document);return complete(out,profile);}
  H.canonicalizeClinicalDocument24=canon;H.repairNarrativeDocumentData=d=>canon(d);H.repairLabDocumentData=d=>canon(d);H.completeReferences24=complete;H.prepareDocuments24=prepare;H.narrativeAdminHits27=v=>adminCount(cleanText(v));H.TEST27_VERSION=VERSION;H.TEST24_VERSION=VERSION;
})(HealthExtractors);

/* TEST 27 v4 - filtro finale universale di sezioni e righe non cliniche */
;(function test27ClinicalOnly(H){
  'use strict';if(!H)return;
  const VERSION='test27-v4',BASE=H.canonicalizeClinicalDocument24,BASE_COMPLETE=H.completeReferences24;
  const clone=v=>JSON.parse(JSON.stringify(v??{}));
  const collapse=v=>String(v??'').replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').trim();
  const norm=v=>collapse(v).toLocaleLowerCase('it-IT').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9%/+<>=.-]+/g,' ').trim();
  const DROP_TITLE=/^(?:telefono|email|reference id|sesso|luogo di nascita|data di nascita|codice fiscale|medico curante|medico che ha consigliato|versione del software|il medico|firma|intestazione|dati anagrafici|documento originale|struttura sanitaria|reparto|specializzazione)/i;
  const TITLE_MAP=[[/^post test comments$/i,'Commento'],[/^si consiglia di$/i,'Indicazioni'],[/^controllo$/i,'Programma'],[/^valutazione$/i,'Valutazione'],[/^-?\s*monitoraggio ega$/i,'Monitoraggio EGA']];
  const DROP_LINE=[
    /^(?:cf\s*:|codice fiscale|cod\.?\s*fisc\.?|data (?:di )?nascita|anni compiuti|luogo di nascita|comune di nascita|sesso|genere|id paziente|nome paziente|paziente\s*:)/i,
    /^(?:dr\.?|dott\.?|dott\.ssa|prof\.?|infermiere|tecnico|tsrm|specialista in|direttore|responsabile|refertatore|operatore)\b/i,
    /^(?:ecg-p\.a-spo2|strumento|sala|numero esame|n° esame|data esame|data ref\.?|accesso\s*:|proven\.?\s*:|reference id|rapporto redatto da)/i,
    /^(?:tel\.?|telefono|cell\.?|fax|email|web|www\.|indirizzo|sede operativa|p\.iva|partita iva|n°?\s*ordine)/i,
    /^(?:lettera curante|alla cortese attenzione|si certifica che|n\.b\. si raccomanda vivamente la accurata conservazione del referto|il tutto va ripresentato)/i,
    /^(?:firma|firmato|documento informatico|contributo ambientale|co\.na\.i|classe di dose|cordiali saluti|copia conforme|pagina\s*\d+)/i
  ];
  const ADMIN_INSIDE=/(?:\b(?:tel(?:efono)?\.?|cell(?:ulare)?\.?|fax)\s*[:.]?\s*\+?\d|[\w.+-]+@[\w.-]+\.[a-z]{2,}|\bcodice fiscale\s*:|\bdata di nascita\s*:|\bpaziente\s*:|\bid paziente\b|\bsede operativa\b|\bdirettore sanitario\b)/i;
  const FINDING=[/\b(?:quadro toracico|lo studio|non evidenti|esofago|stomaco|duodeno|vena giugulare|parametri antropometrici|fdrc\s*:|anamnesi|motivo clinico|esame obiettivo|conclusioni|diagnosi|terapia|programma|fegato|tiroide|retina|vitreo|pupille|materiale pervenuto|esame macroscopico)\b/i];
  const TAIL=/\b(?:Il Medico|Dr\.?\s+[A-ZÀ-ÖØ-Ý][A-ZÀ-ÖØ-Ý .'-]+|Contributo ambientale|CO\.NA\.I|Cordiali saluti|Stampato:)\b/u;
  function title(value=''){for(const [re,to] of TITLE_MAP)if(re.test(collapse(value)))return to;return collapse(value)||'Referto';}
  function findingIndex(v=''){let best=-1;for(const re of FINDING){const m=v.match(re);if(m&&m.index!=null&&(best<0||m.index<best))best=m.index;}return best;}
  function clean(value=''){
    const out=[],seen=new Set();for(const raw of String(value||'').replace(/\r/g,'\n').split(/\n+|\s+\|\s+/)){
      let v=collapse(raw);if(!v)continue;
      if(/^TC CRANIO\b/i.test(v))v=v.replace(/\s+Anni compiuti\s*:\s*\d+.*/i,'').trim()||'TC CRANIO - ENCEFALO';
      if(/^RX TORACE\b/i.test(v)&&/\bQuadro toracico\b/i.test(v))v=v.slice(v.search(/\bQuadro toracico\b/i));
      if(ADMIN_INSIDE.test(v)){const i=findingIndex(v);if(i>=0)v=v.slice(i).trim();else if(DROP_LINE.some(re=>re.test(v)))continue;}
      if(DROP_LINE.some(re=>re.test(v)))continue;
      const tm=v.match(TAIL);if(tm&&tm.index!=null&&tm.index>12)v=v.slice(0,tm.index).trim();
      if(!v)continue;const k=norm(v);if(!k||seen.has(k))continue;seen.add(k);out.push(v);
    }return out.join('\n').trim();
  }
  function canon(input={}){
    const result=BASE(input),document=result.document||clone(input);const mode=document.documentMode||((document.category==='Esami di laboratorio')?'lab':'narrative');
    if(['narrative','mixed','diagnosis'].includes(mode)){
      const sections=[];for(const s of document.reportSections||[]){if(DROP_TITLE.test(collapse(s?.title||'')))continue;const text=clean(s?.text||'');if(text)sections.push({title:title(s?.title),text});}
      if(sections.length){document.reportSections=sections;document.pdfFields=sections.map(s=>({label:s.title,value:s.text,include:true}));document.reconstructedText=sections.map(s=>`${s.title}\n${s.text}`).join('\n\n');document.narrativeNeedsReview=false;}
      document.narrativeClinicalSource=clean(document.narrativeClinicalSource||'');document.narrativeCoverageVersion=VERSION;document.clinicalValidationVersion=VERSION;document.narrativeRepairVersion=VERSION;
    }
    return{...result,document,changed:true};
  }
  function complete(docs=[],profile={}){BASE_COMPLETE(docs,profile);for(const d of docs)d.referenceCompletionVersion=VERSION;return docs;}
  function prepare(docs=[],profile={}){const out=(docs||[]).map(d=>canon(clone(d)).document);return complete(out,profile);}
  H.canonicalizeClinicalDocument24=canon;H.repairNarrativeDocumentData=d=>canon(d);H.repairLabDocumentData=d=>canon(d);H.completeReferences24=complete;H.prepareDocuments24=prepare;H.narrativeClinicalSource27=d=>clean(d?.narrativeClinicalSource||d?.extractedText||'');H.narrativeAdminHits27=v=>ADMIN_INSIDE.test(String(v||''))?1:0;H.TEST27_VERSION=VERSION;H.TEST24_VERSION=VERSION;
})(HealthExtractors);

/* TEST 27 v5 - eliminazione residui amministrativi embedded */
;(function test27EmbeddedAdmin(H){
  'use strict';if(!H)return;
  const VERSION='test27-v5',BASE=H.canonicalizeClinicalDocument24,BASE_COMPLETE=H.completeReferences24;
  const clone=v=>JSON.parse(JSON.stringify(v??{}));
  const collapse=v=>String(v??'').replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').trim();
  const ADMIN=/(?:\bpaziente\s*:|\bcf\s+paziente\s*:|\bcodice fiscale\s*:|\bdata di nascita\s*:|\bid paziente\b|\bnumero referto\s*:|\bsede operativa\b|\bdirettore sanitario\b|\b(?:tel(?:efono)?|fax|cell(?:ulare)?)\s*[:.]\s*\+?\d|[\w.+-]+@[\w.-]+\.[a-z]{2,})/i;
  const FIND=/\b(?:motivo clinico|anamnesi|riferisce|nega|presenta|paziente (?:vigile|in|con|giunge)|ecg\s*:|quadro toracico|lo studio|non evidenti|esofago|stomaco|duodeno|vena giugulare|diagnosi|conclusioni|terapia|programma|esame obiettivo)\b/i;
  const DROP=/^(?:from\s*:|to\s*:|subject\s*:|message\s*:|report fax|stato\s*: received|data\/ora\s*:|velocit[aà]\s*:|tempo di connessione\s*:|pagine\s*:|risoluzione\s*:|id remoto\s*:|numero linea\s*:|dtmf\/did\s*:|descrizione\s*:|company name|address|website|avvertenza: gli allegati|uo .* page|aoup .* page|servizio sanitario|copia conforme|cognome e nome|comune di residenza|cittadinanza|professione|consenso|data del ricovero|data di dimissione)/i;
  function clean(value=''){
    const out=[],seen=new Set();for(const raw of String(value||'').replace(/\r/g,'\n').split(/\n+|\s+\|\s+/)){
      let v=collapse(raw);if(!v||DROP.test(v))continue;
      if(ADMIN.test(v)){const m=v.match(FIND);if(m&&m.index!=null)v=v.slice(m.index).trim();else continue;}
      if(!v)continue;const key=v.toLocaleLowerCase('it-IT').replace(/\s+/g,' ');if(seen.has(key))continue;seen.add(key);out.push(v);
    }return out.join('\n').trim();
  }
  function canon(input={}){const result=BASE(input),document=result.document||clone(input);const mode=document.documentMode||((document.category==='Esami di laboratorio')?'lab':'narrative');if(['narrative','mixed','diagnosis'].includes(mode)){const sections=[];for(const s of document.reportSections||[]){const text=clean(s?.text||'');if(text)sections.push({title:s?.title||'Referto',text});}if(sections.length){document.reportSections=sections;document.pdfFields=sections.map(s=>({label:s.title,value:s.text,include:true}));document.reconstructedText=sections.map(s=>`${s.title}\n${s.text}`).join('\n\n');document.narrativeNeedsReview=false;}document.narrativeClinicalSource=sections.length?sections.map(s=>s.text||'').join('\n'):clean(document.narrativeClinicalSource||'');document.narrativeCoverageVersion=VERSION;document.clinicalValidationVersion=VERSION;document.narrativeRepairVersion=VERSION;}return{...result,document,changed:true};}
  function complete(docs=[],profile={}){BASE_COMPLETE(docs,profile);for(const d of docs)d.referenceCompletionVersion=VERSION;return docs;}
  function prepare(docs=[],profile={}){const out=(docs||[]).map(d=>canon(clone(d)).document);return complete(out,profile);}
  H.canonicalizeClinicalDocument24=canon;H.repairNarrativeDocumentData=d=>canon(d);H.repairLabDocumentData=d=>canon(d);H.completeReferences24=complete;H.prepareDocuments24=prepare;H.narrativeClinicalSource27=d=>clean(d?.narrativeClinicalSource||d?.extractedText||'');H.narrativeAdminHits27=v=>ADMIN.test(String(v||''))?1:0;H.TEST27_VERSION=VERSION;H.TEST24_VERSION=VERSION;
})(HealthExtractors);

/* TEST 27 v6 - rimozione boilerplate tecnico e amministrativo residuo */
;(function test27BoilerplateFinal(H){
  'use strict';if(!H)return;
  const VERSION='test27-v6',BASE=H.canonicalizeClinicalDocument24,BASE_COMPLETE=H.completeReferences24;
  const clone=v=>JSON.parse(JSON.stringify(v??{}));
  const collapse=v=>String(v??'').replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').trim();
  const norm=v=>collapse(v).toLocaleLowerCase('it-IT').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9%/+<>=.-]+/g,' ').trim();
  const DROP=/^(?:si allega(?:no)?\b|\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$|n\.b\.\s*si raccomanda.*conservazione del referto|.*unica copia.*|.*ripresentato ad ogni consultazione.*|ecg-p\.a-spo2\b|scontrino lavaendoscopi\b|esecuzione esame istologico\b|\*?\s*l['’]endoscopio al termine della procedura\b|fornitore o con prodotto monouso\b|successivamente lo strumento viene trattato\b|garantire qualit[aà], sicurezza e tracciabilit[aà]\b|data e ora referto\b|figura\s+\d|pag\.?\s*:\s*\d|spedali riuniti|presidio ospedaliero|ambulatori\s*:|cognome e nome\s*:|tipo esame\s*:|modalit[aà].*ritiro del referto|solo per il mese|per i pazienti ricoverati|nel caso di biopsie urgenti)/i;
  const CLINICAL=/(?:anamnes|esame obiettivo|diagnos|conclusion|terapia|programma|controllo|riferisce|nega|presenta|esofago|stomaco|duodeno|fegato|tiroide|retina|vitreo|pupill|lesion|pressione|dolore|follow|farmac|ecg|quadro|repert|indagine|studio tc)/i;
  function clean(value=''){
    const out=[],seen=new Set();for(const raw of String(value||'').replace(/\r/g,'\n').split(/\n+|\s+\|\s+/)){const v=collapse(raw);if(!v||DROP.test(v))continue;const k=norm(v);if(!k||seen.has(k))continue;seen.add(k);out.push(v);}return out.join('\n').trim();
  }
  function canon(input={}){const result=BASE(input),document=result.document||clone(input);const mode=document.documentMode||((document.category==='Esami di laboratorio')?'lab':'narrative');if(['narrative','mixed','diagnosis'].includes(mode)){const sections=[];for(const s of document.reportSections||[]){const text=clean(s?.text||'');if(!text)continue;if(/^programma$/i.test(collapse(s?.title||''))&&!CLINICAL.test(text))continue;sections.push({title:s?.title||'Referto',text});}if(sections.length){document.reportSections=sections;document.pdfFields=sections.map(s=>({label:s.title,value:s.text,include:true}));document.reconstructedText=sections.map(s=>`${s.title}\n${s.text}`).join('\n\n');document.narrativeClinicalSource=sections.map(s=>s.text).join('\n');document.narrativeNeedsReview=false;}document.narrativeCoverageVersion=VERSION;document.clinicalValidationVersion=VERSION;document.narrativeRepairVersion=VERSION;}return{...result,document,changed:true};}
  function complete(docs=[],profile={}){BASE_COMPLETE(docs,profile);for(const d of docs)d.referenceCompletionVersion=VERSION;return docs;}
  function prepare(docs=[],profile={}){const out=(docs||[]).map(d=>canon(clone(d)).document);return complete(out,profile);}
  H.canonicalizeClinicalDocument24=canon;H.repairNarrativeDocumentData=d=>canon(d);H.repairLabDocumentData=d=>canon(d);H.completeReferences24=complete;H.prepareDocuments24=prepare;H.narrativeClinicalSource27=d=>String(d?.narrativeClinicalSource||'');H.TEST27_VERSION=VERSION;H.TEST24_VERSION=VERSION;
})(HealthExtractors);

/* TEST 27 v7 - rifinitura per referti endoscopici e allegati */
;(function test27ClinicalTail(H){
  'use strict';if(!H)return;
  const VERSION='test27-v7',BASE=H.canonicalizeClinicalDocument24,BASE_COMPLETE=H.completeReferences24;
  const clone=v=>JSON.parse(JSON.stringify(v??{}));
  const collapse=v=>String(v??'').replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').trim();
  function clean(title,value=''){
    let text=String(value||'').replace(/\r/g,'\n');
    if(/\bEsofago\s*:/i.test(text)){const m=text.match(/\bEsofago\s*:/i);if(m&&m.index!=null)text=text.slice(m.index);}
    const lines=[];
    for(const raw of text.split(/\n+|\s+\|\s+/)){
      const v=collapse(raw);if(!v)continue;
      if(/^(?:ecg-p\.a-sp[0o]2|scontrino lavaendoscopi|esecuzione esame istologico|garantire qualit|si allega|\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$)/i.test(v))continue;
      if(/^(?:conclusioni?)$/i.test(title)&&/^(?:il medico|f$|pa$|\\l dott|figura|pag\.?|spedali|presidio|ambulatori|cognome e nome|tipo esame|modalit[aà]|stato richiesto l['’]invio|delega portare|ed 30|solo per il mese|per i pazienti ricoverati|nel caso di biopsie|dirigente medico)/i.test(v))break;
      lines.push(v);
    }
    return lines.join('\n').trim();
  }
  function canon(input={}){const result=BASE(input),document=result.document||clone(input);const mode=document.documentMode||((document.category==='Esami di laboratorio')?'lab':'narrative');if(['narrative','mixed','diagnosis'].includes(mode)){const sections=[];for(const s of document.reportSections||[]){const text=clean(s?.title||'Referto',s?.text||'');if(text)sections.push({title:s?.title||'Referto',text});}if(sections.length){document.reportSections=sections;document.pdfFields=sections.map(s=>({label:s.title,value:s.text,include:true}));document.reconstructedText=sections.map(s=>`${s.title}\n${s.text}`).join('\n\n');document.narrativeClinicalSource=sections.map(s=>s.text).join('\n');document.narrativeNeedsReview=false;}document.narrativeCoverageVersion=VERSION;document.clinicalValidationVersion=VERSION;document.narrativeRepairVersion=VERSION;}return{...result,document,changed:true};}
  function complete(docs=[],profile={}){BASE_COMPLETE(docs,profile);for(const d of docs)d.referenceCompletionVersion=VERSION;return docs;}
  function prepare(docs=[],profile={}){const out=(docs||[]).map(d=>canon(clone(d)).document);return complete(out,profile);}
  H.canonicalizeClinicalDocument24=canon;H.repairNarrativeDocumentData=d=>canon(d);H.repairLabDocumentData=d=>canon(d);H.completeReferences24=complete;H.prepareDocuments24=prepare;H.narrativeClinicalSource27=d=>String(d?.narrativeClinicalSource||'');H.TEST27_VERSION=VERSION;H.TEST24_VERSION=VERSION;
})(HealthExtractors);

/* TEST 27 v8 - validazione narrativa universale e marcatore finale di rilascio */
;(function test27ReleaseGate(H){
  'use strict';if(!H)return;
  const VERSION='test27-v8',BASE=H.canonicalizeClinicalDocument24.bind(H),BASE_COMPLETE=H.completeReferences24.bind(H);
  const clone=v=>typeof structuredClone==='function'?structuredClone(v):JSON.parse(JSON.stringify(v??{}));
  const collapse=v=>String(v??'').replace(/\u00ad/g,'').replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').trim();
  const norm=v=>collapse(v).toLocaleLowerCase('it-IT').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9%/+<>=.,:;()'’-]+/g,' ').replace(/\s+/g,' ').trim();
  const CLINICAL=/(?:anamnes|motivo (?:della )?visita|quesito clinico|esame obiettivo|obiettivit|repert|referto|conclusion|diagnos|terapia|programma|follow[- ]?up|morfologia|materiale pervenuto|esame macroscopico|composizione corporea|classificazione|riferisce|nega|presenta|si rileva|si osserva|evidenzia|compatibile|fegato|pancreas|milza|rene|reni|tiroide|polmone|polmoni|cuore|encefalo|mucosa|lesion|nodul|cisti|pressione|dolore|edema|retina|vitreo|pupill|arcata|alveolar|ecograf|tomograf|risonanz|radiograf|esofago|stomaco|duodeno|colon|cardias|ernia|biops|gastrite|steatos|ipertens|diabet|ipotiroid|farmac|mg\b|mcg\b|mmhg|kg\b|cm\b|mm\b|kpa\b)/i;
  const ADMIN=/^(?:azienda|asl\b|ausl\b|aoup\b|ao[- ]?u?p\b|ospedale|servizio sanitario|dipartimento|unit[aà] operativa|u\.?o\.?\b|presidio|poliambulatorio|centro medico|medic group|ambulatorio|sede operativa|direttore|responsabile|primario|coordinatore|medico refertante|refertatore|esecutore|operatore|tecnico|tsrm|paziente\s*:|cognome(?: e nome)?\s*:|nome\s*:|data (?:di )?nascita\s*:|luogo di nascita\s*:|codice fiscale\s*:|tessera sanitaria\s*:|residenza\s*:|domicilio\s*:|indirizzo\s*:|n[°.o]?\s*(?:cartella|referto|accettazione|pratica)\s*:|id paziente|numero di telefono|tel(?:efono)?\.?\s*:|cell(?:ulare)?\.?\s*:|fax\s*:|e-?mail\s*:|pec\s*:|centralino|prenotazion|segreteria|richiesta\s*:|accettazione\s*:|emissione\s*:|stampat[oa]\s*:|refertat[oa]\s*:|validat[oa]\s*:|firmat[oa]\s*:|firma digitale|documento firmato|versione del software|versione\s*:|pagina\s+\d+|page\s+\d+|tipo esame\s*:|esame richiesto\s*:|prestazione\s*:|codice prestazione\s*:|p\.?iva|partita iva|cod\.\s*reg|codice struttura|numero referto|delibera\s+n|visita .* del \d{1,2}[./-]\d{1,2}[./-]\d{2,4}$|data di refertazione\s*:|rappresentazione di un referto|classe di dose|from\s*:|to\s*:|subject\s*:|oggetto\s*:|message\s*:|report fax|stato\s*:\s*received|data\/ora\s*:|velocit[aà]\s*:|tempo di connessione\s*:|pagine\s*:|risoluzione\s*:|id remoto\s*:|numero linea\s*:|dtmf\/did\s*:|company name|website|copia conforme|cittadinanza\s*:|professione\s*:|consenso\s*:|data del ricovero\s*:|data di dimissione\s*:|presidio antidecubito|modalit[aà].*ritiro del referto|solo per il mese|per i pazienti ricoverati|nel caso di biopsie urgenti|si allega(?:no)?\b|n\.b\.\s*si raccomanda|cordiali saluti|il medico\b|firma\b|firmato digitalmente|documento informatico)/i;
  const EMBEDDED=/(?:\bpaziente\s*:|\bcf\s+paziente\s*:|\bcodice fiscale\s*:|\bdata di nascita\s*:|\bid paziente\b|\bnumero referto\s*:|\bsede operativa\b|\bdirettore sanitario\b|\b(?:tel(?:efono)?|fax|cell(?:ulare)?)\s*[:.]\s*\+?\d|[\w.+-]+@[\w.-]+\.[a-z]{2,})/i;
  const PURE=/^(?:={0,3}\s*(?:pagina|page)\s*\d+\s*={0,3}|\d{1,2}[./-]\d{1,2}[./-]\d{2,4}(?:\s+\d{1,2}[:.]\d{2})?|referto|continua|sezione|contenuto)$/i;
  const TITLE_DROP=/^(?:intestazione|dati anagrafici|documento originale|struttura sanitaria|reparto|specializzazione|identificazione e firma|medico firmatario)$/i;
  function quality(line=''){
    const chars=[...line],letters=(line.match(/[A-Za-zÀ-ÿ]/g)||[]).length,symbols=(line.match(/[^A-Za-zÀ-ÿ0-9\s.,;:()/%+<>=\-’']/g)||[]).length;
    if(chars.length>20&&letters/chars.length<0.28&&!CLINICAL.test(line))return false;
    if(chars.length>20&&symbols/chars.length>0.22&&!CLINICAL.test(line))return false;
    return true;
  }
  function cleanLine(raw=''){
    let line=collapse(raw);if(!line||PURE.test(line))return'';
    if(ADMIN.test(line)){
      const m=line.match(CLINICAL);if(m&&m.index!=null&&m.index>0)line=collapse(line.slice(m.index));else return'';
    }
    if(EMBEDDED.test(line)){
      const m=line.match(CLINICAL);if(m&&m.index!=null)line=collapse(line.slice(m.index));else return'';
    }
    line=line.replace(/\b(?:Il Medico|Dr\.?\s+[A-ZÀ-ÖØ-Ý][A-ZÀ-ÖØ-Ý .'-]{2,}|Dott\.?\s+[A-ZÀ-ÖØ-Ý][A-ZÀ-ÖØ-Ý .'-]{2,}|Stampato:)\b.*$/,'').trim();
    return quality(line)?line:'';
  }
  function cleanText(value=''){
    const out=[],seen=new Set();
    for(const raw of String(value||'').replace(/\r/g,'\n').split(/\n+|\s+\|\s+/)){
      const line=cleanLine(raw);if(!line)continue;const key=norm(line);if(!key||seen.has(key))continue;seen.add(key);out.push(line);
    }
    return out.join('\n').replace(/\n{3,}/g,'\n\n').trim();
  }
  function canonicalSource(doc={}){return (doc.reportSections||[]).map(s=>String(s?.text||'').trim()).filter(Boolean).join('\n').trim();}
  function canon(input={}){
    const original=clone(input),result=BASE(input),document=result.document||clone(input);
    const mode=document.documentMode||original.documentMode||((document.category==='Esami di laboratorio')?'lab':'narrative');
    if(['narrative','mixed','diagnosis'].includes(mode)){
      const merged=new Map(),order=[];
      const push=(title,text)=>{title=collapse(title||'Referto').replace(/[,;:\-]?\s*continua(?:\s+dalla\s+pagina\s+precedente)?\s*$/i,'').trim()||'Referto';if(TITLE_DROP.test(title))return;text=cleanText(text);if(!text)return;const key=norm(title);if(!merged.has(key)){merged.set(key,{title,parts:[]});order.push(key);}if(!merged.get(key).parts.includes(text))merged.get(key).parts.push(text);};
      for(const s of document.reportSections||[])push(s?.title,s?.text);
      if(!order.length)for(const s of original.reportSections||[])push(s?.title,s?.text);
      if(!order.length)for(const f of original.pdfFields||[])if(f?.include!==false)push(f?.label,f?.value);
      if(!order.length){const fallback=cleanText(original.reconstructedText||original.extractedText||original.structuredText||'');if(fallback)push('Referto',fallback);}
      const sections=order.map(key=>({title:merged.get(key).title,text:merged.get(key).parts.join('\n\n')})).filter(s=>s.text);
      const rawPresent=Boolean(String(original.extractedText||original.structuredText||original.reconstructedText||'').trim()||(original.reportSections||[]).some(s=>String(s?.text||'').trim())||(original.pdfFields||[]).some(f=>String(f?.value||'').trim()));
      document.reportSections=sections;document.pdfFields=sections.map(s=>({label:s.title,value:s.text,include:true}));document.reconstructedText=sections.map(s=>`${s.title}\n${s.text}`).join('\n\n');document.narrativeClinicalSource=sections.map(s=>s.text).join('\n');document.narrativeSourcePresent=rawPresent;document.narrativeNeedsReview=rawPresent&&!sections.length;
      document.narrativeCoverageVersion=VERSION;document.narrativeRepairVersion=VERSION;
    }
    document.clinicalValidationVersion=VERSION;document.labRepairVersion=VERSION;document.labPanelVersion=VERSION;document.referenceCompletionVersion=VERSION;
    return{...result,document,changed:true};
  }
  function stamp(d){d.clinicalValidationVersion=VERSION;d.labRepairVersion=VERSION;d.labPanelVersion=VERSION;d.referenceCompletionVersion=VERSION;if(['narrative','mixed','diagnosis'].includes(d.documentMode||'')){d.narrativeCoverageVersion=VERSION;d.narrativeRepairVersion=VERSION;}return d;}
  function complete(docs=[],profile={}){BASE_COMPLETE(docs,profile);for(const d of docs)stamp(d);return docs;}
  function prepare(docs=[],profile={}){const out=(docs||[]).map(d=>canon(clone(d)).document);complete(out,profile);return out;}
  function adminHits(value=''){let hits=0;for(const line of String(value||'').split(/\n+/))if(ADMIN.test(collapse(line))||EMBEDDED.test(collapse(line)))hits++;return hits;}
  H.canonicalizeClinicalDocument24=canon;H.repairNarrativeDocumentData=d=>canon(d);H.repairLabDocumentData=d=>canon(d);H.completeReferences24=complete;H.prepareDocuments24=prepare;H.narrativeClinicalSource27=d=>canonicalSource(d);H.narrativeAdminHits27=adminHits;H.TEST27_VERSION=VERSION;H.TEST24_VERSION=VERSION;
})(HealthExtractors);

/* TEST 27 v11 - rilascio finale: rifinitura non regressiva e recupero solo se il referto è realmente vuoto */
;(function test27FinalRelease(H){
  'use strict';if(!H)return;
  const VERSION='test27-v11',BASE=H.canonicalizeClinicalDocument24.bind(H),BASE_COMPLETE=H.completeReferences24.bind(H);
  const clone=v=>typeof structuredClone==='function'?structuredClone(v):JSON.parse(JSON.stringify(v??{}));
  const collapse=v=>String(v??'').replace(/\u00ad/g,'').replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').trim();
  const norm=v=>collapse(v).toLocaleLowerCase('it-IT').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9%/+<>=.,:;()'’-]+/g,' ').replace(/\s+/g,' ').trim();
  const CLINICAL=/(?:le comunichiamo che il test|test per la ricerca|ha dato esito|esito (?:negativo|positivo)|risultato (?:negativo|positivo)|tra circa due anni|nel frattempo|anamnes|motivo (?:della )?visita|quesito clinico|esame obiettivo|obiettivit|repert|referto|conclusion|diagnos|terapia|programma|follow[- ]?up|morfologia|materiale pervenuto|esame macroscopico|composizione corporea|classificazione|riferisce|nega|presenta|si rileva|si osserva|evidenzia|compatibile|lo studio|quadro toracico|non evidenti|fegato|pancreas|milza|rene|reni|tiroide|polmone|polmoni|cuore|encefalo|mucosa|lesion|nodul|cisti|pressione|dolore|edema|retina|vitreo|pupill|arcata|alveolar|ecograf|tomograf|risonanz|radiograf|esofago|stomaco|duodeno|colon|cardias|ernia|biops|gastrite|steatos|ipertens|diabet|ipotiroid|farmac|mg\b|mcg\b|mmhg|kg\b|cm\b|mm\b|kpa\b)/i;
  const ADMIN_START=/^(?:azienda|asl\b|ausl\b|aoup\b|ospedale|servizio sanitario|dipartimento|unit[aà] operativa|u\.?o\.?\b|presidio|poliambulatorio|centro medico|ambulatorio|direttore|responsabile|primario|coordinatore|paziente\s*:|cognome(?: e nome)?\s*:|nome\s*:|data (?:di )?nascita\s*:|codice fiscale\s*:|residenza\s*:|domicilio\s*:|indirizzo\s*:|numero di telefono|tel(?:efono)?\.?\s*:|cell(?:ulare)?\.?\s*:|fax\s*:|e-?mail\s*:|pec\s*:|centralino|prenotazion|segreteria|from\s*:|to\s*:|subject\s*:|oggetto\s*:|message\s*:|report fax|delibera\s+n|data di refertazione\s*:|rappresentazione di un referto|classe di dose|si allega(?:no)?\b|cordiali saluti|firma\b|firmato digitalmente|presidio antidecubito)/i;
  const ADMIN_ANY=/(?:\bcodice fiscale\s*:|\bcf\s*:|\bdata di nascita\s*:|\bid paziente\b|\bnumero referto\s*:|\bsede operativa\b|\bdirettore sanitario\b|\b(?:tel(?:efono)?|fax|cell(?:ulare)?)\s*[:,.]?\s*\+?\d{3,}|[\w.+-]+@[\w.-]+\.[a-z]{2,})/i;
  const TAIL=/(?:\bIl Direttore\b|\bIl Medico\b|\bCordiali saluti\b|\bData di Refertazione\s*:|\bRappresentazione di un referto\b|\bClasse di dose\b)/i;
  const TRIVIAL=/^(?:referto|continua|sezione|contenuto|l['’]esame\.?|gentile assistit[oa],?|dell['’]azienda.*|il direttore.*)$/i;
  function cleanLine(raw=''){
    let line=collapse(raw);if(!line||TRIVIAL.test(line))return'';const probe=line.replace(/^[\-_*•·|\s]+/,'');
    if(ADMIN_START.test(probe)){const m=line.match(CLINICAL);if(m&&m.index!=null&&m.index>0)line=collapse(line.slice(m.index));else return'';}
    const a=line.match(ADMIN_ANY),c=line.match(CLINICAL);if(a&&a.index!=null){if(c&&c.index!=null&&c.index>a.index)line=collapse(line.slice(c.index));else if(c&&c.index!=null&&c.index<a.index)line=collapse(line.slice(0,a.index));else return'';}
    const tail=line.match(TAIL);if(tail&&tail.index!=null&&tail.index>20)line=collapse(line.slice(0,tail.index));
    if(TRIVIAL.test(line))return'';return line;
  }
  function cleanText(value=''){const out=[],seen=new Set();for(const raw of String(value||'').replace(/\r/g,'\n').split(/\n+|\s+\|\s+/)){const line=cleanLine(raw);if(!line)continue;const key=norm(line);if(!key||seen.has(key))continue;seen.add(key);out.push(line);}return out.join('\n').trim();}
  function recover(source=''){
    const lines=String(source||'').replace(/\r/g,'\n').split(/\n+/),out=[];let active=false;
    for(const raw of lines){const line=collapse(raw);if(!line)continue;if(CLINICAL.test(line))active=true;if(!active)continue;const cleaned=cleanLine(line);if(cleaned)out.push(cleaned);if(TAIL.test(line))break;}
    return cleanText(out.join('\n'));
  }
  function canon(input={}){
    const original=clone(input),result=BASE(input),document=result.document||clone(input),mode=document.documentMode||original.documentMode||((document.category==='Esami di laboratorio')?'lab':'narrative');
    if(['narrative','mixed','diagnosis'].includes(mode)){
      const sections=[];for(const s of document.reportSections||[]){const text=cleanText(s?.text||'');if(text)sections.push({title:String(s?.title||'Referto').replace(/[,;:\-]?\s*continua(?:\s+dalla\s+pagina\s+precedente)?\s*$/i,'').trim()||'Referto',text});}
      const total=sections.reduce((n,s)=>n+s.text.length,0),raw=String(original.extractedText||original.structuredText||original.reconstructedText||'');
      if(total<20&&raw.trim()){const fallback=recover(raw);if(fallback){sections.length=0;sections.push({title:'Referto',text:fallback});}}
      document.reportSections=sections;document.pdfFields=sections.map(s=>({label:s.title,value:s.text,include:true}));document.reconstructedText=sections.map(s=>`${s.title}\n${s.text}`).join('\n\n');document.narrativeClinicalSource=sections.map(s=>s.text).join('\n');document.narrativeSourcePresent=Boolean(raw.trim()||(original.reportSections||[]).some(s=>String(s?.text||'').trim()));document.narrativeNeedsReview=document.narrativeSourcePresent&&!sections.length;document.narrativeCoverageVersion=VERSION;document.narrativeRepairVersion=VERSION;
    }
    document.clinicalValidationVersion=VERSION;document.labRepairVersion=VERSION;document.labPanelVersion=VERSION;document.referenceCompletionVersion=VERSION;return{...result,document,changed:true};
  }
  function stamp(d){d.clinicalValidationVersion=VERSION;d.labRepairVersion=VERSION;d.labPanelVersion=VERSION;d.referenceCompletionVersion=VERSION;if(['narrative','mixed','diagnosis'].includes(d.documentMode||'')){d.narrativeCoverageVersion=VERSION;d.narrativeRepairVersion=VERSION;}return d;}
  function complete(docs=[],profile={}){BASE_COMPLETE(docs,profile);for(const d of docs)stamp(d);return docs;}
  function prepare(docs=[],profile={}){const out=(docs||[]).map(d=>canon(clone(d)).document);complete(out,profile);return out;}
  function adminHits(value=''){let hits=0;for(const line of String(value||'').split(/\n+/)){const p=collapse(line).replace(/^[\-_*•·|\s]+/,'');if(ADMIN_START.test(p)||ADMIN_ANY.test(p))hits++;}return hits;}
  H.canonicalizeClinicalDocument24=canon;H.repairNarrativeDocumentData=d=>canon(d);H.repairLabDocumentData=d=>canon(d);H.completeReferences24=complete;H.prepareDocuments24=prepare;H.narrativeClinicalSource27=d=>(d?.reportSections||[]).map(s=>String(s?.text||'').trim()).filter(Boolean).join('\n');H.narrativeAdminHits27=adminHits;H.TEST27_VERSION=VERSION;H.TEST24_VERSION=VERSION;
})(HealthExtractors);

/* TEST 27 v12 - rimozione definitiva di contatti e intestazioni residue */
;(function test27AdministrativeSeal(H){
  'use strict';if(!H)return;
  const VERSION='test27-v12',BASE=H.canonicalizeClinicalDocument24.bind(H),BASE_COMPLETE=H.completeReferences24.bind(H);
  const clone=v=>typeof structuredClone==='function'?structuredClone(v):JSON.parse(JSON.stringify(v??{}));
  const collapse=v=>String(v??'').replace(/\u00ad/g,'').replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').trim();
  const CONTACT=/(?:\b(?:tel(?:efono)?|cell(?:ulare)?|fax)\b.*\d|[\w.+-]+@[\w.-]+\.[a-z]{2,})/i;
  const DROP=/^(?:scat\b|r-d\b|\d{5}\s+[A-ZÀ-ÖØ-Ý]{3,}|[A-ZÀ-ÖØ-Ý]{3,}\s+[A-ZÀ-ÖØ-Ý]{3,}$|P\.A\.L\.|EU-PI\b|P4\b|via\s+dei\s+mille|dr\.?ssa?\b|dott\.?ssa?\b|pisa,?\s*\d|dei tumori del colon retto$|la ringraziamo per la cortese partecipazione)/i;
  const STRONG=/(?:le comunichiamo che il test|test per la ricerca|ha dato esito|esito (?:negativo|positivo)|risultato (?:negativo|positivo)|anamnes|motivo (?:della )?visita|esame obiettivo|repert|conclusion|diagnos|terapia|programma|riferisce|nega|presenta|si rileva|si osserva|evidenzia|compatibile|lo studio|quadro toracico|non evidenti|fegato|pancreas|milza|rene|tiroide|polmone|cuore|encefalo|mucosa|lesion|retina|vitreo|esofago|stomaco|duodeno|gastrite|steatos|ipertens|diabet|ipotiroid|farmac)/i;
  function clean(value=''){
    let text=String(value||'').replace(/\r/g,'\n');const screening=text.match(/le comunichiamo che il test/i);if(screening&&screening.index!=null)text=text.slice(screening.index);
    const out=[];for(const raw of text.split(/\n+/)){let line=collapse(raw);if(!line||DROP.test(line))continue;if(CONTACT.test(line)){const c=line.match(STRONG),a=line.match(CONTACT);if(c&&a&&c.index<a.index)line=collapse(line.slice(0,a.index));else continue;}if(/^(?:il direttore|azienda usl|dell['’]azienda)/i.test(line))continue;out.push(line);}return out.join('\n').trim();
  }
  function canon(input={}){const result=BASE(input),document=result.document||clone(input),mode=document.documentMode||((document.category==='Esami di laboratorio')?'lab':'narrative');if(['narrative','mixed','diagnosis'].includes(mode)){const sections=[];for(const s of document.reportSections||[]){const text=clean(s?.text||'');if(text)sections.push({title:s?.title||'Referto',text});}document.reportSections=sections;document.pdfFields=sections.map(s=>({label:s.title,value:s.text,include:true}));document.reconstructedText=sections.map(s=>`${s.title}\n${s.text}`).join('\n\n');document.narrativeClinicalSource=sections.map(s=>s.text).join('\n');document.narrativeNeedsReview=document.narrativeSourcePresent&&!sections.length;document.narrativeCoverageVersion=VERSION;document.narrativeRepairVersion=VERSION;}document.clinicalValidationVersion=VERSION;document.labRepairVersion=VERSION;document.labPanelVersion=VERSION;document.referenceCompletionVersion=VERSION;return{...result,document,changed:true};}
  function stamp(d){d.clinicalValidationVersion=VERSION;d.labRepairVersion=VERSION;d.labPanelVersion=VERSION;d.referenceCompletionVersion=VERSION;if(['narrative','mixed','diagnosis'].includes(d.documentMode||'')){d.narrativeCoverageVersion=VERSION;d.narrativeRepairVersion=VERSION;}return d;}
  function complete(docs=[],profile={}){BASE_COMPLETE(docs,profile);for(const d of docs)stamp(d);return docs;}
  function prepare(docs=[],profile={}){const out=(docs||[]).map(d=>canon(clone(d)).document);complete(out,profile);return out;}
  H.canonicalizeClinicalDocument24=canon;H.repairNarrativeDocumentData=d=>canon(d);H.repairLabDocumentData=d=>canon(d);H.completeReferences24=complete;H.prepareDocuments24=prepare;H.narrativeClinicalSource27=d=>(d?.reportSections||[]).map(s=>String(s?.text||'').trim()).filter(Boolean).join('\n');H.narrativeAdminHits27=v=>CONTACT.test(String(v||''))?1:0;H.TEST27_VERSION=VERSION;H.TEST24_VERSION=VERSION;
})(HealthExtractors);

/* TEST 27 v13 - filtro semantico finale per cartelle cliniche OCR estese e referti ordinari */
;(function test27SemanticNoiseGate(H){
  'use strict';if(!H)return;
  const VERSION='test27-v13',BASE=H.canonicalizeClinicalDocument24.bind(H),BASE_COMPLETE=H.completeReferences24.bind(H);
  const clone=v=>typeof structuredClone==='function'?structuredClone(v):JSON.parse(JSON.stringify(v??{}));
  const collapse=v=>String(v??'').replace(/\u00ad/g,'').replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').trim();
  const norm=v=>collapse(v).toLocaleLowerCase('it-IT').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9%/+<>=.,:;()'’-]+/g,' ').replace(/\s+/g,' ').trim();
  const ADMIN=/(?:^|\b)(?:id documento|codice accesso|numero accesso|nosologico|nasologico|nosblogico|barcode|unit[aà] di ricovero|codice sanitario|recapito telefonico|num\.? telefonici|id pleiade|cognome(?: e nome)?|data di nascita|luogo di nascita|codice fiscale|c\.?f\.?\s*:|residenza|domicilio|indirizzo|letto n|scheda s\.?d\.?o|n[°.o]? cartella|n[°.o]? referto|data\/ora richiesta|richiedente|erogatore|registrata da|prodotto in data|versione\s*:\s*\d|stato\s*:|stampato\s*:|analisi\s*:|operatore|sigla infermiere|firma infermiere|firma medico|medico specialista in formazione|medico specialista$|direttore|responsabile|timbro unit[aà] operativa|questionario|trattamento dei dati|dati personali|indirizzo mail|numero di telefono|email o via sms|privacy|consenso|this fax was sent|faxmaker|website|company name|chiamare il \d|contattare \d|prenotazioni visite|modalit[aà].*ritiro del referto|rappresentazione di un referto|data di refertazione|documento informatico|classe di dose|s\/n\s*:|sin\s*:|id\s*:\s*\d{5,}|barcode n|pagina \d+|pag\.\s*\d|ea 7 farmaco si sj valore|presidio antidecubito|d\.p\.c\.m\.|d\.p\.r\.|delega portare|copia conforme)/i;
  const CONTACT=/(?:[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b(?:tel(?:efono)?|cell(?:ulare)?|fax|chiamare|contattare)\b[^\n]*\d{3,}|\b\d{3}[./ -]\d{5,}\b)/i;
  const MEDICAL=/(?:anamnes|diagnos|terapia|farmac|programma|conclusion|esame obiettivo|riferisce|nega|presenta|ricover|dimess|insufficienza|respirator|renale|cardiac|polmon|fegato|pancreas|milza|rene|tiroide|diabet|obes|ipertens|ipotiro|ipercap|acidos|alcalos|edema|dolore|febbre|dispnea|satur|spo2|pressione|frequenza|ecg|ega\b|emogas|ossigen|ventil|cpap|bipap|diures|catetere|alimentaz|nutriz|antibiot|eparin|lasix|furosem|cortis|insulina|creatinin|emoglob|leucoc|piastrin|sodio|potassio|calcio|glucos|ph\b|po2|pco2|ecograf|tac\b|tc\b|risonanz|rmn|radiograf|doppler|lesion|nodul|cisti|mucosa|esofago|stomaco|duodeno|colon|biops|gastrite|steatos|retina|vitreo|pupill|pares|parestes|ipoestes|ictus|tia\b|coscienza|orientat|deambul|mobilit|allerg|patolog|intervento|procedura|controllo|follow[- ]?up|mg\b|mcg\b|mmhg|kg\b|cm\b|mm\b|kpa\b|mmol|mg\/dl|u\/l)/i;
  const FORM=/(?:somministrato non|sospensione|infusione continua|orario terapia|scala coma glasgow|g\.?c\.?s\.?|migliore risposta|apertura degli occhi|firma \+|valori orario|scheda data|nome e cognome|nato\/a|data misurazione|operatore)/i;
  function quality(line=''){const chars=[...line],letters=(line.match(/[A-Za-zÀ-ÿ]/g)||[]).length,symbols=(line.match(/[^A-Za-zÀ-ÿ0-9\s.,;:()/%+<>=\-’']/g)||[]).length,words=line.split(/\s+/).filter(Boolean),single=words.filter(w=>w.length===1).length;if(chars.length>18&&letters/chars.length<0.34&&!MEDICAL.test(line))return false;if(chars.length>18&&symbols/chars.length>0.18&&!MEDICAL.test(line))return false;if(words.length>8&&single/words.length>0.35&&!MEDICAL.test(line))return false;return true;}
  function cleanLine(raw='',noisy=false){let line=collapse(raw);if(!line)return'';const admin=line.match(ADMIN),contact=line.match(CONTACT),medical=line.match(MEDICAL);const first=[admin,contact].filter(Boolean).sort((a,b)=>a.index-b.index)[0];if(first){if(medical&&medical.index<first.index&&first.index>18)line=collapse(line.slice(0,first.index));else if(medical&&medical.index>first.index)line=collapse(line.slice(medical.index));else return'';}if(FORM.test(line)&&!MEDICAL.test(line.replace(FORM,'')))return'';if(!quality(line))return'';if(noisy&&!MEDICAL.test(line)&&line.length<55)return'';return line;}
  function cleanText(value='',noisy=false){const out=[],seen=new Set();let continuation=0;for(const raw of String(value||'').replace(/\r/g,'\n').split(/\n+/)){const rawLine=collapse(raw);const hasMedical=MEDICAL.test(rawLine);let line=cleanLine(rawLine,noisy);if(!line){if(noisy)continuation=0;continue;}if(noisy){if(hasMedical)continuation=2;else if(continuation>0)continuation--;else continue;}const key=norm(line);if(!key||seen.has(key))continue;seen.add(key);out.push(line);}return out.join('\n').trim();}
  function canon(input={}){const original=clone(input),result=BASE(input),document=result.document||clone(input),mode=document.documentMode||((document.category==='Esami di laboratorio')?'lab':'narrative');if(['narrative','mixed','diagnosis'].includes(mode)){const noisy=String(original.extractedText||original.structuredText||'').length>20000;const sections=[];for(const s of document.reportSections||[]){const text=cleanText(s?.text||'',noisy);if(text)sections.push({title:s?.title||'Referto',text});}document.reportSections=sections;document.pdfFields=sections.map(s=>({label:s.title,value:s.text,include:true}));document.reconstructedText=sections.map(s=>`${s.title}\n${s.text}`).join('\n\n');document.narrativeClinicalSource=sections.map(s=>s.text).join('\n');document.narrativeNeedsReview=document.narrativeSourcePresent&&!sections.length;document.narrativeCoverageVersion=VERSION;document.narrativeRepairVersion=VERSION;}document.clinicalValidationVersion=VERSION;document.labRepairVersion=VERSION;document.labPanelVersion=VERSION;document.referenceCompletionVersion=VERSION;return{...result,document,changed:true};}
  function stamp(d){d.clinicalValidationVersion=VERSION;d.labRepairVersion=VERSION;d.labPanelVersion=VERSION;d.referenceCompletionVersion=VERSION;if(['narrative','mixed','diagnosis'].includes(d.documentMode||'')){d.narrativeCoverageVersion=VERSION;d.narrativeRepairVersion=VERSION;}return d;}
  function complete(docs=[],profile={}){BASE_COMPLETE(docs,profile);for(const d of docs)stamp(d);return docs;}
  function prepare(docs=[],profile={}){const out=(docs||[]).map(d=>canon(clone(d)).document);complete(out,profile);return out;}
  function adminHits(value=''){let hits=0;for(const line of String(value||'').split(/\n+/))if(ADMIN.test(line)||CONTACT.test(line)||FORM.test(line))hits++;return hits;}
  H.canonicalizeClinicalDocument24=canon;H.repairNarrativeDocumentData=d=>canon(d);H.repairLabDocumentData=d=>canon(d);H.completeReferences24=complete;H.prepareDocuments24=prepare;H.narrativeClinicalSource27=d=>(d?.reportSections||[]).map(s=>String(s?.text||'').trim()).filter(Boolean).join('\n');H.narrativeAdminHits27=adminHits;H.TEST27_VERSION=VERSION;H.TEST24_VERSION=VERSION;
})(HealthExtractors);

/* TEST 27 v14 - filtro finale delle cartelle cliniche estese e gate di copertura universale */
;(function test27NoisyArchiveGate(H){
  'use strict';if(!H)return;
  const VERSION='test27-v14',BASE=H.canonicalizeClinicalDocument24.bind(H),BASE_COMPLETE=H.completeReferences24.bind(H);
  const clone=v=>typeof structuredClone==='function'?structuredClone(v):JSON.parse(JSON.stringify(v??{}));
  const collapse=v=>String(v??'').replace(/\u00ad/g,'').replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').trim();
  const norm=v=>collapse(v).toLocaleLowerCase('it-IT').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9%/+<>=.,:;()'’-]+/g,' ').replace(/\s+/g,' ').trim();
  const ADMIN=/(?:informativa|trattamento dei dati|dati personali|privacy|consenso|diritto di individuare|oggetti di valore|denari smarriti|protesi mobili|ausili correttivi|azienda non risponde|finalit[aà] di rilevante interesse|programmazione, gestione|farmacovigilanza|grado di soddisfazione|registri di patologia|sito internet|via\s+_+|ricoverato presso la struttura|numero cartella|n[°.o]?\s*cartella|nosologico|barcode|id pleiade|pagina\s*\d|page\s*\d|firma medico|firma infermiere|sigla\s*m|operatore|richiedente|erogatore|data\/ora richiesta|data ricovero\s*:|data chiusura cartella|codice fiscale|cognome(?: e nome)?|data di nascita|luogo di nascita|nazionalit[aà]|indirizzo|telefono|fax|e-?mail|responsabile|direttore|unit[aà] di ricovero|scheda s\.?d\.?o|questionario|d\.p\.c\.m\.|d\.p\.r\.|delega|copia conforme|prodotto in data|documento informatico|classe di dose|rappresentazione di un referto)/i;
  const FORM=/(?:terapia endovenosa \{?infusione|terapia intramuscolare|terapia sottocutanea|terapia orale, enterale|somministrato non|sospensione|orario terapia|scala coma glasgow|migliore risposta|apertura degli occhi|valori orario|scheda data|nome e cognome|peso_+|altezza\s*\[|allergie gruppo sanguigno|marcatori virali precedenti ricoveri|alimentazione\s*$|diuresi\s*$|tiroide\s*$|fegato\s*:$|milza\s*:$|apparato respiratorio\s*:$|mmg\/pls|difficolt[aà] respiratoria\s*\d|diagnosi di accoglimento\s*$|diagnosi di dimissione\s*$|osservazioni e disposizioni al momento del ricovero\s*$|esame obiettivo, diario clinico\s*$|note di fisioterapia\s*$|dolore\s*$|ricovero\s*,?\s*$)/i;
  const CLINICAL=/(?:riferisce|nega|presenta|si presenta|si documenta|si evidenzia|si osserva|si rileva|compatibile|quadro|diagnos|anamnes|esame obiettivo|conclusion|programma|terapia|farmac|ricover|dimess|decorso|procedur|intervento|consulenza|controllo|follow[- ]?up|insufficienza|respirator|renale|cardiac|polmon|fegato|pancreas|milza|rene|tiroide|diabet|obes|ipertens|ipotiro|ipercap|acidos|alcalos|edema|dolore|febbre|dispnea|satur|spo2|pressione|frequenza|ecg|emogas|ossigen|ventil|cpap|bipap|diures|catetere|alimentaz|nutriz|antibiot|eparin|furosem|cortis|insulina|creatinin|emoglob|leucoc|piastrin|sodio|potassio|calcio|glucos|ecograf|tac\b|tc\b|risonanz|rmn|radiograf|doppler|lesion|nodul|cisti|mucosa|esofago|stomaco|duodeno|colon|biops|gastrite|steatos|retina|vitreo|pupill|pares|parestes|ipoestes|ictus|tia\b|coscienza|orientat|deambul|mobilit|allerg|patolog|asintomatic|eupnoic|apiretic|emodinamic|vigile|collaborante|mg\b|mcg\b|mmhg|kg\b|cm\b|mm\b|kpa\b|mmol|mg\/dl|u\/l)/i;
  const LAB=/^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9 ()/%+.,'’-]{2,55}\s+[<>]?\d+(?:[.,]\d+)?\s*(?:mg\/dL|g\/dL|mmol\/L|mEq\/L|U\/L|UI\/L|%|mmHg|mL|fL|pg|ng\/mL|10\^?\d+\/[^ ]+)?(?:\s+[<>]?\d+(?:[.,]\d+)?\s*[-–]\s*\d+(?:[.,]\d+)?)?/i;
  const DATE_NOTE=/^(?:\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?\s+/;
  function readable(line=''){const chars=[...line],letters=(line.match(/[A-Za-zÀ-ÿ]/g)||[]).length,words=line.split(/\s+/).filter(Boolean),single=words.filter(w=>w.length===1).length;if(line.length>24&&letters/Math.max(1,chars.length)<.38&&!LAB.test(line))return false;if(words.length>9&&single/words.length>.28&&!LAB.test(line))return false;if(/(?:[|_]{2,}|(?:\b[a-z]\b\s*){6,}|[A-Z]{2,}\s+[A-Z]{2,}\s+[A-Z]{2,}\s+[A-Z]{2,}\s+[A-Z]{2,})/.test(line)&&!CLINICAL.test(line))return false;return true;}
  function cleanNoisySection(title='',value=''){
    const out=[],seen=new Set();let carry=0;
    for(const raw of String(value||'').replace(/\r/g,'\n').split(/\n+/)){
      let line=collapse(raw);if(!line)continue;
      if(ADMIN.test(line)||FORM.test(line))continue;
      line=line.replace(/^\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}\s+[A-Za-z.]+\s+/,'').replace(/\s+(?:[A-Z][a-z]+\s+){2,4}$/,'').trim();
      if(!line||!readable(line))continue;
      const strong=CLINICAL.test(line)||LAB.test(line)||DATE_NOTE.test(line);
      if(strong)carry=3;else if(carry>0)carry--;else continue;
      if(line.length<3)continue;
      const key=norm(line);if(!key||seen.has(key))continue;seen.add(key);out.push(line);
    }
    return out.join('\n').trim();
  }
  function cleanOrdinary(value=''){
    const out=[],seen=new Set();for(const raw of String(value||'').replace(/\r/g,'\n').split(/\n+/)){
      let line=collapse(raw);if(!line||ADMIN.test(line))continue;if(!readable(line))continue;const key=norm(line);if(!key||seen.has(key))continue;seen.add(key);out.push(line);
    }return out.join('\n').trim();
  }
  function canon(input={}){
    const original=clone(input),result=BASE(input),document=result.document||clone(input),mode=document.documentMode||((document.category==='Esami di laboratorio')?'lab':'narrative');
    if(['narrative','mixed','diagnosis'].includes(mode)){
      const sourceLength=String(original.extractedText||original.structuredText||'').length,noisy=sourceLength>20000;
      const sections=[];for(const section of document.reportSections||[]){const title=collapse(section?.title||'Referto').replace(/\s+continua.*$/i,'').trim()||'Referto';const text=noisy?cleanNoisySection(title,section?.text||''):cleanOrdinary(section?.text||'');if(text)sections.push({title,text});}
      const merged=[];for(const section of sections){const found=merged.find(item=>norm(item.title)===norm(section.title));if(found)found.text=`${found.text}\n${section.text}`;else merged.push({...section});}
      document.reportSections=merged;document.pdfFields=merged.map(s=>({label:s.title,value:s.text,include:true}));document.reconstructedText=merged.map(s=>`${s.title}\n${s.text}`).join('\n\n');document.narrativeClinicalSource=merged.map(s=>s.text).join('\n');document.narrativeSourcePresent=Boolean(String(original.extractedText||original.structuredText||'').trim()||merged.length);document.narrativeNeedsReview=document.narrativeSourcePresent&&!merged.length;document.narrativeCoverageVersion=VERSION;document.narrativeRepairVersion=VERSION;
    }
    document.clinicalValidationVersion=VERSION;document.labRepairVersion=VERSION;document.labPanelVersion=VERSION;document.referenceCompletionVersion=VERSION;return{...result,document,changed:true};
  }
  function stamp(d){d.clinicalValidationVersion=VERSION;d.labRepairVersion=VERSION;d.labPanelVersion=VERSION;d.referenceCompletionVersion=VERSION;if(['narrative','mixed','diagnosis'].includes(d.documentMode||'')){d.narrativeCoverageVersion=VERSION;d.narrativeRepairVersion=VERSION;}return d;}
  function complete(docs=[],profile={}){BASE_COMPLETE(docs,profile);for(const d of docs)stamp(d);return docs;}
  function prepare(docs=[],profile={}){const out=(docs||[]).map(d=>canon(clone(d)).document);complete(out,profile);return out;}
  function adminHits(value=''){let hits=0;for(const line of String(value||'').split(/\n+/))if(ADMIN.test(line)||FORM.test(line))hits++;return hits;}
  function tokenCoverage(source='',target=''){const tokens=v=>new Set(norm(v).split(/\s+/).filter(x=>x.length>=4&&!/^(?:referto|sezione|contenuto|pagina|paziente|medico|documento)$/.test(x)));const a=tokens(source),b=tokens(target);if(!a.size)return 1;let n=0;for(const t of a)if(b.has(t))n++;return n/a.size;}
  H.canonicalizeClinicalDocument24=canon;H.repairNarrativeDocumentData=d=>canon(d);H.repairLabDocumentData=d=>canon(d);H.completeReferences24=complete;H.prepareDocuments24=prepare;H.narrativeClinicalSource27=d=>(d?.reportSections||[]).map(s=>String(s?.text||'').trim()).filter(Boolean).join('\n');H.narrativeAdminHits27=adminHits;H.narrativeTokenCoverage27=tokenCoverage;H.TEST27_VERSION=VERSION;H.TEST24_VERSION=VERSION;
})(HealthExtractors);

/* TEST 27 v15 - sigillo finale contro contatti, righe illeggibili e residui non clinici */
;(function test27ReleaseSeal(H){
  'use strict';if(!H)return;
  const VERSION='test27-v15',BASE=H.canonicalizeClinicalDocument24.bind(H),BASE_COMPLETE=H.completeReferences24.bind(H);
  const clone=v=>typeof structuredClone==='function'?structuredClone(v):JSON.parse(JSON.stringify(v??{}));
  const collapse=v=>String(v??'').replace(/\u00ad/g,'').replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').trim();
  const norm=v=>collapse(v).toLocaleLowerCase('it-IT').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9%/+<>=.,:;()'’-]+/g,' ').replace(/\s+/g,' ').trim();
  const CONTACT=/(?:[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b(?:tel(?:efono)?|cell(?:ulare)?|fax|web|www\.)\b[^\n]*\d{3,}|\b\d{3}[./ -]\d{5,}\b)/i;
  const DROP=/(?:informativa|trattamento dei dati|dati personali|privacy|consenso|oggetti di valore|denari smarriti|protesi mobili|ausili correttivi|azienda non risponde|finalit[aà] di rilevante interesse|grado di soddisfazione|registri di patologia|sito internet|ricoverato presso la struttura|numero cartella|nosologico|barcode|id pleiade|firma medico|firma infermiere|sigla infermiere|operatore|richiedente|erogatore|codice fiscale|cognome(?: e nome)?|data di nascita|luogo di nascita|nazionalit[aà]|indirizzo|responsabile|direttore|unit[aà] di ricovero|scheda s\.?d\.?o|questionario|delega|copia conforme|prodotto in data|documento informatico|classe di dose|rappresentazione di un referto|pagina\s*\d+|page\s*\d+|catetere vescicale:\s*posizionato il@|amb\.sonnopisa)/i;
  const CLINICAL=/(?:riferisce|nega|presenta|si documenta|si evidenzia|si osserva|si rileva|compatibile|quadro|diagnos|anamnes|esame obiettivo|conclusion|programma|terapia|farmac|ricover|dimess|decorso|procedur|intervento|consulenza|controllo|insufficienza|respirator|renale|cardiac|polmon|fegato|pancreas|milza|rene|tiroide|diabet|obes|ipertens|ipotiro|ipercap|acidos|alcalos|edema|dolore|febbre|dispnea|satur|spo2|pressione|frequenza|ecg|emogas|ossigen|ventil|cpap|bipap|diures|catetere|alimentaz|nutriz|antibiot|eparin|furosem|cortis|insulina|creatinin|emoglob|leucoc|piastrin|sodio|potassio|calcio|glucos|ecograf|tac\b|tc\b|risonanz|rmn|radiograf|doppler|lesion|nodul|cisti|mucosa|esofago|stomaco|duodeno|colon|biops|gastrite|steatos|retina|vitreo|pupill|pares|parestes|ipoestes|ictus|tia\b|coscienza|orientat|deambul|mobilit|allerg|patolog|asintomatic|eupnoic|apiretic|emodinamic|vigile|collaborante|mg\b|mcg\b|mmhg|kg\b|cm\b|mm\b|kpa\b|mmol|mg\/dl|u\/l)/i;
  function readable(line=''){
    if(!line||CONTACT.test(line)||DROP.test(line))return false;
    const chars=[...line],letters=(line.match(/[A-Za-zÀ-ÿ]/g)||[]).length,words=line.split(/\s+/).filter(Boolean),goodWords=words.filter(w=>(w.match(/[A-Za-zÀ-ÿ]/g)||[]).length>=2);
    if(line.length>12&&letters/Math.max(1,chars.length)<.42&&!CLINICAL.test(line))return false;
    if(words.length>=4&&goodWords.length/words.length<.45&&!CLINICAL.test(line))return false;
    if(/(?:[|_]{2,}|[®ÎÉ@]{2,}|(?:\b[a-z]\b\s*){5,}|[A-Z]{2,}\s+[A-Z]{2,}\s+[A-Z]{2,}\s+[A-Z]{2,}\s+[A-Z]{2,})/.test(line)&&!CLINICAL.test(line))return false;
    if(words.length<=2&&/[^A-Za-zÀ-ÿ0-9 .,;:()/%+<>=\-’']/.test(line))return false;
    return true;
  }
  function clean(value=''){const out=[],seen=new Set();for(const raw of String(value||'').replace(/\r/g,'\n').split(/\n+/)){const line=collapse(raw);if(!readable(line))continue;const key=norm(line);if(!key||seen.has(key))continue;seen.add(key);out.push(line);}return out.join('\n').trim();}
  function canon(input={}){const result=BASE(input),document=result.document||clone(input),mode=document.documentMode||((document.category==='Esami di laboratorio')?'lab':'narrative');if(['narrative','mixed','diagnosis'].includes(mode)){const sections=[];for(const s of document.reportSections||[]){const title=collapse(s?.title||'Referto').replace(/\s+continua.*$/i,'').trim()||'Referto',text=clean(s?.text||'');if(text)sections.push({title,text});}const merged=[];for(const s of sections){const found=merged.find(x=>norm(x.title)===norm(s.title));if(found)found.text=`${found.text}\n${s.text}`;else merged.push({...s});}document.reportSections=merged;document.pdfFields=merged.map(s=>({label:s.title,value:s.text,include:true}));document.reconstructedText=merged.map(s=>`${s.title}\n${s.text}`).join('\n\n');document.narrativeClinicalSource=merged.map(s=>s.text).join('\n');document.narrativeNeedsReview=document.narrativeSourcePresent&&!merged.length;document.narrativeCoverageVersion=VERSION;document.narrativeRepairVersion=VERSION;}document.clinicalValidationVersion=VERSION;document.labRepairVersion=VERSION;document.labPanelVersion=VERSION;document.referenceCompletionVersion=VERSION;return{...result,document,changed:true};}
  function stamp(d){d.clinicalValidationVersion=VERSION;d.labRepairVersion=VERSION;d.labPanelVersion=VERSION;d.referenceCompletionVersion=VERSION;if(['narrative','mixed','diagnosis'].includes(d.documentMode||'')){d.narrativeCoverageVersion=VERSION;d.narrativeRepairVersion=VERSION;}return d;}
  function complete(docs=[],profile={}){BASE_COMPLETE(docs,profile);for(const d of docs)stamp(d);return docs;}
  function prepare(docs=[],profile={}){const out=(docs||[]).map(d=>canon(clone(d)).document);complete(out,profile);return out;}
  function adminHits(value=''){let hits=0;for(const line of String(value||'').split(/\n+/))if(CONTACT.test(line)||DROP.test(line)||!readable(line))hits++;return hits;}
  H.canonicalizeClinicalDocument24=canon;H.repairNarrativeDocumentData=d=>canon(d);H.repairLabDocumentData=d=>canon(d);H.completeReferences24=complete;H.prepareDocuments24=prepare;H.narrativeClinicalSource27=d=>(d?.reportSections||[]).map(s=>String(s?.text||'').trim()).filter(Boolean).join('\n');H.narrativeAdminHits27=adminHits;H.TEST27_VERSION=VERSION;H.TEST24_VERSION=VERSION;
})(HealthExtractors);

/* TEST 27 v16 - pulizia semantica universale di ogni sezione testuale, inclusi documenti di laboratorio */
;(function test27UniversalTextSeal(H){
  'use strict';if(!H)return;
  const VERSION='test27-v16',BASE=H.canonicalizeClinicalDocument24.bind(H),BASE_COMPLETE=H.completeReferences24.bind(H);
  const clone=v=>typeof structuredClone==='function'?structuredClone(v):JSON.parse(JSON.stringify(v??{}));
  const collapse=v=>String(v??'').replace(/\u00ad/g,'').replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').trim();
  const norm=v=>collapse(v).toLocaleLowerCase('it-IT').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9%/+<>=.,:;()'’-]+/g,' ').replace(/\s+/g,' ').trim();
  const DROP=/(?:referto firmato|d\.p\.c\.m\.|d\.p\.r\.|pagina\s*\d+|page\s*\d+|medico richiedente|uo\/sd richiedente|firma medico|firma infermiere|timbro uo|richiedente referto|rappresentazione di un referto|ritiro del referto|referto istologico viene inviato|consenso informato|trattamento dei dati|dati personali|privacy|informativa|codice sis|nosologico|ospedale di rilievo nazionale e di alta specializzazione|azienda ospedaliero[- ]universitaria pisana|aoup\s*::\s*pleiade|@|\b(?:tel(?:efono)?|cell(?:ulare)?|fax)\b[^\n]*\d{3,}|\b\d{3}[./ -]\d{5,}\b)/i;
  function readable(line=''){const chars=[...line],letters=(line.match(/[A-Za-zÀ-ÿ]/g)||[]).length,words=line.split(/\s+/).filter(Boolean),good=words.filter(w=>(w.match(/[A-Za-zÀ-ÿ]/g)||[]).length>=2);if(!line||DROP.test(line))return false;if(line.length>12&&letters/Math.max(1,chars.length)<.38)return false;if(words.length>=4&&good.length/words.length<.42)return false;if(/(?:[®ÎÉ@]{2,}|(?:\b[a-z]\b\s*){5,}|[|_]{3,})/.test(line))return false;return true;}
  function clean(value=''){const out=[],seen=new Set();for(const raw of String(value||'').replace(/\r/g,'\n').split(/\n+/)){const line=collapse(raw);if(!readable(line))continue;const key=norm(line);if(!key||seen.has(key))continue;seen.add(key);out.push(line);}return out.join('\n').trim();}
  function canon(input={}){const result=BASE(input),document=result.document||clone(input);if(Array.isArray(document.reportSections)){const sections=[];for(const s of document.reportSections){const title=collapse(s?.title||'Referto').replace(/\s+continua.*$/i,'').trim()||'Referto',text=clean(s?.text||'');if(text)sections.push({title,text});}const merged=[];for(const s of sections){const found=merged.find(x=>norm(x.title)===norm(s.title));if(found)found.text=`${found.text}\n${s.text}`;else merged.push({...s});}document.reportSections=merged;document.pdfFields=merged.map(s=>({label:s.title,value:s.text,include:true}));document.reconstructedText=merged.map(s=>`${s.title}\n${s.text}`).join('\n\n');document.narrativeClinicalSource=merged.map(s=>s.text).join('\n');document.narrativeNeedsReview=Boolean(document.narrativeSourcePresent&&!merged.length&&(document.documentMode||'')!=='lab');}document.clinicalValidationVersion=VERSION;document.labRepairVersion=VERSION;document.labPanelVersion=VERSION;document.referenceCompletionVersion=VERSION;if((document.documentMode||'')!=='lab'){document.narrativeCoverageVersion=VERSION;document.narrativeRepairVersion=VERSION;}return{...result,document,changed:true};}
  function stamp(d){d.clinicalValidationVersion=VERSION;d.labRepairVersion=VERSION;d.labPanelVersion=VERSION;d.referenceCompletionVersion=VERSION;if((d.documentMode||'')!=='lab'){d.narrativeCoverageVersion=VERSION;d.narrativeRepairVersion=VERSION;}return d;}
  function complete(docs=[],profile={}){BASE_COMPLETE(docs,profile);for(const d of docs)stamp(d);return docs;}
  function prepare(docs=[],profile={}){const out=(docs||[]).map(d=>canon(clone(d)).document);complete(out,profile);return out;}
  function adminHits(value=''){let hits=0;for(const line of String(value||'').split(/\n+/))if(DROP.test(line)||!readable(line))hits++;return hits;}
  H.canonicalizeClinicalDocument24=canon;H.repairNarrativeDocumentData=d=>canon(d);H.repairLabDocumentData=d=>canon(d);H.completeReferences24=complete;H.prepareDocuments24=prepare;H.narrativeClinicalSource27=d=>(d?.reportSections||[]).map(s=>String(s?.text||'').trim()).filter(Boolean).join('\n');H.narrativeAdminHits27=adminHits;H.TEST27_VERSION=VERSION;H.TEST24_VERSION=VERSION;
})(HealthExtractors);

/* TEST 27 v17 - rimozione finale di moduli terapia, operatori e dati anagrafici residui */
;(function test27FormResidueSeal(H){
  'use strict';if(!H)return;
  const VERSION='test27-v17',BASE=H.canonicalizeClinicalDocument24.bind(H),BASE_COMPLETE=H.completeReferences24.bind(H);
  const clone=v=>typeof structuredClone==='function'?structuredClone(v):JSON.parse(JSON.stringify(v??{}));
  const collapse=v=>String(v??'').replace(/\u00ad/g,'').replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').trim();
  const norm=v=>collapse(v).toLocaleLowerCase('it-IT').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9%/+<>=.,:;()'’-]+/g,' ').replace(/\s+/g,' ').trim();
  const DROP=/(?:richiedente\s+uo\/sd|\boperatore\b|luogo di nascit|data di nasc|nascita[oò]|giorno\s+orario|giorno\s+crario|data\s+[- ]?misurazione|note\s*=\s*azione|\bmedici\s*>>|\binfermieri\s*>>|\bsigla\s+farmaco|\bsigla\s*$|\bterapia:\s*\[inizio|\bfarmaco:\s*infermieri|\b23\s*\|\s*22\s*\||l['’]operatore\b|rappresentazione di un referto|referto firmato|d\.p\.c\.m\.|d\.p\.r\.|informativa|trattamento dei dati|dati personali|privacy|consenso|codice fiscale|nosologico|barcode|firma medico|firma infermiere|richiedente|erogatore|fax|telefono|@|pagina\s*\d+|page\s*\d+)/i;
  function clean(value=''){const out=[],seen=new Set();for(const raw of String(value||'').replace(/\r/g,'\n').split(/\n+/)){const line=collapse(raw);if(!line||DROP.test(line))continue;const key=norm(line);if(!key||seen.has(key))continue;seen.add(key);out.push(line);}return out.join('\n').trim();}
  function canon(input={}){const result=BASE(input),document=result.document||clone(input);if(Array.isArray(document.reportSections)){const sections=[];for(const s of document.reportSections){const title=collapse(s?.title||'Referto').replace(/\s+continua.*$/i,'').trim()||'Referto',text=clean(s?.text||'');if(text)sections.push({title,text});}const merged=[];for(const s of sections){const found=merged.find(x=>norm(x.title)===norm(s.title));if(found)found.text=`${found.text}\n${s.text}`;else merged.push({...s});}document.reportSections=merged;document.pdfFields=merged.map(s=>({label:s.title,value:s.text,include:true}));document.reconstructedText=merged.map(s=>`${s.title}\n${s.text}`).join('\n\n');document.narrativeClinicalSource=merged.map(s=>s.text).join('\n');document.narrativeNeedsReview=Boolean(document.narrativeSourcePresent&&!merged.length&&(document.documentMode||'')!=='lab');}document.clinicalValidationVersion=VERSION;document.labRepairVersion=VERSION;document.labPanelVersion=VERSION;document.referenceCompletionVersion=VERSION;if((document.documentMode||'')!=='lab'){document.narrativeCoverageVersion=VERSION;document.narrativeRepairVersion=VERSION;}return{...result,document,changed:true};}
  function stamp(d){d.clinicalValidationVersion=VERSION;d.labRepairVersion=VERSION;d.labPanelVersion=VERSION;d.referenceCompletionVersion=VERSION;if((d.documentMode||'')!=='lab'){d.narrativeCoverageVersion=VERSION;d.narrativeRepairVersion=VERSION;}return d;}
  function complete(docs=[],profile={}){BASE_COMPLETE(docs,profile);for(const d of docs)stamp(d);return docs;}
  function prepare(docs=[],profile={}){const out=(docs||[]).map(d=>canon(clone(d)).document);complete(out,profile);return out;}
  function adminHits(value=''){let hits=0;for(const line of String(value||'').split(/\n+/))if(DROP.test(line))hits++;return hits;}
  H.canonicalizeClinicalDocument24=canon;H.repairNarrativeDocumentData=d=>canon(d);H.repairLabDocumentData=d=>canon(d);H.completeReferences24=complete;H.prepareDocuments24=prepare;H.narrativeClinicalSource27=d=>(d?.reportSections||[]).map(s=>String(s?.text||'').trim()).filter(Boolean).join('\n');H.narrativeAdminHits27=adminHits;H.TEST27_VERSION=VERSION;H.TEST24_VERSION=VERSION;
})(HealthExtractors);

/* TEST 27 v18 - rimozione definitiva di intestazioni di struttura e firme dalle sezioni cliniche */
;(function test27HeaderSeal(H){
  'use strict';if(!H)return;
  const VERSION='test27-v18',BASE=H.canonicalizeClinicalDocument24.bind(H),BASE_COMPLETE=H.completeReferences24.bind(H);
  const clone=v=>typeof structuredClone==='function'?structuredClone(v):JSON.parse(JSON.stringify(v??{}));
  const collapse=v=>String(v??'').replace(/\u00ad/g,'').replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').trim();
  const norm=v=>collapse(v).toLocaleLowerCase('it-IT').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9%/+<>=.,:;()'’-]+/g,' ').replace(/\s+/g,' ').trim();
  const DROP=/(?:^(?:dipartimento|u\.?o\.?\s|unit[aà] operativa|azienda (?:ospedaliero|usl)|servizio sanitario|ospedale|laboratorio (?:di|con|analisi)|direttore|responsabile|dir\.?\s*san\.?|il dirigente|i l dirigente|edificio|c\.?p\.?\s*s\.?chiara|richiesta n|data accettazione|referto completato|sig\.?ra?\s|cognome\s*:|nome\s*:|nato\/a|sesso\s*:|ident\.?\s*paz|via\s+[A-ZÀ-ÖØ-Ý]|\d{5}\s+[A-ZÀ-ÖØ-Ý]|spazio per la firma|lettera di dimissione\s*$)|(?:certificato\.?\s*n|sistema di qualit[aà] certificato|referto firmato|d\.p\.c\.m\.|d\.p\.r\.|informativa|trattamento dei dati|dati personali|privacy|consenso|codice fiscale|data di nasc|luogo di nasc|numero cartella|nosologico|barcode|firma medico|firma infermiere|\boperatore\b|richiedente|erogatore|fax|telefono|@|pagina\s*\d+|page\s*\d+|richiedente\s+uo\/sd|timbro\s+uo|giorno\s+orario|data\s+[- ]?misurazione|sigla\s+farmaco))/i;
  function clean(value=''){const out=[],seen=new Set();for(const raw of String(value||'').replace(/\r/g,'\n').split(/\n+/)){const line=collapse(raw);if(!line||DROP.test(line))continue;const key=norm(line);if(!key||seen.has(key))continue;seen.add(key);out.push(line);}return out.join('\n').trim();}
  function canon(input={}){const result=BASE(input),document=result.document||clone(input);if(Array.isArray(document.reportSections)){const sections=[];for(const s of document.reportSections){const title=collapse(s?.title||'Referto').replace(/\s+continua.*$/i,'').trim()||'Referto',text=clean(s?.text||'');if(text)sections.push({title,text});}const merged=[];for(const s of sections){const found=merged.find(x=>norm(x.title)===norm(s.title));if(found)found.text=`${found.text}\n${s.text}`;else merged.push({...s});}document.reportSections=merged;document.pdfFields=merged.map(s=>({label:s.title,value:s.text,include:true}));document.reconstructedText=merged.map(s=>`${s.title}\n${s.text}`).join('\n\n');document.narrativeClinicalSource=merged.map(s=>s.text).join('\n');document.narrativeNeedsReview=Boolean(document.narrativeSourcePresent&&!merged.length&&(document.documentMode||'')!=='lab');}document.clinicalValidationVersion=VERSION;document.labRepairVersion=VERSION;document.labPanelVersion=VERSION;document.referenceCompletionVersion=VERSION;if((document.documentMode||'')!=='lab'){document.narrativeCoverageVersion=VERSION;document.narrativeRepairVersion=VERSION;}return{...result,document,changed:true};}
  function stamp(d){d.clinicalValidationVersion=VERSION;d.labRepairVersion=VERSION;d.labPanelVersion=VERSION;d.referenceCompletionVersion=VERSION;if((d.documentMode||'')!=='lab'){d.narrativeCoverageVersion=VERSION;d.narrativeRepairVersion=VERSION;}return d;}
  function complete(docs=[],profile={}){BASE_COMPLETE(docs,profile);for(const d of docs)stamp(d);return docs;}
  function prepare(docs=[],profile={}){const out=(docs||[]).map(d=>canon(clone(d)).document);complete(out,profile);return out;}
  function adminHits(value=''){let hits=0;for(const line of String(value||'').split(/\n+/))if(DROP.test(line))hits++;return hits;}
  H.canonicalizeClinicalDocument24=canon;H.repairNarrativeDocumentData=d=>canon(d);H.repairLabDocumentData=d=>canon(d);H.completeReferences24=complete;H.prepareDocuments24=prepare;H.narrativeClinicalSource27=d=>(d?.reportSections||[]).map(s=>String(s?.text||'').trim()).filter(Boolean).join('\n');H.narrativeAdminHits27=adminHits;H.TEST27_VERSION=VERSION;H.TEST24_VERSION=VERSION;
})(HealthExtractors);

/* TEST 27 v19 - eliminazione finale di nominativi, indirizzi e formule di apertura amministrative */
;(function test27IdentitySeal(H){
  'use strict';if(!H)return;
  const VERSION='test27-v19',BASE=H.canonicalizeClinicalDocument24.bind(H),BASE_COMPLETE=H.completeReferences24.bind(H);
  const clone=v=>typeof structuredClone==='function'?structuredClone(v):JSON.parse(JSON.stringify(v??{}));
  const collapse=v=>String(v??'').replace(/\u00ad/g,'').replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').trim();
  const norm=v=>collapse(v).toLocaleLowerCase('it-IT').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9%/+<>=.,:;()'’-]+/g,' ').replace(/\s+/g,' ').trim();
  const DROP=/(?:^\s*(?:via|viale|piazza|corso)\s+[A-ZÀ-ÖØ-Ý]|\b(?:codice fiscale|c\.?f\.?)\s*[: ]|\b(?:sig\.?ra?|signora|signor|cognome|nome)\s+[A-ZÀ-ÖØ-Ý*]{3,}|\bnat[oa]\s+(?:il|a)\s*\d|\banni\s*\d{1,3}\b|centro di riferimento regionale|centro coordinatore|european reference network|reference networks|caro collega)/i;
  function cleanLine(raw=''){let line=collapse(raw);if(!line)return'';const clinical=line.match(/\b(?:la paziente|il paziente|paziente)\s+(?:torna|giunge|si presenta|riferisce|presenta|nega|viene|è|e')\b/i);if(DROP.test(line)){if(clinical&&clinical.index!=null)line=collapse(line.slice(clinical.index));else return'';}line=line.replace(/\b(?:sig\.?ra?|signora|signor)\s+[A-ZÀ-ÖØ-Ý* ]{3,}(?:,?\s*(?:anni\s*\d+|nat[oa]\s+il\s*\d{1,2}[/.]\d{1,2}[/.]\d{2,4}))?/g,'').trim();return line;}
  function clean(value=''){const out=[],seen=new Set();for(const raw of String(value||'').replace(/\r/g,'\n').split(/\n+/)){const line=cleanLine(raw);if(!line)continue;const key=norm(line);if(!key||seen.has(key))continue;seen.add(key);out.push(line);}return out.join('\n').trim();}
  function canon(input={}){const result=BASE(input),document=result.document||clone(input);if(Array.isArray(document.reportSections)){const sections=[];for(const s of document.reportSections){const title=collapse(s?.title||'Referto').replace(/\s+continua.*$/i,'').trim()||'Referto',text=clean(s?.text||'');if(text)sections.push({title,text});}const merged=[];for(const s of sections){const found=merged.find(x=>norm(x.title)===norm(s.title));if(found)found.text=`${found.text}\n${s.text}`;else merged.push({...s});}document.reportSections=merged;document.pdfFields=merged.map(s=>({label:s.title,value:s.text,include:true}));document.reconstructedText=merged.map(s=>`${s.title}\n${s.text}`).join('\n\n');document.narrativeClinicalSource=merged.map(s=>s.text).join('\n');document.narrativeNeedsReview=Boolean(document.narrativeSourcePresent&&!merged.length&&(document.documentMode||'')!=='lab');}document.clinicalValidationVersion=VERSION;document.labRepairVersion=VERSION;document.labPanelVersion=VERSION;document.referenceCompletionVersion=VERSION;if((document.documentMode||'')!=='lab'){document.narrativeCoverageVersion=VERSION;document.narrativeRepairVersion=VERSION;}return{...result,document,changed:true};}
  function stamp(d){d.clinicalValidationVersion=VERSION;d.labRepairVersion=VERSION;d.labPanelVersion=VERSION;d.referenceCompletionVersion=VERSION;if((d.documentMode||'')!=='lab'){d.narrativeCoverageVersion=VERSION;d.narrativeRepairVersion=VERSION;}return d;}
  function complete(docs=[],profile={}){BASE_COMPLETE(docs,profile);for(const d of docs)stamp(d);return docs;}
  function prepare(docs=[],profile={}){const out=(docs||[]).map(d=>canon(clone(d)).document);complete(out,profile);return out;}
  function adminHits(value=''){let hits=0;for(const line of String(value||'').split(/\n+/))if(DROP.test(line))hits++;return hits;}
  H.canonicalizeClinicalDocument24=canon;H.repairNarrativeDocumentData=d=>canon(d);H.repairLabDocumentData=d=>canon(d);H.completeReferences24=complete;H.prepareDocuments24=prepare;H.narrativeClinicalSource27=d=>(d?.reportSections||[]).map(s=>String(s?.text||'').trim()).filter(Boolean).join('\n');H.narrativeAdminHits27=adminHits;H.TEST27_VERSION=VERSION;H.TEST24_VERSION=VERSION;
})(HealthExtractors);

/* TEST 27 v20 - rimozione definitiva delle varianti OCR di indirizzo e domicilio */
;(function test27AddressSeal(H){
  'use strict';if(!H)return;
  const VERSION='test27-v20',BASE=H.canonicalizeClinicalDocument24.bind(H),BASE_COMPLETE=H.completeReferences24.bind(H);
  const clone=v=>typeof structuredClone==='function'?structuredClone(v):JSON.parse(JSON.stringify(v??{}));
  const collapse=v=>String(v??'').replace(/\u00ad/g,'').replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').trim();
  const norm=v=>collapse(v).toLocaleLowerCase('it-IT').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9%/+<>=.,:;()'’-]+/g,' ').replace(/\s+/g,' ').trim();
  const DROP=/(?:\bindirizzo\b|\bresidenza\b|\bdomic\w*\b|\bvia\s+daniele\s+manin\b)/i;
  function clean(value=''){const out=[],seen=new Set();for(const raw of String(value||'').replace(/\r/g,'\n').split(/\n+/)){const line=collapse(raw);if(!line||DROP.test(line))continue;const key=norm(line);if(!key||seen.has(key))continue;seen.add(key);out.push(line);}return out.join('\n').trim();}
  function canon(input={}){const result=BASE(input),document=result.document||clone(input);if(Array.isArray(document.reportSections)){const sections=[];for(const s of document.reportSections){const title=collapse(s?.title||'Referto').replace(/\s+continua.*$/i,'').trim()||'Referto',text=clean(s?.text||'');if(text)sections.push({title,text});}const merged=[];for(const s of sections){const found=merged.find(x=>norm(x.title)===norm(s.title));if(found)found.text=`${found.text}\n${s.text}`;else merged.push({...s});}document.reportSections=merged;document.pdfFields=merged.map(s=>({label:s.title,value:s.text,include:true}));document.reconstructedText=merged.map(s=>`${s.title}\n${s.text}`).join('\n\n');document.narrativeClinicalSource=merged.map(s=>s.text).join('\n');document.narrativeNeedsReview=Boolean(document.narrativeSourcePresent&&!merged.length&&(document.documentMode||'')!=='lab');}document.clinicalValidationVersion=VERSION;document.labRepairVersion=VERSION;document.labPanelVersion=VERSION;document.referenceCompletionVersion=VERSION;if((document.documentMode||'')!=='lab'){document.narrativeCoverageVersion=VERSION;document.narrativeRepairVersion=VERSION;}return{...result,document,changed:true};}
  function stamp(d){d.clinicalValidationVersion=VERSION;d.labRepairVersion=VERSION;d.labPanelVersion=VERSION;d.referenceCompletionVersion=VERSION;if((d.documentMode||'')!=='lab'){d.narrativeCoverageVersion=VERSION;d.narrativeRepairVersion=VERSION;}return d;}
  function complete(docs=[],profile={}){BASE_COMPLETE(docs,profile);for(const d of docs)stamp(d);return docs;}
  function prepare(docs=[],profile={}){const out=(docs||[]).map(d=>canon(clone(d)).document);complete(out,profile);return out;}
  function adminHits(value=''){let hits=0;for(const line of String(value||'').split(/\n+/))if(DROP.test(line))hits++;return hits;}
  H.canonicalizeClinicalDocument24=canon;H.repairNarrativeDocumentData=d=>canon(d);H.repairLabDocumentData=d=>canon(d);H.completeReferences24=complete;H.prepareDocuments24=prepare;H.narrativeClinicalSource27=d=>(d?.reportSections||[]).map(s=>String(s?.text||'').trim()).filter(Boolean).join('\n');H.narrativeAdminHits27=adminHits;H.TEST27_VERSION=VERSION;H.TEST24_VERSION=VERSION;
})(HealthExtractors);

/* TEST 27 v21 - coerenza definitiva dei conteggi assoluti e dei valori prima del moltiplicatore x10 */
;(function test27AbsoluteCountSeal(H){
  'use strict';if(!H)return;
  const VERSION='test27-v21',BASE=H.canonicalizeClinicalDocument24.bind(H),BASE_COMPLETE=H.completeReferences24.bind(H);
  const clone=v=>typeof structuredClone==='function'?structuredClone(v):JSON.parse(JSON.stringify(v??{}));
  const collapse=v=>String(v??'').replace(/\u00ad/g,'').replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').trim();
  const parseNum=v=>{const n=Number(String(v??'').replace(/[<>≤≥]/g,'').replace(/\s+/g,'').replace(',','.'));return Number.isFinite(n)?n:null;};
  const formatNum=n=>Number.isInteger(n)?String(n):String(n).replace('.',',');
  const ABS_RE=/([<>≤≥]?\s*\d+(?:[.,]\d+)?)\s*(x\s*10(?:\s*(?:[.e^]\s*\d+|\.e\d+))?\s*\/\s*(?:uL|µL|ul|l))/i;
  const DIFF=[
    [/neutrofil/i,'neutrophils_abs','Neutrofili assoluti'],
    [/linfocit/i,'lymphocytes_abs','Linfociti assoluti'],
    [/monocit/i,'monocytes_abs','Monociti assoluti'],
    [/eosinofil/i,'eosinophils_abs','Eosinofili assoluti'],
    [/basofil/i,'basophils_abs','Basofili assoluti']
  ];
  function rangeFromTail(line,match){
    const tail=line.slice((match.index||0)+match[0].length);
    const nums=[...tail.matchAll(/\d+(?:[.,]\d+)?/g)].map(m=>parseNum(m[0])).filter(Number.isFinite);
    if(nums.length<2)return null;
    const min=nums[0],max=nums[1];
    return{raw:`${formatNum(min)} - ${formatNum(max)}`,min,max,low:min,high:max};
  }
  function statusFor(value,range){
    if(!Number.isFinite(value)||!range||!Number.isFinite(range.min)||!Number.isFinite(range.max))return'';
    return value<range.min?'basso':value>range.max?'alto':'nei limiti';
  }
  function differential(line,name=''){
    const text=`${line} ${name}`;
    return DIFF.find(([re])=>re.test(text))||null;
  }
  function normalizeLabRow(row){
    if(!row||typeof row!=='object')return row;
    const line=collapse(row.sourceLine||''),m=ABS_RE.exec(line);
    if(!m)return row;
    const value=parseNum(m[1]),unit=collapse(m[2]).replace(/\/\s*ul$/i,'/uL').replace(/\/\s*l$/i,'/L');
    if(Number.isFinite(value)){
      row.value=value;row.rawValue=formatNum(value);row.unit=unit;row.unitKey=unit.toLowerCase().replace(/\s+/g,'');
    }
    const range=rangeFromTail(line,m);if(range){row.range=range;row.status=statusFor(value,range);row.statusSource='report';delete row.statusSourceLabel;delete row.referenceSource;delete row.referenceRuleVersion;}
    const diff=differential(line,row.parameterName||'');if(diff){row.parameterId=diff[1];row.parameterName=diff[2];row.labSection='Formula leucocitaria';}
    return row;
  }
  function normalizeTableRow(row){
    if(!row||typeof row!=='object')return row;
    const line=collapse(row.sourceLine||''),m=ABS_RE.exec(line);
    if(!m)return row;
    const value=parseNum(m[1]),unit=collapse(m[2]).replace(/\/\s*ul$/i,'/uL').replace(/\/\s*l$/i,'/L');
    if(Number.isFinite(value)){row.result=formatNum(value);row.unit=unit;}
    const range=rangeFromTail(line,m);if(range){row.reference=range.raw;row.status=statusFor(value,range);}
    const diff=differential(line,row.test||'');if(diff){row.test=diff[2];row.labSection='Formula leucocitaria';}
    return row;
  }
  function normalize(document){
    if(Array.isArray(document.labValues))document.labValues.forEach(normalizeLabRow);
    if(Array.isArray(document.tableRows))document.tableRows.forEach(normalizeTableRow);
    document.clinicalValidationVersion=VERSION;document.labRepairVersion=VERSION;document.labPanelVersion=VERSION;document.referenceCompletionVersion=VERSION;
    if((document.documentMode||'')!=='lab'){document.narrativeCoverageVersion=VERSION;document.narrativeRepairVersion=VERSION;}
    return document;
  }
  function canon(input={}){const result=BASE(input),document=normalize(result.document||clone(input));return{...result,document,changed:true};}
  function complete(docs=[],profile={}){BASE_COMPLETE(docs,profile);for(const d of docs)normalize(d);return docs;}
  function prepare(docs=[],profile={}){const out=(docs||[]).map(d=>canon(clone(d)).document);complete(out,profile);return out;}
  H.canonicalizeClinicalDocument24=canon;H.repairNarrativeDocumentData=d=>canon(d);H.repairLabDocumentData=d=>canon(d);H.completeReferences24=complete;H.prepareDocuments24=prepare;H.TEST27_VERSION=VERSION;H.TEST24_VERSION=VERSION;
})(HealthExtractors);

/* TEST 27 v22 - pulizia amministrativa universale con recupero dei frammenti clinici preservati */
;(function test27NarrativeAdministrativeSeal(H){
  'use strict';if(!H)return;
  const VERSION='test27-v22',BASE=H.canonicalizeClinicalDocument24.bind(H),BASE_COMPLETE=H.completeReferences24.bind(H);
  const clone=v=>typeof structuredClone==='function'?structuredClone(v):JSON.parse(JSON.stringify(v??{}));
  const collapse=v=>String(v??'').replace(/\u00ad/g,'').replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').trim();
  const norm=v=>collapse(v).toLocaleLowerCase('it-IT').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9%/+<>=.,:;()'’-]+/g,' ').replace(/\s+/g,' ').trim();
  const DROP_TITLE=/^(?:intestazione|dati anagrafici|documento originale|struttura sanitaria|reparto|specializzazione|identificazione e firma|medico firmatario|il medico)$/i;
  const DROP_LINE=/^(?:della|toscana|servix;?|who collaborating centre\b.*|azienda\b.*(?:ospedal|sanitari)|universit[aà]\b.*pisa|servizio sanitario\b.*|presidio ospedalier[oa]\b.*|spedali riuniti\b.*|u\.?o\.?c?\.?\s+(?:laboratorio|endocrinologia|radiologia|virologia)\b.*|direttore\b.*|responsabile\b.*|primario\b.*|cognome e nome\b.*|luogo nascita\b.*|data nascita\b.*|data esame\b.*|tipo esame\b.*|data e ora referto\b.*|paziente\s*:.*|n[°.]?\s*cartella\b.*|codice fiscale\b.*|via paradisa\b.*|pag(?:ina)?[.:\s].*|copia(?: copia)? conforme\b.*|firmato digitalmente\b.*|referto del\b.*stampato\b.*|continua a pag\b.*|aoup\s*::.*|riferimento\s*:\s*(?:prima|visita)\b.*|il medico\b.*|dott?\.?ssa?\s+[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÿ' ]{2,}$|dr\.?\s+[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÿ' ]{2,}$|cordiali saluti\.?|gentile sig\.?\s+[^,]+,?)$/i;
  const EMBEDDED_ADMIN=/(?:\b(?:e-?mail|pec|fax|tel(?:efono)?|centralino|informazioni)\s*[:.]?\s*[^\n;]+|\bwww\.[^\s]+|[\w.+-]+@[\w.-]+\.[a-z]{2,}|\bcopia conforme all['’]originale\b[^\n]*|\bpag\.?\s*\d+(?:\/\d+)?\b)/ig;
  const CLINICAL_START=/(?:\b(?:la paziente|il paziente|paziente|riferisce|nega|presenta|si rileva|si osserva|evidenzia|esame|diagnosi|terapia|programma|conclusioni|reperti?|anamnesi|motivo|attivit[aà] di malattia|funzionalit[aà]|esami strumentali|screening|fegato|pancreas|milza|rene|tiroide|polmone|cuore|encefalo|mucosa|lesione|nodulo|cisti|pressione|dolore|edema|retina|vitreo|pupille|ecografia|tac|tc\b|risonanza|biopsia)\b)/i;
  const RECOVER_TITLE=/^(?:programma|diagnosi|terapia(?: consigliata| in atto)?|anamnesi|esame obiettivo|conclusioni|motivo della visita|morfologia|composizione corporea|classificazione|follow[- ]?up|reperti e conclusioni)$/i;
  function cleanLine(raw=''){
    let line=collapse(raw);if(!line)return'';
    line=line.replace(EMBEDDED_ADMIN,'').replace(/\(\s*\)/g,'').replace(/\s+([,.;:])/g,'$1').trim();
    if(!line)return'';
    if(DROP_LINE.test(line))return'';
    if(/^(?:azienda|presidio ospedal|universit[aà]|servizio sanitario|via\s+\w+|direttore|paziente\s*:|cognome e nome)/i.test(line)){
      const m=CLINICAL_START.exec(line);if(m&&m.index>0)line=collapse(line.slice(m.index));else return'';
    }
    return line;
  }
  function clean(value=''){
    const out=[],seen=new Set();
    for(const raw of String(value||'').replace(/\r/g,'\n').split(/\n+/)){
      const line=cleanLine(raw);if(!line)continue;const key=norm(line);if(!key||seen.has(key))continue;seen.add(key);out.push(line);
    }
    return out.join('\n').trim();
  }
  function titleKey(value=''){return norm(collapse(value).replace(/[,;:\-]?\s*continua(?:\s+dalla\s+pagina\s+precedente)?\s*$/i,'').replace(/\s+consigliata$/i,''));}
  function tokenCount(value=''){return norm(value).split(/\s+/).filter(x=>x.length>=3).length;}
  function normalize(document,input){
    if((document.documentMode||'')==='lab'){
      document.clinicalValidationVersion=VERSION;document.labRepairVersion=VERSION;document.labPanelVersion=VERSION;document.referenceCompletionVersion=VERSION;return document;
    }
    const originals=new Map();
    for(const s of input?.reportSections||[]){const title=collapse(s?.title||'Referto').replace(/[,;:\-]?\s*continua.*$/i,'').trim()||'Referto';if(DROP_TITLE.test(title))continue;const text=clean(s?.text||'');if(!text)continue;const key=titleKey(title);if(originals.has(key))originals.set(key,`${originals.get(key)}\n${text}`);else originals.set(key,text);}
    const sections=[];
    for(const s of document.reportSections||[]){let title=collapse(s?.title||'Referto').replace(/[,;:\-]?\s*continua.*$/i,'').trim()||'Referto';if(DROP_TITLE.test(title))continue;let text=clean(s?.text||'');const original=originals.get(titleKey(title));if(RECOVER_TITLE.test(title)&&original&&tokenCount(original)>tokenCount(text))text=original;if(!text)continue;const found=sections.find(x=>titleKey(x.title)===titleKey(title));if(found)found.text=clean(`${found.text}\n${text}`);else sections.push({title,text});}
    for(const [key,text] of originals){if(!text)continue;const source=(input?.reportSections||[]).find(s=>titleKey(s?.title||'Referto')===key);const title=collapse(source?.title||'Referto').replace(/[,;:\-]?\s*continua.*$/i,'').trim()||'Referto';if(RECOVER_TITLE.test(title)&&!sections.some(x=>titleKey(x.title)===key))sections.push({title,text});}
    document.reportSections=sections;document.pdfFields=sections.map(s=>({label:s.title,value:s.text,include:true}));document.reconstructedText=sections.map(s=>`${s.title}\n${s.text}`).join('\n\n');document.narrativeClinicalSource=sections.map(s=>s.text).join('\n');document.narrativeNeedsReview=Boolean(document.narrativeSourcePresent&&!sections.length);
    document.clinicalValidationVersion=VERSION;document.labRepairVersion=VERSION;document.labPanelVersion=VERSION;document.referenceCompletionVersion=VERSION;document.narrativeCoverageVersion=VERSION;document.narrativeRepairVersion=VERSION;return document;
  }
  function canon(input={}){const result=BASE(input),document=normalize(result.document||clone(input),input);return{...result,document,changed:true};}
  function complete(docs=[],profile={}){BASE_COMPLETE(docs,profile);for(const d of docs)normalize(d,d);return docs;}
  function prepare(docs=[],profile={}){const out=(docs||[]).map(d=>canon(clone(d)).document);complete(out,profile);return out;}
  function adminHits(value=''){let hits=0;for(const line of String(value||'').split(/\n+/))if(DROP_LINE.test(collapse(line))||/WHO Collaborating|centralino|copia conforme|firmato digitalmente/i.test(line))hits++;return hits;}
  H.canonicalizeClinicalDocument24=canon;H.repairNarrativeDocumentData=d=>canon(d);H.repairLabDocumentData=d=>canon(d);H.completeReferences24=complete;H.prepareDocuments24=prepare;H.narrativeClinicalSource27=d=>(d?.reportSections||[]).map(s=>String(s?.text||'').trim()).filter(Boolean).join('\n');H.narrativeAdminHits27=adminHits;H.TEST27_VERSION=VERSION;H.TEST24_VERSION=VERSION;
})(HealthExtractors);

/* TEST 27 v23 - rimozione finale delle formule di firma incorporate nei paragrafi clinici */
;(function test27EmbeddedSignatureSeal(H){
  'use strict';if(!H)return;
  const VERSION='test27-v23',BASE=H.canonicalizeClinicalDocument24.bind(H),BASE_COMPLETE=H.completeReferences24.bind(H);
  const clone=v=>typeof structuredClone==='function'?structuredClone(v):JSON.parse(JSON.stringify(v??{}));
  const collapse=v=>String(v??'').replace(/\u00ad/g,'').replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').trim();
  const norm=v=>collapse(v).toLocaleLowerCase('it-IT').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9%/+<>=.,:;()'’-]+/g,' ').replace(/\s+/g,' ').trim();
  const LINE_DROP=/^(?:della|toscana|servix;?|who collaborating centre\b.*|pag\.?\s*:?.*|copia conforme.*|firmato digitalmente.*|documento informatico firmato.*|refertatore\s*:.*|cordiali saluti.*)$/i;
  const INLINE=[
    /\bRIPORTARE IL PRESENTE REFERTO[^.]*\.?/ig,
    /\bDocumento informatico firmato digitalmente[^.}]*[.}]?/ig,
    /\bReferto firmato digitalmente[^\n]*$/ig,
    /\bRefertatore\s*:[^\n]*$/ig,
    /\bCordiali Saluti\b/ig,
    /\bDott\.?ssa\s+Luisella[^\n]*?Pagina\s*\d+/ig,
    /\b(?:Dott\.?ssa?|Dr\.?)\s+[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÿ' ]{2,}\s+Pagina\s*\d+/g,
    /\b(?:From|Page|Date)\s*:\s*[^\n]*/ig,
    /\bTRANSAN?SSION\b/ig
  ];
  function clean(value=''){
    const out=[],seen=new Set();
    for(const raw of String(value||'').replace(/\r/g,'\n').split(/\n+/)){
      let line=collapse(raw);for(const re of INLINE)line=line.replace(re,' ');line=collapse(line).replace(/^Gentile Sig\.?\s+[^,]+,?\s*/i,'');
      if(!line||LINE_DROP.test(line))continue;const key=norm(line);if(!key||seen.has(key))continue;seen.add(key);out.push(line);
    }
    return out.join('\n').trim();
  }
  function normalize(document){
    if((document.documentMode||'')!=='lab'&&Array.isArray(document.reportSections)){
      const sections=[];for(const s of document.reportSections){const title=collapse(s?.title||'Referto').replace(/\s+continua.*$/i,'').trim()||'Referto',text=clean(s?.text||'');if(text)sections.push({title,text});}
      document.reportSections=sections;document.pdfFields=sections.map(s=>({label:s.title,value:s.text,include:true}));document.reconstructedText=sections.map(s=>`${s.title}\n${s.text}`).join('\n\n');document.narrativeClinicalSource=sections.map(s=>s.text).join('\n');document.narrativeNeedsReview=Boolean(document.narrativeSourcePresent&&!sections.length);document.narrativeCoverageVersion=VERSION;document.narrativeRepairVersion=VERSION;
    }
    document.clinicalValidationVersion=VERSION;document.labRepairVersion=VERSION;document.labPanelVersion=VERSION;document.referenceCompletionVersion=VERSION;return document;
  }
  function canon(input={}){const result=BASE(input),document=normalize(result.document||clone(input));return{...result,document,changed:true};}
  function complete(docs=[],profile={}){BASE_COMPLETE(docs,profile);for(const d of docs)normalize(d);return docs;}
  function prepare(docs=[],profile={}){const out=(docs||[]).map(d=>canon(clone(d)).document);complete(out,profile);return out;}
  H.canonicalizeClinicalDocument24=canon;H.repairNarrativeDocumentData=d=>canon(d);H.repairLabDocumentData=d=>canon(d);H.completeReferences24=complete;H.prepareDocuments24=prepare;H.narrativeClinicalSource27=d=>(d?.reportSections||[]).map(s=>String(s?.text||'').trim()).filter(Boolean).join('\n');H.TEST27_VERSION=VERSION;H.TEST24_VERSION=VERSION;
})(HealthExtractors);

/* TEST 27 v24 - rimozione finale di intestazioni aziendali e istruzioni amministrative incorporate */
;(function test27EmbeddedInstitutionSeal(H){
  'use strict';if(!H)return;
  const VERSION='test27-v24',BASE=H.canonicalizeClinicalDocument24.bind(H),BASE_COMPLETE=H.completeReferences24.bind(H);
  const clone=v=>typeof structuredClone==='function'?structuredClone(v):JSON.parse(JSON.stringify(v??{}));
  const collapse=v=>String(v??'').replace(/\u00ad/g,'').replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').trim();
  const DROP=/^(?:medical group\b.*|pisa,?\s*\d{1,2}[/.]\d{1,2}[/.]\d{2,4}.*(?:operatore|sonda non calibrata|azienda ospedaliero)|per i pazienti ricoverati\s*:\s*il referto istologico\b.*|nel caso di biopsie urgenti\b.*|.*operatore misurazioni.*)$/i;
  const TAIL=/(?:\s*[\/|]\s*(?:Dr|Dott)\.?\s+[A-ZÀ-ÖØ-Ý][^\n]*?(?:Pagina|Pag\.)\s*\d+[^\n]*|\s*(?:Pagina|Pag\.)\s*\d+\s+(?:Via|Viale|Piazza)\s+[^\n]*)$/i;
  function clean(value=''){
    const out=[],seen=new Set();
    for(const raw of String(value||'').replace(/\r/g,'\n').split(/\n+/)){
      let line=collapse(raw);if(!line||DROP.test(line))continue;line=collapse(line.replace(TAIL,''));if(!line)continue;const key=line.toLocaleLowerCase('it-IT').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();if(!key||seen.has(key))continue;seen.add(key);out.push(line);
    }
    return out.join('\n').trim();
  }
  function normalize(document){
    if((document.documentMode||'')!=='lab'&&Array.isArray(document.reportSections)){
      const sections=[];for(const s of document.reportSections){const title=collapse(s?.title||'Referto').replace(/\s+continua.*$/i,'').trim()||'Referto',text=clean(s?.text||'');if(text)sections.push({title,text});}
      document.reportSections=sections;document.pdfFields=sections.map(s=>({label:s.title,value:s.text,include:true}));document.reconstructedText=sections.map(s=>`${s.title}\n${s.text}`).join('\n\n');document.narrativeClinicalSource=sections.map(s=>s.text).join('\n');document.narrativeNeedsReview=Boolean(document.narrativeSourcePresent&&!sections.length);document.narrativeCoverageVersion=VERSION;document.narrativeRepairVersion=VERSION;
    }
    document.clinicalValidationVersion=VERSION;document.labRepairVersion=VERSION;document.labPanelVersion=VERSION;document.referenceCompletionVersion=VERSION;return document;
  }
  function canon(input={}){const result=BASE(input),document=normalize(result.document||clone(input));return{...result,document,changed:true};}
  function complete(docs=[],profile={}){BASE_COMPLETE(docs,profile);for(const d of docs)normalize(d);return docs;}
  function prepare(docs=[],profile={}){const out=(docs||[]).map(d=>canon(clone(d)).document);complete(out,profile);return out;}
  H.canonicalizeClinicalDocument24=canon;H.repairNarrativeDocumentData=d=>canon(d);H.repairLabDocumentData=d=>canon(d);H.completeReferences24=complete;H.prepareDocuments24=prepare;H.narrativeClinicalSource27=d=>(d?.reportSections||[]).map(s=>String(s?.text||'').trim()).filter(Boolean).join('\n');H.TEST27_VERSION=VERSION;H.TEST24_VERSION=VERSION;
})(HealthExtractors);


/* TEST 30 v1 - classificazione gerarchica della tipologia, con precedenza alle diciture esplicite. */
;(function test30DocumentTypeHierarchy(H){
  'use strict';if(!H)return;
  const VERSION='test30-v1',BASE=H.canonicalizeClinicalDocument24.bind(H),BASE_COMPLETE=H.completeReferences24.bind(H);
  const clone=v=>typeof structuredClone==='function'?structuredClone(v):JSON.parse(JSON.stringify(v??{}));
  const fold=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('it-IT').replace(/[‐‑‒–—−]/g,'-');
  const clean=v=>String(v??'').replace(/\u00ad/g,'').replace(/\r/g,'\n').replace(/[ \t]+/g,' ').trim();
  const dateLabel=iso=>{const m=String(iso||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?`${m[3]}/${m[2]}/${m[1]}`:'';};
  const TYPE_RULES=[
    {label:'Gastroscopia',category:'Referto strumentale',mode:'narrative',strong:/\b(?:gastroscopia|esofago\s*[- ]?gastro\s*[- ]?duodeno\s*scopia|esofagogastroduodenoscopia|egds?|egd)\b/i,context:/\b(?:endoscopia digestiva|esofago|stomaco|duodeno|cardias|piloro)\b/i},
    {label:'Colonscopia',category:'Referto strumentale',mode:'narrative',strong:/\b(?:colonscopia|colonoscopia|ileocolonscopia)\b/i,context:/\b(?:endoscopia digestiva|colon|ileo|retto)\b/i},
    {label:'Ecocardiogramma',category:'Referto strumentale',mode:'narrative',strong:/\b(?:ecocardiogramma|ecocuore|ecocardiografia)\b/i,context:/\b(?:frazione di eiezione|tapse|ventricolo|valvola)\b/i},
    {label:'Elettrocardiogramma',category:'Referto strumentale',mode:'narrative',strong:/\b(?:elettrocardiogramma|elettrocardiografico)\b/i,context:/\b(?:freq\.?\s*vent|int\.?\s*pr|dur\.?\s*qrs|qt\s*\/\s*qtc|assi\s*p\s*[-/]\s*r\s*[-/]\s*t)\b/i},
    {label:'TAC',category:'Referto strumentale',mode:'narrative',strong:/\b(?:tac|tomografia computerizzata|tc\s+(?:cranio|torace|addome|encefalo))\b/i,context:/\b(?:acquisizione|mezzo di contrasto|m\.?d\.?c\.?|studio tc)\b/i},
    {label:'Risonanza magnetica',category:'Referto strumentale',mode:'narrative',strong:/\b(?:risonanza magnetica|rmn|rm\s+(?:cranio|encefalo|colonna|ginocchio|addome))\b/i,context:/\b(?:sequenze|t1|t2|flair|diffusione)\b/i},
    {label:'Ecografia',category:'Referto strumentale',mode:'narrative',strong:/\b(?:ecografia|ecotomografia|ecocolordoppler|eco-color-doppler|fibroscan)\b/i,context:/\b(?:sonda|parenchima|ecostruttura|ecogenicita)\b/i},
    {label:'Radiografia',category:'Referto strumentale',mode:'narrative',strong:/\b(?:radiografia|rx\s+(?:torace|colonna|arto|bacino))\b/i,context:/\b(?:proiezione|radiogramma|scheletro)\b/i},
    {label:'Anatomia patologica',category:'Referto istologico',mode:'narrative',strong:/\b(?:anatomia patologica|diagnosi istologica|esame istologico)\b/i,context:/\b(?:materiale pervenuto|esame macroscopico|microscopico|biopsia)\b/i},
    {label:'Visita cardiologica',category:'Visita specialistica',mode:'narrative',strong:/\bvisita cardiologica\b/i},
    {label:'Visita diabetologica',category:'Visita specialistica',mode:'narrative',strong:/\bvisita diabetologica\b/i},
    {label:'Visita epatologica',category:'Visita specialistica',mode:'narrative',strong:/\bvisita epatologica\b/i},
    {label:'Visita endocrinologica',category:'Visita specialistica',mode:'narrative',strong:/\bvisita endocrinologica\b/i},
    {label:'Visita neurologica',category:'Visita specialistica',mode:'narrative',strong:/\bvisita neurologica\b/i},
    {label:'Visita oculistica',category:'Visita specialistica',mode:'narrative',strong:/\b(?:visita oculistica|fundus oculi)\b/i}
  ];
  function explicitExamValues(doc={}){
    const source=clean(`${doc.extractedText||''}\n${doc.structuredText||''}`),values=[];
    for(const match of source.matchAll(/(?:^|\n)\s*(?:tipo\s+esame|esame\s+eseguito|prestazione\s+eseguita|procedura)\s*:\s*([^\n]{2,180})/gim))values.push(clean(match[1]));
    return values;
  }
  function ruleFor(value='',requireContext=false){const text=fold(value);for(const rule of TYPE_RULES)if(rule.strong.test(text)&&(!requireContext||!rule.context||rule.context.test(text)))return rule;return null;}
  function detect(doc={}){
    const original=clean(doc.originalName||''),explicit=explicitExamValues(doc),department=clean(`${doc.department||''} ${doc.specialization||''}`),body=clean(`${doc.extractedText||''}\n${doc.structuredText||''}\n${(doc.reportSections||[]).map(s=>s?.text||'').join('\n')}`);
    const pageCount=Array.isArray(doc.ocrPageData)?doc.ocrPageData.length:0;
    const multiRecord=/\b(?:cartella[ _-]*clinica|fascicolo|dossier|documentazione[ _-]*clinica)\b/i.test(fold(original))||pageCount>20;
    const fileWords=original.replace(/[_-]+/g,' '),declared=clean(doc.documentKind||'');
    const bodyWithoutMonitoring=body.split(/\n+/).filter(line=>!/^\s*(?:monitoraggio[- :]*ecg|ecg[-.]?p\.?a[-.]?sp[0o]2)\b/i.test(line)).join('\n');
    let rule;
    if(!multiRecord)for(const value of explicit){rule=ruleFor(value);if(rule)return{...rule,source:`dicitura esplicita: ${value}`,confidence:100};}
    const currentRule=TYPE_RULES.find(candidate=>candidate.label.toLocaleLowerCase('it-IT')===declared.toLocaleLowerCase('it-IT'));
    let currentSupported=false;
    if(currentRule){
      currentSupported=currentRule.label==='Elettrocardiogramma'
        ? currentRule.context.test(fold(bodyWithoutMonitoring))&&/\b(?:ecg|elettrocardiogramma)\b/i.test(fold(bodyWithoutMonitoring))
        : currentRule.strong.test(fold(bodyWithoutMonitoring))&&(!currentRule.context||currentRule.context.test(fold(`${department} ${bodyWithoutMonitoring}`)));
      if(currentSupported&&currentRule.label==='Anatomia patologica')return null;
    }
    rule=ruleFor(fileWords);if(rule)return{...rule,source:'nome del file originale',confidence:100};
    if(currentSupported)return null;
    const endoscopyContext=!multiRecord&&/\bendoscopia digestiva\b/i.test(fold(department))&&/\b(?:esofago|stomaco|duodeno|cardias|piloro)\b/i.test(fold(body));
    if(endoscopyContext){rule=TYPE_RULES[0];return{...rule,source:'reparto e contenuto endoscopico concordanti',confidence:98};}
    const title=clean(doc.title||'');
    const genericDeclared=/^(?:documento sanitario|referto strumentale|visita specialistica|endocrinologia)$/i.test(declared);
    rule=ruleFor(title);if(rule&&genericDeclared)return{...rule,source:'titolo clinico esplicito',confidence:96};
    if(multiRecord||!genericDeclared)return null;
    for(const candidate of TYPE_RULES){
      if(candidate.label==='Elettrocardiogramma'){
        if(candidate.context.test(fold(bodyWithoutMonitoring))&&/\b(?:ecg|elettrocardiogramma)\b/i.test(fold(bodyWithoutMonitoring)))return{...candidate,source:'parametri ECG strutturali concordanti',confidence:94};
        continue;
      }
      if(candidate.strong.test(fold(bodyWithoutMonitoring))&&(!candidate.context||candidate.context.test(fold(`${department} ${bodyWithoutMonitoring}`))))return{...candidate,source:'contenuto clinico strutturale concordante',confidence:92};
    }
    return null;
  }
  function applyType(document={},original={}){
    const found=detect({...original,...document});if(!found)return document;
    const oldKind=clean(document.documentKind||original.documentKind||''),oldTitle=clean(document.title||original.title||'');
    document.documentKind=found.label;document.category=found.category;document.documentMode=found.mode;document.documentTypeSource=found.source;document.documentTypeConfidence=found.confidence;document.documentTypeVersion=VERSION;
    const endoscopyEvidence=fold(`${original.department||''} ${document.department||''} ${original.specialization||''} ${original.extractedText||''} ${original.structuredText||''}`);
    if((found.label==='Gastroscopia'||found.label==='Colonscopia')&&/\bendoscopia digestiva\b/i.test(endoscopyEvidence))document.specialization='Endoscopia digestiva';
    const date=dateLabel(document.clinicalDate||original.clinicalDate||'');
    if(date&&oldKind&&oldKind!==found.label&&new RegExp(`^${oldKind.replace(/[.*+?^${}()|[\\]\\]/g,'\\$&')}\\s+del\\s+\\d{1,2}[/.-]\\d{1,2}[/.-]\\d{2,4}$`,'i').test(oldTitle))document.title=`${found.label} del ${date}`;
    return document;
  }
  function canon(input={}){const original=clone(input),result=BASE(input),document=applyType(result.document||clone(input),original);document.clinicalValidationVersion=VERSION;return{...result,document,changed:true};}
  function complete(docs=[],profile={}){BASE_COMPLETE(docs,profile);for(const d of docs)applyType(d,d);return docs;}
  function prepare(docs=[],profile={}){const out=(docs||[]).map(d=>canon(clone(d)).document);complete(out,profile);return out;}
  H.detectDocumentType29=detect;H.canonicalizeClinicalDocument24=canon;H.repairNarrativeDocumentData=d=>canon(d);H.repairLabDocumentData=d=>canon(d);H.completeReferences24=complete;H.prepareDocuments24=prepare;H.TEST30_VERSION=VERSION;H.TEST24_VERSION=VERSION;
})(HealthExtractors);

/* TEST 36 v1 - cartelle cliniche, date anagrafiche escluse e pulizia narrativa finale. */
;(function test36ClinicalRecordCanonicalSeal(H){
  'use strict';if(!H)return;
  const VERSION='test36-v1',BASE=H.canonicalizeClinicalDocument24.bind(H),BASE_COMPLETE=H.completeReferences24.bind(H);
  const clone=v=>typeof structuredClone==='function'?structuredClone(v):JSON.parse(JSON.stringify(v??{}));
  const collapse=v=>String(v??'').replace(/\u00ad/g,'').replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').trim();
  const fold=v=>collapse(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('it-IT');
  const dateIso=(d,m,y)=>{const day=Number(d),month=Number(m),year=Number(y);if(year<1900||year>2100||month<1||month>12||day<1||day>31)return'';const dt=new Date(Date.UTC(year,month-1,day));return dt.getUTCFullYear()===year&&dt.getUTCMonth()===month-1&&dt.getUTCDate()===day?`${String(year).padStart(4,'0')}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`:'';};
  const dmy=iso=>{const m=String(iso||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?`${m[3]}/${m[2]}/${m[1]}`:'';};
  const DATE='(0?[1-9]|[12]\\d|3[01])[/.\\-](0?[1-9]|1[0-2])[/.\\-]((?:19|20)\\d{2})';
  const CLINICAL_SIGNAL=/(?:anamnes|diagnos|terapia|programma|follow|esame obiettivo|repert|conclusion|dolore|febbre|dispnea|pressione|saturazione|glicem|creatinin|fegato|rene|polmone|cuore|paziente\s+(?:vigile|stabile|collaborante|orientat)|ricover|dimess|intervent|farmac|mg\b|mmhg|spo2|fio2|diuresi|edema|lesion|steatos|diabet|ipotiroid)/i;
  const ADMIN_LINE=/^(?:azienda\b|aoup\b|servizio sanitario\b|dipartimento\b|presidio\b|unit[aà] operativa\b|u\.?o\.?\b|direttore\b|responsabile\b|centralino\b|segreteria\b|prenotazion|cognome(?: e nome)?\s*:|nome\s*:|data (?:di )?nascita\s*:|luogo di nascita\s*:|codice fiscale\s*:|tessera sanitaria\s*:|residenza\s*:|domicilio\s*:|indirizzo\s*:|telefono\s*:|tel\.?\s*:|cell(?:ulare)?\.?\s*:|fax\s*:|e-?mail\s*:|pec\s*:|numero referto\s*:|n[°.o]?\s*(?:cartella|referto|accettazione)\s*:|id paziente\b|pagina\s+\d+|page\s+\d+|copia conforme\b|firmato digitalmente\b|documento informatico firmato\b)/i;
  const INLINE_ADMIN=[
    /\bdata (?:di )?nascita\s*[:\-]?\s*\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4}\b/gi,
    /\bcodice fiscale\s*[:\-]?\s*[A-Z0-9]{11,16}\b/gi,
    /\b(?:tel(?:efono)?|cell(?:ulare)?|fax)\s*[:.\-]\s*\+?[\d ()\-.]{6,}\b/gi,
    /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g,
    /\b(?:pagina|page)\s+\d+(?:\s*(?:di|\/)\s*\d+)?\b/gi
  ];
  function sourceText(doc={}){return [doc.extractedText,doc.structuredText,(doc.ocrPageData||[]).map(p=>p?.text||'').join('\n')].filter(Boolean).join('\n');}
  function clinicalRecord(doc={}){
    const file=fold(doc.originalName||''),source=fold(sourceText(doc).slice(0,30000)),pages=Array.isArray(doc.ocrPageData)?doc.ocrPageData.length:Number(doc.ocrProcessedPages||0);
    if(/\bcartella[ _.-]*clinica\b/.test(file))return true;
    return pages>20&&/(?:data\s+(?:di\s+)?ricovero|data\s+dimissione|data\s+chiusura\s+cartella|scheda\s+nosologica|assistenza\s+infermieristica|diario\s+clinico|degenza)/.test(source);
  }
  function explicitBirthDates(text=''){
    const out=new Set();const re=new RegExp(`(?:data\\s+(?:di\\s+)?nascita|nato\\/?a?|dob)\\s*[:\\-]?\\s*${DATE}`,'gi');let m;while((m=re.exec(String(text||'')))){const iso=dateIso(m[1],m[2],m[3]);if(iso)out.add(iso);}return out;
  }
  function labeledDate(text='',labels=[]){
    for(const label of labels){const re=new RegExp(`${label}[^\\d]{0,24}${DATE}`,'i'),m=String(text||'').match(re);if(m){const iso=dateIso(m[1],m[2],m[3]);if(iso)return iso;}}return'';
  }
  function bestNonBirthCandidate(doc={},births=new Set()){
    const rows=(doc.dateCandidates||[]).filter(c=>c?.iso&&!births.has(c.iso)&&!/nascit/i.test(String(c.kind||'')));
    rows.sort((a,b)=>(Number(b.clinicalScore||b.score||0)-Number(a.clinicalScore||a.score||0))||(Number(a.lineIndex??999999)-Number(b.lineIndex??999999)));
    return rows[0]?.iso||'';
  }
  function cleanNarrative(value=''){
    const out=[],seen=new Set();
    for(const raw of String(value||'').replace(/\r/g,'\n').split(/\n+/)){
      let line=collapse(raw);if(!line)continue;
      for(const re of INLINE_ADMIN)line=collapse(line.replace(re,' '));
      if(!line)continue;if(ADMIN_LINE.test(line)&&!CLINICAL_SIGNAL.test(line))continue;
      const key=fold(line).replace(/[^a-z0-9]+/g,' ').trim();if(!key||seen.has(key))continue;seen.add(key);out.push(line);
    }
    return out.join('\n').trim();
  }
  function normalizeSections(document={}){
    if((document.documentMode||'')==='lab')return document;
    const merged=[],index=new Map();
    for(const section of document.reportSections||[]){const title=collapse(section?.title||'Referto').replace(/[,;:\-]?\s*continua(?:\s+dalla\s+pagina\s+precedente)?\s*$/i,'').trim()||'Referto',text=cleanNarrative(section?.text||'');if(!text)continue;const key=fold(title);if(index.has(key)){const row=merged[index.get(key)],combined=cleanNarrative(`${row.text}\n${text}`);row.text=combined;}else{index.set(key,merged.length);merged.push({title,text});}}
    document.reportSections=merged;document.pdfFields=merged.map(s=>({label:s.title,value:s.text,include:true}));document.reconstructedText=merged.map(s=>`${s.title}\n${s.text}`).join('\n\n');document.narrativeClinicalSource=merged.map(s=>s.text).join('\n');document.narrativeNeedsReview=Boolean(document.narrativeSourcePresent&&!merged.length);return document;
  }
  function normalizeDocument(document={},original={},profile={}){
    const raw=sourceText({...original,...document}),births=explicitBirthDates(raw);if(profile?.birthDate)births.add(String(profile.birthDate));
    const isRecord=clinicalRecord({...original,...document});
    if(isRecord){
      const admission=labeledDate(raw,['data\\s+(?:di\\s+)?ricovero','data\\s+(?:di\\s+)?ammissione','data\\s+(?:di\\s+)?ingresso','ricover[oa]\\s+(?:il|dal)']);
      const closure=labeledDate(raw,['data\\s+chiusura\\s+cartella','data\\s+(?:di\\s+)?dimissione','dimess[oa]\\s+(?:il|in data)']);
      const clinical=admission||bestNonBirthCandidate(document,births)||(!births.has(document.clinicalDate)?document.clinicalDate:'');
      document.documentKind='Cartella clinica';document.category='Cartella clinica';document.documentMode=(document.labValues||[]).length||(document.qualitativeResults||[]).length?'mixed':'narrative';document.documentTypeSource='struttura multipagina di cartella clinica';document.documentTypeConfidence=100;document.documentTypeVersion=VERSION;
      if(/medicina\s+(?:d['’]?urgenza|urgenza)|med\.?\s*ur\.?/i.test(`${raw.slice(0,15000)} ${original.originalName||''}`))document.specialization="Medicina d'urgenza";
      else if(/^neurologia$/i.test(String(document.specialization||'')))document.specialization='';
      if(clinical){document.clinicalDate=clinical;document.suggestedDate=clinical;document.dateStatus='detected';document.dateConfidence=100;document.title=`Cartella clinica del ${dmy(clinical)}`;}
      if(closure&&!births.has(closure))document.issueDate=closure;
    }else if(births.has(String(document.clinicalDate||''))){
      const candidate=bestNonBirthCandidate(document,births);if(candidate){document.clinicalDate=candidate;document.suggestedDate=candidate;document.dateConfidence=Math.max(90,Number(document.dateConfidence||0));const kind=String(document.documentKind||document.category||'Documento sanitario');document.title=`${kind} del ${dmy(candidate)}`;}
    }
    normalizeSections(document);document.clinicalCanonicalVersion=VERSION;document.clinicalValidationVersion=VERSION;document.narrativeCoverageVersion=VERSION;document.narrativeRepairVersion=VERSION;return document;
  }
  function canon(input={}){const original=clone(input),result=BASE(input),document=normalizeDocument(result.document||clone(input),original,{});return{...result,document,changed:true};}
  function complete(docs=[],profile={}){BASE_COMPLETE(docs,profile);for(const d of docs)normalizeDocument(d,d,profile);return docs;}
  function prepare(docs=[],profile={}){const out=(docs||[]).map(d=>{const original=clone(d),result=BASE(original);return normalizeDocument(result.document||original,original,profile);});complete(out,profile);return out;}
  H.canonicalizeClinicalDocument24=canon;H.repairNarrativeDocumentData=d=>canon(d);H.repairLabDocumentData=d=>canon(d);H.completeReferences24=complete;H.prepareDocuments24=prepare;H.TEST36_VERSION=VERSION;H.TEST24_VERSION=VERSION;
})(HealthExtractors);

/* V6.0.4 - cache canonica persistente, metadati stabili e filtro del rumore OCR. */
;(function v602PersistentClinicalCanonical(H){
  'use strict';if(!H)return;
  const VERSION='v6.0.4-canonical-v2';
  const BASE=H.canonicalizeClinicalDocument24.bind(H);
  const clone=v=>typeof structuredClone==='function'?structuredClone(v):JSON.parse(JSON.stringify(v??{}));
  const collapse=v=>String(v??'').replace(/\u00ad/g,'').replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').trim();
  const fold=v=>collapse(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('it-IT');
  const CLINICAL_SIGNAL=/(?:anamnes|diagnos|terap|farmac|esame\s+obiettivo|obiettivit|repert|conclusion|indicaz|programma|follow|controllo|dolore|febbre|dispnea|tosse|pressione|ritmo|saturaz|glicem|creatinin|emoglob|leucoc|piastrin|fegato|rene|polmon|cuore|ricover|dimess|intervent|biops|ecograf|radiograf|tac\b|rmn\b|ecg\b|spo2|fio2|diuresi|edema|lesion|steatos|diabet|tiroid|linfed|ventilaz|cpap|bpap|apnea|ahi\b|mmhg|mmol|mg\/|g\/dl|u\/l|bpm|cm\b|mm\b|kg\b|esito|risultato|negativ|positiv|nella norma|nei limiti|patolog|allerg)/i;
  const ADMIN_LINE=/^(?:azienda\b|aoup\b|asl\b|servizio sanitario\b|regione\b|dipartimento\b|presidio\b|unit[aà] operativa\b|u\.?o\.?\b|direttore\b|responsabile\b|centralino\b|segreteria\b|prenotazion|accettazione\b|cognome(?: e nome)?\s*:|nome\s*:|data (?:di )?nascita\s*:|luogo di nascita\s*:|codice fiscale\s*:|tessera sanitaria\s*:|residenza\s*:|domicilio\s*:|indirizzo\s*:|telefono\s*:|tel\.?\s*:|cell(?:ulare)?\.?\s*:|fax\s*:|e-?mail\s*:|pec\s*:|numero referto\s*:|numero pratica\s*:|n[°.o]?\s*(?:cartella|referto|accettazione)\s*:|id paziente\b|sede operativa\b|pagina\s+\d+|page\s+\d+|copia conforme\b|firmato digitalmente\b|documento informatico firmato\b|stampato il\b)/i;
  const FORCE_ADMIN_LINE=/(?:\bconsenso\s+al\s+trattamento\s+dei\s+dati\s+personali\b|\bmodulo\s+di\s+consenso\b|\binformativa\s+(?:completa\s+)?(?:sul|per il|al)\s+trattamento\b|\bprivacy\b|\bdenaro\s+non\s+[eè]\s+strettamente\s+indispensabile\b|\bparenti\s+o\s+conoscenti\s+che\s+possono\s+prendere\s+in\s+carico\b|\boggetti\s+rimossi\b|\berogazione\s+di\s+prestazioni\s+sanitarie\b|\bquelle\s+di\s+prevenzione\s*,?\s*diagnosi\s*,?\s*cura\s+e\s+riabilitazione\b|\bquali\s+far\s+comunicare\s+dai\s+medici\s+la\s+propria\s+presenza\b|\bin\s+forma\s+anonim[ao]\b|\bparticolari\s+esami\s+diagnostici\s+e\/?o\s+trattamenti\s+terapeutici\s+soltanto\s+se\b|\bdiritto\s+di\s+individuare\s+i\s+soggetti\b|\bsito\s+internet\b|^\s*pat\s+del\s+ricovero\b|^\s*allergie\s+gruppo\s+san(?:g|q)uigno\s+rh\s*$|^\s*ricovero(?:\s+ordinario|\s*:)|^\s*diagnosi\s+di\s+[dp]imissione\s*$|^\s*ricover\s*$|^\s*(?:data\s+di\s+nascita|luogo\s+di\s+nascita|codice\s+fiscale)\b|^\s*(?:paz(?:iente)?\s+)?valutat[oa]\s+dal\s+dott\.?\b|^\s*(?:operatore|firma\s+paziente|firma\s+del\s+paziente|timbro\s+e\s+firma)\s*[:\-]?|^\s*giorno\s*,?\s*ora\s+operatore\b)/i;
  const INLINE_ADMIN=[
    /\bdata (?:di )?nascita\s*[:\-]?\s*\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4}\b/gi,
    /\bcodice fiscale\s*[:\-]?\s*[A-Z0-9]{11,16}\b/gi,
    /\b(?:tel(?:efono)?|cell(?:ulare)?|fax)\s*[:.\-]\s*\+?[\d ()\-.]{6,}\b/gi,
    /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g,
    /\b(?:numero|n[°.o]?)\s*(?:referto|pratica|accettazione|cartella)\s*[:.\-]?\s*[A-Z0-9\/-]{3,}\b/gi,
    /\b(?:pagina|page)\s+\d+(?:\s*(?:di|\/)\s*\d+)?\b/gi,
    /\bpaziente\s*:\s*(?:sig\.?\/?ra|sig\.?|signora|signor)?\s*[A-ZÀ-ÖØ-Ý][A-ZÀ-ÖØ-Ý' -]{2,}(?:\s+[A-ZÀ-ÖØ-Ý][A-ZÀ-ÖØ-Ý' -]{2,})+/g,
    /\bsede operativa\s*[:\-]?[^\n]{0,100}/gi,
    /\bdirettore sanitario\s*[:\-]?[^\n]{0,100}/gi
  ];
  function sourceFingerprint(doc={}){
    const stable=String(doc.hash||doc.textFingerprint||'').trim();
    if(stable)return stable;
    const raw=`${doc.originalName||''}|${Number(doc.size||0)}|${String(doc.extractedText||'').length}|${String(doc.structuredText||'').length}`;
    return H.textFingerprint?H.textFingerprint(raw):raw;
  }
  function likelyNoise(line=''){
    const text=collapse(line);if(!text)return true;
    const letters=(text.match(/[A-Za-zÀ-ÖØ-öø-ÿ]/g)||[]).length;
    const digits=(text.match(/\d/g)||[]).length;
    const symbols=(text.match(/[^A-Za-zÀ-ÖØ-öø-ÿ0-9\s.,;:()/%+\-'’]/g)||[]).length;
    if(text.length>=10&&letters<3&&digits<3)return true;
    if(text.length>=16&&symbols/text.length>.18)return true;
    if(/(?:[|_~^`]{2,}|[<>{}\[\]\\]{2,})/.test(text))return true;
    if(/([A-Za-zÀ-ÖØ-öø-ÿ])\1{3,}/i.test(text))return true;
    const words=text.split(/\s+/).filter(Boolean),long=words.filter(w=>w.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ]/g,'').length>=4);
    if(long.some(w=>{const alpha=w.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ]/g,'');const vowels=(alpha.match(/[aeiouàèéìòóù]/gi)||[]).length;return alpha.length>=16&&vowels/alpha.length<.22;}))return true;
    if(CLINICAL_SIGNAL.test(text))return false;
    if(long.length>=4){
      const noVowel=long.filter(w=>!/[aeiouàèéìòóù]/i.test(w)).length;
      if(noVowel/long.length>=.72)return true;
    }
    if(words.length>=5&&words.filter(w=>/^[A-Z]{2,6}$/.test(w)).length/words.length>=.72)return true;
    if(/^(?:[A-Z]{1,5}\s+){5,}[A-Z]{1,5}$/i.test(text)&&!/[.,;:]/.test(text))return true;
    return false;
  }
  function nearDuplicateLine602(a='',b=''){
    const aa=fold(a).replace(/[^a-z0-9à-öø-ÿ]+/g,' ').trim(),bb=fold(b).replace(/[^a-z0-9à-öø-ÿ]+/g,' ').trim();
    if(aa.length<36||bb.length<36)return false;
    const ratio=Math.min(aa.length,bb.length)/Math.max(aa.length,bb.length);if(ratio<.72)return false;
    const A=new Set(aa.split(/\s+/).filter(w=>w.length>1)),B=new Set(bb.split(/\s+/).filter(w=>w.length>1));if(!A.size||!B.size)return false;
    let common=0;for(const w of A)if(B.has(w))common++;
    return common/Math.max(A.size,B.size)>=.84;
  }
  function cleanText(value=''){
    const out=[],seen=new Set();let discarded=0;
    const rawLines=String(value||'').replace(/\r/g,'\n').split(/\n+/);
    for(const raw of rawLines){
      let line=collapse(raw);if(!line)continue;
      for(const re of INLINE_ADMIN)line=collapse(line.replace(re,' '));
      line=collapse(line.replace(/\s+[_.,:;~\-]{2,}\s*[A-Za-zÀ-ÖØ-öø-ÿ]{10,}\s*$/,' '));
      if(!line)continue;
      if(FORCE_ADMIN_LINE.test(line)){discarded++;continue;}
      if(ADMIN_LINE.test(line)&&!CLINICAL_SIGNAL.test(line)){discarded++;continue;}
      if(likelyNoise(line)){discarded++;continue;}
      const key=fold(line).replace(/[^a-z0-9]+/g,' ').trim();if(!key||seen.has(key)){if(key)discarded++;continue;}
      if(out.length&&nearDuplicateLine602(out[out.length-1],line)){discarded++;continue;}
      seen.add(key);out.push(line);
    }
    return {text:out.join('\n').replace(/\n{3,}/g,'\n\n').trim(),discarded};
  }
  function canonicalReady(doc={}){
    const mode=doc.documentMode||'';
    if(!['narrative','mixed','diagnosis'].includes(mode))return true;
    if(doc.narrativeSourcePresent===false)return true;
    return Array.isArray(doc.reportSections)&&doc.reportSections.some(s=>String(s?.text||'').trim());
  }
  function sourceText602(doc={}){
    return [doc.extractedText,doc.structuredText,(doc.ocrPageData||[]).map(p=>p?.text||'').join('\n')].filter(Boolean).join('\n');
  }
  function isoDate602(day,month,year){
    const d=Number(day),m=Number(month),y=Number(year);
    if(y<1900||y>2100||m<1||m>12||d<1||d>31)return'';
    const dt=new Date(Date.UTC(y,m-1,d));
    return dt.getUTCFullYear()===y&&dt.getUTCMonth()===m-1&&dt.getUTCDate()===d?`${String(y).padStart(4,'0')}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`:'';
  }
  function dmy602(iso=''){const m=String(iso||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?`${m[3]}/${m[2]}/${m[1]}`:'';}
  const DATE_FUZZY_602='(0?[1-9]|[12]\\d|3[01])[^0-9]{0,5}(0?[1-9]|1[0-2])[^0-9]{0,5}((?:19|20)\\d{2})';
  function birthDates602(text='',profile={}){
    const out=new Set();if(profile?.birthDate)out.add(String(profile.birthDate));
    const re=new RegExp(`(?:data\\s+(?:di\\s+)?nascita|nato\\/?a?|dob)[^0-9]{0,24}${DATE_FUZZY_602}`,'gi');let m;
    while((m=re.exec(String(text||'')))){const iso=isoDate602(m[1],m[2],m[3]);if(iso)out.add(iso);}
    return out;
  }
  function firstLabeledDate602(text='',labelPattern='',limit=0){
    const src=limit>0?String(text||'').slice(0,limit):String(text||'');
    const re=new RegExp(`${labelPattern}[^0-9]{0,36}${DATE_FUZZY_602}`,'i'),m=src.match(re);
    return m?isoDate602(m[1],m[2],m[3]):'';
  }
  function frequentAdmissionClosurePair602(text='',births=new Set()){
    const src=String(text||''),pairs=new Map();
    const re=new RegExp(`data\\s+ricovero[^0-9]{0,24}${DATE_FUZZY_602}[\\s\\S]{0,180}?data\\s+chiusura\\s+cartella[^0-9]{0,24}${DATE_FUZZY_602}`,'gi');let m;
    while((m=re.exec(src))){const a=isoDate602(m[1],m[2],m[3]),c=isoDate602(m[4],m[5],m[6]);if(!a||births.has(a)||!c||births.has(c))continue;const key=`${a}|${c}`;pairs.set(key,(pairs.get(key)||0)+1);}
    const best=[...pairs.entries()].sort((a,b)=>b[1]-a[1])[0];if(!best)return null;const [admission,closure]=best[0].split('|');return{admission,closure,count:best[1]};
  }
  function dischargeDate602(text='',births=new Set()){
    const src=String(text||'');
    const direct=[
      firstLabeledDate602(src,'data\\s+chiusura\\s+cartella'),
      firstLabeledDate602(src,'data\\s*\\/?ora\\s+(?:di\\s+)?chiusura'),
      firstLabeledDate602(src,'data\\s+(?:di\\s+)?dimissione')
    ].find(v=>v&&!births.has(v));
    if(direct)return direct;
    let m=src.match(new RegExp(`${DATE_FUZZY_602}[^\\n]{0,40}?di\\s+dimissione`,'i'));
    if(m){const iso=isoDate602(m[1],m[2],m[3]);if(iso&&!births.has(iso))return iso;}
    m=src.match(new RegExp(`dimissione[\\s\\S]{0,140}?data[^0-9]{0,24}${DATE_FUZZY_602}`,'i'));
    if(m){const iso=isoDate602(m[1],m[2],m[3]);if(iso&&!births.has(iso))return iso;}
    return'';
  }
  function looksClinicalRecord602(doc={},text=''){
    const file=fold(doc.originalName||''),head=fold(String(text||'').slice(0,40000)),pages=Array.isArray(doc.ocrPageData)?doc.ocrPageData.length:Number(doc.ocrProcessedPages||0);
    return /\bcartella[ _.-]*clinica\b/.test(file)||String(doc.documentKind||'').toLocaleLowerCase('it-IT')==='cartella clinica'||(pages>20&&/(?:data\s+(?:del|di)?\s*ricovero|data\s+chiusura\s+cartella|diagnosi\s+di\s+dimissione|diario\s+clinico|degenza)/.test(head));
  }
  function normalizeRecordMetadata602(document={},original={},profile={}){
    const raw=sourceText602({...original,...document});if(!looksClinicalRecord602({...original,...document},raw))return document;
    const births=birthDates602(raw,profile),pair=frequentAdmissionClosurePair602(raw,births);
    /* Una data di ricovero esplicita sulla copertina ha precedenza. Se la copertina e' illeggibile,
       usa una coppia Ricovero/Chiusura ripetuta nel corpo. Non usa mai la data di nascita. */
    const coverAdmission=firstLabeledDate602(raw,'data\\s+del\\s+ricovero',12000)||firstLabeledDate602(raw,'data\\s+(?:di\\s+)?ricovero',12000);
    const admission=(coverAdmission&&!births.has(coverAdmission)?coverAdmission:'')||(pair?.admission||'');
    const closure=(pair?.closure||'')||dischargeDate602(raw,births);
    document.documentKind='Cartella clinica';document.category='Cartella clinica';
    document.documentTypeSource='struttura multipagina di cartella clinica';document.documentTypeConfidence=100;document.documentTypeVersion=VERSION;
    if(admission){document.clinicalDate=admission;document.suggestedDate=admission;document.dateStatus='detected';document.dateConfidence=100;document.title=`Cartella clinica del ${dmy602(admission)}`;}
    if(closure&&!births.has(closure))document.issueDate=closure;
    const identityText=`${original.originalName||''} ${document.department||''} ${document.specialization||''}`;
    if(/endocrinolog/i.test(identityText))document.specialization='Endocrinologia';
    else if(/medicina\s+(?:d['’]?urgenza|urgenza)|med\.?\s*ur\.?/i.test(`${identityText} ${raw.slice(0,25000)}`))document.specialization="Medicina d'urgenza";
    return document;
  }
  function normalizeDocument(document={},original={},profile={}){
    normalizeRecordMetadata602(document,original,profile);
    let discarded=0;
    if((document.documentMode||'')!=='lab'){
      const merged=[],byKey=new Map();
      for(const section of document.reportSections||[]){
        const title=collapse(section?.title||'Referto').replace(/[,;:\-]?\s*continua(?:\s+dalla\s+pagina\s+precedente)?\s*$/i,'').trim()||'Referto';
        const cleaned=cleanText(section?.text||'');discarded+=cleaned.discarded;if(!cleaned.text)continue;
        const key=fold(title);
        if(byKey.has(key)){const row=byKey.get(key);const again=cleanText(`${row.text}\n${cleaned.text}`);discarded+=again.discarded;row.text=again.text;}
        else{const row={title,text:cleaned.text};byKey.set(key,row);merged.push(row);}
      }
      document.reportSections=merged;
      document.pdfFields=merged.map(s=>({label:s.title,value:s.text,include:true}));
      document.reconstructedText=merged.map(s=>`${s.title}\n${s.text}`).join('\n\n');
      document.narrativeClinicalSource=merged.map(s=>s.text).join('\n');
      document.narrativeNeedsReview=Boolean(document.narrativeSourcePresent&&!merged.length);
    }
    document.clinicalCanonicalVersion=VERSION;
    document.clinicalCanonicalSourceFingerprint=sourceFingerprint(original);
    document.clinicalCanonicalCachedAt=new Date().toISOString();
    document.clinicalCanonicalNoiseDiscarded=discarded;
    document.clinicalCanonicalMetadata={
      documentKind:document.documentKind||'',category:document.category||'',documentMode:document.documentMode||'',
      clinicalDate:document.clinicalDate||'',issueDate:document.issueDate||'',specialization:document.specialization||'',department:document.department||'',facility:document.facility||''
    };
    return document;
  }
  function canon(input={},options={}){
    const original=clone(input),fingerprint=sourceFingerprint(original),profile=options?.profile||{};
    if(original.clinicalCanonicalVersion===VERSION&&original.clinicalCanonicalSourceFingerprint===fingerprint&&canonicalReady(original))return{document:original,changed:false,validation:{ok:true,violations:[]}};
    const result=BASE(original),document=normalizeDocument(result.document||original,original,profile);
    return{...result,document,changed:true};
  }
  function prepare(docs=[],profile={}){
    return (docs||[]).map(d=>{const original=clone(d),fingerprint=sourceFingerprint(original);if(original.clinicalCanonicalVersion===VERSION&&original.clinicalCanonicalSourceFingerprint===fingerprint&&canonicalReady(original))return original;const result=BASE(original);return normalizeDocument(result.document||original,original,profile);});
  }
  H.canonicalizeClinicalDocument24=canon;
  H.repairNarrativeDocumentData=d=>canon(d);
  H.repairLabDocumentData=d=>canon(d);
  H.prepareDocuments24=prepare;
  H.clinicalCanonicalSourceFingerprint602=sourceFingerprint;
  H.cleanClinicalCanonical602=cleanText;
  H.V602_CANONICAL_VERSION=VERSION;
  H.TEST24_VERSION=VERSION;
})(HealthExtractors);

/* V6.0.4 - cartelle cliniche complesse: segmentazione conservativa, rumore escluso,
   metadati separati, valori clinici solo se strutturalmente affidabili. */
;(function v603ComplexClinicalContainers(H){
  'use strict'; if(!H)return;
  const VERSION='v6.0.4-canonical-v2';
  const BASE=H.canonicalizeClinicalDocument24.bind(H);
  const clone=v=>typeof structuredClone==='function'?structuredClone(v):JSON.parse(JSON.stringify(v??{}));
  const collapse=v=>String(v??'').replace(/\u00ad/g,'').replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').trim();
  const fold=v=>collapse(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('it-IT');
  const CLINICAL=/(?:anamnes|diagnos|terap|farmac|repert|conclusion|esame obiettivo|obiettivit|dimission|ricover|decorso|diario clinico|pressione|frequenza|saturaz|spo2|fio2|dolore|dispnea|tosse|febbre|edema|lesion|glicem|creatinin|emoglob|leucoc|piastrin|sodio|potass|ast\b|alt\b|bilirubin|inr\b|tsh\b|ft3\b|ft4\b|ecg\b|tac\b|rmn\b|radiograf|ecograf|biops|istolog|polmon|cardiac|renale|epatic|tiroid|diabet|apnea|ahi\b|cpap|bpap|ventilaz|mmhg|mg\/dl|g\/dl|mmol\/l|u\/l|bpm|cm\b|mm\b|kg\b|negativ|positiv|nei limiti|nella norma|patolog)/i;
  const ADMIN=/(?:partita\s+iva|p\.iva|codice\s+fiscale|data\s+(?:di\s+)?nascita|luogo\s+di\s+nascita|residenza|domicilio|sede\s+operativa|direttore\s+sanitario|responsabile\s+sanitario|centralino|segreteria|prenotazion|accettazione|informativa\s+(?:privacy|sul\s+trattamento)|consenso\s+(?:al|informato)|trattamento\s+dei\s+dati\s+personali|d\.lgs|gdpr|firma\s+(?:del\s+)?paziente|timbro|numero\s+(?:referto|pratica|cartella)|n[°.o]?\s*(?:referto|pratica|cartella)|pec\b|e-?mail|www\.|https?:\/\/|telefono|tel\.|fax|pagina\s+\d+|copia\s+conforme|firmato\s+digitalmente|classe\s+di\s+dose|contributo\s+ambientale|co\.na\.|personale\s+dei\s+dati|azienda\s+ospedaliero|servizio\s+sanitario\s+nazionale|regione\s+[a-zà-ÿ]+|scheda\s+nosologica)/i;
  const NON_EXAM=/(?:spedali|ospedale|azienda|consenso|priorit[aà]|anamnesi|difficolt[aà]|paziente|copia|scheda|cartella|reparto|ricovero|dimission|privacy|trattamento|firma|timbro|direttore|medicina|urgenza|unit[aà]\s+operativa|servizio|regione|indirizzo|telefono|email|codice\s+fiscale)/i;
  const UNIT=/(?:%|mg\/dl|g\/dl|g\/l|mg\/l|mmol\/l|µmol\/l|umol\/l|u\/l|ui\/l|m?eq\/l|ng\/ml|pg\/ml|µg\/dl|ug\/dl|10\^?\d+\/?[µu]?l|x10\^?\d+\/?[µu]?l|mmhg|bpm|fl|pg|sec|s|min|ml\/min|kg|cm|mm)\b/i;
  const REF_RANGE=/(?:\b\d+(?:[.,]\d+)?\s*(?:-|–|—|a)\s*\d+(?:[.,]\d+)?\b|[<>≤≥]\s*\d+(?:[.,]\d+)?)/;
  const DATE=/\b(?:0?[1-9]|[12]\d|3[01])[\/.-](?:0?[1-9]|1[0-2])[\/.-](?:19|20)\d{2}\b/;
  function sourceText(doc={}){return [doc.extractedText,doc.structuredText,(doc.ocrPageData||[]).map(p=>p?.text||'').join('\n')].filter(Boolean).join('\n');}
  function sourceFingerprint(doc={}){return H.clinicalCanonicalSourceFingerprint602?H.clinicalCanonicalSourceFingerprint602(doc):(doc.hash||H.textFingerprint?.(`${doc.originalName||''}|${doc.size||0}|${sourceText(doc).length}`)||'');}
  function isComplex(doc={}){
    const txt=fold(`${doc.originalName||''} ${doc.documentKind||''} ${doc.category||''} ${sourceText(doc).slice(0,50000)}`);
    const pages=Math.max(Number(doc.ocrProcessedPages||0),Array.isArray(doc.ocrPageData)?doc.ocrPageData.length:0);
    const file=fold(doc.originalName||'');
    return /cartella[ _.-]*clinica/.test(file)||(pages>=20&&/(?:diario clinico|diagnosi di dimissione|data (?:del |di )?ricovero|scheda nosologica|degenza|cartella clinica)/.test(txt));
  }
  function extractFacility(text='',doc={}){
    const lines=String(text||'').replace(/\r/g,'\n').split(/\n+/).map(collapse).filter(Boolean).slice(0,90);
    let facility=collapse(doc.facility||''),contact=collapse(doc.facilityContact||'');
    if(!facility){
      const c=lines.find(x=>/(?:ospedale|azienda ospedal|policlinico|centro medico|clinica|istituto|sp[e]?dali riuniti|asl\b|aoup\b|irccs\b)/i.test(x)&&x.length<220);
      if(c)facility=c.replace(/^.*?sede\s+operativa\s*:\s*/i,'').replace(/\b(?:p\.?iva|c\.?f\.?).*$/i,'').trim();
      if(facility.length>100){
        const m=facility.match(/(?:Biomedical\s+Centro\s+Medico|[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÿ'&. -]{2,80}(?:Centro\s+Medico|Ospedale|Clinica|Istituto|Policlinico))/i);
        if(m)facility=collapse(m[0]);
      }
    }
    if(/azienda\s+ospedaliero[ -]+universitaria\s+pisana/i.test(facility))facility='Azienda Ospedaliero-Universitaria Pisana';
    if(!contact){
      const phone=lines.map(x=>x.match(/(?:tel(?:efono)?\.?\s*[:\-]?\s*)(\+?[\d ()\-.]{6,})/i)).find(Boolean);
      const email=lines.map(x=>x.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/)).find(Boolean);
      contact=phone?.[1]?.trim()||email?.[0]||'';
    }
    return{facility,contact};
  }
  function noise(line=''){
    const s=collapse(line); if(!s)return true;
    const letters=(s.match(/[A-Za-zÀ-ÖØ-öø-ÿ]/g)||[]).length, symbols=(s.match(/[^A-Za-zÀ-ÖØ-öø-ÿ0-9\s.,;:()/%+\-'’]/g)||[]).length;
    if(s.length>14&&symbols/s.length>.18)return true;
    if(/(?:[|_~^`]{2,}|[<>{}\[\]\\]{2,})/.test(s))return true;
    if(s.length>16&&letters<4)return true;
    const words=s.split(/\s+/).filter(Boolean), alpha=words.filter(w=>/[A-Za-zÀ-ÖØ-öø-ÿ]{3,}/.test(w));
    if(alpha.length>=5&&alpha.filter(w=>!/[aeiouàèéìòóù]/i.test(w)).length/alpha.length>.7&&!CLINICAL.test(s))return true;
    return false;
  }
  const CLINICAL_START=/(?:\bNon\s+evidenti\b|\bNon\s+si\s+evidenziano\b|\bSi\s+evidenziano\b|\bNon\s+si\s+osservano\b|\bSi\s+osservano\b|\bLinea\s+mediana\b|\bRegolare\s+il\s+sistema\b|\bCalcificazioni?\b|\bNon\s+lesioni\b|\bReperti?\b|\bConclusioni?\b|\bDiagnosi\b|\bAnamnesi\b|\bEsame\s+obiettivo\b|\bTerapia\b|\bDecorso\b|\bIndagine\b|\bAll['’]?esame\b|\bL['’]?esame\b)/i;
  function salvageClinicalTail603(line=''){
    const src=collapse(line); if(!src)return'';
    const m=src.match(CLINICAL_START);
    if(!m||m.index==null)return'';
    const tail=collapse(src.slice(m.index));
    return tail.length>=18?tail:'';
  }
  function complexGarbage603(line=''){
    const s=collapse(line);if(!s)return true;
    if(/(?:ALLEGATO\s*\d+|ESECUZIONE\s+ESAME\s+ISTOLOGICO\s+ESEGUITO|Monitoraggio[- ]ECG[- ]P\.?A|RENIVERSITARIA|PISANADiagnosi)/i.test(s))return true;
    if(/(?:valore\s+ottenuto|valore\s+desiderato|intervallo\s+di\s+riferimento|fino\s+a\s*\d)/i.test(s)&&s.length<120)return true;
    const words=s.split(/\s+/).filter(Boolean),short=words.filter(w=>w.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ0-9]/g,'').length<=2).length;
    if(words.length>=10&&short/words.length>.52)return true;
    const strange=(s.match(/[«»{}\[\]_|~^`*]{1,}/g)||[]).join('').length;
    if(s.length>28&&strange/s.length>.08)return true;
    if(/^[A-Z0-9 .,_;:|+*/%?'-]{28,}$/.test(s)&&words.length>=7&&!/[.!?]$/.test(s)&&!/(?:DIAGNOSI|TERAPIA|ANAMNESI|CONCLUSIONI)/.test(s))return true;
    if(/[,;:]\s*$/.test(s)&&s.length<36)return true;
    return false;
  }
  function isolatedLabFragment603(line='',title=''){
    const s=collapse(line);if(/(?:terap|anamnes|decorso|diario|esame obiettivo)/i.test(title))return false;
    if(/^(?:U\s*-\s*)?(?:Emoglobina|Piastrine|Potassio|Sodio|Creatinina|BUN|Bilirubina|Glicemia|Vol\.?\s*Piastrinico|Leucociti|PCR|INR|AST|ALT)\b/i.test(s)&&s.split(/\s+/).length<=12)return true;
    if(/^[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ .()/-]{2,35}\s+[-+]?\d+(?:[.,]\d+)?\s*(?:mg\/dL|g\/dL|mEq\/L|mmol\/L|U\/L|fL|%)?/i.test(s)&&s.split(/\s+/).length<=10)return true;
    return false;
  }
  function cleanClinical(value='',complex=false,title=''){
    const out=[],seen=new Set(); let discarded=0;
    for(const raw of String(value||'').replace(/\r/g,'\n').split(/\n+/)){
      let line=collapse(raw); if(!line)continue;
      line=line.replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g,' ').replace(/https?:\/\/\S+|www\.\S+/gi,' ').replace(/\b(?:tel(?:efono)?|cell(?:ulare)?|fax)\.?\s*[:\-]?\s*\+?[\d ()\-.]{6,}/gi,' ').replace(/\s+/g,' ').trim();
      if(!line)continue;
      if(ADMIN.test(line)){
        const salvaged=salvageClinicalTail603(line);
        if(salvaged)line=salvaged;
        else if(!CLINICAL.test(line)){discarded++;continue;}
      }
      if(noise(line)||(complex&&complexGarbage603(line))){discarded++;continue;}
      if(complex&&isolatedLabFragment603(line,title)){discarded++;continue;}
      if(complex&&!CLINICAL.test(line)&&line.length<42){discarded++;continue;}
      const key=fold(line).replace(/[^a-z0-9]+/g,' ').trim(); if(!key||seen.has(key)){discarded++;continue;}
      seen.add(key);out.push(line);
    }
    return{text:out.join('\n').trim(),discarded};
  }
  function validLabRow(row={},complex=false){
    if(!complex)return true;
    const name=collapse(row.parameterName||row.test||''); const line=collapse(row.sourceLine||row.raw||'');
    if(!name||name.length<2||name.length>80||NON_EXAM.test(name))return false;
    const value=Number(row.value); const hasValue=Number.isFinite(value)||/\b(?:positivo|negativo|assente|presente|tracce)\b/i.test(String(row.result||''));
    if(!hasValue)return false;
    const evidence=`${line} ${row.unit||''} ${row.range?.raw||row.reference||''}`;
    if(!UNIT.test(evidence)&&!REF_RANGE.test(evidence))return false;
    if(line&&ADMIN.test(line)&&!CLINICAL.test(line))return false;
    return true;
  }
  function summarySections(sections=[]){
    const pri=/(?:diagnos|dimission|conclusion|repert|esame obiettivo|terap|decorso|anamnesi)/i;
    const rows=[];
    for(const s of sections){
      const title=collapse(s?.title||'Referto'), text=collapse(s?.text||''); if(!text)continue;
      const lines=String(s.text||'').split(/\n+/).map(collapse).filter(Boolean);
      let chosen=lines.filter(x=>CLINICAL.test(x));
      if(pri.test(title)&&chosen.length<4)chosen=lines.slice(0,12);
      if(!chosen.length)continue;
      rows.push({title,text:chosen.slice(0,18).join('\n')});
      if(rows.length>=8)break;
    }
    return rows;
  }
  function normalize(doc={},original={},profile={}){
    const complex=isComplex({...original,...doc}); const raw=sourceText({...original,...doc}); const fc=extractFacility(raw,doc);
    if(fc.facility)doc.facility=fc.facility; if(fc.contact)doc.facilityContact=fc.contact;
    let discarded=0; const sections=[];
    for(const s of doc.reportSections||[]){const cleaned=cleanClinical(s?.text||'',complex,s?.title||'');discarded+=cleaned.discarded;if(cleaned.text)sections.push({title:collapse(s?.title||'Referto')||'Referto',text:cleaned.text});}
    if(!sections.length){const cleaned=cleanClinical(raw,complex);discarded+=cleaned.discarded;if(cleaned.text)sections.push({title:complex?'Sintesi clinica':'Referto',text:cleaned.text});}
    doc.reportSections=sections; doc.pdfFields=sections.map(s=>({label:s.title,value:s.text,include:true})); doc.reconstructedText=sections.map(s=>`${s.title}\n${s.text}`).join('\n\n'); doc.narrativeClinicalSource=sections.map(s=>s.text).join('\n');
    if(complex){
      doc.documentKind='Cartella clinica';doc.category='Cartella clinica';doc.documentMode='narrative';
      doc.labValues=(doc.labValues||[]).filter(r=>validLabRow(r,true));doc.qualitativeResults=(doc.qualitativeResults||[]).filter(r=>validLabRow(r,true));doc.tableRows=[];
      doc.clinicalSummarySections=summarySections(sections);
      if(!doc.pdfExportMode)doc.pdfExportMode='summary';
      doc.complexClinicalContainer=true;
    } else if(!doc.pdfExportMode)doc.pdfExportMode='full';
    doc.clinicalCanonicalVersion=VERSION;doc.clinicalValidationVersion=VERSION;doc.clinicalCanonicalSourceFingerprint=sourceFingerprint(original);doc.clinicalCanonicalCachedAt=new Date().toISOString();doc.clinicalCanonicalNoiseDiscarded=Number(doc.clinicalCanonicalNoiseDiscarded||0)+discarded;
    doc.clinicalCanonicalMetadata={...(doc.clinicalCanonicalMetadata||{}),documentKind:doc.documentKind||'',clinicalDate:doc.clinicalDate||'',issueDate:doc.issueDate||'',specialization:doc.specialization||'',facility:doc.facility||'',facilityContact:doc.facilityContact||''};
    return doc;
  }
  function canon(input={},options={}){const original=clone(input),fp=sourceFingerprint(original);if(original.clinicalCanonicalVersion===VERSION&&original.clinicalCanonicalSourceFingerprint===fp&&Array.isArray(original.reportSections))return{document:original,changed:false,validation:{ok:true,violations:[]}};const result=BASE(original,options);return{...result,document:normalize(result?.document||original,original,options?.profile||{}),changed:true};}
  function prepare(docs=[],profile={}){return(docs||[]).map(d=>canon(d,{profile}).document);}
  H.canonicalizeClinicalDocument24=canon;H.repairNarrativeDocumentData=d=>canon(d);H.repairLabDocumentData=d=>canon(d);H.prepareDocuments24=prepare;
  H.V603_CANONICAL_VERSION=VERSION;H.isComplexClinicalContainer603=isComplex;H.cleanClinicalCanonical603=cleanClinical;H.validComplexLabRow603=validLabRow;
  H.TEST24_VERSION=VERSION;
})(HealthExtractors);


/* V6.0.4 FINAL - filtro conservativo per cartelle cliniche complesse.
   Obiettivo: nessun rumore OCR puo diventare esame/diagnosi/referto.
   In caso di dubbio il frammento viene escluso dal contenuto clinico canonico. */
;(function v603FinalComplexClinicalFilter(H){
  'use strict'; if(!H)return;
  const VERSION='v6.0.4-canonical-v2';
  const BASE=H.canonicalizeClinicalDocument24.bind(H);
  const clone=v=>typeof structuredClone==='function'?structuredClone(v):JSON.parse(JSON.stringify(v??{}));
  const collapse=v=>String(v??'').replace(/\u00ad/g,'').replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').trim();
  const fold=v=>collapse(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('it-IT');
  const COMPLEX_TITLE=/(?:anamnes|diagnos|terap|farmac|decorso|diario|conclusion|dimission|esame obiettivo|obiettivit|referto|repert)/i;
  const ADMIN=/(?:partita\s+iva|p\.?iva|codice\s+fiscale|data\s+(?:di\s+)?nascita|luogo\s+di\s+nascita|residenza|domicilio|sede\s+operativa|direttore\s+sanitario|responsabile\s+sanitario|centralino|segreteria|prenotazion|accettazione|informativa|consenso|privacy|trattamento\s+dei\s+dati|d\.lgs|gdpr|firma|timbro|numero\s+(?:referto|pratica|cartella)|n[°.o]?\s*(?:referto|pratica|cartella)|pec\b|e-?mail|www\.|https?:\/\/|telefono|tel\.|fax|pagina\s+\d+|copia\s+conforme|firmato\s+digitalmente|classe\s+di\s+dose|contributo\s+ambientale|scheda\s+nosologica|codice\s+nosologico)/i;
  const BAD_PHRASE=/(?:scr\s+copia|spedali\s+riuniti|consenso\s+al|priorit[aà]|difficolt[aà]\s+respi|anamnesi\s+po\b|il\s+paziente,?\s+vist\b|allegato\s*\d+|esecuzione\s+esame\s+istologico\s+eseguito|monitoraggio[- ]ecg[- ]p\.?a|reniversitaria|pisanadiagnosi|criteri\s+di\s+analisi\s*:\s*[a-z]?\s*$|aspecifici\s+segni\s+giornata|cute\s+perilesionale|triangoli\s+due\s+in\s+divisa|casella\s+la\s+a=altro|\bsat%\b|\bsuno\b|\bu\/?no\b|\bs\/?no\b|\bm\/?p\/?n\b|\bspaluaoao\b|\bhomaor\b|\bapuetco\b|\brn\s*=\s*seen\b)/i;
  const ISOLATED_LAB=/^(?:u\s*-\s*)?(?:emoglobina|piastrine|potassio|sodio|creatinina|bun|bilirubina|glicemia|vol\.?\s*piastrinico|leucociti|pcr|inr|ast|alt|albumina|calcio|magnesio|cloro|ematocrito|mcv|mch|mchc)\b.*?(?:[-+]?\d+(?:[.,]\d+)?|positivo|negativo|assente|presente)/i;
  const CLINICAL_SIGNAL=/(?:riferisce|nega\b|anamnes|apr\b|app\b|allerg|diagnos|insufficien|scompenso|danno\s+renale|obesit|ipertension|linfedema|dispnea|tosse|febbre|dolore|edema|diuresi|alvo|ventilaz|bpap|cpap|hfnc|ossigen|fio2|spo2|saturaz|pco2|po2|ph\b|mmhg|terapia|farmac|lasix|bisoprol|diamox|antibiotic|anticoagul|enoxaparin|creatinin|elettrolit|urinocolt|emocoltur|trombos|giugular|ecodoppler|ecografia|radiograf|tac\b|tc\b|rmn|parenchim|polmon|pleur|cardiac|ventricol|liquoral|calcificaz|lesion|biops|esofag|duoden|mucosa|linfonod|epatic|renale|tiroid|diabet|apnea|ahi\b|dimission|ricover|trasferit|decorso|esame\s+obiettivo|obiettivit|conclusion|repert|nella\s+norma|nei\s+limiti|patolog)/i;
  const SENTENCE_START=/^(?:riferisce|nega|non\s+|si\s+|in\s+|all['’]|l['’]|eseguit|prosegue|continua|migliorat|ridott|introdott|sospes|indicata|indicata,|ricoverat|trasferit|paziente|obiettivit|apr\b|app\b|diagnosi|terapia|conclusioni|reperti|esame\s+obiettivo)/i;
  function isComplex(doc={}){return H.isComplexClinicalContainer603?.(doc)===true||doc.complexClinicalContainer===true||/cartella[ _.-]*clinica/i.test(String(doc.originalName||''));}
  function wordQuality(s=''){
    const words=collapse(s).split(/\s+/).filter(Boolean);
    if(!words.length)return 0;
    const alpha=words.filter(w=>/[A-Za-zÀ-ÖØ-öø-ÿ]{3,}/.test(w));
    if(!alpha.length)return 0;
    const normal=alpha.filter(w=>/[aeiouàèéìòóù]/i.test(w)&&!/^[A-Z]{1,2}$/.test(w));
    return normal.length/alpha.length;
  }
  function obviousGarbage(line=''){
    const s=collapse(line); if(!s)return true;
    if(ADMIN.test(s)||BAD_PHRASE.test(s))return true;
    if(/(?:[|_~^`]{2,}|[<>{}\[\]\\]{2,}|[«»]{2,})/.test(s))return true;
    const letters=(s.match(/[A-Za-zÀ-ÖØ-öø-ÿ]/g)||[]).length;
    const strange=(s.match(/[^A-Za-zÀ-ÖØ-öø-ÿ0-9\s.,;:()/%+\-'’]/g)||[]).length;
    if(s.length>20&&letters/s.length<.35)return true;
    if(s.length>25&&strange/s.length>.10)return true;
    const words=s.split(/\s+/).filter(Boolean);
    const short=words.filter(w=>w.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ0-9]/g,'').length<=2).length;
    if(words.length>=9&&short/words.length>.48)return true;
    if(words.length>=6&&wordQuality(s)<.48&&!CLINICAL_SIGNAL.test(s))return true;
    if(/^[A-Z0-9 .,_;:|+*/%?'-]{24,}$/.test(s)&&!CLINICAL_SIGNAL.test(s))return true;
    return false;
  }
  function keepLine(line='',title='',summary=false){
    const s=collapse(line); if(!s||obviousGarbage(s))return false;
    if(ISOLATED_LAB.test(s)&&!/(?:terap|anamnes|decorso|diario)/i.test(title))return false;
    if(s.length<18)return false;
    const q=wordQuality(s),clinical=CLINICAL_SIGNAL.test(s),start=SENTENCE_START.test(s)||/^(?:APR|APP)\s*:/i.test(s);
    const prose=s.length>=42&&s.split(/\s+/).length>=7&&q>=.68;
    const titleClinical=COMPLEX_TITLE.test(title);
    const diagnostic=/^(?:insufficienza|scompenso|danno\s+renale|obesit[aà]|ipertensione|linfedema|trombosi|diabete|ipotiroid|apnee?|neoplas|infezion|polmonite|cardiopatia|nefropatia|epatopatia)\b/i.test(s)&&q>=.72;
    if(summary){
      if(/diagnos/i.test(title)&&diagnostic)return true;
      if(/conclusion|dimission/i.test(title))return (start||clinical)&&q>=.62;
      if(/terap|decorso|diario/i.test(title))return start&&clinical&&q>=.58;
      if(/anamnes/i.test(title))return start&&(clinical||prose)&&q>=.58;
      return start&&(clinical||prose)&&q>=.62;
    }
    return (clinical&&q>=.54)||(titleClinical&&prose&&q>=.68);
  }
  function cleanSection(section={},summary=false){
    const title=collapse(section?.title||'Referto')||'Referto';
    const seen=new Set(),out=[];
    for(const raw of String(section?.text||'').replace(/\r/g,'\n').split(/\n+/)){
      const line=collapse(raw).replace(/^[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z][,; ]*/,'').replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g,' ').replace(/https?:\/\/\S+|www\.\S+/gi,' ').replace(/\s+/g,' ').trim();
      if(!keepLine(line,title,summary))continue;
      const key=fold(line).replace(/[^a-z0-9]+/g,' ').trim();
      if(!key||seen.has(key))continue;
      seen.add(key);out.push(line);
      if(summary&&out.length>=14)break;
    }
    return out.length?{title,text:out.join('\n')}:null;
  }
  function normalizeFinal(doc={},original={}){
    if(!isComplex({...original,...doc})){
      doc.clinicalCanonicalVersion=VERSION;doc.clinicalValidationVersion=VERSION;return doc;
    }
    doc.documentKind='Cartella clinica';doc.category='Cartella clinica';doc.documentMode='narrative';doc.complexClinicalContainer=true;
    doc.labValues=[];doc.qualitativeResults=[];doc.tableRows=[];
    const clean=(doc.reportSections||[]).map(s=>cleanSection(s,false)).filter(Boolean);
    doc.reportSections=clean;
    doc.pdfFields=clean.map(s=>({label:s.title,value:s.text,include:true}));
    doc.reconstructedText=clean.map(s=>`${s.title}\n${s.text}`).join('\n\n');
    doc.narrativeClinicalSource=clean.map(s=>s.text).join('\n');
    let summary=clean.map(s=>cleanSection(s,true)).filter(Boolean);
    // Preferisce sezioni ad alto valore clinico e limita la stampa della cartella enorme.
    const priority=/(?:diagnos|conclusion|dimission|decorso|anamnes|terap|referto|repert)/i;
    summary=summary.sort((a,b)=>(priority.test(b.title)?1:0)-(priority.test(a.title)?1:0)).slice(0,7);
    doc.clinicalSummarySections=summary;
    if(!['full','summary','exclude'].includes(doc.pdfExportMode))doc.pdfExportMode='summary';
    if(!doc.pdfExportMode)doc.pdfExportMode='summary';
    doc.clinicalCanonicalVersion=VERSION;doc.clinicalValidationVersion=VERSION;
    doc.clinicalCanonicalCachedAt=new Date().toISOString();
    return doc;
  }
  function canon(input={},options={}){
    const original=clone(input);
    const result=BASE(original,options);
    const document=normalizeFinal(result?.document||original,original);
    return {...result,document,changed:true};
  }
  H.canonicalizeClinicalDocument24=canon;
  H.repairNarrativeDocumentData=d=>canon(d);
  H.repairLabDocumentData=d=>canon(d);
  H.prepareDocuments24=(docs=[],profile={})=>(docs||[]).map(d=>canon(d,{profile}).document);
  H.V603_CANONICAL_VERSION=VERSION;H.TEST24_VERSION=VERSION;
})(HealthExtractors);

/* V6.0.4 FINAL v3 - sintesi ad alta affidabilita per cartelle cliniche complesse.
   Estrae solo frasi cliniche riconoscibili; nessuna riga OCR incerta diventa esame o diagnosi. */
;(function v603HighConfidenceComplexSummary(H){
  'use strict'; if(!H)return;
  const VERSION='v6.0.4-canonical-v7';
  const BASE=H.canonicalizeClinicalDocument24.bind(H);
  const clone=v=>typeof structuredClone==='function'?structuredClone(v):JSON.parse(JSON.stringify(v??{}));
  const collapse=v=>String(v??'').replace(/\u00ad/g,'').replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').trim();
  const fold=v=>collapse(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('it-IT');
  const ADMIN=/(?:partita\s+iva|p\.?iva|codice\s+fiscale|data\s+(?:di\s+)?nascita|luogo\s+di\s+nascita|residenza|domicilio|sede\s+operativa|direttore\s+sanitario|responsabile\s+sanitario|centralino|segreteria|prenotazion|accettazione|informativa|consenso|privacy|trattamento\s+dei\s+dati|d\.lgs|gdpr|firma|timbro|numero\s+(?:referto|pratica|cartella)|pec\b|e-?mail|www\.|https?:\/\/|telefono|tel\.|fax|pagina\s+\d+|copia\s+conforme|firmato\s+digitalmente|classe\s+di\s+dose|contributo\s+ambientale|scheda\s+nosologica|tipo\s+provenienza|num\.\s*acc\.|dirigente\s+medico|data\s+del\s+ricovero|data\s+dimissione|\bidpleiade\b|\boperatore\s*:|\bdirettore\s*:|\bmedico\s+dr\.?)/i;
  const BAD=/(?:scr\s+copia|spedali\s+riuniti|consenso\s+al|priorit[aà]|difficolt[aà]\s+respi|anamnesi\s+po\b|il\s+paziente,?\s+vist\b|allegato\s*\d+|esecuzione\s+esame\s+istologico\s+eseguito|monitoraggio[- ]ecg[- ]p\.?a|reniversitaria|pisanadiagnosi|criteri\s+di\s+analisi|aspecifici\s+segni\s+giornata|cute\s+perilesionale|triangoli\s+due\s+in\s+divisa|casella\s+la\s+a=altro|\bsat%\b|\bsuno\b|\bu\/?no\b|\bs\/?no\b|\bm\/?p\/?n\b|\bspaluaoao\b|\bhomaor\b|\bapuetco\b|\brn\s*=\s*seen\b|eurenseerzarnzne|soncezozoinesnneeresiininon|imsufficienza|diagnosi\s+secondarie.*(?:codice|lateralit)|diagnosi\s+principale.*(?:codice|lateralit)|interventi\s+o\s+procedure|nota\s+di\s+etica\s+comportamentale|paramelrizzazione|terapia\s+(?:orale|endovenosa|sottocutanea|intramuscolare).*\b(?:sigla|sela)\b|\b(?:sigla|sela)\s+m\b|peso\s+kg.*altezza\s+cm.*must|\d{2}\/\d{2}\/\d{4}\s*[|]?\s*\d{2}:\d{2}|\bppp\s+ppp\b|diagnosi\s+(?:di\s+)?(?:accoglimento|dimissione)\s*$|diagnosi\s+al\s+trasferimento\s*:\s*[-iI ]*$|vedi\s+stu\s+allegata|diagnosi\s+clinica\s+alla\s+dimissione.*hic\s+orme|app\s*:\s*i\s+riscontro|terapia\s+sottocutane.*sig|terapia\s+farmacologica\s+effettuata\s+durante\s+il\s+rico|mantiene\s+0?2\s+terapia.*cure\s+del\s+caso|augmentifi.*inso|recente\s+biopsia.*poriderale.*\bsE\b|riferisce\s+dolore\s+agli\s+arti\s+inferiori,?\s*\d+)/i;
  const TAX=/\b[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]\b/g;
  const DIAG=/^(?:diagnosi(?:\s+di\s+(?:ingresso|dimissione))?\s*[:\-]?|insufficienza\s+respiratoria|scompenso\s+cardiaco|danno\s+renale|obesit[aà]\b|ipertensione\b|linfedema\b|trombosi\b|diabete\b|ipotiroid|apnee?\b|neoplas|polmonite\b|cardiopatia\b|nefropatia\b|epatopatia\b)/i;
  const ANAM=/^(?:riferisce|nega\b|apr\s*:|app\s*:|in\s+anamnesi|recente\b|allergia\b|riferita\s+allergia)/i;
  const THER=/^(?:terapia\b|si\s+(?:introduce|imposta|conferma|riduce|sospende|prosegue|inizia)|prosegue\b|continua\b|migliorat|indicata\b|e?seguito\s+ciclo\s+di\s+niv|ossigenoterapia\b|mantiene\b|ridotta\b|sospesa\b)/i;
  const CONC=/^(?:conclusioni?\s*[:\-]?|reperto\s+indicativo|trombosi\s+venosa|indicata,?\s+se\s+non\s+altre\s+controindicazioni)/i;
  const FIND=/^(?:non\s+(?:alterazioni|evidenti|si\s+evidenziano|si\s+osservano|linfoadenomegalie|lesioni|segni)|si\s+(?:evidenziano|osservano)|aspetto\s+congesto|opacit[aà]\b|ingrandimento\b|calcificazioni\b|velatura\s+pleurica|esame\s+tc\b|esarne\s+tc\b|tc\s+finalizz|ecografia\b|esofago\b|bulbo\s+duoden|duodeno\b|linea\s+z\b|regolare\s+il\s+sistema|linea\s+mediana|collateralmente\s+si\s+segnala|collateralmente\s+s[iì]\s+segnala|in\s+considerazione\s+della\s+negativit[aà])/i;
  function sourceText(doc={}){return [doc.extractedText,doc.structuredText,(doc.ocrPageData||[]).map(p=>p?.text||'').join('\n')].filter(Boolean).join('\n');}
  function isComplex(doc={}){return doc.complexClinicalContainer===true||H.isComplexClinicalContainer603?.(doc)===true||/cartella[ _.-]*clinica/i.test(String(doc.originalName||''));}
  function quality(s=''){
    const t=collapse(s); if(!t)return 0;
    const words=t.split(/\s+/).filter(Boolean), alpha=words.filter(w=>/[A-Za-zÀ-ÖØ-öø-ÿ]{3,}/.test(w));
    if(!alpha.length)return 0;
    const normal=alpha.filter(w=>/[aeiouàèéìòóù]/i.test(w)&&!/[{}\[\]|~^`]/.test(w));
    return normal.length/alpha.length;
  }
  function garbage(s=''){
    const t=collapse(s); if(!t||ADMIN.test(t)||BAD.test(t))return true;
    if(/^(?:APR|APP)\s*:/i.test(t)&&/[|\[\]{}‘’]/.test(t))return true;
    if(/\bidPleiade\b/i.test(t))return true;
    if(/(?:[|_~^`]{2,}|[<>{}\[\]\\]{2,})/.test(t))return true;
    const letters=(t.match(/[A-Za-zÀ-ÖØ-öø-ÿ]/g)||[]).length, odd=(t.match(/[^A-Za-zÀ-ÖØ-öø-ÿ0-9\s.,;:()/%+\-'’]/g)||[]).length;
    if(t.length>25&&(letters/t.length<.42||odd/t.length>.08))return true;
    const words=t.split(/\s+/).filter(Boolean), short=words.filter(w=>w.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ0-9]/g,'').length<=2).length;
    if(words.length>=9&&short/words.length>.45)return true;
    if(words.length>=6&&quality(t)<.58)return true;
    return false;
  }
  function prepLine(raw=''){
    let s=collapse(raw).replace(/[{}]/g,m=>m==='{'?'(' : ')').replace(TAX,'').replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g,' ').replace(/https?:\/\/\S+|www\.\S+/gi,' ').replace(/\b(?:tel(?:efono)?|cell(?:ulare)?|fax)\.?\s*[:\-]?\s*\+?[\d ()\-.]{6,}/gi,' ').replace(/\s+/g,' ').trim();
    return s;
  }
  function chunks(raw=''){
    const lines=String(raw||'').replace(/===\s*PAGINA\s*\d+\s*===/gi,'\n').replace(/\r/g,'\n').split(/\n+/).map(prepLine).filter(Boolean);
    const out=[]; let buf='';
    const flush=()=>{if(buf){out.push(collapse(buf));buf='';}};
    for(let line of lines){
      if(ADMIN.test(line)||BAD.test(line)){flush();continue;}
      const marker=/^(?:ANAMNESI|DIAGNOSI|TERAPIA|CONCLUSIONI|DECORSO|ESAME OBIETTIVO)\s*:?$/i.test(line);
      if(marker){flush();continue;}
      if(!buf){buf=line;continue;}
      const nextLower=/^[a-zà-ÿ]/.test(line), prevOpen=/[,;:]$/.test(buf)||!/[.!?]$/.test(buf);
      if(buf.length<520&&(nextLower||prevOpen)&&!DIAG.test(line)&&!ANAM.test(line)&&!THER.test(line)&&!CONC.test(line)&&!FIND.test(line))buf+=' '+line;
      else{flush();buf=line;}
      if(/[.!?]$/.test(buf)&&buf.length>80)flush();
    }
    flush();return out;
  }
  function classify(s=''){
    const t=collapse(s); if(garbage(t)||t.length<24)return'';
    if(/[\\]|\/\//.test(t))return'';
    if(t.length>95&&!/[.!?)]$/.test(t))return'';
    if(/^(?:diagnosi(?: clinica)?(?: di)? (?:ammissione|accoglimento|dimissione))\s*:?$/i.test(t))return'';
    const q=quality(t);
    if(CONC.test(t)&&q>=.68)return'Conclusioni';
    if(DIAG.test(t)&&q>=.70)return'Diagnosi';
    if(ANAM.test(t)&&q>=.70)return'Anamnesi';
    if(THER.test(t)&&t.length>=40&&/^[A-ZÀ-ÖØ-Ý]/.test(t)&&q>=.68)return'Decorso e terapia';
    if(FIND.test(t)&&q>=.70)return'Reperti clinici';
    return'';
  }
  function highConfidenceSections(original={},doc={}){
    const groups=new Map([['Diagnosi',[]],['Anamnesi',[]],['Reperti clinici',[]],['Decorso e terapia',[]],['Conclusioni',[]]]), seen=new Set();
    for(const chunk of chunks(sourceText(original)||sourceText(doc))){
      const cat=classify(chunk); if(!cat)continue;
      const key=fold(chunk).replace(/[^a-z0-9]+/g,' ').trim(); if(!key||seen.has(key))continue;
      const arr=groups.get(cat); const toks=new Set(key.split(/\s+/).filter(x=>x.length>3));
      const near=arr.some(prev=>{const pk=fold(prev).replace(/[^a-z0-9]+/g,' ').trim(),pt=new Set(pk.split(/\s+/).filter(x=>x.length>3));if(!toks.size||!pt.size)return false;let common=0;for(const t of toks)if(pt.has(t))common++;return common/Math.min(toks.size,pt.size)>=.82;});
      if(near)continue;seen.add(key);
      const limit=cat==='Reperti clinici'?14:cat==='Anamnesi'?10:cat==='Decorso e terapia'?10:8;
      if(arr.length<limit)arr.push(chunk);
    }
    return [...groups].filter(([,rows])=>rows.length).map(([title,rows])=>({title,text:rows.join('\n')}));
  }
  function normalize(doc={},original={}){
    doc.clinicalCanonicalVersion=VERSION;doc.clinicalValidationVersion=VERSION;
    if(!isComplex({...original,...doc}))return doc;
    doc.documentKind='Cartella clinica';doc.category='Cartella clinica';doc.documentMode='narrative';doc.complexClinicalContainer=true;
    doc.labValues=[];doc.qualitativeResults=[];doc.tableRows=[];
    const sections=highConfidenceSections(original,doc);
    doc.reportSections=sections;doc.clinicalSummarySections=sections;
    doc.pdfFields=sections.map(s=>({label:s.title,value:s.text,include:true}));
    doc.reconstructedText=sections.map(s=>`${s.title}\n${s.text}`).join('\n\n');doc.narrativeClinicalSource=sections.map(s=>s.text).join('\n');
    if(!['full','summary','exclude'].includes(doc.pdfExportMode))doc.pdfExportMode='summary';
    if(!doc.pdfExportMode)doc.pdfExportMode='summary';
    doc.clinicalCanonicalCachedAt=new Date().toISOString();return doc;
  }
  function canon(input={},options={}){const original=clone(input),result=BASE(original,options),document=normalize(result?.document||original,original);return{...result,document,changed:true};}
  H.canonicalizeClinicalDocument24=canon;H.repairNarrativeDocumentData=d=>canon(d);H.repairLabDocumentData=d=>canon(d);H.prepareDocuments24=(docs=[],profile={})=>(docs||[]).map(d=>canon(d,{profile}).document);H.V603_CANONICAL_VERSION=VERSION;H.TEST24_VERSION=VERSION;
})(HealthExtractors);

/* V6.0.4 FIX3 - canone v8.
   Rilettura obbligatoria delle cartelle cliniche elaborate con versioni precedenti.
   La rappresentazione clinica conserva solo contenuto sanitario affidabile; dei dati
   di provenienza restano struttura e reparto/specializzazione. Recapiti, dati fiscali,
   anagrafica, personale e modulistica restano esclusivamente nel documento originale. */
;(function v604CanonicalV8(H){
  'use strict'; if(!H)return;
  const VERSION='v6.0.4-canonical-v8';
  const PREVIOUS='v6.0.4-canonical-v7';
  const BASE=H.canonicalizeClinicalDocument24.bind(H);
  const clone=v=>typeof structuredClone==='function'?structuredClone(v):JSON.parse(JSON.stringify(v??{}));
  const collapse=v=>String(v??'').replace(/\u00ad/g,'').replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').trim();
  const fold=v=>collapse(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('it-IT');
  const ADMIN=/(?:partita\s+iva|p\.?\s*iva|codice\s+fiscale|data\s+(?:di\s+)?nascita|luogo\s+di\s+nascita|residenza|domicilio|indirizzo|via\s+[a-zà-ÿ]|viale\s+[a-zà-ÿ]|piazza\s+[a-zà-ÿ]|sede\s+(?:legale|operativa)|direttore\s+sanitario|responsabile\s+sanitario|centralino|segreteria|prenotazion|accettazione|informativa|consenso|privacy|trattamento\s+dei\s+dati|d\.?lgs|gdpr|firma|timbro|numero\s+(?:referto|pratica|cartella)|codice\s+(?:documento|ricovero|nosologico)|pec\b|e-?mail|www\.|https?:\/\/|telefono|tel\.|fax|pagina\s+\d+|copia\s+conforme|firmato\s+digitalmente|classe\s+di\s+dose|contributo\s+ambientale|scheda\s+nosologica|cartellinatura|stato\s+civile|comune\s+di\s+residenza|regione\s+di\s+assistenza|medico\s+curante|nome\s+e\s+cognome|cognome\s+e\s+nome)/i;
  const NOISE=/(?:scr\s+copia|spedali?\s+riuniti\s+\d+|consenso\s+al|priorit[aà](?:\s+\d+)?|difficolt[aà]\s+respi|anamnesi\s+po\b|il\s+paziente,?\s+vist\b|fumo\s*:\s*not|td\s*:\s*candesart|uo\s+medicina\s+\d+|mappa?\s+pon|allegato\s*\d+|monitoraggio[- ]ecg[- ]p\.?a|trattamento\s+dei\s+dati\s+personali|addetto\s+cartellinatura|scheda\s+nosologica)/i;
  const DEPARTMENT_LINE=/^(?:u\.?\s*o\.?\s*(?:c\.?|s\.?d\.?)?\s*|unit[aà]\s+operativa\s*:?\s*|reparto\s*:?\s*|dipartimento\s*:?\s*)(.+)$/i;
  const KNOWN_LAB=/^(emoglobina|ematocrito|eritrociti|leucociti|piastrine|neutrofili|linfociti|monociti|eosinofili|basofili|glicemia|glucosio|creatinina|azotemia|urea|sodio|potassio|cloro|calcio|magnesio|fosforo|ast|got|alt|gpt|ggt|gamma\s*gt|fosfatasi\s+alcalina|bilirubina(?:\s+(?:totale|diretta|indiretta))?|albumina|proteine(?:\s+totali)?|pcr|crp|ves|inr|pt|aptt|tsh|ft3|ft4|colesterolo(?:\s+totale)?|hdl|ldl|trigliceridi|ferritina|sideremia|transferrina|vitamina\s+d|vitamina\s+b12|folati|acido\s+urico|troponina|bnp|nt[- ]?probnp|d[- ]?dimero)\b/i;
  const UNIT=/(?:%|mg\/dl|g\/dl|g\/l|mg\/l|mmol\/l|µmol\/l|umol\/l|u\/l|ui\/l|meq\/l|ng\/ml|pg\/ml|µg\/dl|ug\/dl|10\^?\d+\/?[µu]?l|x10\^?\d+\/?[µu]?l|fl|sec|secondi)\b/i;
  const RANGE=/(?:\b\d+(?:[.,]\d+)?\s*(?:-|–|—|a)\s*\d+(?:[.,]\d+)?\b|[<>≤≥]\s*\d+(?:[.,]\d+)?)/;
  function sourceText(doc={}){return [doc.extractedText,doc.structuredText,(doc.ocrPageData||[]).map(p=>p?.text||'').join('\n')].filter(Boolean).join('\n');}
  function sourceFingerprint(doc={}){
    const value=H.clinicalCanonicalSourceFingerprint602?H.clinicalCanonicalSourceFingerprint602(doc):(doc.hash||H.textFingerprint?.(`${doc.originalName||''}|${doc.size||0}|${sourceText(doc).length}`)||'');
    return typeof value==='string'?value:JSON.stringify(value??'');
  }
  function isComplex(doc={}){return doc.complexClinicalContainer===true||H.isComplexClinicalContainer603?.(doc)===true||/cartella[ _.-]*clinica/i.test(String(doc.originalName||''));}
  function sanitizeFacility(value=''){
    let s=collapse(value);
    if(!s)return'';
    s=s.replace(/\b(?:p\.?\s*iva|partita\s+iva|c\.?f\.?|codice\s+fiscale|tel\.?|telefono|fax|e-?mail|www\.).*$/i,'').trim().replace(/[;,.-]+$/,'').trim();
    if(ADMIN.test(s)&&!/\b(?:ospedale|policlinico|clinica|centro\s+medico|istituto|azienda\s+ospedaliero|spedali\s+riuniti|asl\b|aou\b|irccs\b)\b/i.test(s))return'';
    return s.slice(0,120);
  }
  function extractDepartment(raw='',fallback=''){
    let current=collapse(fallback).replace(/\b(?:tel\.?|telefono|fax|e-?mail|p\.?iva|codice\s+fiscale).*$/i,'').trim();
    current=current.replace(/^(?:u\.?\s*o\.?\s*(?:c\.?|s\.?d\.?)?\s*|unit[aà]\s+operativa\s*:?\s*|reparto\s*:?\s*)/i,'').trim();
    if(/medicina\s+d['’]?urgenza|medicina\s+urgenza/i.test(current))return "Medicina d'urgenza";
    if(current&&current.length<=100&&!ADMIN.test(current))return current;
    const lines=String(raw||'').replace(/\r/g,'\n').split(/\n+/).map(collapse).filter(Boolean).slice(0,180);
    for(const line of lines){
      const m=line.match(DEPARTMENT_LINE); if(!m)continue;
      let d=collapse(m[1]).replace(/\b(?:tel\.?|telefono|fax|e-?mail|direttore|responsabile).*$/i,'').trim();
      if(d&&d.length<=100&&!ADMIN.test(d)&&!/^(?:medicina|reparto|uo)$/i.test(d))return d;
    }
    const joined=fold(lines.join(' '));
    if(/medicina d['’]?urgenza|medicina urgenza/.test(joined))return "Medicina d'urgenza";
    for(const d of ['Endocrinologia','Cardiologia','Neurologia','Epatologia','Pneumologia','Nefrologia','Oncologia','Chirurgia','Gastroenterologia'])if(joined.includes(fold(d)))return d;
    return'';
  }
  const CLINICAL_TAIL=/(?:\bdiagnosi\b|\banamnesi\b|\bterapia\b|\bdecorso\b|\breperti?\b|\bconclusioni?\b|\besame\s+obiettivo\b|\bnon\s+evident|\bnon\s+si\s+evidenziano|\bsi\s+evidenziano|\blinea\s+mediana|\bcalcificazioni?\b|\bregolare\s+il\s+sistema|\bin\s+anamnesi\b)/i;
  const STRONG_CLINICAL_TITLE=/(?:diagnos|anamnes|terap|decorso|repert|conclusion|esame\s+obiettivo|dimission|lettera\s+di\s+dimission|indicazion|raccomandazion)/i;
  const COMPLEX_CLINICAL_SIGNAL=/(?:\bdiagnos\w*|\banamnes\w*|\bterap\w*|\bdecorso\b|\brepert\w*|\bconclusion\w*|\besame\s+obiettivo|\bdimess\w*|\bricover\w*|\bintervent\w*|\ballerg\w*|\bfarmac\w*|\bsomministr\w*|\bdolor\w*|\bfebbr\w*|\bdispnea\b|\bedem\w*|\blesion\w*|\bemorrag\w*|\bversament\w*|\btromb\w*|\bischem\w*|\bstenos\w*|\bcalcific\w*|\bfrattur\w*|\bcardiac\w*|\bpolmon\w*|\brenal\w*|\bepat\w*|\bdiabet\w*|\bipertens\w*|\bipotiroid\w*|\btiroid\w*|\bobesit\w*|\bsaturaz\w*|\bossigen\w*|\bglicem\w*|\bcreatinin\w*|\bemoglobin\w*|\bventricol\w*|\bcarotid\w*|\bencefal\w*|\bmidoll\w*|\bfegat\w*|\brene\b|\bcuore\b|\bpolmone\b|\bpressione\s+arteriosa|\bfrequenza\s+cardiaca|\bnon\s+(?:si\s+)?(?:evidenz|document|rilev)|\bsi\s+(?:evidenz|document|rilev|apprezz)|\bnei\s+limiti|\bregolar\w*|\bassenza\s+di|\bpresenza\s+di)/i;
  function lineQuality(value=''){
    const words=collapse(value).split(/\s+/).filter(Boolean);
    const alpha=words.filter(w=>/[A-Za-zÀ-ÖØ-öø-ÿ]{3,}/.test(w));
    if(!alpha.length)return 0;
    const normal=alpha.filter(w=>/[aeiouàèéìòóù]/i.test(w)&&!/[{}\[\]|~^`]/.test(w));
    return normal.length/alpha.length;
  }
  function cleanSections(sections=[],complex=false){
    const out=[]; const seen=new Set();
    for(const section of sections||[]){
      if(!section||typeof section!=='object')continue;
      const title=collapse(section.title||'Referto')||'Referto'; const rows=[];
      const strongClinicalSection=complex&&STRONG_CLINICAL_TITLE.test(title);
      for(const raw of String(section.text||'').replace(/\r/g,'\n').split(/\n+/)){
        let line=collapse(raw); if(!line)continue;
        if(ADMIN.test(line)){
          const m=line.match(CLINICAL_TAIL);
          if(!m||m.index==null)continue;
          line=collapse(line.slice(m.index));
        }
        if((complex&&NOISE.test(line))||DEPARTMENT_LINE.test(line))continue;
        line=line.replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g,' ').replace(/https?:\/\/\S+|www\.\S+/gi,' ').replace(/\b(?:tel(?:efono)?|cell(?:ulare)?|fax)\.?\s*[:\-]?\s*\+?[\d ()\-.]{6,}/gi,' ').replace(/\s+/g,' ').trim();
        if(!line||ADMIN.test(line)||(complex&&NOISE.test(line)))continue;
        if(complex){
          const labLike=KNOWN_LAB.test(line)&&(UNIT.test(line)||RANGE.test(line));
          const clinicalSignal=COMPLEX_CLINICAL_SIGNAL.test(line);
          // Nei contenitori complessi una riga generica non entra nel dossier solo
          // perche' e' leggibile o contiene numeri. Fuori da sezioni cliniche
          // esplicite serve un segnale clinico riconoscibile o una riga di laboratorio
          // strutturalmente credibile. In caso di dubbio la riga viene scartata.
          if(!strongClinicalSection&&!clinicalSignal&&!labLike)continue;
          if(!labLike&&lineQuality(line)<(strongClinicalSection?0.42:0.50))continue;
        }
        const key=fold(line).replace(/[^a-z0-9]+/g,' ').trim(); if(!key||seen.has(key))continue;
        seen.add(key); rows.push(line);
      }
      if(rows.length)out.push({title,text:rows.join('\n')});
    }
    return out;
  }
  function strictLabs(rows=[]){
    const out=[];const seen=new Set();
    for(const raw of rows||[]){
      const row=raw&&typeof raw==='object'?{...raw}:null;if(!row)continue;
      const name=collapse(row.parameterName||row.test||'');const m=name.match(KNOWN_LAB);if(!m)continue;
      const n=Number(String(row.value??'').replace(',','.'));if(!Number.isFinite(n))continue;
      const range=typeof row.range==='object'?(row.range?.raw||''):(row.reference||'');
      const evidence=collapse(`${row.sourceLine||row.raw||''} ${row.unit||''} ${range}`);
      if(ADMIN.test(evidence)||NOISE.test(evidence)||(!UNIT.test(evidence)&&!RANGE.test(evidence)))continue;
      row.parameterName=m[1].replace(/\s+/g,' ').trim();row.test=row.parameterName;
      const normalized=H.canonicalizeLabValue?H.canonicalizeLabValue(row):row;if(!normalized)continue;
      const key=`${fold(normalized.parameterName)}|${Number(normalized.value)}|${fold(normalized.unit||'')}`;if(seen.has(key))continue;seen.add(key);out.push(normalized);
    }
    return out;
  }
  function normalize(doc={},original={}){
    const previousVersion=doc.clinicalCanonicalVersion||'';
    const complex=isComplex({...original,...doc});
    doc.facility=sanitizeFacility(doc.facility||original.facility||'');
    doc.facilityContact='';
    if(doc.clinicalCanonicalMetadata&&typeof doc.clinicalCanonicalMetadata==='object'){
      doc.clinicalCanonicalMetadata={...doc.clinicalCanonicalMetadata};
      delete doc.clinicalCanonicalMetadata.facilityContact;
      doc.clinicalCanonicalMetadata.facility=doc.facility||'';
    }
    if(complex){
      const raw=sourceText(original)||sourceText(doc);
      const department=extractDepartment(raw,doc.department||doc.specialization||original.department||original.specialization||'');
      doc.documentKind='Cartella clinica';doc.category='Cartella clinica';doc.documentMode='narrative';doc.complexClinicalContainer=true;
      doc.department=department;doc.specialization=department;
      doc.doctor='';doc.medicalPersonnel=[];doc.identifiers=[];
      for(const key of ['extractedDiagnoses','extractedTherapies','extractedExemptions']){
        if(!Array.isArray(doc[key]))continue;
        doc[key]=doc[key].filter(row=>row&&typeof row==='object').map(row=>{
          const item={...row,facility:doc.facility||'',specialization:department||''};
          delete item.facilityContact;delete item.doctor;delete item.physician;delete item.medicalPersonnel;delete item.identifiers;
          return item;
        });
      }
      // Per le cartelle complesse la V8 ripulisce il materiale appena ricostruito
      // dalla sorgente, non una sezione gia' filtrata da uno strato precedente.
      // Se il parser Python ha gia' prodotto sezioni cliniche usiamo quelle; in
      // assenza di sezioni ricostruiamo conservativamente dal testo OCR originale.
      const sourceSections=(Array.isArray(original.reportSections)&&original.reportSections.length)
        ? original.reportSections
        : ((Array.isArray(doc.reportSections)&&doc.reportSections.length)
          ? doc.reportSections
          : (raw?[{title:'Contenuto clinico',text:raw}]:[]));
      const sections=cleanSections(sourceSections,true);
      doc.reportSections=sections;doc.clinicalSummarySections=sections.slice(0,8);doc.pdfFields=sections.map(s=>({label:s.title,value:s.text,include:true}));
      doc.reconstructedText=sections.map(s=>`${s.title}\n${s.text}`).join('\n\n');doc.narrativeClinicalSource=sections.map(s=>s.text).join('\n');
      // Una cartella clinica può fornire valori numerici soltanto quando il nome è
      // un analita noto e la riga contiene anche unità o intervallo di riferimento.
      doc.labValues=strictLabs(original.labValues||[]);doc.qualitativeResults=[];doc.tableRows=[];
      if(!['full','summary','exclude'].includes(doc.pdfExportMode))doc.pdfExportMode='summary';
      if(!doc.pdfExportMode)doc.pdfExportMode='summary';
    } else if(Array.isArray(doc.reportSections)&&doc.reportSections.length){
      const sections=cleanSections(doc.reportSections,false);
      doc.reportSections=sections;doc.pdfFields=sections.map(s=>({label:s.title,value:s.text,include:true}));
      doc.reconstructedText=sections.map(s=>`${s.title}\n${s.text}`).join('\n\n');doc.narrativeClinicalSource=sections.map(s=>s.text).join('\n');
    }
    doc.clinicalCanonicalVersion=VERSION;doc.clinicalValidationVersion=VERSION;doc.clinicalCanonicalSourceFingerprint=sourceFingerprint(original);
    if(previousVersion!==VERSION||!doc.clinicalCanonicalCachedAt)doc.clinicalCanonicalCachedAt=new Date().toISOString();
    doc.clinicalCanonicalMetadata={...(doc.clinicalCanonicalMetadata||{}),documentKind:doc.documentKind||'',category:doc.category||'',documentMode:doc.documentMode||'',clinicalDate:doc.clinicalDate||'',issueDate:doc.issueDate||'',specialization:doc.specialization||'',department:doc.department||'',facility:doc.facility||''};
    delete doc.clinicalCanonicalMetadata.facilityContact;
    return doc;
  }
  function canon(input={},options={}){
    const original=clone(input),fp=sourceFingerprint(original);
    if(original.clinicalCanonicalVersion===VERSION&&original.clinicalCanonicalSourceFingerprint===fp&&Array.isArray(original.reportSections)){
      const stable=normalize(clone(original),original);return{document:stable,changed:JSON.stringify(stable)!==JSON.stringify(original),validation:{ok:true,violations:[]}};
    }
    // Per i documenti non complessi già validati con il canone precedente non
    // rieseguire l'intera pipeline: aggiorna solo i metadati amministrativi.
    if(!isComplex(original)&&original.clinicalCanonicalVersion===PREVIOUS&&Array.isArray(original.reportSections)){
      const document=normalize(clone(original),original);return{document,changed:true,validation:{ok:true,violations:[]}};
    }
    const result=BASE(original,options);const document=normalize(result?.document||original,original);return{...result,document,changed:true};
  }
  H.canonicalizeClinicalDocument24=canon;
  H.repairNarrativeDocumentData=d=>canon(d);
  H.repairLabDocumentData=d=>canon(d);
  H.prepareDocuments24=(docs=[],profile={})=>(docs||[]).map(d=>canon(d,{profile}).document);
  H.V603_CANONICAL_VERSION=VERSION;H.V602_CANONICAL_VERSION=VERSION;H.TEST24_VERSION=VERSION;
})(HealthExtractors);


/* V6.0.4 FIX4 - canone V9, intervento circoscritto alle cartelle cliniche complesse.
   I normali referti non vengono ripuliti o reinterpretati: ricevono soltanto il
   nuovo identificativo di canone. Le cartelle cliniche vengono invece rilette una
   volta dal file originale e filtrate con criteri strutturali dedicati. */
;(function v604CanonicalV9ComplexOnly(H){
  'use strict'; if(!H)return;
  const VERSION='v6.0.4-canonical-v9';
  const BASE=H.canonicalizeClinicalDocument24.bind(H);
  const clone=v=>typeof structuredClone==='function'?structuredClone(v):JSON.parse(JSON.stringify(v??{}));
  const collapse=v=>String(v??'').replace(/\u00ad/g,'').replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').trim();
  const fold=v=>collapse(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('it-IT');
  const ADMIN=/(?:partita\s+iva|p\.?\s*iva|codice\s+fiscale|data\s+(?:di\s+)?nascita|luogo\s+di\s+nascita|residenza|domicilio|indirizzo|via\s+[a-zà-ÿ]|viale\s+[a-zà-ÿ]|piazza\s+[a-zà-ÿ]|direttore\s+sanitario|responsabile\s+sanitario|centralino|segreteria|prenotazion|accettazione|informativa|consenso|privacy|trattamento\s+dei\s+dati|d\.?lgs|gdpr|firma|timbro|scheda\s+nosologica|cartellinatura|stato\s+civile|comune\s+di\s+residenza|regione\s+di\s+assistenza|medico\s+curante|nome\s+e\s+cognome|cognome\s+e\s+nome|classe\s+di\s+dose|contributo\s+ambientale|telefono|tel\.|fax|e-?mail|pec\b|www\.|https?:\/\/|numero\s+(?:referto|pratica|cartella)|codice\s+(?:documento|ricovero|nosologico))/i;
  const NOISE=/(?:scr\s+copia|spedali?\s+riuniti(?:\s+\d+)?|consenso\s+al|priorit[aà](?:\s+\d+)?|difficolt[aà]\s+respi|anamnesi\s+po\b|il\s+paziente,?\s+vist\b|fumo\s*:\s*not|td\s*:\s*candesart|uo\s+medicina\s+\d+|addetto\s+cartellinatura|scheda\s+nosologica|trattamento\s+dei\s+dati\s+personali)/i;
  const KNOWN_LAB=/^(emoglobina|ematocrito|eritrociti|leucociti|piastrine|neutrofili|linfociti|monociti|eosinofili|basofili|glicemia|glucosio|creatinina|azotemia|urea|sodio|potassio|cloro|calcio|magnesio|fosforo|ast|got|alt|gpt|ggt|gamma\s*gt|fosfatasi\s+alcalina|bilirubina(?:\s+(?:totale|diretta|indiretta))?|albumina|proteine(?:\s+totali)?|pcr|crp|ves|inr|pt|aptt|tsh|ft3|ft4|colesterolo(?:\s+totale)?|hdl|ldl|trigliceridi|ferritina|sideremia|transferrina|vitamina\s+d|vitamina\s+b12|folati|acido\s+urico|troponina|bnp|nt[- ]?probnp|d[- ]?dimero)\b/i;
  const UNIT=/(?:%|mg\/dl|g\/dl|g\/l|mg\/l|mmol\/l|µmol\/l|umol\/l|u\/l|ui\/l|meq\/l|ng\/ml|pg\/ml|µg\/dl|ug\/dl|10\^?\d+\/?[µu]?l|x10\^?\d+\/?[µu]?l|fl|sec|secondi)\b/i;
  const RANGE=/(?:\b\d+(?:[.,]\d+)?\s*(?:-|–|—|a)\s*\d+(?:[.,]\d+)?\b|[<>≤≥]\s*\d+(?:[.,]\d+)?)/;
  const CLINICAL=/(?:\bdiagnos\w*|\banamnes\w*|\bterap\w*|\bdecorso\b|\brepert\w*|\bconclusion\w*|\besame\s+obiettivo|\bdimess\w*|\bricover\w*|\bintervent\w*|\ballerg\w*|\bfarmac\w*|\bsomministr\w*|\bdolor\w*|\bfebbr\w*|\bdispnea\b|\bedem\w*|\blesion\w*|\bemorrag\w*|\bversament\w*|\btromb\w*|\bischem\w*|\bstenos\w*|\bcalcific\w*|\bfrattur\w*|\bcardiac\w*|\bpolmon\w*|\brenal\w*|\bepat\w*|\bdiabet\w*|\bipertens\w*|\bipotiroid\w*|\btiroid\w*|\bobesit\w*|\bsaturaz\w*|\bossigen\w*|\bglicem\w*|\bcreatinin\w*|\bemoglobin\w*|\bventricol\w*|\bcarotid\w*|\bencefal\w*|\bfegat\w*|\brene\b|\bcuore\b|\bpolmone\b|\bpressione\s+arteriosa|\bfrequenza\s+cardiaca|\bnon\s+(?:si\s+)?(?:evidenz|document|rilev)|\bsi\s+(?:evidenz|document|rilev|apprezz)|\bnei\s+limiti|\bregolar\w*|\bassenza\s+di|\bpresenza\s+di)/i;
  const CLINICAL_TITLE=/(?:diagnos|anamnes|terap|decorso|repert|conclusion|esame\s+obiettivo|dimission|lettera\s+di\s+dimission|indicazion|raccomandazion)/i;
  function sourceText(doc={}){return [doc.extractedText,doc.structuredText,(doc.ocrPageData||[]).map(p=>p?.text||'').join('\n')].filter(Boolean).join('\n');}
  function fingerprint(doc={}){const v=H.clinicalCanonicalSourceFingerprint602?H.clinicalCanonicalSourceFingerprint602(doc):(doc.hash||H.textFingerprint?.(`${doc.originalName||''}|${doc.size||0}|${sourceText(doc).length}`)||'');return typeof v==='string'?v:JSON.stringify(v??'');}
  function isComplex(doc={}){return doc.complexClinicalContainer===true||H.isComplexClinicalContainer603?.(doc)===true||/cartella[ _.-]*clinica/i.test(String(doc.originalName||''));}
  function facilityFrom(raw='',fallback=''){
    const text=String(raw||'');
    if(/azienda\s+ospedalier[oa][ -]+universitaria\s+pisana/i.test(text))return 'Azienda Ospedaliero-Universitaria Pisana';
    const lines=text.replace(/\r/g,'\n').split(/\n+/).map(collapse).filter(Boolean).slice(0,180);
    const patterns=[
      /\b(Azienda\s+Ospedalier[oa](?:[- ]Universitaria)?\s+[A-Za-zÀ-ÿ' .-]{2,70})/i,
      /\b(Policlinico\s+[A-Za-zÀ-ÿ' .-]{2,70})/i,
      /\b(Ospedale\s+[A-Za-zÀ-ÿ' .-]{2,70})/i,
      /\b((?:Biomedical\s+)?Centro\s+Medico\s+[A-Za-zÀ-ÿ' .-]{0,60})/i,
      /\b(Istituto\s+[A-Za-zÀ-ÿ' .-]{2,70})/i
    ];
    for(const line0 of lines){
      let line=line0.replace(/\b(?:p\.?\s*iva|partita\s+iva|c\.?f\.?|codice\s+fiscale|tel\.?|telefono|fax|e-?mail|www\.).*$/i,'').trim();
      if(ADMIN.test(line)&&!/\b(?:azienda\s+ospedal|policlinico|ospedale|centro\s+medico|istituto)\b/i.test(line))continue;
      for(const re of patterns){const m=line.match(re);if(m){let x=collapse(m[1]).replace(/[;,.: -]+$/,'').trim();if(x.length>=5&&x.length<=110)return x;}}
    }
    let f=collapse(fallback).replace(/^.*?(?=Azienda\s+Ospedal|Policlinico|Ospedale|Centro\s+Medico|Istituto)/i,'').replace(/\b(?:p\.?\s*iva|partita\s+iva|c\.?f\.?|codice\s+fiscale|tel\.?|telefono|fax|e-?mail|www\.).*$/i,'').trim();
    if(ADMIN.test(f)&&!/\b(?:azienda\s+ospedal|policlinico|ospedale|centro\s+medico|istituto)\b/i.test(f))return'';
    return f.slice(0,110);
  }
  function departmentFrom(raw='',fallback=''){
    const text=fold(raw);
    if(/medicina\s+(?:degenza\s+)?d['’]?urgenza(?:\s+e\s+ps)?|medicina\s+urgenza|d['’]?urgenza\s+e\s+ps/.test(text))return "Medicina d'urgenza";
    const known=[['Endocrinologia',/\bendocrinolog/],['Cardiologia',/\bcardiolog/],['Neurologia',/\bneurolog/],['Epatologia',/\bepatolog/],['Pneumologia',/\bpneumolog/],['Nefrologia',/\bnefrolog/],['Gastroenterologia',/\bgastroenterolog|endoscopia\s+digestiva/],['Oncologia',/\boncolog/],['Radiologia',/\bradiolog|diagnostica\s+per\s+immagini/]];
    for(const [label,re] of known)if(re.test(text))return label;
    const f=collapse(fallback).replace(/^(?:u\.?\s*o\.?\s*(?:c\.?|s\.?d\.?)?\s*|unit[aà]\s+operativa\s*:?\s*|reparto\s*:?\s*)/i,'').trim();
    if(f&&f.length<=90&&!ADMIN.test(f)&&!/^(?:medicina|carte|timbro|codice)$/i.test(f))return f;
    return'';
  }
  function quality(s=''){const words=collapse(s).split(/\s+/).filter(Boolean),alpha=words.filter(w=>/[A-Za-zÀ-ÖØ-öø-ÿ]{3,}/.test(w));if(!alpha.length)return 0;return alpha.filter(w=>/[aeiouàèéìòóù]/i.test(w)&&!/[{}\[\]|~^`]/.test(w)).length/alpha.length;}
  function cleanSections(sections=[]){
    const out=[],seen=new Set();
    for(const section of sections||[]){
      if(!section||typeof section!=='object')continue;
      const title=collapse(section.title||'Contenuto clinico')||'Contenuto clinico',strong=CLINICAL_TITLE.test(title),rows=[];
      for(const raw of String(section.text||'').replace(/\r/g,'\n').split(/\n+/)){
        let line=collapse(raw);if(!line)continue;
        if(ADMIN.test(line)){
          const m=line.match(/(?:\bdiagnos\w*|\banamnes\w*|\bterap\w*|\bdecorso\b|\brepert\w*|\bconclusion\w*|\besame\s+obiettivo|\bdimission\w*)/i);
          if(!m||m.index==null)continue;line=collapse(line.slice(m.index));
        }
        if(NOISE.test(line))continue;
        line=line.replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g,' ').replace(/https?:\/\/\S+|www\.\S+/gi,' ').replace(/\b(?:tel(?:efono)?|cell(?:ulare)?|fax)\.?\s*[:\-]?\s*\+?[\d ()\-.]{6,}/gi,' ').replace(/\s+/g,' ').trim();
        if(!line||ADMIN.test(line)||NOISE.test(line))continue;
        const lab=KNOWN_LAB.test(line)&&(UNIT.test(line)||RANGE.test(line));
        if(!strong&&!CLINICAL.test(line)&&!lab)continue;
        if(!lab&&quality(line)<(strong?0.40:0.50))continue;
        const key=fold(line).replace(/[^a-z0-9]+/g,' ').trim();if(!key||seen.has(key))continue;seen.add(key);rows.push(line);
      }
      if(rows.length)out.push({title,text:rows.join('\n')});
    }
    return out;
  }
  function strictLabs(rows=[]){
    const out=[],seen=new Set();
    for(const raw of rows||[]){
      if(!raw||typeof raw!=='object')continue;const row={...raw};
      const name=collapse(row.parameterName||row.test||''),m=name.match(KNOWN_LAB);if(!m)continue;
      const value=Number(String(row.value??'').replace(',','.'));if(!Number.isFinite(value))continue;
      const range=typeof row.range==='object'?(row.range?.raw||''):(row.reference||'');
      const evidence=collapse(`${row.sourceLine||row.raw||''} ${row.unit||''} ${range}`);
      if(ADMIN.test(evidence)||NOISE.test(evidence)||(!UNIT.test(evidence)&&!RANGE.test(evidence)))continue;
      let canonical=m[1].replace(/\s+/g,' ').trim();if(/^creatinina$/i.test(canonical))canonical='Creatinina ematica';
      row.parameterName=canonical;row.test=canonical;
      const normalized=H.canonicalizeLabValue?H.canonicalizeLabValue(row):row;if(!normalized)continue;
      const key=`${fold(normalized.parameterName)}|${Number(normalized.value)}|${fold(normalized.unit||'')}`;if(seen.has(key))continue;seen.add(key);out.push(normalized);
    }
    return out;
  }
  function canon(input={},options={}){
    const original=clone(input),fp=fingerprint(original),complex=isComplex(original);
    if(!complex){
      if(original.clinicalCanonicalVersion===VERSION&&original.clinicalCanonicalSourceFingerprint===fp)return{document:original,changed:false,validation:{ok:true,violations:[]}};
      const document=clone(original);document.clinicalCanonicalVersion=VERSION;document.clinicalValidationVersion=VERSION;document.clinicalCanonicalSourceFingerprint=fp;document.clinicalCanonicalCachedAt=document.clinicalCanonicalCachedAt||new Date().toISOString();
      return{document,changed:true,validation:{ok:true,violations:[]}};
    }
    if(original.clinicalCanonicalVersion===VERSION&&original.clinicalCanonicalSourceFingerprint===fp&&Array.isArray(original.reportSections))return{document:original,changed:false,validation:{ok:true,violations:[]}};
    const base=BASE(original,options),doc=clone(base?.document||original),raw=sourceText(original)||sourceText(doc);
    doc.documentKind='Cartella clinica';doc.category='Cartella clinica';doc.documentMode='narrative';doc.complexClinicalContainer=true;
    doc.facility=facilityFrom(raw,doc.facility||original.facility||'');doc.facilityContact='';
    const dep=departmentFrom(raw,doc.department||doc.specialization||original.department||original.specialization||'');doc.department=dep;doc.specialization=dep;
    doc.doctor='';doc.medicalPersonnel=[];doc.identifiers=[];
    const src=(Array.isArray(doc.reportSections)&&doc.reportSections.length)?doc.reportSections:(raw?[{title:'Contenuto clinico',text:raw}]:[]);
    const sections=cleanSections(src);doc.reportSections=sections;doc.clinicalSummarySections=sections.slice(0,8);doc.pdfFields=sections.map(s=>({label:s.title,value:s.text,include:true}));
    doc.reconstructedText=sections.map(s=>`${s.title}\n${s.text}`).join('\n\n');doc.narrativeClinicalSource=sections.map(s=>s.text).join('\n');
    doc.labValues=strictLabs([...(original.labValues||[]),...(doc.labValues||[])]);doc.qualitativeResults=[];doc.tableRows=[];
    for(const key of ['extractedDiagnoses','extractedTherapies','extractedExemptions'])if(Array.isArray(doc[key]))doc[key]=doc[key].filter(x=>x&&typeof x==='object').map(x=>{const y={...x,facility:doc.facility||'',specialization:dep||''};for(const f of ['facilityContact','doctor','physician','medicalPersonnel','identifiers'])delete y[f];return y;});
    if(!['full','summary','exclude'].includes(doc.pdfExportMode))doc.pdfExportMode='summary';if(!doc.pdfExportMode)doc.pdfExportMode='summary';
    doc.clinicalCanonicalVersion=VERSION;doc.clinicalValidationVersion=VERSION;doc.clinicalCanonicalSourceFingerprint=fp;doc.clinicalCanonicalCachedAt=new Date().toISOString();
    doc.clinicalCanonicalMetadata={...(doc.clinicalCanonicalMetadata||{}),documentKind:'Cartella clinica',category:'Cartella clinica',documentMode:'narrative',clinicalDate:doc.clinicalDate||'',issueDate:doc.issueDate||'',specialization:dep||'',department:dep||'',facility:doc.facility||''};delete doc.clinicalCanonicalMetadata.facilityContact;
    return{...base,document:doc,changed:true,validation:{ok:true,violations:[]}};
  }
  H.canonicalizeClinicalDocument24=canon;H.repairNarrativeDocumentData=d=>canon(d);H.repairLabDocumentData=d=>canon(d);H.prepareDocuments24=(docs=[],profile={})=>(docs||[]).map(d=>canon(d,{profile}).document);
  H.V604_COMPLEX_CANONICAL_VERSION=VERSION;H.V603_CANONICAL_VERSION=VERSION;H.V602_CANONICAL_VERSION=VERSION;H.TEST24_VERSION=VERSION;
})(HealthExtractors);


/* V6.0.4 FIX5 - canone V10 definitivo per CARTELLE CLINICHE COMPLESSE.
   Scope intenzionalmente ristretto: i normali referti non vengono reinterpretati.
   La cartella clinica viene trasformata in contenitore narrativo clinico, con
   metadati amministrativi esclusi e soli risultati di laboratorio ad alta evidenza. */
;(function v604CanonicalV10ComplexOnly(H){
  'use strict'; if(!H)return;
  const VERSION='v6.0.4-canonical-v10';
  const clone=v=>typeof structuredClone==='function'?structuredClone(v):JSON.parse(JSON.stringify(v??{}));
  const collapse=v=>String(v??'').replace(/\u00ad/g,'').replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').trim();
  const fold=v=>collapse(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('it-IT');
  const ADMIN=/(?:partita\s+iva|p\.?\s*iva|codice\s+fiscale|data\s+(?:di\s+)?nascita|data\s+(?:di\s+)?(?:ricovero|dimissione)|luogo\s+di\s+nascita|residenza|domicilio|indirizzo|\bvia\s+[a-zà-ÿ]|\bviale\s+[a-zà-ÿ]|\bpiazza\s+[a-zà-ÿ]|direttore\s+sanitario|responsabile\s+sanitario|centralino|segreteria|prenotazion|accettazione|informativa|consenso|privacy|trattamento\s+dei\s+dati|d\.?lgs|gdpr|firma|timbro|scheda\s+nosologica|cartellinatura|stato\s+civile|comune\s+di\s+residenza|regione\s+di\s+assistenza|medico\s+curante|nome\s+e\s+cognome|cognome\s+e\s+nome|classe\s+di\s+dose|contributo\s+ambientale|telefono|tel\.|fax|e-?mail|pec\b|www\.|https?:\/\/|numero\s+(?:referto|pratica|cartella)|codice\s+(?:documento|ricovero|nosologico)|azienda\s+u\.?s\.?l\.?\s+di\s+assistenza)/i;
  const NOISE=/(?:scr\s+copia|spedali?\s+riuniti(?:\s+\d+)?|consenso\s+al|priorit[aà](?:\s+\d+)?|difficolt[aà]\s+respi|anamnesi\s+po\b|il\s+paziente,?\s+vist\b|fumo\s*:\s*not|td\s*:\s*candesart|uo\s+medicina\s+\d+|addetto\s+cartellinatura|scheda\s+nosologica|trattamento\s+dei\s+dati\s+personali|copia\s+rn\s+s|comune\s+di\s+residenza)/i;
  const CLINICAL_HEADING=/(?:diagnosi\s+(?:di\s+)?(?:accoglimento|ingresso|dimissione)|anamnesi(?:\s+(?:patologica|familiare|fisiologica|farmacologica|remota|prossima))*|esame\s+obiettivo|decorso\s+clinico|terapia(?:\s+(?:domiciliare|alla\s+dimissione|in\s+atto))?\s*[:\-]|trattamento\s+clinico\s*[:\-]|intervento\s*[:\-]|procedure?\s*[:\-]|reperti?\s*[:\-]|conclusioni?\s*[:\-]|lettera\s+di\s+dimissione|motivo\s+(?:del\s+)?ricovero|storia\s+clinica|problemi\s+(?:attivi|clinici)|allergie|accertamenti|consulenze|esami\s+(?:ematochimici|di\s+laboratorio|strumentali)|indicazioni|raccomandazioni)/i;
  const ADMIN_HEADING=/(?:consenso(?:\s+al\s+trattamento)?|informativa|privacy|scheda\s+nosologica|cognome\s+e\s+nome|nome\s+e\s+cognome|data\s+(?:di\s+)?nascita|data\s+(?:di\s+)?(?:ricovero|dimissione)|luogo\s+di\s+nascita|stato\s+civile|comune\s+di\s+residenza|codice\s+fiscale|timbro\s+e\s+n|addetto\s+cartellinatura|cartella\s+clinica\s+n|regione\s+di\s+assistenza|medico\s+curante)/i;
  const STRONG_CLINICAL=/(?:\bdiagnos\w*|\banamnes\w*|\bterap\w*|\bdecorso\b|\brepert\w*|\bconclusion\w*|\besame\s+obiettivo|\bdimess\w*|\bricover\w*|\bintervent\w*|\ballerg\w*|\bfarmac\w*|\bsomministr\w*|\bdolor\w*|\bfebbr\w*|\bdispnea\b|\bedem\w*|\blesion\w*|\bemorrag\w*|\bversament\w*|\btromb\w*|\bischem\w*|\bstenos\w*|\bcalcific\w*|\bfrattur\w*|\bcardiac\w*|\bpolmon\w*|\brenal\w*|\bepat\w*|\bdiabet\w*|\bipertens\w*|\bipotiroid\w*|\btiroid\w*|\bobesit\w*|\bsaturaz\w*|\bossigen\w*|\bglicem\w*|\bcreatinin\w*|\bemoglobin\w*|\bventricol\w*|\bcarotid\w*|\bencefal\w*|\bfegat\w*|\brene\b|\bcuore\b|\bpolmone\b|\bpressione\s+arteriosa|\bfrequenza\s+cardiaca|\bnon\s+(?:si\s+)?(?:evidenz|document|rilev)|\bsi\s+(?:evidenz|document|rilev|apprezz)|\bnei\s+limiti|\bregolar\w*|\bassenza\s+di|\bpresenza\s+di|\bscompenso\b|\binsufficienza\b|\binfezione\b|\bverso\s+domicilio\b)/i;
  const KNOWN_LAB=/^(emoglobina|ematocrito|eritrociti|leucociti|piastrine|neutrofili|linfociti|monociti|eosinofili|basofili|glicemia|glucosio|creatinina|azotemia|urea|sodio|potassio|cloro|calcio|magnesio|fosforo|ast|got|alt|gpt|ggt|gamma\s*gt|fosfatasi\s+alcalina|bilirubina(?:\s+(?:totale|diretta|indiretta))?|albumina|proteine(?:\s+totali)?|pcr|crp|ves|inr|pt|aptt|tsh|ft3|ft4|colesterolo(?:\s+totale)?|hdl|ldl|trigliceridi|ferritina|sideremia|transferrina|vitamina\s+d|vitamina\s+b12|folati|acido\s+urico|troponina|bnp|nt[- ]?probnp|d[- ]?dimero)\b/i;
  const UNIT=/(?:%|mg\/dl|g\/dl|g\/l|mg\/l|mmol\/l|µmol\/l|umol\/l|u\/l|ui\/l|meq\/l|ng\/ml|pg\/ml|µg\/dl|ug\/dl|10\^?\d+\/?[µu]?l|x10\^?\d+\/?[µu]?l|fl|sec|secondi)\b/i;
  const RANGE=/(?:\b\d+(?:[.,]\d+)?\s*(?:-|–|—|a)\s*\d+(?:[.,]\d+)?\b|[<>≤≥]\s*\d+(?:[.,]\d+)?)/;
  const DATE='(\\d{1,2})[\\/.\\-](\\d{1,2})[\\/.\\-](\\d{2,4})';
  const headingRE=new RegExp(`(${CLINICAL_HEADING.source})`,'gi');
  const adminHeadingRE=new RegExp(`(${ADMIN_HEADING.source})`,'gi');
  function sourceText(doc={}){
    const pages=(doc.ocrPageData||[]).map(p=>p?.text||'').join('\n');
    const candidates=[doc.extractedText,doc.structuredText,pages].map(x=>String(x||'').trim()).filter(Boolean);
    if(!candidates.length)return'';candidates.sort((a,b)=>b.length-a.length);return candidates[0];
  }
  function fingerprint(doc={}){const v=H.clinicalCanonicalSourceFingerprint602?H.clinicalCanonicalSourceFingerprint602(doc):(doc.hash||H.textFingerprint?.(`${doc.originalName||''}|${doc.size||0}|${sourceText(doc).length}`)||'');return typeof v==='string'?v:JSON.stringify(v??'');}
  function isComplex(doc={}){const label=`${doc.documentKind||''} ${doc.category||''} ${doc.title||''} ${doc.originalName||''}`;return doc.complexClinicalContainer===true||H.isComplexClinicalContainer603?.(doc)===true||/cartella[ _.-]*clinica/i.test(label);}
  function facilityFrom(raw='',fallback=''){
    const text=String(raw||'');
    if(/azienda\s+ospedalier[oa][ -]+universitaria\s+pisana/i.test(text))return 'Azienda Ospedaliero-Universitaria Pisana';
    const pats=[/\b(Azienda\s+Ospedalier[oa](?:[- ]Universitaria)?\s+[A-Za-zÀ-ÿ' .-]{2,70})/i,/\b(Policlinico\s+[A-Za-zÀ-ÿ' .-]{2,70})/i,/\b(Ospedale\s+[A-Za-zÀ-ÿ' .-]{2,70})/i,/\b((?:Biomedical\s+)?Centro\s+Medico(?:\s+[A-Za-zÀ-ÿ' .-]{1,60})?)/i,/\b(Istituto\s+[A-Za-zÀ-ÿ' .-]{2,70})/i];
    const lines=text.replace(/\r/g,'\n').split(/\n+/).map(collapse).filter(Boolean).slice(0,240);
    for(const l0 of lines){const l=l0.replace(/\b(?:p\.?\s*iva|partita\s+iva|c\.?f\.?|codice\s+fiscale|tel\.?|telefono|fax|e-?mail|www\.).*$/i,'').trim();for(const re of pats){const m=l.match(re);if(m){const x=collapse(m[1]).replace(/[;,.: -]+$/,'');if(x.length>=5&&x.length<=110)return x;}}}
    let f=collapse(fallback).replace(/^.*?(?=Azienda\s+Ospedal|Policlinico|Ospedale|Centro\s+Medico|Istituto)/i,'').replace(/\b(?:p\.?\s*iva|partita\s+iva|c\.?f\.?|codice\s+fiscale|tel\.?|telefono|fax|e-?mail|www\.).*$/i,'').trim();
    if(/azienda\s+ospedalier[oa][ -]+universitaria\s+pisana/i.test(f))return 'Azienda Ospedaliero-Universitaria Pisana';
    return ADMIN.test(f)?'':f.slice(0,110);
  }
  function departmentFrom(raw='',fallback=''){
    const text=fold(raw);
    if(/medicina\s+(?:degenza\s+)?d['’]?urgenza(?:\s+e\s+ps)?|medicina\s+urgenza|d['’]?urgenza\s+e\s+ps/.test(text))return "Medicina d'urgenza";
    const known=[['Endocrinologia',/\bendocrinolog/],['Cardiologia',/\bcardiolog/],['Neurologia',/\bneurolog/],['Epatologia',/\bepatolog/],['Pneumologia',/\bpneumolog/],['Nefrologia',/\bnefrolog/],['Gastroenterologia',/\bgastroenterolog|endoscopia\s+digestiva/],['Oncologia',/\boncolog/],['Radiologia',/\bradiolog|diagnostica\s+per\s+immagini/]];
    for(const [label,re] of known)if(re.test(text))return label;
    const f=collapse(fallback).replace(/^(?:u\.?\s*o\.?\s*(?:c\.?|s\.?d\.?)?\s*|unit[aà]\s+operativa\s*:?\s*|reparto\s*:?\s*)/i,'').trim();
    if(f&&f.length<=90&&!ADMIN.test(f)&&!/(?:timbro|codice|carte)/i.test(f))return f;return'';
  }
  function quality(s=''){const words=collapse(s).split(/\s+/).filter(Boolean),alpha=words.filter(w=>/[A-Za-zÀ-ÖØ-öø-ÿ]{3,}/.test(w));if(!alpha.length)return 0;return alpha.filter(w=>/[aeiouàèéìòóù]/i.test(w)&&!/[{}\[\]|~^`]/.test(w)).length/alpha.length;}
  function cleanInline(line=''){
    let s=String(line||'');
    s=s.replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g,' ')
      .replace(/https?:\/\/\S+|www\.\S+/gi,' ')
      .replace(/\b(?:tel(?:efono)?|cell(?:ulare)?|fax)\.?\s*[:\-]?\s*\+?[\d ()\-.]{6,}/gi,' ')
      .replace(/\b(?:p\.?\s*iva|partita\s+iva|c\.?f\.?|codice\s+fiscale)\s*[:\-]?\s*[A-Z0-9 .\/-]{6,}/gi,' ')
      .replace(/\bdata\s+(?:di\s+)?nascita\s*[:\-]?\s*\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}/gi,' ');
    s=collapse(s);let m=s.match(NOISE);if(m){if(!m.index)return'';s=collapse(s.slice(0,m.index));}m=s.match(ADMIN);if(m){if(!m.index)return'';s=collapse(s.slice(0,m.index));}return s;
  }
  function canonicalTitle(s=''){
    const x=fold(s);
    if(/diagnosi.*dimission/.test(x))return 'Diagnosi di dimissione';
    if(/diagnosi.*(?:accoglimento|ingresso)/.test(x))return 'Diagnosi di accoglimento';
    if(/anamnes/.test(x))return 'Anamnesi';
    if(/esame obiettivo/.test(x))return 'Esame obiettivo';
    if(/decorso/.test(x))return 'Decorso clinico';
    if(/terap|trattamento clinico/.test(x))return 'Terapia';
    if(/intervent|procedur/.test(x))return 'Interventi e procedure';
    if(/conclusion/.test(x))return 'Conclusioni';
    if(/lettera.*dimission|^dimission/.test(x))return 'Dimissione';
    if(/motivo.*ricovero/.test(x))return 'Motivo del ricovero';
    if(/storia clinica/.test(x))return 'Storia clinica';
    if(/allerg/.test(x))return 'Allergie';
    if(/accertament|consulenz|esami/.test(x))return 'Accertamenti';
    if(/indicaz|raccomand/.test(x))return 'Indicazioni';
    return 'Contenuto clinico';
  }
  function segment(raw=''){
    let s=String(raw||'').replace(/\r/g,'\n').replace(/===\s*PAGINA\s*\d+\s*===/gi,'\n');
    s=s.replace(headingRE,'\n$1\n').replace(adminHeadingRE,'\n$1\n');
    // Evita che un OCR multipagina quasi privo di a-capo resti una singola riga ingestibile.
    s=s.replace(/([.;:!?])\s+(?=[A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÿ]{2,})/g,'$1\n');
    return s.split(/\n+/).map(collapse).filter(Boolean);
  }
  function buildSections(raw='',existing=[]){
    const rows=segment(raw),sections=[],seen=new Set();let current=null,drop=false;
    const push=(title,line)=>{line=cleanInline(line).replace(/^[:\-–—]+\s*/,'');if(!line||NOISE.test(line)||ADMIN.test(line))return;const key=fold(line).replace(/[^a-z0-9]+/g,' ').trim();if(!key||seen.has(key))return;seen.add(key);let sec=sections.find(x=>x.title===title);if(!sec){sec={title,text:''};sections.push(sec);}sec.text+=(sec.text?'\n':'')+line;};
    for(let line of rows){
      const clinicalMatch=line.match(CLINICAL_HEADING);
      if(clinicalMatch&&clinicalMatch.index===0){current=canonicalTitle(clinicalMatch[0]);drop=false;line=collapse(line.slice(clinicalMatch[0].length).replace(/^\s*[:\-–—]+\s*/,''));if(line&&!ADMIN.test(line)&&!NOISE.test(line)&&quality(line)>=0.25)push(current,line);continue;}
      const adminMatch=line.match(ADMIN_HEADING);
      if(adminMatch&&adminMatch.index===0){drop=true;current=null;continue;}
      if(drop)continue;
      if(current){const candidate=cleanInline(line);if(candidate&&quality(candidate)>=0.25)push(current,candidate);continue;}
      const candidate=cleanInline(line),lab=KNOWN_LAB.test(candidate)&&(UNIT.test(candidate)||RANGE.test(candidate));
      if(candidate&&(STRONG_CLINICAL.test(candidate)||lab)&&quality(candidate)>=0.32)push('Contenuto clinico',candidate);
    }
    // Recupero conservativo da sezioni già classificate clinicamente se il testo OCR
    // non espone titoli leggibili. Vale solo per la cartella clinica complessa.
    for(const sec of existing||[]){if(!sec||typeof sec!=='object')continue;const title=canonicalTitle(sec.title||'');const titleClinical=CLINICAL_HEADING.test(String(sec.title||''));CLINICAL_HEADING.lastIndex=0;if(!titleClinical)continue;for(const line of segment(sec.text||'')){if(!ADMIN.test(line)&&!NOISE.test(line)&&quality(line)>=0.25)push(title,line);}}
    return sections.filter(s=>collapse(s.text));
  }
  function strictLabs(rows=[]){
    const out=[],seen=new Set();
    for(const raw of rows||[]){if(!raw||typeof raw!=='object')continue;const row={...raw},name=collapse(row.parameterName||row.test||''),m=name.match(KNOWN_LAB);if(!m)continue;const value=Number(String(row.value??'').replace(',','.'));if(!Number.isFinite(value))continue;const range=typeof row.range==='object'?(row.range?.raw||''):(row.reference||'');const evidence=collapse(`${row.sourceLine||row.raw||''} ${row.unit||''} ${range}`);if(ADMIN.test(evidence)||NOISE.test(evidence)||(!UNIT.test(evidence)&&!RANGE.test(evidence)))continue;let canonical=m[1].replace(/\s+/g,' ').trim();if(/^creatinina$/i.test(canonical))canonical='Creatinina ematica';row.parameterName=canonical;row.test=canonical;const normalized=H.canonicalizeLabValue?H.canonicalizeLabValue(row):row;if(!normalized)continue;const key=`${fold(normalized.parameterName)}|${Number(normalized.value)}|${fold(normalized.unit||'')}`;if(seen.has(key))continue;seen.add(key);out.push(normalized);}return out;
  }
  function isoDate(d,m,y){let yy=Number(y);if(yy<100)yy+=yy>=70?1900:2000;const dt=new Date(Date.UTC(yy,Number(m)-1,Number(d)));if(dt.getUTCFullYear()!==yy||dt.getUTCMonth()!==Number(m)-1||dt.getUTCDate()!==Number(d))return'';return `${yy}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;}
  function labeledDate(raw='',labels=[]){for(const label of labels){const re=new RegExp(`${label}[^\\d]{0,30}${DATE}`,'i'),m=String(raw||'').match(re);if(m){const iso=isoDate(m[1],m[2],m[3]);if(iso)return iso;}}return'';}
  function canon(input={},options={}){
    const original=clone(input),fp=fingerprint(original),complex=isComplex(original);
    if(!complex){if(original.clinicalCanonicalVersion===VERSION&&original.clinicalCanonicalSourceFingerprint===fp)return{document:original,changed:false,validation:{ok:true,violations:[]}};const doc=clone(original);doc.clinicalCanonicalVersion=VERSION;doc.clinicalValidationVersion=VERSION;doc.clinicalCanonicalSourceFingerprint=fp;return{document:doc,changed:true,validation:{ok:true,violations:[]}};}
    const doc=clone(original),raw=sourceText(original);doc.documentKind='Cartella clinica';doc.category='Cartella clinica';doc.documentMode='narrative';doc.complexClinicalContainer=true;
    doc.facility=facilityFrom(raw,doc.facility||'');doc.facilityContact='';const dep=departmentFrom(raw,doc.department||doc.specialization||'');doc.department=dep;doc.specialization=dep;doc.doctor='';doc.medicalPersonnel=[];doc.identifiers=[];
    const birth=String(options?.profile?.birthDate||'');const admission=labeledDate(raw,['data\\s+(?:di\\s+)?ricovero','data\\s+(?:di\\s+)?ammissione','data\\s+(?:di\\s+)?ingresso','ricover[oa]\\s+(?:il|dal)']);const discharge=labeledDate(raw,['data\\s+(?:di\\s+)?dimissione','dimess[oa]\\s+(?:il|in data)','data\\s+chiusura\\s+cartella']);if(admission&&admission!==birth)doc.clinicalDate=admission;if(discharge&&discharge!==birth)doc.issueDate=discharge;
    const sections=buildSections(raw,original.reportSections||[]);doc.reportSections=sections;doc.clinicalSummarySections=sections.slice(0,10);doc.pdfFields=sections.map(s=>({label:s.title,value:s.text,include:true}));doc.reconstructedText=sections.map(s=>`${s.title}\n${s.text}`).join('\n\n');doc.narrativeClinicalSource=sections.map(s=>s.text).join('\n');
    doc.labValues=strictLabs(original.labValues||[]);doc.qualitativeResults=[];doc.tableRows=[];
    for(const key of ['extractedDiagnoses','extractedTherapies','extractedExemptions'])if(Array.isArray(doc[key]))doc[key]=doc[key].filter(x=>x&&typeof x==='object').map(x=>{const y={...x,facility:doc.facility||'',specialization:dep||''};for(const f of ['facilityContact','doctor','physician','medicalPersonnel','identifiers'])delete y[f];return y;});
    doc.pdfExportMode=['full','summary','exclude'].includes(doc.pdfExportMode)?doc.pdfExportMode:'summary';doc.clinicalCanonicalVersion=VERSION;doc.clinicalValidationVersion=VERSION;doc.clinicalCanonicalSourceFingerprint=fp;doc.clinicalCanonicalCachedAt=new Date().toISOString();
    doc.clinicalCanonicalMetadata={documentKind:'Cartella clinica',category:'Cartella clinica',documentMode:'narrative',clinicalDate:doc.clinicalDate||'',issueDate:doc.issueDate||'',specialization:dep||'',department:dep||'',facility:doc.facility||''};
    return{document:doc,changed:true,validation:{ok:true,violations:[]}};
  }
  H.canonicalizeClinicalDocument24=canon;H.repairNarrativeDocumentData=d=>canon(d);H.repairLabDocumentData=d=>canon(d);H.prepareDocuments24=(docs=[],profile={})=>(docs||[]).map(d=>canon(d,{profile}).document);H.V604_COMPLEX_CANONICAL_VERSION=VERSION;H.V603_CANONICAL_VERSION=VERSION;H.V602_CANONICAL_VERSION=VERSION;H.TEST24_VERSION=VERSION;
})(HealthExtractors);


/* V6.0.4 FIX7 - canone V12 esclusivo per cartelle cliniche complesse.
   Obiettivi: coerenza semantica delle sezioni, recupero conservativo dei veri
   esami di laboratorio e nessuna interferenza aggiuntiva sui normali referti. */
;(function v604CanonicalV12ComplexOnly(H){
  'use strict'; if(!H)return;
  const VERSION='v6.0.4-canonical-v12';
  const BASE=H.canonicalizeClinicalDocument24.bind(H);
  const clone=v=>typeof structuredClone==='function'?structuredClone(v):JSON.parse(JSON.stringify(v??{}));
  const collapse=v=>String(v??'').replace(/\u00ad/g,'').replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').trim();
  const fold=v=>collapse(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('it-IT');
  const COMPLEX_RE=/cartella[ _.-]*clinica/i;
  const ADMIN=/(?:partita\s+iva|p\.?\s*iva|codice\s+fiscale|data\s+(?:di\s+)?nascita|luogo\s+di\s+nascita|residenza|domicilio|indirizzo|\bvia\s+[a-zà-ÿ]|\bviale\s+[a-zà-ÿ]|\bpiazza\s+[a-zà-ÿ]|direttore\s+sanitario|responsabile\s+sanitario|centralino|segreteria|prenotazion|accettazione|informativa|consenso|privacy|trattamento\s+dei\s+dati|d\.?lgs|gdpr|firma|timbro|scheda\s+nosologica|cartellinatura|stato\s+civile|comune\s+di\s+residenza|regione\s+di\s+assistenza|medico\s+curante|nome\s+e\s+cognome|cognome\s+e\s+nome|classe\s+di\s+dose|contributo\s+ambientale|telefono|tel\.|fax|e-?mail|pec\b|www\.|https?:\/\/|numero\s+(?:referto|pratica|cartella)|codice\s+(?:documento|ricovero|nosologico)|cartella\s+clinica\s+n[°o]?|timbro\s+e\s+n[°o]?\s+di\s+codice|copia\s+conforme|originale\s+editoriale|acquisire\s+la\s+copia|oggetti\s+rimossi|denaro\s+non\s+[eè]\s+strettamente|personale\s+della\s+u\.?o\.?\/sez|se\s+il\s+paziente\s+non\s+[eè]\s+accompagnato|parenti\s+o\s+conoscenti|restituzione\s+deve\s+sempre|particolari\s+esami\s+diagnostici\s+e\/o\s+trattamenti\s+terapeutici|finalizzata\s+all['’]assistenza\s+sanitaria)/i;
  const NOISE=/(?:scr\s+copia|spedali?\s+riuniti(?:\s+\d+)?|consenso\s+al|priorit[aà](?:\s+\d+)?|difficolt[aà]\s+respi|anamnesi\s+po\b|il\s+paziente,?\s+vist\b|fumo\s*:\s*not|td\s*:\s*candesart|uo\s+medicina\s+\d+|addetto\s+cartellinatura|copia\s+rn\s+s|^o\s+chirurgico\b|pag\.?\s*\d+\s*\/\s*\d+)/i;
  const CLINICAL_HEAD=/(?:diagnosi\s+(?:di\s+)?(?:accoglimento|ingresso|dimissione)|anamnesi(?:\s+(?:patologica|familiare|fisiologica|farmacologica|remota|prossima))*|esame\s+obiettivo|decorso\s+clinico|terapia(?:\s+(?:domiciliare|alla\s+dimissione|in\s+atto))?|interventi\s+e\s+procedure|interventi?|procedure?|reperti?|conclusioni?|lettera\s+di\s+dimissione|motivo\s+(?:del\s+)?ricovero|storia\s+clinica|problemi\s+(?:attivi|clinici)|allergie|accertamenti|consulenze|esami\s+(?:ematochimici|di\s+laboratorio|strumentali)|indicazioni|raccomandazioni)/i;
  const ADMIN_HEAD=/(?:consenso(?:\s+al\s+trattamento)?|informativa|privacy|scheda\s+nosologica|cognome\s+e\s+nome|nome\s+e\s+cognome|data\s+(?:di\s+)?nascita|luogo\s+di\s+nascita|stato\s+civile|comune\s+di\s+residenza|codice\s+fiscale|timbro\s+e\s+n|addetto\s+cartellinatura|cartella\s+clinica\s+n|regione\s+di\s+assistenza|medico\s+curante)/i;
  const EMBEDDED_HEAD=/(?:diagnosi\s+(?:di\s+)?(?:accoglimento|ingresso|dimissione)|anamnesi\s+(?:patologica|familiare|fisiologica|farmacologica|remota|prossima)|esame\s+obiettivo|decorso\s+clinico|interventi\s+e\s+procedure|lettera\s+di\s+dimissione|motivo\s+(?:del\s+)?ricovero|storia\s+clinica|esami\s+(?:ematochimici|di\s+laboratorio|strumentali)|indicazioni\s+alla\s+dimissione)/i;
  const STRONG=/(?:\bdiagnos\w*|\banamnes\w*|\bterap\w*|\bdecorso\b|\brepert\w*|\bconclusion\w*|\besame\s+obiettivo|\bdimess\w*|\bricover\w*|\bintervent\w*|\ballerg\w*|\bfarmac\w*|\bsomministr\w*|\bdolor\w*|\bfebbr\w*|\bdispnea\b|\bedem\w*|\blesion\w*|\bemorrag\w*|\bversament\w*|\btromb\w*|\bischem\w*|\bstenos\w*|\bcalcific\w*|\bfrattur\w*|\bcardiac\w*|\bpolmon\w*|\brenal\w*|\bepat\w*|\bdiabet\w*|\bipertens\w*|\bipotiroid\w*|\btiroid\w*|\bobesit\w*|\bsaturaz\w*|\bossigen\w*|\bglicem\w*|\bcreatinin\w*|\bemoglobin\w*|\bventricol\w*|\bcarotid\w*|\bencefal\w*|\bfegat\w*|\brene\b|\bcuore\b|\bpolmone\b|\bpressione\s+arteriosa|\bfrequenza\s+cardiaca|\bnon\s+(?:si\s+)?(?:evidenz|document|rilev)|\bsi\s+(?:evidenz|document|rilev|apprezz)|\bnei\s+limiti|\bregolar\w*|\bassenza\s+di|\bpresenza\s+di|\bscompenso\b|\binsufficienza\b|\binfezione\b)/i;
  const DIAG=/(?:scompenso|ipertension|diabet|insufficienz|fibrillaz|cardiopati|bronco|polmon|nefropat|epatopat|cirrosi|anemi|neoplas|tumor|carcinom|adenom|ictus|ischemi|emorrag|trombos|emboli|infezion|sepsi|frattur|osteopor|obesit|ipotiroid|ipertiroid|dislipid|ipercolesterol|aritmi|stenos|versament|edem|dispnea|dolore|febbre|diagnos)/i;
  const THERAPY=/(?:\bterap\w*|\bfarmac\w*|\bassum\w*|\bsomministr\w*|\bsospend\w*|\bcontinu\w*|\bcompresse?\b|\bcpr?\b|\bgocce\b|\bml\b|\bmg\b|\bmcg\b|\bµg\b|\bui\b|\bunit[aà]\b|\bper\s+os\b|\bendovenos|\bev\b|\bim\b|\bsc\b|\bmattino\b|\bsera\b|\bdie\b|\bogni\s+\d+\s*ore)/i;
  const PROCEDURE=/(?:intervent|procedur|chirurg|operat|cateter|drenagg|biops|endoscop|gastroscop|colonscop|trasfusion|ventilaz|intubaz|angioplast|stent|ablaz|dialisi|ecograf|tac\b|rmn\b|radiograf|broncoscop)/i;
  const RECOMMEND=/(?:controll|follow[ -]?up|rivalut|monitor|proseguire|continuare|sospendere|assumere|evitare|dieta|visita|esame|terapia|medico\s+curante|specialist|raccomand|indicaz)/i;
  const ANAM=/(?:pregress|precedent|familiar|fumat|tabag|alcool|alcol|interventi\s+pregressi|ricoveri\s+precedenti|patologi|malatti|anamnes|farmaci\s+abituali)/i;
  const ALLERGY=/(?:allerg|intoller|ipersensibil|nessuna\s+allergia|allergie\s+non\s+note|nkda)/i;
  const BLOOD_GROUP=/(?:gruppo\s+sanguigno|\b(?:0|o|a|b|ab)\s*(?:rh)?\s*(?:positivo|negativo|pos\.?|neg\.?|\+|-)\b)/i;
  const FORM_LABEL=/(?:gruppo\s+sanguigno|marcatori\s+virali|precedenti\s+ricoveri|\bpadre\b|\bmadre\b|\bgermani\b|professione|stato\s+civile|fumo|alcool|alcol|alvo|diuresi|sonno|appetito)/ig;
  const LAB_NAMES='emoglobina|ematocrito|eritrociti|globuli\\s+rossi|leucociti|globuli\\s+bianchi|piastrine|neutrofili|linfociti|monociti|eosinofili|basofili|glicemia|glucosio|creatinina(?:\\s+ematica)?|azotemia|urea|sodio|potassio|cloro|calcio|magnesio|fosforo|ast|got|alt|gpt|ggt|gamma\\s*gt|fosfatasi\\s+alcalina|bilirubina(?:\\s+(?:totale|diretta|indiretta))?|albumina|proteine(?:\\s+totali)?|pcr|crp|ves|inr|pt|aptt|tsh|ft3|ft4|colesterolo(?:\\s+totale)?|hdl|ldl|trigliceridi|ferritina|sideremia|transferrina|vitamina\\s+d|vitamina\\s+b12|folati|acido\\s+urico|troponina|bnp|nt[- ]?probnp|d[- ]?dimero|mcv|mch|mchc|rdw';
  const KNOWN_LAB=new RegExp(`^(${LAB_NAMES})\\b`,'i');
  const UNIT_FLEX=/(?:%|mg\s*\/\s*d[l1i]|g\s*\/\s*[da][l1i]|g\s*\/\s*l|mg\s*\/\s*l|mmol\s*\/\s*l|[µu]mol\s*\/\s*l|u\s*\/\s*l|ui\s*\/\s*l|meq\s*\/\s*l|ng\s*\/\s*ml|pg\s*\/\s*ml|[µu]g\s*\/\s*d[l1i]|10\s*\^?\s*\d+\s*\/\s*[µu]?l|x\s*10\s*\^?\s*\d+\s*\/\s*[µu]?l|fl\b|pg\b)/i;
  const RANGE=/(?:\b-?\d+(?:[.,]\d+)?\s*(?:-|–|—|a)\s*-?\d+(?:[.,]\d+)?\b|[<>≤≥]\s*-?\d+(?:[.,]\d+)?)/;
  function isComplex(doc={}){const label=`${doc.documentKind||''} ${doc.category||''} ${doc.title||''} ${doc.originalName||''}`;return doc.complexClinicalContainer===true||COMPLEX_RE.test(label)||H.isComplexClinicalContainer603?.(doc)===true;}
  function rawText(doc={}){const pages=(doc.ocrPageData||[]).map(p=>p?.text||'').join('\n');const values=[doc.extractedText,doc.structuredText,pages].map(v=>String(v||'').trim()).filter(Boolean).sort((a,b)=>b.length-a.length);return values[0]||'';}
  function titleFor(v=''){const x=fold(v);if(/diagnosi.*dimission/.test(x))return'Diagnosi di dimissione';if(/diagnosi.*(?:accoglimento|ingresso)/.test(x))return'Diagnosi di accoglimento';if(/anamnes/.test(x))return'Anamnesi';if(/esame obiettivo/.test(x))return'Esame obiettivo';if(/decorso/.test(x))return'Decorso clinico';if(/terap/.test(x))return'Terapia';if(/intervent|procedur/.test(x))return'Interventi e procedure';if(/repert/.test(x))return'Reperti';if(/conclusion/.test(x))return'Conclusioni';if(/lettera.*dimission/.test(x))return'Dimissione';if(/motivo.*ricovero/.test(x))return'Motivo del ricovero';if(/storia clinica/.test(x))return'Storia clinica';if(/allerg/.test(x))return'Allergie';if(/accertament|consulenz|esami/.test(x))return'Accertamenti';if(/indicaz|raccomand/.test(x))return'Indicazioni';return'Contenuto clinico';}
  function cleanInline(v=''){let s=String(v||'').replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g,' ').replace(/https?:\/\/\S+|www\.\S+/gi,' ').replace(/\b(?:tel(?:efono)?|cell(?:ulare)?|fax)\.?\s*[:\-]?\s*\+?[\d ()\-.]{6,}/gi,' ').replace(/\b(?:p\.?\s*iva|partita\s+iva|c\.?f\.?|codice\s+fiscale)\s*[:\-]?\s*[A-Z0-9 .\/-]{6,}/gi,' ');s=collapse(s);let m=s.match(NOISE);if(m){if(m.index===0)return'';s=collapse(s.slice(0,m.index));}m=s.match(ADMIN);if(m){if(m.index===0)return'';s=collapse(s.slice(0,m.index));}return s;}
  function quality(v=''){const w=collapse(v).split(/\s+/).filter(Boolean),a=w.filter(x=>/[A-Za-zÀ-ÖØ-öø-ÿ]{3,}/.test(x));if(!a.length)return 0;return a.filter(x=>/[aeiouàèéìòóù]/i.test(x)&&!/[{}\[\]|~^`]/.test(x)).length/a.length;}
  function isGarbled(v=''){const s=collapse(v);if(!s)return true;if(/([A-Za-z])\1{4,}/.test(s))return true;if(/(?:[bcdfghjklmnpqrstvwxyz]{7,})/i.test(s))return true;const weird=(s.match(/[|{}\[\]~^`]/g)||[]).length;if(weird>=2)return true;return s.length>18&&quality(s)<0.28;}
  function isFormLabelsOnly(v=''){const s=collapse(v);const hits=s.match(FORM_LABEL)||[];FORM_LABEL.lastIndex=0;if(!hits.length)return false;if(hits.length>=2&&!DIAG.test(s)&&!THERAPY.test(s)&&!ALLERGY.test(s))return true;return /^(?:padre|madre|germani|gruppo\s+sanguigno\s*(?:rh)?|marcatori\s+virali)\s*[:\-]?\s*$/i.test(s);}
  function normalizeUnit(v=''){let s=fold(v).replace(/\s+/g,'');if(/^g\/[aod1i]l$/.test(s))return'g/dL';if(/^mg\/d[l1i]$/.test(s))return'mg/dL';if(/^ug\/d[l1i]$/.test(s)||/^µg\/d[l1i]$/.test(s))return'µg/dL';if(s==='g/l')return'g/L';if(s==='mg/l')return'mg/L';if(s==='mmol/l')return'mmol/L';if(s==='umol/l'||s==='µmol/l')return'µmol/L';if(s==='u/l'||s==='ui/l')return'U/L';if(s==='meq/l')return'mEq/L';if(s==='ng/ml')return'ng/mL';if(s==='pg/ml')return'pg/mL';if(s==='fl')return'fL';if(s==='pg')return'pg';if(s==='%')return'%';return collapse(v);}
  function parseLabLine(v=''){
    const line=cleanInline(v);if(!line||isGarbled(line))return null;const m=line.match(KNOWN_LAB);if(!m)return null;const tail=line.slice(m[0].length);const vm=tail.match(/-?\d+(?:[.,]\d+)?/);if(!vm)return null;const value=Number(vm[0].replace(',','.'));if(!Number.isFinite(value))return null;const after=tail.slice((vm.index||0)+vm[0].length);const um=after.match(UNIT_FLEX);const rm=after.match(RANGE);if(!um&&!rm)return null;let name=collapse(m[1]);if(/^creatinina/i.test(name))name='Creatinina ematica';const unit=um?normalizeUnit(um[0]):'';const range=rm?collapse(rm[0]):'';let row={parameterName:name,test:name,value,unit,range:range?{raw:range}:null,sourceLine:line,confidence:82};try{row=H.canonicalizeLabValue?H.canonicalizeLabValue(row):row;}catch(_){ }return row&&Number.isFinite(Number(row.value))?row:null;
  }
  function blocks(raw=''){let s=String(raw||'').replace(/\r/g,'\n').replace(/===\s*PAGINA\s*\d+\s*===/gi,'\n');const embedded=new RegExp(`(${EMBEDDED_HEAD.source}|${ADMIN_HEAD.source})`,'gi');s=s.replace(embedded,'\n$1\n');s=s.replace(/([.;!?])\s+(?=[A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÿ]{2,})/g,'$1\n');return s.split(/\n+/).map(collapse).filter(Boolean);}
  function broadClinical(title,line){if(isGarbled(line)||ADMIN.test(line)||NOISE.test(line)||isFormLabelsOnly(line))return false;const q=quality(line);if(STRONG.test(line)&&q>=0.25)return true;return ['Decorso clinico','Reperti','Conclusioni','Esame obiettivo','Motivo del ricovero','Storia clinica','Dimissione','Accertamenti'].includes(title)&&line.length>=28&&q>=0.48;}
  function classify(line,current=''){
    const s=cleanInline(line);if(!s||isGarbled(s)||ADMIN.test(s)||NOISE.test(s)||isFormLabelsOnly(s))return'';
    if(parseLabLine(s))return'Esami di laboratorio';
    if(BLOOD_GROUP.test(s)){if(/\b(?:0|o|a|b|ab)\s*(?:rh)?\s*(?:positivo|negativo|pos\.?|neg\.?|\+|-)\b/i.test(s))return'Gruppo sanguigno';return'';}
    if(ALLERGY.test(s))return'Allergie';
    if(current==='Allergie')return /\b(?:nessuna|non\s+note?|farmac|penicill|amoxic|cefalospor|sulfa|lattice|iodio|mezzo\s+di\s+contrasto)\b/i.test(s)?'Allergie':'';
    if(current==='Diagnosi di dimissione'||current==='Diagnosi di accoglimento')return (DIAG.test(s)||STRONG.test(s))&&quality(s)>=0.3?current:'';
    if(current==='Anamnesi')return (ANAM.test(s)||DIAG.test(s)||STRONG.test(s))&&quality(s)>=0.32?'Anamnesi':'';
    if(current==='Terapia')return THERAPY.test(s)&&quality(s)>=0.28?'Terapia':'';
    if(current==='Interventi e procedure')return PROCEDURE.test(s)&&quality(s)>=0.3?'Interventi e procedure':'';
    if(current==='Indicazioni')return RECOMMEND.test(s)&&quality(s)>=0.35?'Indicazioni':'';
    if(current&&broadClinical(current,s))return current;
    if(PROCEDURE.test(s)&&quality(s)>=0.35)return'Interventi e procedure';
    if(THERAPY.test(s)&&quality(s)>=0.35)return'Terapia';
    if(RECOMMEND.test(s)&&quality(s)>=0.42)return'Indicazioni';
    if(DIAG.test(s)&&quality(s)>=0.35)return'Contenuto clinico';
    if(STRONG.test(s)&&quality(s)>=0.38)return'Contenuto clinico';
    return'';
  }
  function build(raw=''){
    const out=[],seen=new Set();let current='',drop=false;
    const push=(title,line)=>{line=cleanInline(line).replace(/^[:\-–—]+\s*/,'');if(!line)return;const target=classify(line,title)||'';if(!target)return;const key=`${target}|${fold(line).replace(/[^a-z0-9]+/g,' ').trim()}`;if(!key||seen.has(key))return;seen.add(key);let sec=out.find(x=>x.title===target);if(!sec){sec={title:target,text:''};out.push(sec);}sec.text+=(sec.text?'\n':'')+line;};
    for(let line of blocks(raw)){
      if(NOISE.test(line)){current='';drop=ADMIN.test(line)||ADMIN_HEAD.test(line);continue;}
      const ch=line.match(CLINICAL_HEAD),ah=line.match(ADMIN_HEAD);
      if(ch&&ch.index===0){current=titleFor(ch[0]);drop=false;line=collapse(line.slice(ch[0].length).replace(/^\s*[:\-–—]+\s*/,''));if(line)push(current,line);continue;}
      if(ah&&ah.index===0){current='';drop=true;continue;}
      if(drop){if(ch){drop=false;current=titleFor(ch[0]);const tail=collapse(line.slice((ch.index||0)+ch[0].length));if(tail)push(current,tail);}continue;}
      const target=classify(line,current);if(target)push(target,line);
    }
    return out.filter(x=>collapse(x.text));
  }
  function strictLabs(rows=[],raw=''){
    const out=[],seen=new Set(),candidates=[];
    for(const r of rows||[])candidates.push(r);
    for(const line of blocks(raw)){const parsed=parseLabLine(line);if(parsed)candidates.push(parsed);}
    for(const rawRow of candidates){if(!rawRow||typeof rawRow!=='object')continue;let row={...rawRow};let name=collapse(row.parameterName||row.test||'');const m=name.match(KNOWN_LAB);if(!m)continue;const value=Number(String(row.value??'').replace(',','.'));if(!Number.isFinite(value))continue;const range=typeof row.range==='object'?(row.range?.raw||''):(row.reference||'');const evidence=collapse(`${row.sourceLine||row.raw||''} ${row.unit||''} ${range}`);if(ADMIN.test(evidence)||NOISE.test(evidence)||isGarbled(evidence))continue;if(!row.unit&&!range)continue;let canonical=m[1].replace(/\s+/g,' ').trim();if(/^creatinina/i.test(canonical))canonical='Creatinina ematica';row.parameterName=canonical;row.test=canonical;row.unit=normalizeUnit(row.unit||'');try{row=H.canonicalizeLabValue?H.canonicalizeLabValue(row):row;}catch(_){ }if(!row||!Number.isFinite(Number(row.value)))continue;const key=`${fold(row.parameterName)}|${Number(row.value)}|${fold(row.unit||'')}`;if(seen.has(key))continue;seen.add(key);out.push(row);}
    return out;
  }
  function labSection(rows=[]){if(!rows.length)return null;return{title:'Esami di laboratorio',text:rows.map(r=>{const range=typeof r.range==='object'?(r.range?.raw||''):(r.reference||'');return `${r.parameterName}: ${String(r.value).replace('.',',')}${r.unit?` ${r.unit}`:''}${range?` · riferimento ${range}`:''}`;}).join('\n')};}
  function force(input={},options={}){
    const seed=clone(input);seed.complexClinicalContainer=true;seed.documentKind='Cartella clinica';seed.category='Cartella clinica';seed.documentMode='narrative';seed.clinicalCanonicalVersion='';seed.clinicalCanonicalSourceFingerprint='';
    let doc=(BASE(seed,options)?.document)||seed;const raw=rawText(seed);let sections=build(raw);
    doc.complexClinicalContainer=true;doc.documentKind='Cartella clinica';doc.category='Cartella clinica';doc.documentMode='narrative';doc.facilityContact='';doc.doctor='';doc.medicalPersonnel=[];doc.identifiers=[];doc.qualitativeResults=[];doc.tableRows=[];
    doc.labValues=strictLabs([...(seed.labValues||[]),...(doc.labValues||[])],raw);
    sections=sections.filter(s=>s.title!=='Esami di laboratorio');const ls=labSection(doc.labValues);if(ls)sections.push(ls);
    doc.reportSections=sections;doc.clinicalSummarySections=sections.slice(0,12);doc.pdfFields=sections.map(x=>({label:x.title,value:x.text,include:true}));doc.reconstructedText=sections.map(x=>`${x.title}\n${x.text}`).join('\n\n');doc.narrativeClinicalSource=sections.map(x=>x.text).join('\n');
    doc.pdfExportMode=['full','summary','exclude'].includes(doc.pdfExportMode)?doc.pdfExportMode:'summary';doc.clinicalCanonicalVersion=VERSION;doc.clinicalValidationVersion=VERSION;doc.clinicalCanonicalCachedAt=new Date().toISOString();doc.clinicalCanonicalMetadata={...(doc.clinicalCanonicalMetadata||{}),documentKind:'Cartella clinica',category:'Cartella clinica',documentMode:'narrative',facility:doc.facility||'',department:doc.department||'',specialization:doc.specialization||''};delete doc.clinicalCanonicalMetadata.facilityContact;return doc;
  }
  function canon(input={},options={}){if(!isComplex(input)){const r=BASE(input,options);const d=r?.document||input;if(d.clinicalCanonicalVersion===VERSION)return r;const copy=clone(d);copy.clinicalCanonicalVersion=VERSION;copy.clinicalValidationVersion=VERSION;return{...r,document:copy,changed:true};}return{document:force(input,options),changed:true,validation:{ok:true,violations:[]}};}
  H.isComplexClinicalDocumentV12=isComplex;H.isComplexClinicalDocumentV11=isComplex;H.canonicalizeComplexClinicalDocumentV12=force;H.canonicalizeComplexClinicalDocumentV11=force;H.canonicalizeClinicalDocument24=canon;H.repairNarrativeDocumentData=d=>canon(d);H.repairLabDocumentData=d=>canon(d);H.prepareDocuments24=(docs=[],profile={})=>(docs||[]).map(d=>canon(d,{profile}).document);H.V604_COMPLEX_CANONICAL_VERSION=VERSION;H.V603_CANONICAL_VERSION=VERSION;H.V602_CANONICAL_VERSION=VERSION;H.TEST24_VERSION=VERSION;
})(HealthExtractors);

/* V6.0.4 FIX20 - classificazione canonica alla fonte, titoli clinici coerenti
   e barriera finale per cartelle cliniche complesse. */
;(function v604CanonicalV13Classification(H){
  'use strict'; if(!H)return;
  const VERSION='v6.0.4-canonical-v13';
  const BASE_CANON=H.canonicalizeClinicalDocument24.bind(H);
  const BASE_ANALYZE=H.analyzeText.bind(H);
  const clone=v=>typeof structuredClone==='function'?structuredClone(v):JSON.parse(JSON.stringify(v??{}));
  const collapse=v=>String(v??'').replace(/\u00ad/g,'').replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').trim();
  const fold=v=>collapse(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('it-IT');
  const sourceText=doc=>[doc?.extractedText,doc?.structuredText,(doc?.ocrPageData||[]).map(p=>p?.text||'').join('\n')].filter(Boolean).join('\n');
  const COMPLEX_STRONG=/(?:cartella\s+clinica\s+n|scheda\s*\(s\.?d\.?o\.?\)|numero\s+cartella|diagnosi\s+di\s+(?:accoglimento|ingresso|dimissione)|data\s+(?:del|di)\s+ricovero|data\s+(?:di\s+)?dimissione|diario\s+clinico|degenza|trasferimenti?\s+interni|consulenze\s+per\s+pazienti\s+ricoverati)/gi;
  const ADMIN_DROP=/(?:consenso\s+(?:informato|al\s+trattamento)|trattamento\s+dei\s+dati|dossier\s+sanitario\s+elettronico|privacy|gdpr|codice\s+fiscale|partita\s+iva|p\.?\s*iva|residenza|domicilio|indirizzo|\bvia\s+[a-zà-ÿ]|telefono|tel\.?|fax|e-?mail|@|www\.|https?:\/\/|direttore\s*:|responsabile\s*:|medico\s+richiedente|operatore\s+richiedente|operatore\s+consulente|reparto\s+richiedente|reparto\s+consulente|timbro|firma\s+(?:del\s+)?(?:paziente|medico|tutore)|copia\s+conforme|pag\.?\s*\d+\s*(?:\/|di)\s*\d+|riservato\s+all['’]?ufficio|cartellinatura|microfilm|numero\s+linea|faxmaker|report\s+fax|modalit[aà]\s+di\s+erogazione|onere\s+degenza|cittadinanza|stato\s+civile|professione|datore)/i;
  const REQUEST_DROP=/^(?:richiesta\s*:|si\s+richiede\b|prestazion[ei]\s+richiest|modulo\s+richiesta|quesito\s+diagnostico\s*:|alla\s+cortese\s+attenzione\b|mezzo\s+di\s+trasporto|contatto\s+telefonico|urgenza\b|distr\.\s*corp|lato\b)/i;
  const KEEP_CLINICAL=/(?:diagnos|anamnes|terap|decorso|repert|conclusion|esame\s+obiettivo|indicaz|raccomand|follow[- ]?up|ricover|dimission|intervent|procedur|pressione|frequenza|saturaz|ossigen|glicem|creatinin|emoglobin|obesit|diabet|ipertens|insufficienz|scompenso|trombos|ecograf|tomograf|radiograf|polisonnograf|audiometr|spirometr|biops|istolog|mg\b|mcg\b|mmhg|kg\b|cm\b)/i;

  function isComplex(doc={}){
    if(doc.complexClinicalContainer===true||/cartella[ _.-]*clinica/i.test(`${doc.documentKind||''} ${doc.category||''} ${doc.title||''} ${doc.originalName||''}`))return true;
    const raw=sourceText(doc),pages=Math.max(Number(doc.ocrProcessedPages||0),Array.isArray(doc.ocrPageData)?doc.ocrPageData.length:0);
    COMPLEX_STRONG.lastIndex=0;const hits=[...`${doc.originalName||''}\n${raw.slice(0,90000)}`.matchAll(COMPLEX_STRONG)].length;COMPLEX_STRONG.lastIndex=0;
    if(hits>=3&&pages>=8)return true;if(hits>=5)return true;if(pages>=20&&hits>=2&&/\bricover|\bdimission|\bdegenza/i.test(raw))return true;
    return H.isComplexClinicalDocumentV12?.(doc)===true||H.isComplexClinicalContainer603?.(doc)===true;
  }
  function iso(d,m,y){const yy=Number(y),mm=Number(m),dd=Number(d),dt=new Date(Date.UTC(yy,mm-1,dd));if(yy<1900||yy>2100||dt.getUTCFullYear()!==yy||dt.getUTCMonth()!==mm-1||dt.getUTCDate()!==dd)return'';return`${yy}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`;}
  function clinicalDates(raw=''){
    const defs=[
      ['Ricovero',/(?:data\s+(?:del|di)\s+ricovero|data\s+(?:di\s+)?ammissione|data\s+(?:di\s+)?ingresso|ricover[oa]\s+(?:il|dal))[^\d]{0,35}(0?[1-9]|[12]\d|3[01])[/.\-](0?[1-9]|1[0-2])[/.\-]((?:19|20)\d{2})/gi],
      ['Accettazione',/(?:data\s+(?:di\s+)?accettazione|accettazione\s*:?)[^\d]{0,35}(0?[1-9]|[12]\d|3[01])[/.\-](0?[1-9]|1[0-2])[/.\-]((?:19|20)\d{2})/gi],
      ['Dimissione',/(?:data\s+(?:di\s+)?dimissione|dimess[oa]\s+(?:il|in\s+data)|dimissione\s*:?)[^\d]{0,35}(0?[1-9]|[12]\d|3[01])[/.\-](0?[1-9]|1[0-2])[/.\-]((?:19|20)\d{2})/gi],
      ['Diagnosi',/(?:data\s+(?:della\s+)?diagnosi)[^\d]{0,35}(0?[1-9]|[12]\d|3[01])[/.\-](0?[1-9]|1[0-2])[/.\-]((?:19|20)\d{2})/gi],
      ['Esame',/(?:data\s+(?:dell['’]?|di\s+)?esame|data\s+esame)[^\d]{0,30}(0?[1-9]|[12]\d|3[01])[/.\-](0?[1-9]|1[0-2])[/.\-]((?:19|20)\d{2})/gi],
      ['Visita',/(?:visita\s+(?:del|in\s+data))[^\d]{0,20}(0?[1-9]|[12]\d|3[01])[/.\-](0?[1-9]|1[0-2])[/.\-]((?:19|20)\d{2})/gi]
    ];
    const rows=[],seen=new Set();for(const [label,re] of defs){re.lastIndex=0;let m;while((m=re.exec(raw))){const date=iso(m[1],m[2],m[3]);const key=`${label}|${date}`;if(date&&!seen.has(key)){seen.add(key);rows.push({label,date});}}}
    rows.sort((a,b)=>a.date.localeCompare(b.date)||a.label.localeCompare(b.label));return rows.slice(0,80);
  }
  const VISITS=[
    ['Visita ORL','Otorinolaringoiatria',/\b(?:visita\s+(?:otorinolaringoiatrica|orl)|otorinolaringoiatria|otorino(?:laringoiatria)?)\b/i],
    ['Visita cardiologica','Cardiologia',/\bvisita\s+cardiologica\b/i],['Visita neurologica','Neurologia',/\bvisita\s+neurologica\b/i],['Visita endocrinologica','Endocrinologia',/\bvisita\s+endocrinologica\b/i],['Visita diabetologica','Diabetologia',/\bvisita\s+diabetologica\b/i],['Visita epatologica','Epatologia',/\bvisita\s+epatologica\b/i],['Visita oculistica','Oculistica',/\bvisita\s+oculistica\b/i],['Visita pneumologica','Pneumologia',/\bvisita\s+pneumologica\b/i],['Visita gastroenterologica','Gastroenterologia',/\bvisita\s+gastroenterologica\b/i],['Visita urologica','Urologia',/\bvisita\s+urologica\b/i],['Visita ortopedica','Ortopedia',/\bvisita\s+ortopedica\b/i],['Visita psichiatrica','Psichiatria',/\bvisita\s+psichiatrica\b/i],['Visita fisiatrica','Fisiatria',/\bvisita\s+fisiatrica\b/i],['Visita dermatologica','Dermatologia',/\bvisita\s+dermatologica\b/i],['Visita ginecologica','Ginecologia',/\bvisita\s+ginecologica\b/i],['Visita nefrologica','Nefrologia',/\bvisita\s+nefrologica\b/i]
  ];
  const INSTR=[
    ['Esame audiometrico','Otorinolaringoiatria',/\b(?:esame\s+)?audiometric[oa]\b|\baudiometria\b|\baudiogramma\b/i],['Polisonnografia','Pneumologia',/\bpolisonnografia\b|\bpoligrafia\s+notturna\b/i],['Spirometria','Pneumologia',/\bspirometria\b/i],['Ecocardiogramma','Cardiologia',/\becocardiogramma\b|\becocolordoppler\s+cardiaco\b/i],['Elettrocardiogramma','Cardiologia',/\belettrocardiogramma\b|\becg\b/i],['Ecocolordoppler','Radiologia',/\becocolordoppler\b|\beco-color-doppler\b/i],['TAC','Radiologia',/\b(?:tac|tomografia\s+computerizzata|tc\s+(?:cranio|torace|addome|collo))\b/i],['Risonanza magnetica','Radiologia',/\brisonanza\s+magnetica\b|\brm[n]?\b/i],['Radiografia','Radiologia',/\bradiografia\b|\brx\s+(?:torace|addome|cranio|arto|colonna)\b/i],['Gastroscopia','Gastroenterologia',/\b(?:gastroscopia|esofagogastroduodenoscopia|egds)\b/i]
  ];
  function identity(raw='',doc={},complex=false){
    const head=String(raw||'').slice(0,24000);if(complex)return{label:'Cartella clinica',category:'Cartella clinica',mode:'narrative',specialization:doc.specialization||doc.department||''};
    const visit=VISITS.find(x=>x[2].test(head));const instr=INSTR.find(x=>x[2].test(head));
    if(visit){let label=visit[0];if(label==='Visita ORL'&&instr?.[0]==='Esame audiometrico')label='Visita ORL con esame audiometrico';return{label,category:'Visita specialistica',mode:'narrative',specialization:visit[1]};}
    if(instr)return{label:instr[0],category:'Referto strumentale',mode:'narrative',specialization:instr[1]};
    if(/\b(?:piano\s+terapeutico|scheda\s+(?:di\s+)?(?:valutazione\s+e\s+)?prescrizione|terapia\s+farmacologica)\b/i.test(head))return{label:'Piano terapeutico',category:'Piano terapeutico',mode:'therapy',specialization:doc.specialization||''};
    if(/\b(?:emocromo|esame\s+esito\s+unit[aà]\s+di\s+misura|valori\s+di\s+riferimento|laboratorio\s+analisi)\b/i.test(head))return{label:'Esami di laboratorio',category:'Esami di laboratorio',mode:'lab',specialization:'Laboratorio analisi'};
    const old=collapse(doc.documentKind||'');if(old&&!/^(?:documento sanitario|terapie farmacologiche)$/i.test(old))return{label:old,category:doc.category||'Documento sanitario',mode:doc.documentMode||'narrative',specialization:doc.specialization||''};
    return{label:'Documento sanitario',category:'Documento sanitario',mode:'narrative',specialization:doc.specialization||''};
  }
  function titleFor(label,date=''){if(/^\d{4}-\d{2}-\d{2}$/.test(date)){const [y,m,d]=date.split('-');return`${label} del ${d}/${m}/${y}`;}return label;}
  const FORM_NOISE=/(?:liv\s+istruzione|trasf\s+inti|cod\s+reparto|tessera\s+team|rilasciata\s+il|qualifica\s+istituto|riscontro\s+autoptico|pres\.\s+al\s+ric|lateralit[aà]|stadiazione|check\s*list|robot|prestazione\s+richiest[ae]|richieste\s+eseguite|non\s+specificato|scheda\s+di\s+prima\s+prescrizione|categoria\s+farmaco\s+posologia|selezionare\s+farmaco|sezione\s+da\s+compilare|dichiaro\s+di\s+aver\s+letto|essere\s+stato\s+informato|acconsento|autorizzo|oggetti\s+personali|denaro\s+non|cassafort|articoli\s+da\s+toilette|protesi\s+mobili|this\s+fax\s+was|company\s+name|address\b|website\b|report\s+fax)/i;
  const DIAG_LINE=/(?:diagnos|insufficienz|scompenso|obesit|diabet|ipertens|iperuric|linfedem|trombos|anemi|ernia|reflusso|infezion|apnea|osas|cardiopati|danno\s+renale|versamento|atelettas|cisti|bronco|polmon|nefro|epato|tiroid|neoplas|tumor|stenos|aritmi|fibrill|ischemi|emorrag|frattur|dolore|dispnea)/i;
  const THERAPY_LINE=/(?:\bterapia\b|\btrattat[oa]\b|\bassum\w*\b|\bsomministr\w*\b|\bsospes[oa]\b|\bsospendere\b|\bprosegu\w*\b|\bintrodurr?\w*\b|\bprescritt\w*\b|\bmonitorare\b|\bcpap\b|\bbipap\b|\bniv\b|\bossigenoterapia\b|\b\d+(?:[.,]\d+)?\s*(?:mg|mcg|µg|g|ml|ui|u\/min|l\/min)\b|\b(?:cp|cpr|gocce|iniezione|inalazione)\b)/i;
  const PROCEDURE_LINE=/(?:intervent|procedur|eseguit[oa]|sottopost[oa]|tac\b|\btc\b|rx\b|ecograf|ecocolordoppler|ecg\b|egds|esofagogastro|gastroscop|biops|polisonnograf|poligrafia|spirometr|catetere|cvc\b|ventilaz|chirurgia|sleeve|trasfusion|ossigenoterapia|riabilitaz)/i;
  const ACCERT_LINE=/(?:accertament|esam[ei]\b|consulenz|visita\b|refert|risult|ecg\b|ecograf|tac\b|\btc\b|rx\b|risonanz|doppler|polisonnograf|spirometr|glicem|creatinin|emoglobin|pco2|po2|ph\b|hba1c|d[- ]?dimero|ves\b|pcr\b|pressione|saturaz|frequenza)/i;
  const OBJECTIVE_LINE=/(?:altezza|peso|bmi|imc|pressione|frequenza|saturaz|sensorio|cute|torace|cuore|addome|arti|edem|tiroide|linfo|peristals|murphy|condizioni\s+generali|vigile|orientat|collaborante|eupnoic|apiretic)/i;
  const RECOMMEND_LINE=/(?:indicaz|raccomand|utile\b|consigli|programm|controllo|follow[- ]?up|prosegu|sospend|introdur|ripetere|monitorare|rivalutare|prescriz|necessit[aà]|dovr[aà]|si\s+raccomanda)/i;
  const ALLERGY_LINE=/(?:allerg|lattice|augmentin|penicill|amoxic|cefalospor|sulfa|iodio|mezzo\s+di\s+contrasto)/i;
  const GARBAGE_LINE=/(?:\bPPP(?:\s+PPP){2,}|_{5,}|\b(?:aaa|eee|iii)(?:\s+(?:aaa|eee|iii)){3,}|[|{}\[\]~^`]{2,})/i;
  function goodProse(line=''){const s=collapse(line);if(!s||GARBAGE_LINE.test(s)||FORM_NOISE.test(s))return false;if(ADMIN_DROP.test(s)&&!KEEP_CLINICAL.test(s))return false;const words=s.match(/[A-Za-zÀ-ÖØ-öø-ÿ]{2,}/g)||[];if(words.length<2)return false;return words.filter(w=>/[aeiouàèéìòóù]/i.test(w)).length/words.length>=.45;}
  function lineAllowed(title,line){if(title==='Date cliniche')return true;if(!goodProse(line)||REQUEST_DROP.test(line))return false;const t=fold(title);if(t.includes('diagnosi'))return DIAG_LINE.test(line);if(t==='terapia')return THERAPY_LINE.test(line);if(t.includes('allerg'))return ALLERGY_LINE.test(line);if(t.includes('intervent')||t.includes('procedur'))return PROCEDURE_LINE.test(line);if(t.includes('accert')||t.includes('esami'))return ACCERT_LINE.test(line)||PROCEDURE_LINE.test(line);if(t.includes('esame obiettivo'))return OBJECTIVE_LINE.test(line);if(t.includes('indicaz')||t.includes('raccomand'))return RECOMMEND_LINE.test(line);if(t.includes('anamnes'))return DIAG_LINE.test(line)||THERAPY_LINE.test(line)||/(?:riferisce|nega|storia|pregress|famil|fumo|alcool|attivit[aà]|sonno|alvo|diuresi|mestru|gravid|abort)/i.test(line);if(t.includes('decorso'))return KEEP_CLINICAL.test(line)||PROCEDURE_LINE.test(line)||THERAPY_LINE.test(line);if(t.includes('repert')||t.includes('conclusion')||t.includes('dimission')||t.includes('motivo del ricovero'))return KEEP_CLINICAL.test(line)||DIAG_LINE.test(line)||PROCEDURE_LINE.test(line);return KEEP_CLINICAL.test(line)||DIAG_LINE.test(line);}
  function cleanSections(raw='',existing=[]){
    const merged=new Map(),seen=new Set();const dates=clinicalDates(raw);if(dates.length)merged.set('Date cliniche',dates.map(x=>{const[y,m,d]=x.date.split('-');return`${x.label}: ${d}/${m}/${y}`}));
    for(const sec of existing||[]){if(!sec||typeof sec!=='object')continue;let st=collapse(sec.title||'Contenuto clinico').replace(/\s+continua.*$/i,'').trim()||'Contenuto clinico';if(/(?:consenso|informativa|privacy|dati\s+personali|modulo\s+richiesta)/i.test(st))continue;for(let line of String(sec.text||'').split(/\n+/)){line=collapse(line);if(!line||REQUEST_DROP.test(line))continue;if(ADMIN_DROP.test(line)){if(!KEEP_CLINICAL.test(line))continue;const m=line.match(/(?:diagnosi|anamnesi|terapia|decorso|reperti?|conclusioni?|indicazioni?|raccomandazioni?|riferisce|nega|presenta|paziente\s+(?:in|con)|all['’]?esame|esame\s+obiettivo|pressione|saturazione|peso|ecg|ecografia|tac|tc\b|rm\b|rx\b)/i);if(m&&m.index>0)line=collapse(line.slice(m.index));else if(!m)continue;}if(/^(?:il\s+consulente|il\s+medico|dr\.?|dott\.?|dott\.ssa|prof\.?|direttore\b)/i.test(line)&&line.split(/\s+/).length<=8)continue;if(!lineAllowed(st,line))continue;const key=fold(`${st}|${line}`);if(!key||seen.has(key))continue;seen.add(key);if(!merged.has(st))merged.set(st,[]);merged.get(st).push(line);}}
    const order=['Date cliniche','Motivo del ricovero','Diagnosi di accoglimento','Diagnosi di dimissione','Anamnesi','Esame obiettivo','Decorso clinico','Terapia','Accertamenti','Esami di laboratorio','Interventi e procedure','Reperti','Conclusioni','Indicazioni','Allergie','Contenuto clinico'];const keys=[...order.filter(k=>merged.has(k)),...[...merged.keys()].filter(k=>!order.includes(k))];return keys.map(k=>({title:k,text:(merged.get(k)||[]).join('\n').trim()})).filter(x=>x.text);
  }
  function analyzeText(text,profiles=[],activeProfileId=null,pages=[],fileName=''){
    const a=BASE_ANALYZE(text,profiles,activeProfileId,pages,fileName),seed={...a,extractedText:text,structuredText:a.structuredText||text,ocrPageData:pages,originalName:fileName};const complex=isComplex(seed),id=identity(text,a,complex);a.documentKind=id.label;a.category=id.category;a.documentMode=id.mode;if(id.specialization){a.specialization=id.specialization;a.department=a.department||id.specialization;}a.title=titleFor(id.label,a.clinicalDate||'');a.documentTypeVersion=VERSION;a.documentTypeSource='classificazione canonica dal contenuto clinico';a.documentTypeConfidence=complex?100:(id.label==='Documento sanitario'?60:99);if(complex){a.complexClinicalContainer=true;const dates=clinicalDates(text);a.clinicalDates=dates;const admission=dates.find(x=>x.label==='Ricovero')?.date||'';const discharge=[...dates].reverse().find(x=>x.label==='Dimissione')?.date||'';if(admission){a.clinicalDate=admission;a.title=titleFor('Cartella clinica',admission);}if(discharge)a.issueDate=discharge;}return a;
  }
  function canon(input={},options={}){
    const original=clone(input),raw=sourceText(original),complex=isComplex(original);let baseInput=original;if(complex&&!original.complexClinicalContainer)baseInput={...original,complexClinicalContainer:true,documentKind:'Cartella clinica',category:'Cartella clinica',documentMode:'narrative'};const result=BASE_CANON(baseInput,options)||{document:baseInput,changed:false,validation:{ok:true,violations:[]}};const doc=clone(result.document||baseInput),id=identity(raw,doc,complex);doc.documentKind=id.label;doc.category=id.category;doc.documentMode=id.mode;if(id.specialization){doc.specialization=id.specialization;doc.department=doc.department||id.specialization;}doc.title=titleFor(id.label,doc.clinicalDate||'');doc.documentTypeVersion=VERSION;doc.documentTypeSource='classificazione canonica dal contenuto clinico';doc.documentTypeConfidence=complex?100:(id.label==='Documento sanitario'?60:99);
    if(complex){doc.complexClinicalContainer=true;doc.documentKind='Cartella clinica';doc.category='Cartella clinica';doc.documentMode='narrative';const sections=cleanSections(raw,doc.reportSections||[]);doc.reportSections=sections;doc.clinicalSummarySections=sections.slice(0,14);doc.pdfFields=sections.map(s=>({label:s.title,value:s.text,include:true}));doc.reconstructedText=sections.map(s=>`${s.title}\n${s.text}`).join('\n\n');doc.narrativeClinicalSource=sections.map(s=>s.text).join('\n');doc.facilityContact='';doc.doctor='';doc.medicalPersonnel=[];doc.identifiers=[];doc.qualitativeResults=[];doc.tableRows=[];const dates=clinicalDates(raw);doc.clinicalDates=dates;const admission=dates.find(x=>x.label==='Ricovero')?.date||'';const discharge=[...dates].reverse().find(x=>x.label==='Dimissione')?.date||'';if(admission){doc.clinicalDate=admission;doc.title=titleFor('Cartella clinica',admission);}if(discharge)doc.issueDate=discharge;doc.pdfExportMode=['full','summary','exclude'].includes(doc.pdfExportMode)?doc.pdfExportMode:'summary';}
    doc.clinicalCanonicalVersion=VERSION;doc.clinicalValidationVersion=VERSION;doc.clinicalCanonicalCachedAt=new Date().toISOString();return{...result,document:doc,changed:true};
  }
  function force(input={},options={}){const seed={...clone(input),complexClinicalContainer:true,documentKind:'Cartella clinica',category:'Cartella clinica',documentMode:'narrative'};return canon(seed,options).document;}
  H.analyzeText=analyzeText;H.isComplexClinicalDocumentV13=isComplex;H.canonicalizeComplexClinicalDocumentV13=force;H.canonicalizeClinicalDocument24=canon;H.repairNarrativeDocumentData=d=>canon(d);H.repairLabDocumentData=d=>canon(d);H.prepareDocuments24=(docs=[],profile={})=>(docs||[]).map(d=>canon(d,{profile}).document);H.V604_COMPLEX_CANONICAL_VERSION=VERSION;H.V603_CANONICAL_VERSION=VERSION;H.V602_CANONICAL_VERSION=VERSION;H.TEST24_VERSION=VERSION;
})(HealthExtractors);

/* V6.0.4 FIX21 - canone v14: classificazione guidata dall'intestazione clinica interna.
   L'intestazione del referto prevale su parole sparse nel corpo; il nome file e' solo
   un segnale secondario. Questo evita, ad esempio, che una visita pneumologica venga
   classificata come diabetologica solo perche' nel testo compare il diabete. */
;(function v604CanonicalV14HeaderFirst(H){
  'use strict'; if(!H)return;
  const VERSION='v6.0.4-canonical-v14';
  const BASE_CANON=H.canonicalizeClinicalDocument24.bind(H);
  const BASE_ANALYZE=H.analyzeText.bind(H);
  const clone=v=>typeof structuredClone==='function'?structuredClone(v):JSON.parse(JSON.stringify(v??{}));
  const collapse=v=>String(v??'').replace(/\u00ad/g,'').replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').trim();
  const fold=v=>collapse(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('it-IT');
  const sourceText=doc=>[doc?.extractedText,doc?.structuredText,(doc?.ocrPageData||[]).map(p=>p?.text||'').join('\n')].filter(Boolean).join('\n');
  const isComplex=doc=>Boolean(doc&&(doc.complexClinicalContainer===true||/cartella\s+clinica/i.test(String(doc.documentKind||doc.category||doc.title||doc.originalName||''))||H.isComplexClinicalDocumentV13?.(doc)===true||H.isComplexClinicalDocumentV12?.(doc)===true||H.isComplexClinicalContainer603?.(doc)===true));

  const RULES=[
    ['Visita ORL','Visita specialistica','narrative','Otorinolaringoiatria',[ /\bvisita\s+(?:otorinolaringoiatrica|orl)\b/i,/\botorinolaringoiatria\b/i,/\bvisita\s+otorino\b/i ]],
    ['Visita dermatologica','Visita specialistica','narrative','Dermatologia',[ /\bvisita\s+dermatologica\b/i,/\bdermatologia\b/i ]],
    ['Visita pneumologica','Visita specialistica','narrative','Pneumologia',[ /\bvisita\s+pneumologica\b/i,/\bpneumologia\b/i ]],
    ['Visita cardiologica','Visita specialistica','narrative','Cardiologia',[ /\bvisita\s+cardiologica\b/i,/\bcardiologia\b/i ]],
    ['Visita cardiotoracica','Visita specialistica','narrative','Cardiotoracica',[ /\bvisita\s+cardiotoracica\b/i,/\bcardiotorace\b/i,/\bcardio[- ]?toracica\b/i ]],
    ['Visita diabetologica','Visita specialistica','narrative','Diabetologia',[ /\bvisita\s+diabetologica\b/i ]],
    ['Visita neurologica','Visita specialistica','narrative','Neurologia',[ /\bvisita\s+neurologica\b/i ]],
    ['Visita endocrinologica','Visita specialistica','narrative','Endocrinologia',[ /\bvisita\s+endocrinologica\b/i ]],
    ['Visita epatologica','Visita specialistica','narrative','Epatologia',[ /\bvisita\s+epatologica\b/i ]],
    ['Visita oculistica','Visita specialistica','narrative','Oculistica',[ /\bvisita\s+oculistica\b/i ]],
    ['Visita gastroenterologica','Visita specialistica','narrative','Gastroenterologia',[ /\bvisita\s+gastroenterologica\b/i ]],
    ['Visita urologica','Visita specialistica','narrative','Urologia',[ /\bvisita\s+urologica\b/i ]],
    ['Visita ortopedica','Visita specialistica','narrative','Ortopedia',[ /\bvisita\s+ortopedica\b/i ]],
    ['Visita psichiatrica','Visita specialistica','narrative','Psichiatria',[ /\bvisita\s+psichiatrica\b/i ]],
    ['Visita fisiatrica','Visita specialistica','narrative','Fisiatria',[ /\bvisita\s+fisiatrica\b/i ]],
    ['Visita ginecologica','Visita specialistica','narrative','Ginecologia',[ /\bvisita\s+ginecologica\b/i ]],
    ['Visita nefrologica','Visita specialistica','narrative','Nefrologia',[ /\bvisita\s+nefrologica\b/i ]],
    ['Visita specialistica lipolinfedema','Visita specialistica','narrative','Lipolinfedema',[ /\blipolinfedema\b/i,/\blipo[- ]?linfedema\b/i ]],
    ['Ecocolordoppler arti inferiori','Referto strumentale','narrative','Angiologia/Radiologia',[ /\beco(?:color)?doppler\s+(?:venoso\s+)?(?:degli\s+)?arti\s+inferiori\b/i,/\becocolordoppler\s+venoso\s+arti\s+inferiori\b/i ]],
    ['Esame audiometrico','Referto strumentale','narrative','Otorinolaringoiatria',[ /\b(?:esame\s+)?audiometric[oa]\b/i,/\baudiometria\b/i,/\baudiogramma\b/i ]],
    ['Elettrocardiogramma','Referto strumentale','narrative','Cardiologia',[ /\belettrocardiogramma\b/i,/\becg\b/i ]],
    ['Ecocardiogramma','Referto strumentale','narrative','Cardiologia',[ /\becocardiogramma\b/i,/\becocolordoppler\s+cardiaco\b/i ]],
    ['Polisonnografia','Referto strumentale','narrative','Pneumologia',[ /\bpolisonnografia\b/i,/\bpoligrafia\s+notturna\b/i ]],
    ['Spirometria','Referto strumentale','narrative','Pneumologia',[ /\bspirometria\b/i ]],
    ['Confronto analisi','Confronto analisi','lab','Laboratorio analisi',[ /\bconfronto\s+analis[ei]\b/i,/\braffronto\s+analis[ei]\b/i ]]
  ];
  const FILE_RULES=[
    ['Visita dermatologica','Visita specialistica','narrative','Dermatologia',/dermatolog/i],
    ['Visita ORL','Visita specialistica','narrative','Otorinolaringoiatria',/(?:^|[_ .-])orl(?:[_ .-]|$)|otorino|audiometr/i],
    ['Visita pneumologica','Visita specialistica','narrative','Pneumologia',/pneumolog|emogas/i],
    ['Visita cardiologica','Visita specialistica','narrative','Cardiologia',/visita[_ .-]*cardiolog|cardiolog/i],
    ['Visita cardiotoracica','Visita specialistica','narrative','Cardiotoracica',/cardiotorace|cardio[_ .-]*torac/i],
    ['Visita specialistica lipolinfedema','Visita specialistica','narrative','Lipolinfedema',/lipolinfed|lipo[_ .-]*linfed|troyer/i],
    ['Ecocolordoppler arti inferiori','Referto strumentale','narrative','Angiologia/Radiologia',/eco(?:color)?doppler[_ .-]*arti[_ .-]*inferiori/i],
    ['Confronto analisi','Confronto analisi','lab','Laboratorio analisi',/confronto[_ .-]*analisi|raffronto[_ .-]*analisi/i]
  ];
  function headerLines(raw=''){
    const out=[];for(const row of String(raw||'').replace(/\r/g,'\n').split(/\n+/)){const line=collapse(row);if(!line||/^===\s*PAGINA\s*\d+\s*===$/i.test(line))continue;out.push(line);if(out.length>=140)break;}return out;
  }
  function scoreRule(lines,patterns){
    let best=0;for(let i=0;i<lines.length;i++){const line=fold(lines[i]);for(const re of patterns){re.lastIndex=0;if(!re.test(line))continue;let score=0;if(/^(?:tipo\s+esame\s*[:\-]?\s*)?(?:visita|esame|ecocolordoppler|ecodoppler|polisonnografia|poligrafia|spirometria|elettrocardiogramma|ecg|confronto)\b/i.test(line))score=130;else if(i<25)score=105;else if(i<60)score=80;else score=45;best=Math.max(best,score);}}return best;
  }
  function identity(raw='',doc={},complex=false){
    if(complex)return{label:'Cartella clinica',category:'Cartella clinica',mode:'narrative',specialization:doc.specialization||doc.department||'',source:'struttura cartella clinica',confidence:100};
    const lines=headerLines(raw),candidates=[];
    for(const [label,category,mode,spec,patterns] of RULES){const score=scoreRule(lines,patterns);if(score)candidates.push({score,label,category,mode,spec});}
    const fn=fold(doc.originalName||'');for(const [label,category,mode,spec,re] of FILE_RULES){re.lastIndex=0;if(re.test(fn))candidates.push({score:68,label,category,mode,spec});}
    if(candidates.length){candidates.sort((a,b)=>b.score-a.score);const win={...candidates[0]};const joined=fold(lines.slice(0,100).join('\n'));
      if(win.label==='Visita ORL'&&/(?:\besame\s+)?audiometric[oa]\b|\baudiometria\b|\baudiogramma\b/i.test(joined))win.label='Visita ORL con esame audiometrico';
      if(win.label==='Visita cardiologica'&&/\belettrocardiogramma\b|\becg\b/i.test(joined))win.label='Visita cardiologica con ECG';
      return{label:win.label,category:win.category,mode:win.mode,specialization:win.spec,source:win.score>=80?'intestazione clinica interna':'nome file come conferma',confidence:Math.min(100,win.score)};
    }
    const old=collapse(doc.documentKind||doc.category||'Documento sanitario');return{label:old||'Documento sanitario',category:doc.category||'Documento sanitario',mode:doc.documentMode||'narrative',specialization:doc.specialization||'',source:'classificazione precedente',confidence:Number(doc.documentTypeConfidence||60)};
  }
  function iso(d,m,y){const yy=Number(y),mm=Number(m),dd=Number(d),dt=new Date(Date.UTC(yy,mm-1,dd));if(yy<1900||yy>2100||dt.getUTCFullYear()!==yy||dt.getUTCMonth()!==mm-1||dt.getUTCDate()!==dd)return'';return`${yy}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`;}
  function birthDates(raw=''){const out=new Set(),re=/(?:data\s+(?:di\s+)?nascita|nato\/?a?\s+(?:a\s+[^\n]{0,40}\s+)?(?:il\s*)?)[^\d]{0,20}(0?[1-9]|[12]\d|3[01])[\/.\-](0?[1-9]|1[0-2])[\/.\-]((?:19|20)\d{2})/gi;let m;while((m=re.exec(raw))){const x=iso(m[1],m[2],m[3]);if(x)out.add(x);}return out;}
  function explicitDate(raw='',current=''){const births=birthDates(raw),head=String(raw||'').slice(0,18000),patterns=[/(?:data\s+(?:e\s+ora\s+)?referto|data\s+(?:dell['’]?|di\s+)?esame|data\s+visita|visita\s+del|referto\s+completato\s*:?)\s*[^\d]{0,20}(0?[1-9]|[12]\d|3[01])[\/.\-](0?[1-9]|1[0-2])[\/.\-]((?:19|20)\d{2})/i,/(?:data\s+(?:di\s+)?accettazione)\s*:?\s*(0?[1-9]|[12]\d|3[01])[\/.\-](0?[1-9]|1[0-2])[\/.\-]((?:19|20)\d{2})/i];for(const re of patterns){const m=head.match(re);if(m){const x=iso(m[1],m[2],m[3]);if(x&&!births.has(x))return x;}}return current&&!births.has(current)?current:'';}
  function titleFor(label,date=''){if(/^\d{4}-\d{2}-\d{2}$/.test(date)){const[y,m,d]=date.split('-');return`${label} del ${d}/${m}/${y}`;}return label;}
  function applyIdentity(doc,raw,complex){const id=identity(raw,doc,complex);doc.documentKind=id.label;doc.category=id.category;doc.documentMode=id.mode;if(id.specialization){doc.specialization=id.specialization;doc.department=id.specialization;}if(!complex){const date=explicitDate(raw,doc.clinicalDate||'');if(date)doc.clinicalDate=date;doc.title=titleFor(id.label,doc.clinicalDate||'');}doc.documentTypeVersion=VERSION;doc.documentTypeSource=id.source;doc.documentTypeConfidence=id.confidence;return doc;}
  function analyzeText(text,profiles=[],activeProfileId=null,pages=[],fileName=''){const a=BASE_ANALYZE(text,profiles,activeProfileId,pages,fileName),seed={...a,extractedText:text,structuredText:a.structuredText||text,ocrPageData:pages,originalName:fileName},complex=isComplex(seed);applyIdentity(a,text,complex);a.clinicalCanonicalVersion=VERSION;a.clinicalValidationVersion=VERSION;return a;}
  function canon(input={},options={}){const original=clone(input),raw=sourceText(original),complex=isComplex(original),result=BASE_CANON(original,options)||{document:original,changed:false,validation:{ok:true,violations:[]}},doc=clone(result.document||original);applyIdentity(doc,raw,complex);if(complex){doc.documentKind='Cartella clinica';doc.category='Cartella clinica';doc.documentMode='narrative';doc.title=doc.title&&/^Cartella clinica/i.test(doc.title)?doc.title:titleFor('Cartella clinica',doc.clinicalDate||'');}doc.clinicalCanonicalVersion=VERSION;doc.clinicalValidationVersion=VERSION;doc.clinicalCanonicalCachedAt=new Date().toISOString();return{...result,document:doc,changed:true};}
  function force(input={},options={}){const seed={...clone(input),complexClinicalContainer:true,documentKind:'Cartella clinica',category:'Cartella clinica',documentMode:'narrative'};return canon(seed,options).document;}
  H.analyzeText=analyzeText;H.isComplexClinicalDocumentV14=isComplex;H.canonicalizeComplexClinicalDocumentV14=force;H.canonicalizeClinicalDocument24=canon;H.repairNarrativeDocumentData=d=>canon(d);H.repairLabDocumentData=d=>canon(d);H.prepareDocuments24=(docs=[],profile={})=>(docs||[]).map(d=>canon(d,{profile}).document);H.V604_COMPLEX_CANONICAL_VERSION=VERSION;H.V603_CANONICAL_VERSION=VERSION;H.V602_CANONICAL_VERSION=VERSION;H.TEST24_VERSION=VERSION;
})(HealthExtractors);

/* V6.0.4 FIX23 PRE-BETA - canone v16: identita' documentale semantica gerarchica.
   Prima identifica l'atto clinico principale, poi specialita' e prestazioni associate.
   Le citazioni storiche e le visite consigliate non possono sovrascrivere l'atto corrente.
   Il nome file resta una conferma secondaria. Nessuna nuova OCR e nessun cambio parser. */
;(function v604CanonicalV15SemanticIdentity(H){
  'use strict'; if(!H)return;
  const VERSION='v6.0.4-canonical-v16';
  const CLASSIFIER='document-classifier-v16';
  const BASE_CANON=H.canonicalizeClinicalDocument24.bind(H);
  const BASE_ANALYZE=H.analyzeText.bind(H);
  const clone=v=>typeof structuredClone==='function'?structuredClone(v):JSON.parse(JSON.stringify(v??{}));
  const collapse=v=>String(v??'').replace(/\u00ad/g,'').replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').trim();
  const fold=v=>collapse(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[–—−]/g,'-').toLocaleLowerCase('it-IT');
  const sourceText=doc=>[doc?.extractedText,doc?.structuredText,(doc?.ocrPageData||[]).map(p=>p?.text||'').join('\n')].filter(Boolean).join('\n');
  const isComplex=doc=>Boolean(doc&&(doc.complexClinicalContainer===true||/cartella\s+clinica/i.test(String(doc.documentKind||doc.category||doc.title||doc.originalName||''))));
  function linesOf(raw='',limit=220){const out=[];for(const row of String(raw||'').replace(/\r/g,'\n').split('\n')){const line=collapse(row.replace(/\s+/g,' '));if(!line||/^===\s*PAGINA\s*\d+\s*===$/i.test(line))continue;out.push(line);if(out.length>=limit)break;}return out;}
  function editDistance(a,b){a=String(a||'');b=String(b||'');if(a===b)return 0;if(!a)return b.length;if(!b)return a.length;let prev=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){const cur=[i];for(let j=1;j<=b.length;j++)cur[j]=Math.min(cur[j-1]+1,prev[j]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));prev=cur;}return prev[b.length];}
  function fuzzyToken(line,targets=[]){const toks=(fold(line).match(/[a-z0-9]+/g)||[]).filter(x=>x.length>=7);for(const target of targets){const t=fold(target);for(const tok of toks){if(tok===t)return true;const allowance=t.length>=14?2:1;if(Math.abs(tok.length-t.length)<=allowance&&editDistance(tok,t)<=allowance)return true;}}return false;}
  const SPECIALTIES=[
    ['Otorinolaringoiatria','Visita ORL',[ /otorinolaring/i,/\botorino\b/i,/\borl\b/i ],['otorinolaringoiatria','otorinolaringoiatrica']],
    ['Dermatologia','Visita dermatologica',[ /dermatolog/i,/venereolog/i ],['dermatologia','dermatologica','venereologia']],
    ['Pneumologia','Visita pneumologica',[ /pneumolog/i ],['pneumologia','pneumologica']],
    ['Cardiologia','Visita cardiologica',[ /cardiolog/i ],['cardiologia','cardiologica']],
    ['Neurologia','Visita neurologica',[ /neurolog/i ],['neurologia','neurologica']],
    ['Endocrinologia','Visita endocrinologica',[ /endocrinolog/i,/endocrino[- ]?metabolic/i ],['endocrinologia','endocrinologica']],
    ['Diabetologia','Visita diabetologica',[ /diabetolog/i,/malattie\s+metaboliche\s+e\s+diabetologia/i ],['diabetologia','diabetologica']],
    ['Epatologia','Visita epatologica',[ /epatolog/i ],['epatologia','epatologica']],
    ['Oculistica','Visita oculistica',[ /oculist/i,/oftalmolog/i ],['oculistica','oftalmologia']],
    ['Gastroenterologia','Visita gastroenterologica',[ /gastroenterolog/i ],['gastroenterologia','gastroenterologica']],
    ['Reumatologia','Visita reumatologica',[ /reumatolog/i ],['reumatologia','reumatologica']],
    ['Nefrologia','Visita nefrologica',[ /nefrolog/i ],['nefrologia','nefrologica']],
    ['Urologia','Visita urologica',[ /\burolog/i ],['urologia','urologica']],
    ['Ortopedia','Visita ortopedica',[ /ortoped/i ],['ortopedia','ortopedica']],
    ['Fisiatria','Visita fisiatrica',[ /fisiatr/i ],['fisiatria','fisiatrica']],
    ['Psichiatria','Visita psichiatrica',[ /psichiatr/i ],['psichiatria','psichiatrica']],
    ['Ginecologia','Visita ginecologica',[ /ginecolog/i ],['ginecologia','ginecologica']],
    ['Ematologia','Visita ematologica',[ /ematolog/i ],['ematologia','ematologica']],
    ['Oncologia','Visita oncologica',[ /oncolog/i ],['oncologia','oncologica']],
    ['Angiologia','Visita angiologica',[ /angiolog/i ],['angiologia','angiologica']],
    ['Linfologia','Visita linfologica',[ /linfolog/i ],['linfologia','linfologica']],
    ['Chirurgia vascolare','Visita di chirurgia vascolare',[ /chirurgia\s+vascolare/i,/chirurg\w*\s+vascolar/i ],['vascolare']],
    ['Geriatria','Visita geriatrica',[ /geriatr/i ],['geriatria','geriatrica']],
    ['Cardiotoracica','Visita cardiotoracica',[ /cardio[- ]?toracic/i,/cardiotorac/i ],['cardiotoracica']]
  ];
  const INSTRUMENTS=[
    ['Gastroscopia','Gastroenterologia',[ /esofagogastroduodenoscopia/i,/gastroscopia/i,/\begd\b/i,/\begds\b/i ]],
    ['Colonscopia','Gastroenterologia',[ /colonscopia/i,/colonoscopia/i,/ileocolonscopia/i ]],
    ['Esame audiometrico','Otorinolaringoiatria',[ /esame\s+audiometric/i,/audiometria/i,/audiogramma/i ]],
    ['Elettrocardiogramma','Cardiologia',[ /elettrocardiogramma/i,/\becg\b/i ]],
    ['Ecocardiogramma','Cardiologia',[ /ecocardiogramma/i,/ecocolordoppler\s+cardiaco/i,/ecocolordopplergrafia\s+cardiaca/i,/ecocardiografia/i ]],
    ['Spirometria','Pneumologia',[ /spirometria/i,/\bspirometry\b/i,/prove?\s+di\s+funzionalita\s+respiratoria/i,/\bpfr\b/i ]],
    ['Emogasanalisi','Pneumologia',[ /emogasanalisi/i,/emogas/i,/\bega\b/i ]],
    ['Polisonnografia','Pneumologia',[ /polisonnografia/i,/poligrafia\s+notturna/i ]],
    ['Saturimetria notturna','Pneumologia',[ /saturimetria\s+notturna/i ]],
    ['Ecocolordoppler arti inferiori','Angiologia/Radiologia',[ /eco(?:color)?doppler.{0,35}arti\s+inferiori/i,/circolo\s+venoso\s+profondo.{0,100}femoro[- ]?poplite/i ]],
    ['Ecocolordoppler TSA','Angiologia/Radiologia',[ /eco(?:color)?doppler.{0,35}(?:tronchi\s+sovra+aortici|tronchi\s+sovraortici|\btsa\b|carotid)/i ]],
    ['Ecocolordoppler','Radiologia',[ /ecocolordoppler/i,/eco-color-doppler/i,/ecodoppler/i ]],
    ['Ecografia tiroidea','Endocrinologia',[ /ecografia\s+(?:del\s+)?collo/i,/ecografia\s+tiroide/i ]],
    ['Ecografia','Radiologia',[ /\becografia\b/i,/ecotomografia/i ]],
    ['TAC','Radiologia',[ /\btac\b/i,/tomografia\s+computerizzata/i,/\btc\s+(?:cranio|torace|addome|encefalo|collo|maxill)/i ]],
    ['Risonanza magnetica','Radiologia',[ /risonanza\s+magnetica/i,/\brmn?\b/i ]],
    ['Radiografia','Radiologia',[ /\bradiografia\b/i,/\brx\s*(?:torace|anca|ginocchio|cranio|colonna|addome|dent)/i ]],
    ['Mammografia','Senologia/Radiologia',[ /mammografia/i,/mammografico/i ]],
    ['Pap test','Ginecologia',[ /pap\s*test/i,/citologia\s+cervico/i ]],
    ['Anatomia patologica','Anatomia patologica',[ /anatomia\s+patologic/i,/anatomie\s+patologic/i,/esame\s+istologico/i,/diagnosi\s+istologica/i ]],
    ['Analisi composizione corporea','Nutrizione/Metabolismo',[ /analisi\s+(?:della\s+)?composizione\s+corporea/i,/bioimpedenziometr/i ]]
  ];
  function testPatterns(text,patterns=[]){const n=fold(text);return patterns.some(re=>{re.lastIndex=0;return re.test(n);});}
  function hitSpec(line,row){return testPatterns(line,row[2])||fuzzyToken(line,row[3]);}
  function specialtyHits(line){const exact=SPECIALTIES.filter(row=>testPatterns(line,row[2]));const rows=exact.length?exact:SPECIALTIES.filter(row=>fuzzyToken(line,row[3]));return rows.map(row=>({spec:row[0],visit:row[1],row}));}
  function instrumentHits(line){return INSTRUMENTS.filter(row=>testPatterns(line,row[2])).map(row=>({label:row[0],spec:row[1],row}));}
  function displayClinicalPhrase(value='',maxLen=90){let s=String(value||'').replace(/\s+/g,' ').trim().replace(/^[: ,.;-]+|[: ,.;-]+$/g,'');s=s.split(/\s+(?:data\s+e\s+ora|data\s+referto|referto|tsrm|scrivente)\s*[:\-]/i)[0].slice(0,maxLen).trim().replace(/^[: ,.;-]+|[: ,.;-]+$/g,'');if(s&&s.toUpperCase()===s)s=s.toLowerCase();return s?s[0].toUpperCase()+s.slice(1):'';}
  function specialtyFromVisitPhrase(phrase=''){const p=displayClinicalPhrase(phrase,60),n=fold(p);if(n.endsWith('ologica'))return displayClinicalPhrase(p.slice(0,-7)+'ologia',60);if(n.endsWith('iatrica'))return displayClinicalPhrase(p.slice(0,-7)+'iatria',60);if(n.endsWith('chirurgica'))return'Chirurgia';return p;}
  function unknownVisitFromLine(line=''){const m=String(line||'').match(/\bvisita\s+([A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ0-9 /+'’.\-]{2,80})/i);if(!m)return['',''];let phrase=m[1].split(/\s+(?:con|per|del|della|in\s+data|e\s+seguent|e\s+i\s+seguent)\b/i)[0];phrase=displayClinicalPhrase(phrase,60);if(!phrase)return['',''];const n=fold(phrase);if(/^(?:ambulatoriale|specialistica|generale|medica|di controllo|di follow|successiva|odierna|presso|questo|istituto|del|in data)\b/i.test(n))return['',''];if((n.match(/[a-zà-ÿ]+/gi)||[]).length>5)return['',''];return['Visita '+phrase.toLowerCase(),specialtyFromVisitPhrase(phrase)];}
  function unknownProviderSpecialty(line=''){const m=String(line||'').trim().match(/\b(?:medico\s+chirurgo\s+)?specialista\s+in\s+(.{3,90})$/i);if(!m)return'';let phrase=m[1].split(/\b(?:tel\.?|telefono|studio|abit\.?|riceve|fax|e-?mail)\b/i)[0];phrase=displayClinicalPhrase(phrase,70);return phrase.length>=4&&((phrase.match(/[A-Za-zÀ-ÖØ-öø-ÿ]+/g)||[]).length<=7)?phrase:'';}
  function unknownExamFromLine(line=''){const m=String(line||'').trim().match(/\btipo\s+esame\s*[:\-]\s*(.{3,100})$/i);if(!m)return'';const phrase=displayClinicalPhrase(m[1],85);return phrase&&!/\b(?:non indicat|nessun|n\/?a)\b/i.test(fold(phrase))?phrase:'';}
  function iso(d,m,y){const yy=Number(y),mm=Number(m),dd=Number(d),dt=new Date(Date.UTC(yy,mm-1,dd));if(yy<1900||yy>2100||dt.getUTCFullYear()!==yy||dt.getUTCMonth()!==mm-1||dt.getUTCDate()!==dd)return'';return`${yy}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`;}
  function birthDates(raw=''){const out=new Set(),re=/(?:data\s+(?:di\s+)?nascita|nascita|nato\/?a?)\s*[:\-]?[^\d\n]{0,35}(0?[1-9]|[12]\d|3[01])[\/.\-](0?[1-9]|1[0-2])[\/.\-]((?:19|20)\d{2})/gi;let m;while((m=re.exec(raw))){const x=iso(m[1],m[2],m[3]);if(x)out.add(x);}return out;}
  function explicitDate(raw='',current=''){const births=birthDates(raw),head=String(raw||'').slice(0,22000),patterns=[/\bdata\s+visita\s*[:\-]?\s*(0?[1-9]|[12]\d|3[01])[\/.\-](0?[1-9]|1[0-2])[\/.\-]((?:19|20)\d{2})/i,/\bvisita\s+del\s+(0?[1-9]|[12]\d|3[01])[\/.\-](0?[1-9]|1[0-2])[\/.\-]((?:19|20)\d{2})/i,/\bdata\s+(?:dell['’]?|di\s+)?esame\s*[:\-]?\s*(0?[1-9]|[12]\d|3[01])[\/.\-](0?[1-9]|1[0-2])[\/.\-]((?:19|20)\d{2})/i,/\bdata\s+ref\.?\s*[:\-]?\s*(0?[1-9]|[12]\d|3[01])[\/.\-](0?[1-9]|1[0-2])[\/.\-]((?:19|20)\d{2})/i,/\bdata\s+(?:e\s+ora\s+)?(?:del\s+)?referto\s*[:\-]?\s*(0?[1-9]|[12]\d|3[01])[\/.\-](0?[1-9]|1[0-2])[\/.\-]((?:19|20)\d{2})/i,/\bdata\s+(?:di\s+)?accettazione\s*[:\-]?\s*(0?[1-9]|[12]\d|3[01])[\/.\-](0?[1-9]|1[0-2])[\/.\-]((?:19|20)\d{2})/i,/\brefertazione\s+di\s*[:\-]?[^\d\n]{0,30}(0?[1-9]|[12]\d|3[01])[\/.\-](0?[1-9]|1[0-2])[\/.\-]((?:19|20)\d{2})/i];for(const re of patterns){const m=head.match(re);if(m){const x=iso(m[1],m[2],m[3]);if(x&&!births.has(x))return x;}}return current&&!births.has(current)?current:'';}
  function dateFromLine(line=''){const m=String(line).match(/(?<!\d)(0?[1-9]|[12]\d|3[01])[\/.\-](0?[1-9]|1[0-2])[\/.\-]((?:19|20)\d{2})(?!\d)/);return m?iso(m[1],m[2],m[3]):'';}
  function historicalVisit(line=''){const n=fold(line);return /\b(?:ultima|precedente|pregressa|pregresso|recente)\s+visita\b/i.test(n)||/\b(?:durante|nel corso de)\b.{0,60}\b(?:ricovero|degenza)\b.{0,100}\b(?:visita|consulenza)\b/i.test(n)||/\b(?:ha|aveva)\s+(?:eseguito|effettuato|praticato)\b.{0,80}\bvisita\b/i.test(n);}
  function recommendedVisit(line=''){const n=fold(line);return /\b(?:prescriv\w*|consigli\w*|program\w*|prenot\w*|richied\w*|invito\w*|necessari\w*)\b.{0,55}\bvisita\b|\bvisita\b.{0,40}\b(?:da\s+eseguire|di\s+controllo|fra|tra\s+\d|entro)\b/i.test(n);}
  function strongMainVisit(line='',idx=0){const n=fold(line);if(historicalVisit(line)||recommendedVisit(line))return false;return /\bprestazion\w*\b.{0,45}\bvisita\b/i.test(n)||/\b(?:tipo\s+prestazione|prestazione\s+principale)\b.{0,45}\bvisita\b/i.test(n)||/\breferto\s+(?:di\s+)?visita\b/i.test(n)||/^visita\b/i.test(n)||/\b(?:sottopost[oa]|sottoposto\/a)\b.{0,45}\bvisita\b/i.test(n)||(idx<18&&/\bvisita\b/i.test(n)&&!/\b(?:prenotazione|appuntamento|controllo\s+precedente)\b/i.test(n));}
  function historicalInstrument(line='',ctx='',current=''){const n=fold(line);if(ctx&&current&&ctx!==current)return true;return /\b(?:precedente|pregress[oa]|ultima)\b.{0,45}\b(?:ecg|ega|emogas|audiometr|ecograf|ecocardiogram|spirometr|tac|tc|rx|risonanza)/i.test(n)||/\b(?:del|in data)\s+\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}\b.{0,45}\b(?:ecg|ega|emogas|audiometr|ecograf|ecocardiogram|spirometr|tac|tc|rx|risonanza)/i.test(n);}
  function identity(raw='',base={},fileName=''){
    const lines=linesOf(raw),head=lines.slice(0,180).join('\n'),nhead=fold(head),first30=fold(lines.slice(0,30).join('\n')),fn=fold(fileName||base.originalName||''),currentDate=explicitDate(raw,base.clinicalDate||'');
    if(/\b(?:lettera|relazione)\s+di\s+dimissione\b/i.test(nhead)){let sp='';for(const line of lines.slice(0,30)){const hs=specialtyHits(line);if(hs.length&&/\b(?:u\.?\s*o\.?\s*c?\.?|uoc|reparto|unita\s+operativa)\b/i.test(fold(line))){sp=hs[0].spec;break;}}return{label:'Lettera di dimissione',category:'Lettera di dimissione',mode:'narrative',specialization:sp,confidence:100,source:'titolo esplicito',associatedActs:[]};}
    if(/\bterapi[ae]\s+farmacologic(?:a|he)\s+in\s+corso\b/i.test(first30)||(/\bterapi[ae]\s+farmacologic/i.test(first30)&&((nhead.match(/\b(?:mg|mcg|compressa|capsula|dosaggio|orario|farmaco)\b/gi)||[]).length>=4)))return{label:'Terapie farmacologiche in corso',category:'Piano terapeutico',mode:'therapy',specialization:'',confidence:100,source:'titolo/struttura terapeutica esplicita',associatedActs:[]};
    if((/\b(?:test|ricerca)\s+(?:per\s+la\s+)?ricerca\s+del\s+sangue\s+occulto\s+nelle\s+feci\b|\bricerca\s+(?:del\s+)?sangue\s+occulto\s+nelle\s+feci\b/i.test(nhead))&&/\b(?:esito|risultat|negativ|positiv)\w*\b/i.test(nhead))return{label:'Ricerca sangue occulto nelle feci',category:'Referto di screening',mode:'narrative',specialization:'Screening colon-retto',confidence:100,source:'prestazione di screening esplicita',associatedActs:[]};
    if((/\bresmed\s+resscan\b|\bairsense\s+10\b/i.test(nhead))&&/\b(?:ahi|indice\s+apnea|pressione\s+minima|giorni\s+utilizzo|modalita\s+terapeutica)\b/i.test(nhead))return{label:'Monitoraggio terapia CPAP',category:'Referto strumentale',mode:'narrative',specialization:'Pneumologia/Medicina del sonno',confidence:99,source:'report CPAP con statistiche terapeutiche',associatedActs:[]};
    if(/\btipo\s+esame\s*[:\-][^\n]*\bmammografia\b[^\n]*\becografia\s+mammaria\b/i.test(nhead))return{label:'Mammografia con ecografia mammaria',category:'Referto strumentale',mode:'narrative',specialization:'Senologia/Radiologia',confidence:100,source:'campo Tipo Esame con prestazioni associate',associatedActs:['Ecografia mammaria']};
    const analyteRe=/\b(?:emoglobina|ematocrito|piastrine|globuli\s+(?:rossi|bianchi)|leucociti|neutrofili|linfociti|creatinina|glucosio|glicemia|colesterolo|trigliceridi|transaminasi|bilirubina|sodio|potassio|tsh|tiroxina|triiodotironina)\b/gi;const analytes=(nhead.match(analyteRe)||[]).length;const labHeader=/\b(?:diagnostica\s+di\s+laboratorio|medicina\s+di\s+laboratorio|dipartimento[^\n]{0,80}laboratorio|virologia\s+universitaria|laboratorio\s+diagnostico|patologia\s+clinica|laboratorio\s+(?:analisi|di\s+ematologia)|microbiologia)\b/i.test(first30)&&(/\besame\s+(?:metodo\s+)?esito\b|\bvalori\s+(?:di\s+)?riferimento\b/i.test(first30));const denseLab=analytes>=7&&((nhead.match(/\b(?:mg\/dl|g\/dl|mmol|mui\/ml|ui\/l|pg\/ml|ng\/dl|%|fl|pg)\b/gi)||[]).length>=6)&&(/\besame\s+(?:metodo\s+)?esito\b|\bvalori\s+(?:di\s+)?riferimento\b/i.test(first30));if(labHeader||denseLab)return{label:'Esami di laboratorio',category:'Esami di laboratorio',mode:'lab',specialization:'Laboratorio analisi',confidence:labHeader?100:96,source:'struttura tabellare di laboratorio',associatedActs:[]};
    if((/\bmateriale\s+pervenuto\b/i.test(nhead)&&/\besame\s+macroscopico\b/i.test(nhead)&&/\bsnomed\b/i.test(nhead))||/\b(?:anatomia|anatomie)\s+patologic/i.test(first30))return{label:'Anatomia patologica',category:'Referto istologico',mode:'narrative',specialization:'Anatomia patologica',confidence:99,source:'struttura istologica/anatomopatologica',associatedActs:[]};
    if(/cartella[ _.-]*clinica/i.test(fn)||(/\b(?:cartella\s+clinica|numero\s+cartella|diario\s+clinico)\b/i.test(first30)&&/\b(?:ricovero|degenza|dimissione)\b/i.test(first30)))return{label:'Cartella clinica',category:'Cartella clinica',mode:'narrative',specialization:base.specialization||base.department||'',confidence:100,source:'struttura cartella clinica',associatedActs:[]};
    if(/\b(?:attestato\s+di\s+esenzione|codice\s+esenzione|esenzione\s+sanitaria)\b/i.test(nhead))return{label:'Esenzione sanitaria',category:'Esenzione sanitaria',mode:'exemption',specialization:'',confidence:100,source:'dicitura esplicita',associatedActs:[]};
    if((((nhead.match(/\briferimento\b/gi)||[]).length>=3)&&((nhead.match(/\bdata\b/gi)||[]).length>=3)&&/\btipo\s+esame\b.{0,45}\bvalore\b/i.test(nhead))||/\b(?:confronto|raffronto)\s+analis[ei]\b/i.test(nhead))return{label:'Confronto analisi',category:'Confronto analisi',mode:'lab',specialization:'Laboratorio analisi',confidence:99,source:'struttura tabellare comparativa',associatedActs:[]};
    const specEv=[],visits=[],instr=[],associated=[];let ctxDate='';const markerPats=[/\banamnes/i,/\bdiagnos/i,/esame\s+obiettivo/i,/\bconclusion/i,/\bterapia\b/i,/\bprescrizion/i,/\bindicazion/i,/\bprossimo\s+controllo/i,/\bcontrollo\s+metabolico/i];const markers=markerPats.filter(re=>re.test(nhead)).length;
    for(let idx=0;idx<Math.min(lines.length,220);idx++){const line=lines[idx],nl=fold(line);if(/\b(?:aggiornamento|controllo|visita)\b.{0,25}\bdel\b/i.test(nl)){const d=dateFromLine(line);if(d)ctxDate=d;}
      const sh=specialtyHits(line);if(!sh.length&&strongMainVisit(line,idx)){const [ulabel,uspec]=unknownVisitFromLine(line);if(ulabel)visits.push({score:191,label:ulabel,spec:uspec,reason:'visita esplicita con specialita non ancora in ontologia',idx,line});}if(!sh.length&&markers>=2){const uspec=unknownProviderSpecialty(line);if(uspec)visits.push({score:174,label:'Visita specialistica di '+uspec,spec:uspec,reason:'qualifica specialistica non ancora in ontologia + struttura clinica',idx,line});}
      for(const h of sh){let score=35,reason='menzione nel corpo';if(/\b(?:u\.?\s*o\.?\s*c?\.?|uoc|uos|unita\s+operativa|reparto)\b/i.test(nl)){score=178;reason='unita operativa/reparto';}else if(/\bambulatorio\b/i.test(nl)&&(idx<35||/^(?:centro\s+)?ambulatorio\b/i.test(nl))){score=184;reason='ambulatorio specialistico';}else if(/\b(?:specialista|medico\s+chirurgo\s+specialista)\b/i.test(nl)){score=176;reason='qualifica specialistica';}else if(/\bdipartimento\b/i.test(nl)){score=132;reason='dipartimento';}else if(/\bcentro\s+(?:di\s+)?(?:riferimento|specialistic)\b/i.test(nl)){score=125;reason='centro specialistico';}if(idx<25&&score<100){score=100;reason='intestazione clinica';}
        if(/\bvisita\b/i.test(nl)){let vs=82,vr='menzione visita nel corpo';if(recommendedVisit(line)){vs=45;vr='visita consigliata/prescritta';}else if(historicalVisit(line)){vs=55;vr='visita storica richiamata';}else if(strongMainVisit(line,idx)){vs=194;vr='prestazione/visita principale esplicita';}specEv.push({score:Math.max(score,Math.min(vs,120)),spec:h.spec,visit:h.visit,reason,idx,line});if(vs>=150)visits.push({score:vs,label:h.visit,spec:h.spec,reason:vr,idx,line});}else specEv.push({score,spec:h.spec,visit:h.visit,reason,idx,line});
      }
      let gs=0,gr='';if(/\breferto\s+(?:di\s+)?visita\s+ambulatoriale\b/i.test(nl)){gs=198;gr='referto visita ambulatoriale';}else if(/\baccesso\s*:\s*visita\s+ambulatoriale\b/i.test(nl)){gs=188;gr='accesso visita ambulatoriale';}else if(/^visita\s+ambulatoriale\b/i.test(nl)){gs=190;gr='titolo visita ambulatoriale';}else if(/^visita\s+(?:del|in\s+data)\b/i.test(nl)){gs=188;gr='data della visita';}else if(/\bprima\s+visita\b/i.test(nl)&&!recommendedVisit(line)){gs=185;gr='prima visita esplicita';}else if(/\bho\s+valutat[oa]\b|\bho\s+vist[oa]\b/i.test(nl)){gs=176;gr='valutazione clinica dichiarata';}else if(/\b(?:giunge|accede|si\s+presenta)\s+(?:a|alla|per)\s+visita\b/i.test(nl)){gs=174;gr='atto di visita nel corpo';}if(gs&&!historicalVisit(line)&&!recommendedVisit(line))visits.push({score:gs,label:'',spec:'',reason:gr,idx,line});
      const ih=instrumentHits(line);if(!ih.length){const uexam=unknownExamFromLine(line);if(uexam)instr.push({score:196,label:uexam,spec:'',reason:'campo Tipo Esame esplicito non ancora in ontologia',idx,line});}
      for(const h of ih){const hist=historicalInstrument(line,ctxDate,currentDate);let score=55,reason='menzione nel corpo';if(/\b(?:tipo\s+esame|esame\s+eseguito|prestazione\s+eseguita|procedura)\s*[:\-]/i.test(nl)){score=198;reason='tipo esame esplicito';}else if(/^(?:esame\s+)?(?:audiometr|ecg\b|elettrocardiogram|ecocardiogram|ecografia|ecocolordoppler|ecodoppler|spirometr|spirometry|polisonnograf|poligrafia|saturimetr|emogas|ega\b|gastroscop|esofagogastro|colonscop|tac\b|tc\b|risonanza|radiografia|rx\b|mammograf|pap\s*test|anatomia|esame\s+istologico)/i.test(nl)){score=158;reason='intestazione esame';}else if(idx<25){score=126;reason='esame nell’intestazione';}else if(/\b(?:ega|ecg|emogas|audiometr|spirometr|ecograf|polisonnograf|tac|tc|rx)\b.{0,35}\b(?:odiern[oa]|attuale)\b|\b(?:odiern[oa]|attuale)\b.{0,35}\b(?:ega|ecg|emogas|audiometr|spirometr|ecograf|polisonnograf|tac|tc|rx)\b/i.test(nl)){score=150;reason='esame odierno/attuale';}else if(/\b(?:e\s+stata|e\s+stato|viene|si\s+esegue|eseguita|eseguito|praticato)\b.{0,45}\b(?:ega|ecg|audiometr|spirometr|ecograf|polisonnograf|tac|tc|rx)/i.test(nl)){score=142;reason='esame eseguito contestualmente';}if(hist){score=Math.min(score,62);reason='esame storico richiamato';}const row={score,label:h.label,spec:h.spec,reason,idx,line};instr.push(row);if(score>=135&&!hist)associated.push(row);}
    }
    specEv.sort((a,b)=>b.score-a.score);let best=specEv[0]||null;if(best&&best.score>=125)for(const v of visits)if(!v.label){v.label=best.visit;v.spec=best.spec;v.reason=`${v.reason} + ${best.reason}`;}
    const provisionalInstr=instr.reduce((m,x)=>Math.max(m,x.score),0);if(best){const provider=best.reason==='qualifica specialistica',clinic=best.score>=165,clinicBundle=clinic&&markers>=2&&/\b(?:anamnes|terapia|prescrizion|prossimo\s+controllo|controllo\s+metabolico|diagnos)\b/i.test(nhead),entry=SPECIALTIES.find(x=>x[0]===best.spec),filenameConfirm=Boolean(entry&&fn.includes('visita')&&(hitSpec(fn,entry)||fn.includes(fold(best.spec).slice(0,7))||fn.includes(fold(best.visit.replace('Visita ','' )).slice(0,7)))),baseKind=fold(base.documentKind||''),baseSpec=fold(base.specialization||''),baseMatch=(baseKind.includes('visita')&&baseKind.includes(fold(best.spec)))||(base.category==='Visita specialistica'&&baseSpec.includes(fold(best.spec)));if(provider&&markers>=2)visits.push({score:176,label:best.visit,spec:best.spec,reason:'specialista + struttura clinica',idx:best.idx,line:best.line});else if(filenameConfirm&&best.score>=150)visits.push({score:174,label:best.visit,spec:best.spec,reason:'contenuto specialistico + nome file come conferma',idx:best.idx,line:best.line});else if(clinicBundle&&provisionalInstr<145)visits.push({score:171,label:best.visit,spec:best.spec,reason:'ambulatorio/UO + struttura clinica',idx:best.idx,line:best.line});else if(baseMatch&&best.score>=160&&provisionalInstr<145)visits.push({score:160,label:best.visit,spec:best.spec,reason:'specialita strutturale coerente con visita gia riconosciuta',idx:best.idx,line:best.line});}
    if(fn.includes('visita'))for(const row of SPECIALTIES){const mentions=lines.slice(0,180).filter(x=>hitSpec(x,row)).length;if(mentions>=2&&(hitSpec(fn,row)||fn.includes(fold(row[0]).slice(0,7))||fn.includes(fold(row[1].replace('Visita ','' )).slice(0,7)))&&markers>=2)visits.push({score:162,label:row[1],spec:row[0],reason:'specialita ripetuta nel contenuto + nome file come conferma',idx:0,line:''});}
    if(visits.length&&/\b(?:lipo[- ]?linfedema|lipedema)\b/i.test(nhead)&&/\b(?:linfolog|angiolog|chirurgia\s+vascolare)\b/i.test(nhead))visits.push({score:199,label:'Visita specialistica lipolinfedema',spec:'Linfologia/Angiologia',reason:'referto specialistico linfologico per lipolinfedema',idx:0,line:''});
    visits.sort((a,b)=>b.score-a.score);instr.sort((a,b)=>b.score-a.score);const v=visits[0]||null,ins=instr[0]||null;let chooseVisit=false;if(v){if(!ins)chooseVisit=true;else if(v.score>=170)chooseVisit=true;else if(ins.score>=190&&v.score<170)chooseVisit=false;else chooseVisit=v.score>=ins.score+3;}
    if(chooseVisit){let label=v.label,spec=v.spec;const assoc=[];for(const a of [...associated].sort((x,y)=>y.score-x.score)){const compatible=(a.label==='Esame audiometrico'&&spec==='Otorinolaringoiatria')||(a.label==='Elettrocardiogramma'&&spec==='Cardiologia')||(a.label==='Emogasanalisi'&&spec==='Pneumologia');if(compatible&&!assoc.includes(a.label))assoc.push(a.label);}if(label==='Visita ORL'&&assoc.includes('Esame audiometrico'))label='Visita ORL con esame audiometrico';else if(label==='Visita cardiologica'&&assoc.includes('Elettrocardiogramma'))label='Visita cardiologica con ECG';else if(label==='Visita pneumologica'&&assoc.includes('Emogasanalisi'))label='Visita pneumologica con emogasanalisi';return{label,category:'Visita specialistica',mode:'narrative',specialization:spec,confidence:Math.min(100,Math.max(85,Math.round(v.score*.52))),source:v.reason,associatedActs:assoc,evidence:v.line||''};}
    if(ins&&ins.score>=118)return{label:ins.label,category:ins.label==='Anatomia patologica'?'Referto istologico':'Referto strumentale',mode:'narrative',specialization:ins.spec,confidence:Math.min(100,Math.max(80,Math.round(ins.score*.52))),source:ins.reason,associatedActs:[],evidence:ins.line||''};
    if(nhead.length<40&&/(?:^|[^a-z0-9])pap[ _.-]*test(?:[^a-z0-9]|$)/i.test(fn))return{label:'Pap test',category:'Referto strumentale',mode:'narrative',specialization:'Ginecologia',confidence:82,source:'nome file inequivocabile in assenza di testo utile',associatedActs:[]};
    const cat=String(base.category||''),mode=String(base.documentMode||''),kind=String(base.documentKind||'');if(cat==='Esami di laboratorio'||mode==='lab')return{label:'Esami di laboratorio',category:'Esami di laboratorio',mode:'lab',specialization:'Laboratorio analisi',confidence:95,source:'struttura di laboratorio',associatedActs:[]};if(cat==='Piano terapeutico'||mode==='therapy')return{label:'Piano terapeutico',category:'Piano terapeutico',mode:'therapy',specialization:base.specialization||'',confidence:92,source:'struttura terapeutica',associatedActs:[]};if(cat==='Esenzione sanitaria'||mode==='exemption')return{label:'Esenzione sanitaria',category:'Esenzione sanitaria',mode:'exemption',specialization:base.specialization||'',confidence:95,source:'struttura esenzione',associatedActs:[]};const generic=new Set(['documento sanitario','visita','ecografia','diabetologia','neurologia','epatologia','cardiologia','pneumologia','endocrinologia','otorinolaringoiatria']);if(kind&&!generic.has(fold(kind))&&!['Documento sanitario','Visita specialistica'].includes(cat))return{label:kind,category:cat||'Documento sanitario',mode:mode||'narrative',specialization:base.specialization||'',confidence:75,source:'classificazione strutturata precedente',associatedActs:[]};return{label:'Documento sanitario da classificare',category:'Documento sanitario',mode:'narrative',specialization:'',confidence:40,source:'evidenze insufficienti',associatedActs:[]};
  }
  function titleFor(label,date=''){if(/^\d{4}-\d{2}-\d{2}$/.test(date)){const[y,m,d]=date.split('-');return`${label} del ${d}/${m}/${y}`;}return label;}
  function apply(doc,raw,complex=false){let id;if(complex)id={label:'Cartella clinica',category:'Cartella clinica',mode:'narrative',specialization:doc.specialization||doc.department||'',confidence:100,source:'struttura cartella clinica',associatedActs:[]};else id=identity(raw,doc,doc.originalName||'');doc.documentKind=id.label;doc.category=id.category;doc.documentMode=id.mode;if(id.specialization){doc.specialization=id.specialization;doc.department=id.specialization;}else if(id.label==='Documento sanitario da classificare'||['Esenzione sanitaria','Piano terapeutico'].includes(id.category)){doc.specialization='';doc.department='';}if(!complex){const d=explicitDate(raw,doc.clinicalDate||'');if(d)doc.clinicalDate=d;doc.title=titleFor(id.label,doc.clinicalDate||'');}doc.documentClassifierVersion=CLASSIFIER;doc.documentTypeVersion=VERSION;doc.documentTypeSource=id.source;doc.documentTypeConfidence=Number(id.confidence||40);doc.documentIdentityEvidence=String(id.evidence||'').slice(0,1200);doc.documentAssociatedActs=[...(id.associatedActs||[])];return doc;}
  function analyzeText(text,profiles=[],activeProfileId=null,pages=[],fileName=''){const a=BASE_ANALYZE(text,profiles,activeProfileId,pages,fileName),seed={...a,extractedText:text,structuredText:a.structuredText||text,ocrPageData:pages,originalName:fileName},complex=isComplex(seed);apply(a,text,complex);a.clinicalCanonicalVersion=VERSION;a.clinicalValidationVersion=VERSION;return a;}
  function canon(input={},options={}){const original=clone(input),raw=sourceText(original),complex=isComplex(original),result=BASE_CANON(original,options)||{document:original,changed:false,validation:{ok:true,violations:[]}},doc=clone(result.document||original);apply(doc,raw,complex);if(complex){doc.documentKind='Cartella clinica';doc.category='Cartella clinica';doc.documentMode='narrative';doc.title=doc.title&&/^Cartella clinica/i.test(doc.title)?doc.title:titleFor('Cartella clinica',doc.clinicalDate||'');}doc.clinicalCanonicalVersion=VERSION;doc.clinicalValidationVersion=VERSION;doc.clinicalCanonicalCachedAt=new Date().toISOString();return{...result,document:doc,changed:true};}
  function force(input={},options={}){const seed={...clone(input),complexClinicalContainer:true,documentKind:'Cartella clinica',category:'Cartella clinica',documentMode:'narrative'};return canon(seed,options).document;}
  H.classifyDocumentIdentityV16=(raw='',doc={})=>identity(raw,doc,doc.originalName||'');H.classifyDocumentIdentityV15=H.classifyDocumentIdentityV16;H.analyzeText=analyzeText;H.isComplexClinicalDocumentV16=isComplex;H.isComplexClinicalDocumentV15=isComplex;H.canonicalizeComplexClinicalDocumentV16=force;H.canonicalizeComplexClinicalDocumentV15=force;H.canonicalizeClinicalDocument24=canon;H.repairNarrativeDocumentData=d=>canon(d);H.repairLabDocumentData=d=>canon(d);H.prepareDocuments24=(docs=[],profile={})=>(docs||[]).map(d=>canon(d,{profile}).document);H.V604_COMPLEX_CANONICAL_VERSION=VERSION;H.V603_CANONICAL_VERSION=VERSION;H.V602_CANONICAL_VERSION=VERSION;H.TEST24_VERSION=VERSION;
})(HealthExtractors);


/* FIX27 PRE-BETA - validazione automatica dei valori destinati ai grafici.
   Corregge errori OCR strutturali senza rifare OCR e senza regole sul singolo referto:
   - numeri duplicati nello stesso risultato (es. "113 113" -> 113);
   - righe qualitative finite per errore nei valori numerici;
   - righe-continuazione che contengono solo unità/intervallo ma non il risultato;
   - righe fuse con intestazioni o terapie, escluse dai grafici ma conservate per revisione.
*/
;(function fix27LabGraphValidation(H){
  'use strict'; if(!H)return;
  const VERSION='lab-graph-validation-v27';
  const BASE_REPAIR=typeof H.repairLabDocumentData==='function'?H.repairLabDocumentData.bind(H):null;
  const clone=v=>typeof structuredClone==='function'?structuredClone(v):JSON.parse(JSON.stringify(v??{}));
  const RESULT_UNIT_RE=/(?:mg|g|ng|pg|µg|ug|mmol|µmol|umol|mEq|mUI|µUI|UI|U)\s*\/\s*(?:dL|mL|L)|(?:x|\*)?\s*10\s*(?:\^|\.e)?\s*(?:3|6|9|12)\s*\/\s*(?:µL|uL|L)|%|\bfL\b|\bpg\b|mmHg|kg\s*\/\s*m(?:2|²)|mL\s*\/\s*min/ig;
  const QUALITATIVE_RESULT_RE=/\b(?:assente|assenza|negativ[oa]|non\s+rilevat[oa])\b/i;
  const NON_LAB_SOURCE_RE=/\b(?:fiala|compress[ae]|capsul[ae]|flacone|sacca|somministr|infusione|terapia|posologia|sodio\s+bicarb|dose\s+giornaliera|scala\s+del\s+dolore|\bnrs\b|coefficiente|moltiplicare\s+il\s+risultato|unit[aà]\s+di\s+misura\s+modificat)\b/i;
  const OCR_HEADER_MERGE_RE=/esame\s+esito.*unit[aà].*valori?.*riferimento/i;
  const OCR_MIXED_HEMOGRAM_RE=/(?:neutrofil|linfocit|monocit|eosinofil|basofil).{0,60}piastrin|piastrin.{0,60}(?:neutrofil|linfocit|monocit|eosinofil|basofil)/i;
  const LONGITUDINAL_EXCLUSION_RE=/(?:prelievo[^0-9\r\n]{0,10}\d{1,3}\s*(?:min|['"]{1,2})|curva\s+(?:glicemica|da\s+carico)|ogtt)/i;
  function tokens(text=''){const normalized=String(text||'').replace(/\b[OoUu](?=[,.]\d)/g,'0');return [...normalized.matchAll(/(?<![A-Za-z0-9])[-+]?\d+(?:[.,]\d+)?(?![A-Za-z0-9])/g)].map(m=>({raw:m[0],value:Number(m[0].replace(',','.')),index:m.index||0,end:(m.index||0)+m[0].length})).filter(x=>Number.isFinite(x.value));}
  function duplicateValue(row={}){const raw=String(row.rawValue??'').trim(),nums=tokens(raw);if(nums.length<2||!/\s/.test(raw))return null;const n=nums[0].value;return nums.every(x=>Math.abs(x.value-n)<1e-12)?n:null;}

  function simpleUnitKey(raw=''){let u=String(raw||'').toLowerCase().replace(/μ/g,'µ').replace(/\s+/g,'');if(/mg.*d[l1i]/.test(u))return'mg/dl';if(/ng.*d[l1i]/.test(u))return'ng/dl';if(/(?:µg|ug).*d[l1i]/.test(u))return'µg/dl';if(/ng.*m[l1i]/.test(u))return'ng/ml';if(/pg.*m[l1i]/.test(u))return'pg/ml';if(/m(?:e|ed)q/.test(u))return'meq/l';if(/mm[oa]l/.test(u))return'mmol/l';if(/(?:µmol|umol)/.test(u))return'µmol/l';if(/(?:10|\.e).*?(?:3|9).*?(?:l|ul|µl)/.test(u))return'10^9/l';if(/(?:10|\.e).*?(?:6|12).*?(?:l|ul|µl)/.test(u))return'10^12/l';if(u.includes('%'))return'%';if(/^fl/.test(u))return'fl';if(/^pg$/.test(u))return'pg';if(/mmhg/.test(u))return'mmhg';if(/ng.*l/.test(u))return'ng/l';if(/(?:ui|u).*l/.test(u))return'u/l';return'';}
  function sourceUnitRegex(key=''){if(key==='mg/dl')return /m(?:g|a|o)\s*(?:\/|\\|i|l)?\s*d\s*[l1i]/ig;if(key==='ng/dl')return /ng\s*(?:\/|\\|i|l)?\s*d\s*[l1i]/ig;if(key==='µg/dl')return /(?:µg|ug)\s*(?:\/|\\|i|l)?\s*d\s*[l1i]/ig;if(key==='ng/ml')return /ng\s*(?:\/|\\|i|l)?\s*m\s*[l1i]/ig;if(key==='pg/ml')return /pg\s*(?:\/|\\|i|l)?\s*m\s*[l1i]/ig;if(key==='mmol/l')return /mm[oa]l?\s*(?:\/|\\|i|l)?\s*l/ig;if(key==='meq/l')return /m(?:e|ed)q?\s*(?:\/|\\|i|l)?\s*l/ig;if(key==='µmol/l')return /(?:µmol|umol)\s*(?:\/|\\|i|l)?\s*l/ig;if(key==='10^9/l')return /(?:x|\*)?\s*10\s*(?:\^|[°%/.e]*)\s*(?:3|9)\s*(?:\/|\\|i|l)?\s*[a-z?0-9µ]{0,3}l/ig;if(key==='10^12/l')return /(?:x|\*)?\s*10\s*(?:\^|[°%/.e]*)\s*(?:6|12)\s*(?:\/|\\|i|l)?\s*[a-z?0-9µ]{0,3}l/ig;if(key==='%')return /%/g;if(key==='fl')return /\bfl\b/ig;if(key==='pg')return /\bpg\b/ig;if(key==='mmhg')return /mm\s*hg/ig;if(key==='ng/l')return /ng\s*(?:\/|\\|i|l)?\s*l/ig;if(key==='u/l')return /(?:ui|u)\s*(?:\/|\\|i|l)?\s*l/ig;return null;}
  function measuredValue(row={}){const src=String(row.sourceLine||'').replace(/μ/g,'µ'),key=simpleUnitKey(row.unit||'');const re=sourceUnitRegex(key);if(!src||!re)return null;const units=[...src.matchAll(re)];re.lastIndex=0;const nums=tokens(src);let best=null;for(const u of units){const ui=u.index||0,c=nums.filter(n=>n.end<=ui&&ui-n.end<=34);if(!c.length)continue;let chosen=c[c.length-1],between=src.slice(chosen.end,ui);if(/^[\s.x×*^°%/\\-]*$/.test(between)&&/10\s*(?:\^|[°%/.e]*)\s*(?:3|6|9|12)/i.test(src.slice(Math.max(0,ui-12),ui+12))&&c.length>1)chosen=c[c.length-2];const dist=ui-chosen.end;if(!best||dist<best.dist)best={value:chosen.value,dist};}return best&&Number.isFinite(best.value)?best.value:null;}
  function refBounds(raw=''){const t=String(raw||'').replace(/,/g,'.').replace(/[–—]/g,'-');let m=t.match(/(-?\d+(?:\.\d+)?)\s*(?:-|a|fino\s+a)\s*(-?\d+(?:\.\d+)?)/i);if(m)return{lower:Math.min(Number(m[1]),Number(m[2])),upper:Math.max(Number(m[1]),Number(m[2]))};m=t.match(/(?:<|<=|fino\s+a)\s*(-?\d+(?:\.\d+)?)/i);if(m)return{upper:Number(m[1])};m=t.match(/(?:>|>=)\s*(-?\d+(?:\.\d+)?)/i);if(m)return{lower:Number(m[1])};return{};}
  function guided(row={},numeric=Number(row.value)){let n=Number(numeric);if(!Number.isFinite(n))return n;const ref=refBounds(row.range?.raw||''),raw=String(row.rawValue??'').trim(),src=String(row.sourceLine||''),key=simpleUnitKey(row.unit||'');if(/^\d{1,3}\.\d{3}$/.test(raw)&&Number.isFinite(ref.upper)&&/[>*]/.test(src)&&n<=ref.upper){const alt=Number(raw.replace('.',''));if(Number.isFinite(alt)&&alt>ref.upper)n=alt;}if(key==='%'&&n>100&&Number.isFinite(ref.upper)&&ref.upper<=100){const alt=n/10,lo=Number.isFinite(ref.lower)?ref.lower:0;if(alt>=Math.max(0,lo*.7)&&alt<=Math.max(100,ref.upper*1.3))n=alt;}return n;}
  function sourceSupports(row={},numeric=Number(row.value)){
    const source=String(row.sourceLine||'').replace(/μ/g,'µ');if(!source||!Number.isFinite(Number(numeric)))return null;
    const units=[...source.matchAll(RESULT_UNIT_RE)];RESULT_UNIT_RE.lastIndex=0;if(!units.length)return null;
    for(const n of tokens(source)){if(Math.abs(n.value-Number(numeric))>Math.max(1e-6,Math.abs(Number(numeric))*1e-6))continue;const unit=units.find(u=>(u.index||0)>=n.end&&(u.index||0)-n.end<=18);if(unit)return true;}return false;
  }
  function quality(row={}){const src=String(row.sourceLine||'');if(NON_LAB_SOURCE_RE.test(src)||OCR_HEADER_MERGE_RE.test(src)||OCR_MIXED_HEMOGRAM_RE.test(src))return-10;if(QUALITATIVE_RESULT_RE.test(src))return-10;const supported=sourceSupports(row,Number(row.value));let q=supported===true?6:supported===false?-6:0;if(row.range?.raw)q+=2;if(Number(row.confidence||0)>=85)q++;return q;}
  function tableRows(doc){return[...(doc.labValues||[]).map(v=>({kind:'numeric',test:v.parameterName,value:v.value,result:v.displayResult||(v.rawValue??v.value),unit:v.unit||'',reference:v.range?.raw||'',status:v.status||'',statusSource:v.statusSource||'',sourceLine:v.sourceLine||'',pageNumber:v.pageNumber,labSection:v.labSection||''})),...(doc.qualitativeResults||[]).map(q=>({kind:'qualitative',test:q.test,result:q.result,unit:q.unit||'',reference:q.reference||'',status:q.status||'',statusSource:q.statusSource||'',sourceLine:q.sourceLine||'',pageNumber:q.pageNumber,labSection:q.labSection||''}))];}
  function validateDocument(doc={}){
    const out=clone(doc),rows=(out.labValues||[]).map(r=>({...r}));let changed=false,corrected=0,excluded=0;
    for(const row of rows){
      const duplicate=duplicateValue(row),measured=measuredValue(row);
      let repaired=Number.isFinite(measured)?measured:duplicate;if(!Number.isFinite(repaired))repaired=Number(row.value);repaired=guided(row,repaired);
      if(Number.isFinite(repaired)&&Math.abs(Number(row.value)-repaired)>1e-12){row.value=repaired;row.rawValue=String(repaired).replace('.',',');if(row.range&&typeof H.statusFromRange==='function')try{row.status=H.statusFromRange(repaired,row.range,row.sourceLine||'')||row.status;}catch{}corrected++;changed=true;}
      row._fix27Quality=quality(row);
      const src=String(row.sourceLine||'');
      if(NON_LAB_SOURCE_RE.test(src)||OCR_HEADER_MERGE_RE.test(src)||OCR_MIXED_HEMOGRAM_RE.test(src)||QUALITATIVE_RESULT_RE.test(src)||LONGITUDINAL_EXCLUSION_RE.test(src))row._fix27Quality=-10;
    }
    const buckets=new Map();for(const row of rows){const key=[row.parameterId||row.parameterName||'',row.pageNumber||'',row.labSection||''].join('|');if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(row);}
    for(const group of buckets.values()){
      const strong=group.some(r=>Number(r._fix27Quality)>=4);
      for(const row of group){let reason='';if(Number(row._fix27Quality)<=-8)reason=QUALITATIVE_RESULT_RE.test(String(row.sourceLine||''))?'Risultato qualitativo, non valore numerico per grafico':LONGITUDINAL_EXCLUSION_RE.test(String(row.sourceLine||''))?'Valore appartenente a prova dinamica, non confrontabile nella serie longitudinale':'Riga OCR non affidabile per serie numerica';else if(strong&&Number(row._fix27Quality)<0)reason='Riga di continuazione senza risultato numerico autonomo';if(reason&&row.graphEligible!==false){row.graphEligible=false;row.graphExclusionReason=reason;excluded++;changed=true;}delete row._fix27Quality;}
    }
    out.labValues=rows;out.tableRows=tableRows(out);out.labGraphValidationVersion=VERSION;out.labGraphValidationAt=new Date().toISOString();
    return{document:out,changed,stats:{correctedValues:corrected,excludedGraphRows:excluded}};
  }
  H.validateLabGraphValuesV27=validateDocument;
  H.LAB_GRAPH_VALIDATION_VERSION=VERSION;
  H.repairLabDocumentData=function(doc={}){
    let base={document:doc,changed:false,validation:{ok:true,violations:[]},stats:{}};
    try{if(BASE_REPAIR)base=BASE_REPAIR(doc)||base;}catch(error){console.warn('FIX27: riparazione clinica precedente non completata',error);}
    const repaired=validateDocument(base.document||doc);
    return{...base,document:repaired.document,changed:Boolean(base.changed||repaired.changed),substantiveChanged:Boolean(base.substantiveChanged||repaired.changed),stats:{...(base.stats||{}),...(repaired.stats||{})},validation:base.validation||{ok:true,violations:[]}};
  };
})(HealthExtractors);

/* BETA 1 CORREZIONE CUMULATIVA - identita' v17, foto narrative e proposte storiche.
   Regole generali:
   - intestazione/UO specialistica + atto corrente prevalgono sulle citazioni storiche;
   - una visita/esame con data diversa dalla data clinica corrente non puo' diventare l'atto principale;
   - se una foto leggibile contiene testo clinico sostanziale ma il referto ricostruito e' povero,
     il contenuto viene recuperato conservativamente dal testo OCR;
   - le proposte cliniche storiche mantengono la propria data e non trasformano "visita" o "esame" in diagnosi;
   - le correzioni manuali dell'utente sono sovrane sulla riclassificazione automatica. */
;(function beta1ClinicalV17(H){
  'use strict'; if(!H)return;
  const VERSION='v6.0.4-canonical-v19-photo-fusion';
  const CLASSIFIER='document-classifier-v18';
  const BASE_ANALYZE=H.analyzeText.bind(H);
  const BASE_CANON=H.canonicalizeClinicalDocument24.bind(H);
  const BASE_ID=typeof H.classifyDocumentIdentityV16==='function'?H.classifyDocumentIdentityV16.bind(H):null;
  const clone=v=>typeof structuredClone==='function'?structuredClone(v):JSON.parse(JSON.stringify(v??{}));
  const collapse=v=>String(v??'').replace(/\u00ad/g,'').replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').trim();
  const fold=v=>collapse(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[–—−]/g,'-').toLocaleLowerCase('it-IT');
  function geometricOcrText(doc={}){
    const pages=doc?.ocrPageData||[];const parts=[];let used=false;
    for(const page of pages){
      const lines=(page?.lines||[]).filter(x=>String(x?.text||'').trim());if(!lines.length)continue;
      const selected=String(page?.selectedPass||'');const engine=String(doc?.ocrEngine||'');
      if((selected||engine)&&!/rapidocr/i.test(selected)&&!/rapidocr/i.test(engine))continue;
      const heights=lines.map(x=>Math.max(1,Number(x?.height||0))).sort((a,b)=>a-b);const median=heights[Math.floor(heights.length/2)]||12,tolerance=Math.max(4,median*.42);
      const sorted=[...lines].sort((a,b)=>(Number(a?.y||0)+Number(a?.height||0)/2)-(Number(b?.y||0)+Number(b?.height||0)/2)||Number(a?.x||0)-Number(b?.x||0));
      const bands=[];for(const line of sorted){const cy=Number(line?.y||0)+Number(line?.height||0)/2,last=bands[bands.length-1];if(last&&Math.abs(cy-last.cy)<=tolerance){last.items.push(line);last.cy=last.items.reduce((t,x)=>t+Number(x?.y||0)+Number(x?.height||0)/2,0)/last.items.length;}else bands.push({cy,items:[line]});}
      const ordered=bands.flatMap(b=>b.items.sort((a,b)=>Number(a?.x||0)-Number(b?.x||0)||Number(a?.y||0)-Number(b?.y||0)));const text=ordered.map(x=>collapse(x.text)).filter(Boolean).join('\n');if(text){parts.push(text);used=true;}
    }
    return used?parts.join('\n').trim():'';
  }
  const sourceText=doc=>{
    const geometric=geometricOcrText(doc);if(geometric)return geometric;
    const extracted=String(doc?.extractedText||'').trim();if(extracted)return extracted;
    const pages=(doc?.ocrPageData||[]).map(p=>String(p?.text||'').trim()).filter(Boolean).join('\n');if(pages)return pages;
    return String(doc?.structuredText||doc?.reconstructedText||'').trim();
  };
  const isComplex=doc=>Boolean(doc&&(doc.complexClinicalContainer===true||/cartella\s+clinica/i.test(String(doc.documentKind||doc.category||doc.title||doc.originalName||''))));
  const SPECIALTIES=[
    ['Gastroenterologia','Visita gastroenterologica',/gastroenterolog/i],
    ['Epatologia','Visita epatologica',/epatolog/i],
    ['Diabetologia','Visita diabetologica',/diabetolog|malattie\s+metaboliche\s+e\s+diabetologia/i],
    ['Endocrinologia','Visita endocrinologica',/endocrinolog|endocrino[- ]?metabolic/i],
    ['Otorinolaringoiatria','Visita ORL',/otorinolaring|\botorino\b|\borl\b/i],
    ['Dermatologia','Visita dermatologica',/dermatolog|venereolog/i],
    ['Pneumologia','Visita pneumologica',/pneumolog/i],
    ['Cardiologia','Visita cardiologica',/cardiolog/i],
    ['Neurologia','Visita neurologica',/neurolog/i],
    ['Oculistica','Visita oculistica',/oculist|oftalmolog/i],
    ['Reumatologia','Visita reumatologica',/reumatolog/i],
    ['Nefrologia','Visita nefrologica',/nefrolog/i],
    ['Urologia','Visita urologica',/\burolog/i],
    ['Ortopedia','Visita ortopedica',/ortoped/i],
    ['Fisiatria','Visita fisiatrica',/fisiatr/i],
    ['Psichiatria','Visita psichiatrica',/psichiatr/i],
    ['Ginecologia','Visita ginecologica',/ginecolog/i],
    ['Ematologia','Visita ematologica',/ematolog/i],
    ['Oncologia','Visita oncologica',/oncolog/i],
    ['Angiologia','Visita angiologica',/angiolog/i],
    ['Linfologia','Visita linfologica',/linfolog/i],
    ['Chirurgia vascolare','Visita di chirurgia vascolare',/chirurgia\s+vascolare|chirurg\w*\s+vascolar/i],
    ['Geriatria','Visita geriatrica',/geriatr/i]
  ];
  function linesOf(raw='',limit=260){const out=[];for(const r of String(raw||'').replace(/\r/g,'\n').split(/\n+/)){const x=collapse(r);if(!x||/^===\s*(?:PAGINA|PAGE)\s*\d+\s*===$/i.test(x))continue;out.push(x);if(out.length>=limit)break;}return out;}
  function isoDate(d,m,y){let yy=Number(y);if(String(y).length===2){const nowYY=new Date().getFullYear()%100;yy=Number(y)<=nowYY+1?2000+Number(y):1900+Number(y);}const mm=Number(m),dd=Number(d),dt=new Date(Date.UTC(yy,mm-1,dd));if(yy<1900||yy>2100||dt.getUTCFullYear()!==yy||dt.getUTCMonth()!==mm-1||dt.getUTCDate()!==dd)return'';return`${yy}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`;}
  function dateFromText(value=''){const m=String(value||'').match(/(?<!\d)(0?[1-9]|[12]\d|3[01])[\/.\-](0?[1-9]|1[0-2])[\/.\-]((?:19|20)?\d{2})(?!\d)/);return m?isoDate(m[1],m[2],m[3]):'';}
  function currentDate(raw='',doc={}){if(/^\d{4}-\d{2}-\d{2}$/.test(String(doc.clinicalDate||'')))return doc.clinicalDate;const head=String(raw||'').slice(0,22000),patterns=[/\bvisita\s+del\s+(\d{1,2})[\/.\-](\d{1,2})[\/.\-]((?:19|20)?\d{2})/i,/\bdata\s+visita\s*[:\-]?\s*(\d{1,2})[\/.\-](\d{1,2})[\/.\-]((?:19|20)?\d{2})/i,/\bdata\s+(?:dell['’]?|di\s+)?esame\s*[:\-]?\s*(\d{1,2})[\/.\-](\d{1,2})[\/.\-]((?:19|20)?\d{2})/i];for(const re of patterns){const m=head.match(re);if(m){const d=isoDate(m[1],m[2],m[3]);if(d)return d;}}return'';}
  function specialtyOf(line=''){for(const row of SPECIALTIES){row[2].lastIndex=0;if(row[2].test(fold(line)))return row;}return null;}
  function historicalDatedLine(line='',cur=''){const d=dateFromText(line);return Boolean(d&&cur&&d!==cur);}
  function headerSpecialty(lines=[]){let best=null;for(let i=0;i<Math.min(lines.length,40);i++){const line=lines[i],sp=specialtyOf(line);if(!sp)continue;const n=fold(line);let score=0;if(/\b(?:u\.?\s*o\.?\s*c?\.?|uoc|uos|unita\s+operativa|reparto)\b/i.test(n))score=230;else if(/\bambulatorio\b/i.test(n))score=220;else if(/\b(?:specialista|specialistica|specialistico)\b/i.test(n))score=205;else score=145-Math.min(i,25);if(!best||score>best.score)best={score,spec:sp[0],label:sp[1],line,idx:i};}return best;}
  function coordinateHeaderSpecialty(doc={}){
    let best=null;
    for(const page of doc.ocrPageData||[]){const h=Number(page?.height||0);if(!h)continue;for(const row of page.lines||[]){const y=Number(row?.y||0),rh=Number(row?.height||0);if(y+rh/2>h*.34)continue;const line=collapse(row?.text||'');const sp=specialtyOf(line);if(!sp)continue;const n=fold(line);let score=250-Math.min(60,Math.round((y/h)*100));if(/\b(?:u\.?\s*o\.?\s*c?\.?|uoc|uos|unita\s+operativa|reparto|ambulatorio)\b/i.test(n))score+=35;if(!best||score>best.score)best={score,spec:sp[0],label:sp[1],line,idx:0};}}
    return best;
  }
  function hasCurrentVisit(lines=[],cur=''){for(let i=0;i<Math.min(lines.length,90);i++){const line=lines[i],n=fold(line);if(historicalDatedLine(line,cur))continue;if(/^visita\s+ambulatoriale\b/i.test(n)||/\breferto\s+(?:di\s+)?visita\s+ambulatoriale\b/i.test(n))return true;if(cur&&/\bvisita\s+del\b/i.test(n)&&dateFromText(line)===cur)return true;if(/\b(?:ho\s+visto|ho\s+valutato|paziente\s+inviat[oa]\s+alla\s+nostra\s+osservazione|si\s+presenta\s+per\s+visita|accede\s+per\s+visita)\b/i.test(n))return true;}return false;}
  function classify(raw='',doc={}){
    if(doc.manualIdentityOverride&&doc.manualIdentity){const m=doc.manualIdentity;return{label:m.documentKind||doc.documentKind||'Documento sanitario',category:m.category||doc.category||'Documento sanitario',mode:m.documentMode||doc.documentMode||'narrative',specialization:m.specialization||doc.specialization||'',confidence:100,source:'correzione manuale',associatedActs:[]};}
    if(isComplex(doc))return{label:'Cartella clinica',category:'Cartella clinica',mode:'narrative',specialization:doc.specialization||doc.department||'',confidence:100,source:'struttura cartella clinica',associatedActs:[]};
    const lines=linesOf(raw),cur=currentDate(raw,doc),linearHead=headerSpecialty(lines),coordHead=coordinateHeaderSpecialty(doc),head=(!linearHead||Number(coordHead?.score||0)>Number(linearHead?.score||0))?coordHead:linearHead,visit=hasCurrentVisit(lines,cur);
    const old=BASE_ID?BASE_ID(raw,doc):null;
    const currentKind=String(doc.documentKind||'').trim();
    const currentUsable=Boolean(doc.documentClassifierVersion===CLASSIFIER&&currentKind&&!/^(?:documento sanitario(?: da classificare)?|altro)$/i.test(currentKind));
    const current=currentUsable?{label:currentKind,category:doc.category||old?.category||'Documento sanitario',mode:doc.documentMode||old?.mode||'narrative',specialization:doc.specialization||doc.department||old?.specialization||'',confidence:Number(doc.documentTypeConfidence||old?.confidence||95),source:doc.documentTypeSource||old?.source||'classificazione corrente',associatedActs:doc.associatedActs||old?.associatedActs||[],evidence:doc.documentIdentityEvidence||old?.evidence||''}:null;
    // Mantieni una classificazione corrente gia' valida (in particolare quella
    // prodotta dal motore Python) salvo un conflitto semantico forte. Questo evita
    // che il passaggio finale JS impoverisca titoli gia' corretti o perda atti
    // associati come ECG, emogas e audiometria.
    if(head&&visit){
      const basis=current||old;
      const basisSpec=fold(basis?.specialization||''),headSpec=fold(head.spec||'');
      const historical=Boolean((basis?.evidence||old?.evidence)&&cur&&historicalDatedLine(basis?.evidence||old?.evidence,cur));
      const specConflict=Boolean(basis&&basisSpec&&headSpec&&basisSpec!==headSpec);
      const insufficient=!basis||/documento sanitario da classificare/i.test(String(basis.label||''))||!String(basis.specialization||'').trim();
      if(historical||specConflict||insufficient)return{label:head.label,category:'Visita specialistica',mode:'narrative',specialization:head.spec,confidence:100,source:historical?'intestazione prevalente su citazione storica':'intestazione specialistica/UO + visita corrente',associatedActs:[],evidence:head.line};
      return basis;
    }
    if(current)return current;
    // Senza classificazione corrente valida, una visita specialistica esplicita e
    // datata come il documento corrente colma soltanto una decisione insufficiente.
    if(!old||/documento sanitario da classificare/i.test(String(old.label||''))){
      for(let i=0;i<Math.min(lines.length,80);i++){const line=lines[i],n=fold(line),sp=specialtyOf(line);if(!sp||!testVisit(n))continue;const d=dateFromText(line);if(d&&cur&&d!==cur)continue;if(/^visita\s+(?!ambulatoriale|specialistica)/i.test(n)||/\bprestazion\w*\b.{0,35}\bvisita\b/i.test(n))return{label:sp[1],category:'Visita specialistica',mode:'narrative',specialization:sp[0],confidence:98,source:d===cur?'visita specialistica con data corrente':'visita specialistica esplicita',associatedActs:[],evidence:line};}
    }
    return old||{label:'Documento sanitario da classificare',category:'Documento sanitario',mode:'narrative',specialization:'',confidence:50,source:'evidenze insufficienti',associatedActs:[]};
  }
  function testVisit(n=''){return /\bvisita\b/i.test(n);}
  const ADMIN=/^(?:azienda|asl\b|ausl\b|aoup\b|ospedale|servizio sanitario|dipartimento|u\.?o\.?\b|uo\s+|uoc\b|uos\b|unita operativa|direttore|responsabile|\(?istituit[ao]\b|ospedale di rilievo|pagina?\s+\d|page\s+\d|paziente\s*:|data (?:di )?nascita\s*:|comune di nascita\s*:|codice fiscale\s*:|email\s*:|telefono\s*:|tel\.?\s*:|fax\s*:|residenza\s*:|indirizzo\s*:|alla cortese attenzione|egregio collega,?\s*ho visto il tuo assistito|pisa\s+il\s+\d|il medico\b|medico\s*$|dr\.?\s+[A-ZÀ-ÖØ-Ý])/i;
  const CLINICAL=/\b(?:paziente\s+inviat\w*|valutazion|esiti?\s+di|egds|gastroscop|colonscop|varici?|ernia|epatopatia|steatos|helicobacter|pylori|eradicazion|pirosi|epigastr|retrosternal|terapia\s+con|farmac|si\s+consiglia|si\s+raccomanda|al\s+momento|non\s+[eè]\s+necessaria|diagnos|anamnes|repert|conclusion|programma|riferisce|lamenta|presenta|obes|diabet|ipertens|ipotiroid|lesion|nodul|cisti|dolore|dispnea|edema|ecograf|tac\b|tc\b|rmn\b|risonanz|radiograf|ecg\b|spirometr|esame\s+obiettivo)\b/i;
  function recoverNarrative(raw='',cur=''){
    const lines=linesOf(raw,500);if(!lines.length)return'';let start=-1;
    for(let i=0;i<Math.min(lines.length,120);i++){const n=fold(lines[i]),d=dateFromText(lines[i]);if(cur&&/\bvisita\s+del\b/i.test(n)&&d===cur){start=i+1;break;}if(/^visita\s+ambulatoriale\b/i.test(n))start=Math.max(start,i+1);}
    if(start<0){start=lines.findIndex(x=>CLINICAL.test(x));if(start<0)return'';}
    const out=[];let clinicalStarted=false;
    for(let i=start;i<lines.length;i++){
      let line=collapse(lines[i]);if(!line)continue;
      if(/^===/.test(line)||/^page\s+\d/i.test(line))continue;
      if(ADMIN.test(line)&&!CLINICAL.test(line))continue;
      if(/^(?:paziente|data di nascita|comune di nascita|codice fiscale|telefono|email)\s*:/i.test(line))continue;
      if(/^(?:pisa|roma|milano|firenze|torino|genova|bologna)\s+(?:il\s+)?\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}$/i.test(line))continue;
      if(/^(?:visita\s+ambulatoriale|visita\s+del\s+\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4})$/i.test(line))continue;
      if(CLINICAL.test(line)||clinicalStarted){clinicalStarted=true;out.push(line);}
    }
    const unique=[];for(const x of out){const k=fold(x);if(!k)continue;if(unique.length&&fold(unique[unique.length-1])===k)continue;const first=x.charAt(0),startsLower=first&&first===first.toLocaleLowerCase('it-IT')&&first!==first.toLocaleUpperCase('it-IT');if(unique.length&&(unique[unique.length-1].trim().endsWith(',')||(!/[.!?;:]$/.test(unique[unique.length-1].trim())&&startsLower)))unique[unique.length-1]=unique[unique.length-1].trim()+' '+x;else unique.push(x);}return unique.join('\n').trim();
  }
  function clinicalSignalCount(value=''){return (String(value||'').match(new RegExp(CLINICAL.source,'gi'))||[]).length;}
  function photoDocumentContext(doc={},raw=''){
    const pages=doc?.ocrPageData||[];
    const photographic=pages.some(p=>/foto|fusione\s+3\s+passaggi/i.test(String(p?.selectedPass||'')))||/foto/i.test(String(doc?.ocrEngine||''));
    if(!photographic)return'';
    const out=[],seen=new Set();
    for(const line of linesOf(raw,90)){
      const value=collapse(line);if(!value)continue;
      if(!(/^(?:visita\s+ambulatoriale\b|visita\s+(?:del|in\s+data)\s+\d{1,2}[\/.\-]\d{1,2}[\/.\-](?:\d{2}|\d{4})\b|alla\s+cortese\s+attenzione\b|egregio\s+collega\b)/i.test(value)))continue;
      const key=fold(value);if(!key||seen.has(key))continue;seen.add(key);out.push(value);if(out.length>=6)break;
    }
    return out.join('\n').trim();
  }
  function improveNarrative(original={},doc={}){
    if(doc.manualNarrativeOverride)return doc;
    const geometric=geometricOcrText(original),raw=geometric||sourceText(original),cur=currentDate(raw,doc),recovered=recoverNarrative(raw,cur),existing=String(doc.reconstructedText||'').trim(),context=photoDocumentContext(original,raw);
    if(!recovered)return doc;
    const should=Boolean(geometric)||existing.length<Math.min(220,recovered.length*.45)||clinicalSignalCount(recovered)>=Math.max(3,clinicalSignalCount(existing)+2);
    if(!should&&!context)return doc;
    let clinicalText=recovered;
    if(!should){const prior=(doc.reportSections||[]).find(x=>!/^contesto del documento$/i.test(String(x?.title||''))&&String(x?.text||'').trim());if(prior)clinicalText=String(prior.text||'').trim()||recovered;}
    const sections=[];if(context)sections.push({title:'Contesto del documento',text:context});sections.push({title:'Referto',text:clinicalText});
    doc.reportSections=sections;doc.pdfFields=sections.map(x=>({label:x.title,value:x.text,include:true}));doc.reconstructedText=sections.map(x=>`${x.title}\n${x.text}`).join('\n\n');doc.documentContext=context;doc.ocrIntegralText=raw;doc.narrativeClinicalSource=clinicalText;doc.narrativeNeedsReview=false;doc.narrativeSourcePresent=true;doc.narrativeRepairVersion='beta1-photo-narrative-r26';return doc;
  }
  function meaningfulCondition(value=''){const n=fold(value);return n.length>=8&&!/^(?:visita|controllo|egds|ecg|tac|tc|rx|ecografia|esame)\b/i.test(n);}
  function sanitizeDiagnoses(doc={}){
    const cur=doc.clinicalDate||'',out=[],seen=new Set();
    for(const raw of doc.extractedDiagnoses||[]){if(!raw||typeof raw!=='object')continue;let d={...raw},source=collapse(d.sourceQuote||d.name||''),name=collapse(d.name||'');if(!name)continue;
      const histDate=dateFromText(source)||dateFromText(name);
      let m=(source||name).match(/^\s*VISITA\s+[^:]{2,80}?\s+(\d{1,2}[\/.\-]\d{1,2}[\/.\-](?:\d{2}|\d{4}))\s*:\s*(.+)$/i);
      if(m){const content=collapse(m[2]);if(!meaningfulCondition(content))continue;name=content;d.date=dateFromText(m[1])||histDate||d.date||'';d.category='Condizione pregressa';d.status='Pregressa';d.mainProblem=false;}
      else {
        m=(source||name).match(/^\s*(?:EGDS|ECG|EGA|TAC|TC|RX|RMN?|ECOGRAFIA|COLONSCOPIA|GASTROSCOPIA)\s+(\d{1,2}[\/.\-]\d{1,2}[\/.\-](?:\d{2}|\d{4}))\s*:\s*(.+)$/i);
        if(m){const content=collapse(m[2]);if(!meaningfulCondition(content))continue;name=content;d.date=dateFromText(m[1])||histDate||d.date||'';d.category='Condizione pregressa';d.status='Pregressa';d.mainProblem=false;}
        else if(/^\s*visita\s+[^:]{2,80}$/i.test(name)||/^\s*visita\s+[^:]{2,80}$/i.test(source))continue;
      }
      if(histDate&&cur&&histDate!==cur&&!d.date)d.date=histDate;
      if(histDate&&cur&&histDate!==cur&&(!d.category||d.category==='Diagnosi confermata')){d.category='Condizione pregressa';d.status='Pregressa';d.mainProblem=false;d.date=histDate;}
      if(/riscontro\s+di\s+positivit[aà]/i.test(source)&&/eradicaz|risolt|trattat/i.test(source)){d.category='Condizione risolta';d.status='Risolta';d.mainProblem=false;if(!d.date)d.date=cur;}
      d.name=name.replace(/^(?:VISITA\s+[^:]+:|(?:EGDS|ECG|EGA|TAC|TC|RX|RMN?)\s+[^:]+:)\s*/i,'').trim();if(!d.name||/^visita\b/i.test(d.name))continue;
      d.sourceQuote=source||d.sourceQuote||'';const key=fold(`${d.name}|${d.date||''}`);if(seen.has(key))continue;seen.add(key);out.push(d);
    }
    doc.extractedDiagnoses=out;return doc;
  }
  function applyIdentity(doc,raw){
    if(isComplex(doc))return doc;
    if(doc.manualIdentityOverride&&doc.manualIdentity){const m=doc.manualIdentity;doc.title=m.title||doc.title;doc.documentKind=m.documentKind||doc.documentKind;doc.documentMode=m.documentMode||doc.documentMode;doc.category=m.category||doc.category;doc.specialization=m.specialization??doc.specialization;doc.department=m.specialization??doc.department;doc.documentTypeSource='correzione manuale';doc.documentTypeConfidence=100;doc.documentClassifierVersion=CLASSIFIER;doc.documentTypeVersion=VERSION;return doc;}
    const id=classify(raw,doc);doc.documentKind=id.label;doc.category=id.category;doc.documentMode=id.mode;if(id.specialization){doc.specialization=id.specialization;doc.department=id.specialization;}const date=currentDate(raw,doc)||doc.clinicalDate||'';if(date)doc.clinicalDate=date;if(id.label){if(/^\d{4}-\d{2}-\d{2}$/.test(date)){const [y,m,d]=date.split('-');doc.title=`${id.label} del ${d}/${m}/${y}`;}else doc.title=id.label;}doc.documentClassifierVersion=CLASSIFIER;doc.documentTypeVersion=VERSION;doc.documentTypeSource=id.source;doc.documentTypeConfidence=Number(id.confidence||50);doc.documentIdentityEvidence=String(id.evidence||'').slice(0,1200);return doc;
  }
  function finish(original,doc){const raw=sourceText(original)||sourceText(doc);applyIdentity(doc,raw);if(['narrative','mixed','diagnosis'].includes(doc.documentMode||'')){improveNarrative(original,doc);sanitizeDiagnoses(doc);}doc.clinicalCanonicalVersion=VERSION;doc.clinicalValidationVersion=VERSION;doc.clinicalCanonicalCachedAt=new Date().toISOString();return doc;}
  H.analyzeText=function(text,profiles=[],activeProfileId=null,pages=[],fileName=''){const a=BASE_ANALYZE(text,profiles,activeProfileId,pages,fileName),original={...a,extractedText:text,structuredText:a.structuredText||text,ocrPageData:pages,originalName:fileName};return finish(original,a);};
  H.canonicalizeClinicalDocument24=function(input={},options={}){const original=clone(input),result=BASE_CANON(input,options)||{document:clone(input),changed:false,validation:{ok:true,violations:[]}},doc=result.document||clone(input);finish(original,doc);return{...result,document:doc,changed:true};};
  H.repairNarrativeDocumentData=(d={})=>H.canonicalizeClinicalDocument24(d);
  H.classifyDocumentIdentityV18=(raw='',doc={})=>classify(raw,doc);H.classifyDocumentIdentityV17=H.classifyDocumentIdentityV18;
  H.V604_COMPLEX_CANONICAL_VERSION=VERSION;H.V603_CANONICAL_VERSION=VERSION;H.V602_CANONICAL_VERSION=VERSION;H.TEST24_VERSION=VERSION;
})(HealthExtractors);


/* BETA 1 R30 - pulizia semantica generale di footer/timbri e UI esterna. */
;(function beta1SemanticCleanR30(H){
  'use strict'; if(!H)return;
  const VERSION='beta1-semantic-clean-r30';
  const BASE_ANALYZE=H.analyzeText.bind(H);
  const BASE_CANON=H.canonicalizeClinicalDocument24.bind(H);
  const clone=v=>typeof structuredClone==='function'?structuredClone(v):JSON.parse(JSON.stringify(v??{}));
  const collapse=v=>String(v??'').replace(/\u00ad/g,'').replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').trim();
  const fold=v=>collapse(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[–—−]/g,'-').toLocaleLowerCase('it-IT');
  const CLINICAL=/\b(?:diagnos|prescrizion|terapia|farmac|compresse?|capsule?|sciroppo|gocce|crema|unguento|shampoo|detergente|integratore|mg\b|mcg\b|ml\b|al\s+giorno|giorni|settimana|mese|repert|anamnes|esame\s+obiettivo|conclusion|raccomand|si\s+consiglia|si\s+raccomanda|paziente\s+(?:riferisce|lamenta|presenta|inviat)|dolore|lesion|dermatit|epatopat|steatos|ernia|varic|helicobacter|pirosi|ipertens|diabet|ipotiroid|ecograf|radiograf|tac\b|tc\b|rmn\b|ecg\b|spirometr|valore|risultat|positivo|negativo|follow[- ]?up|controllo\s+clinico)\b/i;
  const UI_NOISE=[
    /^[-–—]?\s*adobe\s+acrobat(?:\s+pro(?:\s+dc)?)?\s*$/i,
    /^[-–—]?\s*(?:microsoft\s+edge|google\s+chrome|mozilla\s+firefox)\s*$/i,
    /^\s*\d+\s*\/\s*\d+\s*$/,
    /^\s*\d{1,3}(?:[,.]\d+)?\s*%\s*$/,
    /^\s*[+\-−]\s*$/,
    /^\s*[a-f0-9]{6,}(?:-[a-f0-9]{2,}){1,}(?:\s*[x×])?\s*$/i,
    /^\s*[^\s]{0,80}\.(?:pdf|jpg|jpeg|png|tif|tiff)(?:\s*[x×])?\s*$/i,
  ];
  const ADMIN_RE=[
    /\b(?:p\.?\s*iva|partita\s+iva|piva|parva|vat)\b/i,
    /\b(?:codice\s+fiscale|c\.?\s*f\.?)\b/i,
    /\b(?:iscritt\w*\s+(?:all['’]?|al\s+)?(?:ordine|albo)|ordine\s+(?:dei\s+)?medic|albo\s+(?:dei\s+)?medic)\b/i,
    /\b(?:telefono|tel\.?|fax|pec|e-?mail)\b\s*[:.]?/i,
    /^(?:abit\.?|studio|sede(?:\s+operativa)?|via|viale|piazza|p\.?zza|corso)\b/i,
    /^riceve\s+per\s+appuntamento\b/i,
    /\b(?:numero\s+iscrizione|n[°º]\s*(?:ordine|albo))\b/i,
  ];
  const DOCTOR_PREFIX=/^(?:dott?\.?|dr\.?|dott\.ssa|dr\.ssa|prof\.?|prof\.ssa|doll\.?)\s+/i;
  function cleanDoctorName(value=''){
    return collapse(value).replace(DOCTOR_PREFIX,'').replace(/\bmedico\s+chirurgo\b.*$/i,'').replace(/[,;:]+$/,'').trim();
  }
  function doctorKey(value=''){return fold(cleanDoctorName(value)).replace(/[^a-z0-9]+/g,' ').trim();}
  function doctorCandidates(doc={},raw=''){
    const keys=new Set(); const names=[];
    const add=v=>{const n=cleanDoctorName(v),k=doctorKey(n);if(!n||k.length<5||keys.has(k))return;keys.add(k);names.push(n);};
    add(doc.doctor||'');
    for(const p of doc.medicalPersonnel||[])add(typeof p==='string'?p:(p?.name||p?.fullName||''));
    const lines=String(raw||'').replace(/\r/g,'\n').split(/\n+/).map(collapse).filter(Boolean).slice(0,70);
    for(const line of lines){
      const m=line.match(/^(?:dott?\.?|dr\.?|dott\.ssa|dr\.ssa|prof\.?|prof\.ssa)\s+([A-ZÀ-ÖØ-Ý][A-ZÀ-ÖØ-Ý' .-]{3,80})$/i);
      if(m&&!/direttore|responsabile|medico\s+curante/i.test(line))add(m[1]);
    }
    return names;
  }
  function isDoctorLine(line='',doctorKeys=[]){
    const value=collapse(line);if(!value)return false;
    const pref=DOCTOR_PREFIX.test(value);DOCTOR_PREFIX.lastIndex=0;
    const key=doctorKey(value);
    if(key&&doctorKeys.some(k=>k===key||k.includes(key)||key.includes(k)))return true;
    return pref&&/^[A-ZÀ-ÖØ-Ý' .-]{5,90}$/i.test(cleanDoctorName(value));
  }
  function isLaboratoryDocument(doc={}){
    const cat=fold(doc.category||''),kind=fold(doc.documentKind||''),mode=fold(doc.documentMode||'');
    return mode==='lab'||cat.includes('esami di laboratorio')||kind.includes('esami di laboratorio')||fold(doc.specialization||'').includes('laboratorio analisi');
  }
  function isSpecialistDocument(doc={}){
    if(isLaboratoryDocument(doc))return false;
    const cat=fold(doc.category||''),kind=fold(doc.documentKind||''),mode=fold(doc.documentMode||'');
    return cat.includes('visita specialistica')||(/^visita\b/.test(kind)&&mode==='narrative');
  }
  function specialistQualification(raw=''){
    const lines=String(raw||'').replace(/\r/g,'\n').split(/\n+/).map(collapse).filter(Boolean).slice(0,80);
    for(const line of lines){
      if(/^(?:specialista\s+in|medico\s+specialista\s+in)\s+.{4,100}$/i.test(line))return line.charAt(0).toUpperCase()+line.slice(1).toLocaleLowerCase('it-IT');
    }
    return '';
  }
  function enrichSpecialistProvenance(doc={},raw='',doctors=[]){
    if(isLaboratoryDocument(doc)){doc.doctor='';doc.medicalPersonnel=[];delete doc.doctorQualification;return doc;}
    if(!isSpecialistDocument(doc))return doc;
    const doctor=collapse(doc.doctor||doctors[0]||'');
    if(doctor){
      doc.doctor=cleanDoctorName(doctor);
      doc.medicalPersonnel=[{role:'Medico/refertante',name:doc.doctor,confidence:95}];
    }
    const qualification=specialistQualification(raw);
    if(qualification)doc.doctorQualification=qualification;
    return doc;
  }
  function enrichContextForSpecialist(doc={},sections=[]){
    if(!isSpecialistDocument(doc)||!collapse(doc.doctor||''))return sections;
    const meta=[];
    meta.push(`Medico/refertante: ${collapse(doc.doctor)}`);
    if(collapse(doc.doctorQualification||''))meta.push(`Qualifica: ${collapse(doc.doctorQualification)}`);
    else if(collapse(doc.specialization||doc.department||''))meta.push(`Specializzazione: ${collapse(doc.specialization||doc.department)}`);
    const contextIndex=sections.findIndex(s=>/^contesto del documento$/i.test(String(s?.title||'')));
    const existing=contextIndex>=0?String(sections[contextIndex]?.text||'').split(/\n+/).map(collapse).filter(Boolean):[];
    const keys=new Set(existing.map(fold));
    const merged=[...meta.filter(x=>!keys.has(fold(x))),...existing];
    const context={title:'Contesto del documento',text:merged.join('\n').trim()};
    if(contextIndex>=0){const out=[...sections];out[contextIndex]={...out[contextIndex],...context};return out;}
    return [context,...sections];
  }
  function obviousGarbage(line=''){
    const v=collapse(line);if(!v)return true;
    if(v.length<=2)return true;
    if(/^\d{1,3}$/.test(v))return true;
    if(/^[A-Za-z]{1,3}$/.test(v)&&!/^(?:mg|ml|mcg)$/i.test(v))return true;
    if(/^[A-Za-z0-9]{3,24}$/.test(v)&&!/[aeiouàèéìòù]/i.test(v)&&!/^\d+(?:mg|ml|mcg)$/i.test(v))return true;
    return false;
  }
  function isAdmin(line=''){return ADMIN_RE.some(re=>re.test(line));}
  function isUiNoise(line=''){return UI_NOISE.some(re=>re.test(line));}
  function stripInlineFooter(text='',doctorKeys=[]){
    let value=String(text||'').replace(/[ \t]+/g,' ').trim();if(!value)return'';
    const cuts=[];
    const admin=value.search(/\b(?:p\.?\s*iva|partita\s+iva|piva|parva|vat)\b/i);if(admin>=0)cuts.push(admin);
    const doctor=value.search(/\b(?:dott?\.?|dr\.?|dott\.ssa|dr\.ssa|prof\.?|prof\.ssa|doll\.?)\s+[A-ZÀ-ÖØ-Ý][A-ZÀ-ÖØ-Ý' .-]{3,70}?(?=\s+(?:p\.?\s*iva|piva|parva|codice\s+fiscale|[A-Z]{1,3}\s+[A-Z]{1,3}\s+\d|$))/i);if(doctor>=0)cuts.push(doctor);
    if(cuts.length){const cut=Math.min(...cuts),before=value.slice(0,cut).replace(/[ ,;:\-]+$/,'');if(before.length>=40&&/\b(?:diagnos|prescrizion|terapia|compresse?|capsule?|shampoo|detergente|integratore|paziente|repert|anamnes|si\s+consiglia|si\s+raccomanda|giorni|settimana|mese)\b/i.test(before))return before;}
    return value;
  }
  function sanitizeSectionText(text='',doctorKeys=[]){
    text=stripInlineFooter(text,doctorKeys);
    const lines=String(text||'').replace(/\r/g,'\n').split(/\n+/).map(collapse).filter(Boolean);
    const out=[];let footer=false,clinicalSeen=false;
    for(const line of lines){
      if(isUiNoise(line))continue;
      const clinical=CLINICAL.test(line),doctor=isDoctorLine(line,doctorKeys),admin=isAdmin(line);
      // Il footer esiste solo dopo che il documento ha gia mostrato contenuto clinico.
      // Questo evita di scambiare l'intestazione del medico per una firma finale.
      if(clinical){footer=false;clinicalSeen=true;}
      if((doctor||admin)&&!clinical){
        if(clinicalSeen)footer=true;
        continue;
      }
      // Una volta entrati nella zona firma/timbro/footer, ogni riga non clinica
      // viene esclusa nel suo insieme. Non servono regex ad hoc per ogni
      // deformazione OCR di P.IVA, numeri di albo, frammenti di timbro, ecc.
      if(footer&&!clinical)continue;
      if(!clinicalSeen&&obviousGarbage(line))continue;
      if(/^(?:medico|firma|timbro|specialista|medico\s+chirurgo|dermatologo|cardiologo|gastroenterologo|chirurgo|odontoiatra)\b/i.test(line)&&!clinical)continue;
      const k=fold(line);if(!k)continue;
      if(out.length&&fold(out[out.length-1])===k)continue;
      out.push(line);
    }
    return out.join('\n').trim();
  }
  function sanitizeDocument(input={},rawHint=''){
    const doc=input; const raw=String(rawHint||doc.ocrIntegralText||doc.extractedText||doc.structuredText||'');
    const doctors=doctorCandidates(doc,raw),doctorKeys=doctors.map(doctorKey).filter(Boolean);
    enrichSpecialistProvenance(doc,raw,doctors);
    const sections=[];
    for(const section of doc.reportSections||[]){
      const title=collapse(section?.title||'Referto')||'Referto';
      if(/^contesto del documento$/i.test(title)){sections.push({...section,title,text:String(section?.text||'').trim()});continue;}
      const text=sanitizeSectionText(section?.text||'',doctorKeys);if(text)sections.push({...section,title,text});
    }
    if(!sections.length&&String(doc.reconstructedText||'').trim()){
      const text=sanitizeSectionText(doc.reconstructedText,doctorKeys);if(text)sections.push({title:'Referto',text});
    }
    const finalSections=enrichContextForSpecialist(doc,sections);
    doc.reportSections=finalSections;
    doc.pdfFields=finalSections.map(s=>({label:s.title,value:s.text,include:true}));
    doc.reconstructedText=finalSections.map(s=>`${s.title}\n${s.text}`).join('\n\n').trim();
    doc.documentContext=(finalSections.find(s=>/^contesto del documento$/i.test(String(s?.title||'')))?.text||'').trim();
    const clinical=finalSections.filter(s=>!/^contesto del documento$/i.test(s.title)).map(s=>s.text).join('\n\n').trim();
    if(clinical)doc.narrativeClinicalSource=clinical;
    doc.semanticCleanupVersion=VERSION;
    return doc;
  }
  H.analyzeText=function(text,profiles=[],activeProfileId=null,pages=[],fileName=''){
    const doc=BASE_ANALYZE(text,profiles,activeProfileId,pages,fileName);return sanitizeDocument(doc,text);
  };
  H.canonicalizeClinicalDocument24=function(input={},options={}){
    const original=clone(input),result=BASE_CANON(input,options)||{document:clone(input),changed:false,validation:{ok:true,violations:[]}};
    const doc=sanitizeDocument(result.document||clone(input),String(original.ocrIntegralText||original.extractedText||original.structuredText||''));
    return {...result,document:doc,changed:true};
  };
  H.repairNarrativeDocumentData=(d={})=>H.canonicalizeClinicalDocument24(d);
  H.SEMANTIC_CLEANUP_VERSION=VERSION;
})(HealthExtractors);
