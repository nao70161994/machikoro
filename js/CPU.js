class CPU {
    constructor(difficulty, options = {}) {
        this.difficulty = difficulty;
        this.expertPreset = options.expertPreset || "default";
        this.expertTuning = Object.assign(
            {},
            CPU._resolveExpertTuning(this.expertPreset),
            options.expertTuning || {}
        );
    }

    static _expertPresets() {
        return {
            default: {
                coinWeight: 1.1,
                turnWeight: 3.2,
                landmarkWeight: 14,
                builtLandmarkWeight: 8,
                landmarkReachWeight: 6,
                stableIncomeWeight: 1.4,
                redPressureWeight: 1.1,
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
        };
    }

    static _resolveExpertTuning(presetName = "default") {
        const presets = CPU._expertPresets();
        return Object.assign({}, presets.default, presets[presetName] || {});
    }

    takeTurn(game, shopStock) {
        // scheduleCPU側で処理
    }

    _playerCountProfile(game) {
        const count = game.players.length;
        if (count >= 4) {
            return {
                landmarkBias: 0.9,
                blueFactor: 1.18,
                redFactor: 1.25,
                greenFactor: 0.95,
                purpleFactor: 1.18,
                massAttackFactor: 1.3,
                airportBias: 0.9,
            };
        }
        if (count === 3) {
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
    }

    // ===== サイコロ判断 =====

    _cardActivationValue(card, game, owner, roller, dice) {
        const ownerIndex = game.players.indexOf(owner);
        const rollerIndex = game.players.indexOf(roller);
        const isCurrentTurn = ownerIndex === rollerIndex;
        const opponents = game.players.filter((_, i) => i !== ownerIndex);
        const livingCards = owner.cards.filter(c => !owner.isDormant(c));

        if (card.color === "blue") {
            if (card.effect === CARD_EFFECTS.HARBOR) return owner.landmarks[LANDMARK_NAMES.HARBOR] ? card.income : 0;
            if (card.effect === CARD_EFFECTS.TUNA) return owner.landmarks[LANDMARK_NAMES.HARBOR] ? 7 : 0;
            return card.income;
        }

        if (card.color === "red") {
            if (isCurrentTurn) return 0;
            if (card.effect === CARD_EFFECTS.HARBOR_RED) return roller.landmarks[LANDMARK_NAMES.HARBOR] ? card.income : 0;
            if (card.effect === CARD_EFFECTS.FRENCHR) return roller.landmarks && roller.builtLandmarkCount() >= 2 ? card.income : 0;
            if (card.effect === CARD_EFFECTS.MEMBERBAR) return roller.landmarks && roller.builtLandmarkCount() >= 3 ? Math.max(roller.coins, 4) : 0;
            return card.income + (roller.landmarks[LANDMARK_NAMES.SHOPPING_MALL] && card.category === CARD_CATEGORIES.RESTAURANT ? 1 : 0);
        }

        if (!isCurrentTurn) return 0;

        switch (card.effect) {
            case CARD_EFFECTS.CHEESE:
            case CARD_EFFECTS.FURNITURE:
            case CARD_EFFECTS.FLOWER:
            case CARD_EFFECTS.MARKET:
            case CARD_EFFECTS.FOODWAREHOUSE:
            case CARD_EFFECTS.DRINKFACTORY:
            case CARD_EFFECTS.WINERY:
            case CARD_EFFECTS.FEWLANDMARK:
                return GameManager.calcCardIncome(card, owner, game);
            case CARD_EFFECTS.STADIUM:
                return opponents.length * card.income;
            case CARD_EFFECTS.TV:
                return Math.min(card.income, Math.max(...opponents.map(p => p.coins), 0));
            case CARD_EFFECTS.PUBLISHER:
                return opponents.reduce((sum, p) =>
                    sum + p.cards.filter(c => (c.category === CARD_CATEGORIES.RESTAURANT || c.category === CARD_CATEGORIES.SHOP) && !p.isDormant(c)).length, 0);
            case CARD_EFFECTS.TAXOFFICE:
                return opponents.filter(p => p.coins >= 10).length * 5;
            case CARD_EFFECTS.LOAN:
                return (dice === 5 || dice === 6) ? -2 : 0;
            case CARD_EFFECTS.BUSINESS:
                return 4;
            case CARD_EFFECTS.CLEANING:
                return game.players.reduce((sum, p) => sum + p.getMinorCards().filter(c => !p.isDormant(c)).length, 0) * 0.4;
            case CARD_EFFECTS.MOVER:
                return 4;
            case CARD_EFFECTS.RENOVATION:
                return owner.builtLandmarkCount() ? 3 : 0;
            case CARD_EFFECTS.ITSTARTUP:
                return opponents.length * Math.max(owner.itVentureCoins, 1);
            case CARD_EFFECTS.PARK:
                return 2;
            default: {
                let amount = card.income;
                if (owner.landmarks[LANDMARK_NAMES.SHOPPING_MALL] &&
                    (card.category === CARD_CATEGORIES.RESTAURANT || card.category === CARD_CATEGORIES.SHOP)) amount += 1;
                return amount;
            }
        }
    }

    _estimateRollScore(game, dice) {
        let score = 0;
        const current = game.currentPlayer();
        for (const player of game.players) {
            for (const card of player.cards) {
                if (player.isDormant(card)) continue;
                if (!card.diceNums.includes(dice)) continue;
                const value = this._cardActivationValue(card, game, player, current, dice);
                if (player === current) score += value;
                else score -= value * (card.color === "blue" ? 0.7 : 1);
            }
        }
        return score;
    }

    _expectedDiceScore(game, useTwo) {
        const weights = useTwo
            ? { 2:1, 3:2, 4:3, 5:4, 6:5, 7:6, 8:5, 9:4, 10:3, 11:2, 12:1 }
            : { 1:1, 2:1, 3:1, 4:1, 5:1, 6:1 };
        let totalWeight = 0;
        let totalScore = 0;
        for (const [diceText, weight] of Object.entries(weights)) {
            const dice = parseInt(diceText, 10);
            totalWeight += weight;
            totalScore += this._estimateRollScore(game, dice) * weight;
        }
        return totalWeight > 0 ? totalScore / totalWeight : 0;
    }

    chooseDiceCount(game) {
        if (this.difficulty === "weak") return Math.random() < 0.5;
        const oneScore = this._expectedDiceScore(game, false);
        const twoScore = this._expectedDiceScore(game, true);
        if (this.difficulty === "normal") {
            return twoScore > oneScore + 0.8;
        }
        return twoScore >= oneScore;
    }

    chooseReroll(game) {
        const dice = game.lastDiceResult;
        if (this.difficulty === "weak") return Math.random() < 0.5;
        const currentScore = this._estimateRollScore(game, dice);
        const usingTwoDice = game.lastDice2 > 0;
        const rerollScore = this._expectedDiceScore(game, usingTwoDice);
        if (this.difficulty === "normal") return rerollScore > currentScore + 1.2;
        return rerollScore > currentScore + 0.3;
    }

    chooseHarbor(game) {
        if (this.difficulty === "weak") return Math.random() < 0.5;
        const keepScore = this._estimateRollScore(game, game.lastDiceResult);
        const bonusScore = this._estimateRollScore(game, game.lastDiceResult + 2);
        if (this.difficulty === "normal") return bonusScore > keepScore + 0.5;
        return bonusScore >= keepScore;
    }

    chooseTVTarget(game) {
        const ci = game.currentPlayerIndex;
        let bestScore = -Infinity;
        let targetIndex = -1;
        for (let i = 0; i < game.players.length; i++) {
            if (i === ci) continue;
            const opponent = game.players[i];
            const steal = Math.min(5, opponent.coins);
            const score = steal * 2.2 +
                opponent.builtLandmarkCount() * 2.5 +
                this._coinsTowardsNextLandmark(opponent) * 0.25;
            if (score > bestScore) {
                bestScore = score;
                targetIndex = i;
            }
        }
        return targetIndex;
    }

    chooseBusinessMove(game) {
        const current = game.currentPlayer();
        const ci = game.currentPlayerIndex;
        const myCards = current.getMinorCards();
        if (myCards.length === 0) return null;

        let bestMove = null;
        for (const myCard of myCards) {
            const myLoss = this._ownedCardValue(myCard, game, current);
            for (let i = 0; i < game.players.length; i++) {
                if (i === ci) continue;
                const target = game.players[i];
                for (const theirCard of target.getMinorCards()) {
                    const gain = this._receivedCardValue(theirCard, game, current);
                    const denial = this._ownedCardValue(theirCard, game, target) * 0.7;
                    const gift = this._receivedCardValue(myCard, game, target) * 0.45;
                    const score = gain + denial - myLoss - gift +
                        target.builtLandmarkCount() * 0.8 +
                        (target.coins >= 10 ? 1.5 : 0);
                    if (!bestMove || score > bestMove.score) {
                        bestMove = {
                            myCard: current.cards.indexOf(myCard),
                            targetIndex: i,
                            theirCard: target.cards.indexOf(theirCard),
                            score
                        };
                    }
                }
            }
        }
        return bestMove;
    }

    resolveBusiness(game) {
        const move = this.chooseBusinessMove(game);
        if (!move) {
            game.pendingBusiness = false;
            game.phase = GAME_PHASES.BUILD;
            return;
        }
        game.resolveBusiness(move.myCard, move.targetIndex, move.theirCard);
    }

    chooseCleaningTarget(game) {
        const current = game.currentPlayer();
        let best = null;
        const names = [...new Set(game.players.flatMap(p =>
            p.getMinorCards().filter(c => !p.isDormant(c)).map(c => c.name)))];
        for (const name of names) {
            let ownPenalty = 0;
            let targetGain = 0;
            let count = 0;
            for (const player of game.players) {
                for (const card of player.getMinorCards()) {
                    if (card.name !== name || player.isDormant(card)) continue;
                    count++;
                    const value = this._ownedCardValue(card, game, player);
                    if (player === current) ownPenalty += value;
                    else targetGain += value;
                }
            }
            const score = count + targetGain * 0.7 - ownPenalty * 1.2;
            if (!best || score > best.score) best = { cardName: name, score };
        }
        return best && best.score > 0 ? best.cardName : null;
    }

    chooseMoverMove(game) {
        const current = game.currentPlayer();
        const ci = game.currentPlayerIndex;
        let best = null;
        for (const card of current.getMinorCards()) {
            const myLoss = this._ownedCardValue(card, game, current);
            for (let i = 0; i < game.players.length; i++) {
                if (i === ci) continue;
                const target = game.players[i];
                const gift = this._receivedCardValue(card, game, target);
                const score = 4 - myLoss - gift * 0.6 -
                    target.builtLandmarkCount() * 0.6 +
                    (current.isDormant(card) ? 2.5 : 0);
                if (!best || score > best.score) {
                    best = {
                        cardIndex: current.cards.indexOf(card),
                        targetIndex: i,
                        score
                    };
                }
            }
        }
        return best;
    }

    chooseRenovationTarget(game) {
        const current = game.currentPlayer();
        let best = null;
        for (const [name, built] of Object.entries(current.landmarks)) {
            if (!built || name === LANDMARK_NAMES.YAKUSHO) continue;
            const score = this._builtLandmarkValue(name, current, game);
            if (!best || score < best.score) best = { name, score };
        }
        return best ? best.name : null;
    }

    chooseITSave(game) {
        const current = game.currentPlayer();
        if (current.coins < 1) return false;
        if (this.difficulty === "weak") return false;
        if (this.difficulty === "normal") return true;

        const urgentLandmark = Player.landmarkNames()
            .filter(name => (!game.enabledLandmarks || game.enabledLandmarks.has(name)) && !current.landmarks[name])
            .map(name => ({
                shortfall: Player.landmarkCost(name) - current.coins,
                urgency: this._landmarkUrgency(name, current, game),
            }))
            .filter(entry => entry.shortfall >= 0)
            .sort((a, b) => a.shortfall - b.shortfall || b.urgency - a.urgency)[0];

        if (this.difficulty === "expert") {
            if (urgentLandmark && urgentLandmark.shortfall <= 1 && urgentLandmark.urgency >= 7) return false;
            return game.players.length >= 3 || current.itVentureCoins >= 1 || current.coins >= 8;
        }

        return !urgentLandmark || urgentLandmark.shortfall > 0 || urgentLandmark.urgency < 7;
    }

    // ===== カード評価 =====

    // ゲーム状況を踏まえたカードの期待収入スコア
    evalCard(card, game, player) {
        const ci = game.players.indexOf(player);
        const opponents = game.players.filter((_, i) => i !== ci);
        const profile = this._playerCountProfile(game);

        switch (card.effect) {
            case CARD_EFFECTS.CHEESE:
            case CARD_EFFECTS.FURNITURE:
            case CARD_EFFECTS.FLOWER:
            case CARD_EFFECTS.MARKET:
            case CARD_EFFECTS.FOODWAREHOUSE:
            case CARD_EFFECTS.DRINKFACTORY:
            case CARD_EFFECTS.WINERY:
            case CARD_EFFECTS.FEWLANDMARK:
            case CARD_EFFECTS.CORNFIELD:
                return GameManager.calcCardIncome(card, player, game) * profile.greenFactor;
            case CARD_EFFECTS.STADIUM:
                return opponents.length * card.income * profile.massAttackFactor;
            case CARD_EFFECTS.TV:
                return Math.min(card.income, Math.max(...opponents.map(p => p.coins), 0)) * profile.purpleFactor;
            case CARD_EFFECTS.PUBLISHER:
                return opponents.reduce((s, p) =>
                    s + p.cards.filter(c => c.category === CARD_CATEGORIES.RESTAURANT || c.category === CARD_CATEGORIES.SHOP).length, 0) * profile.massAttackFactor;
            case CARD_EFFECTS.TAXOFFICE:
                return opponents.filter(p => p.coins >= 10).length * 5 * profile.massAttackFactor;
            case CARD_EFFECTS.HARBOR:
                return (player.landmarks[LANDMARK_NAMES.HARBOR] ? card.income : card.income * 0.4) * profile.blueFactor;
            case CARD_EFFECTS.HARBOR_RED:
                return (player.landmarks[LANDMARK_NAMES.HARBOR] ? card.income : 0) * profile.redFactor;
            case CARD_EFFECTS.TUNA:
                return (player.landmarks[LANDMARK_NAMES.HARBOR] ? 7 : 0) * profile.blueFactor;
            case CARD_EFFECTS.LOAN:
                return (player.coins <= 4 ? 3.5 : 1.2) * profile.greenFactor;
            case CARD_EFFECTS.ITSTARTUP:
                return opponents.length * Math.max(2, player.itVentureCoins + 1) * profile.massAttackFactor;
            case CARD_EFFECTS.RENOVATION:
                return (player.builtLandmarkCount() > 0 ? 3.5 : 0) * profile.greenFactor;
            case CARD_EFFECTS.CLEANING:
                return this._estimateCleaningValue(game, player) * profile.massAttackFactor;
            case CARD_EFFECTS.MOVER:
                return this._estimateMoverValue(game, player) * profile.greenFactor;
            case CARD_EFFECTS.BUSINESS:
                return this._estimateBusinessValue(game, player) * (game.players.length <= 2 ? 1.15 : 1);
            case CARD_EFFECTS.PARK:
                return this._estimateParkValue(game, player) * profile.massAttackFactor;
            default:
                if (card.color === "blue") return card.income * profile.blueFactor;
                if (card.color === "red") return card.income * profile.redFactor;
                if (card.color === "green") return card.income * profile.greenFactor;
                if (card.color === "purple") return card.income * profile.purpleFactor;
                return card.income;
        }
    }

    // ダイス出目の重み（2個振り最大値は出目7が最頻）
    _diceFreq(diceNums) {
        const w = {1:1,2:1,3:2,4:3,5:4,6:5,7:6,8:5,9:4,10:3,11:2,12:1,13:1,14:1};
        return diceNums.reduce((s, d) => s + (w[d] || 0), 0);
    }

    // 購入可能カードをスコア順にソート（ダイス確率を加味）
    sortAffordable(cards, game, player) {
        return cards.map(card => ({
            card,
            score: this.evalCard(card, game, player) * this._diceFreq(card.diceNums) / Math.max(card.cost, 1)
        })).sort((a, b) => b.score - a.score);
    }

    // ===== 購入戦略 =====

    build(game, shopStock) {
        if (!game || game.phase !== GAME_PHASES.BUILD || game.builtThisTurn) return;
        if (this.difficulty === "weak") {
            this.buildWeak(game, shopStock);
        } else if (this.difficulty === "normal") {
            this.buildNormal(game, shopStock);
        } else if (this.difficulty === "strong") {
            this.buildStrong(game, shopStock);
        } else {
            this.buildExpert(game, shopStock);
        }
    }

    _buyCard(card, game, shopStock) {
        if (!game || game.builtThisTurn) return;
        if (game.buildCard(card)) {
            shopStock[card.name]--;
            if (typeof isOnlineGame !== 'undefined' && isOnlineGame && typeof sendAction === 'function') {
                sendAction('buildCard', { cardName: card.name });
            }
        }
    }

    _buyLandmark(name, game) {
        if (!game || game.builtThisTurn) return;
        if (game.buildLandmark(name)) {
            if (typeof isOnlineGame !== 'undefined' && isOnlineGame && typeof sendAction === 'function') {
                sendAction('buildLandmark', { name });
            }
        }
    }

    _landmarkUrgency(name, current, game) {
        const builtCount = current.builtLandmarkCount();
        const opponentMaxBuilt = Math.max(0, ...game.players
            .filter(p => p !== current)
            .map(p => p.builtLandmarkCount()));
        const profile = this._playerCountProfile(game);
        let urgency = 0;
        if (name === LANDMARK_NAMES.STATION) urgency = builtCount < 2 ? 8 : 5;
        else if (name === LANDMARK_NAMES.SHOPPING_MALL) urgency = current.cards.filter(c => c.category === CARD_CATEGORIES.RESTAURANT || c.category === CARD_CATEGORIES.SHOP).length >= 3 ? 8 : 4;
        else if (name === LANDMARK_NAMES.HARBOR) urgency = current.cards.some(c => c.effect === CARD_EFFECTS.HARBOR || c.effect === CARD_EFFECTS.HARBOR_RED || c.effect === CARD_EFFECTS.TUNA) ? 7 : 3;
        else if (name === LANDMARK_NAMES.RADIO_TOWER) urgency = builtCount >= 3 || opponentMaxBuilt >= 4 ? 8 : 4;
        else if (name === LANDMARK_NAMES.AMUSEMENT_PARK) urgency = current.landmarks[LANDMARK_NAMES.STATION] ? 5 : 2;
        else if (name === LANDMARK_NAMES.AIRPORT) urgency = builtCount >= 4 ? 6 : 1;
        if (name === LANDMARK_NAMES.AIRPORT) return Math.round(urgency * profile.airportBias);
        return Math.round(urgency * profile.landmarkBias);
    }

    _coinsTowardsNextLandmark(player) {
        const remainingCosts = Player.landmarkNames()
            .filter(name => !player.landmarks[name])
            .map(name => Player.landmarkCost(name));
        if (remainingCosts.length === 0) return 0;
        return Math.max(0, player.coins - Math.min(...remainingCosts));
    }

    _estimateBusinessValue(game, player) {
        const ci = game.players.indexOf(player);
        const myCards = player.getMinorCards();
        if (myCards.length === 0) return 0;
        let best = 0;
        for (let i = 0; i < game.players.length; i++) {
            if (i === ci) continue;
            const target = game.players[i];
            for (const myCard of myCards) {
                for (const theirCard of target.getMinorCards()) {
                    const score = this._receivedCardValue(theirCard, game, player) -
                        this._ownedCardValue(myCard, game, player) * 0.8 +
                        this._ownedCardValue(theirCard, game, target) * 0.5;
                    if (score > best) best = score;
                }
            }
        }
        return best;
    }

    _estimateCleaningValue(game, player) {
        let best = 0;
        const names = [...new Set(game.players.flatMap(p => p.getMinorCards().map(c => c.name)))];
        for (const name of names) {
            let score = 0;
            for (const owner of game.players) {
                for (const card of owner.getMinorCards()) {
                    if (card.name !== name || owner.isDormant(card)) continue;
                    score += 1;
                    if (owner === player) score -= this._ownedCardValue(card, game, owner);
                    else score += this._ownedCardValue(card, game, owner) * 0.7;
                }
            }
            if (score > best) best = score;
        }
        return best;
    }

    _estimateMoverValue(game, player) {
        const myCards = player.getMinorCards();
        if (myCards.length === 0) return 0;
        let best = -Infinity;
        for (const card of myCards) {
            const score = 4 - this._ownedCardValue(card, game, player) + (player.isDormant(card) ? 2 : 0);
            if (score > best) best = score;
        }
        return Math.max(best, 0);
    }

    _estimateParkValue(game, player) {
        const total = game.players.reduce((sum, p) => sum + p.coins, 0);
        return total / Math.max(game.players.length, 1) - player.coins;
    }

    _receivedCardValue(card, game, player) {
        let baseValue;
        switch (card.effect) {
            case CARD_EFFECTS.BUSINESS:
                baseValue = 3.5;
                break;
            case CARD_EFFECTS.CLEANING:
                baseValue = 3;
                break;
            case CARD_EFFECTS.MOVER:
                baseValue = 2.5;
                break;
            case CARD_EFFECTS.PARK:
                baseValue = 1.5;
                break;
            case CARD_EFFECTS.RENOVATION:
                baseValue = 2.5;
                break;
            default:
                baseValue = this.evalCard(card, game, player);
                break;
        }
        return baseValue * this._diceFreq(card.diceNums) + card.cost * 1.4;
    }

    _ownedCardValue(card, game, player) {
        let value = this._receivedCardValue(card, game, player);
        if (player.isDormant(card)) value *= 0.35;
        if (card.color === "red") value += 1.5;
        if (card.color === "purple") value += 2;
        return value;
    }

    _builtLandmarkValue(name, current, game) {
        return this._landmarkUrgency(name, current, game) * 2 + Player.landmarkCost(name) * 0.15;
    }

    _buyWinningLandmark(current, game) {
        const remaining = Player.landmarkNames()
            .filter(name => (!game.enabledLandmarks || game.enabledLandmarks.has(name)) && !current.landmarks[name]);
        if (remaining.length !== 1) return false;
        const name = remaining[0];
        if (current.coins < Player.landmarkCost(name)) return false;
        this._buyLandmark(name, game);
        return true;
    }

    _buyLateGameLandmark(current, game) {
        const remaining = Player.landmarkNames()
            .filter(name => (!game.enabledLandmarks || game.enabledLandmarks.has(name)) && !current.landmarks[name]);
        if (remaining.length === 0 || remaining.length > 2) return false;
        const affordable = remaining
            .map(name => ({ name, cost: Player.landmarkCost(name), urgency: this._landmarkUrgency(name, current, game) }))
            .filter(entry => current.coins >= entry.cost)
            .sort((a, b) => b.urgency - a.urgency || a.cost - b.cost);
        if (affordable.length === 0) return false;
        this._buyLandmark(affordable[0].name, game);
        return true;
    }

    _cloneGame(game) {
        const clone = new GameManager(game.players.length);
        clone.enabledLandmarks = new Set(game.enabledLandmarks || Player.landmarkNames());
        clone.players.forEach((player, index) => {
            const source = game.players[index];
            player.name = source.name;
            player.coins = source.coins;
            player.cards = source.cards.map(card => cloneCard(card));
            player.dormantCards = source.dormantCards.map(dormant => source.cards.indexOf(dormant))
                .filter(i => i >= 0)
                .map(i => player.cards[i])
                .filter(Boolean);
            player.landmarks = Object.assign({}, source.landmarks);
            player.itVentureCoins = source.itVentureCoins || 0;
            player.hasYakusho = source.hasYakusho !== false;
        });
        clone.currentPlayerIndex = game.currentPlayerIndex;
        clone.phase = game.phase;
        clone.lastDiceResult = game.lastDiceResult || 0;
        clone.lastDice1 = game.lastDice1 || 0;
        clone.lastDice2 = game.lastDice2 || 0;
        clone.builtThisTurn = game.builtThisTurn || false;
        clone.pendingTV = game.pendingTV || 0;
        clone.pendingBusiness = game.pendingBusiness || 0;
        clone.pendingCleaning = game.pendingCleaning || 0;
        clone.pendingMover = game.pendingMover || 0;
        clone.pendingRenovation = game.pendingRenovation || 0;
        clone.pendingIT = game.pendingIT || false;
        clone.usedReroll = game.usedReroll || false;
        clone.pendingTunaDice = game.pendingTunaDice || null;
        clone.turnCount = game.turnCount || 0;
        clone.hadAmusementParkAtRoll = game.hadAmusementParkAtRoll || false;
        clone.log = [];
        return clone;
    }

    _estimatePlayerTurnValue(game, playerIndex) {
        const original = game.currentPlayerIndex;
        game.currentPlayerIndex = playerIndex;
        const useTwo = game.players[playerIndex].landmarks[LANDMARK_NAMES.STATION];
        const value = Math.max(
            this._expectedDiceScore(game, false),
            useTwo ? this._expectedDiceScore(game, true) : -Infinity
        );
        game.currentPlayerIndex = original;
        return Number.isFinite(value) ? value : 0;
    }

    _countReachableLandmarks(player, enabledLandmarks) {
        return enabledLandmarks.filter(name =>
            !player.landmarks[name] && player.coins >= Player.landmarkCost(name)
        ).length;
    }

    _estimateStableIncome(game, player) {
        let total = 0;
        for (const card of player.cards) {
            if (player.isDormant(card)) continue;
            if (card.color !== "blue" && card.color !== "green") continue;
            total += this._ownedCardValue(card, game, player);
        }
        return total;
    }

    _estimateRedPressure(game, playerIndex) {
        let pressure = 0;
        for (let i = 0; i < game.players.length; i++) {
            if (i === playerIndex) continue;
            const opponent = game.players[i];
            for (const card of opponent.cards) {
                if (opponent.isDormant(card) || card.color !== "red") continue;
                pressure += this._ownedCardValue(card, game, opponent);
            }
        }
        return pressure;
    }

    _evaluatePosition(game, playerIndex) {
        const player = game.players[playerIndex];
        const tuning = this.expertTuning;
        if (player.hasWon([...game.enabledLandmarks])) return 100000;
        const myTurnValue = this._estimatePlayerTurnValue(game, playerIndex);
        const enabledLandmarks = [...game.enabledLandmarks];
        const myLandmarkProgress = enabledLandmarks.filter(name => player.landmarks[name]).length;
        const remainingLandmarks = enabledLandmarks.filter(name => !player.landmarks[name]);
        const reachableLandmarks = this._countReachableLandmarks(player, enabledLandmarks);
        const stableIncome = this._estimateStableIncome(game, player);
        const redPressure = this._estimateRedPressure(game, playerIndex);
        const lowValueSpam = player.countCard("改装屋") + player.countCard("貸金業") + player.countCard("雑貨屋");
        let score = player.coins * tuning.coinWeight +
            myTurnValue * tuning.turnWeight +
            myLandmarkProgress * tuning.landmarkWeight +
            player.builtLandmarkCount() * tuning.builtLandmarkWeight +
            reachableLandmarks * tuning.landmarkReachWeight +
            stableIncome * tuning.stableIncomeWeight -
            redPressure * tuning.redPressureWeight;
        if (remainingLandmarks.length <= 2) score += player.coins * tuning.lateCoinWeight + myLandmarkProgress * tuning.lateProgressBonus;
        if (remainingLandmarks.length <= 1) score += player.coins * tuning.finalCoinWeight;
        if (lowValueSpam > tuning.lowValueSpamThreshold) {
            score -= (lowValueSpam - tuning.lowValueSpamThreshold) * tuning.lowValueSpamPenalty;
        }
        if (player.landmarks[LANDMARK_NAMES.AIRPORT] && !game.builtThisTurn && game.currentPlayerIndex === playerIndex) score += 12;
        for (let i = 0; i < game.players.length; i++) {
            if (i === playerIndex) continue;
            const opponent = game.players[i];
            const opponentTurnValue = this._estimatePlayerTurnValue(game, i);
            const opponentProgress = enabledLandmarks.filter(name => opponent.landmarks[name]).length;
            score -= opponent.coins * 0.4 + opponentTurnValue * 1.8 + opponentProgress * 9 + opponent.builtLandmarkCount() * 5;
        }
        return score;
    }

    _scoreExpertCardPenalty(cardName, player, game) {
        const copies = player.countCard(cardName);
        const remainingLandmarks = [...game.enabledLandmarks].filter(name => !player.landmarks[name]).length;
        if (cardName === "改装屋") return copies >= 2 ? 10 + copies * 4 : 0;
        if (cardName === "貸金業") return copies >= 3 ? 8 + copies * 3 : 0;
        if (cardName === "雑貨屋") return remainingLandmarks <= 2 && copies >= 3 ? 8 + copies * 2 : 0;
        return 0;
    }

    _listExpertBuildOptions(game, shopStock) {
        const current = game.currentPlayer();
        const options = [{ type: 'skip' }];
        for (const name of Player.landmarkNames()) {
            if (!game.enabledLandmarks || !game.enabledLandmarks.has(name)) continue;
            if (current.landmarks[name]) continue;
            const cost = Player.landmarkCost(name);
            if (current.coins >= cost) options.push({ type: 'landmark', name });
        }
        const affordable = CARDS.filter(card =>
            shopStock[card.name] > 0 &&
            current.coins >= card.cost &&
            !(card.color === "purple" && current.countCard(card.name) > 0)
        );
        const ranked = this.sortAffordable(affordable, game, current);
        for (const entry of ranked.slice(0, 6)) {
            options.push({ type: 'card', cardName: entry.card.name });
        }
        return options;
    }

    _scoreExpertBuildOption(game, shopStock, action) {
        const ci = game.currentPlayerIndex;
        const tuning = this.expertTuning;
        const clone = this._cloneGame(game);
        const stock = Object.assign({}, shopStock);
        const current = clone.currentPlayer();
        let scorePenalty = 0;
        if (action.type === 'landmark') {
            if (!clone.buildLandmark(action.name)) return -Infinity;
        } else if (action.type === 'card') {
            const card = CARDS.find(c => c.name === action.cardName);
            if (!card || !clone.buildCard(card)) return -Infinity;
            stock[card.name] = Math.max(0, (stock[card.name] || 0) - 1);
            scorePenalty = this._scoreExpertCardPenalty(card.name, current, clone);
        } else if (action.type === 'skip') {
            clone.builtThisTurn = false;
        }
        let score = this._evaluatePosition(clone, ci);
        score += this._simulateLookahead(clone, stock, ci, game.players.length * tuning.lateGameLookaheadStepsPerPlayer) * tuning.lookaheadWeight;
        const remainingLandmarks = [...clone.enabledLandmarks].filter(name => !current.landmarks[name]).length;
        if (action.type === 'landmark') score += tuning.landmarkActionBonus + (remainingLandmarks <= 2 ? tuning.lateLandmarkActionBonus : 0);
        if (action.type === 'card' && remainingLandmarks <= 2) score -= scorePenalty || 0;
        if (action.type === 'skip' && current.landmarks[LANDMARK_NAMES.AIRPORT]) score += tuning.skipAirportBonus;
        if (action.type === 'skip' && !current.landmarks[LANDMARK_NAMES.AIRPORT]) score -= tuning.skipPenalty;
        if (action.type === 'landmark' && current.hasWon([...clone.enabledLandmarks])) score += 50000;
        return score;
    }

    _createPlayoutRng(seed) {
        let state = (seed >>> 0) || 1;
        return () => {
            state = (state * 1664525 + 1013904223) >>> 0;
            return state / 0x100000000;
        };
    }

    _simulateLookahead(game, shopStock, focusIndex, maxSteps) {
        const cpus = game.players.map(() => new CPU('strong'));
        const tuning = this.expertTuning;
        const seed = game.turnCount + focusIndex * 97 + game.currentPlayer().coins * 13 + maxSteps;
        const rng = this._createPlayoutRng(seed);
        let safety = 0;
        while (!game.checkWinner() && safety < maxSteps) {
            const cpu = cpus[game.currentPlayerIndex];
            this._runSimulationStep(game, cpu, shopStock, rng);
            safety++;
        }
        if (game.checkWinner()) {
            const winnerIndex = game.players.indexOf(game.checkWinner());
            return winnerIndex === focusIndex ? tuning.winLookaheadBonus : -tuning.loseLookaheadPenalty;
        }
        return this._evaluatePosition(game, focusIndex);
    }

    _runSimulationStep(game, cpu, shopStock, rng) {
        const die = () => Math.floor(rng() * 6) + 1;
        const tunaDice = [die(), die()];
        switch (game.phase) {
            case GAME_PHASES.ROLL:
                game.rollDice(die(), tunaDice);
                return;
            case GAME_PHASES.SELECT_DICE: {
                const useTwo = cpu.chooseDiceCount(game);
                game.selectDiceCount(useTwo, die(), die(), tunaDice);
                return;
            }
            case GAME_PHASES.REROLL_CONFIRM:
                if (cpu.chooseReroll(game)) game.rerollDice(die(), tunaDice);
                else game.skipReroll();
                return;
            case GAME_PHASES.HARBOR_CHOICE:
                game.resolveHarbor(cpu.chooseHarbor(game), tunaDice);
                return;
            case GAME_PHASES.PENDING:
                if (game.pendingTV > 0) {
                    game.resolveTV(cpu.chooseTVTarget(game));
                    return;
                }
                if (game.pendingBusiness > 0) {
                    const move = cpu.chooseBusinessMove(game);
                    if (move) game.resolveBusiness(move.myCard, move.targetIndex, move.theirCard);
                    else { game.pendingBusiness = 0; game._checkPending(); }
                    return;
                }
                if (game.pendingCleaning > 0) {
                    const cardName = cpu.chooseCleaningTarget(game);
                    if (cardName) game.resolveCleaning(cardName);
                    else { game.pendingCleaning = 0; game._checkPending(); }
                    return;
                }
                if (game.pendingMover > 0) {
                    const move = cpu.chooseMoverMove(game);
                    if (move) game.resolveMover(move.cardIndex, move.targetIndex);
                    else { game.pendingMover = 0; game._checkPending(); }
                    return;
                }
                if (game.pendingRenovation > 0) {
                    const landmarkName = cpu.chooseRenovationTarget(game);
                    if (landmarkName) game.resolveRenovation(landmarkName);
                    else { game.pendingRenovation = 0; game._checkPending(); }
                    return;
                }
                game.phase = GAME_PHASES.BUILD;
                return;
            case GAME_PHASES.BUILD:
                if (game.pendingIT) {
                    game.resolveIT(cpu.chooseITSave(game));
                    return;
                }
                cpu.build(game, shopStock);
                if (!game.pendingIT && game.phase === GAME_PHASES.BUILD) game.nextTurn();
                return;
            default:
                return;
        }
    }

    _shouldHoldForLandmark(current, game, bestCardScore, maxShortfall) {
        let best = null;
        for (const name of Player.landmarkNames()) {
            if (!game.enabledLandmarks || !game.enabledLandmarks.has(name) || current.landmarks[name]) continue;
            const cost = Player.landmarkCost(name);
            const shortfall = cost - current.coins;
            if (shortfall <= 0 || shortfall > maxShortfall) continue;
            const urgency = this._landmarkUrgency(name, current, game);
            if (!best || urgency > best.urgency || (urgency === best.urgency && shortfall < best.shortfall)) {
                best = { urgency, shortfall };
            }
        }
        if (!best) return false;
        return best.urgency >= 6 && bestCardScore < (best.urgency - best.shortfall) * 1.2;
    }

    _maybeBuyLandmark(current, game, reserve = 0, minUrgency = 0) {
        const landmarkPriority = [LANDMARK_NAMES.STATION, LANDMARK_NAMES.SHOPPING_MALL, LANDMARK_NAMES.HARBOR, LANDMARK_NAMES.RADIO_TOWER, LANDMARK_NAMES.AMUSEMENT_PARK, LANDMARK_NAMES.AIRPORT];
        let best = null;
        for (const name of landmarkPriority) {
            const cost = Player.landmarkCost(name);
            if (!game.enabledLandmarks || !game.enabledLandmarks.has(name)) continue;
            if (current.landmarks[name] || current.coins < cost + reserve) continue;
            const urgency = this._landmarkUrgency(name, current, game);
            if (urgency < minUrgency) continue;
            if (!best || urgency > best.urgency || (urgency === best.urgency && cost < best.cost)) {
                best = { name, cost, urgency };
            }
        }
        if (best) {
            this._buyLandmark(best.name, game);
            return true;
        }
        return false;
    }

    // 弱いCPU：ランダム購入
    buildWeak(game, shopStock) {
        const current = game.currentPlayer();
        if (this._buyWinningLandmark(current, game)) return;
        const affordable = CARDS.filter(card =>
            shopStock[card.name] > 0 &&
            current.coins >= card.cost &&
            !(card.color === "purple" && current.countCard(card.name) > 0)
        );
        if (affordable.length === 0) return;
        this._buyCard(affordable[Math.floor(Math.random() * affordable.length)], game, shopStock);
    }

    // 普通CPU：シナジー＋コスパ重視
    buildNormal(game, shopStock) {
        const current = game.currentPlayer();
        if (this._buyWinningLandmark(current, game)) return;

        // シナジーチェック
        if (this._trySynergy(current, game, shopStock)) return;

        if (this._maybeBuyLandmark(current, game, 1, 6)) return;

        // スコア順にカードを選ぶ
        const affordable = CARDS.filter(card =>
            shopStock[card.name] > 0 &&
            current.coins >= card.cost &&
            card.cost > 0 &&
            !(card.color === "purple" && current.countCard(card.name) > 0)
        );
        const sorted = this.sortAffordable(affordable, game, current);
        if (sorted.length > 0 && this._shouldHoldForLandmark(current, game, sorted[0].score, 2)) return;
        if (sorted.length > 0 && sorted[0].score >= 0.9) {
            this._buyCard(sorted[0].card, game, shopStock);
            return;
        }
        this._maybeBuyLandmark(current, game, 0, 4);
    }

    // 強いCPU：状況判断型
    buildStrong(game, shopStock) {
        const current = game.currentPlayer();
        const ci = game.currentPlayerIndex;
        const builtCount = current.builtLandmarkCount();
        if (this._buyWinningLandmark(current, game)) return;

        // 誰かが勝利に近い（ランドマーク4つ以上）→ 緊急モード：ランドマーク最優先
        const opponentMaxBuilt = Math.max(...game.players
            .filter((_, i) => i !== ci)
            .map(p => p.builtLandmarkCount()));
        const emergencyMode = opponentMaxBuilt >= 4 || builtCount >= 4;

        if (emergencyMode && this._maybeBuyLandmark(current, game, 0, 3)) return;

        // シナジーチェック
        if (this._trySynergy(current, game, shopStock)) return;

        if (this._maybeBuyLandmark(current, game, 2, 6)) return;

        // ランドマーク3つ以上 → 残りのランドマーク優先
        if (builtCount >= 3 && this._maybeBuyLandmark(current, game, 0, 3)) return;

        // 相手が10コイン以上持っていたら攻撃カードを優先
        const richOpponent = game.players.some((p, i) => i !== ci && p.coins >= 10);
        if (richOpponent) {
            for (const name of ["スタジアム", "テレビ局", "税務署"]) {
                const card = CARDS.find(c => c.name === name);
                if (card && shopStock[name] > 0 && current.coins >= card.cost &&
                    current.countCard(name) === 0) {
                    this._buyCard(card, game, shopStock);
                    return;
                }
            }
        }

        // スコア順にカードを選ぶ
        const affordable = CARDS.filter(card =>
            shopStock[card.name] > 0 &&
            current.coins >= card.cost &&
            card.cost > 0 &&
            !(card.color === "purple" && current.countCard(card.name) > 0)
        );
        const sorted = this.sortAffordable(affordable, game, current);
        if (sorted.length > 0) {
            const [best, second] = sorted;
            if (this._shouldHoldForLandmark(current, game, best.score, 4)) return;
            if (!second || best.score >= second.score * 0.95) {
                this._buyCard(best.card, game, shopStock);
                return;
            }
        }
        this._maybeBuyLandmark(current, game, 0, 2);
    }

    buildExpert(game, shopStock) {
        const current = game.currentPlayer();
        if (this._buyWinningLandmark(current, game)) return;
        if (this._buyLateGameLandmark(current, game)) return;

        let best = null;
        for (const action of this._listExpertBuildOptions(game, shopStock)) {
            const score = this._scoreExpertBuildOption(game, shopStock, action);
            if (!best || score > best.score) best = Object.assign({ score }, action);
        }

        if (!best || best.type === 'skip') return;
        if (best.type === 'landmark') {
            this._buyLandmark(best.name, game);
            return;
        }
        const card = CARDS.find(c => c.name === best.cardName);
        if (card) this._buyCard(card, game, shopStock);
    }

    // シナジー購入チェック（普通・強い共通）
    _trySynergy(current, game, shopStock) {
        const try_ = (name, cost, condition) => {
            if (!condition) return false;
            const card = CARDS.find(c => c.name === name);
            if (card && shopStock[name] > 0 && current.coins >= cost) {
                this._buyCard(card, game, shopStock);
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
        if (try_("テレビ局",    7, game.players.some(p => p !== current && p.coins >= 6) && current.countCard("テレビ局") === 0)) return true;
        if (try_("税務署",      4, game.players.some(p => p !== current && p.coins >= 10) && current.countCard("税務署") === 0)) return true;

        return false;
    }
}
