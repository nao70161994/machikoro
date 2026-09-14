'use strict';

const DEFAULT_STRATEGY_PROFILE_TAG = 'rewardv2-build-lossreplay-v1';

const STRATEGY_FAMILIES = Object.freeze([
    Object.freeze({ id: 'attack', label: '攻撃型', hypothesis: '相手のコインと資産成長を抑え、赤・紫効果の差を勝率へ変える', args: Object.freeze(['--reward-opp-coin', '0.008', '--reward-opp-asset', '0.003', '--reward-interaction-build', '0.04']) }),
    Object.freeze({ id: 'landmark-rush', label: 'ランドマーク速攻型', hypothesis: '中盤資産よりランドマーク進捗と終局価値を優先する', args: Object.freeze(['--reward-landmark', '0.30', '--terminal-landmark-value-diff', '0.015', '--terminal-airport-progress', '0.006']) }),
    Object.freeze({ id: 'harbor', label: '港湾型', hypothesis: 'JS expert模倣と資産評価から港・漁船系の相乗効果を獲得する', args: Object.freeze(['--reward-asset', '0.006', '--reward-harbor-build', '0.04', '--imitation-games', '80', '--imitation-opponents', 'strong,expert']) }),
    Object.freeze({ id: 'commercial-engine', label: '商業エンジン型', hypothesis: 'コインと施設資産の持続成長を優先する', args: Object.freeze(['--reward-coin', '0.004', '--reward-asset', '0.008', '--reward-engine-build', '0.02', '--build-pass-affordable-penalty', '0.015']) }),
    Object.freeze({ id: 'disruption-resistance', label: '妨害耐性型', hypothesis: 'rare pendingと相手資産抑制を厚くし、交換・休業局面後の復元力を上げる', args: Object.freeze(['--reward-opp-asset', '0.005', '--rare-pending-oversample-ratio', '0.10', '--rare-pending-oversample-max-multiplier', '4']) }),
    Object.freeze({ id: 'comeback', label: '逆転型', hypothesis: '終局差分とopponent poolを使い、劣勢局面からの勝ち筋を残す', args: Object.freeze(['--terminal-asset-diff', '0.012', '--terminal-coin-diff', '0.006', '--terminal-diff-clip', '40']) }),
]);

const SCOPES = Object.freeze({
    '2p': Object.freeze({
        seeds: Object.freeze([211, 223, 227]),
        baseline: 'models/rl_model/runs/self-only-both-h256-lr2e5-5000-seed71-rewardcap/best_model.top3',
        playerArgs: Object.freeze(['--player-count', '2']),
        evalArgs: Object.freeze(['--js-eval-opponents', 'normal,strong,expert']),
    }),
    mp: Object.freeze({
        seeds: Object.freeze([311, 313, 317]),
        baseline: 'models/rl_model/runs/self-only-4p-h256-lr1e5-5000-seed103/best_model',
        playerArgs: Object.freeze(['--player-counts', '3,4,5,10']),
        evalArgs: Object.freeze(['--js-eval-lineups', 'rl,normal,normal;rl,normal,normal,strong;rl,normal,normal,strong,strong;rl,normal,normal,strong,strong,expert,weak,normal,strong,expert']),
    }),
});

function normalizeRunTag(value) {
    if (value === undefined || value === '') return '';
    const tag = String(value);
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(tag) || tag.includes('..')) {
        throw new TypeError('unsafe RL strategy run tag');
    }
    return tag;
}

