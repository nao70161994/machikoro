'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const repoRoot = path.resolve(__dirname, '..');
const trackedFiles = execFileSync('git', ['ls-files', '-z'], { cwd: repoRoot, encoding: 'utf8' }).split('\0');

const audit = require('../docs/RL_CPU_GOAL_AUDIT.json');

assert.strictEqual(audit.schemaVersion, 1);
assert.ok(Array.isArray(audit.requirements));
assert.strictEqual(audit.requirements.length, 14);

const ids = new Set();
for (const requirement of audit.requirements) {
    assert.ok(requirement.id && !ids.has(requirement.id), `duplicate audit id: ${requirement.id}`);
    ids.add(requirement.id);
    assert.ok(requirement.status, `missing status: ${requirement.id}`);
    for (const evidence of requirement.evidence || []) {
        assert.ok(/^[A-Za-z0-9_.\/-]+$/.test(evidence), `invalid evidence path: ${evidence}`);
        assert.ok(fs.existsSync(path.join(repoRoot, evidence)), `missing evidence: ${evidence}`);
        assert.ok(trackedFiles.some(file => file === evidence || (evidence.endsWith('/') && file.startsWith(evidence))),
            `evidence unavailable in a new clone: ${evidence}`);
    }
}

assert.strictEqual(audit.adoption.seed415, 'candidate');
assert.strictEqual(audit.adoption.seed71Rank1, 'not-adopted');
console.log('テスト成功: RL goal audit JSONは要件・証拠・採用判断の契約を満たす');

const requirements = new Map(audit.requirements.map(item => [item.id, item]));
assert.strictEqual(requirements.get('strategy-plan').status, 'planned');
assert.strictEqual(requirements.get('special-pending-fixtures').status, 'partial');
assert.strictEqual(requirements.get('candidate-gates').status, 'partial');
assert.strictEqual(requirements.get('full-regression').status, 'unverified');
assert.strictEqual(requirements.get('critical-high-medium').status, 'unverified');
