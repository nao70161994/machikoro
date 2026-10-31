'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workflow = fs.readFileSync(
    path.join(__dirname, '../.github/workflows/rl-selfplay-training.yml'),
    'utf8'
);

assert.match(workflow, /workflow_dispatch:/);
assert.doesNotMatch(workflow, /^\s+(push|pull_request|schedule):/m);
assert.match(workflow, /options: \['2', '4'\]/);
assert.match(workflow, /options: \['20', '100', '500', '1000'\]/);
assert.match(workflow, /concurrency:/);
assert.match(workflow, /timeout-minutes: 300/);
assert.match(workflow, /--kill-after=45s 240m/);
assert.match(workflow, /--checkpoint-every 10/);
assert.match(workflow, /--load-checkpoint models\/rl_model\/runs\/imported\/model\.progress/);
assert.match(workflow, /test -s models\/rl_model\/runs\/imported\/model\.progress\.npz/);
assert.match(workflow, /diff -q models\/rl_model\/runs\/imported\/player_count\.txt/);
assert.match(workflow, /actions\/download-artifact@[a-f0-9]{40}/);
assert.match(workflow, /actions\/upload-artifact@[a-f0-9]{40}/);
assert.match(workflow, /retention-days: 30/);
assert.match(workflow, /if: \$\{\{ always\(\) \}\}/);
assert.match(workflow, /scripts\/rl\/run-self-only-h256-lr2e5-5000\.sh/);
assert.match(workflow, /scripts\/rl\/run-self-only-4p-h256-lr2e5-5000\.sh/);
assert.match(workflow, /--train-batch-size 1/);
assert.match(workflow, /scripts\/rl\/eval-run\.sh/);
assert.match(workflow, /scripts\/rl\/eval-run-4p\.sh/);
assert.doesNotMatch(workflow, /models\/rl_model\/portfolio\/.replace(/\//g, '\/'));

console.log('RL training workflow configuration: OK');
