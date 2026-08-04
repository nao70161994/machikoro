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

runTest('pending resolution policyは交換可能なminor cardを現在手番から順に走査する', () => {
    const players = [{ id: 'current' }, { id: 'empty' }, { id: 'target' }, { id: 'unread' }];
    const trace = [];
    const result = GamePendingResolutionPolicy.hasBusinessExchange({
        players,
        currentPlayerIndex: 0,
        minorCardsFor(player) {
            trace.push(player.id);
            if (player.id === 'current' || player.id === 'target') return [{}];
            if (player.id === 'unread') throw new Error('must stay short-circuited');
            return [];
        },
    });
    assert.strictEqual(result, true);
    assert.deepStrictEqual(trace, ['current', 'empty', 'target']);

    const noCurrentCards = GamePendingResolutionPolicy.hasBusinessExchange({
        players,
        currentPlayerIndex: 0,
        minorCardsFor(player) {
            if (player.id !== 'current') throw new Error('opponents must stay lazy');
            return [];
        },
    });
    assert.strictEqual(noCurrentCards, false);
});

runTest('pending resolution policyは最初の休業可能なminor cardで走査を止める', () => {
    const players = [
        { cards: [{ major: true, dormant: false }, { major: false, dormant: true }] },
        { cards: [{ major: false, dormant: false }, { unread: true }] },
        { unread: true },
    ];
    const trace = [];
    const result = GamePendingResolutionPolicy.hasCleaningTarget({
        players,
        cardsFor(player) {
            if (player.unread) throw new Error('players must stay short-circuited');
            return player.cards;
        },
        isMajor(card) {
            trace.push(['major', card]);
            return !!card.major;
        },
        isDormant(_player, card) {
            if (card.unread) throw new Error('cards must stay short-circuited');
            trace.push(['dormant', card]);
            return !!card.dormant;
        },
    });
    assert.strictEqual(result, true);
    assert.deepStrictEqual(trace.map(entry => entry[0]), ['major', 'major', 'dormant', 'major', 'dormant']);
});

runTest('pending resolution policyはindexまたは名前からminor card参照を解決する', () => {
    const cards = [
        { name: '麦畑', major: false },
        { name: 'テレビ局', major: true },
        { name: '麦畑', major: false },
    ];
    const isMajor = card => card.major;
    assert.strictEqual(GamePendingResolutionPolicy.resolveMinorCardRef({ cards, ref: 0, isMajor }), cards[0]);
    assert.strictEqual(GamePendingResolutionPolicy.resolveMinorCardRef({ cards, ref: '麦畑', isMajor }), cards[0]);
    assert.strictEqual(GamePendingResolutionPolicy.resolveMinorCardRef({ cards, ref: 1, isMajor }), null);
    assert.strictEqual(GamePendingResolutionPolicy.resolveMinorCardRef({ cards, ref: 'テレビ局', isMajor }), null);
    assert.strictEqual(GamePendingResolutionPolicy.resolveMinorCardRef({ cards, ref: 9, isMajor }), null);
    assert.strictEqual(GamePendingResolutionPolicy.resolveMinorCardRef({ cards: null, ref: 0, isMajor }), null);
});

runTest('pending card参照解決は欠落playerでrefやcard分類を読まない', () => {
    const trace = [];
    const result = GamePendingResolutionPolicy.resolveMinorCardRef({
        cards() { trace.push('cards'); return null; },
        ref() { throw new Error('ref must stay lazy'); },
        isMajor() { throw new Error('classification must stay lazy'); },
    });
    assert.strictEqual(result, null);
    assert.deepStrictEqual(trace, ['cards']);
});

runTest('pending resolution policyは除外対象以外の建設済みlandmarkを改装対象にする', () => {
    const landmarks = Object.freeze({ 役所: true, 駅: false, 港: true });
    assert.strictEqual(GamePendingResolutionPolicy.hasRenovationTarget({
        landmarks,
        excludedLandmark: '役所',
    }), true);
    assert.strictEqual(GamePendingResolutionPolicy.hasRenovationTarget({
        landmarks: { 役所: true, 駅: false },
        excludedLandmark: '役所',
    }), false);
    assert.strictEqual(GamePendingResolutionPolicy.hasRenovationTarget({
        landmarks: null,
        excludedLandmark: '役所',
    }), false);
    assert.deepStrictEqual(landmarks, { 役所: true, 駅: false, 港: true });
});
