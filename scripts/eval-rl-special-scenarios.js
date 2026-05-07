const fs = require('fs');
const path = require('path');

const { loadRuntime, resolveBusinessMoveCards } = require('./selfplay.js');
const { loadModel } = require('./eval-rl-vs-js.js');
const { resolveModelSpecs } = require('./eval-rl-models.js');
const { loadRegistry } = require('./validate-rl-registry.js');

function parseList(value) {
    return String(value || '').split(',').map(item => item.trim()).filter(Boolean);
}

function parseArgs(argv) {
    const args = {
        registryPath: path.join(__dirname, '..', 'models', 'rl_model', 'registry.json'),
        models: [],
        runLabels: [],
        rank: 1,
        playerCount: 4,
        scenarios: [],
        format: 'text',
        output: '',
    };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--registry') args.registryPath = argv[++i] || args.registryPath;
        else if (arg === '--models') args.models = parseList(argv[++i]);
        else if (arg === '--run-labels') args.runLabels = parseList(argv[++i]);
        else if (arg === '--rank') args.rank = parseInt(argv[++i] || String(args.rank), 10);
        else if (arg === '--player-count') args.playerCount = parseInt(argv[++i] || String(args.playerCount), 10);
        else if (arg === '--scenarios') args.scenarios = parseList(argv[++i]);
        else if (arg === '--format') args.format = argv[++i] || args.format;
        else if (arg === '--output') args.output = argv[++i] || '';
    }
    return args;
}

function createCard(runtime, name) {
    const card = runtime.createCardByName(name);
    if (!card) throw new Error(`unknown card: ${name}`);
    return card;
}

function setCards(runtime, player, names) {
    player.cards = [];
    player.dormantCards = [];
    for (const name of names) player.addCard(createCard(runtime, name));
}

function setLandmarks(player, names) {
    for (const name of Object.keys(player.landmarks)) player.landmarks[name] = false;
    for (const name of names || []) {
        if (Object.prototype.hasOwnProperty.call(player.landmarks, name)) {
            player.landmarks[name] = true;
        }
    }
}

