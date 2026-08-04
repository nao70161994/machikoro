'use strict';

const AppShellStartupRuntime = (() => {
    function createRuntime(dependencies = {}) {
        const { eventBindings, getOnlineElements, getOnlineState, pwaController, runtimeEffects, tabEffects, tabView } = dependencies;
        if (typeof getOnlineElements !== 'function' || typeof getOnlineState !== 'function') {
            throw new TypeError('startup observation dependencies are required');
        }
        if (!eventBindings || !pwaController || !runtimeEffects || !tabEffects || !tabView) {
            throw new TypeError('startup runtime dependencies are required');
        }

        function updateOnlineStatus() {
            const view = tabView.buildOnlineAvailabilityView(getOnlineState());
            tabEffects.applyOnlineAvailabilityView(getOnlineElements(), view);
        }

        function setPwaBannerVisible(id, visible) {
            return pwaController.setBannerVisible(id, visible);
        }

        function updatePwaBannerBodyState() {
            return pwaController.updateBannerBodyState();
        }

        function maybeShowPwaInstallBanner() {
            return pwaController.maybeShowInstallBanner();
        }

        function pwaInstallPrompt() {
            return pwaController.promptInstall();
        }

        function pwaInstallDismiss() {
            return pwaController.dismissInstall();
        }

        function initMainView() {
            runtimeEffects.loadSettings();
            runtimeEffects.preloadLocalRlModels('init-main-local-rl-preload');
            runtimeEffects.renderOnlinePlayerSettings();
            runtimeEffects.preloadOnlineRlModels('init-main-online-rl-preload');
            runtimeEffects.updateResumeButton();
            runtimeEffects.drawCitySkyline();
            eventBindings.bindMainViewResize();
            eventBindings.bindCrashReporting();
            eventBindings.bindOnlineStatus();
            eventBindings.bindPwaInstallHandlers();
            eventBindings.startFreezeWatchdog();
        }

        return Object.freeze({
            updateOnlineStatus,
            setPwaBannerVisible,
            updatePwaBannerBodyState,
            maybeShowPwaInstallBanner,
            pwaInstallPrompt,
            pwaInstallDismiss,
            initMainView,
        });
    }
    return Object.freeze({ createRuntime });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = AppShellStartupRuntime;
if (typeof window !== 'undefined') window.AppShellStartupRuntime = AppShellStartupRuntime;
if (typeof globalThis !== 'undefined') globalThis.AppShellStartupRuntime = AppShellStartupRuntime;
