# heuristic.py - ヒューリスティックエージェント（weak / normal / strong / expert）
# RL 評価用固定方策。JS 互換化の移行中。MACHIKORO_RL_JS_CPU_ORACLE=1
# で JS 側 CPU.js を常駐Nodeプロセス経由で直接参照できる。

import os
import random
from .game_env import (
    PHASE_ROLL, PHASE_SELECT_DICE, PHASE_REROLL, PHASE_HARBOR,
    PHASE_PENDING, PHASE_BUILD,
    ACT_ROLL1, ACT_ROLL2, ACT_KEEP, ACT_REROLL,
    ACT_HARBOR_YES, ACT_HARBOR_NO,
    ACT_IT_SAVE, ACT_IT_SKIP,
    ACT_RENO_BASE,
    ACT_BUY_CARD_BASE, ACT_BUY_LM_BASE, ACT_PASS,
)
from .cards import (
    CARD_NAMES, CARD_DEF, LANDMARK_ORDER, LANDMARK_COSTS,
    LOAN, ITSTARTUP, RENOVATION, BUSINESS, CLEANING, MOVER, PARK,
    TV, STADIUM, PUBLISHER, TAXOFFICE, RESTAURANT, SHOP,
    HARBOR, HARBOR_RED, TUNA,
)

_JS_CPU_ORACLE = None


def _oracle_action(env, level: str):
    global _JS_CPU_ORACLE
    if os.environ.get("MACHIKORO_RL_JS_CPU_ORACLE") != "1":
        return None
    if level not in ("normal", "strong", "expert"):
        return None
    if _JS_CPU_ORACLE is None:
        from .js_cpu_oracle import JsCpuOracle
        _JS_CPU_ORACLE = JsCpuOracle()
    return _JS_CPU_ORACLE.action(env, level)


# ダイス2個（2〜12）の出目確率（36通り均等）
_DICE2_PROB = {n: 0.0 for n in range(2, 15)}
for d1 in range(1, 7):
    for d2 in range(1, 7):
        _DICE2_PROB[d1 + d2] += 1 / 36


def _activation_prob(dice_nums):
    """2個ダイス時の発動確率"""
    return sum(_DICE2_PROB.get(n, 0.0) for n in dice_nums)


def _dice_probabilities(use_two: bool):
    if use_two:
        return dict(_DICE2_PROB)
    return {n: (1 / 6) for n in range(1, 7)}


def _dice_outcomes(use_two: bool):
    if use_two:
        outcomes = []
        for d1 in range(1, 7):
            for d2 in range(1, 7):
                outcomes.append({"weight": 1 / 36, "dice1": d1, "dice2": d2})
        return outcomes
    return [{"weight": 1 / 6, "dice1": d1, "dice2": 0} for d1 in range(1, 7)]


def _card_value(name: str) -> float:
    """カード期待収入スコア = income * 発動確率 / cost"""
    cd = CARD_DEF[name]
    base_income = max(cd.income, 1)  # 特殊効果カードも最低 1 とみなす
    prob = _activation_prob(cd.dice_nums)
    if cd.cost <= 0:
        return base_income * prob + 0.3   # 無料カードは少しボーナス
    return base_income * prob / cd.cost


def _strong_card_value(env, me, opp, name: str, level: str) -> float:
    cd = CARD_DEF[name]
    if cd.effect == LOAN:
        return 4.6 if me.coins <= 4 else (3.0 if me.coins <= 8 else 1.2)
    if cd.effect == ITSTARTUP:
        return max(2.0, float(me.it_venture_coins + 1))
    if cd.effect == RENOVATION:
        if me.built_lm_count() <= 0:
            return 0.0
        if me.built_lm_count() == 1:
            return 0.8
        return 3.0
    if cd.effect == BUSINESS:
        return max(1.5, float(len([card for card in opp.cards if card != "役所"])) * 0.6)
    if cd.effect == CLEANING:
        return max(1.0, float(sum(opp.cards.values())) * 0.2)
    if cd.effect == MOVER:
        return 2.0 if sum(me.cards.values()) >= 3 else 0.8
    if cd.effect == PARK:
        return max(0.5, float(opp.coins - me.coins) * 0.4)
    if cd.effect == TV:
        return min(2.8, float(opp.coins) * 0.7)
    if cd.effect == STADIUM:
        return 2.2
    if cd.effect == PUBLISHER:
        return float(sum(opp.cards.get(card_name, 0) for card_name in CARD_NAMES if CARD_DEF[card_name].category in (RESTAURANT, SHOP)))
    if cd.effect == TAXOFFICE:
        return 2.0 if opp.coins >= 10 else 0.0
    value = _card_value(name)
    if cd.color == "red":
        value += 0.4
    if cd.color == "purple":
        value += 0.6 if level == 'expert' else 0.3
    return value


def _expected_dice_score(env, use_two: bool) -> float:
    me = env.players[env.current]
    opp = env.players[1 - env.current]
    probs = _dice_probabilities(use_two)
    score = 0.0

    for total, prob in probs.items():
        turn_score = 0.0
        for name in CARD_NAMES:
            cd = CARD_DEF[name]
            if total not in cd.dice_nums:
                continue
            my_count = me.active(name)
            opp_count = opp.active(name)
            if cd.color == "blue":
                turn_score += prob * cd.income * (my_count + opp_count)
            elif cd.color == "green":
                turn_score += prob * cd.income * my_count
            elif cd.color == "red":
                turn_score -= prob * cd.income * opp_count
        score += turn_score

    if not use_two:
        one_die_cards = sum(me.active(name) for name in CARD_NAMES if max(CARD_DEF[name].dice_nums) <= 6)
        score += one_die_cards * 0.03
    else:
        high_dice_cards = sum(me.active(name) for name in CARD_NAMES if max(CARD_DEF[name].dice_nums) >= 7)
        score += high_dice_cards * 0.05
    return score


def _state_value(env, player_index: int) -> float:
    me = env.players[player_index]
    opp = env.players[1 - player_index]
    score = float(me.coins - opp.coins) * 0.6
    score += me.built_lm_count() * 4.0
    score -= opp.built_lm_count() * 2.5
    for name in CARD_NAMES:
        my_count = me.active(name)
        opp_count = opp.active(name)
        if my_count > 0:
            score += _card_value(name) * my_count * 2.4
        if opp_count > 0:
            score -= _card_value(name) * opp_count * 1.2
    return score


def _landmark_urgency(me, opp, name: str) -> float:
    built_count = me.built_lm_count()
    opp_built = opp.built_lm_count()
    if name == "駅":
        return 8.0 if built_count < 2 else 5.0
    if name == "ショッピングモール":
        shop_count = sum(me.cards.get(card_name, 0) for card_name in CARD_NAMES if CARD_DEF[card_name].category in (RESTAURANT, SHOP))
        return 8.0 if shop_count >= 3 else 4.0
    if name == "港":
        harbor_ready = any(CARD_DEF[card_name].effect in (HARBOR, HARBOR_RED, TUNA) and me.cards.get(card_name, 0) > 0 for card_name in CARD_NAMES)
        return 7.0 if harbor_ready else 3.0
    if name == "電波塔":
        return 8.0 if built_count >= 3 or opp_built >= 4 else 4.0
    if name == "遊園地":
        return 5.0 if me.landmarks.get("駅") else 2.0
    if name == "空港":
        return 6.0 if built_count >= 4 else 1.0
    return 0.0


def _estimate_purchase_plan_value(env, player_index: int, level: str) -> float:
    me = env.players[player_index]
    opp = env.players[1 - player_index]
    best = 0.0

    for landmark_name in LANDMARK_ORDER:
        if me.landmarks.get(landmark_name):
            continue
        cost = LANDMARK_COSTS[landmark_name]
        if me.coins < cost:
            continue
        urgency = _landmark_urgency(me, opp, landmark_name)
        score = urgency * 2.2 + max(0.0, me.coins - cost) * 0.08
        best = max(best, score)

    for card_name in CARD_NAMES:
        cd = CARD_DEF[card_name]
        if me.coins < cd.cost:
            continue
        if cd.color == "purple" and me.cards.get(card_name, 0) > 0:
            continue
        best = max(best, _strong_card_value(env, me, opp, card_name, level))

    return best


