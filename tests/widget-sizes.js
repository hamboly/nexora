(async () => {
  const report = document.createElement('pre');
  report.id = 'sizing-results';
  report.style.cssText = 'position:fixed;inset:0 0 auto;background:#102820;color:white;padding:12px;z-index:99999;max-height:35vh;overflow:auto;font-size:12px';
  document.body.append(report);
  if (new URLSearchParams(location.search).has('manual')) {
    report.textContent = 'Manual pointer diagnostics';
    const records = [];
    for (const type of ['pointerdown', 'pointerup', 'dragstart', 'dragover', 'drop', 'dragend']) document.addEventListener(type, e => {
      if (type === 'dragover' && records.at(-1)?.startsWith('dragover')) return;
      records.push(type + ' ' + e.target.tagName + '.' + e.target.className + ' button=' + e.button + ' drag=' + e.target.closest('.widget')?.getAttribute('draggable'));
      report.textContent = records.slice(-12).join('\n');
    }, true);
    return;
  }
  const quiet = document.createElement('style');
  quiet.textContent = '*,*::before,*::after{animation:none!important;transition:none!important} .widget{transform:none!important;rotate:none!important}';
  document.head.append(quiet);
  let checks = 0;
  const failures = [];
  const assert = (condition, description) => { checks++; if (!condition && failures.length < 100) failures.push(description); };
  const settle = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const visible = el => el.getClientRects().length && getComputedStyle(el).display !== 'none';
  const setSize = (card, size) => setWidgetSize(card, WIDGETS[card.dataset.id].cat, card.dataset.id, size);
  const cards = {};
  try {
    state.notes = 'A saved multiline note.\n'.repeat(80);
    state.todos = fixtureRows(i => ({ text: 'Task ' + i + ' with a longer description that wraps naturally.', done: false }));
    state.watchlist = fixtureRows(i => ({ name: 'Watchlist item ' + i, year: '2026', link: '#' }));
    state.alarms = fixtureRows(i => ({ time: '12:00', label: 'Alarm ' + i, enabled: false }));
    grid.querySelectorAll('.widget').forEach(c => { c.cleanupAdaptive?.(); c.cleanupResize?.(); c.cleanupDrag?.(); });
    grid.canvas?.destroy(); grid.canvas = null;
    grid.replaceChildren();
    for (const [id, def] of Object.entries(WIDGETS)) {
      if (def.cat === 'art') continue;
      cards[id] = buildWidget(def.cat, id);
      grid.append(cards[id]);
    }
    await settle(); await settle();
    for (const [id, card] of Object.entries(cards)) assert(!card.querySelector('.widget-size-control, .widget-size-option, .act-size'), id + ': compact header without preset controls');
    assert(!grid.querySelector('.widget-more'), 'No show-full footer buttons');
    assert(!grid.querySelector('.widget-grab'), 'No visible drag dots');
    for (const [id, card] of Object.entries(cards)) assert(card.querySelectorAll('.resize-handle').length === 1, id + ': one bottom-right resize corner');
    const clockPin = cards.clock.querySelector('.pin');
    assert(getComputedStyle(clockPin).position === 'absolute', 'Clock center is positioned inside its face');
    assert(!cards.weather.querySelector('.act-detail') && !cards.clock.querySelector('.act-detail'), 'Weather and Clock no longer require Details');
    assert(cards.clock.querySelectorAll('.world-clock-city').length === 8, 'Eight world cities, excluding the local city');
    assert(cards.clock.querySelector('.act-alarm')?.getAttribute('aria-label') === 'Add alarm', 'Clock header has the alarm button');
    const widths = new URLSearchParams(location.search).has('mobile') ? [340] : [1100];
    for (const width of widths) {
      grid.style.width = width + 'px';
      grid.style.gridTemplateColumns = width < 600 ? 'minmax(0, 1fr)' : 'repeat(4, minmax(0, 1fr))';
      for (const style of Object.keys(STYLE_THEMES)) {
        state.style = style;
        for (const theme of ['light', 'dark']) {
          state.theme = theme;
          applyTheme();
          for (const size of ['s', 'm', 'l']) {
            Object.values(cards).forEach(c => setSize(c, size));
            await settle();
            for (const [id, card] of Object.entries(cards)) {
              const prefix = `${width}/${style}/${theme}/${size}/${id}`;
              assert(card.classList.contains('size-' + size), prefix + ': content density');
              if (id === 'quickLinks' && size !== 's') assert([...card.querySelectorAll('.provider-tile')].filter(visible).length === 12, prefix + ': twelve visible shortcuts');
              if (id === 'weather') {
                assert(visible(card.querySelector('.wx-hours')) && visible(card.querySelector('.wx-week')), prefix + ': hourly and weekly forecasts remain inline');
                assert(card.querySelectorAll('.wx-week > span').length === 7, prefix + ': all seven forecast days');
                const weatherBody = card.querySelector('.widget-body');
                const forecastBottom = card.querySelector('.weather').getBoundingClientRect().bottom;
                const expectedBottom = weatherBody.getBoundingClientRect().bottom - parseFloat(getComputedStyle(weatherBody).paddingBottom);
                assert(Math.abs(forecastBottom - expectedBottom) < 3, prefix + ': weather uses the available height');
              }
              if (id === 'clock') {
                assert(visible(card.querySelector('.sun-times')) && visible(card.querySelector('.world-clocks')), prefix + ': world clocks below sun times remain visible');
                const face = card.querySelector('.analog-face').getBoundingClientRect();
                const period = card.querySelector('.clock-period').getBoundingClientRect();
                assert(face.left >= period.right + 2 && face.top < period.bottom && face.bottom > period.top, prefix + ': analog clock remains beside AM/PM');
                assert(parseFloat(getComputedStyle(card.querySelector('.clock-period')).fontSize) < parseFloat(getComputedStyle(card.querySelector('.clock-value')).fontSize), prefix + ': smaller AM/PM');
                if (size === 'm') assert(card.offsetHeight <= 312, prefix + ': city times fit a normal-height clock');
              }
              const body = card.querySelector('.widget-body');
              if (!visible(body)) continue;
              assert(body.scrollHeight <= body.clientHeight + 2, prefix + ': body overflow');
              for (const el of body.querySelectorAll('*')) {
                if (!visible(el) || !el.clientHeight || el.tagName === 'SVG') continue;
                const css = getComputedStyle(el);
                if (/^(auto|scroll|hidden|clip)$/.test(css.overflowY)) {
                  assert(el.scrollHeight <= el.clientHeight + 2, prefix + ': clipped/scrolling ' + el.className);
                }
              }
              assert(body.scrollWidth <= body.clientWidth + 2, prefix + ': horizontal overflow');
            }
          }
        }
        report.textContent = `Running: ${style}, ${width}px. ${checks} checks, ${failures.length} failures.\n${failures.slice(0, 8).join('\n')}`;
      }
    }
    // Lists, late-arriving data and preservation of editor/game DOM.
    const tasks = cards.todos;
    const counts = [];
    for (const size of ['s', 'm', 'l']) {
      setSize(tasks, size); await settle();
      counts.push([...tasks.querySelectorAll('.todo-item')].filter(visible).length);
    }
    assert(counts.join(',') === '2,5,12', 'Tasks progressively disclose 2,5,12 whole rows');
    setSize(cards.liveScores, 's'); await settle();
    assert([...cards.liveScores.querySelectorAll('.list-row')].filter(visible).length === 2, 'Date groups share the small results budget');
    assert([...cards.liveScores.querySelectorAll('.ls-day')].filter(visible).length === 1, 'Hidden dates do not leave orphan headings');
    const note = cards.notes.querySelector('textarea');
    setSize(cards.notes, 's'); setSize(cards.notes, 'l'); await settle();
    assert(note === cards.notes.querySelector('textarea') && note.value === state.notes, 'Note text and editor are retained');
    assert(note.scrollHeight <= note.clientHeight + 2, 'Full long note has no scrolling');
    note.value += '\nFresh unsaved text'; note.dispatchEvent(new Event('input', { bubbles: true }));
    setSize(cards.notes, 's'); setSize(cards.notes, 'l'); await settle();
    assert(note.value.endsWith('Fresh unsaved text'), 'Resize preserves unsaved edits');
    const gameButton = cards.memoryMatch.querySelector('.mem-card');
    gameButton.click();
    setSize(cards.memoryMatch, 's'); setSize(cards.memoryMatch, 'm'); await settle();
    assert(gameButton === cards.memoryMatch.querySelector('.mem-card') && gameButton.classList.contains('open'), 'Game state survives resize');
    document.getElementById('styleBtn').click();
    document.querySelector('.style-card').click();
    assert(!document.querySelector('#modalRoot .modal'), 'Style selection completes without error');
    assert(note === cards.notes.querySelector('textarea') && gameButton.classList.contains('open'), 'Style selection preserves mounted content');
    setSize(tasks, 's');
    const added = document.createElement('label'); added.className = 'todo-item'; added.textContent = 'Late data';
    tasks.querySelector('.todo-list').append(added); await settle();
    assert([...tasks.querySelectorAll('.todo-item')].filter(visible).length === 2, 'Late data obeys small budget');
    setSize(tasks, 'l'); await settle();
    assert(visible(added), 'Late data is recoverable in large');
    assert(cards.f1Standings.querySelectorAll('tbody tr').length === 20, 'Large retains all 20 F1 drivers');
    // Free canvas gestures are covered in widget-canvas.html and the Node controller tests.
    // Explicit regression for the reported dark dialog in the light theme.
    state.style = 'glassDark'; state.theme = 'light'; applyTheme();
    document.getElementById('styleBtn').click();
    const modal = document.querySelector('.modal');
    const bg = getComputedStyle(modal).backgroundColor.match(/[\d.]+/g).slice(0, 3).map(Number);
    assert(bg.every(c => c > 235), 'Glass Dark light-mode dialog has a light background');
    const text = getComputedStyle(modal.querySelector('.style-card')).color.match(/[\d.]+/g).slice(0, 3).map(Number);
    assert(text.every(c => c < 60), 'Glass Dark light-mode style names remain dark and readable');
    document.querySelector('.modal-close').click();
    const art = buildWidget('art', 'colorStories');
    assert(!art.hasAttribute('data-adaptive') && art.querySelectorAll('.resize-handle').length === 1, 'Art retains gallery content with one bottom-right resize corner');
    state.sizes['general:weather'] = 's';
    const restored = buildWidget('general', 'weather');
    assert(restored.classList.contains('size-s'), 'Saved size restores when remounted');
    restored.cleanupAdaptive?.(); restored.cleanupResize?.(); restored.cleanupDrag?.();
    report.textContent = `${failures.length ? 'FAIL' : 'PASS'}: ${checks} checks; ${Object.keys(cards).length} widgets; ${Object.keys(STYLE_THEMES).length} styles; 2 theme states; 3 sizes.\n${failures.join('\n')}`;
    report.dataset.status = failures.length ? 'failed' : 'passed';
  } catch (error) {
    report.dataset.status = 'failed';
    report.textContent = 'ERROR: ' + error.stack;
  }
})();
