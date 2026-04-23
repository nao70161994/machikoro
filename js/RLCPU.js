class RLCPU {
    constructor(modelData) {
        if (!modelData || !modelData.layers) {
            throw new Error("RLCPU requires exported model data");
        }
        this.model = modelData;
        this.stateDim = modelData.stateDim;
        this.numActions = modelData.numActions;
        this.hiddenSize = modelData.hiddenSize;
        this.numCards = modelData.numCards;
        this.numTargetSlots = modelData.numTargetSlots || 0;
        this._validateModel();
    }

    static get PHASE_ORDER() {
        return [
            GAME_PHASES.ROLL,
            GAME_PHASES.SELECT_DICE,
            GAME_PHASES.REROLL_CONFIRM,
            GAME_PHASES.HARBOR_CHOICE,
            GAME_PHASES.PENDING,
            GAME_PHASES.BUILD,
        ];
    }

    static get LANDMARK_ORDER() {
        return [
            LANDMARK_NAMES.STATION,
            LANDMARK_NAMES.SHOPPING_MALL,
            LANDMARK_NAMES.AMUSEMENT_PARK,
            LANDMARK_NAMES.RADIO_TOWER,
            LANDMARK_NAMES.HARBOR,
            LANDMARK_NAMES.AIRPORT,
        ];
    }

    static get ACTIONS() {
        return Object.freeze({
            ROLL1: 0,
            ROLL2: 1,
            KEEP: 2,
            REROLL: 3,
            HARBOR_YES: 4,
            HARBOR_NO: 5,
            IT_SAVE: 6,
            IT_SKIP: 7,
            TV_TARGET: 8,
            BC_BASE: 9,
            BC_SIZE: CARDS.length * CARDS.length,
            CLEAN_BASE: 9 + CARDS.length * CARDS.length,
            MOVER_BASE: 9 + CARDS.length * CARDS.length + CARDS.length,
            RENO_BASE: 9 + CARDS.length * CARDS.length + CARDS.length + CARDS.length,
            BUY_CARD_BASE: 9 + CARDS.length * CARDS.length + CARDS.length + CARDS.length + RLCPU.LANDMARK_ORDER.length,
            BUY_LM_BASE: 9 + CARDS.length * CARDS.length + CARDS.length + CARDS.length + RLCPU.LANDMARK_ORDER.length + CARDS.length,
            PASS: 9 + CARDS.length * CARDS.length + CARDS.length + CARDS.length + RLCPU.LANDMARK_ORDER.length + CARDS.length + RLCPU.LANDMARK_ORDER.length,
        });
    }

    static get NUM_ACTIONS() {
        return RLCPU.ACTIONS.PASS + 1;
    }

    static fromGlobal(modelData = globalThis.RL_MODEL_DATA) {
        return new RLCPU(modelData);
    }

    _validateModel() {
        const shared = this.model.layers.shared || [];
        if (shared.length !== 2) {
            throw new Error("RLCPU expects 2 shared layers");
        }
        this._validateLayer(shared[0], this.stateDim, this.hiddenSize, "shared[0]");
        this._validateLayer(shared[1], this.hiddenSize, this.hiddenSize, "shared[1]");
        this._validateLayer(this.model.layers.policyHead, this.hiddenSize, this.numActions, "policyHead");
        this._validateLayer(this.model.layers.valueHead, this.hiddenSize, 1, "valueHead");
        this._validateLayer(this.model.layers.businessGiveHead, this.hiddenSize, this.numCards, "businessGiveHead");
        this._validateLayer(this.model.layers.businessTakeHead, this.hiddenSize, this.numCards, "businessTakeHead");
        this._validateOptionalTargetLayer(this.model.layers.tvTargetHead, "tvTargetHead");
        this._validateOptionalTargetLayer(this.model.layers.businessTargetHead, "businessTargetHead");
        this._validateOptionalTargetLayer(this.model.layers.moverTargetHead, "moverTargetHead");
    }

    _validateLayer(layer, input, output, label) {
        if (!layer || !Array.isArray(layer.weights) || !Array.isArray(layer.bias)) {
            throw new Error(`RLCPU invalid layer: ${label}`);
        }
        if (layer.weights.length !== input) {
            throw new Error(`RLCPU layer input mismatch: ${label}`);
        }
        if (layer.bias.length !== output) {
            throw new Error(`RLCPU layer output mismatch: ${label}`);
        }
        for (const row of layer.weights) {
            if (!Array.isArray(row) || row.length !== output) {
                throw new Error(`RLCPU layer shape mismatch: ${label}`);
            }
        }
    }

    _validateOptionalTargetLayer(layer, label) {
        if (!layer) return;
        this._validateLayer(layer, this.hiddenSize, this.numTargetSlots, label);
    }

    _matVec(layer, input) {
        const out = new Array(layer.bias.length);
        for (let j = 0; j < layer.bias.length; j++) {
            let sum = layer.bias[j];
            for (let i = 0; i < input.length; i++) {
                sum += input[i] * layer.weights[i][j];
            }
            out[j] = sum;
        }
        return out;
    }

    _relu(values) {
        return values.map(value => value > 0 ? value : 0);
    }

    _softmax(values) {
        let max = -Infinity;
        for (const value of values) {
            if (value > max) max = value;
        }
        const exps = values.map(value => Math.exp(value - max));
        const total = exps.reduce((sum, value) => sum + value, 0) || 1;
        return exps.map(value => value / total);
    }

    _tanh(value) {
        if (typeof Math.tanh === "function") return Math.tanh(value);
        const e2x = Math.exp(value * 2);
        return (e2x - 1) / (e2x + 1);
    }

    _sharedForward(state) {
        if (!Array.isArray(state) || state.length !== this.stateDim) {
            throw new Error(`RLCPU expected state length ${this.stateDim}`);
        }
        let hidden = state.slice();
        for (const layer of this.model.layers.shared) {
            hidden = this._relu(this._matVec(layer, hidden));
        }
        return hidden;
    }

    forward(state) {
        const hidden = this._sharedForward(state);
        const policyLogits = this._matVec(this.model.layers.policyHead, hidden);
        const valueRaw = this._matVec(this.model.layers.valueHead, hidden);
        return {
            policy: this._softmax(policyLogits),
            value: this._tanh(valueRaw[0]),
        };
    }

    forwardBusiness(state) {
        const hidden = this._sharedForward(state);
        const giveLogits = this._matVec(this.model.layers.businessGiveHead, hidden);
        const takeLogits = this._matVec(this.model.layers.businessTakeHead, hidden);
        const valueRaw = this._matVec(this.model.layers.valueHead, hidden);
        return {
            give: this._softmax(giveLogits),
            take: this._softmax(takeLogits),
            value: this._tanh(valueRaw[0]),
        };
    }

    forwardTarget(state, kind) {
        const layer = this._targetLayerForKind(kind);
        if (!layer) {
            throw new Error(`RLCPU target head unavailable: ${kind}`);
        }
        const hidden = this._sharedForward(state);
        const targetLogits = this._matVec(layer, hidden);
        const valueRaw = this._matVec(this.model.layers.valueHead, hidden);
        return {
            target: this._softmax(targetLogits),
            value: this._tanh(valueRaw[0]),
        };
    }

    maskPolicy(policy, mask) {
        if (!Array.isArray(policy) || !Array.isArray(mask) || policy.length !== mask.length) {
            throw new Error("RLCPU maskPolicy requires same-length arrays");
        }
        const masked = new Array(policy.length);
        let total = 0;
        for (let i = 0; i < policy.length; i++) {
            masked[i] = mask[i] > 0 ? policy[i] : 0;
            total += masked[i];
        }
        if (total <= 0) return masked.fill(0);
        for (let i = 0; i < masked.length; i++) {
            masked[i] /= total;
        }
        return masked;
    }

    _argmaxMaskedLogits(logits, mask) {
        let bestAction = -1;
        let bestScore = -Infinity;
        for (let i = 0; i < logits.length; i++) {
            if (!(mask[i] > 0)) continue;
            if (bestAction < 0 || logits[i] > bestScore) {
                bestAction = i;
                bestScore = logits[i];
            }
        }
        return bestAction;
    }

    _targetLayerForKind(kind) {
        if (kind === 'tv') return this.model.layers.tvTargetHead || null;
        if (kind === 'business') return this.model.layers.businessTargetHead || null;
        if (kind === 'mover') return this.model.layers.moverTargetHead || null;
        return null;
    }

    chooseAction(state, mask) {
        const hidden = this._sharedForward(state);
        const policyLogits = this._matVec(this.model.layers.policyHead, hidden);
        const policy = this._softmax(policyLogits);
        const valueRaw = this._matVec(this.model.layers.valueHead, hidden);
        const value = this._tanh(valueRaw[0]);
        const masked = this.maskPolicy(policy, mask);
        const total = masked.reduce((sum, score) => sum + score, 0);
        if (total <= 0) {
            const fallbackAction = this._argmaxMaskedLogits(policyLogits, mask);
            return { action: fallbackAction, confidence: fallbackAction >= 0 ? 1 : 0, value };
        }
        let bestAction = -1;
        let bestScore = -1;
        for (let i = 0; i < masked.length; i++) {
            if (masked[i] > bestScore) {
                bestScore = masked[i];
                bestAction = i;
            }
        }
        return { action: bestAction, confidence: bestScore, value };
    }

    chooseBusinessAction(state, mask) {
        const actionConstants = RLCPU.ACTIONS;
        const hidden = this._sharedForward(state);
        const giveLogits = this._matVec(this.model.layers.businessGiveHead, hidden);
        const takeLogits = this._matVec(this.model.layers.businessTakeHead, hidden);
        const give = this._softmax(giveLogits);
        const take = this._softmax(takeLogits);
        const valueRaw = this._matVec(this.model.layers.valueHead, hidden);
        const value = this._tanh(valueRaw[0]);
        const jointMask = mask.slice(actionConstants.BC_BASE, actionConstants.BC_BASE + actionConstants.BC_SIZE);
        const giveMask = new Array(this.numCards).fill(0);
        const takeMask = new Array(this.numCards).fill(0);
        for (let giveIndex = 0; giveIndex < this.numCards; giveIndex++) {
            for (let takeIndex = 0; takeIndex < this.numCards; takeIndex++) {
                const jointIndex = giveIndex * this.numCards + takeIndex;
                if (jointMask[jointIndex] > 0) {
                    giveMask[giveIndex] = 1;
                    takeMask[takeIndex] = 1;
                }
            }
        }
        const maskedGive = this.maskPolicy(give, giveMask);
        const maskedTake = this.maskPolicy(take, takeMask);
        const giveTotal = maskedGive.reduce((sum, score) => sum + score, 0);
        const takeTotal = maskedTake.reduce((sum, score) => sum + score, 0);
        if (giveTotal <= 0 || takeTotal <= 0) {
            const fallbackAction = this._argmaxMaskedLogits(mask.map((enabled, index) => enabled > 0 ? (giveLogits[Math.floor((index - actionConstants.BC_BASE) / this.numCards)] + takeLogits[(index - actionConstants.BC_BASE) % this.numCards]) : -Infinity), mask);
            return { action: fallbackAction, confidence: fallbackAction >= 0 ? 1 : 0, value };
        }
        let bestAction = -1;
        let bestScore = -1;
        for (let giveIndex = 0; giveIndex < this.numCards; giveIndex++) {
            for (let takeIndex = 0; takeIndex < this.numCards; takeIndex++) {
                const action = actionConstants.BC_BASE + giveIndex * this.numCards + takeIndex;
                if (!mask[action]) continue;
                const score = maskedGive[giveIndex] * maskedTake[takeIndex];
                if (score > bestScore) {
                    bestScore = score;
                    bestAction = action;
                }
            }
        }
        return { action: bestAction, confidence: bestScore, value };
    }

    _currentAndOpponent(game) {
        if (!game || !game.players || game.players.length < 2) {
            throw new Error("RLCPU requires at least 2 players");
        }
        const current = game.currentPlayer();
        const opponentIndex = this._selectOpponentIndex(game);
        const opponent = game.players[opponentIndex];
        return { current, opponent, opponentIndex };
    }

    _targetSlotsForGame(game) {
        const slots = [];
        for (let index = 0; index < game.players.length; index++) {
            if (index === game.currentPlayerIndex) continue;
            slots.push({
                playerIndex: index,
                player: game.players[index],
                score: this._playerThreatScore(game.players[index]),
            });
        }
        slots.sort((a, b) => b.score - a.score);
        return slots;
    }

    _targetMask(game, kind) {
        const slots = this._targetSlotsForGame(game);
        const mask = new Array(this.numTargetSlots).fill(0);
        for (let slotIndex = 0; slotIndex < Math.min(slots.length, this.numTargetSlots); slotIndex++) {
            const player = slots[slotIndex].player;
            if (kind === 'tv') {
                if ((player.coins || 0) > 0) mask[slotIndex] = 1;
                continue;
            }
            if (kind === 'business') {
                if (player.getMinorCards().length > 0) mask[slotIndex] = 1;
                continue;
            }
            if (kind === 'mover') {
                mask[slotIndex] = 1;
            }
        }
        return { mask, slots };
    }

    _businessActionMaskForTarget(game, targetIndex) {
        const mask = new Array(RLCPU.NUM_ACTIONS).fill(0);
        const current = game.currentPlayer();
        const target = game.players[targetIndex];
        if (!current || !target) {
            mask[RLCPU.ACTIONS.PASS] = 1;
            return mask;
        }
        const myCounts = this._cardCounts(current, false);
        const theirCounts = this._cardCounts(target, false);
        for (let giveIndex = 0; giveIndex < CARDS.length; giveIndex++) {
            const giveCard = CARDS[giveIndex];
            if ((myCounts[giveCard.name] || 0) <= 0 || giveCard.color === "purple") continue;
            for (let takeIndex = 0; takeIndex < CARDS.length; takeIndex++) {
                const takeCard = CARDS[takeIndex];
                if ((theirCounts[takeCard.name] || 0) <= 0 || takeCard.color === "purple") continue;
                mask[RLCPU.ACTIONS.BC_BASE + giveIndex * CARDS.length + takeIndex] = 1;
            }
        }
        if (!mask.some(Boolean)) {
            mask[RLCPU.ACTIONS.PASS] = 1;
        }
        return mask;
    }

    _selectTargetIndex(game, kind) {
        const layer = this._targetLayerForKind(kind);
        if (!layer || this.numTargetSlots <= 0) {
            return this._selectOpponentIndex(game);
        }
        const { mask, slots } = this._targetMask(game, kind);
        if (!mask.some(Boolean)) {
            return this._selectOpponentIndex(game);
        }
        const state = this.encodeGameState(game);
        const hidden = this._sharedForward(state);
        const logits = this._matVec(layer, hidden);
        const probs = this.maskPolicy(this._softmax(logits), mask);
        let bestSlot = -1;
        let bestScore = -1;
        for (let slotIndex = 0; slotIndex < probs.length; slotIndex++) {
            if (probs[slotIndex] > bestScore) {
                bestScore = probs[slotIndex];
                bestSlot = slotIndex;
            }
        }
        if (bestSlot < 0 || !slots[bestSlot]) {
            return this._selectOpponentIndex(game);
        }
        return slots[bestSlot].playerIndex;
    }

    _selectOpponentIndex(game) {
        let bestIndex = -1;
        let bestScore = -Infinity;
        for (let index = 0; index < game.players.length; index++) {
            if (index === game.currentPlayerIndex) continue;
            const score = this._playerThreatScore(game.players[index]);
            if (bestIndex < 0 || score > bestScore) {
                bestIndex = index;
                bestScore = score;
            }
        }
        return bestIndex >= 0 ? bestIndex : 0;
    }

    _playerThreatScore(player) {
        let score = player.coins || 0;
        for (const name of RLCPU.LANDMARK_ORDER) {
            if (player.landmarks[name]) score += Player.landmarkCost(name) * 2;
        }
        for (const card of player.cards) {
            if (!player.isDormant(card)) score += card.cost || 0;
        }
        return score;
    }

    _cardCounts(player, activeOnly = true) {
        const counts = Object.fromEntries(CARDS.map(card => [card.name, 0]));
        for (const card of player.cards) {
            if (activeOnly && player.isDormant(card)) continue;
            counts[card.name] = (counts[card.name] || 0) + 1;
        }
        return counts;
    }

    _appendPlayerFeatures(vector, player) {
        vector.push(Math.min(player.coins / 50, 1));
        for (const name of RLCPU.LANDMARK_ORDER) vector.push(player.landmarks[name] ? 1 : 0);
        const active = this._cardCounts(player, true);
        const dormant = this._dormantCounts(player);
        for (const card of CARDS) vector.push(Math.min((active[card.name] || 0) / 5, 1));
        for (const card of CARDS) vector.push(Math.min((dormant[card.name] || 0) / 5, 1));
        vector.push(Math.min((player.itVentureCoins || 0) / 10, 1));
    }

    _sortedOpponents(game) {
        return game.players
            .map((player, index) => ({ player, index, score: this._playerThreatScore(player) }))
            .filter(entry => entry.index !== game.currentPlayerIndex)
            .sort((a, b) => b.score - a.score);
    }

    encodeGameStateV2(game) {
        const current = game.currentPlayer();
        const vector = [];
        this._appendPlayerFeatures(vector, current);
        const opponents = this._sortedOpponents(game);
        const playerFeatureDim = 1 + RLCPU.LANDMARK_ORDER.length + CARDS.length + CARDS.length + 1;
        for (let slot = 0; slot < 3; slot++) {
            if (slot < opponents.length) {
                this._appendPlayerFeatures(vector, opponents[slot].player);
            } else {
                for (let i = 0; i < playerFeatureDim; i++) vector.push(0);
            }
        }
        for (const phase of RLCPU.PHASE_ORDER) vector.push(game.phase === phase ? 1 : 0);
        vector.push((game.lastDiceResult || 0) / 14);
        vector.push((game.lastDice1 || 0) / 6);
        vector.push((game.lastDice2 || 0) / 6);
        vector.push(Number(game.pendingTV || 0));
        vector.push(Number(game.pendingBusiness || 0));
        vector.push(Number(game.pendingCleaning || 0));
        vector.push(Number(game.pendingMover || 0));
        vector.push(Number(game.pendingRenovation || 0));
        vector.push(game.pendingIT ? 1 : 0);
        vector.push(Math.min((game.turnCount || 0) / 200, 1));
        vector.push(Math.max(0, Math.min(((game.players.length || 2) - 2) / 2, 1)));
        if (vector.length !== this.stateDim) {
            throw new Error(`RLCPU encode length mismatch: expected ${this.stateDim}, got ${vector.length}`);
        }
        return vector;
    }

    _dormantCounts(player) {
        const counts = Object.fromEntries(CARDS.map(card => [card.name, 0]));
        for (const card of player.dormantCards) {
            counts[card.name] = (counts[card.name] || 0) + 1;
        }
        return counts;
    }

    encodeGameState(game) {
        if (this.stateDim !== 145) {
            return this.encodeGameStateV2(game);
        }
        const { current, opponent } = this._currentAndOpponent(game);
        const vector = [];
        vector.push(Math.min(current.coins / 50, 1));
        vector.push(Math.min(opponent.coins / 50, 1));
        for (const name of RLCPU.LANDMARK_ORDER) vector.push(current.landmarks[name] ? 1 : 0);
        for (const name of RLCPU.LANDMARK_ORDER) vector.push(opponent.landmarks[name] ? 1 : 0);
        const currentActive = this._cardCounts(current, true);
        const opponentActive = this._cardCounts(opponent, true);
        const currentDormant = this._dormantCounts(current);
        for (const card of CARDS) vector.push(Math.min((currentActive[card.name] || 0) / 5, 1));
        for (const card of CARDS) vector.push(Math.min((opponentActive[card.name] || 0) / 5, 1));
        for (const card of CARDS) vector.push(Math.min((currentDormant[card.name] || 0) / 5, 1));
        for (const phase of RLCPU.PHASE_ORDER) vector.push(game.phase === phase ? 1 : 0);
        vector.push((game.lastDiceResult || 0) / 14);
        vector.push((game.lastDice1 || 0) / 6);
        vector.push((game.lastDice2 || 0) / 6);
        vector.push(Number(game.pendingTV || 0));
        vector.push(Number(game.pendingBusiness || 0));
        vector.push(Number(game.pendingCleaning || 0));
        vector.push(Number(game.pendingMover || 0));
        vector.push(Number(game.pendingRenovation || 0));
        vector.push(game.pendingIT ? 1 : 0);
        vector.push(Math.min((current.itVentureCoins || 0) / 10, 1));
        vector.push(Math.min((game.turnCount || 0) / 200, 1));
        if (vector.length !== this.stateDim) {
            throw new Error(`RLCPU encode length mismatch: expected ${this.stateDim}, got ${vector.length}`);
        }
        return vector;
    }

    actionMask(game, shopStock = null) {
        const { current, opponent } = this._currentAndOpponent(game);
        const actionConstants = RLCPU.ACTIONS;
        const mask = new Array(RLCPU.NUM_ACTIONS).fill(0);

        if (game.phase === GAME_PHASES.ROLL) {
            mask[actionConstants.ROLL1] = 1;
            return mask;
        }

        if (game.phase === GAME_PHASES.SELECT_DICE) {
            mask[actionConstants.ROLL1] = 1;
            if (current.landmarks[LANDMARK_NAMES.STATION]) mask[actionConstants.ROLL2] = 1;
            return mask;
        }

        if (game.phase === GAME_PHASES.REROLL_CONFIRM) {
            mask[actionConstants.KEEP] = 1;
            mask[actionConstants.REROLL] = 1;
            return mask;
        }

        if (game.phase === GAME_PHASES.HARBOR_CHOICE) {
            mask[actionConstants.HARBOR_YES] = 1;
            mask[actionConstants.HARBOR_NO] = 1;
            return mask;
        }

        if (game.phase === GAME_PHASES.PENDING) {
            if (game.pendingTV > 0) {
                mask[actionConstants.TV_TARGET] = 1;
                return mask;
            }
            if (game.pendingBusiness > 0) {
                const myCounts = this._cardCounts(current, false);
                const theirCounts = this._cardCounts(opponent, false);
                for (let giveIndex = 0; giveIndex < CARDS.length; giveIndex++) {
                    const giveCard = CARDS[giveIndex];
                    if ((myCounts[giveCard.name] || 0) <= 0 || giveCard.color === "purple") continue;
                    for (let takeIndex = 0; takeIndex < CARDS.length; takeIndex++) {
                        const takeCard = CARDS[takeIndex];
                        if ((theirCounts[takeCard.name] || 0) <= 0 || takeCard.color === "purple") continue;
                        mask[actionConstants.BC_BASE + giveIndex * CARDS.length + takeIndex] = 1;
                    }
                }
                if (!mask.some(Boolean)) mask[actionConstants.PASS] = 1;
                return mask;
            }
            if (game.pendingCleaning > 0) {
                for (let cardIndex = 0; cardIndex < CARDS.length; cardIndex++) {
                    const cardName = CARDS[cardIndex].name;
                    const anyActive = game.players.some(player => player.cards.some(card => card.name === cardName && !player.isDormant(card)));
                    if (anyActive) mask[actionConstants.CLEAN_BASE + cardIndex] = 1;
                }
                if (!mask.some(Boolean)) mask[actionConstants.PASS] = 1;
                return mask;
            }
            if (game.pendingMover > 0) {
                const myCounts = this._cardCounts(current, false);
                for (let cardIndex = 0; cardIndex < CARDS.length; cardIndex++) {
                    const card = CARDS[cardIndex];
                    if ((myCounts[card.name] || 0) <= 0 || card.color === "purple") continue;
                    mask[actionConstants.MOVER_BASE + cardIndex] = 1;
                }
                if (!mask.some(Boolean)) mask[actionConstants.PASS] = 1;
                return mask;
            }
            if (game.pendingRenovation > 0) {
                for (let landmarkIndex = 0; landmarkIndex < RLCPU.LANDMARK_ORDER.length; landmarkIndex++) {
                    const name = RLCPU.LANDMARK_ORDER[landmarkIndex];
                    if (current.landmarks[name]) mask[actionConstants.RENO_BASE + landmarkIndex] = 1;
                }
                if (!mask.some(Boolean)) mask[actionConstants.PASS] = 1;
                return mask;
            }
            if (game.pendingIT) {
                if (current.coins >= 1) mask[actionConstants.IT_SAVE] = 1;
                mask[actionConstants.IT_SKIP] = 1;
                return mask;
            }
            mask[actionConstants.PASS] = 1;
            return mask;
        }

        if (game.phase === GAME_PHASES.BUILD) {
            mask[actionConstants.PASS] = 1;
            if (game.builtThisTurn) return mask;
            for (let cardIndex = 0; cardIndex < CARDS.length; cardIndex++) {
                const card = CARDS[cardIndex];
                const stock = shopStock && Number.isFinite(shopStock[card.name]) ? shopStock[card.name] : 6;
                if (stock <= 0 || current.coins < card.cost) continue;
                if (card.color === "purple" && current.countCard(card.name) > 0) continue;
                mask[actionConstants.BUY_CARD_BASE + cardIndex] = 1;
            }
            for (let landmarkIndex = 0; landmarkIndex < RLCPU.LANDMARK_ORDER.length; landmarkIndex++) {
                const name = RLCPU.LANDMARK_ORDER[landmarkIndex];
                if (!game.enabledLandmarks.has(name) || current.landmarks[name]) continue;
                if (current.coins >= Player.landmarkCost(name)) {
                    mask[actionConstants.BUY_LM_BASE + landmarkIndex] = 1;
                }
            }
            return mask;
        }

        return mask;
    }

    _chooseForGame(game, shopStock = null) {
        const state = this.encodeGameState(game);
        const mask = this.actionMask(game, shopStock);
        const businessAvailable = mask.slice(RLCPU.ACTIONS.BC_BASE, RLCPU.ACTIONS.BC_BASE + RLCPU.ACTIONS.BC_SIZE).some(Boolean);
        return businessAvailable ? this.chooseBusinessAction(state, mask) : this.chooseAction(state, mask);
    }

    chooseDiceCount(game) {
        return this._chooseForGame(game).action === RLCPU.ACTIONS.ROLL2;
    }

    chooseReroll(game) {
        return this._chooseForGame(game).action === RLCPU.ACTIONS.REROLL;
    }

    chooseHarbor(game) {
        return this._chooseForGame(game).action === RLCPU.ACTIONS.HARBOR_YES;
    }

    chooseTVTarget(game) {
        return this._selectTargetIndex(game, 'tv');
    }

    chooseBusinessMove(game) {
        let targetIndex = this._currentAndOpponent(game).opponentIndex;
        let action;
        if (this._targetLayerForKind('business') && this.numTargetSlots > 0) {
            targetIndex = this._selectTargetIndex(game, 'business');
            action = this.chooseBusinessAction(this.encodeGameState(game), this._businessActionMaskForTarget(game, targetIndex)).action;
        } else {
            action = this._chooseForGame(game).action;
        }
        if (action < RLCPU.ACTIONS.BC_BASE || action >= RLCPU.ACTIONS.BC_BASE + RLCPU.ACTIONS.BC_SIZE) return null;
        const combo = action - RLCPU.ACTIONS.BC_BASE;
        const giveIndex = Math.floor(combo / CARDS.length);
        const takeIndex = combo % CARDS.length;
        return {
            myCard: CARDS[giveIndex].name,
            targetIndex,
            theirCard: CARDS[takeIndex].name,
        };
    }

    chooseCleaningTarget(game) {
        const { action } = this._chooseForGame(game);
        if (action < RLCPU.ACTIONS.CLEAN_BASE || action >= RLCPU.ACTIONS.CLEAN_BASE + CARDS.length) return null;
        return CARDS[action - RLCPU.ACTIONS.CLEAN_BASE].name;
    }

    chooseMoverMove(game) {
        const { action } = this._chooseForGame(game);
        if (action < RLCPU.ACTIONS.MOVER_BASE || action >= RLCPU.ACTIONS.MOVER_BASE + CARDS.length) return null;
        return {
            cardIndex: CARDS[action - RLCPU.ACTIONS.MOVER_BASE].name,
            targetIndex: this._selectTargetIndex(game, 'mover'),
        };
    }

    chooseRenovationTarget(game) {
        const { action } = this._chooseForGame(game);
        if (action < RLCPU.ACTIONS.RENO_BASE || action >= RLCPU.ACTIONS.RENO_BASE + RLCPU.LANDMARK_ORDER.length) return null;
        return RLCPU.LANDMARK_ORDER[action - RLCPU.ACTIONS.RENO_BASE];
    }

    chooseITInvest(game) {
        return this._chooseForGame(game).action === RLCPU.ACTIONS.IT_SAVE;
    }

    build(game, shopStock) {
        const { action } = this._chooseForGame(game, shopStock);
        if (action === RLCPU.ACTIONS.PASS || action < 0) return;
        if (action >= RLCPU.ACTIONS.BUY_CARD_BASE && action < RLCPU.ACTIONS.BUY_CARD_BASE + CARDS.length) {
            const card = CARDS[action - RLCPU.ACTIONS.BUY_CARD_BASE];
            if (game.buildCard(card) && shopStock && Number.isFinite(shopStock[card.name])) {
                shopStock[card.name] = Math.max(0, shopStock[card.name] - 1);
            }
            return;
        }
        if (action >= RLCPU.ACTIONS.BUY_LM_BASE && action < RLCPU.ACTIONS.BUY_LM_BASE + RLCPU.LANDMARK_ORDER.length) {
            game.buildLandmark(RLCPU.LANDMARK_ORDER[action - RLCPU.ACTIONS.BUY_LM_BASE]);
        }
    }
}
