(function () {
  'use strict';

  const PRESET_BPMS = [60, 70, 80, 90, 100, 110, 120];
  const DEFAULT_BPM = 100;
  const MAX_BARS = 8;
  const BEATS_PER_BAR = 4;

  // ---------- State ----------
  const state = {
    bpm: DEFAULT_BPM,
    currentBeat: 0,   // 1..4 while playing, 0 when idle
    currentBar: 0,    // 1..MAX_BARS while playing, 0 when idle
    isPlaying: false,
    subdivisions: false,    // When true, also click on every "and" (8th notes).
    prebeatBars: 1,         // Setting: count-in length, 1 or 2 bars.
    prebeatBeatsRemaining: 0, // Runtime: counts down through the count-in phase.
    // Bumped on every start/stop/autoStop. Pending setTimeouts capture the
    // session ID at scheduling time and bail out if it has changed, so
    // callbacks from a previous session can't corrupt a new one.
    sessionId: 0,
  };

  // ---------- DOM ----------
  const $app = document.querySelector('.app');
  const $barCurrent = document.getElementById('barCurrent');
  const $playZone = document.getElementById('playZone');
  const $playZoneControls = document.getElementById('playZoneControls');
  const $subdivisionsToggle = document.getElementById('subdivisionsToggle');
  const $prebeatToggle = document.getElementById('prebeatToggle');
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

  // Center the active pill in its scroll container so it's always visible on
  // load — and again when the layout flips between orientations (landscape's
  // vertical scroll becomes portrait's horizontal scroll, resetting position).
  // After this we leave the scroll alone; the user can scroll manually.
  function scrollActiveBpmIntoView() {
    const active = $bpmPills.find((pill) => pill.classList.contains('bpm__pill--active'));
    if (!active) return;
    // block + inline together work for whichever axis is currently scrollable;
    // the browser ignores the one that doesn't apply.
    active.scrollIntoView({ block: 'center', inline: 'center', behavior: 'auto' });
  }

  requestAnimationFrame(scrollActiveBpmIntoView);
  window.matchMedia('(orientation: portrait)').addEventListener('change', () => {
    requestAnimationFrame(scrollActiveBpmIntoView);
  });

  // ---------- Audio ----------
  let audioCtx = null;

  function ensureAudioContext() {
    if (audioCtx) return audioCtx;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    audioCtx = new Ctor();
    return audioCtx;
  }

  // kind:
  //   'accent'  — beat 1 of each bar (round, prominent)
  //   'normal'  — beats 2/3/4
  //   'sub'     — "and" subdivisions (lighter, brighter)
  //   'countin' — pre-beat stick-click (short, dry, high-pitched)
  function playBeep(time, kind) {
    if (!audioCtx) return;
    let frequency, duration, peak;
    if (kind === 'accent') {
      frequency = 1500; duration = 0.08; peak = 0.85;
    } else if (kind === 'sub') {
      frequency = 1000; duration = 0.035; peak = 0.35;
    } else if (kind === 'countin') {
      frequency = 2500; duration = 0.025; peak = 0.55;
    } else { // 'normal'
      frequency = 800; duration = 0.05; peak = 0.65;
    }
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = frequency;
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
      const secondsPerBeat = 60.0 / state.bpm;
      const lagMs = Math.max(0, (nextNoteTime - audioCtx.currentTime) * 1000);

      // ---- Count-in phase ----
      if (state.prebeatBeatsRemaining > 0) {
        const totalCountin = state.prebeatBars * BEATS_PER_BAR;
        const elapsed = totalCountin - state.prebeatBeatsRemaining;
        const countinBeat = (elapsed % BEATS_PER_BAR) + 1;

        playBeep(nextNoteTime, 'countin');

        setTimeout(() => {
          if (state.sessionId !== session) return;
          // Light the corresponding circle; show 0 in the bar counter to
          // signal we haven't started the real count yet.
          renderBeat(countinBeat, 0);
        }, lagMs);

        state.prebeatBeatsRemaining -= 1;
        nextNoteTime += secondsPerBeat;
        continue;
      }

      // ---- Normal playback phase ----
      const beat = state.currentBeat; // 1..4
      const bar = state.currentBar;   // 1..MAX_BARS
      const kind = beat === 1 ? 'accent' : 'normal';

      playBeep(nextNoteTime, kind);

      // If 8th-note subdivisions are on, schedule the "and" tick between this
      // beat and the next. Visual indicators still only flash on main beats.
      if (state.subdivisions) {
        playBeep(nextNoteTime + secondsPerBeat / 2, 'sub');
      }

      setTimeout(() => {
        if (state.sessionId !== session) return;
        renderBeat(beat, bar);
      }, lagMs);

      const isLastBeat = bar === MAX_BARS && beat === BEATS_PER_BAR;
      if (isLastBeat) {
        // Let the queued audio play out, then auto-stop. When subdivisions are
        // on, the "and of 4" of bar 8 needs to finish playing first, so wait
        // half a beat longer before declaring the count done.
        const subdivTailMs = state.subdivisions ? (secondsPerBeat * 1000) / 2 : 0;
        const audioTailMs = subdivTailMs + 150;
        setTimeout(() => {
          if (state.sessionId !== session) return;
          autoStop();
        }, lagMs + audioTailMs);
        clearInterval(schedulerInterval);
        schedulerInterval = null;
        return;
      }

      nextNoteTime += secondsPerBeat;
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
    state.prebeatBeatsRemaining = state.prebeatBars * BEATS_PER_BAR;
    state.currentBar = 1;
    state.currentBeat = 1;
    nextNoteTime = ctx.currentTime + 0.05;

    // During count-in we show 0 in the bar counter; the real count starts
    // at 1 once prebeatBeatsRemaining hits zero.
    $barCurrent.textContent = state.prebeatBeatsRemaining > 0 ? '0' : '1';
    clearBeatHighlights();
    $playZone.classList.add('is-playing');

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
    state.prebeatBeatsRemaining = 0;
    state.currentBar = 0;
    state.currentBeat = 0;
    renderBar();
    clearBeatHighlights();
    $playZone.classList.remove('is-playing');
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
    state.prebeatBeatsRemaining = 0;
    state.currentBeat = 0;
    // Leave state.currentBar at MAX_BARS for visual feedback. start() resets it.
    clearBeatHighlights();
    $playZone.classList.remove('is-playing');
  }

  function toggle() {
    if (state.isPlaying) stop();
    else start();
  }

  // ---------- Controls ----------
  $playZone.addEventListener('click', () => {
    toggle();
    $playZone.blur();
  });

  // The toggle cluster lives inside the play zone; stop its clicks (on the
  // buttons or any padding between them) from bubbling up and toggling play.
  $playZoneControls.addEventListener('click', (event) => {
    event.stopPropagation();
  });

  $subdivisionsToggle.addEventListener('click', () => {
    state.subdivisions = !state.subdivisions;
    $subdivisionsToggle.setAttribute('aria-pressed', String(state.subdivisions));
    $subdivisionsToggle.blur();
  });

  function setPrebeatBars(bars) {
    state.prebeatBars = bars;
    $prebeatToggle.textContent = `Pre-beat ${bars}`;
    $prebeatToggle.setAttribute('aria-pressed', String(bars === 2));
  }

  $prebeatToggle.addEventListener('click', () => {
    setPrebeatBars(state.prebeatBars === 2 ? 1 : 2);
    $prebeatToggle.blur();
  });

  setPrebeatBars(state.prebeatBars);

  document.addEventListener('keydown', (event) => {
    if (event.code !== 'Space' && event.key !== ' ') return;
    // Don't double-trigger when a BPM pill has focus — the browser will activate
    // it on space, and we don't want toggle() running on top of that.
    const tag = (event.target && event.target.tagName) || '';
    if (tag === 'BUTTON') return;
    event.preventDefault();
    toggle();
  });

  // ---------- Initial feature check ----------
  if (!(window.AudioContext || window.webkitAudioContext)) {
    $app.classList.add('is-audio-unavailable');
    $barCurrent.textContent = 'NO AUDIO';
  }
})();
