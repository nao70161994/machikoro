'use strict';

function makeRestoredRoomRuntime(dependencies = {}) {
    const requiredDependencies = [
        'planActivation',
        'executeActivation',
        'executeDelivery',
        'planCompletion',
        'executeCompletion',
    ];
    for (const name of requiredDependencies) {
        if (typeof dependencies[name] !== 'function') {
            throw new TypeError(name + ' dependency is required');
        }
    }
    if (!dependencies.activationDecisions ||
        typeof dependencies.activationDecisions.REJECT_EXISTING_HOSTLESS !== 'string') {
        throw new TypeError('activation decisions dependency is required');
    }

    function validateEffects(effects, names) {
        for (const name of names) {
            if (typeof effects[name] !== 'function') {
                throw new TypeError(name + ' effect is required');
            }
        }
    }

    function activateRestoredRoom(input = {}, effects = {}) {
        const activationPlan = dependencies.planActivation({
            roomExists: input.roomExists === true,
            approvedHostless: input.approvedHostless === true,
        });
        if (activationPlan.decision ===
                dependencies.activationDecisions.REJECT_EXISTING_HOSTLESS) {
            return Object.freeze({
                ok: false,
                reason: 'room-exists',
                errorMessage: '同じルームIDが既に使用されています',
            });
        }

        const activationEffects = [];
        if (activationPlan.detachExisting) activationEffects.push('detachExisting');
        if (activationPlan.deleteExisting) activationEffects.push('deleteExisting');
        if (activationPlan.install) activationEffects.push('install');
        const deliveryEffects = [
            'persist',
            'joinSocket',
            'assignSocketRoom',
            'assignSocketPlayer',
            'emitRejoinData',
        ];
        validateEffects(effects, activationEffects.concat(deliveryEffects, ['log']));

        if (dependencies.activationEffectAuthorityEnabled === true) {
            dependencies.executeActivation(activationPlan, {
                detachExisting: effects.detachExisting,
                deleteExisting: effects.deleteExisting,
                install: effects.install,
            });
        } else {
            for (const name of activationEffects) effects[name]();
        }

        const delivery = {
            persist: effects.persist,
            joinSocket: effects.joinSocket,
            assignSocketRoom: effects.assignSocketRoom,
            assignSocketPlayer: effects.assignSocketPlayer,
            emitRejoinData: effects.emitRejoinData,
        };
        if (dependencies.deliveryEffectAuthorityEnabled === true) {
            dependencies.executeDelivery(delivery);
        } else {
            for (const name of deliveryEffects) delivery[name]();
        }

        const completionPlan = dependencies.planCompletion({
            roomId: input.roomId,
            playerName: input.playerName,
            playerIndex: input.playerIndex,
            approvedHostless: input.approvedHostless,
            restoredRoom: input.restoredRoom,
        });
        return dependencies.executeCompletion(completionPlan, { log: effects.log });
    }

    return Object.freeze({ activateRestoredRoom });
}

module.exports = makeRestoredRoomRuntime;
