#!/usr/bin/env python3
# train.py - 自己対戦による学習ループ
#
# 使い方:
#   python -m scripts.rl.train
#   python -m scripts.rl.train --games 5000 --eval-every 500
#
# 学習済みモデルは models/rl_model/ に保存される。

import argparse
import os
import sys
import random
import numpy as np

# パス調整（プロジェクトルートから実行する想定）
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__)
))))

from scripts.rl.game_env import MachikoroEnv
from scripts.rl.agent import RLAgent


MODEL_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "models", "rl_model"
)
os.makedirs(MODEL_DIR, exist_ok=True)


def play_self_play_game(agent: RLAgent, epsilon: float = 0.1) -> dict:
    """
    TD(0) 用の自己対戦ゲーム収集。
    各ステップで (state, action, reward, next_state, done) を記録する。
    中間報酬: ランドマーク建設 +0.2
    終端報酬: 勝者 +1.0 / 敗者 -1.0
    """
    from scripts.rl.encode import encode_state, action_mask
    from scripts.rl.game_env import NUM_ACTIONS

    env = MachikoroEnv()

    # (player_idx, state, action, mask, log_prob, value, reward, next_env_clone, done)
    steps = []

    max_steps = 3000
    for _ in range(max_steps):
        if env.done:
            break

        ci = env.current
        lm_before = env.players[ci].built_lm_count()

        state = encode_state(env)
        mask  = action_mask(env)
        valid = np.where(mask > 0)[0]

        policy, value = agent.net.forward(state)
        if epsilon > 0 and random.random() < epsilon:
            action = int(random.choice(valid))
        else:
            masked = policy * mask
            s = masked.sum()
            if s < 1e-9:
                action = int(random.choice(valid))
            else:
                masked = masked / s
                action = int(np.random.choice(NUM_ACTIONS, p=masked))

        masked_p = policy * mask
        s = masked_p.sum()
        masked_p = masked_p / (s + 1e-9)
        log_prob = float(np.log(masked_p[action] + 1e-9))

        env.step(action)

        lm_after = env.players[ci].built_lm_count()
        step_reward = 0.2 * (lm_after - lm_before)

        # next_state の価値を今のネットワークで計算（TD ターゲット用）
        if env.done:
            v_next = 0.0
        else:
            next_state = encode_state(env)
            _, v_next  = agent.net.forward(next_state)
            v_next = float(v_next)

        steps.append((ci, state, action, mask, log_prob, float(value),
                       step_reward, v_next, env.done))

    # 終端報酬を決定
    if env.winner is not None:
        winner = env.winner
    else:
        coins  = [env.players[i].coins for i in range(2)]
        winner = int(np.argmax(coins))

    # プレイヤーごとにエージェントバッファへ積む
    player_steps = {0: [], 1: []}
    for record in steps:
        player_steps[record[0]].append(record[1:])

    for pi in range(2):
        ps = player_steps[pi]
        if not ps:
            continue
        terminal_reward = 1.0 if pi == winner else -1.0
        for i, (state, action, mask, log_prob, value, step_r, v_next, done) in enumerate(ps):
            is_last = (i == len(ps) - 1)
            reward  = step_r + (terminal_reward if is_last else 0.0)
            # 終端ステップは v_next=0、最後のステップも done 扱い
            effective_done = done or is_last

            agent.states.append(state)
            agent.actions.append(action)
            agent.masks.append(mask)
            agent.log_probs.append(log_prob)
            agent.values.append(value)
            agent.rewards.append(reward)
            agent.next_values.append(0.0 if effective_done else v_next)
            agent.dones.append(effective_done)

    return {
        "winner": winner,
        "turns":  env.turn_count,
        "coins":  [env.players[i].coins for i in range(2)],
    }


