#!/usr/bin/env python3
"""Export deterministic phase-resolution fixtures for Python/JS parity checks."""

import argparse
import json

from .cards import CARD_NAMES, LANDMARK_ORDER
from .export_debug_fixture import _serialize_env_setup
from .game_env import (
    ACT_HARBOR_NO,
    ACT_HARBOR_YES,
    ACT_KEEP,
    ACT_REROLL,
    ACT_ROLL1,
    ACT_ROLL2,
    MachikoroEnv,
    PHASE_HARBOR,
    PHASE_REROLL,
    PHASE_SELECT_DICE,
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
    if scenario == "select_dice_one":
        env.players[0].landmarks["駅"] = True
        env.phase = PHASE_SELECT_DICE
        _set_rolls(env, [4])
        return env
    if scenario == "select_dice_two":
        env.players[0].landmarks["駅"] = True
        env.phase = PHASE_SELECT_DICE
        _set_rolls(env, [2, 3])
        return env
    if scenario == "reroll_keep":
        env.phase = PHASE_REROLL
        env.last_dice = 4
        env.last_d1 = 4
        env.last_d2 = 0
        return env
    if scenario == "reroll_roll":
        env.phase = PHASE_REROLL
        env.last_dice = 4
        env.last_d1 = 4
        env.last_d2 = 0
        _set_rolls(env, [2])
        return env
    if scenario == "harbor_yes":
        env.players[0].landmarks["港"] = True
        env.phase = PHASE_HARBOR
        env.last_dice = 10
        env.last_d1 = 5
        env.last_d2 = 5
        return env
    if scenario == "harbor_no":
        env.players[0].landmarks["港"] = True
        env.phase = PHASE_HARBOR
        env.last_dice = 10
        env.last_d1 = 5
        env.last_d2 = 5
        return env
    raise ValueError(f"unknown scenario: {scenario}")


def choose_action(scenario):
    if scenario == "select_dice_one":
        return ACT_ROLL1
    if scenario == "select_dice_two":
        return ACT_ROLL2
    if scenario == "reroll_keep":
        return ACT_KEEP
    if scenario == "reroll_roll":
        return ACT_REROLL
    if scenario == "harbor_yes":
        return ACT_HARBOR_YES
    if scenario == "harbor_no":
        return ACT_HARBOR_NO
    raise ValueError(f"unknown scenario: {scenario}")


def export_fixture(scenario):
    env = build_env(scenario)
    before = _serialize_env_setup(env)
    action = choose_action(scenario)
    env.step(action)
    after = _serialize_env_setup(env)
    return {
        "scenario": scenario,
        "before": before,
        "after": after,
        "action": action,
        "cardNames": CARD_NAMES,
        "landmarkOrder": LANDMARK_ORDER,
    }


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description="Export deterministic phase transition fixtures as JSON.")
    parser.add_argument(
        "--scenario",
        choices=(
            "select_dice_one",
            "select_dice_two",
            "reroll_keep",
            "reroll_roll",
            "harbor_yes",
            "harbor_no",
        ),
        required=True,
        help="phase transition scenario to export",
    )
    return parser.parse_args(argv)


def main(argv=None):
    args = parse_args(argv)
    print(json.dumps(export_fixture(args.scenario), ensure_ascii=False))


if __name__ == "__main__":
    main()
