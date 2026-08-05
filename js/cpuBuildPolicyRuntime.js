'use strict';

const CPUBuildPolicyRuntime = Object.freeze({
    _tryEndgameBuild(cpu, current, game, shopStock, difficulty) {
        if (!cpu._isEndgameMode(current, game, difficulty === "strong" ? 3 : 2)) return false;
        if (cpu._buyLateGameLandmark(current, game)) return true;
        const affordable = CARDS.filter(card =>
            shopStock[card.name] > 0 &&
            current.coins >= card.cost &&
            card.cost > 0 &&
            !(card.color === "purple" && current.countCardIncludingDormant(card.name) > 0)
        );
        const ranked = cpu._sortAffordableForDifficulty(affordable, game, current, difficulty);
        if (ranked.length === 0) return false;
        const bestLandmark = cpu._bestAffordableLandmark(current, game);
        if (bestLandmark && current.coins + (difficulty === "strong" ? 3 : 2) >= bestLandmark.cost) return false;
        if (difficulty === "expert" && cpu._shouldExpertStopBuyingCards(current, game, ranked[0].card)) return false;
        if (ranked[0].score >= 0.8) {
            cpu._buyCard(ranked[0].card, game, shopStock);
            return true;
        }
        return false;
    },

    _chooseExpertV2SimpleITInvest(cpu, game) {
        if (cpu.expertInvestMode === "never") return false;
        if (cpu.expertInvestMode !== "landmarkAware") return true;
        const current = game.currentPlayer();
        if (!current || current.coins < 1) return false;
        const remaining = cpu._remainingEnabledLandmarks(current, game);
        if (remaining.length === 0) return true;
        const bestShortfall = CPUSelection.stableRankAscending(
            remaining
                .map(name => Player.landmarkCost(name) - current.coins)
                .filter(shortfall => Number.isFinite(shortfall)),
            shortfall => shortfall
        )[0];
        if (bestShortfall <= 0) return false;
        if (remaining.length <= 3 && bestShortfall <= 3) return false;
        return true;
    },

    _buyWinningLandmark(cpu, current, game) {
        const remaining = Player.landmarkNames()
            .filter(name => (!game.enabledLandmarks || game.enabledLandmarks.has(name)) && !current.landmarks[name]);
        if (remaining.length !== 1) return false;
        const name = remaining[0];
        if (current.coins < Player.landmarkCost(name)) return false;
        cpu._buyLandmark(name, game);
        return true;
    },

    _listExpertV2SimpleAffordableLandmarks(cpu, current, game) {
        return CPULegalMoves.affordableLandmarkNames(
            current,
            game.enabledLandmarks,
            Player.landmarkNames(),
            Player.landmarkCost,
            true
        ).map(name => ({ type: 'landmark', name }));
    },

    _listExpertV2SimpleAffordableCards(cpu, current, shopStock) {
        return CPULegalMoves.affordableCards(current, shopStock, CARDS)
            .map(card => ({ type: 'card', card }));
    },

    _shouldCompareExpertV2SimpleLandmarkWithCards(cpu, landmarkName) {
        if (cpu.expertLandmarkCardCompareTargets === "none") return false;
        if (cpu.expertLandmarkCardCompareTargets === "all") return true;
        if (cpu.expertLandmarkCardCompareTargets === "harbor") {
            return landmarkName === LANDMARK_NAMES.HARBOR;
        }
        if (cpu.expertLandmarkCardCompareTargets === "mall") {
            return landmarkName === LANDMARK_NAMES.SHOPPING_MALL;
        }
        return landmarkName === LANDMARK_NAMES.HARBOR ||
            landmarkName === LANDMARK_NAMES.SHOPPING_MALL;
    },

    _shouldForceExpertV2SimpleLandmarkProgress(cpu, game) {
        const current = game.currentPlayer();
        return cpu._remainingEnabledLandmarks(current, game).length <= cpu.expertLandmarkProgressRemaining;
    },

    _expertV2SimpleLandmarkOverrideMargin(cpu, game, landmarkName) {
        return cpu.expertLandmarkCardMargin;
    },

    _scoreExpertV2SimpleCardOptionForLandmarkComparison(cpu, game, option, breakdown, hasAffordableLandmark) {
        const penalty = cpu._expertV2SimpleLandmarkCardPenalty(game, option, hasAffordableLandmark);
        if (!hasAffordableLandmark || cpu.expertLandmarkCardCompareMode !== "delta") return breakdown.total - penalty;
        const current = game.currentPlayer();
        const beforeOne = cpu._expectedDiceScoreWithHarbor(game, false);
        const beforeTwo = current.landmarks[LANDMARK_NAMES.STATION]
            ? cpu._expectedDiceScoreWithHarbor(game, true)
            : -Infinity;
        const beforeRoll = Math.max(beforeOne, beforeTwo);
        const deltaEv = breakdown.baseEv - beforeRoll;
        return (
            deltaEv * 8 +
            (breakdown.comboUnlockBonus || 0) +
            (breakdown.tempoBonus || 0) +
            (breakdown.redOpponentTurnBonus || 0) -
            (breakdown.renovationRiskPenalty || 0) -
            penalty
        );
    },

    _expertV2SimpleLandmarkCardPenalty(cpu, game, option, hasAffordableLandmark) {
        return CPUEvaluation.landmarkCardPenalty(
            hasAffordableLandmark,
            cpu.expertLandmarkCardPenaltyMode,
            option,
            CARD_EFFECTS,
            () => cpu._remainingEnabledLandmarks(game.currentPlayer(), game).length
        );
    },

    _scoreExpertV2SimpleLandmarkOption(cpu, game, name) {
        const current = game.currentPlayer();
        const beforeOne = cpu._expectedDiceScoreWithHarbor(game, false);
        const beforeTwo = current.landmarks[LANDMARK_NAMES.STATION]
            ? cpu._expectedDiceScoreWithHarbor(game, true)
            : -Infinity;
        const beforeRoll = Math.max(beforeOne, beforeTwo);

        const clone = cpu._cloneGame(game);
        const cloneCurrent = clone.currentPlayer();
        cloneCurrent.coins -= Player.landmarkCost(name);
        cloneCurrent.landmarks[name] = true;
        const afterOne = cpu._expectedDiceScoreWithHarbor(clone, false);
        const afterTwo = cloneCurrent.landmarks[LANDMARK_NAMES.STATION]
            ? cpu._expectedDiceScoreWithHarbor(clone, true)
            : -Infinity;
        const rollDelta = Math.max(afterOne, afterTwo) - beforeRoll;

        return (
            Player.landmarkCost(name) * cpu.expertLandmarkCostWeight +
            cpu._landmarkUrgency(name, current, game) * 0.6 +
            rollDelta * 2.5 +
            cpu._expertV2SimpleLandmarkEffectBonus(game, name, rollDelta)
        );
    },

    _expertV2SimpleLandmarkEffectBonus(cpu, game, name, rollDelta = 0) {
        const current = game.currentPlayer();
        const remaining = cpu._remainingEnabledLandmarks(current, game).length;
        const mallTargetCardCount = name === LANDMARK_NAMES.SHOPPING_MALL
            ? current.cards.filter(card =>
                card.category === CARD_CATEGORIES.RESTAURANT || card.category === CARD_CATEGORIES.SHOP
            ).length
            : 0;
        const harborCardCount = name === LANDMARK_NAMES.HARBOR
            ? current.cards.filter(card =>
                card.effect === CARD_EFFECTS.HARBOR ||
                card.effect === CARD_EFFECTS.HARBOR_RED ||
                card.effect === CARD_EFFECTS.TUNA
            ).length
            : 0;
        const rollSwing = name === LANDMARK_NAMES.RADIO_TOWER
            ? Math.max(0, cpu._expectedDiceScoreWithHarbor(game, true) - cpu._expectedDiceScoreWithHarbor(game, false))
            : 0;
        return CPUEvaluation.expertLandmarkEffectBonus(name, {
            remainingLandmarkCount: remaining,
            hasStation: !!current.landmarks[LANDMARK_NAMES.STATION],
            mallTargetCardCount,
            harborCardCount,
            harborBaseBonus: cpu.expertHarborLandmarkBaseBonus,
            rollDelta,
            rollSwing,
        }, LANDMARK_NAMES);
    },

    _sameExpertV2SimpleBuildOption(cpu, a, b) {
        return CPUEvaluation.sameBuildOption(a, b);
    },

    _expertV2SimpleLateBasicDuplicatePenalty(cpu, game, option, deltaEv) {
        const current = game && game.currentPlayer();
        return CPUEvaluation.lateBasicDuplicatePenalty(
            cpu._isExpertV2Simple(),
            game && game.players ? game.players.length : 0,
            current,
            option,
            deltaEv,
            LANDMARK_NAMES.SHOPPING_MALL,
            () => cpu._remainingEnabledLandmarks(current, game).length
        );
    },

    _expertV2SimpleRedOpponentTurnBonus(cpu, game, option) {
        if (!cpu._isExpertV2Simple() || !option || option.type !== 'card' || !option.card) return 0;
        const card = option.card;
        if (card.color !== 'red') return 0;
        const current = game.currentPlayer();
        let total = 0;
        for (const opponent of game.players) {
            if (opponent === current) continue;
            const freq = cpu._diceFreqForRoller(card.diceNums, opponent);
            if (freq <= 0) continue;
            total += cpu._expertV2SimpleRedOpponentFutureValue(card, game, current, opponent) * freq / 36;
        }
        return Math.min(1, Math.max(0, total * 0.25));
    },

    _expertV2SimpleRedOpponentFutureValue(cpu, card, game, owner, roller) {
        if (!card || card.color !== "red") return 0;
        if (card.effect === CARD_EFFECTS.FRENCHR) {
            return roller.landmarks && roller.builtLandmarkCount() >= 2 ? cpu._strongSoftCapValue(card.income) : 0;
        }
        if (card.effect === CARD_EFFECTS.MEMBERBAR) {
            return roller.landmarks && roller.builtLandmarkCount() >= 3 ? cpu._strongSoftCapValue(Math.max(roller.coins, 4)) : 0;
        }
        return cpu._cardActivationValue(card, game, owner, roller, card.diceNums[0]);
    },

    _expertV2SimpleRenovationRiskPenalty(cpu, game, option) {
        if (!cpu._isExpertV2Simple() || !option || option.type !== 'card' || !option.card) return 0;
        if (option.card.name !== "改装屋") return 0;
        const current = game.currentPlayer();
        const owned = current.countCard("改装屋");
        if (owned <= 0) return 0;
        const nextPlayer = Object.create(current);
        nextPlayer.countCard = name => (name === "改装屋" ? owned + 1 : current.countCard(name));
        const scaledPenalty = cpu._duplicateRenovationPenalty(nextPlayer, "strong", game) * 0.2;
        return Math.min(4, Math.max(1.5, scaledPenalty));
    },

    _expertV2SimpleBuildTempoBonus(cpu, game) {
        if (!cpu._isExpertV2Simple() || cpu.expertBuildTempoWeight <= 0) return 0;
        const current = game.currentPlayer();
        const names = game.enabledLandmarks ? [...game.enabledLandmarks] : Player.landmarkNames();
        const remainingCosts = names
            .filter(name => !current.landmarks[name])
            .map(name => Player.landmarkCost(name))
            .filter(cost => Number.isFinite(cost) && cost > 0);
        if (remainingCosts.length === 0) return 0;
        return Math.min(current.coins, Math.min(...remainingCosts)) * cpu.expertBuildTempoWeight;
    },

    _expertV2SimpleComboUnlockBonus(cpu, game, option, shopStock = null) {
        if (!cpu._isExpertV2Simple() || (cpu.expertComboMode !== "unlock" && cpu.expertComboMode !== "core")) return 0;
        if (!option || option.type !== 'card' || !option.card) return 0;
        const current = game.currentPlayer();
        const card = option.card;
        const futurePayoffs = cpu._expertV2SimpleFuturePayoffCards(card, cpu.expertComboMode);
        if (futurePayoffs.length === 0) return 0;

        let bonus = 0;
        for (const payoffName of futurePayoffs) {
            if (current.countCard(payoffName) > 0) continue;
            if (shopStock && shopStock[payoffName] <= 0) continue;
            const payoff = cpu._cardByName(payoffName);
            if (!payoff) continue;
            const marginalIncome = cpu._expertV2SimpleMarginalComboIncome(card, payoff);
            if (marginalIncome <= 0) continue;
            const activationRate = cpu._cardDiceFreq(payoff, game, current) / 36;
            bonus += marginalIncome * activationRate * cpu.expertComboWeight;
        }
        return Math.min(bonus, 3);
    },

    _expertV2SimpleFuturePayoffCards(cpu, card, mode = "unlock") {
        return CPUEvaluation.futurePayoffCardNames(card, mode, CARD_CATEGORIES);
    },

    _expertV2SimpleMarginalComboIncome(cpu, enabler, payoff) {
        return CPUEvaluation.marginalComboIncome(
            enabler,
            payoff,
            CARD_CATEGORIES,
            CARD_EFFECTS
        );
    },

    _buyLateGameLandmark(cpu, current, game) {
        const remaining = Player.landmarkNames()
            .filter(name => (!game.enabledLandmarks || game.enabledLandmarks.has(name)) && !current.landmarks[name]);
        if (remaining.length === 0) return false;
        if (cpu.difficulty !== "expert" && remaining.length > 2) return false;
        if (cpu.difficulty === "expert" && remaining.length > 3) return false;
        const affordableCandidates = remaining
            .map(name => ({ name, cost: Player.landmarkCost(name), urgency: cpu._landmarkUrgency(name, current, game) }))
            .filter(entry => current.coins >= entry.cost);
        const affordable = CPUSelection.stableRankLexicographic(affordableCandidates, [
            { valueOf: entry => entry.urgency, direction: CPUSelection.directions.DESCENDING },
            { valueOf: entry => entry.cost, direction: CPUSelection.directions.ASCENDING },
        ]);
        if (affordable.length === 0) return false;
        if (cpu.difficulty === "expert" && remaining.length === 3 && affordable[0].urgency < 8) return false;
        cpu._buyLandmark(affordable[0].name, game);
        return true;
    },

    _shouldExpertForceLandmarkPlan(cpu, current, game) {
        if (cpu.difficulty !== "expert") return false;
        const remaining = cpu._remainingEnabledLandmarks(current, game);
        if (remaining.length === 0 || remaining.length > 3) return false;
        const bestLandmark = cpu._bestAffordableLandmark(current, game);
        const urgentLandmark = CPUSelection.stableRankLexicographic(remaining
            .map(name => ({
                name,
                shortfall: Player.landmarkCost(name) - current.coins,
                urgency: cpu._landmarkUrgency(name, current, game),
            })), [
            { valueOf: entry => entry.urgency, direction: CPUSelection.directions.DESCENDING },
            { valueOf: entry => entry.shortfall, direction: CPUSelection.directions.ASCENDING },
        ])[0];
        if (bestLandmark && bestLandmark.urgency >= 7) return true;
        if (urgentLandmark && urgentLandmark.urgency >= 7 && urgentLandmark.shortfall <= 2) return true;
        if (current.builtLandmarkCount() >= 3 && urgentLandmark && urgentLandmark.shortfall <= 4) return true;
        return false;
    },

    _shouldExpertStopBuyingCards(cpu, current, game, card = null) {
        if (cpu.difficulty !== "expert") return false;
        if (!cpu._shouldExpertForceLandmarkPlan(current, game)) return false;
        const remaining = cpu._remainingEnabledLandmarks(current, game).length;
        const bestLandmark = cpu._bestAffordableLandmark(current, game);
        if (bestLandmark && bestLandmark.urgency >= 7) return true;
        if (remaining <= 2) return true;
        if (card && card.cost >= 3) return true;
        return current.builtLandmarkCount() >= 3;
    },

    _shouldHoldForLandmark(cpu, current, game, bestCardScore, maxShortfall) {
        return CPUEvaluation.shouldHoldForLandmark(Player.landmarkNames(), {
            isEnabled: name => !!game.enabledLandmarks && game.enabledLandmarks.has(name),
            isBuilt: name => !!current.landmarks[name],
            costOf: Player.landmarkCost,
            urgencyOf: name => cpu._landmarkUrgency(name, current, game),
            coins: current.coins,
            bestCardScore,
            maxShortfall,
        });
    },

    _maybeBuyLandmark(cpu, current, game, reserve = 0, minUrgency = 0) {
        const landmarkPriority = [LANDMARK_NAMES.STATION, LANDMARK_NAMES.SHOPPING_MALL, LANDMARK_NAMES.HARBOR, LANDMARK_NAMES.RADIO_TOWER, LANDMARK_NAMES.AMUSEMENT_PARK, LANDMARK_NAMES.AIRPORT];
        let best = null;
        for (const name of landmarkPriority) {
            const cost = Player.landmarkCost(name);
            if (!game.enabledLandmarks || !game.enabledLandmarks.has(name)) continue;
            if (current.landmarks[name] || current.coins < cost + reserve) continue;
            const urgency = cpu._landmarkUrgency(name, current, game);
            if (urgency < minUrgency) continue;
            if (!best || urgency > best.urgency || (urgency === best.urgency && cost < best.cost)) {
                best = { name, cost, urgency };
            }
        }
        if (best) {
            cpu._buyLandmark(best.name, game);
            return true;
        }
        return false;
    },

    _trySynergy(cpu, current, game, shopStock) {
        const try_ = (name, cost, condition) => {
            if (!condition) return false;
            const card = cpu._cardByName(name);
            if (card && shopStock[name] > 0 && current.coins >= cost) {
                cpu._buyCard(card, game, shopStock);
                return true;
            }
            return false;
        };

        if (try_("チーズ工場",  5, current.countCard("牧場") >= 2)) return true;
        if (try_("家具工場",    3, current.countCard("森林") + current.countCard("鉱山") >= 2)) return true;
        if (try_("ワイナリー",  3, current.countCard("ブドウ園") >= 2)) return true;
        if (try_("フラワーショップ", 1, current.countCard("花畑") >= 2)) return true;
        if (try_("青果市場",    2, current.cards.filter(c => c.category === CARD_CATEGORIES.FARM).length >= 3)) return true;
        if (try_("食品倉庫",    2, current.cards.filter(c => c.category === CARD_CATEGORIES.RESTAURANT).length >= 3)) return true;
        const crowdAttackReady = game.players.length < 4 || cpu._estimateStableIncome(game, current) >= 12 || current.builtLandmarkCount() >= 4;
        if (try_("テレビ局",    7, crowdAttackReady && game.players.some(p => p !== current && p.coins >= 6) && current.countCard("テレビ局") === 0)) return true;
        if (try_("税務署",      4, crowdAttackReady && game.players.some(p => p !== current && p.coins >= 10) && current.countCard("税務署") === 0)) return true;

        return false;
    }
});

if (typeof module !== 'undefined' && module.exports) module.exports = { CPUBuildPolicyRuntime };
if (typeof window !== 'undefined') window.CPUBuildPolicyRuntime = CPUBuildPolicyRuntime;
if (typeof globalThis !== 'undefined') globalThis.CPUBuildPolicyRuntime = CPUBuildPolicyRuntime;
