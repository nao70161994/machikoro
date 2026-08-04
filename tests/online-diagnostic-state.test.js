const assert = require('assert');
const OnlineDiagnosticState = require('../js/onlineDiagnosticState');

function run() {
    const first = Object.freeze({ source: 'initial' });
    const controller = OnlineDiagnosticState.createController({ first, second: null });

    assert.deepStrictEqual(controller.keys, ['first', 'second']);
    assert.strictEqual(controller.read('first'), first);
    assert.strictEqual(controller.projection.first, first);

    const next = Object.freeze({ source: 'controller' });
    assert.strictEqual(controller.write('first', next), next);
    assert.strictEqual(controller.projection.first, next);

    const projected = Object.freeze({ source: 'projection' });
    controller.projection.second = projected;
    assert.strictEqual(controller.read('second'), projected);
    assert.deepStrictEqual(controller.snapshot(), { first: next, second: projected });

    assert.throws(() => controller.read('missing'), /Unknown online diagnostic key/);
    assert.throws(() => controller.write('missing', null), /Unknown online diagnostic key/);
    assert.ok(Object.isFrozen(controller));
    assert.ok(Object.isFrozen(controller.keys));
    assert.ok(Object.isFrozen(controller.projection));
    assert.ok(Object.isFrozen(controller.snapshot()));

    const isolated = OnlineDiagnosticState.createController({ first: null, second: null });
    assert.strictEqual(isolated.read('first'), null);
}

run();
console.log('online diagnostic state tests passed');
