const DossierMedicines = (()=>{
  const DATA_URL='assets/aifa_medicines.json?v=1.0.0-beta.1-20260817-r35';
  let loading=null,data=null,byName=null,allRows=[];
  const norm=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').replace(/\s+/g,' ').trim();
  const TITLE_EXCEPTIONS=new Map([
    ['SRL','S.r.l.'],['SPA','S.p.A.'],['SAPA','S.a.p.A.'],['SNC','S.n.c.'],['SAS','S.a.s.'],
    ['GMBH','GmbH'],['AG','AG'],['KG','KG'],['BV','B.V.'],['NV','N.V.'],['SA','S.A.'],
    ['LTD','Ltd'],['LIMITED','Limited'],['INC','Inc.'],['LLC','LLC'],['PLC','plc'],
    ['USA','USA'],['UK','UK'],['EU','EU']
  ]);
  const smartWord=value=>{
    const raw=String(value||'').trim();if(!raw)return '';
    const key=norm(raw).replace(/\s+/g,'');
    if(TITLE_EXCEPTIONS.has(key))return TITLE_EXCEPTIONS.get(key);
    if(/^[A-Z]\.?[A-Z]\.?[A-Z]?\.?$/i.test(raw)&&raw.replace(/[^A-Za-z]/g,'').length<=4)return raw.toUpperCase().replace(/\.+$/,'');
    return raw.charAt(0).toUpperCase()+raw.slice(1).toLocaleLowerCase('it-IT');
  };
  const humanCase=value=>String(value||'').split('/').map(part=>part.split(/(\s+|-)/).map(token=>{
    if(!token||/^\s+$/.test(token)||token==='-')return token;
    return smartWord(token);
  }).join('')).join('/');
  const manufacturerCase=value=>String(value||'').split(/(\s+|-)/).map(token=>{
    if(!token||/^\s+$/.test(token)||token==='-')return token;
    return smartWord(token);
  }).join('').replace(/\s+([,.;])/g,'$1').trim();
  const INGREDIENT_ALIASES=new Map([
    ['LEVOTIROXINA SODICA','LEVOTIROXINA']
  ]);
  const clinicalIngredient=value=>String(value||'').split('/').map(part=>INGREDIENT_ALIASES.get(norm(part))||part).join('/');
  async function load(){
    if(data)return data;
    if(loading)return loading;
    loading=fetch(DATA_URL,{cache:'force-cache'}).then(r=>{if(!r.ok)throw new Error('Archivio farmaci locale non disponibile');return r.json();}).then(json=>{
      data=json;byName=new Map();allRows=[];
      for(const item of json.items||[]){
        const k=norm(item.name);if(!k)continue;
        allRows.push([k,item]);
        if(!byName.has(k))byName.set(k,[]);
        byName.get(k).push(item);
      }
      return data;
    }).catch(error=>{loading=null;throw error;});
    return loading;
  }
  function values(items,key){return [...new Set(items.flatMap(x=>Array.isArray(x?.[key])?x[key]:[]).map(x=>String(x||'').trim()).filter(Boolean))];}
  function uniqueValue(v=[]){const clean=[...new Set((v||[]).map(x=>String(x||'').trim()).filter(Boolean))];return clean.length===1?clean[0]:'';}
  function preferredIngredient(v=[]){
    const clean=[...new Set((v||[]).map(x=>String(x||'').trim()).filter(Boolean))];
    if(!clean.length)return '';
    if(clean.length===1)return clean[0];
    const combos=clean.filter(x=>x.includes('/'));
    if(combos.length===1)return combos[0];
    // Se tutte le varianti hanno una radice farmacologica comune, usa la radice invece di inventare il sale/formulazione.
    const tokenSets=clean.map(x=>norm(x).split(' ').filter(Boolean));
    let common=tokenSets[0]||[];
    for(const tokens of tokenSets.slice(1)){
      let n=0;while(n<common.length&&n<tokens.length&&common[n]===tokens[n])n++;
      common=common.slice(0,n);if(!common.length)break;
    }
    return common.length?common.join(' '):'';
  }
  function isCombinationName(key,q){
    const tail=key.slice(q.length).trim();
    return /^(?:E|CON|PLUS|HCT|HCTZ)\b/.test(tail);
  }
  function resolveLoaded(value=''){
    if(!byName)return null;
    const q=norm(value);if(!q)return null;
    const exact=byName.get(q)||[];
    if(exact.length){
      const active=values(exact,'activeIngredients'),manufacturers=values(exact,'manufacturers');
      return {name:exact[0].name,activeIngredients:active,manufacturers,activeIngredient:humanCase(clinicalIngredient(preferredIngredient(active))),manufacturer:manufacturerCase(uniqueValue(manufacturers)),match:'exact'};
    }
    // Nome generico/principio attivo usato come farmaco: aggrega solo le formulazioni monocomponente della stessa famiglia.
    const family=allRows.filter(([key])=>key.startsWith(q+' ')&&!isCombinationName(key,q)).map(([,item])=>item);
    if(family.length>=2){
      const active=values(family,'activeIngredients');
      let ingredient=preferredIngredient(active);
      const nq=norm(q),ni=norm(ingredient);
      // Il nome digitato può essere già il principio attivo. Se le formulazioni differiscono solo per sale, conserva la forma clinica essenziale.
      if(ingredient&&ni.startsWith(nq)&&active.some(x=>norm(x).startsWith(nq)))ingredient=(active.every(x=>norm(x).startsWith(nq))?q:ingredient);
      if(ingredient)return {name:value,activeIngredients:active,manufacturers:values(family,'manufacturers'),activeIngredient:humanCase(clinicalIngredient(ingredient)),manufacturer:'',match:'generic-family'};
    }
    return null;
  }
  async function lookup(value=''){if(!globalThis.DossierFeatures?.has?.('aifaAuto'))return null;await load();return resolveLoaded(value);}
  async function search(value='',limit=12){
    if(!globalThis.DossierFeatures?.has?.('aifaAuto'))return[];
    await load();const q=norm(value);if(q.length<2)return[];
    const tokens=q.split(' ').filter(Boolean),scored=[];
    for(const item of data.items||[]){const key=norm(item.name);let score=0;if(key===q)score=1000;else if(key.startsWith(q))score=800-q.length/100;else if(tokens.every(t=>key.includes(t)))score=500-tokens.length;else continue;scored.push([score,item]);}
    scored.sort((a,b)=>b[0]-a[0]||String(a[1].name).localeCompare(String(b[1].name),'it'));
    return scored.slice(0,limit).map(x=>x[1]);
  }
  async function enrich(row={}){
    const item=await lookup(row.medication||'');if(!item)return {...row};
    return {...row,activeIngredient:row.activeIngredient||item.activeIngredient||'',manufacturer:row.manufacturer||item.manufacturer||''};
  }
  const sameGeneratedValue=(stored,candidate)=>{
    const a=norm(stored),b=norm(candidate);return !!a&&!!b&&a===b;
  };
  async function repairRows(rows=[]){
    if(!globalThis.DossierFeatures?.has?.('aifaAuto'))return (rows||[]).map(row=>({...row}));
    await load();const out=[];
    for(const row of rows||[]){
      const item=await lookup(row?.medication||'');
      if(!item){out.push({...row});continue;}
      const next={...row};
      const currentIngredient=String(row?.activeIngredient||'').trim();
      const currentManufacturer=String(row?.manufacturer||'').trim();
      if(!currentIngredient)next.activeIngredient=item.activeIngredient||'';
      else if(sameGeneratedValue(currentIngredient,item.activeIngredient))next.activeIngredient=item.activeIngredient;
      if(!currentManufacturer)next.manufacturer=item.manufacturer||'';
      else if(sameGeneratedValue(currentManufacturer,item.manufacturer))next.manufacturer=item.manufacturer;
      out.push(next);
    }
    return out;
  }
  function bindTherapyForm(form){
    const medication=form?.querySelector('[name="medication"]'),ingredient=form?.querySelector('[name="activeIngredient"]'),manufacturer=form?.querySelector('[name="manufacturer"]'),list=form?.querySelector('#therapyMedicineOptions'),hint=form?.querySelector('#therapyMedicineHint');
    if(!medication||!ingredient||!manufacturer||!list)return;
    if(!globalThis.DossierFeatures?.has?.('aifaAuto')){if(hint)hint.textContent='Compilazione manuale nel piano FREE. Riconoscimento AIFA automatico disponibile dal piano MEDIUM.';return;}
    let timer=null;
    const safeAutofill=(field,value)=>{if(!value)return;const previous=field.dataset.medicineAutofill||'';if(!field.value.trim()||field.value===previous){field.value=value;field.dataset.medicineAutofill=value;}};
    const apply=async()=>{try{const item=await lookup(medication.value);if(!item){if(hint)hint.textContent='Farmaco non riconosciuto con sufficiente certezza nell’anagrafica locale: i campi restano modificabili manualmente.';return;}safeAutofill(ingredient,item.activeIngredient);safeAutofill(manufacturer,item.manufacturer);if(hint)hint.textContent=item.match==='generic-family'?'Principio attivo riconosciuto dal nome generico. Produttore non assegnato perché non univoco.':'Dati proposti dall’anagrafica farmaci AIFA locale. Puoi modificarli.';}catch{if(hint)hint.textContent='Archivio farmaci locale temporaneamente non disponibile. I campi restano manuali.';}};
    medication.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(async()=>{try{const rows=await search(medication.value,12);list.innerHTML=rows.map(x=>`<option value="${String(x.name).replace(/&/g,'&amp;').replace(/"/g,'&quot;')}"></option>`).join('');}catch{}},100);});
    medication.addEventListener('change',()=>void apply());medication.addEventListener('blur',()=>void apply());void load().then(()=>{if(medication.value)void apply();}).catch(()=>{});
  }
  return {load,lookup,search,enrich,repairRows,bindTherapyForm,humanCase,manufacturerCase};
})();
globalThis.DossierMedicines=DossierMedicines;
