const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const alarms = require('../alarm-clock.js');
const source = fs.readFileSync(require.resolve('../app.js'),'utf8');
const service = source.slice(source.indexOf('const alarmSound ='),source.indexOf('function openAlarmModal()'));
test('two tabs claim a due alarm only once and preserve other saved data', async () => {
  const now=new Date();
  const time=String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0');
  let saved=JSON.stringify({notes:'Keep this note',alarms:[{id:'one',time,enabled:true}]});
  let lock=Promise.resolve();
  const locks={request:(_key,callback)=>{lock=lock.then(callback);return lock;}};
  const contexts=[];
  for(let i=0;i<2;i++) {
    const context=vm.createContext({
      NexoraAlarms:{...alarms,createSound:()=>({ready:()=>true})},
      window:{addEventListener(){}},document:{hidden:false,addEventListener(){}},navigator:{locks},
      crypto:require('node:crypto'), state:{notes:'Stale',alarms:[]}, STORE_KEY:'nexora-v1',
      localStorage:{getItem:()=>saved,setItem:(_key,value)=>{saved=value;}},
      setInterval:()=>{},saveState:()=>{throw Error('Unexpected fallback');},
    });
    vm.runInContext(service+'\nvar rings=0; showRingingAlarm=()=>{rings++;}; startAlarmService();',context);
    contexts.push(context);
  }
  await lock;
  assert.equal(contexts.reduce((sum,context)=>sum+context.rings,0),1);
  assert.equal(JSON.parse(saved).notes,'Keep this note');
  assert.ok(JSON.parse(saved).alarms[0].lastFired);
});
