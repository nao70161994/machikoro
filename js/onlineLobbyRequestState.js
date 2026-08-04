'use strict';

const OnlineLobbyRequestState = (() => {
    const kinds = Object.freeze({
        CREATE: 'create',
        JOIN: 'join',
    });

    function createController() {
        let createPending = false;
        let joinPending = false;
        let kind = '';
        let generation = 0;
        /** @type {*} */
        let timer = null;

        function snapshot() {
            return Object.freeze({
                createPending,
                joinPending,
                kind,
                generation,
                timerAttached: timer !== null,
            });
        }

        function setCreatePending(value) {
            createPending = value === true;
            return snapshot();
        }

        function setJoinPending(value) {
            joinPending = value === true;
            return snapshot();
        }

        function begin(nextKind) {
            if (nextKind !== kinds.CREATE && nextKind !== kinds.JOIN) {
                throw new TypeError('unknown online lobby request kind');
            }
            const replacedTimer = timer;
            generation += 2;
            timer = null;
            kind = nextKind;
            createPending = nextKind === kinds.CREATE;
            joinPending = nextKind === kinds.JOIN;
            return Object.freeze({
                generation,
                replacedTimer,
                state: snapshot(),
            });
        }

        function attachTimer(expectedKind, expectedGeneration, nextTimer) {
            if (!isCurrent(expectedKind, expectedGeneration)) return false;
            timer = nextTimer;
            return true;
        }

        function isCurrent(expectedKind, expectedGeneration) {
            return kind === expectedKind && generation === expectedGeneration;
        }

        function finish(expectedKind = '') {
            if (expectedKind && kind && expectedKind !== kind) {
                return Object.freeze({ finished: false, timer: null, state: snapshot() });
            }
            const previousTimer = timer;
            generation++;
            timer = null;
            kind = '';
            createPending = false;
            joinPending = false;
            return Object.freeze({ finished: true, timer: previousTimer, state: snapshot() });
        }

        return Object.freeze({
            snapshot,
            setCreatePending,
            setJoinPending,
            begin,
            attachTimer,
            isCurrent,
            finish,
        });
    }

    return Object.freeze({ kinds, createController });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = OnlineLobbyRequestState;
