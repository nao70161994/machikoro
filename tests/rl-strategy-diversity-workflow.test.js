'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const yaml = fs.readFileSync(
    path.join(__dirname, '../.github/workflows/rl-strategy-diversity-training.yml'), 'utf8'
);
assert.match(yaml, /workflow_dispatch:/);
assert.ok(!yaml.includes('schedule:'));
assert.ok(!yaml.includes('push:'));
assert.match(yaml, /max-parallel: 3/);
for (const strategy of ['landmark', 'economy', 'interaction', 'harbor', 'four-engine', 'four-interaction']) {
    assert.ok(yaml.includes('kind: ' + strategy), 'missing strategy ' + strategy);
}
for (const flag of [
    '--train-opponents self=1', '--self-learn-both-sides', '--reward-interaction-build',
    '--reward-harbor-build', '--reward-engine-build', '--reward-landmark',
    '--checkpoint-every 25', '--eval-every 250', '--player-count 4',
    '--model-paths', '--paired-seats', 'actions/upload-artifact@',
    'if: ${{ always() }}',
]) {
    assert.ok(yaml.includes(flag), 'missing training or evaluation guard: ' + flag);
}
assert.ok(!yaml.includes('models/rl_model/portfolio/'), 'candidate must not overwrite adopted models');
console.log('RL strategy-diversity training workflow: OK');
