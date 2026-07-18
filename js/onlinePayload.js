'use strict';

const ONLINE_HOSTLESS_RESTORE_SCHEMA_VERSION = 1;

const OnlinePayload = Object.freeze({
    buildRejoin(session, clientVersion) {
        return {
            roomId: session && session.roomId,
            playerIndex: session && session.playerIndex,
            playerName: session && session.playerName,
            reconnectToken: session && session.reconnectToken,
            clientVersion,
            hostlessRestoreVersion: ONLINE_HOSTLESS_RESTORE_SCHEMA_VERSION,
        };
    },
    hostlessRestoreVersion: ONLINE_HOSTLESS_RESTORE_SCHEMA_VERSION,
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { OnlinePayload, ONLINE_HOSTLESS_RESTORE_SCHEMA_VERSION };
}
