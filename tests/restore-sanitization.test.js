const assert = require('assert');
const makeRestoreSanitization = require('../server/restoreSanitization');

function createSubject() {
    return makeRestoreSanitization({
        isPlainObject: value => !!value && typeof value === 'object' && !Array.isArray(value),
        gameActionRegistry: { nextTurn: {}, buildCard: {} },
        canonicalizeActionData(action, data) {
            return action === 'buildCard' && typeof data.cardName === 'string'
                ? { cardName: data.cardName }
                : {};
        },
        normalizeClientActionId(value) {
            return typeof value === 'string' && /^[A-Za-z0-9:_-]{1,120}$/.test(value) ? value : '';
        },
        validateRestoreAuditRecord(record, context) {
            if (record == null) return { ok: true, record: null };
            if (record.roomId !== context.roomId) return { ok: false };
            return { ok: true, record };
        },
        isVerifiedRestoreActionAudit(roomId, entry) {
            return entry.restoreActionAudit?.roomId === roomId && entry.restoreActionAudit.signed === true;
        },
    });
}

const subject = createSubject();

assert.strictEqual(subject.restoreSnapshotActionSeq({ actionSeq: 4 }), 4);
assert.strictEqual(subject.restoreSnapshotActionSeq({ actionSeq: -1 }), 0);
assert.strictEqual(subject.restoreSnapshotActionSeq(null), 0);

assert.deepStrictEqual(
    subject.sanitizeRestoreActionLogEntry({
        action: 'buildCard',
        data: { cardName: '麦畑', extra: true },
        playerIndex: 0,
        seq: 5,
        clientActionId: 'client-5',
    }, 'ROOM1', 4),
    {
        entry: {
            action: 'buildCard',
            data: { cardName: '麦畑' },
            playerIndex: 0,
            seq: 5,
            clientActionId: 'client-5',
        },
    }
);
assert.deepStrictEqual(
    subject.sanitizeRestoreActionLogEntry({ action: 'nextTurn', seq: 4 }, 'ROOM1', 4),
    { skip: true }
);
assert.deepStrictEqual(
    subject.sanitizeRestoreActionLogEntry({ action: 'unknownAction', seq: 5 }, 'ROOM1', 4),
    { invalid: true }
);
assert.deepStrictEqual(
    subject.sanitizeRestoreActionLogEntry({
        action: 'nextTurn',
        roomId: 'OTHER',
        seq: 5,
    }, 'ROOM1', 4),
    { invalid: true }
);

assert.deepStrictEqual(subject.sanitizeRestoreActionLog([
    { action: 'nextTurn', seq: 4 },
    { action: 'buildCard', data: { cardName: '麦畑', extra: true }, seq: 5, playerIndex: 0 },
    { action: 'nextTurn', seq: 6, playerIndex: 0 },
], 'ROOM1', { actionSeq: 4 }), [
    { action: 'buildCard', data: { cardName: '麦畑' }, seq: 5, playerIndex: 0 },
    { action: 'nextTurn', data: {}, seq: 6, playerIndex: 0 },
]);
assert.strictEqual(subject.sanitizeRestoreActionLog([
    { action: 'nextTurn', seq: 6 },
], 'ROOM1', { actionSeq: 4 }), null);

const signedAudit = { roomId: 'ROOM1', signed: true };
assert.deepStrictEqual(subject.sanitizeRestoreActionLog([
    { action: 'nextTurn', seq: 1, restoreActionAudit: signedAudit },
], 'ROOM1', null, { requireSignedActionAudit: true }), [
    { action: 'nextTurn', data: {}, seq: 1, restoreActionAudit: signedAudit },
]);
assert.strictEqual(subject.sanitizeRestoreActionLog([
    { action: 'nextTurn', seq: 1 },
], 'ROOM1', null, { requireSignedActionAudit: true }), null);

console.log('restore sanitization tests passed');