const SCENARIOS = {
    tvLeaderThreat: {
        kind: 'tv',
        description: '高コインのリーダーをテレビ局の対象にできるかを見る局面',
        expected: { targetIndex: 3 },
        players: [
            { coins: 4, cards: ['テレビ局', '麦畑', 'パン屋'], landmarks: ['駅'] },
            { coins: 3, cards: ['麦畑', 'パン屋', '牧場'], landmarks: [] },
            { coins: 8, cards: ['改装屋', '食品倉庫', 'ピザ屋'], landmarks: ['駅'] },
            { coins: 22, cards: ['サンマ漁船', '鉱山', '貸金業'], landmarks: ['駅', '港', 'ショッピングモール'] },
        ],
    },
    tvAvoidPoorTarget: {
        kind: 'tv',
        description: '低コインの相手ではなく、奪える相手をテレビ局の対象にできるかを見る局面',
        expected: { targetNotIn: [1] },
        players: [
            { coins: 4, cards: ['テレビ局', '麦畑', 'パン屋'], landmarks: ['駅'] },
            { coins: 0, cards: ['麦畑', 'パン屋'], landmarks: [] },
            { coins: 9, cards: ['食品倉庫', 'ピザ屋'], landmarks: ['駅'] },
            { coins: 13, cards: ['鉱山', 'サンマ漁船'], landmarks: ['駅', '港'] },
        ],
    },
    bcHighValueThreat: {
        kind: 'business',
        description: '最も脅威の高い相手から高価値カードを奪えるかを見る局面',
        expected: { targetIndex: 3, takeOneOf: ['サンマ漁船', '鉱山'], avoidGive: ['食品倉庫'] },
        players: [
            { coins: 5, cards: ['ビジネスセンター', '麦畑', 'パン屋', 'カフェ'], landmarks: ['駅'] },
            { coins: 2, cards: ['麦畑', 'パン屋', '牧場'], landmarks: [] },
            { coins: 8, cards: ['改装屋', '食品倉庫', 'ピザ屋'], landmarks: ['駅'] },
            { coins: 20, cards: ['サンマ漁船', '鉱山', '貸金業'], landmarks: ['駅', '港', 'ショッピングモール'] },
        ],
    },
    bcProtectEngine: {
        kind: 'business',
        description: '自分の主要エンジンを渡さず相手の価値カードを取れるかを見る局面',
        expected: { avoidGive: ['食品倉庫'], takeOneOf: ['鉱山', 'マグロ漁船'] },
        players: [
            { coins: 4, cards: ['ビジネスセンター', '麦畑', 'パン屋', '食品倉庫'], landmarks: ['駅'] },
            { coins: 4, cards: ['麦畑', '牧場', 'パン屋'], landmarks: [] },
            { coins: 7, cards: ['ピザ屋', 'バーガーショップ', '寿司屋'], landmarks: ['駅'] },
            { coins: 18, cards: ['鉱山', 'マグロ漁船', '改装屋'], landmarks: ['駅', '港'] },
        ],
    },
    cleaningOpponentEngine: {
        kind: 'cleaning',
        description: '相手エンジンの主力同名カードを清掃業の対象にできるかを見る局面',
        expected: { cardName: 'カフェ' },
        players: [
            { coins: 4, cards: ['清掃業', '麦畑', 'パン屋'], landmarks: ['駅'] },
            { coins: 5, cards: ['カフェ', 'カフェ', 'パン屋'], landmarks: [] },
            { coins: 6, cards: ['カフェ', 'ピザ屋', '食品倉庫'], landmarks: ['駅'] },
            { coins: 9, cards: ['鉱山', 'サンマ漁船'], landmarks: ['駅', '港'] },
        ],
    },
    cleaningAvoidSelfDamage: {
        kind: 'cleaning',
        description: '自分の主力も巻き込むカード名を避けて休業対象を選べるかを見る局面',
        expected: { avoidCard: '食品倉庫' },
        players: [
            { coins: 5, cards: ['清掃業', '食品倉庫', '食品倉庫', 'パン屋'], landmarks: ['駅'] },
            { coins: 4, cards: ['食品倉庫', 'パン屋'], landmarks: [] },
            { coins: 7, cards: ['カフェ', 'カフェ', 'ピザ屋'], landmarks: ['駅'] },
            { coins: 8, cards: ['カフェ', '鉱山'], landmarks: ['駅'] },
        ],
    },
    moverGiveJunk: {
        kind: 'mover',
        description: '低価値カードを引越し屋で渡せるかを見る局面',
        expected: { giveOneOf: ['麦畑', '貸金業'], avoidGive: ['食品倉庫'] },
        players: [
            { coins: 5, cards: ['引越し屋', '麦畑', '食品倉庫', '貸金業'], landmarks: ['駅'] },
            { coins: 5, cards: ['牧場', 'パン屋'], landmarks: [] },
            { coins: 8, cards: ['ピザ屋', 'バーガーショップ'], landmarks: ['駅'] },
            { coins: 15, cards: ['鉱山', 'サンマ漁船'], landmarks: ['駅', '港'] },
        ],
    },
    moverAvoidHelpingLeader: {
        kind: 'mover',
        description: 'リーダーに有利カードを渡さないかを見る局面',
        expected: { targetNotIn: [3], avoidGive: ['食品倉庫'] },
        players: [
            { coins: 5, cards: ['引越し屋', '麦畑', '食品倉庫', '貸金業'], landmarks: ['駅'] },
            { coins: 4, cards: ['牧場', 'パン屋'], landmarks: [] },
            { coins: 6, cards: ['カフェ', 'ピザ屋'], landmarks: ['駅'] },
            { coins: 24, cards: ['鉱山', 'サンマ漁船'], landmarks: ['駅', '港', 'ショッピングモール'] },
        ],
    },
    moverTargetSafeRecipient: {
        kind: 'mover',
        description: '渡すカードがほぼ低価値1択の状態で、リーダー以外へ渡せるかを見る局面',
        expected: { giveOneOf: ['麦畑'], targetNotIn: [3] },
        players: [
            { coins: 5, cards: ['引越し屋', '麦畑'], landmarks: ['駅'] },
            { coins: 3, cards: ['パン屋', '牧場'], landmarks: [] },
            { coins: 6, cards: ['カフェ', 'ピザ屋'], landmarks: ['駅'] },
            { coins: 24, cards: ['鉱山', 'サンマ漁船', '食品倉庫'], landmarks: ['駅', '港', 'ショッピングモール', '遊園地'] },
        ],
    },
    moverDormantPreferred: {
        kind: 'mover',
        description: '休業中カードを引越し屋で渡す候補にできるかを見る局面',
        dormant: [{ player: 0, card: '麦畑' }],
        expected: { giveOneOf: ['麦畑', '貸金業'] },
        players: [
            { coins: 5, cards: ['引越し屋', '麦畑', '食品倉庫', '貸金業'], landmarks: ['駅'] },
            { coins: 4, cards: ['牧場', 'パン屋'], landmarks: [] },
            { coins: 7, cards: ['カフェ', 'ピザ屋'], landmarks: ['駅'] },
            { coins: 12, cards: ['鉱山', 'サンマ漁船'], landmarks: ['駅', '港'] },
        ],
    },
    twoPlayerBusinessBasic: {
        kind: 'business',
        description: '2人モデル向けの基本ビジネスセンター局面',
        expected: { targetIndex: 1, takeOneOf: ['鉱山', 'サンマ漁船'] },
        players: [
            { coins: 5, cards: ['ビジネスセンター', '麦畑', 'パン屋'], landmarks: ['駅'] },
            { coins: 10, cards: ['鉱山', 'サンマ漁船', '改装屋'], landmarks: ['駅', '港'] },
        ],
    },
};

