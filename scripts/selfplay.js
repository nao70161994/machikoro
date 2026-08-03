const fs = require('fs');
const path = require('path');
const vm = require('vm');

const { integerOrDefault, parseIntegerOrDefault } = require(path.join(__dirname, 'cli-args.js'));

function loadRuntime(options = {}) {
    const context = {
        console,
        setTimeout,
        clearTimeout,
        Math: Object.create(Math),
    };
    vm.createContext(context);
    const runtimeFiles = ['js/Card.js', 'js/Player.js', 'js/actionContract.js', 'js/gameSchemaNegotiation.js', 'js/gameSnapshot.js', 'js/gameSchemaCodec.js', 'js/gameEngine.js', 'js/pendingActionQueue.js', 'js/GameManager.js', 'js/cpuTuning.js', 'js/cpuProfile.js', 'js/cpuSelection.js', 'js/cpuDiagnostics.js', 'js/cpuEvaluationCache.js', 'js/cpuEvaluation.js', 'js/cpuLegalMoves.js', 'js/cpuBusinessMoves.js', 'js/cpuActionProposal.js', 'js/cpuBuildExecution.js', 'js/cpuSimulation.js', 'js/cpuPendingResolution.js', 'js/CPU.js'];
    if (options.includeRL !== false) runtimeFiles.push('js/RLCPU.js');
    for (const file of runtimeFiles) {
        const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
        vm.runInContext(source, context, { filename: file });
    }
    if (options.includeRL !== false) {
        vm.runInContext(
            'this.CPU = CPU; this.CPUPendingResolution = CPUPendingResolution; this.CPUEvaluationCache = CPUEvaluationCache; this.CPU_EVALUATION_CACHE_LIMIT = CPU_EVALUATION_CACHE_LIMIT; this.RLCPU = RLCPU; this.GameManager = GameManager; this.CARDS = CARDS; this.Player = Player; this.GAME_PHASES = GAME_PHASES; this.LANDMARK_NAMES = LANDMARK_NAMES;',
            context
        );
    } else {
        vm.runInContext(
            'this.CPU = CPU; this.CPUEvaluationCache = CPUEvaluationCache; this.CPU_EVALUATION_CACHE_LIMIT = CPU_EVALUATION_CACHE_LIMIT; this.GameManager = GameManager; this.CARDS = CARDS; this.Player = Player; this.GAME_PHASES = GAME_PHASES; this.LANDMARK_NAMES = LANDMARK_NAMES;',
            context
        );
    }
    return context;
}

function createRng(seed) {
    let state = seed >>> 0;
    return () => {
        state = (state * 1664525 + 1013904223) >>> 0;
        return state / 0x100000000;
    };
}

function randomDie(rng, rollQueue = null) {
    if (Array.isArray(rollQueue) && rollQueue.length > 0) {
        const value = rollQueue.shift();
        if (Number.isFinite(value)) return value;
    }
    return Math.floor(rng() * 6) + 1;
}

function shouldProvideTunaDice(runtime, game, dice) {
    if (!game || !Number.isFinite(dice)) return false;
    return game.players.some(player =>
        player.landmarks?.[runtime.LANDMARK_NAMES.HARBOR] &&
        player.cards.some(card =>
            !player.isDormant(card) &&
            card.effect === 'tuna' &&
            card.diceNums.includes(dice)
        )
    );
}

function makeTunaDiceForRoll(runtime, game, dice, rng, rollQueue = null) {
    return shouldProvideTunaDice(runtime, game, dice)
        ? [randomDie(rng, rollQueue), randomDie(rng, rollQueue)]
        : null;
}

function shouldDeferIncomeForRoll(runtime, game, dice, useTwo = false) {
    const current = game.currentPlayer();
    if (current.landmarks?.[runtime.LANDMARK_NAMES.RADIO_TOWER] && !game.usedReroll) return true;
    return !!(useTwo && current.landmarks?.[runtime.LANDMARK_NAMES.HARBOR] && dice >= 10);
}

function makeImmediateTunaDiceForRoll(runtime, game, dice, useTwo, rng, rollQueue = null) {
    return shouldDeferIncomeForRoll(runtime, game, dice, useTwo)
        ? null
        : makeTunaDiceForRoll(runtime, game, dice, rng, rollQueue);
}

function makeImmediateTunaDiceForKeep(runtime, game, rng, rollQueue = null) {
    const useTwo = game.lastDice2 > 0;
    if (useTwo && game.currentPlayer().landmarks?.[runtime.LANDMARK_NAMES.HARBOR] && game.lastDiceResult >= 10) {
        return null;
    }
    return makeTunaDiceForRoll(runtime, game, game.lastDiceResult, rng, rollQueue);
}

function createShopStock(cards, playerCount = 2, runtime = null) {
    const stock = {};
    for (const card of cards) {
        stock[card.name] = runtime && typeof runtime.getInitialCardStock === 'function'
            ? runtime.getInitialCardStock(card, playerCount)
            : (card.color === 'purple' ? Math.max(0, Math.floor(Number(playerCount) || 0)) : 6);
    }
    return stock;
}

function resolveSelfplayDifficulties(difficulties) {
    return difficulties.slice();
}

function createPlayers(runtime, difficulties, options = {}) {
    const resolvedDifficulties = resolveSelfplayDifficulties(difficulties);
    return resolvedDifficulties.map(difficulty => {
        if (difficulty === 'rl') {
            if (!options.rlModelData || !runtime.RLCPU) {
                throw new Error('rlModelData is required when using rl difficulty');
            }
            if (resolvedDifficulties.length >= 3 && Number(options.rlModelData.stateDim) === 145) {
                throw new Error('2-player RL model cannot be used for 3+ player selfplay');
            }
            return new runtime.RLCPU(options.rlModelData);
        }
        if (difficulty !== 'expert') {
            return new runtime.CPU(difficulty, {
                profileStats: options.profileStats,
            });
        }
        return new runtime.CPU(difficulty, {
            expertPurpose: options.expertPurpose || 'training',
            simulationMode: options.lite ? 'lite' : (options.fast ? 'fast' : 'full'),
            profileStats: options.profileStats,
            expertPreset: options.expertPreset,
            expertDiceMode: options.expertDiceMode,
            expertRerollMode: options.expertRerollMode,
            expertRerollMargin: options.expertRerollMargin,
            expertBuildMode: options.expertBuildMode,
            expertInvestMode: options.expertInvestMode,
            expertTvMode: options.expertTvMode,
            expertBusinessMode: options.expertBusinessMode,
            expertCleaningMode: options.expertCleaningMode,
            expertHarborMode: options.expertHarborMode,
            expertHarborMargin: options.expertHarborMargin,
            expertMoverMode: options.expertMoverMode,
            expertRenovationMode: options.expertRenovationMode,
            expertIncomeCapMode: options.expertIncomeCapMode,
            expertComboMode: options.expertComboMode,
            expertComboWeight: options.expertComboWeight,
            expertBuildTempoWeight: options.expertBuildTempoWeight,
            expertRollRiskMode: options.expertRollRiskMode,
            expertRollRedRiskWeight: options.expertRollRedRiskWeight,
            expertAirportSkipMode: options.expertAirportSkipMode,
            expertLandmarkCardMargin: options.expertLandmarkCardMargin,
            expertLandmarkCardCompareMode: options.expertLandmarkCardCompareMode,
            expertLandmarkCardCompareTargets: options.expertLandmarkCardCompareTargets,
            expertLandmarkCardPenaltyMode: options.expertLandmarkCardPenaltyMode,
            expertHarborLandmarkBaseBonus: options.expertHarborLandmarkBaseBonus,
            expertLandmarkProgressRemaining: options.expertLandmarkProgressRemaining,
            expertLandmarkCostWeight: options.expertLandmarkCostWeight,
            expertOpponentDifficulties: resolvedDifficulties,
            expertTraceStats: options.expertTraceStats,
            expertTuning: options.expertTuning,
            expertBehaviorFlags: options.expertBehaviorFlags,
            expertProfilePresets: options.expertProfilePresets,
            expertProfileTunings: options.expertProfileTunings,
        });
    });
}

