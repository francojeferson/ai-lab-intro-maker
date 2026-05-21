/**
 * Renders intro_ailab.html → intro_ailab.mp4
 * 3.5 seconds, 30 fps, 1280×720, H.264 + AAC
 */
const puppeteer = require('puppeteer');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const DIR     = __dirname;
const FRAMES  = path.join(DIR, 'intro_frames');
const FPS     = 30;
const DURATION = 3.5;
const TOTAL_FRAMES = Math.ceil(FPS * DURATION);
const SR      = 44100;
const AUDIO_ONLY = process.env.AUDIO_ONLY === '1';

// FFmpeg path (WinGet install)
const FFMPEG = process.env.FFMPEG_PATH ||
    `${process.env.LOCALAPPDATA}\\Microsoft\\WinGet\\Packages\\` +
    `Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.1-full_build\\bin\\ffmpeg.exe`;

async function main() {
    // Prepare frames dir
    if (fs.existsSync(FRAMES)) {
        fs.readdirSync(FRAMES).forEach(f => fs.unlinkSync(path.join(FRAMES, f)));
    } else {
        fs.mkdirSync(FRAMES);
    }

    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security', '--allow-file-access-from-files'],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });

    // Override RAF before page scripts run
    await page.evaluateOnNewDocument(() => {
        window.__rafQueue = [];
        window.requestAnimationFrame = cb => { window.__rafQueue.push(cb); return 0; };
        window.cancelAnimationFrame = () => {};
    });

    const htmlPath = `file:///${path.join(DIR, 'intro_ailab.html').replace(/\\/g, '/')}`;
    await page.goto(htmlPath, { waitUntil: 'load' });
    await page.evaluateHandle('document.fonts.ready');
    // Wait for both logo baking and fluid code pixel extraction to complete
    await page.waitForFunction(() => window.logoWhite !== null && window.fluidCodeBaked !== null, { timeout: 15000 });
    await new Promise(r => setTimeout(r, 200));

    // ─── PHASE 1: Render audio via OfflineAudioContext ────────
    console.log('Rendering audio...');
    const wavBase64 = await page.evaluate(async (dur, sr) => {
        const ctx = new OfflineAudioContext(2, Math.ceil(sr * dur), sr);

        // ── Convolution reverb (exponential-decay impulse response) ──
        function makeReverb(decaySec, tail) {
            const len = Math.ceil(sr * decaySec);
            const buf = ctx.createBuffer(2, len, sr);
            for (let ch = 0; ch < 2; ch++) {
                const d = buf.getChannelData(ch);
                for (let i = 0; i < len; i++)
                    d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, tail);
            }
            const conv = ctx.createConvolver();
            conv.buffer = buf;
            return conv;
        }
        const reverb    = makeReverb(1.6, 2.8);
        const reverbSend = ctx.createGain();
        reverbSend.gain.setValueAtTime(0.28, 0);
        reverb.connect(reverbSend);

        // ── Soft-clip WaveShaper for brass body ───────────────────────
        function makeSaturator(amt) {
            const ws = ctx.createWaveShaper();
            const n = 512;
            const c = new Float32Array(n);
            for (let i = 0; i < n; i++) {
                const x = (i * 2) / n - 1;
                c[i] = ((Math.PI + amt) * x) / (Math.PI + amt * Math.abs(x));
            }
            ws.curve = c;
            ws.oversample = '4x';
            return ws;
        }

        // ── Master bus with compressor ────────────────────────────────
        const compressor = ctx.createDynamicsCompressor();
        compressor.threshold.setValueAtTime(-10, 0);
        compressor.knee.setValueAtTime(6, 0);
        compressor.ratio.setValueAtTime(3, 0);
        compressor.attack.setValueAtTime(0.010, 0);
        compressor.release.setValueAtTime(0.200, 0);
        compressor.connect(ctx.destination);

        const master = ctx.createGain();
        master.gain.setValueAtTime(0.80, 0);
        master.connect(compressor);
        reverbSend.connect(compressor);

        const hit = 1.1;

        // ── Pad swell (0 → 0.95s): sets atmosphere before the hit ────
        // A2/D3/A3 sawtooth through lowpass — subtle, not audible as "music"
        [110.0, 146.8, 220.0].forEach((freq, i) => {
            const osc  = ctx.createOscillator();
            const filt = ctx.createBiquadFilter();
            const gain = ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(freq * (1 + (i - 1) * 0.003), 0);
            filt.type = 'lowpass';
            filt.frequency.setValueAtTime(280, 0);
            filt.frequency.linearRampToValueAtTime(700, hit - 0.15);
            filt.Q.setValueAtTime(1.2, 0);
            gain.gain.setValueAtTime(0, 0);
            gain.gain.linearRampToValueAtTime(0.022, 0.7);
            gain.gain.linearRampToValueAtTime(0, hit); // pocket of silence right before hit
            osc.connect(filt); filt.connect(gain); gain.connect(master);
            osc.start(0); osc.stop(hit + 0.05);
        });

        // ── Sub punch at hit: tight 50 → 28 Hz kick ──────────────────
        const sub = ctx.createOscillator();
        const subG = ctx.createGain();
        sub.type = 'sine';
        sub.frequency.setValueAtTime(50, hit);
        sub.frequency.exponentialRampToValueAtTime(28, hit + 0.32);
        subG.gain.setValueAtTime(0, hit);
        subG.gain.linearRampToValueAtTime(0.70, hit + 0.009);
        subG.gain.exponentialRampToValueAtTime(0.001, hit + 0.38);
        sub.connect(subG); subG.connect(master);
        sub.start(hit); sub.stop(hit + 0.42);

        // ── Brass stab chord: A2/E3/A3/E4 ────────────────────────────
        // Two detuned sawtooths per note → LP filter envelope → WaveShaper → pan → reverb
        const brassNotes = [
            { freq: 110.0, pan: -0.35, gain: 0.30 }, // A2
            { freq: 165.0, pan: -0.12, gain: 0.24 }, // E3
            { freq: 220.0, pan:  0.12, gain: 0.22 }, // A3
            { freq: 329.6, pan:  0.35, gain: 0.18 }, // E4
        ];
        brassNotes.forEach(({ freq, pan, gain: gv }) => {
            const o1   = ctx.createOscillator();
            const o2   = ctx.createOscillator();
            const filt = ctx.createBiquadFilter();
            const sat  = makeSaturator(28);
            const gain = ctx.createGain();
            const pnr  = ctx.createStereoPanner();
            o1.type = o2.type = 'sawtooth';
            o1.frequency.setValueAtTime(freq, hit);
            o2.frequency.setValueAtTime(freq * 1.008, hit); // +14 cents detune
            filt.type = 'lowpass';
            filt.frequency.setValueAtTime(180, hit);
            filt.frequency.exponentialRampToValueAtTime(2400, hit + 0.07); // filter snap open
            filt.frequency.exponentialRampToValueAtTime(800,  hit + 1.0);  // slowly closes
            filt.Q.setValueAtTime(0.9, hit);
            gain.gain.setValueAtTime(0, hit);
            gain.gain.linearRampToValueAtTime(gv, hit + 0.011);            // hard attack
            gain.gain.exponentialRampToValueAtTime(gv * 0.38, hit + 0.28); // settle
            gain.gain.exponentialRampToValueAtTime(0.001, hit + 2.2);      // long release
            pnr.pan.setValueAtTime(pan, hit);
            o1.connect(filt); o2.connect(filt);
            filt.connect(sat); sat.connect(gain);
            gain.connect(pnr);
            pnr.connect(master); pnr.connect(reverb);
            o1.start(hit); o2.start(hit);
            o1.stop(hit + 2.4); o2.stop(hit + 2.4);
        });

        // ── High crack transient (attack click) ───────────────────────
        const crackBuf = ctx.createBuffer(1, Math.ceil(sr * 0.04), sr);
        const crackD   = crackBuf.getChannelData(0);
        for (let i = 0; i < crackD.length; i++) crackD[i] = Math.random() * 2 - 1;
        const crackSrc  = ctx.createBufferSource();
        crackSrc.buffer = crackBuf;
        const crackFilt = ctx.createBiquadFilter();
        crackFilt.type = 'bandpass';
        crackFilt.frequency.setValueAtTime(3400, hit);
        crackFilt.Q.setValueAtTime(2.2, hit);
        const crackG = ctx.createGain();
        crackG.gain.setValueAtTime(0.40, hit);
        crackG.gain.exponentialRampToValueAtTime(0.001, hit + 0.038);
        crackSrc.connect(crackFilt); crackFilt.connect(crackG); crackG.connect(master);
        crackSrc.start(hit);

        // ── Bell signature: A4/E5/A5 pure sine ───────────────────────
        // Corporate premium signature sound — clean, resonant, rings into reverb
        const bellNotes = [
            { freq: 440.0,  pan: -0.28, gv: 0.22, decay: 2.2 }, // A4
            { freq: 659.25, pan:  0.0,  gv: 0.17, decay: 2.0 }, // E5
            { freq: 880.0,  pan:  0.28, gv: 0.12, decay: 1.8 }, // A5
        ];
        const bellDelay = ctx.createDelay();
        const bellFB    = ctx.createGain();
        bellDelay.delayTime.setValueAtTime(0.16, 0);
        bellFB.gain.setValueAtTime(0.20, 0);
        bellDelay.connect(bellFB); bellFB.connect(bellDelay); bellDelay.connect(master);

        bellNotes.forEach(({ freq, pan, gv, decay }) => {
            const osc  = ctx.createOscillator();
            const gain = ctx.createGain();
            const pnr  = ctx.createStereoPanner();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, hit);
            gain.gain.setValueAtTime(0, hit);
            gain.gain.linearRampToValueAtTime(gv, hit + 0.006);
            gain.gain.exponentialRampToValueAtTime(0.001, hit + decay);
            pnr.pan.setValueAtTime(pan, hit);
            osc.connect(gain); gain.connect(pnr);
            pnr.connect(master); pnr.connect(reverb); pnr.connect(bellDelay);
            osc.start(hit); osc.stop(hit + decay + 0.3);
        });

        // ── High shimmer (air above the bells) ───────────────────────
        const shimmer  = ctx.createOscillator();
        const shimmerG = ctx.createGain();
        shimmer.type = 'sine';
        shimmer.frequency.setValueAtTime(5800, hit);
        shimmer.frequency.exponentialRampToValueAtTime(2900, hit + 0.22);
        shimmerG.gain.setValueAtTime(0, hit);
        shimmerG.gain.linearRampToValueAtTime(0.065, hit + 0.007);
        shimmerG.gain.exponentialRampToValueAtTime(0.001, hit + 0.38);
        shimmer.connect(shimmerG); shimmerG.connect(master);
        shimmer.start(hit); shimmer.stop(hit + 0.45);

        // ── "AI LAB" accent (1.55s): clean bell pair, E5+A5 ─────────
        const labHit = 1.55;
        [{ freq: 659.25, pan: -0.3 }, { freq: 880.0, pan: 0.3 }].forEach(({ freq, pan }, i) => {
            const osc  = ctx.createOscillator();
            const gain = ctx.createGain();
            const pnr  = ctx.createStereoPanner();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, labHit);
            gain.gain.setValueAtTime(0, labHit);
            gain.gain.linearRampToValueAtTime(0.055, labHit + 0.008);
            gain.gain.exponentialRampToValueAtTime(0.001, labHit + 1.6 - i * 0.2);
            pnr.pan.setValueAtTime(pan, labHit);
            osc.connect(gain); gain.connect(pnr);
            pnr.connect(master); pnr.connect(reverb);
            osc.start(labHit); osc.stop(labHit + 2.0);
        });

        const rendered = await ctx.startRendering();

        // Encode WAV → base64
        const nCh = rendered.numberOfChannels;
        const nF  = rendered.length;
        const sr2 = rendered.sampleRate;
        const bps = 2;
        const dsz = nF * nCh * bps;
        const buf = new ArrayBuffer(44 + dsz);
        const dv  = new DataView(buf);
        const ws  = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
        ws(0,'RIFF'); dv.setUint32(4, 36 + dsz, true); ws(8,'WAVE');
        ws(12,'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true);
        dv.setUint16(22, nCh, true); dv.setUint32(24, sr2, true);
        dv.setUint32(28, sr2*nCh*bps, true); dv.setUint16(32, nCh*bps, true);
        dv.setUint16(34, 16, true); ws(36,'data'); dv.setUint32(40, dsz, true);
        let off = 44;
        for (let i = 0; i < nF; i++) {
            for (let ch = 0; ch < nCh; ch++) {
                const s = Math.max(-1, Math.min(1, rendered.getChannelData(ch)[i]));
                dv.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
                off += 2;
            }
        }
        const bytes = new Uint8Array(buf);
        let bin = '';
        for (let i = 0; i < bytes.length; i += 8192) {
            bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
        }
        return btoa(bin);
    }, DURATION, SR);

    const wavPath = path.join(DIR, 'intro_audio.wav');
    fs.writeFileSync(wavPath, Buffer.from(wavBase64, 'base64'));
    console.log('  intro_audio.wav written');
    if (AUDIO_ONLY) {
        console.log('  AUDIO_ONLY mode — skipping frame capture and encoding.');
        await browser.close();
        return;
    }

    // ─── PHASE 2: Capture frames ──────────────────────────────
    console.log(`Capturing ${TOTAL_FRAMES} frames...`);
    for (let i = 0; i < TOTAL_FRAMES; i++) {
        const elapsed = (i / FPS) * 1000; // ms matching draw(elapsed)
        // Tick RAF queue AND call __drawFrame directly
        await page.evaluate((e) => {
            // Drive the RAF queue (for the page's own loop)
            window.__rafQueue.splice(0).forEach(cb => { try { cb(e + 1e6); } catch (_) {} });
            // Also call draw directly to ensure correct elapsed time
            if (window.__drawFrame) window.__drawFrame(e);
        }, elapsed);

        await page.screenshot({ path: path.join(FRAMES, `frame_${String(i).padStart(4, '0')}.png`), type: 'png' });
        if ((i + 1) % 15 === 0 || i === TOTAL_FRAMES - 1) {
            process.stdout.write(`\r  ${i + 1}/${TOTAL_FRAMES} frames`);
        }
    }
    console.log('\n  Frames done.');
    await browser.close();

    // ─── PHASE 3: Encode MP4 ──────────────────────────────────
    console.log('Encoding MP4...');
    execSync(
        `"${FFMPEG}" -y -framerate ${FPS} -i "${path.join(FRAMES, 'frame_%04d.png')}" ` +
        `-i "${wavPath}" ` +
        `-c:v libx264 -preset slow -crf 16 -pix_fmt yuv420p ` +
        `-c:a aac -b:a 192k -movflags +faststart -shortest ` +
        `"${path.join(DIR, 'intro_ailab.mp4')}"`,
        { stdio: 'inherit' }
    );

    // Cleanup
    fs.readdirSync(FRAMES).forEach(f => fs.unlinkSync(path.join(FRAMES, f)));
    fs.rmdirSync(FRAMES);
    fs.unlinkSync(wavPath);

    console.log('\nDone! → intro_ailab.mp4');
}

main().catch(e => { console.error(e.message); process.exit(1); });
