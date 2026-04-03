class Card {
    constructor(name, cost, diceNums, income, color, category, effect) {
        this.name = name;
        this.cost = cost;
        this.diceNums = diceNums;
        this.income = income;
        this.color = color;
        this.category = category;
        this.effect = effect;
    }
}

const CARD_EFFECTS = Object.freeze({
    NORMAL:        "normal",
    CHEESE:        "cheese",
    FURNITURE:     "furniture",
    MARKET:        "market",
    FLOWER:        "flower",
    FOODWAREHOUSE: "foodwarehouse",
    FEWLANDMARK:   "fewlandmark",
    WINERY:        "winery",
    MOVER:         "mover",
    DRINKFACTORY:  "drinkfactory",
    LOAN:          "loan",
    RENOVATION:    "renovation",
    HARBOR:        "harbor",
    HARBOR_RED:    "harbor_red",
    TUNA:          "tuna",
    CORNFIELD:     "cornfield",
    FRENCHR:       "frenchr",
    MEMBERBAR:     "memberbar",
    STADIUM:       "stadium",
    TV:            "tv",
    BUSINESS:      "business",
    PUBLISHER:     "publisher",
    TAXOFFICE:     "taxoffice",
    CLEANING:      "cleaning",
    ITSTARTUP:     "itstartup",
    PARK:          "park",
});

const CARDS = [
    // ===== 基本セット =====
    // 青カード
    new Card("麦畑",     1, [1],     1, "blue",   "農園",   CARD_EFFECTS.NORMAL),
    new Card("牧場",     1, [2],     1, "blue",   "畜産",   CARD_EFFECTS.NORMAL),
    new Card("森林",     3, [5],     1, "blue",   "工業",   CARD_EFFECTS.NORMAL),
    new Card("鉱山",     6, [9],     5, "blue",   "工業",   CARD_EFFECTS.NORMAL),
    new Card("リンゴ園", 3, [10],    3, "blue",   "農園",   CARD_EFFECTS.NORMAL),
    // 緑カード
    new Card("パン屋",      1, [2,3],   1, "green", "飲食店", CARD_EFFECTS.NORMAL),
    new Card("コンビニ",    2, [4],     3, "green", "商店",   CARD_EFFECTS.NORMAL),
    new Card("チーズ工場",  5, [7],     3, "green", "工業",   CARD_EFFECTS.CHEESE),
    new Card("家具工場",    3, [8],     3, "green", "工業",   CARD_EFFECTS.FURNITURE),
    new Card("青果市場",    2, [11,12], 2, "green", "商店",   CARD_EFFECTS.MARKET),
    // 赤カード
    new Card("カフェ",    2, [3],    1, "red", "飲食店", CARD_EFFECTS.NORMAL),
    new Card("ファミレス",3, [9,10], 2, "red", "飲食店", CARD_EFFECTS.NORMAL),
    // 紫カード（大施設）
    new Card("スタジアム",      6, [6], 2, "purple", "大施設", CARD_EFFECTS.STADIUM),
    new Card("テレビ局",        7, [6], 5, "purple", "大施設", CARD_EFFECTS.TV),
    new Card("ビジネスセンター",8, [6], 0, "purple", "大施設", CARD_EFFECTS.BUSINESS),

    // ===== プラス =====
    // 青カード
    new Card("花畑",     2, [4],     1, "blue",  "農園",   CARD_EFFECTS.NORMAL),
    new Card("サンマ漁船",2, [8],     3, "blue",  "海産",   CARD_EFFECTS.HARBOR),
    new Card("マグロ漁船",5, [12,13,14],0,"blue", "海産",   CARD_EFFECTS.TUNA),
    // 緑カード
    new Card("フラワーショップ",1,[6], 1, "green", "商店",   CARD_EFFECTS.FLOWER),
    new Card("食品倉庫",  2, [12,13], 2, "green", "工業",   CARD_EFFECTS.FOODWAREHOUSE),
    // 赤カード
    new Card("寿司屋",   1, [1],     3, "red",   "飲食店", CARD_EFFECTS.HARBOR_RED),
    new Card("ピザ屋",   1, [7],     1, "red",   "飲食店", CARD_EFFECTS.NORMAL),
    new Card("バーガーショップ",1,[8],1, "red",   "飲食店", CARD_EFFECTS.NORMAL),
    // 紫カード（大施設）
    new Card("出版社",   5, [7],     0, "purple", "大施設", CARD_EFFECTS.PUBLISHER),
    new Card("税務署",   4, [8,9],   0, "purple", "大施設", CARD_EFFECTS.TAXOFFICE),
];

// ===== シャープ =====
// 青カード
CARDS.push(new Card("コーン畑",   2, [3,4],   1, "blue",   "農園",   CARD_EFFECTS.CORNFIELD));
CARDS.push(new Card("ブドウ園",   3, [7],     3, "blue",   "農園",   CARD_EFFECTS.NORMAL));
// 緑カード
CARDS.push(new Card("雑貨屋",     0, [2],     1, "green",  "商店",   CARD_EFFECTS.FEWLANDMARK));
CARDS.push(new Card("改装屋",     1, [4],     8, "green",  "商店",   CARD_EFFECTS.RENOVATION));
CARDS.push(new Card("貸金業",     0, [5,6],   0, "green",  "商店",   CARD_EFFECTS.LOAN));
CARDS.push(new Card("ワイナリー", 3, [9],     6, "green",  "工業",   CARD_EFFECTS.WINERY));
CARDS.push(new Card("引越し屋",   2, [9,10],  4, "green",  "商店",   CARD_EFFECTS.MOVER));
CARDS.push(new Card("ドリンク工場",5,[11],    1, "green",  "工業",   CARD_EFFECTS.DRINKFACTORY));
// 赤カード
CARDS.push(new Card("高級フレンチ",3,[5],     5, "red",    "飲食店", CARD_EFFECTS.FRENCHR));
CARDS.push(new Card("会員制BAR",  4, [12,13,14],0,"red",  "飲食店", CARD_EFFECTS.MEMBERBAR));
// 紫カード
CARDS.push(new Card("清掃業",     4, [8],     0, "purple", "大施設", CARD_EFFECTS.CLEANING));
CARDS.push(new Card("ITベンチャー",1,[10],    0, "purple", "大施設", CARD_EFFECTS.ITSTARTUP));
CARDS.push(new Card("公園",       3, [11,12,13],0,"purple","大施設", CARD_EFFECTS.PARK));

function cloneCard(card) {
    if (!card) return null;
    return new Card(card.name, card.cost, [...card.diceNums], card.income, card.color, card.category, card.effect);
}

function createCardByName(name) {
    const card = CARDS.find(c => c.name === name);
    return cloneCard(card);
}
