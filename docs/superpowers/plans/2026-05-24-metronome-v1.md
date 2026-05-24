# Metronome v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a mobile-first single-page web metronome that plays a 4/4 click for up to 8 bars with a distinct accent on beat 1, preset BPM selection (80–120), large tap/spacebar controls, and screen wake lock.

**Architecture:** Three static files (`index.html`, `style.css`, `app.js`) with no build step and no dependencies. The Web Audio API generates beeps via oscillator + gain envelope. A lookahead scheduler driven by `AudioContext.currentTime` provides sample-accurate timing. UI updates are dispatched via `setTimeout` aligned to each beat's audio time. The Wake Lock API keeps the screen on while playing.

**Tech Stack:** Vanilla HTML/CSS/JavaScript, Web Audio API, Wake Lock API.

**Spec:** `docs/superpowers/specs/2026-05-24-metronome-v1-design.md`

---

## Testing approach

This project ships zero JS dependencies. Adding a test framework (Jest, Vitest, Playwright) for what amounts to ~150 lines of UI code is YAGNI. Each task ends with **manual browser verification** — the engineer opens the page and confirms specific behavior. This is appropriate for a small, primarily-visual single-page app where the value is what the user sees and hears, not what an assertion library returns.

To serve the page for manual testing, use:

```bash
python3 -m http.server 8000
```

…then open `http://localhost:8000` in a browser. Serving via HTTP (rather than `file://`) avoids potential audio-policy and Wake Lock quirks in some browsers.

---

## File structure

```
metronome/
├── index.html        # markup
├── style.css         # dark theme + layout
└── app.js            # state, audio, scheduler, controls, wake lock
```

Three files, each with a single clear responsibility. `app.js` is the only file with logic; if it grows past ~300 lines or accumulates unrelated concerns later, that's the signal to split it.

---

## Task 1: Scaffold project + static UI

Build the full visible UI with no behavior. Engineer opens the page and sees the final layout (bar counter `0`, four beat circles with the first one larger/outlined, five BPM pills with `100` highlighted, big START button below).

**Files:**
- Create: `index.html`
- Create: `style.css`

- [ ] **Step 1: Create `index.html`**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no, viewport-fit=cover" />
    <meta name="theme-color" content="#0a0a0a" />
    <title>Metronome</title>
    <link rel="stylesheet" href="style.css" />
  </head>
  <body>
    <main class="app">
      <section class="bar-counter" aria-label="Bar counter">
        <span class="bar-counter__current" id="barCurrent">0</span>
        <span class="bar-counter__total">/ 8</span>
      </section>

      <section class="beats" aria-label="Beat indicators">
        <div class="beat beat--accent" data-beat="1"></div>
        <div class="beat" data-beat="2"></div>
        <div class="beat" data-beat="3"></div>
        <div class="beat" data-beat="4"></div>
      </section>

      <section class="bpm" aria-label="BPM selection">
        <button class="bpm__pill" type="button" data-bpm="80">80</button>
        <button class="bpm__pill" type="button" data-bpm="90">90</button>
        <button class="bpm__pill bpm__pill--active" type="button" data-bpm="100">100</button>
        <button class="bpm__pill" type="button" data-bpm="110">110</button>
        <button class="bpm__pill" type="button" data-bpm="120">120</button>
      </section>

      <button class="start-stop" id="startStop" type="button" aria-label="Start or stop the metronome">START</button>
    </main>

    <script src="app.js"></script>
  </body>
</html>
```

- [ ] **Step 2: Create `style.css`**

```css
:root {
  --bg: #0a0a0a;
  --fg: #ffffff;
  --muted: #555555;
  --accent: #ff8c1a;
  --surface: #161616;
  --beat-dim: #2a2a2a;
  --border: #2a2a2a;
}

*, *::before, *::after { box-sizing: border-box; }

html, body {
  margin: 0;
  padding: 0;
  height: 100%;
  background: var(--bg);
  color: var(--fg);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  -webkit-user-select: none;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  overflow: hidden;
}

.app {
  height: 100vh;
  height: 100dvh;
  display: flex;
  flex-direction: column;
  padding: 16px;
  padding-top: max(16px, env(safe-area-inset-top));
  padding-bottom: max(16px, env(safe-area-inset-bottom));
  gap: 16px;
}

.bar-counter {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 12px;
  padding-top: 8px;
}

.bar-counter__current {
  font-size: clamp(120px, 28vh, 280px);
  font-weight: 700;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.bar-counter__total {
  font-size: clamp(28px, 6vh, 56px);
  color: var(--muted);
  font-weight: 500;
}

.beats {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 20px;
  padding: 8px 0;
}

.beat {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--beat-dim);
  transition: background 60ms linear;
}

