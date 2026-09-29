'use strict';

const UiDiceChoice = (() => {
    function focusTransition(previousVisible, nextVisible, focusEligible,
            previousIdentity = '', nextIdentity = '', activeWithin = false) {
        const visible = nextVisible === true;
        const identity = visible ? String(nextIdentity || '') : '';
        const identityChanged = previousVisible === true && visible &&
            String(previousIdentity || '') !== identity;
        return Object.freeze({
            focusInitial: focusEligible === true && visible &&
                (previousVisible !== true || identityChanged),
            restorePrimary: focusEligible === true && previousVisible === true &&
                !visible && activeWithin === true,
            identity,
            visible,
        });
    }

    function createFocusController(initialVisible = false, initialIdentity = '') {
        let visible = initialVisible === true;
        let identity = visible ? String(initialIdentity || '') : '';
        return Object.freeze({
            identity() { return identity; },
            isVisible() { return visible; },
            reset(nextVisible = false, nextIdentity = '') {
                visible = nextVisible === true;
                identity = visible ? String(nextIdentity || '') : '';
                return visible;
            },
            transition(nextVisible, focusEligible, nextIdentity = '', activeWithin = false) {
                const plan = focusTransition(
                    visible,
                    nextVisible,
                    focusEligible,
                    identity,
                    nextIdentity,
                    activeWithin
                );
                visible = plan.visible;
                identity = plan.identity;
                return plan;
            },
        });
    }

    function choiceIdentity(options = {}) {
        const phases = options.phases || {};
        if (options.phase === phases.SELECT_DICE) return 'selectDice';
        if (options.phase === phases.REROLL_CONFIRM) return 'rerollConfirm';
        if (options.phase === phases.HARBOR_CHOICE) return 'harborChoice';
        return '';
    }

    function facilityMark(name) {
        return `<svg class="dice-choice-facility-mark" viewBox="0 0 160 80" aria-hidden="true" focusable="false"><use href="icons/facility-art.svg#${name}"></use></svg>`;
    }

    function diceMark() {
        return '<svg class="dice-choice-die-mark" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><rect x="1.5" y="1.5" width="17" height="17" rx="4"/><circle cx="6" cy="6" r="1.2"/><circle cx="14" cy="6" r="1.2"/><circle cx="10" cy="10" r="1.2"/><circle cx="6" cy="14" r="1.2"/><circle cx="14" cy="14" r="1.2"/></svg>';
    }

    function applyFocusPlan(plan, content, options = {}) {
        if (!plan) return false;
        if (plan.focusInitial === true && content &&
                typeof content.querySelector === 'function') {
            const target = content.querySelector('button:not([disabled]), select:not([disabled])');
            if (!target || typeof target.focus !== 'function') return false;
            try {
                target.focus();
                return true;
            } catch (_) {
                return false;
            }
        }
        if (plan.restorePrimary === true &&
                typeof options.restorePrimaryFocus === 'function') {
            return options.restorePrimaryFocus() === true;
        }
        return false;
    }

    function buildHtml(options) {
        const allowedActions = options.allowedActions;
        const disabledAttr = options.disabledAttr;
        const phases = options.phases;
        const result = options.lastDiceResult;
        const sunset = options.useSunsetIcons === true;
        const stationMark = sunset ? facilityMark('station') : '🚉';
        const radioMark = sunset ? facilityMark('radio') : '📡';
        const harborMark = sunset ? facilityMark('harbor') : '⚓';
        const dieMark = sunset ? diceMark() : '🎲';
        if (options.phase === phases.SELECT_DICE && allowedActions.has('selectDice')) {
            const disabled = disabledAttr('selectDice');
            return `<div class="dice-choose"><p>${stationMark} 駅：何個振りますか？</p><button data-action="selectDiceCount" data-use-two="false"${disabled}>${dieMark} 1個</button><button data-action="selectDiceCount" data-use-two="true"${disabled}>${sunset ? dieMark + dieMark : '🎲🎲'} 2個（合計を使う）</button></div>`;
        }
        if (options.phase === phases.REROLL_CONFIRM && (allowedActions.has('rerollDice') || allowedActions.has('skipReroll'))) {
            return `<div class="dice-choose"><p>${radioMark} 電波塔：${dieMark}${result} を振り直しますか？</p><button data-action="rerollDice"${disabledAttr('rerollDice')}>振り直す</button><button data-action="skipReroll"${disabledAttr('skipReroll')}>このまま使う</button></div>`;
        }
        if (options.phase === phases.HARBOR_CHOICE && allowedActions.has('resolveHarbor')) {
            const disabled = disabledAttr('resolveHarbor');
            return `<div class="dice-choose"><p>${harborMark} 港効果：合計${result}に+2しますか？</p><button data-action="resolveHarbor" data-use-bonus="true"${disabled}>+2する（→${result + 2}）</button><button data-action="resolveHarbor" data-use-bonus="false"${disabled}>そのまま使う（${result}）</button></div>`;
        }
        return '';
    }

    return Object.freeze({
        applyFocusPlan,
        buildHtml,
        choiceIdentity,
        createFocusController,
        focusTransition,
    });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = UiDiceChoice;
if (typeof window !== 'undefined') window.UiDiceChoice = UiDiceChoice;
if (typeof globalThis !== 'undefined') globalThis.UiDiceChoice = UiDiceChoice;
