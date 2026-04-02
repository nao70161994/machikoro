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
            if (card.effect === "harbor") return owner.landmarks["港"] ? card.income : 0;
            if (card.effect === "tuna") return owner.landmarks["港"] ? 7 : 0;
            return card.income;
        }

        if (card.color === "red") {
            if (isCurrentTurn) return 0;
            if (card.effect === "harbor_red") return roller.landmarks["港"] ? card.income : 0;
            if (card.effect === "frenchr") return roller.landmarks && Object.values(roller.landmarks).filter(Boolean).length >= 2 ? card.income : 0;
            if (card.effect === "memberbar") return roller.landmarks && Object.values(roller.landmarks).filter(Boolean).length >= 3 ? Math.max(roller.coins, 4) : 0;
            return card.income + (roller.landmarks["ショッピングモール"] && card.category === "飲食店" ? 1 : 0);
        }

        if (!isCurrentTurn) return 0;

        switch (card.effect) {
            case "cheese":
                return owner.countCard("牧場") * card.income;
            case "furniture":
                return (owner.countCard("森林") + owner.countCard("鉱山")) * card.income;
            case "flower":
                return owner.countCard("花畑") * card.income;
            case "market":
                return livingCards.filter(c => c.category === "農園").length * card.income;
            case "foodwarehouse":
                return livingCards.filter(c => c.category === "飲食店").length * card.income;
            case "drinkfactory":
                return game.players.reduce((sum, p) => sum + p.cards.filter(c => c.category === "飲食店" && !p.isDormant(c)).length, 0) * card.income;
            case "winery":
                return owner.cards.filter(c => c.name === "ブドウ園" && !owner.isDormant(c)).length * card.income;
            case "stadium":
                return opponents.length * card.income;
            case "tv":
                return Math.min(card.income, Math.max(...opponents.map(p => p.coins), 0));
            case "publisher":
                return opponents.reduce((sum, p) =>
                    sum + p.cards.filter(c => (c.category === "飲食店" || c.category === "商店") && !p.isDormant(c)).length, 0);
            case "taxoffice":
                return opponents.filter(p => p.coins >= 10).length * 5;
            case "fewlandmark":
            case "cornfield":
                return Object.values(owner.landmarks).filter(Boolean).length <= 1 ? card.income : 0;
            case "loan":
                return (dice === 5 || dice === 6) ? -2 : 0;
            case "business":
                return 4;
            case "cleaning":
                return game.players.reduce((sum, p) => sum + p.cards.filter(c => c.category !== "大施設" && !p.isDormant(c)).length, 0) * 0.4;
            case "mover":
                return 4;
            case "renovation":
                return Object.values(owner.landmarks).filter(([v]) => v).length ? 3 : 0;
            case "itstartup":
                return opponents.length * Math.max(owner.itVentureCoins, 1);
            case "park":
                return 2;
            default: {
                let amount = card.income;
                if (owner.landmarks["ショッピングモール"] &&
                    (card.category === "飲食店" || card.category === "商店")) amount += 1;
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
        const myCards = current.cards.filter(c => c.category !== "大施設");
        if (myCards.length === 0) { game.pendingBusiness = false; game.phase = "build"; return; }

        if (this.difficulty === "strong") {
            // 強い：最も価値の低い自分のカードと最も価値の高い相手のカードを交換
            const myWorst = myCards.sort((a, b) => a.cost - b.cost)[0];
            for (let i = 0; i < game.players.length; i++) {
                if (i === ci) continue;
                const theirCards = game.players[i].cards.filter(c => c.category !== "大施設");
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
                const theirCards = game.players[i].cards.filter(c => c.category !== "大施設");
                if (theirCards.length === 0) continue;
                const myCard = myCards[Math.floor(Math.random() * myCards.length)];
                const theirCard = theirCards[Math.floor(Math.random() * theirCards.length)];
                game.resolveBusiness(current.cards.indexOf(myCard), i, game.players[i].cards.indexOf(theirCard));
                return;
            }
        }
        game.pendingBusiness = false;
        game.phase = "build";
    }

    // ===== カード評価 =====

    // ゲーム状況を踏まえたカードの期待収入スコア
    evalCard(card, game, player) {
        const ci = game.players.indexOf(player);
        const opponents = game.players.filter((_, i) => i !== ci);

        switch (card.effect) {
            case "cheese":
                return player.countCard("牧場") * card.income;
            case "furniture":
                return (player.countCard("森林") + player.countCard("鉱山")) * card.income;
            case "flower":
                return player.countCard("花畑") * card.income;
            case "market":
                return player.cards.filter(c => c.category === "農園").length * card.income;
            case "foodwarehouse":
                return player.cards.filter(c => c.category === "飲食店").length * card.income;
            case "drinkfactory":
                return game.players.reduce((s, p) =>
                    s + p.cards.filter(c => c.category === "飲食店").length, 0) * card.income;
            case "winery":
                return player.cards.filter(c => c.name === "ブドウ園").length * card.income;
            case "stadium":
                return opponents.length * card.income;
            case "tv":
                return Math.min(card.income, Math.max(...opponents.map(p => p.coins), 0));
            case "publisher":
                return opponents.reduce((s, p) =>
                    s + p.cards.filter(c => c.category === "飲食店" || c.category === "商店").length, 0);
            case "taxoffice":
                return opponents.filter(p => p.coins >= 10).length * 5;
            case "harbor":
                return player.landmarks["港"] ? card.income : card.income * 0.4;
            case "harbor_red":
                return player.landmarks["港"] ? card.income : 0;
            case "tuna":
                return player.landmarks["港"] ? 7 : 0;
            case "cornfield":
            case "fewlandmark": {
                const built = Object.values(player.landmarks).filter(v => v).length;
                return built <= 1 ? card.income : 0;
            }
            case "loan":
                return 1;
            case "itstartup":
                return opponents.length * 2;
            case "renovation":
            case "cleaning":
            case "mover":
                return 2;
            case "business":
                return 3;
            case "park":
                return 1;
            default:
                return card.income;
        }
    }

    // 購入可能カードをスコア順にソート
    sortAffordable(cards, game, player) {
        return cards.map(card => ({
            card,
            score: this.evalCard(card, game, player) / Math.max(card.cost, 1)
        })).sort((a, b) => b.score - a.score);
    }

    // ===== 購入戦略 =====

    build(game, shopStock) {
        if (this.difficulty === "weak") {
            this.buildWeak(game, shopStock);
        } else if (this.difficulty === "normal") {
            this.buildNormal(game, shopStock);
        } else {
            this.buildStrong(game, shopStock);
        }
    }

    _buyCard(card, game, shopStock) {
        if (game.buildCard(card)) shopStock[card.name]--;
    }

    _buyLandmark(name, game) {
        game.buildLandmark(name);
    }

    _landmarkUrgency(name, current, game) {
        const builtCount = Object.values(current.landmarks).filter(Boolean).length;
        const opponentMaxBuilt = Math.max(0, ...game.players
            .filter(p => p !== current)
            .map(p => Object.values(p.landmarks).filter(Boolean).length));
        if (name === "駅") return builtCount < 2 ? 8 : 5;
        if (name === "ショッピングモール") return current.cards.filter(c => c.category === "飲食店" || c.category === "商店").length >= 3 ? 8 : 4;
        if (name === "港") return current.cards.some(c => c.effect === "harbor" || c.effect === "harbor_red" || c.effect === "tuna") ? 7 : 3;
        if (name === "電波塔") return builtCount >= 3 || opponentMaxBuilt >= 4 ? 8 : 4;
        if (name === "遊園地") return current.landmarks["駅"] ? 5 : 2;
        if (name === "空港") return builtCount >= 4 ? 6 : 1;
        return 0;
    }

    _maybeBuyLandmark(current, game, reserve = 0, minUrgency = 0) {
        const landmarkPriority = ["駅", "ショッピングモール", "港", "電波塔", "遊園地", "空港"];
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
        if (sorted.length > 0 && sorted[0].score >= 1.1) {
            this._buyCard(sorted[0].card, game, shopStock);
            return;
        }
        this._maybeBuyLandmark(current, game, 0, 4);
    }

    // 強いCPU：状況判断型
    buildStrong(game, shopStock) {
        const current = game.currentPlayer();
        const ci = game.currentPlayerIndex;
        const builtCount = Object.values(current.landmarks).filter(v => v).length;

        // 誰かが勝利に近い（ランドマーク4つ以上）→ 緊急モード：ランドマーク最優先
        const opponentMaxBuilt = Math.max(...game.players
            .filter((_, i) => i !== ci)
            .map(p => Object.values(p.landmarks).filter(v => v).length));
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
        if (try_("青果市場",    2, current.cards.filter(c => c.category === "農園").length >= 3)) return true;
        if (try_("食品倉庫",    2, current.cards.filter(c => c.category === "飲食店").length >= 3)) return true;
        if (try_("テレビ局",    7, game.players.some(p => p !== current && p.coins >= 6) && current.countCard("テレビ局") === 0)) return true;
        if (try_("税務署",      4, game.players.some(p => p !== current && p.coins >= 10) && current.countCard("税務署") === 0)) return true;

        return false;
    }
}
