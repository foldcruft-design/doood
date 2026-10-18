'use strict';
const $=s=>document.querySelector(s),v=$('#v'),cv=$('#cv');
const LS={get:(k,d)=>{try{return JSON.parse(localStorage.getItem(k))??d}catch(e){return d}},set:(k,x)=>{try{localStorage.setItem(k,JSON.stringify(x))}catch(e){}}};
const toast=t=>{const e=$('#toast');e.textContent=t;e.classList.add('on');clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.remove('on'),3200)};
const fmt=s=>Math.floor(s/60)+':'+String(Math.floor(s%60)).padStart(2,'0'),mb=b=>(b/1048576).toFixed(1)+' МБ';

/* ---- сравнение «было / стало» ---- */
$('#cmpR').oninput=e=>{const x=e.target.value;$('#cmpB').style.clipPath=`inset(0 0 0 ${x}%)`;$('#cmp').style.setProperty('--x',x+'%')};

/* ---- чек-лист (сохраняется в браузере) ---- */
const ck=LS.get('lumen.chk',{});
function chk(){const all=[...document.querySelectorAll('#chk input')],n=all.filter(i=>i.checked).length;
 $('#chkBar').style.width=n/all.length*100+'%';$('#chkT').textContent=n===all.length?'Всё готово, можно публиковать ✓':`Выполнено ${n} из ${all.length}`}
document.querySelectorAll('#chk input').forEach(i=>{i.checked=!!ck[i.dataset.k];i.onchange=()=>{ck[i.dataset.k]=i.checked;LS.set('lumen.chk',ck);chk()}});chk();

/* ---- личная статистика ---- */
const st=LS.get('lumen.stats',{n:0,b:0});
const showStats=()=>{$('#st1').textContent=st.n;$('#st2').textContent=mb(st.b)};showStats();

/* ---- параметры ---- */
const P={tiktok:{w:1080,h:1920,br:16,n:'TikTok'},reels:{w:1080,h:1920,br:16,n:'Reels'},shorts:{w:1080,h:1920,br:16,n:'Shorts'},yt:{w:1920,h:1080,br:24,n:'YouTube'},sq:{w:1080,h:1080,br:12,n:'Квадрат'}};
const SL=[['sh','Резкость',0,100,55,'%'],['dn','Шумоподавление',0,100,30,'%'],['ct','Контраст',-20,40,8,''],['sa','Насыщенность',-30,60,10,''],['br','Яркость',-20,20,0,''],['gr','Зерно против блоков',0,100,20,'%']];
const V={};let cur='tiktok',fit='fill',url=null,dirty=true,orig=false,lv={b:0,w:1,e:0},busy=false,cancelled=false,rec=null,chunks=[],frame=0,outBlob=null,ext='mp4',AU=null,wl=null,tm=0,srcSize=0,outUrl=null;
$('#presets').innerHTML=Object.entries(P).map(([k,p])=>`<button class="chip" data-p="${k}">${p.n}</button>`).join('');
$('#fitrow').innerHTML='<span class="meta">Кадр:</span><button class="chip" data-f="fill">Заполнить</button><button class="chip" data-f="fit">Вписать + размытый фон</button>';
$('#sliders').innerHTML=SL.map(([k,n,a,b,d])=>`<div class="sl"><label>${n}<output id="o_${k}"></output></label><input type="range" id="s_${k}" min="${a}" max="${b}" value="${d}"></div>`).join('');
SL.forEach(([k,,,,,u])=>{const s=$('#s_'+k),up=()=>{V[k]=+s.value;$('#o_'+k).textContent=(s.value>0&&!u?'+':'')+s.value+u;dirty=true};s.oninput=up;up()});
function sync(){document.querySelectorAll('[data-p]').forEach(b=>b.classList.toggle('sel',b.dataset.p===cur));document.querySelectorAll('[data-f]').forEach(b=>b.classList.toggle('sel',b.dataset.f===fit));
 const p=P[cur];cv.width=p.w;cv.height=p.h;cv.style.aspectRatio=p.w+'/'+p.h;gl&&gl.viewport(0,0,p.w,p.h);dirty=true}
