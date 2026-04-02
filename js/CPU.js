class CPU {
    constructor(difficulty) {
        this.difficulty = difficulty;
    }

    takeTurn(game, shopStock) {
        // scheduleCPU側で処理
    }

    // ===== サイコロ判断 =====

    chooseDiceCount(game) {
        if (this.difficulty === "weak") return Math.random() < 0.5;
        return true;
    }

    chooseReroll(game) {
        const dice = game.lastDiceResult;
        if (this.difficulty === "weak") return Math.random() < 0.5;
        if (this.difficulty === "normal") return dice <= 3;
        // 強い：自分のカードが発動する目かチェック
        const current = game.currentPlayer();
        const myDiceNums = new Set(current.cards.flatMap(c => c.diceNums));
        return !myDiceNums.has(dice) || dice <= 3;
    }

    chooseHarbor(game) {
        if (this.difficulty === "weak") return Math.random() < 0.5;
        return true;
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
                const theirBest = theirCards.sort((a, b) => b.cost - a.cost)[0];
                game.resolveBusiness(myWorst.name, i, theirBest.name);
                return;
            }
        } else {
            for (let i = 0; i < game.players.length; i++) {
                if (i === ci) continue;
                const theirCards = game.players[i].cards.filter(c => c.category !== "大施設");
                if (theirCards.length === 0) continue;
                const myCard = myCards[Math.floor(Math.random() * myCards.length)];
                const theirCard = theirCards[Math.floor(Math.random() * theirCards.length)];
                game.resolveBusiness(myCard.name, i, theirCard.name);
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

        // ランドマーク：安い順に買えたら買う
        const landmarkPriority = ["港", "駅", "ショッピングモール", "遊園地", "電波塔", "空港"];
        for (const name of landmarkPriority) {
            const cost = Player.landmarkCost(name);
            if (!current.landmarks[name] && current.coins >= cost) {
                this._buyLandmark(name, game);
                return;
            }
        }

        // シナジーチェック
        if (this._trySynergy(current, game, shopStock)) return;

        // スコア順にカードを選ぶ
        const affordable = CARDS.filter(card =>
            shopStock[card.name] > 0 &&
            current.coins >= card.cost &&
            card.cost > 0 &&
            !(card.color === "purple" && current.countCard(card.name) > 0)
        );
        const sorted = this.sortAffordable(affordable, game, current);
        if (sorted.length > 0) this._buyCard(sorted[0].card, game, shopStock);
    }

    // 強いCPU：状況判断型
    buildStrong(game, shopStock) {
        const current = game.currentPlayer();
        const ci = game.currentPlayerIndex;
        const builtCount = Object.values(current.landmarks).filter(v => v).length;
        const landmarkPriority = ["港", "駅", "ショッピングモール", "遊園地", "電波塔", "空港"];

        // 誰かが勝利に近い（ランドマーク4つ以上）→ 緊急モード：ランドマーク最優先
        const opponentMaxBuilt = Math.max(...game.players
            .filter((_, i) => i !== ci)
            .map(p => Object.values(p.landmarks).filter(v => v).length));
        const emergencyMode = opponentMaxBuilt >= 4 || builtCount >= 4;

        if (emergencyMode) {
            for (const name of landmarkPriority) {
                const cost = Player.landmarkCost(name);
                if (!current.landmarks[name] && current.coins >= cost) {
                    this._buyLandmark(name, game);
                    return;
                }
            }
        }

        // 序盤：港・駅は早めに取る（コインが余っていれば）
        for (const name of ["港", "駅"]) {
            const cost = Player.landmarkCost(name);
            if (!current.landmarks[name] && current.coins >= cost + 2) {
                this._buyLandmark(name, game);
                return;
            }
        }

        // シナジーチェック
        if (this._trySynergy(current, game, shopStock)) return;

        // ランドマーク3つ以上 → 残りのランドマーク優先
        if (builtCount >= 3) {
            for (const name of landmarkPriority) {
                const cost = Player.landmarkCost(name);
                if (!current.landmarks[name] && current.coins >= cost) {
                    this._buyLandmark(name, game);
                    return;
                }
            }
        }

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

        // ランドマーク購入（通常）
        for (const name of landmarkPriority) {
            const cost = Player.landmarkCost(name);
            if (!current.landmarks[name] && current.coins >= cost) {
                this._buyLandmark(name, game);
                return;
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
        if (sorted.length > 0) this._buyCard(sorted[0].card, game, shopStock);
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

        return false;
    }
}
