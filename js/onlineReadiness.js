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

const OnlineReadiness = Object.freeze({ buildView: buildOnlineReadinessView });

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { OnlineReadiness };
}
if (typeof globalThis !== 'undefined') globalThis.OnlineReadiness = OnlineReadiness;
