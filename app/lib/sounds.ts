let audioCtx: AudioContext | null = null;

function getCtx() {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

function playTone(freq: number, duration: number, type: OscillatorType = "sine", volume = 0.08) {
  try {
    const ctx = getCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch {}
}

export function playConfetti() {
  playTone(800, 0.1, "sine", 0.06);
  setTimeout(() => playTone(1000, 0.1, "sine", 0.06), 80);
  setTimeout(() => playTone(1200, 0.15, "sine", 0.06), 160);
}

export function playSuccess() {
  playTone(523, 0.1, "sine", 0.07);
  setTimeout(() => playTone(659, 0.1, "sine", 0.07), 100);
  setTimeout(() => playTone(784, 0.2, "sine", 0.07), 200);
}

export function playClick() {
  playTone(600, 0.04, "square", 0.03);
}

export function playOffer() {
  playTone(440, 0.1, "sine", 0.06);
  setTimeout(() => playTone(660, 0.15, "sine", 0.06), 120);
}

export function playLegendary() {
  playTone(523, 0.15, "sine", 0.08);
  setTimeout(() => playTone(659, 0.15, "sine", 0.08), 150);
  setTimeout(() => playTone(784, 0.15, "sine", 0.08), 300);
  setTimeout(() => playTone(1047, 0.3, "sine", 0.1), 450);
  setTimeout(() => playTone(1319, 0.5, "triangle", 0.06), 700);
}
