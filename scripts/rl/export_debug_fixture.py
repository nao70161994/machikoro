#!/usr/bin/env python3
"""Export small RL debug fixtures for Python/JS parity checks."""

import argparse
import json

from .cards import CARD_NAMES, LANDMARK_ORDER

PENDING_ACTION_BY_FIELD = {
    "pendingTV": "resolveTV",
    "pendingBusiness": "resolveBusiness",
    "pendingCleaning": "resolveCleaning",
    "pendingMover": "resolveMover",
    "pendingRenovation": "resolveRenovation",
}
from .encode import STATE_DIM, action_mask, encode_state
from .game_env import (
    MachikoroEnv,
    NUM_ACTIONS,
    PHASE_BUILD,
    PHASE_PENDING,
    PHASE_SELECT_DICE,
)


def build_env(scenario):
    env = MachikoroEnv()
    if scenario == "initial":
        return env
    if scenario == "station_select_dice":
        env.players[env.current].landmarks["駅"] = True
        env.phase = PHASE_SELECT_DICE
        return env
    if scenario == "build_initial":
        env.phase = PHASE_BUILD
        return env
    if scenario == "pending_it":
        env.phase = PHASE_PENDING
        env.pending_it = True
        return env
    if scenario == "pending_business":
        env.phase = PHASE_PENDING
        env.pending_biz = 1
        env.players[0].cards["コンビニ"] += 1
        env.players[0].cards["森林"] += 1
        env.players[0].cards["テレビ局"] += 1
        env.players[1].cards["牧場"] += 1
        env.players[1].cards["森林"] += 1
        env.players[1].cards["スタジアム"] += 1
        return env
    if scenario == "pending_cleaning":
        env.phase = PHASE_PENDING
        env.pending_clean = 1
        env.players[0].cards["コンビニ"] += 1
        env.players[1].cards["コンビニ"] += 1
        env.players[1].cards["森林"] += 1
        env.players[1].dormant["森林"] = 1
        return env
    if scenario == "pending_mover":
        env.phase = PHASE_PENDING
        env.pending_mover = 1
        env.players[0].cards["コンビニ"] += 1
        env.players[0].cards["森林"] += 1
        env.players[0].cards["ビジネスセンター"] += 1
        return env
    if scenario == "pending_reno":
        env.phase = PHASE_PENDING
        env.pending_reno = 1
        env.players[0].landmarks["駅"] = True
        env.players[0].landmarks["港"] = True
        return env
    raise ValueError(f"unknown scenario: {scenario}")


def _serialize_env_setup(env):
    return {
        "current": env.current,
        "phase": env.phase,
        "lastDice": env.last_dice,
        "lastDice1": env.last_d1,
        "lastDice2": env.last_d2,
        "turnCount": env.turn_count,
        "pendingTV": env.pending_tv,
        "pendingBusiness": env.pending_biz,
        "pendingCleaning": env.pending_clean,
        "pendingMover": env.pending_mover,
        "pendingRenovation": env.pending_reno,
        "pendingActions": [
            {"field": field, "action": PENDING_ACTION_BY_FIELD[field]}
            for field in getattr(env, "pending_action_queue", [])
            if field in PENDING_ACTION_BY_FIELD
        ],
        "pendingIT": env.pending_it,
        "usedReroll": env.used_reroll,
        "shopStock": {name: int(env.shop_stock[name]) for name in CARD_NAMES if env.shop_stock.get(name, 0) != 6},
        "players": [
            {
                "coins": player.coins,
                "cards": {name: int(player.cards[name]) for name in CARD_NAMES if player.cards[name] > 0},
                "cardOrder": list(env._sync_card_order(player)),
                "dormant": {name: int(player.dormant[name]) for name in CARD_NAMES if player.dormant.get(name, 0) > 0},
                "landmarks": {name: bool(player.landmarks[name]) for name in LANDMARK_ORDER if player.landmarks[name]},
                "itVentureCoins": player.it_venture_coins,
            }
            for player in env.players
        ],
    }


def export_fixture(scenario):
    env = build_env(scenario)
    return {
        "scenario": scenario,
        "stateDim": STATE_DIM,
        "numActions": NUM_ACTIONS,
        "cardNames": CARD_NAMES,
        "landmarkOrder": LANDMARK_ORDER,
        "phase": env.phase,
        "setup": _serialize_env_setup(env),
        "state": encode_state(env).astype(float).tolist(),
        "mask": action_mask(env).astype(int).tolist(),
    }


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description="Export RL parity debug fixtures as JSON.")
    parser.add_argument(
        "--scenario",
        choices=(
            "initial",
            "station_select_dice",
            "build_initial",
            "pending_it",
            "pending_business",
            "pending_cleaning",
            "pending_mover",
            "pending_reno",
        ),
        default="initial",
        help="fixture scenario to export",
    )
    return parser.parse_args(argv)


def main(argv=None):
    args = parse_args(argv)
    print(json.dumps(export_fixture(args.scenario), ensure_ascii=False))


if __name__ == "__main__":
    main()
