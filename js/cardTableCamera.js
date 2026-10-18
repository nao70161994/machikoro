'use strict';

// The camera changes presentation only; native scrolling remains the pan mechanism.
const CardTableCamera = (() => {
    function create({ viewport, canvas, world, onViewChange = () => {}, onContextChange = /** @type {(context: { label: string, pan: string, playerIndex: number | null, canReturn: boolean }) => void} */ (() => {}) }) {
        let scale = 0.85;
        let overviewMode = true;
        let angle = 0;
        let inspectionPadding = false;
        let focusPlayer = null;
        /** @type {{ playerIndex: number, name: string } | null} */
        let inspectionAnchor = null;
        let resizeAnchorFrame = 0;
        let previousContext = '';
        let matrix = { a: scale, b: 0, c: 0, d: scale, e: 0, f: 0 };
        let state = { selfIndex: 0, currentIndex: 0, session: null };
        let session;
        let mounted = false;
        let destroyed = false;
        let frame = 0;
        /** @type {ReturnType<typeof setTimeout> | number} */
        let resizeTimer = 0;
        let lastWidth = 0;
        let lastHeight = 0;
        let drag = null;
        let suppressClick = false;
        let returnView = null;
        let pinch = null;
        let paintedView = '';
        const previousTouchAction = viewport.style.touchAction;
        viewport.style.touchAction = 'pan-x pan-y';
        const previousTabIndex = viewport.getAttribute('tabindex');
        viewport.tabIndex = 0;
        world.style.transformOrigin = '0 0';
        world.style.position = 'absolute';
        world.style.left = '0';
        world.style.top = '0';
        canvas.style.position = 'relative';
        canvas.style.overflow = 'hidden';
        viewport.style.overflow = 'auto';

        function clamp(value) { return Math.max(0.04, Math.min(1.8, value)); }
        function measure() {
            return { width: Math.max(1, world.offsetWidth), height: Math.max(1, world.offsetHeight) };
        }
        function normalizeAngle(value) {
            const quarter = Math.round((Number(value) || 0) / 90);
            return ((quarter % 4) + 4) % 4 * 90;
        }
        function rotation() {
            return [{ cosine: 1, sine: 0 }, { cosine: 0, sine: 1 },
                { cosine: -1, sine: 0 }, { cosine: 0, sine: -1 }][normalizeAngle(angle) / 90];
        }
        function worldToCanvas(point) {
            return { x: matrix.a * point.x + matrix.c * point.y + matrix.e,
                y: matrix.b * point.x + matrix.d * point.y + matrix.f };
        }
        function canvasToWorld(point) {
            const determinant = matrix.a * matrix.d - matrix.b * matrix.c;
            const x = point.x - matrix.e;
            const y = point.y - matrix.f;
            return { x: (matrix.d * x - matrix.c * y) / determinant,
                y: (-matrix.b * x + matrix.a * y) / determinant };
        }
        function clientToWorld(x, y) {
            const bounds = viewport.getBoundingClientRect();
            return canvasToWorld({ x: x - bounds.left - viewport.clientLeft + viewport.scrollLeft,
                y: y - bounds.top - viewport.clientTop + viewport.scrollTop });
        }
        function alignPoint(point, anchor) {
            const position = worldToCanvas(point);
            scroll(position.x - anchor.x, position.y - anchor.y);
        }
        function paint() {
            const size = measure();
            const { cosine, sine } = rotation();
            const corners = [[0, 0], [size.width, 0], [0, size.height], [size.width, size.height]]
                .map(([x, y]) => ({ x: cosine * x - sine * y, y: sine * x + cosine * y }));
            const minX = Math.min(...corners.map(point => point.x));
            const minY = Math.min(...corners.map(point => point.y));
            const extentX = Math.max(...corners.map(point => point.x)) - minX;
            const extentY = Math.max(...corners.map(point => point.y)) - minY;
            // Inspection must be able to center an owner at the table edge.
            // Native scroll otherwise clamps it against the screen bottom/right.
            const paddingX = inspectionPadding ? viewport.clientWidth / 2 : 0;
            const paddingY = inspectionPadding ? viewport.clientHeight / 2 : 0;
            const width = Math.max(viewport.clientWidth, Math.ceil(extentX * scale + paddingX * 2));
            const height = Math.max(viewport.clientHeight, Math.ceil(extentY * scale + paddingY * 2));
            const offsetX = Math.max(0, (width - extentX * scale) / 2);
            const offsetY = Math.max(0, (height - extentY * scale) / 2);
            matrix = { a: scale * cosine, b: scale * sine, c: -scale * sine, d: scale * cosine,
                e: offsetX - minX * scale, f: offsetY - minY * scale };
            const nextView = `${scale}:${angle}:${width}:${height}:${matrix.e}:${matrix.f}`;
            if (paintedView && paintedView !== nextView) onViewChange();
            paintedView = nextView;
            canvas.style.width = `${width}px`;
            canvas.style.height = `${height}px`;
            world.style.left = '0';
            world.style.top = '0';
            world.style.transform = `matrix(${matrix.a},${matrix.b},${matrix.c},${matrix.d},${matrix.e},${matrix.f})`;
            viewport.dataset.tableScale = scale.toFixed(3);
            viewport.dataset.tableAngle = String(normalizeAngle(angle));
            viewport.dataset.tableMode = overviewMode ? 'overview' : 'free';
            updateFocus();
        }
        function scroll(left, top) {
            viewport.scrollTo({ left: Math.max(0, left), top: Math.max(0, top), behavior: 'instant' });
            updateFocus();
            cacheInspectionAnchor();
        }
        function seat(index) {
            return [...world.querySelectorAll('.cardboard-player[data-player-index]')]
                .find(element => Number(element.dataset.playerIndex) === Number(index));
        }
        function notifyContext(label, pan, playerIndex) {
            const key = JSON.stringify([label, pan, playerIndex, Boolean(returnView)]);
            if (key === previousContext || destroyed) return;
            previousContext = key;
            onContextChange({ label, pan, playerIndex, canReturn: Boolean(returnView) });
        }
        function viewportChanged() {
            return lastWidth !== viewport.clientWidth || lastHeight !== viewport.clientHeight;
        }
        function cacheInspectionAnchor() {
            // Reflow and native scroll clamping can happen before our resize
            // RAF. They must not replace the last genuinely visible card.
            if (focusPlayer === null || viewportChanged() || resizeAnchorFrame) return;
            const player = seat(focusPlayer);
            if (!player) return;
            const clip = viewport.getBoundingClientRect();
            const center = { x: clip.left + viewport.clientWidth / 2, y: clip.top + viewport.clientHeight / 2 };
            let nearest = null;
            let distance = Infinity;
            for (const card of player.querySelectorAll('.cardboard-card[data-card-name]')) {
                const bounds = card.getBoundingClientRect();
                if (bounds.right <= clip.left || bounds.left >= clip.right || bounds.bottom <= clip.top || bounds.top >= clip.bottom) continue;
                const squared = (bounds.left + bounds.width / 2 - center.x) ** 2 + (bounds.top + bounds.height / 2 - center.y) ** 2;
                if (squared < distance) { distance = squared; nearest = card.dataset.cardName; }
            }
            inspectionAnchor = nearest ? { playerIndex: focusPlayer, name: nearest } : null;
        }
        function cancelResizeAnchor() {
            if (resizeAnchorFrame) globalThis.cancelAnimationFrame(resizeAnchorFrame);
            resizeAnchorFrame = 0;
        }
        function retainInspectionOnResize(anchor) {
            cancelResizeAnchor();
            // The table layout has its own RAF. Wait through its placement,
            // then resolve the card by identity rather than an obsolete point
            // in the previous world geometry. No inspection/return view changes.
            resizeAnchorFrame = globalThis.requestAnimationFrame(() => {
                resizeAnchorFrame = globalThis.requestAnimationFrame(() => {
                    if (destroyed || focusPlayer !== anchor.playerIndex) { resizeAnchorFrame = 0; return; }
                    const cards = /** @type {NodeListOf<HTMLElement> | undefined} */ (
                        seat(anchor.playerIndex)?.querySelectorAll('.cardboard-card[data-card-name]')
                    );
                    const card = Array.from(cards || []).find(element => element.dataset.cardName === anchor.name);
                    if (card) {
                        paint();
                        const bounds = card.getBoundingClientRect();
                        alignPoint(clientToWorld(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2),
                            { x: viewport.clientWidth / 2, y: viewport.clientHeight / 2 });
                    }
                    resizeAnchorFrame = 0;
                    updateFocus();
                    cacheInspectionAnchor();
                });
            });
        }
        function markReadingSeat(index) {
            for (const player of world.querySelectorAll('.cardboard-player[data-player-index]')) {
                player.classList.toggle('cardboard-player-reading', index !== null && Number(player.dataset.playerIndex) === index);
            }
        }
        function clearFocus() {
            focusPlayer = null;
            inspectionAnchor = null;
            cancelResizeAnchor();
            markReadingSeat(null);
            for (const attribute of ['tableFocusPlayer', 'tableFocusName', 'tableFocusLabel', 'tableFocusPan', 'tablePanHint']) {
                delete viewport.dataset[attribute];
            }
            notifyContext('カード卓', 'none', null);
        }
        function updateFocus(clearIfOutside = false) {
            if (focusPlayer === null) { clearFocus(); return; }
            const player = seat(focusPlayer);
            if (!player) { clearFocus(); return; }
            const bounds = player.getBoundingClientRect();
            const viewportBounds = viewport.getBoundingClientRect();
            const clip = { left: viewportBounds.left + viewport.clientLeft, top: viewportBounds.top + viewport.clientTop,
                right: viewportBounds.left + viewport.clientLeft + viewport.clientWidth,
                bottom: viewportBounds.top + viewport.clientTop + viewport.clientHeight };
            if (clearIfOutside && !viewportChanged() && !resizeAnchorFrame && (bounds.right <= clip.left || bounds.left >= clip.right ||
                    bounds.bottom <= clip.top || bounds.top >= clip.bottom)) { clearFocus(); return; }
            markReadingSeat(focusPlayer);
            const heading = player.querySelector('.cardboard-player-heading');
            const fullLabel = heading?.getAttribute('title') || `席${focusPlayer + 1}`;
            const name = fullLabel.replace(/^席\d+・/u, '');
            const horizontal = bounds.left < clip.left - 2 || bounds.right > clip.right + 2;
            const vertical = bounds.top < clip.top - 2 || bounds.bottom > clip.bottom + 2;
            viewport.dataset.tableFocusPlayer = String(focusPlayer);
            viewport.dataset.tableFocusName = name;
            viewport.dataset.tableFocusLabel = fullLabel;
            viewport.dataset.tableFocusPan = horizontal ? vertical ? 'both' : 'x' : vertical ? 'y' : 'none';
            viewport.dataset.tablePanHint = horizontal ? vertical ? '上下左右に移動して確認' : '左右に移動して確認'
                : vertical ? '上下に移動して確認' : '';
            notifyContext(fullLabel, viewport.dataset.tableFocusPan, focusPlayer);
        }
        function facePlayer(player) {
            angle = normalizeAngle(-Number(player?.dataset.tableAngle || 0));
        }
        function captureView() {
            const center = canvasToWorld({ x: viewport.scrollLeft + viewport.clientWidth / 2,
                y: viewport.scrollTop + viewport.clientHeight / 2 });
            const size = measure();
            return { scale, angle, overviewMode, inspectionPadding, focusPlayer, x: center.x, y: center.y,
                left: viewport.scrollLeft, top: viewport.scrollTop,
                viewportWidth: viewport.clientWidth, viewportHeight: viewport.clientHeight,
                worldWidth: size.width, worldHeight: size.height };
        }
        function rememberView() { returnView = captureView(); }
        function restoreView() {
            if (destroyed || !returnView) return false;
            cancelResizeAnchor();
            const previous = returnView;
            returnView = null;
            overviewMode = previous.overviewMode;
            scale = previous.scale;
            angle = previous.angle;
            inspectionPadding = previous.inspectionPadding;
            focusPlayer = previous.focusPlayer;
            paint();
            const size = measure();
            if (previous.viewportWidth === viewport.clientWidth && previous.viewportHeight === viewport.clientHeight &&
                    previous.worldWidth === size.width && previous.worldHeight === size.height) {
                // Avoid inverse/forward floating-point roundoff: WebKit floors
                // fractional scroll coordinates and otherwise drifts by 1px.
                scroll(previous.left, previous.top);
            } else {
                alignPoint(previous, { x: viewport.clientWidth / 2, y: viewport.clientHeight / 2 });
            }
            return true;
        }
        function focusSeat(index, preserveReadable = false) {
            if (destroyed) return;
            const player = seat(index);
            if (!player) return;
            cancelResizeAnchor();
            if (!preserveReadable) rememberView();
            focusPlayer = Number(player.dataset.playerIndex);
            overviewMode = false;
            inspectionPadding = true;
            facePlayer(player);
            // Measure the complete owner only after counter-rotating its seat.
            // Centering just the first row leaves the collection against an edge.
            paint();
            const before = player.getBoundingClientRect();
            const nativeWidth = before.width / scale;
            const nativeHeight = before.height / scale;
            const padding = viewport.clientWidth <= 480 ? 12 : 20;
            const availableWidth = Math.max(1, viewport.clientWidth - padding * 2);
            const availableHeight = Math.max(1, viewport.clientHeight - padding * 2);
            const fitWidth = availableWidth / Math.max(1, nativeWidth);
            const fitHeight = availableHeight / Math.max(1, nativeHeight);
            const readableFloor = preserveReadable ? Math.max(0.95, Math.min(scale, 1.25)) : 0.9;
            const wholeOwnerFit = Math.min(fitWidth, fitHeight);
            // A short collection fills the viewing area. A large collection
            // keeps readable cards and begins at its real top/left for panning.
            scale = clamp(wholeOwnerFit >= readableFloor
                ? Math.min(1.6, wholeOwnerFit)
                : Math.min(1.6, Math.max(readableFloor, fitWidth)));
            paint();
            const bounds = player.getBoundingClientRect();
            const wide = bounds.width > availableWidth;
            const tall = bounds.height > availableHeight;
            const point = clientToWorld(wide ? bounds.left : bounds.left + bounds.width / 2,
                tall ? bounds.top : bounds.top + bounds.height / 2);
            alignPoint(point, { x: wide ? padding : viewport.clientWidth / 2,
                y: tall ? padding : viewport.clientHeight / 2 });
        }
        function focusCard(card) {
            if (destroyed || !card?.isConnected || !world.contains(card)) return;
            const initial = card.getBoundingClientRect();
            if (!initial.width || !initial.height) return;
            cancelResizeAnchor();
            rememberView();
            const player = card.closest('.cardboard-player');
            focusPlayer = player ? Number(player.dataset.playerIndex) : null;
            overviewMode = false;
            inspectionPadding = true;
            facePlayer(player);
            paint();
            const before = card.getBoundingClientRect();
            const fitted = Math.min((viewport.clientWidth - 24) / (before.width / scale),
                (viewport.clientHeight - 24) / (before.height / scale));
            scale = clamp(Math.min(Math.max(scale, 0.85), fitted));
            paint();
            const bounds = card.getBoundingClientRect();
            alignPoint(clientToWorld(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2),
                { x: viewport.clientWidth / 2, y: viewport.clientHeight / 2 });
        }
        function focusMarket() {
            const market = world.querySelector('#cardboardCenter');
            if (destroyed || !market) return;
            rememberView();
            overviewMode = false;
            clearFocus();
            inspectionPadding = true;
            angle = 0;
            scale = clamp(Math.max(scale, 0.75));
            paint();
            market.querySelector('.compact-market-facilities')?.scrollTo({ top: 0, left: 0, behavior: 'instant' });
            const heading = market.querySelector('.compact-market-header') || market;
            const bounds = heading.getBoundingClientRect();
            const marketBounds = market.getBoundingClientRect();
            const wide = marketBounds.width > viewport.clientWidth;
            alignPoint(clientToWorld(wide ? marketBounds.left : marketBounds.left + marketBounds.width / 2, bounds.top),
                { x: wide ? 8 : viewport.clientWidth / 2, y: 8 });
        }
        function fit() {
            if (destroyed) return;
            overviewMode = true;
            clearFocus();
            inspectionPadding = false;
            returnView = null;
            angle = 0;
            const size = measure();
            scale = clamp(Math.min(viewport.clientWidth / size.width, viewport.clientHeight / size.height));
            paint();
            scroll(0, 0);
        }
        function readable() {
            if (destroyed) return;
            rememberView();
            overviewMode = false;
            scale = clamp(Math.max(0.95, scale * 1.15));
            focusSeat(state.selfIndex, true);
        }
        function zoomBy(factor, anchor = null) {
            if (destroyed || !Number.isFinite(factor) || factor <= 0) return;
            cancelResizeAnchor();
            overviewMode = false;
            const point = anchor || { x: viewport.clientWidth / 2, y: viewport.clientHeight / 2 };
            const center = canvasToWorld({ x: viewport.scrollLeft + point.x, y: viewport.scrollTop + point.y });
            scale = clamp(scale * factor);
            inspectionPadding = true;
            paint();
            alignPoint(center, point);
        }
        function layout() {
            frame = 0;
            if (destroyed) return;
            const changedSession = !mounted || session !== state.session;
            const changedViewport = lastWidth !== viewport.clientWidth || lastHeight !== viewport.clientHeight;
            if (!viewport.clientWidth || !viewport.clientHeight) return;
            const retainedCard = changedViewport && focusPlayer !== null && inspectionAnchor?.playerIndex === focusPlayer
                ? { ...inspectionAnchor } : null;
            const retainedCenter = mounted && !overviewMode ? canvasToWorld({
                x: viewport.scrollLeft + lastWidth / 2, y: viewport.scrollTop + lastHeight / 2
            }) : null;
            lastWidth = viewport.clientWidth;
            lastHeight = viewport.clientHeight;
            session = state.session;
            mounted = true;
            if (changedSession || overviewMode) fit();
            else {
                paint();
                if (retainedCard) retainInspectionOnResize(retainedCard);
                else if (changedViewport && retainedCenter) alignPoint(retainedCenter,
                    { x: viewport.clientWidth / 2, y: viewport.clientHeight / 2 });
                if (!resizeAnchorFrame) cacheInspectionAnchor();
            }
        }
        function refresh(nextState = {}) {
            if (destroyed) return;
            state = { ...state, ...nextState };
            if (!frame) frame = globalThis.requestAnimationFrame(layout);
        }
        function wheel(event) {
            cancelResizeAnchor();
            if (!event.ctrlKey && !event.metaKey) {
                const canPan = event.deltaX !== 0 && viewport.scrollWidth > viewport.clientWidth + 1 ||
                    event.deltaY !== 0 && viewport.scrollHeight > viewport.clientHeight + 1;
                if (canPan && !(event.target.closest('.compact-market-facilities'))) {
                    overviewMode = false;
                    viewport.dataset.tableMode = 'free';
                }
                return;
            }
            event.preventDefault();
            const bounds = viewport.getBoundingClientRect();
            zoomBy(Math.exp(-Math.max(-100, Math.min(100, event.deltaY)) * 0.006), {
                x: event.clientX - bounds.left - viewport.clientLeft,
                y: event.clientY - bounds.top - viewport.clientTop
            });
        }
        function keydown(event) {
            if (event.target !== viewport) return;
            cancelResizeAnchor();
            const step = event.shiftKey ? 240 : 80;
            const offsets = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
            if (offsets[event.key]) {
                overviewMode = false;
                viewport.dataset.tableMode = 'free';
                event.preventDefault();
                scroll(viewport.scrollLeft + offsets[event.key][0], viewport.scrollTop + offsets[event.key][1]);
            } else if (event.key === '+' || event.key === '=') {
                event.preventDefault();
                zoomBy(1.2);
            } else if (event.key === '-') {
                event.preventDefault();
                zoomBy(1 / 1.2);
            } else if (event.key === 'Home') {
                event.preventDefault();
                fit();
            }
        }
        function pointerdown(event) {
            cancelResizeAnchor();
            suppressClick = false;
            if (event.pointerType !== 'mouse' || event.button !== 0) return;
            if (event.target.closest('button, a, input, select, textarea, summary, [role="button"], #cardboardCenter')) return;
            drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: viewport.scrollLeft, top: viewport.scrollTop, active: false };
        }
        function pointermove(event) {
            if (!drag || drag.id !== event.pointerId) return;
            const dx = event.clientX - drag.x;
            const dy = event.clientY - drag.y;
            if (!drag.active && Math.hypot(dx, dy) < 8) return;
            if (!drag.active) {
                overviewMode = false;
                viewport.dataset.tableMode = 'free';
                drag.active = true;
                viewport.setPointerCapture(event.pointerId);
                viewport.classList.add('is-table-panning');
            }
            event.preventDefault();
            scroll(drag.left - dx, drag.top - dy);
        }
        function pointerend(event) {
            if (!drag || drag.id !== event.pointerId) return;
            suppressClick = drag.active;
            drag = null;
            viewport.classList.remove('is-table-panning');
            if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
        }
        function touchGeometry(touches) {
            if (touches.length !== 2) return null;
            const bounds = viewport.getBoundingClientRect();
            return {
                distance: Math.max(1, Math.hypot(touches[1].clientX - touches[0].clientX,
                    touches[1].clientY - touches[0].clientY)),
                x: (touches[0].clientX + touches[1].clientX) / 2 - bounds.left - viewport.clientLeft,
                y: (touches[0].clientY + touches[1].clientY) / 2 - bounds.top - viewport.clientTop
            };
        }
        function touchstart(event) {
            cancelResizeAnchor();
            const point = touchGeometry(event.touches);
            if (!point) {
                pinch = null;
                // A new one-finger gesture is intentional input. A pinch may
                // produce no synthetic click, so do not swallow its next tap.
                if (event.touches.length === 1) suppressClick = false;
                return;
            }
            const center = canvasToWorld({ x: viewport.scrollLeft + point.x, y: viewport.scrollTop + point.y });
            pinch = { distance: point.distance, scale, x: center.x, y: center.y };
        }
        function touchmove(event) {
            const point = touchGeometry(event.touches);
            if (!pinch || !point) return;
            if (event.cancelable) event.preventDefault();
            overviewMode = false;
            suppressClick = true;
            scale = clamp(pinch.scale * point.distance / pinch.distance);
            inspectionPadding = true;
            paint();
            alignPoint(pinch, point);
        }
        function touchend(event) {
            if (event.touches.length !== 2) pinch = null;
        }
        function click(event) {
            if (suppressClick) {
                suppressClick = false;
                event.preventDefault();
                event.stopPropagation();
                return;
            }
            if (event.defaultPrevented) return;
            const card = event.target.closest?.('.cardboard-card, .cardboard-landmark');
            const player = card?.closest('.cardboard-player');
            if (!card || !player || !world.contains(card)) return;
            const facing = normalizeAngle(angle + Number(player.dataset.tableAngle || 0));
            if (facing !== 0 || scale < 0.85) focusCard(card);
            // Keep the same click bubbling to the existing card-detail handler.
        }
        const listeners = [
            ['scroll', () => { updateFocus(true); cacheInspectionAnchor(); onViewChange(); }, { passive: true }],
            ['wheel', wheel, { passive: false }], ['keydown', keydown, false],
            ['touchstart', touchstart, { passive: true }], ['touchmove', touchmove, { passive: false }],
            ['touchend', touchend, { passive: true }], ['touchcancel', touchend, { passive: true }],
            ['pointerdown', pointerdown, false], ['pointermove', pointermove, false],
            ['pointerup', pointerend, false], ['pointercancel', pointerend, false],
            ['lostpointercapture', pointerend, false], ['click', click, true]
        ];
        for (const [type, handler, options] of listeners) viewport.addEventListener(type, handler, options);
        const observer = typeof globalThis.ResizeObserver === 'function' ? new globalThis.ResizeObserver(() => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => { resizeTimer = 0; refresh(); }, 80);
        }) : null;
        observer?.observe(viewport);
        observer?.observe(world);
        function destroy() {
            if (destroyed) return;
            destroyed = true;
            if (frame) globalThis.cancelAnimationFrame(frame);
            cancelResizeAnchor();
            clearTimeout(resizeTimer);
            observer?.disconnect();
            for (const [type, handler, options] of listeners) viewport.removeEventListener(type, handler, options);
            if (drag && viewport.hasPointerCapture(drag.id)) viewport.releasePointerCapture(drag.id);
            drag = null;
            viewport.classList.remove('is-table-panning');
            returnView = null;
            pinch = null;
            clearFocus();
            viewport.style.touchAction = previousTouchAction;
            delete viewport.dataset.tableScale;
            delete viewport.dataset.tableAngle;
            delete viewport.dataset.tableMode;
            if (previousTabIndex === null) viewport.removeAttribute('tabindex');
            else viewport.setAttribute('tabindex', previousTabIndex);
        }
        return Object.freeze({ refresh, focusSeat, focusCard, focusMarket, fit, readable, zoomBy, restoreView, destroy });
    }
    return Object.freeze({ create });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = CardTableCamera;
if (typeof window !== 'undefined') window.CardTableCamera = CardTableCamera;
if (typeof globalThis !== 'undefined') globalThis.CardTableCamera = CardTableCamera;
