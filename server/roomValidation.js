'use strict';

const ROOM_ID_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

function sanitizeName(name) {
    return String(name || '').trim().slice(0, 20).replace(/[<>&"'`]/g, '');
}

function isValidRoomId(roomId) {
    if (typeof roomId !== 'string') return false;
    if (roomId.length < 1 || roomId.length > 64) return false;
    if (roomId === '__proto__' || roomId === 'constructor' || roomId === 'prototype') return false;
    return /^[A-Za-z0-9_-]+$/.test(roomId);
}

function generateRoomId(existingRooms = {}, randomFn = Math.random) {
    let roomId;
    do {
        roomId = '';
        for (let i = 0; i < 6; i++) {
            roomId += ROOM_ID_ALPHABET[Math.floor(randomFn() * ROOM_ID_ALPHABET.length)];
        }
    } while (Object.prototype.hasOwnProperty.call(existingRooms, roomId));
    return roomId;
}

module.exports = {
    ROOM_ID_ALPHABET,
    sanitizeName,
    isValidRoomId,
    generateRoomId,
};
