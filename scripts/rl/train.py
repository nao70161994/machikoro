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
import time
from datetime import datetime
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__)
))))

from scripts.rl.game_env import (
    MachikoroEnv, NUM_ACTIONS, ACT_BC_BASE, ACT_BC_SIZE,
    ACT_RENO_BASE, ACT_BUY_CARD_BASE, ACT_BUY_LM_BASE, ACT_PASS,
    PHASE_BUILD,
)
from scripts.rl.encode import encode_state, encode_state_v2, action_mask, state_dim_for_player_count, STATE_DIM_4P
from scripts.rl.agent import RLAgent
from scripts.rl.network import SchemaVersionError
from scripts.rl.cards import NUM_CARDS, CARD_NAMES, CARD_DEF, LANDMARK_ORDER, LANDMARK_COSTS
from scripts.rl.export_model import export_checkpoint


MODEL_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "models", "rl_model"
)
os.makedirs(MODEL_DIR, exist_ok=True)


def _ensure_parent_dir(path):
    directory = os.path.dirname(path)
    if not directory or directory == os.path.sep:
        return
    cwd = os.path.abspath(os.getcwd())
    abs_directory = os.path.abspath(directory)
    try:
        inside_cwd = os.path.commonpath([cwd, abs_directory]) == cwd
    except ValueError:
        inside_cwd = False
    target_directory = os.path.relpath(abs_directory, cwd) if inside_cwd else directory
    if target_directory and target_directory != "." and not os.path.isdir(target_directory):
        os.makedirs(target_directory, exist_ok=True)


def _encode_for_agent(env: MachikoroEnv, agent: RLAgent) -> np.ndarray:
    if getattr(agent, "state_dim", state_dim_for_player_count(len(env.players))) == STATE_DIM_4P:
        return encode_state_v2(env)
    return encode_state(env)


def _pending_target_kind(env: MachikoroEnv):
    if env.phase != "pending" or len(env.players) <= 2:
        return None
    field = env._next_pending_field()
    if field == "pendingTV":
        return "tv"
    if field == "pendingBusiness":
        return "bc"
    if field == "pendingMover":
        return "mover"
    return None


def _target_slot_mask(env: MachikoroEnv, target_slots: int, kind: str) -> np.ndarray:
    mask = np.zeros(int(target_slots or 0), dtype=np.float32)
    slots = env._target_opponent_slots()
    for slot_index, player_index in enumerate(slots[:len(mask)]):
        player = env.players[player_index]
        if kind == "tv":
            if player.coins > 0:
                mask[slot_index] = 1.0
        elif kind == "bc":
            for name in CARD_NAMES:
                if CARD_DEF[name].color == "purple":
                    continue
                if player.cards.get(name, 0) > 0:
                    mask[slot_index] = 1.0
                    break
        elif kind == "mover":
            mask[slot_index] = 1.0
    return mask


def _apply_pending_target_choice(env: MachikoroEnv, net, state: np.ndarray, epsilon: float = 0.0, greedy: bool = False):
    env.set_pending_target_index(None)
    kind = _pending_target_kind(env)
    if kind is None:
        return
    target_slots = int(getattr(net, "target_slots", 0) or 0)
    if target_slots <= 0:
        return
    target_head = {
        "tv": getattr(net, "tv_target_head", None),
        "bc": getattr(net, "bc_target_head", None),
        "mover": getattr(net, "mover_target_head", None),
    }.get(kind)
    if target_head is None:
        return
    target_mask = _target_slot_mask(env, target_slots, kind)
    valid = np.where(target_mask > 0)[0]
    if len(valid) == 0:
        return
    try:
        target_probs, _, target_logits = net.forward_target_details(state, kind)
    except (AttributeError, ValueError):
        return
    if not greedy and epsilon > 0 and random.random() < epsilon:
        env.set_pending_target_slot(int(random.choice(valid)))
        return
    masked = _normalize_masked_probs(target_probs, target_mask)
    if greedy:
        slot_index = _argmax_masked_logits(target_logits, target_mask) if masked.sum() <= 1e-12 else int(np.argmax(masked))
    else:
        slot_index = _sample_masked_logits(target_logits, target_mask) if masked.sum() <= 1e-12 else int(np.random.choice(len(masked), p=masked))
    if slot_index is None:
        return
    env.set_pending_target_slot(int(slot_index))


def _capture_pending_target(env: MachikoroEnv, net):
    kind = _pending_target_kind(env)
    target_slots = int(getattr(net, "target_slots", 0) or 0)
    if kind is None or target_slots <= 0:
        return None, None, np.zeros(target_slots, dtype=np.float32)
    target_mask = _target_slot_mask(env, target_slots, kind)
    if env.pending_target_index is None:
        return kind, None, target_mask
    slots = env._target_opponent_slots()
    try:
        slot_index = slots.index(env.pending_target_index)
    except ValueError:
        slot_index = None
    return kind, slot_index, target_mask


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


def _argmax_masked_logits(logits, mask):
    valid = np.where(np.asarray(mask) > 0)[0]
    if len(valid) == 0:
        return None
    best = valid[0]
    best_score = float(logits[best])
    for index in valid[1:]:
        score = float(logits[index])
        if score > best_score:
            best = index
            best_score = score
    return int(best)


def _sample_masked_logits(logits, mask):
    valid = np.where(np.asarray(mask) > 0)[0]
    if len(valid) == 0:
        return None
    masked_logits = np.asarray(logits, dtype=np.float64)[valid]
    masked_logits = masked_logits - np.max(masked_logits)
    probs = np.exp(masked_logits)
    total = probs.sum()
    if total <= 1e-12:
        return int(valid[0])
    probs = probs / total
    return int(np.random.choice(valid, p=probs))


def _player_asset_value(player) -> float:
    card_value = sum(
        player.cards.get(name, 0) * CARD_DEF[name].cost
        for name in CARD_NAMES
    )
    return float(card_value + _landmark_asset_value(player))


def _landmark_asset_value(player) -> float:
    landmark_value = sum(
        LANDMARK_COSTS[name]
        for name in LANDMARK_ORDER
        if player.landmarks.get(name)
    )
    return float(landmark_value)


def _reward_shaping_defaults() -> dict:
    return {
        "coin": 0.0,
        "opp_coin": 0.0,
        "asset": 0.0,
        "opp_asset": 0.0,
        "landmark": 0.2,
        "opp_landmark": 0.0,
        "build_pass_affordable_penalty": 0.0,
        "clip": 0.3,
    }


def _terminal_reward_defaults() -> dict:
    return {
        "win": 1.0,
        "loss": -1.0,
        "draw": -1.0,
        "landmark_diff": 0.0,
        "landmark_value_diff": 0.0,
        "asset_diff": 0.0,
        "coin_diff": 0.0,
        "diff_clip": 30.0,
        "airport_progress": 0.0,
        "airport_progress_clip": 30.0,
    }


def _is_affordable_build_pass(env, agent_player: int, action) -> bool:
    if action != ACT_PASS:
        return False
    if env.phase != PHASE_BUILD or env.current != agent_player:
        return False
    for valid_action in env.valid_actions():
        if ACT_BUY_CARD_BASE <= valid_action < ACT_BUY_CARD_BASE + NUM_CARDS:
            return True
        if ACT_BUY_LM_BASE <= valid_action < ACT_BUY_LM_BASE + len(LANDMARK_ORDER):
            return True
    return False


def _compute_shaped_reward(env_before, env_after, agent_player: int, config: dict, action=None) -> float:
    before_me = env_before.players[agent_player]
    after_me = env_after.players[agent_player]
    opponents = [i for i in range(len(env_after.players)) if i != agent_player]

    my_coin_delta = after_me.coins - before_me.coins
    opp_coin_delta = sum(
        env_after.players[i].coins - env_before.players[i].coins
        for i in opponents
    )
    my_asset_delta = _player_asset_value(after_me) - _player_asset_value(before_me)
    opp_asset_delta = sum(
        _player_asset_value(env_after.players[i]) - _player_asset_value(env_before.players[i])
        for i in opponents
    )
    my_landmark_delta = after_me.built_lm_count() - before_me.built_lm_count()
    opp_landmark_delta = sum(
        env_after.players[i].built_lm_count() - env_before.players[i].built_lm_count()
        for i in opponents
    )

    is_renovation_destroy = (
        action is not None
        and ACT_RENO_BASE <= action < ACT_RENO_BASE + len(LANDMARK_ORDER)
        and my_landmark_delta < 0
    )
    if is_renovation_destroy:
        # 改装屋の解体収入を中間報酬で褒めると、破壊→再建設の報酬ループになる。
        my_coin_delta = min(my_coin_delta, 0)
        my_asset_delta = min(my_asset_delta, 0)

    reward = 0.0
    reward += config.get("coin", 0.0) * my_coin_delta
    reward -= config.get("opp_coin", 0.0) * opp_coin_delta
    reward += config.get("asset", 0.0) * my_asset_delta
    reward -= config.get("opp_asset", 0.0) * opp_asset_delta
    reward += config.get("landmark", 0.0) * my_landmark_delta
    reward -= config.get("opp_landmark", 0.0) * opp_landmark_delta
    if _is_affordable_build_pass(env_before, agent_player, action):
        reward -= config.get("build_pass_affordable_penalty", 0.0)

    clip = config.get("clip", 0.0)
    if clip and clip > 0:
        reward = float(np.clip(reward, -clip, clip))
    return float(reward)


