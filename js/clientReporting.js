const ClientReporting = Object.freeze({
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
