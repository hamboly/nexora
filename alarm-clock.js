/* Local-calendar scheduling and soft, gesture-enabled alarm audio. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.NexoraAlarms = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const localDate = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  function claimDue(alarms, now = new Date()) {
    const due = [];
    for (const alarm of alarms) {
      if (alarm.snoozeUntil) {
        const delay = now.getTime() - alarm.snoozeUntil;
        if (delay >= 0) {
          delete alarm.snoozeUntil;
          if (delay < 300000) due.push(alarm);
        }
        continue;
      }
      if (!alarm.enabled || !/^([01]\d|2[0-3]):[0-5]\d$/.test(alarm.time)) continue;
      const day = localDate(now);
      if (alarm.repeat === 'once' && alarm.date !== day) continue;
      const key = day + 'T' + alarm.time;
      if (alarm.lastFired === key) continue;
      const [hours, minutes] = alarm.time.split(':').map(Number);
      const scheduled = new Date(now);
      scheduled.setHours(hours, minutes, 0, 0);
      const delay = now - scheduled;
      // A short grace window tolerates background-tab throttling, not hours-old alarms.
      if (delay < 0 || delay >= 300000) continue;
      alarm.lastFired = key;
      if (alarm.repeat === 'once') alarm.enabled = false;
      due.push(alarm);
    }
    return due;
  }
  function createSound(AudioContextClass) {
    let context, timer, generation = 0;
    const nodes = new Set();
    function stop() {
      generation++;
      clearTimeout(timer);
      for (const node of nodes) { try { node.stop(); } catch (_) {} }
      nodes.clear();
    }
    async function unlock() {
      try {
        if (!AudioContextClass) return false;
        context ||= new AudioContextClass();
        if (context.state !== 'running') await context.resume();
        return context.state === 'running';
      } catch (_) { return false; }
    }
    function play(sound = 'chime', volume = 30, duration = 30) {
      stop();
      if (!context || context.state !== 'running') return false;
      const token = generation;
      const level = Math.max(0.01, Math.min(1, Number(volume)/100 || 0.3)) * 0.13;
      const phrase = () => {
        if (token !== generation) return;
        const notes = sound === 'bell' ? [659.25, 523.25, 659.25] : [523.25, 659.25, 783.99];
        notes.forEach((frequency, i) => {
          const oscillator = context.createOscillator(), gain = context.createGain();
          const start = context.currentTime + i * 0.38;
          oscillator.type = 'sine'; oscillator.frequency.value = frequency;
          gain.gain.setValueAtTime(0, start);
          gain.gain.linearRampToValueAtTime(level, start + 0.045);
          gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.85);
          oscillator.connect(gain); gain.connect(context.destination);
          nodes.add(oscillator);
          oscillator.onended = () => { nodes.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
          oscillator.start(start); oscillator.stop(start + 0.9);
        });
      };
      const end = Date.now() + duration * 1000;
      const repeat = () => {
        if (token !== generation) return;
        phrase();
        if (Date.now() + 2600 < end) timer = setTimeout(repeat, 2600);
      };
      repeat();
      return true;
    }
    return { unlock, play, stop, ready: () => context?.state === 'running' };
  }
  return { localDate, claimDue, createSound };
});