.beat--accent {
  width: 48px;
  height: 48px;
  outline: 2px solid var(--muted);
  outline-offset: 4px;
}

.beat.is-active {
  background: var(--fg);
}

.beat--accent.is-active {
  background: var(--accent);
}

.bpm {
  display: flex;
  justify-content: center;
  gap: 8px;
}

.bpm__pill {
  flex: 1 1 0;
  min-height: 60px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--fg);
  font-size: 18px;
  font-weight: 600;
  border-radius: 999px;
  cursor: pointer;
  font-family: inherit;
}

.bpm__pill--active {
  background: var(--accent);
  color: #0a0a0a;
  border-color: var(--accent);
}

.start-stop {
  flex: 1 1 auto;
  border: none;
  background: var(--surface);
  color: var(--fg);
  font-size: clamp(36px, 7vh, 64px);
  font-weight: 700;
  letter-spacing: 4px;
  border-radius: 16px;
  cursor: pointer;
  font-family: inherit;
}

.start-stop.is-playing {
  background: var(--accent);
  color: #0a0a0a;
}

.start-stop:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
```

- [ ] **Step 3: Manual verification**

Run:

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000` in a browser (or use device emulation for a phone viewport, e.g. iPhone 14 in Chrome DevTools).

Expected:
- Dark, near-black background.
- Huge `0` with a small `/ 8` next to it near the top.
- Four circles in a row; the leftmost is larger and has an outline ring.
- Five orange/black BPM pills (`80 90 100 110 120`), with `100` highlighted in orange.
- A large `START` button filling the remaining vertical space.
- No JS errors in the console (the `app.js` 404 is expected at this step — ignore it).

- [ ] **Step 4: Commit**

```bash
git add index.html style.css
git commit -m "Scaffold metronome UI: HTML structure and dark theme styles"
```

---

## Task 2: BPM selection logic

Wire up the BPM pills so tapping one selects it. Tracks state in JS and updates the `bpm__pill--active` class. Establishes the `app.js` module shell that subsequent tasks build on.

**Files:**
- Create: `app.js`

- [ ] **Step 1: Create `app.js`**

```javascript
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
})();
```

- [ ] **Step 2: Manual verification**

Reload `http://localhost:8000`.

Expected:
- Page loads with no console errors.
- `100` BPM pill starts highlighted.
- Tapping `80` highlights `80` and de-highlights `100`. Tapping another pill switches the highlight again.
- After tapping a pill, pressing space does NOT re-trigger it (the `pill.blur()` line is what prevents this — verify by tapping a pill then pressing space repeatedly; the highlight should not flicker).

- [ ] **Step 3: Commit**

```bash
git add app.js
git commit -m "Add BPM selection state and UI wiring"
```

---

## Task 3: Audio engine — beep synthesis

Add the Web Audio context and a function that schedules a beep at a given time, with two flavors (accent for beat 1, normal for beats 2–4). No scheduler yet; verify by calling from the console.

**Files:**
- Modify: `app.js`

- [ ] **Step 1: Add audio module to `app.js`**

Insert this block after the `setBpm(DEFAULT_BPM);` line, but before the closing `})();`:

```javascript
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
```

- [ ] **Step 2: Manual verification**

Reload `http://localhost:8000`. Open the browser dev console and run:

```javascript
const ctx = window.__metronomeDebug.ensureAudioContext();
window.__metronomeDebug.playBeep(ctx.currentTime + 0.05, true);   // accent beep
window.__metronomeDebug.playBeep(ctx.currentTime + 0.55, false);  // normal beep
```

Expected:
- A high, slightly longer beep, then ~500ms later a lower, shorter beep.
- Beep 1 is clearly distinguishable from beep 2 — higher pitch and a touch more body.
- No errors in the console. (On iOS Safari, the AudioContext may start `suspended`; the next task handles unlocking on user gesture. For desktop console testing, it should play immediately.)

- [ ] **Step 3: Commit**

```bash
git add app.js
git commit -m "Add Web Audio beep synthesis with accent and normal tones"
```

---

## Task 4: Metronome scheduler + bar/beat UI

Implement the lookahead scheduler that plays beats at the current BPM, advances bar/beat state, updates the UI in sync with audio, and auto-stops after 8 bars. Also wire up the START/STOP button to drive playback. Spacebar comes in Task 5.

**Files:**
- Modify: `app.js`

- [ ] **Step 1: Replace the debug-only audio block in `app.js`**

Find the line `window.__metronomeDebug = ...` and **delete it**. Then, immediately after the `playBeep` function and before the closing `})();`, insert the scheduler + lifecycle code:

