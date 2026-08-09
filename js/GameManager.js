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

function applyCoinTransactionPlan(players, plan) {
    for (let index = 0; index < players.length; index++) {
        players[index].coins = plan.balances[index];
    }
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

const CARD_INCOME_HANDLER_IMPLS = Object.freeze({
    cheese: (card, owner) =>
        owner.countCardIncludingDormantById(CARD_IDS.RANCH) * card.income,
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
        const state = GameTurnPolicy.pendingResetState();
        this.pendingTV = state.pendingTV;
        this.pendingBusiness = state.pendingBusiness;
        this.pendingCleaning = state.pendingCleaning;
        this.pendingMover = state.pendingMover;
        this.pendingRenovation = state.pendingRenovation;
        this.pendingIT = state.pendingIT;
        this.pendingActionQueue = state.pendingActionQueue.slice();
    }

    resetTurnState(options = {}) {
        const plan = GameTurnPolicy.turnResetPlan(options);
        if (plan.clearLog) this.log = [];
        if (plan.clearDice) {
            this.lastDiceResult = plan.lastDiceResult;
            this.lastDice1 = plan.lastDice1;
            this.lastDice2 = plan.lastDice2;
            this.pendingTunaDice = plan.pendingTunaDice;
        }
        this.builtThisTurn = plan.builtThisTurn;
        this.usedReroll = plan.usedReroll;
        this.pendingTV = plan.pending.pendingTV;
        this.pendingBusiness = plan.pending.pendingBusiness;
        this.pendingCleaning = plan.pending.pendingCleaning;
        this.pendingMover = plan.pending.pendingMover;
        this.pendingRenovation = plan.pending.pendingRenovation;
        this.pendingIT = plan.pending.pendingIT;
        this.pendingActionQueue = plan.pending.pendingActionQueue.slice();
        this.hadAmusementParkAtRoll = plan.hadAmusementParkAtRoll;
    }

    _resolveCardRef(player, ref) {
        return GamePendingResolutionPolicy.resolveMinorCardRef({
            cards: () => player && player.cards,
            ref,
            isMajor: card => card.category === CARD_CATEGORIES.MAJOR,
        });
    }

    _hasBusinessExchange(currentPlayerIndex) {
        return GamePendingResolutionPolicy.hasBusinessExchange({
            players: this.players,
            currentPlayerIndex,
            minorCardsFor: player => player.getMinorCards(),
        });
    }

    _hasCleaningTarget() {
        return GamePendingResolutionPolicy.hasCleaningTarget({
            players: this.players,
            cardsFor: player => player.cards,
            isMajor: card => card.category === CARD_CATEGORIES.MAJOR,
            isDormant: (player, card) => player.isDormant(card),
        });
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
        const reset = GameDicePolicy.rerollResetState(GAME_PHASES.ROLL);
        this.usedReroll = reset.usedReroll;
        this.lastDiceResult = reset.lastDiceResult;
        this.lastDice1 = reset.lastDice1;
        this.lastDice2 = reset.lastDice2;
        this.log = reset.log.slice();
        /** @type {(typeof GAME_PHASES)[keyof typeof GAME_PHASES]} */
        this.phase = reset.phase;
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

        const completion = GameTurnPolicy.incomeCompletionPlan({
            coins: current.coins,
            hasCityHall: current.hasYakusho,
            pendingState: this,
            phases: GAME_PHASES,
        });
        // 役所：建設フェーズ開始時コイン0なら+1
        if (completion.cityHallCoinDelta > 0) {
            current.coins += completion.cityHallCoinDelta;
            this.addLog(LOG_TYPES.GAIN, `🏛️ 役所効果 → +1コイン`);
        }
        this.phase = completion.phase;
    }

    _processRed(current, ci, dice) {
        for (let i = 0; i < this.players.length; i++) {
            if (i === ci) continue;
            const other = this.players[i];
            const revivedCards = this._reviveDormantCardsForDice(other, dice, card => card.color === "red");
            const activations = [];
            for (const card of other.cards) {
                if (!GameCardActivationPolicy.isActivationCandidate({
                    card,
                    revivedCards,
                    isDormant: candidate => other.isDormant(candidate),
                    color: "red",
                    dice,
                })) continue;
                const activation = GameCardActivationPolicy.redActivationPlan({
                    effect: card.effect,
                    effects: CARD_EFFECTS,
                    income: card.income,
                    hasHarbor: !!other.landmarks[LANDMARK_NAMES.HARBOR],
                    hasShoppingMall: !!other.landmarks[LANDMARK_NAMES.SHOPPING_MALL],
                    currentLandmarkCount: () => current.builtLandmarkCount(),
                    currentCoins: () => current.coins,
                    isRestaurantOrShop: () => isCardInCategoryGroup(
                        card,
                        CARD_CATEGORY_GROUPS.RESTAURANT_OR_SHOP
                    ),
                });
                if (!activation.active) continue;
                activations.push({
                    card,
                    kind: activation.kind,
                    requested: activation.requested,
                });
            }

            const plan = GameCoinTransaction.sequentialCollectionPlan(
                current.coins,
                activations.map(activation => activation.requested)
            );
            current.coins = plan.remaining;
            other.coins += plan.total;
            activations.forEach((activation, index) => {
                const transfer = plan.transfers[index];
                if (activation.kind === 'french') {
                    this.addLog(LOG_TYPES.LOSE, `🍽️ ${other.name}の高級フレンチ発動 → ${transfer}コイン獲得`);
                } else if (activation.kind === 'member-bar') {
                    this.addLog(LOG_TYPES.LOSE, `🍸 ${other.name}の会員制BAR発動 → ${transfer}コイン全奪取`);
                } else {
                    this.addLog(LOG_TYPES.LOSE, `💸 ${other.name}の${activation.card.name}発動 → ${transfer}コイン獲得`);
                }
            });
        }
    }

    _processBlue(dice, tunaDice) {
        for (const p of this.players) {
            const revivedCards = this._reviveDormantCardsForDice(p, dice, card => card.color === "blue");
            for (const card of p.cards) {
                if (!GameCardActivationPolicy.isActivationCandidate({
                    card,
                    revivedCards,
                    isDormant: candidate => p.isDormant(candidate),
                    color: "blue",
                    dice,
                })) continue;

                const plan = GameCardActivationPolicy.blueIncomePlan({
                    effect: card.effect,
                    effects: CARD_EFFECTS,
                    income: card.income,
                    builtLandmarkCount: () => p.builtLandmarkCount(),
                    hasHarbor: !!p.landmarks[LANDMARK_NAMES.HARBOR],
                    tunaDice: () => tunaDice || [rollRandomDie(), rollRandomDie()],
                });
                if (!plan.active) continue;
                p.coins += plan.amount;
                if (plan.kind === GameCardActivationPolicy.blueIncomeKinds.CORNFIELD) {
                    this.addLog(LOG_TYPES.GAIN, `🌽 ${p.name}のコーン畑発動 → +${plan.amount}コイン`);
                } else if (plan.kind === GameCardActivationPolicy.blueIncomeKinds.HARBOR) {
                    this.addLog(LOG_TYPES.GAIN, `🐟 ${p.name}の${card.name}発動 → +${plan.amount}コイン`);
                } else if (plan.kind === GameCardActivationPolicy.blueIncomeKinds.TUNA) {
                    this.addLog(LOG_TYPES.GAIN, `🐟 ${p.name}のマグロ漁船発動 → 🎲${plan.dice[0]}+${plan.dice[1]}=${plan.amount}コイン`);
                } else {
                    this.addLog(LOG_TYPES.GAIN, `🌾 ${p.name}の${card.name}発動 → +${plan.amount}コイン`);
                }
            }
        }
    }

    _processGreen(current, dice) {
        const revivedCards = this._reviveDormantCardsForDice(current, dice, card => card.color === "green");
        for (const card of current.cards) {
            if (!GameCardActivationPolicy.isActivationCandidate({
                card,
                revivedCards,
                isDormant: candidate => current.isDormant(candidate),
                color: "green",
                dice,
            })) continue;

            const plan = GameCardActivationPolicy.greenActivationPlan({
                effect: card.effect,
                effects: CARD_EFFECTS,
                income: () => GameManager.calcCardIncome(card, current, this),
                hasRenovationTarget: () => GamePendingResolutionPolicy.hasRenovationTarget({
                    landmarks: current.landmarks,
                    excludedLandmark: LANDMARK_NAMES.YAKUSHO,
                }),
            });
            if (plan.kind === GameCardActivationPolicy.greenActivationKinds.WINERY) {
                if (plan.amount > 0) {
                    current.coins += plan.amount;
                    this.addLog(LOG_TYPES.GAIN, `🍷 ワイナリー発動 → +${plan.amount}コイン`);
                    if (plan.shouldDormant) current.makeDormant(card);
                    this.addLog(LOG_TYPES.SPECIAL, `💤 ワイナリーが休業`);
                }
                continue;
            }
            if (plan.kind === GameCardActivationPolicy.greenActivationKinds.MOVER) {
                this._enqueuePendingAction(plan.pendingField);
                this.addLog(LOG_TYPES.SPECIAL, `🚚 引越し屋発動 → 渡す施設を選んでください`);
                continue;
            }
            if (plan.kind === GameCardActivationPolicy.greenActivationKinds.LOAN) continue;
            if (plan.kind === GameCardActivationPolicy.greenActivationKinds.RENOVATION) {
                if (plan.hasTarget) {
                    this._enqueuePendingAction(plan.pendingField);
                    this.addLog(LOG_TYPES.SPECIAL, `🔨 改装屋発動 → 戻すランドマークを選んでください`);
                } else {
                    this.addLog(LOG_TYPES.SPECIAL, `🔨 改装屋：建設済みランドマークがないため不発`);
                }
                continue;
            }
            if (plan.amount > 0) {
                current.coins += plan.amount;
                this.addLog(LOG_TYPES.GAIN, `💰 ${card.name}発動 → +${plan.amount}コイン`);
            }
        }

        // 貸金業：自分のターンに5か6が出たら枚数×2コイン支払い
        const loanRepayment = GameCardActivationPolicy.loanRepaymentPlan({
            dice,
            loanCount: () => current.cards.filter(c =>
                c.effect === CARD_EFFECTS.LOAN &&
                !current.isDormant(c) &&
                !revivedCards.has(c)
            ).length,
            coins: current.coins,
        });
        if (loanRepayment.active) {
            current.coins -= loanRepayment.amount;
            this.addLog(LOG_TYPES.LOSE, `💳 貸金業×${loanRepayment.loanCount}：${loanRepayment.amount}コイン支払い`);
        }
    }

    _processPurple(current, ci, dice) {
        const revivedCards = this._reviveDormantCardsForDice(current, dice, card => card.color === "purple");
        for (const card of current.cards) {
            if (!GameCardActivationPolicy.isActivationCandidate({
                card,
                revivedCards,
                isDormant: candidate => current.isDormant(candidate),
                color: "purple",
                dice,
            })) continue;

            const activation = GameCardActivationPolicy.purpleActivationPlan({
                effect: card.effect,
                effects: CARD_EFFECTS,
                hasBusinessExchange: () => this._hasBusinessExchange(ci),
                hasCleaningTarget: () => this._hasCleaningTarget(),
            });
            if (activation.kind === GameCardActivationPolicy.purpleActivationKinds.STADIUM) {
                const plan = GameCoinTransaction.collectionPlan(
                    this.players.map(player => player.coins),
                    ci,
                    GameCardActivationPolicy.fixedCollectionRequests(this.players.length, ci, 2)
                );
                applyCoinTransactionPlan(this.players, plan);
                this.addLog(LOG_TYPES.SPECIAL, `🏟️ スタジアム発動 → +${plan.total}コイン`);
            } else if (activation.kind === GameCardActivationPolicy.purpleActivationKinds.TV) {
                this._enqueuePendingAction(activation.pendingField);
                this.addLog(LOG_TYPES.SPECIAL, `📺 テレビ局発動 → 対象プレイヤーを選んでください`);
            } else if (activation.kind === GameCardActivationPolicy.purpleActivationKinds.BUSINESS) {
                if (activation.hasTarget) {
                    this._enqueuePendingAction(activation.pendingField);
                    this.addLog(LOG_TYPES.SPECIAL, `🏢 ビジネスセンター発動 → 交換する施設を選んでください`);
                } else {
                    this.addLog(LOG_TYPES.SPECIAL, `🏢 ビジネスセンター：交換できる施設がないため不発`);
                }
            } else if (activation.kind === GameCardActivationPolicy.purpleActivationKinds.PUBLISHER) {
                const requestedAmounts = GameCardActivationPolicy.publisherCollectionRequests(
                    this.players,
                    ci,
                    player => player.cards.filter(c =>
                        isCardInCategoryGroup(c, CARD_CATEGORY_GROUPS.RESTAURANT_OR_SHOP) &&
                        !player.isDormant(c)
                    ).length
                );
                const plan = GameCoinTransaction.collectionPlan(
                    this.players.map(player => player.coins),
                    ci,
                    requestedAmounts
                );
                applyCoinTransactionPlan(this.players, plan);
                plan.transfers.forEach((transfer, index) => {
                    if (transfer > 0) this.addLog(LOG_TYPES.SPECIAL, `📰 ${this.players[index].name}から${transfer}コイン`);
                });
                this.addLog(LOG_TYPES.SPECIAL, `📰 出版社発動 → 合計+${plan.total}コイン`);
            } else if (activation.kind === GameCardActivationPolicy.purpleActivationKinds.TAXOFFICE) {
                const requestedAmounts = GameCardActivationPolicy.taxOfficeCollectionRequests(
                    this.players.map(player => player.coins),
                    ci
                );
                const plan = GameCoinTransaction.collectionPlan(
                    this.players.map(player => player.coins),
                    ci,
                    requestedAmounts
                );
                applyCoinTransactionPlan(this.players, plan);
                plan.transfers.forEach((transfer, index) => {
                    if (transfer > 0) this.addLog(LOG_TYPES.SPECIAL, `🏛️ ${this.players[index].name}から${transfer}コイン`);
                });
                this.addLog(LOG_TYPES.SPECIAL, `🏛️ 税務署発動 → 合計+${plan.total}コイン`);
            } else if (activation.kind === GameCardActivationPolicy.purpleActivationKinds.CLEANING) {
                if (activation.hasTarget) {
                    this._enqueuePendingAction(activation.pendingField);
                    this.addLog(LOG_TYPES.SPECIAL, `🧹 清掃業発動 → 休業にする施設を選んでください`);
                } else {
                    this.addLog(LOG_TYPES.SPECIAL, `🧹 清掃業発動 → 休業にできる施設がありません`);
                }
            } else if (activation.kind === GameCardActivationPolicy.purpleActivationKinds.ITSTARTUP) {
                const plan = GameCoinTransaction.collectionPlan(
                    this.players.map(player => player.coins),
                    ci,
                    GameCardActivationPolicy.fixedCollectionRequests(
                        this.players.length,
                        ci,
                        current.itVentureCoins
                    )
                );
                applyCoinTransactionPlan(this.players, plan);
                this.addLog(LOG_TYPES.SPECIAL, `💻 ITベンチャー発動 → 積立${current.itVentureCoins}コイン × ${this.players.length - 1}人 → +${plan.total}コイン`);
            } else if (activation.kind === GameCardActivationPolicy.purpleActivationKinds.PARK) {
                const plan = GameCoinTransaction.equalDistributionPlan(
                    this.players.map(player => player.coins),
                    ci
                );
                applyCoinTransactionPlan(this.players, plan);
                this.addLog(LOG_TYPES.SPECIAL, `🌳 公園発動 → 全員${plan.each}コインに均等分配`);
            }
        }
    }

    resolveTV(targetIndex) {
        /** @type {Player | undefined} */
        let current;
        /** @type {Player | undefined} */
        let target;
        const plan = GamePendingResolutionPolicy.planOtherPlayerTarget({
            phase: this.phase,
            pendingPhase: GAME_PHASES.PENDING,
            pendingCount: this.pendingTV,
            canResolve: () => GameManager.canResolvePendingField(this, 'pendingTV'),
            targetExists: () => {
                current = this.currentPlayer();
                target = this.players[targetIndex];
                return !!target;
            },
            targetIsCurrent: () => target === current,
        });
        if (!plan.ok) {
            if (plan.reason === GamePendingResolutionPolicy.reasons.INVALID_PLAYER_TARGET) {
                this.addLog(LOG_TYPES.ERROR, `❌ 対象プレイヤーを選び直してください`);
            }
            return false;
        }
        if (!current || !target) return false;
        const transition = GamePendingTransition.tvTransferPlan(current.coins, target.coins);
        target.coins = transition.targetCoins;
        current.coins = transition.actorCoins;
        this.addLog(LOG_TYPES.SPECIAL, `📺 ${target.name}から${transition.transfer}コイン奪いました`);
        this._consumePendingAction('pendingTV');
        this._checkPending();
        return true;
    }

    resolveBusiness(myCardRef, targetIndex, theirCardRef) {
        /** @type {Player | undefined} */
        let current;
        /** @type {Player | undefined} */
        let target;
        const plan = GamePendingResolutionPolicy.planOtherPlayerTarget({
            phase: this.phase,
            pendingPhase: GAME_PHASES.PENDING,
            pendingCount: this.pendingBusiness,
            canResolve: () => GameManager.canResolvePendingField(this, 'pendingBusiness'),
            targetExists: () => {
                current = this.currentPlayer();
                target = this.players[targetIndex];
                return !!target;
            },
            targetIsCurrent: () => target === current,
        });
        if (!plan.ok) {
            if (plan.reason === GamePendingResolutionPolicy.reasons.INVALID_PLAYER_TARGET) {
                this.addLog(LOG_TYPES.ERROR, `❌ 交換相手を選び直してください`);
            }
            return false;
        }
        if (!current || !target) return false;
        const myCard = this._resolveCardRef(current, myCardRef);
        const theirCard = this._resolveCardRef(target, theirCardRef);
        if (!myCard || !theirCard) { this.addLog(LOG_TYPES.ERROR, `❌ 交換できない施設です`); return false; }
        const exchange = GamePendingTransition.businessExchangePlan(
            current.cards,
            target.cards,
            myCard,
            theirCard,
            { actor: current.isDormant(myCard), target: target.isDormant(theirCard) }
        );
        if (!exchange) { this.addLog(LOG_TYPES.ERROR, `❌ 交換できない施設です`); return false; }
        current.revive(exchange.actorCard);
        target.revive(exchange.targetCard);
        current.cards.splice(exchange.actorCardIndex, 1);
        target.cards.splice(exchange.targetCardIndex, 1);
        current.cards.push(exchange.targetCard);
        target.cards.push(exchange.actorCard);
        if (exchange.actorReceivesDormant) current.makeDormant(exchange.targetCard);
        if (exchange.targetReceivesDormant) target.makeDormant(exchange.actorCard);
        this.addLog(LOG_TYPES.SPECIAL, `🔄 ${myCard.name} ⇔ ${target.name}の${theirCard.name} を交換しました`);
        this._consumePendingAction('pendingBusiness');
        this._checkPending();
        return true;
    }

    resolveCleaning(cardName) {
        let targetCard;
        const plan = GamePendingResolutionPolicy.planCleaningTarget({
            phase: this.phase,
            pendingPhase: GAME_PHASES.PENDING,
            pendingCount: this.pendingCleaning,
            canResolve: () => GameManager.canResolvePendingField(this, 'pendingCleaning'),
            cardExists: () => {
                targetCard = createCardByName(cardName);
                return !!targetCard;
            },
            cardIsMajor: () => targetCard.category === CARD_CATEGORIES.MAJOR,
        });
        if (!plan.ok) return false;
        const current = this.currentPlayer();
        const cleaning = GamePendingTransition.cleaningPlan(
            this.players,
            cardName,
            CARD_CATEGORIES.MAJOR,
            (player, card) => player.isDormant(card)
        );
        for (const target of cleaning.targets) {
            this.players[target.playerIndex].makeDormant(target.card);
        }
        if (cleaning.reward <= 0) return false;
        current.coins += cleaning.reward;
        this.addLog(LOG_TYPES.SPECIAL, `🧹 ${cardName}×${cleaning.reward}軒を休業 → +${cleaning.reward}コイン`);
        this._consumePendingAction('pendingCleaning');
        this._checkPending();
        return true;
    }

    resolveMover(myCardRef, targetIndex) {
        /** @type {Player | undefined} */
        let current;
        /** @type {Player | undefined} */
        let target;
        const plan = GamePendingResolutionPolicy.planOtherPlayerTarget({
            phase: this.phase,
            pendingPhase: GAME_PHASES.PENDING,
            pendingCount: this.pendingMover,
            canResolve: () => GameManager.canResolvePendingField(this, 'pendingMover'),
            targetExists: () => {
                current = this.currentPlayer();
                target = this.players[targetIndex];
                return !!target;
            },
            targetIsCurrent: () => target === current,
        });
        if (!plan.ok) {
            if (plan.reason === GamePendingResolutionPolicy.reasons.INVALID_PLAYER_TARGET) {
                this.addLog(LOG_TYPES.ERROR, `❌ 渡す相手を選び直してください`);
            }
            return false;
        }
        if (!current || !target) return false;
        const myCard = this._resolveCardRef(current, myCardRef);
        if (!myCard) { this.addLog(LOG_TYPES.ERROR, `❌ 渡せない施設です`); return false; }
        const transition = GamePendingTransition.moverPlan(
            current.coins,
            current.cards,
            myCard,
            current.isDormant(myCard)
        );
        if (!transition) { this.addLog(LOG_TYPES.ERROR, `❌ 渡せない施設です`); return false; }
        current.revive(transition.card);
        current.cards.splice(transition.cardIndex, 1);
        target.cards.push(transition.card);
        if (transition.dormant) target.makeDormant(transition.card);
        current.coins = transition.actorCoins;
        this.addLog(LOG_TYPES.SPECIAL, `🚚 ${myCard.name}を${target.name}に渡して+4コイン`);
        this._consumePendingAction('pendingMover');
        this._checkPending();
        return true;
    }

    resolveRenovation(landmarkName) {
        /** @type {Player | undefined} */
        let current;
        const plan = GamePendingResolutionPolicy.planRenovationTarget({
            phase: this.phase,
            pendingPhase: GAME_PHASES.PENDING,
            pendingCount: this.pendingRenovation,
            canResolve: () => GameManager.canResolvePendingField(this, 'pendingRenovation'),
            landmarkBuilt: () => {
                current = this.currentPlayer();
                return !!current.landmarks[landmarkName];
            },
        });
        if (!plan.ok) {
            if (plan.reason === GamePendingResolutionPolicy.reasons.LANDMARK_NOT_BUILT) {
                this.addLog(LOG_TYPES.ERROR, `❌ そのランドマークは建設されていません`);
            }
            return false;
        }
        if (!current) return false;
        const transition = GamePendingTransition.renovationPlan(current.coins, current.landmarks, landmarkName);
        if (!transition) return false;
        current.landmarks[transition.landmarkName] = false;
        current.coins = transition.actorCoins;
        this.addLog(LOG_TYPES.BUILD, `🔨 ${landmarkName}を取り壊して+8コイン`);
        this._consumePendingAction('pendingRenovation');

        // 残りの改装屋発動回数があっても建設済みランドマークがなければスキップ
        while (this.pendingRenovation > 0) {
            if (!GameManager.canResolvePendingField(this, 'pendingRenovation')) break;
            if (GamePendingResolutionPolicy.hasRenovationTarget({
                landmarks: current.landmarks,
                excludedLandmark: LANDMARK_NAMES.YAKUSHO,
            })) break;
            this.addLog(LOG_TYPES.SPECIAL, `🔨 改装屋：建設済みランドマークがないため不発`);
            if (!this._consumePendingAction('pendingRenovation')) break;
        }

        this._checkPending();
        return true;
    }

    _checkPending() {
        const transition = GamePendingResolutionPolicy.completionTransition(this, GAME_PHASES.BUILD);
        if (transition.completed) this.phase = transition.nextPhase;
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
        const transition = GameBuildPolicy.cardBuildTransition(
            card.cost,
            card.effect === CARD_EFFECTS.LOAN ? 5 : 0
        );
        buildPlayer.coins += transition.purchaseCoinDelta;
        buildPlayer.addCard(cloneCard(card));
        if (transition.loanCoinDelta > 0) {
            buildPlayer.coins += transition.loanCoinDelta;
            this.addLog(LOG_TYPES.BUILD, `💳 貸金業建設 → +5コイン（5か6が出たら-2コイン）`);
        }
        this.addLog(LOG_TYPES.BUILD, `🏗️ ${card.name}を建設！`);
        this.builtThisTurn = transition.builtThisTurn;
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
        const transition = GameBuildPolicy.landmarkBuildTransition(name, buildCost);
        buildPlayer.coins += transition.coinDelta;
        buildPlayer.landmarks[transition.landmarkName] = true;
        this.addLog(LOG_TYPES.BUILD, `🏆 ${name}を建設！`);
        this.builtThisTurn = transition.builtThisTurn;
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
        const airportPlan = GameTurnPolicy.planNextTurnAirport({
            builtThisTurn: this.builtThisTurn,
            hasAirport: !!current.landmarks[LANDMARK_NAMES.AIRPORT],
        });
        if (airportPlan.award) {
            current.coins += airportPlan.coinDelta;
            this.addLog(LOG_TYPES.GAIN, `✈️ 空港効果！建設なしで+10コイン`);
        }
        // ITベンチャー：任意で積立
        const hasActiveItStartup = GameTurnPolicy.hasActiveCardEffect(
            current.cards,
            CARD_EFFECTS.ITSTARTUP,
            card => current.isDormant(card)
        );
        const continuation = GameTurnPolicy.planNextTurnContinuation({ hasActiveItStartup });
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
        const plan = GameTurnPolicy.turnAdvancePlan({
            hadAmusementParkAtRoll: this.hadAmusementParkAtRoll,
            lastDice1: this.lastDice1,
            lastDice2: this.lastDice2,
            currentPlayerIndex: this.currentPlayerIndex,
            playerCount: this.players.length,
            rollPhase: GAME_PHASES.ROLL,
        });
        this.currentPlayerIndex = plan.playerIndex;
        this.turnCount += plan.turnCountDelta;
        /** @type {(typeof GAME_PHASES)[keyof typeof GAME_PHASES]} */
        this.phase = plan.phase;
        this.resetTurnState(plan.resetOptions);
        if (plan.kind === GameTurnPolicy.turnAdvanceKinds.REPEAT) {
            this.addLog(LOG_TYPES.SYSTEM, `🎡 遊園地効果！ゾロ目でもう一度ターン`);
            return;
        }
        this.addLog(LOG_TYPES.SYSTEM, `👤 ${this.currentPlayer().name}のターン`);
    }

    checkWinner() {
        const index = GameTurnPolicy.winnerIndex(this.players, this.enabledLandmarks);
        return index >= 0 ? this.players[index] : null;
    }
    addLog(type, msg) { this.log.push({ type, message: msg }); }
}
