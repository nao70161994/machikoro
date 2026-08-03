'use strict';

const REQUIRED_EFFECTS = Object.freeze([
    'detachExisting',
    'resolvePlayer',
    'joinSocket',
    'assignSocketRoom',
    'assignSocketPlayer',
    'isHostConnected',
    'setHostPlayer',
    'emitHostChanged',
    'persistHostReselected',
    'logHostReselected',
    'touchRoom',
    'emitRejoinData',
    'broadcastPlayerRejoined',
]);

function existingRoomRejoinEffectAuthorityEnabled(env = {}) {
    return ['1', 'true'].includes(
        String(env.EXISTING_ROOM_REJOIN_EFFECT_AUTHORITY_ENABLED || '').trim().toLowerCase()
    );
}

function executeExistingRoomRejoin(effects = {}) {
    for (const name of REQUIRED_EFFECTS) {
        if (typeof effects[name] !== 'function') {
            throw new TypeError(name + ' effect is required');
        }
    }
    const executed = [];
    function execute(name) {
        const result = effects[name]();
        executed.push(name);
        return result;
    }

    execute('detachExisting');
    const player = execute('resolvePlayer');
    if (!player) {
        return Object.freeze({
            ok: false,
            errorMessage: '再接続情報が一致しません',
            executed: Object.freeze(executed.slice()),
        });
    }
    execute('joinSocket');
    execute('assignSocketRoom');
    execute('assignSocketPlayer');
    const hostConnected = execute('isHostConnected');
    if (!hostConnected) {
        execute('setHostPlayer');
        execute('emitHostChanged');
        execute('persistHostReselected');
        execute('logHostReselected');
    }
    execute('touchRoom');
    execute('emitRejoinData');
    execute('broadcastPlayerRejoined');
    return Object.freeze({
        ok: true,
        executed: Object.freeze(executed.slice()),
    });
}

module.exports = Object.freeze({
    REQUIRED_EFFECTS,
    existingRoomRejoinEffectAuthorityEnabled,
    executeExistingRoomRejoin,
});
