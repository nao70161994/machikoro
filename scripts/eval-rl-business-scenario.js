const fs = require('fs');
const path = require('path');

const { loadRuntime, resolveBusinessMoveCards } = require('./selfplay.js');
const { loadModel } = require('./eval-rl-vs-js.js');
const {
    resolveModelSpecs,
} = require('./eval-rl-models.js');
const {
    parseIntegerOrDefault,
    parseList,
} = require('./cli-args.js');
const { loadRegistry } = require('./validate-rl-registry.js');

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
        else if (arg === '--rank') args.rank = parseIntegerOrDefault(argv[++i], args.rank);
        else if (arg === '--player-count') args.playerCount = parseIntegerOrDefault(argv[++i], args.playerCount);
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
    highValueThreat: {
        description: '最も脅威の高い相手から高価値カードを奪える局面',
        players: [
            {
                coins: 5,
                cards: ['ビジネスセンター', '麦畑', 'パン屋', 'カフェ'],
                landmarks: ['駅'],
            },
            {
                coins: 2,
                cards: ['麦畑', 'パン屋', '牧場'],
                landmarks: [],
            },
            {
                coins: 8,
                cards: ['改装屋', '食品倉庫', 'ピザ屋'],
                landmarks: ['駅'],
            },
            {
                coins: 20,
                cards: ['サンマ漁船', '鉱山', '貸金業'],
                landmarks: ['駅', '港', 'ショッピングモール'],
            },
        ],
    },
    avoidGivingEngine: {
        description: '自分の主要エンジンを渡さず、相手の価値カードを取れるかを見る局面',
        players: [
            {
                coins: 4,
                cards: ['ビジネスセンター', '麦畑', 'パン屋', '食品倉庫'],
                landmarks: ['駅'],
            },
            {
                coins: 4,
                cards: ['麦畑', '牧場', 'パン屋'],
                landmarks: [],
            },
            {
                coins: 7,
                cards: ['ピザ屋', 'バーガーショップ', '寿司屋'],
                landmarks: ['駅'],
            },
            {
                coins: 18,
                cards: ['鉱山', 'マグロ漁船', '改装屋'],
                landmarks: ['駅', '港'],
            },
        ],
    },
    offLeaderPrize: {
        description: '最脅威ではない相手の最高価値カードより、リーダー妨害を優先するかを見る局面',
        players: [
            {
                coins: 6,
                cards: ['ビジネスセンター', '麦畑', 'パン屋', 'カフェ'],
                landmarks: ['駅'],
            },
            {
                coins: 5,
                cards: ['鉱山', 'マグロ漁船', '食品倉庫'],
                landmarks: [],
            },
            {
                coins: 8,
                cards: ['改装屋', 'ピザ屋', 'バーガーショップ'],
                landmarks: ['駅'],
            },
            {
                coins: 24,
                cards: ['サンマ漁船', '寿司屋', '貸金業'],
                landmarks: ['駅', '港', 'ショッピングモール', '遊園地'],
            },
        ],
    },
    protectEngine: {
        description: '高価値カードを持つ自分が、それを渡さず低価値カードを出せるかを見る局面',
        players: [
            {
                coins: 5,
                cards: ['ビジネスセンター', '食品倉庫', 'パン屋', '麦畑'],
                landmarks: ['駅'],
            },
            {
                coins: 3,
                cards: ['牧場', 'カフェ', 'パン屋'],
                landmarks: [],
            },
            {
                coins: 7,
                cards: ['バーガーショップ', 'ピザ屋', '寿司屋'],
                landmarks: ['駅'],
            },
            {
                coins: 16,
                cards: ['サンマ漁船', '改装屋', '貸金業'],
                landmarks: ['駅', '港'],
            },
        ],
    },
    dormantGive: {
        description: '休業中カードを渡す候補にしてしまわないかを見る局面',
        dormant: [
            { player: 0, card: '食品倉庫' },
            { player: 3, card: 'サンマ漁船' },
        ],
        players: [
            {
                coins: 5,
                cards: ['ビジネスセンター', '食品倉庫', 'パン屋', '麦畑'],
                landmarks: ['駅'],
            },
            {
                coins: 3,
                cards: ['牧場', 'カフェ', 'パン屋'],
                landmarks: [],
            },
            {
                coins: 8,
                cards: ['改装屋', 'ピザ屋', 'バーガーショップ'],
                landmarks: ['駅'],
            },
            {
                coins: 18,
                cards: ['サンマ漁船', '鉱山', '貸金業'],
                landmarks: ['駅', '港'],
            },
        ],
    },
    twoPlayerBasic: {
        description: '2人モデル向けの基本BC局面',
        players: [
            {
                coins: 5,
                cards: ['ビジネスセンター', '麦畑', 'パン屋'],
                landmarks: ['駅'],
            },
            {
                coins: 10,
                cards: ['鉱山', 'サンマ漁船', '改装屋'],
                landmarks: ['駅', '港'],
            },
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
    game.pendingBusiness = 1;
    game.pendingTV = 0;
    game.pendingCleaning = 0;
    game.pendingMover = 0;
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

function evaluateScenario(runtime, modelData, scenarioName, playerCount) {
    const cpu = new runtime.RLCPU(modelData);
    const game = createScenarioGame(runtime, scenarioName, playerCount);
    const move = cpu.chooseBusinessMove(game);
    const { giveCard, takeCard } = resolveBusinessMoveCards(game, move);
    const target = move ? game.players[move.targetIndex] : null;
    const giveName = giveCard ? giveCard.name : '';
    const takeName = takeCard ? takeCard.name : '';
    return {
        scenario: scenarioName,
        description: SCENARIOS[scenarioName].description,
        skipped: !move || !giveCard || !takeCard,
        targetIndex: move ? move.targetIndex : null,
        target: target ? target.name : '',
        give: giveName,
        take: takeName,
        giveCost: giveName ? cardCost(runtime, giveName) : 0,
        takeCost: takeName ? cardCost(runtime, takeName) : 0,
        costDelta: takeName || giveName ? cardCost(runtime, takeName) - cardCost(runtime, giveName) : 0,
    };
}

function evaluateBusinessScenarios(specs, args) {
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

function renderText(results) {
    const lines = [];
    for (const result of results) {
        lines.push(`${result.id} players=${result.playerCount} stateDim=${result.modelInfo.stateDim}`);
        for (const scenario of result.scenarios) {
            const choice = scenario.skipped
                ? 'skip'
                : `target=${scenario.target} give=${scenario.give}(${scenario.giveCost}) take=${scenario.take}(${scenario.takeCost}) delta=${scenario.costDelta}`;
            lines.push(`  ${scenario.scenario}: ${choice}`);
        }
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
    const results = evaluateBusinessScenarios(specs, args);
    writeOutputs(results, args);
    if (args.format === 'json') console.log(JSON.stringify(results, null, 2));
    else console.log(renderText(results));
}

module.exports = {
    parseArgs,
    SCENARIOS,
    createScenarioGame,
    evaluateScenario,
    evaluateBusinessScenarios,
    renderText,
};
