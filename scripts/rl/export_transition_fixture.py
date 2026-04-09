#!/usr/bin/env python3
"""Export deterministic transition fixtures for Python/JS parity checks."""

import argparse
import json

from .cards import CARD_NAMES, LANDMARK_ORDER
from .export_debug_fixture import build_env, _serialize_env_setup
from .game_env import (
    ACT_BC_BASE,
    ACT_BC_SIZE,
    ACT_BUY_CARD_BASE,
    ACT_BUY_LM_BASE,
    ACT_CLEAN_BASE,
    ACT_IT_SAVE,
    ACT_IT_SKIP,
    ACT_MOVER_BASE,
    ACT_PASS,
    ACT_RENO_BASE,
)


def choose_action(env, scenario):
    valid = env.valid_actions()
    if scenario == "pending_it_save":
        return ACT_IT_SAVE
    if scenario == "pending_it_skip":
        return ACT_IT_SKIP
    if scenario == "build_pass":
        return ACT_PASS
    if scenario == "build_buy_card":
        return next(action for action in valid if ACT_BUY_CARD_BASE <= action < ACT_BUY_LM_BASE)
    if scenario == "build_buy_landmark":
        return next(action for action in valid if action >= ACT_BUY_LM_BASE)
    if scenario == "pending_business":
        return next(action for action in valid if ACT_BC_BASE <= action < ACT_BC_BASE + ACT_BC_SIZE)
    if scenario == "pending_cleaning":
        return next(action for action in valid if action >= ACT_CLEAN_BASE)
    if scenario == "pending_mover":
        return next(action for action in valid if action >= ACT_MOVER_BASE)
    if scenario == "pending_reno":
        return next(action for action in valid if action >= ACT_RENO_BASE)
    raise ValueError(f"unknown scenario: {scenario}")


def scenario_env(scenario):
    if scenario in ("pending_it_save", "pending_it_skip"):
        return build_env("pending_it")
    if scenario == "build_pass":
        return build_env("build_initial")
    if scenario == "build_buy_card":
        env = build_env("build_initial")
        env.players[env.current].coins = 5
        return env
    if scenario == "build_buy_landmark":
        env = build_env("build_initial")
        env.players[env.current].coins = 5
        return env
    if scenario == "pending_business":
        return build_env("pending_business")
    if scenario == "pending_cleaning":
        return build_env("pending_cleaning")
    if scenario == "pending_mover":
        return build_env("pending_mover")
    if scenario == "pending_reno":
        return build_env("pending_reno")
    raise ValueError(f"unknown scenario: {scenario}")


def export_fixture(scenario):
    env = scenario_env(scenario)
    before = _serialize_env_setup(env)
    action = choose_action(env, scenario)
    env.step(action)
    after = _serialize_env_setup(env)
    return {
        "scenario": scenario,
        "action": action,
        "before": before,
        "after": after,
        "cardNames": CARD_NAMES,
        "landmarkOrder": LANDMARK_ORDER,
    }


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description="Export deterministic RL transition fixtures as JSON.")
    parser.add_argument(
        "--scenario",
        choices=(
            "pending_it_save",
            "pending_it_skip",
            "build_pass",
            "build_buy_card",
            "build_buy_landmark",
            "pending_business",
            "pending_cleaning",
            "pending_mover",
            "pending_reno",
        ),
        required=True,
        help="transition scenario to export",
    )
    return parser.parse_args(argv)


def main(argv=None):
    args = parse_args(argv)
    print(json.dumps(export_fixture(args.scenario), ensure_ascii=False))


if __name__ == "__main__":
    main()
