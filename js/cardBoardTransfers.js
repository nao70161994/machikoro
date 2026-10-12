'use strict';

// Presentation only. The caller supplies newly resolved shared turn results,
// including income confirmed after a reroll or harbor choice;
// do not replay it after restore, Undo, theme changes, or a later build action.
const CardBoardTransfers = (() => {
    function project(events) {
        const groups = new Map();
        const activations = Array.isArray(events?.activations) ? events.activations : [];
        for (const event of activations) {
            if (!event || typeof event !== 'object') continue;
            const validIndex = index => index === null || index === 'pool' || Number.isInteger(index) && index >= 0 &&
                (!Array.isArray(events.participantNames) || index < events.participantNames.length);
            if (!validIndex(event.from) || !validIndex(event.to) || event.from === event.to ||
                !Number.isSafeInteger(event.amount) || event.amount < 0) continue;
            const key = JSON.stringify([event.from, event.to]);
            const old = groups.get(key);
            const amount = (old?.amount || 0) + event.amount;
            if (!Number.isSafeInteger(amount)) continue;
            groups.set(key, { from: event.from, to: event.to, amount });
        }
        const name = index => index === 'pool' ? '分配プール' : index === null ? '銀行'
            : String(events.participantNames?.[index] || `席${index + 1}`);
        return [...groups.values()].map(route => ({ ...route,
            text: `${name(route.from)} → ${name(route.to)}：${route.amount}コイン`,
        }));
    }

    function create() {
        let layer = null;
        let timeout = null;
        let view = null;
        let animations = [];
        function clear() {
            if (timeout !== null) view?.clearTimeout(timeout);
            timeout = null;
            for (const animation of animations) animation.cancel();
            animations = [];
            layer?.remove();
            layer = null;
            view = null;
        }
        function play(options) {
            clear();
            const { container, events } = options;
            if (!container?.isConnected || !events) return false;
            // Zero-value activations belong in the dice receipt, but a coin
            // flight for them reads as movement and duplicates that receipt.
            const routes = project(events).filter(route => route.amount > 0);
            if (!routes.length && !events.incomplete) return false;
            const documentRef = container.ownerDocument;
            view = documentRef.defaultView;
            const reducedMotion = options.reducedMotion === true ||
                documentRef.body?.classList?.contains('accessibility-reduced-motion') === true ||
                (view?.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? true);
            const bounds = container.getBoundingClientRect();
            if (!bounds.width || !bounds.height) return false;
            const center = { x: bounds.width / 2, y: bounds.height / 2 };
            const location = index => {
                if (index === null || index === 'pool') return center;
                const header = container.querySelector(`[data-player-index="${index}"] .cardboard-header`);
                let rect = header?.getBoundingClientRect();
                if (!rect?.width || !rect.height) {
                    const seat = container.querySelector(`.cardboard-roster-seat[data-cardboard-player-index="${index}"]`);
                    rect = seat?.getBoundingClientRect();
                }
                if (!rect?.width || !rect.height) return null;
                const inset = 8;
                const clamp = (value, extent) => Math.max(Math.min(inset, extent / 2),
                    Math.min(extent - Math.min(inset, extent / 2), value));
                return {
                    x: clamp(rect.left + rect.width / 2 - bounds.left, bounds.width),
                    y: clamp(rect.top + rect.height / 2 - bounds.top, bounds.height),
                };
            };
            layer = documentRef.createElement('div');
            layer.className = 'cardboard-transfers';
            const summary = documentRef.createElement('p');
            summary.className = 'cardboard-transfer-summary';
            summary.setAttribute('role', 'status');
            summary.setAttribute('aria-live', 'polite');
            summary.setAttribute('aria-label', routes.map(route => route.text).join('。') +
                (events.incomplete ? '。未集計の特殊効果は出目の内訳で確認' : ''));
            summary.textContent = routes.slice(0, 3).map(route => route.text).join(' / ') +
                (routes.length > 3 ? ` / ほか${routes.length - 3}件（出目の内訳で確認）` : '') +
                (events.incomplete ? ' / 未集計の特殊効果は出目の内訳で確認' : '');
            layer.appendChild(summary);
            // Read endpoints first, then animate without touching game state.
            const displayed = routes.slice(0, 8).map(route => ({ route, from: location(route.from), to: location(route.to) }));
            container.appendChild(layer);
            let animationIndex = 0;
            for (const { route, from, to } of displayed) {
                if (reducedMotion || route.amount === 0 || !from || !to) continue;
                const coin = documentRef.createElement('span');
                coin.className = 'cardboard-transfer';
                coin.dataset.flow = route.from === null ? 'incoming' : route.to === null ? 'outgoing' : 'between';
                if (route.to !== null && route.amount >= 5) coin.dataset.large = 'true';
                coin.setAttribute('aria-hidden', 'true');
                const direction = route.from === null ? '+' : route.to === null ? '−' : '→';
                coin.textContent = `${direction} ${route.amount}コイン`;
                coin.style.left = `${from.x}px`;
                coin.style.top = `${from.y}px`;
                layer.appendChild(coin);
                if (typeof coin.animate === 'function') {
                    const animation = coin.animate([
                        { transform: 'translate(-50%, -50%) scale(.8)', opacity: 0 },
                        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: .15 },
                        { transform: `translate(calc(-50% + ${to.x - from.x}px), calc(-50% + ${to.y - from.y}px)) scale(1)`, opacity: 1, offset: .85 },
                        { transform: `translate(calc(-50% + ${to.x - from.x}px), calc(-50% + ${to.y - from.y}px)) scale(.8)`, opacity: 0 },
                    ], { duration: 900, delay: animationIndex * 70, easing: 'ease-in-out', fill: 'both' });
                    animationIndex++;
                    animation.finished?.catch(() => {});
                    animations.push(animation);
                } else coin.remove();
            }
            timeout = view?.setTimeout(clear, 1600) ?? null;
            return true;
        }
        return Object.freeze({ play, clear });
    }
    return Object.freeze({ project, create });
})();
if (typeof module !== 'undefined' && module.exports) module.exports = CardBoardTransfers;
