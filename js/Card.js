class Card {
    constructor(name, cost, diceNums, income, color, category, effect, id = null) {
        this.name = name;
        this.cost = cost;
        this.diceNums = diceNums;
        this.income = income;
        this.color = color;
        this.category = category;
        this.effect = effect;
        this.id = id;
    }
}

const DEFAULT_SHOP_STOCK = 6;

function getInitialCardStock(card, playerCount) {
    if (!card) return 0;
    if (card.color === "purple") {
        return Math.max(0, Math.floor(Number(playerCount) || 0));
    }
    return DEFAULT_SHOP_STOCK;
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

const CARD_CATEGORIES = Object.freeze({
    FARM:       "農園",
    LIVESTOCK:  "畜産",
    INDUSTRY:   "工業",
    RESTAURANT: "飲食店",
    SHOP:       "商店",
    FISHERY:    "海産",
    MAJOR:      "大施設",
});

const CARD_IDS = Object.freeze({
    WHEAT_FIELD:       "wheat_field",
    RANCH:             "ranch",
    FOREST:            "forest",
    MINE:              "mine",
    APPLE_ORCHARD:     "apple_orchard",
    BAKERY:            "bakery",
    CONVENIENCE:       "convenience_store",
    CHEESE_FACTORY:    "cheese_factory",
    FURNITURE_FACTORY: "furniture_factory",
    FRUIT_MARKET:      "fruit_market",
    CAFE:              "cafe",
    FAMILY_RESTAURANT: "family_restaurant",
    STADIUM:           "stadium",
    TV_STATION:        "tv_station",
    BUSINESS_CENTER:   "business_center",
    FLOWER_GARDEN:     "flower_garden",
    MACKEREL_BOAT:     "mackerel_boat",
    TUNA_BOAT:         "tuna_boat",
    FLOWER_SHOP:       "flower_shop",
    FOOD_WAREHOUSE:    "food_warehouse",
    SUSHI_BAR:         "sushi_bar",
    PIZZA_SHOP:        "pizza_shop",
    BURGER_SHOP:       "burger_shop",
    PUBLISHER:         "publisher",
    TAX_OFFICE:        "tax_office",
    CORN_FIELD:        "corn_field",
    VINEYARD:          "vineyard",
    GENERAL_STORE:     "general_store",
    RENOVATION:        "renovation_company",
    LOAN_OFFICE:       "loan_office",
    WINERY:            "winery",
    MOVER:             "moving_company",
    DRINK_FACTORY:     "drink_factory",
    FRENCH_RESTAURANT: "french_restaurant",
    MEMBERS_BAR:       "members_bar",
    CLEANING_COMPANY:  "cleaning_company",
    IT_STARTUP:        "it_startup",
    PARK:              "park",
});

const CARD_EFFECT_METADATA = Object.freeze({
    [CARD_EFFECTS.NORMAL]:        { timing: "income", targetScope: "self",      cpuKind: "income" },
    [CARD_EFFECTS.CHEESE]:        { timing: "income", targetScope: "self",      cpuKind: "comboIncome" },
    [CARD_EFFECTS.FURNITURE]:     { timing: "income", targetScope: "self",      cpuKind: "comboIncome" },
    [CARD_EFFECTS.MARKET]:        { timing: "income", targetScope: "self",      cpuKind: "comboIncome" },
    [CARD_EFFECTS.FLOWER]:        { timing: "income", targetScope: "self",      cpuKind: "comboIncome" },
    [CARD_EFFECTS.FOODWAREHOUSE]: { timing: "income", targetScope: "self",      cpuKind: "comboIncome" },
    [CARD_EFFECTS.FEWLANDMARK]:   { timing: "income", targetScope: "self",      cpuKind: "conditionalIncome" },
    [CARD_EFFECTS.WINERY]:        { timing: "income", targetScope: "self",      cpuKind: "comboIncome", sideEffect: "dormantSelf" },
    [CARD_EFFECTS.MOVER]:         { timing: "pending", targetScope: "opponent",  cpuKind: "interactive" },
    [CARD_EFFECTS.DRINKFACTORY]:  { timing: "income", targetScope: "self",      cpuKind: "comboIncome" },
    [CARD_EFFECTS.LOAN]:          { timing: "build",  targetScope: "self",      cpuKind: "upkeep", triggers: Object.freeze(["onBuild", "afterIncome"]) },
    [CARD_EFFECTS.RENOVATION]:    { timing: "pending", targetScope: "self",      cpuKind: "interactive" },
    [CARD_EFFECTS.HARBOR]:        { timing: "income", targetScope: "self",      cpuKind: "conditionalIncome", requires: "harbor" },
    [CARD_EFFECTS.HARBOR_RED]:    { timing: "income", targetScope: "current",   cpuKind: "conditionalSteal", requires: "harbor" },
    [CARD_EFFECTS.TUNA]:          { timing: "income", targetScope: "self",      cpuKind: "conditionalIncome", requires: "harbor" },
    [CARD_EFFECTS.CORNFIELD]:     { timing: "income", targetScope: "self",      cpuKind: "conditionalIncome" },
    [CARD_EFFECTS.FRENCHR]:       { timing: "income", targetScope: "current",   cpuKind: "conditionalSteal" },
    [CARD_EFFECTS.MEMBERBAR]:     { timing: "income", targetScope: "current",   cpuKind: "conditionalSteal" },
    [CARD_EFFECTS.STADIUM]:       { timing: "income", targetScope: "opponents", cpuKind: "steal" },
    [CARD_EFFECTS.TV]:            { timing: "pending", targetScope: "opponent",  cpuKind: "interactive" },
    [CARD_EFFECTS.BUSINESS]:      { timing: "pending", targetScope: "opponent",  cpuKind: "interactive" },
    [CARD_EFFECTS.PUBLISHER]:     { timing: "income", targetScope: "opponents", cpuKind: "steal" },
    [CARD_EFFECTS.TAXOFFICE]:     { timing: "income", targetScope: "opponents", cpuKind: "steal" },
    [CARD_EFFECTS.CLEANING]:      { timing: "pending", targetScope: "all",       cpuKind: "interactive" },
    [CARD_EFFECTS.ITSTARTUP]:     { timing: "turnEnd", targetScope: "opponents", cpuKind: "interactive", triggers: Object.freeze(["afterIncome", "turnEndPrompt"]) },
    [CARD_EFFECTS.PARK]:          { timing: "income", targetScope: "all",       cpuKind: "redistribute" },
});

const CARD_NAME_BY_ID = Object.freeze({
    [CARD_IDS.WHEAT_FIELD]:       "麦畑",
    [CARD_IDS.RANCH]:             "牧場",
    [CARD_IDS.FOREST]:            "森林",
    [CARD_IDS.MINE]:              "鉱山",
    [CARD_IDS.APPLE_ORCHARD]:     "リンゴ園",
    [CARD_IDS.BAKERY]:            "パン屋",
    [CARD_IDS.CONVENIENCE]:       "コンビニ",
    [CARD_IDS.CHEESE_FACTORY]:    "チーズ工場",
    [CARD_IDS.FURNITURE_FACTORY]: "家具工場",
    [CARD_IDS.FRUIT_MARKET]:      "青果市場",
    [CARD_IDS.CAFE]:              "カフェ",
    [CARD_IDS.FAMILY_RESTAURANT]: "ファミレス",
    [CARD_IDS.STADIUM]:           "スタジアム",
    [CARD_IDS.TV_STATION]:        "テレビ局",
    [CARD_IDS.BUSINESS_CENTER]:   "ビジネスセンター",
    [CARD_IDS.FLOWER_GARDEN]:     "花畑",
    [CARD_IDS.MACKEREL_BOAT]:     "サンマ漁船",
    [CARD_IDS.TUNA_BOAT]:         "マグロ漁船",
    [CARD_IDS.FLOWER_SHOP]:       "フラワーショップ",
    [CARD_IDS.FOOD_WAREHOUSE]:    "食品倉庫",
    [CARD_IDS.SUSHI_BAR]:         "寿司屋",
    [CARD_IDS.PIZZA_SHOP]:        "ピザ屋",
    [CARD_IDS.BURGER_SHOP]:       "バーガーショップ",
    [CARD_IDS.PUBLISHER]:         "出版社",
    [CARD_IDS.TAX_OFFICE]:        "税務署",
    [CARD_IDS.CORN_FIELD]:        "コーン畑",
    [CARD_IDS.VINEYARD]:          "ブドウ園",
    [CARD_IDS.GENERAL_STORE]:     "雑貨屋",
    [CARD_IDS.RENOVATION]:        "改装屋",
    [CARD_IDS.LOAN_OFFICE]:       "貸金業",
    [CARD_IDS.WINERY]:            "ワイナリー",
    [CARD_IDS.MOVER]:             "引越し屋",
    [CARD_IDS.DRINK_FACTORY]:     "ドリンク工場",
    [CARD_IDS.FRENCH_RESTAURANT]: "高級フレンチ",
    [CARD_IDS.MEMBERS_BAR]:       "会員制BAR",
    [CARD_IDS.CLEANING_COMPANY]:  "清掃業",
    [CARD_IDS.IT_STARTUP]:        "ITベンチャー",
    [CARD_IDS.PARK]:              "公園",
});

const CARD_ID_BY_NAME = Object.freeze(Object.fromEntries(
    Object.entries(CARD_NAME_BY_ID).map(([id, name]) => [name, id])
));

const CARDS = [
    // ===== 基本セット =====
    // 青カード
    new Card("麦畑",     1, [1],     1, "blue",   CARD_CATEGORIES.FARM,       CARD_EFFECTS.NORMAL),
    new Card("牧場",     1, [2],     1, "blue",   CARD_CATEGORIES.LIVESTOCK,  CARD_EFFECTS.NORMAL),
    new Card("森林",     3, [5],     1, "blue",   CARD_CATEGORIES.INDUSTRY,   CARD_EFFECTS.NORMAL),
    new Card("鉱山",     6, [9],     5, "blue",   CARD_CATEGORIES.INDUSTRY,   CARD_EFFECTS.NORMAL),
    new Card("リンゴ園", 3, [10],    3, "blue",   CARD_CATEGORIES.FARM,       CARD_EFFECTS.NORMAL),
    // 緑カード
    new Card("パン屋",      1, [2,3],   1, "green", CARD_CATEGORIES.RESTAURANT, CARD_EFFECTS.NORMAL),
    new Card("コンビニ",    2, [4],     3, "green", CARD_CATEGORIES.SHOP,       CARD_EFFECTS.NORMAL),
    new Card("チーズ工場",  5, [7],     3, "green", CARD_CATEGORIES.INDUSTRY,   CARD_EFFECTS.CHEESE),
    new Card("家具工場",    3, [8],     3, "green", CARD_CATEGORIES.INDUSTRY,   CARD_EFFECTS.FURNITURE),
    new Card("青果市場",    2, [11,12], 2, "green", CARD_CATEGORIES.SHOP,       CARD_EFFECTS.MARKET),
    // 赤カード
    new Card("カフェ",    2, [3],    1, "red", CARD_CATEGORIES.RESTAURANT, CARD_EFFECTS.NORMAL),
    new Card("ファミレス",3, [9,10], 2, "red", CARD_CATEGORIES.RESTAURANT, CARD_EFFECTS.NORMAL),
    // 紫カード（大施設）
    new Card("スタジアム",      6, [6], 2, "purple", CARD_CATEGORIES.MAJOR, CARD_EFFECTS.STADIUM),
    new Card("テレビ局",        7, [6], 5, "purple", CARD_CATEGORIES.MAJOR, CARD_EFFECTS.TV),
    new Card("ビジネスセンター",8, [6], 0, "purple", CARD_CATEGORIES.MAJOR, CARD_EFFECTS.BUSINESS),

    // ===== プラス =====
    // 青カード
    new Card("花畑",     2, [4],     1, "blue",  CARD_CATEGORIES.FARM,       CARD_EFFECTS.NORMAL),
    new Card("サンマ漁船",2, [8],     3, "blue",  CARD_CATEGORIES.FISHERY,    CARD_EFFECTS.HARBOR),
    new Card("マグロ漁船",5, [12,13,14],0,"blue", CARD_CATEGORIES.FISHERY,    CARD_EFFECTS.TUNA),
    // 緑カード
    new Card("フラワーショップ",1,[6], 1, "green", CARD_CATEGORIES.SHOP,       CARD_EFFECTS.FLOWER),
    new Card("食品倉庫",  2, [12,13], 2, "green", CARD_CATEGORIES.INDUSTRY,   CARD_EFFECTS.FOODWAREHOUSE),
    // 赤カード
    new Card("寿司屋",   1, [1],     3, "red",   CARD_CATEGORIES.RESTAURANT, CARD_EFFECTS.HARBOR_RED),
    new Card("ピザ屋",   1, [7],     1, "red",   CARD_CATEGORIES.RESTAURANT, CARD_EFFECTS.NORMAL),
    new Card("バーガーショップ",1,[8],1, "red",   CARD_CATEGORIES.RESTAURANT, CARD_EFFECTS.NORMAL),
    // 紫カード（大施設）
    new Card("出版社",   5, [7],     0, "purple", CARD_CATEGORIES.MAJOR, CARD_EFFECTS.PUBLISHER),
    new Card("税務署",   4, [8,9],   0, "purple", CARD_CATEGORIES.MAJOR, CARD_EFFECTS.TAXOFFICE),
];

// ===== シャープ =====
// 青カード
CARDS.push(new Card("コーン畑",   2, [3,4],   1, "blue",   CARD_CATEGORIES.FARM,       CARD_EFFECTS.CORNFIELD));
CARDS.push(new Card("ブドウ園",   3, [7],     3, "blue",   CARD_CATEGORIES.FARM,       CARD_EFFECTS.NORMAL));
// 緑カード
CARDS.push(new Card("雑貨屋",     0, [2],     1, "green",  CARD_CATEGORIES.SHOP,       CARD_EFFECTS.FEWLANDMARK));
CARDS.push(new Card("改装屋",     1, [4],     8, "green",  CARD_CATEGORIES.SHOP,       CARD_EFFECTS.RENOVATION));
CARDS.push(new Card("貸金業",     0, [5,6],   0, "green",  CARD_CATEGORIES.SHOP,       CARD_EFFECTS.LOAN));
CARDS.push(new Card("ワイナリー", 3, [9],     6, "green",  CARD_CATEGORIES.INDUSTRY,   CARD_EFFECTS.WINERY));
CARDS.push(new Card("引越し屋",   2, [9,10],  4, "green",  CARD_CATEGORIES.SHOP,       CARD_EFFECTS.MOVER));
CARDS.push(new Card("ドリンク工場",5,[11],    1, "green",  CARD_CATEGORIES.INDUSTRY,   CARD_EFFECTS.DRINKFACTORY));
// 赤カード
CARDS.push(new Card("高級フレンチ",3,[5],     5, "red",    CARD_CATEGORIES.RESTAURANT, CARD_EFFECTS.FRENCHR));
CARDS.push(new Card("会員制BAR",  4, [12,13,14],0,"red",  CARD_CATEGORIES.RESTAURANT, CARD_EFFECTS.MEMBERBAR));
// 紫カード
CARDS.push(new Card("清掃業",     4, [8],     0, "purple", CARD_CATEGORIES.MAJOR,      CARD_EFFECTS.CLEANING));
CARDS.push(new Card("ITベンチャー",1,[10],    0, "purple", CARD_CATEGORIES.MAJOR,      CARD_EFFECTS.ITSTARTUP));
CARDS.push(new Card("公園",       3, [11,12,13],0,"purple",CARD_CATEGORIES.MAJOR,      CARD_EFFECTS.PARK));

for (const card of CARDS) {
    card.id = CARD_ID_BY_NAME[card.name] || null;
}

const CARD_EFFECT_DESCRIPTIONS = Object.freeze({
    [CARD_EFFECTS.CHEESE]:       (i) => `牧場1軒につき+${i}コイン`,
    [CARD_EFFECTS.FURNITURE]:    (i) => `森林・鉱山1軒につき+${i}コイン`,
    [CARD_EFFECTS.MARKET]:       (i) => `農園系1軒につき+${i}コイン`,
    [CARD_EFFECTS.FLOWER]:       (i) => `花畑1軒につき+${i}コイン`,
    [CARD_EFFECTS.FOODWAREHOUSE]:(i) => `飲食店1軒につき+${i}コイン`,
    [CARD_EFFECTS.STADIUM]:      (i) => `全員から${i}コイン奪う`,
    [CARD_EFFECTS.TV]:           (i) => `任意の1人から${i}コイン奪う`,
    [CARD_EFFECTS.BUSINESS]:     ()  => `大施設以外を他プレイヤーと交換`,
    [CARD_EFFECTS.PUBLISHER]:    ()  => `全員の飲食店・商店1軒につき1コイン奪う`,
    [CARD_EFFECTS.TAXOFFICE]:    ()  => `10コイン以上の全員から半分奪う`,
    [CARD_EFFECTS.HARBOR]:       (i) => `港あり：+${i}コイン`,
    [CARD_EFFECTS.HARBOR_RED]:   (i) => `港あり：相手から${i}コイン奪う`,
    [CARD_EFFECTS.TUNA]:         ()  => `港あり：ダイス2個分コイン`,
    [CARD_EFFECTS.CORNFIELD]:    ()  => `ランドマーク0-1軒なら+1コイン`,
    [CARD_EFFECTS.FEWLANDMARK]:  ()  => `ランドマーク0-1軒なら+1コイン`,
    [CARD_EFFECTS.RENOVATION]:   ()  => `ランドマーク1軒を戻して+8コイン`,
    [CARD_EFFECTS.LOAN]:         ()  => `建設時+5コイン・5か6が出たら-2コイン`,
    [CARD_EFFECTS.WINERY]:       ()  => `ブドウ園1軒につき+6コイン（自身休業）`,
    [CARD_EFFECTS.MOVER]:        ()  => `大施設以外を相手に渡して+4コイン`,
    [CARD_EFFECTS.DRINKFACTORY]: ()  => `全員の飲食店1軒につき+1コイン`,
    [CARD_EFFECTS.FRENCHR]:      ()  => `相手ランドマーク2軒以上なら5コイン奪う`,
    [CARD_EFFECTS.MEMBERBAR]:    ()  => `相手ランドマーク3軒以上なら全コイン奪う`,
    [CARD_EFFECTS.CLEANING]:     ()  => `施設1種を休業にして休業数コイン獲得`,
    [CARD_EFFECTS.ITSTARTUP]:    ()  => `ターン終了時1コイン積立・全員から積立額奪う`,
    [CARD_EFFECTS.PARK]:         ()  => `全員のコインを均等分配`,
});

function cloneCard(card) {
    if (!card) return null;
    return new Card(card.name, card.cost, [...card.diceNums], card.income, card.color, card.category, card.effect, card.id || CARD_ID_BY_NAME[card.name] || null);
}

function createCardByName(name) {
    const card = CARDS.find(c => c.name === name);
    return cloneCard(card);
}

function createCardById(id) {
    return createCardByName(CARD_NAME_BY_ID[id]);
}
