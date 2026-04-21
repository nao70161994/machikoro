const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
    let csvPath = path.join(__dirname, '..', 'models', 'rl_model', 'train_metrics.csv');
    let format = 'text';
    let opponents = ['strong', 'expert'];
    let weights = {};
    let drawPenalty = 0.25;
    let exhaustedPenalty = 0.01;
    let runLabel = '';
    let baselineRun = '';
    let outputPath = '';
    let runIndexCsvPath = '';
    let configIndexCsvPath = '';

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--csv') csvPath = argv[++i] || csvPath;
        else if (arg === '--format') format = argv[++i] || 'text';
        else if (arg === '--opponents') opponents = (argv[++i] || 'strong,expert').split(',').filter(Boolean);
        else if (arg === '--weights') weights = parseWeights(argv[++i] || '');
        else if (arg === '--draw-penalty') drawPenalty = Number(argv[++i] || '0.25');
        else if (arg === '--exhausted-penalty') exhaustedPenalty = Number(argv[++i] || '0.01');
        else if (arg === '--run-label') runLabel = argv[++i] || '';
        else if (arg === '--baseline-run') baselineRun = argv[++i] || '';
        else if (arg === '--output') outputPath = argv[++i] || '';
        else if (arg === '--run-index-csv') runIndexCsvPath = argv[++i] || '';
        else if (arg === '--config-index-csv') configIndexCsvPath = argv[++i] || '';
    }

    return { csvPath, format, opponents, weights, drawPenalty, exhaustedPenalty, runLabel, baselineRun, outputPath, runIndexCsvPath, configIndexCsvPath };
}

function parseWeights(text) {
    const weights = {};
    for (const part of (text || '').split(',')) {
        if (!part) continue;
        const [key, value] = part.split('=');
        const parsed = Number(value);
        if (key && Number.isFinite(parsed)) {
            weights[key] = parsed;
        }
    }
    return weights;
}

function parseCsvLine(line) {
    const values = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuotes) {
            if (ch === '"' && line[i + 1] === '"') {
                current += '"';
                i++;
            } else if (ch === '"') {
                inQuotes = false;
            } else {
                current += ch;
            }
        } else if (ch === ',') {
            values.push(current);
            current = '';
        } else if (ch === '"') {
            inQuotes = true;
        } else {
            current += ch;
        }
    }
    values.push(current);
    return values;
}

function loadMetrics(csvPath) {
    const body = fs.readFileSync(csvPath, 'utf8').trim();
    if (!body) return [];
    const lines = body.split('\n');
    const header = parseCsvLine(lines[0]);
    return lines.slice(1).filter(Boolean).map(line => {
        const values = parseCsvLine(line);
        const row = {};
        for (let i = 0; i < header.length; i++) {
            row[header[i]] = values[i] ?? '';
        }
        return row;
    });
}

function toNumber(value) {
    if (value === '' || value == null) return null;
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
}

