const LOG_TYPES = Object.freeze({
    DICE:    "dice",
    GAIN:    "gain",
    LOSE:    "lose",
    BUILD:   "build",
    SPECIAL: "special",
    SYSTEM:  "system",
    ERROR:   "error",
});

const GAME_PHASES = Object.freeze({
    ROLL:           "roll",
    SELECT_DICE:    "selectDice",
    REROLL_CONFIRM: "rerollConfirm",
    HARBOR_CHOICE:  "harborChoice",
    PENDING:        "pending",
    BUILD:          "build",
});

const GAME_ACTIONS = Object.freeze({
    ROLL_DICE:          "rollDice",
    SELECT_DICE:        "selectDice",
    REROLL_DICE:        "rerollDice",
    SKIP_REROLL:        "skipReroll",
    RESOLVE_HARBOR:     "resolveHarbor",
    RESOLVE_TV:         "resolveTV",
    RESOLVE_BUSINESS:   "resolveBusiness",
    RESOLVE_CLEANING:   "resolveCleaning",
    RESOLVE_MOVER:      "resolveMover",
    RESOLVE_RENOVATION: "resolveRenovation",
    RESOLVE_IT:         "resolveIT",
    BUILD_CARD:         "buildCard",
    BUILD_LANDMARK:     "buildLandmark",
    UNDO_BUILD:         "undoBuild",
    NEXT_TURN:          "nextTurn",
});

const GAME_PHASE_ACTIONS = Object.freeze({
    [GAME_PHASES.ROLL]:           Object.freeze([GAME_ACTIONS.ROLL_DICE]),
    [GAME_PHASES.SELECT_DICE]:    Object.freeze([GAME_ACTIONS.SELECT_DICE]),
    [GAME_PHASES.REROLL_CONFIRM]: Object.freeze([GAME_ACTIONS.REROLL_DICE, GAME_ACTIONS.SKIP_REROLL]),
    [GAME_PHASES.HARBOR_CHOICE]:  Object.freeze([GAME_ACTIONS.RESOLVE_HARBOR]),
    [GAME_PHASES.BUILD]:          Object.freeze([GAME_ACTIONS.BUILD_CARD, GAME_ACTIONS.BUILD_LANDMARK, GAME_ACTIONS.NEXT_TURN, GAME_ACTIONS.UNDO_BUILD]),
});

function formatDiceOutcome(d1, d2, total) {
    if (d1 > 0 && d2 > 0) {
        return `${d1}+${d2}=${total}`;
    }
    return `${total}`;
}

function rollRandomDie() {
    const cryptoApi = (typeof window !== "undefined" && window.crypto && typeof window.crypto.getRandomValues === "function")
        ? window.crypto
        : null;
    if (cryptoApi) {
        const buffer = new Uint8Array(1);
        const limit = 252;
        do {
            cryptoApi.getRandomValues(buffer);
        } while (buffer[0] >= limit);
        return (buffer[0] % 6) + 1;
    }
    return Math.floor(Math.random() * 6) + 1;
}

const CARD_INCOME_EFFECT_HANDLERS = Object.freeze({
    [CARD_EFFECTS.CHEESE]: (card, owner) =>
        owner.countCard(CARD_NAME_BY_ID[CARD_IDS.RANCH]) * card.income,
    [CARD_EFFECTS.FURNITURE]: (card, owner) =>
        (owner.countCard(CARD_NAME_BY_ID[CARD_IDS.FOREST]) + owner.countCard(CARD_NAME_BY_ID[CARD_IDS.MINE])) * card.income,
    [CARD_EFFECTS.MARKET]: (card, owner) =>
        owner.cards.filter(c => c.category === CARD_CATEGORIES.FARM && !owner.isDormant(c)).length * card.income,
    [CARD_EFFECTS.FLOWER]: (card, owner) =>
        owner.countCard(CARD_NAME_BY_ID[CARD_IDS.FLOWER_GARDEN]) * card.income,
    [CARD_EFFECTS.FOODWAREHOUSE]: (card, owner) =>
        owner.cards.filter(c => c.category === CARD_CATEGORIES.RESTAURANT && !owner.isDormant(c)).length * card.income,
    [CARD_EFFECTS.FEWLANDMARK]: (card, owner) =>
        owner.builtLandmarkCount() <= 1 ? card.income : 0,
    [CARD_EFFECTS.CORNFIELD]: (card, owner) =>
        owner.builtLandmarkCount() <= 1 ? card.income : 0,
    [CARD_EFFECTS.WINERY]: (card, owner) =>
        owner.cards.filter(c => c.name === CARD_NAME_BY_ID[CARD_IDS.VINEYARD] && !owner.isDormant(c)).length * card.income,
    [CARD_EFFECTS.DRINKFACTORY]: (card, owner, game) =>
        game.players.reduce((sum, p) =>
            sum + p.cards.filter(c => c.category === CARD_CATEGORIES.RESTAURANT && !p.isDormant(c)).length, 0) * card.income,
});

