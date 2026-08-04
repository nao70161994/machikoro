'use strict';

const OnlineSetupState = (() => {
    function createController(initial = {}) {
        let selectedCount = initial.selectedCount == null ? 2 : initial.selectedCount;
        let playerSettings = Array.from(initial.playerSettings || []);
        let cpuSpeed = initial.cpuSpeed == null ? 1500 : initial.cpuSpeed;

        function snapshot() {
            return Object.freeze({
                selectedCount,
                playerSettings: Object.freeze(playerSettings.slice()),
                cpuSpeed,
            });
        }

        function changeCount(delta) {
            selectedCount = Math.min(10, Math.max(2, selectedCount + delta));
            return snapshot();
        }

        function setSelectedCount(value) {
            selectedCount = value;
            return snapshot();
        }

        function replaceSettings(values) {
            playerSettings = Array.from(values || []);
            return snapshot();
        }

        function updateSetting(index, value) {
            playerSettings[index] = value;
            return snapshot();
        }

        function setCpuSpeed(value) {
            cpuSpeed = value;
            return snapshot();
        }

        return Object.freeze({ snapshot, changeCount, setSelectedCount, replaceSettings, updateSetting, setCpuSpeed });
    }

    return Object.freeze({ createController });
})();

if (typeof module !== 'undefined' && module.exports) module.exports = OnlineSetupState;
if (typeof window !== 'undefined') Object.assign(window, { OnlineSetupState });
if (typeof globalThis !== 'undefined') globalThis.OnlineSetupState = OnlineSetupState;
