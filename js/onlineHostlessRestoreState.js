'use strict';

const OnlineHostlessRestoreState = (() => {
    const statusDispositions = Object.freeze({
        IGNORE: 'ignore',
        PROGRESS: 'progress',
        RESTORED: 'restored',
        RETRYABLE: 'retryable',
        FAILED: 'failed',
    });
    const statusReasons = Object.freeze({
        WAITING_FOR_HOST: 'waiting-for-host',
        QUORUM_READY: 'quorum-ready',
        HOST_RESTORED: 'host-restored',
        START_RATE_LIMIT: 'start-rate-limit',
        SESSION_LIMIT: 'session-limit',
    });

    function statusDisposition(reason, stage = '') {
        if (typeof reason !== 'string' || reason === '') return statusDispositions.IGNORE;
        if (reason === statusReasons.HOST_RESTORED) return statusDispositions.RESTORED;
        if (reason === statusReasons.WAITING_FOR_HOST ||
                (reason === statusReasons.QUORUM_READY && stage === 'confirming')) {
            return statusDispositions.PROGRESS;
        }
        if (reason === statusReasons.START_RATE_LIMIT || reason === statusReasons.SESSION_LIMIT) {
            return statusDispositions.RETRYABLE;
        }
        return statusDispositions.FAILED;
    }

    function createController(initialPending = false) {
        let pending = initialPending === true;

        function isPending() {
            return pending;
        }

        function setPending(value) {
            pending = value === true;
            return pending;
        }

        function tryBegin(socketConnected) {
            if (socketConnected !== true || pending) return false;
            pending = true;
            return true;
        }

        function clear() {
            pending = false;
        }

        function snapshot() {
            return Object.freeze({ pending });
        }

        return Object.freeze({ isPending, setPending, tryBegin, clear, snapshot });
    }

    return Object.freeze({
        statusDispositions,
        statusReasons,
        statusDisposition,
        createController,
    });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = OnlineHostlessRestoreState;