class GameManager {
    constructor(playerCount) {
        this.players = [];
        this.currentPlayerIndex = 0;
        this.lastDiceResult = 0;
        this.lastDice1 = 0;
        this.lastDice2 = 0;
        this.phase = GAME_PHASES.ROLL;
        this.log = [];
        this.builtThisTurn = false;
        this.pendingTV = 0;
        this.pendingBusiness = 0;
        this.pendingCleaning = 0;
        this.pendingMover = 0;
        this.pendingRenovation = 0;
        this.pendingIT = false;
        this.usedReroll = false;
        this.pendingTunaDice = null;
        this.turnCount = 0;
        this.enabledLandmarks = new Set(Player.landmarkNames());
        this.hadAmusementParkAtRoll = false;

        for (let i = 0; i < playerCount; i++) {
            const p = new Player(`プレイヤー${i + 1}`);
            p.addCard(createCardByName("麦畑"));
            p.addCard(createCardByName("パン屋"));
            this.players.push(p);
        }

    }

    currentPlayer() { return this.players[this.currentPlayerIndex]; }

    _resolveCardRef(player, ref) {
        if (!player) return null;
        if (Number.isInteger(ref)) {
            const card = player.cards[ref];
            return (card && card.category !== CARD_CATEGORIES.MAJOR) ? card : null;
        }
        return player.cards.find(c => c.name === ref && c.category !== CARD_CATEGORIES.MAJOR) || null;
    }

    _hasBusinessExchange(currentPlayerIndex) {
        const current = this.players[currentPlayerIndex];
        if (!current || current.getMinorCards().length === 0) return false;
        return this.players.some((player, index) =>
            index !== currentPlayerIndex && player.getMinorCards().length > 0
        );
    }

    _hasCleaningTarget() {
        return this.players.some(player =>
            player.cards.some(card => card.category !== CARD_CATEGORIES.MAJOR && !player.isDormant(card))
        );
    }

    static allowedActionsFor(game) {
        if (!game) return new Set();
        if (game.pendingIT) return new Set([GAME_ACTIONS.RESOLVE_IT]);
        if (game.phase === GAME_PHASES.PENDING) {
            const actions = new Set();
            if (game.pendingTV > 0) actions.add(GAME_ACTIONS.RESOLVE_TV);
            if (game.pendingBusiness > 0) actions.add(GAME_ACTIONS.RESOLVE_BUSINESS);
            if (game.pendingCleaning > 0) actions.add(GAME_ACTIONS.RESOLVE_CLEANING);
            if (game.pendingMover > 0) actions.add(GAME_ACTIONS.RESOLVE_MOVER);
            if (game.pendingRenovation > 0) actions.add(GAME_ACTIONS.RESOLVE_RENOVATION);
            return actions;
        }
        return new Set(GAME_PHASE_ACTIONS[game.phase] || []);
    }

    allowedActions() {
        return GameManager.allowedActionsFor(this);
    }

    rollDice(forceDice = null, tunaDice = null) {
        if (this.phase !== GAME_PHASES.ROLL) return;
        if (this.currentPlayer().landmarks[LANDMARK_NAMES.STATION]) {
            this.phase = GAME_PHASES.SELECT_DICE;
            this.pendingTunaDice = tunaDice;
            this.addLog(LOG_TYPES.DICE, `🚉 駅：1個か2個か選んでください`);
        } else {
            const d1 = forceDice !== null ? forceDice : rollRandomDie();
            this.lastDice1 = d1;
            this.lastDice2 = 0;
            this.lastDiceResult = d1;
            this.hadAmusementParkAtRoll = this.currentPlayer().landmarks[LANDMARK_NAMES.AMUSEMENT_PARK];
            this.addLog(LOG_TYPES.DICE, `🎲 ${d1} が出ました`);
            this.afterRoll(tunaDice);
        }
    }

