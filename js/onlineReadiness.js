'use strict';

/**
 * Builds the user-facing readiness summary without reading browser state.
 * @param {{online?: boolean, serverReachable?: boolean, updateWaiting?: boolean,
 *     versionMatches?: boolean}} input
 * @returns {{ready: boolean, text: string, html: string}}
 */
function buildOnlineReadinessView(input = {}) {
    const online = input.online !== false;
    const serverReachable = input.serverReachable === true;
    const updateWaiting = input.updateWaiting === true;
    const versionMatches = input.versionMatches !== false;
    const items = [
        `${online ? '✅' : '❌'} 端末のネット接続: ${online ? 'オンライン' : 'オフライン'}`,
        `${serverReachable ? '✅' : '❌'} ゲームサーバー: ${serverReachable ? '応答あり' : '応答なし'}`,
        `${versionMatches ? '✅' : '⚠️'} アプリ版: ${versionMatches ? '最新サーバーと一致' : '更新が必要'}`,
        `${updateWaiting ? '⚠️' : '✅'} アプリ更新: ${updateWaiting ? '適用待ち' : '待機なし'}`,
    ];
    const ready = online && serverReachable && versionMatches && !updateWaiting;
    return Object.freeze({
        ready,
        text: `${ready ? 'オンライン対戦を開始できます。' : '確認が必要な項目があります。'}\n${items.join('\n')}`,
        html: `<strong>${ready ? 'オンライン対戦を開始できます。' : '確認が必要な項目があります。'}</strong><ul class="online-readiness-list">${items.map(item => `<li>${item}</li>`).join('')}</ul>`,
    });
}

/**
 * Creates the browser probe and presentation boundary for the readiness view.
 * @param {Object} dependencies
 * @returns {{check: function(): Promise<Object>}}
 */
function createOnlineReadinessController(dependencies = {}) {
    const getNavigator = typeof dependencies.getNavigator === 'function'
        ? dependencies.getNavigator
        : () => typeof navigator === 'undefined' ? null : navigator;
    const getWindow = typeof dependencies.getWindow === 'function'
        ? dependencies.getWindow
        : () => typeof window === 'undefined' ? null : window;
    const fetchRequest = typeof dependencies.fetch === 'function'
        ? dependencies.fetch
        : (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
    const AbortControllerConstructor = dependencies.AbortController ||
        (typeof AbortController === 'function' ? AbortController : null);
    const setTimer = typeof dependencies.setTimeout === 'function'
        ? dependencies.setTimeout : setTimeout;
    const clearTimer = typeof dependencies.clearTimeout === 'function'
        ? dependencies.clearTimeout : clearTimeout;
    const setText = typeof dependencies.setText === 'function' ? dependencies.setText : () => {};
    const setHtml = typeof dependencies.setHtml === 'function' ? dependencies.setHtml : () => {};
    const ids = dependencies.ids || { readiness: 'onlineReadiness', readinessSummary: 'onlineReadinessSummary' };

    async function check() {
        setText(ids.readiness, '確認中…');
        setText(ids.readinessSummary, '確認中…');
        const browserNavigator = getNavigator();
        const online = !browserNavigator || browserNavigator.onLine !== false;
        let serverReachable = false;
        let serverVersion = '';
        let controller = null;
        let timer = null;
        try {
            if (fetchRequest) {
                if (typeof AbortControllerConstructor === 'function') {
                    controller = new AbortControllerConstructor();
                    timer = setTimer(() => controller.abort(), 3000);
                }
                const response = await fetchRequest('/api/version', Object.assign({ cache: 'no-store' },
                    controller ? { signal: controller.signal } : {}));
                if (response && response.ok) {
                    const body = await response.json();
                    serverReachable = true;
                    serverVersion = typeof body.hash === 'string' ? body.hash : '';
                }
            }
        } catch (_) {
        } finally {
            if (timer !== null) clearTimer(timer);
        }
        let updateWaiting = false;
        try {
            const serviceWorker = browserNavigator && browserNavigator.serviceWorker;
            const registration = serviceWorker && typeof serviceWorker.getRegistration === 'function'
                ? await serviceWorker.getRegistration() : null;
            updateWaiting = !!(registration && registration.waiting);
        } catch (_) {}
        const browserWindow = getWindow();
        const clientVersion = browserWindow && typeof browserWindow.MACHIKORO_CLIENT_VERSION === 'string'
            ? browserWindow.MACHIKORO_CLIENT_VERSION : '';
        const view = buildOnlineReadinessView({
            online,
            serverReachable,
            updateWaiting,
            versionMatches: !clientVersion || !serverVersion || clientVersion === serverVersion,
        });
        setHtml(ids.readiness, view.html);
        setText(ids.readinessSummary, view.ready ? 'OK' : '要確認');
        return view;
    }

    return Object.freeze({ check });
}

const OnlineReadiness = Object.freeze({
    buildView: buildOnlineReadinessView,
    createController: createOnlineReadinessController,
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { OnlineReadiness };
}
if (typeof globalThis !== 'undefined') globalThis.OnlineReadiness = OnlineReadiness;
