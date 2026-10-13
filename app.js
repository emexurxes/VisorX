/* Luma: local-only image workspace. No analytics, uploads or persistent study storage. */
'use strict';
const $ = (id) => document.getElementById(id);
const icons = {
  folder:'<path d="M3 7V5a1 1 0 0 1 1-1h5l2 3h9a1 1 0 0 1 1 1v2"/><path d="M3 9h18l-3 10H2L3 9Z"/>',
  help:'<circle cx="12" cy="12" r="9"/><path d="M9.4 8.5a2.7 2.7 0 0 1 5.2.9c0 2-2.6 2.1-2.6 4.1M12 17h.01"/>',
  layers:'<path d="m12 3 10 5-10 5L2 8l10-5ZM2 12l10 5 10-5M2 16l10 5 10-5"/>',
  shield:'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>',
  close:'<path d="m6 6 12 12M6 18 18 6"/>',
  hand:'<path d="M8 12V6a2 2 0 0 1 4 0v5-7a2 2 0 0 1 4 0v8-5a2 2 0 0 1 4 0v8c0 4-2 6-6 6h-2c-2 0-3-1-4-3l-4-5a2 2 0 0 1 3-2l1 1Z"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  ruler:'<path d="m3 16 13-13 5 5L8 21l-5-5Zm7-7 3 3m0-6 2 2m-8 4 2 2m-5 1 3 3"/>',
  rotate:'<path d="M20 8a8 8 0 1 0 0 8M20 3v5h-5"/>',
  flip:'<path d="M12 3v18M3 17l6-10v10H3Zm18 0L15 7v10h6Z"/>',
  contrast:'<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18V3Z" fill="currentColor" stroke="none"/>',
  reset:'<path d="M4 10a8 8 0 1 1 1 7M4 4v6h6"/>',
  download:'<path d="M12 3v12m-4-4 4 4 4-4M4 16v4h16v-4"/>',
  scan:'<path d="M8 3H4a1 1 0 0 0-1 1v4m13-5h4a1 1 0 0 1 1 1v4M3 16v4a1 1 0 0 0 1 1h4m13-5v4a1 1 0 0 1-1 1h-4M7 12h10M12 7v10"/>',
  zoom:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5M8 10.5h5m-2.5-2.5v5"/>',
  expand:'<path d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6"/>',
  sliders:'<path d="M3 6h9m4 0h5M3 12h3m4 0h11M3 18h12m4 0h2M12 3v6M6 9v6m9 0v6"/>',
  spark:'<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z"/>'
};
document.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[el.dataset.icon] || ''}</svg>`; });
const canvas = $('viewer'), ctx = canvas.getContext('2d'), stage = $('stage');
const sourceCanvas = document.createElement('canvas'), sourceCtx = sourceCanvas.getContext('2d');
const state = {items:[], index:-1, mode:'pan', zoom:1, x:0,y:0, angle:0, flip:false, invert:false, center:0,width:1,frame:0,loading:false,drag:null,measure:null,pointers:new Map(),pinch:null};
let viewW=0, viewH=0, dpr=1, rasterPending=false, toastTimer, dragDepth=0;
const active = () => state.items[state.index];
const image = () => active()?.image;
const aspect = () => image()?.spacing ? image().spacing[0]/image().spacing[1] : 1;
const nextPaint = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
function toast(text,error=false){clearTimeout(toastTimer);$('toast').textContent=text;$('toast').classList.toggle('error',error);$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,error?11000:4500);}
function setBusy(busy,text='Leyendo estudio…'){state.loading=busy;$('loading').hidden=!busy;$('loading-text').textContent=text;['open-button','welcome-open','open-folder','close-study'].forEach(id=>$(id).disabled=busy);document.querySelectorAll('.toolbar button').forEach(b=>b.disabled=busy||!image());}
function setLoaded(loaded){document.querySelector('.workspace').classList.toggle('has-study',loaded);stage.classList.toggle('loaded',loaded);['viewer','stage-top','stage-bottom','zoom-control','study-info','close-study'].forEach(id=>$(id).hidden=!loaded);['welcome','study-empty'].forEach(id=>$(id).hidden=loaded);$('adjustment-fields').disabled=!loaded;document.querySelectorAll('.toolbar button').forEach(b=>b.disabled=!loaded);}
function matrix(){const im=image();return new DOMMatrix().translate(viewW/2+state.x,viewH/2+state.y).scale(state.zoom).rotate(state.angle).scale(state.flip?-1:1,aspect()).translate(-im.width/2,-im.height/2);}
function point(ev){const r=canvas.getBoundingClientRect();return{x:ev.clientX-r.left,y:ev.clientY-r.top};}
function toImage(p){return new DOMPoint(p.x,p.y).matrixTransform(matrix().inverse());}
function within(p){return p.x>=0&&p.y>=0&&p.x<image().width&&p.y<image().height;}
function clampPoint(p){return{x:Math.max(0,Math.min(image().width-1,p.x)),y:Math.max(0,Math.min(image().height-1,p.y))};}
function measurement(m){const sp=image().spacing;const v=Math.hypot((m.b.x-m.a.x)*(sp?sp[1]:1),(m.b.y-m.a.y)*(sp?sp[0]:1));return`${v.toLocaleString('es-ES',{minimumFractionDigits:sp?2:1,maximumFractionDigits:sp?2:1})} ${sp?'mm':'px'}`;}
function drawMeasurement(m,pending=false){const mat=matrix();const a=new DOMPoint(m.a.x,m.a.y).matrixTransform(mat),b=new DOMPoint(m.b.x,m.b.y).matrixTransform(mat);ctx.save();ctx.strokeStyle=pending?'#ffe7a6':'#b9e4ce';ctx.fillStyle=ctx.strokeStyle;ctx.lineWidth=1.4;ctx.setLineDash(pending?[4,4]:[]);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();ctx.setLineDash([]);for(const p of [a,b]){ctx.beginPath();ctx.arc(p.x,p.y,3,0,Math.PI*2);ctx.fill();}const label=measurement(m),w=ctx.measureText(label).width+16;const mx=(a.x+b.x)/2,my=(a.y+b.y)/2;ctx.fillStyle='#14251ee8';ctx.fillRect(mx-w/2,my-28,w,21);ctx.fillStyle='#d9f5e7';ctx.textAlign='center';ctx.fillText(label,mx,my-14);ctx.restore();}
function draw(){ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,viewW,viewH);if(!image())return;ctx.save();const m=matrix();ctx.transform(m.a,m.b,m.c,m.d,m.e,m.f);ctx.imageSmoothingEnabled=state.zoom<2;ctx.drawImage(sourceCanvas,0,0);ctx.restore();ctx.font='11px -apple-system, sans-serif';for(const m of active().measures.filter(m=>m.frame===state.frame))drawMeasurement(m);if(state.measure)drawMeasurement(state.measure,true);$('zoom-value').textContent=`${Math.round(state.zoom*100)} %`;$('window-badge').textContent=`C ${Math.round(state.center)} · W ${Math.round(state.width)}`;const transforms=[];if(state.angle)transforms.push(`${state.angle}°`);if(state.flip)transforms.push('REFLEJADA');if(state.invert)transforms.push('INVERTIDA');if(state.center!==image().defaultCenter||state.width!==image().defaultWidth)transforms.push('TONOS AJUSTADOS');$('transform-badge').textContent=transforms.join(' · ')||'ORIGINAL';$('flip-button').setAttribute('aria-pressed',String(state.flip));$('invert-button').setAttribute('aria-pressed',String(state.invert));}
function rasterize(){if(!image())return;const im=image();const rgba=DicomEngine.rasterize(im,{center:state.center,width:state.width,invert:state.invert,frame:state.frame});sourceCanvas.width=im.width;sourceCanvas.height=im.height;sourceCtx.putImageData(new ImageData(rgba,im.width,im.height),0,0);syncSliders();draw();}
function requestRaster(){if(rasterPending)return;rasterPending=true;requestAnimationFrame(()=>{rasterPending=false;try{rasterize();}catch(e){toast(e.message,true);}});}
function resize(){const r=stage.getBoundingClientRect();viewW=r.width;viewH=r.height;dpr=Math.min(window.devicePixelRatio||1,2);canvas.width=Math.round(viewW*dpr);canvas.height=Math.round(viewH*dpr);draw();}
function fit(){if(!image())return;const rotated=state.angle%180!==0,iw=image().width,ih=image().height*aspect();state.zoom=Math.max(.005,Math.min((viewW-42)/(rotated?ih:iw),(viewH-90)/(rotated?iw:ih)));state.x=0;state.y=-5;draw();}
function zoomAt(factor,p={x:viewW/2,y:viewH/2}){if(!image())return;const before=toImage(p);state.zoom=Math.max(.005,Math.min(20,state.zoom*factor));const after=new DOMPoint(before.x,before.y).matrixTransform(matrix());state.x+=p.x-after.x;state.y+=p.y-after.y;draw();}
function setMode(mode){state.mode=mode;state.measure=null;state.drag=null;canvas.className=mode;document.querySelectorAll('[data-mode]').forEach(b=>{b.classList.toggle('selected',b.dataset.mode===mode);b.setAttribute('aria-pressed',String(b.dataset.mode===mode));});$('interaction-hint').textContent=mode==='measure'?'Arrastra entre dos puntos · Esc para cancelar':mode==='window'?'Horizontal: contraste · Vertical: brillo':'Arrastra para mover · Rueda para ampliar';draw();}
function syncSliders(){if(!image())return;const im=image(),span=Math.max(1,im.max-im.min),lo=im.min-span,hi=im.max+span;$('center-range').min=lo;$('center-range').max=hi;$('center-range').step=Math.max(.01,span/4096);$('center-range').value=hi+lo-state.center;$('center-value').textContent=Math.round(state.center);const wm=Math.max(span*3,im.defaultWidth*2,2);$('width-range').min=0;$('width-range').max=1000;$('width-range').value=1000*(1-Math.log(Math.max(1,state.width))/Math.log(wm));$('width-value').textContent=Math.round(state.width);}
function resetTones(){if(!image())return;state.center=image().defaultCenter;state.width=image().defaultWidth;state.invert=false;rasterize();}
function resetView(){if(!image())return;state.angle=0;state.flip=false;state.measure=null;resetTones();fit();}
function renderMeasurements(){const list=$('measurement-list');list.replaceChildren();if(!image())return;const measures=active().measures.filter(m=>m.frame===state.frame);if(!measures.length){const p=document.createElement('p');p.className='muted';p.textContent='Selecciona «Medir» y arrastra entre dos puntos de la imagen.';list.append(p);}for(const m of measures){const div=document.createElement('div');div.className='measurement-item';const label=document.createElement('span');label.textContent=measurement(m);const b=document.createElement('button');b.textContent='×';b.setAttribute('aria-label','Eliminar medida de '+measurement(m));b.onclick=()=>{active().measures=active().measures.filter(x=>x!==m);renderMeasurements();draw();};div.append(label,b);list.append(div);}$('measurement-note').textContent=image().spacing?'Distancias según la escala DICOM. Orientativas; la proyección puede distorsionar tamaños.':'El archivo no declara una escala calibrada. Las distancias se muestran en píxeles.';}
function select(index){state.index=index;const im=image();state.frame=0;setLoaded(true);$('meta-size').textContent=`${im.width} × ${im.height}`;$('meta-bits').textContent=`${im.bitsStored} bits`;$('meta-modality').textContent=im.modality||'—';$('meta-spacing').textContent=im.spacing?`${im.spacing[0].toLocaleString('es-ES')} mm/px`:'Sin calibrar';$('stage-image-label').textContent=`IMAGEN ${index+1} / ${state.items.length}`;$('stage-image-size').textContent=`${im.width} × ${im.height} px · ${im.bitsStored} bits`;$('image-count').textContent=state.items.length;$('status-text').textContent=`${state.items.length} imagen${state.items.length===1?'':'es'} · Procesadas localmente`;$('frames-control').hidden=im.frames<=1;$('frame-range').max=im.frames;$('frame-range').value=1;$('frame-value').textContent=`1 / ${im.frames}`;document.querySelectorAll('.image-card').forEach((c,i)=>{c.classList.toggle('active',i===index);c.setAttribute('aria-pressed',String(i===index));});resize();resetView();renderMeasurements();if(im.warnings?.length)toast(im.warnings.join(' '),true);}
function addCard(item,index){const button=document.createElement('button');button.className='image-card';button.setAttribute('aria-label',`Abrir imagen ${index+1}`);const wrap=document.createElement('div');wrap.className='thumb-wrap';const thumb=document.createElement('canvas');const ratio=Math.min(160/item.image.width,120/(item.image.height*(item.image.spacing?item.image.spacing[0]/item.image.spacing[1]:1)));thumb.width=Math.max(1,Math.round(item.image.width*ratio));thumb.height=Math.max(1,Math.round(item.image.height*ratio*(item.image.spacing?item.image.spacing[0]/item.image.spacing[1]:1)));const tmp=document.createElement('canvas');tmp.width=item.image.width;tmp.height=item.image.height;tmp.getContext('2d').putImageData(new ImageData(DicomEngine.rasterize(item.image,{center:item.image.defaultCenter,width:item.image.defaultWidth}),item.image.width,item.image.height),0,0);thumb.getContext('2d').drawImage(tmp,0,0,thumb.width,thumb.height);tmp.width=tmp.height=0;wrap.append(thumb);const h=document.createElement('h3');h.textContent=`Radiografía ${index+1}`;const p=document.createElement('p');p.textContent=`${item.image.modality||'DICOM'} · ${item.image.width} × ${item.image.height}`;button.append(wrap,h,p);button.onclick=()=>select(index);$('image-list').append(button);}
function dicomCandidate(name){const n=name.toLowerCase();return !n.includes('__macosx')&&(n.endsWith('.dcm')||n.endsWith('.dicom')||(/(^|\/)dicom\//.test(n)&&!n.split('/').pop().includes('.')&&!n.endsWith('/')));}
async function unpack(bytes){let total=0,limited=false;const data=await new Promise((resolve,reject)=>fflate.unzip(bytes,{filter:f=>{if(!dicomCandidate(f.name))return false;if(f.originalSize>134217728||total+f.originalSize>268435456){limited=true;return false;}total+=f.originalSize;return true;}},(err,files)=>err?reject(new Error('No se pudo leer el ZIP. Comprueba que no esté dañado ni protegido con contraseña.')):resolve(files)));if(limited)toast('Algunos archivos superan el límite de memoria. Abre menos imágenes a la vez.',true);return Object.entries(data).sort(([a],[b])=>a.localeCompare(b,undefined,{numeric:true})).map(([name,bytes])=>({name,bytes}));}
async function importFiles(fileList) {
  if (state.loading) return;
  const files = Array.from(fileList);
  if (!files.length) return;
  setBusy(true);
  await nextPaint();
  let loaded = 0, errors = [], firstIndex = state.items.length;
  let totalPixels = state.items.reduce((n, x) => n + x.image.pixels.length, 0);
  try {
    for (const file of files) {
      const name = file.name;
      if (name === 'DICOMDIR' || name.startsWith('.')) continue;
      if (files.length > 1 && !dicomCandidate(file.webkitRelativePath || name) && !name.toLowerCase().endsWith('.zip') && name.includes('.')) continue;
      if (file.size > 536870912) {
        errors.push('El archivo supera 512 MB. Abre solo los DICOM que necesites.');
        continue;
      }
      let candidates;
      try {
        $('loading-text').textContent = 'Buscando imágenes DICOM…';
        const bytes = new Uint8Array(await file.arrayBuffer());
        candidates = bytes[0] === 80 && bytes[1] === 75 ? await unpack(bytes) : [{ name, bytes }];
      } catch (error) {
        errors.push(error.message || 'No se pudo leer uno de los archivos.');
        continue;
      }
      for (const candidate of candidates) {
        if (state.items.length >= 50) {
          errors.push('Límite de 50 imágenes por sesión.');
          break;
        }
        try {
          const im = DicomEngine.parse(candidate.bytes);
          if (totalPixels + im.pixels.length > 40000000) throw new Error('Límite de memoria alcanzado. Cierra el estudio antes de abrir más imágenes.');
          const item = { image: im, measures: [] };
          addCard(item, state.items.length);
          state.items.push(item);
          totalPixels += im.pixels.length;
          loaded++;
          $('loading-text').textContent = `Preparando imagen ${loaded}…`;
          await nextPaint();
        } catch (error) {
          errors.push(error.message || 'No se pudo interpretar una imagen.');
        }
      }
    }
    if (loaded) {
      select(firstIndex);
      if (errors.length) toast(`${loaded} imagen${loaded === 1 ? '' : 'es'} abierta${loaded === 1 ? '' : 's'}. ${errors.length} archivo(s) omitido(s): ${[...new Set(errors)].slice(0, 2).join(' ')}`, true);
    } else {
      toast(errors[0] || 'No se han encontrado imágenes DICOM. Selecciona el ZIP original o la carpeta DICOM del pendrive.', true);
    }
  } catch (error) {
    if (loaded && state.items[firstIndex]) select(firstIndex);
    toast(error.message || 'No se pudo abrir el archivo.', true);
  } finally {
    setBusy(false);
    $('file-input').value = '';
    $('folder-input').value = '';
  }
}
function closeStudy(){if(state.loading)return;state.items=[];state.index=-1;state.measure=null;state.drag=null;state.pointers.clear();state.pinch=null;$('image-list').replaceChildren();sourceCanvas.width=sourceCanvas.height=0;setLoaded(false);$('image-count').textContent='0';$('status-text').textContent='Estudio cerrado · Listo para abrir otro';$('measurement-list').replaceChildren();$('toast').hidden=true;resize();}
function downloadPNG(){if(!image())return;const im=image(),rotated=state.angle%180!==0,out=document.createElement('canvas'),g=out.getContext('2d');const displayedHeight=Math.max(1,Math.round(im.height*aspect()));out.width=rotated?displayedHeight:im.width;out.height=rotated?im.width:displayedHeight;g.translate(out.width/2,out.height/2);g.rotate(state.angle*Math.PI/180);g.scale(state.flip?-1:1,aspect());g.drawImage(sourceCanvas,-im.width/2,-im.height/2);out.toBlob(blob=>{if(!blob)return toast('No se pudo exportar la imagen.',true);const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=`radiografia-${state.index+1}${im.frames>1?`-fotograma-${state.frame+1}`:''}.png`;a.click();setTimeout(()=>URL.revokeObjectURL(u),30000);out.width=out.height=0;toast('PNG exportado con los tonos y la orientación actuales, sin mediciones.');},'image/png');}
canvas.addEventListener('wheel',ev=>{if(!image())return;ev.preventDefault();zoomAt(Math.exp(-ev.deltaY*.002),point(ev));},{passive:false});
canvas.addEventListener('pointerdown',ev=>{if(!image()||state.loading)return;canvas.focus();canvas.setPointerCapture(ev.pointerId);const p=point(ev);state.pointers.set(ev.pointerId,p);if(state.pointers.size===2){const [a,b]=[...state.pointers.values()];state.pinch={distance:Math.hypot(a.x-b.x,a.y-b.y),mid:{x:(a.x+b.x)/2,y:(a.y+b.y)/2}};state.drag=null;state.measure=null;draw();return;}if(state.pointers.size>1)return;state.drag={p,x:state.x,y:state.y,center:state.center,width:state.width,mode:ev.button===1||ev.button===2?'pan':state.mode};if(state.drag.mode==='measure'){const q=toImage(p);if(within(q))state.measure={a:clampPoint(q),b:clampPoint(q),frame:state.frame};}ev.preventDefault();});
canvas.addEventListener('pointermove',ev=>{if(!image()||!state.pointers.has(ev.pointerId))return;const p=point(ev);state.pointers.set(ev.pointerId,p);if(state.pointers.size>=2&&state.pinch){const [a,b]=[...state.pointers.values()],dist=Math.hypot(a.x-b.x,a.y-b.y),mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};zoomAt(dist/Math.max(1,state.pinch.distance),state.pinch.mid);state.x+=mid.x-state.pinch.mid.x;state.y+=mid.y-state.pinch.mid.y;state.pinch={distance:dist,mid};draw();return;}const d=state.drag;if(!d)return;const dx=p.x-d.p.x,dy=p.y-d.p.y;if(d.mode==='pan'){state.x=d.x+dx;state.y=d.y+dy;draw();}else if(d.mode==='window'){const span=Math.max(1,image().max-image().min);state.center=d.center+dy*span/450;state.width=Math.max(1,Math.min(span*10,d.width*Math.exp(dx/200)));requestRaster();}else if(state.measure){state.measure.b=clampPoint(toImage(p));draw();}});
function pointerEnd(ev){if(state.measure&&ev.type==='pointerup'){if(Math.hypot(state.measure.a.x-state.measure.b.x,state.measure.a.y-state.measure.b.y)*state.zoom>3){active().measures.push(state.measure);toast(measurement(state.measure)+(image().spacing?' · Distancia orientativa según DICOM':' · Sin escala calibrada'));renderMeasurements();}}state.measure=null;state.drag=null;state.pointers.delete(ev.pointerId);state.pinch=null;draw();}
canvas.addEventListener('pointerup',pointerEnd);canvas.addEventListener('pointercancel',pointerEnd);canvas.addEventListener('contextmenu',ev=>ev.preventDefault());
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));
['open-button','welcome-open'].forEach(id=>$(id).onclick=()=>$('file-input').click());$('open-folder').onclick=()=>$('folder-input').click();$('file-input').onchange=e=>importFiles(e.target.files);$('folder-input').onchange=e=>importFiles(e.target.files);
$('close-study').onclick=closeStudy;$('rotate-button').onclick=()=>{state.angle=(state.angle+90)%360;fit();};$('flip-button').onclick=()=>{state.flip=!state.flip;draw();};$('invert-button').onclick=()=>{state.invert=!state.invert;rasterize();};$('reset-button').onclick=resetView;$('original-button').onclick=resetTones;
['fit-button','fit-side'].forEach(id=>$(id).onclick=fit);$('actual-size').onclick=()=>{state.zoom=1;state.x=state.y=0;draw();};$('zoom-in').onclick=()=>zoomAt(1.25);$('zoom-out').onclick=()=>zoomAt(.8);$('full-button').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await stage.requestFullscreen();}catch{toast('Este navegador no admite pantalla completa.');}};
$('center-range').oninput=()=>{state.center=Number($('center-range').max)+Number($('center-range').min)-Number($('center-range').value);requestRaster();};$('width-range').oninput=()=>{const max=Math.max((image().max-image().min)*3,image().defaultWidth*2,2);state.width=Math.exp((1-Number($('width-range').value)/1000)*Math.log(max));requestRaster();};
$('auto-button').onclick=()=>{const im=image(),hist=new Uint32Array(4096),span=Math.max(1,im.max-im.min),offset=state.frame*im.width*im.height,count=im.width*im.height;for(let i=0;i<count;i+=3)hist[Math.min(4095,Math.max(0,Math.floor((im.pixels[offset+i]-im.min)/span*4095)))]++;const n=Math.ceil(count/3);let sum=0,lo=0,hi=4095;for(let i=0;i<hist.length;i++){sum+=hist[i];if(sum<n*.01)lo=i;if(sum<n*.99)hi=i;}state.width=Math.max(1,(hi-lo)/4095*span);state.center=im.min+(lo+hi)/8190*span;rasterize();};
$('frame-range').oninput=()=>{state.frame=Number($('frame-range').value)-1;state.measure=null;$('frame-value').textContent=`${state.frame+1} / ${image().frames}`;rasterize();renderMeasurements();};$('clear-measures').onclick=()=>{if(!active())return;active().measures=active().measures.filter(m=>m.frame!==state.frame);renderMeasurements();draw();};$('export-button').onclick=downloadPNG;
$('help-button').onclick=()=>$('help-dialog').showModal();$('help-close').onclick=()=>$('help-dialog').close();$('help-dialog').addEventListener('click',e=>{if(e.target===$('help-dialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});
window.addEventListener('keydown',ev=>{if($('help-dialog').open||/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)||ev.ctrlKey||ev.metaKey||ev.altKey)return;if(ev.key==='Escape'){state.measure=null;state.drag=null;draw();return;}if(!image())return;const key=ev.key.toLowerCase();if(key==='m')setMode('pan');else if(key==='b')setMode('window');else if(key==='d')setMode('measure');else if(key==='i')$('invert-button').click();else if(key==='r')$('rotate-button').click();else if(key==='0')resetView();else if(key==='+'||key==='=')zoomAt(1.25);else if(key==='-')zoomAt(.8);else return;ev.preventDefault();});
window.addEventListener('dragenter',ev=>{if(!ev.dataTransfer?.types.includes('Files'))return;ev.preventDefault();dragDepth++;$('drag-overlay').hidden=false;});window.addEventListener('dragover',ev=>{if(ev.dataTransfer?.types.includes('Files')){ev.preventDefault();ev.dataTransfer.dropEffect='copy';}});window.addEventListener('dragleave',ev=>{if(!ev.dataTransfer?.types.includes('Files'))return;if(--dragDepth<=0){dragDepth=0;$('drag-overlay').hidden=true;}});window.addEventListener('drop',ev=>{ev.preventDefault();dragDepth=0;$('drag-overlay').hidden=true;if(ev.dataTransfer?.files.length)importFiles(ev.dataTransfer.files);});
new ResizeObserver(resize).observe(stage);setLoaded(false);
if(location.protocol!=='file:'&&typeof loadRepositoryStudy==='function'){loadRepositoryStudy().then(file=>{if(file)importFiles([file]);}).catch(error=>toast(error.message||'No se pudo descargar el estudio público.',true));}