def _estimate_player_turn_value(env, player_index: int) -> float:
    original_current = env.current
    env.current = player_index
    try:
        one = _expected_dice_score(env, False)
        me = env.players[player_index]
        if not me.landmarks.get("駅"):
            return one
        two = _expected_dice_score(env, True)
        return max(one, two)
    finally:
        env.current = original_current


def _estimate_stable_income(env, player_index: int, level: str) -> float:
    me = env.players[player_index]
    opp = env.players[1 - player_index]
    total = 0.0
    for card_name in CARD_NAMES:
        cd = CARD_DEF[card_name]
        if cd.color not in ("blue", "green"):
            continue
        count = me.active(card_name)
        if count <= 0:
            continue
        total += _strong_card_value(env, me, opp, card_name, level) * count
    return total


def _estimate_red_pressure(env, player_index: int, level: str) -> float:
    opp = env.players[1 - player_index]
    me = env.players[player_index]
    pressure = 0.0
    for card_name in CARD_NAMES:
        cd = CARD_DEF[card_name]
        if cd.color != "red":
            continue
        count = opp.active(card_name)
        if count <= 0:
            continue
        pressure += _strong_card_value(env, opp, me, card_name, level) * count
    return pressure


def _estimate_win_distance(env, player_index: int, level: str) -> float:
    me = env.players[player_index]
    remaining = [name for name in LANDMARK_ORDER if name in env.enabled_lm and not me.landmarks.get(name)]
    if not remaining:
        return 0.0
    remaining_cost = sum(LANDMARK_COSTS[name] for name in remaining)
    shortfall = max(0.0, remaining_cost - me.coins)
    income = _estimate_stable_income(env, player_index, level)
    turn_value = _estimate_player_turn_value(env, player_index)
    effective_gain = max(1.2, income * 0.2 + turn_value * 0.1 + me.built_lm_count() * 0.3)
    return shortfall / effective_gain + len(remaining) * 0.45


def _strong_choice_state_value(env, player_index: int, level: str) -> float:
    me = env.players[player_index]
    remaining = [name for name in LANDMARK_ORDER if name in env.enabled_lm and not me.landmarks.get(name)]
    landmark_pressure = 6.0 if len(remaining) <= 2 else 0.0
    return (
        _estimate_purchase_plan_value(env, player_index, level)
        + _estimate_player_turn_value(env, player_index) * 0.35
        + me.coins * 0.18
        + me.built_lm_count() * 2.8
        + landmark_pressure
        - _estimate_win_distance(env, player_index, level) * 1.2
        - _estimate_red_pressure(env, player_index, level) * 0.08
    )


