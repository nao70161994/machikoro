"""Persistent bridge to the JavaScript CPU action oracle.

This is intended as the parity reference while the Python heuristic is rebuilt
to mirror js/CPU.js structurally. It keeps one Node.js process alive, avoiding
the worst overhead of spawning Node for every action.
"""

from __future__ import annotations

import json
import select
import subprocess
from pathlib import Path
from typing import Any

from .cards import CARD_NAMES, LANDMARK_ORDER


ROOT = Path(__file__).resolve().parents[2]
ORACLE_SCRIPT = ROOT / "scripts" / "rl" / "js_cpu_action_oracle.js"


def env_to_js_state(env) -> dict[str, Any]:
    return {
        "currentPlayerIndex": env.current,
        "phase": env.phase,
        "turnCount": env.turn_count,
        "lastDiceResult": env.last_dice,
        "lastDice1": env.last_d1,
        "lastDice2": env.last_d2,
        "pendingTV": env.pending_tv,
        "pendingBusiness": env.pending_biz,
        "pendingCleaning": env.pending_clean,
        "pendingMover": env.pending_mover,
        "pendingRenovation": env.pending_reno,
        "pendingIT": bool(env.pending_it),
        "pendingActions": [
            {"field": field}
            for field in getattr(env, "pending_action_queue", [])
        ],
        "usedReroll": bool(env.used_reroll),
        "builtThisTurn": bool(env.built_this_turn),
        "hadAmusementParkAtRoll": bool(env.had_ap_at_roll),
        "enabledLandmarks": list(env.enabled_lm),
        "shopStock": {
            name: int(env.shop_stock.get(name, 6))
            for name in CARD_NAMES
            if int(env.shop_stock.get(name, 6)) != 6
        },
        "players": [
            {
                "coins": int(player.coins),
                "itVentureCoins": int(player.it_venture_coins),
                "landmarks": {
                    name: True
                    for name in LANDMARK_ORDER
                    if player.landmarks.get(name)
                },
                "cards": {
                    name: int(player.cards.get(name, 0))
                    for name in CARD_NAMES
                    if int(player.cards.get(name, 0)) > 0
                },
                "cardOrder": list(env._sync_card_order(player)),
                "cardDormantOrder": list(player.card_order_dormant),
                "dormant": {
                    name: int(player.dormant.get(name, 0))
                    for name in CARD_NAMES
                    if int(player.dormant.get(name, 0)) > 0
                },
            }
            for player in env.players
        ],
    }


class JsCpuOracle:
    def __init__(self, timeout_seconds: float = 5.0) -> None:
        self._timeout_seconds = timeout_seconds
        self._proc = subprocess.Popen(
            ["node", str(ORACLE_SCRIPT)],
            cwd=str(ROOT),
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            bufsize=1,
        )

    def close(self) -> None:
        if self._proc.poll() is None:
            self._proc.terminate()

    def action(self, env, difficulty: str) -> int:
        if self._proc.poll() is not None:
            raise RuntimeError("JS CPU oracle process is not running")
        payload = json.dumps(
            {"difficulty": difficulty, "state": env_to_js_state(env)},
            ensure_ascii=False,
        )
        assert self._proc.stdin is not None
        assert self._proc.stdout is not None
        self._proc.stdin.write(payload + "\n")
        self._proc.stdin.flush()
        if hasattr(self._proc.stdout, "fileno"):
            ready, _, _ = select.select([self._proc.stdout], [], [], self._timeout_seconds)
            if not ready:
                self.close()
                raise RuntimeError("JS CPU oracle timed out")
        line = self._proc.stdout.readline()
        if not line:
            raise RuntimeError("JS CPU oracle returned no response")
        result = json.loads(line)
        if "error" in result:
            raise RuntimeError(f"JS CPU oracle error: {result['error']}")
        if "targetIndex" in result:
            env.set_pending_target_index(int(result["targetIndex"]))
        else:
            env.set_pending_target_index(None)
        return int(result["action"])
