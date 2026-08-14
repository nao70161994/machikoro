'use strict';

const AppDiagnostics = (() => {
    const CONTEXT_LABELS = Object.freeze({
        title: 'タイトル画面',
        local: 'ローカル対戦中',
        lobby: 'オンライン待機室',
        online: 'オンライン対戦中',
        reconnecting: 'オンライン再接続中',
    });

    function safeText(value, fallback = '不明', maxLength = 80) {
        const text = typeof value === 'string' ? value.trim() : '';
        return text ? text.slice(0, maxLength) : fallback;
    }

    function boundedCount(value) {
        return Number.isSafeInteger(value) ? Math.max(0, Math.min(99, value)) : 0;
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

    return Object.freeze({ buildHtml, buildSnapshot, escapeHtml, formatText, rows });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = AppDiagnostics;
if (typeof window !== 'undefined') window.AppDiagnostics = AppDiagnostics;
if (typeof globalThis !== 'undefined') globalThis.AppDiagnostics = AppDiagnostics;
