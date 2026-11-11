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

    function projectVisualFlows(events, parallel = false) {
        const timeline = new Map(projectFacilityTimeline(events).map(group => [JSON.stringify([group.owner, group.name]), group]));
        const groups = new Map();
        for (const event of Array.isArray(events?.activations) ? events.activations : []) {
            const route = project({ ...events, activations: [event] })[0];
            if (!route || route.amount <= 0) continue;
            const owner = event.owner !== undefined && event.owner !== null ? event.owner
                : event.to !== null ? event.to : event.from;
            const facility = event.facility === true ? timeline.get(JSON.stringify([owner, event.subject])) : null;
            if (event.facility === true && !facility && !parallel) continue;
            const key = JSON.stringify(parallel ? [route.from, route.to] : [facility?.owner ?? null, facility?.name ?? null, route.from, route.to]);
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
        let actors = [];
        let endpointReader = null;
        let simultaneousMotion = false;
        let startFrame = null;
        let motionGeneration = 0;
        let motionQuery = null;
        let motionHandler = null;
        let motionObserver = null;
        function stopMotion() {
            motionGeneration++;
            if (startFrame !== null) view?.cancelAnimationFrame(startFrame);
            startFrame = null;
            for (const animation of animations) animation.cancel();
            animations = [];
            actors = [];
            endpointReader = null;
            simultaneousMotion = false;
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
        function stageSimultaneous(container) {
            const generation = motionGeneration;
            const schedule = remaining => {
                startFrame = view.requestAnimationFrame(() => {
                    if (generation !== motionGeneration || !simultaneousMotion) return;
                    startFrame = null;
                    if (!container.isConnected || !layer?.isConnected || container.ownerDocument.hidden ||
                            motionQuery?.matches || container.ownerDocument.body?.classList?.contains('accessibility-reduced-motion')) {
                        stopMotion();
                        return;
                    }
                    if (remaining > 0) schedule(remaining - 1);
                    else for (const animation of animations) {
                        // Start this bundle once, after its initial rendering
                        // opportunity. No replay or clock reset on retarget.
                        if (animation.playState === 'paused') animation.play();
                    }
                });
            };
            schedule(1);
        }
        function flightFrames(from, to, origin = from) {
            const translate = point => point.x === origin.x && point.y === origin.y
                ? 'translate(-50%, -50%)'
                : `translate(calc(-50% + ${point.x - origin.x}px), calc(-50% + ${point.y - origin.y}px))`;
            return [
                { transform: `${translate(from)} scale(.8)`, opacity: 0, easing: 'ease-out' },
                { transform: `${translate(from)} scale(1)`, opacity: 1, offset: .15, easing: 'ease-in-out' },
                { transform: `${translate(to)} scale(1)`, opacity: 1, offset: .85, easing: 'ease-in' },
                { transform: `${translate(to)} scale(.8)`, opacity: 0 },
            ];
        }
        function retarget() {
            if (!simultaneousMotion || !layer?.isConnected || !endpointReader || !actors.some(actor =>
                actor.animation.playState !== 'finished' && actor.animation.playState !== 'idle')) return false;
            const location = endpointReader();
            // Batch reads before writes. Retargeting never restarts an animation
            // or changes its currentTime, startTime, duration or cleanup lease.
            const updates = actors.map(actor => ({ actor,
                from: location(actor.route.from), to: location(actor.route.to) }));
            for (const { actor, from, to } of updates) {
                if (!actor.animation.effect || actor.animation.playState === 'finished' || actor.animation.playState === 'idle') continue;
                const key = from && to ? `${from.x}:${from.y}:${to.x}:${to.y}` : 'hidden';
                if (key === actor.endpointKey) continue;
                const frames = from && to ? flightFrames(from, to, actor.origin)
                    : flightFrames(actor.origin, actor.origin).map(frame => ({ ...frame, opacity: 0 }));
                actor.animation.effect.setKeyframes(frames);
                actor.endpointKey = key;
            }
            return true;
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
            endpointReader = () => {
                const bounds = container.getBoundingClientRect();
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
                return location;
            };
            const location = endpointReader();
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
            const parallel = options.simultaneous === true;
            simultaneousMotion = parallel && !reducedMotion;
            const displayed = projectVisualFlows(events, parallel)
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
                    coin.dataset.facility = parallel ? route.subjects.join('・') : route.facility.name;
                    coin.dataset.owner = String(route.facility.owner);
                    coin.dataset.step = String(route.facility.step);
                }
                coin.dataset.subjects = JSON.stringify(route.subjects);
                coin.dataset.from = String(route.from);
                coin.dataset.to = String(route.to);
                coin.dataset.mode = parallel ? 'parallel' : 'timeline';
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
                    const delay = parallel ? 0 : baseDelay + (route.facility ? route.facility.step * 700 + Math.min(80, sameStep * 20) : sameStep * 70);
                    const duration = parallel || route.facility ? 600 : 900;
                    if (route.facility) stepRoutes.set(route.facility.step, sameStep + 1);
                    const animation = coin.animate(flightFrames(from, to), { duration, delay, easing: 'linear', fill: 'both' });
                    if (parallel) {
                        animation.pause();
                        animation.currentTime = 0;
                    }
                    if (!route.facility) animationIndex++;
                    lastFlightEnd = Math.max(lastFlightEnd, delay + duration);
                    animation.finished?.catch(() => {});
                    animations.push(animation);
                    actors.push({ route, animation, origin: from, endpointKey: `${from.x}:${from.y}:${to.x}:${to.y}` });
                } else coin.remove();
            }
            if (simultaneousMotion && animations.length) stageSimultaneous(container);
            // Facility steps share the caption timeline; no timer advances play.
            timeout = view?.setTimeout(clear, Math.max(3200, lastFlightEnd + 100)) ?? null;
            return true;
        }
        return Object.freeze({ play, retarget, clear });
    }
    return Object.freeze({ project, projectFacilityTimeline, create });
})();
if (typeof module !== 'undefined' && module.exports) module.exports = CardBoardTransfers;
