#!/usr/bin/env python3
# train.py - ランダム対戦による学習ループ（GAE Actor-Critic）
#
# 使い方:
#   python -m scripts.rl.train
#   python -m scripts.rl.train --games 30000 --eval-every 1000
#
# 学習済みモデルは models/rl_model/ に保存される。

import argparse
import copy
import os
import sys
import random
from datetime import datetime
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__)
))))

from scripts.rl.game_env import MachikoroEnv, NUM_ACTIONS, ACT_BC_BASE, ACT_BC_SIZE
from scripts.rl.encode import encode_state, action_mask
from scripts.rl.agent import RLAgent
from scripts.rl.network import SchemaVersionError
from scripts.rl.cards import NUM_CARDS


MODEL_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "models", "rl_model"
)
os.makedirs(MODEL_DIR, exist_ok=True)



def _select_action(net, state, mask, epsilon):
    """BC フェーズを factored head で処理し、(action, value) を返す"""
    valid = np.where(mask > 0)[0]
    bc_available = bool(mask[ACT_BC_BASE:ACT_BC_BASE + ACT_BC_SIZE].any())

    if bc_available:
        bc_give_p, bc_take_p, value = net.forward_bc(state)
        if epsilon > 0 and random.random() < epsilon:
            return int(random.choice(valid)), value
        bc_joint  = mask[ACT_BC_BASE:ACT_BC_BASE + ACT_BC_SIZE].reshape(NUM_CARDS, NUM_CARDS)
        give_mask = (bc_joint.sum(axis=1) > 0).astype(np.float32)
        take_mask = (bc_joint.sum(axis=0) > 0).astype(np.float32)
        give_p = bc_give_p * give_mask; give_p /= (give_p.sum() + 1e-9)
        take_p = bc_take_p * take_mask; take_p /= (take_p.sum() + 1e-9)
        give_idx = int(np.random.choice(NUM_CARDS, p=give_p))
        take_idx = int(np.random.choice(NUM_CARDS, p=take_p))
        action = ACT_BC_BASE + give_idx * NUM_CARDS + take_idx
        if mask[action] == 0:
            action = int(random.choice(valid))
        return action, value
    else:
        policy, value = net.forward(state)
        if epsilon > 0 and random.random() < epsilon:
            return int(random.choice(valid)), value
        masked_p = policy * mask
        s = masked_p.sum()
        if s < 1e-9:
            return int(random.choice(valid)), value
        masked_p = masked_p / s
        return int(np.random.choice(NUM_ACTIONS, p=masked_p)), value


def _greedy_action(net, state, mask):
    """greedy 評価用（BC も factored head を使う）"""
    valid = np.where(mask > 0)[0]
    bc_available = bool(mask[ACT_BC_BASE:ACT_BC_BASE + ACT_BC_SIZE].any())

    if bc_available:
        bc_give_p, bc_take_p, _ = net.forward_bc(state)
        bc_joint  = mask[ACT_BC_BASE:ACT_BC_BASE + ACT_BC_SIZE].reshape(NUM_CARDS, NUM_CARDS)
        give_mask = (bc_joint.sum(axis=1) > 0).astype(np.float32)
        take_mask = (bc_joint.sum(axis=0) > 0).astype(np.float32)
        give_p = bc_give_p * give_mask; give_p /= (give_p.sum() + 1e-9)
        take_p = bc_take_p * take_mask; take_p /= (take_p.sum() + 1e-9)
        give_idx = int(np.argmax(give_p))
        take_idx = int(np.argmax(take_p))
        action = ACT_BC_BASE + give_idx * NUM_CARDS + take_idx
        if mask[action] == 0:
            return int(random.choice(valid))
        return action
    else:
        policy, _ = net.forward(state)
        masked = policy * mask
        s = masked.sum()
        if s < 1e-9:
            return int(random.choice(valid))
        return int(np.argmax(masked / s))


