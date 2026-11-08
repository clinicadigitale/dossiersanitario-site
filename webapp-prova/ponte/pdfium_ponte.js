/* PDFium nel browser: la stessa versione dell'exe (pdfium-binaries chromium/7947),
   compilata per WebAssembly. Espone a Python (pypdfium2 del ponte) le poche
   funzioni C che il motore del Dossier usa, tutte sincrone. */
'use strict';
function creaPdfiumPonte(M,caratteri){
  const c=(n,r,a)=>M.cwrap(n,r,a);
  const f={
    init:c('FPDF_InitLibraryWithConfig',null,['number']),
    destroy:c('FPDF_DestroyLibrary',null,[]),
    loadMem:c('FPDF_LoadMemDocument64','number',['number','number','number']),
    lastError:c('FPDF_GetLastError','number',[]),
    closeDoc:c('FPDF_CloseDocument',null,['number']),
    pageCount:c('FPDF_GetPageCount','number',['number']),
    loadPage:c('FPDF_LoadPage','number',['number','number']),
    closePage:c('FPDF_ClosePage',null,['number']),
    pageW:c('FPDF_GetPageWidthF','number',['number']),
    pageH:c('FPDF_GetPageHeightF','number',['number']),
    textLoad:c('FPDFText_LoadPage','number',['number']),
    textClose:c('FPDFText_ClosePage',null,['number']),
    countChars:c('FPDFText_CountChars','number',['number']),
    textIndex:c('FPDFText_GetTextIndexFromCharIndex','number',['number','number']),
    getText:c('FPDFText_GetText','number',['number','number','number','number']),
    charBox:c('FPDFText_GetCharBox','number',['number','number','number','number','number','number']),
    bmpCreateEx:c('FPDFBitmap_CreateEx','number',['number','number','number','number','number']),
    bmpFill:c('FPDFBitmap_FillRect','number',['number','number','number','number','number','number']),
    bmpDestroy:c('FPDFBitmap_Destroy',null,['number']),
    render:c('FPDF_RenderPageBitmap',null,['number','number','number','number','number','number','number','number']),
  };
  // Caratteri da usare per i font non incorporati nei PDF (come i caratteri di Windows per l'exe).
  // Si possono aggiungere anche dopo: la libreria viene riavviata con la nuova cartella.
  const nome=new TextEncoder().encode('/caratteri\0');const pn=M._malloc(nome.length);M.HEAPU8.set(nome,pn);
  const cartelle=M._malloc(8);M.HEAP32[cartelle>>2]=pn;M.HEAP32[(cartelle>>2)+1]=0;
  let attiva=false,nCaratteri=0;
  function scriviCaratteri(lista){
    if(!lista||!lista.length||!M.FS)return 0;
    try{M.FS.mkdir('/caratteri');}catch(_e){}
    let n=0;for(const c of lista){try{M.FS.writeFile('/caratteri/'+c.nome,c.dati instanceof Uint8Array?c.dati:new Uint8Array(c.dati));n++;}catch(_e){}}
    return n;
  }
  function inizializza(){
    if(attiva){f.destroy();attiva=false;}
    // FPDF_LIBRARY_CONFIG versione 2, come pypdfium2: version, m_pUserFontPaths, m_pIsolate, m_v8EmbedderSlot
    const cfg=M._malloc(16);M.HEAP32.fill(0,cfg>>2,(cfg>>2)+4);M.HEAP32[cfg>>2]=2;M.HEAP32[(cfg>>2)+1]=nCaratteri?cartelle:0;f.init(cfg);M._free(cfg);attiva=true;
  }
  nCaratteri=scriviCaratteri(caratteri);
  inizializza();
  const docMem=new Map();
  return {
    // nuovi caratteri: vanno aggiunti solo quando nessun documento e' aperto
    impostaCaratteri(lista){const n=scriviCaratteri(lista);if(n){nCaratteri+=n;inizializza();}return nCaratteri;},
    numeroCaratteri:()=>nCaratteri,
    apri(dati,password){
      const n=dati.length;const p=M._malloc(Math.max(1,n));M.HEAPU8.set(dati,p);
      let pw=0;if(password!=null&&password!==undefined){const b=new TextEncoder().encode(String(password)+'\0');pw=M._malloc(b.length);M.HEAPU8.set(b,pw);}
      // FPDF_LoadMemDocument64: data_buf, size (size_t a 32 bit nel wasm), password
      const doc=f.loadMem(p,n,pw);if(pw)M._free(pw);
      if(!doc){M._free(p);return 0;}
      docMem.set(doc,p);return doc;
    },
    ultimoErrore:()=>f.lastError(),
    chiudiDocumento(doc){f.closeDoc(doc);const p=docMem.get(doc);if(p){M._free(p);docMem.delete(doc);}},
    numeroPagine:doc=>f.pageCount(doc),
    caricaPagina:(doc,i)=>f.loadPage(doc,i),
    chiudiPagina:p=>f.closePage(p),
    larghezza:p=>f.pageW(p),
    altezza:p=>f.pageH(p),
    caricaTesto:p=>f.textLoad(p),
    chiudiTesto:t=>f.textClose(t),
    contaCaratteri:t=>f.countChars(t),
    indiceTesto:(t,i)=>f.textIndex(t,i),
    // ritorna il valore di FPDFText_GetText e l'intero buffer UTF-16, come il buffer ctypes di pypdfium2
    testo(t,inizio,quanti,dimensione){
      const p=M._malloc(dimensione*2);M.HEAPU16.fill(0,p>>1,(p>>1)+dimensione);
      const n=f.getText(t,inizio,quanti,p);const out=M.HEAPU16.slice(p>>1,(p>>1)+dimensione);M._free(p);return [n,out];
    },
    // l, r, b, t come FPDFText_GetCharBox
    riquadro(t,i){const p=M._malloc(32);const ok=f.charBox(t,i,p,p+8,p+16,p+24);const v=M.HEAPF64.slice(p>>3,(p>>3)+4);M._free(p);return [ok,v[0],v[1],v[2],v[3]];},
    // come PdfPage.render di pypdfium2 con le impostazioni di base: BGR, fondo bianco, FPDF_ANNOT
    disegna(pagina,larg,alt,flags){
      const stride=larg*3,dim=stride*alt;const buf=M._malloc(dim);
      const bmp=f.bmpCreateEx(larg,alt,2,buf,stride);
      if(!bmp){M._free(buf);return null;}
      f.bmpFill(bmp,0,0,larg,alt,0xFFFFFFFF>>>0);
      f.render(bmp,pagina,0,0,larg,alt,0,flags);
      const out=M.HEAPU8.slice(buf,buf+dim);f.bmpDestroy(bmp);M._free(buf);return out;
    },
  };
}
if(typeof module!=='undefined')module.exports={creaPdfiumPonte};
