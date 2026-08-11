const assert = require('assert');
const crypto = require('crypto');
const {
    HOSTLESS_RESTORE_SCHEMA_VERSION,
    HOSTLESS_RESTORE_LIMITS,
    HOSTLESS_RESTORE_RESULTS,
    stableJson,
    canonicalCandidateHash,
    evaluateCandidateQuorum,
    nextConfirmationPlayerIndex,
    candidateCollectionExpired,
} = require('../server/hostlessRestoreCandidate');

function runTest(name, fn) {
    try {
        fn();
        console.log(`テスト成功: ${name}`);
    } catch (error) {
        console.error(`テスト失敗: ${name}`);
        throw error;
    }
}

function candidate(playerIndex, overrides = {}) {
    return Object.assign({
        playerIndex,
        playerType: 'human',
        socketId: `socket-${playerIndex}`,
        capabilityVersion: HOSTLESS_RESTORE_SCHEMA_VERSION,
        generation: 2,
        rank: { hostEpoch: 3, actionSeq: 18 },
        canonicalHash: 'a'.repeat(64),
        completed: false,
        payload: { private: 'not-used-by-quorum' },
    }, overrides);
}

runTest('hostless restore limits は合意済み時間・人数・上限を固定する', () => {
    assert.deepStrictEqual(HOSTLESS_RESTORE_LIMITS, {
        hostGraceMs: 60_000,
        collectionMs: 30_000,
        confirmationMs: 60_000,
        retentionMs: 120_000,
        minDistinctHumans: 2,
        maxAttempts: 3,
        maxCandidates: 10,
        candidateCooldownMs: 1000,
    });
    assert.strictEqual(Object.isFrozen(HOSTLESS_RESTORE_LIMITS), true);
});

runTest('canonicalCandidateHash はobject key順を無視しarray順を保持する', () => {
    const left = { state: { coins: 3, cards: ['麦畑', 'パン屋'] }, rank: { actionSeq: 4 } };
    const right = { rank: { actionSeq: 4 }, state: { cards: ['麦畑', 'パン屋'], coins: 3 } };
    const reorderedArray = { rank: { actionSeq: 4 }, state: { cards: ['パン屋', '麦畑'], coins: 3 } };
    assert.strictEqual(stableJson(left), stableJson(right));
    assert.strictEqual(canonicalCandidateHash(crypto, left), canonicalCandidateHash(crypto, right));
    assert.notStrictEqual(canonicalCandidateHash(crypto, left), canonicalCandidateHash(crypto, reorderedArray));
});

runTest('hostless quorum は異なるhuman 2人の完全一致をplayer順で受理する', () => {
    const result = evaluateCandidateQuorum([candidate(3), candidate(1)]);
    assert.strictEqual(result.status, HOSTLESS_RESTORE_RESULTS.READY);
    assert.deepStrictEqual(result.confirmationOrder, [1, 3]);
    assert.deepStrictEqual(result.rank, { hostEpoch: 3, actionSeq: 18 });
    assert.strictEqual(result.generation, 2);
});

runTest('同一playerの複数tabは1候補として扱う', () => {
    const result = evaluateCandidateQuorum([
        candidate(1, { socketId: 'tab-a' }),
        candidate(1, { socketId: 'tab-b' }),
    ]);
    assert.strictEqual(result.status, HOSTLESS_RESTORE_RESULTS.INSUFFICIENT);
    assert.strictEqual(result.candidates.length, 1);
});

runTest('同一playerが異なる状態を出した場合はfail closedにする', () => {
    const result = evaluateCandidateQuorum([
        candidate(1),
        candidate(1, { canonicalHash: 'b'.repeat(64) }),
        candidate(2),
    ]);
    assert.strictEqual(result.status, HOSTLESS_RESTORE_RESULTS.MISMATCH);
});

runTest('候補hash・rank・generationのどれかが違えば多数決せず不一致にする', () => {
    const cases = [
        candidate(2, { canonicalHash: 'b'.repeat(64) }),
        candidate(2, { rank: { hostEpoch: 3, actionSeq: 19 } }),
        candidate(2, { generation: 3 }),
    ];
    for (const different of cases) {
        const result = evaluateCandidateQuorum([candidate(0), candidate(1), different]);
        assert.strictEqual(result.status, HOSTLESS_RESTORE_RESULTS.MISMATCH);
    }
});

runTest('CPUと未対応clientはquorumへ数えない', () => {
    const result = evaluateCandidateQuorum([
        candidate(0),
        candidate(1, { playerType: 'cpu' }),
        candidate(2, { capabilityVersion: 0 }),
    ]);
    assert.strictEqual(result.status, HOSTLESS_RESTORE_RESULTS.INSUFFICIENT);
    assert.deepStrictEqual(result.candidates.map(item => item.playerIndex), [0]);
});

runTest('完了済みの一致候補はroomを復元しない', () => {
    const result = evaluateCandidateQuorum([
        candidate(0, { completed: true }),
        candidate(1, { completed: true }),
    ]);
    assert.strictEqual(result.status, HOSTLESS_RESTORE_RESULTS.COMPLETED);
});

runTest('完了状態が候補間で異なれば復元しない', () => {
    const result = evaluateCandidateQuorum([candidate(0), candidate(1, { completed: true })]);
    assert.strictEqual(result.status, HOSTLESS_RESTORE_RESULTS.MISMATCH);
});

runTest('hostless復元3回到達後は候補内容に関係なく拒否する', () => {
    const result = evaluateCandidateQuorum([candidate(0), candidate(1)], { attemptCount: 3 });
    assert.strictEqual(result.status, HOSTLESS_RESTORE_RESULTS.ATTEMPT_LIMIT);
});

runTest('確認担当は除外済みplayerを飛ばして元player順で選ぶ', () => {
    assert.strictEqual(nextConfirmationPlayerIndex([1, 3, 4]), 1);
    assert.strictEqual(nextConfirmationPlayerIndex([1, 3, 4], [1]), 3);
    assert.strictEqual(nextConfirmationPlayerIndex([1, 3, 4], [1, 3, 4]), null);
});

runTest('candidate retentionは2分境界で期限切れになる', () => {
    assert.strictEqual(candidateCollectionExpired(1_000, 120_999), false);
    assert.strictEqual(candidateCollectionExpired(1_000, 121_000), true);
    assert.strictEqual(candidateCollectionExpired(-1, 1_000), true);
});
