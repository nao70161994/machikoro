const readline = require('readline');
const {
    loadRuntime,
    actionToLabel,
} = require('../selfplay.js');

const runtime = loadRuntime();
const cardsByName = Object.fromEntries(runtime.CARDS.map(card => [card.name, card]));
const landmarkOrder = runtime.RLCPU.LANDMARK_ORDER;
const actions = runtime.RLCPU.ACTIONS;

function cloneCard(name) {
    const card = cardsByName[name];
    if (!card) throw new Error(`unknown card: ${name}`);
    return Object.assign({}, card);
}

function normalizeState(input) {
    return input && input.state ? input.state : input;
}

function createGameFromState(state) {
    const game = new runtime.GameManager((state.players || []).length || 2);
    game.currentPlayerIndex = state.current != null ? state.current : (state.currentPlayerIndex || 0);
    game.phase = state.phase;
    game.turnCount = state.turnCount || 0;
    game.lastDiceResult = state.lastDice != null ? state.lastDice : (state.lastDiceResult || 0);
    game.lastDice1 = state.lastDice1 || 0;
    game.lastDice2 = state.lastDice2 || 0;
    game.pendingTV = state.pendingTV || 0;
    game.pendingBusiness = state.pendingBusiness || 0;
    game.pendingCleaning = state.pendingCleaning || 0;
    game.pendingMover = state.pendingMover || 0;
    game.pendingRenovation = state.pendingRenovation || 0;
    game.pendingIT = !!state.pendingIT;
    game.pendingActionQueue = Array.isArray(state.pendingActions)
        ? state.pendingActions.map(entry => ({
            action: entry.action || ({
                pendingTV: 'resolveTV',
                pendingBusiness: 'resolveBusiness',
                pendingCleaning: 'resolveCleaning',
                pendingMover: 'resolveMover',
                pendingRenovation: 'resolveRenovation',
            })[entry.field],
            field: entry.field,
        })).filter(entry => entry.action && entry.field)
        : [];
    if (game.pendingActionQueue.length === 0 && typeof game.rebuildPendingActionsFromFields === 'function') {
        game.rebuildPendingActionsFromFields();
    }
    game.usedReroll = !!state.usedReroll;
    game.builtThisTurn = !!state.builtThisTurn;
    game.hadAmusementParkAtRoll = !!state.hadAmusementParkAtRoll;
    game.pendingTunaDice = Array.isArray(state.pendingTunaDice) ? state.pendingTunaDice.slice() : null;
    game.enabledLandmarks = new Set(state.enabledLandmarks || landmarkOrder);
    game.log = [];

    for (let i = 0; i < game.players.length; i++) {
        const player = game.players[i];
        const source = (state.players || [])[i] || {};
        player.coins = source.coins || 0;
        player.itVentureCoins = source.itVentureCoins || 0;
        player.landmarks = Object.fromEntries(landmarkOrder.map(name => [name, false]));
        for (const [name, built] of Object.entries(source.landmarks || {})) {
            if (name in player.landmarks) player.landmarks[name] = !!built;
        }
        player.cards = [];
        if (Array.isArray(source.cardOrder)) {
            player.cards = source.cardOrder.map(cloneCard);
        } else {
            for (const [name, count] of Object.entries(source.cards || {})) {
                for (let n = 0; n < count; n++) player.cards.push(cloneCard(name));
            }
        }
        player.dormantCards = [];
        const dormant = source.dormant || source.dormantCards || {};
        for (const [name, count] of Object.entries(dormant)) {
            let remaining = count;
            for (const card of player.cards) {
                if (remaining <= 0) break;
                if (card.name !== name) continue;
                player.dormantCards.push(card);
                remaining--;
            }
        }
        player.hasYakusho = source.hasYakusho !== false;
    }

    return game;
}

function createShopStock(state) {
    const stock = {};
    for (const card of runtime.CARDS) stock[card.name] = 6;
    for (const [name, count] of Object.entries(state.shopStock || {})) {
        stock[name] = count;
    }
    return stock;
}

function countCards(player) {
    return player.cards.reduce((counts, card) => {
        counts[card.name] = (counts[card.name] || 0) + 1;
        return counts;
    }, {});
}

function findChangedCard(before, after) {
    const beforeCounts = countCards(before);
    const afterCounts = countCards(after);
    for (const card of runtime.CARDS) {
        if ((afterCounts[card.name] || 0) > (beforeCounts[card.name] || 0)) {
            return card.name;
        }
    }
    return null;
}

function findChangedLandmark(before, after) {
    for (const name of landmarkOrder) {
        if (!before.landmarks[name] && after.landmarks[name]) return name;
    }
    return null;
}