function createMaskHelper(runtime, selectedBusinessTargetIndex = null) {
    const helper = {
        _currentAndOpponent: runtime.RLCPU.prototype._currentAndOpponent,
        _selectOpponentIndex: runtime.RLCPU.prototype._selectOpponentIndex,
        _playerThreatScore: runtime.RLCPU.prototype._playerThreatScore,
        _cardCounts: runtime.RLCPU.prototype._cardCounts,
        _dormantCounts: runtime.RLCPU.prototype._dormantCounts,
        _businessActionMaskForTarget: runtime.RLCPU.prototype._businessActionMaskForTarget,
        _businessActionMaskForTargets: runtime.RLCPU.prototype._businessActionMaskForTargets,
    };
    if (Number.isInteger(selectedBusinessTargetIndex)) {
        helper._businessActionMaskForTargets = function(game) {
            return runtime.RLCPU.prototype._businessActionMaskForTargets.call(this, game, [selectedBusinessTargetIndex]);
        };
    }
    return helper;
}

function actionToLabel(runtime, action) {
    const actions = runtime.RLCPU.ACTIONS;
    if (action === actions.ROLL1) return 'ROLL1';
    if (action === actions.ROLL2) return 'ROLL2';
    if (action === actions.KEEP) return 'KEEP';
    if (action === actions.REROLL) return 'REROLL';
    if (action === actions.HARBOR_YES) return 'HARBOR_YES';
    if (action === actions.HARBOR_NO) return 'HARBOR_NO';
    if (action === actions.IT_SAVE) return 'IT_SAVE';
    if (action === actions.IT_SKIP) return 'IT_SKIP';
    if (action === actions.TV_TARGET) return 'TV_TARGET';
    if (action >= actions.BC_BASE && action < actions.BC_BASE + actions.BC_SIZE) {
        const combo = action - actions.BC_BASE;
        const giveIndex = Math.floor(combo / runtime.CARDS.length);
        const takeIndex = combo % runtime.CARDS.length;
        return `BUSINESS:${runtime.CARDS[giveIndex].name}->${runtime.CARDS[takeIndex].name}`;
    }
    if (action >= actions.CLEAN_BASE && action < actions.CLEAN_BASE + runtime.CARDS.length) {
        return `CLEAN:${runtime.CARDS[action - actions.CLEAN_BASE].name}`;
    }
    if (action >= actions.MOVER_BASE && action < actions.MOVER_BASE + runtime.CARDS.length) {
        return `MOVER:${runtime.CARDS[action - actions.MOVER_BASE].name}`;
    }
    if (action >= actions.RENO_BASE && action < actions.RENO_BASE + runtime.RLCPU.LANDMARK_ORDER.length) {
        return `RENO:${runtime.RLCPU.LANDMARK_ORDER[action - actions.RENO_BASE]}`;
    }
    if (action >= actions.BUY_CARD_BASE && action < actions.BUY_CARD_BASE + runtime.CARDS.length) {
        return `BUY_CARD:${runtime.CARDS[action - actions.BUY_CARD_BASE].name}`;
    }
    if (action >= actions.BUY_LM_BASE && action < actions.BUY_LM_BASE + runtime.RLCPU.LANDMARK_ORDER.length) {
        return `BUY_LM:${runtime.RLCPU.LANDMARK_ORDER[action - actions.BUY_LM_BASE]}`;
    }
    if (action === actions.PASS) return 'PASS';
    return `ACTION:${action}`;
}

function listLegalActions(runtime, game, shopStock, cpu = null) {
    let selectedBusinessTargetIndex = null;
    if (runtime.RLCPU && cpu instanceof runtime.RLCPU && game.phase === runtime.GAME_PHASES.PENDING && game.pendingBusiness > 0 &&
            typeof cpu._targetLayerForKind === 'function' && cpu._targetLayerForKind('business') && cpu.numTargetSlots > 0) {
        selectedBusinessTargetIndex = cpu._selectTargetIndex(game, 'business');
    }
    const helper = createMaskHelper(runtime, selectedBusinessTargetIndex);
    const mask = runtime.RLCPU.prototype.actionMask.call(helper, game, shopStock);
    const legalActions = [];
    for (let i = 0; i < mask.length; i++) {
        if (mask[i] > 0) {
            legalActions.push({ action: i, label: actionToLabel(runtime, i) });
        }
    }
    return legalActions;
}

function summarizeTraceState(runtimeOrGame, gameOrShopStock, maybeShopStock) {
    const hasRuntime = runtimeOrGame && runtimeOrGame.GameManager;
    const runtime = hasRuntime ? runtimeOrGame : null;
    const game = hasRuntime ? gameOrShopStock : runtimeOrGame;
    const shopStock = hasRuntime ? maybeShopStock : gameOrShopStock;
    return {
        currentPlayerIndex: game.currentPlayerIndex,
        phase: game.phase,
        turnCount: game.turnCount,
        lastDiceResult: game.lastDiceResult || 0,
        lastDice1: game.lastDice1 || 0,
        lastDice2: game.lastDice2 || 0,
        pendingTV: game.pendingTV || 0,
        pendingBusiness: game.pendingBusiness || 0,
        pendingCleaning: game.pendingCleaning || 0,
        pendingMover: game.pendingMover || 0,
        pendingRenovation: game.pendingRenovation || 0,
        pendingActions: (runtime && runtime.GameManager && typeof runtime.GameManager.serializedPendingActionsFor === 'function')
            ? runtime.GameManager.serializedPendingActionsFor(game)
            : [],
        pendingIT: !!game.pendingIT,
        usedReroll: !!game.usedReroll,
        builtThisTurn: !!game.builtThisTurn,
        shopStock: shopStock ? Object.fromEntries(Object.entries(shopStock).filter(([, count]) => count !== 6)) : {},
        players: game.players.map(player => ({
            coins: player.coins,
            itVentureCoins: player.itVentureCoins || 0,
            landmarks: Object.fromEntries(Object.entries(player.landmarks).filter(([, built]) => built).map(([name]) => [name, true])),
            cards: player.cards.reduce((counts, card) => {
                counts[card.name] = (counts[card.name] || 0) + 1;
                return counts;
            }, {}),
            dormantCards: player.dormantCards.reduce((counts, card) => {
                counts[card.name] = (counts[card.name] || 0) + 1;
                return counts;
            }, {}),
        })),
    };
}

function pushTraceEntry(runtime, game, shopStock, cpu, actionInfo, traceEntries) {
    if (!Array.isArray(traceEntries)) return;
    const entry = {
        actorIndex: game.currentPlayerIndex,
        actorDifficulty: cpu && cpu.difficulty ? cpu.difficulty : (cpu instanceof runtime.RLCPU ? 'rl' : 'cpu'),
        before: summarizeTraceState(runtime, game, shopStock),
        legalActions: listLegalActions(runtime, game, shopStock, cpu),
        chosenAction: actionInfo ? {
            action: Number.isFinite(actionInfo.action) ? actionInfo.action : null,
            label: actionInfo.label || (Number.isFinite(actionInfo.action) ? actionToLabel(runtime, actionInfo.action) : 'UNKNOWN'),
        } : null,
        rollsUsed: [],
        rollCursor: 0,
    };
    if (entry.chosenAction && Number.isInteger(actionInfo && actionInfo.targetIndex)) {
        entry.chosenAction.targetIndex = actionInfo.targetIndex;
    }
    traceEntries.push(entry);
}

function buildActionLabel(action) {
    if (!action) return 'UNKNOWN';
    if (action.type === 'skip') return 'PASS';
    if (action.type === 'landmark') return `BUY_LM:${action.name}`;
    if (action.type === 'card') return `BUY_CARD:${action.cardName || (action.card && action.card.name) || 'UNKNOWN'}`;
    return action.type || 'UNKNOWN';
}

function buildActionName(action) {
    if (!action) return null;
    if (action.type === 'landmark') return action.name || null;
    if (action.type === 'card') return action.cardName || (action.card && action.card.name) || null;
    return null;
}

function normalizeBuildScore(score) {
    return Number.isFinite(score) ? score : null;
}

function normalizeBuildBreakdown(breakdown) {
    if (!breakdown || typeof breakdown !== 'object') return null;
    return Object.fromEntries(Object.entries(breakdown).map(([key, value]) => [
        key,
        Number.isFinite(value) ? value : null,
    ]));
}

function compareBuildDiagnosticsOption(a, b) {
    const aScore = Number.isFinite(a.score) ? a.score : -Infinity;
    const bScore = Number.isFinite(b.score) ? b.score : -Infinity;
    if (bScore !== aScore) return bScore > aScore ? 1 : -1;
    return a.label.localeCompare(b.label, 'ja');
}