$('#presets').onclick=e=>{const k=e.target.dataset.p;if(!k||busy)return;cur=k;$('#br').value=String(P[k].br);sync()};
$('#fitrow').onclick=e=>{const k=e.target.dataset.f;if(!k||busy)return;fit=k;sync()};
$('#auto').onchange=()=>{if(v.videoWidth)levels();dirty=true};

/* ---- WebGL-движок ---- */
const gl=cv.getContext('webgl',{preserveDrawingBuffer:true,alpha:false,antialias:false}),U={};
if(!gl)toast('Нужен браузер с поддержкой WebGL');else{
const mk=(t,s)=>{const x=gl.createShader(t);gl.shaderSource(x,s);gl.compileShader(x);return x},pr=gl.createProgram();
gl.attachShader(pr,mk(gl.VERTEX_SHADER,'attribute vec2 p;varying vec2 uv;void main(){uv=p*.5+.5;gl_Position=vec4(p,0.,1.);}'));
gl.attachShader(pr,mk(gl.FRAGMENT_SHADER,`precision highp float;varying vec2 uv;uniform sampler2D t;uniform vec2 px,asp;
uniform float on,sh,dn,ct,sa,br,gr,fr,lb,lw,fit;
float h(vec2 s){return fract(sin(dot(s,vec2(12.9898,78.233)))*43758.5453);}
vec3 S(vec2 u){return texture2D(t,u).rgb;}
void main(){float va=asp.x,oa=asp.y;vec2 p=uv-.5;
 vec2 uc=p*vec2(min(1.,oa/va),min(1.,va/oa))+.5,uf=p*vec2(max(1.,oa/va),max(1.,va/oa))+.5;
 bool o=fit>.5&&(uf.x<0.||uf.x>1.||uf.y<0.||uf.y>1.);vec3 col;
 if(o){vec3 a=vec3(0.);for(int i=0;i<12;i++){float g=float(i)*.5236;a+=S(uc+vec2(cos(g),sin(g))*(i<6?.035:.075));}
  a/=12.;float l=dot(a,vec3(.2126,.7152,.0722));col=mix(vec3(l),a,1.25)*.55;}
 else{vec2 u=fit>.5?uf:uc;vec3 c=S(u);
  if(on>.5){vec3 b=(S(u)*4.+(S(u+vec2(px.x,0.))+S(u-vec2(px.x,0.))+S(u+vec2(0.,px.y))+S(u-vec2(0.,px.y)))*2.+S(u+px)+S(u-px)+S(u+vec2(px.x,-px.y))+S(u+vec2(-px.x,px.y)))/16.;
   vec3 d=c-b;float m=length(d);
   c=mix(c,b,dn*(1.-smoothstep(.01,.06,m)));c+=d*sh*smoothstep(.012,.05,m)*2.;
   c=(c-lb)/max(lw-lb,.05);c=(c-.5)*ct+.5+br;
   float l=dot(c,vec3(.2126,.7152,.0722));c=mix(vec3(l),c,sa);c+=(h(uv*997.+fr)-.5)*gr;}
  col=c;}
 col+=(h(uv*733.+fr*1.7)-.5)/255.;gl_FragColor=vec4(clamp(col,0.,1.),1.);}`));
gl.linkProgram(pr);gl.useProgram(pr);
gl.bindBuffer(gl.ARRAY_BUFFER,gl.createBuffer());gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
const al=gl.getAttribLocation(pr,'p');gl.enableVertexAttribArray(al);gl.vertexAttribPointer(al,2,gl.FLOAT,false,0,0);
['px','asp','on','sh','dn','ct','sa','br','gr','fr','lb','lw','fit'].forEach(n=>U[n]=gl.getUniformLocation(pr,n));
gl.bindTexture(gl.TEXTURE_2D,gl.createTexture());
[[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE],[gl.TEXTURE_MIN_FILTER,gl.LINEAR],[gl.TEXTURE_MAG_FILTER,gl.LINEAR]].forEach(([a,b])=>gl.texParameteri(gl.TEXTURE_2D,a,b));
gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true)}
function draw(){
 if(!gl||!v.videoWidth)return;
 try{gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,v)}catch(e){return}
 const p=P[cur],a=$('#auto').checked;
 gl.uniform2f(U.px,1/v.videoWidth,1/v.videoHeight);gl.uniform2f(U.asp,v.videoWidth/v.videoHeight,p.w/p.h);
 gl.uniform1f(U.on,orig?0:1);gl.uniform1f(U.sh,V.sh/100);gl.uniform1f(U.dn,V.dn/100*.8);
 gl.uniform1f(U.ct,1+V.ct/100);gl.uniform1f(U.sa,1+V.sa/100);gl.uniform1f(U.br,V.br/100+(a?lv.e:0));
 gl.uniform1f(U.gr,V.gr/100*.06);gl.uniform1f(U.fr,(frame++%997)*.37);
 gl.uniform1f(U.lb,a?lv.b:0);gl.uniform1f(U.lw,a?lv.w:1);gl.uniform1f(U.fit,fit==='fit'?1:0);
 gl.drawArrays(gl.TRIANGLE_STRIP,0,4)}
