'use strict';

const OnlinePayload = Object.freeze({
    buildRejoin(session, clientVersion) {
        return {
            roomId: session && session.roomId,
            playerIndex: session && session.playerIndex,
            playerName: session && session.playerName,
            reconnectToken: session && session.reconnectToken,
            clientVersion,
        };
    },
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { OnlinePayload };
}
