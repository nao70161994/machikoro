const LOG_TYPES = Object.freeze({
    DICE:    "dice",
    GAIN:    "gain",
    LOSE:    "lose",
    BUILD:   "build",
    SPECIAL: "special",
    SYSTEM:  "system",
    ERROR:   "error",
});

const GAME_PHASES = GameActionContract.phases;
const GAME_ACTIONS = GameActionContract.actions;
const GAME_PHASE_ACTIONS = GameActionContract.phaseActions;

const PENDING_ACTION_CONTRACT = PendingActionQueue.createContract(GAME_ACTIONS);
const PENDING_ACTION_SPECS = PENDING_ACTION_CONTRACT.specs;

const PENDING_IT_QUEUE_POLICY = Object.freeze({
    field: 'pendingIT',
    action: GAME_ACTIONS.RESOLVE_IT,
    queued: false,
    reason: 'ITベンチャーはターン終了時の任意確認で、他の同時pending効果と混在しないためqueue外の優先special caseとして扱う',
});

const PENDING_ACTION_SPEC_BY_FIELD = PENDING_ACTION_CONTRACT.byField;
const PENDING_ACTION_SPEC_BY_ACTION = PENDING_ACTION_CONTRACT.byAction;

const GAME_ACTION_REGISTRY = GameActionContract.registry;

const NEXT_TURN_REJECTION_MESSAGES = Object.freeze({
    [GameTurnPolicy.nextTurnRejectionReasons.WRONG_PHASE]: '❌ 今はターン終了できません',
    [GameTurnPolicy.nextTurnRejectionReasons.WINNER_DECIDED]: '❌ 勝敗決定後はターン終了できません',
});

const BUILD_REJECTION_MESSAGES = Object.freeze({
    [GameBuildPolicy.reasons.WRONG_PHASE]: '❌ 今は建設できません',
    [GameBuildPolicy.reasons.ALREADY_BUILT]: '❌ 建設は1ターンに1度だけです',
    [GameBuildPolicy.reasons.INVALID_CARD]: '❌ 不正なカードです',
    [GameBuildPolicy.reasons.INSUFFICIENT_COINS]: '❌ コインが足りません',
    [GameBuildPolicy.reasons.DUPLICATE_MAJOR]: '❌ 大施設は1枚しか持てません',
    [GameBuildPolicy.reasons.UNKNOWN_LANDMARK]: '❌ 不正なランドマークです',
    [GameBuildPolicy.reasons.DISABLED_LANDMARK]: '❌ このランドマークは今回使用しません',
    [GameBuildPolicy.reasons.LANDMARK_ALREADY_BUILT]: '❌ すでに建設済みです',
});

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

const CARD_INCOME_HANDLER_IMPLS = Object.freeze({
    cheese: (card, owner) =>
        owner.countCardById(CARD_IDS.RANCH) * card.income,
    furniture: (card, owner) =>
        (owner.countCardById(CARD_IDS.FOREST) + owner.countCardById(CARD_IDS.MINE)) * card.income,
    market: (card, owner) =>
        owner.cards.filter(c => c.category === CARD_CATEGORIES.FARM && !owner.isDormant(c)).length * card.income,
    flower: (card, owner) =>
        owner.countCardById(CARD_IDS.FLOWER_GARDEN) * card.income,
    foodwarehouse: (card, owner) =>
        owner.cards.filter(c => c.category === CARD_CATEGORIES.RESTAURANT && !owner.isDormant(c)).length * card.income,
    fewlandmark: (card, owner) =>
        owner.builtLandmarkCount() <= 1 ? card.income : 0,
    cornfield: (card, owner) =>
        owner.builtLandmarkCount() <= 1 ? card.income : 0,
    winery: (card, owner) =>
        owner.countCardById(CARD_IDS.VINEYARD) * card.income,
    drinkfactory: (card, owner, game) =>
        game.players.reduce((sum, p) =>
            sum + p.cards.filter(c => c.category === CARD_CATEGORIES.RESTAURANT && !p.isDormant(c)).length, 0) * card.income,
});

const CARD_INCOME_EFFECT_HANDLERS = Object.freeze(Object.fromEntries(
    Object.entries(CARD_EFFECT_METADATA)
        .filter(([, metadata]) => metadata.incomeHandler && CARD_INCOME_HANDLER_IMPLS[metadata.incomeHandler])
        .map(([effect, metadata]) => [effect, CARD_INCOME_HANDLER_IMPLS[metadata.incomeHandler]])
));

