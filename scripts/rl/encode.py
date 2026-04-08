# encode.py - 局面ベクトル化・行動マスク生成

import numpy as np
from .game_env import (
    MachikoroEnv, NUM_ACTIONS,
    PHASE_ROLL, PHASE_SELECT_DICE, PHASE_REROLL, PHASE_HARBOR,
    PHASE_PENDING, PHASE_BUILD, PHASE_ORDER, PHASE_INDEX,
)
from .cards import CARD_NAMES, LANDMARK_ORDER, NUM_CARDS, NUM_LANDMARKS

# 状態ベクトルの次元数
STATE_DIM = (
    1           # self_coins（正規化）
    + 1         # opp_coins
    + NUM_LANDMARKS  # 自分のランドマーク（binary）
    + NUM_LANDMARKS  # 相手のランドマーク（binary）
    + NUM_CARDS      # 自分のカード枚数（正規化）
    + NUM_CARDS      # 相手のカード枚数（正規化）
    + NUM_CARDS      # 自分の休業枚数（正規化）
    + len(PHASE_ORDER)  # フェーズ（one-hot）
    + 1         # last_dice / 14
    + 1         # last_d1 / 6
    + 1         # last_d2 / 6
    + 5         # pending counts (tv, biz, clean, mover, reno)
    + 1         # self_it_venture_coins / 10
    + 1         # turn_count / 200
)


def encode_state(env: MachikoroEnv) -> np.ndarray:
    """
    現在プレイヤー視点で局面を実数ベクトルに変換。
    返り値: shape (STATE_DIM,) の float32 配列
    """
    ci = env.current
    oi = 1 - ci
    me = env.players[ci]
    opp = env.players[oi]

    vec = []

    # コイン（0〜1 に正規化）
    vec.append(min(me.coins / 50.0, 1.0))
    vec.append(min(opp.coins / 50.0, 1.0))

    # ランドマーク所持（binary）
    vec.extend([float(me.landmarks[n]) for n in LANDMARK_ORDER])
    vec.extend([float(opp.landmarks[n]) for n in LANDMARK_ORDER])

    # カード枚数（アクティブ、0〜1 正規化）
    vec.extend([min(me.active(n) / 5.0, 1.0) for n in CARD_NAMES])
    vec.extend([min(opp.active(n) / 5.0, 1.0) for n in CARD_NAMES])

    # 休業枚数
    vec.extend([min(me.dormant.get(n, 0) / 5.0, 1.0) for n in CARD_NAMES])

    # フェーズ（one-hot）
    phase_oh = [0.0] * len(PHASE_ORDER)
    if env.phase in PHASE_INDEX:
        phase_oh[PHASE_INDEX[env.phase]] = 1.0
    vec.extend(phase_oh)

    # サイコロ結果
    vec.append(env.last_dice / 14.0)
    vec.append(env.last_d1 / 6.0)
    vec.append(env.last_d2 / 6.0)

    # Pending カウント
    vec.append(float(env.pending_tv))
    vec.append(float(env.pending_biz))
    vec.append(float(env.pending_clean))
    vec.append(float(env.pending_mover))
    vec.append(float(env.pending_reno))

    # IT ベンチャー積立
    vec.append(min(me.it_venture_coins / 10.0, 1.0))

    # ターン数
    vec.append(min(env.turn_count / 200.0, 1.0))

    return np.array(vec, dtype=np.float32)


def action_mask(env: MachikoroEnv) -> np.ndarray:
    """
    有効な行動を 1、無効を 0 にした shape (NUM_ACTIONS,) の bool 配列。
    """
    mask = np.zeros(NUM_ACTIONS, dtype=np.float32)
    for a in env.valid_actions():
        mask[a] = 1.0
    return mask
