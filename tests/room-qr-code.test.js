'use strict';

const assert = require('assert');
const RoomQrCode = require('../js/roomQrCode');
const { runTest } = require('./helpers/test-utils');

runTest('room QRは正規化した短い英数字をversion 1-L matrixへ変換する', () => {
    assert.strictEqual(RoomQrCode.normalize(' abc123 '), 'ABC123');
    assert.strictEqual(RoomQrCode.normalize('日本語'), '');
    const matrix = RoomQrCode.createMatrix('ABC123');
    assert.strictEqual(matrix.length, 21);
    assert.ok(matrix.every(row => row.length === 21 && row.every(value => typeof value === 'boolean')));
    assert.deepStrictEqual(matrix[0].slice(0, 7), [true, true, true, true, true, true, true]);
    assert.deepStrictEqual(matrix[1].slice(0, 7), [true, false, false, false, false, false, true]);
});

runTest('room QR SVGはquiet zoneとaccessible nameを持ち外部通信を使わない', () => {
    const svg = RoomQrCode.buildSvg('ABC123');
    assert.ok(svg.includes('viewBox="0 0 29 29"'));
    assert.ok(svg.includes('aria-label="ルームID ABC123 のQRコード"'));
    assert.ok(svg.includes('shape-rendering="crispEdges"'));
    assert.ok(!svg.includes('http'));
    assert.strictEqual(RoomQrCode.buildSvg(''), '');
});