def _compute_terminal_reward(env, agent_player: int, config: dict) -> float:
    if env.winner == agent_player:
        reward = config.get("win", 1.0)
    elif env.winner is None:
        reward = config.get("draw", -1.0)
    else:
        reward = config.get("loss", -1.0)

    me = env.players[agent_player]
    opponents = [player for index, player in enumerate(env.players) if index != agent_player]
    best_opp = max(opponents, key=lambda player: (
        _landmark_asset_value(player),
        _player_asset_value(player),
        player.coins,
    ))
    diff_clip = config.get("diff_clip", 0.0)

    landmark_diff = me.built_lm_count() - best_opp.built_lm_count()
    landmark_value_diff = _landmark_asset_value(me) - _landmark_asset_value(best_opp)
    asset_diff = _player_asset_value(me) - _player_asset_value(best_opp)
    coin_diff = me.coins - best_opp.coins
    if diff_clip and diff_clip > 0:
        asset_diff = float(np.clip(asset_diff, -diff_clip, diff_clip))
        coin_diff = float(np.clip(coin_diff, -diff_clip, diff_clip))

    reward += config.get("landmark_diff", 0.0) * landmark_diff
    reward += config.get("landmark_value_diff", 0.0) * landmark_value_diff
    reward += config.get("asset_diff", 0.0) * asset_diff
    reward += config.get("coin_diff", 0.0) * coin_diff
    airport_progress_weight = config.get("airport_progress", 0.0)
    if airport_progress_weight and airport_progress_weight > 0 and not me.landmarks.get("空港"):
        airport_progress = max(0.0, min(float(me.coins), float(LANDMARK_COSTS["空港"])))
        airport_progress_clip = config.get("airport_progress_clip", 0.0)
        if airport_progress_clip and airport_progress_clip > 0:
            airport_progress = float(np.clip(airport_progress, 0.0, airport_progress_clip))
        reward += airport_progress_weight * airport_progress
    return float(reward)



def _select_action(net, state, mask, epsilon):
    """BC フェーズを factored head で処理し、(action, value) を返す"""
    valid = np.where(mask > 0)[0]
    bc_available = bool(mask[ACT_BC_BASE:ACT_BC_BASE + ACT_BC_SIZE].any())

    if bc_available:
        bc_give_p, bc_take_p, value, bc_give_logits, bc_take_logits = net.forward_bc_details(state)
        if epsilon > 0 and random.random() < epsilon:
            return int(random.choice(valid)), value
        bc_joint  = mask[ACT_BC_BASE:ACT_BC_BASE + ACT_BC_SIZE].reshape(NUM_CARDS, NUM_CARDS)
        give_mask = (bc_joint.sum(axis=1) > 0).astype(np.float32)
        take_mask = (bc_joint.sum(axis=0) > 0).astype(np.float32)
        give_p = _normalize_masked_probs(bc_give_p, give_mask)
        take_p = _normalize_masked_probs(bc_take_p, take_mask)
        if give_p.sum() <= 1e-12:
            give_idx = _sample_masked_logits(bc_give_logits, give_mask)
        else:
            give_idx = int(np.random.choice(NUM_CARDS, p=give_p))
        if take_p.sum() <= 1e-12:
            take_idx = _sample_masked_logits(bc_take_logits, take_mask)
        else:
            take_idx = int(np.random.choice(NUM_CARDS, p=take_p))
        action = ACT_BC_BASE + give_idx * NUM_CARDS + take_idx
        if mask[action] == 0:
            fallback = _sample_masked_logits(np.zeros_like(mask), mask)
            action = int(fallback if fallback is not None else random.choice(valid))
        return action, value
    else:
        policy, value, logits = net.forward_details(state)
        if epsilon > 0 and random.random() < epsilon:
            return int(random.choice(valid)), value
        masked_p = policy * mask
        s = masked_p.sum()
        if s < 1e-9:
            fallback = _sample_masked_logits(logits, mask)
            return int(fallback if fallback is not None else random.choice(valid)), value
        masked_p = masked_p / s
        return int(np.random.choice(NUM_ACTIONS, p=masked_p)), value


def _greedy_action(net, state, mask):
    """greedy 評価用（BC も factored head を使う）"""
    valid = np.where(mask > 0)[0]
    bc_available = bool(mask[ACT_BC_BASE:ACT_BC_BASE + ACT_BC_SIZE].any())

    if bc_available:
        bc_give_p, bc_take_p, _, bc_give_logits, bc_take_logits = net.forward_bc_details(state)
        bc_joint  = mask[ACT_BC_BASE:ACT_BC_BASE + ACT_BC_SIZE].reshape(NUM_CARDS, NUM_CARDS)
        give_mask = (bc_joint.sum(axis=1) > 0).astype(np.float32)
        take_mask = (bc_joint.sum(axis=0) > 0).astype(np.float32)
        give_p = _normalize_masked_probs(bc_give_p, give_mask)
        take_p = _normalize_masked_probs(bc_take_p, take_mask)
        give_idx = _argmax_masked_logits(bc_give_logits, give_mask) if give_p.sum() <= 1e-12 else int(np.argmax(give_p))
        take_idx = _argmax_masked_logits(bc_take_logits, take_mask) if take_p.sum() <= 1e-12 else int(np.argmax(take_p))
        action = ACT_BC_BASE + give_idx * NUM_CARDS + take_idx
        if mask[action] == 0:
            fallback = _argmax_masked_logits(np.zeros_like(mask), mask)
            return int(fallback if fallback is not None else random.choice(valid))
        return action
    else:
        policy, _, logits = net.forward_details(state)
        masked = policy * mask
        s = masked.sum()
        if s < 1e-9:
            fallback = _argmax_masked_logits(logits, mask)
            return int(fallback if fallback is not None else random.choice(valid))
        return int(np.argmax(masked / s))


def play_vs_random(agent: RLAgent, epsilon: float = 0.1,
                   opp_agent: RLAgent = None, max_steps: int = 3000) -> dict:
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
    ep_target_kinds = []
    ep_target_slots = []
    ep_target_masks = []
    ep_values  = []
    ep_rewards = []

    for _ in range(max_steps):
        if env.done:
            break

        if env.current == agent_player:
            # ── エージェントのターン ──
            state = _encode_for_agent(env, agent)
            _apply_pending_target_choice(env, agent.net, state, epsilon=epsilon, greedy=False)
            target_kind, target_slot, target_mask = _capture_pending_target(env, agent.net)
            mask  = action_mask(env)
            valid = np.where(mask > 0)[0]

            action, value = _select_action(agent.net, state, mask, epsilon)

            lm_before = env.players[agent_player].built_lm_count()
            env.step(action)
            lm_after = env.players[agent_player].built_lm_count()

            ep_states.append(state)
            ep_actions.append(action)
            ep_masks.append(mask)
            ep_target_kinds.append(target_kind)
            ep_target_slots.append(target_slot)
            ep_target_masks.append(target_mask)
            ep_values.append(float(value))
            ep_rewards.append(0.2 * (lm_after - lm_before))

        else:
            # ── 相手のターン ──
            if opp_agent is not None:
                opp_state = _encode_for_agent(env, opp_agent)
                _apply_pending_target_choice(env, opp_agent.net, opp_state, epsilon=0.0, greedy=True)
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
        agent.target_kinds.append(ep_target_kinds[i])
        agent.target_slots.append(ep_target_slots[i])
        agent.target_masks.append(ep_target_masks[i])
        agent.values.append(ep_values[i])
        agent.rewards.append(ep_rewards[i])
        agent.next_values.append(next_values[i])
        agent.dones.append(dones[i])

    return {
        "winner": env.winner,
        "agent_player": agent_player,
        "turns":  env.turn_count,
    }


def _append_episode_to_agent(agent: RLAgent, ep_states, ep_actions, ep_masks, ep_values, ep_rewards,
                             ep_target_kinds=None, ep_target_slots=None, ep_target_masks=None):
    if not ep_states:
        return
    T = len(ep_states)
    next_values = ep_values[1:] + [0.0]
    dones = [False] * (T - 1) + [True]
    if ep_target_kinds is None:
        ep_target_kinds = [None] * T
    if ep_target_slots is None:
        ep_target_slots = [None] * T
    if ep_target_masks is None:
        zero_mask = np.zeros(int(getattr(agent.net, "target_slots", 0) or 0), dtype=np.float32)
        ep_target_masks = [zero_mask.copy() for _ in range(T)]

    for i in range(T):
        agent.states.append(ep_states[i])
        agent.actions.append(ep_actions[i])
        agent.masks.append(ep_masks[i])
        agent.target_kinds.append(ep_target_kinds[i])
        agent.target_slots.append(ep_target_slots[i])
        agent.target_masks.append(ep_target_masks[i])
        agent.values.append(ep_values[i])
        agent.rewards.append(ep_rewards[i])
        agent.next_values.append(next_values[i])
        agent.dones.append(dones[i])


