'use strict';

// A readable caption anchored to the real facility. Presentation timers never
// advance the game or hold up an action. The caller owns replay/session guards.
const CardBoardActivationTags = (() => {
    function create({ container, viewport }) {
        const timers = new Set();
        let tag = null;
        let highlighted = [];
        let generation = 0;
        let listening = false;
        const view = container?.ownerDocument?.defaultView;
        function removeTag() {
            for (const element of highlighted) element.classList.remove('cardboard-resolving');
            highlighted = [];
            tag?.remove();
            tag = null;
        }
        function onScroll(event) {
            // The market scrolls inside the table to reveal matching facilities.
            // That does not move the owned card anchoring this presentation.
            if (event.target === viewport) clear();
        }
        function clear() {
            generation++;
            for (const timer of timers) view?.clearTimeout(timer);
            timers.clear();
            removeTag();
            if (listening) {
                viewport?.removeEventListener('scroll', onScroll, true);
                view?.removeEventListener('resize', clear);
                listening = false;
            }
        }
        function schedule(callback, delay) {
            const timer = view.setTimeout(() => {
                timers.delete(timer);
                callback();
            }, delay);
            timers.add(timer);
        }
        function play({ events, players, isCurrent, reducedMotion = false, delayMs = 0 }) {
            clear();
            if (!container?.isConnected || !viewport?.isConnected || !view ||
                !Array.isArray(players) || !Array.isArray(events?.activations) ||
                typeof isCurrent !== 'function' || !isCurrent()) return false;
            const groups = new Map();
            for (const event of events.activations) {
                if (event?.facility !== true || typeof event.subject !== 'string' ||
                    !Number.isSafeInteger(event.amount) || event.amount < 0) continue;
                const owner = event.owner !== undefined && event.owner !== null ? event.owner
                    : event.to !== null ? event.to : event.from;
                if (!Number.isInteger(owner) || owner < 0 || owner >= players.length || !players[owner]) continue;
                const key = JSON.stringify([owner, event.subject]);
                if (!groups.has(key)) groups.set(key, { owner, name: event.subject, net: 0, routes: new Set() });
                const group = groups.get(key);
                const participant = index => index === null ? '銀行' : index === 'pool' ? '分配プール'
                    : players[index]?.name || `席${Number(index) + 1}`;
                const validParticipant = index => index === null || index === 'pool' ||
                    Number.isInteger(index) && index >= 0 && index < players.length;
                if (event.amount > 0 && event.from !== event.to &&
                        validParticipant(event.from) && validParticipant(event.to)) {
                    group.routes.add(`${participant(event.from)} → ${participant(event.to)}`);
                }
                group.net += (event.to === owner ? event.amount : 0) - (event.from === owner ? event.amount : 0);
            }
            const entries = [...groups.values()].filter(group => Number.isSafeInteger(group.net)).slice(0, 8);
            if (!entries.length) return false;
            const currentGeneration = generation;
            const reduced = reducedMotion || container.ownerDocument.body?.classList.contains('accessibility-reduced-motion') ||
                view.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
            function show(group, step = 0) {
                removeTag();
                if (currentGeneration !== generation || !isCurrent() || container.ownerDocument.hidden ||
                    !container.isConnected || !viewport.isConnected) { clear(); return; }
                const seat = container.querySelector(`.cardboard-player[data-player-index="${group.owner}"]`);
                const card = Array.from(seat?.querySelectorAll('.cardboard-card') || []).find(element =>
                    element.getAttribute('data-card-name') === group.name);
                if (!card) return;
                const bounds = viewport.getBoundingClientRect();
                const rect = card.getBoundingClientRect();
                if (!rect.width || !rect.height || !bounds.width || !bounds.height ||
                    rect.right <= bounds.left || rect.left >= bounds.right ||
                    rect.bottom <= bounds.top || rect.top >= bounds.bottom) return;
                const documentRef = container.ownerDocument;
                tag = documentRef.createElement('div');
                tag.className = 'cardboard-activation-tag';
                tag.setAttribute('aria-hidden', 'true');
                tag.dataset.motion = reduced ? 'reduced' : 'normal';
                for (const color of ['blue', 'green', 'red', 'purple']) {
                    if (card.classList.contains(`cardboard-card-${color}`)) tag.dataset.category = color;
                }
                // Reuse the displayed SVG symbol reference; no duplicate card
                // actions, IDs, or new image fetches belong in this event layer.
                const originalArt = card.querySelector('.cardboard-art > svg');
                let art = null;
                if (originalArt && !originalArt.hasAttribute('id') && !originalArt.querySelector('[id]')) {
                    art = documentRef.createElement('div');
                    art.className = 'cardboard-activation-art';
                    art.setAttribute('aria-hidden', 'true');
                    const illustration = originalArt.cloneNode(true);
                    art.appendChild(illustration);
                    tag.appendChild(art);
                }
                const name = documentRef.createElement('strong');
                name.textContent = group.name;
                const income = documentRef.createElement('span');
                const ownerName = players[group.owner].name || `席${group.owner + 1}`;
                income.textContent = `${ownerName} · `;
                const amount = documentRef.createElement('span');
                amount.className = 'cardboard-activation-amount';
                amount.textContent = `${group.net > 0 ? '+' : ''}${group.net}コイン`;
                income.appendChild(amount);
                tag.append(name, income);
                if (group.routes.size) {
                    const route = documentRef.createElement('small');
                    route.className = 'cardboard-activation-route';
                    route.textContent = [...group.routes].join(' / ');
                    tag.appendChild(route);
                }
                // Keep the actual card and its owner identifiable even when
                // the table is zoomed out. These are presentation-only marks.
                const roster = container.querySelector(`.cardboard-roster-seat[data-cardboard-player-index="${group.owner}"]`);
                highlighted = [card, seat?.querySelector('.cardboard-header'), roster].filter(Boolean);
                for (const element of highlighted) element.classList.add('cardboard-resolving');
                if (entries.length > 1 && !reduced) {
                    const progress = documentRef.createElement('small');
                    progress.textContent = `施設発動 ${step + 1} / ${entries.length}`;
                    tag.appendChild(progress);
                }
                container.appendChild(tag);
                const inset = 4;
                const market = viewport.querySelector('#cardboardCenter');
                const obstacles = Array.from(viewport.querySelectorAll('.cardboard-card, .cardboard-landmark, #cardboardCenter'))
                    .filter(element => element !== card).map(element => ({ rect: element.getBoundingClientRect(), market: element === market }));
                const ownerLabels = Array.from(viewport.querySelectorAll('.cardboard-owner-label, .cardboard-player-heading'))
                    .filter(element => view.getComputedStyle(element).opacity !== '0')
                    .map(element => element.getBoundingClientRect())
                    .filter(label => label.width > 0 && label.height > 0);
                const overlap = (left, top, size, target) => Math.max(0, Math.min(left + size.width, target.right) - Math.max(left, target.left)) *
                    Math.max(0, Math.min(top + size.height, target.bottom) - Math.max(top, target.top));
                function placement(size) {
                    const centerX = rect.left + rect.width / 2 - size.width / 2;
                    const centerY = rect.top + rect.height / 2 - size.height / 2;
                    const candidates = [
                        [centerX, rect.top - size.height - 5], [centerX, rect.bottom + 5],
                        [rect.left - size.width - 5, centerY], [rect.right + 5, centerY],
                        // Shift along the source edge before falling back to a
                        // caption over its owner. The seat label is the visual
                        // link between the upright caption and rotated cards.
                        ...[rect.left, rect.right - size.width].flatMap(left => [
                            [left, rect.top - size.height - 5], [left, rect.bottom + 5],
                        ]),
                        ...[rect.top, rect.bottom - size.height].flatMap(top => [
                            [rect.left - size.width - 5, top], [rect.right + 5, top],
                        ]),
                    ].map(([left, top]) => ({
                        left: Math.max(bounds.left + inset, Math.min(left, bounds.right - size.width - inset)),
                        top: Math.max(bounds.top + inset, Math.min(top, bounds.bottom - size.height - inset)),
                    })).map(position => ({ ...position,
                        sourceOverlap: overlap(position.left, position.top, size, rect),
                        ownerCovered: ownerLabels.reduce((sum, label) => sum + overlap(position.left, position.top, size, label), 0),
                        covered: obstacles.reduce((sum, obstacle) => sum + overlap(position.left, position.top, size, obstacle.rect), 0),
                        ownedCovered: obstacles.reduce((sum, obstacle) => sum + (obstacle.market ? 0 : overlap(position.left, position.top, size, obstacle.rect)), 0),
                    }));
                    candidates.sort((a, b) => a.sourceOverlap - b.sourceOverlap || a.ownerCovered - b.ownerCovered || a.covered - b.covered);
                    return candidates[0];
                }
                let size = tag.getBoundingClientRect();
                let position = placement(size);
                // Prefer empty space, including around the market. Income can
                // briefly take its place; other owned facilities stay protected.
                if (art && (size.height > bounds.height / 2 || size.width > bounds.width - inset * 2 ||
                        position.sourceOverlap > 0 || position.ownedCovered > size.width * size.height / 3)) {
                    art.remove();
                    art = null;
                    size = tag.getBoundingClientRect();
                    position = placement(size);
                }
                tag.dataset.presentation = art ? 'illustrated' : 'text';
                tag.style.left = `${position.left}px`;
                tag.style.top = `${position.top}px`;
                // Delayed timer delivery can bunch consecutive steps together.
                // An older expiry must never remove a newer facility caption.
                const shownTag = tag;
                schedule(() => { if (tag === shownTag) removeTag(); }, 600);
            }
            viewport.addEventListener('scroll', onScroll, true);
            view.addEventListener('resize', clear);
            listening = true;
            // Reduced motion keeps one static caption rather than cycling cards.
            if (reduced) show(entries[0]);
            else entries.forEach((group, index) => schedule(() => show(group, index),
                Math.max(0, Math.min(500, Number(delayMs) || 0)) + index * 700));
            return true;
        }
        return Object.freeze({ play, clear });
    }
    return Object.freeze({ create });
})();
if (typeof module !== 'undefined' && module.exports) module.exports = CardBoardActivationTags;
