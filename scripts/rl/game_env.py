# game_env.py - 2人対戦ゲームエンジン（全カード対応版）

import random
from .cards import (
    CARD_NAMES, CARD_DEF, CARD_INDEX, LANDMARK_ORDER, LANDMARK_COSTS,
    LANDMARK_INDEX, NUM_CARDS, NUM_LANDMARKS,
    FARM, LIVESTOCK, INDUSTRY, RESTAURANT, SHOP, FISHERY, MAJOR,
    LM_STATION, LM_MALL, LM_AMUSEMENT, LM_RADIO, LM_HARBOR, LM_AIRPORT,
    NORMAL, CHEESE, FURNITURE, MARKET, FLOWER, FOODWAREHOUSE, FEWLANDMARK,
    WINERY, MOVER, DRINKFACTORY, LOAN, RENOVATION, HARBOR, HARBOR_RED,
    TUNA, CORNFIELD, FRENCHR, MEMBERBAR, STADIUM, TV, BUSINESS,
    PUBLISHER, TAXOFFICE, CLEANING, ITSTARTUP, PARK,
)

# ---------- フェーズ定数 ----------
PHASE_ROLL        = "roll"
PHASE_SELECT_DICE = "selectDice"
PHASE_REROLL      = "rerollConfirm"
PHASE_HARBOR      = "harborChoice"
PHASE_PENDING     = "pending"
PHASE_BUILD       = "build"

PHASE_ORDER = [PHASE_ROLL, PHASE_SELECT_DICE, PHASE_REROLL,
               PHASE_HARBOR, PHASE_PENDING, PHASE_BUILD]
PHASE_INDEX = {p: i for i, p in enumerate(PHASE_ORDER)}

# ---------- 行動インデックス ----------
# サイコロ選択
ACT_ROLL1       = 0
ACT_ROLL2       = 1
# 振り直し
ACT_KEEP        = 2
ACT_REROLL      = 3
# 港
ACT_HARBOR_YES  = 4
ACT_HARBOR_NO   = 5
# IT ベンチャー
ACT_IT_SAVE     = 6
ACT_IT_SKIP     = 7
# テレビ局（2人戦: 相手1人）
ACT_TV_TARGET   = 8
# ビジネスセンター：自分が渡すカード × 相手から受け取るカード
# 2人戦なので相手プレイヤー選択は不要。
ACT_BC_BASE     = 9
ACT_BC_SIZE     = NUM_CARDS * NUM_CARDS
# 清掃業：休業させるカード
ACT_CLEAN_BASE  = ACT_BC_BASE    + ACT_BC_SIZE
# 引越し屋：相手に渡すカード
# 本番ルールに合わせて休業中カードも候補に含める。
ACT_MOVER_BASE  = ACT_CLEAN_BASE + NUM_CARDS
# 改装屋：解体するランドマーク
ACT_RENO_BASE   = ACT_MOVER_BASE + NUM_CARDS
# 建設：カード
ACT_BUY_CARD_BASE = ACT_RENO_BASE + NUM_LANDMARKS
# 建設：ランドマーク
ACT_BUY_LM_BASE   = ACT_BUY_CARD_BASE + NUM_CARDS
# パス
ACT_PASS          = ACT_BUY_LM_BASE + NUM_LANDMARKS

NUM_ACTIONS = ACT_PASS + 1


# ---------- プレイヤー状態 ----------
class PlayerState:
    def __init__(self):
        self.coins: int = 3
        self.cards: dict = {n: 0 for n in CARD_NAMES}
        self.dormant: dict = {n: 0 for n in CARD_NAMES}
        self.landmarks: dict = {n: False for n in LANDMARK_ORDER}
        self.it_venture_coins: int = 0
        # 初期カード
        self.cards["麦畑"] = 1
        self.cards["パン屋"] = 1

    def active(self, name: str) -> int:
        return max(0, self.cards[name] - self.dormant.get(name, 0))

    def total_active_by_cat(self, *categories) -> int:
        return sum(self.active(n) for n in CARD_NAMES
                   if CARD_DEF[n].category in categories)

    def total_owned_by_cat(self, *categories) -> int:
        return sum(self.cards[n] for n in CARD_NAMES
                   if CARD_DEF[n].category in categories)

    def total_owned_by_color(self, color: str) -> int:
        return sum(self.cards[n] for n in CARD_NAMES
                   if CARD_DEF[n].color == color)

    def built_lm_count(self) -> int:
        return sum(1 for v in self.landmarks.values() if v)

    def has_won(self, enabled_lm: list) -> bool:
        return all(self.landmarks[n] for n in enabled_lm)

    def clone(self) -> "PlayerState":
        p = object.__new__(PlayerState)
        p.coins = self.coins
        p.cards = dict(self.cards)
        p.dormant = dict(self.dormant)
        p.landmarks = dict(self.landmarks)
        p.it_venture_coins = self.it_venture_coins
        return p


