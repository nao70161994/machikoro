'use strict';

const TURN_ANNOUNCER_SHOW_DURATION_MS = 1300;
const TURN_ANNOUNCER_TRANSITION_DURATION_MS = 400;

function buildTurnAnnouncerView(name, isCPU) {
    return Object.freeze({
        text: `${isCPU ? '🤖' : '👤'} ${name} のターン`,
        display: 'flex',
        showDurationMs: TURN_ANNOUNCER_SHOW_DURATION_MS,
        transitionDurationMs: TURN_ANNOUNCER_TRANSITION_DURATION_MS,
    });
}

function createTimerController({
    schedule = (callback, delay) => setTimeout(callback, delay),
    cancel = timer => clearTimeout(timer),
} = {}) {
    let timer = null;

    function clear() {
        if (timer !== null) cancel(timer);
        timer = null;
    }

    function start(view, { beginHide, finishHide }) {
        clear();
        timer = schedule(() => {
            beginHide();
            timer = schedule(() => {
                finishHide();
                timer = null;
            }, view.transitionDurationMs);
        }, view.showDurationMs);
    }

    function snapshot() {
        return Object.freeze({ timerAttached: timer !== null });
    }

    return Object.freeze({ clear, start, snapshot });
}

const UiTurnAnnouncer = Object.freeze({
    buildView: buildTurnAnnouncerView,
    createTimerController,
    showDurationMs: TURN_ANNOUNCER_SHOW_DURATION_MS,
    transitionDurationMs: TURN_ANNOUNCER_TRANSITION_DURATION_MS,
});

if (typeof module !== 'undefined' && module.exports) module.exports = UiTurnAnnouncer;
if (typeof window !== 'undefined') window.UiTurnAnnouncer = UiTurnAnnouncer;
if (typeof globalThis !== 'undefined') globalThis.UiTurnAnnouncer = UiTurnAnnouncer;
