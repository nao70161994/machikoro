'use strict';

const assert = require('assert');
const AppDiagnostics = require('../js/appDiagnostics');
const { runTest } = require('./helpers/test-utils');

runTest('動作診断は版・通信・保存状態を秘密値なしで投影する', () => {
    const snapshot = AppDiagnostics.buildSnapshot({
        appVersion: 'client-123',
        serverVersion: 'server-456',
        serviceWorkerSupported: true,
        serviceWorkerControlled: true,
        serviceWorkerWaiting: true,
        networkOnline: true,
        socketConnected: false,
        context: 'reconnecting',
        standalone: true,
        localSaveExists: true,
        localHistoryCount: 2,
        onlineResumeExists: true,
        generatedAt: '2026-08-14T00:00:00.000Z',
        roomId: 'SECRET',
        reconnectToken: 'TOKEN',
    });
    assert.deepStrictEqual(snapshot, {
        appVersion: 'client-123',
        serverVersion: 'server-456',
        serviceWorker: '更新待機中',
        network: 'オンライン',
        socket: '未接続',
        context: 'オンライン再接続中',
        displayMode: 'インストール版',
        localSave: 'あり（過去2件）',
        onlineResume: 'あり',
        gameState: 'ゲームなし',
        pendingActions: 'なし',
        recentEvents: 'なし',
        actionDelivery: '再接続中',
        gameGeneration: '0',
        generatedAt: '2026-08-14T00:00:00.000Z',
    });
    const text = AppDiagnostics.formatText(snapshot);
    assert.ok(text.includes('クライアント版: client-123'));
    assert.ok(!text.includes('SECRET'));
    assert.ok(!text.includes('TOKEN'));
});

runTest('動作診断は匿名化したゲーム進行・pending・直近操作を上限付きで表示する', () => {
    const snapshot = AppDiagnostics.buildSnapshot({
        context: 'online',
        gameActive: true,
        playerCount: 4,
        turnCount: 12,
        phase: 'pending',
        pendingActions: ['resolveTV', '<secret>', 'resolveBusiness'],
        recentEvents: ['rollDice', 'buildCard', 'invalid action', 'nextTurn', 'resolveIT', 'buildLandmark'],
        actionInFlight: true,
        gameGeneration: 3,
    });
    assert.strictEqual(snapshot.gameState, '効果解決中・12ターン経過・4人');
    assert.strictEqual(snapshot.pendingActions, 'resolveTV → resolveBusiness');
    assert.strictEqual(snapshot.recentEvents, 'rollDice → buildCard → nextTurn → resolveIT → buildLandmark');
    assert.strictEqual(snapshot.actionDelivery, '応答待ち');
    assert.strictEqual(snapshot.gameGeneration, '3');
    assert.ok(!AppDiagnostics.formatText(snapshot).includes('secret'));
});

runTest('動作診断HTMLは外部文字列をescapeし非対応状態を明示する', () => {
    const snapshot = AppDiagnostics.buildSnapshot({
        appVersion: '<client>',
        serverVersion: 'server & test',
        serviceWorkerSupported: false,
        networkOnline: false,
        context: 'title',
        generatedAt: '',
    });
    const html = AppDiagnostics.buildHtml(snapshot);
    assert.ok(html.includes('&lt;client&gt;'));
    assert.ok(html.includes('server &amp; test'));
    assert.ok(html.includes('<dd>非対応</dd>'));
    assert.ok(html.includes('<dd>オフライン</dd>'));
    assert.ok(html.includes('<dd>未使用</dd>'));
    assert.ok(!html.includes('<client>'));
});
