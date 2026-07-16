'use strict';

const CPUProfile = Object.freeze({
    finiteOption(options, key, fallback) {
        return Number.isFinite(options && options[key]) ? options[key] : fallback;
    },

    playerCountProfile(playerCount) {
        if (playerCount >= 4) {
            return {
                landmarkBias: 1.12,
                blueFactor: 1.28,
                redFactor: 0.92,
                greenFactor: 1.18,
                purpleFactor: 0.82,
                massAttackFactor: 0.95,
                airportBias: 0.9,
            };
        }
        if (playerCount === 3) {
            return {
                landmarkBias: 1,
                blueFactor: 1.05,
                redFactor: 1.08,
                greenFactor: 1,
                purpleFactor: 1.05,
                massAttackFactor: 1.08,
                airportBias: 1,
            };
        }
        return {
            landmarkBias: 1,
            blueFactor: 1,
            redFactor: 1,
            greenFactor: 1,
            purpleFactor: 1,
            massAttackFactor: 1,
            airportBias: 1,
        };
    },

    expertProfileName(playerCount) {
        if (!Number.isInteger(playerCount)) return 'crowd';
        if (playerCount <= 2) return 'duel';
        if (playerCount === 3) return 'trio';
        return 'crowd';
    },
});

if (typeof module !== 'undefined' && module.exports) module.exports = { CPUProfile };
if (typeof window !== 'undefined') window.CPUProfile = CPUProfile;
if (typeof globalThis !== 'undefined') globalThis.CPUProfile = CPUProfile;
