function cpuDo(action, data, fallback) {
    if (typeof sendAction === "function" && typeof isOnlineGame !== "undefined" && isOnlineGame) {
        sendAction(action, data);
        fallback();
    } else {
        fallback();
    }
}

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
        // 普通・強い：常に2個（合計が高い方が有利）
        return true;
    }

    chooseReroll(game) {
        const dice = game.lastDiceResult;
        if (this.difficulty === "weak") return Math.random() < 0.5;
        if (this.difficulty === "normal") return dice <= 3;
        // 強い：自分のカードが発動する目かチェック
        const current = game.currentPlayer();
        const myDiceNums = new Set(current.cards.flatMap(c => c.diceNums));
        // 自分のカードが発動しない目なら振り直す
        return !myDiceNums.has(dice) || dice <= 3;
    }

    chooseHarbor(game) {
        if (this.difficulty === "weak") return Math.random() < 0.5;
        // 普通・強い：常に+2
        return true;
    }

    chooseTVTarget(game) {
        const ci = game.currentPlayerIndex;
        // 最もコインが多い相手を選ぶ
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
                cpuDo(
                    'resolveBusiness',
                    { myCard: myWorst.name, targetIndex: i, theirCard: theirBest.name },
                    () => {
                        game.resolveBusiness(myWorst.name, i, theirBest.name);
                    }
                );
                return;
            }
        } else {
            // 弱・普通：ランダム
            for (let i = 0; i < game.players.length; i++) {
                if (i === ci) continue;
                const theirCards = game.players[i].cards.filter(c => c.category !== "大施設");
                if (theirCards.length === 0) continue;
                const myCard = myCards[Math.floor(Math.random() * myCards.length)];
                const theirCard = theirCards[Math.floor(Math.random() * theirCards.length)];
                cpuDo(
                    'resolveBusiness',
                    { myCard: myCard.name, targetIndex: i, theirCard: theirCard.name },
                    () => {
                        game.resolveBusiness(myCard.name, i, theirCard.name);
                    }
                );
                return;
            }
        }
        game.pendingBusiness = false;
        game.phase = "build";
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

    // 弱いCPU：買えるカードからランダムに購入
    buildWeak(game, shopStock) {
        const current = game.currentPlayer();
        const affordable = CARDS.filter(card =>
            shopStock[card.name] > 0 &&
            current.coins >= card.cost &&
            !(card.color === "purple" && current.countCard(card.name) > 0)
        );
        if (affordable.length === 0) return;
        const card = affordable[Math.floor(Math.random() * affordable.length)];
        cpuDo(
            'buildCard',
            { cardName: card.name },
            () => {
                if (game.buildCard(card)) shopStock[card.name]--;
            }
        );
    }

    // 普通のCPU：コスパ重視
    buildNormal(game, shopStock) {
        const current = game.currentPlayer();

        // ランドマーク優先順位
        const landmarkPriority = ["港", "駅", "ショッピングモール", "遊園地", "電波塔", "空港"];
        for (const name of landmarkPriority) {
            const cost = Player.landmarkCost(name);
            if (!current.landmarks[name] && current.coins >= cost) {
                cpuDo(
                    'buildLandmark',
                    { name },
                    () => {
                        game.buildLandmark(name);
                    }
                );
                return;
            }
        }

        // コスパの良いカードを優先（収入/コストが高いもの）
        const affordable = CARDS.filter(card =>
            shopStock[card.name] > 0 &&
            current.coins >= card.cost &&
            card.cost > 0 &&
            !(card.color === "purple" && current.countCard(card.name) > 0)
        ).sort((a, b) => {
            const aVal = a.income / a.cost;
            const bVal = b.income / b.cost;
            return bVal - aVal;
        });

        if (affordable.length === 0) return;
        cpuDo(
            'buildCard',
            { cardName: affordable[0].name },
            () => {
                if (game.buildCard(affordable[0])) shopStock[affordable[0].name]--;
            }
        );
    }

    // 強いCPU：戦略的に購入
    buildStrong(game, shopStock) {
        const current = game.currentPlayer();
        const builtCount = Object.values(current.landmarks).filter(v => v).length;
        const landmarkPriority = ["港", "駅", "ショッピングモール", "遊園地", "電波塔", "空港"];

        // ランドマーク3つ以上建設済みなら残りを最優先
        if (builtCount >= 3) {
            for (const name of landmarkPriority) {
                const cost = Player.landmarkCost(name);
                if (!current.landmarks[name] && current.coins >= cost) {
                    cpuDo(
                        'buildLandmark',
                        { name },
                        () => {
                            game.buildLandmark(name);
                        }
                    );
                    return;
                }
            }
        }

        // 工場系シナジー戦略
        // 牧場2枚以上 → チーズ工場
        if (current.countCard("牧場") >= 2 &&
            shopStock["チーズ工場"] > 0 && current.coins >= 5) {
            const card = CARDS.find(c => c.name === "チーズ工場");
            cpuDo(
                'buildCard',
                { cardName: card.name },
                () => {
                    if (game.buildCard(card)) shopStock["チーズ工場"]--;
                }
            );
            return;
        }

        // 森林+鉱山2枚以上 → 家具工場
        if ((current.countCard("森林") + current.countCard("鉱山")) >= 2 &&
            shopStock["家具工場"] > 0 && current.coins >= 3) {
            const card = CARDS.find(c => c.name === "家具工場");
            cpuDo(
                'buildCard',
                { cardName: card.name },
                () => {
                    if (game.buildCard(card)) shopStock["家具工場"]--;
                }
            );
            return;
        }

        // ブドウ園2枚以上 → ワイナリー
        if (current.countCard("ブドウ園") >= 2 &&
            shopStock["ワイナリー"] > 0 && current.coins >= 3) {
            const card = CARDS.find(c => c.name === "ワイナリー");
            cpuDo(
                'buildCard',
                { cardName: card.name },
                () => {
                    if (game.buildCard(card)) shopStock["ワイナリー"]--;
                }
            );
            return;
        }

        // 花畑2枚以上 → フラワーショップ
        if (current.countCard("花畑") >= 2 &&
            shopStock["フラワーショップ"] > 0 && current.coins >= 1) {
            const card = CARDS.find(c => c.name === "フラワーショップ");
            cpuDo(
                'buildCard',
                { cardName: card.name },
                () => {
                    if (game.buildCard(card)) shopStock["フラワーショップ"]--;
                }
            );
            return;
        }

        // ランドマーク購入
        for (const name of landmarkPriority) {
            const cost = Player.landmarkCost(name);
            if (!current.landmarks[name] && current.coins >= cost) {
                cpuDo(
                    'buildLandmark',
                    { name },
                    () => {
                        game.buildLandmark(name);
                    }
                );
                return;
            }
        }

        // 青カード（安定収入）を優先
        const blueCards = CARDS.filter(card =>
            card.color === "blue" &&
            shopStock[card.name] > 0 &&
            current.coins >= card.cost
        ).sort((a, b) => b.income - a.income);

        if (blueCards.length > 0) {
            cpuDo(
                'buildCard',
                { cardName: blueCards[0].name },
                () => {
                    if (game.buildCard(blueCards[0])) shopStock[blueCards[0].name]--;
                }
            );
            return;
        }

        // その他コスパ順
        const affordable = CARDS.filter(card =>
            shopStock[card.name] > 0 &&
            current.coins >= card.cost &&
            card.cost > 0 &&
            !(card.color === "purple" && current.countCard(card.name) > 0)
        ).sort((a, b) => (b.income / b.cost) - (a.income / a.cost));

        if (affordable.length > 0) {
            cpuDo(
                'buildCard',
                { cardName: affordable[0].name },
                () => {
                    if (game.buildCard(affordable[0])) shopStock[affordable[0].name]--;
                }
            );
            return;
        }
    }
}