```javascript
  // ---------- Scheduler ----------
  const LOOKAHEAD_MS = 25;
  const SCHEDULE_AHEAD_S = 0.1;

  let nextNoteTime = 0;
  let schedulerInterval = null;

  function scheduler() {
    if (!state.isPlaying) return;
    while (nextNoteTime < audioCtx.currentTime + SCHEDULE_AHEAD_S) {
      const beat = state.currentBeat; // 1..4
      const bar = state.currentBar;   // 1..MAX_BARS
      const isAccent = beat === 1;

      playBeep(nextNoteTime, isAccent);

      const lagMs = Math.max(0, (nextNoteTime - audioCtx.currentTime) * 1000);
      setTimeout(() => renderBeat(beat, bar), lagMs);

      const isLastBeat = bar === MAX_BARS && beat === BEATS_PER_BAR;
      if (isLastBeat) {
        // Let the queued audio play out, then auto-stop. Keep the bar at MAX_BARS.
        const audioTailMs = 150;
        setTimeout(() => autoStop(), lagMs + audioTailMs);
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
    // beat is 1..4; only render if the state still reflects the same bar
    // (avoid stale updates after stop).
    if (!state.isPlaying && bar !== MAX_BARS) return;
    $barCurrent.textContent = String(bar);
    $beats.forEach((el, idx) => {
      el.classList.toggle('is-active', idx === beat - 1);
    });
  }

  function clearBeatHighlights() {
    $beats.forEach((el) => el.classList.remove('is-active'));
  }

  // ---------- Playback lifecycle ----------
  function start() {
    const ctx = ensureAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();

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
    if (schedulerInterval) {
      clearInterval(schedulerInterval);
      schedulerInterval = null;
    }
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
    if (schedulerInterval) {
      clearInterval(schedulerInterval);
      schedulerInterval = null;
    }
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
```

- [ ] **Step 2: Manual verification — basic playback**

Reload `http://localhost:8000`.

Expected:
1. Tap `START`. Bar counter goes from `0` to `1`. First beat circle (accent) lights up orange and a high beep plays. The remaining three circles light up white in sequence with lower beeps. At beat 4 → beat 1, the counter advances to `2` and the accent fires again.
2. The button label changes to `STOP` and the button background turns orange.
3. Counter advances `1 → 2 → 3 → ... → 8`. After beat 4 of bar 8 plays, the metronome stops automatically. The counter stays at `8`. The button reverts to `START`.

- [ ] **Step 3: Manual verification — BPM and stop**

Expected:
1. Press `START`. While playing, tap `120`. The pill highlight moves to `120` and the next beat arrives noticeably faster. Bar counter is NOT reset.
2. Tap the `STOP` button while playing mid-bar. Playback halts, counter resets to `0`, button reverts to `START`.
3. Tap `START` again. The counter starts from `1` again (it does not pick up where it left off — this is intentional per spec).
4. Let it play to the end (bar 8). Counter shows `8`. Tap `START` again. Counter resets to `1` and plays again.

- [ ] **Step 4: Commit**

```bash
git add app.js
git commit -m "Add metronome scheduler, bar/beat rendering, and auto-stop after 8 bars"
```

---

## Task 5: Spacebar toggle + AudioContext error handling

Wire the spacebar to toggle playback. Handle the (unlikely) case where AudioContext isn't available in the browser.

**Files:**
- Modify: `app.js`

- [ ] **Step 1: Add keyboard handler**

In `app.js`, immediately after the `$startStop.addEventListener('click', ...)` block, add:

```javascript
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
```

- [ ] **Step 2: Add AudioContext-unavailable handling**

Below the keydown handler block, add the initial feature check:

```javascript
  // ---------- Initial feature check ----------
  if (!(window.AudioContext || window.webkitAudioContext)) {
    $startStop.textContent = 'AUDIO UNAVAILABLE';
    $startStop.disabled = true;
  }
```

- [ ] **Step 3: Manual verification — spacebar**

Reload `http://localhost:8000`.

Expected:
1. Press the spacebar. Playback starts (same as tapping START).
2. Press spacebar again. Playback stops.
3. Tap a BPM pill (e.g. `90`). Press spacebar. Playback starts at 90 BPM. The pill is not re-triggered by the spacebar (the highlight stays where you set it).
4. Click STOP, then click somewhere on the empty body (not a button), then press spacebar — still toggles.

- [ ] **Step 4: Manual verification — audio unavailable**

In the browser dev console, run before reloading:

```javascript
delete window.AudioContext;
delete window.webkitAudioContext;
```

…or alternatively, comment out the `AudioContext` reference temporarily. Then reload (without the deletion persisting via a hard reload — the easier check is to temporarily edit `ensureAudioContext` to return `null`).

Expected: the START button reads `AUDIO UNAVAILABLE` and is disabled. No crash, no console errors. Revert any temp edit before continuing.

