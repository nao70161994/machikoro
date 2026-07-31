'use strict';

const CitySkyline = (() => {
    /**
     * @param {HTMLCanvasElement} canvas
     * @param {number} viewportWidth
     * @param {() => number} [random]
     * @returns {void}
     */
    function draw(canvas, viewportWidth, random = Math.random) {
        const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
        const W = viewportWidth > 480 ? 480 : viewportWidth;
        const H = 220;
        canvas.width = W;
        canvas.height = H;
        canvas.style.width = "100%";
        canvas.style.height = H + "px";

        ctx.clearRect(0, 0, W, H);

        // 夕焼けグラデーション空
        const skyGrad = ctx.createLinearGradient(0, 0, 0, H);
        skyGrad.addColorStop(0,   "#0a0a2a");
        skyGrad.addColorStop(0.3, "#1a1040");
        skyGrad.addColorStop(0.6, "#3a1020");
        skyGrad.addColorStop(0.8, "#6a2010");
        skyGrad.addColorStop(1,   "#2a0a00");
        ctx.fillStyle = skyGrad;
        ctx.fillRect(0, 0, W, H);

        // 月
        const moonX = W * 0.8;
        const moonY = H * 0.2;
        const moonGlow = ctx.createRadialGradient(moonX, moonY, 0, moonX, moonY, 35);
        moonGlow.addColorStop(0,   "rgba(255,240,180,0.3)");
        moonGlow.addColorStop(1,   "rgba(255,240,180,0)");
        ctx.fillStyle = moonGlow;
        ctx.beginPath();
        ctx.arc(moonX, moonY, 35, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(moonX, moonY, 12, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,240,200,0.9)";
        ctx.fill();

        // 星
        for (let i = 0; i < 40; i++) {
            const sx = random() * W;
            const sy = random() * H * 0.6;
            const sr = random() * 1.2;
            const alpha = 0.3 + random() * 0.7;
            ctx.beginPath();
            ctx.arc(sx, sy, sr, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255,255,255,${alpha})`;
            ctx.fill();
        }

        // 雲（薄く）
        for (let i = 0; i < 3; i++) {
            const cx = random() * W;
            const cy = H * 0.1 + random() * H * 0.3;
            const cw = 40 + random() * 60;
            const cloudGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, cw);
            cloudGrad.addColorStop(0,   "rgba(100,60,80,0.15)");
            cloudGrad.addColorStop(1,   "rgba(100,60,80,0)");
            ctx.fillStyle = cloudGrad;
            ctx.beginPath();
            ctx.ellipse(cx, cy, cw, cw * 0.4, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        // ビル（遠景・薄い）
        const farBuildings = [
            {x:0, w:30, h:80}, {x:25, w:20, h:100}, {x:40, w:35, h:70},
            {x:70, w:25, h:90}, {x:90, w:40, h:110}, {x:125, w:20, h:75},
            {x:140, w:30, h:95}, {x:165, w:45, h:120}, {x:205, w:25, h:80},
            {x:225, w:35, h:105}, {x:255, w:20, h:70}, {x:270, w:40, h:115},
            {x:305, w:30, h:85}, {x:330, w:25, h:100}, {x:350, w:45, h:130},
            {x:390, w:20, h:75}, {x:405, w:35, h:95}, {x:435, w:30, h:110},
            {x:460, w:25, h:80},
        ];

        farBuildings.forEach(b => {
            const bx = (b.x / 500) * W;
            const bw = (b.w / 500) * W;
            ctx.fillStyle = "rgba(20,10,30,0.6)";
            ctx.fillRect(bx, H - b.h, bw, b.h);
            // 窓
            const cols = Math.floor(bw / 6);
            const rows = Math.floor(b.h / 10);
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    if (random() > 0.4) {
                        const lit = random();
                        if (lit > 0.5) {
                            ctx.fillStyle = lit > 0.8
                                ? `rgba(255,220,100,${0.2 + random() * 0.3})`
                                : `rgba(150,200,255,${0.15 + random() * 0.2})`;
                            ctx.fillRect(bx + c * 6 + 1, H - b.h + r * 10 + 2, 3, 5);
                        }
                    }
                }
            }
        });

        // ビル（近景・濃い）
        const nearBuildings = [
            {x:0,   w:50,  h:150},
            {x:45,  w:65,  h:180},
            {x:105, w:40,  h:130},
            {x:140, w:60,  h:170},
            {x:195, w:35,  h:120},
            {x:225, w:70,  h:160},
            {x:290, w:45,  h:140},
            {x:330, w:60,  h:190},
            {x:385, w:40,  h:125},
            {x:420, w:55,  h:165},
            {x:470, w:35,  h:135},
        ];

        nearBuildings.forEach(b => {
            const bx = (b.x / 510) * W;
            const bw = (b.w / 510) * W;

            // ビル本体グラデーション
            const bGrad = ctx.createLinearGradient(bx, H - b.h, bx + bw, H);
            bGrad.addColorStop(0, "#0d0820");
            bGrad.addColorStop(1, "#180d30");
            ctx.fillStyle = bGrad;
            ctx.fillRect(bx, H - b.h, bw, b.h);

            // 輪郭
            ctx.strokeStyle = "rgba(80,50,120,0.4)";
            ctx.lineWidth = 0.5;
            ctx.strokeRect(bx, H - b.h, bw, b.h);

            // アンテナ
            if (random() > 0.6) {
                ctx.strokeStyle = "rgba(150,100,200,0.5)";
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(bx + bw / 2, H - b.h);
                ctx.lineTo(bx + bw / 2, H - b.h - 15);
                ctx.stroke();
                // アンテナ先端の赤ランプ
                ctx.beginPath();
                ctx.arc(bx + bw / 2, H - b.h - 15, 2, 0, Math.PI * 2);
                ctx.fillStyle = "rgba(255,50,50,0.8)";
                ctx.fill();
            }

            // 窓
            const cols = Math.floor(bw / 8);
            const rows = Math.floor(b.h / 12);
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    if (random() > 0.3) {
                        const lit = random();
                        if (lit > 0.25) {
                            const alpha = 0.4 + random() * 0.5;
                            ctx.fillStyle = lit > 0.7
                                ? `rgba(255,230,100,${alpha})`
                                : `rgba(100,180,255,${alpha * 0.7})`;
                            ctx.fillRect(bx + c * 8 + 2, H - b.h + r * 12 + 3, 4, 6);
                        }
                    }
                }
            }
        });

        // 地面・道路
        const groundGrad = ctx.createLinearGradient(0, H - 15, 0, H);
        groundGrad.addColorStop(0, "#1a0a30");
        groundGrad.addColorStop(1, "#0a0518");
        ctx.fillStyle = groundGrad;
        ctx.fillRect(0, H - 15, W, 15);

        // 道路の反射
        ctx.fillStyle = "rgba(255,150,50,0.1)";
        ctx.fillRect(0, H - 5, W, 5);

        // 水面反射効果
        nearBuildings.forEach(b => {
            const bx = (b.x / 510) * W;
            const bw = (b.w / 510) * W;
            const reflGrad = ctx.createLinearGradient(0, H - 15, 0, H - 5);
            reflGrad.addColorStop(0, "rgba(255,200,50,0.05)");
            reflGrad.addColorStop(1, "rgba(255,200,50,0)");
            ctx.fillStyle = reflGrad;
            ctx.fillRect(bx, H - 15, bw, 10);
        });

    }

    return Object.freeze({ draw });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = CitySkyline;
if (typeof window !== 'undefined') window.CitySkyline = CitySkyline;
if (typeof globalThis !== 'undefined') globalThis.CitySkyline = CitySkyline;
