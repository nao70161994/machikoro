'use strict';

const OnlineSocketRegistry = (() => {
    const keys = Object.freeze({
        ROOM_CREATED: 'roomCreated',
        ROOM_JOINED: 'roomJoined',
        PLAYER_LIST: 'playerList',
        GAME_START: 'gameStart',
        GAME_ACTION: 'gameAction',
        ACTION_ACCEPTED: 'actionAccepted',
        REJOIN_DATA: 'rejoinData',
        HOSTLESS_COLLECT: 'hostlessCollect',
        HOSTLESS_CONFIRMATION: 'hostlessConfirmation',
        HOSTLESS_STATUS: 'hostlessStatus',
        HOSTLESS_APPROVED: 'hostlessApproved',
        PLAYER_REJOINED: 'playerRejoined',
        PLAYER_DISCONNECTED: 'playerDisconnected',
        HOST_CHANGED: 'hostChanged',
        CONNECT: 'connect',
        DISCONNECT: 'disconnect',
        CONNECT_ERROR: 'connectError',
        APP_ERROR: 'appError',
    });
    const order = Object.freeze(Object.values(keys));
    const staticEventNames = Object.freeze({
        [keys.ROOM_CREATED]: 'roomCreated',
        [keys.ROOM_JOINED]: 'roomJoined',
        [keys.PLAYER_LIST]: 'playerList',
        [keys.GAME_START]: 'gameStart',
        [keys.GAME_ACTION]: 'gameAction',
        [keys.ACTION_ACCEPTED]: 'actionAccepted',
        [keys.REJOIN_DATA]: 'rejoinData',
        [keys.PLAYER_REJOINED]: 'playerRejoined',
        [keys.PLAYER_DISCONNECTED]: 'playerDisconnected',
        [keys.HOST_CHANGED]: 'hostChanged',
        [keys.CONNECT]: 'connect',
        [keys.DISCONNECT]: 'disconnect',
        [keys.CONNECT_ERROR]: 'connect_error',
    });

    function eventNames(dynamicEvents = {}) {
        const names = Object.freeze({
            ...staticEventNames,
            [keys.HOSTLESS_COLLECT]: dynamicEvents.hostlessCollect,
            [keys.HOSTLESS_CONFIRMATION]: dynamicEvents.hostlessConfirmation,
            [keys.HOSTLESS_STATUS]: dynamicEvents.hostlessStatus,
            [keys.HOSTLESS_APPROVED]: dynamicEvents.hostlessApproved,
            [keys.APP_ERROR]: dynamicEvents.appError,
        });
        for (const key of order) {
            if (typeof names[key] !== 'string' || names[key].length === 0) {
                throw new TypeError(`${key} event name is required`);
            }
        }
        if (new Set(Object.values(names)).size !== order.length) {
            throw new TypeError('socket event names must be unique');
        }
        return names;
    }

    function createBinder(socket, dynamicEvents = {}) {
        if (!socket || typeof socket.on !== 'function') {
            throw new TypeError('socket.on is required');
        }
        const names = eventNames(dynamicEvents);
        let nextIndex = 0;
        return Object.freeze({
            eventNames: names,
            on(key, handler) {
                const expectedKey = order[nextIndex];
                if (key !== expectedKey) {
                    throw new Error(`socket event registration order mismatch: expected ${expectedKey || 'complete'}, got ${key}`);
                }
                if (typeof handler !== 'function') {
                    throw new TypeError(`${key} handler is required`);
                }
                socket.on(names[key], handler);
                nextIndex++;
                return handler;
            },
            assertComplete() {
                if (nextIndex !== order.length) {
                    throw new Error(`socket event registration incomplete: expected ${order[nextIndex]}`);
                }
                return true;
            },
        });
    }

    return Object.freeze({ keys, order, staticEventNames, eventNames, createBinder });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = OnlineSocketRegistry;
if (typeof window !== 'undefined') window.OnlineSocketRegistry = OnlineSocketRegistry;
if (typeof globalThis !== 'undefined') globalThis.OnlineSocketRegistry = OnlineSocketRegistry;