function scenarioNamesForPlayerCount(playerCount, requested) {
    const names = requested.length > 0
        ? requested
        : Object.keys(SCENARIOS).filter(name => SCENARIOS[name].players.length === playerCount);
    return names.filter(name => SCENARIOS[name] && SCENARIOS[name].players.length <= playerCount);
}

function createScenarioGame(runtime, scenarioName, playerCount) {
    const scenario = SCENARIOS[scenarioName];
    if (!scenario) throw new Error(`unknown scenario: ${scenarioName}`);
    if (scenario.players.length > playerCount) {
        throw new Error(`${scenarioName} requires at least ${scenario.players.length} players`);
    }
    const game = new runtime.GameManager(playerCount);
    game.currentPlayerIndex = 0;
    game.phase = runtime.GAME_PHASES.PENDING;
    game.pendingTV = scenario.kind === 'tv' ? 1 : 0;
    game.pendingBusiness = scenario.kind === 'business' ? 1 : 0;
    game.pendingCleaning = scenario.kind === 'cleaning' ? 1 : 0;
    game.pendingMover = scenario.kind === 'mover' ? 1 : 0;
    game.pendingRenovation = 0;
    game.pendingIT = false;

    for (let i = 0; i < playerCount; i++) {
        const spec = scenario.players[i] || {
            coins: 1,
            cards: ['麦畑', 'パン屋'],
            landmarks: [],
        };
        const player = game.players[i];
        player.name = `p${i}`;
        player.coins = spec.coins || 0;
        setCards(runtime, player, spec.cards);
        setLandmarks(player, spec.landmarks || []);
    }
    for (const dormant of scenario.dormant || []) {
        const player = game.players[dormant.player];
        if (!player) continue;
        const card = player.cards.find(card => card.name === dormant.card);
        if (card) player.makeDormant(card);
    }
    return game;
}

