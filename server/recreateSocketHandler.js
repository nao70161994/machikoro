'use strict';

function registerRecreateSocketHandler(socket, dependencies = {}) {
    socket.on('recreateRoom', payload => {
        const decoded = dependencies.decodePayload(payload);
        if (!decoded || decoded.ok !== true) {
            dependencies.emitAppError(socket, '復元データが不完全です');
            return;
        }
        const result = dependencies.handleRecreateRoom(socket, decoded.value);
        if (result && result.ok) dependencies.hostRestored(result.roomId);
    });
}

module.exports = Object.freeze({ registerRecreateSocketHandler });
