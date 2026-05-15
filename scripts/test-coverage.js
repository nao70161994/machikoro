const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

function toFilePath(url) {
    if (!url) return null;
    if (url.startsWith('file://')) {
        return decodeURIComponent(url.replace('file://', ''));
    }
    if (path.isAbsolute(url)) return url;
    return null;
}

function formatPct(hit, total) {
    if (!total) return '0.0';
    return ((hit / total) * 100).toFixed(1);
}

function collectCoverageFiles(dir) {
    const result = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            result.push(...collectCoverageFiles(fullPath));
        } else if (entry.isFile() && entry.name.endsWith('.json')) {
            result.push(fullPath);
        }
    }
    return result;
}

function summarizeScripts(resultSets, repoRoot) {
    const summaries = new Map();
    for (const script of resultSets) {
        const filePath = toFilePath(script.url);
        if (!filePath) continue;
        if (!filePath.startsWith(repoRoot)) continue;
        const relPath = path.relative(repoRoot, filePath);
        if (!/^((js|scripts)\/|server\.js$)/.test(relPath)) continue;
        if (!summaries.has(relPath)) {
            summaries.set(relPath, { functionsHit: 0, functionsTotal: 0, rangesHit: 0, rangesTotal: 0 });
        }
        const target = summaries.get(relPath);
        for (const fn of script.functions || []) {
            if (fn.functionName === '(empty)') continue;
            target.functionsTotal++;
            if ((fn.ranges || []).some(range => range.count > 0)) target.functionsHit++;
            for (const range of fn.ranges || []) {
                target.rangesTotal++;
                if (range.count > 0) target.rangesHit++;
            }
        }
    }
    return [...summaries.entries()]
        .map(([file, stats]) => ({
            file,
            functionPct: formatPct(stats.functionsHit, stats.functionsTotal),
            rangePct: formatPct(stats.rangesHit, stats.rangesTotal),
            functionsHit: stats.functionsHit,
            functionsTotal: stats.functionsTotal,
            rangesHit: stats.rangesHit,
            rangesTotal: stats.rangesTotal,
        }))
        .sort((a, b) =>
            filePriority(a.file) - filePriority(b.file) ||
            Number(a.functionPct) - Number(b.functionPct) ||
            a.file.localeCompare(b.file, 'ja')
        );
}

function filePriority(file) {
    if (file.startsWith('js/')) return 0;
    if (file === 'server.js') return 1;
    return 2;
}

function main() {
    const repoRoot = path.join(__dirname, '..');
    const coverageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'machikoro-v8-coverage-'));
    try {
        const result = spawnSync(process.execPath, [path.join(repoRoot, 'tests', 'run-all.js'), 'all'], {
            cwd: repoRoot,
            stdio: 'inherit',
            env: {
                ...process.env,
                NODE_V8_COVERAGE: coverageDir,
            },
        });
        if (result.status !== 0) {
            process.exitCode = result.status || 1;
            return;
        }

        const files = collectCoverageFiles(coverageDir);
        const results = files.flatMap(file => {
            try {
                const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
                return parsed.result || [];
            } catch (error) {
                return [];
            }
        });
        const summary = summarizeScripts(results, repoRoot);

        console.log('\n[coverage]');
        for (const entry of summary) {
            console.log(
                `${entry.file} functions ${entry.functionPct}% (${entry.functionsHit}/${entry.functionsTotal}) ` +
                `ranges ${entry.rangePct}% (${entry.rangesHit}/${entry.rangesTotal})`
            );
        }
        if (!summary.some(entry => entry.file.startsWith('js/'))) {
            console.log('note: js/*.js の V8 coverage は今回の実行では取得できませんでした');
        }
    } finally {
        fs.rmSync(coverageDir, { recursive: true, force: true });
    }
}

main();
