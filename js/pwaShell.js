'use strict';

const PwaShell = (() => {
    function createInstallController(dependencies) {
        const documentRef = dependencies.document;
        const windowRef = dependencies.window;
        const readStorage = dependencies.readStorage;
        const writeStorage = dependencies.writeStorage;
        const ensureCurrentScreenFocus = dependencies.ensureCurrentScreenFocus;
        let installEvent = null;
        let promptPending = false;
        let handlersBound = false;
        let noticeDock = null;
        let noticeSummary = null;
        let noticeObserver = null;
        const bannerOrigins = new Map();

        function setBodyClass(name, value) {
            const classes = documentRef.body.classList;
            if (typeof classes.contains !== 'function' || classes.contains(name) !== value) {
                classes.toggle(name, value);
            }
        }

        function syncResultNotices() {
            const body = documentRef?.body;
            const screen = documentRef?.getElementById('gameScreen');
            if (!body?.classList || !screen || typeof documentRef.createElement !== 'function') return false;
            const finished = body.classList.contains('game-finished') &&
                screen.style.display !== 'none' && screen.style.display !== '';
            const banners = ['pwaUpdateBanner', 'pwaInstallBanner'].map(id => documentRef.getElementById(id) ||
                [...bannerOrigins.keys()].find(banner => banner.id === id))
                .filter(Boolean);
            if (!finished) {
                if (noticeDock) {
                    for (const banner of banners.slice().reverse()) {
                        const origin = bannerOrigins.get(banner);
                        if (origin) origin.parent.insertBefore(banner, origin.next?.parentNode === origin.parent ? origin.next : null);
                    }
                    noticeDock.remove();
                    noticeDock = null;
                    noticeSummary = null;
                    bannerOrigins.clear();
                }
                setBodyClass('pwa-notices-docked', false);
                return false;
            }
            const pending = banners.filter(banner => banner.style.display === 'block');
            if (pending.length && !noticeDock) {
                noticeDock = documentRef.createElement('details');
                noticeDock.id = 'pwaResultNotices';
                noticeDock.className = 'pwa-result-notices';
                noticeSummary = documentRef.createElement('summary');
                noticeDock.appendChild(noticeSummary);
                screen.appendChild(noticeDock);
                for (const banner of banners) {
                    bannerOrigins.set(banner, { parent: banner.parentNode, next: banner.nextSibling });
                    noticeDock.appendChild(banner);
                }
            }
            if (noticeDock) {
                if (noticeDock.parentNode !== screen) screen.appendChild(noticeDock);
                noticeDock.hidden = pending.length === 0;
                const label = pending.some(banner => banner.id === 'pwaUpdateBanner')
                    ? 'アプリのお知らせ：更新があります' : 'アプリのお知らせ：ホーム画面への追加';
                if (noticeSummary.textContent !== label) noticeSummary.textContent = label;
                setBodyClass('pwa-notices-docked', true);
            }
            return !!noticeDock;
        }

        function bindResultNotices() {
            if (noticeObserver || !windowRef.MutationObserver || !documentRef.body) return;
            noticeObserver = new windowRef.MutationObserver(() => updateBannerBodyState());
            noticeObserver.observe(documentRef.body, { attributes: true, attributeFilter: ['class'] });
            const screen = documentRef.getElementById('gameScreen');
            if (screen) noticeObserver.observe(screen, { childList: true, attributes: true, attributeFilter: ['style'] });
            for (const id of ['pwaUpdateBanner', 'pwaInstallBanner']) {
                const banner = documentRef.getElementById(id);
                if (banner) noticeObserver.observe(banner, { attributes: true, attributeFilter: ['style'] });
            }
            updateBannerBodyState();
        }


        function updateBannerBodyState() {
            if (!documentRef || !documentRef.body || !documentRef.body.classList) return;
            const installBanner = documentRef.getElementById('pwaInstallBanner');
            const updateBanner = documentRef.getElementById('pwaUpdateBanner');
            const visible = (installBanner && installBanner.style.display === 'block') ||
                (updateBanner && updateBanner.style.display === 'block');
            const docked = syncResultNotices();
            setBodyClass('pwa-banner-open', !!visible && !docked);
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
            const activeElement = documentRef.activeElement;
            const restoreScreenFocus = !visible && !!(activeElement &&
                (activeElement === banner || (typeof banner.contains === 'function' &&
                    banner.contains(activeElement))));
            banner.style.display = visible ? 'block' : 'none';
            updateBannerBodyState();
            if (restoreScreenFocus && typeof ensureCurrentScreenFocus === 'function') {
                ensureCurrentScreenFocus();
            }
        }

        function maybeShowInstallBanner() {
            if (!installEvent || readStorage('pwaInstallDismissed')) {
                updateBannerBodyState();
                return;
            }
            setBannerVisible('pwaInstallBanner', true);
        }

        function promptInstall() {
            if (!installEvent || promptPending) return;
            const event = installEvent;
            installEvent = null;
            promptPending = true;
            let finished = false;
            const finish = () => {
                if (finished) return;
                finished = true;
                setBannerVisible('pwaInstallBanner', false);
                promptPending = false;
            };
            let userChoice;
            try {
                userChoice = event.userChoice;
            } catch (_) {
                userChoice = null;
            }
            function watchUserChoice() {
                try {
                    if (!userChoice || typeof userChoice.then !== 'function') return false;
                    userChoice.then(finish, finish);
                    return true;
                } catch (_) {
                    finish();
                    return true;
                }
            }
            let promptResult;
            try {
                promptResult = event.prompt();
            } catch (_) {
                watchUserChoice();
                finish();
                return;
            }
            const watchingUserChoice = watchUserChoice();
            if (promptResult && typeof promptResult.then === 'function') {
                Promise.resolve(promptResult).catch(finish);
            } else if (!watchingUserChoice) {
                finish();
            }
        }

        function dismissInstall() {
            setBannerVisible('pwaInstallBanner', false);
            writeStorage('pwaInstallDismissed', '1');
            installEvent = null;
        }

        function bindInstallHandlers() {
            if (handlersBound) return;
            bindResultNotices();
            if (windowRef.matchMedia && windowRef.matchMedia('(display-mode: standalone)').matches) {
                handlersBound = true;
                return;
            }
            windowRef.addEventListener('beforeinstallprompt', event => {
                event.preventDefault();
                if (promptPending || readStorage('pwaInstallDismissed')) return;
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
            syncResultNotices,
        });
    }

    return Object.freeze({ createInstallController });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = PwaShell;
if (typeof window !== 'undefined') window.PwaShell = PwaShell;
if (typeof globalThis !== 'undefined') globalThis.PwaShell = PwaShell;
