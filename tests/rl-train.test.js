const assert = require('assert');
const { spawnSync } = require('child_process');
const path = require('path');
const { runTest } = require('./helpers/test-utils');

function runPython(code) {
    const result = spawnSync('python3', ['-c', code], {
        cwd: path.join(__dirname, '..'),
        encoding: 'utf8',
    });
    if (result.status !== 0) {
        throw new Error(result.stderr || result.stdout || 'python command failed');
    }
    return result.stdout.trim();
}

runTest('rl train: masked probs は有効手だけで合計1に正規化される', () => {
    const output = runPython(`
import numpy as np
from scripts.rl.train import _normalize_masked_probs
probs = np.array([0.1, 0.2, 0.7], dtype=np.float32)
mask = np.array([1, 0, 1], dtype=np.float32)
result = _normalize_masked_probs(probs, mask)
print(result.tolist())
print(float(result.sum()))
`);
    const lines = output.split('\n');
    const values = JSON.parse(lines[0]);
    const total = Number(lines[1]);
    assert.strictEqual(values[1], 0);
    assert.ok(Math.abs(total - 1) < 1e-12);
});

runTest('rl train: masked probs はゼロ和でも有効手に一様分布を返す', () => {
    const output = runPython(`
import numpy as np
from scripts.rl.train import _normalize_masked_probs
probs = np.array([0.0, 0.0, 0.0, 0.0], dtype=np.float32)
mask = np.array([0, 1, 0, 1], dtype=np.float32)
result = _normalize_masked_probs(probs, mask)
print(result.tolist())
print(float(result.sum()))
`);
    const lines = output.split('\n');
    const values = JSON.parse(lines[0]);
    const total = Number(lines[1]);
    assert.deepStrictEqual(values, [0, 0.5, 0, 0.5]);
    assert.ok(Math.abs(total - 1) < 1e-12);
});

runTest('rl train: 評価ゲーム数0なら評価関数は n/a を返せる', () => {
    const output = runPython(`
from scripts.rl.train import eval_vs_random, eval_vs_heuristic, eval_vs_pool
from scripts.rl.agent import RLAgent
agent = RLAgent(hidden=16, lr=0.001)
print(eval_vs_random(agent, 0))
print(eval_vs_heuristic(agent, 'weak', 0))
print(eval_vs_pool(agent, [], 0))
`);
    const lines = output.split('\n');
    assert.strictEqual(lines[0], 'nan');
    assert.strictEqual(lines[1], 'nan');
    assert.strictEqual(lines[2], 'nan');
});

runTest('rl train: JS評価サマリ文字列を組み立てる', () => {
    const output = runPython(`
from scripts.rl.train import _format_js_eval_summary
entries = [
    {"opponent": "strong", "result": {
        "games": 10,
        "wins": {"rl": 6, "strong": 3},
        "exhausted": 1,
        "averageTurns": 17.4,
        "matchLog": [
            {"lineup": ["rl", "strong"], "winnerDifficulty": "rl"},
            {"lineup": ["strong", "rl"], "winnerDifficulty": "strong"},
            {"lineup": ["rl", "strong"], "winnerDifficulty": "rl"},
            {"lineup": ["strong", "rl"], "winnerDifficulty": "rl"}
        ]
    }},
    {"opponent": "expert", "result": {
        "games": 10,
        "wins": {"rl": 3, "expert": 7},
        "exhausted": 0,
        "averageTurns": 22.1,
        "matchLog": [
            {"lineup": ["rl", "expert"], "winnerDifficulty": "expert"},
            {"lineup": ["expert", "rl"], "winnerDifficulty": "rl"}
        ]
    }},
]
print(_format_js_eval_summary(entries))
`);
    assert.strictEqual(output, 'js=strong=60%(f100%/s50%/d10%)/1@17.4 expert=30%(f0%/s100%/d0%)/0@22.1');
});

runTest('rl train: run label は未指定なら自動生成する', () => {
    const output = runPython(`
from datetime import datetime
from types import SimpleNamespace
from scripts.rl.train import _make_run_label
args = SimpleNamespace(run_label="", hidden=256, lr=0.0003, eval_every=1000, js_eval_games=20)
print(_make_run_label(args, now=datetime(2026, 4, 9, 12, 34, 56)))
`);
    assert.strictEqual(output, '20260409-123456-h256-lr0.0003-ev1000-js20');
});

runTest('rl train: run label は明示指定を優先する', () => {
    const output = runPython(`
from types import SimpleNamespace
from scripts.rl.train import _make_run_label
args = SimpleNamespace(run_label="baseline", hidden=256, lr=0.0003, eval_every=1000, js_eval_games=20)
print(_make_run_label(args))
`);
    assert.strictEqual(output, 'baseline');
});

