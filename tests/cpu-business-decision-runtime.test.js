const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { CPUBusinessDecisionRuntime } = require('../js/cpuBusinessDecisionRuntime');
const { runTest } = require('./helpers/test-utils');

const DELEGATED_METHODS = Object.freeze([
    '_randomChoice',
    '_forEachBusinessMove',
    '_minorCardIndexes',
    '_chooseRandomBusinessMove',
    '_chooseSimpleBusinessMove',
    '_scoreBusinessExchangeDetails',
    '_scoreBusinessExchange',
    '_chooseHarmfulGiftBusinessMove',
    '_businessOwnCandidateIndexes',
    '_businessTargetCandidateIndexes',
    '_forEachBusinessMoveCandidate',
]);

runTest('CPU business decision runtime は交換判断adapterを一つの境界で所有する', () => {
    assert.deepStrictEqual(Object.keys(CPUBusinessDecisionRuntime), [...DELEGATED_METHODS]);
});

runTest('CPU business decision runtime はminor card indexをpure helperへ同値委譲する', () => {
    const player = { marker: true };
    global.CPUBusinessMoves = {
        minorCardIndexes(value) {
            assert.strictEqual(value, player);
            return [1, 3];
        },
    };
    assert.deepStrictEqual(CPUBusinessDecisionRuntime._minorCardIndexes({}, player), [1, 3]);
});

runTest('CPU.jsのbusiness判断APIはruntime境界への薄いdelegateになる', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'js/CPU.js'), 'utf8');
    for (const name of DELEGATED_METHODS) {
        const marker = `return CPUBusinessDecisionRuntime.${name}(this`;
        assert.strictEqual(source.split(marker).length - 1, 1, `${name} delegate`);
    }
});

runTest('CPU facadeの長いbodyは構成・cache・明示executorだけに限定される', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'js/CPU.js'), 'utf8');
    const starts = [...source.matchAll(/^    (?:static )?([A-Za-z_$][A-Za-z0-9_$]*)\([^\n]*\) \{/gm)];
    const allowed = new Set([
        'constructor',
        '_rollEvaluationCache',
        '_stateEvaluationCache',
        'resolveBusiness',
        'build',
        'executeBuildAction',
        '_buildExecutionContext',
        '_runSimulationStep',
    ]);
    const unexpected = [];
    for (let index = 0; index < starts.length; index++) {
        const start = starts[index].index;
        const next = index + 1 < starts.length ? starts[index + 1].index : source.length;
        const close = source.lastIndexOf('\n    }', next);
        const lineCount = source.slice(start, close + 6).split('\n').length;
        if (lineCount > 8 && !allowed.has(starts[index][1])) unexpected.push(starts[index][1]);
    }
    assert.deepStrictEqual(unexpected, []);
    for (const legacyField of ['_selectedBuildAction', '_collectingBuildAction', '_buildProposalCollector']) {
        assert.strictEqual(source.includes(legacyField), false);
    }
});
