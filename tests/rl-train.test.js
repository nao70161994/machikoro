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

runTest('rl train: 学習相手の重み指定を解析できる', () => {
    const output = runPython(`
import json
from scripts.rl.train import _parse_training_opponents
print(json.dumps(_parse_training_opponents("random=0.5,strong=0.3,self=0.1,pool=0.2,invalid=1"), ensure_ascii=False))
`);
    const entries = JSON.parse(output);
    assert.deepStrictEqual(entries, [
        { kind: 'random', weight: 0.5 },
        { kind: 'strong', weight: 0.3 },
        { kind: 'self', weight: 0.1 },
        { kind: 'pool', weight: 0.2 },
    ]);
});

runTest('rl train: pool が空なら学習相手選択は random へフォールバックする', () => {
    const output = runPython(`
import json
import random
from scripts.rl.train import _choose_training_opponent
random.seed(1)
print(json.dumps(_choose_training_opponent([{"kind":"pool","weight":1.0}], []), ensure_ascii=False))
`);
    const entry = JSON.parse(output);
    assert.deepStrictEqual(entry, { kind: 'random' });
});

runTest('rl train: self 相手には現在 agent を渡せる', () => {
    const output = runPython(`
import json
from scripts.rl.agent import RLAgent
from scripts.rl.train import _choose_training_opponent
agent = RLAgent(hidden=16, lr=0.001)
entry = _choose_training_opponent([{"kind":"self","weight":1.0}], [], current_agent=agent)
print(entry["kind"])
print(entry["agent"] is agent)
`);
    const lines = output.split('\n');
    assert.strictEqual(lines[0], 'self');
    assert.strictEqual(lines[1], 'True');
});

runTest('rl train: self 両側学習は両席の行動をバッファに積む', () => {
    const output = runPython(`
import random
import numpy as np
from scripts.rl.agent import RLAgent
from scripts.rl.train import play_training_game

random.seed(3)
np.random.seed(3)
agent = RLAgent(hidden=8, lr=0.0001)
info = play_training_game(
    agent,
    epsilon=0.0,
    opponent={"kind": "self", "agent": agent},
    max_steps=12,
    self_learn_both_sides=True,
)
print(info.get("self_both_sides"))
print(info.get("recorded_steps"))
print(len(agent.rewards))
print(len(agent.states) == len(agent.actions) == len(agent.masks) == len(agent.values) == len(agent.rewards))
`);
    const lines = output.split('\n');
    assert.strictEqual(lines[0], 'True');
    assert.strictEqual(lines[1], lines[2]);
    assert.strictEqual(lines[3], 'True');
    assert.ok(Number(lines[2]) > 0);
});

runTest('rl train: 4人自己対戦は4人用状態次元で全席を学習対象にできる', () => {
    const output = runPython(`
import random
import numpy as np
from scripts.rl.agent import RLAgent
from scripts.rl.encode import state_dim_for_player_count
from scripts.rl.train import play_training_game

random.seed(4)
np.random.seed(4)
state_dim = state_dim_for_player_count(4)
agent = RLAgent(hidden=8, lr=0.0001, state_dim=state_dim)
info = play_training_game(
    agent,
    epsilon=0.0,
    opponent={"kind": "self", "agent": agent},
    max_steps=16,
    self_learn_both_sides=True,
    player_count=4,
)
print(state_dim)
print(info.get("self_both_sides"))
print(info.get("recorded_steps"))
print(len(agent.states[0]) if agent.states else 0)
`);
    const lines = output.split('\n');
    assert.ok(Number(lines[0]) > 145);
    assert.strictEqual(lines[1], 'True');
    assert.strictEqual(lines[2], '16');
    assert.strictEqual(Number(lines[3]), Number(lines[0]));
});

runTest('rl train: build stats を集計して整形できる', () => {
    const output = runPython(`
import json
from scripts.rl.train import _empty_build_stats, _record_build_action, _finalize_build_stats, _format_build_stats
from scripts.rl.game_env import ACT_PASS, ACT_BUY_CARD_BASE, ACT_BUY_LM_BASE
stats = _empty_build_stats()
_record_build_action(stats, ACT_PASS)
_record_build_action(stats, ACT_BUY_CARD_BASE)
_record_build_action(stats, ACT_BUY_CARD_BASE)
_record_build_action(stats, ACT_BUY_LM_BASE)
finalized = _finalize_build_stats(stats)
print(json.dumps(finalized, ensure_ascii=False))
print(_format_build_stats("rnd", finalized))
`);
    const lines = output.split('\n');
    const stats = JSON.parse(lines[0]);
    assert.strictEqual(stats.total, 4);
    assert.strictEqual(stats.pass, 1);
    assert.strictEqual(stats.passRate, 0.25);
    assert.strictEqual(stats.topCards[0].count, 2);
    assert.ok(lines[1].includes('rnd=pass25%'));
});

