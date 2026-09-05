/* Free placement controller. Widget renderers and their live state stay mounted. */
window.createWidgetCanvas = function (element, options) {
  const L = window.WidgetLayout;
  const cards = () => [...element.children].filter(el => el.classList.contains('widget'));
  let page, profile, frame = 0, saveTimer = 0, gesture = null, scrollFrame = 0, destroyed = false;
  const history = [];
  const feedback = document.createElement('output');
  feedback.className = 'canvas-feedback'; feedback.setAttribute('aria-live', 'off'); feedback.hidden = true;
  element.append(feedback);
  element.classList.add('widget-canvas');
  const width = () => Math.max(1, element.clientWidth);
  const record = card => page.widgets[card.dataset.id];
  const snapshot = () => JSON.stringify(page);
  const buttons = () => { if (options.undoButton) options.undoButton.disabled = !history.length; };
  const remember = before => { history.push(before); if (history.length > 30) history.shift(); buttons(); };
  const save = () => { clearTimeout(saveTimer); if (!destroyed) options.save(page); };
  const saveSoon = () => { clearTimeout(saveTimer); saveTimer = setTimeout(save, 150); };
  function show(card) {
    const r = L.fit(record(card), width());
    card.dataset.canvasWidget = 'true';
    card.style.left = r.x + 'px'; card.style.top = r.y + 'px';
    card.style.width = r.width + 'px'; card.style.minHeight = r.height + 'px';
    card.style.height = card.dataset.adaptive === 'true' ? 'auto' : r.height + 'px';
    card.style.zIndex = String(r.z || 1);
    card.toggleAttribute('data-custom-size', !!r.custom);
    options.present(card, r);
  }
  function extent() {
    const bottom = Math.max(360, ...cards().map(card => parseFloat(card.style.top || 0) + card.offsetHeight));
    element.style.setProperty('--canvas-height', Math.ceil(bottom + 160) + 'px');
  }
  function pack() {
    const placed = L.pack(cards().map(card => ({id:card.dataset.id, width:L.fit(record(card),width()).width, height:card.offsetHeight})),width());
    cards().forEach(card => {
      const r=placed[card.dataset.id];
      Object.assign(record(card), {x:r.x,y:r.y}); show(card);
    });
  }
  function initialize() {
    const nextProfile = L.profile(width());
    if (nextProfile === profile) return;
    profile = nextProfile; page = options.page(profile);
    page.widgets ||= {}; history.length = 0; buttons();
    const added = [];
    for (const card of cards()) {
      const id = card.dataset.id;
      if (!page.widgets[id]) { page.widgets[id] = options.defaultRect(card, width()); added.push(card); }
      page.widgets[id] = L.normalize(page.widgets[id]); show(card);
    }
    const occupied = cards().filter(card=>!added.includes(card)).map(card=>({...L.fit(record(card),width()),height:card.offsetHeight}));
    for (const card of added) {
      const vacant=L.vacancy({...record(card),height:card.offsetHeight},occupied,width());
      Object.assign(record(card),{x:vacant.x,y:vacant.y}); show(card); occupied.push(vacant);
    }
    saveSoon();
  }
  function refresh() {
    frame = 0;
    if (destroyed || gesture) return;
    initialize(); cards().forEach(show);
    if (!page.manual) { pack(); saveSoon(); }
    extent();
  }
  const schedule = () => { if (!frame && !destroyed) frame=requestAnimationFrame(refresh); };
  function restore(before) {
    const previous = JSON.parse(before);
    Object.keys(page).forEach(key=>delete page[key]); Object.assign(page,previous);
    cards().forEach(show); extent();
  }
  function density(r) { r.custom=true; r.size=r.height<270?'s':r.height<430?'m':'l'; return r; }
  function describe(card) {
    const r = L.fit(record(card),width());
    feedback.hidden=false; feedback.textContent=Math.round(card.offsetWidth)+' × '+Math.round(card.offsetHeight);
    feedback.style.left=r.x+'px'; feedback.style.top=Math.max(0,r.y-30)+'px';
  }
  function updatePointer() {
    if (!gesture?.started) return;
    const g=gesture, bounds=element.getBoundingClientRect();
    const dx=g.clientX-g.startX, dy=g.clientY-g.startY + (window.scrollY-g.scrollY);
    let r;
    if (g.direction) r=density(L.resize(g.original,g.direction,dx,dy,width()));
    else r=L.move(g.original,g.clientX-bounds.left-g.offsetX,g.clientY-bounds.top-g.offsetY,width());
    r.z=g.z;
    page.widgets[g.card.dataset.id]=r; show(g.card);
    // Content may establish a taller minimum than the pointer requested.
    // Keep the opposite edge anchored even when that minimum is reached.
    if (g.direction?.includes('n') && g.card.offsetHeight > r.height + .5) {
      r.y = Math.max(0, g.original.y + g.original.height - g.card.offsetHeight);
      show(g.card);
    }
    describe(g.card); extent();
    document.querySelectorAll('.nav-item.drop-target').forEach(el=>el.classList.remove('drop-target'));
    g.target = !g.direction ? document.elementFromPoint(g.clientX,g.clientY)?.closest('.nav-item') : null;
    if (g.target && !g.target.classList.contains('active')) g.target.classList.add('drop-target');
  }
  function autoScroll() {
    if (!gesture?.started) return;
    const y=gesture.clientY;
    if(y>window.innerHeight-40) window.scrollBy(0,14);
    else if(y<40) window.scrollBy(0,-14);
    updatePointer(); scrollFrame=requestAnimationFrame(autoScroll);
  }
  function move(event) {
    if (!gesture || event.pointerId!==gesture.pointerId) return;
    const g=gesture; g.clientX=event.clientX; g.clientY=event.clientY;
    if (!g.started && Math.hypot(event.clientX-g.startX,event.clientY-g.startY)<4) return;
    event.preventDefault();
    if (!g.started) {
      g.started=true; page.manual=true;
      g.z=Math.max(1,...Object.values(page.widgets).map(r=>r.z||1))+1;
      g.card.classList.add(g.direction?'resizing':'canvas-moving');
      element.classList.add('is-manipulating');
      document.body.style.cursor=g.direction ? getComputedStyle(g.handle).cursor : 'grabbing';
      scrollFrame=requestAnimationFrame(autoScroll);
    }
    updatePointer();
  }
  function finish(cancelled=false) {
    if (!gesture) return;
    const g=gesture; gesture=null;
    cancelAnimationFrame(scrollFrame);
    document.removeEventListener('pointermove',move); document.removeEventListener('pointerup',up);
    document.removeEventListener('pointercancel',cancel); document.removeEventListener('keydown',escape);
    window.removeEventListener('blur',cancel);
    if (g.card.hasPointerCapture?.(g.pointerId)) g.card.releasePointerCapture(g.pointerId);
    g.card.classList.remove('resizing','canvas-moving','canvas-grabbed'); element.classList.remove('is-manipulating'); feedback.hidden=true;
    document.body.style.cursor=g.cursor; document.body.style.userSelect=g.userSelect;
    document.querySelectorAll('.nav-item.drop-target').forEach(el=>el.classList.remove('drop-target'));
    if(cancelled) restore(g.before);
    else if(g.started) { remember(g.before); save(); }
    if(!cancelled && g.started && g.target) options.transfer?.(g.card,g.target);
    schedule();
  }
  const up = e=>{if(e.pointerId===gesture?.pointerId) finish();};
  const cancel = ()=>finish(true);
  const escape = e=>{if(e.key==='Escape'){e.preventDefault();finish(true);}};
  function down(e) {
    if(e.button!==0 || gesture) return;
    const card=e.target.closest('.widget');
    if(!card || card.parentElement!==element) return;
    const handle=e.target.closest('.resize-handle');
    if(handle && handle.dataset.dir!=='se') return;
    if(!handle && e.target.closest('input,textarea,button,select,a,label,audio,video,iframe,[contenteditable],[role="button"],.track-row,.radio-row,.swatch,.ticket-connect')) return;
    if(e.pointerType==='touch' && !handle && !e.target.closest('.widget-header')) return;
    if(!page) refresh();
    const r=card.getBoundingClientRect();
    gesture={card,handle,direction:handle?.dataset.dir,pointerId:e.pointerId,before:snapshot(),
      original:{...L.fit(record(card),width()),...(handle?{height:r.height}: {})},
      startX:e.clientX,startY:e.clientY,clientX:e.clientX,clientY:e.clientY,offsetX:e.clientX-r.left,offsetY:e.clientY-r.top,
      scrollY:window.scrollY,cursor:document.body.style.cursor,userSelect:document.body.style.userSelect};
    document.body.style.userSelect='none';
    if(!handle) { card.classList.add('canvas-grabbed'); document.body.style.cursor='grabbing'; }
    if(handle) e.preventDefault();
    try{card.setPointerCapture(e.pointerId);}catch(_){}
    document.addEventListener('pointermove',move,{passive:false}); document.addEventListener('pointerup',up);
    document.addEventListener('pointercancel',cancel); document.addEventListener('keydown',escape);
    window.addEventListener('blur',cancel);
  }
  function keyboard(e) {
    if(!e.target.matches('.widget-title') || !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key) || gesture) return;
    e.preventDefault(); const card=e.target.closest('.widget'),before=snapshot(),step=e.shiftKey?10:1;
    const dx=e.key==='ArrowRight'?step:e.key==='ArrowLeft'?-step:0,dy=e.key==='ArrowDown'?step:e.key==='ArrowUp'?-step:0;
    const original=L.fit(record(card),width());
    page.widgets[card.dataset.id]=e.altKey?density(L.resize(original,'se',dx,dy,width())):L.move(original,original.x+dx,original.y+dy,width());
    page.manual=true; remember(before); show(card); extent(); save();
  }
  function arrange() { if(gesture) return; const before=snapshot(); pack(); page.manual=true; remember(before); extent(); save(); }
  function undo() { if(gesture || !history.length) return; restore(history.pop()); buttons(); save(); }
  const preventNativeDrag=e=>e.preventDefault();
  const lostCapture=e=>{if(e.pointerId===gesture?.pointerId) finish(true);};
  element.addEventListener('pointerdown',down); element.addEventListener('keydown',keyboard); element.addEventListener('dragstart',preventNativeDrag);
  element.addEventListener('lostpointercapture',lostCapture);
  options.arrangeButton?.addEventListener('click',arrange); options.undoButton?.addEventListener('click',undo);
  const observer=new ResizeObserver(()=>{
    if(gesture && L.profile(width())!==profile) finish(true);
    schedule();
  }); observer.observe(element); cards().forEach(card=>observer.observe(card));
  refresh();
  return {
    has:card=>card.parentElement===element,
    preset(card,size) {
      if(gesture) finish(true);
      const before=snapshot(),r=record(card),d=options.defaultRect(card,width(),size);
      page.widgets[card.dataset.id]={...r,width:d.width,height:d.height,size,custom:false};
      page.manual=true; remember(before); show(card); extent(); save();
    },
    arrange,undo,refresh,
    destroy() {
      finish(true); clearTimeout(saveTimer); cancelAnimationFrame(frame); cancelAnimationFrame(scrollFrame); observer.disconnect();
      save(); destroyed=true;
      element.removeEventListener('pointerdown',down); element.removeEventListener('keydown',keyboard); element.removeEventListener('dragstart',preventNativeDrag);
      element.removeEventListener('lostpointercapture',lostCapture);
      options.arrangeButton?.removeEventListener('click',arrange); options.undoButton?.removeEventListener('click',undo);
      feedback.remove(); element.classList.remove('widget-canvas');
    },
  };
};