    selectDiceCount(useTwo, forceDice1 = null, forceDice2 = null, tunaDice = null) {
        if (this.phase !== GAME_PHASES.SELECT_DICE) return;
        if (useTwo) {
            const d1 = forceDice1 !== null ? forceDice1 : rollRandomDie();
            const d2 = forceDice2 !== null ? forceDice2 : rollRandomDie();
            this.lastDice1 = d1;
            this.lastDice2 = d2;
            this.lastDiceResult = d1 + d2;
            this.hadAmusementParkAtRoll = this.currentPlayer().landmarks[LANDMARK_NAMES.AMUSEMENT_PARK];
            this.addLog(LOG_TYPES.DICE, `🎲 ${d1}+${d2}=${this.lastDiceResult}`);
        } else {
            const d1 = forceDice1 !== null ? forceDice1 : rollRandomDie();
            this.lastDice1 = d1;
            this.lastDice2 = 0;
            this.lastDiceResult = d1;
            this.hadAmusementParkAtRoll = this.currentPlayer().landmarks[LANDMARK_NAMES.AMUSEMENT_PARK];
            this.addLog(LOG_TYPES.DICE, `🎲 ${d1} が出ました`);
        }
        this.afterRoll(tunaDice || this.pendingTunaDice);
    }

    afterRoll(tunaDice = null) {
        if (this.currentPlayer().landmarks[LANDMARK_NAMES.RADIO_TOWER] && !this.usedReroll) {
            this.phase = GAME_PHASES.REROLL_CONFIRM;
            this.pendingTunaDice = tunaDice;
        } else {
            this.applyHarborOrIncome(tunaDice);
        }
    }

    rerollDice(forceDice = null, tunaDice = null) {
        if (this.phase !== GAME_PHASES.REROLL_CONFIRM) return;
        const prevDice1 = this.lastDice1;
        const prevDice2 = this.lastDice2;
        const prevResult = this.lastDiceResult;
        this.usedReroll = true;
        this.lastDiceResult = 0;
        this.lastDice1 = 0;
        this.lastDice2 = 0;
        this.log = [];
        this.phase = GAME_PHASES.ROLL;
        this.rollDice(forceDice, tunaDice);
        this.addLog(
            LOG_TYPES.DICE,
            `📡 電波塔で振り直し: ${formatDiceOutcome(prevDice1, prevDice2, prevResult)} → ${formatDiceOutcome(this.lastDice1, this.lastDice2, this.lastDiceResult)}`
        );
    }

    skipReroll() {
        if (this.phase !== GAME_PHASES.REROLL_CONFIRM) return;
        this.applyHarborOrIncome(this.pendingTunaDice);
    }

    applyHarborOrIncome(tunaDice = null) {
        const useTwo = this.lastDice1 > 0 && this.lastDice2 > 0;
        if (useTwo && this.currentPlayer().landmarks[LANDMARK_NAMES.HARBOR] && this.lastDiceResult >= 10) {
            this.phase = GAME_PHASES.HARBOR_CHOICE;
            this.pendingTunaDice = tunaDice;
            this.addLog(LOG_TYPES.DICE, `⚓ 港効果：合計${this.lastDiceResult}に+2しますか？`);
        } else {
            this.processIncome(tunaDice);
        }
    }

    resolveHarbor(useBonus, tunaDice = null) {
        if (this.phase !== GAME_PHASES.HARBOR_CHOICE) return false;
        if (useBonus) {
            this.lastDiceResult += 2;
            this.addLog(LOG_TYPES.DICE, `⚓ 港効果+2 → ${this.lastDiceResult}`);
        } else {
            this.addLog(LOG_TYPES.DICE, `→ そのまま ${this.lastDiceResult} を使用`);
        }
        this.processIncome(tunaDice || this.pendingTunaDice);
        return true;
    }

    // 緑カードの収入額を計算する共有メソッド。
    // _processGreen・CPU._cardActivationValue・CPU.evalCard が参照することで
    // ゲームロジックと CPU 予測の乖離を防ぐ。
    // 副作用（pendingMover++ など）を持つカードは含まない。
    static calcCardIncome(card, owner, game) {
        const handler = CARD_INCOME_EFFECT_HANDLERS[card.effect];
        if (handler) return handler(card, owner, game);

        let amount = card.income;
        if (owner.landmarks[LANDMARK_NAMES.SHOPPING_MALL] &&
            (card.category === CARD_CATEGORIES.RESTAURANT || card.category === CARD_CATEGORIES.SHOP)) amount += 1;
        return amount;
    }

    _reviveDormantCardsForDice(player, dice, shouldRevive) {
        const revived = new Set();
        for (const card of [...player.dormantCards]) {
            if (!card.diceNums.includes(dice) || !shouldRevive(card)) continue;
            player.revive(card);
            revived.add(card);
            this.addLog(LOG_TYPES.SPECIAL, `💤 ${player.name}の${card.name}が休業解除`);
        }
        return revived;
    }

