const path = require('path');

const { loadRuntime, simulateGameLightweight } = require(path.join(__dirname, 'selfplay.js'));
const {
    DEFAULT_PROFILES,
    profilePlayers,
    profileWeight,
    summarize,
} = require(path.join(__dirname, 'eval-expert-vs-strong.js'));

function parseArgs(argv) {
    let games = 20;
    let seed = 1;
    let maxSteps = 5000;
    let format = 'text';
    let lite = true;
    let fast = false;
    let profiles = DEFAULT_PROFILES.slice();
    let margin = 0.2;

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--games') games = parseInt(argv[++i] || '20', 10);
        else if (arg === '--seed') seed = parseInt(argv[++i] || '1', 10);
        else if (arg === '--max-steps') maxSteps = parseInt(argv[++i] || '5000', 10);
        else if (arg === '--format') format = argv[++i] || 'text';
        else if (arg === '--full') lite = false;
        else if (arg === '--fast') {
            lite = false;
            fast = true;
        } else if (arg === '--profiles') {
            profiles = (argv[++i] || DEFAULT_PROFILES.join(',')).split(',').map(v => v.trim()).filter(Boolean);
        } else if (arg === '--margin') {
            margin = parseFloat(argv[++i] || '0.2');
        }
    }

    return { games, seed, maxSteps, format, lite, fast, profiles, margin };
}

function createCounters() {
    return {
        diceDecisions: 0,
        diceTie: 0,
        diceNearTie: 0,
        diceTwoPreferred: 0,
        rerollDecisions: 0,
        rerollMarginWindow: 0,
        rerollPreferred: 0,
        harborDecisions: 0,
        harborTieOrBetter: 0,
        harborLowRollImproves: 0,
        tvDecisions: 0,
        tvStealTie: 0,
        tvBuiltTie: 0,
        buildCardEvDecisions: 0,
        buildRenovationFirstOptions: 0,
        buildRenovationFirstChosen: 0,
        buildRenovationFirstEarlyChosen: 0,
        buildRenovationFirstEarlyNearBest: 0,
        buildComboBonusChosen: 0,
        buildComboSaturatedChosen: 0,
        buildComboSaturatedWouldFlipHalf: 0,
        buildComboPayoffReadyChosen: 0,
        buildComboPayoffNotReadyChosen: 0,
        buildComboPayoffNotReadyWouldFlipPenalty05: 0,
        buildComboPayoffNotReadyWouldFlipPenalty1: 0,
        buildLoanChosen: 0,
        buildLoanOnlyAffordable: 0,
        buildLoanWouldFlipPenalty2: 0,
        buildLoanDuplicateChosen: 0,
        buildLoanBridgeChosen: 0,
        buildLoanDuplicateNonBridgeChosen: 0,
        buildLoanDuplicateNonBridgeWouldFlipPenalty15: 0,
        buildLoanDuplicateNonBridgeWouldFlipPenalty2: 0,
        buildCleaningCandidate: 0,
        buildCleaningPositiveCandidate: 0,
        buildCleaningChosen: 0,
        buildCleaningNearBest1: 0,
        buildCleaningWouldFlipBonus05: 0,
        buildCleaningWouldFlipBonus1: 0,
        buildRedCandidate: 0,
        buildRedPositiveCandidate: 0,
        buildRedChosen: 0,
        buildRedWouldFlipWeight025: 0,
        buildRedWouldFlipWeight05: 0,
        buildRedWouldFlipWeight1: 0,
        buildRedPaymentCappedChosen: 0,
        buildRedPaymentCapWouldFlip: 0,
        buildRedPaymentCapLossTotal: 0,
        buildRedOneDieCandidate: 0,
        buildRedOneDieUnderweightedCandidate: 0,
        buildRedOneDieWouldFlipFreq6: 0,
        buildRedOneDieChosenUnderweighted: 0,
        buildRedOneDieNames: {},
        buildItCandidate: 0,
        buildItChosen: 0,
        buildItAssumeInvestPositive: 0,
        buildItNearBest1: 0,
        buildItWouldFlipAssumeInvest025: 0,
        buildItWouldFlipAssumeInvest05: 0,
        buildBusinessCandidate: 0,
        buildBusinessPositive: 0,
        buildBusinessChosen: 0,
        buildBusinessNearBest1: 0,
        buildBusinessWouldFlipBonus05: 0,
        buildBusinessWouldFlipBonus1: 0,
        buildBusinessDelayChosen: 0,
        buildBusinessDelayWouldDelay: 0,
        buildBusinessDelayNear: 0,
        buildBusinessDelayDuplicate: 0,
        buildBusinessDelayLowExchangeValue: 0,
        buildBusinessDelaySecondGapLt05: 0,
        buildBusinessDelayWouldFlipPenalty05: 0,
        buildBusinessDelayWouldFlipPenalty1: 0,
        buildParkCandidate: 0,
        buildParkPositive: 0,
        buildParkChosen: 0,
        buildParkNearBest1: 0,
        buildParkWouldFlipBonus05: 0,
        buildParkWouldFlipBonus1: 0,
        buildLandmarkGatedChosen: 0,
        buildLandmarkGatedFarChosen: 0,
        buildLandmarkGatedWouldFlipPenalty05: 0,
        buildLandmarkGatedWouldFlipPenalty1: 0,
        buildGatedHarborFarChosen: 0,
        buildGatedHarborWouldFlipPenalty05: 0,
        buildGatedStationFarChosen: 0,
        buildGatedStationWouldFlipPenalty05: 0,
        buildGatedMallFarChosen: 0,
        buildGatedMallWouldFlipPenalty05: 0,
        buildGatedMallNames: {},
        buildGatedMallFlip05Names: {},
        buildHighPurpleCandidate: 0,
        buildHighPurpleChosen: 0,
        buildHighPurpleEarlyChosen: 0,
        buildHighPurpleLowIncomeChosen: 0,
        buildHighPurpleWouldFlipPenalty1: 0,
        buildHighPurpleWouldFlipPenalty2: 0,
        buildRedSaturatedChosen: 0,
        buildRedSaturatedLowIncomeChosen: 0,
        buildRedSaturatedWouldFlipPenalty05: 0,
        buildRedSaturatedWouldFlipPenalty1: 0,
        buildSpecialSpendChosen: 0,
        buildSpecialSpendNearLandmarkChosen: 0,
        buildSpecialSpendWouldDelayLandmark: 0,
        buildSpecialSpendPenalty05: 0,
        buildSpecialSpendPenalty1: 0,
        buildSpecialSpendNames: {},
        buildSpecialSpendDelayNames: {},
        itInvestDecisions: 0,
        itInvestSaves: 0,
        itInvestNoCoinSaves: 0,
        itInvestCloseToFinishSaves: 0,
        itInvestNearLandmarkSaves: 0,
        itInvestWouldDelayLandmarkSaves: 0,
        itInvestAirportOnlySaves: 0,
        moverDecisions: 0,
        moverCandidates: 0,
        moverDiffStrongLike: 0,
        moverHarmfulGiftAvailable: 0,
        moverHarmfulGiftMissed: 0,
        moverDangerTargetChosen: 0,
        moverLeaderAvoidWouldFlip: 0,
        moverHarmfulGiftWouldFlip: 0,
    };
}

function addCounters(target, source) {
    for (const [key, value] of Object.entries(source)) {
        if (key.endsWith('Names')) {
            if (!target[key]) target[key] = {};
            for (const [name, count] of Object.entries(value || {})) {
                target[key][name] = (target[key][name] || 0) + count;
            }
            continue;
        }
        target[key] = (target[key] || 0) + value;
    }
}

function incrementName(map, name) {
    if (!map || !name) return;
    map[name] = (map[name] || 0) + 1;
}

function rotatePlayers(players, offset) {
    return players.map((_, index) => players[(index + offset) % players.length]);
}

function redOpponentTurnValue(cpu, game, owner, card, options = {}) {
    return redOpponentTurnValues(cpu, game, owner, card, options).value;
}