function summarizeMetrics(rows, options = {}) {
    const opponents = (options.opponents || ['strong', 'expert']).slice();
    const weights = options.weights || {};
    const drawPenalty = Number.isFinite(options.drawPenalty) ? options.drawPenalty : 0.25;
    const exhaustedPenalty = Number.isFinite(options.exhaustedPenalty) ? options.exhaustedPenalty : 0.01;
    const jsRows = rows
        .filter(row => !options.runLabel || row.run_label === options.runLabel)
        .filter(row => row.js_opponent && opponents.includes(row.js_opponent))
        .map(row => ({
            game: toNumber(row.game),
            runLabel: row.run_label || '',
            hidden: toNumber(row.hidden),
            lr: toNumber(row.lr),
            evalEvery: toNumber(row.eval_every),
            jsEvalGames: toNumber(row.js_eval_games),
            jsEvalOpponents: row.js_eval_opponents || '',
            jsOpponent: row.js_opponent,
            jsWinRate: toNumber(row.js_win_rate) || 0,
            jsFirstRate: toNumber(row.js_first_rate) || 0,
            jsSecondRate: toNumber(row.js_second_rate) || 0,
            jsDrawRate: toNumber(row.js_draw_rate) || 0,
            jsExhausted: toNumber(row.js_exhausted) || 0,
            jsAvgTurns: toNumber(row.js_avg_turns) || 0,
            rnd: toNumber(row.rnd),
            train: toNumber(row.train),
            targetPendingRate: toNumber(row.target_pending_rate),
            targetUpdateRate: toNumber(row.target_update_rate),
            tvTargetRate: toNumber(row.tv_target_rate),
            bcTargetRate: toNumber(row.bc_target_rate),
            moverTargetRate: toNumber(row.mover_target_rate),
        }));

    const byOpponent = Object.fromEntries(opponents.map(opponent => [opponent, []]));
    for (const row of jsRows) {
        byOpponent[row.jsOpponent].push(row);
    }

    const bestByOpponent = {};
    for (const opponent of opponents) {
        const rowsForOpponent = byOpponent[opponent] || [];
        bestByOpponent[opponent] = rowsForOpponent.sort((a, b) =>
            b.jsWinRate - a.jsWinRate ||
            a.jsExhausted - b.jsExhausted ||
            a.jsAvgTurns - b.jsAvgTurns ||
            a.game - b.game
        )[0] || null;
    }

    const grouped = new Map();
    for (const row of jsRows) {
        const entry = grouped.get(row.game) || {
            game: row.game,
            runLabel: row.runLabel,
            hidden: row.hidden,
            lr: row.lr,
            evalEvery: row.evalEvery,
            jsEvalGames: row.jsEvalGames,
            jsEvalOpponents: row.jsEvalOpponents,
            opponents: {},
            rnd: row.rnd,
            train: row.train,
            targetPendingRate: row.targetPendingRate,
            targetUpdateRate: row.targetUpdateRate,
            tvTargetRate: row.tvTargetRate,
            bcTargetRate: row.bcTargetRate,
            moverTargetRate: row.moverTargetRate,
        };
        entry.opponents[row.jsOpponent] = row;
        grouped.set(row.game, entry);
    }

    const combined = [...grouped.values()].map(entry => {
        let score = 0;
        let totalWeight = 0;
        for (const opponent of opponents) {
            const row = entry.opponents[opponent];
            if (!row) continue;
            const weight = Number.isFinite(weights[opponent]) ? weights[opponent] : 1;
            score += (row.jsWinRate - row.jsDrawRate * drawPenalty - row.jsExhausted * exhaustedPenalty) * weight;
            totalWeight += weight;
        }
        return {
            game: entry.game,
            score: totalWeight > 0 ? score / totalWeight : -Infinity,
            opponents: entry.opponents,
            runLabel: entry.runLabel,
            hidden: entry.hidden,
            lr: entry.lr,
            evalEvery: entry.evalEvery,
            jsEvalGames: entry.jsEvalGames,
            jsEvalOpponents: entry.jsEvalOpponents,
            rnd: entry.rnd,
            train: entry.train,
            targetPendingRate: entry.targetPendingRate,
            targetUpdateRate: entry.targetUpdateRate,
            tvTargetRate: entry.tvTargetRate,
            bcTargetRate: entry.bcTargetRate,
            moverTargetRate: entry.moverTargetRate,
        };
    }).sort((a, b) =>
        b.score - a.score ||
        a.game - b.game
    );

    const groupedByRun = new Map();
    for (const entry of combined) {
        const runKey = entry.runLabel || '(unlabeled)';
        const existing = groupedByRun.get(runKey);
        if (
            !existing ||
            entry.score > existing.score ||
            (entry.score === existing.score && entry.game < existing.game)
        ) {
            groupedByRun.set(runKey, entry);
        }
    }
    const bestRuns = [...groupedByRun.entries()]
        .map(([runLabel, entry]) => ({
            runLabel,
            game: entry.game,
            score: entry.score,
            hidden: entry.hidden,
            lr: entry.lr,
            evalEvery: entry.evalEvery,
            jsEvalGames: entry.jsEvalGames,
            jsEvalOpponents: entry.jsEvalOpponents,
            rnd: entry.rnd,
            train: entry.train,
            targetPendingRate: entry.targetPendingRate,
            targetUpdateRate: entry.targetUpdateRate,
            tvTargetRate: entry.tvTargetRate,
            bcTargetRate: entry.bcTargetRate,
            moverTargetRate: entry.moverTargetRate,
        }))
        .sort((a, b) =>
            b.score - a.score ||
            a.game - b.game ||
            a.runLabel.localeCompare(b.runLabel)
        );
    const runIndex = bestRuns.map((run, index) => ({
        rank: index + 1,
        runLabel: run.runLabel,
        game: run.game,
        score: run.score,
        hidden: run.hidden,
        lr: run.lr,
    }));

    const groupedByConfig = new Map();
    for (const run of bestRuns) {
        const key = `hidden=${run.hidden ?? 'n/a'} lr=${run.lr ?? 'n/a'}`;
        const existing = groupedByConfig.get(key);
        if (
            !existing ||
            run.score > existing.score ||
            (run.score === existing.score && run.game < existing.game)
        ) {
            groupedByConfig.set(key, {
                configKey: key,
                hidden: run.hidden,
                lr: run.lr,
                runLabel: run.runLabel,
                game: run.game,
                score: run.score,
                rnd: run.rnd,
                train: run.train,
                targetPendingRate: run.targetPendingRate,
                targetUpdateRate: run.targetUpdateRate,
                tvTargetRate: run.tvTargetRate,
                bcTargetRate: run.bcTargetRate,
                moverTargetRate: run.moverTargetRate,
            });
        }
    }
    const bestConfigs = [...groupedByConfig.values()].sort((a, b) =>
        b.score - a.score ||
        a.game - b.game ||
        a.configKey.localeCompare(b.configKey)
    );
    const configIndex = bestConfigs.map((config, index) => ({
        rank: index + 1,
        configKey: config.configKey,
        hidden: config.hidden,
        lr: config.lr,
        runLabel: config.runLabel,
        game: config.game,
        score: config.score,
    }));

    const baselineRunLabel = options.baselineRun || '';
    const baselineRunEntry = baselineRunLabel
        ? bestRuns.find(run => run.runLabel === baselineRunLabel) || null
        : null;
    if (baselineRunEntry) {
        for (const run of bestRuns) {
            run.scoreDelta = run.score - baselineRunEntry.score;
            run.opponentDeltas = {};
            const runCombined = combined.find(entry => entry.runLabel === run.runLabel && entry.game === run.game);
            const baseCombined = combined.find(entry => entry.runLabel === baselineRunEntry.runLabel && entry.game === baselineRunEntry.game);
            for (const opponent of opponents) {
                const runOpponent = runCombined && runCombined.opponents ? runCombined.opponents[opponent] : null;
                const baseOpponent = baseCombined && baseCombined.opponents ? baseCombined.opponents[opponent] : null;
                run.opponentDeltas[opponent] = (runOpponent?.jsWinRate ?? null) == null || (baseOpponent?.jsWinRate ?? null) == null
                    ? null
                    : runOpponent.jsWinRate - baseOpponent.jsWinRate;
            }
        }
    }

    return {
        opponents,
        weights,
        drawPenalty,
        exhaustedPenalty,
        runLabel: options.runLabel || "",
        baselineRun: baselineRunLabel,
        totalRows: rows.length,
        jsRows: jsRows.length,
        bestByOpponent,
        baselineRunEntry,
        bestRuns,
        runIndex,
        bestConfigs,
        configIndex,
        combinedTop: combined.slice(0, 5),
    };
}