runTest('rl train: 評価 stats は相手側 build 集計も返せる', () => {
    const output = runPython(`
import json
from scripts.rl.train import eval_vs_random
from scripts.rl.agent import RLAgent
agent = RLAgent(hidden=16, lr=0.001)
result = eval_vs_random(agent, 0, return_stats=True)
print(json.dumps(sorted(result.keys()), ensure_ascii=False))
`);
    const keys = JSON.parse(output);
    assert.deepStrictEqual(keys, ['buildStats', 'opponentBuildStats', 'winRate']);
});

runTest('rl train: コインと資産の中間報酬を計算できる', () => {
    const output = runPython(`
import copy
from scripts.rl.game_env import MachikoroEnv
from scripts.rl.train import _compute_shaped_reward
before = MachikoroEnv()
after = copy.deepcopy(before)
after.players[0].coins += 3
after.players[1].coins -= 2
after.players[0].cards["鉱山"] += 1
config = {
    "coin": 0.01,
    "opp_coin": 0.008,
    "asset": 0.005,
    "opp_asset": 0.004,
    "landmark": 0.2,
    "opp_landmark": 0.15,
    "clip": 0.3,
}
print(round(_compute_shaped_reward(before, after, 0, config), 6))
`);
    assert.strictEqual(output, '0.076');
});

runTest('rl train: 中間報酬は指定値でクリップできる', () => {
    const output = runPython(`
import copy
from scripts.rl.game_env import MachikoroEnv
from scripts.rl.train import _compute_shaped_reward
before = MachikoroEnv()
after = copy.deepcopy(before)
after.players[0].coins += 100
print(_compute_shaped_reward(before, after, 0, {
    "coin": 0.01,
    "opp_coin": 0.0,
    "asset": 0.0,
    "opp_asset": 0.0,
    "landmark": 0.0,
    "opp_landmark": 0.0,
    "clip": 0.3,
}))
`);
    assert.strictEqual(output, '0.3');
});

runTest('rl train: 改装屋のランドマーク破壊収入は正の中間報酬にしない', () => {
    const output = runPython(`
import copy
from scripts.rl.game_env import MachikoroEnv, ACT_RENO_BASE
from scripts.rl.cards import LANDMARK_ORDER
from scripts.rl.train import _compute_shaped_reward
before = MachikoroEnv()
before.players[0].landmarks["港"] = True
before.players[0].coins = 0
after = copy.deepcopy(before)
after.players[0].landmarks["港"] = False
after.players[0].coins = 8
config = {
    "coin": 0.01,
    "opp_coin": 0.0,
    "asset": 0.005,
    "opp_asset": 0.0,
    "landmark": 0.2,
    "opp_landmark": 0.0,
    "clip": 0.3,
}
action = ACT_RENO_BASE + LANDMARK_ORDER.index("港")
print(round(_compute_shaped_reward(before, after, 0, config, action=action), 6))
`);
    assert.strictEqual(output, '-0.21');
});

runTest('rl train: 終局報酬にランドマーク差と資産差を加算できる', () => {
    const output = runPython(`
from scripts.rl.game_env import MachikoroEnv
from scripts.rl.train import _compute_terminal_reward
env = MachikoroEnv()
env.winner = 0
env.players[0].coins = 20
env.players[1].coins = 0
env.players[0].landmarks["駅"] = True
env.players[0].landmarks["港"] = True
print(round(_compute_terminal_reward(env, 0, {
    "win": 1.0,
    "loss": -1.0,
    "draw": -0.2,
    "landmark_diff": 0.1,
    "asset_diff": 0.005,
    "coin_diff": 0.002,
    "diff_clip": 30,
}), 6))
`);
    assert.strictEqual(output, '1.27');
});

runTest('rl train: 終局報酬にランドマーク建設済コスト差を加算できる', () => {
    const output = runPython(`
from scripts.rl.game_env import MachikoroEnv
from scripts.rl.train import _compute_terminal_reward
env = MachikoroEnv()
env.winner = 0
env.players[0].landmarks["空港"] = True
env.players[1].landmarks["港"] = True
print(round(_compute_terminal_reward(env, 0, {
    "win": 1.0,
    "loss": -1.0,
    "draw": -0.2,
    "landmark_diff": 0.0,
    "landmark_value_diff": 0.008,
    "asset_diff": 0.0,
    "coin_diff": 0.0,
    "diff_clip": 30,
}), 6))
`);
    assert.strictEqual(output, '1.224');
});

