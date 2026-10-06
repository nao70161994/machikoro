'use strict';
/* global DesignTheme, ResizeObserver, MutationObserver, HTMLDetailsElement, requestAnimationFrame, Player, UiPlayerInsights, PlazaTownLayout */

// Device-local camera: never saved or transmitted as a game action.
const PlazaField = (() => {
    let mounted = false;
    let initialized = false;
    let selfIndex = 0;
    let playerCount = 0;
    let hudCurrentIndex = null;
    let insightsIndex = null;
    let insightsListener = null;
    let insightsSession = null;
    let insightsFacts = null;

    function closePlayerInsights(restoreFocus = false) {
        const index = insightsIndex;
        insightsIndex = null;
        node('plazaPlayerInsights').hidden = true;
        delete node('plazaPlayerInsights').dataset.playerIndex;
        node('plazaPlayerHud').querySelectorAll('[aria-controls="plazaPlayerInsights"]').forEach(button => button.setAttribute('aria-expanded', 'false'));
        if (restoreFocus && index !== null) {
            /** @type {HTMLButtonElement | null} */ (node('plazaPlayerHud').querySelector('button[data-player-index="' + index + '"]'))?.focus({ preventScroll: true });
        }
    }

    function renderPlayerInsights() {
        if (insightsIndex === null || !insightsFacts?.players[insightsIndex]) return;
        const player = insightsFacts.players[insightsIndex];
        node('plazaPlayerInsightsHeading').textContent = `${insightsIndex + 1}. ${player.name}の街`;
        const body = node('plazaPlayerInsightsBody');
        const active = document.activeElement;
        const focusedCard = body.contains(active) ? active?.getAttribute('data-card-name') : null;
        const html = UiPlayerInsights.buildHtml(player, insightsFacts.escapeHtml, {
            enabledLandmarks: insightsFacts.enabledLandmarks,
            landmarkNames: Player._LANDMARK_DEFS.map(landmark => landmark.name),
        });
        if (body.innerHTML !== html) {
            body.innerHTML = html;
            if (focusedCard) {
                const button = Array.from(/** @type {NodeListOf<HTMLButtonElement>} */ (body.querySelectorAll('button[data-card-name]'))).find(item => item.getAttribute('data-card-name') === focusedCard);
                (button || node('plazaPlayerInsightsClose')).focus({ preventScroll: true });
            }
        }
    }

    function setEventsOpen(open) {
        node('plazaEvents').classList.toggle('plaza-events-expanded', open);
        const button = node('plazaCameraTools').querySelector('[data-field-panel="events"]');
        button?.setAttribute('aria-expanded', String(open));
        sync();
    }

    function openPlayerInsights(index) {
        if (!Number.isInteger(index) || !insightsFacts?.players[index]) return;
        setComparisonOpen(false);
        setLogPanelOpen(false);
        setEventsOpen(false);
        insightsIndex = index;
        renderPlayerInsights();
        node('plazaPlayerInsights').hidden = false;
        node('plazaPlayerInsights').dataset.playerIndex = String(index);
        (/** @type {NodeListOf<HTMLButtonElement>} */ (node('plazaPlayerHud').querySelectorAll('button[aria-controls="plazaPlayerInsights"]'))).forEach(button => button.setAttribute('aria-expanded', String(Number(button.dataset.playerIndex) === index)));
        node('plazaPlayerInsightsClose').focus({ preventScroll: true });
        insightsListener?.();
    }

    let townObserver = null;
    let camera = { x: 0, y: 0, scale: 0.75 };
    let worldWidth = 1680;
    let worldHeight = 1380;
    let pendingFocus = null;
    const pointers = new Map();
    let gesture = null;
    let dragged = false;
    const seatColors = ['#efc979', '#91c9e8', '#e7a4b7', '#aed393', '#c2b0ec', '#e8b48e', '#8cd0c7', '#ddd49b', '#afbfdc', '#d9add1'];
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
        arrangeTowns();
        const screen = node('gameScreen');
        const actions = /** @type {HTMLElement} */ (screen.querySelector('.game-action-panel'));
        const sideHud = window.matchMedia('(orientation: landscape) and (max-height: 600px)').matches;
        const height = element => Math.ceil(element.getBoundingClientRect().height);
        const statusHeight = height(node('status'));
        const hudHeight = height(node('plazaPlayerHud'));
        const toolsHeight = height(node('plazaCameraTools'));
        screen.style.setProperty('--plaza-status', `${statusHeight}px`);
        screen.style.setProperty('--plaza-hud', `${hudHeight}px`);
        screen.style.setProperty('--plaza-tools', `${toolsHeight}px`);
        screen.style.setProperty('--plaza-sidebar-actions', `${height(screen.querySelector('.game-action-toolbar'))}px`);
        screen.style.setProperty('--plaza-events', `${height(node('plazaEvents'))}px`);
        screen.style.setProperty('--plaza-top', `${statusHeight + toolsHeight + (sideHud ? 0 : hudHeight)}px`);
        screen.style.setProperty('--plaza-actions', `${height(actions)}px`);
        document.body.style.setProperty('--plaza-actions', `${height(actions)}px`);
        document.body.style.setProperty('--plaza-banner', `${height(node('pwaUpdateBanner'))}px`);
    }
    function node(id) { return document.getElementById(id); }
    function arrangeTowns() {
        if (!node('plazaViewport').clientWidth || !node('plazaViewport').clientHeight) return;
        // Read all dimensions before writing positions to avoid repeated layouts.
        const towns = Array.from({ length: playerCount }, (_, index) => ({
            item: node(`playerBox${index}`), seat: (index - selfIndex + playerCount) % playerCount,
        })).filter(entry => entry.item).map(entry => ({ ...entry,
            width: entry.item.offsetWidth, height: entry.item.offsetHeight,
        }));
        const market = node('buildMenu');
        const measured = PlazaTownLayout.calculate({ towns,
            marketWidth: market.offsetWidth, marketHeight: market.offsetHeight });
        const setPixels = (item, property, value) => {
            const pixels = `${value}px`;
            if (item.style[property] !== pixels) item.style[property] = pixels;
        };
        for (const entry of towns) {
            const position = measured.positions[entry.seat];
            setPixels(entry.item, 'left', position.left);
            setPixels(entry.item, 'top', position.top);
        }
        setPixels(market, 'left', measured.marketLeft);
        setPixels(market, 'top', measured.marketTop);
        worldWidth = measured.width;
        worldHeight = measured.height;
        setPixels(node('plazaWorld'), 'width', worldWidth);
        setPixels(node('plazaWorld'), 'height', worldHeight);
    }

    function setComparisonOpen(open) {
        node('plazaComparison').hidden = !open;
        node('plazaCameraTools').querySelector('[data-field-panel="comparison"]').setAttribute('aria-expanded', String(open));
    }
    function renderComparison(players, enabledLandmarks, escapeHtml) {
        const names = [...new Set(players.flatMap(player => player.cards.map(card => card.name)))];
        const heads = players.map((player, index) => `<th scope="col"><span class="plaza-seat-mark" style="--plaza-seat-color:${seatColors[index % seatColors.length]}">${index + 1}</span>${escapeHtml(player.name)}</th>`).join('');
        const rows = names.map(name => `<tr><th scope="row">${escapeHtml(name)}</th>${players.map(player => {
            const cards = player.cards.filter(card => card.name === name);
            const dormant = cards.filter(card => player.isDormant(card)).length;
            return `<td>${cards.length}${dormant ? `（休${dormant}）` : ''}</td>`;
        }).join('')}</tr>`).join('');
        const landmarks = [...enabledLandmarks].filter(name => Player.isKnownLandmark(name)).map(name => `<tr><th scope="row">${escapeHtml(name)}</th>${players.map(player => `<td>${player.landmarks[name] ? '建設済' : '未建設'}</td>`).join('')}</tr>`).join('');
        node('plazaComparisonBody').innerHTML = `<table><caption>施設の所有枚数とランドマーク</caption><thead><tr><th scope="col">施設</th>${heads}</tr></thead><tbody>${rows}${landmarks}<tr><th scope="row">役所</th>${players.map(player => `<td>${player.hasYakusho ? 'あり' : 'なし'}</td>`).join('')}</tr></tbody></table>`;
    }
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
        camera.x = clampAxis(camera.x, worldWidth * camera.scale, viewport.clientWidth);
        camera.y = clampAxis(camera.y, worldHeight * camera.scale, viewport.clientHeight);
        const transform = `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`;
        const world = node('plazaWorld');
        if (world.style.transform !== transform) world.style.transform = transform;
        const inverseScale = String(1 / camera.scale);
        if (world.style.getPropertyValue('--plaza-inverse-scale') !== inverseScale) {
            world.style.setProperty('--plaza-inverse-scale', inverseScale);
        }
        const label = `${Math.round(camera.scale * 100)}%`;
        if (node('plazaZoomLabel').textContent !== label) node('plazaZoomLabel').textContent = label;
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
        let x = worldWidth / 2, y = worldHeight / 2;
        if (target === 'all') camera.scale = Math.max(0.12, Math.min(viewport.clientWidth / worldWidth, viewport.clientHeight / worldHeight));
        else {
            camera.scale = Math.max(0.12, target === 'market'
                ? Math.min(1, (viewport.clientWidth - 16) / 570)
                : Math.min(0.85, (viewport.clientWidth - 16) / 450));
            const item = node(target === 'market' ? 'buildMenu' : `playerBox${Number.isInteger(target) ? target : selfIndex}`);
            if (item && target === 'market') item.style.height = `${Math.max(100, Math.min(470, (viewport.clientHeight - 16) / camera.scale))}px`;
            arrangeTowns();
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
            if (button.dataset.fieldPanel || button.dataset.fieldSection || button.dataset.fieldTarget) closePlayerInsights();
            if (button.dataset.fieldPanel) {
                if (button.dataset.fieldPanel === 'events') {
                    setComparisonOpen(false);
                    setLogPanelOpen(false);
                    setEventsOpen(!node('plazaEvents').classList.contains('plaza-events-expanded'));
                    return;
                }
                setEventsOpen(false);
                if (button.dataset.fieldPanel === 'comparison') {
                    setLogPanelOpen(false);
                    setComparisonOpen(node('plazaComparison').hidden);
                } else {
                    setComparisonOpen(false);
                    setLogPanelOpen(!node('gameLogContainer').classList.contains('plaza-panel-open'));
                }
                return;
            }
            if (button.dataset.fieldSection) {
                setComparisonOpen(false);
                setLogPanelOpen(false);
                focusTarget('market');
                const market = node('buildMenu');
                const sections = Array.from(market.querySelectorAll('.build-section'));
                const section = button.dataset.fieldSection === 'facilities'
                    ? market.querySelector('.build-card-section')
                    : sections.find(item => !item.classList.contains('build-card-section'));
                const heading = /** @type {HTMLElement | null} */ (section?.querySelector('h4'));
                if (heading) {
                    market.scrollTop += (heading.getBoundingClientRect().top - market.getBoundingClientRect().top) / camera.scale - 12;
                    heading.setAttribute('tabindex', '-1');
                    heading.focus({ preventScroll: true });
                }
            } else if (button.dataset.fieldTarget) focusTarget(button.dataset.fieldTarget);
            else if (button.dataset.fieldZoom) zoom(camera.scale * (button.dataset.fieldZoom === 'in' ? 1.2 : 1 / 1.2), viewport.clientWidth / 2, viewport.clientHeight / 2);
            const menu = button.closest('details');
            if (menu && !button.dataset.fieldZoom) menu.open = false;
        });
        node('plazaEvents').addEventListener('keydown', event => {
            if (event.key === 'Escape' && node('plazaEvents').classList.contains('plaza-events-expanded')) {
                event.preventDefault();
                setEventsOpen(false);
                (/** @type {HTMLElement | null} */ (node('plazaCameraTools').querySelector('[data-field-panel="events"]')))?.focus({ preventScroll: true });
            }
        });
        node('plazaLogClose').addEventListener('click', () => {
            setLogPanelOpen(false);
            (/** @type {HTMLElement} */ (node('plazaCameraTools').querySelector('[data-field-panel="log"]'))).focus({ preventScroll: true });
        });
        node('plazaComparisonClose').addEventListener('click', () => {
            setComparisonOpen(false);
            (/** @type {HTMLElement} */ (node('plazaCameraTools').querySelector('[data-field-panel="comparison"]'))).focus({ preventScroll: true });
        });
        node('plazaPlayerHud').addEventListener('click', event => {
            const button = (/** @type {HTMLElement} */ (event.target)).closest('button');
            if (button) {
                const index = Number(button.dataset.playerIndex);
                focusTarget(index);
                openPlayerInsights(index);
            }
        });
        node('plazaPlayerInsightsClose').addEventListener('click', () => closePlayerInsights(true));
        node('plazaPlayerInsights').addEventListener('keydown', event => {
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                closePlayerInsights(true);
            }
        });
        // Apply dependent sizes in the next frame, outside ResizeObserver delivery.
        // Updating an observed panel here can otherwise trigger a WebKit loop error.
        let layoutPending = false;
        const queueLayout = () => {
            if (layoutPending) return;
            layoutPending = true;
            requestAnimationFrame(() => {
                layoutPending = false; layout();
                if (mounted && node('plazaViewport').clientWidth && node('plazaViewport').clientHeight) paint();
            });
        };
        const observer = new ResizeObserver(queueLayout);
        townObserver = new ResizeObserver(queueLayout);
        // Disclosure changes must move the market and neighbouring towns before
        // the newly opened content is painted. ResizeObserver's deferred frame is
        // still used for image/font/viewport sizing, but can lag on a busy renderer.
        new MutationObserver(records => {
            if (!mounted || !node('plazaViewport').clientWidth || !node('plazaViewport').clientHeight ||
                    !records.some(record => record.target instanceof HTMLDetailsElement)) return;
            arrangeTowns();
            paint();
        }).observe(node('players'), { subtree: true, attributes: true, attributeFilter: ['open'] });
        observer.observe(node('plazaPlayerHud'));
        observer.observe(node('plazaCameraTools'));
        observer.observe(node('plazaEvents'));
        observer.observe(node('buildMenu'));
        observer.observe(node('status'));
        observer.observe(node('pwaUpdateBanner'));
        observer.observe(node('gameScreen').querySelector('.game-action-panel'));
        observer.observe(node('gameScreen').querySelector('.game-action-toolbar'));
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
            townObserver.disconnect();
            closePlayerInsights();
            insightsSession = null;
            insightsFacts = null;
            setLogPanelOpen(false);
            setComparisonOpen(false);
            world.querySelectorAll('#players > .player-box').forEach(item => {
                (/** @type {HTMLElement} */ (item)).style.removeProperty('left');
                (/** @type {HTMLElement} */ (item)).style.removeProperty('top');
                (/** @type {HTMLElement} */ (item)).style.removeProperty('--plaza-seat-color');
                item.querySelector('.plaza-seat-mark')?.remove();
                item.querySelector('.plaza-town-seat-flag')?.remove();
            });
            screen.insertBefore(world.querySelector('.player-area'), screen.querySelector('.game-action-panel'));
            screen.insertBefore(node('buildMenu'), node('turnTimeline'));
            node('buildMenu').style.removeProperty('height');
            node('buildMenu').style.removeProperty('top');
            node('buildMenu').style.removeProperty('left');
            world.style.removeProperty('--plaza-inverse-scale');
            pendingFocus = null;
            mounted = false;
            hudCurrentIndex = null;
            DesignTheme.arrangeGameSections(document, document.documentElement.dataset.design);
        }
    }
    function render(players, primaryIndex, currentIndex, escapeHtml, enabledLandmarks = new Set(), sessionToken) {
        sync(); if (!mounted) return;
        // Action adoption can replace Player objects. Only the stable roster
        // token identifies a different match/resume; ordinary actions keep the panel.
        if (sessionToken !== undefined && insightsSession !== null && insightsSession !== sessionToken) {
            closePlayerInsights();
            setEventsOpen(false);
        }
        if (insightsIndex !== null && !players[insightsIndex]) closePlayerInsights();
        if (sessionToken !== undefined) insightsSession = sessionToken;
        insightsFacts = { players, escapeHtml, enabledLandmarks };

        selfIndex = primaryIndex >= 0 ? primaryIndex : currentIndex;
        playerCount = players.length;
        townObserver.disconnect();
        players.forEach((player, index) => {
            const item = node(`playerBox${index}`);
            if (item) {
                townObserver.observe(item);
                item.style.setProperty('--plaza-seat-color', seatColors[index % seatColors.length]);
                if (!item.querySelector('.plaza-town-seat-flag')) {
                    const flag = document.createElement('span');
                    flag.className = 'plaza-town-seat-flag';
                    flag.textContent = String(index + 1);
                    flag.setAttribute('aria-hidden', 'true');
                    flag.dataset.playerIndex = String(index);
                    (item.querySelector('summary') || item).appendChild(flag);
                }
                const row = item.querySelector('.player-name-row');
                if (row && !row.querySelector('.plaza-seat-mark')) {
                    const mark = document.createElement('span');
                    mark.className = 'plaza-seat-mark';
                    mark.textContent = String(index + 1);
                    mark.setAttribute('aria-label', `プレイヤー${index + 1}`);
                    row.prepend(mark);
                }
            }
        });
        const focused = (/** @type {HTMLElement} */ (document.activeElement))?.closest('#plazaPlayerHud button')?.getAttribute('data-player-index');
        const previousScroll = node('plazaPlayerHud').querySelector('.plaza-hud-opponents')?.scrollLeft || 0;
        const hudButtons = players.map((player, index) => {
            const counts = { blue: 0, green: 0, red: 0, purple: 0 };
            for (const card of player.cards) if (Object.prototype.hasOwnProperty.call(counts, card.color)) counts[card.color]++;
            const chips = Object.entries(counts).map(([color, count]) => `<span class="player-color-${color}">${{ blue: '青', green: '緑', red: '赤', purple: '紫' }[color]}${count}</span>`).join(' ');
            const goalLandmarks = [...enabledLandmarks].filter(name => Player.isKnownLandmark(name));
            const built = goalLandmarks.filter(name => player.landmarks[name] === true).length;
            const kindIcon = node(`playerBox${index}`)?.querySelector('.player-icon')?.innerHTML || '';
            return `<button type="button" data-player-index="${index}" style="--plaza-seat-color:${seatColors[index % seatColors.length]}" class="${index === currentIndex ? 'active' : ''}${index === selfIndex ? ' self' : ''}" aria-controls="plazaPlayerInsights" aria-expanded="${index === insightsIndex}" aria-label="プレイヤー${index + 1}、${escapeHtml(player.name)}の街と施設詳細を見る${index === selfIndex ? '、あなた' : ''}、${player.coins}コイン、目標${built}/${goalLandmarks.length}、${escapeHtml(Object.entries(counts).map(([color, count]) => `${{ blue: '青', green: '緑', red: '赤', purple: '紫' }[color]}${count}`).join('、'))}"${index === currentIndex ? ' aria-current="true"' : ''}><strong><span class="plaza-seat-mark">${index + 1}</span><span class="plaza-kind-mark" aria-hidden="true">${kindIcon}</span><span class="plaza-player-name">${escapeHtml(player.name)}</span></strong><span class="plaza-player-coins">${player.coins}コイン${index === selfIndex ? '・自分' : ''}</span><span class="plaza-player-facilities">${chips}</span><small>目標 ${built}/${goalLandmarks.length}</small></button>`;
        });
        node('plazaPlayerHud').innerHTML = `<div class="plaza-hud-self">${hudButtons[selfIndex]}</div><div class="plaza-hud-opponents" aria-label="相手の状況">${hudButtons.filter((button, index) => index !== selfIndex).join('')}</div>`;
        if (focused !== undefined && focused !== null) (/** @type {HTMLElement} */ (node('plazaPlayerHud').querySelector(`button[data-player-index="${focused}"]`)))?.focus({ preventScroll: true });
        const opponents = /** @type {HTMLElement} */ (node('plazaPlayerHud').querySelector('.plaza-hud-opponents'));
        opponents.scrollLeft = previousScroll;
        if (hudCurrentIndex !== currentIndex && focused == null &&
                window.matchMedia('(orientation: portrait) and (max-width: 600px)').matches) {
            const active = opponents.querySelector(`button[data-player-index="${currentIndex}"]`);
            if (active) {
                const bounds = opponents.getBoundingClientRect();
                const rect = active.getBoundingClientRect();
                if (rect.left < bounds.left) opponents.scrollLeft += rect.left - bounds.left;
                else if (rect.right > bounds.right) opponents.scrollLeft += rect.right - bounds.right;
            }
        }
        hudCurrentIndex = currentIndex;
        renderComparison(players, enabledLandmarks, escapeHtml);
        renderPlayerInsights();
        layout();
    }
    return Object.freeze({ render, sync, focusTarget, selectedPlayerIndex: () => insightsIndex, setInsightsListener: listener => { insightsListener = listener; } });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = PlazaField;
if (typeof window !== 'undefined') window.PlazaField = PlazaField;
