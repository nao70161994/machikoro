const LANDMARK_NAMES = Object.freeze({
    STATION:        "駅",
    SHOPPING_MALL:  "ショッピングモール",
    AMUSEMENT_PARK: "遊園地",
    RADIO_TOWER:    "電波塔",
    HARBOR:         "港",
    AIRPORT:        "空港",
    YAKUSHO:        "役所",
});

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

    countCardIncludingDormant(name) {
        return this.cards.filter(c => c.name === name).length;
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

    // 建設済みランドマーク数
    builtLandmarkCount() {
        return Object.values(this.landmarks).filter(v => v).length;
    }

    // 大施設以外のカード一覧
    getMinorCards() {
        return this.cards.filter(c => c.category !== CARD_CATEGORIES.MAJOR);
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
    { name: LANDMARK_NAMES.STATION,        cost: 4,  emoji: "🚉",  effect: "サイコロを1個か2個か選べる" },
    { name: LANDMARK_NAMES.SHOPPING_MALL,  cost: 10, emoji: "🛍️", effect: "飲食店・商店の収入+1" },
    { name: LANDMARK_NAMES.AMUSEMENT_PARK, cost: 16, emoji: "🎡", effect: "ゾロ目でもう1ターン" },
    { name: LANDMARK_NAMES.RADIO_TOWER,    cost: 22, emoji: "📡", effect: "1ターン1回振り直せる" },
    { name: LANDMARK_NAMES.HARBOR,         cost: 2,  emoji: "⚓",  effect: "ダイス合計10以上で+2選択可" },
    { name: LANDMARK_NAMES.AIRPORT,        cost: 30, emoji: "✈️", effect: "建設しないターンに+10コイン" },
];
