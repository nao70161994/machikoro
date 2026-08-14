'use strict';

const RoomQrCode = (() => {
    const ALPHANUMERIC = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
    const SIZE = 21;

    function appendBits(target, value, length) {
        for (let shift = length - 1; shift >= 0; shift--) target.push((value >>> shift) & 1);
    }

    function normalize(value) {
        const text = typeof value === 'string' ? value.trim().toUpperCase() : '';
        return text.length >= 1 && text.length <= 10 &&
            Array.from(text).every(character => ALPHANUMERIC.includes(character)) ? text : '';
    }

    function dataCodewords(text) {
        const bits = [];
        appendBits(bits, 0b0010, 4);
        appendBits(bits, text.length, 9);
        for (let index = 0; index < text.length; index += 2) {
            const left = ALPHANUMERIC.indexOf(text[index]);
            if (index + 1 < text.length) {
                appendBits(bits, left * 45 + ALPHANUMERIC.indexOf(text[index + 1]), 11);
            } else appendBits(bits, left, 6);
        }
        appendBits(bits, 0, Math.min(4, 152 - bits.length));
        while (bits.length % 8) bits.push(0);
        const result = [];
        for (let index = 0; index < bits.length; index += 8) {
            result.push(bits.slice(index, index + 8).reduce((value, bit) => value * 2 + bit, 0));
        }
        for (let pad = 0; result.length < 19; pad++) result.push(pad % 2 ? 0x11 : 0xec);
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

    function errorCorrection(data) {
        const generator = [87, 229, 146, 149, 238, 102, 21];
        const remainder = Array(7).fill(0);
        for (const byte of data) {
            const factor = byte ^ remainder.shift();
            remainder.push(0);
            for (let index = 0; index < remainder.length; index++) {
                remainder[index] ^= multiply(generator[index], factor);
            }
        }
        return remainder;
    }

    function createMatrix(text) {
        const normalized = normalize(text);
        if (!normalized) return null;
        const modules = Array.from({ length: SIZE }, () => Array(SIZE).fill(false));
        const reserved = Array.from({ length: SIZE }, () => Array(SIZE).fill(false));
        const set = (row, column, dark, reserve = true) => {
            if (row < 0 || column < 0 || row >= SIZE || column >= SIZE) return;
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
        finder(0, 0);
        finder(0, SIZE - 7);
        finder(SIZE - 7, 0);
        for (let index = 8; index < SIZE - 8; index++) {
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
            set(8, SIZE - 1 - index, false);
            set(SIZE - 1 - index, 8, false);
        }
        set(SIZE - 8, 8, true);

        const codewords = [...dataCodewords(normalized)];
        codewords.push(...errorCorrection(codewords));
        const bits = [];
        codewords.forEach(byte => appendBits(bits, byte, 8));
        let bitIndex = 0;
        let upward = true;
        for (let right = SIZE - 1; right >= 1; right -= 2) {
            if (right === 6) right--;
            for (let vertical = 0; vertical < SIZE; vertical++) {
                const row = upward ? SIZE - 1 - vertical : vertical;
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
        for (let index = 0; index < 8; index++) set(SIZE - 1 - index, 8, formatBit(index));
        for (let index = 8; index < 15; index++) set(8, SIZE - 15 + index, formatBit(index));
        set(SIZE - 8, 8, true);
        return Object.freeze(modules.map(row => Object.freeze(row.slice())));
    }

    function buildSvg(text) {
        const matrix = createMatrix(text);
        if (!matrix) return '';
        const quiet = 4;
        const size = SIZE + quiet * 2;
        const path = [];
        matrix.forEach((row, y) => row.forEach((dark, x) => {
            if (dark) path.push(`M${x + quiet} ${y + quiet}h1v1h-1z`);
        }));
        return `<svg class="room-qr-svg" role="img" aria-label="ルームID ${normalize(text)} のQRコード" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><path d="${path.join('')}" fill="#000"/></svg>`;
    }

    return Object.freeze({ ALPHANUMERIC, SIZE, buildSvg, createMatrix, dataCodewords, errorCorrection, normalize });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = RoomQrCode;
if (typeof window !== 'undefined') window.RoomQrCode = RoomQrCode;
if (typeof globalThis !== 'undefined') globalThis.RoomQrCode = RoomQrCode;
