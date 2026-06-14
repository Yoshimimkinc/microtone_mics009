# CLAUDE.md - Project Context for Claude Code

## What is this?
microtone MICS009 — a browser-based 16-pad sampler/sequencer inspired by SP-1200 and MPC.
Single HTML file (`index.html`), zero external dependencies. Pure Web Audio API.

## Architecture

### Audio Engine
- `AudioContext` with `latencyHint:"interactive"` for minimum latency
- All samples are 12-bit quantized + 26kHz sample rate (SP-1200 emulation) via `makeLofi()`
- Presets are synthesized at startup via `OfflineAudioContext` then baked as samples
- Every pad plays the same way: `AudioBufferSourceNode` → filter(optional) → gain envelope → masterGain

### Signal Chain
```
pads → masterGain → [comp → saturator → makeupGain] → tapeDelay → output
                  ↘ [bypass (comp off)]              ↗
                  └→ bassLp → bassSat → bassGain ───→↗
tapeHiss ──────────────────────────────────────────→ output
```

### Timing / Groove (SP-1200 emulation)
- 24 PPQ tick grid (all timing derived from absolute tick position, not accumulation)
- Swing: 6 discrete values (50/54/58/63/67/71%) quantized to tick boundaries
- Micro-drift: ±0.4ms random jitter per step
- Scheduler: lookahead pattern (25ms interval, 25ms ahead)

### Data Model
- `tracks[16]`: each has `patterns[4][16]`, buffer, vol, tune, start, end, loop, filter, choke, etc.
- `editPat` (0-3): which pattern is being edited
- `chainLen` (1-4): how many patterns play in sequence (A→B→C→D)
- Accessor functions: `getPattern(i)` for edit, `getPlayPattern(i)` for playback

### UI Modes
- **PADS**: Koala-style layout. Waveform strip on top, pads below. MUTE/SOLO/COPY/CHOPPY/EDIT toggles.
- **SEQ**: 16×16 step grid with pattern A/B/C/D selector and chain length.
- **MIX**: Channel faders with VU meters, M/S per channel, master comp/drive/volume.

### Key Design Rules
- **"aki rule"**: Hide complex settings. Anyone should be able to enjoy sampling music without understanding filters or choke groups. Simple surface, depth underneath.
- Pad layout: drums (1-8) on BOTTOM row, sample slots (9-16) on top (MPC convention + ergonomics)
- MIX grid matches PADS grid layout (spatial memory consistency)
- All mode buttons (MUTE/SOLO/COPY/CHOPPY/EDIT) use toggle pattern, not hold
- Start point snaps to attack transients (onset detection)
- CHOPPY auto-sets choke groups and end points

### File Format (.mics)
JSON with base64-encoded WAV audio. On save, buffers are cropped to start-1s..end+1s to reduce size.
Stores: all pad settings, 4×16×16 step patterns, BPM, swing, chain, comp settings.

## Key Functions
| Function | Purpose |
|----------|---------|
| `makeLofi(buffer)` | 12-bit quantization + sample rate reduction |
| `playVoice(i, when, accent, fromSeq)` | Core sample playback with filter/loop/fade |
| `snapStartToOnset()` | Attack detection for start point |
| `findNextOnset(t)` | Next transient detection for CHOPPY |
| `stepTimeClean(stepNo)` | Tick-derived absolute step timing |
| `driftSec()` | SP-style micro-timing jitter |
| `bufToWav(buf, from, to)` | AudioBuffer → WAV encoder with crop |
| `calcCrop(t)` | Calculate crop range for save optimization |

## Members
- **Yoshi**: Producer, 30 years experience (builds everything)
- **hichannel (Hinata)**: Multi-instrumentalist, scratch + synth
- **aki**: Vocalist (needs simplest UI)
- **YKOYKО**: Illustrator (non-technical)

## Version
MICS009 beta v0.1
