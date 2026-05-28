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
    try {
        const response = await fetchImpl('https://ntfy.sh/' + encodeURIComponent(topic) + (query ? '?' + query : ''), {
            method: 'POST',
            body: options.body || '',
        });
        if (response && response.ok === false) {
            console.warn(options.statusFailureMessage || '[ntfy] notification failed:', response.status || 'unknown');
            return { sent: false, reason: 'ntfy-status' };
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
