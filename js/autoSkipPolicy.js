'use strict';

const AutoSkipPolicy = (() => {
    function createScheduleController() {
        let pending = false;
        let timer = null;

        function isPending() { return pending; }
        function getTimer() { return timer; }
        function begin() {
            if (pending) return false;
            pending = true;
            return true;
        }
        function setTimer(value) { timer = value; }
        function finish() {
            pending = false;
            timer = null;
        }
        function snapshot() {
            return Object.freeze({ pending, hasTimer: timer !== null });
        }

        return Object.freeze({ isPending, getTimer, begin, setTimer, finish, snapshot });
    }

    function buildAvailability(options) {
        const {
            cards,
            current,
            shopStock,
            getStockCount,
            enabledLandmarks,
            yakushoName,
            landmarkCost,
        } = options;

        const canAffordCard = cards.some(card =>
            getStockCount(shopStock, card) > 0 &&
            current.coins >= card.cost &&
            !(card.color === 'purple' && current.countCardIncludingDormant(card.name) > 0)
        );
        const canAffordLandmark = Object.entries(current.landmarks)
            .some(([name, built]) =>
                enabledLandmarks.has(name) &&
                !built &&
                name !== yakushoName &&
                current.coins >= landmarkCost(name)
            );

        return Object.freeze({
            canAffordCard,
            canAffordLandmark,
            canAffordAny: canAffordCard || canAffordLandmark,
        });
    }

    return Object.freeze({ createScheduleController, buildAvailability });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = AutoSkipPolicy;
if (typeof window !== 'undefined') window.AutoSkipPolicy = AutoSkipPolicy;
if (typeof globalThis !== 'undefined') globalThis.AutoSkipPolicy = AutoSkipPolicy;