def _has_trainable_target_transition(agent: RLAgent, index: int) -> bool:
    if int(getattr(agent.net, "target_slots", 0) or 0) <= 0:
        return False
    if index < 0 or index >= len(agent.rewards):
        return False
    target_kind = agent.target_kinds[index] if index < len(agent.target_kinds) else None
    target_slot = agent.target_slots[index] if index < len(agent.target_slots) else None
    target_mask = agent.target_masks[index] if index < len(agent.target_masks) else None
    if target_kind not in ("tv", "bc", "mover") or target_slot is None:
        return False
    if target_mask is None or len(target_mask) == 0 or int(np.sum(target_mask)) <= 0:
        return False
    head_name = "bc_target_head" if target_kind == "bc" else f"{target_kind}_target_head"
    return getattr(agent.net, head_name, None) is not None


def _copy_agent_transition(agent: RLAgent, source_index: int):
    agent.states.append(np.array(agent.states[source_index], copy=True))
    agent.actions.append(agent.actions[source_index])
    agent.masks.append(np.array(agent.masks[source_index], copy=True))
    agent.target_kinds.append(agent.target_kinds[source_index] if source_index < len(agent.target_kinds) else None)
    agent.target_slots.append(agent.target_slots[source_index] if source_index < len(agent.target_slots) else None)
    target_mask = agent.target_masks[source_index] if source_index < len(agent.target_masks) else None
    if target_mask is None:
        target_mask = np.zeros(int(getattr(agent.net, "target_slots", 0) or 0), dtype=np.float32)
    agent.target_masks.append(np.array(target_mask, copy=True))
    if len(agent.log_probs) == len(agent.rewards):
        agent.log_probs.append(agent.log_probs[source_index])
    agent.values.append(agent.values[source_index])
    agent.rewards.append(agent.rewards[source_index])
    agent.next_values.append(agent.next_values[source_index])
    agent.dones.append(agent.dones[source_index])


def _oversample_target_transitions(agent: RLAgent, target_ratio: float, max_multiplier: float = 4.0) -> int:
    """Duplicate target-pending transitions before train() to increase target-head updates.

    Default training passes target_ratio=0. 2p models have target_slots=0, so this is a no-op
    even when the flag is accidentally enabled.
    """
    if target_ratio <= 0 or int(getattr(agent.net, "target_slots", 0) or 0) <= 0:
        return 0
    total = len(agent.rewards)
    if total <= 0:
        return 0
    target_indices = [index for index in range(total) if _has_trainable_target_transition(agent, index)]
    if not target_indices:
        return 0

    target_ratio = min(max(float(target_ratio), 0.0), 0.95)
    target_count = len(target_indices)
    current_ratio = target_count / total
    if current_ratio >= target_ratio:
        return 0

    desired_extra = int(np.ceil((target_ratio * total - target_count) / max(1.0 - target_ratio, 1e-9)))
    max_total = max(total, int(np.ceil(total * max(float(max_multiplier), 1.0))))
    desired_extra = min(desired_extra, max(0, max_total - total))
    for _ in range(desired_extra):
        _copy_agent_transition(agent, random.choice(target_indices))
    return desired_extra


def play_training_game(agent: RLAgent, epsilon: float = 0.1, opponent=None, max_steps: int = 3000,
                       reward_config=None, terminal_config=None, self_learn_both_sides: bool = False,
                       player_count: int = 2, debug_game_label: str = "",
                       debug_game_interval_seconds: float = 0.0) -> dict:
    env = MachikoroEnv(player_count=player_count)
    agent_player = random.randrange(len(env.players))
    reward_config = reward_config or _reward_shaping_defaults()
    terminal_config = terminal_config or _terminal_reward_defaults()
    both_sides = bool(self_learn_both_sides and (opponent or {}).get("kind") == "self")
    debug_enabled = debug_game_interval_seconds and debug_game_interval_seconds > 0
    debug_started_at = time.time() if debug_enabled else 0.0
    debug_last_at = debug_started_at

    def maybe_print_debug_step(step_index: int):
        nonlocal debug_last_at
        if not debug_enabled:
            return
        now = time.time()
        if now - debug_last_at < debug_game_interval_seconds:
            return
        debug_last_at = now
        print(
            f"[debug-game {debug_game_label}] step={step_index + 1} "
            f"elapsed={now - debug_started_at:.1f}s turn={getattr(env, 'turn_count', '?')} "
            f"current={getattr(env, 'current', '?')} phase={getattr(env, 'phase', '?')} "
            f"buffer={len(getattr(agent, 'rewards', []))}",
            flush=True,
        )

    if both_sides:
        episodes = [
            {
                "states": [], "actions": [], "masks": [],
                "target_kinds": [], "target_slots": [], "target_masks": [],
                "values": [], "rewards": []
            }
            for _ in env.players
        ]
        for step_i in range(max_steps):
            maybe_print_debug_step(step_i)
            if env.done:
                break

            player = env.current
            state = _encode_for_agent(env, agent)
            _apply_pending_target_choice(env, agent.net, state, epsilon=epsilon, greedy=False)
            target_kind, target_slot, target_mask = _capture_pending_target(env, agent.net)
            mask = action_mask(env)
            action, value = _select_action(agent.net, state, mask, epsilon)

            before_env = copy.deepcopy(env)
            env.step(action)

            episodes[player]["states"].append(state)
            episodes[player]["actions"].append(action)
            episodes[player]["masks"].append(mask)
            episodes[player]["target_kinds"].append(target_kind)
            episodes[player]["target_slots"].append(target_slot)
            episodes[player]["target_masks"].append(target_mask)
            episodes[player]["values"].append(float(value))
            episodes[player]["rewards"].append(_compute_shaped_reward(before_env, env, player, reward_config, action=action))

        recorded_steps = 0
        for player, episode in enumerate(episodes):
            if not episode["states"]:
                continue
            episode["rewards"][-1] += _compute_terminal_reward(env, player, terminal_config)
            recorded_steps += len(episode["states"])
            _append_episode_to_agent(
                agent,
                episode["states"],
                episode["actions"],
                episode["masks"],
                episode["values"],
                episode["rewards"],
                episode["target_kinds"],
                episode["target_slots"],
                episode["target_masks"],
            )

        if recorded_steps == 0:
            return {}

        return {
            "winner": env.winner,
            "agent_player": agent_player,
            "turns": env.turn_count,
            "opponent": "self",
            "self_both_sides": True,
            "recorded_steps": recorded_steps,
        }

    ep_states = []
    ep_actions = []
    ep_masks = []
    ep_target_kinds = []
    ep_target_slots = []
    ep_target_masks = []
    ep_values = []
    ep_rewards = []

    for step_i in range(max_steps):
        maybe_print_debug_step(step_i)
        if env.done:
            break

        if env.current == agent_player:
            state = _encode_for_agent(env, agent)
            _apply_pending_target_choice(env, agent.net, state, epsilon=epsilon, greedy=False)
            target_kind, target_slot, target_mask = _capture_pending_target(env, agent.net)
            mask = action_mask(env)
            action, value = _select_action(agent.net, state, mask, epsilon)

            before_env = copy.deepcopy(env)
            env.step(action)

            ep_states.append(state)
            ep_actions.append(action)
            ep_masks.append(mask)
            ep_target_kinds.append(target_kind)
            ep_target_slots.append(target_slot)
            ep_target_masks.append(target_mask)
            ep_values.append(float(value))
            ep_rewards.append(_compute_shaped_reward(before_env, env, agent_player, reward_config, action=action))
        else:
            env.step(_opponent_action(env, opponent))

    if not ep_states:
        return {}

    ep_rewards[-1] += _compute_terminal_reward(env, agent_player, terminal_config)

    _append_episode_to_agent(
        agent,
        ep_states, ep_actions, ep_masks, ep_values, ep_rewards,
        ep_target_kinds, ep_target_slots, ep_target_masks,
    )

    return {
        "winner": env.winner,
        "agent_player": agent_player,
        "turns": env.turn_count,
        "opponent": (opponent or {}).get("kind", "random"),
    }


def _train_imitation_step(agent: RLAgent, state, mask, action) -> dict:
    valid = np.where(mask > 0)[0]
    if len(valid) <= 1 or action not in valid:
        return {"trained": False, "loss": 0.0}

    is_bc = (ACT_BC_BASE <= action < ACT_BC_BASE + ACT_BC_SIZE)
    if is_bc:
        bc_joint = mask[ACT_BC_BASE:ACT_BC_BASE + ACT_BC_SIZE].reshape(NUM_CARDS, NUM_CARDS)
        give_mask = (bc_joint.sum(axis=1) > 0).astype(np.float32)
        take_mask = (bc_joint.sum(axis=0) > 0).astype(np.float32)
        give_idx = (action - ACT_BC_BASE) // NUM_CARDS
        take_idx = (action - ACT_BC_BASE) % NUM_CARDS
        if give_mask[give_idx] <= 0 or take_mask[take_idx] <= 0:
            return {"trained": False, "loss": 0.0}

        bc_give_p, bc_take_p, _, _, _ = agent.net.forward_bc_details(state)
        give_p = _normalize_masked_probs(bc_give_p, give_mask)
        take_p = _normalize_masked_probs(bc_take_p, take_mask)
        d_give = give_p.astype(np.float32)
        d_take = take_p.astype(np.float32)
        d_give[give_idx] -= 1.0
        d_take[take_idx] -= 1.0
        d_give *= give_mask
        d_take *= take_mask
        agent.net.backward_bc(d_give, d_take, 0.0)
        loss = -np.log(give_p[give_idx] + 1e-9) - np.log(take_p[take_idx] + 1e-9)
        return {"trained": True, "loss": float(loss)}

    policy, _, _ = agent.net.forward_details(state)
    masked = _normalize_masked_probs(policy, mask)
    d_policy = masked.astype(np.float32)
    d_policy[action] -= 1.0
    d_policy *= mask
    agent.net.backward(d_policy, 0.0)
    return {"trained": True, "loss": float(-np.log(masked[action] + 1e-9))}