- [ ] **Step 5: Commit**

```bash
git add app.js
git commit -m "Add spacebar toggle and AudioContext-unavailable fallback"
```

---

## Task 6: Screen Wake Lock

Acquire a screen wake lock when playback starts so the phone doesn't dim/sleep. Release it on stop. Re-acquire on `visibilitychange` if the user backgrounds and returns to the tab while still playing.

**Files:**
- Modify: `app.js`

- [ ] **Step 1: Add wake lock module**

In `app.js`, immediately after the `playBeep` function definition (and before the `// ---------- Scheduler ----------` block), add:

```javascript
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
```

- [ ] **Step 2: Wire wake lock into `start()`, `stop()`, and `autoStop()`**

In the `start()` function, after the existing `if (ctx.state === 'suspended') ctx.resume();` line, add:

```javascript
    acquireWakeLock();
```

In the `stop()` function, after the existing `if (schedulerInterval) { ... }` block, add:

```javascript
    releaseWakeLock();
```

In the `autoStop()` function, after the existing `if (schedulerInterval) { ... }` block, add:

```javascript
    releaseWakeLock();
```

- [ ] **Step 3: Manual verification — supported browser**

Reload `http://localhost:8000` in Chrome or Edge (or Safari 16.4+) — Wake Lock requires a secure context, and `localhost` counts as secure.

Expected:
1. Tap START. Open dev console and run `navigator.wakeLock` is present, and the page should now resist auto-dimming. (On desktop you may not visually notice — the API call succeeds with no error is the signal.)
2. Inspect with `await (async () => { /* nothing — just check */ })()`. There should be no errors in the console. (You can't directly read the active lock, but you can confirm no exceptions were thrown during start.)
3. Switch to another browser tab, wait a couple seconds, switch back. Open the console — there should be no errors from the visibilitychange handler.
4. Tap STOP. Wake lock is released.

For a more thorough check on a real phone: load the page on your phone, set the auto-lock interval short (e.g. 30s in iOS Settings → Display & Brightness), start the metronome, and confirm the screen does not lock during an 8-bar count.

- [ ] **Step 4: Manual verification — unsupported browser**

In dev console, before reloading, run:

```javascript
Object.defineProperty(navigator, 'wakeLock', { value: undefined, configurable: true });
```

Actually that's awkward to test inline. Easier: in the source temporarily change `if (!('wakeLock' in navigator)) return;` to `if (true) return;`. Reload and confirm the metronome still works exactly as before (no errors, full playback through 8 bars). Revert the change before committing.

- [ ] **Step 5: Commit**

```bash
git add app.js
git commit -m "Acquire screen wake lock during playback"
```

---

## Final acceptance check

After Task 6 is committed, perform an end-to-end run that covers every spec requirement at once. This is the gate before declaring v1 done.

- [ ] **Open `http://localhost:8000` on a phone (or phone-sized viewport).**

- [ ] **Verify visual layout:** dominant bar number on top, small `/ 8` next to it, four beat circles with the first visually distinct, five BPM pills with `100` highlighted, large START button below.

- [ ] **Tap START.** Beat 1 plays as a high accent beep, beats 2/3/4 play as lower beeps, in time. Bar counter advances `1 → 2 → ... → 8`. After beat 4 of bar 8, playback stops automatically and the counter stays at `8`.

- [ ] **Tap START again.** Counter resets to `1` and a new count begins.

- [ ] **While playing, tap `120`.** Tempo speeds up on the next beat. Bar counter is not reset.

- [ ] **Press the spacebar.** Playback stops (or starts, if stopped). The active BPM pill is not affected.

- [ ] **While playing, tap the STOP button.** Playback halts and counter resets to `0`.

- [ ] **On a real phone with a short auto-lock setting:** Start the metronome; the screen stays on for the full 8 bars.

- [ ] **In an unsupported environment** (e.g. older browser where AudioContext is missing) the button reads `AUDIO UNAVAILABLE` and is disabled; no crash.

If anything fails, fix it before declaring complete.

---

## Self-review notes

**Spec coverage:** every section of the spec maps to a task —
- UI layout (bar counter, beat row, BPM pills, START/STOP) → Task 1
- Default BPM 100, BPM selection → Task 2
- Beat 1 accent vs normal beat sounds → Task 3
- Scheduler, bar/beat advancement, auto-stop at bar 8, BPM-change-without-reset → Task 4
- Spacebar control, AudioContext-unavailable error handling → Task 5
- Wake Lock with visibility re-acquire → Task 6

**Out-of-scope items from spec** (correctly not implemented): non-4/4 signatures, custom BPM entry, tap-tempo, subdivisions, persistence, PWA install.

**No placeholders, no TODOs, all code shown inline.**
