const assert = require('assert');
const { runTest } = require('./helpers/test-utils');

const {
    parseArgs,
    actionPriority,
    dedupeActions,
    buildCoverageActions,
    buildWarningActions,
    enrichAuditCoverage,
    buildNextActions,
    renderText,
    renderMarkdown,
} = require('../scripts/plan-rl-next-actions.js');

runTest('plan-rl-next-actions parseArgs は主要CLI引数を解釈する', () => {
    const args = parseArgs(['--registry', 'r.json', '--format', 'markdown']);
    assert.strictEqual(args.registryPath, 'r.json');
    assert.strictEqual(args.format, 'markdown');
});

runTest('plan-rl-next-actions actionPriority は coverage-gap を最優先にする', () => {
    assert.strictEqual(actionPriority({ type: 'coverage-gap' }), 1);
    assert.strictEqual(actionPriority({ type: 'target-head-review' }), 2);
    assert.strictEqual(actionPriority({ type: 'reevaluate' }), 3);
    assert.strictEqual(actionPriority({ type: 'review-diversity' }), 4);
});

runTest('plan-rl-next-actions dedupeActions は同一内容をまとめる', () => {
    const actions = dedupeActions([
        { type: 'reevaluate', id: 'a', message: 'm' },
        { type: 'reevaluate', id: 'a', message: 'm' },
        { type: 'reevaluate', id: 'b', message: 'm' },
    ]);
    assert.deepStrictEqual(actions.map(action => action.id), ['a', 'b']);
});

runTest('plan-rl-next-actions buildCoverageActions は採用モデルの不足評価を抽出する', () => {
    const actions = buildCoverageActions({
        recommended: [
            {
                id: 'm2p',
                role: 'adopted-2p-main',
                has2pOpponents: false,
            },
            {
                id: 'm4p',
                role: 'adopted-3p-10p',
                has3pLineups: false,
                has4pLineups: true,
                has5pLineups: false,
                has10pLineups: false,
                targetDiagnostics: { pendingRate: 0.01, updateRate: 0 },
            },
        ],
    });
    assert.strictEqual(actions.length, 5);
    assert.ok(actions[0].suggestedCommand.includes('eval-run.sh'));
    assert.ok(actions[1].suggestedCommand.includes('eval-run-3p.sh'));
    assert.ok(actions.some(action => action.message.includes('5人 lineup 評価が不足')));
    assert.ok(actions.some(action => action.message.includes('10人 lineup 評価が不足')));
    assert.ok(actions[4].suggestedCommand.includes('eval-run-multiplayer.sh'));
});

runTest('plan-rl-next-actions enrichAuditCoverage は registry の5p/10p評価を補完する', () => {
    const audit = {
        recommended: [
            { id: 'm4p', role: 'adopted-3p-10p' },
        ],
    };
    const enriched = enrichAuditCoverage(audit, {
        models: [
            {
                id: 'm4p',
                evals: [
                    { type: 'js-lineup-5p-stability', gamesPerLineup: 50, lineups: { 'rl+weak+normal+strong+expert': {} } },
                    { type: 'js-lineup-10p-stability', gamesPerLineup: 40, lineups: { 'rl+weak+weak+normal+normal+strong+strong+expert+expert+expert': {} } },
                ],
            },
        ],
    });
    assert.strictEqual(enriched.recommended[0].has5pLineups, true);
    assert.strictEqual(enriched.recommended[0].best5pGames, 50);
    assert.strictEqual(enriched.recommended[0].has10pLineups, true);
    assert.strictEqual(enriched.recommended[0].best10pGames, 40);
});

runTest('plan-rl-next-actions buildWarningActions は reevaluate/diversity にコマンドを付ける', () => {
    const actions = buildWarningActions({
        actions: [
            { type: 'reevaluate', warning: 'model-a: adopted/candidate の評価ゲーム数が少なすぎます (20 < 50)' },
            { type: 'review-diversity', warning: 'model-a と model-b: topCards が 4/5 重複しています' },
        ],
    });
    assert.strictEqual(actions.length, 2);
    assert.ok(actions[0].suggestedCommand.includes('model-a'));
    assert.ok(actions[1].suggestedCommand.includes('model-a,model-b'));
});

runTest('plan-rl-next-actions buildNextActions は coverage と warning を統合して優先順位順に返す', () => {
    const plan = buildNextActions({
        updatedAt: '2026-04-21',
        evaluationPolicy: { minimumAdoptionGamesPerOpponent: 50, primaryAdoptionGamesPerOpponent: 100 },
        models: [
            {
                id: 'm2p',
                status: 'adopted',
                path: 'models/rl_model/portfolio/m2p.browser.json',
                style: { label: 'style-2p' },
                evals: [],
            },
            {
                id: 'm4p',
                status: 'adopted',
                path: 'models/rl_model/portfolio/m4p.browser.json',
                style: { label: 'style-4p' },
                evals: [
                    { type: 'js-lineup-stability', gamesPerLineup: 100, lineups: { 'rl+weak+normal+strong': {} } },
                ],
            },
        ],
        portfolioPolicy: {
            recommendedActiveModels: [
                { id: 'm2p', role: 'adopted-2p-main' },
                { id: 'm4p', role: 'adopted-3p-10p' },
            ],
        },
    });
    assert.ok(plan.actions.length >= 2);
    assert.strictEqual(plan.actions[0].type, 'coverage-gap');
    assert.ok(plan.actions.some(action => action.message.includes('5人 lineup 評価が不足')));
    assert.ok(plan.actions.some(action => action.message.includes('10人 lineup 評価が不足')));
});

runTest('plan-rl-next-actions renderText/renderMarkdown は一覧を出力する', () => {
    const plan = {
        updatedAt: '2026-04-21',
        counts: { 'coverage-gap': 1 },
        actions: [
            {
                type: 'coverage-gap',
                priority: 1,
                id: 'm1',
                message: 'm1: 3人 lineup 評価が不足しています',
                suggestedCommand: 'sh scripts/rl/eval-run-3p.sh 100 m1',
            },
        ],
    };
    const text = renderText(plan);
    const markdown = renderMarkdown(plan);
    assert.ok(text.includes('[coverage-gap]'));
    assert.ok(text.includes('eval-run-3p.sh'));
    assert.ok(markdown.includes('# RL Next Actions'));
    assert.ok(markdown.includes('| priority | type | target | message | command |'));
});
