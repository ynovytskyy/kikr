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
    // Bumped on every start/stop/autoStop. Pending setTimeouts capture the
    // session ID at scheduling time and bail out if it has changed, so
    // callbacks from a previous session can't corrupt a new one.
    sessionId: 0,
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

  // ---------- Wake Lock ----------
  let wakeLock = null;

  async function acquireWakeLock() {
    if (!('wakeLock' in navigator)) return;
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => {
        // The system released the lock (e.g. tab hidden). Clear our ref so
        // visibilitychange knows to re-acquire if we're still playing.
        wakeLock = null;
      });
    } catch (err) {
      // Acquisition can fail (e.g. low battery). Not fatal.
      wakeLock = null;
    }
  }

  async function releaseWakeLock() {
    if (!wakeLock) return;
    try {
      await wakeLock.release();
    } catch (_) {
      // ignore
    }
    wakeLock = null;
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.isPlaying && !wakeLock) {
      acquireWakeLock();
    }
  });

  // ---------- Scheduler ----------
  const LOOKAHEAD_MS = 25;
  const SCHEDULE_AHEAD_S = 0.1;

  let nextNoteTime = 0;
  let schedulerInterval = null;

  function scheduler() {
    if (!state.isPlaying) return;
    const session = state.sessionId;
    while (nextNoteTime < audioCtx.currentTime + SCHEDULE_AHEAD_S) {
      const beat = state.currentBeat; // 1..4
      const bar = state.currentBar;   // 1..MAX_BARS
      const isAccent = beat === 1;

      playBeep(nextNoteTime, isAccent);

      const lagMs = Math.max(0, (nextNoteTime - audioCtx.currentTime) * 1000);
      setTimeout(() => {
        if (state.sessionId !== session) return;
        renderBeat(beat, bar);
      }, lagMs);

      const isLastBeat = bar === MAX_BARS && beat === BEATS_PER_BAR;
      if (isLastBeat) {
        // Let the queued audio play out, then auto-stop. Keep the bar at MAX_BARS.
        const audioTailMs = 150;
        setTimeout(() => {
          if (state.sessionId !== session) return;
          autoStop();
        }, lagMs + audioTailMs);
        clearInterval(schedulerInterval);
        schedulerInterval = null;
        return;
      }

      nextNoteTime += 60.0 / state.bpm;
      state.currentBeat += 1;
      if (state.currentBeat > BEATS_PER_BAR) {
        state.currentBeat = 1;
        state.currentBar += 1;
      }
    }
  }

  // ---------- UI rendering ----------
  function renderBar() {
    $barCurrent.textContent = String(state.currentBar);
  }

  function renderBeat(beat, bar) {
    // Callers verify the session ID before invoking, so this just writes the DOM.
    $barCurrent.textContent = String(bar);
    $beats.forEach((el, idx) => {
      el.classList.toggle('is-active', idx === beat - 1);
    });
  }

  function clearBeatHighlights() {
    $beats.forEach((el) => el.classList.remove('is-active'));
  }

  // ---------- Playback lifecycle ----------
  async function start() {
    const ctx = ensureAudioContext();
    if (!ctx) return;
    // Await the resume so ctx.currentTime is meaningful by the time we use it.
    // iOS Safari starts the AudioContext suspended and resumes asynchronously.
    if (ctx.state === 'suspended') await ctx.resume();
    state.sessionId += 1;
    acquireWakeLock();

    state.isPlaying = true;
    state.currentBar = 1;
    state.currentBeat = 1;
    nextNoteTime = ctx.currentTime + 0.05;

    renderBar();
    clearBeatHighlights();
    $startStop.textContent = 'STOP';
    $startStop.classList.add('is-playing');

    schedulerInterval = setInterval(scheduler, LOOKAHEAD_MS);
    scheduler();
  }

  function stop() {
    state.sessionId += 1;
    if (schedulerInterval) {
      clearInterval(schedulerInterval);
      schedulerInterval = null;
    }
    releaseWakeLock();
    state.isPlaying = false;
    state.currentBar = 0;
    state.currentBeat = 0;
    renderBar();
    clearBeatHighlights();
    $startStop.textContent = 'START';
    $startStop.classList.remove('is-playing');
  }

  function autoStop() {
    // Like stop(), but leaves the bar counter at MAX_BARS so the drummer sees they finished.
    state.sessionId += 1;
    if (schedulerInterval) {
      clearInterval(schedulerInterval);
      schedulerInterval = null;
    }
    releaseWakeLock();
    state.isPlaying = false;
    state.currentBeat = 0;
    // Leave state.currentBar at MAX_BARS for visual feedback. start() resets it.
    clearBeatHighlights();
    $startStop.textContent = 'START';
    $startStop.classList.remove('is-playing');
  }

  function toggle() {
    if (state.isPlaying) stop();
    else start();
  }

  // ---------- Controls ----------
  $startStop.addEventListener('click', () => {
    toggle();
    $startStop.blur();
  });

  document.addEventListener('keydown', (event) => {
    if (event.code !== 'Space' && event.key !== ' ') return;
    // Ignore if a button has focus — the browser would already activate it on space,
    // and we don't want a double-trigger. blur() in click handlers above guards against this,
    // but this is belt-and-braces.
    const tag = (event.target && event.target.tagName) || '';
    if (tag === 'BUTTON') return;
    event.preventDefault();
    toggle();
  });

  // ---------- Initial feature check ----------
  if (!(window.AudioContext || window.webkitAudioContext)) {
    $startStop.textContent = 'AUDIO UNAVAILABLE';
    $startStop.disabled = true;
  }
})();
