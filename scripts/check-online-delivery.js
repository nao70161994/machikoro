const http = require('http');
const https = require('https');
const { spawn } = require('child_process');

const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_LOCAL_PORT = 3123;

function parseArgs(argv = process.argv.slice(2)) {
    const options = {
        origin: '',
        port: DEFAULT_LOCAL_PORT,
        timeoutMs: DEFAULT_TIMEOUT_MS,
        startServer: true,
    };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--origin') {
            options.origin = String(argv[++i] || '').replace(/\/+$/, '');
            options.startServer = false;
        } else if (arg.startsWith('--origin=')) {
            options.origin = arg.slice('--origin='.length).replace(/\/+$/, '');
            options.startServer = false;
        } else if (arg === '--port') {
            options.port = Number(argv[++i]) || DEFAULT_LOCAL_PORT;
        } else if (arg.startsWith('--port=')) {
            options.port = Number(arg.slice('--port='.length)) || DEFAULT_LOCAL_PORT;
        } else if (arg === '--timeout-ms') {
            options.timeoutMs = Number(argv[++i]) || DEFAULT_TIMEOUT_MS;
        } else if (arg.startsWith('--timeout-ms=')) {
            options.timeoutMs = Number(arg.slice('--timeout-ms='.length)) || DEFAULT_TIMEOUT_MS;
        } else if (arg === '--no-start') {
            options.startServer = false;
        }
    }
    if (!options.origin) options.origin = 'http://127.0.0.1:' + options.port;
    return options;
}

function requestUrl(url, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const target = new URL(url);
    const client = target.protocol === 'https:' ? https : http;
    return new Promise((resolve, reject) => {
        const req = client.request(target, { method: 'GET', timeout: timeoutMs }, (res) => {
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => {
                resolve({
                    url,
                    status: res.statusCode,
                    headers: res.headers,
                    body: Buffer.concat(chunks).toString('utf8'),
                });
            });
        });
        req.on('timeout', () => {
            req.destroy(new Error('timeout after ' + timeoutMs + 'ms: ' + url));
        });
        req.on('error', reject);
        req.end();
    });
}

async function waitForOrigin(origin, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const start = Date.now();
    let lastError = null;
    while (Date.now() - start < timeoutMs) {
        try {
            const response = await requestUrl(origin + '/api/version', Math.min(1000, timeoutMs));
            if (response.status === 200) return response;
        } catch (error) {
            lastError = error;
        }
        await new Promise(resolve => setTimeout(resolve, 200));
    }
    throw lastError || new Error('server did not become ready: ' + origin);
}

function assertOkResponse(response, label) {
    if (!response || response.status < 200 || response.status >= 300) {
        throw new Error(label + ' returned status ' + (response ? response.status : 'none'));
    }
}

function assertHeaderIncludes(response, headerName, expected, label) {
    const value = String(response.headers[headerName.toLowerCase()] || '');
    if (!value.includes(expected)) {
        throw new Error(label + ' missing ' + headerName + ': expected ' + expected + ', got ' + (value || '(empty)'));
    }
}

async function checkOnlineDelivery(origin, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const results = {};
    results.version = await requestUrl(origin + '/api/version', timeoutMs);
    assertOkResponse(results.version, '/api/version');
    assertHeaderIncludes(results.version, 'cache-control', 'no-store', '/api/version');
    const versionJson = JSON.parse(results.version.body);
    if (!versionJson || typeof versionJson.hash !== 'string' || !versionJson.hash) {
        throw new Error('/api/version did not return a non-empty hash');
    }

    results.socketIo = await requestUrl(origin + '/socket.io/socket.io.js', timeoutMs);
    assertOkResponse(results.socketIo, '/socket.io/socket.io.js');
    if (!/io|socket\.io/i.test(results.socketIo.body)) {
        throw new Error('/socket.io/socket.io.js did not look like a Socket.IO client script');
    }

    results.index = await requestUrl(origin + '/', timeoutMs);
    assertOkResponse(results.index, '/');
    if (!results.index.body.includes('/socket.io/socket.io.js')) {
        throw new Error('index.html does not load /socket.io/socket.io.js from same origin');
    }
    if (!results.index.body.includes(versionJson.hash)) {
        throw new Error('index.html does not include the current server build hash');
    }

    results.serviceWorker = await requestUrl(origin + '/sw.js', timeoutMs);
    assertOkResponse(results.serviceWorker, '/sw.js');
    assertHeaderIncludes(results.serviceWorker, 'cache-control', 'no-store', '/sw.js');
    if (!results.serviceWorker.body.includes('machikoro-' + versionJson.hash)) {
        throw new Error('sw.js cache name does not include the current server build hash');
    }

    return {
        origin,
        hash: versionJson.hash,
        checks: Object.fromEntries(Object.entries(results).map(([key, value]) => [key, value.status])),
    };
}

function startLocalServer(port) {
    const child = spawn(process.execPath, ['server.js'], {
        cwd: process.cwd(),
        env: Object.assign({}, process.env, { PORT: String(port) }),
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk.toString(); });
    child.stderr.on('data', chunk => { output += chunk.toString(); });
    return {
        child,
        output: () => output,
        stop: () => new Promise((resolve) => {
            if (child.exitCode !== null || child.signalCode !== null) {
                resolve();
                return;
            }
            child.once('exit', () => resolve());
            child.kill('SIGTERM');
            setTimeout(() => {
                if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
            }, 1000);
        }),
    };
}

async function main() {
    const options = parseArgs();
    let serverProcess = null;
    try {
        if (options.startServer) {
            serverProcess = startLocalServer(options.port);
            await waitForOrigin(options.origin, options.timeoutMs);
        }
        const result = await checkOnlineDelivery(options.origin, options.timeoutMs);
        console.log('online delivery ok: ' + result.origin + ' hash=' + result.hash);
        for (const [name, status] of Object.entries(result.checks)) {
            console.log('- ' + name + ': ' + status);
        }
    } finally {
        if (serverProcess) await serverProcess.stop();
    }
}

if (require.main === module) {
    main().catch(error => {
        console.error('online delivery check failed: ' + error.message);
        process.exit(1);
    });
}

module.exports = {
    parseArgs,
    requestUrl,
    waitForOrigin,
    assertOkResponse,
    assertHeaderIncludes,
    checkOnlineDelivery,
    startLocalServer,
};
