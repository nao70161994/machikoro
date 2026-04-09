#!/usr/bin/env python3
"""Export deterministic roll-resolution fixtures for Python/JS parity checks."""

import argparse
import json

from .cards import CARD_NAMES, LANDMARK_ORDER
from .export_debug_fixture import _serialize_env_setup
from .game_env import (
    ACT_ROLL1,
    MachikoroEnv,
)


def _set_rolls(env, values):
    seq = list(values)

    def _roll():
        if not seq:
            raise RuntimeError("roll sequence exhausted")
        return seq.pop(0)

    env._roll = _roll


def build_env(scenario):
    env = MachikoroEnv()
    force_rolls = [1]
    if scenario == "roll_wheat":
        force_rolls = [1]
    elif scenario == "roll_cafe":
        env.players[1].cards["カフェ"] += 1
        force_rolls = [3]
    elif scenario == "roll_tv":
        env.players[0].cards["テレビ局"] += 1
        env.players[1].coins = 8
        force_rolls = [6]
    elif scenario == "roll_cleaning":
        env.players[0].cards["清掃業"] += 1
        env.players[1].cards["森林"] += 1
        force_rolls = [8]
    else:
        raise ValueError(f"unknown scenario: {scenario}")
    _set_rolls(env, force_rolls)
    return env


def export_fixture(scenario):
    env = build_env(scenario)
    before = _serialize_env_setup(env)
    env.step(ACT_ROLL1)
    after = _serialize_env_setup(env)
    return {
        "scenario": scenario,
        "before": before,
        "after": after,
        "action": ACT_ROLL1,
        "forcedDice": before.get("forcedDice", [])[0] if False else None,
        "cardNames": CARD_NAMES,
        "landmarkOrder": LANDMARK_ORDER,
    }


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description="Export deterministic roll transition fixtures as JSON.")
    parser.add_argument(
        "--scenario",
        choices=("roll_wheat", "roll_cafe", "roll_tv", "roll_cleaning"),
        required=True,
        help="roll scenario to export",
    )
    return parser.parse_args(argv)


def main(argv=None):
    args = parse_args(argv)
    fixture = export_fixture(args.scenario)
    if args.scenario == "roll_wheat":
        fixture["forcedDice"] = 1
    elif args.scenario == "roll_cafe":
        fixture["forcedDice"] = 3
    elif args.scenario == "roll_tv":
        fixture["forcedDice"] = 6
    elif args.scenario == "roll_cleaning":
        fixture["forcedDice"] = 8
    print(json.dumps(fixture, ensure_ascii=False))


if __name__ == "__main__":
    main()