    processIncome(tunaDice = null) {
        const dice = this.lastDiceResult;
        const current = this.currentPlayer();
        const ci = this.currentPlayerIndex;

        this._processRed(current, ci, dice);
        this._processBlue(dice, tunaDice);
        this._processGreen(current, dice);
        this._processPurple(current, ci, dice);

        // 役所：建設フェーズ開始時コイン0なら+1
        if (current.coins === 0 && current.hasYakusho) {
            current.coins += 1;
            this.addLog(LOG_TYPES.GAIN, `🏛️ 役所効果 → +1コイン`);
        }

        if (!this.pendingTV && !this.pendingBusiness &&
            !this.pendingCleaning && !this.pendingMover && !this.pendingRenovation) {
            this.phase = GAME_PHASES.BUILD;
        } else {
            this.phase = GAME_PHASES.PENDING;
        }
    }

    _processRed(current, ci, dice) {
        for (let i = 0; i < this.players.length; i++) {
            if (i === ci) continue;
            const other = this.players[i];
            const revivedCards = this._reviveDormantCardsForDice(other, dice, card => card.color === "red");
            for (const card of other.cards) {
                if (revivedCards.has(card)) continue;
                if (other.isDormant(card)) continue;
                if (card.color !== "red" || !card.diceNums.includes(dice)) continue;
                if (card.effect === CARD_EFFECTS.HARBOR_RED && !other.landmarks[LANDMARK_NAMES.HARBOR]) continue;

                if (card.effect === CARD_EFFECTS.FRENCHR) {
                    const built = current.builtLandmarkCount();
                    if (built < 2) continue;
                    const steal = Math.min(card.income, current.coins);
                    current.coins -= steal;
                    other.coins += steal;
                    this.addLog(LOG_TYPES.LOSE, `🍽️ ${other.name}の高級フレンチ発動 → ${steal}コイン獲得`);
                    continue;
                }

                if (card.effect === CARD_EFFECTS.MEMBERBAR) {
                    const built = current.builtLandmarkCount();
                    if (built < 3) continue;
                    const steal = current.coins;
                    current.coins = 0;
                    other.coins += steal;
                    this.addLog(LOG_TYPES.LOSE, `🍸 ${other.name}の会員制BAR発動 → ${steal}コイン全奪取`);
                    continue;
                }

                let amount = card.income;
                if (other.landmarks[LANDMARK_NAMES.SHOPPING_MALL] &&
                    (card.category === CARD_CATEGORIES.RESTAURANT || card.category === CARD_CATEGORIES.SHOP)) amount += 1;
                amount = Math.min(amount, current.coins);
                current.coins -= amount;
                other.coins += amount;
                this.addLog(LOG_TYPES.LOSE, `💸 ${other.name}の${card.name}発動 → ${amount}コイン獲得`);
            }
        }
    }

    _processBlue(dice, tunaDice) {
        for (const p of this.players) {
            const revivedCards = this._reviveDormantCardsForDice(p, dice, card => card.color === "blue");
            for (const card of p.cards) {
                if (revivedCards.has(card)) continue;
                if (p.isDormant(card)) continue;
                if (card.color !== "blue" || !card.diceNums.includes(dice)) continue;

                if (card.effect === CARD_EFFECTS.CORNFIELD) {
                    const built = p.builtLandmarkCount();
                    if (built > 1) continue;
                    p.coins += card.income;
                    this.addLog(LOG_TYPES.GAIN, `🌽 ${p.name}のコーン畑発動 → +${card.income}コイン`);
                    continue;
                }
                if (card.effect === CARD_EFFECTS.HARBOR) {
                    if (!p.landmarks[LANDMARK_NAMES.HARBOR]) continue;
                    p.coins += card.income;
                    this.addLog(LOG_TYPES.GAIN, `🐟 ${p.name}の${card.name}発動 → +${card.income}コイン`);
                } else if (card.effect === CARD_EFFECTS.TUNA) {
                    if (!p.landmarks[LANDMARK_NAMES.HARBOR]) continue;
                    const t1 = tunaDice ? tunaDice[0] : rollRandomDie();
                    const t2 = tunaDice ? tunaDice[1] : rollRandomDie();
                    const earn = t1 + t2;
                    p.coins += earn;
                    this.addLog(LOG_TYPES.GAIN, `🐟 ${p.name}のマグロ漁船発動 → 🎲${t1}+${t2}=${earn}コイン`);
                } else {
                    p.coins += card.income;
                    this.addLog(LOG_TYPES.GAIN, `🌾 ${p.name}の${card.name}発動 → +${card.income}コイン`);
                }
            }
        }
    }

