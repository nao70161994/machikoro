'use strict';

function makeClientErrorReporting({ isPlainObject, limits, buildHash = '' }) {
    function truncateText(value, maxLength) {
        const text = String(value || '');
        return text.length > maxLength ? text.slice(0, maxLength) + '...' : text;
    }

    function scrubClientErrorText(value) {
        return String(value || '')
            .replace(/https?:\/\/[^\s)'\"]+/g, rawUrl => {
                try {
                    const parsed = new URL(rawUrl);
                    return parsed.origin + parsed.pathname;
                } catch (_error) {
                    return rawUrl.split(/[?#]/)[0];
                }
            })
            .replace(/((?:reconnectToken|sessionId|clientErrorToken|x-client-error-token|token)[\s\"']*[=:][\s\"']*)([^\s,}\]\"']+)/gi, '$1[redacted]');
    }

    function normalizeClientErrorNumber(value) {
        const number = Number(value);
        return Number.isInteger(number) && number >= 0 && number <= 1000000 ? number : null;
    }

    function normalizeClientErrorPlayerIndex(value) {
        const number = Number(value);
        return Number.isInteger(number) && number >= -1 && number <= 20 ? number : null;
    }

    function normalizeClientErrorPayload(payload, now = Date.now()) {
        if (!isPlainObject(payload)) return { ok: false, reason: 'payload must be an object' };
        const message = truncateText(scrubClientErrorText(payload.message), limits.maxMessageLength).trim();
        const stack = truncateText(scrubClientErrorText(payload.stack), limits.maxStackLength);
        if (!message && !stack) return { ok: false, reason: 'message or stack is required' };
        const report = {
            source: truncateText(payload.source || 'client', 80),
            message: message || '(no message)',
            stack,
            filename: truncateText(scrubClientErrorText(payload.filename), 300),
            line: normalizeClientErrorNumber(payload.line),
            column: normalizeClientErrorNumber(payload.column),
            userAgent: truncateText(payload.userAgent, 300),
            phase: truncateText(payload.phase, 80),
            roomId: truncateText(payload.roomId, 40),
            playerIndex: normalizeClientErrorPlayerIndex(payload.playerIndex),
            timestamp: truncateText(payload.timestamp || new Date(now).toISOString(), 80),
            appVersion: truncateText(payload.appVersion || (typeof buildHash === 'function' ? buildHash() : buildHash), 80),
            url: truncateText(scrubClientErrorText(payload.url), 300),
            receivedAt: new Date(now).toISOString(),
        };
        return { ok: true, report };
    }

    return Object.freeze({
        truncateText,
        scrubClientErrorText,
        normalizeClientErrorNumber,
        normalizeClientErrorPlayerIndex,
        normalizeClientErrorPayload,
    });
}

module.exports = { makeClientErrorReporting };
