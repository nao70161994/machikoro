'use strict';

function requireFunction(value, name) {
    if (typeof value !== 'function') throw new TypeError(name + ' must be a function');
    return value;
}

/**
 * Creates notification delivery adapters for browser error and game lifecycle reports.
 * Topic policy, formatting, classification, redaction, and transport stay injected.
 * @param {Object} dependencies
 * @returns {{
 *   notifyClientError: function(Object, Object=): Promise<Object>,
 *   notifyGameLifecycle: function(Object, Object=): Promise<Object>
 * }}
 */
function makeReportDelivery(dependencies = {}) {
    const postNotification = requireFunction(
        dependencies.postNotification,
        'postNotification'
    );
    const resolveTopic = requireFunction(dependencies.resolveTopic, 'resolveTopic');
    const classifyClientError = requireFunction(
        dependencies.classifyClientError,
        'classifyClientError'
    );
    const formatClientError = requireFunction(
        dependencies.formatClientError,
        'formatClientError'
    );
    const redactClientRoomId = requireFunction(
        dependencies.redactClientRoomId,
        'redactClientRoomId'
    );
    const lifecycleTitle = requireFunction(
        dependencies.lifecycleTitle,
        'lifecycleTitle'
    );
    const formatLifecycle = requireFunction(
        dependencies.formatLifecycle,
        'formatLifecycle'
    );
    const defaultEnv = dependencies.defaultEnv || {};
    const getDefaultFetch = typeof dependencies.getDefaultFetch === 'function'
        ? dependencies.getDefaultFetch
        : () => undefined;
    const warn = typeof dependencies.warn === 'function'
        ? dependencies.warn
        : (...args) => console.warn(...args);

    async function notifyClientError(report, options = {}) {
        const classification = classifyClientError(report);
        return postNotification({
            topic: resolveTopic(options, options.env || defaultEnv),
            fetchImpl: options.fetchImpl || getDefaultFetch(),
            title: classification.classification === 'unknown'
                ? '[ダイスシティ] Unknown Client Error'
                : '[ダイスシティ] Client Error',
            priority: classification.priority,
            tags: classification.tags,
            body: formatClientError(report),
            onMissingTopic() {
                warn(
                    '[client-error]',
                    report.message,
                    'phase=' + (report.phase || 'unknown'),
                    'room=' + redactClientRoomId(report.roomId)
                );
            },
            fetchUnavailableMessage:
                '[client-error] fetch unavailable; ntfy notification skipped',
            statusFailureMessage: '[client-error] ntfy notification failed:',
            errorFailureMessage: '[client-error] ntfy notification failed:',
        });
    }

    async function notifyGameLifecycle(report, options = {}) {
        return postNotification({
            topic: resolveTopic(options, options.env || defaultEnv),
            fetchImpl: options.fetchImpl || getDefaultFetch(),
            title: lifecycleTitle(report.event),
            priority: '2',
            tags: 'video_game,white_check_mark',
            body: formatLifecycle(report),
            onMissingTopic() {
                warn(
                    '[game-lifecycle]',
                    report.event,
                    'mode=' + report.mode,
                    'players=' + report.playerCount,
                    'cpu=' + report.cpuCount
                );
            },
            fetchUnavailableMessage:
                '[game-lifecycle] fetch unavailable; ntfy notification skipped',
            statusFailureMessage: '[game-lifecycle] ntfy notification failed:',
            errorFailureMessage: '[game-lifecycle] ntfy notification failed:',
        });
    }

    return Object.freeze({ notifyClientError, notifyGameLifecycle });
}

module.exports = makeReportDelivery;