function redOpponentTurnValues(cpu, game, owner, card, options = {}) {
    if (!card || card.color !== 'red') {
        return { value: 0, cappedValue: 0, oneDieValue: 0, hasOneDieOpponent: false };
    }
    let total = 0;
    let cappedTotal = 0;
    let oneDieTotal = 0;
    let hasOneDieOpponent = false;
    const stationName = options.stationName;
    const oneDieDenominator = options.oneDieDenominator || 6;
    for (const opponent of game.players) {
        if (opponent === owner) continue;
        const freq = cpu._diceFreqForRoller(card.diceNums, opponent);
        if (freq <= 0) continue;
        const value = cpu._cardActivationValue(card, game, owner, opponent, card.diceNums[0]);
        const cappedValue = Math.min(value, opponent.coins);
        total += value * freq / 36;
        cappedTotal += cappedValue * freq / 36;
        if (stationName && opponent.landmarks && !opponent.landmarks[stationName]) {
            hasOneDieOpponent = true;
            oneDieTotal += value * freq / oneDieDenominator;
        } else {
            oneDieTotal += value * freq / 36;
        }
    }
    return {
        value: options.capByCoins ? cappedTotal : total,
        cappedValue: cappedTotal,
        oneDieValue: oneDieTotal,
        hasOneDieOpponent,
    };
}

function parkRedistributionValue(game, current) {
    if (!game || !current || !Array.isArray(game.players) || game.players.length <= 1) return 0;
    const totalCoins = game.players.reduce((sum, player) => sum + Math.max(0, player.coins || 0), 0);
    const each = Math.floor(totalCoins / game.players.length);
    const remainder = totalCoins - each * game.players.length;
    const currentAfter = each + remainder;
    const selfGain = currentAfter - Math.max(0, current.coins || 0);
    const opponentLoss = game.players
        .filter(player => player !== current)
        .reduce((sum, player) => sum + Math.max(0, Math.max(0, player.coins || 0) - each), 0);
    return selfGain + opponentLoss / Math.max(1, game.players.length - 1);
}

function isHighPurpleEarlyTarget(runtime, cpu, game, current, card) {
    if (!card || card.color !== 'purple' || card.name === 'ITベンチャー') return false;
    const names = game.enabledLandmarks ? [...game.enabledLandmarks] : runtime.Player.landmarkNames();
    const remainingLandmarks = names.filter(name => !current.landmarks[name]).length;
    const stableIncome = cpu._estimateStableIncome(game, current);
    return game.players.length >= 4 &&
        remainingLandmarks > 2 &&
        stableIncome < 8 &&
        card.cost >= 6;
}

function isRedSaturatedLowIncomeTarget(runtime, cpu, game, current, card) {
    if (!card || card.color !== 'red' || game.players.length < 4) return false;
    const names = game.enabledLandmarks ? [...game.enabledLandmarks] : runtime.Player.landmarkNames();
    const remainingLandmarks = names.filter(name => !current.landmarks[name]).length;
    const stableIncome = cpu._estimateStableIncome(game, current);
    const redCount = current.cards.filter(candidate => !current.isDormant(candidate) && candidate.color === 'red').length;
    return remainingLandmarks > 2 && stableIncome < 8 && redCount >= 2;
}

function isSpecialSpendTarget(card) {
    if (!card || card.cost <= 0) return false;
    if (card.color === 'purple') return true;
    return ['loan', 'renovation', 'mover'].includes(card.effect);
}

function nearestLandmarkSpendInfo(runtime, game, current, card) {
    if (!game || !current || !card || card.cost <= 0) return null;
    const names = game.enabledLandmarks ? [...game.enabledLandmarks] : runtime.Player.landmarkNames();
    const costs = names
        .filter(name => !current.landmarks[name])
        .map(name => runtime.Player.landmarkCost(name))
        .filter(cost => Number.isFinite(cost) && cost > 0);
    if (costs.length === 0) return null;
    const nearestCost = Math.min(...costs);
    const beforeShortfall = nearestCost - current.coins;
    const afterShortfall = nearestCost - Math.max(0, current.coins - card.cost);
    return {
        beforeShortfall,
        afterShortfall,
        near: beforeShortfall <= 2 && afterShortfall > beforeShortfall,
        wouldDelay: beforeShortfall > 0 && beforeShortfall <= 2 && afterShortfall > 2,
    };
}

function isComboPayoffReady(cpu, game, current, card, shopStock) {
    if (!card) return false;
    const payoffs = cpu._expertV2SimpleFuturePayoffCards(card, cpu.expertComboMode);
    const coinsAfterBuy = Math.max(0, current.coins - card.cost);
    return payoffs.some(name => {
        if (current.countCard(name) > 0) return false;
        if (shopStock && shopStock[name] <= 0) return false;
        const payoff = cpu._cardByName(name);
        if (!payoff) return false;
        return coinsAfterBuy + 3 >= payoff.cost;
    });
}

function landmarkGateInfo(runtime, current, card) {
    if (!card) return null;
    let landmarkName = null;
    if (card.effect === 'harbor' ||
        card.effect === 'harbor_red' ||
        card.effect === 'tuna') {
        landmarkName = runtime.LANDMARK_NAMES.HARBOR;
    } else if ((card.color === 'green' || card.color === 'purple') && card.diceNums.some(dice => dice > 6)) {
        landmarkName = runtime.LANDMARK_NAMES.STATION;
    } else if ((card.category === '飲食店' || card.category === '商店') &&
        card.income > 0 &&
        card.effect !== 'loan') {
        landmarkName = runtime.LANDMARK_NAMES.SHOPPING_MALL;
    }
    if (!landmarkName || current.landmarks[landmarkName]) return null;
    const cost = runtime.Player.landmarkCost(landmarkName);
    return {
        landmarkName,
        shortfall: cost - current.coins,
    };
}

