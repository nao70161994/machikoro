'use strict';

// Observe a diagnostic browser run without changing its assertions, clocks,
// exit status, or worker count. Missing Linux counters are recorded as null.
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');

async function main() {
    const args = process.argv.slice(2);
    const separator = args.indexOf('--');
    if (separator !== 1 || !args[0].startsWith('--output=') || !args[2]) {
        throw new Error('Usage: node run-browser-with-resources.js --output=FILE -- COMMAND [ARGS]');
    }
    const output = args[0].slice('--output='.length);
    await fs.mkdir(path.dirname(output), { recursive: true });
    const file = await fs.open(output, 'w');
    const read = name => fs.readFile(name, 'utf8').catch(() => null);
    let pending = null;
    const sample = () => {
        if (pending) return pending;
        pending = (async () => {
            const startedAt = Date.now();
            const [cpuPressure, memoryPressure, cpuStat, memoryEvents, memoryCurrent, memInfo] = await Promise.all([
                read('/proc/pressure/cpu'), read('/proc/pressure/memory'),
                read('/sys/fs/cgroup/cpu.stat'), read('/sys/fs/cgroup/memory.events'),
                read('/sys/fs/cgroup/memory.current'), read('/proc/meminfo'),
            ]);
            await file.write(JSON.stringify({ startedAt, finishedAt: Date.now(), load: os.loadavg(),
                cpuPressure, memoryPressure, cpuStat, memoryEvents, memoryCurrent,
                memory: memInfo?.split('\n').filter(line => /^(MemAvailable|SwapTotal|SwapFree):/.test(line)).join('\n') ?? null,
            }) + '\n');
        })().finally(() => { pending = null; });
        return pending;
    };
    let samplerError = null;
    let interval = null;
    try {
        await file.write(JSON.stringify({ kind: 'environment', at: Date.now(),
            cpuMax: await read('/sys/fs/cgroup/cpu.max'),
            cpuset: await read('/sys/fs/cgroup/cpuset.cpus.effective'),
        }) + '\n');
        await sample();
        const processGroup = process.platform !== 'win32';
        const child = spawn(args[2], args.slice(3), { stdio: 'inherit', detached: processGroup });
        const forward = signal => {
            try {
                if (processGroup && child.pid) process.kill(-child.pid, signal);
                else child.kill(signal);
            } catch (error) { if (error.code !== 'ESRCH') throw error; }
        };
        const onTerm = () => forward('SIGTERM');
        const onInterrupt = () => forward('SIGINT');
        process.on('SIGTERM', onTerm);
        process.on('SIGINT', onInterrupt);
        interval = setInterval(() => {
            // At most one small filesystem sample is in flight at a time.
            if (!samplerError) sample().catch(error => { samplerError = error; });
        }, 500);
        const code = await new Promise(resolve => {
            child.once('error', error => { console.error(error.message); resolve(1); });
            child.once('close', (status, signal) => resolve(status ?? (signal === 'SIGINT' ? 130 : signal === 'SIGTERM' ? 143 : 1)));
        });
        process.removeListener('SIGTERM', onTerm);
        process.removeListener('SIGINT', onInterrupt);
        process.exitCode = code;
    } finally {
        if (interval) clearInterval(interval);
        try { if (pending) await pending; }
        finally { await file.close(); }
    }
    if (samplerError) throw samplerError;
}

main().catch(error => {
    console.error(`Browser resource diagnostic: ${error.message}`);
    // An observational sampling failure must not replace the command result.
    if (process.exitCode === undefined) process.exitCode = 1;
});
