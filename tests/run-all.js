const { spawnSync } = require('child_process');
const path = require('path');

const testFiles = [
    'gamemanager.test.js',
    'server.test.js',
    'cpu.test.js',
    'online.test.js',
    'main.test.js',
];

let failed = false;

for (const file of testFiles) {
    const result = spawnSync(process.execPath, [path.join(__dirname, file)], {
        stdio: 'inherit',
    });
    if (result.status !== 0) {
        failed = true;
    }
}

if (failed) {
    process.exit(1);
}
