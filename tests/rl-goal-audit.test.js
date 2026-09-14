'use strict';

const assert = require('assert');
const fs = require('fs');

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
        if (!/^[A-Za-z0-9_.\/-]+$/.test(evidence)) continue;
        assert.ok(fs.existsSync(evidence), `missing evidence: ${evidence}`);
    }
}

assert.strictEqual(audit.adoption.seed415, 'candidate');
assert.strictEqual(audit.adoption.seed71Rank1, 'not-adopted');
console.log('テスト成功: RL goal audit JSONは要件・証拠・採用判断の契約を満たす');
