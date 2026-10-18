'use strict';

// Presentation geometry only. Player order and game state remain untouched.
const CardTableLayout = (() => {
    function create({ world, viewport, market, onLayout = () => {} }) {
        let state = { selfIndex: 0, playerCount: 0, session: null };
        let frame = 0;
        let destroyed = false;
        let retainedMarketHeight = 0;
        const observed = new Set();
        const ownerMeasurements = new WeakMap();
        let marketMeasurements = null;
        let lastSelection = null;
        const view = world.ownerDocument.defaultView;
        const gap = 24;
        const padding = 24;
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
            function ownerSize(panel, columns) {
                const key = [panel.querySelectorAll('.cardboard-card').length,
                    panel.querySelectorAll('.cardboard-landmark-built').length,
                    panel.querySelector('.cardboard-header')?.textContent,
                    viewport.clientWidth, viewport.clientHeight].join(':');
                let cache = ownerMeasurements.get(panel);
                if (!cache || cache.key !== key) {
                    cache = { key, sizes: new Map() };
                    ownerMeasurements.set(panel, cache);
                }
                if (!cache.sizes.has(columns)) {
                    setStyle(panel, '--table-owner-columns', String(columns));
                    setStyle(panel, 'width', `${nativeWidthFor(columns)}px`);
                    cache.sizes.set(columns, { nativeWidth: panel.offsetWidth, nativeHeight: panel.offsetHeight });
                }
                return cache.sizes.get(columns);
            }
            function marketSize(columns) {
                const rows = rowsFor(columns);
                const key = [viewport.clientWidth, viewport.clientHeight,
                    market.querySelector('.compact-market-header')?.textContent,
                    market.querySelector('.market-rule-status')?.textContent,
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
            let chosen = !marketAtHome && lastSelection ? lastSelection
                : { market: wide ? 6 : 2, rows: rowsFor(wide ? 6 : 2), side: null, end: null };
            // Evaluate only a small, shared set of edge shapes for 2–4 owners.
            // Measuring native boxes includes header and landmark wrapping, so
            // the score reflects the actual rotated footprint rather than rows
            // of cards alone. Multi-player seating keeps its established shape.
            if (panels.length <= 4 && marketAtHome) {
                const sideCandidates = wide ? shallow ? [1, 2, 3] : [2, 3, 4, 6] : [3, 4, 6];
                const endCandidates = wide ? [4, 6, 8, 12] : [1, 2, 3, 4];
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
            if (marketAtHome) lastSelection = chosen;
            if (market.dataset.marketColumns !== String(chosen.market)) market.dataset.marketColumns = String(chosen.market);
            setStyle(market, '--table-market-columns', String(chosen.market));
            setStyle(market, '--table-market-rows', String(chosen.rows));
            setStyle(market, 'width', `${nativeWidthFor(chosen.market)}px`);
            setStyle(market, 'min-height', marketAtHome ? '0px' : `${retainedMarketHeight}px`);
            const sizes = new Map();
            for (const [side, owners] of Object.entries(sides)) {
                for (const panel of owners) {
                    const lateral = side === 'left' || side === 'right';
                    const count = countFor(panel);
                    const columns = chosen.side === null ? existingColumns(side, count)
                        : Math.min(lateral ? chosen.side : chosen.end, Math.max(1, count));
                    setStyle(panel, '--table-owner-columns', String(columns));
                    setStyle(panel, 'width', `${nativeWidthFor(columns)}px`);
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
            setStyle(world, 'width', `${width}px`);
            setStyle(world, 'height', `${height}px`);
            const centerLeft = padding + leftSpace;
            const centerTop = padding + topSpace;
            setStyle(market, 'left', `${centerLeft + (middleWidth - marketWidth) / 2}px`);
            setStyle(market, 'top', `${centerTop + (middleHeight - marketHeight) / 2}px`);
            for (const [side, owners] of Object.entries(sides)) {
                const vertical = side === 'left' || side === 'right';
                const strip = { left, right, top, bottom }[side];
                let offset = (vertical ? middleHeight : middleWidth) / 2 - strip.along / 2;
                for (const panel of owners) {
                    const size = sizes.get(panel);
                    const x = vertical ? side === 'left' ? padding + left.depth - size.width : centerLeft + middleWidth + gap
                        : centerLeft + offset;
                    const y = vertical ? centerTop + offset
                        : side === 'top' ? padding + top.depth - size.height : centerTop + middleHeight + gap;
                    const translations = { bottom: [0, 0], left: [size.nativeHeight, 0],
                        top: [size.nativeWidth, size.nativeHeight], right: [0, size.nativeWidth] };
                    const [tx, ty] = translations[side];
                    setStyle(panel, 'left', `${x}px`);
                    setStyle(panel, 'top', `${y}px`);
                    setStyle(panel, 'transform', `translate(${tx}px, ${ty}px) rotate(${angles[side]}deg)`);
                    offset += (vertical ? size.height : size.width) + gap;
                }
            }
            onLayout();
        }
        function refresh(nextState = {}) {
            if (destroyed) return;
            if ('session' in nextState && nextState.session !== state.session) {
                lastSelection = null;
                marketMeasurements = null;
                retainedMarketHeight = 0;
            }
            state = { ...state, ...nextState };
            schedule();
        }
        function destroy() {
            if (destroyed) return;
            destroyed = true;
            if (frame) view.cancelAnimationFrame(frame);
            frame = 0;
            observer?.disconnect();
            observed.clear();
        }
        observe(world);
        observe(viewport);
        observe(market);
        return Object.freeze({ refresh, destroy });
    }
    return Object.freeze({ create });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = CardTableLayout;
if (typeof window !== 'undefined') window.CardTableLayout = CardTableLayout;
