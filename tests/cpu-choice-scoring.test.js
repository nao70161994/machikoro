const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { CPUChoiceScoring } = require('../js/cpuChoiceScoring');
const { runTest } = require('./helpers/test-utils');

global.GAME_PHASES = Object.freeze({ BUILD: 'build' });

runTest('CPU choice scoring はexpert評価とlookaheadの呼出順を維持する', () => {
    const calls = [];
    const game = {
        players: [{ landmarks: {} }, { landmarks: {} }],
        enabledLandmarks: new Set(['a']),
        phase: 'pending',
        checkWinner: () => { calls.push('winner'); return null; },
    };
    global.CPUEvaluation = {
        expertChoiceScore(input) {
            calls.push(['weight', input.lookaheadWeight]);
            const position = input.positionScore();
            const winner = input.hasWinner();
            const admitted = input.shouldUseLookahead();
            const lookahead = input.lookaheadScore();
            return position + Number(winner) + Number(admitted) + lookahead;
        },
        shouldUseExpertChoiceLookahead(...args) {
            calls.push(['admit', ...args]);
            return true;
        },
    };
    const cpu = {
        expertTuning: { lookaheadWeight: 0.25 },
        simulationMode: 'realtime',
        _profileMeasure(label, callback) { calls.push(['profile', label]); return callback(); },
        _evaluatePosition(value, index) { calls.push(['position', value, index]); return 10; },
        _shouldUseExpertChoiceLookahead(value, index) {
            calls.push(['should', value, index]);
            return CPUChoiceScoring.shouldUseExpertChoiceLookahead(this, value, index);
        },
        _simulationShopStock(count) { calls.push(['stock', count]); return { stock: true }; },
        _expertLookaheadSteps(value, index, base) { calls.push(['steps', value, index, base]); return 7; },
        _simulateLookahead(value, stock, index, steps) {
            calls.push(['lookahead', value, stock, index, steps]);
            return 20;
        },
    };

    assert.strictEqual(CPUChoiceScoring.scoreExpertChoiceState(cpu, game, 0), 31);
    assert.deepStrictEqual(calls, [
        ['profile', 'expert.choiceState'],
        ['weight', 0.25],
        ['position', game, 0],
        'winner',
        ['should', game, 0],
        ['admit', 2, 1, 'pending', 'build', 'realtime'],
        ['profile', 'expert.choiceLookahead'],
        ['stock', 2],
        ['steps', game, 0, 4],
        ['lookahead', game, { stock: true }, 0, 7],
    ]);
});

runTest('CPU choice scoring はpurchase planをdifficultyとplayer単位でcacheする', () => {
    const player = {};
    const game = { players: [player] };
    const cache = { purchasePlanValues: Object.create(null) };
    let uncachedCalls = 0;
    const cpu = {
        difficulty: 'normal',
        _stateEvaluationCache: value => { assert.strictEqual(value, game); return cache; },
        _estimatePurchasePlanValueUncached(value, runtime, difficulty) {
            uncachedCalls += 1;
            assert.strictEqual(value, player);
            assert.strictEqual(runtime, game);
            assert.strictEqual(difficulty, 'strong');
            return 42;
        },
    };

    assert.strictEqual(CPUChoiceScoring.estimatePurchasePlanValue(cpu, player, game, 'strong'), 42);
    assert.strictEqual(CPUChoiceScoring.estimatePurchasePlanValue(cpu, player, game, 'strong'), 42);
    assert.strictEqual(uncachedCalls, 1);
    assert.strictEqual(cache.purchasePlanValues['strong:0'], 42);
});

