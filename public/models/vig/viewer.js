/* VIG 3D viewer. Self-contained WebGL; no CDN, tracking, fonts or dependencies.
 * Reads the indexed meshes and metallic-roughness materials from the embedded
 * GLB files. Procedural HDR studio reflections keep the preview fully offline.
 */
(() => {
'use strict';
const $ = id => document.getElementById(id);
const canvas = $('scene');
const params = new URLSearchParams(location.search);
const embed = params.get('embed') === '1';
if (embed) {
 document.body.classList.add('embed');
 canvas.removeAttribute('tabindex');
 canvas.setAttribute('aria-label','Animované 3D logo Vienna Insurance Group');
}
if (params.get('bg') === 'light') document.body.classList.add('light');
const showcaseLighting = params.get('lighting') === 'showcase';
const defaultYaw = showcaseLighting ? -.14 : -.33;
const defaultPitch = showcaseLighting ? .06 : .12;
const renderScale = params.get('quality') === 'high' ? 1.25 : 1;
const motionMedia = matchMedia('(prefers-reduced-motion: reduce)');
const assets = JSON.parse($('model-data').textContent);
let gl;
try { gl = canvas.getContext('webgl', { alpha:true, antialias:true, premultipliedAlpha:false, preserveDrawingBuffer:true }); }
catch (_) { gl = null; }
if (!gl) {
  $('loading').textContent = 'Statický náhled · WebGL není dostupné. 3D model je v souboru GLB.';
  $('loading').classList.add('failed');
}
const state = { yaw:defaultYaw, pitch:defaultPitch, zoom:1, auto:!motionMedia.matches && params.get('spin') !== '0',
  variant:params.get('model') === 'symbol' ? 'symbol' : 'full', visible:true, ready:false,
  tyaw:defaultYaw, tpitch:defaultPitch, tzoom:1, frame:0, start:performance.now(), disposed:false };
if (params.get('view') === 'front') state.yaw = state.tyaw = state.pitch = state.tpitch = 0;

function decodeGLB(base64) {
  const str = atob(base64), bytes = new Uint8Array(str.length);
  for (let i=0; i<str.length; i++) bytes[i]=str.charCodeAt(i);
  const view = new DataView(bytes.buffer);
  if (view.getUint32(0,true)!==0x46546c67 || view.getUint32(4,true)!==2) throw Error('Neplatný GLB 2.0.');
  const len=view.getUint32(12,true);
  const json=JSON.parse(new TextDecoder().decode(bytes.subarray(20,20+len)));
  const binOffset=20+len+8;
  const component={5126:Float32Array,5123:Uint16Array,5125:Uint32Array};
  function accessor(id) {
    const a=json.accessors[id], b=json.bufferViews[a.bufferView], C=component[a.componentType];
    if (!C || b.byteStride) throw Error('Nepodporovaný formát bufferu.');
    const size={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type];
    return new C(bytes.buffer,binOffset+(b.byteOffset||0)+(a.byteOffset||0),a.count*size);
  }
  return { bytes, json, accessor };
}
const models = {};
function getModel(which) { return models[which] || (models[which]=decodeGLB(assets[which])); }
function saveBlob(blob,name) {
  const a=document.createElement('a'), url=URL.createObjectURL(blob);
  a.href=url; a.download=name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1500);
}
$('download').addEventListener('click',()=>{
  try { saveBlob(new Blob([getModel(state.variant).bytes],{type:'model/gltf-binary'}),state.variant==='full'?'vig-metal.glb':'vig-symbol-metal.glb'); }
  catch(e) { $('status').textContent=e.message; }
});
function toggleTheme(){
 const light=document.body.classList.toggle('light');
 $('theme').setAttribute('aria-pressed',String(light));$('theme-label').textContent=light?'Tmavé pozadí':'Světlé pozadí';
}
$('theme').addEventListener('click',toggleTheme);
$('theme').setAttribute('aria-pressed',String(document.body.classList.contains('light')));
$('theme-label').textContent=document.body.classList.contains('light')?'Tmavé pozadí':'Světlé pozadí';
if (!gl) {
 document.body.classList.add('no-webgl');canvas.hidden=true;$('poster').hidden=false;
 function fallbackModel(which){
  state.variant=which;$('poster').src=assets[which==='full'?'posterFull':'posterSymbol'];
  document.querySelectorAll('[data-model]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.model===which)));
  $('stats').textContent=which==='full'?'29 těles · 26 724 trojúhelníků · 647 kB':'8 těles · 12 160 trojúhelníků · 275 kB';
  $('status').textContent='GLB 2.0 / '+(which==='full'?'celé logo':'VIG + znak');
 }
 document.querySelectorAll('[data-model]').forEach(b=>b.addEventListener('click',()=>fallbackModel(b.dataset.model)));
 ['front','reset','motion'].forEach(id=>{$(id).disabled=true;$(id).title='Vyžaduje WebGL';});
 $('motion').setAttribute('aria-pressed','false');$('motion-label').textContent='Statický náhled';
 fallbackModel(state.variant);return;
}

const vertexSource = `
precision highp float;
attribute vec3 aPosition;
attribute vec3 aNormal;
uniform mat4 uModel;
uniform mat4 uProjection;
uniform float uDistance;
varying vec3 vPosition;
varying vec3 vNormal;
varying vec3 vLocal;
void main(){
 vec4 p=uModel*vec4(aPosition,1.0);
 vPosition=p.xyz; vNormal=mat3(uModel)*aNormal; vLocal=aPosition;
 p.z-=uDistance; gl_Position=uProjection*p;
}`;
const fragmentSource = `
precision highp float;
varying vec3 vPosition;
varying vec3 vNormal;
varying vec3 vLocal;
uniform vec3 uBase;
uniform float uMetal;
uniform float uRough;
uniform float uDistance;
const float PI=3.14159265359;
float panel(vec3 d, vec3 center, vec2 size, float blur){
 vec3 forward=normalize(center);
 vec3 right=normalize(cross(vec3(0.0,1.0,0.0),forward));
 vec3 up=cross(forward,right);
 float z=dot(d,forward);
 if(z<=0.0) return 0.0;
 vec2 p=vec2(dot(d,right),dot(d,up))/z;
 vec2 mask=1.0-smoothstep(size-vec2(blur),size+vec2(blur),abs(p));
 return mask.x*mask.y;
}
vec3 studio(vec3 d,float r){
 float b=0.018+r*r*.75;
 if (${showcaseLighting ? 'true' : 'false'}) {
  // A dark, neutral studio keeps the silver reflective rather than uniformly white.
  vec3 e=mix(vec3(.012,.013,.015),vec3(.11,.115,.12),smoothstep(-.70,.90,d.y));
  e+=vec3(.16)*panel(d,vec3(.10,.05,1.0),vec2(.95,.90),b*3.0);
  // A tall key light travels across the faces as the model turns.
  vec3 sweep=vec3(.987*d.x+.16*d.y,-.16*d.x+.987*d.y,d.z);
  e+=vec3(3.5,3.42,3.3)*panel(sweep,vec3(-.32,.10,1.0),vec2(.17,1.05),b*2.0);
  // Overhead, edge and lower bounce lights reveal the bevels and extrusion.
  e+=vec3(2.6,2.65,2.7)*panel(d,vec3(.05,.65,1.0),vec2(1.15,.16),b*2.5);
  e+=vec3(3.5,3.65,3.8)*panel(d,vec3(.90,.05,.55),vec2(.13,.95),b*1.5);
  e+=vec3(1.05,1.08,1.12)*panel(d,vec3(0.0,-.55,1.0),vec2(.85,.10),b*2.0);
  e+=vec3(2.1,2.2,2.3)*panel(d,vec3(.25,.30,-1.0),vec2(.70,.55),b*2.0);
  // A black studio flag gives the metal a soft dark-to-bright reflection boundary.
  e*=1.0-.86*panel(d,vec3(.10,-.12,1.0),vec2(1.05,.085),b*2.0);
  return e;
 }
 vec3 e=mix(vec3(.06,.065,.075),vec3(.46,.49,.55),smoothstep(-.65,.95,d.y));
 // A large overhead softbox, two tall strip lights and a lower bounce card.
 e+=vec3(2.9,3.05,3.30)*panel(d,vec3(-.30,.72,1.0),vec2(.95,.20),b);
 e+=vec3(2.5,2.45,2.35)*panel(d,vec3(-.95,-.10,1.0),vec2(.20,1.00),b);
 e+=vec3(2.3,2.5,2.85)*panel(d,vec3(.92,.25,.70),vec2(.18,.95),b);
 e+=vec3(1.50,1.54,1.62)*panel(d,vec3(-.12,-.42,1.0),vec2(1.00,.12),b*1.4);
 e+=vec3(.8,.82,.87)*panel(d,vec3(.15,.15,1.0),vec2(.70,.85),b*1.8);
 e+=vec3(.95,.92,.88)*panel(d,vec3(.2,.2,-1.0),vec2(.8,.6),b*2.0);
 // Near-black negative fill creates a legible dark-to-light sweep in metal.
 e*=1.0-.85*panel(d,vec3(-.55,-.23,1.0),vec2(1.05,.052),b*.85);
 return e;
}
vec3 fresnel(float c,vec3 f0){return f0+(1.0-f0)*pow(1.0-c,5.0);}
vec3 directLight(vec3 n,vec3 v,vec3 l,vec3 radiance,vec3 f0,float rough){
 vec3 h=normalize(v+l);
 float nl=max(dot(n,l),0.0),nv=max(dot(n,v),.001),nh=max(dot(n,h),0.0),vh=max(dot(v,h),0.0);
 float a=rough*rough, a2=a*a;
 float denom=nh*nh*(a2-1.0)+1.0;
 float D=a2/max(PI*denom*denom,.00001);
 float k=(rough+1.0)*(rough+1.0)/8.0;
 float gv=nv/(nv*(1.0-k)+k),gl=nl/(nl*(1.0-k)+k);
 vec3 F=fresnel(vh,f0);
 vec3 spec=D*gv*gl*F/max(4.0*nl*nv,.001);
 vec3 diffuse=(1.0-F)*(1.0-uMetal)*uBase/PI;
 return (diffuse+spec)*radiance*nl;
}
vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.0,1.0);}
vec3 linearToSRGB(vec3 c){return mix(12.92*c,1.055*pow(max(c,vec3(0.0)),vec3(1.0/2.4))-.055,step(vec3(.0031308),c));}
void main(){
 vec3 n=normalize(vNormal);
 vec3 v=normalize(vec3(0.0,0.0,uDistance)-vPosition);
 float nv=max(dot(n,v),0.0);
 float rough=clamp(uRough*${showcaseLighting ? '.88' : '1.0'},.09,.9);
 vec3 f0=mix(vec3(.04),uBase,uMetal);
 vec3 reflected=reflect(-v,n);
 vec3 F=fresnel(nv,f0);
 vec3 color=studio(reflected,rough)*F*(1.0-.28*rough);
 color+=uBase*.065;
 color+=directLight(n,v,normalize(vec3(-3.5,6.0,5.0)),vec3(2.8,2.7,2.55),f0,rough);
 color+=directLight(n,v,normalize(vec3(4.5,1.5,3.0)),vec3(1.25,1.38,1.6),f0,rough);
 color+=directLight(n,v,normalize(vec3(-1.0,-2.8,2.0)),vec3(.45,.47,.5),f0,rough);
 gl_FragColor=vec4(linearToSRGB(aces(color*${showcaseLighting ? '1.05' : '.97'})),1.0);
}`;
function shader(type,source){
 const s=gl.createShader(type); gl.shaderSource(s,source);gl.compileShader(s);
 if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(s));
 return s;
}
let program, meshBuffers=[], bounds=[10,4.55];
try {
 program=gl.createProgram();
 gl.attachShader(program,shader(gl.VERTEX_SHADER,vertexSource));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fragmentSource));gl.linkProgram(program);
 if(!gl.getProgramParameter(program,gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program));
} catch(e){ $('loading').textContent='3D vykreslení se nepodařilo: '+e.message; return; }
const loc={};
['uModel','uProjection','uDistance','uBase','uMetal','uRough'].forEach(n=>loc[n]=gl.getUniformLocation(program,n));
['aPosition','aNormal'].forEach(n=>loc[n]=gl.getAttribLocation(program,n));
gl.useProgram(program);gl.enable(gl.DEPTH_TEST);gl.enable(gl.CULL_FACE);gl.cullFace(gl.BACK);gl.clearColor(0,0,0,0);

