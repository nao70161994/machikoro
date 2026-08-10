async function postNtfyNotification(options = {}) {
    const topic = options.topic;
    if (!topic) {
        if (typeof options.onMissingTopic === 'function') options.onMissingTopic();
        return { sent: false, reason: 'missing-topic' };
    }
    const fetchImpl = options.fetchImpl || global.fetch;
    if (typeof fetchImpl !== 'function') {
        console.warn(options.fetchUnavailableMessage || '[ntfy] fetch unavailable; notification skipped');
        return { sent: false, reason: 'fetch-unavailable' };
    }
    const params = new URLSearchParams();
    if (options.title) params.set('title', options.title);
    if (options.priority) params.set('priority', String(options.priority));
    if (options.tags) params.set('tags', options.tags);
    const query = params.toString();
    const baseUrl = String(options.baseUrl || 'https://ntfy.sh').replace(/\/+$/, '');
    const accessToken = String(options.accessToken || '').trim();
    const headers = {};
    if (accessToken) headers.Authorization = 'Bearer ' + accessToken;
    const timeoutMs = Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
        ? options.timeoutMs
        : 10000;
    const AbortControllerImpl = options.AbortControllerImpl || global.AbortController;
    const setTimeoutFn = options.setTimeoutFn || setTimeout;
    const clearTimeoutFn = options.clearTimeoutFn || clearTimeout;
    const controller = typeof AbortControllerImpl === 'function'
        ? new AbortControllerImpl()
        : null;
    let timeoutId = null;
    let timedOut = false;
    try {
        if (controller && typeof setTimeoutFn === 'function') {
            timeoutId = setTimeoutFn(() => {
                timedOut = true;
                controller.abort();
            }, timeoutMs);
        }
        const response = await fetchImpl(baseUrl + '/' + encodeURIComponent(topic) + (query ? '?' + query : ''), {
            method: 'POST',
            body: options.body || '',
            headers,
            ...(controller ? { signal: controller.signal } : {}),
        });
        if (response && response.ok === false) {
            console.warn(options.statusFailureMessage || '[ntfy] notification failed:', response.status || 'unknown');
            const retryAfterHeader = response.headers &&
                typeof response.headers.get === 'function'
                ? response.headers.get('Retry-After')
                : '';
            const retryAfterSeconds = Number(retryAfterHeader);
            const retryAfterMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0
                ? Math.ceil(retryAfterSeconds * 1000)
                : response.status === 429 ? 5000 : 0;
            return {
                sent: false,
                reason: 'ntfy-status',
                status: Number.isInteger(response.status) ? response.status : null,
                ...(retryAfterMs > 0 ? { retryAfterMs } : {}),
            };
        }
        return { sent: true };
    } catch (error) {
        console.warn(options.errorFailureMessage || '[ntfy] notification failed:', error?.message || error);
        return { sent: false, reason: timedOut ? 'ntfy-timeout' : 'ntfy-error' };
    } finally {
        if (timeoutId !== null && typeof clearTimeoutFn === 'function') clearTimeoutFn(timeoutId);
    }
}

module.exports = {
    postNtfyNotification,
};