function estimateV2SimpleBuildPreEv(runtime, game, cpu) {
    if (typeof cpu._expectedDiceScoreWithHarbor !== 'function') return null;
    const current = game.currentPlayer();
    const station = runtime.LANDMARK_NAMES && runtime.LANDMARK_NAMES.STATION;
    const oneScore = cpu._expectedDiceScoreWithHarbor(game, false);
    const twoScore = station && current.landmarks[station]
        ? cpu._expectedDiceScoreWithHarbor(game, true)
        : -Infinity;
    return Math.max(oneScore, twoScore);
}

function augmentV2SimpleBuildBreakdown(rawBreakdown, preEv) {
    if (!rawBreakdown || typeof rawBreakdown !== 'object') return null;
    const postEv = rawBreakdown.baseEv;
    const deltaEv = Number.isFinite(postEv) && Number.isFinite(preEv) ? postEv - preEv : null;
    const comboUnlockBonus = Number.isFinite(rawBreakdown.comboUnlockBonus) ? rawBreakdown.comboUnlockBonus : 0;
    const tempoBonus = Number.isFinite(rawBreakdown.tempoBonus) ? rawBreakdown.tempoBonus : 0;
    const redOpponentTurnBonus = Number.isFinite(rawBreakdown.redOpponentTurnBonus) ? rawBreakdown.redOpponentTurnBonus : 0;
    const renovationRiskPenalty = Number.isFinite(rawBreakdown.renovationRiskPenalty) ? rawBreakdown.renovationRiskPenalty : 0;
    const portfolioBonus = Number.isFinite(rawBreakdown.portfolioBonus) ? rawBreakdown.portfolioBonus : 0;
    const deltaTotal = Number.isFinite(deltaEv)
        ? deltaEv + comboUnlockBonus + tempoBonus + redOpponentTurnBonus - renovationRiskPenalty + portfolioBonus
        : null;
    return Object.assign(normalizeBuildBreakdown(rawBreakdown), {
        preEv: normalizeBuildScore(preEv),
        postEv: normalizeBuildScore(postEv),
        deltaEv: normalizeBuildScore(deltaEv),
        deltaTotal: normalizeBuildScore(deltaTotal),
    });
}

function buildNearTieDiagnostics(buildOptions, threshold = 0.25) {
    const topScore = buildOptions.length > 0 ? buildOptions[0].score : null;
    const tiedOptions = Number.isFinite(topScore)
        ? buildOptions
            .filter(option => Number.isFinite(option.score) && Math.abs(option.score - topScore) <= threshold)
            .map(option => option.label)
        : [];
    return {
        threshold,
        topScore: normalizeBuildScore(topScore),
        tiedOptions,
        isNearTie: tiedOptions.length > 1,
    };
}

function buildLandmarkDelayContext(runtime, current, missingLandmarks) {
    const remaining = missingLandmarks
        .map(name => ({ name, cost: runtime.Player.landmarkCost(name) }))
        .sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name, 'ja'));
    const nearest = remaining[0] || null;
    const shortfallBefore = nearest ? Math.max(0, nearest.cost - current.coins) : 0;
    return {
        remainingLandmarks: missingLandmarks.length,
        nearestLandmark: nearest ? nearest.name : null,
        nearestLandmarkCost: nearest ? nearest.cost : null,
        coinsBefore: current.coins,
        shortfallBefore,
    };
}

function buildLandmarkDelayPreview(context, cardCost) {
    const coinsAfter = context.coinsBefore - cardCost;
    const shortfallAfter = context.nearestLandmarkCost == null
        ? 0
        : Math.max(0, context.nearestLandmarkCost - coinsAfter);
    const delayCoins = Math.max(0, shortfallAfter - context.shortfallBefore);
    return {
        remainingLandmarks: context.remainingLandmarks,
        nearestLandmark: context.nearestLandmark,
        nearestLandmarkCost: context.nearestLandmarkCost,
        coinsBefore: context.coinsBefore,
        cardCost,
        shortfallBefore: context.shortfallBefore,
        coinsAfter,
        shortfallAfter,
        delayCoins,
        wouldTrigger: context.remainingLandmarks <= 3 && context.shortfallBefore > 0 && context.shortfallBefore <= 3 && delayCoins > 0,
    };
}

function collectOpponentWinThreats(runtime, game) {
    const enabled = game.enabledLandmarks || new Set(runtime.Player.landmarkNames());
    const options = runtime.__selfplayOptions || {};
    const difficulties = Array.isArray(options.difficulties) ? options.difficulties : [];
    const cpuPlayers = Array.isArray(options.cpuPlayers) ? options.cpuPlayers : [];
    return game.players
        .map((player, index) => {
            if (index === game.currentPlayerIndex) return null;
            const missingLandmarks = runtime.Player.landmarkNames()
                .filter(name => enabled.has(name) && !player.landmarks[name]);
            const remaining = missingLandmarks
                .map(name => ({ name, cost: runtime.Player.landmarkCost(name) }))
                .sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name, 'ja'));
            const nearest = remaining[0] || null;
            const winningLandmark = missingLandmarks.length === 1 ? remaining[0] : null;
            const canWinNow = !!winningLandmark && player.coins >= winningLandmark.cost;
            return {
                playerIndex: index,
                difficulty: difficulties[index] || (cpuPlayers[index] && cpuPlayers[index].difficulty) || '',
                coins: player.coins,
                missingLandmarks,
                affordableWinningLandmarks: canWinNow ? [{ name: winningLandmark.name, cost: winningLandmark.cost }] : [],
                canWinNow,
                nearestWinLandmark: nearest ? nearest.name : null,
                nearestWinLandmarkCost: nearest ? nearest.cost : null,
                shortfallToWin: nearest ? Math.max(0, nearest.cost - player.coins) : 0,
            };
        })
        .filter(Boolean);
}

function countActivePublisherTargets(player) {
    return player.cards.filter(card =>
        (card.category === '飲食店' || card.category === '商店') &&
        !(typeof player.isDormant === 'function' && player.isDormant(card))
    ).length;
}

function estimateDisruptionSteal(cardName, threat, game) {
    const player = game.players[threat.playerIndex];
    if (!player) return 0;
    if (cardName === 'テレビ局') return Math.min(5, player.coins);
    if (cardName === 'スタジアム') return Math.min(2, player.coins);
    if (cardName === '税務署') return player.coins >= 10 ? Math.floor(player.coins / 2) : 0;
    if (cardName === '出版社') return Math.min(countActivePublisherTargets(player), player.coins);
    return 0;
}

function buildDisruptionPreview(option, opponentWinThreats, game) {
    const disruptionCards = new Set(['テレビ局', '税務署', 'スタジアム', '出版社', 'ビジネスセンター', '清掃業', '改装屋']);
    const coinDisruptionCards = new Set(['テレビ局', '税務署', 'スタジアム', '出版社']);
    if (!option || option.type !== 'card' || !option.card || !disruptionCards.has(option.card.name)) return null;
    const affectedThreats = [];
    for (const threat of opponentWinThreats) {
        if (!threat.canWinNow || !coinDisruptionCards.has(option.card.name)) continue;
        const steal = estimateDisruptionSteal(option.card.name, threat, game);
        if (steal > 0 && threat.coins - steal < threat.nearestWinLandmarkCost) {
            affectedThreats.push(threat.playerIndex);
        }
    }
    return {
        isDisruptionCard: true,
        targetableThreatCount: affectedThreats.length,
        canDelayImmediateWin: affectedThreats.length > 0,
        affectedThreats,
        method: coinDisruptionCards.has(option.card.name) ? 'coin-steal-estimate' : 'not-estimated',
    };
}

