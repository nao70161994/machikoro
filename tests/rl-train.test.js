const assert = require('assert');
const { spawnSync } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { runTest } = require('./helpers/test-utils');

runTest('rl train: 最終評価は長時間無出力にせず段階を表示する', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'rl', 'train.py'), 'utf8');
    assert.ok(source.includes('最終評価開始:'));
    assert.ok(source.includes('最終評価進捗: random完了'));
    assert.ok(source.includes('最終評価進捗: JS CPU評価開始'));
});
const { loadGameRuntime } = require('./helpers/runtime-loaders');

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


runTest('rl parity report: ワイナリー集約結果はJSと差分がない', () => {
    const output = runPython(`
import json
from scripts.rl.parity_report import build_report
print(json.dumps(build_report(), ensure_ascii=False))
`);
    const report = JSON.parse(output);
    assert.strictEqual(report.schema, 'rl-parity-report-v2');
    assert.strictEqual(report.knownApproximationCount, 0);
    const dormantCase = report.knownApproximations.find(entry =>
        entry.card === 'ワイナリー' &&
        entry.totalWineries === 2 &&
        entry.dormantWineriesBefore === 1 &&
        entry.grapes === 1
    );
    assert.ok(dormantCase);
    assert.strictEqual(dormantCase.js.gain, 6);
    assert.strictEqual(dormantCase.pythonApprox.gain, 6);
    assert.strictEqual(dormantCase.gainDiff, 0);
});

runTest('rl train: CLI help は train-batch-size を含む', () => {
    const result = spawnSync('python3', ['-m', 'scripts.rl.train', '--help'], {
        cwd: path.join(__dirname, '..'),
        encoding: 'utf8',
    });
    assert.strictEqual(result.status, 0, result.stderr || result.stdout);
    assert.ok(result.stdout.includes('--train-batch-size'));
    assert.ok(result.stdout.includes('--debug-train-batch'));
    assert.ok(result.stdout.includes('--checkpoint-every'));
    assert.ok(result.stdout.includes('--pending-curriculum-samples'));
    assert.ok(result.stdout.includes('--pending-curriculum-refresh-samples'));
    assert.ok(result.stdout.includes('--pending-curriculum-refresh-every'));
    assert.ok(result.stdout.includes('--target-head-lr'));
    assert.ok(result.stdout.includes('--pending-curriculum-head-lr'));
    assert.ok(result.stdout.includes('--player-counts'));
});

runTest('rl train: eval-every 0 は短いsanity学習を停止させない', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rl-no-periodic-eval-'));
    try {
        const result = spawnSync('python3', [
            '-m', 'scripts.rl.train', '--games', '1', '--eval-every', '0',
            '--initial-eval-games', '0', '--final-eval-random-games', '0',
            '--final-eval-heuristic-games', '0', '--final-eval-pool-games', '0',
            '--js-eval-games', '0', '--hidden', '8', '--max-steps', '2',
            '--progress-every', '1', '--run-label', 'test-no-periodic-eval',
            '--metrics-csv', path.join(tmpDir, 'metrics.csv'),
            '--best-checkpoint', path.join(tmpDir, 'best'),
            '--summary-output', path.join(tmpDir, 'summary.json'),
            '--summary-run-index-csv', path.join(tmpDir, 'run.csv'),
            '--summary-config-index-csv', path.join(tmpDir, 'config.csv'),
        ], { encoding: 'utf8' });
        assert.strictEqual(result.status, 0, result.stderr || result.stdout);
        assert.ok(result.stdout.includes('[進捗'));
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
});

runTest('rl train: games 0 のcurriculum-only runもcheckpointを保存する', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rl-curriculum-only-'));
    const modelPath = path.join(tmpDir, 'model');
    try {
        const result = spawnSync('python3', [
            '-m', 'scripts.rl.train', '--games', '0', '--eval-every', '0',
            '--initial-eval-games', '0', '--final-eval-random-games', '0',
            '--final-eval-heuristic-games', '0', '--final-eval-pool-games', '0',
            '--js-eval-games', '0', '--hidden', '8',
            '--pending-curriculum-samples', '4', '--model-path', modelPath,
            '--run-label', 'test-curriculum-only',
        ], { encoding: 'utf8' });
        assert.strictEqual(result.status, 0, result.stderr || result.stdout);
        assert.ok(fs.existsSync(`${modelPath}.npz`));
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
});

runTest('rl train: CLI help は2〜10人ランダム化の人数範囲オプションを含む', () => {
    const result = spawnSync('python3', ['-m', 'scripts.rl.train', '--help'], {
        cwd: path.join(__dirname, '..'),
        encoding: 'utf8',
    });
    assert.strictEqual(result.status, 0, result.stderr || result.stdout);
    assert.ok(result.stdout.includes('--player-count-min'));
    assert.ok(result.stdout.includes('--player-count-max'));
    assert.ok(result.stdout.includes('2〜10'));
});

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

runTest('rl train: JS評価lineup指定を解析できる', () => {
    const output = runPython(`
import json
from scripts.rl.train import _parse_js_eval_lineups
print(json.dumps(_parse_js_eval_lineups("rl,weak,normal,strong;rl,normal,normal,strong;weak,normal"), ensure_ascii=False))
`);
    const entries = JSON.parse(output);
    assert.deepStrictEqual(entries, [
        ['rl', 'weak', 'normal', 'strong'],
        ['rl', 'normal', 'normal', 'strong'],
    ]);
});

