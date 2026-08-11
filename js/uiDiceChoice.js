'use strict';

const UiDiceChoice = (() => {
    function focusTransition(previousVisible, nextVisible, focusEligible) {
        const visible = nextVisible === true;
        return Object.freeze({
            focusInitial: focusEligible === true && previousVisible !== true && visible,
            visible,
        });
    }

    function createFocusController(initialVisible = false) {
        let visible = initialVisible === true;
        return Object.freeze({
            isVisible() { return visible; },
            reset(nextVisible = false) {
                visible = nextVisible === true;
                return visible;
            },
            transition(nextVisible, focusEligible) {
                const plan = focusTransition(visible, nextVisible, focusEligible);
                visible = plan.visible;
                return plan;
            },
        });
    }

    function applyFocusPlan(plan, content) {
        if (!plan || plan.focusInitial !== true || !content ||
                typeof content.querySelector !== 'function') return false;
        const target = content.querySelector('button:not([disabled]), select:not([disabled])');
        if (!target || typeof target.focus !== 'function') return false;
        try {
            target.focus();
            return true;
        } catch (_) {
            return false;
        }
    }

    function buildHtml(options) {
        const allowedActions = options.allowedActions;
        const disabledAttr = options.disabledAttr;
        const phases = options.phases;
        const result = options.lastDiceResult;
        if (options.phase === phases.SELECT_DICE && allowedActions.has('selectDice')) {
            const disabled = disabledAttr('selectDice');
            return `<div class="dice-choose"><p>🚉 駅：何個振りますか？</p><button data-action="selectDiceCount" data-use-two="false"${disabled}>🎲 1個</button><button data-action="selectDiceCount" data-use-two="true"${disabled}>🎲🎲 2個（合計を使う）</button></div>`;
        }
        if (options.phase === phases.REROLL_CONFIRM && (allowedActions.has('rerollDice') || allowedActions.has('skipReroll'))) {
            return `<div class="dice-choose"><p>📡 電波塔：🎲${result} を振り直しますか？</p><button data-action="rerollDice"${disabledAttr('rerollDice')}>振り直す</button><button data-action="skipReroll"${disabledAttr('skipReroll')}>このまま使う</button></div>`;
        }
        if (options.phase === phases.HARBOR_CHOICE && allowedActions.has('resolveHarbor')) {
            const disabled = disabledAttr('resolveHarbor');
            return `<div class="dice-choose"><p>⚓ 港効果：合計${result}に+2しますか？</p><button data-action="resolveHarbor" data-use-bonus="true"${disabled}>+2する（→${result + 2}）</button><button data-action="resolveHarbor" data-use-bonus="false"${disabled}>そのまま使う（${result}）</button></div>`;
        }
        return '';
    }

    return Object.freeze({ applyFocusPlan, buildHtml, createFocusController, focusTransition });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = UiDiceChoice;
if (typeof window !== 'undefined') window.UiDiceChoice = UiDiceChoice;
if (typeof globalThis !== 'undefined') globalThis.UiDiceChoice = UiDiceChoice;