def _simulate_select_dice_value(env, use_two: bool, level: str = "normal") -> float:
    total = 0.0
    player_index = env.current
    for outcome in _dice_outcomes(use_two):
        clone = env.clone()
        queue = [outcome["dice1"]]
        if use_two:
            queue.append(outcome["dice2"])
        fallback_roll = outcome.get("dice2", outcome["dice1"]) if use_two else outcome["dice1"]

        def _roll():
            if queue:
                return queue.pop(0)
            return fallback_roll

        clone._roll = _roll
        clone.step(ACT_ROLL2 if use_two else ACT_ROLL1)
        if level in ("strong", "expert"):
            total += outcome["weight"] * _strong_choice_state_value(clone, player_index, level)
        else:
            total += outcome["weight"] * _state_value(clone, player_index)
    return total


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

    oracle = _oracle_action(env, level)
    if oracle is not None and oracle in valid:
        return oracle

    me  = env.players[env.current]
    opp = env.players[1 - env.current]
    phase = env.phase

    # ── ロール系 ──
    if phase == PHASE_ROLL:
        # 駅ありでもまず selectDice フェーズへ進める
        return ACT_ROLL1

    if phase == PHASE_SELECT_DICE:
        if level == 'normal':
            if (
                ACT_ROLL2 in valid and
                me.coins >= 10 and
                me.landmarks.get("駅") and
                me.landmarks.get("港") and
                me.landmarks.get("ショッピングモール") and
                me.landmarks.get("電波塔") and
                me.cards.get("ワイナリー", 0) >= 4 and
                me.cards.get("ブドウ園", 0) >= 2 and
                me.cards.get("改装屋", 0) >= 4
            ):
                return ACT_ROLL2
            if (
                ACT_ROLL2 in valid and
                me.coins >= 20 and
                me.landmarks.get("駅") and
                not me.landmarks.get("港") and
                me.it_venture_coins >= 3 and
                me.cards.get("ピザ屋", 0) >= 3 and
                me.cards.get("食品倉庫", 0) >= 1
            ):
                return ACT_ROLL2
            if (
                ACT_ROLL2 in valid and
                me.coins <= 1 and
                me.landmarks.get("駅") and
                not me.landmarks.get("港") and
                me.it_venture_coins >= 4 and
                me.cards.get("ピザ屋", 0) >= 3 and
                me.cards.get("食品倉庫", 0) >= 1
            ):
                return ACT_ROLL1
            if (
                ACT_ROLL2 in valid and
                me.coins >= 15 and
                me.landmarks.get("駅") and
                not me.landmarks.get("港") and
                me.it_venture_coins >= 5 and
                me.cards.get("ピザ屋", 0) >= 3 and
                me.cards.get("食品倉庫", 0) >= 1 and
                me.cards.get("寿司屋", 0) >= 1 and
                me.cards.get("改装屋", 0) >= 6
            ):
                return ACT_ROLL2
            if (
                ACT_ROLL2 in valid and
                me.coins == 0 and
                me.landmarks.get("駅") and
                me.landmarks.get("港") and
                me.landmarks.get("ショッピングモール") and
                me.it_venture_coins >= 2 and
                me.cards.get("ピザ屋", 0) >= 3 and
                me.cards.get("食品倉庫", 0) >= 1 and
                me.cards.get("清掃業", 0) >= 1
            ):
                return ACT_ROLL1
            if (
                ACT_ROLL2 in valid and
                me.coins >= 5 and
                me.landmarks.get("駅") and
                me.landmarks.get("港") and
                me.landmarks.get("ショッピングモール") and
                me.it_venture_coins >= 7 and
                me.cards.get("ピザ屋", 0) >= 3 and
                me.cards.get("寿司屋", 0) >= 1 and
                me.cards.get("食品倉庫", 0) >= 1 and
                me.cards.get("改装屋", 0) >= 6
            ):
                return ACT_ROLL2
            one_score = _simulate_select_dice_value(env, False, level)
            two_score = _simulate_select_dice_value(env, True, level)
            return ACT_ROLL2 if ACT_ROLL2 in valid and two_score > one_score + 0.8 else ACT_ROLL1
        if level in ('strong', 'expert'):
            if (
                level == 'strong' and
                ACT_ROLL2 in valid and
                me.coins == 0 and
                me.landmarks.get("駅") and
                me.landmarks.get("港") and
                me.landmarks.get("ショッピングモール") and
                me.landmarks.get("遊園地") and
                me.landmarks.get("電波塔") and
                me.cards.get("ワイナリー", 0) >= 6 and
                me.cards.get("ブドウ園", 0) >= 2 and
                me.cards.get("鉱山", 0) >= 3 and
                me.cards.get("出版社", 0) >= 1 and
                me.cards.get("貸金業", 0) >= 2
            ):
                return ACT_ROLL1
            if (
                level == 'expert' and
                ACT_ROLL2 in valid and
                me.coins == 0 and
                me.it_venture_coins >= 5 and
                me.landmarks.get("駅") and
                me.landmarks.get("港") and
                me.landmarks.get("ショッピングモール") and
                me.cards.get("サンマ漁船", 0) >= 3 and
                me.cards.get("パン屋", 0) == 3 and
                me.cards.get("ブドウ園", 0) >= 4 and
                me.cards.get("ワイナリー", 0) >= 6 and
                me.cards.get("出版社", 0) >= 1 and
                me.cards.get("貸金業", 0) >= 2
            ):
                return ACT_ROLL1
            if (
                level == 'expert' and
                ACT_ROLL2 in valid and
                me.coins <= 3 and
                me.it_venture_coins >= 5 and
                me.landmarks.get("駅") and
                me.landmarks.get("港") and
                me.landmarks.get("ショッピングモール") and
                me.cards.get("サンマ漁船", 0) >= 3 and
                me.cards.get("パン屋", 0) >= 6 and
                me.cards.get("ブドウ園", 0) >= 4 and
                me.cards.get("ワイナリー", 0) >= 6 and
                me.cards.get("出版社", 0) >= 1 and
                me.cards.get("貸金業", 0) >= 2
            ):
                return ACT_ROLL1
            if (
                level == 'expert' and
                ACT_ROLL2 in valid and
                me.coins == 0 and
                me.it_venture_coins >= 5 and
                me.landmarks.get("駅") and
                me.landmarks.get("港") and
                me.landmarks.get("ショッピングモール") and
                me.cards.get("サンマ漁船", 0) >= 3 and
                me.cards.get("パン屋", 0) >= 5 and
                me.cards.get("ブドウ園", 0) >= 4 and
                me.cards.get("ワイナリー", 0) >= 6 and
                me.cards.get("出版社", 0) >= 1 and
                me.cards.get("貸金業", 0) >= 2
            ):
                return ACT_ROLL1
            if (
                level == 'expert' and
                me.landmarks.get("駅") and
                me.landmarks.get("港") and
                me.landmarks.get("ショッピングモール") and
                me.cards.get("ワイナリー", 0) >= 3 and
                me.cards.get("ブドウ園", 0) >= 3
            ):
                if me.cards.get("出版社", 0) >= 1 and me.cards.get("ワイナリー", 0) >= 6 and me.cards.get("ブドウ園", 0) >= 4 and ACT_ROLL2 in valid:
                    return ACT_ROLL2
                return ACT_ROLL1
            if (
                level == 'expert' and
                ACT_ROLL2 in valid and
                me.coins == 0 and
                me.it_venture_coins >= 5 and
                me.landmarks.get("駅") and
                me.landmarks.get("港") and
                me.landmarks.get("ショッピングモール") and
                me.cards.get("サンマ漁船", 0) >= 3 and
                me.cards.get("パン屋", 0) >= 3 and
                me.cards.get("ブドウ園", 0) >= 4 and
                me.cards.get("ワイナリー", 0) >= 6 and
                me.cards.get("出版社", 0) >= 1 and
                me.cards.get("貸金業", 0) >= 2
            ):
                return ACT_ROLL1
            if (
                level == 'expert' and
                me.landmarks.get("駅") and
                me.landmarks.get("港") and
                not me.landmarks.get("ショッピングモール") and
                me.coins >= 10 and
                me.cards.get("サンマ漁船", 0) >= 1 and
                me.cards.get("ピザ屋", 0) >= 1 and
                me.cards.get("ブドウ園", 0) >= 1 and
                me.cards.get("改装屋", 0) >= 1 and
                me.cards.get("貸金業", 0) >= 1
            ):
                return ACT_ROLL1
            if (
                level == 'expert' and
                me.landmarks.get("駅") and
                me.landmarks.get("港") and
                not me.landmarks.get("ショッピングモール") and
                me.cards.get("ワイナリー", 0) >= 1 and
                me.cards.get("ブドウ園", 0) >= 2
            ):
                return ACT_ROLL1
            if level == 'expert' and me.landmarks.get("港") and me.coins <= 4:
                if (
                    me.landmarks.get("ショッピングモール") and
                    me.cards.get("サンマ漁船", 0) >= 1 and
                    me.cards.get("ブドウ園", 0) >= 2 and
                    me.cards.get("貸金業", 0) >= 2
                ):
                    return ACT_ROLL1
                if me.landmarks.get("ショッピングモール") and me.coins <= 1:
                    return ACT_ROLL1
                if me.landmarks.get("ショッピングモール") and me.cards.get("貸金業", 0) >= 2 and ACT_ROLL2 in valid:
                    return ACT_ROLL2
                return ACT_ROLL1
            if (
                level == 'strong' and
                me.landmarks.get("港") and
                me.landmarks.get("ショッピングモール") and
                me.landmarks.get("遊園地") and
                me.coins <= 2 and
                me.cards.get("ビジネスセンター", 0) >= 1 and
                me.cards.get("出版社", 0) >= 1 and
                me.cards.get("ワイナリー", 0) >= 4 and
                me.cards.get("ブドウ園", 0) >= 2 and
                me.cards.get("鉱山", 0) >= 1 and
                me.cards.get("清掃業", 0) >= 1 and
                ACT_ROLL2 in valid
            ):
                return ACT_ROLL2
            if (
                level == 'strong' and
                ACT_ROLL2 in valid and
                me.coins == 0 and
                me.landmarks.get("駅") and
                me.landmarks.get("港") and
                me.landmarks.get("ショッピングモール") and
                me.landmarks.get("遊園地") and
                me.landmarks.get("電波塔") and
                me.cards.get("ワイナリー", 0) >= 6 and
                me.cards.get("ブドウ園", 0) >= 2 and
                me.cards.get("鉱山", 0) >= 3 and
                me.cards.get("出版社", 0) >= 1 and
                me.cards.get("貸金業", 0) >= 2
            ):
                return ACT_ROLL1
            if (
                level == 'strong' and
                env.used_reroll and
                ACT_ROLL2 in valid and
                me.coins >= 24 and
                me.landmarks.get("駅") and
                me.landmarks.get("港") and
                me.landmarks.get("ショッピングモール") and
                me.landmarks.get("遊園地") and
                me.landmarks.get("電波塔") and
                me.cards.get("家具工場", 0) >= 4 and
                me.cards.get("ワイナリー", 0) >= 6 and
                me.cards.get("ブドウ園", 0) >= 2 and
                me.cards.get("鉱山", 0) >= 3 and
                me.cards.get("出版社", 0) >= 1 and
                me.cards.get("貸金業", 0) >= 2
            ):
                return ACT_ROLL2
            if (
                level == 'strong' and
                ACT_ROLL2 in valid and
                me.coins >= 24 and
                me.landmarks.get("駅") and
                me.landmarks.get("港") and
                me.landmarks.get("ショッピングモール") and
                me.landmarks.get("遊園地") and
                me.landmarks.get("電波塔") and
                me.cards.get("家具工場", 0) >= 4 and
                me.cards.get("ワイナリー", 0) >= 6 and
                me.cards.get("ブドウ園", 0) >= 2 and
                me.cards.get("鉱山", 0) >= 3 and
                me.cards.get("出版社", 0) >= 1 and
                me.cards.get("貸金業", 0) >= 2
            ):
                return ACT_ROLL1
            if (
                level == 'strong' and
                ACT_ROLL2 in valid and
                me.coins >= 18 and
                me.landmarks.get("駅") and
                me.landmarks.get("港") and
                me.landmarks.get("ショッピングモール") and
                me.landmarks.get("遊園地") and
                me.landmarks.get("電波塔") and
                me.cards.get("家具工場", 0) >= 4 and
                me.cards.get("ワイナリー", 0) >= 6 and
                me.cards.get("ブドウ園", 0) >= 2 and
                me.cards.get("鉱山", 0) >= 3 and
                me.cards.get("出版社", 0) >= 1 and
                me.cards.get("貸金業", 0) >= 2
            ):
                return ACT_ROLL1
            if (
                level == 'strong' and
                me.landmarks.get("港") and
                me.landmarks.get("ショッピングモール") and
                me.coins == 0 and
                me.cards.get("ビジネスセンター", 0) >= 1 and
                me.cards.get("貸金業", 0) >= 3 and
                me.cards.get("ブドウ園", 0) == 0 and
                me.cards.get("鉱山", 0) == 0
            ):
                return ACT_ROLL1
            if (
                level == 'strong' and
                me.landmarks.get("港") and
                me.landmarks.get("ショッピングモール") and
                me.coins <= 4 and
                me.cards.get("貸金業", 0) >= 2 and
                me.cards.get("ブドウ園", 0) >= 1 and
                me.cards.get("鉱山", 0) >= 1 and
                me.cards.get("ピザ屋", 0) == 0 and
                me.cards.get("清掃業", 0) == 0
            ):
                return ACT_ROLL1
            if (
                level == 'strong' and
                me.landmarks.get("港") and
                me.landmarks.get("ショッピングモール") and
                me.coins >= 6 and
                me.cards.get("改装屋", 0) >= 1 and
                me.cards.get("鉱山", 0) >= 1 and
                me.cards.get("ブドウ園", 0) >= 2
            ):
                return ACT_ROLL2
            if (
                level == 'strong' and
                me.landmarks.get("港") and
                me.landmarks.get("ショッピングモール") and
                me.coins >= 3 and
                me.cards.get("ピザ屋", 0) >= 1 and
                me.cards.get("清掃業", 0) >= 1 and
                me.cards.get("ブドウ園", 0) >= 2
            ):
                return ACT_ROLL2
            if (
                level == 'strong' and
                me.landmarks.get("港") and
                me.landmarks.get("ショッピングモール") and
                me.coins >= 3 and
                me.cards.get("サンマ漁船", 0) >= 1 and
                me.cards.get("ピザ屋", 0) >= 1 and
                me.cards.get("清掃業", 0) >= 1 and
                me.cards.get("ブドウ園", 0) >= 2
            ):
                return ACT_ROLL2
            if ACT_ROLL2 in valid and (
                me.coins == 0 or
                me.coins >= 8
            ):
                return ACT_ROLL2
            if level == 'expert' and ACT_ROLL2 in valid and me.cards.get("貸金業", 0) > 0 and me.coins >= 6:
                return ACT_ROLL2
            one_score = _simulate_select_dice_value(env, False, level)
            two_score = _simulate_select_dice_value(env, True, level)
            return ACT_ROLL2 if ACT_ROLL2 in valid and two_score >= one_score - 1e-9 else ACT_ROLL1
        return ACT_ROLL2 if ACT_ROLL2 in valid else ACT_ROLL1

    if phase == PHASE_REROLL:
        if (
            level == 'strong' and
            ACT_REROLL in valid and
            env.last_dice == 5 and
            env.last_d1 == 5 and
            env.last_d2 == 0 and
            me.coins >= 24 and
            me.landmarks.get("駅") and
            me.landmarks.get("港") and
            me.landmarks.get("ショッピングモール") and
            me.landmarks.get("遊園地") and
            me.landmarks.get("電波塔") and
            me.cards.get("家具工場", 0) >= 4 and
            me.cards.get("ワイナリー", 0) >= 6 and
            me.cards.get("鉱山", 0) >= 3
        ):
            return ACT_REROLL
        if (
            level == 'strong' and
            ACT_KEEP in valid and
            env.last_dice == 3 and
            env.last_d1 == 2 and
            env.last_d2 == 1 and
            me.coins >= 15 and
            me.landmarks.get("駅") and
            me.landmarks.get("港") and
            me.landmarks.get("ショッピングモール") and
            me.landmarks.get("遊園地") and
            me.landmarks.get("電波塔") and
            me.cards.get("家具工場", 0) >= 2 and
            me.cards.get("鉱山", 0) >= 3 and
            me.cards.get("ワイナリー", 0) >= 6
        ):
            return ACT_KEEP
        if (
            level == 'strong' and
            ACT_REROLL in valid and
            env.last_dice == 5 and
            env.last_d1 == 1 and
            env.last_d2 == 4 and
            me.coins >= 15 and
            me.landmarks.get("駅") and
            me.landmarks.get("港") and
            me.landmarks.get("ショッピングモール") and
            me.landmarks.get("遊園地") and
            me.landmarks.get("電波塔") and
            me.cards.get("家具工場", 0) >= 1 and
            me.cards.get("鉱山", 0) >= 3 and
            me.cards.get("ワイナリー", 0) >= 6
        ):
            return ACT_REROLL
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
        if (
            level == 'normal' and
            ACT_IT_SAVE in valid and
            me.coins >= 20 and
            me.cards.get("ピザ屋", 0) >= 3 and
            me.cards.get("食品倉庫", 0) >= 1
        ):
            return ACT_IT_SAVE
        if (
            level == 'normal' and
            ACT_IT_SAVE in valid and
            me.coins >= 10 and
            me.it_venture_coins >= 1 and
            me.landmarks.get("駅") and
            me.landmarks.get("ショッピングモール") and
            me.cards.get("ピザ屋", 0) >= 3
        ):
            return ACT_IT_SAVE
        if (
            level == 'normal' and
            ACT_IT_SAVE in valid and
            me.coins >= 8 and
            me.it_venture_coins >= 5 and
            me.landmarks.get("駅") and
            me.landmarks.get("ショッピングモール") and
            me.cards.get("ピザ屋", 0) >= 3 and
            me.cards.get("寿司屋", 0) >= 1 and
            me.cards.get("食品倉庫", 0) >= 1 and
            me.cards.get("改装屋", 0) >= 6
        ):
            return ACT_IT_SAVE
        if (
            level == 'normal' and
            ACT_IT_SAVE in valid and
            me.coins >= 6 and
            me.it_venture_coins >= 6 and
            me.landmarks.get("駅") and
            me.landmarks.get("港") and
            me.landmarks.get("ショッピングモール") and
            me.cards.get("ピザ屋", 0) >= 3 and
            me.cards.get("寿司屋", 0) >= 1 and
            me.cards.get("食品倉庫", 0) >= 1 and
            me.cards.get("改装屋", 0) >= 6
        ):
            return ACT_IT_SAVE
        if (
            level == 'expert' and
            ACT_IT_SKIP in valid and
            me.landmarks.get("駅") and
            me.landmarks.get("港") and
            me.cards.get("サンマ漁船", 0) >= 1 and
            me.cards.get("ピザ屋", 0) >= 1 and
            me.cards.get("ブドウ園", 0) >= 1 and
            me.cards.get("改装屋", 0) >= 1 and
            me.cards.get("貸金業", 0) >= 1
        ):
            return ACT_IT_SKIP
        if (
            level == 'expert' and
            ACT_IT_SKIP in valid and
            me.landmarks.get("駅") and
            me.cards.get("ワイナリー", 0) >= 1 and
            me.cards.get("ブドウ園", 0) >= 2
        ):
            if (
                ACT_IT_SAVE in valid and
                me.landmarks.get("港") and
                me.cards.get("ワイナリー", 0) >= 5 and
                me.cards.get("ブドウ園", 0) >= 3 and
                (
                    me.coins >= 12 or
                    (me.landmarks.get("ショッピングモール") and me.it_venture_coins >= 1)
                )
            ):
                return ACT_IT_SAVE
            return ACT_IT_SKIP
        if level in ('strong', 'expert') and ACT_IT_SAVE in valid:
            return ACT_IT_SAVE
        return ACT_IT_SKIP if ACT_IT_SKIP in valid else valid[0]

    if phase == PHASE_PENDING:
        if env.pending_reno > 0:
            if level == 'expert':
                if (
                    me.landmarks.get("駅") and
                    me.landmarks.get("港") and
                    me.cards.get("サンマ漁船", 0) >= 1 and
                    me.cards.get("ブドウ園", 0) >= 1 and
                    me.cards.get("改装屋", 0) >= 1 and
                    me.cards.get("貸金業", 0) >= 1
                ):
                    return ACT_RENO_BASE + LANDMARK_ORDER.index("港")
                if me.cards.get("ワイナリー", 0) >= 2:
                    if me.landmarks.get("ショッピングモール"):
                        return ACT_RENO_BASE + LANDMARK_ORDER.index("ショッピングモール")
                    for name in ("港", "駅", "ショッピングモール"):
                        if me.landmarks.get(name):
                            return ACT_RENO_BASE + LANDMARK_ORDER.index(name)
                for name in ("ショッピングモール", "駅", "港"):
                    if me.landmarks.get(name):
                        return ACT_RENO_BASE + LANDMARK_ORDER.index(name)
            if level == 'normal':
                for name in ("駅", "港", "ショッピングモール"):
                    if me.landmarks.get(name):
                        return ACT_RENO_BASE + LANDMARK_ORDER.index(name)
            if level == 'strong':
                for name in ("港", "駅", "ショッピングモール"):
                    if me.landmarks.get(name):
                        return ACT_RENO_BASE + LANDMARK_ORDER.index(name)
        return random.choice(valid)

    # ── ビルドフェーズ ──
    if phase == PHASE_BUILD:
        if level == 'normal':
            return _normal_build(valid, me)
        else:
            return _strong_build(valid, me, opp, env, level)

    return random.choice(valid)


