/* global MutationObserver */
// 紙吹雪
let confettiInterval = null;
let confettiTimeout = null;
let confettiPieces = [];
let confettiResizeHandler = null;
let confettiVisibilityHandler = null;
let confettiMotionQuery = null;
let confettiMotionHandler = null;
let confettiMotionObserver = null;
let confettiViewportWidth = 0;
let confettiViewportHeight = 0;

function resizeConfettiCanvas(canvas, ctx) {
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    const ratioX = confettiViewportWidth > 0 ? width / confettiViewportWidth : 1;
    const ratioY = confettiViewportHeight > 0 ? height / confettiViewportHeight : 1;
    const devicePixelRatio = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    const pixelBudgetRatio = Math.sqrt(8_000_000 / (width * height));
    const pixelRatio = Math.min(devicePixelRatio, pixelBudgetRatio);
    for (const piece of confettiPieces) {
        piece.x *= ratioX;
        piece.y *= ratioY;
        piece.launchY *= ratioY;
    }
    confettiViewportWidth = width;
    confettiViewportHeight = height;
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform?.(pixelRatio, 0, 0, pixelRatio, 0, 0);
}

function prefersReducedMotion() {
    try {
        const appSettingEnabled = document.body && document.body.classList &&
            document.body.classList.contains('accessibility-reduced-motion');
        return appSettingEnabled || (typeof window.matchMedia === 'function' &&
            window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) {
        return false;
    }
}

function startConfetti() {
    const canvas = /** @type {HTMLCanvasElement|null} */ (document.getElementById('confettiCanvas'));
    if (!canvas) return;
    if (prefersReducedMotion()) {
        stopConfetti();
        canvas.style.display = 'none';
        return;
    }
    if (confettiInterval || confettiTimeout || confettiResizeHandler ||
            confettiVisibilityHandler || confettiMotionQuery || confettiMotionObserver) stopConfetti();
    canvas.style.display = 'block';
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        canvas.style.display = 'none';
        return;
    }
    if (confettiResizeHandler) window.removeEventListener?.('resize', confettiResizeHandler);
    confettiPieces = [];
    confettiViewportWidth = 0;
    confettiViewportHeight = 0;
    resizeConfettiCanvas(canvas, ctx);
    const colors = ['sunset', 'plaza'].includes(document.documentElement?.dataset?.design)
        ? ['#ffe1a6', '#f5c86e', '#fff1d4', '#d98a6e', '#83a49b']
        : ['#f0c040','#e94560','#3b82f6','#22c55e','#a855f7','#ffffff'];
    confettiPieces = Array.from({ length: 42 }, () => {
        const launchY = -Math.random() * 96;
        return {
            x: Math.random() * confettiViewportWidth,
            y: launchY,
            launchY,
            r: Math.random() * 2 + 2.5,
            width: Math.random() * 3 + 3,
            height: Math.random() * 8 + 5,
            color: colors[Math.floor(Math.random() * colors.length)],
            speed: Math.random() * 2 + 2.5,
            drift: (Math.random() - 0.5) * 0.8,
            gravity: 0.025 + Math.random() * 0.02,
            opacity: 0.28 + Math.random() * 0.12,
            angle: Math.random() * Math.PI * 2,
            spin: (Math.random() - 0.5) * 0.15,
        };
    });
    confettiInterval = setInterval(() => {
        ctx.clearRect(0, 0, confettiViewportWidth, confettiViewportHeight);
        for (const p of confettiPieces) {
            p.x += p.drift;
            p.y += p.speed;
            p.speed += p.gravity;
            p.angle += p.spin;
            if (p.y > confettiViewportHeight) continue;
            ctx.save();
            ctx.globalAlpha = p.opacity;
            ctx.translate(p.x, p.y);
            ctx.rotate(p.angle);
            ctx.fillStyle = p.color;
            ctx.fillRect(-p.width / 2, -p.height / 2, p.width, p.height);
            ctx.restore();
        }
    }, 16);
    confettiResizeHandler = () => resizeConfettiCanvas(canvas, ctx);
    window.addEventListener?.('resize', confettiResizeHandler, { passive: true });
    confettiVisibilityHandler = () => {
        if (document.hidden) stopConfetti();
    };
    document.addEventListener?.('visibilitychange', confettiVisibilityHandler);
    confettiMotionQuery = typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    confettiMotionHandler = event => {
        if (event.matches) stopConfetti();
    };
    if (typeof confettiMotionQuery?.addEventListener === 'function') {
        confettiMotionQuery.addEventListener('change', confettiMotionHandler);
    } else if (typeof confettiMotionQuery?.addListener === 'function') {
        confettiMotionQuery.addListener(confettiMotionHandler);
    }
    if (typeof MutationObserver === 'function' && document.body) {
        confettiMotionObserver = new MutationObserver(() => {
            if (prefersReducedMotion()) stopConfetti();
        });
        confettiMotionObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    }
    confettiTimeout = setTimeout(stopConfetti, 3600);
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
    if (confettiResizeHandler) {
        window.removeEventListener?.('resize', confettiResizeHandler);
        confettiResizeHandler = null;
    }
    if (confettiVisibilityHandler) {
        document.removeEventListener?.('visibilitychange', confettiVisibilityHandler);
        confettiVisibilityHandler = null;
    }
    if (confettiMotionQuery && confettiMotionHandler) {
        if (typeof confettiMotionQuery.removeEventListener === 'function') {
            confettiMotionQuery.removeEventListener('change', confettiMotionHandler);
        } else if (typeof confettiMotionQuery.removeListener === 'function') {
            confettiMotionQuery.removeListener(confettiMotionHandler);
        }
    }
    confettiMotionQuery = null;
    confettiMotionHandler = null;
    confettiMotionObserver?.disconnect();
    confettiMotionObserver = null;
    const canvas = /** @type {HTMLCanvasElement|null} */ (document.getElementById('confettiCanvas'));
    if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx?.setTransform?.(1, 0, 0, 1, 0, 0);
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
        canvas.style.display = 'none';
    }
    confettiViewportWidth = 0;
    confettiViewportHeight = 0;
}
