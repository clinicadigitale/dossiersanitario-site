'use strict';

const HealthReport = (() => {
  const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const multi=s=>esc(normalizeClinicalLineBreaks(s)).replace(/\r?\n/g,'<br>');
  const norm=s=>HealthExtractors.normalizeText(String(s||''));
  const slug=s=>norm(s).replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')||'sezione';
  const administrativeUrlRe=/(?:https?:\/\/|www\.|\bservlet\b|\barea\s*=\s*[a-z_]+|\bmodulistica\b|\bcup\.[a-z0-9.-]+|\bportal(?:e|i)\b)/i;

  function isNonInformativeClinicalValue(value='') {
    const c=norm(value);
    if(!c)return true;
    return /^(?:(?:nulla|niente) da segnalare|nessuna? (?:nota|annotazione|osservazione|segnalazione)|nessun commento|senza (?:note|annotazioni|osservazioni)|assenza di (?:note|annotazioni|osservazioni)|non (?:si )?(?:segnala|rileva) nulla|non vi sono (?:note|osservazioni)|n d|nd|non applicabile)$/.test(c);
  }

  function isNonInformativeClinicalRow(label='',content='') {
    const l=norm(label);const c=norm(content);
    if(!c)return true;
    if(isNonInformativeClinicalValue(content))return true;
    if(/^(?:note?|annotazioni?|osservazioni?|commento)$/.test(l)&&/^(?:nessun[oa]?|assenti?|non presenti?|non disponibili?)$/.test(c))return true;
    return false;
  }


  function normalizeClinicalLineBreaks(value='') {
    const source=String(value||'').replace(/\r/g,'').replace(/\u00ad/g,'').replace(/\u00a0/g,' ');
    if(!source.trim())return '';
    const headingRe=/^(?:anamnesi|motivo della visita|quesito clinico|indicazioni?|tecnica|esame obiettivo|obiettivit[aà]|reperti?|referto|conclusioni?|diagnosi|commento|osservazioni?|valutazione|terapia(?: in atto)?|programma|follow[- ]?up|materiale pervenuto|esame macroscopico|morfologia|classificazione|composizione corporea|screening|storia clinica|attivit[aà] di malattia)\s*[:\-]?\s*$/i;
    const listRe=/^(?:[-•▪◦*]\s+|\d{1,3}[.)]\s+|[A-Za-z][.)]\s+)/;
    const structuredRe=/^(?:[A-Z0-9]{1,5}(?:[.\/-][A-Z0-9]{1,8}){1,4}|\d{2,3}(?:\s+\d{2,3}){1,3})\s+\S+/i;
    const abbreviatedEndRe=/(?:\b(?:dott|dott\.ssa|dr|prof|sig|sig\.ra|n\.b|ecc|es|ca|cfr|u\.o|s\.p\.a)\.|\b[A-Z]\.)$/i;
    const closesSentence=line=>/[.!?][\"'”’)]?$/.test(line)&&!abbreviatedEndRe.test(line);
    const rawLines=source.split('\n');
    const out=[];let paragraph='';let listMode=false;
    /* Non introduciamo nuovi a-capo in mezzo a una riga sorgente.
       Uniamo soltanto gli a-capo grafici dell'OCR/PDF e conserviamo quelli
       che arrivano dopo una vera chiusura di frase o una struttura esplicita. */
    const flush=()=>{const clean=paragraph.replace(/[ \t]+/g,' ').trim();if(clean)out.push(clean);paragraph='';};
    for(const raw of rawLines){
      const line=raw.replace(/[ \t]+/g,' ').trim();
      if(!line){flush();if(out.length&&out.at(-1)!=='')out.push('');listMode=false;continue;}
      if(headingRe.test(line)){flush();if(out.length&&out.at(-1)!=='')out.push('');out.push(line);out.push('');listMode=false;continue;}
      if(listRe.test(line)||structuredRe.test(line)){flush();if(!listMode&&out.length&&out.at(-1)!=='')out.push('');out.push(line);listMode=true;continue;}
      if(listMode){if(out.length&&closesSentence(out.at(-1)))out.push('');listMode=false;}
      if(!paragraph){paragraph=line;continue;}
      if(closesSentence(paragraph)){flush();paragraph=line;}else paragraph+=` ${line}`;
    }
    flush();
    return out.join('\n').replace(/\n{3,}/g,'\n\n').trim();
  }

  function splitForPrint(text='',maxChars=420,minTail=140) {
    const source=String(text||'').replace(/\r/g,'').replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim();
    if(!source)return[];
    const hardMax=Math.max(180,Number(maxChars)||420);
    const minimumTail=Math.max(70,Math.min(Number(minTail)||140,Math.floor(hardMax*.55)));
    const pieces=[];
    const blocks=source.split(/\n{2,}/).map(x=>x.trim()).filter(Boolean);
    const pushWords=value=>{
      let rest=String(value||'').trim();
      while(rest.length>hardMax){
        let cut=-1;
        const sentenceWindow=rest.slice(0,hardMax+1);
        for(const re of [/[.!?;:]\s+(?=[A-ZÀ-ÖØ-Ý0-9])/g,/,\s+/g,/\s+/g]){
          let m,last=-1;while((m=re.exec(sentenceWindow)))last=m.index+m[0].length;
          if(last>=Math.floor(hardMax*.58)){cut=last;break;}
        }
        if(cut<1)cut=hardMax;
        pieces.push(rest.slice(0,cut).trim());
        rest=rest.slice(cut).trim();
      }
      if(rest)pieces.push(rest);
    };
    for(const block of blocks){
      if(block.length<=hardMax)pieces.push(block);else pushWords(block);
    }
    if(pieces.length>1&&pieces.at(-1).length<minimumTail){
      const tail=pieces.pop();
      const previous=pieces.pop()||'';
      if((previous.length+1+tail.length)<=Math.round(hardMax*1.35))pieces.push(`${previous} ${tail}`.trim());
      else{
        const words=previous.split(/\s+/);let moved='';
        while(words.length>4&&(`${moved} ${tail}`).trim().length<minimumTail){moved=`${words.pop()} ${moved}`.trim();}
        pieces.push(words.join(' ').trim());pieces.push(`${moved} ${tail}`.trim());
      }
    }
    return pieces.filter(Boolean);
  }

  function shouldSkipNarrativeRow(label='',content='') {
    const l=norm(label);const c=norm(content);
    if(!c)return true;
    const hardAdministrativeLabel=/^(?:scrivente(?:\s*:.*)?|intestazione(?: e dati del referto)?|reference id|identificazione e firma)$/i;
    if(hardAdministrativeLabel.test(String(label||'').replace(/\s+/g,' ').trim()))return true;
    const softAdministrativeLabel=/^(?:sesso|e-?mail|medico curante(?:\s*:.*)?|medico che ha consigliato il consulto(?:\s*:.*)?)$/i;
    const clinicalPayload=/(?:diagnos|terapia|esame|repert|conclusion|indicaz|pressione|ritmo|dolore|farmaco|controllo|anamnes|sintom|obiettiv|apnea|ahi|cpap|ventilaz|saturaz|compliance)/i;
    if(softAdministrativeLabel.test(String(label||'').replace(/\s+/g,' ').trim())&&!clinicalPayload.test(String(content||'')))return true;
    if(isNonInformativeClinicalRow(label,content))return true;
    if(/^(?:luogo|stanza|luogo stanza|luogo e stanza|id|identificativo|numero identificativo)$/.test(l))return true;
    if(l==='valutazione'&&(administrativeUrlRe.test(String(content||''))||!/(?:diagnos|terapia|esame|repert|conclusion|indicaz|pressione|ritmo|dolore|farmaco|controllo clinico|anamnes|sintom|obiettiv)/i.test(String(content||''))))return true;
    if(l==='controllo'&&/^(?:motivo|controllo|non indicato|nessuno)$/.test(c))return true;
    if(administrativeUrlRe.test(String(content||''))&&!/(?:diagnos|terapia|esame|repert|conclusion|indicaz|pressione|ritmo|dolore|farmaco|controllo clinico)/i.test(String(content||'')))return true;
    return false;
  }

  function referenceOriginWord(row={}) {
    if(row.statusSource==='historical_same_facility')return 'storico';
    if(row.statusSource==='external')return 'esterno';
    return '';
  }

  function visibleReference(row={}) {
    const raw=HealthExtractors.cleanReferenceText?.(row.range?.raw||row.reference||'')||row.range?.raw||row.reference||'';
    const origin=referenceOriginWord(row);
    return [raw,origin].filter(Boolean).join(' · ');
  }

  function resultRows(doc={},context={}) {
    const complexLabs=doc.complexClinicalContainer===true&&Array.isArray(doc.labValues)&&(doc.labValues||[]).length>0;
    if(!['lab','mixed'].includes(doc.documentMode) && doc.category!=='Esami di laboratorio'&&!complexLabs)return [];
    if(!complexLabs&&doc.documentMode==='mixed'&&doc.category!=='Esami di laboratorio'&&((doc.labValues||[]).length+(doc.qualitativeResults||[]).length)>200)return [];
    let repaired;
    if(doc.referenceCompletionVersion===HealthExtractors.TEST24_VERSION&&doc.clinicalValidationVersion===HealthExtractors.TEST24_VERSION) repaired=doc;
    else {
      repaired=HealthExtractors.canonicalizeClinicalDocument24?HealthExtractors.canonicalizeClinicalDocument24(doc,{forDisplay:true}).document:(HealthExtractors.repairLabDocumentData?HealthExtractors.repairLabDocumentData(doc).document:doc);
      HealthExtractors.completeReferences24?.([repaired],context.profile||{});
    }
    const numeric=repaired.labValues||[];
    const qualitative=repaired.qualitativeResults||[];
    const out=[];const seen=new Set();
    const add=r=>{
      if(!r||HealthExtractors.isReferenceContinuationName?.(r.test||'')||HealthExtractors.isContextualNonExamName?.(r.test||'',r.sourceLine||'')||isNonInformativeClinicalRow(r.test,r.result))return;
      const key=norm(`${r.test}|${r.result}|${r.unit}`);if(!key||seen.has(key))return;seen.add(key);out.push(r);
    };
    numeric.forEach(v=>{let status=v.status||'';if(v.range&&Number.isFinite(Number(v.value))&&typeof HealthExtractors.statusFromRange==='function'){try{status=HealthExtractors.statusFromRange(Number(v.value),v.range,`${v.range?.semanticRaw||v.range?.raw||''} ${v.sourceLine||''}`)||status;}catch(_){}}add({test:v.parameterName,result:v.displayResult||(v.rawValue??v.value),unit:v.unit||'',reference:visibleReference(v),status,statusSource:v.statusSource||'',statusSourceLabel:v.statusSourceLabel||'',referenceSource:v.referenceSource||null,section:v.labSection||HealthExtractors.labSectionForValue?.(v,repaired)||'Altri esami di laboratorio',sourceLine:v.sourceLine||''});});
    qualitative.forEach(q=>add({test:q.test,result:q.result,unit:q.unit||'',reference:visibleReference(q),status:q.status||HealthExtractors.semanticQualitativeStatus?.(q.result)||'',statusSource:q.statusSource||'',referenceSource:q.referenceSource||null,section:q.labSection||HealthExtractors.labSectionForValue?.(q,repaired)||'Altri esami di laboratorio',sourceLine:q.sourceLine||''}));
    return out;
  }

  function groupedResultRows(rows=[]) {
    const map=new Map();for(const row of rows){const section=row.section||'Altri esami di laboratorio';if(!map.has(section))map.set(section,[]);map.get(section).push(row);}
    const preferred=HealthExtractors.TEST20_PANEL_ORDER||HealthExtractors.TEST19_PANEL_ORDER||[];
    const keys=[...map.keys()].sort((a,b)=>{const ai=preferred.indexOf(a),bi=preferred.indexOf(b);if(ai>=0||bi>=0)return(ai<0?999:ai)-(bi<0?999:bi);return a.localeCompare(b,'it');});
    return keys.map(section=>({section,rows:map.get(section)}));
  }

  function metadataRows(doc={},formatDate=v=>v||'') {
    const sameDate=Boolean(doc.clinicalDate&&doc.issueDate&&String(doc.clinicalDate)===String(doc.issueDate));
    const rows=[
      ['Data clinica',doc.clinicalDate?formatDate(doc.clinicalDate):'Non definita'],
      ['Data emissione',!sameDate&&doc.issueDate?formatDate(doc.issueDate):''],
      ['Tipologia',doc.documentKind||doc.category||''],
      ['Struttura sanitaria',doc.facility||''],
      ['Reparto o specializzazione',doc.specialization||doc.department||''],
      ['Medico/refertante',((/visita specialistica/i.test(String(doc.category||''))||/^visita\b/i.test(String(doc.documentKind||'')))&&doc.doctor)?doc.doctor:'']
    ];
    return rows.filter(([,v])=>String(v||'').trim());
  }

  function usefulSignature(text='') {
    const value=String(text||'');
    const match=value.match(/(?:medico\s+firmatario|firmatario)\s*:\s*([A-ZÀ-ÖØ-Ý][A-ZÀ-ÖØ-Ý'’ .-]{2,}?)(?=\s+(?:data|num\.?\s*certificato|id\s*referto|$))/i);
    return match?`Firma: ${match[1].replace(/\s+/g,' ').trim()}`:'';
  }

  const narrativeAdminLineRe=/(?:azienda\s+(?:ospedaliera|sanitaria)|servizio\s+sanitario|who\s+collaborating|dipartimento|u\.?o\.?\s|direttore|responsabile|ambulatorio|prenotazione|centralino|telefono|tel\.?|fax|e-?mail|@|codice\s+fiscale|data\s+di\s+nascita|luogo\s+di\s+nascita|indirizzo|residenza|cartella\s+clinica|numero\s+referto|paziente\s*:|esecutore\s*:)/i;
  function stripAdministrativeFragments(text='') {
    return String(text||'').split(/\n+/).map(line=>line.replace(/\s+/g,' ').trim()).filter(line=>{
      if(!line)return false;
      if(narrativeAdminLineRe.test(line)&&!/(?:diagnos|terapia|eutirox|tsh|ft3|ft4|peso|ecograf|nodul|pression|farmaco|controllo|anamnes|repert|conclusion|sintom)/i.test(line))return false;
      return true;
    }).join('\n');
  }

  function cleanClinicalNarrative(text='') {
    const source=String(text||'');
    const extracted=String(HealthExtractors.cleanNarrativeFragment?.(source)||'');
    const conservative=stripAdministrativeFragments(source);
    const informationScore=value=>{const v=String(value||'');const clinical=(v.match(/(?:diagnos|terapia|programma|controllo|esame|repert|conclusion|ecograf|tac|risonanz|farmaco|pressione|dolore|lesion|tiroide|follow.?up|prelievo|visita|appuntamento)/gi)||[]).length;const admin=(v.match(/(?:telefono|fax|e-?mail|codice fiscale|servizio sanitario|direttore|centralino|firmato digitalmente)/gi)||[]).length;return v.length+clinical*50-admin*70;};
    const stronglyAdministrative=/(?:codice\s+fiscale|azienda\s+(?:ospedaliera|sanitaria)|servizio\s+sanitario|direttore|paziente\s*:)/i.test(source);
    let value=(!stronglyAdministrative&&conservative?conservative:(informationScore(conservative)>=informationScore(extracted)?conservative:extracted)).replace(/\r/g,'\n');
    value=value
      .replace(/===\s*PAGINA\s*\d+\s*===/gi,'\n')
      .replace(/Rappresentazione\s+di\s+un\s+referto\s+firmato\s+elettronicamente[\s\S]*?(?=(?:File\s+originale\s*:|$))/gi,'\n')
      .replace(/Num\.?\s*Certificato[\s\S]*?(?=(?:File\s+originale\s*:|$))/gi,'\n')
      .replace(/File\s+originale\s*:[^\n]*/gi,'\n')
      .replace(/Caricato\s+il\s+\d{1,2}\/\d{1,2}\/\d{2,4}[^\n]*/gi,'\n')
      .replace(/https?:\/\/\S+/gi,' ')
      .replace(/\bwww\.\S+/gi,' ')
      .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi,' ')
      .replace(/\b(?:area|module|modulo|servlet|action)\s*=\s*[^\s;]+/gi,' ')
      /* Campi amministrativi che nei PDF/OCR lunghi possono risultare
         incorporati nella stessa riga di testo clinico. Vengono rimossi
         come campi, non eliminando l'intera riga. */
      .replace(/\b(?:tel(?:efono)?|cell(?:ulare)?|fax|centralino)\s*[:.]?\s*\+?\d[\d .()\/-]{4,}/gi,' ')
      .replace(/\bdata\s+di\s+nascita\s*[:.]?\s*(?:[-–— ]{1,12}|\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4})/gi,' ')
      .replace(/\bluogo\s+di\s+nascita\s*[:.]?\s*[A-ZÀ-ÖØ-Ý'’ .-]{2,40}(?=\s+(?:codice|residenza|domicilio|nosologico|data|diario|scheda|$))/gi,' ')
      .replace(/\bcodice\s+fiscale\s*[:.]?\s*[A-Z0-9* .-]{6,24}/gi,' ')
      .replace(/\bnum(?:ero|\.)?\s+telefonici?\s*[:.]?\s*[+0-9 .\/-]{5,40}/gi,' ')
      .replace(/\b(?:indirizzo\s+)?residenza(?:\s*\(domicilio\))?\s*[:.]?\s*[^\n]{0,100}?(?=\s+(?:nosologico|scheda|diario|data|$))/gi,' ')
      .replace(/\bdirettore\s*:\s*(?:dott\.?|dr\.?)?\s*[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÿ'’ .-]{2,60}/gi,' ')
      .replace(/\b(?:azienda\s+ospedalier[oa](?:-universitaria)?\s+pisana|servizio\s+sanitario\s+nazionale|servizio\s+sanitario\s+della\s+toscana)\b/gi,' ')
      .replace(/_{5,}/g,'\n');
    const clinicalWords=/(?:repert|conclusion|diagnos|indicaz|osservaz|esame|tecnica|indagine|sinus|lesion|frattur|versamento|stenos|ritmo|intervallo|frequenza|commento|terapia|farmaco|dolore|ispessimento|cisti|setto|mucosa|pressione|saturazione|controllo|prelievo|visita|appuntamento|ecograf)/i;
    const adminOnly=/(?:^|\b)(?:tel\.?|telefono|fax|e-?mail|indirizzo|via\s+[A-ZÀ-ÖØ-öø-ÿ]|cod(?:ice)?\s+(?:fiscale|sanitario)|provenienza|pag\.?\s*\d+|richiesta\s*:\s*\d+|routine\s+richiesta|id\s*referto|data\s+di\s+nascita|età\s*:\s*\d+|sesso\s*[MF]|dipartimento|azienda\s+usl|servizio\s+sanitario|ospedale\s+["“]?|https?:\/\/|www\.|servlet|area\s*=|modulistica)/i;
    const out=[];const seen=new Set();
    for(const raw of value.split(/\n+/)){
      let line=raw.replace(/[ \t]+/g,' ').trim();
      if(!line)continue;
      if(adminOnly.test(line)){
        const marker=line.match(/\b(?:REFERTO\s+DI\s+VISITA(?:\s+[A-ZÀ-ÖØ-Ý-]+){0,5}|ANAMNESI|MOTIVO\s+DELLA\s+VISITA|ESAME\s+OBIETTIVO|REPERTI?|CONCLUSIONI?|DIAGNOSI|TERAPIA|ULTIMA\s+VISITA|CONTROLLO\s+GLICEMICO|RIFERISCE|IN\s+VISIONE)\b/i);
        if(marker&&marker.index>0)line=line.slice(marker.index).trim();
      }
      /* Se una riga OCR inizia con un'intestazione amministrativa ma
         contiene poi vero testo clinico, conserva solo dal primo marcatore
         clinico affidabile. Evita di perdere il reperto insieme all'header. */
      if((adminOnly.test(line)||(HealthExtractors.narrativeAdminHits27?.(line)||0)>0)){
        const resume=/\b(?:DIARIO\s+CLINICO(?:\s+COMPLETO)?|TRIAGE|PARAMETRI\s+VITALI|ANAMNESI|ESAME\s+OBIETTIVO|ESAME\s*[:\-]|DIAGNOSI|TERAPIA|CONCLUSIONI|PROGRAMMA|RIFERISCE|NEGA|Paziente\s+(?:vigile|collaborante|apiret|eupnoic|stabile|gravemente)|EMOCROMO|EMOGASANALISI|GLUCOSIO|CREATININA|POTASSIO|SODIO|TROPONINA)\b/i.exec(line);
        if(resume&&resume.index>0)line=line.slice(resume.index).trim();
      }
      const noteLine=line.match(/^(note?|annotazioni?|osservazioni?|commento)\s*[:\-]?\s*(.*)$/i);
      if((noteLine&&isNonInformativeClinicalRow(noteLine[1],noteLine[2]))||isNonInformativeClinicalValue(line))continue;
      if(adminOnly.test(line)&&!clinicalWords.test(line))continue;
      const key=norm(line);if(!key||seen.has(key))continue;
      seen.add(key);out.push(line);
    }
    return normalizeClinicalLineBreaks(out.join('\n').replace(/\n{3,}/g,'\n\n').trim());
  }

  function isEcgDoc(doc={}) {
    const text=`${doc.title||''} ${doc.originalName||''} ${doc.category||''} ${doc.documentKind||''} ${doc.reconstructedText||''} ${doc.extractedText||''}`;
    return /\b(?:ecg|elettrocardiogramma|elettrocardiografico)\b/i.test(text)&&/(?:freq\.?\s*vent|int\.?\s*pr|dur\.?\s*qrs|assi\s*p\s*[-/]\s*r\s*[-/]\s*t)/i.test(text);
  }

  function isRadiologyDoc(doc={}) {
    const text=`${doc.title||''} ${doc.originalName||''} ${doc.category||''} ${doc.documentKind||''}`;
    return /\b(?:tac|tc|rmn?|risonanza|radiograf|radiolog|rx|ecograf|ecodoppler|cone\s*beam)\b/i.test(text);
  }

  function radiologyRows(doc={}) {
    if(!isRadiologyDoc(doc))return[];
    const source=String(doc.reconstructedText||doc.extractedText||doc.structuredText||(doc.reportSections||[]).map(s=>s.text||'').join('\n')||'');
    const examRe=/\b(?:TAC|TC|RMN?|RISONANZA\s+MAGNETICA|RADIOGRAFIA|RX|ECOGRAFIA|ECOCOLOR\s+DOPPLER|ECODOPPLER|CONE\s*BEAM)[A-ZÀ-ÖØ-Ý0-9 /+\-]{3,120}?(?=\s+(?:Indagine|Esame|Studio|Acquisizione|L['’]esame)\b|\n|$)/g;
    const matches=[...source.matchAll(examRe)];if(!matches.length)return[];
    const exam=matches.at(-1);let title=exam[0].replace(/\s+/g,' ').trim();
    let body=source.slice(exam.index+exam[0].length)
      .replace(/(?:Esecutore\s*:|Il\s+Medico\s+Radiologo|Referto\s+firmato\s+digitalmente|Refertato\s+il\s*:|Versione\s+n[°o]?)[\s\S]*$/i,'')
      .trim();
    body=cleanClinicalNarrative(body);if(!body)return[['Esame',title]];
    const lines=body.split(/\n+/).map(x=>x.trim()).filter(Boolean);const text=lines.join(' ');
    let technique='',findings=text;
    const firstSentence=text.match(/^((?:Indagine|Esame|Studio|Acquisizione|L['’]esame)[\s\S]{15,}?[.!?])\s+([\s\S]+)$/i);
    if(firstSentence){technique=firstSentence[1].trim();findings=firstSentence[2].trim();}
    const rows=[['Esame',title]];if(technique)rows.push(['Tecnica / Indicazione',technique]);if(findings)rows.push(['Reperti e conclusioni',findings]);return rows;
  }

  function ecgRows(doc={}) {
    const stored=Array.isArray(doc.ecgParameters)?doc.ecgParameters:[];
    if(stored.length)return stored.filter(x=>x&&x.parameter&&x.value).map(x=>[x.parameter,x.value]);
    const extracted=HealthExtractors.extractEcgParameters?.(doc)||[];
    return extracted.map(x=>[x.parameter,x.value]);
  }

  function ecgTable(doc={}) {
    const rows=ecgRows(doc);if(!rows.length)return'';
    return `<h3 class="print-subtitle">Parametri ECG</h3><table class="print-table print-key-value-table print-ecg-table"><colgroup><col class="col-label"><col class="col-value"></colgroup><thead><tr><th>Parametro</th><th>Valore</th></tr></thead><tbody>${rows.map(([a,b])=>`<tr><th>${esc(a)}</th><td class="print-multiline">${multi(b)}</td></tr>`).join('')}</tbody></table>`;
  }

  function canonicalNarrativeLabel(value=''){
    const clean=String(value||'Sezione clinica').replace(/\s+/g,' ').trim().replace(/[,;:\-]?\s*continua\s*$/i,'').trim();
    const n=norm(clean);
    if(/^(?:e mail|email|medico curante|medico che ha consigliato il consulto)\b/.test(n))return{key:'referto',label:'Referto'};
    if(/^commento\b/.test(n))return{key:'commento',label:'Commento'};
    if(/^esami ematochimici\b/.test(n))return{key:'esami-ematochimici',label:'Esami ematochimici'};
    if(/^reperti e conclusioni\b/.test(n))return{key:'reperti-conclusioni',label:'Reperti e conclusioni'};
    if(/^referto\b/.test(n))return{key:'referto',label:'Referto'};
    if(/^anamnesi\b/.test(n))return{key:'anamnesi',label:'Anamnesi'};
    if(/^diagnosi\b/.test(n))return{key:'diagnosi',label:'Diagnosi'};
    if(/^terapia\b/.test(n))return{key:'terapia',label:'Terapia'};
    if(/^programma\b/.test(n))return{key:'programma',label:'Programma'};
    if(/^follow up\b|^follow-up\b/.test(n))return{key:'follow-up',label:'Follow-up'};
    if(/^dalla presente analisi.*classificazione/.test(n))return{key:'classificazione-analisi',label:clean};
    return{key:n||'sezione-clinica',label:clean||'Sezione clinica'};
  }
  function mergeNarrativePairs(pairs=[]){
    const merged=new Map(),order=[];
    for(const pair of pairs){
      const label=pair?.[0],raw=pair?.[1];
      if(shouldSkipNarrativeRow(label,raw))continue;
      const info=canonicalNarrativeLabel(label);
      const content=cleanClinicalNarrative(raw);if(!content||shouldSkipNarrativeRow(info.label,content))continue;
      if(!merged.has(info.key)){merged.set(info.key,{label:info.label,parts:[],seen:new Set()});order.push(info.key);}
      const row=merged.get(info.key),ck=norm(content);
      const redundant=row.parts.some(existing=>{const ek=norm(existing);return ek===ck||(ck.length>30&&ek.includes(ck))||(ek.length>30&&ck.includes(ek));});
      if(!row.seen.has(ck)&&!redundant){row.seen.add(ck);row.parts.push(content);}
    }
    return order.map(key=>{const row=merged.get(key);return[row.label,row.parts.join('\n\n')]}).filter(([,v])=>v);
  }

  function narrativeSourcePairs(doc={}) {
    const pairs=[];
    for(const section of doc.reportSections||[])if(String(section?.text||'').trim())pairs.push([section.title||'Referto',section.text]);
    for(const field of doc.pdfFields||[])if(field?.include!==false&&String(field?.value||'').trim())pairs.push([field.label||'Referto',field.value]);
    return pairs;
  }

  function rawNarrativeRows(doc={}) {
    const rawCandidates=[doc.reconstructedText,doc.extractedText,doc.structuredText]
      .map(value=>String(value||'').trim()).filter(Boolean);
    if(!rawCandidates.length)return[];
    let clean='';
    for(const raw of rawCandidates){const candidate=cleanClinicalNarrative(raw);if(candidate.length>clean.length)clean=candidate;}
    if(!clean)return[];
    const rows=[];let current=null;
    const heading=/^(Tecnica|Indicazione|Indicazioni|Quesito clinico|Motivo della visita|Anamnesi|Esame obiettivo|Reperti|Reperto|Conclusioni|Conclusione|Diagnosi|Commento|Osservazioni|Referto|Valutazione|Terapia(?: in atto)?|Programma|Follow[- ]?up|Materiale pervenuto|Esame macroscopico|Morfologia|Classificazione|Composizione corporea)\s*[:\-]?\s*(.*)$/i;
    for(const line of clean.split(/\n+/)){
      const m=line.match(heading);
      if(m){current=[m[1],m[2]||''];rows.push(current);continue;}
      if(current)current[1]+=`${current[1]?'\n':''}${line}`;
    }
    const merged=mergeNarrativePairs(rows);if(merged.length)return merged;
    return [['Referto',clean]];
  }

  function narrativeRowSetScore(rows=[]) {
    const text=rows.map(([,content])=>String(content||'')).join('\n');
    const sectionBonus=rows.length>1?Math.min(rows.length,12)*45:0;
    const clinicalBonus=(text.match(/\b(?:diagnos|terapia|anamnes|repert|conclusion|ecograf|tac|risonanz|esame obiettivo|programma|controllo|paziente|dolore|pressione|tiroide|lesion|stenos|massa|morfologia)\w*/gi)||[]).length*4;
    const adminPenalty=(text.match(/\b(?:telefono|fax|e-?mail|codice fiscale|prenotazione|centralino|direttore|servizio sanitario)\b/gi)||[]).length*18;
    return text.length+sectionBonus+clinicalBonus-adminPenalty;
  }

  function isAdministrativeNarrativeLabel(label='') {
    return /^(?:il medico|medico|firma|firmatario|refertatore|scrivente(?:\s*:.*)?|direttore|responsabile|dati anagrafici|intestazione(?: e dati del referto)?|reference id|identificazione e firma|documento originale|struttura sanitaria|reparto|specializzazione)$/i.test(String(label||'').replace(/\s+/g,' ').trim());
  }

  function mergePreferredNarrativeRows(primary=[],secondary=[]) {
    const base=mergeNarrativePairs(primary||[]);
    const seen=new Set(base.map(([label])=>canonicalNarrativeLabel(label).key));
    const out=[...base];
    for(const pair of secondary||[]){
      const label=pair?.[0]||'Referto';
      if(isAdministrativeNarrativeLabel(label))continue;
      const info=canonicalNarrativeLabel(label);
      if(seen.has(info.key))continue;
      const merged=mergeNarrativePairs([pair]);
      if(!merged.length)continue;
      const content=String(merged[0][1]||'');
      if(content.length<8)continue;
      out.push(merged[0]);seen.add(info.key);
    }
    const order=['referto','anamnesi','motivo della visita','esame obiettivo','reperti','diagnosi','terapia','conclusioni','programma','follow-up','commento'];
    return out.map((row,index)=>({row,index,key:canonicalNarrativeLabel(row[0]).key})).sort((a,b)=>{const ai=order.indexOf(a.key),bi=order.indexOf(b.key);if(ai>=0||bi>=0)return(ai<0?999:ai)-(bi<0?999:bi)||a.index-b.index;return a.index-b.index;}).map(x=>x.row);
  }

  function canonicalRowsForDocument(doc={}) {
    const finalVersion=(doc.clinicalCanonicalVersion===globalThis.HealthExtractors?.V602_CANONICAL_VERSION)||/^test27-v(?:1[789]|2[0-4])$/.test(String(doc.clinicalValidationVersion||''));
    const directMode=doc.documentMode||((doc.category==='Esami di laboratorio')?'lab':'narrative');
    if(finalVersion&&directMode!=='lab'&&Array.isArray(doc.reportSections)&&doc.reportSections.length){
      const direct=[];const byKey=new Map();
      for(const section of doc.reportSections){const info=canonicalNarrativeLabel(section?.title||'Referto'),text=cleanClinicalNarrative(String(section?.text||''));if(!text)continue;if(byKey.has(info.key)){const item=byKey.get(info.key);item[1]+=`

${text}`;}else{const item=[info.label,text];byKey.set(info.key,item);direct.push(item);}}
      if(direct.length)return direct;
    }
    let repaired=doc;
    try{
      if(HealthExtractors.canonicalizeClinicalDocument24)repaired=HealthExtractors.canonicalizeClinicalDocument24(doc,{forDisplay:true}).document;
      else if(HealthExtractors.repairNarrativeDocumentData)repaired=HealthExtractors.repairNarrativeDocumentData(doc).document;
    }catch(error){console.error('Normalizzazione narrativa non riuscita, uso della sorgente originale:',error);repaired=doc;}
    const repairedPairs=[];
    for(const field of repaired.pdfFields||[])if(field?.include!==false&&String(field?.value||'').trim())repairedPairs.push([field.label||'Referto',field.value]);
    for(const section of repaired.reportSections||[])if(String(section?.text||'').trim())repairedPairs.push([section.title||'Referto',section.text]);
    const originalPairs=narrativeSourcePairs(doc).filter(([label])=>!isAdministrativeNarrativeLabel(label));
    let rows=mergePreferredNarrativeRows(repairedPairs,originalPairs);
    if(rows.length)return rows;
    rows=mergeNarrativePairs(originalPairs);if(rows.length)return rows;
    const radiology=mergeNarrativePairs(radiologyRows(doc));if(radiology.length)return radiology;
    return rawNarrativeRows(doc);
  }

  function meaningfulNarrativeSource(doc={}) {
    return canonicalRowsForDocument(doc).map(([,content])=>String(content||'')).join('\n\n').trim();
  }

  function narrativeRows(doc={},options={}) {
    return canonicalRowsForDocument(doc);
  }

  function coverageTokens(value='') {
    return norm(value).split(/[^a-z0-9à-ÿ]+/i).filter(token=>token.length>=4&&!/^(?:pagina|referto|sezione|contenuto|paziente|documento|sanitario|medico|azienda|ospedale|servizio|telefono|codice|fiscale)$/.test(token));
  }
  function coverageRatio(source='',target='') {
    /* Su cartelle cliniche molto estese il vecchio validatore legacy può
       diventare quadraticamente costoso. La copertura per token unici è
       equivalente per questo controllo e resta lineare anche su centinaia
       di pagine. */
    if(String(source||'').length<120000&&String(target||'').length<120000&&HealthExtractors.narrativeTokenCoverage27)return HealthExtractors.narrativeTokenCoverage27(source,target);
    const wanted=new Set(coverageTokens(source)),found=new Set(coverageTokens(target));if(!wanted.size)return 1;let hits=0;for(const token of wanted)if(found.has(token))hits++;return hits/wanted.size;
  }
  function canonicalNarrativeExpectation(doc={}) {
    return narrativeRows(doc).map(([,content])=>String(content||'')).join('\n\n').replace(/\s+/g,' ').trim();
  }
  function hasNarrativeSource(doc={}) {
    if(doc.narrativeSourcePresent===true)return true;
    if((doc.reportSections||[]).some(section=>String(section?.text||'').trim()))return true;
    if((doc.pdfFields||[]).some(field=>field?.include!==false&&String(field?.value||'').trim()))return true;
    return Boolean(String(doc.extractedText||doc.structuredText||doc.reconstructedText||doc.narrativeClinicalSource||'').trim());
  }
  function validateNarrativeCoverage(docs=[],root=null) {
    const errors=[];if(!root)return['Contenitore di stampa non disponibile'];
    const adminResidual=/(?:\b(?:tel(?:efono)?|cell(?:ulare)?|fax)\s*[:.]\s*\+?\d|[\w.+-]+@[\w.-]+\.[a-z]{2,}|\bcodice fiscale\s*:|\bdata (?:di )?nascita\s*:|\bpaziente\s*:\s*(?:sig\.?\/?ra|sig\.?|[A-ZÀ-ÖØ-Ý][A-ZÀ-ÖØ-Ý' -]{2,}\s+[A-ZÀ-ÖØ-Ý][A-ZÀ-ÖØ-Ý' -]{2,})|\bnumero referto\s*:|\bsede operativa\b|\bdirettore sanitario\b)/i;
    for(const doc of docs||[]){
      const mode=doc.documentMode||((doc.category==='Esami di laboratorio')?'lab':'narrative');
      if(!['narrative','mixed','diagnosis'].includes(mode))continue;
      const expected=canonicalNarrativeExpectation(doc);
      const sourcePresent=hasNarrativeSource(doc);
      const label=doc.title||doc.originalName||doc.id;
      const documentKey=`document-${String(doc.id||'')}`;
      const paginatedNodes=[...root.querySelectorAll('.print-document-fragment')].filter(item=>item.dataset.printDocumentId===documentKey);
      const node=paginatedNodes[0]||root.querySelector(`[id="document-${String(doc.id||'').replace(/"/g,'\\"')}"]`);
      const documentNodes=paginatedNodes.length?paginatedNodes:(node?[node]:[]);
      if(!documentNodes.length){errors.push(`${label}: documento non generato`);continue;}
      const ecg=documentNodes.map(item=>item.querySelector('.print-ecg-table')).find(Boolean);
      const structuredEcg=Boolean(isEcgDoc(doc)&&ecg&&ecg.querySelectorAll('tbody tr').length);
      if(sourcePresent&&expected.length<28&&!structuredEcg){errors.push(`${label}: testo sorgente presente ma collezione clinica canonica vuota`);continue;}
      if(structuredEcg||!sourcePresent||expected.length<28)continue;
      const containers=documentNodes.flatMap(item=>[...item.querySelectorAll('.print-narrative-fragment-table,.print-narrative-source-table')]);
      const renderedParts=[];
      const clinicalElementText=element=>{const copy=element.cloneNode(true);copy.querySelectorAll('br').forEach(br=>br.replaceWith(document.createTextNode(' ')));return copy.textContent||'';};
      for(const table of containers){
        const paragraphs=[...table.querySelectorAll('td.print-narrative-content p')];
        if(paragraphs.length)renderedParts.push(...paragraphs.map(clinicalElementText));
        else renderedParts.push(...[...table.querySelectorAll('td.print-narrative-content')].map(clinicalElementText));
      }
      const rendered=renderedParts.join(' ').replace(/\s+/g,' ').trim();
      if(rendered.length<28){errors.push(`${label}: referto assente nel PDF`);continue;}
      const ratio=coverageRatio(expected,rendered);
      if(ratio<0.98)errors.push(`${label}: contenuto canonico incompleto nel PDF (${Math.round(ratio*100)}%)`);
      /* V6.0.4: il residuo amministrativo viene ripulito a monte. Non blocca da solo l'export. */
    }
    return [...new Set(errors)];
  }

  function narrativeParagraphsHtml(content='') {
    const blocks=String(content||'').replace(/\r/g,'').split(/\n{2,}/).map(block=>block.trim()).filter(Boolean);
    return blocks.map(block=>`<p>${multi(block)}</p>`).join('');
  }
  function narrativeSourceRowHtml(label='',content='') {
    return `<tr class="print-narrative-source-row" data-section-label="${esc(label)}"><th scope="row"><strong>${esc(label)}</strong></th><td class="print-narrative-content">${narrativeParagraphsHtml(content)}</td></tr>`;
  }
  function narrativeTable(doc={}) {
    let rows=narrativeRows(doc);
    if(!rows.length){const fallback=String(HealthExtractors.narrativeClinicalSource27?.(doc)||doc.narrativeClinicalSource||'').trim();if(fallback)rows=[['Referto',fallback]];}
    if(!rows.length)return doc.narrativeNeedsReview?'<div class="print-empty print-review-required">Testo narrativo non ricostruibile automaticamente. Consultare il file originale.</div>':'<div class="print-empty">Nessun testo clinico disponibile.</div>';
    return `<table class="print-table print-narrative-table print-narrative-source-table"><colgroup><col class="col-section"><col class="col-content"></colgroup><thead><tr><th>Sezione</th><th>Contenuto</th></tr></thead><tbody>${rows.map(([label,content])=>narrativeSourceRowHtml(label,content)).join('')}</tbody></table>`;
  }

  function therapyColumnWidths(rows=[]) {
    const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
    const values=(field,alt='')=>rows.map(r=>String(r?.[field]||r?.[alt]||'').trim());
    const score=list=>{if(!list.length)return 0;const lengths=list.map(x=>x.length);return Math.sqrt(lengths.reduce((a,b)=>a+b,0)/list.length)+Math.sqrt(Math.max(...lengths,0));};
    const timeValues=values('time','schedule');
    const time=clamp(6.5+Math.max(...timeValues.map(x=>x.length),0)*0.16,7,10);
    const dosage=clamp(9+score(values('dosage'))*0.20,9,14);
    const minimum={med:16,active:15,notes:38};
    let extra=100-time-dosage-minimum.med-minimum.active-minimum.notes;
    const scores={med:Math.max(1,score(values('medication'))),active:Math.max(1,score(values('activeIngredient'))),notes:Math.max(3,score(values('frequency','notes'))*1.7)};
    const total=scores.med+scores.active+scores.notes;
    let med=minimum.med+extra*scores.med/total;
    let active=minimum.active+extra*scores.active/total;
    let notes=minimum.notes+extra*scores.notes/total;
    med=clamp(med,16,22);active=clamp(active,15,21);
    notes=100-time-dosage-med-active;
    if(notes<38){const need=38-notes;const takeMed=Math.min(need/2,med-16);med-=takeMed;active-=Math.min(need-takeMed,active-15);notes=100-time-dosage-med-active;}
    const rounded=[time,med,active,dosage,notes].map(x=>Math.round(x*10)/10);rounded[4]=Math.round((100-rounded.slice(0,4).reduce((a,b)=>a+b,0))*10)/10;return rounded;
  }

  function therapyColgroup(rows=[]){return `<colgroup>${therapyColumnWidths(rows).map((w,i)=>`<col class="therapy-col-${i+1}" style="width:${w}%">`).join('')}</colgroup>`;}

  function formatTherapyTime(raw='') {
    const original=String(raw||'').trim();if(!original)return'';
    const lowered=original.toLocaleLowerCase('it-IT').replace(/\s+/g,' ').trim();
    const daypart=/^(?:al risveglio|prima di colazione|dopo colazione|prima di pranzo|dopo pranzo|prima di cena|dopo cena|prima di coricarsi|al bisogno|durante i pasti)$/i;
    if(daypart.test(lowered))return lowered.replace(/^./,c=>c.toUpperCase());
    const m=lowered.match(/^([01]?\d|2[0-3])\s*[:.]\s*([0-5]\d)$/);
    return m?`${String(Number(m[1])).padStart(2,'0')}:${m[2]}`:original;
  }

  function statusClass(value=''){
    const n=norm(value);
    if(!n||/non definito|non disponibile|nd|n d/.test(n))return'non-definito';
    if(/da verificare/.test(n))return'da-verificare';
    if(/alterato|anomalo|anormale|positivo|rilevato/.test(n))return'alterato';
    if(/insufficiente|critico|critica|fuori parametro/.test(n))return'insufficiente';
    if(/alto|superiore|elevato/.test(n))return'alto';
    if(/basso|inferiore|ridotto/.test(n))return'basso';
    if(/immunita presente/.test(n))return'nei-limiti';
    if(/non valutabile|immunita non rilevata/.test(n))return'non-definito';
    if(/limiti|normale|regolare/.test(n))return'nei-limiti';
    return'non-definito';
  }

  function labRowsTable(rows=[]) {
    return `<table class="print-table print-results-table striped-results"><colgroup><col class="col-test"><col class="col-result"><col class="col-unit"><col class="col-reference"><col class="col-status"></colgroup><thead><tr><th>Esame</th><th>Risultato</th><th>Unità</th><th>Riferimento</th><th>Stato</th></tr></thead><tbody>${rows.map(r=>{const status=String(r.status||'').trim();const statusHtml=status?`<span class="print-status ${statusClass(status)}">${esc(status)}</span>`:'';return `<tr><td>${esc(r.test)}</td><td class="numeric-cell"><strong>${esc(r.result)}</strong></td><td>${esc(r.unit)}</td><td>${esc(r.reference)}</td><td>${statusHtml}</td></tr>`;}).join('')}</tbody></table>`;
  }

  function panelAnchorId(doc={},section='',index=0) {
    return `document-${slug(doc.id||doc.originalName||'documento')}-panel-${slug(section)}-${Number(index)||0}`;
  }

  function labTable(doc={},context={}) {
    const rows=resultRows(doc,context);
    if(!rows.length){
      const narrative=narrativeRows(doc);
      return narrative.length?narrativeTable(doc):'<div class="print-empty">Nessun risultato clinico disponibile.</div>';
    }
    const groups=groupedResultRows(rows);
    return `<h3 class="print-subtitle">Risultati clinici</h3>${groups.map((g,index)=>`<div id="${esc(panelAnchorId(doc,g.section,index))}" class="print-lab-panel"><h4 class="print-panel-title">${esc(g.section)}</h4>${labRowsTable(g.rows)}</div>`).join('')}`;
  }

  function therapiesTable(rows=[]) {
    if(!rows.length)return '';
    return `<h3 class="print-subtitle">Schema terapeutico rilevato</h3><table class="print-table print-therapy-table">${therapyColgroup(rows)}<thead><tr><th>Orario</th><th>Farmaco</th><th>Principio attivo</th><th>Dosaggio</th><th>Frequenza / Note</th></tr></thead><tbody>${rows.map(t=>`<tr><td>${esc(formatTherapyTime(t.time||t.schedule||''))}</td><td><strong>${esc(t.medication||'')}</strong></td><td>${esc(t.activeIngredient||'')}</td><td>${esc(t.dosage||'')}</td><td class="print-multiline">${multi(t.frequency||t.notes||'')}</td></tr>`).join('')}</tbody></table>`;
  }


  function automaticInterpretationLegend(docs=[]) {
    let historical=false,external=false,verify=false;const externalSources=new Map();
    for(const doc of docs){for(const v of [...(doc.labValues||[]),...(doc.qualitativeResults||[])]){historical ||= v?.statusSource==='historical_same_facility';external ||= v?.statusSource==='external';verify ||= norm(v?.status||'').includes('da verificare');if(v?.statusSource==='external'&&v.referenceSource?.name){const src=v.referenceSource;externalSources.set(`${src.name}|${src.version||''}|${src.date||''}`,src);}}}
    if(!historical&&!external&&!verify)return'';
    const sources=[...externalSources.values()].map(src=>`<li>${esc(src.name)}${src.version?` · ${esc(src.version)}`:''}${src.date?` · ${esc(src.date)}`:''}</li>`).join('');
    return `<section class="print-section print-flow-section print-macro-section print-interpretation-legend"><h2>Avvertenza sui riferimenti</h2><div class="print-legend-box"><p>I valori riportati nella colonna <strong>Riferimento</strong> possono provenire da fonti diverse.</p><p><strong>Senza dicitura:</strong> riferimento presente nel referto originale.</p>${historical?'<p><strong>storico:</strong> riferimento recuperato da un precedente referto compatibile dello stesso profilo e della stessa struttura sanitaria o laboratorio, con unità e metodo compatibili quando rilevanti.</p>':''}${external?`<p><strong>esterno:</strong> riferimento tratto da una fonte ufficiale autorevole perché non era disponibile uno storico compatibile della stessa struttura.</p>${sources?`<ul>${sources}</ul>`:''}`:''}${verify?'<p><strong>Da verificare:</strong> il percorso completo non ha consentito una classificazione affidabile.</p>':''}<p>I riferimenti aggiunti servono esclusivamente a supportare la classificazione automatica. Non modificano il referto originale e non sostituiscono la valutazione del medico o del laboratorio.</p></div></section>`;
  }

  function clinicalSummaryTable603(doc={}) {
    const rows=Array.isArray(doc.clinicalSummarySections)?doc.clinicalSummarySections.filter(s=>String(s?.text||'').trim()):[];
    if(!rows.length)return narrativeTable(doc);
    return `<div class="print-summary-note">Contenuto clinico rilevante estratto dalla cartella clinica. Il documento originale completo resta consultabile nell’archivio.</div><table class="print-table print-narrative-table print-narrative-source-table"><colgroup><col class="col-section"><col class="col-content"></colgroup><thead><tr><th>Sezione</th><th>Contenuto</th></tr></thead><tbody>${rows.map(s=>narrativeSourceRowHtml(s.title||'Sintesi clinica',s.text||'')).join('')}</tbody></table>`;
  }

  function documentHtml(doc={},helpers={}) {
    const formatDate=helpers.formatDate||((v)=>v||'');const formatDateTime=helpers.formatDateTime||((v)=>v||'');
    const meta=metadataRows(doc,formatDate);
    const sourceLabel=[doc.originalName||'',doc.addedAt?`caricato il ${formatDateTime(doc.addedAt)}`:''].filter(Boolean).join(' · ');
    if(sourceLabel)meta.push(['Documento originale',sourceLabel]);
    const mode=doc.documentMode||((doc.category==='Esami di laboratorio')?'lab':'narrative');
    let content='';const ecg=ecgTable(doc);
    const summaryOnly=doc.pdfExportMode==='summary'&&doc.complexClinicalContainer===true;
    if(summaryOnly)content=clinicalSummaryTable603(doc);
    else if(ecg)content=ecg;
    else if(mode==='lab')content=labTable(doc,helpers);
    else if(mode==='mixed')content=`${narrativeTable(doc)}${labTable(doc,helpers)}`;
    else if(mode==='therapy'){
      const therapy=therapiesTable(doc.extractedTherapies||[]),narrative=narrativeRows(doc).length?narrativeTable(doc):'';
      content=`${therapy}${narrative}`||'<div class="print-empty">Nessun contenuto clinico disponibile.</div>';
    } else content=narrativeTable(doc);
    const notes=doc.notes&&!isNonInformativeClinicalValue(doc.notes)?`<h3 class="print-subtitle">Note personali</h3><div class="print-narrative"><p>${esc(doc.notes)}</p></div>`:'';
    return `<section id="document-${esc(doc.id||'')}" class="print-document print-flow-section"><div class="print-document-intro"><header class="print-document-header"><div><h2>${esc(doc.title||doc.originalName||'Documento sanitario')}</h2><div class="print-document-date">${esc(formatDate(doc.clinicalDate))}</div></div><div class="print-document-header-actions"><span class="print-document-category">${esc(doc.documentKind||doc.category||'Documento sanitario')}</span><a class="print-back-index" href="#chronological-index">Torna all’indice</a></div></header>${meta.length?`<table class="print-table print-meta-table"><tbody>${meta.map(([a,b])=>`<tr><th>${esc(a)}</th><td>${esc(b)}</td></tr>`).join('')}</tbody></table>`:''}</div>${content}${notes}</section>`;
  }

  function chronologicalIndexHtml(docs=[],helpers={}) {
    const formatDate=helpers.formatDate||((v)=>v||'');
    const visible=docs.filter(d=>d.timelineVisible!==false);const extended=helpers.extended===true;
    const rows=[];
    for(const d of visible){
      rows.push(`<tr class="print-index-document-row"><td>${esc(formatDate(d.clinicalDate))}</td><td><a class="print-index-link" href="#document-${esc(d.id||'')}" title="Vai al documento"><strong>${esc(d.title||d.originalName||'Documento')}</strong></a></td><td>${esc(d.documentKind||d.category||'')}</td></tr>`);
      if(!extended)continue;
      const clinicalRows=resultRows(d,helpers);if(!clinicalRows.length)continue;
      const groups=groupedResultRows(clinicalRows);
      groups.forEach((group,index)=>{
        if(!group.rows?.length)return;
        if(group.section==='Altri esami di laboratorio'&&group.rows.length<2)return;
        rows.push(`<tr class="print-index-panel-row"><td></td><td><a class="print-index-panel-link" href="#${esc(panelAnchorId(d,group.section,index))}">${esc(group.section)}</a></td><td></td></tr>`);
      });
    }
    const monitorLinks=Array.isArray(helpers.monitorLinks)?helpers.monitorLinks.filter(x=>x?.href&&x?.label):[];
    const monitorLinksHtml=monitorLinks.length?`<div class="print-index-monitor-links"><h3>Monitoraggio personale</h3>${monitorLinks.map(x=>`<a class="print-index-monitor-link" href="${esc(x.href)}">${esc(x.label)}</a>`).join('')}</div>`:'';
    return `<section id="chronological-index" class="print-page print-section print-flow-section print-macro-section print-index-section"><h2>Indice cronologico</h2>${visible.length?`<table class="print-table print-index-table"><thead><tr><th>Data</th><th>Documento</th><th>Tipologia</th></tr></thead><tbody>${rows.join('')}</tbody></table>`:'<p>Nessun documento registrato.</p>'}${monitorLinksHtml}</section>`;
  }

  function outerHeight(element){const style=getComputedStyle(element);return element.getBoundingClientRect().height+(parseFloat(style.marginTop)||0)+(parseFloat(style.marginBottom)||0);}
  function mmPixels(mm,host=null){const probe=document.createElement('div');probe.style.cssText=`position:absolute;visibility:hidden;height:${mm}mm;width:1px;display:block!important;`;const parent=host||document.querySelector('#printRoot')||document.body;parent.appendChild(probe);const measured=probe.getBoundingClientRect().height;probe.remove();return measured>0?measured:(Number(mm)||0)*96/25.4;}
  function splitParagraphWords(text='',fits=()=>false){
    const source=String(text||'').trim();if(!source)return['',''];
    const tokens=source.match(/\S+\s*/g)||[];if(!tokens.length)return['',source];
    let lo=1,hi=tokens.length,best=0;
    while(lo<=hi){const mid=Math.floor((lo+hi)/2),candidate=tokens.slice(0,mid).join('').trimEnd();if(fits(candidate)){best=mid;lo=mid+1;}else hi=mid-1;}
    if(best<1)return['',source];
    return[tokens.slice(0,best).join('').trimEnd(),tokens.slice(best).join('').trimStart()];
  }
  function rebalanceNarrativeTail(head='',tail='',minimumTailWords=12){
    const headTokens=String(head||'').match(/\S+\s*/g)||[],tailTokens=String(tail||'').match(/\S+\s*/g)||[];
    if(!headTokens.length||!tailTokens.length||tailTokens.length>=minimumTailWords)return[head,tail];
    const total=headTokens.length+tailTokens.length,desired=Math.min(minimumTailWords,Math.max(tailTokens.length,Math.floor(total*.42)));
    const move=Math.min(headTokens.length-1,Math.max(0,desired-tailTokens.length));if(move<1)return[head,tail];
    const moved=headTokens.splice(headTokens.length-move).join('').trim();
    return[headTokens.join('').trimEnd(),`${moved}${moved&&tail?' ':''}${tail}`.trimStart()];
  }
  function narrativeFragmentTableNode(rows=[]){
    const table=document.createElement('table');table.className='print-table print-narrative-table print-narrative-fragment-table';
    table.innerHTML=`<colgroup><col class="col-section"><col class="col-content"></colgroup><thead><tr><th>Sezione</th><th>Contenuto</th></tr></thead><tbody>${rows.map(row=>`<tr class="print-narrative-row${row.continuation?' print-narrative-continuation-start':''}" data-section-label="${esc(row.label)}"><th scope="row"><strong>${esc(row.label)}</strong>${row.continuation?'<small>continua dalla pagina precedente</small>':''}</th><td class="print-narrative-content">${row.paragraphs.map(text=>`<p>${multi(text)}</p>`).join('')}</td></tr>`).join('')}</tbody>`;
    return table;
  }
  async function preparePrintLayout(root,options={}){
    if(!root)return;
    const spaceSaving=options.spaceSaving===true;
    const progressCallback=typeof options.onProgress==='function'?options.onProgress:null;
    const yieldUi=()=>new Promise(resolve=>setTimeout(resolve,0));
    const reportProgress=async(done,total,label='Impaginazione PDF')=>{try{progressCallback?.({done,total,ratio:total?done/total:1,label});}catch(_){ }await yieldUi();};
    if(root.dataset.printLayoutPrepared==='v602-final'&&root.querySelector('.print-paginated-root'))return;
    delete root.dataset.test25Prepared;delete root.dataset.test26Prepared;delete root.dataset.printLayoutPrepared;
    delete root.dataset.printLayoutOverflowCount;delete root.dataset.printLayoutError;
    const sourceNodes=[...root.children].map(node=>node.cloneNode(true));
    root.replaceChildren();root.classList.add('print-preparing');
    const paginated=document.createElement('div');paginated.className='print-paginated-root';root.appendChild(paginated);
    let sheet=null,content=null,pageNumber=0;
    const pages=[];
    const cleanBreakClasses=node=>{if(!node)return node;node.classList?.remove('print-force-page-before');node.querySelectorAll?.('.print-force-page-before').forEach(item=>item.classList.remove('print-force-page-before'));return node;};
    const newPage=(extraClass='')=>{
      sheet=document.createElement('section');sheet.className=`print-sheet${extraClass?` ${extraClass}`:''}`;sheet.dataset.pageNumber=String(++pageNumber);
      content=document.createElement('div');content.className='print-sheet-content';sheet.appendChild(content);paginated.appendChild(sheet);pages.push(sheet);return content;
    };
    const ensurePage=()=>content||newPage();
    const printRoundingReserve=mmPixels(0.8,root);
    const usedHeight=target=>{if(!target||!target.children.length)return 0;const top=target.getBoundingClientRect().top;let bottom=top;for(const child of target.children){const rect=child.getBoundingClientRect();bottom=Math.max(bottom,rect.bottom);}return Math.max(0,bottom-top);};
    const fits=()=>Boolean(content)&&usedHeight(content)<=content.clientHeight-printRoundingReserve+1;
    const pageHasContent=()=>Boolean(content&&[...content.children].some(node=>!node.classList.contains('print-document-gap')&&!node.classList.contains('print-flow-gap')));
    const hasContentBefore=node=>Boolean(content&&[...content.children].some(item=>item!==node&&!item.classList.contains('print-document-gap')&&!item.classList.contains('print-flow-gap')));
    const cloneShell=(node,{continuation=false}={})=>{const clone=cleanBreakClasses(node.cloneNode(false));if(continuation){clone.removeAttribute('id');clone.classList.add('print-continuation-wrapper');}return clone;};
    const createContext=(template,kind='section')=>{
      let wrapper=null,wrapperSheet=null,continuationIndex=0;
      return{
        template,kind,
        reset(){wrapper=null;wrapperSheet=null;},
        ensure(continuation=false){ensurePage();if(wrapper&&wrapperSheet===sheet)return wrapper;wrapper=cloneShell(template,{continuation});wrapper.classList.add(kind==='document'?'print-document-fragment':'print-section-fragment');if(kind==='document')wrapper.dataset.printDocumentId=template.id||'';if(continuation)wrapper.dataset.continuationIndex=String(++continuationIndex);content.appendChild(wrapper);wrapperSheet=sheet;return wrapper;},
        current(){return wrapper&&wrapperSheet===sheet?wrapper:null;}
      };
    };
    const removeEmptyWrapper=ctx=>{const wrapper=ctx.current();if(wrapper&&!wrapper.children.length){wrapper.remove();ctx.reset();}};
    const moveContextToNewPage=ctx=>{newPage();ctx.reset();return ctx.ensure(true);};
    const appendAtomic=(ctx,node)=>{
      let parent=ctx.ensure(Boolean(pageNumber>1)),clone=cleanBreakClasses(node.cloneNode(true));parent.appendChild(clone);
      if(fits())return clone;
      clone.remove();const hadEarlier=parent.children.length>0||hasContentBefore(parent);removeEmptyWrapper(ctx);
      if(hadEarlier){parent=moveContextToNewPage(ctx);clone=cleanBreakClasses(node.cloneNode(true));parent.appendChild(clone);}
      if(!fits())clone.classList.add('print-oversize-block');return clone;
    };
    const tableShell=(source,{continuation=false}={})=>{
      const table=cleanBreakClasses(source.cloneNode(false));table.classList.add('print-table-fragment');if(continuation){table.removeAttribute('id');table.classList.add('print-table-continuation');}
      const colgroup=source.querySelector(':scope > colgroup');if(colgroup)table.appendChild(colgroup.cloneNode(true));
      const thead=source.querySelector(':scope > thead');if(thead)table.appendChild(thead.cloneNode(true));
      table.appendChild(document.createElement('tbody'));return table;
    };
    /* TEST 37 · frammentazione generale delle righe tabellari.
       Una riga logica resta unica nei dati, ma puo essere divisa graficamente
       tra piu pagine. La prima cella identifica la continuazione. */
    const rowTextValue=cell=>normalizeClinicalLineBreaks(cell?.textContent||'').replace(/\s+/g,' ').trim();
    const splitCandidateForRow=sourceRow=>{
      const cells=[...sourceRow.children];
      const candidates=cells.map((cell,index)=>{
        const text=rowTextValue(cell),words=text.match(/\S+\s*/g)||[];
        const protectedCell=Boolean(cell.querySelector?.('.print-status,.print-document-category,img,svg,canvas'));
        return{index,text,words,score:text.length+(words.length*8),protectedCell};
      }).filter(item=>!item.protectedCell&&item.text.length>=36&&item.words.length>=3);
      candidates.sort((a,b)=>b.score-a.score);
      return candidates[0]||null;
    };
    const splitRowNode=(sourceRow,targetIndex,piece,continuation=false)=>{
      const row=cleanBreakClasses(sourceRow.cloneNode(true));
      const cells=[...row.children],sourceCells=[...sourceRow.children];
      if(continuation){
        cells.forEach((cell,index)=>{
          if(index!==targetIndex)cell.replaceChildren();
        });
      }
      const target=cells[targetIndex];
      if(target)target.textContent=piece;
      if(continuation&&cells.length){
        const marker=document.createElement('small');marker.className='print-row-continuation';marker.textContent='continua dalla pagina precedente';
        if(targetIndex===0){target?.appendChild(marker);}
        else{
          const label=cells[0],sourceLabel=sourceCells[0];
          if(label&&sourceLabel){label.innerHTML=sourceLabel.innerHTML;label.appendChild(marker);}
          else target?.appendChild(marker);
        }
        row.classList.add('print-row-fragment-continuation');
      }
      row.classList.add('print-row-fragment');
      return row;
    };
    const splitLongTableRow=(sourceRow,{getTbody,moveToPage,onPrinted=()=>{}}={})=>{
      if(typeof getTbody!=='function'||typeof moveToPage!=='function')return false;
      const candidate=splitCandidateForRow(sourceRow);if(!candidate)return false;
      const fullText=candidate.text;let remaining=fullText,continuation=false,printed=false,noFitMoveUsed=false;
      const probeFits=piece=>{const tbody=getTbody();if(!tbody)return false;const probe=splitRowNode(sourceRow,candidate.index,piece,continuation);tbody.appendChild(probe);const ok=fits();probe.remove();return ok;};
      const bestPiece=()=>{
        const tokens=remaining.match(/\S+\s*/g)||[];let bestWords=0,lo=1,hi=tokens.length;
        while(lo<=hi){const mid=Math.floor((lo+hi)/2),piece=tokens.slice(0,mid).join('').trimEnd();if(piece&&probeFits(piece)){bestWords=mid;lo=mid+1;}else hi=mid-1;}
        if(bestWords>0){const head=tokens.slice(0,bestWords).join('').trimEnd(),tail=tokens.slice(bestWords).join('').trimStart();return[head,tail];}
        /* Anche URL, codici o parole senza spazi devono poter essere spezzati. */
        let bestChars=0;lo=1;hi=remaining.length;
        while(lo<=hi){const mid=Math.floor((lo+hi)/2),piece=remaining.slice(0,mid).trimEnd();if(piece&&probeFits(piece)){bestChars=mid;lo=mid+1;}else hi=mid-1;}
        if(bestChars>0)return[remaining.slice(0,bestChars).trimEnd(),remaining.slice(bestChars).trimStart()];
        return['',remaining];
      };
      while(remaining){
        const [head,tail]=bestPiece();
        if(head){
          const headWords=head.match(/\S+/g)||[];
          const tooSmallFirst=!continuation&&tail&&(headWords.length<8||head.length<42);
          if(tooSmallFirst&&!printed&&!noFitMoveUsed){moveToPage();noFitMoveUsed=true;continue;}
          getTbody()?.appendChild(splitRowNode(sourceRow,candidate.index,head,continuation));
          printed=true;onPrinted();remaining=tail;continuation=true;noFitMoveUsed=false;
          if(remaining)moveToPage();
          continue;
        }
        if(noFitMoveUsed)return false;
        moveToPage();noFitMoveUsed=true;
      }
      return printed;
    };
    const diagnosisHistoryTable=(ctx,source,heading=null)=>{
      const rows=[...source.querySelectorAll(':scope > tbody > tr')];
      if(!rows.length){if(heading)appendAtomic(ctx,heading);appendAtomic(ctx,source);return;}
      let fragment=null,headingClone=null,hasPrintedRows=false;
      const startFragment=()=>{
        const parent=ctx.ensure(hasPrintedRows);
        if(heading&&!hasPrintedRows){headingClone=cleanBreakClasses(heading.cloneNode(true));parent.appendChild(headingClone);}else headingClone=null;
        fragment=tableShell(source,{continuation:hasPrintedRows});parent.appendChild(fragment);return fragment;
      };
      const makeRow=(sourceRow,noteText,continuation=false)=>{
        const out=cleanBreakClasses(sourceRow.cloneNode(true));
        const cells=[...out.children];
        if(cells.length>=4){
          if(continuation){
            cells[0].textContent='';
            const label=(sourceRow.children[1]?.textContent||'Condizione').replace(/\s*continua(?: dalla pagina precedente)?\s*$/i,'').trim();
            cells[1].innerHTML=`<strong>${esc(label)}</strong><small class="print-row-continuation">continua dalla pagina precedente</small>`;
            cells[2].textContent='';
          }
          cells[3].textContent=noteText;
        }
        return out;
      };
      const moveWithoutLosingHeading=()=>{
        const parent=ctx.current();
        if(fragment&&!fragment.tBodies[0].rows.length){fragment.remove();headingClone?.remove();if(parent&&!parent.children.length){parent.remove();ctx.reset();}}
        newPage();ctx.reset();startFragment();
      };
      const splitLongRow=sourceRow=>{
        const originalCells=[...sourceRow.children];
        const note=normalizeClinicalLineBreaks(originalCells[3]?.textContent||'');
        const tokens=note.match(/\S+\s*/g)||[];
        if(!tokens.length)return false;
        let cursor=0,continuation=false;
        while(cursor<tokens.length){
          let best=0,lo=1,hi=tokens.length-cursor;
          while(lo<=hi){
            const mid=Math.floor((lo+hi)/2),candidate=tokens.slice(cursor,cursor+mid).join('').trimEnd();
            const probe=makeRow(sourceRow,candidate,continuation);fragment.tBodies[0].appendChild(probe);
            const ok=fits();probe.remove();if(ok){best=mid;lo=mid+1;}else hi=mid-1;
          }
          if(best>0){
            const head=tokens.slice(cursor,cursor+best).join('').trimEnd();
            const tooSmall=cursor===0&&tokens.length>best&&(best<8||head.length<42);
            if(tooSmall&&pageHasContent()){moveWithoutLosingHeading();continue;}
            fragment.tBodies[0].appendChild(makeRow(sourceRow,head,continuation));
            cursor+=best;continuation=true;hasPrintedRows=true;
            if(cursor<tokens.length){newPage();ctx.reset();startFragment();}
            continue;
          }
          if(fragment.tBodies[0].rows.length||pageHasContent()){
            const hadRows=fragment.tBodies[0].rows.length>0;
            if(hadRows)hasPrintedRows=true;
            moveWithoutLosingHeading();continue;
          }
          return false;
        }
        return true;
      };
      startFragment();
      for(const sourceRow of rows){
        let row=cleanBreakClasses(sourceRow.cloneNode(true));fragment.tBodies[0].appendChild(row);
        if(fits()){hasPrintedRows=true;continue;}
        row.remove();
        if(splitLongRow(sourceRow))continue;
        const bodyHasRows=fragment.tBodies[0].rows.length>0;
        if(bodyHasRows)hasPrintedRows=true;
        if(bodyHasRows||pageHasContent())moveWithoutLosingHeading();
        row=cleanBreakClasses(sourceRow.cloneNode(true));fragment.tBodies[0].appendChild(row);
        if(fits())hasPrintedRows=true;else row.classList.add('print-oversize-row');
      }
    };
    const genericTable=(ctx,source,heading=null)=>{
      if(source.classList.contains('print-diagnosis-table')){diagnosisHistoryTable(ctx,source,heading);return;}
      const rows=[...source.querySelectorAll(':scope > tbody > tr')];
      if(!rows.length){if(heading)appendAtomic(ctx,heading);appendAtomic(ctx,source);return;}
      let fragment=null,headingClone=null,hasPrintedRows=false;
      const startFragment=()=>{
        const parent=ctx.ensure(hasPrintedRows);
        if(heading&&!hasPrintedRows){headingClone=cleanBreakClasses(heading.cloneNode(true));parent.appendChild(headingClone);}else headingClone=null;
        fragment=tableShell(source,{continuation:hasPrintedRows});parent.appendChild(fragment);return fragment;
      };
      const moveToPage=()=>{
        const parent=ctx.current();
        if(fragment&&!fragment.tBodies[0].rows.length){fragment.remove();headingClone?.remove();if(parent&&!parent.children.length){parent.remove();ctx.reset();}}
        newPage();ctx.reset();startFragment();
      };
      startFragment();
      for(const sourceRow of rows){
        let row=cleanBreakClasses(sourceRow.cloneNode(true));fragment.tBodies[0].appendChild(row);
        if(fits()){hasPrintedRows=true;continue;}
        row.remove();
        if(splitLongTableRow(sourceRow,{getTbody:()=>fragment?.tBodies?.[0]||null,moveToPage,onPrinted:()=>{hasPrintedRows=true;}}))continue;
        const currentBodyHasRows=fragment.tBodies[0].rows.length>0;
        if(currentBodyHasRows)hasPrintedRows=true;
        if(currentBodyHasRows||pageHasContent())moveToPage();
        row=cleanBreakClasses(sourceRow.cloneNode(true));fragment.tBodies[0].appendChild(row);
        if(fits())hasPrintedRows=true;else row.classList.add('print-oversize-row');
      }
    };
    const containerChildren=(ctx,source)=>{
      let container=null,containerSheet=null;
      const ensureContainer=()=>{const parent=ctx.ensure(Boolean(container));if(container&&containerSheet===sheet)return container;container=cloneShell(source,{continuation:Boolean(container)});parent.appendChild(container);containerSheet=sheet;return container;};
      for(const child of [...source.children]){
        let target=ensureContainer(),clone=cleanBreakClasses(child.cloneNode(true));target.appendChild(clone);
        if(fits())continue;
        clone.remove();if(!target.children.length){target.remove();container=null;}
        newPage();ctx.reset();container=null;target=ensureContainer();clone=cleanBreakClasses(child.cloneNode(true));target.appendChild(clone);if(!fits())clone.classList.add('print-oversize-block');
      }
    };

    /* V6.0.1 stabilita · le esenzioni estese non sono blocchi atomici.
       Una singola esenzione puo contenere decine di prestazioni e deve quindi
       continuare sulle pagine successive senza produrre overflow o perdere testo. */
    const nodeTextWithBreaks=node=>{
      if(!node)return'';const copy=node.cloneNode(true);copy.querySelectorAll?.('br').forEach(br=>br.replaceWith(document.createTextNode('\n')));return normalizeClinicalLineBreaks(copy.textContent||'');
    };
    const exemptionsFlow=(ctx,source,heading=null)=>{
      let container=null,containerSheet=null,printedAnything=false,headingClone=null;
      const ensureContainer=(continuation=false)=>{
        const parent=ctx.ensure(continuation||printedAnything);
        if(container&&containerSheet===sheet)return container;
        if(heading&&!printedAnything){headingClone=cleanBreakClasses(heading.cloneNode(true));parent.appendChild(headingClone);}else headingClone=null;
        container=cloneShell(source,{continuation:continuation||printedAnything});parent.appendChild(container);containerSheet=sheet;return container;
      };
      const removeEmptyContainer=()=>{
        if(container&&!container.children.length){container.remove();container=null;containerSheet=null;}
        const parent=ctx.current();if(parent&&!parent.children.length){parent.remove();ctx.reset();}
      };
      const movePage=()=>{removeEmptyContainer();newPage();ctx.reset();container=null;containerSheet=null;headingClone=null;};
      const cardShell=(sourceCard,continuation=false)=>{
        const card=cloneShell(sourceCard,{continuation});card.replaceChildren();card.classList.add('print-exemption-card-fragment');
        const header=sourceCard.querySelector(':scope > header');
        if(header){const h=cleanBreakClasses(header.cloneNode(true));if(continuation){const mark=document.createElement('small');mark.className='print-exemption-continuation';mark.textContent='continua dalla pagina precedente';h.appendChild(mark);}card.appendChild(h);}
        if(!continuation){const meta=sourceCard.querySelector(':scope > .print-exemption-meta');if(meta)card.appendChild(cleanBreakClasses(meta.cloneNode(true)));}
        return card;
      };
      const bodyBlocks=sourceCard=>[...sourceCard.children].filter(child=>!child.matches?.('header,.print-exemption-meta'));
      const blockWithText=(sourceBlock,text)=>{
        const clone=cleanBreakClasses(sourceBlock.cloneNode(true));const p=clone.querySelector(':scope > p')||clone.querySelector('p');if(p)p.innerHTML=multi(text);return clone;
      };
      const splitCard=sourceCard=>{
        let continuation=false,card=null,fragmentHasBody=false,cardPrinted=false;
        const startCard=()=>{
          const target=ensureContainer(continuation||printedAnything);card=cardShell(sourceCard,continuation);target.appendChild(card);
          if(fits())return true;
          card.remove();
          if(!target.children.length&&headingClone){headingClone.remove();headingClone=null;}
          if(pageHasContent()){movePage();const fresh=ensureContainer(continuation||printedAnything);card=cardShell(sourceCard,continuation);fresh.appendChild(card);return fits();}
          return false;
        };
        if(!startCard())card.classList.add('print-oversize-block');
        for(const sourceBlock of bodyBlocks(sourceCard)){
          let whole=cleanBreakClasses(sourceBlock.cloneNode(true));card.appendChild(whole);
          if(fits()){printedAnything=true;fragmentHasBody=true;cardPrinted=true;continue;}
          whole.remove();
          const paragraph=sourceBlock.querySelector(':scope > p')||sourceBlock.querySelector('p');const sourceText=nodeTextWithBreaks(paragraph);
          if(!paragraph||!sourceText){
            if(fragmentHasBody||printedAnything){movePage();continuation=true;startCard();}
            card.appendChild(cleanBreakClasses(sourceBlock.cloneNode(true)));if(!fits())card.lastElementChild?.classList.add('print-oversize-block');printedAnything=true;fragmentHasBody=true;cardPrinted=true;continue;
          }
          let remaining=sourceText;
          while(remaining){
            const probeFits=text=>{const probe=blockWithText(sourceBlock,text);card.appendChild(probe);const ok=fits();probe.remove();return ok;};
            let [head,tail]=splitParagraphWords(remaining,probeFits);
            if(!head){
              /* Se titolo/metadati hanno consumato il fondo pagina, spostiamo
                 l'intera prima parte evitando un titolo di esenzione orfano. */
              const canMove=pageHasContent();
              if(canMove){card.remove();if(!ensureContainer().children.length){removeEmptyContainer();}movePage();continuation=cardPrinted;startCard();fragmentHasBody=false;continue;}
              const forced=remaining.slice(0,Math.max(1,Math.min(remaining.length,1200)));head=forced;tail=remaining.slice(forced.length);
            }
            card.appendChild(blockWithText(sourceBlock,head));printedAnything=true;fragmentHasBody=true;cardPrinted=true;remaining=tail;
            if(remaining){movePage();continuation=true;startCard();fragmentHasBody=false;}
          }
        }
      };
      for(const sourceCard of [...source.children]){
        let target=ensureContainer(printedAnything),full=cleanBreakClasses(sourceCard.cloneNode(true));target.appendChild(full);
        if(fits()){printedAnything=true;continue;}
        full.remove();splitCard(sourceCard);
      }
    };
    const diagnosisMain=(ctx,source)=>{
      const titleSource=source.querySelector(':scope > h3');
      const paragraphs=[...source.querySelectorAll(':scope > p')];
      const statusSource=paragraphs[0]||null;
      const noteSource=paragraphs[1]||null;
      const noteText=noteSource?normalizeClinicalLineBreaks(noteSource.textContent||''):'';
      let first=true,cursor=0;const tokens=noteText.match(/\S+\s*/g)||[];
      const fragmentNode=(text='',continuation=false)=>{
        const article=cloneShell(source,{continuation});article.classList.add('print-diagnosis-main-fragment');
        if(titleSource){const title=cleanBreakClasses(titleSource.cloneNode(true));if(continuation){title.insertAdjacentHTML('beforeend','<small>continua dalla pagina precedente</small>');}article.appendChild(title);}
        if(!continuation&&statusSource)article.appendChild(cleanBreakClasses(statusSource.cloneNode(true)));
        if(text){const p=document.createElement('p');p.textContent=text;article.appendChild(p);}
        return article;
      };
      if(!tokens.length){appendAtomic(ctx,source);return;}
      while(cursor<tokens.length){
        let parent=ctx.ensure(!first),best=0,lo=1,hi=tokens.length-cursor,probe=null;
        while(lo<=hi){const mid=Math.floor((lo+hi)/2),candidate=tokens.slice(cursor,cursor+mid).join('').trimEnd();probe=fragmentNode(candidate,!first);parent.appendChild(probe);const ok=fits();probe.remove();if(ok){best=mid;lo=mid+1;}else hi=mid-1;}
        if(best<1){removeEmptyWrapper(ctx);newPage();ctx.reset();parent=ctx.ensure(false);continue;}
        const head=tokens.slice(cursor,cursor+best).join('').trimEnd();
        const tooSmall=cursor===0&&tokens.length>best&&(best<8||head.length<42);
        if(tooSmall&&pageHasContent()){removeEmptyWrapper(ctx);newPage();ctx.reset();continue;}
        parent.appendChild(fragmentNode(head,!first));cursor+=best;
        if(cursor<tokens.length){newPage();ctx.reset();first=false;}
      }
    };

    /* TEST 37 · riquadri testuali frammentabili.
       Serve in particolare per l'Avvertenza sui riferimenti: il titolo resta
       insieme alla prima parte realmente stampabile e il riquadro prosegue
       nella pagina seguente senza lasciare vuoti artificiali. */
    const flowTextBox=(ctx,source,heading=null)=>{
      let fragment=null,headingClone=null,hasPrinted=false;
      const startFragment=()=>{
        const parent=ctx.ensure(hasPrinted);
        if(heading&&!hasPrinted){headingClone=cleanBreakClasses(heading.cloneNode(true));parent.appendChild(headingClone);}else headingClone=null;
        fragment=cloneShell(source,{continuation:hasPrinted});fragment.classList.add('print-flow-box-fragment');parent.appendChild(fragment);return fragment;
      };
      const moveToPage=()=>{
        const parent=ctx.current();
        if(fragment&&!fragment.children.length){fragment.remove();headingClone?.remove();if(parent&&!parent.children.length){parent.remove();ctx.reset();}}
        newPage();ctx.reset();startFragment();
      };
      const appendSimpleNode=sourceNode=>{
        let clone=cleanBreakClasses(sourceNode.cloneNode(true));fragment.appendChild(clone);
        if(fits()){hasPrinted=true;return;}
        clone.remove();
        if(fragment.children.length){moveToPage();clone=cleanBreakClasses(sourceNode.cloneNode(true));fragment.appendChild(clone);if(fits()){hasPrinted=true;return;}}
        else if(pageHasContent()){moveToPage();clone=cleanBreakClasses(sourceNode.cloneNode(true));fragment.appendChild(clone);if(fits()){hasPrinted=true;return;}}
        /* Caso raro: singolo paragrafo/list item piu alto di una pagina. */
        clone.remove();const text=rowTextValue(sourceNode);const tokens=text.match(/\S+\s*/g)||[];let cursor=0,continuation=false;
        while(cursor<tokens.length){
          let best=0,lo=1,hi=tokens.length-cursor;
          while(lo<=hi){const mid=Math.floor((lo+hi)/2),candidate=tokens.slice(cursor,cursor+mid).join('').trimEnd();const probe=sourceNode.cloneNode(false);probe.textContent=candidate;fragment.appendChild(probe);const ok=fits();probe.remove();if(ok){best=mid;lo=mid+1;}else hi=mid-1;}
          if(best<1){moveToPage();continue;}
          const piece=sourceNode.cloneNode(false);piece.textContent=tokens.slice(cursor,cursor+best).join('').trimEnd();if(continuation)piece.classList?.add('print-text-continuation');fragment.appendChild(piece);hasPrinted=true;cursor+=best;continuation=true;if(cursor<tokens.length)moveToPage();
        }
      };
      startFragment();
      for(const child of [...source.children]){
        if(child.matches?.('ul,ol')){
          for(const item of [...child.children]){
            let list=fragment.lastElementChild;if(!list||list.tagName!==child.tagName){list=cleanBreakClasses(child.cloneNode(false));fragment.appendChild(list);}
            let clone=cleanBreakClasses(item.cloneNode(true));list.appendChild(clone);
            if(fits()){hasPrinted=true;continue;}
            clone.remove();if(!list.children.length)list.remove();moveToPage();list=cleanBreakClasses(child.cloneNode(false));fragment.appendChild(list);clone=cleanBreakClasses(item.cloneNode(true));list.appendChild(clone);if(fits()){hasPrinted=true;continue;}
            clone.remove();if(!list.children.length)list.remove();appendSimpleNode(item);
          }
          continue;
        }
        appendSimpleNode(child);
      }
    };
    const genericSection=section=>{
      const ctx=createContext(section,'section');const children=[...section.children];
      for(let index=0;index<children.length;index++){
        const child=children[index],next=children[index+1];
        if(child.matches?.('h1,h2,h3,h4')&&next?.matches?.('table.print-table')){genericTable(ctx,next,child);index++;continue;}
        if(child.matches?.('h1,h2,h3,h4')&&next?.classList?.contains('print-legend-box')){flowTextBox(ctx,next,child);index++;continue;}
        if(child.matches?.('table.print-table')){genericTable(ctx,child);continue;}
        if(child.classList.contains('print-diagnosis-main')){diagnosisMain(ctx,child);continue;}
        if(child.matches?.('h1,h2,h3,h4')&&next?.classList?.contains('print-exemptions-extended')){exemptionsFlow(ctx,next,child);index++;continue;}
        if(child.classList.contains('print-exemptions-extended')){exemptionsFlow(ctx,child);continue;}
        if(child.classList.contains('print-graphs-start')){appendAtomic(ctx,child);continue;}
        if(child.classList.contains('print-graph-card')){appendAtomic(ctx,child);continue;}
        appendAtomic(ctx,child);
      }
    };
    const introFragment=(intro,rows,{includeHeader=true,continuation=false,forceTable=false}={})=>{
      const fragment=cloneShell(intro,{continuation});fragment.classList.add('print-document-intro-fragment');
      const header=intro.querySelector(':scope > .print-document-header');if(includeHeader&&header)fragment.appendChild(cleanBreakClasses(header.cloneNode(true)));
      const sourceTable=intro.querySelector(':scope > .print-meta-table');
      if(sourceTable&&(rows.length||forceTable)){const table=tableShell(sourceTable,{continuation});table.querySelector('thead')?.remove();for(const row of rows)table.tBodies[0].appendChild(cleanBreakClasses(row.cloneNode(true)));fragment.appendChild(table);}
      return fragment;
    };
    const documentIntroFlow=(ctx,intro,gap=null)=>{
      if(!intro)return;
      const metaRows=[...intro.querySelectorAll(':scope > .print-meta-table > tbody > tr')];
      let fragment=null,table=null,hasPrintedRows=false;
      const startIntro=()=>{
        const parent=ctx.ensure(hasPrintedRows);
        fragment=introFragment(intro,[],{includeHeader:!hasPrintedRows,continuation:hasPrintedRows,forceTable:metaRows.length>0});
        parent.appendChild(fragment);table=fragment.querySelector('.print-meta-table');return fragment;
      };
      const moveToPage=()=>{
        const parent=ctx.current(),bodyRows=table?.tBodies?.[0]?.rows?.length||0;
        if(fragment&&bodyRows===0){fragment.remove();if(!hasPrintedRows)gap?.remove();if(parent&&!parent.children.length){parent.remove();ctx.reset();}}
        newPage();ctx.reset();startIntro();
      };
      startIntro();
      if(!metaRows.length){
        if(fits())return;
        const parent=ctx.current();fragment.remove();if(!hasPrintedRows)gap?.remove();if(parent&&!parent.children.length){parent.remove();ctx.reset();}
        newPage();ctx.reset();startIntro();if(!fits())fragment.classList.add('print-oversize-block');return;
      }
      for(const sourceRow of metaRows){
        let row=cleanBreakClasses(sourceRow.cloneNode(true));table.tBodies[0].appendChild(row);
        if(fits()){hasPrintedRows=true;continue;}
        row.remove();
        if(splitLongTableRow(sourceRow,{getTbody:()=>table?.tBodies?.[0]||null,moveToPage,onPrinted:()=>{hasPrintedRows=true;}}))continue;
        moveToPage();row=cleanBreakClasses(sourceRow.cloneNode(true));table.tBodies[0].appendChild(row);
        if(fits())hasPrintedRows=true;else row.classList.add('print-oversize-row');
      }
    };
    const narrativeSourceRows=source=>[...source.querySelectorAll(':scope > tbody > tr')].map(row=>{
      const label=row.dataset.sectionLabel||row.querySelector('th')?.textContent?.trim()||'Referto';
      const paragraphs=[...row.querySelectorAll('td p')].map(paragraph=>{const copy=paragraph.cloneNode(true);copy.querySelectorAll('br').forEach(br=>br.replaceWith(document.createTextNode('\n')));return String(copy.textContent||'').trim();}).filter(Boolean);
      const content=paragraphs.join('\n\n');return{label,content};
    }).filter(row=>row.content);
    const narrativeTable=async(ctx,source,sourceIndex=0,totalSources=1)=>{
      const rows=narrativeSourceRows(source);if(!rows.length){appendAtomic(ctx,source);return;}
      let table=null,firstFragment=true;
      const startTable=()=>{const parent=ctx.ensure(!firstFragment);table=narrativeFragmentTableNode([]);table.classList.add('print-manual-fragment');parent.appendChild(table);return table;};
      const rowNode=data=>narrativeFragmentTableNode([data]).querySelector('tbody > tr');
      const tryRow=data=>{const row=rowNode(data);table.tBodies[0].appendChild(row);const ok=fits();row.remove();return ok;};
      startTable();
      for(let sectionIndex=0;sectionIndex<rows.length;sectionIndex++){
        const section=rows[sectionIndex];
        await reportProgress(sourceIndex+(sectionIndex+1)/(rows.length+1),totalSources,`Impaginazione referto ${sectionIndex+1}/${rows.length}`);
        /* Percorso veloce: la grande maggioranza delle sezioni cliniche entra
           interamente nello spazio corrente. Solo quando non entra attiviamo
           la frammentazione parola per parola. Riduce drasticamente il costo
           sui fascicoli ospedalieri con centinaia di sezioni. */
        const whole={label:section.label,paragraphs:[section.content],continuation:false};
        if(tryRow(whole)){table.tBodies[0].appendChild(rowNode(whole));continue;}
        const tokens=section.content.match(/\S+\s*/g)||[];let cursor=0,continuation=false;
        while(cursor<tokens.length){
          const remaining=tokens.length-cursor;
          let best=0;
          /* Una pagina A4 non può contenere migliaia di parole. Limitare la
             ricerca evita il comportamento quadratico sui referti molto lunghi. */
          let lo=1,hi=Math.min(remaining,2200);
          while(lo<=hi){const mid=Math.floor((lo+hi)/2),candidate=tokens.slice(cursor,cursor+mid).join('').trimEnd();if(tryRow({label:section.label,paragraphs:[candidate],continuation})){best=mid;lo=mid+1;}else hi=mid-1;}
          if(best>0){
            const tailWords=remaining-best;if(tailWords>0&&tailWords<8&&best>8)best=Math.max(1,best-(8-tailWords));
            const candidateHead=tokens.slice(cursor,cursor+best).join('').trimEnd();
            const tooSmallFirstFragment=cursor===0&&remaining>best&&(best<8||candidateHead.length<42);
            if(tooSmallFirstFragment&&pageHasContent()){
              if(table.tBodies[0].rows.length===0){table.remove();removeEmptyWrapper(ctx);}
              newPage();ctx.reset();firstFragment=false;startTable();continue;
            }
            const head=candidateHead;table.tBodies[0].appendChild(rowNode({label:section.label,paragraphs:[head],continuation}));cursor+=best;continuation=true;
            if(cursor<tokens.length){newPage();ctx.reset();firstFragment=false;startTable();}
            continue;
          }
          if(table.tBodies[0].rows.length){newPage();ctx.reset();firstFragment=false;startTable();continue;}
          table.remove();removeEmptyWrapper(ctx);newPage();ctx.reset();firstFragment=false;startTable();
          const forced=tokens[cursor]?.trim()||'';table.tBodies[0].appendChild(rowNode({label:section.label,paragraphs:[forced],continuation}));cursor++;continuation=true;
          if(cursor<tokens.length){newPage();ctx.reset();startTable();}
        }
      }
    };
    const labPanel=(ctx,panel,heading=null)=>{
      const sourceTable=panel.querySelector(':scope > .print-results-table');const rows=sourceTable?[...sourceTable.querySelectorAll(':scope > tbody > tr')]:[];
      if(!sourceTable||!rows.length){if(heading)appendAtomic(ctx,heading);appendAtomic(ctx,panel);return;}
      const sourceTitle=panel.querySelector(':scope > .print-panel-title');let fragment=null,table=null,headingClone=null,hasPrintedRows=false;
      const startPanel=()=>{
        const parent=ctx.ensure(hasPrintedRows);
        if(heading&&!hasPrintedRows){headingClone=cleanBreakClasses(heading.cloneNode(true));parent.appendChild(headingClone);}else headingClone=null;
        fragment=cloneShell(panel,{continuation:hasPrintedRows});fragment.classList.add('print-lab-panel-fragment');
        if(sourceTitle){const title=cleanBreakClasses(sourceTitle.cloneNode(true));if(hasPrintedRows){title.removeAttribute('id');title.insertAdjacentHTML('beforeend','<small>continua dalla pagina precedente</small>');}fragment.appendChild(title);}
        table=tableShell(sourceTable,{continuation:hasPrintedRows});fragment.appendChild(table);parent.appendChild(fragment);return fragment;
      };
      const moveToPage=()=>{
        const parent=ctx.current();
        if(fragment&&!table.tBodies[0].rows.length){fragment.remove();headingClone?.remove();if(parent&&!parent.children.length){parent.remove();ctx.reset();}}
        newPage();ctx.reset();startPanel();
      };
      startPanel();
      for(const sourceRow of rows){
        let row=cleanBreakClasses(sourceRow.cloneNode(true));table.tBodies[0].appendChild(row);
        if(fits()){hasPrintedRows=true;continue;}
        row.remove();
        if(splitLongTableRow(sourceRow,{getTbody:()=>table?.tBodies?.[0]||null,moveToPage,onPrinted:()=>{hasPrintedRows=true;}}))continue;
        const bodyHasRows=table.tBodies[0].rows.length>0;
        if(bodyHasRows)hasPrintedRows=true;
        moveToPage();
        row=cleanBreakClasses(sourceRow.cloneNode(true));table.tBodies[0].appendChild(row);
        if(fits())hasPrintedRows=true;else row.classList.add('print-oversize-row');
      }
    };
    const documentSection=async(section,sourceIndex=0,totalSources=1)=>{
      const ctx=createContext(section,'document');const intro=section.querySelector(':scope > .print-document-intro');const children=[...section.children].filter(child=>child!==intro);
      ensurePage();let gap=null;
      if(pageHasContent()){
        if(spaceSaving){gap=document.createElement('div');gap.className='print-document-gap';content.appendChild(gap);}
        else{newPage();ctx.reset();}
      }
      documentIntroFlow(ctx,intro,gap);
      for(let index=0;index<children.length;index++){
        const child=children[index],next=children[index+1];
        if(child.classList.contains('print-narrative-source-table')){await narrativeTable(ctx,child,sourceIndex,totalSources);continue;}
        if(child.classList.contains('print-subtitle')&&next?.classList.contains('print-lab-panel')){labPanel(ctx,next,child);index++;continue;}
        if(child.classList.contains('print-lab-panel')){labPanel(ctx,child);continue;}
        if(child.classList.contains('print-subtitle')&&next?.matches?.('table.print-table')){genericTable(ctx,next,child);index++;continue;}
        if(child.matches?.('table.print-table')){genericTable(ctx,child);continue;}
        appendAtomic(ctx,child);
      }
    };
    const graphsSection=section=>{
      if(spaceSaving){genericSection(section);return;}
      const cards=[...section.querySelectorAll('.print-graph-card')];
      const heading=section.querySelector('.print-graphs-start > h2')||section.querySelector(':scope > h2');
      if(!cards.length){genericSection(section);return;}
      ensurePage();if(pageHasContent())newPage();
      const ctx=createContext(section,'section');let cardsOnPage=0;
      for(let index=0;index<cards.length;index++){
        if(cardsOnPage>=2){newPage();ctx.reset();cardsOnPage=0;}
        let parent=ctx.ensure(index>0);
        if(index===0&&heading)parent.appendChild(cleanBreakClasses(heading.cloneNode(true)));
        let card=cleanBreakClasses(cards[index].cloneNode(true));parent.appendChild(card);
        if(!fits()){
          card.remove();newPage();ctx.reset();cardsOnPage=0;parent=ctx.ensure(true);card=cleanBreakClasses(cards[index].cloneNode(true));parent.appendChild(card);
          if(!fits())card.classList.add('print-oversize-block');
        }
        cardsOnPage++;
      }
    };
    let forcePageAfterCover=false;
    const totalSources=Math.max(1,sourceNodes.length);
    for(let sourceIndex=0;sourceIndex<sourceNodes.length;sourceIndex++){
      const source=sourceNodes[sourceIndex];
      await reportProgress(sourceIndex,totalSources,`Impaginazione sezione ${sourceIndex+1}/${sourceNodes.length}`);
      if(source.classList.contains('print-cover')){if(pageHasContent())newPage();else ensurePage();const cover=cleanBreakClasses(source.cloneNode(true));content.appendChild(cover);sheet.classList.add('print-cover-sheet');forcePageAfterCover=true;await reportProgress(sourceIndex+1,totalSources,'Copertina impaginata');continue;}
      if(forcePageAfterCover){newPage();forcePageAfterCover=false;}
      if(source.classList.contains('print-document'))await documentSection(source,sourceIndex,totalSources);
      else if(source.classList.contains('print-graphs-section'))graphsSection(source);
      else {
        ensurePage();
        if(!spaceSaving&&source.classList.contains('print-macro-section')&&pageHasContent())newPage();
        else if(pageHasContent()){const gap=document.createElement('div');gap.className='print-flow-gap';content.appendChild(gap);}
        genericSection(source);
      }
      await reportProgress(sourceIndex+1,totalSources,`Sezione ${sourceIndex+1}/${sourceNodes.length} completata`);
    }
    const emptyPages=pages.filter(page=>!page.querySelector('.print-sheet-content')?.children.length);emptyPages.forEach(page=>page.remove());
    const overflowPages=pages.filter(page=>{const area=page.querySelector('.print-sheet-content');return page.isConnected&&area&&usedHeight(area)>area.clientHeight+1;});
    root.classList.remove('print-preparing');root.dataset.printLayoutPrepared='v602-final';root.dataset.printLayoutOverflowCount=String(overflowPages.length);
    if(overflowPages.length){root.dataset.printLayoutError=`${overflowPages.length} pagine superano l'area utile`;console.error('V6.0.4: overflow di impaginazione',overflowPages.map(page=>page.dataset.pageNumber));}
  }


  return {resultRows,groupedResultRows,visibleReference,metadataRows,automaticInterpretationLegend,documentHtml,chronologicalIndexHtml,panelAnchorId,preparePrintLayout,validateNarrativeCoverage,meaningfulNarrativeSource,therapyColumnWidths,therapyColgroup,formatTherapyTime,statusClass,cleanClinicalNarrative,normalizeClinicalLineBreaks,isEcgDoc,isRadiologyDoc,ecgRows,ecgTable,radiologyRows,narrativeRows,shouldSkipNarrativeRow,splitForPrint,isNonInformativeClinicalValue,isNonInformativeClinicalRow};
})();