function cardCost(runtime, name) {
    const card = runtime.CARDS.find(card => card.name === name);
    return card ? card.cost : 0;
}

function resolvePlayerCard(player, ref) {
    if (!player || ref == null) return null;
    if (Number.isInteger(ref)) return player.cards[ref] || null;
    return player.cards.find(card => card.name === ref) || null;
}

function buildChecks(expected, actual) {
    const checks = {};
    if (Object.prototype.hasOwnProperty.call(expected, 'targetIndex')) {
        checks.targetMatches = actual.targetIndex === expected.targetIndex;
    }
    if (Array.isArray(expected.targetOneOf)) {
        checks.targetMatches = expected.targetOneOf.includes(actual.targetIndex);
    }
    if (Array.isArray(expected.targetNotIn)) {
        checks.targetAvoided = !expected.targetNotIn.includes(actual.targetIndex);
    }
    if (expected.cardName) checks.cardMatches = actual.cardName === expected.cardName;
    if (expected.avoidCard) checks.avoidCardPassed = actual.cardName !== expected.avoidCard;
    if (Array.isArray(expected.giveOneOf)) checks.giveMatches = expected.giveOneOf.includes(actual.give || actual.cardName);
    if (Array.isArray(expected.takeOneOf)) checks.takeMatches = expected.takeOneOf.includes(actual.take);
    if (Array.isArray(expected.avoidGive)) checks.avoidGivePassed = !expected.avoidGive.includes(actual.give || actual.cardName);
    return checks;
}

function evaluateTvScenario(runtime, cpu, game, scenario) {
    const targetIndex = cpu.chooseTVTarget(game);
    const target = Number.isInteger(targetIndex) ? game.players[targetIndex] : null;
    const actual = {
        skipped: !target,
        targetIndex: target ? targetIndex : null,
        target: target ? target.name : '',
    };
    return {
        ...actual,
        expected: scenario.expected || {},
        checks: buildChecks(scenario.expected || {}, actual),
    };
}

function evaluateBusinessScenario(runtime, cpu, game, scenario) {
    const move = cpu.chooseBusinessMove(game);
    const { giveCard, takeCard } = resolveBusinessMoveCards(game, move);
    const target = move ? game.players[move.targetIndex] : null;
    const giveName = giveCard ? giveCard.name : '';
    const takeName = takeCard ? takeCard.name : '';
    const actual = {
        skipped: !move || !giveCard || !takeCard,
        targetIndex: move ? move.targetIndex : null,
        target: target ? target.name : '',
        give: giveName,
        take: takeName,
        giveCost: giveName ? cardCost(runtime, giveName) : 0,
        takeCost: takeName ? cardCost(runtime, takeName) : 0,
        costDelta: takeName || giveName ? cardCost(runtime, takeName) - cardCost(runtime, giveName) : 0,
    };
    return {
        ...actual,
        expected: scenario.expected || {},
        checks: buildChecks(scenario.expected || {}, actual),
    };
}

function evaluateCleaningScenario(cpu, game, scenario) {
    const cardName = cpu.chooseCleaningTarget(game);
    const actual = {
        skipped: !cardName,
        cardName: cardName || '',
    };
    return {
        ...actual,
        expected: scenario.expected || {},
        checks: buildChecks(scenario.expected || {}, actual),
    };
}

function evaluateMoverScenario(runtime, cpu, game, scenario) {
    const move = cpu.chooseMoverMove(game);
    const card = move ? resolvePlayerCard(game.currentPlayer(), move.cardIndex) : null;
    const target = move ? game.players[move.targetIndex] : null;
    const cardName = card ? card.name : '';
    const actual = {
        skipped: !move || !card || !target,
        targetIndex: move ? move.targetIndex : null,
        target: target ? target.name : '',
        cardName,
        cardIndex: move ? move.cardIndex : null,
        cardCost: cardName ? cardCost(runtime, cardName) : 0,
        isDormant: card ? game.currentPlayer().isDormant(card) : false,
    };
    return {
        ...actual,
        expected: scenario.expected || {},
        checks: buildChecks(scenario.expected || {}, actual),
    };
}