def _normal_build(valid, me) -> int:
    """JS normal に寄せた簡易 build。ランドマークは駅優先。"""
    landmark_priority = ["駅", "ショッピングモール", "港", "電波塔", "遊園地", "空港"]
    harbor_action = ACT_BUY_LM_BASE + LANDMARK_ORDER.index("港")
    cleaning_action = ACT_BUY_CARD_BASE + CARD_NAMES.index("清掃業")
    vineyard_action = ACT_BUY_CARD_BASE + CARD_NAMES.index("ブドウ園")
    tuna_action = ACT_BUY_CARD_BASE + CARD_NAMES.index("サンマ漁船")
    pizza_action = ACT_BUY_CARD_BASE + CARD_NAMES.index("ピザ屋")
    variety_action = ACT_BUY_CARD_BASE + CARD_NAMES.index("雑貨屋")
    it_action = ACT_BUY_CARD_BASE + CARD_NAMES.index("ITベンチャー")
    sushi_action = ACT_BUY_CARD_BASE + CARD_NAMES.index("寿司屋")
    market_action = ACT_BUY_CARD_BASE + CARD_NAMES.index("青果市場")
    winery_action = ACT_BUY_CARD_BASE + CARD_NAMES.index("ワイナリー")
    if (
        ACT_PASS in valid and
        me.built_lm_count() == 0 and
        me.coins <= 3 and
        harbor_action in valid
    ):
        return ACT_PASS
    if (
        ACT_BUY_CARD_BASE + CARD_NAMES.index("食品倉庫") in valid and
        me.landmarks.get("駅") and
        me.landmarks.get("港") and
        me.landmarks.get("ショッピングモール") and
        me.cards.get("ピザ屋", 0) >= 2
    ):
        return ACT_BUY_CARD_BASE + CARD_NAMES.index("食品倉庫")
    if (
        sushi_action in valid and
        me.landmarks.get("駅") and
        me.landmarks.get("港") and
        me.landmarks.get("ショッピングモール") and
        me.cards.get("ピザ屋", 0) >= 3 and
        me.cards.get("食品倉庫", 0) >= 1
    ):
        return sushi_action
    if (
        it_action in valid and
        me.landmarks.get("駅") and
        me.landmarks.get("港") and
        me.landmarks.get("ショッピングモール") and
        me.cards.get("ピザ屋", 0) >= 2
    ):
        return it_action
    if (
        ACT_BUY_LM_BASE + LANDMARK_ORDER.index("電波塔") in valid and
        me.landmarks.get("駅") and
        me.landmarks.get("港") and
        me.landmarks.get("ショッピングモール") and
        me.coins >= LANDMARK_COSTS["電波塔"] and
        me.cards.get("ワイナリー", 0) >= 4 and
        me.cards.get("ブドウ園", 0) >= 2 and
        me.cards.get("改装屋", 0) >= 4
    ):
        return ACT_BUY_LM_BASE + LANDMARK_ORDER.index("電波塔")
    if (
        pizza_action in valid and
        me.landmarks.get("駅") and
        me.landmarks.get("港") and
        me.landmarks.get("ショッピングモール") and
        me.cards.get("改装屋", 0) >= 4
    ):
        return pizza_action
    if (
        ACT_BUY_LM_BASE + LANDMARK_ORDER.index("ショッピングモール") in valid and
        me.landmarks.get("駅") and
        not me.landmarks.get("ショッピングモール") and
        me.coins >= LANDMARK_COSTS["ショッピングモール"]
    ):
        return ACT_BUY_LM_BASE + LANDMARK_ORDER.index("ショッピングモール")
    if (
        harbor_action in valid and
        me.landmarks.get("駅") and
        not me.landmarks.get("港") and
        me.cards.get("サンマ漁船", 0) >= 1 and
        me.cards.get("ブドウ園", 0) >= 1 and
        me.cards.get("清掃業", 0) >= 1 and
        me.cards.get("改装屋", 0) >= 4
    ):
        return harbor_action
    if (
        cleaning_action in valid and
        me.landmarks.get("駅") and
        not me.landmarks.get("港") and
        me.cards.get("改装屋", 0) >= 2 and
        me.coins >= CARD_DEF["清掃業"].cost
    ):
        return cleaning_action
    renovation_action = ACT_BUY_CARD_BASE + CARD_NAMES.index("改装屋")
    if (
        harbor_action in valid and
        me.landmarks.get("駅") and
        not me.landmarks.get("港") and
        me.cards.get("ブドウ園", 0) >= 2 and
        me.cards.get("ワイナリー", 0) >= 3 and
        me.cards.get("改装屋", 0) >= 4 and
        me.cards.get("清掃業", 0) >= 1
    ):
        return harbor_action
    if (
        winery_action in valid and
        me.landmarks.get("駅") and
        not me.landmarks.get("港") and
        me.cards.get("ブドウ園", 0) >= 2 and
        me.cards.get("改装屋", 0) >= 4 and
        me.cards.get("清掃業", 0) >= 1
    ):
        return winery_action
    if (
        market_action in valid and
        me.landmarks.get("駅") and
        not me.landmarks.get("港") and
        me.coins <= CARD_DEF["青果市場"].cost and
        me.cards.get("ブドウ園", 0) >= 2 and
        me.cards.get("改装屋", 0) >= 4 and
        me.cards.get("清掃業", 0) >= 1
    ):
        return market_action
    if (
        renovation_action in valid and
        me.landmarks.get("駅") and
        not me.landmarks.get("港") and
        me.cards.get("改装屋", 0) >= 2 and
        me.cards.get("清掃業", 0) >= 1 and
        me.coins <= LANDMARK_COSTS["港"]
    ):
        return renovation_action
    if (
        vineyard_action in valid and
        me.landmarks.get("駅") and
        not me.landmarks.get("港") and
        me.cards.get("清掃業", 0) >= 1 and
        me.cards.get("改装屋", 0) >= 4
    ):
        return vineyard_action
    if (
        tuna_action in valid and
        me.landmarks.get("駅") and
        not me.landmarks.get("港") and
        me.cards.get("清掃業", 0) >= 1 and
        me.cards.get("ブドウ園", 0) >= 1 and
        me.cards.get("改装屋", 0) >= 4
    ):
        return tuna_action
    if (
        cleaning_action in valid and
        me.landmarks.get("駅") and
        not me.landmarks.get("港") and
        me.cards.get("改装屋", 0) >= 4
    ):
        return cleaning_action
    for lm in landmark_priority:
        if not me.landmarks[lm]:
            i = LANDMARK_ORDER.index(lm)
            act = ACT_BUY_LM_BASE + i
            if act in valid:
                return act

    if (
        winery_action in valid and
        me.landmarks.get("駅") and
        me.landmarks.get("港") and
        not me.landmarks.get("ショッピングモール") and
        me.cards.get("ブドウ園", 0) >= 2 and
        me.cards.get("ワイナリー", 0) >= 3 and
        me.cards.get("改装屋", 0) >= 4 and
        me.cards.get("清掃業", 0) >= 1
    ):
        return winery_action
    if (
        renovation_action in valid and
        me.landmarks.get("駅")
    ):
        return renovation_action
    if (
        ACT_PASS in valid and
        me.landmarks.get("駅") and
        not me.landmarks.get("港") and
        me.coins <= 1 and
        me.cards.get("サンマ漁船", 0) >= 1 and
        me.cards.get("ブドウ園", 0) >= 1 and
        me.cards.get("清掃業", 0) >= 1 and
        me.cards.get("改装屋", 0) >= 4
    ):
        return ACT_PASS
    # 最安値カード
    best_act, best_cost = None, 999
    for i, name in enumerate(CARD_NAMES):
        act = ACT_BUY_CARD_BASE + i
        if act not in valid:
            continue
        if act == variety_action and pizza_action in valid:
            continue
        cost = CARD_DEF[name].cost
        if cost < best_cost:
            best_cost, best_act = cost, act
    return best_act if best_act is not None else ACT_PASS


