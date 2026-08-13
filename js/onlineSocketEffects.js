'use strict';

const OnlineSocketEffects = (() => {
    const events = Object.freeze({
        createRoom: 'createRoom',
        gameAction: 'gameAction',
        joinRoom: 'joinRoom',
        recreateRoom: 'recreateRoom',
        rejoinRoom: 'rejoinRoom',
        requestOnlineRematch: 'requestOnlineRematch',
    });

    function createRuntime(options = {}) {
        const getSocket = typeof options.getSocket === 'function' ? options.getSocket : () => null;
        const hostlessEvents = options.hostlessEvents || {};

        function emit(event, payload, socketOverride = null) {
            const socket = socketOverride || getSocket();
            if (!socket || typeof socket.emit !== 'function') {
                throw new TypeError(`Socket emit unavailable for ${event}`);
            }
            socket.emit(event, payload);
            return true;
        }

        function hostlessEvent(name) {
            const event = hostlessEvents[name];
            if (typeof event !== 'string' || !event) {
                throw new TypeError(`hostless event ${name} is unavailable`);
            }
            return event;
        }

        return Object.freeze({
            confirmHostlessRestore: (payload, socket) => emit(hostlessEvent('CONFIRM'), payload, socket),
            createRoom: payload => emit(events.createRoom, payload),
            gameAction: (payload, socket = null) => emit(events.gameAction, payload, socket),
            joinRoom: payload => emit(events.joinRoom, payload),
            recreateRoom: payload => emit(events.recreateRoom, payload),
            rejoinRoom: payload => emit(events.rejoinRoom, payload),
            requestOnlineRematch: (payload = {}, socket = null) =>
                emit(events.requestOnlineRematch, payload, socket),
            requestHostlessRestore: (payload, socket = null) => emit(hostlessEvent('REQUEST'), payload, socket),
            submitHostlessRestoreCandidate: (payload, socket = null) => emit(hostlessEvent('CANDIDATE'), payload, socket),
        });
    }

    return Object.freeze({ createRuntime, events });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = OnlineSocketEffects;
if (typeof window !== 'undefined') window.OnlineSocketEffects = OnlineSocketEffects;
if (typeof globalThis !== 'undefined') globalThis.OnlineSocketEffects = OnlineSocketEffects;
