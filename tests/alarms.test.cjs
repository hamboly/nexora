const test = require('node:test');
const assert = require('node:assert/strict');
const {claimDue, localDate, createSound} = require('../alarm-clock.js');
const at = (day, hour=9, minute=0, second=0) => new Date(2026,7,day,hour,minute,second);
test('daily alarms fire once per local day, including after reload', () => {
  let alarms = [{time:'09:00', enabled:true, repeat:'daily'}];
  assert.equal(claimDue(alarms,at(30,8,59)).length,0);
  assert.equal(claimDue(alarms,at(30)).length,1);
  alarms = JSON.parse(JSON.stringify(alarms));
  assert.equal(claimDue(alarms,at(30,9,1)).length,0);
  assert.equal(claimDue(alarms,at(31)).length,1);
});
test('one-time alarms respect the chosen date and disable after firing', () => {
  const alarm={time:'09:00',date:localDate(at(31)),repeat:'once',enabled:true};
  assert.equal(claimDue([alarm],at(30)).length,0);
  assert.equal(claimDue([alarm],at(31)).length,1);
  assert.equal(alarm.enabled,false);
});
test('disabled, invalid and stale alarms do not ring; short delays do', () => {
  assert.equal(claimDue([{time:'09:00',enabled:false},{time:'29:00',enabled:true}],at(31)).length,0);
  assert.equal(claimDue([{time:'09:00',enabled:true}],at(31,9,5)).length,0);
  assert.equal(claimDue([{time:'09:00',enabled:true}],at(31,9,4,59)).length,1);
});
test('snooze works once even for a completed one-time alarm', () => {
  const alarm={enabled:false,snoozeUntil:at(31,9,5).getTime()};
  assert.equal(claimDue([alarm],at(31,9,4)).length,0);
  assert.equal(claimDue([alarm],at(31,9,5)).length,1);
  assert.equal(claimDue([alarm],at(31,9,5,1)).length,0);
});
test('identical-time alarms each fire and old saved alarms stay daily', () => {
  const alarms=[{time:'09:00',enabled:true},{time:'09:00',enabled:true}];
  assert.equal(claimDue(alarms,at(30)).length,2);
  assert.equal(claimDue(alarms,at(31)).length,2);
});
test('audio needs unlocking and uses soft attack/release with cancellable notes', async () => {
  const oscillators=[], envelopes=[];
  class Audio {
    state='suspended'; currentTime=0; destination={};
    async resume(){this.state='running';}
    createOscillator(){const node={frequency:{},connect(){},disconnect(){},start(){},stop(){this.stopped=true;}};oscillators.push(node);return node;}
    createGain(){const env=[];envelopes.push(env);return {gain:{setValueAtTime:(...v)=>env.push(v),linearRampToValueAtTime:(...v)=>env.push(v),exponentialRampToValueAtTime:(...v)=>env.push(v)},connect(){},disconnect(){}};}
  }
  const sound=createSound(Audio);
  assert.equal(sound.play(),false);
  assert.equal(await sound.unlock(),true);
  assert.equal(sound.play('chime',30,2),true);
  assert.equal(oscillators.length,3);
  assert.equal(envelopes[0][0][0],0);
  assert.ok(envelopes[0][1][0]<0.05);
  sound.stop();assert.ok(oscillators.every(node=>node.stopped));
  assert.equal(await createSound(undefined).unlock(),false);
});