runTest('CPU choice scoring はstrong状態評価のprofile順と入力を維持する', () => {
    const calls = [];
    const player = { coins: 12, builtLandmarkCount: () => 2 };
    const game = { players: [player] };
    global.CPUEvaluation = {
        strongChoiceScore(input) { calls.push(['score', input]); return 77; },
    };
    const cpu = {
        _profileMeasure(label, callback) { calls.push(['profile', label]); return callback(); },
        _isEndgameMode: () => { calls.push('endgame'); return true; },
        _estimatePurchasePlanValue: () => { calls.push('purchase'); return 3; },
        _estimatePlayerTurnValue: () => { calls.push('turn'); return 4; },
        _estimateWinDistance: () => { calls.push('distance'); return 5; },
        _estimateRedPressure: () => { calls.push('red'); return 6; },
        _duplicateRenovationPenalty: () => { calls.push('renovation'); return 7; },
    };

    assert.strictEqual(CPUChoiceScoring.scoreStrongChoiceState(cpu, game, 0), 77);
    assert.deepStrictEqual(calls.slice(0, 11), [
        ['profile', 'strong.choiceState'],
        'endgame',
        ['profile', 'strong.choiceState.purchasePlan'],
        'purchase',
        ['profile', 'strong.choiceState.turnValue'],
        'turn',
        ['profile', 'strong.choiceState.winDistance'],
        'distance',
        ['profile', 'strong.choiceState.redPressure'],
        'red',
        'renovation',
    ]);
    assert.deepStrictEqual(calls[11], ['score', {
        purchasePlanValue: 3,
        turnValue: 4,
        coins: 12,
        builtLandmarkCount: 2,
        landmarkPressure: 6,
        winDistance: 5,
        redPressure: 6,
        duplicateRenovationPenalty: 7,
    }]);
});

runTest('CPU choice scoring はpending適用後のcloneを同じfocus indexで評価する', () => {
    const calls = [];
    const game = { currentPlayerIndex: 2 };
    const expertClone = {};
    const strongClone = {};
    const clones = [expertClone, strongClone];
    const cpu = {
        _cloneGame: value => { calls.push(['clone', value]); return clones.shift(); },
        _scoreExpertChoiceState: (value, index) => { calls.push(['expert', value, index]); return 10; },
        _scoreStrongChoiceState: (value, index) => { calls.push(['strong', value, index]); return 20; },
    };

    assert.strictEqual(CPUChoiceScoring.scoreExpertPendingChoice(cpu, game, value => calls.push(['apply', value])), 10);
    assert.strictEqual(CPUChoiceScoring.scoreStrongPendingChoice(cpu, game, value => calls.push(['apply', value])), 20);
    assert.deepStrictEqual(calls, [
        ['clone', game], ['apply', expertClone], ['expert', expertClone, 2],
        ['clone', game], ['apply', strongClone], ['strong', strongClone, 2],
    ]);
});

runTest('CPU.jsのchoice scoring APIは専用境界へ委譲する', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'js/CPU.js'), 'utf8');
    const contracts = [
        ['_scoreExpertChoiceState', 'game, focusIndex', 'scoreExpertChoiceState', 'game, focusIndex'],
        ['_shouldUseExpertChoiceLookahead', 'game, focusIndex', 'shouldUseExpertChoiceLookahead', 'game, focusIndex'],
        ['_expectedExpertChoiceValue', 'game, focusIndex, outcomes, applyOutcome', 'expectedExpertChoiceValue', 'game, focusIndex, outcomes, applyOutcome'],
        ['_scoreExpertPendingChoice', 'game, applyChoice', 'scoreExpertPendingChoice', 'game, applyChoice'],
        ['_scoreStrongPendingChoice', 'game, applyChoice', 'scoreStrongPendingChoice', 'game, applyChoice'],
        ['_estimatePurchasePlanValue', 'player, game, difficulty = this.difficulty', 'estimatePurchasePlanValue', 'player, game, difficulty'],
        ['_estimatePurchasePlanValueUncached', 'player, game, difficulty = this.difficulty', 'estimatePurchasePlanValueUncached', 'player, game, difficulty'],
        ['_scoreStrongChoiceState', 'game, focusIndex', 'scoreStrongChoiceState', 'game, focusIndex'],
        ['_expectedStrongChoiceValue', 'game, focusIndex, outcomes, applyOutcome', 'expectedStrongChoiceValue', 'game, focusIndex, outcomes, applyOutcome'],
    ];
    for (const [name, signature, delegate, call] of contracts) {
        assert.ok(source.includes(`${name}(${signature}) {\n        return CPUChoiceScoring.${delegate}(this, ${call});\n    }`));
    }
});
