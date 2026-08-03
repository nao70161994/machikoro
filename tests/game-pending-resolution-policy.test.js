'use strict';

const assert = require('assert');
const GamePendingResolutionPolicy = require('../js/gamePendingResolutionPolicy');
const { runTest } = require('./helpers/test-utils');

runTest('pending resolution policyはphase、回数、queue先頭を順に判定する', () => {
    const trace = [];
    const wrongPhase = GamePendingResolutionPolicy.planPendingAction({
        phase: () => { trace.push('phase'); return 'build'; },
        pendingPhase: () => { trace.push('pending-phase'); return 'pending'; },
        pendingCount: () => { trace.push('count'); return 1; },
        canResolve: () => { trace.push('active'); return true; },
    });
    assert.deepStrictEqual(wrongPhase, {
        ok: false,
        reason: GamePendingResolutionPolicy.reasons.WRONG_PHASE,
    });
    assert.deepStrictEqual(trace, ['phase', 'pending-phase']);

    const inactive = GamePendingResolutionPolicy.planPendingAction({
        phase: 'pending',
        pendingPhase: 'pending',
        pendingCount: 1,
        canResolve: false,
    });
    assert.strictEqual(inactive.reason, GamePendingResolutionPolicy.reasons.NOT_ACTIVE_PENDING_ACTION);
    assert.strictEqual(Object.isFrozen(inactive), true);
});

runTest('pending resolution policyは相手playerを共通contractで検証する', () => {
    const missing = GamePendingResolutionPolicy.planOtherPlayerTarget({
        phase: 'pending', pendingPhase: 'pending', pendingCount: 1, canResolve: true,
        targetExists: false,
        targetIsCurrent: () => { throw new Error('must stay lazy'); },
    });
    assert.strictEqual(missing.reason, GamePendingResolutionPolicy.reasons.INVALID_PLAYER_TARGET);

    const self = GamePendingResolutionPolicy.planOtherPlayerTarget({
        phase: 'pending', pendingPhase: 'pending', pendingCount: 1, canResolve: true,
        targetExists: true, targetIsCurrent: true,
    });
    assert.strictEqual(self.reason, GamePendingResolutionPolicy.reasons.INVALID_PLAYER_TARGET);

    assert.deepStrictEqual(GamePendingResolutionPolicy.planOtherPlayerTarget({
        phase: 'pending', pendingPhase: 'pending', pendingCount: 1, canResolve: true,
        targetExists: true, targetIsCurrent: false,
    }), { ok: true, reason: '' });
});

runTest('pending resolution policyは清掃対象と改装対象を副作用前に検証する', () => {
    const major = GamePendingResolutionPolicy.planCleaningTarget({
        phase: 'pending', pendingPhase: 'pending', pendingCount: 1, canResolve: true,
        cardExists: true, cardIsMajor: true,
    });
    assert.strictEqual(major.reason, GamePendingResolutionPolicy.reasons.INVALID_CARD_TARGET);

    const unbuilt = GamePendingResolutionPolicy.planRenovationTarget({
        phase: 'pending', pendingPhase: 'pending', pendingCount: 1, canResolve: true,
        landmarkBuilt: false,
    });
    assert.strictEqual(unbuilt.reason, GamePendingResolutionPolicy.reasons.LANDMARK_NOT_BUILT);

    assert.strictEqual(GamePendingResolutionPolicy.planCleaningTarget({
        phase: 'pending', pendingPhase: 'pending', pendingCount: 1, canResolve: true,
        cardExists: true, cardIsMajor: false,
    }).ok, true);
    assert.strictEqual(GamePendingResolutionPolicy.planRenovationTarget({
        phase: 'pending', pendingPhase: 'pending', pendingCount: 1, canResolve: true,
        landmarkBuilt: true,
    }).ok, true);
});

runTest('pending resolution policyは全pending完了時だけbuild遷移を返す', () => {
    const clear = {
        pendingTV: 0,
        pendingBusiness: 0,
        pendingCleaning: 0,
        pendingMover: 0,
        pendingRenovation: 0,
    };
    assert.deepStrictEqual(
        GamePendingResolutionPolicy.completionTransition(clear, 'build'),
        { completed: true, nextPhase: 'build' }
    );
    for (const field of Object.keys(clear)) {
        const transition = GamePendingResolutionPolicy.completionTransition({ ...clear, [field]: 1 }, 'build');
        assert.deepStrictEqual(transition, { completed: false, nextPhase: null }, field);
        assert.strictEqual(Object.isFrozen(transition), true);
    }
});
