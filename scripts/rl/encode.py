# encode.py - 局面ベクトル化・行動マスク生成

import numpy as np
from .game_env import (
    MachikoroEnv, NUM_ACTIONS,
    PHASE_ROLL, PHASE_SELECT_DICE, PHASE_REROLL, PHASE_HARBOR,
    PHASE_PENDING, PHASE_BUILD, PHASE_ORDER, PHASE_INDEX,
)
from .cards import CARD_NAMES, LANDMARK_ORDER, NUM_CARDS, NUM_LANDMARKS, CARD_DEF, LANDMARK_COSTS

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
    + 1         # pending_it flag
    + 1         # self_it_venture_coins / 10
    + 1         # turn_count / 200
)

MAX_PLAYERS = 4
PLAYER_FEATURE_DIM_V2 = (
    1
    + NUM_LANDMARKS
    + NUM_CARDS
    + NUM_CARDS
    + 1
)
GLOBAL_FEATURE_DIM_V2 = (
    len(PHASE_ORDER)
    + 3
    + 5
    + 1
    + 1
    + 1
)
STATE_DIM_4P = PLAYER_FEATURE_DIM_V2 * MAX_PLAYERS + GLOBAL_FEATURE_DIM_V2


def state_dim_for_player_count(player_count: int = 2) -> int:
    return STATE_DIM if int(player_count or 2) <= 2 else STATE_DIM_4P


def _player_threat_score(player) -> float:
    score = float(player.coins)
    score += sum(LANDMARK_COSTS[n] * 2 for n in LANDMARK_ORDER if player.landmarks[n])
    score += sum(player.active(n) * CARD_DEF[n].cost for n in CARD_NAMES)
    return score


def _append_player_features(vec, player):
    vec.append(min(player.coins / 50.0, 1.0))
    vec.extend([float(player.landmarks[n]) for n in LANDMARK_ORDER])
    vec.extend([min(player.active(n) / 5.0, 1.0) for n in CARD_NAMES])
    vec.extend([min(player.dormant.get(n, 0) / 5.0, 1.0) for n in CARD_NAMES])
    vec.append(min(player.it_venture_coins / 10.0, 1.0))


def encode_state_v2(env: MachikoroEnv) -> np.ndarray:
    """
    最大4人固定の多人数用状態表現。
    自分 + 脅威度順の相手3枠を固定長で並べ、空き枠はゼロ埋めする。
    """
    me = env.players[env.current]
    opponents = [
        player for index, player in enumerate(env.players)
        if index != env.current
    ]
    opponents.sort(key=_player_threat_score, reverse=True)

    vec = []
    _append_player_features(vec, me)
    for slot in range(MAX_PLAYERS - 1):
        if slot < len(opponents):
            _append_player_features(vec, opponents[slot])
        else:
            vec.extend([0.0] * PLAYER_FEATURE_DIM_V2)

    phase_oh = [0.0] * len(PHASE_ORDER)
    if env.phase in PHASE_INDEX:
        phase_oh[PHASE_INDEX[env.phase]] = 1.0
    vec.extend(phase_oh)

    vec.append(env.last_dice / 14.0)
    vec.append(env.last_d1 / 6.0)
    vec.append(env.last_d2 / 6.0)
    vec.append(float(env.pending_tv))
    vec.append(float(env.pending_biz))
    vec.append(float(env.pending_clean))
    vec.append(float(env.pending_mover))
    vec.append(float(env.pending_reno))
    vec.append(float(env.pending_it))
    vec.append(min(env.turn_count / 200.0, 1.0))
    vec.append((len(env.players) - 2) / 2.0)

    return np.array(vec, dtype=np.float32)


def encode_state(env: MachikoroEnv) -> np.ndarray:
    """
    現在プレイヤー視点で局面を実数ベクトルに変換。
    返り値: shape (STATE_DIM,) の float32 配列
    """
    if len(env.players) > 2:
        return encode_state_v2(env)

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
    vec.append(float(env.pending_it))

    # IT ベンチャー積立
    vec.append(min(me.it_venture_coins / 10.0, 1.0))

    # ターン数
    vec.append(min(env.turn_count / 200.0, 1.0))

    return np.array(vec, dtype=np.float32)


def action_mask(env: MachikoroEnv) -> np.ndarray:
    """
    有効な行動を 1、無効を 0 にした shape (NUM_ACTIONS,) の配列。
    BUSINESS は give/take の組み合わせ action、MOVER は休業中カードも含む。
    """
    mask = np.zeros(NUM_ACTIONS, dtype=np.float32)
    for a in env.valid_actions():
        mask[a] = 1.0
    return mask
