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

    function projectOwnerNets(events) {
        const nets = new Map();
        for (const event of Array.isArray(events?.activations) ? events.activations : []) {
            const route = project({ ...events, activations: [event] })[0];
            if (!route) continue;
            for (const [owner, sign] of [[route.from, -1], [route.to, 1]]) {
                if (!Number.isInteger(owner)) continue;
                const net = (nets.get(owner) || 0) + sign * route.amount;
                if (!Number.isSafeInteger(net)) return null;
                nets.set(owner, net);
            }
        }
        return [...nets].map(([owner, net]) => ({ owner, net }));
    }

    // All-or-none: never leave only the winners visible when one label cannot fit.
    function placeNetBadges(owners, bounds, obstacles) {
        const overlap = (a, b) => a.left < b.right + 2 && a.right > b.left - 2 && a.top < b.bottom + 2 && a.bottom > b.top - 2;
        const distance = (rect, anchor) => Math.hypot((rect.left + rect.right) / 2 - (anchor.left + anchor.right) / 2,
            (rect.top + rect.bottom) / 2 - (anchor.top + anchor.bottom) / 2);
        const candidates = owners.map(owner => {
            const a = owner.anchor, w = owner.width, h = 26;
            const positions = [];
            for (const gap of [4, 12, 24]) {
                positions.push([a.left, a.top - h - gap], [a.right - w, a.bottom + gap],
                    [a.left - w - gap, a.top], [a.right + gap, a.bottom - h]);
            }
            return positions.map(([left, top]) => ({ ...owner, left, top, right: left + w, bottom: top + h, height: h }))
                .filter(rect => rect.left >= bounds.left && rect.right <= bounds.right && rect.top >= bounds.top && rect.bottom <= bounds.bottom &&
                    !obstacles.some(obstacle => overlap(rect, obstacle)) &&
                    owners.every(other => other === owner || distance(rect, owner.anchor) <= distance(rect, other.anchor)));
        });
        let budget = 2000;
        const search = (index, placed) => {
            if (!budget--) return null;
            if (index === owners.length) return placed;
            for (const candidate of candidates[index]) {
                if (placed.some(rect => overlap(candidate, rect))) continue;
                const result = search(index + 1, [...placed, candidate]);
                if (result) return result;
            }
            return null;
        };
        return search(0, []);
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
        let badgeContext = null;
        let badges = [];
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
            badgeContext = null;
            badges = [];
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
        function positionBadges() {
            if (!badgeContext || !layer) return;
            const { container, events, nets } = badgeContext;
            const rect = container.getBoundingClientRect();
            const viewport = container.querySelector('#cardboardTableViewport')?.getBoundingClientRect() || rect;
            const valid = box => box?.width > 0 && box.height > 0;
            const inside = box => valid(box) && box.left >= viewport.left && box.right <= viewport.right && box.top >= viewport.top && box.bottom <= viewport.bottom;
            const obstacles = Array.from(container.querySelectorAll?.('.cardboard-owner-label, .cardboard-card, .cardboard-landmark, #cardboardCenter, #cardboardControls, #cardboardCameraTools, #cardboardRoster, #cardboardViewHint') || [])
                .map(element => element.getBoundingClientRect()).filter(valid);
            const owners = (nets || []).map(entry => {
                const label = container.querySelector(`.cardboard-owner-label[data-player-index="${entry.owner}"]`);
                const header = container.querySelector(`[data-player-index="${entry.owner}"] .cardboard-header`);
                const hud = container.querySelector(`.cardboard-roster-seat[data-cardboard-player-index="${entry.owner}"]`);
                const anchor = [label, header, hud].map(element => element?.getBoundingClientRect()).find(inside);
                const text = `${events.incomplete ? '確認分' : '収支'} ${entry.net > 0 ? '+' : ''}${entry.net}`;
                return { ...entry, text, anchor, width: Math.max(78, text.length * 12 + 16) };
            });
            const bounds = { left: Math.max(rect.left, viewport.left), right: Math.min(rect.right, viewport.right),
                top: Math.max(rect.top, viewport.top), bottom: Math.min(rect.bottom, viewport.bottom) };
            const plan = nets && owners.every(owner => owner.anchor) ? placeNetBadges(owners, bounds, obstacles) : null;
            layer.dataset.netBadges = plan ? 'complete' : nets ? 'unplaced' : 'overflow';
            const key = plan ? JSON.stringify(plan.map(item => [item.owner, item.net, item.left, item.top, item.width])) : 'none';
            if (layer.dataset.netBadgeGeometry === key) return;
            layer.dataset.netBadgeGeometry = key;
            badges.forEach(badge => badge.remove());
            badges = [];
            if (!plan) return;
            for (const placement of plan) {
                const badge = container.ownerDocument.createElement('span');
                badge.className = 'cardboard-owner-net';
                badge.dataset.playerIndex = String(placement.owner);
                badge.dataset.net = String(placement.net);
                badge.dataset.incomplete = String(events.incomplete === true);
                badge.textContent = placement.text;
                badge.setAttribute('aria-label', `${participantName(events, placement.owner)}の${placement.text}`);
                badge.style.left = `${placement.left - rect.left}px`;
                badge.style.top = `${placement.top - rect.top}px`;
                badge.style.width = `${placement.width}px`;
                layer.appendChild(badge);
                badges.push(badge);
            }
        }
        function retarget() {
            if (!simultaneousMotion || !layer?.isConnected || !endpointReader || !actors.some(actor =>
                actor.animation.playState !== 'finished' && actor.animation.playState !== 'idle')) return false;
            positionBadges();
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
            const allRoutes = project(events);
            const routes = allRoutes.filter(route => route.amount > 0);
            if (!routes.length && !events.incomplete && !(options.simultaneous && projectOwnerNets(events)?.length)) return false;
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
                    if (index === null || index === 'pool') {
                        const market = container.querySelector('#cardboardCenter')?.getBoundingClientRect();
                        return market && intersects(market, viewportBounds)
                            ? { x: market.left + market.width / 2 - bounds.left, y: market.top + market.height / 2 - bounds.top } : center;
                    }
                    const label = container.querySelector(`.cardboard-owner-label[data-player-index="${index}"]`);
                    const header = label && intersects(label.getBoundingClientRect(), viewportBounds) ? label
                        : container.querySelector(`[data-player-index="${index}"] .cardboard-header`);
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
            const visualFlows = projectVisualFlows(events, parallel);
            const visualLimit = parallel ? 12 : 8;
            if (parallel && visualFlows.length > visualLimit) {
                const omitted = `送金演出は${visualLimit}/${visualFlows.length}経路。全経路は発動・支払いの内訳で確認`;
                summaryNode.textContent += `\n${omitted}`;
                summaryNode.setAttribute('aria-label', `${summaryNode.getAttribute('aria-label') || ''}。${omitted}`);
            }
            const displayed = visualFlows
                .slice(0, visualLimit)
                .map(route => ({ route, from: location(route.from), to: location(route.to) }));
            container.appendChild(layer);
            if (parallel && !reducedMotion) {
                badgeContext = { container, events, nets: projectOwnerNets(events) };
                positionBadges();
            }
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
                coin.textContent = parallel ? '●' : `${route.amount}コイン`;
                coin.dataset.amount = String(route.amount);
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
    return Object.freeze({ project, projectFacilityTimeline, projectOwnerNets, placeNetBadges, create });
})();
if (typeof module !== 'undefined' && module.exports) module.exports = CardBoardTransfers;
