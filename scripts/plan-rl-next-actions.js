const path = require('path');

const { loadRegistry } = require('./validate-rl-registry.js');
const { buildRegistryReport } = require('./report-rl-registry.js');
const { buildAudit } = require('./audit-rl-portfolio.js');

function parseArgs(argv) {
    const args = {
        registryPath: path.join(__dirname, '..', 'models', 'rl_model', 'registry.json'),
        format: 'text',
    };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--registry') args.registryPath = argv[++i] || args.registryPath;
        else if (arg === '--format') args.format = argv[++i] || args.format;
    }
    return args;
}

function actionPriority(action) {
    if (!action) return 99;
    if (action.type === 'coverage-gap') return 1;
    if (action.type === 'reevaluate') return 2;
    if (action.type === 'review-diversity') return 3;
    if (action.type === 'record-eval-or-rejection') return 4;
    return 9;
}

function dedupeActions(actions) {
    const seen = new Set();
    return actions.filter(action => {
        const key = JSON.stringify([action.type, action.id || '', action.pair || '', action.message || '']);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function buildCoverageActions(audit) {
    const actions = [];
    for (const item of audit.recommended || []) {
        if (item.role.includes('2p') && !item.has2pOpponents) {
            actions.push({
                type: 'coverage-gap',
                priority: 1,
                id: item.id,
                role: item.role,
                message: `${item.id}: 2人用採用モデルなのに weak/normal/strong の2人評価が不足しています`,
                suggestedCommand: `sh scripts/rl/eval-run.sh ${item.id} 100 weak,normal,strong`,
            });
        }
        if (item.role.includes('3p-4p') && !item.has3pLineups) {
            actions.push({
                type: 'coverage-gap',
                priority: 1,
                id: item.id,
                role: item.role,
                message: `${item.id}: 3〜4人用採用モデルなのに 3人 lineup 評価が不足しています`,
                suggestedCommand: `sh scripts/rl/eval-run-3p.sh 100 ${item.id}`,
            });
        }
        if (item.role.includes('3p-4p') && !item.has4pLineups) {
            actions.push({
                type: 'coverage-gap',
                priority: 1,
                id: item.id,
                role: item.role,
                message: `${item.id}: 3〜4人用採用モデルなのに 4人 lineup 評価が不足しています`,
                suggestedCommand: `sh scripts/rl/eval-run-4p.sh 100 ${item.id}`,
            });
        }
    }
    return actions;
}

function buildWarningActions(report) {
    return (report.actions || []).map(action => {
        const base = {
            type: action.type,
            priority: actionPriority(action),
            message: action.warning,
            suggestedCommand: '',
        };
        const reevaluateMatch = action.warning.match(/^([^:]+): .*評価ゲーム数が少なすぎます/);
        if (action.type === 'reevaluate' && reevaluateMatch) {
            const id = reevaluateMatch[1];
            return {
                ...base,
                id,
                suggestedCommand: `sh scripts/rl/eval-run.sh ${id} 50 weak,normal,strong`,
            };
        }
        const overlapMatch = action.warning.match(/^([^ ]+) と ([^:]+): topCards が/);
        if (action.type === 'review-diversity' && overlapMatch) {
            const left = overlapMatch[1];
            const right = overlapMatch[2];
            return {
                ...base,
                pair: `${left}/${right}`,
                suggestedCommand: `npm run eval-rl-models -- --models ${left},${right} --games 100 --markdown models/rl_model/${left}-${right}.md`,
            };
        }
        return base;
    });
}

function buildNextActions(registry) {
    const report = buildRegistryReport(registry);
    const audit = buildAudit(registry);
    const actions = dedupeActions([
        ...buildCoverageActions(audit),
        ...buildWarningActions(report),
    ]).sort((a, b) => a.priority - b.priority || String(a.id || a.pair || '').localeCompare(String(b.id || b.pair || '')));
    return {
        updatedAt: registry.updatedAt || '',
        actions,
        counts: actions.reduce((acc, action) => {
            acc[action.type] = (acc[action.type] || 0) + 1;
            return acc;
        }, {}),
    };
}

function renderText(plan) {
    const lines = [
        `RL next actions updatedAt=${plan.updatedAt || 'n/a'}`,
        `counts=${Object.entries(plan.counts).map(([key, value]) => `${key}:${value}`).join(', ') || 'none'}`,
    ];
    for (const [index, action] of plan.actions.entries()) {
        lines.push(`${index + 1}. [${action.type}] ${action.message}`);
        if (action.suggestedCommand) lines.push(`   cmd: ${action.suggestedCommand}`);
    }
    return lines.join('\n') + '\n';
}

function renderMarkdown(plan) {
    const lines = [
        '# RL Next Actions',
        '',
        `- updatedAt: ${plan.updatedAt || 'n/a'}`,
        `- counts: ${Object.entries(plan.counts).map(([key, value]) => `${key}:${value}`).join(', ') || 'none'}`,
        '',
        '| priority | type | target | message | command |',
        '|---:|---|---|---|---|',
    ];
    for (const action of plan.actions) {
        lines.push(
            `| ${action.priority} | ${action.type} | ${action.id || action.pair || ''} | ` +
            `${action.message} | ${action.suggestedCommand || ''} |`
        );
    }
    return lines.join('\n') + '\n';
}

if (require.main === module) {
    const args = parseArgs(process.argv.slice(2));
    const plan = buildNextActions(loadRegistry(args.registryPath));
    if (args.format === 'json') console.log(JSON.stringify(plan, null, 2));
    else if (args.format === 'markdown' || args.format === 'md') process.stdout.write(renderMarkdown(plan));
    else process.stdout.write(renderText(plan));
}

module.exports = {
    parseArgs,
    actionPriority,
    dedupeActions,
    buildCoverageActions,
    buildWarningActions,
    buildNextActions,
    renderText,
    renderMarkdown,
};