def eval_vs_random(agent: RLAgent, n_games: int = 100) -> float:
    """エージェント（P0）対ランダム（P1）の勝率を評価"""
    from scripts.rl.encode import encode_state, action_mask
    from scripts.rl.game_env import NUM_ACTIONS
    import random as rnd

    wins = 0
    for _ in range(n_games):
        env = MachikoroEnv()
        for _ in range(2000):
            if env.done:
                break
            ci = env.current
            state = encode_state(env)
            mask  = action_mask(env)
            valid = np.where(mask > 0)[0]

            if ci == 0:
                # エージェント（方策に従う）
                policy, _ = agent.net.forward(state)
                masked = policy * mask
                s = masked.sum()
                if s < 1e-9:
                    action = int(rnd.choice(valid))
                else:
                    masked = masked / s
                    action = int(np.random.choice(NUM_ACTIONS, p=masked))
            else:
                # ランダム
                action = int(rnd.choice(valid))

            env.step(action)

        if env.winner == 0:
            wins += 1
        elif env.winner is None:
            coins = [env.players[i].coins for i in range(2)]
            if coins[0] > coins[1]:
                wins += 1

    return wins / n_games


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--games",      type=int, default=10000, help="学習ゲーム数")
    parser.add_argument("--eval-every", type=int, default=1000,  help="評価間隔")
    parser.add_argument("--hidden",     type=int, default=128,   help="隠れ層ニューロン数")
    parser.add_argument("--lr",         type=float, default=3e-4, help="学習率")
    parser.add_argument("--epsilon",    type=float, default=0.15, help="ε-greedy 探索率")
    parser.add_argument("--load",       action="store_true",      help="既存モデルを読み込む")
    args = parser.parse_args()

    agent = RLAgent(hidden=args.hidden, lr=args.lr)

    model_path = os.path.join(MODEL_DIR, "model")
    if args.load and os.path.exists(model_path + ".npz"):
        agent.load(model_path)
        print(f"モデル読み込み: {model_path}.npz")

    print(f"学習開始: {args.games} ゲーム, hidden={args.hidden}, lr={args.lr}")

    # 初期評価
    win_rate = eval_vs_random(agent, 200)
    print(f"[初期] vs ランダム勝率: {win_rate:.1%}")

    total_stats = {"policy_loss": 0.0, "value_loss": 0.0}
    win_history = []

    BATCH = 8   # 8ゲーム分まとめてから学習（G の正規化が複数ゲーム跨ぎになる）
    train_calls = 0

    for game_i in range(1, args.games + 1):
        # ε を線形減衰（学習後半は方策を信頼）
        epsilon = max(0.02, args.epsilon * (1 - game_i / args.games))

        info = play_self_play_game(agent, epsilon=epsilon)
        win_history.append(info["winner"])

        # BATCH ゲーム分溜まったら学習（複数ゲームの G をまとめて正規化）
        stats = {}
        if game_i % BATCH == 0:
            stats = agent.train()
            train_calls += 1
        if stats:
            total_stats["policy_loss"] += stats.get("policy_loss", 0)
            total_stats["value_loss"]  += stats.get("value_loss", 0)
            total_stats["mean_adv"]    = total_stats.get("mean_adv", 0) + stats.get("mean_adv", 0)

        # 評価・ログ出力
        if game_i % args.eval_every == 0:
            win_rate = eval_vs_random(agent, 200)
            denom = max(train_calls, 1)
            avg_pl = total_stats["policy_loss"] / denom
            avg_vl = total_stats["value_loss"]  / denom
            p0_wins = win_history[-args.eval_every:].count(0)
            self_play_wr = p0_wins / args.eval_every

            avg_adv = total_stats.get("mean_adv", 0) / denom
            print(f"[{game_i:6d}] "
                  f"vs_random={win_rate:.1%}  "
                  f"self_play_wr={self_play_wr:.1%}  "
                  f"policy_loss={avg_pl:.4f}  "
                  f"value_loss={avg_vl:.4f}  "
                  f"mean_adv={avg_adv:.4f}  "
                  f"eps={epsilon:.3f}")

            total_stats = {"policy_loss": 0.0, "value_loss": 0.0, "mean_adv": 0.0}
            train_calls = 0

            # モデル保存
            agent.save(model_path)

    print(f"\n学習完了。モデル保存先: {model_path}.npz")
    final_wr = eval_vs_random(agent, 500)
    print(f"最終 vs ランダム勝率: {final_wr:.1%}")


if __name__ == "__main__":
    main()
