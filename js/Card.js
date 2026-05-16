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

function resolveCardStockName(cardRef) {
    if (!cardRef) return null;
    if (typeof cardRef === "string") {
        if (typeof CARD_NAME_BY_ID !== "undefined" && CARD_NAME_BY_ID[cardRef]) return CARD_NAME_BY_ID[cardRef];
        if (typeof CARD_ID_BY_NAME !== "undefined" && CARD_ID_BY_NAME[cardRef]) return cardRef;
        return null;
    }
    if (cardRef.name) return cardRef.name;
    if (cardRef.id && typeof CARD_NAME_BY_ID !== "undefined") return CARD_NAME_BY_ID[cardRef.id] || null;
    return null;
}

function resolveCardStockId(cardRef) {
    if (!cardRef) return null;
    if (typeof cardRef === "string") {
        if (typeof CARD_NAME_BY_ID !== "undefined" && CARD_NAME_BY_ID[cardRef]) return cardRef;
        if (typeof CARD_ID_BY_NAME !== "undefined") return CARD_ID_BY_NAME[cardRef] || null;
        return null;
    }
    if (cardRef.id) return cardRef.id;
    if (cardRef.name && typeof CARD_ID_BY_NAME !== "undefined") return CARD_ID_BY_NAME[cardRef.name] || null;
    return null;
}

function getShopStockCount(shopStock, cardRef) {
    if (!shopStock) return 0;
    const name = resolveCardStockName(cardRef);
    const id = resolveCardStockId(cardRef);
    if (name && Object.prototype.hasOwnProperty.call(shopStock, name)) return shopStock[name] || 0;
    if (id && Object.prototype.hasOwnProperty.call(shopStock, id)) return shopStock[id] || 0;
    return 0;
}

function setShopStockCount(shopStock, cardRef, count) {
    if (!shopStock || !Number.isInteger(count) || count < 0) return false;
    const name = resolveCardStockName(cardRef);
    const id = resolveCardStockId(cardRef);
    if (name && Object.prototype.hasOwnProperty.call(shopStock, name)) { shopStock[name] = count; return true; }
    if (id && Object.prototype.hasOwnProperty.call(shopStock, id)) { shopStock[id] = count; return true; }
    if (name) { shopStock[name] = count; return true; }
    return false;
}

function decrementShopStock(shopStock, cardRef) {
    const count = getShopStockCount(shopStock, cardRef);
    if (count <= 0) return false;
    return setShopStockCount(shopStock, cardRef, count - 1);
}