(function loop(){if(dirty||!v.paused){draw();dirty=false}requestAnimationFrame(loop)})();

function levels(){
 const c=document.createElement('canvas');c.width=c.height=96;const x=c.getContext('2d');x.drawImage(v,0,0,96,96);
 const d=x.getImageData(0,0,96,96).data,h=new Array(256).fill(0);let sum=0;
 for(let i=0;i<d.length;i+=4){const l=Math.round(.2126*d[i]+.7152*d[i+1]+.0722*d[i+2]);h[l]++;sum+=l}
 const n=9216;let a=0,lo=0,hi=255;
 for(let i=0;i<256;i++){a+=h[i];if(a>=n*.01){lo=i;break}}a=0;
 for(let i=255;i>=0;i--){a+=h[i];if(a>=n*.01){hi=i;break}}
 const m=sum/n/255;lv={b:Math.min(lo/255,.12),w:Math.max(hi/255,.8),e:Math.max(-.06,Math.min(.1,(.45-m)*.4))};
 $('#lvinfo').textContent=`Авто: чёрный ${Math.round(lv.b*100)}%, белый ${Math.round(lv.w*100)}%, экспозиция ${lv.e>=0?'+':''}${(lv.e*100).toFixed(0)}`}

/* ---- загрузка файла ---- */
const drop=$('#drop');
['dragenter','dragover'].forEach(e=>drop.addEventListener(e,x=>{x.preventDefault();drop.classList.add('on')}));
['dragleave','drop'].forEach(e=>drop.addEventListener(e,x=>{x.preventDefault();drop.classList.remove('on')}));
drop.addEventListener('drop',e=>load(e.dataTransfer.files[0]));$('#file').onchange=e=>load(e.target.files[0]);
$('#swap').onclick=()=>{if(busy)return;v.pause();$('#ws').classList.add('hide');drop.classList.remove('hide');$('#res').classList.add('hide');$('#file').value=''};
function load(f){
 if(!f)return;if(!(f.type||'').startsWith('video/')&&!/\.(mp4|mov|m4v|webm)$/i.test(f.name))return toast('Выберите видеофайл');
 if(url)URL.revokeObjectURL(url);srcSize=f.size;url=URL.createObjectURL(f);
 v.onerror=()=>toast('Не удалось открыть видео. Попробуйте MP4 (H.264)');
 v.onloadedmetadata=()=>{cur=v.videoWidth>v.videoHeight*1.2?'yt':'tiktok';$('#br').value=String(P[cur].br);
  v.addEventListener('seeked',()=>{levels();drop.classList.add('hide');$('#ws').classList.remove('hide');$('#res').classList.add('hide');sync();
   $('#info').textContent=`Исходник: ${v.videoWidth}×${v.videoHeight} · ${fmt(v.duration)} · ${mb(f.size)}`;$('#tool').scrollIntoView({behavior:'smooth'})},{once:true});
  v.currentTime=Math.min(1,v.duration/3)};
 v.src=url}

/* ---- звук и просмотр ---- */
function audio(){if(AU)return AU;const ctx=new(window.AudioContext||window.webkitAudioContext)(),src=ctx.createMediaElementSource(v),dest=ctx.createMediaStreamDestination(),mon=ctx.createGain();
 src.connect(dest);src.connect(mon);mon.connect(ctx.destination);return AU={ctx,dest,mon}}