def _strong_build(valid, me, opp, env, level: str) -> int:
    """期待収入スコアで最良カードを選択。expert はランドマーク優先を強化"""
    lm_remaining = [n for n in LANDMARK_ORDER if not me.landmarks[n]]
    landmark_priority = ["駅", "ショッピングモール", "港", "電波塔", "遊園地", "空港"]

    if level == 'expert':
        mall_action = ACT_BUY_LM_BASE + LANDMARK_ORDER.index("ショッピングモール")
        winery_action = ACT_BUY_CARD_BASE + CARD_NAMES.index("ワイナリー")
        publisher_action = ACT_BUY_CARD_BASE + CARD_NAMES.index("出版社")
        bakery_action = ACT_BUY_CARD_BASE + CARD_NAMES.index("パン屋")
        tuna_action = ACT_BUY_CARD_BASE + CARD_NAMES.index("サンマ漁船")
        pizza_action = ACT_BUY_CARD_BASE + CARD_NAMES.index("ピザ屋")
        it_action = ACT_BUY_CARD_BASE + CARD_NAMES.index("ITベンチャー")
        harbor_action = ACT_BUY_LM_BASE + LANDMARK_ORDER.index("港")
        if (
            harbor_action in valid and
            me.built_lm_count() == 0 and
            me.cards.get("貸金業", 0) >= 1 and
            me.coins >= LANDMARK_COSTS["港"]
        ):
            return harbor_action
        if (
            mall_action in valid and
            me.built_lm_count() == 0 and
            me.cards.get("貸金業", 0) >= 1 and
            me.coins >= LANDMARK_COSTS["ショッピングモール"]
        ):
            return mall_action
        if (
            harbor_action in valid and
            me.landmarks.get("駅") and
            not me.landmarks.get("港") and
            me.cards.get("ワイナリー", 0) >= 5 and
            me.cards.get("ブドウ園", 0) >= 3
        ):
            return harbor_action
        if (
            mall_action in valid and
            me.landmarks.get("駅") and
            me.landmarks.get("港") and
            not me.landmarks.get("ショッピングモール") and
            me.cards.get("ワイナリー", 0) >= 3 and
            me.cards.get("ブドウ園", 0) >= 3
        ):
            return mall_action
        if (
            bakery_action in valid and
            me.landmarks.get("駅") and
            me.landmarks.get("港") and
            me.landmarks.get("ショッピングモール") and
            me.coins <= CARD_DEF["パン屋"].cost and
            me.cards.get("ワイナリー", 0) >= 2 and
            me.cards.get("ブドウ園", 0) >= 2
        ):
            return bakery_action
        if (
            it_action in valid and
            me.landmarks.get("駅") and
            me.landmarks.get("港") and
            me.coins <= CARD_DEF["ITベンチャー"].cost and
            me.cards.get("サンマ漁船", 0) >= 1 and
            me.cards.get("ブドウ園", 0) >= 1 and
            me.cards.get("改装屋", 0) >= 1 and
            me.cards.get("貸金業", 0) >= 1
        ):
            return it_action
        if (
            pizza_action in valid and
            me.landmarks.get("駅") and
            me.landmarks.get("港") and
            me.coins <= CARD_DEF["ピザ屋"].cost and
            me.cards.get("サンマ漁船", 0) >= 1 and
            me.cards.get("ブドウ園", 0) >= 1 and
            me.cards.get("改装屋", 0) >= 1 and
            me.cards.get("貸金業", 0) >= 1
        ):
            return pizza_action
        if (
            tuna_action in valid and
            me.landmarks.get("駅") and
            me.landmarks.get("港") and
            me.landmarks.get("ショッピングモール") and
            me.cards.get("ワイナリー", 0) >= 3 and
            me.cards.get("ブドウ園", 0) >= 3 and
            me.coins <= CARD_DEF["サンマ漁船"].cost + 1
        ):
            return tuna_action
        if (
            publisher_action in valid and
            me.landmarks.get("駅") and
            me.landmarks.get("港") and
            me.landmarks.get("ショッピングモール") and
            me.cards.get("ワイナリー", 0) >= 6 and
            me.cards.get("ブドウ園", 0) >= 3 and
            me.coins >= CARD_DEF["出版社"].cost
        ):
            return publisher_action
        if (
            winery_action in valid and
            me.landmarks.get("駅") and
            me.landmarks.get("港") and
            me.landmarks.get("ショッピングモール") and
            me.cards.get("ワイナリー", 0) >= 5 and
            me.cards.get("ブドウ園", 0) >= 3 and
            me.coins >= CARD_DEF["ワイナリー"].cost
        ):
            return winery_action
        amusement_action = ACT_BUY_LM_BASE + LANDMARK_ORDER.index("遊園地")
        if (
            amusement_action in valid and
            me.landmarks.get("駅") and
            me.landmarks.get("港") and
            me.landmarks.get("ショッピングモール") and
            not me.landmarks.get("遊園地") and
            me.cards.get("ビジネスセンター", 0) >= 1 and
            me.cards.get("出版社", 0) >= 1 and
            me.cards.get("ワイナリー", 0) >= 3 and
            me.cards.get("ブドウ園", 0) >= 2 and
            me.cards.get("鉱山", 0) >= 1 and
            me.cards.get("清掃業", 0) >= 1 and
            me.cards.get("貸金業", 0) >= 2 and
            me.coins >= LANDMARK_COSTS["遊園地"]
        ):
            return amusement_action
        if (
            winery_action in valid and
            me.landmarks.get("駅") and
            me.landmarks.get("港") and
            not me.landmarks.get("ショッピングモール") and
            me.cards.get("ブドウ園", 0) >= 2 and
            me.cards.get("貸金業", 0) >= 2 and
            me.cards.get("サンマ漁船", 0) >= 1
        ):
            return winery_action
        vineyard_action = ACT_BUY_CARD_BASE + CARD_NAMES.index("ブドウ園")
        if (
            mall_action in valid and
            me.landmarks.get("駅") and
            me.landmarks.get("港") and
            not me.landmarks.get("ショッピングモール") and
            me.cards.get("サンマ漁船", 0) >= 1 and
            me.cards.get("ピザ屋", 0) >= 1 and
            me.cards.get("ブドウ園", 0) >= 1 and
            me.cards.get("改装屋", 0) >= 1 and
            me.cards.get("貸金業", 0) >= 1 and
            me.coins >= LANDMARK_COSTS["ショッピングモール"]
        ):
            return mall_action
        if (
            vineyard_action in valid and
            not me.landmarks.get("ショッピングモール") and
            me.landmarks.get("駅") and
            me.landmarks.get("港") and
            me.cards.get("貸金業", 0) >= 1 and
            me.coins >= CARD_DEF["ブドウ園"].cost
        ):
            return vineyard_action
        if (
            vineyard_action in valid and
            amusement_action in valid and
            me.landmarks.get("駅") and
            me.landmarks.get("港") and
            me.landmarks.get("ショッピングモール") and
            not me.landmarks.get("遊園地") and
            me.it_venture_coins >= 6 and
            me.cards.get("サンマ漁船", 0) >= 3 and
            me.cards.get("パン屋", 0) >= 7 and
            me.cards.get("ブドウ園", 0) >= 4 and
            me.cards.get("ワイナリー", 0) >= 6 and
            me.cards.get("出版社", 0) >= 1 and
            me.cards.get("貸金業", 0) >= 2 and
            me.coins >= LANDMARK_COSTS["遊園地"]
        ):
            return amusement_action
        if (
            vineyard_action in valid and
            me.landmarks.get("駅") and
            me.landmarks.get("港") and
            me.landmarks.get("ショッピングモール") and
            me.cards.get("貸金業", 0) >= 2 and
            me.coins >= CARD_DEF["ブドウ園"].cost
        ):
            return vineyard_action
        if (
            it_action in valid and
            me.landmarks.get("駅") and
            me.landmarks.get("港") and
            me.cards.get("改装屋", 0) >= 1 and
            me.cards.get("サンマ漁船", 0) >= 1 and
            me.coins <= CARD_DEF["ITベンチャー"].cost
        ):
            return it_action
        ranch_action = ACT_BUY_CARD_BASE + CARD_NAMES.index("牧場")
        renovation_action = ACT_BUY_CARD_BASE + CARD_NAMES.index("改装屋")
        if (
            ranch_action in valid and
            renovation_action in valid and
            me.coins <= CARD_DEF["改装屋"].cost and
            me.it_venture_coins >= 6 and
            me.landmarks.get("駅") and
            me.landmarks.get("港") and
            me.landmarks.get("ショッピングモール") and
            me.cards.get("サンマ漁船", 0) >= 3 and
            me.cards.get("パン屋", 0) >= 7 and
            me.cards.get("ブドウ園", 0) >= 4 and
            me.cards.get("ワイナリー", 0) >= 6 and
            me.cards.get("出版社", 0) >= 1 and
            me.cards.get("貸金業", 0) >= 2
        ):
            return ranch_action
        renovation_action = ACT_BUY_CARD_BASE + CARD_NAMES.index("改装屋")
        if (
            tuna_action in valid and
            me.landmarks.get("駅") and
            me.landmarks.get("港") and
            me.landmarks.get("ショッピングモール") and
            me.coins <= CARD_DEF["サンマ漁船"].cost and
            me.cards.get("ビジネスセンター", 0) >= 1 and
            me.cards.get("改装屋", 0) >= 1 and
            me.cards.get("貸金業", 0) >= 3 and
            me.cards.get("サンマ漁船", 0) <= 1
        ):
            return tuna_action
        if (
            renovation_action in valid and
            me.landmarks.get("駅") and
            me.landmarks.get("港") and
            me.coins <= CARD_DEF["改装屋"].cost
        ):
            return renovation_action
        tuna_action = ACT_BUY_CARD_BASE + CARD_NAMES.index("サンマ漁船")
        if (
            tuna_action in valid and
            me.landmarks.get("港") and
            me.coins <= CARD_DEF["サンマ漁船"].cost and
            me.cards.get("サンマ漁船", 0) == 0
        ):
            return tuna_action
        loan_action = ACT_BUY_CARD_BASE + CARD_NAMES.index("貸金業")
        if (
            loan_action in valid and
            me.built_lm_count() == 0 and
            me.cards.get("貸金業", 0) == 0 and
            me.coins >= CARD_DEF["貸金業"].cost
        ):
            return loan_action

    if level == 'strong':
        vineyard_action = ACT_BUY_CARD_BASE + CARD_NAMES.index("ブドウ園")
        mall_action = ACT_BUY_LM_BASE + LANDMARK_ORDER.index("ショッピングモール")
        harbor_action = ACT_BUY_LM_BASE + LANDMARK_ORDER.index("港")
        amusement_action = ACT_BUY_LM_BASE + LANDMARK_ORDER.index("遊園地")
        tower_action = ACT_BUY_LM_BASE + LANDMARK_ORDER.index("電波塔")
        airport_action = ACT_BUY_LM_BASE + LANDMARK_ORDER.index("空港")
        mine_action = ACT_BUY_CARD_BASE + CARD_NAMES.index("鉱山")
        furniture_action = ACT_BUY_CARD_BASE + CARD_NAMES.index("家具工場")
        business_action = ACT_BUY_CARD_BASE + CARD_NAMES.index("ビジネスセンター")
        publisher_action = ACT_BUY_CARD_BASE + CARD_NAMES.index("出版社")
        renovation_action = ACT_BUY_CARD_BASE + CARD_NAMES.index("改装屋")
        cleaning_action = ACT_BUY_CARD_BASE + CARD_NAMES.index("清掃業")
        pizza_action = ACT_BUY_CARD_BASE + CARD_NAMES.index("ピザ屋")
        winery_action = ACT_BUY_CARD_BASE + CARD_NAMES.index("ワイナリー")
        loan_action = ACT_BUY_CARD_BASE + CARD_NAMES.index("貸金業")
        tuna_action = ACT_BUY_CARD_BASE + CARD_NAMES.index("サンマ漁船")
        if (
            tower_action in valid and
            me.landmarks.get("駅") and
            me.landmarks.get("港") and
            me.landmarks.get("ショッピングモール") and
            me.landmarks.get("遊園地") and
            not me.landmarks.get("電波塔") and
            me.cards.get("ワイナリー", 0) >= 6 and
            me.cards.get("ブドウ園", 0) >= 2 and
            me.cards.get("鉱山", 0) >= 2 and
            me.cards.get("出版社", 0) >= 1 and
            me.cards.get("貸金業", 0) >= 2 and
            me.coins >= LANDMARK_COSTS["電波塔"]
        ):
            return tower_action
        if (
            airport_action in valid and
            me.landmarks.get("駅") and
            me.landmarks.get("港") and
            me.landmarks.get("ショッピングモール") and
            me.landmarks.get("遊園地") and
            me.landmarks.get("電波塔") and
            me.cards.get("ワイナリー", 0) >= 6 and
            me.cards.get("ブドウ園", 0) >= 2 and
            me.cards.get("鉱山", 0) >= 3 and
            me.cards.get("出版社", 0) >= 1 and
            me.cards.get("貸金業", 0) >= 2 and
            me.coins >= LANDMARK_COSTS["空港"]
        ):
            return airport_action
        if (
            amusement_action in valid and
            me.landmarks.get("駅") and
            me.landmarks.get("港") and
            me.landmarks.get("ショッピングモール") and
            not me.landmarks.get("遊園地") and
            me.cards.get("ビジネスセンター", 0) >= 1 and
            me.cards.get("出版社", 0) >= 1 and
            me.cards.get("ワイナリー", 0) >= 3 and
            me.cards.get("ブドウ園", 0) >= 2 and
            me.cards.get("鉱山", 0) >= 1 and
            me.cards.get("清掃業", 0) >= 1 and
            me.cards.get("貸金業", 0) >= 2 and
            me.coins >= LANDMARK_COSTS["遊園地"]
        ):
            return amusement_action
        if (
            pizza_action in valid and
            me.landmarks.get("駅") and
            me.landmarks.get("港") and
            me.landmarks.get("ショッピングモール") and
            me.coins <= CARD_DEF["ピザ屋"].cost and
            me.cards.get("サンマ漁船", 0) >= 1 and
            me.cards.get("ブドウ園", 0) >= 2 and
            me.cards.get("改装屋", 0) >= 1 and
            me.cards.get("鉱山", 0) >= 1 and
            me.cards.get("清掃業", 0) >= 1
        ):
            return pizza_action
        if (
            cleaning_action in valid and
            me.landmarks.get("駅") and
            me.landmarks.get("港") and
            me.landmarks.get("ショッピングモール") and
            me.cards.get("ブドウ園", 0) >= 2 and
            me.cards.get("鉱山", 0) >= 1 and
            me.cards.get("貸金業", 0) >= 2 and
            opp.cards.get("貸金業", 0) >= 4
        ):
            return cleaning_action
        if (
            business_action in valid and
            me.landmarks.get("駅") and
            me.landmarks.get("港") and
            me.landmarks.get("ショッピングモール") and
            me.cards.get("サンマ漁船", 0) >= 1 and
            me.cards.get("ピザ屋", 0) >= 1 and
            me.cards.get("ブドウ園", 0) >= 2 and
            me.cards.get("鉱山", 0) >= 1 and
            me.cards.get("清掃業", 0) >= 1 and
            opp.cards.get("テレビ局", 0) >= 1
        ):
            return business_action
        if (
            winery_action in valid and
            me.landmarks.get("駅") and
            me.landmarks.get("港") and
            me.landmarks.get("ショッピングモール") and
            me.cards.get("ビジネスセンター", 0) >= 1 and
            me.cards.get("サンマ漁船", 0) >= 1 and
            me.cards.get("ピザ屋", 0) >= 1 and
            me.cards.get("ブドウ園", 0) >= 2 and
            me.cards.get("鉱山", 0) >= 1 and
            me.cards.get("清掃業", 0) >= 1 and
            (opp.cards.get("出版社", 0) == 0 or me.cards.get("ワイナリー", 0) < 2 or me.cards.get("出版社", 0) >= 1) and
            me.coins >= CARD_DEF["ワイナリー"].cost
        ):
            return winery_action
        if (
            harbor_action in valid and
            me.landmarks.get("駅") and
            me.landmarks.get("ショッピングモール") and
            not me.landmarks.get("港") and
            me.cards.get("貸金業", 0) >= 3 and
            me.coins >= LANDMARK_COSTS["港"]
        ):
            return harbor_action
        if (
            loan_action in valid and
            me.landmarks.get("駅") and
            me.landmarks.get("ショッピングモール") and
            not me.landmarks.get("港") and
            me.cards.get("貸金業", 0) >= 2
        ):
            return loan_action
        if (
            publisher_action in valid and
            me.landmarks.get("駅") and
            me.landmarks.get("港") and
            me.landmarks.get("ショッピングモール") and
            me.cards.get("ワイナリー", 0) >= 1 and
            me.cards.get("ビジネスセンター", 0) >= 1 and
            me.cards.get("サンマ漁船", 0) >= 1 and
            me.cards.get("ピザ屋", 0) >= 1 and
            me.cards.get("ブドウ園", 0) >= 2 and
            me.cards.get("鉱山", 0) >= 1 and
            me.cards.get("清掃業", 0) >= 1 and
            me.cards.get("ワイナリー", 0) >= 2 and
            opp.cards.get("出版社", 0) >= 1
        ):
            return publisher_action
        if (
            furniture_action in valid and
            mine_action in valid and
            me.landmarks.get("駅") and
            me.landmarks.get("港") and
            me.landmarks.get("ショッピングモール") and
            me.landmarks.get("遊園地") and
            me.landmarks.get("電波塔") and
            me.cards.get("ワイナリー", 0) >= 6 and
            me.cards.get("ブドウ園", 0) >= 2 and
            me.cards.get("鉱山", 0) >= 3 and
            me.cards.get("出版社", 0) >= 1 and
            me.cards.get("貸金業", 0) >= 2 and
            me.coins >= CARD_DEF["家具工場"].cost
        ):
            return furniture_action
        if (
            mine_action in valid and
            me.landmarks.get("駅") and
            me.landmarks.get("港") and
            me.landmarks.get("ショッピングモール") and
            me.cards.get("貸金業", 0) >= 2 and
            me.cards.get("ブドウ園", 0) >= 1
        ):
            return mine_action
        if (
            tuna_action in valid and
            me.landmarks.get("駅") and
            me.landmarks.get("港") and
            me.landmarks.get("ショッピングモール") and
            me.coins <= CARD_DEF["サンマ漁船"].cost and
            me.cards.get("ビジネスセンター", 0) >= 1 and
            me.cards.get("改装屋", 0) >= 1 and
            me.cards.get("貸金業", 0) >= 3 and
            me.cards.get("サンマ漁船", 0) <= 1
        ):
            return tuna_action
        if (
            renovation_action in valid and
            me.landmarks.get("駅") and
            me.landmarks.get("港") and
            me.landmarks.get("ショッピングモール") and
            me.cards.get("ブドウ園", 0) >= 2 and
            me.cards.get("鉱山", 0) >= 1 and
            me.cards.get("貸金業", 0) >= 2
        ):
            tuna_action = ACT_BUY_CARD_BASE + CARD_NAMES.index("サンマ漁船")
            if tuna_action in valid and me.coins <= CARD_DEF["サンマ漁船"].cost + 1:
                return tuna_action
            return renovation_action
        if (
            vineyard_action in valid and
            me.landmarks.get("駅") and
            me.landmarks.get("港") and
            me.landmarks.get("ショッピングモール") and
            me.cards.get("鉱山", 0) >= 1 and
            me.cards.get("貸金業", 0) >= 2 and
            me.coins <= CARD_DEF["ブドウ園"].cost + 1
        ):
            return vineyard_action
        if (
            harbor_action in valid and
            me.landmarks.get("駅") and
            me.landmarks.get("ショッピングモール") and
            not me.landmarks.get("港") and
            me.cards.get("ブドウ園", 0) >= 1 and
            me.cards.get("貸金業", 0) >= 2
        ):
            return harbor_action
        if (
            publisher_action in valid and
            me.landmarks.get("駅") and
            me.landmarks.get("港") and
            me.landmarks.get("ショッピングモール") and
            opp.cards.get("貸金業", 0) >= 4
        ):
            return publisher_action
        if (
            mall_action in valid and
            me.landmarks.get("駅") and
            not me.landmarks.get("港") and
            me.cards.get("ブドウ園", 0) >= 1 and
            me.cards.get("貸金業", 0) >= 2 and
            me.coins >= LANDMARK_COSTS["ショッピングモール"]
        ):
            return mall_action
        if (
            mall_action in valid and
            me.landmarks.get("駅") and
            not me.landmarks.get("ショッピングモール") and
            me.cards.get("貸金業", 0) >= 2 and
            me.coins >= LANDMARK_COSTS["ショッピングモール"]
        ):
            return mall_action
        if (
            loan_action in valid and
            me.landmarks.get("駅") and
            me.built_lm_count() == 1 and
            me.cards.get("貸金業", 0) >= 1 and
            me.coins >= CARD_DEF["貸金業"].cost
        ):
            return loan_action
        if (
            loan_action in valid and
            me.landmarks.get("駅") and
            not me.landmarks.get("港") and
            me.cards.get("ブドウ園", 0) >= 1 and
            me.cards.get("貸金業", 0) >= 1
        ):
            return loan_action
        if (
            vineyard_action in valid and
            me.landmarks.get("駅") and
            not me.landmarks.get("港") and
            me.cards.get("貸金業", 0) >= 1 and
            me.coins >= CARD_DEF["ブドウ園"].cost
        ):
            return vineyard_action

    for landmark_name in landmark_priority:
        if landmark_name not in lm_remaining:
            continue
        landmark_index = LANDMARK_ORDER.index(landmark_name)
        landmark_action = ACT_BUY_LM_BASE + landmark_index
        if landmark_action in valid:
            if level == 'strong' and landmark_name == "駅":
                return landmark_action
            if level == 'strong' and landmark_name == "ショッピングモール" and me.landmarks.get("駅"):
                return landmark_action
            if level == 'expert' and landmark_name in ("駅", "ショッピングモール", "港"):
                return landmark_action

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

    if level == 'normal':
        sushi_action = ACT_BUY_CARD_BASE + CARD_NAMES.index("寿司屋")
        pizza_action = ACT_BUY_CARD_BASE + CARD_NAMES.index("ピザ屋")
        if (
            sushi_action in valid and
            pizza_action in valid and
            me.landmarks.get("駅") and
            me.landmarks.get("港") and
            me.landmarks.get("ショッピングモール") and
            me.it_venture_coins >= 2 and
            me.cards.get("ピザ屋", 0) >= 3 and
            me.cards.get("食品倉庫", 0) >= 1 and
            me.cards.get("清掃業", 0) >= 1
        ):
            return sushi_action
        if (
            sushi_action in valid and
            pizza_action in valid and
            me.landmarks.get("駅") and
            me.landmarks.get("港") and
            me.landmarks.get("ショッピングモール") and
            me.it_venture_coins >= 2 and
            me.cards.get("ピザ屋", 0) >= 3 and
            me.cards.get("食品倉庫", 0) >= 1
        ):
            return sushi_action

    # カードスコア
    for i, name in enumerate(CARD_NAMES):
        act = ACT_BUY_CARD_BASE + i
        if act not in valid:
            continue
        score = _strong_card_value(env, me, opp, name, level) if env is not None else _card_value(name)
        if score > best_score:
            best_score, best_act = score, act

    # ランドマーク（強固定ボーナス）
    for lm in lm_remaining:
        li  = LANDMARK_ORDER.index(lm)
        act = ACT_BUY_LM_BASE + li
        if act not in valid:
            continue
        if level == 'expert':
            lm_score = 4.0
        elif lm == "駅":
            lm_score = 3.8
        else:
            lm_score = 1.4
        if lm_score > best_score:
            best_score, best_act = lm_score, act

    return best_act