def run_imitation_pretraining(agent: RLAgent, games: int, opponents, max_steps: int = 1200) -> dict:
    if games <= 0:
        return {"examples": 0, "trained": 0, "accuracy": float("nan"), "loss": float("nan")}

    from .heuristic import heuristic_action

    levels = [level for level in (opponents or []) if level in ("weak", "normal", "strong", "expert")]
    if not levels:
        levels = ["normal", "strong"]

    examples = 0
    trained = 0
    correct_before = 0
    total_loss = 0.0

    for _ in range(games):
        env = MachikoroEnv()
        player_levels = [random.choice(levels), random.choice(levels)]
        for _ in range(max_steps):
            if env.done:
                break
            state = _encode_for_agent(env, agent)
            _apply_pending_target_choice(env, agent.net, state, epsilon=0.0, greedy=True)
            mask = action_mask(env)
            teacher = int(heuristic_action(env, player_levels[env.current]))
            if teacher not in np.where(mask > 0)[0]:
                valid = env.valid_actions()
                teacher = int(random.choice(valid))

            if _greedy_action(agent.net, state, mask) == teacher:
                correct_before += 1
            result = _train_imitation_step(agent, state, mask, teacher)
            examples += 1
            if result["trained"]:
                trained += 1
                total_loss += result["loss"]
            env.step(teacher)

    return {
        "examples": examples,
        "trained": trained,
        "accuracy": _safe_ratio(correct_before, examples),
        "loss": _safe_ratio(total_loss, trained),
        "opponents": ",".join(levels),
    }


def _format_imitation_stats(prefix: str, games: int, stats: dict) -> str:
    return (
        f"{prefix}: "
        f"games={games} "
        f"teacher={stats.get('opponents', '')} "
        f"examples={stats['examples']} "
        f"trained={stats['trained']} "
        f"acc_before={stats['accuracy']:.1%} "
        f"loss={stats['loss']:.3f}"
    )


def eval_vs_random(agent: RLAgent, n_games: int = 200, max_steps: int = 3000, return_stats: bool = False):
    """エージェント対ランダムの勝率を評価（席はゲームごとにランダム）"""
    return _eval_against_opponent(
        agent,
        lambda env: int(random.choice(env.valid_actions())),
        n_games=n_games,
        max_steps=max_steps,
        return_stats=return_stats,
    )


def eval_vs_heuristic(agent: RLAgent, level: str, n_games: int = 50, max_steps: int = 3000, return_stats: bool = False):
    """エージェント対ヒューリスティック CPU の勝率を評価"""
    from .heuristic import heuristic_action
    return _eval_against_opponent(
        agent,
        lambda env: int(heuristic_action(env, level)),
        n_games=n_games,
        max_steps=max_steps,
        return_stats=return_stats,
    )


def eval_vs_pool(agent: RLAgent, pool_agents: list, n_games: int = 50, max_steps: int = 3000, return_stats: bool = False) -> float:
    """エージェント対プール内スナップショットの勝率を評価"""
    if n_games <= 0 or not pool_agents:
        return {
            "winRate": float('nan'),
            "buildStats": _finalize_build_stats(_empty_build_stats()),
            "opponentBuildStats": _finalize_build_stats(_empty_build_stats()),
        } if return_stats else float('nan')
    wins = 0
    build_stats = _empty_build_stats()
    opponent_build_stats = _empty_build_stats()
    for _ in range(n_games):
        opp = random.choice(pool_agents)
        env = MachikoroEnv()
        agent_player = random.randint(0, 1)
        for _ in range(max_steps):
            if env.done:
                break
            if env.current == agent_player:
                state = _encode_for_agent(env, agent)
                _apply_pending_target_choice(env, agent.net, state, epsilon=0.0, greedy=True)
                mask = action_mask(env)
                action = _greedy_action(agent.net, state, mask)
                if env.phase == "build":
                    _record_build_action(build_stats, action)
            else:
                opp_state = _encode_for_agent(env, opp)
                _apply_pending_target_choice(env, opp.net, opp_state, epsilon=0.0, greedy=True)
                opp_mask = action_mask(env)
                action = _greedy_action(opp.net, opp_state, opp_mask)
                if env.phase == "build":
                    _record_build_action(opponent_build_stats, action)
            env.step(action)
        if env.winner == agent_player:
            wins += 1
    win_rate = wins / n_games
    if not return_stats:
        return win_rate
    return {
        "winRate": win_rate,
        "buildStats": _finalize_build_stats(build_stats),
        "opponentBuildStats": _finalize_build_stats(opponent_build_stats),
    }


def _parse_csv_list(value):
    return [item for item in (value or '').split(',') if item]


def _parse_js_eval_lineups(value):
    lineups = []
    for part in (value or "").split(";"):
        lineup = [item.strip() for item in part.split(",") if item.strip()]
        if len(lineup) >= 2 and "rl" in lineup:
            lineups.append(lineup)
    return lineups


def _parse_training_opponents(value):
    entries = []
    for part in (value or "").split(","):
        part = part.strip()
        if not part:
            continue
        kind, sep, weight_text = part.partition("=")
        kind = kind.strip()
        if kind not in ("random", "self", "pool", "weak", "normal", "strong", "expert"):
            continue
        if sep:
            try:
                weight = float(weight_text)
            except (TypeError, ValueError):
                continue
        else:
            weight = 1.0
        if weight <= 0:
            continue
        entries.append({"kind": kind, "weight": weight})
    return entries


def _choose_training_opponent(entries, pool_agents, current_agent=None):
    candidates = []
    for entry in entries or []:
        if entry.get("kind") == "pool" and not pool_agents:
            continue
        candidates.append(entry)
    if not candidates:
        return {"kind": "random"}
    total = sum(max(0.0, entry.get("weight", 0.0)) for entry in candidates)
    if total <= 0:
        return {"kind": "random"}
    pick = random.random() * total
    acc = 0.0
    for entry in candidates:
        acc += max(0.0, entry.get("weight", 0.0))
        if pick <= acc:
            if entry["kind"] == "pool":
                return {"kind": "pool", "agent": random.choice(pool_agents)}
            if entry["kind"] == "self":
                return {"kind": "self", "agent": current_agent}
            return {"kind": entry["kind"]}
    last = candidates[-1]
    if last["kind"] == "pool":
        return {"kind": "pool", "agent": random.choice(pool_agents)}
    if last["kind"] == "self":
        return {"kind": "self", "agent": current_agent}
    return {"kind": last["kind"]}


def _opponent_action(env, opponent):
    kind = (opponent or {}).get("kind", "random")
    if kind in ("pool", "self"):
        opp_agent = opponent.get("agent")
        opp_state = _encode_for_agent(env, opp_agent)
        _apply_pending_target_choice(env, opp_agent.net, opp_state, epsilon=0.0, greedy=True)
        opp_mask = action_mask(env)
        return _greedy_action(opp_agent.net, opp_state, opp_mask)
    if kind == "random":
        return int(random.choice(env.valid_actions()))
    from .heuristic import heuristic_action
    return int(heuristic_action(env, kind))


def _empty_build_stats():
    return {
        "total": 0,
        "pass": 0,
        "cards": {},
        "landmarks": {},
    }


def _record_build_action(stats, action):
    if stats is None:
        return
    stats["total"] += 1
    if action == ACT_PASS:
        stats["pass"] += 1
        return
    if ACT_BUY_CARD_BASE <= action < ACT_BUY_LM_BASE:
        card_name = CARD_NAMES[action - ACT_BUY_CARD_BASE]
        stats["cards"][card_name] = stats["cards"].get(card_name, 0) + 1
        return
    if ACT_BUY_LM_BASE <= action < ACT_BUY_LM_BASE + len(LANDMARK_ORDER):
        landmark_name = LANDMARK_ORDER[action - ACT_BUY_LM_BASE]
        stats["landmarks"][landmark_name] = stats["landmarks"].get(landmark_name, 0) + 1


def _finalize_build_stats(stats):
    total = stats.get("total", 0) or 0
    top_cards = sorted(stats.get("cards", {}).items(), key=lambda item: (-item[1], item[0]))[:5]
    top_landmarks = sorted(stats.get("landmarks", {}).items(), key=lambda item: (-item[1], item[0]))[:5]
    return {
        "total": total,
        "pass": stats.get("pass", 0) or 0,
        "passRate": (stats.get("pass", 0) / total) if total > 0 else 0.0,
        "topCards": [{"name": name, "count": count} for name, count in top_cards],
        "topLandmarks": [{"name": name, "count": count} for name, count in top_landmarks],
    }


