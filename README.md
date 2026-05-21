# GFT AI LAB — Intro Video Generator

Generates a branded intro video (MP4) from HTML Canvas animation using Puppeteer for
frame capture and FFmpeg for encoding. No video editing software required.

**Output:** `intro_ailab.mp4` — 1280×720, 30 fps, 3.5 s, H.264 + AAC.

---

## Prerequisites

### 1. Node.js

Version 18 or higher. Download from [nodejs.org](https://nodejs.org).

```
node --version   # should print v18.x or higher
```

### 2. FFmpeg

**Windows (WinGet) — recommended:**
```powershell
winget install Gyan.FFmpeg
```
Restart your terminal after installing. The render script auto-detects the WinGet install
path. If you installed FFmpeg another way, set the env variable before running:
```powershell
$env:FFMPEG_PATH = "C:\path\to\ffmpeg.exe"
```

**macOS (Homebrew):**
```bash
brew install ffmpeg
export FFMPEG_PATH=$(which ffmpeg)
```

**Linux:**
```bash
sudo apt install ffmpeg          # Debian/Ubuntu
export FFMPEG_PATH=$(which ffmpeg)
```

---

## Setup

```bash
# 1. Clone or download this repository
git clone <repo-url>
cd ai-lab

# 2. Install dependencies (Puppeteer)
npm install
```

> Puppeteer downloads a bundled Chromium browser on first install (~200 MB). This is
> used to render the HTML animation headlessly.

---

## Assets

Place the following files in the project root (same folder as `intro_ailab.html`):

### `logo.png` — required

Your logo rendered as **dark marks on an opaque light background** (e.g. black logo on
white). The render script extracts the logo shape via brightness comparison and converts
it to white-on-transparent at runtime.

| Property | Value |
|---|---|
| Background | Opaque, near-white (e.g. `rgb(248,248,248)`) |
| Logo marks | Dark (the darker, the more opaque the result) |
| Recommended size | At least 800 px wide for sharp output |

> A transparent-background PNG will also work but may require adjusting the baking
> parameters in `intro_ailab.html` (`bakeWhiteLogo` function).

### `fluid code.jpg` — optional background

Any brand visual asset on a **light/gray background** (the script extracts structural
marks as white overlay on the dark background). Remove or replace as needed — see
[Customization](#customization) below.

---

## Render

```powershell
node render_intro.js
```

The script runs in three phases:

| Phase | What happens |
|---|---|
| 1 – Audio | `OfflineAudioContext` synthesizes 3.5 s of audio → `intro_audio.wav` |
| 2 – Frames | 105 PNG frames captured via virtual clock (no real-time waiting) |
| 3 – Encode | FFmpeg combines frames + audio → `intro_ailab.mp4` |

Total time: ~30 seconds on a modern laptop.

### Audio-only mode (fast iteration)

Skip frame capture and encoding — just synthesize and save the WAV for quick listening:

```powershell
# PowerShell
$env:AUDIO_ONLY = '1'; node render_intro.js

# bash / macOS / Linux
AUDIO_ONLY=1 node render_intro.js
```

---

## Customization

### Change the text label

In `intro_ailab.html`, find:
```javascript
ctx.fillText('AI LAB', 0, 0);
```
Replace `'AI LAB'` with your own label. Adjust `ctx.letterSpacing` and font size on the
two lines above if needed.

### Change the background color

In `intro_ailab.html`, replace all occurrences of `#001225` with your brand color.
Also update the vignette gradient colors (`rgba(0,28,60,...)` etc.) to match.

### Change the duration

In `render_intro.js`:
```javascript
const DURATION = 3.5;   // seconds
```
Also update the fade-out timing in `intro_ailab.html` (`prog(ms, 3100, 3500)`) to match.

### Remove the fluid code background

In `intro_ailab.html`, delete the `<img id="fluidcode">` tag, the `bakeFluidCode`
function, and the `drawFluid(ms)` call inside `draw()`. The animation will show a clean
dark background.

### Change the logo display size

In `intro_ailab.html`:
```javascript
const LOGO_DW = 290;   // display width in pixels
```
`LOGO_DH` is calculated automatically from the source aspect ratio.

### Modify the audio

The entire audio synthesis is inside the `page.evaluate(async (dur, sr) => { ... })`
block in `render_intro.js` (starting around line 54). It uses the Web Audio API running
in an `OfflineAudioContext`. Edit oscillators, gains, and timing there, then test
quickly with `AUDIO_ONLY=1` before doing a full render.

---

## Project structure

```
ai-lab/
├── intro_ailab.html      # Canvas animation source
├── render_intro.js       # Puppeteer render script
├── logo.png              # Your logo (dark on light background)
├── fluid code.jpg        # Background brand visual (optional)
├── intro_ailab.mp4       # Generated output
├── package.json
└── Template Slide.pdf    # GFT brand reference (GFT-specific, can be removed)
```

---

## Troubleshooting

**`waitForFunction` timeout** — the script waits up to 15 s for image baking to
complete. If it times out, check that `logo.png` and `fluid code.jpg` are in the project
root and are valid image files.

**FFmpeg not found** — set `FFMPEG_PATH` to the absolute path of your `ffmpeg` binary.

**Blurry or dark logo** — the baking algorithm (`bakeWhiteLogo` in `intro_ailab.html`)
assumes a near-white opaque background. If your logo PNG has a transparent background or
a very dark background, adjust the alpha formula or the `3.2` multiplier.

**Font not loading** — `intro_ailab.html` loads Barlow from Google Fonts. Make sure
the machine has internet access during render, or self-host the font and update the
`<link>` tags.
