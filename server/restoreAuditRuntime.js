'use strict';

function makeRestoreAuditRuntime({ getConfig, crypto }) {
    if (typeof getConfig !== 'function') {
        throw new TypeError('getConfig must be a function');
    }
    if (!crypto || typeof crypto !== 'object') {
        throw new TypeError('crypto must be an object');
    }

    function restoreAuditConfig() {
        return getConfig();
    }

    function restoreAuditSecret() {
        return restoreAuditConfig().activeSecret;
    }

    function restoreAuditBuildOptions(now, source) {
        const config = restoreAuditConfig();
        const options = {
            crypto,
            secret: config.activeSecret,
            keyId: config.activeKeyId,
            now,
        };
        if (source) options.source = source;
        return options;
    }

    function restoreAuditVerificationOptions(roomId) {
        const config = restoreAuditConfig();
        return {
            roomId,
            crypto,
            keyring: config.keys,
            maxAgeMs: config.maxAgeMs,
            clockSkewMs: config.clockSkewMs,
        };
    }

    return {
        restoreAuditConfig,
        restoreAuditSecret,
        restoreAuditBuildOptions,
        restoreAuditVerificationOptions,
    };
}

module.exports = makeRestoreAuditRuntime;
