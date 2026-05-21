# GFT AI LAB — Intro Vídeo

Projeto para produzir intros animadas do GFT AI Lab em MP4 a partir de HTML/Canvas.

## Arquivos principais

| Arquivo | Função |
|---|---|
| `intro_ailab.html` | Animação Canvas — fonte visual do vídeo |
| `render_intro.js` | Script Puppeteer — renderiza HTML → frames → MP4 |
| `logo.png` | Logo GFT (só "GFT ■"), fundo opaco near-white `rgb(248,248,248)` |
| `fluid code.jpg` | Asset 3D de marca GFT — ribbons brancos sobre fundo cinza |
| `intro_ailab.mp4` | Output final — 1280×720, 30fps, H.264+AAC |
| `Template Slide.pdf` | Brand guide GFT (referência de cores e tipografia) |

`logo.png` e `fluid code.jpg` devem estar na mesma pasta que `intro_ailab.html`.

## Como renderizar

```powershell
node render_intro.js
```

Teste rápido só de áudio (sem capturar os 105 frames):
```powershell
$env:AUDIO_ONLY='1'; node render_intro.js
```

## Pipeline técnico

```
intro_ailab.html
  └─ Puppeteer (headless Chrome)
       ├─ evaluateOnNewDocument: sobrescreve requestAnimationFrame com fila virtual
       ├─ waitForFunction: aguarda logoWhite e fluidCodeBaked estarem prontos
       ├─ FASE 1 – OfflineAudioContext: sintetiza 3.5s de áudio → WAV
       ├─ FASE 2 – loop de frames: chama window.__drawFrame(elapsed) para cada frame
       │            captura PNG → intro_frames/frame_NNNN.png
       └─ FASE 3 – FFmpeg: frames + WAV → intro_ailab.mp4 (H.264 CRF 16, AAC 192kbps)
```

**Por que RAF virtual?** O Puppeteer não avança o clock automaticamente. Ao substituir
`requestAnimationFrame` por uma fila controlada, é possível renderizar frame a frame em
tempo determinístico sem depender do tempo real.

**Por que `BASE_TS = 1_000_000`?** Alguns browsers lançam erro se o timestamp do primeiro
frame for zero. Passar um valor alto garante que `!startTime` nunca seja verdadeiro.

## Baking de assets (pixel manipulation)

### logo.png (fundo opaco near-white)
```js
const bg = (d[0] + d[1] + d[2]) / 3;                     // brightness do pixel de canto
const alpha = clamp(0, 255, (bg - brightness) * 3.2);     // pixel escuro → opaco branco
d[i]=255; d[i+1]=255; d[i+2]=255; d[i+3]=alpha;
```

### fluid code.jpg (ribbons 3D sobre fundo claro)
```js
o2.fillRect(0, 0, 600, 350);                              // apaga logo GFT impressa no asset
const delta = bg - brightness;
const alpha = delta > 4 ? Math.min(255, (delta-4) * 2.6) : 0; // extrai sombras estruturais
```
O resultado é um canvas branco-sobre-transparente usado como overlay sobre `#001225`.

## Visual — timeline (3.5s / 30fps / 105 frames)

| Intervalo | Evento |
|---|---|
| 0–350ms | Fade-in do preto |
| 0–800ms | Fluid code fade-in |
| 350–1200ms | Logo: wipe left→right com easeInOut |
| 950–1500ms | Shimmer sweep sobre o logo |
| 1200–1650ms | Linha separadora expande do centro |
| 1550–2500ms | "AI LAB" scale 1.12→1.0 + fade-in (easeOut4) |
| 3100–3500ms | Fade-out para preto |

**Cores:** fundo `#001225` (GFT Dark Navy). Fonte: Barlow 300 58px, letter-spacing 14px.
**Drift:** fluid code oscila com `sin(ms*0.00018)*28` / `cos(ms*0.00013)*14` — escala 1.08×
para ter bleed suficiente sem expor bordas.

## Áudio — design corporativo premium (3.5s)

```
0.0–1.1s   Pad swell sutil (A2/D3/A3 sawtooth+LP, gain máx 0.022/voz)
1.1s       HIT (logo lockup):
             • Sub kick  50→28Hz, gain 0.70, decay 380ms
             • Brass stab A2/E3/A3/E4: 2× sawtooth detuned +14¢ → LP filter envelope
               (180Hz→2400Hz em 70ms, fecha para 800Hz em 1s) → WaveShaper (softclip)
             • Click transiente: noise burst bandpass 3400Hz, 40ms
             • Bells A4/E5/A5: sine puro, panned ±0.28, reverb send
             • Shimmer 5800→2900Hz, 38ms
1.55s      Acento "AI LAB": E5+A5 sine, panned ±0.3
Reverb     ConvolverNode — impulse response 1.6s, decay exponencial (tail=2.8)
Master     DynamicsCompressor: threshold −10dB, knee 6, ratio 3, attack 10ms, release 200ms
```

## Brand GFT (referência rápida)

| Cor | Hex | Uso |
|---|---|---|
| GFT Dark Navy | `#001225` | Fundo, cor primária |
| Blue glow | `#5299E2` | Glow radial atrás do logo |
| White | `#FFFFFF` | Logo, texto, separador |

Fonte substituta válida: **Barlow** (Google Fonts) — proporções similares à GFT Corporate.
Proibido no brand: laranja vivo, azul saturado, turquesa.