function installBranchDiagnostics(runtime, counters, options = {}) {
    const CPU = runtime.CPU;
    if (!CPU || CPU.__expertV2BranchDiagnosticsInstalled) return () => {};

    const originals = {
        chooseDiceCount: CPU.prototype.chooseDiceCount,
        chooseReroll: CPU.prototype.chooseReroll,
        chooseHarbor: CPU.prototype.chooseHarbor,
        chooseTVTarget: CPU.prototype.chooseTVTarget,
        chooseITInvest: CPU.prototype.chooseITInvest,
        chooseMoverMove: CPU.prototype.chooseMoverMove,
        buildExpertV2Simple: CPU.prototype._buildExpertV2Simple,
    };
    const margin = Number.isFinite(options.margin) ? options.margin : 0.2;
    const EPS = 1e-9;

    CPU.prototype.chooseDiceCount = function chooseDiceCountWithDiagnostics(game) {
        if (this._isExpertV2Simple && this._isExpertV2Simple() && this.expertDiceMode !== 'random') {
            const current = game.currentPlayer();
            if (current && current.landmarks && current.landmarks[runtime.LANDMARK_NAMES.STATION]) {
                const oneScore = this._expectedDiceScoreWithHarbor(game, false);
                const twoScore = this._expectedDiceScoreWithHarbor(game, true);
                counters.diceDecisions++;
                if (Math.abs(twoScore - oneScore) <= EPS) counters.diceTie++;
                if (Math.abs(twoScore - oneScore) <= margin) counters.diceNearTie++;
                if (twoScore >= oneScore) counters.diceTwoPreferred++;
            }
        }
        return originals.chooseDiceCount.call(this, game);
    };

    CPU.prototype.chooseReroll = function chooseRerollWithDiagnostics(game) {
        if (this._isExpertV2Simple && this._isExpertV2Simple() && this.expertRerollMode !== 'random') {
            const dice = game.lastDiceResult;
            const usingTwoDice = game.lastDice2 > 0;
            const keepScore = (currentDice => {
                const current = game.currentPlayer();
                if (current && current.landmarks && current.landmarks[runtime.LANDMARK_NAMES.HARBOR] && currentDice >= 10) {
                    return Math.max(this._estimateRollScore(game, currentDice), this._estimateRollScore(game, currentDice + 2));
                }
                return this._estimateRollScore(game, currentDice);
            })(dice);
            const rerollScore = this._expectedDiceScoreWithHarbor(game, usingTwoDice);
            counters.rerollDecisions++;
            if (rerollScore > keepScore) counters.rerollPreferred++;
            if (rerollScore > keepScore && rerollScore <= keepScore + margin) counters.rerollMarginWindow++;
        }
        return originals.chooseReroll.call(this, game);
    };

    CPU.prototype.chooseHarbor = function chooseHarborWithDiagnostics(game) {
        if (this._isExpertV2Simple && this._isExpertV2Simple() && this.expertHarborMode !== 'random') {
            const keepScore = this._estimateRollScore(game, game.lastDiceResult);
            const bonusScore = this._estimateRollScore(game, game.lastDiceResult + 2);
            counters.harborDecisions++;
            if (bonusScore >= keepScore) counters.harborTieOrBetter++;
            if (game.lastDiceResult <= 6 && bonusScore > keepScore) counters.harborLowRollImproves++;
        }
        return originals.chooseHarbor.call(this, game);
    };

    CPU.prototype.chooseTVTarget = function chooseTVTargetWithDiagnostics(game) {
        if (this._isExpertV2Simple && this._isExpertV2Simple() && this.expertTvMode !== 'random') {
            const ci = game.currentPlayerIndex;
            const targets = [];
            const stealCounts = {};
            const builtCounts = {};
            for (let i = 0; i < game.players.length; i++) {
                if (i === ci) continue;
                const player = game.players[i];
                if (!player || player.coins <= 0) continue;
                const steal = Math.min(5, player.coins);
                const built = player.builtLandmarkCount ? player.builtLandmarkCount() : 0;
                targets.push(i);
                stealCounts[steal] = (stealCounts[steal] || 0) + 1;
                builtCounts[`${steal}:${built}`] = (builtCounts[`${steal}:${built}`] || 0) + 1;
            }
            if (targets.length > 0) {
                counters.tvDecisions++;
                if (Object.values(stealCounts).some(count => count > 1)) counters.tvStealTie++;
                if (Object.values(builtCounts).some(count => count > 1)) counters.tvBuiltTie++;
            }
        }
        return originals.chooseTVTarget.call(this, game);
    };

    CPU.prototype.chooseITInvest = function chooseITInvestWithDiagnostics(game) {
        if (this._isExpertV2Simple && this._isExpertV2Simple()) {
            counters.itInvestDecisions++;
            const current = game.currentPlayer();
            const names = game.enabledLandmarks ? [...game.enabledLandmarks] : runtime.Player.landmarkNames();
            const remaining = names.filter(name => !current.landmarks[name]);
            const nearestCost = remaining
                .map(name => runtime.Player.landmarkCost(name))
                .filter(cost => Number.isFinite(cost) && cost > 0)
                .sort((a, b) => a - b)[0] || Infinity;
            const shortfallBefore = nearestCost - current.coins;
            const shortfallAfterSave = nearestCost - Math.max(0, current.coins - 1);
            const airportOnly = remaining.length === 1 && remaining[0] === runtime.LANDMARK_NAMES.AIRPORT;
            const invest = this.expertInvestMode !== 'never';
            if (invest) {
                counters.itInvestSaves++;
                if (current.coins < 1) counters.itInvestNoCoinSaves++;
                if (remaining.length <= 2) counters.itInvestCloseToFinishSaves++;
                if (shortfallBefore <= 3 || (airportOnly && shortfallBefore <= 6)) counters.itInvestNearLandmarkSaves++;
                if (shortfallBefore <= 0 && shortfallAfterSave > 0) counters.itInvestWouldDelayLandmarkSaves++;
                if (airportOnly) counters.itInvestAirportOnlySaves++;
            }
        }
        return originals.chooseITInvest.call(this, game);
    };

    CPU.prototype.chooseMoverMove = function chooseMoverMoveWithDiagnostics(game) {
        let diagnostic = null;
        if (this._isExpertV2Simple && this._isExpertV2Simple() && this.expertMoverMode !== 'random') {
            const current = game.currentPlayer();
            const ci = game.currentPlayerIndex;
            const candidates = [];
            const maxBuilt = Math.max(...game.players.map(player =>
                player && player.builtLandmarkCount ? player.builtLandmarkCount() : 0
            ));
            for (const card of current.getMinorCards()) {
                const cardIndex = current.cards.indexOf(card);
                for (let i = 0; i < game.players.length; i++) {
                    if (i === ci) continue;
                    const target = game.players[i];
                    const myLoss = this._ownedCardValue(card, game, current);
                    const targetGain = this._receivedCardValue(card, game, target);
                    const dormantBonus = current.isDormant(card) ? 2.5 : 0;
                    const simpleScore = dormantBonus - myLoss - targetGain * 0.6;
                    const leaderPenalty = (target.builtLandmarkCount() >= maxBuilt ? 1.0 : 0) +
                        (target.builtLandmarkCount() >= 4 ? 1.0 : 0);
                    const harmfulGiftBonus = targetGain < 0 ? -targetGain : 0;
                    const strongLikeScore = simpleScore - leaderPenalty + harmfulGiftBonus;
                    candidates.push({
                        card,
                        cardIndex,
                        targetIndex: i,
                        target,
                        simpleScore,
                        strongLikeScore,
                        leaderAvoidScore: simpleScore - leaderPenalty,
                        harmfulGiftScore: simpleScore + harmfulGiftBonus,
                        isHarmfulGift: targetGain < 0,
                        isDangerTarget: target.builtLandmarkCount() >= maxBuilt || target.builtLandmarkCount() >= 4,
                    });
                }
            }
            if (candidates.length > 0) {
                counters.moverDecisions++;
                counters.moverCandidates += candidates.length;
                const simpleBest = candidates.slice().sort((a, b) => b.simpleScore - a.simpleScore)[0];
                const strongLikeBest = candidates.slice().sort((a, b) => b.strongLikeScore - a.strongLikeScore)[0];
                const leaderAvoidBest = candidates.slice().sort((a, b) => b.leaderAvoidScore - a.leaderAvoidScore)[0];
                const harmfulGiftBest = candidates.slice().sort((a, b) => b.harmfulGiftScore - a.harmfulGiftScore)[0];
                if (candidates.some(candidate => candidate.isHarmfulGift)) counters.moverHarmfulGiftAvailable++;
                if (leaderAvoidBest && simpleBest &&
                    (leaderAvoidBest.cardIndex !== simpleBest.cardIndex || leaderAvoidBest.targetIndex !== simpleBest.targetIndex)) {
                    counters.moverLeaderAvoidWouldFlip++;
                }
                if (harmfulGiftBest && simpleBest &&
                    (harmfulGiftBest.cardIndex !== simpleBest.cardIndex || harmfulGiftBest.targetIndex !== simpleBest.targetIndex)) {
                    counters.moverHarmfulGiftWouldFlip++;
                }
                diagnostic = { candidates, strongLikeBest };
            }
        }
        const result = originals.chooseMoverMove.call(this, game);
        if (diagnostic && result) {
            const chosen = diagnostic.candidates.find(candidate =>
                candidate.cardIndex === result.cardIndex && candidate.targetIndex === result.targetIndex
            );
            if (chosen) {
                if (diagnostic.strongLikeBest &&
                    (diagnostic.strongLikeBest.cardIndex !== chosen.cardIndex ||
                        diagnostic.strongLikeBest.targetIndex !== chosen.targetIndex)) {
                    counters.moverDiffStrongLike++;
                }
                if (diagnostic.candidates.some(candidate => candidate.isHarmfulGift) && !chosen.isHarmfulGift) {
                    counters.moverHarmfulGiftMissed++;
                }
                if (chosen.isDangerTarget && this._receivedCardValue(chosen.card, game, chosen.target) > 0) {
                    counters.moverDangerTargetChosen++;
                }
            }
        }
        return result;
    };

    CPU.prototype._buildExpertV2Simple = function buildExpertV2SimpleWithDiagnostics(current, game, shopStock) {
        if (this._isExpertV2Simple && this._isExpertV2Simple() && this.expertBuildMode !== 'random') {
            const affordableLandmarks = runtime.Player.landmarkNames()
                .filter(name =>
                    (!game.enabledLandmarks || game.enabledLandmarks.has(name)) &&
                    !current.landmarks[name] &&
                    current.coins >= runtime.Player.landmarkCost(name)
                );
            if (affordableLandmarks.length === 0) {
                const options = runtime.CARDS.filter(card =>
                    shopStock[card.name] > 0 &&
                    current.coins >= card.cost &&
                    !(card.color === 'purple' && current.countCard(card.name) > 0)
                ).map(card => ({ type: 'card', card }));
                if (options.length > 0) {
                    counters.buildCardEvDecisions++;
                    const scored = options
                        .map(option => ({
                            option,
                            breakdown: this._scoreExpertV2SimpleBuildOptionBreakdown(game, option, shopStock),
                        }))
                        .map(entry => Object.assign(entry, { score: entry.breakdown.total }))
                        .sort((a, b) => b.score - a.score);
                    const best = scored[0] || null;
                    const second = scored[1] || null;
                    const cleaningEntry = scored.find(entry => entry.option.card && entry.option.card.name === '清掃業');
                    if (cleaningEntry) {
                        counters.buildCleaningCandidate++;
                        const cleaningValue = this._estimateCleaningValue(game, current);
                        if (cleaningValue > 0) counters.buildCleaningPositiveCandidate++;
                        if (best && best === cleaningEntry) {
                            counters.buildCleaningChosen++;
                        } else if (best) {
                            if (cleaningEntry.score >= best.score - 1) counters.buildCleaningNearBest1++;
                            if (cleaningEntry.score + 0.5 >= best.score) counters.buildCleaningWouldFlipBonus05++;
                            if (cleaningEntry.score + 1 >= best.score) counters.buildCleaningWouldFlipBonus1++;
                        }
                    }
                    const redScored = scored
                        .map(entry => Object.assign(entry, {
                            baseScoreWithoutRed: entry.score - (entry.breakdown.redOpponentTurnBonus || 0),
                        }))
                        .sort((a, b) => b.baseScoreWithoutRed - a.baseScoreWithoutRed);
                    const baseBest = redScored[0] || null;
                    const redEntries = redScored
                        .map(entry => {
                            const values = redOpponentTurnValues(this, game, current, entry.option.card, {
                                stationName: runtime.LANDMARK_NAMES.STATION,
                                oneDieDenominator: 6,
                            });
                            return Object.assign(entry, {
                                redOpponentEv: values.value,
                                redOpponentEvCapped: values.cappedValue,
                                redOpponentEvOneDieFreq6: values.hasOneDieOpponent ? values.oneDieValue : values.value,
                            });
                        })
                        .filter(entry => entry.redOpponentEv > 0);
                    if (redEntries.length > 0) {
                        counters.buildRedCandidate++;
                        counters.buildRedPositiveCandidate++;
                        if (best && best.option && best.option.card && best.option.card.color === 'red') counters.buildRedChosen++;
                        let flips025 = false;
                        let flips05 = false;
                        let flips1 = false;
                        for (const entry of redEntries) {
                            if (!baseBest || entry === baseBest) continue;
                            if (entry.baseScoreWithoutRed + entry.redOpponentEv * 0.25 >= baseBest.baseScoreWithoutRed) flips025 = true;
                            if (entry.baseScoreWithoutRed + entry.redOpponentEv * 0.5 >= baseBest.baseScoreWithoutRed) flips05 = true;
                            if (entry.baseScoreWithoutRed + entry.redOpponentEv >= baseBest.baseScoreWithoutRed) flips1 = true;
                        }
                        if (flips025) counters.buildRedWouldFlipWeight025++;
                        if (flips05) counters.buildRedWouldFlipWeight05++;
                        if (flips1) counters.buildRedWouldFlipWeight1++;
                        const oneDieEntries = redEntries.filter(entry => entry.redOpponentEvOneDieFreq6 > entry.redOpponentEv);
                        if (oneDieEntries.length > 0) {
                            counters.buildRedOneDieCandidate++;
                            let underweighted = false;
                            let wouldFlip = false;
                            for (const entry of oneDieEntries) {
                                incrementName(counters.buildRedOneDieNames, entry.option.card.name);
                                const currentBonus = entry.breakdown.redOpponentTurnBonus || 0;
                                const freq6Bonus = Math.min(1, Math.max(0, entry.redOpponentEvOneDieFreq6 * 0.25));
                                if (freq6Bonus > currentBonus) {
                                    underweighted = true;
                                    if (best && entry === best) counters.buildRedOneDieChosenUnderweighted++;
                                }
                                const correctedScore = entry.score - currentBonus + freq6Bonus;
                                if (best && entry !== best && correctedScore >= best.score) wouldFlip = true;
                            }
                            if (underweighted) counters.buildRedOneDieUnderweightedCandidate++;
                            if (wouldFlip) counters.buildRedOneDieWouldFlipFreq6++;
                        }
                        if (best && best.option && best.option.card && best.option.card.color === 'red') {
                            const cappedBest = redEntries.find(entry => entry === best);
                            if (cappedBest) {
                                const uncappedBonus = Math.min(1, Math.max(0, cappedBest.redOpponentEv * 0.25));
                                const cappedBonus = Math.min(1, Math.max(0, cappedBest.redOpponentEvCapped * 0.25));
                                const loss = Math.max(0, uncappedBonus - cappedBonus);
                                if (loss > 0) {
                                    counters.buildRedPaymentCappedChosen++;
                                    counters.buildRedPaymentCapLossTotal += loss;
                                    if (second && second.score >= best.score - loss) counters.buildRedPaymentCapWouldFlip++;
                                }
                            }
                        }
                    }
                    const itEntry = scored.find(entry => entry.option.card && entry.option.card.name === 'ITベンチャー');
                    if (itEntry) {
                        counters.buildItCandidate++;
                        if (best && best === itEntry) counters.buildItChosen++;
                        const assumeInvestValue = this._estimateItStartupValue(game, current, { assumeInvest: true });
                        if (assumeInvestValue > 0) counters.buildItAssumeInvestPositive++;
                        if (best && best !== itEntry) {
                            if (itEntry.score >= best.score - 1) counters.buildItNearBest1++;
                            if (itEntry.score + Math.min(1, assumeInvestValue * 0.25) >= best.score) counters.buildItWouldFlipAssumeInvest025++;
                            if (itEntry.score + Math.min(1.5, assumeInvestValue * 0.5) >= best.score) counters.buildItWouldFlipAssumeInvest05++;
                        }
                    }
                    const businessEntry = scored.find(entry => entry.option.card && entry.option.card.name === 'ビジネスセンター');
                    if (businessEntry) {
                        counters.buildBusinessCandidate++;
                        const businessValue = this._estimateBusinessValue(game, current);
                        if (businessValue > 0) counters.buildBusinessPositive++;
                        if (best && best === businessEntry) {
                            counters.buildBusinessChosen++;
                            const spendInfo = nearestLandmarkSpendInfo(runtime, game, current, businessEntry.option.card);
                            counters.buildBusinessDelayChosen++;
                            if (spendInfo && spendInfo.near) counters.buildBusinessDelayNear++;
                            if (spendInfo && spendInfo.wouldDelay) counters.buildBusinessDelayWouldDelay++;
                            if (current.countCard('ビジネスセンター') > 0) counters.buildBusinessDelayDuplicate++;
                            if (businessValue < 1) counters.buildBusinessDelayLowExchangeValue++;
                            if (second && second.score >= businessEntry.score - 0.5) counters.buildBusinessDelaySecondGapLt05++;
                            if (spendInfo && spendInfo.wouldDelay && second && second.score >= businessEntry.score - 0.5) {
                                counters.buildBusinessDelayWouldFlipPenalty05++;
                            }
                            if (spendInfo && spendInfo.wouldDelay && second && second.score >= businessEntry.score - 1) {
                                counters.buildBusinessDelayWouldFlipPenalty1++;
                            }
                        } else if (best) {
                            if (businessEntry.score >= best.score - 1) counters.buildBusinessNearBest1++;
                            if (businessEntry.score + 0.5 >= best.score) counters.buildBusinessWouldFlipBonus05++;
                            if (businessEntry.score + 1 >= best.score) counters.buildBusinessWouldFlipBonus1++;
                        }
                    }
                    const parkEntry = scored.find(entry => entry.option.card && entry.option.card.name === '公園');
                    if (parkEntry) {
                        counters.buildParkCandidate++;
                        const parkValue = parkRedistributionValue(game, current);
                        if (parkValue > 0) counters.buildParkPositive++;
                        if (best && best === parkEntry) {
                            counters.buildParkChosen++;
                        } else if (best) {
                            if (parkEntry.score >= best.score - 1) counters.buildParkNearBest1++;
                            if (parkEntry.score + Math.min(1, parkValue * 0.25) >= best.score) counters.buildParkWouldFlipBonus05++;
                            if (parkEntry.score + Math.min(2, parkValue * 0.5) >= best.score) counters.buildParkWouldFlipBonus1++;
                        }
                    }
                    const highPurpleEntries = scored.filter(entry =>
                        isHighPurpleEarlyTarget(runtime, this, game, current, entry.option.card)
                    );
                    if (highPurpleEntries.length > 0) {
                        counters.buildHighPurpleCandidate++;
                        if (best && highPurpleEntries.includes(best)) {
                            counters.buildHighPurpleChosen++;
                            counters.buildHighPurpleEarlyChosen++;
                            counters.buildHighPurpleLowIncomeChosen++;
                            if (second && second.score >= best.score - 1) counters.buildHighPurpleWouldFlipPenalty1++;
                            if (second && second.score >= best.score - 2) counters.buildHighPurpleWouldFlipPenalty2++;
                        }
                    }
                    if (best && best.option && isRedSaturatedLowIncomeTarget(runtime, this, game, current, best.option.card)) {
                        counters.buildRedSaturatedChosen++;
                        counters.buildRedSaturatedLowIncomeChosen++;
                        if (second && second.score >= best.score - 0.5) counters.buildRedSaturatedWouldFlipPenalty05++;
                        if (second && second.score >= best.score - 1) counters.buildRedSaturatedWouldFlipPenalty1++;
                    }
                    if (best && best.option && best.option.card && isSpecialSpendTarget(best.option.card)) {
                        const spendInfo = nearestLandmarkSpendInfo(runtime, game, current, best.option.card);
                        counters.buildSpecialSpendChosen++;
                        incrementName(counters.buildSpecialSpendNames, best.option.card.name);
                        if (spendInfo && spendInfo.near) {
                            counters.buildSpecialSpendNearLandmarkChosen++;
                            if (second && second.score >= best.score - 0.5) counters.buildSpecialSpendPenalty05++;
                            if (second && second.score >= best.score - 1) counters.buildSpecialSpendPenalty1++;
                        }
                        if (spendInfo && spendInfo.wouldDelay) {
                            counters.buildSpecialSpendWouldDelayLandmark++;
                            incrementName(counters.buildSpecialSpendDelayNames, best.option.card.name);
                        }
                    }
                    const ownedRenovation = current.countCard('改装屋');
                    const renovationOption = options.find(option => option.card && option.card.name === '改装屋');
                    if (ownedRenovation === 0 && renovationOption) {
                        counters.buildRenovationFirstOptions++;
                        const renovationScore = scored.find(entry => entry.option === renovationOption);
                        if (best && best.option === renovationOption) {
                            counters.buildRenovationFirstChosen++;
                            const early = current.builtLandmarkCount() <= 1;
                            if (early) {
                                counters.buildRenovationFirstEarlyChosen++;
                                if (second && renovationScore && second.score >= renovationScore.score - 2) {
                                    counters.buildRenovationFirstEarlyNearBest++;
                                }
                            }
                        }
                    }
                    if (best && best.option && best.option.card) {
                        const chosenCard = best.option.card;
                        const gateInfo = landmarkGateInfo(runtime, current, chosenCard);
                        if (gateInfo) {
                            counters.buildLandmarkGatedChosen++;
                            if (gateInfo.shortfall > 4) {
                                counters.buildLandmarkGatedFarChosen++;
                                if (second && second.score >= best.score - 0.5) counters.buildLandmarkGatedWouldFlipPenalty05++;
                                if (second && second.score >= best.score - 1) counters.buildLandmarkGatedWouldFlipPenalty1++;
                                const flips05 = second && second.score >= best.score - 0.5;
                                if (gateInfo.landmarkName === runtime.LANDMARK_NAMES.HARBOR) {
                                    counters.buildGatedHarborFarChosen++;
                                    if (flips05) counters.buildGatedHarborWouldFlipPenalty05++;
                                } else if (gateInfo.landmarkName === runtime.LANDMARK_NAMES.STATION) {
                                    counters.buildGatedStationFarChosen++;
                                    if (flips05) counters.buildGatedStationWouldFlipPenalty05++;
                                } else if (gateInfo.landmarkName === runtime.LANDMARK_NAMES.SHOPPING_MALL) {
                                    counters.buildGatedMallFarChosen++;
                                    if (flips05) counters.buildGatedMallWouldFlipPenalty05++;
                                    incrementName(counters.buildGatedMallNames, chosenCard.name);
                                    if (flips05) incrementName(counters.buildGatedMallFlip05Names, chosenCard.name);
                                }
                            }
                        }
                        if (best.breakdown.comboUnlockBonus > 0) {
                            counters.buildComboBonusChosen++;
                            const payoffReady = isComboPayoffReady(this, game, current, chosenCard, shopStock);
                            if (payoffReady) {
                                counters.buildComboPayoffReadyChosen++;
                            } else {
                                counters.buildComboPayoffNotReadyChosen++;
                                if (second && second.score >= best.score - 0.5) counters.buildComboPayoffNotReadyWouldFlipPenalty05++;
                                if (second && second.score >= best.score - 1) counters.buildComboPayoffNotReadyWouldFlipPenalty1++;
                            }
                            if (current.countCard(chosenCard.name) >= 2) {
                                counters.buildComboSaturatedChosen++;
                                const halfBonusScore = best.score - best.breakdown.comboUnlockBonus * 0.5;
                                if (second && second.score >= halfBonusScore) {
                                    counters.buildComboSaturatedWouldFlipHalf++;
                                }
                            }
                        }
                        if (chosenCard.name === '貸金業') {
                            counters.buildLoanChosen++;
                            if (options.length === 1) counters.buildLoanOnlyAffordable++;
                            if (second && second.score >= best.score - 2) counters.buildLoanWouldFlipPenalty2++;
                            const loanCopies = current.countCard('貸金業');
                            const remainingCosts = runtime.Player.landmarkNames()
                                .filter(name =>
                                    (!game.enabledLandmarks || game.enabledLandmarks.has(name)) &&
                                    !current.landmarks[name]
                                )
                                .map(name => runtime.Player.landmarkCost(name))
                                .filter(cost => Number.isFinite(cost) && cost > 0);
                            const bridgesLandmark = remainingCosts.some(cost => current.coins < cost && current.coins + 5 >= cost);
                            if (loanCopies >= 1) counters.buildLoanDuplicateChosen++;
                            if (bridgesLandmark) counters.buildLoanBridgeChosen++;
                            if (loanCopies >= 1 && !bridgesLandmark) {
                                counters.buildLoanDuplicateNonBridgeChosen++;
                                if (second && second.score >= best.score - 1.5) counters.buildLoanDuplicateNonBridgeWouldFlipPenalty15++;
                                if (second && second.score >= best.score - 2) counters.buildLoanDuplicateNonBridgeWouldFlipPenalty2++;
                            }
                        }
                    }
                }
            }
        }
        return originals.buildExpertV2Simple.call(this, current, game, shopStock);
    };

    CPU.__expertV2BranchDiagnosticsInstalled = true;
    return () => {
        CPU.prototype.chooseDiceCount = originals.chooseDiceCount;
        CPU.prototype.chooseReroll = originals.chooseReroll;
        CPU.prototype.chooseHarbor = originals.chooseHarbor;
        CPU.prototype.chooseTVTarget = originals.chooseTVTarget;
        CPU.prototype.chooseITInvest = originals.chooseITInvest;
        CPU.prototype.chooseMoverMove = originals.chooseMoverMove;
        CPU.prototype._buildExpertV2Simple = originals.buildExpertV2Simple;
        delete CPU.__expertV2BranchDiagnosticsInstalled;
    };
}