runTest('rl train: 模倣学習 step は教師行動で通常 policy を更新する', () => {
    const output = runPython(`
import json
from scripts.rl.agent import RLAgent
from scripts.rl.encode import encode_state, action_mask
from scripts.rl.game_env import MachikoroEnv, PHASE_BUILD, ACT_BUY_LM_BASE
from scripts.rl.train import _train_imitation_step
agent = RLAgent(hidden=16, lr=0.001)
env = MachikoroEnv()
env.phase = PHASE_BUILD
env.players[env.current].coins = 4
state = encode_state(env)
mask = action_mask(env)
result = _train_imitation_step(agent, state, mask, ACT_BUY_LM_BASE)
print(json.dumps(result))
`);
    const result = JSON.parse(output);
    assert.strictEqual(result.trained, true);
    assert.ok(result.loss > 0);
});

runTest('rl train: 模倣事前学習は教師行動サンプルを収集できる', () => {
    const output = runPython(`
import json
import random
import numpy as np
from scripts.rl.agent import RLAgent
from scripts.rl.train import run_imitation_pretraining
random.seed(1)
np.random.seed(1)
agent = RLAgent(hidden=16, lr=0.001)
stats = run_imitation_pretraining(agent, games=1, opponents=["weak"], max_steps=5)
print(json.dumps(stats))
`);
    const stats = JSON.parse(output);
    assert.ok(stats.examples > 0);
    assert.ok(stats.trained >= 0);
    assert.strictEqual(stats.opponents, 'weak');
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
from scripts.rl.train import _best_checkpoint_browser_path, _best_checkpoint_artifact_paths, _ranked_checkpoint_path
print(_best_checkpoint_browser_path("models/rl_model/best_model"))
print(_ranked_checkpoint_path("models/rl_model/best_model", 1))
print(_ranked_checkpoint_path("models/rl_model/best_model", 3))
print(json.dumps(_best_checkpoint_artifact_paths(
    "models/rl_model/best_model",
    "models/rl_model/summary.json",
    "models/rl_model/run_index.csv",
    "models/rl_model/config_index.csv"
)))
`);
    const lines = output.split('\n');
    assert.strictEqual(lines[0], 'models/rl_model/best_model.browser.json');
    assert.strictEqual(lines[1], 'models/rl_model/best_model');
    assert.strictEqual(lines[2], 'models/rl_model/best_model.top3');
    const paths = JSON.parse(lines[3]);
    assert.strictEqual(paths.checkpointPath, 'models/rl_model/best_model.npz');
    assert.strictEqual(paths.browserCheckpointPath, 'models/rl_model/best_model.browser.json');
    assert.strictEqual(paths.metaPath, 'models/rl_model/best_model.meta.json');
    assert.strictEqual(paths.summaryPath, 'models/rl_model/summary.json');
    assert.strictEqual(paths.runIndexCsvPath, 'models/rl_model/run_index.csv');
    assert.strictEqual(paths.configIndexCsvPath, 'models/rl_model/config_index.csv');
});

runTest('rl train: top-k checkpoint 候補をスコア順に保持する', () => {
    const output = runPython(`
import json
from scripts.rl.train import _update_top_checkpoints
candidates = [
    {"game": 100, "score": 0.2},
    {"game": 200, "score": 0.5},
]
result = _update_top_checkpoints(candidates, {"game": 300, "score": 0.4}, 2)
print(json.dumps(result))
`);
    const result = JSON.parse(output);
    assert.deepStrictEqual(result.map((entry) => entry.game), [200, 300]);
    assert.deepStrictEqual(result.map((entry) => entry.score), [0.5, 0.4]);
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
    metadata={"run_label": "baseline", "seed": 11, "hidden": 256, "lr": 0.0003, "eval_every": 1000, "js_eval_games": 20, "js_eval_opponents": "strong,expert"}
)
print(len(rows))
print(rows[0]["run_label"])
print(rows[0]["seed"])
print(rows[0]["js_opponent"])
print(rows[1]["seed"])
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
    assert.strictEqual(lines[2], '11');
    assert.strictEqual(lines[3], '');
    assert.strictEqual(lines[4], '11');
    assert.strictEqual(lines[5], 'strong');
    assert.strictEqual(lines[6], '0.6');
    assert.strictEqual(lines[7], '1.0');
    assert.strictEqual(lines[8], '0.5');
    assert.strictEqual(lines[9], '0.1');
    assert.strictEqual(lines[10], '17.4');
});
