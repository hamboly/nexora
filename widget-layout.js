/* Geometry only: shared by the static dashboard and Node regression tests. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WidgetLayout = api;
})(typeof window === 'object' ? window : this, function () {
  const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;
  const clamp = (value, low, high) => Math.min(Math.max(value, low), Math.max(low, high));
  function normalize(rect = {}, width = 280) {
    return {
      ...rect,
      x: Math.max(0, finite(rect.x, 0)), y: Math.max(0, finite(rect.y, 0)),
      width: Math.max(200, finite(rect.width, width)), height: Math.max(140, finite(rect.height, 310)),
      size: ['s', 'm', 'l'].includes(rect.size) ? rect.size : 'm',
    };
  }
  function fit(rect, available) {
    const width = Math.min(rect.width, Math.max(1, available));
    return {...rect, width, x: clamp(rect.x, 0, available - width)};
  }
  function move(rect, x, y, available) {
    return {...rect, x: clamp(x, 0, available - rect.width), y: Math.max(0, y)};
  }
  function resize(rect, direction, dx, dy, available) {
    let {x,y,width,height} = rect;
    const right = x + width, bottom = y + height;
    const minWidth = Math.min(200, available);
    if (direction.includes('w')) { x = clamp(x + dx, 0, right - minWidth); width = right - x; }
    if (direction.includes('e')) width = clamp(width + dx, minWidth, available - x);
    if (direction.includes('n')) { y = clamp(y + dy, 0, bottom - 140); height = bottom - y; }
    if (direction.includes('s')) height = Math.max(140, height + dy);
    return {...rect,x,y,width,height};
  }
  function overlaps(a, b, gap = 0) {
    return a.x < b.x+b.width+gap && a.x+a.width+gap > b.x && a.y < b.y+b.height+gap && a.y+a.height+gap > b.y;
  }
  function vacancy(size, occupied, available, gap = 16) {
    const width = Math.min(size.width, available);
    const xs = [...new Set([0, ...occupied.map(r=>r.x+r.width+gap)])].sort((a,b)=>a-b);
    const ys = [...new Set([0, ...occupied.map(r=>r.y+r.height+gap)])].sort((a,b)=>a-b);
    for (const y of ys) for (const x of xs) {
      const candidate = {x,y,width,height:size.height};
      if (x+width <= available+.1 && occupied.every(r=>!overlaps(r,candidate,gap))) return candidate;
    }
    return {x:0,y:Math.max(0,...occupied.map(r=>r.y+r.height+gap)),width,height:size.height};
  }
  function pack(sizes, available, gap = 16) {
    const result = {};
    for (const size of sizes) result[size.id] = vacancy(size,Object.values(result),available,gap);
    return result;
  }
  return {normalize,fit,move,resize,overlaps,vacancy,pack,profile:width=>width<600?'compact':'wide'};
});