$('#play').onclick=async()=>{if(busy)return;const A=audio();await A.ctx.resume();A.mon.gain.value=1;
 if(v.paused){if(v.ended)v.currentTime=0;v.play();$('#play').textContent='❚❚ Пауза'}else v.pause()};
v.addEventListener('pause',()=>{if(!busy)$('#play').textContent='▶ Просмотр';dirty=true});v.addEventListener('seeked',()=>dirty=true);
const ob=$('#orig');['pointerdown','pointerup','pointerleave','pointercancel'].forEach(e=>ob.addEventListener(e,x=>{orig=e==='pointerdown';dirty=true}));

/* ---- обработка и запись ---- */
const once=(el,ev)=>new Promise(r=>el.addEventListener(ev,r,{once:true}));
const pickMime=()=>['video/mp4;codecs=avc1.640028,mp4a.40.2','video/mp4;codecs=avc1,mp4a.40.2','video/mp4','video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'].find(m=>window.MediaRecorder&&MediaRecorder.isTypeSupported(m))||'';
function ui(b){busy=b;$('#go').classList.toggle('hide',b);$('#stop').classList.toggle('hide',!b);$('#bar').classList.toggle('hide',!b);$('#pt').classList.toggle('hide',!b);$('#play').disabled=$('#swap').disabled=b}
$('#go').onclick=async()=>{
 if(busy)return;if(!gl||!window.MediaRecorder||!cv.captureStream)return toast('Откройте сайт в Chrome, Edge или Safari 16+');
 const mt=pickMime();if(!mt)return toast('Нет поддерживаемого формата записи');
 ext=mt.startsWith('video/mp4')?'mp4':'webm';cancelled=false;ui(true);$('#res').classList.add('hide');
 try{const A=audio();await A.ctx.resume();A.mon.gain.value=0;
  try{wl=await navigator.wakeLock?.request('screen')}catch(e){}
  v.pause();if(v.currentTime>0){v.currentTime=0;await once(v,'seeked')}
  orig=false;dirty=true;draw();
  const s=cv.captureStream(30);A.dest.stream.getAudioTracks().forEach(t=>s.addTrack(t));chunks=[];
  rec=new MediaRecorder(s,{mimeType:mt,videoBitsPerSecond:+$('#br').value*1e6,audioBitsPerSecond:192000});
  rec.ondataavailable=e=>e.data&&e.data.size&&chunks.push(e.data);rec.onstop=finish;rec.start(1000);
  clearInterval(tm);tm=setInterval(()=>{const f=v.currentTime/v.duration||0;$('#bar i').style.width=f*100+'%';$('#pt').textContent=`Готово ${Math.round(f*100)}% · осталось ~${fmt(Math.max(0,v.duration-v.currentTime))}`},250);
  await v.play()}catch(e){ui(false);clearInterval(tm);toast('Ошибка запуска: '+(e.message||e))}};
v.addEventListener('ended',()=>{if(busy)setTimeout(()=>rec&&rec.state!=='inactive'&&rec.stop(),400)});
$('#stop').onclick=()=>{cancelled=true;v.pause();rec&&rec.state!=='inactive'&&rec.stop()};
function finish(){
 clearInterval(tm);wl&&wl.release&&wl.release().catch(()=>{});AU&&(AU.mon.gain.value=1);ui(false);$('#bar i').style.width='0';v.pause();
 if(cancelled)return toast('Отменено');
 outBlob=new Blob(chunks,{type:rec.mimeType.split(';')[0]});if(outUrl)URL.revokeObjectURL(outUrl);outUrl=URL.createObjectURL(outBlob);
 $('#rv').src=outUrl;const a=$('#save');a.href=outUrl;a.download=`lumen_${cur}.${ext}`;
 const p=P[cur];$('#rinfo').textContent=`${p.w}×${p.h} · ${ext.toUpperCase()} · ${$('#br').value} Мбит/с · ${mb(srcSize)} → ${mb(outBlob.size)}. Файл может быть больше исходника — это нормально.`;
 st.n++;st.b+=srcSize;LS.set('lumen.stats',st);showStats();
 $('#res').classList.remove('hide');$('#res').scrollIntoView({behavior:'smooth',block:'start'});toast('Готово ✓')}
document.addEventListener('visibilitychange',()=>{if(document.hidden&&busy)toast('Вкладка свёрнута — запись может прерваться')});
sync();
