'use strict';

const STALE_CLIENT_ERROR_VERSION_PREFIXES = Object.freeze([
    'd1eb530',
    'f6ce626',
    '86136c7',
    'cedbf74',
    '5d058cb',
    '9cd909f',
]);

const KNOWN_CLIENT_ERROR_FREEZE_KINDS = Object.freeze(new Set([
    'post-build-ui-blocked',
    'human-turn-ui-locked',
    'pending-ui-locked',
    'cpu-turn-stalled',
    'modal-ui-locked',
    'stale-modal-ui-locked',
]));

/** @type {ReadonlyArray<Readonly<{id: string, pattern: string, priority?: string, tags?: string}>>} */
const KNOWN_CLIENT_ERROR_MESSAGE_PATTERNS = Object.freeze([
    Object.freeze({ id: 'manual-test-endpoint', pattern: 'ダイスシティ ntfy test notification' }),
    Object.freeze({ id: 'client-version-mismatch', pattern: 'Client version mismatch', priority: '2', tags: 'hourglass,known,stale_client' }),
    Object.freeze({ id: 'renderPlayers-playerSettings-fallback', pattern: 'difficulty' }),
    Object.freeze({ id: 'pending-render-recovery', pattern: 'updatePendingModalContent recursion' }),
]);

/**
 * @param {{
 *     isPlainObject: (value: unknown) => boolean,
 *     limits: Readonly<{maxMessageLength: number, maxStackLength: number}>,
 *     buildHash?: string | (() => string),
 *     hashRoomId?: (roomId: string) => string,
 * }} options
 */
function makeClientErrorReporting({ isPlainObject, limits, buildHash = '', hashRoomId = () => '' }) {
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

    function summarizeUserAgent(userAgent) {
        const text = String(userAgent || 'unknown');
        if (/iPhone|iPad|iPod/.test(text) && /Safari/.test(text)) return 'Safari iPhone';
        if (/Android/.test(text) && /Chrome/.test(text)) return 'Android Chrome';
        if (/Safari/.test(text) && !/Chrome/.test(text)) return 'Safari';
        if (/Chrome/.test(text)) return 'Chrome';
        return text.slice(0, 80);
    }

    function redactedClientErrorRoomId(roomId) {
        const text = String(roomId || '').trim();
        if (!text) return '-';
        return 'hash:' + hashRoomId(text).slice(0, 8);
    }

    function extractClientErrorFreezeKind(report) {
        const message = String(report?.message || '');
        const messageMatch = message.match(/^([a-z0-9-]+) after \d+ms$/i);
        if (messageMatch) return messageMatch[1];
        const stack = String(report?.stack || '');
        const stackMatch = stack.match(/"freezeKind"\s*:\s*"([^"]+)"/);
        return stackMatch ? stackMatch[1] : '';
    }

    function isStaleClientErrorVersion(appVersion, stalePrefixes = STALE_CLIENT_ERROR_VERSION_PREFIXES) {
        const version = String(appVersion || '').trim().toLowerCase();
        if (!version) return false;
        return stalePrefixes.some(prefix => version.startsWith(String(prefix).toLowerCase()));
    }

    function extractFreezeSummaryFromStack(stack) {
        const text = String(stack || '');
        const marker = 'FREEZE_SUMMARY ';
        const start = text.indexOf(marker);
        if (start < 0) return null;
        const jsonStart = start + marker.length;
        const jsonText = text.slice(jsonStart).trim();
        if (!jsonText) return null;
        try {
            return JSON.parse(jsonText);
        } catch (_) {
            return null;
        }
    }

    function classifyClientErrorReport(report) {
        const freezeKind = extractClientErrorFreezeKind(report);
        if (isStaleClientErrorVersion(report?.appVersion)) {
            return {
                classification: 'stale-client',
                priority: '2',
                tags: 'hourglass,known,stale_client',
                freezeKind,
                knownPatternId: 'fixed-version-prefix',
            };
        }
        if (freezeKind && KNOWN_CLIENT_ERROR_FREEZE_KINDS.has(freezeKind)) {
            return {
                classification: 'known-pattern',
                priority: '3',
                tags: 'warning,known,ui_lock',
                freezeKind,
                knownPatternId: freezeKind,
            };
        }
        const combined = [report?.message, report?.stack].map(value => String(value || '')).join('\n');
        const matched = KNOWN_CLIENT_ERROR_MESSAGE_PATTERNS.find(entry => combined.includes(entry.pattern));
        if (matched) {
            return {
                classification: 'known-pattern',
                priority: matched.priority || '3',
                tags: matched.tags || 'warning,known,computer',
                freezeKind,
                knownPatternId: matched.id,
            };
        }
        return {
            classification: 'unknown',
            priority: '5',
            tags: 'rotating_light,unknown,computer',
            freezeKind,
            knownPatternId: '',
        };
    }

    function formatNtfyFreezeSummary(report, classification = classifyClientErrorReport(report)) {
        const summary = extractFreezeSummaryFromStack(report && report.stack);
        if (!summary || !summary.freezeKind) return '';
        const issues = Array.isArray(summary.interactabilityIssues) ? summary.interactabilityIssues : [];
        const topIssue = issues[0] || {};
        const actions = Array.isArray(summary.allowedActions) ? summary.allowedActions.join(',') : '';
        const recovery = summary.recovery || {};
        const recoveryText = recovery.attempted ? (recovery.success ? 'success' : 'failed') : 'not-attempted';
        return [
            'UI_LOCK_SUMMARY',
            'freezeKind=' + (summary.freezeKind || classification.freezeKind || '-'),
            'phase=' + (summary.phase || report.phase || 'unknown'),
            'version=' + (report.appVersion || '-'),
            'actions=' + (actions || '-'),
            'issue=' + (topIssue.kind || '-'),
            'action=' + (topIssue.action || '-'),
            'target=' + (topIssue.target || '-'),
            'actionTarget=' + (topIssue.actionTarget || '-'),
            'reason=' + (topIssue.reason || '-'),
            'recovery=' + recoveryText,
            'staleClient=' + (classification.classification === 'stale-client' ? 'true' : 'false'),
        ].join('\n');
    }

    function formatNtfyClientErrorMessage(report) {
        const classification = classifyClientErrorReport(report);
        const freezeSummary = formatNtfyFreezeSummary(report, classification);
        const lines = [
            ...(freezeSummary ? [freezeSummary, ''] : []),
            'classification=' + classification.classification,
            'pattern=' + (classification.knownPatternId || '-'),
            'phase=' + (report.phase || 'unknown'),
            'room=' + redactedClientErrorRoomId(report.roomId),
            'player=' + (report.playerIndex ?? '-'),
            'version=' + (report.appVersion || '-'),
            summarizeUserAgent(report.userAgent),
            report.message,
        ];
        if (report.filename) lines.push(report.filename + ':' + (report.line ?? '-') + ':' + (report.column ?? '-'));
        if (report.stack) lines.push('', truncateText(report.stack, limits.maxStackLength));
        return lines.join('\n');
    }

    return Object.freeze({
        truncateText,
        scrubClientErrorText,
        normalizeClientErrorNumber,
        normalizeClientErrorPlayerIndex,
        normalizeClientErrorPayload,
        summarizeUserAgent,
        redactedClientErrorRoomId,
        extractClientErrorFreezeKind,
        isStaleClientErrorVersion,
        extractFreezeSummaryFromStack,
        classifyClientErrorReport,
        formatNtfyFreezeSummary,
        formatNtfyClientErrorMessage,
    });
}

module.exports = { makeClientErrorReporting };
