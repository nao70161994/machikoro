const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { runTest } = require('./helpers/test-utils');

const {
    parseArgs,
    latest2pEval,
    weighted2pScore,
    buildCandidateEntry,
    buildAdoptionReview,
    renderText,
    renderMarkdown,
} = require('../scripts/review-rl-adoptions.js');

runTest('review-rl-adoptions parseArgs は主要CLI引数を解釈する', () => {
    const args = parseArgs(['--registry', 'registry.json', '--format', 'markdown', '--output', 'out.md']);
    assert.strictEqual(args.registryPath, 'registry.json');
    assert.strictEqual(args.format, 'markdown');
    assert.strictEqual(args.output, 'out.md');
});

runTest('review-rl-adoptions latest2pEval は gamesPerOpponent が最大の評価を返す', () => {
    const entry = latest2pEval({
        evals: [
            { type: 'js', gamesPerOpponent: 20, date: '2026-04-10', opponents: {} },
            { type: 'js', gamesPerOpponent: 100, date: '2026-04-09', opponents: {} },
            { type: 'js', gamesPerLineup: 50, date: '2026-04-11', lineups: {} },
        ],
    });
    assert.strictEqual(entry.gamesPerOpponent, 100);
});

runTest('review-rl-adoptions weighted2pScore は weak/normal/strong の重み付き平均を返す', () => {
    const score = weighted2pScore({
        opponents: {
            weak: { winRate: 0.9 },
            normal: { winRate: 0.6 },
            strong: { winRate: 0.3 },
        },
    });
    assert.strictEqual(score, 0.5);
});

runTest('review-rl-adoptions buildCandidateEntry は主要指標を抽出する', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'machikoro-review-'));
    try {
        const runDir = path.join(repoRoot, 'models', 'rl_model', 'runs', 'm1-run');
        fs.mkdirSync(runDir, { recursive: true });
        fs.writeFileSync(path.join(runDir, 'summary.json'), JSON.stringify({
            bestRuns: [{ targetPendingRate: 0.08, targetUpdateRate: 0.07, tvTargetRate: 0.03, bcTargetRate: 0.02, moverTargetRate: 0.01 }],
        }), 'utf8');
        const entry = buildCandidateEntry({
            id: 'm1',
            status: 'candidate',
            sourceRun: 'models/rl_model/runs/m1-run',
            style: { label: 'alpha' },
            evals: [
                {
                    type: 'js',
                    gamesPerOpponent: 50,
                    opponents: {
                        weak: { winRate: 0.8, passRate: 0.01 },
                        normal: { winRate: 0.7, passRate: 0.02 },
                        strong: { winRate: 0.4, passRate: 0.03 },
                    },
                },
            ],
        }, new Set(['m1']), { repoRoot });
        assert.strictEqual(entry.recommended, true);
        assert.strictEqual(entry.evalGames, 50);
        assert.strictEqual(entry.passRate, 0.03);
        assert.strictEqual(entry.score, 0.566667);
        assert.strictEqual(entry.targetDiagnostics.pendingRate, 0.08);
    } finally {
        fs.rmSync(repoRoot, { recursive: true, force: true });
    }
});

