const path = require('path');

const { loadRegistry } = require('./validate-rl-registry.js');

function parseArgs(argv) {
    const args = {
        registryPath: path.join(__dirname, '..', 'models', 'rl_model', 'registry.json'),
        rank: 1,
        target: '',
    };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--registry') args.registryPath = argv[++i] || args.registryPath;
        else if (arg === '--rank') args.rank = parseInt(argv[++i] || String(args.rank), 10);
        else if (!args.target) args.target = arg;
    }
    return args;
}

function browserPathForRunLabel(runLabel, rank = 1) {
    const fileName = rank === 1 ? 'best_model.browser.json' : `best_model.top${rank}.browser.json`;
    return path.join('models', 'rl_model', 'runs', runLabel, fileName);
}

function resolveModelPath(target, rank = 1, registry = null) {
    if (!target) throw new Error('target is required');
    if (target.startsWith('models/')) return target;
    const models = registry && Array.isArray(registry.models) ? registry.models : [];
    const model = models.find(entry => entry && entry.id === target);
    if (model && model.path) return model.path;
    return browserPathForRunLabel(target, rank);
}

if (require.main === module) {
    const args = parseArgs(process.argv.slice(2));
    const registry = loadRegistry(args.registryPath);
    console.log(resolveModelPath(args.target, args.rank, registry));
}

module.exports = {
    parseArgs,
    browserPathForRunLabel,
    resolveModelPath,
};
