'use strict';

const assert = require('assert');
const makeReportDelivery = require('../server/reportDelivery');
const { runTest } = require('./helpers/test-utils');

function makeDelivery(overrides = {}) {
    const calls = [];
    const dependencies = {
        defaultEnv: { NODE_ENV: 'test' },
        getDefaultFetch() {
            calls.push(['default-fetch']);
            return 'default-fetch';
        },
        warn(...args) {
            calls.push(['warn', ...args]);
        },
        postNotification(options) {
            calls.push(['post', options]);
            return Promise.resolve({ sent: true });
        },
        resolveTopic(options, env) {
            calls.push(['topic', options, env]);
            return options.topic || '';
        },
        classifyClientError(report) {
            calls.push(['classify', report]);
            return {
                classification: 'unknown',
                priority: 'urgent',
                tags: 'warning',
            };
        },
        formatClientError(report) {
            calls.push(['format-client', report]);
            return 'client-body';
        },
        redactClientRoomId(roomId) {
            calls.push(['redact-room', roomId]);
            return 'room-hash';
        },
        lifecycleTitle(event) {
            calls.push(['lifecycle-title', event]);
            return 'Lifecycle';
        },
        formatLifecycle(report) {
            calls.push(['format-lifecycle', report]);
            return 'lifecycle-body';
        },
    };
    Object.assign(dependencies, overrides);
    return {
        calls,
        delivery: makeReportDelivery(dependencies),
        dependencies,
    };
}

runTest('report delivery builds unknown client error notification exactly', async () => {
    const { delivery, calls, dependencies } = makeDelivery();
    const report = {
        message: 'boom',
        phase: 'build',
        roomId: 'ROOM',
    };

    const result = await delivery.notifyClientError(report, {
        topic: 'topic',
        fetchImpl: 'explicit-fetch',
    });

    assert.deepStrictEqual(result, { sent: true });
    const post = calls.find(call => call[0] === 'post')[1];
    assert.strictEqual(post.topic, 'topic');
    assert.strictEqual(post.fetchImpl, 'explicit-fetch');
    assert.strictEqual(post.title, '[ダイスシティ] Unknown Client Error');
    assert.strictEqual(post.priority, 'urgent');
    assert.strictEqual(post.tags, 'warning');
    assert.strictEqual(post.body, 'client-body');
    assert.strictEqual(
        post.fetchUnavailableMessage,
        '[client-error] fetch unavailable; ntfy notification skipped'
    );
    assert.strictEqual(
        post.statusFailureMessage,
        '[client-error] ntfy notification failed:'
    );
    assert.strictEqual(post.errorFailureMessage, post.statusFailureMessage);
    assert.deepStrictEqual(
        calls.find(call => call[0] === 'topic').slice(1),
        [{ topic: 'topic', fetchImpl: 'explicit-fetch' }, dependencies.defaultEnv]
    );

    post.onMissingTopic();
    assert.deepStrictEqual(calls.find(call => call[0] === 'warn'), [
        'warn',
        '[client-error]',
        'boom',
        'phase=build',
        'room=room-hash',
    ]);
});

runTest('report delivery keeps known client title and default fetch fallback', async () => {
    const { delivery, calls } = makeDelivery({
        classifyClientError() {
            return {
                classification: 'known-pattern',
                priority: 'default',
                tags: 'bug',
            };
        },
    });

    await delivery.notifyClientError({
        message: 'known',
        phase: '',
        roomId: '',
    });

    const post = calls.find(call => call[0] === 'post')[1];
    assert.strictEqual(post.title, '[ダイスシティ] Client Error');
    assert.strictEqual(post.fetchImpl, 'default-fetch');
    post.onMissingTopic();
    assert.deepStrictEqual(calls.find(call => call[0] === 'warn').slice(-2), [
        'phase=unknown',
        'room=room-hash',
    ]);
});

runTest('report delivery builds lifecycle notification and fallback log exactly', async () => {
    const { delivery, calls } = makeDelivery();
    const report = {
        event: 'play-start',
        mode: 'online',
        playerCount: 4,
        cpuCount: 1,
    };

    await delivery.notifyGameLifecycle(report, {
        env: { NODE_ENV: 'production' },
        topic: 'lifecycle-topic',
    });

    const post = calls.find(call => call[0] === 'post')[1];
    assert.strictEqual(post.topic, 'lifecycle-topic');
    assert.strictEqual(post.fetchImpl, 'default-fetch');
    assert.strictEqual(post.title, 'Lifecycle');
    assert.strictEqual(post.priority, '2');
    assert.strictEqual(post.tags, 'video_game,white_check_mark');
    assert.strictEqual(post.body, 'lifecycle-body');
    assert.strictEqual(
        post.fetchUnavailableMessage,
        '[game-lifecycle] fetch unavailable; ntfy notification skipped'
    );
    assert.strictEqual(
        post.statusFailureMessage,
        '[game-lifecycle] ntfy notification failed:'
    );
    assert.strictEqual(post.errorFailureMessage, post.statusFailureMessage);

    post.onMissingTopic();
    assert.deepStrictEqual(calls.find(call => call[0] === 'warn'), [
        'warn',
        '[game-lifecycle]',
        'play-start',
        'mode=online',
        'players=4',
        'cpu=1',
    ]);
});

runTest('report delivery keeps ntfy credentials server-side and allows explicit override', async () => {
    const { delivery, calls } = makeDelivery({
        defaultEnv: {
            NODE_ENV: 'production',
            NTFY_BASE_URL: 'https://notify.example.test',
            NTFY_ACCESS_TOKEN: 'env-token',
        },
    });

    await delivery.notifyGameLifecycle({ event: 'play-start' });
    let post = calls.filter(call => call[0] === 'post').at(-1)[1];
    assert.strictEqual(post.baseUrl, 'https://notify.example.test');
    assert.strictEqual(post.accessToken, 'env-token');

    await delivery.notifyClientError({}, {
        baseUrl: 'https://override.example.test',
        accessToken: 'override-token',
    });
    post = calls.filter(call => call[0] === 'post').at(-1)[1];
    assert.strictEqual(post.baseUrl, 'https://override.example.test');
    assert.strictEqual(post.accessToken, 'override-token');
});