runTest('review-rl-adoptions buildAdoptionReview は main と challenger を比較する', () => {
    const review = buildAdoptionReview({
        updatedAt: '2026-04-21',
        evaluationPolicy: { minimumAdoptionGamesPerOpponent: 50 },
        portfolioPolicy: {
            recommendedActiveModels: [
                { id: 'main', role: 'adopted-2p-main' },
            ],
        },
        models: [
            {
                id: 'main',
                status: 'adopted',
                style: { label: 'style-a' },
                evals: [
                    {
                        type: 'js',
                        date: '2026-04-20',
                        gamesPerOpponent: 50,
                        opponents: {
                            weak: { winRate: 0.9, passRate: 0.01 },
                            normal: { winRate: 0.6, passRate: 0.02 },
                            strong: { winRate: 0.2, passRate: 0.03 },
                        },
                    },
                ],
            },
            {
                id: 'challenger',
                status: 'candidate',
                style: { label: 'style-b' },
                evals: [
                    {
                        type: 'js',
                        date: '2026-04-21',
                        gamesPerOpponent: 100,
                        opponents: {
                            weak: { winRate: 0.95, passRate: 0.0 },
                            normal: { winRate: 0.7, passRate: 0.01 },
                            strong: { winRate: 0.35, passRate: 0.02 },
                        },
                    },
                ],
            },
        ],
    });
    assert.strictEqual(review.currentMain, 'main');
    assert.strictEqual(review.candidates[0].id, 'challenger');
    assert.ok(review.actions.some(action => action.type === 'compare-main-vs-challenger'));
});

runTest('review-rl-adoptions buildAdoptionReview は archive/rejected/candidate-4p を候補から除外する', () => {
    const makeEval = winRate => ({
        type: 'js',
        date: '2026-04-21',
        gamesPerOpponent: 100,
        opponents: {
            weak: { winRate },
            normal: { winRate },
            strong: { winRate },
        },
    });
    const review = buildAdoptionReview({
        updatedAt: '2026-04-21',
        evaluationPolicy: { minimumAdoptionGamesPerOpponent: 50 },
        portfolioPolicy: {
            recommendedActiveModels: [
                { id: 'main', role: 'adopted-2p-main' },
            ],
        },
        models: [
            { id: 'main', status: 'adopted', style: { label: 'main' }, evals: [makeEval(0.6)] },
            { id: 'active', status: 'candidate', style: { label: 'active' }, evals: [makeEval(0.7)] },
            { id: 'archived-strong', status: 'archive', style: { label: 'archived' }, evals: [makeEval(1.0)] },
            { id: 'rejected-strong', status: 'rejected', style: { label: 'rejected' }, evals: [makeEval(1.0)] },
            { id: 'candidate-4p-strong', status: 'candidate-4p', style: { label: 'candidate-4p' }, evals: [makeEval(1.0)] },
        ],
    });
    assert.deepStrictEqual(review.candidates.map(entry => entry.id), ['active', 'main']);
    assert.strictEqual(review.currentMain, 'main');
    assert.ok(review.actions.some(action => action.type === 'compare-main-vs-challenger' && action.message.includes('active')));
    assert.ok(!review.actions.some(action => action.message.includes('archived-strong')));
    assert.ok(!review.actions.some(action => action.message.includes('rejected-strong')));
    assert.ok(!review.actions.some(action => action.message.includes('candidate-4p-strong')));
});

runTest('review-rl-adoptions renderText/renderMarkdown は候補一覧を出力する', () => {
    const review = {
        updatedAt: '2026-04-21',
        minimumGames: 50,
        currentMain: 'main',
        candidates: [
            {
                id: 'main',
                score: 0.5,
                evalGames: 50,
                weak: 0.9,
                normal: 0.6,
                strong: 0.2,
                passRate: 0.03,
                style: 'style-a',
                targetDiagnostics: { pendingRate: 0.08, updateRate: 0.07, tvRate: 0.03, bcRate: 0.02, moverRate: 0.01 },
                recommended: true,
            },
        ],
        actions: [
            { type: 'reevaluate-main', message: 'needs more games', command: 'sh scripts/rl/eval-run.sh main 50 weak,normal,strong' },
        ],
    };
    const text = renderText(review);
    const markdown = renderMarkdown(review);
    assert.ok(text.includes('currentMain=main'));
    assert.ok(text.includes('reevaluate-main'));
    assert.ok(text.includes('target=p=8.0%'));
    assert.ok(markdown.includes('# RL Adoption Review'));
    assert.ok(markdown.includes('`main`'));
    assert.ok(markdown.includes('| id | score | games | weak | normal | strong | pass | style | target | recommended |'));
});