function collectV2SimpleBuildDiagnostics(runtime, game, shopStock, cpu, current, missingLandmarks, affordableLandmarks, opponentWinThreats) {
    const landmarkDelayContext = buildLandmarkDelayContext(runtime, current, missingLandmarks);
    if (affordableLandmarks.length > 0) {
        return {
            diagnosticSource: 'v2simple-landmark-options',
            mode: 'v2simple',
            coins: current.coins,
            missingLandmarks,
            affordableLandmarks,
            opponentWinThreats,
            landmarkDelayContext,
            buildOptions: affordableLandmarks.map(entry => ({
                type: 'landmark',
                name: entry.name,
                label: `BUY_LM:${entry.name}`,
                cost: entry.cost,
                score: null,
            })),
        };
    }

    if (typeof cpu._scoreExpertV2SimpleBuildOptionBreakdown !== 'function') return null;
    const preEv = estimateV2SimpleBuildPreEv(runtime, game, cpu);
    const affordableCards = runtime.CARDS.filter(card =>
        shopStock[card.name] > 0 &&
        current.coins >= card.cost &&
        !(card.color === 'purple' && current.countCardIncludingDormant(card.name) > 0)
    ).map(card => ({ type: 'card', card }));
    const buildOptions = affordableCards.map(option => {
        const breakdown = augmentV2SimpleBuildBreakdown(
            cpu._scoreExpertV2SimpleBuildOptionBreakdown(game, option, shopStock),
            preEv
        );
        const diagnostics = {
            type: 'card',
            name: option.card.name,
            label: `BUY_CARD:${option.card.name}`,
            cost: option.card.cost,
            score: breakdown ? breakdown.total : null,
            deltaScore: breakdown ? breakdown.deltaTotal : null,
            breakdown,
            landmarkDelayPreview: buildLandmarkDelayPreview(landmarkDelayContext, option.card.cost),
        };
        const disruptionPreview = buildDisruptionPreview(option, opponentWinThreats, game);
        if (disruptionPreview) diagnostics.disruptionPreview = disruptionPreview;
        return diagnostics;
    }).sort(compareBuildDiagnosticsOption);
    return {
        diagnosticSource: 'v2simple-card-breakdown',
        mode: 'v2simple',
        preEv: normalizeBuildScore(preEv),
        landmarkDelayContext,
        nearTie: buildNearTieDiagnostics(buildOptions),
        coins: current.coins,
        missingLandmarks,
        affordableLandmarks,
        opponentWinThreats,
        buildOptions,
    };
}

function collectBuildDiagnostics(runtime, game, shopStock, cpu) {
    if (!cpu || cpu.difficulty !== 'expert') return null;
    const current = game.currentPlayer();
    const enabled = game.enabledLandmarks || new Set(runtime.Player.landmarkNames());
    const missingLandmarks = runtime.Player.landmarkNames().filter(name => enabled.has(name) && !current.landmarks[name]);
    const affordableLandmarks = missingLandmarks
        .map(name => ({ name, cost: runtime.Player.landmarkCost(name) }))
        .filter(entry => current.coins >= entry.cost);
    const opponentWinThreats = collectOpponentWinThreats(runtime, game);
    if (typeof cpu._isExpertV2Simple === 'function' && cpu._isExpertV2Simple()) {
        return collectV2SimpleBuildDiagnostics(runtime, game, shopStock, cpu, current, missingLandmarks, affordableLandmarks, opponentWinThreats);
    }
    if (typeof cpu._listExpertBuildOptions !== 'function' || typeof cpu._scoreExpertBuildOption !== 'function') return null;
    const options = cpu._listExpertBuildOptions(game, shopStock);
    const context = {
        affordableBuildCount: options.filter(option => option.type !== 'skip').length,
    };
    const buildOptions = options.map(option => {
        const score = cpu._scoreExpertBuildOption(game, shopStock, option, context);
        return {
            type: option.type,
            name: buildActionName(option),
            label: buildActionLabel(option),
            score: normalizeBuildScore(score),
        };
    }).sort(compareBuildDiagnosticsOption);
    return {
        diagnosticSource: '_listExpertBuildOptions/_scoreExpertBuildOption',
        mode: 'generic',
        coins: current.coins,
        missingLandmarks,
        affordableLandmarks,
        opponentWinThreats,
        buildOptions,
    };
}

function clearPendingField(game, field) {
    if (!game || !field) return;
    if (typeof game.clearPendingField === 'function') {
        game.clearPendingField(field);
        return;
    }
    game[field] = 0;
    if (Array.isArray(game.pendingActionQueue)) {
        game.pendingActionQueue = game.pendingActionQueue.filter(entry => entry && entry.field !== field);
    }
    if (typeof game._checkPending === 'function') game._checkPending();
}

function fallbackBusiness(game) {
    const current = game.currentPlayer();
    const myCardIndex = current.cards.findIndex(card => card.category !== '大施設');
    if (myCardIndex < 0) {
        clearPendingField(game, 'pendingBusiness');
        return;
    }
    for (let i = 0; i < game.players.length; i++) {
        if (i === game.currentPlayerIndex) continue;
        const theirCardIndex = game.players[i].cards.findIndex(card => card.category !== '大施設');
        if (theirCardIndex >= 0) {
            game.resolveBusiness(myCardIndex, i, theirCardIndex);
            return;
        }
    }
    clearPendingField(game, 'pendingBusiness');
}

function resolveBusinessMoveCards(game, move) {
    if (!game || !move) return { giveCard: null, takeCard: null };
    const current = game.currentPlayer();
    const target = game.players[move.targetIndex];
    const resolveCard = (player, ref) => {
        if (!player || ref == null) return null;
        if (Number.isInteger(ref)) return player.cards[ref] || null;
        return player.cards.find(card => card.name === ref) || null;
    };
    return {
        giveCard: resolveCard(current, move.myCard),
        takeCard: resolveCard(target, move.theirCard),
    };
}

function fallbackCleaning(game) {
    for (const player of game.players) {
        const card = player.getMinorCards().find(entry => !player.isDormant(entry));
        if (card) {
            game.resolveCleaning(card.name);
            return;
        }
    }
    clearPendingField(game, 'pendingCleaning');
}

function fallbackMover(game) {
    const current = game.currentPlayer();
    const cardIndex = current.cards.findIndex(card => card.category !== '大施設');
    if (cardIndex < 0) {
        clearPendingField(game, 'pendingMover');
        return;
    }
    for (let i = 0; i < game.players.length; i++) {
        if (i === game.currentPlayerIndex) continue;
        game.resolveMover(cardIndex, i);
        return;
    }
    clearPendingField(game, 'pendingMover');
}

function fallbackRenovation(game) {
    const current = game.currentPlayer();
    const name = Object.entries(current.landmarks)
        .find(([landmark, built]) => built && landmark !== '役所');
    if (name) {
        game.resolveRenovation(name[0]);
        return;
    }
    clearPendingField(game, 'pendingRenovation');
}

function pushPendingResolutionTrace(runtime, game, shopStock, cpu, resolution, traceEntries, actions) {
    if (!resolution) return;
    switch (resolution.action) {
        case 'resolveTV': {
            const targetIndex = resolution.targetIndex;
            pushTraceEntry(runtime, game, shopStock, cpu, {
                action: actions.TV_TARGET ?? null,
                label: `TV_TARGET:p${targetIndex + 1}`,
                targetIndex,
            }, traceEntries);
            break;
        }
        case 'resolveBusiness': {
            const move = resolution.move || null;
            const { giveCard, takeCard } = resolveBusinessMoveCards(game, move);
            const giveIndex = giveCard ? runtime.CARDS.findIndex(card => card.name === giveCard.name) : -1;
            const takeIndex = takeCard ? runtime.CARDS.findIndex(card => card.name === takeCard.name) : -1;
            const businessAction = giveIndex >= 0 && takeIndex >= 0
                ? (actions.BC_BASE != null ? actions.BC_BASE + giveIndex * runtime.CARDS.length + takeIndex : null)
                : null;
            pushTraceEntry(runtime, game, shopStock, cpu, move ? {
                action: businessAction,
                label: businessAction == null ? `BUSINESS:${move.myCard}->${move.theirCard}@p${move.targetIndex + 1}` : actionToLabel(runtime, businessAction),
                targetIndex: move.targetIndex,
            } : {
                action: actions.PASS ?? null,
                label: 'PASS',
            }, traceEntries);
            recordBusinessStat(game, cpu, runtime.__selfplayOptions, move, giveCard, takeCard);
            break;
        }
        case 'resolveMover': {
            const move = resolution.move || null;
            const movedCard = move ? game.players[game.currentPlayerIndex]?.cards?.[move.cardIndex] : null;
            const movedCardIndex = movedCard ? runtime.CARDS.findIndex(card => card.name === movedCard.name) : -1;
            pushTraceEntry(runtime, game, shopStock, cpu, move ? {
                action: movedCardIndex >= 0 && actions.MOVER_BASE != null ? actions.MOVER_BASE + movedCardIndex : null,
                label: movedCardIndex >= 0 && actions.MOVER_BASE != null ? actionToLabel(runtime, actions.MOVER_BASE + movedCardIndex) : `MOVER:${move.cardIndex}@p${move.targetIndex + 1}`,
                targetIndex: move.targetIndex,
            } : {
                action: actions.PASS ?? null,
                label: 'PASS',
            }, traceEntries);
            break;
        }
        case 'resolveRenovation': {
            const landmarkName = resolution.landmarkName || null;
            const landmarkOrder = runtime.RLCPU ? runtime.RLCPU.LANDMARK_ORDER : runtime.Player.landmarkNames().filter(name => name !== runtime.LANDMARK_NAMES.YAKUSHO);
            const landmarkIndex = landmarkName ? landmarkOrder.indexOf(landmarkName) : -1;
            pushTraceEntry(runtime, game, shopStock, cpu, landmarkName ? {
                action: landmarkIndex >= 0 && actions.RENO_BASE != null ? actions.RENO_BASE + landmarkIndex : null,
                label: landmarkIndex >= 0 && actions.RENO_BASE != null ? actionToLabel(runtime, actions.RENO_BASE + landmarkIndex) : `RENO:${landmarkName}`,
            } : {
                action: actions.PASS ?? null,
                label: 'PASS',
            }, traceEntries);
            break;
        }
        default:
            pushTraceEntry(runtime, game, shopStock, cpu, {
                action: actions.PASS ?? null,
                label: 'PASS',
            }, traceEntries);
            break;
    }
    resolution.apply();
    if (Array.isArray(traceEntries)) traceEntries[traceEntries.length - 1].after = summarizeTraceState(runtime, game, shopStock);
}

