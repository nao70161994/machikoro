'use strict';
/* global DesignTheme, ResizeObserver, requestAnimationFrame */

// Device-local camera: never saved or transmitted as a game action.
const PlazaField = (() => {
    let mounted = false;
    let initialized = false;
    let selfIndex = 0;
    let camera = { x: 0, y: 0, scale: 0.75 };
    let worldHeight = 1380;
    let pendingFocus = null;
    const pointers = new Map();
    let gesture = null;
    let dragged = false;
    function clearGesture() {
        const viewport = node('plazaViewport');
        const pointerIds = [...pointers.keys()];
        pointers.clear();
        gesture = null;
        dragged = false;
        for (const pointerId of pointerIds) {
            if (viewport?.hasPointerCapture(pointerId)) viewport.releasePointerCapture(pointerId);
        }
    }
    function layout() {
        if (!mounted) return;
        const screen = node('gameScreen');
        const actions = /** @type {HTMLElement} */ (screen.querySelector('.game-action-panel'));
        const sideHud = window.matchMedia('(orientation: landscape) and (max-height: 600px)').matches;
        screen.style.setProperty('--plaza-top', `${node('status').offsetHeight + (sideHud ? 0 : node('plazaPlayerHud').offsetHeight)}px`);
        screen.style.setProperty('--plaza-actions', `${actions.offsetHeight}px`);
        document.body.style.setProperty('--plaza-actions', `${actions.offsetHeight}px`);
        document.body.style.setProperty('--plaza-banner', `${node('pwaUpdateBanner').offsetHeight}px`);
    }
    function node(id) { return document.getElementById(id); }
    function setLogPanelOpen(open) {
        node('gameLogContainer').classList.toggle('plaza-panel-open', open);
        node('plazaCameraTools').querySelector('[data-field-panel="log"]').setAttribute('aria-expanded', String(open));
        if (open && node('log').classList.contains('collapsed')) {
            (/** @type {HTMLElement} */ (node('gameLogContainer').querySelector('.log-header'))).click();
        }
    }
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
        if (!viewport.clientWidth || !viewport.clientHeight) {
            pendingFocus = target;
            return;
        }
        pendingFocus = null;
        let x = 840, y = worldHeight / 2;
        if (target === 'all') camera.scale = Math.max(0.12, Math.min(viewport.clientWidth / 1680, viewport.clientHeight / worldHeight));
        else {
            camera.scale = Math.max(0.12, target === 'market'
                ? Math.min(1, (viewport.clientWidth - 16) / 570)
                : Math.min(0.85, (viewport.clientWidth - 16) / 450));
            const item = node(target === 'market' ? 'buildMenu' : `playerBox${Number.isInteger(target) ? target : selfIndex}`);
            if (item && target === 'market') item.style.height = `${Math.max(100, Math.min(470, (viewport.clientHeight - 16) / camera.scale))}px`;
            if (item) { x = item.offsetLeft + item.offsetWidth / 2; y = item.offsetTop + item.offsetHeight / 2; }
        }
        camera.x = viewport.clientWidth / 2 - x * camera.scale;
        camera.y = viewport.clientHeight / 2 - y * camera.scale;
        paint();
    }
    function begin() {
        const points = [...pointers.values()], a = points[0], b = points[1] || a;
        gesture = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, distance: Math.hypot(a.x - b.x, a.y - b.y), camera: { ...camera }, market: points.length === 1 && a.market, scrollTop: node('buildMenu').scrollTop, mode: null };
    }
    function revealFocus(target = document.activeElement) {
        const viewport = node('plazaViewport');
        if (!mounted || pointers.size || !target || !node('plazaWorld').contains(target) ||
                !viewport.clientWidth || !viewport.clientHeight) return;
        let rect = target.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const bounds = viewport.getBoundingClientRect();
        const ratio = Math.min(1, Math.max(1, viewport.clientWidth - 16) / rect.width,
            Math.max(1, viewport.clientHeight - 16) / rect.height);
        if (ratio < 1) {
            zoom(camera.scale * ratio, viewport.clientWidth / 2, viewport.clientHeight / 2);
            rect = target.getBoundingClientRect();
        }
        const market = node('buildMenu');
        if (market.contains(target) && target !== market) {
            const marketBounds = market.getBoundingClientRect();
            const top = marketBounds.top + market.clientTop * camera.scale;
            const bottom = top + market.clientHeight * camera.scale;
            const delta = rect.top < top ? rect.top - top : rect.bottom > bottom ? rect.bottom - bottom : 0;
            if (delta) market.scrollTop += delta / camera.scale;
            rect = target.getBoundingClientRect();
        }
        const shift = (start, end, min, max) => start < min ? min - start : end > max ? max - end : 0;
        camera.x += shift(rect.left, rect.right, bounds.left + 8, bounds.right - 8);
        camera.y += shift(rect.top, rect.bottom, bounds.top + 8, bounds.bottom - 8);
        paint();
    }
    function initialize() {
        if (initialized || !node('plazaViewport')) return;
        initialized = true;
        const viewport = node('plazaViewport');
        const point = event => { const rect = viewport.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top, market: !!(/** @type {Element} */ (event.target)).closest('#buildMenu') }; };
        const end = event => {
            if (!pointers.delete(event.pointerId)) return;
            if (pointers.size) begin();
            else gesture = null;
        };
        viewport.addEventListener('pointerdown', event => {
            if (!mounted || event.button !== 0) return;
            pointers.set(event.pointerId, point(event)); dragged = false; begin();
        });
        viewport.addEventListener('pointermove', event => {
            if (!pointers.has(event.pointerId) || !gesture) return;
            if (event.pointerType === 'mouse' && !(event.buttons & 1)) {
                end(event);
                dragged = false;
                return;
            }
            pointers.set(event.pointerId, { ...point(event), market: pointers.get(event.pointerId).market });
            const points = [...pointers.values()], a = points[0], b = points[1] || a;
            const x = (a.x + b.x) / 2, y = (a.y + b.y) / 2;
            if (!dragged && points.length === 1 && Math.hypot(x - gesture.x, y - gesture.y) < 7) return;
            if (!gesture.mode) {
                const market = node('buildMenu');
                const dy = y - gesture.y;
                const canScroll = dy < 0
                    ? gesture.scrollTop < market.scrollHeight - market.clientHeight - 1
                    : gesture.scrollTop > 0;
                // Lock the gesture once: vertical movement scrolls available cards,
                // horizontal movement or an exhausted market edge moves the board.
                gesture.mode = gesture.market && Math.abs(dy) >= Math.abs(x - gesture.x) && canScroll ? 'scroll' : 'pan';
            }
            dragged = true; viewport.setPointerCapture(event.pointerId);
            if (gesture.mode === 'scroll') { node('buildMenu').scrollTop = gesture.scrollTop - (y - gesture.y) / camera.scale; return; }
            const ratio = points.length > 1 && gesture.distance > 0 ? Math.hypot(a.x - b.x, a.y - b.y) / gesture.distance : 1;
            const scale = Math.max(0.12, Math.min(1.8, gesture.camera.scale * ratio));
            camera = { scale, x: x - (gesture.x - gesture.camera.x) * scale / gesture.camera.scale, y: y - (gesture.y - gesture.camera.y) * scale / gesture.camera.scale };
            paint();
        });
        // Observe releases outside the field without capturing an ordinary card click.
        window.addEventListener('pointerup', end, true);
        window.addEventListener('pointercancel', event => {
            if (!pointers.has(event.pointerId)) return;
            end(event);
            if (!pointers.size) dragged = false;
        }, true);
        viewport.addEventListener('lostpointercapture', event => {
            // Touch starts with implicit capture on the child. Transferring it
            // to the viewport must not end the viewport's ongoing gesture.
            if (event.target === viewport) end(event);
        });
        window.addEventListener('blur', clearGesture);
        viewport.addEventListener('focusin', event => revealFocus(/** @type {Element} */ (event.target)));
        viewport.addEventListener('click', event => { if (dragged) { event.preventDefault(); event.stopPropagation(); dragged = false; } }, true);
        viewport.addEventListener('wheel', event => {
            if ((/** @type {Element} */ (event.target)).closest('#buildMenu')) return;
            event.preventDefault(); const p = point(event); zoom(camera.scale * Math.exp(-event.deltaY * 0.002), p.x, p.y);
        }, { passive: false });
        node('plazaCameraTools').addEventListener('click', event => {
            const button = (/** @type {HTMLElement} */ (event.target)).closest('button');
            if (!button) return;
            if (button.dataset.fieldPanel) {
                setLogPanelOpen(!node('gameLogContainer').classList.contains('plaza-panel-open'));
                return;
            }
            if (button.dataset.fieldTarget) focusTarget(button.dataset.fieldTarget);
            else if (button.dataset.fieldZoom) zoom(camera.scale * (button.dataset.fieldZoom === 'in' ? 1.2 : 1 / 1.2), viewport.clientWidth / 2, viewport.clientHeight / 2);
            const menu = button.closest('details');
            if (menu && !button.dataset.fieldZoom) menu.open = false;
        });
        node('plazaLogClose').addEventListener('click', () => {
            setLogPanelOpen(false);
            (/** @type {HTMLElement} */ (node('plazaCameraTools').querySelector('[data-field-panel="log"]'))).focus({ preventScroll: true });
        });
        node('plazaPlayerHud').addEventListener('click', event => {
            const button = (/** @type {HTMLElement} */ (event.target)).closest('button');
            if (button) focusTarget(Number(button.dataset.playerIndex));
        });
        // Apply dependent sizes in the next frame, outside ResizeObserver delivery.
        // Updating an observed panel here can otherwise trigger a WebKit loop error.
        let layoutPending = false;
        const observer = new ResizeObserver(() => {
            if (layoutPending) return;
            layoutPending = true;
            requestAnimationFrame(() => { layoutPending = false; layout(); });
        });
        observer.observe(node('plazaPlayerHud'));
        observer.observe(node('status'));
        observer.observe(node('pwaUpdateBanner'));
        observer.observe(node('gameScreen').querySelector('.game-action-panel'));
        let lastWidth = 0, lastHeight = 0;
        new ResizeObserver(() => requestAnimationFrame(() => {
            if (!mounted || !viewport.clientWidth || !viewport.clientHeight) return;
            layout();
            if (pendingFocus !== null) {
                focusTarget(pendingFocus);
            } else if (lastWidth && lastHeight) {
                camera.x += (viewport.clientWidth - lastWidth) / 2;
                camera.y += (viewport.clientHeight - lastHeight) / 2;
                paint();
            }
            lastWidth = viewport.clientWidth; lastHeight = viewport.clientHeight;
            revealFocus();
        })).observe(viewport);
        document.addEventListener('change', event => { if ((/** @type {HTMLElement} */ (event.target)).id === 'designThemeSelect') sync(); });
    }
    function sync() {
        initialize();
        const screen = node('gameScreen'), world = node('plazaWorld');
        if (!screen || !world) return;
        const enabled = document.documentElement.dataset.design === 'plaza';
        if (enabled && !mounted) {
            world.append(screen.querySelector('.player-area'), node('buildMenu'));
            mounted = true; requestAnimationFrame(() => { layout(); focusTarget('self'); });
        } else if (!enabled && mounted) {
            clearGesture();
            setLogPanelOpen(false);
            world.querySelectorAll('#players > .player-box').forEach(item => {
                (/** @type {HTMLElement} */ (item)).style.removeProperty('left');
                (/** @type {HTMLElement} */ (item)).style.removeProperty('top');
            });
            screen.insertBefore(world.querySelector('.player-area'), screen.querySelector('.game-action-panel'));
            screen.insertBefore(node('buildMenu'), node('turnTimeline'));
            node('buildMenu').style.removeProperty('height');
            pendingFocus = null;
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
        const focused = (/** @type {HTMLElement} */ (document.activeElement))?.closest('#plazaPlayerHud button')?.getAttribute('data-player-index');
        node('plazaPlayerHud').innerHTML = players.map((player, index) => {
            const counts = { blue: 0, green: 0, red: 0, purple: 0 };
            for (const card of player.cards) if (Object.prototype.hasOwnProperty.call(counts, card.color)) counts[card.color]++;
            const chips = Object.entries(counts).map(([color, count]) => `<span class="player-color-${color}">${{ blue: '青', green: '緑', red: '赤', purple: '紫' }[color]}${count}</span>`).join(' ');
            const built = Object.entries(player.landmarks).filter(([name, value]) => value && enabledLandmarks.has(name)).length;
            return `<button type="button" data-player-index="${index}" class="${index === currentIndex ? 'active' : ''}${index === selfIndex ? ' self' : ''}" aria-label="${escapeHtml(player.name)}の街を見る${index === selfIndex ? '、あなた' : ''}"${index === currentIndex ? ' aria-current="true"' : ''}><strong>${index + 1}. ${escapeHtml(player.name)}</strong><span>${player.coins}コイン${index === selfIndex ? '・自分' : ''}</span><span>${chips}</span><small>目標 ${built}/${enabledLandmarks.size}</small></button>`;
        }).join('');
        if (focused !== undefined && focused !== null) (/** @type {HTMLElement} */ (node('plazaPlayerHud').querySelector(`button[data-player-index="${focused}"]`)))?.focus({ preventScroll: true });
        layout();
    }
    return Object.freeze({ render, sync, focusTarget });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = PlazaField;
if (typeof window !== 'undefined') window.PlazaField = PlazaField;
