'use strict';

// Presentation only. The caller supplies newly resolved shared turn results,
// including income confirmed after a reroll or harbor choice;
// do not replay it after restore, Undo, theme changes, or a later build action.
const CardBoardTransfers = (() => {
    function project(events) {
        const groups = new Map();
        for (const event of events?.activations || []) {
            const validIndex = index => index === null || index === 'pool' || Number.isInteger(index) && index >= 0 && index < (events.participantNames?.length || 0);
            if (!validIndex(event.from) || !validIndex(event.to) || event.from === event.to ||
                !Number.isSafeInteger(event.amount) || event.amount < 0) continue;
            const key = JSON.stringify([event.from, event.to]);
            const old = groups.get(key);
            const amount = (old?.amount || 0) + event.amount;
            if (!Number.isSafeInteger(amount)) continue;
            groups.set(key, { from: event.from, to: event.to, amount });
        }
        const name = index => index === 'pool' ? '分配プール' : index === null ? '銀行' : String(events.participantNames[index]);
        return [...groups.values()].map(route => ({ ...route,
            text: `${name(route.from)} → ${name(route.to)}：${route.amount}コイン`,
        }));
    }

    function create() {
        let layer = null;
        let summaryElement = null;
        let timeout = null;
        let view = null;
        let animations = [];
        function clear() {
            if (timeout !== null) view?.clearTimeout(timeout);
            timeout = null;
            for (const animation of animations) animation.cancel();
            animations = [];
            summaryElement?.remove();
            summaryElement = null;
            layer?.remove();
            layer = null;
            view = null;
        }
        function play(options) {
            clear();
            const { container, events } = options;
            if (!container?.isConnected || !events) return false;
            const routes = project(events);
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
                if (!header) return null;
                const rect = header.getBoundingClientRect();
                if (!rect.width || !rect.height) return null;
                return { x: rect.left + rect.width / 2 - bounds.left,
                    y: rect.top + rect.height / 2 - bounds.top };
            };
            layer = documentRef.createElement('div');
            layer.className = 'cardboard-transfers';
            summaryElement = documentRef.createElement('p');
            summaryElement.className = 'cardboard-transfer-summary';
            summaryElement.setAttribute('role', 'status');
            summaryElement.setAttribute('aria-live', 'polite');
            const spokenRoutes = routes.slice(0, 8).map(route => route.text).join('、');
            const omittedRoutes = routes.length > 8 ? `、ほか${routes.length - 8}件` : '';
            summaryElement.setAttribute('aria-label', `${spokenRoutes}${omittedRoutes}${events.incomplete ? '。未集計の特殊効果は出目の内訳で確認' : ''}`);
            const seatName = index => {
                if (index === 'pool') return '分配プール';
                if (index === null) return '銀行';
                const participantName = events.participantNames?.[index];
                if (!participantName) return `席${index + 1}`;
                const duplicateName = events.participantNames.filter(name => name === participantName).length > 1;
                return duplicateName ? `${participantName}（席${index + 1}）` : participantName;
            };
            const escapeText = value => String(value).replace(/[&<>"']/g, character =>
                ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
            const shownRoutes = routes.slice(0, 8);
            const summaryText = shownRoutes.map(route =>
                `${seatName(route.from)}→${seatName(route.to)} ${route.amount}コイン`).join(' / ') +
                (routes.length > 8 ? ` / ほか${routes.length - 8}件` : '') +
                (events.incomplete ? ' / 未集計の特殊効果は出目の内訳で確認' : '');
            const routeHtml = shownRoutes.map(route =>
                `<span class="cardboard-transfer-route">${escapeText(seatName(route.from))}→${escapeText(seatName(route.to))} ${route.amount}コイン</span>`
            ).join('<span class="cardboard-transfer-separator" aria-hidden="true"> / </span>');
            summaryElement.textContent = summaryText;
            summaryElement.innerHTML = routeHtml +
                (routes.length > 8 ? `<span class="cardboard-transfer-extra">ほか${routes.length - 8}件</span>` : '') +
                (events.incomplete ? '<span class="cardboard-transfer-extra">未集計の特殊効果は内訳へ</span>' : '');
            // Read endpoints first, then animate without touching game state.
            const displayed = routes.slice(0, 8).map(route => ({ route, from: location(route.from), to: location(route.to) }));
            container.appendChild(layer);
            const receipt = container.querySelector('#cardboardDiceReceipt .plaza-event-receipt');
            if (receipt?.isConnected) {
                summaryElement.classList.add('cardboard-transfer-summary-inline');
                receipt.appendChild(summaryElement);
            } else layer.appendChild(summaryElement);
            for (let index = 0; index < displayed.length; index++) {
                const { route, from, to } = displayed[index];
                if (reducedMotion || route.amount === 0 || !from || !to) continue;
                const coin = documentRef.createElement('span');
                coin.className = 'cardboard-transfer';
                coin.setAttribute('aria-hidden', 'true');
                coin.textContent = `${route.amount}コイン`;
                coin.style.left = `${from.x}px`;
                coin.style.top = `${from.y}px`;
                layer.appendChild(coin);
                if (typeof coin.animate === 'function') {
                    const animation = coin.animate([
                        { transform: 'translate(-50%, -50%) scale(.8)', opacity: 0 },
                        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: .15 },
                        { transform: `translate(calc(-50% + ${to.x - from.x}px), calc(-50% + ${to.y - from.y}px)) scale(1)`, opacity: 1, offset: .85 },
                        { transform: `translate(calc(-50% + ${to.x - from.x}px), calc(-50% + ${to.y - from.y}px)) scale(.8)`, opacity: 0 },
                    ], { duration: 700, delay: index * 100, easing: 'ease-in-out', fill: 'both' });
                    animation.finished?.catch(() => {});
                    animations.push(animation);
                } else coin.remove();
            }
            timeout = view?.setTimeout(clear, 2600) ?? null;
            return true;
        }
        return Object.freeze({ play, clear });
    }
    return Object.freeze({ project, create });
})();
if (typeof module !== 'undefined' && module.exports) module.exports = CardBoardTransfers;
