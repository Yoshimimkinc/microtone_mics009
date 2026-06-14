# Changelog

## v0.1 beta (2026-06-14)

### Core Engine
- 16-pad MPC-style sampler with AudioBufferSourceNode playback (no synth-per-hit leak)
- 12-bit quantization + 26kHz sample rate (SP-1200 Lo-Fi emulation)
- 8 built-in drum presets rendered via OfflineAudioContext at startup
- Per-pad: volume, pitch (±12st), start/end points, loop, filter (OFF/LP/HP), choke groups
- Micro-fade (3ms) on start/end points to prevent clicks
- Start point snaps to attack transient (onset detection)
- Choke groups: pads in same group cut each other (HH default group 1)

### Sequencer
- 16 steps × 16 tracks, accent support (Shift+click)
- 4 patterns (A/B/C/D) with chain playback (1-4 patterns loop)
- SP-1200 groove: 24PPQ tick-quantized timing, 6 discrete swing values, ±0.4ms drift
- Real-time recording (Rec mode)
- Clear track per pattern

### UI
- 3 modes: PADS / SEQ / MIX with hardware-style mode buttons
- PADS: Koala-style layout (waveform strip top, pads bottom)
- Pad layout: drums on bottom row (8×2 default), 4×4 for performance
- Toggle-based pad operations: MUTE / SOLO / COPY / CHOPPY / EDIT
- Waveform display with draggable start/end/loop handles
- Playhead cursor on waveform during playback
- Pads flash on sequencer hits
- Keyboard: 1-8 / Q-I for pads, Space for play/stop, arrows for focused sliders

### CHOPPY (Auto-chop)
- Detects next strong attack transient (kick/snare level, minimum 1/32 of sample length skip)
- Auto-sets choke group for all slices from same source
- Auto-sets previous slice end point to next slice start
- Chain operation: source→dest, dest becomes next source

### Sampling
- Tab Audio capture (getDisplayMedia) + Mic input (getUserMedia)
- Recording overlay with timer, audio-only stream extraction
- Captured audio auto-processed through 12-bit Lo-Fi

### Mixer (MIX)
- 16ch vertical faders matching PADS grid layout (spatial consistency)
- VU meters embedded in faders (trigger-based, decay animation)
- Per-channel M/S (Mute/Solo) toggle buttons
- Master volume, compressor (threshold + soft knee), saturation (tanh drive)
- Master VU bar

### Master Audio Chain
- Dynamics compressor (soft knee 12dB, attack 8ms, release 120ms)
- Tanh saturation with 2x oversampling
- Tape wow/flutter (0.7Hz ±0.4ms + 4.5Hz ±0.08ms)
- Tape hiss (HP 4kHz, -62dB)
- Bass harmonic enhancer (150Hz LP → asymmetric waveshaper → parallel mix)
- Comp bypass maintains tape/bass processing

### Project Save/Load
- Save as .mics file (JSON + base64 WAV)
- Audio cropped to start-1s..end+1s on save for size optimization
- Loads all settings, patterns, audio, comp/drive state
- Load accepts .mics and .json

### Responsive
- All elements scale with window width
- No horizontal overflow (scrollbar-gutter stable)
- Media queries for 600px and 400px breakpoints
- SEQ/MIX horizontally scrollable on narrow screens

### Video import (mobile)
- LOAD accepts video files; audio extracted via decodeAudioData
- iOS fallback: tap "▶ extract" to play the video and capture its audio in real time
- Target pad is locked at the moment ▶ is pressed (selecting another pad mid-extraction no longer redirects it)

## Backlog / 今後の課題
- 範囲指定取り込み（動画/音声の任意区間だけを抽出して取り込む）。
  現状は実時間再生で全長を取り込むため、長い素材は待ち時間と末尾トリムが必要。
  抽出前に「何秒〜何秒」を指定できるUIを検討する。
