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
    try {
        const response = await fetchImpl('https://ntfy.sh/' + encodeURIComponent(topic), {
            method: 'POST',
            headers: {
                Title: options.title || '[Machikoro]',
                Priority: String(options.priority || '3'),
                Tags: options.tags || 'video_game',
            },
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
