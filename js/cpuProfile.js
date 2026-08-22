'use strict';

const CPUProfile = Object.freeze({
    finiteOption(options, key, fallback) {
        return Number.isFinite(options && options[key]) ? options[key] : fallback;
    },

    largeCrowdMode(playerCount, mode) {
        return Number.isInteger(playerCount) && playerCount >= 8 && typeof mode === 'string'
            ? mode
            : 'native';
    },

    expertUsesStrongCrowdPolicy(playerCount) {
        // Paired live evaluation shows the crowd heuristic removes the 4/5-player expert inversion.
        return playerCount === 4 || playerCount === 5;
    },

    strongUsesNormalTrioPolicy(playerCount) {
        // Paired live evaluation shows the normal core removes the 3-player strong inversion.
        return playerCount === 3;
    },

    playerCountProfileName(playerCount) {
        if (Number.isInteger(playerCount) && playerCount >= 8) return 'largeCrowd';
        if (Number.isInteger(playerCount) && playerCount >= 4) return 'crowd';
        if (playerCount === 3) return 'trio';
        return 'duel';
    },

    playerCountProfile(playerCount, profileTunings = {}) {
        let profile;
        if (playerCount >= 4) {
            profile = {
                landmarkBias: 1.12,
                blueFactor: 1.28,
                redFactor: 0.92,
                greenFactor: 1.18,
                purpleFactor: 0.82,
                massAttackFactor: 0.95,
                airportBias: 0.9,
            };
        } else if (playerCount === 3) {
            profile = {
                landmarkBias: 1,
                blueFactor: 1.05,
                redFactor: 1.08,
                greenFactor: 1,
                purpleFactor: 1.05,
                massAttackFactor: 1.08,
                airportBias: 1,
            };
        } else {
            profile = {
                landmarkBias: 1,
                blueFactor: 1,
                redFactor: 1,
                greenFactor: 1,
                purpleFactor: 1,
                massAttackFactor: 1,
                airportBias: 1,
            };
        }
        const name = CPUProfile.playerCountProfileName(playerCount);
        return Object.assign({}, profile, profileTunings[name] || {});
    },

    expertProfileName(playerCount) {
        if (!Number.isInteger(playerCount)) return 'crowd';
        if (playerCount <= 2) return 'duel';
        if (playerCount === 3) return 'trio';
        if (playerCount >= 8) return 'largeCrowd';
        return 'crowd';
    },
});

if (typeof module !== 'undefined' && module.exports) module.exports = { CPUProfile };
if (typeof window !== 'undefined') window.CPUProfile = CPUProfile;
if (typeof globalThis !== 'undefined') globalThis.CPUProfile = CPUProfile;
