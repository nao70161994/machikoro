'use strict';

// Presentation geometry only. Player order and game state remain untouched.
/** @typedef {{width: number, height: number}} CardTableFootprint */
/** @typedef {{market: number, rows: number, side: number | null, end: number | null, packing?: string, landmarkRail?: boolean}} CardTablePlan */
const CardTableLayout = (() => {
    /** @param {{top: CardTableFootprint, right: CardTableFootprint, bottom: CardTableFootprint, left: CardTableFootprint, market: CardTableFootprint, gap?: number, padding?: number}} options */
    function computePinwheelGeometry({ top, right, bottom, left, market, gap = 24, padding = 24 }) {
        const holeWidth = Math.max(market.width, ((bottom.width - gap - right.width) + (top.width - gap - left.width)) / 2);
        const holeHeight = Math.max(market.height, ((left.height - gap - bottom.height) + (right.height - gap - top.height)) / 2);
        const rects = {
            top: { ...top, x: holeWidth - top.width, y: -gap - top.height },
            right: { ...right, x: holeWidth + gap, y: holeHeight - right.height },
            bottom: { ...bottom, x: 0, y: holeHeight + gap },
            left: { ...left, x: -gap - left.width, y: 0 },
            market: { ...market, x: (holeWidth - market.width) / 2, y: (holeHeight - market.height) / 2 },
        };
        const values = Object.values(rects);
        const minX = Math.min(...values.map(rect => rect.x));
        const minY = Math.min(...values.map(rect => rect.y));
        const maxX = Math.max(...values.map(rect => rect.x + rect.width));
        const maxY = Math.max(...values.map(rect => rect.y + rect.height));
        return { width: maxX - minX + padding * 2, height: maxY - minY + padding * 2,
            hole: { width: holeWidth, height: holeHeight },
            rects: Object.fromEntries(Object.entries(rects).map(([name, rect]) => [name,
                { ...rect, x: rect.x - minX + padding, y: rect.y - minY + padding }])) };
    }

    function create({ world, viewport, market, onLayout = () => {} }) {
        let state = { selfIndex: 0, playerCount: 0, session: null };
        let frame = 0;
        let destroyed = false;
        let retainedMarketHeight = 0;
        const observed = new Set();
        const ownerMeasurements = new WeakMap();
        let marketMeasurements = null;
        /** @type {CardTablePlan | null} */
        let lastSelection = null;
        /** @type {{playerIndex: number, minScale: number, columns?: number} | null} */
        let readingSeat = null;
        const view = world.ownerDocument.defaultView;
        const setStyle = (element, name, value) => {
            if (element.style.getPropertyValue(name) !== value) element.style.setProperty(name, value);
        };
        const observer = typeof view.ResizeObserver === 'function'
            ? new view.ResizeObserver(schedule) : null;
        function observe(element) {
            if (!element || observed.has(element)) return;
            observed.add(element);
            observer?.observe(element);
        }
        function schedule() {
            if (!destroyed && !frame) frame = view.requestAnimationFrame(layout);
        }
        function assignSeats(panels, selfIndex) {
            const sides = { bottom: [], left: [], top: [], right: [] };
            const self = panels.find(panel => Number(panel.dataset.playerIndex) === selfIndex) || panels[0];
            if (self) sides.bottom.push(self);
            const others = panels.filter(panel => panel !== self);
            if (others.length === 1) sides.top.push(others[0]);
            else if (others.length === 2) {
                sides.left.push(others[0]);
                sides.right.push(others[1]);
            } else {
                others.forEach((panel, index) => sides[['left', 'top', 'right'][index % 3]].push(panel));
            }
            return sides;
        }
        function layout() {
            frame = 0;
            if (destroyed || !world.isConnected || !world.contains(market) || !viewport.clientWidth || !viewport.clientHeight) return;
            const panels = [...world.children].filter(element => element.matches('.cardboard-player[data-player-index]'));
            if (!panels.length) return;
            const live = new Set([world, viewport, market, ...panels]);
            for (const element of observed) {
                if (!live.has(element)) {
                    observer?.unobserve(element);
                    observed.delete(element);
                }
            }
            panels.forEach(observe);
            const wide = viewport.clientWidth > viewport.clientHeight;
            const shallow = viewport.clientWidth / viewport.clientHeight > 2.2;
            const oppositeOnly = panels.length === 2;
            // Two opposite owners need no corner clearance. Reclaim that
            // empty rim on shallow screens before shrinking every card.
            const compactOpponents = oppositeOnly && shallow;
            const gap = compactOpponents ? 16 : 24;
            const padding = compactOpponents ? 12 : 24;
            // A tall screen needs a narrower centre, otherwise its width
            // determines the fit scale and leaves most of the height unused.
            const sides = assignSeats(panels, state.selfIndex);
            const marketAtHome = !!market.querySelector('#cardboardMarket');
            const marketRows = oppositeOnly && shallow ? 1 : 2;
            const defaultVisibleMarketCards = (wide ? 6 : 2) * marketRows;
            const displayedMarketCards = market.querySelectorAll('.compact-market-facilities .compact-market-item').length;
            // Filtering changes the shelf's presentation, never market stock.
            // Keep one row for an empty-result explanation, and retain the
            // established multi-player geometry beyond four owners.
            const visibleMarketCards = panels.length <= 4
                ? Math.max(1, Math.min(defaultVisibleMarketCards, displayedMarketCards)) : defaultVisibleMarketCards;
            const rowsFor = columns => Math.max(1, Math.ceil(visibleMarketCards / columns));
            const angles = { bottom: 0, left: 90, top: 180, right: 270 };
            const nativeWidthFor = columns => columns * 160 + (columns - 1) * 8 + 16;
            function applyOwnerShape(panel, columns, rail = false) {
                const built = panel.querySelectorAll('.cardboard-landmark-built').length;
                rail = rail && built > 0;
                if (rail) panel.dataset.tableLandmarkRail = 'true';
                else delete panel.dataset.tableLandmarkRail;
                setStyle(panel, 'display', rail ? 'grid' : 'flex');
                const railWidth = built ? built * 82 + Math.max(0, built - 1) * 6 : 0;
                setStyle(panel, '--table-owner-columns', String(columns));
                setStyle(panel, '--table-facility-width', `${nativeWidthFor(columns) - 16}px`);
                setStyle(panel, '--table-landmark-width', `${railWidth}px`);
                setStyle(panel, 'width', `${nativeWidthFor(columns) + (railWidth && rail ? railWidth + 16 : 0)}px`);
            }
            function ownerSize(panel, columns, rail = false) {
                const key = [panel.querySelectorAll('.cardboard-card').length,
                    panel.querySelectorAll('.cardboard-landmark-built').length,
                    panel.querySelector('.cardboard-header')?.textContent,
                    viewport.clientWidth, viewport.clientHeight].join(':');
                let cache = ownerMeasurements.get(panel);
                if (!cache || cache.key !== key) {
                    cache = { key, sizes: new Map() };
                    ownerMeasurements.set(panel, cache);
                }
                const shapeKey = `${columns}:${rail}`;
                if (!cache.sizes.has(shapeKey)) {
                    applyOwnerShape(panel, columns, rail);
                    cache.sizes.set(shapeKey, { nativeWidth: panel.offsetWidth, nativeHeight: panel.offsetHeight });
                }
                return cache.sizes.get(shapeKey);
            }
            function marketSize(columns, rows = rowsFor(columns)) {
                const key = [viewport.clientWidth, viewport.clientHeight,
                    market.querySelector('.compact-market-header')?.textContent,
                    market.querySelector('.market-rule-status')?.textContent,
                    market.querySelector('.compact-market-browse-note')?.textContent || '',
                    displayedMarketCards,
                    market.querySelector('.compact-market-filter-disclosure > summary')?.textContent,
                    [...market.querySelectorAll('details')].map(details => [details.className, details.open,
                        details.querySelector('summary')?.textContent, details.open ? details.textContent : ''].join('|')).join(';')].join(':');
                if (!marketMeasurements || marketMeasurements.key !== key) marketMeasurements = { key, sizes: new Map() };
                const shapeKey = `${columns}:${rows}`;
                if (!marketMeasurements.sizes.has(shapeKey)) {
                    market.dataset.marketColumns = String(columns);
                    setStyle(market, '--table-market-columns', String(columns));
                    setStyle(market, '--table-market-rows', String(rows));
                    setStyle(market, 'width', `${nativeWidthFor(columns)}px`);
                    setStyle(market, 'min-height', marketAtHome ? '0px' : `${retainedMarketHeight}px`);
                    marketMeasurements.sizes.set(shapeKey, { width: market.offsetWidth, height: market.offsetHeight });
                }
                return marketMeasurements.sizes.get(shapeKey);
            }
            for (const [side, owners] of Object.entries(sides)) {
                for (const panel of owners) {
                    setStyle(panel, 'position', 'absolute');
                    setStyle(panel, 'display', 'flex');
                    setStyle(panel, 'flex-direction', 'column');
                    setStyle(panel, 'transform-origin', '0 0');
                    panel.dataset.seatPosition = side;
                    panel.dataset.tableAngle = String(angles[side]);
                }
            }
            setStyle(market, 'position', 'absolute');
            const countFor = panel => panel.querySelectorAll('.cardboard-card').length;
            const existingColumns = (side, count) => {
                const lateral = side === 'left' || side === 'right';
                let maximum;
                if (lateral) maximum = wide ? shallow ? 2 : 4 : 6;
                else if (oppositeOnly) maximum = wide ? shallow ? 12 : 8 : count >= 13 ? 4 : 3;
                else maximum = wide ? count >= 13 ? 8 : 6 : count >= 13 ? 3 : 2;
                return Math.min(maximum, Math.max(1, count));
            };
            /** @type {CardTablePlan} */
            let chosen = !marketAtHome && lastSelection ? lastSelection
                : { market: wide ? 6 : 2, rows: rowsFor(wide ? 6 : 2), side: null, end: null };
            const denseFour = wide && panels.length === 4 && panels.some(panel => countFor(panel) >= 13);
            // Evaluate only a small, shared set of edge shapes for 2–4 owners.
            // Measuring native boxes includes header and landmark wrapping, so
            // the score reflects the actual rotated footprint rather than rows
            // of cards alone. Multi-player seating keeps its established shape.
            if (panels.length <= 4 && marketAtHome) {
                const sideCandidates = denseFour ? [1, 2, 3, 4, 6, 8] : wide ? shallow ? [1, 2, 3] : [2, 3, 4, 6] : [3, 4, 6];
                const endCandidates = denseFour ? [4, 6, 8, 12, 18] : wide ? [4, 6, 8, 12] : [1, 2, 3, 4];
                const marketCandidates = wide ? [6, 4] : [2, 3, 1];
                let bestScore = -1;
                const marketPlans = new Map();
                for (const marketColumns of marketCandidates) {
                    const marketBox = marketSize(marketColumns);
                    for (const sideColumns of sideCandidates) for (const endColumns of endCandidates) {
                        const strips = {};
                        for (const [side, owners] of Object.entries(sides)) {
                            const lateral = side === 'left' || side === 'right';
                            let along = 0, depth = 0;
                            for (const panel of owners) {
                                const columns = Math.min(lateral ? sideColumns : endColumns, Math.max(1, countFor(panel)));
                                const box = ownerSize(panel, columns);
                                along += box.nativeWidth;
                                depth = Math.max(depth, box.nativeHeight);
                            }
                            strips[side] = { along: along + Math.max(0, owners.length - 1) * gap, depth };
                        }
                        const width = padding * 2 + Math.max(marketBox.width, strips.top.along, strips.bottom.along) +
                            (strips.left.depth ? strips.left.depth + gap : 0) + (strips.right.depth ? strips.right.depth + gap : 0);
                        const height = padding * 2 + Math.max(marketBox.height, strips.left.along, strips.right.along) +
                            (strips.top.depth ? strips.top.depth + gap : 0) + (strips.bottom.depth ? strips.bottom.depth + gap : 0);
                        const score = Math.min(viewport.clientWidth / width, viewport.clientHeight / height);
                        const plan = { market: marketColumns, rows: rowsFor(marketColumns), side: sideColumns, end: endColumns };
                        const previousPlan = marketPlans.get(marketColumns);
                        if (!previousPlan || score > previousPlan.score + 0.0001) marketPlans.set(marketColumns, { score, plan });
                        if (score > bestScore + 0.0001) {
                            bestScore = score;
                            chosen = plan;
                        }
                    }
                }
                // A single market column sacrifices side-by-side comparison.
                // Adopt it only when cards become materially larger than the
                // best two-column layout, rather than winning a numerical tie.
                const twoColumns = marketPlans.get(2);
                const oneColumn = marketPlans.get(1);
                if (chosen.market === 1 && twoColumns && oneColumn.score < twoColumns.score * 1.08) {
                    const alternatives = [...marketPlans].filter(([columns]) => columns !== 1).map(([, candidate]) => candidate);
                    let preferred = alternatives[0];
                    for (const candidate of alternatives.slice(1)) {
                        if (candidate.score > preferred.score + 0.0001) preferred = candidate;
                    }
                    chosen = preferred.plan;
                }
            }
            // Two opposite seats can spend their unused horizontal space on
            // completed landmarks. Compare measured boxes, never shrink art.
            let landmarkRail = compactOpponents && !readingSeat && !marketAtHome && chosen.landmarkRail === true;
            if (compactOpponents && !readingSeat && marketAtHome &&
                panels.some(panel => panel.querySelector('.cardboard-landmark-built'))) {
                const marketBox = marketSize(chosen.market, chosen.rows);
                const scoreFor = (columns, rail) => {
                    const boxes = panels.map(panel => ownerSize(panel, Math.min(columns, Math.max(1, countFor(panel))), rail));
                    const width = padding * 2 + Math.max(marketBox.width, ...boxes.map(box => box.nativeWidth));
                    const height = padding * 2 + marketBox.height + gap * 2 + boxes.reduce((sum, box) => sum + box.nativeHeight, 0);
                    return Math.min(viewport.clientWidth / width, viewport.clientHeight / height);
                };
                const baseline = scoreFor(chosen.end, false);
                let bestScore = baseline;
                let bestColumns = chosen.end;
                for (const columns of [4, 6, 8, 12]) {
                    const score = scoreFor(columns, true);
                    if (score > bestScore + 0.0001) {
                        bestScore = score;
                        bestColumns = columns;
                    }
                }
                if (bestScore >= baseline * 1.15) {
                    landmarkRail = true;
                    chosen = { ...chosen, end: bestColumns };
                }
            }
            // Candidate measurements must not leak presentation into reading.
            panels.forEach(panel => delete panel.dataset.tableLandmarkRail);
            if (denseFour && marketAtHome) {
                let pinwheel = null;
                const crossMarket = marketSize(chosen.market, chosen.rows);
                const crossStrips = {};
                for (const [side, owners] of Object.entries(sides)) {
                    const lateral = side === 'left' || side === 'right';
                    const panel = owners[0];
                    const columns = Math.min(lateral ? chosen.side : chosen.end, Math.max(1, countFor(panel)));
                    const box = ownerSize(panel, columns);
                    crossStrips[side] = { width: lateral ? box.nativeHeight : box.nativeWidth,
                        height: lateral ? box.nativeWidth : box.nativeHeight };
                }
                const crossWidth = padding * 2 + Math.max(crossMarket.width, crossStrips.top.width, crossStrips.bottom.width) +
                    crossStrips.left.width + crossStrips.right.width + gap * 2;
                const crossHeight = padding * 2 + Math.max(crossMarket.height, crossStrips.left.height, crossStrips.right.height) +
                    crossStrips.top.height + crossStrips.bottom.height + gap * 2;
                const crossScore = Math.min(viewport.clientWidth / crossWidth, viewport.clientHeight / crossHeight);
                for (const marketColumns of [6, 4]) {
                    const rows = rowsFor(marketColumns);
                    const marketBox = marketSize(marketColumns, rows);
                    for (const sideColumns of [1, 2, 3, 4, 6, 8]) for (const endColumns of [4, 6, 8, 12, 18]) {
                        /** @type {Record<string, CardTableFootprint>} */
                        const dimensions = {};
                        for (const [side, owners] of Object.entries(sides)) {
                            const lateral = side === 'left' || side === 'right';
                            const panel = owners[0];
                            const columns = Math.min(lateral ? sideColumns : endColumns, Math.max(1, countFor(panel)));
                            const box = ownerSize(panel, columns);
                            dimensions[side] = { width: lateral ? box.nativeHeight : box.nativeWidth,
                                height: lateral ? box.nativeWidth : box.nativeHeight };
                        }
                        const geometry = computePinwheelGeometry({ top: dimensions.top, right: dimensions.right, bottom: dimensions.bottom,
                            left: dimensions.left, market: marketBox, gap, padding });
                        const score = Math.min(viewport.clientWidth / geometry.width, viewport.clientHeight / geometry.height);
                        if (!pinwheel || score > pinwheel.score + 0.0001) pinwheel = { score,
                            plan: { packing: 'pinwheel', market: marketColumns, rows, side: sideColumns, end: endColumns } };
                    }
                }
                if (pinwheel && pinwheel.score >= crossScore * 1.08) chosen = pinwheel.plan;
            }
            if (marketAtHome) lastSelection = { ...chosen, landmarkRail };
            if (market.dataset.marketColumns !== String(chosen.market)) market.dataset.marketColumns = String(chosen.market);
            setStyle(market, '--table-market-columns', String(chosen.market));
            setStyle(market, '--table-market-rows', String(chosen.rows));
            setStyle(market, 'width', `${nativeWidthFor(chosen.market)}px`);
            setStyle(market, 'min-height', marketAtHome ? '0px' : `${retainedMarketHeight}px`);
            let readingColumns = null;
            if (readingSeat) {
                const owner = panels.find(panel => Number(panel.dataset.playerIndex) === readingSeat.playerIndex);
                if (owner) {
                    const inset = viewport.clientWidth <= 480 ? 12 : 20;
                    const availableWidth = Math.max(1, viewport.clientWidth - inset * 2);
                    const availableHeight = Math.max(1, viewport.clientHeight - inset * 2);
                    const maximum = Math.min(Math.max(1, countFor(owner)),
                        Math.max(1, Math.floor((availableWidth / readingSeat.minScale - 8) / 168)));
                    readingColumns = maximum;
                    let bestScale = 0;
                    for (let columns = 1; columns <= maximum; columns++) {
                        const box = ownerSize(owner, columns);
                        const fitScale = Math.min(1.6, availableWidth / box.nativeWidth, availableHeight / box.nativeHeight);
                        if (fitScale >= readingSeat.minScale && fitScale > bestScale + 0.0001) {
                            bestScale = fitScale;
                            readingColumns = columns;
                        }
                    }
                    readingSeat.columns = readingColumns;
                } else readingSeat = null;
            }
            if (readingSeat) world.dataset.tableReadingSeat = String(readingSeat.playerIndex);
            else delete world.dataset.tableReadingSeat;
            const sizes = new Map();
            for (const [side, owners] of Object.entries(sides)) {
                for (const panel of owners) {
                    const lateral = side === 'left' || side === 'right';
                    const count = countFor(panel);
                    const columns = readingSeat?.playerIndex === Number(panel.dataset.playerIndex) && readingColumns !== null
                        ? readingColumns : chosen.side === null ? existingColumns(side, count)
                            : Math.min(lateral ? chosen.side : chosen.end, Math.max(1, count));
                    applyOwnerShape(panel, columns, landmarkRail);
                    const nativeWidth = panel.offsetWidth, nativeHeight = panel.offsetHeight;
                    sizes.set(panel, { nativeWidth, nativeHeight, width: lateral ? nativeHeight : nativeWidth,
                        height: lateral ? nativeWidth : nativeHeight });
                }
            }
            const extent = (owners, vertical) => ({
                along: owners.reduce((sum, panel) => sum + (vertical ? sizes.get(panel).height : sizes.get(panel).width), 0) + Math.max(0, owners.length - 1) * gap,
                depth: Math.max(0, ...owners.map(panel => vertical ? sizes.get(panel).width : sizes.get(panel).height)),
            });
            const left = extent(sides.left, true);
            const right = extent(sides.right, true);
            const top = extent(sides.top, false);
            const bottom = extent(sides.bottom, false);
            const marketWidth = market.offsetWidth;
            const marketHeight = market.offsetHeight;
            if (marketAtHome) retainedMarketHeight = marketHeight;
            const middleWidth = Math.max(marketWidth, top.along, bottom.along);
            const middleHeight = Math.max(marketHeight, left.along, right.along);
            const leftSpace = left.depth ? left.depth + gap : 0;
            const rightSpace = right.depth ? right.depth + gap : 0;
            const topSpace = top.depth ? top.depth + gap : 0;
            const bottomSpace = bottom.depth ? bottom.depth + gap : 0;
            const width = padding * 2 + leftSpace + middleWidth + rightSpace;
            const height = padding * 2 + topSpace + middleHeight + bottomSpace;
            const pinGeometry = chosen.packing === 'pinwheel' ? computePinwheelGeometry({
                top: sizes.get(sides.top[0]), right: sizes.get(sides.right[0]),
                bottom: sizes.get(sides.bottom[0]), left: sizes.get(sides.left[0]),
                market: { width: marketWidth, height: marketHeight }, gap, padding,
            }) : null;
            setStyle(world, 'width', `${pinGeometry?.width ?? width}px`);
            setStyle(world, 'height', `${pinGeometry?.height ?? height}px`);
            const centerLeft = padding + leftSpace;
            const centerTop = padding + topSpace;
            const marketX = pinGeometry?.rects.market.x ?? centerLeft + (middleWidth - marketWidth) / 2;
            const marketY = pinGeometry?.rects.market.y ?? centerTop + (middleHeight - marketHeight) / 2;
            setStyle(market, 'left', `${marketX}px`);
            setStyle(market, 'top', `${marketY}px`);
            const ownerGeometry = [];
            for (const [side, owners] of Object.entries(sides)) {
                const vertical = side === 'left' || side === 'right';
                const strip = { left, right, top, bottom }[side];
                let offset = (vertical ? middleHeight : middleWidth) / 2 - strip.along / 2;
                for (const panel of owners) {
                    const size = sizes.get(panel);
                    const crossX = vertical ? side === 'left' ? padding + left.depth - size.width : centerLeft + middleWidth + gap
                        : centerLeft + offset;
                    const crossY = vertical ? centerTop + offset
                        : side === 'top' ? padding + top.depth - size.height : centerTop + middleHeight + gap;
                    const x = pinGeometry?.rects[side].x ?? crossX;
                    const y = pinGeometry?.rects[side].y ?? crossY;
                    ownerGeometry.push([Number(panel.dataset.playerIndex), x, y, size.nativeWidth, size.nativeHeight, angles[side], panel.style.getPropertyValue('--table-owner-columns')]);
                    const translations = { bottom: [0, 0], left: [size.nativeHeight, 0],
                        top: [size.nativeWidth, size.nativeHeight], right: [0, size.nativeWidth] };
                    const [tx, ty] = translations[side];
                    setStyle(panel, 'left', `${x}px`);
                    setStyle(panel, 'top', `${y}px`);
                    setStyle(panel, 'transform', `translate(${tx}px, ${ty}px) rotate(${angles[side]}deg)`);
                    offset += (vertical ? size.height : size.width) + gap;
                }
            }
            const packing = chosen.packing || 'cross';
            if (world.dataset.tablePacking !== packing) world.dataset.tablePacking = packing;
            const geometryKey = JSON.stringify([packing, chosen.market, chosen.rows, marketX, marketY, marketWidth, marketHeight, ownerGeometry]);
            if (world.dataset.tableLayoutKey !== geometryKey) world.dataset.tableLayoutKey = geometryKey;
            onLayout();
        }
        function setReadingSeat(playerIndex, minScale = 0.9) {
            if (destroyed) return null;
            readingSeat = Number.isInteger(playerIndex) && playerIndex >= 0
                ? { playerIndex, minScale: Math.max(0.85, Math.min(1.6, Number(minScale) || 0.9)) } : null;
            if (frame) view.cancelAnimationFrame(frame);
            frame = 0;
            layout();
            return readingSeat ? { ...readingSeat } : null;
        }
        function refresh(nextState = {}) {
            if (destroyed) return;
            if ('session' in nextState && nextState.session !== state.session) {
                lastSelection = null;
                readingSeat = null;
                marketMeasurements = null;
                retainedMarketHeight = 0;
            }
            state = { ...state, ...nextState };
            schedule();
        }
        function syncLayout() {
            if (destroyed) return;
            if (frame) view.cancelAnimationFrame(frame);
            frame = 0;
            layout();
        }
        function destroy() {
            if (destroyed) return;
            destroyed = true;
            if (frame) view.cancelAnimationFrame(frame);
            frame = 0;
            observer?.disconnect();
            observed.clear();
            readingSeat = null;
            delete world.dataset.tableReadingSeat;
        }
        observe(world);
        observe(viewport);
        observe(market);
        return Object.freeze({ refresh, syncLayout, setReadingSeat, destroy });
    }
    return Object.freeze({ create, computePinwheelGeometry });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = CardTableLayout;
if (typeof window !== 'undefined') window.CardTableLayout = CardTableLayout;