def play_vs_random(agent: RLAgent, epsilon: float = 0.1,
                   opp_agent: RLAgent = None) -> dict:
    """
    エージェント vs 相手 で 1 ゲームを収集。
    エージェント席はゲームごとにランダム化し、その席のステップのみを
    エージェントバッファに積む。

    opp_agent=None  → ランダム対戦（P1 はランダム行動）
    opp_agent=agent → 過去モデルとの対戦（P1 は greedy）

    中間報酬: ランドマーク建設 +0.2
    終端報酬: 勝利 +1.0 / 敗北 -1.0
    """
    env = MachikoroEnv()
    agent_player = random.randint(0, 1)

    ep_states  = []
    ep_actions = []
    ep_masks   = []
    ep_values  = []
    ep_rewards = []

    max_steps = 3000
    for _ in range(max_steps):
        if env.done:
            break

        if env.current == agent_player:
            # ── エージェントのターン ──
            state = encode_state(env)
            mask  = action_mask(env)
            valid = np.where(mask > 0)[0]

            action, value = _select_action(agent.net, state, mask, epsilon)

            lm_before = env.players[agent_player].built_lm_count()
            env.step(action)
            lm_after = env.players[agent_player].built_lm_count()

            ep_states.append(state)
            ep_actions.append(action)
            ep_masks.append(mask)
            ep_values.append(float(value))
            ep_rewards.append(0.2 * (lm_after - lm_before))

        else:
            # ── 相手のターン ──
            if opp_agent is not None:
                opp_state = encode_state(env)
                opp_mask  = action_mask(env)
                opp_action = _greedy_action(opp_agent.net, opp_state, opp_mask)
                env.step(opp_action)
            else:
                env.step(random.choice(env.valid_actions()))

    if not ep_states:
        return {}

    # 終端報酬
    if env.winner == agent_player:
        ep_rewards[-1] += 1.0
    elif env.winner is None:
        ep_rewards[-1] -= 1.0
    else:
        ep_rewards[-1] -= 1.0

    # next_value を計算（GAE 用）
    # ep_values[i+1] は次にエージェントが行動する局面の価値（収集時に計算済み）
    # ランダムプレイヤーのターンを挟んでいるが、エージェント視点では「次のステップ」
    T = len(ep_states)
    next_values = ep_values[1:] + [0.0]  # 最終ステップは v_next=0
    dones = [False] * (T - 1) + [True]

    # バッファに積む
    for i in range(T):
        agent.states.append(ep_states[i])
        agent.actions.append(ep_actions[i])
        agent.masks.append(ep_masks[i])
        agent.values.append(ep_values[i])
        agent.rewards.append(ep_rewards[i])
        agent.next_values.append(next_values[i])
        agent.dones.append(dones[i])

    return {
        "winner": env.winner,
        "agent_player": agent_player,
        "turns":  env.turn_count,
    }


