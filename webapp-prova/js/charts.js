'use strict';

const HealthCharts = (() => {
  const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const fmt=n=>Number.isFinite(Number(n))?new Intl.NumberFormat('it-IT',{maximumFractionDigits:3}).format(Number(n)):'-';
  const dateLabel=iso=>iso?iso.split('-').reverse().join('/'):'Senza data';
  const knownIds=new Set((HealthExtractors.PARAMS||[]).map(p=>p.id));

  function cleanUnit(raw='') {
    let s=String(raw||'').replace(/[<>*≤≥]+/g,' ').replace(/μ/g,'µ').trim();
    const candidates=[
      /(?:mg|g|ng|pg|µg|ug)\s*\/\s*(?:dl|ml|l)/i,/mmol\s*\/\s*l/i,/µ?mol\s*\/\s*l/i,
      /(?:m|µ)?ui\s*\/\s*(?:l|ml)/i,/miu\s*\/\s*l/i,/u[i]?\s*\/\s*l/i,/u\s*\/\s*l/i,
      /(?:x\s*)?10(?:\^|\.e)?\s*[36912]+\s*\/\s*(?:µl|ul|l)/i,/10\s*\^\s*[36912]+\s*\/\s*(?:µl|ul|l)/i,
      /mEq\s*\/\s*l/i,/ml\s*\/\s*min(?:\s*\/\s*1[,.]73\s*m2)?/i,/mg\s*\/\s*g/i,/ng\s*\/\s*l/i,
      /pg\s*\/\s*ml/i,/m[lL]\s*\/\s*min(?:\s*\/\s*1[,.]7(?:3)?\s*(?:m(?:2|²)|mq))?/i,/fL/i,/pg/i,/%/i,/mmHg/i,/kg\s*\/\s*m(?:2|²)/i,/kg/i,/cm/i
    ];
    for(const re of candidates){const m=s.match(re);if(m)return m[0].replace(/\s+/g,'');}
    return s.length<=24?s:'';
  }

  function canonicalUnit(raw='') {
    let u=cleanUnit(raw).toLowerCase().replace(/μ/g,'µ').replace(/\s+/g,'')
      .replace(/\/d[i1]$/,'/dl').replace(/\/m[i1]$/,'/ml').replace(/mg\/di$/,'mg/dl')
      .replace(/^ui\/l$/,'u/l').replace(/^u[i1]\/l$/,'u/l').replace(/^miu\/l$/,'mui/l')
      .replace(/^µui\/ml$/,'mui/l').replace(/^uui\/ml$/,'mui/l').replace(/^mui\/ml$/,'ui/ml')
      .replace(/×/g,'x');
    if(/^x?10(?:\^|\.e)?3\/(?:µl|ul)$/.test(u))return '10^9/l';
    if(/^x?10(?:\^|\.e)?9\/l$/.test(u))return '10^9/l';
    if(/^x?10(?:\^|\.e)?6\/(?:µl|ul)$/.test(u))return '10^12/l';
    if(/^x?10(?:\^|\.e)?12\/l$/.test(u))return '10^12/l';
    if(u==='ui/l')return 'u/l';
    if(/^ml\/min(?:\/1[,.]?7(?:3)?(?:m2|m²|mq))?$/.test(u.replace(/\s+/g,'')))return /1[,.]?7/.test(u)?'ml/min/1.73m2':'ml/min';
    return u;
  }

  function convert(parameterId,value,unitKey) {
    let v=Number(value); if(!Number.isFinite(v)||!unitKey)return null;
    const result={value:v,unitKey,unit:displayUnit(unitKey)};
    const set=(nv,key)=>({value:nv,unitKey:key,unit:displayUnit(key)});
    if(parameterId==='glucose_blood'){
      if(unitKey==='mmol/l')return set(v*18.0182,'mg/dl');
      if(unitKey==='mg/dl')return set(v,'mg/dl');
    }
    if(['chol_total','hdl','ldl'].includes(parameterId)){
      if(unitKey==='mmol/l')return set(v*38.67,'mg/dl');
      if(unitKey==='mg/dl')return set(v,'mg/dl');
    }
    if(parameterId==='triglycerides'){
      if(unitKey==='mmol/l')return set(v*88.57,'mg/dl');
      if(unitKey==='mg/dl')return set(v,'mg/dl');
    }
    if(parameterId==='creatinine_blood'){
      if(['µmol/l','umol/l'].includes(unitKey))return set(v/88.4,'mg/dl');
      if(unitKey==='mg/dl')return set(v,'mg/dl');
    }
    if(parameterId==='uric_acid'){
      if(['µmol/l','umol/l'].includes(unitKey))return set(v/59.48,'mg/dl');
      if(unitKey==='mg/dl')return set(v,'mg/dl');
    }
    if(['bilirubin_total','bilirubin_direct','bilirubin_indirect'].includes(parameterId)){
      if(['µmol/l','umol/l'].includes(unitKey))return set(v/17.104,'mg/dl');
      if(unitKey==='mg/dl')return set(v,'mg/dl');
    }
    if(parameterId==='calcium'){
      if(unitKey==='mmol/l')return set(v*4.008,'mg/dl');
      if(unitKey==='mg/dl')return set(v,'mg/dl');
    }
    if(parameterId==='iron'){
      if(['µmol/l','umol/l'].includes(unitKey))return set(v*5.585,'µg/dl');
      if(['µg/dl','ug/dl'].includes(unitKey))return set(v,'µg/dl');
    }
    if(parameterId==='hemoglobin'){
      if(unitKey==='g/l')return set(v/10,'g/dl');
      if(unitKey==='g/dl')return set(v,'g/dl');
    }
    if(parameterId==='ft4'){
      if(unitKey==='ng/l')return set(v/10,'ng/dl');
      if(unitKey==='pmol/l')return set(v/12.87,'ng/dl');
      if(unitKey==='ng/dl')return set(v,'ng/dl');
    }
    if(parameterId==='ft3'){
      if(unitKey==='ng/l')return set(v,'pg/ml');
      if(unitKey==='pmol/l')return set(v/1.536,'pg/ml');
      if(unitKey==='pg/ml')return set(v,'pg/ml');
    }
    if(parameterId==='tsh' && ['mui/l','µui/ml','uui/ml','miu/l'].includes(unitKey))return set(v,'mui/l');
    if(['ast','alt','ggt','alp','lipase'].includes(parameterId) && ['u/l','ui/l'].includes(unitKey))return set(v,'u/l');
    // FIX27: unità clinicamente equivalenti devono alimentare una sola serie.
    // NT-proBNP: 1 ng/L = 1 pg/mL. Sodio e potassio sono monovalenti, quindi
    // mmol/L e mEq/L hanno lo stesso valore numerico.
    if(parameterId==='nt_probnp' && ['ng/l','pg/ml'].includes(unitKey))return set(v,'pg/ml');
    if(['sodium','potassium'].includes(parameterId) && ['meq/l','mmol/l'].includes(unitKey))return set(v,'mmol/l');
    if(['wbc','platelets','neutrophils_abs','lymphocytes_abs','monocytes_abs','eosinophils_abs','basophils_abs'].includes(parameterId) && unitKey==='10^9/l')return set(v,'10^9/l');
    if(parameterId==='rbc' && unitKey==='10^12/l')return set(v,'10^12/l');
    return result;
  }


  function convertReferenceRange(parameterId,range,sourceUnit,targetUnit,targetLabel) {
    if(!range)return range||null;
    const parsed=parseReference(range.raw||'');
    if(!parsed)return range;
    const cv=value=>{
      if(!Number.isFinite(value))return null;
      const out=convert(parameterId,value,sourceUnit);
      return out&&out.unitKey===targetUnit?Number(out.value):null;
    };
    const lower=cv(parsed.lower),upper=cv(parsed.upper);
    if(parsed.lower!==undefined&&!Number.isFinite(lower))return range;
    if(parsed.upper!==undefined&&!Number.isFinite(upper))return range;
    let raw='';
    if(Number.isFinite(lower)&&Number.isFinite(upper))raw=`${fmt(lower)} - ${fmt(upper)} ${targetLabel||displayUnit(targetUnit)}`;
    else if(Number.isFinite(upper))raw=`< ${fmt(upper)} ${targetLabel||displayUnit(targetUnit)}`;
    else if(Number.isFinite(lower))raw=`> ${fmt(lower)} ${targetLabel||displayUnit(targetUnit)}`;
    return raw?{...range,semanticRaw:range.semanticRaw||range.raw||'',raw,low:lower,high:upper}:range;
  }

  function displayUnit(key='') {
    const map={'mg/dl':'mg/dL','g/dl':'g/dL','ng/dl':'ng/dL','pg/ml':'pg/mL','ng/ml':'ng/mL','µg/l':'µg/L','ug/l':'µg/L','µg/dl':'µg/dL','mmol/l':'mmol/L','µmol/l':'µmol/L','umol/l':'µmol/L','mui/l':'mUI/L','u/l':'U/L','10^9/l':'10⁹/L','10^12/l':'10¹²/L','cells/µl':'cellule/µL','fl':'fL','pg':'pg','%':'%','meq/l':'mEq/L','mg/g':'mg/g','ng/l':'ng/L','mmhg':'mmHg','kg/m2':'kg/m²','kg':'kg','ml/min':'mL/min','ml/min/1.73m2':'mL/min/1,73 m²'};
    return map[key]||key;
  }


  const CHART_VIRTUAL_PARAMS={
    urine_rbc:{id:'urine_rbc',name:'Eritrociti urinari',sample:'Urine'},
    urine_wbc:{id:'urine_wbc',name:'Leucociti urinari',sample:'Urine'},
    urine_glucose:{id:'urine_glucose',name:'Glucosio urinario',sample:'Urine'},
    urine_creatinine:{id:'urine_creatinine',name:'Creatinina urinaria',sample:'Urine'},
    // La vitamina D 25-OH e la 1,25-OH sono analiti diversi e non devono
    // essere fusi soltanto perché il parser storico assegnava lo stesso id.
    vitamin_d_25oh:{id:'vitamin_d_25oh',name:'Vitamina D 25-OH',sample:'Sangue'},
    vitamin_d_125oh:{id:'vitamin_d_125oh',name:'Vitamina D 1,25-OH',sample:'Sangue'}
  };
  const DIFFERENTIAL_PCT_TO_ABS={neutrophils_pct:'neutrophils_abs',lymphocytes_pct:'lymphocytes_abs',monocytes_pct:'monocytes_abs',eosinophils_pct:'eosinophils_abs',basophils_pct:'basophils_abs'};
  const DIFFERENTIAL_ABS_TO_PCT={neutrophils_abs:'neutrophils_pct',lymphocytes_abs:'lymphocytes_pct',monocytes_abs:'monocytes_pct',eosinophils_abs:'eosinophils_pct',basophils_abs:'basophils_pct'};
  const DIFFERENTIAL_NAMES={
    neutrophils_pct:'Neutrofili %',lymphocytes_pct:'Linfociti %',monocytes_pct:'Monociti %',eosinophils_pct:'Eosinofili %',basophils_pct:'Basofili %',
    neutrophils_abs:'Neutrofili assoluti',lymphocytes_abs:'Linfociti assoluti',monocytes_abs:'Monociti assoluti',eosinophils_abs:'Eosinofili assoluti',basophils_abs:'Basofili assoluti'
  };
  const BLOOD_COUNT_IDS=new Set(['rbc','wbc','platelets','neutrophils_abs','lymphocytes_abs','monocytes_abs','eosinophils_abs','basophils_abs']);
  const PERCENT_COUNT_IDS=new Set(['neutrophils_pct','lymphocytes_pct','monocytes_pct','eosinophils_pct','basophils_pct']);

  function evidenceText(value={},raw={},doc={}) {
    return `${value.parameterName||''} ${raw.parameterName||raw.test||''} ${value.sample||raw.sample||''} ${value.labSection||raw.labSection||''} ${value.sourceLine||raw.sourceLine||''} ${doc.documentKind||''} ${doc.category||''}`.toLowerCase().replace(/μ/g,'µ').replace(/[–—]/g,'-');
  }

  function countSourceValue(parameterId,current,source='') {
    if(!BLOOD_COUNT_IDS.has(parameterId)&&!PERCENT_COUNT_IDS.has(parameterId)&&!['urine_rbc','urine_wbc'].includes(parameterId))return Number(current);
    const patterns={
      rbc:/(?:globuli\s+rossi|eritrociti|rbc)\D{0,28}([-+]?\d+(?:[.,]\d+)?)/i,
      urine_rbc:/(?:globuli\s+rossi|eritrociti|rbc)\D{0,28}([-+]?\d+(?:[.,]\d+)?)/i,
      wbc:/(?:globuli\s+bianchi|leucociti|wbc)\D{0,28}([-+]?\d+(?:[.,]\d+)?)/i,
      urine_wbc:/(?:globuli\s+bianchi|leucociti|wbc)\D{0,28}([-+]?\d+(?:[.,]\d+)?)/i,
      platelets:/(?:piastrine|plt)\D{0,28}([-+]?\d+(?:[.,]\d+)?)/i,
      neutrophils_pct:/(?:neutrofili|granulociti\s+neutrofili)\D{0,28}([-+]?\d+(?:[.,]\d+)?)/i,
      neutrophils_abs:/(?:neutrofili|granulociti\s+neutrofili)\D{0,28}([-+]?\d+(?:[.,]\d+)?)/i,
      lymphocytes_pct:/(?:linfociti)\D{0,28}([-+]?\d+(?:[.,]\d+)?)/i,
      lymphocytes_abs:/(?:linfociti)\D{0,28}([-+]?\d+(?:[.,]\d+)?)/i,
      monocytes_pct:/(?:monociti)\D{0,28}([-+]?\d+(?:[.,]\d+)?)/i,
      monocytes_abs:/(?:monociti)\D{0,28}([-+]?\d+(?:[.,]\d+)?)/i,
      eosinophils_pct:/(?:eosinofili|granulociti\s+eosinofili)\D{0,28}([-+]?\d+(?:[.,]\d+)?)/i,
      eosinophils_abs:/(?:eosinofili|granulociti\s+eosinofili)\D{0,28}([-+]?\d+(?:[.,]\d+)?)/i,
      basophils_pct:/(?:basofili|granulociti\s+basofili)\D{0,28}([-+]?\d+(?:[.,]\d+)?)/i,
      basophils_abs:/(?:basofili|granulociti\s+basofili)\D{0,28}([-+]?\d+(?:[.,]\d+)?)/i
    };
    const match=String(source||'').match(patterns[parameterId]);
    if(!match)return Number(current);
    const value=Number(String(match[1]).replace(',','.'));
    return Number.isFinite(value)?value:Number(current);
  }

  function hasPowerUnit(source='',power=9,perMicro=false) {
    const s=String(source||'').toLowerCase().replace(/μ/g,'µ').replace(/[¹]/g,'1').replace(/[²]/g,'2').replace(/[³]/g,'3').replace(/[⁶]/g,'6').replace(/[⁹]/g,'9');
    if(perMicro)return new RegExp(`10[^0-9]{0,5}${power}[^0-9]{0,7}[a-z?0-9µ]{0,3}l\\b`,'i').test(s);
    return new RegExp(`10[^0-9]{0,5}${power}[^0-9]{0,7}[a-z?0-9µ]{0,3}l\\b`,'i').test(s);
  }

  function urineCellContext(value={},raw={},doc={}) {
    const local=`${value.sample||raw.sample||''} ${value.labSection||raw.labSection||''} ${value.sourceLine||raw.sourceLine||''}`.toLowerCase().replace(/μ/g,'µ');
    return /(?:urine?|urinari|sedimento)/i.test(local)||/cellule\s*\/\s*[µu?]?l/i.test(local)||/fino\s+a\s*\d/i.test(local);
  }


  function urinePageContext(value={},raw={},doc={}) {
    if(urineCellContext(value,raw,doc))return true;
    const page=Number(value.pageNumber||raw.pageNumber||0);if(!page||!Array.isArray(doc.labValues))return false;
    return doc.labValues.some(x=>Number(x?.pageNumber||0)===page && (/^urine_/i.test(String(x?.parameterId||''))||/esame\s+urine|sedimento|urinari/i.test(String(x?.labSection||'')+' '+String(x?.sample||''))));
  }


  function urineGlucoseContext(value={},raw={},doc={}) {
    const local=`${value.sample||raw.sample||''} ${value.labSection||raw.labSection||''} ${value.sourceLine||raw.sourceLine||''}`;
    if(/urine?|urinari|esame\s+urine/i.test(local))return true;
    const ref=parseReference(value.range?.raw||raw.range?.raw||'');
    return urinePageContext(value,raw,doc)&&Number.isFinite(ref?.upper)&&ref.upper<=20;
  }

  function normalizeChartIdentity(value={},raw={},doc={}) {
    let id=String(value.parameterId||'');let name=String(value.parameterName||raw.parameterName||raw.test||'');
    const source=evidenceText(value,raw,doc);const urine=urineCellContext(value,raw,doc);
    if(id==='creatinine_urine'){id='urine_creatinine';name='Creatinina urinaria';}
    if(id==='rbc'&&urine){id='urine_rbc';name='Eritrociti urinari';}
    else if(id==='wbc'&&urine){id='urine_wbc';name='Leucociti urinari';}
    else if(id==='glucose_blood'&&urineGlucoseContext(value,raw,doc)&&!/siero|plasma|sangue/i.test(String(value.sourceLine||raw.sourceLine||''))){id='urine_glucose';name='Glucosio urinario';}
    else if(id==='creatinine_blood'&&/creatinin[^\n]{0,18}urine|urine[^\n]{0,18}creatinin/i.test(String(value.sourceLine||raw.sourceLine||'')+' '+String(value.sample||raw.sample||''))){id='urine_creatinine';name='Creatinina urinaria';}
    else if(id==='vitamin_d'){
      const vd=source.replace(/\s+/g,' ');
      if(/(?:1\s*[,.-]\s*25|1\s+25)\s*(?:-?\s*oh|idrossi)/i.test(vd)){id='vitamin_d_125oh';name='Vitamina D 1,25-OH';}
      else if(/(?:^|\D)25\s*\(?\s*oh\s*\)?|25\s*[- ]?idrossi/i.test(vd)){id='vitamin_d_25oh';name='Vitamina D 25-OH';}
    }
    const unitEvidence=`${value.unit||raw.unit||''} ${value.sourceLine||raw.sourceLine||''}`;
    const hasPercent=/%/.test(unitEvidence)&&!hasPowerUnit(unitEvidence,6,true)&&!hasPowerUnit(unitEvidence,12,false);
    const hasAbsolute=hasPowerUnit(unitEvidence,9,false)||hasPowerUnit(unitEvidence,3,true)||/10\s*[\^°'‘’%]?\s*9\s*\/\s*l/i.test(unitEvidence);
    if(DIFFERENTIAL_PCT_TO_ABS[id]&&hasAbsolute){id=DIFFERENTIAL_PCT_TO_ABS[id];name=DIFFERENTIAL_NAMES[id];}
    else if(DIFFERENTIAL_ABS_TO_PCT[id]&&hasPercent){id=DIFFERENTIAL_ABS_TO_PCT[id];name=DIFFERENTIAL_NAMES[id];}
    if(DIFFERENTIAL_NAMES[id])name=DIFFERENTIAL_NAMES[id];
    if(id==='rbc')name='Globuli rossi';if(id==='wbc')name='Globuli bianchi';if(id==='platelets')name='Piastrine';
    return {...value,parameterId:id,parameterName:name,_chartSource:source};
  }

  function plausibleCountValue(id,value) {
    const v=Number(value);if(!Number.isFinite(v))return false;
    if(id==='rbc')return v>=1.5&&v<=9;
    if(id==='wbc')return v>=0.1&&v<=100;
    if(id==='platelets')return v>=5&&v<=2000;
    if(PERCENT_COUNT_IDS.has(id))return v>=0&&v<=100;
    if(BLOOD_COUNT_IDS.has(id))return v>=0&&v<=100;
    if(id==='urine_rbc'||id==='urine_wbc')return v>=0&&v<=500000;
    return true;
  }

  function expectedGraphUnits(id='') {
    const parameter=(HealthExtractors.PARAMS||[]).find(p=>p.id===id);if(!parameter)return new Set();
    const out=new Set();
    for(const rawUnit of parameter.units||[]){
      const key=canonicalUnit(rawUnit);if(!key)continue;
      const converted=convert(id,1,key);out.add(converted?.unitKey||key);
    }
    return out;
  }

  function normalizedChartUnit(value={},raw={},doc={}) {
    const id=value.parameterId;const sourceLine=String(value.sourceLine||raw.sourceLine||'');const source=`${value.unit||raw.unit||''} ${sourceLine}`;
    let key=canonicalUnit(value.unit||raw.unit||'');
    if(id==='urine_rbc'||id==='urine_wbc')return {key:'cells/µl',label:'cellule/µL'};
    if(id==='urine_glucose'){const k=canonicalUnit(value.unit||raw.unit||sourceLine);return k==='mg/dl'?{key:'mg/dl',label:'mg/dL'}:null;}
    if(id==='urine_creatinine'){const k=canonicalUnit(value.unit||raw.unit||sourceLine);return k==='mg/dl'?{key:'mg/dl',label:'mg/dL'}:null;}
    if(PERCENT_COUNT_IDS.has(id))return {key:'%',label:'%'};
    if(id==='rbc'){
      if(key==='10^12/l'||hasPowerUnit(source,12,false)||hasPowerUnit(source,6,true))return {key:'10^12/l',label:'10¹²/L'};
      return null;
    }
    if(id==='wbc'||id==='platelets'||DIFFERENTIAL_ABS_TO_PCT[id]){
      if(key==='10^9/l'||hasPowerUnit(source,9,false)||hasPowerUnit(source,3,true))return {key:'10^9/l',label:'10⁹/L'};
      return null;
    }
    const allowed=expectedGraphUnits(id);
    if(allowed.size){
      const converted=convert(id,Number(value.value)||1,key);const convertedKey=converted?.unitKey||key;
      if(allowed.has(convertedKey))return {key,label:displayUnit(key)};
      const sourceKey=canonicalUnit(sourceLine);const sourceConverted=convert(id,Number(value.value)||1,sourceKey);const sourceConvertedKey=sourceConverted?.unitKey||sourceKey;
      if(sourceKey&&allowed.has(sourceConvertedKey))return {key:sourceKey,label:displayUnit(sourceKey)};
      return null;
    }
    return key?{key,label:displayUnit(key)}:null;
  }

  function plausibleParameterLabel(value={},raw={}) {
    const label=String(value.parameterName||raw.parameterName||raw.name||'').replace(/\s+/g,' ').trim();
    if(!label)return false;
    if(label.length>78)return false;
    const words=label.split(/\s+/).filter(Boolean);
    if(words.length>8)return false;
    const lower=label.toLowerCase();
    const methodOrCondition=[
      /gruppo\s+etnico/,/afro[-\s]?americano/,/moltiplic(?:are|ato|azione)/,/risultato\s+per/,
      /fattore\s+(?:di\s+)?correzione/,/formula\s+(?:di|per)/,/metodo\s+(?:di|utilizzato|analitico)/,
      /in\s+gravidanza/,/classe\s+di\s+rischio/,/rischio\s+(?:basso|medio|alto|cardiovascolare)/,
      /valori?\s+decisionali?/,/soglia\s+(?:decisionale|diagnostica)/,/nota\s+(?:metodologica|tecnica)/,
      /appartenente\s+a/,/se\s+il\s+paziente/,/per\s+il\s+calcolo/
    ];
    if(methodOrCondition.some(re=>re.test(lower)))return false;
    if(/^[<>]=?\s*\d/.test(label))return false;
    return true;
  }

  function isEligibleDocument(d={}) {
    if(['lab','mixed'].includes(d.documentMode) || d.category==='Esami di laboratorio')return true;
    return d.complexClinicalContainer===true && Array.isArray(d.labValues) && d.labValues.length>0;
  }

  // FIX27 - validazione automatica del valore usato dal grafico.
  // Non corregge un singolo parametro: applica gli stessi controlli a tutte
  // le serie numeriche ricavate dai referti.
  const RESULT_UNIT_RE=/(?:mg|g|ng|pg|µg|ug|mmol|µmol|umol|mEq|mUI|µUI|UI|U)\s*\/\s*(?:dL|mL|L)|(?:x|\*)?\s*10\s*(?:\^|\.e)?\s*(?:3|6|9|12)\s*\/\s*(?:µL|uL|L)|%|\bfL\b|\bpg\b|mmHg|kg\s*\/\s*m(?:2|²)|mL\s*\/\s*min/ig;
  const QUALITATIVE_RESULT_RE=/\b(?:assente|assenza|negativ[oa]|non\s+rilevat[oa])\b/i;
  const NON_LAB_SOURCE_RE=/\b(?:fiala|compress[ae]|capsul[ae]|flacone|sacca|somministr|infusione|terapia|posologia|sodio\s+bicarb|dose\s+giornaliera|scala\s+del\s+dolore|\bnrs\b|coefficiente|moltiplicare\s+il\s+risultato|unit[aà]\s+di\s+misura\s+modificat)\b/i;
  const OCR_HEADER_MERGE_RE=/esame\s+esito.*unit[aà].*valori?.*riferimento/i;
  const OCR_MIXED_HEMOGRAM_RE=/(?:neutrofil|linfocit|monocit|eosinofil|basofil).{0,60}piastrin|piastrin.{0,60}(?:neutrofil|linfocit|monocit|eosinofil|basofil)/i;
  const LONGITUDINAL_EXCLUSION_RE=/(?:prelievo[^0-9\r\n]{0,10}\d{1,3}\s*(?:min|['"]{1,2})|curva\s+(?:glicemica|da\s+carico)|ogtt)/i;

  function numberTokens(text=''){
    const normalized=String(text||'').replace(/\b[OoUu](?=[,.]\d)/g,'0');
    return [...normalized.matchAll(/(?<![A-Za-z0-9])[-+]?\d+(?:[.,]\d+)?(?![A-Za-z0-9])/g)].map(m=>({raw:m[0],value:Number(m[0].replace(',','.')),index:m.index||0,end:(m.index||0)+m[0].length})).filter(x=>Number.isFinite(x.value));
  }

  function repairDuplicatedRaw(value={}){
    const raw=String(value.rawValue??'').trim();
    const nums=numberTokens(raw);
    if(nums.length<2)return null;
    const first=nums[0].value;
    if(nums.every(x=>Math.abs(x.value-first)<1e-12) && /\s/.test(raw))return first;
    return null;
  }


  // Ricava il risultato misurato dalla posizione del numero rispetto alla sua
  // unità. È una regola generale: evita che il parser usi per errore tempi di
  // prelievo, esponenti dell'unità o limiti di riferimento come valore Y.
  function sourceUnitRegex(unitKey=''){
    const k=String(unitKey||'').toLowerCase();
    if(k==='mg/dl')return /m(?:g|a|o)\s*(?:\/|\\|i|l)?\s*d\s*[l1i]/ig;
    if(k==='g/dl')return /(?<!m)g\s*(?:\/|\\|i|l)?\s*d\s*[l1i]/ig;
    if(k==='ng/dl')return /ng\s*(?:\/|\\|i|l)?\s*d\s*[l1i]/ig;
    if(k==='µg/dl'||k==='ug/dl')return /(?:µg|ug)\s*(?:\/|\\|i|l)?\s*d\s*[l1i]/ig;
    if(k==='ng/ml')return /ng\s*(?:\/|\\|i|l)?\s*m\s*[l1i]/ig;
    if(k==='pg/ml')return /pg\s*(?:\/|\\|i|l)?\s*m\s*[l1i]/ig;
    if(k==='mmol/l')return /mm[oa]l?\s*(?:\/|\\|i|l)?\s*l/ig;
    if(k==='meq/l')return /m(?:e|ed)q?\s*(?:\/|\\|i|l)?\s*l/ig;
    if(k==='µmol/l'||k==='umol/l')return /(?:µmol|umol)\s*(?:\/|\\|i|l)?\s*l/ig;
    if(k==='mui/l')return /m(?:ui|iu)\s*(?:\/|\\|i|l)?\s*l/ig;
    if(k==='u/l')return /(?:ui|u)\s*(?:\/|\\|i|l)?\s*l/ig;
    if(k==='10^9/l')return /(?:x|\*)?\s*10\s*(?:\^|[°%/.e]*)\s*(?:3|9)\s*(?:\/|\\|i|l)?\s*[a-z?0-9µ]{0,3}l/ig;
    if(k==='10^12/l')return /(?:x|\*)?\s*10\s*(?:\^|[°%/.e]*)\s*(?:6|12)\s*(?:\/|\\|i|l)?\s*[a-z?0-9µ]{0,3}l/ig;
    if(k==='%')return /%/g;
    if(k==='fl')return /\bfl\b/ig;
    if(k==='pg')return /\bpg\b/ig;
    if(k==='mmhg')return /mm\s*hg/ig;
    if(k==='kg/m2')return /kg\s*\/\s*m(?:2|²)/ig;
    if(k==='ng/l')return /ng\s*(?:\/|\\|i|l)?\s*l/ig;
    if(k==='ml/min'||k==='ml/min/1.73m2')return /m[lL]\s*\/\s*min(?:\s*\/\s*1[,.]7(?:3)?\s*(?:m(?:2|²)|mq))?/ig;
    return null;
  }

  function measuredValueFromSource(source='',unitKey=''){
    const text=String(source||'').replace(/μ/g,'µ');
    const re=sourceUnitRegex(unitKey);if(!re)return null;
    const units=[...text.matchAll(re)];re.lastIndex=0;if(!units.length)return null;
    const nums=numberTokens(text);let best=null;
    for(const u of units){
      const ui=u.index||0;
      const candidates=nums.filter(n=>n.end<=ui && ui-n.end<=34);
      if(!candidates.length)continue;
      const n=candidates[candidates.length-1];
      // Se il numero appartiene all'esponente della stessa unità, usa il
      // numero clinico immediatamente precedente.
      let chosen=n;
      const between=text.slice(n.end,ui);
      if(/^[\s.x×*^°%/\\-]*$/.test(between) && /10\s*(?:\^|[°%/.e]*)\s*(?:3|6|9|12)/i.test(text.slice(Math.max(0,ui-12),ui+12))){
        const prev=candidates.length>1?candidates[candidates.length-2]:null;if(prev)chosen=prev;
      }
      const distance=ui-chosen.end;
      if(!best||distance<best.distance)best={value:chosen.value,distance};
    }
    return best&&Number.isFinite(best.value)?best.value:null;
  }

  function referenceGuidedRepair(numeric,value={},unitKey='',source='') {
    let n=Number(numeric);if(!Number.isFinite(n))return n;
    const ref=parseReference(value.range?.raw||'');const raw=String(value.rawValue??'').trim();
    if(/^\d{1,3}\.\d{3}$/.test(raw)&&Number.isFinite(ref?.upper)&&/[>*]/.test(String(source||''))&&n<=ref.upper){const alt=Number(raw.replace('.',''));if(Number.isFinite(alt)&&alt>ref.upper)n=alt;}
    if(unitKey==='%'&&n>100&&Number.isFinite(ref?.upper)&&ref.upper<=100){const alt=n/10;const lo=Number.isFinite(ref?.lower)?ref.lower:0;if(alt>=Math.max(0,lo*.7)&&alt<=Math.max(100,ref.upper*1.3))n=alt;}
    return n;
  }

  function sourceSupportsResult(value={},numeric=Number(value.value)){
    const source=String(value.sourceLine||'').replace(/μ/g,'µ');
    if(!source||!Number.isFinite(Number(numeric)))return null;
    const units=[...source.matchAll(RESULT_UNIT_RE)];RESULT_UNIT_RE.lastIndex=0;
    if(!units.length)return null;
    const nums=numberTokens(source);
    for(const n of nums){
      if(Math.abs(n.value-Number(numeric))>Math.max(1e-6,Math.abs(Number(numeric))*1e-6))continue;
      const unit=units.find(u=>(u.index||0)>=n.end && (u.index||0)-n.end<=18);
      if(unit)return true;
    }
    return false;
  }

  function graphSourceQuality(value={},numeric=Number(value.value)){
    const source=String(value.sourceLine||'');
    if(NON_LAB_SOURCE_RE.test(source)||OCR_HEADER_MERGE_RE.test(source)||OCR_MIXED_HEMOGRAM_RE.test(source))return -10;
    if(QUALITATIVE_RESULT_RE.test(source))return -10;
    const support=sourceSupportsResult(value,numeric);
    let score=support===true?6:support===false?-6:0;
    if(value.range?.raw)score+=2;
    if(Number(value.confidence||0)>=85)score+=1;
    return score;
  }

  function median(values=[]){const a=values.filter(Number.isFinite).sort((x,y)=>x-y);if(!a.length)return null;const m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2;}

  function filterWeakOutliers(rows=[]){
    const groups=new Map();
    for(const r of rows){const key=`${r.parameterId}|${r.unitKey}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);}
    const out=[];
    for(const group of groups.values()){
      const strong=group.filter(r=>Number(r._graphSourceQuality)>=1).map(r=>Number(r.value)).filter(v=>Number.isFinite(v)&&v>0);
      const med=median(strong);
      for(const r of group){
        const v=Number(r.value),q=Number(r._graphSourceQuality||0);
        if(q<=-8)continue;
        // Un punto senza riscontro numerico vicino all'unità può restare solo
        // se non altera in modo macroscopico una serie sostenuta da altri referti.
        if(r._graphSourceSupported!==true&&Number.isFinite(med)&&med>0&&strong.length>=3&&((v<=0)||(v>med*4||v<med/4)))continue;
        out.push(r);
      }
    }
    return out;
  }

  function suppressWeakDuplicateRows(rows=[]){
    const buckets=new Map();
    for(const r of rows){const key=[r.documentId,r.clinicalDate,r.parameterId,r.unitKey,r.pageNumber||''].join('|');if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(r);}
    const out=[];
    for(const group of buckets.values()){
      const hasStrong=group.some(r=>Number(r._graphSourceQuality)>=4);
      for(const r of group){
        if(hasStrong&&Number(r._graphSourceQuality)<0)continue;
        out.push(r);
      }
    }
    return out;
  }

  function collect(documents=[]) {
    const rows=[]; const seen=new Set();
    for(const d of documents){
      if(!isEligibleDocument(d))continue;
      for(const raw of d.labValues||[]){
        if(raw?.graphEligible===false)continue;
        let v=HealthExtractors.canonicalizeLabValue(raw);
        if(!Number.isFinite(Number(v.value)))continue;
        if(!plausibleParameterLabel(v,raw))continue;
        v=normalizeChartIdentity(v,raw,d);
        if(!knownIds.has(v.parameterId)&&!CHART_VIRTUAL_PARAMS[v.parameterId])continue;
        const sourceLine=String(v.sourceLine||raw.sourceLine||'');
        if(NON_LAB_SOURCE_RE.test(sourceLine)||OCR_HEADER_MERGE_RE.test(sourceLine)||OCR_MIXED_HEMOGRAM_RE.test(sourceLine)||QUALITATIVE_RESULT_RE.test(sourceLine)||LONGITUDINAL_EXCLUSION_RE.test(sourceLine))continue;
        let recoveredValue=countSourceValue(v.parameterId,v.value,sourceLine);
        const duplicated=repairDuplicatedRaw(v);
        if(Number.isFinite(duplicated))recoveredValue=duplicated;
        const unitInfo=normalizedChartUnit(v,raw,d);
        if(!unitInfo?.key)continue;
        const sourcedValue=measuredValueFromSource(sourceLine,unitInfo.key);
        if(Number.isFinite(sourcedValue))recoveredValue=sourcedValue;
        else if(/(?:^|\s)[<>]=?\s*\d/.test(sourceLine)&&!/(?:mg|g|ng|pg|µg|ug|mmol|µmol|umol|mEq|mUI|µUI|UI|U|mL\s*\/\s*min)\s*\//i.test(sourceLine))continue;
        recoveredValue=referenceGuidedRepair(recoveredValue,v,unitInfo.key,sourceLine);
        if(unitInfo.key==='%'&&(recoveredValue<0||recoveredValue>100))continue;
        if(!plausibleCountValue(v.parameterId,recoveredValue))continue;
        const sourceEvidence={...v,value:recoveredValue,sourceLine,rawValue:Number.isFinite(duplicated)?String(duplicated):(v.rawValue??raw.rawValue)};
        const sourceSupported=sourceSupportsResult(sourceEvidence,recoveredValue);
        const sourceQuality=graphSourceQuality(sourceEvidence,recoveredValue);
        let converted={value:recoveredValue,unitKey:unitInfo.key,unit:unitInfo.label};
        if(v.parameterId==='vitamin_d_25oh'&&['µg/l','ug/l'].includes(unitInfo.key))converted={value:recoveredValue,unitKey:'ng/ml',unit:'ng/mL'};
        else if(v.parameterId==='vitamin_d_25oh'&&unitInfo.key==='ng/ml')converted={value:recoveredValue,unitKey:'ng/ml',unit:'ng/mL'};
        if(!CHART_VIRTUAL_PARAMS[v.parameterId]){
          const rawUnit=unitInfo.key;
          const standard=convert(v.parameterId,recoveredValue,rawUnit);
          if(!standard||!standard.unitKey)continue;
          converted=standard;
        }
        const key=[d.id,v.parameterId,converted.unitKey,Number(converted.value).toFixed(8),d.clinicalDate||'',v.pageNumber||''].join('|');
        if(seen.has(key))continue; seen.add(key);
        const sourceUnit=unitInfo.key;
        const convertedRange=CHART_VIRTUAL_PARAMS[v.parameterId]?(v.range||raw.range||null):convertReferenceRange(v.parameterId,v.range||raw.range||null,sourceUnit,converted.unitKey,converted.unit);
        let status=v.status||raw.status||'';
        if(typeof HealthExtractors.statusFromRange==='function'&&convertedRange&&Number.isFinite(Number(converted.value))){
          try{status=HealthExtractors.statusFromRange(Number(converted.value),convertedRange,sourceLine)||status;}catch{}
        }
        const row={...v,value:converted.value,range:convertedRange,status,unitKey:converted.unitKey,unit:converted.unit,documentId:d.id,clinicalDate:d.clinicalDate,documentTitle:d.title,facility:d.facility||'',ocrConfidence:v.confidence||0,pageNumber:v.pageNumber||raw.pageNumber||null,sourceLine};
        row._graphSourceQuality=sourceQuality;
        row._graphSourceSupported=sourceSupported;
        rows.push(row);
      }
    }
    return filterWeakOutliers(suppressWeakDuplicateRows(rows)).map(r=>{const x={...r};delete x._graphSourceQuality;delete x._graphSourceSupported;return x;});
  }

  function groupParameters(rows=[]) {
    const map=new Map();
    for(const r of rows){
      if(!map.has(r.parameterId))map.set(r.parameterId,{id:r.parameterId,name:r.parameterName,count:0,datedCount:0,unitMap:new Map()});
      const item=map.get(r.parameterId);item.count++;if(r.clinicalDate)item.datedCount++;
      const uk=r.unitKey;const unit=item.unitMap.get(uk)||{key:uk,label:r.unit,count:0};unit.count++;item.unitMap.set(uk,unit);
    }
    return [...map.values()].filter(x=>x.datedCount>0).map(x=>({id:x.id,name:x.name,count:x.count,datedCount:x.datedCount,units:[...x.unitMap.values()].sort((a,b)=>b.count-a.count)})).sort((a,b)=>a.name.localeCompare(b.name));
  }

  function parseReference(raw='') {
    const original=String(raw||'').trim();
    if(!original)return null;
    const text=original.replace(/,/g,'.').replace(/[–—]/g,'-').replace(/≤/g,'<=').replace(/≥/g,'>=').replace(/\s+/g,' ');
    let m=text.match(/(-?\d+(?:\.\d+)?)\s*(?:-|a|fino\s+a)\s*(-?\d+(?:\.\d+)?)/i);
    if(m){const lower=Number(m[1]),upper=Number(m[2]);if(Number.isFinite(lower)&&Number.isFinite(upper))return {raw:original,lower:Math.min(lower,upper),upper:Math.max(lower,upper),label:`Intervallo ${original}`};}
    m=text.match(/(?:<|<=|inferiore\s+a|fino\s+a)\s*(-?\d+(?:\.\d+)?)/i);
    if(m){const upper=Number(m[1]);if(Number.isFinite(upper))return {raw:original,upper,label:`Limite superiore ${original}`};}
    m=text.match(/(?:>|>=|superiore\s+a)\s*(-?\d+(?:\.\d+)?)/i);
    if(m){const lower=Number(m[1]);if(Number.isFinite(lower))return {raw:original,lower,label:`Limite inferiore ${original}`};}
    return {raw:original,label:`Riferimento ${original}`};
  }

  function referenceForSeries(series=[]) {
    const dated=[...series].filter(x=>x.clinicalDate&&x.range?.raw).sort((a,b)=>b.clinicalDate.localeCompare(a.clinicalDate));
    for(const item of dated){const parsed=parseReference(item.range.raw);if(parsed)return {...parsed,date:item.clinicalDate};}
    const any=series.find(x=>x.range?.raw);return any?parseReference(any.range.raw):null;
  }

  function tickDates(minX,maxX,maxTicks=18) {
    const dayMs=86400000;
    const spanDays=Math.max(1,(maxX-minX)/dayMs);
    const wanted=Math.max(2,Math.min(20,Number(maxTicks)||18));
    const ticks=[];let mode='day',domainMin=minX,domainMax=maxX;
    const minDate=new Date(minX),maxDate=new Date(maxX);
    const add=t=>{if(Number.isFinite(t)&&t>=domainMin-1&&t<=domainMax+1&&!ticks.some(x=>Math.abs(x-t)<3600000))ticks.push(t);};
    const niceStep=(raw,choices)=>choices.find(v=>v>=raw)||Math.ceil(raw);

    if(spanDays>=900){
      mode='year';
      const y0=minDate.getFullYear(),y1=maxDate.getFullYear();
      domainMin=new Date(y0,0,1,12,0,0).getTime();
      domainMax=new Date(y1+1,0,1,12,0,0).getTime();
      const years=Math.max(1,y1-y0+1);
      const step=niceStep(years/Math.max(1,wanted-1),[1,2,3,5,10,20,25,50]);
      for(let y=y0;y<=y1;y+=step)add(new Date(y,0,1,12,0,0).getTime());
      if(!ticks.length||new Date(ticks.at(-1)).getFullYear()!==y1)add(new Date(y1,0,1,12,0,0).getTime());
    }else if(spanDays>=75){
      mode='month';
      const monthIndex=d=>d.getFullYear()*12+d.getMonth();
      const m0=monthIndex(minDate),m1=monthIndex(maxDate);
      domainMin=new Date(Math.floor(m0/12),m0%12,1,12,0,0).getTime();
      const after=m1+1;domainMax=new Date(Math.floor(after/12),after%12,1,12,0,0).getTime();
      const months=Math.max(1,m1-m0+1);
      const step=niceStep(months/Math.max(1,wanted-1),[1,2,3,4,6,12,18,24]);
      for(let m=m0;m<=m1;m+=step)add(new Date(Math.floor(m/12),m%12,1,12,0,0).getTime());
      if(!ticks.length||new Date(ticks.at(-1)).getMonth()!==maxDate.getMonth()||new Date(ticks.at(-1)).getFullYear()!==maxDate.getFullYear())add(new Date(maxDate.getFullYear(),maxDate.getMonth(),1,12,0,0).getTime());
    }else{
      mode='day';
      const d0=new Date(minX);d0.setHours(12,0,0,0);
      const d1=new Date(maxX);d1.setHours(12,0,0,0);
      domainMin=d0.getTime();
      domainMax=d1.getTime();
      if(domainMax<=domainMin)domainMax=domainMin+dayMs;
      const ideal=spanDays/Math.max(1,wanted-1);
      const stepDays=niceStep(ideal,[1,2,3,4,5,7,10,14,21,30]);
      for(let t=domainMin;t<=domainMax+1;t+=stepDays*dayMs)add(t);
      if(!ticks.length||Math.abs(ticks.at(-1)-domainMax)>dayMs*.5)add(domainMax);
    }

    ticks.sort((a,b)=>a-b);
    const seen=new Set();
    const unique=ticks.filter(t=>{const label=tickLabel(t,mode);if(seen.has(label))return false;seen.add(label);return true;});
    return {ticks:unique.slice(0,wanted+2),mode,domainMin,domainMax};
  }

  function tickLabel(timestamp,mode='day') {
    const d=new Date(timestamp);
    if(mode==='year')return String(d.getFullYear());
    if(mode==='month')return new Intl.DateTimeFormat('it-IT',{month:'short',year:'2-digit'}).format(d).replace('.','');
    return new Intl.DateTimeFormat('it-IT',{day:'2-digit',month:'2-digit',year:'2-digit'}).format(d);
  }

  function estimatedAxisTextWidth(text='') {
    return [...String(text)].reduce((w,ch)=>w+((ch===','||ch==='.')?3.6:(ch==='-'?4.4:6.25)),0);
  }

  function yAxisGeometry(labels=[],baseLeft=78) {
    const titleX=18,titleHalfWidth=6,desiredGap=14,tickInset=12;
    const maxTickWidth=Math.max(0,...labels.map(estimatedAxisTextWidth));
    const left=Math.max(baseLeft,Math.ceil(titleX+titleHalfWidth+desiredGap+maxTickWidth+tickInset));
    return {left,titleX};
  }

  // Su schermi stretti il grafico si disegna alla larghezza reale, cosi' testi e punti restano leggibili.
  function chartSize(compact=false){
    let w=960;try{const vw=Math.min(window.innerWidth||960,document.documentElement.clientWidth||960);if(vw<1000)w=Math.max(340,Math.min(960,Math.round(vw-40)));}catch(_e){}
    const narrow=w<960;return {width:w,height:narrow?Math.round(Math.max(300,Math.min(compact?330:410,w*0.82))):(compact?330:410),narrow};
  }
  function svg(series=[],opts={}) {
    const size=chartSize(false),width=size.width,height=size.height;
    const valid=series.filter(x=>x.clinicalDate&&Number.isFinite(Number(x.value))).sort((a,b)=>a.clinicalDate.localeCompare(b.clinicalDate));
    if(!valid.length)return '<div class="notice">Non ci sono valori validi e datati per questo grafico.</div>';
    const dates=valid.map(x=>new Date(`${x.clinicalDate}T12:00:00`).getTime());
    const vals=valid.map(x=>Number(x.value));
    const reference=referenceForSeries(valid);
    const referenceValues=[reference?.lower,reference?.upper].filter(Number.isFinite);
    let minX=Math.min(...dates),maxX=Math.max(...dates);if(minX===maxX){minX-=86400000*15;maxX+=86400000*15;}
    const timeAxis=tickDates(minX,maxX,size.narrow?Math.max(4,Math.round(width/80)):18);const plotMinX=timeAxis.domainMin??minX,plotMaxX=timeAxis.domainMax??maxX;
    let minY=Math.min(...vals,...referenceValues),maxY=Math.max(...vals,...referenceValues);const span=maxY-minY;const margin=(span||Math.max(1,Math.abs(maxY)*0.08))*0.18;minY-=margin;maxY+=margin;
    const yTickValues=Array.from({length:6},(_,i)=>maxY-i*(maxY-minY)/5);
    const yTickLabels=yTickValues.map(fmt);
    const axisGeometry=yAxisGeometry(yTickLabels,78);
    const pad={l:axisGeometry.left,r:24,t:24,b:98};
    const x=t=>pad.l+(t-plotMinX)/(plotMaxX-plotMinX)*(width-pad.l-pad.r);const y=v=>pad.t+(maxY-v)/(maxY-minY)*(height-pad.t-pad.b);
    let grid='';for(let i=0;i<=5;i++){const yy=pad.t+i*(height-pad.t-pad.b)/5;grid+=`<line x1="${pad.l}" y1="${yy}" x2="${width-pad.r}" y2="${yy}" class="chart-grid"/><text x="${pad.l-12}" y="${yy+4}" text-anchor="end" class="chart-axis-label chart-y-tick-label">${esc(yTickLabels[i])}</text>`;}
    const points=valid.map((d,i)=>`${x(dates[i])},${y(vals[i])}`).join(' ');
    const line=valid.length>1?`<polyline points="${points}" class="chart-line"/>`:'';
    const circles=valid.map((d,i)=>{const details=[`${dateLabel(d.clinicalDate)}: ${fmt(d.value)} ${d.unit||''}`,d.range?.raw?`Riferimento: ${d.range.raw}`:'',d.status?`Stato: ${d.status}`:'',d.documentTitle?`Referto: ${d.documentTitle}`:'',d.pageNumber?`Pagina: ${d.pageNumber}`:''].filter(Boolean).join(' · ');return `<g class="chart-point" role="button" tabindex="0" data-doc-id="${esc(d.documentId)}" data-source-page="${esc(d.pageNumber||'')}" aria-label="${esc(details)}"><circle cx="${x(dates[i])}" cy="${y(vals[i])}" r="4"/><title>${esc(details)}</title></g>`;}).join('');
    const {ticks,mode}=timeAxis;
    const labels=ticks.map((t,i)=>`<g class="chart-x-tick tick-mod-${i%4}${i===ticks.length-1?' chart-x-tick-last':''}"><line x1="${x(t)}" y1="${height-pad.b}" x2="${x(t)}" y2="${height-pad.b+6}" class="chart-axis"/><text transform="translate(${x(t)-2} ${height-pad.b+18}) rotate(-40)" text-anchor="end" class="chart-axis-label chart-date-label">${esc(tickLabel(t,mode))}</text></g>`).join('');
    let refLines='';
    if(Number.isFinite(reference?.lower))refLines+=`<line x1="${pad.l}" y1="${y(reference.lower)}" x2="${width-pad.r}" y2="${y(reference.lower)}" class="chart-reference-line"/>`;
    if(Number.isFinite(reference?.upper)&&reference.upper!==reference.lower)refLines+=`<line x1="${pad.l}" y1="${y(reference.upper)}" x2="${width-pad.r}" y2="${y(reference.upper)}" class="chart-reference-line"/>`;
    const legend=reference?`<div class="chart-reference-legend"><span class="chart-reference-key" aria-hidden="true"></span><div><strong>${esc(reference.label)}</strong>${reference.date?`<small>Valore di riferimento ricavato dal referto del ${esc(dateLabel(reference.date))}</small>`:''}</div></div>`:`<div class="chart-reference-legend muted"><div><strong>Valore di riferimento non disponibile</strong><small>Il referto non contiene un intervallo numerico interpretabile.</small></div></div>`;
    return `<div class="chart-visual"><svg class="health-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Grafico andamento storico">${grid}${refLines}<line x1="${pad.l}" y1="${height-pad.b}" x2="${width-pad.r}" y2="${height-pad.b}" class="chart-axis"/>${line}${circles}${labels}<text x="${width/2}" y="${height-12}" text-anchor="middle" class="chart-axis-title">Data clinica</text><text transform="translate(${axisGeometry.titleX} ${height/2}) rotate(-90)" text-anchor="middle" class="chart-axis-title chart-y-axis-title">${esc(opts.unit||'Valore')}</text></svg></div>${legend}`;
  }


  function timelineSvg(seriesList=[],opts={}) {
    const compact=Boolean(opts.compact);const size=chartSize(compact),width=size.width,height=size.height;
    const normalized=(seriesList||[]).map((s,index)=>({
      name:s.name||`Serie ${index+1}`,unit:s.unit||opts.unit||'',className:s.className||`monitor-series-${index%5}`,
      points:(s.points||[]).filter(x=>x.date&&Number.isFinite(Number(x.value))).map(x=>({...x,value:Number(x.value)})).sort((a,b)=>a.date.localeCompare(b.date))
    })).filter(s=>s.points.length);
    const all=normalized.flatMap(s=>s.points.map(p=>({...p,series:s})));if(!all.length)return '<div class="notice">Non ci sono valori validi e datati per questo grafico.</div>';
    const dates=all.map(x=>new Date(`${x.date}T${x.time||'12:00'}:00`).getTime());const vals=all.map(x=>Number(x.value));
    let minX=Math.min(...dates),maxX=Math.max(...dates);if(minX===maxX){minX-=86400000*15;maxX+=86400000*15;}
    const timeAxis=tickDates(minX,maxX,size.narrow?Math.max(4,Math.round(width/80)):(compact?14:18));const plotMinX=timeAxis.domainMin??minX,plotMaxX=timeAxis.domainMax??maxX;
    const refs=(opts.references||[]).filter(r=>Number.isFinite(Number(r.value))).map(r=>Number(r.value));
    let minY=Math.min(...vals,...refs),maxY=Math.max(...vals,...refs);const span=maxY-minY;const margin=(span||Math.max(1,Math.abs(maxY)*.08))*.18;minY-=margin;maxY+=margin;
    const yTickValues=Array.from({length:6},(_,i)=>maxY-i*(maxY-minY)/5);
    const yTickLabels=yTickValues.map(fmt);
    const axisGeometry=yAxisGeometry(yTickLabels,compact?72:78);
    const pad={l:axisGeometry.left,r:24,t:compact?18:24,b:98};
    const x=t=>pad.l+(t-plotMinX)/(plotMaxX-plotMinX)*(width-pad.l-pad.r);const y=v=>pad.t+(maxY-v)/(maxY-minY)*(height-pad.t-pad.b);
    let grid='';for(let i=0;i<=5;i++){const yy=pad.t+i*(height-pad.t-pad.b)/5;grid+=`<line x1="${pad.l}" y1="${yy}" x2="${width-pad.r}" y2="${yy}" class="chart-grid"/><text x="${pad.l-12}" y="${yy+4}" text-anchor="end" class="chart-axis-label chart-y-tick-label">${esc(yTickLabels[i])}</text>`;}
    const drawn=normalized.map(s=>{const coords=s.points.map(p=>`${x(new Date(`${p.date}T${p.time||'12:00'}:00`).getTime())},${y(p.value)}`).join(' ');const line=s.points.length>1?`<polyline points="${coords}" class="monitor-chart-line ${s.className}"/>`:'';const circles=s.points.map(p=>{const cx=x(new Date(`${p.date}T${p.time||'12:00'}:00`).getTime()),cy=y(p.value);return `<circle cx="${cx}" cy="${cy}" r="3.6" class="monitor-chart-point ${s.className}"><title>${esc(dateLabel(p.date))}${p.time?` ${esc(p.time)}`:''}: ${esc(fmt(p.value))} ${esc(s.unit)}</title></circle>`;}).join('');return line+circles;}).join('');
    const {ticks,mode}=timeAxis;const labels=ticks.map((t,i)=>`<g class="chart-x-tick tick-mod-${i%4}${i===ticks.length-1?' chart-x-tick-last':''}"><line x1="${x(t)}" y1="${height-pad.b}" x2="${x(t)}" y2="${height-pad.b+6}" class="chart-axis"/><text transform="translate(${x(t)-2} ${height-pad.b+18}) rotate(-40)" text-anchor="end" class="chart-axis-label chart-date-label">${esc(tickLabel(t,mode))}</text></g>`).join('');
    const refLines=(opts.references||[]).filter(r=>Number.isFinite(Number(r.value))).map(r=>`<line x1="${pad.l}" y1="${y(Number(r.value))}" x2="${width-pad.r}" y2="${y(Number(r.value))}" class="chart-reference-line"/>`).join('');
    const seriesLegend=normalized.map(s=>`<span><i class="${s.className}"></i>${esc(s.name)}${s.unit?` (${esc(s.unit)})`:''}</span>`).join('');
    const referenceLegend=(opts.references||[]).filter(r=>Number.isFinite(Number(r.value))).map(r=>`<span><i class="reference"></i>${esc(r.label||'Riferimento')}: ${esc(fmt(r.value))}${r.unit?` ${esc(r.unit)}`:''}</span>`).join('');
    return `<div class="chart-visual"><svg class="health-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(opts.ariaLabel||'Grafico andamento temporale')}">${grid}${refLines}<line x1="${pad.l}" y1="${height-pad.b}" x2="${width-pad.r}" y2="${height-pad.b}" class="chart-axis"/>${drawn}${labels}<text x="${width/2}" y="${height-12}" text-anchor="middle" class="chart-axis-title">Data</text><text transform="translate(${axisGeometry.titleX} ${height/2}) rotate(-90)" text-anchor="middle" class="chart-axis-title chart-y-axis-title">${esc(opts.axisLabel||opts.unit||'Valore')}</text></svg></div><div class="monitor-chart-legend">${seriesLegend}${referenceLegend}</div>`;
  }

  return {collect,groupParameters,svg,timelineSvg,dateLabel,fmt,parseReference,referenceForSeries,plausibleParameterLabel,timeTicks:tickDates,timeTickLabel:tickLabel};
})();
