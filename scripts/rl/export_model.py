#!/usr/bin/env python3
"""Export an RL checkpoint into a browser-friendly inference bundle."""

import argparse
import json
import os
from datetime import datetime, timezone

import numpy as np

from .cards import NUM_CARDS
from .network import CHECKPOINT_SCHEMA_VERSION


MODEL_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "models", "rl_model"
)

DEFAULT_INPUT = os.path.join(MODEL_DIR, "model.npz")
DEFAULT_OUTPUT = os.path.join(MODEL_DIR, "model.browser.json")


def _load_layer(data, prefix):
    weight_key = f"{prefix}_W"
    bias_key = f"{prefix}_b"
    if weight_key not in data or bias_key not in data:
        raise KeyError(f"missing layer parameters: {prefix}")
    weights = data[weight_key]
    bias = data[bias_key]
    return {
        "name": prefix,
        "shape": {
            "input": int(weights.shape[0]),
            "output": int(weights.shape[1]),
        },
        "weights": weights.astype(np.float32).tolist(),
        "bias": bias.astype(np.float32).tolist(),
    }


def _load_optional_layer(data, prefix):
    weight_key = f"{prefix}_W"
    bias_key = f"{prefix}_b"
    if weight_key not in data or bias_key not in data:
        return None
    return _load_layer(data, prefix)


def export_checkpoint(input_path, output_path, fmt="json", var_name="RL_MODEL_DATA"):
    with np.load(input_path) as data:
        schema_version = int(data.get("schema_version", -1))
        if schema_version != CHECKPOINT_SCHEMA_VERSION:
            raise ValueError(
                f"schema_version mismatch: expected {CHECKPOINT_SCHEMA_VERSION}, got {schema_version}"
            )

        shared0 = _load_layer(data, "shared_0")
        shared1 = _load_layer(data, "shared_1")
        policy = _load_layer(data, "policy")
        value = _load_layer(data, "value")
        bc_give = _load_layer(data, "bc_give")
        bc_take = _load_layer(data, "bc_take")
        tv_target = _load_optional_layer(data, "tv_target")
        bc_target = _load_optional_layer(data, "bc_target")
        mover_target = _load_optional_layer(data, "mover_target")

    bundle = {
        "formatVersion": 1,
        "schemaVersion": schema_version,
        "exportedAt": datetime.now(timezone.utc).isoformat(),
        "stateDim": shared0["shape"]["input"],
        "hiddenSize": shared0["shape"]["output"],
        "numActions": policy["shape"]["output"],
        "numCards": NUM_CARDS,
        "numTargetSlots": int(tv_target["shape"]["output"]) if tv_target else 0,
        "layers": {
            "shared": [shared0, shared1],
            "policyHead": policy,
            "valueHead": value,
            "businessGiveHead": bc_give,
            "businessTakeHead": bc_take,
        },
    }
    if tv_target:
        bundle["layers"]["tvTargetHead"] = tv_target
    if bc_target:
        bundle["layers"]["businessTargetHead"] = bc_target
    if mover_target:
        bundle["layers"]["moverTargetHead"] = mover_target

    output_dir = os.path.dirname(output_path)
    if output_dir and output_dir != os.path.sep and not os.path.isdir(output_dir):
        os.makedirs(output_dir, exist_ok=True)
    if fmt == "js":
        body = f"globalThis.{var_name} = {json.dumps(bundle, ensure_ascii=False, separators=(',', ':'))};\n"
    else:
        body = json.dumps(bundle, ensure_ascii=False)
    with open(output_path, "w", encoding="utf-8") as fh:
        fh.write(body)
        if fmt == "json":
            fh.write("\n")
    return bundle


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description="Export a trained RL model for browser inference.")
    parser.add_argument("--input", default=DEFAULT_INPUT, help="checkpoint path (.npz)")
    parser.add_argument("--output", default=DEFAULT_OUTPUT, help="output path (.json or .js)")
    parser.add_argument("--format", choices=("json", "js"), default="json", help="output format")
    parser.add_argument("--var-name", default="RL_MODEL_DATA", help="global variable name for --format js")
    return parser.parse_args(argv)


def main(argv=None):
    args = parse_args(argv)
    bundle = export_checkpoint(args.input, args.output, fmt=args.format, var_name=args.var_name)
    print(
        f"exported RL model: stateDim={bundle['stateDim']} hidden={bundle['hiddenSize']} "
        f"actions={bundle['numActions']} output={args.output}"
    )


if __name__ == "__main__":
    main()
