'use strict';
const assert = require('assert');
const { createPlan, verifyReports } = require('../scripts/nightly-browser-coverage');
const { runTest } = require('./helpers/test-utils');
function report(ids, executed = false, project = 'mobile-webkit') {
    return { suites: [{ suites: [{ specs: ids.map(id => ({ id, file: 'example.spec.js', title: id,
        tests: [{ projectName: project, results: executed ? [{ status: 'passed' }] : [] }] })) }] }] };
}
runTest('nightly coverage uses all discovered projects and verifies every execution', () => {
    const full = { suites: [...report(['a', 'b']).suites, ...report(['c'], false, 'chromium-desktop').suites] };
    const plan = createPlan(full, [report(['a', 'b']), report(['c'], false, 'chromium-desktop')]);
    assert.strictEqual(plan.total, 3);
    assert.strictEqual(verifyReports(plan, [report(['a', 'b'], true), report(['c'], true, 'chromium-desktop')]).total, 3);
    assert.strictEqual(verifyReports(plan, [report(['a', 'b'], true)], 1).total, 2);
});
runTest('nightly coverage rejects omission duplication unexpected or never-executed tests', () => {
    assert.throws(() => createPlan(report(['a', 'b']), [report(['a']), report(['a'])]), /Duplicate/);
    assert.throws(() => createPlan(report(['a', 'b']), [report(['a'])]), /missing/);
    assert.throws(() => createPlan(report(['a']), [report(['a', 'x'])]), /extra/);
    const plan = createPlan(report(['a', 'b']), [report(['a']), report(['b'])]);
    assert.throws(() => verifyReports(plan, [report(['a', 'b'])]), /never executed/);
    assert.throws(() => verifyReports(plan, [report(['a'], true)]), /missing/);
    const interrupted = report(['a', 'b'], true);
    interrupted.suites[0].suites[0].specs[0].tests[0].results = [{ status: 'interrupted' }];
    assert.throws(() => verifyReports(plan, [interrupted]), /never executed to completion/);
    const skipped = report(['a', 'b'], true);
    skipped.suites[0].suites[0].specs[0].tests[0].results = [{ status: 'skipped' }];
    assert.throws(() => verifyReports(plan, [skipped]), /Unexpectedly skipped/);
    assert.throws(() => verifyReports(plan, [{ errors: [{ message: 'worker crash' }], suites: [] }]), /runtime errors/);
});


runTest('nightly coverage rejects interrupted final retry but accepts completed retry', () => {
    const plan = createPlan(report(['a']), [report(['a'])]);
    const retried = report(['a'], true);
    const test = retried.suites[0].suites[0].specs[0].tests[0];
    test.results = [{ status: 'failed' }, { status: 'interrupted' }];
    assert.throws(() => verifyReports(plan, [retried]), /never executed to completion/);
    test.results = [{ status: 'failed' }, { status: 'passed' }];
    assert.strictEqual(verifyReports(plan, [retried]).total, 1);
});

runTest('optional UI skip is restricted to the original title project and annotation', () => {
    const previous = process.env.RUN_UI_PLAYTHROUGH;
    delete process.env.RUN_UI_PLAYTHROUGH;
    try {
        function optional(project = 'mobile-webkit', title = '人間席の実UI操作とCPU弱で開始から結果まで進める') {
            const value = report(['opt-in'], false, project);
            const spec = value.suites[0].suites[0].specs[0];
            spec.file = 'ui-playthrough.spec.js';
            spec.title = title;
            return value;
        }
        function skipped(value, reason = '任意実行のUI対局') {
            const result = JSON.parse(JSON.stringify(value));
            const test = result.suites[0].suites[0].specs[0].tests[0];
            test.results = [{ status: 'skipped' }];
            test.annotations = [{ type: 'skip', description: reason }];
            return result;
        }
        const original = optional();
        const plan = createPlan(original, [original]);
        assert.strictEqual(verifyReports(plan, [skipped(original)]).skipped, 1);
        assert.throws(() => verifyReports(plan, [skipped(original, '別の理由')]), /Unexpectedly skipped/);
        for (const other of [optional('chromium-desktop'), optional('mobile-webkit', '新しい同ファイルのテスト')]) {
            assert.throws(() => verifyReports(createPlan(other, [other]), [skipped(other)]), /Unexpectedly skipped/);
        }
        process.env.RUN_UI_PLAYTHROUGH = '1';
        assert.throws(() => verifyReports(createPlan(original, [original]), [skipped(original)]), /Unexpectedly skipped/);
    } finally {
        if (previous === undefined) delete process.env.RUN_UI_PLAYTHROUGH;
        else process.env.RUN_UI_PLAYTHROUGH = previous;
    }
});

runTest('browser workflows share the exact package-matched preinstalled runtime without apt installation', () => {
    const fs = require('fs');
    const { EXPECTED_VERSION, EXPECTED_IMAGE, checkContainer } = require('../scripts/check-playwright-container');
    assert.strictEqual(require('../package.json').devDependencies['@playwright/test'], EXPECTED_VERSION);
    for (const [file, count] of [['nightly-release-test.yml', 1], ['release-test.yml', 1], ['plaza-visual-review.yml', 2]]) {
        const source = fs.readFileSync(require('path').join(__dirname, '../.github/workflows', file), 'utf8');
        assert.strictEqual(source.split('image: ' + EXPECTED_IMAGE).length - 1, count, file);
        assert.strictEqual(source.split('node scripts/check-playwright-container.js').length - 1, count, file);
        assert.strictEqual(source.split('options: --ipc=host --init').length - 1, count, file);
        assert.ok(!source.includes('playwright install --with-deps'), file);
    }
    const paths = ['/ms-playwright/chromium/browser', '/ms-playwright/webkit/pw_run.sh'];
    assert.doesNotThrow(() => checkContainer(EXPECTED_VERSION, paths, () => true));
    assert.throws(() => checkContainer('0.0.0', paths, () => true), /does not match/);
    assert.throws(() => checkContainer(EXPECTED_VERSION, paths, () => false), /Missing preinstalled/);
    assert.throws(() => checkContainer(EXPECTED_VERSION, ['/tmp/chromium', paths[1]], () => true), /Missing preinstalled/);
});
