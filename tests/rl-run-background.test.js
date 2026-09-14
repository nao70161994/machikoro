'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { runTest } = require('./helpers/test-utils');

const SCRIPT_PATH = path.join(__dirname, '..', 'scripts', 'rl', 'run-background.sh');
const STATUS_SCRIPT_PATH = path.join(__dirname, '..', 'scripts', 'rl', 'bg-status.sh');

runTest('run-background はshell wrapperではなくpython3 train processのPIDだけを選ぶ', () => {
    const source = fs.readFileSync(SCRIPT_PATH, 'utf8');
    assert.ok(source.includes('ps -eo pid=,comm=,args='));
    assert.ok(source.includes('$2 == "python3"'));
    assert.ok(source.includes('index($0, "-m scripts.rl.train")'));
    assert.ok(source.includes('index($0, job)'));
    assert.ok(!source.includes('ps -ef | grep "python3 -m scripts.rl.train"'));
});

runTest('bg-status はpython processの生存時間・CPU・log経過を報告する', () => {
    const source = fs.readFileSync(STATUS_SCRIPT_PATH, 'utf8');
    assert.ok(source.includes('ps -eo pid=,comm=,etime=,time=,pcpu=,args='));
    assert.ok(source.includes('$2 == "python3"'));
    assert.ok(source.includes('elapsed='));
    assert.ok(source.includes('cpu_time='));
    assert.ok(source.includes('cpu_percent='));
    assert.ok(source.includes('log_age_seconds='));
    assert.ok(source.includes('STATE="failed"'));
    assert.ok(source.includes('STATE="done"'));
});
