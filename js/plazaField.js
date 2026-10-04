'use strict';
/* global DesignTheme, ResizeObserver, requestAnimationFrame */

// Device-local camera: never saved or transmitted as a game action.
const PlazaField = (() => {
    let mounted = false;
    let initialized = false;
    let selfIndex = 0;
    let camera = { x: 0, y: 0, scale: 0.75 };
    let worldHeight = 1380;
    const pointers = new Map();
    let gesture = null;
    let dragged = false;
    function node(id) { return document.getElementById(id); }
    function paint() {
        const viewport = node('plazaViewport');
        viewport.scrollLeft = 0;
        viewport.scrollTop = 0;
        const clampAxis = (value, size, extent) => size <= extent
            ? Math.max((extent - size) / 2 - 80, Math.min((extent - size) / 2 + 80, value))
            : Math.max(extent - size - 80, Math.min(80, value));
        camera.x = clampAxis(camera.x, 1680 * camera.scale, viewport.clientWidth);
        camera.y = clampAxis(camera.y, worldHeight * camera.scale, viewport.clientHeight);
        node('plazaWorld').style.transform = `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`;
        node('plazaZoomLabel').textContent = `${Math.round(camera.scale * 100)}%`;
    }
    function zoom(scale, x, y) {
        const next = Math.max(0.12, Math.min(1.8, scale));
        const ratio = next / camera.scale;
        camera = { scale: next, x: x - (x - camera.x) * ratio, y: y - (y - camera.y) * ratio };
        paint();
    }
    function focusTarget(target) {
        const viewport = node('plazaViewport');
        let x = 840, y = worldHeight / 2;
        if (target === 'all') camera.scale = Math.max(0.12, Math.min(viewport.clientWidth / 1680, viewport.clientHeight / worldHeight));
        else {
            camera.scale = target === 'market' ? 0.8 : 0.85;
            const item = node(target === 'market' ? 'buildMenu' : `playerBox${Number.isInteger(target) ? target : selfIndex}`);
            if (item) { x = item.offsetLeft + item.offsetWidth / 2; y = item.offsetTop + item.offsetHeight / 2; }
        }
        camera.x = viewport.clientWidth / 2 - x * camera.scale;
        camera.y = viewport.clientHeight / 2 - y * camera.scale;
        paint();
    }
    function begin() {
        const points = [...pointers.values()], a = points[0], b = points[1] || a;
        gesture = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, distance: Math.hypot(a.x - b.x, a.y - b.y), camera: { ...camera } };
    }
    function initialize() {
        if (initialized || !node('plazaViewport')) return;
        initialized = true;
        const viewport = node('plazaViewport');
        const point = event => { const rect = viewport.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top }; };
        viewport.addEventListener('pointerdown', event => {
            if (event.button !== 0) return;
            if ((/** @type {Element} */ (event.target)).closest('#buildMenu')) return;
            pointers.set(event.pointerId, point(event)); dragged = false; begin();
        });
        viewport.addEventListener('pointermove', event => {
            if (!pointers.has(event.pointerId) || !gesture) return;
            pointers.set(event.pointerId, point(event));
            const points = [...pointers.values()], a = points[0], b = points[1] || a;
            const x = (a.x + b.x) / 2, y = (a.y + b.y) / 2;
            if (!dragged && points.length === 1 && Math.hypot(x - gesture.x, y - gesture.y) < 7) return;
            dragged = true; viewport.setPointerCapture(event.pointerId);
            const ratio = points.length > 1 && gesture.distance > 0 ? Math.hypot(a.x - b.x, a.y - b.y) / gesture.distance : 1;
            const scale = Math.max(0.12, Math.min(1.8, gesture.camera.scale * ratio));
            camera = { scale, x: x - (gesture.x - gesture.camera.x) * scale / gesture.camera.scale, y: y - (gesture.y - gesture.camera.y) * scale / gesture.camera.scale };
            paint();
        });
        const end = event => { pointers.delete(event.pointerId); if (pointers.size) begin(); else gesture = null; };
        viewport.addEventListener('pointerup', end);
        viewport.addEventListener('pointercancel', end);
        viewport.addEventListener('click', event => { if (dragged) { event.preventDefault(); event.stopPropagation(); dragged = false; } }, true);
        viewport.addEventListener('wheel', event => {
            if ((/** @type {Element} */ (event.target)).closest('#buildMenu')) return;
            event.preventDefault(); const p = point(event); zoom(camera.scale * Math.exp(-event.deltaY * 0.002), p.x, p.y);
        }, { passive: false });
        node('plazaCameraTools').addEventListener('click', event => {
            const button = (/** @type {HTMLElement} */ (event.target)).closest('button');
            if (!button) return;
            if (button.dataset.fieldPanel) { node('gameLogContainer').classList.toggle('plaza-panel-open'); return; }
            if (button.dataset.fieldTarget) focusTarget(button.dataset.fieldTarget);
            else if (button.dataset.fieldZoom) zoom(camera.scale * (button.dataset.fieldZoom === 'in' ? 1.2 : 1 / 1.2), viewport.clientWidth / 2, viewport.clientHeight / 2);
        });
        node('plazaPlayerHud').addEventListener('click', event => {
            const button = (/** @type {HTMLElement} */ (event.target)).closest('button');
            if (button) focusTarget(Number(button.dataset.playerIndex));
        });
        new ResizeObserver(() => { if (mounted) focusTarget('self'); }).observe(viewport);
        document.addEventListener('change', event => { if ((/** @type {HTMLElement} */ (event.target)).id === 'designThemeSelect') sync(); });
    }
    function sync() {
        initialize();
        const screen = node('gameScreen'), world = node('plazaWorld');
        if (!screen || !world) return;
        const enabled = document.documentElement.dataset.design === 'plaza';
        if (enabled && !mounted) {
            world.append(screen.querySelector('.player-area'), node('buildMenu'));
            mounted = true; requestAnimationFrame(() => focusTarget('self'));
        } else if (!enabled && mounted) {
            world.querySelectorAll('#players > .player-box').forEach(item => {
                (/** @type {HTMLElement} */ (item)).style.removeProperty('left');
                (/** @type {HTMLElement} */ (item)).style.removeProperty('top');
            });
            screen.insertBefore(world.querySelector('.player-area'), screen.querySelector('.game-action-panel'));
            screen.insertBefore(node('buildMenu'), node('turnTimeline'));
            mounted = false;
            DesignTheme.arrangeGameSections(document, document.documentElement.dataset.design);
        }
    }
    function render(players, primaryIndex, currentIndex, escapeHtml, enabledLandmarks = new Set()) {
        sync(); if (!mounted) return;
        selfIndex = primaryIndex >= 0 ? primaryIndex : currentIndex;
        const positions = [[580, 970], [70, 470], [580, 30], [1150, 470]];
        players.forEach((player, index) => {
            const item = node(`playerBox${index}`), seat = (index - selfIndex + players.length) % players.length;
            const p = positions[seat] || [70 + ((seat - 4) % 3) * 530, 1250 + Math.floor((seat - 4) / 3) * 380];
            if (item) { item.style.left = `${p[0]}px`; item.style.top = `${p[1]}px`; }
        });
        worldHeight = players.length > 4 ? 1640 + Math.floor((players.length - 5) / 3) * 380 : 1380;
        node('plazaWorld').style.height = `${worldHeight}px`;
        node('plazaPlayerHud').innerHTML = players.map((player, index) => {
            const counts = { blue: 0, green: 0, red: 0, purple: 0 };
            for (const card of player.cards) if (Object.prototype.hasOwnProperty.call(counts, card.color)) counts[card.color]++;
            const chips = Object.entries(counts).map(([color, count]) => `<span class="player-color-${color}">${{ blue: '青', green: '緑', red: '赤', purple: '紫' }[color]}${count}</span>`).join(' ');
            const built = Object.entries(player.landmarks).filter(([name, value]) => value && enabledLandmarks.has(name)).length;
            return `<button type="button" data-player-index="${index}" class="${index === currentIndex ? 'active' : ''}" aria-label="${escapeHtml(player.name)}の街を見る"><strong>${index === selfIndex ? 'あなた: ' : ''}${escapeHtml(player.name)}</strong><span>${player.coins}コイン</span><span>${chips}</span><small>目標 ${built}/${enabledLandmarks.size}</small></button>`;
        }).join('');
    }
    return Object.freeze({ render, sync, focusTarget });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = PlazaField;
if (typeof window !== 'undefined') window.PlazaField = PlazaField;
