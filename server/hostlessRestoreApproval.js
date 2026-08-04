'use strict';

function normalizeRoomId(payload) {
    return typeof payload?.roomId === 'string' ? payload.roomId.trim().toUpperCase() : '';
}

function makeHostlessRestoreApproval(dependencies = {}) {
    const required = ['hasRoom', 'recreateRoom', 'roomForId'];
    for (const name of required) {
        if (typeof dependencies[name] !== 'function') {
            throw new TypeError('hostless restore approval requires ' + name);
        }
    }

    function approve(socket, payload, metadata = {}) {
        const roomId = normalizeRoomId(payload);
        if (!roomId || dependencies.hasRoom(roomId)) {
            return Object.freeze({ ok: false, reason: 'room-exists' });
        }
        const result = dependencies.recreateRoom(socket, payload, {
            approvedHostless: true,
            candidateCount: metadata.candidateCount,
        });
        if (!result?.ok || !dependencies.roomForId(roomId)?.provisionalRestore) {
            return Object.freeze({ ok: false, reason: result?.reason || 'restore-failed' });
        }
        return Object.freeze({ ok: true });
    }

    return Object.freeze({ approve });
}

module.exports = makeHostlessRestoreApproval;
module.exports.normalizeRoomId = normalizeRoomId;
