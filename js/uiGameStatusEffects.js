'use strict';

const UiGameStatusEffects = (() => {
    function createTurnStateController(initialPreviousPlayerIndex = -1,
            initialPreviousTurnCount = -1, initialPreviousPhase = '') {
        let previousPlayerIndex = initialPreviousPlayerIndex;
        let previousTurnCount = initialPreviousTurnCount;
        let previousPhase = initialPreviousPhase;

        function snapshot() {
            return Object.freeze({ previousPlayerIndex, previousTurnCount, previousPhase });
        }

        function set(nextPreviousPlayerIndex, nextPreviousTurnCount = previousTurnCount,
                nextPreviousPhase = previousPhase) {
            previousPlayerIndex = nextPreviousPlayerIndex;
            previousTurnCount = nextPreviousTurnCount;
            previousPhase = nextPreviousPhase;
            return snapshot();
        }

        function reset() {
            previousPlayerIndex = -1;
            previousTurnCount = -1;
            previousPhase = '';
            return snapshot();
        }

        return Object.freeze({ snapshot, set, reset });
    }

    const REQUIRED_EFFECTS = Object.freeze([
        'setStatusText',
        'renderTurnTimeline',
        'announceTurn',
        'setPreviousPlayerIndex',
        'setRollDisabled',
        'setSkipButton',
        'hideReroll',
        'updateDiceDisplay',
        'runRenderStep',
        'renderDiceChoose',
        'renderPending',
        'renderTutorial',
        'renderLog',
        'renderPlayers',
        'showCoinAnimation',
        'announceCoinChanges',
        'setPreviousCoins',
        'renderBuildMenu',
        'syncUiInteractabilityAfterRender',
        'schedulePostBuildUiStabilizer',
        'checkAutoSkip',
    ]);

    function execute(view = {}, effects = {}) {
        for (const name of REQUIRED_EFFECTS) {
            if (typeof effects[name] !== 'function') {
                throw new TypeError(`${name} effect is required`);
            }
        }

        effects.setStatusText(view.statusText);
        effects.renderTurnTimeline(view.turnTimeline);
        if (view.turnTransition.announce) {
            effects.announceTurn(
                view.turnTransition.name,
                view.turnTransition.isCpuTurn,
                view.turnTransition.playerIndex
            );
        }
        effects.setPreviousPlayerIndex(
            view.turnTransition.nextPreviousPlayerIndex,
            view.turnTransition.nextPreviousTurnCount,
            view.turnTransition.nextPreviousPhase
        );
        effects.setRollDisabled(view.rollButton.disabled);
        effects.setSkipButton(view.skipButton);
        effects.hideReroll();
        effects.updateDiceDisplay(view.diceValues);

        effects.runRenderStep('renderDiceChoose', effects.renderDiceChoose);
        effects.runRenderStep('renderPending', effects.renderPending);
        effects.runRenderStep('renderTutorial', effects.renderTutorial);
        effects.runRenderStep('renderLog', effects.renderLog);
        effects.runRenderStep('renderPlayers', effects.renderPlayers);
        effects.runRenderStep('coinAnimation', () => {
            view.coinChanges.forEach(change => {
                effects.showCoinAnimation(change.playerIndex, change.diff);
            });
            if (view.coinChangeAnnouncement) {
                effects.announceCoinChanges(view.coinChangeAnnouncement);
            }
            effects.setPreviousCoins(view.nextCoins.slice());
        });
        effects.runRenderStep('renderBuildMenu', effects.renderBuildMenu);
        effects.runRenderStep('syncUiInteractabilityAfterRender', () => {
            effects.syncUiInteractabilityAfterRender();
            effects.schedulePostBuildUiStabilizer();
        });
        effects.runRenderStep('checkAutoSkip', effects.checkAutoSkip);
    }

    function applyActivityStatus(activity = {}, elements = {}) {
        const { container, label, elapsed, detail } = elements;
        if (!container || !container.style || !container.classList) return false;
        container.style.display = activity.visible ? 'flex' : 'none';
        for (const kind of ['ready', 'waiting', 'checking', 'recovered', 'failed', 'offline']) {
            container.classList.toggle(`is-${kind}`, activity.kind === kind);
        }
        if (label && activity.announceLabel) label.textContent = activity.announceLabel;
        if (elapsed) elapsed.textContent = activity.elapsedText || '';
        if (detail) detail.textContent = activity.detail || '';
        return true;
    }

    function applyConnectionQuality(view = {}, element) {
        if (!element || !element.style || !element.classList) return false;
        element.style.display = view.visible ? 'inline-flex' : 'none';
        for (const kind of ['good', 'waiting', 'delayed', 'reconnecting', 'offline']) {
            element.classList.toggle(`is-${kind}`, view.kind === kind);
        }
        if (view.label && element.textContent !== view.label) element.textContent = view.label;
        return true;
    }

    function buildTurnTimelineHtml(view = {}) {
        const stateLabels = Object.freeze({ complete: '完了', current: '現在', upcoming: '未完了' });
        const stateMarks = Object.freeze({ complete: '✓', current: '●', upcoming: '○' });
        const escapeMarkup = value => String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
        return (Array.isArray(view.stages) ? view.stages : []).map(stage => {
            const state = Object.prototype.hasOwnProperty.call(stateLabels, stage.state)
                ? stage.state
                : 'upcoming';
            const detail = stage.detail
                ? `<span class="turn-timeline-detail">${escapeMarkup(stage.detail)}</span>`
                : '';
            const current = state === 'current' ? ' aria-current="step"' : '';
            const label = `${stage.label}、${stateLabels[state]}${stage.detail ? `、${stage.detail}` : ''}`;
            return `<li class="turn-timeline-step is-${state}" data-turn-stage="${escapeMarkup(stage.key)}" aria-label="${escapeMarkup(label)}"${current}><span class="turn-timeline-marker" aria-hidden="true">${stateMarks[state]}</span><span class="turn-timeline-label">${escapeMarkup(stage.label)}</span>${detail}</li>`;
        }).join('');
    }

    function applyTurnTimeline(view = {}, element) {
        if (!element) return false;
        const html = buildTurnTimelineHtml(view);
        if (element.innerHTML !== html) element.innerHTML = html;
        return true;
    }

    return Object.freeze({
        createTurnStateController,
        REQUIRED_EFFECTS,
        execute,
        applyActivityStatus,
        applyConnectionQuality,
        buildTurnTimelineHtml,
        applyTurnTimeline,
    });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = UiGameStatusEffects;
if (typeof window !== 'undefined') window.UiGameStatusEffects = UiGameStatusEffects;
if (typeof globalThis !== 'undefined') globalThis.UiGameStatusEffects = UiGameStatusEffects;