function evaluateScenario(runtime, modelData, scenarioName, playerCount) {
    const scenario = SCENARIOS[scenarioName];
    if (!scenario) throw new Error(`unknown scenario: ${scenarioName}`);
    const cpu = new runtime.RLCPU(modelData);
    const game = createScenarioGame(runtime, scenarioName, playerCount);
    let detail;
    if (scenario.kind === 'tv') detail = evaluateTvScenario(runtime, cpu, game, scenario);
    else if (scenario.kind === 'business') detail = evaluateBusinessScenario(runtime, cpu, game, scenario);
    else if (scenario.kind === 'cleaning') detail = evaluateCleaningScenario(cpu, game, scenario);
    else if (scenario.kind === 'mover') detail = evaluateMoverScenario(runtime, cpu, game, scenario);
    else throw new Error(`unknown scenario kind: ${scenario.kind}`);
    return {
        scenario: scenarioName,
        kind: scenario.kind,
        description: scenario.description,
        ...detail,
    };
}

function evaluateSpecialScenarios(specs, args) {
    const runtime = loadRuntime();
    const scenarios = scenarioNamesForPlayerCount(args.playerCount, args.scenarios);
    return specs.map(spec => {
        const modelData = spec.modelData || loadModel(spec.path);
        return {
            id: spec.id,
            label: spec.label || spec.id,
            path: spec.path,
            playerCount: args.playerCount,
            modelInfo: {
                stateDim: modelData.stateDim,
                hiddenSize: modelData.hiddenSize,
                numActions: modelData.numActions,
                schemaVersion: modelData.schemaVersion,
            },
            scenarios: scenarios.map(name => evaluateScenario(runtime, modelData, name, args.playerCount)),
        };
    });
}

function renderScenarioText(scenario) {
    if (scenario.skipped) return `${scenario.scenario}[${scenario.kind}]: skip`;
    if (scenario.kind === 'tv') return `${scenario.scenario}[tv]: target=${scenario.target}`;
    if (scenario.kind === 'business') {
        return `${scenario.scenario}[business]: target=${scenario.target} give=${scenario.give}(${scenario.giveCost}) take=${scenario.take}(${scenario.takeCost}) delta=${scenario.costDelta}`;
    }
    if (scenario.kind === 'cleaning') return `${scenario.scenario}[cleaning]: card=${scenario.cardName}`;
    if (scenario.kind === 'mover') return `${scenario.scenario}[mover]: target=${scenario.target} card=${scenario.cardName}(${scenario.cardCost}) dormant=${scenario.isDormant ? 'yes' : 'no'}`;
    return `${scenario.scenario}[${scenario.kind}]: ok`;
}

function renderText(results) {
    const lines = [];
    for (const result of results) {
        lines.push(`${result.id} players=${result.playerCount} stateDim=${result.modelInfo.stateDim}`);
        for (const scenario of result.scenarios) lines.push(`  ${renderScenarioText(scenario)}`);
    }
    return lines.join('\n');
}

function writeOutputs(results, args) {
    if (args.output) fs.writeFileSync(args.output, JSON.stringify(results, null, 2), 'utf8');
}

if (require.main === module) {
    const args = parseArgs(process.argv.slice(2));
    const registry = loadRegistry(args.registryPath);
    const specs = resolveModelSpecs(args, registry);
    const results = evaluateSpecialScenarios(specs, args);
    writeOutputs(results, args);
    if (args.format === 'json') console.log(JSON.stringify(results, null, 2));
    else console.log(renderText(results));
}

module.exports = {
    parseArgs,
    SCENARIOS,
    scenarioNamesForPlayerCount,
    createScenarioGame,
    buildChecks,
    evaluateScenario,
    evaluateSpecialScenarios,
    renderText,
};
