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
import json
import os
import subprocess
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
from scripts.rl.export_model import export_checkpoint


MODEL_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "models", "rl_model"
)
os.makedirs(MODEL_DIR, exist_ok=True)


def _normalize_masked_probs(probs, mask):
    masked = np.asarray(probs, dtype=np.float64) * np.asarray(mask, dtype=np.float64)
    total = masked.sum()
    if total <= 1e-12:
        valid = np.where(np.asarray(mask) > 0)[0]
        if len(valid) == 0:
            return np.zeros_like(masked, dtype=np.float64)
        normalized = np.zeros_like(masked, dtype=np.float64)
        normalized[valid] = 1.0 / len(valid)
        return normalized
    normalized = masked / total
    normalized = np.clip(normalized, 0.0, 1.0)
    final_total = normalized.sum()
    if final_total <= 1e-12:
        valid = np.where(np.asarray(mask) > 0)[0]
        normalized = np.zeros_like(masked, dtype=np.float64)
        normalized[valid] = 1.0 / max(len(valid), 1)
        return normalized
    normalized /= final_total
    return normalized



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
        give_p = _normalize_masked_probs(bc_give_p, give_mask)
        take_p = _normalize_masked_probs(bc_take_p, take_mask)
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
        give_p = _normalize_masked_probs(bc_give_p, give_mask)
        take_p = _normalize_masked_probs(bc_take_p, take_mask)
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


def eval_vs_heuristic(agent: RLAgent, level: str, n_games: int = 50) -> float:
    """エージェント対ヒューリスティック CPU の勝率を評価"""
    from .heuristic import heuristic_action
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
                action = heuristic_action(env, level)
            env.step(action)
        if env.winner == agent_player:
            wins += 1
    return wins / n_games


def eval_vs_pool(agent: RLAgent, pool_agents: list, n_games: int = 50) -> float:
    """エージェント対プール内スナップショットの勝率を評価"""
    if not pool_agents:
        return float('nan')
    wins = 0
    for _ in range(n_games):
        opp = random.choice(pool_agents)
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
                opp_state  = encode_state(env)
                opp_mask   = action_mask(env)
                action     = _greedy_action(opp.net, opp_state, opp_mask)
            env.step(action)
        if env.winner == agent_player:
            wins += 1
    return wins / n_games


def _parse_csv_list(value):
    return [item for item in (value or '').split(',') if item]


def _sanitize_run_label_part(value):
    text = str(value)
    chars = []
    for ch in text:
        if ch.isalnum() or ch in ('-', '_', '.'):
            chars.append(ch)
        else:
            chars.append('_')
    return ''.join(chars).strip('_')


def _make_run_label(args, now=None):
    if getattr(args, "run_label", ""):
        return args.run_label
    now = now or datetime.now()
    timestamp = now.strftime("%Y%m%d-%H%M%S")
    parts = [
        timestamp,
        f"h{getattr(args, 'hidden', 'na')}",
        f"lr{_sanitize_run_label_part(getattr(args, 'lr', 'na'))}",
        f"ev{getattr(args, 'eval_every', 'na')}",
    ]
    js_eval_games = getattr(args, 'js_eval_games', 0)
    if js_eval_games:
        parts.append(f"js{js_eval_games}")
    return "-".join(parts)


def _build_metrics_summary_command(metrics_csv, output_path, options=None):
    options = options or {}
    command = [
        "node",
        os.path.join("scripts", "summarize-rl-metrics.js"),
        "--csv", metrics_csv,
        "--output", output_path,
    ]
    if options.get("format"):
        command.extend(["--format", str(options["format"])])
    opponents = options.get("opponents") or []
    if opponents:
        command.extend(["--opponents", ",".join(opponents)])
    if options.get("weights"):
        command.extend(["--weights", str(options["weights"])])
    if options.get("baseline_run"):
        command.extend(["--baseline-run", str(options["baseline_run"])])
    if options.get("draw_penalty") is not None:
        command.extend(["--draw-penalty", str(options["draw_penalty"])])
    if options.get("exhausted_penalty") is not None:
        command.extend(["--exhausted-penalty", str(options["exhausted_penalty"])])
    if options.get("run_label"):
        command.extend(["--run-label", str(options["run_label"])])
    if options.get("run_index_csv"):
        command.extend(["--run-index-csv", str(options["run_index_csv"])])
    if options.get("config_index_csv"):
        command.extend(["--config-index-csv", str(options["config_index_csv"])])
    return command


