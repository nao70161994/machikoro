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
        function clear() {
            generation++;
            for (const timer of timers) view?.clearTimeout(timer);
            timers.clear();
            removeTag();
            if (listening) {
                viewport?.removeEventListener('scroll', clear, true);
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
                const size = tag.getBoundingClientRect();
                const inset = 4;
                const x = Math.max(bounds.left + inset, Math.min(rect.left + rect.width / 2 - size.width / 2,
                    bounds.right - size.width - inset));
                const above = rect.top - size.height - 5;
                const y = Math.max(bounds.top + inset, Math.min(above >= bounds.top + inset ? above : rect.bottom + 5,
                    bounds.bottom - size.height - inset));
                tag.style.left = `${x}px`;
                tag.style.top = `${y}px`;
                // Delayed timer delivery can bunch consecutive steps together.
                // An older expiry must never remove a newer facility caption.
                const shownTag = tag;
                schedule(() => { if (tag === shownTag) removeTag(); }, 600);
            }
            viewport.addEventListener('scroll', clear, true);
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