    _processGreen(current, dice) {
        const revivedCards = this._reviveDormantCardsForDice(current, dice, card => card.color === "green");
        for (const card of current.cards) {
            if (revivedCards.has(card)) continue;
            if (current.isDormant(card)) continue;
            if (card.color !== "green" || !card.diceNums.includes(dice)) continue;

            // 副作用を持つカードは先に処理して continue
            if (card.effect === CARD_EFFECTS.WINERY) {
                const amount = GameManager.calcCardIncome(card, current, this);
                if (amount > 0) {
                    current.coins += amount;
                    this.addLog(LOG_TYPES.GAIN, `🍷 ワイナリー発動 → +${amount}コイン`);
                    current.makeDormant(card);
                    this.addLog(LOG_TYPES.SPECIAL, `💤 ワイナリーが休業`);
                }
                continue;
            }
            if (card.effect === CARD_EFFECTS.MOVER) {
                this.pendingMover++;
                this.addLog(LOG_TYPES.SPECIAL, `🚚 引越し屋発動 → 渡す施設を選んでください`);
                continue;
            }
            if (card.effect === CARD_EFFECTS.LOAN) continue;
            if (card.effect === CARD_EFFECTS.RENOVATION) {
                const builtLandmarks = Object.entries(current.landmarks)
                    .filter(([name, built]) => built && name !== LANDMARK_NAMES.YAKUSHO);
                if (builtLandmarks.length > 0) {
                    this.pendingRenovation++;
                    this.addLog(LOG_TYPES.SPECIAL, `🔨 改装屋発動 → 戻すランドマークを選んでください`);
                } else {
                    this.addLog(LOG_TYPES.SPECIAL, `🔨 改装屋：建設済みランドマークがないため不発`);
                }
                continue;
            }

            const amount = GameManager.calcCardIncome(card, current, this);
            if (amount > 0) {
                current.coins += amount;
                this.addLog(LOG_TYPES.GAIN, `🏪 ${card.name}発動 → +${amount}コイン`);
            }
        }

        // 貸金業：自分のターンに5か6が出たら枚数×2コイン支払い
        if (dice === 5 || dice === 6) {
            const loanCount = current.cards.filter(c =>
                c.effect === CARD_EFFECTS.LOAN &&
                !current.isDormant(c) &&
                !revivedCards.has(c)
            ).length;
            if (loanCount > 0) {
                const pay = Math.min(loanCount * 2, current.coins);
                current.coins -= pay;
                this.addLog(LOG_TYPES.LOSE, `💳 貸金業×${loanCount}：${pay}コイン支払い`);
            }
        }
    }