function assignShopStockSnapshot(shopStock, source) {
    if (!shopStock || !source || typeof source !== "object") return shopStock;
    for (const [key, count] of Object.entries(source)) {
        if (Number.isInteger(count) && count >= 0) setShopStockCount(shopStock, key, count);
    }
    return shopStock;
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

function getCardActivationProfile(card) {
    if (!card) return null;
    const metadata = CARD_EFFECT_METADATA[card.effect] || CARD_EFFECT_METADATA[CARD_EFFECTS.NORMAL];
    let targetScope = metadata.targetScope;
    let cpuKind = metadata.cpuKind;

    if (card.effect === CARD_EFFECTS.NORMAL) {
        if (card.color === "red") {
            targetScope = "current";
            cpuKind = "conditionalSteal";
        } else {
            targetScope = "self";
            cpuKind = "income";
        }
    }

    return Object.freeze({
        cardId: card.id || CARD_ID_BY_NAME[card.name] || null,
        effect: card.effect,
        color: card.color,
        timing: metadata.timing,
        targetScope,
        cpuKind,
        requires: metadata.requires || null,
        sideEffect: metadata.sideEffect || null,
        triggers: Object.freeze(Array.from(metadata.triggers || [])),
    });
}

const CARD_DEFS = Object.freeze([
    Object.freeze({ id: "wheat_field", name: "麦畑", cost: 1, diceNums: Object.freeze([1]), income: 1, color: "blue", category: "農園", effect: "normal" }),
    Object.freeze({ id: "ranch", name: "牧場", cost: 1, diceNums: Object.freeze([2]), income: 1, color: "blue", category: "畜産", effect: "normal" }),
    Object.freeze({ id: "forest", name: "森林", cost: 3, diceNums: Object.freeze([5]), income: 1, color: "blue", category: "工業", effect: "normal" }),
    Object.freeze({ id: "mine", name: "鉱山", cost: 6, diceNums: Object.freeze([9]), income: 5, color: "blue", category: "工業", effect: "normal" }),
    Object.freeze({ id: "apple_orchard", name: "リンゴ園", cost: 3, diceNums: Object.freeze([10]), income: 3, color: "blue", category: "農園", effect: "normal" }),
    Object.freeze({ id: "bakery", name: "パン屋", cost: 1, diceNums: Object.freeze([2,3]), income: 1, color: "green", category: "飲食店", effect: "normal" }),
    Object.freeze({ id: "convenience_store", name: "コンビニ", cost: 2, diceNums: Object.freeze([4]), income: 3, color: "green", category: "商店", effect: "normal" }),
    Object.freeze({ id: "cheese_factory", name: "チーズ工場", cost: 5, diceNums: Object.freeze([7]), income: 3, color: "green", category: "工業", effect: "cheese" }),
    Object.freeze({ id: "furniture_factory", name: "家具工場", cost: 3, diceNums: Object.freeze([8]), income: 3, color: "green", category: "工業", effect: "furniture" }),
    Object.freeze({ id: "fruit_market", name: "青果市場", cost: 2, diceNums: Object.freeze([11,12]), income: 2, color: "green", category: "商店", effect: "market" }),
    Object.freeze({ id: "cafe", name: "カフェ", cost: 2, diceNums: Object.freeze([3]), income: 1, color: "red", category: "飲食店", effect: "normal" }),
    Object.freeze({ id: "family_restaurant", name: "ファミレス", cost: 3, diceNums: Object.freeze([9,10]), income: 2, color: "red", category: "飲食店", effect: "normal" }),
    Object.freeze({ id: "stadium", name: "スタジアム", cost: 6, diceNums: Object.freeze([6]), income: 2, color: "purple", category: "大施設", effect: "stadium" }),
    Object.freeze({ id: "tv_station", name: "テレビ局", cost: 7, diceNums: Object.freeze([6]), income: 5, color: "purple", category: "大施設", effect: "tv" }),
    Object.freeze({ id: "business_center", name: "ビジネスセンター", cost: 8, diceNums: Object.freeze([6]), income: 0, color: "purple", category: "大施設", effect: "business" }),
    Object.freeze({ id: "flower_garden", name: "花畑", cost: 2, diceNums: Object.freeze([4]), income: 1, color: "blue", category: "農園", effect: "normal" }),
    Object.freeze({ id: "mackerel_boat", name: "サンマ漁船", cost: 2, diceNums: Object.freeze([8]), income: 3, color: "blue", category: "海産", effect: "harbor" }),
    Object.freeze({ id: "tuna_boat", name: "マグロ漁船", cost: 5, diceNums: Object.freeze([12,13,14]), income: 0, color: "blue", category: "海産", effect: "tuna" }),
    Object.freeze({ id: "flower_shop", name: "フラワーショップ", cost: 1, diceNums: Object.freeze([6]), income: 1, color: "green", category: "商店", effect: "flower" }),
    Object.freeze({ id: "food_warehouse", name: "食品倉庫", cost: 2, diceNums: Object.freeze([12,13]), income: 2, color: "green", category: "工業", effect: "foodwarehouse" }),
    Object.freeze({ id: "sushi_bar", name: "寿司屋", cost: 1, diceNums: Object.freeze([1]), income: 3, color: "red", category: "飲食店", effect: "harbor_red" }),
    Object.freeze({ id: "pizza_shop", name: "ピザ屋", cost: 1, diceNums: Object.freeze([7]), income: 1, color: "red", category: "飲食店", effect: "normal" }),
    Object.freeze({ id: "burger_shop", name: "バーガーショップ", cost: 1, diceNums: Object.freeze([8]), income: 1, color: "red", category: "飲食店", effect: "normal" }),
    Object.freeze({ id: "publisher", name: "出版社", cost: 5, diceNums: Object.freeze([7]), income: 0, color: "purple", category: "大施設", effect: "publisher" }),
    Object.freeze({ id: "tax_office", name: "税務署", cost: 4, diceNums: Object.freeze([8,9]), income: 0, color: "purple", category: "大施設", effect: "taxoffice" }),
    Object.freeze({ id: "corn_field", name: "コーン畑", cost: 2, diceNums: Object.freeze([3,4]), income: 1, color: "blue", category: "農園", effect: "cornfield" }),
    Object.freeze({ id: "vineyard", name: "ブドウ園", cost: 3, diceNums: Object.freeze([7]), income: 3, color: "blue", category: "農園", effect: "normal" }),
    Object.freeze({ id: "general_store", name: "雑貨屋", cost: 0, diceNums: Object.freeze([2]), income: 1, color: "green", category: "商店", effect: "fewlandmark" }),
    Object.freeze({ id: "renovation_company", name: "改装屋", cost: 1, diceNums: Object.freeze([4]), income: 8, color: "green", category: "商店", effect: "renovation" }),
    Object.freeze({ id: "loan_office", name: "貸金業", cost: 0, diceNums: Object.freeze([5,6]), income: 0, color: "green", category: "商店", effect: "loan" }),
    Object.freeze({ id: "winery", name: "ワイナリー", cost: 3, diceNums: Object.freeze([9]), income: 6, color: "green", category: "工業", effect: "winery" }),
    Object.freeze({ id: "moving_company", name: "引越し屋", cost: 2, diceNums: Object.freeze([9,10]), income: 4, color: "green", category: "商店", effect: "mover" }),
    Object.freeze({ id: "drink_factory", name: "ドリンク工場", cost: 5, diceNums: Object.freeze([11]), income: 1, color: "green", category: "工業", effect: "drinkfactory" }),
    Object.freeze({ id: "french_restaurant", name: "高級フレンチ", cost: 3, diceNums: Object.freeze([5]), income: 5, color: "red", category: "飲食店", effect: "frenchr" }),
    Object.freeze({ id: "members_bar", name: "会員制BAR", cost: 4, diceNums: Object.freeze([12,13,14]), income: 0, color: "red", category: "飲食店", effect: "memberbar" }),
    Object.freeze({ id: "cleaning_company", name: "清掃業", cost: 4, diceNums: Object.freeze([8]), income: 0, color: "purple", category: "大施設", effect: "cleaning" }),
    Object.freeze({ id: "it_startup", name: "ITベンチャー", cost: 1, diceNums: Object.freeze([10]), income: 0, color: "purple", category: "大施設", effect: "itstartup" }),
    Object.freeze({ id: "park", name: "公園", cost: 3, diceNums: Object.freeze([11,12,13]), income: 0, color: "purple", category: "大施設", effect: "park" })
]);

const CARD_NAME_BY_ID = Object.freeze(Object.fromEntries(
    CARD_DEFS.map(def => [def.id, def.name])
));

const CARD_ID_BY_NAME = Object.freeze(Object.fromEntries(
    CARD_DEFS.map(def => [def.name, def.id])
));

const CARDS = CARD_DEFS.map(def => new Card(
    def.name,
    def.cost,
    Array.from(def.diceNums),
    def.income,
    def.color,
    def.category,
    def.effect,
    def.id
));

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
