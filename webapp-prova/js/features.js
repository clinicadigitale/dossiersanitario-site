'use strict';

/*
  Entitlement centrale Clinica Digitale 1.0.0.
  FREE è il default sicuro. MEDIUM/FULL arrivano esclusivamente dal motore
  locale, che accetta soltanto token firmati dal servizio licenze ufficiale.
  Il piano non è più una preferenza modificabile nel browser.
*/
const DossierFeatures = (() => {
  const API_ORIGIN = `${location.protocol}//${location.hostname}:8896`;
  const PLANS = {
    FREE: {
      label: 'FREE', rank: 0,
      enabled: [
        'singleProfile','singleImport','clinicalCore','basicOcr','basicPdf','documents','diagnoses',
        'manualTherapies','exemptions','localAgenda','profileEssentials','manualCalendar','localBackup','mfa','history'
      ]
    },
    MEDIUM: {
      label: 'MEDIUM', rank: 1,
      enabled: [
        'singleProfile','singleImport','clinicalCore','basicOcr','basicPdf','documents','diagnoses','manualTherapies',
        'exemptions','localAgenda','profileEssentials','manualCalendar','localBackup','mfa','history','multiProfile',
        'bulkImport','advancedOcr','advancedPdf','aifaAuto','stockAutomation','therapyRecalc','reorderAutomation',
        'temporalGraphs','monitoring','doctorVersion','googleCalendarAuto','googleMedicationSync','cloudSync','cloudSingleUser'
      ]
    },
    FULL: {
      label: 'FULL', rank: 2,
      enabled: [
        'singleProfile','singleImport','clinicalCore','basicOcr','basicPdf','documents','diagnoses','manualTherapies',
        'exemptions','localAgenda','profileEssentials','manualCalendar','localBackup','mfa','history',
        'bulkImport','advancedOcr','advancedPdf','aifaAuto','stockAutomation','therapyRecalc','reorderAutomation',
        'temporalGraphs','monitoring','doctorVersion','googleCalendarAuto','googleMedicationSync','cloudSync','cloudSingleUser',
        'familyDossier','multiProfile','multiUser','adultConsent','assistedProfiles','permissions','familyAssociation',
        'multiDevice','familySync','accessManagement'
      ]
    }
  };
  let state={ok:true,plan:'FREE',dossierId:'',accountEmail:'',reason:'initializing',offline:false,cached:false};
  let pending=null;
  const normalizePlan=value=>PLANS[String(value||'').toUpperCase()]?String(value).toUpperCase():'FREE';
  function current(){const plan=normalizePlan(state.plan);return {id:plan,...PLANS[plan],...state,plan,label:PLANS[plan].label};}
  function has(feature){return PLANS[normalizePlan(state.plan)].enabled.includes(feature);}
  function atLeast(plan){return PLANS[normalizePlan(state.plan)].rank>=PLANS[normalizePlan(plan)].rank;}
  function requiredPlan(feature){if(PLANS.FREE.enabled.includes(feature))return'FREE';if(PLANS.MEDIUM.enabled.includes(feature))return'MEDIUM';return'FULL';}
  function message(feature){const required=requiredPlan(feature);return required==='FREE'?'Funzione disponibile.':`Questa funzione è disponibile dal piano ${required}.`;}
  async function refresh({force=false}={}){
    if(pending&&!force)return pending;
    pending=(async()=>{
      try{
        const url=`${API_ORIGIN}/api/license/${force?'refresh':'status'}${force?'':'?force=0'}`;
        const response=await fetch(url,{method:force?'POST':'GET',headers:{'Content-Type':'application/json'},cache:'no-store'});
        const data=await response.json();
        if(!response.ok||data?.ok===false)throw new Error(data?.error||'Verifica licenza non disponibile');
        state={...state,...data,plan:normalizePlan(data?.plan)};
      }catch(error){
        state={ok:true,plan:'FREE',dossierId:state.dossierId||'',accountEmail:state.accountEmail||'',reason:'local_license_error',offline:true,cached:false,warning:'Verifica licenza locale non disponibile: piano FREE applicato.',detail:String(error?.message||error)};
      }
      window.dispatchEvent(new CustomEvent('dossier-license-changed',{detail:current()}));
      return current();
    })();
    try{return await pending;}finally{pending=null;}
  }
  function setEdition(){return normalizePlan(state.plan);}
  return {current,has,atLeast,requiredPlan,message,refresh,setEdition,PLANS,EDITIONS:PLANS};
})();
globalThis.DossierFeatures = DossierFeatures;
