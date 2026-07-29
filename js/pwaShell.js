'use strict';

const PwaShell = (() => {
    function createInstallController(dependencies) {
        const documentRef = dependencies.document;
        const windowRef = dependencies.window;
        const readStorage = dependencies.readStorage;
        const writeStorage = dependencies.writeStorage;
        let installEvent = null;
        let handlersBound = false;

        function updateBannerBodyState() {
            if (!documentRef || !documentRef.body || !documentRef.body.classList) return;
            const installBanner = documentRef.getElementById('pwaInstallBanner');
            const updateBanner = documentRef.getElementById('pwaUpdateBanner');
            const visible = (installBanner && installBanner.style.display === 'block') ||
                (updateBanner && updateBanner.style.display === 'block');
            documentRef.body.classList.toggle('pwa-banner-open', !!visible);
        }

        function setBannerVisible(id, visible) {
            const banner = documentRef.getElementById(id);
            if (!banner) return;
            if (id === 'pwaInstallBanner' && visible) {
                const updateBanner = documentRef.getElementById('pwaUpdateBanner');
                if (updateBanner && updateBanner.style.display === 'block') {
                    updateBannerBodyState();
                    return;
                }
            }
            banner.style.display = visible ? 'block' : 'none';
            updateBannerBodyState();
        }

        function maybeShowInstallBanner() {
            if (!installEvent || readStorage('pwaInstallDismissed')) {
                updateBannerBodyState();
                return;
            }
            setBannerVisible('pwaInstallBanner', true);
        }

        function promptInstall() {
            if (!installEvent) return;
            installEvent.prompt();
            installEvent.userChoice.then(() => {
                setBannerVisible('pwaInstallBanner', false);
                installEvent = null;
            });
        }

        function dismissInstall() {
            setBannerVisible('pwaInstallBanner', false);
            writeStorage('pwaInstallDismissed', '1');
            installEvent = null;
        }

        function bindInstallHandlers() {
            if (handlersBound) return;
            if (windowRef.matchMedia && windowRef.matchMedia('(display-mode: standalone)').matches) {
                handlersBound = true;
                return;
            }
            windowRef.addEventListener('beforeinstallprompt', event => {
                event.preventDefault();
                if (readStorage('pwaInstallDismissed')) return;
                installEvent = event;
                maybeShowInstallBanner();
            });
            handlersBound = true;
        }

        return Object.freeze({
            setBannerVisible,
            updateBannerBodyState,
            maybeShowInstallBanner,
            promptInstall,
            dismissInstall,
            bindInstallHandlers,
        });
    }

    return Object.freeze({ createInstallController });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = PwaShell;
if (typeof window !== 'undefined') window.PwaShell = PwaShell;
if (typeof globalThis !== 'undefined') globalThis.PwaShell = PwaShell;
