Produz ou modifica uma intro animada para o GFT AI Lab e renderiza para MP4.

## Contexto do projeto

Estamos no repositório `C:\Users\jrfc\repos\ai-lab\`. O projeto gera `intro_ailab.mp4`
(1280×720, 30fps, 3.5s) a partir de dois arquivos:

- **`intro_ailab.html`** — animação Canvas que expõe `window.__drawFrame(ms)` e usa
  `requestAnimationFrame` (substituído pelo Puppeteer na hora do render).
- **`render_intro.js`** — script Node.js/Puppeteer que: (1) sintetiza áudio via
  `OfflineAudioContext`, (2) captura 105 frames PNG chamando `__drawFrame` com clock
  virtual, (3) chama FFmpeg para montar o MP4.

Assets necessários na pasta: `logo.png` e `fluid code.jpg`.

## Tarefa a executar

$ARGUMENTS

Se nenhum argumento for passado, leia `intro_ailab.html` e `render_intro.js`, verifique
o estado atual e pergunte ao usuário o que deseja modificar (visual, áudio, duração ou
criar nova intro do zero).

## Pipeline de render

```
node render_intro.js                           # render completo (~30s)
$env:AUDIO_ONLY='1'; node render_intro.js      # só áudio (~3s, PowerShell)
```

## Regras técnicas obrigatórias

**Visual (`intro_ailab.html`):**
- `window.__drawFrame = draw` deve ser exportado para o Puppeteer chamar diretamente.
- Não usar `Date.now()` ou `performance.now()` internamente — usar apenas o parâmetro
  `ms` recebido por `draw(ms)`.
- Baking de `logo.png` (fundo opaco near-white): extrair alpha por brightness
  `alpha = clamp(0,255, (bgBrightness - pixelBrightness) * 3.2)`, cor = branco.
- Baking de `fluid code.jpg`: mascarar `fillRect(0,0,600,350)` antes da extração de
  pixels (remove logo GFT impressa no asset). Threshold delta>4, fator 2.6.
- Overlay de máscara radial no canto superior esquerdo (raio 280px) para suprimir
  resíduos do asset fluid code.

**Áudio (`render_intro.js` — bloco `page.evaluate`):**
- Usar `OfflineAudioContext` (não `AudioContext` real — não funciona no headless).
- Toda síntese deve terminar antes de `ctx.startRendering()`.
- Compressor no master bus: threshold −10dB, knee 6, ratio 3, attack 10ms, release 200ms.
- Reverb via `createConvolver()` com impulse response gerado proceduralmente
  (noise × decay exponencial).
- `WaveShaper` com oversample '4x' para saturação de brass.
- Testar com `AUDIO_ONLY=1` antes de fazer render completo.

**Render (`render_intro.js`):**
- `waitForFunction(() => window.logoWhite !== null && window.fluidCodeBaked !== null)`
  com timeout 15000ms — aguarda baking dos assets.
- Clock virtual: `page.evaluateOnNewDocument` substitui `requestAnimationFrame` por fila.
- Cada frame: chamar `__rafQueue.splice(0).forEach(cb => cb(elapsed + 1e6))` + chamar
  `window.__drawFrame(elapsed)` diretamente.
- FFmpeg: `libx264 CRF 16 preset slow, aac 192kbps, -movflags +faststart`.

## Brand GFT

| Elemento | Valor |
|---|---|
| Fundo | `#001225` (GFT Dark Navy) |
| Glow | `#5299E2` (azul suave) |
| Fonte | Barlow 300/400/600 (Google Fonts) |
| Proibido | laranja vivo, azul saturado, turquesa |

Logo sempre monocromático branco em fundo escuro.

## Sequência recomendada para mudanças de áudio

1. Modifique o bloco de síntese em `render_intro.js` (dentro de `page.evaluate`).
2. Teste: `$env:AUDIO_ONLY='1'; node render_intro.js` — verifica erros sem gastar tempo.
3. Se OK: `node render_intro.js` para render completo.
