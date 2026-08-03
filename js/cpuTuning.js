(function (global) {
    function freezeEntries(entries) {
        for (const value of Object.values(entries)) {
            if (value && typeof value === "object") Object.freeze(value);
        }
        return Object.freeze(entries);
    }

    const CPU_EXPERT_DEFAULT_OPTIONS = Object.freeze({
        expertPurpose: "training",
        simulationMode: "full",
        liveSimulationMode: "realtime",
        expertPreset: "default",
        expertDiceMode: "ev",
        expertRerollMode: "random",
        expertBuildMode: "ev",
        expertInvestMode: "always",
        expertTvMode: "simple",
        expertBusinessMode: "simple",
        expertCleaningMode: "simple",
        expertHarborMode: "simple",
        expertMoverMode: "random",
        expertRenovationMode: "random",
        expertIncomeCapMode: "none",
        expertComboMode: "none",
        expertRollRiskMode: "none",
        expertAirportSkipMode: "none",
        expertLandmarkCardCompareMode: "base",
        expertLandmarkCardCompareTargets: "harborMall",
        expertLandmarkCardPenaltyMode: "none",
        byPreset: Object.freeze({
            v2simple: Object.freeze({
                expertBusinessMode: "simple",
                expertAirportSkipMode: "whenNoLandmark",
            }),
        }),
    });

    const CPU_EXPERT_PRESETS = freezeEntries({
        default: {
            coinWeight: 1.1,
            turnWeight: 3.2,
            landmarkWeight: 14,
            builtLandmarkWeight: 8,
            landmarkReachWeight: 6,
            stableIncomeWeight: 1.4,
            redPressureWeight: 1.1,
            leaderThreatWeight: 1.3,
            lateCoinWeight: 1.6,
            finalCoinWeight: 2.2,
            lateProgressBonus: 8,
            lowValueSpamThreshold: 4,
            lowValueSpamPenalty: 6,
            landmarkActionBonus: 24,
            lateLandmarkActionBonus: 18,
            skipAirportBonus: 10,
            skipPenalty: 8,
            winLookaheadBonus: 5000,
            loseLookaheadPenalty: 3000,
            lookaheadWeight: 0.7,
            lateGameLookaheadStepsPerPlayer: 6,
        },
        refined: {
            lateCoinWeight: 1.44,
            skipPenalty: 10,
        },
        rush: {
            coinWeight: 1.25,
            turnWeight: 3.1,
            landmarkWeight: 16,
            builtLandmarkWeight: 9,
            landmarkReachWeight: 7,
            stableIncomeWeight: 1.1,
            redPressureWeight: 1.2,
            leaderThreatWeight: 1.45,
            lateCoinWeight: 2.0,
            finalCoinWeight: 2.8,
            lateProgressBonus: 10,
            lowValueSpamThreshold: 3,
            lowValueSpamPenalty: 8,
            landmarkActionBonus: 30,
            lateLandmarkActionBonus: 26,
            skipAirportBonus: 8,
            skipPenalty: 12,
            winLookaheadBonus: 6000,
            loseLookaheadPenalty: 3200,
            lookaheadWeight: 0.75,
            lateGameLookaheadStepsPerPlayer: 6,
        },
        economy: {
            coinWeight: 1.3,
            turnWeight: 3.5,
            landmarkWeight: 13,
            builtLandmarkWeight: 7,
            landmarkReachWeight: 5,
            stableIncomeWeight: 1.7,
            redPressureWeight: 0.8,
            leaderThreatWeight: 1.1,
            lateCoinWeight: 1.4,
            finalCoinWeight: 2.0,
            lateProgressBonus: 6,
            lowValueSpamThreshold: 5,
            lowValueSpamPenalty: 4,
            landmarkActionBonus: 20,
            lateLandmarkActionBonus: 12,
            skipAirportBonus: 14,
            skipPenalty: 6,
            winLookaheadBonus: 4800,
            loseLookaheadPenalty: 2800,
            lookaheadWeight: 0.65,
            lateGameLookaheadStepsPerPlayer: 7,
        },
        v2simple: {},
    });


    /**
     * @param {string} difficulty
     * @param {Record<string, any>} options
     * @returns {Record<string, any>}
     */
    function resolveLiveExpertOptions(difficulty, options = {}) {
        const resolved = Object.assign({}, options);
        if (difficulty !== "expert" || resolved.expertPurpose !== "live") return resolved;
        if (!resolved.expertPreset) resolved.expertPreset = "v2simple";
        if (resolved.expertPreset !== "v2simple") return resolved;
        if (!resolved.expertDiceMode) resolved.expertDiceMode = "strongCrowdThreshold";
        if (!resolved.expertRerollMode) resolved.expertRerollMode = "simple";
        if (!resolved.expertBuildMode) resolved.expertBuildMode = "ev";
        if (!resolved.expertInvestMode) resolved.expertInvestMode = "always";
        if (!resolved.expertTvMode) resolved.expertTvMode = "simple";
        if (!resolved.expertBusinessMode) resolved.expertBusinessMode = "simple";
        if (!resolved.expertCleaningMode) resolved.expertCleaningMode = "simple";
        if (!resolved.expertHarborMode) resolved.expertHarborMode = "simple";
        if (!resolved.expertMoverMode) resolved.expertMoverMode = "simple";
        if (!resolved.expertRenovationMode) resolved.expertRenovationMode = "simple";
        if (!resolved.expertComboMode) resolved.expertComboMode = "core";
        if (!Number.isFinite(resolved.expertBuildTempoWeight)) resolved.expertBuildTempoWeight = 0.03;
        if (!resolved.expertAirportSkipMode) resolved.expertAirportSkipMode = "whenNoLandmark";
        return resolved;
    }
    const CPU_EXPERT_PROFILE_TUNINGS = freezeEntries({
        duel: {
            lowValueSpamPenalty: 5.1,
        },
        trio: {
            coinWeight: 1.16,
            turnWeight: 3.28,
            stableIncomeWeight: 2.15,
            redPressureWeight: 0.72,
            leaderThreatWeight: 0.82,
            landmarkActionBonus: 21,
            lateLandmarkActionBonus: 16,
            lookaheadWeight: 0.52,
            lowValueSpamPenalty: 5.6,
        },
        crowd: {
            coinWeight: 1.22,
            turnWeight: 3.35,
            stableIncomeWeight: 3.4,
            redPressureWeight: 0.14,
            leaderThreatWeight: 0.08,
            lateCoinWeight: 2.05,
            finalCoinWeight: 2.55,
            landmarkActionBonus: 18,
            lateLandmarkActionBonus: 14,
            lookaheadWeight: 0.28,
        },
    });

    global.CPU_EXPERT_DEFAULT_OPTIONS = CPU_EXPERT_DEFAULT_OPTIONS;
    global.CPU_EXPERT_PRESETS = CPU_EXPERT_PRESETS;
    global.CPU_EXPERT_PROFILE_TUNINGS = CPU_EXPERT_PROFILE_TUNINGS;
    global.resolveLiveExpertOptions = resolveLiveExpertOptions;

    if (typeof module !== "undefined" && module.exports) {
        module.exports = {
            CPU_EXPERT_DEFAULT_OPTIONS,
            CPU_EXPERT_PRESETS,
            CPU_EXPERT_PROFILE_TUNINGS,
            resolveLiveExpertOptions,
        };
    }
})(typeof globalThis !== "undefined" ? globalThis : this);
