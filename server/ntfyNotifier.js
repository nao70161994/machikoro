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
    try {
        const response = await fetchImpl(baseUrl + '/' + encodeURIComponent(topic) + (query ? '?' + query : ''), {
            method: 'POST',
            body: options.body || '',
            headers,
        });
        if (response && response.ok === false) {
            console.warn(options.statusFailureMessage || '[ntfy] notification failed:', response.status || 'unknown');
            return {
                sent: false,
                reason: 'ntfy-status',
                status: Number.isInteger(response.status) ? response.status : null,
            };
        }
        return { sent: true };
    } catch (error) {
        console.warn(options.errorFailureMessage || '[ntfy] notification failed:', error?.message || error);
        return { sent: false, reason: 'ntfy-error' };
    }
}

module.exports = {
    postNtfyNotification,
};
