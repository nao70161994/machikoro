#!/usr/bin/env python3
"""Export multi-step deterministic trace fixtures for Python/JS parity checks."""

import argparse
import json

from .cards import CARD_NAMES, LANDMARK_ORDER
from .export_debug_fixture import _serialize_env_setup
from .game_env import (
    ACT_PASS,
    ACT_ROLL1,
    ACT_TV_TARGET,
    MachikoroEnv,
)


def _set_rolls(env, values):
    seq = list(values)

    def _roll():
        if not seq:
            raise RuntimeError("roll sequence exhausted")
        return seq.pop(0)

    env._roll = _roll


def build_trace(scenario):
    env = MachikoroEnv()
    if scenario == "wheat_then_pass":
        _set_rolls(env, [1])
        actions = [ACT_ROLL1, ACT_PASS]
    elif scenario == "tv_then_pass":
        env.players[0].cards["テレビ局"] += 1
        env.players[1].coins = 8
        _set_rolls(env, [6])
        actions = [ACT_ROLL1, ACT_TV_TARGET, ACT_PASS]
    else:
        raise ValueError(f"unknown scenario: {scenario}")
    return env, actions


def export_fixture(scenario):
    env, actions = build_trace(scenario)
    trace = [_serialize_env_setup(env)]
    for action in actions:
        env.step(action)
        trace.append(_serialize_env_setup(env))
    return {
        "scenario": scenario,
        "actions": actions,
        "trace": trace,
        "cardNames": CARD_NAMES,
        "landmarkOrder": LANDMARK_ORDER,
    }


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description="Export deterministic multi-step trace fixtures as JSON.")
    parser.add_argument(
        "--scenario",
        choices=("wheat_then_pass", "tv_then_pass"),
        required=True,
        help="trace scenario to export",
    )
    return parser.parse_args(argv)


def main(argv=None):
    args = parse_args(argv)
    print(json.dumps(export_fixture(args.scenario), ensure_ascii=False))


if __name__ == "__main__":
    main()
