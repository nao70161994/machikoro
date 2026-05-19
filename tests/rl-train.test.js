const assert = require('assert');
const { spawnSync } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');
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


runTest('rl parity report: ワイナリー集約近似を既知差分として出力する', () => {
    const output = runPython(`
import json
from scripts.rl.parity_report import build_report
print(json.dumps(build_report(), ensure_ascii=False))
`);
    const report = JSON.parse(output);
    assert.strictEqual(report.schema, 'rl-parity-report-v1');
    assert.ok(report.knownApproximationCount >= 1);
    const dormantCase = report.knownApproximations.find(entry =>
        entry.card === 'ワイナリー' &&
        entry.totalWineries === 2 &&
        entry.dormantWineriesBefore === 1 &&
        entry.grapes === 1
    );
    assert.ok(dormantCase);
    assert.strictEqual(dormantCase.js.gain, 6);
    assert.strictEqual(dormantCase.pythonApprox.gain, 12);
    assert.strictEqual(dormantCase.gainDiff, 6);
});

runTest('rl train: CLI help は train-batch-size を含む', () => {
    const result = spawnSync('python3', ['-m', 'scripts.rl.train', '--help'], {
        cwd: path.join(__dirname, '..'),
        encoding: 'utf8',
    });
    assert.strictEqual(result.status, 0, result.stderr || result.stdout);
    assert.ok(result.stdout.includes('--train-batch-size'));
    assert.ok(result.stdout.includes('--debug-train-batch'));
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

runTest('rl train: pending target choice は BC target head に合わせて合法手 mask を切り替える', () => {
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
print(target_count / len(agent.rewards) >= 0.25)
`);
    const lines = output.split('\n');
    assert.ok(Number(lines[0]) > 0);
    assert.ok(Number(lines[1]) > 10);
    assert.strictEqual(lines[2], 'True');
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
print(stats["target_pending_rate"] > 0 and stats["target_update_rate"] > 0 and stats["bc_target_rate"] > 0)
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