runTest('rl train: metrics summary command を組み立てる', () => {
    const output = runPython(`
import json
from scripts.rl.train import _build_metrics_summary_command
command = _build_metrics_summary_command(
    "models/rl_model/train_metrics.csv",
    "models/rl_model/summary.json",
    options={
        "format": "json",
        "opponents": ["strong", "expert"],
        "weights": "strong=1,expert=2",
        "baseline_run": "baseline",
        "draw_penalty": 0.5,
        "exhausted_penalty": 0.02,
        "run_index_csv": "models/rl_model/run_index.csv",
        "config_index_csv": "models/rl_model/config_index.csv",
    },
)
print(json.dumps(command))
`);
    const command = JSON.parse(output);
    assert.ok(command.includes('scripts/summarize-rl-metrics.js'));
    assert.ok(command.includes('--output'));
    assert.ok(command.includes('models/rl_model/summary.json'));
    assert.ok(command.includes('--baseline-run'));
    assert.ok(command.includes('baseline'));
    assert.ok(command.includes('--run-index-csv'));
    assert.ok(command.includes('models/rl_model/run_index.csv'));
    assert.ok(command.includes('--config-index-csv'));
    assert.ok(command.includes('models/rl_model/config_index.csv'));
});

runTest('rl train: max_steps 指定を評価関数へ渡せる', () => {
    const output = runPython(`
from scripts.rl.train import eval_vs_random, eval_vs_heuristic, eval_vs_pool
from scripts.rl.agent import RLAgent
agent = RLAgent(hidden=16, lr=0.001)
print(eval_vs_random(agent, 0, max_steps=123))
print(eval_vs_heuristic(agent, 'weak', 0, max_steps=123))
print(eval_vs_pool(agent, [], 0, max_steps=123))
`);
    const lines = output.split('\n');
    assert.strictEqual(lines[0], 'nan');
    assert.strictEqual(lines[1], 'nan');
    assert.strictEqual(lines[2], 'nan');
});

runTest('rl train: JS評価から checkpoint score を計算する', () => {
    const output = runPython(`
from scripts.rl.train import _score_js_entries
entries = [
    {"opponent": "strong", "result": {"games": 10, "wins": {"rl": 6, "strong": 3}, "exhausted": 1}},
    {"opponent": "expert", "result": {"games": 10, "wins": {"rl": 4, "expert": 6}, "exhausted": 0}},
]
print(_score_js_entries(entries, weights_text="strong=1,expert=2", draw_penalty=0.5, exhausted_penalty=0.02))
`);
    assert.ok(Math.abs(Number(output) - 0.44333333333333336) < 1e-12);
});

runTest('rl train: fallback checkpoint score は expert を重く見る', () => {
    const output = runPython(`
from scripts.rl.train import _fallback_checkpoint_score
print(_fallback_checkpoint_score(0.55, 0.5, 0.4, 0.3))
`);
    assert.strictEqual(output, '3.95');
});

runTest('rl train: best checkpoint browser path を組み立てる', () => {
    const output = runPython(`
import json
from scripts.rl.train import _best_checkpoint_browser_path, _best_checkpoint_artifact_paths
print(_best_checkpoint_browser_path("models/rl_model/best_model"))
print(json.dumps(_best_checkpoint_artifact_paths(
    "models/rl_model/best_model",
    "models/rl_model/summary.json",
    "models/rl_model/run_index.csv",
    "models/rl_model/config_index.csv"
)))
`);
    const lines = output.split('\n');
    assert.strictEqual(lines[0], 'models/rl_model/best_model.browser.json');
    const paths = JSON.parse(lines[1]);
    assert.strictEqual(paths.checkpointPath, 'models/rl_model/best_model.npz');
    assert.strictEqual(paths.browserCheckpointPath, 'models/rl_model/best_model.browser.json');
    assert.strictEqual(paths.metaPath, 'models/rl_model/best_model.meta.json');
    assert.strictEqual(paths.summaryPath, 'models/rl_model/summary.json');
    assert.strictEqual(paths.runIndexCsvPath, 'models/rl_model/run_index.csv');
    assert.strictEqual(paths.configIndexCsvPath, 'models/rl_model/config_index.csv');
});

