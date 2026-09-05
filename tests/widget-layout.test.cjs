const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../widget-layout.js');

test('free positions retain exact pixels and arbitrary gaps, including touching', () => {
  const a = L.move({x:0,y:0,width:220,height:190}, 37, 83, 1100);
  const b = L.move({x:0,y:0,width:250,height:310}, 257, 83, 1100);
  const c = L.move({x:0,y:0,width:220,height:190}, 803, 477, 1100);
  assert.deepEqual([a.x,a.y,b.x,c.x,c.y], [37,83,257,803,477]);
  assert.equal(b.x - a.x - a.width, 0);
  assert.deepEqual(L.move(a, -20, -30, 1100), {...a,x:0,y:0});
  assert.equal(L.move(a, 1500, 15000, 1100).y,15000);
});
test('all eight resize directions are continuous and anchor opposite edges', () => {
  const r={x:140,y:150,width:300,height:320};
  for (const d of ['n','ne','e','se','s','sw','w','nw']) {
    const a=L.resize(r,d,d.includes('w')?-37:37,d.includes('n')?-29:29,1100);
    assert.equal(a.width, r.width + (/[ew]/.test(d)?37:0), d);
    assert.equal(a.height, r.height + (/[ns]/.test(d)?29:0), d);
    if(d.includes('w')) assert.equal(a.x+a.width,r.x+r.width,d);
    if(d.includes('n')) assert.equal(a.y+a.height,r.y+r.height,d);
  }
});
test('resize bounds preserve anchors and usable minimum sizes', () => {
  const r={x:140,y:150,width:300,height:320};
  assert.deepEqual(L.resize(r,'nw',999,999,1100),{x:240,y:330,width:200,height:140});
  assert.deepEqual(L.resize(r,'nw',-999,-999,1100),{x:0,y:0,width:440,height:470});
  assert.equal(L.resize(r,'e',999,0,700).width,560);
  assert.equal(L.resize(r,'w',-100,0,700).x,40);
});
test('packing and new-card placement never move existing cards or overlap them', () => {
  const sizes=Array.from({length:8},(_,i)=>({id:String(i),width:200,height:i%2?310:190}));
  const packed=L.pack(sizes,1100,16);
  assert.equal(packed['4'].y,0);
  assert.ok(packed['5'].y>0);
  const existing=Object.values(packed),copy=JSON.stringify(existing);
  const newCard=L.vacancy({width:273,height:257},existing,1100,16);
  assert.ok(existing.every(r=>!L.overlaps(r,newCard)));
  assert.equal(JSON.stringify(existing),copy);
  const narrow=L.pack(sizes,340,16);
  assert.ok(Object.values(narrow).every(r=>r.x===0 && r.width<=340));
});
test('viewport fitting is temporary and never corrupts saved geometry', () => {
  const saved={x:790,y:440,width:310,height:360,custom:true,size:'m'};
  const narrow=L.fit(saved,500);
  assert.equal(narrow.x,190);
  assert.equal(saved.x,790);
  assert.deepEqual(L.fit(saved,1100),saved);
  assert.equal(L.profile(599),'compact'); assert.equal(L.profile(600),'wide');
});
test('stored invalid geometry is sanitized, and defaults survive JSON persistence', () => {
  const rect=L.normalize({x:-3,y:NaN,width:Infinity,height:-40,size:'bad'},280);
  assert.deepEqual([rect.x,rect.y,rect.width,rect.height,rect.size],[0,0,280,140,'m']);
  const store={art:{wide:{manual:true,widgets:{artOfDay:{x:51,y:87,width:321,height:512}}}}};
  assert.deepEqual(JSON.parse(JSON.stringify(store)),store);
});