function evaluateProfile(profile, options, runtime) {
    const counters = createCounters();
    const uninstall = installBranchDiagnostics(runtime, counters, options);
    try {
        const players = profilePlayers(profile);
        const wins = Object.fromEntries(players.map(player => [player, 0]));
        const seatWins = players.map(() => 0);
        let turns = 0;
        let exhausted = 0;
        for (let i = 0; i < options.games; i++) {
            const lineup = rotatePlayers(players, i % players.length);
            const result = simulateGameLightweight({
                runtime,
                difficulties: lineup,
                seed: (options.seed || 1) + i,
                maxSteps: options.maxSteps,
                lite: options.lite,
                fast: options.fast,
                expertPreset: 'v2simple',
                expertPurpose: 'live',
                expertBuildMode: 'ev',
                expertDiceMode: 'ev',
                expertRerollMode: 'simple',
                expertInvestMode: 'always',
                expertTvMode: 'simple',
                expertBusinessMode: 'simple',
                expertCleaningMode: 'simple',
                expertHarborMode: 'simple',
                expertMoverMode: 'simple',
                expertRenovationMode: 'simple',
                expertIncomeCapMode: 'none',
                expertComboMode: 'core',
                expertComboWeight: 0.35,
                expertBuildTempoWeight: 0.05,
            });
            turns += result.turns;
            if (result.exhausted) exhausted++;
            if (result.winner >= 0) {
                wins[lineup[result.winner]]++;
                seatWins[result.winner]++;
            }
        }
        const expertWins = wins.expert || 0;
        return {
            profile,
            players,
            weight: profileWeight(profile),
            games: options.games,
            expertWins,
            winRate: options.games > 0 ? expertWins / options.games : 0,
            averageTurns: options.games > 0 ? turns / options.games : 0,
            exhausted,
            seatWins,
            counters,
        };
    } finally {
        uninstall();
    }
}

