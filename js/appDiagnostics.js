'use strict';

const AppDiagnostics = (() => {
    const CONTEXT_LABELS = Object.freeze({
        title: 'タイトル画面',
        local: 'ローカル対戦中',
        lobby: 'オンライン待機室',
        online: 'オンライン対戦中',
        reconnecting: 'オンライン再接続中',
    });
    const PHASE_LABELS = Object.freeze({
        roll: 'ダイス待ち',
        selectDice: 'ダイス数選択中',
        rerollConfirm: '振り直し確認中',
        harborChoice: '港の追加ダイス確認中',
        pending: '効果解決中',
        build: '建設中',
    });

    function safeText(value, fallback = '不明', maxLength = 80) {
        const text = typeof value === 'string' ? value.trim() : '';
        return text ? text.slice(0, maxLength) : fallback;
    }

    function boundedCount(value) {
        return Number.isSafeInteger(value) ? Math.max(0, Math.min(99, value)) : 0;
    }

    function safeEventNames(values) {
        if (!Array.isArray(values)) return [];
        return values.filter(value => typeof value === 'string' &&
            /^[A-Za-z][A-Za-z0-9:_-]{0,39}$/.test(value)).slice(-5);
    }

    function safeOperationName(value) {
        return typeof value === 'string' && /^[A-Za-z][A-Za-z0-9:_-]{0,39}$/.test(value)
            ? value : '';
    }

    function successfulOperationLabel(input = {}) {
        const onlineActions = safeEventNames(input.onlineActions);
        if (onlineActions.length > 0) return `オンライン操作: ${onlineActions.at(-1)}`;
        const checkpoints = Array.isArray(input.checkpoints) ? input.checkpoints.slice(-80) : [];
        for (let index = checkpoints.length - 1; index >= 0; index--) {
            const checkpoint = checkpoints[index];
            const details = checkpoint && checkpoint.details && typeof checkpoint.details === 'object'
                ? checkpoint.details : {};
            if (checkpoint && checkpoint.event === 'action-local-applied' && details.result !== false) {
                const action = safeOperationName(details.action);
                if (action) return `ローカル操作: ${action}`;
            }
            if (checkpoint && checkpoint.event === 'scheduleCPU-step-result' &&
                    details.stepResult !== false) {
                const step = safeOperationName(details.step);
                if (step) return `CPU処理: ${step}`;
            }
            if (checkpoint && checkpoint.event === 'skip-nextTurn-returned' &&
                    details.result === true) return 'ローカル操作: nextTurn';
        }
        return '記録なし';
    }

    function safeOperationLabel(value) {
        return typeof value === 'string' &&
            /^(オンライン操作|ローカル操作|CPU処理): [A-Za-z][A-Za-z0-9:_-]{0,39}$/.test(value)
            ? value : '記録なし';
    }

    function gameStateLabel(input) {
        if (input.gameActive !== true) return 'ゲームなし';
        const playerCount = Number.isSafeInteger(input.playerCount) && input.playerCount >= 2
            ? Math.min(10, input.playerCount) : 0;
        const turnCount = Number.isSafeInteger(input.turnCount) && input.turnCount >= 0
            ? input.turnCount : 0;
        const phase = Object.prototype.hasOwnProperty.call(PHASE_LABELS, input.phase)
            ? PHASE_LABELS[input.phase] : '状態不明';
        return `${phase}・${turnCount}ターン経過${playerCount ? `・${playerCount}人` : ''}`;
    }

    function buildSnapshot(input = {}) {
        const context = Object.prototype.hasOwnProperty.call(CONTEXT_LABELS, input.context)
            ? input.context : 'title';
        const serviceWorker = input.serviceWorkerSupported !== true
            ? '非対応'
            : input.serviceWorkerWaiting === true
                ? '更新待機中'
                : input.serviceWorkerControlled === true ? '稼働中' : '未制御';
        const onlineContext = context === 'lobby' || context === 'online' || context === 'reconnecting';
        const pendingActions = safeEventNames(input.pendingActions);
        const recentEvents = safeEventNames(input.recentEvents);
        const delivery = !onlineContext
            ? '未使用'
            : context === 'reconnecting' || input.reconnecting === true ? '再接続中'
                : input.actionInFlight === true ? '応答待ち'
                    : input.pendingOutbound === true ? '再送待ち' : '待機なし';
        return Object.freeze({
            appVersion: safeText(input.appVersion, '開発版'),
            serverVersion: safeText(input.serverVersion, '取得不可'),
            serviceWorker,
            network: input.networkOnline === false ? 'オフライン' : 'オンライン',
            socket: onlineContext
                ? (input.socketConnected === true ? '接続中' : '未接続')
                : '未使用',
            context: CONTEXT_LABELS[context],
            displayMode: input.standalone === true ? 'インストール版' : 'ブラウザ版',
            localSave: input.localSaveExists === true
                ? `あり（過去${boundedCount(input.localHistoryCount)}件）`
                : 'なし',
            onlineResume: input.onlineResumeExists === true ? 'あり' : 'なし',
            gameState: gameStateLabel(input),
            lastSuccessfulOperation: safeOperationLabel(input.lastSuccessfulOperation),
            pendingActions: pendingActions.length > 0 ? pendingActions.join(' → ') : 'なし',
            recentEvents: recentEvents.length > 0 ? recentEvents.join(' → ') : 'なし',
            actionDelivery: delivery,
            gameGeneration: onlineContext
                ? String(Number.isSafeInteger(input.gameGeneration) && input.gameGeneration >= 0
                    ? input.gameGeneration : 0)
                : '未使用',
            generatedAt: safeText(input.generatedAt, '不明', 40),
        });
    }

    function rows(snapshot) {
        return Object.freeze([
            ['クライアント版', snapshot.appVersion],
            ['サーバー版', snapshot.serverVersion],
            ['Service Worker', snapshot.serviceWorker],
            ['ブラウザ回線', snapshot.network],
            ['Socket接続', snapshot.socket],
            ['現在の状態', snapshot.context],
            ['表示方式', snapshot.displayMode],
            ['ローカル保存', snapshot.localSave],
            ['オンライン再開データ', snapshot.onlineResume],
            ['ゲーム状態', snapshot.gameState],
            ['最後に成功した操作', snapshot.lastSuccessfulOperation],
            ['保留中の処理', snapshot.pendingActions],
            ['直近イベント', snapshot.recentEvents],
            ['オンライン操作送信', snapshot.actionDelivery],
            ['ゲーム世代', snapshot.gameGeneration],
            ['診断生成時刻', snapshot.generatedAt],
        ]);
    }

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function buildHtml(snapshot) {
        return `<dl class="app-diagnostics-list">${rows(snapshot).map(([label, value]) =>
            `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`
        ).join('')}</dl>`;
    }

    function formatText(snapshot) {
        return ['ダイスシティ 動作診断', ...rows(snapshot).map(([label, value]) =>
            `${label}: ${value}`)].join('\n');
    }

    return Object.freeze({
        buildHtml,
        buildSnapshot,
        escapeHtml,
        formatText,
        gameStateLabel,
        rows,
        safeEventNames,
        successfulOperationLabel,
    });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = AppDiagnostics;
if (typeof window !== 'undefined') window.AppDiagnostics = AppDiagnostics;
if (typeof globalThis !== 'undefined') globalThis.AppDiagnostics = AppDiagnostics;
