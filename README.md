# microtone - MICS009 beta

Browser-based 16-pad sampler / sequencer inspired by SP-1200 and MPC.  
Built for live jam sessions — no install, just open and play.

## Features

- **16 Pads** with 8 built-in drum presets + 8 sample slots
- **SP-1200 sound engine** — 12-bit quantization, 26kHz sample rate, analog-style Lo-Fi
- **Step sequencer** — 16 steps × 16 tracks, 4 patterns (A/B/C/D) with chain playback
- **Sample editor** — Waveform display, start/end/loop points, pitch, filter (LP/HP), choke groups
- **CHOPPY** — Auto-chop samples by detecting attack transients
- **Live sampling** — Record from browser tab audio or microphone
- **SP-1200 groove** — 24PPQ tick-quantized swing (6 discrete steps), micro-drift timing
- **Analog master** — Compressor, tape saturation, wow/flutter, tape hiss, bass harmonics
- **Mixer** — 16ch faders with VU meters, per-channel mute/solo, master comp/drive
- **Project save/load** — Export/import as `.mics` files (cropped audio + all settings)

## How to Use

Open `mics-609bc14b.html` in a browser (Chrome recommended).  
Or visit (unlisted): **https://yoshimimkinc.github.io/microtone_mics009/mics-609bc14b.html**

### Quick Start

1. Tap a pad to play a sound
2. Load your own samples with **LOAD** or record with **● SAMPLE**
3. Switch to **SEQ** to program patterns
4. Switch to **MIX** to adjust levels and master output
5. **Save** your project as a `.mics` file

### Keyboard

| Key | Function |
|-----|----------|
| `1`-`8` | Trigger pads 1-8 |
| `Q`-`I` | Trigger pads 9-16 |
| `Space` | Play / Stop |
| `Esc` | Cancel current mode |

## Tech

Single HTML file, zero dependencies. Pure Web Audio API.

## Credits

**microtone** — Yoshi, aki, hichannel, YKOYKО

## License

MIT