function runDiagnostics(options) {
    const runtime = loadRuntime({ includeRL: false });
    const entries = options.profiles.map(profile => evaluateProfile(profile, options, runtime));
    const summary = summarize(entries.map(entry => ({
        profile: entry.profile,
        weight: entry.weight,
        winRate: entry.winRate,
    })));
    const totals = createCounters();
    for (const entry of entries) addCounters(totals, entry.counters);
    return { options, summary, totals, entries };
}

function rate(numerator, denominator) {
    return denominator > 0 ? `${((numerator / denominator) * 100).toFixed(1)}%` : 'n/a';
}

function topNameCounts(map, limit = 5) {
    return Object.entries(map || {})
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ja'))
        .slice(0, limit)
        .map(([name, count]) => `${name}:${count}`)
        .join(',');
}

function toText(report) {
    const { options, summary, totals, entries } = report;
    const lines = [
        `games=${options.games} seed=${options.seed} mode=${options.lite ? 'lite' : (options.fast ? 'fast' : 'full')} margin=${options.margin}`,
        `weightedWinRate=${(summary.weightedWinRate * 100).toFixed(1)}% minWinRate=${(summary.minWinRate * 100).toFixed(1)}%`,
        `totals: diceTie=${totals.diceTie}/${totals.diceDecisions} (${rate(totals.diceTie, totals.diceDecisions)}) diceNearTie=${totals.diceNearTie}/${totals.diceDecisions} (${rate(totals.diceNearTie, totals.diceDecisions)}) rerollMarginWindow=${totals.rerollMarginWindow}/${totals.rerollDecisions} (${rate(totals.rerollMarginWindow, totals.rerollDecisions)}) harborLowRollImproves=${totals.harborLowRollImproves}/${totals.harborDecisions} (${rate(totals.harborLowRollImproves, totals.harborDecisions)}) tvStealTie=${totals.tvStealTie}/${totals.tvDecisions} (${rate(totals.tvStealTie, totals.tvDecisions)}) tvBuiltTie=${totals.tvBuiltTie}/${totals.tvDecisions} (${rate(totals.tvBuiltTie, totals.tvDecisions)}) buildRenovationFirstEarlyChosen=${totals.buildRenovationFirstEarlyChosen}/${totals.buildCardEvDecisions} (${rate(totals.buildRenovationFirstEarlyChosen, totals.buildCardEvDecisions)}) buildRenovationFirstEarlyNearBest=${totals.buildRenovationFirstEarlyNearBest}/${totals.buildCardEvDecisions} (${rate(totals.buildRenovationFirstEarlyNearBest, totals.buildCardEvDecisions)}) buildComboSaturatedChosen=${totals.buildComboSaturatedChosen}/${totals.buildCardEvDecisions} (${rate(totals.buildComboSaturatedChosen, totals.buildCardEvDecisions)}) buildComboSaturatedWouldFlipHalf=${totals.buildComboSaturatedWouldFlipHalf}/${totals.buildCardEvDecisions} (${rate(totals.buildComboSaturatedWouldFlipHalf, totals.buildCardEvDecisions)}) buildComboPayoffReadyChosen=${totals.buildComboPayoffReadyChosen}/${totals.buildCardEvDecisions} (${rate(totals.buildComboPayoffReadyChosen, totals.buildCardEvDecisions)}) buildComboPayoffNotReadyChosen=${totals.buildComboPayoffNotReadyChosen}/${totals.buildCardEvDecisions} (${rate(totals.buildComboPayoffNotReadyChosen, totals.buildCardEvDecisions)}) buildComboPayoffNotReadyWouldFlipPenalty05=${totals.buildComboPayoffNotReadyWouldFlipPenalty05}/${totals.buildCardEvDecisions} (${rate(totals.buildComboPayoffNotReadyWouldFlipPenalty05, totals.buildCardEvDecisions)}) buildComboPayoffNotReadyWouldFlipPenalty1=${totals.buildComboPayoffNotReadyWouldFlipPenalty1}/${totals.buildCardEvDecisions} (${rate(totals.buildComboPayoffNotReadyWouldFlipPenalty1, totals.buildCardEvDecisions)}) buildLoanChosen=${totals.buildLoanChosen}/${totals.buildCardEvDecisions} (${rate(totals.buildLoanChosen, totals.buildCardEvDecisions)}) buildLoanWouldFlipPenalty2=${totals.buildLoanWouldFlipPenalty2}/${totals.buildCardEvDecisions} (${rate(totals.buildLoanWouldFlipPenalty2, totals.buildCardEvDecisions)}) buildLoanDuplicateNonBridgeChosen=${totals.buildLoanDuplicateNonBridgeChosen}/${totals.buildCardEvDecisions} (${rate(totals.buildLoanDuplicateNonBridgeChosen, totals.buildCardEvDecisions)}) buildLoanDuplicateNonBridgeWouldFlipPenalty15=${totals.buildLoanDuplicateNonBridgeWouldFlipPenalty15}/${totals.buildCardEvDecisions} (${rate(totals.buildLoanDuplicateNonBridgeWouldFlipPenalty15, totals.buildCardEvDecisions)}) buildLoanDuplicateNonBridgeWouldFlipPenalty2=${totals.buildLoanDuplicateNonBridgeWouldFlipPenalty2}/${totals.buildCardEvDecisions} (${rate(totals.buildLoanDuplicateNonBridgeWouldFlipPenalty2, totals.buildCardEvDecisions)}) buildCleaningCandidate=${totals.buildCleaningCandidate}/${totals.buildCardEvDecisions} (${rate(totals.buildCleaningCandidate, totals.buildCardEvDecisions)}) buildCleaningPositiveCandidate=${totals.buildCleaningPositiveCandidate}/${totals.buildCardEvDecisions} (${rate(totals.buildCleaningPositiveCandidate, totals.buildCardEvDecisions)}) buildCleaningNearBest1=${totals.buildCleaningNearBest1}/${totals.buildCardEvDecisions} (${rate(totals.buildCleaningNearBest1, totals.buildCardEvDecisions)}) buildCleaningWouldFlipBonus05=${totals.buildCleaningWouldFlipBonus05}/${totals.buildCardEvDecisions} (${rate(totals.buildCleaningWouldFlipBonus05, totals.buildCardEvDecisions)}) buildCleaningWouldFlipBonus1=${totals.buildCleaningWouldFlipBonus1}/${totals.buildCardEvDecisions} (${rate(totals.buildCleaningWouldFlipBonus1, totals.buildCardEvDecisions)}) buildRedCandidate=${totals.buildRedCandidate}/${totals.buildCardEvDecisions} (${rate(totals.buildRedCandidate, totals.buildCardEvDecisions)}) buildRedWouldFlipWeight025=${totals.buildRedWouldFlipWeight025}/${totals.buildCardEvDecisions} (${rate(totals.buildRedWouldFlipWeight025, totals.buildCardEvDecisions)}) buildRedWouldFlipWeight05=${totals.buildRedWouldFlipWeight05}/${totals.buildCardEvDecisions} (${rate(totals.buildRedWouldFlipWeight05, totals.buildCardEvDecisions)}) buildRedWouldFlipWeight1=${totals.buildRedWouldFlipWeight1}/${totals.buildCardEvDecisions} (${rate(totals.buildRedWouldFlipWeight1, totals.buildCardEvDecisions)}) buildRedPaymentCappedChosen=${totals.buildRedPaymentCappedChosen}/${totals.buildCardEvDecisions} (${rate(totals.buildRedPaymentCappedChosen, totals.buildCardEvDecisions)}) buildRedPaymentCapWouldFlip=${totals.buildRedPaymentCapWouldFlip}/${totals.buildCardEvDecisions} (${rate(totals.buildRedPaymentCapWouldFlip, totals.buildCardEvDecisions)}) buildRedPaymentCapLossTotal=${totals.buildRedPaymentCapLossTotal.toFixed(1)} buildRedOneDieCandidate=${totals.buildRedOneDieCandidate}/${totals.buildCardEvDecisions} (${rate(totals.buildRedOneDieCandidate, totals.buildCardEvDecisions)}) buildRedOneDieUnderweightedCandidate=${totals.buildRedOneDieUnderweightedCandidate}/${totals.buildCardEvDecisions} (${rate(totals.buildRedOneDieUnderweightedCandidate, totals.buildCardEvDecisions)}) buildRedOneDieWouldFlipFreq6=${totals.buildRedOneDieWouldFlipFreq6}/${totals.buildCardEvDecisions} (${rate(totals.buildRedOneDieWouldFlipFreq6, totals.buildCardEvDecisions)}) buildRedOneDieChosenUnderweighted=${totals.buildRedOneDieChosenUnderweighted}/${totals.buildCardEvDecisions} (${rate(totals.buildRedOneDieChosenUnderweighted, totals.buildCardEvDecisions)}) buildItCandidate=${totals.buildItCandidate}/${totals.buildCardEvDecisions} (${rate(totals.buildItCandidate, totals.buildCardEvDecisions)}) buildItWouldFlipAssumeInvest025=${totals.buildItWouldFlipAssumeInvest025}/${totals.buildCardEvDecisions} (${rate(totals.buildItWouldFlipAssumeInvest025, totals.buildCardEvDecisions)}) buildItWouldFlipAssumeInvest05=${totals.buildItWouldFlipAssumeInvest05}/${totals.buildCardEvDecisions} (${rate(totals.buildItWouldFlipAssumeInvest05, totals.buildCardEvDecisions)}) buildBusinessCandidate=${totals.buildBusinessCandidate}/${totals.buildCardEvDecisions} (${rate(totals.buildBusinessCandidate, totals.buildCardEvDecisions)}) buildBusinessWouldFlipBonus05=${totals.buildBusinessWouldFlipBonus05}/${totals.buildCardEvDecisions} (${rate(totals.buildBusinessWouldFlipBonus05, totals.buildCardEvDecisions)}) buildBusinessWouldFlipBonus1=${totals.buildBusinessWouldFlipBonus1}/${totals.buildCardEvDecisions} (${rate(totals.buildBusinessWouldFlipBonus1, totals.buildCardEvDecisions)}) buildParkCandidate=${totals.buildParkCandidate}/${totals.buildCardEvDecisions} (${rate(totals.buildParkCandidate, totals.buildCardEvDecisions)}) buildParkPositive=${totals.buildParkPositive}/${totals.buildCardEvDecisions} (${rate(totals.buildParkPositive, totals.buildCardEvDecisions)}) buildParkNearBest1=${totals.buildParkNearBest1}/${totals.buildCardEvDecisions} (${rate(totals.buildParkNearBest1, totals.buildCardEvDecisions)}) buildParkWouldFlipBonus05=${totals.buildParkWouldFlipBonus05}/${totals.buildCardEvDecisions} (${rate(totals.buildParkWouldFlipBonus05, totals.buildCardEvDecisions)}) buildParkWouldFlipBonus1=${totals.buildParkWouldFlipBonus1}/${totals.buildCardEvDecisions} (${rate(totals.buildParkWouldFlipBonus1, totals.buildCardEvDecisions)}) buildLandmarkGatedChosen=${totals.buildLandmarkGatedChosen}/${totals.buildCardEvDecisions} (${rate(totals.buildLandmarkGatedChosen, totals.buildCardEvDecisions)}) buildLandmarkGatedFarChosen=${totals.buildLandmarkGatedFarChosen}/${totals.buildCardEvDecisions} (${rate(totals.buildLandmarkGatedFarChosen, totals.buildCardEvDecisions)}) buildLandmarkGatedWouldFlipPenalty05=${totals.buildLandmarkGatedWouldFlipPenalty05}/${totals.buildCardEvDecisions} (${rate(totals.buildLandmarkGatedWouldFlipPenalty05, totals.buildCardEvDecisions)}) buildLandmarkGatedWouldFlipPenalty1=${totals.buildLandmarkGatedWouldFlipPenalty1}/${totals.buildCardEvDecisions} (${rate(totals.buildLandmarkGatedWouldFlipPenalty1, totals.buildCardEvDecisions)}) buildHighPurpleEarlyChosen=${totals.buildHighPurpleEarlyChosen}/${totals.buildCardEvDecisions} (${rate(totals.buildHighPurpleEarlyChosen, totals.buildCardEvDecisions)}) buildHighPurpleWouldFlipPenalty1=${totals.buildHighPurpleWouldFlipPenalty1}/${totals.buildCardEvDecisions} (${rate(totals.buildHighPurpleWouldFlipPenalty1, totals.buildCardEvDecisions)}) buildHighPurpleWouldFlipPenalty2=${totals.buildHighPurpleWouldFlipPenalty2}/${totals.buildCardEvDecisions} (${rate(totals.buildHighPurpleWouldFlipPenalty2, totals.buildCardEvDecisions)}) buildRedSaturatedLowIncomeChosen=${totals.buildRedSaturatedLowIncomeChosen}/${totals.buildCardEvDecisions} (${rate(totals.buildRedSaturatedLowIncomeChosen, totals.buildCardEvDecisions)}) buildRedSaturatedWouldFlipPenalty05=${totals.buildRedSaturatedWouldFlipPenalty05}/${totals.buildCardEvDecisions} (${rate(totals.buildRedSaturatedWouldFlipPenalty05, totals.buildCardEvDecisions)}) buildRedSaturatedWouldFlipPenalty1=${totals.buildRedSaturatedWouldFlipPenalty1}/${totals.buildCardEvDecisions} (${rate(totals.buildRedSaturatedWouldFlipPenalty1, totals.buildCardEvDecisions)}) buildSpecialSpendChosen=${totals.buildSpecialSpendChosen}/${totals.buildCardEvDecisions} (${rate(totals.buildSpecialSpendChosen, totals.buildCardEvDecisions)}) buildSpecialSpendNearLandmarkChosen=${totals.buildSpecialSpendNearLandmarkChosen}/${totals.buildCardEvDecisions} (${rate(totals.buildSpecialSpendNearLandmarkChosen, totals.buildCardEvDecisions)}) buildSpecialSpendWouldDelayLandmark=${totals.buildSpecialSpendWouldDelayLandmark}/${totals.buildCardEvDecisions} (${rate(totals.buildSpecialSpendWouldDelayLandmark, totals.buildCardEvDecisions)}) buildSpecialSpendPenalty05=${totals.buildSpecialSpendPenalty05}/${totals.buildCardEvDecisions} (${rate(totals.buildSpecialSpendPenalty05, totals.buildCardEvDecisions)}) buildSpecialSpendPenalty1=${totals.buildSpecialSpendPenalty1}/${totals.buildCardEvDecisions} (${rate(totals.buildSpecialSpendPenalty1, totals.buildCardEvDecisions)}) itInvestSaves=${totals.itInvestSaves}/${totals.itInvestDecisions} (${rate(totals.itInvestSaves, totals.itInvestDecisions)}) itInvestCloseToFinishSaves=${totals.itInvestCloseToFinishSaves}/${totals.itInvestDecisions} (${rate(totals.itInvestCloseToFinishSaves, totals.itInvestDecisions)}) itInvestNearLandmarkSaves=${totals.itInvestNearLandmarkSaves}/${totals.itInvestDecisions} (${rate(totals.itInvestNearLandmarkSaves, totals.itInvestDecisions)}) itInvestWouldDelayLandmarkSaves=${totals.itInvestWouldDelayLandmarkSaves}/${totals.itInvestDecisions} (${rate(totals.itInvestWouldDelayLandmarkSaves, totals.itInvestDecisions)})`,
        `gated: harbor=${totals.buildGatedHarborFarChosen}/${totals.buildCardEvDecisions} flip05=${totals.buildGatedHarborWouldFlipPenalty05}/${totals.buildCardEvDecisions} station=${totals.buildGatedStationFarChosen}/${totals.buildCardEvDecisions} flip05=${totals.buildGatedStationWouldFlipPenalty05}/${totals.buildCardEvDecisions} mall=${totals.buildGatedMallFarChosen}/${totals.buildCardEvDecisions} flip05=${totals.buildGatedMallWouldFlipPenalty05}/${totals.buildCardEvDecisions} mallNames=${topNameCounts(totals.buildGatedMallNames)} mallFlip05Names=${topNameCounts(totals.buildGatedMallFlip05Names)}`,
        `businessDelay: chosen=${totals.buildBusinessDelayChosen}/${totals.buildCardEvDecisions} near=${totals.buildBusinessDelayNear}/${totals.buildCardEvDecisions} delay=${totals.buildBusinessDelayWouldDelay}/${totals.buildCardEvDecisions} duplicate=${totals.buildBusinessDelayDuplicate}/${totals.buildCardEvDecisions} lowExchange=${totals.buildBusinessDelayLowExchangeValue}/${totals.buildCardEvDecisions} secondGap05=${totals.buildBusinessDelaySecondGapLt05}/${totals.buildCardEvDecisions} flip05=${totals.buildBusinessDelayWouldFlipPenalty05}/${totals.buildCardEvDecisions} flip1=${totals.buildBusinessDelayWouldFlipPenalty1}/${totals.buildCardEvDecisions}`,
        `redOneDie: names=${topNameCounts(totals.buildRedOneDieNames)}`,
        `specialSpend: names=${topNameCounts(totals.buildSpecialSpendNames)} delayNames=${topNameCounts(totals.buildSpecialSpendDelayNames)}`,
        `mover: decisions=${totals.moverDecisions} candidates=${totals.moverCandidates} diffStrongLike=${totals.moverDiffStrongLike}/${totals.moverDecisions} harmfulAvailable=${totals.moverHarmfulGiftAvailable}/${totals.moverDecisions} harmfulMissed=${totals.moverHarmfulGiftMissed}/${totals.moverDecisions} dangerTarget=${totals.moverDangerTargetChosen}/${totals.moverDecisions} leaderFlip=${totals.moverLeaderAvoidWouldFlip}/${totals.moverDecisions} harmfulFlip=${totals.moverHarmfulGiftWouldFlip}/${totals.moverDecisions}`,
    ];
    for (const entry of entries) {
        const counters = entry.counters;
        lines.push(
            `${entry.profile}: winRate=${(entry.winRate * 100).toFixed(1)}% avgTurns=${entry.averageTurns.toFixed(1)} exhausted=${entry.exhausted} ` +
            `diceTie=${counters.diceTie}/${counters.diceDecisions} rerollMarginWindow=${counters.rerollMarginWindow}/${counters.rerollDecisions} ` +
            `harborLowRollImproves=${counters.harborLowRollImproves}/${counters.harborDecisions} tvStealTie=${counters.tvStealTie}/${counters.tvDecisions} ` +
            `renovationFirstEarly=${counters.buildRenovationFirstEarlyChosen}/${counters.buildCardEvDecisions} ` +
            `comboSaturated=${counters.buildComboSaturatedChosen}/${counters.buildCardEvDecisions} ` +
            `comboPayoffNotReady=${counters.buildComboPayoffNotReadyChosen}/${counters.buildCardEvDecisions} ` +
            `comboPayoffNotReadyFlip05=${counters.buildComboPayoffNotReadyWouldFlipPenalty05}/${counters.buildCardEvDecisions} ` +
            `loan=${counters.buildLoanChosen}/${counters.buildCardEvDecisions} ` +
            `loanDuplicateNonBridge=${counters.buildLoanDuplicateNonBridgeChosen}/${counters.buildCardEvDecisions} ` +
            `loanDuplicateNonBridgeFlip15=${counters.buildLoanDuplicateNonBridgeWouldFlipPenalty15}/${counters.buildCardEvDecisions} ` +
            `cleaningNearBest1=${counters.buildCleaningNearBest1}/${counters.buildCardEvDecisions} ` +
            `redFlip025=${counters.buildRedWouldFlipWeight025}/${counters.buildCardEvDecisions} ` +
            `redOneDieFlip=${counters.buildRedOneDieWouldFlipFreq6}/${counters.buildCardEvDecisions} ` +
            `redPaymentCapFlip=${counters.buildRedPaymentCapWouldFlip}/${counters.buildCardEvDecisions} ` +
            `itFlip025=${counters.buildItWouldFlipAssumeInvest025}/${counters.buildCardEvDecisions} ` +
            `businessFlip05=${counters.buildBusinessWouldFlipBonus05}/${counters.buildCardEvDecisions} ` +
            `businessDelay=${counters.buildBusinessDelayWouldDelay}/${counters.buildCardEvDecisions} ` +
            `parkFlip05=${counters.buildParkWouldFlipBonus05}/${counters.buildCardEvDecisions} ` +
            `gatedFar=${counters.buildLandmarkGatedFarChosen}/${counters.buildCardEvDecisions} ` +
            `gatedFlip05=${counters.buildLandmarkGatedWouldFlipPenalty05}/${counters.buildCardEvDecisions} ` +
            `gatedHarbor=${counters.buildGatedHarborFarChosen}/${counters.buildCardEvDecisions} ` +
            `gatedStation=${counters.buildGatedStationFarChosen}/${counters.buildCardEvDecisions} ` +
            `gatedMall=${counters.buildGatedMallFarChosen}/${counters.buildCardEvDecisions} ` +
            `highPurpleEarly=${counters.buildHighPurpleEarlyChosen}/${counters.buildCardEvDecisions} ` +
            `redSaturated=${counters.buildRedSaturatedLowIncomeChosen}/${counters.buildCardEvDecisions} ` +
            `specialSpendDelay=${counters.buildSpecialSpendWouldDelayLandmark}/${counters.buildCardEvDecisions} ` +
            `itDelay=${counters.itInvestWouldDelayLandmarkSaves}/${counters.itInvestDecisions}`
        );
    }
    return lines.join('\n');
}

function main() {
    const options = parseArgs(process.argv.slice(2));
    const report = runDiagnostics(options);
    if (options.format === 'json') {
        console.log(JSON.stringify(report, null, 2));
        return;
    }
    console.log(toText(report));
}

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_PROFILES,
    createCounters,
    installBranchDiagnostics,
    parseArgs,
    runDiagnostics,
    toText,
};
