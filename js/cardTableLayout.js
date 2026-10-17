'use strict';

// Presentation geometry only. Player order and game state remain untouched.
const CardTableLayout = (() => {
    function create({ world, viewport, market, onLayout = () => {} }) {
        let state = { selfIndex: 0, playerCount: 0, session: null };
        let frame = 0;
        let destroyed = false;
        let retainedMarketHeight = 0;
        const observed = new Set();
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
            const columns = wide ? 6 : 2;
            setStyle(market, '--table-market-columns', String(columns));
            setStyle(market, '--table-market-rows', oppositeOnly && shallow ? '1' : '2');
            setStyle(market, 'width', `${columns * 160 + (columns - 1) * 8 + 16}px`);
            setStyle(market, 'position', 'absolute');
            const marketAtHome = !!market.querySelector('#cardboardMarket');
            // The shared market moves into a native dialog while inspecting.
            // Retain its table footprint rather than collapsing the whole table.
            setStyle(market, 'min-height', marketAtHome ? '0px' : `${retainedMarketHeight}px`);
            const sides = assignSeats(panels, state.selfIndex);
            const sizes = new Map();
            const angles = { bottom: 0, left: 90, top: 180, right: 270 };
            for (const [side, owners] of Object.entries(sides)) {
                for (const panel of owners) {
                    const count = panel.querySelectorAll('.cardboard-card').length;
                    const lateral = side === 'left' || side === 'right';
                    // Side cards rotate into vertical strips. Give those strips
                    // fewer native columns on a wide screen, and reverse the
                    // balance when the viewport itself is tall.
                    let maximumColumns;
                    if (lateral) maximumColumns = wide ? shallow ? 2 : 4 : 6;
                    else if (oppositeOnly) maximumColumns = wide ? shallow ? 12 : 8 : count >= 13 ? 4 : 3;
                    else maximumColumns = wide ? count >= 13 ? 8 : 6 : count >= 13 ? 3 : 2;
                    const ownerColumns = Math.min(maximumColumns, Math.max(1, count));
                    setStyle(panel, '--table-owner-columns', String(ownerColumns));
                    setStyle(panel, 'width', `${ownerColumns * 160 + (ownerColumns - 1) * 8 + 16}px`);
                    setStyle(panel, 'position', 'absolute');
                    setStyle(panel, 'display', 'flex');
                    setStyle(panel, 'flex-direction', 'column');
                    setStyle(panel, 'transform-origin', '0 0');
                    panel.dataset.seatPosition = side;
                    panel.dataset.tableAngle = String(angles[side]);
                    const nativeWidth = panel.offsetWidth;
                    const nativeHeight = panel.offsetHeight;
                    const rotated = side === 'left' || side === 'right';
                    sizes.set(panel, { nativeWidth, nativeHeight,
                        width: rotated ? nativeHeight : nativeWidth,
                        height: rotated ? nativeWidth : nativeHeight });
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
