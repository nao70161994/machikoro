'use strict';

const CPU_PENDING_EVALUATION = typeof CPUEvaluation !== 'undefined'
    ? CPUEvaluation
    : require('./cpuEvaluation').CPUEvaluation;

function strongLivePendingSearchPlan(cpu, game, candidateCount) {
    const totalCardCount = game.players.reduce((sum, player) =>
        sum + (player && Array.isArray(player.cards) ? player.cards.length : 0), 0);
    return CPU_PENDING_EVALUATION.strongLiveSearchPlan({
        difficulty: cpu.difficulty,
        simulationMode: cpu.simulationMode,
        candidateCount,
        totalCardCount,
    });
}

const CPUPendingDecision = Object.freeze({
    chooseTVTarget(cpu, game) {
        return cpu._profileDecision("chooseTVTarget", () => {
            const ci = game.currentPlayerIndex;
            if (cpu._isExpertV2Simple()) {
                if (cpu.expertTvMode === "random") {
                    const targets = [];
                    for (let i = 0; i < game.players.length; i++) {
                        if (i === ci) continue;
                        const player = game.players[i];
                        if (!player) continue;
                        targets.push(i);
                    }
                    return cpu._randomChoice(targets) ?? -1;
                }
                const candidates = [];
                for (let i = 0; i < game.players.length; i++) {
                    if (i === ci) continue;
                    const player = game.players[i];
                    if (!player || player.coins <= 0) continue;
                    candidates.push({
                        index: i,
                        player,
                        steal: Math.min(5, player.coins),
                        built: player.builtLandmarkCount ? player.builtLandmarkCount() : 0,
                        coins: player.coins,
                    });
                }
                const best = cpu.expertTvMode === "denial"
                    ? CPUSelection.firstMax(candidates, candidate =>
                        cpu._scoreExpertV2SimpleTVTarget(game, candidate.player, candidate.steal, candidate.built)
                    )
                    : CPUSelection.firstLexicographicMax(candidates, [
                        candidate => candidate.steal,
                        candidate => candidate.built,
                        candidate => candidate.coins,
                    ]);
                if (best) return best.index;
                for (let i = 0; i < game.players.length; i++) {
                    if (i !== ci && game.players[i]) return i;
                }
                return -1;
            }
            cpu._syncExpertTuningForGame(game);
            if (cpu.difficulty === "expert") {
                const disruptionScale = cpu._expertDisruptionScale(game, ci);
                let bestScore = -Infinity;
                let targetIndex = -1;
                for (const i of cpu._expertCandidateTargetIndexes(game, ci)) {
                    const target = game.players[i];
                    if (!target || target.coins <= 0) continue;
                    const targetDistance = cpu._estimateWinDistance(target, game);
                    const racePressure = Math.max(0, 18 - targetDistance);
                    const nextLandmarkPressure = cpu._coinsTowardsNextLandmark(target) * 0.4;
                    const steal = Math.min(5, target.coins);
                    const score = cpu._scoreExpertPendingChoice(game, clone => clone.resolveTV(i)) +
                        cpu._expertCrowdDisruptionBonus(game, i, 12 * disruptionScale) +
                        racePressure * 0.7 * disruptionScale +
                        nextLandmarkPressure * disruptionScale +
                        cpu._tvLandmarkDenialValue(target, steal, game);
                    if (score > bestScore) {
                        bestScore = score;
                        targetIndex = i;
                    }
                }
                if (targetIndex >= 0) return targetIndex;
            }
            let bestScore = -Infinity;
            let targetIndex = -1;
            const attackScale = cpu._strongCrowdAttackScale(game);
            const disruptionReady = cpu._strongCrowdDisruptionReady(game, game.currentPlayer());
            const searchPlan = strongLivePendingSearchPlan(cpu, game, game.players.length - 1);
            for (let i = 0; i < game.players.length; i++) {
                if (i === ci) continue;
                const opponent = game.players[i];
                const steal = Math.min(5, opponent.coins);
                const score = (cpu.difficulty === "strong" && game.players.length >= 4)
                    ? (disruptionReady && !searchPlan.useHeuristic
                        ? cpu._scoreStrongPendingChoice(game, clone => clone.resolveTV(i)) + steal * 0.4
                        : steal * 0.5)
                    : steal * 2.2 +
                        opponent.builtLandmarkCount() * 2.5 * attackScale +
                        cpu._coinsTowardsNextLandmark(opponent) * 0.25 * attackScale;
                if (score > bestScore) {
                    bestScore = score;
                    targetIndex = i;
                }
            }
            return targetIndex;
        });
    },

    chooseBusinessMove(cpu, game) {
        return cpu._profileDecision("chooseBusinessMove", () => {
            const current = game.currentPlayer();
            const ci = game.currentPlayerIndex;
            const myCards = current.getMinorCards();
            if (myCards.length === 0) return null;
            if (cpu._isExpertV2Simple()) {
                if (cpu.expertBusinessMode === "random") return cpu._chooseRandomBusinessMove(game);
                if (cpu.expertBusinessMode === "harmfulGift") return cpu._chooseHarmfulGiftBusinessMove(game);
                return cpu._chooseSimpleBusinessMove(game);
            }
            cpu._syncExpertTuningForGame(game);
    
            let bestMove = null;
            const attackScale = cpu._strongCrowdAttackScale(game);
            const disruptionReady = cpu._strongCrowdDisruptionReady(game, current);
            const disruptionScale = cpu._expertDisruptionScale(game, ci);
            const candidateTargets = cpu._expertCandidateTargetIndexes(game, ci);
            const myCandidateCount = Math.min(myCards.length, cpu.difficulty === "expert" ? 3 : 2);
            const targetCandidateLimit = cpu.difficulty === "expert" ? 4 : 3;
            const businessCandidateCount = candidateTargets.reduce((sum, targetIndex) => {
                const target = game.players[targetIndex];
                return sum + myCandidateCount * Math.min(
                    target && typeof target.getMinorCards === "function" ? target.getMinorCards().length : 0,
                    targetCandidateLimit
                );
            }, 0);
            const searchPlan = strongLivePendingSearchPlan(cpu, game, businessCandidateCount);
            cpu._forEachBusinessMoveCandidate(game, candidateTargets, ({ myCard, myIndex, target, targetIndex, theirCard, theirIndex }) => {
                const move = {
                    myCard: myIndex,
                    targetIndex,
                    theirCard: theirIndex,
                };
                let score;
                if (cpu.difficulty === "expert" && !cpu._expertCrowdNormalPlan(game)) {
                    const targetDistance = cpu._estimateWinDistance(target, game);
                    const racePressure = Math.max(0, 18 - targetDistance);
                    const denialValue = cpu._ownedCardValue(theirCard, game, target);
                    const giftValue = cpu._receivedCardValue(myCard, game, target);
                    score = cpu._scoreExpertPendingChoice(game, clone =>
                        clone.resolveBusiness(move.myCard, move.targetIndex, move.theirCard)
                    ) +
                        cpu._expertCrowdDisruptionBonus(game, targetIndex, 10 * disruptionScale) +
                        denialValue * 0.45 * disruptionScale +
                        racePressure * 0.75 * disruptionScale -
                        giftValue * 0.2;
                    } else if (cpu.difficulty === "strong" && game.players.length >= 4) {
                    if (cpu._strongLiteUseHeuristicChoices() || searchPlan.useHeuristic) {
                        score = cpu._receivedCardValue(theirCard, game, current) -
                            cpu._ownedCardValue(myCard, game, current) * 0.9 +
                            target.builtLandmarkCount() * 0.6 * attackScale +
                            (target.coins >= 10 ? 1.2 * attackScale : 0) -
                            cpu._receivedCardValue(myCard, game, target) * 0.25;
                    } else {
                        score = disruptionReady
                            ? cpu._scoreStrongPendingChoice(game, clone =>
                                clone.resolveBusiness(move.myCard, move.targetIndex, move.theirCard)
                            )
                            : cpu._receivedCardValue(theirCard, game, current) - cpu._ownedCardValue(myCard, game, current) * 0.9;
                    }
                } else {
                    const myLoss = cpu._ownedCardValue(myCard, game, current);
                    const gain = cpu._receivedCardValue(theirCard, game, current);
                    const denial = cpu._ownedCardValue(theirCard, game, target) * 0.7 * attackScale;
                    const gift = cpu._receivedCardValue(myCard, game, target) * 0.45;
                    score = gain + denial - myLoss - gift +
                        target.builtLandmarkCount() * 0.8 * attackScale +
                        (target.coins >= 10 ? 1.5 * attackScale : 0);
                }
                if (!bestMove || score > bestMove.score) {
                    bestMove = Object.assign({ score }, move);
                }
            });
            return bestMove;
        });
    },

    chooseCleaningTarget(cpu, game) {
        return cpu._profileDecision("chooseCleaningTarget", () => {
            const current = game.currentPlayer();
            if (cpu._isExpertV2Simple()) {
                const counts = new Map();
                for (const player of game.players) {
                    for (const card of player.getMinorCards()) {
                        if (player.isDormant(card)) continue;
                        const entry = counts.get(card.name) || { self: 0, opponents: 0 };
                        if (player === current) entry.self++;
                        else entry.opponents++;
                        counts.set(card.name, entry);
                    }
                }
                if (cpu.expertCleaningMode === "random") {
                    return cpu._randomChoice(Array.from(counts.keys())) || null;
                }
                let bestName = null;
                let bestScore = -Infinity;
                let bestOpponentCount = -1;
                for (const [name, count] of counts.entries()) {
                    const score = cpu.expertCleaningMode === "value"
                        ? cpu._scoreExpertV2SimpleCleaningValue(game, name)
                        : count.opponents - count.self * 1.2;
                    if (score > bestScore || (score === bestScore && count.opponents > bestOpponentCount)) {
                        bestScore = score;
                        bestOpponentCount = count.opponents;
                        bestName = name;
                    }
                }
                return bestName;
            }
            cpu._syncExpertTuningForGame(game);
            let best = null;
            const attackScale = cpu._strongCrowdAttackScale(game);
            const disruptionReady = cpu._strongCrowdDisruptionReady(game, current);
            const disruptionScale = cpu._expertDisruptionScale(game, game.currentPlayerIndex);
            const names = cpu._expertCandidateCleaningNames(game);
            const searchPlan = strongLivePendingSearchPlan(cpu, game, names.length);
            for (const name of names) {
                let score;
                if (cpu.difficulty === "expert" && !cpu._expertCrowdNormalPlan(game)) {
                    let targetValue = 0;
                    let racePressure = 0;
                    for (let i = 0; i < game.players.length; i++) {
                        const player = game.players[i];
                        if (player === current) continue;
                        const distance = cpu._estimateWinDistance(player, game);
                        const pressure = Math.max(0, 18 - distance);
                        for (const card of player.getMinorCards()) {
                            if (card.name !== name || player.isDormant(card)) continue;
                            targetValue += cpu._ownedCardValue(card, game, player);
                            racePressure += pressure;
                        }
                    }
                    score = cpu._scoreExpertPendingChoice(game, clone => clone.resolveCleaning(name)) +
                        cpu._expertCrowdCleaningWeight(game, name, 3 * disruptionScale) +
                        targetValue * 0.18 * disruptionScale +
                        racePressure * 0.45 * disruptionScale;
                } else if (cpu.difficulty === "strong" && game.players.length >= 4) {
                    score = disruptionReady && !searchPlan.useHeuristic
                        ? cpu._scoreStrongPendingChoice(game, clone => clone.resolveCleaning(name))
                        : (() => {
                            let ownPenalty = 0;
                            let targetGain = 0;
                            for (const player of game.players) {
                                for (const card of player.getMinorCards()) {
                                    if (card.name !== name || player.isDormant(card)) continue;
                                    const value = cpu._ownedCardValue(card, game, player);
                                    if (player === current) ownPenalty += value;
                                    else targetGain += value;
                                }
                            }
                            return targetGain * 0.35 - ownPenalty * 1.4;
                        })();
                } else {
                    let ownPenalty = 0;
                    let targetGain = 0;
                    let count = 0;
                    for (const player of game.players) {
                        for (const card of player.getMinorCards()) {
                            if (card.name !== name || player.isDormant(card)) continue;
                            count++;
                            const value = cpu._ownedCardValue(card, game, player);
                            if (player === current) ownPenalty += value;
                            else targetGain += value;
                        }
                    }
                    score = count * attackScale + targetGain * 0.7 * attackScale - ownPenalty * 1.2;
                }
                if (!best || score > best.score) best = { cardName: name, score };
            }
            return best ? best.cardName : null;
        });
    },

    chooseMoverMove(cpu, game) {
        return cpu._profileDecision("chooseMoverMove", () => {
            const current = game.currentPlayer();
            const ci = game.currentPlayerIndex;
            if (cpu._isExpertV2Simple()) {
                if (cpu.expertMoverMode === "random") {
                    const moves = [];
                    for (const card of current.getMinorCards()) {
                        for (let i = 0; i < game.players.length; i++) {
                            if (i === ci) continue;
                            moves.push({
                                cardIndex: current.cards.indexOf(card),
                                targetIndex: i,
                            });
                        }
                    }
                    return cpu._randomChoice(moves);
                }
                let best = null;
                for (const card of current.getMinorCards()) {
                    const cardIndex = current.cards.indexOf(card);
                    for (let i = 0; i < game.players.length; i++) {
                        if (i === ci) continue;
                        const target = game.players[i];
                        const score = (current.isDormant(card) ? 2.5 : 0) -
                            cpu._ownedCardValue(card, game, current) -
                            cpu._receivedCardValue(card, game, target) * 0.6;
                        if (!best || score > best.score) {
                            best = { cardIndex, targetIndex: i, score };
                        }
                    }
                }
                return best ? { cardIndex: best.cardIndex, targetIndex: best.targetIndex } : null;
            }
            cpu._syncExpertTuningForGame(game);
            const attackScale = cpu._strongCrowdAttackScale(game);
            let best = null;
            const myCards = current.getMinorCards();
            const searchPlan = strongLivePendingSearchPlan(
                cpu,
                game,
                myCards.length * Math.max(0, game.players.length - 1)
            );
            for (const card of myCards) {
                for (let i = 0; i < game.players.length; i++) {
                    if (i === ci) continue;
                    const target = game.players[i];
                    const move = {
                        cardIndex: current.cards.indexOf(card),
                        targetIndex: i,
                    };
                    let score;
                    if (cpu.difficulty === "expert" && !cpu._expertCrowdNormalPlan(game)) {
                        score = cpu._scoreExpertPendingChoice(game, clone =>
                            clone.resolveMover(move.cardIndex, move.targetIndex)
                        ) - cpu._expertCrowdDisruptionBonus(game, i, 8);
                } else if (cpu.difficulty === "strong" && game.players.length >= 4) {
                        score = searchPlan.useHeuristic
                            ? 4 - cpu._ownedCardValue(card, game, current) -
                                cpu._receivedCardValue(card, game, target) * 0.6 * attackScale -
                                target.builtLandmarkCount() * 0.6 * attackScale +
                                (current.isDormant(card) ? 2.5 : 0)
                            : cpu._scoreStrongPendingChoice(game, clone =>
                                clone.resolveMover(move.cardIndex, move.targetIndex)
                            );
                    } else {
                        const myLoss = cpu._ownedCardValue(card, game, current);
                        const gift = cpu._receivedCardValue(card, game, target);
                        score = 4 - myLoss - gift * 0.6 * attackScale -
                            target.builtLandmarkCount() * 0.6 * attackScale +
                            (current.isDormant(card) ? 2.5 : 0);
                    }
                    if (!best || score > best.score) {
                        best = Object.assign({ score }, move);
                    }
                }
            }
            return best;
        });
    },

    chooseRenovationTarget(cpu, game) {
        return cpu._profileDecision("chooseRenovationTarget", () => {
            const current = game.currentPlayer();
            if (cpu._isExpertV2Simple()) {
                const names = Object.entries(current.landmarks)
                    .filter(([name, built]) => built && name !== LANDMARK_NAMES.YAKUSHO)
                    .map(([name]) => name);
                if (cpu.expertRenovationMode === "random") return cpu._randomChoice(names);
                let best = null;
                for (const name of names) {
                    const score = cpu._builtLandmarkValue(name, current, game);
                    if (!best || score < best.score) best = { name, score };
                }
                return best ? best.name : null;
            }
            cpu._syncExpertTuningForGame(game);
            if (cpu.difficulty === "expert" && !cpu._expertCrowdNormalPlan(game)) {
                let bestScore = -Infinity;
                let bestName = null;
                for (const [name, built] of Object.entries(current.landmarks)) {
                    if (!built || name === LANDMARK_NAMES.YAKUSHO) continue;
                    const demolitionValue = cpu._builtLandmarkValue(name, current, game);
                    const score = cpu._scoreExpertPendingChoice(game, clone => clone.resolveRenovation(name)) - demolitionValue * 3;
                    if (score > bestScore) {
                        bestScore = score;
                        bestName = name;
                    }
                }
                if (bestName) return bestName;
            }
            let best = null;
            for (const [name, built] of Object.entries(current.landmarks)) {
                if (!built || name === LANDMARK_NAMES.YAKUSHO) continue;
                const score = cpu._builtLandmarkValue(name, current, game);
                if (!best || score < best.score) best = { name, score };
            }
            return best ? best.name : null;
        });
    },

    chooseITInvest(cpu, game) {
        const current = game.currentPlayer();
        if (cpu._isExpertV2Simple()) {
            cpu._traceV2Simple('itDecisions');
            const invest = cpu._chooseExpertV2SimpleITInvest(game);
            cpu._traceV2Simple(invest ? 'itTrue' : 'itFalse');
            return invest;
        }
        cpu._syncExpertTuningForGame(game);
        if (current.coins < 1) return false;
        if (cpu.difficulty === "weak") return false;

        const remainingLandmarks = Player.landmarkNames()
            .filter(name => (!game.enabledLandmarks || game.enabledLandmarks.has(name)) && !current.landmarks[name]);
        const urgentLandmarkCandidates = remainingLandmarks
            .filter(name => (!game.enabledLandmarks || game.enabledLandmarks.has(name)) && !current.landmarks[name])
            .map(name => ({
                name,
                shortfall: Player.landmarkCost(name) - current.coins,
                urgency: cpu._landmarkUrgency(name, current, game),
            }))
            .filter(entry => entry.shortfall >= 0);
        const urgentLandmark = CPUSelection.stableRankLexicographic(urgentLandmarkCandidates, [
            { valueOf: entry => entry.shortfall, direction: CPUSelection.directions.ASCENDING },
            { valueOf: entry => entry.urgency, direction: CPUSelection.directions.DESCENDING },
        ])[0];
        const closeToFinish = remainingLandmarks.length <= 2;
        const airportOnly = remainingLandmarks.length === 1 && remainingLandmarks[0] === LANDMARK_NAMES.AIRPORT;
        const nearLandmark = urgentLandmark && (urgentLandmark.shortfall <= 3 || (airportOnly && urgentLandmark.shortfall <= 6));
        const overSaved = current.itVentureCoins >= 8;

        if ((closeToFinish && nearLandmark) || (airportOnly && overSaved)) return false;
        if (cpu.difficulty === "normal") return !closeToFinish;

        if (cpu.difficulty === "expert") {
            if (cpu._expertCrowdNormalPlan(game)) return !closeToFinish;
            if (cpu._shouldExpertForceLandmarkPlan(current, game)) return false;
            if (remainingLandmarks.length <= 3 && urgentLandmark && urgentLandmark.shortfall <= 4) return false;
            if (remainingLandmarks.length <= 4 && current.builtLandmarkCount() >= 2 && urgentLandmark && urgentLandmark.shortfall <= 6) return false;
            if (urgentLandmark && urgentLandmark.shortfall <= 1 && urgentLandmark.urgency >= 7) return false;
            const focusIndex = game.currentPlayerIndex;
            const skipScore = cpu._expectedExpertChoiceValue(
                game,
                focusIndex,
                [{ weight: 1 }],
                clone => clone.resolveIT(false)
            );
            const saveScore = cpu._expectedExpertChoiceValue(
                game,
                focusIndex,
                [{ weight: 1 }],
                clone => clone.resolveIT(true)
            );
            const baselineSave = game.players.length >= 3 || current.itVentureCoins >= 1 || current.coins >= 8;
            if (baselineSave && saveScore >= skipScore - 2) return true;
            return saveScore >= skipScore;
        }

        return (!urgentLandmark || urgentLandmark.shortfall > 0 || urgentLandmark.urgency < 7) && !closeToFinish;
    }
});

if (typeof module !== 'undefined' && module.exports) module.exports = { CPUPendingDecision };
if (typeof window !== 'undefined') window.CPUPendingDecision = CPUPendingDecision;
if (typeof globalThis !== 'undefined') globalThis.CPUPendingDecision = CPUPendingDecision;