function renderSummary(summary, options = {}) {
    if (options.format === 'json') {
        return JSON.stringify(summary, null, 2);
    }
    const lines = [];
    const formatTargetRates = (entry) => {
        if (!entry) return '';
        const pending = Number.isFinite(entry.targetPendingRate) ? `${(entry.targetPendingRate * 100).toFixed(1)}%` : null;
        const update = Number.isFinite(entry.targetUpdateRate) ? `${(entry.targetUpdateRate * 100).toFixed(1)}%` : null;
        const tv = Number.isFinite(entry.tvTargetRate) ? `${(entry.tvTargetRate * 100).toFixed(1)}%` : null;
        const bc = Number.isFinite(entry.bcTargetRate) ? `${(entry.bcTargetRate * 100).toFixed(1)}%` : null;
        const mv = Number.isFinite(entry.moverTargetRate) ? `${(entry.moverTargetRate * 100).toFixed(1)}%` : null;
        if (pending == null && update == null && tv == null && bc == null && mv == null) {
            return '';
        }
        return ` target(p=${pending ?? 'n/a'} u=${update ?? 'n/a'} tv=${tv ?? 'n/a'} bc=${bc ?? 'n/a'} mv=${mv ?? 'n/a'})`;
    };
    lines.push(
        `rows=${summary.totalRows} jsRows=${summary.jsRows} opponents=${summary.opponents.join(',')} ` +
        `drawPenalty=${summary.drawPenalty} exhaustedPenalty=${summary.exhaustedPenalty}` +
        `${summary.runLabel ? ` runLabel=${summary.runLabel}` : ''}` +
        `${summary.baselineRun ? ` baselineRun=${summary.baselineRun}` : ''}`
    );
    for (const opponent of summary.opponents) {
        const best = summary.bestByOpponent[opponent];
        if (!best) {
            lines.push(`best ${opponent}: n/a`);
            continue;
        }
        lines.push(
            `best ${opponent}: game=${best.game} winRate=${(best.jsWinRate * 100).toFixed(1)}% ` +
            `seat(first=${(best.jsFirstRate * 100).toFixed(1)}%,second=${(best.jsSecondRate * 100).toFixed(1)}%) ` +
            `draw=${(best.jsDrawRate * 100).toFixed(1)}% exhausted=${best.jsExhausted} avgTurns=${best.jsAvgTurns.toFixed(1)}` +
            `${formatTargetRates(best)}`
        );
    }
    for (const run of (summary.bestRuns || []).slice(0, 5)) {
        const deltas = summary.opponents
            .map(opponent => {
                const delta = run.opponentDeltas && Number.isFinite(run.opponentDeltas[opponent])
                    ? run.opponentDeltas[opponent]
                    : null;
                return delta == null ? null : `${opponent}${delta >= 0 ? '+' : ''}${(delta * 100).toFixed(1)}pt`;
            })
            .filter(Boolean)
            .join(' ');
        lines.push(
            `run ${run.runLabel}: game=${run.game} score=${run.score.toFixed(3)} ` +
            `${Number.isFinite(run.scoreDelta) ? `delta=${run.scoreDelta >= 0 ? '+' : ''}${run.scoreDelta.toFixed(3)} ` : ''}` +
            `${run.hidden != null ? `hidden=${run.hidden} ` : ''}` +
            `${run.lr != null ? `lr=${run.lr} ` : ''}` +
            `rnd=${run.rnd == null ? 'n/a' : (run.rnd * 100).toFixed(1) + '%'} ` +
            `train=${run.train == null ? 'n/a' : (run.train * 100).toFixed(1) + '%'}${formatTargetRates(run)}` +
            `${deltas ? ` ${deltas}` : ''}`
        );
    }
    for (const config of (summary.bestConfigs || []).slice(0, 5)) {
        lines.push(
            `config ${config.configKey}: run=${config.runLabel} game=${config.game} score=${config.score.toFixed(3)} ` +
            `rnd=${config.rnd == null ? 'n/a' : (config.rnd * 100).toFixed(1) + '%'} ` +
            `train=${config.train == null ? 'n/a' : (config.train * 100).toFixed(1) + '%'}${formatTargetRates(config)}`
        );
    }
    for (const entry of summary.combinedTop) {
        lines.push(
            `top game=${entry.game} score=${entry.score.toFixed(3)} ` +
            `${entry.runLabel ? `run=${entry.runLabel} ` : ''}` +
            `${entry.hidden != null ? `hidden=${entry.hidden} ` : ''}` +
            `${entry.lr != null ? `lr=${entry.lr} ` : ''}` +
            `rnd=${entry.rnd == null ? 'n/a' : (entry.rnd * 100).toFixed(1) + '%'} ` +
            `train=${entry.train == null ? 'n/a' : (entry.train * 100).toFixed(1) + '%'}${formatTargetRates(entry)}`
        );
    }
    return lines.join('\n');
}

