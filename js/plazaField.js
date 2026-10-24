'use strict';
/* global DesignTheme, ResizeObserver, MutationObserver, HTMLDetailsElement, requestAnimationFrame, Player, UiPlayerInsights, PlazaTownLayout, SharedMarketMount, GAME_PHASES */

// Device-local camera: never saved or transmitted as a game action.
const PlazaField = (() => {
    let mounted = false;
    let comparisonWasOpenDuringThemeChange = false;
    let initialized = false;
    let selfIndex = 0;
    let playerCount = 0;
    let hudCurrentIndex = null;
    let marketPhase;
    let insightsIndex = null;
    let insightsListener = null;
    let insightsSession = null;
    let insightsFacts = null;
    let comparisonSignature = null;
    let cameraTransitionTimer = null;
    let focusRevealGeneration = 0;

    function clearCameraTransition() {
        if (cameraTransitionTimer !== null) clearTimeout(cameraTransitionTimer);
        cameraTransitionTimer = null;
        node('plazaWorld')?.classList.remove('plaza-camera-moving');
    }

    function animateCameraTransition() {
        clearCameraTransition();
        if (document.hidden || document.body.classList.contains('accessibility-reduced-motion') ||
                window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true) return;
        const world = node('plazaWorld');
        world?.classList.add('plaza-camera-moving');
        cameraTransitionTimer = setTimeout(clearCameraTransition, 300);
    }

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
        node('plazaPlayerInsightsHeading').textContent = `席${insightsIndex + 1}・${player.name}の街`;
        const body = node('plazaPlayerInsightsBody');
        const active = document.activeElement;
        const focusAttribute = active?.hasAttribute('data-landmark-name') ? 'data-landmark-name' : 'data-card-name';
        const focusedCard = body.contains(active) ? active?.getAttribute(focusAttribute) : null;
        const html = UiPlayerInsights.buildHtml(player, insightsFacts.escapeHtml, {
            enabledLandmarks: insightsFacts.enabledLandmarks,
            landmarkNames: Player._LANDMARK_DEFS.map(landmark => landmark.name),
            cardDefinitions: insightsFacts.cardDefinitions,
            renderFacilityArt: insightsFacts.renderFacilityArt,
        });
        if (body.innerHTML !== html) {
            const scrollTop = body.scrollTop;
            const scrollLeft = body.scrollLeft;
            body.innerHTML = html;
            body.scrollTop = scrollTop;
            body.scrollLeft = scrollLeft;
            if (focusedCard) {
                const button = Array.from(/** @type {NodeListOf<HTMLButtonElement>} */ (body.querySelectorAll('button[data-card-name], button[data-landmark-name]'))).find(item => item.getAttribute(focusAttribute) === focusedCard);
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
    let focusedTarget = 'self';
    let cameraAnchored = true;
    let anchoredGeometry = '';
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
        const height = element => Math.ceil(element.getBoundingClientRect().height);
        const statusHeight = height(node('status'));
        const hudHeight = height(node('plazaPlayerHud'));
        const toolsHeight = height(node('plazaCameraTools'));
        screen.style.setProperty('--plaza-status', `${statusHeight}px`);
        screen.style.setProperty('--plaza-hud', `${hudHeight}px`);
        screen.style.setProperty('--plaza-tools', `${toolsHeight}px`);
        screen.style.setProperty('--plaza-sidebar-actions', `${height(screen.querySelector('.game-action-toolbar'))}px`);
        const eventsHeight = `${height(node('plazaEvents'))}px`;
        screen.style.setProperty('--plaza-events', eventsHeight);
        document.body.style.setProperty('--plaza-events', eventsHeight);
        screen.style.setProperty('--plaza-top', `${statusHeight + toolsHeight + hudHeight}px`);
        screen.style.setProperty('--plaza-actions', `${height(actions)}px`);
        document.body.style.setProperty('--plaza-actions', `${height(actions)}px`);
        const bannerHeight = height(node('pwaUpdateBanner'));
        document.body.style.setProperty('--plaza-banner', `${bannerHeight}px`);
        document.body.classList.toggle('plaza-update-visible', bannerHeight > 0);
        if (cameraAnchored && !pointers.size && focusGeometry() !== anchoredGeometry) {
            focusTarget(focusedTarget, false);
        }
    }
    function focusGeometry() {
        const viewport = node('plazaViewport');
        const item = focusedTarget === 'market' ? node('buildMenu')
            : focusedTarget === 'all' ? null : node(`playerBox${Number.isInteger(focusedTarget) ? focusedTarget : selfIndex}`);
        return JSON.stringify([focusedTarget, selfIndex, viewport.clientWidth, viewport.clientHeight,
            worldWidth, worldHeight, item?.style.left, item?.style.top, item?.offsetWidth, item?.offsetHeight]);
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
        const viewport = node('plazaViewport');
        const horizontal = viewport.clientWidth >= viewport.clientHeight;
        const world = node('plazaWorld');
        world.classList.toggle('plaza-two-player-horizontal', playerCount === 2 && horizontal);
        world.classList.toggle('plaza-two-player-vertical', playerCount === 2 && !horizontal);
        const measured = PlazaTownLayout.calculate({ towns,
            marketWidth: market.offsetWidth, marketHeight: market.offsetHeight,
            orientation: horizontal ? 'landscape' : 'portrait' });
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
        document.body.classList.toggle('plaza-comparison-open', open);
        node('plazaCameraTools').querySelector('[data-field-panel="comparison"]').setAttribute('aria-expanded', String(open));
        node('cardboardCompareToggle')?.setAttribute('aria-expanded', String(open));
    }
    function toggleComparison(open = null) {
        const nextOpen = typeof open === 'boolean' ? open : node('plazaComparison').hidden;
        setEventsOpen(false);
        setLogPanelOpen(false);
        setComparisonOpen(nextOpen);
        if (nextOpen) node('plazaComparisonHeading').focus({ preventScroll: true });
        return nextOpen;
    }
    function focusComparisonToggle() {
        const cardboardToggle = node('cardboardCompareToggle');
        const plazaToggle = /** @type {HTMLElement | null} */ (node('plazaCameraTools').querySelector('[data-field-panel="comparison"]'));
        const design = document.documentElement.dataset.design;
        const preferred = design === 'cardboard' ? cardboardToggle : design === 'plaza' ? plazaToggle : null;
        // A pointer outside the menu closes its details before the overlay
        // restores focus. Reopen the original control's disclosure first.
        if (preferred) {
            for (let parent = preferred.parentElement; parent; parent = parent.parentElement) {
                if (parent.tagName === 'DETAILS') (/** @type {HTMLDetailsElement} */ (parent)).open = true;
            }
        }
        const target = preferred?.getClientRects().length
            ? preferred : /** @type {HTMLElement | null} */ (node('gameDesignThemeSelect')?.closest('details')?.querySelector('summary'));
        target?.focus({ preventScroll: true });
    }
    function renderComparison(players, enabledLandmarks, escapeHtml, cardDefinitions, renderFacilityArt, enabledCards, currentIndex, selectedIndex) {
        const landmarkNames = [...enabledLandmarks];
        const enabledNames = enabledCards instanceof Set ? enabledCards : new Set(Array.isArray(enabledCards) ? enabledCards : []);
        const signature = JSON.stringify(players.map(player => [
            player.name,
            player.cards.map(card => [card.name, player.isDormant(card)]),
            landmarkNames.map(name => [name, player.landmarks[name] === true]),
            player.hasYakusho === true,
        ]).concat([[...enabledNames].sort(), currentIndex, selectedIndex]));
        if (signature === comparisonSignature) return;
        comparisonSignature = signature;
        const definitions = new Map((Array.isArray(cardDefinitions) ? cardDefinitions : []).map(card => [card.name, card]));
        const renderArt = typeof renderFacilityArt === 'function' ? renderFacilityArt : () => '';
        const ownedNames = new Set(players.flatMap(player => player.cards.map(card => card.name)));
        const names = [...new Set([
            ...(enabledNames.size ? [...enabledNames] : [...ownedNames]),
            ...ownedNames,
        ])].filter(name => definitions.has(name)).sort((left, right) => {
            const leftRoll = Number.isFinite(definitions.get(left)?.diceNums?.[0]) ? definitions.get(left).diceNums[0] : Number.POSITIVE_INFINITY;
            const rightRoll = Number.isFinite(definitions.get(right)?.diceNums?.[0]) ? definitions.get(right).diceNums[0] : Number.POSITIVE_INFINITY;
            return leftRoll - rightRoll || left.localeCompare(right, 'ja');
        });
        const heads = players.map((player, index) => {
            const isSelected = index === selectedIndex;
            const isCurrent = index === currentIndex;
            const classes = [isSelected ? 'is-self' : '', isCurrent ? 'is-turn' : ''].filter(Boolean).join(' ');
            return `<th scope="col"${classes ? ` class="${classes}"` : ''}${isCurrent ? ' aria-current="true"' : ''}><span class="plaza-seat-mark" style="--plaza-seat-color:${seatColors[index % seatColors.length]}">席${index + 1}</span><span class="plaza-comparison-player-name" title="${escapeHtml(player.name)}">${escapeHtml(player.name)}</span>${isSelected ? '<small>あなた</small>' : ''}${isCurrent ? '<small>手番</small>' : ''}</th>`;
        }).join('');
        const rows = names.map(name => {
            const definition = definitions.get(name);
            const color = ['blue', 'green', 'red', 'purple'].includes(definition?.color) ? definition.color : 'blue';
            const dice = Array.isArray(definition?.diceNums) && definition.diceNums.length
                ? definition.diceNums.join('・') : '—';
            return `<tr class="plaza-comparison-card plaza-comparison-${color}"><th scope="row"><span class="plaza-comparison-facility-art">${renderArt(name, false, definition?.category || '')}</span><span>${escapeHtml(name)}</span><small class="plaza-comparison-dice">出目 ${escapeHtml(dice)}</small></th>${players.map(player => {
                const cards = player.cards.filter(card => card.name === name);
                const dormant = cards.filter(card => player.isDormant(card)).length;
                const classes = [player === players[selectedIndex] ? 'is-self' : '', player === players[currentIndex] ? 'is-turn' : ''].filter(Boolean).join(' ');
                const label = `${player.name}、${name}、所有${cards.length}枚${dormant ? `、休業${dormant}枚` : ''}`;
                return `<td${classes ? ` class="${classes}"` : ''} aria-label="${escapeHtml(label)}">${cards.length}${dormant ? `（休${dormant}）` : ''}</td>`;
            }).join('')}</tr>`;
        }).join('');
        const landmarks = [...enabledLandmarks].filter(name => Player.isKnownLandmark(name)).map(name => `<tr class="plaza-comparison-landmark"><th scope="row"><span class="plaza-comparison-facility-art">${renderArt(name, true)}</span><span>${escapeHtml(name)}</span></th>${players.map(player => `<td>${player.landmarks[name] ? '建設済' : '未建設'}</td>`).join('')}</tr>`).join('');
        const body = node('plazaComparisonBody');
        const scrollTop = body.scrollTop;
        const scrollLeft = body.scrollLeft;
        body.innerHTML = `<table><caption>施設の所有枚数とランドマーク</caption><thead><tr><th scope="col">施設</th>${heads}</tr></thead><tbody>${rows}${landmarks}<tr><th scope="row">役所</th>${players.map(player => `<td>${player.hasYakusho ? 'あり' : 'なし'}</td>`).join('')}</tr></tbody></table>`;
        body.scrollTop = scrollTop;
        body.scrollLeft = scrollLeft;
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
        cameraAnchored = false;
        const next = Math.max(0.12, Math.min(1.8, scale));
        const ratio = next / camera.scale;
        camera = { scale: next, x: x - (x - camera.x) * ratio, y: y - (y - camera.y) * ratio };
        paint();
    }
    function focusTarget(target, animate = true) {
        focusedTarget = target;
        cameraAnchored = true;
        if (animate) animateCameraTransition();
        node('plazaWorld').classList.toggle('plaza-field-market', target === 'market');
        node('plazaWorld').classList.toggle('plaza-field-overview', target === 'all');
        const viewport = node('plazaViewport');
        if (!viewport.clientWidth || !viewport.clientHeight) {
            pendingFocus = target;
            return;
        }
        pendingFocus = null;
        const market = node('buildMenu');
        market.classList.toggle('plaza-market-exploring', target === 'market');
        if (target === 'market') {
            market.style.width = `${Math.min(570, Math.max(200, viewport.clientWidth - 16))}px`;
        } else {
            market.style.removeProperty('width');
            market.style.removeProperty('height');
        }
        arrangeTowns();
        let x = worldWidth / 2, y = worldHeight / 2;
        if (target === 'all') camera.scale = Math.max(0.12, Math.min(viewport.clientWidth / worldWidth, viewport.clientHeight / worldHeight));
        else {
            const item = target === 'market' ? market : node(`playerBox${Number.isInteger(target) ? target : selfIndex}`);
            if (target === 'market') {
                camera.scale = Math.max(0.12, Math.min(1, (viewport.clientWidth - 16) / market.offsetWidth));
            } else {
                const preferredTownScale = 1.55;
                const widthScale = (viewport.clientWidth - 16) / Math.max(1, item?.offsetWidth || 450);
                // On tall and desktop viewports, fit the focused town vertically
                // instead of leaving the old fixed 110% cap. A short landscape
                // viewport keeps the previous close-up so the board stays legible;
                // players can pan/zoom there to inspect the whole town.
                const heightScale = viewport.clientHeight >= 320 && item?.offsetHeight
                    ? (viewport.clientHeight - 16) / item.offsetHeight
                    : 1.1;
                camera.scale = Math.max(0.12, Math.min(preferredTownScale, widthScale, heightScale));
            }
            if (item && target === 'market') item.style.height = `${Math.max(100, Math.min(470, (viewport.clientHeight - 16) / camera.scale))}px`;
            arrangeTowns();
            if (item) {
                // arrangeTowns writes the destination in inline styles. During
                // the camera's CSS transition offsetLeft/Top still describe an
                // interpolated position, which would permanently miscenter the
                // market after its width changes on a narrow viewport.
                const destinationLeft = Number.parseFloat(item.style.left);
                const destinationTop = Number.parseFloat(item.style.top);
                x = (Number.isFinite(destinationLeft) ? destinationLeft : item.offsetLeft) + item.offsetWidth / 2;
                y = (Number.isFinite(destinationTop) ? destinationTop : item.offsetTop) + item.offsetHeight / 2;
            }
        }
        camera.x = viewport.clientWidth / 2 - x * camera.scale;
        camera.y = viewport.clientHeight / 2 - y * camera.scale;
        paint();
        anchoredGeometry = focusGeometry();
    }
    function begin() {
        const points = [...pointers.values()], a = points[0], b = points[1] || a;
        gesture = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, distance: Math.hypot(a.x - b.x, a.y - b.y), camera: { ...camera }, market: points.length === 1 && a.market, scrollTop: node('buildMenu').scrollTop, mode: null };
    }
    function revealFocus(target = document.activeElement) {
        const viewport = node('plazaViewport');
        if (!mounted || pointers.size || !target || !node('plazaWorld').contains(target) ||
                !viewport.clientWidth || !viewport.clientHeight) return;
        // Native focus may scroll this transformed viewport. Paint always
        // resets that scroll, so measure in the same camera-only coordinates.
        viewport.scrollLeft = 0;
        viewport.scrollTop = 0;
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
        const dx = shift(rect.left, rect.right, bounds.left + 8, bounds.right - 8);
        const dy = shift(rect.top, rect.bottom, bounds.top + 8, bounds.bottom - 8);
        if (dx || dy) cameraAnchored = false;
        camera.x += dx;
        camera.y += dy;
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
            focusRevealGeneration++;
            clearCameraTransition();
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
            cameraAnchored = false;
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
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) clearCameraTransition();
        });
        viewport.addEventListener('focusin', event => {
            if (pointers.size) return;
            const generation = ++focusRevealGeneration;
            const target = /** @type {Element} */ (event.target);
            revealFocus(target);
            // Reconcile focus scrolling that the browser performs after the
            // event, without restoring a target the user has already left.
            requestAnimationFrame(() => {
                if (generation === focusRevealGeneration && document.activeElement === target) revealFocus(target);
            });
        });
        viewport.addEventListener('click', event => { if (dragged) { event.preventDefault(); event.stopPropagation(); dragged = false; } }, true);
        viewport.addEventListener('wheel', event => {
            if ((/** @type {Element} */ (event.target)).closest('#buildMenu')) return;
            event.preventDefault(); const p = point(event); zoom(camera.scale * Math.exp(-event.deltaY * 0.002), p.x, p.y);
        }, { passive: false });
        node('plazaCameraTools').addEventListener('click', event => {
            const button = (/** @type {HTMLElement} */ (event.target)).closest('button');
            if (!button) return;
            let focusAfterDisclosureClose = null;
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
                    toggleComparison();
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
                    focusAfterDisclosureClose = heading;
                }
            } else if (button.dataset.fieldTarget) focusTarget(button.dataset.fieldTarget);
            else if (button.dataset.fieldZoom) zoom(camera.scale * (button.dataset.fieldZoom === 'in' ? 1.2 : 1 / 1.2), viewport.clientWidth / 2, viewport.clientHeight / 2);
            const menu = button.closest('details');
            if (menu && !button.dataset.fieldZoom) menu.open = false;
            if (focusAfterDisclosureClose) {
                // A closed details element can clear focus moved during the same
                // click dispatch. Focus the market heading after that transition.
                requestAnimationFrame(() => {
                    if (focusAfterDisclosureClose.isConnected) focusAfterDisclosureClose.focus({ preventScroll: true });
                });
            }
        });
        node('plazaEvents').addEventListener('keydown', event => {
            if (event.key === 'Escape' && node('plazaEvents').classList.contains('plaza-events-expanded')) {
                event.preventDefault();
                setEventsOpen(false);
                (/** @type {HTMLElement | null} */ (node('plazaCameraTools').querySelector('[data-field-panel="events"]')))?.focus({ preventScroll: true });
            }
        });
        node('plazaComparison').addEventListener('keydown', event => {
            if (event.key === 'Escape' && !node('plazaComparison').hidden) {
                event.preventDefault();
                setComparisonOpen(false);
                focusComparisonToggle();
                return;
            }
            if (event.key === 'Tab' && !node('plazaComparison').hidden) {
                const focusable = Array.from(node('plazaComparison').querySelectorAll('button:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])'),
                    element => /** @type {HTMLElement} */ (element))
                    .filter(element => element.getClientRects().length);
                if (!focusable.length) {
                    event.preventDefault();
                    node('plazaComparisonHeading').focus({ preventScroll: true });
                    return;
                }
                const first = focusable[0];
                const last = focusable[focusable.length - 1];
                const active = document.activeElement;
                if (event.shiftKey && (active === first || active === node('plazaComparisonHeading'))) {
                    event.preventDefault();
                    last.focus({ preventScroll: true });
                } else if (!event.shiftKey && (active === last || active === node('plazaComparisonHeading'))) {
                    event.preventDefault();
                    first.focus({ preventScroll: true });
                }
            }
        });
        node('plazaComparison').addEventListener('click', event => {
            if (event.target !== node('plazaComparison') || node('plazaComparison').hidden) return;
            setComparisonOpen(false);
            focusComparisonToggle();
        });
        node('plazaLogClose').addEventListener('click', () => {
            setLogPanelOpen(false);
            (/** @type {HTMLElement} */ (node('plazaCameraTools').querySelector('[data-field-panel="log"]'))).focus({ preventScroll: true });
        });
        node('plazaComparisonClose').addEventListener('click', () => {
            setComparisonOpen(false);
            focusComparisonToggle();
        });
        document.addEventListener('design-theme-will-change', () => {
            comparisonWasOpenDuringThemeChange = !node('plazaComparison').hidden;
            if (comparisonWasOpenDuringThemeChange) setComparisonOpen(false);
        });
        document.addEventListener('design-theme-change', () => {
            if (!comparisonWasOpenDuringThemeChange) return;
            comparisonWasOpenDuringThemeChange = false;
            requestAnimationFrame(focusComparisonToggle);
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
                return;
            }
            if (event.key === 'Tab') {
                const panel = node('plazaPlayerInsights');
                const focusable = Array.from(panel.querySelectorAll('button:not([disabled]), a[href], summary, input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'),
                    element => /** @type {HTMLElement} */ (element))
                    .filter(element => element.getClientRects().length > 0);
                if (!focusable.length) {
                    event.preventDefault();
                    panel.focus();
                    return;
                }
                const first = focusable[0];
                const last = focusable[focusable.length - 1];
                if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) {
                    event.preventDefault();
                    last.focus();
                } else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) {
                    event.preventDefault();
                    first.focus();
                }
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
                const width = viewport.clientWidth, height = viewport.clientHeight;
                if (cameraAnchored && (width !== lastWidth || height !== lastHeight)) focusTarget(focusedTarget);
            }
            lastWidth = viewport.clientWidth; lastHeight = viewport.clientHeight;
            revealFocus();
        })).observe(viewport);
        document.addEventListener('design-theme-change', sync);
    }
    function sync() {
        initialize();
        const screen = node('gameScreen'), world = node('plazaWorld');
        if (!screen || !world) return;
        const enabled = document.documentElement.dataset.design === 'plaza';
        if (enabled && !mounted) {
            SharedMarketMount.mount('plaza', world, detach);
            world.append(screen.querySelector('.player-area'));
            mounted = true; requestAnimationFrame(() => { layout(); focusTarget('self'); });
        } else if (!enabled && mounted) {
            detach();
        }
    }
    function detach() {
        if (!mounted) return;
        const screen = node('gameScreen'), world = node('plazaWorld');
        clearCameraTransition();
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
        world.classList.remove('plaza-field-market', 'plaza-field-overview',
            'plaza-two-player-horizontal', 'plaza-two-player-vertical');
        screen.insertBefore(world.querySelector('.player-area'), screen.querySelector('.game-action-panel'));
        SharedMarketMount.release('plaza');
        node('buildMenu').style.removeProperty('height');
        node('buildMenu').style.removeProperty('width');
        node('buildMenu').style.removeProperty('top');
        node('buildMenu').style.removeProperty('left');
        node('buildMenu').classList.remove('plaza-market-secondary', 'plaza-market-exploring');
        marketPhase = undefined;
        world.style.removeProperty('--plaza-inverse-scale');
        pendingFocus = null;
        mounted = false;
        hudCurrentIndex = null;
        DesignTheme.arrangeGameSections(document, document.documentElement.dataset.design);
    }
    function render(players, primaryIndex, currentIndex, escapeHtml, enabledLandmarks = new Set(), sessionToken, phase, cardDefinitions, renderFacilityArt, enabledCards) {
        sync();
        // The ownership comparison is shared with the card table, whose
        // landscape renderer intentionally never mounts the plaza world.
        const comparisonSelf = primaryIndex >= 0 ? primaryIndex : currentIndex;
        renderComparison(players, enabledLandmarks, escapeHtml, cardDefinitions, renderFacilityArt, enabledCards, currentIndex, comparisonSelf);
        if (!mounted) return;
        const choosing = [GAME_PHASES.SELECT_DICE, GAME_PHASES.REROLL_CONFIRM,
            GAME_PHASES.HARBOR_CHOICE, GAME_PHASES.PENDING].includes(phase);
        if (phase !== marketPhase) node('buildMenu').classList.remove('plaza-market-exploring');
        marketPhase = phase;
        node('buildMenu').classList.toggle('plaza-market-secondary', choosing);
        // Action adoption can replace Player objects. Only the stable roster
        // token identifies a different match/resume; ordinary actions keep the panel.
        if (sessionToken !== undefined && insightsSession !== null && insightsSession !== sessionToken) {
            closePlayerInsights();
            setEventsOpen(false);
        }
        if (insightsIndex !== null && !players[insightsIndex]) closePlayerInsights();
        if (sessionToken !== undefined) insightsSession = sessionToken;
        insightsFacts = { players, escapeHtml, enabledLandmarks, cardDefinitions, renderFacilityArt };

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
                    flag.textContent = `席${index + 1}`;
                    flag.setAttribute('aria-hidden', 'true');
                    flag.dataset.playerIndex = String(index);
                    (item.querySelector('summary') || item).appendChild(flag);
                }
                const row = item.querySelector('.player-name-row');
                if (row && !row.querySelector('.plaza-seat-mark')) {
                    const mark = document.createElement('span');
                    mark.className = 'plaza-seat-mark';
                    mark.textContent = `席${index + 1}`;
                    mark.setAttribute('aria-label', `席${index + 1}`);
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
            return `<button type="button" data-player-index="${index}" style="--plaza-seat-color:${seatColors[index % seatColors.length]}" class="${index === currentIndex ? 'active' : ''}${index === selfIndex ? ' self' : ''}" aria-controls="plazaPlayerInsights" aria-expanded="${index === insightsIndex}" aria-label="席${index + 1}、${escapeHtml(player.name)}の街と施設詳細を見る${index === selfIndex ? '、あなた' : ''}${index === currentIndex ? '、手番' : ''}、${player.coins}コイン、目標${built}/${goalLandmarks.length}、${escapeHtml(Object.entries(counts).map(([color, count]) => `${{ blue: '青', green: '緑', red: '赤', purple: '紫' }[color]}${count}`).join('、'))}"${index === currentIndex ? ' aria-current="true"' : ''}><strong><span class="plaza-seat-mark">席${index + 1}</span><span class="plaza-kind-mark" aria-hidden="true">${kindIcon}</span><span class="plaza-player-name">${escapeHtml(player.name)}</span><span class="plaza-turn-mark">手番</span></strong><span class="plaza-player-coins">${player.coins}<span class="plaza-wallet-unit">コイン</span>${index === selfIndex ? '<span class="plaza-wallet-self">・自分</span>' : ''}</span><span class="plaza-player-facilities">${chips}</span><small>目標 ${built}/${goalLandmarks.length}</small></button>`;
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
        renderPlayerInsights();
        layout();
    }
    return Object.freeze({ render, sync, focusTarget, toggleComparison, selectedPlayerIndex: () => insightsIndex, setInsightsListener: listener => { insightsListener = listener; } });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = PlazaField;
if (typeof window !== 'undefined') window.PlazaField = PlazaField;
