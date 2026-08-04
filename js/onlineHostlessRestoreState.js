'use strict';

const OnlineHostlessRestoreState = (() => {
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

    return Object.freeze({ createController });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = OnlineHostlessRestoreState;