runTest('rl train: player count range は2〜10に正規化し単独minは固定扱いにする', () => {
    const output = runPython(`
from scripts.rl.train import _resolve_player_count_range, _state_dim_for_player_count_range, _target_slots_for_player_count_range
print(_resolve_player_count_range(2, None, None))
print(_resolve_player_count_range(2, None, 10))
print(_resolve_player_count_range(2, 5, None))
print(_resolve_player_count_range(2, 10, 2))
print(_state_dim_for_player_count_range((2, 10)))
print(_target_slots_for_player_count_range((2, 10)))
`);
    const lines = output.split('\n');
    assert.strictEqual(lines[0], '(2, 2)');
    assert.strictEqual(lines[1], '(2, 10)');
    assert.strictEqual(lines[2], '(5, 5)');
    assert.strictEqual(lines[3], '(2, 10)');
    assert.ok(Number(lines[4]) > 145);
    assert.strictEqual(lines[5], '3');
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

runTest('rl train: 人数サンプラは2〜10範囲をゲームごとに選べる', () => {
    const output = runPython(`
import json
import random
from scripts.rl.train import _resolve_player_count_range, _sample_player_count, _state_dim_for_player_count_range, _target_slots_for_player_count_range
from scripts.rl.encode import state_dim_for_player_count

player_count_range = _resolve_player_count_range(player_count=4, player_count_min=2, player_count_max=10)
random.seed(12)
values = [_sample_player_count(player_count_range) for _ in range(200)]
print(min(values))
print(max(values))
print(json.dumps(sorted(set(values))))

fixed_range = _resolve_player_count_range(player_count=7, player_count_min=None, player_count_max=None)
print(_sample_player_count(fixed_range))
print(_state_dim_for_player_count_range(player_count_range))
print(_target_slots_for_player_count_range(player_count_range))
print(state_dim_for_player_count(10))
`);
    const lines = output.split('\n');
    assert.strictEqual(lines[0], '2');
    assert.strictEqual(lines[1], '10');
    assert.deepStrictEqual(JSON.parse(lines[2]), [2, 3, 4, 5, 6, 7, 8, 9, 10]);
    assert.strictEqual(lines[3], '7');
    assert.strictEqual(Number(lines[4]), Number(lines[6]));
    assert.strictEqual(lines[5], '3');
});

runTest('rl train: 明示人数集合は3/4/5/10だけを均等サンプルできる', () => {
    const output = runPython(`
import json
import random
from scripts.rl.train import _resolve_player_count_choices, _sample_player_count_choices

choices = _resolve_player_count_choices("3,4,5,10,5", (2, 10))
random.seed(14)
samples = [_sample_player_count_choices(choices) for _ in range(200)]
print(json.dumps(choices))
print(json.dumps(sorted(set(samples))))
print(all(value in choices for value in samples))
for invalid in ("1", "11", "x", ",,"):
    try:
        _resolve_player_count_choices(invalid, (2, 10))
    except ValueError as error:
        print(str(error))
`);
    const lines = output.split('\n');
    assert.deepStrictEqual(JSON.parse(lines[0]), [3, 4, 5, 10]);
    assert.deepStrictEqual(JSON.parse(lines[1]), [3, 4, 5, 10]);
    assert.strictEqual(lines[2], 'True');
    assert.ok(lines[3].includes('2..10'));
    assert.ok(lines[4].includes('2..10'));
    assert.ok(lines[5].includes('invalid player count'));
    assert.ok(lines[6].includes('must not be empty'));
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

runTest('rl train: 敗戦episode再学習は終端境界を保ち勝者・引き分けを複製しない', () => {
    const output = runPython(`
import json
from types import SimpleNamespace
from scripts.rl.train import _replay_losing_episode

def agent():
    return SimpleNamespace(
        states=[], actions=[], masks=[], values=[], rewards=[], next_values=[], dones=[],
        target_kinds=[], target_slots=[], target_masks=[], net=SimpleNamespace(target_slots=0),
    )

episode = {
    "states": ["s0", "s1"], "actions": [1, 2], "masks": [[1], [1]],
    "values": [0.2, 0.1], "rewards": [0.0, -1.0],
    "target_kinds": [None, None], "target_slots": [None, None],
    "target_masks": [[], []],
}
loser = agent()
replayed = _replay_losing_episode(loser, [(0, episode)], winner=1, probability=0.25, random_value=0.1)
winner = agent()
winner_result = _replay_losing_episode(winner, [(1, episode)], winner=1, probability=1.0, random_value=0.0)
draw = agent()
draw_result = _replay_losing_episode(draw, [(0, episode)], winner=None, probability=1.0, random_value=0.0)
skipped = agent()
skip_result = _replay_losing_episode(skipped, [(0, episode)], winner=1, probability=0.25, random_value=0.3)
multiplayer = agent()
multi_result = _replay_losing_episode(
    multiplayer, [(0, episode), (1, episode), (2, episode)],
    winner=1, probability=1.0, random_value=0.0,
)
print(json.dumps({
    "replayed": replayed, "dones": loser.dones, "nextValues": loser.next_values,
    "winner": winner_result, "draw": draw_result, "skipped": skip_result,
    "multi": multi_result, "multiSteps": len(multiplayer.states),
}))
`);
    assert.deepStrictEqual(JSON.parse(output), {
        replayed: { episodes: 1, steps: 2 },
        dones: [false, true],
        nextValues: [0.1, 0],
        winner: { episodes: 0, steps: 0 },
        draw: { episodes: 0, steps: 0 },
        skipped: { episodes: 0, steps: 0 },
        multi: { episodes: 1, steps: 2 },
        multiSteps: 2,
    });
});

runTest('rl train: 10人学習環境は多人数状態次元で脅威度上位3相手へ射影する', () => {
    const output = runPython(`
import json
from scripts.rl.game_env import MachikoroEnv
from scripts.rl.encode import encode_state_v2, state_dim_for_player_count, PLAYER_FEATURE_DIM_V2

env = MachikoroEnv(player_count=10)
env.current = 0
for index, player in enumerate(env.players):
    player.coins = index
env.players[9].landmarks["空港"] = True
state_dim = state_dim_for_player_count(10)
vec = encode_state_v2(env)
base = PLAYER_FEATURE_DIM_V2
coins = [
    round(float(vec[base + 0]) * 50),
    round(float(vec[base * 2 + 0]) * 50),
    round(float(vec[base * 3 + 0]) * 50),
]
print(env.player_count)
print(len(env.players))
print(state_dim)
print(len(vec))
print(json.dumps(coins))
print(round(float(vec[-1]), 6))
`);
    const lines = output.split('\n');
    assert.strictEqual(lines[0], '10');
    assert.strictEqual(lines[1], '10');
    assert.strictEqual(Number(lines[2]), Number(lines[3]));
    assert.ok(Number(lines[2]) > 145);
    assert.deepStrictEqual(JSON.parse(lines[4]), [9, 8, 7]);
    assert.strictEqual(lines[5], '1.0');
});

runTest('rl train: 5人以上の大施設初期在庫はJSと同じ人数分にする', () => {
    const output = runPython(`
from scripts.rl.game_env import MachikoroEnv

env = MachikoroEnv(player_count=10)
print(env.shop_stock["テレビ局"])
print(env.shop_stock["麦畑"])
`);
    const lines = output.split('\n');
    assert.strictEqual(lines[0], '10');
    assert.strictEqual(lines[1], '6');
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

runTest('rl train: 4人戦の target opponent は脅威度最大の相手を選ぶ', () => {
    const output = runPython(`
from scripts.rl.game_env import MachikoroEnv

env = MachikoroEnv(player_count=4)
env.current = 0
env.players[1].coins = 12
env.players[1].cards["麦畑"] += 1
env.players[2].coins = 1
env.players[2].cards["鉱山"] += 2
env.players[2].landmarks["駅"] = True
env.players[2].landmarks["空港"] = True
env.players[3].coins = 15
env.players[3].cards["パン屋"] += 1
print(env._target_opponent_index())
`);
    assert.strictEqual(output, '2');
});

runTest('rl train: 4人戦 state encoding の相手枠は脅威度順で並ぶ', () => {
    const output = runPython(`
import json
from scripts.rl.game_env import MachikoroEnv
from scripts.rl.encode import encode_state_v2, PLAYER_FEATURE_DIM_V2

env = MachikoroEnv(player_count=4)
env.current = 0
env.players[1].coins = 12
env.players[1].cards["麦畑"] += 1
env.players[2].coins = 1
env.players[2].cards["鉱山"] += 2
env.players[2].landmarks["駅"] = True
env.players[2].landmarks["空港"] = True
env.players[3].coins = 15
env.players[3].cards["パン屋"] += 1

vec = encode_state_v2(env)
base = PLAYER_FEATURE_DIM_V2
coins = [
    round(float(vec[base + 0]) * 50),
    round(float(vec[base * 2 + 0]) * 50),
    round(float(vec[base * 3 + 0]) * 50),
]
print(json.dumps(coins, ensure_ascii=False))
`);
    assert.deepStrictEqual(JSON.parse(output), [1, 15, 12]);
});

runTest('rl train: 4人用 RLAgent は target slots を保持できる', () => {
    const output = runPython(`
from scripts.rl.agent import RLAgent
agent = RLAgent(hidden=8, lr=0.0001, state_dim=353, target_slots=3)
print(agent.net.target_slots)
print(agent.net.tv_target_head is not None)
print(agent.net.bc_target_head is not None)
print(agent.net.mover_target_head is not None)
`);
    const lines = output.split('\n');
    assert.strictEqual(lines[0], '3');
    assert.strictEqual(lines[1], 'True');
    assert.strictEqual(lines[2], 'True');
    assert.strictEqual(lines[3], 'True');
});

runTest('rl train: 多人数用RLAgent公開APIは2人環境も353次元でencodeする', () => {
    const output = runPython(`
import random
import numpy as np
from scripts.rl.agent import RLAgent
from scripts.rl.encode import STATE_DIM_4P
from scripts.rl.game_env import MachikoroEnv

random.seed(11)
np.random.seed(11)
agent = RLAgent(hidden=8, lr=0.0001, state_dim=STATE_DIM_4P, target_slots=3)
env = MachikoroEnv(player_count=2)
action = agent.select_action(env)
agent.store_transition(0.0, env, False)
print(len(agent.states[0]))
print(len(agent.next_values))
print(isinstance(action, int))
`);
    const lines = output.split('\n');
    assert.strictEqual(lines[0], '353');
    assert.strictEqual(lines[1], '1');
    assert.strictEqual(lines[2], 'True');
});

runTest('rl train: RLAgent公開APIはstate schema不一致を説明付きで拒否する', () => {
    const output = runPython(`
from scripts.rl.agent import RLAgent
from scripts.rl.encode import STATE_DIM
from scripts.rl.game_env import MachikoroEnv

cases = [
    (RLAgent(hidden=8, lr=0.0001, state_dim=STATE_DIM), MachikoroEnv(player_count=3)),
    (RLAgent(hidden=8, lr=0.0001, state_dim=999), MachikoroEnv(player_count=2)),
]
for agent, env in cases:
    try:
        agent.select_action(env)
    except ValueError as error:
        print(str(error))
`);
    const lines = output.split('\n');
    assert.ok(lines[0].includes('cannot encode 3 players'));
    assert.strictEqual(lines[1], 'unsupported RLAgent state_dim: 999');
});

runTest('rl train: target head 付き checkpoint を export できる', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rl-target-head-'));
    const ckptBase = path.join(tmpDir, 'model');
    const exportPath = path.join(tmpDir, 'model.browser.json');
    try {
        const output = runPython(`
import json
from scripts.rl.network import PolicyValueNet
from scripts.rl.export_model import export_checkpoint

net = PolicyValueNet(state_dim=353, num_actions=1580, hidden=8, lr=0.0001, target_slots=3)
net.save(r"${ckptBase}")
bundle = export_checkpoint(r"${ckptBase}.npz", r"${exportPath}")
print(bundle["numTargetSlots"])
print(sorted(k for k in bundle["layers"].keys() if "TargetHead" in k))
`);
        const lines = output.split('\n');
        assert.strictEqual(lines[0], '3');
        assert.deepStrictEqual(JSON.parse(lines[1].replace(/'/g, '"')), ['businessTargetHead', 'moverTargetHead', 'tvTargetHead']);
        const exported = JSON.parse(fs.readFileSync(exportPath, 'utf8'));
        assert.strictEqual(exported.numTargetSlots, 3);
        assert.strictEqual(exported.formatVersion, 2);
        assert.strictEqual(exported.stateSchema, 'state-mp-v1');
        assert.strictEqual(exported.actionSchema, 'action-flat-v1');
        assert.strictEqual(exported.cardNames.length, 38);
        assert.ok(exported.vocabularyFingerprint.startsWith('v1:'));
        assert.deepStrictEqual(exported.landmarkNames, [
            '駅', 'ショッピングモール', '遊園地', '電波塔', '港', '空港',
        ]);
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
});

runTest('rl train: export はTVなしBusiness target headだけでも target slots を保持する', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rl-bc-target-head-'));
    const ckptBase = path.join(tmpDir, 'model');
    const exportPath = path.join(tmpDir, 'model.browser.json');
    try {
        const output = runPython(`
import numpy as np
from scripts.rl.network import PolicyValueNet
from scripts.rl.export_model import export_checkpoint

net = PolicyValueNet(state_dim=353, num_actions=1580, hidden=8, lr=0.0001, target_slots=3)
net.save(r"${ckptBase}")
path = r"${ckptBase}.npz"
data = dict(np.load(path))
for key in list(data.keys()):
    if key.startswith("tv_target_") or key.startswith("mover_target_"):
        del data[key]
np.savez(path, **data)
bundle = export_checkpoint(path, r"${exportPath}")
print(bundle["numTargetSlots"])
print("businessTargetHead" in bundle["layers"])
print("tvTargetHead" in bundle["layers"])
`);
        const lines = output.split('\n');
        assert.strictEqual(lines[0], '3');
        assert.strictEqual(lines[1], 'True');
        assert.strictEqual(lines[2], 'False');
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
});

runTest('rl train: load はTVなしBusiness target headだけでも target slots を保持する', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rl-bc-target-head-load-'));
    const ckptBase = path.join(tmpDir, 'model');
    try {
        const output = runPython(`
import numpy as np
from scripts.rl.network import PolicyValueNet

net = PolicyValueNet(state_dim=353, num_actions=1580, hidden=8, lr=0.0001, target_slots=3)
net.save(r"${ckptBase}")
path = r"${ckptBase}.npz"
data = dict(np.load(path))
for key in list(data.keys()):
    if key.startswith("tv_target_") or key.startswith("mover_target_"):
        del data[key]
np.savez(path, **data)

loaded = PolicyValueNet(state_dim=353, num_actions=1580, hidden=8, lr=0.0001, target_slots=0)
loaded.load(r"${ckptBase}")
print(loaded.target_slots)
print(loaded.tv_target_head is None)
print(loaded.bc_target_head is not None)
print(loaded.mover_target_head is None)
`);
        const lines = output.split('\n');
        assert.strictEqual(lines[0], '3');
        assert.strictEqual(lines[1], 'True');
        assert.strictEqual(lines[2], 'True');
        assert.strictEqual(lines[3], 'True');
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
});

runTest('rl train: legacy checkpoint warm-start は要求されたtarget headを新設して共有方策を引き継ぐ', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rl-legacy-target-upgrade-'));
    const legacyBase = path.join(tmpDir, 'legacy');
    const upgradedBase = path.join(tmpDir, 'upgraded');
    try {
        const output = runPython(`
from scripts.rl.agent import RLAgent
from scripts.rl.encode import STATE_DIM_4P

legacy = RLAgent(hidden=8, lr=0.0001, state_dim=STATE_DIM_4P, target_slots=0)
legacy.net.policy_head.b[0] = 7.0
legacy.save(r"${legacyBase}")

upgraded = RLAgent(hidden=8, lr=0.0001, state_dim=STATE_DIM_4P, target_slots=3)
upgraded.load(r"${legacyBase}")
print(upgraded.net.target_slots)
print(upgraded.net.tv_target_head is not None)
print(upgraded.net.bc_target_head is not None)
print(upgraded.net.mover_target_head is not None)
print(float(upgraded.net.policy_head.b[0]))
upgraded.save(r"${upgradedBase}")

reloaded = RLAgent(hidden=8, lr=0.0001, state_dim=STATE_DIM_4P, target_slots=0)
reloaded.load(r"${upgradedBase}")
print(reloaded.net.target_slots)
print(reloaded.net.tv_target_head is not None)
print(reloaded.net.bc_target_head is not None)
print(reloaded.net.mover_target_head is not None)
`);
        const lines = output.split('\n');
        assert.deepStrictEqual(lines, [
            '3', 'True', 'True', 'True', '7.0',
            '3', 'True', 'True', 'True',
        ]);
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
});

runTest('rl train: Python env は pending queue 先頭fieldを合法actionに使う', () => {
    const output = runPython(`
from scripts.rl.game_env import MachikoroEnv, PHASE_PENDING, ACT_TV_TARGET, ACT_RENO_BASE, LANDMARK_INDEX

env = MachikoroEnv(player_count=2)
env.phase = PHASE_PENDING
env.pending_tv = 1
env.pending_reno = 1
env.pending_action_queue = ["pendingRenovation", "pendingTV"]
env.players[0].landmarks["駅"] = True
acts = env.valid_actions()
print(ACT_TV_TARGET in acts)
print(ACT_RENO_BASE + LANDMARK_INDEX["駅"] in acts)
env.step(ACT_RENO_BASE + LANDMARK_INDEX["駅"])
print(env.pending_reno)
print(env.pending_tv)
print(env._next_pending_field())
`);
    const lines = output.split('\n');
    assert.deepStrictEqual(lines, ['False', 'True', '0', '1', 'pendingTV']);
});

runTest('rl train: target head kind は pending queue 先頭fieldを使う', () => {
    const output = runPython(`
from scripts.rl.game_env import MachikoroEnv, PHASE_PENDING
from scripts.rl.train import _pending_target_kind

env = MachikoroEnv(player_count=4)
env.phase = PHASE_PENDING
env.pending_tv = 1
env.pending_biz = 1
env.pending_mover = 1
env.pending_action_queue = ["pendingBusiness", "pendingTV", "pendingMover"]
print(env._pending_target_kind())
print(_pending_target_kind(env))
env.pending_biz = 0
print(env._pending_target_kind())
print(_pending_target_kind(env))
`);
    const lines = output.split('\n');
    assert.deepStrictEqual(lines, ['business', 'bc', 'tv', 'tv']);
});

runTest('rl train: JS CPU oracle state は pending queue を渡す', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'rl', 'js_cpu_oracle.py'), 'utf8');
    const oracleSource = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'rl', 'js_cpu_action_oracle.js'), 'utf8');
    assert.ok(source.includes('pendingActions'));
    assert.ok(source.includes('cardDormantOrder'));
    assert.ok(oracleSource.includes('game.pendingActionQueue = Array.isArray(state.pendingActions)'));
    assert.ok(oracleSource.includes('Array.isArray(source.cardDormantOrder)'));
    assert.ok(oracleSource.includes('runtime.GameManager.nextPendingActionFor(game)'));
});

runTest('rl train: JS CPU oracle はtargetIndexなし応答で古いpending targetを消す', () => {
    const output = runPython(`
from scripts.rl.game_env import MachikoroEnv
from scripts.rl.js_cpu_oracle import JsCpuOracle

class FakeStdin:
    def write(self, value):
        pass
    def flush(self):
        pass

class FakeStdout:
    def readline(self):
        return '{"action": 7, "label": "IT_SKIP"}\\n'

class FakeProc:
    stdin = FakeStdin()
    stdout = FakeStdout()
    stderr = None
    def poll(self):
        return None

env = MachikoroEnv(player_count=3)
env.set_pending_target_index(2)
oracle = JsCpuOracle.__new__(JsCpuOracle)
oracle._proc = FakeProc()
print(oracle.action(env, "normal"))
print(env.pending_target_index)
`);
    const lines = output.split('\n');
    assert.strictEqual(lines[0], '7');
    assert.strictEqual(lines[1], 'None');
});

runTest('rl train: eval_vs_js_cpu は run-local browser export path を使う', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'rl', 'train.py'), 'utf8');
    assert.ok(source.includes('browser_path = model_path + ".browser.json"'));
    assert.ok(!source.includes('browser_path = os.path.join(MODEL_DIR, "model.browser.json")'));
});

runTest('rl train: checkpoint は run label ごとの path に分離する', () => {
    const output = runPython(`
from scripts.rl.train import _resolve_run_model_path

print(_resolve_run_model_path("seed 101 / four-player"))
print(_resolve_run_model_path("seed-102"))
print(_resolve_run_model_path("ignored", "custom/output.npz"))
`);
    const lines = output.split('\n');
    assert.ok(lines[0].endsWith('models/rl_model/runs/seed_101___four-player/model'));
    assert.ok(lines[1].endsWith('models/rl_model/runs/seed-102/model'));
    assert.strictEqual(lines[2], 'custom/output');
    assert.notStrictEqual(lines[0], lines[1]);

    const source = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'rl', 'train.py'), 'utf8');
    assert.ok(source.includes('model_path = _resolve_run_model_path(args.run_label, args.model_path)'));
    assert.ok(source.includes('export_checkpoint(model_path + ".npz", model_path + ".browser.json", fmt="json")'));
    assert.ok(!source.includes('model_path = os.path.join(MODEL_DIR, "model")'));
});

