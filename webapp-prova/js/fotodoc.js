/* Fotografia dei documenti dal telefono (solo webapp).
   Usa la fotocamera vera del dispositivo (piena risoluzione, messa a fuoco, flash, HDR),
   poi trova il foglio, lo raddrizza, migliora la leggibilita' e permette di gestire le pagine.
   Tutto avviene sul dispositivo: nessuna immagine esce dal browser. */
(function(){
  'use strict';
  const LATO_MAX_USCITA=3000;      // come imageFileToJpegPage: le pagine del PDF restano entro 3000 px
  const PIXEL_MAX_SORGENTE=16e6;   // limite delle tele di iOS
  const LATO_ANTEPRIMA=1600;

  function isTelefono(){
    try{
      if(navigator.userAgentData&&typeof navigator.userAgentData.mobile==='boolean'&&navigator.userAgentData.mobile)return true;
      const ua=navigator.userAgent||'';
      if(/Android|iPhone|iPad|iPod|Mobile/i.test(ua))return true;
      // iPadOS si presenta come Mac: lo riconosce il tocco
      if(/Macintosh/.test(ua)&&navigator.maxTouchPoints>1)return true;
      return !!(window.matchMedia&&matchMedia('(pointer: coarse)').matches&&!matchMedia('(any-pointer: fine)').matches);
    }catch(_e){return false;}
  }

  // ---------------------------------------------------------------------------------
  // Calcoli sulle immagini, in un worker separato per non bloccare lo schermo
  function codiceWorker(){
    'use strict';
    function grigio(rgba,w,h){const g=new Uint8ClampedArray(w*h);for(let i=0,j=0;i<g.length;i++,j+=4)g[i]=(rgba[j]*77+rgba[j+1]*150+rgba[j+2]*29)>>8;return g;}
    function sfoca(g,w,h){// gaussiana 5x5 separabile (1 4 6 4 1)
      const t=new Float32Array(w*h),o=new Uint8ClampedArray(w*h);
      for(let y=0;y<h;y++){const r=y*w;for(let x=0;x<w;x++){const a=g[r+Math.max(0,x-2)],b=g[r+Math.max(0,x-1)],c=g[r+x],d=g[r+Math.min(w-1,x+1)],e=g[r+Math.min(w-1,x+2)];t[r+x]=(a+4*b+6*c+4*d+e)/16;}}
      for(let y=0;y<h;y++)for(let x=0;x<w;x++){const a=t[Math.max(0,y-2)*w+x],b=t[Math.max(0,y-1)*w+x],c=t[y*w+x],d=t[Math.min(h-1,y+1)*w+x],e=t[Math.min(h-1,y+2)*w+x];o[y*w+x]=(a+4*b+6*c+4*d+e)/16;}
      return o;
    }
    function sobel(g,w,h){const gx=new Float32Array(w*h),gy=new Float32Array(w*h),m=new Float32Array(w*h);
      for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const i=y*w+x;
        const a=g[i-w-1],b=g[i-w],c=g[i-w+1],d=g[i-1],f=g[i+1],k=g[i+w-1],l=g[i+w],n=g[i+w+1];
        const sx=(c+2*f+n)-(a+2*d+k),sy=(k+2*l+n)-(a+2*b+c);gx[i]=sx;gy[i]=sy;m[i]=Math.hypot(sx,sy);}
      return {gx,gy,m};}
    function canny(g,w,h){
      const {gx,gy,m}=sobel(g,w,h);const s=new Float32Array(w*h);const vals=[];
      for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const i=y*w+x,v=m[i];if(v<4)continue;
        const ax=Math.abs(gx[i]),ay=Math.abs(gy[i]);let p,q;
        if(ay<=ax*0.4142){p=m[i-1];q=m[i+1];}else if(ay>=ax*2.4142){p=m[i-w];q=m[i+w];}
        else if(gx[i]*gy[i]>0){p=m[i-w-1];q=m[i+w+1];}else{p=m[i-w+1];q=m[i+w-1];}
        if(v>=p&&v>=q){s[i]=v;vals.push(v);}}
      if(!vals.length)return new Uint8Array(w*h);
      vals.sort((a,b)=>a-b);const alto=Math.max(40,vals[Math.floor(vals.length*0.80)]),basso=alto*0.4;
      const e=new Uint8Array(w*h),pila=[];
      for(let i=0;i<s.length;i++)if(s[i]>=alto&&!e[i]){e[i]=1;pila.push(i);
        while(pila.length){const j=pila.pop();const x=j%w,y=(j/w)|0;
          for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=w||yy>=h)continue;const k=yy*w+xx;if(!e[k]&&s[k]>=basso){e[k]=1;pila.push(k);}}}}
      return e;
    }
    function dilata(e,w,h){const o=new Uint8Array(w*h);for(let y=0;y<h;y++)for(let x=0;x<w;x++){if(!e[y*w+x])continue;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const xx=x+dx,yy=y+dy;if(xx>=0&&yy>=0&&xx<w&&yy<h)o[yy*w+xx]=1;}}return o;}
    function componenti(b,w,h,minimo){// per ogni componente: estremi sinistro e destro di ogni riga
      const lab=new Int32Array(w*h);let n=0;const out=[];const pila=[];
      for(let i=0;i<b.length;i++){if(!b[i]||lab[i])continue;n++;lab[i]=n;pila.push(i);let cnt=0;const sx=new Map();
        while(pila.length){const j=pila.pop();cnt++;const x=j%w,y=(j/w)|0;const r=sx.get(y);if(!r)sx.set(y,[x,x]);else{if(x<r[0])r[0]=x;if(x>r[1])r[1]=x;}
          for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=w||yy>=h)continue;const k=yy*w+xx;if(b[k]&&!lab[k]){lab[k]=n;pila.push(k);}}}
        if(cnt>=minimo){const pts=[];for(const [y,r] of sx){pts.push([r[0],y]);if(r[1]!==r[0])pts.push([r[1],y]);}out.push(pts);}}
      return out;
    }
    function inviluppo(p){p=p.slice().sort((a,b)=>a[0]-b[0]||a[1]-b[1]);if(p.length<3)return p;
      const cr=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);const lo=[],up=[];
      for(const q of p){while(lo.length>=2&&cr(lo[lo.length-2],lo[lo.length-1],q)<=0)lo.pop();lo.push(q);}
      for(let i=p.length-1;i>=0;i--){const q=p[i];while(up.length>=2&&cr(up[up.length-2],up[up.length-1],q)<=0)up.pop();up.push(q);}
      up.pop();lo.pop();return lo.concat(up);}
    function area(q){let a=0;for(let i=0;i<q.length;i++){const p=q[i],r=q[(i+1)%q.length];a+=p[0]*r[1]-r[0]*p[1];}return Math.abs(a)/2;}
    function semplifica(poli,massimo){// toglie i vertici meno importanti finche' ne restano al massimo "massimo"
      let p=poli.slice();
      while(p.length>massimo){let mi=0,mv=Infinity;
        for(let i=0;i<p.length;i++){const a=p[(i-1+p.length)%p.length],b=p[i],c=p[(i+1)%p.length];const v=Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]));if(v<mv){mv=v;mi=i;}}
        p.splice(mi,1);}
      return p;}
    function quadMassimo(h){// quadrilatero di area massima con vertici sull'inviluppo
      const p=semplifica(h,26);const n=p.length;if(n<4)return null;let best=null,ba=-1;
      for(let a=0;a<n;a++)for(let b=a+1;b<n;b++)for(let c=b+1;c<n;c++)for(let d=c+1;d<n;d++){const q=[p[a],p[b],p[c],p[d]];const v=area(q);if(v>ba){ba=v;best=q;}}
      return best;}
    function angoliValidi(q){for(let i=0;i<4;i++){const a=q[(i+3)%4],b=q[i],c=q[(i+1)%4];const v1=[a[0]-b[0],a[1]-b[1]],v2=[c[0]-b[0],c[1]-b[1]];
        const cos=(v1[0]*v2[0]+v1[1]*v2[1])/(Math.hypot(...v1)*Math.hypot(...v2)+1e-9);const ang=Math.acos(Math.max(-1,Math.min(1,cos)))*180/Math.PI;if(ang<40||ang>140)return false;}return true;}
    function supporto(q,bordi,w,h){// quota dei lati del quadrilatero che cade su un bordo vero
      let si=0,tot=0;for(let i=0;i<4;i++){const a=q[i],b=q[(i+1)%4];const L=Math.hypot(b[0]-a[0],b[1]-a[1]);const n=Math.max(8,Math.round(L/2));
        for(let k=1;k<n;k++){const x=Math.round(a[0]+(b[0]-a[0])*k/n),y=Math.round(a[1]+(b[1]-a[1])*k/n);
          if(x<=1||y<=1||x>=w-2||y>=h-2)continue;tot++;let hit=0;for(let dy=-2;dy<=2&&!hit;dy++)for(let dx=-2;dx<=2;dx++){if(bordi[(y+dy)*w+x+dx]){hit=1;break;}}si+=hit;}}
      return tot?si/tot:0;}
    function ordina(q){const cx=q.reduce((s,p)=>s+p[0],0)/4,cy=q.reduce((s,p)=>s+p[1],0)/4;
      const r=q.slice().sort((a,b)=>Math.atan2(a[1]-cy,a[0]-cx)-Math.atan2(b[1]-cy,b[0]-cx));
      let k=0;for(let i=1;i<4;i++)if(r[i][0]+r[i][1]<r[k][0]+r[k][1])k=i;return r.slice(k).concat(r.slice(0,k));}
    function otsu(g){const hist=new Float64Array(256);for(let i=0;i<g.length;i++)hist[g[i]]++;let sum=0;for(let i=0;i<256;i++)sum+=i*hist[i];
      let sB=0,wB=0,best=0,soglia=128;for(let t=0;t<256;t++){wB+=hist[t];if(!wB)continue;const wF=g.length-wB;if(!wF)break;sB+=t*hist[t];const mB=sB/wB,mF=(sum-sB)/wF;const v=wB*wF*(mB-mF)*(mB-mF);if(v>best){best=v;soglia=t;}}return soglia;}
    function rileva(rgba,w,h){
      const g=sfoca(grigio(rgba,w,h),w,h);const e=dilata(canny(g,w,h),w,h);const A=w*h;const cand=[];
      for(const pts of componenti(e,w,h,Math.round((w+h)*0.25))){const hu=inviluppo(pts);if(hu.length<4)continue;const q=quadMassimo(hu);if(q)cand.push({q,ha:area(hu)});}
      // il foglio di solito e' piu' chiaro dello sfondo
      const t=otsu(g);const chiaro=new Uint8Array(A);for(let i=0;i<A;i++)chiaro[i]=g[i]>t?1:0;
      for(const pts of componenti(chiaro,w,h,Math.round(A*0.1))){const hu=inviluppo(pts);if(hu.length<4)continue;const q=quadMassimo(hu);if(q)cand.push({q,ha:area(hu)});}
      let best=null,bs=0;
      for(const c of cand){const q=ordina(c.q);const a=area(q)/A;if(a<0.12||a>0.995||area(q)/c.ha<0.80||!angoliValidi(q))continue;
        const s=supporto(q,e,w,h);if(s<0.45)continue;const pu=s*Math.sqrt(a);if(pu>bs){bs=pu;best=q;}}
      if(!best)return {trovato:false,quad:[[0,0],[1,0],[1,1],[0,1]]};
      const cx=best.reduce((a,p)=>a+p[0],0)/4,cy=best.reduce((a,p)=>a+p[1],0)/4;// un filo verso l'interno, per non lasciare il bordo del tavolo
      return {trovato:true,quad:best.map(p=>[(cx+(p[0]+0.5-cx)*0.994)/w,(cy+(p[1]+0.5-cy)*0.994)/h])};
    }
    function risolvi(A,b){const n=b.length;for(let i=0;i<n;i++){let m=i;for(let r=i+1;r<n;r++)if(Math.abs(A[r][i])>Math.abs(A[m][i]))m=r;[A[i],A[m]]=[A[m],A[i]];[b[i],b[m]]=[b[m],b[i]];
        for(let r=i+1;r<n;r++){const f=A[r][i]/A[i][i];for(let c=i;c<n;c++)A[r][c]-=f*A[i][c];b[r]-=f*b[i];}}
      const x=new Array(n).fill(0);for(let i=n-1;i>=0;i--){let s=b[i];for(let c=i+1;c<n;c++)s-=A[i][c]*x[c];x[i]=s/A[i][i];}return x;}
    function omografia(dst,src){const A=[],b=[];for(let i=0;i<4;i++){const [x,y]=dst[i],[u,v]=src[i];A.push([x,y,1,0,0,0,-u*x,-u*y]);b.push(u);A.push([0,0,0,x,y,1,-v*x,-v*y]);b.push(v);}return risolvi(A,b);}
    function raddrizza(rgba,w,h,quad,lato){
      const d=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);const [tl,tr,br,bl]=quad;
      let W=Math.max(d(tl,tr),d(bl,br)),H=Math.max(d(tl,bl),d(tr,br));const k=Math.min(1,lato/Math.max(W,H));W=Math.max(1,Math.round(W*k));H=Math.max(1,Math.round(H*k));
      const m=omografia([[0,0],[W,0],[W,H],[0,H]],quad);const o=new Uint8ClampedArray(W*H*4);
      for(let y=0;y<H;y++){const yy=y+0.5;for(let x=0;x<W;x++){const xx=x+0.5;const z=m[6]*xx+m[7]*yy+1;let u=(m[0]*xx+m[1]*yy+m[2])/z-0.5,v=(m[3]*xx+m[4]*yy+m[5])/z-0.5;
        if(u<0)u=0;if(v<0)v=0;if(u>w-1)u=w-1;if(v>h-1)v=h-1;const x0=u|0,y0=v|0,x1=Math.min(w-1,x0+1),y1=Math.min(h-1,y0+1),fx=u-x0,fy=v-y0;
        const i00=(y0*w+x0)*4,i10=(y0*w+x1)*4,i01=(y1*w+x0)*4,i11=(y1*w+x1)*4,j=(y*W+x)*4;
        for(let c=0;c<3;c++){const a=rgba[i00+c]+(rgba[i10+c]-rgba[i00+c])*fx,b=rgba[i01+c]+(rgba[i11+c]-rgba[i01+c])*fx;o[j+c]=a+(b-a)*fy;}o[j+3]=255;}}
      return {o,W,H};
    }
    function misure(o,W,H){// luminosita' media e nitidezza (varianza del laplaciano sui bordi del testo)
      const k=Math.min(1,1000/W),w=Math.max(8,Math.round(W*k)),h=Math.max(8,Math.round(H*k));const g=new Float32Array(w*h);let somma=0;
      for(let y=0;y<h;y++)for(let x=0;x<w;x++){const j=(Math.min(H-1,Math.floor(y/k))*W+Math.min(W-1,Math.floor(x/k)))*4;const v=(o[j]*77+o[j+1]*150+o[j+2]*29)>>8;g[y*w+x]=v;somma+=v;}
      let n=0,s=0,s2=0;
      for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const i=y*w+x;const gx=g[i+1]-g[i-1],gy=g[i+w]-g[i-w];if(Math.abs(gx)+Math.abs(gy)<40)continue;const l=g[i-1]+g[i+1]+g[i-w]+g[i+w]-4*g[i];n++;s+=l;s2+=l*l;}
      const quota=n/((w-2)*(h-2));return {luminosita:somma/(w*h),nitidezza:n?(s2/n-(s/n)*(s/n)):null,quotaBordi:quota};
    }
    function migliora(o,W,H){// toglie ombre e dominanti di colore, rende il foglio bianco e il testo piu' scuro
      const B=Math.max(12,Math.round(Math.max(W,H)/72)),bw=Math.ceil(W/B),bh=Math.ceil(H/B);const sfondo=new Float32Array(bw*bh*3);
      for(let by=0;by<bh;by++)for(let bx=0;bx<bw;bx++){const v=[[],[],[]];
        for(let y=by*B;y<Math.min(H,(by+1)*B);y+=2)for(let x=bx*B;x<Math.min(W,(bx+1)*B);x+=2){const j=(y*W+x)*4;v[0].push(o[j]);v[1].push(o[j+1]);v[2].push(o[j+2]);}
        for(let c=0;c<3;c++){const a=v[c].sort((p,q)=>p-q);sfondo[(by*bw+bx)*3+c]=a.length?a[Math.floor(a.length*0.90)]:255;}}
      // massimo sui vicini (per non scurire le zone con molto testo) e media per ammorbidire
      const mx=new Float32Array(sfondo.length);for(let by=0;by<bh;by++)for(let bx=0;bx<bw;bx++)for(let c=0;c<3;c++){let m=0;for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const yy=by+dy,xx=bx+dx;if(yy<0||xx<0||yy>=bh||xx>=bw)continue;m=Math.max(m,sfondo[(yy*bw+xx)*3+c]);}mx[(by*bw+bx)*3+c]=m;}
      const lis=new Float32Array(mx.length);for(let by=0;by<bh;by++)for(let bx=0;bx<bw;bx++)for(let c=0;c<3;c++){let s=0,n=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const yy=by+dy,xx=bx+dx;if(yy<0||xx<0||yy>=bh||xx>=bw)continue;s+=mx[(yy*bw+xx)*3+c];n++;}lis[(by*bw+bx)*3+c]=Math.max(40,s/n);}
      const hist=new Uint32Array(256);
      for(let y=0;y<H;y++){const fy=Math.min(bh-1.001,Math.max(0,(y+0.5)/B-0.5));const y0=fy|0,ty=fy-y0;
        for(let x=0;x<W;x++){const fx=Math.min(bw-1.001,Math.max(0,(x+0.5)/B-0.5));const x0=fx|0,tx=fx-x0;const j=(y*W+x)*4;
          for(let c=0;c<3;c++){const a=lis[(y0*bw+x0)*3+c],b=lis[(y0*bw+Math.min(bw-1,x0+1))*3+c],d=lis[(Math.min(bh-1,y0+1)*bw+x0)*3+c],e=lis[(Math.min(bh-1,y0+1)*bw+Math.min(bw-1,x0+1))*3+c];
            const bg=(a*(1-tx)+b*tx)*(1-ty)+(d*(1-tx)+e*tx)*ty;o[j+c]=Math.min(255,o[j+c]*255/bg);}
          hist[(o[j]*77+o[j+1]*150+o[j+2]*29)>>8]++;}}
      let acc=0,nero=0;const soglia=W*H*0.01;for(let i=0;i<256;i++){acc+=hist[i];if(acc>=soglia){nero=Math.min(110,i);break;}}
      const lut=new Uint8ClampedArray(256);for(let i=0;i<256;i++){const t=Math.max(0,(i-nero)/(255-nero));lut[i]=Math.round(255*Math.pow(t,1.12));}
      for(let j=0;j<o.length;j+=4){o[j]=lut[o[j]];o[j+1]=lut[o[j+1]];o[j+2]=lut[o[j+2]];}
    }
    onmessage=e=>{const m=e.data;try{
      if(m.tipo==='rileva'){postMessage({id:m.id,...rileva(new Uint8ClampedArray(m.rgba),m.w,m.h)});return;}
      if(m.tipo==='elabora'){const src=new Uint8ClampedArray(m.rgba);const q=m.quad.map(p=>[p[0]*m.w,p[1]*m.h]);const r=raddrizza(src,m.w,m.h,q,m.lato);const mis=misure(r.o,r.W,r.H);if(m.migliora)migliora(r.o,r.W,r.H);
        postMessage({id:m.id,w:r.W,h:r.H,rgba:r.o.buffer,...mis},[r.o.buffer]);return;}
    }catch(err){postMessage({id:m.id,errore:String(err&&err.message||err)});}};
  }
  let worker=null,seq=0;const attese=new Map();
  function calcola(msg,trasf){
    if(!worker){worker=new Worker(URL.createObjectURL(new Blob(['('+codiceWorker.toString()+')()'],{type:'text/javascript'})));
      worker.onmessage=e=>{const a=attese.get(e.data.id);if(!a)return;attese.delete(e.data.id);e.data.errore?a.ko(new Error(e.data.errore)):a.ok(e.data);};}
    const id=++seq;return new Promise((ok,ko)=>{attese.set(id,{ok,ko});worker.postMessage({...msg,id},trasf||[]);});
  }

  // ---------------------------------------------------------------------------------
  async function leggiFoto(file){
    // l'elemento immagine applica sempre l'orientamento salvato dal telefono (EXIF), anche su iPhone
    const bmp=await new Promise((ok,ko)=>{const u=URL.createObjectURL(file);const i=new Image();i.decoding='async';i.onload=()=>{URL.revokeObjectURL(u);ok(i);};i.onerror=()=>{URL.revokeObjectURL(u);ko(new Error('Foto non leggibile'));};i.src=u;});
    const w0=bmp.naturalWidth,h0=bmp.naturalHeight;const k=Math.min(1,Math.sqrt(PIXEL_MAX_SORGENTE/(w0*h0)));
    const w=Math.max(1,Math.round(w0*k)),h=Math.max(1,Math.round(h0*k));
    const kp=Math.min(1,LATO_ANTEPRIMA/Math.max(w,h));const anteprima=document.createElement('canvas');anteprima.width=Math.round(w*kp);anteprima.height=Math.round(h*kp);
    anteprima.getContext('2d').drawImage(bmp,0,0,anteprima.width,anteprima.height);
    return {bmp,w,h,anteprima};
  }
  function pixel(sorgente,w,h){const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(sorgente,0,0,w,h);const d=x.getImageData(0,0,w,h).data;c.width=c.height=0;return d;}
  async function rilevaFoglio(foto){
    const k=Math.min(1,640/Math.max(foto.w,foto.h));const w=Math.max(8,Math.round(foto.w*k)),h=Math.max(8,Math.round(foto.h*k));
    const d=pixel(foto.anteprima,w,h);return calcola({tipo:'rileva',w,h,rgba:d.buffer},[d.buffer]);
  }
  async function creaPagina(foto,quad,rot,migliora,nome){
    const d=pixel(foto.bmp,foto.w,foto.h);
    const r=await calcola({tipo:'elabora',w:foto.w,h:foto.h,rgba:d.buffer,quad,lato:LATO_MAX_USCITA,migliora},[d.buffer]);
    const a=document.createElement('canvas');a.width=r.w;a.height=r.h;a.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(r.rgba),r.w,r.h),0,0);
    let c=a;if(rot%4){c=document.createElement('canvas');const giro=rot%2===1;c.width=giro?r.h:r.w;c.height=giro?r.w:r.h;const x=c.getContext('2d');x.translate(c.width/2,c.height/2);x.rotate(rot*Math.PI/2);x.drawImage(a,-r.w/2,-r.h/2);}
    const blob=await new Promise(ok=>c.toBlob(ok,'image/jpeg',0.92));if(!blob)throw new Error('Creazione della pagina non riuscita');
    const avvisi=[];
    if(r.luminosita<85)avvisi.push('Foto scura');
    if(r.nitidezza!==null&&r.quotaBordi>0.004&&r.nitidezza<SOGLIA_NITIDEZZA)avvisi.push('Foto poco nitida');
    const file=new File([blob],nome,{type:'image/jpeg'});a.width=a.height=0;if(c!==a)c.width=c.height=0;
    return {file,avvisi};
  }
  const SOGLIA_NITIDEZZA=1500;

  // ---------------------------------------------------------------------------------
  function stile(){
    if(document.getElementById('fotodocStile'))return;const s=document.createElement('style');s.id='fotodocStile';
    s.textContent=`.fd-velo{position:fixed;inset:0;z-index:99990;background:#f4f7f9;display:flex;flex-direction:column;font-family:Segoe UI,system-ui,-apple-system,sans-serif;color:#14243a}
.fd-testa{display:flex;align-items:flex-start;gap:10px;padding:14px 16px 10px;background:#fff;border-bottom:1px solid #e3e9ee}
.fd-testa h2{margin:0;font-size:18px}.fd-testa p{margin:4px 0 0;font-size:13px;color:#4a5a6a;line-height:1.4}.fd-testa .fd-x{margin-left:auto;border:0;background:none;font-size:28px;line-height:1;color:#4a5a6a;padding:0 4px}
.fd-corpo{flex:1;overflow:auto;padding:14px 16px}
.fd-piede{display:flex;gap:8px;flex-wrap:wrap;padding:12px 16px calc(12px + env(safe-area-inset-bottom));background:#fff;border-top:1px solid #e3e9ee}
.fd-piede button,.fd-strumenti button{flex:1 1 auto;min-height:46px;font:600 15px inherit;font-family:inherit;border-radius:12px;border:1px solid #cfd8e0;background:#fff;color:#14243a;padding:10px 14px}
.fd-piede button.fd-pr{background:#0f766e;border-color:#0f766e;color:#fff}.fd-piede button:disabled{opacity:.5}
.fd-vuoto{text-align:center;padding:40px 10px;color:#4a5a6a;line-height:1.5}
.fd-pagine{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px}
.fd-pag{background:#fff;border:1px solid #dbe3ea;border-radius:12px;padding:8px;display:flex;flex-direction:column;gap:6px}
.fd-pag img{width:100%;aspect-ratio:3/4;object-fit:contain;background:#eef2f5;border-radius:8px}
.fd-pag b{font-size:13px}.fd-pag .fd-avv{font-size:12px;color:#9b1c1c;font-weight:600}
.fd-pag .fd-az{display:grid;grid-template-columns:repeat(3,1fr);gap:4px}.fd-pag .fd-az button{min-height:38px;border:1px solid #cfd8e0;background:#fff;border-radius:8px;font:600 12px inherit;font-family:inherit;color:#14243a;padding:4px}
.fd-pag .fd-az button:disabled{opacity:.35}
.fd-editor{position:relative;flex:1;display:flex;align-items:center;justify-content:center;background:#1d2733;overflow:hidden;touch-action:none}
.fd-editor canvas{touch-action:none;max-width:100%;max-height:100%}
.fd-lente{position:absolute;top:10px;width:120px;height:120px;border-radius:50%;border:3px solid #fff;box-shadow:0 4px 14px rgba(0,0,0,.4);pointer-events:none;display:none}
.fd-strumenti{display:flex;gap:8px;flex-wrap:wrap;padding:10px 16px 0;background:#fff}
.fd-strumenti label{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:600;min-height:46px;padding:0 6px}
.fd-strumenti input{width:22px;height:22px}
.fd-attesa{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(20,36,58,.55);color:#fff;font-weight:600;font-size:15px;text-align:center;padding:20px}
.fd-nota{font-size:13px;color:#4a5a6a;padding:6px 16px 0;background:#fff;line-height:1.4}`;
    document.head.appendChild(s);
  }
  function el(html){const t=document.createElement('template');t.innerHTML=html.trim();return t.content.firstElementChild;}

  // Scatto con la fotocamera del dispositivo. Va chiamato durante il tocco della persona.
  function nuovoInput(){const i=document.createElement('input');i.type='file';i.accept='image/*';i.setAttribute('capture','environment');i.style.display='none';document.body.appendChild(i);return i;}
  function scatta(input){
    return new Promise(ok=>{let fatto=false;const fine=f=>{if(fatto)return;fatto=true;input.onchange=null;input.oncancel=null;ok(f);};
      input.value='';input.onchange=()=>fine(input.files&&input.files[0]||null);input.oncancel=()=>fine(null);input.click();});
  }

  // Editor del ritaglio: 4 angoli da trascinare, con lente di ingrandimento
  function apriEditor(velo,foto,stato,titolo){
    return new Promise(risolvi=>{
      const vista=el(`<div class="fd-velo" style="z-index:99991"><div class="fd-testa"><div><h2></h2><p>Sposta i quattro cerchi sugli angoli del foglio. Tieni premuto e trascina: la lente ti aiuta a essere preciso.</p></div></div>
        <div class="fd-editor"><canvas></canvas><canvas class="fd-lente" width="240" height="240"></canvas></div>
        <div class="fd-strumenti"><label><input type="checkbox" data-migliora> Migliora leggibilità</label><button type="button" data-ruota>Ruota</button><button type="button" data-tutta>Tutta la foto</button></div>
        <div class="fd-nota" data-nota></div>
        <div class="fd-piede"><button type="button" data-rifai>Rifai foto</button><button type="button" class="fd-pr" data-ok>Conferma</button></div></div>`);
      vista.querySelector('h2').textContent=titolo;document.body.appendChild(vista);
      const area=vista.querySelector('.fd-editor'),cv=area.querySelector('canvas'),lente=area.querySelector('.fd-lente');const ctx=cv.getContext('2d');
      const cb=vista.querySelector('[data-migliora]');cb.checked=!!stato.migliora;
      const nota=vista.querySelector('[data-nota]');nota.textContent=stato.trovato===false?'Non ho trovato con sicurezza i bordi del foglio: sistemali tu spostando i cerchi.':'';
      let quad=stato.quad.map(p=>p.slice()),rot=stato.rot||0,scala=1,trascina=-1;
      function misura(){const W=area.clientWidth-24,H=area.clientHeight-24;scala=Math.min(W/foto.anteprima.width,H/foto.anteprima.height);
        const dpr=Math.min(2,window.devicePixelRatio||1);cv.style.width=Math.round(foto.anteprima.width*scala)+'px';cv.style.height=Math.round(foto.anteprima.height*scala)+'px';
        cv.width=Math.round(foto.anteprima.width*scala*dpr);cv.height=Math.round(foto.anteprima.height*scala*dpr);disegna();}
      function disegna(){const W=cv.width,H=cv.height,dpr=Math.min(2,window.devicePixelRatio||1);ctx.drawImage(foto.anteprima,0,0,W,H);
        const p=quad.map(q=>[q[0]*W,q[1]*H]);ctx.save();ctx.fillStyle='rgba(20,36,58,.45)';ctx.beginPath();ctx.rect(0,0,W,H);ctx.moveTo(p[0][0],p[0][1]);for(let i=3;i>=0;i--)ctx.lineTo(p[i][0],p[i][1]);ctx.closePath();ctx.fill('evenodd');
        ctx.strokeStyle='#2dd4bf';ctx.lineWidth=3*dpr;ctx.beginPath();p.forEach((q,i)=>i?ctx.lineTo(q[0],q[1]):ctx.moveTo(q[0],q[1]));ctx.closePath();ctx.stroke();
        p.forEach((q,i)=>{ctx.beginPath();ctx.arc(q[0],q[1],(trascina===i?16:12)*dpr,0,Math.PI*2);ctx.fillStyle=trascina===i?'rgba(45,212,191,.55)':'rgba(255,255,255,.85)';ctx.fill();ctx.lineWidth=3*dpr;ctx.strokeStyle='#0f766e';ctx.stroke();});ctx.restore();}
      function disegnaLente(i){const q=quad[i];const lw=lente.width,lx=lente.getContext('2d');const z=2.5;const sx=q[0]*foto.anteprima.width,sy=q[1]*foto.anteprima.height;const r=lw/(2*z*(scala*(Math.min(2,window.devicePixelRatio||1))))*(Math.min(2,window.devicePixelRatio||1));
        lx.fillStyle='#1d2733';lx.fillRect(0,0,lw,lw);lx.drawImage(foto.anteprima,sx-r,sy-r,2*r,2*r,0,0,lw,lw);lx.strokeStyle='#2dd4bf';lx.lineWidth=2;lx.beginPath();lx.moveTo(lw/2,lw/2-24);lx.lineTo(lw/2,lw/2+24);lx.moveTo(lw/2-24,lw/2);lx.lineTo(lw/2+24,lw/2);lx.stroke();
        lente.style.display='block';const sinistra=q[0]>0.5;lente.style.left=sinistra?'10px':'';lente.style.right=sinistra?'':'10px';}
      const pos=e=>{const r=cv.getBoundingClientRect();return [(e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height];};
      cv.addEventListener('pointerdown',e=>{const [x,y]=pos(e);const r=cv.getBoundingClientRect();let mi=-1,md=Infinity;quad.forEach((q,i)=>{const d=Math.hypot((q[0]-x)*r.width,(q[1]-y)*r.height);if(d<md){md=d;mi=i;}});
        if(md<48){trascina=mi;cv.setPointerCapture(e.pointerId);disegna();disegnaLente(mi);e.preventDefault();}});
      cv.addEventListener('pointermove',e=>{if(trascina<0)return;const [x,y]=pos(e);quad[trascina]=[Math.min(1,Math.max(0,x)),Math.min(1,Math.max(0,y))];disegna();disegnaLente(trascina);e.preventDefault();});
      const rilascia=()=>{if(trascina<0)return;trascina=-1;lente.style.display='none';disegna();};
      cv.addEventListener('pointerup',rilascia);cv.addEventListener('pointercancel',rilascia);
      vista.querySelector('[data-ruota]').onclick=()=>{rot=(rot+1)%4;nota.textContent=`La pagina verrà ruotata di ${rot*90}° in senso orario.`;};
      vista.querySelector('[data-tutta]').onclick=()=>{quad=[[0,0],[1,0],[1,1],[0,1]];disegna();};
      const chiudi=v=>{window.removeEventListener('resize',misura);vista.remove();risolvi(v);};
      vista.querySelector('[data-rifai]').onclick=()=>chiudi({rifai:true});
      vista.querySelector('[data-ok]').onclick=()=>chiudi({quad,rot,migliora:cb.checked});
      window.addEventListener('resize',misura);requestAnimationFrame(misura);
    });
  }
  function attesa(velo,testo){const a=el(`<div class="fd-attesa"></div>`);a.textContent=testo;velo.appendChild(a);return()=>a.remove();}

  /* Acquisizione di una o piu' pagine. Restituisce i file JPEG delle pagine, oppure null se annullata.
     single: una sola immagine (es. tessera sanitaria); migliora: valore iniziale di "Migliora leggibilita'". */
  function acquisisci({single=false,title='Fotografa documento',migliora=!single}={}){
    stile();const input=nuovoInput();
    const primo=scatta(input);// subito, mentre il tocco e' ancora valido
    return new Promise(risolvi=>{
      const velo=el(`<div class="fd-velo" role="dialog" aria-modal="true"><div class="fd-testa"><div><h2></h2><p>${single?'Fotografa il documento intero, su un piano scuro e con buona luce.':'Fotografa una pagina alla volta, intera, su un piano scuro e con buona luce. Puoi aggiungere, rifare, ruotare e riordinare le pagine.'}</p></div><button class="fd-x" type="button" aria-label="Chiudi">×</button></div>
        <div class="fd-corpo"><div class="fd-vuoto">Nessuna pagina ancora. Tocca «Scatta foto» per aprire la fotocamera.</div><div class="fd-pagine"></div></div>
        <div class="fd-piede"><button type="button" data-annulla>Annulla</button><button type="button" data-scatta>Scatta foto</button>${single?'':'<button type="button" class="fd-pr" data-fine disabled>Termina e analizza</button>'}</div></div>`);
      velo.querySelector('h2').textContent=title;document.body.appendChild(velo);
      const griglia=velo.querySelector('.fd-pagine'),vuoto=velo.querySelector('.fd-vuoto'),btnFine=velo.querySelector('[data-fine]'),btnScatta=velo.querySelector('[data-scatta]');
      const pagine=[];let chiuso=false;
      const termina=v=>{if(chiuso)return;chiuso=true;pagine.forEach(p=>{p.url&&URL.revokeObjectURL(p.url);p.foto&&p.foto.bmp&&p.foto.bmp.close&&p.foto.bmp.close();});input.remove();velo.remove();risolvi(v);};
      const stamp=()=>new Date().toISOString().replace(/[-:T]/g,'').slice(0,14);
      function mostra(){vuoto.style.display=pagine.length?'none':'';griglia.innerHTML='';
        pagine.forEach((p,i)=>{const c=el(`<div class="fd-pag"><img alt=""><b></b><div class="fd-avv"></div><div class="fd-az"><button type="button" data-a="su">◀</button><button type="button" data-a="ruota">Ruota</button><button type="button" data-a="giu">▶</button><button type="button" data-a="modifica">Ritaglio</button><button type="button" data-a="rifai">Rifai</button><button type="button" data-a="elimina">Elimina</button></div></div>`);
          c.querySelector('img').src=p.url;c.querySelector('b').textContent=single?'Immagine':`Pagina ${i+1}`;c.querySelector('.fd-avv').textContent=p.avvisi.length?p.avvisi.join(' · ')+': controlla che si legga':'';
          if(single){c.querySelector('[data-a=su]').style.visibility='hidden';c.querySelector('[data-a=giu]').style.visibility='hidden';}
          c.querySelector('[data-a=su]').disabled=i===0;c.querySelector('[data-a=giu]').disabled=i===pagine.length-1;
          c.querySelectorAll('button').forEach(b=>b.onclick=()=>azione(b.dataset.a,i));griglia.appendChild(c);});
        if(btnFine)btnFine.disabled=!pagine.length;
        if(single){btnScatta.textContent=pagine.length?'Usa questa immagine':'Scatta foto';btnScatta.classList.toggle('fd-pr',!!pagine.length);}
        else btnScatta.textContent=pagine.length?'Aggiungi pagina':'Scatta foto';}
      async function genera(p){const fine=attesa(velo,'Preparazione della pagina…');
        try{const r=await creaPagina(p.foto,p.quad,p.rot,p.migliora,'pagina.jpg');p.file=r.file;p.avvisi=r.avvisi;if(p.url)URL.revokeObjectURL(p.url);p.url=URL.createObjectURL(r.file);}
        finally{fine();}}
      async function elaboraScatto(file,indice){
        if(!file)return false;let foto;const fine=attesa(velo,'Ricerca dei bordi del foglio…');
        let ril;try{foto=await leggiFoto(file);ril=await rilevaFoglio(foto);}catch(err){fine();alert('La foto non è leggibile: '+(err.message||err));return false;}fine();
        const st={quad:ril.quad,trovato:ril.trovato,rot:0,migliora:indice!=null?pagine[indice].migliora:migliora};
        const ed=await apriEditor(velo,foto,st,single?title:`Pagina ${indice!=null?indice+1:pagine.length+1}`);
        if(ed.rifai){foto.bmp.close&&foto.bmp.close();return 'rifai';}
        const p={foto,quad:ed.quad,rot:ed.rot,migliora:ed.migliora,avvisi:[],url:null,file:null};
        try{await genera(p);}catch(err){alert('Pagina non creata: '+(err.message||err));return false;}
        if(indice!=null){const vecchia=pagine[indice];vecchia.url&&URL.revokeObjectURL(vecchia.url);vecchia.foto.bmp.close&&vecchia.foto.bmp.close();pagine[indice]=p;}else pagine.push(p);
        mostra();return true;}
      async function giro(promessa,indice){let f=await promessa;while(true){if(!f){if(!pagine.length&&indice==null)termina(null);return;}
          const r=await elaboraScatto(f,indice);if(r!=='rifai')return;f=await scatta(input);}}
      async function azione(a,i){const p=pagine[i];
        if(a==='su'&&i>0){[pagine[i-1],pagine[i]]=[pagine[i],pagine[i-1]];mostra();}
        if(a==='giu'&&i<pagine.length-1){[pagine[i+1],pagine[i]]=[pagine[i],pagine[i+1]];mostra();}
        if(a==='elimina'){p.url&&URL.revokeObjectURL(p.url);p.foto.bmp.close&&p.foto.bmp.close();pagine.splice(i,1);mostra();}
        if(a==='ruota'){p.rot=(p.rot+1)%4;try{await genera(p);}catch(err){alert(err.message||err);}mostra();}
        if(a==='rifai'){await giro(scatta(input),i);}
        if(a==='modifica'){const ed=await apriEditor(velo,p.foto,{quad:p.quad,rot:p.rot,migliora:p.migliora},single?title:`Pagina ${i+1}`);
          if(ed.rifai){await giro(scatta(input),i);return;}p.quad=ed.quad;p.rot=ed.rot;p.migliora=ed.migliora;try{await genera(p);}catch(err){alert(err.message||err);}mostra();}}
      velo.querySelector('.fd-x').onclick=()=>termina(null);velo.querySelector('[data-annulla]').onclick=()=>termina(null);
      btnScatta.onclick=()=>{if(single&&pagine.length){termina(finali());return;}void giro(scatta(input),single&&pagine.length?0:null);};
      const finali=()=>{const t=stamp();return pagine.map((p,i)=>new File([p.file],`fotocamera_${t}_p${String(i+1).padStart(2,'0')}.jpg`,{type:'image/jpeg'}));};
      if(btnFine)btnFine.onclick=()=>termina(finali());
      mostra();void giro(primo,null);
    });
  }

  // Su computer la fotografia non serve (le webcam non sono adatte ai documenti): i tasti si nascondono
  try{if(!isTelefono())document.documentElement.classList.add('dispositivo-computer');}catch(_e){}
  window.FotoDocumento={isTelefono,acquisisci,_prova:{rileva:(rgba,w,h)=>calcola({tipo:'rileva',w,h,rgba:rgba.buffer},[rgba.buffer]),elabora:(rgba,w,h,quad,migliora)=>calcola({tipo:'elabora',w,h,rgba:rgba.buffer,quad,lato:LATO_MAX_USCITA,migliora},[rgba.buffer])}};
})();
