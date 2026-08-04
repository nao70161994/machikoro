'use strict';
const assert = require('assert');
const AppShellStartupRuntime = require('../js/appShellStartupRuntime');
const { runTest } = require('./helpers/test-utils');

function harness() {
    const calls = [];
    const named = names => Object.fromEntries(names.map(name => [name, (...args) => { calls.push([name, ...args]); return name; }]));
    const runtime = AppShellStartupRuntime.createRuntime({
        eventBindings: named(['bindMainViewResize', 'bindCrashReporting', 'bindOnlineStatus', 'bindPwaInstallHandlers', 'startFreezeWatchdog']),
        getOnlineElements: () => ({ tabButton: {} }),
        getOnlineState: () => false,
        pwaController: named(['setBannerVisible', 'updateBannerBodyState', 'maybeShowInstallBanner', 'promptInstall', 'dismissInstall']),
        runtimeEffects: named(['loadSettings', 'preloadLocalRlModels', 'renderOnlinePlayerSettings', 'preloadOnlineRlModels', 'updateResumeButton', 'drawCitySkyline']),
        tabEffects: { applyOnlineAvailabilityView: (elements, view) => calls.push(['online-view', elements, view]) },
        tabView: { buildOnlineAvailabilityView: online => ({ online }) },
    });
    return { calls, runtime };
}

runTest('app shell startup runtimeはmain view初期化順を維持する', () => {
    const { calls, runtime } = harness();
    runtime.initMainView();
    assert.deepStrictEqual(calls.map(call => call[0]), ['loadSettings', 'preloadLocalRlModels', 'renderOnlinePlayerSettings', 'preloadOnlineRlModels', 'updateResumeButton', 'drawCitySkyline', 'bindMainViewResize', 'bindCrashReporting', 'bindOnlineStatus', 'bindPwaInstallHandlers', 'startFreezeWatchdog']);
    assert.strictEqual(calls[1][1], 'init-main-local-rl-preload');
    assert.strictEqual(calls[3][1], 'init-main-online-rl-preload');
});

runTest('app shell startup runtimeはonline viewとPWA controllerを委譲する', () => {
    const { calls, runtime } = harness();
    runtime.updateOnlineStatus();
    assert.strictEqual(runtime.setPwaBannerVisible('banner', true), 'setBannerVisible');
    runtime.updatePwaBannerBodyState(); runtime.maybeShowPwaInstallBanner(); runtime.pwaInstallPrompt(); runtime.pwaInstallDismiss();
    assert.deepStrictEqual(calls.map(call => call[0]), ['online-view', 'setBannerVisible', 'updateBannerBodyState', 'maybeShowInstallBanner', 'promptInstall', 'dismissInstall']);
});

runTest('app shell startup runtimeは必須依存欠落を拒否する', () => {
    assert.throws(() => AppShellStartupRuntime.createRuntime(), /startup observation dependencies/);
});
