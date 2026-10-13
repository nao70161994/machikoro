'use strict';

// Presentation only. The caller supplies newly resolved shared turn results,
// including income confirmed after a reroll or harbor choice;
// do not replay it after restore, Undo, theme changes, or a later build action.
const CardBoardTransfers = (() => {
    function participantName(events, index) {
        return index === 'pool' ? '分配プール' : index === null ? '銀行'
            : String(events.participantNames?.[index] || `席${index + 1}`);
    }
    function project(events) {
        const groups = new Map();
        const activations = Array.isArray(events?.activations) ? events.activations : [];
        for (const event of activations) {
            if (!event || typeof event !== 'object') continue;
            const validIndex = index => index === null || index === 'pool' || Number.isInteger(index) && index >= 0 &&
                (!Array.isArray(events.participantNames) || index < events.participantNames.length);
            if (!validIndex(event.from) || !validIndex(event.to) || event.from === event.to ||
                !Number.isSafeInteger(event.amount) || event.amount < 0) continue;
            const subject = typeof event.subject === 'string' ? event.subject.trim() : '';
            const key = JSON.stringify([event.from, event.to, subject]);
            const old = groups.get(key);
            const amount = (old?.amount || 0) + event.amount;
            if (!Number.isSafeInteger(amount)) continue;
            groups.set(key, { from: event.from, to: event.to, subject, amount });
        }
        return [...groups.values()].map(route => {
            const projected = { from: route.from, to: route.to, amount: route.amount };
            if (route.subject) projected.subject = route.subject;
            return { ...projected,
                text: `${route.subject ? `${route.subject}：` : ''}${participantName(events, route.from)} → ${participantName(events, route.to)}：${route.amount}コイン`,
            };
        });
    }

    function projectVisualFlows(routes, events) {
        const groups = new Map();
        for (const route of routes) {
            const key = JSON.stringify([route.from, route.to]);
            let flow = groups.get(key);
            if (!flow) {
                flow = { from: route.from, to: route.to, amount: 0, subjects: new Set() };
                groups.set(key, flow);
            }
            const amount = flow.amount + route.amount;
            if (!Number.isSafeInteger(amount)) continue;
            flow.amount = amount;
            if (route.subject) flow.subjects.add(route.subject);
        }
        return [...groups.values()].map(flow => ({
            ...flow,
            fromName: participantName(events, flow.from),
            toName: participantName(events, flow.to),
            subjects: [...flow.subjects],
            title: `${[...flow.subjects].join('・') ? `${[...flow.subjects].join('・')}：` : ''}${participantName(events, flow.from)} → ${participantName(events, flow.to)}：${flow.amount}コイン`,
        }));
    }

    function create() {
        let layer = null;
        let summaryNode = null;
        let timeout = null;
        let view = null;
        let animations = [];
        let motionQuery = null;
        let motionHandler = null;
        let motionObserver = null;
        function stopMotion() {
            for (const animation of animations) animation.cancel();
            animations = [];
            layer?.remove();
            layer = null;
        }
        function clear() {
            if (timeout !== null) view?.clearTimeout(timeout);
            timeout = null;
            stopMotion();
            summaryNode?.remove();
            summaryNode = null;
            if (motionQuery && motionHandler) {
                if (typeof motionQuery.removeEventListener === 'function') motionQuery.removeEventListener('change', motionHandler);
                else motionQuery.removeListener?.(motionHandler);
            }
            motionObserver?.disconnect();
            motionQuery = null;
            motionHandler = null;
            motionObserver = null;
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
            summaryNode = documentRef.createElement('p');
            summaryNode.className = 'cardboard-transfer-summary';
            summaryNode.textContent = routes.slice(0, 3).map(route =>
                route.text.replace(/^(.*?)：(\d+)コイン$/, '$2コイン · $1')
            ).concat(routes.length > 3 ? [`ほか${routes.length - 3}件（発動・支払いの内訳で確認）`] : [])
                .concat(events.incomplete ? ['未集計の記録は発動・支払いの内訳で確認'] : []).join('\n');
            summaryNode.setAttribute('role', 'status');
            summaryNode.setAttribute('aria-live', 'polite');
            summaryNode.setAttribute('aria-label', routes.slice(0, 8).map(route =>
                route.text.replace(/^(.*?)：(\d+)コイン$/, '$2コイン。$1')
            ).concat(routes.length > 8 ? [`ほか${routes.length - 8}件は発動・支払いの内訳で確認`] : [])
                .concat(events.incomplete ? ['未集計の記録は発動・支払いの内訳で確認'] : []).join('。'));
            (options.summaryContainer?.isConnected ? options.summaryContainer : layer).appendChild(summaryNode);
            // Read endpoints first, then animate without touching game state.
            const displayed = projectVisualFlows(routes, events)
                .sort((left, right) => right.amount - left.amount)
                .slice(0, 8)
                .map(route => ({ route, from: location(route.from), to: location(route.to) }));
            container.appendChild(layer);
            if (!reducedMotion) {
                motionQuery = view?.matchMedia?.('(prefers-reduced-motion: reduce)') || null;
                motionHandler = event => { if (event.matches) stopMotion(); };
                if (typeof motionQuery?.addEventListener === 'function') motionQuery.addEventListener('change', motionHandler);
                else motionQuery?.addListener?.(motionHandler);
                const Observer = view?.MutationObserver;
                if (typeof Observer === 'function' && documentRef.body) {
                    motionObserver = new Observer(() => {
                        if (documentRef.body.classList?.contains('accessibility-reduced-motion')) stopMotion();
                    });
                    motionObserver.observe(documentRef.body, { attributes: true, attributeFilter: ['class'] });
                }
            }
            let animationIndex = 0;
            for (const { route, from, to } of displayed) {
                if (reducedMotion || route.amount === 0 || !from || !to) continue;
                const coin = documentRef.createElement('span');
                coin.className = 'cardboard-transfer';
                const sourceIsBank = route.from === null || route.from === 'pool';
                const targetIsBank = route.to === null || route.to === 'pool';
                coin.dataset.flow = sourceIsBank ? 'incoming' : targetIsBank ? 'outgoing' : 'between';
                if (!targetIsBank && route.amount >= 5) coin.dataset.large = 'true';
                coin.setAttribute('aria-hidden', 'true');
                coin.textContent = `${route.amount}コイン`;
                coin.title = route.title;
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
            // Flights finish within 1.4s; keep the route summary visible long
            // enough to read after the motion has ended.
            timeout = view?.setTimeout(clear, 3200) ?? null;
            return true;
        }
        return Object.freeze({ play, clear });
    }
    return Object.freeze({ project, create });
})();
if (typeof module !== 'undefined' && module.exports) module.exports = CardBoardTransfers;