runTest('rl train: JS CPU oracle は応答timeoutを持つ', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'rl', 'js_cpu_oracle.py'), 'utf8');
    assert.ok(source.includes('timeout_seconds: float = 30.0'));
    assert.ok(source.includes('select.select'));
    assert.ok(source.includes('JS CPU oracle timed out'));
});

runTest('rl train: JS CPU oracle一時失敗は記録して合法heuristicへ一手fallbackする', () => {
    const output = runPython(`
import os
from scripts.rl import heuristic
from scripts.rl.game_env import MachikoroEnv

class FailedOracle:
    def action(self, env, level):
        raise RuntimeError("temporary timeout")
    def close(self):
        pass

os.environ["MACHIKORO_RL_JS_CPU_ORACLE"] = "1"
heuristic._JS_CPU_ORACLE = FailedOracle()
heuristic._JS_CPU_ORACLE_FAILURES = 0
env = MachikoroEnv(player_count=2)
action = heuristic.heuristic_action(env, "normal")
print(action in env.valid_actions())
print(heuristic.js_cpu_oracle_failure_count())
print(heuristic._JS_CPU_ORACLE is None)
`);
    const lines = output.split('\n');
    assert.deepStrictEqual(lines, ['True', '1', 'True']);
});

runTest('rl train: checkpoint 保存と export は cwd 配下の絶対 path でも動く', () => {
    const repoRoot = path.join(__dirname, '..');
    const baseDir = path.join(repoRoot, 'models', 'rl_model', 'tmp-abs-save');
    fs.rmSync(baseDir, { recursive: true, force: true });
    const ckptBase = path.join(baseDir, 'model');
    const exportPath = path.join(baseDir, 'model.browser.json');
    try {
        const output = runPython(`
import os
from scripts.rl.network import PolicyValueNet
from scripts.rl.export_model import export_checkpoint

base = os.path.abspath(r"${ckptBase}")
export_path = os.path.abspath(r"${exportPath}")
net = PolicyValueNet(state_dim=353, num_actions=1580, hidden=8, lr=0.0001, target_slots=3)
net.save(base)
export_checkpoint(base + ".npz", export_path)
print(os.path.exists(base + ".npz"))
print(os.path.exists(export_path))
`);
        const lines = output.split('\n');
        assert.strictEqual(lines[0], 'True');
        assert.strictEqual(lines[1], 'True');
    } finally {
        fs.rmSync(baseDir, { recursive: true, force: true });
    }
});

runTest('rl train: progress checkpoint は評価なしで最新モデルとgame位置を原子的に保存する', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rl-progress-checkpoint-'));
    try {
        const output = runPython(`
import json
import os
from scripts.rl.agent import RLAgent
from scripts.rl.train import (
    _reward_shaping_defaults,
    _reward_training_metadata,
    _save_progress_checkpoint,
    _terminal_reward_defaults,
)

model_path = os.path.join(r"${tmpDir}", "model")
agent = RLAgent(hidden=8, lr=0.0001, state_dim=353, target_slots=3)
reward_config = _reward_shaping_defaults()
reward_config["opp_coin"] = 0.008
reward_config["interaction_build"] = 0.04
reward_config["harbor_build"] = 0.03
reward_config["engine_build"] = 0.02
training_metadata = _reward_training_metadata(
    reward_config,
    _terminal_reward_defaults(),
    {
        "lossEpisodeReplayVersion": 1,
        "lossEpisodeReplayProbability": 0.25,
        "lossEpisodeReplayEpisodes": 3,
        "lossEpisodeReplaySteps": 42,
    },
)
saved = _save_progress_checkpoint(
    agent,
    model_path,
    50,
    "seed-progress",
    trained_through_game=48,
    training_metadata=training_metadata,
)
with open(saved + ".meta.json", "r", encoding="utf-8") as fh:
    meta = json.load(fh)
print(os.path.exists(saved + ".npz"))
print(os.path.exists(saved + ".browser.json"))
print(os.path.exists(saved + ".browser.json.tmp"))
print(meta["game"])
print(meta["trainedThroughGame"])
print(meta["runLabel"])
print(meta["kind"])
print(meta["rewardAccrualVersion"])
print(meta["rewardAccrualMethod"])
print(meta["rewardConfigSchemaVersion"])
print(meta["rewardConfig"]["opp_coin"])
print(meta["rewardConfig"]["interaction_build"])
print(meta["rewardConfig"]["harbor_build"])
print(meta["rewardConfig"]["engine_build"])
print(meta["curriculumConfig"]["lossEpisodeReplayVersion"])
print(meta["curriculumConfig"]["lossEpisodeReplayProbability"])
print(meta["curriculumConfig"]["lossEpisodeReplayEpisodes"])
print(meta["curriculumConfig"]["lossEpisodeReplaySteps"])
`);
        assert.deepStrictEqual(output.split('\n'), [
            'True', 'True', 'False', '50', '48', 'seed-progress', 'progress',
            '2', 'between-own-decisions-v2', '2', '0.008', '0.04', '0.03', '0.02',
            '1', '0.25',
            '3', '42',
        ]);
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
});

runTest('rl train: best browser checkpoint も一時fileから原子的に公開する', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rl-best-browser-checkpoint-'));
    try {
        const output = runPython(`
import os
from scripts.rl.agent import RLAgent
from scripts.rl.train import _export_browser_checkpoint

source = os.path.join(r"${tmpDir}", "source")
destination = os.path.join(r"${tmpDir}", "best.browser.json")
agent = RLAgent(hidden=8, lr=0.0001, state_dim=353, target_slots=3)
agent.save(source)
_export_browser_checkpoint(source, destination)
print(os.path.exists(destination))
print(os.path.exists(destination + ".tmp"))
`);
        assert.deepStrictEqual(output.split('\n'), ['True', 'False']);
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
});

runTest('rl train: pending target choice は TV target head で相手を切り替えられる', () => {
    const output = runPython(`
import numpy as np
from scripts.rl.agent import RLAgent
from scripts.rl.network import PolicyValueNet
from scripts.rl.game_env import MachikoroEnv, PHASE_PENDING
from scripts.rl.train import _apply_pending_target_choice, _encode_for_agent

env = MachikoroEnv(player_count=4)
env.current = 0
env.phase = PHASE_PENDING
env.pending_tv = 1
env.players[1].coins = 20
env.players[2].coins = 9
env.players[2].landmarks["駅"] = True
env.players[2].landmarks["港"] = True
env.players[3].coins = 1

agent = RLAgent(hidden=8, lr=0.0001, state_dim=353)
agent.net = PolicyValueNet(state_dim=353, num_actions=1580, hidden=8, lr=0.0001, target_slots=3)
agent.net.tv_target_head.W[:] = 0
agent.net.tv_target_head.b[:] = np.array([-2.0, 5.0, -3.0], dtype=np.float32)

state = _encode_for_agent(env, agent)
_apply_pending_target_choice(env, agent.net, state, epsilon=0.0, greedy=True)
print(env._target_opponent_slots())
print(env.pending_target_index)
`);
    const lines = output.split('\n');
    assert.deepStrictEqual(JSON.parse(lines[0]), [2, 1, 3]);
    assert.strictEqual(lines[1], '1');
});

