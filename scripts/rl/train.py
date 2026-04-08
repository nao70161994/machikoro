#!/usr/bin/env python3
# train.py - ランダム対戦による学習ループ（GAE Actor-Critic）
#
# 使い方:
#   python -m scripts.rl.train
#   python -m scripts.rl.train --games 30000 --eval-every 1000
#
# 学習済みモデルは models/rl_model/ に保存される。

import argparse
import os
import sys
import random
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__)
))))

from scripts.rl.game_env import MachikoroEnv, NUM_ACTIONS
from scripts.rl.encode import encode_state, action_mask
from scripts.rl.agent import RLAgent


MODEL_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "models", "rl_model"
)
os.makedirs(MODEL_DIR, exist_ok=True)


def play_vs_random(agent: RLAgent, epsilon: float = 0.1) -> dict:
    """
    エージェント(P0) vs ランダム(P1) で 1 ゲームを収集。
    P0 のステップのみをエージェントバッファに積む。

    自己対戦では「両者が同時に強くなる」ため vs_random の改善が見えにくい。
    ランダム固定の相手に対して学習することで明確な進捗が得られる。

    中間報酬: ランドマーク建設 +0.2
    終端報酬: 勝利 +1.0 / 敗北 -1.0
    """
    env = MachikoroEnv()

    ep_states  = []
    ep_actions = []
    ep_masks   = []
    ep_values  = []
    ep_rewards = []

    max_steps = 3000
    for _ in range(max_steps):
        if env.done:
            break

        if env.current == 0:
            # ── エージェントのターン ──
            state = encode_state(env)
            mask  = action_mask(env)
            valid = np.where(mask > 0)[0]

            policy, value = agent.net.forward(state)

            if epsilon > 0 and random.random() < epsilon:
                action = int(random.choice(valid))
            else:
                masked_p = policy * mask
                s = masked_p.sum()
                if s < 1e-9:
                    action = int(random.choice(valid))
                else:
                    masked_p = masked_p / s
                    action = int(np.random.choice(NUM_ACTIONS, p=masked_p))

            lm_before = env.players[0].built_lm_count()
            env.step(action)
            lm_after = env.players[0].built_lm_count()

            ep_states.append(state)
            ep_actions.append(action)
            ep_masks.append(mask)
            ep_values.append(float(value))
            ep_rewards.append(0.2 * (lm_after - lm_before))

        else:
            # ── ランダムのターン ──
            valid = env.valid_actions()
            env.step(random.choice(valid))

    if not ep_states:
        return {}

    # 終端報酬
    if env.winner == 0:
        ep_rewards[-1] += 1.0
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
        "turns":  env.turn_count,
    }


def eval_vs_random(agent: RLAgent, n_games: int = 200) -> float:
    """エージェント（P0、greedy）対ランダム（P1）の勝率を評価"""
    wins = 0
    for _ in range(n_games):
        env = MachikoroEnv()
        for _ in range(3000):
            if env.done:
                break
            ci = env.current
            if ci == 0:
                state = encode_state(env)
                mask  = action_mask(env)
                policy, _ = agent.net.forward(state)
                masked = policy * mask
                s = masked.sum()
                if s < 1e-9:
                    action = int(random.choice(env.valid_actions()))
                else:
                    masked = masked / s
                    action = int(np.random.choice(NUM_ACTIONS, p=masked))
            else:
                action = int(random.choice(env.valid_actions()))
            env.step(action)

        if env.winner == 0:
            wins += 1
        elif env.winner is None:
            if env.players[0].coins >= env.players[1].coins:
                wins += 1

    return wins / n_games


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--games",      type=int,   default=10000, help="学習ゲーム数")
    parser.add_argument("--eval-every", type=int,   default=1000,  help="評価間隔")
    parser.add_argument("--hidden",     type=int,   default=128,   help="隠れ層ニューロン数")
    parser.add_argument("--lr",         type=float, default=3e-4,  help="学習率")
    parser.add_argument("--epsilon",    type=float, default=0.20,  help="ε-greedy 初期探索率")
    parser.add_argument("--load",       action="store_true",       help="既存モデルを読み込む")
    args = parser.parse_args()

    agent = RLAgent(hidden=args.hidden, lr=args.lr)

    model_path = os.path.join(MODEL_DIR, "model")
    if args.load and os.path.exists(model_path + ".npz"):
        agent.load(model_path)
        print(f"モデル読み込み: {model_path}.npz")

    print(f"学習開始: {args.games} ゲーム, hidden={args.hidden}, lr={args.lr}")

    win_rate = eval_vs_random(agent, 200)
    print(f"[初期] vs ランダム勝率: {win_rate:.1%}")

    # 累積統計
    total_pl  = 0.0
    total_vl  = 0.0
    total_adv = 0.0
    train_calls = 0
    agent_wins  = 0  # 学習ゲームでのエージェント勝利数

    BATCH = 2   # 2 ゲームまとめてから 1 回学習（off-policy 乖離を抑える）

    for game_i in range(1, args.games + 1):
        # ε を線形減衰
        epsilon = max(0.02, args.epsilon * (1 - game_i / args.games))

        info = play_vs_random(agent, epsilon=epsilon)
        if info.get("winner") == 0:
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

    print(f"\n学習完了。モデル保存先: {model_path}.npz")
    final_wr = eval_vs_random(agent, 500)
    print(f"最終 vs ランダム勝率: {final_wr:.1%}")


if __name__ == "__main__":
    main()