function playCpuStepLightweight(runtime, game, cpu, shopStock, rng, rollQueue = null) {
    switch (game.phase) {
        case runtime.GAME_PHASES.ROLL:
            if (game.currentPlayer().landmarks['駅']) {
                game.rollDice(null, null);
            } else {
                const forceDice = randomDie(rng, rollQueue);
                game.rollDice(forceDice, makeImmediateTunaDiceForRoll(runtime, game, forceDice, false, rng, rollQueue));
            }
            return;
        case runtime.GAME_PHASES.SELECT_DICE: {
            const useTwo = cpu.chooseDiceCount(game);
            if (useTwo) {
                const d1 = randomDie(rng, rollQueue);
                const d2 = randomDie(rng, rollQueue);
                game.selectDiceCount(true, d1, d2, makeImmediateTunaDiceForRoll(runtime, game, d1 + d2, true, rng, rollQueue));
            } else {
                const d1 = randomDie(rng, rollQueue);
                game.selectDiceCount(false, d1, null, makeImmediateTunaDiceForRoll(runtime, game, d1, false, rng, rollQueue));
            }
            return;
        }
        case runtime.GAME_PHASES.REROLL_CONFIRM:
            if (cpu.chooseReroll(game)) {
                if (game.currentPlayer().landmarks[runtime.LANDMARK_NAMES.STATION]) {
                    game.rerollDice(null, null);
                } else {
                    const forceDice = randomDie(rng, rollQueue);
                    game.rerollDice(forceDice, makeTunaDiceForRoll(runtime, game, forceDice, rng, rollQueue));
                }
            }
            else {
                game.pendingTunaDice = makeImmediateTunaDiceForKeep(runtime, game, rng, rollQueue);
                game.skipReroll();
            }
            return;
        case runtime.GAME_PHASES.HARBOR_CHOICE:
            {
                const useHarbor = cpu.chooseHarbor(game);
                const dice = useHarbor ? game.lastDiceResult + 2 : game.lastDiceResult;
                game.resolveHarbor(useHarbor, makeTunaDiceForRoll(runtime, game, dice, rng, rollQueue));
            }
            return;
        case runtime.GAME_PHASES.PENDING:
            {
                const pendingResolution = runtime.CPU.choosePendingResolution(game, cpu, {
                    fallbackBusiness,
                    fallbackMover,
                    fallbackRenovation,
                });
                if (pendingResolution) {
                    pendingResolution.apply();
                    return;
                }
            }
            if (runtime.GameManager.nextPendingActionFor(game)?.action === 'resolveCleaning' && game.pendingCleaning > 0) {
                const cardName = cpu.chooseCleaningTarget(game);
                if (cardName) game.resolveCleaning(cardName);
                else fallbackCleaning(game);
                return;
            }
            if (game.pendingIT) {
                game.resolveIT(cpu.chooseITInvest(game));
                return;
            }
            game.phase = runtime.GAME_PHASES.BUILD;
            return;
        case runtime.GAME_PHASES.BUILD:
            cpu.build(game, shopStock);
            if (game.phase === runtime.GAME_PHASES.BUILD) game.nextTurn();
            return;
        default:
            return;
    }
}

function snapshotBuildState(game) {
    const player = game.currentPlayer();
    const cardCounts = {};
    for (const card of player.cards) {
        cardCounts[card.name] = (cardCounts[card.name] || 0) + 1;
    }
    const builtLandmarks = {};
    for (const [name, built] of Object.entries(player.landmarks)) {
        builtLandmarks[name] = !!built;
    }
    return {
        cards: cardCounts,
        landmarks: builtLandmarks,
    };
}

function detectBuildOutcome(beforeState, afterState) {
    for (const [name, count] of Object.entries(afterState.cards)) {
        const beforeCount = beforeState.cards[name] || 0;
        if (count > beforeCount) {
            return { type: 'card', name };
        }
    }
    for (const [name, built] of Object.entries(afterState.landmarks)) {
        if (built && !beforeState.landmarks[name]) {
            return { type: 'landmark', name };
        }
    }
    return { type: 'pass', name: null };
}

function recordBuildStat(game, cpu, options, outcome) {
    if (!options) return;
    const key = game.currentPlayerIndex;
    const buckets = [];
    if (options.buildStats && options.buildStats[key]) {
        buckets.push(options.buildStats[key]);
    }
    const difficulty = Array.isArray(options.currentLineup) ? options.currentLineup[key] : null;
    if (difficulty && options.buildStatsByDifficulty && options.buildStatsByDifficulty[difficulty]) {
        buckets.push(options.buildStatsByDifficulty[difficulty]);
    }
    for (const stats of buckets) {
        stats.total++;
        if (outcome.type === 'pass') {
            stats.pass++;
            continue;
        }
        if (outcome.type === 'card') {
            stats.cards[outcome.name] = (stats.cards[outcome.name] || 0) + 1;
            continue;
        }
        if (outcome.type === 'landmark') {
            stats.landmarks[outcome.name] = (stats.landmarks[outcome.name] || 0) + 1;
        }
    }
}

function createBusinessStatsBucket() {
    return {
        total: 0,
        skipped: 0,
        targets: {},
        giveCards: {},
        takeCards: {},
        exchanges: {},
    };
}

function cloneBusinessStats(stats) {
    const result = {};
    for (const [key, value] of Object.entries(stats || {})) {
        result[key] = {
            total: value.total || 0,
            skipped: value.skipped || 0,
            targets: Object.assign({}, value.targets),
            giveCards: Object.assign({}, value.giveCards),
            takeCards: Object.assign({}, value.takeCards),
            exchanges: Object.assign({}, value.exchanges),
        };
    }
    return result;
}

function incrementCount(map, key) {
    if (!key) return;
    map[key] = (map[key] || 0) + 1;
}

function recordBusinessStat(game, cpu, options, move, giveCard, takeCard) {
    if (!options || !options.businessStats) return;
    const actorDifficulty = cpu && cpu.difficulty ? cpu.difficulty : 'rl';
    const stats = options.businessStats[actorDifficulty] || createBusinessStatsBucket();
    options.businessStats[actorDifficulty] = stats;
    stats.total++;
    if (!move || !giveCard || !takeCard) {
        stats.skipped++;
        return;
    }
    const targetCpu = Array.isArray(options.cpuPlayers) ? options.cpuPlayers[move.targetIndex] : null;
    const targetDifficulty = targetCpu && targetCpu.difficulty ? targetCpu.difficulty : 'rl';
    incrementCount(stats.targets, targetDifficulty);
    incrementCount(stats.giveCards, giveCard.name);
    incrementCount(stats.takeCards, takeCard.name);
    incrementCount(stats.exchanges, `${giveCard.name}->${takeCard.name}`);
}

