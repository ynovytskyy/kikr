(function () {
  'use strict';

  const PRESET_BPMS = [80, 90, 100, 110, 120];
  const DEFAULT_BPM = 100;
  const MAX_BARS = 8;
  const BEATS_PER_BAR = 4;

  // ---------- State ----------
  const state = {
    bpm: DEFAULT_BPM,
    currentBeat: 0,   // 1..4 while playing, 0 when idle
    currentBar: 0,    // 1..MAX_BARS while playing, 0 when idle
    isPlaying: false,
  };

  // ---------- DOM ----------
  const $barCurrent = document.getElementById('barCurrent');
  const $startStop = document.getElementById('startStop');
  const $beats = Array.from(document.querySelectorAll('.beat'));
  const $bpmPills = Array.from(document.querySelectorAll('.bpm__pill'));

  // ---------- BPM ----------
  function setBpm(value) {
    if (!PRESET_BPMS.includes(value)) return;
    state.bpm = value;
    $bpmPills.forEach((pill) => {
      const pillBpm = Number(pill.dataset.bpm);
      pill.classList.toggle('bpm__pill--active', pillBpm === value);
    });
  }

  $bpmPills.forEach((pill) => {
    pill.addEventListener('click', () => {
      setBpm(Number(pill.dataset.bpm));
      pill.blur();
    });
  });

  // Initialize
  setBpm(DEFAULT_BPM);

  // ---------- Audio ----------
  let audioCtx = null;

  function ensureAudioContext() {
    if (audioCtx) return audioCtx;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    audioCtx = new Ctor();
    return audioCtx;
  }

  function playBeep(time, isAccent) {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = isAccent ? 1500 : 800;
    const duration = isAccent ? 0.08 : 0.05;
    const peak = isAccent ? 0.5 : 0.35;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(peak, time + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(time);
    osc.stop(time + duration + 0.02);
  }

  // Expose for manual console verification during development.
  // Removed in Task 4 once the scheduler drives playback.
  window.__metronomeDebug = { ensureAudioContext, playBeep, getCtx: () => audioCtx };
})();