runTest('rl train: target slots は脅威度同点時に席順を維持する', () => {
    const output = runPython(`
from scripts.rl.game_env import MachikoroEnv

env = MachikoroEnv(player_count=5)
env.current = 0
for player in env.players:
    player.coins = 0
print(env._target_opponent_slots())

env.players[3].coins = 5
print(env._target_opponent_slots())
`);
    const lines = output.split('\n');
    assert.deepStrictEqual(JSON.parse(lines[0]), [1, 2, 3, 4]);
    assert.deepStrictEqual(JSON.parse(lines[1]), [3, 1, 2, 4]);
});

runTest('rl train: pending business mask はtarget head選択後に選択相手へ絞る', () => {
    const output = runPython(`
import numpy as np
from scripts.rl.agent import RLAgent
from scripts.rl.network import PolicyValueNet
from scripts.rl.game_env import MachikoroEnv, PHASE_PENDING, ACT_BC_BASE
from scripts.rl.cards import CARD_INDEX, NUM_CARDS
from scripts.rl.encode import action_mask
from scripts.rl.train import _apply_pending_target_choice, _encode_for_agent

env = MachikoroEnv(player_count=4)
env.current = 0
env.phase = PHASE_PENDING
env.pending_biz = 1
env.players[0].cards["麦畑"] += 1
env.players[1].coins = 20
env.players[1].cards["鉱山"] += 1
env.players[2].coins = 12
env.players[2].landmarks["駅"] = True
env.players[2].cards["パン屋"] += 1
env.players[3].coins = 1

agent = RLAgent(hidden=8, lr=0.0001, state_dim=353)
agent.net = PolicyValueNet(state_dim=353, num_actions=1580, hidden=8, lr=0.0001, target_slots=3)
agent.net.bc_target_head.W[:] = 0
agent.net.bc_target_head.b[:] = np.array([-3.0, 4.0, -2.0], dtype=np.float32)

state = _encode_for_agent(env, agent)
_apply_pending_target_choice(env, agent.net, state, epsilon=0.0, greedy=True)
mask = action_mask(env)
give_idx = CARD_INDEX["麦畑"]
take_bread = ACT_BC_BASE + give_idx * NUM_CARDS + CARD_INDEX["パン屋"]
take_mine = ACT_BC_BASE + give_idx * NUM_CARDS + CARD_INDEX["鉱山"]
print(env._target_opponent_slots())
print(env.pending_target_index)
print(int(mask[take_bread]))
print(int(mask[take_mine]))
`);
    const lines = output.split('\n');
    assert.deepStrictEqual(JSON.parse(lines[0]), [1, 2, 3]);
    assert.strictEqual(lines[1], '2');
    assert.strictEqual(lines[2], '1');
    assert.strictEqual(lines[3], '0');
});

runTest('rl train: pending business は休業中カードだけでも合法手になる', () => {
    const output = runPython(`
from scripts.rl.game_env import MachikoroEnv, PHASE_PENDING, ACT_BC_BASE
from scripts.rl.cards import CARD_INDEX, NUM_CARDS
from scripts.rl.encode import action_mask

env = MachikoroEnv(player_count=4)
env.current = 0
env.phase = PHASE_PENDING
env.pending_biz = 1
env.set_pending_target_index(1)
env.players[0].cards["パン屋"] = 1
env.players[0].dormant["パン屋"] = 1
env.players[1].cards["寿司屋"] = 1
env.players[1].dormant["寿司屋"] = 1
mask = action_mask(env)
action = ACT_BC_BASE + CARD_INDEX["パン屋"] * NUM_CARDS + CARD_INDEX["寿司屋"]
print(int(mask[action]))
env.step(action)
print(env.players[0].cards["寿司屋"])
print(env.players[0].dormant["寿司屋"])
print(env.players[1].cards["パン屋"])
print(env.players[1].dormant["パン屋"])
`);
    const lines = output.split('\n');
    assert.strictEqual(lines[0], '1');
    assert.strictEqual(lines[1], '1');
    assert.strictEqual(lines[2], '1');
    assert.strictEqual(lines[3], '2');
    assert.strictEqual(lines[4], '1');
});

runTest('rl train: Business見送りは合法で新旧checkpoint互換を保つ', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rl-bc-skip-gate-'));
    const base = path.join(tmpDir, 'model');
    const legacy = path.join(tmpDir, 'legacy');
    const exported = path.join(tmpDir, 'model.browser.json');
    try {
        const output = runPython(`
import json
import numpy as np
from scripts.rl.cards import CARD_INDEX, NUM_CARDS
from scripts.rl.encode import action_mask
from scripts.rl.export_model import export_checkpoint
from scripts.rl.game_env import MachikoroEnv, PHASE_PENDING, ACT_BC_BASE, ACT_PASS, NUM_ACTIONS
from scripts.rl.network import PolicyValueNet
from scripts.rl.train import _greedy_action

env = MachikoroEnv(player_count=2)
env.current = 0
env.phase = PHASE_PENDING
env.pending_biz = 1
env._append_pending("pendingBusiness")
env.players[0].cards["パン屋"] = 1
env.players[1].cards["寿司屋"] = 1
mask = action_mask(env)
exchange = ACT_BC_BASE + CARD_INDEX["パン屋"] * NUM_CARDS + CARD_INDEX["寿司屋"]
assert mask[ACT_PASS] == 1 and mask[exchange] == 1
before = (env.players[0].cards["パン屋"], env.players[1].cards["寿司屋"])
env.step(ACT_PASS)
assert before == (env.players[0].cards["パン屋"], env.players[1].cards["寿司屋"])
assert env.pending_biz == 0

net = PolicyValueNet(145, NUM_ACTIONS, hidden=8, lr=0.0001)
net.policy_head.W[:] = 0
net.policy_head.b[:] = 0
net.bc_give_head.W[:] = 0
net.bc_take_head.W[:] = 0
net.bc_give_head.b[CARD_INDEX["パン屋"]] = 10
net.bc_take_head.b[CARD_INDEX["寿司屋"]] = 10
net.policy_head.b[ACT_PASS] = 20
state = np.zeros(145, dtype=np.float32)
assert _greedy_action(net, state, mask) == ACT_PASS
net.bc_skip_gate_version = 0
assert _greedy_action(net, state, mask) == exchange
net.bc_skip_gate_version = 1
net.save(r"${base}")
bundle = export_checkpoint(r"${base}.npz", r"${exported}")

data = dict(np.load(r"${base}.npz"))
del data["bc_skip_gate_version"]
np.savez(r"${legacy}.npz", **data)
loaded = PolicyValueNet(145, NUM_ACTIONS, hidden=8, lr=0.0001)
loaded.load(r"${legacy}")
legacy_bundle = export_checkpoint(r"${legacy}.npz", r"${exported}.legacy")
print(json.dumps([bundle["businessSkipGateVersion"], loaded.bc_skip_gate_version, legacy_bundle["businessSkipGateVersion"]]))
`);
        assert.deepStrictEqual(JSON.parse(output), [1, 0, 0]);
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
});

runTest('rl train: Business見送りgateは全action softmaxのunderflowに影響されない', () => {
    const output = runPython(`
import numpy as np
from scripts.rl.cards import NUM_CARDS
from scripts.rl.game_env import ACT_BC_BASE, ACT_PASS, NUM_ACTIONS
from scripts.rl.train import _select_action

exchange = ACT_BC_BASE
mask = np.zeros(NUM_ACTIONS, dtype=np.float32)
mask[ACT_PASS] = 1.0
mask[exchange] = 1.0

class ExtremeGateNet:
    bc_skip_gate_version = 1

    def forward_bc_gate_details(self, state):
        policy = np.zeros(NUM_ACTIONS, dtype=np.float32)
        give = np.zeros(NUM_CARDS, dtype=np.float32)
        take = np.zeros(NUM_CARDS, dtype=np.float32)
        give[0] = 1.0
        take[0] = 1.0
        logits = np.full(NUM_ACTIONS, -1000.0, dtype=np.float32)
        logits[ACT_PASS] = -100.0
        logits[exchange] = 100.0
        logits[1] = 1000.0
        return policy, give, take, 0.0, logits, np.zeros(NUM_CARDS), np.zeros(NUM_CARDS)

np.random.seed(9)
actions = [_select_action(ExtremeGateNet(), np.zeros(145), mask, 0.0)[0] for _ in range(20)]
print(all(action == exchange for action in actions))
`);
    assert.strictEqual(output, 'True');
});

runTest('rl train: pending business は渡す側を休業優先・奪う側をactive優先にする', () => {
    const output = runPython(`
from scripts.rl.game_env import MachikoroEnv, PHASE_PENDING, ACT_BC_BASE
from scripts.rl.cards import CARD_INDEX, NUM_CARDS

env = MachikoroEnv(player_count=2)
env.current = 0
env.phase = PHASE_PENDING
env.pending_biz = 1
env.players[0].cards["カフェ"] = 2
env.players[0].dormant["カフェ"] = 1
env.players[1].cards["パン屋"] = 2
env.players[1].dormant["パン屋"] = 1
action = ACT_BC_BASE + CARD_INDEX["カフェ"] * NUM_CARDS + CARD_INDEX["パン屋"]
env.step(action)
print(env.players[0].cards["パン屋"])
print(env.players[0].dormant["パン屋"])
print(env.players[1].cards["カフェ"])
print(env.players[1].dormant["カフェ"])
`);
    const lines = output.split('\n');
    assert.strictEqual(lines[0], '2');
    assert.strictEqual(lines[1], '0');
    assert.strictEqual(lines[2], '1');
    assert.strictEqual(lines[3], '1');
});

runTest('rl train: pending mover は休業中カードだけでも合法手になり休業状態ごと移動する', () => {
    const output = runPython(`
from scripts.rl.game_env import MachikoroEnv, PHASE_PENDING, ACT_MOVER_BASE
from scripts.rl.cards import CARD_INDEX
from scripts.rl.encode import action_mask

env = MachikoroEnv(player_count=4)
env.current = 0
env.phase = PHASE_PENDING
env.pending_mover = 1
env.set_pending_target_index(2)
env.players[0].cards["パン屋"] = 1
env.players[0].dormant["パン屋"] = 1
mask = action_mask(env)
action = ACT_MOVER_BASE + CARD_INDEX["パン屋"]
print(int(mask[action]))
env.step(action)
print(env.players[0].cards["パン屋"])
print(env.players[0].dormant["パン屋"])
print(env.players[2].cards["パン屋"])
print(env.players[2].dormant["パン屋"])
`);
    const lines = output.split('\n');
    assert.strictEqual(lines[0], '1');
    assert.strictEqual(lines[1], '0');
    assert.strictEqual(lines[2], '0');
    assert.strictEqual(lines[3], '2');
    assert.strictEqual(lines[4], '1');
});

