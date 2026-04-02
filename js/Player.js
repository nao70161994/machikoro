class Player {
    constructor(name) {
        this.name = name;
        this.coins = 3;
        this.cards = [];
        this.dormantCards = []; // 休業中のカード
        this.itVentureCoins = 0; // ITベンチャーの積立コイン

        this.landmarks = Object.fromEntries(
            Player._LANDMARK_DEFS.map(d => [d.name, false])
        );

        // 役所は特殊初期カードとして別管理
        this.hasYakusho = true;
    }

    addCard(card) { this.cards.push(card); }

    countCard(name) {
        return this.cards.filter(c => c.name === name && !this.isDormant(c)).length;
    }

    // 休業中かどうか
    isDormant(card) {
        return this.dormantCards.includes(card);
    }

    // カードを休業にする
    makeDormant(card) {
        if (!this.dormantCards.includes(card)) {
            this.dormantCards.push(card);
        }
    }

    // 休業を解除する
    revive(card) {
        this.dormantCards = this.dormantCards.filter(c => c !== card);
    }

    // 有効なランドマークを全て建設済みか
    hasWon(enabledLandmarks = Player.landmarkNames()) {
        return enabledLandmarks.every(name => this.landmarks[name] === true);
    }

    static landmarkNames() {
        return Player._LANDMARK_DEFS.map(d => d.name);
    }

    static landmarkCost(name) {
        return (Player._LANDMARK_DEFS.find(d => d.name === name) ?? { cost: 0 }).cost;
    }
}

Player._LANDMARK_DEFS = [
    { name: "駅",             cost: 4  },
    { name: "ショッピングモール", cost: 10 },
    { name: "遊園地",         cost: 16 },
    { name: "電波塔",         cost: 22 },
    { name: "港",             cost: 2  },
    { name: "空港",           cost: 30 },
];
