(function(){
  'use strict';
  const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];

  // altezza reale della fascia dimostrativa, per tenere il menu del telefono subito sotto
  const banner=$('.demo-banner');
  const misura=()=>document.documentElement.style.setProperty('--banner',banner.offsetHeight+'px');
  misura();window.addEventListener('resize',misura);

  // sezioni
  function mostra(vista){
    $$('.view').forEach(v=>{v.hidden=v.id!=='v-'+vista;});
    $$('.nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===vista));
    window.scrollTo({top:0});
    try{history.replaceState(null,'','#'+vista);}catch(_e){}
    const attivo=$('.nav button.active');if(attivo)attivo.scrollIntoView({block:'nearest',inline:'center'});
  }
  $$('.nav button').forEach(b=>b.addEventListener('click',()=>mostra(b.dataset.view)));
  $$('[data-go]').forEach(b=>b.addEventListener('click',()=>mostra(b.dataset.go)));
  const iniziale=(location.hash||'').slice(1);
  if(iniziale&&$('#v-'+iniziale))mostra(iniziale);

  // finestra della versione dimostrativa: ogni salvataggio, modifica definitiva o eliminazione
  const modale=$('#demo-modal');
  function avvisoDemo(){modale.hidden=false;$('#demo-continua').focus();}
  function chiudi(){modale.hidden=true;}
  document.addEventListener('click',e=>{const b=e.target.closest('[data-save]');if(b){e.preventDefault();avvisoDemo();}});
  $('#demo-continua').addEventListener('click',chiudi);
  modale.addEventListener('click',e=>{if(e.target===modale)chiudi();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')chiudi();});

  // apri/chiudi moduli
  $$('[data-open]').forEach(b=>b.addEventListener('click',()=>{const f=document.getElementById(b.dataset.open);f.hidden=!f.hidden;}));
  $$('[data-close]').forEach(b=>b.addEventListener('click',()=>{document.getElementById(b.dataset.close).hidden=true;}));

  // agenda: la voce si apre sotto
  const ev=$('#evento-live'),det=$('#evento-dettaglio');
  ev.addEventListener('click',()=>{const aperto=det.hidden;det.hidden=!aperto;ev.setAttribute('aria-expanded',String(aperto));});

  // terapia: modifica in anteprima, il salvataggio apre l'avviso
  const form=$('#th-form');
  $('#th-modifica').addEventListener('click',()=>{form.hidden=!form.hidden;});
  $('#th-annulla').addEventListener('click',()=>{form.hidden=true;$('#f-ora').value=$('#th-ora').textContent;$('#f-dose').value=$('#th-dose').textContent;$('#f-freq').value=$('#th-freq').textContent;});
  $('#f-ora').addEventListener('input',e=>{$('#th-ora').textContent=e.target.value||'06:30';});
  $('#f-dose').addEventListener('input',e=>{$('#th-dose').textContent=e.target.value||'75 mcg';});
  $('#f-freq').addEventListener('input',e=>{$('#th-freq').textContent=e.target.value||'1 compressa al mattino, a digiuno';});
  $('#th-riordino').addEventListener('change',e=>{$('#th-riordino-testo').textContent=e.target.checked?'Scorta per 18 giorni · promemoria di riordino il 26/11/2026':'Riordino manuale: nessun promemoria automatico';});

  // documenti: lettura del referto di esempio
  const passi=$$('#doc-steps [data-step]');
  function leggi(){
    $('#doc-start').hidden=true;$('#doc-work').hidden=false;$('#doc-out').hidden=true;
    passi.forEach(p=>p.className='');
    const linea=$('#scan-line');linea.classList.remove('go');void linea.offsetWidth;linea.classList.add('go');
    let i=0;
    const avanti=()=>{if(i>0)passi[i-1].className='done';if(i<passi.length){passi[i].className='doing';i++;setTimeout(avanti,1500);}else{$('#doc-out').hidden=false;}};
    avanti();
    $('#doc-work').scrollIntoView({behavior:'smooth',block:'start'});
  }
  $('#doc-avvia').addEventListener('click',leggi);
  $('#doc-ricomincia').addEventListener('click',leggi);
})();
