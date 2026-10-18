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
            /** @type {{ from: number | 'pool' | null, to: number | 'pool' | null, amount: number, subject?: string }} */
            const projected = { from: route.from, to: route.to, amount: route.amount };
            if (route.subject) projected.subject = route.subject;
            return { ...projected,
                text: `${route.subject ? `${route.subject}：` : ''}${participantName(events, route.from)} → ${participantName(events, route.to)}：${route.amount}コイン`,
            };
        });
    }

    function projectFacilityTimeline(events) {
        const groups = new Map();
        const count = Array.isArray(events?.participantNames) ? events.participantNames.length : Infinity;
        for (const event of Array.isArray(events?.activations) ? events.activations : []) {
            if (event?.facility !== true || typeof event.subject !== 'string' ||
                    !Number.isSafeInteger(event.amount) || event.amount < 0) continue;
            const owner = event.owner !== undefined && event.owner !== null ? event.owner
                : event.to !== null ? event.to : event.from;
            if (!Number.isInteger(owner) || owner < 0 || owner >= count) continue;
            const key = JSON.stringify([owner, event.subject]);
            if (!groups.has(key)) groups.set(key, { owner, name: event.subject, net: 0 });
            groups.get(key).net += (event.to === owner ? event.amount : 0) - (event.from === owner ? event.amount : 0);
        }
        return [...groups.values()].filter(group => Number.isSafeInteger(group.net)).slice(0, 8)
            .map((group, step) => ({ ...group, step }));
    }

    function projectVisualFlows(events) {
        const timeline = new Map(projectFacilityTimeline(events).map(group => [JSON.stringify([group.owner, group.name]), group]));
        const groups = new Map();
        for (const event of Array.isArray(events?.activations) ? events.activations : []) {
            const route = project({ ...events, activations: [event] })[0];
            if (!route || route.amount <= 0) continue;
            const owner = event.owner !== undefined && event.owner !== null ? event.owner
                : event.to !== null ? event.to : event.from;
            const facility = event.facility === true ? timeline.get(JSON.stringify([owner, event.subject])) : null;
            if (event.facility === true && !facility) continue;
            const key = JSON.stringify([facility?.owner ?? null, facility?.name ?? null, route.from, route.to]);
            let flow = groups.get(key);
            if (!flow) {
                flow = { from: route.from, to: route.to, amount: 0, subjects: new Set(), facility };
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
        })).sort((left, right) => left.facility && right.facility ? left.facility.step - right.facility.step
            : left.facility ? -1 : right.facility ? 1 : right.amount - left.amount);
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
            const viewport = container.querySelector('#cardboardTableViewport');
            const viewportBounds = viewport?.getBoundingClientRect();
            const intersects = (rect, clip) => rect?.width > 0 && rect.height > 0 && clip?.width > 0 && clip.height > 0 &&
                rect.left < clip.left + clip.width && rect.left + rect.width > clip.left &&
                rect.top < clip.top + clip.height && rect.top + rect.height > clip.top;
            const location = index => {
                if (index === null || index === 'pool') return center;
                const header = container.querySelector(`[data-player-index="${index}"] .cardboard-header`);
                let rect = header?.getBoundingClientRect();
                // Panning can leave an otherwise measurable header outside the
                // visible table. Route those flights to the persistent HUD.
                if (!rect?.width || !rect.height || viewport && !intersects(rect, viewportBounds)) {
                    const seat = container.querySelector(`.cardboard-roster-seat[data-cardboard-player-index="${index}"]`);
                    rect = seat?.getBoundingClientRect();
                    if (viewport && !intersects(rect, bounds)) return null;
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
            const displayed = projectVisualFlows(events)
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
            let lastFlightEnd = 0;
            const stepRoutes = new Map();
            for (const { route, from, to } of displayed) {
                if (reducedMotion || route.amount === 0 || !from || !to) continue;
                const coin = documentRef.createElement('span');
                coin.className = 'cardboard-transfer';
                const sourceIsBank = route.from === null || route.from === 'pool';
                const targetIsBank = route.to === null || route.to === 'pool';
                coin.dataset.flow = sourceIsBank ? 'incoming' : targetIsBank ? 'outgoing' : 'between';
                if (!targetIsBank && route.amount >= 5) coin.dataset.large = 'true';
                if (route.facility) {
                    coin.dataset.facility = route.facility.name;
                    coin.dataset.owner = String(route.facility.owner);
                    coin.dataset.step = String(route.facility.step);
                }
                coin.setAttribute('aria-hidden', 'true');
                coin.textContent = `${route.amount}コイン`;
                coin.dataset.route = `${route.fromName} → ${route.toName}`;
                coin.title = route.title;
                coin.style.left = `${from.x}px`;
                coin.style.top = `${from.y}px`;
                layer.appendChild(coin);
                if (typeof coin.animate === 'function') {
                    const baseDelay = Math.max(0, Math.min(500, Number(options.delayMs) || 0));
                    const sameStep = route.facility ? stepRoutes.get(route.facility.step) || 0 : animationIndex;
                    const delay = baseDelay + (route.facility ? route.facility.step * 700 + Math.min(80, sameStep * 20) : sameStep * 70);
                    const duration = route.facility ? 600 : 900;
                    if (route.facility) stepRoutes.set(route.facility.step, sameStep + 1);
                    const animation = coin.animate([
                        { transform: 'translate(-50%, -50%) scale(.8)', opacity: 0 },
                        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: .15 },
                        { transform: `translate(calc(-50% + ${to.x - from.x}px), calc(-50% + ${to.y - from.y}px)) scale(1)`, opacity: 1, offset: .85 },
                        { transform: `translate(calc(-50% + ${to.x - from.x}px), calc(-50% + ${to.y - from.y}px)) scale(.8)`, opacity: 0 },
                    ], { duration, delay, easing: 'ease-in-out', fill: 'both' });
                    if (!route.facility) animationIndex++;
                    lastFlightEnd = Math.max(lastFlightEnd, delay + duration);
                    animation.finished?.catch(() => {});
                    animations.push(animation);
                } else coin.remove();
            }
            // Facility steps share the caption timeline; no timer advances play.
            timeout = view?.setTimeout(clear, Math.max(3200, lastFlightEnd + 100)) ?? null;
            return true;
        }
        return Object.freeze({ play, clear });
    }
    return Object.freeze({ project, projectFacilityTimeline, create });
})();
if (typeof module !== 'undefined' && module.exports) module.exports = CardBoardTransfers;
