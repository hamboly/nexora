const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');
const helpers = source.slice(source.indexOf('/* World clock helpers */'), source.indexOf('/* End world clock helpers */'));
const context = vm.createContext({ Intl, Map });
vm.runInContext(helpers, context);
test('the current city is excluded, including timezone aliases', () => {
  const tehran = context.getWorldClockCities('Asia/Tehran');
  assert.equal(tehran.length, 8);
  assert.ok(tehran.every(city => city.name !== 'Tehran'));
  assert.ok(context.getWorldClockCities('US/Eastern').every(city => city.name !== 'New York'));
  assert.equal(context.getWorldClockCities('Pacific/Auckland').length, 8);
});
test('world clocks show actual hours and minutes with seasonal timezone rules', () => {
  const winter = new Date('2026-01-15T12:00:00Z');
  const summer = new Date('2026-07-15T12:00:00Z');
  for (const [zone, jan, jul] of [
    ['America/New_York','07:00','08:00'], ['Europe/London','12:00','13:00'],
    ['Europe/Berlin','13:00','14:00'], ['Asia/Tehran','15:30','15:30'],
    ['Asia/Tokyo','21:00','21:00'], ['Australia/Sydney','23:00','22:00'],
  ]) {
    assert.equal(context.formatWorldClockTime(winter, zone), jan, zone);
    assert.equal(context.formatWorldClockTime(summer, zone), jul, zone);
  }
});
test('cached clock formatters continue updating as time passes', () => {
  assert.equal(context.formatWorldClockTime(new Date('2026-08-31T20:29:00Z'),'Asia/Tehran'),'23:59');
  assert.equal(context.formatWorldClockTime(new Date('2026-08-31T20:30:00Z'),'Asia/Tehran'),'00:00');
});
test('local time separates AM/PM without losing seconds or noon/midnight meaning', () => {
  for (const [instant,time,period] of [
    ['2026-08-31T00:00:00Z','12:00:00','AM'],
    ['2026-08-31T12:00:00Z','12:00:00','PM'],
    ['2026-08-31T23:59:59Z','11:59:59','PM'],
  ]) {
    const result=context.formatLocalClockTime(new Date(instant),'UTC');
    assert.equal(result.time,time); assert.equal(result.period,period);
  }
});
