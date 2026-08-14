'use strict';

const RoomQrCode = (() => {
    const ALPHANUMERIC = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
    const SHORT_SIZE = 21;
    const LINK_SIZE = 33;

    function appendBits(target, value, length) {
        for (let shift = length - 1; shift >= 0; shift--) target.push((value >>> shift) & 1);
    }

    function normalize(value) {
        const text = typeof value === 'string' ? value.trim().toUpperCase() : '';
        return text.length >= 1 && text.length <= 10 &&
            Array.from(text).every(character => ALPHANUMERIC.includes(character)) ? text : '';
    }

    function normalizeRoomId(value) {
        const normalized = normalize(value);
        return normalized.length === 6 ? normalized : '';
    }

    function utf8Bytes(text) {
        const Encoder = typeof globalThis !== 'undefined' ? globalThis.TextEncoder : null;
        if (typeof Encoder === 'function') return Array.from(new Encoder().encode(text));
        const encoded = unescape(encodeURIComponent(text));
        return Array.from(encoded, character => character.charCodeAt(0));
    }

    function shortDataCodewords(text) {
        const bits = [];
        appendBits(bits, 0b0010, 4);
        appendBits(bits, text.length, 9);
        for (let index = 0; index < text.length; index += 2) {
            const left = ALPHANUMERIC.indexOf(text[index]);
            if (index + 1 < text.length) appendBits(bits, left * 45 + ALPHANUMERIC.indexOf(text[index + 1]), 11);
            else appendBits(bits, left, 6);
        }
        return padCodewords(bits, 19);
    }

    function linkDataCodewords(text) {
        const bytes = utf8Bytes(text);
        if (!bytes.length || bytes.length > 78) return null;
        const bits = [];
        appendBits(bits, 0b0100, 4);
        appendBits(bits, bytes.length, 8);
        bytes.forEach(byte => appendBits(bits, byte, 8));
        return padCodewords(bits, 80);
    }

    function padCodewords(bits, capacity) {
        const capacityBits = capacity * 8;
        appendBits(bits, 0, Math.min(4, capacityBits - bits.length));
        while (bits.length % 8) bits.push(0);
        const result = [];
        for (let index = 0; index < bits.length; index += 8) {
            result.push(bits.slice(index, index + 8).reduce((value, bit) => value * 2 + bit, 0));
        }
        for (let pad = 0; result.length < capacity; pad++) result.push(pad % 2 ? 0x11 : 0xec);
        return result;
    }

    function multiply(left, right) {
        let result = 0;
        let a = left;
        let b = right;
        while (b) {
            if (b & 1) result ^= a;
            a <<= 1;
            if (a & 0x100) a ^= 0x11d;
            b >>>= 1;
        }
        return result;
    }

    function power(exponent) {
        let result = 1;
        for (let index = 0; index < exponent; index++) result = multiply(result, 2);
        return result;
    }

    function generatorPolynomial(degree) {
        let polynomial = [1];
        for (let exponent = 0; exponent < degree; exponent++) {
            const next = Array(polynomial.length + 1).fill(0);
            polynomial.forEach((value, index) => {
                next[index] ^= value;
                next[index + 1] ^= multiply(value, power(exponent));
            });
            polynomial = next;
        }
        return polynomial;
    }

    function errorCorrection(data, degree = 7) {
        const divisor = generatorPolynomial(degree);
        const work = data.concat(Array(degree).fill(0));
        for (let index = 0; index < data.length; index++) {
            const factor = work[index];
            if (!factor) continue;
            divisor.forEach((coefficient, offset) => {
                work[index + offset] ^= multiply(coefficient, factor);
            });
        }
        return work.slice(-degree);
    }

    function createMatrix(text) {
        const shortText = normalize(text);
        const isShort = !!shortText && shortText === text.trim().toUpperCase();
        const content = isShort ? shortText : (typeof text === 'string' ? text.trim() : '');
        const size = isShort ? SHORT_SIZE : LINK_SIZE;
        const data = isShort ? shortDataCodewords(content) : linkDataCodewords(content);
        if (!data) return null;
        const eccDegree = isShort ? 7 : 20;
        const modules = Array.from({ length: size }, () => Array(size).fill(false));
        const reserved = Array.from({ length: size }, () => Array(size).fill(false));
        const set = (row, column, dark, reserve = true) => {
            if (row < 0 || column < 0 || row >= size || column >= size) return;
            modules[row][column] = !!dark;
            if (reserve) reserved[row][column] = true;
        };
        const finder = (top, left) => {
            for (let row = -1; row <= 7; row++) {
                for (let column = -1; column <= 7; column++) {
                    const inside = row >= 0 && row <= 6 && column >= 0 && column <= 6;
                    const dark = inside && (row === 0 || row === 6 || column === 0 || column === 6 ||
                        (row >= 2 && row <= 4 && column >= 2 && column <= 4));
                    set(top + row, left + column, dark);
                }
            }
        };
        const alignment = (centerRow, centerColumn) => {
            for (let row = -2; row <= 2; row++) {
                for (let column = -2; column <= 2; column++) {
                    set(centerRow + row, centerColumn + column,
                        Math.max(Math.abs(row), Math.abs(column)) !== 1);
                }
            }
        };
        finder(0, 0);
        finder(0, size - 7);
        finder(size - 7, 0);
        if (!isShort) alignment(26, 26);
        for (let index = 8; index < size - 8; index++) {
            set(6, index, index % 2 === 0);
            set(index, 6, index % 2 === 0);
        }
        for (let index = 0; index < 9; index++) {
            if (index !== 6) {
                set(8, index, false);
                set(index, 8, false);
            }
        }
        for (let index = 0; index < 8; index++) {
            set(8, size - 1 - index, false);
            set(size - 1 - index, 8, false);
        }
        set(size - 8, 8, true);

        const codewords = data.concat(errorCorrection(data, eccDegree));
        const bits = [];
        codewords.forEach(byte => appendBits(bits, byte, 8));
        let bitIndex = 0;
        let upward = true;
        for (let right = size - 1; right >= 1; right -= 2) {
            if (right === 6) right--;
            for (let vertical = 0; vertical < size; vertical++) {
                const row = upward ? size - 1 - vertical : vertical;
                for (let offset = 0; offset < 2; offset++) {
                    const column = right - offset;
                    if (reserved[row][column]) continue;
                    const bit = bitIndex < bits.length ? bits[bitIndex++] === 1 : false;
                    modules[row][column] = bit !== ((row + column) % 2 === 0);
                }
            }
            upward = !upward;
        }

        let format = 8 << 10;
        for (let bit = 14; bit >= 10; bit--) {
            if ((format >>> bit) & 1) format ^= 0x537 << (bit - 10);
        }
        format = ((8 << 10) | format) ^ 0x5412;
        const formatBit = index => ((format >>> index) & 1) !== 0;
        for (let index = 0; index <= 5; index++) set(8, index, formatBit(index));
        set(8, 7, formatBit(6));
        set(8, 8, formatBit(7));
        set(7, 8, formatBit(8));
        for (let index = 9; index < 15; index++) set(14 - index, 8, formatBit(index));
        for (let index = 0; index < 8; index++) set(size - 1 - index, 8, formatBit(index));
        for (let index = 8; index < 15; index++) set(8, size - 15 + index, formatBit(index));
        set(size - 8, 8, true);
        return Object.freeze(modules.map(row => Object.freeze(row.slice())));
    }

    function buildJoinUrl(roomId, locationLike = {}) {
        const normalized = normalizeRoomId(roomId);
        if (!normalized) return '';
        const origin = typeof locationLike.origin === 'string' ? locationLike.origin.replace(/\/$/, '') : '';
        const pathname = typeof locationLike.pathname === 'string' && locationLike.pathname.startsWith('/')
            ? locationLike.pathname : '/';
        if (!origin) return '';
        return `${origin}${pathname}?room=${encodeURIComponent(normalized)}`;
    }

    function parseJoinRoomId(locationLike = {}) {
        const search = typeof locationLike.search === 'string' ? locationLike.search : '';
        try {
            const Params = typeof globalThis !== 'undefined' ? globalThis.URLSearchParams : null;
            if (typeof Params !== 'function') throw new TypeError('URLSearchParams unavailable');
            return normalizeRoomId(new Params(search).get('room'));
        } catch (_) {
            const match = search.match(/[?&]room=([^&]+)/i);
            return match ? normalizeRoomId(decodeURIComponent(match[1])) : '';
        }
    }

    function buildSvg(text) {
        const matrix = createMatrix(text);
        if (!matrix) return '';
        const quiet = 4;
        const size = matrix.length + quiet * 2;
        const path = [];
        matrix.forEach((row, y) => row.forEach((dark, x) => {
            if (dark) path.push(`M${x + quiet} ${y + quiet}h1v1h-1z`);
        }));
        const label = normalize(text) ? `ルームID ${normalize(text)} のQRコード` : 'オンライン参加リンクのQRコード';
        return `<svg class="room-qr-svg" role="img" aria-label="${label}" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><path d="${path.join('')}" fill="#000"/></svg>`;
    }

    return Object.freeze({
        ALPHANUMERIC,
        SIZE: SHORT_SIZE,
        LINK_SIZE,
        buildJoinUrl,
        buildSvg,
        createMatrix,
        dataCodewords: shortDataCodewords,
        errorCorrection,
        normalize,
        normalizeRoomId,
        parseJoinRoomId,
        shortDataCodewords,
    });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = RoomQrCode;
if (typeof window !== 'undefined') window.RoomQrCode = RoomQrCode;
if (typeof globalThis !== 'undefined') globalThis.RoomQrCode = RoomQrCode;