function playCpuStep(runtime, game, cpu, shopStock, rng) {
    const options = runtime.__selfplayOptions;
    const actions = runtime.RLCPU ? runtime.RLCPU.ACTIONS : {};
    const rollQueue = options && options.rollQueue;
    const traceEntries = options && options.traceEntries;
    const rollStart = Array.isArray(rollQueue) ? rollQueue.length : null;
    try {
        switch (game.phase) {
            case runtime.GAME_PHASES.ROLL:
                pushTraceEntry(runtime, game, shopStock, cpu, {
                    action: actions.ROLL1 ?? null,
                    label: 'ROLL1',
                }, traceEntries);
                if (game.currentPlayer().landmarks['駅']) {
                    game.rollDice(null, null);
                } else {
                    const forceDice = randomDie(rng, rollQueue);
                    game.rollDice(forceDice, makeImmediateTunaDiceForRoll(runtime, game, forceDice, false, rng, rollQueue));
                }
                if (Array.isArray(traceEntries)) {
                    traceEntries[traceEntries.length - 1].after = summarizeTraceState(runtime, game, shopStock);
                }
                return;
            case runtime.GAME_PHASES.SELECT_DICE: {
                const useTwo = cpu.chooseDiceCount(game);
                pushTraceEntry(runtime, game, shopStock, cpu, {
                    action: useTwo ? (actions.ROLL2 ?? null) : (actions.ROLL1 ?? null),
                    label: useTwo ? 'ROLL2' : 'ROLL1',
                }, traceEntries);
                if (useTwo) {
                    const d1 = randomDie(rng, rollQueue);
                    const d2 = randomDie(rng, rollQueue);
                    game.selectDiceCount(true, d1, d2, makeImmediateTunaDiceForRoll(runtime, game, d1 + d2, true, rng, rollQueue));
                } else {
                    const d1 = randomDie(rng, rollQueue);
                    game.selectDiceCount(false, d1, null, makeImmediateTunaDiceForRoll(runtime, game, d1, false, rng, rollQueue));
                }
                if (Array.isArray(traceEntries)) {
                    traceEntries[traceEntries.length - 1].after = summarizeTraceState(runtime, game, shopStock);
                }
                return;
            }
            case runtime.GAME_PHASES.REROLL_CONFIRM:
                if (cpu.chooseReroll(game)) {
                    pushTraceEntry(runtime, game, shopStock, cpu, {
                        action: actions.REROLL ?? null,
                        label: 'REROLL',
                    }, traceEntries);
                    if (game.currentPlayer().landmarks[runtime.LANDMARK_NAMES.STATION]) {
                        game.rerollDice(null, null);
                    } else {
                        const forceDice = randomDie(rng, rollQueue);
                        game.rerollDice(forceDice, makeTunaDiceForRoll(runtime, game, forceDice, rng, rollQueue));
                    }
                } else {
                    pushTraceEntry(runtime, game, shopStock, cpu, {
                        action: actions.KEEP ?? null,
                        label: 'KEEP',
                    }, traceEntries);
                    game.pendingTunaDice = makeImmediateTunaDiceForKeep(runtime, game, rng, rollQueue);
                    game.skipReroll();
                }
                if (Array.isArray(traceEntries)) {
                    traceEntries[traceEntries.length - 1].after = summarizeTraceState(runtime, game, shopStock);
                }
                return;
            case runtime.GAME_PHASES.HARBOR_CHOICE:
                {
                    const useHarbor = cpu.chooseHarbor(game);
                    pushTraceEntry(runtime, game, shopStock, cpu, {
                        action: useHarbor ? (actions.HARBOR_YES ?? null) : (actions.HARBOR_NO ?? null),
                        label: useHarbor ? 'HARBOR_YES' : 'HARBOR_NO',
                    }, traceEntries);
                    const dice = useHarbor ? game.lastDiceResult + 2 : game.lastDiceResult;
                    game.resolveHarbor(useHarbor, makeTunaDiceForRoll(runtime, game, dice, rng, rollQueue));
                    if (Array.isArray(traceEntries)) traceEntries[traceEntries.length - 1].after = summarizeTraceState(runtime, game, shopStock);
                }
                return;
            case runtime.GAME_PHASES.PENDING:
                {
                    const pendingResolution = runtime.CPU.choosePendingResolution(game, cpu, {
                        fallbackBusiness,
                        fallbackMover,
                        fallbackRenovation,
                    });
                    if (pendingResolution) {
                        pushPendingResolutionTrace(runtime, game, shopStock, cpu, pendingResolution, traceEntries, actions);
                        return;
                    }
                }
                if (runtime.GameManager.nextPendingActionFor(game)?.action === 'resolveCleaning' && game.pendingCleaning > 0) {
                    const cardName = cpu.chooseCleaningTarget(game);
                    const cardIndex = cardName ? runtime.CARDS.findIndex(card => card.name === cardName) : -1;
                    pushTraceEntry(runtime, game, shopStock, cpu, cardName ? {
                        action: cardIndex >= 0 && actions.CLEAN_BASE != null ? actions.CLEAN_BASE + cardIndex : null,
                        label: `CLEAN:${cardName}`,
                    } : {
                        action: actions.PASS ?? null,
                        label: 'PASS',
                    }, traceEntries);
                    if (cardName) game.resolveCleaning(cardName);
                    else fallbackCleaning(game);
                    if (Array.isArray(traceEntries)) traceEntries[traceEntries.length - 1].after = summarizeTraceState(runtime, game, shopStock);
                    return;
                }
                if (game.pendingIT) {
                    const save = cpu.chooseITInvest(game);
                    pushTraceEntry(runtime, game, shopStock, cpu, {
                        action: save ? (actions.IT_SAVE ?? null) : (actions.IT_SKIP ?? null),
                        label: save ? 'IT_SAVE' : 'IT_SKIP',
                    }, traceEntries);
                    game.resolveIT(save);
                    if (Array.isArray(traceEntries)) traceEntries[traceEntries.length - 1].after = summarizeTraceState(runtime, game, shopStock);
                    return;
                }
                game.phase = runtime.GAME_PHASES.BUILD;
                return;
            case runtime.GAME_PHASES.BUILD:
                const beforeBuild = snapshotBuildState(game);
                const beforeTrace = Array.isArray(traceEntries) ? traceEntries.length : 0;
                if (Array.isArray(traceEntries)) {
                    let actionInfo = { action: null, label: 'UNKNOWN' };
                    if (runtime.RLCPU && cpu instanceof runtime.RLCPU) {
                        const choice = cpu._chooseForGame(game, shopStock);
                        actionInfo = {
                            action: choice.action,
                            label: actionToLabel(runtime, choice.action),
                        };
                    }
                    pushTraceEntry(runtime, game, shopStock, cpu, actionInfo, traceEntries);
                    if (runtime.__selfplayOptions && runtime.__selfplayOptions.includeBuildDiagnostics) {
                        const buildDiagnostics = collectBuildDiagnostics(runtime, game, shopStock, cpu);
                        if (buildDiagnostics) traceEntries[traceEntries.length - 1].buildDiagnostics = buildDiagnostics;
                    }
                }
                cpu.build(game, shopStock);
                const afterBuild = snapshotBuildState(game);
                const outcome = detectBuildOutcome(beforeBuild, afterBuild);
                recordBuildStat(game, cpu, runtime.__selfplayOptions, outcome);
                if (Array.isArray(traceEntries) && traceEntries.length > beforeTrace) {
                    const buildTrace = traceEntries[traceEntries.length - 1];
                    if (!traceEntries[traceEntries.length - 1].chosenAction || traceEntries[traceEntries.length - 1].chosenAction.label === 'UNKNOWN') {
                        const cardIndex = outcome.type === 'card'
                            ? runtime.CARDS.findIndex(card => card.name === outcome.name)
                            : -1;
                        const landmarkOrder = runtime.RLCPU ? runtime.RLCPU.LANDMARK_ORDER : runtime.Player.landmarkNames().filter(name => name !== runtime.LANDMARK_NAMES.YAKUSHO);
                        const landmarkIndex = outcome.type === 'landmark' ? landmarkOrder.indexOf(outcome.name) : -1;
                        const action = outcome.type === 'card' && cardIndex >= 0 && actions.BUY_CARD_BASE != null
                            ? actions.BUY_CARD_BASE + cardIndex
                            : (outcome.type === 'landmark' && landmarkIndex >= 0 && actions.BUY_LM_BASE != null
                                ? actions.BUY_LM_BASE + landmarkIndex
                                : (outcome.type === 'pass' ? (actions.PASS ?? null) : null));
                        buildTrace.chosenAction = {
                            action,
                            label: action != null ? actionToLabel(runtime, action) : (outcome.type === 'card' ? `BUY_CARD:${outcome.name}` :
                                (outcome.type === 'landmark' ? `BUY_LM:${outcome.name}` : 'PASS')),
                        };
                    }
                    if (buildTrace.buildDiagnostics) {
                        buildTrace.buildDiagnostics.chosenBuildAction = {
                            type: outcome.type,
                            name: outcome.name || null,
                            label: buildTrace.chosenAction ? buildTrace.chosenAction.label : 'UNKNOWN',
                        };
                        buildTrace.buildDiagnostics.buildActionLabel = buildTrace.buildDiagnostics.chosenBuildAction.label;
                    }
                }
                if (game.phase === runtime.GAME_PHASES.BUILD) game.nextTurn();
                if (Array.isArray(traceEntries)) traceEntries[traceEntries.length - 1].after = summarizeTraceState(runtime, game, shopStock);
                return;
            default:
                return;
        }
    } finally {
        finalizeTraceRollUsage(options, rollStart);
    }
}

