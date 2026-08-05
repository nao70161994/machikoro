'use strict';

const CPUBuildStrategy = Object.freeze({
    chooseBuildAction(cpu, game, shopStock) {
        cpu._selectedBuildAction = null;
        if (!game || game.phase !== GAME_PHASES.BUILD || game.builtThisTurn) return null;
        cpu._collectingBuildAction = true;
        try {
            cpu._syncExpertTuningForGame(game);
            if (cpu.difficulty === "weak") {
                cpu.buildWeak(game, shopStock);
            } else if (cpu.difficulty === "normal") {
                cpu.buildNormal(game, shopStock);
            } else if (cpu.difficulty === "strong") {
                cpu.buildStrong(game, shopStock);
            } else {
                cpu.buildExpert(game, shopStock);
            }
            return cpu._selectedBuildAction;
        } finally {
            cpu._collectingBuildAction = false;
        }
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
        if (sorted.length > 0 && cpu._shouldHoldForLandmark(current, game, sorted[0].score, 2)) return;
        if (sorted.length > 0 && sorted[0].score >= 0.9) {
            cpu._buyCard(sorted[0].card, game, shopStock);
            return;
        }
        if (cpu._maybeBuyLandmark(current, game, 0, 4)) return;
        if (sorted.length > 0) cpu._buyCard(sorted[0].card, game, shopStock);
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
            const best = options[0];
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
    }
});

if (typeof module !== 'undefined' && module.exports) module.exports = { CPUBuildStrategy };
if (typeof window !== 'undefined') window.CPUBuildStrategy = CPUBuildStrategy;
if (typeof globalThis !== 'undefined') globalThis.CPUBuildStrategy = CPUBuildStrategy;
