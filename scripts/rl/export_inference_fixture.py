#!/usr/bin/env python3
"""Export deterministic inference fixtures for Python/JS parity checks."""

import argparse
import json

import numpy as np

from .cards import NUM_CARDS
from .encode import STATE_DIM, action_mask, encode_state
from .game_env import ACT_PASS, MachikoroEnv, NUM_ACTIONS, PHASE_BUILD
from .export_debug_fixture import build_env


def _softmax(values):
    values = values - np.max(values)
    exps = np.exp(values)
    return exps / (exps.sum() + 1e-9)


def _relu(values):
    return np.maximum(values, 0.0)


def _layer(input_dim, output_dim):
    return {
        "weights": np.zeros((input_dim, output_dim), dtype=np.float32),
        "bias": np.zeros(output_dim, dtype=np.float32),
    }


def build_bundle():
    hidden = 3
    shared0 = _layer(STATE_DIM, hidden)
    shared1 = _layer(hidden, hidden)
    policy = _layer(hidden, NUM_ACTIONS)
    value = _layer(hidden, 1)
    bc_give = _layer(hidden, NUM_CARDS)
    bc_take = _layer(hidden, NUM_CARDS)

    shared0["weights"][0][0] = 1.5
    shared0["weights"][1][1] = 1.25
    shared0["weights"][14][2] = 2.0
    shared0["bias"][:] = np.array([0.1, 0.2, 0.3], dtype=np.float32)

    shared1["weights"][:] = np.array([
        [1.0, 0.0, 0.5],
        [0.0, 1.0, 0.25],
        [0.5, 0.25, 1.0],
    ], dtype=np.float32)
    shared1["bias"][:] = np.array([0.05, 0.1, 0.15], dtype=np.float32)

    policy["weights"][0][0] = 1.0
    policy["weights"][1][1] = 0.8
    policy["weights"][2][ACT_PASS] = 1.2
    policy["weights"][0][ACT_PASS] = -0.4
    policy["bias"][0] = 0.2
    policy["bias"][1] = -0.1
    policy["bias"][ACT_PASS] = 0.05

    value["weights"][:] = np.array([[0.3], [0.2], [0.1]], dtype=np.float32)
    value["bias"][0] = -0.05

    return {
        "formatVersion": 1,
        "schemaVersion": 3,
        "stateDim": STATE_DIM,
        "hiddenSize": hidden,
        "numActions": NUM_ACTIONS,
        "numCards": NUM_CARDS,
        "layers": {
            "shared": [shared0, shared1],
            "policyHead": policy,
            "valueHead": value,
            "businessGiveHead": bc_give,
            "businessTakeHead": bc_take,
        },
    }


def _forward(bundle, state):
    hidden = np.array(state, dtype=np.float32)
    for layer in bundle["layers"]["shared"]:
        hidden = _relu(hidden @ layer["weights"] + layer["bias"])
    logits = hidden @ bundle["layers"]["policyHead"]["weights"] + bundle["layers"]["policyHead"]["bias"]
    value_raw = hidden @ bundle["layers"]["valueHead"]["weights"] + bundle["layers"]["valueHead"]["bias"]
    policy = _softmax(logits)
    value = float(np.tanh(value_raw[0]))
    return policy, value


def export_fixture(scenario):
    env = build_env(scenario)
    bundle = build_bundle()
    state = encode_state(env).astype(np.float32)
    mask = action_mask(env).astype(np.float32)
    policy, value = _forward(bundle, state)
    masked = policy * mask
    total = float(masked.sum())
    if total > 0:
        masked = masked / total
        greedy_action = int(np.argmax(masked))
    else:
        greedy_action = -1
    return {
        "scenario": scenario,
        "state": state.astype(float).tolist(),
        "mask": mask.astype(int).tolist(),
        "policy": policy.astype(float).tolist(),
        "value": value,
        "greedyAction": greedy_action,
        "model": {
            **bundle,
            "layers": {
                key: (
                    value.tolist() if isinstance(value, np.ndarray) else [
                        {
                            "weights": layer["weights"].astype(float).tolist(),
                            "bias": layer["bias"].astype(float).tolist(),
                        } for layer in value
                    ] if key == "shared" else {
                        "weights": value["weights"].astype(float).tolist(),
                        "bias": value["bias"].astype(float).tolist(),
                    }
                )
                for key, value in bundle["layers"].items()
            },
        },
    }


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description="Export deterministic RL inference fixtures as JSON.")
    parser.add_argument(
        "--scenario",
        choices=("initial", "build_initial"),
        default="initial",
        help="fixture scenario to export",
    )
    return parser.parse_args(argv)


def main(argv=None):
    args = parse_args(argv)
    print(json.dumps(export_fixture(args.scenario), ensure_ascii=False))


if __name__ == "__main__":
    main()
