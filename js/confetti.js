// 紙吹雪
let confettiInterval = null;
let confettiTimeout = null;
let confettiPieces = [];

function prefersReducedMotion() {
    try {
        return typeof window.matchMedia === 'function' &&
            window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (e) {
        return false;
    }
}

function startConfetti() {
    const canvas = /** @type {HTMLCanvasElement|null} */ (document.getElementById('confettiCanvas'));
    if (!canvas) return;
    if (prefersReducedMotion()) {
        canvas.style.display = 'none';
        return;
    }
    canvas.style.display = 'block';
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
    const colors = ['#f0c040','#e94560','#3b82f6','#22c55e','#a855f7','#ffffff'];
    confettiPieces = Array.from({ length: 80 }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height - canvas.height,
        r: Math.random() * 5 + 3,
        color: colors[Math.floor(Math.random() * colors.length)],
        speed: Math.random() * 2.5 + 1,
        angle: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.15,
    }));
    if (confettiInterval) clearInterval(confettiInterval);
    if (confettiTimeout) clearTimeout(confettiTimeout);
    confettiInterval = setInterval(() => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        for (const p of confettiPieces) {
            p.y += p.speed;
            p.angle += p.spin;
            if (p.y > canvas.height) p.y = -10;
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.angle);
            ctx.fillStyle = p.color;
            ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 1.8);
            ctx.restore();
        }
    }, 16);
    confettiTimeout = setTimeout(stopConfetti, 5000);
}

function stopConfetti() {
    if (confettiInterval) {
        clearInterval(confettiInterval);
        confettiInterval = null;
    }
    if (confettiTimeout) {
        clearTimeout(confettiTimeout);
        confettiTimeout = null;
    }
    const canvas = /** @type {HTMLCanvasElement|null} */ (document.getElementById('confettiCanvas'));
    if (canvas) {
        const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        canvas.style.display = 'none';
    }
}