function actionForBuild(cpu, game, shopStock) {
    const before = game.currentPlayer();
    const beforeCards = before.cards.slice();
    const beforeLandmarks = Object.assign({}, before.landmarks);
    cpu.build(game, shopStock);
    const after = game.currentPlayer();
    const cardName = findChangedCard({ cards: beforeCards }, after);
    if (cardName) return actions.BUY_CARD_BASE + runtime.CARDS.findIndex(card => card.name === cardName);
    const landmarkName = findChangedLandmark({ landmarks: beforeLandmarks }, after);
    if (landmarkName) return actions.BUY_LM_BASE + landmarkOrder.indexOf(landmarkName);
    return actions.PASS;
}

function actionForPending(cpu, game) {
    const nextPending = runtime.GameManager.nextPendingActionFor(game);
    const pendingField = nextPending && nextPending.field;
    if (pendingField === 'pendingTV' && game.pendingTV > 0) {
        return { action: actions.TV_TARGET, targetIndex: cpu.chooseTVTarget(game) };
    }
    if (pendingField === 'pendingBusiness' && game.pendingBusiness > 0) {
        const move = cpu.chooseBusinessMove(game);
        if (!move) return { action: actions.PASS };
        const current = game.currentPlayer();
        const target = game.players[move.targetIndex];
        const give = current.cards[move.myCard];
        const take = target && target.cards[move.theirCard];
        if (!give || !take) return { action: actions.PASS };
        return {
            action: actions.BC_BASE +
                runtime.CARDS.findIndex(card => card.name === give.name) * runtime.CARDS.length +
                runtime.CARDS.findIndex(card => card.name === take.name),
            targetIndex: move.targetIndex,
        };
    }
    if (pendingField === 'pendingCleaning' && game.pendingCleaning > 0) {
        const name = cpu.chooseCleaningTarget(game);
        if (!name) return { action: actions.PASS };
        return { action: actions.CLEAN_BASE + runtime.CARDS.findIndex(card => card.name === name) };
    }
    if (pendingField === 'pendingMover' && game.pendingMover > 0) {
        const move = cpu.chooseMoverMove(game);
        if (!move) return { action: actions.PASS };
        const card = game.currentPlayer().cards[move.cardIndex];
        if (!card) return { action: actions.PASS };
        return {
            action: actions.MOVER_BASE + runtime.CARDS.findIndex(entry => entry.name === card.name),
            targetIndex: move.targetIndex,
        };
    }
    if (pendingField === 'pendingRenovation' && game.pendingRenovation > 0) {
        const name = cpu.chooseRenovationTarget(game);
        if (!name) return { action: actions.PASS };
        return { action: actions.RENO_BASE + landmarkOrder.indexOf(name) };
    }
    if (game.pendingIT) {
        return { action: cpu.chooseITInvest(game) ? actions.IT_SAVE : actions.IT_SKIP };
    }
    return { action: actions.PASS };
}

function chooseAction(input) {
    const state = normalizeState(input);
    const difficulty = input.difficulty || state.actorDifficulty || 'normal';
    const game = createGameFromState(state);
    const shopStock = createShopStock(state);
    const cpu = new runtime.CPU(difficulty, input.cpuOptions || {});
    let action;
    let targetIndex = null;
    if (game.phase === runtime.GAME_PHASES.ROLL) action = actions.ROLL1;
    else if (game.phase === runtime.GAME_PHASES.SELECT_DICE) action = cpu.chooseDiceCount(game) ? actions.ROLL2 : actions.ROLL1;
    else if (game.phase === runtime.GAME_PHASES.REROLL_CONFIRM) action = cpu.chooseReroll(game) ? actions.REROLL : actions.KEEP;
    else if (game.phase === runtime.GAME_PHASES.HARBOR_CHOICE) action = cpu.chooseHarbor(game) ? actions.HARBOR_YES : actions.HARBOR_NO;
    else if (game.phase === runtime.GAME_PHASES.PENDING) {
        const pendingChoice = actionForPending(cpu, game);
        action = pendingChoice.action;
        if (Number.isInteger(pendingChoice.targetIndex)) targetIndex = pendingChoice.targetIndex;
    }
    else if (game.phase === runtime.GAME_PHASES.BUILD) action = actionForBuild(cpu, game, shopStock);
    else action = actions.PASS;
    const result = { action, label: actionToLabel(runtime, action) };
    if (Number.isInteger(targetIndex)) result.targetIndex = targetIndex;
    return result;
}

if (require.main === module) {
    const rl = readline.createInterface({ input: process.stdin, terminal: false });
    rl.on('line', line => {
        try {
            const input = JSON.parse(line);
            process.stdout.write(`${JSON.stringify(chooseAction(input))}\n`);
        } catch (error) {
            process.stdout.write(`${JSON.stringify({ error: error.message })}\n`);
        }
    });
}

module.exports = {
    chooseAction,
    createGameFromState,
};