runTest('rl train: cleaning pending はJSと同じく休業可能施設がない時は立たない', () => {
    const output = runPython(`
from scripts.rl.game_env import MachikoroEnv

env = MachikoroEnv(player_count=2)
env.current = 0
for player in env.players:
    for name in list(player.cards.keys()):
        player.cards[name] = 0
        player.dormant[name] = 0
env.players[0].cards["清掃業"] = 1
env._proc_purple(env.players[0], 0, 8)
print(env.pending_clean)
print(env.pending_action_queue)

env.players[1].cards["パン屋"] = 1
env._proc_purple(env.players[0], 0, 8)
print(env.pending_clean)
print(env.pending_action_queue)
`);
    const lines = output.split('\n');
    assert.strictEqual(lines[0], '0');
    assert.strictEqual(lines[1], '[]');
    assert.strictEqual(lines[2], '1');
    assert.strictEqual(lines[3], "['pendingCleaning']");
});

runTest('rl train: 公式ルール修正後の休業・連携・清掃・公園・モール収入をJSと共有する', () => {
    const output = runPython(`
import json
from scripts.rl.cards import CARD_DEF, CARD_INDEX
from scripts.rl.game_env import MachikoroEnv, PHASE_PENDING, ACT_CLEAN_BASE, ACT_RENO_BASE, ACT_TV_TARGET, LANDMARK_INDEX

combo = MachikoroEnv(player_count=2)
p = combo.players[0]
p.cards["牧場"] = 2
p.dormant["牧場"] = 1
p.cards["チーズ工場"] = 1
cheese = combo._calc_green(CARD_DEF["チーズ工場"], p, 1)
p.cards["花畑"] = 1
p.dormant["花畑"] = 1
p.landmarks["ショッピングモール"] = True
flower = combo._calc_green(CARD_DEF["フラワーショップ"], p, 1)
p.cards["カフェ"] = 1
p.dormant["カフェ"] = 1
combo.players[1].cards["カフェ"] = 1
food_warehouse = combo._calc_green(CARD_DEF["食品倉庫"], p, 1)
drink_factory = combo._calc_green(CARD_DEF["ドリンク工場"], p, 1)

cleaning = MachikoroEnv(player_count=3)
cleaning.phase = PHASE_PENDING
cleaning.pending_clean = 1
cleaning.players[0].cards["カフェ"] = 1
cleaning.players[1].cards["カフェ"] = 2
cleaning.players[2].cards["カフェ"] = 2
cleaning.players[0].coins = 3
cleaning.players[1].coins = 5
cleaning.players[2].coins = 1
cleaning.step(ACT_CLEAN_BASE + CARD_INDEX["カフェ"])

park = MachikoroEnv(player_count=3)
park.players[0].cards["公園"] = 1
park.players[0].coins, park.players[1].coins, park.players[2].coins = 1, 1, 2
park._proc_purple(park.players[0], 0, 11)

dormant = MachikoroEnv(player_count=2)
cur, owner = dormant.players
cur.cards["麦畑"] = cur.cards["パン屋"] = 0
owner.cards["高級フレンチ"] = 1
owner.dormant["高級フレンチ"] = 1
dormant._proc_red(cur, 0, 5)
blocked_french = owner.dormant["高級フレンチ"]
cur.landmarks["駅"] = cur.landmarks["港"] = True
dormant._proc_red(cur, 0, 5)
revived_french = owner.dormant["高級フレンチ"]

winery = MachikoroEnv(player_count=2)
wp = winery.players[0]
wp.cards["ワイナリー"] = 2
wp.dormant["ワイナリー"] = 1
wp.cards["ブドウ園"] = 1
before_winery = wp.coins
winery._proc_green(wp, 0, 9)

reno = MachikoroEnv(player_count=2)
rp = reno.players[0]
reno.phase = PHASE_PENDING
reno.pending_reno = 1
rp.landmarks["ショッピングモール"] = True
rp.landmarks["駅"] = True
rp.coins = 0
reno.step(ACT_RENO_BASE + LANDMARK_INDEX["駅"])

city_hall = MachikoroEnv(player_count=2)
chp = city_hall.players[0]
chp.cards["麦畑"] = chp.cards["パン屋"] = 0
chp.cards["テレビ局"] = 1
chp.coins = 0
city_hall.players[1].coins = 5
city_hall.last_dice = 6
city_hall._process_income()
city_hall_before_pending = chp.coins
city_hall.step(ACT_TV_TARGET)

tuna = MachikoroEnv(player_count=2)
for player in tuna.players:
    for name in list(player.cards.keys()):
        player.cards[name] = 0
        player.dormant[name] = 0
    player.landmarks["港"] = True
tuna.players[0].cards["マグロ漁船"] = 2
tuna.players[1].cards["マグロ漁船"] = 1
tuna_before = [player.coins for player in tuna.players]
tuna_rolls = iter([3, 4, 6, 6])
tuna_roll_count = [0]
def fixed_tuna_roll():
    tuna_roll_count[0] += 1
    return next(tuna_rolls)
tuna._roll = fixed_tuna_roll
tuna._proc_blue(12)

print(json.dumps({
    "cheese": cheese,
    "flower": flower,
    "foodWarehouse": food_warehouse,
    "drinkFactory": drink_factory,
    "cleaningCoins": [pl.coins for pl in cleaning.players],
    "cleaningDormant": [pl.dormant["カフェ"] for pl in cleaning.players],
    "parkCoins": [pl.coins for pl in park.players],
    "blockedFrench": blocked_french,
    "revivedFrench": revived_french,
    "wineryGain": wp.coins - before_winery,
    "wineryDormant": wp.dormant["ワイナリー"],
    "renovationCoins": rp.coins,
    "cityHallBeforePending": city_hall_before_pending,
    "cityHallAfterIncome": chp.coins,
    "tunaGains": [player.coins - before for player, before in zip(tuna.players, tuna_before)],
    "tunaRollCount": tuna_roll_count[0],
}, ensure_ascii=False))
`);
    assert.deepStrictEqual(JSON.parse(output), {
        cheese: 6,
        flower: 2,
        foodWarehouse: 2,
        drinkFactory: 2,
        cleaningCoins: [8, 5, 1],
        cleaningDormant: [1, 2, 2],
        parkCoins: [2, 2, 2],
        blockedFrench: 1,
        revivedFrench: 0,
        wineryGain: 6,
        wineryDormant: 1,
        renovationCoins: 9,
        cityHallBeforePending: 0,
        cityHallAfterIncome: 5,
        tunaGains: [14, 7],
        tunaRollCount: 2,
    });
});

runTest('rl envは施設取得順と複数pendingの発動順をJSと共有する', () => {
    const runtime = loadGameRuntime();
    const game = new runtime.GameManager(4);
    game.currentPlayerIndex = 0;
    game.phase = runtime.GAME_PHASES.ROLL;
    for (const player of game.players) {
        player.cards = [];
        player.dormantCards = [];
        player.coins = 3;
    }
    game.players[0].cards = [
        runtime.createCardByName('ビジネスセンター'),
        runtime.createCardByName('テレビ局'),
        runtime.createCardByName('スタジアム'),
        runtime.createCardByName('パン屋'),
    ];
    game.players[1].cards = [runtime.createCardByName('カフェ')];
    game.players[2].cards = [runtime.createCardByName('牧場')];
    game.players[3].cards = [runtime.createCardByName('麦畑')];
    game.lastDiceResult = 6;
    game.processIncome();
    const jsQueue = Array.from(game.pendingActionQueue, entry => entry.field);

    const output = runPython(`
import json
from scripts.rl.game_env import MachikoroEnv

env = MachikoroEnv(player_count=4)
for player in env.players:
    for name in player.cards:
        player.cards[name] = 0
        player.dormant[name] = 0
    player.card_order = []
    player.coins = 3

actor = env.players[0]
for name in ["ビジネスセンター", "テレビ局", "スタジアム", "パン屋"]:
    env._add_one_card(actor, name)
env._add_one_card(env.players[1], "カフェ")
env._add_one_card(env.players[2], "牧場")
env._add_one_card(env.players[3], "麦畑")
env._proc_purple(actor, 0, 6)
print(json.dumps({"queue": env.pending_action_queue, "order": actor.card_order}, ensure_ascii=False))
`);
    const python = JSON.parse(output);
    assert.deepStrictEqual(python.queue, jsQueue);
    assert.deepStrictEqual(python.order, Array.from(game.players[0].cards, card => card.name));
});

runTest('rl envはbuild・mover・business交換で施設取得順を同期する', () => {
    const output = runPython(`
import json
from scripts.rl.cards import CARD_INDEX
from scripts.rl.game_env import MachikoroEnv, PHASE_BUILD, PHASE_PENDING, ACT_BUY_CARD_BASE, ACT_BC_BASE

build = MachikoroEnv(player_count=2)
build.phase = PHASE_BUILD
build.players[0].coins = 20
build.step(ACT_BUY_CARD_BASE + CARD_INDEX["ビジネスセンター"])

mover = MachikoroEnv(player_count=2)
mover._add_one_card(mover.players[0], "引越し屋")
mover._transfer_one_card(mover.players[0], mover.players[1], "パン屋")

business = MachikoroEnv(player_count=2)
business.phase = PHASE_PENDING
business.pending_biz = 1
business._append_pending("pendingBusiness")
business._add_one_card(business.players[1], "カフェ")
give = CARD_INDEX["パン屋"]
take = CARD_INDEX["カフェ"]
business.step(ACT_BC_BASE + give * len(CARD_INDEX) + take)

print(json.dumps({
    "build": build.players[0].card_order,
    "moverActor": mover.players[0].card_order,
    "moverTarget": mover.players[1].card_order,
    "businessActor": business.players[0].card_order,
    "businessTarget": business.players[1].card_order,
}, ensure_ascii=False))
`);
    const result = JSON.parse(output);
    assert.strictEqual(result.build.at(-1), 'ビジネスセンター');
    assert.deepStrictEqual(result.moverActor, ['麦畑', '引越し屋']);
    assert.deepStrictEqual(result.moverTarget, ['麦畑', 'パン屋', 'パン屋']);
    assert.deepStrictEqual(result.businessActor, ['麦畑', 'カフェ']);
    assert.deepStrictEqual(result.businessTarget, ['麦畑', 'パン屋', 'パン屋']);
});

