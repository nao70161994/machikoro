# Effect Dispatch Migration

作成日: 2026-05-17

## 目的

カード効果の発火処理を、文字列分岐の追加ではなく `CARD_EFFECT_METADATA` と handler table に寄せる。ただし、既存挙動の順序依存が大きいため全面置換はしない。

## 今回対応

- income 系 metadata に `incomeHandler` を追加した。
- `GameManager` の income handler table は `CARD_EFFECT_METADATA` から生成するようにした。
- 既存の `calcCardIncome()` 呼び出しと発火順序は維持した。

## 移行ルール

- 1回の変更で 1 effect または同一カテゴリの純粋 income effect だけを移す。
- pending を発生させる効果、休業副作用、他プレイヤーからの徴収、均等分配は、事前に targeted test を追加してから移す。
- ログ文言、発火順、休業復帰順、pending queue の順序は変更しない。

## 次に触る順序

1. 青カードの純粋 income / conditional income。
2. 緑カードの純粋 income。
3. 紫カードの単発 steal / redistribute。
4. pending 発生効果。
