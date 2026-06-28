const crypto = require('crypto');

// Keep these names aligned with docs/online-restore-schema.md.
const ONLINE_RESTORE_FIXTURE_NAMES = Object.freeze({
    SEQ_RANK_USES_MAX_FIELDS: 'onlineRestore.seqRankUsesMaxFields',
    PENDING_ACK_REQUIRES_LOG_OR_SNAPSHOT: 'onlineRestore.pendingAckRequiresLogOrSnapshot',
});

const RESTORE_PLAYER_NAMES = Object.freeze(['Alice', 'Bob']);
const RESTORE_TOKENS = Object.freeze(['token-alice', 'token-bob']);

function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

function makeRestoreGameStartPayload(overrides = {}) {
    return Object.assign({
        schemaVersion: 2,
        playerNames: [...RESTORE_PLAYER_NAMES],
        playerSettings: [{ type: 'human' }, { type: 'human' }],
        reconnectTokenHashes: RESTORE_TOKENS.map(hashToken),
        enabledCards: ['麦畑', 'パン屋', 'カフェ', 'ビジネスセンター', '引越し屋'],
        enabledLandmarks: ['駅', 'ショッピングモール'],
        cpuSpeed: 1500,
        playerOrder: [0, 1],
        hostPlayerIndex: 0,
        hostEpoch: 3,
        actionSeq: 2,
    }, overrides);
}

function makeSeqRankUsesMaxFieldsFixture() {
    return {
        name: ONLINE_RESTORE_FIXTURE_NAMES.SEQ_RANK_USES_MAX_FIELDS,
        doc: 'docs/online-restore-schema.md#onlineActionLog--Server-actionLog',
        playerIndex: 0,
        playerName: RESTORE_PLAYER_NAMES[0],
        reconnectToken: RESTORE_TOKENS[0],
        gameStartPayload: makeRestoreGameStartPayload({ hostEpoch: 3, actionSeq: 2 }),
        stateSnapshotOverrides: { currentPlayerIndex: 0, phase: 'build', actionSeq: 5 },
        actionLog: [{ action: 'nextTurn', data: {}, playerIndex: 0, seq: 6 }],
        expectedRank: { hostEpoch: 3, actionSeq: 6 },
    };
}

function makeRestoreStateSnapshot(overrides = {}) {
    return Object.assign({
        players: [
            {
                name: RESTORE_PLAYER_NAMES[0],
                coins: 3,
                cards: ['麦畑', 'パン屋'],
                dormantIndices: [],
                landmarks: { '駅': false, 'ショッピングモール': false },
                itVentureCoins: 0,
                hasYakusho: true,
            },
            {
                name: RESTORE_PLAYER_NAMES[1],
                coins: 3,
                cards: ['麦畑', 'パン屋'],
                dormantIndices: [],
                landmarks: { '駅': false, 'ショッピングモール': false },
                itVentureCoins: 0,
                hasYakusho: true,
            },
        ],
        currentPlayerIndex: 1,
        phase: 'roll',
        log: [],
        lastDiceResult: 0,
        lastDice1: 0,
        lastDice2: 0,
        builtThisTurn: false,
        pendingTV: 0,
        pendingBusiness: 0,
        pendingCleaning: 0,
        pendingMover: 0,
        pendingRenovation: 0,
        pendingIT: false,
        usedReroll: false,
        pendingTunaDice: null,
        turnCount: 1,
        hadAmusementParkAtRoll: false,
        shopStock: { '麦畑': 6, 'パン屋': 6, 'カフェ': 6, 'ビジネスセンター': 2, '引越し屋': 6 },
        undoState: null,
        actionSeq: 7,
    }, overrides);
}

function makePendingAckRequiresLogOrSnapshotFixture() {
    const pendingAction = {
        action: 'nextTurn',
        data: {},
        playerIndex: 0,
        seq: 7,
        clientActionId: 'pending-next-turn-7',
    };
    const gameStartPayload = makeRestoreGameStartPayload({ hostEpoch: 3, actionSeq: 12 });
    const snapshotCompactedState = makeRestoreStateSnapshot({ actionSeq: pendingAction.seq });
    return {
        name: ONLINE_RESTORE_FIXTURE_NAMES.PENDING_ACK_REQUIRES_LOG_OR_SNAPSHOT,
        doc: 'docs/online-restore-schema.md#localStorage-Keys',
        pendingAction,
        serverBundle: {
            gameStartPayload,
            stateSnapshot: null,
            actionLog: [],
            playerIndex: 0,
            hostPlayerIndex: 0,
            hostEpoch: 3,
        },
        snapshotCompactedBundle: {
            gameStartPayload: Object.assign({}, gameStartPayload),
            stateSnapshot: snapshotCompactedState,
            actionLog: [],
            playerIndex: 0,
            hostPlayerIndex: 0,
            hostEpoch: 3,
        },
    };
}

module.exports = {
    ONLINE_RESTORE_FIXTURE_NAMES,
    RESTORE_PLAYER_NAMES,
    RESTORE_TOKENS,
    makeRestoreGameStartPayload,
    makeRestoreStateSnapshot,
    makeSeqRankUsesMaxFieldsFixture,
    makePendingAckRequiresLogOrSnapshotFixture,
};
