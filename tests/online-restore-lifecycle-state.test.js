const assert = require('assert');
const { OnlineRestoreLifecycleState } = require('../js/onlineRestoreLifecycleState');

function testInitialStateIsNormalizedAndFrozen() {
    const state = OnlineRestoreLifecycleState.createController({
        generation: -1,
        inProgress: 1,
        quarantined: true,
    }).snapshot();

    assert.deepStrictEqual(state, {
        generation: 0,
        inProgress: false,
        quarantined: true,
        flushing: false,
    });
    assert.ok(Object.isFrozen(state));
}

function testTransitionsPreserveIndependentDimensions() {
    const controller = OnlineRestoreLifecycleState.createController();

    assert.deepStrictEqual(controller.incrementGeneration(), {
        generation: 1,
        inProgress: false,
        quarantined: false,
        flushing: false,
    });
    assert.deepStrictEqual(controller.startRestore(), {
        generation: 1,
        inProgress: true,
        quarantined: false,
        flushing: false,
    });
    assert.deepStrictEqual(controller.quarantine(), {
        generation: 1,
        inProgress: true,
        quarantined: true,
        flushing: false,
    });
    assert.deepStrictEqual(controller.finishRestore(), {
        generation: 1,
        inProgress: false,
        quarantined: true,
        flushing: false,
    });
    assert.deepStrictEqual(controller.clearQuarantine(), {
        generation: 1,
        inProgress: false,
        quarantined: false,
        flushing: false,
    });
}

function testControllersDoNotShareState() {
    const left = OnlineRestoreLifecycleState.createController({ generation: 4 });
    const right = OnlineRestoreLifecycleState.createController({ generation: 9 });

    left.incrementGeneration();
    left.startRestore();

    assert.deepStrictEqual(left.snapshot(), {
        generation: 5,
        inProgress: true,
        quarantined: false,
        flushing: false,
    });
    assert.deepStrictEqual(right.snapshot(), {
        generation: 9,
        inProgress: false,
        quarantined: false,
        flushing: false,
    });
}

function testFlushTransitionsStayInsideLifecycleState() {
    const controller = OnlineRestoreLifecycleState.createController({
        generation: 3,
        inProgress: true,
    });

    assert.deepStrictEqual(controller.startFlush(), {
        generation: 3,
        inProgress: true,
        quarantined: false,
        flushing: true,
    });
    assert.deepStrictEqual(controller.finishFlush(), {
        generation: 3,
        inProgress: true,
        quarantined: false,
        flushing: false,
    });
}

testInitialStateIsNormalizedAndFrozen();
testTransitionsPreserveIndependentDimensions();
testControllersDoNotShareState();
testFlushTransitionsStayInsideLifecycleState();

console.log('online restore lifecycle state tests passed');