def _format_build_stats(label, stats):
    if not stats:
        return f"{label}=n/a"
    top_cards = ",".join(f"{entry['name']}x{entry['count']}" for entry in stats.get("topCards", [])) or "none"
    top_landmarks = ",".join(f"{entry['name']}x{entry['count']}" for entry in stats.get("topLandmarks", [])) or "none"
    return (
        f"{label}=pass{stats.get('passRate', 0.0):.0%}"
        f"({stats.get('pass', 0)}/{stats.get('total', 0)})"
        f" cards=[{top_cards}] landmarks=[{top_landmarks}]"
    )


def _eval_against_opponent(agent: RLAgent, opponent_selector, n_games: int = 50, max_steps: int = 3000, return_stats: bool = False):
    if n_games <= 0:
        return {
            "winRate": float('nan'),
            "buildStats": _finalize_build_stats(_empty_build_stats()),
            "opponentBuildStats": _finalize_build_stats(_empty_build_stats()),
        } if return_stats else float('nan')
    wins = 0
    build_stats = _empty_build_stats()
    opponent_build_stats = _empty_build_stats()
    for _ in range(n_games):
        env = MachikoroEnv()
        agent_player = random.randint(0, 1)
        for _ in range(max_steps):
            if env.done:
                break
            if env.current == agent_player:
                state = _encode_for_agent(env, agent)
                _apply_pending_target_choice(env, agent.net, state, epsilon=0.0, greedy=True)
                mask = action_mask(env)
                action = _greedy_action(agent.net, state, mask)
                if action is not None and env.phase == "build":
                    _record_build_action(build_stats, action)
            else:
                action = opponent_selector(env)
                if action is not None and env.phase == "build":
                    _record_build_action(opponent_build_stats, action)
            env.step(action)
        if env.winner == agent_player:
            wins += 1
    win_rate = wins / n_games
    if not return_stats:
        return win_rate
    return {
        "winRate": win_rate,
        "buildStats": _finalize_build_stats(build_stats),
        "opponentBuildStats": _finalize_build_stats(opponent_build_stats),
    }


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
        lineup = entry.get("lineup") or result.get("players") or ["rl", opponent]
        opp_wins = sum(wins.get(player, 0) for player in set(lineup) if player != "rl")
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
    _ensure_parent_dir(dst)
    with open(src, "rb") as src_fh, open(dst, "wb") as dst_fh:
        dst_fh.write(src_fh.read())


def _checkpoint_model_base_path(path):
    text = str(path or "").strip()
    if text.endswith(".npz"):
        text = text[:-4]
    return text


def _checkpoint_npz_path(path):
    base_path = _checkpoint_model_base_path(path)
    return base_path + ".npz" if base_path else ""


def _load_agent_checkpoint(agent, path, require_exists=False):
    base_path = _checkpoint_model_base_path(path)
    checkpoint_path = _checkpoint_npz_path(base_path)
    if not checkpoint_path or not os.path.exists(checkpoint_path):
        if require_exists:
            raise FileNotFoundError(checkpoint_path or str(path or ""))
        return False, base_path, checkpoint_path
    agent.load(base_path)
    return True, base_path, checkpoint_path


def _ranked_checkpoint_path(base_checkpoint_path, rank):
    if rank <= 1:
        return base_checkpoint_path
    return f"{base_checkpoint_path}.top{rank}"


def _candidate_checkpoint_path(base_checkpoint_path, game):
    return f"{base_checkpoint_path}.candidate-{game}"


def _update_top_checkpoints(candidates, candidate, top_k):
    if top_k <= 0:
        return []
    updated = [dict(entry) for entry in candidates]
    updated.append(dict(candidate))
    updated.sort(key=lambda entry: entry.get("score", float("-inf")), reverse=True)
    return updated[:top_k]


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
    _ensure_parent_dir(dst_browser_path)
    export_checkpoint(src_model_path + ".npz", dst_browser_path, fmt="json")


def _write_best_checkpoint_metadata(meta_path, payload):
    _ensure_parent_dir(meta_path)
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
        lineup = entry.get("lineup") or result.get("players") or ["rl", summary["opponent"]]
        opponent_wins = sum(wins.get(player, 0) for player in set(lineup) if player != "rl")
        draws = max(0, games - rl_wins - opponent_wins)
        draw_rate = (draws / games) if games > 0 else 0.0
        exhausted = result.get("exhausted", 0)
        avg_turns = result.get("averageTurns", 0) or 0.0
        match_log = result.get("matchLog", []) or []
        rl_first_games = rl_first_wins = 0
        rl_second_games = rl_second_wins = 0
        seat_games = {}
        seat_wins = {}
        for match in match_log:
            lineup = match.get("lineup", []) or []
            try:
                rl_seat = lineup.index("rl")
            except (AttributeError, ValueError):
                rl_seat = -1
            if rl_seat >= 0:
                seat_games[rl_seat] = seat_games.get(rl_seat, 0) + 1
                if match.get("winnerDifficulty") == "rl":
                    seat_wins[rl_seat] = seat_wins.get(rl_seat, 0) + 1
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
        seat_text = f"f{first_rate:.0%}/s{second_rate:.0%}"
        if len(lineup) > 2:
            seat_text = ",".join(
                f"p{index}={(seat_wins.get(index, 0) / seat_games[index]):.0%}"
                for index in sorted(seat_games)
                if seat_games[index] > 0
            ) or seat_text
        parts.append(
            f"{summary['opponent']}={rate:.0%}"
            f"({seat_text}/d{draw_rate:.0%})"
            f"/{exhausted}"
            f"@{avg_turns:.1f}"
        )
    return "js=" + " ".join(parts)