function finalizeTraceRollUsage(options, rollStart) {
    const traceEntries = options && options.traceEntries;
    const rollQueue = options && options.rollQueue;
    const requestedRolls = options && options.requestedRolls;
    if (!Array.isArray(traceEntries) || traceEntries.length <= 0 || !Array.isArray(rollQueue) || !Array.isArray(requestedRolls) || rollStart == null) {
        return;
    }
    const usedCount = Math.max(0, rollStart - rollQueue.length);
    const cursor = options.rollCursor || 0;
    const used = requestedRolls.slice(cursor, cursor + usedCount);
    options.rollCursor = cursor + usedCount;
    traceEntries[traceEntries.length - 1].rollsUsed = used;
    traceEntries[traceEntries.length - 1].rollCursor = cursor;
}

function summarizePlayer(player, enabledLandmarks) {
    const landmarkNames = [...enabledLandmarks];
    const builtLandmarks = landmarkNames.filter(name => player.landmarks[name]);
    const cardCounts = {};
    for (const card of player.cards) {
        cardCounts[card.name] = (cardCounts[card.name] || 0) + 1;
    }
    const topCards = Object.entries(cardCounts)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ja'))
        .slice(0, 5)
        .map(([name, count]) => ({ name, count }));
    return {
        name: player.name,
        coins: player.coins,
        builtLandmarks,
        missingLandmarks: landmarkNames.filter(name => !player.landmarks[name]),
        builtLandmarkCount: builtLandmarks.length,
        topCards,
        itVentureCoins: player.itVentureCoins || 0,
        totalCards: player.cards.length,
    };
}

function simulateGame(options = {}) {
    const runtime = options.runtime || loadRuntime();
    const difficulties = resolveSelfplayDifficulties(options.difficulties || ['expert', 'strong']);
    const game = new runtime.GameManager(difficulties.length);
    const shopStock = createShopStock(runtime.CARDS, difficulties.length, runtime);
    const cpuPlayers = createPlayers(runtime, difficulties, options);
    options.cpuPlayers = cpuPlayers;
    const seed = integerOrDefault(options.seed, 1);
    const rng = createRng(seed);
    const previousRandom = runtime.Math.random;
    const hadPreviousSelfplayOptions = Object.prototype.hasOwnProperty.call(runtime, '__selfplayOptions');
    const previousSelfplayOptions = runtime.__selfplayOptions;
    runtime.Math.random = rng;
    runtime.__selfplayOptions = options;
    try {
        game.enabledLandmarks = new Set(runtime.Player.landmarkNames());
        let safety = 0;
        const maxSteps = integerOrDefault(options.maxSteps, 5000);

        while (!game.checkWinner() && safety < maxSteps) {
            const cpu = cpuPlayers[game.currentPlayerIndex];
            playCpuStep(runtime, game, cpu, shopStock, rng);
            safety++;
        }

        const winnerPlayer = game.checkWinner();
        const result = {
            winner: winnerPlayer ? game.players.indexOf(winnerPlayer) : -1,
            turns: game.turnCount,
            exhausted: safety >= maxSteps,
            difficulties: difficulties.slice(),
            seed,
            expertPreset: options.expertPreset || 'default',
            expertPurpose: options.expertPurpose || 'training',
            expertTuning: options.expertTuning || null,
            expertBehaviorFlags: options.expertBehaviorFlags || null,
            expertProfilePresets: options.expertProfilePresets || null,
            expertProfileTunings: options.expertProfileTunings || null,
            rlModel: options.rlModelData ? {
                stateDim: options.rlModelData.stateDim,
                hiddenSize: options.rlModelData.hiddenSize,
                numActions: options.rlModelData.numActions,
            } : null,
            fast: !!options.fast,
            lite: !!options.lite,
        };
        if (options.includeFinalState !== false) {
            result.finalState = game.players.map(player => summarizePlayer(player, game.enabledLandmarks));
        } else {
            result.finalState = null;
        }
        result.traceEntries = Array.isArray(options.traceEntries) ? options.traceEntries.slice() : null;
        result.buildStats = options.buildStats ? options.buildStats.map(stats => ({
            total: stats.total,
            pass: stats.pass,
            cards: Object.assign({}, stats.cards),
            landmarks: Object.assign({}, stats.landmarks),
        })) : null;
        result.businessStats = options.businessStats ? cloneBusinessStats(options.businessStats) : null;
        return result;
    } finally {
        runtime.Math.random = previousRandom;
        if (hadPreviousSelfplayOptions) {
            runtime.__selfplayOptions = previousSelfplayOptions;
        } else {
            delete runtime.__selfplayOptions;
        }
    }
}

function simulateGameLightweight(options = {}) {
    const runtime = options.runtime || loadRuntime({ includeRL: false });
    const difficulties = resolveSelfplayDifficulties(options.difficulties || ['expert', 'weak']);
    const game = new runtime.GameManager(difficulties.length);
    const shopStock = createShopStock(runtime.CARDS, difficulties.length, runtime);
    const cpuPlayers = createPlayers(runtime, difficulties, options);
    const seed = integerOrDefault(options.seed, 1);
    const rng = createRng(seed);
    const previousRandom = runtime.Math.random;
    runtime.Math.random = rng;
    try {
        game.enabledLandmarks = new Set(runtime.Player.landmarkNames());
        let safety = 0;
        const maxSteps = integerOrDefault(options.maxSteps, 5000);
        const rollQueue = options.rollQueue;

        while (!game.checkWinner() && safety < maxSteps) {
            const cpu = cpuPlayers[game.currentPlayerIndex];
            playCpuStepLightweight(runtime, game, cpu, shopStock, rng, rollQueue);
            safety++;
        }

        return {
            winner: game.checkWinner() ? game.players.indexOf(game.checkWinner()) : -1,
            turns: game.turnCount,
            exhausted: safety >= maxSteps,
            difficulties: difficulties.slice(),
            seed,
            expertPreset: options.expertPreset || 'default',
            expertPurpose: options.expertPurpose || 'training',
            fast: !!options.fast,
            lite: !!options.lite,
            finalState: null,
            traceEntries: null,
            buildStats: null,
            businessStats: null,
        };
    } finally {
        runtime.Math.random = previousRandom;
    }
}

function rotatePlayers(players, offset) {
    return players.map((_, index) => players[(index + offset) % players.length]);
}

