'use strict';

const CPUBuildProposalCollectorApi = typeof module !== 'undefined' && module.exports
    ? require('./cpuBuildProposalCollector').CPUBuildProposalCollector
    : globalThis.CPUBuildProposalCollector;
const CPUBuildExecutionApi = typeof module !== 'undefined' && module.exports
    ? require('./cpuBuildExecution').CPUBuildExecution
    : globalThis.CPUBuildExecution;
const CPUBuildProfileApi = typeof module !== 'undefined' && module.exports
    ? require('./cpuProfile').CPUProfile
    : globalThis.CPUProfile;

/**
 * @typedef {Object} CPUBuildStrategyAction
 * @property {'buildCard'|'buildLandmark'} action
 * @property {Record<string, *>} data
 */

function createBuildSelectionCpu(cpu, collector) {
    const selectionCpu = Object.create(cpu);
    Object.defineProperties(selectionCpu, {
        _buyCard: {
            value: card => collector.selectCard(card),
        },
        _buyLandmark: {
            value: name => collector.selectLandmark(name),
        },
    });
    return selectionCpu;
}

const CPUBuildStrategy = Object.freeze({
    /**
     * Selects a detached canonical action and leaves application to the caller.
     * @param {*} cpu
     * @param {*} game
     * @param {Record<string, number>} shopStock
     * @returns {CPUBuildStrategyAction|null}
     */
    chooseBuildAction(cpu, game, shopStock) {
        if (!game || game.phase !== GAME_PHASES.BUILD || game.builtThisTurn) return null;
        const collector = CPUBuildProposalCollectorApi.create({
            createCardBuildAction: CPUBuildExecutionApi.createCardBuildAction,
            createLandmarkBuildAction: CPUBuildExecutionApi.createLandmarkBuildAction,
        });
        const selectionCpu = createBuildSelectionCpu(cpu, collector);
        cpu._syncExpertTuningForGame(game);
        const playerCount = game && Array.isArray(game.players) ? game.players.length : 0;
        const largeCrowdBuildMode = CPUBuildProfileApi.largeCrowdMode(playerCount, cpu.largeCrowdBuildMode);
        const useLargeCrowdNormal = largeCrowdBuildMode === "normal";
        const useLargeCrowdStrong = largeCrowdBuildMode === "strong";
        const useLargeCrowdExpert = largeCrowdBuildMode === "expert";
        const useFivePlayerExpertStrong = cpu.difficulty === "expert" &&
            typeof cpu._isLiveExpert === 'function' && cpu._isLiveExpert() &&
            CPUBuildProfileApi.expertUsesStrongCrowdPolicy(playerCount);
        const useThreePlayerStrongNormal = cpu.difficulty === "strong" &&
            cpu.largeCrowdBuildMode === 'normal' &&
            CPUBuildProfileApi.strongUsesNormalTrioPolicy(playerCount);
        if (useThreePlayerStrongNormal) {
            selectionCpu.buildNormal(game, shopStock);
        } else if (useFivePlayerExpertStrong) {
            selectionCpu.buildStrong(game, shopStock);
        } else if (useLargeCrowdNormal) {
            selectionCpu.buildNormal(game, shopStock);
        } else if (useLargeCrowdStrong) {
            selectionCpu.buildStrong(game, shopStock);
        } else if (useLargeCrowdExpert) {
            selectionCpu.buildExpert(game, shopStock);
        } else if (cpu.difficulty === "weak") {
            selectionCpu.buildWeak(game, shopStock);
        } else if (cpu.difficulty === "normal") {
            selectionCpu.buildNormal(game, shopStock);
        } else if (cpu.difficulty === "strong") {
            selectionCpu.buildStrong(game, shopStock);
        } else {
            selectionCpu.buildExpert(game, shopStock);
        }
        return collector.selectedAction();
    },

    buildWeak(cpu, game, shopStock) {
        const current = game.currentPlayer();
        if (cpu._buyWinningLandmark(current, game)) return;
        const affordableLandmarks = cpu._remainingEnabledLandmarks(current, game)
            .filter(name => current.coins >= Player.landmarkCost(name));
        const affordable = CARDS.filter(card =>
            shopStock[card.name] > 0 &&
            current.coins >= card.cost &&
            !(card.color === "purple" && current.countCardIncludingDormant(card.name) > 0)
        );
        if (affordableLandmarks.length > 0 && (affordable.length === 0 || Math.random() < 0.5)) {
            const name = affordableLandmarks[Math.floor(Math.random() * affordableLandmarks.length)];
            cpu._buyLandmark(name, game);
            return;
        }
        if (affordable.length === 0) return;
        cpu._buyCard(affordable[Math.floor(Math.random() * affordable.length)], game, shopStock);
    },

    // 普通CPU：シナジー＋コスパ重視
    buildNormal(cpu, game, shopStock) {
        const current = game.currentPlayer();
        if (cpu._buyWinningLandmark(current, game)) return;
        if (cpu._tryEndgameBuild(current, game, shopStock, "normal")) return;

        const bestAffordableLandmark = cpu._bestAffordableLandmark(current, game);
        if (bestAffordableLandmark && (
            bestAffordableLandmark.urgency >= 7 ||
            current.coins >= 12 ||
            current.coins >= bestAffordableLandmark.cost + 6
        )) {
            cpu._buyLandmark(bestAffordableLandmark.name, game);
            return;
        }

        // シナジーチェック
        if (cpu._trySynergy(current, game, shopStock)) return;

        if (cpu._maybeBuyLandmark(current, game, 1, 6)) return;

        // スコア順にカードを選ぶ
        const affordable = CARDS.filter(card =>
            shopStock[card.name] > 0 &&
            current.coins >= card.cost &&
            card.cost > 0 &&
            !(card.color === "purple" && current.countCardIncludingDormant(card.name) > 0)
        );
        const sorted = cpu._sortAffordableForDifficulty(affordable, game, current, "normal");
        const selected = cpu._selectNearTie(sorted, entry => entry.score, game, 'build-normal');
        if (selected && cpu._shouldHoldForLandmark(current, game, selected.score, 2)) return;
        if (selected && selected.score >= 0.9) {
            cpu._buyCard(selected.card, game, shopStock);
            return;
        }
        if (cpu._maybeBuyLandmark(current, game, 0, 4)) return;
        if (selected) cpu._buyCard(selected.card, game, shopStock);
    },

    // 強いCPU：状況判断型
    buildStrong(cpu, game, shopStock) {
        return cpu._profileDecision("build", () => {
            if (game.players.length >= 4) {
                const current = game.currentPlayer();
                if (cpu._buyWinningLandmark(current, game)) return;
                if (cpu._tryEndgameBuild(current, game, shopStock, "strong")) return;
                
                const bestAffordableLandmark = cpu._bestAffordableLandmark(current, game);
                if (bestAffordableLandmark && (
                    bestAffordableLandmark.urgency >= 6 ||
                    current.coins >= 10 ||
                    current.coins >= bestAffordableLandmark.cost + 4 ||
                    (current.builtLandmarkCount() < 3 && bestAffordableLandmark.urgency >= 5)
                )) {
                    cpu._buyLandmark(bestAffordableLandmark.name, game);
                    return;
                }
    
                if (cpu._maybeBuyLandmark(current, game, 0, 5)) return;
                if (cpu._trySynergy(current, game, shopStock)) return;
                if (cpu._maybeBuyLandmark(current, game, 1, 5)) return;
    
                const affordable = CARDS.filter(card =>
                    shopStock[card.name] > 0 &&
                    current.coins >= card.cost &&
                    card.cost > 0 &&
                    !(card.color === "purple" && current.countCardIncludingDormant(card.name) > 0)
                );
                const sorted = cpu._sortAffordableForDifficulty(affordable, game, current, "strong")
                    .filter(entry => cpu._strongPremiumPurpleReady(entry.card, game, current) || !cpu._strongCrowdPremiumPurple(entry.card));
                const oneDieOpponents = game.players.filter(p =>
                    p !== current && !p.landmarks[LANDMARK_NAMES.STATION]
                ).length;
                const lowDiceEconomy = sorted.find(entry =>
                    (entry.card.color === "blue" || entry.card.color === "green") &&
                    Math.max(...entry.card.diceNums) <= 6
                );
                const premiumPurple = sorted.find(entry => cpu._strongCrowdPremiumPurple(entry.card));
                const bestEconomy = cpu._bestCrowdEconomyCard(sorted, game, current);
                const best = (
                    oneDieOpponents >= 2 &&
                    current.builtLandmarkCount() < 4 &&
                    lowDiceEconomy
                ) || (
                    cpu._strongPremiumPurpleReady(premiumPurple && premiumPurple.card, game, current) &&
                    premiumPurple &&
                    premiumPurple.score >= ((bestEconomy && bestEconomy.score) || -Infinity) + 1.5
                        ? premiumPurple
                        : null
                ) || bestEconomy || (sorted.length > 0 ? sorted[0] : null);
                if (best && current.builtLandmarkCount() >= 3 && cpu._shouldHoldForLandmark(current, game, best.score, 2)) return;
                if (best && best.score >= 0.9) {
                    cpu._buyCard(best.card, game, shopStock);
                    return;
                }
                if (cpu._maybeBuyLandmark(current, game, 0, 3)) return;
                if (best) cpu._buyCard(best.card, game, shopStock);
                return;
            }
            const current = game.currentPlayer();
            const ci = game.currentPlayerIndex;
            const builtCount = current.builtLandmarkCount();
            if (cpu._buyWinningLandmark(current, game)) return;
            if (cpu._tryEndgameBuild(current, game, shopStock, "strong")) return;
            const targetLandmark = cpu._strongTargetLandmark(current, game);
            const targetShortfall = targetLandmark ? targetLandmark.cost - current.coins : Infinity;
    
            // 誰かが勝利に近い（ランドマーク4つ以上）→ 緊急モード：ランドマーク最優先
            const opponentMaxBuilt = Math.max(...game.players
                .filter((_, i) => i !== ci)
                .map(p => p.builtLandmarkCount()));
            const emergencyMode = opponentMaxBuilt >= 4 || builtCount >= 4;
    
            if (emergencyMode && cpu._maybeBuyLandmark(current, game, 0, 3)) return;
            if (targetLandmark && targetShortfall <= 0 && targetLandmark.urgency >= 4) {
                cpu._buyLandmark(targetLandmark.name, game);
                return;
            }
            const options = CPUSelection.stableRankDescending(
                cpu._listStrongBuildOptions(game, shopStock)
                    .map(option => Object.assign({
                        score: cpu._scoreStrongBuildOption(game, shopStock, option),
                    }, option)),
                option => option.score
            );
            if (options.length === 0) return;
            const best = cpu._selectNearTie(options, option => option.score, game, 'build-strong');
            if (best.type === 'landmark') {
                cpu._buyLandmark(best.name, game);
                return;
            }
            const card = cpu._cardByName(best.cardName);
            if (card) cpu._buyCard(card, game, shopStock);
        });
    },

    buildExpert(cpu, game, shopStock) {
        const current = game.currentPlayer();
        if (cpu._isExpertV2Simple()) {
            if (cpu._buyWinningLandmark(current, game)) return;
            cpu._buildExpertV2Simple(current, game, shopStock);
            return;
        }
        cpu._syncExpertTuningForGame(game);
        if (cpu._buyWinningLandmark(current, game)) return;
        if (cpu._buyLateGameLandmark(current, game)) return;
        if (cpu._shouldExpertForceLandmarkPlan(current, game) && cpu._maybeBuyLandmark(current, game, 0, 7)) return;
        if (current.builtLandmarkCount() >= 2 && cpu._maybeBuyLandmark(current, game, 0, 8)) return;
        if (cpu.simulationMode === "realtime" && game.players.length >= 4) {
            cpu.buildNormal(game, shopStock);
            return;
        }
        if (cpu.simulationMode === "lite" && game.players.length >= 4) {
            cpu.buildNormal(game, shopStock);
            return;
        }
        if (game.players.length >= 4 && cpu._buildExpertCrowd(current, game, shopStock)) {
            return;
        }

        const options = cpu._listExpertBuildOptions(game, shopStock);
        const buildContext = {
            affordableBuildCount: options.filter(action => action.type !== 'skip').length,
        };
        let best = null;
        let bestNonSkip = null;
        let bestLandmark = null;
        for (const action of options) {
            const score = cpu._scoreExpertBuildOption(game, shopStock, action, buildContext);
            const scored = Object.assign({ score }, action);
            if (!best || score > best.score) best = scored;
            if (action.type !== 'skip' && (!bestNonSkip || score > bestNonSkip.score)) bestNonSkip = scored;
            if (action.type === 'landmark' && (!bestLandmark || score > bestLandmark.score)) bestLandmark = scored;
        }

        if (!best) return;
        const forceLandmarkPlan = cpu._shouldExpertForceLandmarkPlan(current, game);
        if (forceLandmarkPlan && bestLandmark && bestLandmark.score >= best.score - 8) {
            best = bestLandmark;
        }
        if (best.type === 'skip') {
            if (current.landmarks[LANDMARK_NAMES.AIRPORT]) return;
            if (forceLandmarkPlan) return;
            if (!bestNonSkip) return;
            best = bestNonSkip;
        }
        if (best.type === 'landmark') {
            cpu._buyLandmark(best.name, game);
            return;
        }
        const card = cpu._cardByName(best.cardName);
        if (card) cpu._buyCard(card, game, shopStock);
    },

    _buildExpertCrowd(cpu, current, game, shopStock) {
        const remainingLandmarks = cpu._remainingEnabledLandmarks(current, game);
        const builtCount = current.builtLandmarkCount();
        const bannedCrowdCards = remainingLandmarks.length > 2
            ? new Set(["食品倉庫", "改装屋", "ピザ屋", "バーガーショップ", "寿司屋", "ブドウ園"])
            : null;
        if (cpu._shouldExpertForceLandmarkPlan(current, game) && cpu._maybeBuyLandmark(current, game, 0, 6)) return true;
        if (builtCount >= 2 && cpu._maybeBuyLandmark(current, game, 0, 6)) return true;
        if (cpu._maybeBuyLandmark(current, game, 1, 7)) return true;

        const affordable = CARDS.filter(card =>
            shopStock[card.name] > 0 &&
            current.coins >= card.cost &&
            card.cost > 0 &&
            !(card.color === "purple" && current.countCardIncludingDormant(card.name) > 0)
        );
        if (affordable.length === 0) return false;

        const sorted = CPUSelection.stableRankDescending(
            affordable.map(card => ({
                card,
                score: cpu._scoreExpertCrowdAffordable(card, game, current),
            })),
            entry => entry.score
        );
        const candidatePool = bannedCrowdCards
            ? sorted.filter(entry => !bannedCrowdCards.has(entry.card.name))
            : sorted;

        const stableIncome = cpu._estimateStableIncome(game, current);
        const oneDieOpponents = game.players.filter(p =>
            p !== current && !p.landmarks[LANDMARK_NAMES.STATION]
        ).length;
        const lowDiceEconomy = candidatePool.find(entry =>
            (entry.card.color === "blue" || entry.card.color === "green") &&
            Math.max(...entry.card.diceNums) <= 6
        );
        const candidate = (
            oneDieOpponents >= 2 &&
            builtCount < 4 &&
            lowDiceEconomy
        ) || cpu._bestCrowdEconomyCard(candidatePool, game, current) || candidatePool[0] || sorted[0];

        if (!candidate) return false;
        if (builtCount >= 2 && cpu._shouldHoldForLandmark(current, game, candidate.score, 1)) return true;
        if (remainingLandmarks.length <= 3 && cpu._maybeBuyLandmark(current, game, 0, 4)) return true;
        if (stableIncome < 12 && lowDiceEconomy && lowDiceEconomy.score >= candidate.score - 1.2) {
            cpu._buyCard(lowDiceEconomy.card, game, shopStock);
            return true;
        }
        if (candidate.score >= 0.5) {
            cpu._buyCard(candidate.card, game, shopStock);
            return true;
        }
        if (cpu._maybeBuyLandmark(current, game, 0, 3)) return true;
        return false;
    },

    _buildStrongCrowd(cpu, current, game, shopStock) {
        const bestAffordableLandmark = cpu._bestAffordableLandmark(current, game);
        if (bestAffordableLandmark && (
            bestAffordableLandmark.urgency >= 6 ||
            current.coins >= 12 ||
            current.coins >= bestAffordableLandmark.cost + 5
        )) {
            cpu._buyLandmark(bestAffordableLandmark.name, game);
            return true;
        }

        if (cpu._maybeBuyLandmark(current, game, 1, 6)) return true;
        const affordable = CARDS.filter(card =>
            shopStock[card.name] > 0 &&
            current.coins >= card.cost &&
            card.cost > 0 &&
            !(card.color === "purple" && current.countCardIncludingDormant(card.name) > 0)
        );
        const sorted = cpu._sortAffordableForDifficulty(affordable, game, current, "strong");
        if (sorted.length === 0) return false;

        const crowdEconomyCard = cpu._bestCrowdEconomyCard(sorted, game, current);
        const stableIncome = cpu._estimateStableIncome(game, current);
        const candidate = crowdEconomyCard || sorted[0];
        if (cpu._shouldHoldForLandmark(current, game, candidate.score, 2)) return true;
        if (stableIncome < 10 && crowdEconomyCard && crowdEconomyCard.score >= 0.7) {
            cpu._buyCard(crowdEconomyCard.card, game, shopStock);
            return true;
        }
        if (cpu._maybeBuyLandmark(current, game, 0, 4)) return true;
        if (candidate.score >= 0.75) {
            cpu._buyCard(candidate.card, game, shopStock);
            return true;
        }
        if (crowdEconomyCard) {
            cpu._buyCard(crowdEconomyCard.card, game, shopStock);
            return true;
        }
        return false;
    },

    _buildExpertV2Simple(cpu, current, game, shopStock) {
        cpu._traceV2Simple('buildCalls');
        const affordableLandmarks = cpu._listExpertV2SimpleAffordableLandmarks(current, game);
        const affordableCards = cpu._listExpertV2SimpleAffordableCards(current, shopStock);

        if (cpu._buyWinningLandmark(current, game)) {
            cpu._traceV2Simple('buildLandmarkChoices');
            return true;
        }

        let bestLandmark = null;
        let bestLandmarkScore = -Infinity;
        if (affordableLandmarks.length > 0) {
            cpu._traceV2Simple('buildLandmarkOptionCalls');
            if (affordableLandmarks.length > 1) cpu._traceV2Simple('buildMultiOptionCalls');
            for (const option of affordableLandmarks) {
                const score = cpu._scoreExpertV2SimpleLandmarkOption(game, option.name);
                if (
                    !bestLandmark ||
                    score > bestLandmarkScore ||
                    (score === bestLandmarkScore && Player.landmarkCost(option.name) > Player.landmarkCost(bestLandmark.name))
                ) {
                    bestLandmark = option;
                    bestLandmarkScore = score;
                }
            }
        }

        if (
            cpu.expertAirportSkipMode === "whenNoLandmark" &&
            affordableLandmarks.length === 0 &&
            current.landmarks[LANDMARK_NAMES.AIRPORT]
        ) {
            cpu._traceV2Simple('buildAirportSkipChoices');
            return false;
        }

        const options = affordableLandmarks.concat(affordableCards);
        cpu._traceV2Simple('buildOptionTotal', options.length);
        if (options.length === 0) {
            cpu._traceV2Simple('buildNoop');
            return false;
        }
        if (affordableLandmarks.length > 0) cpu._traceV2Simple('buildLandmarkCardCompareCalls');
        if (affordableCards.length > 0) cpu._traceV2Simple('buildCardOptionCalls');
        if (options.length > 1) cpu._traceV2Simple('buildMultiOptionCalls');

        if (cpu.expertBuildMode === "random") {
            const choice = cpu._randomChoice(options);
            if (!choice) return false;
            const choiceIndex = options.indexOf(choice);
            cpu._traceV2Simple('buildRandomChoiceIndexTotal', choiceIndex);
            if (choiceIndex === 0) cpu._traceV2Simple('buildRandomChoiceFirst');
            let bestOption = null;
            let bestScore = -Infinity;
            for (const option of options) {
                const score = cpu._scoreExpertV2SimpleBuildOption(game, option, shopStock);
                if (score > bestScore) {
                    bestScore = score;
                    bestOption = option;
                }
            }
            cpu._traceV2SimpleBuildOption('buildRandomChoice', choice);
            cpu._traceV2SimpleBuildOption('buildRandomEvBest', bestOption);
            if (!cpu._sameExpertV2SimpleBuildOption(choice, bestOption)) {
                cpu._traceV2Simple('buildRandomDiffFromEv');
            }
            if (choice.type === 'landmark') {
                cpu._traceV2Simple('buildLandmarkChoices');
                cpu._buyLandmark(choice.name, game);
                return true;
            }
            cpu._traceV2Simple('buildCardChoices');
            cpu._buyCard(choice.card, game, shopStock);
            return true;
        }

        let bestOption = null;
        let bestScore = -Infinity;
        const scoredOptions = [];
        for (const option of options) {
            const breakdown = cpu._scoreExpertV2SimpleBuildOptionBreakdown(game, option, shopStock);
            const score = option.type === 'landmark'
                ? cpu._scoreExpertV2SimpleLandmarkOption(game, option.name)
                : cpu._scoreExpertV2SimpleCardOptionForLandmarkComparison(game, option, breakdown, affordableLandmarks.length > 0);
            scoredOptions.push({ option, breakdown, score });
            if (score > bestScore) {
                bestScore = score;
                bestOption = option;
            }
        }

        const rankedOptions = CPUSelection.stableRankDescending(scoredOptions, entry => entry.score);
        const selectedEntry = cpu._selectNearTie(
            rankedOptions,
            entry => entry.score,
            game,
            'build-expert-v2simple'
        );
        if (selectedEntry) {
            bestOption = selectedEntry.option;
            bestScore = selectedEntry.score;
        }

        if (bestLandmark && bestOption && bestOption.type === 'card') {
            const canCompareLandmark = cpu._shouldCompareExpertV2SimpleLandmarkWithCards(bestLandmark.name);
            const forceLandmarkProgress = cpu._shouldForceExpertV2SimpleLandmarkProgress(game);
            if (canCompareLandmark && !forceLandmarkProgress) cpu._traceV2Simple(`buildLandmarkCardCompareEligible:${bestLandmark.name}`);
            const margin = cpu._expertV2SimpleLandmarkOverrideMargin(game, bestLandmark.name);
            const cardClearsMargin = bestScore >= bestLandmarkScore + margin;
            if (canCompareLandmark && !forceLandmarkProgress && cardClearsMargin) {
                cpu._traceV2Simple(`buildLandmarkCardCompareCardWins:${bestLandmark.name}`);
            } else {
                cpu._traceV2Simple(forceLandmarkProgress
                    ? `buildLandmarkCardCompareBlockedByEndgame:${bestLandmark.name}`
                    : canCompareLandmark
                    ? `buildLandmarkCardCompareBlockedByMargin:${bestLandmark.name}`
                    : `buildLandmarkCardCompareBlockedByLandmark:${bestLandmark.name}`);
                bestOption = bestLandmark;
            }
        }

        if (!bestOption) return false;
        for (const entry of scoredOptions) {
            cpu._traceV2SimpleBuildBreakdown(
                entry.option,
                entry.breakdown,
                cpu._sameExpertV2SimpleBuildOption(entry.option, bestOption)
            );
        }
        cpu._traceV2SimpleBuildOption('buildEvChoice', bestOption);
        if (bestOption.type === 'landmark') {
            cpu._traceV2Simple('buildLandmarkChoices');
            cpu._buyLandmark(bestOption.name, game);
            return true;
        }
        cpu._traceV2Simple('buildCardChoices');
        cpu._buyCard(bestOption.card, game, shopStock);
        return true;
    }
});

if (typeof module !== 'undefined' && module.exports) module.exports = { CPUBuildStrategy };
if (typeof window !== 'undefined') window.CPUBuildStrategy = CPUBuildStrategy;
if (typeof globalThis !== 'undefined') globalThis.CPUBuildStrategy = CPUBuildStrategy;
