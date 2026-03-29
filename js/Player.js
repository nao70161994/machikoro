class Player {
    constructor(name) {
        this.name = name;
        this.coins = 3;
        this.cards = [];
        this.dormantCards = []; // 休業中のカード
        this.itVentureCoins = 0; // ITベンチャーの積立コイン
        this.hasLoan = false;    // 貸金業を持っているか

        this.landmarks = {
            "駅":             false,
            "ショッピングモール": false,
            "遊園地":         false,
            "電波塔":         false,
            "港":             false,
            "空港":           false,
        };

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

    // 全ランドマーク建設済みか
    hasWon() {
        return Object.values(this.landmarks).every(v => v === true);
    }

    static landmarkCost(name) {
        return {
            "駅":             4,
            "ショッピングモール": 10,
            "遊園地":         16,
            "電波塔":         22,
            "港":             2,
            "空港":           30,
        }[name] ?? 0;
    }
}