# ---------- ゲーム環境 ----------
class MachikoroEnv:
    def __init__(self, enabled_lm: list = None, max_turns: int = 400, player_count: int = 2):
        self.enabled_lm = enabled_lm or LANDMARK_ORDER[:]
        self.max_turns = max_turns
        self.player_count = max(2, min(int(player_count or 2), 10))
        self.reset()

    def reset(self):
        self.players = [PlayerState() for _ in range(self.player_count)]
        self.shop_stock = {
            name: self.player_count if CARD_DEF[name].color == "purple" else 6
            for name in CARD_NAMES
        }
        self.current = 0
        self.phase = PHASE_ROLL
        self.last_dice = 0
        self.last_d1 = 0
        self.last_d2 = 0
        self.had_ap_at_roll = False
        self.used_reroll = False
        self.built_this_turn = False
        self.pending_tv    = 0
        self.pending_biz   = 0
        self.pending_clean = 0
        self.pending_mover = 0
        self.pending_reno  = 0
        self.pending_it    = False
        self.pending_action_queue = []
        self.pending_target_index = None
        self.turn_count    = 0
        self.done   = False
        self.winner = None

    # ---- 有効行動 ----
    def valid_actions(self) -> list:
        p = self.players[self.current]

        if self.phase == PHASE_ROLL:
            if p.landmarks[LM_STATION]:
                return [ACT_ROLL1]
            return [ACT_ROLL1]

        if self.phase == PHASE_SELECT_DICE:
            acts = [ACT_ROLL1]
            if p.landmarks[LM_STATION]:
                acts.append(ACT_ROLL2)
            return acts

        if self.phase == PHASE_REROLL:
            return [ACT_KEEP, ACT_REROLL]

        if self.phase == PHASE_HARBOR:
            return [ACT_HARBOR_YES, ACT_HARBOR_NO]

        if self.phase == PHASE_PENDING:
            opp = self.players[self._pending_target_index()]
            pending_field = self._next_pending_field()
            if pending_field == "pendingTV" and self.pending_tv > 0:
                return [ACT_TV_TARGET]
            if pending_field == "pendingBusiness" and self.pending_biz > 0:
                acts = []
                # JS inference contract: a legal selected target restricts BC take candidates.
                target_cards = {name for name in CARD_NAMES
                                if opp.cards[name] > 0 and CARD_DEF[name].color != "purple"}
                for give_ci, give_name in enumerate(CARD_NAMES):
                    if p.cards[give_name] <= 0 or CARD_DEF[give_name].color == "purple":
                        continue
                    for take_ci, take_name in enumerate(CARD_NAMES):
                        if take_name not in target_cards:
                            continue
                        acts.append(ACT_BC_BASE + give_ci * NUM_CARDS + take_ci)
                return acts if acts else [ACT_PASS]
            if pending_field == "pendingCleaning" and self.pending_clean > 0:
                seen = set()
                acts = []
                for ci, n in enumerate(CARD_NAMES):
                    if ci in seen: continue
                    for pl in self.players:
                        if pl.active(n) > 0 and CARD_DEF[n].color != "purple":
                            acts.append(ACT_CLEAN_BASE + ci)
                            seen.add(ci)
                            break
                return acts if acts else [ACT_PASS]
            if pending_field == "pendingMover" and self.pending_mover > 0:
                acts = [ACT_MOVER_BASE + ci
                        for ci, n in enumerate(CARD_NAMES)
                        if p.cards[n] > 0 and CARD_DEF[n].color != "purple"]
                return acts if acts else [ACT_PASS]
            if pending_field == "pendingRenovation" and self.pending_reno > 0:
                acts = [ACT_RENO_BASE + li
                        for li, n in enumerate(LANDMARK_ORDER)
                        if p.landmarks[n]]
                return acts if acts else [ACT_PASS]
            if self.pending_it:
                if p.coins >= 1:
                    return [ACT_IT_SAVE, ACT_IT_SKIP]
                return [ACT_IT_SKIP]
            return [ACT_PASS]

        if self.phase == PHASE_BUILD:
            acts = [ACT_PASS]
            if not self.built_this_turn:
                for ci, n in enumerate(CARD_NAMES):
                    cd = CARD_DEF[n]
                    if self.shop_stock.get(n, 0) <= 0:
                        continue
                    if p.coins < cd.cost:
                        continue
                    if cd.color == "purple" and p.cards[n] > 0:
                        continue
                    acts.append(ACT_BUY_CARD_BASE + ci)
                for li, n in enumerate(LANDMARK_ORDER):
                    if n not in self.enabled_lm or p.landmarks[n]:
                        continue
                    if p.coins >= LANDMARK_COSTS[n]:
                        acts.append(ACT_BUY_LM_BASE + li)
            return acts

        return [ACT_PASS]

    # ---- step ----
    def step(self, action: int):
        if self.done:
            return True, self.winner

        p   = self.players[self.current]
        oi  = self._pending_target_index()
        opp = self.players[oi]

        # --- サイコロ ---
        if self.phase == PHASE_ROLL:
            if p.landmarks[LM_STATION]:
                self.phase = PHASE_SELECT_DICE
                return self.done, self.winner
            use_two = False
            d1 = self._roll()
            self.last_d1, self.last_d2 = d1, 0
            self.last_dice = d1
            self.had_ap_at_roll = p.landmarks[LM_AMUSEMENT]
            self._after_roll()

        elif self.phase == PHASE_SELECT_DICE:
            use_two = (action == ACT_ROLL2)
            if use_two:
                d1, d2 = self._roll(), self._roll()
                self.last_d1, self.last_d2 = d1, d2
                self.last_dice = d1 + d2
            else:
                d1 = self._roll()
                self.last_d1, self.last_d2 = d1, 0
                self.last_dice = d1
            self.had_ap_at_roll = p.landmarks[LM_AMUSEMENT]
            self._after_roll()

        # --- 振り直し ---
        elif self.phase == PHASE_REROLL:
            if action == ACT_REROLL:
                self.used_reroll = True
                self.last_dice = 0
                self.last_d1 = 0
                self.last_d2 = 0
                if p.landmarks[LM_STATION]:
                    self.phase = PHASE_SELECT_DICE
                else:
                    d1 = self._roll()
                    self.last_d1, self.last_d2 = d1, 0
                    self.last_dice = d1
                    self._apply_harbor_or_income()
            else:
                self._apply_harbor_or_income()

        # --- 港 ---
        elif self.phase == PHASE_HARBOR:
            if action == ACT_HARBOR_YES:
                self.last_dice += 2
            self._process_income()

        # --- Pending: TV ---
        elif self.phase == PHASE_PENDING and self._next_pending_field() == "pendingTV" and self.pending_tv > 0:
            steal = min(5, opp.coins)
            opp.coins -= steal
            p.coins += steal
            self.pending_tv -= 1
            self._consume_pending("pendingTV")
            self._check_pending()

        # --- Pending: ビジネスセンター ---
        elif self.phase == PHASE_PENDING and self._next_pending_field() == "pendingBusiness" and self.pending_biz > 0:
            combo = action - ACT_BC_BASE
            if 0 <= combo < ACT_BC_SIZE:
                give_ci = combo // NUM_CARDS
                take_ci = combo % NUM_CARDS
                give_name = CARD_NAMES[give_ci]
                take_name = CARD_NAMES[take_ci]
                target_index = self._business_target_index_for_take(take_name, oi)
                target = self.players[target_index] if target_index is not None else opp
                if (p.cards[give_name] > 0 and target.cards[take_name] > 0 and
                        CARD_DEF[give_name].color != "purple" and
                        CARD_DEF[take_name].color != "purple"):
                    give_dormant = self._remove_one_card(p, give_name, prefer_dormant=True)
                    take_dormant = self._remove_one_card(target, take_name, prefer_dormant=False)
                    self._add_one_card(p, take_name, take_dormant)
                    self._add_one_card(target, give_name, give_dormant)
            self.pending_biz -= 1
            self._consume_pending("pendingBusiness")
            self._check_pending()

        # --- Pending: 清掃業 ---
        elif self.phase == PHASE_PENDING and self._next_pending_field() == "pendingCleaning" and self.pending_clean > 0:
            ci = action - ACT_CLEAN_BASE
            if 0 <= ci < NUM_CARDS:
                name = CARD_NAMES[ci]
                collected = 0
                for player_index, pl in enumerate(self.players):
                    n = pl.active(name)
                    if n > 0:
                        pl.dormant[name] = pl.dormant.get(name, 0) + n
                        if player_index != self.current:
                            payment = min(n, pl.coins)
                            pl.coins -= payment
                            collected += payment
                p.coins += collected
            self.pending_clean -= 1
            self._consume_pending("pendingCleaning")
            self._check_pending()

        # --- Pending: 引越し屋 ---
        elif self.phase == PHASE_PENDING and self._next_pending_field() == "pendingMover" and self.pending_mover > 0:
            ci = action - ACT_MOVER_BASE
            if 0 <= ci < NUM_CARDS:
                name = CARD_NAMES[ci]
                if p.cards[name] > 0 and CARD_DEF[name].color != "purple":
                    self._transfer_one_card(p, opp, name)
                    p.coins += 4
            self.pending_mover -= 1
            self._consume_pending("pendingMover")
            self._check_pending()

        # --- Pending: 改装屋 ---
        elif self.phase == PHASE_PENDING and self._next_pending_field() == "pendingRenovation" and self.pending_reno > 0:
            li = action - ACT_RENO_BASE
            if 0 <= li < NUM_LANDMARKS:
                lm = LANDMARK_ORDER[li]
                if p.landmarks[lm]:
                    reward = 8 + (1 if p.landmarks[LM_MALL] else 0)
                    p.landmarks[lm] = False
                    p.coins += reward
            self.pending_reno -= 1
            self._consume_pending("pendingRenovation")
            while self.pending_reno > 0:
                if self._next_pending_field() != "pendingRenovation":
                    break
                if any(p.landmarks[n] for n in LANDMARK_ORDER):
                    break
                self.pending_reno -= 1
                self._consume_pending("pendingRenovation")
            self._check_pending()

        # --- Pending: IT ベンチャー ---
        elif self.phase == PHASE_PENDING and self.pending_it:
            if action == ACT_IT_SAVE and p.coins >= 1:
                p.coins -= 1
                p.it_venture_coins += 1
            self.pending_it = False
            self._do_next_turn()
            return self.done, self.winner

        # --- 建設 ---
        elif self.phase == PHASE_BUILD:
            built_winning_landmark = False
            if action != ACT_PASS:
                if ACT_BUY_CARD_BASE <= action < ACT_BUY_CARD_BASE + NUM_CARDS:
                    ci   = action - ACT_BUY_CARD_BASE
                    name = CARD_NAMES[ci]
                    cd   = CARD_DEF[name]
                    if (self.shop_stock.get(name, 0) > 0 and
                            p.coins >= cd.cost and
                            not (cd.color == "purple" and p.cards[name] > 0)):
                        p.coins -= cd.cost
                        p.cards[name] += 1
                        self.shop_stock[name] -= 1
                        if cd.effect == LOAN:
                            p.coins += 5  # 貸金業建設ボーナス
                        self.built_this_turn = True

                elif ACT_BUY_LM_BASE <= action < ACT_BUY_LM_BASE + NUM_LANDMARKS:
                    li   = action - ACT_BUY_LM_BASE
                    name = LANDMARK_ORDER[li]
                    cost = LANDMARK_COSTS[name]
                    if (name in self.enabled_lm and
                            not p.landmarks[name] and p.coins >= cost):
                        p.coins -= cost
                        p.landmarks[name] = True
                        self.built_this_turn = True
                        if p.has_won(self.enabled_lm):
                            built_winning_landmark = True

            winner_index = self.current if built_winning_landmark else None
            self._next_turn()
            if built_winning_landmark:
                self.done = True
                self.winner = winner_index

        return self.done, self.winner

    # ---- 内部ロジック ----

    def _roll(self) -> int:
        return random.randint(1, 6)

    def _after_roll(self):
        p = self.players[self.current]
        if p.landmarks[LM_RADIO] and not self.used_reroll:
            self.phase = PHASE_REROLL
        else:
            self._apply_harbor_or_income()

    def _apply_harbor_or_income(self):
        p = self.players[self.current]
        if (self.last_d2 > 0 and p.landmarks[LM_HARBOR] and self.last_dice >= 10):
            self.phase = PHASE_HARBOR
        else:
            self._process_income()

    def _process_income(self):
        dice = self.last_dice
        ci   = self.current
        p    = self.players[ci]

        self._proc_red(p, ci, dice)
        self._proc_blue(dice)
        self._proc_green(p, ci, dice)
        self._proc_purple(p, ci, dice)

        # 役所：コイン0なら+1
        if p.coins == 0:
            p.coins += 1

        if (self.pending_tv or self.pending_biz or self.pending_clean
                or self.pending_mover or self.pending_reno):
            self.phase = PHASE_PENDING
        else:
            self.phase = PHASE_BUILD

    # ---- 赤カード ----
    def _proc_red(self, cur, ci, dice):
        for name in CARD_NAMES:
            cd = CARD_DEF[name]
            if cd.color != "red" or dice not in cd.dice_nums:
                continue
            for oi, opp in enumerate(self.players):
                if oi == ci:
                    continue
                would_activate = True
                if cd.effect == HARBOR_RED:
                    would_activate = opp.landmarks[LM_HARBOR]
                elif cd.effect == FRENCHR:
                    would_activate = cur.built_lm_count() >= 2
                elif cd.effect == MEMBERBAR:
                    would_activate = cur.built_lm_count() >= 3
                count = self._activation_count(opp, name, would_activate)
                if count == 0:
                    continue

                if cd.effect == HARBOR_RED:
                    if not opp.landmarks[LM_HARBOR]:
                        continue
                    amount = cd.income
                    if opp.landmarks[LM_MALL]:
                        amount += 1
                    steal = min(amount * count, cur.coins)
                    cur.coins -= steal
                    opp.coins += steal

                elif cd.effect == FRENCHR:
                    if cur.built_lm_count() < 2:
                        continue
                    steal = min(cd.income * count, cur.coins)
                    cur.coins -= steal
                    opp.coins += steal

                elif cd.effect == MEMBERBAR:
                    if cur.built_lm_count() < 3:
                        continue
                    steal = cur.coins
                    cur.coins = 0
                    opp.coins += steal

                else:  # NORMAL
                    amount = cd.income
                    if opp.landmarks[LM_MALL] and cd.category in (RESTAURANT, SHOP):
                        amount += 1
                    steal = min(amount * count, cur.coins)
                    cur.coins -= steal
                    opp.coins += steal

    # ---- 青カード ----
    def _proc_blue(self, dice):
        for name in CARD_NAMES:
            cd = CARD_DEF[name]
            if cd.color != "blue" or dice not in cd.dice_nums:
                continue
            for pl in self.players:
                would_activate = True
                if cd.effect == CORNFIELD:
                    would_activate = pl.built_lm_count() <= 1
                elif cd.effect in (HARBOR, TUNA):
                    would_activate = pl.landmarks[LM_HARBOR]
                count = self._activation_count(pl, name, would_activate)
                if count == 0:
                    continue

                if cd.effect == CORNFIELD:
                    if pl.built_lm_count() <= 1:
                        pl.coins += cd.income * count

                elif cd.effect == HARBOR:
                    if pl.landmarks[LM_HARBOR]:
                        pl.coins += cd.income * count

                elif cd.effect == TUNA:
                    if pl.landmarks[LM_HARBOR]:
                        earn = (self._roll() + self._roll()) * count
                        pl.coins += earn

                else:  # NORMAL
                    pl.coins += cd.income * count

    # ---- 緑カード ----
    def _proc_green(self, p, ci, dice):
        loan_activation_count = 0
        for name in CARD_NAMES:
            cd = CARD_DEF[name]
            if cd.color != "green" or dice not in cd.dice_nums:
                continue
            would_activate = cd.effect != FEWLANDMARK or p.built_lm_count() <= 1
            count = self._activation_count(p, name, would_activate)
            if count == 0:
                continue

            if cd.effect == RENOVATION:
                built = [n for n in LANDMARK_ORDER if p.landmarks[n]]
                if built:
                    self.pending_reno += count
                    self._append_pending("pendingRenovation", count)
                continue

            if cd.effect == MOVER:
                self.pending_mover += count
                self._append_pending("pendingMover", count)
                continue

            if cd.effect == LOAN:
                loan_activation_count = count
                continue  # ダイスによるペナルティは下で処理

            if cd.effect == WINERY:
                earn = p.cards["ブドウ園"] * cd.income * count
                p.coins += earn
                p.dormant[name] = count
                continue

            earn = self._calc_green(cd, p, count)
            p.coins += earn

        # 貸金業：ダイス5か6でペナルティ
        if dice in (5, 6):
            if loan_activation_count > 0:
                pay = min(loan_activation_count * 2, p.coins)
                p.coins -= pay

    def _calc_green(self, cd, p: PlayerState, count: int) -> int:
        ef = cd.effect
        if ef == CHEESE:
            return p.cards["牧場"] * cd.income * count
        if ef == FURNITURE:
            return (p.cards["森林"] + p.cards["鉱山"]) * cd.income * count
        if ef == MARKET:
            return p.total_owned_by_cat(FARM) * cd.income * count
        if ef == FLOWER:
            base = p.cards["花畑"] * cd.income * count
            return base + (count if p.landmarks[LM_MALL] else 0)
        if ef == FOODWAREHOUSE:
            return p.total_owned_by_color("red") * cd.income * count
        if ef == DRINKFACTORY:
            total_rest = sum(pl.total_owned_by_color("red") for pl in self.players)
            return total_rest * cd.income * count
        if ef == FEWLANDMARK:
            if p.built_lm_count() > 1:
                return 0
            return (cd.income + (1 if p.landmarks[LM_MALL] else 0)) * count
        # NORMAL + SHOP/RESTAURANT ショッピングモール補正
        amount = cd.income
        if p.landmarks[LM_MALL] and cd.category in (RESTAURANT, SHOP):
            amount += 1
        return amount * count

    # ---- 紫カード ----
    def _proc_purple(self, p, ci, dice):
        for name in CARD_NAMES:
            cd = CARD_DEF[name]
            if cd.color != "purple" or dice not in cd.dice_nums:
                continue
            count = self._activation_count(p, name, True)
            if count == 0:
                continue

            if cd.effect == STADIUM:
                total = 0
                for oi, opp in enumerate(self.players):
                    if oi == ci:
                        continue
                    steal = min(cd.income, opp.coins)
                    opp.coins -= steal
                    total += steal
                p.coins += total

            elif cd.effect == TV:
                self.pending_tv += 1
                self._append_pending("pendingTV")

            elif cd.effect == BUSINESS:
                if self._has_business_exchange(ci):
                    self.pending_biz += 1
                    self._append_pending("pendingBusiness")

            elif cd.effect == PUBLISHER:
                total = 0
                for oi, opp in enumerate(self.players):
                    if oi == ci:
                        continue
                    cnt = opp.total_owned_by_cat(RESTAURANT, SHOP)
                    steal = min(cnt, opp.coins)
                    opp.coins -= steal
                    total += steal
                p.coins += total

            elif cd.effect == TAXOFFICE:
                total = 0
                for oi, opp in enumerate(self.players):
                    if oi == ci:
                        continue
                    if opp.coins >= 10:
                        steal = opp.coins // 2
                        opp.coins -= steal
                        total += steal
                p.coins += total

            elif cd.effect == CLEANING:
                if self._has_cleaning_target():
                    self.pending_clean += 1
                    self._append_pending("pendingCleaning")

            elif cd.effect == ITSTARTUP:
                total = 0
                for oi, opp in enumerate(self.players):
                    if oi == ci:
                        continue
                    steal = min(p.it_venture_coins, opp.coins)
                    opp.coins -= steal
                    total += steal
                p.coins += total

            elif cd.effect == PARK:
                total = sum(pl.coins for pl in self.players)
                each = (total + len(self.players) - 1) // len(self.players)
                for pl in self.players:
                    pl.coins = each

    def _pending_count_for_field(self, field: str) -> int:
        return {
            "pendingTV": self.pending_tv,
            "pendingBusiness": self.pending_biz,
            "pendingCleaning": self.pending_clean,
            "pendingMover": self.pending_mover,
            "pendingRenovation": self.pending_reno,
        }.get(field, 0)

    def _append_pending(self, field: str, count: int = 1):
        for _ in range(max(0, int(count))):
            self.pending_action_queue.append(field)

    def _next_pending_field(self):
        while self.pending_action_queue and self._pending_count_for_field(self.pending_action_queue[0]) <= 0:
            self.pending_action_queue.pop(0)
        if self.pending_action_queue:
            return self.pending_action_queue[0]
        if self.pending_tv > 0:
            return "pendingTV"
        if self.pending_biz > 0:
            return "pendingBusiness"
        if self.pending_clean > 0:
            return "pendingCleaning"
        if self.pending_mover > 0:
            return "pendingMover"
        if self.pending_reno > 0:
            return "pendingRenovation"
        return None

    def _consume_pending(self, field: str) -> bool:
        if self.pending_action_queue and self.pending_action_queue[0] == field:
            self.pending_action_queue.pop(0)
            return True
        return not self.pending_action_queue

    def _check_pending(self):
        if (self.pending_tv <= 0 and self.pending_biz <= 0 and
                self.pending_clean <= 0 and self.pending_mover <= 0 and
                self.pending_reno <= 0):
            self.pending_action_queue = []
            self.pending_target_index = None
            self.phase = PHASE_BUILD

    def _next_turn(self):
        p = self.players[self.current]
        # 空港
        if not self.built_this_turn and p.landmarks[LM_AIRPORT]:
            p.coins += 10
        # IT ベンチャー積立確認
        if p.active("ITベンチャー") > 0:
            self.pending_it = True
            self.phase = PHASE_PENDING
            return
        self._do_next_turn()

    def _do_next_turn(self):
        # 遊園地：ゾロ目でもう1ターン
        if (self.had_ap_at_roll and
                self.last_d1 > 0 and self.last_d1 == self.last_d2):
            self._reset_turn()
            return
        self.current = (self.current + 1) % len(self.players)
        self.turn_count += 1
        self._reset_turn()
        if self.turn_count >= self.max_turns:
            self.done   = True
            coins = [pl.coins for pl in self.players]
            if coins.count(max(coins)) > 1:
                self.winner = None
            else:
                self.winner = coins.index(max(coins))

    def _reset_turn(self):
        self.phase         = PHASE_ROLL
        self.built_this_turn = False
        self.used_reroll   = False
        self.had_ap_at_roll = False
        self.pending_tv    = 0
        self.pending_biz   = 0
        self.pending_clean = 0
        self.pending_mover = 0
        self.pending_reno  = 0
        self.pending_it    = False
        self.pending_action_queue = []
        self.pending_target_index = None
        self.last_dice = self.last_d1 = self.last_d2 = 0

    def _remove_one_card(self, player: PlayerState, name: str, prefer_dormant: bool = True) -> bool:
        if player.cards[name] <= 0:
            return False
        dormant_count = player.dormant.get(name, 0)
        active_count = player.active(name)
        was_dormant = dormant_count > 0 if prefer_dormant else active_count <= 0
        player.cards[name] -= 1
        if was_dormant:
            player.dormant[name] = max(0, player.dormant.get(name, 0) - 1)
        return was_dormant

    def _activation_count(self, player: PlayerState, name: str, would_activate: bool) -> int:
        active_before = player.active(name)
        if would_activate and player.dormant.get(name, 0) > 0:
            player.dormant[name] = 0
        return active_before

    def _add_one_card(self, player: PlayerState, name: str, dormant: bool = False):
        player.cards[name] += 1
        if dormant:
            player.dormant[name] = player.dormant.get(name, 0) + 1

    def _transfer_one_card(self, src: PlayerState, dst: PlayerState, name: str) -> bool:
        """カード1枚を移動する。同名に休業中カードがあればそれを優先して動かす。"""
        if src.cards[name] <= 0:
            return False
        was_dormant = self._remove_one_card(src, name)
        self._add_one_card(dst, name, was_dormant)
        return True


    def _business_target_index_for_take(self, take_name: str, preferred_index: int | None = None) -> int | None:
        if preferred_index is not None and 0 <= int(preferred_index) < len(self.players):
            preferred = self.players[int(preferred_index)]
            if int(preferred_index) != self.current and preferred.cards[take_name] > 0 and CARD_DEF[take_name].color != "purple":
                return int(preferred_index)
        for index, player in enumerate(self.players):
            if index == self.current:
                continue
            if player.cards[take_name] > 0 and CARD_DEF[take_name].color != "purple":
                return index
        return None

    def _has_business_exchange(self, current_index: int) -> bool:
        current = self.players[current_index]
        has_give = any(
            current.cards[n] > 0 and CARD_DEF[n].color != "purple"
            for n in CARD_NAMES
        )
        if not has_give:
            return False
        return any(
            index != current_index and any(
                player.cards[n] > 0 and CARD_DEF[n].color != "purple"
                for n in CARD_NAMES
            )
            for index, player in enumerate(self.players)
        )

    def _has_cleaning_target(self) -> bool:
        return any(
            player.active(n) > 0 and CARD_DEF[n].color != "purple"
            for player in self.players
            for n in CARD_NAMES
        )

    def _player_threat_score(self, player: PlayerState) -> float:
        score = float(player.coins)
        score += sum(LANDMARK_COSTS[n] * 2 for n in LANDMARK_ORDER if player.landmarks[n])
        score += sum(player.active(n) * CARD_DEF[n].cost for n in CARD_NAMES)
        return score

    def _pending_target_kind(self) -> str | None:
        field = self._next_pending_field()
        if field == "pendingTV":
            return "tv"
        if field == "pendingBusiness":
            return "business"
        if field == "pendingMover":
            return "mover"
        return None

    def _is_legal_pending_target(self, index: int, kind: str | None = None) -> bool:
        if index == self.current:
            return False
        player = self.players[index]
        if kind == "tv":
            return player.coins > 0
        if kind == "business":
            current = self.players[self.current]
            current_has_card = any(current.cards[n] > 0 and CARD_DEF[n].color != "purple" for n in CARD_NAMES)
            target_has_card = any(player.cards[n] > 0 and CARD_DEF[n].color != "purple" for n in CARD_NAMES)
            return current_has_card and target_has_card
        return True

    def _target_opponent_index(self, kind: str | None = None) -> int:
        best_index = None
        best_score = None
        for index, player in enumerate(self.players):
            if not self._is_legal_pending_target(index, kind):
                continue
            score = self._player_threat_score(player)
            if best_index is None or score > best_score:
                best_index = index
                best_score = score
        if best_index is not None:
            return best_index
        for index in range(len(self.players)):
            if index != self.current:
                return index
        return 0

    def _target_opponent_slots(self) -> list[int]:
        slots = []
        for index, player in enumerate(self.players):
            if index == self.current:
                continue
            slots.append((self._player_threat_score(player), index))
        slots.sort(key=lambda item: -item[0])
        return [index for _, index in slots]

    def _pending_target_index(self) -> int:
        kind = self._pending_target_kind()
        target_index = self.pending_target_index
        if target_index is None:
            return self._target_opponent_index(kind)
        if not (0 <= int(target_index) < len(self.players)):
            return self._target_opponent_index(kind)
        if not self._is_legal_pending_target(int(target_index), kind):
            return self._target_opponent_index(kind)
        return int(target_index)

    def set_pending_target_index(self, target_index: int | None):
        self.pending_target_index = None if target_index is None else int(target_index)

    def set_pending_target_slot(self, slot_index: int):
        slots = self._target_opponent_slots()
        if 0 <= int(slot_index) < len(slots):
            self.pending_target_index = slots[int(slot_index)]
        else:
            self.pending_target_index = None

    def clone(self) -> "MachikoroEnv":
        env = object.__new__(MachikoroEnv)
        env.__dict__.update({k: v for k, v in self.__dict__.items()
                              if k not in ("players",)})
        env.players = [pl.clone() for pl in self.players]
        env.shop_stock = dict(self.shop_stock)
        return env
