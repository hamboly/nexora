// Controller tests with a small DOM host. These test behavior, not browser CSS rendering.
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const L=require('../widget-layout.js');
class Classes {
  constructor(...names){this.names=new Set(names);}
  contains(n){return this.names.has(n);}
  add(...ns){ns.forEach(n=>this.names.add(n));}
  remove(...ns){ns.forEach(n=>this.names.delete(n));}
}
class Host {
  constructor(...classes){this.classList=new Classes(...classes);this.listeners={};this.style={setProperty(k,v){this[k]=v;}};this.dataset={};this.children=[];this.naturalHeight=140;}
  addEventListener(n,fn){(this.listeners[n]||=new Set()).add(fn);}
  removeEventListener(n,fn){this.listeners[n]?.delete(fn);}
  emit(n,data={}){const e={target:this,button:0,pointerId:1,pointerType:'mouse',preventDefault(){},...data};[...(this.listeners[n]||[])].forEach(fn=>fn(e));}
  append(el){el.parentElement=this;this.children.push(el);}
  remove(){this.parentElement.children=this.parentElement.children.filter(el=>el!==this);}
  setAttribute(){}
  toggleAttribute(name,on){if(name==='data-custom-size'){if(on)this.dataset.customSize='';else delete this.dataset.customSize;}}
  matches(s){return s==='.widget-title'&&this.classList.contains('widget-title');}
  closest(s){
    if(s==='.widget')return this.classList.contains('widget')?this:this.parentElement?.closest(s);
    if(s==='.resize-handle')return this.classList.contains('resize-handle')?this:null;
    if(s==='.widget-header')return this.classList.contains('widget-title')?this:null;
    if(s.startsWith('input,'))return this.interactive?this:null;
    return null;
  }
  hasPointerCapture(){return false;}
  get offsetWidth(){return parseFloat(this.style.width)||this.clientWidth||280;}
  get offsetHeight(){return this.style.height && this.style.height!=='auto'?parseFloat(this.style.height):Math.max(parseFloat(this.style.minHeight)||0,this.naturalHeight);}
  getBoundingClientRect(){const x=20+(parseFloat(this.style.left)||0),y=100+(parseFloat(this.style.top)||0);return {x,y,left:x,top:y,width:this.offsetWidth,height:this.offsetHeight,right:x+this.offsetWidth,bottom:y+this.offsetHeight};}
}
function setup(store={},category='general',ids=['weather','calendar','notes']){
  const element=new Host();element.clientWidth=1100;
  const cards=Object.fromEntries(ids.map(id=>{const c=new Host('widget');c.dataset={id,adaptive:'true'};element.append(c);return[id,c];}));
  const document=new Host();document.body=new Host();document.createElement=()=>new Host();document.querySelectorAll=()=>[];document.elementFromPoint=()=>null;
  const window=new Host();Object.assign(window,{WidgetLayout:L,scrollY:0,innerHeight:900,scrollBy(x,y){this.scrollY+=y;}});
  const queued=new Map();let frameId=0,saves=0;
  const context={window,document,ResizeObserver:class{observe(){}disconnect(){}},requestAnimationFrame:fn=>{queued.set(++frameId,fn);return frameId;},cancelAnimationFrame:id=>queued.delete(id),setTimeout:()=>0,clearTimeout(){},getComputedStyle:()=>({cursor:'nwse-resize'})};
  vm.runInNewContext(fs.readFileSync(require.resolve('../widget-canvas.js'),'utf8'),context);
  const undoButton=new Host(),arrangeButton=new Host();
  const options={page(profile){store[category]||={};return store[category][profile]||={manual:false,widgets:{}};},defaultRect(card,w,size='m'){return {x:0,y:0,width:Math.min(w,size==='l'?540:size==='s'?220:260),height:{s:190,m:310,l:420}[size],size,custom:false};},present(card,r){card.size=r.size;},save(){saves++;},undoButton,arrangeButton};
  const canvas=window.createWidgetCanvas(element,options);
  const page=()=>store[category][L.profile(element.clientWidth)];
  function drag(card,dx,dy,end='pointerup',direction){
    let target=card;
    if(direction){target=new Host('resize-handle');target.dataset.dir=direction;card.append(target);}
    const r=card.getBoundingClientRect();
    element.emit('pointerdown',{target,clientX:r.left+20,clientY:r.top+20});
    document.emit('pointermove',{clientX:r.left+20+dx,clientY:r.top+20+dy});
    if(end==='Escape')document.emit('keydown',{key:'Escape'});else document.emit(end);
  }
  return {canvas,element,cards,document,store,page,drag,undoButton,arrangeButton,get saves(){return saves;}};
}
const copy=o=>JSON.parse(JSON.stringify(o));
test('drag moves only one card to exact coordinates and Undo preserves mounted cards',()=>{
  const h=setup(),before=copy(h.page());
  h.drag(h.cards.weather,37,483);
  assert.equal(h.page().widgets.weather.x,37);assert.equal(h.page().widgets.weather.y,483);
  assert.equal(h.page().manual,true);
  assert.deepEqual(copy(h.page().widgets.calendar),before.widgets.calendar);
  assert.ok(h.saves>0);assert.equal(h.undoButton.disabled,false);
  const note=h.cards.notes;
  h.canvas.undo();assert.deepEqual(copy(h.page()),before);assert.equal(h.cards.notes,note);
});
test('only the bottom-right corner resizes; other handles are ignored',()=>{
  const h=setup();h.drag(h.cards.weather,100,100);
  const before=copy(h.page()),r=before.widgets.weather;
  for(const direction of ['n','ne','e','s','sw','w','nw']) {
    h.drag(h.cards.weather,37,29,'pointerup',direction);
    assert.deepEqual(copy(h.page()),before,direction);
  }
  h.drag(h.cards.weather,37,29,'pointerup','se');
  const next=h.page().widgets.weather;
  assert.equal(next.x,r.x);assert.equal(next.y,r.y);
  assert.equal(next.width,r.width+37);assert.equal(next.height,r.height+29);
  assert.deepEqual(copy(h.page().widgets.notes),before.widgets.notes);
  assert.equal(next.custom,true);
});
test('hand cursor appears on left press and clears on release or cancellation without movement',()=>{
  for(const ending of ['pointerup','pointercancel','Escape']) {
    const h=setup(),card=h.cards.weather,original=h.document.body.style.cursor,before=copy(h.page());
    assert.equal(card.classList.contains('canvas-grabbed'),false);
    h.element.emit('pointerdown',{target:card,clientX:50,clientY:140});
    assert.equal(card.classList.contains('canvas-grabbed'),true);
    assert.equal(h.document.body.style.cursor,'grabbing');
    if(ending==='Escape')h.document.emit('keydown',{key:'Escape'});else h.document.emit(ending);
    assert.equal(card.classList.contains('canvas-grabbed'),false);
    assert.equal(h.document.body.style.cursor,original);
    assert.deepEqual(copy(h.page()),before);
  }
  const h=setup();
  h.element.emit('pointerdown',{target:h.cards.weather,button:2,clientX:50,clientY:140});
  assert.equal(h.cards.weather.classList.contains('canvas-grabbed'),false);
});
test('Escape and pointer cancellation restore dimensions, positions and density',()=>{
  for(const end of ['Escape','pointercancel']){
    const h=setup(),before=copy(h.page());h.drag(h.cards.weather,120,160,end,'se');
    assert.deepEqual(copy(h.page()),before);assert.equal(h.cards.weather.size,'m');
    assert.equal(h.element.classList.contains('is-manipulating'),false);
  }
});
test('presets retain placement; page reload restores custom layout without recreating during resize',()=>{
  const h=setup();h.drag(h.cards.weather,79,513);h.canvas.preset(h.cards.weather,'s');
  assert.deepEqual([h.page().widgets.weather.x,h.page().widgets.weather.y],[79,513]);
  assert.equal(h.cards.weather.size,'s');
  const persisted=copy(h.store);h.canvas.destroy();const restored=setup(persisted);
  assert.equal(restored.page().widgets.weather.x,79);assert.equal(restored.page().widgets.weather.y,513);
  assert.equal(restored.cards.weather.style.width,'220px');
});
test('compact layouts do not overwrite wide positions; category layouts are separate',()=>{
  const h=setup();h.drag(h.cards.weather,791,283);const wide=copy(h.page());
  h.element.clientWidth=340;h.canvas.refresh();assert.equal(h.page().manual,false);
  h.drag(h.cards.weather,17,490);h.element.clientWidth=1100;h.canvas.refresh();
  assert.deepEqual(copy(h.page()),wide);
  const art=setup(h.store,'art',['artOfDay','livingGallery']);art.drag(art.cards.artOfDay,31,303);
  assert.deepEqual(copy(h.store.general.wide),wide);
});
test('new cards find vacant space and explicit arrange packs without changing sizes',()=>{
  const h=setup();h.drag(h.cards.weather,21,530);const before=copy(h.page());
  const h2=setup(copy(h.store),'general',['weather','calendar','notes','new']);
  assert.deepEqual(copy(h2.page().widgets.weather),before.widgets.weather);
  const rect=h2.page().widgets.new;
  assert.ok(['weather','calendar','notes'].every(id=>!L.overlaps(rect,h2.page().widgets[id])));
  h2.canvas.arrange();const entries=Object.values(h2.page().widgets);
  assert.ok(entries.every((r,i)=>entries.slice(i+1).every(b=>!L.overlaps(r,b))));
  assert.equal(h2.page().widgets.weather.width,before.widgets.weather.width);
});
test('inputs do not drag; focused titles allow precise keyboard movement and resizing',()=>{
  const h=setup(),input=new Host();input.interactive=true;h.cards.weather.append(input);
  const before=copy(h.page());h.element.emit('pointerdown',{target:input,clientX:30,clientY:120});h.document.emit('pointermove',{clientX:130,clientY:220});h.document.emit('pointerup');
  assert.deepEqual(copy(h.page()),before);
  const title=new Host('widget-title');h.cards.weather.append(title);
  h.element.emit('keydown',{target:title,key:'ArrowRight',shiftKey:true});assert.equal(h.page().widgets.weather.x,10);
  const oldWidth=h.page().widgets.weather.width;
  h.element.emit('keydown',{target:title,key:'ArrowRight',altKey:true});assert.equal(h.page().widgets.weather.width,oldWidth+1);
});
