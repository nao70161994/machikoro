class CPU {
    constructor(difficulty) {
        this.difficulty = difficulty;
    }

    takeTurn(game, shopStock) {
        // scheduleCPU側で処理
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
        let maxCoins = -1;
        let targetIndex = -1;
        for (let i = 0; i < game.players.length; i++) {
            if (i === ci) continue;
            if (game.players[i].coins > maxCoins) {
                maxCoins = game.players[i].coins;
                targetIndex = i;
            }
        }
        return targetIndex;
    }

    resolveBusiness(game) {
        const current = game.currentPlayer();
        const ci = game.currentPlayerIndex;
        const myCards = current.getMinorCards();
        if (myCards.length === 0) { game.pendingBusiness = false; game.phase = GAME_PHASES.BUILD; return; }

        if (this.difficulty === "strong") {
            // 強い：最も価値の低い自分のカードと最も価値の高い相手のカードを交換
            const myWorst = myCards.sort((a, b) => a.cost - b.cost)[0];
            for (let i = 0; i < game.players.length; i++) {
                if (i === ci) continue;
                const theirCards = game.players[i].getMinorCards();
                if (theirCards.length === 0) continue;
                const theirBest = theirCards.sort((a, b) => {
                    const av = b.cost + (game.players[i].isDormant(b) ? 1.5 : 0);
                    const bv = a.cost + (game.players[i].isDormant(a) ? 1.5 : 0);
                    return av - bv;
                })[0];
                game.resolveBusiness(current.cards.indexOf(myWorst), i, game.players[i].cards.indexOf(theirBest));
                return;
            }
        } else {
            for (let i = 0; i < game.players.length; i++) {
                if (i === ci) continue;
                const theirCards = game.players[i].getMinorCards();
                if (theirCards.length === 0) continue;
                const myCard = myCards[Math.floor(Math.random() * myCards.length)];
                const theirCard = theirCards[Math.floor(Math.random() * theirCards.length)];
                game.resolveBusiness(current.cards.indexOf(myCard), i, game.players[i].cards.indexOf(theirCard));
                return;
            }
        }
        game.pendingBusiness = false;
        game.phase = GAME_PHASES.BUILD;
    }

    // ===== カード評価 =====

    // ゲーム状況を踏まえたカードの期待収入スコア
    evalCard(card, game, player) {
        const ci = game.players.indexOf(player);
        const opponents = game.players.filter((_, i) => i !== ci);

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
                return GameManager.calcCardIncome(card, player, game);
            case CARD_EFFECTS.STADIUM:
                return opponents.length * card.income;
            case CARD_EFFECTS.TV:
                return Math.min(card.income, Math.max(...opponents.map(p => p.coins), 0));
            case CARD_EFFECTS.PUBLISHER:
                return opponents.reduce((s, p) =>
                    s + p.cards.filter(c => c.category === CARD_CATEGORIES.RESTAURANT || c.category === CARD_CATEGORIES.SHOP).length, 0);
            case CARD_EFFECTS.TAXOFFICE:
                return opponents.filter(p => p.coins >= 10).length * 5;
            case CARD_EFFECTS.HARBOR:
                return player.landmarks[LANDMARK_NAMES.HARBOR] ? card.income : card.income * 0.4;
            case CARD_EFFECTS.HARBOR_RED:
                return player.landmarks[LANDMARK_NAMES.HARBOR] ? card.income : 0;
            case CARD_EFFECTS.TUNA:
                return player.landmarks[LANDMARK_NAMES.HARBOR] ? 7 : 0;
            case CARD_EFFECTS.LOAN:
                return 1;
            case CARD_EFFECTS.ITSTARTUP:
                return opponents.length * 2;
            case CARD_EFFECTS.RENOVATION:
            case CARD_EFFECTS.CLEANING:
            case CARD_EFFECTS.MOVER:
                return 2;
            case CARD_EFFECTS.BUSINESS:
                return 3;
            case CARD_EFFECTS.PARK:
                return 1;
            default:
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
        } else {
            this.buildStrong(game, shopStock);
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
        if (name === LANDMARK_NAMES.STATION)       return builtCount < 2 ? 8 : 5;
        if (name === LANDMARK_NAMES.SHOPPING_MALL)  return current.cards.filter(c => c.category === CARD_CATEGORIES.RESTAURANT || c.category === CARD_CATEGORIES.SHOP).length >= 3 ? 8 : 4;
        if (name === LANDMARK_NAMES.HARBOR)         return current.cards.some(c => c.effect === CARD_EFFECTS.HARBOR || c.effect === CARD_EFFECTS.HARBOR_RED || c.effect === CARD_EFFECTS.TUNA) ? 7 : 3;
        if (name === LANDMARK_NAMES.RADIO_TOWER)    return builtCount >= 3 || opponentMaxBuilt >= 4 ? 8 : 4;
        if (name === LANDMARK_NAMES.AMUSEMENT_PARK) return current.landmarks[LANDMARK_NAMES.STATION] ? 5 : 2;
        if (name === LANDMARK_NAMES.AIRPORT)        return builtCount >= 4 ? 6 : 1;
        return 0;
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
            if (!second || best.score >= second.score * 0.95) {
                this._buyCard(best.card, game, shopStock);
                return;
            }
        }
        this._maybeBuyLandmark(current, game, 0, 2);
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
