# heuristic.py - ヒューリスティックエージェント（weak / normal / strong / expert）
# RL 評価用固定方策。JS 側 CPU.js とは独立した Python 実装。

import random
from .game_env import (
    PHASE_ROLL, PHASE_SELECT_DICE, PHASE_REROLL, PHASE_HARBOR,
    PHASE_PENDING, PHASE_BUILD,
    ACT_ROLL1, ACT_ROLL2, ACT_KEEP, ACT_REROLL,
    ACT_HARBOR_YES, ACT_HARBOR_NO,
    ACT_IT_SAVE, ACT_IT_SKIP,
    ACT_BUY_CARD_BASE, ACT_BUY_LM_BASE, ACT_PASS,
)
from .cards import (
    CARD_NAMES, CARD_DEF, LANDMARK_ORDER, LANDMARK_COSTS,
)


# ダイス2個（2〜12）の出目確率（36通り均等）
_DICE2_PROB = {n: 0.0 for n in range(2, 15)}
for d1 in range(1, 7):
    for d2 in range(1, 7):
        _DICE2_PROB[d1 + d2] += 1 / 36


def _activation_prob(dice_nums):
    """2個ダイス時の発動確率"""
    return sum(_DICE2_PROB.get(n, 0.0) for n in dice_nums)


def _card_value(name: str) -> float:
    """カード期待収入スコア = income * 発動確率 / cost"""
    cd = CARD_DEF[name]
    base_income = max(cd.income, 1)  # 特殊効果カードも最低 1 とみなす
    prob = _activation_prob(cd.dice_nums)
    if cd.cost <= 0:
        return base_income * prob + 0.3   # 無料カードは少しボーナス
    return base_income * prob / cd.cost


def heuristic_action(env, level: str = 'normal') -> int:
    """
    level:
        weak   … ランダム
        normal … 安い順にカード購入（greedy）
        strong … 期待収入スコアで最良カードを選択
        expert … strong ＋ランドマーク優先・harbor +2 必ず宣言
    """
    valid = env.valid_actions()
    if not valid:
        return ACT_PASS

    if level == 'weak':
        return random.choice(valid)

    me  = env.players[env.current]
    opp = env.players[1 - env.current]
    phase = env.phase

    # ── ロール系 ──
    if phase in (PHASE_ROLL, PHASE_SELECT_DICE):
        return ACT_ROLL2 if ACT_ROLL2 in valid else ACT_ROLL1

    if phase == PHASE_REROLL:
        # strong/expert: ダイス目が低ければ振り直す
        if level in ('strong', 'expert') and env.last_dice <= 3 and ACT_REROLL in valid:
            return ACT_REROLL
        return ACT_KEEP

    if phase == PHASE_HARBOR:
        # expert は必ず +2
        if level == 'expert' and ACT_HARBOR_YES in valid:
            return ACT_HARBOR_YES
        # strong は有利なとき（青リンゴ園などを持つ）だけ +2
        if level == 'strong' and ACT_HARBOR_YES in valid:
            return ACT_HARBOR_YES
        return ACT_HARBOR_NO if ACT_HARBOR_NO in valid else valid[0]

    # IT ベンチャー
    if ACT_IT_SAVE in valid or ACT_IT_SKIP in valid:
        if level in ('strong', 'expert') and ACT_IT_SAVE in valid:
            return ACT_IT_SAVE
        return ACT_IT_SKIP if ACT_IT_SKIP in valid else valid[0]

    # pending（TV/BC/清掃業/引越し屋/改装屋）は全レベル random
    if phase == PHASE_PENDING:
        return random.choice(valid)

    # ── ビルドフェーズ ──
    if phase == PHASE_BUILD:
        if level == 'normal':
            return _normal_build(valid, me)
        else:
            return _strong_build(valid, me, level)

    return random.choice(valid)


def _normal_build(valid, me) -> int:
    """最安値のカードを購入。ランドマークも安い順に建てる"""
    # ランドマーク（安い順）
    for lm in sorted(LANDMARK_ORDER, key=lambda n: LANDMARK_COSTS[n]):
        if not me.landmarks[lm]:
            i   = LANDMARK_ORDER.index(lm)
            act = ACT_BUY_LM_BASE + i
            if act in valid:
                return act
    # 最安値カード
    best_act, best_cost = None, 999
    for i, name in enumerate(CARD_NAMES):
        act = ACT_BUY_CARD_BASE + i
        if act not in valid:
            continue
        cost = CARD_DEF[name].cost
        if cost < best_cost:
            best_cost, best_act = cost, act
    return best_act if best_act is not None else ACT_PASS


def _strong_build(valid, me, level: str) -> int:
    """期待収入スコアで最良カードを選択。expert はランドマーク優先を強化"""
    lm_remaining = [n for n in LANDMARK_ORDER if not me.landmarks[n]]

    # expert: 次ランドマークを建てられる場合は優先
    if level == 'expert' and lm_remaining:
        next_lm = min(lm_remaining, key=lambda n: LANDMARK_COSTS[n])
        li  = LANDMARK_ORDER.index(next_lm)
        act = ACT_BUY_LM_BASE + li
        if act in valid:
            # 残りランドマーク1枚 or コイン余裕がある
            if len(lm_remaining) == 1 or me.coins >= LANDMARK_COSTS[next_lm] + 3:
                return act

    best_act, best_score = ACT_PASS, -1.0

    # カードスコア
    for i, name in enumerate(CARD_NAMES):
        act = ACT_BUY_CARD_BASE + i
        if act not in valid:
            continue
        score = _card_value(name)
        if score > best_score:
            best_score, best_act = score, act

    # ランドマーク（強固定ボーナス）
    for lm in lm_remaining:
        li  = LANDMARK_ORDER.index(lm)
        act = ACT_BUY_LM_BASE + li
        if act not in valid:
            continue
        lm_score = 4.0   # ランドマークは常に高優先
        if lm_score > best_score:
            best_score, best_act = lm_score, act

    return best_act
