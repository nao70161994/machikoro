'use strict';

function makeExistingRoomRestoreRuntime(dependencies = {}) {
    const required = [
        'planAdmission',
        'emitAppError',
        'detachExisting',
        'resolvePlayer',
        'joinSocket',
        'isHostConnected',
        'setHostPlayer',
        'emitHostChanged',
        'persistHostReselected',
        'logHostReselected',
        'touchRoom',
        'emitRejoinData',
        'broadcastPlayerRejoined',
    ];
    for (const name of required) {
        if (typeof dependencies[name] !== 'function') {
            throw new TypeError(name + ' dependency is required');
        }
    }
    if (dependencies.effectAuthorityEnabled && typeof dependencies.executeRejoin !== 'function') {
        throw new TypeError('executeRejoin dependency is required when effect authority is enabled');
    }

    function handle(input = {}) {
        const admission = dependencies.planAdmission(input.admissionInput);
        if (admission.ok !== true) {
            dependencies.emitAppError(input.socket, admission.errorMessage);
            return Object.freeze({ handled: true });
        }
        if (admission.action === 'replace') {
            return Object.freeze({ handled: false });
        }

        const effects = {
            detachExisting: () => dependencies.detachExisting(input),
            resolvePlayer: () => dependencies.resolvePlayer(input),
            joinSocket: () => dependencies.joinSocket(input),
            assignSocketRoom: () => {
                input.socket.roomId = input.roomId;
            },
            assignSocketPlayer: () => {
                input.socket.playerIndex = input.playerIndex;
            },
            isHostConnected: () => dependencies.isHostConnected(input),
            setHostPlayer: () => dependencies.setHostPlayer(input),
            emitHostChanged: () => dependencies.emitHostChanged(input),
            persistHostReselected: () => dependencies.persistHostReselected(input),
            logHostReselected: () => dependencies.logHostReselected(input),
            touchRoom: () => dependencies.touchRoom(input),
            emitRejoinData: () => dependencies.emitRejoinData(input),
            broadcastPlayerRejoined: () => dependencies.broadcastPlayerRejoined(input),
        };
        const result = dependencies.effectAuthorityEnabled
            ? dependencies.executeRejoin(effects)
            : executeLegacyRejoin(effects);
        if (result.ok !== true) {
            dependencies.emitAppError(input.socket, result.errorMessage);
        }
        return Object.freeze({ handled: true });
    }

    return Object.freeze({ handle });
}

function executeLegacyRejoin(effects) {
    effects.detachExisting();
    const player = effects.resolvePlayer();
    if (!player) {
        return { ok: false, errorMessage: '再接続情報が一致しません' };
    }
    effects.joinSocket();
    effects.assignSocketRoom();
    effects.assignSocketPlayer();
    if (!effects.isHostConnected()) {
        effects.setHostPlayer();
        effects.emitHostChanged();
        effects.persistHostReselected();
        effects.logHostReselected();
    }
    effects.touchRoom();
    effects.emitRejoinData();
    effects.broadcastPlayerRejoined();
    return { ok: true };
}

module.exports = makeExistingRoomRestoreRuntime;