def _build_metrics_rows(
    game_i, epsilon, wr_rnd, wr_weak, wr_normal, wr_strong, wr_expert, wr_pool,
    train_wr, avg_pl, avg_vl, avg_adv, js_entries, metadata=None
):
    metadata = metadata or {}
    base = {
        "game": game_i,
        "run_label": metadata.get("run_label", ""),
        "seed": metadata.get("seed"),
        "hidden": metadata.get("hidden"),
        "lr": metadata.get("lr"),
        "eval_every": metadata.get("eval_every"),
        "js_eval_games": metadata.get("js_eval_games"),
        "js_eval_opponents": metadata.get("js_eval_opponents", ""),
        "cpu_opponent_impl": metadata.get("cpu_opponent_impl", "python"),
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
        "target_pending_rate": metadata.get("target_pending_rate"),
        "target_update_rate": metadata.get("target_update_rate"),
        "tv_target_rate": metadata.get("tv_target_rate"),
        "bc_target_rate": metadata.get("bc_target_rate"),
        "mover_target_rate": metadata.get("mover_target_rate"),
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
        lineup = entry.get("lineup") or result.get("players") or ["rl", opponent]
        opponent_wins = sum(wins.get(player, 0) for player in set(lineup) if player != "rl")
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
        "game", "run_label", "seed", "hidden", "lr", "eval_every", "js_eval_games", "js_eval_opponents",
        "cpu_opponent_impl",
        "epsilon", "rnd", "weak", "normal", "strong", "expert", "pool", "train",
        "policy_loss", "value_loss", "mean_adv",
        "target_pending_rate", "target_update_rate", "tv_target_rate", "bc_target_rate", "mover_target_rate",
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


def eval_vs_js_cpu(model_path, opponents, games=10, max_steps=5000, lineups=None):
    lineups = lineups or []
    if games <= 0 or (not opponents and not lineups):
        return []
    browser_path = model_path + ".browser.json"
    export_checkpoint(model_path + ".npz", browser_path, fmt="json")
    command = [
        "node",
        os.path.join("scripts", "eval-rl-vs-js.js"),
        "--model", browser_path,
        "--games", str(games),
        "--max-steps", str(max_steps),
        "--format", "json",
    ]
    if lineups:
        command.extend(["--lineups", ";".join(",".join(lineup) for lineup in lineups)])
    else:
        command.extend(["--opponents", ",".join(opponents)])
    result = subprocess.run(
        command,
        cwd=os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
        capture_output=True,
        text=True,
        check=True,
    )
    return json.loads(result.stdout)


def _safe_ratio(value, total):
    if total <= 0:
        return 0.0
    return value / total


def _resolve_player_count_range(player_count: int = 2, player_count_min=None, player_count_max=None) -> tuple[int, int]:
    fixed = max(2, min(int(player_count or 2), 10))
    if player_count_min is None and player_count_max is None:
        return fixed, fixed
    if player_count_min is None:
        min_count = fixed
        max_count = max(2, min(int(player_count_max or fixed), 10))
    elif player_count_max is None:
        min_count = max_count = max(2, min(int(player_count_min or fixed), 10))
    else:
        min_count = max(2, min(int(player_count_min or fixed), 10))
        max_count = max(2, min(int(player_count_max or fixed), 10))
    if min_count > max_count:
        min_count, max_count = max_count, min_count
    return min_count, max_count


def _sample_player_count(player_count_range: tuple[int, int]) -> int:
    min_count, max_count = player_count_range
    if min_count >= max_count:
        return min_count
    return random.randint(min_count, max_count)


def _state_dim_for_player_count_range(player_count_range: tuple[int, int]) -> int:
    return state_dim_for_player_count(player_count_range[1])


def _target_slots_for_player_count_range(player_count_range: tuple[int, int]) -> int:
    if player_count_range[1] <= 2:
        return 0
    return min(3, max(0, player_count_range[1] - 1))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--games",      type=int,   default=10000, help="学習ゲーム数")
    parser.add_argument("--eval-every", type=int,   default=1000,  help="評価間隔")
    parser.add_argument("--hidden",     type=int,   default=256,   help="隠れ層ニューロン数")
    parser.add_argument("--lr",         type=float, default=3e-4,  help="学習率")
    parser.add_argument("--seed",       type=int,   default=None,  help="Python random / numpy の乱数seed（未指定なら固定しない）")
    parser.add_argument("--epsilon",    type=float, default=0.20,  help="ε-greedy 初期探索率")
    parser.add_argument("--train-opponents", default="random=0.7,pool=0.3", help="学習時に混ぜる相手の重み指定 random/self/pool/weak/normal/strong/expert")
    parser.add_argument("--player-count", type=int, default=2, help="Python学習環境の固定プレイヤー人数（2〜10、3人以上は多人数用状態表現）")
    parser.add_argument("--player-count-min", type=int, default=None, help="学習ゲームごとにランダム化する最小プレイヤー人数（2〜10）。未指定なら --player-count 固定")
    parser.add_argument("--player-count-max", type=int, default=None, help="学習ゲームごとにランダム化する最大プレイヤー人数（2〜10）。未指定なら --player-count 固定")
    parser.add_argument("--self-learn-both-sides", action="store_true", help="opponent=self の学習ゲームで両席の行動を学習対象にする")
    parser.add_argument("--target-oversample-ratio", type=float, default=0.0, help="train()直前にtarget pending遷移を複製して目標比率まで増やす（0で無効）")
    parser.add_argument("--target-oversample-max-multiplier", type=float, default=4.0, help="target oversampling後の最大buffer倍率")
    parser.add_argument("--cpu-opponent-impl", choices=("python", "js-oracle"), default="python", help="weak以外のCPU相手の実装 python/js-oracle")
    parser.add_argument("--js-cpu-oracle", action="store_true", help="互換エイリアス: --cpu-opponent-impl js-oracle")
    parser.add_argument("--imitation-games", type=int, default=0, help="RL前にCPU教師行動で模倣学習するゲーム数（0で無効）")
    parser.add_argument("--imitation-opponents", default="normal,strong", help="模倣学習で教師に使うCPU difficulty CSV")
    parser.add_argument("--imitation-max-steps", type=int, default=1200, help="模倣学習1試合あたりの最大 step 数")
    parser.add_argument("--imitation-refresh-games", type=int, default=0, help="学習中に周期的に追加する模倣学習ゲーム数（0で無効）")
    parser.add_argument("--imitation-refresh-every", type=int, default=0, help="模倣リフレッシュを実行する学習ゲーム間隔（0で無効）")
    parser.add_argument("--load",       action="store_true",       help="既存モデルを読み込む")
    parser.add_argument("--load-checkpoint", default="", help="指定checkpointから読み込む（.npz 拡張子あり/なし両対応）")
    parser.add_argument("--js-eval-games", type=int, default=0,    help="JS CPU 相手の評価ゲーム数（0で無効）")
    parser.add_argument("--js-eval-opponents", default="strong,expert", help="JS CPU 評価対象 difficulty のCSV")
    parser.add_argument("--js-eval-lineups", default="", help="JS評価のlineup指定。例: rl,weak,normal,strong;rl,normal,normal,strong")
    parser.add_argument("--initial-eval-games", type=int, default=200, help="学習開始前の vs ランダム評価ゲーム数")
    parser.add_argument("--eval-random-games", type=int, default=200, help="定期評価での vs ランダム評価ゲーム数")
    parser.add_argument("--eval-heuristic-games", type=int, default=50, help="定期評価でのヒューリスティック評価ゲーム数")
    parser.add_argument("--eval-pool-games", type=int, default=50, help="定期評価での opponent pool 評価ゲーム数")
    parser.add_argument("--final-eval-random-games", type=int, default=500, help="学習終了時の vs ランダム評価ゲーム数")
    parser.add_argument("--final-eval-heuristic-games", type=int, default=100, help="学習終了時のヒューリスティック評価ゲーム数")
    parser.add_argument("--final-eval-pool-games", type=int, default=100, help="学習終了時の opponent pool 評価ゲーム数")
    parser.add_argument("--pool-update-every", type=int, default=5000, help="過去モデルpoolへsnapshotを追加するゲーム間隔（0で無効）")
    parser.add_argument("--pool-max-size", type=int, default=5, help="保持する過去モデルsnapshot数")
    parser.add_argument("--progress-every", type=int, default=0, help="軽量な進捗表示を出すゲーム間隔（0で無効）")
    parser.add_argument("--debug-game-seconds", type=float, default=0.0, help="指定秒数ごとに学習ゲーム内の軽量debugログを出す（0で無効）")
    parser.add_argument("--debug-train-batch", action="store_true", help="train() batch の件数と所要時間をdebug表示する")
    parser.add_argument("--train-batch-size", type=int, default=8, help="何ゲーム分の遷移をまとめて train() するか")
    parser.add_argument("--max-steps", type=int, default=3000, help="学習ゲーム1試合あたりの最大 step 数")
    parser.add_argument("--eval-max-steps", type=int, default=3000, help="評価ゲーム1試合あたりの最大 step 数")
    parser.add_argument("--reward-coin", type=float, default=0.0, help="自分のコイン増加に対する中間報酬係数")
    parser.add_argument("--reward-opp-coin", type=float, default=0.0, help="相手のコイン増加に対するペナルティ係数")
    parser.add_argument("--reward-asset", type=float, default=0.0, help="自分の総資産増加に対する中間報酬係数")
    parser.add_argument("--reward-opp-asset", type=float, default=0.0, help="相手の総資産増加に対するペナルティ係数")
    parser.add_argument("--reward-landmark", type=float, default=0.2, help="自分のランドマーク建設に対する中間報酬係数")
    parser.add_argument("--reward-opp-landmark", type=float, default=0.0, help="相手のランドマーク建設に対するペナルティ係数")
    parser.add_argument("--build-pass-affordable-penalty", type=float, default=0.0, help="購入可能なbuild phaseでpassした時の中間報酬ペナルティ（0で無効）")
    parser.add_argument("--reward-clip", type=float, default=0.3, help="1行動あたりの中間報酬クリップ値（0で無効）")
    parser.add_argument("--terminal-win", type=float, default=1.0, help="終局時の勝利報酬")
    parser.add_argument("--terminal-loss", type=float, default=-1.0, help="終局時の敗北報酬")
    parser.add_argument("--terminal-draw", type=float, default=-1.0, help="終局時の引き分け/未決着報酬")
    parser.add_argument("--terminal-landmark-diff", type=float, default=0.0, help="終局時ランドマーク数差の報酬係数")
    parser.add_argument("--terminal-landmark-value-diff", type=float, default=0.0, help="終局時ランドマーク建設済コスト差の報酬係数")
    parser.add_argument("--terminal-asset-diff", type=float, default=0.0, help="終局時総資産差の報酬係数")
    parser.add_argument("--terminal-coin-diff", type=float, default=0.0, help="終局時コイン差の報酬係数")
    parser.add_argument("--terminal-diff-clip", type=float, default=30.0, help="終局時の資産差/コイン差クリップ値（0で無効）")
    parser.add_argument("--terminal-airport-progress", type=float, default=0.0, help="終局時、空港未建設の所持コイン進捗に対する報酬係数（0で無効）")
    parser.add_argument("--terminal-airport-progress-clip", type=float, default=30.0, help="空港進捗報酬の所持コイン上限（0で無効）")
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
    parser.add_argument("--best-checkpoint-top-k", type=int, default=1, help="保存する best checkpoint 候補数。2以上で .top2/.top3... も保存")
    parser.add_argument("--restore-best-at-end", action="store_true", help="学習終了時に best checkpoint を通常モデルへ復元する")
    args = parser.parse_args()
    args.run_label = _make_run_label(args)
    if args.js_cpu_oracle:
        args.cpu_opponent_impl = "js-oracle"
    if args.cpu_opponent_impl == "js-oracle":
        os.environ["MACHIKORO_RL_JS_CPU_ORACLE"] = "1"
    else:
        os.environ.pop("MACHIKORO_RL_JS_CPU_ORACLE", None)
    if args.seed is not None:
        random.seed(args.seed)
        np.random.seed(args.seed)

    player_count_range = _resolve_player_count_range(args.player_count, args.player_count_min, args.player_count_max)
    args.player_count = player_count_range[0] if player_count_range[0] == player_count_range[1] else player_count_range[1]
    state_dim = _state_dim_for_player_count_range(player_count_range)
    target_slots = _target_slots_for_player_count_range(player_count_range)
    agent = RLAgent(hidden=args.hidden, lr=args.lr, state_dim=state_dim, target_slots=target_slots)

    model_path = os.path.join(MODEL_DIR, "model")
    checkpoint_path = model_path + ".npz"
    if args.load_checkpoint:
        try:
            _, _, loaded_checkpoint_path = _load_agent_checkpoint(agent, args.load_checkpoint, require_exists=True)
            print(f"モデル読み込み: {loaded_checkpoint_path}")
        except (SchemaVersionError, ValueError, KeyError, OSError, FileNotFoundError) as exc:
            print(
                f"エラー: チェックポイントを読み込めません: {exc}\n"
                f"指定ファイルはそのまま保持されています: {_checkpoint_npz_path(args.load_checkpoint)}"
            )
            sys.exit(1)
    elif args.load:
        try:
            loaded, _, loaded_checkpoint_path = _load_agent_checkpoint(agent, model_path, require_exists=False)
            if loaded:
                print(f"モデル読み込み: {loaded_checkpoint_path}")
        except (SchemaVersionError, ValueError, KeyError, OSError) as exc:
            print(
                f"エラー: チェックポイントを読み込めません: {exc}\n"
                f"モデルファイルはそのまま保持されています: {checkpoint_path}\n"
                f"新規学習を開始するには手動で削除してください: rm {checkpoint_path}"
            )
            sys.exit(1)

    oracle_text = f", cpu_opponent_impl={args.cpu_opponent_impl}"
    seed_text = f", seed={args.seed}" if args.seed is not None else ""
    player_count_label = (
        str(player_count_range[0])
        if player_count_range[0] == player_count_range[1]
        else f"{player_count_range[0]}-{player_count_range[1]} random"
    )
    player_count_text = f", players={player_count_label}, state_dim={state_dim}"
    print(f"学習開始: {args.games} ゲーム, hidden={args.hidden}, lr={args.lr}, run={args.run_label}{oracle_text}{seed_text}{player_count_text}")
    js_eval_opponents = _parse_csv_list(args.js_eval_opponents)
    js_eval_lineups = _parse_js_eval_lineups(args.js_eval_lineups)
    js_eval_label = args.js_eval_lineups if js_eval_lineups else ",".join(js_eval_opponents)
    train_opponents = _parse_training_opponents(args.train_opponents)
    reward_config = {
        "coin": args.reward_coin,
        "opp_coin": args.reward_opp_coin,
        "asset": args.reward_asset,
        "opp_asset": args.reward_opp_asset,
        "landmark": args.reward_landmark,
        "opp_landmark": args.reward_opp_landmark,
        "build_pass_affordable_penalty": args.build_pass_affordable_penalty,
        "clip": args.reward_clip,
    }
    terminal_config = {
        "win": args.terminal_win,
        "loss": args.terminal_loss,
        "draw": args.terminal_draw,
        "landmark_diff": args.terminal_landmark_diff,
        "landmark_value_diff": args.terminal_landmark_value_diff,
        "asset_diff": args.terminal_asset_diff,
        "coin_diff": args.terminal_coin_diff,
        "diff_clip": args.terminal_diff_clip,
        "airport_progress": args.terminal_airport_progress,
        "airport_progress_clip": args.terminal_airport_progress_clip,
    }

    if args.initial_eval_games > 0:
        win_rate = eval_vs_random(agent, args.initial_eval_games, max_steps=args.eval_max_steps)
        print(f"[初期] vs ランダム勝率: {win_rate:.1%}")
    else:
        print("[初期] vs ランダム評価をスキップ")

    imitation_opponents = _parse_csv_list(args.imitation_opponents)
    if args.imitation_games > 0:
        stats = run_imitation_pretraining(
            agent,
            args.imitation_games,
            imitation_opponents,
            max_steps=args.imitation_max_steps,
        )
        print(_format_imitation_stats("模倣事前学習", args.imitation_games, stats))

    # 累積統計
    total_pl  = 0.0
    total_vl  = 0.0
    total_adv = 0.0
    total_target_pending = 0.0
    total_target_update = 0.0
    total_tv_target = 0.0
    total_bc_target = 0.0
    total_mover_target = 0.0
    train_calls = 0
    agent_wins  = 0  # 学習ゲームでのエージェント勝利数

    batch_size = max(1, args.train_batch_size)

    # 対戦相手プール（過去モデルのスナップショット）
    pool_agents = []
    best_eval_score = None
    top_checkpoints = []

    for game_i in range(1, args.games + 1):
        # ε を線形減衰
        epsilon = max(0.02, args.epsilon * (1 - game_i / args.games))

        # 一定ゲームごとに現在モデルをプールにコピー
        if args.pool_update_every > 0 and game_i % args.pool_update_every == 0:
            pool_was_full = len(pool_agents) >= args.pool_max_size
            snap = RLAgent(hidden=args.hidden, lr=args.lr, state_dim=state_dim, target_slots=target_slots)
            snap.net = copy.deepcopy(agent.net)
            pool_agents.append(snap)
            if len(pool_agents) > args.pool_max_size:
                pool_agents.pop(0)
            pool_action = "rotated" if pool_was_full else "added"
            print(f"  [pool] snapshot {pool_action} #{len(pool_agents)}/{args.pool_max_size} at game {game_i}")

        opponent = _choose_training_opponent(train_opponents, pool_agents, current_agent=agent)
        game_player_count = _sample_player_count(player_count_range)
        info = play_training_game(
            agent,
            epsilon=epsilon,
            opponent=opponent,
            max_steps=args.max_steps,
            reward_config=reward_config,
            terminal_config=terminal_config,
            self_learn_both_sides=args.self_learn_both_sides,
            player_count=game_player_count,
            debug_game_label=f"{game_i}/{args.games}",
            debug_game_interval_seconds=args.debug_game_seconds,
        )
        if info.get("winner") == info.get("agent_player"):
            agent_wins += 1

        if game_i % batch_size == 0:
            train_started_at = time.time()
            train_buffer_before = len(agent.rewards)
            if args.debug_train_batch:
                print(
                    f"[debug-train-batch-start {game_i}/{args.games}] "
                    f"bufferBefore={train_buffer_before}",
                    flush=True,
                )
            _oversample_target_transitions(
                agent,
                args.target_oversample_ratio,
                max_multiplier=args.target_oversample_max_multiplier,
            )
            train_buffer_after = len(agent.rewards)
            stats = agent.train()
            if args.debug_train_batch:
                print(
                    f"[debug-train-batch {game_i}/{args.games}] "
                    f"bufferBefore={train_buffer_before} bufferAfter={train_buffer_after} "
                    f"elapsed={time.time() - train_started_at:.1f}s",
                    flush=True,
                )
            train_calls += 1
            if stats:
                total_pl  += stats.get("policy_loss", 0)
                total_vl  += stats.get("value_loss",  0)
                total_adv += stats.get("mean_adv",    0)
                total_target_pending += stats.get("target_pending_rate", 0)
                total_target_update += stats.get("target_update_rate", 0)
                total_tv_target += stats.get("tv_target_rate", 0)
                total_bc_target += stats.get("bc_target_rate", 0)
                total_mover_target += stats.get("mover_target_rate", 0)

        if (
            args.imitation_refresh_games > 0
            and args.imitation_refresh_every > 0
            and game_i % args.imitation_refresh_every == 0
        ):
            stats = run_imitation_pretraining(
                agent,
                args.imitation_refresh_games,
                imitation_opponents,
                max_steps=args.imitation_max_steps,
            )
            print(_format_imitation_stats(f"[模倣 {game_i:6d}]", args.imitation_refresh_games, stats))

        if args.progress_every > 0 and game_i % args.progress_every == 0 and game_i % args.eval_every != 0:
            recent_train_wr = _safe_ratio(agent_wins, game_i % args.eval_every if args.eval_every > 0 else game_i)
            print(f"[進捗 {game_i:6d}/{args.games}] train={recent_train_wr:.0%} eps={epsilon:.3f}")

        if game_i % args.eval_every == 0:
            eval_rnd = eval_vs_random(agent, args.eval_random_games, max_steps=args.eval_max_steps, return_stats=True)
            eval_weak = eval_vs_heuristic(agent, 'weak', args.eval_heuristic_games, max_steps=args.eval_max_steps, return_stats=True)
            eval_normal = eval_vs_heuristic(agent, 'normal', args.eval_heuristic_games, max_steps=args.eval_max_steps, return_stats=True)
            wr_rnd = eval_rnd["winRate"]
            wr_weak = eval_weak["winRate"]
            wr_normal = eval_normal["winRate"]
            wr_strong = eval_vs_heuristic(agent, 'strong', args.eval_heuristic_games, max_steps=args.eval_max_steps)
            wr_expert = eval_vs_heuristic(agent, 'expert', args.eval_heuristic_games, max_steps=args.eval_max_steps)
            wr_pool   = eval_vs_pool(agent, pool_agents,   args.eval_pool_games, max_steps=args.eval_max_steps)

            denom    = max(train_calls, 1)
            avg_pl   = total_pl  / denom
            avg_vl   = total_vl  / denom
            avg_adv  = total_adv / denom
            avg_target_pending = total_target_pending / denom
            avg_target_update = total_target_update / denom
            avg_tv_target = total_tv_target / denom
            avg_bc_target = total_bc_target / denom
            avg_mover_target = total_mover_target / denom
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
                  f"pl={avg_pl:.3f}  vl={avg_vl:.3f}  adv={avg_adv:.3f}  "
                  f"tgt={avg_target_pending:.0%}/{avg_target_update:.0%}"
                  f"(tv={avg_tv_target:.0%} bc={avg_bc_target:.0%} mv={avg_mover_target:.0%})  "
                  f"eps={epsilon:.3f}")
            print(
                f"         build(eval) "
                f"{_format_build_stats('rnd', eval_rnd['buildStats'])} "
                f"{_format_build_stats('weak', eval_weak['buildStats'])} "
                f"{_format_build_stats('nrm', eval_normal['buildStats'])}"
            )
            print(
                f"         opp({args.cpu_opponent_impl}) "
                f"{_format_build_stats('rnd', eval_rnd['opponentBuildStats'])} "
                f"{_format_build_stats('weak', eval_weak['opponentBuildStats'])} "
                f"{_format_build_stats('nrm', eval_normal['opponentBuildStats'])}"
            )

            # リセット
            total_pl = total_vl = total_adv = 0.0
            total_target_pending = total_target_update = 0.0
            total_tv_target = total_bc_target = total_mover_target = 0.0
            train_calls = agent_wins = 0

            agent.save(model_path)
            if args.js_eval_games > 0 and (js_eval_opponents or js_eval_lineups):
                try:
                    js_entries = eval_vs_js_cpu(model_path, js_eval_opponents, games=args.js_eval_games, max_steps=args.eval_max_steps, lineups=js_eval_lineups)
                    print(f"         {_format_js_eval_summary(js_entries)}")
                except (subprocess.CalledProcessError, OSError, ValueError, KeyError, json.JSONDecodeError) as exc:
                    print(f"         js-eval-error={exc}")
            if args.metrics_csv:
                rows = _build_metrics_rows(
                    game_i, epsilon, wr_rnd, wr_weak, wr_normal, wr_strong, wr_expert, wr_pool, train_wr, avg_pl, avg_vl, avg_adv, js_entries,
                    metadata={
                        "run_label": args.run_label,
                        "seed": args.seed,
                        "hidden": args.hidden,
                        "lr": args.lr,
                        "eval_every": args.eval_every,
                        "js_eval_games": args.js_eval_games,
                        "js_eval_opponents": js_eval_label,
                        "cpu_opponent_impl": args.cpu_opponent_impl,
                        "target_pending_rate": avg_target_pending,
                        "target_update_rate": avg_target_update,
                        "tv_target_rate": avg_tv_target,
                        "bc_target_rate": avg_bc_target,
                        "mover_target_rate": avg_mover_target,
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
                candidate_path = _candidate_checkpoint_path(args.best_checkpoint, game_i)
                checkpoint_candidate = {
                    "game": game_i,
                    "score": eval_score,
                    "path": candidate_path,
                    "seed": args.seed,
                    "rnd": wr_rnd,
                    "normal": wr_normal,
                    "strong": wr_strong,
                    "expert": wr_expert,
                    "jsSummary": js_entries,
                }
                top_checkpoints = _update_top_checkpoints(
                    top_checkpoints,
                    checkpoint_candidate,
                    max(1, args.best_checkpoint_top_k),
                )
                saved_rank = next(
                    (
                        rank for rank, entry in enumerate(top_checkpoints, start=1)
                        if entry.get("game") == game_i and entry.get("score") == eval_score
                    ),
                    None,
                )
                if saved_rank == 1:
                    _copy_checkpoint(model_path, candidate_path)
                    for rank, entry in enumerate(top_checkpoints, start=1):
                        checkpoint_path = _ranked_checkpoint_path(args.best_checkpoint, rank)
                        _copy_checkpoint(entry["path"], checkpoint_path)
                        _export_browser_checkpoint(checkpoint_path, _best_checkpoint_browser_path(checkpoint_path))
                        artifact_paths = _best_checkpoint_artifact_paths(
                            checkpoint_path,
                            args.summary_output,
                            args.summary_run_index_csv,
                            args.summary_config_index_csv,
                        )
                        _write_best_checkpoint_metadata(
                            checkpoint_path + ".meta.json",
                            {
                                "runLabel": args.run_label,
                                "game": entry["game"],
                                "score": entry["score"],
                                "rank": rank,
                                "seed": entry.get("seed"),
                                **artifact_paths,
                                "sourceCheckpointPath": entry["path"] + ".npz",
                                "rnd": entry.get("rnd"),
                                "normal": entry.get("normal"),
                                "strong": entry.get("strong"),
                                "expert": entry.get("expert"),
                                "cpuOpponentImpl": args.cpu_opponent_impl,
                                "jsSummary": entry.get("jsSummary", []),
                            },
                        )
                    best_eval_score = top_checkpoints[0]["score"]
                    print(f"best checkpoint更新: {args.best_checkpoint}.npz (score={eval_score:.4f})")
                elif saved_rank is not None:
                    _copy_checkpoint(model_path, candidate_path)
                    for rank, entry in enumerate(top_checkpoints, start=1):
                        checkpoint_path = _ranked_checkpoint_path(args.best_checkpoint, rank)
                        _copy_checkpoint(entry["path"], checkpoint_path)
                        _export_browser_checkpoint(checkpoint_path, _best_checkpoint_browser_path(checkpoint_path))
                        artifact_paths = _best_checkpoint_artifact_paths(
                            checkpoint_path,
                            args.summary_output,
                            args.summary_run_index_csv,
                            args.summary_config_index_csv,
                        )
                        _write_best_checkpoint_metadata(
                            checkpoint_path + ".meta.json",
                            {
                                "runLabel": args.run_label,
                                "game": entry["game"],
                                "score": entry["score"],
                                "rank": rank,
                                "seed": entry.get("seed"),
                                **artifact_paths,
                                "sourceCheckpointPath": entry["path"] + ".npz",
                                "rnd": entry.get("rnd"),
                                "normal": entry.get("normal"),
                                "strong": entry.get("strong"),
                                "expert": entry.get("expert"),
                                "cpuOpponentImpl": args.cpu_opponent_impl,
                                "jsSummary": entry.get("jsSummary", []),
                            },
                        )
                    best_eval_score = top_checkpoints[0]["score"]
                    checkpoint_path = _ranked_checkpoint_path(args.best_checkpoint, saved_rank)
                    print(f"best checkpoint候補#{saved_rank}更新: {checkpoint_path}.npz (score={eval_score:.4f})")

    # 末尾の未学習データをフラッシュ
    if len(agent.rewards) > 0:
        agent.train()
        agent.save(model_path)

    if args.restore_best_at_end and args.best_checkpoint and os.path.exists(args.best_checkpoint + ".npz"):
        _copy_checkpoint(args.best_checkpoint, model_path)
        agent.load(model_path)
        export_checkpoint(model_path + ".npz", os.path.join(MODEL_DIR, "model.browser.json"), fmt="json")
        print(f"best checkpointを最終モデルへ復元: {args.best_checkpoint}.npz")

    print(f"\n学習完了。モデル保存先: {model_path}.npz")
    final_eval_rnd = eval_vs_random(agent, args.final_eval_random_games, max_steps=args.eval_max_steps, return_stats=True)
    final_eval_weak = eval_vs_heuristic(agent, 'weak', args.final_eval_heuristic_games, max_steps=args.eval_max_steps, return_stats=True)
    final_eval_normal = eval_vs_heuristic(agent, 'normal', args.final_eval_heuristic_games, max_steps=args.eval_max_steps, return_stats=True)
    final_rnd = final_eval_rnd["winRate"]
    final_weak = final_eval_weak["winRate"]
    final_normal = final_eval_normal["winRate"]
    final_strong = eval_vs_heuristic(agent, 'strong', args.final_eval_heuristic_games, max_steps=args.eval_max_steps)
    final_expert = eval_vs_heuristic(agent, 'expert', args.final_eval_heuristic_games, max_steps=args.eval_max_steps)
    final_pool   = eval_vs_pool(agent, pool_agents, args.final_eval_pool_games, max_steps=args.eval_max_steps)
    pool_str = f"{final_pool:.1%}" if final_pool == final_pool else "n/a"
    print(f"最終勝率: rnd={final_rnd:.1%}  weak={final_weak:.1%}  "
          f"normal={final_normal:.1%}  strong={final_strong:.1%}  "
          f"expert={final_expert:.1%}  pool={pool_str}")
    print(
        f"build評価: "
        f"{_format_build_stats('rnd', final_eval_rnd['buildStats'])} "
        f"{_format_build_stats('weak', final_eval_weak['buildStats'])} "
        f"{_format_build_stats('nrm', final_eval_normal['buildStats'])}"
    )
    print(
        f"opponent評価({args.cpu_opponent_impl}): "
        f"{_format_build_stats('rnd', final_eval_rnd['opponentBuildStats'])} "
        f"{_format_build_stats('weak', final_eval_weak['opponentBuildStats'])} "
        f"{_format_build_stats('nrm', final_eval_normal['opponentBuildStats'])}"
    )
    if args.js_eval_games > 0 and (js_eval_opponents or js_eval_lineups):
        try:
            js_entries = eval_vs_js_cpu(model_path, js_eval_opponents, games=args.js_eval_games, max_steps=args.eval_max_steps, lineups=js_eval_lineups)
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
                    "opponents": ["+".join(lineup) for lineup in js_eval_lineups] if js_eval_lineups else js_eval_opponents,
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
