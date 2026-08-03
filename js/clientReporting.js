const ClientReporting = Object.freeze({
    clientUrl(location) {
        if (!location) return '';
        const origin = location.origin || '';
        const pathname = location.pathname || '';
        if (origin || pathname) return origin + pathname;
        const href = location.href || '';
        return href.split(/[?#]/)[0];
    },

    runtimeContext(input = {}) {
        return {
            userAgent: input.userAgent || '',
            phase: input.phase || '',
            roomId: input.roomId || '',
            playerIndex: typeof input.playerIndex !== 'undefined' ? input.playerIndex : null,
            appVersion: input.appVersion || '',
            url: input.url || '',
        };
    },

    truncateField(value, limit) {
        const text = String(value || '');
        return text.length > limit ? text.slice(0, limit) + '...' : text;
    },

    errorMessage(value) {
        if (value instanceof Error) return value.message;
        if (value && typeof value.message === 'string') return value.message;
        return String(value || '不明なエラー');
    },

    errorStack(value) {
        if (value instanceof Error) return value.stack || value.message;
        if (value && typeof value.stack === 'string') return value.stack;
        return '';
    },

    isErrorLike(value) {
        return value instanceof Error || !!(value && (typeof value.message === 'string' || typeof value.stack === 'string'));
    },

    windowErrorInput(event = {}) {
        return {
            source: 'window.onerror',
            message: event.message,
            error: event.error,
            filename: event.filename,
            line: event.lineno,
            column: event.colno,
        };
    },

    unhandledRejectionInput(event = {}) {
        return {
            source: 'window.onunhandledrejection',
            error: event.reason,
            message: ClientReporting.errorMessage(event.reason),
        };
    },

    consoleErrorInput(args = []) {
        const values = Array.isArray(args) ? args : [];
        const first = values[0];
        const errorLike = ClientReporting.isErrorLike(first);
        return {
            source: 'console.error',
            error: errorLike ? first : null,
            message: errorLike
                ? ClientReporting.errorMessage(first)
                : values.map(value => String(value)).join(' '),
        };
    },

    compactFreezeSummaryStack(stack, options = {}) {
        const text = String(stack || '');
        const marker = 'FREEZE_SUMMARY ';
        const limit = Number.isFinite(options.limit) ? options.limit : 4000;
        if (!text.startsWith(marker) || text.length <= limit) return text;
        let summary = null;
        try {
            summary = JSON.parse(text.slice(marker.length));
        } catch (_) {
            return ClientReporting.truncateField(text, limit);
        }
        const compact = {
            schemaVersion: summary.schemaVersion || options.schemaVersion || 1,
            freezeKind: summary.freezeKind || '',
            recoveryStatus: summary.recoveryStatus || '',
            stagnantMs: summary.stagnantMs,
            phase: summary.phase || '',
            currentPlayerIndex: summary.currentPlayerIndex,
            myPlayerIndex: summary.myPlayerIndex,
            isOnlineGame: summary.isOnlineGame,
            cpuSchedulerHealth: summary.cpuSchedulerHealth || null,
            isReconnectingOnline: summary.isReconnectingOnline,
            allowedActions: Array.isArray(summary.allowedActions) ? summary.allowedActions : [],
            visibleModals: Array.isArray(summary.visibleModals) ? summary.visibleModals : [],
            interactabilityIssues: Array.isArray(summary.interactabilityIssues) ? summary.interactabilityIssues.slice(0, 4) : [],
            actionChildren: Array.isArray(summary.actionChildren) ? summary.actionChildren.slice(0, 8) : [],
            gameScreen: summary.gameScreen || null,
            pendingMenu: summary.pendingMenu || null,
            pendingModal: summary.pendingModal || null,
            confirmModal: summary.confirmModal || null,
            recovery: summary.recovery || null,
            compacted: true,
        };
        let result = marker + JSON.stringify(compact);
        if (result.length <= limit) return result;
        delete compact.confirmModal;
        delete compact.pendingModal;
        delete compact.pendingMenu;
        delete compact.gameScreen;
        result = marker + JSON.stringify(compact);
        if (result.length <= limit) return result;
        compact.interactabilityIssues = compact.interactabilityIssues.slice(0, 1);
        compact.actionChildren = compact.actionChildren.slice(0, 3);
        result = marker + JSON.stringify(compact);
        if (result.length <= limit) return result;
        return marker + JSON.stringify({
            schemaVersion: compact.schemaVersion || options.schemaVersion || 1,
            freezeKind: compact.freezeKind,
            recoveryStatus: compact.recoveryStatus,
            stagnantMs: compact.stagnantMs,
            phase: compact.phase,
            allowedActions: compact.allowedActions,
            interactabilityIssues: compact.interactabilityIssues.slice(0, 1),
            recovery: compact.recovery,
            compacted: true,
            truncated: true,
        });
    },

    stackForReport(input, options = {}) {
        const stack = input?.stack || ClientReporting.errorStack(input?.error);
        const compacted = ClientReporting.compactFreezeSummaryStack(stack, options);
        if (String(compacted || '').startsWith('FREEZE_SUMMARY ')) return compacted;
        const limit = Number.isFinite(options.limit) ? options.limit : 4000;
        return ClientReporting.truncateField(compacted, limit);
    },

    buildReport(input, context, options = {}) {
        const source = input?.source || 'unknown';
        const error = input?.error;
        const message = input?.message || ClientReporting.errorMessage(error);
        return Object.assign({}, context || {}, {
            source,
            message: ClientReporting.truncateField(message, options.messageLimit),
            stack: options.stack,
            filename: ClientReporting.truncateField(input?.filename || '', 300),
            line: Number.isFinite(input?.line) ? input.line : null,
            column: Number.isFinite(input?.column) ? input.column : null,
            timestamp: typeof options.timestamp === 'string' ? options.timestamp : new Date().toISOString(),
        });
    },

    reportKey(report) {
        return [report.source, report.message, report.filename, report.line, report.column, report.phase, report.roomId].join('|');
    },
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ClientReporting };
}