def _score_js_entries(js_entries, weights_text="", draw_penalty=0.25, exhausted_penalty=0.01):
    weights = {}
    for part in (weights_text or "").split(","):
        if not part:
            continue
        key, _, value = part.partition("=")
        try:
            weights[key] = float(value)
        except (TypeError, ValueError):
            continue
    if not js_entries:
        return None
    total_score = 0.0
    total_weight = 0.0
    for entry in js_entries:
        opponent = entry.get("opponent", "")
        result = entry.get("result", {}) or {}
        games = result.get("games", 0) or 0
        wins = result.get("wins", {}) or {}
        rl_wins = wins.get("rl", 0)
        opp_wins = wins.get(opponent, 0)
        draws = max(0, games - rl_wins - opp_wins)
        draw_rate = (draws / games) if games > 0 else 0.0
        win_rate = (rl_wins / games) if games > 0 else 0.0
        exhausted = result.get("exhausted", 0) or 0
        weight = weights.get(opponent, 1.0)
        total_score += (win_rate - draw_rate * draw_penalty - exhausted * exhausted_penalty) * weight
        total_weight += weight
    if total_weight <= 0:
        return None
    return total_score / total_weight


def _fallback_checkpoint_score(wr_rnd, wr_normal, wr_strong, wr_expert):
    return (
        (wr_expert or 0.0) * 4.0 +
        (wr_strong or 0.0) * 3.0 +
        (wr_normal or 0.0) * 2.0 +
        (wr_rnd or 0.0)
    )


def _copy_checkpoint(src_model_path, dst_model_path):
    src = src_model_path + ".npz"
    dst = dst_model_path + ".npz"
    directory = os.path.dirname(dst)
    if directory:
        os.makedirs(directory, exist_ok=True)
    with open(src, "rb") as src_fh, open(dst, "wb") as dst_fh:
        dst_fh.write(src_fh.read())


def _best_checkpoint_browser_path(best_checkpoint_path):
    return best_checkpoint_path + ".browser.json"


def _best_checkpoint_artifact_paths(best_checkpoint_path, summary_path=None, run_index_csv_path=None, config_index_csv_path=None):
    return {
        "checkpointPath": best_checkpoint_path + ".npz",
        "browserCheckpointPath": _best_checkpoint_browser_path(best_checkpoint_path),
        "metaPath": best_checkpoint_path + ".meta.json",
        "summaryPath": summary_path or "",
        "runIndexCsvPath": run_index_csv_path or "",
        "configIndexCsvPath": config_index_csv_path or "",
    }


def _export_browser_checkpoint(src_model_path, dst_browser_path):
    directory = os.path.dirname(dst_browser_path)
    if directory:
        os.makedirs(directory, exist_ok=True)
    export_checkpoint(src_model_path + ".npz", dst_browser_path, fmt="json")


def _write_best_checkpoint_metadata(meta_path, payload):
    directory = os.path.dirname(meta_path)
    if directory:
        os.makedirs(directory, exist_ok=True)
    with open(meta_path, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=2)
        fh.write("\n")


def _load_summary_excerpt(summary_path, top_n=3):
    if not summary_path or not os.path.exists(summary_path):
        return None
    with open(summary_path, "r", encoding="utf-8") as fh:
        summary = json.load(fh)
    return {
        "summaryPath": summary_path,
        "bestRuns": list((summary.get("bestRuns") or [])[:top_n]),
        "bestConfigs": list((summary.get("bestConfigs") or [])[:top_n]),
    }


