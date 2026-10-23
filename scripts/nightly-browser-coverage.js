'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// Playwright's own discovered IDs include the project and parameterized title.
// Never maintain a second hand-written list of nightly specs.
function collectTests(report, requireResults = false) {
    if (report.errors?.length) throw new Error('Playwright discovery/runtime errors: ' + JSON.stringify(report.errors));
    const tests = [];
    function visit(suite) {
        for (const spec of suite.specs || []) {
            for (const test of spec.tests || []) {
                const id = `${test.projectName}:${spec.id}`;
                if (!spec.id || !test.projectName) throw new Error('Missing Playwright test identity');
                if (requireResults && (!test.results?.length ||
                    test.results[test.results.length - 1].status === 'interrupted')) {
                    throw new Error('Test was selected but never executed to completion: ' + id);
                }
                tests.push({ id, project: test.projectName, file: spec.file, title: spec.title, expectedStatus: test.expectedStatus || 'passed',
                    optInSkipAllowed: spec.file === 'ui-playthrough.spec.js' &&
                        spec.title === '人間席の実UI操作とCPU弱で開始から結果まで進める' &&
                        test.projectName === 'mobile-webkit' && process.env.RUN_UI_PLAYTHROUGH !== '1',
                    annotations: test.annotations || [],
                    outcomes: (test.results || []).map(result => result.status) });
            }
        }
        for (const child of suite.suites || []) visit(child);
    }
    for (const suite of report.suites || []) visit(suite);
    return tests;
}

function assertSameTests(expected, actual) {
    const expectedIds = new Set(expected.map(test => test.id));
    if (!expectedIds.size) throw new Error('Empty browser inventory');
    if (expectedIds.size !== expected.length) throw new Error('Duplicate test in full inventory');
    const actualIds = new Set();
    for (const test of actual) {
        if (actualIds.has(test.id)) throw new Error('Duplicate test across shards: ' + test.id);
        actualIds.add(test.id);
    }
    const missing = [...expectedIds].filter(id => !actualIds.has(id));
    const extra = [...actualIds].filter(id => !expectedIds.has(id));
    if (missing.length || extra.length) throw new Error(JSON.stringify({ missing, extra }));
}

function createPlan(fullReport, shardReports) {
    const all = collectTests(fullReport);
    const shards = shardReports.map(report => collectTests(report));
    assertSameTests(all, shards.flat());
    if (shards.some(tests => !tests.length)) throw new Error('Empty shard');
    return { version: 1, total: all.length, all, shards };
}

function verifyReports(plan, reports, shard) {
    const expected = shard ? plan.shards[shard - 1] : plan.all;
    if (!expected) throw new Error('Unknown shard: ' + shard);
    const actual = reports.flatMap(report => collectTests(report, true));
    assertSameTests(expected, actual);
    const expectedById = new Map(expected.map(test => [test.id, test]));
    for (const test of actual) {
        if (test.outcomes.every(status => status === 'skipped') && expectedById.get(test.id).expectedStatus !== 'skipped' &&
            !(expectedById.get(test.id).optInSkipAllowed &&
                test.annotations.some(annotation => annotation.type === 'skip' && annotation.description === '任意実行のUI対局'))) {
            throw new Error('Unexpectedly skipped test: ' + test.id);
        }
    }
    return { skipped: actual.filter(test => test.outcomes.every(status => status === 'skipped')).length, total: actual.length, projects: Object.fromEntries([...new Set(actual.map(test => test.project))]
        .map(project => [project, actual.filter(test => test.project === project).length])),
        tests: actual };
}

function discover(shard) {
    const cli = require.resolve('@playwright/test/cli');
    const args = [cli, 'test', '--list', '--reporter=json', '--workers=1'];
    if (shard) args.push('--shard=' + shard);
    const result = spawnSync(process.execPath, args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
        env: { ...process.env, CI: 'true' } });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(result.stderr || result.stdout);
    return JSON.parse(result.stdout);
}

function main(argv = process.argv.slice(2)) {
    const [command, ...flags] = argv;
    const values = Object.fromEntries(flags.map(flag => flag.replace(/^--/, '').split('=')));
    if (command === 'plan') {
        const count = Number(values.shards);
        if (!Number.isInteger(count) || count < 2) throw new Error('--shards must be an integer >= 2');
        const plan = createPlan(discover(), Array.from({ length: count }, (_, index) => discover(`${index + 1}/${count}`)));
        plan.environment = { revision: process.env.GITHUB_SHA || '',
            node: process.version, playwright: require('@playwright/test/package.json').version,
            configSha256: require('crypto').createHash('sha256').update(fs.readFileSync('playwright.config.js')).digest('hex'),
            uiPlaythrough: process.env.RUN_UI_PLAYTHROUGH === '1' };
        fs.mkdirSync(path.dirname(values.output), { recursive: true });
        fs.writeFileSync(values.output, JSON.stringify(plan, null, 2) + '\n');
        console.log(`Nightly inventory: ${plan.total} tests; shards: ${plan.shards.map(tests => tests.length).join(', ')}`);
    } else if (command === 'verify') {
        const plan = JSON.parse(fs.readFileSync(values.plan, 'utf8'));
        const files = values.shard ? [values.report] : Array.from({ length: plan.shards.length }, (_, index) =>
            path.join(values.report, `report-${index + 1}.json`));
        const summary = verifyReports(plan, files.map(file => JSON.parse(fs.readFileSync(file, 'utf8'))), Number(values.shard) || undefined);
        if (values.output) fs.writeFileSync(values.output, JSON.stringify(summary, null, 2) + '\n');
        console.log(`Nightly execution coverage: ${summary.total} tests; ${JSON.stringify(summary.projects)}`);
    } else throw new Error('Expected plan or verify');
}

if (require.main === module) main();
module.exports = { collectTests, assertSameTests, createPlan, verifyReports };