    _processPurple(current, ci, dice) {
        const revivedCards = this._reviveDormantCardsForDice(current, dice, card => card.color === "purple");
        for (const card of current.cards) {
            if (revivedCards.has(card)) continue;
            if (current.isDormant(card)) continue;
            if (card.color !== "purple" || !card.diceNums.includes(dice)) continue;

            if (card.effect === CARD_EFFECTS.STADIUM) {
                let total = 0;
                for (let i = 0; i < this.players.length; i++) {
                    if (i === ci) continue;
                    const steal = Math.min(2, this.players[i].coins);
                    this.players[i].coins -= steal;
                    total += steal;
                }
                current.coins += total;
                this.addLog(LOG_TYPES.SPECIAL, `🏟️ スタジアム発動 → +${total}コイン`);
            } else if (card.effect === CARD_EFFECTS.TV) {
                this.pendingTV++;
                this.addLog(LOG_TYPES.SPECIAL, `📺 テレビ局発動 → 対象プレイヤーを選んでください`);
            } else if (card.effect === CARD_EFFECTS.BUSINESS) {
                if (this._hasBusinessExchange(ci)) {
                    this.pendingBusiness++;
                    this.addLog(LOG_TYPES.SPECIAL, `🏢 ビジネスセンター発動 → 交換する施設を選んでください`);
                } else {
                    this.addLog(LOG_TYPES.SPECIAL, `🏢 ビジネスセンター：交換できる施設がないため不発`);
                }
            } else if (card.effect === CARD_EFFECTS.PUBLISHER) {
                let total = 0;
                for (let i = 0; i < this.players.length; i++) {
                    if (i === ci) continue;
                    const count = this.players[i].cards.filter(
                        c => (c.category === CARD_CATEGORIES.RESTAURANT || c.category === CARD_CATEGORIES.SHOP) && !this.players[i].isDormant(c)).length;
                    const steal = Math.min(count, this.players[i].coins);
                    this.players[i].coins -= steal;
                    total += steal;
                    if (steal > 0) this.addLog(LOG_TYPES.SPECIAL, `📰 ${this.players[i].name}から${steal}コイン`);
                }
                current.coins += total;
                this.addLog(LOG_TYPES.SPECIAL, `📰 出版社発動 → 合計+${total}コイン`);
            } else if (card.effect === CARD_EFFECTS.TAXOFFICE) {
                let total = 0;
                for (let i = 0; i < this.players.length; i++) {
                    if (i === ci) continue;
                    if (this.players[i].coins >= 10) {
                        const steal = Math.floor(this.players[i].coins / 2);
                        this.players[i].coins -= steal;
                        total += steal;
                        this.addLog(LOG_TYPES.SPECIAL, `🏛️ ${this.players[i].name}から${steal}コイン`);
                    }
                }
                current.coins += total;
                this.addLog(LOG_TYPES.SPECIAL, `🏛️ 税務署発動 → 合計+${total}コイン`);
            } else if (card.effect === CARD_EFFECTS.CLEANING) {
                if (this._hasCleaningTarget()) {
                    this.pendingCleaning++;
                    this.addLog(LOG_TYPES.SPECIAL, `🧹 清掃業発動 → 休業にする施設を選んでください`);
                } else {
                    this.addLog(LOG_TYPES.SPECIAL, `🧹 清掃業発動 → 休業にできる施設がありません`);
                }
            } else if (card.effect === CARD_EFFECTS.ITSTARTUP) {
                let total = 0;
                for (let i = 0; i < this.players.length; i++) {
                    if (i === ci) continue;
                    const steal = Math.min(current.itVentureCoins, this.players[i].coins);
                    this.players[i].coins -= steal;
                    total += steal;
                }
                current.coins += total;
                this.addLog(LOG_TYPES.SPECIAL, `💻 ITベンチャー発動 → 積立${current.itVentureCoins}コイン × ${this.players.length - 1}人 → +${total}コイン`);
            } else if (card.effect === CARD_EFFECTS.PARK) {
                const total = this.players.reduce((sum, p) => sum + p.coins, 0);
                const each = Math.floor(total / this.players.length);
                const remainder = total - each * this.players.length;
                for (const p of this.players) p.coins = each;
                current.coins += remainder;
                this.addLog(LOG_TYPES.SPECIAL, `🌳 公園発動 → 全員${each}コインに均等分配`);
            }
        }
    }

    resolveTV(targetIndex) {
        if (this.phase !== GAME_PHASES.PENDING || this.pendingTV <= 0) return false;
        const current = this.currentPlayer();
        const target = this.players[targetIndex];
        if (!target || target === current) {
            this.addLog(LOG_TYPES.ERROR, `❌ 対象プレイヤーを選び直してください`);
            return false;
        }
        const steal = Math.min(5, target.coins);
        target.coins -= steal;
        current.coins += steal;
        this.addLog(LOG_TYPES.SPECIAL, `📺 ${target.name}から${steal}コイン奪いました`);
        this.pendingTV--;
        this._checkPending();
        return true;
    }

    resolveBusiness(myCardRef, targetIndex, theirCardRef) {
        if (this.phase !== GAME_PHASES.PENDING || this.pendingBusiness <= 0) return false;
        const current = this.currentPlayer();
        const target = this.players[targetIndex];
        if (!target || target === current) { this.addLog(LOG_TYPES.ERROR, `❌ 交換相手を選び直してください`); return false; }
        const myCard = this._resolveCardRef(current, myCardRef);
        const theirCard = this._resolveCardRef(target, theirCardRef);
        if (!myCard || !theirCard) { this.addLog(LOG_TYPES.ERROR, `❌ 交換できない施設です`); return false; }
        const myCardWasDormant = current.isDormant(myCard);
        const theirCardWasDormant = target.isDormant(theirCard);
        current.revive(myCard);
        target.revive(theirCard);
        current.cards.splice(current.cards.indexOf(myCard), 1);
        target.cards.splice(target.cards.indexOf(theirCard), 1);
        current.cards.push(theirCard);
        target.cards.push(myCard);
        if (theirCardWasDormant) current.makeDormant(theirCard);
        if (myCardWasDormant) target.makeDormant(myCard);
        this.addLog(LOG_TYPES.SPECIAL, `🔄 ${myCard.name} ⇔ ${target.name}の${theirCard.name} を交換しました`);
        this.pendingBusiness--;
        this._checkPending();
        return true;
    }