runTest('rl envは同名のactive/休業が混在するBusinessとMoverでJSの取得順を保つ', () => {
    const runtime = loadGameRuntime();
    const resetPlayer = player => {
        player.cards = [];
        player.dormantCards = [];
    };
    const addCard = (player, name, dormant = false) => {
        const card = runtime.createCardByName(name);
        player.cards.push(card);
        if (dormant) player.makeDormant(card);
    };
    const snapshotPlayer = player => ({
        order: player.cards.map(card => card.name),
        dormantOrder: player.cards.map(card => player.isDormant(card)),
    });

    const business = new runtime.GameManager(2);
    business.phase = runtime.GAME_PHASES.PENDING;
    business.pendingBusiness = 1;
    business.pendingActionQueue = [{ field: 'pendingBusiness', action: 'resolveBusiness' }];
    business.players.forEach(resetPlayer);
    addCard(business.players[0], 'パン屋', true);
    addCard(business.players[0], 'コンビニ');
    addCard(business.players[0], 'パン屋');
    addCard(business.players[1], 'カフェ', true);
    addCard(business.players[1], 'コンビニ');
    addCard(business.players[1], 'カフェ');
    assert.strictEqual(business.resolveBusiness(0, 1, 2), true);

    const mover = new runtime.GameManager(2);
    mover.phase = runtime.GAME_PHASES.PENDING;
    mover.pendingMover = 1;
    mover.pendingActionQueue = [{ field: 'pendingMover', action: 'resolveMover' }];
    mover.players.forEach(resetPlayer);
    addCard(mover.players[0], 'カフェ');
    addCard(mover.players[0], 'コンビニ');
    addCard(mover.players[0], 'カフェ', true);
    addCard(mover.players[1], '麦畑');
    assert.strictEqual(mover.resolveMover(2, 1), true);

    const output = runPython(`
import json
from scripts.rl.cards import CARD_INDEX
from scripts.rl.game_env import MachikoroEnv, PHASE_PENDING, ACT_BC_BASE, ACT_MOVER_BASE
from scripts.rl.js_cpu_oracle import env_to_js_state

def reset_player(player):
    for name in player.cards:
        player.cards[name] = 0
        player.dormant[name] = 0
    player.card_order = []
    player.card_order_dormant = []

def snapshot(player):
    return {"order": player.card_order, "dormantOrder": player.card_order_dormant}

business = MachikoroEnv(player_count=2)
business.phase = PHASE_PENDING
business.pending_biz = 1
business._append_pending("pendingBusiness")
for player in business.players:
    reset_player(player)
business._add_one_card(business.players[0], "パン屋", True)
business._add_one_card(business.players[0], "コンビニ")
business._add_one_card(business.players[0], "パン屋")
business._add_one_card(business.players[1], "カフェ", True)
business._add_one_card(business.players[1], "コンビニ")
business._add_one_card(business.players[1], "カフェ")
give = CARD_INDEX["パン屋"]
take = CARD_INDEX["カフェ"]
business.step(ACT_BC_BASE + give * len(CARD_INDEX) + take)

mover = MachikoroEnv(player_count=2)
mover.phase = PHASE_PENDING
mover.pending_mover = 1
mover._append_pending("pendingMover")
for player in mover.players:
    reset_player(player)
mover._add_one_card(mover.players[0], "カフェ")
mover._add_one_card(mover.players[0], "コンビニ")
mover._add_one_card(mover.players[0], "カフェ", True)
mover._add_one_card(mover.players[1], "麦畑")
mover.step(ACT_MOVER_BASE + CARD_INDEX["カフェ"])

clone = mover.clone()
oracle_state = env_to_js_state(mover)
print(json.dumps({
    "businessActor": snapshot(business.players[0]),
    "businessTarget": snapshot(business.players[1]),
    "moverActor": snapshot(mover.players[0]),
    "moverTarget": snapshot(mover.players[1]),
    "cloneTarget": snapshot(clone.players[1]),
    "oracleDormantOrder": oracle_state["players"][1]["cardDormantOrder"],
}, ensure_ascii=False))
`);
    const python = JSON.parse(output);
    assert.deepStrictEqual(python.businessActor, snapshotPlayer(business.players[0]));
    assert.deepStrictEqual(python.businessTarget, snapshotPlayer(business.players[1]));
    assert.deepStrictEqual(python.moverActor, snapshotPlayer(mover.players[0]));
    assert.deepStrictEqual(python.moverTarget, snapshotPlayer(mover.players[1]));
    assert.deepStrictEqual(python.cloneTarget, snapshotPlayer(mover.players[1]));
    assert.deepStrictEqual(python.oracleDormantOrder, snapshotPlayer(mover.players[1]).dormantOrder);
});

runTest('rl envは多人数の赤施設支払いを手番から反時計回りに処理する', () => {
    const output = runPython(`
from scripts.rl.game_env import MachikoroEnv
env = MachikoroEnv(player_count=4)
env.current = 2
for player in env.players:
    player.cards["麦畑"] = 0
    player.cards["パン屋"] = 0
    player.coins = 0
env.players[2].coins = 3
for index in (0, 1, 3):
    env.players[index].cards["カフェ"] = 2
env._proc_red(env.players[2], 2, 3)
print([player.coins for player in env.players])
`);
    assert.strictEqual(output, '[1, 2, 0, 0]');
});

runTest('rl train: mover と business pending は JS と同じ発動条件で立つ', () => {
    const output = runPython(`
from scripts.rl.game_env import MachikoroEnv
from scripts.rl.cards import CARD_INDEX

env = MachikoroEnv(player_count=2)
env.current = 0
env.players[0].cards["引越し屋"] = 2
env._proc_green(env.players[0], 0, 9)
print(env.pending_mover)

env2 = MachikoroEnv(player_count=2)
env2.current = 0
env2.players[0].cards["ビジネスセンター"] = 1
env2.players[0].cards["麦畑"] = 0
env2.players[0].cards["パン屋"] = 0
env2._proc_purple(env2.players[0], 0, 6)
print(env2.pending_biz)

env3 = MachikoroEnv(player_count=2)
env3.current = 0
env3.players[0].cards["ビジネスセンター"] = 1
env3._proc_purple(env3.players[0], 0, 6)
print(env3.pending_biz)
`);
    const lines = output.split('\n');
    assert.strictEqual(lines[0], '2');
    assert.strictEqual(lines[1], '0');
    assert.strictEqual(lines[2], '1');
});

runTest('rl train: pending target fallback はTV/Businessの合法対象を優先する', () => {
    const output = runPython(`
from scripts.rl.game_env import MachikoroEnv

env = MachikoroEnv(player_count=3)
env.current = 0
env.pending_tv = 1
env.players[1].coins = 0
env.players[2].coins = 4
print(env._pending_target_index())

env2 = MachikoroEnv(player_count=3)
env2.current = 0
env2.pending_biz = 1
for name in list(env2.players[1].cards.keys()):
    env2.players[1].cards[name] = 0
    env2.players[1].dormant[name] = 0
env2.players[2].cards["カフェ"] = 1
print(env2._pending_target_index())
`);
    const lines = output.split('\n');
    assert.strictEqual(lines[0], '2');
    assert.strictEqual(lines[1], '2');
});

runTest('rl train: train は TV target head を更新できる', () => {
    const output = runPython(`
import numpy as np
from scripts.rl.agent import RLAgent

agent = RLAgent(hidden=8, lr=0.001, state_dim=353, target_slots=3)
before = agent.net.tv_target_head.b.copy()
state = np.zeros(353, dtype=np.float32)
mask = np.zeros(1580, dtype=np.float32)
mask[0] = 1.0
mask[1] = 1.0
for action, reward, slot in ((0, 1.0, 1), (1, -1.0, 2)):
    agent.states.append(state.copy())
    agent.actions.append(action)
    agent.masks.append(mask.copy())
    agent.target_kinds.append("tv")
    agent.target_slots.append(slot)
    agent.target_masks.append(np.array([1.0, 1.0, 1.0], dtype=np.float32))
    agent.values.append(0.0)
    agent.rewards.append(reward)
    agent.next_values.append(0.0)
    agent.dones.append(True)
stats = agent.train()
after = agent.net.tv_target_head.b
print(np.any(np.abs(after - before) > 1e-12))
print("policy_loss" in stats and "value_loss" in stats)
print(stats["target_pending_rate"] > 0 and stats["target_update_rate"] > 0 and stats["tv_target_rate"] > 0)
`);
    const lines = output.split('\n');
    assert.strictEqual(lines[0], 'True');
    assert.strictEqual(lines[1], 'True');
    assert.strictEqual(lines[2], 'True');
});

runTest('rl train: target oversampling は4人target遷移だけを増やす', () => {
    const output = runPython(`
import numpy as np
import random
from scripts.rl.agent import RLAgent
from scripts.rl.train import _oversample_target_transitions

random.seed(4)
agent = RLAgent(hidden=8, lr=0.001, state_dim=353, target_slots=3)
state = np.zeros(353, dtype=np.float32)
mask = np.zeros(1580, dtype=np.float32)
mask[0] = 1.0
for index in range(10):
    agent.states.append(state.copy())
    agent.actions.append(0)
    agent.masks.append(mask.copy())
    agent.target_kinds.append("tv" if index == 0 else None)
    agent.target_slots.append(1 if index == 0 else None)
    agent.target_masks.append(np.array([1.0, 1.0, 1.0], dtype=np.float32))
    agent.values.append(0.0)
    agent.rewards.append(0.0)
    agent.next_values.append(0.0)
    agent.dones.append(index == 9)
added = _oversample_target_transitions(agent, 0.25)
target_count = sum(1 for kind in agent.target_kinds if kind == "tv")
print(added)
print(len(agent.rewards))
effective_total = len(agent.rewards) - target_count + target_count * agent.target_loss_weight
print((target_count * agent.target_loss_weight) / effective_total >= 0.25)
print(agent.dones == [False] * 9 + [True])
stats = agent.train()
print(stats["target_loss_weight"] > 1)
print(agent.target_loss_weight == 1)
`);
    const lines = output.split('\n');
    assert.ok(Number(lines[0]) > 0);
    assert.strictEqual(Number(lines[1]), 10);
    assert.strictEqual(lines[2], 'True');
    assert.strictEqual(lines[3], 'True');
    assert.strictEqual(lines[4], 'True');
    assert.strictEqual(lines[5], 'True');
});

runTest('rl train: target oversampling は2人互換モデルではno-op', () => {
    const output = runPython(`
import numpy as np
from scripts.rl.agent import RLAgent
from scripts.rl.train import _oversample_target_transitions

agent = RLAgent(hidden=8, lr=0.001, state_dim=145, target_slots=0)
state = np.zeros(145, dtype=np.float32)
mask = np.zeros(1580, dtype=np.float32)
mask[0] = 1.0
agent.states.append(state.copy())
agent.actions.append(0)
agent.masks.append(mask.copy())
agent.target_kinds.append("tv")
agent.target_slots.append(0)
agent.target_masks.append(np.zeros(0, dtype=np.float32))
agent.values.append(0.0)
agent.rewards.append(0.0)
agent.next_values.append(0.0)
agent.dones.append(True)
print(_oversample_target_transitions(agent, 0.5))
print(len(agent.rewards))
`);
    const lines = output.split('\n');
    assert.strictEqual(lines[0], '0');
    assert.strictEqual(lines[1], '1');
});

runTest('rl train: rare pending oversampling は2人BC交換・見送り遷移を重み付けする', () => {
    const output = runPython(`
import numpy as np
import random
from scripts.rl.agent import RLAgent
from scripts.rl.cards import NUM_CARDS
from scripts.rl.game_env import ACT_BC_BASE, ACT_PASS
from scripts.rl.train import _oversample_rare_pending_transitions

random.seed(5)
agent = RLAgent(hidden=8, lr=0.001, state_dim=145, target_slots=0)
state = np.zeros(145, dtype=np.float32)
for index in range(10):
    mask = np.zeros(1580, dtype=np.float32)
    action = ACT_PASS if index == 0 else 0
    mask[action] = 1.0
    if index == 0:
        mask[ACT_BC_BASE + NUM_CARDS] = 1.0
        mask[ACT_BC_BASE + NUM_CARDS + 1] = 1.0
    agent.states.append(state.copy())
    agent.actions.append(action)
    agent.masks.append(mask)
    agent.target_kinds.append(None)
    agent.target_slots.append(None)
    agent.target_masks.append(np.zeros(0, dtype=np.float32))
    agent.values.append(0.0)
    agent.rewards.append(0.0)
    agent.next_values.append(0.0)
    agent.dones.append(index == 9)
added = _oversample_rare_pending_transitions(agent, 0.25)
bc_count = sum(1 for mask in agent.masks if mask[ACT_BC_BASE:ACT_BC_BASE + NUM_CARDS * NUM_CARDS].any())
print(added)
print(len(agent.rewards))
effective_total = len(agent.rewards) - bc_count + bc_count * agent.rare_pending_loss_weight
print((bc_count * agent.rare_pending_loss_weight) / effective_total >= 0.25)
print(agent.dones == [False] * 9 + [True])
stats = agent.train()
print(stats["rare_pending_loss_weight"] > 1)
print(agent.rare_pending_loss_weight == 1)
`);
    const lines = output.split('\n');
    assert.ok(Number(lines[0]) > 0);
    assert.strictEqual(Number(lines[1]), 10);
    assert.strictEqual(lines[2], 'True');
    assert.strictEqual(lines[3], 'True');
    assert.strictEqual(lines[4], 'True');
    assert.strictEqual(lines[5], 'True');
});

