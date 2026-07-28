const assert = require('assert');
const UiDiceChoice = require('../js/uiDiceChoice');
const { runTest } = require('./helpers/test-utils');

const phases = Object.freeze({ SELECT_DICE: 'selectDice', REROLL_CONFIRM: 'rerollConfirm', HARBOR_CHOICE: 'harborChoice' });
const enabled = action => action === 'skipReroll' ? ' disabled' : '';

function build(phase, actions, lastDiceResult = 8) {
    return UiDiceChoice.buildHtml({ phase, allowedActions: new Set(actions), lastDiceResult, disabledAttr: enabled, phases });
}

runTest('dice choice HTMLは駅の2択とdisabled契約を維持する', () => {
    assert.strictEqual(build(phases.SELECT_DICE, ['selectDice']), '<div class="dice-choose"><p>🚉 駅：何個振りますか？</p><button data-action="selectDiceCount" data-use-two="false">🎲 1個</button><button data-action="selectDiceCount" data-use-two="true">🎲🎲 2個（合計を使う）</button></div>');
});

runTest('dice choice HTMLは電波塔と港の出目・action属性を維持する', () => {
    assert.strictEqual(build(phases.REROLL_CONFIRM, ['rerollDice', 'skipReroll']), '<div class="dice-choose"><p>📡 電波塔：🎲8 を振り直しますか？</p><button data-action="rerollDice">振り直す</button><button data-action="skipReroll" disabled>このまま使う</button></div>');
    assert.strictEqual(build(phases.HARBOR_CHOICE, ['resolveHarbor'], 10), '<div class="dice-choose"><p>⚓ 港効果：合計10に+2しますか？</p><button data-action="resolveHarbor" data-use-bonus="true">+2する（→12）</button><button data-action="resolveHarbor" data-use-bonus="false">そのまま使う（10）</button></div>');
});

runTest('dice choice HTMLはphaseまたはaction不一致なら空にする', () => {
    assert.strictEqual(build(phases.SELECT_DICE, []), '');
    assert.strictEqual(build('build', ['selectDice']), '');
});