runTest('rl train: summary excerpt は bestRuns と bestConfigs を抜粋する', () => {
    const output = runPython(`
import json
import os
import tempfile
from scripts.rl.train import _load_summary_excerpt
fd, path = tempfile.mkstemp(suffix=".json")
os.close(fd)
with open(path, "w", encoding="utf-8") as fh:
    json.dump({
        "bestRuns": [{"runLabel": "a"}, {"runLabel": "b"}, {"runLabel": "c"}, {"runLabel": "d"}],
        "bestConfigs": [{"configKey": "x"}, {"configKey": "y"}, {"configKey": "z"}, {"configKey": "w"}],
    }, fh)
excerpt = _load_summary_excerpt(path, top_n=2)
print(json.dumps(excerpt))
os.unlink(path)
`);
    const excerpt = JSON.parse(output);
    assert.strictEqual(excerpt.bestRuns.length, 2);
    assert.strictEqual(excerpt.bestRuns[0].runLabel, 'a');
    assert.strictEqual(excerpt.bestConfigs.length, 2);
    assert.strictEqual(excerpt.bestConfigs[0].configKey, 'x');
});

runTest('rl train: summary run context は run と config の一致行を返す', () => {
    const output = runPython(`
import json
import os
import tempfile
from scripts.rl.train import _extract_summary_run_context
fd, path = tempfile.mkstemp(suffix=".json")
os.close(fd)
with open(path, "w", encoding="utf-8") as fh:
    json.dump({
        "bestRuns": [
            {"runLabel": "baseline", "score": 0.4},
            {"runLabel": "trial", "score": 0.5}
        ],
        "runIndex": [
            {"rank": 1, "runLabel": "trial", "score": 0.5},
            {"rank": 2, "runLabel": "baseline", "score": 0.4}
        ],
        "bestConfigs": [
            {"hidden": 128, "lr": 0.001, "configKey": "hidden=128 lr=0.001"},
            {"hidden": 256, "lr": 0.0003, "configKey": "hidden=256 lr=0.0003"}
        ],
        "configIndex": [
            {"rank": 1, "hidden": 256, "lr": 0.0003, "configKey": "hidden=256 lr=0.0003"},
            {"rank": 2, "hidden": 128, "lr": 0.001, "configKey": "hidden=128 lr=0.001"}
        ],
        "combinedTop": [
            {"runLabel": "trial", "score": 0.5},
            {"runLabel": "baseline", "score": 0.4}
        ],
    }, fh)
context = _extract_summary_run_context(path, "trial", hidden=256, lr=0.0003)
print(json.dumps(context))
os.unlink(path)
`);
    const context = JSON.parse(output);
    assert.strictEqual(context.runLabel, 'trial');
    assert.strictEqual(context.runEntry.score, 0.5);
    assert.strictEqual(context.runIndexEntry.rank, 1);
    assert.strictEqual(context.configEntry.configKey, 'hidden=256 lr=0.0003');
    assert.strictEqual(context.configIndexEntry.rank, 1);
    assert.strictEqual(context.combinedTopRank, 1);
    assert.strictEqual(context.combinedTopEntry.score, 0.5);
});

runTest('rl train: metrics rows は JS評価を展開して返す', () => {
    const output = runPython(`
from scripts.rl.train import _build_metrics_rows
rows = _build_metrics_rows(
    1000, 0.123, 0.55, 0.6, 0.5, 0.4, 0.3, float("nan"), 0.52, 0.2, 0.1, 0.01,
    [{"opponent": "strong", "result": {
        "games": 10,
        "wins": {"rl": 6, "strong": 3},
        "exhausted": 1,
        "averageTurns": 17.4,
        "matchLog": [
            {"lineup": ["rl", "strong"], "winnerDifficulty": "rl"},
            {"lineup": ["strong", "rl"], "winnerDifficulty": "strong"},
            {"lineup": ["strong", "rl"], "winnerDifficulty": "rl"}
        ]
    }}],
    metadata={"run_label": "baseline", "hidden": 256, "lr": 0.0003, "eval_every": 1000, "js_eval_games": 20, "js_eval_opponents": "strong,expert"}
)
print(len(rows))
print(rows[0]["run_label"])
print(rows[0]["js_opponent"])
print(rows[1]["js_opponent"])
print(rows[1]["js_win_rate"])
print(rows[1]["js_first_rate"])
print(rows[1]["js_second_rate"])
print(rows[1]["js_draw_rate"])
print(rows[1]["js_avg_turns"])
`);
    const lines = output.split('\n');
    assert.strictEqual(lines[0], '2');
    assert.strictEqual(lines[1], 'baseline');
    assert.strictEqual(lines[2], '');
    assert.strictEqual(lines[3], 'strong');
    assert.strictEqual(lines[4], '0.6');
    assert.strictEqual(lines[5], '1.0');
    assert.strictEqual(lines[6], '0.5');
    assert.strictEqual(lines[7], '0.1');
    assert.strictEqual(lines[8], '17.4');
});