function loadVariant(which){
 try {
  const model=getModel(which);
  meshBuffers.forEach(m=>{gl.deleteBuffer(m.p);gl.deleteBuffer(m.n);gl.deleteBuffer(m.i);});meshBuffers=[];
  let min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for (const mesh of model.json.meshes) for (const primitive of mesh.primitives){
   const pos=model.accessor(primitive.attributes.POSITION), normals=model.accessor(primitive.attributes.NORMAL), ids=model.accessor(primitive.indices);
   const accessor=model.json.accessors[primitive.attributes.POSITION];
   for(let k=0;k<3;k++){min[k]=Math.min(min[k],accessor.min[k]);max[k]=Math.max(max[k],accessor.max[k]);}
   const upload=(target,data)=>{const b=gl.createBuffer();gl.bindBuffer(target,b);gl.bufferData(target,data,gl.STATIC_DRAW);return b;};
   meshBuffers.push({p:upload(gl.ARRAY_BUFFER,pos),n:upload(gl.ARRAY_BUFFER,normals),i:upload(gl.ELEMENT_ARRAY_BUFFER,ids),count:ids.length,
     type:ids.BYTES_PER_ELEMENT===2?gl.UNSIGNED_SHORT:gl.UNSIGNED_INT,mat:model.json.materials[primitive.material].pbrMetallicRoughness});
  }
  bounds=[max[0]-min[0],max[1]-min[1]];
  state.variant=which; state.zoom=state.tzoom=1;
  document.querySelectorAll('[data-model]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.model===which)));
  $('stats').textContent=which==='full'?'29 těles · 26 724 trojúhelníků · 647 kB':'8 těles · 12 160 trojúhelníků · 275 kB';
  $('status').textContent='GLB 2.0 / '+(which==='full'?'celé logo':'VIG + znak');
  $('loading').hidden=true;state.ready=true;
  requestDraw();
 } catch(e){ $('loading').hidden=false;$('loading').textContent='Model se nepodařilo načíst: '+e.message;console.error(e); }
}
function matrix(yaw,pitch){
 const cy=Math.cos(yaw),sy=Math.sin(yaw),cx=Math.cos(pitch),sx=Math.sin(pitch);
 return new Float32Array([cy,0,-sy,0,sy*sx,cx,cy*sx,0,sy*cx,-sx,cy*cx,0,0,0,0,1]);
}
function projection(aspect){
 const f=1/Math.tan(32*Math.PI/360),near=.1,far=150;
 return new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(far+near)/(near-far),-1,0,0,2*far*near/(near-far),0]);
}
function render(now=performance.now(),fixed=false){
 state.frame=0;
 if (!state.ready || state.disposed || !state.visible) return;
 const rect=canvas.getBoundingClientRect(),pixelRatio=Math.min((devicePixelRatio||1)*renderScale,2.5);
 const width=Math.max(1,Math.round(rect.width*pixelRatio)),height=Math.max(1,Math.round(rect.height*pixelRatio));
 if(canvas.width!==width || canvas.height!==height){canvas.width=width;canvas.height=height;}
 gl.viewport(0,0,width,height);
 if(!fixed){
  state.yaw+=(state.tyaw-state.yaw)*.13;state.pitch+=(state.tpitch-state.pitch)*.13;state.zoom+=(state.tzoom-state.zoom)*.13;
 }
 const t=(now-state.start)*.001;
 const yaw=state.yaw+(state.auto&&!fixed?Math.sin(t*(showcaseLighting ? .64 : .42))*(showcaseLighting ? .16 : .32):0);
 const pitch=state.pitch+(state.auto&&!fixed?Math.sin(t*(showcaseLighting ? .48 : .31))*(showcaseLighting ? .035 : .055):0);
 const aspect=width/height, tan=Math.tan(32*Math.PI/360);
 const distance=Math.max(bounds[0]/(2*tan*aspect),bounds[1]/(2*tan))*1.22*state.zoom;
 gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(program);
 gl.uniformMatrix4fv(loc.uModel,false,matrix(yaw,pitch));gl.uniformMatrix4fv(loc.uProjection,false,projection(aspect));gl.uniform1f(loc.uDistance,distance);
 for(const m of meshBuffers){
  gl.bindBuffer(gl.ARRAY_BUFFER,m.p);gl.enableVertexAttribArray(loc.aPosition);gl.vertexAttribPointer(loc.aPosition,3,gl.FLOAT,false,0,0);
  gl.bindBuffer(gl.ARRAY_BUFFER,m.n);gl.enableVertexAttribArray(loc.aNormal);gl.vertexAttribPointer(loc.aNormal,3,gl.FLOAT,false,0,0);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,m.i);
  gl.uniform3fv(loc.uBase,m.mat.baseColorFactor.slice(0,3));gl.uniform1f(loc.uMetal,m.mat.metallicFactor);gl.uniform1f(loc.uRough,m.mat.roughnessFactor);
  gl.drawElements(gl.TRIANGLES,m.count,m.type,0);
 }
 const moving=Math.abs(state.tyaw-state.yaw)+Math.abs(state.tpitch-state.pitch)+Math.abs(state.tzoom-state.zoom)>.00008;
 if(!fixed && (state.auto||moving)) requestDraw();
}
function requestDraw(){if(!state.frame&&!state.disposed&&state.visible)state.frame=requestAnimationFrame(render);}
function motionButton(){
 $('motion').setAttribute('aria-pressed',String(state.auto));
 $('motion-label').textContent=state.auto?'Pohyb zapnutý':'Pohyb vypnutý';
}
function stopAuto(){state.auto=false;motionButton();}
$('motion').addEventListener('click',()=>{state.auto=!state.auto;state.start=performance.now();motionButton();requestDraw();});
$('front').addEventListener('click',()=>{stopAuto();state.tyaw=0;state.tpitch=0;state.tzoom=1;requestDraw();});
$('reset').addEventListener('click',()=>{state.tyaw=defaultYaw;state.tpitch=defaultPitch;state.tzoom=1;requestDraw();});
document.querySelectorAll('[data-model]').forEach(b=>b.addEventListener('click',()=>loadVariant(b.dataset.model)));

