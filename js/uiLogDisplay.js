'use strict';

const UiLogDisplay = (() => {
    const MAX_FULL_LOG = 300;
    const LEADING_DECORATIVE_EMOJI = /^(?:🌾|🌽|🏪|🐟|💸|🍸|🍽️|📰|🏛️|📺|🚚|🔄|👤|🏗️|🔨|🧹|🍷|🏢|🎲|📡|🚉|⚓|💤|💰|💳|🏟️|❌|💻|🏆|✈️|🎡|⚠️)\s*/u;
    const LOG_ICON_BY_CLASS = Object.freeze({
        'log-dice': 'dice',
        'log-gain': 'coin',
        'log-lose': 'coin',
        'log-build': 'build',
        'log-special': 'sequence',
        'log-system': 'log',
        'log-error': 'warning',
    });

    function visibleLogMessage(message, options = {}) {
        const value = String(message ?? '');
        return options.stripLeadingEmoji ? value.replace(LEADING_DECORATIVE_EMOJI, '') : value;
    }

    function makeLogTypeDisplay(logTypes) {
        return Object.freeze({
            [logTypes.DICE]:    Object.freeze({ cls: 'log-dice',    label: 'ダイス' }),
            [logTypes.GAIN]:    Object.freeze({ cls: 'log-gain',    label: '収入' }),
            [logTypes.LOSE]:    Object.freeze({ cls: 'log-lose',    label: '支払い' }),
            [logTypes.BUILD]:   Object.freeze({ cls: 'log-build',   label: '建設' }),
            [logTypes.SPECIAL]: Object.freeze({ cls: 'log-special', label: '特殊' }),
            [logTypes.SYSTEM]:  Object.freeze({ cls: 'log-system',  label: '進行' }),
            [logTypes.ERROR]:   Object.freeze({ cls: 'log-error',   label: 'エラー' }),
        });
    }

    function classifyLogEntry(entry, display) {
        return display[entry.type] || { cls: 'log-system', label: '進行' };
    }

    function logTypeIconHtml(logClass, options = {}) {
        if (options.useSunsetIcons !== true) return '';
        const icon = LOG_ICON_BY_CLASS[logClass] || 'log';
        return `<svg class="log-type-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="icons/interface-ui.svg#${icon}"></use></svg>`;
    }

    function extractLogDetails(entry) {
        const detail = { actor: '', target: '', amount: '', subject: '' };
        if (!entry) return detail;
        const entryMessage = entry.message || entry;
        const amountMatch = entryMessage.match(/([+-]?\d+)コイン/);
        if (amountMatch) detail.amount = amountMatch[1];

        const actorPatterns = [
            /^(?:🌾|🏪|🐟|💸|🍸|🍽️|📰|🏛️)\s+([^の\s]+)の/,
            /^(?:📺|🚚)\s+([^か\s]+)から/,
            /^(?:🔄)\s+([^ ]+)/,
            /^(?:👤)\s+([^の]+)のターン/,
        ];
        for (const pattern of actorPatterns) {
            const match = entryMessage.match(pattern);
            if (match) {
                detail.actor = match[1];
                break;
            }
        }

        const targetPatterns = [
            /^🚚\s+.+を(.+)に渡して[+]4コイン$/u,
            /^🔄\s+.+ ⇔ (.+)の.+ を交換しました$/u,
            /^📺\s+.+から(.+)に\d+コイン$/u,
            /^(?:📺|📰|🏛️)\s+(.+)から\d+コイン/u,
        ];
        for (const pattern of targetPatterns) {
            const match = entryMessage.match(pattern);
            if (match) {
                detail.target = match[1];
                break;
            }
        }

        const subjectPatterns = [
            /の([^発動\s]+)発動/,
            /^(?:🏗️|🔨|🚚|🧹|🍷|📺|🏢)\s*([^を⇔ ]+)/,
            /^(?:🌾|🏪|🐟|💸|🍸|🍽️)\s+[^の]+の([^発動\s]+)/,
        ];
        for (const pattern of subjectPatterns) {
            const match = entryMessage.match(pattern);
            if (match) {
                detail.subject = match[1];
                break;
            }
        }
        return detail;
    }

    function buildLogEntriesHtml(entries, display, escapeHtml, options = {}) {
        if (!Array.isArray(entries) || typeof escapeHtml !== 'function') return '';
        let lastEntryIndex = -1;
        for (let index = entries.length - 1; index >= 0; index--) {
            if (entries[index] !== '__SEP__') { lastEntryIndex = index; break; }
        }
        return entries.map((entry, index) => {
            if (entry === '__SEP__') return '<div class="log-separator"></div>';
            const { cls } = classifyLogEntry(entry, display);
            const latestClass = index === lastEntryIndex ? ' log-latest' : '';
            const details = entry.coinEvent
                ? { actor: entry.coinEvent.actor, target: '', subject: entry.coinEvent.subject,
                    amount: `${entry.coinEvent.payment ? '-' : '+'}${entry.coinEvent.amount}` }
                : extractLogDetails(entry);
            const hasRelatedBoardItem = !!(details.actor || details.target || details.subject);
            const visibleMessage = escapeHtml(visibleLogMessage(entry.message, options));
            const iconHtml = logTypeIconHtml(cls, options);
            const messageHtml = iconHtml ? `${iconHtml}<span>${visibleMessage}</span>` : visibleMessage;
            if (!hasRelatedBoardItem) {
                return `<div class="log-item ${cls}${latestClass}${iconHtml ? ' log-item-with-icon' : ''}">${messageHtml}</div>`;
            }
            const accessibleMessage = iconHtml ? visibleMessage : escapeHtml(entry.message);
            return `<button type="button" class="log-item log-related-action ${cls}${latestClass}${iconHtml ? ' log-item-with-icon' : ''}" data-ui-action="highlightLogEntry" data-player-name="${escapeHtml(details.actor)}" data-target-name="${escapeHtml(details.target)}" data-card-name="${escapeHtml(details.subject)}" data-log-message="${escapeHtml(entry.message)}" aria-label="関連する盤面を表示: ${accessibleMessage}">${messageHtml}</button>`;
        }).join('');
    }

    // Projection only: never replace the structured history used by save/replay.
    function coinEvent(entry, display, options = {}) {
        if (!entry || typeof entry.message !== 'string') return null;
        const cls = classifyLogEntry(entry, display).cls;
        if (cls !== 'log-gain' && cls !== 'log-lose') return null;
        const amounts = [...entry.message.matchAll(/([+-]?\d+)コイン/g)];
        if (!amounts.length) return null;
        const amount = Math.abs(Number(amounts[amounts.length - 1][1]));
        if (!Number.isSafeInteger(amount)) return null;
        const message = visibleLogMessage(entry.message, { stripLeadingEmoji: true });
        const named = message.match(/^(.+?)の(.+?)発動/);
        let actor = named ? named[1] : options.turnPlayerName || '';
        let subject = named ? named[2] : '';
        const players = Array.isArray(options.players) ? options.players : [];
        const matchingNames = players.filter(player => player && message.startsWith(`${player.name}の`));
        if (matchingNames.length === 1) {
            actor = matchingNames[0].name;
            subject = message.slice(actor.length + 1).split('発動')[0];
        }
        if (!subject) {
            const cause = message.match(/^(.+?)(?:発動|効果|×\d+：)/);
            subject = cause ? cause[1].replace(/[！!：:]+$/, '') : '';
        }
        if (!subject) return null;
        return Object.freeze({ actor, subject, amount, payment: cls === 'log-lose',
            transfer: cls === 'log-lose' && !!named });
    }

    function groupCoinEvents(entries, display, options = {}) {
        const paymentMessage = (event, count) => {
            const who = event.actor ? `${event.actor}の` : '';
            const repeats = count > 1 ? `（${count}回）` : '';
            return `${who}${event.subject}${event.transfer ? 'へ' : 'で'}${event.amount}コイン支払い${repeats}`;
        };
        const grouped = [];
        for (const entry of Array.isArray(entries) ? entries : []) {
            const event = coinEvent(entry, display, options);
            const previous = grouped[grouped.length - 1];
            if (event && previous && previous.coinEvent && previous.type === entry.type &&
                    previous.coinEvent.actor === event.actor &&
                    previous.coinEvent.subject === event.subject &&
                    previous.coinEvent.transfer === event.transfer) {
                const amount = previous.coinEvent.amount + event.amount;
                if (Number.isSafeInteger(amount)) {
                    previous.coinEvent = Object.assign({}, event, { amount });
                    previous.count++;
                    const who = event.actor ? `${event.actor}の` : '';
                    previous.message = event.payment ? paymentMessage(previous.coinEvent, previous.count)
                        : `${who}${event.subject}発動 → +${amount}コイン（${previous.count}回）`;
                    continue;
                }
            }
            grouped.push(entry === '__SEP__' ? entry : Object.assign({}, entry,
                event ? { coinEvent: event, count: 1,
                    message: event.payment ? paymentMessage(event, 1) : entry.message } : {}));
        }
        return grouped;
    }

    function turnCoinSummary(entries, display, options = {}) {
        const actor = options.turnPlayerName || '';
        if (!actor) return null;
        const players = Array.isArray(options.players) ? options.players : [];
        if (players.filter(player => player && player.name === actor).length > 1) return null;
        let income = 0, payment = 0;
        for (const entry of Array.isArray(entries) ? entries : []) {
            const event = coinEvent(entry, display, options);
            if (!event) continue;
            if (event.payment) payment += event.amount;
            else if (event.actor === actor) income += event.amount;
        }
        return Object.freeze({ actor, income, payment, net: income - payment });
    }

    function buildRecentEventsHtml(entries, currentEntries, display, escapeHtml, options = {}) {
        const recent = groupCoinEvents(entries, display, Object.assign({}, options, { turnPlayerName: '' }))
            .filter(entry => entry !== '__SEP__').slice(-4);
        const summary = turnCoinSummary(currentEntries, display, options);
        const heading = summary && (summary.income || summary.payment)
            ? `<div class="plaza-event-summary">${escapeHtml(summary.actor)}の施設収支: 収入${summary.income} / 支払い${summary.payment} / ${summary.net >= 0 ? '+' : ''}${summary.net}コイン</div>`
            : '';
        const balance = options.turnBalance;
        const balanceHtml = balance && Number.isSafeInteger(balance.net)
            ? `<div class="plaza-event-summary">${escapeHtml(balance.actor)}のこの手番: ${balance.net >= 0 ? '+' : ''}${balance.net}コイン（建設・特殊効果を含む）</div>`
            : '';
        return balanceHtml + heading + buildLogEntriesHtml(recent, display, escapeHtml, options);
    }

    function buildLogSummaryHtml(currentLog, display, escapeHtml, options = {}) {
        if (!Array.isArray(currentLog) || typeof escapeHtml !== 'function') return '';
        const counts = { "収入": 0, "支払い": 0, "建設": 0, "特殊": 0, "ダイス": 0 };
        currentLog.slice(-8).forEach(entry => {
            const { label } = classifyLogEntry(entry, display);
            if (counts[label] !== undefined) counts[label]++;
        });
        const parts = [];
        const latest = currentLog[currentLog.length - 1];
        if (latest) {
            parts.push(`<span class="log-chip highlight">最新: ${escapeHtml(visibleLogMessage(latest.message, options))}</span>`);
            const details = extractLogDetails(latest);
            const detailCards = [];
            if (details.actor) detailCards.push(`<span class="log-detail-card"><span class="log-detail-label">主体</span><span class="log-detail-value">${escapeHtml(details.actor)}</span></span>`);
            if (details.subject) detailCards.push(`<span class="log-detail-card"><span class="log-detail-label">対象カード</span><span class="log-detail-value">${escapeHtml(details.subject)}</span></span>`);
            if (details.target) detailCards.push(`<span class="log-detail-card"><span class="log-detail-label">相手/対象</span><span class="log-detail-value">${escapeHtml(details.target)}</span></span>`);
            if (details.amount) {
                const amountText = `${/^[+-]/.test(details.amount) ? '' : '+'}${details.amount}コイン`;
                detailCards.push(`<span class="log-detail-card"><span class="log-detail-label">コイン変動</span><span class="log-detail-value">${escapeHtml(amountText)}</span></span>`);
            }
            if (detailCards.length > 0) parts.push(`<div class="log-detail-row">${detailCards.join('')}</div>`);
        } else {
            parts.push('<span class="log-chip">ログはまだありません</span>');
        }
        Object.entries(counts).forEach(([label, count]) => {
            if (count > 0) parts.push(`<span class="log-chip">${label} ${count}</span>`);
        });
        return parts.join('');
    }

    function updateLogHistory(previousEntries, previousLength, currentEntries, maxEntries = MAX_FULL_LOG) {
        const fullLog = Array.isArray(previousEntries) ? previousEntries.slice() : [];
        const currentLog = Array.isArray(currentEntries) ? currentEntries : [];
        const priorLength = Number.isInteger(previousLength) && previousLength >= 0
            ? previousLength
            : 0;
        if (currentLog.length < priorLength) {
            const isReroll = currentLog.some(entry => entry &&
                typeof entry.message === 'string' &&
                entry.message.startsWith('📡'));
            if (!isReroll && fullLog.length > 0 && currentLog.length > 0) fullLog.push('__SEP__');
            fullLog.push(...currentLog);
        } else {
            fullLog.push(...currentLog.slice(priorLength));
        }
        const limit = Number.isInteger(maxEntries) && maxEntries >= 0 ? maxEntries : MAX_FULL_LOG;
        let bounded = fullLog;
        if (bounded.length > limit) {
            bounded = bounded.slice(bounded.length - limit);
            while (bounded.length > 0 && bounded[0] === '__SEP__') bounded.shift();
        }
        return Object.freeze({
            entries: Object.freeze(bounded),
            currentLength: currentLog.length,
            entryCount: bounded.filter(entry => entry !== '__SEP__').length,
        });
    }

    function createHistoryController(options = {}) {
        let entries = Array.isArray(options.entries) ? options.entries.slice() : [];
        let currentLength = Number.isInteger(options.currentLength) && options.currentLength >= 0
            ? options.currentLength
            : 0;
        const maxEntries = Number.isInteger(options.maxEntries) && options.maxEntries >= 0
            ? options.maxEntries
            : MAX_FULL_LOG;

        function snapshot() {
            const detachedEntries = Object.freeze(entries.slice());
            return Object.freeze({
                entries: detachedEntries,
                currentLength,
                entryCount: detachedEntries.filter(entry => entry !== '__SEP__').length,
            });
        }

        function append(currentEntries) {
            const history = updateLogHistory(
                entries,
                currentLength,
                currentEntries,
                maxEntries
            );
            entries = Array.from(history.entries);
            currentLength = history.currentLength;
            return snapshot();
        }

        function reset() {
            entries = [];
            currentLength = 0;
            return snapshot();
        }

        return Object.freeze({ snapshot, append, reset });
    }

    function buildLogToggleView(collapsed) {
        return Object.freeze({
            collapsed: collapsed === true,
            iconText: collapsed === true ? '▶' : '▼',
            ariaExpanded: collapsed === true ? 'false' : 'true',
        });
    }

    return Object.freeze({
        makeLogTypeDisplay,
        classifyLogEntry,
        extractLogDetails,
        buildLogEntriesHtml,
        buildLogSummaryHtml,
        coinEvent,
        groupCoinEvents,
        turnCoinSummary,
        buildRecentEventsHtml,
        buildLogToggleView,
        updateLogHistory,
        createHistoryController,
    });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = UiLogDisplay;
if (typeof window !== 'undefined') window.UiLogDisplay = UiLogDisplay;
if (typeof globalThis !== 'undefined') globalThis.UiLogDisplay = UiLogDisplay;
