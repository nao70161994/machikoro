'use strict';

const OnlineDomEffects = (() => {
    const ids = Object.freeze({
        createButton: 'onlineCreateSubmitButton',
        cpuSpeed: 'onlineCpuSpeed',
        connectivityPanel: 'gameConnectivityPanel',
        gameStatus: 'onlineGameStatus',
        gameScreen: 'gameScreen',
        joinButton: 'onlineJoinSubmitButton',
        playerCount: 'onlinePlayerCount',
        playerName: 'playerNameInput',
        playerSettings: 'onlinePlayerSettings',
        readiness: 'onlineReadinessStatus',
        rlStatus: 'onlineRlModelStatus',
        roomId: 'roomIdInput',
        status: 'onlineStatus',
        titleScreen: 'titleScreen',
        waitingPanel: 'onlineWaitingPanel',
    });

    function createRuntime(options = {}) {
        const getDocument = typeof options.getDocument === 'function' ? options.getDocument : () => null;
        let waitingCountdownTimer = null;

        function element(id) {
            const documentRef = getDocument();
            return documentRef && typeof documentRef.getElementById === 'function'
                ? documentRef.getElementById(id) : null;
        }

        function text(id) {
            const target = element(id);
            return target && typeof target.textContent === 'string' ? target.textContent : '';
        }

        function setText(id, value) {
            const target = element(id);
            if (!target) return false;
            target.textContent = value;
            return true;
        }

        function setHtml(id, value) {
            const target = element(id);
            if (!target) return false;
            target.innerHTML = value;
            return true;
        }

        function setGameStatusText(value) {
            const target = element(ids.gameStatus);
            if (!target) return false;
            const message = String(value || '');
            target.textContent = message;
            if (target.style) target.style.display = message ? 'block' : 'none';
            const panel = element(ids.connectivityPanel);
            if (message && panel && panel.style) panel.style.display = 'grid';
            return true;
        }

        function setStatusText(value) {
            if (waitingCountdownTimer !== null && typeof clearTimeout === 'function') {
                clearTimeout(waitingCountdownTimer);
                waitingCountdownTimer = null;
            }
            setHtml(ids.waitingPanel, '');
            const lobbyChanged = setText(ids.status, value);
            const gameChanged = setGameStatusText(value);
            return lobbyChanged || gameChanged;
        }

        function refreshWaitingReservationCountdowns(now = Date.now()) {
            const panel = element(ids.waitingPanel);
            if (!panel || typeof panel.querySelectorAll !== 'function') return 0;
            const targets = Array.from(panel.querySelectorAll('[data-reserved-until]'));
            for (const target of targets) {
                const reservedUntil = Number(target.getAttribute('data-reserved-until'));
                const playerName = target.getAttribute('data-player-name') || '参加者';
                const seconds = Math.max(0, Math.ceil((reservedUntil - now) / 1000));
                target.textContent = `${playerName}（再接続待ち・残り${seconds}秒）`;
            }
            return targets.length;
        }

        function scheduleWaitingReservationCountdown() {
            if (waitingCountdownTimer !== null && typeof clearTimeout === 'function') {
                clearTimeout(waitingCountdownTimer);
                waitingCountdownTimer = null;
            }
            if (refreshWaitingReservationCountdowns() === 0 || typeof setTimeout !== 'function') return false;
            waitingCountdownTimer = setTimeout(() => {
                waitingCountdownTimer = null;
                scheduleWaitingReservationCountdown();
            }, 1000);
            if (waitingCountdownTimer && typeof waitingCountdownTimer.unref === 'function') {
                waitingCountdownTimer.unref();
            }
            return true;
        }

        function focusedControlIdentity(container, documentRef) {
            const active = documentRef && documentRef.activeElement;
            if (!active || !container || typeof container.contains !== 'function' || !container.contains(active)) {
                return null;
            }
            const attributeNames = [
                'data-ui-action', 'data-player-index', 'data-delta', 'data-room-id',
            ];
            const attributes = {};
            for (const name of attributeNames) {
                const value = typeof active.getAttribute === 'function' ? active.getAttribute(name) : null;
                if (value !== null) attributes[name] = value;
            }
            return attributes['data-ui-action'] ? attributes : null;
        }

        function focusWithoutScroll(target) {
            if (!target || typeof target.focus !== 'function') return false;
            try {
                target.focus({ preventScroll: true });
            } catch (_) {
                target.focus();
            }
            return true;
        }

        function restoreWaitingControlFocus(container, identity, status) {
            if (!identity || !container || typeof container.querySelectorAll !== 'function') return false;
            const controls = Array.from(container.querySelectorAll('[data-ui-action]'));
            const exact = controls.find(control => Object.entries(identity).every(([name, value]) =>
                typeof control.getAttribute === 'function' && control.getAttribute(name) === value));
            if (focusWithoutScroll(exact)) return true;
            const safeHostControl = controls.find(control => {
                const action = typeof control.getAttribute === 'function'
                    ? control.getAttribute('data-ui-action') : '';
                return action === 'changeOnlineLobbySlots' || action === 'startOnlineLobbyNow';
            });
            return focusWithoutScroll(safeHostControl) || focusWithoutScroll(status);
        }

        function renderWaitingLobby(statusText, html) {
            const documentRef = getDocument();
            const panel = element(ids.waitingPanel);
            const status = element(ids.status);
            if (!panel || !status) return false;
            const identity = focusedControlIdentity(panel, documentRef);
            status.textContent = String(statusText || '');
            setGameStatusText('');
            panel.innerHTML = String(html || '');
            scheduleWaitingReservationCountdown();
            restoreWaitingControlFocus(panel, identity, status);
            return true;
        }

        function setDisplay(id, value) {
            const target = element(id);
            if (!target || !target.style) return false;
            target.style.display = value;
            return true;
        }

        function inputValue(id) {
            const target = element(id);
            return target && target.value !== undefined ? String(target.value) : '';
        }

        function setInputValue(id, value) {
            const target = element(id);
            if (!target) return false;
            target.value = String(value || '');
            return true;
        }

        function applyButtonView(id, view = {}) {
            const target = element(id);
            if (!target) return false;
            if (view.disabled !== undefined) target.disabled = !!view.disabled;
            if (view.textContent !== undefined) target.textContent = view.textContent;
            return true;
        }

        function showGame() {
            setGameStatusText('');
            const titleChanged = setDisplay(ids.titleScreen, 'none');
            const gameChanged = setDisplay(ids.gameScreen, 'block');
            return titleChanged || gameChanged;
        }

        return Object.freeze({
            applyButtonView,
            element,
            inputValue,
            isStatusWaiting: () => text(ids.status).startsWith('⏳'),
            refreshWaitingReservationCountdowns,
            renderWaitingLobby,
            setHtml,
            setInputValue,
            setGameStatusText,
            setStatusHtml: value => setHtml(ids.status, value),
            setStatusText,
            setText,
            showGame,
            statusText: () => text(ids.status),
        });
    }

    return Object.freeze({ createRuntime, ids });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = OnlineDomEffects;
if (typeof window !== 'undefined') window.OnlineDomEffects = OnlineDomEffects;
if (typeof globalThis !== 'undefined') globalThis.OnlineDomEffects = OnlineDomEffects;