runTest('rl train: rare pending oversampling はtargetだけの遷移をBusiness件数へ混ぜない', () => {
    const output = runPython(`
import numpy as np
from scripts.rl.agent import RLAgent
from scripts.rl.game_env import ACT_TV_TARGET
from scripts.rl.train import _has_rare_pending_transition

agent = RLAgent(hidden=8, lr=0.001, state_dim=353, target_slots=3)
agent.actions.append(ACT_TV_TARGET)
mask = np.zeros(1580, dtype=np.float32)
mask[ACT_TV_TARGET] = 1.0
agent.masks.append(mask)
agent.rewards.append(0.0)
agent.target_kinds.append("tv")
agent.target_slots.append(0)
agent.target_masks.append(np.ones(3, dtype=np.float32))
print(_has_rare_pending_transition(agent, 0))
`);
    assert.strictEqual(output, 'False');
});

runTest('rl train: train は BC target head を give/take と同時に更新できる', () => {
    const output = runPython(`
import numpy as np
from scripts.rl.agent import RLAgent
from scripts.rl.game_env import ACT_BC_BASE
from scripts.rl.cards import NUM_CARDS

agent = RLAgent(hidden=8, lr=0.001, state_dim=353, target_slots=3)
before = agent.net.bc_target_head.b.copy()
state = np.zeros(353, dtype=np.float32)
mask = np.zeros(1580, dtype=np.float32)
action = ACT_BC_BASE + 0 * NUM_CARDS + 1
mask[action] = 1.0
mask[ACT_BC_BASE + 0 * NUM_CARDS + 2] = 1.0
mask[ACT_BC_BASE + 2 * NUM_CARDS + 1] = 1.0
for chosen_action, reward, slot in (
    (action, 1.0, 2),
    (ACT_BC_BASE + 2 * NUM_CARDS + 1, -1.0, 1),
):
    agent.states.append(state.copy())
    agent.actions.append(chosen_action)
    agent.masks.append(mask.copy())
    agent.target_kinds.append("bc")
    agent.target_slots.append(slot)
    agent.target_masks.append(np.array([1.0, 1.0, 1.0], dtype=np.float32))
    agent.values.append(0.0)
    agent.rewards.append(reward)
    agent.next_values.append(0.0)
    agent.dones.append(True)
stats = agent.train()
after = agent.net.bc_target_head.b
print(np.any(np.abs(after - before) > 1e-12))
print("policy_loss" in stats and "value_loss" in stats)
print(stats["target_pending_rate"] > 0 and stats["target_update_rate"] > 0 and stats["bc_target_rate"] > 0 and stats["bc_action_rate"] > 0)
`);
    const lines = output.split('\n');
    assert.strictEqual(lines[0], 'True');
    assert.strictEqual(lines[1], 'True');
    assert.strictEqual(lines[2], 'True');
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

runTest('rl train: 4人用モデルでも2人評価は4人用状態次元で実行できる', () => {
    const output = runPython(`
import random
import numpy as np
from scripts.rl.agent import RLAgent
from scripts.rl.encode import STATE_DIM_4P
from scripts.rl.train import eval_vs_random
random.seed(5)
np.random.seed(5)
agent = RLAgent(hidden=8, lr=0.0001, state_dim=STATE_DIM_4P)
result = eval_vs_random(agent, 1, max_steps=5, return_stats=True)
print(agent.state_dim)
print(sorted(result.keys()))
`);
    const lines = output.split('\n');
    assert.ok(Number(lines[0]) > 145);
    assert.ok(lines[1].includes('winRate'));
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

runTest('rl train: 相手ターンの変化を直前の自分の行動報酬へ加算する', () => {
    const output = runPython(`
import copy
from scripts.rl.game_env import MachikoroEnv
from scripts.rl.train import _accrue_interturn_rewards, _reward_shaping_defaults

before = MachikoroEnv()
after = copy.deepcopy(before)
after.players[1].coins += 5
rewards = [[0.1], [0.2]]
config = _reward_shaping_defaults()
config["opp_coin"] = 0.008
_accrue_interturn_rewards(rewards, before, after, 1, config)
print(round(rewards[0][-1], 6))
print(round(rewards[1][-1], 6))
`);
    const lines = output.split('\n');
    assert.strictEqual(lines[0], '0.06');
    assert.strictEqual(lines[1], '0.2');
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

runTest('rl train: 購入可能なbuild passにだけ中間ペナルティを付けられる', () => {
    const output = runPython(`
import copy
from scripts.rl.game_env import MachikoroEnv, PHASE_BUILD, PHASE_ROLL, ACT_PASS, ACT_ROLL1
from scripts.rl.train import _compute_shaped_reward
config = {
    "coin": 0.0,
    "opp_coin": 0.0,
    "asset": 0.0,
    "opp_asset": 0.0,
    "landmark": 0.0,
    "opp_landmark": 0.0,
    "build_pass_affordable_penalty": 0.02,
    "clip": 0.3,
}
before = MachikoroEnv()
before.phase = PHASE_BUILD
after = copy.deepcopy(before)
print(round(_compute_shaped_reward(before, after, 0, config, action=ACT_PASS), 6))
before.players[0].coins = 0
before.built_this_turn = True
after = copy.deepcopy(before)
print(round(_compute_shaped_reward(before, after, 0, config, action=ACT_PASS), 6))
before = MachikoroEnv()
before.phase = PHASE_BUILD
after = copy.deepcopy(before)
print(round(_compute_shaped_reward(before, after, 0, config, action=ACT_ROLL1), 6))
before = MachikoroEnv()
before.phase = PHASE_ROLL
after = copy.deepcopy(before)
print(round(_compute_shaped_reward(before, after, 0, config, action=ACT_PASS), 6))
before = MachikoroEnv()
before.phase = PHASE_BUILD
before.current = 1
after = copy.deepcopy(before)
print(round(_compute_shaped_reward(before, after, 0, config, action=ACT_PASS), 6))
`);
    const lines = output.split('\n');
    assert.strictEqual(lines[0], '-0.02');
    assert.strictEqual(lines[1], '0.0');
    assert.strictEqual(lines[2], '0.0');
    assert.strictEqual(lines[3], '0.0');
    assert.strictEqual(lines[4], '0.0');
});

runTest('rl train: 成立した戦略別建設にだけ固有の中間報酬を付ける', () => {
    const output = runPython(`
import copy
from scripts.rl.cards import CARD_INDEX, LANDMARK_ORDER
from scripts.rl.game_env import MachikoroEnv, ACT_BUY_CARD_BASE, ACT_BUY_LM_BASE
from scripts.rl.train import _compute_shaped_reward, _reward_shaping_defaults

def reward_for_card(name, key, value):
    before = MachikoroEnv()
    after = copy.deepcopy(before)
    after.players[0].cards[name] += 1
    config = _reward_shaping_defaults()
    config.update({"landmark": 0.0, "clip": 0.0, key: value})
    action = ACT_BUY_CARD_BASE + CARD_INDEX[name]
    return _compute_shaped_reward(before, after, 0, config, action=action)

print(round(reward_for_card("カフェ", "interaction_build", 0.04), 6))
print(round(reward_for_card("サンマ漁船", "harbor_build", 0.04), 6))
print(round(reward_for_card("パン屋", "engine_build", 0.02), 6))
before = MachikoroEnv()
after = copy.deepcopy(before)
after.players[0].landmarks["港"] = True
config = _reward_shaping_defaults()
config.update({"landmark": 0.0, "harbor_build": 0.04, "clip": 0.0})
action = ACT_BUY_LM_BASE + LANDMARK_ORDER.index("港")
print(round(_compute_shaped_reward(before, after, 0, config, action=action), 6))
print(round(_compute_shaped_reward(before, before, 0, config, action=action), 6))
`);
    assert.deepStrictEqual(output.split('\n'), ['0.04', '0.04', '0.02', '0.04', '0.0']);
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

runTest('rl train: 終局報酬に空港未達の進捗を加算できる', () => {
    const output = runPython(`
from scripts.rl.game_env import MachikoroEnv
from scripts.rl.train import _compute_terminal_reward
config = {
    "win": 1.0,
    "loss": -1.0,
    "draw": -0.2,
    "landmark_diff": 0.0,
    "landmark_value_diff": 0.0,
    "asset_diff": 0.0,
    "coin_diff": 0.0,
    "diff_clip": 30,
    "airport_progress": 0.001,
    "airport_progress_clip": 30,
}
env = MachikoroEnv()
env.winner = 1
env.players[0].coins = 20
print(round(_compute_terminal_reward(env, 0, config), 6))
env.players[0].landmarks["空港"] = True
print(round(_compute_terminal_reward(env, 0, config), 6))
`);
    assert.strictEqual(output, '-0.98\n-1.0');
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

runTest('rl train: 模倣学習はBusiness交換見送りgateを更新する', () => {
    const output = runPython(`
import json
from scripts.rl.agent import RLAgent
from scripts.rl.encode import encode_state, action_mask
from scripts.rl.game_env import MachikoroEnv, PHASE_PENDING, ACT_PASS
from scripts.rl.train import _train_imitation_step
agent = RLAgent(hidden=16, lr=0.001)
env = MachikoroEnv()
env.phase = PHASE_PENDING
env.pending_biz = 1
env._append_pending("pendingBusiness")
env.players[0].cards["食品倉庫"] = 1
env.players[1].cards["麦畑"] = 1
state = encode_state(env)
mask = action_mask(env)
before = float(agent.net.policy_head.b[ACT_PASS])
result = _train_imitation_step(agent, state, mask, ACT_PASS)
after = float(agent.net.policy_head.b[ACT_PASS])
print(json.dumps({"result": result, "changed": after != before}))
`);
    const result = JSON.parse(output);
    assert.strictEqual(result.result.trained, true);
    assert.ok(result.result.loss > 0);
    assert.strictEqual(result.changed, true);
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

runTest('rl train: 模倣事前学習は指定間隔と完了時に進捗を通知する', () => {
    const output = runPython(`
import json
import random
import numpy as np
from scripts.rl.agent import RLAgent
from scripts.rl.train import run_imitation_pretraining
random.seed(1)
np.random.seed(1)
agent = RLAgent(hidden=16, lr=0.001)
progress = []
run_imitation_pretraining(
    agent,
    games=3,
    opponents=["weak"],
    max_steps=1,
    progress_every=2,
    progress_callback=lambda completed, total: progress.append([completed, total]),
)
print(json.dumps(progress))
`);
    assert.deepStrictEqual(JSON.parse(output), [[2, 3], [3, 3]]);
});

runTest('rl train: pending curriculum は多人数targetとBusiness各headを更新する', () => {
    const output = runPython(`
import json
import random
import numpy as np
from scripts.rl.agent import RLAgent
from scripts.rl.encode import STATE_DIM_4P
from scripts.rl.train import run_pending_curriculum

random.seed(4)
np.random.seed(4)
agent = RLAgent(hidden=16, lr=0.001, state_dim=STATE_DIM_4P, target_slots=3)
before = {
    "tv": agent.net.tv_target_head.W.copy(),
    "bc": agent.net.bc_target_head.W.copy(),
    "mover": agent.net.mover_target_head.W.copy(),
    "policy": agent.net.policy_head.W.copy(),
    "give": agent.net.bc_give_head.W.copy(),
    "take": agent.net.bc_take_head.W.copy(),
}
stats = run_pending_curriculum(agent, 16, (3, 10))
changed = {
    "tv": bool(np.any(before["tv"] != agent.net.tv_target_head.W)),
    "bc": bool(np.any(before["bc"] != agent.net.bc_target_head.W)),
    "mover": bool(np.any(before["mover"] != agent.net.mover_target_head.W)),
    "policy": bool(np.any(before["policy"] != agent.net.policy_head.W)),
    "give": bool(np.any(before["give"] != agent.net.bc_give_head.W)),
    "take": bool(np.any(before["take"] != agent.net.bc_take_head.W)),
}
print(json.dumps({"stats": stats, "changed": changed}))
`);
    const result = JSON.parse(output);
    assert.strictEqual(result.stats.samples, 16);
    assert.strictEqual(result.stats.targetTrained, 16);
    assert.strictEqual(result.stats.actionTrained, 12);
    assert.deepStrictEqual(result.stats.kinds, {
        tv: 4,
        businessExchange: 4,
        businessSkip: 4,
        mover: 4,
    });
    assert.ok(result.stats.targetAccuracy >= 0 && result.stats.targetAccuracy <= 1);
    assert.ok(result.stats.targetLoss > 0);
    assert.ok(result.stats.actionLoss > 0);
    assert.deepStrictEqual(result.changed, {
        tv: true,
        bc: true,
        mover: true,
        policy: true,
        give: true,
        take: true,
    });
});

runTest('rl train: Business curriculum は高価値取得と不利交換見送りの盤面を分離する', () => {
    const output = runPython(`
import json
import random
from scripts.rl.game_env import ACT_PASS
from scripts.rl.train import _configure_pending_curriculum_env

random.seed(8)
exchange, exchange_kind, exchange_target, exchange_action = _configure_pending_curriculum_env(1, 4)
skip, skip_kind, skip_target, skip_action = _configure_pending_curriculum_env(2, 4)
def owned(player):
    return sorted(name for name, count in player.cards.items() for _ in range(count))
print(json.dumps({
    "exchangeKind": exchange_kind,
    "exchangeSelf": owned(exchange.players[exchange.current]),
    "exchangeTarget": owned(exchange.players[exchange_target]),
    "exchangeAction": exchange_action,
    "skipKind": skip_kind,
    "skipSelf": owned(skip.players[skip.current]),
    "skipOpponents": [owned(player) for index, player in enumerate(skip.players) if index != skip.current],
    "skipAction": skip_action,
    "passAction": ACT_PASS,
}))
`);
    const result = JSON.parse(output);
    assert.strictEqual(result.exchangeKind, 'businessExchange');
    assert.deepStrictEqual(result.exchangeSelf, ['パン屋', '食品倉庫', '麦畑']);
    assert.ok(result.exchangeTarget.includes('鉱山'));
    assert.ok(result.exchangeTarget.includes('改装屋'));
    assert.notStrictEqual(result.exchangeAction, result.passAction);
    assert.strictEqual(result.skipKind, 'businessSkip');
    assert.deepStrictEqual(result.skipSelf, ['ピザ屋', '食品倉庫']);
    assert.deepStrictEqual(result.skipOpponents, [['麦畑'], ['麦畑'], ['麦畑']]);
    assert.strictEqual(result.skipAction, result.passAction);
});

runTest('rl train: target head専用学習率は共有方策と分離して3 headだけへ適用する', () => {
    const output = runPython(`
from scripts.rl.agent import RLAgent
from scripts.rl.encode import STATE_DIM, STATE_DIM_4P
from scripts.rl.train import _set_target_head_learning_rate

multi = RLAgent(hidden=8, lr=0.000001, state_dim=STATE_DIM_4P, target_slots=3)
print(_set_target_head_learning_rate(multi, 0.001))
print(multi.net.policy_head.lr)
print(multi.net.tv_target_head.lr)
print(multi.net.bc_target_head.lr)
print(multi.net.mover_target_head.lr)
two = RLAgent(hidden=8, lr=0.000001, state_dim=STATE_DIM, target_slots=0)
print(_set_target_head_learning_rate(two, 0.001))
`);
    assert.deepStrictEqual(output.split('\n'), [
        '3', '1e-06', '0.001', '0.001', '0.001', '0',
    ]);
});

runTest('rl train: 2人pending curriculum はtarget headなしでBusiness交換と見送りを学習する', () => {
    const output = runPython(`
import json
import random
import numpy as np
from scripts.rl.agent import RLAgent
from scripts.rl.encode import STATE_DIM
from scripts.rl.train import run_pending_curriculum

random.seed(5)
np.random.seed(5)
agent = RLAgent(hidden=16, lr=0.000001, state_dim=STATE_DIM, target_slots=0)
agent.net.bc_skip_gate_version = 0
stats = run_pending_curriculum(agent, 8, (2, 2), head_learning_rate=0.001)
print(json.dumps({
    "stats": stats,
    "rates": [agent.net.policy_head.lr, agent.net.bc_give_head.lr, agent.net.bc_take_head.lr],
    "gateVersion": agent.net.bc_skip_gate_version,
}))
`);
    const result = JSON.parse(output);
    const stats = result.stats;
    assert.strictEqual(stats.targetTrained, 0);
    assert.strictEqual(stats.actionTrained, 8);
    assert.deepStrictEqual(stats.kinds, {
        businessExchange: 4,
        businessSkip: 4,
    });
    assert.strictEqual(result.gateVersion, 1);
    assert.deepStrictEqual(result.rates, [0.000001, 0.000001, 0.000001]);
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
print(_make_run_label(args, now=datetime(2026, 4, 9, 12, 34, 56, 123456), process_id=4321))
`);
    assert.strictEqual(output, '20260409-123456-123456-p4321-h256-lr0.0003-ev1000-js20');
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

runTest('rl train: metrics summary command は4人lineup名を opponent として渡せる', () => {
    const output = runPython(`
import json
from scripts.rl.train import _build_metrics_summary_command
command = _build_metrics_summary_command(
    "m.csv",
    "s.json",
    options={
        "format": "json",
        "opponents": ["rl+weak+normal+strong", "rl+normal+normal+strong"],
    },
)
print(json.dumps(command))
`);
    const command = JSON.parse(output);
    const index = command.indexOf('--opponents');
    assert.ok(index >= 0);
    assert.strictEqual(command[index + 1], 'rl+weak+normal+strong,rl+normal+normal+strong');
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

runTest('rl train: 4人JS評価から checkpoint score を計算できる', () => {
    const output = runPython(`
from scripts.rl.train import _score_js_entries
entries = [
    {"opponent": "rl+weak+normal+strong", "lineup": ["rl", "weak", "normal", "strong"], "result": {"games": 4, "wins": {"rl": 2, "weak": 1, "normal": 1, "strong": 0}, "exhausted": 0}},
]
print(round(_score_js_entries(entries, weights_text="rl+weak+normal+strong=2"), 6))
`);
    assert.strictEqual(output, '0.5');
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

runTest('rl train: load checkpoint path は npz 拡張子ありなしを扱える', () => {
    const output = runPython(`
from scripts.rl.train import _checkpoint_model_base_path, _checkpoint_npz_path
print(_checkpoint_model_base_path("models/rl_model/runs/run-a/best_model.npz"))
print(_checkpoint_model_base_path("models/rl_model/runs/run-a/best_model"))
print(_checkpoint_npz_path("models/rl_model/runs/run-a/best_model"))
`);
    const lines = output.split('\n');
    assert.strictEqual(lines[0], 'models/rl_model/runs/run-a/best_model');
    assert.strictEqual(lines[1], 'models/rl_model/runs/run-a/best_model');
    assert.strictEqual(lines[2], 'models/rl_model/runs/run-a/best_model.npz');
});

runTest('rl train: 明示 checkpoint が無い場合は require_exists で失敗する', () => {
    const output = runPython(`
from scripts.rl.train import _load_agent_checkpoint
class DummyAgent:
    def load(self, path):
        raise AssertionError("load should not be called")
loaded, base_path, checkpoint_path = _load_agent_checkpoint(DummyAgent(), "models/rl_model/runs/missing/best_model", require_exists=False)
print(loaded)
print(base_path)
print(checkpoint_path)
try:
    _load_agent_checkpoint(DummyAgent(), "models/rl_model/runs/missing/best_model", require_exists=True)
except FileNotFoundError:
    print("missing-error")
`);
    const lines = output.split('\n');
    assert.strictEqual(lines[0], 'False');
    assert.strictEqual(lines[1], 'models/rl_model/runs/missing/best_model');
    assert.strictEqual(lines[2], 'models/rl_model/runs/missing/best_model.npz');
    assert.strictEqual(lines[3], 'missing-error');
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
    metadata={
        "run_label": "baseline", "seed": 11, "hidden": 256, "lr": 0.0003,
        "eval_every": 1000, "js_eval_games": 20, "js_eval_opponents": "strong,expert",
        "loss_replay_probability": 0.25, "loss_replay_episodes": 3,
        "loss_replay_steps": 42,
    }
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
print(rows[0]["loss_replay_probability"])
print(rows[0]["loss_replay_episodes"])
print(rows[0]["loss_replay_steps"])
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
    assert.strictEqual(lines[11], '0.25');
    assert.strictEqual(lines[12], '3');
    assert.strictEqual(lines[13], '42');
});

runTest('rl encode: schema helper は既存 state dim と draft action schema を公開する', () => {
    const code = [
        'from scripts.rl.encode import STATE_DIM, STATE_DIM_4P, state_schema_for_dim',
        'from scripts.rl.encode import STATE_SCHEMA_2P_V1, STATE_SCHEMA_MP_V1, STATE_SCHEMA_CUSTOM',
        'from scripts.rl.encode import ACTION_SCHEMA_FLAT_V1, ACTION_SCHEMA_FACTORED_BUSINESS_TARGET_V2_DRAFT',
        'assert state_schema_for_dim(STATE_DIM) == STATE_SCHEMA_2P_V1',
        'assert state_schema_for_dim(STATE_DIM_4P) == STATE_SCHEMA_MP_V1',
        'assert state_schema_for_dim(999) == STATE_SCHEMA_CUSTOM',
        'assert ACTION_SCHEMA_FLAT_V1 == "action-flat-v1"',
        'assert ACTION_SCHEMA_FACTORED_BUSINESS_TARGET_V2_DRAFT.endswith("v2-draft")',
    ].join('\n');
    const result = spawnSync('python3', ['-c', code], { encoding: 'utf8' });
    assert.strictEqual(result.status, 0, result.stderr || result.stdout);
});
