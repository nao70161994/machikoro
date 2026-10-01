'use strict';

const UiTurnPrivacy = (() => {
    const HAPTIC_PATTERNS = Object.freeze({
        turn: Object.freeze([35]),
        dice: Object.freeze([22]),
        build: Object.freeze([32, 24, 42]),
        win: Object.freeze([70, 50, 120]),
    });
    const HAPTIC_TOGGLE_IDS = Object.freeze({
        turn: 'hapticTurnEnabled',
        dice: 'hapticDiceEnabled',
        build: 'hapticBuildEnabled',
        win: 'hapticWinEnabled',
    });

    function createHandoffController() {
        let visible = false;
        let playerIndex = -1;
        let playerName = '';

        function observe(input = {}) {
            const shouldShow = input.turnChanged === true && input.isOnlineGame !== true &&
                input.isCpuTurn !== true && Number.isInteger(input.humanPlayerCount) &&
                input.humanPlayerCount > 1 && Number.isInteger(input.playerIndex) &&
                input.playerIndex >= 0 && typeof input.playerName === 'string' &&
                input.playerName.trim() !== '';
            if (shouldShow) {
                visible = true;
                playerIndex = input.playerIndex;
                playerName = input.playerName.trim().slice(0, 40);
            }
            return snapshot();
        }

        function dismiss() {
            visible = false;
            return snapshot();
        }

        function reset() {
            visible = false;
            playerIndex = -1;
            playerName = '';
            return snapshot();
        }

        function snapshot() {
            return Object.freeze({ visible, playerIndex, playerName });
        }

        return Object.freeze({ dismiss, observe, reset, snapshot });
    }

    function applyHandoffView(view = {}, elements = {}) {
        const overlay = elements.overlay;
        const name = elements.name;
        if (!overlay || !overlay.style) return false;
        overlay.style.display = view.visible === true ? 'flex' : 'none';
        overlay.setAttribute('aria-hidden', view.visible === true ? 'false' : 'true');
        if (name) name.textContent = view.playerName || '';
        if (view.visible === true && elements.button && typeof elements.button.focus === 'function') {
            elements.button.focus({ preventScroll: true });
        }
        return true;
    }

    function vibrate(kind, options = {}) {
        if (options.enabled !== true || options.reducedMotion === true) return false;
        const pattern = HAPTIC_PATTERNS[kind];
        if (!pattern || typeof options.vibrate !== 'function') return false;
        try {
            return options.vibrate(pattern.slice()) !== false;
        } catch (_) {
            return false;
        }
    }

    function vibrateFromEnvironment(kind, environment = {}) {
        const toggleId = HAPTIC_TOGGLE_IDS[kind];
        if (!toggleId) return false;
        const documentRef = environment.document ||
            (typeof document !== 'undefined' ? document : null);
        const navigatorRef = environment.navigator ||
            (typeof navigator !== 'undefined' ? navigator : null);
        const hapticsEnabled = !!documentRef &&
            documentRef.getElementById('accessibilityHaptics')?.checked === true &&
            documentRef.getElementById(toggleId)?.checked !== false;
        const reducedMotion = !!documentRef?.body?.classList?.contains('accessibility-reduced-motion');
        return vibrate(kind, {
            enabled: !!toggleId && hapticsEnabled,
            reducedMotion,
            vibrate: navigatorRef && typeof navigatorRef.vibrate === 'function'
                ? pattern => navigatorRef.vibrate(pattern) : null,
        });
    }

    return Object.freeze({ HAPTIC_PATTERNS, applyHandoffView, createHandoffController, vibrate, vibrateFromEnvironment });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = UiTurnPrivacy;
if (typeof window !== 'undefined') window.UiTurnPrivacy = UiTurnPrivacy;
if (typeof globalThis !== 'undefined') globalThis.UiTurnPrivacy = UiTurnPrivacy;