def eval_vs_random(agent: RLAgent, n_games: int = 200) -> float:
    """エージェント対ランダムの勝率を評価（席はゲームごとにランダム）"""
    wins = 0
    for _ in range(n_games):
        env = MachikoroEnv()
        agent_player = random.randint(0, 1)
        for _ in range(3000):
            if env.done:
                break
            if env.current == agent_player:
                state  = encode_state(env)
                mask   = action_mask(env)
                action = _greedy_action(agent.net, state, mask)
            else:
                action = int(random.choice(env.valid_actions()))
            env.step(action)

        if env.winner == agent_player:
            wins += 1

    return wins / n_games


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--games",      type=int,   default=10000, help="学習ゲーム数")
    parser.add_argument("--eval-every", type=int,   default=1000,  help="評価間隔")
    parser.add_argument("--hidden",     type=int,   default=256,   help="隠れ層ニューロン数")
    parser.add_argument("--lr",         type=float, default=3e-4,  help="学習率")
    parser.add_argument("--epsilon",    type=float, default=0.20,  help="ε-greedy 初期探索率")
    parser.add_argument("--load",       action="store_true",       help="既存モデルを読み込む")
    args = parser.parse_args()

    agent = RLAgent(hidden=args.hidden, lr=args.lr)

    model_path = os.path.join(MODEL_DIR, "model")
    checkpoint_path = model_path + ".npz"
    if args.load and os.path.exists(checkpoint_path):
        try:
            agent.load(model_path)
            print(f"モデル読み込み: {checkpoint_path}")
        except (SchemaVersionError, ValueError, KeyError, OSError) as exc:
            print(
                f"エラー: チェックポイントを読み込めません: {exc}\n"
                f"モデルファイルはそのまま保持されています: {checkpoint_path}\n"
                f"新規学習を開始するには手動で削除してください: rm {checkpoint_path}"
            )
            sys.exit(1)

    print(f"学習開始: {args.games} ゲーム, hidden={args.hidden}, lr={args.lr}")

    win_rate = eval_vs_random(agent, 200)
    print(f"[初期] vs ランダム勝率: {win_rate:.1%}")

    # 累積統計
    total_pl  = 0.0
    total_vl  = 0.0
    total_adv = 0.0
    train_calls = 0
    agent_wins  = 0  # 学習ゲームでのエージェント勝利数

    BATCH = 8   # MC リターンはブートストラップ非依存のため大きいバッチでも安定

    # 対戦相手プール（過去モデルのスナップショット）
    pool_agents = []
    POOL_UPDATE_EVERY = 5000
    MAX_POOL_SIZE = 5

    for game_i in range(1, args.games + 1):
        # ε を線形減衰
        epsilon = max(0.02, args.epsilon * (1 - game_i / args.games))

        # 一定ゲームごとに現在モデルをプールにコピー
        if game_i % POOL_UPDATE_EVERY == 0:
            snap = RLAgent(hidden=args.hidden, lr=args.lr)
            snap.net = copy.deepcopy(agent.net)
            pool_agents.append(snap)
            if len(pool_agents) > MAX_POOL_SIZE:
                pool_agents.pop(0)
            print(f"  [pool] snapshot #{len(pool_agents)}/{MAX_POOL_SIZE} added at game {game_i}")

        # 相手選択: 70% ランダム / 30% 過去モデル（プールが空の間は 100% ランダム）
        opp = random.choice(pool_agents) if pool_agents and random.random() < 0.3 else None

        info = play_vs_random(agent, epsilon=epsilon, opp_agent=opp)
        if info.get("winner") == info.get("agent_player"):
            agent_wins += 1

        if game_i % BATCH == 0:
            stats = agent.train()
            train_calls += 1
            if stats:
                total_pl  += stats.get("policy_loss", 0)
                total_vl  += stats.get("value_loss",  0)
                total_adv += stats.get("mean_adv",    0)

        if game_i % args.eval_every == 0:
            win_rate = eval_vs_random(agent, 200)
            denom    = max(train_calls, 1)
            avg_pl   = total_pl  / denom
            avg_vl   = total_vl  / denom
            avg_adv  = total_adv / denom
            train_wr = agent_wins / args.eval_every

            print(f"[{game_i:6d}] "
                  f"vs_random={win_rate:.1%}  "
                  f"train_wr={train_wr:.1%}  "
                  f"policy_loss={avg_pl:.4f}  "
                  f"value_loss={avg_vl:.4f}  "
                  f"mean_adv={avg_adv:.4f}  "
                  f"eps={epsilon:.3f}")

            # リセット
            total_pl = total_vl = total_adv = 0.0
            train_calls = agent_wins = 0

            agent.save(model_path)

    # 末尾の未学習データをフラッシュ
    if len(agent.rewards) > 0:
        agent.train()
        agent.save(model_path)

    print(f"\n学習完了。モデル保存先: {model_path}.npz")
    final_wr = eval_vs_random(agent, 500)
    print(f"最終 vs ランダム勝率: {final_wr:.1%}")


if __name__ == "__main__":
    main()