function buildRunPlan(options = {}) {
    const games = Number.isSafeInteger(options.games) && options.games >= 0 ? options.games : 1000;
    const progressEvery = games <= 100 ? 1 : 10;
    // Short runs are followed by the authoritative paired 50-game screen.
    // Keep the in-training JS evaluation as a cheap smoke signal instead of
    // paying for the same 10-game matrix both at checkpointing and final eval.
    const jsEvalGames = games <= 100 ? 2 : 10;
    const shortEvaluationArgs = games <= 100 ? [
        '--eval-random-games', '4',
        '--eval-heuristic-games', '2',
        '--eval-pool-games', '2',
        '--final-eval-random-games', '5',
        '--final-eval-heuristic-games', '3',
        '--final-eval-pool-games', '3',
    ] : [];
    const runTag = normalizeRunTag(
        options.tag === undefined ? DEFAULT_STRATEGY_PROFILE_TAG : options.tag
    );
    const scopes = options.scope ? [options.scope] : Object.keys(SCOPES);
    const families = options.family
        ? STRATEGY_FAMILIES.filter(family => family.id === options.family)
        : STRATEGY_FAMILIES;
    if (families.length === 0 || scopes.some(scope => !SCOPES[scope])) {
        throw new TypeError('unknown RL strategy family or scope');
    }
    if (options.seed !== undefined && !options.scope) {
        throw new TypeError('--seed requires --scope');
    }
    if (options.seed !== undefined && (
        !Number.isSafeInteger(options.seed) ||
        !SCOPES[options.scope].seeds.includes(options.seed)
    )) {
        throw new TypeError('unknown RL strategy seed for scope');
    }
    return Object.freeze(families.flatMap(family => scopes.flatMap(scopeName => {
        const scope = SCOPES[scopeName];
        const seeds = options.seed === undefined ? scope.seeds : [options.seed];
        return seeds.map(seed => {
            const runLabel = `strategy-${scopeName}-${family.id}-seed${seed}${runTag ? `-${runTag}` : ''}`;
            const runDir = `models/rl_model/runs/${runLabel}`;
            const args = [
                'python3', '-m', 'scripts.rl.train',
                '--run-label', runLabel,
                '--model-path', `${runDir}/model`,
                '--games', String(games),
                '--eval-every', String(Math.max(50, Math.min(250, games || 50))),
                '--hidden', '256', '--lr', '0.00001', '--seed', String(seed),
                '--load-checkpoint', scope.baseline,
                '--cpu-opponent-impl', 'js-oracle',
                '--train-opponents', 'random=0.18,normal=0.20,strong=0.18,expert=0.10,self=0.18,pool=0.16',
                '--self-learn-both-sides',
                '--loss-episode-replay-probability', '0.25',
                '--pool-update-every', '250', '--pool-max-size', '5',
                '--target-oversample-ratio', '0.08', '--target-head-lr', '0.001',
                '--rare-pending-oversample-ratio', '0.06',
                '--pending-curriculum-samples', '200',
                '--pending-curriculum-refresh-samples', '40',
                '--pending-curriculum-refresh-every', '250',
                '--pending-curriculum-head-lr', '0.001',
                '--initial-eval-games', '0', '--js-eval-games', String(jsEvalGames),
                '--progress-every', String(progressEvery),
                '--imitation-progress-every', '10',
                '--max-steps', '1200', '--eval-max-steps', '1200',
                '--checkpoint-every', '250',
                '--best-checkpoint', `${runDir}/best_model`,
                '--best-checkpoint-top-k', '3',
                '--restore-best-at-end',
                '--metrics-csv', `${runDir}/train_metrics.csv`,
                '--summary-output', `${runDir}/summary.json`,
                '--summary-format', 'json',
                ...shortEvaluationArgs,
                ...scope.playerArgs, ...scope.evalArgs, ...family.args,
            ];
            return Object.freeze({
                family: family.id,
                strategyLabel: family.label,
                hypothesis: family.hypothesis,
                scope: scopeName,
                seed,
                tag: runTag,
                games,
                baseline: scope.baseline,
                runLabel,
                runDir,
                args: Object.freeze(args),
            });
        });
    })));
}

function shellQuote(value) {
    const text = String(value);
    return /^[A-Za-z0-9_./=,:+-]+$/.test(text) ? text : `'${text.replace(/'/g, `'"'"'`)}'`;
}

function commandText(run) {
    return run.args.map(shellQuote).join(' ');
}

function parseArgs(argv) {
    const options = { format: 'json' };
    for (let index = 0; index < argv.length; index++) {
        const arg = argv[index];
        if (arg === '--family') options.family = argv[++index];
        else if (arg === '--scope') options.scope = argv[++index];
        else if (arg === '--games') options.games = Number.parseInt(argv[++index], 10);
        else if (arg === '--seed') options.seed = Number.parseInt(argv[++index], 10);
        else if (arg === '--tag') options.tag = argv[++index];
        else if (arg === '--format') options.format = argv[++index];
        else throw new TypeError(`unknown argument: ${arg}`);
    }
    return options;
}

if (require.main === module) {
    const options = parseArgs(process.argv.slice(2));
    const plan = buildRunPlan(options);
    if (options.format === 'shell') process.stdout.write(plan.map(commandText).join('\n') + '\n');
    else process.stdout.write(JSON.stringify({ schemaVersion: 1, runs: plan }, null, 2) + '\n');
}

module.exports = {
    DEFAULT_STRATEGY_PROFILE_TAG,
    SCOPES,
    STRATEGY_FAMILIES,
    buildRunPlan,
    commandText,
    normalizeRunTag,
    parseArgs,
    shellQuote,
};
