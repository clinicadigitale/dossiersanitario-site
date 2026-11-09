'use strict';

const OCRService = (() => {
  const API_BASE='http://127.0.0.1:8896';
  let healthCache=null;
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  async function fetchWithRetry(url,options={},attempts=3){
    let lastError=null;
    for(let i=0;i<attempts;i++){
      try{return await fetch(url,options);}catch(error){lastError=error;if(error?.name==='AbortError')throw error;if(i<attempts-1)await sleep(500*(i+1));}
    }
    throw lastError||new Error('Motore del Dossier non disponibile');
  }

  async function health(force=false) {
    if (healthCache&&!force) return healthCache;
    try {
      const res=await fetch(`${API_BASE}/api/health`,{cache:'no-store'});
      const data=await res.json();
      healthCache=data; return data;
    } catch (error) {
      healthCache={ok:false,ocrAvailable:false,error:error.message}; return healthCache;
    }
  }

  async function analyzeFileLegacy(file,onProgress=()=>{}) {
    onProgress({stage:'upload',progress:4,message:'Preparazione estrazione PDF nativa o OCR locale'});
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),45*60*1000);
    try {
      const res=await fetchWithRetry(`${API_BASE}/api/ocr`,{
        method:'POST',
        headers:{
          'Content-Type':'application/octet-stream',
          'X-File-Name':encodeURIComponent(file.name),
          'X-Mime-Type':file.type||'application/octet-stream'
        },
        body:file,
        signal:controller.signal
      });
      const data=await res.json().catch(()=>({ok:false,error:`Risposta OCR non valida (${res.status})`}));
      if (!res.ok||!data.ok) throw new Error(data.error||`OCR non riuscito (${res.status})`);
      onProgress({stage:'complete',progress:100,processedPages:data.processedPages||data.pageCount||0,totalPages:data.pageCount||data.processedPages||0,message:'Analisi del documento completata'});
      return data;
    } finally { clearTimeout(timeout); }
  }

  async function analyzeFile(file,onProgress=()=>{}) {
    onProgress({stage:'upload',progress:1,processedPages:0,totalPages:0,message:'Invio del documento al motore del Dossier'});
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),45*60*1000);
    try {
      let start;
      try {
        const res=await fetchWithRetry(`${API_BASE}/api/ocr/start`,{
          method:'POST',
          headers:{
            'Content-Type':'application/octet-stream',
            'X-File-Name':encodeURIComponent(file.name),
            'X-Mime-Type':file.type||'application/octet-stream'
          },
          body:file,
          signal:controller.signal
        });
        if (res.status===404) return analyzeFileLegacy(file,onProgress);
        start=await res.json().catch(()=>({ok:false,error:`Risposta OCR non valida (${res.status})`}));
        if(!res.ok||!start.ok||!start.jobId)throw new Error(start.error||`OCR non avviato (${res.status})`);
      } catch(error) {
        if(error?.name==='AbortError')throw error;
        const h=await health(true).catch(()=>null);
        if(h?.version&&h.version!=='6.0.4')return analyzeFileLegacy(file,onProgress);
        throw error;
      }

      const jobId=start.jobId;
      onProgress({stage:'queued',progress:Number(start.progress||2),processedPages:0,totalPages:0,message:start.message||'Analisi avviata'});
      for(;;){
        await sleep(300);
        const res=await fetchWithRetry(`${API_BASE}/api/ocr/status?id=${encodeURIComponent(jobId)}`,{cache:'no-store',signal:controller.signal});
        const data=await res.json().catch(()=>({ok:false,error:`Stato OCR non valido (${res.status})`}));
        if(!res.ok)throw new Error(data.error||`Stato OCR non disponibile (${res.status})`);
        onProgress({
          stage:data.stage||'analysis',
          progress:Number(data.progress||0),
          processedPages:Number(data.processedPages||0),
          totalPages:Number(data.totalPages||0),
          message:data.message||'Analisi in corso'
        });
        if(data.done){
          if(data.error||!data.ok)throw new Error(data.error||'OCR non riuscito');
          const result=data.result;
          if(!result?.ok)throw new Error(result?.error||'Risultato OCR non disponibile');
          return result;
        }
      }
    } finally { clearTimeout(timeout); }
  }

  return {health,analyzeFile};
})();