    resolveCleaning(cardName) {
        if (this.phase !== GAME_PHASES.PENDING || this.pendingCleaning <= 0) return false;
        const targetCard = createCardByName(cardName);
        if (!targetCard || targetCard.category === CARD_CATEGORIES.MAJOR) return false;
        const current = this.currentPlayer();
        let count = 0;
        for (const p of this.players) {
            for (const card of p.cards) {
                if (card.name === cardName && card.category !== CARD_CATEGORIES.MAJOR && !p.isDormant(card)) {
                    p.makeDormant(card);
                    count++;
                }
            }
        }
        current.coins += count;
        this.addLog(LOG_TYPES.SPECIAL, `🧹 ${cardName}×${count}軒を休業 → +${count}コイン`);
        this.pendingCleaning--;
        this._checkPending();
        return true;
    }

    resolveMover(myCardRef, targetIndex) {
        if (this.phase !== GAME_PHASES.PENDING || this.pendingMover <= 0) return false;
        const current = this.currentPlayer();
        const target = this.players[targetIndex];
        if (!target || target === current) { this.addLog(LOG_TYPES.ERROR, `❌ 渡す相手を選び直してください`); return false; }
        const myCard = this._resolveCardRef(current, myCardRef);
        if (!myCard) { this.addLog(LOG_TYPES.ERROR, `❌ 渡せない施設です`); return false; }
        const myCardWasDormant = current.isDormant(myCard);
        current.revive(myCard);
        current.cards.splice(current.cards.indexOf(myCard), 1);
        target.cards.push(myCard);
        if (myCardWasDormant) target.makeDormant(myCard);
        current.coins += 4;
        this.addLog(LOG_TYPES.SPECIAL, `🚚 ${myCard.name}を${target.name}に渡して+4コイン`);
        this.pendingMover--;
        this._checkPending();
        return true;
    }

    resolveRenovation(landmarkName) {
        if (this.phase !== GAME_PHASES.PENDING || this.pendingRenovation <= 0) return false;
        const current = this.currentPlayer();
        if (!current.landmarks[landmarkName]) {
            this.addLog(LOG_TYPES.ERROR, `❌ そのランドマークは建設されていません`);
            return false;
        }
        current.landmarks[landmarkName] = false;
        current.coins += 8;
        this.addLog(LOG_TYPES.BUILD, `🔨 ${landmarkName}を取り壊して+8コイン`);
        this.pendingRenovation--;

        // 残りの改装屋発動回数があっても建設済みランドマークがなければスキップ
        while (this.pendingRenovation > 0) {
            const builtLandmarks = Object.entries(current.landmarks)
                .filter(([name, built]) => built && name !== LANDMARK_NAMES.YAKUSHO);
            if (builtLandmarks.length > 0) break;
            this.addLog(LOG_TYPES.SPECIAL, `🔨 改装屋：建設済みランドマークがないため不発`);
            this.pendingRenovation--;
        }

        this._checkPending();
        return true;
    }

    _checkPending() {
        if (this.pendingTV <= 0 && this.pendingBusiness <= 0 &&
            this.pendingCleaning <= 0 && this.pendingMover <= 0 &&
            this.pendingRenovation <= 0) {
            this.phase = GAME_PHASES.BUILD;
        }
    }

    // ITベンチャー：任意で1コイン消費して積立
    resolveIT(doSave) {
        if (this.phase !== GAME_PHASES.PENDING || !this.pendingIT) return false;
        const current = this.currentPlayer();
        if (doSave) {
            if (current.coins < 1) {
                this.addLog(LOG_TYPES.ERROR, `❌ コインが足りません`);
            } else {
                current.coins -= 1;
                current.itVentureCoins += 1;
                this.addLog(LOG_TYPES.SPECIAL, `💻 ITベンチャー積立 → 合計${current.itVentureCoins}コイン`);
            }
        } else {
            this.addLog(LOG_TYPES.SPECIAL, `💻 ITベンチャー積立スキップ`);
        }
        this.pendingIT = false;
        this._doNextTurn();
        return true;
    }

