'use strict';

const UiLogDisplay = (() => {
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

        const targetMatch = entryMessage.match(/(?:から|を)([^に\s]+)(?:に|の)?/);
        if (targetMatch && !detail.target) detail.target = targetMatch[1];

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

    function buildLogEntriesHtml(entries, display, escapeHtml) {
        if (!Array.isArray(entries) || typeof escapeHtml !== 'function') return '';
        let lastEntryIndex = -1;
        for (let index = entries.length - 1; index >= 0; index--) {
            if (entries[index] !== '__SEP__') { lastEntryIndex = index; break; }
        }
        return entries.map((entry, index) => {
            if (entry === '__SEP__') return '<div class="log-separator"></div>';
            const { cls } = classifyLogEntry(entry, display);
            const latestClass = index === lastEntryIndex ? ' log-latest' : '';
            return `<div class="log-item ${cls}${latestClass}">${escapeHtml(entry.message)}</div>`;
        }).join('');
    }

    function buildLogSummaryHtml(currentLog, display, escapeHtml) {
        if (!Array.isArray(currentLog) || typeof escapeHtml !== 'function') return '';
        const counts = { "収入": 0, "支払い": 0, "建設": 0, "特殊": 0, "ダイス": 0 };
        currentLog.slice(-8).forEach(entry => {
            const { label } = classifyLogEntry(entry, display);
            if (counts[label] !== undefined) counts[label]++;
        });
        const parts = [];
        const latest = currentLog[currentLog.length - 1];
        if (latest) {
            parts.push(`<span class="log-chip highlight">最新: ${escapeHtml(latest.message)}</span>`);
            const details = extractLogDetails(latest);
            const detailCards = [];
            if (details.actor) detailCards.push(`<span class="log-detail-card"><span class="log-detail-label">主体</span><span class="log-detail-value">${escapeHtml(details.actor)}</span></span>`);
            if (details.subject) detailCards.push(`<span class="log-detail-card"><span class="log-detail-label">対象カード</span><span class="log-detail-value">${escapeHtml(details.subject)}</span></span>`);
            if (details.target) detailCards.push(`<span class="log-detail-card"><span class="log-detail-label">相手/対象</span><span class="log-detail-value">${escapeHtml(details.target)}</span></span>`);
            if (details.amount) {
                const amountText = `${details.amount.startsWith('-') ? '' : '+'}${details.amount}コイン`;
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
        buildLogToggleView,
    });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = UiLogDisplay;
if (typeof window !== 'undefined') window.UiLogDisplay = UiLogDisplay;
if (typeof globalThis !== 'undefined') globalThis.UiLogDisplay = UiLogDisplay;