// The profile embed is an autonomous display; only the standalone viewer has controls.
if (!embed) {
const pointers=new Map();let pinch=0;
canvas.addEventListener('pointerdown',e=>{
 canvas.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
 stopAuto();canvas.classList.add('dragging');
 if(pointers.size===2){const a=[...pointers.values()];pinch=Math.hypot(a[1].x-a[0].x,a[1].y-a[0].y);}
});
canvas.addEventListener('pointermove',e=>{
 const old=pointers.get(e.pointerId);if(!old)return;
 const dx=e.clientX-old.x,dy=e.clientY-old.y;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
 if(pointers.size===1){state.tyaw+=dx*.008;state.tpitch=Math.max(-1.4,Math.min(1.4,state.tpitch+dy*.007));}
 else{const a=[...pointers.values()];const d=Math.hypot(a[1].x-a[0].x,a[1].y-a[0].y);if(pinch>0&&d>0)state.tzoom=Math.max(.62,Math.min(2,state.tzoom*pinch/d));pinch=d;}
 requestDraw();
});
function pointerEnd(e){pointers.delete(e.pointerId);if(!pointers.size)canvas.classList.remove('dragging');pinch=0;}
['pointerup','pointercancel','lostpointercapture'].forEach(name=>canvas.addEventListener(name,pointerEnd));
canvas.addEventListener('wheel',e=>{e.preventDefault();state.tzoom=Math.max(.62,Math.min(2,state.tzoom*Math.exp(e.deltaY*.001)));requestDraw();},{passive:false});
canvas.addEventListener('keydown',e=>{
 const actions={ArrowLeft:()=>state.tyaw-=.1,ArrowRight:()=>state.tyaw+=.1,ArrowUp:()=>state.tpitch=Math.max(-1.4,state.tpitch-.1),ArrowDown:()=>state.tpitch=Math.min(1.4,state.tpitch+.1),
 '+':()=>state.tzoom=Math.max(.62,state.tzoom*.9),'-':()=>state.tzoom=Math.min(2,state.tzoom*1.1),Home:()=>{state.tyaw=defaultYaw;state.tpitch=defaultPitch;state.tzoom=1;}};
 if(actions[e.key]){e.preventDefault();stopAuto();actions[e.key]();requestDraw();}
});
}
new ResizeObserver(requestDraw).observe(canvas);
document.addEventListener('visibilitychange',()=>{state.visible=!document.hidden;if(state.visible)requestDraw();});
const observer=new IntersectionObserver(entries=>{state.visible=entries[0].isIntersecting&&!document.hidden;if(state.visible)requestDraw();});observer.observe(canvas);
motionMedia.addEventListener('change',e=>{if(e.matches){stopAuto();requestDraw();}});
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();state.ready=false;$('loading').hidden=false;$('loading').textContent='Grafický kontext byl přerušen. Obnovte stránku.';});
window.addEventListener('pagehide',()=>{state.disposed=true;cancelAnimationFrame(state.frame);state.frame=0;observer.disconnect();});
window.addEventListener('pageshow',()=>{state.disposed=false;state.visible=!document.hidden;observer.observe(canvas);requestDraw();});
// Narrow test/screenshot interface. No remote requests or application state access.
window.vigViewer={
 setView:(yaw,pitch,zoom=1)=>{stopAuto();state.yaw=state.tyaw=yaw;state.pitch=state.tpitch=pitch;state.zoom=state.tzoom=zoom;render(performance.now(),true);},
 render:()=>render(performance.now(),true),setModel:loadVariant,
 get ready(){return state.ready;},get variant(){return state.variant;},
 capture:()=>{render(performance.now(),true);return canvas.toDataURL('image/png');}
};
motionButton();loadVariant(state.variant);
})();
