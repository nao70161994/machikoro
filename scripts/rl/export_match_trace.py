#!/usr/bin/env python3
"""Export one Python-side RL match trace as JSON for JS divergence checks."""

import argparse
import json
import os
import random

import numpy as np

from .agent import RLAgent
from .cards import CARD_NAMES, LANDMARK_ORDER, NUM_CARDS
from .encode import action_mask, encode_state
from .export_debug_fixture import _serialize_env_setup
from .game_env import (
    ACT_BC_BASE,
    ACT_BC_SIZE,
    ACT_BUY_CARD_BASE,
    ACT_BUY_LM_BASE,
    ACT_CLEAN_BASE,
    ACT_HARBOR_NO,
    ACT_HARBOR_YES,
    ACT_IT_SAVE,
    ACT_IT_SKIP,
    ACT_KEEP,
    ACT_MOVER_BASE,
    ACT_PASS,
    ACT_RENO_BASE,
    ACT_REROLL,
    ACT_ROLL1,
    ACT_ROLL2,
    ACT_TV_TARGET,
    MachikoroEnv,
)
from .heuristic import heuristic_action
from .train import _greedy_action


def _normalize_model_path(path_text):
    return path_text[:-4] if path_text.endswith(".npz") else path_text


def _infer_hidden_size(model_path):
    checkpoint_path = _normalize_model_path(model_path) + ".npz"
    with np.load(checkpoint_path) as data:
        return int(data["shared_0_b"].shape[0])


def _action_label(action):
    if action == ACT_ROLL1:
        return "ROLL1"
    if action == ACT_ROLL2:
        return "ROLL2"
    if action == ACT_KEEP:
        return "KEEP"
    if action == ACT_REROLL:
        return "REROLL"
    if action == ACT_HARBOR_YES:
        return "HARBOR_YES"
    if action == ACT_HARBOR_NO:
        return "HARBOR_NO"
    if action == ACT_IT_SAVE:
        return "IT_SAVE"
    if action == ACT_IT_SKIP:
        return "IT_SKIP"
    if action == ACT_TV_TARGET:
        return "TV_TARGET"
    if ACT_BC_BASE <= action < ACT_BC_BASE + ACT_BC_SIZE:
        combo = action - ACT_BC_BASE
        give_index = combo // NUM_CARDS
        take_index = combo % NUM_CARDS
        return f"BUSINESS:{CARD_NAMES[give_index]}->{CARD_NAMES[take_index]}"
    if ACT_CLEAN_BASE <= action < ACT_CLEAN_BASE + NUM_CARDS:
        return f"CLEAN:{CARD_NAMES[action - ACT_CLEAN_BASE]}"
    if ACT_MOVER_BASE <= action < ACT_MOVER_BASE + NUM_CARDS:
        return f"MOVER:{CARD_NAMES[action - ACT_MOVER_BASE]}"
    if ACT_RENO_BASE <= action < ACT_RENO_BASE + len(LANDMARK_ORDER):
        return f"RENO:{LANDMARK_ORDER[action - ACT_RENO_BASE]}"
    if ACT_BUY_CARD_BASE <= action < ACT_BUY_LM_BASE:
        return f"BUY_CARD:{CARD_NAMES[action - ACT_BUY_CARD_BASE]}"
    if ACT_BUY_LM_BASE <= action < ACT_BUY_LM_BASE + len(LANDMARK_ORDER):
        return f"BUY_LM:{LANDMARK_ORDER[action - ACT_BUY_LM_BASE]}"
    if action == ACT_PASS:
        return "PASS"
    return f"ACTION:{action}"


def _legal_actions(env):
    return [{"action": int(action), "label": _action_label(int(action))} for action in env.valid_actions()]


def _trace_entry(env, actor_difficulty, action, include_state, roll_cursor=0):
    entry = {
        "actorIndex": env.current,
        "actorDifficulty": actor_difficulty,
        "before": _serialize_env_setup(env),
        "legalActions": _legal_actions(env),
        "chosenAction": {
            "action": int(action),
            "label": _action_label(int(action)),
        },
        "rollsUsed": [],
        "rollCursor": int(roll_cursor),
    }
    if include_state:
        entry["state"] = encode_state(env).astype(float).tolist()
        entry["mask"] = action_mask(env).astype(int).tolist()
    return entry


def export_match_trace(model_path, opponent="strong", seed=1, max_steps=5000, rl_seat="first", rolls=None):
    random.seed(seed)
    np.random.seed(seed)

    hidden_size = _infer_hidden_size(model_path)
    agent = RLAgent(hidden=hidden_size, lr=0.001)
    agent.load(_normalize_model_path(model_path))

    env = MachikoroEnv()
    rl_index = 1 if rl_seat == "second" else 0
    roll_queue = list(rolls or [])
    if roll_queue:
        def _roll():
            if not roll_queue:
                raise RuntimeError("roll sequence exhausted")
            return int(roll_queue.pop(0))
        env._roll = _roll

    trace = []
    roll_cursor = 0
    for _ in range(max_steps):
        if env.done:
            break
        if env.current == rl_index:
            state = encode_state(env)
            mask = action_mask(env)
            action = _greedy_action(agent.net, state, mask)
            entry = _trace_entry(env, "rl", action, include_state=True, roll_cursor=roll_cursor)
        else:
            action = int(heuristic_action(env, opponent))
            entry = _trace_entry(env, opponent, action, include_state=False, roll_cursor=roll_cursor)
        roll_start = len(roll_queue) if roll_queue is not None else None
        env.step(action)
        if roll_start is not None:
            used_count = max(0, roll_start - len(roll_queue))
            entry["rollsUsed"] = list((rolls or [])[roll_cursor:roll_cursor + used_count])
            roll_cursor += used_count
        entry["after"] = _serialize_env_setup(env)
        trace.append(entry)

    players = [opponent, "rl"] if rl_seat == "second" else ["rl", opponent]
    return {
        "source": "python",
        "opponent": opponent,
        "seed": seed,
        "maxSteps": max_steps,
        "rlSeat": rl_seat,
        "rolls": list(rolls or []),
        "players": players,
        "winnerIndex": env.winner if env.winner is not None else -1,
        "winnerDifficulty": players[env.winner] if env.winner is not None else None,
        "turns": env.turn_count,
        "exhausted": not env.done,
        "trace": trace,
        "finalState": _serialize_env_setup(env),
    }


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description="Export one Python-side RL match trace as JSON.")
    parser.add_argument("--model", required=True, help="checkpoint path with or without .npz")
    parser.add_argument("--opponent", default="strong", choices=("weak", "normal", "strong", "expert"))
    parser.add_argument("--seed", type=int, default=1)
    parser.add_argument("--max-steps", type=int, default=5000)
    parser.add_argument("--rl-seat", default="first", choices=("first", "second"))
    parser.add_argument("--rolls", default="", help="comma-separated deterministic die sequence")
    return parser.parse_args(argv)


def main(argv=None):
    args = parse_args(argv)
    print(json.dumps(
        export_match_trace(
            model_path=args.model,
            opponent=args.opponent,
            seed=args.seed,
            max_steps=args.max_steps,
            rl_seat=args.rl_seat,
            rolls=[int(value) for value in args.rolls.split(",") if value],
        ),
        ensure_ascii=False,
    ))


if __name__ == "__main__":
    main()
