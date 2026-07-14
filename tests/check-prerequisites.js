const { spawnSync } = require('child_process');

const result = spawnSync('python3', ['-c', 'import numpy; print(numpy.__version__)'], {
    encoding: 'utf8',
});
if (result.status !== 0) {
    console.error('npm test requires Python 3 and scripts/rl/requirements.txt.');
    console.error('Install with: python3 -m pip install -r scripts/rl/requirements.txt');
    if (result.error) console.error(result.error.message);
    else if (result.stderr) console.error(result.stderr.trim());
    process.exit(1);
}
console.log('Python RL prerequisite ok: numpy ' + result.stdout.trim());
