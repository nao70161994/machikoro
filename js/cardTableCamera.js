'use strict';

// The camera changes presentation only; native scrolling remains the pan mechanism.
const CardTableCamera = (() => {
    function create({ viewport, canvas, world, onViewChange = () => {}, onPaint = () => {}, onContextChange = /** @type {(context: { label: string, pan: string, playerIndex: number | null, canReturn: boolean }) => void} */ (() => {}), onReadingChange = /** @type {(index: number | null, minScale: number) => void} */ (() => {}) }) {
        let scale = 0.85;
        let overviewMode = true;
        let angle = 0;
        let inspectionPadding = false;
        let focusPlayer = null;
        /** @type {{ playerIndex: number, minScale: number } | null} */
        let readingState = null;
        /** @type {{ playerIndex: number, name: string, x: number, y: number } | null} */
        let inspectionAnchor = null;
        let resizeAnchorFrame = 0;
        let previousContext = '';
        let matrix = { a: scale, b: 0, c: 0, d: scale, e: 0, f: 0 };
        let state = { selfIndex: 0, currentIndex: 0, session: null };
        let session;
        let mounted = false;
        let destroyed = false;
        let frame = 0;
        let observedScrollLeft = viewport.scrollLeft;
        let observedScrollTop = viewport.scrollTop;
        /** @type {ReturnType<typeof setTimeout> | number} */
        let resizeTimer = 0;
        let lastWidth = 0;
        let lastHeight = 0;
        let lastLayoutKey = world.dataset.tableLayoutKey || '';
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
            // Screen-space labels must use the matrix written in this paint,
            // rather than the previous view's rectangles in a later frame.
            onPaint();
        }
        function scroll(left, top) {
            viewport.scrollTo({ left: Math.max(0, left), top: Math.max(0, top), behavior: 'instant' });
            // Native scroll events may arrive after this command has settled.
            // They do not represent another move of the newly placed effects.
            observedScrollLeft = viewport.scrollLeft;
            observedScrollTop = viewport.scrollTop;
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
        function geometryChanged() {
            return viewportChanged() || lastLayoutKey !== (world.dataset.tableLayoutKey || '');
        }
        function cacheInspectionAnchor() {
            // Reflow and native scroll clamping can happen before our layout
            // RAF. They must not replace the last genuinely visible card.
            if (focusPlayer === null || geometryChanged() || resizeAnchorFrame) return;
            const player = seat(focusPlayer);
            if (!player) return;
            const viewportBounds = viewport.getBoundingClientRect();
            const clip = { left: viewportBounds.left + viewport.clientLeft, top: viewportBounds.top + viewport.clientTop,
                right: viewportBounds.left + viewport.clientLeft + viewport.clientWidth,
                bottom: viewportBounds.top + viewport.clientTop + viewport.clientHeight };
            const center = { x: clip.left + viewport.clientWidth / 2, y: clip.top + viewport.clientHeight / 2 };
            let nearest = null;
            let distance = Infinity;
            for (const card of player.querySelectorAll('.cardboard-card[data-card-name]')) {
                const bounds = card.getBoundingClientRect();
                if (bounds.right <= clip.left || bounds.left >= clip.right || bounds.bottom <= clip.top || bounds.top >= clip.bottom) continue;
                const squared = (bounds.left + bounds.width / 2 - center.x) ** 2 + (bounds.top + bounds.height / 2 - center.y) ** 2;
                if (squared < distance) {
                    distance = squared;
                    nearest = { name: card.dataset.cardName,
                        x: (bounds.left + bounds.width / 2 - clip.left) / viewport.clientWidth,
                        y: (bounds.top + bounds.height / 2 - clip.top) / viewport.clientHeight };
                }
            }
            inspectionAnchor = nearest ? { playerIndex: focusPlayer, ...nearest } : null;
        }
        function cancelResizeAnchor() {
            if (resizeAnchorFrame) globalThis.cancelAnimationFrame(resizeAnchorFrame);
            resizeAnchorFrame = 0;
        }
        function restoreInspectionAnchor(anchor) {
            if (destroyed || focusPlayer !== anchor.playerIndex) return false;
            const cards = /** @type {NodeListOf<HTMLElement> | undefined} */ (
                seat(anchor.playerIndex)?.querySelectorAll('.cardboard-card[data-card-name]')
            );
            const card = Array.from(cards || []).find(element => element.dataset.cardName === anchor.name);
            if (card) {
                paint();
                const bounds = card.getBoundingClientRect();
                // Preserve the pan proportionally and retain a visible part of
                // oversized or previously partially visible cards after resize.
                alignPoint(clientToWorld(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2),
                    { x: Math.max(0, Math.min(1, anchor.x)) * viewport.clientWidth,
                        y: Math.max(0, Math.min(1, anchor.y)) * viewport.clientHeight });
            }
            updateFocus();
            cacheInspectionAnchor();
            return Boolean(card);
        }
        function retainInspectionOnResize(anchor) {
            cancelResizeAnchor();
            // Ordinary resize delivery must wait for the table's own placement.
            resizeAnchorFrame = globalThis.requestAnimationFrame(() => {
                resizeAnchorFrame = globalThis.requestAnimationFrame(() => {
                    resizeAnchorFrame = 0;
                    restoreInspectionAnchor(anchor);
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
            if (clearIfOutside && !geometryChanged() && !resizeAnchorFrame && (bounds.right <= clip.left || bounds.left >= clip.right ||
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
        function collectionGeometryKey() {
            const collections = [];
            world.querySelectorAll('.cardboard-player[data-player-index]').forEach(player => {
                const names = [];
                player.querySelectorAll('.cardboard-card, .cardboard-landmark-built').forEach(card => {
                    names.push(card.getAttribute('data-card-name') || card.getAttribute('data-landmark-name'));
                });
                collections.push([player.dataset.playerIndex, names]);
            });
            const market = [];
            world.querySelectorAll('.compact-market-item').forEach(card => {
                market.push(card.getAttribute('data-card-name') || card.getAttribute('data-landmark-name'));
            });
            return JSON.stringify([collections, market]);
        }
        function applyReading(index, minScale = 0.9) {
            const next = index === null ? null : { playerIndex: index, minScale };
            if (readingState?.playerIndex === next?.playerIndex && readingState?.minScale === next?.minScale) return;
            readingState = next;
            // This is an explicit inspection transition, never a paint hook.
            // The layout callback places every owner synchronously before our
            // matrix/focus measurements; its queued ordinary refresh is safe.
            onReadingChange(next?.playerIndex ?? null, next?.minScale ?? 0.9);
            lastLayoutKey = world.dataset.tableLayoutKey || '';
            lastWidth = viewport.clientWidth;
            lastHeight = viewport.clientHeight;
        }
        function captureView() {
            const center = canvasToWorld({ x: viewport.scrollLeft + viewport.clientWidth / 2,
                y: viewport.scrollTop + viewport.clientHeight / 2 });
            const size = measure();
            return { scale, angle, overviewMode, inspectionPadding, focusPlayer,
                readingState: readingState ? { ...readingState } : null,
                anchor: inspectionAnchor ? { ...inspectionAnchor } : null, x: center.x, y: center.y,
                left: viewport.scrollLeft, top: viewport.scrollTop,
                viewportWidth: viewport.clientWidth, viewportHeight: viewport.clientHeight,
                worldWidth: size.width, worldHeight: size.height,
                packing: world.dataset.tablePacking || 'cross', collectionKey: collectionGeometryKey() };
        }
        function rememberView() { returnView = captureView(); }
        function restoreView() {
            if (destroyed || !returnView) return false;
            cancelResizeAnchor();
            const previous = returnView;
            returnView = null;
            applyReading(previous.readingState?.playerIndex ?? null, previous.readingState?.minScale ?? 0.9);
            const currentSize = measure();
            const changedExtent = previous.worldWidth !== currentSize.width || previous.worldHeight !== currentSize.height;
            const changedCollection = previous.packing !== (world.dataset.tablePacking || 'cross') ||
                previous.collectionKey !== collectionGeometryKey();
            if (previous.overviewMode && changedExtent && changedCollection) {
                // Real growth or packing changes need today's complete table.
                // Measurement-only differences during inspection must not
                // replace the exact captured scale with a slightly new fit.
                fit();
                return true;
            }
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
            } else if (previous.anchor && focusPlayer === previous.anchor.playerIndex) {
                // Reading layout can move a card within the world. Its semantic
                // anchor retains the visible position across that reflow; the
                // old world-center point alone cannot account for the movement.
                if (!restoreInspectionAnchor(previous.anchor)) {
                    alignPoint(previous, { x: viewport.clientWidth / 2, y: viewport.clientHeight / 2 });
                }
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
            const readableFloor = preserveReadable ? Math.max(0.95, Math.min(scale, 1.25)) : 0.9;
            applyReading(Number(player.dataset.playerIndex), readableFloor);
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
            applyReading(player ? Number(player.dataset.playerIndex) : null, 0.85);
            focusPlayer = player ? Number(player.dataset.playerIndex) : null;
            overviewMode = false;
            inspectionPadding = true;
            facePlayer(player);
            // The seat and camera rotations cancel in this face-on view.
            // Native card dimensions avoid painting/measuring an intermediate matrix.
            const fitted = Math.min((viewport.clientWidth - 24) / Math.max(1, card.offsetWidth),
                (viewport.clientHeight - 24) / Math.max(1, card.offsetHeight));
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
            applyReading(null);
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
            applyReading(null);
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
            const changedViewport = viewportChanged();
            const layoutKey = world.dataset.tableLayoutKey || '';
            const changedLayout = lastLayoutKey !== layoutKey;
            if (!viewport.clientWidth || !viewport.clientHeight) return;
            const retainedCard = (changedViewport || changedLayout) && focusPlayer !== null && inspectionAnchor?.playerIndex === focusPlayer
                ? { ...inspectionAnchor } : null;
            const retainedCenter = mounted && !overviewMode ? canvasToWorld({
                x: viewport.scrollLeft + lastWidth / 2, y: viewport.scrollTop + lastHeight / 2
            }) : null;
            lastWidth = viewport.clientWidth;
            lastHeight = viewport.clientHeight;
            lastLayoutKey = layoutKey;
            session = state.session;
            mounted = true;
            if (changedSession || overviewMode) fit();
            else {
                paint();
                if (retainedCard) retainInspectionOnResize(retainedCard);
                else if ((changedViewport || changedLayout) && retainedCenter) alignPoint(retainedCenter,
                    { x: viewport.clientWidth / 2, y: viewport.clientHeight / 2 });
                if (!resizeAnchorFrame) cacheInspectionAnchor();
            }
        }
        function refresh(nextState = {}) {
            if (destroyed) return;
            state = { ...state, ...nextState };
            if (!frame) frame = globalThis.requestAnimationFrame(layout);
        }
        function syncLayout() {
            if (destroyed || !viewport.clientWidth || !viewport.clientHeight) return false;
            if (frame) globalThis.cancelAnimationFrame(frame);
            frame = 0;
            layout();
            // The caller has already committed the table's layout. Resolve its
            // reading anchor now, before a following focus command captures the
            // return view and cancels any deferred resize restoration.
            if (resizeAnchorFrame && inspectionAnchor) {
                const anchor = { ...inspectionAnchor };
                cancelResizeAnchor();
                restoreInspectionAnchor(anchor);
            }
            return true;
        }
        function syncViewport() {
            if (destroyed || !mounted || !overviewMode || !viewportChanged() ||
                !viewport.clientWidth || !viewport.clientHeight) return false;
            // A caller that just changed a status/action row already knows
            // the viewport changed. Fit in that same task, before RO delivery
            // or a screenshot can expose the previous viewport's scale.
            return syncLayout();
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
            ['scroll', () => {
                const moved = observedScrollLeft !== viewport.scrollLeft || observedScrollTop !== viewport.scrollTop;
                observedScrollLeft = viewport.scrollLeft;
                observedScrollTop = viewport.scrollTop;
                updateFocus(true);
                cacheInspectionAnchor();
                if (moved) onViewChange();
            }, { passive: true }],
            ['wheel', wheel, { passive: false }], ['keydown', keydown, false],
            ['touchstart', touchstart, { passive: true }], ['touchmove', touchmove, { passive: false }],
            ['touchend', touchend, { passive: true }], ['touchcancel', touchend, { passive: true }],
            ['pointerdown', pointerdown, false], ['pointermove', pointermove, false],
            ['pointerup', pointerend, false], ['pointercancel', pointerend, false],
            ['lostpointercapture', pointerend, false], ['click', click, true]
        ];
        for (const [type, handler, options] of listeners) viewport.addEventListener(type, handler, options);
        const observer = typeof globalThis.ResizeObserver === 'function' ? new globalThis.ResizeObserver(() => {
            if (destroyed) return;
            clearTimeout(resizeTimer);
            resizeTimer = 0;
            if (overviewMode) {
                // CPU activity/status rows can shrink the table without a
                // game redraw. Refit during resize delivery, before paint;
                // a trailing debounce leaves edge cards clipped meanwhile.
                // Painting transforms the world but not its native dimensions.
                if (frame) globalThis.cancelAnimationFrame(frame);
                frame = 0;
                layout();
                return;
            }
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
        return Object.freeze({ refresh, syncLayout, syncViewport, focusSeat, focusCard, focusMarket, fit, readable, zoomBy, restoreView, destroy });
    }
    return Object.freeze({ create });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = CardTableCamera;
if (typeof window !== 'undefined') window.CardTableCamera = CardTableCamera;
if (typeof globalThis !== 'undefined') globalThis.CardTableCamera = CardTableCamera;