function printSummary(summary, options = {}) {
    console.log(renderSummary(summary, options));
}

function writeSummaryOutput(summary, options = {}) {
    if (!options.outputPath) return;
    const directory = path.dirname(options.outputPath);
    if (directory) {
        fs.mkdirSync(directory, { recursive: true });
    }
    fs.writeFileSync(options.outputPath, renderSummary(summary, options) + '\n', 'utf8');
}

function _csvEscape(value) {
    if (value == null) return '';
    const text = String(value);
    if (text.includes(',') || text.includes('"') || text.includes('\n')) {
        return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
}

function writeIndexCsv(rows, outputPath, columns) {
    if (!outputPath) return;
    const directory = path.dirname(outputPath);
    if (directory) {
        fs.mkdirSync(directory, { recursive: true });
    }
    const body = [
        columns.join(','),
        ...rows.map(row => columns.map(column => _csvEscape(row[column])).join(',')),
    ].join('\n') + '\n';
    fs.writeFileSync(outputPath, body, 'utf8');
}

function writeSummaryIndexes(summary, options = {}) {
    writeIndexCsv(summary.runIndex || [], options.runIndexCsvPath, ['rank', 'runLabel', 'game', 'score', 'hidden', 'lr']);
    writeIndexCsv(summary.configIndex || [], options.configIndexCsvPath, ['rank', 'configKey', 'hidden', 'lr', 'runLabel', 'game', 'score']);
}

if (require.main === module) {
    const options = parseArgs(process.argv.slice(2));
    const summary = summarizeMetrics(loadMetrics(options.csvPath), options);
    printSummary(summary, options);
    writeSummaryOutput(summary, options);
    writeSummaryIndexes(summary, options);
}

module.exports = {
    parseArgs,
    parseWeights,
    parseCsvLine,
    loadMetrics,
    summarizeMetrics,
    renderSummary,
    printSummary,
    writeSummaryOutput,
    writeIndexCsv,
    writeSummaryIndexes,
};
