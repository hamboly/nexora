(async () => {
  const report=document.createElement('pre');report.id='canvas-results';
  report.style.cssText='position:fixed;bottom:0;left:0;right:0;max-height:25vh;overflow:auto;z-index:2147483647;background:#102820;color:white;padding:12px;font-size:12px';
  document.body.append(report);
  const params=new URLSearchParams(location.search);
  if(params.has('manual')) { report.textContent='Isolated canvas: drag, resize, Undo, Auto arrange. Storage and providers are fixtures.';return; }
  const settle=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  let checks=0;const failures=[];
  const assert=(ok,message)=>{checks++;if(!ok)failures.push(message);};
  const current=()=>state.layouts[state.activeCategory][WidgetLayout.profile(grid.clientWidth)];
  const geometry=card=>current().widgets[card.dataset.id];
  const gesture=(card,dx,dy,direction,cancel)=>{
    const rect=card.getBoundingClientRect();
    const target=direction?card.querySelector('.resize-handle.'+direction):card.querySelector('.widget-title');
    const start={bubbles:true,pointerId:12,pointerType:'mouse',button:0,buttons:1,clientX:rect.left+25,clientY:rect.top+25};
    target.dispatchEvent(new PointerEvent('pointerdown',start));
    document.dispatchEvent(new PointerEvent('pointermove',{...start,clientX:start.clientX+dx,clientY:start.clientY+dy}));
    if(cancel)document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));
    else document.dispatchEvent(new PointerEvent('pointerup',{...start,buttons:0}));
  };
  try {
    grid.style.width='1100px';
    for(const category of Object.keys(getCats())) {
      state.activeCategory=category;renderGrid();await settle();await settle();
      assert(grid.classList.contains('widget-canvas'),category+': uses canvas');
      const card=grid.querySelector('.widget');if(!card)continue;
      const before=JSON.stringify(current().widgets),r={...geometry(card)};
      const neighbors=[...grid.querySelectorAll('.widget')].filter(el=>el!==card).map(el=>[el.dataset.id,JSON.stringify(geometry(el))]);
      gesture(card,23,31);await settle();
      assert(Math.abs(geometry(card).x-r.x-23)<1 && Math.abs(geometry(card).y-r.y-31)<1,category+': arbitrary coordinates');
      assert(neighbors.every(([id,rect])=>JSON.stringify(current().widgets[id])===rect),category+': neighbors stay still');
      grid.canvas.undo();assert(JSON.stringify(current().widgets)===before,category+': undo restores layout');
      gesture(card,43,67,'se');await settle();
      const saved={...geometry(card)};
      gesture(card,100,100,'se',true);assert(JSON.stringify(geometry(card))===JSON.stringify(saved),category+': Escape restores size');
      renderGrid();await settle();assert(JSON.stringify(current().widgets[card.dataset.id])===JSON.stringify(saved),category+': remount preserves geometry');
    }
    state.activeCategory='general';renderGrid();await settle();
    const weather=grid.querySelector('[data-id="weather"]'),note=grid.querySelector('[data-id="notes"] textarea');
    note.value='Keep this unsaved edit';
    gesture(weather,19,41);await settle();
    const saved={...geometry(weather)};
    for(const style of Object.keys(STYLE_THEMES)) for(const theme of ['light','dark']) {
      state.style=style;state.theme=theme;applyTheme();await settle();
      assert(getComputedStyle(weather).position==='absolute',style+'/'+theme+': free positioning');
      assert(getComputedStyle(weather).transform==='none',style+'/'+theme+': no theme displacement');
      assert(geometry(weather).x===saved.x && geometry(weather).y===saved.y,style+'/'+theme+': exact coordinates retained');
    }
    for(const size of ['s','m','l']) {
      setWidgetSize(weather,'general','weather',size);await settle();
      assert(geometry(weather).x===saved.x && geometry(weather).y===saved.y,size+': preset does not move card');
      const body=weather.querySelector('.widget-body');assert(body.scrollHeight<=body.clientHeight+2,size+': no internal scrolling');
    }
    assert(note===grid.querySelector('[data-id="notes"] textarea') && note.value==='Keep this unsaved edit','Moving/resizing/style changes preserve editor');
    const wide=JSON.stringify(current());grid.style.width='340px';grid.canvas.refresh();await settle();
    assert(WidgetLayout.profile(grid.clientWidth)==='compact','Compact layout profile');
    grid.style.width='1100px';grid.canvas.refresh();await settle();assert(JSON.stringify(current())===wide,'Wide layout survives compact preview');
    report.textContent=`${failures.length?'FAIL':'PASS'}: ${checks} canvas checks\n${failures.join('\n')}`;
    report.dataset.status=failures.length?'failed':'passed';
  } catch(error) {report.dataset.status='failed';report.textContent='ERROR: '+error.stack;}
})();
