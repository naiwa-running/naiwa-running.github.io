import { store } from './util.js';

// 全部音效都用 WebAudio 现场合成，无需任何音频文件
export const Sfx = (function () {
  let ac = null, master = null, mus = null, noiseBuf = null, lbus = null, analyser = null, lvBuf = null;
  let custom = null, customBuf = null, laughSrc = null, prevSrc = null, lvPeak = 0.05, builtinAB = null, builtinBuf = null;
  let muted = store.get('naiwa_mute', false);
  let mOn = false, mStep = 0, mNext = 0, mTimer = null, mFast = false;

  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { ac = new AC(); } catch (e) { return; }
    master = ac.createGain(); master.gain.value = muted ? 0 : 0.8; master.connect(ac.destination);
    mus = ac.createGain(); mus.gain.value = 0.5; mus.connect(master);
    // 笑声单独走一条总线，接分析器，用来让奶蛙的嘴跟着笑声一张一合
    lbus = ac.createGain(); analyser = ac.createAnalyser(); analyser.fftSize = 1024;
    lbus.connect(analyser); analyser.connect(master); lvBuf = new Float32Array(analyser.fftSize);
    if (custom) buildCustom();
    if (builtinAB) decodeBuiltin();
    for (const k in clipAB) decodeClip(k);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const b = ac.createBuffer(1, 1, 22050), s = ac.createBufferSource();
    s.buffer = b; s.connect(ac.destination); s.start(0);
  }
  function env(g, t, a, peak, dur) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }
  function tone(f0, f1, dur, type, vol, delay) {
    if (!ac) return;
    const t = ac.currentTime + (delay || 0);
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    env(g, t, 0.008, vol, dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(dur, freq, q, vol, delay, ftype, f1, out, abs) {
    if (!ac) return;
    const t = abs ? delay : ac.currentTime + (delay || 0);
    const s = ac.createBufferSource(); s.buffer = noiseBuf;
    const f = ac.createBiquadFilter(); f.type = ftype || 'bandpass';
    f.frequency.setValueAtTime(freq, t);
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    f.Q.value = q;
    const g = ac.createGain(); env(g, t, 0.005, vol, dur);
    s.connect(f); f.connect(g); g.connect(out || master); s.start(t); s.stop(t + dur + 0.05);
  }
  // "哈"：锯齿波 + 元音共振峰 + 气声
  function ha(t, f, dur, vol) {
    const o = ac.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(f * 1.08, t);
    o.frequency.exponentialRampToValueAtTime(f * 0.8, t + dur);
    const lfo = ac.createOscillator(); lfo.frequency.value = 26;
    const lg = ac.createGain(); lg.gain.value = f * 0.035; lfo.connect(lg); lg.connect(o.frequency);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.022);
    g.gain.setValueAtTime(vol * 0.8, t + dur * 0.55); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    for (const [fr, q, gn] of [[850, 5, 1], [1250, 7, 0.7], [2700, 9, 0.3]]) {
      const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = fr; bp.Q.value = q;
      const bg = ac.createGain(); bg.gain.value = gn * 2.6;
      o.connect(bp); bp.connect(bg); bg.connect(g);
    }
    g.connect(lbus); o.start(t); o.stop(t + dur + 0.05); lfo.start(t); lfo.stop(t + dur + 0.05);
    const s = ac.createBufferSource(); s.buffer = noiseBuf;
    const nf = ac.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 1700; nf.Q.value = 0.8;
    const ng = ac.createGain();
    ng.gain.setValueAtTime(0.0001, t - 0.035); ng.gain.linearRampToValueAtTime(vol * 0.45, t - 0.005);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    s.connect(nf); nf.connect(ng); ng.connect(lbus); s.start(t - 0.035); s.stop(t + 0.1);
  }
  const clipAB = {}, clipBuf = {};
  function decodeClip(name) {
    const ok = (b) => { clipBuf[name] = b; };
    try { const p = ac.decodeAudioData(clipAB[name].slice(0), ok, () => {}); if (p && p.then) p.then(ok, () => {}); } catch (e) { /* 解不出来就算了 */ }
  }
  function decodeBuiltin() {
    const ok = (b) => { builtinBuf = b; };
    try { const p = ac.decodeAudioData(builtinAB.slice(0), ok, () => {}); if (p && p.then) p.then(ok, () => {}); } catch (e) { /* 解不出来就用合成笑声 */ }
  }
  function buildCustom() {
    customBuf = ac.createBuffer(1, custom.pcm.length, custom.rate);
    customBuf.getChannelData(0).set(custom.pcm);
  }
  function stopLaugh() { try { if (laughSrc) laughSrc.stop(); } catch (e) { /* 已停止 */ } laughSrc = null; }
  function laugh() {
    if (!ac) return 0;
    stopLaugh();
    const buf = customBuf || builtinBuf;
    if (buf) {
      const s = ac.createBufferSource(); s.buffer = buf;
      const g = ac.createGain(); g.gain.value = 1.0; s.connect(g); g.connect(lbus);
      s.start(ac.currentTime + 0.05); laughSrc = s;
      return buf.duration;
    }
    synthLaugh();
    return 3.4;
  }
  function synthLaugh() {
    let t = ac.currentTime + 0.1;
    for (const [n, f0] of [[7, 590], [6, 530]]) {
      for (let i = 0; i < n; i++) { ha(t, f0 * (1 - i * 0.035) * (0.97 + Math.random() * 0.06), 0.13, 0.32); t += 0.165; }
      noise(0.28, 900, 0.7, 0.12, t + 0.02 - ac.currentTime, 'bandpass', 2400);
      t += 0.36;
    }
  }
  // 背景音乐：C–Am–F–G 轻快小调
  const MEL = [72, 76, 79, 76, 84, 79, 76, 79, 81, 79, 76, 72, 76, 77, 76, 74, 77, 81, 84, 81, 77, 76, 74, 72, 74, 79, 83, 79, 74, 76, 77, 79];
  const BASS = [48, 55, 48, 55, 45, 52, 45, 52, 41, 48, 41, 48, 43, 50, 43, 47];
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  function mNote(f, t, dur, type, vol) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(mus); o.start(t); o.stop(t + dur + 0.02);
  }
  function sched() {
    if (!ac || !mOn) return;
    const sd = mFast ? 0.15 : 0.19;
    if (mNext < ac.currentTime) mNext = ac.currentTime + 0.02;
    while (mNext < ac.currentTime + 0.15) {
      const i = mStep % 32;
      mNote(mtof(MEL[i]), mNext, sd * 0.8, 'square', 0.035);
      if (i % 2 === 0) mNote(mtof(BASS[i >> 1]), mNext, sd * 1.8, 'triangle', 0.15);
      else noise(0.03, 8000, 0.7, 0.045, mNext, 'highpass', 0, mus, true);
      mNext += sd; mStep++;
    }
  }
  return {
    init,
    get ready() { return !!ac; },
    get hasCustom() { return !!custom; },
    get customName() { return custom ? custom.name : ''; },
    get customDur() { return custom ? custom.pcm.length / custom.rate : 0; },
    setBuiltin(ab) { builtinAB = ab; if (ac) decodeBuiltin(); },
    setClip(name, ab) { clipAB[name] = ab; if (ac) decodeClip(name); },
    clip(name, vol = 1) {
      if (!ac || muted) return;
      const b = clipBuf[name]; if (!b) return;
      const s = ac.createBufferSource(), g = ac.createGain(); s.buffer = b; g.gain.value = vol; s.connect(g); g.connect(master); s.start();
    },
    setCustom(pcm, rate, name) { custom = pcm ? { pcm, rate, name } : null; customBuf = null; if (custom && ac) buildCustom(); },
    // 把用户选的音频/视频文件解码成声音
    decode(arrayBuf) {
      init();
      if (!ac) return Promise.reject(new Error('no audio'));
      return new Promise((res, rej) => {
        try { const p = ac.decodeAudioData(arrayBuf, res, rej); if (p && p.then) p.then(res, rej); } catch (e) { rej(e); }
      });
    },
    preview(buf, start, len) {
      init(); if (!ac) return;
      this.stopPreview();
      const s = ac.createBufferSource(); s.buffer = buf; s.connect(lbus); s.start(ac.currentTime + 0.02, start, len); prevSrc = s;
    },
    stopPreview() { try { if (prevSrc) prevSrc.stop(); } catch (e) { /* 已停止 */ } prevSrc = null; },
    stopLaugh,
    // 笑声当前响度 0~1
    laughLevel() {
      if (!analyser) return 0;
      analyser.getFloatTimeDomainData(lvBuf);
      let s = 0; for (let i = 0; i < lvBuf.length; i++) s += lvBuf[i] * lvBuf[i];
      const rms = Math.sqrt(s / lvBuf.length);
      lvPeak = Math.max(rms, lvPeak * 0.996, 0.02);   // 自适应音量，响的素材也不会一直张满嘴
      return Math.min(1, rms / (lvPeak * 0.8));
    },
    get muted() { return muted; },
    setMuted(m) { muted = m; store.set('naiwa_mute', m); if (master) master.gain.setTargetAtTime(m ? 0 : 0.8, ac.currentTime, 0.02); },
    egg(n) { const k = Math.pow(2, ((n - 1) % 8) / 12); tone(988 * k, 1480 * k, 0.09, 'sine', 0.2); tone(1480 * k, 1480 * k, 0.1, 'triangle', 0.07, 0.05); },
    jump(big) { tone(big ? 220 : 320, big ? 900 : 720, big ? 0.28 : 0.16, 'square', 0.05); tone(big ? 220 : 320, big ? 900 : 720, big ? 0.28 : 0.16, 'sine', 0.12); },
    slide() { noise(0.28, 1200, 0.8, 0.2, 0, 'bandpass', 300); },
    lane() { tone(600, 820, 0.05, 'triangle', 0.07); },
    land() { noise(0.08, 400, 0.7, 0.12, 0, 'lowpass'); },
    hit() { tone(220, 60, 0.3, 'sawtooth', 0.13); noise(0.18, 700, 0.7, 0.35, 0, 'lowpass'); tone(90, 50, 0.25, 'sine', 0.35); },
    siren() { for (let i = 0; i < 3; i++) { tone(740, 740, 0.14, 'square', 0.055, i * 0.3); tone(988, 988, 0.14, 'square', 0.055, i * 0.3 + 0.15); } },
    escape() { [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.14, 'triangle', 0.14, i * 0.08)); },
    pounce() { tone(420, 90, 0.35, 'square', 0.09); noise(0.3, 500, 0.6, 0.35, 0, 'lowpass'); },
    click() { tone(700, 900, 0.06, 'triangle', 0.1); },
    power() { [660, 880, 1100, 1320, 1760].forEach((f, i) => tone(f, f * 1.01, 0.12, 'triangle', 0.13, i * 0.055)); },
    flip() { noise(0.35, 500, 0.9, 0.22, 0, 'bandpass', 2600); tone(300, 900, 0.3, 'triangle', 0.08); },
    flipLand() { [784, 988, 1175, 1568].forEach((f, i) => tone(f, f, 0.16, 'triangle', 0.12, i * 0.05)); noise(0.1, 400, 0.7, 0.15, 0, 'lowpass'); },
    pop() { noise(0.2, 1500, 0.8, 0.35, 0, 'bandpass', 300); tone(900, 200, 0.18, 'sine', 0.2); },
    rocket() { noise(1.3, 260, 0.6, 0.28, 0, 'bandpass', 2400); tone(110, 420, 1.1, 'sawtooth', 0.04); },
    level() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, f, 0.16, 'square', 0.055, i * 0.08)); },
    buy() { tone(1318, 1318, 0.08, 'square', 0.07); tone(1760, 1760, 0.2, 'square', 0.07, 0.08); },
    deny() { tone(220, 160, 0.2, 'square', 0.07); },
    sad() { [[392, 370], [370, 349], [349, 330], [330, 262]].forEach(([a, b], i) => { tone(a, b, i === 3 ? 1.1 : 0.42, 'sawtooth', 0.07, i * 0.48); tone(a / 2, b / 2, i === 3 ? 1.1 : 0.42, 'triangle', 0.1, i * 0.48); }); },
    gold() { [1568, 2093, 2637].forEach((f, i) => tone(f, f * 1.003, 0.22, 'sine', 0.16, i * 0.06)); tone(3136, 3136, 0.35, 'triangle', 0.06, 0.18); },
    gulp() { for (let i = 0; i < 3; i++) { tone(260, 120, 0.12, 'sine', 0.3, i * 0.16); noise(0.08, 500, 1.2, 0.12, i * 0.16, 'lowpass'); } },
    transform() { tone(110, 880, 1.0, 'sawtooth', 0.06); tone(220, 1760, 1.0, 'square', 0.03); noise(1.0, 300, 0.6, 0.22, 0, 'bandpass', 3000); [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone(f, f, 0.2, 'triangle', 0.12, 0.7 + i * 0.07)); },
    victory() { [523, 659, 784, 1047, 784, 1047, 1319, 1568].forEach((f, i) => tone(f, f, i > 5 ? 0.4 : 0.16, 'square', 0.06, i * 0.11)); },
    laugh,
    musicStart() { if (!ac || mOn) return; mOn = true; mNext = ac.currentTime + 0.05; mTimer = setInterval(sched, 30); },
    musicStop() { mOn = false; clearInterval(mTimer); },
    musicFast(b) { mFast = b; },
  };
})();
