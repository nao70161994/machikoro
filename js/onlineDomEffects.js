'use strict';

const OnlineDomEffects = (() => {
    const ids = Object.freeze({
        createButton: 'onlineCreateSubmitButton',
        cpuSpeed: 'onlineCpuSpeed',
        gameScreen: 'gameScreen',
        joinButton: 'onlineJoinSubmitButton',
        playerCount: 'onlinePlayerCount',
        playerName: 'playerNameInput',
        playerSettings: 'onlinePlayerSettings',
        rlStatus: 'onlineRlModelStatus',
        roomId: 'roomIdInput',
        status: 'onlineStatus',
        titleScreen: 'titleScreen',
    });

    function createRuntime(options = {}) {
        const getDocument = typeof options.getDocument === 'function' ? options.getDocument : () => null;

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

        function applyButtonView(id, view = {}) {
            const target = element(id);
            if (!target) return false;
            if (view.disabled !== undefined) target.disabled = !!view.disabled;
            if (view.textContent !== undefined) target.textContent = view.textContent;
            return true;
        }

        function showGame() {
            const titleChanged = setDisplay(ids.titleScreen, 'none');
            const gameChanged = setDisplay(ids.gameScreen, 'block');
            return titleChanged || gameChanged;
        }

        return Object.freeze({
            applyButtonView,
            element,
            inputValue,
            isStatusWaiting: () => text(ids.status).startsWith('⏳'),
            setHtml,
            setStatusHtml: value => setHtml(ids.status, value),
            setStatusText: value => setText(ids.status, value),
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
