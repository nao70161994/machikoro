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

    return Object.freeze({ makeLogTypeDisplay, classifyLogEntry, extractLogDetails });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = UiLogDisplay;
if (typeof window !== 'undefined') window.UiLogDisplay = UiLogDisplay;
if (typeof globalThis !== 'undefined') globalThis.UiLogDisplay = UiLogDisplay;
