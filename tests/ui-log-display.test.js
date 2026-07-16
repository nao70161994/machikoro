const assert = require('assert');
const UiLogDisplay = require('../js/uiLogDisplay');

const logTypes = {
    DICE: 'dice',
    GAIN: 'gain',
    LOSE: 'lose',
    BUILD: 'build',
    SPECIAL: 'special',
    SYSTEM: 'system',
    ERROR: 'error',
};
const display = UiLogDisplay.makeLogTypeDisplay(logTypes);

assert.deepStrictEqual(UiLogDisplay.classifyLogEntry({ type: 'gain' }, display), {
    cls: 'log-gain',
    label: '収入',
});
assert.deepStrictEqual(UiLogDisplay.classifyLogEntry({ type: 'unknown' }, display), {
    cls: 'log-system',
    label: '進行',
});
assert.ok(Object.isFrozen(display));
assert.ok(Object.isFrozen(display.gain));

assert.deepStrictEqual(UiLogDisplay.extractLogDetails({
    message: '🌾 Aliceの麦畑発動 +2コイン',
}), {
    actor: 'Alice',
    target: '',
    amount: '+2',
    subject: '麦畑',
});
assert.deepStrictEqual(UiLogDisplay.extractLogDetails({
    message: '📺 AliceからBobに5コイン',
}), {
    actor: 'Alice',
    target: 'Bob',
    amount: '5',
    subject: 'AliceからBobに5コイン',
});
assert.deepStrictEqual(UiLogDisplay.extractLogDetails(null), {
    actor: '',
    target: '',
    amount: '',
    subject: '',
});

console.log('ui log display tests passed');
