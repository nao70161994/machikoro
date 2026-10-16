'use strict';

// The camera changes presentation only; native scrolling remains the pan mechanism.
const CardTableCamera = (() => {
    function create({ viewport, canvas, world, onViewChange = () => {} }) {
        let scale = 0.85;
        let overviewMode = true;
        let offsetX = 0;
        let offsetY = 0;
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
        function paint() {
            const size = measure();
            world.style.transform = `scale(${scale})`;
            const width = Math.max(viewport.clientWidth, Math.ceil(size.width * scale));
            const height = Math.max(viewport.clientHeight, Math.ceil(size.height * scale));
            offsetX = Math.max(0, (width - size.width * scale) / 2);
            offsetY = Math.max(0, (height - size.height * scale) / 2);
            const nextView = `${scale}:${width}:${height}:${offsetX}:${offsetY}`;
            if (paintedView && paintedView !== nextView) onViewChange();
            paintedView = nextView;
            canvas.style.width = `${width}px`;
            canvas.style.height = `${height}px`;
            world.style.left = `${offsetX}px`;
            world.style.top = `${offsetY}px`;
            viewport.dataset.tableScale = scale.toFixed(3);
            viewport.dataset.tableMode = overviewMode ? 'overview' : 'free';
        }
        function scroll(left, top) {
            viewport.scrollTo({ left: Math.max(0, left), top: Math.max(0, top), behavior: 'instant' });
        }
        function seat(index) {
            return [...world.querySelectorAll('.cardboard-player[data-player-index]')]
                .find(element => Number(element.dataset.playerIndex) === Number(index));
        }
        function captureView() {
            return { scale, overviewMode, x: (viewport.scrollLeft + viewport.clientWidth / 2 - offsetX) / scale,
                y: (viewport.scrollTop + viewport.clientHeight / 2 - offsetY) / scale };
        }
        function rememberView() {
            returnView = captureView();
        }
        function restoreView() {
            if (destroyed || !returnView) return false;
            const previous = returnView;
            returnView = null;
            if (previous.overviewMode) fit();
            else {
                overviewMode = false;
                scale = previous.scale;
                paint();
                scroll(offsetX + previous.x * scale - viewport.clientWidth / 2,
                    offsetY + previous.y * scale - viewport.clientHeight / 2);
            }
            return true;
        }
        function focusSeat(index, preserveReadable = false) {
            if (destroyed) return;
            const player = seat(index);
            if (!player) return;
            if (!preserveReadable) rememberView();
            overviewMode = false;
            const headerBefore = player.querySelector('.cardboard-header') || player;
            const firstBefore = player.querySelector('.cardboard-cards button');
            const rowHeight = firstBefore
                ? (firstBefore.getBoundingClientRect().bottom - headerBefore.getBoundingClientRect().top) / scale
                : headerBefore.getBoundingClientRect().height / scale;
            const fittedScale = Math.min(0.85, Math.max(0.55, (viewport.clientHeight - 16) / Math.max(1, rowHeight)));
            scale = preserveReadable ? scale : clamp(fittedScale < 0.85 ? fittedScale : Math.max(scale, 0.85));
            paint();
            const header = player.querySelector('.cardboard-header') || player;
            const cards = player.querySelector('.cardboard-cards');
            const first = cards?.querySelector('button');
            const headerBounds = header.getBoundingClientRect();
            const firstBounds = first?.getBoundingClientRect();
            const origin = world.getBoundingClientRect();
            let left = firstBounds?.left ?? headerBounds.left;
            let right = firstBounds?.right ?? headerBounds.right;
            let bottom = firstBounds?.bottom ?? headerBounds.bottom;
            if (firstBounds) {
                for (const card of cards.querySelectorAll('button')) {
                    const bounds = card.getBoundingClientRect();
                    if (Math.abs(bounds.top - firstBounds.top) > 2) continue;
                    left = Math.min(left, bounds.left);
                    right = Math.max(right, bounds.right);
                    bottom = Math.max(bottom, bounds.bottom);
                }
            }
            // Keep the owner and first facility row together, even when later rows
            // make the complete player region much taller than the viewport.
            const top = headerBounds.top;
            const height = bottom - top;
            const targetTop = height + 16 > viewport.clientHeight
                ? top - origin.top - 8
                : top - origin.top + height / 2 - viewport.clientHeight / 2;
            scroll(offsetX + (left + right) / 2 - origin.left - viewport.clientWidth / 2, offsetY + targetTop);
        }
        function focusCard(card) {
            if (destroyed || !card?.isConnected || !world.contains(card)) return;
            const before = card.getBoundingClientRect();
            if (!before.width || !before.height) return;
            rememberView();
            overviewMode = false;
            const fitted = Math.min((viewport.clientWidth - 24) / (before.width / scale),
                (viewport.clientHeight - 24) / (before.height / scale));
            scale = clamp(Math.min(Math.max(scale, 0.85), fitted));
            paint();
            const bounds = card.getBoundingClientRect();
            const origin = world.getBoundingClientRect();
            scroll(offsetX + bounds.left + bounds.width / 2 - origin.left - viewport.clientWidth / 2,
                offsetY + bounds.top + bounds.height / 2 - origin.top - viewport.clientHeight / 2);
        }
        function focusMarket() {
            const market = world.querySelector('#cardboardCenter');
            if (destroyed || !market) return;
            rememberView();
            overviewMode = false;
            scale = clamp(Math.max(scale, 0.75));
            paint();
            market.querySelector('.compact-market-facilities')?.scrollTo({ top: 0, left: 0, behavior: 'instant' });
            const heading = market.querySelector('.compact-market-header') || market;
            const bounds = heading.getBoundingClientRect();
            const marketBounds = market.getBoundingClientRect();
            const origin = world.getBoundingClientRect();
            // Open the market at its heading and first row, rather than halfway
            // down the inventory on a short landscape screen.
            const left = marketBounds.width > viewport.clientWidth
                ? marketBounds.left - origin.left + offsetX - 8
                : marketBounds.left + marketBounds.width / 2 - origin.left + offsetX - viewport.clientWidth / 2;
            scroll(left, bounds.top - origin.top + offsetY - 8);
        }
        function fit() {
            if (destroyed) return;
            overviewMode = true;
            returnView = null;
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
            paint();
            focusSeat(state.selfIndex, true);
        }
        function zoomBy(factor, anchor = null) {
            if (destroyed || !Number.isFinite(factor) || factor <= 0) return;
            overviewMode = false;
            const point = anchor || { x: viewport.clientWidth / 2, y: viewport.clientHeight / 2 };
            const center = {
                x: (viewport.scrollLeft + point.x - offsetX) / scale,
                y: (viewport.scrollTop + point.y - offsetY) / scale
            };
            scale = clamp(scale * factor);
            paint();
            scroll(offsetX + center.x * scale - point.x, offsetY + center.y * scale - point.y);
        }
        function layout() {
            frame = 0;
            if (destroyed) return;
            const changedSession = !mounted || session !== state.session;
            const changedViewport = lastWidth !== viewport.clientWidth || lastHeight !== viewport.clientHeight;
            if (!viewport.clientWidth || !viewport.clientHeight) return;
            const retainedCenter = mounted && !overviewMode ? {
                x: (viewport.scrollLeft + lastWidth / 2 - offsetX) / scale,
                y: (viewport.scrollTop + lastHeight / 2 - offsetY) / scale
            } : null;
            lastWidth = viewport.clientWidth;
            lastHeight = viewport.clientHeight;
            session = state.session;
            mounted = true;
            if (changedSession || overviewMode) {
                fit();
            } else {
                paint();
                if (changedViewport && retainedCenter) {
                    scroll(offsetX + retainedCenter.x * scale - viewport.clientWidth / 2,
                        offsetY + retainedCenter.y * scale - viewport.clientHeight / 2);
                }
            }
        }
        function refresh(nextState = {}) {
            if (destroyed) return;
            state = { ...state, ...nextState };
            if (!frame) frame = globalThis.requestAnimationFrame(layout);
        }
        function wheel(event) {
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
            const point = touchGeometry(event.touches);
            if (!point) {
                pinch = null;
                // A new one-finger gesture is intentional input. A pinch may
                // produce no synthetic click, so do not swallow its next tap.
                if (event.touches.length === 1) suppressClick = false;
                return;
            }
            pinch = {
                distance: point.distance, scale,
                x: (viewport.scrollLeft + point.x - offsetX) / scale,
                y: (viewport.scrollTop + point.y - offsetY) / scale
            };
        }
        function touchmove(event) {
            const point = touchGeometry(event.touches);
            if (!pinch || !point) return;
            if (event.cancelable) event.preventDefault();
            overviewMode = false;
            suppressClick = true;
            scale = clamp(pinch.scale * point.distance / pinch.distance);
            paint();
            scroll(offsetX + pinch.x * scale - point.x, offsetY + pinch.y * scale - point.y);
        }
        function touchend(event) {
            if (event.touches.length !== 2) pinch = null;
        }
        function click(event) {
            if (!suppressClick) return;
            suppressClick = false;
            event.preventDefault();
            event.stopPropagation();
        }
        const listeners = [
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
            clearTimeout(resizeTimer);
            observer?.disconnect();
            for (const [type, handler, options] of listeners) viewport.removeEventListener(type, handler, options);
            if (drag && viewport.hasPointerCapture(drag.id)) viewport.releasePointerCapture(drag.id);
            drag = null;
            viewport.classList.remove('is-table-panning');
            returnView = null;
            pinch = null;
            viewport.style.touchAction = previousTouchAction;
            delete viewport.dataset.tableScale;
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
