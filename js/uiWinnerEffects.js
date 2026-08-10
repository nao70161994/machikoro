'use strict';

const UiWinnerEffects = (() => {
    const REQUIRED_EFFECTS = Object.freeze([
        'setStatusHtml',
        'announceWinner',
        'markPresented',
        'playWinSound',
        'recordStats',
        'notifyFinish',
        'clearSavedGame',
        'clearOnlineSession',
        'markOnlineFinished',
        'refreshPwaUpdateState',
        'updateResumeButton',
        'startConfetti',
        'applyTerminalControls',
        'renderTutorial',
        'renderLog',
        'renderPlayers',
    ]);

    const TERMINAL_CONTROLS = Object.freeze({
        rollDisabled: true,
        skipDisabled: true,
        skipText: '建設しないでターン終了',
        rerollDisplay: 'none',
        diceChooseHtml: '',
        buildMenuHtml: '',
    });

    function execute(plan = {}, effects = {}) {
        for (const name of REQUIRED_EFFECTS) {
            if (typeof effects[name] !== 'function') {
                throw new TypeError(`${name} effect is required`);
            }
        }
        effects.setStatusHtml(typeof plan.statusHtml === 'string' ? plan.statusHtml : '');
        if (plan.firstPresentation === true) {
            effects.markPresented();
            effects.announceWinner(
                typeof plan.winnerStatusText === 'string' ? plan.winnerStatusText : ''
            );
            effects.playWinSound();
            effects.recordStats();
            effects.notifyFinish();
        }
        effects.clearSavedGame();
        effects.clearOnlineSession();
        effects.markOnlineFinished();
        effects.refreshPwaUpdateState();
        effects.updateResumeButton();
        effects.startConfetti();
        effects.applyTerminalControls(TERMINAL_CONTROLS);
        effects.renderTutorial();
        effects.renderLog();
        effects.renderPlayers();
    }

    return Object.freeze({ REQUIRED_EFFECTS, TERMINAL_CONTROLS, execute });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = UiWinnerEffects;
if (typeof window !== 'undefined') window.UiWinnerEffects = UiWinnerEffects;
if (typeof globalThis !== 'undefined') globalThis.UiWinnerEffects = UiWinnerEffects;
