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

    const CPU_STRONG_LARGE_CROWD_TUNING = Object.freeze({
        landmarkBias: 1.1,
        blueFactor: 1,
        redFactor: 1.15,
        greenFactor: 1,
        purpleFactor: 1.2,
        massAttackFactor: 1.15,
        airportBias: 1,
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

    function resolveLiveCpuOptions(difficulty, options = {}) {
        const resolved = resolveLiveExpertOptions(difficulty, options);
        if (difficulty === "strong") {
            if (!resolved.simulationMode) resolved.simulationMode = "realtime";
            if (!resolved.largeCrowdBuildMode) resolved.largeCrowdBuildMode = "normal";
            if (!resolved.largeCrowdRollMode) resolved.largeCrowdRollMode = "normal";
            const profileTunings = Object.assign({}, resolved.playerCountProfileTunings || {});
            profileTunings.largeCrowd = Object.assign(
                {},
                CPU_STRONG_LARGE_CROWD_TUNING,
                profileTunings.largeCrowd || {}
            );
            resolved.playerCountProfileTunings = profileTunings;
        }
        return resolved;
    }
    /**
     * @param {string} difficulty
     * @param {Record<string, any>} options
     * @returns {Readonly<Record<string, any>>}
     */
    function resolveCpuRuntimeConfig(difficulty, options = {}) {
        const presetName = options.expertPreset || "default";
        const expertDefaults = Object.assign(
            {},
            CPU_EXPERT_DEFAULT_OPTIONS,
            CPU_EXPERT_DEFAULT_OPTIONS.byPreset[presetName] || {}
        );
        const expertPreset = options.expertPreset || expertDefaults.expertPreset;
        const finiteOption = (key, fallback) => Number.isFinite(options[key])
            ? options[key]
            : fallback;
        const baseExpertTuning = Object.assign(
            {},
            CPU_EXPERT_PRESETS.default,
            CPU_EXPERT_PRESETS[expertPreset] || {},
            options.expertTuning || {}
        );
        return Object.freeze({
            difficulty,
            expertPurpose: options.expertPurpose || expertDefaults.expertPurpose,
            expertBehaviorFlags: Object.assign({
                crowdBuildLookahead: difficulty === "expert",
                futureLandmarkHold: difficulty === "expert",
                lookaheadLeaderStrongOnly: difficulty === "expert",
            }, options.expertBehaviorFlags || {}),
            simulationMode: options.simulationMode || (
                difficulty === "expert" && (options.expertPurpose || expertDefaults.expertPurpose) === "live"
                    ? expertDefaults.liveSimulationMode
                    : expertDefaults.simulationMode
            ),
            expertPreset,
            expertDiceMode: options.expertDiceMode || expertDefaults.expertDiceMode,
            expertRerollMode: options.expertRerollMode || expertDefaults.expertRerollMode,
            expertBuildMode: options.expertBuildMode || expertDefaults.expertBuildMode,
            expertInvestMode: options.expertInvestMode || expertDefaults.expertInvestMode,
            expertTvMode: options.expertTvMode || expertDefaults.expertTvMode,
            expertBusinessMode: options.expertBusinessMode || expertDefaults.expertBusinessMode,
            expertCleaningMode: options.expertCleaningMode || expertDefaults.expertCleaningMode,
            expertHarborMode: options.expertHarborMode || expertDefaults.expertHarborMode,
            expertHarborMargin: finiteOption('expertHarborMargin', 0),
            expertMoverMode: options.expertMoverMode || expertDefaults.expertMoverMode,
            expertRenovationMode: options.expertRenovationMode || expertDefaults.expertRenovationMode,
            expertRerollMargin: finiteOption('expertRerollMargin', 0),
            expertIncomeCapMode: options.expertIncomeCapMode || expertDefaults.expertIncomeCapMode,
            expertComboMode: options.expertComboMode || expertDefaults.expertComboMode,
            expertComboWeight: finiteOption('expertComboWeight', 0.35),
            expertBuildTempoWeight: finiteOption('expertBuildTempoWeight', 0),
            expertRollRiskMode: options.expertRollRiskMode || expertDefaults.expertRollRiskMode,
            expertRollRedRiskWeight: finiteOption('expertRollRedRiskWeight', 0),
            expertAirportSkipMode: options.expertAirportSkipMode || expertDefaults.expertAirportSkipMode,
            expertLandmarkCardMargin: finiteOption('expertLandmarkCardMargin', 25),
            expertLandmarkCardCompareMode: options.expertLandmarkCardCompareMode || expertDefaults.expertLandmarkCardCompareMode,
            expertLandmarkCardCompareTargets: options.expertLandmarkCardCompareTargets || expertDefaults.expertLandmarkCardCompareTargets,
            expertLandmarkCardPenaltyMode: options.expertLandmarkCardPenaltyMode || expertDefaults.expertLandmarkCardPenaltyMode,
            expertHarborLandmarkBaseBonus: finiteOption('expertHarborLandmarkBaseBonus', 2.5),
            expertLandmarkProgressRemaining: finiteOption('expertLandmarkProgressRemaining', 3),
            expertLandmarkCostWeight: finiteOption('expertLandmarkCostWeight', 0.12),
            expertTraceStats: options.expertTraceStats || null,
            expertOpponentDifficulties: Array.isArray(options.expertOpponentDifficulties)
                ? options.expertOpponentDifficulties.slice()
                : null,
            profileStats: options.profileStats || null,
            playerCountProfileTunings: Object.assign({}, options.playerCountProfileTunings || {}),
            largeCrowdBuildMode: options.largeCrowdBuildMode || "native",
            largeCrowdRollMode: options.largeCrowdRollMode || "native",
            expertProfilePresets: Object.assign({}, options.expertProfilePresets || {}),
            expertProfileTunings: Object.assign(
                {},
                difficulty === "expert" ? CPU_EXPERT_PROFILE_TUNINGS : {},
                options.expertProfileTunings || {}
            ),
            baseExpertTuning,
            activeExpertPreset: expertPreset,
            expertTuning: Object.assign({}, baseExpertTuning),
        });
    }

    function resolveExpertProfileTuning(options = {}) {
        const profilePreset = (options.profilePresets || {})[options.profile];
        const profileTuning = (options.profileTunings || {})[options.profile];
        const activePreset = profilePreset || options.expertPreset;
        const presetTuning = profilePreset
            ? Object.assign({}, CPU_EXPERT_PRESETS.default, CPU_EXPERT_PRESETS[profilePreset] || {})
            : {};
        const tuning = Object.assign(
            {},
            options.baseTuning || {},
            presetTuning,
            profileTuning || {}
        );
        if (options.simulationMode === "realtime") {
            tuning.lookaheadWeight = Number((tuning.lookaheadWeight * 0.12).toFixed(3));
            tuning.lateGameLookaheadStepsPerPlayer = Math.max(1, Math.round(tuning.lateGameLookaheadStepsPerPlayer * 0.2));
        }
        if (options.simulationMode === "fast" || options.simulationMode === "lite") {
            tuning.lookaheadWeight = Number((tuning.lookaheadWeight * 0.65).toFixed(3));
            tuning.lateGameLookaheadStepsPerPlayer = Math.max(2, Math.round(tuning.lateGameLookaheadStepsPerPlayer * 0.5));
        }
        if (options.simulationMode === "lite") {
            tuning.lookaheadWeight = Number((tuning.lookaheadWeight * 0.35).toFixed(3));
            tuning.lateGameLookaheadStepsPerPlayer = Math.max(1, Math.round(tuning.lateGameLookaheadStepsPerPlayer * 0.35));
        }
        return Object.freeze({ activePreset, tuning });
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
        largeCrowd: {
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
    global.CPU_STRONG_LARGE_CROWD_TUNING = CPU_STRONG_LARGE_CROWD_TUNING;
    global.CPU_EXPERT_PROFILE_TUNINGS = CPU_EXPERT_PROFILE_TUNINGS;
    global.resolveLiveExpertOptions = resolveLiveExpertOptions;
    global.resolveLiveCpuOptions = resolveLiveCpuOptions;
    /** @type {any} */ (global).resolveCpuRuntimeConfig = resolveCpuRuntimeConfig;
    /** @type {any} */ (global).resolveExpertProfileTuning = resolveExpertProfileTuning;

    if (typeof module !== "undefined" && module.exports) {
        module.exports = {
            CPU_EXPERT_DEFAULT_OPTIONS,
            CPU_EXPERT_PRESETS,
            CPU_STRONG_LARGE_CROWD_TUNING,
            CPU_EXPERT_PROFILE_TUNINGS,
            resolveLiveExpertOptions,
            resolveLiveCpuOptions,
            resolveCpuRuntimeConfig,
            resolveExpertProfileTuning,
        };
    }
})(typeof globalThis !== "undefined" ? globalThis : this);