def _extract_summary_run_context(summary_path, run_label, hidden=None, lr=None):
    if not summary_path or not os.path.exists(summary_path):
        return None
    with open(summary_path, "r", encoding="utf-8") as fh:
        summary = json.load(fh)
    best_runs = summary.get("bestRuns") or []
    run_index = summary.get("runIndex") or []
    best_configs = summary.get("bestConfigs") or []
    config_index = summary.get("configIndex") or []
    combined_top = summary.get("combinedTop") or []
    run_entry = next((entry for entry in best_runs if entry.get("runLabel") == run_label), None)
    run_index_entry = next((entry for entry in run_index if entry.get("runLabel") == run_label), None)
    config_entry = next(
        (
            entry for entry in best_configs
            if entry.get("hidden") == hidden and entry.get("lr") == lr
        ),
        None,
    )
    config_index_entry = next(
        (
            entry for entry in config_index
            if entry.get("hidden") == hidden and entry.get("lr") == lr
        ),
        None,
    )
    combined_top_entry = None
    combined_top_rank = None
    for index, entry in enumerate(combined_top, start=1):
        if entry.get("runLabel") == run_label:
            combined_top_entry = entry
            combined_top_rank = index
            break
    return {
        "runLabel": run_label,
        "runEntry": run_entry,
        "runIndexEntry": run_index_entry,
        "configEntry": config_entry,
        "configIndexEntry": config_index_entry,
        "combinedTopRank": combined_top_rank,
        "combinedTopEntry": combined_top_entry,
    }


def _write_metrics_summary(metrics_csv, output_path, options=None):
    if not metrics_csv or not output_path:
        return None
    command = _build_metrics_summary_command(metrics_csv, output_path, options)
    subprocess.run(
        command,
        cwd=os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
        capture_output=True,
        text=True,
        check=True,
    )
    return output_path


def _format_js_eval_summary(entries):
    if not entries:
        return "js=n/a"
    parts = []
    for entry in entries:
        summary = {
            "opponent": entry.get("opponent"),
            "result": entry.get("result", {}),
        }
        result = summary["result"]
        games = result.get("games", 0) or 0
        wins = result.get("wins", {})
        rl_wins = wins.get("rl", 0)
        rate = (rl_wins / games) if games > 0 else 0.0
        opponent_wins = wins.get(summary["opponent"], 0)
        draws = max(0, games - rl_wins - opponent_wins)
        draw_rate = (draws / games) if games > 0 else 0.0
        exhausted = result.get("exhausted", 0)
        avg_turns = result.get("averageTurns", 0) or 0.0
        match_log = result.get("matchLog", []) or []
        rl_first_games = rl_first_wins = 0
        rl_second_games = rl_second_wins = 0
        for match in match_log:
            lineup = match.get("lineup", []) or []
            try:
                rl_seat = lineup.index("rl")
            except AttributeError:
                rl_seat = -1
            if rl_seat == 0:
                rl_first_games += 1
                if match.get("winnerDifficulty") == "rl":
                    rl_first_wins += 1
            elif rl_seat == 1:
                rl_second_games += 1
                if match.get("winnerDifficulty") == "rl":
                    rl_second_wins += 1
        first_rate = (rl_first_wins / rl_first_games) if rl_first_games > 0 else 0.0
        second_rate = (rl_second_wins / rl_second_games) if rl_second_games > 0 else 0.0
        parts.append(
            f"{summary['opponent']}={rate:.0%}"
            f"(f{first_rate:.0%}/s{second_rate:.0%}/d{draw_rate:.0%})"
            f"/{exhausted}"
            f"@{avg_turns:.1f}"
        )
    return "js=" + " ".join(parts)


