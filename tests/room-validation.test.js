const assert = require('assert');
const {
    ROOM_ID_ALPHABET,
    sanitizeName,
    isValidRoomId,
    generateRoomId,
} = require('../server/roomValidation');
const { runTest } = require('./helpers/test-utils');

runTest('room validation は表示名の既存sanitize契約を維持する', () => {
    assert.strictEqual(sanitizeName('  Alice<script>  '), 'Alicescript');
    assert.strictEqual(sanitizeName('12345678901234567890Z'), '12345678901234567890');
    assert.strictEqual(sanitizeName(null), '');
});

runTest('room validation は安全なroom IDだけを許可する', () => {
    for (const roomId of ['ABC234', 'room_1', 'room-2', 'a', 'A'.repeat(64)]) {
        assert.strictEqual(isValidRoomId(roomId), true, roomId);
    }
    for (const roomId of [null, '', 'A'.repeat(65), '__proto__', 'constructor', 'prototype', 'room id', '../room']) {
        assert.strictEqual(isValidRoomId(roomId), false, String(roomId));
    }
});

runTest('room validation は衝突したIDを再生成する', () => {
    const firstId = ROOM_ID_ALPHABET[0].repeat(6);
    const secondId = ROOM_ID_ALPHABET[ROOM_ID_ALPHABET.length - 1].repeat(6);
    const randomValues = [
        ...Array(6).fill(0),
        ...Array(6).fill(0.999999),
    ];
    const generated = generateRoomId({ [firstId]: {} }, () => randomValues.shift());

    assert.strictEqual(generated, secondId);
    assert.match(generated, /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/);
});
