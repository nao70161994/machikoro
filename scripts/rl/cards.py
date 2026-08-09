# cards.py - 全カード・ランドマーク定義（基本 + プラス + シャープ）

from dataclasses import dataclass
from typing import Tuple

# ---------- エフェクト定数 ----------
NORMAL       = "normal"
CHEESE       = "cheese"
FURNITURE    = "furniture"
MARKET       = "market"
FLOWER       = "flower"
FOODWAREHOUSE= "foodwarehouse"
FEWLANDMARK  = "fewlandmark"
WINERY       = "winery"
MOVER        = "mover"
DRINKFACTORY = "drinkfactory"
LOAN         = "loan"
RENOVATION   = "renovation"
HARBOR       = "harbor"
HARBOR_RED   = "harbor_red"
TUNA         = "tuna"
CORNFIELD    = "cornfield"
FRENCHR      = "frenchr"
MEMBERBAR    = "memberbar"
STADIUM      = "stadium"
TV           = "tv"
BUSINESS     = "business"
PUBLISHER    = "publisher"
TAXOFFICE    = "taxoffice"
CLEANING     = "cleaning"
ITSTARTUP    = "itstartup"
PARK         = "park"

# ---------- カテゴリ定数 ----------
FARM       = "農園"
LIVESTOCK  = "畜産"
INDUSTRY   = "工業"
RESTAURANT = "飲食店"
SHOP       = "商店"
FISHERY    = "海産"
MAJOR      = "大施設"

# ---------- ランドマーク定数 ----------
LM_STATION   = "駅"
LM_MALL      = "ショッピングモール"
LM_AMUSEMENT = "遊園地"
LM_RADIO     = "電波塔"
LM_HARBOR    = "港"
LM_AIRPORT   = "空港"

LANDMARK_ORDER = [LM_STATION, LM_MALL, LM_AMUSEMENT, LM_RADIO, LM_HARBOR, LM_AIRPORT]
LANDMARK_COSTS = {
    LM_STATION:   4,
    LM_MALL:      10,
    LM_AMUSEMENT: 16,
    LM_RADIO:     22,
    LM_HARBOR:    2,
    LM_AIRPORT:   30,
}

# ---------- カード定義 ----------
@dataclass(frozen=True)
class CardDef:
    name: str
    cost: int
    dice_nums: Tuple[int, ...]
    income: int
    color: str
    category: str
    effect: str

ALL_CARDS = [
    # ===== 基本セット =====
    # 青カード
    CardDef("麦畑",     1, (1,),      1, "blue",   FARM,       NORMAL),
    CardDef("牧場",     1, (2,),      1, "blue",   LIVESTOCK,  NORMAL),
    CardDef("森林",     3, (5,),      1, "blue",   INDUSTRY,   NORMAL),
    CardDef("鉱山",     6, (9,),      5, "blue",   INDUSTRY,   NORMAL),
    CardDef("リンゴ園", 3, (10,),     3, "blue",   FARM,       NORMAL),
    # 緑カード
    CardDef("パン屋",       1, (2, 3),   1, "green", RESTAURANT, NORMAL),
    CardDef("コンビニ",     2, (4,),     3, "green", SHOP,       NORMAL),
    CardDef("チーズ工場",   5, (7,),     3, "green", INDUSTRY,   CHEESE),
    CardDef("家具工場",     3, (8,),     3, "green", INDUSTRY,   FURNITURE),
    CardDef("青果市場",     2, (11, 12), 2, "green", SHOP,       MARKET),
    # 赤カード
    CardDef("カフェ",       2, (3,),     1, "red",   RESTAURANT, NORMAL),
    CardDef("ファミレス",   3, (9, 10),  2, "red",   RESTAURANT, NORMAL),
    # 紫カード
    CardDef("スタジアム",       6, (6,), 2, "purple", MAJOR, STADIUM),
    CardDef("テレビ局",         7, (6,), 5, "purple", MAJOR, TV),
    CardDef("ビジネスセンター", 8, (6,), 0, "purple", MAJOR, BUSINESS),

    # ===== プラスセット =====
    # 青カード
    CardDef("花畑",       2, (4,),        1, "blue",   FARM,    NORMAL),
    CardDef("サンマ漁船", 2, (8,),        3, "blue",   FISHERY, HARBOR),
    CardDef("マグロ漁船", 5, (12, 13, 14),0, "blue",   FISHERY, TUNA),
    # 緑カード
    CardDef("フラワーショップ", 1, (6,),     1, "green", SHOP,    FLOWER),
    CardDef("食品倉庫",         2, (12, 13), 2, "green", INDUSTRY,FOODWAREHOUSE),
    # 赤カード
    CardDef("寿司屋",         1, (1,),        3, "red", RESTAURANT, HARBOR_RED),
    CardDef("ピザ屋",         1, (7,),        1, "red", RESTAURANT, NORMAL),
    CardDef("バーガーショップ",1, (8,),        1, "red", RESTAURANT, NORMAL),
    # 紫カード
    CardDef("出版社", 5, (7,),    0, "purple", MAJOR, PUBLISHER),
    CardDef("税務署", 4, (8, 9),  0, "purple", MAJOR, TAXOFFICE),

    # ===== シャープセット =====
    # 青カード
    CardDef("コーン畑", 2, (3, 4), 1, "blue",   FARM,     CORNFIELD),
    CardDef("ブドウ園", 3, (7,),   3, "blue",   FARM,     NORMAL),
    # 緑カード
    CardDef("雑貨屋",   0, (2,),   2, "green",  SHOP,     FEWLANDMARK),
    CardDef("改装屋",   1, (4,),   8, "green",  SHOP,     RENOVATION),
    CardDef("貸金業",   0, (5, 6), 0, "green",  SHOP,     LOAN),
    CardDef("ワイナリー",3,(9,),   6, "green",  INDUSTRY, WINERY),
    CardDef("引越し屋", 2, (9, 10),4, "green",  SHOP,     MOVER),
    CardDef("ドリンク工場",5,(11,),1, "green",  INDUSTRY, DRINKFACTORY),
    # 赤カード
    CardDef("高級フレンチ",  3, (5,),        5, "red", RESTAURANT, FRENCHR),
    CardDef("会員制BAR",     4, (12, 13, 14),0, "red", RESTAURANT, MEMBERBAR),
    # 紫カード
    CardDef("清掃業",     4, (8,),        0, "purple", MAJOR, CLEANING),
    CardDef("ITベンチャー",1, (10,),       0, "purple", MAJOR, ITSTARTUP),
    CardDef("公園",       3, (11, 12, 13),0, "purple", MAJOR, PARK),
]

CARD_NAMES    = [c.name for c in ALL_CARDS]
NUM_CARDS     = len(CARD_NAMES)          # 38
NUM_LANDMARKS = len(LANDMARK_ORDER)      # 6

CARD_DEF   = {c.name: c for c in ALL_CARDS}
CARD_INDEX = {c.name: i for i, c in enumerate(ALL_CARDS)}
LANDMARK_INDEX = {n: i for i, n in enumerate(LANDMARK_ORDER)}