def _build_metrics_rows(game_i, epsilon, wr_rnd, wr_weak, wr_normal, wr_strong, wr_expert, wr_pool, train_wr, avg_pl, avg_vl, avg_adv, js_entries, metadata=None):
    metadata = metadata or {}
    base = {
        "game": game_i,
        "run_label": metadata.get("run_label", ""),
        "hidden": metadata.get("hidden"),
        "lr": metadata.get("lr"),
        "eval_every": metadata.get("eval_every"),
        "js_eval_games": metadata.get("js_eval_games"),
        "js_eval_opponents": metadata.get("js_eval_opponents", ""),
        "epsilon": epsilon,
        "rnd": wr_rnd,
        "weak": wr_weak,
        "normal": wr_normal,
        "strong": wr_strong,
        "expert": wr_expert,
        "pool": None if wr_pool != wr_pool else wr_pool,
        "train": train_wr,
        "policy_loss": avg_pl,
        "value_loss": avg_vl,
        "mean_adv": avg_adv,
        "js_opponent": "",
        "js_win_rate": None,
        "js_first_rate": None,
        "js_second_rate": None,
        "js_draw_rate": None,
        "js_exhausted": None,
        "js_avg_turns": None,
    }
    rows = [dict(base)]
    for entry in js_entries or []:
        result = entry.get("result", {})
        games = result.get("games", 0) or 0
        wins = result.get("wins", {})
        rl_wins = wins.get("rl", 0)
        opponent = entry.get("opponent", "")
        opponent_wins = wins.get(opponent, 0)
        draws = max(0, games - rl_wins - opponent_wins)
        match_log = result.get("matchLog", []) or []
        rl_first_games = rl_first_wins = 0
        rl_second_games = rl_second_wins = 0
        for match in match_log:
            lineup = match.get("lineup", []) or []
            rl_seat = lineup.index("rl") if isinstance(lineup, list) else -1
            if rl_seat == 0:
                rl_first_games += 1
                if match.get("winnerDifficulty") == "rl":
                    rl_first_wins += 1
            elif rl_seat == 1:
                rl_second_games += 1
                if match.get("winnerDifficulty") == "rl":
                    rl_second_wins += 1
        row = dict(base)
        row.update({
            "js_opponent": opponent,
            "js_win_rate": (rl_wins / games) if games > 0 else 0.0,
            "js_first_rate": (rl_first_wins / rl_first_games) if rl_first_games > 0 else 0.0,
            "js_second_rate": (rl_second_wins / rl_second_games) if rl_second_games > 0 else 0.0,
            "js_draw_rate": (draws / games) if games > 0 else 0.0,
            "js_exhausted": result.get("exhausted", 0),
            "js_avg_turns": result.get("averageTurns", 0),
        })
        rows.append(row)
    return rows


def _append_metrics_csv(csv_path, rows):
    if not csv_path or not rows:
        return
    fieldnames = [
        "game", "run_label", "hidden", "lr", "eval_every", "js_eval_games", "js_eval_opponents",
        "epsilon", "rnd", "weak", "normal", "strong", "expert", "pool", "train",
        "policy_loss", "value_loss", "mean_adv",
        "js_opponent", "js_win_rate", "js_first_rate", "js_second_rate", "js_draw_rate", "js_exhausted", "js_avg_turns",
    ]
    directory = os.path.dirname(csv_path)
    if directory:
        os.makedirs(directory, exist_ok=True)
    needs_header = not os.path.exists(csv_path) or os.path.getsize(csv_path) == 0
    with open(csv_path, "a", encoding="utf-8") as fh:
        if needs_header:
            fh.write(",".join(fieldnames) + "\n")
        for row in rows:
            values = []
            for key in fieldnames:
                value = row.get(key)
                if value is None:
                    values.append("")
                else:
                    text = str(value)
                    if "," in text or "\n" in text or '"' in text:
                        text = '"' + text.replace('"', '""') + '"'
                    values.append(text)
            fh.write(",".join(values) + "\n")


