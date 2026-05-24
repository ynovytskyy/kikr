# Metronome v1 — Design

A single-page web metronome for drummers practicing on a phone or tablet. Plays a 4/4 click for up to 8 bars, then stops.

## Goals

- Fast, large-target controls usable on a phone in a practice setting.
- Audible, distinct accent on beat 1 of every bar.
- Visible bar count so the drummer can track an 8-bar structure without thinking.
- One-tap (or spacebar) start/stop. Preset BPM selection — no typing, no incrementing.

## Non-goals (v1)

- Time signatures other than 4/4.
- Custom BPM entry, tap-tempo, or BPM increment/decrement.
- Subdivisions, swing, accent patterns beyond beat 1.
- Persistence of user preference between sessions.
- Setlists, presets beyond the five fixed BPMs.

## Tech stack

Three static files in the project root, no build step, no dependencies:

- `index.html` — markup
- `style.css` — styles
- `app.js` — metronome engine and UI logic

Audio is generated in-browser via the Web Audio API (oscillator + gain envelope). No audio assets to ship. Hostable on any static host or opened directly from disk.

## UI

Mobile-first single screen, dark theme. Vertical layout, top to bottom:

1. **Bar counter.** Dominant element on the screen. Large numeric display of the current bar (`1`–`8`), with a small `/ 8` next to or below it. When stopped, shows `0` (or an equivalent idle state).
2. **Beat row.** Four circular indicators in a horizontal row representing beats 1–4. The beat-1 indicator is visually distinct (slightly larger or different outline) even when stopped, so the bar start is always identifiable. While playing, the current beat lights up in the accent color and the others dim. The accent beat (beat 1) flashes a stronger highlight.
3. **BPM selector.** Five large pill buttons in a single row: `80  90  100  110  120`. The currently selected BPM is highlighted. Default selection on load: `100`.
4. **Start/Stop area.** A large tappable region filling the remaining vertical space. Label toggles between `START` and `STOP`. Tapping anywhere in the region toggles playback. The pressable area is the largest single element on screen.

### Visual style

- Background: near-black (`#0a0a0a` or similar).
- Foreground text: white / high-contrast.
- One accent color for active states and the beat-1 highlight (e.g. orange `#ff8c1a` or green — final choice during implementation).
- Minimum tap target: BPM pills ~60px tall; start/stop region much larger.
- Layout uses viewport units so it adapts from phone to tablet without media-query branching for v1.

## Controls

- **Tap on START/STOP area** — toggles playback.
- **Spacebar** — toggles playback. Must not double-fire when focus is on a button (the browser will activate a focused button on space). Handled by blurring the active element after BPM-pill clicks, or by checking `event.target` in the keydown handler.
- **Tap on a BPM pill** — selects that BPM. If playing, takes effect on the next scheduled beat. Bar count is NOT reset.

## Metronome engine

### Audio scheduling

Use a lookahead scheduler keyed off `AudioContext.currentTime` rather than `setInterval` for note timing. `setInterval` drifts and is throttled in background tabs; the lookahead pattern is the standard approach for browser-based metronomes.

- A `setInterval` runs every ~25 ms.
- On each tick, the scheduler queues any beat whose scheduled time falls within the next ~100 ms window using `oscillator.start(time)` and `oscillator.stop(time + duration)`.
- The next beat time is computed from `60 / bpm` seconds after the previous beat. BPM changes affect the next beat scheduled.

### Beat sounds

Two distinct synthesized beeps, both ~50 ms with a quick attack/decay envelope on the gain node:

- **Beat 1 (accent):** ~1500 Hz, slightly longer envelope.
- **Beats 2/3/4:** ~800 Hz, shorter envelope.

Sine or triangle wave (final pick during implementation — whichever is crisper without being harsh on phone speakers).

### State

- `bpm` — number, one of `{80, 90, 100, 110, 120}`.
- `currentBeat` — `1`–`4`.
- `currentBar` — `1`–`8` while playing, `0` when idle.
- `isPlaying` — boolean.
- `wakeLock` — Wake Lock sentinel or `null`.

### Lifecycle

- **Start:** unlock `AudioContext` if suspended (iOS gesture requirement is satisfied by the user's tap). Set `currentBar = 1`, `currentBeat = 1`. Schedule beat 1 immediately. Acquire screen wake lock.
- **BPM change while playing:** update `bpm`. The next scheduled beat picks up the new tempo. No reset of bar/beat counters.
- **Auto-stop after bar 8:** after beat 4 of bar 8 plays, the engine stops itself. Bar counter remains showing `8 / 8` so the drummer sees the count finished. On next start, counter resets to `1`.
- **Stop (user-initiated):** halt the scheduler, release the wake lock, reset counters to idle state (`0 / 8`).

## Screen Wake Lock

Use the Wake Lock API to keep the screen on while playing.

- On start: `await navigator.wakeLock.request('screen')`, store the returned sentinel.
- On stop (user or auto): release the sentinel.
- On `visibilitychange` → visible: if `isPlaying`, re-acquire the lock (the lock auto-releases when the tab becomes hidden).
- Feature-detect with `if ('wakeLock' in navigator)`. On unsupported browsers (older iOS, older Firefox), silently skip. No UI affordance for the absence.

## Error handling

- **AudioContext creation fails or is unavailable** — display a static message in the start/stop area (e.g. "Audio not available in this browser") instead of the START label. Don't crash.
- **Wake Lock request fails or is unsupported** — silently continue. Not a blocking failure.
- **User interacts before `AudioContext` is unlocked** — the first START tap is itself the user gesture, so this is handled by the natural flow.

## File structure

```
metronome/
├── index.html
├── style.css
├── app.js
└── docs/
    └── superpowers/
        └── specs/
            └── 2026-05-24-metronome-v1-design.md
```

## Out of scope / future work

- Wake-lock UI affordance for unsupported browsers.
- Persisting last-used BPM.
- Additional time signatures, subdivisions, custom bar counts.
- Tap-tempo entry.
- PWA / offline install.
