// ===== クラッシュ回復 =====
let _crashShown = false;

function showCrashScreen(err) {
    if (_crashShown) return;
    _crashShown = true;
    cpuScheduleToken++; // CPUループを停止
    const el = document.getElementById('crashScreen');
    if (!el) return;
    const msg = (err instanceof Error ? err.stack || err.message : String(err || '不明なエラー')).slice(0, 300);
    document.getElementById('crashMessage').textContent = msg;
    const resumeBtn = document.getElementById('crashResumeBtn');
    if (resumeBtn) resumeBtn.style.display = localStorage.getItem('savedGame') ? 'block' : 'none';
    el.style.display = 'flex';
}

function crashResume() {
    _crashShown = false;
    document.getElementById('crashScreen').style.display = 'none';
    resumeGame();
}

// ===== オフライン検知 =====
function updateOnlineTabState() {
    const offline = !navigator.onLine;
    const tabBtn = document.getElementById('tabOnline');
    const notice = document.getElementById('offlineNotice');
    const createBtn = document.getElementById('onlineCreateSubmitButton');
    const joinBtn = document.getElementById('onlineJoinSubmitButton');
    if (tabBtn) tabBtn.style.opacity = offline ? '0.4' : '';
    if (notice) notice.style.display = offline ? 'block' : 'none';
    if (createBtn) createBtn.disabled = offline;
    if (joinBtn) joinBtn.disabled = offline;
}

// ===== PWAインストールバナー =====
let _pwaInstallEvent = null;

function setPwaBannerVisible(id, visible) {
    const banner = document.getElementById(id);
    if (banner) banner.style.display = visible ? 'block' : 'none';
}

function pwaInstallPrompt() {
    if (!_pwaInstallEvent) return;
    _pwaInstallEvent.prompt();
    _pwaInstallEvent.userChoice.then(() => {
        setPwaBannerVisible('pwaInstallBanner', false);
        _pwaInstallEvent = null;
    });
}

function pwaInstallDismiss() {
    setPwaBannerVisible('pwaInstallBanner', false);
    localStorage.setItem('pwaInstallDismissed', '1');
    _pwaInstallEvent = null;
}

function bindCrashHandlers() {
    window.addEventListener('error', (e) => {
        showCrashScreen(e.error || e.message);
    });
    window.addEventListener('unhandledrejection', (e) => {
        showCrashScreen(e.reason);
    });
}

function bindOnlineStatusHandlers() {
    window.addEventListener('online', updateOnlineTabState);
    window.addEventListener('offline', updateOnlineTabState);
    updateOnlineTabState();
}

function bindPwaInstallHandlers() {
    if (window.matchMedia('(display-mode: standalone)').matches) {
        return;
    }
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        if (localStorage.getItem('pwaInstallDismissed')) {
            return;
        }
        _pwaInstallEvent = e;
        setPwaBannerVisible('pwaInstallBanner', true);
    });
}

function initMainView() {
    loadSettings();
    renderOnlinePlayerSettings();
    updateResumeButton();
    drawCitySkyline();
    window.addEventListener("resize", drawCitySkyline);
    bindCrashHandlers();
    bindOnlineStatusHandlers();
    bindPwaInstallHandlers();
}