def eval_vs_js_cpu(model_path, opponents, games=10, max_steps=5000):
    if games <= 0 or not opponents:
        return []
    browser_path = os.path.join(MODEL_DIR, "model.browser.json")
    export_checkpoint(model_path + ".npz", browser_path, fmt="json")
    command = [
        "node",
        os.path.join("scripts", "eval-rl-vs-js.js"),
        "--model", browser_path,
        "--games", str(games),
        "--max-steps", str(max_steps),
        "--format", "json",
        "--opponents", ",".join(opponents),
    ]
    result = subprocess.run(
        command,
        cwd=os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
        capture_output=True,
        text=True,
        check=True,
    )
    return json.loads(result.stdout)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--games",      type=int,   default=10000, help="学習ゲーム数")
    parser.add_argument("--eval-every", type=int,   default=1000,  help="評価間隔")
    parser.add_argument("--hidden",     type=int,   default=256,   help="隠れ層ニューロン数")
    parser.add_argument("--lr",         type=float, default=3e-4,  help="学習率")
    parser.add_argument("--epsilon",    type=float, default=0.20,  help="ε-greedy 初期探索率")
    parser.add_argument("--load",       action="store_true",       help="既存モデルを読み込む")
    parser.add_argument("--js-eval-games", type=int, default=0,    help="JS CPU 相手の評価ゲーム数（0で無効）")
    parser.add_argument("--js-eval-opponents", default="strong,expert", help="JS CPU 評価対象 difficulty のCSV")
    parser.add_argument("--metrics-csv", default="", help="評価指標を追記する CSV パス")
    parser.add_argument("--run-label", default="", help="metrics CSV に残す run ラベル")
    parser.add_argument("--summary-output", default="", help="metrics CSV 集計の出力パス")
    parser.add_argument("--summary-format", default="text", help="metrics 集計の出力形式（text/json）")
    parser.add_argument("--summary-baseline-run", default="", help="metrics 集計時の baseline run")
    parser.add_argument("--summary-weights", default="", help="metrics 集計時の opponent 重み指定")
    parser.add_argument("--summary-draw-penalty", type=float, default=0.25, help="metrics 集計時の draw penalty")
    parser.add_argument("--summary-exhausted-penalty", type=float, default=0.01, help="metrics 集計時の exhausted penalty")
    parser.add_argument("--summary-run-index-csv", default="", help="metrics 集計時に run index を書き出す CSV パス")
    parser.add_argument("--summary-config-index-csv", default="", help="metrics 集計時に config index を書き出す CSV パス")
    parser.add_argument("--best-checkpoint", default="", help="best checkpoint の退避先（.npz 拡張子なし）")
    args = parser.parse_args()
    args.run_label = _make_run_label(args)

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

    print(f"学習開始: {args.games} ゲーム, hidden={args.hidden}, lr={args.lr}, run={args.run_label}")
    js_eval_opponents = _parse_csv_list(args.js_eval_opponents)

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
    best_eval_score = None

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
            wr_rnd    = eval_vs_random(agent, 200)
            wr_weak   = eval_vs_heuristic(agent, 'weak',   50)
            wr_normal = eval_vs_heuristic(agent, 'normal', 50)
            wr_strong = eval_vs_heuristic(agent, 'strong', 50)
            wr_expert = eval_vs_heuristic(agent, 'expert', 50)
            wr_pool   = eval_vs_pool(agent, pool_agents,   50)

            denom    = max(train_calls, 1)
            avg_pl   = total_pl  / denom
            avg_vl   = total_vl  / denom
            avg_adv  = total_adv / denom
            train_wr = agent_wins / args.eval_every

            pool_str = f"{wr_pool:.0%}" if wr_pool == wr_pool else "  n/a"
            js_entries = []
            print(f"[{game_i:6d}] "
                  f"rnd={wr_rnd:.0%}  "
                  f"weak={wr_weak:.0%}  "
                  f"nrm={wr_normal:.0%}  "
                  f"str={wr_strong:.0%}  "
                  f"exp={wr_expert:.0%}  "
                  f"pool={pool_str}  "
                  f"train={train_wr:.0%}  "
                  f"pl={avg_pl:.3f}  vl={avg_vl:.3f}  adv={avg_adv:.3f}  eps={epsilon:.3f}")

            # リセット
            total_pl = total_vl = total_adv = 0.0
            train_calls = agent_wins = 0

            agent.save(model_path)
            if args.js_eval_games > 0 and js_eval_opponents:
                try:
                    js_entries = eval_vs_js_cpu(model_path, js_eval_opponents, games=args.js_eval_games, max_steps=args.eval_every * 10)
                    print(f"         {_format_js_eval_summary(js_entries)}")
                except (subprocess.CalledProcessError, OSError, ValueError, KeyError, json.JSONDecodeError) as exc:
                    print(f"         js-eval-error={exc}")
            if args.metrics_csv:
                rows = _build_metrics_rows(
                    game_i, epsilon, wr_rnd, wr_weak, wr_normal, wr_strong, wr_expert, wr_pool, train_wr, avg_pl, avg_vl, avg_adv, js_entries,
                    metadata={
                        "run_label": args.run_label,
                        "hidden": args.hidden,
                        "lr": args.lr,
                        "eval_every": args.eval_every,
                        "js_eval_games": args.js_eval_games,
                        "js_eval_opponents": ",".join(js_eval_opponents),
                    },
                )
                _append_metrics_csv(args.metrics_csv, rows)
            if args.best_checkpoint:
                eval_score = _score_js_entries(
                    js_entries,
                    weights_text=args.summary_weights,
                    draw_penalty=args.summary_draw_penalty,
                    exhausted_penalty=args.summary_exhausted_penalty,
                )
                if eval_score is None:
                    eval_score = _fallback_checkpoint_score(wr_rnd, wr_normal, wr_strong, wr_expert)
                if best_eval_score is None or eval_score > best_eval_score:
                    best_eval_score = eval_score
                    _copy_checkpoint(model_path, args.best_checkpoint)
                    browser_checkpoint_path = _best_checkpoint_browser_path(args.best_checkpoint)
                    artifact_paths = _best_checkpoint_artifact_paths(
                        args.best_checkpoint,
                        args.summary_output,
                        args.summary_run_index_csv,
                        args.summary_config_index_csv,
                    )
                    _export_browser_checkpoint(args.best_checkpoint, browser_checkpoint_path)
                    _write_best_checkpoint_metadata(
                        args.best_checkpoint + ".meta.json",
                        {
                            "runLabel": args.run_label,
                            "game": game_i,
                            "score": eval_score,
                            **artifact_paths,
                            "rnd": wr_rnd,
                            "normal": wr_normal,
                            "strong": wr_strong,
                            "expert": wr_expert,
                            "jsSummary": js_entries,
                        },
                    )
                    print(f"best checkpoint更新: {args.best_checkpoint}.npz (score={eval_score:.4f})")

    # 末尾の未学習データをフラッシュ
    if len(agent.rewards) > 0:
        agent.train()
        agent.save(model_path)

    print(f"\n学習完了。モデル保存先: {model_path}.npz")
    final_rnd    = eval_vs_random(agent, 500)
    final_weak   = eval_vs_heuristic(agent, 'weak',   100)
    final_normal = eval_vs_heuristic(agent, 'normal', 100)
    final_strong = eval_vs_heuristic(agent, 'strong', 100)
    final_expert = eval_vs_heuristic(agent, 'expert', 100)
    final_pool   = eval_vs_pool(agent, pool_agents, 100)
    pool_str = f"{final_pool:.1%}" if final_pool == final_pool else "n/a"
    print(f"最終勝率: rnd={final_rnd:.1%}  weak={final_weak:.1%}  "
          f"normal={final_normal:.1%}  strong={final_strong:.1%}  "
          f"expert={final_expert:.1%}  pool={pool_str}")
    if args.js_eval_games > 0 and js_eval_opponents:
        try:
            js_entries = eval_vs_js_cpu(model_path, js_eval_opponents, games=args.js_eval_games, max_steps=5000)
            print(f"JS評価: {_format_js_eval_summary(js_entries)}")
        except (subprocess.CalledProcessError, OSError, ValueError, KeyError, json.JSONDecodeError) as exc:
            print(f"JS評価失敗: {exc}")
    if args.metrics_csv and args.summary_output:
        try:
            _write_metrics_summary(
                args.metrics_csv,
                args.summary_output,
                options={
                    "format": args.summary_format,
                    "opponents": js_eval_opponents,
                    "weights": args.summary_weights,
                    "baseline_run": args.summary_baseline_run,
                    "draw_penalty": args.summary_draw_penalty,
                    "exhausted_penalty": args.summary_exhausted_penalty,
                    "run_index_csv": args.summary_run_index_csv,
                    "config_index_csv": args.summary_config_index_csv,
                },
            )
            print(f"metrics集計を書き出しました: {args.summary_output}")
            if args.best_checkpoint:
                meta_path = args.best_checkpoint + ".meta.json"
                if os.path.exists(meta_path):
                    with open(meta_path, "r", encoding="utf-8") as fh:
                        meta = json.load(fh)
                    meta["artifacts"] = _best_checkpoint_artifact_paths(
                        args.best_checkpoint,
                        args.summary_output,
                        args.summary_run_index_csv,
                        args.summary_config_index_csv,
                    )
                    meta["summaryExcerpt"] = _load_summary_excerpt(args.summary_output)
                    meta["summaryRunContext"] = _extract_summary_run_context(
                        args.summary_output,
                        args.run_label,
                        hidden=args.hidden,
                        lr=args.lr,
                    )
                    _write_best_checkpoint_metadata(meta_path, meta)
        except (subprocess.CalledProcessError, OSError) as exc:
            print(f"metrics集計失敗: {exc}")


if __name__ == "__main__":
    main()