class GameManager {
    constructor(playerCount) {
        this.players = [];
        this.currentPlayerIndex = 0;
        this.lastDiceResult = 0;
        this.lastDice1 = 0;
        this.lastDice2 = 0;
        /** @type {(typeof GAME_PHASES)[keyof typeof GAME_PHASES]} */
        this.phase = GAME_PHASES.ROLL;
        this.log = [];
        this.builtThisTurn = false;
        this.resetPendingState();
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

    resetPendingState() {
        this.pendingTV = 0;
        this.pendingBusiness = 0;
        this.pendingCleaning = 0;
        this.pendingMover = 0;
        this.pendingRenovation = 0;
        this.pendingIT = false;
        this.pendingActionQueue = [];
    }

    resetTurnState(options = {}) {
        if (options.clearLog) this.log = [];
        if (options.clearDice) {
            this.lastDiceResult = 0;
            this.lastDice1 = 0;
            this.lastDice2 = 0;
            this.pendingTunaDice = null;
        }
        this.builtThisTurn = false;
        this.usedReroll = false;
        this.resetPendingState();
        this.hadAmusementParkAtRoll = false;
    }

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

    static _pendingDescriptorsFromFields(game) {
        return PendingActionQueue.descriptorsFromFields(game, PENDING_ACTION_CONTRACT);
    }

    static _pendingQueueEntriesFromFields(game) {
        return PendingActionQueue.entriesFromFields(game, PENDING_ACTION_CONTRACT);
    }

    static _normalizePendingActionQueue(game) {
        return PendingActionQueue.normalize(game, PENDING_ACTION_CONTRACT);
    }

    static _groupPendingQueue(queue) {
        return PendingActionQueue.group(queue);
    }

    static ensurePendingActionQueue(game) {
        return PendingActionQueue.ensure(game, PENDING_ACTION_CONTRACT);
    }


    // Returns pending action descriptors in the order they should be resolved.
    static pendingActionsFor(game) {
        if (!game || game.phase !== GAME_PHASES.PENDING) return [];
        if (game.pendingIT) {
            return [{ action: PENDING_IT_QUEUE_POLICY.action, field: PENDING_IT_QUEUE_POLICY.field, count: 1 }];
        }
        const queue = GameManager.ensurePendingActionQueue(game);
        if (queue.length > 0) return GameManager._groupPendingQueue(queue);
        return [];
    }

    pendingActions() {
        return GameManager.pendingActionsFor(this);
    }

    static nextPendingActionFor(game) {
        return GameManager.pendingActionsFor(game)[0] || null;
    }

    static canResolvePendingField(game, field) {
        if (!game || !field) return false;
        const next = GameManager.nextPendingActionFor(game);
        return !!next && next.field === field;
    }

    static serializedPendingActionsFor(game) {
        return PendingActionQueue.serialize(game, PENDING_ACTION_CONTRACT);
    }

    rebuildPendingActionsFromFields() {
        this.pendingActionQueue = GameManager.serializedPendingActionsFor(this);
    }

    _applyPendingActionTransition(plan) {
        if (!plan || plan.ok !== true) return false;
        this[plan.field] = plan.value;
        this.pendingActionQueue = plan.queue.map(entry =>
            entry && typeof entry === 'object'
                ? { action: entry.action, field: entry.field }
                : entry
        );
        return true;
    }

    _enqueuePendingAction(field) {
        return this._applyPendingActionTransition(
            PendingActionQueue.planEnqueue(this, PENDING_ACTION_CONTRACT, field)
        );
    }

    _consumePendingAction(field) {
        const canResolve = GameManager.canResolvePendingField(this, field);
        return this._applyPendingActionTransition(
            PendingActionQueue.planConsume(this, PENDING_ACTION_CONTRACT, field, canResolve)
        );
    }

    clearPendingField(field) {
        const applied = this._applyPendingActionTransition(
            PendingActionQueue.planClear(this, PENDING_ACTION_CONTRACT, field)
        );
        if (!applied) return false;
        this._checkPending();
        return true;
    }

    // Returns action names allowed by phase/pending state only. Payload legality is validated separately.
    static allowedActionsFor(game) {
        if (!game) return new Set();
        if (typeof game.checkWinner === 'function' && game.checkWinner()) return new Set();
        const pendingActions = GameManager.pendingActionsFor(game);
        if (game.phase === GAME_PHASES.PENDING) {
            return new Set(pendingActions[0] ? [pendingActions[0].action] : []);
        }
        return new Set(GAME_PHASE_ACTIONS[game.phase] || []);
    }

    allowedActions() {
        return GameManager.allowedActionsFor(this);
    }

    _applyDiceOutcome(plan) {
        this.lastDice1 = plan.lastDice1;
        this.lastDice2 = plan.lastDice2;
        this.lastDiceResult = plan.lastDiceResult;
        this.hadAmusementParkAtRoll = plan.hadAmusementParkAtRoll;
    }

    rollDice(forceDice = null, tunaDice = null) {
        const start = GameDicePolicy.planRollStart({
            phase: this.phase,
            rollPhase: GAME_PHASES.ROLL,
            hasStation: () => this.currentPlayer().landmarks[LANDMARK_NAMES.STATION],
        });
        if (!start.ok) return;
        if (start.decision === GameDicePolicy.rollStartDecisions.SELECT_DICE) {
            this.phase = GAME_PHASES.SELECT_DICE;
            this.pendingTunaDice = tunaDice;
            this.addLog(LOG_TYPES.DICE, `🚉 駅：1個か2個か選んでください`);
            return;
        }
        const d1 = forceDice !== null ? forceDice : rollRandomDie();
        this._applyDiceOutcome(GameDicePolicy.planDiceOutcome({
            useTwo: false,
            dice1: d1,
            hasAmusementPark: () => this.currentPlayer().landmarks[LANDMARK_NAMES.AMUSEMENT_PARK],
        }));
        this.addLog(LOG_TYPES.DICE, `🎲 ${d1} が出ました`);
        this.afterRoll(tunaDice);
    }

    selectDiceCount(useTwo, forceDice1 = null, forceDice2 = null, tunaDice = null) {
        const selection = GameDicePolicy.planDiceSelection({
            phase: this.phase,
            selectDicePhase: GAME_PHASES.SELECT_DICE,
            useTwo,
        });
        if (!selection.ok) return;
        const d1 = forceDice1 !== null ? forceDice1 : rollRandomDie();
        const d2 = selection.useTwo
            ? (forceDice2 !== null ? forceDice2 : rollRandomDie())
            : 0;
        this._applyDiceOutcome(GameDicePolicy.planDiceOutcome({
            useTwo: selection.useTwo,
            dice1: d1,
            dice2: d2,
            hasAmusementPark: () => this.currentPlayer().landmarks[LANDMARK_NAMES.AMUSEMENT_PARK],
        }));
        this.addLog(LOG_TYPES.DICE, selection.useTwo
            ? `🎲 ${d1}+${d2}=${this.lastDiceResult}`
            : `🎲 ${d1} が出ました`);
        this.afterRoll(tunaDice || this.pendingTunaDice);
    }

    afterRoll(tunaDice = null) {
        const plan = GameDicePolicy.planAfterRoll({
            hasRadioTower: () => this.currentPlayer().landmarks[LANDMARK_NAMES.RADIO_TOWER],
            usedReroll: () => this.usedReroll,
        });
        if (plan.requestReroll) {
            this.phase = GAME_PHASES.REROLL_CONFIRM;
            this.pendingTunaDice = tunaDice;
            return;
        }
        this.applyHarborOrIncome(tunaDice);
    }

    rerollDice(forceDice = null, tunaDice = null) {
        const admission = GameDicePolicy.planRerollAdmission({
            phase: this.phase,
            rerollPhase: GAME_PHASES.REROLL_CONFIRM,
        });
        if (!admission.ok) return;
        const prevDice1 = this.lastDice1;
        const prevDice2 = this.lastDice2;
        const prevResult = this.lastDiceResult;
        this.usedReroll = true;
        this.lastDiceResult = 0;
        this.lastDice1 = 0;
        this.lastDice2 = 0;
        this.log = [];
        /** @type {(typeof GAME_PHASES)[keyof typeof GAME_PHASES]} */
        this.phase = GAME_PHASES.ROLL;
        this.rollDice(forceDice, tunaDice);
        this.addLog(
            LOG_TYPES.DICE,
            `📡 電波塔で振り直し: ${GameDicePolicy.formatDiceOutcome(prevDice1, prevDice2, prevResult)} → ${GameDicePolicy.formatDiceOutcome(this.lastDice1, this.lastDice2, this.lastDiceResult)}`
        );
    }

    skipReroll() {
        const admission = GameDicePolicy.planRerollAdmission({
            phase: this.phase,
            rerollPhase: GAME_PHASES.REROLL_CONFIRM,
        });
        if (!admission.ok) return;
        this.applyHarborOrIncome(this.pendingTunaDice);
    }

    applyHarborOrIncome(tunaDice = null) {
        const plan = GameDicePolicy.planHarborOrIncome({
            lastDice1: this.lastDice1,
            lastDice2: this.lastDice2,
            hasHarbor: () => this.currentPlayer().landmarks[LANDMARK_NAMES.HARBOR],
            lastDiceResult: () => this.lastDiceResult,
        });
        if (plan.requestHarborChoice) {
            this.phase = GAME_PHASES.HARBOR_CHOICE;
            this.pendingTunaDice = tunaDice;
            this.addLog(LOG_TYPES.DICE, `⚓ 港効果：合計${this.lastDiceResult}に+2しますか？`);
            return;
        }
        this.processIncome(tunaDice);
    }

    resolveHarbor(useBonus, tunaDice = null) {
        const plan = GameDicePolicy.planHarborResolution({
            phase: this.phase,
            harborPhase: GAME_PHASES.HARBOR_CHOICE,
            useBonus,
            lastDiceResult: () => this.lastDiceResult,
        });
        if (!plan.ok) return false;
        this.lastDiceResult = plan.diceResult;
        this.addLog(LOG_TYPES.DICE, plan.useBonus
            ? `⚓ 港効果+2 → ${this.lastDiceResult}`
            : `→ そのまま ${this.lastDiceResult} を使用`);
        this.processIncome(tunaDice || this.pendingTunaDice);
        return true;
    }

    // 緑カードの収入額を計算する共有メソッド。
    // _processGreen・CPU._cardActivationValue・CPU.evalCard が参照することで
    // ゲームロジックと CPU 予測の乖離を防ぐ。
    // 副作用（pendingMover++ など）を持つカードは含まない。
    static cardActivationProfile(card) {
        return getCardActivationProfile(card);
    }

    static calcCardIncome(card, owner, game) {
        const handler = CARD_INCOME_EFFECT_HANDLERS[card.effect];
        if (handler) return handler(card, owner, game);

        let amount = card.income;
        if (owner.landmarks[LANDMARK_NAMES.SHOPPING_MALL] &&
            isCardInCategoryGroup(card, CARD_CATEGORY_GROUPS.RESTAURANT_OR_SHOP)) amount += 1;
        return amount;
    }

    _reviveDormantCardsForDice(player, dice, shouldRevive) {
        const revived = new Set();
        const eligible = GameCardActivationPolicy.eligibleDormantCards(
            player.dormantCards,
            dice,
            shouldRevive
        );
        for (const card of eligible) {
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

        this.phase = GameTurnPolicy.phaseAfterIncome(this, GAME_PHASES);
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
                    isCardInCategoryGroup(card, CARD_CATEGORY_GROUPS.RESTAURANT_OR_SHOP)) amount += 1;
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
                this._enqueuePendingAction('pendingMover');
                this.addLog(LOG_TYPES.SPECIAL, `🚚 引越し屋発動 → 渡す施設を選んでください`);
                continue;
            }
            if (card.effect === CARD_EFFECTS.LOAN) continue;
            if (card.effect === CARD_EFFECTS.RENOVATION) {
                const builtLandmarks = Object.entries(current.landmarks)
                    .filter(([name, built]) => built && name !== LANDMARK_NAMES.YAKUSHO);
                if (builtLandmarks.length > 0) {
                    this._enqueuePendingAction('pendingRenovation');
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
                this._enqueuePendingAction('pendingTV');
                this.addLog(LOG_TYPES.SPECIAL, `📺 テレビ局発動 → 対象プレイヤーを選んでください`);
            } else if (card.effect === CARD_EFFECTS.BUSINESS) {
                if (this._hasBusinessExchange(ci)) {
                    this._enqueuePendingAction('pendingBusiness');
                    this.addLog(LOG_TYPES.SPECIAL, `🏢 ビジネスセンター発動 → 交換する施設を選んでください`);
                } else {
                    this.addLog(LOG_TYPES.SPECIAL, `🏢 ビジネスセンター：交換できる施設がないため不発`);
                }
            } else if (card.effect === CARD_EFFECTS.PUBLISHER) {
                let total = 0;
                for (let i = 0; i < this.players.length; i++) {
                    if (i === ci) continue;
                    const count = this.players[i].cards.filter(
                        c => isCardInCategoryGroup(c, CARD_CATEGORY_GROUPS.RESTAURANT_OR_SHOP) && !this.players[i].isDormant(c)).length;
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
                    this._enqueuePendingAction('pendingCleaning');
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
        if (!GameManager.canResolvePendingField(this, 'pendingTV')) return false;
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
        this._consumePendingAction('pendingTV');
        this._checkPending();
        return true;
    }

    resolveBusiness(myCardRef, targetIndex, theirCardRef) {
        if (this.phase !== GAME_PHASES.PENDING || this.pendingBusiness <= 0) return false;
        if (!GameManager.canResolvePendingField(this, 'pendingBusiness')) return false;
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
        this._consumePendingAction('pendingBusiness');
        this._checkPending();
        return true;
    }

    resolveCleaning(cardName) {
        if (this.phase !== GAME_PHASES.PENDING || this.pendingCleaning <= 0) return false;
        if (!GameManager.canResolvePendingField(this, 'pendingCleaning')) return false;
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
        if (count <= 0) return false;
        current.coins += count;
        this.addLog(LOG_TYPES.SPECIAL, `🧹 ${cardName}×${count}軒を休業 → +${count}コイン`);
        this._consumePendingAction('pendingCleaning');
        this._checkPending();
        return true;
    }

    resolveMover(myCardRef, targetIndex) {
        if (this.phase !== GAME_PHASES.PENDING || this.pendingMover <= 0) return false;
        if (!GameManager.canResolvePendingField(this, 'pendingMover')) return false;
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
        this._consumePendingAction('pendingMover');
        this._checkPending();
        return true;
    }

    resolveRenovation(landmarkName) {
        if (this.phase !== GAME_PHASES.PENDING || this.pendingRenovation <= 0) return false;
        if (!GameManager.canResolvePendingField(this, 'pendingRenovation')) return false;
        const current = this.currentPlayer();
        if (!current.landmarks[landmarkName]) {
            this.addLog(LOG_TYPES.ERROR, `❌ そのランドマークは建設されていません`);
            return false;
        }
        current.landmarks[landmarkName] = false;
        current.coins += 8;
        this.addLog(LOG_TYPES.BUILD, `🔨 ${landmarkName}を取り壊して+8コイン`);
        this._consumePendingAction('pendingRenovation');

        // 残りの改装屋発動回数があっても建設済みランドマークがなければスキップ
        while (this.pendingRenovation > 0) {
            if (!GameManager.canResolvePendingField(this, 'pendingRenovation')) break;
            const builtLandmarks = Object.entries(current.landmarks)
                .filter(([name, built]) => built && name !== LANDMARK_NAMES.YAKUSHO);
            if (builtLandmarks.length > 0) break;
            this.addLog(LOG_TYPES.SPECIAL, `🔨 改装屋：建設済みランドマークがないため不発`);
            if (!this._consumePendingAction('pendingRenovation')) break;
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
        let current;
        const plan = GameTurnPolicy.planItResolution({
            phase: this.phase,
            pendingPhase: GAME_PHASES.PENDING,
            pendingIt: this.pendingIT,
            doSave,
            coins: () => {
                current = this.currentPlayer();
                return current.coins;
            },
        });
        if (!plan.ok) return false;
        if (!current) current = this.currentPlayer();
        current.coins += plan.coinDelta;
        current.itVentureCoins += plan.ventureDelta;
        if (plan.outcome === GameTurnPolicy.itResolutionOutcomes.SAVED) {
            this.addLog(LOG_TYPES.SPECIAL, `💻 ITベンチャー積立 → 合計${current.itVentureCoins}コイン`);
        } else if (plan.outcome === GameTurnPolicy.itResolutionOutcomes.INSUFFICIENT_COINS) {
            this.addLog(LOG_TYPES.ERROR, `❌ コインが足りません`);
        } else {
            this.addLog(LOG_TYPES.SPECIAL, `💻 ITベンチャー積立スキップ`);
        }
        this.pendingIT = false;
        this._doNextTurn();
        return true;
    }

    buildCard(card) {
        let current;
        const plan = GameBuildPolicy.planCardBuild({
            phase: this.phase,
            buildPhase: GAME_PHASES.BUILD,
            builtThisTurn: this.builtThisTurn,
            cardValid: !!card && !!card.name,
            coins: () => {
                current = this.currentPlayer();
                return current.coins;
            },
            cost: card && card.cost,
            isMajor: !!card && card.color === "purple",
            ownsMajor: () => {
                const cardId = card.id || CARD_ID_BY_NAME[card.name];
                return current.countCardIncludingDormantById(cardId) > 0;
            },
        });
        if (!plan.ok) {
            this.addLog(LOG_TYPES.ERROR, BUILD_REJECTION_MESSAGES[plan.reason]);
            return false;
        }
        const buildPlayer = /** @type {Player} */ (current);
        buildPlayer.coins -= card.cost;
        buildPlayer.addCard(cloneCard(card));
        if (card.effect === CARD_EFFECTS.LOAN) {
            buildPlayer.coins += 5;
            this.addLog(LOG_TYPES.BUILD, `💳 貸金業建設 → +5コイン（5か6が出たら-2コイン）`);
        }
        this.addLog(LOG_TYPES.BUILD, `🏗️ ${card.name}を建設！`);
        this.builtThisTurn = true;
        return true;
    }

    buildLandmark(name) {
        let current;
        let cost;
        const plan = GameBuildPolicy.planLandmarkBuild({
            phase: this.phase,
            buildPhase: GAME_PHASES.BUILD,
            builtThisTurn: this.builtThisTurn,
            cost: () => {
                current = this.currentPlayer();
                cost = Player.landmarkCost(name);
                return cost;
            },
            knownLandmark: () => Player.isKnownLandmark(name),
            enabledLandmark: () => this.enabledLandmarks.has(name),
            coins: () => current.coins,
            landmarkBuilt: () => !!current.landmarks[name],
        });
        if (!plan.ok) {
            this.addLog(LOG_TYPES.ERROR, BUILD_REJECTION_MESSAGES[plan.reason]);
            return false;
        }
        const buildPlayer = /** @type {Player} */ (current);
        const buildCost = /** @type {number} */ (cost);
        buildPlayer.coins -= buildCost;
        buildPlayer.landmarks[name] = true;
        this.addLog(LOG_TYPES.BUILD, `🏆 ${name}を建設！`);
        this.builtThisTurn = true;
        return true;
    }

    nextTurn() {
        const admission = GameTurnPolicy.planNextTurnAdmission({
            phase: this.phase,
            buildPhase: GAME_PHASES.BUILD,
            hasWinner: () => !!this.checkWinner(),
        });
        if (!admission.ok) {
            this.addLog(LOG_TYPES.ERROR, NEXT_TURN_REJECTION_MESSAGES[admission.reason]);
            return false;
        }
        const current = this.currentPlayer();
        if (GameTurnPolicy.shouldAwardAirportBonus({
            builtThisTurn: this.builtThisTurn,
            hasAirport: !!current.landmarks[LANDMARK_NAMES.AIRPORT],
        })) {
            current.coins += 10;
            this.addLog(LOG_TYPES.GAIN, `✈️ 空港効果！建設なしで+10コイン`);
        }
        // ITベンチャー：任意で積立
        const itCard = current.cards.find(c => c.effect === CARD_EFFECTS.ITSTARTUP && !current.isDormant(c));
        const continuation = GameTurnPolicy.planNextTurnContinuation({ hasActiveItStartup: !!itCard });
        if (continuation.startPendingIt) {
            this.pendingIT = true;
            this.phase = GAME_PHASES.PENDING;
            this.addLog(LOG_TYPES.SPECIAL, `💻 ITベンチャー：1コイン積立しますか？（現在${current.itVentureCoins}コイン積立中）`);
            return true;
        }
        this._doNextTurn();
        return true;
    }

    _doNextTurn() {
        if (GameTurnPolicy.shouldRepeatAmusementParkTurn(this)) {
        /** @type {(typeof GAME_PHASES)[keyof typeof GAME_PHASES]} */
            this.phase = GAME_PHASES.ROLL;
            this.resetTurnState({ clearLog: true });
            this.addLog(LOG_TYPES.SYSTEM, `🎡 遊園地効果！ゾロ目でもう一度ターン`);
            return;
        }
        this.currentPlayerIndex = GameTurnPolicy.nextPlayerIndex(
            this.currentPlayerIndex,
            this.players.length
        );
        this.turnCount++;
        /** @type {(typeof GAME_PHASES)[keyof typeof GAME_PHASES]} */
        this.phase = GAME_PHASES.ROLL;
        this.resetTurnState({ clearLog: true, clearDice: true });

        this.addLog(LOG_TYPES.SYSTEM, `👤 ${this.currentPlayer().name}のターン`);
    }

    checkWinner() { return this.players.find(p => p.hasWon([...this.enabledLandmarks])) || null; }
    addLog(type, msg) { this.log.push({ type, message: msg }); }
}