    buildCard(card) {
        if (this.phase !== GAME_PHASES.BUILD) { this.addLog(LOG_TYPES.ERROR, `❌ 今は建設できません`); return false; }
        if (this.builtThisTurn) { this.addLog(LOG_TYPES.ERROR, `❌ 建設は1ターンに1度だけです`); return false; }
        const current = this.currentPlayer();
        if (current.coins < card.cost) { this.addLog(LOG_TYPES.ERROR, `❌ コインが足りません`); return false; }
        if (card.color === "purple" && current.countCardIncludingDormant(card.name) > 0) {
            this.addLog(LOG_TYPES.ERROR, `❌ 大施設は1枚しか持てません`); return false;
        }
        current.coins -= card.cost;
        current.addCard(cloneCard(card));
        if (card.effect === CARD_EFFECTS.LOAN) {
            current.coins += 5;
            this.addLog(LOG_TYPES.BUILD, `💳 貸金業建設 → +5コイン（5か6が出たら-2コイン）`);
        }
        this.addLog(LOG_TYPES.BUILD, `🏗️ ${card.name}を建設！`);
        this.builtThisTurn = true;
        return true;
    }

    buildLandmark(name) {
        if (this.phase !== GAME_PHASES.BUILD) { this.addLog(LOG_TYPES.ERROR, `❌ 今は建設できません`); return false; }
        if (this.builtThisTurn) { this.addLog(LOG_TYPES.ERROR, `❌ 建設は1ターンに1度だけです`); return false; }
        const current = this.currentPlayer();
        const cost = Player.landmarkCost(name);
        if (!this.enabledLandmarks.has(name)) { this.addLog(LOG_TYPES.ERROR, `❌ このランドマークは今回使用しません`); return false; }
        if (current.coins < cost) { this.addLog(LOG_TYPES.ERROR, `❌ コインが足りません`); return false; }
        if (current.landmarks[name]) { this.addLog(LOG_TYPES.ERROR, `❌ すでに建設済みです`); return false; }
        current.coins -= cost;
        current.landmarks[name] = true;
        this.addLog(LOG_TYPES.BUILD, `🏆 ${name}を建設！`);
        this.builtThisTurn = true;
        return true;
    }

    nextTurn() {
        if (this.phase !== GAME_PHASES.BUILD) { this.addLog(LOG_TYPES.ERROR, `❌ 今はターン終了できません`); return false; }
        const current = this.currentPlayer();
        if (!this.builtThisTurn && current.landmarks[LANDMARK_NAMES.AIRPORT]) {
            current.coins += 10;
            this.addLog(LOG_TYPES.GAIN, `✈️ 空港効果！建設なしで+10コイン`);
        }
        // ITベンチャー：任意で積立
        const itCard = current.cards.find(c => c.effect === CARD_EFFECTS.ITSTARTUP && !current.isDormant(c));
        if (itCard) {
            this.pendingIT = true;
            this.phase = GAME_PHASES.PENDING;
            this.addLog(LOG_TYPES.SPECIAL, `💻 ITベンチャー：1コイン積立しますか？（現在${current.itVentureCoins}コイン積立中）`);
            return true;
        }
        this._doNextTurn();
        return true;
    }

    _doNextTurn() {
        if (this.hadAmusementParkAtRoll &&
            this.lastDice1 > 0 && this.lastDice1 === this.lastDice2) {
            this.phase = GAME_PHASES.ROLL;
            this.log = [];
            this.builtThisTurn = false;
            this.usedReroll = false;
            this.pendingTV = 0;
            this.pendingBusiness = 0;
            this.pendingCleaning = 0;
            this.pendingMover = 0;
            this.pendingIT = false;
            this.pendingRenovation = 0;
            this.hadAmusementParkAtRoll = false;
            this.addLog(LOG_TYPES.SYSTEM, `🎡 遊園地効果！ゾロ目でもう一度ターン`);
            return;
        }
        this.hadAmusementParkAtRoll = false;
        this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
        this.turnCount++;
        this.phase = GAME_PHASES.ROLL;
        this.lastDiceResult = 0;
        this.lastDice1 = 0;
        this.lastDice2 = 0;
        this.log = [];
        this.builtThisTurn = false;
        this.usedReroll = false;
        this.pendingTV = 0;
        this.pendingBusiness = 0;
        this.pendingCleaning = 0;
        this.pendingMover = 0;
        this.pendingIT = false;
        this.pendingRenovation = 0;

        this.addLog(LOG_TYPES.SYSTEM, `👤 ${this.currentPlayer().name}のターン`);
    }

    checkWinner() { return this.players.find(p => p.hasWon([...this.enabledLandmarks])) || null; }
    addLog(type, msg) { this.log.push({ type, message: msg }); }
}