function runSeries(options = {}) {
    const games = integerOrDefault(options.games, 20);
    const players = options.players || ['expert', 'strong'];
    const runtime = options.runtime || loadRuntime({ includeRL: options.includeRL });
    const collectMatchLog = options.collectMatchLog !== false;
    const collectBuildStats = options.collectBuildStats !== false;
    const collectBusinessStats = options.collectBusinessStats !== false;
    const includeFinalState = options.includeFinalState !== false;
    const wins = Object.fromEntries(players.map(player => [player, 0]));
    const seatWins = players.map(() => 0);
    let exhausted = 0;
    let turns = 0;
    const matchLog = collectMatchLog ? [] : null;
    const buildStats = collectBuildStats ? players.map(() => ({
        total: 0,
        pass: 0,
        cards: {},
        landmarks: {},
    })) : null;
    const buildStatsByDifficulty = collectBuildStats ? Object.fromEntries([...new Set(players)].map(player => [player, {
        total: 0,
        pass: 0,
        cards: {},
        landmarks: {},
    }])) : null;
    const businessStats = collectBusinessStats ? {} : null;

    for (let i = 0; i < games; i++) {
        const lineup = rotatePlayers(players, i % players.length);
        const seed = integerOrDefault(options.seed, 1) + i;
        const simulator = options.lightweightCpuOnly ? simulateGameLightweight : simulateGame;
        const result = simulator({
            runtime,
            difficulties: lineup,
            seed,
            maxSteps: options.maxSteps,
            profileStats: options.profileStats,
            expertPreset: options.expertPreset,
            expertTuning: options.expertTuning,
            expertBehaviorFlags: options.expertBehaviorFlags,
            expertProfilePresets: options.expertProfilePresets,
            expertProfileTunings: options.expertProfileTunings,
            rlModelData: options.rlModelData,
            fast: options.fast,
            lite: options.lite,
            expertDiceMode: options.expertDiceMode,
            expertRerollMode: options.expertRerollMode,
            expertRerollMargin: options.expertRerollMargin,
            expertBuildMode: options.expertBuildMode,
            expertInvestMode: options.expertInvestMode,
            expertTvMode: options.expertTvMode,
            expertBusinessMode: options.expertBusinessMode,
            expertCleaningMode: options.expertCleaningMode,
            expertHarborMode: options.expertHarborMode,
            expertHarborMargin: options.expertHarborMargin,
            expertMoverMode: options.expertMoverMode,
            expertRenovationMode: options.expertRenovationMode,
            expertIncomeCapMode: options.expertIncomeCapMode,
            expertComboMode: options.expertComboMode,
            expertComboWeight: options.expertComboWeight,
            expertBuildTempoWeight: options.expertBuildTempoWeight,
            expertRollRiskMode: options.expertRollRiskMode,
            expertRollRedRiskWeight: options.expertRollRedRiskWeight,
            expertAirportSkipMode: options.expertAirportSkipMode,
            expertLandmarkCardMargin: options.expertLandmarkCardMargin,
            expertLandmarkCardCompareMode: options.expertLandmarkCardCompareMode,
            expertLandmarkCardCompareTargets: options.expertLandmarkCardCompareTargets,
            expertLandmarkCardPenaltyMode: options.expertLandmarkCardPenaltyMode,
            expertHarborLandmarkBaseBonus: options.expertHarborLandmarkBaseBonus,
            expertLandmarkProgressRemaining: options.expertLandmarkProgressRemaining,
            expertLandmarkCostWeight: options.expertLandmarkCostWeight,
            expertTraceStats: options.expertTraceStats,
            includeFinalState,
            buildStats,
            buildStatsByDifficulty,
            currentLineup: lineup,
            businessStats,
        });
        turns += result.turns;
        if (result.exhausted) exhausted++;
        if (collectMatchLog) {
            matchLog.push({
                game: i + 1,
                seed,
                lineup,
                winnerIndex: result.winner,
                winnerDifficulty: result.winner >= 0 ? lineup[result.winner] : null,
                turns: result.turns,
                exhausted: result.exhausted,
                expertPreset: result.expertPreset,
                expertTuning: result.expertTuning,
                expertBehaviorFlags: result.expertBehaviorFlags,
                finalState: result.finalState,
            });
        }
        if (result.winner >= 0) {
            wins[lineup[result.winner]]++;
            seatWins[result.winner]++;
        }
    }

    return {
        games,
        players: players.slice(),
        wins,
        seatWins,
        exhausted,
        averageTurns: games > 0 ? turns / games : 0,
        matchLog: matchLog || [],
        buildStats: buildStats || [],
        buildStatsByDifficulty: buildStatsByDifficulty || {},
        businessStats: collectBusinessStats ? cloneBusinessStats(businessStats) : {},
    };
}

function runDifficultyLadder(options = {}) {
    const matchups = options.matchups || [
        ['normal', 'weak'],
        ['strong', 'normal'],
        ['expert', 'strong'],
    ];
    return matchups.map(players => ({
        players: players.slice(),
        result: runSeries(Object.assign({}, options, { players })),
    }));
}

function parseArgs(argv) {
    let games = 20;
    let seed = 1;
    let maxSteps = 5000;
    let format = 'text';
    let details = false;
    let expertPreset = 'default';
    let expertFlags = null;
    let comparePresets = null;
    let ladder = false;
    let fast = false;
    let lite = false;
    const players = [];

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--games') games = parseIntegerOrDefault(argv[++i], 20);
        else if (arg === '--seed') seed = parseIntegerOrDefault(argv[++i], 1);
        else if (arg === '--max-steps') maxSteps = parseIntegerOrDefault(argv[++i], 5000);
        else if (arg === '--format') format = argv[++i] || 'text';
        else if (arg === '--details') details = true;
        else if (arg === '--ladder') ladder = true;
        else if (arg === '--fast') fast = true;
        else if (arg === '--lite') lite = true;
        else if (arg === '--expert-preset') expertPreset = argv[++i] || 'default';
        else if (arg === '--expert-flags') expertFlags = JSON.parse(argv[++i] || '{}');
        else if (arg === '--compare-presets') comparePresets = (argv[++i] || 'default').split(',').filter(Boolean);
        else players.push(arg);
    }

    return {
        games,
        seed,
        maxSteps,
        format,
        details,
        fast,
        lite,
        ladder,
        expertPreset,
        expertBehaviorFlags: expertFlags,
        comparePresets,
        players: players.length > 0 ? players : ['expert', 'strong', 'strong', 'normal'],
    };
}

function comparePresets(options) {
    const presets = options.comparePresets || ['default', 'refined', 'rush', 'economy'];
    return presets.map(preset => ({
        preset,
        result: runSeries(Object.assign({}, options, { expertPreset: preset, comparePresets: null })),
    }));
}

function printSeries(result, options = {}) {
    if (options.format === 'json') {
        console.log(JSON.stringify(result, null, 2));
        return;
    }
    console.log(`games=${result.games} players=${result.players.join(',')} expertPreset=${options.expertPreset || 'default'}`);
    for (const [difficulty, winCount] of Object.entries(result.wins)) {
        const rate = result.games > 0 ? ((winCount / result.games) * 100).toFixed(1) : '0.0';
        console.log(`${difficulty}: ${winCount} wins (${rate}%)`);
    }
    console.log(`seatWins=${result.seatWins.join(',')}`);
    console.log(`averageTurns=${result.averageTurns.toFixed(1)} exhausted=${result.exhausted}`);
    if (options.details) {
        for (const match of result.matchLog) {
                console.log(
                    `game=${match.game} seed=${match.seed} lineup=${match.lineup.join(',')} winner=${match.winnerDifficulty || 'none'} turns=${match.turns} exhausted=${match.exhausted} preset=${match.expertPreset}`
                );
            for (let i = 0; i < match.finalState.length; i++) {
                const player = match.finalState[i];
                const role = match.lineup[i];
                const topCards = player.topCards.map(card => `${card.name}x${card.count}`).join(',');
                console.log(
                    `  p${i + 1}=${role} coins=${player.coins} landmarks=${player.builtLandmarkCount}/${player.builtLandmarks.length + player.missingLandmarks.length} built=${player.builtLandmarks.join('|') || '-'} missing=${player.missingLandmarks.join('|') || '-'} cards=${topCards || '-'}`
                );
            }
        }
    }
}

function printPresetComparison(comparisons, options = {}) {
    if (options.format === 'json') {
        console.log(JSON.stringify(comparisons, null, 2));
        return;
    }
    for (const entry of comparisons) {
        printSeries(entry.result, Object.assign({}, options, { expertPreset: entry.preset, details: false }));
    }
}

function printDifficultyLadder(entries, options = {}) {
    if (options.format === 'json') {
        console.log(JSON.stringify(entries, null, 2));
        return;
    }
    for (const entry of entries) {
        printSeries(entry.result, Object.assign({}, options, {
            expertPreset: entry.players.includes('expert') ? (options.expertPreset || 'default') : 'n/a',
            details: false,
        }));
    }
}

if (require.main === module) {
    const options = parseArgs(process.argv.slice(2));
    if (options.ladder) {
        printDifficultyLadder(runDifficultyLadder(options), options);
    } else if (options.comparePresets && options.comparePresets.length > 0) {
        printPresetComparison(comparePresets(options), options);
    } else {
        printSeries(runSeries(options), options);
    }
}

module.exports = {
    loadRuntime,
    createRng,
    createShopStock,
    resolveSelfplayDifficulties,
    createPlayers,
    actionToLabel,
    listLegalActions,
    summarizeTraceState,
    collectBuildDiagnostics,
    playCpuStep,
    simulateGame,
    simulateGameLightweight,
    runSeries,
    runDifficultyLadder,
    comparePresets,
    integerOrDefault,
    parseIntegerOrDefault,
    createBusinessStatsBucket,
    cloneBusinessStats,
    resolveBusinessMoveCards,
    recordBusinessStat,
    parseArgs,
    printSeries,
    printPresetComparison,
    printDifficultyLadder,
};
