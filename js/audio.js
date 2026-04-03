// サウンド
let audioCtx = null;
let winSoundPlayed = false;

function getAudioCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
}

function playSound(type) {
    try {
        const ctx = getAudioCtx();
        if (ctx.state === 'suspended') ctx.resume();
        switch (type) {
            case 'dice': {
                const bufferSize = Math.floor(ctx.sampleRate * 0.08);
                const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
                const data = buffer.getChannelData(0);
                for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * 0.5;
                const src = ctx.createBufferSource();
                src.buffer = buffer;
                const g = ctx.createGain();
                g.gain.setValueAtTime(0.5, ctx.currentTime);
                g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
                src.connect(g); g.connect(ctx.destination);
                src.start();
                break;
            }
            case 'coin': {
                [523, 659].forEach((freq, i) => {
                    const osc = ctx.createOscillator();
                    const g = ctx.createGain();
                    osc.type = 'sine';
                    osc.connect(g); g.connect(ctx.destination);
                    const t = ctx.currentTime + i * 0.08;
                    osc.frequency.value = freq;
                    g.gain.setValueAtTime(0, t);
                    g.gain.linearRampToValueAtTime(0.15, t + 0.02);
                    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
                    osc.start(t); osc.stop(t + 0.2);
                });
                break;
            }
            case 'build': {
                const osc = ctx.createOscillator();
                const g = ctx.createGain();
                osc.type = 'triangle';
                osc.connect(g); g.connect(ctx.destination);
                osc.frequency.setValueAtTime(392, ctx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(523, ctx.currentTime + 0.1);
                g.gain.setValueAtTime(0.2, ctx.currentTime);
                g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
                osc.start(); osc.stop(ctx.currentTime + 0.35);
                break;
            }
            case 'win': {
                [523, 659, 784, 1047].forEach((freq, i) => {
                    const osc = ctx.createOscillator();
                    const g = ctx.createGain();
                    osc.connect(g); g.connect(ctx.destination);
                    osc.frequency.value = freq;
                    const t = ctx.currentTime + i * 0.12;
                    g.gain.setValueAtTime(0, t);
                    g.gain.linearRampToValueAtTime(0.2, t + 0.04);
                    g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
                    osc.start(t); osc.stop(t + 0.5);
                });
                break;
            }
        }
    } catch(e) {}
}
